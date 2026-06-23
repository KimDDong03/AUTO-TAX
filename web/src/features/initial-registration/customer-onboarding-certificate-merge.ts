import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";
import {
  isCustomerCertificateExpired,
  isIssueCapableCustomerCertificate,
  normalizeRenewalCertificateKey
} from "../renewal/customerRenewalCertificateUtils";
import type { CustomerOnboardingTemplateWorkbookInput } from "./customer-onboarding-workbook";

export function getOnboardingCertificateStableKey(certificate: RenewalAgentCertificate): string {
  const serial = certificate.serial?.trim();
  if (serial) {
    return `serial:${serial}`;
  }
  const userDN = certificate.userDN?.trim();
  if (userDN) {
    return `userdn:${normalizeRenewalCertificateKey(userDN)}`;
  }

  const uploadSessionId =
    "uploadSessionId" in certificate && typeof certificate.uploadSessionId === "string"
      ? certificate.uploadSessionId.trim()
      : "";
  const uploadRelativePath =
    "relativePath" in certificate && typeof certificate.relativePath === "string"
      ? certificate.relativePath.trim()
      : "";
  if (uploadSessionId || uploadRelativePath) {
    return `upload:${uploadSessionId}:${normalizeRenewalCertificateKey(uploadRelativePath)}:${normalizeRenewalCertificateKey(certificate.cn)}`;
  }

  return [
    "certificate",
    normalizeRenewalCertificateKey(certificate.cn),
    normalizeRenewalCertificateKey(certificate.issuerToName),
    normalizeRenewalCertificateKey(certificate.usageToName),
    normalizeRenewalCertificateKey(certificate.todate ?? certificate.detailValidateTo ?? ""),
    normalizeRenewalCertificateKey(certificate.oid)
  ].join(":");
}

function normalizeOnboardingCertificateFingerprint(
  value: string | number | null | undefined
): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function normalizeOnboardingSerialFingerprint(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/[^0-9a-f]/gi, "")
    .trim()
    .toLowerCase();
}

function buildOnboardingSerialFingerprints(value: string | number | null | undefined): Set<string> {
  const normalized = normalizeOnboardingSerialFingerprint(value);
  const fingerprints = new Set<string>();
  if (!normalized) {
    return fingerprints;
  }

  fingerprints.add(normalized.replace(/^0+/, "") || "0");
  if (/^[0-9]+$/.test(normalized)) {
    try {
      fingerprints.add(BigInt(normalized).toString(10));
    } catch {
      // Keep the raw fingerprint above.
    }
  }
  if (/^[0-9a-f]+$/i.test(normalized)) {
    try {
      const asHex = BigInt(`0x${normalized}`);
      fingerprints.add(asHex.toString(10));
      fingerprints.add(asHex.toString(16));
    } catch {
      // Keep the raw fingerprint above.
    }
  }
  return fingerprints;
}

