import type {
  CustomerContractPeriod,
  CustomerContractPeriodInput,
  CustomerContractPeriodStatus,
  CustomerContractRenewalDueItem,
  CustomerContractRenewalStatus,
  CustomerReportProfile
} from "./domain.js";
import { deriveContractEndMonth } from "./customer-report-detail.js";

export class CustomerContractRenewalConflictError extends Error {
  constructor(message = "계약 종료월이 변경되었습니다. 새로고침 후 다시 처리하세요.") {
    super(message);
    this.name = "CustomerContractRenewalConflictError";
  }
}

export class CustomerContractRenewalInvalidPeriodError extends Error {
  constructor(message = "계약 기간을 계산할 수 없습니다.") {
    super(message);
    this.name = "CustomerContractRenewalInvalidPeriodError";
  }
}

type CustomerContractRenewalSource = {
  customerId: number;
  customerName: string;
  corpName: string;
  businessNumber: string;
  renewalContactMobile: string;
  contractStartMonth: string | null;
  contractEndMonth: string | null;
};

export function isValidYearMonth(value: string | null | undefined): value is string {
  const match = /^([0-9]{4})-([0-9]{2})$/.exec(value?.trim() ?? "");
  if (!match) {
    return false;
  }

  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function getCurrentKstYearMonth(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) {
    throw new Error("현재 KST 월을 계산하지 못했습니다.");
  }
  return `${year}-${month}`;
}

export function getCurrentKstDate(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("현재 KST 날짜를 계산하지 못했습니다.");
  }
  return `${year}-${month}-${day}`;
}

export function isValidIsoDate(value: string | null | undefined): value is string {
  const normalized = value?.trim() ?? "";
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(normalized);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeCustomerContractPeriodInput(input: CustomerContractPeriodInput): CustomerContractPeriodInput {
  const contractStartDate = input.contractStartDate.trim();
  const contractEndDate = input.contractEndDate.trim();
  if (!isValidIsoDate(contractStartDate) || !isValidIsoDate(contractEndDate)) {
    throw new CustomerContractRenewalInvalidPeriodError("계약 시작일과 종료일을 올바른 날짜로 입력하세요.");
  }
  if (contractStartDate > contractEndDate) {
    throw new CustomerContractRenewalInvalidPeriodError("계약 종료일은 시작일보다 빠를 수 없습니다.");
  }
  return {
    contractStartDate,
    contractEndDate
  };
}

export function getCustomerContractPeriodStatus(
  contractStartDate: string,
  contractEndDate: string,
  currentDate = getCurrentKstDate()
): CustomerContractPeriodStatus {
  if (contractEndDate < currentDate) {
    return "expired";
  }
  if (contractStartDate > currentDate) {
    return "scheduled";
  }
  return "active";
}

export function selectCustomerContractSummaryPeriod(
  periods: CustomerContractPeriod[],
  currentDate = getCurrentKstDate()
): CustomerContractPeriod | null {
  if (periods.length === 0) {
    return null;
  }

  const active = periods
    .filter((period) => getCustomerContractPeriodStatus(period.contractStartDate, period.contractEndDate, currentDate) === "active")
    .sort((left, right) => right.contractStartDate.localeCompare(left.contractStartDate))[0];
  if (active) {
    return active;
  }

  const scheduled = periods
    .filter((period) => period.contractStartDate > currentDate)
    .sort((left, right) => left.contractStartDate.localeCompare(right.contractStartDate))[0];
  if (scheduled) {
    return scheduled;
  }

  return [...periods].sort(
    (left, right) =>
      right.contractEndDate.localeCompare(left.contractEndDate) ||
      right.contractStartDate.localeCompare(left.contractStartDate)
  )[0] ?? null;
}

export function compareYearMonth(left: string, right: string): number {
  if (!isValidYearMonth(left) || !isValidYearMonth(right)) {
    throw new CustomerContractRenewalInvalidPeriodError();
  }
  return left.localeCompare(right);
}

export function addMonthsToYearMonth(value: string, monthsToAdd: number): string {
  if (!isValidYearMonth(value) || !Number.isInteger(monthsToAdd)) {
    throw new CustomerContractRenewalInvalidPeriodError();
  }

  const [yearText, monthText] = value.split("-");
  const monthIndex = Number(yearText) * 12 + Number(monthText) - 1 + monthsToAdd;
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = (monthIndex % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function getContractRenewalStatus(contractEndMonth: string, currentYearMonth: string): CustomerContractRenewalStatus {
  return compareYearMonth(contractEndMonth, currentYearMonth) === 0 ? "due_this_month" : "overdue";
}

export function buildCustomerContractRenewalDueItem(
  source: CustomerContractRenewalSource,
  currentYearMonth: string
): CustomerContractRenewalDueItem | null {
  if (!isValidYearMonth(currentYearMonth) || !isValidYearMonth(source.contractStartMonth)) {
    return null;
  }

  if (
    !isValidYearMonth(source.contractEndMonth) ||
    compareYearMonth(source.contractEndMonth, currentYearMonth) > 0
  ) {
    return null;
  }

  const nextContractStartMonth = addMonthsToYearMonth(source.contractEndMonth, 1);
  const nextContractEndMonth = deriveContractEndMonth(nextContractStartMonth);
  if (!isValidYearMonth(nextContractEndMonth)) {
    return null;
  }

  return {
    customerId: source.customerId,
    customerName: source.customerName,
    corpName: source.corpName,
    businessNumber: source.businessNumber,
    renewalContactMobile: source.renewalContactMobile,
    contractStartMonth: source.contractStartMonth,
    contractEndMonth: source.contractEndMonth,
    nextContractStartMonth,
    nextContractEndMonth,
    status: getContractRenewalStatus(source.contractEndMonth, currentYearMonth)
  };
}

export function calculateCompletedContractRenewalPeriod(
  profile: CustomerReportProfile,
  expectedContractEndMonth: string
): {
  oldContractStartMonth: string;
  oldContractEndMonth: string;
  newContractStartMonth: string;
  newContractEndMonth: string;
} {
  if (
    !isValidYearMonth(expectedContractEndMonth) ||
    !isValidYearMonth(profile.contractStartMonth) ||
    !isValidYearMonth(profile.contractEndMonth)
  ) {
    throw new CustomerContractRenewalInvalidPeriodError();
  }

  const derivedOldContractEndMonth = deriveContractEndMonth(profile.contractStartMonth);
  if (!isValidYearMonth(derivedOldContractEndMonth) || derivedOldContractEndMonth !== profile.contractEndMonth) {
    throw new CustomerContractRenewalInvalidPeriodError();
  }

  if (profile.contractEndMonth !== expectedContractEndMonth) {
    throw new CustomerContractRenewalConflictError();
  }

  const newContractStartMonth = addMonthsToYearMonth(profile.contractEndMonth, 1);
  const newContractEndMonth = deriveContractEndMonth(newContractStartMonth);
  if (!isValidYearMonth(newContractEndMonth)) {
    throw new CustomerContractRenewalInvalidPeriodError();
  }

  return {
    oldContractStartMonth: profile.contractStartMonth,
    oldContractEndMonth: profile.contractEndMonth,
    newContractStartMonth,
    newContractEndMonth
  };
}
