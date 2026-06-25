import test from "node:test";
import assert from "node:assert/strict";
import type { Customer, CustomerCertificate } from "../../types";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";
import {
  buildCustomerCertificateOnestopDraftFromWorkbookCustomer,
  buildCustomerCertificateOnestopTemplateWorkbook,
  buildCustomerCertificateOnestopCreatePayload,
  CUSTOMER_POPBILL_JOIN_SUPPORT_MESSAGE,
  filterCustomerOnestopCertificates,
  findExistingCustomerByBusinessNumber,
  mergeCustomerOnestopCertificates,
  resolveExecutableCertificateForOnestopRegistration,
  runCustomerCertificateOnestopRegistration,
  type CustomerCertificateOnestopDraft
} from "./customerCertificateOnestop";

function createCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    customerName: "홍길동",
    businessNumber: "123-45-67890",
    corpName: "한빛태양광",
    ceoName: "홍길동",
    addr: "서울시 강남구",
    bizType: "전기업",
    bizClass: "태양광발전",
    popbillUserId: "",
    popbillPassword: "",
    popbillState: "joined",
    popbillCertRegistered: false,
    popbillCertExpireDate: null,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "",
    issueCompleteSmsTemplate: "",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    ...overrides
  };
}

function createCertificate(overrides: Partial<RenewalAgentCertificate> = {}): RenewalAgentCertificate {
  return {
    index: "7",
    cn: "한빛태양광",
    issuerToName: "한국정보인증",
    usageToName: "전자세금용",
    todate: "2027-04-28T00:00:00.000Z",
    oid: "1.2.410.200004.5.2.1.6.257",
    serial: "SERIAL-7",
    userDN: "USER-DN-7",
    validateFrom: null,
    detailValidateTo: null,
    certDirPath: null,
    listSource: "bridge-hdd",
    supportsPreflight: true,
    ...overrides
  };
}

function createDraft(overrides: Partial<CustomerCertificateOnestopDraft> = {}): CustomerCertificateOnestopDraft {
  const { issueCompleteSmsTemplate, ...restOverrides } = overrides;
  return {
    customerName: "홍길동",
    businessNumber: "123-45-67890",
    corpName: "한빛태양광",
    addr: "서울시 강남구",
    bizType: "전기업",
    bizClass: "태양광발전",
    renewalContactMobile: "",
    issueCompleteSmsTemplate: issueCompleteSmsTemplate ?? "",
    memo: "",
    ...restOverrides
  };
}

function createLinkedCertificate(customerId = 1): CustomerCertificate {
  return {
    id: 10,
    customerId,
    certificateKind: "electronic_tax",
    certificateName: "한빛태양광",
    certificateUsageName: "전자세금용",
    issuerName: "한국정보인증",
    serial: "SERIAL-7",
    userDN: "USER-DN-7",
    oid: "1.2.410.200004.5.2.1.6.257",
    expireDate: null,
    certDirPath: null,
    certificatePasswordConfigured: false,
    isPrimary: true,
    linkSource: "auto",
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z"
  };
}

test("findExistingCustomerByBusinessNumber normalizes punctuation", () => {
  const customer = createCustomer({ businessNumber: "1234567890" });
  assert.equal(findExistingCustomerByBusinessNumber([customer], "123-45-67890")?.id, customer.id);
});

test("buildCustomerCertificateOnestopCreatePayload keeps address as match key", () => {
  assert.deepEqual(buildCustomerCertificateOnestopCreatePayload(createDraft()).matchAddresses, ["서울시 강남구"]);
});

test("filterCustomerOnestopCertificates hides expired and already registered customer certificates", () => {
  const existing = createCustomer({ id: 1, customerName: "홍길동", corpName: "한빛태양광" });
  const linkedCertificate = createLinkedCertificate(2);
  const available = createCertificate({ index: "4", cn: "새 발전소", serial: "SERIAL-4", userDN: "USER-DN-4" });

  const result = filterCustomerOnestopCertificates({
    certificates: [
      createCertificate({ index: "1", cn: "만료 인증서", todate: "2026-05-04" }),
      createCertificate({ index: "2", cn: "이미 연결", serial: linkedCertificate.serial, userDN: linkedCertificate.userDN }),
      createCertificate({ index: "3", cn: "한빛태양광", serial: "SERIAL-3", userDN: "USER-DN-3" }),
      available
    ],
    customers: [existing],
    customerCertificates: [linkedCertificate],
    todayDateKey: "2026-05-05"
  });

  assert.deepEqual(result.availableCertificates.map((certificate) => certificate.index), ["4"]);
  assert.deepEqual(result.visibleCertificates.map((certificate) => certificate.index), ["4"]);
  assert.equal(result.hiddenExpiredCount, 1);
  assert.equal(result.hiddenRegisteredCount, 2);
});

