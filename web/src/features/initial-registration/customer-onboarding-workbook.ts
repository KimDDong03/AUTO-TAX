import type { RenewalBridgeCertificateSummary } from "../../types";
import { assertSafeSpreadsheetWorkbook } from "../../spreadsheet-security";

type XlsxModule = typeof import("@e965/xlsx");

export type CustomerOnboardingWorkbookInput = {
  customers: Array<{
    rowIndex: number;
    customerName: string;
    businessNumber: string;
    corpName: string;
    addr: string;
    bizType: string;
    bizClass: string;
    renewalContactMobile: string;
    memo: string;
  }>;
  plants: Array<{
    rowIndex: number;
    businessNumber: string;
    plantName: string;
    matchAddress: string;
  }>;
  certificates: Array<{
    rowIndex: number;
    businessNumber: string;
    certificateKind: "electronic_tax" | "general_personal" | "general_business" | "unknown";
    certificateIndex?: string;
    certificateName: string;
    certificateUsageName: string;
    issuerName: string;
    serial?: string;
    userDN?: string;
    expireDate?: string | null;
    certificatePassword: string;
    isPrimary: boolean;
  }>;
};

export type CustomerOnboardingTemplateWorkbookInput = {
  certificates: Array<{
    rowIndex: number;
    certificateIndex: string;
    certificateKindLabel: string;
    certificateName: string;
    usageName: string;
    issuerName: string;
    expireDate: string;
    certificatePassword: string;
  }>;
  plants: Array<{
    rowIndex: number;
    certificateIndex: string;
    certificateName: string;
    plantName: string;
    certificatePassword: string;
  }>;
};

export type CustomerOnboardingPreviewResponse = {
  previewId: string;
  totalCustomers: number;
  createCount: number;
  updateCount: number;
  blockedCount: number;
  totalPlants: number;
  totalCertificates: number;
  fileErrors: string[];
  rows: Array<{
    rowIndex: number;
    customerName: string;
    businessNumber: string;
    corpName: string;
    plantCount: number;
    certificateCount: number;
    status: "create" | "update" | "blocked";
    errors: string[];
    warnings: string[];
    canImport: boolean;
  }>;
};

export type CustomerOnboardingCommitStartResponse = {
  batchId: string;
  previewId: string;
  status: "queued" | "running" | "completed" | "failed";
  totalRows: number;
  completedRows: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
};

export type CustomerOnboardingCommitResponse = {
  batchId: string;
  previewId: string;
  status: "queued" | "running" | "completed" | "failed";
  totalCustomers: number;
  totalRows: number;
  completedRows: number;
  createdCount: number;
  updatedCount: number;
  successCount: number;
  failedCount: number;
  linkedCertificateCount: number;
  warnings: Array<{ rowIndex: number; message: string }>;
  failedRows: Array<{ rowIndex: number; message: string }>;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeCell(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: unknown): string {
  return normalizeCell(value).replace(/\s+/g, "").toLowerCase();
}

function getSheetByName(
  workbook: {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  },
  targetNames: string[]
) {
  const normalizedTargetNames = targetNames.map((name) => normalizeHeader(name));
  const matchedName = workbook.SheetNames.find((sheetName) => normalizedTargetNames.includes(normalizeHeader(sheetName)));
  return matchedName ? workbook.Sheets[matchedName] : null;
}

function readSheetRows(XLSX: XlsxModule, sheet: unknown) {
  const worksheet = sheet as Parameters<XlsxModule["utils"]["sheet_to_json"]>[0];
  return (XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: ""
  }) as unknown[][])
    .map((row) => (Array.isArray(row) ? row.map((cell) => normalizeCell(cell)) : []))
    .filter((row) => row.some((cell) => cell !== ""));
}

function buildHeaderIndexMap(headerRow: string[]) {
  return new Map(headerRow.map((value, index) => [normalizeHeader(value), index]));
}

function getCell(row: string[], headerIndexMap: Map<string, number>, ...headerNames: string[]) {
  for (const headerName of headerNames) {
    const columnIndex = headerIndexMap.get(normalizeHeader(headerName));
    if (columnIndex !== undefined) {
      return normalizeCell(row[columnIndex]);
    }
  }

  return "";
}

function estimateExcelColumnWidth(value: unknown) {
  const text = normalizeCell(value);
  if (!text) {
    return 10;
  }

  const width = Array.from(text).reduce((total, character) => total + (/[\u3131-\uD79D]/u.test(character) ? 2 : 1), 0);
  return Math.max(10, Math.min(width + 2, 72));
}

function applySheetColumnWidths(
  worksheet: Parameters<XlsxModule["utils"]["aoa_to_sheet"]>[0] extends infer _T ? ReturnType<XlsxModule["utils"]["aoa_to_sheet"]> : never,
  rows: Array<Array<unknown>>
) {
  const maxColumnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);
  worksheet["!cols"] = Array.from({ length: maxColumnCount }, (_, columnIndex) => ({
    wch: rows.reduce((maxWidth, row) => Math.max(maxWidth, estimateExcelColumnWidth(row[columnIndex])), 10)
  }));
}

function isElectronicTaxUsageName(usageName: string) {
  return usageName.replace(/\s+/g, "").includes("전자세금");
}

