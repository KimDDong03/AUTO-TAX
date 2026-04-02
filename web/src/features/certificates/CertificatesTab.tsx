import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Panel } from "../../components/ui";
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

type CertificatesTabProps = {
  customers: Customer[];
  busyKey: string | null;
  canUseCustomerRenewalAssistant: boolean;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalLoadedCertificateCount: number;
  certificateItems: CertificateTabItem[];
  onRefreshCustomerRenewalAssistant: () => Promise<void>;
  onLoadCustomerRenewalCertificates: () => Promise<void>;
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

export function CertificatesTab(props: CertificatesTabProps) {
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
  const [showUnlinkedCertificates, setShowUnlinkedCertificates] = useState(false);
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
  const linkedCount = props.certificateItems.filter((item) => item.linkedCustomerId !== null).length;
  const unlinkedCount = props.certificateItems.length - linkedCount;
  const paymentReadyCount = props.certificateItems.filter((item) => item.canOpenPayment).length;
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
      summary: "결제·준비·만료 고객만 표시",
      count: actionNeededCustomerCount
    },
    all: {
      label: "전체 보기",
      summary: "연결 고객 전체",
      count: linkedCustomerRows.length
    },
    prepare_needed: {
      label: "준비 필요",
      summary: "갱신 준비 필요만",
      count: prepareNeededCustomerCount
    },
    payment_ready: {
      label: "결제 가능",
      summary: "바로 결제 가능",
      count: paymentReadyCustomerCount
    },
    expiring_30: {
      label: "30일 내 만료",
      summary: "30일 내 만료",
      count: expiringCustomerCount
    },
    missing_general: {
      label: "범용 없음",
      summary: "범용 없음",
      count: missingGeneralCustomerCount
    },
    missing_electronic: {
      label: "전자세금 없음",
      summary: "전자세금 없음",
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
      return <span className="certificate-cell-empty">-</span>;
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
                disabled={assistantBusyKey !== null || (batchPrepareState.active && !item.canOpenPayment)}
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
                    ? "결제"
                    : "준비"}
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
                  {activeUnlinkCertificateId === item.linkedCertificateId ? "해제 중..." : "해제"}
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
      <Panel
        className="panel-customer-renewal"
        title="공동인증서"
        subtitle="조치가 필요한 고객만 먼저 봅니다."
        actions={(
          <>
            <button
              className="btn-secondary"
              disabled={assistantBusyKey !== null}
              onClick={() => void props.runAction("customer-renewal-refresh", props.onRefreshCustomerRenewalAssistant, { reload: false })}
            >
              {isRefreshingRenewalAssistant ? "확인 중..." : "새로고침"}
            </button>
            <button
              disabled={assistantBusyKey !== null}
              onClick={() => void props.runAction("customer-renewal-bridge-probe", props.onLoadCustomerRenewalCertificates, { reload: false })}
            >
              {isLoadingRenewalCertificates ? "읽는 중..." : "공동인증서 읽기"}
            </button>
          </>
        )}
      >
        {!props.customerRenewalAssistantOnline ? (
          <div className="helper-box import-helper-box">
            <strong>로컬 헬퍼가 필요합니다.</strong>
            <span>{props.customerRenewalAssistantHelperMessage || "고객 PC에서 로컬 헬퍼를 실행한 뒤 다시 시도하세요."}</span>
          </div>
        ) : null}

        {props.customerRenewalAssistantOnline ? (
          <div className="certificate-overview">
            <div className="certificate-stat-strip">
              <span className="certificate-stat-pill">로컬 읽음 {props.customerRenewalLoadedCertificateCount}건</span>
              <span className="certificate-stat-pill accent">조치 필요 고객 {actionNeededCustomerCount}명</span>
              <span className="certificate-stat-pill">연결 완료 {linkedCount}건</span>
              <span className={unlinkedCount > 0 ? "certificate-stat-pill accent" : "certificate-stat-pill"}>미연결 {unlinkedCount}건</span>
              <span className="certificate-stat-pill accent">결제 가능 {paymentReadyCount}건</span>
            </div>
            <div className="certificate-controls">
              <div className="certificate-focus-grid">
                {focusFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className={customerFilter === filter.key ? "certificate-focus-card active" : "certificate-focus-card"}
                    onClick={() => setCustomerFilter(filter.key)}
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
                    onClick={() => setCustomerFilter("action_needed")}
                  >
                    조치 필요
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "all" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => setCustomerFilter("all")}
                  >
                    전체 보기
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "prepare_needed" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => setCustomerFilter("prepare_needed")}
                  >
                    준비 필요
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "payment_ready" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => setCustomerFilter("payment_ready")}
                  >
                    결제 가능
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "expiring_30" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => setCustomerFilter("expiring_30")}
                  >
                    30일 이내 만료
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "missing_general" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => setCustomerFilter("missing_general")}
                  >
                    범용 없음
                  </button>
                  <button
                    type="button"
                    className={customerFilter === "missing_electronic" ? "chip chip-filter active" : "chip chip-filter"}
                    onClick={() => setCustomerFilter("missing_electronic")}
                  >
                    전자세금 없음
                  </button>
                </div>
              </details>
            </div>
            {customerFilter === "action_needed" ? (
              <div className="certificate-focus-note">
                <span className="chip chip-warn">기본 보기</span>
                <span>결제 가능·준비 필요·만료 임박만 표시</span>
              </div>
            ) : (
              <div className="certificate-focus-note">
                <span className="chip">현재 보기</span>
                <span>{filterMeta[customerFilter].summary}</span>
              </div>
            )}
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
                  disabled={assistantBusyKey !== null || batchPrepareState.active || selectedPrepareCertificates.length === 0}
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
                  disabled={assistantBusyKey !== null || selectedPaymentCertificates.length === 0}
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
          </div>
        ) : null}

        <div className="certificate-table-section">
          <div className="certificate-table-section-head">
            <strong>{customerFilter === "action_needed" ? "조치 필요 고객" : "고객별 공동인증서"}</strong>
            <span>{filteredLinkedCustomerRows.length}명</span>
          </div>
          <div className="certificate-table-wrap">
            {filteredLinkedCustomerRows.length > 0 ? (
              <table className="certificate-table">
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
                        className={`certificate-table-row ${rowToneClass}${selectedManagedCustomerIds[row.customer.id] ? " is-selected" : ""}`}
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
                            <strong>
                              {row.hasPaymentReady
                                ? "결제 대기"
                                : row.hasPrepareNeeded
                                  ? "준비 필요"
                                  : row.hasExpiringSoon
                                    ? "만료 임박"
                                    : "정상"}
                            </strong>
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
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty">
                {linkedCustomerRows.length > 0
                  ? "현재 검색/필터 조건에 맞는 고객이 없습니다."
                  : "고객과 연결된 공동인증서가 없습니다."}
              </div>
            )}
          </div>
        </div>

        <div className="certificate-table-section">
          <div className="certificate-table-section-head">
            <strong>{customerFilter === "action_needed" ? "바로 연결할 미연결 공동인증서" : "미연결 공동인증서"}</strong>
            <div className="certificate-table-section-actions">
              <span>
                {filteredUnlinkedCertificates.length}건
                {filteredUnlinkedCertificates.length > 0 ? ` · 추천 후보 ${filteredUnlinkedSuggestedCount}건` : ""}
              </span>
              <button
                type="button"
                className="btn-secondary certificate-section-toggle"
                onClick={() => setShowUnlinkedCertificates((prev) => !prev)}
              >
                {showUnlinkedCertificates ? "접기" : "펼치기"}
              </button>
            </div>
          </div>
          {showUnlinkedCertificates ? (
          <div className="certificate-table-wrap unlinked">
            {filteredUnlinkedCertificates.length > 0 ? (
              <table className="certificate-table">
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
              <div className="empty">
                {props.customerRenewalAssistantOnline
                  ? unlinkedCertificates.length > 0
                    ? "현재 검색 조건에 맞는 미연결 공동인증서가 없습니다."
                    : "미연결 공동인증서가 없습니다."
                  : "먼저 로컬 헬퍼 연결을 확인하세요."}
              </div>
            )}
          </div>
          ) : (
            <div className="certificate-collapsed-note">
              미연결 공동인증서는 예외 처리용입니다. 필요할 때만 펼쳐서 연결하세요.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
