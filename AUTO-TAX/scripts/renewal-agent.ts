import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_SERVER_URL = "http://127.0.0.1:4300";
const DEFAULT_INTERVAL_MS = 5000;
const SIGNGATE_RENEW_URL = "https://www.signgate.com/renew/stepEntrpsCrtfctCnfirm.sg";
const SIGNGATE_ORIGIN = "https://www.signgate.com";
const SIGNGATE_CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;
const PORT_TARGETS = [
  { port: 14315, protocol: "https" as const },
  { port: 14319, protocol: "http" as const }
];

type BridgeProbeResult = {
  process: {
    detected: boolean;
    names: string[];
    detail: string | null;
  };
  bridge: {
    summary: "ok" | "partial" | "down" | "unknown";
    ports: Array<{
      port: number;
      protocol: "https" | "http";
      reachable: boolean;
      latencyMs: number | null;
      error: string | null;
    }>;
    versionProbe: {
      ok: boolean;
      sourcePort: number | null;
      values: {
        kpmcnt: string | null;
        kpmsvc: string | null;
        secukitNX: string | null;
      };
      error: string | null;
    };
    licenseProbe: {
      ok: boolean;
      sourcePort: number | null;
      error: string | null;
    };
    storageProbe: {
      ok: boolean;
      sourcePort: number | null;
      mediaType: "HDD";
      certificateCount: number;
      certificates: Array<{
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
      }>;
      error: string | null;
    };
    selectionProbe: {
      ok: boolean;
      sourcePort: number | null;
      certificateIndex: string | null;
      certificateCn: string | null;
      certID: string | null;
      error: string | null;
    };
    preflightProbe: {
      ok: boolean;
      sourcePort: number | null;
      certificateIndex: string | null;
      certificateCn: string | null;
      certID: string | null;
      branch: "change-company" | "renew-info" | "renew-payment" | "password-confirm" | "unsupported" | "unknown";
      branchPageUrl: string | null;
      issueCompany: string | null;
      companyChkYn: string | null;
      policy: string | null;
      orderNo: string | null;
      orderSeq: string | null;
      orderStatus: string | null;
      orderApplySeCd: string | null;
      payYn: string | null;
      nextUrl: string | null;
      actionImageUrl: string | null;
      actionImageAlt: string | null;
      externalFlowKind: "apply-form" | "unknown" | null;
      externalFlowProductName: string | null;
      externalFlowProductId: string | null;
      externalFlowSubmitUrl: string | null;
      externalFlowSubmitPathKind: "apply" | "renew" | "unknown" | null;
      rawCode: string | null;
      message: string | null;
      error: string | null;
    };
  };
  notes: string[];
};

type ClaimedJob = {
  id: number;
  type: "bridge-probe";
  customerId: number | null;
  customerName: string | null;
} | {
  id: number;
  type: "certid-probe";
  customerId: number | null;
  customerName: string | null;
  certificateIndex: number;
  certificateCn: string | null;
} | {
  id: number;
  type: "renewal-preflight";
  customerId: number | null;
  customerName: string | null;
  certificateIndex: number;
  certificateCn: string | null;
} | null;

type BridgeJsonResponse = {
  status?: string;
  reply?: Record<string, unknown>;
};

type SignGateRuntimeConfig = {
  origin: string;
  referer: string;
  license: string;
  configUrl: string;
};

type BridgeCommandResult = {
  ok: boolean;
  sourcePort: number | null;
  status: string | null;
  reply: Record<string, unknown> | null;
  error: string | null;
};

type SelectionProbeRequest = {
  certificateIndex: number;
  certificateCn: string | null;
};

let cachedSignGateRuntimeConfig:
  | {
      fetchedAt: number;
      value: SignGateRuntimeConfig;
    }
  | null = null;

let cachedDetailedBridgeStatus: Pick<BridgeProbeResult["bridge"], "licenseProbe" | "storageProbe"> = {
  licenseProbe: {
    ok: false,
    sourcePort: null,
    error: null
  },
  storageProbe: {
    ok: false,
    sourcePort: null,
    mediaType: "HDD",
    certificateCount: 0,
    certificates: [],
    error: null
  }
};

let cachedSelectionProbe: BridgeProbeResult["bridge"]["selectionProbe"] = {
  ok: false,
  sourcePort: null,
  certificateIndex: null,
  certificateCn: null,
  certID: null,
  error: null
};

let cachedPreflightProbe: BridgeProbeResult["bridge"]["preflightProbe"] = {
  ok: false,
  sourcePort: null,
  certificateIndex: null,
  certificateCn: null,
  certID: null,
  branch: "unknown",
  branchPageUrl: null,
  issueCompany: null,
  companyChkYn: null,
  policy: null,
  orderNo: null,
  orderSeq: null,
  orderStatus: null,
  orderApplySeCd: null,
  payYn: null,
  nextUrl: null,
  actionImageUrl: null,
  actionImageAlt: null,
  externalFlowKind: null,
  externalFlowProductName: null,
  externalFlowProductId: null,
  externalFlowSubmitUrl: null,
  externalFlowSubmitPathKind: null,
  rawCode: null,
  message: null,
  error: null
};

function readPackageVersion(): string {
  const packageFile = path.resolve(process.cwd(), "package.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(packageFile, "utf8")) as { version?: string };
    return parsed.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getArgValue(flag: string): string | null {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      return args[index + 1] ?? null;
    }
    if (args[index]?.startsWith(`${flag}=`)) {
      return args[index]!.slice(flag.length + 1);
    }
  }
  return null;
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).some((arg) => arg === flag);
}

function resolveServerUrl(): string {
  return (
    getArgValue("--server") ??
    process.env.AUTO_TAX_SERVER_URL ??
    DEFAULT_SERVER_URL
  ).replace(/\/+$/, "");
}

