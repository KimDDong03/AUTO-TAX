import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Frame, type Locator, type Page } from "playwright";
import { collectBridgeCertificateList, collectBridgeProbeResult, decodeLocalBridgeResponseBody } from "./renewal-agent.ts";

export type PopbillCertificateRegistrationInput = {
  certificateRegistrationUrl: string;
  businessNumber?: string | null;
  certificateIndex: number;
  certificateCn?: string | null;
  certificateKind: "electronic_tax";
  serial?: string | null;
  userDN?: string | null;
  targetExpireDate?: string | null;
  browserMode?: "auto" | "headless" | "visible" | "direct";
  certificatePassword: string;
};

export type PopbillCertificateRegistrationTiming = {
  totalMs: number;
  browserLaunchMs: number;
  permissionMs: number;
  pageLoadMs: number;
  certificateResolveMs: number;
  sectionOpenMs: number;
  frameReadyMs: number;
  candidateInspectMs: number;
  selectionReadyMs: number;
  submitMs: number;
  completionConfirmMs: number;
};

export type PopbillCertificateRegistrationStage =
  | "browser-launch"
  | "permission"
  | "page-load"
  | "certificate-resolve"
  | "already-registered-check"
  | "section-open"
  | "frame-ready"
  | "candidate-inspect"
  | "selection-ready"
  | "password-fill"
  | "submit"
  | "completion-confirm"
  | "direct-session"
  | "direct-token"
  | "direct-local-bridge"
  | "direct-submit";

export class PopbillCertificateRegistrationError extends Error {
  readonly stage: PopbillCertificateRegistrationStage;
  readonly timing: PopbillCertificateRegistrationTiming;

