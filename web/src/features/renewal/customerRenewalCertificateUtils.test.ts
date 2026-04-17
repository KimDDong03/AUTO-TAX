import test from "node:test";
import assert from "node:assert/strict";
import type { Customer, CustomerCertificate, RenewalBridgePreflightProbe } from "../../types";
import type { RenewalAgentCertificate } from "./useRenewalAssistantState";
import {
  deriveCustomerCertificateKind,
  findRenewalCertificatesByIdentity,
  findCandidateCustomersForCertificate,
  findStoredCustomerCertificateForLocalCertificate,
  formatCustomerRenewalStatus
} from "./customerRenewalCertificateUtils";

function createCertificate(overrides: Partial<RenewalAgentCertificate> = {}): RenewalAgentCertificate {
  return {
    index: "1",
    cn: "한빛태양광",
    issuerToName: "issuer",
    usageToName: "전자세금용",
    todate: "2026-12-31",
    oid: null,
    serial: "SERIAL-1",
    userDN: "USER-DN-1",
    validateFrom: null,
    detailValidateTo: null,
    certDirPath: null,
    ...overrides
  };
}

function createStoredCertificate(
  overrides: Partial<CustomerCertificate> = {}
): CustomerCertificate {
  return {
    id: 1,
    customerId: 10,
    certificateKind: "electronic_tax",
    certificateName: "한빛태양광",
    certificateUsageName: "전자세금용",
    issuerName: "issuer",
    serial: "SERIAL-1",
    userDN: "USER-DN-1",
    oid: null,
    expireDate: "2026-12-31",
    certDirPath: null,
    certificatePasswordConfigured: false,
    isPrimary: false,
    linkSource: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function createCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 10,
    customerName: "홍길동",
    businessNumber: "123-45-67890",
    corpName: "한빛태양광",
    ceoName: "홍길동",
    addr: "서울시 강남구",
    bizType: "서비스",
    bizClass: "태양광",
    popbillUserId: "",
    popbillPassword: "",
    popbillState: "joined",
    popbillCertRegistered: true,
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

test("deriveCustomerCertificateKind categorizes renewal certificates", () => {
  assert.equal(
    deriveCustomerCertificateKind(createCertificate({ usageToName: "전자세금용 공동인증서" })),
    "electronic_tax"
  );
  assert.equal(
    deriveCustomerCertificateKind(createCertificate({ usageToName: "개인 범용 공동인증서" })),
    "general_personal"
  );
  assert.equal(
    deriveCustomerCertificateKind(createCertificate({ usageToName: "사업자 범용 공동인증서" })),
    "general_business"
  );
});

test("findStoredCustomerCertificateForLocalCertificate prefers primary when multiple matches exist", () => {
  const certificate = createCertificate();
  const secondary = createStoredCertificate({ id: 1, isPrimary: false });
  const primary = createStoredCertificate({ id: 2, isPrimary: true });

  const match = findStoredCustomerCertificateForLocalCertificate(certificate, [secondary, primary]);

  assert.equal(match?.id, 2);
});

test("findRenewalCertificatesByIdentity prefers serial/userDN when certificate index changes", () => {
  const certificates = [
    createCertificate({
      index: "9",
      cn: "같은 CN",
      serial: "SERIAL-OLD",
      userDN: "USER-DN-OLD"
    }),
    createCertificate({
      index: "22",
      cn: "같은 CN",
      serial: "SERIAL-KEEP",
      userDN: "USER-DN-KEEP"
    })
  ];

  const matches = findRenewalCertificatesByIdentity(certificates, {
    certificateIndex: "101",
    certificateCn: "같은 CN",
    serial: "SERIAL-KEEP",
    userDN: "USER-DN-KEEP"
  });

  assert.deepEqual(matches.map((certificate) => certificate.index), ["22"]);
});

test("findRenewalCertificatesByIdentity returns every same-cn candidate when only CN is known", () => {
  const certificates = [
    createCertificate({ index: "1", cn: "중복 CN", serial: "SERIAL-1", userDN: "USER-DN-1" }),
    createCertificate({ index: "2", cn: "중복 CN", serial: "SERIAL-2", userDN: "USER-DN-2" })
  ];

  const matches = findRenewalCertificatesByIdentity(certificates, {
    certificateCn: "중복 CN"
  });

  assert.deepEqual(matches.map((certificate) => certificate.index), ["1", "2"]);
});

test("findCandidateCustomersForCertificate only suggests electronic tax customers by normalized name", () => {
  const electronicTax = createCertificate({ cn: " 한빛 태양광 ", usageToName: "전자세금용" });
  const generalBusiness = createCertificate({ cn: "한빛태양광", usageToName: "사업자 범용 공동인증서" });
  const customers = [createCustomer(), createCustomer({ id: 11, corpName: "다른고객", customerName: "다른대표" })];

  assert.deepEqual(findCandidateCustomersForCertificate(electronicTax, customers).map((customer) => customer.id), [10]);
  assert.deepEqual(findCandidateCustomersForCertificate(generalBusiness, customers), []);
});

test("formatCustomerRenewalStatus preserves branch-specific customer renewal labels", () => {
  const renewInfoProbe = {
    ok: true,
    branch: "renew-info",
    renewInfoSubmitReady: false,
    renewInfoAutoSubmitReady: false,
    renewInfoSubmitSummary: "필수 항목 확인 필요",
    renewInfoAutoSubmitSummary: null,
    renewInfoPaymentPreviewTotalAmount: "5500원"
  } as RenewalBridgePreflightProbe;
  const passwordConfirmProbe = {
    ok: true,
    branch: "password-confirm",
    renewInfoSubmitResultBranch: null,
    renewInfoPaymentPreviewTotalAmount: null
  } as RenewalBridgePreflightProbe;

  assert.deepEqual(formatCustomerRenewalStatus(renewInfoProbe), {
    statusText: "필수 항목 확인 필요",
    statusTone: "warn",
    paymentAmount: "5500원",
    canOpenPayment: false
  });
  assert.deepEqual(formatCustomerRenewalStatus(passwordConfirmProbe), {
    statusText: "이미 발급 직전 단계",
    statusTone: "warn",
    paymentAmount: null,
    canOpenPayment: false
  });
});
