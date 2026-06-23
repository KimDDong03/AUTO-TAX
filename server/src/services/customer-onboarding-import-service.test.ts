import assert from "node:assert/strict";
import test from "node:test";
import type { Customer, CustomerCertificateInput, CustomerInput, LogEntry } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import { buildCustomerOnboardingPreview, commitCustomerOnboardingImport, type CustomerOnboardingWorkbookInput } from "./customer-onboarding-import-service.js";

const existingCustomer: Customer = {
  id: 7,
  customerName: "기존 고객",
  businessNumber: "1112233334",
  corpName: "기존 발전소",
  ceoName: "기존 고객",
  addr: "경기도 양평군 사호1길 152",
  bizType: "전기업",
  bizClass: "태양광",
  popbillUserId: "C7",
  popbillPassword: "secret",
  popbillState: "joined",
  popbillCertRegistered: true,
  popbillCertExpireDate: null,
  issueMode: "review",
  issueDay: null,
  issueHour: null,
  issueMinute: null,
  renewalContactMobile: "01012341234",
  memo: "",
  plantNames: ["기존 1호기"],
  matchAddresses: ["경기도 양평군 사호1길 152"],
  createdAt: "2026-03-30T00:00:00.000Z",
  updatedAt: "2026-03-30T00:00:00.000Z"
};

function resolveAddressStub(query: string) {
  return Promise.resolve({
    resolvedAddress: query.replace(/\s+/g, " ").trim()
  });
}

test("buildCustomerOnboardingPreview classifies create and update rows and detects orphan sheet rows", async () => {
  const requestStore = {
    listCustomers: async () => [existingCustomer]
  } as unknown as Pick<AppStore, "listCustomers"> as AppStore;

  const workbook: CustomerOnboardingWorkbookInput = {
    customers: [
      {
        rowIndex: 2,
        customerName: "새 고객",
        businessNumber: "222-33-44445",
        corpName: "새 발전소",
        addr: "경기도 여주시 대신면 새길 10",
        bizType: "전기업",
        bizClass: "태양광",
        renewalContactMobile: "",
        memo: ""
      },
      {
        rowIndex: 3,
        customerName: "기존 고객",
        businessNumber: "111-22-33334",
        corpName: "기존 발전소",
        addr: "경기도 양평군 사호1길 152",
        bizType: "전기업",
        bizClass: "태양광",
        renewalContactMobile: "",
        memo: ""
      }
    ],
    plants: [
      {
        rowIndex: 2,
        businessNumber: "222-33-44445",
        plantName: "새 1호기",
        matchAddress: "경기도 여주시 대신면 새길 10"
      },
      {
        rowIndex: 3,
        businessNumber: "999-99-99999",
        plantName: "고아 1호기",
        matchAddress: "경기도 어딘가"
      }
    ],
    certificates: [
      {
        rowIndex: 2,
        businessNumber: "222-33-44445",
        certificateKind: "electronic_tax",
        certificateName: "새 발전소",
        certificateUsageName: "",
        issuerName: "",
        certificatePassword: "pw-1",
        isPrimary: true
      },
      {
        rowIndex: 3,
        businessNumber: "111-22-33334",
        certificateKind: "electronic_tax",
        certificateName: "기존 발전소",
        certificateUsageName: "",
        issuerName: "",
        certificatePassword: "pw-2",
        isPrimary: true
      }
    ]
  };

  const preview = await buildCustomerOnboardingPreview(requestStore, workbook, {
    resolveAddress: resolveAddressStub
  });

  assert.equal(preview.totalCustomers, 2);
  assert.equal(preview.createCount, 1);
  assert.equal(preview.updateCount, 1);
  assert.equal(preview.blockedCount, 0);
  assert.equal(preview.fileErrors.length, 1);
  assert.match(preview.fileErrors[0] ?? "", /발전소 시트 3행/);
  assert.deepEqual(
    preview.rows.map((row) => ({ rowIndex: row.rowIndex, status: row.status, plantCount: row.plantCount, certificateCount: row.certificateCount })),
    [
      { rowIndex: 2, status: "create", plantCount: 1, certificateCount: 1 },
      { rowIndex: 3, status: "update", plantCount: 0, certificateCount: 1 }
    ]
  );
});