  constructor(
    message: string,
    options: {
      stage: PopbillCertificateRegistrationStage;
      timing: PopbillCertificateRegistrationTiming;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "PopbillCertificateRegistrationError";
    this.stage = options.stage;
    this.timing = options.timing;
  }
}

export type PopbillCertificateRegistrationResult = {
  outcome: "registered" | "already-registered";
  browserChannel: string;
  certificateIndex: number;
  certificateCn: string;
  certificateKind: "electronic_tax";
  serial: string | null;
  userDN: string | null;
  targetExpireDate: string | null;
  localBridgeBaseUrl: string | null;
  message: string;
  timing: PopbillCertificateRegistrationTiming;
};

export type PopbillCertificateCandidateIdentifier = "serial" | "userDN" | "targetExpireDate" | "certificateIndex";

export type PopbillCertificateIframeCandidate = {
  selector: string;
  text: string;
  attributes: string[];
  hiddenValues: string[];
  matchedIdentifiers: PopbillCertificateCandidateIdentifier[];
};

export type PopbillCertificateSelectionDetailProbe = {
  selector: string;
  matchedIdentifiers: PopbillCertificateCandidateIdentifier[];
  evidence: string[];
};

type PopbillChooserReadinessCertificate = {
  index: string | number | null | undefined;
  cn?: string | null;
  usageToName?: string | null;
  userDN?: string | null;
};

export type PopbillChooserDebugDuplicateCnCandidate = {
  certificateCn: string;
  certificateIndices: string[];
  userDNs: string[];
};

export type PopbillChooserDebugReadinessBlocker =
  | "local-bridge-certificates-unavailable"
  | "duplicate-electronic-tax-cn-missing"
  | "valid-popbill-cert-url-not-yet-verified";

export type PopbillChooserDebugReadiness = {
  available: boolean;
  electronicTaxCertificateCount: number;
  duplicateElectronicTaxCnCount: number;
  ambiguousCnReady: boolean;
  duplicateElectronicTaxCnCandidates: PopbillChooserDebugDuplicateCnCandidate[];
  blockers: PopbillChooserDebugReadinessBlocker[];
  nextAction: string;
  message: string;
};

export const POPBILL_DEBUG_ARTIFACT_STAGES = [
  "section-open-failed",
  "frame-ready-failed",
  "no-visible-cn-match",
  "ambiguous-cn-match",
  "registration-confirmation-failed"
] as const;

export type PopbillDebugArtifactStage = (typeof POPBILL_DEBUG_ARTIFACT_STAGES)[number];

const BROWSER_CHANNEL_CANDIDATES = (() => {
  const configured = (process.env.AUTO_TAX_POPBILL_HELPER_BROWSER_CHANNEL ?? "")
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

const POPBILL_CERTIFICATE_FRAME_READY_TIMEOUT_MS = 60_000;
const POPBILL_CERTIFICATE_LIST_READY_TIMEOUT_MS = 60_000;
const POPBILL_ORIGIN = "https://www.popbill.com";
const POPBILL_MAGICLINE_CONFIG_URL = `${POPBILL_ORIGIN}/App/ML4Web/js/ML4Web_Config.js`;
const POPBILL_MAGICLINE_REFERER = `${POPBILL_ORIGIN}/App/ML4Web/Child.html`;
const POPBILL_MAGICLINE_CROSS_SERVER_URL = `${POPBILL_ORIGIN}/App/ML4Web/ServerPage/jsp/`;
const POPBILL_MAGICLINE_PORT = 42235;
const POPBILL_MAGICLINE_SESSION_TIMEOUT = "60";
const POPBILL_HEADLESS_MAGICLINE_DIRECT_CHANNEL = "magicline4nx-headless-direct";
const POPBILL_DIRECT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Popbill-Direct/0.1";
const POPBILL_DIRECT_POPUP_MAX_REDIRECTS = 5;
const DEFAULT_EXTERNAL_REQUEST_TIMEOUT_MS = 10_000;

export type PopbillDirectMagicLineCandidate = {
  certificateCn: string;
  serial: string | null;
  userDN: string | null;
  targetExpireDate: string | null;
  validTo: string | null;
  storageRawCertIdx: Record<string, unknown>;
};

export function isPopbillHelperHeadlessEnabled(
  value = process.env.AUTO_TAX_POPBILL_HELPER_HEADLESS
): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export type PopbillBrowserUserDataDirResolution = {
  userDataDir: string;
  cleanupAfterClose: boolean;
};

export function resolvePopbillBrowserUserDataDir(
  options: {
    headless?: boolean;
  } = {}
): PopbillBrowserUserDataDirResolution {
  const configured = process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR?.trim();
  if (configured) {
    const resolved = path.resolve(configured);
    fs.mkdirSync(resolved, { recursive: true });
    return {
      userDataDir: resolved,
      cleanupAfterClose: false
    };
  }

  const headless = options.headless ?? isPopbillHelperHeadlessEnabled();
  const baseDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AUTO-TAX", "popbill-helper");
  if (headless) {
    const sessionRoot = path.join(baseDir, "chrome-sessions");
    fs.mkdirSync(sessionRoot, { recursive: true });
    return {
      userDataDir: fs.mkdtempSync(path.join(sessionRoot, "profile-")),
      cleanupAfterClose: true
    };
  }

  const resolved = path.join(baseDir, "chrome-profile");
  fs.mkdirSync(resolved, { recursive: true });
  return {
    userDataDir: resolved,
    cleanupAfterClose: false
  };
}

async function launchBrowserContext(
  userDataDir: string,
  options: {
    headless?: boolean;
  } = {}
): Promise<{ context: BrowserContext; browserChannel: string }> {
  const errors: string[] = [];
  const headless = options.headless ?? isPopbillHelperHeadlessEnabled();
  for (const browserChannel of BROWSER_CHANNEL_CANDIDATES) {
    try {
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: browserChannel,
        headless,
        viewport: { width: 1400, height: 1000 },
        ignoreHTTPSErrors: true
      });
      return { context, browserChannel };
    } catch (error) {
      errors.push(`${browserChannel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`브라우저 실행에 실패했습니다.\n${errors.join("\n")}`);
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
  const normalized = pageText.replace(/\s+/g, "");
  return (
    (normalized.includes("이미등록") && normalized.includes("사용") && normalized.includes("해제")) ||
    (normalized.includes("공동인증서관리") && normalized.includes("사용") && normalized.includes("삭제") && normalized.includes("재등록"))
  );
}

function detectExpiredToken(pageText: string): boolean {
  const normalized = pageText.replace(/\s+/g, "");
  return normalized.includes("만료된토큰") || normalized.includes("토큰이만료");
}

async function collectPageAndDialogSignals(
  page: Page,
  dialogMessages: string[],
): Promise<string> {
  const frameTexts = await Promise.all(
    page.frames().map(async (frame) => {
      try {
        return await frame.locator("body").innerText();
      } catch {
        return "";
      }
    }),
  );

  return [...frameTexts, ...dialogMessages].join("\n");
}

async function throwIfExpiredTokenVisible(page: Page, dialogMessages: string[]) {
  const signals = await collectPageAndDialogSignals(page, dialogMessages);
  if (detectExpiredToken(signals)) {
    throw new Error("팝빌 인증서 등록 URL이 만료되었습니다.");
  }
}

type PopbillLocatorScope = Page | Frame;

function getPopbillLocatorScopes(page: Page): PopbillLocatorScope[] {
  const scopes: PopbillLocatorScope[] = [page];
  const seenFrameUrls = new Set<string>();
  for (const frame of page.frames()) {
    const frameKey = `${frame.name()}::${frame.url()}`;
    if (seenFrameUrls.has(frameKey)) {
      continue;
    }
    seenFrameUrls.add(frameKey);
    scopes.push(frame);
  }
  return scopes;
}

function getPopbillElectronicTaxSectionCandidateLocators(page: Page) {
  const locators: Locator[] = [];
  for (const scope of getPopbillLocatorScopes(page)) {
    locators.push(
      scope.locator("a, button, [onclick]").filter({ hasText: "등록 가능한 공동인증서" }).first(),
      scope.getByRole("button", { name: /공동인증서\s*등록/ }).first(),
      scope.getByRole("button", { name: /전자세금용\s*공동인증서/ }).first(),
      scope.locator("a, button, [onclick]").filter({ hasText: "전자세금용 공동인증서" }).first()
    );
  }
  return locators;
}

async function hasVisiblePopbillElectronicTaxSectionCandidate(page: Page): Promise<boolean> {
  for (const locator of getPopbillElectronicTaxSectionCandidateLocators(page)) {
    try {
      if ((await locator.count()) > 0 && (await locator.isVisible({ timeout: 250 }).catch(() => false))) {
        return true;
      }
    } catch {
      // Keep probing the remaining candidates.
    }
  }
  return false;
}

function findPopbillCertificateSelectionFrame(page: Page): Frame | null {
  return page.frames().find((frame) => frame.url().includes("/App/ML4Web/Child.html")) ?? null;
}

async function isPopbillCertificateSelectionFrameReady(frame: Frame): Promise<boolean> {
  return await frame
    .locator("#input_cert_pw")
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

async function waitForPopbillCertificateSelectionFramePresence(
  page: Page,
  dialogMessages: string[],
  timeoutMs = 3_000
): Promise<boolean> {
  const startedAt = Date.now();
  let primed = false;
  while (Date.now() - startedAt < timeoutMs) {
    await throwIfExpiredTokenVisible(page, dialogMessages);
    const frame = findPopbillCertificateSelectionFrame(page);
    if (frame && await isPopbillCertificateSelectionFrameReady(frame)) {
      return true;
    }
    if (frame && !primed && Date.now() - startedAt > 2_000) {
      primed = true;
      await tryPrimePopbillCertificateSelectionFrame(frame);
    }
    if (frame && Date.now() - startedAt > Math.min(7_000, timeoutMs - 500)) {
      if (await isBlankPopbillCertificateSelectionFrame(frame)) {
        await clearPopbillCertificateSelectionFrameShell(page);
        return false;
      }
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function clickLocatorAndWaitForPopbillCertificateFrame(
  page: Page,
  dialogMessages: string[],
  locator: Locator
): Promise<boolean> {
  if ((await locator.count()) === 0) {
    return false;
  }

  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  await locator.click({ force: true, timeout: 2_000 });
  return await waitForPopbillCertificateSelectionFramePresence(page, dialogMessages, 10_000);
}

async function clickPopbillEmptyRegistrationPanel(
  page: Page,
  dialogMessages: string[]
): Promise<boolean> {
  for (const scope of getPopbillLocatorScopes(page)) {
    const prompt = scope.getByText("공동인증서를 등록하여 주시기 바랍니다.", { exact: false }).first();
    if ((await prompt.count()) === 0 || !(await prompt.isVisible().catch(() => false))) {
      continue;
    }

    await prompt.scrollIntoViewIfNeeded().catch(() => undefined);
    const clickedByDom = await scope.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, "");
      const isVisible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const clickElement = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const chain: HTMLElement[] = [];
        let cursor: HTMLElement | null = element;
        while (cursor && cursor !== document.body) {
          chain.push(cursor);
          cursor = cursor.parentElement;
        }
        const target =
          chain.find((candidate) => {
            const style = window.getComputedStyle(candidate);
            const marker = `${candidate.id} ${candidate.className} ${candidate.getAttribute("onclick") ?? ""}`;
            return (
              candidate.tagName === "A" ||
              candidate.tagName === "BUTTON" ||
              candidate.hasAttribute("onclick") ||
              style.cursor === "pointer" ||
              /plus|add|cert|certificate|regist|button|click/i.test(marker)
            );
          }) ?? element;
        for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
          target.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window
            })
          );
        }
        target.click();
        return true;
      };
      const prompt = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => isVisible(element))
        .find((element) => normalize(element.innerText || element.textContent).includes("공동인증서를등록하여주시기바랍니다"));
      if (!prompt) {
        return false;
      }
      const box = prompt.getBoundingClientRect();
      const clickX = box.left + box.width / 2;
      const clickPoints = [
        { x: clickX, y: Math.max(0, box.top - 108) },
        { x: clickX, y: Math.max(0, box.top - 80) },
        { x: clickX, y: Math.max(0, box.top - 56) },
        { x: clickX, y: Math.max(0, box.top - 32) },
        { x: clickX, y: box.top + box.height / 2 }
      ];
      for (const point of clickPoints) {
        if (clickElement(document.elementFromPoint(point.x, point.y))) {
          return true;
        }
      }
      return clickElement(prompt);
    }).catch(() => false);
    if (clickedByDom && await waitForPopbillCertificateSelectionFramePresence(page, dialogMessages, 10_000)) {
      return true;
    }

    const box = await prompt.boundingBox().catch(() => null);
    if (!box) {
      if (await clickLocatorAndWaitForPopbillCertificateFrame(page, dialogMessages, prompt)) {
        return true;
      }
      continue;
    }

    const clickX = box.x + box.width / 2;
    const clickPoints = [
      { x: clickX, y: Math.max(0, box.y - 108) },
      { x: clickX, y: Math.max(0, box.y - 80) },
      { x: clickX, y: Math.max(0, box.y - 56) },
      { x: clickX, y: Math.max(0, box.y - 32) },
      { x: clickX, y: box.y + box.height / 2 }
    ];

    for (const point of clickPoints) {
      await page.mouse.click(point.x, point.y);
      if (await waitForPopbillCertificateSelectionFramePresence(page, dialogMessages, 8_000)) {
        return true;
      }
    }
  }

  return false;
}

async function clickPopbillLeftPanelCertificateAction(
  page: Page,
  dialogMessages: string[]
): Promise<boolean> {
  for (const scope of getPopbillLocatorScopes(page)) {
    const clicked = await scope.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, "");
      const isElementVisible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const isLeftPanelElement = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < window.innerWidth * 0.6;
      };
      const clickElement = (element: HTMLElement) => {
        for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
          element.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window
            })
          );
        }
        element.click();
      };

      const candidates: Array<{ element: HTMLElement; score: number }> = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>("a, button, [onclick], div, span, i, svg"))) {
        if (!isElementVisible(element) || !isLeftPanelElement(element)) {
          continue;
        }

        const text = normalize(element.innerText || element.textContent);
        const marker = normalize(`${element.id} ${element.className} ${element.getAttribute("onclick") ?? ""}`);
        let score = 0;
        const explicitAction =
          element.tagName === "A" ||
          element.tagName === "BUTTON" ||
          element.hasAttribute("onclick") ||
          window.getComputedStyle(element).cursor === "pointer" ||
          marker.match(/plus|add|cert|certificate|regist|ml4web|btn/i);
        if (text === "+" || text === "＋") score += 120;
        if (text.includes("공동인증서를등록하여주시기바랍니다")) score += explicitAction ? 45 : 5;
        if (text.includes("등록가능한공동인증서")) score += explicitAction ? 90 : 10;
        if (text.includes("전자세금용공동인증서")) score += explicitAction ? 70 : 10;
        if (marker.match(/plus|add|cert|certificate|regist|ml4web|btn/i)) score += 35;
        if (element.tagName === "A" || element.tagName === "BUTTON" || element.hasAttribute("onclick")) score += 25;
        if (window.getComputedStyle(element).cursor === "pointer") score += 20;
        if (!explicitAction && text.length > 50) {
          score -= 80;
        }
        if (text.includes("신청하기") || text.includes("발급비용") || text.includes("비대면발급") || text.includes("대면발급")) {
          score -= 150;
        }
        if (score > 0 && (explicitAction || text === "+" || text === "＋")) {
          candidates.push({ element, score });
        }
      }

      candidates.sort((left, right) => right.score - left.score);
      const target = candidates[0]?.element;
      if (!target) {
        return false;
      }
      clickElement(target);
      return true;
    }).catch(() => false);

    if (clicked && await waitForPopbillCertificateSelectionFramePresence(page, dialogMessages, 10_000)) {
      return true;
    }
  }

  return false;
}

async function waitForPopbillRegistrationLandingReady(
  page: Page,
  dialogMessages: string[],
  timeoutMs = 30_000
): Promise<string> {
  const startedAt = Date.now();
  let latestText = "";

  while (Date.now() - startedAt < timeoutMs) {
    await throwIfExpiredTokenVisible(page, dialogMessages);
    latestText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => latestText);

    if (detectAlreadyRegistered(latestText) || await hasVisiblePopbillElectronicTaxSectionCandidate(page)) {
      return latestText;
    }

    await page.waitForTimeout(250);
  }

  return latestText || await collectPageAndDialogSignals(page, dialogMessages);
}

async function openPopbillElectronicTaxCertificateSection(
  page: Page,
  dialogMessages: string[],
  timeoutMs = 30_000
): Promise<void> {
  const startedAt = Date.now();
  const candidateLocators = getPopbillElectronicTaxSectionCandidateLocators(page);

  while (Date.now() - startedAt < timeoutMs) {
    await throwIfExpiredTokenVisible(page, dialogMessages);

    if (await clickPopbillEmptyRegistrationPanel(page, dialogMessages)) {
      return;
    }

    for (const locator of candidateLocators) {
      try {
        if (await clickLocatorAndWaitForPopbillCertificateFrame(page, dialogMessages, locator)) {
          return;
        }
      } catch {
        // Try the next candidate or retry loop.
      }
    }

    if (await clickPopbillLeftPanelCertificateAction(page, dialogMessages)) {
      return;
    }

    await page.waitForTimeout(500);
  }

  const signals = await collectPageAndDialogSignals(page, dialogMessages);
  throw new Error(
    `팝빌 메인 화면에서 전자세금용 공동인증서 버튼을 찾지 못했습니다. ${signals
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500)}`
  );
}

type PopbillFramePrimeResult = {
  inputVisibleBefore: boolean;
  inputVisibleAfter: boolean;
  scriptSourcesPresent: string[];
  calls: string[];
  errors: string[];
};

async function tryPrimePopbillCertificateSelectionFrame(frame: Frame): Promise<PopbillFramePrimeResult | null> {
  return await frame.evaluate(async () => {
    const inputVisibleBefore = Boolean(document.querySelector("#input_cert_pw"));
    if (inputVisibleBefore) {
      return {
        inputVisibleBefore,
        inputVisibleAfter: true,
        scriptSourcesPresent: Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
          .map((script) => script.getAttribute("src") ?? "")
          .filter(Boolean),
        calls: [],
        errors: []
      };
    }

    const calls: string[] = [];
    const errors: string[] = [];
    const scriptSources = [
      "UI/js/ML4Web_Draw.js",
      "UI/js/ML4Web_Main.js",
      "UI/js/ML4Web_Mgmt.js",
      "UI/js/ML4Web_Popup.js"
    ];
    const hasScript = (src: string) =>
      Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).some((script) =>
        String(script.getAttribute("src") ?? "").includes(src)
      );
    const loadScript = async (src: string) => {
      if (hasScript(src)) {
        return;
      }
      await new Promise<void>((resolve) => {
        const script = document.createElement("script");
        let settled = false;
        const finish = (error?: string) => {
          if (settled) {
            return;
          }
          settled = true;
          if (error) {
            errors.push(error);
          }
          resolve();
        };
        script.src = src;
        script.type = "text/javascript";
        script.onload = () => finish();
        script.onerror = () => finish(`failed-to-load:${src}`);
        setTimeout(() => finish(`script-timeout:${src}`), 2_500);
        document.head.appendChild(script);
      });
    };

    for (const src of scriptSources) {
      await loadScript(src);
    }

    const popbillWindow = window as unknown as {
      ML4WebDraw?: {
        loadCSS?: () => void;
        initDraw?: () => void;
      };
    };

    try {
      if (typeof popbillWindow.ML4WebDraw?.loadCSS === "function") {
        popbillWindow.ML4WebDraw.loadCSS();
        calls.push("ML4WebDraw.loadCSS");
      }
    } catch (error) {
      errors.push(`ML4WebDraw.loadCSS:${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      if (typeof popbillWindow.ML4WebDraw?.initDraw === "function") {
        popbillWindow.ML4WebDraw.initDraw();
        calls.push("ML4WebDraw.initDraw");
      }
    } catch (error) {
      errors.push(`ML4WebDraw.initDraw:${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      inputVisibleBefore,
      inputVisibleAfter: Boolean(document.querySelector("#input_cert_pw")),
      scriptSourcesPresent: Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
        .map((script) => script.getAttribute("src") ?? "")
        .filter(Boolean),
      calls,
      errors
    };
  }).catch(() => null);
}

async function isBlankPopbillCertificateSelectionFrame(frame: Frame): Promise<boolean> {
  if (await isPopbillCertificateSelectionFrameReady(frame)) {
    return false;
  }
  const text = await frame.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
  const normalized = text.replace(/\s+/g, "");
  return (
    normalized.includes("알림msg확인") &&
    !normalized.includes("인증서저장위치선택") &&
    !normalized.includes("사용할인증서선택") &&
    !normalized.includes("인증서비밀번호입력")
  );
}

async function clearPopbillCertificateSelectionFrameShell(page: Page): Promise<void> {
  await page.evaluate(() => {
    const isCertificateChildFrame = (element: Element) => {
      if (!(element instanceof HTMLIFrameElement)) {
        return false;
      }
      const src = element.getAttribute("src") ?? "";
      return element.name === "dscert" || element.id === "dscert" || src.includes("/App/ML4Web/Child.html");
    };

    for (const frame of Array.from(document.querySelectorAll("iframe")).filter(isCertificateChildFrame)) {
      const wrapper = frame.closest("[role='dialog'], .ML_container_dialog, .MLjqui-window, div") ?? frame;
      if (wrapper instanceof HTMLElement && wrapper !== document.body) {
        wrapper.remove();
      } else {
        frame.remove();
      }
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("#div_dsmlcert, #dscert, .blockUI, .blockOverlay"))) {
      element.remove();
    }
  }).catch(() => undefined);
}

async function waitForPopbillCertificateSelectionFrame(
  page: Page,
  dialogMessages: string[],
  timeoutMs = POPBILL_CERTIFICATE_FRAME_READY_TIMEOUT_MS
): Promise<Frame> {
  const startedAt = Date.now();
  let lastPrimeAt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    await throwIfExpiredTokenVisible(page, dialogMessages);
    const childFrame = findPopbillCertificateSelectionFrame(page);
    if (childFrame) {
      const passwordInputVisible = await childFrame
        .locator("#input_cert_pw")
        .isVisible({ timeout: 1_000 })
        .catch(() => false);
      if (passwordInputVisible) {
        return childFrame;
      }
      const now = Date.now();
      if (now - lastPrimeAt > 3_000) {
        lastPrimeAt = now;
        await tryPrimePopbillCertificateSelectionFrame(childFrame);
      }
    }

    await page.waitForTimeout(500);
  }

  await throwIfExpiredTokenVisible(page, dialogMessages);
  throw new Error("인증서 선택 화면을 불러오지 못했습니다. AT 헬퍼와 Chrome을 다시 실행한 뒤 재시도하세요.");
}

async function waitForPopbillCertificateCandidate(options: {
  page: Page;
  frame: Frame;
  dialogMessages: string[];
  resolvedCertificate: {
    certificateIndex: number;
    certificateCn: string;
    serial: string | null;
    userDN: string | null;
    targetExpireDate: string | null;
  };
  timeoutMs?: number;
}): Promise<{
  visibleMatchCount: number;
  selectedSelector: string | null;
  selectionReason: string | null;
  candidates: PopbillCertificateIframeCandidate[];
}> {
  const timeoutMs = options.timeoutMs ?? POPBILL_CERTIFICATE_LIST_READY_TIMEOUT_MS;
  const startedAt = Date.now();
  let frameInspection = await inspectPopbillCertificateSelectionFrame(options.frame, options.resolvedCertificate);

  while (frameInspection.visibleMatchCount === 0 && Date.now() - startedAt < timeoutMs) {
    await options.frame.waitForTimeout(500);
    await throwIfExpiredTokenVisible(options.page, options.dialogMessages);
    frameInspection = await inspectPopbillCertificateSelectionFrame(options.frame, options.resolvedCertificate);
  }

  return frameInspection;
}

function normalizeCertificateFingerprint(value: string | number | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePopbillEvidenceValue(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function isElectronicTaxUsageName(usageName: string): boolean {
  return usageName.replace(/\s+/g, "").includes("전자세금");
}

function normalizePopbillCertificateDateKey(value: string | number | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const candidates: Array<[string, string, string]> = [];
  for (const match of text.matchAll(/((?:19|20)\d{2})\D+(\d{1,2})\D+(\d{1,2})/g)) {
    candidates.push([match[1] ?? "", match[2] ?? "", match[3] ?? ""]);
  }
  for (const match of text.matchAll(/(\d{1,2})\D+(\d{1,2})\D+((?:19|20)\d{2})/g)) {
    candidates.push([match[3] ?? "", match[1] ?? "", match[2] ?? ""]);
  }
  for (const match of text.matchAll(/((?:19|20)\d{2})(\d{2})(\d{2})/g)) {
    candidates.push([match[1] ?? "", match[2] ?? "", match[3] ?? ""]);
  }

  for (const [yearText, monthText, dayText] of candidates) {
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      continue;
    }
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      continue;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      continue;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function resolveExternalRequestTimeoutMs(): number {
  const raw = process.env.AUTO_TAX_EXTERNAL_REQUEST_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_EXTERNAL_REQUEST_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000
    ? parsed
    : DEFAULT_EXTERNAL_REQUEST_TIMEOUT_MS;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = resolveExternalRequestTimeoutMs()
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`외부 요청이 ${timeoutMs}ms 안에 완료되지 않았습니다: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type PopbillMagicLineDirectRuntimeConfig = {
  origin: string;
  referer: string;
  serviceId: string;
  authKey: string;
  crossServerUrl: string;
  crossServerCert: string;
};

type PopbillMagicLineDirectCommandResult = {
  ok: boolean;
  resultCode: number | null;
  messageId: string | null;
  resultMessage: string;
  result: Record<string, unknown> | null;
  reply: Record<string, unknown> | null;
  error: string | null;
};

type PopbillDirectCertificatePayload = {
  PK: string;
  ENPK: string;
  validTo: string;
};

let cachedPopbillMagicLineDirectRuntimeConfig:
  | {
      fetchedAt: number;
      value: PopbillMagicLineDirectRuntimeConfig;
    }
  | null = null;

function extractPopbillMagicLineConfigString(configSource: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = configSource.match(new RegExp(`(?:^|[\\s,{])${escapedKey}\\s*:\\s*"([^"]*)"`));
  if (!match?.[1]) {
    throw new Error(`팝빌 MagicLine 설정에서 ${key} 값을 찾지 못했습니다.`);
  }
  return match[1];
}

async function resolvePopbillMagicLineDirectRuntimeConfig(): Promise<PopbillMagicLineDirectRuntimeConfig> {
  const now = Date.now();
  if (cachedPopbillMagicLineDirectRuntimeConfig && now - cachedPopbillMagicLineDirectRuntimeConfig.fetchedAt < 10 * 60 * 1000) {
    return cachedPopbillMagicLineDirectRuntimeConfig.value;
  }

  const configSource = await (await fetchWithTimeout(POPBILL_MAGICLINE_CONFIG_URL)).text();
  const value = {
    origin: POPBILL_ORIGIN,
    referer: POPBILL_MAGICLINE_REFERER,
    serviceId: extractPopbillMagicLineConfigString(configSource, "ServiceID"),
    authKey: extractPopbillMagicLineConfigString(configSource, "MAGICJS_LIC"),
    crossServerUrl: POPBILL_MAGICLINE_CROSS_SERVER_URL,
    crossServerCert: extractPopbillMagicLineConfigString(configSource, "CS_AUTHSERVER_CERT")
  };
  cachedPopbillMagicLineDirectRuntimeConfig = { fetchedAt: now, value };
  return value;
}

function makePopbillMagicLineDirectSessionId(): string {
  return Math.random().toString(36).slice(2, 22).padEnd(20, "0");
}

function buildPopbillMagicLineDirectJsonMessage(
  config: PopbillMagicLineDirectRuntimeConfig,
  sessionId: string,
  messageId: string,
  args: string[]
): string {
  const payload: Record<string, string> = {
    Version: "1",
    ServiceID: config.serviceId,
    AuthKey: config.authKey,
    SessionID: sessionId,
    CrossServerURL: config.crossServerUrl,
    CrossServerCert: config.crossServerCert,
    SessionTimeout: POPBILL_MAGICLINE_SESSION_TIMEOUT,
    MessageID: messageId
  };

  args.forEach((arg, index) => {
    payload[String(index)] = arg;
  });

  return JSON.stringify(payload);
}

function parsePopbillMagicLineDirectResultMessage(resultMessage: string): Record<string, unknown> | null {
  if (!resultMessage.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(resultMessage) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function invokePopbillMagicLineDirectCommand(
  config: PopbillMagicLineDirectRuntimeConfig,
  sessionId: string,
  messageId: string,
  args: string[]
): Promise<PopbillMagicLineDirectCommandResult> {
  const payload = buildPopbillMagicLineDirectJsonMessage(config, sessionId, messageId, args);

  return await new Promise((resolve) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port: POPBILL_MAGICLINE_PORT,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
          Origin: config.origin,
          Referer: config.referer
        },
        agent: new https.Agent({ rejectUnauthorized: false }),
        timeout: resolveExternalRequestTimeoutMs()
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          try {
            const body = decodeLocalBridgeResponseBody(Buffer.concat(chunks));
            const reply = JSON.parse(body) as Record<string, unknown>;
            const rawResultCode = Number.parseInt(String(reply.ResultCode ?? ""), 10);
            const resultCode = Number.isFinite(rawResultCode) ? rawResultCode : null;
            const resultMessage = typeof reply.ResultMessage === "string" ? reply.ResultMessage : "";
            resolve({
              ok: resultCode === 0,
              resultCode,
              messageId: typeof reply.MessageID === "string" ? reply.MessageID : null,
              resultMessage,
              result: parsePopbillMagicLineDirectResultMessage(resultMessage),
              reply,
              error:
                resultCode === 0
                  ? null
                  : resultMessage || `Popbill MagicLine ${messageId} ResultCode=${resultCode ?? "unknown"}`
            });
          } catch (error) {
            resolve({
              ok: false,
              resultCode: null,
              messageId,
              resultMessage: "",
              result: null,
              reply: null,
              error:
                error instanceof Error
                  ? error.message
                  : `Popbill MagicLine ${messageId} 응답 파싱 실패`
            });
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Popbill MagicLine ${messageId} timeout`));
    });
    req.on("error", (error) => {
      resolve({
        ok: false,
        resultCode: null,
        messageId,
        resultMessage: "",
        result: null,
        reply: null,
        error: error.message
      });
    });
    req.end(payload);
  });
}

function assertPopbillMagicLineDirectOk(
  result: PopbillMagicLineDirectCommandResult,
  failureMessage: string
): void {
  if (!result.ok) {
    throw new Error(result.error || result.resultMessage || failureMessage);
  }
}

function asPopbillDirectRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function readPopbillDirectString(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) {
    return null;
  }
  const normalizedEntries = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    const value = normalizedEntries.get(key.toLowerCase());
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

export function normalizePopbillBusinessNumber(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

const POPBILL_BUSINESS_NUMBER_KEY_HINTS = [
  "corpnum",
  "corp_num",
  "corpnumber",
  "corp_number",
  "businessnumber",
  "business_number",
  "bizno",
  "biz_no",
  "bman",
  "saup",
  "사업자"
];

function keyLooksLikePopbillBusinessNumber(key: string): boolean {
  const normalized = key.replace(/[\s_-]/g, "").toLowerCase();
  return POPBILL_BUSINESS_NUMBER_KEY_HINTS.some((hint) => normalized.includes(hint.replace(/[\s_-]/g, "")));
}

function findPopbillBusinessNumberInApiValue(value: unknown, depth = 0): string | null {
  if (depth > 5 || !value) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findPopbillBusinessNumberInApiValue(item, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const [key, nestedValue] of Object.entries(record)) {
    if (!keyLooksLikePopbillBusinessNumber(key)) {
      continue;
    }
    const direct = normalizePopbillBusinessNumber(nestedValue);
    if (direct) {
      return direct;
    }
    const nested = findPopbillBusinessNumberInApiValue(nestedValue, depth + 1);
    if (nested) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(record)) {
    if (nestedValue && typeof nestedValue === "object") {
      const nested = findPopbillBusinessNumberInApiValue(nestedValue, depth + 1);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

export function readPopbillBusinessNumberFromApiBody(body: Record<string, unknown>): string | null {
  return findPopbillBusinessNumberInApiValue(body);
}

function extractPopbillDirectCertificateEntries(reply: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!reply) {
    return [];
  }

  const listCandidates = [
    reply.cert_list,
    reply.certList,
    reply.certificateList,
    reply.certificates,
    reply.list,
    reply.result,
    reply.data
  ];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      return candidate.flatMap((item) => {
        const record = asPopbillDirectRecord(item);
        return record ? [record] : [];
      });
    }
  }

  const count = Number.parseInt(String(reply.size ?? "0"), 10);
  if (Number.isFinite(count) && count > 0) {
    const entries: Record<string, unknown>[] = [];
    for (let index = 1; index <= count; index += 1) {
      const record = asPopbillDirectRecord(reply[String(index)]);
      if (record) {
        entries.push(record);
      }
    }
    return entries;
  }

  return [];
}

function extractPopbillDirectCnFromSubject(subjectName: string | null): string | null {
  const match = subjectName?.match(/(?:^|,)\s*cn\s*=\s*([^,]+)/i);
  return match?.[1]?.trim() || null;
}

function normalizePopbillDirectCandidate(entry: Record<string, unknown>, hddOpt: Record<string, unknown>): PopbillDirectMagicLineCandidate | null {
  const storageCertIdx = readPopbillDirectString(entry, "subkeyid", "storageCertIdx", "storage_cert_idx", "index", "idx");
  if (!storageCertIdx) {
    return null;
  }
  const subjectName = readPopbillDirectString(entry, "subjectname", "subjectName", "userDN");
  const certificateCn =
    readPopbillDirectString(entry, "realname", "certname", "certName", "cn") ??
    extractPopbillDirectCnFromSubject(subjectName);
  if (!certificateCn) {
    return null;
  }
  const endDateTime = readPopbillDirectString(entry, "enddatetime", "endDateTime", "todate", "detailValidateTo");
  const endDate = readPopbillDirectString(entry, "enddate", "endDate");
  return {
    certificateCn,
    serial: readPopbillDirectString(entry, "serialnum", "serial", "serialNumber"),
    userDN: subjectName,
    targetExpireDate: normalizePopbillCertificateDateKey(endDateTime) ?? normalizePopbillCertificateDateKey(endDate),
    validTo: endDateTime ?? (endDate ? `${endDate} 23:59:59` : null),
    storageRawCertIdx: {
      storageName: "hdd",
      storageOpt: { hddOpt },
      storageCertIdx
    }
  };
}

function filterPopbillDirectCandidatesByTarget(
  candidates: PopbillDirectMagicLineCandidate[],
  target: {
    certificateCn?: string | null;
    serial?: string | null;
    userDN?: string | null;
    targetExpireDate?: string | null;
  }
): PopbillDirectMagicLineCandidate[] {
  let narrowed = candidates;
  const targetCn = normalizeCertificateFingerprint(target.certificateCn);
  const targetSerial = normalizeCertificateFingerprint(target.serial);
  const targetUserDN = normalizeCertificateFingerprint(target.userDN);
  const targetExpireDate = normalizePopbillCertificateDateKey(target.targetExpireDate);

  if (targetSerial !== "") {
    const serialMatches = narrowed.filter(
      (candidate) => normalizeCertificateFingerprint(candidate.serial) === targetSerial
    );
    if (serialMatches.length > 0) {
      narrowed = serialMatches;
    }
  }

  if (targetUserDN !== "") {
    const userDnMatches = narrowed.filter(
      (candidate) => normalizeCertificateFingerprint(candidate.userDN) === targetUserDN
    );
    if (userDnMatches.length > 0) {
      narrowed = userDnMatches;
    }
  }

  if (targetCn !== "") {
    const cnMatches = narrowed.filter(
      (candidate) => normalizeCertificateFingerprint(candidate.certificateCn) === targetCn
    );
    if (cnMatches.length > 0) {
      narrowed = cnMatches;
    }
  }

  if (targetExpireDate) {
    const expireMatches = narrowed.filter((candidate) => candidate.targetExpireDate === targetExpireDate);
    if (expireMatches.length > 0) {
      narrowed = expireMatches;
    }
  }

  return narrowed;
}

export function pickPopbillDirectMagicLineCandidate(
  candidates: PopbillDirectMagicLineCandidate[],
  target: {
    certificateCn?: string | null;
    serial?: string | null;
    userDN?: string | null;
    targetExpireDate?: string | null;
  }
): { candidate: PopbillDirectMagicLineCandidate | null; reason: string | null } {
  const targetSerial = normalizeCertificateFingerprint(target.serial);
  const targetUserDN = normalizeCertificateFingerprint(target.userDN);
  const targetCn = normalizeCertificateFingerprint(target.certificateCn);
  const targetExpireDate = normalizePopbillCertificateDateKey(target.targetExpireDate);

  const strategies: Array<{
    enabled: boolean;
    reason: string;
    matches: PopbillDirectMagicLineCandidate[];
  }> = [
    {
      enabled: targetSerial !== "",
      reason: "serial",
      matches: candidates.filter((candidate) => normalizeCertificateFingerprint(candidate.serial) === targetSerial)
    },
    {
      enabled: targetUserDN !== "",
      reason: "userDN",
      matches: candidates.filter((candidate) => normalizeCertificateFingerprint(candidate.userDN) === targetUserDN)
    },
    {
      enabled: targetCn !== "" && targetExpireDate !== null,
      reason: "CN + expire date",
      matches: candidates.filter(
        (candidate) =>
          normalizeCertificateFingerprint(candidate.certificateCn) === targetCn &&
          candidate.targetExpireDate === targetExpireDate
      )
    },
    {
      enabled: targetCn !== "",
      reason: "unique CN",
      matches: candidates.filter((candidate) => normalizeCertificateFingerprint(candidate.certificateCn) === targetCn)
    }
  ];

  for (const strategy of strategies) {
    if (!strategy.enabled || strategy.matches.length === 0) {
      continue;
    }
    const narrowed = filterPopbillDirectCandidatesByTarget(strategy.matches, target);
    if (narrowed.length === 1) {
      return {
        candidate: narrowed[0] ?? null,
        reason: strategy.reason
      };
    }
    return {
      candidate: null,
      reason: `${strategy.reason} matched ${narrowed.length} candidates`
    };
  }

  return {
    candidate: null,
    reason: null
  };
}

async function collectPopbillDirectMagicLineCandidates(): Promise<PopbillDirectMagicLineCandidate[]> {
  const config = await resolvePopbillMagicLineDirectRuntimeConfig();
  const sessionId = makePopbillMagicLineDirectSessionId();
  const installResult = await invokePopbillMagicLineDirectCommand(config, sessionId, "InstallCheck", [
    sessionId,
    "Chrome 124",
    POPBILL_MAGICLINE_SESSION_TIMEOUT
  ]);
  assertPopbillMagicLineDirectOk(installResult, "팝빌 MagicLine4NX 설치 확인에 실패했습니다.");

  const selectionResult = await invokePopbillMagicLineDirectCommand(config, sessionId, "SelectStorageInfo", ["hdd"]);
  assertPopbillMagicLineDirectOk(selectionResult, "팝빌 MagicLine4NX HDD 저장소 선택에 실패했습니다.");

  const hddOpts = Array.isArray(selectionResult.result?.hddOpt)
    ? selectionResult.result.hddOpt.flatMap((item) => {
        const record = asPopbillDirectRecord(item);
        return record ? [record] : [];
      })
    : [];
  if (hddOpts.length === 0) {
    throw new Error("팝빌 MagicLine4NX HDD 저장소 정보를 찾지 못했습니다.");
  }

  const candidates: PopbillDirectMagicLineCandidate[] = [];
  let lastError: string | null = null;
  for (const hddOpt of hddOpts) {
    const listResult = await invokePopbillMagicLineDirectCommand(config, sessionId, "GetCertList", [
      encodeURIComponent(
        JSON.stringify({
          storageName: "hdd",
          hddOpt
        })
      )
    ]);
    const noCertificate =
      listResult.resultCode === 10004 ||
      listResult.resultCode === 30006 ||
      /no\s*cert|not\s*exist|not\s*found/i.test(listResult.resultMessage);
    if (!listResult.ok && !noCertificate) {
      lastError =
        listResult.error ??
        listResult.resultMessage ??
        `팝빌 MagicLine GetCertList ResultCode=${listResult.resultCode ?? "unknown"}`;
      continue;
    }

    candidates.push(
      ...extractPopbillDirectCertificateEntries(listResult.result).flatMap((entry) => {
        const candidate = normalizePopbillDirectCandidate(entry, hddOpt);
        return candidate ? [candidate] : [];
      })
    );
  }

  if (candidates.length === 0 && lastError) {
    throw new Error(lastError);
  }

  return candidates;
}

function stripPemCertificate(rawCertificate: string): string {
  return rawCertificate
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
}

export function parsePopbillPopupTokenFromUrl(url: string): string | null {
  const parsed = new URL(url);
  const tokenParamNames = ["T", "t", "Token", "token", "PT", "pt", "PToken", "pToken"];
  const directToken = tokenParamNames.map((name) => parsed.searchParams.get(name)).find((value) => value?.trim());
  if (directToken?.trim()) {
    return directToken.trim();
  }

  const hash = parsed.hash.replace(/^#/, "");
  if (!hash) {
    return null;
  }
  const hashParams = new URLSearchParams(hash.startsWith("?") ? hash.slice(1) : hash);
  const hashToken = tokenParamNames.map((name) => hashParams.get(name)).find((value) => value?.trim());
  return hashToken?.trim() || null;
}

function splitJoinedSetCookieHeader(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function readSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [];
  if (getSetCookie.length > 0) {
    return getSetCookie;
  }
  const joinedSetCookie = headers.get("set-cookie");
  return joinedSetCookie ? splitJoinedSetCookieHeader(joinedSetCookie) : [];
}

export function buildPopbillCookieHeaderFromSetCookies(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map((value) => value.split(";")[0]?.trim() ?? "")
    .filter((value) => value.includes("="))
    .join("; ");
}

export function mergePopbillCookieHeaders(...cookieHeaders: string[]): string {
  const cookies = new Map<string, string>();
  for (const header of cookieHeaders) {
    for (const part of header.split(";")) {
      const trimmed = part.trim();
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }
      cookies.set(trimmed.slice(0, separatorIndex), trimmed);
    }
  }
  return [...cookies.values()].join("; ");
}

type PopbillDirectPopupSession = {
  token: string;
  cookieHeader: string;
  referrerUrl: string;
};

async function resolvePopbillDirectPopupSession(certificateRegistrationUrl: string): Promise<PopbillDirectPopupSession> {
  let currentUrl = certificateRegistrationUrl;
  let finalUrl = certificateRegistrationUrl;
  let cookieHeader = "";
  let token = parsePopbillPopupTokenFromUrl(certificateRegistrationUrl);

  for (let redirectCount = 0; redirectCount <= POPBILL_DIRECT_POPUP_MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchWithTimeout(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "Accept-Language": "ko",
        "User-Agent": POPBILL_DIRECT_USER_AGENT,
        ...(cookieHeader ? { Cookie: cookieHeader } : {})
      }
    });
    finalUrl = response.url || currentUrl;
    token = token ?? parsePopbillPopupTokenFromUrl(finalUrl);
    cookieHeader = mergePopbillCookieHeaders(
      cookieHeader,
      buildPopbillCookieHeaderFromSetCookies(readSetCookieHeaders(response.headers))
    );

    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      if (redirectCount === POPBILL_DIRECT_POPUP_MAX_REDIRECTS) {
        throw new Error("팝빌 공동인증서 팝업 세션 redirect가 너무 많아 중단했습니다.");
      }
      currentUrl = new URL(location, currentUrl).toString();
      token = token ?? parsePopbillPopupTokenFromUrl(currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new Error(`팝빌 공동인증서 팝업 세션 준비에 실패했습니다. HTTP ${response.status}`);
    }
    break;
  }

  if (!token) {
    throw new Error("팝빌 직접 등록 URL에서 일회용 토큰을 찾지 못했습니다.");
  }

  return {
    token,
    cookieHeader,
    referrerUrl: finalUrl
  };
}

async function parsePopbillJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new Error(`팝빌 API 응답을 JSON으로 읽지 못했습니다. HTTP ${response.status}`);
  }
}

function readPopbillApiMessage(body: Record<string, unknown>, fallback: string): string {
  const resultCode = body.ResultCode ?? body.resultCode ?? body.code;
  const message = body.Message ?? body.message ?? body.error;
  const parts = [
    typeof message === "string" && message.trim() ? message.trim() : null,
    resultCode !== undefined && resultCode !== null ? `ResultCode=${String(resultCode)}` : null
  ].filter(Boolean);
  return parts.join(" ") || fallback;
}

async function exchangePopbillPopupToken(session: PopbillDirectPopupSession): Promise<{
  accessToken: string;
  cookieHeader: string;
  businessNumber: string | null;
}> {
  const response = await fetchWithTimeout(`${POPBILL_ORIGIN}/__API_V1__/Auth/PT`, {
    method: "POST",
    body: new URLSearchParams({ T: session.token }),
    credentials: "include",
    headers: {
      "Accept-Language": "ko",
      "Origin": POPBILL_ORIGIN,
      "Referer": session.referrerUrl,
      "User-Agent": POPBILL_DIRECT_USER_AGENT,
      ...(session.cookieHeader ? { Cookie: session.cookieHeader } : {})
    }
  });
  const cookieHeader = mergePopbillCookieHeaders(
    session.cookieHeader,
    buildPopbillCookieHeaderFromSetCookies(readSetCookieHeaders(response.headers))
  );
  const body = await parsePopbillJsonResponse(response);
  if (!response.ok || body.ResultCode) {
    throw new Error(readPopbillApiMessage(body, `팝빌 일회용 토큰 교환에 실패했습니다. HTTP ${response.status}`));
  }

  const accessToken = readPopbillDirectString(body, "token", "Token", "accessToken", "access_token");
  if (!accessToken) {
    throw new Error("팝빌 일회용 토큰 교환 응답에서 접근 토큰을 찾지 못했습니다.");
  }
  return {
    accessToken,
    cookieHeader,
    businessNumber: readPopbillBusinessNumberFromApiBody(body)
  };
}

let cachedPopbillLoginDataKmCert:
  | {
      fetchedAt: number;
      value: string;
    }
  | null = null;

function normalizePopbillPemCertificate(value: string): string | null {
  const normalized = value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!normalized.includes("-----BEGIN CERTIFICATE-----") || !normalized.includes("-----END CERTIFICATE-----")) {
    return null;
  }
  return normalized;
}

function extractPopbillLoginDataKmCertFromSource(source: string): string | null {
  const loginDataVariableMatch = source.match(/loginDataKmCert\s*:\s*\{\s*value\s*:\s*([A-Za-z_$][\w$]*)/);
  const variableName = loginDataVariableMatch?.[1];
  if (variableName) {
    const escapedVariableName = escapeRegExp(variableName);
    const assignmentMatch = source.match(
      new RegExp(`(?:const|let|var)?\\s*${escapedVariableName}\\s*=\\s*([\\\`'\"])([\\s\\S]*?)\\1`)
    );
    const value = assignmentMatch?.[2] ? normalizePopbillPemCertificate(assignmentMatch[2]) : null;
    if (value) {
      return value;
    }
  }

  const pemMatch = source.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
  return pemMatch?.[0] ? normalizePopbillPemCertificate(pemMatch[0]) : null;
}

function extractScriptUrlsFromHtml(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const scriptSrcPattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptSrcPattern.exec(html)) !== null) {
    const src = match[1]?.trim();
    if (!src) {
      continue;
    }
    try {
      const url = new URL(src, baseUrl);
      if (url.origin === POPBILL_ORIGIN && url.pathname.endsWith(".js")) {
        urls.push(url.toString());
      }
    } catch {
      continue;
    }
  }
  return [...new Set(urls)];
}

function extractScriptUrlsFromJavaScript(source: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const sourcePattern = /(?:import\s*\(\s*|from\s*)["']([^"']+\.js)["']|["']([^"']+\/App\/assets\/[^"']+\.js)["']/g;
  let match: RegExpExecArray | null;
  while ((match = sourcePattern.exec(source)) !== null) {
    const src = (match[1] ?? match[2])?.trim();
    if (!src) {
      continue;
    }
    try {
      const url = new URL(src, baseUrl);
      if (url.origin === POPBILL_ORIGIN && url.pathname.endsWith(".js")) {
        urls.push(url.toString());
      }
    } catch {
      continue;
    }
  }
  return [...new Set(urls)];
}

async function resolvePopbillLoginDataKmCert(session: PopbillDirectPopupSession): Promise<string> {
  const now = Date.now();
  if (cachedPopbillLoginDataKmCert && now - cachedPopbillLoginDataKmCert.fetchedAt < 10 * 60 * 1000) {
    return cachedPopbillLoginDataKmCert.value;
  }

  const htmlResponse = await fetchWithTimeout(session.referrerUrl, {
    method: "GET",
    headers: {
      "Accept-Language": "ko",
      "User-Agent": POPBILL_DIRECT_USER_AGENT,
      ...(session.cookieHeader ? { Cookie: session.cookieHeader } : {})
    }
  });
  if (!htmlResponse.ok) {
    throw new Error(`팝빌 공동인증서 등록 화면 스크립트 정보를 읽지 못했습니다. HTTP ${htmlResponse.status}`);
  }

  const html = await htmlResponse.text();
  const fromHtml = extractPopbillLoginDataKmCertFromSource(html);
  if (fromHtml) {
    cachedPopbillLoginDataKmCert = { fetchedAt: now, value: fromHtml };
    return fromHtml;
  }

  const pending = extractScriptUrlsFromHtml(html, htmlResponse.url || session.referrerUrl);
  const visited = new Set<string>();
  while (pending.length > 0 && visited.size < 20) {
    const scriptUrl = pending.shift();
    if (!scriptUrl || visited.has(scriptUrl)) {
      continue;
    }
    visited.add(scriptUrl);

    const scriptResponse = await fetchWithTimeout(scriptUrl, {
      method: "GET",
      headers: {
        "Accept": "application/javascript,*/*",
        "Accept-Language": "ko",
        "Referer": session.referrerUrl,
        "User-Agent": POPBILL_DIRECT_USER_AGENT,
        ...(session.cookieHeader ? { Cookie: session.cookieHeader } : {})
      }
    });
    if (!scriptResponse.ok) {
      continue;
    }

    const source = await scriptResponse.text();
    const value = extractPopbillLoginDataKmCertFromSource(source);
    if (value) {
      cachedPopbillLoginDataKmCert = { fetchedAt: now, value };
      return value;
    }

    for (const nestedUrl of extractScriptUrlsFromJavaScript(source, scriptUrl)) {
      if (!visited.has(nestedUrl)) {
        pending.push(nestedUrl);
      }
    }
  }

  throw new Error("팝빌 공동인증서 등록 스크립트에서 인증서 등록용 공개키를 찾지 못했습니다.");
}

async function buildPopbillMagicLineHeadlessCertificatePayload(
  target: {
    certificateCn: string;
    serial: string | null;
    userDN: string | null;
    targetExpireDate: string | null;
  },
  directCandidate: PopbillDirectMagicLineCandidate,
  certificatePassword: string,
  businessNumber: string,
  loginDataKmCert: string
): Promise<{
  payload: PopbillDirectCertificatePayload;
  candidate: PopbillDirectMagicLineCandidate;
  browserChannel: string;
}> {
  const browserUserDataDir = resolvePopbillBrowserUserDataDir({ headless: true });
  let context: BrowserContext | null = null;
  let browserChannel = POPBILL_HEADLESS_MAGICLINE_DIRECT_CHANNEL;

  try {
    const launched = await launchBrowserContext(browserUserDataDir.userDataDir, { headless: true });
    context = launched.context;
    browserChannel = `${POPBILL_HEADLESS_MAGICLINE_DIRECT_CHANNEL}:${launched.browserChannel}`;
    await tryGrantLocalNetworkAccessPermission(context, POPBILL_MAGICLINE_REFERER);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(POPBILL_MAGICLINE_REFERER, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
      referer: POPBILL_ORIGIN
    });
    await page.waitForFunction(
      () =>
        Boolean(
          (window as any).ML4WebUI?.selectStorageInfo &&
            (window as any).ML4WebUI?.getStorageCertList &&
            (window as any).ML4WebCert?.MakeSignData &&
            (window as any).ML4WebApi?.getCryptoApi &&
            (window as any).magicjs?.x509Cert
        ),
      null,
      { timeout: 30_000 }
    );
    await page.evaluate("globalThis.__name = (value) => value");

    const result = await page.evaluate(
      async (args: {
        target: {
          certificateCn: string;
          serial: string | null;
          userDN: string | null;
          targetExpireDate: string | null;
        };
        certificatePassword: string;
        businessNumber: string;
        loginDataKmCert: string;
        directCandidate: PopbillDirectMagicLineCandidate;
      }) => {
        const win = window as any;
        const target = args.target;
        const normalize = (value: unknown) =>
          String(value ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
        const normalizeIdentity = (value: unknown) =>
          String(value ?? "")
            .replace(/\s+/g, "")
            .trim()
            .toLowerCase();
        const readString = (record: any, ...keys: string[]) => {
          if (!record || typeof record !== "object") {
            return null;
          }
          const entries = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
          for (const key of keys) {
            const value = entries.get(key.toLowerCase());
            if (typeof value === "string" && value.trim() !== "") {
              return value.trim();
            }
            if (typeof value === "number") {
              return String(value);
            }
          }
          return null;
        };
        const asRecord = (value: any) => {
          if (value && typeof value === "object" && !Array.isArray(value)) {
            return value;
          }
          if (typeof value === "string" && value.trim().startsWith("{")) {
            try {
              const parsed = JSON.parse(value);
              return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
            } catch {
              return null;
            }
          }
          return null;
        };
        const dateKey = (value: unknown) => {
          const text = String(value ?? "");
          const match = text.match(/(\d{4})\D?(\d{2})\D?(\d{2})/);
          return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
        };
        const extractCn = (subjectName: string | null) => {
          const match = subjectName?.match(/(?:^|,)\s*cn\s*=\s*([^,]+)/i);
          return match?.[1]?.trim() || null;
        };
        const certEntries = (reply: any) => {
          if (!reply || typeof reply !== "object") {
            return [];
          }
          const listCandidates = [
            reply.cert_list,
            reply.certList,
            reply.certificateList,
            reply.certificates,
            reply.list,
            reply.result,
            reply.data
          ];
          for (const list of listCandidates) {
            if (Array.isArray(list)) {
              return list.flatMap((item) => (item && typeof item === "object" ? [item] : []));
            }
          }
          const count = Number.parseInt(String(reply.size ?? "0"), 10);
          if (Number.isFinite(count) && count > 0) {
            const entries = [];
            for (let index = 1; index <= count; index += 1) {
              const entry = reply[String(index)];
              if (entry && typeof entry === "object") {
                entries.push(entry);
              }
            }
            return entries;
          }
          return [];
        };
        const maybePromise = async (value: any) => await Promise.resolve(value);
        const callMagicLineUi = async <T>(fn: (...values: any[]) => unknown, args: any[], label: string) =>
          await new Promise<T>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error(`${label} timeout`)), 30_000);
            try {
              fn(...args, (code: unknown, resultObject: unknown) => {
                window.clearTimeout(timeout);
                if (Number(code) === 0) {
                  resolve(resultObject as T);
                  return;
                }
                reject(new Error(`${label} failed: ${String((resultObject as any)?.errMsg ?? code)}`));
              });
            } catch (error) {
              window.clearTimeout(timeout);
              reject(error);
            }
          });
        const callWithTimeout = async <T>(operation: () => Promise<T>, label: string, timeoutMs = 30_000) => {
          let timeout: number | undefined;
          try {
            return await Promise.race([
              operation(),
              new Promise<T>((_, reject) => {
                timeout = window.setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
              })
            ]);
          } finally {
            if (timeout !== undefined) {
              window.clearTimeout(timeout);
            }
          }
        };

        await callMagicLineUi(win.ML4WebUI.selectStorageInfo.bind(win.ML4WebUI), ["hdd"], "MagicLine4NX HDD 저장소 선택");
        const directStorageIndex = asRecord(args.directCandidate.storageRawCertIdx);
        const directStorageOpt = asRecord(directStorageIndex?.storageOpt);
        const hddOpt = asRecord(directStorageOpt?.hddOpt) ?? directStorageOpt ?? asRecord(directStorageIndex?.hddOpt);
        if (!hddOpt) {
          throw new Error("MagicLine4NX HDD 저장소 옵션을 확인하지 못했습니다.");
        }
        const targetStorageCertIdx = normalizeIdentity(
          readString(directStorageIndex, "storageCertIdx", "subkeyid", "index", "idx")
        );

        const candidates: Array<{
          row: any;
          hddOpt: any;
          storageEncCertIdx: any;
          certificateCn: string;
          serial: string | null;
          userDN: string | null;
          targetExpireDate: string | null;
          validTo: string | null;
        }> = [];

        const listReply = await callMagicLineUi<any>(
          win.ML4WebUI.getStorageCertList.bind(win.ML4WebUI),
          [
            {
              storageName: "hdd",
              hddOpt
            }
          ],
          "MagicLine4NX HDD 인증서 목록"
        );
        for (const row of certEntries(listReply)) {
          const rawStorageIndex = asRecord(row.storageRawCertIdx);
          const rawStorageCertIdx = readString(rawStorageIndex, "storageCertIdx", "subkeyid", "index", "idx");
            const storageEncCertIdx =
              row.storageEncCertIdx ?? row.storageRawCertIdx ?? row.storageCertIdx ?? row.subkeyid ?? row.index ?? row.idx;
            if (!storageEncCertIdx) {
              continue;
            }
            const userDN = readString(row, "subjectname", "subjectName", "userDN");
            const certificateCn =
              readString(row, "realname", "certname", "certName", "cn") ?? extractCn(userDN);
            if (!certificateCn) {
              continue;
            }
            const validTo = readString(row, "enddatetime", "endDateTime", "todate", "detailValidateTo");
            candidates.push({
              row,
              hddOpt,
              storageEncCertIdx,
              certificateCn,
              serial: readString(row, "serialnum", "serial", "serialNumber"),
              userDN,
              targetExpireDate: dateKey(validTo ?? readString(row, "enddate", "endDate")),
              validTo
            });
        }

        const targetSerial = normalizeIdentity(target.serial);
        const targetUserDN = normalizeIdentity(target.userDN);
        const targetCn = normalize(target.certificateCn);
        const targetExpireDate = dateKey(target.targetExpireDate);
        const findUnique = (matches: typeof candidates, reason: string) => {
          if (matches.length === 1) {
            return matches[0];
          }
          if (matches.length > 1) {
            throw new Error(`MagicLine4NX 직접 목록에서 대상 공동인증서가 ${reason} 기준으로 여러 개입니다.`);
          }
          return null;
        };

        const picked =
          (targetStorageCertIdx
            ? findUnique(
                candidates.filter((candidate) => {
                  const rawStorageIndex = asRecord(candidate.row.storageRawCertIdx);
                  return normalizeIdentity(readString(rawStorageIndex, "storageCertIdx", "subkeyid", "index", "idx")) === targetStorageCertIdx;
                }),
                "저장소 인덱스"
              )
            : null) ??
          (targetSerial
            ? findUnique(candidates.filter((candidate) => normalizeIdentity(candidate.serial) === targetSerial), "serial")
            : null) ??
          (targetUserDN
            ? findUnique(candidates.filter((candidate) => normalizeIdentity(candidate.userDN) === targetUserDN), "userDN")
            : null) ??
          (targetCn && targetExpireDate
            ? findUnique(
                candidates.filter(
                  (candidate) =>
                    normalize(candidate.certificateCn) === targetCn && candidate.targetExpireDate === targetExpireDate
                ),
                "CN/만료일"
              )
            : null) ??
          (targetCn
            ? findUnique(candidates.filter((candidate) => normalize(candidate.certificateCn) === targetCn), "CN")
            : null);

        if (!picked) {
          throw new Error("MagicLine4NX 직접 목록에서 대상 공동인증서를 찾지 못했습니다.");
        }

        const certStringReply = await callMagicLineUi<any>(
          win.ML4WebUI.getCertString.bind(win.ML4WebUI),
          [picked.storageEncCertIdx],
          "MagicLine4NX 인증서 본문"
        );
        const certBag = certStringReply?.cert_string ?? certStringReply?.certString ?? certStringReply?.cert ?? certStringReply;
        const signcert = readString(certBag, "signcert", "signCert") ?? readString(certStringReply, "signcert", "signCert");
        const signpri = readString(certBag, "signpri", "signPri") ?? readString(certStringReply, "signpri", "signPri");
        if (!signcert || !signpri) {
          const certStringKeys =
            certStringReply && typeof certStringReply === "object" ? Object.keys(certStringReply).slice(0, 12).join(",") : typeof certStringReply;
          const certBagKeys = certBag && typeof certBag === "object" ? Object.keys(certBag).slice(0, 12).join(",") : typeof certBag;
          throw new Error(`MagicLine4NX 인증서 본문을 읽지 못했습니다. (keys=${certStringKeys}; bag=${certBagKeys})`);
        }

        let lastMagicLineError = "";
        win.ML4WebApi.webConfig = win.ML4WebApi.webConfig ?? {};
        win.ML4WebApi.webConfig.loginDataKmCert = args.loginDataKmCert;
        win.ML4WebDraw = {
          ...(win.ML4WebDraw ?? {}),
          errorHandler: (...values: unknown[]) => {
            lastMagicLineError = values.map((value) => String(value ?? "")).filter(Boolean).join(" ");
          },
          confirm: (_message: string, callback?: (...callbackArgs: unknown[]) => void) => {
            callback?.(1, {});
          }
        };
        win.certExpirePopup = (certObj: unknown, _certDateTime: unknown, callback?: (...callbackArgs: unknown[]) => void) => {
          callback?.(0, certObj);
        };

        const hashedPassword = win.ML4WebApi.getCryptoApi().HD_api(args.certificatePassword);
        const certObj = {
          rowData: {
            ...picked.row,
            storageRawCertIdx: picked.storageEncCertIdx,
            storageEncCertIdx: picked.storageEncCertIdx
          },
          pw: hashedPassword,
          selectedStg: "hdd",
          certbag: {
            signcert,
            signpri
          },
          signcert,
          signpri,
          storageRawCertIdx: picked.storageEncCertIdx,
          storageEncCertIdx: picked.storageEncCertIdx
        };

        win.ML4WebCert.criteria = {
          signType: "MakeSignData",
          message: args.businessNumber,
          signOpt: {
            ds_pki_sign: ["OPT_USE_CONTNET_INFO"],
            ds_pki_rsa: "rsa15",
            ds_pki_hash: "sha256",
            ds_msg_decode: "false",
            ds_pki_sign_type: "signeddata",
            cert_filter_expire: false,
            cert_filter_oid: ""
          },
          vidType: "client",
          idn: args.businessNumber,
          certObj,
          selectedStorage: "hdd"
        };

        const signed = await callWithTimeout(
          () =>
            new Promise<any>((resolve, reject) => {
              try {
                win.ML4WebCert.MakeSignData((code: unknown, resultObject: any) => {
                  const resultCode = Number(code);
                  if (resultCode === 0) {
                    resolve(resultObject);
                    return;
                  }
                  reject(
                    new Error(
                      String(resultObject?.message ?? resultObject?.resultMessage ?? lastMagicLineError ?? "MagicLine4NX 서명 실패")
                    )
                  );
                });
              } catch (error) {
                reject(error);
              }
            }),
          "MagicLine4NX MakeSignData"
        );

        const signedWithVidRandom = signed?.vidRandom
          ? signed
          : await callWithTimeout(
              () =>
                new Promise<any>((resolve, reject) => {
                  try {
                    win.magiclineController.getVIDRandom((code: unknown, resultObject: any) => {
                      const resultCode = Number(code);
                      if (resultCode === 0) {
                        resolve(resultObject);
                        return;
                      }
                      reject(
                        new Error(
                          String(resultObject?.message ?? resultObject?.resultMessage ?? lastMagicLineError ?? "MagicLine4NX VID 생성 실패")
                        )
                      );
                    }, signed);
                  } catch (error) {
                    reject(error);
                  }
                }),
              "MagicLine4NX getVIDRandom"
            );

        const signedCertBag = signedWithVidRandom?.certbag;
        const signedSigncert = signedCertBag?.signcert ?? signedWithVidRandom?.signcert;
        const signedSignpri = signedCertBag?.signpri ?? signedWithVidRandom?.signpri;
        const vidRandom = signedWithVidRandom?.vidRandom;
        const validTo = signedWithVidRandom?.certInfo?.enddatetime ?? signedWithVidRandom?.certInfo?.endDateTime ?? picked.validTo;
        if (!signedSigncert || !signedSignpri || !validTo) {
          throw new Error("Popbill 공동인증서 등록에 필요한 서명 결과를 만들지 못했습니다.");
        }
        if (!vidRandom) {
          throw new Error("공동인증서 사업자번호 확인값을 만들지 못했습니다.");
        }

        const verified = Boolean(
          win.magicjs.x509Cert.create(signedSigncert).verifyVID(win.magicjs.base64.decode(vidRandom), args.businessNumber)
        );
        if (!verified) {
          throw new Error("공동인증서와 회원의 사업자번호가 일치하지 않습니다.");
        }

        return {
          payload: {
            PK: signedSigncert,
            ENPK: signedSignpri,
            validTo
          },
          candidate: {
            certificateCn: picked.certificateCn,
            serial: picked.serial,
            userDN: picked.userDN,
            targetExpireDate: picked.targetExpireDate,
            validTo: picked.validTo,
            storageRawCertIdx: {
              storageName: "hdd",
              storageOpt: { hddOpt: picked.hddOpt },
              storageCertIdx: picked.storageEncCertIdx
            }
          }
        };
      },
      {
        target,
        certificatePassword,
        businessNumber,
        loginDataKmCert,
        directCandidate
      }
    );

    return {
      payload: {
        PK: stripPemCertificate(result.payload.PK),
        ENPK: result.payload.ENPK,
        validTo: result.payload.validTo
      },
      candidate: result.candidate,
      browserChannel
    };
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
    if (browserUserDataDir.cleanupAfterClose) {
      await fs.promises.rm(browserUserDataDir.userDataDir, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 100
      }).catch(() => undefined);
    }
  }
}

async function postPopbillDirectCertificatePayload(options: {
  accessToken: string;
  cookieHeader: string;
  certificateRegistrationUrl: string;
  referrerUrl: string;
  payload: PopbillDirectCertificatePayload;
}): Promise<"registered" | "already-registered"> {
  const parsedUrl = new URL(options.certificateRegistrationUrl);
  const referrer = parsedUrl.pathname.replace(/^\/App\//, "");
  const response = await fetchWithTimeout(`${POPBILL_ORIGIN}/__API_V1__/Taxinvoice/Preference/Certificate`, {
    method: "POST",
    body: JSON.stringify(options.payload),
    credentials: "include",
    headers: {
      Authorization: options.accessToken,
      "Accept-Language": "ko",
      "Content-Type": "application/json",
      "Origin": POPBILL_ORIGIN,
      "Referer": options.referrerUrl,
      "User-Agent": POPBILL_DIRECT_USER_AGENT,
      "X-LH-Referrer": referrer,
      ...(options.cookieHeader ? { Cookie: options.cookieHeader } : {})
    }
  });
  const body = await parsePopbillJsonResponse(response);
  const resultCode = Number(body.ResultCode ?? body.resultCode);
  if (response.ok && resultCode === 1) {
    return "registered";
  }

  const message = readPopbillApiMessage(body, `팝빌 공동인증서 등록 API 요청에 실패했습니다. HTTP ${response.status}`);
  if (detectAlreadyRegistered(message)) {
    return "already-registered";
  }
  throw new Error(extractRegistrationError(message) ?? message);
}

async function resolveTargetCertificate(input: PopbillCertificateRegistrationInput): Promise<{
  certificateIndex: number;
  certificateCn: string;
  certificateKind: "electronic_tax";
  serial: string | null;
  userDN: string | null;
  targetExpireDate: string | null;
}> {
  let { storageProbe } = await collectBridgeCertificateList({ preferCached: false });

  const targetIndex = normalizeCertificateFingerprint(input.certificateIndex);
  const targetCn = normalizeCertificateFingerprint(input.certificateCn);
  const targetSerial = normalizeCertificateFingerprint(input.serial);
  const targetUserDN = normalizeCertificateFingerprint(input.userDN);
  const cachedCertificatesExposeDetailedIdentity = storageProbe.certificates.some(
    (certificate) =>
      normalizeCertificateFingerprint(certificate.serial) !== "" ||
      normalizeCertificateFingerprint(certificate.userDN) !== ""
  );
  const requiresDetailedIdentity = targetSerial !== "" || targetUserDN !== "";
  if (!storageProbe.ok || (requiresDetailedIdentity && !cachedCertificatesExposeDetailedIdentity)) {
    const detailedProbe = await collectBridgeProbeResult({ includeDetailedProbe: true });
    storageProbe = detailedProbe.bridge.storageProbe;
  }
  if (!storageProbe.ok) {
    throw new Error(storageProbe.error ?? "로컬 브리지에서 공동인증서 목록을 읽지 못했습니다.");
  }
  const allCertificates = storageProbe.certificates;
  const electronicTaxCertificates = storageProbe.certificates.filter((certificate) =>
    isElectronicTaxUsageName(certificate.usageToName)
  );

  let resolvedCertificate: (typeof electronicTaxCertificates)[number] | null = null;
  let resolutionStrategy: "identity" | "index" | "cn" | null = null;

  if (targetSerial !== "" || targetUserDN !== "") {
    const identityMatches = allCertificates.filter((certificate) => {
      const certificateSerial = normalizeCertificateFingerprint(certificate.serial);
      const certificateUserDN = normalizeCertificateFingerprint(certificate.userDN);
      if (targetSerial !== "") {
        return certificateSerial === targetSerial;
      }
      if (targetUserDN !== "") {
        return certificateUserDN === targetUserDN;
      }
      return true;
    });

    if (identityMatches.length === 1) {
      resolvedCertificate = identityMatches[0] ?? null;
      resolutionStrategy = "identity";
    } else if (identityMatches.length > 1) {
      const narrowedIdentityMatches = identityMatches.filter((certificate) => {
        if (targetCn !== "" && normalizeCertificateFingerprint(certificate.cn) !== targetCn) {
          return false;
        }
        if (targetIndex !== "" && normalizeCertificateFingerprint(certificate.index) !== targetIndex) {
          return false;
        }
        return true;
      });

      if (narrowedIdentityMatches.length === 1) {
        resolvedCertificate = narrowedIdentityMatches[0] ?? null;
        resolutionStrategy = "identity";
      } else {
        throw new Error("serial/userDN과 일치하는 로컬 공동인증서가 여러 개여서 자동 등록을 중단했습니다.");
      }
    } else {
      throw new Error(
        `로컬 브리지에서 serial/userDN과 일치하는 현재 전자세금용 공동인증서를 찾지 못했습니다. (serial=${input.serial ?? "-"}, userDN=${input.userDN ?? "-"})`
      );
    }
  }

  if (!resolvedCertificate && targetIndex !== "") {
    resolvedCertificate =
      electronicTaxCertificates.find(
        (certificate) => normalizeCertificateFingerprint(certificate.index) === targetIndex
      ) ?? null;
    if (resolvedCertificate) {
      resolutionStrategy = "index";
    }
  }

  if (!resolvedCertificate && targetCn !== "") {
    const cnMatches = electronicTaxCertificates.filter(
      (certificate) => normalizeCertificateFingerprint(certificate.cn) === targetCn
    );
    if (cnMatches.length === 1) {
      resolvedCertificate = cnMatches[0] ?? null;
      resolutionStrategy = "cn";
    } else if (cnMatches.length > 1) {
      throw new Error("같은 CN의 현재 로컬 공동인증서가 여러 개여서 자동 등록을 중단했습니다.");
    }
  }

  if (!resolvedCertificate) {
    throw new Error(
      `로컬 브리지에서 현재 팝빌 등록 대상 전자세금용 공동인증서를 찾지 못했습니다. (index=${input.certificateIndex}, serial=${input.serial ?? "-"}, userDN=${input.userDN ?? "-"})`
    );
  }

  if (
    resolutionStrategy !== "identity" &&
    targetCn !== "" &&
    normalizeCertificateFingerprint(resolvedCertificate.cn) !== targetCn
  ) {
    throw new Error("선택한 공동인증서 CN이 현재 로컬 인증서와 달라 자동 등록을 중단했습니다.");
  }

  if (
    resolutionStrategy !== "identity" &&
    targetSerial !== "" &&
    normalizeCertificateFingerprint(resolvedCertificate.serial) !== targetSerial
  ) {
    throw new Error("선택한 공동인증서 serial이 현재 로컬 인증서와 달라 자동 등록을 중단했습니다.");
  }

  if (
    resolutionStrategy !== "identity" &&
    targetUserDN !== "" &&
    normalizeCertificateFingerprint(resolvedCertificate.userDN) !== targetUserDN
  ) {
    throw new Error("선택한 공동인증서 userDN이 현재 로컬 인증서와 달라 자동 등록을 중단했습니다.");
  }

  const certificateCn = resolvedCertificate.cn.trim();
  if (!certificateCn) {
    throw new Error("팝빌 자동 등록 대상 인증서의 CN을 확인하지 못했습니다.");
  }

  const resolvedCertificateIndex = Number(resolvedCertificate.index);
  if (!Number.isFinite(resolvedCertificateIndex) || resolvedCertificateIndex <= 0) {
    throw new Error("팝빌 자동 등록 대상 인증서의 로컬 index를 확인하지 못했습니다.");
  }

  const duplicateCnCertificates = electronicTaxCertificates.filter(
    (certificate) => normalizeCertificateFingerprint(certificate.cn) === normalizeCertificateFingerprint(certificateCn)
  );
  if (duplicateCnCertificates.length > 1 && targetSerial === "" && targetUserDN === "") {
    throw new Error(
      `같은 CN의 전자세금용 공동인증서가 ${duplicateCnCertificates.length}건이고 serial/userDN 식별값이 없어 자동 등록을 중단했습니다.`
    );
  }

  return {
    certificateIndex: resolvedCertificateIndex,
    certificateCn,
    certificateKind: "electronic_tax",
    serial: resolvedCertificate.serial?.trim() || null,
    userDN: resolvedCertificate.userDN?.trim() || null,
    targetExpireDate:
      normalizePopbillCertificateDateKey(input.targetExpireDate) ??
      normalizePopbillCertificateDateKey(resolvedCertificate.todate) ??
      normalizePopbillCertificateDateKey(resolvedCertificate.detailValidateTo)
  };
}

export function extractRegistrationError(signals: string): string | null {
  const normalized = signals.replace(/\s+/g, "");
  if (
    normalized.includes("만료된공동인증서") ||
    normalized.includes("만료된인증서") ||
    normalized.includes("유효기간이만료") ||
    normalized.includes("인증서가만료")
  ) {
    return "만료된 공동인증서입니다.";
  }

  if (
    normalized.includes("사업자번호가일치하지") ||
    normalized.includes("회원의사업자번호가일치하지") ||
    normalized.includes("사업자번호불일치")
  ) {
    return "공동인증서와 회원의 사업자번호가 일치하지 않습니다.";
  }

  if (
    normalized.includes("비밀번호를다시입력") ||
    normalized.includes("비밀번호가올바르지") ||
    normalized.includes("암호가올바르지") ||
    normalized.includes("비밀번호를확인")
  ) {
    return "공동인증서 비밀번호가 올바르지 않습니다.";
  }

  if (normalized.includes("인증서를선택")) {
    return "팝빌 인증서 등록 완료를 확인하지 못했습니다.";
  }

  return null;
}

const POPBILL_CERTIFICATE_INDEX_KEYWORDS = [
  "certificateindex",
  "certindex",
  "certificateid",
  "certid",
  "certno",
  "localcertificateindex",
  "localcertificateid",
  "로컬인증서번호",
  "인증서번호",
  "인증서인덱스",
  "cert-index",
  "cert-id",
  "index",
  "idx"
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPopbillFingerprintEvidence(evidenceValues: string[], targetValue: string | number | null | undefined): boolean {
  const normalizedTargetValue = normalizePopbillEvidenceValue(targetValue);
  if (normalizedTargetValue === "") {
    return false;
  }

  return evidenceValues.some((value) => normalizePopbillEvidenceValue(value).includes(normalizedTargetValue));
}

function hasPopbillExpireDateEvidence(evidenceValues: string[], targetExpireDate: string | null | undefined): boolean {
  const normalizedTargetDate = normalizePopbillCertificateDateKey(targetExpireDate);
  if (!normalizedTargetDate) {
    return false;
  }

  return evidenceValues
    .filter((value) => !String(value).startsWith("active:text:"))
    .some((value) => normalizePopbillCertificateDateKey(value) === normalizedTargetDate);
}

function hasExplicitPopbillCertificateIndexEvidence(
  evidenceValues: string[],
  targetIndex: string | number | null | undefined
): boolean {
  const normalizedTargetIndex = normalizePopbillEvidenceValue(targetIndex);
  if (normalizedTargetIndex === "") {
    return false;
  }

  const targetBoundaryPattern = new RegExp(`(?:^|[^0-9])${escapeRegExp(normalizedTargetIndex)}(?:[^0-9]|$)`);

  return evidenceValues.some((value) => {
    const normalizedValue = normalizePopbillEvidenceValue(value);
    if (!normalizedValue) {
      return false;
    }

    if (normalizedValue === normalizedTargetIndex) {
      return true;
    }

    if (!POPBILL_CERTIFICATE_INDEX_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))) {
      return false;
    }

    return (
      normalizedValue.includes(`=${normalizedTargetIndex}`) ||
      normalizedValue.includes(`:${normalizedTargetIndex}`) ||
      normalizedValue.includes(`#${normalizedTargetIndex}`) ||
      normalizedValue.includes(`(${normalizedTargetIndex})`) ||
      normalizedValue.includes(`[${normalizedTargetIndex}]`) ||
      targetBoundaryPattern.test(normalizedValue)
    );
  });
}

function trimDebugValue(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function matchPopbillCandidateIdentifiers(options: {
  evidenceValues: string[];
  targetIndex?: string | number | null;
  targetSerial?: string | null;
  targetUserDN?: string | null;
  targetExpireDate?: string | null;
}): PopbillCertificateCandidateIdentifier[] {
  const matchedIdentifiers: PopbillCertificateCandidateIdentifier[] = [];

  if (hasPopbillFingerprintEvidence(options.evidenceValues, options.targetSerial)) {
    matchedIdentifiers.push("serial");
  }

  if (hasPopbillFingerprintEvidence(options.evidenceValues, options.targetUserDN)) {
    matchedIdentifiers.push("userDN");
  }

  if (hasPopbillExpireDateEvidence(options.evidenceValues, options.targetExpireDate)) {
    matchedIdentifiers.push("targetExpireDate");
  }

  if (hasExplicitPopbillCertificateIndexEvidence(options.evidenceValues, options.targetIndex)) {
    matchedIdentifiers.push("certificateIndex");
  }

  return matchedIdentifiers;
}

function resolvePopbillIdentifierSelection(options: {
  identifier: PopbillCertificateCandidateIdentifier;
  candidates: PopbillCertificateIframeCandidate[];
  selectionDetailProbes: PopbillCertificateSelectionDetailProbe[];
}): { selector: string | null; reason: string | null; conflict: boolean } {
  const identifierLabel =
    options.identifier === "userDN"
      ? "userDN"
      : options.identifier === "certificateIndex"
        ? "certificate index"
        : options.identifier === "targetExpireDate"
          ? "expire date"
          : options.identifier;
  const metadataMatches = options.candidates.filter((candidate) => candidate.matchedIdentifiers.includes(options.identifier));
  const selectionMatches = options.selectionDetailProbes.filter((probe) =>
    probe.matchedIdentifiers.includes(options.identifier)
  );
  const metadataSelector = metadataMatches.length === 1 ? (metadataMatches[0]?.selector ?? null) : null;
  const selectionSelector = selectionMatches.length === 1 ? (selectionMatches[0]?.selector ?? null) : null;

  if (metadataSelector && selectionSelector && metadataSelector !== selectionSelector) {
    return {
      selector: null,
      reason: null,
      conflict: true
    };
  }

  if (selectionSelector && metadataSelector) {
    return {
      selector: selectionSelector,
      reason: `iframe DOM metadata + selection detail matched ${identifierLabel}`,
      conflict: false
    };
  }

  if (selectionSelector) {
    return {
      selector: selectionSelector,
      reason: `iframe selection detail matched ${identifierLabel}`,
      conflict: false
    };
  }

  if (metadataSelector) {
    return {
      selector: metadataSelector,
      reason: `iframe DOM metadata matched ${identifierLabel}`,
      conflict: false
    };
  }

  return {
    selector: null,
    reason: null,
    conflict: false
  };
}

export function pickPopbillCertificateCandidate(options: {
  candidates: PopbillCertificateIframeCandidate[];
  selectionDetailProbes?: PopbillCertificateSelectionDetailProbe[];
  targetIndex?: string | number | null;
  targetSerial?: string | null;
  targetUserDN?: string | null;
  targetExpireDate?: string | null;
}): { selector: string | null; reason: string | null } {
  const selectionDetailProbes = options.selectionDetailProbes ?? [];
  const identifierSelections: Array<{
    identifier: PopbillCertificateCandidateIdentifier;
    selector: string;
    reason: string;
  }> = [];

  const identifierTargets: Array<{
    identifier: PopbillCertificateCandidateIdentifier;
    enabled: boolean;
  }> = [
    {
      identifier: "serial",
      enabled: normalizeCertificateFingerprint(options.targetSerial) !== ""
    },
    {
      identifier: "userDN",
      enabled: normalizeCertificateFingerprint(options.targetUserDN) !== ""
    },
    {
      identifier: "targetExpireDate",
      enabled: normalizePopbillCertificateDateKey(options.targetExpireDate) !== null
    },
    {
      identifier: "certificateIndex",
      enabled: normalizeCertificateFingerprint(options.targetIndex) !== ""
    }
  ];

  for (const identifierTarget of identifierTargets) {
    if (!identifierTarget.enabled) {
      continue;
    }

    const selection = resolvePopbillIdentifierSelection({
      identifier: identifierTarget.identifier,
      candidates: options.candidates,
      selectionDetailProbes
    });
    if (selection.conflict) {
      return {
        selector: null,
        reason: null
      };
    }

    if (selection.selector && selection.reason) {
      identifierSelections.push({
        identifier: identifierTarget.identifier,
        selector: selection.selector,
        reason: selection.reason
      });
    }
  }

  const identifierSelectors = new Set(identifierSelections.map((selection) => selection.selector));
  if (identifierSelectors.size > 1) {
    return {
      selector: null,
      reason: null
    };
  }

  if (identifierSelections.length > 0) {
    return {
      selector: identifierSelections[0]?.selector ?? null,
      reason: identifierSelections[0]?.reason ?? null
    };
  }

  const metadataMatches = options.candidates.filter((candidate) => candidate.matchedIdentifiers.length > 0);
  const selectionMetadataMatches = selectionDetailProbes.filter((probe) => probe.matchedIdentifiers.length > 0);
  const metadataSelector = metadataMatches.length === 1 ? (metadataMatches[0]?.selector ?? null) : null;
  const selectionMetadataSelector =
    selectionMetadataMatches.length === 1 ? (selectionMetadataMatches[0]?.selector ?? null) : null;

  if (metadataSelector && selectionMetadataSelector && metadataSelector !== selectionMetadataSelector) {
    return {
      selector: null,
      reason: null
    };
  }

  if (metadataSelector && selectionMetadataSelector) {
    return {
      selector: metadataSelector,
      reason: `iframe DOM metadata + selection detail matched ${metadataMatches[0]?.matchedIdentifiers.join("/") ?? "identifier"}`
    };
  }

  if (selectionMetadataSelector) {
    return {
      selector: selectionMetadataSelector,
      reason: `iframe selection detail matched ${selectionMetadataMatches[0]?.matchedIdentifiers.join("/") ?? "identifier"}`
    };
  }

  if (metadataSelector) {
    return {
      selector: metadataSelector,
      reason: `iframe DOM metadata matched ${metadataMatches[0]?.matchedIdentifiers.join("/") ?? "identifier"}`
    };
  }

  if (options.candidates.length === 1) {
    return {
      selector: options.candidates[0]?.selector ?? null,
      reason: "single visible CN match"
    };
  }

  return {
    selector: null,
    reason: null
  };
}

function describePopbillCandidateEvidence(candidates: PopbillCertificateIframeCandidate[]): string {
  if (candidates.length === 0) {
    return "?꾨낫 DOM 利앷굅瑜??섏쭛?섏? 紐삵뻽?듬땲??";
  }

  return candidates
    .slice(0, 3)
    .map((candidate, index) => {
      const matchedSummary =
        candidate.matchedIdentifiers.length > 0
          ? `?앸퀎??${candidate.matchedIdentifiers.join("/")}`
          : "?앸퀎???놁쓬";
      const attributeSummary =
        candidate.attributes.length > 0
          ? `?띿꽦=${candidate.attributes.map((value) => trimDebugValue(value, 80)).join(" | ")}`
          : "?띿꽦=?놁쓬";
      const hiddenValueSummary =
        candidate.hiddenValues.length > 0
          ? `?낅젰媛?${candidate.hiddenValues.map((value) => trimDebugValue(value, 80)).join(" | ")}`
          : "?낅젰媛??놁쓬";

      return `${index + 1}) ${matchedSummary}; ?띿뒪??${trimDebugValue(candidate.text, 120)}; ${attributeSummary}; ${hiddenValueSummary}`;
    })
    .join(" / ");
}

function describePopbillSelectionDetailEvidence(probes: PopbillCertificateSelectionDetailProbe[]): string {
  if (probes.length === 0) {
    return "?좏깮 ???곸꽭 DOM 利앷굅瑜??섏쭛?섏? 紐삵뻽?듬땲??";
  }

  return probes
    .slice(0, 3)
    .map((probe, index) => {
      const matchedSummary =
        probe.matchedIdentifiers.length > 0 ? `?앸퀎??${probe.matchedIdentifiers.join("/")}` : "?앸퀎???놁쓬";
      const evidenceSummary =
        probe.evidence.length > 0 ? `利앷굅=${probe.evidence.map((value) => trimDebugValue(value, 80)).join(" | ")}` : "利앷굅=?놁쓬";
      return `${index + 1}) selector=${probe.selector}; ${matchedSummary}; ${evidenceSummary}`;
    })
    .join(" / ");
}

function resolvePopbillDebugArtifactDirPath(): string {
  const configuredDir = process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR?.trim();
  return configuredDir ? path.resolve(configuredDir) : path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AUTO-TAX", "popbill-cert-debug");
}

function ensurePopbillDebugArtifactDir(): string {
  const targetDir = resolvePopbillDebugArtifactDirPath();
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

export function getPopbillDebugArtifactSupport(): {
  supported: true;
  artifactDir: string;
  stages: PopbillDebugArtifactStage[];
} {
  return {
    supported: true,
    artifactDir: resolvePopbillDebugArtifactDirPath(),
    stages: [...POPBILL_DEBUG_ARTIFACT_STAGES]
  };
}

export function summarizePopbillChooserDebugReadiness(
  certificates: PopbillChooserReadinessCertificate[]
): Omit<PopbillChooserDebugReadiness, "available"> {
  const electronicTaxCertificates = certificates.filter((certificate) =>
    isElectronicTaxUsageName(certificate.usageToName ?? "")
  );
  const duplicateGroups = new Map<
    string,
    {
      certificateCn: string;
      certificateIndices: string[];
      userDNs: string[];
    }
  >();

  for (const certificate of electronicTaxCertificates) {
    const certificateCn = String(certificate.cn ?? "").trim();
    const normalizedCn = normalizeCertificateFingerprint(certificateCn);
    if (!normalizedCn) {
      continue;
    }

    const duplicateGroup = duplicateGroups.get(normalizedCn) ?? {
      certificateCn,
      certificateIndices: [],
      userDNs: []
    };
    const certificateIndex = String(certificate.index ?? "").trim();
    const userDN = String(certificate.userDN ?? "").trim();
    if (certificateIndex && !duplicateGroup.certificateIndices.includes(certificateIndex)) {
      duplicateGroup.certificateIndices.push(certificateIndex);
    }
    if (userDN && !duplicateGroup.userDNs.includes(userDN)) {
      duplicateGroup.userDNs.push(userDN);
    }
    duplicateGroups.set(normalizedCn, duplicateGroup);
  }

  const duplicateElectronicTaxCnCandidates = Array.from(duplicateGroups.values())
    .filter((candidate) => candidate.certificateIndices.length > 1)
    .sort((left, right) => left.certificateCn.localeCompare(right.certificateCn, "ko"));
  const duplicateElectronicTaxCnCount = duplicateElectronicTaxCnCandidates.length;
  const ambiguousCnReady = duplicateElectronicTaxCnCount > 0;

  return {
    electronicTaxCertificateCount: electronicTaxCertificates.length,
    duplicateElectronicTaxCnCount,
    ambiguousCnReady,
    duplicateElectronicTaxCnCandidates,
    blockers: ambiguousCnReady
      ? ["valid-popbill-cert-url-not-yet-verified"]
      : ["duplicate-electronic-tax-cn-missing", "valid-popbill-cert-url-not-yet-verified"],
    nextAction: ambiguousCnReady
      ? "이제 실제 Popbill cert-url 발급이 되는 workspace/customer에서 live Child.html artifact를 확보하세요."
      : "같은 CN의 전자세금용 공동인증서가 있는 PC/브리지에서 상태를 다시 확인한 뒤, 실제 Popbill cert-url 발급 가능 상태를 검증하세요.",
    message:
      duplicateElectronicTaxCnCount > 0
        ? `같은 CN의 전자세금용 공동인증서가 ${duplicateElectronicTaxCnCount}개 그룹 있어 ambiguous-cn-match live 재현이 가능합니다.`
        : "현재 로컬 브리지 전자세금용 공동인증서에는 같은 CN 중복이 없어 ambiguous-cn-match live 재현이 불가능합니다."
  };
}

export async function getPopbillChooserDebugReadiness(): Promise<PopbillChooserDebugReadiness> {
  try {
    const { storageProbe } = await collectBridgeCertificateList({ preferCached: false });
    if (!storageProbe.ok) {
      return {
        available: false,
        electronicTaxCertificateCount: 0,
        duplicateElectronicTaxCnCount: 0,
        ambiguousCnReady: false,
        duplicateElectronicTaxCnCandidates: [],
        blockers: ["local-bridge-certificates-unavailable", "valid-popbill-cert-url-not-yet-verified"],
        nextAction: "癒쇱? 濡쒖뺄 釉뚮━吏/怨듬룞?몄쬆??紐⑸줉 議고쉶瑜?蹂듦뎄???? duplicate electronic_tax CN怨??ㅼ젣 Popbill cert-url 諛쒓툒 ?곹깭瑜??ㅼ떆 ?뺤씤?섏꽭??",
        message: storageProbe.error ?? "濡쒖뺄 釉뚮━吏?먯꽌 怨듬룞?몄쬆??紐⑸줉???쎌? 紐삵뻽?듬땲??"
      };
    }

    return {
      available: true,
      ...summarizePopbillChooserDebugReadiness(storageProbe.certificates)
    };
  } catch (error) {
    return {
      available: false,
      electronicTaxCertificateCount: 0,
      duplicateElectronicTaxCnCount: 0,
      ambiguousCnReady: false,
      duplicateElectronicTaxCnCandidates: [],
      blockers: ["local-bridge-certificates-unavailable", "valid-popbill-cert-url-not-yet-verified"],
      nextAction: "癒쇱? 濡쒖뺄 釉뚮━吏/怨듬룞?몄쬆??紐⑸줉 議고쉶瑜?蹂듦뎄???? duplicate electronic_tax CN怨??ㅼ젣 Popbill cert-url 諛쒓툒 ?곹깭瑜??ㅼ떆 ?뺤씤?섏꽭??",
      message: error instanceof Error ? error.message : "濡쒖뺄 釉뚮━吏?먯꽌 怨듬룞?몄쬆??紐⑸줉???쎌? 紐삵뻽?듬땲??"
    };
  }
}

function sanitizeDebugArtifactName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function formatPopbillDebugArtifactSummary(artifact: {
  jsonPath: string;
  htmlPath: string | null;
  mainHtmlPath?: string | null;
}): string {
  const paths = [artifact.jsonPath, artifact.htmlPath, artifact.mainHtmlPath].filter((value): value is string => Boolean(value));
  return paths.length > 0 ? `디버그 아티팩트: ${paths.join(", ")}` : "디버그 아티팩트를 저장하지 못했습니다.";
}

type PopbillSelectionActivationState = {
  passwordInputVisible: boolean;
  passwordInputDisabled: boolean;
  passwordInputReadOnly: boolean;
  confirmButtonDisabled: boolean;
  keyboardToggleVisible: boolean;
  browserManualVisible: boolean;
  activeElementId: string | null;
  selectedRowIds: string[];
  targetSelectionConfirmed: boolean;
  targetSelectionCommitted: boolean;
  targetSelectionEvidence: string[];
  targetSelectionStatusTexts: string[];
};

async function readPopbillSelectionActivationState(
  frame: Frame,
  targetSelector?: string | null
): Promise<PopbillSelectionActivationState> {
  return await frame.locator("body").evaluate((body, rawTargetSelector) => {
    const passwordInput = body.querySelector("#input_cert_pw");
    const confirmButton = body.querySelector("#btn_confirm_iframe");
    const keyboardToggle = body.querySelector("#keyboardOn");
    const browserManual = body.querySelector("#browser_manual1");
    const selectedElements: HTMLElement[] = [];
    for (const element of Array.from(
      body.querySelectorAll(
        [
          "[role='row'][aria-selected='true']",
          "[role='row'].selected",
          "[role='row'].active",
          "[role='row'].current",
          "[role='gridcell'][aria-selected='true']",
          "[role='gridcell'].selected",
          "[role='gridcell'].active",
          "[role='gridcell'].current",
          "[role='row'] td",
          "[role='row'] [role='gridcell']",
          "tr td",
          "tr [role='gridcell']"
        ].join(", ")
      )
    )) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const rowElement = element.closest("[role='row'], tr");
      const checkTargets = [element, rowElement].filter(
        (candidate): candidate is HTMLElement => candidate instanceof HTMLElement
      );
      let hasSelectionSignal = false;
      for (const candidate of checkTargets) {
        const classNames = Array.from(candidate.classList.values()).map((value) => value.toLowerCase());
        if (
          classNames.some(
            (className) =>
              className.includes("selected") ||
              className.includes("pressed") ||
              className.includes("active") ||
              className.includes("current")
          )
        ) {
          hasSelectionSignal = true;
          break;
        }
      }

      if (hasSelectionSignal) {
        selectedElements.push(element);
      }
    }
    const selectedRowIds = selectedElements
      .map((element) => element.id || element.getAttribute("data-key") || "")
      .filter(Boolean)
      .slice(0, 8);
    const passwordInputVisible =
      passwordInput instanceof HTMLElement
        ? (() => {
            const style = window.getComputedStyle(passwordInput);
            return style.display !== "none" && style.visibility !== "hidden" && passwordInput.getClientRects().length > 0;
          })()
        : false;
    const keyboardToggleVisible =
      keyboardToggle instanceof HTMLElement
        ? (() => {
            const style = window.getComputedStyle(keyboardToggle);
            return style.display !== "none" && style.visibility !== "hidden" && keyboardToggle.getClientRects().length > 0;
          })()
        : false;
    const browserManualVisible =
      browserManual instanceof HTMLElement
        ? (() => {
            const style = window.getComputedStyle(browserManual);
            return style.display !== "none" && style.visibility !== "hidden" && browserManual.getClientRects().length > 0;
          })()
        : false;
    const targetSelectionEvidence: string[] = [];
    let targetSelectionConfirmed = false;
    let targetSelectionCommitted = false;
    const targetSelectionStatusTexts: string[] = [];

    if (typeof rawTargetSelector === "string" && rawTargetSelector.trim() !== "") {
      const target = body.querySelector(rawTargetSelector);
      const targetCell = target?.closest("[role='gridcell'], td");
      const targetRow = target?.closest("[role='row'], tr");
      const targetNodes = [target, targetCell, targetRow].filter(
        (element): element is HTMLElement => element instanceof HTMLElement
      );

      let targetHasSelectionSignal = false;
      for (const node of targetNodes) {
        const checkTargets = [node, node.closest("[role='row'], tr")].filter(
          (candidate): candidate is HTMLElement => candidate instanceof HTMLElement
        );
        for (const candidate of checkTargets) {
          const classNames = Array.from(candidate.classList.values()).map((value) => value.toLowerCase());
          if (
            classNames.some(
              (className) =>
                className.includes("selected") ||
                className.includes("pressed") ||
                className.includes("active") ||
                className.includes("current")
            )
          ) {
            targetHasSelectionSignal = true;
            break;
          }
        }
        if (targetHasSelectionSignal) {
          break;
        }
      }

      if (targetHasSelectionSignal) {
        targetSelectionConfirmed = true;
        targetSelectionEvidence.push(
          ...targetNodes.slice(0, 3).map((node) => {
            const row = node.closest("[role='row'], tr");
            return `target-selected=${node.tagName.toLowerCase()}#${node.id || "-"} row=${row instanceof HTMLElement ? row.id || "-" : "-"}`;
          })
        );
      }

      for (const targetNode of targetNodes) {
        for (const attributeName of ["title", "aria-label"] as const) {
          const rawValue = String(targetNode.getAttribute(attributeName) ?? "")
            .replace(/\s+/g, " ")
            .trim();
          if (!rawValue) {
            continue;
          }

          targetSelectionStatusTexts.push(`${targetNode.tagName.toLowerCase()}:${attributeName}:${rawValue}`);
          if (/선택됨|selected/i.test(rawValue)) {
            targetSelectionCommitted = true;
          }
        }
      }

      const targetRowId =
        targetRow instanceof HTMLElement ? targetRow.id || targetRow.getAttribute("data-key") || "" : "";
      const targetCellId =
        targetCell instanceof HTMLElement ? targetCell.id || targetCell.getAttribute("data-key") || "" : "";
      if (
        !targetSelectionCommitted &&
        targetSelectionConfirmed &&
        ((targetRowId && selectedRowIds.includes(targetRowId)) || (targetCellId && selectedRowIds.includes(targetCellId)))
      ) {
        targetSelectionCommitted = true;
      }

      if (!targetSelectionConfirmed) {
        for (const selectedElement of selectedElements) {
          const row = selectedElement.closest("[role='row'], tr");
          const cell = selectedElement.closest("[role='gridcell'], td");
          const keys = [
            selectedElement.id,
            selectedElement.getAttribute("data-key") ?? "",
            row instanceof HTMLElement ? row.id : "",
            row instanceof HTMLElement ? row.getAttribute("data-key") ?? "" : "",
            cell instanceof HTMLElement ? cell.id : "",
            cell instanceof HTMLElement ? cell.getAttribute("data-key") ?? "" : ""
          ]
            .filter(Boolean)
            .slice(0, 4);

          if (
            targetNodes.some(
              (node) => node === selectedElement || node.contains(selectedElement) || selectedElement.contains(node)
            )
          ) {
            targetSelectionConfirmed = true;
            targetSelectionEvidence.push(
              `selected=${selectedElement.tagName.toLowerCase()}#${selectedElement.id || "-"} keys=${keys.join("|") || "-"}`
            );
            break;
          }
        }
      }

      if (!targetSelectionConfirmed) {
        for (const targetNode of targetNodes) {
          const row = targetNode.closest("[role='row'], tr");
          const cell = targetNode.closest("[role='gridcell'], td");
          const keys = [
            targetNode.tagName.toLowerCase(),
            targetNode.id || "",
            targetNode.getAttribute("data-key") ?? "",
            row instanceof HTMLElement ? row.id : "",
            row instanceof HTMLElement ? row.getAttribute("data-key") ?? "" : "",
            cell instanceof HTMLElement ? cell.id : "",
            cell instanceof HTMLElement ? cell.getAttribute("data-key") ?? "" : ""
          ]
            .filter(Boolean)
            .slice(0, 6);
          if (keys.length > 0) {
            targetSelectionEvidence.push(`target=${keys.join("|")}`);
          }
        }
      }
    } else {
      targetSelectionConfirmed = true;
      targetSelectionCommitted = true;
    }

    return {
      passwordInputVisible,
      passwordInputDisabled:
        passwordInput instanceof HTMLInputElement || passwordInput instanceof HTMLTextAreaElement
          ? passwordInput.disabled
          : true,
      passwordInputReadOnly:
        passwordInput instanceof HTMLInputElement || passwordInput instanceof HTMLTextAreaElement
          ? passwordInput.readOnly
          : false,
      confirmButtonDisabled:
        confirmButton instanceof HTMLButtonElement ? confirmButton.disabled : true,
      keyboardToggleVisible,
      browserManualVisible,
      activeElementId: document.activeElement instanceof HTMLElement ? document.activeElement.id || null : null,
      selectedRowIds,
      targetSelectionConfirmed,
      targetSelectionCommitted,
      targetSelectionEvidence: targetSelectionEvidence.slice(0, 8),
      targetSelectionStatusTexts: targetSelectionStatusTexts.slice(0, 8)
    };
  }, targetSelector ?? null);
}

function isPopbillSelectionReady(state: PopbillSelectionActivationState): boolean {
  return (
    state.passwordInputVisible &&
    !state.passwordInputDisabled &&
    !state.passwordInputReadOnly &&
    state.targetSelectionConfirmed &&
    state.targetSelectionCommitted
  );
}

async function activatePopbillCertificateSelection(frame: Frame, selector: string): Promise<void> {
  const targetLocator = frame.locator(selector);
  await targetLocator.scrollIntoViewIfNeeded().catch(() => undefined);
  await targetLocator.click({ force: true }).catch(() => undefined);
  const targetHandle = await targetLocator.elementHandle().catch(() => null);
  const targetCellHandle = targetHandle
    ? (await targetHandle.evaluateHandle((node) => node.closest("[role='gridcell'], td"))).asElement()
    : null;
  const targetRowHandle = targetHandle
    ? (await targetHandle.evaluateHandle((node) => node.closest("[role='row'], tr"))).asElement()
    : null;
  const interactionHandles = [targetHandle, targetCellHandle, targetRowHandle].filter(
    (handle): handle is NonNullable<typeof targetHandle> => Boolean(handle)
  );

  for (const handle of interactionHandles) {
    await handle.scrollIntoViewIfNeeded().catch(() => undefined);
    await handle.click({ force: true }).catch(() => undefined);
    await handle.focus().catch(() => undefined);
    await frame.waitForTimeout(50);
  }

  if (targetCellHandle) {
    await targetCellHandle.press("Enter").catch(() => undefined);
    await frame.waitForTimeout(100);
    await targetCellHandle.press(" ").catch(() => undefined);
    await frame.waitForTimeout(100);
  }

  await frame.evaluate((rawSelector) => {
    const target = document.querySelector(rawSelector);
    const targetCell = target?.closest("[role='gridcell'], td");
    const targetRow = target?.closest("[role='row'], tr");
    const dispatchTargets = [target, targetCell, targetRow];
    const clicked = new WeakSet<HTMLElement>();
    for (const dispatchTarget of dispatchTargets) {
      if (!(dispatchTarget instanceof HTMLElement) || clicked.has(dispatchTarget)) {
        continue;
      }
      clicked.add(dispatchTarget);
      try {
        dispatchTarget.focus();
      } catch {
        // Ignore focus failures for non-focusable elements.
      }
      for (const eventType of ["mouseover", "mousemove", "mousedown", "mouseup", "click"] as const) {
        dispatchTarget.dispatchEvent(
          new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          })
        );
      }
      try {
        dispatchTarget.click();
      } catch {
        // Some popbill elements may reject direct click(); the synthetic events above are enough.
      }
    }

    const keyboardTarget =
      targetCell instanceof HTMLElement
        ? targetCell
        : target instanceof HTMLElement
          ? target
          : targetRow instanceof HTMLElement
            ? targetRow
            : null;
    if (keyboardTarget) {
      for (const key of ["Enter", " "] as const) {
        keyboardTarget.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true
          })
        );
        keyboardTarget.dispatchEvent(
          new KeyboardEvent("keyup", {
            key,
            bubbles: true,
            cancelable: true
          })
        );
      }
    }

