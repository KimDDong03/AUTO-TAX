import type { RenewalBridgePreflightProbe, RenewalInfoSnapshot } from "../../types";
import {
  deriveCustomerCertificateKind,
  isCustomerCertificateExpired,
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

export type OnboardingPreflightCache = Map<string, OnboardingPreflightResponse>;

type OnboardingPreflightImportDecision =
  | {
      canImport: true;
      snapshot: RenewalInfoSnapshot;
      acceptedBeforeWindow: boolean;
    }
  | {
      canImport: false;
      failureMessage: string;
    };

type ResolveElectronicTaxOnboardingTemplateWorkbookArgs = {
  templateWorkbook: CustomerOnboardingTemplateWorkbookInput;
  loadAvailableCertificates: () => Promise<RenewalAgentCertificate[]>;
  resolveSharedPassword: () => Promise<string>;
  requestPreflight: (payload: OnboardingPreflightPayload) => Promise<OnboardingPreflightResponse>;
  requestPreflightBatch?: (
    payloads: OnboardingPreflightPayload[],
    options?: {
      onProgress?: (message: string) => void;
    }
  ) => Promise<OnboardingPreflightResponse[]>;
  preflightCache?: OnboardingPreflightCache;
  onboardingPreflightConcurrency?: number;
  onboardingPreflightBatchSize?: number;
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
  return relevantText.replace(/\s+/g, " ").trim();
}

function normalizeRenewalCertificateExpireDate(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] ?? null : null;
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

  return normalized < getTodayDateKey();
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

function isRenewalBridgeConnectionFailureDetail(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("failed to connect to 127.0.0.1 port") ||
    normalized.includes("could not connect to server") ||
    normalized.includes("connection was reset") ||
    normalized.includes("recv failure")
  );
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
  const onboardingPreflightBatchSize = args.onboardingPreflightBatchSize ?? 40;
  const sharedPassword = await args.resolveSharedPassword();
  const availableCertificates = await args.loadAvailableCertificates();
  const errors: string[] = [];
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
      entry.plantRows.push({
        rowIndex: plantRow.rowIndex,
        plantName: plantRow.plantName.trim() || fallbackPlantName.trim() || entry.corpName
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
  const electronicTaxSelections: Array<{
    rowIndex: number;
    certificateIndex: string;
    certificateName: string;
    certificateLabel: string;
    matchedCertificate: RenewalAgentCertificate;
    effectivePassword: string;
    plantRows: CustomerOnboardingTemplateWorkbookInput["plants"];
    certificatePassword: string;
  }> = [];

  for (const plantGroup of plantCertificateGroups) {
    const certificateLabel = getCustomerOnboardingTemplateCertificateLabel({
      certificateIndex: plantGroup.certificateIndex,
      certificateName: plantGroup.certificateName
    });
    const matchedCertificate = findMatchingRenewalCertificateFromList(availableCertificates, plantGroup);
    if (!matchedCertificate) {
      errors.push(`발전소 시트 (${certificateLabel}): 이 PC에서 같은 전자세금용 공동인증서를 다시 찾지 못했습니다.`);
      skippedCertificateCount += 1;
      continue;
    }

    if (deriveCustomerCertificateKind(matchedCertificate) !== "electronic_tax") {
      errors.push(`발전소 시트 (${certificateLabel}): 전자세금용 공동인증서만 고객 등록에 사용할 수 있습니다.`);
      skippedCertificateCount += 1;
      continue;
    }

    if (isCustomerCertificateExpired(matchedCertificate.todate || matchedCertificate.detailValidateTo || null)) {
      errors.push(
        `발전소 시트 (${certificateLabel}): 만료된 전자세금용 공동인증서는 고객 등록과 발행 연동 준비에 사용할 수 없습니다. 갱신 후 다시 불러와 주세요.`
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

    const enteredPlantPassword = explicitPlantPasswords[0] ?? "";
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
      matchedCertificate,
      effectivePassword,
      plantRows: plantGroup.plantRows,
      certificatePassword: effectivePassword
    });
  }

  let completedPreflightCount = 0;
  const totalPreflightCount = electronicTaxSelections.length;
  const preflightCache = args.preflightCache ?? new Map<string, OnboardingPreflightResponse>();
  const requestSelectionPreflight = async (
    selection: (typeof electronicTaxSelections)[number],
    trackProgress = true
  ) => {
    const { matchedCertificate, effectivePassword } = selection;
    const preflightCacheKey = [
      matchedCertificate.index,
      matchedCertificate.serial ?? "",
      matchedCertificate.userDN ?? "",
      effectivePassword
    ].join("|");
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

  if (args.requestPreflightBatch) {
    type BatchPreflightRequest = {
      cacheKey: string;
      payload: OnboardingPreflightPayload;
    };
    const pendingBatchRequests = new Map<string, BatchPreflightRequest>();

    for (const selection of electronicTaxSelections) {
      const { matchedCertificate, effectivePassword } = selection;
      if (matchedCertificate.supportsPreflight === false) {
        continue;
      }

      const preflightCacheKey = [
        matchedCertificate.index,
        matchedCertificate.serial ?? "",
        matchedCertificate.userDN ?? "",
        effectivePassword
      ].join("|");

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
            certificatePassword: effectivePassword
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

  const electronicTaxResults = await mapWithConcurrency(
    electronicTaxSelections,
    args.requestPreflightBatch ? Number.MAX_SAFE_INTEGER : onboardingPreflightConcurrency,
    async (selection) => {
      const { matchedCertificate, certificateLabel } = selection;
      if (matchedCertificate.supportsPreflight === false) {
        return {
          ok: false as const,
          message: `발전소 시트 (${certificateLabel}): 이 인증서는 추가 HDD 경로에서만 확인되어 현재 SignGate 사전조회 자동화를 지원하지 않습니다. 표준 HDD 공동인증서 보관 경로로 옮긴 뒤 다시 시도해 주세요.`
        };
      }
      const response = await requestSelectionPreflight(selection, !args.requestPreflightBatch);
      const preflightProbe = response.result.bridge.preflightProbe;
      const decision = classifyOnboardingPreflightImportDecision(preflightProbe, {
        certificateExpireDate: matchedCertificate.todate || matchedCertificate.detailValidateTo || null
      });
      if (!decision.canImport) {
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
        corpName: basePayload.corpName,
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
    entry.certificateRows.push({
      rowIndex: result.selection.rowIndex,
      businessNumber: result.businessNumber,
      certificateKind: "electronic_tax",
      certificateIndex: String(result.matchedCertificate.index),
      certificateName: result.matchedCertificate.cn?.trim() || result.selection.certificateName.trim() || entry.corpName,
      certificateUsageName: "전자세금용",
      issuerName: result.matchedCertificate.issuerToName.trim(),
      serial: result.matchedCertificate.serial?.trim() || "",
      userDN: result.matchedCertificate.userDN?.trim() || "",
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
              plantName: entry.corpName
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
        matchAddress: defaultMatchAddress
      }))
    );
    workbook.certificates.push(...entry.certificateRows);
  }

  return {
    workbook,
    resolvedCertificateCount,
    skippedCertificateCount,
    acceptedBeforeWindowCount,
    errors
  };
}
