import type { Customer, CustomerCertificate } from "../../types";
import { matchesAnySearchText } from "../../lib/searchMatch";
import {
  deriveCustomerCertificateKind,
  findCandidateCustomersForCertificate,
  findRenewalCertificatesByIdentity,
  findStoredCustomerCertificateForLocalCertificate,
  getCustomerCertificateTodayDateKey,
  isCustomerCertificateExpired
} from "../renewal/customerRenewalCertificateUtils";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";

export type CustomerCertificateOnestopDraft = {
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  renewalContactMobile: string;
  issueCompleteSmsTemplate: string;
  memo: string;
};

export type CustomerCertificateOnestopCreatePayload = CustomerCertificateOnestopDraft & {
  ceoName: string;
  issueMode: "review";
  issueDay: null;
  issueHour: null;
  issueMinute: null;
  plantNames: string[];
  matchAddresses: string[];
};

export type CustomerCertificateOnestopCreateResult = {
  customer: Customer;
  autoJoinStatus?: "already-joined" | "linked-existing-member" | "joined" | "linked-after-duplicate-check" | "failed";
  autoJoinError?: string | null;
};

export type CustomerCertificateOnestopStepKey =
  | "customer"
  | "certificate-link"
  | "popbill-join"
  | "popbill-certificate"
  | "cert-status";

export type CustomerCertificateOnestopStepResult = {
  key: CustomerCertificateOnestopStepKey;
  label: string;
  status: "success" | "skipped" | "failed";
  message: string;
};

export type CustomerCertificateOnestopResult = {
  customer: Customer;
  existingCustomerUsed: boolean;
  steps: CustomerCertificateOnestopStepResult[];
  canRetryPopbillJoin: boolean;
  canRetryCertificateRegistration: boolean;
};

export type RunCustomerCertificateOnestopRegistrationArgs = {
  customers: Customer[];
  draft: CustomerCertificateOnestopDraft;
  certificate: RenewalAgentCertificate;
  certificatePassword: string;
  createCustomer: (payload: CustomerCertificateOnestopCreatePayload) => Promise<CustomerCertificateOnestopCreateResult>;
  joinPopbill: (customerId: number) => Promise<Customer>;
  linkCertificate: (
    customerId: number,
    certificate: RenewalAgentCertificate,
    options?: { linkSource?: CustomerCertificate["linkSource"] }
  ) => Promise<CustomerCertificate>;
  loadAvailableCertificates: () => Promise<RenewalAgentCertificate[]>;
  registerCertificate: (
    customer: Customer,
    certificate: RenewalAgentCertificate,
    certificatePassword: string
  ) => Promise<{ outcome: "registered" | "already-registered" }>;
  refreshCertificateStatus: (customerId: number) => Promise<Customer>;
};

export type CustomerOnestopCertificateFilterResult = {
  availableCertificates: RenewalAgentCertificate[];
  visibleCertificates: RenewalAgentCertificate[];
  hiddenExpiredCount: number;
  hiddenRegisteredCount: number;
};

export const CUSTOMER_POPBILL_JOIN_SUPPORT_MESSAGE =
  "등록 처리를 완료하지 못했습니다. AUTO-TAX 운영팀에 문의해 주세요.";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function getCustomerCertificateOnestopDisplayName(customer: Customer): string {
  return customer.corpName.trim() || customer.customerName.trim() || `고객 #${customer.id}`;
}

export function findExistingCustomerByBusinessNumber(customers: Customer[], businessNumber: string): Customer | null {
  const normalizedBusinessNumber = digitsOnly(businessNumber);
  if (!normalizedBusinessNumber) {
    return null;
  }
  return customers.find((customer) => digitsOnly(customer.businessNumber) === normalizedBusinessNumber) ?? null;
}

function getCustomerOnestopCertificateExpireDate(certificate: RenewalAgentCertificate): string | null {
  return certificate.todate ?? certificate.detailValidateTo ?? null;
}

function matchesCustomerOnestopCertificateSearch(certificate: RenewalAgentCertificate, searchQuery: string): boolean {
  return matchesAnySearchText(searchQuery, [
    certificate.index,
    certificate.cn,
    certificate.issuerToName,
    certificate.usageToName,
    certificate.todate,
    certificate.detailValidateTo,
    certificate.serial,
    certificate.userDN
  ]);
}

export function isCustomerOnestopCertificateAlreadyRegistered(
  certificate: RenewalAgentCertificate,
  customers: Customer[],
  customerCertificates: CustomerCertificate[]
): boolean {
  if (findStoredCustomerCertificateForLocalCertificate(certificate, customerCertificates)) {
    return true;
  }

  return findCandidateCustomersForCertificate(certificate, customers).length > 0;
}