test("buildCustomerOnboardingPreview accepts business general certificates as issue-capable", async () => {
  const requestStore = {
    listCustomers: async () => []
  } as unknown as Pick<AppStore, "listCustomers"> as AppStore;

  const workbook: CustomerOnboardingWorkbookInput = {
    customers: [
      {
        rowIndex: 2,
        customerName: "새 고객",
        businessNumber: "222-33-44445",
        corpName: "새 발전소",
        addr: "경기도 여주시 대신면 새길 10",
        bizType: "전기업",
        bizClass: "태양광",
        renewalContactMobile: "",
        memo: ""
      }
    ],
    plants: [
      {
        rowIndex: 2,
        businessNumber: "222-33-44445",
        plantName: "새 1호기",
        matchAddress: "경기도 여주시 대신면 새길 10"
      }
    ],
    certificates: [
      {
        rowIndex: 2,
        businessNumber: "222-33-44445",
        certificateKind: "general_business",
        certificateName: "범용 인증서",
        certificateUsageName: "",
        issuerName: "",
        certificatePassword: "pw-general",
        isPrimary: true
      }
    ]
  };

  const preview = await buildCustomerOnboardingPreview(requestStore, workbook, {
    resolveAddress: resolveAddressStub
  });

  assert.equal(preview.totalCustomers, 1);
  assert.equal(preview.createCount, 1);
  assert.equal(preview.blockedCount, 0);
  assert.deepEqual(preview.rows, [
    {
      rowIndex: 2,
      customerName: "새 고객",
      businessNumber: "2223344445",
      corpName: "새 발전소",
      plantCount: 1,
      certificateCount: 1,
      status: "create",
      errors: [],
      warnings: [],
      canImport: true
    }
  ]);
});

test("buildCustomerOnboardingPreview allows certificate-driven rows without address as warnings", async () => {
  const requestStore = {
    listCustomers: async () => []
  } as unknown as Pick<AppStore, "listCustomers"> as AppStore;

  const workbook: CustomerOnboardingWorkbookInput = {
    customers: [
      {
        rowIndex: 4,
        customerName: "유학현",
        businessNumber: "123-45-67890",
        corpName: "유학현",
        addr: "",
        bizType: "전기업",
        bizClass: "태양광발전(자가용PPA)",
        renewalContactMobile: "",
        memo: ""
      }
    ],
    plants: [
      {
        rowIndex: 4,
        businessNumber: "123-45-67890",
        plantName: "유학현",
        matchAddress: ""
      }
    ],
    certificates: [
      {
        rowIndex: 4,
        businessNumber: "123-45-67890",
        certificateKind: "electronic_tax",
        certificateName: "유학현()001168920230227111003787",
        certificateUsageName: "전자세금용",
        issuerName: "테스트 기관",
        certificatePassword: "pw-1",
        isPrimary: true
      }
    ]
  };

  const preview = await buildCustomerOnboardingPreview(requestStore, workbook, {
    resolveAddress: resolveAddressStub
  });

  assert.equal(preview.createCount, 1);
  assert.equal(preview.blockedCount, 0);
  assert.equal(preview.rows[0]?.status, "create");
  assert.equal(preview.rows[0]?.canImport, true);
  assert.equal(preview.rows[0]?.plantCount, 0);
  assert.equal(preview.rows[0]?.certificateCount, 1);
  assert.deepEqual(preview.rows[0]?.errors, []);
  assert.deepEqual(preview.rows[0]?.warnings, [
    "사업장 주소가 없어 고객 등록 후 고객 관리에서 보완하세요.",
    "발전소 시트 4행: 매칭 주소가 없어 메일 자동 매칭에는 사용하지 않습니다. 고객 등록 후 보완하세요.",
    "매칭 주소가 없어 한전 메일 자동 매칭에는 고객 등록 후 주소 보완이 필요합니다."
  ]);
});

test("buildCustomerOnboardingPreview still ignores personal general certificates", async () => {
  const requestStore = {
    listCustomers: async () => []
  } as unknown as Pick<AppStore, "listCustomers"> as AppStore;

  const workbook: CustomerOnboardingWorkbookInput = {
    customers: [
      {
        rowIndex: 2,
        customerName: "새 고객",
        businessNumber: "222-33-44445",
        corpName: "새 발전소",
        addr: "경기도 여주시 대신면 새길 10",
        bizType: "전기업",
        bizClass: "태양광",
        renewalContactMobile: "",
        memo: ""
      }
    ],
    plants: [
      {
        rowIndex: 2,
        businessNumber: "222-33-44445",
        plantName: "새 1호기",
        matchAddress: "경기도 여주시 대신면 새길 10"
      }
    ],
    certificates: [
      {
        rowIndex: 2,
        businessNumber: "222-33-44445",
        certificateKind: "general_personal",
        certificateName: "개인 범용 인증서",
        certificateUsageName: "",
        issuerName: "",
        certificatePassword: "pw-personal",
        isPrimary: true
      }
    ]
  };

  const preview = await buildCustomerOnboardingPreview(requestStore, workbook, {
    resolveAddress: resolveAddressStub
  });

  assert.equal(preview.blockedCount, 1);
  assert.deepEqual(preview.rows[0]?.errors, ["발행 가능 공동인증서를 확인하지 못했습니다."]);
  assert.deepEqual(preview.rows[0]?.warnings, ["공동인증서 시트 2행: 발행 가능 인증서가 아니어서 이번 초기 등록에서 무시합니다."]);
});

