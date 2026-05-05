import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import {
  DEFAULT_SUPABASE_AUTH_TIMEOUT_MS,
  parseSupabaseAuthTimeoutMs,
  withSupabaseAuthTimeout
} from "./supabase-timeout";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseAuthTimeoutMs =
  parseSupabaseAuthTimeoutMs(import.meta.env.VITE_SUPABASE_AUTH_TIMEOUT_MS) ?? DEFAULT_SUPABASE_AUTH_TIMEOUT_MS;

function createBrowserSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase 브라우저 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
}

export const supabase = createBrowserSupabaseClient();

function getSupabaseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  const message = getSupabaseErrorMessage(error);
  if (!message) {
    return false;
  }

  return (
    message.includes("Invalid Refresh Token") ||
    message.includes("Refresh Token Not Found") ||
    message.includes("refresh_token_not_found")
  );
}

function toSupabaseSessionError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(getSupabaseErrorMessage(error) || fallbackMessage);
}

export async function signOutSafely(
  options?: Parameters<typeof supabase.auth.signOut>[0]
): Promise<{ error: Error | null }> {
  try {
    const { error } = await withSupabaseAuthTimeout(supabase.auth.signOut(options), supabaseAuthTimeoutMs);
    return {
      error: error ? toSupabaseSessionError(error, "로그아웃하지 못했습니다.") : null
    };
  } catch (error) {
    return {
      error: toSupabaseSessionError(error, "로그아웃하지 못했습니다.")
    };
  }
}

export async function updateUserSafely(
  attributes: Parameters<typeof supabase.auth.updateUser>[0]
): Promise<{ error: Error | null }> {
  try {
    const { error } = await withSupabaseAuthTimeout(supabase.auth.updateUser(attributes), supabaseAuthTimeoutMs);
    return {
      error: error ? toSupabaseSessionError(error, "계정 정보를 변경하지 못했습니다.") : null
    };
  } catch (error) {
    return {
      error: toSupabaseSessionError(error, "계정 정보를 변경하지 못했습니다.")
    };
  }
}

export async function clearLocalSupabaseSession() {
  const { error } = await signOutSafely({ scope: "local" });
  if (error) throw error;
}

export async function setSessionSafely(session: {
  access_token: string;
  refresh_token: string;
}): Promise<{ error: Error | null }> {
  try {
    const { error } = await withSupabaseAuthTimeout(supabase.auth.setSession(session), supabaseAuthTimeoutMs);
    return {
      error: error ? toSupabaseSessionError(error, "세션을 저장하지 못했습니다.") : null
    };
  } catch (error) {
    return {
      error: toSupabaseSessionError(error, "세션을 저장하지 못했습니다.")
    };
  }
}

export async function getSessionSafely(): Promise<{
  session: Session | null;
  clearedInvalidRefreshToken: boolean;
  error: Error | null;
}> {
  let sessionResult: Awaited<ReturnType<typeof supabase.auth.getSession>>;

  try {
    sessionResult = await withSupabaseAuthTimeout(supabase.auth.getSession(), supabaseAuthTimeoutMs);
  } catch (error) {
    return {
      session: null,
      clearedInvalidRefreshToken: false,
      error: toSupabaseSessionError(error, "세션을 확인하지 못했습니다.")
    };
  }

  const { data, error } = sessionResult;

  if (isInvalidRefreshTokenError(error)) {
    await clearLocalSupabaseSession().catch(() => undefined);
    return {
      session: null,
      clearedInvalidRefreshToken: true,
      error: toSupabaseSessionError(error, "세션을 복구하지 못했습니다.")
    };
  }

  return {
    session: data.session,
    clearedInvalidRefreshToken: false,
    error: error ? toSupabaseSessionError(error, "세션을 확인하지 못했습니다.") : null
  };
}
