import type { CertificateBusinessInfoLookupResult, RenewalBridgePreflightProbe, RenewalInfoSnapshot } from "../../types";
import {
  deriveCustomerCertificateKind,
  isCustomerCertificateExpired,
  isIssueCapableCustomerCertificate,
  matchesRenewalCertificate,
  normalizeRenewalCertificateKey
} from "../renewal/customerRenewalCertificateUtils";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";
import type {
  CustomerOnboardingTemplateWorkbookInput,
  CustomerOnboardingWorkbookInput
} from "./customer-onboarding-workbook";

export type CustomerOnboardingResolutionResult = {
  workbook: CustomerOnboardingWorkbookInput;
  resolvedCertificateCount: number;
  skippedCertificateCount: number;
  acceptedBeforeWindowCount: number;
  passwordFailureEntries: Array<{
    key: string;
    label: string;
  }>;
  warnings?: string[];
  errors: string[];
};

type OnboardingPreflightResponse = {
  result: {
    bridge: {
      preflightProbe: RenewalBridgePreflightProbe | null | undefined;
    };
  };
};

type OnboardingPreflightPayload = {
  certificateIndex: number;
  certificateCn?: string | null;
  certificatePassword?: string | null;
};

type OnboardingBusinessInfoLookupPayload = OnboardingPreflightPayload & {
  serial?: string | null;
  userDN?: string | null;
  issuerToName?: string | null;
  usageToName?: string | null;
  oid?: string | null;
  uploadSessionId?: string | null;
  relativePath?: string | null;
};

export type OnboardingPreflightCache = Map<string, OnboardingPreflightResponse>;
export type OnboardingBusinessInfoLookupCache = Map<string, OnboardingBusinessInfoLookupResponse>;

type OnboardingBusinessInfoLookupResponse = {
  result: CertificateBusinessInfoLookupResult;
};

type OnboardingPreflightImportDecision =
  | {
      canImport: true;
      snapshot: RenewalInfoSnapshot;
      acceptedBeforeWindow: boolean;
    }
  | {
      canImport: false;
      failureMessage: string;
      allowManualBusinessInfoFallback?: boolean;
    };

