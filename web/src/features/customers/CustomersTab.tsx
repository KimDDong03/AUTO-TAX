import { useEffect, useMemo, useState } from "react";
import type React from "react";
import type { Customer, InvoiceDraft } from "../../types";

type CustomerFormState = {
  id: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  issueMode: "review" | "auto";
  popbillUserId: string;
  popbillPassword: string;
  renewalContactMobile: string;
  memo: string;
};

type CustomerDetailTabId = "info" | "history";
type CustomerListFilter = "all" | "blocked" | "ready" | "expiring" | "unjoined";
type CustomerIssueReadiness = {
  canIssueNow: boolean;
  label: string;
  tone: "success" | "warn" | "danger";
  reason: string;
};

type CustomerActionKind = "join-popbill" | "register-certificate" | "check-certificate" | "open-detail";

type CustomerIssueChecklistItem = {
  key: string;
  label: string;
  tone: "success" | "warn" | "danger";
  actionLabel?: string;
  actionKind?: Exclude<CustomerActionKind, "open-detail">;
};

type CustomerRenewalCandidateView = {
  customerId: number;
  customerName: string;
  corpName: string;
  certificateCn: string;
  certificateExpireDate: string | null;
  certificateUsage: string;
  statusText: string;
  statusTone: "success" | "warn" | "danger" | "default";
  paymentAmount: string | null;
  canOpenPayment: boolean;
};

type CustomerPrimaryAction = {
  label: string;
  kind: CustomerActionKind;
};

type CustomerInspectorFact = {
  label: string;
  value: string;
  wide?: boolean;
};

type CustomerConsoleTone = CustomerIssueReadiness["tone"] | "default";

type CustomerStatusBadge = {
  label: string;
  tone: CustomerConsoleTone;
  detail?: string;
};

type CustomersTabProps = {
  customers: Customer[];
  expiredCertCustomers: Customer[];
  expiringSoonCustomers: Customer[];
  filteredCustomers: Customer[];
  selectedCustomer: Customer | null;
  creatingCustomer: boolean;
  selectedCustomerReadiness: CustomerIssueReadiness | null;
  selectedCustomerIssues: CustomerIssueChecklistItem[];
  selectedCustomerIssuedDrafts: InvoiceDraft[];
  blockedCustomerCount: number;
  readyCustomerCount: number;
  expiringSoonCustomerCount: number;
  popbillPendingCustomerCount: number;
  busyKey: string | null;
  isSavingCustomer: boolean;
  customerSearchQuery: string;
  customerListFilter: CustomerListFilter;
  customerDetailTab: CustomerDetailTabId;
  customerForm: CustomerFormState;
  customerCertNotice: string;
  customerAddressResolveMessage: string;
  mailboxDataLoading: boolean;
  canUseCustomerRenewalAssistant: boolean;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalLoadedCertificateCount: number;
  renewableCustomers: CustomerRenewalCandidateView[];
  customerNameInputRef: React.RefObject<HTMLInputElement | null>;
  customerAddressLookupRef: React.MutableRefObject<string>;
  setCustomerSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setCustomerListFilter: React.Dispatch<React.SetStateAction<CustomerListFilter>>;
  setCustomerDetailTab: React.Dispatch<React.SetStateAction<CustomerDetailTabId>>;
  setCustomerForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  setCustomerAddressResolveMessage: React.Dispatch<React.SetStateAction<string>>;
  onCreateCustomer: () => void;
  onCancelCreateCustomer: () => void;
  onRefreshCustomerRenewalAssistant: () => Promise<void>;
  onLoadCustomerRenewalCertificates: () => Promise<void>;
  onStartCustomerRenewal: (customerId: number) => Promise<void>;
  onSelectCustomer: (customer: Customer) => void;
  onSaveCustomer: () => Promise<void>;
  onJoinCustomerPopbill: (customerId: number) => Promise<void>;
  onOpenCustomerCertRegistration: (customerId: number) => Promise<void>;
  onRefreshCustomerCertificateStatus: (customerId: number) => Promise<void>;
  onRefreshAllCertificateStatuses: () => Promise<void>;
  onResetPopbillLink: (customer: Customer) => Promise<void>;
  onDeleteCustomer: (customer: Customer) => Promise<void>;
  onShowDraftPopbillInfo: (draftId: number) => Promise<void>;
  onOpenDraftPopbillUrl: (draftId: number, path: "view-url" | "print-url") => Promise<void>;
  resolveCustomerAddress: () => Promise<string>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatCertificateExpireDate: (value: string | null) => string;
  getCustomerIssueReadiness: (customer: Customer) => CustomerIssueReadiness;
  getCustomerCertificateSummary: (customer: Customer) => string;
  getCustomerPopbillSummary: (customer: Customer) => string;
  getIssueModeLabel: (issueMode: "review" | "auto") => string;
  getDraftConfirmNumber: (draft: InvoiceDraft) => string | null;
  formatDateTime: (value: string | null) => string;
  formatMoney: (value: number) => string;
};

function getToneBadgeClass(tone: CustomerConsoleTone) {
  return [
    "customer-tone-badge",
    tone === "success"
      ? "tone-success"
      : tone === "warn"
        ? "tone-warn"
        : tone === "danger"
          ? "tone-danger"
          : "tone-default"
  ].join(" ");
}

