import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { SurfaceCard } from "../../components/ui";
import type { Customer, CustomerCertificateKind } from "../../types";

export type CertificateCustomerFilter =
  | "action_needed"
  | "all"
  | "prepare_needed"
  | "payment_ready"
  | "expiring_30"
  | "missing_general"
  | "missing_electronic";

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
  filterIntent?: { filter: CertificateCustomerFilter; nonce: number } | null;
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
  const [customerFilter, setCustomerFilter] = useState<CertificateCustomerFilter>("action_needed");
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

  useEffect(() => {
    if (!props.filterIntent) {
      return;
    }

    setCustomerFilter(props.filterIntent.filter);
  }, [props.filterIntent?.nonce]);
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
  const certificateHeroMetrics = [
    { label: "로컬 읽음", value: `${props.customerRenewalLoadedCertificateCount}건`, note: "고객 PC에서 읽은 인증서" },
    { label: "조치 필요", value: `${actionNeededCustomerCount}명`, note: "결제·준비·만료 점검 고객" },
    { label: "미연결", value: `${unlinkedCount}건`, note: "수동 연결이 필요한 인증서" }
  ];
  const hasNoCertificateData = props.customerRenewalLoadedCertificateCount === 0 && props.certificateItems.length === 0;
  const activeFilterMeta = filterMeta[customerFilter];
  const focusFilters: CertificateCustomerFilter[] = ["action_needed", "payment_ready", "prepare_needed"];
  const extraFilters: CertificateCustomerFilter[] = ["expiring_30", "missing_general", "missing_electronic"];
  const certificateHeroTitle = !props.customerRenewalAssistantOnline
    ? "로컬 헬퍼를 먼저 연결하면 인증서 읽기와 갱신 준비를 같은 화면에서 이어갈 수 있습니다."
    : actionNeededCustomerCount > 0
      ? `지금 우선 확인할 고객 ${actionNeededCustomerCount}명을 먼저 정리하세요.`
      : props.customerRenewalLoadedCertificateCount === 0
        ? "아직 읽은 인증서가 없습니다. 고객 PC에서 공동인증서를 먼저 읽어오세요."
        : "연결된 인증서 상태가 안정적입니다. 결제·갱신 대기 건만 이어서 처리하면 됩니다.";
  const certificateHeroDescription = !props.customerRenewalAssistantOnline
    ? "헬퍼 연결 후 공동인증서를 읽으면 연결·미연결·결제 가능 상태가 즉시 집계됩니다."
    : "조치 필요 고객부터 읽기·연결·결제 순으로 정리하세요.";
  const queueStatusLabel = batchPrepareState.active
    ? `일괄 갱신 준비 ${batchPrepareState.completed}/${batchPrepareState.total}`
    : selectedPaymentCertificates.length > 0
      ? `결제 대기 ${selectedPaymentCertificates.length}건`
      : selectedPrepareCertificates.length > 0
        ? `준비 필요 ${selectedPrepareCertificates.length}건`
        : "선택된 조치 없음";
  const queueStatusDetail =
    queueNotice ||
    (selectedManagedRows.length > 0
      ? "선택 고객 기준으로 일괄 갱신 준비 또는 다음 결제 열기를 바로 실행할 수 있습니다."
      : "고객을 선택하면 준비 필요와 결제 대기 인증서를 여기서 바로 처리할 수 있습니다.");

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
    <div className="stitch-certificate-screen">
      <div className="stitch-certificate-grid">
        <div className="stitch-certificate-main">
        <SurfaceCard className="stitch-certificate-card stitch-certificate-controls-card">
        <div className="stitch-certificate-compact-head">
          <div className="stitch-certificate-compact-copy">
            <span className="stitch-screen-hero-eyebrow">인증서 운영 센터</span>
            <strong>{certificateHeroTitle}</strong>
            <p>{certificateHeroDescription}</p>
          </div>
          <div className="stitch-certificate-compact-actions">
            <button
              type="button"
              disabled={assistantBusyKey !== null}
              onClick={() => void props.runAction("customer-renewal-bridge-probe", props.onLoadCustomerRenewalCertificates, { reload: false })}
            >
              {isLoadingRenewalCertificates ? "읽는 중..." : "공동인증서 읽기"}
            </button>
          </div>
        </div>
        <div className="stitch-certificate-compact-metrics" aria-label="인증서 운영 요약">
          {certificateHeroMetrics.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
        {!props.customerRenewalAssistantOnline ? (
          <div className="helper-box import-helper-box">
            <strong>로컬 헬퍼가 필요합니다.</strong>
            <span>{props.customerRenewalAssistantHelperMessage || "고객 PC에서 로컬 헬퍼를 실행한 뒤 다시 시도하세요."}</span>
          </div>
        ) : null}

        {props.customerRenewalAssistantOnline ? (
          <div className="stitch-certificate-overview">
            <div className="stitch-certificate-focus-grid">
              {focusFilters.map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  className={
                    customerFilter === filterKey
                      ? `stitch-certificate-focus-card tone-${filterKey === "payment_ready" ? "success" : "warn"} active`
                      : `stitch-certificate-focus-card tone-${filterKey === "payment_ready" ? "success" : "warn"}`
                  }
                  onClick={() => setCustomerFilter(filterKey)}
                >
                  <div className="stitch-certificate-focus-card-head">
                    <span>{filterMeta[filterKey].label}</span>
                    <span className={filterKey === "action_needed" || filterKey === "prepare_needed" ? "chip chip-warn" : filterKey === "payment_ready" ? "chip chip-success" : "chip"}>
                      {customerFilter === filterKey ? "현재 보기" : "바로 보기"}
                    </span>
                  </div>
                  <strong>{filterMeta[filterKey].count}명</strong>
                  <span className="stitch-certificate-focus-note">{filterMeta[filterKey].summary}</span>
                </button>
              ))}
            </div>
            <div className="stitch-certificate-toolbar">
              <label className="stitch-certificate-search">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="고객명, 상호, 사업자번호, 인증서명"
                />
              </label>
              <details className="stitch-certificate-extra-filters">
                <summary>예외 필터</summary>
                <div className="stitch-certificate-filter-group">
                  {extraFilters.map((filterKey) => (
                    <button
                      key={filterKey}
                      type="button"
                      className={customerFilter === filterKey ? "chip chip-filter active" : "chip chip-filter"}
                      onClick={() => setCustomerFilter(filterKey)}
                    >
                      {filterMeta[filterKey].label} {filterMeta[filterKey].count}명
                    </button>
                  ))}
                </div>
              </details>
            </div>
            {queueNotice ? (
              <div className="stitch-certificate-inline-note" role="status">
                <span className="chip chip-warn">안내</span>
                <span>{queueNotice}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        </SurfaceCard>

        <SurfaceCard className="stitch-certificate-card">
          <div className="stitch-certificate-section-head">
            <strong>{customerFilter === "action_needed" ? "조치 필요 고객" : customerFilter === "all" ? "고객별 공동인증서" : `${activeFilterMeta.label} 고객`}</strong>
            <span>{filteredLinkedCustomerRows.length}명</span>
          </div>
          <div className="stitch-certificate-table-wrap">
            {filteredLinkedCustomerRows.length > 0 ? (
              <table className="stitch-certificate-table">
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
                          <div className="stitch-certificate-table-customer">
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
              <div className="stitch-certificate-empty-state">
                <strong>
                  {linkedCustomerRows.length > 0
                    ? "현재 검색/필터 조건에 맞는 고객이 없습니다."
                    : "고객과 연결된 공동인증서가 아직 없습니다."}
                </strong>
                <p>
                  {linkedCustomerRows.length > 0
                    ? "검색어를 줄이거나 필터를 바꿔서 결제 가능 고객, 준비 필요 고객을 다시 확인하세요."
                    : hasNoCertificateData
                      ? "고객 PC에서 공동인증서를 읽고 필요한 고객부터 연결하면 갱신·결제 대기 흐름이 자동으로 정리됩니다."
                      : "로컬에서 읽은 공동인증서를 고객에 연결하면 상태와 만료 위험을 함께 관리할 수 있습니다."}
                </p>
                <div className="stitch-certificate-empty-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!props.customerRenewalAssistantOnline || assistantBusyKey !== null}
                    onClick={() => void props.runAction("customer-renewal-bridge-probe", props.onLoadCustomerRenewalCertificates, { reload: false })}
                  >
                    공동인증서 다시 읽기
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setShowUnlinkedCertificates(true)}>
                    미연결 인증서 펼치기
                  </button>
                </div>
                <div className="stitch-certificate-empty-checklist">
                  <span>1. 로컬 헬퍼 연결 확인</span>
                  <span>2. 공동인증서 읽기</span>
                  <span>3. 고객 연결 후 조치 필요 목록 정리</span>
                </div>
                <div className="stitch-certificate-empty-preview">
                  <span>로컬 읽음 → 고객 연결 → 결제/준비 대기 분류</span>
                </div>
                <div className="stitch-certificate-empty-sample">
                  <div className="stitch-empty-sample-meta">
                    <span>예상 흐름</span>
                    <span>연결 후 집계</span>
                  </div>
                  <div className="stitch-empty-preview-table">
                    <div className="stitch-empty-preview-head">
                      <span>고객</span>
                      <span>인증서</span>
                      <span>상태</span>
                      <span>다음 단계</span>
                    </div>
                    <div className="stitch-empty-preview-row">
                      <strong>해성태양광</strong>
                      <span>전자세금 인증서</span>
                      <span className="chip chip-warn">준비 필요</span>
                      <span>결제 대기 확인</span>
                    </div>
                    <div className="stitch-empty-preview-row">
                      <strong>동해에너지</strong>
                      <span>범용 인증서</span>
                      <span className="chip chip-success">결제 대기</span>
                      <span>다음 결제 열기</span>
                    </div>
                  </div>
                  <small>예: 전자세금 인증서 만료 14일 전 · 결제 대기 1건</small>
                </div>
              </div>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard className="stitch-certificate-card">
          <div className="stitch-certificate-section-head">
            <strong>{customerFilter === "action_needed" ? "바로 연결할 미연결 공동인증서" : "미연결 공동인증서"}</strong>
            <div className="stitch-certificate-section-actions">
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
          <div className="stitch-certificate-table-wrap unlinked">
            {filteredUnlinkedCertificates.length > 0 ? (
              <table className="stitch-certificate-table">
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
                          <div className="stitch-certificate-table-customer">
                            <strong>{item.certificateCn}</strong>
                            <span>{getCertificateKindLabel(item.certificateKind)} · {item.issuerName || "-"}</span>
                            <small>{props.formatCertificateExpireDate(item.certificateExpireDate)}</small>
                          </div>
                        </td>
                        <td>
                          <div className="stitch-certificate-table-status">
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
                          <div className="stitch-certificate-table-actions stitch-certificate-table-actions-stack">
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
              <div className="stitch-certificate-empty-state compact">
                <strong>
                  {props.customerRenewalAssistantOnline
                    ? unlinkedCertificates.length > 0
                      ? "현재 검색 조건에 맞는 미연결 공동인증서가 없습니다."
                      : "미연결 공동인증서가 없습니다."
                    : "먼저 로컬 헬퍼 연결을 확인하세요."}
                </strong>
                <p>
                  {props.customerRenewalAssistantOnline
                    ? "자동 후보가 잡히지 않는 경우에만 이 영역을 펼쳐 예외 연결을 처리하면 됩니다."
                    : "고객 PC에서 로컬 헬퍼를 실행하면 인증서를 읽고 연결 후보를 다시 계산할 수 있습니다."}
                </p>
                <div className="stitch-certificate-empty-preview">
                  <span>예외 연결이 필요할 때만 펼치기</span>
                </div>
              </div>
            )}
          </div>
          ) : (
            <div className="stitch-certificate-collapsed-note">
              미연결 공동인증서는 예외 처리용입니다. 필요할 때만 펼쳐서 연결하세요.
            </div>
          )}
        </SurfaceCard>
        </div>

        <aside className="stitch-certificate-side">
          <SurfaceCard className="stitch-certificate-side-card">
            <div className="stitch-certificate-side-head">
              <div>
                <strong>우선 조치 패널</strong>
                <span>선택 고객, 로컬 헬퍼, 다음 액션을 함께 봅니다.</span>
              </div>
              <span className={props.customerRenewalAssistantOnline ? "chip chip-success" : "chip chip-danger"}>
                {props.customerRenewalAssistantOnline ? "헬퍼 연결됨" : "헬퍼 연결 안 됨"}
              </span>
            </div>
            <div className="stitch-certificate-side-meta">
              <span>선택 고객 {selectedManagedRows.length}명</span>
              <span>준비 필요 {selectedPrepareCertificates.length}건</span>
              <span>결제 대기 {selectedPaymentCertificates.length}건</span>
              {batchPrepareState.active ? <span>현재 {batchPrepareState.currentCertificateCn || "-"}</span> : null}
            </div>
            <div className="stitch-certificate-side-body">
              <strong>{queueStatusLabel}</strong>
              <p>{queueStatusDetail}</p>
            </div>
            <div className="stitch-certificate-side-actions">
              <button type="button" className="btn-secondary" disabled={filteredLinkedCustomerRows.length === 0} onClick={selectAllFilteredCustomers}>
                전체 선택
              </button>
              <button type="button" className="btn-secondary" disabled={selectedManagedRows.length === 0} onClick={clearFilteredCustomerSelection}>
                선택 해제
              </button>
              <button
                className={selectedPrepareCertificates.length === 0 && !batchPrepareState.active ? "btn-secondary" : undefined}
                disabled={assistantBusyKey !== null || batchPrepareState.active || selectedPrepareCertificates.length === 0}
                onClick={() => {
                  void prepareVisibleCertificates();
                }}
              >
                {batchPrepareState.active ? `일괄 갱신 준비 중... (${batchPrepareState.completed}/${batchPrepareState.total})` : "일괄 갱신 준비"}
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
            <div className="stitch-certificate-helper-inline">
              <div className="stitch-certificate-helper-inline-head">
                <strong>로컬 헬퍼 상태</strong>
                <span>{props.customerRenewalAssistantOnline ? "정상 작동 중" : "연결 확인 필요"}</span>
              </div>
              <div className="stitch-certificate-side-meta">
                <span>버전 {props.customerRenewalAssistantHelperVersion ? `v${props.customerRenewalAssistantHelperVersion}` : "-"}</span>
                <span>로컬 읽음 {props.customerRenewalLoadedCertificateCount}건</span>
                <span>연결 완료 {linkedCount}건</span>
                <span>미연결 {unlinkedCount}건</span>
              </div>
              <p>{props.customerRenewalAssistantHelperMessage}</p>
              <div className="stitch-certificate-helper-inline-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={assistantBusyKey !== null}
                  onClick={() => void props.runAction("customer-renewal-refresh", props.onRefreshCustomerRenewalAssistant, { reload: false })}
                >
                  {isRefreshingRenewalAssistant ? "확인 중..." : "헬퍼 상태 새로고침"}
                </button>
              </div>
            </div>
          </SurfaceCard>
        </aside>
      </div>
    </div>
  );
}
