export const DEFAULT_SUPABASE_AUTH_TIMEOUT_MS = 5000;

export class SupabaseAuthTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Supabase 인증 응답이 ${timeoutMs}ms 안에 완료되지 않았습니다.`);
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