test("filterCustomerOnestopCertificates searches available certificates", () => {
  const result = filterCustomerOnestopCertificates({
    certificates: [
      createCertificate({ index: "1", cn: "북부 발전소", issuerToName: "한국정보인증" }),
      createCertificate({ index: "2", cn: "남부 발전소", issuerToName: "금융결제원" })
    ],
    customers: [],
    customerCertificates: [],
    searchQuery: "금융",
    todayDateKey: "2026-05-05"
  });

  assert.deepEqual(result.availableCertificates.map((certificate) => certificate.index), ["1", "2"]);
  assert.deepEqual(result.visibleCertificates.map((certificate) => certificate.index), ["2"]);
});

test("filterCustomerOnestopCertificates treats enterprise general certificates as issue-capable", () => {
  const result = filterCustomerOnestopCertificates({
    certificates: [
      createCertificate({ index: "1", usageToName: "기업 범용", oid: null }),
      createCertificate({ index: "2", usageToName: "범용(기업)", oid: null }),
      createCertificate({ index: "3", usageToName: "은행/보험용", oid: "1.2.410.200005.1.1.4" })
    ],
    customers: [],
    customerCertificates: [],
    todayDateKey: "2026-05-05"
  });

  assert.deepEqual(result.availableCertificates.map((certificate) => certificate.index), ["1", "2"]);
});

test("filterCustomerOnestopCertificates hides personal general certificates from customer registration candidates", () => {
  const result = filterCustomerOnestopCertificates({
    certificates: [
      createCertificate({ index: "1", usageToName: "개인 범용", oid: "1.2.410.200004.5.1.1.5" }),
      createCertificate({ index: "2", usageToName: "범용", oid: "1.2.410.200004.5.2.1.2" }),
      createCertificate({ index: "3", usageToName: "법인 범용", oid: "1.2.410.200004.5.2.1.1" })
    ],
    customers: [],
    customerCertificates: [],
    todayDateKey: "2026-05-05"
  });

  assert.deepEqual(result.availableCertificates.map((certificate) => certificate.index), ["3"]);
  assert.deepEqual(result.visibleCertificates.map((certificate) => certificate.index), ["3"]);
});

test("mergeCustomerOnestopCertificates keeps one row for the same NPKI and uploaded certificate", () => {
  const bridgeCertificate = createCertificate({
    index: "11",
    serial: "SERIAL-SAME",
    userDN: "USER-DN-SAME",
    listSource: "bridge-hdd",
    supportsPreflight: true
  });
  const uploadedCertificate = createCertificate({
    index: "-42",
    serial: "SERIAL-SAME",
    userDN: "USER-DN-SAME",
    listSource: "upload-session",
    supportsPreflight: false
  });

  const merged = mergeCustomerOnestopCertificates([bridgeCertificate], [uploadedCertificate]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.index, "11");
});

test("mergeCustomerOnestopCertificates upgrades an uploaded row when the bridge-readable certificate is later found", () => {
  const uploadedCertificate = createCertificate({
    index: "-42",
    serial: "SERIAL-SAME",
    userDN: "USER-DN-SAME",
    listSource: "upload-session",
    supportsPreflight: false
  });
  const bridgeCertificate = createCertificate({
    index: "11",
    serial: "SERIAL-SAME",
    userDN: "USER-DN-SAME",
    listSource: "bridge-hdd",
    supportsPreflight: true
  });

  const merged = mergeCustomerOnestopCertificates([uploadedCertificate], [bridgeCertificate]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.index, "11");
});

test("buildCustomerCertificateOnestopTemplateWorkbook preserves selected certificate rows for onboarding resolver", () => {
  const certificate = createCertificate({
    index: "-42",
    cn: "김부연()001168820231011111001399",
    listSource: "upload-session",
    supportsPreflight: false
  });

  const workbook = buildCustomerCertificateOnestopTemplateWorkbook([
    {
      rowIndex: 7,
      certificate,
      certificateIndex: String(certificate.index),
      certificateName: certificate.cn,
      certificatePassword: "pw",
      corpName: "",
      plantName: "",
      customerName: "",
      businessNumber: ""
    }
  ]);

  assert.equal(workbook.certificates.length, 1);
  assert.equal(workbook.certificates[0]?.certificateIndex, "-42");
  assert.equal(workbook.certificates[0]?.certificatePassword, "pw");
  assert.equal(workbook.plants.length, 1);
  assert.equal(workbook.plants[0]?.rowIndex, 7);
  assert.equal(workbook.plants[0]?.certificateIndex, "-42");
  assert.equal(workbook.plants[0]?.plantName, "김부연()001168820231011111001399");
  assert.equal(workbook.plants[0]?.selected, true);
});