function getIssueModeGuide(issueMode: Customer["issueMode"]): string {
  return issueMode === "auto"
    ? "설정된 고객만 월 자동 발행합니다. 실패 시 실패 초안이 남아 검수 후 직접 발행으로 복구할 수 있습니다."
    : "초안 검수 뒤 로그인 사용자가 직접 발행합니다. 최소 1회 이상 정상 발행 경험 후 자동 전환을 권장합니다.";
}

function getIssueModeListHint(issueMode: Customer["issueMode"]): string {
  return issueMode === "auto"
    ? "설정 기반 자동 발행 · 실패 시 직접 발행 복구"
    : "로그인 사용자가 직접 발행 · 정상 발행 후 auto 권장";
}

export function CustomersTab(props: CustomersTabProps) {
  const selectedCustomer = props.selectedCustomer;
  const selectedCustomerReadiness = props.selectedCustomerReadiness;
  const visibleCustomerIssues = props.selectedCustomerIssues.filter((issue) => issue.tone !== "success" || Boolean(issue.actionLabel));
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);

  useEffect(() => {
    if (props.creatingCustomer) {
      setCustomerDrawerOpen(true);
      props.setCustomerDetailTab("info");
    }
  }, [props.creatingCustomer, props.setCustomerDetailTab]);

  useEffect(() => {
    if (!props.creatingCustomer && !selectedCustomer) {
      setCustomerDrawerOpen(false);
    }
  }, [props.creatingCustomer, selectedCustomer]);

  useEffect(() => {
    if (!customerDrawerOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setCustomerDrawerOpen(false);
      if (props.creatingCustomer) {
        props.setCustomerDetailTab("info");
        props.onCancelCreateCustomer();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [customerDrawerOpen, props.creatingCustomer, props.onCancelCreateCustomer, props.setCustomerDetailTab]);

  const activeFilterCopy: Record<
    CustomerListFilter,
    {
      title: string;
      empty: string;
    }
  > = {
    all: {
      title: "전체 고객",
      empty: "등록된 고객이 없습니다."
    },
    blocked: {
      title: "막힌 고객",
      empty: "막힌 고객이 없습니다."
    },
    ready: {
      title: "발행 가능",
      empty: "지금 발행 가능한 고객이 없습니다."
    },
    expiring: {
      title: "인증서 점검",
      empty: "점검이 필요한 인증서가 없습니다."
    },
    unjoined: {
      title: "연결 필요",
      empty: "연결 마무리 대상이 없습니다."
    }
  };

  const customerFilterOptions: Array<{
    key: CustomerListFilter;
    label: string;
    count: number;
  }> = [
    {
      key: "all",
      label: "전체",
      count: props.customers.length
    },
    {
      key: "blocked",
      label: "막힘",
      count: props.blockedCustomerCount
    },
    {
      key: "expiring",
      label: "만료",
      count: props.expiringSoonCustomerCount
    },
    {
      key: "unjoined",
      label: "연결",
      count: props.popbillPendingCustomerCount
    },
    {
      key: "ready",
      label: "발행 가능",
      count: props.readyCustomerCount
    }
  ];
  const getCustomerCertificateDays = (customer: Customer) => {
    if (!customer.popbillCertExpireDate) return null;
    const expireTime = new Date(customer.popbillCertExpireDate).getTime();
    if (!Number.isFinite(expireTime)) return null;
    return Math.ceil((expireTime - Date.now()) / (1000 * 60 * 60 * 24));
  };
  const getCustomerNextStep = (customer: Customer) => {
    const days = getCustomerCertificateDays(customer);
    if (customer.popbillState !== "joined") {
      return "팝빌 가입";
    }
    if (!customer.popbillCertRegistered) {
      return "인증서 등록";
    }
    if (days !== null && days < 0) {
      return "상태 재확인";
    }
    if (days !== null && days <= 30) {
      return "만료 점검";
    }
    return "발행 준비 완료";
  };
  const customerListEmptyState = (() => {
    if (props.customerSearchQuery.trim() !== "") {
      return {
        title: "검색 결과 없음",
        body: "다른 키워드로 다시 찾으세요."
      };
    }
    if (props.customers.length === 0) {
      return {
        title: "고객 없음",
        body: "새 고객부터 등록하세요."
      };
    }
    if (props.customerListFilter === "ready") {
      return {
        title: activeFilterCopy[props.customerListFilter].empty,
        body: props.blockedCustomerCount > 0 ? "막힘 고객을 먼저 정리하세요." : "필터를 바꾸거나 새 고객을 추가하세요."
      };
    }
    return {
      title: activeFilterCopy[props.customerListFilter].empty,
      body: "필터를 바꾸거나 새 고객을 추가하세요."
    };
  })();
  const selectedCustomerPrimaryIssue = visibleCustomerIssues.find((issue) => Boolean(issue.actionLabel)) ?? visibleCustomerIssues[0] ?? null;
  const hiddenResolvedIssueCount = props.selectedCustomerIssues.filter((issue) => issue.tone === "success" && !issue.actionLabel).length;
  const customerRequiredFieldChecks = [
    { label: "대표자명", done: props.customerForm.customerName.trim() !== "" },
    { label: "사업자번호", done: props.customerForm.businessNumber.trim() !== "" },
    { label: "세금계산서 상호", done: props.customerForm.corpName.trim() !== "" },
    { label: "주소", done: props.customerForm.addr.trim() !== "" }
  ];
  const customerOptionalFieldChecks = [
    { label: "업태", done: props.customerForm.bizType.trim() !== "" },
    { label: "업종", done: props.customerForm.bizClass.trim() !== "" },
    { label: "고객 연락처", done: props.customerForm.renewalContactMobile.trim() !== "" },
    { label: "메모", done: props.customerForm.memo.trim() !== "" }
  ];
  const requiredCompletedCount = customerRequiredFieldChecks.filter((field) => field.done).length;
  const optionalCompletedCount = customerOptionalFieldChecks.filter((field) => field.done).length;
  const getCustomerIssueHelpText = (issue: CustomerIssueChecklistItem) => {
    switch (issue.actionKind) {
      case "join-popbill":
        return "가입 후 발행이 열립니다.";
      case "register-certificate":
        return "전자세금용 연결이 필요합니다.";
      case "check-certificate":
        return "상태를 다시 읽습니다.";
      default:
        return issue.tone === "success"
          ? "추가 조치 없음"
          : "해결 후 다시 확인하세요.";
    }
  };

  const closeDrawer = () => {
    setCustomerDrawerOpen(false);
    if (props.creatingCustomer) {
      props.setCustomerDetailTab("info");
      props.onCancelCreateCustomer();
    }
  };

  const handleCreateCustomer = () => {
    setCustomerDrawerOpen(true);
    props.setCustomerDetailTab("info");
    props.onCreateCustomer();
  };

  const focusCustomer = (customer: Customer) => {
    setCustomerDrawerOpen(true);
    props.setCustomerDetailTab("info");
    props.onSelectCustomer(customer);
  };

  const handleCustomerRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, customer: Customer) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    focusCustomer(customer);
  };

  const getCustomerRowPrimaryAction = (customer: Customer): CustomerPrimaryAction => {
    const days = getCustomerCertificateDays(customer);

    if (customer.popbillState !== "joined") {
      return { label: "가입", kind: "join-popbill" };
    }
    if (!customer.popbillCertRegistered) {
      return { label: "등록", kind: "register-certificate" };
    }
    if (days !== null && days <= 30) {
      return { label: "점검", kind: "check-certificate" };
    }

    return { label: "열기", kind: "open-detail" };
  };

  const runCustomerListPrimaryAction = (
    event: React.MouseEvent<HTMLButtonElement>,
    customer: Customer,
    action: CustomerPrimaryAction
  ) => {
    event.stopPropagation();
    focusCustomer(customer);

    switch (action.kind) {
      case "join-popbill":
        return void props.runAction(`join-${customer.id}`, async () => props.onJoinCustomerPopbill(customer.id));
      case "register-certificate":
        return void props.runAction(
          `cert-url-${customer.id}`,
          async () => props.onOpenCustomerCertRegistration(customer.id),
          { reload: false }
        );
      case "check-certificate":
        return void props.runAction(`cert-status-${customer.id}`, async () => props.onRefreshCustomerCertificateStatus(customer.id));
      case "open-detail":
      default:
        return;
    }
  };

  const runSelectedCustomerIssueAction = (issue: CustomerIssueChecklistItem) => {
    if (!selectedCustomer || !issue.actionKind) return;

    switch (issue.actionKind) {
      case "join-popbill":
        return void props.runAction(`join-${selectedCustomer.id}`, async () => props.onJoinCustomerPopbill(selectedCustomer.id));
      case "register-certificate":
        return void props.runAction(
          `cert-url-${selectedCustomer.id}`,
          async () => props.onOpenCustomerCertRegistration(selectedCustomer.id),
          { reload: false }
        );
      case "check-certificate":
        return void props.runAction(
          `cert-status-${selectedCustomer.id}`,
          async () => props.onRefreshCustomerCertificateStatus(selectedCustomer.id)
        );
      default:
        return;
    }
  };

  const selectedCustomerPrimaryAction =
    selectedCustomer && selectedCustomerReadiness
      ? selectedCustomerPrimaryIssue?.actionKind
        ? {
            label: selectedCustomerPrimaryIssue.actionLabel ?? getCustomerRowPrimaryAction(selectedCustomer).label,
            kind: selectedCustomerPrimaryIssue.actionKind
          }
        : (() => {
            const fallbackAction = getCustomerRowPrimaryAction(selectedCustomer);
            return fallbackAction.kind === "open-detail"
              ? { label: "상태 확인", kind: "check-certificate" as const }
              : fallbackAction;
          })()
      : null;
  const selectedCustomerNextStep = selectedCustomer ? getCustomerNextStep(selectedCustomer) : "";
  const detailPanelIssues = visibleCustomerIssues.filter((issue) => issue.key !== selectedCustomerPrimaryIssue?.key);

  const getCustomerPopbillStatus = (customer: Customer): CustomerStatusBadge => {
    if (customer.popbillState === "joined") {
      return {
        label: "연결됨",
        tone: "success",
        detail: props.getCustomerPopbillSummary(customer)
      };
    }
    if (customer.popbillState === "failed") {
      return {
        label: "실패",
        tone: "danger",
        detail: "팝빌 상태 점검 필요"
      };
    }
    return {
      label: "미연결",
      tone: "warn",
      detail: "가입 절차 필요"
    };
  };

  const getCustomerCertificateStatus = (customer: Customer): CustomerStatusBadge => {
    const days = getCustomerCertificateDays(customer);

    if (customer.popbillState !== "joined") {
      return {
        label: "대기",
        tone: "default",
        detail: "팝빌 연결 후 확인"
      };
    }
    if (!customer.popbillCertRegistered) {
      return {
        label: "미등록",
        tone: "warn",
        detail: "전자세금용 인증서 등록 필요"
      };
    }
    if (days !== null && days < 0) {
      return {
        label: "만료",
        tone: "danger",
        detail: props.formatCertificateExpireDate(customer.popbillCertExpireDate)
      };
    }
    if (days !== null && days <= 30) {
      return {
        label: days === 0 ? "D-Day" : `D-${days}`,
        tone: "warn",
        detail: props.formatCertificateExpireDate(customer.popbillCertExpireDate)
      };
    }
    return {
      label: "정상",
      tone: "success",
      detail: props.formatCertificateExpireDate(customer.popbillCertExpireDate)
    };
  };
  const selectedCustomerPopbillStatus = selectedCustomer ? getCustomerPopbillStatus(selectedCustomer) : null;
  const selectedCustomerCertificateStatus = selectedCustomer ? getCustomerCertificateStatus(selectedCustomer) : null;

  const selectedInspectorFacts: CustomerInspectorFact[] =
    selectedCustomer && selectedCustomerReadiness && selectedCustomerPopbillStatus && selectedCustomerCertificateStatus
      ? [
          {
            label: "팝빌 상태",
            value: `${selectedCustomerPopbillStatus.label} · ${props.getCustomerPopbillSummary(selectedCustomer)}`
          },
          {
            label: "인증서 상태",
            value: `${selectedCustomerCertificateStatus.label} · ${props.getCustomerCertificateSummary(selectedCustomer)}`
          },
          {
            label: "발행 방식",
            value: props.getIssueModeLabel(selectedCustomer.issueMode)
          },
          {
            label: "운영 안내",
            value: getIssueModeGuide(selectedCustomer.issueMode),
            wide: true
          },
          {
            label: "다음 조치",
            value: selectedCustomerNextStep || "상세 확인"
          },
          {
            label: "주소",
            value: selectedCustomer.addr || "-",
            wide: true
          }
        ]
      : [];
  const selectedInspectorSummary =
    selectedCustomer && selectedCustomerReadiness
      ? selectedCustomerReadiness.canIssueNow
        ? "현재 발행 준비가 완료된 고객입니다. 필요 시 이력 확인 후 바로 작업을 진행하세요."
        : [selectedCustomerPrimaryIssue?.label ?? selectedCustomerReadiness.reason, selectedCustomerNextStep]
            .filter((value, index, array) => value && array.indexOf(value) === index)
            .join(" · ")
      : "";
  const runSelectedCustomerPrimaryAction = () => {
    if (!selectedCustomer || !selectedCustomerPrimaryAction) return;

    switch (selectedCustomerPrimaryAction.kind) {
      case "join-popbill":
        return void props.runAction(`join-${selectedCustomer.id}`, async () => props.onJoinCustomerPopbill(selectedCustomer.id));
      case "register-certificate":
        return void props.runAction(
          `cert-url-${selectedCustomer.id}`,
          async () => props.onOpenCustomerCertRegistration(selectedCustomer.id),
          { reload: false }
        );
      case "check-certificate":
        return void props.runAction(
          `cert-status-${selectedCustomer.id}`,
          async () => props.onRefreshCustomerCertificateStatus(selectedCustomer.id)
        );
      default:
        return;
    }
  };

  const customerConsoleMetrics = useMemo(
    () => [
      {
        key: "total",
        label: "전체 고객",
        value: `${props.customers.length}명`,
        tone: "default" as CustomerConsoleTone
      },
      {
        key: "blocked",
        label: "조치 필요",
        value: `${props.blockedCustomerCount}명`,
        tone: props.blockedCustomerCount > 0 ? ("danger" as CustomerConsoleTone) : ("success" as CustomerConsoleTone)
      },
      {
        key: "ready",
        label: "발행 가능",
        value: `${props.readyCustomerCount}명`,
        tone: props.readyCustomerCount > 0 ? ("success" as CustomerConsoleTone) : ("default" as CustomerConsoleTone)
      },
      {
        key: "pending",
        label: "연결 필요",
        value: `${props.popbillPendingCustomerCount}명`,
        tone: props.popbillPendingCustomerCount > 0 ? ("warn" as CustomerConsoleTone) : ("success" as CustomerConsoleTone)
      }
    ],
    [
      props.blockedCustomerCount,
      props.customers.length,
      props.popbillPendingCustomerCount,
      props.readyCustomerCount
    ]
  );
  const hasActiveFilter = props.customerListFilter !== "all" || props.customerSearchQuery.trim() !== "";
  const drawerOpen = customerDrawerOpen && (props.creatingCustomer || Boolean(selectedCustomer));
  const selectedRecentIssuedDraft = props.selectedCustomerIssuedDrafts[0] ?? null;
  const historyPreviewDrafts = props.selectedCustomerIssuedDrafts.slice(0, 3);
  const filteredSummary = `${activeFilterCopy[props.customerListFilter].title} · ${props.filteredCustomers.length}명 표시`;

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [drawerOpen]);

  const renderCustomerForm = (mode: "create" | "edit") => (
    <form
      className={`customer-form customer-form-${mode}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (props.busyKey !== null) return;
        void props.runAction(
          props.customerForm.id === null ? "save-customer" : `save-customer-${props.customerForm.id}`,
          props.onSaveCustomer
        );
      }}
    >
      {mode === "create" ? (
        <div className="customer-form-inline-status" aria-label="필수 입력 진행 상태">
          <span className={requiredCompletedCount === customerRequiredFieldChecks.length ? getToneBadgeClass("success") : getToneBadgeClass("warn")}>
            필수 {requiredCompletedCount}/{customerRequiredFieldChecks.length}
          </span>
          <span>
            {requiredCompletedCount === customerRequiredFieldChecks.length
              ? "저장 준비 완료"
              : `남은 항목: ${customerRequiredFieldChecks.filter((field) => !field.done).map((field) => field.label).join(", ")}`}
          </span>
        </div>
      ) : null}

      <div className="form-grid customer-form-grid">
        <label>
          대표자명
          <input
            ref={props.customerNameInputRef}
            value={props.customerForm.customerName}
            onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, customerName: event.target.value }))}
          />
        </label>
        <label>
          사업자번호
          <input value={props.customerForm.businessNumber} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, businessNumber: event.target.value }))} />
        </label>
        <label>
          세금계산서 상호
          <input value={props.customerForm.corpName} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, corpName: event.target.value }))} />
        </label>
        <label className="full customer-form-address-field">
          주소
          <input
            value={props.customerForm.addr}
            onChange={(event) => {
              const nextAddress = event.target.value;
              props.customerAddressLookupRef.current = "";
              props.setCustomerAddressResolveMessage("");
              props.setCustomerForm((prev) => ({ ...prev, addr: nextAddress }));
            }}
            onBlur={() => void props.resolveCustomerAddress()}
          />
          <span className="field-hint">저장된 주소를 자동 매칭에 사용합니다.</span>
          {props.customerAddressResolveMessage ? <span className="field-hint">{props.customerAddressResolveMessage}</span> : null}
        </label>
      </div>

      <details className="customer-form-disclosure">
        <summary>{mode === "create" ? `추가 입력 ${optionalCompletedCount}/${customerOptionalFieldChecks.length}` : "추가 입력"}</summary>
        <div className="form-grid customer-form-advanced-grid">
          <label>
            업태
            <input value={props.customerForm.bizType} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, bizType: event.target.value }))} />
          </label>
          <label>
            업종
            <input value={props.customerForm.bizClass} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, bizClass: event.target.value }))} />
          </label>
          <label>
            고객 연락처
            <input value={props.customerForm.renewalContactMobile} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, renewalContactMobile: event.target.value }))} placeholder="01012345678" />
          </label>
          {mode === "edit" ? (
            <label>
              발행 방식
              <select
                value={props.customerForm.issueMode}
                onChange={(event) =>
                  props.setCustomerForm((prev) => ({
                    ...prev,
                    issueMode: event.target.value === "auto" ? "auto" : "review"
                  }))
                }
                disabled={props.customerForm.id === null}
              >
                <option value="review">검수 후 직접 발행</option>
                <option value="auto">월 자동 발행</option>
              </select>
              <span className="field-hint">{getIssueModeGuide(props.customerForm.issueMode)}</span>
            </label>
          ) : null}
          <label className="full">
            메모
            <textarea rows={3} value={props.customerForm.memo} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, memo: event.target.value }))} />
          </label>
        </div>
      </details>

      <div className="customer-form-actions">
        <span className="field-hint">
          {mode === "create"
            ? "필수 4개부터 저장 후 나머지를 이어서 입력할 수 있습니다."
            : props.isSavingCustomer
              ? "고객 정보를 저장하고 있습니다."
              : "수정 후 저장합니다."}
        </span>
        <button type="submit" disabled={props.busyKey !== null}>
          {mode === "create"
            ? props.isSavingCustomer
              ? "고객 등록 중..."
              : "고객 등록"
            : props.isSavingCustomer
              ? "저장 중..."
              : "고객 저장"}
        </button>
      </div>
    </form>
  );

  const renderHistoryRows = (drafts: InvoiceDraft[]) => {
    if (props.mailboxDataLoading && drafts.length === 0) {
      return <div className="empty customer-history-empty">발행 이력을 불러오는 중입니다.</div>;
    }
    if (drafts.length === 0) {
      return <div className="empty customer-history-empty">발행 이력이 없습니다.</div>;
    }

    return drafts.map((draft) => {
      const confirmNumber = props.getDraftConfirmNumber(draft);
      return (
        <article key={draft.id} className="customer-history-row">
          <div className="customer-history-head customer-history-primary">
            <strong>{draft.itemName}</strong>
            <span>{draft.popbillMgtKey || "관리번호 없음"}</span>
          </div>
          <div className="customer-history-meta">
            <span>{props.formatDateTime(draft.issuedAt)}</span>
            <span>합계 {props.formatMoney(draft.totalAmount)}원</span>
            <span>승인번호 {confirmNumber ?? "-"}</span>
          </div>
          <div className="customer-history-actions">
            <button
              className="btn-secondary"
              disabled={props.busyKey !== null}
              onClick={() => void props.runAction(`draft-info-${draft.id}`, async () => props.onShowDraftPopbillInfo(draft.id))}
            >
              상태
            </button>
            <button
              className="btn-secondary"
              disabled={props.busyKey !== null}
              onClick={() => void props.runAction(`draft-view-customer-${draft.id}`, async () => props.onOpenDraftPopbillUrl(draft.id, "view-url"))}
            >
              보기
            </button>
            <button
              className="btn-secondary"
              disabled={props.busyKey !== null}
              onClick={() => void props.runAction(`draft-print-customer-${draft.id}`, async () => props.onOpenDraftPopbillUrl(draft.id, "print-url"))}
            >
              인쇄
            </button>
          </div>
        </article>
      );
    });
  };

  const renderCustomerTableRows = () => {
    if (props.filteredCustomers.length === 0) {
      return (
        <tr className="customer-console-empty-row">
          <td colSpan={8}>
            <div className="context-empty-state customer-table-empty">
              <strong>{customerListEmptyState.title}</strong>
              <p>{customerListEmptyState.body}</p>
              <div className="customer-console-empty-actions">
                <button type="button" onClick={handleCreateCustomer}>
                  새 고객 등록
                </button>
              </div>
            </div>
          </td>
        </tr>
      );
    }

    return props.filteredCustomers.map((customer) => {
      const readiness = props.getCustomerIssueReadiness(customer);
      const primaryAction = getCustomerRowPrimaryAction(customer);
      const isSelected = !props.creatingCustomer && drawerOpen && props.selectedCustomer?.id === customer.id;
      const summaryTitle = customer.corpName || customer.customerName;
      const secondaryLine =
        customer.customerName !== summaryTitle
          ? `${customer.customerName} · ${customer.addr || "주소 미입력"}`
          : customer.addr || "주소 미입력";
      const popbillStatus = getCustomerPopbillStatus(customer);
      const certificateStatus = getCustomerCertificateStatus(customer);

      return (
        <tr
          key={customer.id}
          aria-selected={isSelected}
          className={isSelected ? "is-selected" : undefined}
          tabIndex={0}
          onClick={() => focusCustomer(customer)}
          onKeyDown={(event) => handleCustomerRowKeyDown(event, customer)}
        >
          <td className="customer-console-col-name">
            <div className="customer-console-primary-cell">
              <strong>{summaryTitle}</strong>
              <span>{secondaryLine}</span>
            </div>
          </td>
          <td>
            <div className="customer-console-cell-stack">
              <strong>{customer.businessNumber}</strong>
              <span>{customer.popbillUserId || "팝빌 사용자 ID 미설정"}</span>
            </div>
          </td>
          <td>
            <div className="customer-console-cell-stack">
              <span className={getToneBadgeClass(popbillStatus.tone)}>{popbillStatus.label}</span>
              <span>{popbillStatus.detail}</span>
            </div>
          </td>
          <td>
            <div className="customer-console-cell-stack">
              <span className={getToneBadgeClass(certificateStatus.tone)}>{certificateStatus.label}</span>
              <span>{certificateStatus.detail}</span>
            </div>
          </td>
          <td>
            <div className="customer-console-cell-stack">
              <strong>{props.getIssueModeLabel(customer.issueMode)}</strong>
              <span>{getIssueModeListHint(customer.issueMode)}</span>
            </div>
          </td>
          <td>
            <div className="customer-console-cell-stack">
              <strong>{getCustomerNextStep(customer)}</strong>
              <span>{primaryAction.kind === "open-detail" ? "상세 점검" : `빠른 조치: ${primaryAction.label}`}</span>
            </div>
          </td>
          <td>
            <div className="customer-console-cell-stack">
              <span className={getToneBadgeClass(readiness.tone)}>{readiness.label}</span>
              <span>{readiness.reason}</span>
            </div>
          </td>
          <td className="customer-console-col-action">
            <button
              type="button"
              className={primaryAction.kind === "open-detail" ? "btn-secondary customer-row-action" : "customer-row-action"}
              disabled={props.busyKey !== null && primaryAction.kind !== "open-detail"}
              onClick={(event) => runCustomerListPrimaryAction(event, customer, primaryAction)}
            >
              {primaryAction.label}
            </button>
          </td>
        </tr>
      );
    });
  };

  const renderDetailDrawer = () => {
    if (!selectedCustomer || !selectedCustomerReadiness || !selectedCustomerPopbillStatus || !selectedCustomerCertificateStatus) {
      return null;
    }

    return (
      <>
        <header className="customer-console-drawer-head">
          <div className="customer-console-drawer-copy">
            <span className="customer-console-kicker">선택한 고객 컨텍스트</span>
            <strong>{selectedCustomer.corpName || selectedCustomer.customerName}</strong>
            <p>{selectedCustomer.businessNumber}</p>
          </div>
          <div className="customer-console-drawer-head-actions">
            <span className={getToneBadgeClass(selectedCustomerReadiness.tone)}>{selectedCustomerReadiness.label}</span>
            {selectedCustomerPrimaryAction ? (
              <button type="button" disabled={props.busyKey !== null} onClick={runSelectedCustomerPrimaryAction}>
                {selectedCustomerPrimaryAction.label}
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={closeDrawer}>
              닫기
            </button>
          </div>
        </header>

        <div className="customer-console-drawer-status-strip">
          <span className={getToneBadgeClass(selectedCustomerPopbillStatus.tone)}>팝빌 {selectedCustomerPopbillStatus.label}</span>
          <span className={getToneBadgeClass(selectedCustomerCertificateStatus.tone)}>인증서 {selectedCustomerCertificateStatus.label}</span>
          <span className={getToneBadgeClass("default")}>{props.getIssueModeLabel(selectedCustomer.issueMode)}</span>
          <span className={getToneBadgeClass(selectedCustomerReadiness.tone)}>다음 조치 {selectedCustomerNextStep}</span>
        </div>

        <div className="customer-console-drawer-tabs">
          <button
            type="button"
            className={props.customerDetailTab === "info" ? "btn-secondary active-filter" : "btn-secondary"}
            onClick={() => props.setCustomerDetailTab("info")}
          >
            개요
          </button>
          <button
            type="button"
            className={props.customerDetailTab === "history" ? "btn-secondary active-filter" : "btn-secondary"}
            onClick={() => props.setCustomerDetailTab("history")}
          >
            발행 이력 {props.selectedCustomerIssuedDrafts.length}
          </button>
        </div>

        <div className="customer-console-drawer-body">
          {props.customerDetailTab === "history" ? (
            <section className="customer-drawer-section customer-drawer-history-panel">
              <div className="customer-drawer-section-head">
                <div>
                  <h3>발행 이력</h3>
                  <p>고객별 발행 결과와 팝빌 확인 링크를 여기서 관리합니다.</p>
                </div>
                <span className={getToneBadgeClass("default")}>{props.selectedCustomerIssuedDrafts.length}건</span>
              </div>
              <div className="customer-history-table">{renderHistoryRows(props.selectedCustomerIssuedDrafts)}</div>
            </section>
          ) : (
            <div className="customer-drawer-section-stack">
              <section className="customer-drawer-section customer-drawer-summary-section">
                <div className="customer-drawer-section-head">
                  <div>
                    <h3>상태 요약</h3>
                    <p>{selectedInspectorSummary}</p>
                  </div>
                  <span className={getToneBadgeClass(selectedCustomerReadiness.tone)}>{selectedCustomerReadiness.reason}</span>
                </div>
                <dl className="customer-inspector-facts customer-drawer-facts-grid">
                  {selectedInspectorFacts.map((item) => (
                    <div key={item.label} className={item.wide ? "wide" : undefined}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <details className="customer-drawer-section customer-drawer-disclosure" open>
                <summary>
                  해결 필요 항목
                  <span>
                    {detailPanelIssues.length > 0
                      ? `${detailPanelIssues.length}개`
                      : hiddenResolvedIssueCount > 0
                        ? `완료 ${hiddenResolvedIssueCount}개`
                        : "확인"}
                  </span>
                </summary>
                <div className="customer-inspector-issue-list">
                  {selectedCustomerPrimaryIssue ? (
                    <article className="customer-inspector-issue-row highlighted">
                      <div>
                        <strong>{selectedCustomerPrimaryIssue.label}</strong>
                        <span>{getCustomerIssueHelpText(selectedCustomerPrimaryIssue)}</span>
                      </div>
                      {selectedCustomerPrimaryIssue.actionLabel ? (
                        <button type="button" onClick={() => runSelectedCustomerIssueAction(selectedCustomerPrimaryIssue)}>
                          {selectedCustomerPrimaryIssue.actionLabel}
                        </button>
                      ) : null}
                    </article>
                  ) : null}
                  {detailPanelIssues.length > 0 ? (
                    detailPanelIssues.map((issue) => (
                      <article key={issue.key} className="customer-inspector-issue-row">
                        <div>
                          <strong>{issue.label}</strong>
                          <span>{getCustomerIssueHelpText(issue)}</span>
                        </div>
                        {issue.actionLabel ? (
                          <button type="button" className="btn-secondary" onClick={() => runSelectedCustomerIssueAction(issue)}>
                            {issue.actionLabel}
                          </button>
                        ) : null}
                      </article>
                    ))
                  ) : !selectedCustomerPrimaryIssue ? (
                    <div className="customer-inspector-note">미해결 항목은 없습니다.</div>
                  ) : null}
                  {hiddenResolvedIssueCount > 0 ? <div className="customer-inspector-note">완료 항목 {hiddenResolvedIssueCount}개는 기본 목록에서 숨김 처리했습니다.</div> : null}
                  {props.customerCertNotice ? <div className="customer-inspector-note">{props.customerCertNotice}</div> : null}
                </div>
              </details>

              <details className="customer-drawer-section customer-drawer-disclosure" open>
                <summary>
                  기본 정보 편집
                  <span>저장</span>
                </summary>
                {renderCustomerForm("edit")}
              </details>

              <section className="customer-drawer-section customer-drawer-history-summary">
                <div className="customer-drawer-section-head">
                  <div>
                    <h3>발행 이력 요약</h3>
                    <p>
                      {selectedRecentIssuedDraft
                        ? `최근 발행 ${props.formatDateTime(selectedRecentIssuedDraft.issuedAt)}`
                        : "아직 발행 이력이 없습니다."}
                    </p>
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => props.setCustomerDetailTab("history")}>
                    전체 이력 보기
                  </button>
                </div>
                <div className="customer-drawer-history-preview">
                  {historyPreviewDrafts.length > 0 ? renderHistoryRows(historyPreviewDrafts) : <div className="empty customer-history-empty">발행 이력이 없습니다.</div>}
                </div>
              </section>

              <details className="customer-drawer-section customer-drawer-disclosure customer-drawer-danger-zone">
                <summary>
                  위험 작업
                  <span>연결 해제 / 삭제</span>
                </summary>
                <div className="customer-inspector-more-actions customer-drawer-danger-actions">
                  {selectedCustomer.popbillState === "joined" && selectedCustomer.popbillCertRegistered ? (
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        void props.runAction(
                          `cert-url-${selectedCustomer.id}`,
                          async () => props.onOpenCustomerCertRegistration(selectedCustomer.id),
                          { reload: false }
                        )
                      }
                    >
                      인증서 재등록
                    </button>
                  ) : null}
                  {selectedCustomer.popbillState === "joined" ? (
                    <button
                      className="btn-ghost"
                      onClick={() => void props.runAction(`reset-popbill-${selectedCustomer.id}`, async () => props.onResetPopbillLink(selectedCustomer))}
                    >
                      연결 해제
                    </button>
                  ) : null}
                  <button
                    className="btn-ghost btn-danger"
                    onClick={() => void props.runAction(`delete-customer-${selectedCustomer.id}`, async () => props.onDeleteCustomer(selectedCustomer))}
                  >
                    고객 삭제
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderCreateDrawer = () => (
    <>
      <header className="customer-console-drawer-head">
        <div className="customer-console-drawer-copy">
          <span className="customer-console-kicker">운영 / 신규 등록</span>
          <strong>새 고객 등록</strong>
          <p>별도 페이지 이동 없이 같은 우측 드로어에서 등록을 이어갑니다.</p>
        </div>
        <div className="customer-console-drawer-head-actions">
          <span className={requiredCompletedCount === customerRequiredFieldChecks.length ? getToneBadgeClass("success") : getToneBadgeClass("warn")}>
            필수 {requiredCompletedCount}/4
          </span>
          <button type="button" className="btn-secondary" onClick={closeDrawer}>
            닫기
          </button>
        </div>
      </header>

      <div className="customer-console-drawer-status-strip">
        <span className={requiredCompletedCount === customerRequiredFieldChecks.length ? getToneBadgeClass("success") : getToneBadgeClass("warn")}>저장 준비 {requiredCompletedCount}/4</span>
      </div>

      <div className="customer-console-drawer-body">
        <section className="customer-drawer-section customer-drawer-summary-section">
          <div className="customer-drawer-section-head">
            <div>
              <h3>등록 가이드</h3>
              <p>대표자명, 사업자번호, 상호, 주소를 먼저 저장한 뒤 추가 정보를 보강하세요.</p>
            </div>
          </div>
          {renderCustomerForm("create")}
        </section>
      </div>
    </>
  );

  return (
    <div className="customers-screen customer-console-screen">
      <div className="customer-console-shell">
        <section className="panel panel-customer-list customer-console-panel">
          <header className="customer-console-header">
            <div className="customer-console-header-copy">
              <span className="customer-console-kicker">운영 / 고객 데이터 콘솔</span>
              <div className="customer-console-title-row">
                <strong>고객 관리</strong>
                <span>{filteredSummary}</span>
              </div>
            </div>
            <div className="customer-console-header-actions">
              {props.expiredCertCustomers.length > 0 ? <span className={getToneBadgeClass("danger")}>만료 {props.expiredCertCustomers.length}명</span> : null}
              <button
                type="button"
                className="btn-secondary"
                disabled={props.busyKey !== null}
                onClick={() => void props.runAction("customers-cert-refresh-all", props.onRefreshAllCertificateStatuses)}
              >
                인증서 일괄 점검
              </button>
              <button type="button" onClick={handleCreateCustomer}>
                새 고객
              </button>
            </div>
          </header>

          <div className="customer-console-metrics" aria-label="고객 운영 요약">
            {customerConsoleMetrics.map((metric) => (
              <div
                key={metric.key}
                className={`customer-console-metric ${metric.tone === "danger" ? "tone-danger" : metric.tone === "warn" ? "tone-warn" : metric.tone === "success" ? "tone-success" : ""}`}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>

          <div className="customer-console-controls">
            <div className="customer-console-search">
              <input
                placeholder="고객명, 상호, 사업자번호 검색"
                value={props.customerSearchQuery}
                onChange={(event) => props.setCustomerSearchQuery(event.target.value)}
              />
            </div>
            <div className="customer-console-filter-strip" role="tablist" aria-label="고객 보기 필터">
              {customerFilterOptions.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={props.customerListFilter === filter.key ? "btn-secondary active-filter" : "btn-secondary"}
                  onClick={() => props.setCustomerListFilter(filter.key)}
                >
                  <span>{filter.label}</span>
                  <strong>{filter.count}</strong>
                </button>
              ))}
            </div>
            {hasActiveFilter ? (
              <button
                type="button"
                className="btn-secondary customer-console-reset"
                onClick={() => {
                  props.setCustomerListFilter("all");
                  props.setCustomerSearchQuery("");
                }}
              >
                필터 초기화
              </button>
            ) : null}
          </div>

          <div className="table-wrap customer-console-table-wrap">
            <table className="responsive-table customer-console-table">
              <thead>
                <tr>
                  <th>고객명 / 상호</th>
                  <th>사업자번호</th>
                  <th>팝빌 상태</th>
                  <th>인증서 상태</th>
                  <th>발행 방식</th>
                  <th>다음 조치</th>
                  <th>종합 상태</th>
                  <th aria-label="작업" />
                </tr>
              </thead>
              <tbody>{renderCustomerTableRows()}</tbody>
            </table>
          </div>
        </section>

        {drawerOpen ? (
          <>
            <button type="button" className="customer-console-drawer-backdrop" aria-label="상세 닫기" onClick={closeDrawer} />
            <aside
              className={`panel customer-console-drawer ${props.creatingCustomer ? "is-create" : "is-detail"}`}
              aria-label={props.creatingCustomer ? "새 고객 등록" : "고객 상세"}
            >
              {props.creatingCustomer ? renderCreateDrawer() : renderDetailDrawer()}
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
