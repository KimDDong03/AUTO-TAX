import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  getLocalRenewalHelperReleaseMetadata,
  getLocalRenewalHelperStatus,
  requestLocalRenewalBridgeProbe
} from "../../local-renewal-helper";
import {
  evaluateLocalRenewalHelperUpgrade,
  type LocalRenewalHelperUpgradeState
} from "../../helper-version";
import type { RenewalAutomationPayload } from "../../types";
import { isCustomerCertificateExpired } from "./customerRenewalCertificateUtils";

export type RenewalAgentSnapshot = RenewalAutomationPayload["agent"];
export type RenewalAgentCertificate = RenewalAgentSnapshot["bridge"]["storageProbe"]["certificates"][number];
export type RenewalJob = RenewalAutomationPayload["jobs"][number];
export type RenewalAssistantAlertTone = "default" | "warn" | "danger" | "success";
export type ShowRenewalAssistantAlert = (
  message: string,
  options?: { title?: string; tone?: RenewalAssistantAlertTone }
) => Promise<void>;

export type CustomerRenewalAssistantData = {
  agentOnline: boolean;
  helperVersion: string | null;
  helperMessage: string;
  helperCheckedAt: string | null;
  latestVersion: string | null;
  minSupportedVersion: string | null;
  releaseDownloadUrl: string | null;
  releaseReleasedAt: string | null;
  upgradeState: LocalRenewalHelperUpgradeState;
  upgradeMessage: string | null;
  jobs: RenewalJob[];
  certificates: RenewalAgentCertificate[];
};

export type UseRenewalAssistantStateArgs = {
  activeTab: string;
  isSettingsHelperActive: boolean;
  activeOrganizationId: string | null;
  activeOrganizationRole: string | null | undefined;
  defaultRenewalHelperDownloadUrl: string;
  showAlert?: ShowRenewalAssistantAlert;
};

let localRenewalJobSeed = Date.now();

function nextLocalRenewalJobId(): number {
  localRenewalJobSeed += 1;
  return localRenewalJobSeed;
}

export function buildLocalRenewalBridgeJob(
  result: RenewalAutomationPayload["jobs"][number]["result"],
  visibleCertificateCount?: number,
  visibleCertificateLabel = "전자세금용 공동인증서",
  emptyVisibleCertificateMessage = "전자세금용 공동인증서를 찾지 못했습니다."
): RenewalJob {
  const requestedAt = new Date().toISOString();
  const storageProbe = result?.bridge.storageProbe;
  const storageOk = storageProbe?.ok === true;
  const hasVisibleCertificateCount = typeof visibleCertificateCount === "number";
  const summary = !storageOk
    ? "공동인증서 불러오기에 실패했습니다."
    : hasVisibleCertificateCount
      ? visibleCertificateCount > 0
        ? `${visibleCertificateLabel} ${visibleCertificateCount}건을 불러왔습니다.`
        : emptyVisibleCertificateMessage
      : `공동인증서 ${storageProbe.certificateCount}건을 불러왔습니다.`;

  return {
    id: nextLocalRenewalJobId(),
    type: "bridge-probe",
    status: storageOk ? "completed" : "failed",
    customerId: null,
    customerName: "공동인증서 목록",
    certificateIndex: null,
    certificateCn: null,
    requestedAt,
    claimedAt: requestedAt,
    finishedAt: requestedAt,
    requestedBy: "localhost-helper",
    claimedBy: "localhost-helper",
    summary,
    error: storageOk ? null : storageProbe?.error ?? result?.notes[0] ?? "공동인증서 불러오기에 실패했습니다.",
    result
  };
}

