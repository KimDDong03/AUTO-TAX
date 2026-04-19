import { execFile, spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import {
  buildEffectiveRenewInfoSubmissionProfile,
  buildRenewInfoComparison,
  buildRenewInfoPaymentPreviewRequest,
  buildRenewInfoSubmitProfileReadiness,
  buildRenewInfoSubmitRequest,
  parseRenewInfoSubmitResult,
  parseRenewInfoFlow,
  parseRenewInfoPaymentPreview,
  parseRenewInfoSnapshot,
  parseRenewInfoSnapshotFromData,
} from "../server/src/services/renewal-page-parser.js";
import { resolveSelectionPassword } from "../server/src/services/renewal-password.js";
import { sanitizeSensitiveText } from "../server/src/utils.js";
import type {
  RenewalInfoSnapshot,
  RenewalPreflightComparisonProfile,
  RenewalPreflightSubmissionProfile,
} from "../server/src/domain.js";

const execFileAsync = promisify(execFile);
const DEFAULT_SERVER_URL = "http://127.0.0.1:4300";
const DEFAULT_INTERVAL_MS = 5000;
const SIGNGATE_RENEW_URL =
  "https://www.signgate.com/renew/stepEntrpsCrtfctCnfirm.sg";
const SIGNGATE_ORIGIN = "https://www.signgate.com";
const SIGNGATE_CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;
const SIGNGATE_COOKIE_HEADER_CACHE_TTL_MS = 30 * 1000;
const PORT_TARGETS = [
  { port: 14315, protocol: "https" as const },
  { port: 14319, protocol: "http" as const },
];

const FILESYSTEM_ELECTRONIC_TAX_OID = "1.2.410.200004.5.2.1.6.257";
const FILESYSTEM_USAGE_NAME_BY_OID: Record<string, string> = {
  "1.2.410.200004.5.2.1.6.257": "전자세금용",
  "1.2.410.200004.5.2.1.2": "범용(기업)",
  "1.2.410.200005.1.1.4": "은행/보험용",
};
const HDD_CERTIFICATE_STORAGE_DIR_NAMES = [
  "NPKI",
  "CrossCert",
  "SKCert",
  "certstorage",
  "VestCert",
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
        listSource?: "bridge-hdd" | "filesystem-hdd" | "ml4web-hdd" | "ml4web-web";
        supportsPreflight?: boolean;
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
      branch:
        | "change-company"
        | "renew-info"
        | "renew-payment"
        | "password-confirm"
        | "unsupported"
        | "unknown";
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
      renewInfoPageTitle: string | null;
      renewInfoSubmitUrl: string | null;
      renewInfoSubmitPathKind: "apply" | "renew" | "unknown" | null;
      renewInfoFormFieldNames: string[];
      renewInfoMustHaveFieldNames: string[];
      renewInfoFinalNum: string | null;
      renewInfoSnapshot: RenewalInfoSnapshot | null;
      renewInfoBlockingMismatchFields: string[];
      renewInfoAutoSubmitReady: boolean | null;
      renewInfoAutoSubmitSummary: string | null;
      renewInfoSubmitMissingFields: string[];
      renewInfoSubmitReady: boolean | null;
      renewInfoSubmitSummary: string | null;
      renewInfoSubmitAttempted: boolean | null;
      renewInfoSubmitResultBranch:
        | "renew-info"
        | "renew-payment"
        | "password-confirm"
        | "unknown"
        | null;
      renewInfoSubmitResultUrl: string | null;
      renewInfoSubmitResultPageTitle: string | null;
      renewInfoSubmitResultSummary: string | null;
      renewInfoSubmitResultError: string | null;
      renewInfoPaymentPreviewLoaded: boolean | null;
      renewInfoPaymentPreviewItems: string[];
      renewInfoPaymentPreviewTotalAmount: string | null;
      renewInfoPaymentPreviewHasAdditionalAgreement: boolean | null;
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

type ClaimedJob =
  | {
      id: number;
      type: "bridge-probe";
      customerId: number | null;
      customerName: string | null;
    }
  | {
      id: number;
      type: "certid-probe";
      customerId: number | null;
      customerName: string | null;
      certificateIndex: number;
      certificateCn: string | null;
    }
  | {
      id: number;
      type: "renewal-preflight";
      customerId: number | null;
      customerName: string | null;
      certificateIndex: number;
      certificateCn: string | null;
      comparisonProfile: RenewalPreflightComparisonProfile | null;
      submissionProfile: RenewalPreflightSubmissionProfile | null;
      executeSubmit?: boolean;
    }
  | null;

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
  certificatePassword?: string | null;
};

type RenewalPreflightRequest = SelectionProbeRequest & {
  comparisonProfile?: RenewalPreflightComparisonProfile | null;
  submissionProfile?: RenewalPreflightSubmissionProfile | null;
  executeSubmit?: boolean;
};

let cachedSignGateRuntimeConfig: {
  fetchedAt: number;
  value: SignGateRuntimeConfig;
} | null = null;

let cachedRenewPageCookieHeader: {
  fetchedAt: number;
  value: string;
} | null = null;

let cachedStableBridgeTargetPort: number | null = null;

let cachedDetailedBridgeStatus: Pick<
  BridgeProbeResult["bridge"],
  "licenseProbe" | "storageProbe"
> = {
  licenseProbe: {
    ok: false,
    sourcePort: null,
    error: null,
  },
  storageProbe: {
    ok: false,
    sourcePort: null,
    mediaType: "HDD",
    certificateCount: 0,
    certificates: [],
    error: null,
  },
};

let cachedBridgeCertificateListStatus: Pick<
  BridgeProbeResult["bridge"],
  "licenseProbe" | "storageProbe"
> | null = null;

let cachedSelectionProbe: BridgeProbeResult["bridge"]["selectionProbe"] = {
  ok: false,
  sourcePort: null,
  certificateIndex: null,
  certificateCn: null,
  certID: null,
  error: null,
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
  renewInfoPageTitle: null,
  renewInfoSubmitUrl: null,
  renewInfoSubmitPathKind: null,
  renewInfoFormFieldNames: [],
  renewInfoMustHaveFieldNames: [],
  renewInfoFinalNum: null,
  renewInfoSnapshot: null,
  renewInfoBlockingMismatchFields: [],
  renewInfoAutoSubmitReady: null,
  renewInfoAutoSubmitSummary: null,
  renewInfoSubmitMissingFields: [],
  renewInfoSubmitReady: null,
  renewInfoSubmitSummary: null,
  renewInfoSubmitAttempted: null,
  renewInfoSubmitResultBranch: null,
  renewInfoSubmitResultUrl: null,
  renewInfoSubmitResultPageTitle: null,
  renewInfoSubmitResultSummary: null,
  renewInfoSubmitResultError: null,
  renewInfoPaymentPreviewLoaded: null,
  renewInfoPaymentPreviewItems: [],
  renewInfoPaymentPreviewTotalAmount: null,
  renewInfoPaymentPreviewHasAdditionalAgreement: null,
  actionImageUrl: null,
  actionImageAlt: null,
  externalFlowKind: null,
  externalFlowProductName: null,
  externalFlowProductId: null,
  externalFlowSubmitUrl: null,
  externalFlowSubmitPathKind: null,
  rawCode: null,
  message: null,
  error: null,
};

let bridgeSelectionQueue = Promise.resolve();
const selectedStoragePorts = new Set<number>();

function readPackageVersion(): string {
  const candidatePackageFiles = [
    path.resolve(process.cwd(), "package.json"),
    process.argv[1]
      ? path.resolve(path.dirname(process.argv[1]), "..", "package.json")
      : null,
  ].filter((value): value is string => Boolean(value));

  for (const packageFile of candidatePackageFiles) {
    try {
      const parsed = JSON.parse(fs.readFileSync(packageFile, "utf8")) as {
        version?: string;
      };
      const version = parsed.version?.trim();
      if (version) {
        return version;
      }
    } catch {
      continue;
    }
  }

  return "0.0.0";
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
  const raw =
    getArgValue("--interval-ms") ??
    process.env.AUTO_TAX_RENEWAL_AGENT_INTERVAL_MS;
  if (!raw) {
    return DEFAULT_INTERVAL_MS;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000
    ? parsed
    : DEFAULT_INTERVAL_MS;
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

function resolveInternalSecret(): string {
  return (
    getArgValue("--secret") ??
    process.env.AUTO_TAX_RENEWAL_AGENT_SECRET ??
    process.env.AUTO_TAX_JOB_SECRET ??
    ""
  ).trim();
}

function buildInternalAuthHeaders(secret: string): Record<string, string> {
  return secret ? { "x-auto-tax-job-secret": secret } : {};
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeTcpPort(
  port: number,
  timeoutMs = 1200,
): Promise<{
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host: "127.0.0.1", port });

    const finish = (result: {
      reachable: boolean;
      latencyMs: number | null;
      error: string | null;
    }) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      finish({
        reachable: true,
        latencyMs: Date.now() - startedAt,
        error: null,
      });
    });
    socket.once("timeout", () => {
      finish({
        reachable: false,
        latencyMs: null,
        error: "timeout",
      });
    });
    socket.once("error", (error) => {
      finish({
        reachable: false,
        latencyMs: null,
        error: error.message,
      });
    });
  });
}

function summarizeBridge(
  ports: Array<{ reachable: boolean }>,
): "ok" | "partial" | "down" | "unknown" {
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
    error: null,
  };
}

function defaultStorageProbe(): BridgeProbeResult["bridge"]["storageProbe"] {
  return {
    ok: false,
    sourcePort: null,
    mediaType: "HDD",
    certificateCount: 0,
    certificates: [],
    error: null,
  };
}

function cloneStorageProbe(
  storageProbe: BridgeProbeResult["bridge"]["storageProbe"],
): BridgeProbeResult["bridge"]["storageProbe"] {
  return {
    ...storageProbe,
    certificates: storageProbe.certificates.map((certificate) => ({
      ...certificate,
    })),
  };
}

function defaultSelectionProbe(): BridgeProbeResult["bridge"]["selectionProbe"] {
  return {
    ok: false,
    sourcePort: null,
    certificateIndex: null,
    certificateCn: null,
    certID: null,
    error: null,
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
    renewInfoPageTitle: null,
    renewInfoSubmitUrl: null,
    renewInfoSubmitPathKind: null,
    renewInfoFormFieldNames: [],
    renewInfoMustHaveFieldNames: [],
    renewInfoFinalNum: null,
    renewInfoSnapshot: null,
    renewInfoBlockingMismatchFields: [],
    renewInfoAutoSubmitReady: null,
    renewInfoAutoSubmitSummary: null,
    renewInfoSubmitMissingFields: [],
    renewInfoSubmitReady: null,
    renewInfoSubmitSummary: null,
    renewInfoSubmitAttempted: null,
    renewInfoSubmitResultBranch: null,
    renewInfoSubmitResultUrl: null,
    renewInfoSubmitResultPageTitle: null,
    renewInfoSubmitResultSummary: null,
    renewInfoSubmitResultError: null,
    renewInfoPaymentPreviewLoaded: null,
    renewInfoPaymentPreviewItems: [],
    renewInfoPaymentPreviewTotalAmount: null,
    renewInfoPaymentPreviewHasAdditionalAgreement: null,
    actionImageUrl: null,
    actionImageAlt: null,
    externalFlowKind: null,
    externalFlowProductName: null,
    externalFlowProductId: null,
    externalFlowSubmitUrl: null,
    externalFlowSubmitPathKind: null,
    rawCode: null,
    message: null,
    error: null,
  };
}

