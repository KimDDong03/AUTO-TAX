import test from "node:test";
import assert from "node:assert/strict";
import {
  runElectronicTaxOnboardingUploadFlow,
  type ElectronicTaxOnboardingSessionState
} from "./electronic-tax-onboarding-upload-flow";

const previousSessionState: ElectronicTaxOnboardingSessionState = {
  templateDownloaded: true,
  previewReady: true,
  commitDone: true,
  certificateDone: true,
  targetBusinessNumbers: ["1234567890"]
};

test("runElectronicTaxOnboardingUploadFlow clears preview state when the file is removed", async () => {
  const result = await runElectronicTaxOnboardingUploadFlow({
    file: null,
    previousSessionState,
    parseWorkbook: async () => {
      throw new Error("should not parse");
    },
    resolveWorkbook: async () => {
      throw new Error("should not resolve");
    },
    previewWorkbook: async () => {
      throw new Error("should not preview");
    }
  });

  assert.deepEqual(result, {
    fileName: "",
    workbook: null,
    preview: null,
    sessionState: {
      templateDownloaded: true,
      previewReady: false,
      commitDone: false,
      certificateDone: false,
      targetBusinessNumbers: []
    },
    passwordFailureEntries: [],
    notice: "",
    error: ""
  });
});

test("runElectronicTaxOnboardingUploadFlow keeps fail-closed notice when no electronic-tax customers remain", async () => {
  const result = await runElectronicTaxOnboardingUploadFlow({
    file: { name: "AUTO-TAX.xlsx" },
    previousSessionState,
    parseWorkbook: async () => ({
      fileName: "AUTO-TAX.xlsx",
      warnings: ["구형 공동인증서 시트는 무시됩니다."],
      workbook: {
        certificates: [],
        plants: []
      }
    }),
    resolveWorkbook: async () => ({
      workbook: {
        customers: [],
        plants: [],
        certificates: []
      },
      resolvedCertificateCount: 0,
      skippedCertificateCount: 1,
      acceptedBeforeWindowCount: 0,
      passwordFailureEntries: [],
      errors: ["발전소 시트 2행: 전자세금용 인증서를 찾지 못했습니다."]
    }),
    previewWorkbook: async () => {
      throw new Error("should not preview");
    }
  });

  assert.equal(result.fileName, "AUTO-TAX.xlsx");
  assert.equal(result.preview, null);
  assert.deepEqual(result.sessionState, {
    templateDownloaded: true,
    previewReady: false,
    commitDone: false,
    certificateDone: false,
    targetBusinessNumbers: []
  });
  assert.equal(result.notice, "등록 대상 행이 없습니다.");
  assert.equal(result.error, "구형 공동인증서 시트는 무시됩니다.\n발전소 시트 2행: 전자세금용 인증서를 찾지 못했습니다.");
});

test("runElectronicTaxOnboardingUploadFlow returns preview-ready state after preview succeeds", async () => {
  const result = await runElectronicTaxOnboardingUploadFlow({
    file: { name: "AUTO-TAX.xlsx" },
    previousSessionState,
    parseWorkbook: async () => ({
      fileName: "AUTO-TAX.xlsx",
      warnings: ["인증서 비밀번호 공란은 공통 비밀번호를 사용합니다."],
      workbook: {
        certificates: [],
        plants: []
      }
    }),
    resolveWorkbook: async () => ({
      workbook: {
        customers: [
          {
            rowIndex: 2,
            customerName: "한빛태양광",
            businessNumber: "123-45-67890",
            corpName: "한빛태양광",
            addr: "서울시 강남구",
            bizType: "전기업",
            bizClass: "태양광발전(자가용PPA)",
            renewalContactMobile: "",
            memo: ""
          }
        ],
        plants: [
          {
            rowIndex: 2,
            businessNumber: "123-45-67890",
            plantName: "한빛태양광 1호기",
            matchAddress: "서울시 강남구"
          }
        ],
        certificates: [
          {
            rowIndex: 2,
            businessNumber: "123-45-67890",
            certificateKind: "electronic_tax",
            certificateIndex: "17",
            certificateName: "한빛태양광",
            certificateUsageName: "전자세금용",
            issuerName: "issuer",
            serial: "SERIAL-17",
            userDN: "USER-DN-17",
            certificatePassword: "",
            isPrimary: true
          }
        ]
      },
      resolvedCertificateCount: 1,
      skippedCertificateCount: 0,
      acceptedBeforeWindowCount: 0,
      passwordFailureEntries: [],
      errors: []
    }),
    previewWorkbook: async () => ({
      previewId: "preview-1",
      totalCustomers: 1,
      createCount: 1,
      updateCount: 0,
      blockedCount: 0,
      totalPlants: 1,
      totalCertificates: 1,
      fileErrors: [],
      rows: []
    })
  });

  assert.equal(result.fileName, "AUTO-TAX.xlsx");
  assert.equal(result.preview?.previewId, "preview-1");
  assert.deepEqual(result.sessionState, {
    templateDownloaded: true,
    previewReady: true,
    commitDone: false,
    certificateDone: false,
    targetBusinessNumbers: ["1234567890"]
  });
  assert.match(result.notice, /등록 대상 1건을 확인했습니다\./);
  assert.match(result.notice, /확인된 전자세금용 인증서 1건/);
  assert.equal(result.error, "인증서 비밀번호 공란은 공통 비밀번호를 사용합니다.");
});

test("runElectronicTaxOnboardingUploadFlow preserves template download state on parse failure", async () => {
  const result = await runElectronicTaxOnboardingUploadFlow({
    file: { name: "AUTO-TAX.xlsx" },
    previousSessionState,
    parseWorkbook: async () => {
      throw new Error("발전소 시트를 찾지 못했습니다.");
    },
    resolveWorkbook: async () => {
      throw new Error("should not resolve");
    },
    previewWorkbook: async () => {
      throw new Error("should not preview");
    }
  });

  assert.deepEqual(result, {
    fileName: "",
    workbook: null,
    preview: null,
    sessionState: {
      templateDownloaded: true,
      previewReady: false,
      commitDone: false,
      certificateDone: false,
      targetBusinessNumbers: []
    },
    passwordFailureEntries: [],
    notice: "",
    error: "발전소 시트를 찾지 못했습니다."
  });
});