type ResolveElectronicTaxOnboardingTemplateWorkbookArgs = {
  templateWorkbook: CustomerOnboardingTemplateWorkbookInput;
  loadAvailableCertificates: () => Promise<RenewalAgentCertificate[]>;
  resolveSharedPassword: () => Promise<string>;
  certificatePasswordOverrides?: Record<string, string>;
  requestPreflight: (payload: OnboardingPreflightPayload) => Promise<OnboardingPreflightResponse>;
  requestPreflightBatch?: (
    payloads: OnboardingPreflightPayload[],
    options?: {
      onProgress?: (message: string) => void;
    }
  ) => Promise<OnboardingPreflightResponse[]>;
  requestBusinessInfoLookup?: (
    payload: OnboardingBusinessInfoLookupPayload
  ) => Promise<OnboardingBusinessInfoLookupResponse>;
  requestBusinessInfoLookupBatch?: (
    payloads: OnboardingBusinessInfoLookupPayload[],
    options?: {
      onProgress?: (message: string) => void;
    }
  ) => Promise<OnboardingBusinessInfoLookupResponse[]>;
  prepareCertificateForPreflight?: (
    certificate: RenewalAgentCertificate,
    certificatePassword: string
  ) => Promise<RenewalAgentCertificate | null>;
  preflightCache?: OnboardingPreflightCache;
  businessInfoLookupCache?: OnboardingBusinessInfoLookupCache;
  onboardingPreflightConcurrency?: number;
  onboardingPreflightBatchSize?: number;
  onboardingBusinessInfoBatchSize?: number;
  onProgress?: (message: string) => void;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function getRenewalSnapshotAddress(snapshot: RenewalInfoSnapshot): string {
  const baseAddress = snapshot.baseAddress?.trim() ?? "";
  const detailAddress = snapshot.detailAddress?.trim() ?? "";
  if (baseAddress) {
    return baseAddress;
  }

  return [baseAddress, detailAddress].filter(Boolean).join(" ").trim();
}

function buildCustomerCreatePayloadFromRenewalSnapshot(
  certificate: RenewalAgentCertificate,
  snapshot: RenewalInfoSnapshot
) {
  const companyName = snapshot.companyName?.trim() || certificate.cn.trim();
  const customerName = snapshot.ceoName?.trim() || companyName;
  const normalizedAddress = getRenewalSnapshotAddress(snapshot).trim();

  return {
    customerName,
    businessNumber: snapshot.businessNumber?.trim() ?? "",
    corpName: companyName,
    addr: normalizedAddress,
    bizType: snapshot.bizType?.trim() || "전기업",
    bizClass: snapshot.bizClass?.trim() || "태양광발전(자가용PPA)",
    renewalContactMobile: snapshot.contactMobile?.trim() ?? ""
  };
}

function uniqueNonEmptyValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getFirstManualPlantValue(
  plantRows: CustomerOnboardingTemplateWorkbookInput["plants"],
  key:
    | "businessNumber"
    | "customerName"
    | "corpName"
    | "addr"
    | "bizType"
    | "bizClass"
    | "renewalContactMobile"
) {
  return plantRows.map((row) => row[key]?.trim() ?? "").find(Boolean) ?? "";
}

function buildManualOnboardingPayload(
  certificate: RenewalAgentCertificate,
  plantRows: CustomerOnboardingTemplateWorkbookInput["plants"],
  certificateLabel: string
):
  | {
      ok: true;
      businessNumber: string;
      customerName: string;
      corpName: string;
      addr: string;
      bizType: string;
      bizClass: string;
      renewalContactMobile: string;
    }
  | {
      ok: false;
      message: string;
    } {
  const businessNumbers = uniqueNonEmptyValues(
    plantRows.map((row) => digitsOnly(row.businessNumber ?? ""))
  );
  if (businessNumbers.length === 0) {
    return {
      ok: false,
      message: `발전소 시트 (${certificateLabel}): 이 인증서는 자동조회로 사업자번호를 읽을 수 없습니다. 사업자번호와 사업장 주소를 입력한 뒤 다시 진행하세요.`
    };
  }
  if (businessNumbers.length > 1) {
    return {
      ok: false,
      message: `발전소 시트 (${certificateLabel}): 같은 인증서에 서로 다른 사업자번호가 입력되어 있습니다. 고객별로 인증서 행을 나눠 주세요.`
    };
  }

  const businessNumber = businessNumbers[0] ?? "";
  if (businessNumber.length !== 10) {
    return {
      ok: false,
      message: `발전소 시트 (${certificateLabel}): 사업자번호는 숫자 10자리로 입력하세요.`
    };
  }

  const customerName = getFirstManualPlantValue(plantRows, "customerName");
  const corpName = getFirstManualPlantValue(plantRows, "corpName") || customerName || certificate.cn.trim();
  const addr = getFirstManualPlantValue(plantRows, "addr");
  if (!customerName && !corpName) {
    return {
      ok: false,
      message: `발전소 시트 (${certificateLabel}): 대표자명 또는 상호명을 입력하세요.`
    };
  }
  if (!addr) {
    return {
      ok: false,
      message: `발전소 시트 (${certificateLabel}): 사업장 주소를 입력하세요.`
    };
  }

  return {
    ok: true,
    businessNumber,
    customerName: customerName || corpName || certificate.cn.trim(),
    corpName,
    addr,
    bizType: getFirstManualPlantValue(plantRows, "bizType") || "전기업",
    bizClass: getFirstManualPlantValue(plantRows, "bizClass") || "태양광발전(자가용PPA)",
    renewalContactMobile: getFirstManualPlantValue(plantRows, "renewalContactMobile")
  };
}

function normalizeRenewalPreflightDetail(value: string | null | undefined): string {
  const raw = String(value ?? "");
  if (!raw) {
    return "";
  }

  const text = raw
    .replace(/\\n/g, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const curlIndex = text.indexOf("curl:");
  const relevantText = curlIndex >= 0 ? text.slice(curlIndex) : text;
  return relevantText
    .replace(/관리자에게\s*문의(?:하여|해)?\s*주(?:십시요|십시오|세요)\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRenewalCertificateExpireDate(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  const separatedMatch = text.match(/^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})/);
  if (separatedMatch) {
    const month = separatedMatch[2]?.padStart(2, "0") ?? "01";
    const day = separatedMatch[3]?.padStart(2, "0") ?? "01";
    return `${separatedMatch[1]}-${month}-${day}`;
  }

  const timestamp = new Date(text).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const parsedDate = new Date(timestamp);
  const year = parsedDate.getFullYear();
  const month = `${parsedDate.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsedDate.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRenewalAgentCertificateExpireDate(certificate: RenewalAgentCertificate): string | null {
  return normalizeRenewalCertificateExpireDate(certificate.todate || certificate.detailValidateTo || null);
}

function getTodayDateKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRenewalCertificateExpiredDate(value: string | null | undefined): boolean {
  const normalized = normalizeRenewalCertificateExpireDate(value);
  if (!normalized) {
    return false;
  }

  return normalized <= getTodayDateKey();
}

function buildRenewalPreflightFailureMessage(prefix: string, detail: string, fallback: string): string {
  const normalizedDetail = detail.trim();
  const readableDetail =
    normalizedDetail && !normalizedDetail.toLowerCase().startsWith("curl:")
      ? normalizedDetail
      : fallback;
  const clippedDetail = readableDetail.length > 180 ? `${readableDetail.slice(0, 177)}...` : readableDetail;

  return clippedDetail && clippedDetail !== prefix ? `${prefix}: ${clippedDetail}` : prefix;
}

function isRenewalWindowPendingDetail(detail: string): boolean {
  return detail.includes("갱신 가능 기간은") || detail.includes("갱신가능 기간은");
}

function isRenewalWindowEndedDetail(detail: string): boolean {
  return detail.includes("갱신가능 기간이 종료") || detail.includes("갱신 가능 기간이 종료");
}

function isRenewalIssueInfoMissingDetail(detail: string): boolean {
  return detail.includes("발급정보를 찾을수 없습니다") || detail.includes("발급정보를 찾을 수 없습니다");
}

function isRenewalSelectionMissingDetail(detail: string): boolean {
  return detail.includes("선택하신 인증서가 없습니다") || detail.includes("인증서를 선택해 주십시오");
}

function isRenewalPasswordFailureDetail(detail: string): boolean {
  return detail.includes("비밀번호");
}

function isBusinessInfoPasswordFailureDetail(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    detail.includes("비밀번호") ||
    detail.includes("암호") ||
    normalized.includes("password") ||
    normalized.includes("passwd") ||
    normalized.includes("pwd") ||
    normalized.includes("375848960")
  );
}

function isUsableBusinessInfoLookupResult(
  lookup: CertificateBusinessInfoLookupResult | null | undefined
): lookup is CertificateBusinessInfoLookupResult & { businessInfoSnapshot: RenewalInfoSnapshot } {
  return Boolean(lookup?.ok && lookup.businessInfoSnapshot?.businessNumber);
}

function getUploadSessionCertificateReference(certificate: RenewalAgentCertificate): {
  uploadSessionId: string | null;
  relativePath: string | null;
} {
  const record = certificate as RenewalAgentCertificate & {
    uploadSessionId?: unknown;
    relativePath?: unknown;
  };
  const uploadSessionId = typeof record.uploadSessionId === "string" ? record.uploadSessionId.trim() : "";
  const relativePath = typeof record.relativePath === "string" ? record.relativePath.trim() : "";
  return {
    uploadSessionId: uploadSessionId || null,
    relativePath: relativePath || null
  };
}

function buildBusinessInfoLookupFailureMessage(
  lookup: CertificateBusinessInfoLookupResult | null | undefined
): string {
  const detail = normalizeRenewalPreflightDetail(lookup?.error ?? lookup?.message ?? "");
  const label = "사업자정보 조회 실패";
  if (detail) {
    return buildRenewalPreflightFailureMessage(label, detail, "사업자 정보를 읽지 못했습니다.");
  }
  return `${label}: 사업자 정보를 읽지 못했습니다.`;
}

function buildBusinessInfoSupplementWarning(options: {
  certificateLabel: string;
  lookup: CertificateBusinessInfoLookupResult;
  addr: string;
}): string | null {
  if (options.addr.trim()) {
    return null;
  }

  const detail = normalizeRenewalPreflightDetail(options.lookup.error ?? options.lookup.message ?? "");
  if (!detail.includes("홈택스 세적 기본 조회")) {
    return null;
  }

  return `발전소 시트 (${options.certificateLabel}): ${detail}`;
}

function isRenewalBridgeConnectionFailureDetail(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("failed to connect to 127.0.0.1 port") ||
    normalized.includes("could not connect to server") ||
    normalized.includes("connection was reset") ||
    normalized.includes("recv failure")
  );
}

function isRenewalOnlyUnsupportedDetail(detail: string): boolean {
  return /갱신\s*가능한\s*(공동)?인증서가\s*아닙니다/.test(detail);
}

function classifyOnboardingPreflightImportDecision(
  preflightProbe: RenewalBridgePreflightProbe | null | undefined,
  options?: {
    certificateExpireDate?: string | null;
  }
): OnboardingPreflightImportDecision {
  const snapshot = preflightProbe?.renewInfoSnapshot ?? null;
  const detail = normalizeRenewalPreflightDetail(preflightProbe?.error ?? preflightProbe?.message ?? "");

  if (preflightProbe?.ok && snapshot) {
    return {
      canImport: true,
      snapshot,
      acceptedBeforeWindow: false
    };
  }

  if (isRenewalWindowPendingDetail(detail) && snapshot) {
    return {
      canImport: true,
      snapshot,
      acceptedBeforeWindow: true
    };
  }

  if (isRenewalCertificateExpiredDate(options?.certificateExpireDate) || isRenewalWindowEndedDetail(detail)) {
    return {
      canImport: false,
      failureMessage: "인증서 만료"
    };
  }

  if (isRenewalOnlyUnsupportedDetail(detail)) {
    return {
      canImport: false,
      allowManualBusinessInfoFallback: true,
      failureMessage:
        "이 인증서는 갱신 신청 대상이 아니라 SignGate 갱신 조회로 사업자정보를 자동으로 읽을 수 없습니다."
    };
  }

  if (isRenewalIssueInfoMissingDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "발급정보 없음",
        detail,
        "SignGate에서 사업자 발급정보를 찾지 못했습니다."
      )
    };
  }

  if (isRenewalPasswordFailureDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "비밀번호 오류",
        detail,
        "인증서 비밀번호 확인에 실패했습니다."
      )
    };
  }

  if (isRenewalSelectionMissingDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "인증서 선택 실패",
        detail,
        "선택한 공동인증서를 열지 못했습니다."
      )
    };
  }

  if (isRenewalBridgeConnectionFailureDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "브리지 연결 실패",
        detail,
        "SignGate 로컬 포트(14315/14319)에 연결하지 못했습니다."
      )
    };
  }

  if (!snapshot) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage("사전조회 실패", detail, "사업자 정보를 읽지 못했습니다.")
    };
  }

  return {
    canImport: false,
    failureMessage: buildRenewalPreflightFailureMessage("사전조회 실패", detail, "등록 가능 상태를 확인하지 못했습니다.")
  };
}

function getCustomerOnboardingTemplateCertificateLabel(row: {
  certificateIndex: string;
  certificateName: string;
}) {
  return row.certificateName.trim() || (row.certificateIndex.trim() ? `인증서 #${row.certificateIndex.trim()}` : "인증서");
}

function getCustomerOnboardingTemplateCertificateOverrideKey(row: {
  certificateIndex: string;
  certificateName: string;
}) {
  const normalizedIndex = row.certificateIndex.trim();
  if (normalizedIndex) {
    return `index:${normalizedIndex}`;
  }

  return `name:${normalizeRenewalCertificateKey(row.certificateName)}`;
}

function findMatchingRenewalCertificateFromList(
  certificates: RenewalAgentCertificate[],
  selection: {
    certificateIndex: string;
    certificateName: string;
  }
): RenewalAgentCertificate | null {
  return (
    certificates.find((certificate) =>
      matchesRenewalCertificate(certificate, {
        certificateIndex: selection.certificateIndex,
        certificateCn: selection.certificateName
      })
    ) ??
    certificates.find(
      (certificate) =>
        normalizeRenewalCertificateKey(certificate.cn) === normalizeRenewalCertificateKey(selection.certificateName)
    ) ??
    null
  );
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function resolveElectronicTaxOnboardingTemplateWorkbook(
  args: ResolveElectronicTaxOnboardingTemplateWorkbookArgs
): Promise<CustomerOnboardingResolutionResult> {
  const onboardingPreflightConcurrency = args.onboardingPreflightConcurrency ?? 16;
  const onboardingPreflightBatchSize = args.onboardingPreflightBatchSize ?? onboardingPreflightConcurrency;
  const onboardingBusinessInfoBatchSize = args.onboardingBusinessInfoBatchSize ?? 2;
  const sharedPassword = await args.resolveSharedPassword();
  const availableCertificates = await args.loadAvailableCertificates();
  const errors: string[] = [];
  const warnings: string[] = [];
  const passwordFailureEntries: Array<{ key: string; label: string }> = [];
  let acceptedBeforeWindowCount = 0;
  const customersByBusinessNumber = new Map<
    string,
    {
      rowIndex: number;
      customerName: string;
      businessNumber: string;
      corpName: string;
      addr: string;
      bizType: string;
      bizClass: string;
      renewalContactMobile: string;
      memo: string;
      fallbackAddress: string;
      plantRows: Array<{
        rowIndex: number;
        plantName: string;
        matchAddress: string;
      }>;
      certificateRows: CustomerOnboardingWorkbookInput["certificates"];
    }
  >();
  let resolvedCertificateCount = 0;
  let skippedCertificateCount = 0;

  const ensureWorkbookCustomerEntry = (
    businessNumber: string,
    options: {
      rowIndex: number;
      customerName: string;
      corpName: string;
      addr: string;
      bizType: string;
      bizClass: string;
      renewalContactMobile: string;
      fallbackAddress: string;
    }
  ) => {
    const existingEntry = customersByBusinessNumber.get(businessNumber);
    if (existingEntry) {
      if (!existingEntry.renewalContactMobile && options.renewalContactMobile.trim()) {
        existingEntry.renewalContactMobile = options.renewalContactMobile.trim();
      }
      return existingEntry;
    }

    const createdEntry = {
      rowIndex: options.rowIndex,
      customerName: options.customerName.trim(),
      businessNumber,
      corpName: options.corpName.trim(),
      addr: options.addr.trim(),
      bizType: options.bizType.trim(),
      bizClass: options.bizClass.trim(),
      renewalContactMobile: options.renewalContactMobile.trim(),
      memo: "",
      fallbackAddress: options.fallbackAddress.trim(),
      plantRows: [],
      certificateRows: []
    };
    customersByBusinessNumber.set(businessNumber, createdEntry);
    return createdEntry;
  };

  const applyPlantRowsToEntry = (
    plantRows: CustomerOnboardingTemplateWorkbookInput["plants"],
    fallbackPlantName: string,
    entry: ReturnType<typeof ensureWorkbookCustomerEntry>
  ) => {
    for (const plantRow of plantRows) {
      const plantName = plantRow.plantName.trim() || fallbackPlantName.trim() || entry.corpName;
      const matchAddress = plantRow.matchAddress?.trim() || plantRow.addr?.trim() || entry.addr || entry.fallbackAddress;
      entry.plantRows.push({
        rowIndex: plantRow.rowIndex,
        plantName,
        matchAddress
      });
    }
  };

  const plantCertificateGroups = Array.from(
    args.templateWorkbook.plants
      .reduce(
        (groups, plantRow) => {
          const key =
            normalizeRenewalCertificateKey(plantRow.certificateIndex) ||
            `name:${normalizeRenewalCertificateKey(plantRow.certificateName)}`;
          if (!key) {
            errors.push(`발전소 시트 ${plantRow.rowIndex}행: 로컬인증서번호 또는 인증서명(CN)을 확인하세요.`);
            skippedCertificateCount += 1;
            return groups;
          }

          const existingGroup = groups.get(key);
          if (existingGroup) {
            existingGroup.plantRows.push(plantRow);
            return groups;
          }

          groups.set(key, {
            certificateIndex: plantRow.certificateIndex,
            certificateName: plantRow.certificateName,
            plantRows: [plantRow]
          });
          return groups;
        },
        new Map<
          string,
          {
            certificateIndex: string;
            certificateName: string;
            plantRows: CustomerOnboardingTemplateWorkbookInput["plants"];
          }
        >()
      )
      .values()
  );
  type ElectronicTaxSelection = {
    rowIndex: number;
    certificateIndex: string;
    certificateName: string;
    certificateLabel: string;
    certificateOverrideKey: string;
    matchedCertificate: RenewalAgentCertificate;
    effectivePassword: string;
    plantRows: CustomerOnboardingTemplateWorkbookInput["plants"];
    certificatePassword: string;
  };
  type PreparedElectronicTaxSelection = ElectronicTaxSelection & {
    preflightPreparationError?: string;
  };
  const electronicTaxSelections: ElectronicTaxSelection[] = [];

  for (const plantGroup of plantCertificateGroups) {
    const certificateLabel = getCustomerOnboardingTemplateCertificateLabel({
      certificateIndex: plantGroup.certificateIndex,
      certificateName: plantGroup.certificateName
    });
    const certificateOverrideKey = getCustomerOnboardingTemplateCertificateOverrideKey({
      certificateIndex: plantGroup.certificateIndex,
      certificateName: plantGroup.certificateName
    });
    const matchedCertificate = findMatchingRenewalCertificateFromList(availableCertificates, plantGroup);
    if (!matchedCertificate) {
      errors.push(`발전소 시트 (${certificateLabel}): 이 PC에서 같은 발행 가능 공동인증서를 다시 찾지 못했습니다.`);
      skippedCertificateCount += 1;
      continue;
    }

    if (!isIssueCapableCustomerCertificate(matchedCertificate)) {
      errors.push(`발전소 시트 (${certificateLabel}): 전자세금용 또는 기업범용 공동인증서만 고객 등록에 사용할 수 있습니다.`);
      skippedCertificateCount += 1;
      continue;
    }

    const matchedCertificateExpireDate = getRenewalAgentCertificateExpireDate(matchedCertificate);
    if (isCustomerCertificateExpired(matchedCertificateExpireDate)) {
      errors.push(
        `발전소 시트 (${certificateLabel}): 만료된 발행 가능 공동인증서는 고객 등록과 발행 연동 준비에 사용할 수 없습니다. 갱신 후 다시 불러와 주세요.`
      );
      skippedCertificateCount += 1;
      continue;
    }

    const explicitPlantPasswords = Array.from(
      new Set(plantGroup.plantRows.map((row) => row.certificatePassword.trim()).filter(Boolean))
    );
    if (explicitPlantPasswords.length > 1) {
      errors.push(`발전소 시트 (${certificateLabel}): 같은 인증서에 서로 다른 인증서 비밀번호가 입력되어 있습니다.`);
      skippedCertificateCount += 1;
      continue;
    }

    const enteredPlantPassword =
      args.certificatePasswordOverrides?.[certificateOverrideKey]?.trim() ||
      explicitPlantPasswords[0] ||
      "";
    const effectivePassword = enteredPlantPassword || sharedPassword;
    if (!effectivePassword) {
      errors.push(
        `발전소 시트 (${certificateLabel}): 인증서 비밀번호를 입력하거나 시스템 설정의 공통 비밀번호를 먼저 저장하세요.`
      );
      skippedCertificateCount += 1;
      continue;
    }

    electronicTaxSelections.push({
      rowIndex: plantGroup.plantRows[0]?.rowIndex ?? 0,
      certificateIndex: plantGroup.certificateIndex,
      certificateName: plantGroup.certificateName,
      certificateLabel,
      certificateOverrideKey,
      matchedCertificate,
      effectivePassword,
      plantRows: plantGroup.plantRows,
      certificatePassword: effectivePassword
    });
  }

  const preparedElectronicTaxSelections: PreparedElectronicTaxSelection[] = await mapWithConcurrency(
    electronicTaxSelections,
    onboardingPreflightConcurrency,
    async (selection) => {
      if (selection.matchedCertificate.supportsPreflight !== false || !args.prepareCertificateForPreflight) {
        return selection;
      }

      try {
        args.onProgress?.(`공동인증서 ${selection.certificateLabel} 브리지 저장소 준비 중...`);
        const preparedCertificate = await args.prepareCertificateForPreflight(
          selection.matchedCertificate,
          selection.effectivePassword
        );
        const preparedCertificateIndex = Number(preparedCertificate?.index);
        if (
          !preparedCertificate ||
          preparedCertificate.supportsPreflight === false ||
          !Number.isInteger(preparedCertificateIndex) ||
          preparedCertificateIndex <= 0
        ) {
          return selection;
        }

        const uploadReference = getUploadSessionCertificateReference(selection.matchedCertificate);
        return {
          ...selection,
          certificateIndex: String(preparedCertificate.index),
          certificateName: preparedCertificate.cn || selection.certificateName,
          matchedCertificate: {
            ...preparedCertificate,
            ...(uploadReference.uploadSessionId ? { uploadSessionId: uploadReference.uploadSessionId } : {}),
            ...(uploadReference.relativePath ? { relativePath: uploadReference.relativePath } : {})
          }
        };
      } catch (error) {
        return {
          ...selection,
          preflightPreparationError:
            error instanceof Error ? error.message : "공동인증서를 브리지 저장소로 준비하지 못했습니다."
        };
      }
    }
  );

  let completedPreflightCount = 0;
  const totalPreflightCount = preparedElectronicTaxSelections.length;
  const preflightCache = args.preflightCache ?? new Map<string, OnboardingPreflightResponse>();
  const businessInfoLookupCache =
    args.businessInfoLookupCache ?? new Map<string, OnboardingBusinessInfoLookupResponse>();
  const getSelectionCacheKey = (selection: PreparedElectronicTaxSelection) => {
    const { matchedCertificate, effectivePassword } = selection;
    return [
      matchedCertificate.index,
      matchedCertificate.serial ?? "",
      matchedCertificate.userDN ?? "",
      effectivePassword
    ].join("|");
  };
  const buildBusinessInfoLookupPayload = (
    selection: PreparedElectronicTaxSelection
  ): OnboardingBusinessInfoLookupPayload => {
    const uploadReference = getUploadSessionCertificateReference(selection.matchedCertificate);
    return {
      certificateIndex: Number(selection.matchedCertificate.index),
      certificateCn: selection.matchedCertificate.cn || selection.certificateName || null,
      certificatePassword: selection.effectivePassword,
      serial: selection.matchedCertificate.serial ?? null,
      userDN: selection.matchedCertificate.userDN ?? null,
      issuerToName: selection.matchedCertificate.issuerToName ?? null,
      usageToName: selection.matchedCertificate.usageToName ?? null,
      oid: selection.matchedCertificate.oid ?? null,
      uploadSessionId: uploadReference.uploadSessionId,
      relativePath: uploadReference.relativePath
    };
  };
  const requestSelectionBusinessInfoLookup = async (
    selection: PreparedElectronicTaxSelection
  ): Promise<OnboardingBusinessInfoLookupResponse | null> => {
    if (!args.requestBusinessInfoLookup) {
      return null;
    }

    const cacheKey = getSelectionCacheKey(selection);
    let response = businessInfoLookupCache.get(cacheKey) ?? null;
    if (!response) {
      response = await args.requestBusinessInfoLookup(buildBusinessInfoLookupPayload(selection));
      businessInfoLookupCache.set(cacheKey, response);
    }
    return response;
  };
  const getCachedBusinessInfoLookup = (selection: PreparedElectronicTaxSelection) =>
    businessInfoLookupCache.get(getSelectionCacheKey(selection)) ?? null;
  const requestSelectionPreflight = async (
    selection: PreparedElectronicTaxSelection,
    trackProgress = true
  ) => {
    const { matchedCertificate, effectivePassword } = selection;
    const preflightCacheKey = getSelectionCacheKey(selection);
    let response = preflightCache.get(preflightCacheKey) ?? null;
    const cacheHit = response !== null;
    if (!response) {
      if (trackProgress) {
        args.onProgress?.(`공동인증서 사전조회 ${completedPreflightCount}/${totalPreflightCount}건 진행 중...`);
      }
      response = await args.requestPreflight({
        certificateIndex: Number(matchedCertificate.index),
        certificateCn: matchedCertificate.cn || selection.certificateName || null,
        certificatePassword: effectivePassword
      });
      preflightCache.set(preflightCacheKey, response);
    }
    if (trackProgress) {
      completedPreflightCount += 1;
      args.onProgress?.(
        cacheHit
          ? `공동인증서 사전조회 ${completedPreflightCount}/${totalPreflightCount}건 확인 중...`
          : `공동인증서 사전조회 ${completedPreflightCount}/${totalPreflightCount}건 완료`
      );
    }
    return response;
  };

  if (args.requestBusinessInfoLookupBatch) {
    type BatchBusinessInfoLookupRequest = {
      cacheKey: string;
      payload: OnboardingBusinessInfoLookupPayload;
    };
    const pendingBusinessInfoRequests = new Map<string, BatchBusinessInfoLookupRequest>();

    for (const selection of preparedElectronicTaxSelections) {
      if (selection.preflightPreparationError || selection.matchedCertificate.supportsPreflight === false) {
        continue;
      }

      const cacheKey = getSelectionCacheKey(selection);
      if (businessInfoLookupCache.has(cacheKey)) {
        continue;
      }

      pendingBusinessInfoRequests.set(cacheKey, {
        cacheKey,
        payload: buildBusinessInfoLookupPayload(selection)
      });
    }

    const uncachedBusinessInfoRequests = Array.from(pendingBusinessInfoRequests.values());
    if (uncachedBusinessInfoRequests.length > 0) {
      args.onProgress?.(`사업자정보 조회 0/${uncachedBusinessInfoRequests.length}건 진행 중...`);
    }
    let completedBusinessInfoCount = 0;
    for (const chunk of chunkItems(uncachedBusinessInfoRequests, onboardingBusinessInfoBatchSize)) {
      const responses = await args.requestBusinessInfoLookupBatch(chunk.map((request) => request.payload), {
        onProgress: (message) => {
          args.onProgress?.(`사업자정보 조회 ${completedBusinessInfoCount}/${uncachedBusinessInfoRequests.length}건 완료 · ${message}`);
        }
      });
      responses.forEach((response, index) => {
        const request = chunk[index];
        if (request) {
          businessInfoLookupCache.set(request.cacheKey, response);
        }
      });
      completedBusinessInfoCount += responses.length;
      args.onProgress?.(`사업자정보 조회 ${completedBusinessInfoCount}/${uncachedBusinessInfoRequests.length}건 완료`);
    }
  }

  const hasBusinessInfoLookupStrategy = Boolean(args.requestBusinessInfoLookup || args.requestBusinessInfoLookupBatch);

  if (args.requestPreflightBatch && !hasBusinessInfoLookupStrategy) {
    type BatchPreflightRequest = {
      cacheKey: string;
      payload: OnboardingPreflightPayload;
    };
    const pendingBatchRequests = new Map<string, BatchPreflightRequest>();

    for (const selection of preparedElectronicTaxSelections) {
      const { matchedCertificate } = selection;
      if (matchedCertificate.supportsPreflight === false) {
        continue;
      }

      if (isUsableBusinessInfoLookupResult(getCachedBusinessInfoLookup(selection)?.result)) {
        completedPreflightCount += 1;
        continue;
      }

      const preflightCacheKey = getSelectionCacheKey(selection);

      if (preflightCache.has(preflightCacheKey)) {
        completedPreflightCount += 1;
        continue;
      }

      if (!pendingBatchRequests.has(preflightCacheKey)) {
        pendingBatchRequests.set(preflightCacheKey, {
          cacheKey: preflightCacheKey,
          payload: {
            certificateIndex: Number(matchedCertificate.index),
            certificateCn: matchedCertificate.cn || selection.certificateName || null,
            certificatePassword: selection.effectivePassword
          }
        });
      }
    }

    const uncachedRequests = Array.from(pendingBatchRequests.values());
    if (completedPreflightCount > 0) {
      args.onProgress?.(`공동인증서 사전조회 ${completedPreflightCount}/${totalPreflightCount}건 확인 중...`);
    }

    for (const chunk of chunkItems(uncachedRequests, onboardingPreflightBatchSize)) {
      const chunkStart = completedPreflightCount + 1;
      const chunkEnd = completedPreflightCount + chunk.length;
      args.onProgress?.(
        `공동인증서 사전조회 ${completedPreflightCount}/${totalPreflightCount}건 완료 · ${chunkStart}-${chunkEnd}번 묶음 요청 중`
      );
      args.onProgress?.(
        `공동인증서 사전조회 ${completedPreflightCount}/${totalPreflightCount}건 완료 · ${chunkStart}-${chunkEnd}번 응답 대기 중`
      );
      const responses = await args.requestPreflightBatch(chunk.map((request) => request.payload), {
        onProgress: (message) => {
          args.onProgress?.(
            `공동인증서 사전조회 ${completedPreflightCount}/${totalPreflightCount}건 완료 · ${message}`
          );
        }
      });
      responses.forEach((response, index) => {
        const request = chunk[index];
        if (request) {
          preflightCache.set(request.cacheKey, response);
        }
      });
      completedPreflightCount += responses.length;
      args.onProgress?.(
        `공동인증서 사전조회 ${completedPreflightCount}/${totalPreflightCount}건 완료 · ${chunkStart}-${chunkEnd}번 묶음 처리 완료`
      );
    }
  }

  const electronicTaxConcurrency =
    args.requestBusinessInfoLookupBatch || (args.requestPreflightBatch && !hasBusinessInfoLookupStrategy)
      ? Number.MAX_SAFE_INTEGER
      : onboardingPreflightConcurrency;

  const electronicTaxResults = await mapWithConcurrency(
    preparedElectronicTaxSelections,
    electronicTaxConcurrency,
    async (selection) => {
      const { matchedCertificate, certificateLabel, certificateOverrideKey } = selection;
      if (selection.preflightPreparationError) {
        return {
          ok: false as const,
          message: `발전소 시트 (${certificateLabel}): ${selection.preflightPreparationError}`
        };
      }

      const businessInfoLookup =
        getCachedBusinessInfoLookup(selection) ??
        (args.requestBusinessInfoLookupBatch
          ? null
          : await requestSelectionBusinessInfoLookup(selection));
      if (isUsableBusinessInfoLookupResult(businessInfoLookup?.result)) {
        const snapshot = businessInfoLookup.result.businessInfoSnapshot;
        const basePayload = buildCustomerCreatePayloadFromRenewalSnapshot(
          {
            ...matchedCertificate,
            cn: matchedCertificate.cn || selection.certificateName || certificateLabel
          },
          snapshot
        );
        const corpNameOverride = getFirstManualPlantValue(selection.plantRows, "corpName");
        const businessNumber = digitsOnly(basePayload.businessNumber);
        if (!businessNumber) {
          return {
            ok: false as const,
            message: `발전소 시트 (${certificateLabel}): 사업자정보 조회에서 사업자번호를 읽지 못했습니다.`
          };
        }

        return {
          ok: true as const,
          selection,
          matchedCertificate,
          acceptedBeforeWindow: false,
          businessNumber,
          customerName: basePayload.customerName,
          corpName: corpNameOverride || basePayload.corpName,
          addr: basePayload.addr,
          bizType: basePayload.bizType,
          bizClass: basePayload.bizClass,
          renewalContactMobile: basePayload.renewalContactMobile,
          warning: buildBusinessInfoSupplementWarning({
            certificateLabel,
            lookup: businessInfoLookup.result,
            addr: basePayload.addr
          })
        };
      }

      if (matchedCertificate.supportsPreflight === false) {
        const manualPayload = buildManualOnboardingPayload(
          matchedCertificate,
          selection.plantRows,
          certificateLabel
        );
        if (!manualPayload.ok) {
          return {
            ok: false as const,
            message: manualPayload.message
          };
        }
        return {
          ok: true as const,
          selection,
          matchedCertificate,
          acceptedBeforeWindow: false,
          businessNumber: manualPayload.businessNumber,
          customerName: manualPayload.customerName,
          corpName: manualPayload.corpName,
          addr: manualPayload.addr,
          bizType: manualPayload.bizType,
          bizClass: manualPayload.bizClass,
          renewalContactMobile: manualPayload.renewalContactMobile
        };
      }

      if (businessInfoLookup?.result) {
        const businessInfoDetail = businessInfoLookup.result.error ?? businessInfoLookup.result.message ?? "";
        if (businessInfoDetail && isBusinessInfoPasswordFailureDetail(businessInfoDetail)) {
          passwordFailureEntries.push({
            key: certificateOverrideKey,
            label: certificateLabel
          });
        }

        const manualPayload = buildManualOnboardingPayload(
          matchedCertificate,
          selection.plantRows,
          certificateLabel
        );
        if (manualPayload.ok) {
          return {
            ok: true as const,
            selection,
            matchedCertificate,
            acceptedBeforeWindow: false,
            businessNumber: manualPayload.businessNumber,
            customerName: manualPayload.customerName,
            corpName: manualPayload.corpName,
            addr: manualPayload.addr,
            bizType: manualPayload.bizType,
            bizClass: manualPayload.bizClass,
            renewalContactMobile: manualPayload.renewalContactMobile
          };
        }

        return {
          ok: false as const,
          message: `발전소 시트 (${certificateLabel}): ${buildBusinessInfoLookupFailureMessage(businessInfoLookup.result)}`
        };
      }

      const response = await requestSelectionPreflight(selection, !args.requestPreflightBatch);
      const preflightProbe = response.result.bridge.preflightProbe;
      const decision = classifyOnboardingPreflightImportDecision(preflightProbe, {
        certificateExpireDate: getRenewalAgentCertificateExpireDate(matchedCertificate)
      });
      if (!decision.canImport) {
        const businessInfoDetail = businessInfoLookup?.result?.error ?? businessInfoLookup?.result?.message ?? "";
        if (businessInfoDetail && isBusinessInfoPasswordFailureDetail(businessInfoDetail)) {
          passwordFailureEntries.push({
            key: certificateOverrideKey,
            label: certificateLabel
          });
        }
        if (decision.allowManualBusinessInfoFallback) {
          const manualPayload = buildManualOnboardingPayload(
            matchedCertificate,
            selection.plantRows,
            certificateLabel
          );
          if (manualPayload.ok) {
            return {
              ok: true as const,
              selection,
              matchedCertificate,
              acceptedBeforeWindow: false,
              businessNumber: manualPayload.businessNumber,
              customerName: manualPayload.customerName,
              corpName: manualPayload.corpName,
              addr: manualPayload.addr,
              bizType: manualPayload.bizType,
              bizClass: manualPayload.bizClass,
              renewalContactMobile: manualPayload.renewalContactMobile
            };
          }

          return {
            ok: false as const,
            message: businessInfoLookup?.result
              ? `발전소 시트 (${certificateLabel}): ${buildBusinessInfoLookupFailureMessage(businessInfoLookup.result)}`
              : manualPayload.message
          };
        }

        if (decision.failureMessage.includes("비밀번호")) {
          passwordFailureEntries.push({
            key: certificateOverrideKey,
            label: certificateLabel
          });
        }
        return {
          ok: false as const,
          message: `발전소 시트 (${certificateLabel}): ${decision.failureMessage}`
        };
      }
      const snapshot = decision.snapshot;

      const basePayload = buildCustomerCreatePayloadFromRenewalSnapshot(
        {
          ...matchedCertificate,
          cn: matchedCertificate.cn || selection.certificateName || certificateLabel
        },
        snapshot
      );
      const corpNameOverride = getFirstManualPlantValue(selection.plantRows, "corpName");
      const businessNumber = digitsOnly(basePayload.businessNumber);
      if (!businessNumber) {
        return {
          ok: false as const,
          message: `발전소 시트 (${certificateLabel}): 사업자번호를 읽지 못했습니다.`
        };
      }

      return {
        ok: true as const,
        selection,
        matchedCertificate,
        acceptedBeforeWindow: decision.acceptedBeforeWindow,
        businessNumber,
        customerName: basePayload.customerName,
        corpName: corpNameOverride || basePayload.corpName,
        addr: basePayload.addr,
        bizType: basePayload.bizType,
        bizClass: basePayload.bizClass,
        renewalContactMobile: basePayload.renewalContactMobile
      };
    }
  );

  for (const result of electronicTaxResults) {
    if (!result.ok) {
      errors.push(result.message);
      skippedCertificateCount += 1;
      continue;
    }

    if (result.acceptedBeforeWindow) {
      acceptedBeforeWindowCount += 1;
    }
    if (result.warning) {
      warnings.push(result.warning);
    }

    const entry = ensureWorkbookCustomerEntry(result.businessNumber, {
      rowIndex: result.selection.rowIndex,
      customerName: result.customerName,
      corpName: result.corpName,
      addr: result.addr,
      bizType: result.bizType,
      bizClass: result.bizClass,
      renewalContactMobile: result.renewalContactMobile,
      fallbackAddress: result.addr
    });

    applyPlantRowsToEntry(
      result.selection.plantRows,
      result.matchedCertificate.cn?.trim() || result.selection.certificateLabel,
      entry
    );
    const certificateKind = deriveCustomerCertificateKind(result.matchedCertificate);
    entry.certificateRows.push({
      rowIndex: result.selection.rowIndex,
      businessNumber: result.businessNumber,
      certificateKind,
      certificateIndex: String(result.matchedCertificate.index),
      certificateName: result.matchedCertificate.cn?.trim() || result.selection.certificateName.trim() || entry.corpName,
      certificateUsageName: result.matchedCertificate.usageToName.trim() || (certificateKind === "general_business" ? "사업자범용" : "전자세금용"),
      issuerName: result.matchedCertificate.issuerToName.trim(),
      serial: result.matchedCertificate.serial?.trim() || "",
      userDN: result.matchedCertificate.userDN?.trim() || "",
      expireDate: getRenewalAgentCertificateExpireDate(result.matchedCertificate),
      certificatePassword: result.selection.certificatePassword,
      isPrimary: entry.certificateRows.length === 0
    });
    resolvedCertificateCount += 1;
  }

  const workbook: CustomerOnboardingWorkbookInput = {
    customers: [],
    plants: [],
    certificates: []
  };

  for (const entry of customersByBusinessNumber.values()) {
    const defaultMatchAddress = entry.addr.trim() || entry.fallbackAddress.trim();
    const plantRows =
      entry.plantRows.length > 0
        ? entry.plantRows
        : [
          {
            rowIndex: entry.rowIndex,
            plantName: entry.corpName,
            matchAddress: defaultMatchAddress
          }
        ];

    workbook.customers.push({
      rowIndex: entry.rowIndex,
      customerName: entry.customerName,
      businessNumber: entry.businessNumber,
      corpName: entry.corpName,
      addr: entry.addr,
      bizType: entry.bizType,
      bizClass: entry.bizClass,
      renewalContactMobile: entry.renewalContactMobile,
      memo: entry.memo
    });
    workbook.plants.push(
      ...plantRows.map((plantRow, index) => ({
        rowIndex: plantRow.rowIndex || entry.rowIndex * 100 + index,
        businessNumber: entry.businessNumber,
        plantName: plantRow.plantName || entry.corpName,
        matchAddress: plantRow.matchAddress || defaultMatchAddress
      }))
    );
    workbook.certificates.push(...entry.certificateRows);
  }

  return {
    workbook,
    resolvedCertificateCount,
    skippedCertificateCount,
    acceptedBeforeWindowCount,
    passwordFailureEntries,
    warnings,
    errors
  };
}
