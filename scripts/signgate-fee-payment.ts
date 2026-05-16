import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export type SignGateFeePaymentInput = {
  applicationNumber: string;
  issuePassword: string;
};

export type SignGateFeePaymentResult = {
  outcome: "opened";
  browserChannel: string;
  applicationNumber: string;
  pageUrl: string;
  message: string;
};

export type SignGateRenewPaymentPageInput = {
  cookieHeader: string;
  dn: string;
  serialNo: string;
  orderNo: string;
  orderSeq: string | null;
  orderStatus: string;
  orderApplySeCd: string;
};

export type SignGateRenewPaymentPageResult = {
  outcome: "opened";
  browserChannel: string;
  pageUrl: string;
  message: string;
};

const FEE_PAYMENT_URL = "https://www.signgate.com/feepayment/formPurchsrInfoCnfrm.sg";
const SIGNGATE_ORIGIN = "https://www.signgate.com";
const RENEW_PAYMENT_URL = `${SIGNGATE_ORIGIN}/renew/stepEntrpsRenewPayment.sg`;
const BROWSER_CHANNEL_CANDIDATES = (() => {
  const configured = (process.env.AUTO_TAX_SIGNGATE_HELPER_BROWSER_CHANNEL ?? "")
    .split(",")
    .flatMap((value) => value.split(";"))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const defaults = ["chrome", "msedge", "chromium"];
  const seen = new Set<string>();
  return [...configured, ...defaults].filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
})();

let activeContextPromise: Promise<{ context: BrowserContext; browserChannel: string }> | null = null;
let activeContext: BrowserContext | null = null;
let activeBrowserChannel = "";
const openedPaymentBrowsers = new Set<Browser>();