function resolveIntervalMs(): number {
  const raw = getArgValue("--interval-ms") ?? process.env.AUTO_TAX_RENEWAL_AGENT_INTERVAL_MS;
  if (!raw) {
    return DEFAULT_INTERVAL_MS;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_INTERVAL_MS;
}

function resolveAgentId(): string {
  return (
    getArgValue("--agent-id") ??
    process.env.AUTO_TAX_RENEWAL_AGENT_ID ??
    `${os.hostname().toLowerCase()}-renewal-agent`
  );
}

function resolveRunOnce(): boolean {
  return hasFlag("--once") || process.env.AUTO_TAX_RENEWAL_AGENT_ONCE === "1";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeTcpPort(port: number, timeoutMs = 1200): Promise<{
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host: "127.0.0.1", port });

    const finish = (result: { reachable: boolean; latencyMs: number | null; error: string | null }) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      finish({
        reachable: true,
        latencyMs: Date.now() - startedAt,
        error: null
      });
    });
    socket.once("timeout", () => {
      finish({
        reachable: false,
        latencyMs: null,
        error: "timeout"
      });
    });
    socket.once("error", (error) => {
      finish({
        reachable: false,
        latencyMs: null,
        error: error.message
      });
    });
  });
}

function summarizeBridge(ports: Array<{ reachable: boolean }>): "ok" | "partial" | "down" | "unknown" {
  if (ports.length === 0) {
    return "unknown";
  }

  const reachableCount = ports.filter((port) => port.reachable).length;
  if (reachableCount === ports.length) {
    return "ok";
  }
  if (reachableCount === 0) {
    return "down";
  }
  return "partial";
}

function defaultLicenseProbe(): BridgeProbeResult["bridge"]["licenseProbe"] {
  return {
    ok: false,
    sourcePort: null,
    error: null
  };
}

function defaultStorageProbe(): BridgeProbeResult["bridge"]["storageProbe"] {
  return {
    ok: false,
    sourcePort: null,
    mediaType: "HDD",
    certificateCount: 0,
    certificates: [],
    error: null
  };
}

function defaultSelectionProbe(): BridgeProbeResult["bridge"]["selectionProbe"] {
  return {
    ok: false,
    sourcePort: null,
    certificateIndex: null,
    certificateCn: null,
    certID: null,
    error: null
  };
}

function defaultPreflightProbe(): BridgeProbeResult["bridge"]["preflightProbe"] {
  return {
    ok: false,
    sourcePort: null,
    certificateIndex: null,
    certificateCn: null,
    certID: null,
    branch: "unknown",
    branchPageUrl: null,
    issueCompany: null,
    companyChkYn: null,
    policy: null,
    orderNo: null,
    orderSeq: null,
    orderStatus: null,
    orderApplySeCd: null,
    payYn: null,
    nextUrl: null,
    actionImageUrl: null,
    actionImageAlt: null,
    externalFlowKind: null,
    externalFlowProductName: null,
    externalFlowProductId: null,
    externalFlowSubmitUrl: null,
    externalFlowSubmitPathKind: null,
    rawCode: null,
    message: null,
    error: null
  };
}

function cloneDetailedBridgeStatus(): Pick<BridgeProbeResult["bridge"], "licenseProbe" | "storageProbe"> {
  return {
    licenseProbe: {
      ...cachedDetailedBridgeStatus.licenseProbe
    },
    storageProbe: {
      ...cachedDetailedBridgeStatus.storageProbe,
      certificates: cachedDetailedBridgeStatus.storageProbe.certificates.map((certificate) => ({ ...certificate }))
    }
  };
}

function cloneSelectionProbe(): BridgeProbeResult["bridge"]["selectionProbe"] {
  return {
    ...cachedSelectionProbe
  };
}

function clonePreflightProbe(): BridgeProbeResult["bridge"]["preflightProbe"] {
  return {
    ...cachedPreflightProbe
  };
}

function resolveCertificatePassword(): string | null {
  const passwordFile = process.env.AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE?.trim();
  if (passwordFile) {
    const filePath = path.isAbsolute(passwordFile) ? passwordFile : path.resolve(process.cwd(), passwordFile);
    const fileValue = fs.readFileSync(filePath, "utf8").trim();
    return fileValue || null;
  }

  const password = process.env.AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD?.trim();
  return password || null;
}

async function fetchRenewPageCookieHeader(): Promise<string> {
  const response = await fetch(SIGNGATE_RENEW_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
      Referer: SIGNGATE_RENEW_URL,
      Origin: SIGNGATE_ORIGIN
    }
  });

  if (!response.ok) {
    throw new Error(`SignGate renew page HTTP ${response.status}`);
  }

  const setCookies = response.headers.getSetCookie?.() ?? [];
  return setCookies.map((value) => value.split(";")[0]).join("; ");
}

async function postRenewAjax(
  cookieHeader: string,
  endpoint: string,
  formData: URLSearchParams
): Promise<Record<string, unknown>> {
  const response = await fetch(`${SIGNGATE_ORIGIN}${endpoint}`, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
      Referer: SIGNGATE_RENEW_URL,
      Origin: SIGNGATE_ORIGIN,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    },
    body: formData.toString()
  });

  if (!response.ok) {
    throw new Error(`${endpoint} HTTP ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function postRenewPage(
  cookieHeader: string,
  pathname: string,
  formData: URLSearchParams
): Promise<string> {
  const response = await fetch(`${SIGNGATE_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
      Referer: SIGNGATE_RENEW_URL,
      Origin: SIGNGATE_ORIGIN,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    },
    body: formData.toString()
  });

  if (!response.ok) {
    throw new Error(`${pathname} HTTP ${response.status}`);
  }

  return response.text();
}

