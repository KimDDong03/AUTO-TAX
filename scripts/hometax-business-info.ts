import process from "node:process";
import https from "node:https";
import { TextDecoder } from "node:util";
import { sanitizeSensitiveText } from "../server/src/utils.js";
import type { RenewalInfoSnapshot } from "../server/src/domain.js";
import type { Browser, BrowserContext, Frame, Page } from "playwright";

const DEFAULT_EXTERNAL_REQUEST_TIMEOUT_MS = 10_000;
const HOMETAX_ORIGIN = "https://hometax.go.kr";
const HOMETAX_HT_ORIGIN = "https://teht.hometax.go.kr";
const HOMETAX_MAGICLINE_PORT = 42235;
const HOMETAX_MAGICLINE_CONFIG_URL =
  "https://hometax.go.kr/NTSMagicLine4Web/ML4Web/js/ML4Web_Config.js";
const HOMETAX_MAGICLINE_CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;
const HOMETAX_MAGICLINE_SESSION_TIMEOUT = "60";
const HOMETAX_MAGICLINE_CHILD_FRAME_URL_MARKER =
  "/NTSMagicLine4Web/ML4Web/Child.html";
const HOMETAX_MAGICLINE_BROWSER_TIMEOUT_MS = 90_000;
const HOMETAX_MAGICLINE_FRAME_TIMEOUT_MS = 10_000;
const HOMETAX_MAGICLINE_AUTH_TIMEOUT_MS = 60_000;
const HOMETAX_MAGICLINE_DIALOG_OPEN_ATTEMPTS = 2;
const HOMETAX_MAGICLINE_TASK_SETTLE_MS = 250;
const HOMETAX_TAXPAYER_BASIC_ADDRESS_SETTLE_MS = 500;
const HOMETAX_LOGIN_SCREEN_ID = "index3";
const HOMETAX_LOGIN_REFERER = `${HOMETAX_ORIGIN}/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3`;
const HOMETAX_MAIN_DOMAIN = "hometax.go.kr";
const HOMETAX_TAXPAYER_BASIC_SCREEN_ID = "UTEABHAA19";
const HOMETAX_TAXPAYER_BASIC_ACTION_ID = "ATTABZAA001R01";
const HOMETAX_BUSINESS_BASIC_ACTION_ID = "ATTABZAA001R02";
const HOMETAX_TAXPAYER_BASIC_ACTION_IDS = new Set([
  HOMETAX_TAXPAYER_BASIC_ACTION_ID,
  HOMETAX_BUSINESS_BASIC_ACTION_ID,
]);
const HOMETAX_TAXPAYER_BASIC_REFERER = `${HOMETAX_ORIGIN}/websquare/websquare.html?w2xPath=/ui/comm/a/b/UTEABHAA19.xml`;
const HOMETAX_BROWSER_CHANNEL_CANDIDATES = (() => {
  const configured = (process.env.AUTO_TAX_HOMETAX_HELPER_BROWSER_CHANNEL ?? "")
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

export type HomeTaxCertificateSummary = {
  index: string;
  cn: string;
  issuerToName: string;
  usageToName: string;
  todate: string | null;
  oid: string | null;
  serial: string | null;
  userDN: string | null;
  validateFrom: string | null;
  detailValidateTo: string | null;
  certDirPath: string | null;
  listSource?:
    | "bridge-hdd"
    | "ml4web-hdd"
    | "ml4web-web"
    | "ml4web-web-kftc"
    | "upload-session";
  supportsPreflight?: boolean;
};

export type HomeTaxMagicLineRawCertificateCandidate = {
  certificate: HomeTaxCertificateSummary;
  rawEntry: Record<string, unknown>;
  storageRawCertIdx: Record<string, unknown>;
  storageName: string;
  listSource: "bridge-hdd" | "ml4web-hdd" | "ml4web-web" | "ml4web-web-kftc";
};

export type HomeTaxBusinessInfoLookupRequest = {
  certificateIndex: number;
  certificateCn?: string | null;
  certificatePassword?: string | null;
  serial?: string | null;
  userDN?: string | null;
};

export type CertificateBusinessInfoLookupSource = "signgate" | "hometax";

export type CertificateBusinessInfoLookupStatus =
  | "complete"
  | "missing-address"
  | "unsupported"
  | "password-error"
  | "certificate-not-found"
  | "hometax-not-registered"
  | "lookup-failed";

export type CertificateBusinessInfoLookupStage =
  | "signgate-preflight"
  | "magicline-list"
  | "certificate-match"
  | "hometax-challenge"
  | "magicline-sign"
  | "hometax-login"
  | "business-info";

export type CertificateBusinessInfoLookupResult = {
  ok: boolean;
  source: CertificateBusinessInfoLookupSource;
  status?: CertificateBusinessInfoLookupStatus;
  stage: CertificateBusinessInfoLookupStage;
  certificateIndex: string | null;
  certificateCn: string | null;
  sourcePort: number | null;
  loginCode: string | null;
  businessInfoSnapshot: RenewalInfoSnapshot | null;
  message: string | null;
  error: string | null;
};

export type HomeTaxBusinessInfoLookupResult = CertificateBusinessInfoLookupResult & {
  source: "hometax";
};

export type HomeTaxBusinessInfoLookupHandler = (
  request: HomeTaxBusinessInfoLookupRequest,
) => Promise<HomeTaxBusinessInfoLookupResult>;

class HomeTaxMagicLineDialogOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HomeTaxMagicLineDialogOpenError";
  }
}