export function downloadCustomerOnboardingTemplate(
  XLSX: XlsxModule,
  certificates: RenewalBridgeCertificateSummary[]
) {
  const workbook = XLSX.utils.book_new();
  const electronicTaxCertificates = certificates.filter((certificate) => isElectronicTaxUsageName(certificate.usageToName));

  const guideRows = [
    ["시트", "작성 방법"],
    ["발전소", "이 시트가 초기 등록 기준입니다. 이 PC에서 읽힌 전자세금용 공동인증서만 자동으로 들어갑니다. 등록할 대상 행만 남기고 발전소명과 필요 시 인증서 비밀번호만 입력하세요. 행이 남아 있으면 등록 대상으로 보고, 완전히 빈 행은 오류 없이 건너뜁니다."],
    ["업로드 순서", "1) AT 헬퍼 실행 후 전자세금용 공동인증서 읽기 확인 2) 양식 다운로드 3) 발전소 시트에서 등록할 고객 행만 남기고 발전소명과 필요 시 인증서 비밀번호 입력 4) 양식 업로드 후 전자세금용 인증서 확인 결과와 고객 생성/갱신 가능 여부 확인 5) 고객 등록 반영 6) 전자세금용 인증서 등록 마무리"]
  ];
  const plantRows = [
    ["로컬인증서번호", "인증서명(CN)", "발전소명", "인증서 비밀번호"],
    ...electronicTaxCertificates.map((certificate) => [String(certificate.index), certificate.cn, "", ""])
  ];

  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  const plantSheet = XLSX.utils.aoa_to_sheet(plantRows);

  applySheetColumnWidths(guideSheet, guideRows);
  applySheetColumnWidths(plantSheet, plantRows);

  XLSX.utils.book_append_sheet(workbook, guideSheet, "안내");
  XLSX.utils.book_append_sheet(workbook, plantSheet, "발전소");
  XLSX.writeFile(workbook, "AUTO-TAX_초기등록_양식.xlsx");
}

export async function parseCustomerOnboardingWorkbook(
  XLSX: XlsxModule,
  file: File
): Promise<{
  fileName: string;
  warnings: string[];
  workbook: CustomerOnboardingTemplateWorkbookInput;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  assertSafeSpreadsheetWorkbook(XLSX, workbook, {
    maxSheets: 4,
    maxRows: 5000,
    maxCells: 30000
  });

  const certificateSheet = getSheetByName(workbook, ["공동인증서", "인증서"]);
  const plantSheet = getSheetByName(workbook, ["발전소"]);

  if (!plantSheet) {
    throw new Error("`발전소` 시트를 찾지 못했습니다.");
  }

  const warnings: string[] = [];
  const certificateRows = certificateSheet ? readSheetRows(XLSX, certificateSheet) : [];
  const plantRows = readSheetRows(XLSX, plantSheet);

  const plantHeader = plantRows[0];
  if (!plantHeader) {
    throw new Error("양식 헤더를 읽지 못했습니다.");
  }

  const plantHeaderMap = buildHeaderIndexMap(plantHeader);
  const certificateHeader = certificateRows[0];
  const certificateHeaderMap = certificateHeader ? buildHeaderIndexMap(certificateHeader) : null;

  const parsedLegacyCertificates = certificateHeaderMap
    ? certificateRows.slice(1).flatMap((row, index) => {
        const certificateIndex = getCell(row, certificateHeaderMap, "로컬인증서번호", "인증서번호", "인증서 index");
        const certificateKindLabel = getCell(row, certificateHeaderMap, "인증서 종류", "종류");
        const certificateName = getCell(row, certificateHeaderMap, "인증서명(CN)", "인증서명", "CN");
        const usageName = getCell(row, certificateHeaderMap, "용도표시명", "용도");
        const issuerName = getCell(row, certificateHeaderMap, "발급기관", "기관");
        const expireDate = getCell(row, certificateHeaderMap, "만료일");
        const certificatePassword = getCell(row, certificateHeaderMap, "인증서 비밀번호", "비밀번호");
        if (!certificateIndex && !certificateKindLabel && !certificateName && !usageName && !issuerName && !expireDate && !certificatePassword) {
          return [];
        }

        return [
          {
            rowIndex: index + 2,
            certificateIndex,
            certificateKindLabel,
            certificateName,
            usageName,
            issuerName,
            expireDate,
            certificatePassword
          }
        ];
      })
    : [];

  if (parsedLegacyCertificates.length > 0) {
    warnings.push("구형 `공동인증서` 시트 입력은 읽기 호환만 유지되고, 이번 초기 등록에서는 무시됩니다.");
  }

  return {
    fileName: file.name,
    warnings,
    workbook: {
      certificates: parsedLegacyCertificates,
      plants: plantRows.slice(1).flatMap((row, index) => {
        const certificateIndex = getCell(row, plantHeaderMap, "로컬인증서번호", "인증서번호", "인증서 index");
        const certificateName = getCell(row, plantHeaderMap, "인증서명(CN)", "인증서명", "CN");
        const plantName = getCell(row, plantHeaderMap, "발전소명", "설치명");
        const certificatePassword = getCell(row, plantHeaderMap, "인증서 비밀번호", "비밀번호");
        if (!certificateIndex && !certificateName && !plantName && !certificatePassword) {
          return [];
        }

        return [
          {
            rowIndex: index + 2,
            certificateIndex,
            certificateName,
            plantName,
            certificatePassword
          }
        ];
      })
    }
  };
}
