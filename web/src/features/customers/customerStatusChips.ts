import type {
  Customer,
  CustomerContractRenewalDueItem,
  CustomerContractSummary
} from "../../types";
import { normalizeCustomerCertificateExpireDateKey } from "../renewal/customerRenewalCertificateUtils";

export type CustomerStatusChipTone = "success" | "warn" | "danger" | "default";

export type CustomerStatusChip = {
  label: string;
  tone: CustomerStatusChipTone;
  detail?: string;
};

type CustomerIssueReadinessLike = {
  canIssueNow: boolean;
};

function getDaysUntilDate(value: string | null, now = new Date()): number | null {
  if (!value) return null;
  const expireDateKey = normalizeCustomerCertificateExpireDateKey(value);
  if (!expireDateKey) return null;
  const [year, month, day] = expireDateKey.split("-").map(Number);
  const target = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function isValidYearMonth(value: string | null | undefined): value is string {
  const match = /^([0-9]{4})-([0-9]{2})$/.exec(value?.trim() ?? "");
  if (!match) {
    return false;
  }

  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function getCurrentSeoulYearMonth(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

export function buildCustomerIssueStatusChip(
  customer: Customer,
  readiness: CustomerIssueReadinessLike,
  now = new Date()
): CustomerStatusChip | null {
  const days = getDaysUntilDate(customer.popbillCertExpireDate, now);

  if (!readiness.canIssueNow) {
    if (days !== null && days <= 0) {
      return { label: "인증서 만료", tone: "danger" };
    }
    return { label: "인증서 필요", tone: "danger" };
  }

  if (days !== null && days <= 0) {
    return { label: "인증서 만료", tone: "danger" };
  }

  if (days !== null && days >= 0 && days <= 30) {
    return { label: "인증서 임박", tone: "warn", detail: `만료 ${days}일 전` };
  }

  return null;
}

export function buildCustomerContractStatusChip(
  summary: CustomerContractSummary | null | undefined,
  dueItem: CustomerContractRenewalDueItem | null | undefined,
  currentYearMonth = getCurrentSeoulYearMonth()
): CustomerStatusChip | null {
  const contractStartMonth = summary?.contractStartMonth ?? null;
  const contractEndMonth = summary?.contractEndMonth ?? null;

  if (!isValidYearMonth(contractStartMonth) || !isValidYearMonth(contractEndMonth)) {
    return { label: "계약 미입력", tone: "default" };
  }

  if (dueItem?.status === "overdue" || (isValidYearMonth(currentYearMonth) && contractEndMonth < currentYearMonth)) {
    return { label: "계약 만료", tone: "danger" };
  }

  if (dueItem?.status === "due_this_month" || (isValidYearMonth(currentYearMonth) && contractEndMonth === currentYearMonth)) {
    return { label: "계약 임박", tone: "warn" };
  }

  return null;
}
