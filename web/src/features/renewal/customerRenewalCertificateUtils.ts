import type {
  Customer,
  CustomerCertificate,
  CustomerCertificateKind,
  RenewalBridgePreflightProbe
} from "../../types";
import type {
  RenewalAgentCertificate,
  RenewalAgentSnapshot,
  RenewalJob
} from "./useRenewalAssistantState";

export type CustomerRenewalStatusSummary = {
  statusText: string;
  statusTone: "success" | "warn" | "danger" | "default";
  paymentAmount: string | null;
  canOpenPayment: boolean;
};

const ELECTRONIC_TAX_CERTIFICATE_OIDS = new Set([
  "1.2.410.200004.5.2.1.6.257"
]);

const GENERAL_PERSONAL_CERTIFICATE_OIDS = new Set([
  "1.2.410.200004.5.1.1.5"
]);

const GENERAL_BUSINESS_CERTIFICATE_OIDS = new Set([
  "1.2.410.200004.5.2.1.2"
]);

export function isElectronicTaxCertificate(certificate: RenewalAgentCertificate): boolean {
  return deriveCustomerCertificateKind(certificate) === "electronic_tax";
}

export function isIssueCapableCustomerCertificateKind(kind: CustomerCertificateKind): boolean {
  return kind === "electronic_tax" || kind === "general_business";
}

export function isIssueCapableCustomerCertificate(certificate: RenewalAgentCertificate): boolean {
  return isIssueCapableCustomerCertificateKind(deriveCustomerCertificateKind(certificate));
}

export function deriveCustomerCertificateKind(
  certificate: Pick<RenewalAgentCertificate, "usageToName"> & { oid?: string | null }
): CustomerCertificateKind {
  const oid = certificate.oid?.trim() ?? "";
  if (ELECTRONIC_TAX_CERTIFICATE_OIDS.has(oid)) {
    return "electronic_tax";
  }
  if (GENERAL_BUSINESS_CERTIFICATE_OIDS.has(oid)) {
    return "general_business";
  }
  if (GENERAL_PERSONAL_CERTIFICATE_OIDS.has(oid)) {
    return "general_personal";
  }

  const usageName = certificate.usageToName.trim();
  if (usageName.includes("전자세금")) {
    return "electronic_tax";
  }
  if (usageName.includes("개인") && usageName.includes("범용")) {
    return "general_personal";
  }
  if ((usageName.includes("사업자") || usageName.includes("기업")) && usageName.includes("범용")) {
    return "general_business";
  }
  return "unknown";
}