    const browserManualClose = document.querySelector("#manual_close");
    if (browserManualClose instanceof HTMLElement) {
      try {
        browserManualClose.click();
      } catch {
        // Ignore hint dismissal failures.
      }
    }
  }, selector);
}

async function ensurePopbillCertificateSelectionReady(
  frame: Frame,
  selector: string,
  timeoutMs = 8_000
): Promise<PopbillSelectionActivationState> {
  const startedAt = Date.now();
  let lastState = await readPopbillSelectionActivationState(frame, selector);
  if (isPopbillSelectionReady(lastState)) {
    return lastState;
  }

  while (Date.now() - startedAt < timeoutMs) {
    await activatePopbillCertificateSelection(frame, selector);
    await frame.waitForTimeout(250);
    lastState = await readPopbillSelectionActivationState(frame, selector);
    if (isPopbillSelectionReady(lastState)) {
      return lastState;
    }
  }

  return lastState;
}

async function fillPopbillCertificatePassword(frame: Frame, password: string): Promise<void> {
  const passwordInput = frame.locator("#input_cert_pw");
  await passwordInput.fill(password);
  await passwordInput.evaluate((element, value) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return;
    }
    element.focus();
    element.value = value;
    for (const eventType of ["input", "change", "keyup"] as const) {
      element.dispatchEvent(
        new Event(eventType, {
          bubbles: true,
          cancelable: true
        })
      );
    }
  }, password);
}

