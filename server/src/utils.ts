export function nowIso(): string {
  return new Date().toISOString();
}

export const REDACTED_SENSITIVE_VALUE = "[REDACTED]";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePlantName(value: string): string {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

export function toRoadAddress(value: string): string {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAddress(value: string): string {
  return toRoadAddress(value)
    .replace(/[()[\],\-]/g, " ")
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

const INLINE_SENSITIVE_VALUE_PATTERNS = [
  /((?:^|[\s{[(,;])(?:password|certificatePassword|renewalCertificatePassword|renewalIssuePassword|issuePassword|popbillSharedPassword|imapPass|smtpPass|secret|secretKey|token|authorization|x-auto-tax-job-secret|x-auto-tax-agent-secret)\s*[:=]\s*)([^\s,;)}\]]+)/gi,
  /((?:"|')(?:password|certificatePassword|renewalCertificatePassword|renewalIssuePassword|issuePassword|popbillSharedPassword|imapPass|smtpPass|secret|secretKey|token|authorization|x-auto-tax-job-secret|x-auto-tax-agent-secret)(?:"|')\s*:\s*(?:"|'))([^"']*)((?:"|'))/gi,
  /((?:password|certificatePassword|renewalCertificatePassword|renewalIssuePassword|issuePassword|popbillSharedPassword|imapPass|smtpPass|secret|secretKey|token|authorization|x-auto-tax-job-secret|x-auto-tax-agent-secret)=)([^&\s]+)/gi
];

function normalizeSensitiveKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key);
  return (
    normalized === "certdirpath" ||
    normalized.endsWith("password") ||
    normalized.endsWith("pass") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("authorization")
  );
}

export function sanitizeSensitiveText(value: string): string {
  const [inlinePattern, quotedPattern, queryPattern] = INLINE_SENSITIVE_VALUE_PATTERNS;
  return String(value ?? "")
    .replace(inlinePattern, (_match, prefix: string) => `${prefix}${REDACTED_SENSITIVE_VALUE}`)
    .replace(quotedPattern, (_match, prefix: string, _secret: string, suffix: string) => `${prefix}${REDACTED_SENSITIVE_VALUE}${suffix}`)
    .replace(queryPattern, (_match, prefix: string) => `${prefix}${REDACTED_SENSITIVE_VALUE}`);
}

export function sanitizeSensitiveData<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeSensitiveText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSensitiveData(entry)) as T;
  }

  if (typeof value !== "object") {
    return value;
  }

  const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (isSensitiveKey(key)) {
      if (entry === null || entry === undefined || entry === "") {
        return [key, entry];
      }
      return [key, REDACTED_SENSITIVE_VALUE];
    }

    return [key, sanitizeSensitiveData(entry)];
  });

  return Object.fromEntries(sanitizedEntries) as T;
}
