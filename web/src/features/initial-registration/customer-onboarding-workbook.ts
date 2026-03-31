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
    linkBusinessNumber: string;
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
    matchAddress: string;
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

  const guideRows = [
    ["시트", "작성 방법"],
    ["공동인증서", "이 PC에서 읽은 공동인증서 목록이 자동으로 들어갑니다. 전자세금용은 고객 생성 기준으로 쓰고, 범용 공동인증서는 같은 이름과 주소의 고객이면 자동 연결합니다. 자동 연결이 안 되면 `연결할 사업자번호`를 적어 같은 고객에 추가 연결합니다. `인증서 비밀번호`가 비어 있으면 시스템 설정의 공통 비밀번호를 사용합니다."],
    ["발전소", "메일과 매칭할 태양광 설치 주소를 적습니다. 전자세금용 공동인증서 기준으로만 작성하면 됩니다. 사업자 주소와 다른 태양광 주소를 여기에 적습니다."],
    ["업로드 순서", "1) 양식 다운로드 2) 인증서 비밀번호 입력 3) 범용 공동인증서는 같은 이름과 주소면 자동 연결 확인, 아니면 연결할 사업자번호 입력 4) 전자세금용 인증서에 맞춰 발전소 주소 입력 5) 양식 업로드"]
  ];
  const certificateRows = [
    ["로컬인증서번호", "인증서 종류", "인증서명(CN)", "용도표시명", "발급기관", "만료일", "연결할 사업자번호", "인증서 비밀번호"],
    ...certificates.map((certificate) => [
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
      "",
      ""
    ])
  ];
  const plantRows = [
    ["로컬인증서번호", "인증서명(CN)", "발전소명", "메일 매칭 주소"],
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
        const linkBusinessNumber = getCell(row, certificateHeaderMap, "연결할 사업자번호", "사업자번호");
        const certificatePassword = getCell(row, certificateHeaderMap, "인증서 비밀번호", "비밀번호");
        if (!certificateIndex && !certificateKindLabel && !certificateName && !usageName && !issuerName && !expireDate && !linkBusinessNumber && !certificatePassword) {
          return [];
        }

        return [
          {
            rowIndex: index + 2,
            certificateIndex,
            certificateKindLabel,
            linkBusinessNumber,
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
        const matchAddress = getCell(row, plantHeaderMap, "메일 매칭 주소", "발전소 주소", "매칭 주소");
        if (!certificateIndex && !certificateName && !plantName && !matchAddress) {
          return [];
        }

        return [
          {
            rowIndex: index + 2,
            certificateIndex,
            certificateName,
            plantName,
            matchAddress
          }
        ];
      })
    }
  };
}
