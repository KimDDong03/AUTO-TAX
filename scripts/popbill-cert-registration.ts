import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Frame, type Page } from "playwright";
import { collectBridgeCertificateList, collectBridgeProbeResult } from "./renewal-agent.ts";

export type PopbillCertificateRegistrationInput = {
  certificateRegistrationUrl: string;
  certificateIndex: number;
  certificateCn?: string | null;
  certificateKind: "electronic_tax";
  serial?: string | null;
  userDN?: string | null;
  targetExpireDate?: string | null;
  certificatePassword: string;
};

export type PopbillCertificateRegistrationTiming = {
  totalMs: number;
  browserLaunchMs: number;
  permissionMs: number;
  pageLoadMs: number;
  certificateResolveMs: number;
  sectionOpenMs: number;
  frameReadyMs: number;
  candidateInspectMs: number;
  selectionReadyMs: number;
  submitMs: number;
  completionConfirmMs: number;
};

export type PopbillCertificateRegistrationStage =
  | "browser-launch"
  | "permission"
  | "page-load"
  | "certificate-resolve"
  | "already-registered-check"
  | "section-open"
  | "frame-ready"
  | "candidate-inspect"
  | "selection-ready"
  | "password-fill"
  | "submit"
  | "completion-confirm";

export class PopbillCertificateRegistrationError extends Error {
  readonly stage: PopbillCertificateRegistrationStage;
  readonly timing: PopbillCertificateRegistrationTiming;

  constructor(
    message: string,
    options: {
      stage: PopbillCertificateRegistrationStage;
      timing: PopbillCertificateRegistrationTiming;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "PopbillCertificateRegistrationError";
    this.stage = options.stage;
    this.timing = options.timing;
  }
}

export type PopbillCertificateRegistrationResult = {
  outcome: "registered" | "already-registered";
  browserChannel: string;
  certificateIndex: number;
  certificateCn: string;
  certificateKind: "electronic_tax";
  serial: string | null;
  userDN: string | null;
  targetExpireDate: string | null;
  localBridgeBaseUrl: string | null;
  message: string;
  timing: PopbillCertificateRegistrationTiming;
};

export type PopbillCertificateCandidateIdentifier = "serial" | "userDN" | "targetExpireDate" | "certificateIndex";

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

const BROWSER_CHANNEL_CANDIDATES = (() => {
  const configured = (process.env.AUTO_TAX_POPBILL_HELPER_BROWSER_CHANNEL ?? "")
    .split(",")
    .flatMap((value) => value.split(";"))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const defaults = ["chrome", "msedge", "chromium"];
  const seen = new Set<string>();
  return [...configured, ...defaults].filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
})();

const POPBILL_CERTIFICATE_FRAME_READY_TIMEOUT_MS = 60_000;
const POPBILL_CERTIFICATE_LIST_READY_TIMEOUT_MS = 60_000;

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

  throw new Error(`브라우저 실행에 실패했습니다.\n${errors.join("\n")}`);
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
  const normalized = pageText.replace(/\s+/g, "");
  return (
    (normalized.includes("이미등록") && normalized.includes("사용") && normalized.includes("해제")) ||
    (normalized.includes("공동인증서관리") && normalized.includes("사용") && normalized.includes("삭제") && normalized.includes("재등록"))
  );
}

function detectExpiredToken(pageText: string): boolean {
  const normalized = pageText.replace(/\s+/g, "");
  return normalized.includes("만료된토큰") || normalized.includes("토큰이만료");
}

async function collectPageAndDialogSignals(
  page: Page,
  dialogMessages: string[],
): Promise<string> {
  const frameTexts = await Promise.all(
    page.frames().map(async (frame) => {
      try {
        return await frame.locator("body").innerText();
      } catch {
        return "";
      }
    }),
  );

  return [...frameTexts, ...dialogMessages].join("\n");
}

async function throwIfExpiredTokenVisible(page: Page, dialogMessages: string[]) {
  const signals = await collectPageAndDialogSignals(page, dialogMessages);
  if (detectExpiredToken(signals)) {
    throw new Error("팝빌 인증서 등록 URL이 만료되었습니다.");
  }
}

async function openPopbillElectronicTaxCertificateSection(
  page: Page,
  dialogMessages: string[],
  timeoutMs = 30_000
): Promise<void> {
  const startedAt = Date.now();
  const candidateLocators = [
    page.getByText("전자세금용 공동인증서", { exact: true }).first(),
    page.getByText("전자세금용 공동인증서", { exact: false }).first(),
    page.getByRole("button", { name: /전자세금용\s*공동인증서/ }).first(),
    page.locator("a, button, span, div").filter({ hasText: "전자세금용 공동인증서" }).first()
  ];

  while (Date.now() - startedAt < timeoutMs) {
    await throwIfExpiredTokenVisible(page, dialogMessages);

    for (const locator of candidateLocators) {
      try {
        if ((await locator.count()) === 0) {
          continue;
        }

        await locator.scrollIntoViewIfNeeded().catch(() => undefined);
        if (!(await locator.isVisible().catch(() => false))) {
          continue;
        }

        await locator.click({ force: true, timeout: 2_000 });
        await page.waitForTimeout(1_000);
        return;
      } catch {
        // Try the next candidate or retry loop.
      }
    }

    await page.waitForTimeout(500);
  }

  const signals = await collectPageAndDialogSignals(page, dialogMessages);
  throw new Error(
    `팝빌 메인 화면에서 전자세금용 공동인증서 버튼을 찾지 못했습니다. ${signals
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500)}`
  );
}

