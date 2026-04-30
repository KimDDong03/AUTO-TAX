import type {
  CustomerReportDetail,
  CustomerReportDetailInput,
  CustomerReportMonth,
  CustomerReportMonthInput,
  CustomerReportProfile,
  CustomerReportProfileInput
} from "./domain.js";

export const MIN_CUSTOMER_REPORT_YEAR = 2000;
export const MAX_CUSTOMER_REPORT_YEAR = 2100;

export function createEmptyCustomerReportProfile(customerId: number): CustomerReportProfile {
  return {
    customerId,
    certificateRenewalDate: null,
    hasPersonalGeneralCertificate: false,
    hasTaxInvoiceBusinessCertificate: false,
    solarCapacityKw: null,
    contractStartMonth: null,
    contractEndMonth: null,
    otherNote: "",
    createdAt: null,
    updatedAt: null
  };
}

export function createEmptyCustomerReportMonth(reportYear: number, reportMonth: number): CustomerReportMonth {
  return {
    reportYear,
    reportMonth,
    issueYear: null,
    issueDate: null,
    supplyAmount: 0,
    vatAmount: 0,
    totalAmount: 0,
    createdAt: null,
    updatedAt: null
  };
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function deriveContractEndMonth(contractStartMonth: string | null | undefined): string | null {
  const normalized = normalizeNullableString(contractStartMonth);
  const match = /^([0-9]{4})-([0-9]{2})$/.exec(normalized ?? "");
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return null;
  }

  return `${year + 1}-${String(month).padStart(2, "0")}`;
}

function normalizeAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function normalizeCustomerReportProfileInput(input: CustomerReportProfileInput): CustomerReportProfileInput {
  const contractStartMonth = normalizeNullableString(input.contractStartMonth);
  return {
    certificateRenewalDate: normalizeNullableString(input.certificateRenewalDate),
    hasPersonalGeneralCertificate: Boolean(input.hasPersonalGeneralCertificate),
    hasTaxInvoiceBusinessCertificate: Boolean(input.hasTaxInvoiceBusinessCertificate),
    solarCapacityKw:
      input.solarCapacityKw === null || input.solarCapacityKw === undefined
        ? null
        : Number.isFinite(input.solarCapacityKw)
          ? Math.max(0, input.solarCapacityKw)
          : null,
    contractStartMonth,
    contractEndMonth: deriveContractEndMonth(contractStartMonth),
    otherNote: input.otherNote.trim()
  };
}

export function normalizeCustomerReportMonthsInput(months: CustomerReportMonthInput[], reportYear: number): CustomerReportMonthInput[] {
  const byMonth = new Map<number, CustomerReportMonthInput>();

  for (const month of months) {
    if (byMonth.has(month.reportMonth)) {
      throw new Error(`신고 이력 월이 중복되었습니다: ${month.reportMonth}`);
    }
    byMonth.set(month.reportMonth, {
      reportMonth: month.reportMonth,
      issueYear: reportYear,
      issueDate: normalizeNullableString(month.issueDate),
      supplyAmount: normalizeAmount(month.supplyAmount),
      vatAmount: normalizeAmount(month.vatAmount)
    });
  }

  return Array.from({ length: 12 }, (_, index) => {
    const reportMonth = index + 1;
    return (
      byMonth.get(reportMonth) ?? {
        reportMonth,
        issueYear: reportYear,
        issueDate: null,
        supplyAmount: 0,
        vatAmount: 0
      }
    );
  });
}

export function normalizeCustomerReportDetailInput(input: CustomerReportDetailInput): CustomerReportDetailInput {
  if (input.reportYear < MIN_CUSTOMER_REPORT_YEAR || input.reportYear > MAX_CUSTOMER_REPORT_YEAR) {
    throw new Error(`신고 연도는 ${MIN_CUSTOMER_REPORT_YEAR}년부터 ${MAX_CUSTOMER_REPORT_YEAR}년 사이여야 합니다.`);
  }

  return {
    reportYear: input.reportYear,
    profile: normalizeCustomerReportProfileInput(input.profile),
    months: normalizeCustomerReportMonthsInput(input.months, input.reportYear)
  };
}

export function ensureCustomerReportDetailMonths(detail: CustomerReportDetail): CustomerReportDetail {
  const byMonth = new Map(detail.months.map((month) => [month.reportMonth, month]));
  return {
    ...detail,
    months: Array.from({ length: 12 }, (_, index) => {
      const reportMonth = index + 1;
      return byMonth.get(reportMonth) ?? createEmptyCustomerReportMonth(detail.reportYear, reportMonth);
    })
  };
}