async function submitPopbillCertificateSelection(frame: Frame): Promise<void> {
  const confirmButton = frame.locator("#btn_confirm_iframe");
  await confirmButton.click({ force: true }).catch(() => undefined);
  await frame.evaluate(() => {
    const confirmButton = document.querySelector("#btn_confirm_iframe");
    const passwordInput = document.querySelector("#input_cert_pw");
    if (passwordInput instanceof HTMLElement) {
      passwordInput.focus();
    }
    if (confirmButton instanceof HTMLElement) {
      for (const eventType of ["pointerdown", "mousedown", "mouseup", "click"] as const) {
        confirmButton.dispatchEvent(
          new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          })
        );
      }
      try {
        confirmButton.click();
      } catch {
        // Synthetic events above are the fallback.
      }
    }
  });
}

async function pressPopbillCertificatePasswordEnter(frame: Frame): Promise<void> {
  await frame.locator("#input_cert_pw").press("Enter").catch(() => undefined);
  await frame.evaluate(() => {
    const input = document.querySelector("#input_cert_pw");
    if (!(input instanceof HTMLElement)) {
      return;
    }
    input.focus();
    for (const eventType of ["keydown", "keypress", "keyup"] as const) {
      input.dispatchEvent(
        new KeyboardEvent(eventType, {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true
        })
      );
    }
  }).catch(() => undefined);
}