function fingerprintSetsIntersect(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function extractOnboardingDnAttributeValue(userDn: string, attribute: string): string | null {
  const pattern = new RegExp(`(?:^|,)${attribute}=([^,]+)`, "i");
  const match = userDn.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function buildOnboardingCertificateIdentityFingerprints(certificate: {
  cn?: string | null;
  userDN?: string | null;
}): Set<string> {
  const fingerprints = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = normalizeOnboardingCertificateFingerprint(value);
    if (normalized) {
      fingerprints.add(normalized);
    }
  };

  add(certificate.cn);
  add(certificate.userDN);
  add(extractOnboardingDnAttributeValue(certificate.userDN ?? "", "CN"));
  add(extractOnboardingDnAttributeValue(certificate.userDN ?? "", "cn"));
  return fingerprints;
}

function normalizeOnboardingCertificateDateFingerprint(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (!match) {
    return normalizeOnboardingCertificateFingerprint(raw);
  }

  return [
    match[1],
    match[2]?.padStart(2, "0"),
    match[3]?.padStart(2, "0")
  ].join("");
}

function normalizeOnboardingIssuerFingerprint(value: string | null | undefined): string {
  const normalized = normalizeOnboardingCertificateFingerprint(value);
  return normalized === normalizeOnboardingCertificateFingerprint("알 수 없음") ? "" : normalized;
}

function isUploadSessionOnboardingCertificate(certificate: RenewalAgentCertificate): boolean {
  const listSource =
    "listSource" in certificate && typeof certificate.listSource === "string"
      ? certificate.listSource
      : "";
  const uploadSessionId =
    "uploadSessionId" in certificate && typeof certificate.uploadSessionId === "string"
      ? certificate.uploadSessionId.trim()
      : "";
  const uploadRelativePath =
    "relativePath" in certificate && typeof certificate.relativePath === "string"
      ? certificate.relativePath.trim()
      : "";

  return (
    listSource === "upload-session" ||
    Boolean(uploadSessionId && uploadRelativePath) ||
    certificate.supportsPreflight === false
  );
}

function getUploadRelativePath(certificate: RenewalAgentCertificate): string {
  return "relativePath" in certificate && typeof certificate.relativePath === "string"
    ? certificate.relativePath.trim()
    : "";
}

function isUploadedNpkiFolderCertificate(certificate: RenewalAgentCertificate): boolean {
  const relativePath = getUploadRelativePath(certificate);
  return /(^|\/)signCert\.der$/i.test(relativePath);
}

function isPreparedBridgeCertificate(certificate: RenewalAgentCertificate): boolean {
  const listSource =
    "listSource" in certificate && typeof certificate.listSource === "string"
      ? certificate.listSource
      : "";
  const certDirPath = certificate.certDirPath?.trim() ?? "";
  return certificate.supportsPreflight !== false && listSource === "bridge-hdd" && Boolean(certDirPath);
}

function onboardingCertificatesMatch(
  left: RenewalAgentCertificate,
  right: RenewalAgentCertificate
): boolean {
  if (getOnboardingCertificateStableKey(left) === getOnboardingCertificateStableKey(right)) {
    return true;
  }

  const leftSerials = buildOnboardingSerialFingerprints(left.serial);
  const rightSerials = buildOnboardingSerialFingerprints(right.serial);
  if (
    leftSerials.size > 0 &&
    rightSerials.size > 0 &&
    fingerprintSetsIntersect(leftSerials, rightSerials)
  ) {
    return true;
  }

  const leftIdentities = buildOnboardingCertificateIdentityFingerprints(left);
  const rightIdentities = buildOnboardingCertificateIdentityFingerprints(right);
  const identityMatches =
    leftIdentities.size > 0 &&
    rightIdentities.size > 0 &&
    fingerprintSetsIntersect(leftIdentities, rightIdentities);

  if (!identityMatches) {
    return false;
  }

  const leftIssuer = normalizeOnboardingIssuerFingerprint(left.issuerToName);
  const rightIssuer = normalizeOnboardingIssuerFingerprint(right.issuerToName);
  const leftExpire = normalizeOnboardingCertificateDateFingerprint(
    left.todate ?? left.detailValidateTo
  );
  const rightExpire = normalizeOnboardingCertificateDateFingerprint(
    right.todate ?? right.detailValidateTo
  );

  return Boolean(
    (!leftIssuer || !rightIssuer || leftIssuer === rightIssuer) &&
      (!leftExpire || !rightExpire || leftExpire === rightExpire)
  );
}

function selectPreferredOnboardingCertificate(
  current: RenewalAgentCertificate,
  incoming: RenewalAgentCertificate
): RenewalAgentCertificate {
  const currentIsUpload = isUploadSessionOnboardingCertificate(current);
  const incomingIsUpload = isUploadSessionOnboardingCertificate(incoming);
  if (currentIsUpload && !incomingIsUpload) {
    return incoming;
  }
  if (!currentIsUpload && incomingIsUpload) {
    if (isUploadedNpkiFolderCertificate(incoming) && !isPreparedBridgeCertificate(current)) {
      return incoming;
    }
    return current;
  }
  return incoming;
}

export function mergeOnboardingCertificates(
  current: RenewalAgentCertificate[] | null,
  incoming: RenewalAgentCertificate[]
): RenewalAgentCertificate[] {
  const merged: RenewalAgentCertificate[] = [];
  const appendCertificate = (certificate: RenewalAgentCertificate) => {
    const matchedIndex = merged.findIndex((existingCertificate) =>
      onboardingCertificatesMatch(existingCertificate, certificate)
    );
    if (matchedIndex === -1) {
      merged.push(certificate);
      return;
    }

    const existingCertificate = merged[matchedIndex];
    if (!existingCertificate) {
      merged[matchedIndex] = certificate;
      return;
    }
    merged[matchedIndex] = selectPreferredOnboardingCertificate(existingCertificate, certificate);
  };

  for (const certificate of current ?? []) {
    appendCertificate(certificate);
  }
  for (const certificate of incoming) {
    appendCertificate(certificate);
  }
  return merged;
}

export function getActiveIssueCapableOnboardingCertificates(
  certificates: RenewalAgentCertificate[]
) {
  return certificates.filter(
    (certificate) =>
      isIssueCapableCustomerCertificate(certificate) &&
      !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
  );
}

function getOnboardingTemplatePlantStableKey(
  plant: CustomerOnboardingTemplateWorkbookInput["plants"][number]
): string {
  return [
    normalizeRenewalCertificateKey(plant.certificateIndex),
    normalizeRenewalCertificateKey(plant.certificateName)
  ].join(":");
}

export function getOnboardingCertificateTemplatePlantKey(
  certificate: RenewalAgentCertificate
): string {
  return [
    normalizeRenewalCertificateKey(String(certificate.index ?? "")),
    normalizeRenewalCertificateKey(certificate.cn)
  ].join(":");
}

export function getOnboardingTemplatePlantKey(
  plant: CustomerOnboardingTemplateWorkbookInput["plants"][number]
): string {
  return getOnboardingTemplatePlantStableKey(plant);
}

export function mergeCustomerOnboardingTemplateWorkbookState(
  current: CustomerOnboardingTemplateWorkbookInput | null,
  next: CustomerOnboardingTemplateWorkbookInput,
  options: {
    preserveSelection?: boolean;
  } = {}
): CustomerOnboardingTemplateWorkbookInput {
  if (!current) {
    return next;
  }

  const preserveSelection = options.preserveSelection ?? true;
  const currentPlantsByKey = new Map(
    current.plants.map((plant) => [getOnboardingTemplatePlantStableKey(plant), plant])
  );

  return {
    ...next,
    plants: next.plants.map((plant) => {
      const currentPlant = currentPlantsByKey.get(getOnboardingTemplatePlantStableKey(plant));
      if (!currentPlant) {
        return plant;
      }
      return {
        ...plant,
        selected: preserveSelection ? currentPlant.selected : plant.selected,
        certificatePassword: currentPlant.certificatePassword
      };
    })
  };
}