export function filterCustomerOnestopCertificates(options: {
  certificates: RenewalAgentCertificate[];
  customers: Customer[];
  customerCertificates: CustomerCertificate[];
  searchQuery?: string;
  todayDateKey?: string;
}): CustomerOnestopCertificateFilterResult {
  const todayDateKey = options.todayDateKey ?? getCustomerCertificateTodayDateKey();
  const availableCertificates: RenewalAgentCertificate[] = [];
  let hiddenExpiredCount = 0;
  let hiddenRegisteredCount = 0;

  for (const certificate of options.certificates) {
    if (isCustomerCertificateExpired(getCustomerOnestopCertificateExpireDate(certificate), todayDateKey)) {
      hiddenExpiredCount += 1;
      continue;
    }

    if (isCustomerOnestopCertificateAlreadyRegistered(certificate, options.customers, options.customerCertificates)) {
      hiddenRegisteredCount += 1;
      continue;
    }

    availableCertificates.push(certificate);
  }

  return {
    availableCertificates,
    visibleCertificates: availableCertificates.filter((certificate) =>
      matchesCustomerOnestopCertificateSearch(certificate, options.searchQuery ?? "")
    ),
    hiddenExpiredCount,
    hiddenRegisteredCount
  };
}

export function validateCustomerCertificateOnestopDraft(draft: CustomerCertificateOnestopDraft): string[] {
  const missing: string[] = [];
  if (!draft.customerName.trim()) missing.push("대표자명");
  if (!digitsOnly(draft.businessNumber)) missing.push("사업자번호");
  if (!draft.corpName.trim()) missing.push("상호");
  if (!draft.addr.trim()) missing.push("주소");
  if (!draft.bizType.trim()) missing.push("업태");
  if (!draft.bizClass.trim()) missing.push("업종");
  return missing;
}

export function buildCustomerCertificateOnestopCreatePayload(
  draft: CustomerCertificateOnestopDraft
): CustomerCertificateOnestopCreatePayload {
  const addr = draft.addr.trim();
  return {
    customerName: draft.customerName.trim(),
    businessNumber: draft.businessNumber.trim(),
    corpName: draft.corpName.trim(),
    ceoName: draft.customerName.trim(),
    addr,
    bizType: draft.bizType.trim(),
    bizClass: draft.bizClass.trim(),
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: draft.renewalContactMobile.trim(),
    issueCompleteSmsTemplate: draft.issueCompleteSmsTemplate.trim(),
    memo: draft.memo.trim(),
    plantNames: [],
    matchAddresses: addr ? [addr] : []
  };
}

