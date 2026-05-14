import type {
  AppSettings,
  Customer,
  RenewalBridgeCertificateSummary,
  RenewalPreflightComparisonProfile,
  RenewalPreflightSubmissionProfile
} from "../domain.js";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function isTaxCertificate(certificate: RenewalBridgeCertificateSummary): boolean {
  return certificate.usageToName.includes("전자세금");
}

function matchesCustomerCertificateName(certificate: RenewalBridgeCertificateSummary, customer: Customer): boolean {
  const cn = normalizeText(certificate.cn);
  if (!cn) {
    return false;
  }

  const corpName = normalizeText(customer.corpName);
  const customerName = normalizeText(customer.customerName);
  return cn === corpName || cn === customerName;
}

export function buildRenewalComparisonProfile(customer: Customer): RenewalPreflightComparisonProfile {
  return {
    corpName: customer.corpName,
    businessNumber: customer.businessNumber,
    ceoName: customer.ceoName,
    addr: customer.addr,
    bizType: customer.bizType,
    bizClass: customer.bizClass
  };
}

export function buildRenewalSubmissionProfile(
  settings: Pick<AppSettings, "renewalIssuePassword">,
  customer: Pick<Customer, "renewalContactMobile">
): RenewalPreflightSubmissionProfile {
  return {
    contactName: "",
    contactDepartment: "",
    contactEmail: "",
    contactTel: "",
    contactFax: "",
    contactMobile: customer.renewalContactMobile,
    issuePassword: settings.renewalIssuePassword
  };
}

export function selectAutoRenewalCertificate(
  certificates: RenewalBridgeCertificateSummary[],
  customer: Customer
): RenewalBridgeCertificateSummary | null {
  const directMatches = certificates.filter((certificate) => matchesCustomerCertificateName(certificate, customer));
  const preferredMatches = directMatches.filter(isTaxCertificate);

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
