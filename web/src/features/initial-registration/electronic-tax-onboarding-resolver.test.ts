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
    expireDate: "2099-12-31",
    certificatePassword: "shared-secret",
    isPrimary: true
  });
});

test("resolveElectronicTaxOnboardingTemplateWorkbook uses business-info lookup before legacy preflight", async () => {
  const workbook = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook(),
    loadAvailableCertificates: async () => [createCertificate()],
    resolveSharedPassword: async () => "shared-secret",
    requestBusinessInfoLookup: async (payload) => {
      assert.equal(payload.serial, "SERIAL-001");
      assert.equal(payload.userDN, "USER-DN-001");
      return {
        result: {
          ok: true,
          source: "hometax",
          stage: "business-info",
          certificateIndex: "12",
          certificateCn: "한빛태양광",
          sourcePort: 42235,
          loginCode: "S",
          businessInfoSnapshot: {
            companyName: "한빛태양광",
            businessNumber: "123-45-67890",
            ceoName: "홍길동",
            bizType: null,
            bizClass: null,
            businessFieldCode: null,
            postalCode: null,
            baseAddress: null,
            detailAddress: null,
            contactName: null,
            contactDepartment: null,
            contactEmail: null,
            contactTel: null,
            contactFax: null,
            contactMobile: null
          },
          message: null,
          error: null
        }
      };
    },
    requestPreflight: async () => {
      throw new Error("Legacy preflight should not run after business-info lookup succeeds");
    }
  });

  assert.equal(workbook.resolvedCertificateCount, 1);
  assert.deepEqual(workbook.errors, []);
  assert.equal(workbook.workbook.customers[0]?.businessNumber, "1234567890");
  assert.equal(workbook.workbook.certificates[0]?.certificatePassword, "shared-secret");
});

test("resolveElectronicTaxOnboardingTemplateWorkbook reports HomeTax taxpayer-basic lookup warning without blocking import", async () => {
  const workbook = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook(),
    loadAvailableCertificates: async () => [createCertificate()],
    resolveSharedPassword: async () => "shared-secret",
    requestBusinessInfoLookup: async () => ({
      result: {
        ok: true,
        source: "hometax",
        stage: "business-info",
        certificateIndex: "12",
        certificateCn: "한빛태양광",
        sourcePort: 42235,
        loginCode: "S",
        businessInfoSnapshot: {
          companyName: "한빛태양광",
          businessNumber: "123-45-67890",
          ceoName: "홍길동",
          bizType: null,
          bizClass: null,
          businessFieldCode: null,
          postalCode: null,
          baseAddress: null,
          detailAddress: null,
          contactName: null,
          contactDepartment: null,
          contactEmail: null,
          contactTel: null,
          contactFax: null,
          contactMobile: null
        },
        message:
          "홈택스 공동인증서 로그인 세션에서 사업자정보를 확인했습니다. 홈택스 세적 기본 조회는 실패했습니다: 홈택스 세적 업무 시스템 로그인 실패",
        error: null
      }
    }),
    requestPreflight: async () => {
      throw new Error("Legacy preflight should not run after business-info lookup succeeds");
    }
  });

  assert.equal(workbook.resolvedCertificateCount, 1);
  assert.deepEqual(workbook.errors, []);
  assert.match(workbook.warnings?.[0] ?? "", /홈택스 세적 기본 조회는 실패했습니다/);
  assert.equal(workbook.workbook.customers[0]?.addr, "");
});

test("resolveElectronicTaxOnboardingTemplateWorkbook does not fall back to legacy preflight after business-info lookup fails", async () => {
  const workbook = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook(),
    loadAvailableCertificates: async () => [createCertificate()],
    resolveSharedPassword: async () => "shared-secret",
    requestBusinessInfoLookup: async () => ({
      result: {
        ok: false,
        source: "hometax",
        stage: "magicline-sign",
        certificateIndex: "12",
        certificateCn: "한빛태양광",
        sourcePort: 42235,
        loginCode: null,
        businessInfoSnapshot: null,
        message: null,
        error: "홈택스 인증서 비밀번호가 맞지 않습니다."
      }
    }),
    requestPreflight: async () => {
      throw new Error("Legacy preflight should not run after business-info lookup fails");
    }
  });

  assert.equal(workbook.resolvedCertificateCount, 0);
  assert.equal(workbook.skippedCertificateCount, 1);
  assert.match(workbook.errors[0] ?? "", /사업자정보 조회 실패/);
  assert.match(workbook.errors[0] ?? "", /비밀번호/);
});

