import test from "node:test";
import assert from "node:assert/strict";
import type { Customer, CustomerCertificate } from "../../types";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";
import {
  buildCustomerCertificateOnestopCreatePayload,
  CUSTOMER_POPBILL_JOIN_SUPPORT_MESSAGE,
  findExistingCustomerByBusinessNumber,
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
  return {
    customerName: "홍길동",
    businessNumber: "123-45-67890",
    corpName: "한빛태양광",
    addr: "서울시 강남구",
    bizType: "전기업",
    bizClass: "태양광발전",
    renewalContactMobile: "",
    memo: "",
    ...overrides
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