function resolveExternalRequestTimeoutMs(): number {
  const raw = process.env.AUTO_TAX_RENEWAL_AGENT_EXTERNAL_TIMEOUT_MS;
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
  timeoutMs = resolveExternalRequestTimeoutMs(),
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEmptyRenewalInfoSnapshot(): RenewalInfoSnapshot {
  return {
    companyName: null,
    businessNumber: null,
    ceoName: null,
    bizType: null,
    bizClass: null,
    businessFieldCode: null,
    postalCode: null,
    baseAddress: null,
    detailAddress: null,
    contactName: null,
    contactDepartment: null,
    contactEmail: null,
    contactTel: null,
    contactFax: null,
    contactMobile: null,
  };
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function snapshotHasAddress(snapshot: RenewalInfoSnapshot | null): boolean {
  return Boolean(snapshot?.baseAddress?.trim() || snapshot?.detailAddress?.trim());
}

function resolveSuccessfulBusinessInfoStatus(
  snapshot: RenewalInfoSnapshot | null,
): CertificateBusinessInfoLookupStatus {
  return snapshotHasAddress(snapshot) ? "complete" : "missing-address";
}

function classifyHomeTaxBusinessInfoFailureStatus(
  stage: CertificateBusinessInfoLookupStage,
  message: string,
): CertificateBusinessInfoLookupStatus {
  const normalized = message.toLowerCase();
  if (
    message.includes("비밀번호") ||
    message.includes("암호") ||
    normalized.includes("password") ||
    normalized.includes("passwd") ||
    normalized.includes("pwd") ||
    normalized.includes("375848960")
  ) {
    return "password-error";
  }

  if (stage === "certificate-match") {
    return "certificate-not-found";
  }

  if (
    message.includes("ETINFZ0109") ||
    message.includes("홈택스에 등록된 인증서가 아닙니다") ||
    message.includes("홈택스에 등록되지 않은 인증서")
  ) {
    return "hometax-not-registered";
  }

  return "lookup-failed";
}

function buildHomeTaxBusinessInfoLookupFailure(
  request: HomeTaxBusinessInfoLookupRequest,
  stage: CertificateBusinessInfoLookupStage,
  message: string,
  options?: {
    certificateIndex?: string | null;
    certificateCn?: string | null;
    sourcePort?: number | null;
    loginCode?: string | null;
  },
): HomeTaxBusinessInfoLookupResult {
  return {
    ok: false,
    source: "hometax",
    status: classifyHomeTaxBusinessInfoFailureStatus(stage, message),
    stage,
    certificateIndex:
      options?.certificateIndex ?? String(request.certificateIndex ?? ""),
    certificateCn: options?.certificateCn ?? request.certificateCn ?? null,
    sourcePort: options?.sourcePort ?? HOMETAX_MAGICLINE_PORT,
    loginCode: options?.loginCode ?? null,
    businessInfoSnapshot: null,
    message: null,
    error: sanitizeSensitiveText(message),
  };
}

function normalizeHomeTaxCertificateMatchKey(
  value: string | null | undefined,
): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findHomeTaxMagicLineCandidate(
  candidates: HomeTaxMagicLineRawCertificateCandidate[],
  request: HomeTaxBusinessInfoLookupRequest,
): HomeTaxMagicLineRawCertificateCandidate | null {
  const hddCandidates = candidates.filter((candidate) => candidate.storageName === "hdd");
  const requestedIndex = String(request.certificateIndex ?? "").trim();
  const requestedCn = normalizeHomeTaxCertificateMatchKey(request.certificateCn);
  const requestedSerial = normalizeHomeTaxCertificateMatchKey(request.serial);
  const requestedUserDn = normalizeHomeTaxCertificateMatchKey(request.userDN);

  const identityMatched =
    hddCandidates.find((candidate) => {
      const certificate = candidate.certificate;
      return (
        requestedSerial !== "" &&
        normalizeHomeTaxCertificateMatchKey(certificate.serial) ===
          requestedSerial
      );
    }) ??
    hddCandidates.find((candidate) => {
      const certificate = candidate.certificate;
      return (
        requestedUserDn !== "" &&
        normalizeHomeTaxCertificateMatchKey(certificate.userDN) ===
          requestedUserDn
      );
    }) ??
    hddCandidates.find((candidate) => {
      const certificate = candidate.certificate;
      return (
        requestedCn !== "" &&
        normalizeHomeTaxCertificateMatchKey(certificate.cn) === requestedCn
      );
    }) ??
    null;
  if (identityMatched || requestedSerial || requestedUserDn || requestedCn) {
    return identityMatched;
  }

  return (
    hddCandidates.find((candidate) => {
      const certificate = candidate.certificate;
      return (
        requestedIndex !== "" &&
        normalizeHomeTaxCertificateMatchKey(certificate.index) ===
          requestedIndex
      );
    }) ??
    null
  );
}

let homeTaxMagicLineBrowserQueue: Promise<void> = Promise.resolve();
let reusableHomeTaxMagicLineBrowser:
  | {
      browser: Browser;
      browserChannel: string;
      headless: boolean;
    }
  | null = null;

async function runHomeTaxMagicLineBrowserTask<T>(
  task: () => Promise<T>,
): Promise<T> {
  const previousTask = homeTaxMagicLineBrowserQueue;
  let releaseCurrentTask: () => void = () => {};
  homeTaxMagicLineBrowserQueue = new Promise<void>((resolve) => {
    releaseCurrentTask = resolve;
  });

  await previousTask.catch(() => undefined);
  try {
    return await task();
  } finally {
    await delay(HOMETAX_MAGICLINE_TASK_SETTLE_MS);
    releaseCurrentTask();
  }
}

async function getReusableHomeTaxMagicLineBrowser(): Promise<{
  browser: Browser;
  browserChannel: string;
}> {
  const headless = process.env.AUTO_TAX_HOMETAX_HELPER_HEADLESS !== "0";
  if (reusableHomeTaxMagicLineBrowser) {
    try {
      if (
        reusableHomeTaxMagicLineBrowser.headless === headless &&
        reusableHomeTaxMagicLineBrowser.browser.isConnected()
      ) {
        return reusableHomeTaxMagicLineBrowser;
      }
    } catch {
      // Recreate the browser below when the previous Playwright browser is stale.
    }
    await reusableHomeTaxMagicLineBrowser.browser.close().catch(() => undefined);
    reusableHomeTaxMagicLineBrowser = null;
  }

  const { chromium } = await import("playwright");
  const errors: string[] = [];

  for (const browserChannel of HOMETAX_BROWSER_CHANNEL_CANDIDATES) {
    try {
      const browser = await chromium.launch({
        channel: browserChannel,
        headless,
        args: ["--allow-insecure-localhost"],
      });
      reusableHomeTaxMagicLineBrowser = {
        browser,
        browserChannel,
        headless,
      };
      browser.on("disconnected", () => {
        if (reusableHomeTaxMagicLineBrowser?.browser === browser) {
          reusableHomeTaxMagicLineBrowser = null;
        }
      });
      return reusableHomeTaxMagicLineBrowser;
    } catch (error) {
      errors.push(
        `${browserChannel}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throw new Error(`홈택스 조회용 브라우저 실행에 실패했습니다.\n${errors.join("\n")}`);
}

async function openHomeTaxMagicLineBrowserContext(): Promise<{
  context: BrowserContext;
  browserChannel: string;
}> {
  const { browser, browserChannel } = await getReusableHomeTaxMagicLineBrowser();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  return { context, browserChannel };
}

export function warmHomeTaxBusinessInfoBrowser(): void {
  void getReusableHomeTaxMagicLineBrowser().catch(() => undefined);
}

async function waitForHomeTaxMagicLineChildFrame(
  page: Page,
): Promise<Frame> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < HOMETAX_MAGICLINE_FRAME_TIMEOUT_MS) {
    const frame = page
      .frames()
      .find((candidateFrame) =>
        candidateFrame.url().includes(HOMETAX_MAGICLINE_CHILD_FRAME_URL_MARKER),
      );
    if (frame) {
      try {
        await frame
          .locator("#ML_window")
          .waitFor({ state: "visible", timeout: 2_000 });
        return frame;
      } catch {
        // The child frame is attached before the MagicLine dialog finishes rendering.
      }
    }
    await delay(250);
  }

  throw new HomeTaxMagicLineDialogOpenError(
    "홈택스 인증서 선택창을 찾지 못했습니다.",
  );
}

function summarizeHomeTaxMagicLineFrameError(frameText: string): string | null {
  const normalized = frameText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("인증서 비밀번호가 맞지않습니다") ||
    normalized.includes("비밀번호가 맞지 않습니다") ||
    normalized.includes("WRONGPASSWORD")
  ) {
    return "홈택스 인증서 비밀번호가 맞지 않습니다.";
  }
  if (normalized.includes("전자서명값 생성에 실패")) {
    return "홈택스 인증서 전자서명값 생성에 실패했습니다.";
  }
  if (normalized.includes("인증서 선택창이 닫힙니다")) {
    return "홈택스 인증서 비밀번호 오류 횟수 제한에 도달했습니다.";
  }
  return null;
}

async function waitForHomeTaxMagicLineAuthResult(
  page: Page,
  childFrame: Frame,
): Promise<{ code: string; resultMsg: string; selectMedia: string }> {
  try {
    await page.waitForFunction(
      () => {
        const value = (
          window as typeof window & {
            __autoTaxHomeTaxAuthResult?: unknown;
          }
        ).__autoTaxHomeTaxAuthResult;
        return value !== null && value !== undefined;
      },
      null,
      { timeout: HOMETAX_MAGICLINE_AUTH_TIMEOUT_MS },
    );
  } catch (error) {
    const frameText = await childFrame
      .locator("body")
      .innerText({ timeout: 2_000 })
      .catch(() => "");
    throw new Error(
      summarizeHomeTaxMagicLineFrameError(frameText) ??
        (error instanceof Error
          ? `홈택스 인증서 전자서명 응답 시간이 초과되었습니다. ${error.message}`
          : "홈택스 인증서 전자서명 응답 시간이 초과되었습니다."),
    );
  }

  const authResult = await page.evaluate(() => {
    const value = (
      window as typeof window & {
        __autoTaxHomeTaxAuthResult?: {
          code?: unknown;
          resultMsg?: unknown;
          selectMedia?: unknown;
        };
      }
    ).__autoTaxHomeTaxAuthResult;
    return {
      code: String(value?.code ?? ""),
      resultMsg: String(value?.resultMsg ?? ""),
      selectMedia: String(value?.selectMedia ?? ""),
    };
  });

  if (authResult.code !== "0" || authResult.resultMsg.length < 30) {
    throw new Error(
      authResult.resultMsg ||
        `홈택스 인증서 전자서명 응답이 성공 상태가 아닙니다. (${authResult.code || "unknown"})`,
    );
  }

  return authResult;
}

async function readHomeTaxMagicLineUiApiString(
  page: Page,
  methodName: "tranx2PEM" | "getRandomfromPrivateKey",
  failureMessage: string,
): Promise<string> {
  const result = await page.evaluate((name) => {
    const magicline = (
      window as typeof window & {
        magicline?: {
          uiapi?: Record<
            string,
            (callback: (code: unknown, resultMsg: unknown) => void) => void
          >;
        };
      }
    ).magicline;
    const method = magicline?.uiapi?.[name];
    if (typeof method !== "function") {
      return {
        code: "missing",
        resultMsg: "",
      };
    }
    return new Promise<{ code: string; resultMsg: string }>((resolve) => {
      method((code, resultMsg) => {
        resolve({
          code: String(code ?? ""),
          resultMsg: String(resultMsg ?? ""),
        });
      });
    });
  }, methodName);

  if (result.code !== "0" || !result.resultMsg.trim()) {
    throw new Error(
      result.resultMsg ||
        `${failureMessage} (${result.code || "unknown"})`,
    );
  }

  return result.resultMsg;
}

async function openHomeTaxMagicLineAuthFrame(
  page: Page,
  pkcEncSsn: string,
): Promise<Frame> {
  await page.goto(HOMETAX_LOGIN_REFERER, {
    waitUntil: "domcontentloaded",
    timeout: HOMETAX_MAGICLINE_BROWSER_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () =>
      Boolean(
        (
          window as typeof window & {
            magicline?: {
              uiapi?: { ntsCertAuth?: unknown };
            };
          }
        ).magicline?.uiapi?.ntsCertAuth,
      ),
    null,
    { timeout: HOMETAX_MAGICLINE_BROWSER_TIMEOUT_MS },
  );
  await page.evaluate((challengeValue) => {
    const typedWindow = window as typeof window & {
      __autoTaxHomeTaxAuthResult?: unknown;
      magicline?: {
        uiapi?: {
          ntsCertAuth?: (
            message: string,
            option: unknown,
            callback: (
              code: unknown,
              resultMsg: unknown,
              selectMedia: unknown,
            ) => void,
          ) => void;
        };
      };
    };
    typedWindow.__autoTaxHomeTaxAuthResult = null;
    typedWindow.magicline?.uiapi?.ntsCertAuth?.(
      challengeValue,
      null,
      (code, resultMsg, selectMedia) => {
        typedWindow.__autoTaxHomeTaxAuthResult = {
          code,
          resultMsg: String(resultMsg ?? ""),
          selectMedia: String(selectMedia ?? ""),
        };
      },
    );
  }, pkcEncSsn);

  return await waitForHomeTaxMagicLineChildFrame(page);
}

type HomeTaxMagicLineSelectAndSignOptions = {
  certificateCn: string | null;
  certificateIndex: string | null;
  certificatePassword: string;
  serial: string | null;
  storageCertIdx: string | null;
  userDN: string | null;
};

function buildHomeTaxMagicLineSelectAndSignScript(
  options: HomeTaxMagicLineSelectAndSignOptions,
): string {
  const serializedOptions = JSON.stringify(options).replace(/</g, "\\u003c");
  return `(() => {
    const options = ${serializedOptions};
    const magicWindow = window;
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLowerCase();
    const extractDnAttribute = (value, attributeName) => {
      const normalizedAttribute = String(attributeName).toLowerCase();
      for (const part of String(value ?? "").split(",")) {
        const pieces = part.split("=");
        const rawKey = pieces.shift();
        if (rawKey && rawKey.trim().toLowerCase() === normalizedAttribute && pieces.length > 0) {
          return pieces.join("=").trim();
        }
      }
      return "";
    };
    const parseStorageEncCertIdx = (value) => {
      if (typeof value !== "string" || !value.trim().startsWith("{")) {
        return null;
      }
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    };
    const callSelectStorage = (storageName) =>
      new Promise((resolve) => {
        magicWindow.ML4WebApi.selectStorageInfo(storageName, (code, obj) =>
          resolve({ code, obj })
        );
      });
    const callGetCertList = (certOpt) =>
      new Promise((resolve) => {
        magicWindow.ML4WebApi.getStorageCertList(certOpt, (code, obj) =>
          resolve({ code, obj })
        );
      });

    return (async () => {
      const selectResult = await callSelectStorage("hdd");
      if (String(selectResult.code) !== "0") {
        const errorMessage =
          typeof selectResult.obj?.errMsg === "string"
            ? selectResult.obj.errMsg
            : "홈택스 인증서 HDD 저장소 선택에 실패했습니다.";
        throw new Error(errorMessage);
      }

      magicWindow.selectMedia = "hdd";
      const hddOptions = Array.isArray(selectResult.obj?.hddOpt)
        ? selectResult.obj.hddOpt
        : [{}];
      const certificates = [];
      const errors = [];
      for (const hddOpt of hddOptions) {
        const listResult = await callGetCertList({
          storageName: "hdd",
          hddOpt,
        });
        if (String(listResult.code) === "0") {
          certificates.push(...(listResult.obj?.cert_list ?? []));
          continue;
        }
        const message =
          typeof listResult.obj?.errMsg === "string"
            ? listResult.obj.errMsg
            : "code=" + String(listResult.code);
        errors.push(message);
      }

      if (certificates.length === 0) {
        throw new Error(errors[0] ?? "홈택스 인증서 HDD 목록을 읽지 못했습니다.");
      }

      const reference = {
        serial: normalize(options.serial),
        userDN: normalize(options.userDN),
        certificateCn: normalize(options.certificateCn),
        certificateIndex: normalize(options.certificateIndex),
        storageCertIdx: normalize(options.storageCertIdx),
      };
      const getStorageCertIdx = (certificate) => {
        const parsed = parseStorageEncCertIdx(certificate.storageEncCertIdx);
        return normalize(parsed?.storageCertIdx);
      };
      const matches = (certificate) => {
        const serial = normalize(certificate.serialnum);
        const subjectName = normalize(certificate.subjectname);
        const cn = normalize(
          extractDnAttribute(certificate.subjectname, "cn") ||
            certificate.realname
        );
        const realname = normalize(certificate.realname);
        const subkeyId = normalize(certificate.subkeyid);
        const storageCertIdx = getStorageCertIdx(certificate);

        return (
          (reference.serial && serial === reference.serial) ||
          (reference.userDN && subjectName === reference.userDN) ||
          (reference.certificateCn && cn === reference.certificateCn) ||
          (reference.certificateCn && subjectName.includes(reference.certificateCn)) ||
          (reference.certificateCn && realname === reference.certificateCn) ||
          (reference.certificateIndex && subkeyId === reference.certificateIndex) ||
          (reference.storageCertIdx && storageCertIdx === reference.storageCertIdx)
        );
      };
      const selectedCertificate = certificates.find(matches);
      if (!selectedCertificate) {
        throw new Error("홈택스 인증서 선택창 목록에서 선택한 공동인증서를 찾지 못했습니다.");
      }

      magicWindow.ML4WebApi.saveSelectCert(selectedCertificate);
      magicWindow.proceedCert(
        "MakeSignData",
        selectedCertificate,
        options.certificatePassword,
        "hdd"
      );
    })();
  })()`;
}

async function buildHomeTaxMagicLineLoginMaterial(
  candidate: HomeTaxMagicLineRawCertificateCandidate,
  certificatePassword: string,
  pkcEncSsn: string,
): Promise<{
  logSgnt: string;
  cert: string;
  randomEnc: string;
  storageName: string;
}> {
  return await runHomeTaxMagicLineBrowserTask(async () => {
    const { context } = await openHomeTaxMagicLineBrowserContext();
    try {
      return await buildHomeTaxMagicLineLoginMaterialInContext(
        context,
        candidate,
        certificatePassword,
        pkcEncSsn,
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  });
}

async function buildHomeTaxMagicLineLoginMaterialInContext(
  context: BrowserContext,
  candidate: HomeTaxMagicLineRawCertificateCandidate,
  certificatePassword: string,
  pkcEncSsn: string,
): Promise<{
  logSgnt: string;
  cert: string;
  randomEnc: string;
  storageName: string;
}> {
  let page: Page | null = null;
  let childFrame: Frame | null = null;
  try {
    for (let attempt = 1; attempt <= HOMETAX_MAGICLINE_DIALOG_OPEN_ATTEMPTS; attempt += 1) {
      page = await context.newPage();
      try {
        childFrame = await openHomeTaxMagicLineAuthFrame(page, pkcEncSsn);
        break;
      } catch (error) {
        const shouldRetry =
          error instanceof HomeTaxMagicLineDialogOpenError &&
          attempt < HOMETAX_MAGICLINE_DIALOG_OPEN_ATTEMPTS;
        if (!shouldRetry) {
          throw error;
        }
        await page.close().catch(() => undefined);
        page = null;
        await delay(HOMETAX_MAGICLINE_TASK_SETTLE_MS);
      }
    }
    if (!page || !childFrame) {
      throw new HomeTaxMagicLineDialogOpenError(
        "홈택스 인증서 선택창을 찾지 못했습니다.",
      );
    }

    await childFrame.evaluate(
      buildHomeTaxMagicLineSelectAndSignScript({
        certificateCn: candidate.certificate.cn,
        certificateIndex: candidate.certificate.index,
        certificatePassword,
        serial: candidate.certificate.serial,
        storageCertIdx:
          typeof candidate.storageRawCertIdx.storageCertIdx === "string" ||
          typeof candidate.storageRawCertIdx.storageCertIdx === "number"
            ? String(candidate.storageRawCertIdx.storageCertIdx)
            : null,
        userDN: candidate.certificate.userDN,
      }),
    );

    const authResult = await waitForHomeTaxMagicLineAuthResult(
      page,
      childFrame,
    );
    const cert = await readHomeTaxMagicLineUiApiString(
      page,
      "tranx2PEM",
      "홈택스 인증서 본문을 읽지 못했습니다.",
    );
    const randomEnc = await readHomeTaxMagicLineUiApiString(
      page,
      "getRandomfromPrivateKey",
      "홈택스 인증서 식별값을 읽지 못했습니다.",
    );

    return {
      logSgnt: authResult.resultMsg,
      cert,
      randomEnc,
      storageName: authResult.selectMedia || "hdd",
    };
  } finally {
    await page?.close().catch(() => undefined);
  }
}

function extractCookieHeader(response: Response): string {
  const getSetCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  const rawCookies =
    getSetCookie.length > 0
      ? getSetCookie
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie") as string]
        : [];
  return rawCookies
    .flatMap((value) => value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g))
    .map((value) => value.split(";")[0]?.trim() ?? "")
    .filter(Boolean)
    .join("; ");
}

function mergeCookieHeaders(...cookieHeaders: string[]): string {
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

function parseCookieHeaderForBrowser(cookieHeader: string): Array<{
  name: string;
  value: string;
  url: string;
}> {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) {
        return [];
      }
      return [
        {
          name: part.slice(0, separatorIndex),
          value: part.slice(separatorIndex + 1),
          url: HOMETAX_ORIGIN,
        },
        {
          name: part.slice(0, separatorIndex),
          value: part.slice(separatorIndex + 1),
          url: HOMETAX_HT_ORIGIN,
        },
      ];
    });
}

async function fetchHomeTaxLoginChallenge(): Promise<{
  pkcEncSsn: string;
  cookieHeader: string;
}> {
  const response = await fetchWithTimeout(
    `${HOMETAX_ORIGIN}/wqAction.do?actionId=ATXPPZXA001R01&screenId=${HOMETAX_LOGIN_SCREEN_ID}`,
    {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
        Referer: HOMETAX_LOGIN_REFERER,
        Origin: HOMETAX_ORIGIN,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: "{}",
    },
  );
  if (!response.ok) {
    throw new Error(`홈택스 로그인 난수 요청 HTTP ${response.status}`);
  }

  const cookieHeader = extractCookieHeader(response);
  const payload = (await response.json()) as Record<string, unknown>;
  const pkcEncSsn =
    typeof payload.pkcEncSsn === "string" ? payload.pkcEncSsn.trim() : "";
  if (!pkcEncSsn) {
    throw new Error("홈택스 로그인 난수 응답에 pkcEncSsn 값이 없습니다.");
  }

  return { pkcEncSsn, cookieHeader };
}

function resolveHomeTaxLoginMediaCode(storageName: string): string {
  const normalized = storageName.trim().toLowerCase();
  if (normalized === "fincert" || normalized === "finance") {
    return "12";
  }
  return "05";
}

type HomeTaxPublicLoginMaterial = {
  logSgnt: string;
  cert: string;
  randomEnc: string;
  storageName: string;
};

type HomeTaxMagicLineDirectRuntimeConfig = {
  origin: string;
  referer: string;
  serviceId: string;
  authKey: string;
  crossServerUrl: string;
  crossServerCert: string;
};

type HomeTaxMagicLineDirectCommandResult = {
  ok: boolean;
  resultCode: number | null;
  messageId: string | null;
  resultMessage: string;
  result: Record<string, unknown> | null;
  reply: Record<string, unknown> | null;
  error: string | null;
};

const HOMETAX_MAGICLINE_DIRECT_SIGN_OPTION = {
  ds_pki_sign: ["OPT_USE_CONTNET_INFO"],
  ds_pki_rsa: "rsa15",
  ds_pki_hash: "sha256",
  ds_msg_decode: "false",
  ds_pki_sign_type: "sign",
};

let cachedHomeTaxMagicLineDirectRuntimeConfig:
  | {
      fetchedAt: number;
      value: HomeTaxMagicLineDirectRuntimeConfig;
    }
  | null = null;

function countReplacementCharacters(value: string): number {
  return value.match(/\uFFFD/g)?.length ?? 0;
}

function decodeHomeTaxMagicLineDirectResponseBody(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Korean security modules can return CP949/EUC-KR encoded JSON bodies.
  }

  const utf8 = buffer.toString("utf8");
  let eucKr: string | null = null;
  try {
    eucKr = new TextDecoder("euc-kr").decode(buffer);
  } catch {
    return utf8;
  }

  return countReplacementCharacters(eucKr) <
    countReplacementCharacters(utf8)
    ? eucKr
    : utf8;
}

function extractHomeTaxMagicLineConfigString(
  configSource: string,
  key: string,
): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = configSource.match(
    new RegExp(`(?:^|[\\s,{])${escapedKey}\\s*:\\s*"([^"]*)"`),
  );
  if (!match?.[1]) {
    throw new Error(`홈택스 MagicLine 설정에서 ${key} 값을 찾지 못했습니다.`);
  }
  return match[1];
}

async function resolveHomeTaxMagicLineDirectRuntimeConfig(): Promise<HomeTaxMagicLineDirectRuntimeConfig> {
  const now = Date.now();
  if (
    cachedHomeTaxMagicLineDirectRuntimeConfig &&
    now - cachedHomeTaxMagicLineDirectRuntimeConfig.fetchedAt <
      HOMETAX_MAGICLINE_CONFIG_CACHE_TTL_MS
  ) {
    return cachedHomeTaxMagicLineDirectRuntimeConfig.value;
  }

  const configSource = await (
    await fetchWithTimeout(HOMETAX_MAGICLINE_CONFIG_URL)
  ).text();
  const value = {
    origin: HOMETAX_ORIGIN,
    referer: HOMETAX_LOGIN_REFERER,
    serviceId: extractHomeTaxMagicLineConfigString(
      configSource,
      "ServiceID",
    ),
    authKey: extractHomeTaxMagicLineConfigString(configSource, "MAGICJS_LIC"),
    crossServerUrl: `${HOMETAX_ORIGIN}/jsp/magicNX/`,
    crossServerCert: extractHomeTaxMagicLineConfigString(
      configSource,
      "CS_AUTHSERVER_CERT",
    ),
  };
  cachedHomeTaxMagicLineDirectRuntimeConfig = { fetchedAt: now, value };
  return value;
}

function makeHomeTaxMagicLineDirectSessionId(): string {
  return Math.random().toString(36).slice(2, 22).padEnd(20, "0");
}

function buildHomeTaxMagicLineDirectJsonMessage(
  config: HomeTaxMagicLineDirectRuntimeConfig,
  sessionId: string,
  messageId: string,
  args: string[],
): string {
  const payload: Record<string, string> = {
    Version: "1",
    ServiceID: config.serviceId,
    AuthKey: config.authKey,
    SessionID: sessionId,
    CrossServerURL: config.crossServerUrl,
    CrossServerCert: config.crossServerCert,
    SessionTimeout: HOMETAX_MAGICLINE_SESSION_TIMEOUT,
    MessageID: messageId,
  };

  args.forEach((arg, index) => {
    payload[String(index)] = arg;
  });

  return JSON.stringify(payload);
}

function parseHomeTaxMagicLineDirectResultMessage(
  resultMessage: string,
): Record<string, unknown> | null {
  if (!resultMessage.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(resultMessage) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function invokeHomeTaxMagicLineDirectCommand(
  config: HomeTaxMagicLineDirectRuntimeConfig,
  sessionId: string,
  messageId: string,
  args: string[],
): Promise<HomeTaxMagicLineDirectCommandResult> {
  const payload = buildHomeTaxMagicLineDirectJsonMessage(
    config,
    sessionId,
    messageId,
    args,
  );

  return await new Promise((resolve) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port: HOMETAX_MAGICLINE_PORT,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
          Origin: config.origin,
          Referer: config.referer,
        },
        agent: new https.Agent({ rejectUnauthorized: false }),
        timeout: resolveExternalRequestTimeoutMs(),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          try {
            const body = decodeHomeTaxMagicLineDirectResponseBody(
              Buffer.concat(chunks),
            );
            const reply = JSON.parse(body) as Record<string, unknown>;
            const rawResultCode = Number.parseInt(
              String(reply.ResultCode ?? ""),
              10,
            );
            const resultCode = Number.isFinite(rawResultCode)
              ? rawResultCode
              : null;
            const resultMessage =
              typeof reply.ResultMessage === "string"
                ? reply.ResultMessage
                : "";
            resolve({
              ok: resultCode === 0,
              resultCode,
              messageId:
                typeof reply.MessageID === "string" ? reply.MessageID : null,
              resultMessage,
              result: parseHomeTaxMagicLineDirectResultMessage(resultMessage),
              reply,
              error:
                resultCode === 0
                  ? null
                  : resultMessage ||
                    `HomeTax MagicLine ${messageId} ResultCode=${resultCode ?? "unknown"}`,
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
                  : `HomeTax MagicLine ${messageId} 응답 파싱 실패`,
            });
          }
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`HomeTax MagicLine ${messageId} timeout`));
    });
    req.on("error", (error) => {
      resolve({
        ok: false,
        resultCode: null,
        messageId,
        resultMessage: "",
        result: null,
        reply: null,
        error: error.message,
      });
    });
    req.end(payload);
  });
}