test("buildCustomerCertificateOnestopDraftFromWorkbookCustomer maps resolver customer output to one-stop draft", () => {
  const draft = buildCustomerCertificateOnestopDraftFromWorkbookCustomer({
    rowIndex: 7,
    customerName: "김부연",
    businessNumber: "1234567890",
    corpName: "김부연 발전소",
    addr: "전북 군산시",
    bizType: "전기업",
    bizClass: "태양광발전",
    renewalContactMobile: "010-0000-0000",
    memo: "메모"
  });

  assert.deepEqual(draft, {
    customerName: "김부연",
    businessNumber: "1234567890",
    corpName: "김부연 발전소",
    addr: "전북 군산시",
    bizType: "전기업",
    bizClass: "태양광발전",
    renewalContactMobile: "010-0000-0000",
    issueCompleteSmsTemplate: "",
    memo: "메모"
  });
});

test("runCustomerCertificateOnestopRegistration rejects expired certificate before customer creation or Popbill join", async () => {
  const calls: string[] = [];

  await assert.rejects(
    () =>
      runCustomerCertificateOnestopRegistration({
        customers: [],
        draft: createDraft(),
        certificate: createCertificate({ todate: "2000-01-01" }),
        certificatePassword: "pw",
        createCustomer: async () => {
          calls.push("create");
          throw new Error("should not create");
        },
        joinPopbill: async () => {
          calls.push("join");
          throw new Error("should not join");
        },
        linkCertificate: async () => {
          calls.push("link");
          throw new Error("should not link");
        },
        loadAvailableCertificates: async () => {
          calls.push("load-certs");
          return [];
        },
        registerCertificate: async () => {
          calls.push("register");
          throw new Error("should not register");
        },
        refreshCertificateStatus: async () => {
          calls.push("status");
          throw new Error("should not refresh");
        }
      }),
    /만료된 발행 가능 공동인증서/
  );

  assert.deepEqual(calls, []);
});

test("runCustomerCertificateOnestopRegistration uses existing customer without duplicate create", async () => {
  const calls: string[] = [];
  const existing = createCustomer({ popbillState: "pending" });

  const result = await runCustomerCertificateOnestopRegistration({
    customers: [existing],
    draft: createDraft(),
    certificate: createCertificate(),
    certificatePassword: "pw",
    createCustomer: async () => {
      calls.push("create");
      throw new Error("should not create");
    },
    joinPopbill: async (customerId) => {
      calls.push(`join:${customerId}`);
      return createCustomer({ id: customerId, popbillState: "joined" });
    },
    linkCertificate: async (customerId) => {
      calls.push(`link:${customerId}`);
      return createLinkedCertificate(customerId);
    },
    loadAvailableCertificates: async () => {
      calls.push("load-certs");
      return [];
    },
    registerCertificate: async (customer, certificate) => {
      calls.push(`register:${customer.id}:${certificate.index}`);
      return { outcome: "registered" };
    },
    refreshCertificateStatus: async (customerId) => {
      calls.push(`status:${customerId}`);
      return createCustomer({ id: customerId, popbillState: "joined", popbillCertRegistered: true });
    }
  });

  assert.equal(result.existingCustomerUsed, true);
  assert.equal(result.canRetryPopbillJoin, false);
  assert.equal(result.canRetryCertificateRegistration, false);
  assert.deepEqual(calls, ["link:1", "join:1", "register:1:7", "status:1"]);
});

