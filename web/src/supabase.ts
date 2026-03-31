import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

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

export async function clearLocalSupabaseSession() {
  await supabase.auth.signOut({ scope: "local" });
}

export async function getSessionSafely(): Promise<{
  session: Session | null;
  clearedInvalidRefreshToken: boolean;
  error: Error | null;
}> {
  const { data, error } = await supabase.auth.getSession();

  if (isInvalidRefreshTokenError(error)) {
    await clearLocalSupabaseSession();
    return {
      session: null,
      clearedInvalidRefreshToken: true,
      error: error instanceof Error ? error : new Error(getSupabaseErrorMessage(error) || "세션을 복구하지 못했습니다.")
    };
  }

  return {
    session: data.session,
    clearedInvalidRefreshToken: false,
    error: error instanceof Error ? error : error ? new Error(getSupabaseErrorMessage(error) || "세션을 확인하지 못했습니다.") : null
  };
}