function assertHomeTaxMagicLineDirectOk(
  result: HomeTaxMagicLineDirectCommandResult,
  failureMessage: string,
): void {
  if (!result.ok) {
    throw new Error(result.error || result.resultMessage || failureMessage);
  }
}

function cloneHomeTaxMagicLineStorageIndex(
  candidate: HomeTaxMagicLineRawCertificateCandidate,
): Record<string, unknown> {
  const rawIndex = candidate.storageRawCertIdx;
  if (
    !rawIndex ||
    typeof rawIndex !== "object" ||
    Array.isArray(rawIndex)
  ) {
    throw new Error("홈택스 MagicLine 인증서 저장소 인덱스를 확인하지 못했습니다.");
  }

  const storageIndex: Record<string, unknown> = { ...rawIndex };
  if (typeof storageIndex.storageOpt === "string") {
    try {
      storageIndex.storageOpt = JSON.parse(storageIndex.storageOpt);
    } catch {
      throw new Error("홈택스 MagicLine 인증서 저장소 옵션을 해석하지 못했습니다.");
    }
  }
  return storageIndex;
}

function readHomeTaxMagicLineDirectString(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

function readHomeTaxMagicLineDirectNestedString(
  record: Record<string, unknown> | null,
  key: string,
  nestedKey: string,
): string | null {
  const nested = record?.[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return null;
  }
  const value = (nested as Record<string, unknown>)[nestedKey];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

function formatHomeTaxMagicLineTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}${pad(
    date.getMonth() + 1,
  )}${pad(date.getDate())}${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
}

function formatHomeTaxMagicLinePemCertificate(rawCertificate: string): string {
  const clean = rawCertificate
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  let pem = "-----BEGIN CERTIFICATE-----\n";
  for (let index = 0; index < clean.length; index += 64) {
    pem += `${clean.slice(index, index + 64)}\n`;
  }
  return `${pem}-----END CERTIFICATE-----\n`;
}

async function buildHomeTaxMagicLineDirectLoginMaterial(
  candidate: HomeTaxMagicLineRawCertificateCandidate,
  certificatePassword: string,
  pkcEncSsn: string,
): Promise<HomeTaxPublicLoginMaterial> {
  if (candidate.storageName !== "hdd") {
    throw new Error("홈택스 직접 서명은 HDD/NPKI 인증서만 지원합니다.");
  }

  const config = await resolveHomeTaxMagicLineDirectRuntimeConfig();
  const sessionId = makeHomeTaxMagicLineDirectSessionId();
  const installResult = await invokeHomeTaxMagicLineDirectCommand(
    config,
    sessionId,
    "InstallCheck",
    [sessionId, "Chrome 124", HOMETAX_MAGICLINE_SESSION_TIMEOUT],
  );
  assertHomeTaxMagicLineDirectOk(
    installResult,
    "홈택스 MagicLine4NX 설치 확인에 실패했습니다.",
  );

  const storageIndex = cloneHomeTaxMagicLineStorageIndex(candidate);
  const signResult = await invokeHomeTaxMagicLineDirectCommand(
    config,
    sessionId,
    "Sign",
    [
      encodeURIComponent(JSON.stringify(storageIndex)),
      encodeURIComponent(JSON.stringify(HOMETAX_MAGICLINE_DIRECT_SIGN_OPTION)),
      encodeURIComponent(certificatePassword),
      Buffer.from(pkcEncSsn, "utf8").toString("base64"),
      "",
      "",
    ],
  );
  const signTimestamp = formatHomeTaxMagicLineTimestamp(new Date());
  assertHomeTaxMagicLineDirectOk(
    signResult,
    "홈택스 MagicLine4NX 인증서 서명에 실패했습니다.",
  );

  const certificateStringResult = await invokeHomeTaxMagicLineDirectCommand(
    config,
    sessionId,
    "GetCertString",
    [encodeURIComponent(JSON.stringify(storageIndex))],
  );
  assertHomeTaxMagicLineDirectOk(
    certificateStringResult,
    "홈택스 MagicLine4NX 인증서 본문을 읽지 못했습니다.",
  );

  const randomResult = await invokeHomeTaxMagicLineDirectCommand(
    config,
    sessionId,
    "GetVIDRandom",
    [
      encodeURIComponent(JSON.stringify(storageIndex)),
      encodeURIComponent(certificatePassword),
    ],
  );
  assertHomeTaxMagicLineDirectOk(
    randomResult,
    "홈택스 MagicLine4NX 인증서 식별값을 읽지 못했습니다.",
  );

  const encMsg = readHomeTaxMagicLineDirectString(signResult.result, "encMsg");
  const rawCertificate =
    readHomeTaxMagicLineDirectNestedString(
      certificateStringResult.result,
      "cert_string",
      "signcert",
    ) ??
    readHomeTaxMagicLineDirectString(
      certificateStringResult.result,
      "cert_string",
    );
  const randomEnc =
    readHomeTaxMagicLineDirectString(randomResult.result, "VIDRandom") ??
    randomResult.resultMessage.trim();
  const serial = candidate.certificate.serial?.trim();

  if (!encMsg || !rawCertificate || !randomEnc || !serial) {
    throw new Error("홈택스 MagicLine4NX 서명 응답에 필요한 값이 없습니다.");
  }

  const rawLogSgnt = `${pkcEncSsn}$${serial}$${signTimestamp}$${encMsg}`;
  return {
    logSgnt: Buffer.from(rawLogSgnt, "utf8").toString("base64"),
    cert: formatHomeTaxMagicLinePemCertificate(rawCertificate),
    randomEnc,
    storageName: "hdd",
  };
}

export function buildHomeTaxPublicLoginRequest(options: {
  material: HomeTaxPublicLoginMaterial;
  origin?: string;
  mainSystem?: boolean;
  screenId?: string;
}): {
  url: string;
  body: string;
} {
  const origin = options.origin ?? HOMETAX_ORIGIN;
  const formData = new URLSearchParams({
    logSgnt: options.material.logSgnt,
    cert: options.material.cert,
    randomEnc: options.material.randomEnc,
    pkcLoginYnImpv: "Y",
    pkcLgnClCd: resolveHomeTaxLoginMediaCode(options.material.storageName),
    ssoStatus: "S",
    portalStatus: "S",
    scrnId: options.screenId ?? HOMETAX_LOGIN_SCREEN_ID,
    userScrnRslnXcCnt: "1920",
    userScrnRslnYcCnt: "1080",
  });
  const loginQuery = new URLSearchParams({ domain: HOMETAX_MAIN_DOMAIN });
  if (options.mainSystem ?? true) {
    loginQuery.set("mainSys", "Y");
  }
  return {
    url: `${origin}/pubcLogin.do?${loginQuery.toString()}`,
    body: formData.toString(),
  };
}

async function postHomeTaxPublicLogin(options: {
  cookieHeader: string;
  material: HomeTaxPublicLoginMaterial;
  origin?: string;
  mainSystem?: boolean;
  screenId?: string;
  referer?: string;
}): Promise<{
  responseText: string;
  cookieHeader: string;
}> {
  const origin = options.origin ?? HOMETAX_ORIGIN;
  const request = buildHomeTaxPublicLoginRequest(options);
  const response = await fetchWithTimeout(
    request.url,
    {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
        Referer: options.referer ?? HOMETAX_LOGIN_REFERER,
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...(options.cookieHeader ? { Cookie: options.cookieHeader } : {}),
      },
      body: request.body,
    },
  );
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`홈택스 공동인증서 로그인 HTTP ${response.status} (${origin})`);
  }
  return {
    responseText,
    cookieHeader: mergeCookieHeaders(
      options.cookieHeader,
      extractCookieHeader(response),
    ),
  };
}

