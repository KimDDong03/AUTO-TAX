import type { Customer, CustomerReportDetail, CustomerReportMonth } from "../../types";
import { deriveContractEndMonth } from "./customerReportDetail";

type XlsxModule = typeof import("@e965/xlsx");
type Worksheet = ReturnType<XlsxModule["utils"]["aoa_to_sheet"]>;

export type SelectedCustomerExportItem = {
  customer: Customer;
  reportDetail: CustomerReportDetail;
};

export const SELECTED_CUSTOMER_BASIC_EXPORT_COLUMNS = [
  "순서",
  "대표자명",
  "상호명",
  "사업자등록번호",
  "전화번호",
  "사업장 주소",
  "업태",
  "업종",
  "태양광 용량 KW",
  "계약기간 시작",
  "계약기간 종료",
  "발전소명",
  "메일 매칭 주소",
  "메모"
] as const;
export const SELECTED_CUSTOMER_REPORT_MONTH_COLUMNS = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월"
] as const;
export const SELECTED_CUSTOMER_REPORT_EXPORT_COLUMNS = [
  "순서",
  "대표자명",
  "상호명",
  ...SELECTED_CUSTOMER_REPORT_MONTH_COLUMNS
] as const;

function getCustomerRepresentativeName(customer: Customer): string {
  return customer.customerName?.trim() || customer.ceoName?.trim() || "-";
}

function getCustomerCorpName(customer: Customer): string {
  return customer.corpName?.trim() || customer.customerName?.trim() || "-";
}

function getCustomerContact(customer: Customer): string {
  return customer.renewalContactMobile?.trim() || "-";
}

function getCustomerText(value: string | null | undefined): string {
  return value?.trim() || "-";
}

function joinCustomerValues(values: string[]): string {
  const normalizedValues = values.map((value) => value.trim()).filter(Boolean);
  return normalizedValues.length > 0 ? normalizedValues.join(", ") : "-";
}

function getMonthSupplyAmount(month: CustomerReportMonth | undefined): number {
  if (!month) {
    return 0;
  }

  return Number.isFinite(month.supplyAmount) ? month.supplyAmount : 0;
}

function getKstDateString(now: Date): string {
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
  return year && month && day ? `${year}-${month}-${day}` : now.toISOString().slice(0, 10);
}

export function buildSelectedCustomerExportFileName(reportYear: number, now = new Date()): string {
  return `AUTO-TAX_선택고객_${reportYear}_${getKstDateString(now)}.xlsx`;
}

export function buildSelectedCustomerBasicInfoRows(items: SelectedCustomerExportItem[]): Array<Array<string | number>> {
  return [
    [...SELECTED_CUSTOMER_BASIC_EXPORT_COLUMNS],
    ...items.map(({ customer, reportDetail }, index) => [
      index + 1,
      getCustomerRepresentativeName(customer),
      getCustomerCorpName(customer),
      getCustomerText(customer.businessNumber),
      getCustomerContact(customer),
      getCustomerText(customer.addr),
      getCustomerText(customer.bizType),
      getCustomerText(customer.bizClass),
      reportDetail.profile.solarCapacityKw ?? "-",
      getCustomerText(reportDetail.profile.contractStartMonth),
      getCustomerText(reportDetail.profile.contractEndMonth ?? deriveContractEndMonth(reportDetail.profile.contractStartMonth)),
      joinCustomerValues(customer.plantNames),
      joinCustomerValues(customer.matchAddresses),
      getCustomerText(customer.memo)
    ])
  ];
}

export function buildSelectedCustomerReportRows(items: SelectedCustomerExportItem[]): Array<Array<string | number>> {
  return [
    [...SELECTED_CUSTOMER_REPORT_EXPORT_COLUMNS],
    ...items.map(({ customer, reportDetail }, index) => {
      const monthByNumber = new Map(reportDetail.months.map((month) => [month.reportMonth, month]));
      return [
        index + 1,
        getCustomerRepresentativeName(customer),
        getCustomerCorpName(customer),
        ...Array.from({ length: 12 }, (_, monthIndex) => getMonthSupplyAmount(monthByNumber.get(monthIndex + 1)))
      ];
    })
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

function applySheetColumnWidths(worksheet: Worksheet, rows: Array<Array<unknown>>) {
  const maxColumnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);
  worksheet["!cols"] = Array.from({ length: maxColumnCount }, (_, columnIndex) => ({
    wch: rows.reduce((maxWidth, row) => Math.max(maxWidth, estimateExcelColumnWidth(row[columnIndex])), 10)
  }));
}

function applyReportAmountFormat(XLSX: XlsxModule, worksheet: Worksheet, rowCount: number) {
  const monthColumnStart = SELECTED_CUSTOMER_REPORT_EXPORT_COLUMNS.length - SELECTED_CUSTOMER_REPORT_MONTH_COLUMNS.length;
  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    for (let columnIndex = monthColumnStart; columnIndex < SELECTED_CUSTOMER_REPORT_EXPORT_COLUMNS.length; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address] as { z?: string } | undefined;
      if (cell) {
        cell.z = "#,##0";
      }
    }
  }
}

export function downloadSelectedCustomersWorkbook(
  XLSX: XlsxModule,
  items: SelectedCustomerExportItem[],
  options: { reportYear: number; now?: Date }
): string {
  const workbook = XLSX.utils.book_new();
  const basicRows = buildSelectedCustomerBasicInfoRows(items);
  const reportRows = buildSelectedCustomerReportRows(items);
  const basicWorksheet = XLSX.utils.aoa_to_sheet(basicRows);
  const reportWorksheet = XLSX.utils.aoa_to_sheet(reportRows);

  applySheetColumnWidths(basicWorksheet, basicRows);
  applySheetColumnWidths(reportWorksheet, reportRows);
  applyReportAmountFormat(XLSX, reportWorksheet, reportRows.length);

  XLSX.utils.book_append_sheet(workbook, basicWorksheet, "고객 기본정보");
  XLSX.utils.book_append_sheet(workbook, reportWorksheet, "신고이력(공급가액)");
  const fileName = buildSelectedCustomerExportFileName(options.reportYear, options.now);
  XLSX.writeFile(workbook, fileName);
  return fileName;
}