function cloneDetailedBridgeStatus(): Pick<
  BridgeProbeResult["bridge"],
  "licenseProbe" | "storageProbe"
> {
  return {
    licenseProbe: {
      ...cachedDetailedBridgeStatus.licenseProbe,
    },
    storageProbe: cloneStorageProbe(cachedDetailedBridgeStatus.storageProbe),
  };
}

function cloneBridgeCertificateListStatus(): Pick<
  BridgeProbeResult["bridge"],
  "licenseProbe" | "storageProbe"
> | null {
  if (!cachedBridgeCertificateListStatus) {
    return null;
  }
  return {
    licenseProbe: {
      ...cachedBridgeCertificateListStatus.licenseProbe,
    },
    storageProbe: cloneStorageProbe(cachedBridgeCertificateListStatus.storageProbe),
  };
}

function cloneSelectionProbe(): BridgeProbeResult["bridge"]["selectionProbe"] {
  return {
    ...cachedSelectionProbe,
  };
}

function clonePreflightProbe(): BridgeProbeResult["bridge"]["preflightProbe"] {
  return {
    ...cachedPreflightProbe,
    renewInfoFormFieldNames: [...cachedPreflightProbe.renewInfoFormFieldNames],
    renewInfoMustHaveFieldNames: [
      ...cachedPreflightProbe.renewInfoMustHaveFieldNames,
    ],
    renewInfoSnapshot: cachedPreflightProbe.renewInfoSnapshot
      ? { ...cachedPreflightProbe.renewInfoSnapshot }
      : null,
    renewInfoBlockingMismatchFields: [
      ...cachedPreflightProbe.renewInfoBlockingMismatchFields,
    ],
    renewInfoAutoSubmitReady: cachedPreflightProbe.renewInfoAutoSubmitReady,
    renewInfoAutoSubmitSummary: cachedPreflightProbe.renewInfoAutoSubmitSummary,
    renewInfoSubmitMissingFields: [
      ...cachedPreflightProbe.renewInfoSubmitMissingFields,
    ],
    renewInfoSubmitReady: cachedPreflightProbe.renewInfoSubmitReady,
    renewInfoSubmitSummary: cachedPreflightProbe.renewInfoSubmitSummary,
    renewInfoSubmitAttempted: cachedPreflightProbe.renewInfoSubmitAttempted,
    renewInfoSubmitResultBranch:
      cachedPreflightProbe.renewInfoSubmitResultBranch,
    renewInfoSubmitResultUrl: cachedPreflightProbe.renewInfoSubmitResultUrl,
    renewInfoSubmitResultPageTitle:
      cachedPreflightProbe.renewInfoSubmitResultPageTitle,
    renewInfoSubmitResultSummary:
      cachedPreflightProbe.renewInfoSubmitResultSummary,
    renewInfoSubmitResultError: cachedPreflightProbe.renewInfoSubmitResultError,
    renewInfoPaymentPreviewItems: [
      ...cachedPreflightProbe.renewInfoPaymentPreviewItems,
    ],
  };
}

function cacheDetailedBridgeStatusValue(
  licenseProbe: BridgeProbeResult["bridge"]["licenseProbe"],
  storageProbe: BridgeProbeResult["bridge"]["storageProbe"],
) {
  cachedDetailedBridgeStatus = {
    licenseProbe: {
      ...licenseProbe,
    },
    storageProbe: {
      ...storageProbe,
      certificates: storageProbe.certificates.map((certificate) => ({
        ...certificate,
      })),
    },
  };
}

function cacheBridgeCertificateListStatusValue(
  licenseProbe: BridgeProbeResult["bridge"]["licenseProbe"],
  storageProbe: BridgeProbeResult["bridge"]["storageProbe"],
) {
  cachedBridgeCertificateListStatus = {
    licenseProbe: {
      ...licenseProbe,
    },
    storageProbe: cloneStorageProbe(storageProbe),
  };
}

function cacheSelectionProbeValue(
  selectionProbe: BridgeProbeResult["bridge"]["selectionProbe"],
) {
  cachedSelectionProbe = {
    ...selectionProbe,
  };
}

function cachePreflightProbeValue(
  preflightProbe: BridgeProbeResult["bridge"]["preflightProbe"],
) {
  cachedPreflightProbe = {
    ...preflightProbe,
    renewInfoFormFieldNames: [...preflightProbe.renewInfoFormFieldNames],
    renewInfoMustHaveFieldNames: [
      ...preflightProbe.renewInfoMustHaveFieldNames,
    ],
    renewInfoSnapshot: preflightProbe.renewInfoSnapshot
      ? { ...preflightProbe.renewInfoSnapshot }
      : null,
    renewInfoBlockingMismatchFields: [
      ...preflightProbe.renewInfoBlockingMismatchFields,
    ],
    renewInfoSubmitMissingFields: [
      ...preflightProbe.renewInfoSubmitMissingFields,
    ],
    renewInfoPaymentPreviewItems: [
      ...preflightProbe.renewInfoPaymentPreviewItems,
    ],
  };
}

async function runWithBridgeSelectionLock<T>(
  task: () => Promise<T>,
): Promise<T> {
  const previous = bridgeSelectionQueue;
  let release: (() => void) | null = null;
  bridgeSelectionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await task();
  } finally {
    release?.();
  }
}

function findPortTarget(
  port: number | null,
): (typeof PORT_TARGETS)[number] | null {
  if (!port) {
    return null;
  }

  return PORT_TARGETS.find((candidate) => candidate.port === port) ?? null;
}

function markStableBridgeTarget(port: number | null) {
  if (!port) {
    return;
  }

  if (!cachedStableBridgeTargetPort) {
    cachedStableBridgeTargetPort = port;
    return;
  }

  if (cachedStableBridgeTargetPort === port) {
    return;
  }

  const currentPriority = PORT_TARGETS.findIndex(
    (candidate) => candidate.port === cachedStableBridgeTargetPort,
  );
  const nextPriority = PORT_TARGETS.findIndex(
    (candidate) => candidate.port === port,
  );
  if (
    currentPriority === -1 ||
    (nextPriority !== -1 && nextPriority < currentPriority)
  ) {
    cachedStableBridgeTargetPort = port;
  }
}

function clearStableBridgeTarget(port: number) {
  if (cachedStableBridgeTargetPort === port) {
    cachedStableBridgeTargetPort = null;
  }
}

function markStorageSelected(port: number) {
  selectedStoragePorts.add(port);
  markStableBridgeTarget(port);
}

function clearStorageSelected(port: number) {
  selectedStoragePorts.delete(port);
}

function clearBridgeTargetState(port: number) {
  clearStorageSelected(port);
  clearStableBridgeTarget(port);
}

function isBridgeTransportFailureMessage(detail: string): boolean {
  if (!detail) {
    return false;
  }

  return /failed to connect to 127\.0\.0\.1 port|connection was reset|recv failure|econnreset|econnrefused|socket hang up|timed out|timeout/i.test(
    detail,
  );
}

function isRecoverableSelectionFailureMessage(detail: string): boolean {
  if (!detail) {
    return false;
  }

  return (
    isBridgeTransportFailureMessage(detail) ||
    /337707008|선택하신 인증서가 없습니다|인증서를 선택해 주십시오/i.test(
      detail,
    )
  );
}

async function fetchRenewPageCookieHeader(
  forceRefresh = false,
): Promise<string> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedRenewPageCookieHeader &&
    now - cachedRenewPageCookieHeader.fetchedAt <
      SIGNGATE_COOKIE_HEADER_CACHE_TTL_MS
  ) {
    return cachedRenewPageCookieHeader.value;
  }

  const response = await fetch(SIGNGATE_RENEW_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
      Referer: SIGNGATE_RENEW_URL,
      Origin: SIGNGATE_ORIGIN,
    },
  });

  if (!response.ok) {
    throw new Error(`SignGate renew page HTTP ${response.status}`);
  }

  const setCookies = response.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookies
    .map((value) => value.split(";")[0])
    .join("; ");
  cachedRenewPageCookieHeader = {
    fetchedAt: now,
    value: cookieHeader,
  };
  return cookieHeader;
}