function parseChangeCompanyAction(html: string): {
  actionUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
} {
  const actionMatches = [...html.matchAll(/^[ \t]*window\.open\('([^']+)'\s*,\s*'event'/gm)];
  const actionUrl = actionMatches.length > 0 ? actionMatches[actionMatches.length - 1]![1] : null;
  const imageMatch = html.match(/<img src="([^"]*changeDiscountEvent[^"]*)" alt="([^"]*)"/i);
  return {
    actionUrl,
    imageUrl: imageMatch?.[1] ? new URL(imageMatch[1], SIGNGATE_ORIGIN).toString() : null,
    imageAlt: imageMatch?.[2] ?? null
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractHiddenInputValue(html: string, name: string): string | null {
  const escapedName = escapeRegExp(name);
  const patterns = [
    new RegExp(`<input[^>]*name=["']${escapedName}["'][^>]*value=["']([^"']*)["']`, "i"),
    new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${escapedName}["']`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function parseExternalApplyFlow(
  html: string,
  pageUrl: string
): Pick<
  BridgeProbeResult["bridge"]["preflightProbe"],
  | "externalFlowKind"
  | "externalFlowProductName"
  | "externalFlowProductId"
  | "externalFlowSubmitUrl"
  | "externalFlowSubmitPathKind"
> {
  const formMatch = html.match(/<form[^>]*id=["']applyForm["'][^>]*action\s*=\s*["']([^"']+)["']/i);
  const submitUrl = formMatch?.[1] ? new URL(formMatch[1], pageUrl).toString() : null;
  const hasApplyForm = Boolean(submitUrl);
  const hasApplyCommonScript = /kica-applyCommon\.js/i.test(html);
  const hasApplicationSection = /data-sectionType=["']aply["']/i.test(html);
  const flowKind = hasApplyForm || hasApplyCommonScript || hasApplicationSection ? "apply-form" : "unknown";

  let submitPathKind: BridgeProbeResult["bridge"]["preflightProbe"]["externalFlowSubmitPathKind"] = null;
  if (submitUrl) {
    if (submitUrl.includes("/apply/")) {
      submitPathKind = "apply";
    } else if (submitUrl.includes("/renew/")) {
      submitPathKind = "renew";
    } else {
      submitPathKind = "unknown";
    }
  }

  return {
    externalFlowKind: flowKind,
    externalFlowProductName: extractHiddenInputValue(html, "raProdNm"),
    externalFlowProductId: extractHiddenInputValue(html, "prodId"),
    externalFlowSubmitUrl: submitUrl,
    externalFlowSubmitPathKind: submitPathKind
  };
}

async function collectSelectedCertificateMaterial(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: SelectionProbeRequest
): Promise<{
  selectionProbe: BridgeProbeResult["bridge"]["selectionProbe"];
  userDN: string;
  serialNo: string;
  signCert: string;
  signedData: string;
}> {
  const selectionProbe = await probeCertificateSelection(target, signGateConfig, selectionRequest);
  if (!selectionProbe.ok || !selectionProbe.certID) {
    throw new Error(selectionProbe.error ?? "선택 인증서 certID 조회에 실패했습니다.");
  }

  const detailResult = await invokeBridgeCommand(target, {
    token: "empty",
    callback: "probeCallback",
    fname: "viewCertDetailInfomationIssue",
    args: [{ ID: String(selectionRequest.certificateIndex) }],
    origin: signGateConfig.origin,
    referer: signGateConfig.referer
  });
  const detailErrorCode = typeof detailResult.reply?.ERROR_CODE === "string" ? detailResult.reply.ERROR_CODE : null;
  if (!detailResult.ok || detailErrorCode) {
    throw new Error(
      normalizeBridgeError(
        detailResult.reply,
        detailResult.error ?? `viewCertDetailInfomationIssue status=${detailResult.status ?? "unknown"}`
      )
    );
  }

  const userDN = typeof detailResult.reply?.userDN === "string" ? detailResult.reply.userDN.trim() : "";
  const serialNo = typeof detailResult.reply?.serial === "string" ? detailResult.reply.serial.trim() : "";
  if (!userDN || !serialNo) {
    throw new Error("인증서 상세정보에서 userDN 또는 serial 값을 얻지 못했습니다.");
  }

  const showCertResult = await invokeBridgeCommand(target, {
    token: "empty",
    callback: "probeCallback",
    fname: "showCert",
    args: [
      {
        certType: "SignCert",
        sourceString: "한국정보인증1234567890!@#$%^&*()Test",
        algorithm: "SHA256",
        certID: selectionProbe.certID
      }
    ],
    origin: signGateConfig.origin,
    referer: signGateConfig.referer
  });
  const showCertErrorCode =
    typeof showCertResult.reply?.ERROR_CODE === "string" ? showCertResult.reply.ERROR_CODE : null;
  if (!showCertResult.ok || showCertErrorCode) {
    throw new Error(
      normalizeBridgeError(
        showCertResult.reply,
        showCertResult.error ?? `showCert status=${showCertResult.status ?? "unknown"}`
      )
    );
  }

  const signCert = typeof showCertResult.reply?.signCert === "string" ? showCertResult.reply.signCert : "";
  const signedData = typeof showCertResult.reply?.signedData === "string" ? showCertResult.reply.signedData : "";
  if (!signCert || !signedData) {
    throw new Error("showCert 응답에서 signCert 또는 signedData를 얻지 못했습니다.");
  }

  return {
    selectionProbe,
    userDN,
    serialNo,
    signCert,
    signedData
  };
}

function buildPreflightNextUrl(renewInfo: Record<string, unknown>): {
  branch: BridgeProbeResult["bridge"]["preflightProbe"]["branch"];
  nextUrl: string | null;
} {
  const orderStatus = typeof renewInfo.ordPrgrsSttsCd === "string" ? renewInfo.ordPrgrsSttsCd : null;
  const orderApplySeCd = typeof renewInfo.orderApplySeCd === "string" ? renewInfo.orderApplySeCd : null;
  const payYn = typeof renewInfo.payYn === "string" ? renewInfo.payYn : null;

  if (orderStatus === "OPS170") {
    return {
      branch: "renew-info",
      nextUrl: `${SIGNGATE_ORIGIN}/renew/stepEntrpsApplyInfoInput.sg`
    };
  }

  if ((orderStatus === "OPS110" || orderStatus === "OPS130") && orderApplySeCd === "ASM121") {
    return {
      branch: "renew-payment",
      nextUrl: `${SIGNGATE_ORIGIN}/renew/stepEntrpsRenewPayment.sg`
    };
  }

  if (payYn === "Y" && orderApplySeCd === "ASM121" && orderStatus === "OPS120") {
    return {
      branch: "password-confirm",
      nextUrl: `${SIGNGATE_ORIGIN}/renew/stepEntrpsPasswordCnfirm.sg`
    };
  }

  return {
    branch: "unknown",
    nextUrl: null
  };
}

async function probeRenewalPreflight(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: SelectionProbeRequest
): Promise<BridgeProbeResult["bridge"]["preflightProbe"]> {
  const preflightProbe = defaultPreflightProbe();
  preflightProbe.sourcePort = target.port;
  preflightProbe.certificateIndex = String(selectionRequest.certificateIndex);
  preflightProbe.certificateCn = selectionRequest.certificateCn;

  try {
    const material = await collectSelectedCertificateMaterial(target, signGateConfig, selectionRequest);
    preflightProbe.certID = material.selectionProbe.certID;

    const formData = new URLSearchParams({
      dn: material.userDN,
      serial_no: material.serialNo,
      signCert: material.signCert,
      signData: material.signedData
    });
    const cookieHeader = await fetchRenewPageCookieHeader();
    const companyCheck = await postRenewAjax(cookieHeader, "/renew/ajaxEntrpsCompanyCheck.json", formData);

    preflightProbe.companyChkYn =
      typeof companyCheck.companyChkYn === "string" ? companyCheck.companyChkYn : null;
    preflightProbe.issueCompany =
      typeof companyCheck.issueCompany === "string" ? companyCheck.issueCompany : null;
    preflightProbe.policy = typeof companyCheck.policy === "string" ? companyCheck.policy : null;
    preflightProbe.rawCode = typeof companyCheck.ERRCODE === "string" ? companyCheck.ERRCODE : null;
    preflightProbe.message = typeof companyCheck.ERRMSG === "string" ? companyCheck.ERRMSG : null;

    if (preflightProbe.companyChkYn === "Y") {
      preflightProbe.branchPageUrl = `${SIGNGATE_ORIGIN}/renew/stepEntrpsChangeCompany.sg`;
      const changeCompanyPage = await postRenewPage(
        cookieHeader,
        "/renew/stepEntrpsChangeCompany.sg",
        new URLSearchParams({
          changeDn: material.userDN,
          changeOid: preflightProbe.policy ?? "",
          changeCompany: preflightProbe.issueCompany ?? "",
          companyChkYn: preflightProbe.companyChkYn
        })
      );
      const changeCompanyAction = parseChangeCompanyAction(changeCompanyPage);
      preflightProbe.ok = true;
      preflightProbe.branch = "change-company";
      preflightProbe.nextUrl = changeCompanyAction.actionUrl ?? preflightProbe.branchPageUrl;
      preflightProbe.actionImageUrl = changeCompanyAction.imageUrl;
      preflightProbe.actionImageAlt = changeCompanyAction.imageAlt;
      if (changeCompanyAction.actionUrl) {
        try {
          const externalApplyPage = await fetchText(changeCompanyAction.actionUrl);
          Object.assign(preflightProbe, parseExternalApplyFlow(externalApplyPage, changeCompanyAction.actionUrl));
        } catch {
          preflightProbe.externalFlowKind = "unknown";
        }
      }
      return preflightProbe;
    }

    const renewInfo = await postRenewAjax(cookieHeader, "/renew/ajaxEntrpsRenewInfoCheck.json", formData);
    preflightProbe.rawCode = typeof renewInfo.ERRCODE === "string" ? renewInfo.ERRCODE : preflightProbe.rawCode;
    preflightProbe.message = typeof renewInfo.ERRMSG === "string" ? renewInfo.ERRMSG : preflightProbe.message;
    preflightProbe.orderNo = typeof renewInfo.ordno === "string" ? renewInfo.ordno : null;
    preflightProbe.orderSeq = typeof renewInfo.ordSeq === "string" ? renewInfo.ordSeq : null;
    preflightProbe.orderStatus = typeof renewInfo.ordPrgrsSttsCd === "string" ? renewInfo.ordPrgrsSttsCd : null;
    preflightProbe.orderApplySeCd =
      typeof renewInfo.orderApplySeCd === "string" ? renewInfo.orderApplySeCd : null;
    preflightProbe.payYn = typeof renewInfo.payYn === "string" ? renewInfo.payYn : null;

    if (preflightProbe.rawCode !== "0000") {
      preflightProbe.branch = "unsupported";
      preflightProbe.error = preflightProbe.message ?? "갱신 가능한 공동인증서가 아닙니다.";
      return preflightProbe;
    }

    const nextStep = buildPreflightNextUrl(renewInfo);
    preflightProbe.ok = true;
    preflightProbe.branch = nextStep.branch;
    preflightProbe.nextUrl = nextStep.nextUrl;
    return preflightProbe;
  } catch (error) {
    preflightProbe.error = error instanceof Error ? error.message : "갱신 경로 분석 실패";
    return preflightProbe;
  }
}

function extractNxConfigUrl(pageHtml: string): string {
  const match = pageHtml.match(/src="([^"]*\/statics\/secuKitNX\/KICA\/config\/nx_config\.js[^"]*)"/i);
  if (!match?.[1]) {
    throw new Error("SignGate nx_config.js 경로를 찾지 못했습니다.");
  }

  return new URL(match[1], SIGNGATE_ORIGIN).toString();
}

function extractSignGateLicense(configSource: string): string {
  const blockMatch = configSource.match(
    /if\s*\(\s*document\.location\.hostname\.indexOf\('signgate\.com'\)\s*>=\s*0\s*\)\s*\{([\s\S]*?)\}\s*else\s*\{/m
  );
  const scanSource = blockMatch?.[1] ?? configSource;

  for (const rawLine of scanSource.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) {
      continue;
    }

    const match = line.match(/^NXS_LICENSE\s*=\s*'([^']+)';$/);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error("SignGate NXS_LICENSE 값을 찾지 못했습니다.");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export async function resolveSignGateRuntimeConfig(forceRefresh = false): Promise<SignGateRuntimeConfig> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedSignGateRuntimeConfig &&
    now - cachedSignGateRuntimeConfig.fetchedAt < SIGNGATE_CONFIG_CACHE_TTL_MS
  ) {
    return cachedSignGateRuntimeConfig.value;
  }

  const pageHtml = await fetchText(SIGNGATE_RENEW_URL);
  const configUrl = extractNxConfigUrl(pageHtml);
  const configSource = await fetchText(configUrl);
  const license = extractSignGateLicense(configSource);

  cachedSignGateRuntimeConfig = {
    fetchedAt: now,
    value: {
      origin: SIGNGATE_ORIGIN,
      referer: SIGNGATE_RENEW_URL,
      license,
      configUrl
    }
  };

  return cachedSignGateRuntimeConfig.value;
}

function normalizeBridgeError(reply: Record<string, unknown> | null, fallback: string): string {
  const message = typeof reply?.ERROR_MESSAGE === "string" ? reply.ERROR_MESSAGE.trim() : "";
  const code = typeof reply?.ERROR_CODE === "string" ? reply.ERROR_CODE.trim() : "";
  if (message) {
    return code ? `${message} (${code})` : message;
  }
  return fallback;
}

function parseStorageCertificates(reply: Record<string, unknown> | null): BridgeProbeResult["bridge"]["storageProbe"]["certificates"] {
  if (!reply) {
    return [];
  }

  const count = Number.parseInt(String(reply.size ?? "0"), 10);
  if (!Number.isFinite(count) || count <= 0) {
    return [];
  }

  const certificates: BridgeProbeResult["bridge"]["storageProbe"]["certificates"] = [];
  for (let index = 1; index <= count; index += 1) {
    const rawEntry = reply[String(index)] as Record<string, unknown> | undefined;
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }

    certificates.push({
      index: String(rawEntry.index ?? index),
      cn: typeof rawEntry.cn === "string" ? rawEntry.cn : "",
      issuerToName: typeof rawEntry.issuerToName === "string" ? rawEntry.issuerToName : "",
      usageToName: typeof rawEntry.usageToName === "string" ? rawEntry.usageToName : "",
      todate: typeof rawEntry.todate === "string" ? rawEntry.todate : null,
      oid: typeof rawEntry.oid === "string" ? rawEntry.oid : null,
      serial: null,
      userDN: typeof rawEntry.userDN === "string" ? rawEntry.userDN : null,
      validateFrom: null,
      detailValidateTo: null,
      certDirPath: null
    });
  }

  return certificates;
}

function mergeCertificateDetail(
  certificate: BridgeProbeResult["bridge"]["storageProbe"]["certificates"][number],
  reply: Record<string, unknown> | null
): BridgeProbeResult["bridge"]["storageProbe"]["certificates"][number] {
  if (!reply) {
    return certificate;
  }

  return {
    ...certificate,
    issuerToName:
      typeof reply.issuerToString === "string" && reply.issuerToString.trim() !== ""
        ? reply.issuerToString
        : certificate.issuerToName,
    usageToName:
      typeof reply.policyToName === "string" && reply.policyToName.trim() !== ""
        ? reply.policyToName
        : certificate.usageToName,
    todate:
      typeof reply.validateTo === "string" && reply.validateTo.trim() !== ""
        ? reply.validateTo
        : certificate.todate,
    oid:
      typeof reply.policy === "string" && reply.policy.trim() !== ""
        ? reply.policy
        : certificate.oid,
    serial: typeof reply.serial === "string" ? reply.serial : certificate.serial,
    userDN: typeof reply.userDN === "string" ? reply.userDN : certificate.userDN,
    validateFrom: typeof reply.validateFrom === "string" ? reply.validateFrom : certificate.validateFrom,
    detailValidateTo:
      typeof reply.detailValidateTo === "string" ? reply.detailValidateTo : certificate.detailValidateTo,
    certDirPath: typeof reply.certDirPath === "string" ? reply.certDirPath : certificate.certDirPath
  };
}

async function probeCertificateSelection(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: SelectionProbeRequest
): Promise<BridgeProbeResult["bridge"]["selectionProbe"]> {
  const selectionProbe = defaultSelectionProbe();
  selectionProbe.sourcePort = target.port;
  selectionProbe.certificateIndex = String(selectionRequest.certificateIndex);
  selectionProbe.certificateCn = selectionRequest.certificateCn;

  let password: string | null = null;
  try {
    password = resolveCertificatePassword();
  } catch (error) {
    selectionProbe.error = error instanceof Error ? error.message : "인증서 비밀번호를 읽지 못했습니다.";
    return selectionProbe;
  }
  if (!password) {
    selectionProbe.error =
      "AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD 또는 AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE 설정이 필요합니다.";
    return selectionProbe;
  }

  const storageResult = await invokeBridgeCommand(target, {
    token: "empty",
    callback: "probeCallback",
    fname: "selectStorageIssue",
    args: [{ mediaType: "HDD", extraValue: "NULL" }],
    origin: signGateConfig.origin,
    referer: signGateConfig.referer
  });

  const storageErrorCode = typeof storageResult.reply?.ERROR_CODE === "string" ? storageResult.reply.ERROR_CODE : null;
  if (!storageResult.ok || storageErrorCode) {
    selectionProbe.error = normalizeBridgeError(
      storageResult.reply,
      storageResult.error ?? `selectStorageIssue status=${storageResult.status ?? "unknown"}`
    );
    return selectionProbe;
  }

  const selectionResult = await invokeBridgeCommand(target, {
    token: "empty",
    callback: "probeCallback",
    fname: "selectCertificateIssue",
    args: [
      {
        ID: String(selectionRequest.certificateIndex),
        password,
        certID: "@signgate.com"
      }
    ],
    origin: signGateConfig.origin,
    referer: signGateConfig.referer
  });

  const selectionErrorCode =
    typeof selectionResult.reply?.ERROR_CODE === "string" ? selectionResult.reply.ERROR_CODE : null;
  const certID = typeof selectionResult.reply?.certID === "string" ? selectionResult.reply.certID.trim() : "";
  if (selectionResult.ok && !selectionErrorCode && certID) {
    selectionProbe.ok = true;
    selectionProbe.certID = certID;
    selectionProbe.error = null;
    return selectionProbe;
  }

  selectionProbe.error = normalizeBridgeError(
    selectionResult.reply,
    selectionResult.error ??
      (selectionResult.ok && !selectionErrorCode ? "selectCertificateIssue 응답에 certID가 없습니다." : `selectCertificateIssue status=${selectionResult.status ?? "unknown"}`)
  );
  return selectionProbe;
}

export async function invokeBridgeCommand(
  target: (typeof PORT_TARGETS)[number],
  options: {
    token: string;
    callback: string;
    fname: string;
    args: unknown[];
    origin?: string;
    referer?: string;
  }
): Promise<BridgeCommandResult> {
  const payload = JSON.stringify({
    callback: options.callback,
    exfunc: {
      fname: options.fname,
      args: options.args
    }
  });
  const query = `?TOKEN=${encodeURIComponent(options.token)}&serviceType=1`;

  if (process.platform === "win32") {
    try {
      const url = `${target.protocol}://127.0.0.1:${target.port}${query}`;
      const args = [
        ...(target.protocol === "https" ? ["-k"] : []),
        "-sS",
        "-H",
        "Accept: application/JSON",
        "-H",
        "Content-Type: text/plain",
        ...(options.origin ? ["-H", `Origin: ${options.origin}`] : []),
        ...(options.referer ? ["-H", `Referer: ${options.referer}`] : []),
        "--data",
        payload,
        url
      ];
      const { stdout } = await execFileAsync("curl.exe", args, { timeout: 5000 });
      const parsed = JSON.parse(stdout) as BridgeJsonResponse;

      return {
        ok: parsed.status === "0",
        sourcePort: target.port,
        status: parsed.status ?? null,
        reply: parsed.reply ?? null,
        error: null
      };
    } catch (error) {
      return {
        ok: false,
        sourcePort: target.port,
        status: null,
        reply: null,
        error: error instanceof Error ? error.message : "bridge command failed"
      };
    }
  }

  const transport = target.protocol === "https" ? https : http;
  const agent = target.protocol === "https" ? new https.Agent({ rejectUnauthorized: false }) : undefined;

  return new Promise((resolve) => {
    const req = transport.request(
      {
        host: "127.0.0.1",
        port: target.port,
        path: query,
        method: "POST",
        headers: {
          Accept: "application/JSON",
          "Content-Type": "text/plain",
          "Content-Length": Buffer.byteLength(payload),
          ...(options.origin ? { Origin: options.origin } : {}),
          ...(options.referer ? { Referer: options.referer } : {})
        },
        agent,
        timeout: 3500
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body) as BridgeJsonResponse;
            resolve({
              ok: parsed.status === "0",
              sourcePort: target.port,
              status: parsed.status ?? null,
              reply: parsed.reply ?? null,
              error: null
            });
          } catch (error) {
            resolve({
              ok: false,
              sourcePort: target.port,
              status: null,
              reply: null,
              error: error instanceof Error ? error.message : "JSON parse failed"
            });
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      resolve({
        ok: false,
        sourcePort: target.port,
        status: null,
        reply: null,
        error: error.message
      });
    });
    req.write(payload);
    req.end();
  });
}

export async function detectSecuKitProcesses(): Promise<{
  detected: boolean;
  names: string[];
  detail: string | null;
}> {
  if (process.platform !== "win32") {
    return {
      detected: false,
      names: [],
      detail: "Windows 전용 프로세스 감지는 현재 플랫폼에서 생략됩니다."
    };
  }

  try {
    const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV", "/NH"]);
    const matched = stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^"([^"]+)"/)?.[1]?.trim() ?? "")
      .filter(Boolean)
      .filter((name) => {
        const normalized = name.toLowerCase();
        return normalized.includes("secukit") || normalized.includes("kpmsvc") || normalized.includes("kpmcnt");
      });

    return {
      detected: matched.length > 0,
      names: [...new Set(matched)],
      detail: matched.length > 0 ? `tasklist 일치 ${matched.length}건` : "일치하는 SecuKit 프로세스를 찾지 못했습니다."
    };
  } catch (error) {
    return {
      detected: false,
      names: [],
      detail: error instanceof Error ? error.message : "tasklist 실행 실패"
    };
  }
}

export async function invokeGetVersion(
  target: (typeof PORT_TARGETS)[number]
): Promise<{
  ok: boolean;
  sourcePort: number | null;
  values: {
    kpmcnt: string | null;
    kpmsvc: string | null;
    secukitNX: string | null;
    };
  error: string | null;
}> {
  const result = await invokeBridgeCommand(target, {
    token: "Getversion",
    callback: "probeCallback",
    fname: "GetVersion",
    args: [{ TOKEN: "Getversion" }]
  });
  const values = {
    kpmcnt: typeof result.reply?.result === "object" && result.reply?.result !== null && "kpmcnt" in result.reply.result
      ? String((result.reply.result as Record<string, unknown>).kpmcnt ?? "")
      : null,
    kpmsvc: typeof result.reply?.result === "object" && result.reply?.result !== null && "kpmsvc" in result.reply.result
      ? String((result.reply.result as Record<string, unknown>).kpmsvc ?? "")
      : null,
    secukitNX: typeof result.reply?.result === "object" && result.reply?.result !== null && "secukitNX" in result.reply.result
      ? String((result.reply.result as Record<string, unknown>).secukitNX ?? "")
      : null
  };

  if (result.ok && (values.kpmcnt || values.kpmsvc || values.secukitNX)) {
    return {
      ok: true,
      sourcePort: target.port,
      values,
      error: null
    };
  }

  return {
    ok: false,
    sourcePort: target.port,
    values,
    error: result.error ?? `status=${result.status ?? "unknown"}`
  };
}

export async function probeBridgeVersion(): Promise<BridgeProbeResult["bridge"]["versionProbe"]> {
  for (const target of PORT_TARGETS) {
    const result = await invokeGetVersion(target);
    if (result.ok) {
      return result;
    }
  }

  return {
    ok: false,
    sourcePort: null,
    values: {
      kpmcnt: null,
      kpmsvc: null,
      secukitNX: null
    },
    error: "GetVersion 호출이 모든 포트에서 실패했습니다."
  };
}

export async function probeLicenseAndStorage(
  signGateConfig: SignGateRuntimeConfig,
  options?: {
    selectionRequest?: SelectionProbeRequest | null;
  }
): Promise<Pick<BridgeProbeResult["bridge"], "licenseProbe" | "storageProbe" | "selectionProbe">> {
  let licenseProbe = defaultLicenseProbe();
  let storageProbe = defaultStorageProbe();
  let selectionProbe = defaultSelectionProbe();

  for (const target of PORT_TARGETS) {
    const licenseResult = await invokeBridgeCommand(target, {
      token: "empty",
      callback: "secukitnxInterface.SecuKitNX_EXCallBack",
      fname: "checkLicense",
      args: [{ license: signGateConfig.license }],
      origin: signGateConfig.origin,
      referer: signGateConfig.referer
    });

    const licenseOk = licenseResult.ok && licenseResult.reply?.checkLicense === "Y";
    if (licenseOk) {
      licenseProbe = {
        ok: true,
        sourcePort: target.port,
        error: null
      };
    } else {
      licenseProbe = {
        ok: false,
        sourcePort: target.port,
        error: normalizeBridgeError(
          licenseResult.reply,
          licenseResult.error ?? `checkLicense status=${licenseResult.status ?? "unknown"}`
        )
      };
      continue;
    }

    const storageResult = await invokeBridgeCommand(target, {
      token: "empty",
      callback: "probeCallback",
      fname: "selectStorageIssue",
      args: [{ mediaType: "HDD", extraValue: "NULL" }],
      origin: signGateConfig.origin,
      referer: signGateConfig.referer
    });

    const storageReply = storageResult.reply;
    const storageErrorCode = typeof storageReply?.ERROR_CODE === "string" ? storageReply.ERROR_CODE : null;
    if (storageResult.ok && !storageErrorCode) {
      const certificates = parseStorageCertificates(storageReply);
      const detailedCertificates: typeof certificates = [];

      for (const certificate of certificates) {
        const detailResult = await invokeBridgeCommand(target, {
          token: "empty",
          callback: "probeCallback",
          fname: "viewCertDetailInfomationIssue",
          args: [{ ID: certificate.index }],
          origin: signGateConfig.origin,
          referer: signGateConfig.referer
        });
        const detailErrorCode = typeof detailResult.reply?.ERROR_CODE === "string" ? detailResult.reply.ERROR_CODE : null;
        if (detailResult.ok && !detailErrorCode) {
          detailedCertificates.push(mergeCertificateDetail(certificate, detailResult.reply));
          continue;
        }

        detailedCertificates.push(certificate);
      }

      storageProbe = {
        ok: true,
        sourcePort: target.port,
        mediaType: "HDD",
        certificateCount: detailedCertificates.length,
        certificates: detailedCertificates,
        error: null
      };

      if (options?.selectionRequest) {
        selectionProbe = await probeCertificateSelection(target, signGateConfig, options.selectionRequest);
      }

      return { licenseProbe, storageProbe, selectionProbe };
    }

    storageProbe = {
      ok: false,
      sourcePort: target.port,
      mediaType: "HDD",
      certificateCount: 0,
      certificates: [],
      error: normalizeBridgeError(
        storageReply,
        storageResult.error ?? `selectStorageIssue status=${storageResult.status ?? "unknown"}`
      )
    };
  }

  if (options?.selectionRequest) {
    selectionProbe = {
      ...defaultSelectionProbe(),
      certificateIndex: String(options.selectionRequest.certificateIndex),
      certificateCn: options.selectionRequest.certificateCn,
      error: storageProbe.error ?? licenseProbe.error ?? "certID 조회 전 단계가 실패했습니다."
    };
  }

  return { licenseProbe, storageProbe, selectionProbe };
}

export async function collectBridgeProbeResult(options?: {
  includeDetailedProbe?: boolean;
  selectionRequest?: SelectionProbeRequest | null;
  preflightRequest?: SelectionProbeRequest | null;
}): Promise<BridgeProbeResult> {
  const [processStatus, portChecks, versionProbe] = await Promise.all([
    detectSecuKitProcesses(),
    Promise.all(
      PORT_TARGETS.map(async ({ port, protocol }) => {
        const result = await probeTcpPort(port);
        return {
          port,
          protocol,
          reachable: result.reachable,
          latencyMs: result.latencyMs,
          error: result.error
        };
      })
    ),
    probeBridgeVersion()
  ]);

  const summary = summarizeBridge(portChecks);
  let { licenseProbe, storageProbe } = cloneDetailedBridgeStatus();
  let selectionProbe = cloneSelectionProbe();
  let preflightProbe = clonePreflightProbe();

  if (options?.includeDetailedProbe) {
    try {
      const signGateConfig = await resolveSignGateRuntimeConfig();
      const detailed = await probeLicenseAndStorage(signGateConfig, {
        selectionRequest: options.selectionRequest ?? null
      });
      licenseProbe = detailed.licenseProbe;
      storageProbe = detailed.storageProbe;
      if (options?.selectionRequest) {
        selectionProbe = detailed.selectionProbe;
        cachedSelectionProbe = {
          ...selectionProbe
        };
      }
      if (options?.preflightRequest) {
        const preflightTarget =
          PORT_TARGETS.find((target) => target.port === (licenseProbe.sourcePort ?? selectionProbe.sourcePort ?? null)) ??
          PORT_TARGETS[0]!;
        preflightProbe = await probeRenewalPreflight(preflightTarget, signGateConfig, options.preflightRequest);
        cachedPreflightProbe = {
          ...preflightProbe
        };
      }
      cachedDetailedBridgeStatus = {
        licenseProbe: {
          ...licenseProbe
        },
        storageProbe: {
          ...storageProbe,
          certificates: storageProbe.certificates.map((certificate) => ({ ...certificate }))
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "SignGate 구성 조회 실패";
      licenseProbe = {
        ok: false,
        sourcePort: null,
        error: message
      };
      storageProbe = {
        ok: false,
        sourcePort: null,
        mediaType: "HDD",
        certificateCount: 0,
        certificates: [],
        error: message
      };
      if (options?.selectionRequest) {
        selectionProbe = {
          ...defaultSelectionProbe(),
          certificateIndex: String(options.selectionRequest.certificateIndex),
          certificateCn: options.selectionRequest.certificateCn,
          error: message
        };
        cachedSelectionProbe = {
          ...selectionProbe
        };
      }
      if (options?.preflightRequest) {
        preflightProbe = {
          ...defaultPreflightProbe(),
          certificateIndex: String(options.preflightRequest.certificateIndex),
          certificateCn: options.preflightRequest.certificateCn,
          error: message
        };
        cachedPreflightProbe = {
          ...preflightProbe
        };
      }
      cachedDetailedBridgeStatus = {
        licenseProbe: {
          ...licenseProbe
        },
        storageProbe: {
          ...storageProbe,
          certificates: []
        }
      };
    }
  }

  const notes: string[] = [];

  if (!processStatus.detected) {
    notes.push("SecuKit 관련 프로세스가 감지되지 않았습니다.");
  }
  if (summary === "down") {
    notes.push("127.0.0.1:14315/14319 포트 모두 연결되지 않았습니다.");
  } else if (summary === "partial") {
    notes.push("로컬 브리지 포트가 일부만 응답합니다.");
  }
  if (versionProbe.ok) {
    notes.push(
      `GetVersion 성공: secukitNX ${versionProbe.values.secukitNX ?? "-"}, kpmcnt ${versionProbe.values.kpmcnt ?? "-"}, kpmsvc ${versionProbe.values.kpmsvc ?? "-"}`
    );
  } else if (versionProbe.error) {
    notes.push(`GetVersion 실패: ${versionProbe.error}`);
  }
  if (licenseProbe.ok) {
    notes.push(`SignGate 라이선스 검증 성공: ${licenseProbe.sourcePort}`);
  } else if (licenseProbe.error) {
    notes.push(`SignGate 라이선스 검증 실패: ${licenseProbe.error}`);
  }
  if (storageProbe.ok) {
    notes.push(`HDD 인증서 목록/세부정보 조회 성공: ${storageProbe.certificateCount}건`);
  } else if (storageProbe.error) {
    notes.push(`HDD 인증서 목록 조회 실패: ${storageProbe.error}`);
  }
  if (selectionProbe.ok) {
    notes.push(
      `selectCertificateIssue 성공: index ${selectionProbe.certificateIndex ?? "-"}, certID ${selectionProbe.certID ?? "-"}`
    );
  } else if (selectionProbe.error) {
    notes.push(`selectCertificateIssue 실패: ${selectionProbe.error}`);
  }
  if (preflightProbe.ok) {
    notes.push(
      preflightProbe.branch === "change-company" && preflightProbe.externalFlowKind === "apply-form"
        ? `갱신 경로 분석 성공: 순정 갱신 아님 -> ${preflightProbe.issueCompany ?? "-"} -> 외부 신규신청형 ${preflightProbe.externalFlowProductName ?? "신청서"}`
        : `갱신 경로 분석 성공: ${preflightProbe.branch}${preflightProbe.nextUrl ? ` -> ${preflightProbe.nextUrl}` : ""}`
    );
  } else if (preflightProbe.error || preflightProbe.message) {
    notes.push(`갱신 경로 분석 실패: ${preflightProbe.error ?? preflightProbe.message ?? "원인 미상"}`);
  }

  return {
    process: processStatus,
    bridge: {
      summary,
      ports: portChecks,
      versionProbe,
      licenseProbe,
      storageProbe,
      selectionProbe,
      preflightProbe
    },
    notes
  };
}

export async function requestJson<T>(serverUrl: string, pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${serverUrl}${pathname}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: "요청 실패" }))) as { error?: string };
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function sendHeartbeat(serverUrl: string, agentId: string, version: string, probeResult: BridgeProbeResult): Promise<void> {
  await requestJson(serverUrl, "/api/automation/renewal-agent/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      agentId,
      hostname: os.hostname(),
      version,
      os: `${process.platform} ${os.release()}`,
      process: probeResult.process,
      bridge: probeResult.bridge,
      notes: probeResult.notes
    })
  });
}

