import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<
    "action_needed" | "all" | "prepare_needed" | "payment_ready" | "expiring_30" | "missing_general" | "missing_electronic"
  >("action_needed");
  const [activeDataTab, setActiveDataTab] = useState<"linked" | "unlinked">("linked");
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
          title: "헬퍼 재설치 필요",
          message: props.customerRenewalAssistantUpgradeMessage
        }
      : props.customerRenewalAssistantUpgradeState === "upgrade-available"
        ? {
            title: "헬퍼 업데이트 권장",
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
  const focusFilters: Array<{
    key: "action_needed" | "payment_ready" | "prepare_needed" | "expiring_30";
    tone: "warn" | "success";
  }> = [
    { key: "action_needed", tone: actionNeededCustomerCount > 0 ? "warn" : "success" },
    { key: "payment_ready", tone: paymentReadyCustomerCount > 0 ? "success" : "warn" },
    { key: "prepare_needed", tone: prepareNeededCustomerCount > 0 ? "warn" : "success" },
    { key: "expiring_30", tone: expiringCustomerCount > 0 ? "warn" : "success" }
  ];
  const certificateGuideCards = [
    {
      key: "electronic",
      title: "전자세금",
      description: "실제 발행"
    },
    {
      key: "general",
      title: "범용",
      description: "갱신 준비"
    },
    {
      key: "unlinked",
      title: "미연결",
      description: "예외 확인"
    }
  ];
  const certificateStatusLead = helperUpgradeRequired
    ? "로컬 헬퍼 재설치 필요"
    : helperVersionMismatch
      ? "로컬 헬퍼 업데이트 필요"
    : !props.customerRenewalAssistantOnline
      ? "로컬 헬퍼 필요"
      : actionNeededCustomerCount > 0
        ? `조치 필요 고객 ${actionNeededCustomerCount}명`
        : props.customerRenewalLoadedCertificateCount === 0
          ? "공동인증서 읽기부터"
          : linkedCustomerRows.length === 0
            ? "고객 연결 후 계속 관리"
            : "지금 막힘 없음";
  const certificateStatusBody = helperUpgradeRequired
    ? props.customerRenewalAssistantUpgradeMessage || "새 로컬 헬퍼를 다시 설치한 뒤 상태를 다시 확인하세요."
    : helperVersionMismatch
      ? props.customerRenewalAssistantUpgradeMessage || "새 로컬 헬퍼를 설치한 뒤 상태를 다시 확인하세요."
    : !props.customerRenewalAssistantOnline
      ? props.customerRenewalAssistantHelperMessage || "고객 PC에서 헬퍼를 실행하세요."
      : actionNeededCustomerCount > 0
        ? "기본 보기는 조치 필요 고객 우선입니다."
        : props.customerRenewalLoadedCertificateCount === 0
        ? "전자세금용 / 범용 / 미연결 상태를 읽어옵니다."
        : "필요하면 전체 보기나 미연결 목록을 확인하세요.";
  const certificateStatusSummary = helperUpgradeRequired
    ? "로컬 헬퍼를 다시 설치한 뒤 상태를 다시 확인하세요."
    : helperVersionMismatch
      ? "헬퍼를 업데이트한 뒤 인증서 상태를 다시 불러오세요."
      : !props.customerRenewalAssistantOnline
        ? "고객 PC에서 로컬 헬퍼를 실행한 뒤 상태를 다시 확인하세요."
        : actionNeededCustomerCount > 0
          ? "기본 보기는 조치가 필요한 고객부터 보여줍니다."
          : props.customerRenewalLoadedCertificateCount === 0
            ? "공동인증서를 읽어 발행용과 갱신 준비 상태를 먼저 정리하세요."
            : "왼쪽에서 필터와 일괄 작업을 관리하고 오른쪽에서 고객 상태를 확인합니다.";
  const certificateSummaryCards = [
    {
      key: "helper",
      label: "헬퍼 상태",
      value: helperVersionMismatch
        ? "업데이트 필요"
        : props.customerRenewalAssistantOnline
          ? "연결됨"
          : "실행 필요",
      note: props.customerRenewalAssistantHelperVersion ? `현재 v${props.customerRenewalAssistantHelperVersion}` : "상태 확인 필요",
      icon: "dashboard",
      tone: helperVersionMismatch ? "warn" : props.customerRenewalAssistantOnline ? "success" : "default"
    },
    {
      key: "loaded",
      label: "로컬 읽음",
      value: `${props.customerRenewalLoadedCertificateCount}건`,
      note:
        props.customerRenewalLoadedCertificateCount > 0
          ? "전자세금용 / 범용 포함"
          : "읽은 인증서 없음",
      icon: "certificate",
      tone: props.customerRenewalLoadedCertificateCount > 0 ? "success" : "default"
    },
    {
      key: "linked",
      label: "연결 고객",
      value: `${linkedCustomerRows.length}명`,
      note: unlinkedCount > 0 ? `미연결 ${unlinkedCount}건 남음` : "연결 예외 없음",
      icon: "group",
      tone: unlinkedCount > 0 ? "warn" : "success"
    },
    {
      key: "action",
      label: "운영 대기",
      value: `${actionNeededCustomerCount}명`,
      note:
        paymentReadyCustomerCount > 0
          ? `결제 가능 ${paymentReadyCustomerCount}명`
          : prepareNeededCustomerCount > 0
            ? `준비 필요 ${prepareNeededCustomerCount}명`
            : "즉시 조치 없음",
      icon: paymentReadyCustomerCount > 0 ? "complete" : "review",
      tone: actionNeededCustomerCount > 0 ? "warn" : "success"
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
    setActiveDataTab("unlinked");
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
        title: "먼저 로컬 헬퍼 연결을 확인하세요.",
        body: "헬퍼가 켜져 있어야 미연결 공동인증서 목록도 읽어 올 수 있습니다.",
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
  const linkedPanelTitle = customerFilter === "action_needed" ? "지금 조치할 고객" : "고객별 인증서 상태";
  const linkedPanelSummary =
    customerFilter === "action_needed"
      ? "막힌 고객만 먼저 보여 줍니다."
      : filterMeta[customerFilter].summary;
  const unlinkedPanelTitle =
    customerFilter === "action_needed" ? "예외 처리용 미연결 공동인증서" : "미연결 공동인증서";
  const unlinkedPanelSummary =
    filteredUnlinkedCertificates.length > 0
      ? `추천 후보 ${filteredUnlinkedSuggestedCount}건`
      : "현재 검색 조건 기준 미연결 예외 목록";

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

  const stopRowSelection: React.MouseEventHandler<HTMLElement> = (event) => {
    event.stopPropagation();
  };

  const renderLinkedCertificateList = (items: CertificateTabItem[], typeLabel: string) => {
    if (items.length === 0) {
      return (
        <span className="certificate-cell-empty">
          {typeLabel === "전자세금" ? "없음 · 실제 발행용 필요" : "없음 · 갱신 준비용 권장"}
        </span>
      );
    }

    return (
      <div className="certificate-managed-list">
        {items.map((item) => (
          <div key={item.key} className="certificate-managed-item" onClick={stopRowSelection}>
            <div className="certificate-managed-head">
              <strong title={item.certificateCn}>{item.certificateCn}</strong>
              <span className="certificate-mini-chip">{props.formatCertificateExpireDate(item.certificateExpireDate)}</span>
            </div>
            <div className="certificate-managed-meta">
              <span
                className={
                  item.statusTone === "danger"
                    ? "text-danger"
                    : item.statusTone === "success"
                      ? "text-success"
                      : item.statusTone === "warn"
                        ? "text-warn"
                        : ""
                }
              >
                {item.statusText}
              </span>
              {item.paymentAmount ? <span>{item.paymentAmount}</span> : null}
            </div>
            <div className="certificate-managed-actions">
              <button
                disabled={assistantBusyKey !== null || helperUpgradeRequired || (batchPrepareState.active && !item.canOpenPayment)}
                title={helperUpgradeRequired ? certificateStatusBody : undefined}
                onClick={() =>
                  void props.runAction(
                    item.canOpenPayment
                      ? `customer-certificate-open-payment-${item.certificateIndex}`
                      : `customer-certificate-prepare-${item.certificateIndex}`,
                    async () => {
                      if (item.canOpenPayment) {
                        await pauseBatchPrepareForInteractiveAction("결제를 진행하기 위해 일괄 갱신 준비를 잠시 멈춥니다.");
                        await props.onOpenCustomerCertificatePayment(item.certificateIndex, { showAlert: false });
                        return;
                      }

                      await props.onPrepareCustomerCertificateRenewal(item.certificateIndex, { showAlert: false });
                    },
                    { reload: false }
                  )
                }
              >
                {activeStartCertificateIndex === item.certificateIndex || batchPrepareState.currentCertificateCn === item.certificateCn
                  ? "진행 중..."
                  : item.canOpenPayment
                    ? "결제 열기"
                    : "준비 시작"}
              </button>
              {item.linkedCertificateId !== null ? (
                <button
                  type="button"
                  className="btn-secondary certificate-inline-button"
                  disabled={assistantBusyKey !== null || batchPrepareState.active}
                  onClick={() =>
                    void props.runAction(
                      `customer-certificate-unlink-${item.linkedCertificateId}`,
                      async () => props.onUnlinkCustomerCertificate(item.linkedCertificateId!)
                    )
                  }
                >
                  {activeUnlinkCertificateId === item.linkedCertificateId ? "연결 해제 중..." : "연결 해제"}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (!props.canUseCustomerRenewalAssistant) {
    return (
      <div className="empty">
        공동인증서 관리는 편집 권한이 있는 사용자만 사용할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="certificate-screen">
      <aside className="certificate-side-panel">
        <section className="certificate-hero-panel">
          <div className="certificate-hero-head">
            <div className="certificate-hero-copy">
              <div className="certificate-hero-copy-top">
                <span className={helperVersionMismatch ? "chip chip-warn" : props.customerRenewalAssistantOnline ? "chip chip-success" : "chip"}>
                  {certificateStatusLead}
                </span>
                {props.customerRenewalAssistantHelperVersion ? (
                  <span className="certificate-hero-version">v{props.customerRenewalAssistantHelperVersion}</span>
                ) : null}
              </div>
              <h3>헬퍼 / 인증서 상태</h3>
              <p>{certificateStatusSummary}</p>
            </div>
          </div>
          <div className="certificate-hero-actions">
            <button
              className="btn-secondary"
              disabled={assistantBusyKey !== null}
              onClick={() => void props.runRefreshCustomerRenewalAssistant()}
            >
              {isRefreshingRenewalAssistant ? "확인 중..." : "새로고침"}
            </button>
            {helperUpgradeNotice || !props.customerRenewalAssistantOnline ? (
              <button className="btn-secondary" type="button" onClick={() => window.location.assign(props.renewalHelperDownloadUrl)}>
                헬퍼 다운로드
              </button>
            ) : null}
            <button
              disabled={assistantBusyKey !== null || !props.customerRenewalAssistantOnline || helperVersionMismatch}
              title={!props.customerRenewalAssistantOnline || helperVersionMismatch ? certificateStatusBody : undefined}
              onClick={() => void props.runLoadCustomerRenewalCertificates()}
            >
              {isLoadingRenewalCertificates ? "읽는 중..." : "공동인증서 읽기"}
            </button>
          </div>
          {!props.customerRenewalAssistantOnline ? (
            <div className="helper-box import-helper-box">
              <strong>로컬 헬퍼 필요</strong>
              <span>{props.customerRenewalAssistantHelperMessage || "고객 PC에서 로컬 헬퍼를 실행하세요."}</span>
            </div>
          ) : null}
          {helperUpgradeNotice ? (
            <div className="helper-box-stack settings-install-guide">
              <strong>{helperUpgradeNotice.title}</strong>
              <span>{helperUpgradeNotice.message}</span>
              {props.customerRenewalAssistantLatestVersion ? <span>최신 버전: v{props.customerRenewalAssistantLatestVersion}</span> : null}
              {props.customerRenewalAssistantMinSupportedVersion ? <span>최소 지원 버전: v{props.customerRenewalAssistantMinSupportedVersion}</span> : null}
            </div>
          ) : null}

          <div className="certificate-guide-strip" aria-label="인증서 운영 구분">
            {certificateGuideCards.map((card) => (
              <article key={card.key} className="certificate-guide-pill">
                <strong>{card.title}</strong>
                <span>{card.description}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="certificate-side-summary-grid" aria-label="인증서 운영 요약">
          {certificateSummaryCards.map((card) => (
            <article
              key={card.key}
              className={[
                "certificate-summary-card",
                card.tone === "warn"
                  ? "tone-warn"
                  : card.tone === "success"
                    ? "tone-success"
                    : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="certificate-summary-card-head">
                <span>{card.label}</span>
                <Icon name={card.icon} className="certificate-summary-card-icon" />
              </div>
              <strong>{card.value}</strong>
              <p>{card.note}</p>
            </article>
          ))}
        </section>

        {props.customerRenewalAssistantOnline ? (
          <section className="certificate-toolbar-card">
            <div className="certificate-controls">
              <div className="certificate-focus-grid">
                {focusFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className={customerFilter === filter.key ? "certificate-focus-card active" : "certificate-focus-card"}
                    onClick={() => {
                      setCustomerFilter(filter.key);
                      setActiveDataTab("linked");
                    }}
                  >
                    <div className="certificate-focus-card-head">
                      <span>{filterMeta[filter.key].label}</span>
                      <span className={`chip ${filter.tone === "success" ? "chip-success" : "chip-warn"}`}>
                        {filterMeta[filter.key].count}명
                      </span>
                    </div>
                    <strong>{filterMeta[filter.key].count.toLocaleString("ko-KR")}</strong>
                  </button>
                ))}
              </div>
              <label className="certificate-search">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="고객명, 상호, 사업자번호, 인증서명"
                />
              </label>
              <details className="certificate-advanced-filters">
                <summary>세부 필터 보기</summary>
                <div className="certificate-filter-group">
                  <button
                    type="button"
                    className={customerFilter === "action_needed" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => {
                      setCustomerFilter("action_needed");
                      setActiveDataTab("linked");
                    }}
                  >
                    조치 필요
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "all" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => {
                      setCustomerFilter("all");
                      setActiveDataTab("linked");
                    }}
                  >
                    전체 보기
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "prepare_needed" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => {
                      setCustomerFilter("prepare_needed");
                      setActiveDataTab("linked");
                    }}
                  >
                    준비 필요
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "payment_ready" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => {
                      setCustomerFilter("payment_ready");
                      setActiveDataTab("linked");
                    }}
                  >
                    결제 가능
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "expiring_30" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => {
                      setCustomerFilter("expiring_30");
                      setActiveDataTab("linked");
                    }}
                  >
                    30일 이내 만료
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "missing_general" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => {
                      setCustomerFilter("missing_general");
                      setActiveDataTab("linked");
                    }}
                  >
                    범용 없음
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "missing_electronic" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => {
                      setCustomerFilter("missing_electronic");
                      setActiveDataTab("linked");
                    }}
                  >
                    전자세금 없음
                  </button>
                </div>
              </details>
            </div>
            <div className="certificate-focus-note">
              <span className={customerFilter === "action_needed" ? "chip chip-warn" : "chip"}>
                {customerFilter === "action_needed" ? "기본 보기" : "현재 보기"}
              </span>
              <span>{filterMeta[customerFilter].summary}</span>
            </div>
            <div className="certificate-queue-toolbar">
              <div className="certificate-queue-summary">
                <span className="certificate-queue-chip">선택 고객 {selectedManagedRows.length}명</span>
                <span className="certificate-queue-chip is-prepare">준비 필요 {selectedPrepareCertificates.length}건</span>
                <span className="certificate-queue-chip is-payment">결제 대기 {selectedPaymentCertificates.length}건</span>
              </div>
              <div className="certificate-queue-actions">
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
                <button
                  disabled={assistantBusyKey !== null || helperUpgradeRequired || batchPrepareState.active || selectedPrepareCertificates.length === 0}
                  title={helperUpgradeRequired ? certificateStatusBody : undefined}
                  onClick={() => {
                    void prepareVisibleCertificates();
                  }}
                >
                  {batchPrepareState.active
                    ? `일괄 갱신 준비 중... (${batchPrepareState.completed}/${batchPrepareState.total})`
                    : "일괄 갱신 준비"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={assistantBusyKey !== null || helperUpgradeRequired || selectedPaymentCertificates.length === 0}
                  title={helperUpgradeRequired ? certificateStatusBody : undefined}
                  onClick={() =>
                    void props.runAction("customer-certificate-open-next-payment", openNextPaymentCertificate, {
                      reload: false
                    })
                  }
                >
                  {assistantBusyKey === "customer-certificate-open-next-payment" ? "결제 창 여는 중..." : "다음 결제 열기"}
                </button>
              </div>
            </div>
            {queueNotice ? (
              <div className="certificate-inline-note" role="status">
                <span className="chip chip-warn">안내</span>
                <span>{queueNotice}</span>
              </div>
            ) : null}
          </section>
        ) : null}
      </aside>

      <section className="certificate-main-panel">
        <div className="certificate-main-head">
          <div className="certificate-main-copy">
            <h3>{activeDataTab === "linked" ? linkedPanelTitle : unlinkedPanelTitle}</h3>
            <p>{activeDataTab === "linked" ? linkedPanelSummary : unlinkedPanelSummary}</p>
          </div>
          <div className="certificate-main-tabs" role="tablist" aria-label="인증서 데이터 보기">
            <button
              type="button"
              role="tab"
              aria-selected={activeDataTab === "linked"}
              className={activeDataTab === "linked" ? "certificate-main-tab active" : "certificate-main-tab"}
              onClick={() => setActiveDataTab("linked")}
            >
              고객 상태 {filteredLinkedCustomerRows.length}명
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeDataTab === "unlinked"}
              className={activeDataTab === "unlinked" ? "certificate-main-tab active" : "certificate-main-tab"}
              onClick={() => setActiveDataTab("unlinked")}
            >
              미연결 예외 {filteredUnlinkedCertificates.length}건
            </button>
          </div>
        </div>

        <div className="certificate-main-body">
          {activeDataTab === "linked" ? (
            <section className="certificate-main-section">
              <div className="certificate-table-section-head">
                <strong>{customerFilter === "action_needed" ? "조치 대상 목록" : "고객 상태 목록"}</strong>
                <span>{filteredLinkedCustomerRows.length}명</span>
              </div>
              <div className="certificate-table-wrap certificate-main-table-wrap">
                {filteredLinkedCustomerRows.length > 0 ? (
                  <table className="certificate-table certificate-linked-table">
                    <colgroup>
                      <col className="certificate-col-customer" />
                      <col className="certificate-col-electronic" />
                      <col className="certificate-col-general" />
                      <col className="certificate-col-status" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>고객</th>
                        <th>전자세금</th>
                        <th>범용</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLinkedCustomerRows.map((row) => {
                        const rowStory = getCustomerRowStory(row);
                        const isRowSelected = Boolean(selectedManagedCustomerIds[row.customer.id]);
                        const rowToneClass = !row.hasElectronicTax
                          ? "is-danger"
                          : row.hasPaymentReady
                            ? "is-success"
                            : row.hasPrepareNeeded || row.hasExpiringSoon || !row.hasGeneral
                              ? "is-warn"
                              : "is-default";
                        const statusBadges: Array<{ label: string; tone: CertificateStatusBadgeTone }> = [
                          ...(row.hasPaymentReady ? [{ label: "결제 가능", tone: "success" as const }] : []),
                          ...(row.hasPrepareNeeded ? [{ label: "준비 필요", tone: "warn" as const }] : []),
                          ...(!row.hasElectronicTax ? [{ label: "전자세금 없음", tone: "danger" as const }] : []),
                          ...(!row.hasGeneral ? [{ label: "범용 없음", tone: "warn" as const }] : []),
                          ...(row.hasExpiringSoon ? [{ label: "30일 내 만료", tone: "warn" as const }] : [])
                        ];
                        if (statusBadges.length === 0) {
                          statusBadges.push({ label: "정상", tone: "default" as const });
                        }

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
                                <small>{row.customer.businessNumber}</small>
                              </div>
                            </td>
                            <td>{renderLinkedCertificateList(row.electronicTaxCertificates, "전자세금")}</td>
                            <td>{renderLinkedCertificateList(row.generalCertificates, "범용")}</td>
                            <td>
                              <div className="certificate-table-status certificate-table-status-list compact">
                                <strong>{rowStory.headline}</strong>
                                <span>{rowStory.body}</span>
                                <div className="certificate-status-badges">
                                  {statusBadges.map((badge) => (
                                    <span
                                      key={`${row.customer.id}-${badge.label}`}
                                      className={
                                        badge.tone === "default"
                                          ? "certificate-status-badge"
                                          : `certificate-status-badge ${badge.tone}`
                                      }
                                    >
                                      {badge.label}
                                    </span>
                                  ))}
                                </div>
                                <div className="certificate-row-actions" onClick={stopRowSelection}>
                                  {rowStory.actionLabel ? (
                                    <button
                                      type="button"
                                      className={rowStory.actionKind === "open-payment" || rowStory.actionKind === "prepare" ? undefined : "btn-secondary"}
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
                                  <span className="certificate-row-hint">
                                    {isRowSelected ? "선택됨 · 왼쪽 일괄 작업 포함" : "행 클릭 시 왼쪽 목록에 추가"}
                                  </span>
                                </div>
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
          ) : (
            <section className="certificate-main-section">
              <div className="certificate-table-section-head">
                <strong>미연결 인증서 목록</strong>
                <span>
                  {filteredUnlinkedCertificates.length}건
                  {filteredUnlinkedCertificates.length > 0 ? ` · 추천 후보 ${filteredUnlinkedSuggestedCount}건` : ""}
                </span>
              </div>
              <div className="certificate-table-wrap certificate-main-table-wrap">
                {filteredUnlinkedCertificates.length > 0 ? (
                  <table className="certificate-table certificate-unlinked-table">
                    <colgroup>
                      <col className="certificate-col-certificate" />
                      <col className="certificate-col-suggested" />
                      <col className="certificate-col-link" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>인증서</th>
                        <th>추천 고객</th>
                        <th>연결</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnlinkedCertificates.map((item) => {
                        const selectedCustomerValue =
                          selectedCustomerIds[item.key] ?? String(item.suggestedCustomerId ?? "");

                        return (
                          <tr key={item.key} className={item.suggestedCustomerLabel ? "certificate-table-row is-suggested" : "certificate-table-row"}>
                            <td>
                              <div className="certificate-table-customer">
                                <strong>{item.certificateCn}</strong>
                                <span>{getCertificateKindLabel(item.certificateKind)} · {item.issuerName || "-"}</span>
                                <small>{props.formatCertificateExpireDate(item.certificateExpireDate)}</small>
                              </div>
                            </td>
                            <td>
                              <div className="certificate-table-status">
                                <strong>{item.suggestedCustomerLabel || "자동 후보 없음"}</strong>
                                {item.suggestedCustomerLabel ? (
                                  <span>
                                    {item.suggestionCount > 1
                                      ? `자동 후보 ${item.suggestionCount}명`
                                      : "자동 연결 후보 1명"}
                                  </span>
                                ) : (
                                  <span>{item.statusText}</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="certificate-table-actions certificate-table-actions-stack">
                                <select
                                  value={selectedCustomerValue}
                                  onClick={stopRowSelection}
                                  onChange={(event) =>
                                    setSelectedCustomerIds((prev) => ({
                                      ...prev,
                                      [item.key]: event.target.value
                                    }))
                                  }
                                  disabled={assistantBusyKey !== null || batchPrepareState.active}
                                >
                                  <option value="">고객 선택</option>
                                  {customerOptions.map((customer) => (
                                    <option key={`${item.key}-customer-${customer.id}`} value={customer.id}>
                                      {customer.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  disabled={assistantBusyKey !== null || batchPrepareState.active || !selectedCustomerValue}
                                  onClick={() =>
                                    void props.runAction(
                                      `customer-certificate-link-${item.certificateIndex}`,
                                      async () => props.onLinkCustomerCertificate(item.certificateIndex, Number(selectedCustomerValue))
                                    )
                                  }
                                >
                                  {activeLinkCertificateIndex === item.certificateIndex ? "연결 중..." : "고객 연결"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className={`context-empty-state ${unlinkedTableEmptyState?.tone === "success" ? "tone-success" : "tone-info"}`}>
                    <strong>{unlinkedTableEmptyState?.title}</strong>
                    <p>{unlinkedTableEmptyState?.body}</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