function decodeHomeTaxCallbackText(value: string): string {
  try {
    return decodeURIComponent(value).replace(/\+/g, " ").replace(/\\n/g, "\n");
  } catch {
    return value;
  }
}

function readHomeTaxCallbackField(
  text: string,
  fieldName: string,
): string | null {
  const quotedPattern = new RegExp(
    `['"]${fieldName}['"]\\s*:\\s*['"]([^'"]*)['"]`,
  );
  const quotedMatch = text.match(quotedPattern);
  if (quotedMatch?.[1] !== undefined) {
    return quotedMatch[1];
  }

  const encodedPattern = new RegExp(
    `['"]${fieldName}['"]\\s*:\\s*decodeURIComponent\\(['"]([^'"]*)['"]\\)`,
  );
  const encodedMatch = text.match(encodedPattern);
  if (encodedMatch?.[1] !== undefined) {
    return decodeHomeTaxCallbackText(encodedMatch[1]);
  }

  const barePattern = new RegExp(`['"]${fieldName}['"]\\s*:\\s*([^,}\\n]+)`);
  const bareMatch = text.match(barePattern);
  if (!bareMatch?.[1]) {
    return null;
  }
  const value = bareMatch[1].trim();
  return value === "null" || value === "undefined" ? null : value;
}

