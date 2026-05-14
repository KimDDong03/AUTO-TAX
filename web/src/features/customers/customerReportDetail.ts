import type { CustomerReportDetail, CustomerReportDetailInput, CustomerReportMonth } from "../../types";

export type CustomerReportPeriodTotals = {
  firstHalf: number;
  secondHalf: number;
  annual: number;
  supply: number;
  vat: number;
};

export function createEmptyCustomerReportDetail(customerId: number, reportYear: number): CustomerReportDetail {
  return {
    customerId,
    reportYear,
    profile: {
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
    },
    months: Array.from({ length: 12 }, (_, index) => createEmptyCustomerReportMonth(reportYear, index + 1))
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

export function deriveContractEndMonth(contractStartMonth: string | null | undefined): string | null {
  const normalized = contractStartMonth?.trim() ?? "";
  const match = /^([0-9]{4})-([0-9]{2})$/.exec(normalized);
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

function isValidYearMonth(value: string | null | undefined): value is string {
  const match = /^([0-9]{4})-([0-9]{2})$/.exec(value?.trim() ?? "");
  if (!match) {
    return false;
  }
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function formatCustomerReportIssueDay(issueDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueDate?.trim() ?? "");
  return match ? String(Number(match[3])) : "";
}

export function parseCustomerReportIssueDay(
  value: string,
  reportYear: number,
  reportMonth: number
): { dayText: string | null; issueDate: string | null } | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { dayText: null, issueDate: null };
  }

  if (!/^\d{1,2}$/.test(trimmed)) {
    return null;
  }

  const day = Number(trimmed);
  if (
    !Number.isInteger(reportYear) ||
    !Number.isInteger(reportMonth) ||
    !Number.isInteger(day) ||
    reportMonth < 1 ||
    reportMonth > 12
  ) {
    return null;
  }

  const maxDay = new Date(reportYear, reportMonth, 0).getDate();
  if (day < 1 || day > maxDay) {
    return null;
  }

  const monthDay = `${String(reportMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    dayText: String(day),
    issueDate: `${reportYear}-${monthDay}`
  };
}

export function normalizeCustomerReportDetail(detail: CustomerReportDetail): CustomerReportDetail {
  const byMonth = new Map(detail.months.map((month) => [month.reportMonth, month]));
  const contractStartMonth = detail.profile.contractStartMonth?.trim() || null;
  const storedContractEndMonth = detail.profile.contractEndMonth?.trim() || null;
  return {
    ...detail,
    profile: {
      ...detail.profile,
      contractStartMonth,
      contractEndMonth: isValidYearMonth(storedContractEndMonth)
        ? storedContractEndMonth
        : deriveContractEndMonth(contractStartMonth)
    },
    months: Array.from({ length: 12 }, (_, index) => {
      const reportMonth = index + 1;
      const month = byMonth.get(reportMonth) ?? createEmptyCustomerReportMonth(detail.reportYear, reportMonth);
      const supplyAmount = Number.isFinite(month.supplyAmount) ? month.supplyAmount : 0;
      const vatAmount = Number.isFinite(month.vatAmount) ? month.vatAmount : 0;
      return {
        ...month,
        reportYear: detail.reportYear,
        reportMonth,
        issueYear: detail.reportYear,
        supplyAmount,
        vatAmount,
        totalAmount: supplyAmount + vatAmount
      };
    })
  };
}

export function calculateCustomerReportTotals(months: CustomerReportMonth[]): CustomerReportPeriodTotals {
  return months.reduce<CustomerReportPeriodTotals>(
    (totals, month) => {
      const totalAmount = month.supplyAmount + month.vatAmount;
      return {
        firstHalf: totals.firstHalf + (month.reportMonth <= 6 ? totalAmount : 0),
        secondHalf: totals.secondHalf + (month.reportMonth >= 7 ? totalAmount : 0),
        annual: totals.annual + totalAmount,
        supply: totals.supply + month.supplyAmount,
        vat: totals.vat + month.vatAmount
      };
    },
    {
      firstHalf: 0,
      secondHalf: 0,
      annual: 0,
      supply: 0,
      vat: 0
    }
  );
}

export function toCustomerReportDetailInput(detail: CustomerReportDetail): CustomerReportDetailInput {
  const normalized = normalizeCustomerReportDetail(detail);
  return {
    reportYear: normalized.reportYear,
    profile: {
      certificateRenewalDate: normalized.profile.certificateRenewalDate,
      hasPersonalGeneralCertificate: normalized.profile.hasPersonalGeneralCertificate,
      hasTaxInvoiceBusinessCertificate: normalized.profile.hasTaxInvoiceBusinessCertificate,
      solarCapacityKw: normalized.profile.solarCapacityKw,
      contractStartMonth: normalized.profile.contractStartMonth,
      contractEndMonth: deriveContractEndMonth(normalized.profile.contractStartMonth),
      otherNote: normalized.profile.otherNote
    },
    months: normalized.months.map((month) => ({
      reportMonth: month.reportMonth,
      issueYear: normalized.reportYear,
      issueDate: month.issueDate,
      supplyAmount: month.supplyAmount,
      vatAmount: month.vatAmount
    }))
  };
}

export function hasCustomerReportDetailChanges(
  currentDetail: CustomerReportDetail | null,
  draftDetail: CustomerReportDetail | null
): boolean {
  if (!currentDetail || !draftDetail) {
    return false;
  }

  return JSON.stringify(toCustomerReportDetailInput(currentDetail)) !== JSON.stringify(toCustomerReportDetailInput(draftDetail));
}

export function parseNullableNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function parseMoneyInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
