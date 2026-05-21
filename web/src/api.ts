import { getSessionSafely, refreshSessionSafely } from "./supabase";
import { resolveApiUrl } from "./api-url";

const ACTIVE_ORGANIZATION_STORAGE_KEY = "auto-tax.active-organization-id";
let fallbackAccessToken: string | null = null;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: string;
  readonly operation?: string;

  constructor(status: number, message: string, code?: string, details?: string, operation?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.operation = operation;
  }
}

export function getActiveOrganizationId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)?.trim();
  return value ? value : null;
}

export function setActiveOrganizationId(organizationId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (organizationId) {
    window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, organizationId);
    return;
  }

  window.localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
}

export function setApiAccessToken(accessToken: string | null) {
  fallbackAccessToken = accessToken;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const buildHeaders = (accessToken?: string) => {
    const headers = new Headers(init?.headers ?? {});

    if (!isFormData && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const activeOrganizationId = getActiveOrganizationId();
    if (activeOrganizationId) {
      headers.set("X-Organization-Id", activeOrganizationId);
    }

    return headers;
  };

  const fetchWithSession = (accessToken?: string) =>
    fetch(
      resolveApiUrl(url, {
        explicitBaseUrl: import.meta.env.VITE_API_BASE_URL,
        isDev: import.meta.env.DEV,
        locationProtocol: typeof window !== "undefined" ? window.location.protocol : null,
        locationHostname: typeof window !== "undefined" ? window.location.hostname : null
      }),
      {
        ...init,
        cache: "no-store",
        headers: buildHeaders(accessToken)
      }
    );

  const { session } = await getSessionSafely();
  let response = await fetchWithSession(session?.access_token ?? fallbackAccessToken ?? undefined);

  if (response.status === 401 && session?.refresh_token) {
    const refreshed = await refreshSessionSafely();
    if (refreshed.session?.access_token) {
      setApiAccessToken(refreshed.session.access_token);
      response = await fetchWithSession(refreshed.session.access_token);
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: "요청 실패" }))) as {
      error?: string;
      errorCode?: string;
      errorDetails?: string;
      errorOperation?: string;
    };
    throw new ApiError(
      response.status,
      payload.error ?? "요청에 실패했습니다.",
      payload.errorCode,
      payload.errorDetails,
      payload.errorOperation
    );
  }

  return (await response.json()) as T;
}