test("runCustomerCertificateOnestopRegistration accepts business general certificates", async () => {
  const calls: string[] = [];
  const certificate = createCertificate({ usageToName: "사업자 범용" });

  const result = await runCustomerCertificateOnestopRegistration({
    customers: [],
    draft: createDraft(),
    certificate,
    certificatePassword: "pw",
    createCustomer: async () => {
      calls.push("create");
      return { customer: createCustomer(), autoJoinStatus: "joined" };
    },
    joinPopbill: async (customerId) => {
      calls.push(`join:${customerId}`);
      return createCustomer({ id: customerId, popbillState: "joined" });
    },
    linkCertificate: async (customerId, linkedCertificate) => {
      calls.push(`link:${customerId}:${linkedCertificate.usageToName}`);
      return createLinkedCertificate(customerId);
    },
    loadAvailableCertificates: async () => {
      calls.push("load-certs");
      return [];
    },
    registerCertificate: async (customer, registeredCertificate) => {
      calls.push(`register:${customer.id}:${registeredCertificate.usageToName}`);
      return { outcome: "registered" };
    },
    refreshCertificateStatus: async (customerId) => {
      calls.push(`status:${customerId}`);
      return createCustomer({ id: customerId, popbillState: "joined", popbillCertRegistered: true });
    }
  });

  assert.equal(result.customer.id, 1);
  assert.deepEqual(calls, ["create", "link:1:사업자 범용", "register:1:사업자 범용", "status:1"]);
});

test("runCustomerCertificateOnestopRegistration rejects personal general certificates", async () => {
  await assert.rejects(
    () =>
      runCustomerCertificateOnestopRegistration({
        customers: [],
        draft: createDraft(),
        certificate: createCertificate({ usageToName: "개인 범용", oid: "1.2.410.200004.5.1.1.5" }),
        certificatePassword: "pw",
        createCustomer: async () => {
          throw new Error("should not create");
        },
        joinPopbill: async () => {
          throw new Error("should not join");
        },
        linkCertificate: async () => {
          throw new Error("should not link");
        },
        loadAvailableCertificates: async () => [],
        registerCertificate: async () => {
          throw new Error("should not register");
        },
        refreshCertificateStatus: async () => {
          throw new Error("should not refresh");
        }
      }),
    /전자세금용 또는 기업범용 공동인증서만/
  );
});

test("runCustomerCertificateOnestopRegistration preserves customer and link when new auto join failed", async () => {
  const calls: string[] = [];

  const result = await runCustomerCertificateOnestopRegistration({
    customers: [],
    draft: createDraft(),
    certificate: createCertificate(),
    certificatePassword: "pw",
    createCustomer: async (payload) => {
      calls.push(`create:${payload.businessNumber}`);
      return {
        customer: createCustomer({ id: 2, popbillState: "failed" }),
        autoJoinStatus: "failed",
        autoJoinError: "가입 실패"
      };
    },
    joinPopbill: async () => {
      calls.push("join");
      throw new Error("should not retry new customer join immediately");
    },
    linkCertificate: async (customerId) => {
      calls.push(`link:${customerId}`);
      return createLinkedCertificate(customerId);
    },
    loadAvailableCertificates: async () => {
      calls.push("load-certs");
      return [];
    },
    registerCertificate: async () => {
      calls.push("register");
      throw new Error("should skip registration");
    },
    refreshCertificateStatus: async () => {
      calls.push("status");
      throw new Error("should skip status");
    }
  });

  assert.equal(result.customer.id, 2);
  assert.equal(result.canRetryPopbillJoin, true);
  assert.equal(result.canRetryCertificateRegistration, true);
  assert.deepEqual(calls, ["create:123-45-67890", "link:2"]);
  assert.equal(
    result.steps.find((step) => step.key === "customer")?.message,
    `고객을 생성했습니다. ${CUSTOMER_POPBILL_JOIN_SUPPORT_MESSAGE}`
  );
  assert.equal(result.steps.find((step) => step.key === "popbill-certificate")?.status, "skipped");
});

test("resolveExecutableCertificateForOnestopRegistration matches uploaded metadata by serial and userDN", async () => {
  const uploaded = createCertificate({
    index: "upload-abc",
    listSource: "upload-session",
    supportsPreflight: false
  });
  const local = createCertificate({ index: "11", supportsPreflight: true });

  const resolved = await resolveExecutableCertificateForOnestopRegistration(uploaded, async () => [local]);

  assert.equal(resolved.index, "11");
});

test("resolveExecutableCertificateForOnestopRegistration fails closed on ambiguous uploaded metadata", async () => {
  const uploaded = createCertificate({
    index: "upload-abc",
    listSource: "upload-session",
    supportsPreflight: false
  });

  await assert.rejects(
    () =>
      resolveExecutableCertificateForOnestopRegistration(uploaded, async () => [
        createCertificate({ index: "11" }),
        createCertificate({ index: "12" })
      ]),
    /여러 개/
  );
});