async function writePopbillDebugArtifact(options: {
  stage: PopbillDebugArtifactStage;
  page: Page;
  frame?: Frame | null;
  resolvedCertificate: {
    certificateIndex: number;
    certificateCn: string;
    certificateKind: "electronic_tax";
    serial: string | null;
    userDN: string | null;
  };
  visibleMatchCount?: number;
  selectionReason?: string | null;
  candidates?: PopbillCertificateIframeCandidate[];
  selectionDetailProbes?: PopbillCertificateSelectionDetailProbe[];
  selectionActivationState?: PopbillSelectionActivationState | null;
  dialogMessages?: string[];
  errorMessage?: string | null;
}): Promise<{ jsonPath: string; htmlPath: string | null; mainHtmlPath: string | null }> {
  const artifactDir = ensurePopbillDebugArtifactDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = sanitizeDebugArtifactName(
    `${timestamp}-${options.stage}-${options.resolvedCertificate.certificateIndex}-${options.resolvedCertificate.certificateCn}`
  );
  const jsonPath = path.join(artifactDir, `${slug}.json`);
  const htmlPath = path.join(artifactDir, `${slug}.frame.html`);
  const mainHtmlPath = path.join(artifactDir, `${slug}.main.html`);
  const htmlSource = options.frame ?? options.page.mainFrame();
  const frameHtml = await htmlSource.content().catch(() => null);
  const mainHtml = await options.page.mainFrame().content().catch(() => null);
  const frameSummaries = await Promise.all(
    options.page.frames().map(async (frame) => ({
      name: frame.name(),
      url: frame.url(),
      text: (await frame.locator("body").innerText({ timeout: 1_000 }).catch(() => ""))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2_000)
    }))
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        stage: options.stage,
        pageUrl: options.page.url(),
        frameUrl: options.frame?.url() ?? null,
        resolvedCertificate: options.resolvedCertificate,
        visibleMatchCount: options.visibleMatchCount ?? null,
        selectionReason: options.selectionReason ?? null,
        errorMessage: options.errorMessage ?? null,
        candidates: options.candidates ?? [],
        selectionDetailProbes: options.selectionDetailProbes ?? [],
        selectionActivationState: options.selectionActivationState ?? null,
        frames: frameSummaries,
        dialogMessages: options.dialogMessages ?? []
      },
      null,
      2
    ),
    "utf8"
  );

  if (typeof frameHtml === "string" && frameHtml.trim() !== "") {
    fs.writeFileSync(htmlPath, frameHtml, "utf8");
    if (options.frame && typeof mainHtml === "string" && mainHtml.trim() !== "" && mainHtml !== frameHtml) {
      fs.writeFileSync(mainHtmlPath, mainHtml, "utf8");
      return { jsonPath, htmlPath, mainHtmlPath };
    }
    return { jsonPath, htmlPath, mainHtmlPath: null };
  }

  if (options.frame && typeof mainHtml === "string" && mainHtml.trim() !== "") {
    fs.writeFileSync(mainHtmlPath, mainHtml, "utf8");
    return { jsonPath, htmlPath: null, mainHtmlPath };
  }

  return { jsonPath, htmlPath: null, mainHtmlPath: null };
}

