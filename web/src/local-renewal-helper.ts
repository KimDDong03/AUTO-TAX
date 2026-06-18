import type {
  RenewalBridgeLicenseProbe,
  RenewalBridgeStorageProbe,
  RenewalBridgeProbeResult,
  RenewalBridgeCertificateSummary,
  RenewalPreflightComparisonProfile,
  RenewalPreflightSubmissionProfile
} from "./types";

const DEFAULT_LOCAL_RENEWAL_HELPER_PORT = 35119;
const DEFAULT_LOCAL_RENEWAL_HELPER_TIMEOUT_MS = 8_000;
const DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS = 60_000;
const configuredLocalRenewalHelperPort = typeof import.meta.env?.VITE_RENEWAL_HELPER_PORT === "string"
  ? import.meta.env.VITE_RENEWAL_HELPER_PORT.trim()
  : "";
const configuredLocalRenewalHelperTimeout = typeof import.meta.env?.VITE_RENEWAL_HELPER_TIMEOUT_MS === "string"
  ? import.meta.env.VITE_RENEWAL_HELPER_TIMEOUT_MS.trim()
  : "";
const configuredLocalRenewalHelperHosts = typeof import.meta.env?.VITE_RENEWAL_HELPER_ALLOWED_ORIGINS === "string"
  ? import.meta.env.VITE_RENEWAL_HELPER_ALLOWED_ORIGINS.split(",").map((value) => value.trim().toLowerCase())
  : [];
const LOCAL_RENEWAL_HELPER_HOST_ALLOWLIST = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "kiyo.kr",
  "www.kiyo.kr",
  ...configuredLocalRenewalHelperHosts
]);

function shouldUseLocalRenewalHelperHost(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const hostname = window.location.hostname?.toLowerCase();
  return hostname != null && LOCAL_RENEWAL_HELPER_HOST_ALLOWLIST.has(hostname);
}