function resolveUserDataDir(): string {
  const configured = process.env.AUTO_TAX_SIGNGATE_HELPER_USER_DATA_DIR?.trim();
  const resolved = configured
    ? path.resolve(configured)
    : path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AUTO-TAX", "signgate-helper", "chrome-profile");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

async function getOrLaunchBrowserContext(): Promise<{ context: BrowserContext; browserChannel: string }> {
  if (activeContext) {
    return {
      context: activeContext,
      browserChannel: activeBrowserChannel
    };
  }

  if (activeContextPromise) {
    return activeContextPromise;
  }

  const userDataDir = resolveUserDataDir();
  activeContextPromise = (async () => {
    const errors: string[] = [];
    for (const browserChannel of BROWSER_CHANNEL_CANDIDATES) {
      try {
        const context = await chromium.launchPersistentContext(userDataDir, {
          channel: browserChannel,
          headless: false,
          viewport: null,
          ignoreHTTPSErrors: true,
          ignoreDefaultArgs: ["--enable-automation"],
          args: [
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars"
          ]
        });
        activeContext = context;
        activeBrowserChannel = browserChannel;
        context.on("close", () => {
          activeContext = null;
          activeBrowserChannel = "";
          activeContextPromise = null;
        });
        return { context, browserChannel };
      } catch (error) {
        errors.push(`${browserChannel}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    activeContextPromise = null;
    throw new Error(`브라우저 실행에 실패했습니다.\n${errors.join("\n")}`);
  })();

  return activeContextPromise;
}

async function launchStandaloneBrowserWindow(): Promise<{ browser: Browser; context: BrowserContext; browserChannel: string }> {
  const errors: string[] = [];
  for (const browserChannel of BROWSER_CHANNEL_CANDIDATES) {
    try {
      const browser = await chromium.launch({
        channel: browserChannel,
        headless: false,
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--new-window"
        ]
      });
      openedPaymentBrowsers.add(browser);
      browser.on("disconnected", () => {
        openedPaymentBrowsers.delete(browser);
      });
      const context = await browser.newContext({
        viewport: null,
        ignoreHTTPSErrors: true
      });
      return { browser, context, browserChannel };
    } catch (error) {
      errors.push(`${browserChannel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`브라우저 실행에 실패했습니다.\n${errors.join("\n")}`);
}

function normalizeApplicationNumber(value: string): string {
  return value.replace(/\D/g, "");
}

function formatApplicationNumber(value: string): string {
  const digits = normalizeApplicationNumber(value);
  if (digits.length !== 14) {
    return digits;
  }
  return `${digits.slice(0, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 14)}`;
}

function splitApplicationNumber(value: string): [string, string, string] {
  const digits = normalizeApplicationNumber(value);
  if (digits.length !== 14) {
    throw new Error("신청번호 형식이 올바르지 않습니다.");
  }

  return [digits.slice(0, 6), digits.slice(6, 10), digits.slice(10, 14)];
}

async function waitForPaymentStep(page: Page) {
  try {
    await Promise.race([
      page.waitForURL((url) => !url.toString().includes("/feepayment/formPurchsrInfoCnfrm.sg"), {
        timeout: 20_000
      }),
      page.getByText("결제하기", { exact: false }).waitFor({ timeout: 20_000 }),
      page.getByText("결제수단", { exact: false }).waitFor({ timeout: 20_000 })
    ]);
  } catch {
    // The payment form can stay on the same route and still be usable.
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function applyCookieHeaderToContext(context: BrowserContext, cookieHeader: string) {
  const cookies = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) {
        return null;
      }
      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (!name || !value) {
        return null;
      }
      return {
        name,
        value,
        url: SIGNGATE_ORIGIN
      };
    })
    .filter((cookie): cookie is { name: string; value: string; url: string } => Boolean(cookie));

  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }
}

async function waitForRenewPaymentStep(page: Page) {
  try {
    await Promise.race([
      page.waitForURL((url) => url.toString().includes("/renew/stepEntrpsRenewPayment"), {
        timeout: 20_000
      }),
      page.getByText("결제하기", { exact: false }).waitFor({ timeout: 20_000 }),
      page.getByText("결제수단", { exact: false }).waitFor({ timeout: 20_000 }),
      page.getByText("갱신신청이 접수", { exact: false }).waitFor({ timeout: 20_000 })
    ]);
  } catch {
    // The page can still be usable even when the URL does not change quickly.
  }
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function activateHelperBrowserWindow(windowTitle?: string | null) {
  if (process.platform !== "win32") {
    return;
  }

  const userDataDir = resolveUserDataDir();
  const normalizedWindowTitle = windowTitle?.trim() ?? "";
  const script = `
$UserDataDir = '${escapePowerShellSingleQuoted(userDataDir)}'
$WindowTitle = '${escapePowerShellSingleQuoted(normalizedWindowTitle)}'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32Native {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$shell = New-Object -ComObject WScript.Shell
$process = $null
if ($WindowTitle) {
  $shell.SendKeys('%')
  Start-Sleep -Milliseconds 80
  $matched = Get-Process | Where-Object { $_.MainWindowTitle -eq $WindowTitle } | Select-Object -First 1
  if ($matched) {
    $process = $matched
    $shell.AppActivate($matched.Id) | Out-Null
  } elseif ($shell.AppActivate($WindowTitle)) {
    Start-Sleep -Milliseconds 120
    $process = Get-Process | Where-Object { $_.MainWindowTitle -eq $WindowTitle } | Select-Object -First 1
  }
}
if (-not $process) {
  $target = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -ieq 'chrome.exe' -or $_.Name -ieq 'msedge.exe') -and
    $_.CommandLine -like ('*' + $UserDataDir + '*')
  } | Sort-Object CreationDate -Descending | Select-Object -First 1
  if ($target) {
    $process = Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue
  }
}
if (-not $process) {
  $process = Get-Process | Where-Object {
    ($_.ProcessName -ieq 'chrome' -or $_.ProcessName -ieq 'msedge') -and $_.MainWindowHandle -ne 0
  } | Sort-Object StartTime -Descending | Select-Object -First 1
}
if (-not $process -or $process.MainWindowHandle -eq 0) { exit 0 }
[void]$shell.AppActivate($process.Id)
[Win32Native]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null
Start-Sleep -Milliseconds 120
[Win32Native]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
`;

  spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    stdio: "ignore",
    windowsHide: true,
    timeout: 5000
  });
}

export async function openSignGateFeePaymentWindow(
  input: SignGateFeePaymentInput
): Promise<SignGateFeePaymentResult> {
  const [applicationNumber1, applicationNumber2, applicationNumber3] = splitApplicationNumber(input.applicationNumber);
  const issuePassword = input.issuePassword.trim();
  if (!issuePassword) {
    throw new Error("발급용 임시번호가 필요합니다.");
  }

  const launched = await launchStandaloneBrowserWindow();
  const page = await launched.context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto(FEE_PAYMENT_URL, {
    waitUntil: "domcontentloaded",
    timeout: 120_000
  });

  await page.locator("#ordAplyNo1").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#ordAplyNo1").fill(applicationNumber1);
  await page.locator("#ordAplyNo2").fill(applicationNumber2);
  await page.locator("#ordAplyNo3").fill(applicationNumber3);
  await page.locator("#ordPw").fill(issuePassword);
  await page.locator("#submitBtn").click({ force: true });
  await waitForPaymentStep(page);
  await page.bringToFront();
  await page.evaluate(() => window.focus()).catch(() => undefined);
  activateHelperBrowserWindow(await page.title().catch(() => ""));

  return {
    outcome: "opened",
    browserChannel: launched.browserChannel,
    applicationNumber: formatApplicationNumber(input.applicationNumber),
    pageUrl: page.url(),
    message: "SignGate 결제 창을 열었습니다. 열린 창에서 결제수단을 선택하고 결제를 진행하세요."
  };
}

export async function openSignGateRenewPaymentWindow(
  input: SignGateRenewPaymentPageInput
): Promise<SignGateRenewPaymentPageResult> {
  const dn = input.dn.trim();
  const serialNo = input.serialNo.trim();
  const orderNo = input.orderNo.trim();
  const orderSeq = input.orderSeq?.trim() ?? "";
  const orderStatus = input.orderStatus.trim();
  const orderApplySeCd = input.orderApplySeCd.trim();
  if (!dn || !serialNo || !orderNo || !orderStatus || !orderApplySeCd) {
    throw new Error("SignGate 갱신 결제 화면을 여는 데 필요한 값이 부족합니다.");
  }

  const launched = await launchStandaloneBrowserWindow();
  await applyCookieHeaderToContext(launched.context, input.cookieHeader);

  const page = await launched.context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());

  await page.setContent(
    `<!doctype html>
    <html lang="ko">
      <body>
        <form id="renewPaymentForm" method="post" action="${escapeHtml(RENEW_PAYMENT_URL)}">
          <input type="hidden" name="CSRF_TOKEN" value="" />
          <input type="hidden" name="dn" value="${escapeHtml(dn)}" />
          <input type="hidden" name="serial_no" value="${escapeHtml(serialNo)}" />
          <input type="hidden" name="ordno" value="${escapeHtml(orderNo)}" />
          <input type="hidden" name="ordSeq" value="${escapeHtml(orderSeq)}" />
          <input type="hidden" name="moveRaId" value="" />
          <input type="hidden" name="moveProdId" value="" />
          <input type="hidden" name="moveCertPolicyId" value="" />
          <input type="hidden" name="moveRenewProdChange" value="N" />
          <input type="hidden" name="certAplyStatus" value="${escapeHtml(orderStatus)}" />
          <input type="hidden" name="orderApplySeCd" value="${escapeHtml(orderApplySeCd)}" />
        </form>
        <script>document.getElementById('renewPaymentForm').submit();</script>
      </body>
    </html>`,
    { waitUntil: "domcontentloaded" }
  );
  await waitForRenewPaymentStep(page);
  await page.bringToFront();
  await page.evaluate(() => window.focus()).catch(() => undefined);
  activateHelperBrowserWindow(await page.title().catch(() => ""));

  return {
    outcome: "opened",
    browserChannel: launched.browserChannel,
    pageUrl: page.url(),
    message: "SignGate 갱신 결제 창을 열었습니다. 열린 창에서 결제수단을 선택하고 결제를 진행하세요."
  };
}
