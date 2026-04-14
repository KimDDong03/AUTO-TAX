import { useEffect, useState } from "react";
import type React from "react";
import { Panel } from "../../components/ui";
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

type CustomersTabProps = {
  customers: Customer[];
  expiredCertCustomers: Customer[];
  expiringSoonCustomers: Customer[];
  filteredCustomers: Customer[];
  selectedCustomer: Customer | null;
  selectedCustomerReadiness: CustomerIssueReadiness | null;
  selectedCustomerIssues: CustomerIssueChecklistItem[];
  selectedCustomerIssuedDrafts: InvoiceDraft[];
  blockedCustomerCount: number;
  readyCustomerCount: number;
  expiringSoonCustomerCount: number;
  popbillPendingCustomerCount: number;
  managedCustomerCount: number;
  managedCustomerLimit: number | null;
  hasReachedManagedCustomerLimit: boolean;
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

export function CustomersTab(props: CustomersTabProps) {
  const selectedCustomer = props.selectedCustomer;
  const selectedCustomerReadiness = props.selectedCustomerReadiness;
  const visibleCustomerIssues = props.selectedCustomerIssues.filter((issue) => issue.tone !== "success" || Boolean(issue.actionLabel));
  const [showCreateInspector, setShowCreateInspector] = useState(false);

  useEffect(() => {
    if (selectedCustomer) {
      setShowCreateInspector(false);
    }
  }, [selectedCustomer]);

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
  const getCustomerRowMeta = (customer: Customer) => {
    const days = getCustomerCertificateDays(customer);

    if (customer.popbillState !== "joined") {
      return "팝빌 미연결";
    }
    if (!customer.popbillCertRegistered) {
      return "인증서 미등록";
    }
    if (days !== null && days < 0) {
      return "인증서 만료";
    }
    if (days !== null && days <= 30) {
      return `만료 ${days}일`;
    }
    return props.getIssueModeLabel(customer.issueMode);
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

  const handleCreateCustomer = () => {
    setShowCreateInspector(true);
    props.setCustomerDetailTab("info");
    props.onCreateCustomer();
  };

  const focusCustomer = (customer: Customer) => {
    setShowCreateInspector(false);
    props.setCustomerDetailTab("info");
    props.onSelectCustomer(customer);
  };

  const handleCustomerRowKeyDown = (event: React.KeyboardEvent<HTMLElement>, customer: Customer) => {
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
  const selectedInspectorFacts: CustomerInspectorFact[] =
    selectedCustomer && selectedCustomerReadiness
      ? [
          {
            label: "발행 방식",
            value: props.getIssueModeLabel(selectedCustomer.issueMode)
          },
          {
            label: "팝빌",
            value: props.getCustomerPopbillSummary(selectedCustomer)
          },
          {
            label: "인증서",
            value: props.getCustomerCertificateSummary(selectedCustomer)
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
        ? "지금 발행 가능합니다."
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

  const renderCustomerForm = (mode: "create" | "edit") => (
    <form
      className={`customer-form customer-form-${mode}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (props.busyKey !== null) return;
        if (mode === "create" && props.hasReachedManagedCustomerLimit) return;
        void props.runAction(
          props.customerForm.id === null ? "save-customer" : `save-customer-${props.customerForm.id}`,
          props.onSaveCustomer
        );
      }}
    >
      {mode === "create" ? (
        <div className="customer-form-inline-status" aria-label="필수 입력 진행 상태">
          <span className={`chip ${requiredCompletedCount === customerRequiredFieldChecks.length ? "chip-success" : "chip-warn"}`}>
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
                <option value="review">검수 후 발행</option>
                <option value="auto">월 자동 발행</option>
              </select>
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
            ? props.hasReachedManagedCustomerLimit
              ? "관리 고객 한도에 도달했습니다."
              : "필수 4개부터 저장 후 나머지를 이어서 입력할 수 있습니다."
            : props.isSavingCustomer
              ? "고객 정보를 저장하고 있습니다."
              : "수정 후 저장합니다."}
        </span>
        <button type="submit" disabled={(mode === "create" && props.hasReachedManagedCustomerLimit) || props.busyKey !== null}>
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

  return (
    <div className="customers-screen customer-console-screen">
      <div className="customers-layout customer-console-layout">
        <Panel
          className="panel-customer-list"
          title="고객 목록"
          subtitle={`${activeFilterCopy[props.customerListFilter].title} · ${props.filteredCustomers.length}명`}
        >
          <div className="customer-console-toolbar">
            <div className="customer-console-search">
              <input
                placeholder="고객명, 상호, 사업자번호 검색"
                value={props.customerSearchQuery}
                onChange={(event) => props.setCustomerSearchQuery(event.target.value)}
              />
            </div>
            <div className="customer-console-toolbar-actions">
              <details className="customer-toolbar-menu">
                <summary className="btn-secondary">필터</summary>
                <div className="customer-toolbar-popover" role="menu">
                  <div className="customer-toolbar-popover-head">
                    <strong>필터</strong>
                    <span>{activeFilterCopy[props.customerListFilter].title}</span>
                  </div>
                  <div className="customer-filter-list">
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
                </div>
              </details>

              <details className="customer-toolbar-menu">
                <summary className="btn-secondary">도구</summary>
                <div className="customer-toolbar-popover customer-toolbar-popover-wide" role="menu">
                  <div className="customer-toolbar-popover-head">
                    <strong>도구</strong>
                    <span>기본 화면에서는 숨김</span>
                  </div>
                  <dl className="customer-toolbar-stats">
                    <div>
                      <dt>표시</dt>
                      <dd>{props.filteredCustomers.length}명</dd>
                    </div>
                    <div>
                      <dt>발행 가능</dt>
                      <dd>{props.readyCustomerCount}명</dd>
                    </div>
                    <div>
                      <dt>만료 주의</dt>
                      <dd>{props.expiringSoonCustomerCount}명</dd>
                    </div>
                    <div>
                      <dt>관리 고객</dt>
                      <dd>
                        {props.managedCustomerLimit !== null
                          ? `${props.managedCustomerCount} / ${props.managedCustomerLimit}`
                          : `${props.managedCustomerCount}명`}
                      </dd>
                    </div>
                  </dl>
                  <div className="customer-toolbar-utility-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={props.busyKey !== null}
                      onClick={() => void props.runAction("customers-cert-refresh-all", props.onRefreshAllCertificateStatuses)}
                    >
                      인증서 일괄 점검
                    </button>
                    {props.expiredCertCustomers.length > 0 ? <span className="chip chip-danger">만료 {props.expiredCertCustomers.length}명</span> : null}
                    {props.hasReachedManagedCustomerLimit ? <span className="chip chip-warn">한도 도달</span> : null}
                  </div>
                </div>
              </details>

              <button
                type="button"
                disabled={props.hasReachedManagedCustomerLimit}
                onClick={handleCreateCustomer}
              >
                새 고객
              </button>
            </div>
          </div>
          <div className="customer-list-head" aria-hidden="true">
            <span>고객</span>
            <span>메타</span>
            <span>상태</span>
            <span>작업</span>
          </div>
          <div className="list customer-table-list">
            {props.filteredCustomers.map((customer) => {
              const readiness = props.getCustomerIssueReadiness(customer);
              const isSelected = props.selectedCustomer?.id === customer.id;
              const primaryAction = getCustomerRowPrimaryAction(customer);
              const summaryTitle = customer.corpName || customer.customerName;
              const summaryMeta = customer.customerName !== summaryTitle ? `${customer.customerName} · ${customer.businessNumber}` : customer.businessNumber;

              return (
                <article
                  key={customer.id}
                  className={`customer-summary customer-table-row ${isSelected ? "selected is-selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => focusCustomer(customer)}
                  onKeyDown={(event) => handleCustomerRowKeyDown(event, customer)}
                >
                  <div className="customer-summary-main customer-table-primary">
                    <strong>{summaryTitle}</strong>
                    <span>{summaryMeta}</span>
                  </div>
                  <div className="customer-summary-meta customer-table-meta">
                    <span>{getCustomerRowMeta(customer)}</span>
                  </div>
                  <div className="customer-summary-status customer-table-status">
                    <span className={`chip ${readiness.tone === "success" ? "chip-success" : readiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>
                      {readiness.label}
                    </span>
                  </div>
                  <div className="customer-summary-action customer-table-action">
                    <button
                      type="button"
                      className={primaryAction.kind === "open-detail" ? "btn-secondary customer-row-action" : "customer-row-action"}
                      disabled={props.busyKey !== null && primaryAction.kind !== "open-detail"}
                      onClick={(event) => runCustomerListPrimaryAction(event, customer, primaryAction)}
                    >
                      {primaryAction.label}
                    </button>
                  </div>
                </article>
              );
            })}
            {props.filteredCustomers.length === 0 ? (
              <div className="context-empty-state customer-table-empty">
                <strong>{customerListEmptyState.title}</strong>
                <p>{customerListEmptyState.body}</p>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          className={`panel-customer-editor ${!selectedCustomer && !showCreateInspector ? "customer-editor-placeholder" : ""}`}
          title={selectedCustomer ? `${selectedCustomer.corpName || selectedCustomer.customerName}` : showCreateInspector ? "새 고객 등록" : "상세"}
          subtitle={selectedCustomer ? selectedCustomer.businessNumber : showCreateInspector ? "필수 4개부터 입력" : "고객을 선택하면 오른쪽에 상세가 열립니다."}
        >
          {selectedCustomer && selectedCustomerReadiness ? (
            <>
              <div className="customer-detail-top">
                <div className="customer-detail-head">
                  <div className="customer-detail-copy">
                    <strong>{selectedCustomer.corpName || selectedCustomer.customerName}</strong>
                    <small>{selectedCustomer.businessNumber}</small>
                  </div>
                  <div className="customer-detail-primary">
                    <span className={`chip ${selectedCustomerReadiness.tone === "success" ? "chip-success" : selectedCustomerReadiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>
                      {selectedCustomerReadiness.label}
                    </span>
                    {selectedCustomerPrimaryAction ? (
                      <button type="button" disabled={props.busyKey !== null} onClick={runSelectedCustomerPrimaryAction}>
                        {selectedCustomerPrimaryAction.label}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="customer-inspector-summary">{selectedInspectorSummary}</p>
                <dl className="customer-inspector-facts">
                  {selectedInspectorFacts.map((item) => (
                    <div key={item.label} className={item.wide ? "wide" : undefined}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="customer-detail-tabs customer-inspector-view-switch">
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

              {props.customerDetailTab === "history" ? (
                <div className="customer-history-table">
                  {props.mailboxDataLoading && props.selectedCustomerIssuedDrafts.length === 0 ? (
                    <div className="empty customer-history-empty">발행 이력을 불러오는 중입니다.</div>
                  ) : props.selectedCustomerIssuedDrafts.length > 0 ? (
                    props.selectedCustomerIssuedDrafts.map((draft) => {
                      const confirmNumber = props.getDraftConfirmNumber(draft);
                      return (
                        <article key={draft.id} className="customer-history-card customer-history-row">
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
                    })
                  ) : (
                    <div className="empty customer-history-empty">발행 이력이 없습니다.</div>
                  )}
                </div>
              ) : (
                <div className="customer-inspector-sections">
                  {detailPanelIssues.length > 0 || hiddenResolvedIssueCount > 0 || props.customerCertNotice ? (
                    <details className="customer-inspector-disclosure">
                      <summary>
                        추가 상태
                        <span>
                          {detailPanelIssues.length > 0
                            ? `${detailPanelIssues.length}개`
                            : hiddenResolvedIssueCount > 0
                              ? `완료 ${hiddenResolvedIssueCount}개`
                              : "확인"}
                        </span>
                      </summary>
                      <div className="customer-inspector-issue-list">
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
                        ) : (
                          <div className="customer-inspector-note">미해결 항목은 없습니다.</div>
                        )}
                        {hiddenResolvedIssueCount > 0 ? <div className="customer-inspector-note">완료 항목 {hiddenResolvedIssueCount}개는 기본 화면에서 숨김 처리했습니다.</div> : null}
                        {props.customerCertNotice ? <div className="customer-inspector-note">{props.customerCertNotice}</div> : null}
                      </div>
                    </details>
                  ) : null}

                  <details className="customer-inspector-disclosure">
                    <summary>
                      기본 정보 편집
                      <span>저장</span>
                    </summary>
                    {renderCustomerForm("edit")}
                  </details>

                  <details className="customer-inspector-disclosure">
                    <summary>
                      더보기
                      <span>저빈도 작업</span>
                    </summary>
                    <div className="customer-inspector-more-actions">
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
                        <button className="btn-ghost" onClick={() => void props.runAction(`reset-popbill-${selectedCustomer.id}`, async () => props.onResetPopbillLink(selectedCustomer))}>
                          연결 해제
                        </button>
                      ) : null}
                      <button className="btn-ghost btn-danger" onClick={() => void props.runAction(`delete-customer-${selectedCustomer.id}`, async () => props.onDeleteCustomer(selectedCustomer))}>
                        고객 삭제
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </>
          ) : showCreateInspector ? (
            <>
              <div className="customer-detail-top">
                <div className="customer-detail-head">
                  <div className="customer-detail-copy">
                    <strong>새 고객 등록</strong>
                    <small>필수 4개부터 입력</small>
                  </div>
                  <div className="customer-detail-primary">
                    <span className={`chip ${requiredCompletedCount === customerRequiredFieldChecks.length ? "chip-success" : "chip-warn"}`}>
                      {requiredCompletedCount}/4
                    </span>
                    <button type="button" className="btn-secondary" onClick={() => setShowCreateInspector(false)}>
                      닫기
                    </button>
                  </div>
                </div>
                <p className="customer-inspector-summary">대표자명, 사업자번호, 상호, 주소만 먼저 저장합니다.</p>
              </div>
              {renderCustomerForm("create")}
            </>
          ) : (
            <div className="customer-editor-empty customer-inspector-placeholder">
              <strong>고객을 선택하세요</strong>
              <p>목록에서 고객을 선택하면 오른쪽에 상세가 열립니다.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