test("commitCustomerOnboardingImport saves customers, links certificates, and reports warnings", async () => {
  const savedCustomers: Array<{ input: CustomerInput; customerId?: number }> = [];
  const linkedCertificates: CustomerCertificateInput[] = [];
  const logs: Array<{ level: LogEntry["level"]; scope: string; message: string; context: unknown }> = [];

  const requestStore = {
    listCustomers: async () => [existingCustomer],
    findCustomerByBusinessNumber: async () => null,
    saveCustomer: async (input: CustomerInput, customerId?: number) => {
      savedCustomers.push({ input, customerId });
      const id = customerId ?? 20;
      return {
        ...existingCustomer,
        id,
        customerName: input.customerName,
        businessNumber: input.businessNumber,
        corpName: input.corpName,
        ceoName: input.ceoName,
        addr: input.addr,
        bizType: input.bizType,
        bizClass: input.bizClass,
        renewalContactMobile: input.renewalContactMobile,
        memo: input.memo,
        plantNames: input.plantNames,
        matchAddresses: input.matchAddresses
      };
    },
    upsertCustomerCertificate: async (input: CustomerCertificateInput) => {
      linkedCertificates.push(input);
      return {
        id: linkedCertificates.length,
        customerId: input.customerId,
        certificateKind: input.certificateKind,
        certificateName: input.certificateName,
        certificateUsageName: input.certificateUsageName,
        issuerName: input.issuerName,
        serial: input.serial,
        userDN: input.userDN,
        oid: input.oid,
        expireDate: input.expireDate,
        certDirPath: input.certDirPath,
        certificatePasswordConfigured: Boolean(input.certificatePassword),
        isPrimary: input.isPrimary,
        linkSource: input.linkSource,
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z"
      };
    },
    createLog: async (level: LogEntry["level"], scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as Pick<AppStore, "listCustomers" | "saveCustomer" | "upsertCustomerCertificate" | "createLog"> as AppStore;

  const workbook: CustomerOnboardingWorkbookInput = {
    customers: [
      {
        rowIndex: 2,
        customerName: "새 고객",
        businessNumber: "2223344445",
        corpName: "새 발전소",
        addr: "경기도 여주시 대신면 새길 10",
        bizType: "전기업",
        bizClass: "태양광",
        renewalContactMobile: "010-5555-7777",
        memo: "신규"
      }
    ],
    plants: [
      {
        rowIndex: 2,
        businessNumber: "2223344445",
        plantName: "새 1호기",
        matchAddress: "경기도 여주시 대신면 새길 10"
      }
    ],
    certificates: [
      {
        rowIndex: 2,
        businessNumber: "2223344445",
        certificateKind: "electronic_tax",
        certificateIndex: "101",
        certificateName: "새 발전소",
        certificateUsageName: "",
        issuerName: "",
        serial: "SERIAL-101",
        userDN: "USER-DN-101",
        expireDate: "2099-12-31",
        certificatePassword: "pw-1",
        isPrimary: true
      },
      {
        rowIndex: 3,
        businessNumber: "2223344445",
        certificateKind: "general_business",
        certificateName: "기업범용",
        certificateUsageName: "사업자범용",
        issuerName: "",
        serial: "SERIAL-102",
        userDN: "USER-DN-102",
        expireDate: "2099-12-31",
        certificatePassword: "pw-2",
        isPrimary: false
      }
    ]
  };

  const result = await commitCustomerOnboardingImport(requestStore, workbook, {
    resolveAddress: resolveAddressStub,
    autoJoinCustomer: async () => ({ status: "failed", error: "발행 연동 테스트 실패" })
  });

  assert.equal(result.createdCount, 1);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.successCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(result.linkedCertificateCount, 2);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]?.message ?? "", /발행 연동 실패/);
  assert.equal(savedCustomers.length, 1);
  assert.deepEqual(savedCustomers[0]?.input.plantNames, ["새 1호기"]);
  assert.deepEqual(savedCustomers[0]?.input.matchAddresses, ["경기도 여주시 대신면 새길 10"]);
  assert.equal(linkedCertificates.length, 2);
  assert.equal(linkedCertificates[0]?.certificatePassword, undefined);
  assert.equal(linkedCertificates[0]?.certificateKind, "electronic_tax");
  assert.equal(linkedCertificates[0]?.serial, "SERIAL-101");
  assert.equal(linkedCertificates[0]?.userDN, "USER-DN-101");
  assert.equal(linkedCertificates[0]?.expireDate, "2099-12-31");
  assert.equal(linkedCertificates[1]?.certificateKind, "general_business");
  assert.equal(linkedCertificates[1]?.serial, "SERIAL-102");
  assert.equal(linkedCertificates[1]?.userDN, "USER-DN-102");
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.scope, "customer-onboarding-import");
});