test("resolveElectronicTaxOnboardingTemplateWorkbook preserves business general certificate identity", async () => {
  const workbook = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook(),
    loadAvailableCertificates: async () => [createCertificate({ usageToName: "사업자 범용" })],
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
  assert.equal(workbook.workbook.certificates[0]?.certificateKind, "general_business");
  assert.equal(workbook.workbook.certificates[0]?.certificateUsageName, "사업자 범용");
});

test("resolveElectronicTaxOnboardingTemplateWorkbook rejects personal general certificates", async () => {
  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook(),
    loadAvailableCertificates: async () => [createCertificate({ usageToName: "개인 범용" })],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => {
      throw new Error("should not preflight personal general certificates");
    }
  });

  assert.equal(result.resolvedCertificateCount, 0);
  assert.equal(result.skippedCertificateCount, 1);
  assert.match(result.errors[0] ?? "", /전자세금용 또는 기업범용 공동인증서만/);
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
  assert.match(result.errors[0] ?? "", /만료된 발행 가능 공동인증서/);
});

test("resolveElectronicTaxOnboardingTemplateWorkbook skips certificates expiring today before preflight", async () => {
  let preflightCalled = false;
  const today = new Date();
  const todayDateKey = [
    today.getFullYear(),
    `${today.getMonth() + 1}`.padStart(2, "0"),
    `${today.getDate()}`.padStart(2, "0")
  ].join("-");

  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook(),
    loadAvailableCertificates: async () => [createCertificate({ todate: todayDateKey, detailValidateTo: null })],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => {
      preflightCalled = true;
      throw new Error("should not preflight certificate expiring today");
    }
  });

  assert.equal(preflightCalled, false);
  assert.equal(result.resolvedCertificateCount, 0);
  assert.equal(result.skippedCertificateCount, 1);
  assert.match(result.errors[0] ?? "", /만료된 발행 가능 공동인증서/);
});

test("resolveElectronicTaxOnboardingTemplateWorkbook accepts manually completed upload-session certificates", async () => {
  let preflightCalled = false;

  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({
      plants: [
        {
          rowIndex: 2,
          certificateIndex: "upload-1",
          certificateName: "김부연()001168820231011111001399",
          businessNumber: "123-45-67890",
          customerName: "김부연",
          corpName: "김부연 태양광",
          addr: "전라남도 나주시 빛가람로 1",
          bizType: "전기업",
          bizClass: "태양광",
          renewalContactMobile: "010-1111-2222",
          plantName: "김부연 발전소",
          matchAddress: "전라남도 나주시 빛가람로 1",
          certificatePassword: ""
        }
      ]
    }),
    loadAvailableCertificates: async () => [
      createCertificate({
        index: "upload-1",
        cn: "김부연()001168820231011111001399",
        serial: "UPLOAD-SERIAL-001",
        userDN: "CN=김부연()001168820231011111001399",
        supportsPreflight: false,
        listSource: "upload-session"
      } as Partial<RenewalAgentCertificate>)
    ],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => {
      preflightCalled = true;
      throw new Error("upload-session certificates should not request SignGate preflight");
    }
  });

  assert.equal(preflightCalled, false);
  assert.equal(result.resolvedCertificateCount, 1);
  assert.equal(result.skippedCertificateCount, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.workbook.customers[0], {
    rowIndex: 2,
    customerName: "김부연",
    businessNumber: "1234567890",
    corpName: "김부연 태양광",
    addr: "전라남도 나주시 빛가람로 1",
    bizType: "전기업",
    bizClass: "태양광",
    renewalContactMobile: "010-1111-2222",
    memo: ""
  });
  assert.equal(result.workbook.plants[0]?.matchAddress, "전라남도 나주시 빛가람로 1");
  assert.equal(result.workbook.certificates[0]?.certificatePassword, "shared-secret");
});

test("resolveElectronicTaxOnboardingTemplateWorkbook asks for manual business info for upload-session certificates", async () => {
  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({
      plants: [
        {
          rowIndex: 2,
          certificateIndex: "upload-1",
          certificateName: "김부연()001168820231011111001399",
          plantName: "김부연 발전소",
          certificatePassword: ""
        }
      ]
    }),
    loadAvailableCertificates: async () => [
      createCertificate({
        index: "upload-1",
        cn: "김부연()001168820231011111001399",
        supportsPreflight: false,
        listSource: "upload-session"
      } as Partial<RenewalAgentCertificate>)
    ],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => {
      throw new Error("upload-session certificates should not request SignGate preflight");
    }
  });

  assert.equal(result.resolvedCertificateCount, 0);
  assert.equal(result.skippedCertificateCount, 1);
  assert.match(result.errors[0] ?? "", /이 인증서는 자동조회로 사업자번호를 읽을 수 없습니다/);
  assert.doesNotMatch(result.errors[0] ?? "", /추가 HDD 경로/);
});