async function waitForPopbillCertificateSelectionFrame(
  page: Page,
  dialogMessages: string[],
  timeoutMs = POPBILL_CERTIFICATE_FRAME_READY_TIMEOUT_MS
): Promise<Frame> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await throwIfExpiredTokenVisible(page, dialogMessages);
    const childFrame = page.frames().find((frame) => frame.url().includes("/App/ML4Web/Child.html"));
    if (childFrame) {
      const passwordInputVisible = await childFrame
        .locator("#input_cert_pw")
        .isVisible({ timeout: 1_000 })
        .catch(() => false);
      if (passwordInputVisible) {
        return childFrame;
      }
    }

    await page.waitForTimeout(500);
  }

  await throwIfExpiredTokenVisible(page, dialogMessages);
  throw new Error("인증서 선택 화면을 불러오지 못했습니다. AT 헬퍼와 Chrome을 다시 실행한 뒤 재시도하세요.");
}

async function waitForPopbillCertificateCandidate(options: {
  page: Page;
  frame: Frame;
  dialogMessages: string[];
  resolvedCertificate: {
    certificateIndex: number;
    certificateCn: string;
    serial: string | null;
    userDN: string | null;
    targetExpireDate: string | null;
  };
  timeoutMs?: number;
}): Promise<{
  visibleMatchCount: number;
  selectedSelector: string | null;
  selectionReason: string | null;
  candidates: PopbillCertificateIframeCandidate[];
}> {
  const timeoutMs = options.timeoutMs ?? POPBILL_CERTIFICATE_LIST_READY_TIMEOUT_MS;
  const startedAt = Date.now();
  let frameInspection = await inspectPopbillCertificateSelectionFrame(options.frame, options.resolvedCertificate);

  while (frameInspection.visibleMatchCount === 0 && Date.now() - startedAt < timeoutMs) {
    await options.frame.waitForTimeout(500);
    await throwIfExpiredTokenVisible(options.page, options.dialogMessages);
    frameInspection = await inspectPopbillCertificateSelectionFrame(options.frame, options.resolvedCertificate);
  }

  return frameInspection;
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

function normalizePopbillCertificateDateKey(value: string | number | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const candidates: Array<[string, string, string]> = [];
  for (const match of text.matchAll(/((?:19|20)\d{2})\D+(\d{1,2})\D+(\d{1,2})/g)) {
    candidates.push([match[1] ?? "", match[2] ?? "", match[3] ?? ""]);
  }
  for (const match of text.matchAll(/(\d{1,2})\D+(\d{1,2})\D+((?:19|20)\d{2})/g)) {
    candidates.push([match[3] ?? "", match[1] ?? "", match[2] ?? ""]);
  }
  for (const match of text.matchAll(/((?:19|20)\d{2})(\d{2})(\d{2})/g)) {
    candidates.push([match[1] ?? "", match[2] ?? "", match[3] ?? ""]);
  }

  for (const [yearText, monthText, dayText] of candidates) {
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      continue;
    }
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      continue;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      continue;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

async function resolveTargetCertificate(input: PopbillCertificateRegistrationInput): Promise<{
  certificateIndex: number;
  certificateCn: string;
  certificateKind: "electronic_tax";
  serial: string | null;
  userDN: string | null;
  targetExpireDate: string | null;
}> {
  let { storageProbe } = await collectBridgeCertificateList({ preferCached: false });

  const targetIndex = normalizeCertificateFingerprint(input.certificateIndex);
  const targetCn = normalizeCertificateFingerprint(input.certificateCn);
  const targetSerial = normalizeCertificateFingerprint(input.serial);
  const targetUserDN = normalizeCertificateFingerprint(input.userDN);
  const cachedCertificatesExposeDetailedIdentity = storageProbe.certificates.some(
    (certificate) =>
      normalizeCertificateFingerprint(certificate.serial) !== "" ||
      normalizeCertificateFingerprint(certificate.userDN) !== ""
  );
  const requiresDetailedIdentity = targetSerial !== "" || targetUserDN !== "";
  if (!storageProbe.ok || (requiresDetailedIdentity && !cachedCertificatesExposeDetailedIdentity)) {
    const detailedProbe = await collectBridgeProbeResult({ includeDetailedProbe: true });
    storageProbe = detailedProbe.bridge.storageProbe;
  }
  if (!storageProbe.ok) {
    throw new Error(storageProbe.error ?? "로컬 브리지에서 공동인증서 목록을 읽지 못했습니다.");
  }
  const allCertificates = storageProbe.certificates;
  const electronicTaxCertificates = storageProbe.certificates.filter((certificate) =>
    isElectronicTaxUsageName(certificate.usageToName)
  );

  let resolvedCertificate: (typeof electronicTaxCertificates)[number] | null = null;
  let resolutionStrategy: "identity" | "index" | "cn" | null = null;

  if (targetSerial !== "" || targetUserDN !== "") {
    const identityMatches = allCertificates.filter((certificate) => {
      const certificateSerial = normalizeCertificateFingerprint(certificate.serial);
      const certificateUserDN = normalizeCertificateFingerprint(certificate.userDN);
      if (targetSerial !== "") {
        return certificateSerial === targetSerial;
      }
      if (targetUserDN !== "") {
        return certificateUserDN === targetUserDN;
      }
      return true;
    });

    if (identityMatches.length === 1) {
      resolvedCertificate = identityMatches[0] ?? null;
      resolutionStrategy = "identity";
    } else if (identityMatches.length > 1) {
      const narrowedIdentityMatches = identityMatches.filter((certificate) => {
        if (targetCn !== "" && normalizeCertificateFingerprint(certificate.cn) !== targetCn) {
          return false;
        }
        if (targetIndex !== "" && normalizeCertificateFingerprint(certificate.index) !== targetIndex) {
          return false;
        }
        return true;
      });

      if (narrowedIdentityMatches.length === 1) {
        resolvedCertificate = narrowedIdentityMatches[0] ?? null;
        resolutionStrategy = "identity";
      } else {
        throw new Error("serial/userDN과 일치하는 로컬 공동인증서가 여러 개여서 자동 등록을 중단했습니다.");
      }
    } else {
      throw new Error(
        `로컬 브리지에서 serial/userDN과 일치하는 현재 전자세금용 공동인증서를 찾지 못했습니다. (serial=${input.serial ?? "-"}, userDN=${input.userDN ?? "-"})`
      );
    }
  }

  if (!resolvedCertificate && targetIndex !== "") {
    resolvedCertificate =
      electronicTaxCertificates.find(
        (certificate) => normalizeCertificateFingerprint(certificate.index) === targetIndex
      ) ?? null;
    if (resolvedCertificate) {
      resolutionStrategy = "index";
    }
  }

  if (!resolvedCertificate && targetCn !== "") {
    const cnMatches = electronicTaxCertificates.filter(
      (certificate) => normalizeCertificateFingerprint(certificate.cn) === targetCn
    );
    if (cnMatches.length === 1) {
      resolvedCertificate = cnMatches[0] ?? null;
      resolutionStrategy = "cn";
    } else if (cnMatches.length > 1) {
      throw new Error("같은 CN의 현재 로컬 공동인증서가 여러 개여서 자동 등록을 중단했습니다.");
    }
  }

  if (!resolvedCertificate) {
    throw new Error(
      `로컬 브리지에서 현재 팝빌 등록 대상 전자세금용 공동인증서를 찾지 못했습니다. (index=${input.certificateIndex}, serial=${input.serial ?? "-"}, userDN=${input.userDN ?? "-"})`
    );
  }

  if (
    resolutionStrategy !== "identity" &&
    targetCn !== "" &&
    normalizeCertificateFingerprint(resolvedCertificate.cn) !== targetCn
  ) {
    throw new Error("선택한 공동인증서 CN이 현재 로컬 인증서와 달라 자동 등록을 중단했습니다.");
  }

  if (
    resolutionStrategy !== "identity" &&
    targetSerial !== "" &&
    normalizeCertificateFingerprint(resolvedCertificate.serial) !== targetSerial
  ) {
    throw new Error("선택한 공동인증서 serial이 현재 로컬 인증서와 달라 자동 등록을 중단했습니다.");
  }

  if (
    resolutionStrategy !== "identity" &&
    targetUserDN !== "" &&
    normalizeCertificateFingerprint(resolvedCertificate.userDN) !== targetUserDN
  ) {
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

  const duplicateCnCertificates = electronicTaxCertificates.filter(
    (certificate) => normalizeCertificateFingerprint(certificate.cn) === normalizeCertificateFingerprint(certificateCn)
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
    userDN: resolvedCertificate.userDN?.trim() || null,
    targetExpireDate:
      normalizePopbillCertificateDateKey(input.targetExpireDate) ??
      normalizePopbillCertificateDateKey(resolvedCertificate.todate) ??
      normalizePopbillCertificateDateKey(resolvedCertificate.detailValidateTo)
  };
}

export function extractRegistrationError(signals: string): string | null {
  const normalized = signals.replace(/\s+/g, "");
  if (
    normalized.includes("만료된공동인증서") ||
    normalized.includes("만료된인증서") ||
    normalized.includes("유효기간이만료") ||
    normalized.includes("인증서가만료")
  ) {
    return "만료된 공동인증서입니다.";
  }

  if (
    normalized.includes("비밀번호를다시입력") ||
    normalized.includes("비밀번호가올바르지") ||
    normalized.includes("암호가올바르지") ||
    normalized.includes("비밀번호를확인")
  ) {
    return "공동인증서 비밀번호가 올바르지 않습니다.";
  }

  if (normalized.includes("인증서를선택")) {
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

function hasPopbillExpireDateEvidence(evidenceValues: string[], targetExpireDate: string | null | undefined): boolean {
  const normalizedTargetDate = normalizePopbillCertificateDateKey(targetExpireDate);
  if (!normalizedTargetDate) {
    return false;
  }

  return evidenceValues
    .filter((value) => !String(value).startsWith("active:text:"))
    .some((value) => normalizePopbillCertificateDateKey(value) === normalizedTargetDate);
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

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function matchPopbillCandidateIdentifiers(options: {
  evidenceValues: string[];
  targetIndex?: string | number | null;
  targetSerial?: string | null;
  targetUserDN?: string | null;
  targetExpireDate?: string | null;
}): PopbillCertificateCandidateIdentifier[] {
  const matchedIdentifiers: PopbillCertificateCandidateIdentifier[] = [];

  if (hasPopbillFingerprintEvidence(options.evidenceValues, options.targetSerial)) {
    matchedIdentifiers.push("serial");
  }

  if (hasPopbillFingerprintEvidence(options.evidenceValues, options.targetUserDN)) {
    matchedIdentifiers.push("userDN");
  }

  if (hasPopbillExpireDateEvidence(options.evidenceValues, options.targetExpireDate)) {
    matchedIdentifiers.push("targetExpireDate");
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
        : options.identifier === "targetExpireDate"
          ? "expire date"
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
  targetExpireDate?: string | null;
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
      identifier: "targetExpireDate",
      enabled: normalizePopbillCertificateDateKey(options.targetExpireDate) !== null
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
    return "?꾨낫 DOM 利앷굅瑜??섏쭛?섏? 紐삵뻽?듬땲??";
  }

  return candidates
    .slice(0, 3)
    .map((candidate, index) => {
      const matchedSummary =
        candidate.matchedIdentifiers.length > 0
          ? `?앸퀎??${candidate.matchedIdentifiers.join("/")}`
          : "?앸퀎???놁쓬";
      const attributeSummary =
        candidate.attributes.length > 0
          ? `?띿꽦=${candidate.attributes.map((value) => trimDebugValue(value, 80)).join(" | ")}`
          : "?띿꽦=?놁쓬";
      const hiddenValueSummary =
        candidate.hiddenValues.length > 0
          ? `?낅젰媛?${candidate.hiddenValues.map((value) => trimDebugValue(value, 80)).join(" | ")}`
          : "?낅젰媛??놁쓬";

      return `${index + 1}) ${matchedSummary}; ?띿뒪??${trimDebugValue(candidate.text, 120)}; ${attributeSummary}; ${hiddenValueSummary}`;
    })
    .join(" / ");
}

function describePopbillSelectionDetailEvidence(probes: PopbillCertificateSelectionDetailProbe[]): string {
  if (probes.length === 0) {
    return "?좏깮 ???곸꽭 DOM 利앷굅瑜??섏쭛?섏? 紐삵뻽?듬땲??";
  }

  return probes
    .slice(0, 3)
    .map((probe, index) => {
      const matchedSummary =
        probe.matchedIdentifiers.length > 0 ? `?앸퀎??${probe.matchedIdentifiers.join("/")}` : "?앸퀎???놁쓬";
      const evidenceSummary =
        probe.evidence.length > 0 ? `利앷굅=${probe.evidence.map((value) => trimDebugValue(value, 80)).join(" | ")}` : "利앷굅=?놁쓬";
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
        nextAction: "癒쇱? 濡쒖뺄 釉뚮━吏/怨듬룞?몄쬆??紐⑸줉 議고쉶瑜?蹂듦뎄???? duplicate electronic_tax CN怨??ㅼ젣 Popbill cert-url 諛쒓툒 ?곹깭瑜??ㅼ떆 ?뺤씤?섏꽭??",
        message: storageProbe.error ?? "濡쒖뺄 釉뚮━吏?먯꽌 怨듬룞?몄쬆??紐⑸줉???쎌? 紐삵뻽?듬땲??"
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
      nextAction: "癒쇱? 濡쒖뺄 釉뚮━吏/怨듬룞?몄쬆??紐⑸줉 議고쉶瑜?蹂듦뎄???? duplicate electronic_tax CN怨??ㅼ젣 Popbill cert-url 諛쒓툒 ?곹깭瑜??ㅼ떆 ?뺤씤?섏꽭??",
      message: error instanceof Error ? error.message : "濡쒖뺄 釉뚮━吏?먯꽌 怨듬룞?몄쬆??紐⑸줉???쎌? 紐삵뻽?듬땲??"
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

type PopbillSelectionActivationState = {
  passwordInputVisible: boolean;
  passwordInputDisabled: boolean;
  passwordInputReadOnly: boolean;
  confirmButtonDisabled: boolean;
  keyboardToggleVisible: boolean;
  browserManualVisible: boolean;
  activeElementId: string | null;
  selectedRowIds: string[];
  targetSelectionConfirmed: boolean;
  targetSelectionCommitted: boolean;
  targetSelectionEvidence: string[];
  targetSelectionStatusTexts: string[];
};

async function readPopbillSelectionActivationState(
  frame: Frame,
  targetSelector?: string | null
): Promise<PopbillSelectionActivationState> {
  return await frame.locator("body").evaluate((body, rawTargetSelector) => {
    const passwordInput = body.querySelector("#input_cert_pw");
    const confirmButton = body.querySelector("#btn_confirm_iframe");
    const keyboardToggle = body.querySelector("#keyboardOn");
    const browserManual = body.querySelector("#browser_manual1");
    const selectedElements: HTMLElement[] = [];
    for (const element of Array.from(
      body.querySelectorAll(
        [
          "[role='row'][aria-selected='true']",
          "[role='row'].selected",
          "[role='row'].active",
          "[role='row'].current",
          "[role='gridcell'][aria-selected='true']",
          "[role='gridcell'].selected",
          "[role='gridcell'].active",
          "[role='gridcell'].current",
          "[role='row'] td",
          "[role='row'] [role='gridcell']",
          "tr td",
          "tr [role='gridcell']"
        ].join(", ")
      )
    )) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const rowElement = element.closest("[role='row'], tr");
      const checkTargets = [element, rowElement].filter(
        (candidate): candidate is HTMLElement => candidate instanceof HTMLElement
      );
      let hasSelectionSignal = false;
      for (const candidate of checkTargets) {
        const classNames = Array.from(candidate.classList.values()).map((value) => value.toLowerCase());
        if (
          classNames.some(
            (className) =>
              className.includes("selected") ||
              className.includes("pressed") ||
              className.includes("active") ||
              className.includes("current")
          )
        ) {
          hasSelectionSignal = true;
          break;
        }
      }

      if (hasSelectionSignal) {
        selectedElements.push(element);
      }
    }
    const selectedRowIds = selectedElements
      .map((element) => element.id || element.getAttribute("data-key") || "")
      .filter(Boolean)
      .slice(0, 8);
    const passwordInputVisible =
      passwordInput instanceof HTMLElement
        ? (() => {
            const style = window.getComputedStyle(passwordInput);
            return style.display !== "none" && style.visibility !== "hidden" && passwordInput.getClientRects().length > 0;
          })()
        : false;
    const keyboardToggleVisible =
      keyboardToggle instanceof HTMLElement
        ? (() => {
            const style = window.getComputedStyle(keyboardToggle);
            return style.display !== "none" && style.visibility !== "hidden" && keyboardToggle.getClientRects().length > 0;
          })()
        : false;
    const browserManualVisible =
      browserManual instanceof HTMLElement
        ? (() => {
            const style = window.getComputedStyle(browserManual);
            return style.display !== "none" && style.visibility !== "hidden" && browserManual.getClientRects().length > 0;
          })()
        : false;
    const targetSelectionEvidence: string[] = [];
    let targetSelectionConfirmed = false;
    let targetSelectionCommitted = false;
    const targetSelectionStatusTexts: string[] = [];

    if (typeof rawTargetSelector === "string" && rawTargetSelector.trim() !== "") {
      const target = body.querySelector(rawTargetSelector);
      const targetCell = target?.closest("[role='gridcell'], td");
      const targetRow = target?.closest("[role='row'], tr");
      const targetNodes = [target, targetCell, targetRow].filter(
        (element): element is HTMLElement => element instanceof HTMLElement
      );

      let targetHasSelectionSignal = false;
      for (const node of targetNodes) {
        const checkTargets = [node, node.closest("[role='row'], tr")].filter(
          (candidate): candidate is HTMLElement => candidate instanceof HTMLElement
        );
        for (const candidate of checkTargets) {
          const classNames = Array.from(candidate.classList.values()).map((value) => value.toLowerCase());
          if (
            classNames.some(
              (className) =>
                className.includes("selected") ||
                className.includes("pressed") ||
                className.includes("active") ||
                className.includes("current")
            )
          ) {
            targetHasSelectionSignal = true;
            break;
          }
        }
        if (targetHasSelectionSignal) {
          break;
        }
      }

      if (targetHasSelectionSignal) {
        targetSelectionConfirmed = true;
        targetSelectionEvidence.push(
          ...targetNodes.slice(0, 3).map((node) => {
            const row = node.closest("[role='row'], tr");
            return `target-selected=${node.tagName.toLowerCase()}#${node.id || "-"} row=${row instanceof HTMLElement ? row.id || "-" : "-"}`;
          })
        );
      }

      for (const targetNode of targetNodes) {
        for (const attributeName of ["title", "aria-label"] as const) {
          const rawValue = String(targetNode.getAttribute(attributeName) ?? "")
            .replace(/\s+/g, " ")
            .trim();
          if (!rawValue) {
            continue;
          }

          targetSelectionStatusTexts.push(`${targetNode.tagName.toLowerCase()}:${attributeName}:${rawValue}`);
          if (/선택됨|selected/i.test(rawValue)) {
            targetSelectionCommitted = true;
          }
        }
      }

      const targetRowId =
        targetRow instanceof HTMLElement ? targetRow.id || targetRow.getAttribute("data-key") || "" : "";
      const targetCellId =
        targetCell instanceof HTMLElement ? targetCell.id || targetCell.getAttribute("data-key") || "" : "";
      if (
        !targetSelectionCommitted &&
        targetSelectionConfirmed &&
        ((targetRowId && selectedRowIds.includes(targetRowId)) || (targetCellId && selectedRowIds.includes(targetCellId)))
      ) {
        targetSelectionCommitted = true;
      }

      if (!targetSelectionConfirmed) {
        for (const selectedElement of selectedElements) {
          const row = selectedElement.closest("[role='row'], tr");
          const cell = selectedElement.closest("[role='gridcell'], td");
          const keys = [
            selectedElement.id,
            selectedElement.getAttribute("data-key") ?? "",
            row instanceof HTMLElement ? row.id : "",
            row instanceof HTMLElement ? row.getAttribute("data-key") ?? "" : "",
            cell instanceof HTMLElement ? cell.id : "",
            cell instanceof HTMLElement ? cell.getAttribute("data-key") ?? "" : ""
          ]
            .filter(Boolean)
            .slice(0, 4);

          if (
            targetNodes.some(
              (node) => node === selectedElement || node.contains(selectedElement) || selectedElement.contains(node)
            )
          ) {
            targetSelectionConfirmed = true;
            targetSelectionEvidence.push(
              `selected=${selectedElement.tagName.toLowerCase()}#${selectedElement.id || "-"} keys=${keys.join("|") || "-"}`
            );
            break;
          }
        }
      }

      if (!targetSelectionConfirmed) {
        for (const targetNode of targetNodes) {
          const row = targetNode.closest("[role='row'], tr");
          const cell = targetNode.closest("[role='gridcell'], td");
          const keys = [
            targetNode.tagName.toLowerCase(),
            targetNode.id || "",
            targetNode.getAttribute("data-key") ?? "",
            row instanceof HTMLElement ? row.id : "",
            row instanceof HTMLElement ? row.getAttribute("data-key") ?? "" : "",
            cell instanceof HTMLElement ? cell.id : "",
            cell instanceof HTMLElement ? cell.getAttribute("data-key") ?? "" : ""
          ]
            .filter(Boolean)
            .slice(0, 6);
          if (keys.length > 0) {
            targetSelectionEvidence.push(`target=${keys.join("|")}`);
          }
        }
      }
    } else {
      targetSelectionConfirmed = true;
      targetSelectionCommitted = true;
    }

    return {
      passwordInputVisible,
      passwordInputDisabled:
        passwordInput instanceof HTMLInputElement || passwordInput instanceof HTMLTextAreaElement
          ? passwordInput.disabled
          : true,
      passwordInputReadOnly:
        passwordInput instanceof HTMLInputElement || passwordInput instanceof HTMLTextAreaElement
          ? passwordInput.readOnly
          : false,
      confirmButtonDisabled:
        confirmButton instanceof HTMLButtonElement ? confirmButton.disabled : true,
      keyboardToggleVisible,
      browserManualVisible,
      activeElementId: document.activeElement instanceof HTMLElement ? document.activeElement.id || null : null,
      selectedRowIds,
      targetSelectionConfirmed,
      targetSelectionCommitted,
      targetSelectionEvidence: targetSelectionEvidence.slice(0, 8),
      targetSelectionStatusTexts: targetSelectionStatusTexts.slice(0, 8)
    };
  }, targetSelector ?? null);
}

function isPopbillSelectionReady(state: PopbillSelectionActivationState): boolean {
  return (
    state.passwordInputVisible &&
    !state.passwordInputDisabled &&
    !state.passwordInputReadOnly &&
    state.targetSelectionConfirmed &&
    state.targetSelectionCommitted
  );
}

async function activatePopbillCertificateSelection(frame: Frame, selector: string): Promise<void> {
  const targetLocator = frame.locator(selector);
  await targetLocator.scrollIntoViewIfNeeded().catch(() => undefined);
  await targetLocator.click({ force: true }).catch(() => undefined);
  const targetHandle = await targetLocator.elementHandle().catch(() => null);
  const targetCellHandle = targetHandle
    ? (await targetHandle.evaluateHandle((node) => node.closest("[role='gridcell'], td"))).asElement()
    : null;
  const targetRowHandle = targetHandle
    ? (await targetHandle.evaluateHandle((node) => node.closest("[role='row'], tr"))).asElement()
    : null;
  const interactionHandles = [targetHandle, targetCellHandle, targetRowHandle].filter(
    (handle): handle is NonNullable<typeof targetHandle> => Boolean(handle)
  );

  for (const handle of interactionHandles) {
    await handle.scrollIntoViewIfNeeded().catch(() => undefined);
    await handle.click({ force: true }).catch(() => undefined);
    await handle.focus().catch(() => undefined);
    await frame.waitForTimeout(50);
  }

  if (targetCellHandle) {
    await targetCellHandle.press("Enter").catch(() => undefined);
    await frame.waitForTimeout(100);
    await targetCellHandle.press(" ").catch(() => undefined);
    await frame.waitForTimeout(100);
  }

  await frame.evaluate((rawSelector) => {
    const target = document.querySelector(rawSelector);
    const targetCell = target?.closest("[role='gridcell'], td");
    const targetRow = target?.closest("[role='row'], tr");
    const dispatchTargets = [target, targetCell, targetRow];
    const clicked = new WeakSet<HTMLElement>();
    for (const dispatchTarget of dispatchTargets) {
      if (!(dispatchTarget instanceof HTMLElement) || clicked.has(dispatchTarget)) {
        continue;
      }
      clicked.add(dispatchTarget);
      try {
        dispatchTarget.focus();
      } catch {
        // Ignore focus failures for non-focusable elements.
      }
      for (const eventType of ["mouseover", "mousemove", "mousedown", "mouseup", "click"] as const) {
        dispatchTarget.dispatchEvent(
          new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          })
        );
      }
      try {
        dispatchTarget.click();
      } catch {
        // Some popbill elements may reject direct click(); the synthetic events above are enough.
      }
    }

    const keyboardTarget =
      targetCell instanceof HTMLElement
        ? targetCell
        : target instanceof HTMLElement
          ? target
          : targetRow instanceof HTMLElement
            ? targetRow
            : null;
    if (keyboardTarget) {
      for (const key of ["Enter", " "] as const) {
        keyboardTarget.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true
          })
        );
        keyboardTarget.dispatchEvent(
          new KeyboardEvent("keyup", {
            key,
            bubbles: true,
            cancelable: true
          })
        );
      }
    }

    const browserManualClose = document.querySelector("#manual_close");
    if (browserManualClose instanceof HTMLElement) {
      try {
        browserManualClose.click();
      } catch {
        // Ignore hint dismissal failures.
      }
    }
  }, selector);
}

async function ensurePopbillCertificateSelectionReady(
  frame: Frame,
  selector: string,
  timeoutMs = 8_000
): Promise<PopbillSelectionActivationState> {
  const startedAt = Date.now();
  let lastState = await readPopbillSelectionActivationState(frame, selector);
  if (isPopbillSelectionReady(lastState)) {
    return lastState;
  }

  while (Date.now() - startedAt < timeoutMs) {
    await activatePopbillCertificateSelection(frame, selector);
    await frame.waitForTimeout(250);
    lastState = await readPopbillSelectionActivationState(frame, selector);
    if (isPopbillSelectionReady(lastState)) {
      return lastState;
    }
  }

  return lastState;
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
  selectionActivationState?: PopbillSelectionActivationState | null;
  dialogMessages?: string[];
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
        selectionDetailProbes: options.selectionDetailProbes ?? [],
        selectionActivationState: options.selectionActivationState ?? null,
        dialogMessages: options.dialogMessages ?? []
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
    targetExpireDate: string | null;
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
        userDN: String(rawTarget.userDN ?? ""),
        targetExpireDate: String(rawTarget.targetExpireDate ?? "")
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
      targetUserDN: target.userDN,
      targetExpireDate: target.targetExpireDate
    })
  }));
  const selected = pickPopbillCertificateCandidate({
    candidates: candidatesWithIdentifiers,
    targetIndex: target.certificateIndex,
    targetSerial: target.serial,
    targetUserDN: target.userDN,
    targetExpireDate: target.targetExpireDate
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
    targetExpireDate: string | null;
  }
): Promise<PopbillCertificateSelectionDetailProbe[]> {
  const probes: PopbillCertificateSelectionDetailProbe[] = [];
  for (const candidate of candidates.slice(0, 6)) {
    if (!candidate.selector) {
      continue;
    }

    await activatePopbillCertificateSelection(frame, candidate.selector);
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
        targetUserDN: target.userDN,
        targetExpireDate: target.targetExpireDate
      }),
      evidence: probe.evidence
    });
  }

  return probes;
}

