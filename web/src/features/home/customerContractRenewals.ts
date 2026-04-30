import type { CustomerContractRenewalDueItem, CustomerContractRenewalStatus } from "../../types";

type XlsxModule = typeof import("xlsx");

export const CUSTOMER_CONTRACT_RENEWAL_EXPORT_COLUMNS = [
  "상호명",
  "대표자명",
  "사업자등록번호",
  "연락처",
  "계약시작월",
  "계약종료월",
  "다음계약시작월",
  "다음계약종료월",
  "상태"
] as const;

export function formatContractRenewalStatus(status: CustomerContractRenewalStatus): string {
  return status === "due_this_month" ? "이번 달" : "미완료";
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
  return year && month ? `${year}-${month}` : now.toISOString().slice(0, 7);
}

export function buildCustomerContractRenewalWorkbookFileName(now = new Date()): string {
  return `AUTO-TAX_갱신고객_${getCurrentKstYearMonth(now)}.xlsx`;
}

export function buildCustomerContractRenewalWorksheetRows(items: CustomerContractRenewalDueItem[]): Array<Array<string>> {
  return [
    [...CUSTOMER_CONTRACT_RENEWAL_EXPORT_COLUMNS],
    ...items.map((item) => [
      item.corpName,
      item.customerName,
      item.businessNumber,
      item.renewalContactMobile,
      item.contractStartMonth,
      item.contractEndMonth,
      item.nextContractStartMonth,
      item.nextContractEndMonth,
      formatContractRenewalStatus(item.status)
    ])
  ];
}

function estimateExcelColumnWidth(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return 10;
  }

  const width = Array.from(text).reduce((total, character) => total + (/[\u3131-\uD79D]/u.test(character) ? 2 : 1), 0);
  return Math.max(10, Math.min(width + 2, 48));
}

function applySheetColumnWidths(
  worksheet: ReturnType<XlsxModule["utils"]["aoa_to_sheet"]>,
  rows: Array<Array<unknown>>
) {
  const maxColumnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);
  worksheet["!cols"] = Array.from({ length: maxColumnCount }, (_, columnIndex) => ({
    wch: rows.reduce((maxWidth, row) => Math.max(maxWidth, estimateExcelColumnWidth(row[columnIndex])), 10)
  }));
}

export function downloadCustomerContractRenewalsWorkbook(
  XLSX: XlsxModule,
  items: CustomerContractRenewalDueItem[],
  options: { now?: Date } = {}
): string {
  const workbook = XLSX.utils.book_new();
  const rows = buildCustomerContractRenewalWorksheetRows(items);
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  applySheetColumnWidths(worksheet, rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "갱신 고객");
  const fileName = buildCustomerContractRenewalWorkbookFileName(options.now);
  XLSX.writeFile(workbook, fileName);
  return fileName;
}