export function normalizeCustomerCertificateExpireDateKey(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  const separatedMatch = text.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (separatedMatch) {
    const month = separatedMatch[2]?.padStart(2, "0") ?? "01";
    const day = separatedMatch[3]?.padStart(2, "0") ?? "01";
    return `${separatedMatch[1]}-${month}-${day}`;
  }

  const timestamp = new Date(text).getTime();
  if (!Number.isFinite(timestamp)) return null;

  const parsedDate = new Date(timestamp);
  const year = parsedDate.getFullYear();
  const month = `${parsedDate.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsedDate.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCustomerCertificateTodayDateKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCustomerCertificateExpired(
  value: string | null | undefined,
  todayDateKey = getCustomerCertificateTodayDateKey()
): boolean {
  const expireDateKey = normalizeCustomerCertificateExpireDateKey(value);
  return expireDateKey !== null && expireDateKey <= todayDateKey;
}

function normalizeCustomerCertificateFingerprint(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeRenewalCertificateKey(value: string | number | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export type RenewalCertificateIdentity = {
  certificateIndex?: string | number | null;
  certificateCn?: string | null;
  serial?: string | null;
  userDN?: string | null;
};

export function normalizeCustomerRenewalName(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeCustomerRenewalAddress(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function matchesStoredCustomerCertificate(
  storedCertificate: CustomerCertificate,
  certificate: RenewalAgentCertificate
): boolean {
  const certificateSerial = normalizeCustomerCertificateFingerprint(certificate.serial);
  const storedSerial = normalizeCustomerCertificateFingerprint(storedCertificate.serial);
  if (certificateSerial && storedSerial) {
    return certificateSerial === storedSerial;
  }

  const certificateUserDn = normalizeCustomerCertificateFingerprint(certificate.userDN);
  const storedUserDn = normalizeCustomerCertificateFingerprint(storedCertificate.userDN);
  if (certificateUserDn && storedUserDn) {
    return certificateUserDn === storedUserDn;
  }

  const usageName = normalizeCustomerRenewalName(storedCertificate.certificateUsageName);
  const localUsageName = normalizeCustomerRenewalName(certificate.usageToName);

  return (
    storedCertificate.certificateKind === deriveCustomerCertificateKind(certificate) &&
    normalizeCustomerRenewalName(storedCertificate.certificateName) ===
      normalizeCustomerRenewalName(certificate.cn) &&
    (usageName === "" || localUsageName === "" || usageName === localUsageName)
  );
}

export function matchesRenewalCertificate(
  certificate: RenewalAgentCertificate,
  target: {
    certificateIndex?: string | number | null;
    certificateCn?: string | null;
  }
): boolean {
  const certificateIndex = normalizeRenewalCertificateKey(certificate.index);
  const targetIndex = normalizeRenewalCertificateKey(target.certificateIndex);
  if (certificateIndex !== "" && targetIndex !== "") {
    return certificateIndex === targetIndex;
  }

  const certificateCn = normalizeRenewalCertificateKey(certificate.cn);
  const targetCn = normalizeRenewalCertificateKey(target.certificateCn);
  return certificateCn !== "" && targetCn !== "" && certificateCn === targetCn;
}

export function findRenewalCertificatesByIdentity(
  certificates: RenewalAgentCertificate[],
  target: RenewalCertificateIdentity
): RenewalAgentCertificate[] {
  const certificateIndex = normalizeRenewalCertificateKey(target.certificateIndex);
  const certificateCn = normalizeRenewalCertificateKey(target.certificateCn);
  const serial = normalizeRenewalCertificateKey(target.serial);
  const userDN = normalizeRenewalCertificateKey(target.userDN);

  if (serial !== "" || userDN !== "") {
    return certificates.filter((certificate) => {
      const certificateSerial = normalizeRenewalCertificateKey(certificate.serial);
      const certificateUserDN = normalizeRenewalCertificateKey(certificate.userDN);

      if (serial !== "" && certificateSerial !== serial) {
        return false;
      }
      if (userDN !== "" && certificateUserDN !== userDN) {
        return false;
      }

      return true;
    });
  }

  if (certificateIndex !== "" && certificateCn !== "") {
    return certificates.filter(
      (certificate) =>
        normalizeRenewalCertificateKey(certificate.index) === certificateIndex &&
        normalizeRenewalCertificateKey(certificate.cn) === certificateCn
    );
  }

  if (certificateIndex !== "") {
    return certificates.filter(
      (certificate) => normalizeRenewalCertificateKey(certificate.index) === certificateIndex
    );
  }

  if (certificateCn !== "") {
    return certificates.filter(
      (certificate) => normalizeRenewalCertificateKey(certificate.cn) === certificateCn
    );
  }

  return [];
}

function matchesCustomerRenewalCertificateName(
  certificate: RenewalAgentCertificate,
  customer: Customer
): boolean {
  const certificateName = normalizeCustomerRenewalName(certificate.cn);
  if (!certificateName) {
    return false;
  }

  return (
    certificateName === normalizeCustomerRenewalName(customer.corpName) ||
    certificateName === normalizeCustomerRenewalName(customer.customerName)
  );
}

export function selectCustomerRenewalCertificate(
  certificates: RenewalAgentCertificate[],
  customer: Customer
): RenewalAgentCertificate | null {
  const directMatches = certificates.filter((certificate) =>
    matchesCustomerRenewalCertificateName(certificate, customer)
  );
  const preferredMatches = directMatches.filter(isElectronicTaxCertificate);

  if (preferredMatches.length === 1) {
    return preferredMatches[0] ?? null;
  }
  if (preferredMatches.length > 1) {
    return null;
  }
  if (directMatches.length === 1) {
    return directMatches[0] ?? null;
  }

  return null;
}

export function findStoredCustomerCertificateForLocalCertificate(
  certificate: RenewalAgentCertificate,
  customerCertificates: CustomerCertificate[]
): CustomerCertificate | null {
  const matches = customerCertificates.filter((storedCertificate) =>
    matchesStoredCustomerCertificate(storedCertificate, certificate)
  );
  if (matches.length === 1) {
    return matches[0] ?? null;
  }
  const primaryMatch = matches.find((storedCertificate) => storedCertificate.isPrimary);
  return primaryMatch ?? matches[0] ?? null;
}

export function parseStoredCustomerCertificateKey(value: string): number | null {
  if (!value.startsWith("stored:")) {
    return null;
  }

  const parsed = Number(value.slice("stored:".length));
  return Number.isFinite(parsed) ? parsed : null;
}

export function findLocalCertificateForStoredCustomerCertificate(
  storedCertificate: CustomerCertificate,
  certificates: RenewalAgentCertificate[]
): RenewalAgentCertificate | null {
  const matches = certificates.filter((certificate) =>
    matchesStoredCustomerCertificate(storedCertificate, certificate)
  );
  if (matches.length === 1) {
    return matches[0] ?? null;
  }

  const primaryMatch = matches.find((certificate) => isElectronicTaxCertificate(certificate));
  return primaryMatch ?? matches[0] ?? null;
}

export function findCandidateCustomersForCertificate(
  certificate: RenewalAgentCertificate,
  customers: Customer[]
): Customer[] {
  const certificateName = normalizeCustomerRenewalName(certificate.cn);
  if (!certificateName) {
    return [];
  }

  const kind = deriveCustomerCertificateKind(certificate);
  if (!isIssueCapableCustomerCertificateKind(kind)) {
    return [];
  }

  return customers.filter((customer) => {
    const matchesCorpName = certificateName === normalizeCustomerRenewalName(customer.corpName);
    const matchesCustomerName =
      certificateName === normalizeCustomerRenewalName(customer.customerName);

    return matchesCorpName || matchesCustomerName;
  });
}

export function getLatestRenewalPreflightProbeForCertificate(
  certificate: RenewalAgentCertificate,
  jobs: RenewalJob[],
  agent?: RenewalAgentSnapshot | null
): RenewalBridgePreflightProbe | null {
  const latestJobProbe = jobs.find((job) => {
    if (job.type !== "renewal-preflight" || job.status !== "completed" || !job.result) {
      return false;
    }

    return matchesRenewalCertificate(certificate, job);
  })?.result?.bridge.preflightProbe;

  if (latestJobProbe) {
    return latestJobProbe;
  }

  const preflightProbe = agent?.bridge.preflightProbe;
  if (!preflightProbe || !matchesRenewalCertificate(certificate, preflightProbe)) {
    return null;
  }

  return preflightProbe;
}

export function isRenewalPaymentReady(
  preflightProbe: RenewalBridgePreflightProbe | null
): boolean {
  if (!preflightProbe?.ok) {
    return false;
  }

  return (
    preflightProbe.branch === "renew-payment" ||
    preflightProbe.renewInfoSubmitResultBranch === "renew-payment"
  );
}

export function formatCustomerRenewalStatus(
  preflightProbe: RenewalBridgePreflightProbe | null
): CustomerRenewalStatusSummary {
  if (!preflightProbe) {
    return {
      statusText: "갱신 전",
      statusTone: "default",
      paymentAmount: null,
      canOpenPayment: false
    };
  }

  const paymentAmount = preflightProbe.renewInfoPaymentPreviewTotalAmount ?? null;
  if (!preflightProbe.ok) {
    return {
      statusText: preflightProbe.error ?? preflightProbe.message ?? "갱신 준비 실패",
      statusTone: "danger",
      paymentAmount,
      canOpenPayment: false
    };
  }

  if (isRenewalPaymentReady(preflightProbe)) {
    return {
      statusText:
        preflightProbe.renewInfoSubmitResultBranch === "renew-payment"
          ? "갱신 신청 완료 · 결제 대기"
          : "이미 결제 단계",
      statusTone: "success",
      paymentAmount,
      canOpenPayment: true
    };
  }

  if (preflightProbe.renewInfoSubmitAttempted) {
    return {
      statusText:
        preflightProbe.renewInfoSubmitResultError ??
        preflightProbe.renewInfoSubmitResultSummary ??
        preflightProbe.renewInfoSubmitSummary ??
        preflightProbe.renewInfoAutoSubmitSummary ??
        "갱신 신청정보 제출 결과 확인 필요",
      statusTone: preflightProbe.renewInfoSubmitResultError ? "danger" : "warn",
      paymentAmount,
      canOpenPayment: false
    };
  }

  if (preflightProbe.branch === "renew-info") {
    return {
      statusText:
        preflightProbe.renewInfoSubmitSummary ??
        preflightProbe.renewInfoAutoSubmitSummary ??
        "신청정보 입력 단계",
      statusTone:
        preflightProbe.renewInfoSubmitReady === false ||
        preflightProbe.renewInfoAutoSubmitReady === false
          ? "warn"
          : "success",
      paymentAmount,
      canOpenPayment: false
    };
  }

  if (preflightProbe.branch === "change-company") {
    return {
      statusText:
        preflightProbe.externalFlowKind === "apply-form"
          ? `순정 갱신 아님 · ${preflightProbe.externalFlowProductName ?? "외부 신규신청"}`
          : `기관변경 필요 · ${preflightProbe.issueCompany ?? "-"}`,
      statusTone: "danger",
      paymentAmount,
      canOpenPayment: false
    };
  }

  if (preflightProbe.branch === "password-confirm") {
    return {
      statusText: "이미 발급 직전 단계",
      statusTone: "warn",
      paymentAmount,
      canOpenPayment: false
    };
  }

  return {
    statusText: preflightProbe.nextUrl ?? preflightProbe.branch,
    statusTone: "default",
    paymentAmount,
    canOpenPayment: false
  };
}