async function inspectPopbillCertificateSelectionFrame(
  frame: Frame,
  target: {
    certificateCn: string;
    certificateIndex: number;
    serial: string | null;
    userDN: string | null;
    targetExpireDate: string | null;
  }
): Promise<{
  visibleMatchCount: number;
  selectedSelector: string | null;
  selectionReason: string | null;
  candidates: PopbillCertificateIframeCandidate[];
}> {
  const candidates = await frame.locator("body").evaluate(
    (body, rawTarget) => {
      const targetValue = {
        certificateCn: String(rawTarget.certificateCn ?? ""),
        certificateIndex: String(rawTarget.certificateIndex ?? ""),
        serial: String(rawTarget.serial ?? ""),
        userDN: String(rawTarget.userDN ?? ""),
        targetExpireDate: String(rawTarget.targetExpireDate ?? "")
      };
      const normalizedTargetCn = String(targetValue.certificateCn ?? "")
        .replace(/\s+/g, "")
        .trim()
        .toLowerCase();
      const candidatesBySelector = new Map<string, PopbillCertificateIframeCandidate>();

      for (const matchedLeafElement of Array.from(body.querySelectorAll("*"))) {
        if (!(matchedLeafElement instanceof HTMLElement)) {
          continue;
        }

        const matchedLeafStyle = window.getComputedStyle(matchedLeafElement);
        if (
          matchedLeafStyle.display === "none" ||
          matchedLeafStyle.visibility === "hidden" ||
          matchedLeafElement.getClientRects().length === 0
        ) {
          continue;
        }

        const matchedLeafText = String(matchedLeafElement.innerText || matchedLeafElement.textContent || "")
          .replace(/\s+/g, "")
          .trim()
          .toLowerCase();
        if (!normalizedTargetCn || !matchedLeafText.includes(normalizedTargetCn)) {
          continue;
        }

        let hasVisibleChildMatch = false;
        for (const child of Array.from(matchedLeafElement.children)) {
          if (!(child instanceof HTMLElement)) {
            continue;
          }

          const childStyle = window.getComputedStyle(child);
          if (childStyle.display === "none" || childStyle.visibility === "hidden" || child.getClientRects().length === 0) {
            continue;
          }

          const childText = String(child.innerText || child.textContent || "")
            .replace(/\s+/g, "")
            .trim()
            .toLowerCase();
          if (childText.includes(normalizedTargetCn)) {
            hasVisibleChildMatch = true;
            break;
          }
        }

        if (hasVisibleChildMatch) {
          continue;
        }

        let container: HTMLElement = matchedLeafElement;
        let current: HTMLElement | null = matchedLeafElement;
        let depth = 0;
        while (current && current !== body && depth < 6) {
          const hasInterestingInputs = current.querySelector("input, option[selected], select, textarea") !== null;
          let hasInterestingAttributes = false;
          for (const attribute of Array.from(current.attributes)) {
            const trimmedValue = attribute.value.trim();
            if (
              trimmedValue !== "" &&
              (attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "class" ||
                attribute.name === "role" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-"))
            ) {
              hasInterestingAttributes = true;
              break;
            }
          }

          if (hasInterestingInputs || hasInterestingAttributes || current.matches("tr, li, label, button, a, td, div")) {
            container = current;
          }

          if (
            current.matches("tr, li, label, button, a") ||
            current.getAttribute("onclick") ||
            current.getAttribute("role") === "button"
          ) {
            container = current;
            break;
          }

          current = current.parentElement;
          depth += 1;
        }

        let selector = "";
        if (container.id) {
          selector = `#${CSS.escape(container.id)}`;
        } else {
          const segments: string[] = [];
          let selectorCurrent: HTMLElement | null = container;
          while (selectorCurrent && selectorCurrent !== body) {
            let segment = selectorCurrent.tagName.toLowerCase();
            let sibling = selectorCurrent.previousElementSibling;
            let position = 1;
            while (sibling) {
              if (sibling.tagName === selectorCurrent.tagName) {
                position += 1;
              }
              sibling = sibling.previousElementSibling;
            }
            segment += `:nth-of-type(${position})`;
            segments.unshift(segment);
            selectorCurrent = selectorCurrent.parentElement;
          }
          selector = segments.length > 0 ? `body > ${segments.join(" > ")}` : "body";
        }

        if (!selector || candidatesBySelector.has(selector)) {
          continue;
        }

        const attributes: string[] = [];
        const hiddenValues: string[] = [];
        const seenAttributes = new Set<string>();
        const seenHiddenValues = new Set<string>();
        const chainCandidates = [
          matchedLeafElement,
          container,
          container.parentElement,
          container.parentElement?.parentElement
        ];
        for (let level = 0; level < chainCandidates.length; level += 1) {
          const chainCandidate = chainCandidates[level];
          if (!(chainCandidate instanceof HTMLElement)) {
            continue;
          }

          for (const attribute of Array.from(chainCandidate.attributes)) {
            const trimmedValue = String(attribute.value ?? "").trim();
            if (
              !trimmedValue ||
              !(
                attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "role" ||
                attribute.name === "class" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-")
              )
            ) {
              continue;
            }

            const descriptor = `chain${level}:${attribute.name}=${trimmedValue}`;
            if (!seenAttributes.has(descriptor)) {
              seenAttributes.add(descriptor);
              attributes.push(descriptor);
            }
          }
        }

        for (const descendant of Array.from(container.querySelectorAll("*")).slice(0, 20)) {
          if (!(descendant instanceof HTMLElement)) {
            continue;
          }

          let descendantHasInterestingAttributes = false;
          for (const attribute of Array.from(descendant.attributes)) {
            const trimmedValue = attribute.value.trim();
            if (
              trimmedValue !== "" &&
              (attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "class" ||
                attribute.name === "role" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-"))
            ) {
              descendantHasInterestingAttributes = true;
              break;
            }
          }

          if (!descendantHasInterestingAttributes) {
            continue;
          }

          for (const attribute of Array.from(descendant.attributes)) {
            const trimmedValue = String(attribute.value ?? "").trim();
            if (
              !trimmedValue ||
              !(
                attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "role" ||
                attribute.name === "class" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-")
              )
            ) {
              continue;
            }

            const descriptor = `desc:${attribute.name}=${trimmedValue}`;
            if (!seenAttributes.has(descriptor)) {
              seenAttributes.add(descriptor);
              attributes.push(descriptor);
            }
          }
        }

        for (const field of Array.from(container.querySelectorAll("input, option[selected], select, textarea")).slice(0, 12)) {
          if (!(field instanceof HTMLElement)) {
            continue;
          }

          const parts = [
            String(field.getAttribute("name") ?? "").trim(),
            String(field.getAttribute("id") ?? "").trim(),
            String(field.getAttribute("value") ?? "").trim(),
            String(field.textContent ?? "").trim()
          ].filter(Boolean);
          const descriptor = parts.join("=");
          if (!descriptor) {
            continue;
          }

          const hiddenDescriptor = `field:${descriptor}`;
          if (!seenHiddenValues.has(hiddenDescriptor)) {
            seenHiddenValues.add(hiddenDescriptor);
            hiddenValues.push(hiddenDescriptor);
          }
        }

        const text = (container.innerText || container.textContent || "").replace(/\s+/g, " ").trim();
        candidatesBySelector.set(selector, {
          selector,
          text,
          attributes,
          hiddenValues,
          matchedIdentifiers: []
        });
      }

      return Array.from(candidatesBySelector.values());
    },
    target
  );
  const candidatesWithIdentifiers = candidates.map((candidate) => ({
    ...candidate,
    matchedIdentifiers: matchPopbillCandidateIdentifiers({
      evidenceValues: [candidate.text, ...candidate.attributes, ...candidate.hiddenValues],
      targetIndex: target.certificateIndex,
      targetSerial: target.serial,
      targetUserDN: target.userDN,
      targetExpireDate: target.targetExpireDate
    })
  }));
  const selected = pickPopbillCertificateCandidate({
    candidates: candidatesWithIdentifiers,
    targetIndex: target.certificateIndex,
    targetSerial: target.serial,
    targetUserDN: target.userDN,
    targetExpireDate: target.targetExpireDate
  });

  return {
    visibleMatchCount: candidatesWithIdentifiers.length,
    selectedSelector: selected.selector,
    selectionReason: selected.reason,
    candidates: candidatesWithIdentifiers
  };
}

async function inspectPopbillCertificateSelectionDetails(
  frame: Frame,
  candidates: PopbillCertificateIframeCandidate[],
  target: {
    certificateIndex: number;
    serial: string | null;
    userDN: string | null;
    targetExpireDate: string | null;
  }
): Promise<PopbillCertificateSelectionDetailProbe[]> {
  const probes: PopbillCertificateSelectionDetailProbe[] = [];
  for (const candidate of candidates.slice(0, 6)) {
    if (!candidate.selector) {
      continue;
    }

    await activatePopbillCertificateSelection(frame, candidate.selector);
    await frame.waitForTimeout(150);
    const probe = await frame.locator("body").evaluate(
      (body) => {
        const evidence: string[] = [];
        const seenEvidence = new Set<string>();

        const selectors = [
          "[aria-selected='true']",
          "[aria-current]",
          "[selected]",
          "[checked]",
          ".selected",
          ".active",
          ".current",
          ".focus",
          ".on",
          "[class*='selected']",
          "[class*='active']",
          "[class*='current']",
          "[class*='focus']",
          "[id*='detail']",
          "[id*='info']",
          "[id*='preview']",
          "[name*='detail']",
          "[name*='info']",
          "[name*='preview']"
        ];
        for (const selector of selectors) {
          for (const element of Array.from(body.querySelectorAll(selector)).slice(0, 4)) {
            if (!(element instanceof HTMLElement)) {
              continue;
            }

            const textDescriptor = `${selector}:text:${String(element.innerText || element.textContent || "")
              .replace(/\s+/g, " ")
              .trim()}`;
            if (!seenEvidence.has(textDescriptor) && !textDescriptor.endsWith(":")) {
              seenEvidence.add(textDescriptor);
              evidence.push(textDescriptor);
            }

            for (const attribute of Array.from(element.attributes)) {
              if (
                attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "role" ||
                attribute.name === "class" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-")
              ) {
                const trimmedValue = String(attribute.value ?? "").replace(/\s+/g, " ").trim();
                if (!trimmedValue) {
                  continue;
                }

                const attributeDescriptor = `${selector}:attr:${attribute.name}:${trimmedValue}`;
                if (!seenEvidence.has(attributeDescriptor)) {
                  seenEvidence.add(attributeDescriptor);
                  evidence.push(attributeDescriptor);
                }
              }
            }
          }
        }

        if (document.activeElement instanceof HTMLElement) {
          const activeTextDescriptor = `active:text:${String(document.activeElement.innerText || document.activeElement.textContent || "")
            .replace(/\s+/g, " ")
            .trim()}`;
          if (!seenEvidence.has(activeTextDescriptor) && !activeTextDescriptor.endsWith(":")) {
            seenEvidence.add(activeTextDescriptor);
            evidence.push(activeTextDescriptor);
          }

          for (const attribute of Array.from(document.activeElement.attributes)) {
            if (
              attribute.name === "id" ||
              attribute.name === "name" ||
              attribute.name === "value" ||
              attribute.name === "title" ||
              attribute.name === "role" ||
              attribute.name === "class" ||
              attribute.name === "onclick" ||
              attribute.name.startsWith("data-") ||
              attribute.name.startsWith("aria-")
            ) {
              const trimmedValue = String(attribute.value ?? "").replace(/\s+/g, " ").trim();
              if (!trimmedValue) {
                continue;
              }

              const activeDescriptor = `active:attr:${attribute.name}:${trimmedValue}`;
              if (!seenEvidence.has(activeDescriptor)) {
                seenEvidence.add(activeDescriptor);
                evidence.push(activeDescriptor);
              }
            }
          }
        }

        for (const field of Array.from(body.querySelectorAll("input, option[selected], select, textarea")).slice(0, 20)) {
          if (!(field instanceof HTMLElement)) {
            continue;
          }

          const fieldTextDescriptor = `field:text:${String(field.innerText || field.textContent || "")
            .replace(/\s+/g, " ")
            .trim()}`;
          if (!seenEvidence.has(fieldTextDescriptor) && !fieldTextDescriptor.endsWith(":")) {
            seenEvidence.add(fieldTextDescriptor);
            evidence.push(fieldTextDescriptor);
          }

          for (const attribute of Array.from(field.attributes)) {
            if (
              attribute.name === "id" ||
              attribute.name === "name" ||
              attribute.name === "value" ||
              attribute.name === "title" ||
              attribute.name === "role" ||
              attribute.name === "class" ||
              attribute.name === "onclick" ||
              attribute.name.startsWith("data-") ||
              attribute.name.startsWith("aria-")
            ) {
              const trimmedValue = String(attribute.value ?? "").replace(/\s+/g, " ").trim();
              if (!trimmedValue) {
                continue;
              }

              const fieldAttributeDescriptor = `field:attr:${attribute.name}:${trimmedValue}`;
              if (!seenEvidence.has(fieldAttributeDescriptor)) {
                seenEvidence.add(fieldAttributeDescriptor);
                evidence.push(fieldAttributeDescriptor);
              }
            }
          }

          const fieldValue = String(field.getAttribute("value") ?? "").replace(/\s+/g, " ").trim();
          if (fieldValue) {
            const fieldValueDescriptor = `field:value:${fieldValue}`;
            if (!seenEvidence.has(fieldValueDescriptor)) {
              seenEvidence.add(fieldValueDescriptor);
              evidence.push(fieldValueDescriptor);
            }
          }
        }

        return {
          evidence: evidence.slice(0, 16)
        };
      }
    );

    probes.push({
      selector: candidate.selector,
      matchedIdentifiers: matchPopbillCandidateIdentifiers({
        evidenceValues: probe.evidence,
        targetIndex: target.certificateIndex,
        targetSerial: target.serial,
        targetUserDN: target.userDN,
        targetExpireDate: target.targetExpireDate
      }),
      evidence: probe.evidence
    });
  }

  return probes;
}

type PopbillCertificateRegistrationBrowserMode = {
  headless: boolean;
  useTemporaryProfile?: boolean;
};

async function registerPopbillCertificateWithBrowserMode(
  input: PopbillCertificateRegistrationInput,
  options: PopbillCertificateRegistrationBrowserMode
): Promise<PopbillCertificateRegistrationResult> {
  const timingStartedAt = Date.now();
  const timing = {
    browserLaunchMs: 0,
    permissionMs: 0,
    pageLoadMs: 0,
    certificateResolveMs: 0,
    sectionOpenMs: 0,
    frameReadyMs: 0,
    candidateInspectMs: 0,
    selectionReadyMs: 0,
    submitMs: 0,
    completionConfirmMs: 0
  };
  let registrationOutcome: "registered" | "already-registered" | "failed" = "failed";
  let registrationStage: PopbillCertificateRegistrationStage = "browser-launch";
  let activePage: Page | null = null;
  let resolvedCertificateForDebug:
    | {
        certificateIndex: number;
        certificateCn: string;
        certificateKind: "electronic_tax";
        serial: string | null;
        userDN: string | null;
      }
    | null = null;
  const buildTiming = () => ({
    totalMs: Date.now() - timingStartedAt,
    ...timing
  });
  const headless = options.headless;
  const browserUserDataDir = resolvePopbillBrowserUserDataDir({
    headless: options.useTemporaryProfile ? true : headless
  });
  const requestedCertificateCn = input.certificateCn?.trim() ?? "";
  const resolvedCertificatePromise =
    requestedCertificateCn !== ""
      ? Promise.resolve({
          ok: true as const,
          value: {
            certificateIndex: input.certificateIndex,
            certificateCn: requestedCertificateCn,
            certificateKind: input.certificateKind,
            serial: input.serial?.trim() || null,
            userDN: input.userDN?.trim() || null,
            targetExpireDate: normalizePopbillCertificateDateKey(input.targetExpireDate)
          }
        })
      : resolveTargetCertificate(input)
          .then((value) => ({ ok: true as const, value }))
          .catch((error) => ({
            ok: false as const,
            error: error instanceof Error ? error : new Error(String(error))
          }));
  let context: BrowserContext | null = null;
  let localBridgeBaseUrl: string | null = null;

  try {
    const browserLaunchStartedAt = Date.now();
    const launched = await launchBrowserContext(browserUserDataDir.userDataDir, { headless });
    timing.browserLaunchMs = Date.now() - browserLaunchStartedAt;
    context = launched.context;
    registrationStage = "permission";
    const permissionStartedAt = Date.now();
    await tryGrantLocalNetworkAccessPermission(context, input.certificateRegistrationUrl);
    timing.permissionMs = Date.now() - permissionStartedAt;
    for (const existingPage of context.pages()) {
      try {
        await existingPage.close({ runBeforeUnload: true });
      } catch {
        // Ignore stale restored tabs that refuse to close cleanly.
      }
    }
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
    activePage = page;
    const dialogMessages: string[] = [];
    page.on("dialog", (dialog) => {
      dialogMessages.push(dialog.message());
      void dialog.accept();
    });

    registrationStage = "page-load";
    const pageLoadStartedAt = Date.now();
    await page.goto(input.certificateRegistrationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000
    });
    const initialText = await waitForPopbillRegistrationLandingReady(page, dialogMessages);
    timing.pageLoadMs = Date.now() - pageLoadStartedAt;

    await throwIfExpiredTokenVisible(page, dialogMessages);
    registrationStage = "certificate-resolve";
    const certificateResolveStartedAt = Date.now();
    const resolvedCertificateResult = await resolvedCertificatePromise;
    timing.certificateResolveMs = Date.now() - certificateResolveStartedAt;
    if (!resolvedCertificateResult.ok) {
      throw resolvedCertificateResult.error;
    }
    const resolvedCertificate = resolvedCertificateResult.value;
    resolvedCertificateForDebug = {
      certificateIndex: resolvedCertificate.certificateIndex,
      certificateCn: resolvedCertificate.certificateCn,
      certificateKind: resolvedCertificate.certificateKind,
      serial: resolvedCertificate.serial,
      userDN: resolvedCertificate.userDN
    };

    registrationStage = "already-registered-check";
    if (detectAlreadyRegistered(initialText)) {
      registrationOutcome = "already-registered";
      return {
        outcome: "already-registered",
        browserChannel: launched.browserChannel,
        certificateIndex: resolvedCertificate.certificateIndex,
        certificateCn: resolvedCertificate.certificateCn,
        certificateKind: resolvedCertificate.certificateKind,
        serial: resolvedCertificate.serial,
        userDN: resolvedCertificate.userDN,
        targetExpireDate: resolvedCertificate.targetExpireDate,
        localBridgeBaseUrl,
        message: "이미 팝빌 공동인증서가 등록되어 있습니다.",
        timing: buildTiming()
      };
    }

    registrationStage = "section-open";
    const sectionOpenStartedAt = Date.now();
    await openPopbillElectronicTaxCertificateSection(page, dialogMessages);
    timing.sectionOpenMs = Date.now() - sectionOpenStartedAt;
    await throwIfExpiredTokenVisible(page, dialogMessages);

    registrationStage = "frame-ready";
    const frameReadyStartedAt = Date.now();
    const childFrame = await waitForPopbillCertificateSelectionFrame(page, dialogMessages);
    timing.frameReadyMs = Date.now() - frameReadyStartedAt;
    await throwIfExpiredTokenVisible(page, dialogMessages);
    registrationStage = "candidate-inspect";
    const candidateInspectStartedAt = Date.now();
    const frameInspection = await waitForPopbillCertificateCandidate({
      page,
      frame: childFrame,
      dialogMessages,
      resolvedCertificate: {
        certificateCn: resolvedCertificate.certificateCn,
        certificateIndex: resolvedCertificate.certificateIndex,
        serial: resolvedCertificate.serial,
        userDN: resolvedCertificate.userDN,
        targetExpireDate: resolvedCertificate.targetExpireDate
      }
    });
    timing.candidateInspectMs = Date.now() - candidateInspectStartedAt;
    if (frameInspection.visibleMatchCount === 0) {
      const artifact = await writePopbillDebugArtifact({
        stage: "no-visible-cn-match",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        dialogMessages,
        errorMessage: "팝빌 인증서 선택 화면에서 대상 전자세금용 공동인증서를 찾지 못했습니다."
      });
      console.warn(
        `[popbill-cert-registration] no visible CN candidate for ${resolvedCertificate.certificateCn} (index=${resolvedCertificate.certificateIndex}, serial=${resolvedCertificate.serial ?? "-"}, userDN=${resolvedCertificate.userDN ?? "-"}) ${formatPopbillDebugArtifactSummary(artifact)}`
      );
      throw new Error(
        `팝빌 인증서 선택 화면에서 대상 전자세금용 공동인증서를 찾지 못했습니다. ${formatPopbillDebugArtifactSummary(artifact)}`
      );
    }
    const selectionDetailProbes =
      frameInspection.selectedSelector || frameInspection.candidates.length <= 1
        ? []
        : await inspectPopbillCertificateSelectionDetails(childFrame, frameInspection.candidates, {
            certificateIndex: resolvedCertificate.certificateIndex,
            serial: resolvedCertificate.serial,
            userDN: resolvedCertificate.userDN,
            targetExpireDate: resolvedCertificate.targetExpireDate
          });
    const selectedCandidate = pickPopbillCertificateCandidate({
      candidates: frameInspection.candidates,
      selectionDetailProbes,
      targetIndex: resolvedCertificate.certificateIndex,
      targetSerial: resolvedCertificate.serial,
      targetUserDN: resolvedCertificate.userDN,
      targetExpireDate: resolvedCertificate.targetExpireDate
    });
    if (!selectedCandidate.selector) {
      const debugEvidence = describePopbillCandidateEvidence(frameInspection.candidates);
      const selectionDetailEvidence = describePopbillSelectionDetailEvidence(selectionDetailProbes);
      const artifact = await writePopbillDebugArtifact({
        stage: "ambiguous-cn-match",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        dialogMessages,
        errorMessage: "iframe DOM에서 serial/userDN/index와 일치하는 고유 항목을 확인하지 못해 자동 등록을 중단했습니다."
      });
      console.warn(
        `[popbill-cert-registration] ambiguous certificate candidates: ${JSON.stringify(
          {
            certificateCn: resolvedCertificate.certificateCn,
            certificateIndex: resolvedCertificate.certificateIndex,
            serial: resolvedCertificate.serial,
            userDN: resolvedCertificate.userDN,
            visibleMatchCount: frameInspection.visibleMatchCount,
            candidates: frameInspection.candidates,
            selectionDetailProbes,
            artifact
          },
          null,
          2
        )}`
      );
      throw new Error(
        `팝빌 인증서 선택 화면에 같은 인증서명(CN)의 전자세금용 공동인증서가 ${frameInspection.visibleMatchCount}건 보여 자동 등록을 중단했습니다. iframe DOM에서 serial/userDN/index와 일치하는 고유 항목을 확인하지 못했습니다. ${debugEvidence} ${selectionDetailEvidence} ${formatPopbillDebugArtifactSummary(artifact)}`
      );
    }

    console.info(
      `[popbill-cert-registration] selecting ${resolvedCertificate.certificateCn} using ${selectedCandidate.reason ?? frameInspection.selectionReason ?? "CN match"} (${selectedCandidate.selector})`
    );
    registrationStage = "selection-ready";
    const selectionReadyStartedAt = Date.now();
    const selectionActivationState = await ensurePopbillCertificateSelectionReady(
      childFrame,
      selectedCandidate.selector
    );
    timing.selectionReadyMs = Date.now() - selectionReadyStartedAt;
    if (!isPopbillSelectionReady(selectionActivationState)) {
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        selectionActivationState,
        dialogMessages,
        errorMessage: "팝빌 인증서 선택 후 비밀번호 입력창이 활성화되지 않았습니다."
      });
      throw new Error(
        `팝빌 인증서 선택 후 비밀번호 입력창이 활성화되지 않았습니다. ${formatPopbillDebugArtifactSummary(artifact)}`
      );
    }

    registrationStage = "password-fill";
    try {
      await fillPopbillCertificatePassword(childFrame, input.certificatePassword);
    } catch (error) {
      const latestSelectionActivationState = await readPopbillSelectionActivationState(childFrame).catch(
        () => selectionActivationState
      );
      const refreshedSelectionActivationState = await readPopbillSelectionActivationState(
        childFrame,
        selectedCandidate.selector
      ).catch(() => latestSelectionActivationState);
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        selectionActivationState: refreshedSelectionActivationState,
        dialogMessages,
        errorMessage:
          error instanceof Error
            ? error.message
            : "팝빌 인증서 비밀번호 입력 단계에서 알 수 없는 오류가 발생했습니다."
      });
      throw new Error(
        `${error instanceof Error ? error.message : "팝빌 인증서 비밀번호 입력 단계에서 알 수 없는 오류가 발생했습니다."} ${formatPopbillDebugArtifactSummary(artifact)}`
      );
    }

    registrationStage = "submit";
    const registrationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/__API_V1__/Taxinvoice/Preference/Certificate"),
      { timeout: 30_000 }
    );
    const submitStartedAt = Date.now();
    await submitPopbillCertificateSelection(childFrame);
    const responseObservedAfterClick = await Promise.race([
      registrationResponse.then(() => true).catch(() => false),
      page.waitForTimeout(1_500).then(() => false)
    ]);
    if (!responseObservedAfterClick) {
      await pressPopbillCertificatePasswordEnter(childFrame);
      await submitPopbillCertificateSelection(childFrame);
    }
    try {
      await registrationResponse;
    } catch {
      const frameText = await childFrame.locator("body").innerText().catch(() => "");
      const registrationSignals = [frameText, ...dialogMessages].filter((message) => message.trim() !== "").join("\n");
      const resolvedError =
        extractRegistrationError(registrationSignals) ??
        "팝빌 인증서 등록 요청을 확인하지 못했습니다. 확인 버튼 클릭 후 서버 요청이 전송되지 않았습니다.";
      const refreshedSelectionActivationState = await readPopbillSelectionActivationState(
        childFrame,
        selectedCandidate.selector
      ).catch(() => null);
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        selectionActivationState: refreshedSelectionActivationState,
        dialogMessages,
        errorMessage: resolvedError
      });
      throw new Error(`${resolvedError} ${formatPopbillDebugArtifactSummary(artifact)}`);
    }
    timing.submitMs = Date.now() - submitStartedAt;

    registrationStage = "completion-confirm";
    const completionConfirmStartedAt = Date.now();
    try {
      await waitForPageText(page, "인증서가 등록", 30_000);
    } catch {
      const frameText = await childFrame.locator("body").innerText().catch(() => "");
      const registrationSignals = [frameText, ...dialogMessages].filter((message) => message.trim() !== "").join("\n");
      const resolvedError = extractRegistrationError(registrationSignals) ?? "팝빌 인증서 등록 완료를 확인하지 못했습니다.";
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        dialogMessages,
        errorMessage: resolvedError
      });
      throw new Error(`${resolvedError} ${formatPopbillDebugArtifactSummary(artifact)}`);
    }
    timing.completionConfirmMs = Date.now() - completionConfirmStartedAt;

    registrationOutcome = "registered";
    return {
      outcome: "registered",
      browserChannel: launched.browserChannel,
      certificateIndex: resolvedCertificate.certificateIndex,
      certificateCn: resolvedCertificate.certificateCn,
      certificateKind: resolvedCertificate.certificateKind,
      serial: resolvedCertificate.serial,
      userDN: resolvedCertificate.userDN,
      targetExpireDate: resolvedCertificate.targetExpireDate,
      localBridgeBaseUrl,
      message: "팝빌 공동인증서 등록을 완료했습니다.",
      timing: buildTiming()
    };
  } catch (error) {
    if (error instanceof PopbillCertificateRegistrationError) {
      throw error;
    }
    let errorMessage =
      error instanceof Error ? error.message : "팝빌 공동인증서 등록 중 알 수 없는 오류가 발생했습니다.";
    if (
      activePage &&
      resolvedCertificateForDebug &&
      (registrationStage === "section-open" || registrationStage === "frame-ready")
    ) {
      const artifactStage: PopbillDebugArtifactStage =
        registrationStage === "section-open" ? "section-open-failed" : "frame-ready-failed";
      const artifact = await writePopbillDebugArtifact({
        stage: artifactStage,
        page: activePage,
        frame: findPopbillCertificateSelectionFrame(activePage),
        resolvedCertificate: resolvedCertificateForDebug,
        errorMessage,
        dialogMessages: []
      }).catch(() => null);
      if (artifact) {
        errorMessage = `${errorMessage} ${formatPopbillDebugArtifactSummary(artifact)}`;
      }
    }
    throw new PopbillCertificateRegistrationError(
      errorMessage,
      {
        stage: registrationStage,
        timing: buildTiming(),
        cause: error
      }
    );
  } finally {
    console.info(
      `[popbill-cert-registration-timing] outcome=${registrationOutcome} stage=${registrationStage} totalMs=${Date.now() - timingStartedAt} browserLaunchMs=${timing.browserLaunchMs} permissionMs=${timing.permissionMs} pageLoadMs=${timing.pageLoadMs} certificateResolveMs=${timing.certificateResolveMs} sectionOpenMs=${timing.sectionOpenMs} frameReadyMs=${timing.frameReadyMs} candidateInspectMs=${timing.candidateInspectMs} selectionReadyMs=${timing.selectionReadyMs} submitMs=${timing.submitMs} completionConfirmMs=${timing.completionConfirmMs}`
    );
    if (context) {
      await context.close().catch(() => undefined);
    }
    if (browserUserDataDir.cleanupAfterClose) {
      await fs.promises.rm(browserUserDataDir.userDataDir, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 100
      }).catch(() => undefined);
    }
  }
}