function firstHomeTaxCallbackField(
  text: string,
  fieldNames: string[],
): string | null {
  for (const fieldName of fieldNames) {
    const value = readHomeTaxCallbackField(text, fieldName);
    if (value && value !== "null") {
      return value;
    }
  }
  return null;
}

function parseHomeTaxLoginCallback(text: string): {
  code: string | null;
  errorMessage: string | null;
  businessNumber: string | null;
  companyName: string | null;
  ceoName: string | null;
} {
  const code = readHomeTaxCallbackField(text, "code");
  const errorMessage = readHomeTaxCallbackField(text, "errMsg");
  const businessNumber = digitsOnly(
    firstHomeTaxCallbackField(text, [
      "txprDscmNo",
      "bmanRegNo",
      "bsno",
      "tin",
      "originTin",
    ]) ?? "",
  );
  const companyName = firstHomeTaxCallbackField(text, [
    "txprNm",
    "bsnmNm",
    "userNm",
    "usrNm",
    "corpName",
  ]);
  const ceoName = firstHomeTaxCallbackField(text, [
    "rprsFnm",
    "ceoName",
    "txprNm",
    "userNm",
    "usrNm",
  ]);

  return {
    code,
    errorMessage,
    businessNumber: businessNumber || null,
    companyName,
    ceoName,
  };
}

function asHomeTaxRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readHomeTaxRecordString(
  record: Record<string, unknown> | null,
  fieldNames: string[],
): string | null {
  if (!record) {
    return null;
  }

  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function buildHomeTaxRandomQuery(length = 20): string {
  const characters =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += characters[Math.floor(Math.random() * characters.length)];
  }
  return value;
}

function parseHomeTaxJsonPayload(text: string, context: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`${context} 응답이 비어 있습니다.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${context} 응답을 JSON으로 읽지 못했습니다.`);
  }

  const record = asHomeTaxRecord(parsed);
  if (!record) {
    throw new Error(`${context} 응답 형식이 올바르지 않습니다.`);
  }
  return record;
}

function parseHomeTaxPermissionPayload(payload: Record<string, unknown>): {
  sessionMap: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
} {
  const resultMsg = asHomeTaxRecord(payload.resultMsg);
  const sessionMapRecord =
    asHomeTaxRecord(resultMsg?.sessionMap) ??
    asHomeTaxRecord(payload.sessionMap);
  const sessionMap =
    sessionMapRecord && Object.keys(sessionMapRecord).length > 0
      ? sessionMapRecord
      : null;
  const errorCode =
    readHomeTaxRecordString(resultMsg, ["errorCd", "errorCode"]) ??
    readHomeTaxRecordString(payload, ["errorCd", "errorCode"]);
  const errorMessage =
    readHomeTaxRecordString(resultMsg, ["errorMsg", "message", "msg"]) ??
    readHomeTaxRecordString(payload, ["errorMsg", "message", "msg"]);

  return { sessionMap, errorCode, errorMessage };
}

async function fetchHomeTaxPermissionSession(options: {
  cookieHeader: string;
  postParam?: Record<string, unknown> | null;
  includeDomain?: boolean;
  origin?: string;
  screenId?: string;
  referer?: string;
  context?: string;
}): Promise<{
  cookieHeader: string;
  sessionMap: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  const origin = options.origin ?? HOMETAX_ORIGIN;
  const context = options.context ?? "홈택스 세션 정보 조회";
  const query = new URLSearchParams({
    screenId: options.screenId ?? HOMETAX_LOGIN_SCREEN_ID,
  });
  if (options.includeDomain) {
    query.set("domain", HOMETAX_MAIN_DOMAIN);
  }

  const requestPayload = options.postParam
    ? { ...options.postParam, popupYn: false }
    : null;
  const response = await fetchWithTimeout(
    `${origin}/permission.do?${query.toString()}`,
    {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
        Referer: options.referer ?? HOMETAX_LOGIN_REFERER,
        Origin: origin,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json; charset=UTF-8",
        ...(options.cookieHeader ? { Cookie: options.cookieHeader } : {}),
      },
      body: requestPayload ? JSON.stringify(requestPayload) : "",
    },
  );
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${context} HTTP ${response.status}`);
  }

  const payload = parseHomeTaxJsonPayload(responseText, context);
  const parsed = parseHomeTaxPermissionPayload(payload);
  return {
    ...parsed,
    cookieHeader: mergeCookieHeaders(
      options.cookieHeader,
      extractCookieHeader(response),
    ),
  };
}

async function fetchHomeTaxPortalToken(options: {
  cookieHeader: string;
  origin?: string;
  referer?: string;
  context?: string;
}): Promise<{
  cookieHeader: string;
  postParam: Record<string, unknown> | null;
}> {
  const origin = options.origin ?? HOMETAX_ORIGIN;
  const context = options.context ?? "홈택스 포털 토큰 조회";
  const response = await fetchWithTimeout(
    `${origin}/token.do?query=${buildHomeTaxRandomQuery()}`,
    {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
        Referer: options.referer ?? HOMETAX_LOGIN_REFERER,
        "X-Requested-With": "XMLHttpRequest",
        ...(options.cookieHeader ? { Cookie: options.cookieHeader } : {}),
      },
    },
  );
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${context} HTTP ${response.status}`);
  }

  const trimmed = responseText.trim();
  if (!trimmed || trimmed === "null") {
    return {
      cookieHeader: mergeCookieHeaders(
        options.cookieHeader,
        extractCookieHeader(response),
      ),
      postParam: null,
    };
  }

  const payload = parseHomeTaxJsonPayload(trimmed, context);
  return {
    cookieHeader: mergeCookieHeaders(
      options.cookieHeader,
      extractCookieHeader(response),
    ),
    postParam: payload,
  };
}

async function fetchHomeTaxLoginSession(options: {
  cookieHeader: string;
}): Promise<{
  cookieHeader: string;
  sessionMap: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  let cookieHeader = options.cookieHeader;
  let directSession: Awaited<
    ReturnType<typeof fetchHomeTaxPermissionSession>
  > | null = null;
  let directError: Error | null = null;
  try {
    directSession = await fetchHomeTaxPermissionSession({
      cookieHeader,
    });
    cookieHeader = directSession.cookieHeader;
    if (directSession.sessionMap) {
      return directSession;
    }
  } catch (error) {
    directError =
      error instanceof Error
        ? error
        : new Error("홈택스 세션 직접 조회 중 알 수 없는 오류가 발생했습니다.");
  }

  const portalToken = await fetchHomeTaxPortalToken({ cookieHeader });
  if (!portalToken.postParam) {
    if (directSession) {
      return directSession;
    }
    throw directError ?? new Error("홈택스 포털 토큰 응답이 비어 있습니다.");
  }

  const portalSession = await fetchHomeTaxPermissionSession({
    cookieHeader: portalToken.cookieHeader,
    postParam: portalToken.postParam,
    includeDomain: true,
  });
  return portalSession.sessionMap || !directSession
    ? portalSession
    : directSession;
}

async function fetchHomeTaxTaxpayerBasicSession(options: {
  cookieHeader: string;
}): Promise<{
  cookieHeader: string;
  sessionMap: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  let cookieHeader = options.cookieHeader;
  let directSession: Awaited<
    ReturnType<typeof fetchHomeTaxPermissionSession>
  > | null = null;
  let directError: Error | null = null;
  try {
    directSession = await fetchHomeTaxPermissionSession({
      cookieHeader,
      origin: HOMETAX_ORIGIN,
      screenId: HOMETAX_TAXPAYER_BASIC_SCREEN_ID,
      referer: HOMETAX_TAXPAYER_BASIC_REFERER,
      context: "홈택스 세적 기본 화면 세션 정보 조회",
    });
    cookieHeader = directSession.cookieHeader;
    if (directSession.sessionMap) {
      return directSession;
    }
  } catch (error) {
    directError =
      error instanceof Error
        ? error
        : new Error("홈택스 세적 기본 화면 세션 직접 조회 중 알 수 없는 오류가 발생했습니다.");
  }

  const taxpayerToken = await fetchHomeTaxPortalToken({
    cookieHeader,
    origin: HOMETAX_ORIGIN,
    referer: HOMETAX_TAXPAYER_BASIC_REFERER,
    context: "홈택스 세적 기본 화면 토큰 조회",
  });
  if (!taxpayerToken.postParam) {
    const directSuffix = directSession
      ? ` 직접 세션 응답: errorCode=${directSession.errorCode ?? "-"}, errorMessage=${directSession.errorMessage ?? "-"}`
      : directError
        ? ` 직접 세션 오류: ${directError.message}`
        : "";
    throw new Error(
      `홈택스 세적 기본 화면 토큰 응답이 비어 있습니다.${directSuffix}`,
    );
  }

  const taxpayerSession = await fetchHomeTaxPermissionSession({
    cookieHeader: taxpayerToken.cookieHeader,
    postParam: taxpayerToken.postParam,
    includeDomain: true,
    origin: HOMETAX_ORIGIN,
    screenId: HOMETAX_TAXPAYER_BASIC_SCREEN_ID,
    referer: HOMETAX_TAXPAYER_BASIC_REFERER,
    context: "홈택스 세적 기본 화면 권한 세션 조회",
  });
  if (taxpayerSession.sessionMap) {
    return taxpayerSession;
  }

  const portalToken = await fetchHomeTaxPortalToken({
    cookieHeader,
    origin: HOMETAX_ORIGIN,
    referer: HOMETAX_LOGIN_REFERER,
    context: "홈택스 포털 토큰 조회(세적 업무 시스템 핸드오프)",
  });
  if (portalToken.postParam) {
    const portalTokenSession = await fetchHomeTaxPermissionSession({
      cookieHeader: mergeCookieHeaders(cookieHeader, portalToken.cookieHeader),
      postParam: portalToken.postParam,
      includeDomain: true,
      origin: HOMETAX_ORIGIN,
      screenId: HOMETAX_TAXPAYER_BASIC_SCREEN_ID,
      referer: HOMETAX_TAXPAYER_BASIC_REFERER,
      context: "홈택스 포털 토큰 기반 세적 기본 화면 권한 세션 조회",
    });
    if (portalTokenSession.sessionMap) {
      return portalTokenSession;
    }
    throw new Error(
      `홈택스 포털 토큰 기반 세적 기본 화면 권한 세션을 찾지 못했습니다. errorCode=${portalTokenSession.errorCode ?? "-"}, errorMessage=${portalTokenSession.errorMessage ?? "-"}`,
    );
  }

  throw new Error(
    `홈택스 세적 기본 화면 권한 세션을 찾지 못했습니다. errorCode=${taxpayerSession.errorCode ?? "-"}, errorMessage=${taxpayerSession.errorMessage ?? "-"}`,
  );
}

