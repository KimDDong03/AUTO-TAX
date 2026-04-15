import type {
  RenewalBridgeLicenseProbe,
  RenewalBridgeStorageProbe,
  RenewalBridgeProbeResult,
  RenewalPreflightComparisonProfile,
  RenewalPreflightSubmissionProfile
} from "./types";

export const LOCAL_RENEWAL_HELPER_URL = "http://127.0.0.1:35119";
export const LOCAL_RENEWAL_HELPER_RELEASE_METADATA_URL = "/downloads/renewal-local-helper.json";

type LocalRenewalHelperHealthResponse = {
  ok: true;
  version: string;
  status: {
    processDetected: boolean;
    bridgeSummary: "ok" | "partial" | "down" | "unknown";
    notes: string[];
  };
};

type LocalRenewalHelperProbeResponse = {
  ok: true;
  version: string;
  result: RenewalBridgeProbeResult;
};

type LocalRenewalHelperCertificateListResponse = {
  ok: true;
  version: string;
  result: {
    licenseProbe: RenewalBridgeLicenseProbe;
    storageProbe: RenewalBridgeStorageProbe;
  };
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

type LocalPopbillCertificateRegistrationResponse = {
  ok: true;
  version: string;
  result: {
    outcome: "registered" | "already-registered";
    browserChannel: string;
    certificateCn: string;
    localBridgeBaseUrl: string | null;
    message: string;
  };
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
  releasedAt: string;
};

type GetLocalRenewalHelperStatusOptions = {
  force?: boolean;
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
  return "로컬 헬퍼가 실행 중이지 않습니다. 고객 PC에서 로컬 헬퍼를 먼저 실행하세요.";
}

async function localRenewalHelperRequest<T>(pathname: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${LOCAL_RENEWAL_HELPER_URL}${pathname}`, {
      ...init,
      headers
    });
  } catch {
    throw new Error(buildHelperUnavailableMessage());
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: "로컬 헬퍼 요청에 실패했습니다." }))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `로컬 헬퍼 HTTP ${response.status}`);
  }

  return (await response.json()) as T;
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
        message: payload.status.notes[0] ?? "로컬 헬퍼가 준비되었습니다."
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
  try {
    const response = await fetch(LOCAL_RENEWAL_HELPER_RELEASE_METADATA_URL, {
      method: "GET"
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
      releasedAt: payload.releasedAt
    };
  } catch {
    return null;
  }
}

export async function requestLocalRenewalBridgeProbe() {
  return await localRenewalHelperRequest<LocalRenewalHelperProbeResponse>("/api/bridge-probe", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function requestLocalRenewalCertificates() {
  return await localRenewalHelperRequest<LocalRenewalHelperCertificateListResponse>("/api/certificates", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function requestLocalRenewalPreflight(payload: {
  certificateIndex: number;
  certificateCn?: string | null;
  certificatePassword?: string | null;
}) {
  return await localRenewalHelperRequest<LocalRenewalHelperProbeResponse>("/api/preflight", {
    method: "POST",
    body: JSON.stringify(payload)
  });
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
    body: JSON.stringify(payload)
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
    body: JSON.stringify(payload)
  });
}

export async function requestLocalPopbillCertificateRegistration(payload: {
  certificateRegistrationUrl: string;
  certificateCn: string;
  certificatePassword: string;
}) {
  return await localRenewalHelperRequest<LocalPopbillCertificateRegistrationResponse>("/api/popbill/certificate-registration", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
