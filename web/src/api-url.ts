const DEFAULT_LOCAL_API_PORT = "4300";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
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