export async function registerPopbillCertificate(
  input: PopbillCertificateRegistrationInput
): Promise<PopbillCertificateRegistrationResult> {
  const timingStartedAt = Date.now();
  const timing = {
    browserLaunchMs: 0,
    permissionMs: 0,
    pageLoadMs: 0,
    certificateResolveMs: 0,
    sectionOpenMs: 0,
    frameReadyMs: 0,
    candidateInspectMs: 0,
    selectionReadyMs: 0,
    submitMs: 0,
    completionConfirmMs: 0
  };
  let registrationOutcome: "registered" | "already-registered" | "failed" = "failed";
  let registrationStage: PopbillCertificateRegistrationStage = "browser-launch";
  const buildTiming = () => ({
    totalMs: Date.now() - timingStartedAt,
    ...timing
  });
  const userDataDir = resolveUserDataDir();
  const requestedCertificateCn = input.certificateCn?.trim() ?? "";
  const resolvedCertificatePromise =
    requestedCertificateCn !== ""
      ? Promise.resolve({
          ok: true as const,
          value: {
            certificateIndex: input.certificateIndex,
            certificateCn: requestedCertificateCn,
            certificateKind: input.certificateKind,
            serial: input.serial?.trim() || null,
            userDN: input.userDN?.trim() || null,
            targetExpireDate: normalizePopbillCertificateDateKey(input.targetExpireDate)
          }
        })
      : resolveTargetCertificate(input)
          .then((value) => ({ ok: true as const, value }))
          .catch((error) => ({
            ok: false as const,
            error: error instanceof Error ? error : new Error(String(error))
          }));
  let context: BrowserContext | null = null;
  let localBridgeBaseUrl: string | null = null;

  try {
    const browserLaunchStartedAt = Date.now();
    const launched = await launchBrowserContext(userDataDir);
    timing.browserLaunchMs = Date.now() - browserLaunchStartedAt;
    context = launched.context;
    registrationStage = "permission";
    const permissionStartedAt = Date.now();
    await tryGrantLocalNetworkAccessPermission(context, input.certificateRegistrationUrl);
    timing.permissionMs = Date.now() - permissionStartedAt;
    for (const existingPage of context.pages()) {
      try {
        await existingPage.close({ runBeforeUnload: true });
      } catch {
        // Ignore stale restored tabs that refuse to close cleanly.
      }
    }
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
    const dialogMessages: string[] = [];
    page.on("dialog", (dialog) => {
      dialogMessages.push(dialog.message());
      void dialog.accept();
    });

    registrationStage = "page-load";
    const pageLoadStartedAt = Date.now();
    await page.goto(input.certificateRegistrationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000
    });
    await page.waitForTimeout(4_000);
    timing.pageLoadMs = Date.now() - pageLoadStartedAt;

    await throwIfExpiredTokenVisible(page, dialogMessages);

    const initialText = await page.locator("body").innerText().catch(() => "");
    registrationStage = "certificate-resolve";
    const certificateResolveStartedAt = Date.now();
    const resolvedCertificateResult = await resolvedCertificatePromise;
    timing.certificateResolveMs = Date.now() - certificateResolveStartedAt;
    if (!resolvedCertificateResult.ok) {
      throw resolvedCertificateResult.error;
    }
    const resolvedCertificate = resolvedCertificateResult.value;

    registrationStage = "already-registered-check";
    if (detectAlreadyRegistered(initialText)) {
      registrationOutcome = "already-registered";
      return {
        outcome: "already-registered",
        browserChannel: launched.browserChannel,
        certificateIndex: resolvedCertificate.certificateIndex,
        certificateCn: resolvedCertificate.certificateCn,
        certificateKind: resolvedCertificate.certificateKind,
        serial: resolvedCertificate.serial,
        userDN: resolvedCertificate.userDN,
        targetExpireDate: resolvedCertificate.targetExpireDate,
        localBridgeBaseUrl,
        message: "이미 팝빌 공동인증서가 등록되어 있습니다.",
        timing: buildTiming()
      };
    }

    registrationStage = "section-open";
    const sectionOpenStartedAt = Date.now();
    await openPopbillElectronicTaxCertificateSection(page, dialogMessages);
    await page.waitForTimeout(5_000);
    timing.sectionOpenMs = Date.now() - sectionOpenStartedAt;
    await throwIfExpiredTokenVisible(page, dialogMessages);

    registrationStage = "frame-ready";
    const frameReadyStartedAt = Date.now();
    const childFrame = await waitForPopbillCertificateSelectionFrame(page, dialogMessages);
    timing.frameReadyMs = Date.now() - frameReadyStartedAt;
    await throwIfExpiredTokenVisible(page, dialogMessages);
    registrationStage = "candidate-inspect";
    const candidateInspectStartedAt = Date.now();
    const frameInspection = await waitForPopbillCertificateCandidate({
      page,
      frame: childFrame,
      dialogMessages,
      resolvedCertificate: {
        certificateCn: resolvedCertificate.certificateCn,
        certificateIndex: resolvedCertificate.certificateIndex,
        serial: resolvedCertificate.serial,
        userDN: resolvedCertificate.userDN,
        targetExpireDate: resolvedCertificate.targetExpireDate
      }
    });
    timing.candidateInspectMs = Date.now() - candidateInspectStartedAt;
    if (frameInspection.visibleMatchCount === 0) {
      const artifact = await writePopbillDebugArtifact({
        stage: "no-visible-cn-match",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        dialogMessages,
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
            userDN: resolvedCertificate.userDN,
            targetExpireDate: resolvedCertificate.targetExpireDate
          });
    const selectedCandidate = pickPopbillCertificateCandidate({
      candidates: frameInspection.candidates,
      selectionDetailProbes,
      targetIndex: resolvedCertificate.certificateIndex,
      targetSerial: resolvedCertificate.serial,
      targetUserDN: resolvedCertificate.userDN,
      targetExpireDate: resolvedCertificate.targetExpireDate
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
        dialogMessages,
        errorMessage: "iframe DOM에서 serial/userDN/index와 일치하는 고유 항목을 확인하지 못해 자동 등록을 중단했습니다."
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
    registrationStage = "selection-ready";
    const selectionReadyStartedAt = Date.now();
    const selectionActivationState = await ensurePopbillCertificateSelectionReady(
      childFrame,
      selectedCandidate.selector
    );
    timing.selectionReadyMs = Date.now() - selectionReadyStartedAt;
    if (!isPopbillSelectionReady(selectionActivationState)) {
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        selectionActivationState,
        dialogMessages,
        errorMessage: "팝빌 인증서 선택 후 비밀번호 입력창이 활성화되지 않았습니다."
      });
      throw new Error(
        `팝빌 인증서 선택 후 비밀번호 입력창이 활성화되지 않았습니다. ${formatPopbillDebugArtifactSummary(artifact)}`
      );
    }

    registrationStage = "password-fill";
    try {
      await childFrame.locator("#input_cert_pw").fill(input.certificatePassword);
    } catch (error) {
      const latestSelectionActivationState = await readPopbillSelectionActivationState(childFrame).catch(
        () => selectionActivationState
      );
      const refreshedSelectionActivationState = await readPopbillSelectionActivationState(
        childFrame,
        selectedCandidate.selector
      ).catch(() => latestSelectionActivationState);
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        selectionActivationState: refreshedSelectionActivationState,
        dialogMessages,
        errorMessage:
          error instanceof Error
            ? error.message
            : "팝빌 인증서 비밀번호 입력 단계에서 알 수 없는 오류가 발생했습니다."
      });
      throw new Error(
        `${error instanceof Error ? error.message : "팝빌 인증서 비밀번호 입력 단계에서 알 수 없는 오류가 발생했습니다."} ${formatPopbillDebugArtifactSummary(artifact)}`
      );
    }

    registrationStage = "submit";
    const registrationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/__API_V1__/Taxinvoice/Preference/Certificate"),
      { timeout: 30_000 }
    );
    const submitStartedAt = Date.now();
    await childFrame.locator("#btn_confirm_iframe").click({ force: true });
    try {
      await registrationResponse;
    } catch {
      const frameText = await childFrame.locator("body").innerText().catch(() => "");
      const registrationSignals = [frameText, ...dialogMessages].filter((message) => message.trim() !== "").join("\n");
      const resolvedError =
        extractRegistrationError(registrationSignals) ??
        "팝빌 인증서 등록 요청을 확인하지 못했습니다. 확인 버튼 클릭 후 서버 요청이 전송되지 않았습니다.";
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        dialogMessages,
        errorMessage: resolvedError
      });
      throw new Error(`${resolvedError} ${formatPopbillDebugArtifactSummary(artifact)}`);
    }
    timing.submitMs = Date.now() - submitStartedAt;

    registrationStage = "completion-confirm";
    const completionConfirmStartedAt = Date.now();
    try {
      await waitForPageText(page, "인증서가 등록", 30_000);
    } catch {
      const frameText = await childFrame.locator("body").innerText().catch(() => "");
      const registrationSignals = [frameText, ...dialogMessages].filter((message) => message.trim() !== "").join("\n");
      const resolvedError = extractRegistrationError(registrationSignals) ?? "팝빌 인증서 등록 완료를 확인하지 못했습니다.";
      const artifact = await writePopbillDebugArtifact({
        stage: "registration-confirmation-failed",
        page,
        frame: childFrame,
        resolvedCertificate,
        visibleMatchCount: frameInspection.visibleMatchCount,
        selectionReason: selectedCandidate.reason ?? frameInspection.selectionReason,
        candidates: frameInspection.candidates,
        selectionDetailProbes,
        dialogMessages,
        errorMessage: resolvedError
      });
      throw new Error(`${resolvedError} ${formatPopbillDebugArtifactSummary(artifact)}`);
    }
    timing.completionConfirmMs = Date.now() - completionConfirmStartedAt;

    registrationOutcome = "registered";
    return {
      outcome: "registered",
      browserChannel: launched.browserChannel,
      certificateIndex: resolvedCertificate.certificateIndex,
      certificateCn: resolvedCertificate.certificateCn,
      certificateKind: resolvedCertificate.certificateKind,
      serial: resolvedCertificate.serial,
      userDN: resolvedCertificate.userDN,
      targetExpireDate: resolvedCertificate.targetExpireDate,
      localBridgeBaseUrl,
      message: "팝빌 공동인증서 등록을 완료했습니다.",
      timing: buildTiming()
    };
  } catch (error) {
    if (error instanceof PopbillCertificateRegistrationError) {
      throw error;
    }
    throw new PopbillCertificateRegistrationError(
      error instanceof Error ? error.message : "팝빌 공동인증서 등록 중 알 수 없는 오류가 발생했습니다.",
      {
        stage: registrationStage,
        timing: buildTiming(),
        cause: error
      }
    );
  } finally {
    console.info(
      `[popbill-cert-registration-timing] outcome=${registrationOutcome} stage=${registrationStage} totalMs=${Date.now() - timingStartedAt} browserLaunchMs=${timing.browserLaunchMs} permissionMs=${timing.permissionMs} pageLoadMs=${timing.pageLoadMs} certificateResolveMs=${timing.certificateResolveMs} sectionOpenMs=${timing.sectionOpenMs} frameReadyMs=${timing.frameReadyMs} candidateInspectMs=${timing.candidateInspectMs} selectionReadyMs=${timing.selectionReadyMs} submitMs=${timing.submitMs} completionConfirmMs=${timing.completionConfirmMs}`
    );
    if (context) {
      await context.close().catch(() => undefined);
    }
  }
}