async function registerPopbillCertificateDirect(
  input: PopbillCertificateRegistrationInput
): Promise<PopbillCertificateRegistrationResult> {
  const timingStartedAt = Date.now();
  const timing = {
    browserLaunchMs: 0,
    permissionMs: 0,
    pageLoadMs: 0,
    certificateResolveMs: 0,
    sectionOpenMs: 0,
    frameReadyMs: 0,
    candidateInspectMs: 0,
    selectionReadyMs: 0,
    submitMs: 0,
    completionConfirmMs: 0
  };
  let registrationStage: PopbillCertificateRegistrationStage = "direct-session";
  const buildTiming = () => ({
    totalMs: Date.now() - timingStartedAt,
    ...timing
  });

  try {
    registrationStage = "certificate-resolve";
    const certificateResolveStartedAt = Date.now();
    const requestedCertificateCn = input.certificateCn?.trim() ?? "";
    const resolvedCertificate =
      requestedCertificateCn !== ""
        ? {
            certificateIndex: input.certificateIndex,
            certificateCn: requestedCertificateCn,
            certificateKind: input.certificateKind,
            serial: input.serial?.trim() || null,
            userDN: input.userDN?.trim() || null,
            targetExpireDate: normalizePopbillCertificateDateKey(input.targetExpireDate)
          }
        : await resolveTargetCertificate(input);
    timing.certificateResolveMs = Date.now() - certificateResolveStartedAt;

    registrationStage = "candidate-inspect";
    const directCandidateStartedAt = Date.now();
    const candidates = await collectPopbillDirectMagicLineCandidates();
    const picked = pickPopbillDirectMagicLineCandidate(candidates, resolvedCertificate);
    timing.candidateInspectMs = Date.now() - directCandidateStartedAt;
    if (!picked.candidate) {
      throw new Error(
        `팝빌 MagicLine4NX 직접 목록에서 대상 공동인증서를 고유하게 찾지 못했습니다. (${picked.reason ?? "no match"})`
      );
    }

    registrationStage = "direct-session";
    const sessionStartedAt = Date.now();
    const popupSession = await resolvePopbillDirectPopupSession(input.certificateRegistrationUrl);
    timing.pageLoadMs = Date.now() - sessionStartedAt;

    registrationStage = "direct-token";
    const tokenStartedAt = Date.now();
    const exchangedToken = await exchangePopbillPopupToken(popupSession);
    timing.permissionMs = Date.now() - tokenStartedAt;

    const businessNumber = normalizePopbillBusinessNumber(input.businessNumber) ?? exchangedToken.businessNumber;
    if (!businessNumber) {
      throw new Error("팝빌 공동인증서 직접 등록에 필요한 고객 사업자번호를 확인하지 못했습니다.");
    }

    registrationStage = "candidate-inspect";
    const candidateInspectStartedAt = Date.now();
    const loginDataKmCert = await resolvePopbillLoginDataKmCert(popupSession);
    timing.candidateInspectMs += Date.now() - candidateInspectStartedAt;

    registrationStage = "selection-ready";
    const selectionReadyStartedAt = Date.now();
    const headlessPayload = await buildPopbillMagicLineHeadlessCertificatePayload(
      resolvedCertificate,
      picked.candidate,
      input.certificatePassword,
      businessNumber,
      loginDataKmCert
    );
    timing.selectionReadyMs = Date.now() - selectionReadyStartedAt;

    registrationStage = "direct-submit";
    const submitStartedAt = Date.now();
    const outcome = await postPopbillDirectCertificatePayload({
      accessToken: exchangedToken.accessToken,
      cookieHeader: exchangedToken.cookieHeader,
      certificateRegistrationUrl: input.certificateRegistrationUrl,
      referrerUrl: popupSession.referrerUrl,
      payload: headlessPayload.payload
    });
    timing.submitMs = Date.now() - submitStartedAt;

    return {
      outcome,
      browserChannel: headlessPayload.browserChannel,
      certificateIndex: resolvedCertificate.certificateIndex,
      certificateCn: resolvedCertificate.certificateCn,
      certificateKind: resolvedCertificate.certificateKind,
      serial: headlessPayload.candidate.serial ?? resolvedCertificate.serial,
      userDN: headlessPayload.candidate.userDN ?? resolvedCertificate.userDN,
      targetExpireDate: headlessPayload.candidate.targetExpireDate ?? resolvedCertificate.targetExpireDate,
      localBridgeBaseUrl: `https://127.0.0.1:${POPBILL_MAGICLINE_PORT}`,
      message:
        outcome === "already-registered"
          ? "이미 팝빌 공동인증서가 등록되어 있습니다."
          : "팝빌 공동인증서 등록을 완료했습니다.",
      timing: buildTiming()
    };
  } catch (error) {
    if (error instanceof PopbillCertificateRegistrationError) {
      throw error;
    }
    throw new PopbillCertificateRegistrationError(
      error instanceof Error ? error.message : "팝빌 공동인증서 직접 등록 중 알 수 없는 오류가 발생했습니다.",
      {
        stage: registrationStage,
        timing: buildTiming(),
        cause: error
      }
    );
  } finally {
    console.info(
      `[popbill-cert-registration-timing] outcome=direct stage=${registrationStage} totalMs=${Date.now() - timingStartedAt} certificateResolveMs=${timing.certificateResolveMs} candidateInspectMs=${timing.candidateInspectMs} selectionReadyMs=${timing.selectionReadyMs} popupSessionMs=${timing.pageLoadMs} tokenMs=${timing.permissionMs} submitMs=${timing.submitMs}`
    );
  }
}

function isOperatorActionPopbillCertificateRegistrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
  return /비밀번호|암호|사업자번호|만료된 공동인증서|공동인증서가 만료|만료된공동인증서|공동인증서와 회원의 사업자번호가 일치하지 않습니다|인증서 비밀번호|인증서 등록 URL이 만료|등록 URL이 만료|만료된토큰|토큰이만료/.test(
    message
  );
}

function shouldFallbackFromDirectPopbillCertificateRegistration(error: unknown): boolean {
  return !isOperatorActionPopbillCertificateRegistrationError(error);
}

export async function registerPopbillCertificate(
  input: PopbillCertificateRegistrationInput
): Promise<PopbillCertificateRegistrationResult> {
  if (input.browserMode === "direct") {
    return await registerPopbillCertificateDirect(input);
  }

  if (input.browserMode === "visible") {
    return await registerPopbillCertificateWithBrowserMode(input, {
      headless: false,
      useTemporaryProfile: true
    });
  }

  if (input.browserMode === "headless") {
    return await registerPopbillCertificateWithBrowserMode(input, {
      headless: true
    });
  }

  try {
    return await registerPopbillCertificateDirect(input);
  } catch (error) {
    if (!shouldFallbackFromDirectPopbillCertificateRegistration(error)) {
      throw error;
    }
    console.warn(
      `[popbill-cert-registration] direct registration unavailable; falling back to browser compatibility mode: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const primaryHeadless = isPopbillHelperHeadlessEnabled();
  return await registerPopbillCertificateWithBrowserMode(input, {
    headless: primaryHeadless
  });
}
