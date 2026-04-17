import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Frame, type Page } from "playwright";
import { collectBridgeCertificateList } from "./renewal-agent.ts";

export type PopbillCertificateRegistrationInput = {
  certificateRegistrationUrl: string;
  certificateIndex: number;
  certificateCn?: string | null;
  certificateKind: "electronic_tax";
  serial?: string | null;
  userDN?: string | null;
  certificatePassword: string;
};

export type PopbillCertificateRegistrationResult = {
  outcome: "registered" | "already-registered";
  browserChannel: string;
  certificateIndex: number;
  certificateCn: string;
  certificateKind: "electronic_tax";
  serial: string | null;
  userDN: string | null;
  localBridgeBaseUrl: string | null;
  message: string;
};

export type PopbillCertificateCandidateIdentifier = "serial" | "userDN" | "certificateIndex";

export type PopbillCertificateIframeCandidate = {
  selector: string;
  text: string;
  attributes: string[];
  hiddenValues: string[];
  matchedIdentifiers: PopbillCertificateCandidateIdentifier[];
};

export type PopbillCertificateSelectionDetailProbe = {
  selector: string;
  matchedIdentifiers: PopbillCertificateCandidateIdentifier[];
  evidence: string[];
};

type PopbillChooserReadinessCertificate = {
  index: string | number | null | undefined;
  cn?: string | null;
  usageToName?: string | null;
  userDN?: string | null;
};

export type PopbillChooserDebugDuplicateCnCandidate = {
  certificateCn: string;
  certificateIndices: string[];
  userDNs: string[];
};

export type PopbillChooserDebugReadinessBlocker =
  | "local-bridge-certificates-unavailable"
  | "duplicate-electronic-tax-cn-missing"
  | "valid-popbill-cert-url-not-yet-verified";

export type PopbillChooserDebugReadiness = {
  available: boolean;
  electronicTaxCertificateCount: number;
  duplicateElectronicTaxCnCount: number;
  ambiguousCnReady: boolean;
  duplicateElectronicTaxCnCandidates: PopbillChooserDebugDuplicateCnCandidate[];
  blockers: PopbillChooserDebugReadinessBlocker[];
  nextAction: string;
  message: string;
};

export const POPBILL_DEBUG_ARTIFACT_STAGES = [
  "no-visible-cn-match",
  "ambiguous-cn-match",
  "registration-confirmation-failed"
] as const;

export type PopbillDebugArtifactStage = (typeof POPBILL_DEBUG_ARTIFACT_STAGES)[number];

const BROWSER_CHANNEL_CANDIDATES = [
  process.env.AUTO_TAX_POPBILL_HELPER_BROWSER_CHANNEL?.trim() || "",
  "chrome",
  "msedge"
].filter(Boolean);

