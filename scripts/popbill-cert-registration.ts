import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

export type PopbillCertificateRegistrationInput = {
  certificateRegistrationUrl: string;
  certificateCn: string;
  certificatePassword: string;
};

export type PopbillCertificateRegistrationResult = {
  outcome: "registered" | "already-registered";
  browserChannel: string;
  certificateCn: string;
  localBridgeBaseUrl: string | null;
  message: string;
};

const BROWSER_CHANNEL_CANDIDATES = [
  process.env.AUTO_TAX_POPBILL_HELPER_BROWSER_CHANNEL?.trim() || "",
  "chrome",
  "msedge"
].filter(Boolean);

function resolveUserDataDir(): string {
  const configured = process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR?.trim();
  const resolved = configured
    ? path.resolve(configured)
    : path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AUTO-TAX", "popbill-helper", "chrome-profile");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

async function launchBrowserContext(userDataDir: string): Promise<{ context: BrowserContext; browserChannel: string }> {
  const errors: string[] = [];
  for (const browserChannel of BROWSER_CHANNEL_CANDIDATES) {
    try {
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: browserChannel,
        headless: false,
        viewport: { width: 1400, height: 1000 },
        ignoreHTTPSErrors: true
      });
      return { context, browserChannel };
    } catch (error) {
      errors.push(`${browserChannel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Chrome 또는 Edge를 실행하지 못했습니다.\n${errors.join("\n")}`);
}

async function waitForPageText(page: Page, text: string, timeoutMs: number) {
  await page.getByText(text, { exact: false }).waitFor({ timeout: timeoutMs });
}

async function tryGrantLocalNetworkAccessPermission(context: BrowserContext, registrationUrl: string) {
  const origin = new URL(registrationUrl).origin;
  try {
    await context.grantPermissions(["local-network-access"], { origin });
  } catch {
    // Some Chrome builds may ignore or reject this permission name.
    // In that case we still rely on the persistent profile keeping the manual grant.
  }
}

function detectAlreadyRegistered(pageText: string): boolean {
  return pageText.includes("재등록") && pageText.includes("사용") && pageText.includes("삭제");
}

function extractRegistrationError(frameText: string): string | null {
  if (frameText.includes("비밀번호를 다시 입력하세요")) {
    return "공동인증서 비밀번호가 올바르지 않습니다.";
  }

  if (frameText.includes("인증서를 선택")) {
    return "팝빌 인증서 등록 완료를 확인하지 못했습니다.";
  }

  return null;
}

export async function registerPopbillCertificate(
  input: PopbillCertificateRegistrationInput
): Promise<PopbillCertificateRegistrationResult> {
  const userDataDir = resolveUserDataDir();
  let context: BrowserContext | null = null;
  let localBridgeBaseUrl: string | null = null;

  try {
    const launched = await launchBrowserContext(userDataDir);
    context = launched.context;
    await tryGrantLocalNetworkAccessPermission(context, input.certificateRegistrationUrl);
    context.on("request", (request) => {
      try {
        const parsed = new URL(request.url());
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
          localBridgeBaseUrl = `${parsed.protocol}//${parsed.host}`;
        }
      } catch {
        // Ignore malformed URLs from the browser layer.
      }
    });

    const page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.accept());

    await page.goto(input.certificateRegistrationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000
    });
    await page.waitForTimeout(4_000);

    const initialText = await page.locator("body").innerText().catch(() => "");
    if (detectAlreadyRegistered(initialText)) {
      return {
        outcome: "already-registered",
        browserChannel: launched.browserChannel,
        certificateCn: input.certificateCn,
        localBridgeBaseUrl,
        message: "이미 팝빌에 공동인증서가 등록되어 있습니다."
      };
    }

    await page.getByText("전자세금용 공동인증서", { exact: true }).click({ force: true });
    await page.waitForTimeout(5_000);

    const childFrame = page.frames().find((frame) => frame.url().includes("/App/ML4Web/Child.html"));
    if (!childFrame) {
      throw new Error("팝빌 인증서 선택 화면을 열지 못했습니다.");
    }

    await childFrame.locator("#input_cert_pw").waitFor({ state: "visible", timeout: 20_000 });
    await childFrame.getByText(input.certificateCn, { exact: false }).first().click({ force: true });
    await childFrame.locator("#input_cert_pw").fill(input.certificatePassword);

    const registrationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/__API_V1__/Taxinvoice/Preference/Certificate"),
      { timeout: 30_000 }
    );
    await childFrame.locator("#btn_confirm_iframe").click({ force: true });
    await registrationResponse;

    try {
      await waitForPageText(page, "인증서가 등록 되었습니다.", 30_000);
    } catch {
      const frameText = await childFrame.locator("body").innerText().catch(() => "");
      throw new Error(extractRegistrationError(frameText) ?? "팝빌 인증서 등록 완료를 확인하지 못했습니다.");
    }

    return {
      outcome: "registered",
      browserChannel: launched.browserChannel,
      certificateCn: input.certificateCn,
      localBridgeBaseUrl,
      message: "팝빌 공동인증서 등록을 완료했습니다."
    };
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
  }
}
