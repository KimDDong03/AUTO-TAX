import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { Customer, CustomerCertificateKind } from "../../types";

type CertificateTabItem = {
  key: string;
  certificateIndex: string;
  certificateCn: string;
  certificateKind: CustomerCertificateKind;
  certificateUsage: string;
  issuerName: string;
  certificateExpireDate: string | null;
  linkedCertificateId: number | null;
  linkedCustomerId: number | null;
  linkedCustomerLabel: string | null;
  linkSource: "auto" | "manual" | null;
  suggestedCustomerId: number | null;
  suggestedCustomerLabel: string | null;
  suggestionCount: number;
  statusText: string;
  statusTone: "success" | "warn" | "danger" | "default";
  paymentAmount: string | null;
  canOpenPayment: boolean;
};

export type CertificatesTabModel = {
  customers: Customer[];
  busyKey: string | null;
  canUseCustomerRenewalAssistant: boolean;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalAssistantUpgradeState: "unknown" | "up-to-date" | "upgrade-available" | "upgrade-required";
  customerRenewalAssistantUpgradeMessage: string | null;
  customerRenewalAssistantLatestVersion: string | null;
  customerRenewalAssistantMinSupportedVersion: string | null;
  renewalHelperDownloadUrl: string;
  customerRenewalLoadedCertificateCount: number;
  certificateItems: CertificateTabItem[];
  runRefreshCustomerRenewalAssistant: () => Promise<void>;
  runLoadCustomerRenewalCertificates: () => Promise<void>;
  onLinkCustomerCertificate: (certificateIndex: string, customerId: number) => Promise<void>;
  onUnlinkCustomerCertificate: (certificateId: number) => Promise<void>;
  onPrepareCustomerCertificateRenewal: (certificateIndex: string, options?: { showAlert?: boolean }) => Promise<void>;
  onOpenCustomerCertificatePayment: (certificateIndex: string, options?: { showAlert?: boolean }) => Promise<void>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatCertificateExpireDate: (value: string | null) => string;
};

function getCertificateKindLabel(kind: CustomerCertificateKind): string {
  switch (kind) {
    case "electronic_tax":
      return "전자세금";
    case "general_personal":
      return "개인범용";
    case "general_business":
      return "사업자범용";
    default:
      return "기타";
  }
}

