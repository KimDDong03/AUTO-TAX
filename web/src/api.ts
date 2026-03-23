export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: "요청 실패" }))) as { error?: string };
    throw new Error(payload.error ?? "요청에 실패했습니다.");
  }

  return (await response.json()) as T;
}
