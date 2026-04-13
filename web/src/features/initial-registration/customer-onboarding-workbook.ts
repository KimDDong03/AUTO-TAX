import type { RenewalBridgeCertificateSummary } from "../../types";

type XlsxModule = typeof import("xlsx");

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
    certificateName: string;
    certificateUsageName: string;
    issuerName: string;
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

export type CustomerOnboardingCommitResponse = {
  totalCustomers: number;
  createdCount: number;
  updatedCount: number;
  successCount: number;
  failedCount: number;
  linkedCertificateCount: number;
  warnings: Array<{ rowIndex: number; message: string }>;
  failedRows: Array<{ rowIndex: number; message: string }>;
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

function buildCertificateExpireDate(certificate: RenewalBridgeCertificateSummary) {
  return normalizeCell(certificate.todate ?? certificate.detailValidateTo ?? "");
}

export function downloadCustomerOnboardingTemplate(
  XLSX: XlsxModule,
  certificates: RenewalBridgeCertificateSummary[]
) {
  const workbook = XLSX.utils.book_new();
  const electronicTaxCertificates = certificates.filter((certificate) => certificate.usageToName.includes("전자세금"));
  const generalCertificates = certificates.filter((certificate) => !certificate.usageToName.includes("전자세금"));

  const guideRows = [
    ["시트", "작성 방법"],
    ["공동인증서", "이 시트에는 전자세금용을 제외한 범용 공동인증서만 들어갑니다. 연결 정보는 적지 않고 인증서 비밀번호만 입력하면 됩니다. 업로드 후 사이트가 이번 등록 고객만 대상으로 자동 연결을 시도합니다. 비밀번호가 비어 있으면 시스템 설정의 공통 비밀번호를 사용합니다."],
    ["발전소", "이 시트가 고객 등록 기준입니다. 전자세금용 공동인증서만 자동으로 들어가며, 등록할 대상 행만 남기고 나머지는 삭제하거나 비워 두세요. 행이 남아 있으면 등록 대상으로 보고, 완전히 빈 행은 오류 없이 건너뜁니다. 주소 예외는 첫 동기화 후 도입 준비의 미매칭 메일 예외 처리 단계에서 수동 처리합니다."],
    ["업로드 순서", "1) 로컬 헬퍼 실행 후 공동인증서 읽기 확인 2) 양식 다운로드 3) 발전소 시트에서 등록할 고객 행만 남기고 발전소명과 필요 시 인증서 비밀번호 입력 4) 공동인증서 시트에 범용 인증서 비밀번호 입력 5) 양식 업로드 후 고객 등록 및 범용 인증서 자동 연결 결과 확인 6) 전자세금용 후속 등록과 첫 메일 동기화 뒤 예외 메일만 수동 처리"]
  ];
  const certificateRows = [
    ["로컬인증서번호", "인증서 종류", "인증서명(CN)", "용도표시명", "발급기관", "만료일", "인증서 비밀번호"],
    ...generalCertificates.map((certificate) => [
      String(certificate.index),
      certificate.usageToName.includes("전자세금")
        ? "전자세금용"
        : certificate.usageToName.includes("개인") && certificate.usageToName.includes("범용")
          ? "개인범용"
          : certificate.usageToName.includes("사업자") && certificate.usageToName.includes("범용")
            ? "사업자범용"
            : "기타",
      certificate.cn,
      certificate.usageToName,
      certificate.issuerToName,
      buildCertificateExpireDate(certificate),
      ""
    ])
  ];
  const plantRows = [
    ["로컬인증서번호", "인증서명(CN)", "발전소명", "인증서 비밀번호"],
    ...electronicTaxCertificates.map((certificate) => [String(certificate.index), certificate.cn, "", ""])
  ];

  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  const certificateSheet = XLSX.utils.aoa_to_sheet(certificateRows);
  const plantSheet = XLSX.utils.aoa_to_sheet(plantRows);

  applySheetColumnWidths(guideSheet, guideRows);
  applySheetColumnWidths(certificateSheet, certificateRows);
  applySheetColumnWidths(plantSheet, plantRows);

  XLSX.utils.book_append_sheet(workbook, guideSheet, "안내");
  XLSX.utils.book_append_sheet(workbook, certificateSheet, "공동인증서");
  XLSX.utils.book_append_sheet(workbook, plantSheet, "발전소");
  XLSX.writeFile(workbook, "AUTO-TAX_초기등록_양식.xlsx");
}

export async function parseCustomerOnboardingWorkbook(
  XLSX: XlsxModule,
  file: File
): Promise<{
  fileName: string;
  workbook: CustomerOnboardingTemplateWorkbookInput;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const certificateSheet = getSheetByName(workbook, ["공동인증서", "인증서"]);
  const plantSheet = getSheetByName(workbook, ["발전소"]);

  if (!certificateSheet) {
    throw new Error("`공동인증서` 시트를 찾지 못했습니다.");
  }
  if (!plantSheet) {
    throw new Error("`발전소` 시트를 찾지 못했습니다.");
  }

  const certificateRows = readSheetRows(XLSX, certificateSheet);
  const plantRows = readSheetRows(XLSX, plantSheet);

  const certificateHeader = certificateRows[0];
  const plantHeader = plantRows[0];
  if (!certificateHeader || !plantHeader) {
    throw new Error("양식 헤더를 읽지 못했습니다.");
  }

  const certificateHeaderMap = buildHeaderIndexMap(certificateHeader);
  const plantHeaderMap = buildHeaderIndexMap(plantHeader);

  return {
    fileName: file.name,
    workbook: {
      certificates: certificateRows.slice(1).flatMap((row, index) => {
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
      }),
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