function resolveLocalRenewalHelperPort(): number {
  const parsed = Number(configuredLocalRenewalHelperPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOCAL_RENEWAL_HELPER_PORT;
}

function resolveLocalRenewalHelperTimeoutMs(fallbackMs = DEFAULT_LOCAL_RENEWAL_HELPER_TIMEOUT_MS): number {
  const parsed = Number(configuredLocalRenewalHelperTimeout);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : fallbackMs;
}

export const LOCAL_RENEWAL_HELPER_URL = `http://127.0.0.1:${resolveLocalRenewalHelperPort()}`;
export const LOCAL_RENEWAL_HELPER_RELEASE_METADATA_URL = "/downloads/renewal-local-helper.json";

type LocalRenewalHelperHealthResponse = {
  ok: true;
  version: string;
  status: {
    processDetected: boolean;
    bridgeSummary: "ok" | "partial" | "down" | "unknown";
    bridgeTransportSummary?: "ok" | "partial" | "down" | "unknown";
    bridgeFunctionalSummary?: "ok" | "partial" | "down" | "unknown";
    notes: string[];
  };
};

type LocalRenewalHelperProbeResponse = {
  ok: true;
  version: string;
  result: RenewalBridgeProbeResult;
};

type LocalRenewalHelperPreflightBatchResponse = {
  ok: true;
  version: string;
  results: RenewalBridgeProbeResult[];
};

type LocalRenewalHelperCertificateListResponse = {
  ok: true;
  version: string;
  result: {
    licenseProbe: RenewalBridgeLicenseProbe;
    storageProbe: RenewalBridgeStorageProbe;
  };
};

export type LocalCertificateUploadSessionFile = {
  name: string;
  relativePath: string;
  base64: string;
};

export type LocalCertificateUploadSessionCertificate = RenewalBridgeCertificateSummary & {
  listSource: "upload-session";
  supportsPreflight: false;
  uploadSessionId: string;
  fileName: string;
  relativePath: string;
  privateKeyIncluded: boolean;
};

export type LocalCertificateUploadSessionResult = {
  sessionId: string;
  uploadedAt: string;
  certificates: LocalCertificateUploadSessionCertificate[];
  rejectedFiles: Array<{
    name: string;
    relativePath: string;
    reason: string;
  }>;
  warnings: string[];
};

type LocalCertificateUploadSessionResponse = {
  ok: true;
  version: string;
  result: LocalCertificateUploadSessionResult;
};

type LocalRenewalPaymentOpenResponse = {
  ok: true;
  version: string;
  result: {
    outcome: "opened";
    browserChannel: string;
    pageUrl: string;
    message: string;
  };
};

type LocalPopbillCertificateRegistrationResponse =
  | {
      ok: true;
      version: string;
      result: {
        outcome: "registered" | "already-registered";
        browserChannel: string;
        certificateIndex: number;
        certificateCn: string;
        certificateKind: "electronic_tax" | "general_business";
        serial: string | null;
        userDN: string | null;
        targetExpireDate: string | null;
        localBridgeBaseUrl: string | null;
        message: string;
      };
    }
  | {
      ok: false;
      version: string;
      error: string;
      stage?: string;
      timing?: unknown;
    };

export type LocalRenewalHelperStatus = {
  online: boolean;
  version: string | null;
  message: string;
};

export type LocalRenewalHelperReleaseMetadata = {
  latestVersion: string;
  minSupportedVersion: string;
  downloadUrl: string;
  zipDownloadUrl?: string;
  releasedAt: string;
};

type GetLocalRenewalHelperStatusOptions = {
  force?: boolean;
};

type LocalNetworkRequestInit = RequestInit & {
  targetAddressSpace?: "local" | "loopback";
};

type LocalRenewalHelperRequestInit = RequestInit & {
  timeoutMs?: number;
};

const LOCAL_RENEWAL_HELPER_OFFLINE_RETRY_MS = 15_000;

let localRenewalHelperStatusInFlight: Promise<LocalRenewalHelperStatus> | null = null;
let cachedOfflineLocalRenewalHelperStatus:
  | {
      status: LocalRenewalHelperStatus;
      checkedAt: number;
    }
  | null = null;

function buildHelperUnavailableMessage(): string {
  return "AT 헬퍼가 실행 중이지 않습니다. 고객 PC에서 AT 헬퍼를 먼저 실행하세요.";
}

function selectHelperStatusMessage(payload: LocalRenewalHelperHealthResponse): string {
  const functionalSummary = payload.status.bridgeFunctionalSummary ?? payload.status.bridgeSummary;
  if (functionalSummary !== "down") {
    const functionalNote = payload.status.notes.find((note) =>
      /GetVersion|SignGate|HDD|MagicLine|인증서|라이선스/i.test(note)
    );
    return functionalNote ?? "AT 헬퍼가 실행 중입니다.";
  }

  return payload.status.notes[0] ?? "AT 헬퍼가 실행 중입니다.";
}

async function localRenewalHelperRequest<T>(pathname: string, init?: LocalRenewalHelperRequestInit): Promise<T> {
  if (!shouldUseLocalRenewalHelperHost()) {
    throw new Error(buildHelperUnavailableMessage());
  }

  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers ?? {});
  if (method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  const timeoutMs = init?.timeoutMs ?? resolveLocalRenewalHelperTimeoutMs();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestInit: RequestInit = { ...(init ?? {}) };
    delete (requestInit as LocalRenewalHelperRequestInit).timeoutMs;
    const fetchOptions: LocalNetworkRequestInit = {
      ...requestInit,
      cache: "no-store",
      headers,
      signal: requestInit.signal ?? controller.signal,
      targetAddressSpace: "loopback"
    };
    response = await fetch(`${LOCAL_RENEWAL_HELPER_URL}${pathname}`, fetchOptions);
  } catch {
    if (controller.signal.aborted) {
      throw new Error(`AT 헬퍼 요청이 ${Math.round(timeoutMs / 1000)}초 안에 완료되지 않았습니다. 잠시 후 다시 시도하세요.`);
    }
    throw new Error(buildHelperUnavailableMessage());
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: "AT 헬퍼 요청에 실패했습니다." }))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `AT 헬퍼 HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function isNPKICertificateMaterialFile(file: File): boolean {
  const relativePath = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, "/");
  return /(^|\/)(signCert\.der|signPri\.key)$/i.test(relativePath) || /^(signCert\.der|signPri\.key)$/i.test(file.name);
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fileToUploadSessionFile(file: File): Promise<LocalCertificateUploadSessionFile> {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  return {
    name: file.name,
    relativePath,
    base64: arrayBufferToBase64(await file.arrayBuffer())
  };
}

export async function getLocalRenewalHelperStatus(
  options?: GetLocalRenewalHelperStatusOptions
): Promise<LocalRenewalHelperStatus> {
  const force = options?.force ?? false;
  const now = Date.now();

  if (
    !force &&
    cachedOfflineLocalRenewalHelperStatus &&
    now - cachedOfflineLocalRenewalHelperStatus.checkedAt < LOCAL_RENEWAL_HELPER_OFFLINE_RETRY_MS
  ) {
    return cachedOfflineLocalRenewalHelperStatus.status;
  }

  if (localRenewalHelperStatusInFlight) {
    return await localRenewalHelperStatusInFlight;
  }

  localRenewalHelperStatusInFlight = (async () => {
    try {
      const payload = await localRenewalHelperRequest<LocalRenewalHelperHealthResponse>("/health", {
        method: "GET"
      });
      cachedOfflineLocalRenewalHelperStatus = null;
      return {
        online: true,
        version: payload.version,
        message: selectHelperStatusMessage(payload)
      };
    } catch (error) {
      const status = {
        online: false,
        version: null,
        message: error instanceof Error ? error.message : buildHelperUnavailableMessage()
      } satisfies LocalRenewalHelperStatus;
      cachedOfflineLocalRenewalHelperStatus = {
        status,
        checkedAt: Date.now()
      };
      return status;
    } finally {
      localRenewalHelperStatusInFlight = null;
    }
  })();

  return await localRenewalHelperStatusInFlight;
}

export function resetLocalRenewalHelperStatusCacheForTests(): void {
  localRenewalHelperStatusInFlight = null;
  cachedOfflineLocalRenewalHelperStatus = null;
}

export async function getLocalRenewalHelperReleaseMetadata(): Promise<LocalRenewalHelperReleaseMetadata | null> {
  const timeoutMs = resolveLocalRenewalHelperTimeoutMs();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(LOCAL_RENEWAL_HELPER_RELEASE_METADATA_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<LocalRenewalHelperReleaseMetadata>;
    if (
      typeof payload.latestVersion !== "string" ||
      typeof payload.minSupportedVersion !== "string" ||
      typeof payload.downloadUrl !== "string" ||
      typeof payload.releasedAt !== "string"
    ) {
      return null;
    }

    return {
      latestVersion: payload.latestVersion,
      minSupportedVersion: payload.minSupportedVersion,
      downloadUrl: payload.downloadUrl,
      zipDownloadUrl: typeof payload.zipDownloadUrl === "string" ? payload.zipDownloadUrl : undefined,
      releasedAt: payload.releasedAt
    };
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function requestLocalRenewalBridgeProbe() {
  return await localRenewalHelperRequest<LocalRenewalHelperProbeResponse>("/api/bridge-probe", {
    method: "POST",
    body: JSON.stringify({}),
    timeoutMs: resolveLocalRenewalHelperTimeoutMs(DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS)
  });
}

export async function requestLocalRenewalCertificates() {
  return await localRenewalHelperRequest<LocalRenewalHelperCertificateListResponse>("/api/certificates", {
    method: "POST",
    body: JSON.stringify({}),
    timeoutMs: resolveLocalRenewalHelperTimeoutMs(DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS)
  });
}

export async function requestLocalCertificateUploadSession(files: File[]) {
  const certificateFiles = files.filter(isNPKICertificateMaterialFile);
  if (certificateFiles.length === 0) {
    throw new Error("NPKI 인증서 파일(signCert.der, signPri.key)을 찾지 못했습니다.");
  }
  if (certificateFiles.length > 80) {
    throw new Error("한 번에 처리할 수 있는 인증서 파일은 80개까지입니다.");
  }

  const payloadFiles = await Promise.all(certificateFiles.map(fileToUploadSessionFile));
  return await localRenewalHelperRequest<LocalCertificateUploadSessionResponse>("/api/certificates/upload-session", {
    method: "POST",
    body: JSON.stringify({ files: payloadFiles }),
    timeoutMs: resolveLocalRenewalHelperTimeoutMs(DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS)
  });
}

export async function requestLocalRenewalPreflight(payload: {
  certificateIndex: number;
  certificateCn?: string | null;
  certificatePassword?: string | null;
}) {
  return await localRenewalHelperRequest<LocalRenewalHelperProbeResponse>("/api/preflight", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: resolveLocalRenewalHelperTimeoutMs(DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS)
  });
}

export async function requestLocalRenewalPreflightBatch(payloads: Array<{
  certificateIndex: number;
  certificateCn?: string | null;
  certificatePassword?: string | null;
}>, options?: {
  onProgress?: (message: string) => void;
}) {
  if (payloads.length === 0) {
    return [];
  }

  try {
    const response = await localRenewalHelperRequest<LocalRenewalHelperPreflightBatchResponse>("/api/preflight-batch", {
      method: "POST",
      body: JSON.stringify({
        requests: payloads,
        concurrency: 16
      }),
      timeoutMs: resolveLocalRenewalHelperTimeoutMs(DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS)
    });
    return response.results.map((result) => ({
      ok: true as const,
      version: response.version,
      result
    }));
  } catch {
    options?.onProgress?.(`${payloads.length}건 묶음 응답 실패 · 개별 재시도 중`);
    const results: LocalRenewalHelperProbeResponse[] = [];
    for (let index = 0; index < payloads.length; index += 1) {
      options?.onProgress?.(`${index + 1}/${payloads.length}건 개별 재시도 중`);
      results.push(await requestLocalRenewalPreflight(payloads[index] as (typeof payloads)[number]));
    }
    options?.onProgress?.(`${payloads.length}건 개별 재시도 완료`);
    return results;
  }
}

export async function requestLocalRenewalPreparePayment(payload: {
  certificateIndex: number;
  certificateCn?: string | null;
  certificatePassword?: string | null;
  comparisonProfile?: RenewalPreflightComparisonProfile | null;
  submissionProfile?: RenewalPreflightSubmissionProfile | null;
}) {
  return await localRenewalHelperRequest<LocalRenewalHelperProbeResponse>("/api/renewal/prepare-payment", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: resolveLocalRenewalHelperTimeoutMs(DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS)
  });
}

export async function requestLocalRenewalOpenPayment(payload: {
  certificateIndex: number;
  certificateCn?: string | null;
  certificatePassword?: string | null;
  comparisonProfile?: RenewalPreflightComparisonProfile | null;
  submissionProfile?: RenewalPreflightSubmissionProfile | null;
}) {
  return await localRenewalHelperRequest<LocalRenewalPaymentOpenResponse>("/api/renewal/open-payment", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: resolveLocalRenewalHelperTimeoutMs(DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS)
  });
}

export async function requestLocalPopbillCertificateRegistration(payload: {
  certificateRegistrationUrl: string;
  certificateIndex: number;
  certificateCn?: string | null;
  certificateKind: "electronic_tax" | "general_business";
  serial?: string | null;
  userDN?: string | null;
  targetExpireDate?: string | null;
  certificatePassword: string;
}) {
  const response = await localRenewalHelperRequest<LocalPopbillCertificateRegistrationResponse>("/api/popbill/certificate-registration", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: resolveLocalRenewalHelperTimeoutMs(DEFAULT_LOCAL_RENEWAL_HELPER_ACTION_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(response.error || "공동인증서 자동 등록에 실패했습니다.");
  }

  return response;
}