function parseHomeTaxSessionBusinessInfo(
  sessionMap: Record<string, unknown> | null,
): {
  businessNumber: string | null;
  companyName: string | null;
  ceoName: string | null;
  postalCode: string | null;
  baseAddress: string | null;
  detailAddress: string | null;
} {
  const directBusinessFields = [
    "txprDscmNo",
    "bmanRegNo",
    "bsno",
    "businessNumber",
    "bizNo",
    "bmanNo",
  ];
  const secondaryBusinessFields = ["tin", "originTin", "pubcUserNo"];
  let businessNumber: string | null = null;
  for (const fieldName of [...directBusinessFields, ...secondaryBusinessFields]) {
    const digits = digitsOnly(
      readHomeTaxRecordString(sessionMap, [fieldName]) ?? "",
    );
    if (digits.length === 10) {
      businessNumber = digits;
      break;
    }
  }

  const companyName = readHomeTaxRecordString(sessionMap, [
    "txprNm",
    "bsnmNm",
    "corpNm",
    "corpName",
    "userNm",
    "usrNm",
    "lgnUserNm",
  ]);
  const ceoName = readHomeTaxRecordString(sessionMap, [
    "rprsFnm",
    "ceoName",
    "txprNm",
    "userNm",
    "usrNm",
  ]);
  const postalCode = readHomeTaxRecordString(sessionMap, [
    "zipCd",
    "zip",
    "postalCode",
  ]);
  const baseAddress = readHomeTaxRecordString(sessionMap, [
    "addr",
    "bassAddr",
    "baseAddress",
    "roadNmAddr",
    "roadAddr",
    "addr1",
  ]);
  const detailAddress = readHomeTaxRecordString(sessionMap, [
    "dtlAddr",
    "detailAddress",
    "addr2",
  ]);

  return {
    businessNumber,
    companyName,
    ceoName,
    postalCode,
    baseAddress,
    detailAddress,
  };
}

function readHomeTaxNestedRecordString(
  value: unknown,
  fieldNames: string[],
  visited = new Set<unknown>(),
): string | null {
  const record = asHomeTaxRecord(value);
  if (!record || visited.has(record)) {
    return null;
  }
  visited.add(record);

  const direct = readHomeTaxRecordString(record, fieldNames);
  if (direct) {
    return direct;
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = readHomeTaxNestedRecordString(item, fieldNames, visited);
        if (found) {
          return found;
        }
      }
      continue;
    }
    const found = readHomeTaxNestedRecordString(child, fieldNames, visited);
    if (found) {
      return found;
    }
  }

  return null;
}

type HomeTaxTaxpayerBasicBusinessInfo = {
  businessNumber: string | null;
  companyName: string | null;
  ceoName: string | null;
  postalCode: string | null;
  baseAddress: string | null;
  detailAddress: string | null;
};

export function parseHomeTaxTaxpayerBasicBusinessInfo(
  payload: Record<string, unknown> | null,
): HomeTaxTaxpayerBasicBusinessInfo | null {
  if (!payload) {
    return null;
  }

  const businessNumber = digitsOnly(
    readHomeTaxNestedRecordString(payload, [
      "bmanRegNo",
      "bsno",
      "txprDscmNo",
      "txprNo",
      "businessNumber",
      "bizNo",
      "bmanNo",
    ]) ?? "",
  );
  const baseAddress = readHomeTaxNestedRecordString(payload, [
    "roadNmAddr",
    "roadNmAdr",
    "roadAdr",
    "roadAddr",
    "rnAdr",
    "rnAddr",
    "ldAdr",
    "ldAddr",
    "lndnAdr",
    "lndnAddr",
    "jibunAdr",
    "jibunAddr",
    "bassAddr",
    "bassAdr",
    "bscAddr",
    "bscAdr",
    "baseAddress",
    "bmanBscAddr",
    "bmanBscAdr",
    "bzplAddr",
    "bzplAdr",
    "bsplcAddr",
    "bsplcAdr",
    "txplcAddr",
    "txplcAdr",
    "addr",
    "adr",
  ]);
  const detailAddress = readHomeTaxNestedRecordString(payload, [
    "dtlAddr",
    "dtlAdr",
    "detailAddress",
    "roadNmDtlAddr",
    "roadNmDtlAdr",
    "rnDtlAddr",
    "rnDtlAdr",
    "roadDtlAdr",
    "roadDtlAddr",
    "ldDtlAdr",
    "ldDtlAddr",
    "etcAdr",
    "etcAddr",
    "addr2",
    "adr2",
  ]);

  const result = {
    businessNumber: businessNumber.length === 10 ? businessNumber : null,
    companyName: readHomeTaxNestedRecordString(payload, [
      "txprNm",
      "bsnmNm",
      "tnmNm",
      "bmanNm",
      "corpNm",
      "corpName",
      "companyName",
    ]),
    ceoName: readHomeTaxNestedRecordString(payload, [
      "rprsFnm",
      "rprsNm",
      "rpprFnm",
      "ceoName",
      "reprName",
    ]),
    postalCode: readHomeTaxNestedRecordString(payload, [
      "zipCd",
      "zip",
      "zipNo",
      "postNo",
      "zpcd",
      "postalCode",
    ]),
    baseAddress,
    detailAddress,
  };

  return Object.values(result).some(Boolean) ? result : null;
}

function hasHomeTaxTaxpayerBasicAddress(
  info: HomeTaxTaxpayerBasicBusinessInfo | null | undefined,
): boolean {
  return Boolean(info?.baseAddress?.trim() || info?.detailAddress?.trim());
}

function pickHomeTaxTaxpayerBasicBusinessInfo(
  candidates: Array<HomeTaxTaxpayerBasicBusinessInfo | null>,
): HomeTaxTaxpayerBasicBusinessInfo | null {
  const parsedCandidates = candidates.filter(
    (candidate): candidate is HomeTaxTaxpayerBasicBusinessInfo => Boolean(candidate),
  );
  return (
    parsedCandidates.find(hasHomeTaxTaxpayerBasicAddress) ??
    parsedCandidates.find((candidate) => Boolean(candidate.businessNumber)) ??
    parsedCandidates[0] ??
    null
  );
}