export function buildLocalRenewalPreflightJob(
  certificate: RenewalAgentCertificate,
  result: RenewalAutomationPayload["jobs"][number]["result"]
): RenewalJob {
  const requestedAt = new Date().toISOString();
  const preflightProbe = result?.bridge.preflightProbe;
  const certificateLabel = certificate.cn || `인증서 #${certificate.index}`;
  const summary =
    preflightProbe?.ok === true
      ? preflightProbe.renewInfoSnapshot
        ? `${certificateLabel} 고객 초안 정보를 읽었습니다.`
        : `${certificateLabel} 고객 초안 정보를 읽지 못했습니다.`
      : `${certificateLabel} 정보 읽기에 실패했습니다.`;
  const error =
    preflightProbe?.ok === true
      ? null
      : preflightProbe?.error ??
        result?.bridge.selectionProbe.error ??
        preflightProbe?.message ??
        "공동인증서 정보 읽기에 실패했습니다.";

  return {
    id: nextLocalRenewalJobId(),
    type: "renewal-preflight",
    status: preflightProbe?.ok === true ? "completed" : "failed",
    customerId: null,
    customerName: null,
    certificateIndex: Number(certificate.index),
    certificateCn: certificate.cn || null,
    requestedAt,
    claimedAt: requestedAt,
    finishedAt: requestedAt,
    requestedBy: "localhost-helper",
    claimedBy: "localhost-helper",
    summary,
    error,
    result
  };
}

export function getCustomerRenewalAssistantReleaseMetadata(
  current?: CustomerRenewalAssistantData | null
) {
  if (!current?.latestVersion || !current.minSupportedVersion || !current.releaseDownloadUrl || !current.releaseReleasedAt) {
    return null;
  }

  return {
    latestVersion: current.latestVersion,
    minSupportedVersion: current.minSupportedVersion,
    downloadUrl: current.releaseDownloadUrl,
    releasedAt: current.releaseReleasedAt
  };
}

export function buildCustomerRenewalAssistant(
  options: {
    current?: CustomerRenewalAssistantData | null;
    status?: {
      online: boolean;
      version: string | null;
      message: string;
    };
    helperVersion?: string | null;
    helperMessage?: string;
    jobs?: RenewalJob[];
    certificates?: RenewalAgentCertificate[];
    releaseMetadata?: {
      latestVersion: string;
      minSupportedVersion: string;
      downloadUrl: string;
      releasedAt: string;
    } | null;
    defaultRenewalHelperDownloadUrl: string;
  }
): CustomerRenewalAssistantData {
  const metadata = options.releaseMetadata ?? null;
  const helperVersion = options.helperVersion ?? options.status?.version ?? options.current?.helperVersion ?? null;
  const upgrade = evaluateLocalRenewalHelperUpgrade(helperVersion, metadata);

  return {
    agentOnline: options.status?.online ?? options.current?.agentOnline ?? false,
    helperVersion,
    helperMessage:
      options.helperMessage ??
      options.status?.message ??
      options.current?.helperMessage ??
      "공동인증서를 읽어 AT 헬퍼 연결을 확인하세요.",
    helperCheckedAt: new Date().toISOString(),
    latestVersion: metadata?.latestVersion ?? null,
    minSupportedVersion: metadata?.minSupportedVersion ?? null,
    releaseDownloadUrl: metadata?.downloadUrl || options.defaultRenewalHelperDownloadUrl,
    releaseReleasedAt: metadata?.releasedAt ?? null,
    upgradeState: upgrade.upgradeState,
    upgradeMessage: upgrade.upgradeMessage,
    jobs: options.jobs ?? options.current?.jobs ?? [],
    certificates: options.certificates ?? options.current?.certificates ?? []
  };
}

export function buildIdleCustomerRenewalAssistant(
  current: CustomerRenewalAssistantData | null | undefined,
  defaultRenewalHelperDownloadUrl: string
): CustomerRenewalAssistantData {
  return current
    ? {
        ...current,
        helperMessage: current.helperMessage || "공동인증서를 읽어 AT 헬퍼 연결을 확인하세요."
      }
    : {
        agentOnline: false,
        helperVersion: null,
        helperMessage: "공동인증서를 읽어 AT 헬퍼 연결을 확인하세요.",
        helperCheckedAt: null,
        latestVersion: null,
        minSupportedVersion: null,
        releaseDownloadUrl: defaultRenewalHelperDownloadUrl,
        releaseReleasedAt: null,
        upgradeState: "unknown",
        upgradeMessage: null,
        jobs: [],
        certificates: []
      };
}

