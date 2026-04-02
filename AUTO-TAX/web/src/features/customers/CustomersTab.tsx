import { useEffect, useMemo, useState } from "react";
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

type CustomerIssueChecklistItem = {
  key: string;
  label: string;
  tone: "success" | "warn" | "danger";
  actionLabel?: string;
  actionKind?: "join-popbill" | "register-certificate" | "check-certificate";
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
  const inlineCustomerIssue =
    selectedCustomerReadiness && visibleCustomerIssues.length === 1 && visibleCustomerIssues[0]?.label === selectedCustomerReadiness.reason
      ? visibleCustomerIssues[0]
      : null;
  const stackedCustomerIssues = inlineCustomerIssue ? [] : visibleCustomerIssues;
  const [recentCustomerIds, setRecentCustomerIds] = useState<number[]>([]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setRecentCustomerIds((previous) => [selectedCustomer.id, ...previous.filter((id) => id !== selectedCustomer.id)].slice(0, 6));
  }, [selectedCustomer?.id]);

  const recentCustomers = useMemo(
    () =>
      recentCustomerIds
        .map((customerId) => props.customers.find((customer) => customer.id === customerId) ?? null)
        .filter((customer): customer is Customer => customer !== null),
    [props.customers, recentCustomerIds]
  );

  const activeFilterCopy: Record<
    CustomerListFilter,
    {
      title: string;
      subtitle: string;
      empty: string;
    }
  > = {
    all: {
      title: "전체 고객",
      subtitle: "전체 고객을 확인합니다.",
      empty: "등록된 고객이 없습니다."
    },
    blocked: {
      title: "준비 필요 고객",
      subtitle: "먼저 처리할 고객만 모아봅니다.",
      empty: "준비 필요 고객이 없습니다."
    },
    ready: {
      title: "즉시 발행 가능 고객",
      subtitle: "바로 발행 가능한 고객입니다.",
      empty: "지금 바로 발행 가능한 고객이 없습니다."
    },
    expiring: {
      title: "인증서 주의 고객",
      subtitle: "만료가 가까운 고객입니다.",
      empty: "인증서 주의 고객이 없습니다."
    },
    unjoined: {
      title: "팝빌/인증서 연결 필요 고객",
      subtitle: "연결이 덜 끝난 고객입니다.",
      empty: "팝빌/인증서 연결이 필요한 고객이 없습니다."
    }
  };

  const focusCustomerList = (filter: CustomerListFilter) => {
    props.setCustomerSearchQuery("");
    props.setCustomerListFilter(filter);
  };

  const queueCards: Array<{
    key: CustomerListFilter;
    label: string;
    count: number;
    tone: "danger" | "warn" | "success";
    description: string;
  }> = [
    {
      key: "blocked",
      label: "지금 준비할 고객",
      count: props.blockedCustomerCount,
      tone: props.blockedCustomerCount > 0 ? "danger" : "success",
      description:
        props.blockedCustomerCount > 0
          ? "먼저 처리할 고객입니다."
          : "없음"
    },
    {
      key: "expiring",
      label: "인증서 주의",
      count: props.expiringSoonCustomerCount,
      tone: props.expiringSoonCustomerCount > 0 ? "warn" : "success",
      description:
        props.expiringSoonCustomerCount > 0
          ? "만료 전 점검이 필요합니다."
          : "없음"
    },
    {
      key: "unjoined",
      label: "연결 마무리 필요",
      count: props.popbillPendingCustomerCount,
      tone: props.popbillPendingCustomerCount > 0 ? "warn" : "success",
      description:
        props.popbillPendingCustomerCount > 0
          ? "가입 또는 연결이 필요합니다."
          : "없음"
    },
    {
      key: "ready",
      label: "즉시 발행 가능",
      count: props.readyCustomerCount,
      tone: props.readyCustomerCount > 0 ? "success" : "warn",
      description:
        props.readyCustomerCount > 0
          ? "지금 바로 발행 가능합니다."
          : "없음"
    }
  ];

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

  return (
    <div className="customers-screen">
      {props.expiredCertCustomers.length > 0 ? (
        <div className="alert error">
          인증서 만료 고객 {props.expiredCertCustomers.length}건: {props.expiredCertCustomers.map((customer) => customer.customerName).join(", ")}
        </div>
      ) : null}
      {props.expiringSoonCustomers.length > 0 ? (
        <div className="alert warn">
          인증서 만료 예정 30일 이내 {props.expiringSoonCustomers.length}건: {props.expiringSoonCustomers
            .map((customer) => `${customer.customerName}(${props.formatCertificateExpireDate(customer.popbillCertExpireDate)})`)
            .join(", ")}
        </div>
      ) : null}
      <div className="customers-layout">
        <Panel
          className="panel-customer-list"
          title={activeFilterCopy[props.customerListFilter].title}
          subtitle={activeFilterCopy[props.customerListFilter].subtitle}
          actions={(
            <>
              <button
                className="btn-secondary"
                disabled={props.hasReachedManagedCustomerLimit}
                onClick={props.onCreateCustomer}
              >
                새 고객
              </button>
              <button onClick={() => void props.runAction("customers-cert-refresh-all", props.onRefreshAllCertificateStatuses)}>인증서 일괄 점검</button>
            </>
          )}
        >
          <div className="customer-focus-grid" aria-label="고객 작업 바로가기">
            {queueCards.map((card) => (
              <button
                key={card.key}
                type="button"
                className={props.customerListFilter === card.key ? "customer-focus-card active" : "customer-focus-card"}
                onClick={() => focusCustomerList(card.key)}
              >
                <div className="customer-focus-head">
                  <span>{card.label}</span>
                  <span className={`chip ${card.tone === "danger" ? "chip-danger" : card.tone === "warn" ? "chip-warn" : "chip-success"}`}>
                    {card.count}명
                  </span>
                </div>
                <strong>{card.count.toLocaleString("ko-KR")}</strong>
              </button>
            ))}
          </div>
          <div className="customer-list-toolbar">
            <div className="customer-list-search">
              <input
                placeholder="대표자명 / 상호 / 사업자번호 검색"
                value={props.customerSearchQuery}
                onChange={(event) => props.setCustomerSearchQuery(event.target.value)}
              />
            </div>
            <div className="customer-list-filters">
              <button
                type="button"
                className={props.customerListFilter === "all" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("all")}
              >
                전체 {props.customers.length}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "blocked" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("blocked")}
              >
                준비 필요 {props.blockedCustomerCount}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "ready" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("ready")}
              >
                즉시 발행 가능 {props.readyCustomerCount}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "expiring" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("expiring")}
              >
                인증서 주의 {props.expiringSoonCustomerCount}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "unjoined" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("unjoined")}
              >
                팝빌 미등록 {props.popbillPendingCustomerCount}명
              </button>
            </div>
          </div>
          <div className="customer-list-summary-line">
            <span>전체 {props.customers.length}명</span>
            <span>검색 결과 {props.filteredCustomers.length}명</span>
            <span>즉시 발행 가능 {props.readyCustomerCount}명</span>
            {props.customerSearchQuery.trim() !== "" ? <span>검색어 {props.customerSearchQuery.trim()}</span> : null}
          </div>
          {recentCustomers.length > 0 ? (
            <div className="customer-recent-strip" aria-label="최근 본 고객">
              <strong>최근 본 고객</strong>
              <div className="customer-recent-chips">
                {recentCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="btn-secondary"
                    onClick={() => props.onSelectCustomer(customer)}
                  >
                    {customer.customerName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="helper-box customer-limit-box">
            <strong>관리 고객 한도</strong>
            <span>
              현재 {props.managedCustomerCount}명
              {props.managedCustomerLimit !== null ? ` / 한도 ${props.managedCustomerLimit}명` : ""}
              {props.hasReachedManagedCustomerLimit ? " · 한도에 도달해 새 고객 등록이 잠겨 있습니다." : ""}
            </span>
          </div>
          <div className="list">
            {props.filteredCustomers.map((customer) => {
              const readiness = props.getCustomerIssueReadiness(customer);
              const isSelected = props.customerForm.id === customer.id;

              return (
                <button
                  key={customer.id}
                  type="button"
                  className={`customer-summary ${isSelected ? "selected" : ""} ${readiness.canIssueNow ? "customer-summary-ready" : "customer-summary-blocked"}`}
                  onClick={() => props.onSelectCustomer(customer)}
                >
                  <div className="customer-summary-head">
                    <div className="customer-summary-copy">
                      <strong>{customer.corpName}</strong>
                      <p>{customer.customerName}</p>
                    </div>
                    <span className={`chip ${readiness.tone === "success" ? "chip-success" : readiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>{readiness.label}</span>
                  </div>
                  <div className="customer-summary-meta">
                    <span>{customer.businessNumber}</span>
                    <span>{props.getCustomerPopbillSummary(customer)}</span>
                    <span>{props.getCustomerCertificateSummary(customer)}</span>
                  </div>
                  <p className="customer-summary-reason">{readiness.reason}</p>
                  {isSelected || props.customerSearchQuery.trim() !== "" ? <p className="customer-summary-address">{customer.addr}</p> : null}
                </button>
              );
            })}
            {props.filteredCustomers.length === 0 ? (
              <div className="empty">
                {props.customerSearchQuery.trim() !== ""
                  ? "검색 결과가 없습니다."
                  : activeFilterCopy[props.customerListFilter].empty}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          className="panel-customer-editor"
          title={props.selectedCustomer ? `${props.selectedCustomer.customerName}` : "새 고객 등록"}
          subtitle={props.selectedCustomer ? "기본 정보와 상태" : "필수값 4개만 먼저 입력합니다."}
          actions={props.selectedCustomer && props.customerDetailTab === "info" ? (
            <button
              disabled={props.busyKey !== null}
              onClick={() => void props.runAction("save-customer-top", props.onSaveCustomer)}
            >
              {props.isSavingCustomer ? "고객 저장 중..." : "고객 저장"}
            </button>
          ) : null}
        >
          {selectedCustomer && selectedCustomerReadiness ? (
            <div className="customer-detail-top">
              <div className="customer-detail-copy">
                <strong>{selectedCustomer.corpName}</strong>
                <span>{selectedCustomer.customerName}</span>
              </div>
              <div className="customer-detail-stats">
                <div>
                  <span>사업자번호</span>
                  <strong>{selectedCustomer.businessNumber}</strong>
                </div>
                <div>
                  <span>팝빌</span>
                  <strong>{props.getCustomerPopbillSummary(selectedCustomer)}</strong>
                </div>
                <div>
                  <span>인증서</span>
                  <strong>{props.getCustomerCertificateSummary(selectedCustomer)}</strong>
                </div>
              </div>
              <p className="customer-detail-address">{selectedCustomer.addr}</p>
              <div className="customer-detail-status-row">
                <span className={`chip ${selectedCustomerReadiness.tone === "success" ? "chip-success" : selectedCustomerReadiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>
                  {selectedCustomerReadiness.label}
                </span>
                {selectedCustomerReadiness.reason !== "준비 완료" ? <span className="customer-detail-status-note">{selectedCustomerReadiness.reason}</span> : null}
                {inlineCustomerIssue?.actionLabel ? (
                  <button type="button" className="btn-secondary" onClick={() => runSelectedCustomerIssueAction(inlineCustomerIssue)}>
                    {inlineCustomerIssue.actionLabel}
                  </button>
                ) : null}
              </div>
              {stackedCustomerIssues.length > 0 ? (
                <div className="customer-issue-list" aria-label="발행 준비 상태">
                  {stackedCustomerIssues.map((issue) => (
                  <article
                    key={issue.key}
                    className={
                      issue.tone === "danger"
                        ? "customer-issue-card tone-danger"
                        : issue.tone === "warn"
                          ? "customer-issue-card tone-warn"
                          : "customer-issue-card tone-success"
                    }
                  >
                    <div className="customer-issue-card-copy">
                      <span className={`chip ${issue.tone === "danger" ? "chip-danger" : issue.tone === "warn" ? "chip-warn" : "chip-success"}`}>
                        {issue.tone === "danger" ? "중요" : issue.tone === "warn" ? "점검" : "완료"}
                      </span>
                      <span className="customer-issue-text">{issue.label}</span>
                    </div>
                    {issue.actionLabel ? (
                      <button type="button" className="btn-secondary" onClick={() => runSelectedCustomerIssueAction(issue)}>
                        {issue.actionLabel}
                      </button>
                    ) : null}
                  </article>
                  ))}
                </div>
              ) : null}
              {selectedCustomer.popbillState === "joined" &&
              selectedCustomer.popbillCertRegistered &&
              selectedCustomerReadiness.reason === "준비 완료" ? (
                <div className="customer-detail-actions">
                  <button
                    type="button"
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
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      void props.runAction(
                        `cert-status-${selectedCustomer.id}`,
                        async () => props.onRefreshCustomerCertificateStatus(selectedCustomer.id)
                      )
                    }
                  >
                    만료일 확인
                  </button>
                </div>
              ) : null}
              {props.customerCertNotice ? <div className="helper-box customer-cert-notice"><span>{props.customerCertNotice}</span></div> : null}
              <details className="customer-detail-secondary">
                <summary>더보기</summary>
                <div className="customer-detail-secondary-actions">
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
          ) : null}
          {props.selectedCustomer ? (
            <div className="customer-detail-tabs">
              <button
                type="button"
                className={props.customerDetailTab === "info" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerDetailTab("info")}
              >
                기본 정보
              </button>
              <button
                type="button"
                className={props.customerDetailTab === "history" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerDetailTab("history")}
              >
                발행 이력 {props.selectedCustomerIssuedDrafts.length}건
              </button>
            </div>
          ) : null}

          {props.selectedCustomer && props.customerDetailTab === "history" ? (
            <div className="customer-history-list">
              {props.mailboxDataLoading && props.selectedCustomerIssuedDrafts.length === 0 ? (
                <div className="empty">발행 이력을 불러오는 중입니다.</div>
              ) : props.selectedCustomerIssuedDrafts.length > 0 ? (
                props.selectedCustomerIssuedDrafts.map((draft) => {
                  const confirmNumber = props.getDraftConfirmNumber(draft);
                  return (
                    <article key={draft.id} className="customer-history-card">
                      <div className="customer-history-head">
                        <div>
                          <strong>{draft.itemName}</strong>
                          <span>{props.formatDateTime(draft.issuedAt)}</span>
                        </div>
                        <span className="chip chip-success">발행 완료</span>
                      </div>
                      <div className="customer-history-meta">
                        <span>공급가액 {props.formatMoney(draft.supplyCost)}원</span>
                        <span>합계 {props.formatMoney(draft.totalAmount)}원</span>
                        <span>관리번호 {draft.popbillMgtKey || "-"}</span>
                        <span>승인번호 {confirmNumber ?? "-"}</span>
                      </div>
                      <div className="customer-history-actions">
                        <button
                          className="btn-secondary"
                          disabled={props.busyKey !== null}
                          onClick={() => void props.runAction(`draft-info-${draft.id}`, async () => props.onShowDraftPopbillInfo(draft.id))}
                        >
                          상태조회
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
                <div className="empty">이 고객의 발행 이력이 없습니다.</div>
              )}
            </div>
          ) : (
            <form
              className="customer-form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (props.busyKey !== null) return;
                if (!props.selectedCustomer && props.hasReachedManagedCustomerLimit) return;
                void props.runAction(props.customerForm.id === null ? "save-customer" : `save-customer-${props.customerForm.id}`, props.onSaveCustomer);
              }}
            >
              <div className="form-grid customer-form-primary-grid">
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
                  <span className="field-hint">저장된 도로명주소와 같은 주소로 들어온 메일만 자동 매칭됩니다.</span>
                  {props.customerAddressResolveMessage ? <span className="field-hint">{props.customerAddressResolveMessage}</span> : null}
                </label>
              </div>
              <details className="customer-form-advanced">
                <summary>추가 입력 보기</summary>
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
                    <span className="field-hint">인증서 갱신 자동 제출에서 고객별 연락처로 사용합니다.</span>
                  </label>
                  <label className="full">
                    발행 방식
                    <select
                      value={props.customerForm.issueMode}
                      onChange={(event) =>
                        props.setCustomerForm((prev) => ({
                          ...prev,
                          issueMode:
                            prev.id === null ? "review" : event.target.value === "auto" ? "auto" : "review"
                        }))
                      }
                      disabled={props.customerForm.id === null}
                    >
                      <option value="review">검수 후 발행</option>
                      <option value="auto" disabled={props.customerForm.id === null}>월 자동 발행</option>
                    </select>
                    <span className="field-hint">
                      {props.customerForm.id === null
                        ? "처음 등록할 때는 먼저 검수 후 발행으로 저장됩니다. 저장 후 수정 화면에서 월 자동 발행으로 바꿀 수 있습니다."
                        : "자동 발행 고객은 작업공간 설정의 일정에 맞춰 메일 확인 뒤 바로 발행되고, 검수 고객은 초안만 만들어집니다."}
                    </span>
                  </label>
                  <label className="full">
                    메모
                    <textarea rows={3} value={props.customerForm.memo} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, memo: event.target.value }))} />
                  </label>
                </div>
              </details>
              {!props.selectedCustomer ? (
                <div className="button-row customer-form-submit-row">
                  <button type="submit" disabled={props.hasReachedManagedCustomerLimit || props.busyKey !== null}>
                    {props.isSavingCustomer ? "고객 등록 및 팝빌 가입 중..." : "고객 등록"}
                  </button>
                  {props.hasReachedManagedCustomerLimit ? (
                    <span className="field-hint">관리 고객 한도에 도달해 새 고객 등록이 잠겨 있습니다. 플랫폼 관리자에게 한도 상향을 요청하세요.</span>
                  ) : props.isSavingCustomer ? (
                    <span className="field-hint">고객 등록과 팝빌 가입을 처리하고 있습니다. 잠시만 기다려주세요.</span>
                  ) : null}
                </div>
              ) : null}
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
