export function nowIso(): string {
  return new Date().toISOString();
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePlantName(value: string): string {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

export function toRoadAddress(value: string): string {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAddress(value: string): string {
  return toRoadAddress(value)
    .replace(/[,\-]/g, " ")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function formatItemName(billingMonth: string): string {
  const [year, month] = billingMonth.split("-");
  return `${Number(year)}년${Number(month)}월전력`;
}

export function formatWriteDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

export function ensureBranchId(value: string): string {
  const digits = digitsOnly(value);
  return digits.padStart(4, "0").slice(-4);
}

export function normalizePopbillUserPrefix(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_]/g, "").trim();
  return sanitized || "TEST_";
}

export function buildPopbillUserId(prefix: string, customerId: number): string {
  return `${normalizePopbillUserPrefix(prefix)}${String(customerId).padStart(3, "0")}`;
}

export function buildDraftMgtKey(customerId: number, billingMonth: string, sourceMessageId: number, revision = 0): string {
  const base = `C${customerId}-${billingMonth.replace("-", "")}-${sourceMessageId}`;
  if (revision <= 0) {
    return base.slice(0, 24);
  }
  return `${base}-R${revision}`.slice(0, 24);
}

export function nextDraftMgtKey(currentMgtKey: string, customerId: number, billingMonth: string, sourceMessageId: number): string {
  const match = currentMgtKey.match(/-R(\d+)$/);
  const nextRevision = match ? Number(match[1]) + 1 : 1;
  return buildDraftMgtKey(customerId, billingMonth, sourceMessageId, nextRevision);
}