async function fetchHomeTaxTaxpayerBasicBusinessInfo(options: {
  cookieHeader: string;
  businessNumber: string;
  sessionMap?: Record<string, unknown> | null;
}): Promise<ReturnType<typeof parseHomeTaxTaxpayerBasicBusinessInfo> | null> {
  if (!options.cookieHeader.trim() || !options.businessNumber.trim()) {
    return null;
  }

  return await runHomeTaxMagicLineBrowserTask(async () => {
    const { context } = await openHomeTaxMagicLineBrowserContext();
    try {
      return await fetchHomeTaxTaxpayerBasicBusinessInfoInContext(
        context,
        options,
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  });
}

async function fetchHomeTaxTaxpayerBasicBusinessInfoInContext(
  context: BrowserContext,
  options: {
    cookieHeader: string;
    businessNumber: string;
    sessionMap?: Record<string, unknown> | null;
  },
): Promise<ReturnType<typeof parseHomeTaxTaxpayerBasicBusinessInfo> | null> {
  if (!options.cookieHeader.trim() || !options.businessNumber.trim()) {
    return null;
  }

  const cookies = parseCookieHeaderForBrowser(options.cookieHeader);
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }

  const page = await context.newPage();
  try {
      await page.addInitScript(
        "window.__name = window.__name || ((target, value) => target);",
      );
      const taxpayerBasicActionResponsePayloads: Array<
        Promise<Record<string, unknown> | null>
      > = [];
      page.on("response", (response) => {
        const responseUrl = response.url();
        if (
          !responseUrl.includes("/wqAction.do") ||
          ![...HOMETAX_TAXPAYER_BASIC_ACTION_IDS].some((actionId) =>
            responseUrl.includes(`actionId=${actionId}`),
          )
        ) {
          return;
        }
        taxpayerBasicActionResponsePayloads.push(
          response
            .text()
            .then((text) => {
              const trimmed = text.trim();
              const jsonStart = trimmed.indexOf("{");
              if (jsonStart < 0) {
                return null;
              }
              const parsed = JSON.parse(trimmed.slice(jsonStart)) as unknown;
              return asHomeTaxRecord(parsed);
            })
            .catch(() => null),
        );
      });
      await page.goto(HOMETAX_TAXPAYER_BASIC_REFERER, {
        waitUntil: "domcontentloaded",
        timeout: HOMETAX_MAGICLINE_BROWSER_TIMEOUT_MS,
      });
      await page.waitForFunction(
        () => {
          const typedWindow = window as typeof window & {
            $c?: {
              util?: { nts_loadBizCd?: unknown; nts_getComponent?: unknown };
            };
            k?: { k4?: unknown; k7?: unknown };
          };
          return Boolean(
            typedWindow.$c?.util?.nts_loadBizCd &&
              typedWindow.$c?.util?.nts_getComponent &&
              typedWindow.k?.k4 &&
              typedWindow.k?.k7,
          );
        },
        null,
        { timeout: HOMETAX_MAGICLINE_BROWSER_TIMEOUT_MS },
      );
      await page.waitForFunction(
        () => {
          const typedWindow = window as typeof window & {
            $c?: {
              util?: {
                nts_getSession?: (pageScope: unknown, key: string) => unknown;
              };
            };
            $p?: {
              main?: () => { $p?: unknown };
              getFrame?: () => unknown;
            };
            $p1?: {
              main?: () => { $p?: unknown };
              getFrame?: () => unknown;
            };
          };
          const getSession = typedWindow.$c?.util?.nts_getSession;
          if (typeof getSession !== "function") {
            return false;
          }
          const pageScopeCandidates = [
            typedWindow.$p?.main?.()?.$p,
            typedWindow.$p1?.main?.()?.$p,
            typedWindow.$p,
            typedWindow.$p1,
          ];
          const pageScope = pageScopeCandidates.find((candidate) => {
            const scoped = candidate as { getFrame?: () => unknown } | undefined;
            try {
              return Boolean(scoped?.getFrame?.());
            } catch {
              return false;
            }
          });
          if (!pageScope) {
            return false;
          }
          return [
            "pubcUserNo",
            "tin",
            "txprDscmNo",
            "bmanRegNo",
            "lgnUserClCd",
          ].some((key) => Boolean(getSession(pageScope, key)));
        },
        null,
        { timeout: options.sessionMap ? 50 : 45_000 },
      ).catch(async () => {
        if (!options.sessionMap || Object.keys(options.sessionMap).length === 0) {
          throw new Error("홈택스 세적 업무 시스템 화면 세션 대기 시간이 초과되었습니다.");
        }
        await page.evaluate(
          ({ sessionMap }) => {
            const typedWindow = window as typeof window & {
              NTS_SESSION_MAP?: string;
              WebSquare?: {
                session?: {
                  setAttribute?: (key: string, value: unknown) => void;
                };
              };
            };
            const sessionKey = typedWindow.NTS_SESSION_MAP;
            const setAttribute = typedWindow.WebSquare?.session?.setAttribute;
            if (!sessionKey || typeof setAttribute !== "function") {
              throw new Error("홈택스 세적 업무 시스템 화면 세션 저장소를 찾지 못했습니다.");
            }
            setAttribute(sessionKey, sessionMap);
          },
          { sessionMap: options.sessionMap },
        );
        await page.waitForFunction(
          () => {
            const typedWindow = window as typeof window & {
              $c?: {
                util?: {
                  nts_getSession?: (pageScope: unknown, key: string) => unknown;
                };
              };
              $p?: {
                main?: () => { $p?: unknown };
                getFrame?: () => unknown;
              };
              $p1?: {
                main?: () => { $p?: unknown };
                getFrame?: () => unknown;
              };
            };
            const getSession = typedWindow.$c?.util?.nts_getSession;
            if (typeof getSession !== "function") {
              return false;
            }
            const pageScopeCandidates = [
              typedWindow.$p?.main?.()?.$p,
              typedWindow.$p1?.main?.()?.$p,
              typedWindow.$p,
              typedWindow.$p1,
            ];
            const pageScope = pageScopeCandidates.find((candidate) => {
              const scoped = candidate as { getFrame?: () => unknown } | undefined;
              try {
                return Boolean(scoped?.getFrame?.());
              } catch {
                return false;
              }
            });
            if (!pageScope) {
              return false;
            }
            return [
              "pubcUserNo",
              "tin",
              "txprDscmNo",
              "bmanRegNo",
              "lgnUserClCd",
            ].some((key) => Boolean(getSession(pageScope, key)));
          },
          null,
          { timeout: 5_000 },
        );
      });

      const payload = await page.evaluate(
        async ({ businessBasicActionId, taxpayerBasicActionId, businessNumber }) => {
          const typedWindow = window as typeof window & {
            $c?: {
              util?: {
                nts_loadBizCd?: (pageScope: unknown, items: unknown[]) => void;
                nts_getComponent?: (pageScope: unknown, id: string) => {
                  getJSON?: () => unknown;
                } | null;
              };
            };
            $p?: {
              main?: () => { $p?: unknown };
              getFrame?: () => unknown;
            };
            $p1?: {
              main?: () => { $p?: unknown };
              getFrame?: () => unknown;
            };
          };
          const loadBizCd = typedWindow.$c?.util?.nts_loadBizCd;
          const getComponent = typedWindow.$c?.util?.nts_getComponent;
          if (typeof loadBizCd !== "function" || typeof getComponent !== "function") {
            throw new Error("홈택스 세적 조회 공통 함수를 찾지 못했습니다.");
          }
          const pageScopeCandidates = [
            typedWindow.$p?.main?.()?.$p,
            typedWindow.$p1?.main?.()?.$p,
            typedWindow.$p,
            typedWindow.$p1,
          ];
          const pageScope = pageScopeCandidates.find((candidate) => {
            const scoped = candidate as { getFrame?: () => unknown } | undefined;
            try {
              return Boolean(scoped?.getFrame?.());
            } catch {
              return false;
            }
          });
          if (!pageScope) {
            throw new Error("홈택스 세적 조회 화면 컨텍스트를 찾지 못했습니다.");
          }

          const requestBiz = async (item: unknown, outDes: string) =>
            await new Promise<unknown>((resolve, reject) => {
              const timer = window.setTimeout(() => {
                reject(new Error("홈택스 세적 기본 조회 응답 시간이 초과되었습니다."));
              }, 30_000);
              const callback = () => {
                window.clearTimeout(timer);
                try {
                  resolve(getComponent(pageScope, `dma_${outDes}`)?.getJSON?.() ?? null);
                } catch (error) {
                  reject(error);
                }
              };

              loadBizCd(pageScope, [
                {
                  ...(item as Record<string, unknown>),
                  callBack: callback,
                  ignoreMsg: "Y",
                },
              ]);
            });

          const requests = [
            {
              actionId: businessBasicActionId,
              outDes: "autoTaxBmanBscR02",
              keyNm: ["txprDscmNo", "txprDscmDt", "outDes", "sameBmanInqrYn", "rpnBmanRetrYn"],
              keyCd: [businessNumber, "", "autoTaxBmanBscR02", "N", "N"],
              inSrc: "txprClsDes2",
              outType: "vo",
              outSrc: "bmanBscInfrInqrDVO",
            },
            {
              actionId: taxpayerBasicActionId,
              outDes: "autoTaxBmanBscR01",
              keyNm: [
                "tin",
                "txprClsfCd",
                "txprDscmNo",
                "txprDscmNoClCd",
                "txprDscmDt",
                "searchOrder",
                "outDes",
                "txprNm",
                "crpTin",
                "mntgTxprIcldYn",
                "resnoAltHstrInqrYn",
                "resnoAltHstrInqrBaseDtm",
                "sameBmanInqrYn",
                "rpnBmanRetrYn",
              ],
              keyCd: [
                "",
                "02",
                businessNumber,
                "",
                "",
                "",
                "autoTaxBmanBscR01",
                "",
                "",
                "",
                "",
                "",
                "N",
                "N",
              ],
              inSrc: "txprClsDes",
              outType: "vo",
              outSrc: "bmanBscInfrInqrDVO",
            },
          ];

          const addressFieldNames = new Set([
            "roadNmAddr",
            "roadNmAdr",
            "roadAdr",
            "roadAddr",
            "rnAdr",
            "rnAddr",
            "ldAdr",
            "ldAddr",
            "lndnAdr",
            "lndnAddr",
            "jibunAdr",
            "jibunAddr",
            "bassAddr",
            "bassAdr",
            "bscAddr",
            "bscAdr",
            "baseAddress",
            "bmanBscAddr",
            "bmanBscAdr",
            "bzplAddr",
            "bzplAdr",
            "bsplcAddr",
            "bsplcAdr",
            "txplcAddr",
            "txplcAdr",
            "addr",
            "adr",
          ]);
          const hasAddressCandidate = (value: unknown): boolean => {
            const stack: unknown[] = [value];
            const visited = new Set<unknown>();
            while (stack.length > 0) {
              const current = stack.pop();
              if (!current || typeof current !== "object") {
                continue;
              }
              if (visited.has(current)) {
                continue;
              }
              visited.add(current);
              if (Array.isArray(current)) {
                stack.push(...current);
                continue;
              }
              for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
                if (
                  addressFieldNames.has(key) &&
                  typeof child === "string" &&
                  child.trim()
                ) {
                  return true;
                }
                stack.push(child);
              }
            }
            return false;
          };

          const results: unknown[] = [];
          for (const request of requests) {
            try {
              const result = await requestBiz(request, request.outDes);
              results.push(result);
              if (hasAddressCandidate(result)) {
                break;
              }
            } catch (error) {
              results.push({
                autoTaxLookupError:
                  error instanceof Error ? error.message : "홈택스 세적 기본 조회 실패",
              });
            }
          }
          return results;
        },
        {
          businessBasicActionId: HOMETAX_BUSINESS_BASIC_ACTION_ID,
          taxpayerBasicActionId: HOMETAX_TAXPAYER_BASIC_ACTION_ID,
          businessNumber: options.businessNumber,
        },
      );

      const payloadRecords = (Array.isArray(payload) ? payload : [payload])
        .map((item) => asHomeTaxRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
      if (payloadRecords.length === 0 && taxpayerBasicActionResponsePayloads.length === 0) {
        await delay(500);
      }
      const collectResponsePayloads = async () =>
        (await Promise.allSettled(taxpayerBasicActionResponsePayloads))
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<Record<string, unknown>> =>
              result.status === "fulfilled" && Boolean(result.value),
          )
          .map((result) => result.value);
      let responsePayloads = await collectResponsePayloads();
      let picked = pickHomeTaxTaxpayerBasicBusinessInfo(
        [...payloadRecords, ...responsePayloads].map((record) =>
          parseHomeTaxTaxpayerBasicBusinessInfo(record),
        ),
      );
      if (picked && !hasHomeTaxTaxpayerBasicAddress(picked)) {
        await delay(HOMETAX_TAXPAYER_BASIC_ADDRESS_SETTLE_MS);
        responsePayloads = await collectResponsePayloads();
        picked = pickHomeTaxTaxpayerBasicBusinessInfo(
          [...payloadRecords, ...responsePayloads].map((record) =>
            parseHomeTaxTaxpayerBasicBusinessInfo(record),
          ),
        );
      }
      if (!picked) {
        throw new Error("응답에서 사업자 기본정보를 찾지 못했습니다.");
      }
      return picked;
    } finally {
      await page.close().catch(() => undefined);
    }
}

