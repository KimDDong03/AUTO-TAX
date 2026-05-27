const DEFAULT_LOCAL_API_PORT = "4300";
const ANONYMOUS_API_PATHS = new Set([
  "/api/health",
  "/api/public/login",
  "/api/public/signup",
  "/api/public/signup/login-id-availability",
  "/api/public/signup/login-id-lookup",
  "/api/public/signup/phone-verifications/send",
  "/api/public/signup/phone-verifications/confirm",
  "/api/public/signup/email-verifications/send",
  "/api/public/signup/email-verifications/confirm",
  "/api/public/consultation-requests",
  "/api/public/contact-inquiries"
]);

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function getRequestPath(value: string): string {
  if (isAbsoluteUrl(value)) {
    return new URL(value).pathname;
  }

  const path = value.split(/[?#]/, 1)[0] ?? "";
  return path.startsWith("/") ? path : `/${path}`;
}

export type ResolveApiUrlOptions = {
  explicitBaseUrl?: string | null;
  isDev?: boolean;
  locationProtocol?: string | null;
  locationHostname?: string | null;
};

export function resolveApiUrl(url: string, options: ResolveApiUrlOptions = {}): string {
  if (isAbsoluteUrl(url)) {
    return url;
  }

  const explicitBaseUrl = options.explicitBaseUrl?.trim();
  if (explicitBaseUrl) {
    return `${trimTrailingSlashes(explicitBaseUrl)}${url.startsWith("/") ? url : `/${url}`}`;
  }

  if (!options.isDev) {
    return url;
  }

  const hostname = options.locationHostname?.trim();
  const protocol = options.locationProtocol?.trim() || "http:";
  if (!hostname) {
    return url;
  }

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return url;
  }

  return `${protocol}//${hostname}:${DEFAULT_LOCAL_API_PORT}${url.startsWith("/") ? url : `/${url}`}`;
}

export function isAnonymousApiRequestUrl(url: string): boolean {
  try {
    return ANONYMOUS_API_PATHS.has(getRequestPath(url));
  } catch {
    return false;
  }
}