function isDateWithinDays(value: string | null, days: number) {
  if (!value) return false;
  const targetTime = new Date(value).getTime();
  if (!Number.isFinite(targetTime)) return false;
  const now = Date.now();
  const diff = targetTime - now;
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function getCertificateExpireTime(value: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const targetTime = new Date(value).getTime();
  return Number.isFinite(targetTime) ? targetTime : Number.MAX_SAFE_INTEGER;
}

type CertificateStatusBadgeTone = "success" | "warn" | "danger" | "default";

type CertificatesTabProps = {
  model: CertificatesTabModel;
};

export function CertificatesTab({ model: props }: CertificatesTabProps) {
  const assistantBusyKey =
    props.busyKey && (props.busyKey.startsWith("customer-renewal-") || props.busyKey.startsWith("customer-certificate-"))
      ? props.busyKey
      : null;
  const isRefreshingRenewalAssistant = assistantBusyKey === "customer-renewal-refresh";
  const isLoadingRenewalCertificates = assistantBusyKey === "customer-renewal-bridge-probe";
  const activeStartCertificateIndex =
    assistantBusyKey && assistantBusyKey.startsWith("customer-certificate-prepare-")
      ? assistantBusyKey.slice("customer-certificate-prepare-".length)
      : assistantBusyKey && assistantBusyKey.startsWith("customer-certificate-open-payment-")
        ? assistantBusyKey.slice("customer-certificate-open-payment-".length)
        : null;
  const activeLinkCertificateIndex =
    assistantBusyKey && assistantBusyKey.startsWith("customer-certificate-link-")
      ? assistantBusyKey.slice("customer-certificate-link-".length)
      : null;
  const activeUnlinkCertificateId =
    assistantBusyKey && assistantBusyKey.startsWith("customer-certificate-unlink-")
      ? Number(assistantBusyKey.slice("customer-certificate-unlink-".length))
      : null;
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Record<string, string>>({});
  const [selectedManagedCustomerIds, setSelectedManagedCustomerIds] = useState<Record<number, boolean>>({});
  const [focusedUnlinkedCertificateKey, setFocusedUnlinkedCertificateKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<
    "action_needed" | "all" | "prepare_needed" | "payment_ready" | "expiring_30" | "missing_general" | "missing_electronic"
  >("action_needed");
  const [queueNotice, setQueueNotice] = useState("");
  const [batchPrepareState, setBatchPrepareState] = useState<{
    active: boolean;
    total: number;
    completed: number;
    success: number;
    failed: number;
    currentCertificateCn: string | null;
  }>({
    active: false,
    total: 0,
    completed: 0,
    success: 0,
    failed: 0,
    currentCertificateCn: null
  });
  const batchPrepareStopRequestedRef = useRef(false);
  const batchPreparePromiseRef = useRef<Promise<void> | null>(null);
  const helperUpgradeRequired = props.customerRenewalAssistantUpgradeState === "upgrade-required";
  const helperVersionMismatch =
    props.customerRenewalAssistantUpgradeState === "upgrade-required" ||
    props.customerRenewalAssistantUpgradeState === "upgrade-available";
  const helperUpgradeNotice =
    props.customerRenewalAssistantUpgradeState === "upgrade-required"
      ? {
          title: "AT 헬퍼 재설치 필요",
          message: props.customerRenewalAssistantUpgradeMessage
        }
      : props.customerRenewalAssistantUpgradeState === "upgrade-available"
        ? {
            title: "AT 헬퍼 업데이트 권장",
            message: props.customerRenewalAssistantUpgradeMessage
          }
        : null;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const customerOptions = useMemo(
    () =>
      props.customers
        .slice()
        .sort((left, right) => left.customerName.localeCompare(right.customerName, "ko"))
        .map((customer) => ({
          id: customer.id,
          label: `${customer.customerName} · ${customer.corpName}`
        })),
    [props.customers]
  );
  const unlinkedCount = props.certificateItems.filter((item) => item.linkedCustomerId === null).length;
  const linkedCustomerRows = useMemo(() => {
    const grouped = new Map<
      number,
      {
        customer: Customer;
        electronicTaxCertificates: CertificateTabItem[];
        generalCertificates: CertificateTabItem[];
      }
    >();

    for (const item of props.certificateItems) {
      if (item.linkedCustomerId === null) {
        continue;
      }

      const customer = props.customers.find((entry) => entry.id === item.linkedCustomerId);
      if (!customer) {
        continue;
      }

      const entry =
        grouped.get(customer.id) ??
        {
          customer,
          electronicTaxCertificates: [],
          generalCertificates: []
        };

      if (!grouped.has(customer.id)) {
        grouped.set(customer.id, entry);
      }

      if (item.certificateKind === "electronic_tax") {
        entry.electronicTaxCertificates.push(item);
      } else {
        entry.generalCertificates.push(item);
      }
    }

    return Array.from(grouped.values())
      .map((entry) => {
        const sortCertificates = (items: CertificateTabItem[]) =>
          items
            .slice()
            .sort((left, right) => getCertificateExpireTime(left.certificateExpireDate) - getCertificateExpireTime(right.certificateExpireDate));
        const electronicTaxCertificates = sortCertificates(entry.electronicTaxCertificates);
        const generalCertificates = sortCertificates(entry.generalCertificates);
        const allCertificates = [...electronicTaxCertificates, ...generalCertificates];
        const hasElectronicTax = electronicTaxCertificates.length > 0;
        const hasGeneral = generalCertificates.length > 0;
        const hasPaymentReady = allCertificates.some((certificate) => certificate.canOpenPayment);
        const hasPrepareNeeded = allCertificates.some((certificate) => !certificate.canOpenPayment);
        const hasExpiringSoon = allCertificates.some((certificate) => isDateWithinDays(certificate.certificateExpireDate, 30));
        const nearestExpireTime = allCertificates.reduce(
          (soonest, certificate) => Math.min(soonest, getCertificateExpireTime(certificate.certificateExpireDate)),
          Number.MAX_SAFE_INTEGER
        );
        const statusPriority = hasPaymentReady ? 0 : hasPrepareNeeded ? 1 : hasExpiringSoon ? 2 : !hasElectronicTax ? 3 : !hasGeneral ? 4 : 5;

        return {
          ...entry,
          electronicTaxCertificates,
          generalCertificates,
          hasElectronicTax,
          hasGeneral,
          hasPaymentReady,
          hasPrepareNeeded,
          hasExpiringSoon,
          nearestExpireTime,
          statusPriority
        };
      })
      .sort((left, right) => {
        if (left.statusPriority !== right.statusPriority) {
          return left.statusPriority - right.statusPriority;
        }
        if (left.nearestExpireTime !== right.nearestExpireTime) {
          return left.nearestExpireTime - right.nearestExpireTime;
        }
        return left.customer.customerName.localeCompare(right.customer.customerName, "ko");
      });
  }, [props.certificateItems, props.customers]);
  const unlinkedCertificates = useMemo(
    () =>
      props.certificateItems
        .filter((item) => item.linkedCustomerId === null)
        .slice()
        .sort((left, right) => {
          if (Boolean(left.suggestedCustomerLabel) !== Boolean(right.suggestedCustomerLabel)) {
            return left.suggestedCustomerLabel ? -1 : 1;
          }
          if (left.certificateKind !== right.certificateKind) {
            return left.certificateKind === "electronic_tax" ? -1 : 1;
          }
          return getCertificateExpireTime(left.certificateExpireDate) - getCertificateExpireTime(right.certificateExpireDate);
        }),
    [props.certificateItems]
  );
  const normalizedSearchQuery = deferredSearchQuery.trim().toLocaleLowerCase("ko-KR");

  const matchesSearch = (...values: Array<string | null | undefined>) =>
    normalizedSearchQuery === "" ||
    values.some((value) => String(value ?? "").toLocaleLowerCase("ko-KR").includes(normalizedSearchQuery));

  const filteredLinkedCustomerRows = linkedCustomerRows.filter((row) => {
    const allCertificates = [...row.electronicTaxCertificates, ...row.generalCertificates];
    const searchMatched = matchesSearch(
      row.customer.customerName,
      row.customer.corpName,
      row.customer.businessNumber,
      ...allCertificates.map((certificate) => certificate.certificateCn)
    );

    if (!searchMatched) {
      return false;
    }

    switch (customerFilter) {
      case "action_needed":
        return row.hasPaymentReady || row.hasPrepareNeeded || row.hasExpiringSoon || !row.hasGeneral || !row.hasElectronicTax;
      case "prepare_needed":
        return row.hasPrepareNeeded;
      case "payment_ready":
        return row.hasPaymentReady;
      case "expiring_30":
        return row.hasExpiringSoon;
      case "missing_general":
        return !row.hasGeneral;
      case "missing_electronic":
        return !row.hasElectronicTax;
      default:
        return true;
    }
  });

  const filteredUnlinkedCertificates = unlinkedCertificates.filter((item) =>
    matchesSearch(item.certificateCn, item.issuerName, item.suggestedCustomerLabel, item.certificateUsage)
  );
  const unlinkedSuggestionMap = useMemo(() => {
    const grouped = new Map<number, { electronic: number; general: number; total: number }>();

    for (const item of unlinkedCertificates) {
      if (item.suggestedCustomerId === null) {
        continue;
      }

      const entry = grouped.get(item.suggestedCustomerId) ?? { electronic: 0, general: 0, total: 0 };
      entry.total += 1;
      if (item.certificateKind === "electronic_tax") {
        entry.electronic += 1;
      } else {
        entry.general += 1;
      }
      grouped.set(item.suggestedCustomerId, entry);
    }

    return grouped;
  }, [unlinkedCertificates]);
  const actionNeededCustomerCount = linkedCustomerRows.filter(
    (row) => row.hasPaymentReady || row.hasPrepareNeeded || row.hasExpiringSoon || !row.hasGeneral || !row.hasElectronicTax
  ).length;
  const prepareNeededCustomerCount = linkedCustomerRows.filter((row) => row.hasPrepareNeeded).length;
  const paymentReadyCustomerCount = linkedCustomerRows.filter((row) => row.hasPaymentReady).length;
  const expiringCustomerCount = linkedCustomerRows.filter((row) => row.hasExpiringSoon).length;
  const missingGeneralCustomerCount = linkedCustomerRows.filter((row) => !row.hasGeneral).length;
  const missingElectronicCustomerCount = linkedCustomerRows.filter((row) => !row.hasElectronicTax).length;
  const filteredUnlinkedSuggestedCount = filteredUnlinkedCertificates.filter((item) => Boolean(item.suggestedCustomerLabel)).length;
  const selectedManagedRows = filteredLinkedCustomerRows.filter((row) => selectedManagedCustomerIds[row.customer.id]);
  const selectedManagedCertificates = selectedManagedRows.flatMap((row) => [
    ...row.electronicTaxCertificates,
    ...row.generalCertificates
  ]);
  const selectedPrepareCertificates = selectedManagedCertificates.filter((item) => !item.canOpenPayment);
  const selectedPaymentCertificates = selectedManagedCertificates.filter((item) => item.canOpenPayment);
  const filterMeta: Record<
    typeof customerFilter,
    {
      label: string;
      summary: string;
      count: number;
    }
  > = {
    action_needed: {
      label: "조치 필요",
      summary: "먼저 해결할 고객만 보기",
      count: actionNeededCustomerCount
    },
    all: {
      label: "전체 보기",
      summary: "연결된 고객 전체 상태",
      count: linkedCustomerRows.length
    },
    prepare_needed: {
      label: "준비 필요",
      summary: "범용으로 준비부터",
      count: prepareNeededCustomerCount
    },
    payment_ready: {
      label: "결제 가능",
      summary: "결제 창만 열면 됨",
      count: paymentReadyCustomerCount
    },
    expiring_30: {
      label: "30일 내 만료",
      summary: "만료 전 점검 필요",
      count: expiringCustomerCount
    },
    missing_general: {
      label: "범용 없음",
      summary: "갱신 준비용 연결 필요",
      count: missingGeneralCustomerCount
    },
    missing_electronic: {
      label: "전자세금 없음",
      summary: "실제 발행용 연결 필요",
      count: missingElectronicCustomerCount
    }
  };
  const customerFilterOptions: Array<typeof customerFilter> = [
    "action_needed",
    "all",
    "prepare_needed",
    "payment_ready",
    "expiring_30"
  ];
  const certificateStatusLead = helperUpgradeRequired
    ? "AT 헬퍼 재설치 필요"
    : helperVersionMismatch
      ? "AT 헬퍼 업데이트 필요"
    : !props.customerRenewalAssistantOnline
      ? "AT 헬퍼 필요"
      : actionNeededCustomerCount > 0
        ? `조치 필요 고객 ${actionNeededCustomerCount}명`
        : props.customerRenewalLoadedCertificateCount === 0
          ? "공동인증서 읽기부터"
          : linkedCustomerRows.length === 0
            ? "고객 연결 후 계속 관리"
            : "지금 막힘 없음";
  const certificateStatusBody = helperUpgradeRequired
    ? props.customerRenewalAssistantUpgradeMessage || "새 AT 헬퍼를 다시 설치한 뒤 상태를 다시 확인하세요."
    : helperVersionMismatch
      ? props.customerRenewalAssistantUpgradeMessage || "새 AT 헬퍼를 설치한 뒤 상태를 다시 확인하세요."
    : !props.customerRenewalAssistantOnline
      ? props.customerRenewalAssistantHelperMessage || "고객 PC에서 AT 헬퍼를 실행하세요."
      : actionNeededCustomerCount > 0
        ? "기본 보기는 조치 필요 고객 우선입니다."
        : props.customerRenewalLoadedCertificateCount === 0
        ? "전자세금용 / 범용 / 미연결 상태를 읽어옵니다."
        : "필요하면 전체 보기나 미연결 목록을 확인하세요.";
  const certificateMetricCards = [
    {
      key: "helper",
      label: "helper 상태",
      value: helperVersionMismatch ? "점검" : props.customerRenewalAssistantOnline ? "정상" : "필요",
      note: helperVersionMismatch ? "업데이트" : props.customerRenewalAssistantOnline ? "연결됨" : "실행 필요",
      tone: helperVersionMismatch ? "warn" : props.customerRenewalAssistantOnline ? "success" : "default"
    },
    {
      key: "helper-version",
      label: "helper 버전",
      value: props.customerRenewalAssistantHelperVersion ?? "-",
      note: props.customerRenewalAssistantLatestVersion ? `최신 ${props.customerRenewalAssistantLatestVersion}` : "확인 전",
      tone: helperVersionMismatch ? "warn" : props.customerRenewalAssistantHelperVersion ? "success" : "default"
    },
    {
      key: "loaded",
      label: "읽은 인증서",
      value: props.customerRenewalLoadedCertificateCount.toLocaleString("ko-KR"),
      note: "건",
      tone: props.customerRenewalLoadedCertificateCount > 0 ? "success" : "default"
    },
    {
      key: "linked",
      label: "연결된 고객",
      value: linkedCustomerRows.length.toLocaleString("ko-KR"),
      note: "명",
      tone: linkedCustomerRows.length > 0 ? "success" : "default"
    },
    {
      key: "unlinked",
      label: "미연결 인증서",
      value: unlinkedCount.toLocaleString("ko-KR"),
      note: "건",
      tone: unlinkedCount > 0 ? "warn" : "success"
    }
  ] as const;

  const pauseBatchPrepareForInteractiveAction = async (reason: string) => {
    if (!batchPreparePromiseRef.current) {
      return;
    }

    batchPrepareStopRequestedRef.current = true;
    setQueueNotice(`${reason}\n현재 준비 중인 인증서까지만 마친 뒤 일괄 갱신 준비를 멈춥니다.`);
    await batchPreparePromiseRef.current.catch(() => undefined);
  };

  const prepareVisibleCertificates = async () => {
    if (selectedManagedRows.length === 0) {
      setQueueNotice("먼저 갱신 준비할 고객을 선택하세요.");
      return;
    }

    if (selectedPrepareCertificates.length === 0) {
      setQueueNotice("선택한 고객 중 갱신 준비가 필요한 인증서가 없습니다.");
      return;
    }

    if (batchPreparePromiseRef.current) {
      setQueueNotice("이미 일괄 갱신 준비가 진행 중입니다.");
      return;
    }

    const batchCertificates = [...selectedPrepareCertificates];
    const preparedNames: string[] = [];
    const failedDetails: string[] = [];

    batchPrepareStopRequestedRef.current = false;
    setBatchPrepareState({
      active: true,
      total: batchCertificates.length,
      completed: 0,
      success: 0,
      failed: 0,
      currentCertificateCn: null
    });

    const runner = (async () => {
      for (let index = 0; index < batchCertificates.length; index += 1) {
        const certificate = batchCertificates[index]!;
        setBatchPrepareState((prev) => ({
          ...prev,
          currentCertificateCn: certificate.certificateCn
        }));
        setQueueNotice(`일괄 갱신 준비 진행 중 (${index + 1}/${batchCertificates.length}) · ${certificate.certificateCn}`);

        try {
          await props.onPrepareCustomerCertificateRenewal(certificate.certificateIndex, { showAlert: false });
          preparedNames.push(certificate.certificateCn);
        } catch (error) {
          failedDetails.push(`${certificate.certificateCn}: ${error instanceof Error ? error.message : "준비 실패"}`);
        }

        setBatchPrepareState({
          active: true,
          total: batchCertificates.length,
          completed: index + 1,
          success: preparedNames.length,
          failed: failedDetails.length,
          currentCertificateCn: batchPrepareStopRequestedRef.current ? null : certificate.certificateCn
        });

        if (batchPrepareStopRequestedRef.current) {
          break;
        }
      }

      if (preparedNames.length > 0) {
        setCustomerFilter("payment_ready");
      }

      const wasStopped = batchPrepareStopRequestedRef.current;
      setQueueNotice(
        `${wasStopped ? "일괄 갱신 준비 일시중지" : "일괄 갱신 준비 완료"} · 성공 ${preparedNames.length}건${
          failedDetails.length > 0 ? ` / 실패 ${failedDetails.length}건` : ""
        }${failedDetails.length > 0 ? `\n${failedDetails.slice(0, 5).join("\n")}` : ""}${
          preparedNames.length > 0 ? "\n결제 가능 필터로 전환했습니다." : ""
        }`
      );
    })().finally(() => {
      batchPreparePromiseRef.current = null;
      batchPrepareStopRequestedRef.current = false;
      setBatchPrepareState((prev) => ({
        ...prev,
        active: false,
        currentCertificateCn: null
      }));
    });

    batchPreparePromiseRef.current = runner;
  };

  const openNextPaymentCertificate = async () => {
    if (selectedManagedRows.length === 0) {
      setQueueNotice("먼저 결제할 고객을 선택하세요.");
      return;
    }

    const nextCertificate = selectedPaymentCertificates[0] ?? null;
    if (!nextCertificate) {
      setQueueNotice("선택한 고객 중 바로 결제할 수 있는 인증서가 없습니다.");
      return;
    }

    await pauseBatchPrepareForInteractiveAction("결제를 진행하기 위해 일괄 갱신 준비를 잠시 멈춥니다.");
    await props.onOpenCustomerCertificatePayment(nextCertificate.certificateIndex, { showAlert: false });
    setQueueNotice(`${nextCertificate.certificateCn} 결제 창을 열었습니다. 결제를 마치고 돌아오면 다음 결제를 이어서 열면 됩니다.`);
  };

  type LinkedCustomerRow = (typeof linkedCustomerRows)[number];
  const focusCustomerUnlinkedCertificates = (row: LinkedCustomerRow, kind: "electronic" | "general") => {
    setSearchQuery(row.customer.customerName);
    setQueueNotice(
      `${row.customer.customerName} 고객의 ${kind === "electronic" ? "전자세금용" : "범용"} 후보 인증서를 아래 미연결 목록에서 바로 확인하세요.`
    );
  };
  const getCustomerRowStory = (row: LinkedCustomerRow) => {
    const suggestion = unlinkedSuggestionMap.get(row.customer.id) ?? { electronic: 0, general: 0, total: 0 };
    const nextPaymentCertificate = row.electronicTaxCertificates.concat(row.generalCertificates).find((item) => item.canOpenPayment) ?? null;
    const nextPrepareCertificate = row.electronicTaxCertificates.concat(row.generalCertificates).find((item) => !item.canOpenPayment) ?? null;

    if (!row.hasElectronicTax) {
      return {
        headline: "전자세금용 연결 필요",
        body:
          suggestion.electronic > 0
            ? `미연결 목록에 전자세금 후보 ${suggestion.electronic}건이 있습니다.`
            : "전자세금용 인증서가 없으면 실제 발행이 막힙니다.",
        actionLabel: "미연결 보기",
        actionKind: "show-electronic" as const
      };
    }

    if (!row.hasGeneral) {
      return {
        headline: "범용 연결 권장",
        body:
          suggestion.general > 0
            ? `미연결 목록에 범용 후보 ${suggestion.general}건이 있습니다.`
            : "범용 인증서는 갱신 준비와 결제에 쓰는 보조 인증서입니다.",
        actionLabel: "미연결 보기",
        actionKind: "show-general" as const
      };
    }

    if (nextPaymentCertificate) {
      return {
        headline: "결제만 남았습니다",
        body: "갱신 준비가 끝났습니다. 결제 창만 열면 됩니다.",
        actionLabel: "결제 열기",
        actionKind: "open-payment" as const,
        certificate: nextPaymentCertificate
      };
    }

    if (nextPrepareCertificate) {
      return {
        headline: "갱신 준비부터 하세요",
        body: "범용 인증서로 준비를 먼저 실행하세요.",
        actionLabel: "준비 시작",
        actionKind: "prepare" as const,
        certificate: nextPrepareCertificate
      };
    }

    if (row.hasExpiringSoon) {
      return {
        headline: "만료 전 점검 필요",
        body: "30일 안에 만료됩니다. 일괄 준비 목록에 담아 두세요.",
        actionLabel: null,
        actionKind: "select-row" as const
      };
    }

    return {
      headline: "지금 막힌 작업 없음",
      body: "전자세금용과 범용이 모두 연결돼 있습니다.",
      actionLabel: null,
      actionKind: "select-row" as const
    };
  };
  const runCustomerRowPrimaryAction = (row: LinkedCustomerRow) => {
    const story = getCustomerRowStory(row);

    switch (story.actionKind) {
      case "show-electronic":
        focusCustomerUnlinkedCertificates(row, "electronic");
        return;
      case "show-general":
        focusCustomerUnlinkedCertificates(row, "general");
        return;
      case "open-payment":
        if (!story.certificate) return;
        return void props.runAction(
          `customer-certificate-open-payment-${story.certificate.certificateIndex}`,
          async () => {
            await pauseBatchPrepareForInteractiveAction("결제를 진행하기 위해 일괄 갱신 준비를 잠시 멈춥니다.");
            await props.onOpenCustomerCertificatePayment(story.certificate.certificateIndex, { showAlert: false });
          },
          { reload: false }
        );
      case "prepare":
        if (!story.certificate) return;
        return void props.runAction(
          `customer-certificate-prepare-${story.certificate.certificateIndex}`,
          async () => props.onPrepareCustomerCertificateRenewal(story.certificate.certificateIndex, { showAlert: false }),
          { reload: false }
        );
      default:
        return;
    }
  };
  const linkedTableEmptyState = (() => {
    if (filteredLinkedCustomerRows.length > 0) return null;

    if (linkedCustomerRows.length > 0) {
      if (customerFilter === "action_needed") {
        return {
          title: "문제가 없어서 비어 있습니다.",
          body: "지금 조치 필요 고객이 없습니다. 필요하면 전체 보기로 바꿔 전체 연결 상태를 확인하세요.",
          tone: "success" as const
        };
      }
      return {
        title: "현재 조건에 맞는 고객이 없습니다.",
        body: "검색어 또는 필터를 바꾸면 다른 고객 상태를 바로 확인할 수 있습니다.",
        tone: "info" as const
      };
    }

    if (props.customerRenewalLoadedCertificateCount > 0) {
      return {
        title: "아직 고객 연결 데이터가 없습니다.",
        body: "읽은 공동인증서를 고객과 연결하면 이 표에 고객별 발행 막힘과 다음 행동이 나타납니다.",
        tone: "info" as const
      };
    }

    return {
      title: "아직 데이터가 없습니다.",
      body: "먼저 공동인증서 읽기를 눌러 현재 PC 인증서를 가져오면 고객별 상태를 정리할 수 있습니다.",
      tone: "info" as const
    };
  })();
  const unlinkedTableEmptyState = (() => {
    if (!props.customerRenewalAssistantOnline) {
      return {
        title: "먼저 AT 헬퍼 연결을 확인하세요.",
        body: "AT 헬퍼가 켜져 있어야 미연결 공동인증서 목록도 읽어 올 수 있습니다.",
        tone: "info" as const
      };
    }

    if (filteredUnlinkedCertificates.length > 0) return null;

    if (unlinkedCertificates.length > 0) {
      return {
        title: "현재 검색 조건에 맞는 미연결 공동인증서가 없습니다.",
        body: "검색어를 지우거나 고객명을 바꾸면 다른 예외 후보를 다시 볼 수 있습니다.",
        tone: "info" as const
      };
    }

    return {
      title: "문제가 없어서 비어 있습니다.",
      body: "현재는 고객과 묶이지 않은 공동인증서가 없습니다. 예외 처리할 목록이 없는 정상 상태입니다.",
      tone: "success" as const
    };
  })();
  const unlinkedPanelTitle = "미연결 인증서";
  const unlinkedPanelSummary =
    filteredUnlinkedCertificates.length > 0
      ? `추천 후보 ${filteredUnlinkedSuggestedCount}건`
      : "현재 검색 조건 기준 미연결 예외 목록";
  const focusedUnlinkedCertificate =
    filteredUnlinkedCertificates.find((item) => item.key === focusedUnlinkedCertificateKey) ?? filteredUnlinkedCertificates[0] ?? null;
  const focusedUnlinkedCustomerValue = focusedUnlinkedCertificate
    ? selectedCustomerIds[focusedUnlinkedCertificate.key] ?? String(focusedUnlinkedCertificate.suggestedCustomerId ?? "")
    : "";
  const selectedUnlinkCertificate = selectedManagedCertificates.find((item) => item.linkedCertificateId !== null) ?? null;

  const toggleManagedCustomer = (customerId: number) => {
    setSelectedManagedCustomerIds((prev) => ({
      ...prev,
      [customerId]: !prev[customerId]
    }));
  };

  const selectAllFilteredCustomers = () => {
    setSelectedManagedCustomerIds((prev) => {
      const next = { ...prev };
      for (const row of filteredLinkedCustomerRows) {
        next[row.customer.id] = true;
      }
      return next;
    });
  };

  const clearFilteredCustomerSelection = () => {
    setSelectedManagedCustomerIds((prev) => {
      const next = { ...prev };
      for (const row of filteredLinkedCustomerRows) {
        delete next[row.customer.id];
      }
      return next;
    });
  };

  const linkFocusedUnlinkedCertificate = () => {
    if (!focusedUnlinkedCertificate || !focusedUnlinkedCustomerValue) {
      return;
    }

    void props.runAction(
      `customer-certificate-link-${focusedUnlinkedCertificate.certificateIndex}`,
      async () => props.onLinkCustomerCertificate(focusedUnlinkedCertificate.certificateIndex, Number(focusedUnlinkedCustomerValue))
    );
  };

  const unlinkSelectedCertificate = () => {
    if (!selectedUnlinkCertificate?.linkedCertificateId) {
      return;
    }

    void props.runAction(
      `customer-certificate-unlink-${selectedUnlinkCertificate.linkedCertificateId}`,
      async () => props.onUnlinkCustomerCertificate(selectedUnlinkCertificate.linkedCertificateId!)
    );
  };

  const stopRowSelection: React.MouseEventHandler<HTMLElement> = (event) => {
    event.stopPropagation();
  };

  const getRowCertificates = (row: LinkedCustomerRow) =>
    row.electronicTaxCertificates.concat(row.generalCertificates).sort((left, right) => {
      const leftTime = getCertificateExpireTime(left.certificateExpireDate);
      const rightTime = getCertificateExpireTime(right.certificateExpireDate);
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return getCertificateKindLabel(left.certificateKind).localeCompare(getCertificateKindLabel(right.certificateKind), "ko");
    });

  const getRowTableSummary = (row: LinkedCustomerRow) => {
    const certificates = getRowCertificates(row);
    const nearestCertificate = certificates[0] ?? null;
    const rowStory = getCustomerRowStory(row);
    const statusTone: CertificateStatusBadgeTone = !row.hasElectronicTax
      ? "danger"
      : row.hasPaymentReady
        ? "success"
        : row.hasPrepareNeeded || row.hasExpiringSoon || !row.hasGeneral
          ? "warn"
          : "default";
    const statusLabel = !row.hasElectronicTax
      ? "발행 막힘"
      : row.hasPaymentReady
        ? "결제 가능"
        : row.hasExpiringSoon
          ? "만료 임박"
          : row.hasPrepareNeeded || !row.hasGeneral
            ? "정상"
            : "정상";
    const prepareLabel = row.hasPaymentReady
      ? "결제 가능"
      : row.hasPrepareNeeded || !row.hasGeneral
        ? "준비 필요"
        : row.hasExpiringSoon
          ? "점검 필요"
          : "완료";

    return {
      nearestCertificate,
      expireDate: nearestCertificate ? props.formatCertificateExpireDate(nearestCertificate.certificateExpireDate) : "-",
      certificateLabel: nearestCertificate ? getCertificateKindLabel(nearestCertificate.certificateKind) : "연결 없음",
      statusLabel,
      statusTone,
      prepareLabel,
      note: rowStory.body,
      rowStory
    };
  };

  if (!props.canUseCustomerRenewalAssistant) {
    return (
      <div className="empty">
        공동인증서 관리는 편집 권한이 있는 사용자만 사용할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="certificate-screen certificate-option1-screen">
      <section className="certificate-hero-panel certificate-ops-toolbar" aria-label="인증서 운영 요약">
        <div className="certificate-ops-metrics">
          {certificateMetricCards.map((card) => (
            <article
              key={card.key}
              className={[
                "certificate-ops-metric-card",
                card.tone === "warn" ? "tone-warn" : card.tone === "success" ? "tone-success" : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span>
                {card.key === "helper" ? <i aria-hidden="true" className="certificate-status-dot" /> : null}
                {card.label}
              </span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </article>
          ))}
        </div>
        <div className="certificate-ops-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={assistantBusyKey !== null}
            onClick={() => void props.runRefreshCustomerRenewalAssistant()}
          >
            {isRefreshingRenewalAssistant ? "확인 중..." : "helper 새로고침"}
          </button>
          <button
            type="button"
            aria-label="공동인증서 읽기"
            disabled={assistantBusyKey !== null || !props.customerRenewalAssistantOnline || helperVersionMismatch}
            title={!props.customerRenewalAssistantOnline || helperVersionMismatch ? certificateStatusBody : undefined}
            onClick={() => void props.runLoadCustomerRenewalCertificates()}
          >
            {isLoadingRenewalCertificates ? "읽는 중..." : "읽은 인증서 다시 읽기"}
          </button>
        </div>
      </section>

      {helperUpgradeNotice || !props.customerRenewalAssistantOnline ? (
        <section className="certificate-helper-alert" aria-live="polite">
          <strong>{helperUpgradeNotice?.title ?? certificateStatusLead}</strong>
          <span>{helperUpgradeNotice?.message ?? certificateStatusBody}</span>
          <button className="btn-secondary" type="button" onClick={() => window.location.assign(props.renewalHelperDownloadUrl)}>
            AT 헬퍼 다운로드
          </button>
        </section>
      ) : null}

      <div className="certificate-layout-grid certificate-option1-main-grid">
        <section className="certificate-main-panel certificate-connected-panel">
          <div className="certificate-main-head">
            <div className="certificate-main-copy">
              <h3>연결된 고객 인증서 상태 ({linkedCustomerRows.length.toLocaleString("ko-KR")})</h3>
            </div>
            <span className="certificate-main-count">현재 {filteredLinkedCustomerRows.length.toLocaleString("ko-KR")}명</span>
          </div>

          <div className="certificate-list-toolrow certificate-option1-tools">
            <label className="certificate-search">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="고객명, 사업자번호, 인증서명 검색"
              />
            </label>
            <div className="certificate-filter-strip" aria-label="고객 인증서 상태 필터">
              {customerFilterOptions.map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  className={customerFilter === filterKey ? "chip chip-filter active" : "chip chip-filter"}
                  onClick={() => setCustomerFilter(filterKey)}
                >
                  {filterMeta[filterKey].label}
                  <span>{filterMeta[filterKey].count.toLocaleString("ko-KR")}</span>
                </button>
              ))}
            </div>
          </div>
          {queueNotice ? (
            <div className="certificate-inline-note" role="status">
              <span className="chip chip-warn">안내</span>
              <span>{queueNotice}</span>
            </div>
          ) : null}

          <div className="certificate-main-table-wrap">
            {filteredLinkedCustomerRows.length > 0 ? (
              <table className="certificate-table certificate-linked-table certificate-option1-table">
                <colgroup>
                  <col className="certificate-col-customer" />
                  <col className="certificate-col-business" />
                  <col className="certificate-col-expire" />
                  <col className="certificate-col-status" />
                  <col className="certificate-col-prepare" />
                  <col className="certificate-col-note" />
                </colgroup>
                <thead>
                  <tr>
                    <th>고객명</th>
                    <th>사업자번호</th>
                    <th>인증서 만료일</th>
                    <th>상태</th>
                    <th>준비 상태</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLinkedCustomerRows.map((row) => {
                    const rowSummary = getRowTableSummary(row);
                    const rowStory = rowSummary.rowStory;
                    const isRowSelected = Boolean(selectedManagedCustomerIds[row.customer.id]);
                    const rowToneClass = rowSummary.statusTone === "danger"
                      ? "is-danger"
                      : rowSummary.statusTone === "success"
                        ? "is-success"
                        : rowSummary.statusTone === "warn"
                          ? "is-warn"
                          : "is-default";

                    return (
                      <tr
                        key={`customer-certificate-row-${row.customer.id}`}
                        className={`certificate-table-row ${rowToneClass}${isRowSelected ? " is-selected" : ""}`}
                        onClick={() => toggleManagedCustomer(row.customer.id)}
                      >
                        <td>
                          <div className="certificate-table-customer">
                            <strong>{row.customer.corpName}</strong>
                            <span>{row.customer.customerName}</span>
                          </div>
                        </td>
                        <td>
                          <span className="certificate-table-business">{row.customer.businessNumber}</span>
                        </td>
                        <td>
                          <div className="certificate-table-expire">
                            <strong>{rowSummary.expireDate}</strong>
                            <span>{rowSummary.certificateLabel}</span>
                          </div>
                        </td>
                        <td>
                          <span className={rowSummary.statusTone === "default" ? "certificate-status-badge" : `certificate-status-badge ${rowSummary.statusTone}`}>
                            {rowSummary.statusLabel}
                          </span>
                        </td>
                        <td>
                          <strong className="certificate-prepare-label">{rowSummary.prepareLabel}</strong>
                        </td>
                        <td>
                          <div className="certificate-table-note" onClick={stopRowSelection}>
                            <span>{rowSummary.note}</span>
                            {rowStory.actionLabel ? (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={
                                  (rowStory.actionKind === "open-payment" || rowStory.actionKind === "prepare") &&
                                  (assistantBusyKey !== null || batchPrepareState.active || helperUpgradeRequired)
                                }
                                title={
                                  rowStory.actionKind === "open-payment" || rowStory.actionKind === "prepare"
                                    ? helperUpgradeRequired
                                      ? certificateStatusBody
                                      : undefined
                                    : undefined
                                }
                                onClick={() => runCustomerRowPrimaryAction(row)}
                              >
                                {rowStory.actionLabel}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className={`context-empty-state ${linkedTableEmptyState?.tone === "success" ? "tone-success" : "tone-info"}`}>
                <strong>{linkedTableEmptyState?.title}</strong>
                <p>{linkedTableEmptyState?.body}</p>
              </div>
            )}
          </div>
        </section>

        <aside className="certificate-work-panel certificate-option1-side">
          <section className="certificate-work-card certificate-unlinked-card">
            <div className="certificate-work-card-head">
              <strong>{unlinkedPanelTitle}</strong>
              <span>
                {filteredUnlinkedCertificates.length}건
                {filteredUnlinkedCertificates.length > 0 ? ` · 추천 ${filteredUnlinkedSuggestedCount}건` : ""}
              </span>
            </div>
            <p className="certificate-split-note">{unlinkedPanelSummary}</p>
            {filteredUnlinkedCertificates.length > 0 ? (
              <div className="certificate-unlinked-table-wrap">
                <table className="certificate-table certificate-unlinked-table">
                  <thead>
                    <tr>
                      <th>인증서 정보</th>
                      <th>만료일</th>
                      <th>후보 고객 매칭</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnlinkedCertificates.map((item) => (
                      <tr
                        key={item.key}
                        className={focusedUnlinkedCertificate?.key === item.key ? "is-selected" : undefined}
                        onClick={() => setFocusedUnlinkedCertificateKey(item.key)}
                      >
                        <td>
                          <div className="certificate-unlinked-name">
                            <strong title={item.certificateCn}>{item.certificateCn}</strong>
                            <span>{getCertificateKindLabel(item.certificateKind)}</span>
                          </div>
                        </td>
                        <td>{props.formatCertificateExpireDate(item.certificateExpireDate)}</td>
                        <td>
                          <div className="certificate-unlinked-match-cell">
                            <span>{item.suggestedCustomerLabel ? `후보 ${item.suggestionCount}건` : "-"}</span>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                setFocusedUnlinkedCertificateKey(item.key);
                              }}
                            >
                              매칭
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={`context-empty-state ${unlinkedTableEmptyState?.tone === "success" ? "tone-success" : "tone-info"}`}>
                <strong>{unlinkedTableEmptyState?.title}</strong>
                <p>{unlinkedTableEmptyState?.body}</p>
              </div>
            )}
          </section>

          <section className="certificate-work-card certificate-match-card">
            <div className="certificate-work-card-head">
              <strong>후보 고객 매칭</strong>
              <span>{focusedUnlinkedCertificate?.suggestedCustomerLabel ? "추천 후보 있음" : "수동 선택"}</span>
            </div>
            <p className="certificate-split-note">인증서 선택 후 고객을 선택해 연결하세요.</p>
            <div className="certificate-match-form">
              <label>
                <span>선택 인증서</span>
                <select
                  value={focusedUnlinkedCertificate?.key ?? ""}
                  disabled={filteredUnlinkedCertificates.length === 0 || assistantBusyKey !== null || batchPrepareState.active}
                  onChange={(event) => setFocusedUnlinkedCertificateKey(event.target.value)}
                >
                  {filteredUnlinkedCertificates.length === 0 ? <option value="">미연결 인증서 없음</option> : null}
                  {filteredUnlinkedCertificates.map((item) => (
                    <option key={`match-certificate-${item.key}`} value={item.key}>
                      {item.certificateCn} · {item.certificateIndex}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>후보 고객 선택</span>
                <select
                  value={focusedUnlinkedCustomerValue}
                  disabled={!focusedUnlinkedCertificate || assistantBusyKey !== null || batchPrepareState.active}
                  onChange={(event) => {
                    if (!focusedUnlinkedCertificate) return;
                    setSelectedCustomerIds((prev) => ({
                      ...prev,
                      [focusedUnlinkedCertificate.key]: event.target.value
                    }));
                  }}
                >
                  <option value="">후보 고객 선택</option>
                  {customerOptions.map((customer) => (
                    <option key={`match-customer-${customer.id}`} value={customer.id}>
                      {customer.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!focusedUnlinkedCertificate || !focusedUnlinkedCustomerValue || assistantBusyKey !== null || batchPrepareState.active}
                onClick={linkFocusedUnlinkedCertificate}
              >
                {focusedUnlinkedCertificate && activeLinkCertificateIndex === focusedUnlinkedCertificate.certificateIndex ? "연결 중..." : "연결"}
              </button>
            </div>
          </section>
        </aside>
      </div>

      <footer className="certificate-bottom-actionbar" aria-label="인증서 선택 작업">
        <div className="certificate-bottom-status">
          <span>선택 고객 {selectedManagedRows.length.toLocaleString("ko-KR")}명</span>
          <span>준비 대상 {selectedPrepareCertificates.length.toLocaleString("ko-KR")}건</span>
          <span>결제 가능 {selectedPaymentCertificates.length.toLocaleString("ko-KR")}건</span>
        </div>
        <div className="certificate-bottom-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={!focusedUnlinkedCertificate || !focusedUnlinkedCustomerValue || assistantBusyKey !== null || batchPrepareState.active}
            onClick={linkFocusedUnlinkedCertificate}
          >
            연결
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!selectedUnlinkCertificate || assistantBusyKey !== null || batchPrepareState.active}
            onClick={unlinkSelectedCertificate}
          >
            {selectedUnlinkCertificate?.linkedCertificateId === activeUnlinkCertificateId ? "해제 중..." : "해제"}
          </button>
          <button
            type="button"
            disabled={assistantBusyKey !== null || helperUpgradeRequired || batchPrepareState.active || selectedPrepareCertificates.length === 0}
            title={helperUpgradeRequired ? certificateStatusBody : undefined}
            onClick={() => void prepareVisibleCertificates()}
          >
            {batchPrepareState.active ? `준비 중 ${batchPrepareState.completed}/${batchPrepareState.total}` : "준비 실행"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={assistantBusyKey !== null || helperUpgradeRequired || selectedPaymentCertificates.length === 0}
            title={helperUpgradeRequired ? certificateStatusBody : undefined}
            onClick={() =>
              void props.runAction("customer-certificate-open-next-payment", openNextPaymentCertificate, {
                reload: false
              })
            }
          >
            {assistantBusyKey === "customer-certificate-open-next-payment" ? "여는 중..." : "결제 가능 열기"}
          </button>
          <button type="button" className="btn-secondary" disabled title="연결 이력 화면은 아직 별도 API가 없습니다.">
            연결 이력
          </button>
          <button type="button" className="btn-secondary" disabled title="인증서 설정은 현재 설정 탭에서 관리합니다.">
            설정
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={filteredLinkedCustomerRows.length === 0}
            onClick={selectAllFilteredCustomers}
          >
            전체 선택
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={selectedManagedRows.length === 0}
            onClick={clearFilteredCustomerSelection}
          >
            선택 해제
          </button>
        </div>
      </footer>
    </div>
  );
}