async function collectHomeTaxBusinessInfoLookupWithDependencies(
  request: HomeTaxBusinessInfoLookupRequest,
  collectCertificateCandidates: () => Promise<HomeTaxMagicLineRawCertificateCandidate[]>,
): Promise<HomeTaxBusinessInfoLookupResult> {
  if (!request.certificatePassword?.trim()) {
    return buildHomeTaxBusinessInfoLookupFailure(
      request,
      "magicline-sign",
      "인증서 비밀번호가 필요합니다.",
    );
  }

  let candidates: HomeTaxMagicLineRawCertificateCandidate[];
  try {
    candidates = await collectCertificateCandidates();
  } catch (error) {
    return buildHomeTaxBusinessInfoLookupFailure(
      request,
      "magicline-list",
      error instanceof Error
        ? error.message
        : "홈택스 공동인증서 목록을 읽지 못했습니다.",
    );
  }

  const candidate = findHomeTaxMagicLineCandidate(candidates, request);
  if (!candidate) {
    return buildHomeTaxBusinessInfoLookupFailure(
      request,
      "certificate-match",
      "홈택스 MagicLine 목록에서 선택한 공동인증서를 다시 찾지 못했습니다.",
    );
  }

  let challenge: Awaited<ReturnType<typeof fetchHomeTaxLoginChallenge>>;
  try {
    challenge = await fetchHomeTaxLoginChallenge();
  } catch (error) {
    return buildHomeTaxBusinessInfoLookupFailure(
      request,
      "hometax-challenge",
      error instanceof Error
        ? error.message
        : "홈택스 로그인 난수를 받지 못했습니다.",
      {
        certificateIndex: candidate.certificate.index,
        certificateCn: candidate.certificate.cn,
      },
    );
  }

  let context: BrowserContext | null = null;
  try {
    type LoginMaterial = Awaited<ReturnType<typeof buildHomeTaxMagicLineLoginMaterial>>;
    let material: LoginMaterial;
    let materialSource: "direct" | "browser" = "direct";
    const buildBrowserMaterial = async (): Promise<LoginMaterial> => {
      if (!context) {
        const openedContext = await openHomeTaxMagicLineBrowserContext();
        context = openedContext.context;
      }
      return await runHomeTaxMagicLineBrowserTask(
        async () =>
          await buildHomeTaxMagicLineLoginMaterialInContext(
            context as BrowserContext,
            candidate,
            request.certificatePassword,
            challenge.pkcEncSsn,
          ),
      );
    };

    try {
      material = await buildHomeTaxMagicLineDirectLoginMaterial(
        candidate,
        request.certificatePassword,
        challenge.pkcEncSsn,
      );
    } catch (error) {
      const directErrorMessage =
        error instanceof Error
          ? error.message
          : "홈택스 MagicLine4NX 직접 서명값을 만들지 못했습니다.";
      try {
        material = await buildBrowserMaterial();
        materialSource = "browser";
      } catch (browserError) {
        return buildHomeTaxBusinessInfoLookupFailure(
          request,
          "magicline-sign",
          `홈택스 MagicLine4NX 직접 서명 실패: ${directErrorMessage}; 브라우저 서명 실패: ${
            browserError instanceof Error
              ? browserError.message
              : "홈택스 공동인증서 서명값을 만들지 못했습니다."
          }`,
          {
            certificateIndex: candidate.certificate.index,
            certificateCn: candidate.certificate.cn,
          },
        );
      }
    }

    let login: Awaited<ReturnType<typeof postHomeTaxPublicLogin>>;
    try {
      login = await postHomeTaxPublicLogin({
        cookieHeader: challenge.cookieHeader,
        material,
      });
    } catch (error) {
      return buildHomeTaxBusinessInfoLookupFailure(
        request,
        "hometax-login",
        error instanceof Error
          ? error.message
          : "홈택스 공동인증서 로그인에 실패했습니다.",
        {
          certificateIndex: candidate.certificate.index,
          certificateCn: candidate.certificate.cn,
        },
      );
    }

    let parsedLogin = parseHomeTaxLoginCallback(login.responseText);
    if (parsedLogin.code !== "S" && materialSource === "direct") {
      try {
        material = await buildBrowserMaterial();
        materialSource = "browser";
        login = await postHomeTaxPublicLogin({
          cookieHeader: challenge.cookieHeader,
          material,
        });
        parsedLogin = parseHomeTaxLoginCallback(login.responseText);
      } catch {
        // Fall through to the direct-login failure below; it has the HomeTax error text.
      }
    }
    if (parsedLogin.code !== "S") {
      return buildHomeTaxBusinessInfoLookupFailure(
        request,
        "hometax-login",
        parsedLogin.errorMessage ??
          "홈택스 공동인증서 로그인 응답이 성공 상태가 아닙니다.",
        {
          certificateIndex: candidate.certificate.index,
          certificateCn: candidate.certificate.cn,
          loginCode: parsedLogin.code,
        },
      );
    }

  const authenticatedCookieHeader = login.cookieHeader;

  let loginSession: Awaited<ReturnType<typeof fetchHomeTaxLoginSession>>;
  try {
    loginSession = await fetchHomeTaxLoginSession({
      cookieHeader: authenticatedCookieHeader,
    });
  } catch (error) {
    return buildHomeTaxBusinessInfoLookupFailure(
      request,
      "business-info",
      error instanceof Error
        ? error.message
        : "홈택스 로그인 세션 정보를 조회하지 못했습니다.",
      {
        certificateIndex: candidate.certificate.index,
        certificateCn: candidate.certificate.cn,
        loginCode: parsedLogin.code,
      },
    );
  }

  if (!loginSession.sessionMap) {
    const suffix = loginSession.errorMessage
      ? `: ${loginSession.errorMessage}`
      : "";
    return buildHomeTaxBusinessInfoLookupFailure(
      request,
      "business-info",
      `홈택스 로그인 세션 정보를 찾지 못했습니다${suffix}`,
      {
        certificateIndex: candidate.certificate.index,
        certificateCn: candidate.certificate.cn,
        loginCode: parsedLogin.code,
      },
    );
  }

  const sessionBusinessInfo = parseHomeTaxSessionBusinessInfo(
    loginSession.sessionMap,
  );
  if (!sessionBusinessInfo.businessNumber) {
    return buildHomeTaxBusinessInfoLookupFailure(
      request,
      "business-info",
      "홈택스 로그인 세션에서 사업자번호를 찾지 못했습니다.",
      {
        certificateIndex: candidate.certificate.index,
        certificateCn: candidate.certificate.cn,
        loginCode: parsedLogin.code,
      },
    );
  }

  let taxpayerBasicBusinessInfo: Awaited<
    ReturnType<typeof fetchHomeTaxTaxpayerBasicBusinessInfo>
  > | null = null;
  let taxpayerBasicLookupError: Error | null = null;
  try {
    const taxpayerBasicSession = await fetchHomeTaxTaxpayerBasicSession({
      cookieHeader: mergeCookieHeaders(
        authenticatedCookieHeader,
        loginSession.cookieHeader,
      ),
    });
    if (!context) {
      const openedContext = await openHomeTaxMagicLineBrowserContext();
      context = openedContext.context;
    }
    const taxpayerBasicLookupOptions = {
      cookieHeader: mergeCookieHeaders(
        authenticatedCookieHeader,
        loginSession.cookieHeader,
        taxpayerBasicSession.cookieHeader,
      ),
      businessNumber: sessionBusinessInfo.businessNumber,
      sessionMap: {
        ...(loginSession.sessionMap ?? {}),
        ...(taxpayerBasicSession.sessionMap ?? {}),
      },
    };
    taxpayerBasicBusinessInfo =
      await fetchHomeTaxTaxpayerBasicBusinessInfoInContext(
        context,
        taxpayerBasicLookupOptions,
      );
    if (!hasHomeTaxTaxpayerBasicAddress(taxpayerBasicBusinessInfo)) {
      const retryTaxpayerBasicBusinessInfo =
        await fetchHomeTaxTaxpayerBasicBusinessInfoInContext(
          context,
          taxpayerBasicLookupOptions,
        );
      taxpayerBasicBusinessInfo = pickHomeTaxTaxpayerBasicBusinessInfo([
        taxpayerBasicBusinessInfo,
        retryTaxpayerBasicBusinessInfo,
      ]);
    }
  } catch (error) {
    taxpayerBasicLookupError =
      error instanceof Error
        ? error
        : new Error("홈택스 세적 기본 조회 중 알 수 없는 오류가 발생했습니다.");
  }

  const fallbackName = candidate.certificate.cn || request.certificateCn || "";
  const companyName =
    taxpayerBasicBusinessInfo?.companyName?.trim() ||
    sessionBusinessInfo.companyName?.trim() ||
    parsedLogin.companyName?.trim() ||
    fallbackName;
  const snapshot = {
    ...buildEmptyRenewalInfoSnapshot(),
    companyName,
    businessNumber: sessionBusinessInfo.businessNumber,
    ceoName:
      taxpayerBasicBusinessInfo?.ceoName?.trim() ||
      sessionBusinessInfo.ceoName?.trim() ||
      parsedLogin.ceoName?.trim() ||
      companyName,
    postalCode:
      taxpayerBasicBusinessInfo?.postalCode ?? sessionBusinessInfo.postalCode,
    baseAddress:
      taxpayerBasicBusinessInfo?.baseAddress ?? sessionBusinessInfo.baseAddress,
    detailAddress:
      taxpayerBasicBusinessInfo?.detailAddress ??
      sessionBusinessInfo.detailAddress,
  };
  const taxpayerBasicHasAddress =
    hasHomeTaxTaxpayerBasicAddress(taxpayerBasicBusinessInfo) ||
    Boolean(sessionBusinessInfo.baseAddress?.trim() || sessionBusinessInfo.detailAddress?.trim());
  const taxpayerBasicLookupMessage = taxpayerBasicLookupError
    ? ` 홈택스 세적 기본 조회는 실패했습니다: ${taxpayerBasicLookupError.message}`
    : taxpayerBasicBusinessInfo
      ? taxpayerBasicHasAddress
        ? " 홈택스 세적 기본 조회 결과를 함께 확인했습니다."
        : " 홈택스 세적 기본 조회는 완료됐지만 주소 필드를 찾지 못했습니다."
      : " 홈택스 세적 기본 조회는 실패했습니다: 응답에서 사업자 기본정보를 찾지 못했습니다.";

  const result: HomeTaxBusinessInfoLookupResult = {
    ok: true,
    source: "hometax",
    status: resolveSuccessfulBusinessInfoStatus(snapshot),
    stage: "business-info",
    certificateIndex: candidate.certificate.index,
    certificateCn: candidate.certificate.cn,
    sourcePort: HOMETAX_MAGICLINE_PORT,
    loginCode: parsedLogin.code,
    businessInfoSnapshot: snapshot,
    message: `홈택스 공동인증서 로그인 세션에서 사업자정보를 확인했습니다.${taxpayerBasicLookupMessage}`,
    error: null,
  };
  return result;
  } finally {
    await context?.close().catch(() => undefined);
  }
}

export function createHomeTaxBusinessInfoLookupHandler(options: {
  collectCertificateCandidates: () => Promise<HomeTaxMagicLineRawCertificateCandidate[]>;
}): HomeTaxBusinessInfoLookupHandler {
  return async (request) =>
    await collectHomeTaxBusinessInfoLookupWithDependencies(
      request,
      options.collectCertificateCandidates,
    );
}