export function useRenewalAssistantState({
  activeTab,
  isSettingsHelperActive,
  activeOrganizationId,
  activeOrganizationRole,
  defaultRenewalHelperDownloadUrl,
  showAlert
}: UseRenewalAssistantStateArgs) {
  const [customerRenewalAssistant, setCustomerRenewalAssistant] = useState<CustomerRenewalAssistantData | null>(null);
  const customerRenewalAutoLoadedRef = useRef(false);
  const customerRenewalAutoLoadedOrganizationRef = useRef<string | null>(null);
  const assistantOrganizationRef = useRef<string | null>(null);

  const canUseCustomerRenewalAssistant = Boolean(activeOrganizationId) && activeOrganizationRole !== "viewer";

  const loadCustomerRenewalAssistantSummary = useCallback(async (options?: { force?: boolean }) => {
    if (!canUseCustomerRenewalAssistant) {
      setCustomerRenewalAssistant(null);
      return;
    }

    const [status, releaseMetadata] = await Promise.all([
      getLocalRenewalHelperStatus({ force: options?.force }),
      getLocalRenewalHelperReleaseMetadata()
    ]);
    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status,
        releaseMetadata,
        defaultRenewalHelperDownloadUrl
      })
    );
  }, [canUseCustomerRenewalAssistant, defaultRenewalHelperDownloadUrl]);

  const refreshCustomerRenewalAssistant = useCallback(async () => {
    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        helperMessage: "AT 헬퍼 연결을 확인하는 중입니다...",
        defaultRenewalHelperDownloadUrl
      })
    );

    const [status, releaseMetadata] = await Promise.all([
      getLocalRenewalHelperStatus({ force: true }),
      getLocalRenewalHelperReleaseMetadata()
    ]);

    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status,
        releaseMetadata,
        defaultRenewalHelperDownloadUrl
      })
    );
  }, [defaultRenewalHelperDownloadUrl]);

  const ensureLocalRenewalHelperActionAllowed = useCallback(
    (actionLabel: string) => {
      if (!customerRenewalAssistant?.agentOnline) {
        throw new Error(
          `${actionLabel} 전에 AT 헬퍼를 먼저 실행하세요. AT 헬퍼를 실행한 뒤 상태를 다시 확인하세요.`
        );
      }

      if (
        customerRenewalAssistant.upgradeState !== "upgrade-required" &&
        customerRenewalAssistant.upgradeState !== "upgrade-available"
      ) {
        return;
      }

      const helperVersionLabel = customerRenewalAssistant.helperVersion ? `v${customerRenewalAssistant.helperVersion}` : "현재 버전";
      throw new Error(
        `${actionLabel} 전에 AT 헬퍼를 다시 설치하세요. ${
          customerRenewalAssistant.upgradeMessage ?? `${helperVersionLabel}은(는) 지원되지 않습니다.`
        } 설치 파일을 다시 실행한 뒤 상태를 확인하세요.`
      );
    },
    [customerRenewalAssistant]
  );

  const syncCustomerRenewalCertificates = useCallback(
    async (options?: { showAlert?: boolean; skipReadinessCheck?: boolean }) => {
      if (!options?.skipReadinessCheck) {
        ensureLocalRenewalHelperActionAllowed("공동인증서 읽기");
      }

      setCustomerRenewalAssistant((prev) =>
        buildCustomerRenewalAssistant({
          current: prev,
          helperMessage: "공동인증서 저장소를 읽는 중입니다. 완료되면 건수가 표시됩니다...",
          defaultRenewalHelperDownloadUrl
        })
      );

      const showLoadAlert = options?.showAlert ?? true;
      const response = await requestLocalRenewalBridgeProbe();
      const allCertificates = response.result.bridge.storageProbe.ok ? response.result.bridge.storageProbe.certificates : [];
      const availableCertificates = allCertificates.filter(
        (certificate) => !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
      );
      const bridgeJob = buildLocalRenewalBridgeJob(
        response.result,
        availableCertificates.length,
        "사용 가능한 공동인증서",
        "만료되지 않은 공동인증서를 찾지 못했습니다."
      );
      const helperMessage = bridgeJob.error ?? bridgeJob.summary;

      setCustomerRenewalAssistant((prev) =>
        buildCustomerRenewalAssistant({
          current: prev,
          status: {
            online: true,
            version: response.version,
            message: helperMessage
          },
          helperVersion: response.version,
          helperMessage,
          jobs: [bridgeJob, ...(prev?.jobs ?? [])],
          certificates: allCertificates,
          releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
          defaultRenewalHelperDownloadUrl
        })
      );

      if (showLoadAlert && showAlert) {
        const alertMessage =
          response.result.bridge.storageProbe.ok && availableCertificates.length > 0
            ? `사용 가능한 공동인증서 ${availableCertificates.length}건을 불러왔습니다.\n만료된 인증서는 목록에서 제외됩니다.`
            : response.result.bridge.storageProbe.ok
              ? "만료되지 않은 공동인증서를 찾지 못했습니다.\n만료된 인증서는 목록에서 제외됩니다."
              : bridgeJob.error ?? "공동인증서를 불러오지 못했습니다.";
        await showAlert(
          alertMessage,
          {
            title: "공동인증서 읽기",
            tone: availableCertificates.length > 0 ? "success" : response.result.bridge.storageProbe.ok ? "warn" : "danger"
          }
        );
      }

      return allCertificates;
    },
    [defaultRenewalHelperDownloadUrl, ensureLocalRenewalHelperActionAllowed, showAlert]
  );

  const loadCustomerRenewalCertificates = useCallback(async () => {
    await syncCustomerRenewalCertificates({ showAlert: true });
  }, [syncCustomerRenewalCertificates]);

  useEffect(() => {
    if (!canUseCustomerRenewalAssistant || !activeOrganizationId) {
      assistantOrganizationRef.current = null;
      customerRenewalAutoLoadedRef.current = false;
      customerRenewalAutoLoadedOrganizationRef.current = null;
      setCustomerRenewalAssistant(null);
      return;
    }

    if (assistantOrganizationRef.current !== activeOrganizationId) {
      assistantOrganizationRef.current = activeOrganizationId;
      customerRenewalAutoLoadedRef.current = false;
      customerRenewalAutoLoadedOrganizationRef.current = activeOrganizationId;
      setCustomerRenewalAssistant((prev) =>
        buildIdleCustomerRenewalAssistant(prev, defaultRenewalHelperDownloadUrl)
      );
      return;
    }

    setCustomerRenewalAssistant((prev) =>
      prev ?? buildIdleCustomerRenewalAssistant(prev, defaultRenewalHelperDownloadUrl)
    );
  }, [activeOrganizationId, canUseCustomerRenewalAssistant, defaultRenewalHelperDownloadUrl]);

  useEffect(() => {
    if (activeTab !== "home") {
      return;
    }

    const hasPendingRenewalJobs = customerRenewalAssistant?.jobs.some(
      (job) => job.status === "queued" || job.status === "claimed"
    );
    if (!hasPendingRenewalJobs) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadCustomerRenewalAssistantSummary().catch(() => undefined);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [activeTab, customerRenewalAssistant, loadCustomerRenewalAssistantSummary]);

  useEffect(() => {
    if (activeTab !== "settings" && activeTab !== "certificates") {
      customerRenewalAutoLoadedRef.current = false;
      customerRenewalAutoLoadedOrganizationRef.current = null;
      return;
    }

    if (!canUseCustomerRenewalAssistant || !activeOrganizationId) {
      customerRenewalAutoLoadedRef.current = false;
      customerRenewalAutoLoadedOrganizationRef.current = null;
      return;
    }

    if (customerRenewalAutoLoadedOrganizationRef.current !== activeOrganizationId) {
      customerRenewalAutoLoadedOrganizationRef.current = activeOrganizationId;
      customerRenewalAutoLoadedRef.current = false;
    }

    if (!customerRenewalAssistant || customerRenewalAutoLoadedRef.current) {
      return;
    }

    customerRenewalAutoLoadedRef.current = true;
    void (async () => {
      if (!customerRenewalAssistant.agentOnline) {
        setCustomerRenewalAssistant((prev) =>
          prev
            ? {
                ...prev,
                helperMessage: "AT 헬퍼 연결을 확인하는 중입니다..."
              }
            : prev
        );
        await loadCustomerRenewalAssistantSummary();
      }
    })().catch(() => {
      customerRenewalAutoLoadedRef.current = false;
    });
  }, [
    activeOrganizationId,
    activeTab,
    canUseCustomerRenewalAssistant,
    customerRenewalAssistant,
    loadCustomerRenewalAssistantSummary
  ]);

  useEffect(() => {
    const shouldRefreshHelperSummary =
      activeTab === "home" || activeTab === "certificates" || (activeTab === "settings" && isSettingsHelperActive);

    if (!shouldRefreshHelperSummary || !canUseCustomerRenewalAssistant || customerRenewalAssistant?.helperCheckedAt) {
      return;
    }

    void loadCustomerRenewalAssistantSummary().catch(() => undefined);
  }, [
    activeTab,
    canUseCustomerRenewalAssistant,
    customerRenewalAssistant?.helperCheckedAt,
    isSettingsHelperActive,
    loadCustomerRenewalAssistantSummary
  ]);

  const customerRenewalAssistantJobs = customerRenewalAssistant?.jobs ?? [];
  const customerRenewalAssistantAllCertificates = customerRenewalAssistant?.certificates ?? [];
  const customerRenewalAssistantCertificates = useMemo(
    () =>
      customerRenewalAssistantAllCertificates.filter(
        (certificate) =>
          certificate.usageToName
            .trim()
            .toLocaleLowerCase("ko-KR")
            .replace(/\s+/g, "")
            .includes("전자세금") &&
          !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
      ),
    [customerRenewalAssistantAllCertificates]
  );

  const helperUpgradeRequired = customerRenewalAssistant?.upgradeState === "upgrade-required";
  const helperUpgradeAvailable = customerRenewalAssistant?.upgradeState === "upgrade-available";
  const helperVersionMismatch = helperUpgradeRequired || helperUpgradeAvailable;
  const helperActionBlockedReason = customerRenewalAssistant?.upgradeMessage
    ? `${customerRenewalAssistant.upgradeMessage} 설치 파일을 다시 실행한 뒤 상태를 확인하세요.`
    : "지원되지 않는 AT 헬퍼 버전입니다. 새 버전을 설치한 뒤 상태를 확인하세요.";
  const helperReady =
    Boolean(customerRenewalAssistant?.agentOnline) &&
    customerRenewalAssistantAllCertificates.some(
      (certificate) => !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
    ) &&
    !helperVersionMismatch;
  const renewalHelperDownloadUrl =
    customerRenewalAssistant?.releaseDownloadUrl || defaultRenewalHelperDownloadUrl;

  return {
    canUseCustomerRenewalAssistant,
    customerRenewalAssistant,
    setCustomerRenewalAssistant: setCustomerRenewalAssistant as Dispatch<
      SetStateAction<CustomerRenewalAssistantData | null>
    >,
    customerRenewalAssistantJobs,
    customerRenewalAssistantAllCertificates,
    customerRenewalAssistantCertificates,
    helperReady,
    helperUpgradeRequired,
    helperUpgradeAvailable,
    helperActionBlockedReason,
    renewalHelperDownloadUrl,
    refreshCustomerRenewalAssistant,
    syncCustomerRenewalCertificates,
    loadCustomerRenewalCertificates,
    ensureLocalRenewalHelperActionAllowed
  };
}