test("resolveElectronicTaxOnboardingTemplateWorkbook falls back to manual business info when SignGate renewal lookup is not applicable", async () => {
  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({
      plants: [
        {
          rowIndex: 2,
          certificateIndex: "12",
          certificateName: "유학현()001168920230227111003787",
          businessNumber: "123-45-67890",
          customerName: "유학현",
          corpName: "유학현 태양광",
          addr: "전라남도 나주시 빛가람로 1",
          bizType: "전기업",
          bizClass: "태양광",
          plantName: "유학현 발전소",
          certificatePassword: ""
        }
      ]
    }),
    loadAvailableCertificates: async () => [
      createCertificate({
        cn: "유학현()001168920230227111003787",
        serial: "919115189",
        userDN: "cn=유학현()001168920230227111003787,ou=l,ou=NACF,ou=xUse4Esero,o=yessign,c=kr"
      })
    ],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => ({
      result: {
        bridge: {
          preflightProbe: {
            ok: false,
            rawCode: "9999",
            error: "갱신 가능한 공동인증서가 아닙니다. 관련 사항은 고객만족센터(1577-8787)로 문의하여 주시기 바랍니다."
          } as RenewalBridgePreflightProbe
        }
      }
    })
  });

  assert.equal(result.resolvedCertificateCount, 1);
  assert.equal(result.skippedCertificateCount, 0);
  assert.deepEqual(result.errors, []);
  assert.equal(result.workbook.customers[0]?.businessNumber, "1234567890");
  assert.equal(result.workbook.customers[0]?.corpName, "유학현 태양광");
});

test("resolveElectronicTaxOnboardingTemplateWorkbook reports manual business info requirement when renewal lookup is not applicable", async () => {
  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({
      plants: [
        {
          rowIndex: 2,
          certificateIndex: "12",
          certificateName: "유학현()001168920230227111003787",
          plantName: "유학현 발전소",
          certificatePassword: ""
        }
      ]
    }),
    loadAvailableCertificates: async () => [
      createCertificate({
        cn: "유학현()001168920230227111003787",
        serial: "919115189",
        userDN: "cn=유학현()001168920230227111003787,ou=l,ou=NACF,ou=xUse4Esero,o=yessign,c=kr"
      })
    ],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => ({
      result: {
        bridge: {
          preflightProbe: {
            ok: false,
            rawCode: "9999",
            error: "갱신 가능한 공동인증서가 아닙니다. 관련 사항은 고객만족센터(1577-8787)로 문의하여 주시기 바랍니다."
          } as RenewalBridgePreflightProbe
        }
      }
    })
  });

  assert.equal(result.resolvedCertificateCount, 0);
  assert.equal(result.skippedCertificateCount, 1);
  assert.match(result.errors[0] ?? "", /이 인증서는 자동조회로 사업자번호를 읽을 수 없습니다/);
  assert.doesNotMatch(result.errors[0] ?? "", /갱신 가능한 공동인증서/);
});

test("resolveElectronicTaxOnboardingTemplateWorkbook prepares upload-session certificates before preflight when importer is available", async () => {
  let preparedPassword = "";
  let preflightCertificateIndex: number | null = null;

  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({
      plants: [
        {
          rowIndex: 2,
          certificateIndex: "upload-1",
          certificateName: "김부연()001168820231011111001399",
          plantName: "김부연 발전소",
          certificatePassword: ""
        }
      ]
    }),
    loadAvailableCertificates: async () => [
      createCertificate({
        index: "upload-1",
        cn: "김부연()001168820231011111001399",
        serial: "UPLOAD-SERIAL-001",
        userDN: "CN=김부연()001168820231011111001399",
        supportsPreflight: false,
        listSource: "upload-session"
      } as Partial<RenewalAgentCertificate>)
    ],
    resolveSharedPassword: async () => "shared-secret",
    prepareCertificateForPreflight: async (certificate, certificatePassword) => {
      preparedPassword = certificatePassword;
      return createCertificate({
        ...certificate,
        index: "21",
        supportsPreflight: true,
        listSource: "bridge-hdd"
      } as Partial<RenewalAgentCertificate>);
    },
    requestPreflight: async (payload) => {
      preflightCertificateIndex = payload.certificateIndex;
      return {
        result: {
          bridge: {
            preflightProbe: {
              ok: true,
              renewInfoSnapshot: {
                companyName: "김부연 태양광",
                businessNumber: "123-45-67890",
                ceoName: "김부연",
                bizType: "전기업",
                bizClass: "태양광",
                businessFieldCode: null,
                postalCode: null,
                baseAddress: "전라남도 나주시 빛가람로 1",
                detailAddress: null,
                contactName: null,
                contactDepartment: null,
                contactEmail: null,
                contactTel: null,
                contactFax: null,
                contactMobile: "010-1111-2222"
              }
            } as RenewalBridgePreflightProbe
          }
        }
      };
    }
  });

  assert.equal(preparedPassword, "shared-secret");
  assert.equal(preflightCertificateIndex, 21);
  assert.equal(result.resolvedCertificateCount, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(result.workbook.certificates[0]?.certificateIndex, "21");
  assert.equal(result.workbook.customers[0]?.businessNumber, "1234567890");
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
    /발전소 시트 \(지석기 발전소\): 사전조회 실패: 폐지된 인증서 정보입니다\./
  );
  assert.doesNotMatch(result.errors[0] ?? "", /관리자에게 문의/);
});