export async function claimNextJob(serverUrl: string, agentId: string): Promise<ClaimedJob> {
  const payload = await requestJson<{ job: ClaimedJob }>(serverUrl, "/api/automation/renewal-agent/jobs/claim", {
    method: "POST",
    body: JSON.stringify({ agentId })
  });
  return payload.job;
}

export async function completeJob(serverUrl: string, agentId: string, jobId: number, probeResult: BridgeProbeResult): Promise<void> {
  await requestJson(serverUrl, `/api/automation/renewal-agent/jobs/${jobId}/complete`, {
    method: "POST",
    body: JSON.stringify({
      agentId,
      result: probeResult
    })
  });
}

export async function failJob(serverUrl: string, agentId: string, jobId: number, error: string): Promise<void> {
  await requestJson(serverUrl, `/api/automation/renewal-agent/jobs/${jobId}/fail`, {
    method: "POST",
    body: JSON.stringify({
      agentId,
      error
    })
  });
}

export async function runRenewalAgentLoop(): Promise<void> {
  const serverUrl = resolveServerUrl();
  const intervalMs = resolveIntervalMs();
  const version = readPackageVersion();
  const agentId = resolveAgentId();
  const runOnce = resolveRunOnce();

  console.log(`[renewal-agent] server=${serverUrl}`);
  console.log(`[renewal-agent] agentId=${agentId}`);
  console.log(`[renewal-agent] version=${version}`);
  console.log("[renewal-agent] heartbeat: bridge/version probe");
  console.log("[renewal-agent] queued job: SignGate license + HDD certificate list probe");
  console.log("[renewal-agent] certID probe requires AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD or AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE");
  console.log("[renewal-agent] renewal preflight replays showCert + SignGate AJAX to detect the next renewal step");

  while (true) {
    try {
      const heartbeatProbe = await collectBridgeProbeResult({ includeDetailedProbe: false });
      await sendHeartbeat(serverUrl, agentId, version, heartbeatProbe);

      const job = await claimNextJob(serverUrl, agentId);
      if (job?.type === "bridge-probe") {
        try {
          const result = await collectBridgeProbeResult({ includeDetailedProbe: true });
          await completeJob(serverUrl, agentId, job.id, result);
          console.log(`[renewal-agent] job ${job.id} completed: ${result.bridge.summary}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "브리지 진단 실패";
          await failJob(serverUrl, agentId, job.id, message);
          console.error(`[renewal-agent] job ${job.id} failed: ${message}`);
        }
      } else if (job?.type === "certid-probe") {
        try {
          const result = await collectBridgeProbeResult({
            includeDetailedProbe: true,
            selectionRequest: {
              certificateIndex: job.certificateIndex,
              certificateCn: job.certificateCn
            }
          });
          await completeJob(serverUrl, agentId, job.id, result);
          console.log(
            `[renewal-agent] job ${job.id} certID probe: ${result.bridge.selectionProbe.ok ? result.bridge.selectionProbe.certID ?? "ok" : result.bridge.selectionProbe.error ?? "failed"}`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "certID 조회 실패";
          await failJob(serverUrl, agentId, job.id, message);
          console.error(`[renewal-agent] job ${job.id} failed: ${message}`);
        }
      } else if (job?.type === "renewal-preflight") {
        try {
          const result = await collectBridgeProbeResult({
            includeDetailedProbe: true,
            preflightRequest: {
              certificateIndex: job.certificateIndex,
              certificateCn: job.certificateCn
            }
          });
          await completeJob(serverUrl, agentId, job.id, result);
          console.log(
            `[renewal-agent] job ${job.id} renewal preflight: ${result.bridge.preflightProbe.branch}${result.bridge.preflightProbe.nextUrl ? ` -> ${result.bridge.preflightProbe.nextUrl}` : ""}`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "갱신 경로 분석 실패";
          await failJob(serverUrl, agentId, job.id, message);
          console.error(`[renewal-agent] job ${job.id} failed: ${message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "에이전트 루프 실패";
      console.error(`[renewal-agent] ${message}`);
    }

    if (runOnce) {
      break;
    }

    await delay(intervalMs);
  }
}

const isDirectExecution = (() => {
  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }

  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(currentFile) === path.resolve(entryArg);
})();

if (isDirectExecution) {
  void runRenewalAgentLoop();
}
