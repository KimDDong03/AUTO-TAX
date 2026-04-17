import { getSessionSafely } from "./supabase";
import { resolveApiUrl } from "./api-url";

const ACTIVE_ORGANIZATION_STORAGE_KEY = "auto-tax.active-organization-id";

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

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const { session, clearedInvalidRefreshToken } = await getSessionSafely();

  if (clearedInvalidRefreshToken) {
    throw new ApiError(401, "로그인 세션이 만료되어 다시 로그인해야 합니다.");
  }

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const activeOrganizationId = getActiveOrganizationId();
  if (activeOrganizationId) {
    headers.set("X-Organization-Id", activeOrganizationId);
  }

  const response = await fetch(
    resolveApiUrl(url, {
      explicitBaseUrl: import.meta.env.VITE_API_BASE_URL,
      isDev: import.meta.env.DEV,
      locationProtocol: typeof window !== "undefined" ? window.location.protocol : null,
      locationHostname: typeof window !== "undefined" ? window.location.hostname : null
    }),
    {
      ...init,
      cache: "no-store",
      headers
    }
  );

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
