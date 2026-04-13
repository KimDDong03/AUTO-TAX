import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

type TemplateWorkbookModule = {
  downloadCustomerOnboardingTemplate: (
    XLSX: typeof import("xlsx"),
    certificates: Array<{
      index: string;
      cn: string;
      issuerToName: string;
      usageToName: string;
      todate: string | null;
      oid: string | null;
      serial: string | null;
      userDN: string | null;
      validateFrom: string | null;
      detailValidateTo: string | null;
      certDirPath: string | null;
    }>
  ) => void;
  parseCustomerOnboardingWorkbook: (
    XLSX: typeof import("xlsx"),
    file: File
  ) => Promise<{
    fileName: string;
    workbook: {
      certificates: Array<Record<string, string | number>>;
      plants: Array<Record<string, string | number>>;
    };
  }>;
};

async function loadTemplateWorkbookModule(): Promise<TemplateWorkbookModule> {
  return (await import(new URL("../../../web/src/features/initial-registration/customer-onboarding-workbook.ts", import.meta.url).href)) as TemplateWorkbookModule;
}

function createCertificate(
  overrides: Partial<{
    index: string;
    cn: string;
    issuerToName: string;
    usageToName: string;
    todate: string | null;
    oid: string | null;
    serial: string | null;
    userDN: string | null;
    validateFrom: string | null;
    detailValidateTo: string | null;
    certDirPath: string | null;
  }> & {
    index: string;
    cn: string;
    issuerToName: string;
    usageToName: string;
  }
) {
  return {
    index: overrides.index,
    cn: overrides.cn,
    issuerToName: overrides.issuerToName,
    usageToName: overrides.usageToName,
    todate: overrides.todate ?? "2027-12-31",
    oid: overrides.oid ?? null,
    serial: overrides.serial ?? null,
    userDN: overrides.userDN ?? null,
    validateFrom: overrides.validateFrom ?? null,
    detailValidateTo: overrides.detailValidateTo ?? null,
    certDirPath: overrides.certDirPath ?? null
  };
}

test("downloadCustomerOnboardingTemplate writes final onboarding workbook columns and filters sheets by role", async () => {
  const { downloadCustomerOnboardingTemplate } = await loadTemplateWorkbookModule();
  let writtenWorkbook: XLSX.WorkBook | null = null;
  let writtenFileName = "";
  const capturingXlsx = Object.assign({}, XLSX, {
    writeFile(workbook: XLSX.WorkBook, fileName: string) {
      writtenWorkbook = workbook;
      writtenFileName = fileName;
    }
  }) as typeof XLSX;

  downloadCustomerOnboardingTemplate(capturingXlsx, [
    createCertificate({
      index: "1",
      cn: "전자세금 인증서",
      issuerToName: "한국정보인증",
      usageToName: "전자세금용"
    }),
    createCertificate({
      index: "2",
      cn: "개인 범용 인증서",
      issuerToName: "한국전자인증",
      usageToName: "개인 범용"
    }),
    createCertificate({
      index: "3",
      cn: "사업자 범용 인증서",
      issuerToName: "금융결제원",
      usageToName: "사업자 범용"
    })
  ]);

  assert.equal(writtenFileName, "AUTO-TAX_초기등록_양식.xlsx");
  if (!writtenWorkbook) {
    throw new Error("양식 워크북이 생성되지 않았습니다.");
  }
  const workbookOutput = writtenWorkbook as XLSX.WorkBook;

  const certificateRows = XLSX.utils.sheet_to_json(workbookOutput.Sheets["공동인증서"], {
    header: 1,
    raw: false,
    defval: ""
  }) as string[][];
  const plantRows = XLSX.utils.sheet_to_json(workbookOutput.Sheets["발전소"], {
    header: 1,
    raw: false,
    defval: ""
  }) as string[][];

  assert.deepEqual(certificateRows[0], [
    "로컬인증서번호",
    "인증서 종류",
    "인증서명(CN)",
    "용도표시명",
    "발급기관",
    "만료일",
    "인증서 비밀번호"
  ]);
  assert.equal(certificateRows.length, 3);
  assert.deepEqual(
    certificateRows.slice(1).map((row) => row[2]),
    ["개인 범용 인증서", "사업자 범용 인증서"]
  );

  assert.deepEqual(plantRows[0], ["로컬인증서번호", "인증서명(CN)", "발전소명", "인증서 비밀번호"]);
  assert.equal(plantRows.length, 2);
  assert.deepEqual(plantRows[1], ["1", "전자세금 인증서", "", ""]);
});

test("parseCustomerOnboardingWorkbook reads the simplified onboarding workbook and skips empty rows", async () => {
  const { parseCustomerOnboardingWorkbook } = await loadTemplateWorkbookModule();
  const workbook = XLSX.utils.book_new();
  const certificateSheet = XLSX.utils.aoa_to_sheet([
    ["로컬인증서번호", "인증서 종류", "인증서명(CN)", "용도표시명", "발급기관", "만료일", "인증서 비밀번호"],
    ["7", "사업자범용", "범용 공동인증서", "사업자 범용", "금융결제원", "2027-12-31", "pw-general"],
    ["", "", "", "", "", "", ""]
  ]);
  const plantSheet = XLSX.utils.aoa_to_sheet([
    ["로컬인증서번호", "인증서명(CN)", "발전소명", "인증서 비밀번호"],
    ["1", "전자세금 인증서", "여주 1호기", "pw-tax"],
    ["", "", "", ""]
  ]);

  XLSX.utils.book_append_sheet(workbook, certificateSheet, "공동인증서");
  XLSX.utils.book_append_sheet(workbook, plantSheet, "발전소");

  const file = new File(
    [XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })],
    "AUTO-TAX_초기등록_양식.xlsx"
  );
  const parsed = await parseCustomerOnboardingWorkbook(XLSX, file);

  assert.deepEqual(parsed.workbook.certificates, [
    {
      rowIndex: 2,
      certificateIndex: "7",
      certificateKindLabel: "사업자범용",
      certificateName: "범용 공동인증서",
      usageName: "사업자 범용",
      issuerName: "금융결제원",
      expireDate: "2027-12-31",
      certificatePassword: "pw-general"
    }
  ]);
  assert.deepEqual(parsed.workbook.plants, [
    {
      rowIndex: 2,
      certificateIndex: "1",
      certificateName: "전자세금 인증서",
      plantName: "여주 1호기",
      certificatePassword: "pw-tax"
    }
  ]);
});