async function postRenewAjax(
  cookieHeader: string,
  endpoint: string,
  formData: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${SIGNGATE_ORIGIN}${endpoint}`, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
      Referer: SIGNGATE_RENEW_URL,
      Origin: SIGNGATE_ORIGIN,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`${endpoint} HTTP ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function postRenewPage(
  cookieHeader: string,
  pathname: string,
  formData: URLSearchParams,
  options?: {
    referer?: string;
    requestedWithXmlHttpRequest?: boolean;
  },
): Promise<string> {
  const response = await fetch(`${SIGNGATE_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
      Referer: options?.referer ?? SIGNGATE_RENEW_URL,
      Origin: SIGNGATE_ORIGIN,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(options?.requestedWithXmlHttpRequest
        ? { "X-Requested-With": "XMLHttpRequest" }
        : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const compactText = responseText.replace(/\s+/g, " ").trim();
    const title =
      responseText
        .match(/<title>([^<]+)<\/title>/i)?.[1]
        ?.replace(/\s+/g, " ")
        .trim() ??
      responseText
        .match(/document\.title\s*=\s*"([^"]+)"/i)?.[1]
        ?.replace(/\s+/g, " ")
        .trim() ??
      null;
    const detail = title
      ? ` [${title}]`
      : compactText
        ? ` ${compactText.slice(0, 220)}`
        : "";
    throw new Error(`${pathname} HTTP ${response.status}${detail}`);
  }

  return response.text();
}

function parseChangeCompanyAction(html: string): {
  actionUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
} {
  const actionMatches = [
    ...html.matchAll(/^[ \t]*window\.open\('([^']+)'\s*,\s*'event'/gm),
  ];
  const actionUrl =
    actionMatches.length > 0
      ? actionMatches[actionMatches.length - 1]![1]
      : null;
  const imageMatch = html.match(
    /<img src="([^"]*changeDiscountEvent[^"]*)" alt="([^"]*)"/i,
  );
  return {
    actionUrl,
    imageUrl: imageMatch?.[1]
      ? new URL(imageMatch[1], SIGNGATE_ORIGIN).toString()
      : null,
    imageAlt: imageMatch?.[2] ?? null,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractHiddenInputValue(html: string, name: string): string | null {
  const escapedName = escapeRegExp(name);
  const patterns = [
    new RegExp(
      `<input[^>]*name=["']${escapedName}["'][^>]*value=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<input[^>]*value=["']([^"']*)["'][^>]*name=["']${escapedName}["']`,
      "i",
    ),
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
  pageUrl: string,
): Pick<
  BridgeProbeResult["bridge"]["preflightProbe"],
  | "externalFlowKind"
  | "externalFlowProductName"
  | "externalFlowProductId"
  | "externalFlowSubmitUrl"
  | "externalFlowSubmitPathKind"
> {
  const formMatch = html.match(
    /<form[^>]*id=["']applyForm["'][^>]*action\s*=\s*["']([^"']+)["']/i,
  );
  const submitUrl = formMatch?.[1]
    ? new URL(formMatch[1], pageUrl).toString()
    : null;
  const hasApplyForm = Boolean(submitUrl);
  const hasApplyCommonScript = /kica-applyCommon\.js/i.test(html);
  const hasApplicationSection = /data-sectionType=["']aply["']/i.test(html);
  const flowKind =
    hasApplyForm || hasApplyCommonScript || hasApplicationSection
      ? "apply-form"
      : "unknown";

  let submitPathKind: BridgeProbeResult["bridge"]["preflightProbe"]["externalFlowSubmitPathKind"] =
    null;
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
    externalFlowSubmitPathKind: submitPathKind,
  };
}

async function collectSelectedCertificateMaterial(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: SelectionProbeRequest,
): Promise<{
  selectionProbe: BridgeProbeResult["bridge"]["selectionProbe"];
  userDN: string;
  serialNo: string;
  signCert: string;
  signedData: string;
}> {
  const selectionProbe = await probeCertificateSelection(
    target,
    signGateConfig,
    selectionRequest,
  );
  if (!selectionProbe.ok || !selectionProbe.certID) {
    throw new Error(
      selectionProbe.error ?? "선택 인증서 certID 조회에 실패했습니다.",
    );
  }

  const detailResult = await invokeBridgeCommand(target, {
    token: "empty",
    callback: "probeCallback",
    fname: "viewCertDetailInfomationIssue",
    args: [{ ID: String(selectionRequest.certificateIndex) }],
    origin: signGateConfig.origin,
    referer: signGateConfig.referer,
  });
  const detailErrorCode =
    typeof detailResult.reply?.ERROR_CODE === "string"
      ? detailResult.reply.ERROR_CODE
      : null;
  if (!detailResult.ok || detailErrorCode) {
    throw new Error(
      normalizeBridgeError(
        detailResult.reply,
        detailResult.error ??
          `viewCertDetailInfomationIssue status=${detailResult.status ?? "unknown"}`,
      ),
    );
  }

  const userDN =
    typeof detailResult.reply?.userDN === "string"
      ? detailResult.reply.userDN.trim()
      : "";
  const serialNo =
    typeof detailResult.reply?.serial === "string"
      ? detailResult.reply.serial.trim()
      : "";
  if (!userDN || !serialNo) {
    throw new Error(
      "인증서 상세정보에서 userDN 또는 serial 값을 얻지 못했습니다.",
    );
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
        certID: selectionProbe.certID,
      },
    ],
    origin: signGateConfig.origin,
    referer: signGateConfig.referer,
  });
  const showCertErrorCode =
    typeof showCertResult.reply?.ERROR_CODE === "string"
      ? showCertResult.reply.ERROR_CODE
      : null;
  if (!showCertResult.ok || showCertErrorCode) {
    throw new Error(
      normalizeBridgeError(
        showCertResult.reply,
        showCertResult.error ??
          `showCert status=${showCertResult.status ?? "unknown"}`,
      ),
    );
  }

  const signCert =
    typeof showCertResult.reply?.signCert === "string"
      ? showCertResult.reply.signCert
      : "";
  const signedData =
    typeof showCertResult.reply?.signedData === "string"
      ? showCertResult.reply.signedData
      : "";
  if (!signCert || !signedData) {
    throw new Error(
      "showCert 응답에서 signCert 또는 signedData를 얻지 못했습니다.",
    );
  }

  return {
    selectionProbe,
    userDN,
    serialNo,
    signCert,
    signedData,
  };
}

function buildPreflightNextUrl(renewInfo: Record<string, unknown>): {
  branch: BridgeProbeResult["bridge"]["preflightProbe"]["branch"];
  nextUrl: string | null;
} {
  const orderStatus =
    typeof renewInfo.ordPrgrsSttsCd === "string"
      ? renewInfo.ordPrgrsSttsCd
      : null;
  const orderApplySeCd =
    typeof renewInfo.orderApplySeCd === "string"
      ? renewInfo.orderApplySeCd
      : null;
  const payYn = typeof renewInfo.payYn === "string" ? renewInfo.payYn : null;

  if (orderStatus === "OPS170") {
    return {
      branch: "renew-info",
      nextUrl: `${SIGNGATE_ORIGIN}/renew/stepEntrpsApplyInfoInput.sg`,
    };
  }

  if (
    (orderStatus === "OPS110" || orderStatus === "OPS130") &&
    orderApplySeCd === "ASM121"
  ) {
    return {
      branch: "renew-payment",
      nextUrl: `${SIGNGATE_ORIGIN}/renew/stepEntrpsRenewPayment.sg`,
    };
  }

  if (
    payYn === "Y" &&
    orderApplySeCd === "ASM121" &&
    orderStatus === "OPS120"
  ) {
    return {
      branch: "password-confirm",
      nextUrl: `${SIGNGATE_ORIGIN}/renew/stepEntrpsPasswordCnfirm.sg`,
    };
  }

  return {
    branch: "unknown",
    nextUrl: null,
  };
}

async function probeRenewalPreflight(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: RenewalPreflightRequest,
): Promise<BridgeProbeResult["bridge"]["preflightProbe"]> {
  const preflightProbe = defaultPreflightProbe();
  preflightProbe.sourcePort = target.port;
  preflightProbe.certificateIndex = String(selectionRequest.certificateIndex);
  preflightProbe.certificateCn = selectionRequest.certificateCn;

  try {
    const material = await collectSelectedCertificateMaterial(
      target,
      signGateConfig,
      selectionRequest,
    );
    preflightProbe.certID = material.selectionProbe.certID;

    const formData = new URLSearchParams({
      dn: material.userDN,
      serial_no: material.serialNo,
      signCert: material.signCert,
      signData: material.signedData,
    });
    const cookieHeader = await fetchRenewPageCookieHeader();
    const companyCheck = await postRenewAjax(
      cookieHeader,
      "/renew/ajaxEntrpsCompanyCheck.json",
      formData,
    );

    preflightProbe.companyChkYn =
      typeof companyCheck.companyChkYn === "string"
        ? companyCheck.companyChkYn
        : null;
    preflightProbe.issueCompany =
      typeof companyCheck.issueCompany === "string"
        ? companyCheck.issueCompany
        : null;
    preflightProbe.policy =
      typeof companyCheck.policy === "string" ? companyCheck.policy : null;
    preflightProbe.rawCode =
      typeof companyCheck.ERRCODE === "string" ? companyCheck.ERRCODE : null;
    preflightProbe.message =
      typeof companyCheck.ERRMSG === "string" ? companyCheck.ERRMSG : null;

    if (preflightProbe.companyChkYn === "Y") {
      preflightProbe.branchPageUrl = `${SIGNGATE_ORIGIN}/renew/stepEntrpsChangeCompany.sg`;
      const changeCompanyPage = await postRenewPage(
        cookieHeader,
        "/renew/stepEntrpsChangeCompany.sg",
        new URLSearchParams({
          changeDn: material.userDN,
          changeOid: preflightProbe.policy ?? "",
          changeCompany: preflightProbe.issueCompany ?? "",
          companyChkYn: preflightProbe.companyChkYn,
        }),
      );
      const changeCompanyAction = parseChangeCompanyAction(changeCompanyPage);
      preflightProbe.ok = true;
      preflightProbe.branch = "change-company";
      preflightProbe.nextUrl =
        changeCompanyAction.actionUrl ?? preflightProbe.branchPageUrl;
      preflightProbe.actionImageUrl = changeCompanyAction.imageUrl;
      preflightProbe.actionImageAlt = changeCompanyAction.imageAlt;
      if (changeCompanyAction.actionUrl) {
        try {
          const externalApplyPage = await fetchText(
            changeCompanyAction.actionUrl,
          );
          Object.assign(
            preflightProbe,
            parseExternalApplyFlow(
              externalApplyPage,
              changeCompanyAction.actionUrl,
            ),
          );
        } catch {
          preflightProbe.externalFlowKind = "unknown";
        }
      }
      return preflightProbe;
    }

    const renewInfo = await postRenewAjax(
      cookieHeader,
      "/renew/ajaxEntrpsRenewInfoCheck.json",
      formData,
    );
    preflightProbe.rawCode =
      typeof renewInfo.ERRCODE === "string"
        ? renewInfo.ERRCODE
        : preflightProbe.rawCode;
    preflightProbe.message =
      typeof renewInfo.ERRMSG === "string"
        ? renewInfo.ERRMSG
        : preflightProbe.message;
    preflightProbe.orderNo =
      typeof renewInfo.ordno === "string" ? renewInfo.ordno : null;
    preflightProbe.orderSeq =
      typeof renewInfo.ordSeq === "string" ? renewInfo.ordSeq : null;
    preflightProbe.orderStatus =
      typeof renewInfo.ordPrgrsSttsCd === "string"
        ? renewInfo.ordPrgrsSttsCd
        : null;
    preflightProbe.orderApplySeCd =
      typeof renewInfo.orderApplySeCd === "string"
        ? renewInfo.orderApplySeCd
        : null;
    preflightProbe.payYn =
      typeof renewInfo.payYn === "string" ? renewInfo.payYn : null;
    Object.assign(preflightProbe, parseRenewInfoSnapshotFromData(renewInfo));

    if (preflightProbe.rawCode !== "0000") {
      preflightProbe.branch = "unsupported";
      preflightProbe.error =
        preflightProbe.message ?? "갱신 가능한 공동인증서가 아닙니다.";
      return preflightProbe;
    }

    const nextStep = buildPreflightNextUrl(renewInfo);
    preflightProbe.ok = true;
    preflightProbe.branch = nextStep.branch;
    preflightProbe.nextUrl = nextStep.nextUrl;

    if (nextStep.branch === "renew-info" && nextStep.nextUrl) {
      try {
        const renewInfoPage = await postRenewPage(
          cookieHeader,
          "/renew/stepEntrpsApplyInfoInput.sg",
          formData,
        );
        Object.assign(
          preflightProbe,
          parseRenewInfoFlow(renewInfoPage, nextStep.nextUrl),
        );
        Object.assign(preflightProbe, parseRenewInfoSnapshot(renewInfoPage));
        const effectiveSubmissionProfile =
          buildEffectiveRenewInfoSubmissionProfile(
            preflightProbe.renewInfoSnapshot,
            selectionRequest.submissionProfile ?? null,
          );
        Object.assign(
          preflightProbe,
          buildRenewInfoComparison(
            preflightProbe.renewInfoSnapshot,
            selectionRequest.comparisonProfile ?? null,
          ),
        );
        Object.assign(
          preflightProbe,
          buildRenewInfoSubmitProfileReadiness(
            preflightProbe.renewInfoFormFieldNames,
            effectiveSubmissionProfile,
          ),
        );
        const paymentPreviewRequest = new URLSearchParams(
          buildRenewInfoPaymentPreviewRequest(renewInfoPage, nextStep.nextUrl),
        );
        const paymentPreviewHtml = await postRenewPage(
          cookieHeader,
          "/renew/getPayInfSection.sg",
          paymentPreviewRequest,
          {
            referer: nextStep.nextUrl,
            requestedWithXmlHttpRequest: true,
          },
        );
        Object.assign(
          preflightProbe,
          parseRenewInfoPaymentPreview(paymentPreviewHtml),
        );
        if (
          selectionRequest.executeSubmit === true &&
          preflightProbe.renewInfoSubmitReady === true &&
          effectiveSubmissionProfile &&
          preflightProbe.renewInfoSubmitUrl
        ) {
          try {
            const submitUrl = new URL(preflightProbe.renewInfoSubmitUrl);
            const submitRequest = new URLSearchParams(
              buildRenewInfoSubmitRequest(
                renewInfoPage,
                nextStep.nextUrl,
                effectiveSubmissionProfile,
              ),
            );
            const submitResultHtml = await postRenewPage(
              cookieHeader,
              submitUrl.pathname,
              submitRequest,
              {
                referer: nextStep.nextUrl,
              },
            );
            Object.assign(
              preflightProbe,
              parseRenewInfoSubmitResult(
                submitResultHtml,
                preflightProbe.renewInfoSubmitUrl,
              ),
            );
          } catch (error) {
            preflightProbe.renewInfoSubmitAttempted = true;
            preflightProbe.renewInfoSubmitResultError =
              error instanceof Error ? error.message : "신청정보 제출 실패";
            preflightProbe.renewInfoSubmitResultSummary = "신청정보 제출 실패";
          }
        }
      } catch {
        // The main preflight result remains valid even when the follow-up page
        // parsing fails during this probe attempt.
      }
    }

    return preflightProbe;
  } catch (error) {
    preflightProbe.error =
      error instanceof Error ? error.message : "갱신 경로 분석 실패";
    return preflightProbe;
  }
}

async function probeRenewalPreflightWithTransportRetry(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: RenewalPreflightRequest,
  retryCount = 1,
): Promise<BridgeProbeResult["bridge"]["preflightProbe"]> {
  let lastProbe = defaultPreflightProbe();

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const probe = await probeRenewalPreflight(
      target,
      signGateConfig,
      selectionRequest,
    );
    lastProbe = probe;
    if (!isBridgeTransportFailureMessage(probe.error ?? "")) {
      return probe;
    }

    clearBridgeTargetState(target.port);
    if (attempt < retryCount) {
      await delay(150);
    }
  }

  return lastProbe;
}

type RenewPaymentOpenContext = {
  sourcePort: number;
  cookieHeader: string;
  dn: string;
  serialNo: string;
  orderNo: string;
  orderSeq: string | null;
  orderStatus: string;
  orderApplySeCd: string;
};

async function prepareRenewPaymentOpenContextOnTarget(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: RenewalPreflightRequest,
): Promise<RenewPaymentOpenContext> {
  const material = await collectSelectedCertificateMaterial(
    target,
    signGateConfig,
    selectionRequest,
  );
  const formData = new URLSearchParams({
    dn: material.userDN,
    serial_no: material.serialNo,
    signCert: material.signCert,
    signData: material.signedData,
  });
  const cookieHeader = await fetchRenewPageCookieHeader();
  const companyCheck = await postRenewAjax(
    cookieHeader,
    "/renew/ajaxEntrpsCompanyCheck.json",
    formData,
  );
  const companyChkYn =
    typeof companyCheck.companyChkYn === "string"
      ? companyCheck.companyChkYn
      : null;
  const rawCode =
    typeof companyCheck.ERRCODE === "string" ? companyCheck.ERRCODE : null;
  const companyMessage =
    typeof companyCheck.ERRMSG === "string" ? companyCheck.ERRMSG : null;

  if (rawCode && rawCode !== "0000") {
    throw new Error(companyMessage ?? "갱신 가능한 공동인증서가 아닙니다.");
  }

  if (companyChkYn === "Y") {
    throw new Error(
      "회사정보 변경 경로로 이동하는 공동인증서는 자동으로 결제 창을 열 수 없습니다.",
    );
  }

  let renewInfo = await postRenewAjax(
    cookieHeader,
    "/renew/ajaxEntrpsRenewInfoCheck.json",
    formData,
  );
  const renewInfoCode =
    typeof renewInfo.ERRCODE === "string" ? renewInfo.ERRCODE : null;
  const renewInfoMessage =
    typeof renewInfo.ERRMSG === "string" ? renewInfo.ERRMSG : null;
  if (renewInfoCode && renewInfoCode !== "0000") {
    throw new Error(renewInfoMessage ?? "갱신 상태를 확인하지 못했습니다.");
  }

  let nextStep = buildPreflightNextUrl(renewInfo);
  if (nextStep.branch === "renew-info") {
    const renewInfoPage = await postRenewPage(
      cookieHeader,
      "/renew/stepEntrpsApplyInfoInput.sg",
      formData,
    );
    const effectiveSubmissionProfile = buildEffectiveRenewInfoSubmissionProfile(
      parseRenewInfoSnapshot(renewInfoPage).renewInfoSnapshot,
      selectionRequest.submissionProfile ?? null,
    );
    const readiness = buildRenewInfoSubmitProfileReadiness(
      parseRenewInfoFlow(renewInfoPage, nextStep.nextUrl ?? SIGNGATE_RENEW_URL)
        .renewInfoFormFieldNames,
      effectiveSubmissionProfile,
    );

    if (
      readiness.renewInfoSubmitReady !== true ||
      !effectiveSubmissionProfile
    ) {
      throw new Error(
        readiness.renewInfoSubmitSummary ??
          "갱신 신청정보 자동 제출 준비가 끝나지 않았습니다.",
      );
    }

    const submitUrl = parseRenewInfoFlow(
      renewInfoPage,
      nextStep.nextUrl ?? SIGNGATE_RENEW_URL,
    ).renewInfoSubmitUrl;
    if (!submitUrl) {
      throw new Error("갱신 신청정보 제출 주소를 찾지 못했습니다.");
    }

    const submitResultHtml = await postRenewPage(
      cookieHeader,
      new URL(submitUrl).pathname,
      new URLSearchParams(
        buildRenewInfoSubmitRequest(
          renewInfoPage,
          nextStep.nextUrl ?? submitUrl,
          effectiveSubmissionProfile,
        ),
      ),
      {
        referer: nextStep.nextUrl ?? SIGNGATE_RENEW_URL,
      },
    );
    const submitResult = parseRenewInfoSubmitResult(
      submitResultHtml,
      submitUrl,
    );
    if (submitResult.renewInfoSubmitResultBranch !== "renew-payment") {
      throw new Error(
        submitResult.renewInfoSubmitResultSummary ??
          "갱신 신청 후 결제 단계로 진입하지 못했습니다.",
      );
    }

    renewInfo = await postRenewAjax(
      cookieHeader,
      "/renew/ajaxEntrpsRenewInfoCheck.json",
      formData,
    );
    nextStep = buildPreflightNextUrl(renewInfo);
  }

  if (nextStep.branch !== "renew-payment") {
    throw new Error(
      "현재 공동인증서는 결제 단계가 아닙니다. 먼저 `갱신`을 눌러 준비 상태를 확인하세요.",
    );
  }

  const orderNo =
    typeof renewInfo.ordno === "string" ? renewInfo.ordno.trim() : "";
  const orderSeq =
    typeof renewInfo.ordSeq === "string" ? renewInfo.ordSeq.trim() : "";
  const orderStatus =
    typeof renewInfo.ordPrgrsSttsCd === "string"
      ? renewInfo.ordPrgrsSttsCd.trim()
      : "";
  const orderApplySeCd =
    typeof renewInfo.orderApplySeCd === "string"
      ? renewInfo.orderApplySeCd.trim()
      : "";
  if (!orderNo || !orderStatus || !orderApplySeCd) {
    throw new Error(
      "갱신 결제 화면 이동에 필요한 SignGate 주문 정보를 찾지 못했습니다.",
    );
  }

  return {
    sourcePort: target.port,
    cookieHeader,
    dn: material.userDN,
    serialNo: material.serialNo,
    orderNo,
    orderSeq: orderSeq || null,
    orderStatus,
    orderApplySeCd,
  };
}

export async function prepareRenewPaymentOpenContext(
  selectionRequest: RenewalPreflightRequest,
): Promise<RenewPaymentOpenContext> {
  const signGateConfig = await resolveSignGateRuntimeConfig();
  const errors: string[] = [];

  for (const target of buildOrderedPortTargets()) {
    try {
      return await prepareRenewPaymentOpenContextOnTarget(
        target,
        signGateConfig,
        selectionRequest,
      );
    } catch (error) {
      errors.push(
        `${target.port}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(errors[0] ?? "SignGate 갱신 결제 창을 준비하지 못했습니다.");
}

function extractNxConfigUrl(pageHtml: string): string {
  const match = pageHtml.match(
    /src="([^"]*\/statics\/secuKitNX\/KICA\/config\/nx_config\.js[^"]*)"/i,
  );
  if (!match?.[1]) {
    throw new Error("SignGate nx_config.js 경로를 찾지 못했습니다.");
  }

  return new URL(match[1], SIGNGATE_ORIGIN).toString();
}

function extractSignGateLicense(configSource: string): string {
  const blockMatch = configSource.match(
    /if\s*\(\s*document\.location\.hostname\.indexOf\('signgate\.com'\)\s*>=\s*0\s*\)\s*\{([\s\S]*?)\}\s*else\s*\{/m,
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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AUTO-TAX-Renewal-Agent/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export async function resolveSignGateRuntimeConfig(
  forceRefresh = false,
): Promise<SignGateRuntimeConfig> {
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
      configUrl,
    },
  };

  return cachedSignGateRuntimeConfig.value;
}

function normalizeBridgeError(
  reply: Record<string, unknown> | null,
  fallback: string,
): string {
  const message =
    typeof reply?.ERROR_MESSAGE === "string" ? reply.ERROR_MESSAGE.trim() : "";
  const code =
    typeof reply?.ERROR_CODE === "string" ? reply.ERROR_CODE.trim() : "";
  if (message) {
    return code ? `${message} (${code})` : message;
  }
  return fallback;
}

function parseStorageCertificates(
  reply: Record<string, unknown> | null,
): BridgeProbeResult["bridge"]["storageProbe"]["certificates"] {
  if (!reply) {
    return [];
  }

  const count = Number.parseInt(String(reply.size ?? "0"), 10);
  if (!Number.isFinite(count) || count <= 0) {
    return [];
  }

  const certificates: BridgeProbeResult["bridge"]["storageProbe"]["certificates"] =
    [];
  for (let index = 1; index <= count; index += 1) {
    const rawEntry = reply[String(index)] as
      | Record<string, unknown>
      | undefined;
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }

    certificates.push({
      index: String(rawEntry.index ?? index),
      cn: typeof rawEntry.cn === "string" ? rawEntry.cn : "",
      issuerToName:
        typeof rawEntry.issuerToName === "string" ? rawEntry.issuerToName : "",
      usageToName:
        typeof rawEntry.usageToName === "string" ? rawEntry.usageToName : "",
      todate: typeof rawEntry.todate === "string" ? rawEntry.todate : null,
      oid: typeof rawEntry.oid === "string" ? rawEntry.oid : null,
      serial: null,
      userDN: typeof rawEntry.userDN === "string" ? rawEntry.userDN : null,
      validateFrom: null,
      detailValidateTo: null,
      certDirPath: null,
      listSource: "bridge-hdd",
      supportsPreflight: true,
    });
  }

  return certificates;
}

function mergeCertificateDetail(
  certificate: BridgeProbeResult["bridge"]["storageProbe"]["certificates"][number],
  reply: Record<string, unknown> | null,
): BridgeProbeResult["bridge"]["storageProbe"]["certificates"][number] {
  if (!reply) {
    return certificate;
  }

  return {
    ...certificate,
    issuerToName:
      typeof reply.issuerToString === "string" &&
      reply.issuerToString.trim() !== ""
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
    serial:
      typeof reply.serial === "string" ? reply.serial : certificate.serial,
    userDN:
      typeof reply.userDN === "string" ? reply.userDN : certificate.userDN,
    validateFrom:
      typeof reply.validateFrom === "string"
        ? reply.validateFrom
        : certificate.validateFrom,
    detailValidateTo:
      typeof reply.detailValidateTo === "string"
        ? reply.detailValidateTo
        : certificate.detailValidateTo,
    certDirPath:
      typeof reply.certDirPath === "string"
        ? reply.certDirPath
        : certificate.certDirPath,
    listSource: certificate.listSource ?? "bridge-hdd",
    supportsPreflight: true,
  };
}

function normalizeCertificateMergeKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildFallbackCertificateMergeKey(
  certificate: BridgeProbeResult["bridge"]["storageProbe"]["certificates"][number],
): string {
  return [
    normalizeCertificateMergeKey(certificate.cn),
    normalizeCertificateMergeKey(certificate.issuerToName),
    normalizeCertificateMergeKey(certificate.usageToName),
    normalizeCertificateMergeKey(certificate.todate),
    normalizeCertificateMergeKey(certificate.detailValidateTo),
  ].join("|");
}

function mergeCertificateLists(options: {
  bridgeCertificates: BridgeProbeResult["bridge"]["storageProbe"]["certificates"];
  filesystemCertificates: BridgeProbeResult["bridge"]["storageProbe"]["certificates"];
}): BridgeProbeResult["bridge"]["storageProbe"]["certificates"] {
  const merged = options.bridgeCertificates.map((certificate) => ({
    ...certificate,
    listSource: certificate.listSource ?? "bridge-hdd",
    supportsPreflight: certificate.supportsPreflight ?? true,
  }));

  const seenSerials = new Set(
    merged
      .map((certificate) => normalizeCertificateMergeKey(certificate.serial))
      .filter(Boolean),
  );
  const seenUserDns = new Set(
    merged
      .map((certificate) => normalizeCertificateMergeKey(certificate.userDN))
      .filter(Boolean),
  );
  const seenFallbackKeys = new Set(
    merged.map((certificate) => buildFallbackCertificateMergeKey(certificate)),
  );

  for (const certificate of options.filesystemCertificates) {
    const serial = normalizeCertificateMergeKey(certificate.serial);
    const userDN = normalizeCertificateMergeKey(certificate.userDN);
    const fallbackKey = buildFallbackCertificateMergeKey(certificate);

    if (
      (serial && seenSerials.has(serial)) ||
      (userDN && seenUserDns.has(userDN)) ||
      seenFallbackKeys.has(fallbackKey)
    ) {
      continue;
    }

    merged.push({
      ...certificate,
      listSource: certificate.listSource ?? "filesystem-hdd",
      supportsPreflight: certificate.supportsPreflight ?? false,
    });
    if (serial) {
      seenSerials.add(serial);
    }
    if (userDN) {
      seenUserDns.add(userDN);
    }
    seenFallbackKeys.add(fallbackKey);
  }

  return merged;
}

function resolveFilesystemHddCertificateSearchRoots(): string[] {
  const homeDir = os.homedir();
  const explicitRoots = [
    path.join(homeDir, "Desktop"),
    path.join(homeDir, "Documents"),
    path.join(homeDir, "Downloads"),
    path.join(homeDir, "AppData", "LocalLow"),
    path.join(homeDir, "AppData", "Roaming"),
    process.env.ProgramFiles ?? "",
    process.env["ProgramFiles(x86)"] ?? "",
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  const uniqueRoots = new Set<string>();
  for (const root of explicitRoots) {
    try {
      const normalizedRoot = path.resolve(root);
      if (fs.existsSync(normalizedRoot)) {
        uniqueRoots.add(normalizedRoot);
      }
    } catch {
      continue;
    }
  }

  return [...uniqueRoots];
}

function shouldSkipFilesystemDirectoryScan(fullPath: string): boolean {
  const normalized = fullPath.replace(/\//g, "\\").toLowerCase();
  return (
    normalized.includes("\\node_modules\\") ||
    normalized.includes("\\.git\\") ||
    normalized.includes("\\appdata\\local\\temp\\") ||
    normalized.includes("\\temp\\") ||
    normalized.includes("\\cache\\")
  );
}

function collectNamedCertificateDirectories(
  baseRoot: string,
  depth = 0,
  maxDepth = 5,
  results = new Set<string>(),
): Set<string> {
  if (depth > maxDepth || shouldSkipFilesystemDirectoryScan(baseRoot)) {
    return results;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(baseRoot, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(baseRoot, entry.name);
    if (HDD_CERTIFICATE_STORAGE_DIR_NAMES.some((name) => name.toLowerCase() === entry.name.toLowerCase())) {
      results.add(fullPath);
      continue;
    }

    collectNamedCertificateDirectories(fullPath, depth + 1, maxDepth, results);
  }

  return results;
}

function collectSignCertDerFiles(
  rootDir: string,
  depth = 0,
  maxDepth = 8,
  results = new Set<string>(),
): Set<string> {
  if (depth > maxDepth || shouldSkipFilesystemDirectoryScan(rootDir)) {
    return results;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectSignCertDerFiles(fullPath, depth + 1, maxDepth, results);
      continue;
    }
    if (entry.isFile() && /^signCert\.der$/i.test(entry.name)) {
      results.add(fullPath);
    }
  }

  return results;
}

function extractDnAttributeValue(userDn: string, attribute: string): string | null {
  const pattern = new RegExp(`(?:^|,)${attribute}=([^,]+)`, "i");
  const match = userDn.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function resolveFilesystemCertificatePolicyOid(filePath: string): string | null {
  const result = spawnSync("certutil.exe", ["-dump", filePath], {
    encoding: "utf8",
    timeout: 8000,
    windowsHide: true,
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = text.match(/Policy Identifier=([0-9.]+)/i);
  return match?.[1]?.trim() ?? null;
}

function resolveUsageNameFromPolicyOid(oid: string | null): string {
  if (!oid) {
    return "알 수 없음";
  }
  return FILESYSTEM_USAGE_NAME_BY_OID[oid] ?? oid;
}

function resolveIssuerDisplayName(issuer: string): string {
  const organization = issuer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^O=/i.test(line))
    ?.replace(/^O=/i, "")
    .trim();
  if (organization === "KICA") {
    return "한국정보인증";
  }
  return organization || "알 수 없음";
}

function buildFilesystemCertificateIndex(input: string): string {
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = Math.abs(hash >>> 0) % 900000000;
  return String(-(100000000 + normalized));
}

function convertHexSerialToDecimal(serialHex: string): string | null {
  const normalized = serialHex.replace(/[^0-9a-f]/gi, "").trim();
  if (!normalized) {
    return null;
  }
  try {
    return BigInt(`0x${normalized}`).toString(10);
  } catch {
    return null;
  }
}

function collectFilesystemElectronicTaxCertificates(): BridgeProbeResult["bridge"]["storageProbe"]["certificates"] {
  if (process.platform !== "win32") {
    return [];
  }

  const storageRoots = resolveFilesystemHddCertificateSearchRoots();
  const namedDirectories = new Set<string>();
  for (const root of storageRoots) {
    collectNamedCertificateDirectories(root, 0, 5, namedDirectories);
  }

  const signCertPaths = new Set<string>();
  for (const directory of namedDirectories) {
    collectSignCertDerFiles(directory, 0, 8, signCertPaths);
  }

  const certificates: BridgeProbeResult["bridge"]["storageProbe"]["certificates"] = [];
  for (const filePath of signCertPaths) {
    try {
      const raw = fs.readFileSync(filePath);
      const certificate = new X509Certificate(raw);
      const userDn = path.basename(path.dirname(filePath));
      const policyOid = resolveFilesystemCertificatePolicyOid(filePath);
      if (policyOid !== FILESYSTEM_ELECTRONIC_TAX_OID) {
        continue;
      }

      const serial = convertHexSerialToDecimal(certificate.serialNumber);
      const cn =
        extractDnAttributeValue(userDn, "cn") ??
        extractDnAttributeValue(certificate.subject.replace(/\r?\n/g, ","), "CN") ??
        "";
      const validTo = new Date(certificate.validTo);
      const validFrom = new Date(certificate.validFrom);

      certificates.push({
        index: buildFilesystemCertificateIndex(`${serial ?? ""}|${filePath}`),
        cn,
        issuerToName: resolveIssuerDisplayName(certificate.issuer),
        usageToName: resolveUsageNameFromPolicyOid(policyOid),
        todate: Number.isNaN(validTo.getTime()) ? null : validTo.toISOString(),
        oid: policyOid,
        serial,
        userDN: userDn || null,
        validateFrom: Number.isNaN(validFrom.getTime())
          ? null
          : validFrom.toISOString(),
        detailValidateTo: Number.isNaN(validTo.getTime())
          ? null
          : validTo.toISOString(),
        certDirPath: path.dirname(filePath),
        listSource: "filesystem-hdd",
        supportsPreflight: false,
      });
    } catch {
      continue;
    }
  }

  return certificates;
}

function buildOrderedPortTargets(
  preferredPort: number | null = null,
): (typeof PORT_TARGETS)[number][] {
  const orderedPorts = [
    preferredPort,
    cachedStableBridgeTargetPort,
    cachedPreflightProbe.sourcePort,
    cachedSelectionProbe.sourcePort,
    cachedDetailedBridgeStatus.storageProbe.sourcePort,
    cachedDetailedBridgeStatus.licenseProbe.sourcePort,
    ...PORT_TARGETS.map((target) => target.port),
  ];
  const seen = new Set<number>();

  return orderedPorts.flatMap((port) => {
    if (!port || seen.has(port)) {
      return [];
    }

    const target = PORT_TARGETS.find((candidate) => candidate.port === port);
    if (!target) {
      return [];
    }

    seen.add(port);
    return [target];
  });
}

async function probeLicenseOnTarget(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
): Promise<BridgeProbeResult["bridge"]["licenseProbe"]> {
  const licenseResult = await invokeBridgeCommand(target, {
    token: "empty",
    callback: "secukitnxInterface.SecuKitNX_EXCallBack",
    fname: "checkLicense",
    args: [{ license: signGateConfig.license }],
    origin: signGateConfig.origin,
    referer: signGateConfig.referer,
  });

  if (licenseResult.ok && licenseResult.reply?.checkLicense === "Y") {
    return {
      ok: true,
      sourcePort: target.port,
      error: null,
    };
  }

  return {
    ok: false,
    sourcePort: target.port,
    error: normalizeBridgeError(
      licenseResult.reply,
      licenseResult.error ??
        `checkLicense status=${licenseResult.status ?? "unknown"}`,
    ),
  };
}

async function resolveLicensedBridgeTarget(
  signGateConfig: SignGateRuntimeConfig,
  preferredPort: number | null = null,
): Promise<{
  target: (typeof PORT_TARGETS)[number] | null;
  licenseProbe: BridgeProbeResult["bridge"]["licenseProbe"];
}> {
  let lastErrorProbe = defaultLicenseProbe();

  for (const target of buildOrderedPortTargets(preferredPort)) {
    const licenseProbe = await probeLicenseOnTarget(target, signGateConfig);
    if (licenseProbe.ok) {
      return {
        target,
        licenseProbe,
      };
    }

    lastErrorProbe = licenseProbe;
  }

  return {
    target: null,
    licenseProbe: lastErrorProbe.error
      ? lastErrorProbe
      : {
          ...defaultLicenseProbe(),
          error:
            "SignGate 라이선스 검증에 성공한 로컬 브리지 포트를 찾지 못했습니다.",
        },
  };
}

async function probeStorageOnTarget(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
): Promise<BridgeProbeResult["bridge"]["storageProbe"]> {
  return await runWithBridgeSelectionLock(async () => {
    const storageResult = await runSelectStorageIssue(target, signGateConfig);

    const storageReply = storageResult.reply;
    const storageErrorCode =
      typeof storageReply?.ERROR_CODE === "string"
        ? storageReply.ERROR_CODE
        : null;
    if (!storageResult.ok || storageErrorCode) {
      clearStorageSelected(target.port);
      return {
        ok: false,
        sourcePort: target.port,
        mediaType: "HDD",
        certificateCount: 0,
        certificates: [],
        error: normalizeBridgeError(
          storageReply,
          storageResult.error ??
            `selectStorageIssue status=${storageResult.status ?? "unknown"}`,
        ),
      };
    }

    markStorageSelected(target.port);
    const certificates = parseStorageCertificates(storageReply);
    const detailedCertificates: typeof certificates = [];

    for (const certificate of certificates) {
      const detailResult = await invokeBridgeCommand(target, {
        token: "empty",
        callback: "probeCallback",
        fname: "viewCertDetailInfomationIssue",
        args: [{ ID: certificate.index }],
        origin: signGateConfig.origin,
        referer: signGateConfig.referer,
      });
      const detailErrorCode =
        typeof detailResult.reply?.ERROR_CODE === "string"
          ? detailResult.reply.ERROR_CODE
          : null;
      if (detailResult.ok && !detailErrorCode) {
        detailedCertificates.push(
          mergeCertificateDetail(certificate, detailResult.reply),
        );
        continue;
      }

      detailedCertificates.push(certificate);
    }

    return {
      ok: true,
      sourcePort: target.port,
      mediaType: "HDD",
      certificateCount: detailedCertificates.length,
      certificates: detailedCertificates,
      error: null,
    };
  });
}

async function probeStorageSummaryOnTarget(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
): Promise<BridgeProbeResult["bridge"]["storageProbe"]> {
  return await runWithBridgeSelectionLock(async () => {
    const storageResult = await runSelectStorageIssue(target, signGateConfig);

    const storageReply = storageResult.reply;
    const storageErrorCode =
      typeof storageReply?.ERROR_CODE === "string"
        ? storageReply.ERROR_CODE
        : null;
    if (!storageResult.ok || storageErrorCode) {
      clearStorageSelected(target.port);
      return {
        ok: false,
        sourcePort: target.port,
        mediaType: "HDD",
        certificateCount: 0,
        certificates: [],
        error: normalizeBridgeError(
          storageReply,
          storageResult.error ??
            `selectStorageIssue status=${storageResult.status ?? "unknown"}`,
        ),
      };
    }

    markStorageSelected(target.port);
    const certificates = parseStorageCertificates(storageReply);
    return {
      ok: true,
      sourcePort: target.port,
      mediaType: "HDD",
      certificateCount: certificates.length,
      certificates,
      error: null,
    };
  });
}

async function runSelectStorageIssue(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
): Promise<BridgeCommandResult> {
  return await invokeBridgeCommand(target, {
    token: "empty",
    callback: "probeCallback",
    fname: "selectStorageIssue",
    args: [{ mediaType: "HDD", extraValue: "NULL" }],
    origin: signGateConfig.origin,
    referer: signGateConfig.referer,
  });
}

async function ensureStorageSelectedOnTarget(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  forceRefresh = false,
): Promise<string | null> {
  if (!forceRefresh && selectedStoragePorts.has(target.port)) {
    return null;
  }

  const storageResult = await runSelectStorageIssue(target, signGateConfig);
  const storageReply = storageResult.reply;
  const storageErrorCode =
    typeof storageReply?.ERROR_CODE === "string"
      ? storageReply.ERROR_CODE
      : null;
  if (!storageResult.ok || storageErrorCode) {
    clearStorageSelected(target.port);
    return normalizeBridgeError(
      storageReply,
      storageResult.error ??
        `selectStorageIssue status=${storageResult.status ?? "unknown"}`,
    );
  }

  markStorageSelected(target.port);
  return null;
}

async function probeCertificateSelectionUnlocked(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: SelectionProbeRequest,
): Promise<BridgeProbeResult["bridge"]["selectionProbe"]> {
  const selectionProbe = defaultSelectionProbe();
  selectionProbe.sourcePort = target.port;
  selectionProbe.certificateIndex = String(selectionRequest.certificateIndex);
  selectionProbe.certificateCn = selectionRequest.certificateCn;

  let password: string | null = null;
  try {
    password = resolveSelectionPassword(selectionRequest);
  } catch (error) {
    selectionProbe.error =
      error instanceof Error
        ? error.message
        : "인증서 비밀번호를 읽지 못했습니다.";
    return selectionProbe;
  }
  if (!password) {
    selectionProbe.error = "공동인증서 비밀번호가 필요합니다.";
    return selectionProbe;
  }

  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const storageError = await ensureStorageSelectedOnTarget(
      target,
      signGateConfig,
      attempt > 0,
    );
    if (storageError) {
      lastError = storageError;
      if (attempt === 0 && isRecoverableSelectionFailureMessage(storageError)) {
        continue;
      }

      selectionProbe.error = storageError;
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
          certID: "@signgate.com",
        },
      ],
      origin: signGateConfig.origin,
      referer: signGateConfig.referer,
    });

    const selectionErrorCode =
      typeof selectionResult.reply?.ERROR_CODE === "string"
        ? selectionResult.reply.ERROR_CODE
        : null;
    const certID =
      typeof selectionResult.reply?.certID === "string"
        ? selectionResult.reply.certID.trim()
        : "";
    if (selectionResult.ok && !selectionErrorCode && certID) {
      selectionProbe.ok = true;
      selectionProbe.certID = certID;
      selectionProbe.error = null;
      markStorageSelected(target.port);
      markStableBridgeTarget(target.port);
      return selectionProbe;
    }

    lastError = normalizeBridgeError(
      selectionResult.reply,
      selectionResult.error ??
        (selectionResult.ok && !selectionErrorCode
          ? "selectCertificateIssue 응답에 certID가 없습니다."
          : `selectCertificateIssue status=${selectionResult.status ?? "unknown"}`),
    );
    if (attempt === 0 && isRecoverableSelectionFailureMessage(lastError)) {
      clearStorageSelected(target.port);
      continue;
    }

    selectionProbe.error = lastError;
    return selectionProbe;
  }

  selectionProbe.error =
    lastError ?? "selectCertificateIssue 응답에 certID가 없습니다.";
  return selectionProbe;
}

async function probeCertificateSelection(
  target: (typeof PORT_TARGETS)[number],
  signGateConfig: SignGateRuntimeConfig,
  selectionRequest: SelectionProbeRequest,
): Promise<BridgeProbeResult["bridge"]["selectionProbe"]> {
  return await runWithBridgeSelectionLock(async () =>
    probeCertificateSelectionUnlocked(target, signGateConfig, selectionRequest),
  );
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
  },
): Promise<BridgeCommandResult> {
  const payload = JSON.stringify({
    callback: options.callback,
    exfunc: {
      fname: options.fname,
      args: options.args,
    },
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
        url,
      ];
      const { stdout } = await execFileAsync("curl.exe", args, {
        timeout: 5000,
      });
      const parsed = JSON.parse(stdout) as BridgeJsonResponse;

      return {
        ok: parsed.status === "0",
        sourcePort: target.port,
        status: parsed.status ?? null,
        reply: parsed.reply ?? null,
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bridge command failed";
      if (isBridgeTransportFailureMessage(message)) {
        clearBridgeTargetState(target.port);
      }
      return {
        ok: false,
        sourcePort: target.port,
        status: null,
        reply: null,
        error: message,
      };
    }
  }

  const transport = target.protocol === "https" ? https : http;
  const agent =
    target.protocol === "https"
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

  return await new Promise((resolve) => {
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
          ...(options.referer ? { Referer: options.referer } : {}),
        },
        agent,
        timeout: 3500,
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
              error: null,
            });
          } catch (error) {
            resolve({
              ok: false,
              sourcePort: target.port,
              status: null,
              reply: null,
              error:
                error instanceof Error ? error.message : "JSON parse failed",
            });
          }
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      if (isBridgeTransportFailureMessage(error.message)) {
        clearBridgeTargetState(target.port);
      }
      resolve({
        ok: false,
        sourcePort: target.port,
        status: null,
        reply: null,
        error: error.message,
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
      detail: "Windows 전용 프로세스 감지는 현재 플랫폼에서 생략됩니다.",
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
        return (
          normalized.includes("secukit") ||
          normalized.includes("kpmsvc") ||
          normalized.includes("kpmcnt")
        );
      });

    return {
      detected: matched.length > 0,
      names: [...new Set(matched)],
      detail:
        matched.length > 0
          ? `tasklist 일치 ${matched.length}건`
          : "일치하는 SecuKit 프로세스를 찾지 못했습니다.",
    };
  } catch (error) {
    return {
      detected: false,
      names: [],
      detail: error instanceof Error ? error.message : "tasklist 실행 실패",
    };
  }
}

export async function invokeGetVersion(
  target: (typeof PORT_TARGETS)[number],
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
    args: [{ TOKEN: "Getversion" }],
  });
  const values = {
    kpmcnt:
      typeof result.reply?.result === "object" &&
      result.reply?.result !== null &&
      "kpmcnt" in result.reply.result
        ? String((result.reply.result as Record<string, unknown>).kpmcnt ?? "")
        : null,
    kpmsvc:
      typeof result.reply?.result === "object" &&
      result.reply?.result !== null &&
      "kpmsvc" in result.reply.result
        ? String((result.reply.result as Record<string, unknown>).kpmsvc ?? "")
        : null,
    secukitNX:
      typeof result.reply?.result === "object" &&
      result.reply?.result !== null &&
      "secukitNX" in result.reply.result
        ? String(
            (result.reply.result as Record<string, unknown>).secukitNX ?? "",
          )
        : null,
  };

  if (result.ok && (values.kpmcnt || values.kpmsvc || values.secukitNX)) {
    return {
      ok: true,
      sourcePort: target.port,
      values,
      error: null,
    };
  }

  return {
    ok: false,
    sourcePort: target.port,
    values,
    error: result.error ?? `status=${result.status ?? "unknown"}`,
  };
}

export async function probeBridgeVersion(): Promise<
  BridgeProbeResult["bridge"]["versionProbe"]
> {
  for (const target of buildOrderedPortTargets(cachedStableBridgeTargetPort)) {
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
      secukitNX: null,
    },
    error: "GetVersion 호출이 모든 포트에서 실패했습니다.",
  };
}

export async function probeLicenseAndStorage(
  signGateConfig: SignGateRuntimeConfig,
  options?: {
    selectionRequest?: SelectionProbeRequest | null;
  },
): Promise<
  Pick<
    BridgeProbeResult["bridge"],
    "licenseProbe" | "storageProbe" | "selectionProbe"
  >
> {
  let licenseProbe = defaultLicenseProbe();
  let storageProbe = defaultStorageProbe();
  let selectionProbe = defaultSelectionProbe();

  for (const target of PORT_TARGETS) {
    licenseProbe = await probeLicenseOnTarget(target, signGateConfig);
    if (!licenseProbe.ok) {
      continue;
    }

    storageProbe = await probeStorageOnTarget(target, signGateConfig);
    if (storageProbe.ok) {
      if (options?.selectionRequest) {
        selectionProbe = await probeCertificateSelection(
          target,
          signGateConfig,
          options.selectionRequest,
        );
      }
      return { licenseProbe, storageProbe, selectionProbe };
    }
  }

  if (options?.selectionRequest) {
    selectionProbe = {
      ...defaultSelectionProbe(),
      certificateIndex: String(options.selectionRequest.certificateIndex),
      certificateCn: options.selectionRequest.certificateCn,
      error:
        storageProbe.error ??
        licenseProbe.error ??
        "certID 조회 전 단계가 실패했습니다.",
    };
  }

  return { licenseProbe, storageProbe, selectionProbe };
}

export async function collectBridgeCertificateList(options?: {
  preferCached?: boolean;
}): Promise<
  Pick<BridgeProbeResult["bridge"], "licenseProbe" | "storageProbe">
> {
  const cached =
    cloneBridgeCertificateListStatus() ?? cloneDetailedBridgeStatus();
  if (
    options?.preferCached !== false &&
    cached.storageProbe.ok &&
    cached.storageProbe.certificateCount > 0
  ) {
    return cached;
  }

  const signGateConfig = await resolveSignGateRuntimeConfig();
  const preferredPort =
    cached.storageProbe.sourcePort ?? cached.licenseProbe.sourcePort ?? null;
  let licenseProbe = cached.licenseProbe.error
    ? cached.licenseProbe
    : defaultLicenseProbe();
  let storageProbe = defaultStorageProbe();

  for (const target of buildOrderedPortTargets(preferredPort)) {
    licenseProbe = await probeLicenseOnTarget(target, signGateConfig);
    if (!licenseProbe.ok) {
      continue;
    }

    storageProbe = await probeStorageSummaryOnTarget(target, signGateConfig);
    if (storageProbe.ok) {
      cacheDetailedBridgeStatusValue(licenseProbe, storageProbe);
      break;
    }
  }

  if (!storageProbe.error) {
    storageProbe = {
      ...defaultStorageProbe(),
      sourcePort: licenseProbe.sourcePort,
      error: licenseProbe.error ?? "HDD 인증서 목록을 읽지 못했습니다.",
    };
  }

  const filesystemCertificates = collectFilesystemElectronicTaxCertificates();
  const mergedStorageProbe =
    filesystemCertificates.length > 0
      ? {
          ok: storageProbe.ok || filesystemCertificates.length > 0,
          sourcePort: storageProbe.sourcePort ?? licenseProbe.sourcePort,
          mediaType: "HDD" as const,
          certificates: mergeCertificateLists({
            bridgeCertificates: storageProbe.certificates,
            filesystemCertificates,
          }),
          certificateCount: 0,
          error: storageProbe.ok ? null : storageProbe.error,
        }
      : storageProbe;

  mergedStorageProbe.certificateCount = mergedStorageProbe.certificates.length;
  cacheBridgeCertificateListStatusValue(licenseProbe, mergedStorageProbe);
  return { licenseProbe, storageProbe: mergedStorageProbe };
}

async function collectLightweightPreflightBridgeState(
  signGateConfig: SignGateRuntimeConfig,
  preflightRequest: RenewalPreflightRequest,
): Promise<
  Pick<
    BridgeProbeResult["bridge"],
    "licenseProbe" | "storageProbe" | "selectionProbe" | "preflightProbe"
  >
> {
  let { licenseProbe, storageProbe } = cloneDetailedBridgeStatus();
  const selectionProbe: BridgeProbeResult["bridge"]["selectionProbe"] = {
    ...defaultSelectionProbe(),
    certificateIndex: String(preflightRequest.certificateIndex),
    certificateCn: preflightRequest.certificateCn,
  };
  const preferredPort =
    cachedStableBridgeTargetPort ??
    cachedPreflightProbe.sourcePort ??
    cachedSelectionProbe.sourcePort ??
    storageProbe.sourcePort ??
    licenseProbe.sourcePort ??
    null;
  const preferredTarget = findPortTarget(preferredPort);

  if (preferredTarget) {
    const preferredPreflightProbe =
      await probeRenewalPreflightWithTransportRetry(
        preferredTarget,
        signGateConfig,
        preflightRequest,
      );
    if (!isBridgeTransportFailureMessage(preferredPreflightProbe.error ?? "")) {
      markStableBridgeTarget(preferredTarget.port);
      if (
        !licenseProbe.ok ||
        licenseProbe.sourcePort !== preferredTarget.port
      ) {
        licenseProbe = {
          ok: true,
          sourcePort: preferredTarget.port,
          error: null,
        };
      }
      if (
        !storageProbe.ok ||
        storageProbe.sourcePort !== preferredTarget.port
      ) {
        storageProbe = {
          ok: true,
          sourcePort: preferredTarget.port,
          mediaType: "HDD",
          certificateCount:
            storageProbe.sourcePort === preferredTarget.port
              ? storageProbe.certificateCount
              : 0,
          certificates:
            storageProbe.sourcePort === preferredTarget.port
              ? storageProbe.certificates.map((certificate) => ({
                  ...certificate,
                }))
              : [],
          error: null,
        };
      }
      if (preferredPreflightProbe.certID) {
        selectionProbe.ok = true;
        selectionProbe.sourcePort = preferredPreflightProbe.sourcePort;
        selectionProbe.certID = preferredPreflightProbe.certID;
        selectionProbe.error = null;
      }

      return {
        licenseProbe,
        storageProbe,
        selectionProbe,
        preflightProbe: preferredPreflightProbe,
      };
    }
  }

  const resolved = await resolveLicensedBridgeTarget(
    signGateConfig,
    preferredPort,
  );
  const target = resolved.target;
  licenseProbe = resolved.licenseProbe;

  if (!target) {
    const preflightProbe = {
      ...defaultPreflightProbe(),
      certificateIndex: String(preflightRequest.certificateIndex),
      certificateCn: preflightRequest.certificateCn,
      error:
        licenseProbe.error ??
        "SignGate 라이선스 검증에 성공한 로컬 브리지 포트를 찾지 못했습니다.",
    };
    return {
      licenseProbe,
      storageProbe,
      selectionProbe,
      preflightProbe,
    };
  }

  const preflightProbe = await probeRenewalPreflightWithTransportRetry(
    target,
    signGateConfig,
    preflightRequest,
  );
  if (!isBridgeTransportFailureMessage(preflightProbe.error ?? "")) {
    markStableBridgeTarget(target.port);
  }
  if (!storageProbe.ok || storageProbe.sourcePort !== target.port) {
    storageProbe = {
      ok: true,
      sourcePort: target.port,
      mediaType: "HDD",
      certificateCount:
        storageProbe.sourcePort === target.port
          ? storageProbe.certificateCount
          : 0,
      certificates:
        storageProbe.sourcePort === target.port
          ? storageProbe.certificates.map((certificate) => ({ ...certificate }))
          : [],
      error: null,
    };
  }
  if (preflightProbe.certID) {
    selectionProbe.ok = true;
    selectionProbe.sourcePort = preflightProbe.sourcePort;
    selectionProbe.certID = preflightProbe.certID;
    selectionProbe.error = null;
  }

  return {
    licenseProbe,
    storageProbe,
    selectionProbe,
    preflightProbe,
  };
}

export async function collectBridgeProbeResult(options?: {
  includeDetailedProbe?: boolean;
  selectionRequest?: SelectionProbeRequest | null;
  preflightRequest?: RenewalPreflightRequest | null;
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
          error: result.error,
        };
      }),
    ),
    probeBridgeVersion(),
  ]);

  const summary = summarizeBridge(portChecks);
  let { licenseProbe, storageProbe } = cloneDetailedBridgeStatus();
  let selectionProbe = cloneSelectionProbe();
  let preflightProbe = clonePreflightProbe();

  if (options?.includeDetailedProbe) {
    try {
      const signGateConfig = await resolveSignGateRuntimeConfig();
      if (options?.preflightRequest && !options?.selectionRequest) {
        const lightweight = await collectLightweightPreflightBridgeState(
          signGateConfig,
          options.preflightRequest,
        );
        licenseProbe = lightweight.licenseProbe;
        storageProbe = lightweight.storageProbe;
        selectionProbe = lightweight.selectionProbe;
        preflightProbe = lightweight.preflightProbe;
      } else {
        const detailed = await probeLicenseAndStorage(signGateConfig, {
          selectionRequest: options.selectionRequest ?? null,
        });
        licenseProbe = detailed.licenseProbe;
        storageProbe = detailed.storageProbe;
        if (options?.selectionRequest) {
          selectionProbe = detailed.selectionProbe;
        }
        if (options?.preflightRequest) {
          const preferredTarget = buildOrderedPortTargets(
            licenseProbe.sourcePort ?? selectionProbe.sourcePort ?? null,
          )[0];
          if (!preferredTarget) {
            preflightProbe = {
              ...defaultPreflightProbe(),
              certificateIndex: String(
                options.preflightRequest.certificateIndex,
              ),
              certificateCn: options.preflightRequest.certificateCn,
              error:
                licenseProbe.error ??
                selectionProbe.error ??
                "SignGate preflight 대상 포트를 찾지 못했습니다.",
            };
          } else {
            preflightProbe = await probeRenewalPreflight(
              preferredTarget,
              signGateConfig,
              options.preflightRequest,
            );
          }
        }
      }

      if (
        selectionProbe.certificateIndex ||
        selectionProbe.certID ||
        selectionProbe.error
      ) {
        cacheSelectionProbeValue(selectionProbe);
      }
      if (options?.preflightRequest) {
        cachePreflightProbeValue(preflightProbe);
      }
      cacheDetailedBridgeStatusValue(licenseProbe, storageProbe);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SignGate 구성 조회 실패";
      licenseProbe = {
        ok: false,
        sourcePort: null,
        error: message,
      };
      storageProbe = {
        ok: false,
        sourcePort: null,
        mediaType: "HDD",
        certificateCount: 0,
        certificates: [],
        error: message,
      };
      if (options?.selectionRequest) {
        selectionProbe = {
          ...defaultSelectionProbe(),
          certificateIndex: String(options.selectionRequest.certificateIndex),
          certificateCn: options.selectionRequest.certificateCn,
          error: message,
        };
        cacheSelectionProbeValue(selectionProbe);
      }
      if (options?.preflightRequest) {
        preflightProbe = {
          ...defaultPreflightProbe(),
          certificateIndex: String(options.preflightRequest.certificateIndex),
          certificateCn: options.preflightRequest.certificateCn,
          error: message,
        };
        cachePreflightProbeValue(preflightProbe);
      }
      cacheDetailedBridgeStatusValue(licenseProbe, storageProbe);
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
      `GetVersion 성공: secukitNX ${versionProbe.values.secukitNX ?? "-"}, kpmcnt ${versionProbe.values.kpmcnt ?? "-"}, kpmsvc ${versionProbe.values.kpmsvc ?? "-"}`,
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
    notes.push(
      `HDD 인증서 목록/세부정보 조회 성공: ${storageProbe.certificateCount}건`,
    );
  } else if (storageProbe.error) {
    notes.push(`HDD 인증서 목록 조회 실패: ${storageProbe.error}`);
  }
  if (selectionProbe.ok) {
    notes.push(
      `selectCertificateIssue 성공: index ${selectionProbe.certificateIndex ?? "-"}, certID ${selectionProbe.certID ?? "-"}`,
    );
  } else if (selectionProbe.error) {
    notes.push(`selectCertificateIssue 실패: ${selectionProbe.error}`);
  }
  if (preflightProbe.ok) {
    notes.push(
      preflightProbe.branch === "change-company" &&
        preflightProbe.externalFlowKind === "apply-form"
        ? `갱신 경로 분석 성공: 순정 갱신 아님 -> ${preflightProbe.issueCompany ?? "-"} -> 외부 신규신청형 ${preflightProbe.externalFlowProductName ?? "신청서"}`
        : `갱신 경로 분석 성공: ${preflightProbe.branch}${preflightProbe.nextUrl ? ` -> ${preflightProbe.nextUrl}` : ""}${preflightProbe.renewInfoAutoSubmitSummary ? ` / ${preflightProbe.renewInfoAutoSubmitSummary}` : ""}`,
    );
  } else if (preflightProbe.error || preflightProbe.message) {
    notes.push(
      `갱신 경로 분석 실패: ${preflightProbe.error ?? preflightProbe.message ?? "원인 미상"}`,
    );
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
      preflightProbe,
    },
    notes,
  };
}

export async function requestJson<T>(
  serverUrl: string,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${serverUrl}${pathname}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({ error: "요청 실패" }))) as { error?: string };
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function sendHeartbeat(
  serverUrl: string,
  agentId: string,
  version: string,
  probeResult: BridgeProbeResult,
  secret: string,
): Promise<void> {
  await requestJson(serverUrl, "/api/automation/renewal-agent/heartbeat", {
    method: "POST",
    headers: buildInternalAuthHeaders(secret),
    body: JSON.stringify({
      agentId,
      hostname: os.hostname(),
      version,
      os: `${process.platform} ${os.release()}`,
      process: probeResult.process,
      bridge: probeResult.bridge,
      notes: probeResult.notes,
    }),
  });
}

export async function claimNextJob(
  serverUrl: string,
  agentId: string,
  secret: string,
): Promise<ClaimedJob> {
  const payload = await requestJson<{ job: ClaimedJob }>(
    serverUrl,
    "/api/automation/renewal-agent/jobs/claim",
    {
      method: "POST",
      headers: buildInternalAuthHeaders(secret),
      body: JSON.stringify({ agentId }),
    },
  );
  return payload.job;
}

export async function completeJob(
  serverUrl: string,
  agentId: string,
  jobId: number,
  probeResult: BridgeProbeResult,
  secret: string,
): Promise<void> {
  await requestJson(
    serverUrl,
    `/api/automation/renewal-agent/jobs/${jobId}/complete`,
    {
      method: "POST",
      headers: buildInternalAuthHeaders(secret),
      body: JSON.stringify({
        agentId,
        result: probeResult,
      }),
    },
  );
}

export async function failJob(
  serverUrl: string,
  agentId: string,
  jobId: number,
  error: string,
  secret: string,
): Promise<void> {
  await requestJson(
    serverUrl,
    `/api/automation/renewal-agent/jobs/${jobId}/fail`,
    {
      method: "POST",
      headers: buildInternalAuthHeaders(secret),
      body: JSON.stringify({
        agentId,
        error,
      }),
    },
  );
}

export async function runRenewalAgentLoop(): Promise<void> {
  const serverUrl = resolveServerUrl();
  const intervalMs = resolveIntervalMs();
  const version = readPackageVersion();
  const agentId = resolveAgentId();
  const runOnce = resolveRunOnce();
  const secret = resolveInternalSecret();

  if (!secret) {
    throw new Error(
      "AUTO_TAX_JOB_SECRET 또는 AUTO_TAX_RENEWAL_AGENT_SECRET을 먼저 설정하세요.",
    );
  }

  console.log(`[renewal-agent] server=${serverUrl}`);
  console.log(`[renewal-agent] agentId=${agentId}`);
  console.log(`[renewal-agent] version=${version}`);
  console.log("[renewal-agent] heartbeat: bridge/version probe");
  console.log(
    "[renewal-agent] queued job: SignGate license + HDD certificate list probe",
  );
  console.log(
    "[renewal-agent] certID probe requires an explicit certificate password from the caller",
  );
  console.log(
    "[renewal-agent] renewal preflight replays showCert + SignGate AJAX to detect the next renewal step",
  );

  while (true) {
    try {
      const heartbeatProbe = await collectBridgeProbeResult({
        includeDetailedProbe: false,
      });
      await sendHeartbeat(serverUrl, agentId, version, heartbeatProbe, secret);

      const job = await claimNextJob(serverUrl, agentId, secret);
      if (job?.type === "bridge-probe") {
        try {
          const result = await collectBridgeProbeResult({
            includeDetailedProbe: true,
          });
          await completeJob(serverUrl, agentId, job.id, result, secret);
          console.log(
            `[renewal-agent] job ${job.id} completed: ${result.bridge.summary}`,
          );
        } catch (error) {
          const message = sanitizeSensitiveText(
            error instanceof Error ? error.message : "브리지 진단 실패"
          );
          await failJob(serverUrl, agentId, job.id, message, secret);
          console.error(`[renewal-agent] job ${job.id} failed: ${message}`);
        }
      } else if (job?.type === "certid-probe") {
        try {
          const result = await collectBridgeProbeResult({
            includeDetailedProbe: true,
            selectionRequest: {
              certificateIndex: job.certificateIndex,
              certificateCn: job.certificateCn,
            },
          });
          await completeJob(serverUrl, agentId, job.id, result, secret);
          console.log(
            `[renewal-agent] job ${job.id} certID probe: ${result.bridge.selectionProbe.ok ? (result.bridge.selectionProbe.certID ?? "ok") : (result.bridge.selectionProbe.error ?? "failed")}`,
          );
        } catch (error) {
          const message = sanitizeSensitiveText(
            error instanceof Error ? error.message : "certID 조회 실패"
          );
          await failJob(serverUrl, agentId, job.id, message, secret);
          console.error(`[renewal-agent] job ${job.id} failed: ${message}`);
        }
      } else if (job?.type === "renewal-preflight") {
        try {
          const result = await collectBridgeProbeResult({
            includeDetailedProbe: true,
            preflightRequest: {
              certificateIndex: job.certificateIndex,
              certificateCn: job.certificateCn,
              comparisonProfile: job.comparisonProfile,
              submissionProfile: job.submissionProfile,
              executeSubmit: job.executeSubmit === true,
            },
          });
          await completeJob(serverUrl, agentId, job.id, result, secret);
          console.log(
            `[renewal-agent] job ${job.id} renewal preflight: ${result.bridge.preflightProbe.branch}${result.bridge.preflightProbe.nextUrl ? ` -> ${result.bridge.preflightProbe.nextUrl}` : ""}${result.bridge.preflightProbe.renewInfoAutoSubmitSummary ? ` / ${result.bridge.preflightProbe.renewInfoAutoSubmitSummary}` : ""}`,
          );
        } catch (error) {
          const message = sanitizeSensitiveText(
            error instanceof Error ? error.message : "갱신 경로 분석 실패"
          );
          await failJob(serverUrl, agentId, job.id, message, secret);
          console.error(`[renewal-agent] job ${job.id} failed: ${message}`);
        }
      }
    } catch (error) {
      const message = sanitizeSensitiveText(
        error instanceof Error ? error.message : "에이전트 루프 실패"
      );
      console.error(`[renewal-agent] ${message}`);
    }

    if (runOnce) {
      break;
    }

    await delay(intervalMs);
  }
}

const isDirectExecution = (() => {
  if (process.env.AUTO_TAX_RENEWAL_AGENT_DISABLE_AUTO_START === "1") {
    return false;
  }

  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }

  const entryBasename = path.basename(entryArg).toLowerCase();
  if (!entryBasename.includes("renewal-agent")) {
    return false;
  }

  return true;
})();

if (isDirectExecution) {
  void runRenewalAgentLoop();
}
