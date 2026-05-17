import test from "node:test";
import assert from "node:assert/strict";
import { resolveElectronicTaxOnboardingTemplateWorkbook } from "./electronic-tax-onboarding-resolver";
import type { RenewalBridgePreflightProbe } from "../../types";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";
import type { CustomerOnboardingTemplateWorkbookInput } from "./customer-onboarding-workbook";

function createCertificate(overrides: Partial<RenewalAgentCertificate> = {}): RenewalAgentCertificate {
  return {
    index: "12",
    cn: "한빛태양광",
    subjectDN: "",
    policy: "",
    issuerDN: "",
    oid: "",
    type: "",
    class1: "",
    class2: "",
    status: "",
    certDate: "",
    todate: "2099-12-31",
    fromdate: "",
    issuerToName: "테스트 기관",
    subjectToName: "",
    usageToName: "전자세금용",
    source: "browser",
    cloud: false,
    detailValidateTo: "2099-12-31",
    validateFrom: "2024-01-01",
    serial: "SERIAL-001",
    userDN: "USER-DN-001",
    certDirPath: null,
    ...overrides
  } as RenewalAgentCertificate;
}

function createTemplateWorkbook(overrides: Partial<CustomerOnboardingTemplateWorkbookInput> = {}): CustomerOnboardingTemplateWorkbookInput {
  return {
    certificates: [],
    plants: [
      {
        rowIndex: 2,
        certificateIndex: "12",
        certificateName: "한빛태양광",
        plantName: "한빛 1호기",
        certificatePassword: ""
      },
      {
        rowIndex: 3,
        certificateIndex: "12",
        certificateName: "한빛태양광",
        plantName: "한빛 2호기",
        certificatePassword: ""
      }
    ],
    ...overrides
  };
}

test("resolveElectronicTaxOnboardingTemplateWorkbook groups plant rows and preserves electronic tax certificate identity", async () => {
  const workbook = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook(),
    loadAvailableCertificates: async () => [createCertificate()],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => ({
      result: {
        bridge: {
          preflightProbe: {
            ok: true,
            renewInfoSnapshot: {
              companyName: "한빛태양광",
              businessNumber: "123-45-67890",
              ceoName: "홍길동",
              bizType: "전기업",
              bizClass: "태양광발전",
              businessFieldCode: null,
              postalCode: null,
              baseAddress: "서울시 중구 세종대로 1",
              detailAddress: null,
              contactName: null,
              contactDepartment: null,
              contactEmail: null,
              contactTel: null,
              contactFax: null,
              contactMobile: "010-1234-5678"
            }
          } as RenewalBridgePreflightProbe
        }
      }
    })
  });

  assert.equal(workbook.resolvedCertificateCount, 1);
  assert.equal(workbook.skippedCertificateCount, 0);
  assert.equal(workbook.acceptedBeforeWindowCount, 0);
  assert.deepEqual(workbook.errors, []);
  assert.equal(workbook.workbook.customers.length, 1);
  assert.equal(workbook.workbook.plants.length, 2);
  assert.equal(workbook.workbook.certificates.length, 1);
  assert.deepEqual(workbook.workbook.certificates[0], {
    rowIndex: 2,
    businessNumber: "1234567890",
    certificateKind: "electronic_tax",
    certificateIndex: "12",
    certificateName: "한빛태양광",
    certificateUsageName: "전자세금용",
    issuerName: "테스트 기관",
    serial: "SERIAL-001",
    userDN: "USER-DN-001",
    certificatePassword: "shared-secret",
    isPrimary: true
  });
});

test("resolveElectronicTaxOnboardingTemplateWorkbook fails closed when grouped plant rows provide conflicting passwords", async () => {
  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({
      plants: [
        {
          rowIndex: 2,
          certificateIndex: "12",
          certificateName: "한빛태양광",
          plantName: "한빛 1호기",
          certificatePassword: "pw-1"
        },
        {
          rowIndex: 3,
          certificateIndex: "12",
          certificateName: "한빛태양광",
          plantName: "한빛 2호기",
          certificatePassword: "pw-2"
        }
      ]
    }),
    loadAvailableCertificates: async () => [createCertificate()],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => {
      throw new Error("should not reach preflight when grouped passwords conflict");
    }
  });

  assert.equal(result.resolvedCertificateCount, 0);
  assert.equal(result.skippedCertificateCount, 1);
  assert.equal(result.workbook.customers.length, 0);
  assert.match(
    result.errors[0] ?? "",
    /같은 인증서에 서로 다른 인증서 비밀번호가 입력되어 있습니다/
  );
});

test("resolveElectronicTaxOnboardingTemplateWorkbook skips expired certificates before preflight", async () => {
  let preflightCalled = false;

  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook(),
    loadAvailableCertificates: async () => [createCertificate({ todate: "2000-01-01", detailValidateTo: null })],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => {
      preflightCalled = true;
      throw new Error("should not preflight expired certificates");
    }
  });

  assert.equal(preflightCalled, false);
  assert.equal(result.resolvedCertificateCount, 0);
  assert.equal(result.skippedCertificateCount, 1);
  assert.match(result.errors[0] ?? "", /만료된 전자세금용 공동인증서/);
});

test("resolveElectronicTaxOnboardingTemplateWorkbook includes SignGate preflight detail in skipped row errors", async () => {
  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({
      plants: [
        {
          rowIndex: 2,
          certificateIndex: "12",
          certificateName: "지석기 발전소",
          plantName: "지석기 발전소",
          certificatePassword: ""
        }
      ]
    }),
    loadAvailableCertificates: async () => [createCertificate({ cn: "지석기 발전소" })],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => ({
      result: {
        bridge: {
          preflightProbe: {
            ok: false,
            rawCode: "9106",
            error: "<p>폐지된 인증서 정보입니다.</p><p>관리자에게 문의하여 주십시요</p>",
            renewInfoSnapshot: {
              companyName: "지석기 발전소",
              businessNumber: "164-41-01441",
              ceoName: "지석기",
              bizType: "전기업",
              bizClass: "태양광",
              businessFieldCode: null,
              postalCode: null,
              baseAddress: "충청북도 음성군 대금로247번길 25-2",
              detailAddress: null,
              contactName: null,
              contactDepartment: null,
              contactEmail: null,
              contactTel: null,
              contactFax: null,
              contactMobile: "010-6363-5337"
            }
          } as RenewalBridgePreflightProbe
        }
      }
    })
  });

  assert.equal(result.resolvedCertificateCount, 0);
  assert.equal(result.skippedCertificateCount, 1);
  assert.match(
    result.errors[0] ?? "",
    /발전소 시트 \(지석기 발전소\): 사전조회 실패: 폐지된 인증서 정보입니다\. 관리자에게 문의하여 주십시요/
  );
});
