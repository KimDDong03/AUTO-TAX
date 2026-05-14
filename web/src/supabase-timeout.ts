export const DEFAULT_SUPABASE_AUTH_TIMEOUT_MS = 5000;
export const USER_FACING_AUTH_TIMEOUT_MESSAGE = "로그인 확인이 지연되고 있습니다. 잠시 후 다시 시도해주세요.";

export class SupabaseAuthTimeoutError extends Error {
  constructor(_timeoutMs: number) {
    super(USER_FACING_AUTH_TIMEOUT_MESSAGE);
    this.name = "SupabaseAuthTimeoutError";
  }
}

export function parseSupabaseAuthTimeoutMs(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function withSupabaseAuthTimeout<T>(
  operation: Promise<T>,
  timeoutMs = DEFAULT_SUPABASE_AUTH_TIMEOUT_MS
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  operation.catch(() => undefined);

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new SupabaseAuthTimeoutError(timeoutMs)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