export function buildCustomerCertificateOnestopDraftFromCertificate(
  certificate: RenewalAgentCertificate,
  fallback?: Partial<CustomerCertificateOnestopDraft>
): CustomerCertificateOnestopDraft {
  const certificateName = certificate.cn.trim();
  return {
    customerName: fallback?.customerName?.trim() || certificateName,
    businessNumber: fallback?.businessNumber?.trim() || "",
    corpName: fallback?.corpName?.trim() || certificateName,
    addr: fallback?.addr?.trim() || "",
    bizType: fallback?.bizType?.trim() || "전기업",
    bizClass: fallback?.bizClass?.trim() || "태양광발전(자가용PPA)",
    renewalContactMobile: fallback?.renewalContactMobile?.trim() || "",
    issueCompleteSmsTemplate: fallback?.issueCompleteSmsTemplate?.trim() || "",
    memo: fallback?.memo?.trim() || ""
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function canUseCertificateForBridgeAutomation(certificate: RenewalAgentCertificate): boolean {
  const index = Number(certificate.index);
  return Number.isInteger(index) && index > 0 && certificate.supportsPreflight !== false;
}

export async function resolveExecutableCertificateForOnestopRegistration(
  certificate: RenewalAgentCertificate,
  loadAvailableCertificates: () => Promise<RenewalAgentCertificate[]>
): Promise<RenewalAgentCertificate> {
  if (canUseCertificateForBridgeAutomation(certificate)) {
    return certificate;
  }

  const matches = findRenewalCertificatesByIdentity(await loadAvailableCertificates(), {
    certificateIndex: certificate.index,
    certificateCn: certificate.cn,
    serial: certificate.serial,
    userDN: certificate.userDN
  }).filter(canUseCertificateForBridgeAutomation);

  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length > 1) {
    throw new Error("serial/userDN과 일치하는 로컬 공동인증서가 여러 개여서 자동 등록을 중단했습니다.");
  }

  throw new Error("업로드한 인증서를 로컬 공동인증서 목록에서 찾지 못해 자동 등록을 중단했습니다.");
}

export async function runCustomerCertificateOnestopRegistration(
  args: RunCustomerCertificateOnestopRegistrationArgs
): Promise<CustomerCertificateOnestopResult> {
  const missingFields = validateCustomerCertificateOnestopDraft(args.draft);
  if (missingFields.length > 0) {
    throw new Error(`필수 고객 정보를 입력하세요: ${missingFields.join(", ")}`);
  }
  if (!args.certificatePassword.trim()) {
    throw new Error("공동인증서 비밀번호를 입력하세요.");
  }
  if (deriveCustomerCertificateKind(args.certificate) !== "electronic_tax") {
    throw new Error("전자세금용 공동인증서만 고객 원스톱 등록에 사용할 수 있습니다.");
  }
  if (isCustomerCertificateExpired(getCustomerOnestopCertificateExpireDate(args.certificate))) {
    throw new Error("만료된 전자세금용 공동인증서는 고객 등록과 발행 연동 준비에 사용할 수 없습니다. 갱신 후 다시 불러와 주세요.");
  }

  const steps: CustomerCertificateOnestopStepResult[] = [];
  let customer = findExistingCustomerByBusinessNumber(args.customers, args.draft.businessNumber);
  const existingCustomerUsed = Boolean(customer);

  if (customer) {
    steps.push({
      key: "customer",
      label: "고객 확인",
      status: "skipped",
      message: `기존 고객 ${getCustomerCertificateOnestopDisplayName(customer)}을 사용했습니다.`
    });
  } else {
    const created = await args.createCustomer(buildCustomerCertificateOnestopCreatePayload(args.draft));
    customer = created.customer;
    steps.push({
      key: "customer",
      label: "고객 생성",
      status: "success",
      message:
        created.autoJoinStatus === "failed"
          ? `고객을 생성했습니다. ${CUSTOMER_POPBILL_JOIN_SUPPORT_MESSAGE}`
          : "고객을 생성했습니다."
    });
  }

  try {
    await args.linkCertificate(customer.id, args.certificate, { linkSource: "auto" });
    steps.push({
      key: "certificate-link",
      label: "인증서 연결",
      status: "success",
      message: "고객에 전자세금용 공동인증서 메타데이터를 연결했습니다."
    });
  } catch (error) {
    steps.push({
      key: "certificate-link",
      label: "인증서 연결",
      status: "failed",
      message: getErrorMessage(error, "인증서 연결에 실패했습니다.")
    });
  }

  let canRetryPopbillJoin = false;
  if (existingCustomerUsed && customer.popbillState !== "joined") {
    try {
      customer = await args.joinPopbill(customer.id);
      steps.push({
        key: "popbill-join",
        label: "등록 처리",
        status: "success",
        message: "기존 고객의 등록 처리를 완료했습니다."
      });
    } catch {
      canRetryPopbillJoin = true;
      steps.push({
        key: "popbill-join",
        label: "등록 처리",
        status: "failed",
        message: CUSTOMER_POPBILL_JOIN_SUPPORT_MESSAGE
      });
    }
  } else if (customer.popbillState === "joined") {
    steps.push({
      key: "popbill-join",
      label: "등록 처리",
      status: "success",
      message: existingCustomerUsed ? "기존 고객이 이미 등록 처리 완료 상태입니다." : "고객 생성 중 등록 처리가 완료되었습니다."
    });
  } else {
    canRetryPopbillJoin = true;
    steps.push({
      key: "popbill-join",
      label: "등록 처리",
      status: "failed",
      message: CUSTOMER_POPBILL_JOIN_SUPPORT_MESSAGE
    });
  }

  let canRetryCertificateRegistration = false;
  if (customer.popbillState !== "joined") {
    steps.push({
      key: "popbill-certificate",
      label: "인증서 등록",
      status: "skipped",
      message: "등록 처리가 완료된 뒤 인증서 등록을 다시 시도하세요."
    });
    return {
      customer,
      existingCustomerUsed,
      steps,
      canRetryPopbillJoin,
      canRetryCertificateRegistration: true
    };
  }

  try {
    const executableCertificate = await resolveExecutableCertificateForOnestopRegistration(
      args.certificate,
      args.loadAvailableCertificates
    );
    const registration = await args.registerCertificate(customer, executableCertificate, args.certificatePassword);
    steps.push({
      key: "popbill-certificate",
      label: "인증서 등록",
      status: "success",
      message:
        registration.outcome === "already-registered"
          ? "전자세금용 공동인증서가 이미 등록된 상태입니다."
          : "전자세금용 공동인증서 등록을 완료했습니다."
    });
  } catch (error) {
    canRetryCertificateRegistration = true;
    steps.push({
      key: "popbill-certificate",
      label: "인증서 등록",
      status: "failed",
      message: getErrorMessage(error, "전자세금용 공동인증서 등록에 실패했습니다.")
    });
  }

  try {
    customer = await args.refreshCertificateStatus(customer.id);
    steps.push({
      key: "cert-status",
      label: "인증서 상태 확인",
      status: "success",
      message: "인증서 상태와 만료일을 다시 확인했습니다."
    });
  } catch (error) {
    steps.push({
      key: "cert-status",
      label: "인증서 상태 확인",
      status: "failed",
      message: getErrorMessage(error, "인증서 상태 확인에 실패했습니다.")
    });
  }

  return {
    customer,
    existingCustomerUsed,
    steps,
    canRetryPopbillJoin,
    canRetryCertificateRegistration
  };
}