function resolveUserDataDir(): string {
  const configured = process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR?.trim();
  const resolved = configured
    ? path.resolve(configured)
    : path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AUTO-TAX", "popbill-helper", "chrome-profile");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

async function launchBrowserContext(userDataDir: string): Promise<{ context: BrowserContext; browserChannel: string }> {
  const errors: string[] = [];
  for (const browserChannel of BROWSER_CHANNEL_CANDIDATES) {
    try {
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: browserChannel,
        headless: false,
        viewport: { width: 1400, height: 1000 },
        ignoreHTTPSErrors: true
      });
      return { context, browserChannel };
    } catch (error) {
      errors.push(`${browserChannel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Chrome 또는 Edge를 실행하지 못했습니다.\n${errors.join("\n")}`);
}

async function waitForPageText(page: Page, text: string, timeoutMs: number) {
  await page.getByText(text, { exact: false }).waitFor({ timeout: timeoutMs });
}

async function tryGrantLocalNetworkAccessPermission(context: BrowserContext, registrationUrl: string) {
  const origin = new URL(registrationUrl).origin;
  try {
    await context.grantPermissions(["local-network-access"], { origin });
  } catch {
    // Some Chrome builds may ignore or reject this permission name.
    // In that case we still rely on the persistent profile keeping the manual grant.
  }
}

function detectAlreadyRegistered(pageText: string): boolean {
  return pageText.includes("재등록") && pageText.includes("사용") && pageText.includes("삭제");
}

function normalizeCertificateFingerprint(value: string | number | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePopbillEvidenceValue(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function isElectronicTaxUsageName(usageName: string): boolean {
  return usageName.replace(/\s+/g, "").includes("전자세금");
}

async function resolveTargetCertificate(input: PopbillCertificateRegistrationInput): Promise<{
  certificateIndex: number;
  certificateCn: string;
  certificateKind: "electronic_tax";
  serial: string | null;
  userDN: string | null;
}> {
  const { storageProbe } = await collectBridgeCertificateList({ preferCached: false });
  if (!storageProbe.ok) {
    throw new Error(storageProbe.error ?? "로컬 브리지에서 공동인증서 목록을 읽지 못했습니다.");
  }

  const targetIndex = normalizeCertificateFingerprint(input.certificateIndex);
  const resolvedCertificate =
    storageProbe.certificates.find(
      (certificate) => normalizeCertificateFingerprint(certificate.index) === targetIndex
    ) ?? null;
  if (!resolvedCertificate) {
    throw new Error(`로컬 브리지에서 index ${input.certificateIndex} 전자세금용 공동인증서를 찾지 못했습니다.`);
  }

  if (!isElectronicTaxUsageName(resolvedCertificate.usageToName)) {
    throw new Error("전자세금용이 아닌 공동인증서는 팝빌 자동 등록에 사용할 수 없습니다.");
  }

  const targetCn = normalizeCertificateFingerprint(input.certificateCn);
  if (targetCn !== "" && normalizeCertificateFingerprint(resolvedCertificate.cn) !== targetCn) {
    throw new Error("선택한 공동인증서 CN이 현재 로컬 인증서와 달라 자동 등록을 중단했습니다.");
  }

  const targetSerial = normalizeCertificateFingerprint(input.serial);
  if (targetSerial !== "" && normalizeCertificateFingerprint(resolvedCertificate.serial) !== targetSerial) {
    throw new Error("선택한 공동인증서 serial이 현재 로컬 인증서와 달라 자동 등록을 중단했습니다.");
  }

  const targetUserDN = normalizeCertificateFingerprint(input.userDN);
  if (targetUserDN !== "" && normalizeCertificateFingerprint(resolvedCertificate.userDN) !== targetUserDN) {
    throw new Error("선택한 공동인증서 userDN이 현재 로컬 인증서와 달라 자동 등록을 중단했습니다.");
  }

  const certificateCn = resolvedCertificate.cn.trim();
  if (!certificateCn) {
    throw new Error("팝빌 자동 등록 대상 인증서의 CN을 확인하지 못했습니다.");
  }

  const resolvedCertificateIndex = Number(resolvedCertificate.index);
  if (!Number.isFinite(resolvedCertificateIndex) || resolvedCertificateIndex <= 0) {
    throw new Error("팝빌 자동 등록 대상 인증서의 로컬 index를 확인하지 못했습니다.");
  }

  const duplicateCnCertificates = storageProbe.certificates.filter(
    (certificate) =>
      isElectronicTaxUsageName(certificate.usageToName) &&
      normalizeCertificateFingerprint(certificate.cn) === normalizeCertificateFingerprint(certificateCn)
  );
  if (duplicateCnCertificates.length > 1 && targetSerial === "" && targetUserDN === "") {
    throw new Error(
      `같은 CN의 전자세금용 공동인증서가 ${duplicateCnCertificates.length}건이고 serial/userDN 식별값이 없어 자동 등록을 중단했습니다.`
    );
  }

  return {
    certificateIndex: resolvedCertificateIndex,
    certificateCn,
    certificateKind: "electronic_tax",
    serial: resolvedCertificate.serial?.trim() || null,
    userDN: resolvedCertificate.userDN?.trim() || null
  };
}

function extractRegistrationError(frameText: string): string | null {
  if (frameText.includes("비밀번호를 다시 입력하세요")) {
    return "공동인증서 비밀번호가 올바르지 않습니다.";
  }

  if (frameText.includes("인증서를 선택")) {
    return "팝빌 인증서 등록 완료를 확인하지 못했습니다.";
  }

  return null;
}

const POPBILL_CERTIFICATE_INDEX_KEYWORDS = [
  "certificateindex",
  "certindex",
  "certificateid",
  "certid",
  "certno",
  "localcertificateindex",
  "localcertificateid",
  "로컬인증서번호",
  "인증서번호",
  "인증서인덱스",
  "cert-index",
  "cert-id",
  "index",
  "idx"
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPopbillFingerprintEvidence(evidenceValues: string[], targetValue: string | number | null | undefined): boolean {
  const normalizedTargetValue = normalizePopbillEvidenceValue(targetValue);
  if (normalizedTargetValue === "") {
    return false;
  }

  return evidenceValues.some((value) => normalizePopbillEvidenceValue(value).includes(normalizedTargetValue));
}

function hasExplicitPopbillCertificateIndexEvidence(
  evidenceValues: string[],
  targetIndex: string | number | null | undefined
): boolean {
  const normalizedTargetIndex = normalizePopbillEvidenceValue(targetIndex);
  if (normalizedTargetIndex === "") {
    return false;
  }

  const targetBoundaryPattern = new RegExp(`(?:^|[^0-9])${escapeRegExp(normalizedTargetIndex)}(?:[^0-9]|$)`);

  return evidenceValues.some((value) => {
    const normalizedValue = normalizePopbillEvidenceValue(value);
    if (!normalizedValue) {
      return false;
    }

    if (normalizedValue === normalizedTargetIndex) {
      return true;
    }

    if (!POPBILL_CERTIFICATE_INDEX_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))) {
      return false;
    }

    return (
      normalizedValue.includes(`=${normalizedTargetIndex}`) ||
      normalizedValue.includes(`:${normalizedTargetIndex}`) ||
      normalizedValue.includes(`#${normalizedTargetIndex}`) ||
      normalizedValue.includes(`(${normalizedTargetIndex})`) ||
      normalizedValue.includes(`[${normalizedTargetIndex}]`) ||
      targetBoundaryPattern.test(normalizedValue)
    );
  });
}

function trimDebugValue(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function matchPopbillCandidateIdentifiers(options: {
  evidenceValues: string[];
  targetIndex?: string | number | null;
  targetSerial?: string | null;
  targetUserDN?: string | null;
}): PopbillCertificateCandidateIdentifier[] {
  const matchedIdentifiers: PopbillCertificateCandidateIdentifier[] = [];

  if (hasPopbillFingerprintEvidence(options.evidenceValues, options.targetSerial)) {
    matchedIdentifiers.push("serial");
  }

  if (hasPopbillFingerprintEvidence(options.evidenceValues, options.targetUserDN)) {
    matchedIdentifiers.push("userDN");
  }

  if (hasExplicitPopbillCertificateIndexEvidence(options.evidenceValues, options.targetIndex)) {
    matchedIdentifiers.push("certificateIndex");
  }

  return matchedIdentifiers;
}

function resolvePopbillIdentifierSelection(options: {
  identifier: PopbillCertificateCandidateIdentifier;
  candidates: PopbillCertificateIframeCandidate[];
  selectionDetailProbes: PopbillCertificateSelectionDetailProbe[];
}): { selector: string | null; reason: string | null; conflict: boolean } {
  const identifierLabel =
    options.identifier === "userDN"
      ? "userDN"
      : options.identifier === "certificateIndex"
        ? "certificate index"
        : options.identifier;
  const metadataMatches = options.candidates.filter((candidate) => candidate.matchedIdentifiers.includes(options.identifier));
  const selectionMatches = options.selectionDetailProbes.filter((probe) =>
    probe.matchedIdentifiers.includes(options.identifier)
  );
  const metadataSelector = metadataMatches.length === 1 ? (metadataMatches[0]?.selector ?? null) : null;
  const selectionSelector = selectionMatches.length === 1 ? (selectionMatches[0]?.selector ?? null) : null;

  if (metadataSelector && selectionSelector && metadataSelector !== selectionSelector) {
    return {
      selector: null,
      reason: null,
      conflict: true
    };
  }

  if (selectionSelector && metadataSelector) {
    return {
      selector: selectionSelector,
      reason: `iframe DOM metadata + selection detail matched ${identifierLabel}`,
      conflict: false
    };
  }

  if (selectionSelector) {
    return {
      selector: selectionSelector,
      reason: `iframe selection detail matched ${identifierLabel}`,
      conflict: false
    };
  }

  if (metadataSelector) {
    return {
      selector: metadataSelector,
      reason: `iframe DOM metadata matched ${identifierLabel}`,
      conflict: false
    };
  }

  return {
    selector: null,
    reason: null,
    conflict: false
  };
}

export function pickPopbillCertificateCandidate(options: {
  candidates: PopbillCertificateIframeCandidate[];
  selectionDetailProbes?: PopbillCertificateSelectionDetailProbe[];
  targetIndex?: string | number | null;
  targetSerial?: string | null;
  targetUserDN?: string | null;
}): { selector: string | null; reason: string | null } {
  const selectionDetailProbes = options.selectionDetailProbes ?? [];
  const identifierSelections: Array<{
    identifier: PopbillCertificateCandidateIdentifier;
    selector: string;
    reason: string;
  }> = [];

  const identifierTargets: Array<{
    identifier: PopbillCertificateCandidateIdentifier;
    enabled: boolean;
  }> = [
    {
      identifier: "serial",
      enabled: normalizeCertificateFingerprint(options.targetSerial) !== ""
    },
    {
      identifier: "userDN",
      enabled: normalizeCertificateFingerprint(options.targetUserDN) !== ""
    },
    {
      identifier: "certificateIndex",
      enabled: normalizeCertificateFingerprint(options.targetIndex) !== ""
    }
  ];

  for (const identifierTarget of identifierTargets) {
    if (!identifierTarget.enabled) {
      continue;
    }

    const selection = resolvePopbillIdentifierSelection({
      identifier: identifierTarget.identifier,
      candidates: options.candidates,
      selectionDetailProbes
    });
    if (selection.conflict) {
      return {
        selector: null,
        reason: null
      };
    }

    if (selection.selector && selection.reason) {
      identifierSelections.push({
        identifier: identifierTarget.identifier,
        selector: selection.selector,
        reason: selection.reason
      });
    }
  }

  const identifierSelectors = new Set(identifierSelections.map((selection) => selection.selector));
  if (identifierSelectors.size > 1) {
    return {
      selector: null,
      reason: null
    };
  }

  if (identifierSelections.length > 0) {
    return {
      selector: identifierSelections[0]?.selector ?? null,
      reason: identifierSelections[0]?.reason ?? null
    };
  }

  const metadataMatches = options.candidates.filter((candidate) => candidate.matchedIdentifiers.length > 0);
  const selectionMetadataMatches = selectionDetailProbes.filter((probe) => probe.matchedIdentifiers.length > 0);
  const metadataSelector = metadataMatches.length === 1 ? (metadataMatches[0]?.selector ?? null) : null;
  const selectionMetadataSelector =
    selectionMetadataMatches.length === 1 ? (selectionMetadataMatches[0]?.selector ?? null) : null;

  if (metadataSelector && selectionMetadataSelector && metadataSelector !== selectionMetadataSelector) {
    return {
      selector: null,
      reason: null
    };
  }

  if (metadataSelector && selectionMetadataSelector) {
    return {
      selector: metadataSelector,
      reason: `iframe DOM metadata + selection detail matched ${metadataMatches[0]?.matchedIdentifiers.join("/") ?? "identifier"}`
    };
  }

  if (selectionMetadataSelector) {
    return {
      selector: selectionMetadataSelector,
      reason: `iframe selection detail matched ${selectionMetadataMatches[0]?.matchedIdentifiers.join("/") ?? "identifier"}`
    };
  }

  if (metadataSelector) {
    return {
      selector: metadataSelector,
      reason: `iframe DOM metadata matched ${metadataMatches[0]?.matchedIdentifiers.join("/") ?? "identifier"}`
    };
  }

  if (options.candidates.length === 1) {
    return {
      selector: options.candidates[0]?.selector ?? null,
      reason: "single visible CN match"
    };
  }

  return {
    selector: null,
    reason: null
  };
}

function describePopbillCandidateEvidence(candidates: PopbillCertificateIframeCandidate[]): string {
  if (candidates.length === 0) {
    return "후보 DOM 증거를 수집하지 못했습니다.";
  }

  return candidates
    .slice(0, 3)
    .map((candidate, index) => {
      const matchedSummary =
        candidate.matchedIdentifiers.length > 0
          ? `식별자=${candidate.matchedIdentifiers.join("/")}`
          : "식별자=없음";
      const attributeSummary =
        candidate.attributes.length > 0
          ? `속성=${candidate.attributes.map((value) => trimDebugValue(value, 80)).join(" | ")}`
          : "속성=없음";
      const hiddenValueSummary =
        candidate.hiddenValues.length > 0
          ? `입력값=${candidate.hiddenValues.map((value) => trimDebugValue(value, 80)).join(" | ")}`
          : "입력값=없음";

      return `${index + 1}) ${matchedSummary}; 텍스트=${trimDebugValue(candidate.text, 120)}; ${attributeSummary}; ${hiddenValueSummary}`;
    })
    .join(" / ");
}

function describePopbillSelectionDetailEvidence(probes: PopbillCertificateSelectionDetailProbe[]): string {
  if (probes.length === 0) {
    return "선택 후 상세 DOM 증거를 수집하지 못했습니다.";
  }

  return probes
    .slice(0, 3)
    .map((probe, index) => {
      const matchedSummary =
        probe.matchedIdentifiers.length > 0 ? `식별자=${probe.matchedIdentifiers.join("/")}` : "식별자=없음";
      const evidenceSummary =
        probe.evidence.length > 0 ? `증거=${probe.evidence.map((value) => trimDebugValue(value, 80)).join(" | ")}` : "증거=없음";
      return `${index + 1}) selector=${probe.selector}; ${matchedSummary}; ${evidenceSummary}`;
    })
    .join(" / ");
}

function resolvePopbillDebugArtifactDirPath(): string {
  const configuredDir = process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR?.trim();
  return configuredDir ? path.resolve(configuredDir) : path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AUTO-TAX", "popbill-cert-debug");
}

function ensurePopbillDebugArtifactDir(): string {
  const targetDir = resolvePopbillDebugArtifactDirPath();
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

export function getPopbillDebugArtifactSupport(): {
  supported: true;
  artifactDir: string;
  stages: PopbillDebugArtifactStage[];
} {
  return {
    supported: true,
    artifactDir: resolvePopbillDebugArtifactDirPath(),
    stages: [...POPBILL_DEBUG_ARTIFACT_STAGES]
  };
}

export function summarizePopbillChooserDebugReadiness(
  certificates: PopbillChooserReadinessCertificate[]
): Omit<PopbillChooserDebugReadiness, "available"> {
  const electronicTaxCertificates = certificates.filter((certificate) =>
    isElectronicTaxUsageName(certificate.usageToName ?? "")
  );
  const duplicateGroups = new Map<
    string,
    {
      certificateCn: string;
      certificateIndices: string[];
      userDNs: string[];
    }
  >();

  for (const certificate of electronicTaxCertificates) {
    const certificateCn = String(certificate.cn ?? "").trim();
    const normalizedCn = normalizeCertificateFingerprint(certificateCn);
    if (!normalizedCn) {
      continue;
    }

    const duplicateGroup = duplicateGroups.get(normalizedCn) ?? {
      certificateCn,
      certificateIndices: [],
      userDNs: []
    };
    const certificateIndex = String(certificate.index ?? "").trim();
    const userDN = String(certificate.userDN ?? "").trim();
    if (certificateIndex && !duplicateGroup.certificateIndices.includes(certificateIndex)) {
      duplicateGroup.certificateIndices.push(certificateIndex);
    }
    if (userDN && !duplicateGroup.userDNs.includes(userDN)) {
      duplicateGroup.userDNs.push(userDN);
    }
    duplicateGroups.set(normalizedCn, duplicateGroup);
  }

  const duplicateElectronicTaxCnCandidates = Array.from(duplicateGroups.values())
    .filter((candidate) => candidate.certificateIndices.length > 1)
    .sort((left, right) => left.certificateCn.localeCompare(right.certificateCn, "ko"));
  const duplicateElectronicTaxCnCount = duplicateElectronicTaxCnCandidates.length;
  const ambiguousCnReady = duplicateElectronicTaxCnCount > 0;

  return {
    electronicTaxCertificateCount: electronicTaxCertificates.length,
    duplicateElectronicTaxCnCount,
    ambiguousCnReady,
    duplicateElectronicTaxCnCandidates,
    blockers: ambiguousCnReady
      ? ["valid-popbill-cert-url-not-yet-verified"]
      : ["duplicate-electronic-tax-cn-missing", "valid-popbill-cert-url-not-yet-verified"],
    nextAction: ambiguousCnReady
      ? "이제 실제 Popbill cert-url 발급이 되는 workspace/customer에서 live Child.html artifact를 확보하세요."
      : "같은 CN의 전자세금용 공동인증서가 있는 PC/브리지에서 상태를 다시 확인한 뒤, 실제 Popbill cert-url 발급 가능 상태를 검증하세요.",
    message:
      duplicateElectronicTaxCnCount > 0
        ? `같은 CN의 전자세금용 공동인증서가 ${duplicateElectronicTaxCnCount}개 그룹 있어 ambiguous-cn-match live 재현이 가능합니다.`
        : "현재 로컬 브리지 전자세금용 공동인증서에는 같은 CN 중복이 없어 ambiguous-cn-match live 재현이 불가능합니다."
  };
}

export async function getPopbillChooserDebugReadiness(): Promise<PopbillChooserDebugReadiness> {
  try {
    const { storageProbe } = await collectBridgeCertificateList({ preferCached: false });
    if (!storageProbe.ok) {
      return {
        available: false,
        electronicTaxCertificateCount: 0,
        duplicateElectronicTaxCnCount: 0,
        ambiguousCnReady: false,
        duplicateElectronicTaxCnCandidates: [],
        blockers: ["local-bridge-certificates-unavailable", "valid-popbill-cert-url-not-yet-verified"],
        nextAction: "먼저 로컬 브리지/공동인증서 목록 조회를 복구한 뒤, duplicate electronic_tax CN과 실제 Popbill cert-url 발급 상태를 다시 확인하세요.",
        message: storageProbe.error ?? "로컬 브리지에서 공동인증서 목록을 읽지 못했습니다."
      };
    }

    return {
      available: true,
      ...summarizePopbillChooserDebugReadiness(storageProbe.certificates)
    };
  } catch (error) {
    return {
      available: false,
      electronicTaxCertificateCount: 0,
      duplicateElectronicTaxCnCount: 0,
      ambiguousCnReady: false,
      duplicateElectronicTaxCnCandidates: [],
      blockers: ["local-bridge-certificates-unavailable", "valid-popbill-cert-url-not-yet-verified"],
      nextAction: "먼저 로컬 브리지/공동인증서 목록 조회를 복구한 뒤, duplicate electronic_tax CN과 실제 Popbill cert-url 발급 상태를 다시 확인하세요.",
      message: error instanceof Error ? error.message : "로컬 브리지에서 공동인증서 목록을 읽지 못했습니다."
    };
  }
}

function sanitizeDebugArtifactName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function formatPopbillDebugArtifactSummary(artifact: { jsonPath: string; htmlPath: string | null }): string {
  const paths = [artifact.jsonPath, artifact.htmlPath].filter((value): value is string => Boolean(value));
  return paths.length > 0 ? `디버그 아티팩트: ${paths.join(", ")}` : "디버그 아티팩트를 저장하지 못했습니다.";
}

async function writePopbillDebugArtifact(options: {
  stage: PopbillDebugArtifactStage;
  page: Page;
  frame: Frame;
  resolvedCertificate: {
    certificateIndex: number;
    certificateCn: string;
    certificateKind: "electronic_tax";
    serial: string | null;
    userDN: string | null;
  };
  visibleMatchCount?: number;
  selectionReason?: string | null;
  candidates?: PopbillCertificateIframeCandidate[];
  selectionDetailProbes?: PopbillCertificateSelectionDetailProbe[];
  errorMessage?: string | null;
}): Promise<{ jsonPath: string; htmlPath: string | null }> {
  const artifactDir = ensurePopbillDebugArtifactDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = sanitizeDebugArtifactName(
    `${timestamp}-${options.stage}-${options.resolvedCertificate.certificateIndex}-${options.resolvedCertificate.certificateCn}`
  );
  const jsonPath = path.join(artifactDir, `${slug}.json`);
  const htmlPath = path.join(artifactDir, `${slug}.frame.html`);
  const frameHtml = await options.frame.content().catch(() => null);

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        stage: options.stage,
        pageUrl: options.page.url(),
        frameUrl: options.frame.url(),
        resolvedCertificate: options.resolvedCertificate,
        visibleMatchCount: options.visibleMatchCount ?? null,
        selectionReason: options.selectionReason ?? null,
        errorMessage: options.errorMessage ?? null,
        candidates: options.candidates ?? [],
        selectionDetailProbes: options.selectionDetailProbes ?? []
      },
      null,
      2
    ),
    "utf8"
  );

  if (typeof frameHtml === "string" && frameHtml.trim() !== "") {
    fs.writeFileSync(htmlPath, frameHtml, "utf8");
    return { jsonPath, htmlPath };
  }

  return { jsonPath, htmlPath: null };
}

async function inspectPopbillCertificateSelectionFrame(
  frame: Frame,
  target: {
    certificateCn: string;
    certificateIndex: number;
    serial: string | null;
    userDN: string | null;
  }
): Promise<{
  visibleMatchCount: number;
  selectedSelector: string | null;
  selectionReason: string | null;
  candidates: PopbillCertificateIframeCandidate[];
}> {
  const candidates = await frame.locator("body").evaluate(
    (body, rawTarget) => {
      const targetValue = {
        certificateCn: String(rawTarget.certificateCn ?? ""),
        certificateIndex: String(rawTarget.certificateIndex ?? ""),
        serial: String(rawTarget.serial ?? ""),
        userDN: String(rawTarget.userDN ?? "")
      };
      const normalizedTargetCn = String(targetValue.certificateCn ?? "")
        .replace(/\s+/g, "")
        .trim()
        .toLowerCase();
      const candidatesBySelector = new Map<string, PopbillCertificateIframeCandidate>();

      for (const matchedLeafElement of Array.from(body.querySelectorAll("*"))) {
        if (!(matchedLeafElement instanceof HTMLElement)) {
          continue;
        }

        const matchedLeafStyle = window.getComputedStyle(matchedLeafElement);
        if (
          matchedLeafStyle.display === "none" ||
          matchedLeafStyle.visibility === "hidden" ||
          matchedLeafElement.getClientRects().length === 0
        ) {
          continue;
        }

        const matchedLeafText = String(matchedLeafElement.innerText || matchedLeafElement.textContent || "")
          .replace(/\s+/g, "")
          .trim()
          .toLowerCase();
        if (!normalizedTargetCn || !matchedLeafText.includes(normalizedTargetCn)) {
          continue;
        }

        let hasVisibleChildMatch = false;
        for (const child of Array.from(matchedLeafElement.children)) {
          if (!(child instanceof HTMLElement)) {
            continue;
          }

          const childStyle = window.getComputedStyle(child);
          if (childStyle.display === "none" || childStyle.visibility === "hidden" || child.getClientRects().length === 0) {
            continue;
          }

          const childText = String(child.innerText || child.textContent || "")
            .replace(/\s+/g, "")
            .trim()
            .toLowerCase();
          if (childText.includes(normalizedTargetCn)) {
            hasVisibleChildMatch = true;
            break;
          }
        }

        if (hasVisibleChildMatch) {
          continue;
        }

        let container: HTMLElement = matchedLeafElement;
        let current: HTMLElement | null = matchedLeafElement;
        let depth = 0;
        while (current && current !== body && depth < 6) {
          const hasInterestingInputs = current.querySelector("input, option[selected], select, textarea") !== null;
          let hasInterestingAttributes = false;
          for (const attribute of Array.from(current.attributes)) {
            const trimmedValue = attribute.value.trim();
            if (
              trimmedValue !== "" &&
              (attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "class" ||
                attribute.name === "role" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-"))
            ) {
              hasInterestingAttributes = true;
              break;
            }
          }

          if (hasInterestingInputs || hasInterestingAttributes || current.matches("tr, li, label, button, a, td, div")) {
            container = current;
          }

          if (
            current.matches("tr, li, label, button, a") ||
            current.getAttribute("onclick") ||
            current.getAttribute("role") === "button"
          ) {
            container = current;
            break;
          }

          current = current.parentElement;
          depth += 1;
        }

        let selector = "";
        if (container.id) {
          selector = `#${CSS.escape(container.id)}`;
        } else {
          const segments: string[] = [];
          let selectorCurrent: HTMLElement | null = container;
          while (selectorCurrent && selectorCurrent !== body) {
            let segment = selectorCurrent.tagName.toLowerCase();
            let sibling = selectorCurrent.previousElementSibling;
            let position = 1;
            while (sibling) {
              if (sibling.tagName === selectorCurrent.tagName) {
                position += 1;
              }
              sibling = sibling.previousElementSibling;
            }
            segment += `:nth-of-type(${position})`;
            segments.unshift(segment);
            selectorCurrent = selectorCurrent.parentElement;
          }
          selector = segments.length > 0 ? `body > ${segments.join(" > ")}` : "body";
        }

        if (!selector || candidatesBySelector.has(selector)) {
          continue;
        }

        const attributes: string[] = [];
        const hiddenValues: string[] = [];
        const seenAttributes = new Set<string>();
        const seenHiddenValues = new Set<string>();
        const chainCandidates = [
          matchedLeafElement,
          container,
          container.parentElement,
          container.parentElement?.parentElement
        ];
        for (let level = 0; level < chainCandidates.length; level += 1) {
          const chainCandidate = chainCandidates[level];
          if (!(chainCandidate instanceof HTMLElement)) {
            continue;
          }

          for (const attribute of Array.from(chainCandidate.attributes)) {
            const trimmedValue = String(attribute.value ?? "").trim();
            if (
              !trimmedValue ||
              !(
                attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "role" ||
                attribute.name === "class" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-")
              )
            ) {
              continue;
            }

            const descriptor = `chain${level}:${attribute.name}=${trimmedValue}`;
            if (!seenAttributes.has(descriptor)) {
              seenAttributes.add(descriptor);
              attributes.push(descriptor);
            }
          }
        }

        for (const descendant of Array.from(container.querySelectorAll("*")).slice(0, 20)) {
          if (!(descendant instanceof HTMLElement)) {
            continue;
          }

          let descendantHasInterestingAttributes = false;
          for (const attribute of Array.from(descendant.attributes)) {
            const trimmedValue = attribute.value.trim();
            if (
              trimmedValue !== "" &&
              (attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "class" ||
                attribute.name === "role" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-"))
            ) {
              descendantHasInterestingAttributes = true;
              break;
            }
          }

          if (!descendantHasInterestingAttributes) {
            continue;
          }

          for (const attribute of Array.from(descendant.attributes)) {
            const trimmedValue = String(attribute.value ?? "").trim();
            if (
              !trimmedValue ||
              !(
                attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "role" ||
                attribute.name === "class" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-")
              )
            ) {
              continue;
            }

            const descriptor = `desc:${attribute.name}=${trimmedValue}`;
            if (!seenAttributes.has(descriptor)) {
              seenAttributes.add(descriptor);
              attributes.push(descriptor);
            }
          }
        }

        for (const field of Array.from(container.querySelectorAll("input, option[selected], select, textarea")).slice(0, 12)) {
          if (!(field instanceof HTMLElement)) {
            continue;
          }

          const parts = [
            String(field.getAttribute("name") ?? "").trim(),
            String(field.getAttribute("id") ?? "").trim(),
            String(field.getAttribute("value") ?? "").trim(),
            String(field.textContent ?? "").trim()
          ].filter(Boolean);
          const descriptor = parts.join("=");
          if (!descriptor) {
            continue;
          }

          const hiddenDescriptor = `field:${descriptor}`;
          if (!seenHiddenValues.has(hiddenDescriptor)) {
            seenHiddenValues.add(hiddenDescriptor);
            hiddenValues.push(hiddenDescriptor);
          }
        }

        const text = (container.innerText || container.textContent || "").replace(/\s+/g, " ").trim();
        candidatesBySelector.set(selector, {
          selector,
          text,
          attributes,
          hiddenValues,
          matchedIdentifiers: []
        });
      }

      return Array.from(candidatesBySelector.values());
    },
    target
  );
  const candidatesWithIdentifiers = candidates.map((candidate) => ({
    ...candidate,
    matchedIdentifiers: matchPopbillCandidateIdentifiers({
      evidenceValues: [candidate.text, ...candidate.attributes, ...candidate.hiddenValues],
      targetIndex: target.certificateIndex,
      targetSerial: target.serial,
      targetUserDN: target.userDN
    })
  }));
  const selected = pickPopbillCertificateCandidate({
    candidates: candidatesWithIdentifiers,
    targetIndex: target.certificateIndex,
    targetSerial: target.serial,
    targetUserDN: target.userDN
  });

  return {
    visibleMatchCount: candidatesWithIdentifiers.length,
    selectedSelector: selected.selector,
    selectionReason: selected.reason,
    candidates: candidatesWithIdentifiers
  };
}

async function inspectPopbillCertificateSelectionDetails(
  frame: Frame,
  candidates: PopbillCertificateIframeCandidate[],
  target: {
    certificateIndex: number;
    serial: string | null;
    userDN: string | null;
  }
): Promise<PopbillCertificateSelectionDetailProbe[]> {
  const probes: PopbillCertificateSelectionDetailProbe[] = [];
  for (const candidate of candidates.slice(0, 6)) {
    if (!candidate.selector) {
      continue;
    }

    await frame.locator(candidate.selector).click({ force: true });
    await frame.waitForTimeout(150);
    const probe = await frame.locator("body").evaluate(
      (body) => {
        const evidence: string[] = [];
        const seenEvidence = new Set<string>();

        const selectors = [
          "[aria-selected='true']",
          "[aria-current]",
          "[selected]",
          "[checked]",
          ".selected",
          ".active",
          ".current",
          ".focus",
          ".on",
          "[class*='selected']",
          "[class*='active']",
          "[class*='current']",
          "[class*='focus']",
          "[id*='detail']",
          "[id*='info']",
          "[id*='preview']",
          "[name*='detail']",
          "[name*='info']",
          "[name*='preview']"
        ];
        for (const selector of selectors) {
          for (const element of Array.from(body.querySelectorAll(selector)).slice(0, 4)) {
            if (!(element instanceof HTMLElement)) {
              continue;
            }

            const textDescriptor = `${selector}:text:${String(element.innerText || element.textContent || "")
              .replace(/\s+/g, " ")
              .trim()}`;
            if (!seenEvidence.has(textDescriptor) && !textDescriptor.endsWith(":")) {
              seenEvidence.add(textDescriptor);
              evidence.push(textDescriptor);
            }

            for (const attribute of Array.from(element.attributes)) {
              if (
                attribute.name === "id" ||
                attribute.name === "name" ||
                attribute.name === "value" ||
                attribute.name === "title" ||
                attribute.name === "role" ||
                attribute.name === "class" ||
                attribute.name === "onclick" ||
                attribute.name.startsWith("data-") ||
                attribute.name.startsWith("aria-")
              ) {
                const trimmedValue = String(attribute.value ?? "").replace(/\s+/g, " ").trim();
                if (!trimmedValue) {
                  continue;
                }

                const attributeDescriptor = `${selector}:attr:${attribute.name}:${trimmedValue}`;
                if (!seenEvidence.has(attributeDescriptor)) {
                  seenEvidence.add(attributeDescriptor);
                  evidence.push(attributeDescriptor);
                }
              }
            }
          }
        }

        if (document.activeElement instanceof HTMLElement) {
          const activeTextDescriptor = `active:text:${String(document.activeElement.innerText || document.activeElement.textContent || "")
            .replace(/\s+/g, " ")
            .trim()}`;
          if (!seenEvidence.has(activeTextDescriptor) && !activeTextDescriptor.endsWith(":")) {
            seenEvidence.add(activeTextDescriptor);
            evidence.push(activeTextDescriptor);
          }

          for (const attribute of Array.from(document.activeElement.attributes)) {
            if (
              attribute.name === "id" ||
              attribute.name === "name" ||
              attribute.name === "value" ||
              attribute.name === "title" ||
              attribute.name === "role" ||
              attribute.name === "class" ||
              attribute.name === "onclick" ||
              attribute.name.startsWith("data-") ||
              attribute.name.startsWith("aria-")
            ) {
              const trimmedValue = String(attribute.value ?? "").replace(/\s+/g, " ").trim();
              if (!trimmedValue) {
                continue;
              }

              const activeDescriptor = `active:attr:${attribute.name}:${trimmedValue}`;
              if (!seenEvidence.has(activeDescriptor)) {
                seenEvidence.add(activeDescriptor);
                evidence.push(activeDescriptor);
              }
            }
          }
        }

        for (const field of Array.from(body.querySelectorAll("input, option[selected], select, textarea")).slice(0, 20)) {
          if (!(field instanceof HTMLElement)) {
            continue;
          }

          const fieldTextDescriptor = `field:text:${String(field.innerText || field.textContent || "")
            .replace(/\s+/g, " ")
            .trim()}`;
          if (!seenEvidence.has(fieldTextDescriptor) && !fieldTextDescriptor.endsWith(":")) {
            seenEvidence.add(fieldTextDescriptor);
            evidence.push(fieldTextDescriptor);
          }

          for (const attribute of Array.from(field.attributes)) {
            if (
              attribute.name === "id" ||
              attribute.name === "name" ||
              attribute.name === "value" ||
              attribute.name === "title" ||
              attribute.name === "role" ||
              attribute.name === "class" ||
              attribute.name === "onclick" ||
              attribute.name.startsWith("data-") ||
              attribute.name.startsWith("aria-")
            ) {
              const trimmedValue = String(attribute.value ?? "").replace(/\s+/g, " ").trim();
              if (!trimmedValue) {
                continue;
              }

              const fieldAttributeDescriptor = `field:attr:${attribute.name}:${trimmedValue}`;
              if (!seenEvidence.has(fieldAttributeDescriptor)) {
                seenEvidence.add(fieldAttributeDescriptor);
                evidence.push(fieldAttributeDescriptor);
              }
            }
          }

          const fieldValue = String(field.getAttribute("value") ?? "").replace(/\s+/g, " ").trim();
          if (fieldValue) {
            const fieldValueDescriptor = `field:value:${fieldValue}`;
            if (!seenEvidence.has(fieldValueDescriptor)) {
              seenEvidence.add(fieldValueDescriptor);
              evidence.push(fieldValueDescriptor);
            }
          }
        }

        return {
          evidence: evidence.slice(0, 16)
        };
      }
    );

    probes.push({
      selector: candidate.selector,
      matchedIdentifiers: matchPopbillCandidateIdentifiers({
        evidenceValues: probe.evidence,
        targetIndex: target.certificateIndex,
        targetSerial: target.serial,
        targetUserDN: target.userDN
      }),
      evidence: probe.evidence
    });
  }

  return probes;
}

export async function registerPopbillCertificate(
  input: PopbillCertificateRegistrationInput
): Promise<PopbillCertificateRegistrationResult> {
  const userDataDir = resolveUserDataDir();
  const resolvedCertificate = await resolveTargetCertificate(input);
  let context: BrowserContext | null = null;
  let localBridgeBaseUrl: string | null = null;

  try {
    const launched = await launchBrowserContext(userDataDir);
    context = launched.context;
    await tryGrantLocalNetworkAccessPermission(context, input.certificateRegistrationUrl);
    context.on("request", (request) => {
      try {
        const parsed = new URL(request.url());
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
          localBridgeBaseUrl = `${parsed.protocol}//${parsed.host}`;
        }
      } catch {
        // Ignore malformed URLs from the browser layer.
      }
    });

    const page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.accept());

    await page.goto(input.certificateRegistrationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000
    });
    await page.waitForTimeout(4_000);

    const initialText = await page.locator("body").innerText().catch(() => "");
    if (detectAlreadyRegistered(initialText)) {
      return {
        outcome: "already-registered",
        browserChannel: launched.browserChannel,
        certificateIndex: resolvedCertificate.certificateIndex,
        certificateCn: resolvedCertificate.certificateCn,
        certificateKind: resolvedCertificate.certificateKind,
        serial: resolvedCertificate.serial,
        userDN: resolvedCertificate.userDN,
        localBridgeBaseUrl,
        message: "이미 팝빌에 공동인증서가 등록되어 있습니다."
      };
    }

    await page.getByText("전자세금용 공동인증서", { exact: true }).click({ force: true });
    await page.waitForTimeout(5_000);

    const childFrame = page.frames().find((frame) => frame.url().includes("/App/ML4Web/Child.html"));
    if (!childFrame) {
      throw new Error("팝빌 인증서 선택 화면을 열지 못했습니다.");
    }

    await childFrame.locator("#input_cert_pw").waitFor({ state: "visible", timeout: 20_000 });
    const frameInspection = await inspectPopbillCertificateSelectionFrame(childFrame, {
      certificateCn: resolvedCertificate.certificateCn,
      certificateIndex: resolvedCertificate.certificateIndex,
      serial: resolvedCertificate.serial,
      userDN: resolvedCertificate.userDN
    });
    if (frameInspection.visibleMatchCount === 0) {
      const artifact = await writePopbillDebugArtifact({
        stage: "no-visible-cn-match",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        errorMessage: "팝빌 인증서 선택 화면에서 대상 전자세금용 공동인증서를 찾지 못했습니다."
      });
      console.warn(
        `[popbill-cert-registration] no visible CN candidate for ${resolvedCertificate.certificateCn} (index=${resolvedCertificate.certificateIndex}, serial=${resolvedCertificate.serial ?? "-"}, userDN=${resolvedCertificate.userDN ?? "-"}) ${formatPopbillDebugArtifactSummary(artifact)}`
      );
      throw new Error(
        `팝빌 인증서 선택 화면에서 대상 전자세금용 공동인증서를 찾지 못했습니다. ${formatPopbillDebugArtifactSummary(artifact)}`
      );
    }
    const selectionDetailProbes =
      frameInspection.selectedSelector || frameInspection.candidates.length <= 1
        ? []
        : await inspectPopbillCertificateSelectionDetails(childFrame, frameInspection.candidates, {
            certificateIndex: resolvedCertificate.certificateIndex,
            serial: resolvedCertificate.serial,
            userDN: resolvedCertificate.userDN
          });
    const selectedCandidate = pickPopbillCertificateCandidate({
      candidates: frameInspection.candidates,
      selectionDetailProbes,
      targetIndex: resolvedCertificate.certificateIndex,
      targetSerial: resolvedCertificate.serial,
      targetUserDN: resolvedCertificate.userDN
    });
    if (!selectedCandidate.selector) {
      const debugEvidence = describePopbillCandidateEvidence(frameInspection.candidates);
      const selectionDetailEvidence = describePopbillSelectionDetailEvidence(selectionDetailProbes);
      const artifact = await writePopbillDebugArtifact({
        stage: "ambiguous-cn-match",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        errorMessage:
          "iframe DOM에서 serial/userDN/index와 일치하는 고유 항목을 확인하지 못해 자동 등록을 중단했습니다."
      });
      console.warn(
        `[popbill-cert-registration] ambiguous certificate candidates: ${JSON.stringify(
          {
            certificateCn: resolvedCertificate.certificateCn,
            certificateIndex: resolvedCertificate.certificateIndex,
            serial: resolvedCertificate.serial,
            userDN: resolvedCertificate.userDN,
            visibleMatchCount: frameInspection.visibleMatchCount,
            candidates: frameInspection.candidates,
            selectionDetailProbes,
            artifact
          },
          null,
          2
        )}`
      );
      throw new Error(
        `팝빌 인증서 선택 화면에 같은 인증서명(CN)의 전자세금용 공동인증서가 ${frameInspection.visibleMatchCount}건 보여 자동 등록을 중단했습니다. iframe DOM에서 serial/userDN/index와 일치하는 고유 항목을 확인하지 못했습니다. ${debugEvidence} ${selectionDetailEvidence} ${formatPopbillDebugArtifactSummary(artifact)}`
      );
    }

    console.info(
      `[popbill-cert-registration] selecting ${resolvedCertificate.certificateCn} using ${selectedCandidate.reason ?? frameInspection.selectionReason ?? "CN match"} (${selectedCandidate.selector})`
    );
    await childFrame.locator(selectedCandidate.selector).click({ force: true });
    await childFrame.locator("#input_cert_pw").fill(input.certificatePassword);

    const registrationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/__API_V1__/Taxinvoice/Preference/Certificate"),
      { timeout: 30_000 }
    );
    await childFrame.locator("#btn_confirm_iframe").click({ force: true });
    await registrationResponse;

    try {
      await waitForPageText(page, "인증서가 등록 되었습니다.", 30_000);
    } catch {
      const frameText = await childFrame.locator("body").innerText().catch(() => "");
      const resolvedError = extractRegistrationError(frameText) ?? "팝빌 인증서 등록 완료를 확인하지 못했습니다.";
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        errorMessage: resolvedError
      });
      throw new Error(`${resolvedError} ${formatPopbillDebugArtifactSummary(artifact)}`);
    }

    return {
      outcome: "registered",
      browserChannel: launched.browserChannel,
      certificateIndex: resolvedCertificate.certificateIndex,
      certificateCn: resolvedCertificate.certificateCn,
      certificateKind: resolvedCertificate.certificateKind,
      serial: resolvedCertificate.serial,
      userDN: resolvedCertificate.userDN,
      localBridgeBaseUrl,
      message: "팝빌 공동인증서 등록을 완료했습니다."
    };
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
  }
}