test("resolveElectronicTaxOnboardingTemplateWorkbook batches SignGate preflight requests when available", async () => {
  const batchPayloads: Array<Array<{ certificateIndex: number }>> = [];

  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({
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
          certificateIndex: "13",
          certificateName: "서해태양광",
          plantName: "서해 1호기",
          certificatePassword: ""
        },
        {
          rowIndex: 4,
          certificateIndex: "14",
          certificateName: "동해태양광",
          plantName: "동해 1호기",
          certificatePassword: ""
        }
      ]
    }),
    loadAvailableCertificates: async () => [
      createCertificate({ index: "12", cn: "한빛태양광", serial: "SERIAL-012", userDN: "USER-DN-012" }),
      createCertificate({ index: "13", cn: "서해태양광", serial: "SERIAL-013", userDN: "USER-DN-013" }),
      createCertificate({ index: "14", cn: "동해태양광", serial: "SERIAL-014", userDN: "USER-DN-014" })
    ],
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => {
      throw new Error("single preflight should not be used when batch preflight is available");
    },
    requestPreflightBatch: async (payloads) => {
      batchPayloads.push(payloads.map((payload) => ({ certificateIndex: payload.certificateIndex })));
      return payloads.map((payload) => ({
        result: {
          bridge: {
            preflightProbe: {
              ok: true,
              renewInfoSnapshot: {
                companyName: `회사 ${payload.certificateIndex}`,
                businessNumber: `123-45-6${String(payload.certificateIndex).padStart(4, "0")}`,
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
      }));
    },
    onboardingPreflightBatchSize: 2
  });

  assert.deepEqual(batchPayloads, [
    [{ certificateIndex: 12 }, { certificateIndex: 13 }],
    [{ certificateIndex: 14 }]
  ]);
  assert.equal(result.resolvedCertificateCount, 3);
});

test("resolveElectronicTaxOnboardingTemplateWorkbook uses concurrency-sized default preflight chunks", async () => {
  const plants = Array.from({ length: 18 }, (_, index) => ({
    rowIndex: index + 2,
    certificateIndex: String(index + 1),
    certificateName: `발전소 ${index + 1}`,
    plantName: `발전소 ${index + 1}`,
    certificatePassword: ""
  }));
  const batchSizes: number[] = [];

  const result = await resolveElectronicTaxOnboardingTemplateWorkbook({
    templateWorkbook: createTemplateWorkbook({ plants }),
    loadAvailableCertificates: async () =>
      plants.map((plant) =>
        createCertificate({
          index: plant.certificateIndex,
          cn: plant.certificateName,
          serial: `SERIAL-${plant.certificateIndex}`,
          userDN: `USER-DN-${plant.certificateIndex}`
        })
      ),
    resolveSharedPassword: async () => "shared-secret",
    requestPreflight: async () => {
      throw new Error("single preflight should not be used when batch preflight is available");
    },
    requestPreflightBatch: async (payloads) => {
      batchSizes.push(payloads.length);
      return payloads.map((payload) => ({
        result: {
          bridge: {
            preflightProbe: {
              ok: true,
              renewInfoSnapshot: {
                companyName: `발전소 ${payload.certificateIndex}`,
                businessNumber: `123-45-${String(payload.certificateIndex).padStart(5, "0")}`,
                ceoName: "대표자",
                bizType: "발전업",
                bizClass: "태양광",
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
      }));
    }
  });

  assert.deepEqual(batchSizes, [16, 2]);
  assert.equal(result.resolvedCertificateCount, 18);
});
