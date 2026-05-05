export function getSupabaseAuthHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

export function isSupabaseRecoveryHash(hash: string): boolean {
  const params = getSupabaseAuthHashParams(hash);
  return params.get("type") === "recovery" || (params.has("access_token") && params.has("refresh_token"));
}

function decodeHashValue(value: string | null): string | null {
  if (!value) return null;

  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}

export function getSupabaseAuthHashError(hash: string): string | null {
  const params = getSupabaseAuthHashParams(hash);
  const errorCode = params.get("error_code");
  const description = decodeHashValue(params.get("error_description"));

  if (!errorCode && !description) {
    return null;
  }

  if (errorCode === "otp_expired") {
    return "비밀번호 재설정 링크가 만료되었습니다. 새 메일을 다시 받아주세요.";
  }

  return description ?? "비밀번호 재설정 링크를 확인할 수 없습니다.";
}

export function clearSupabaseAuthHash() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}
