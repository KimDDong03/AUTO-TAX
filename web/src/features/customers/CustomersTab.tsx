import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { StatusBadge, SurfaceCard, type StatusBadgeTone } from "../../components/ui";
import type { Customer, InvoiceDraft } from "../../types";
import { CustomerAlerts } from "./components/CustomerAlerts";
import { CustomerDetailOverview, type CustomerDetailStatusCard } from "./components/CustomerDetailOverview";
import { CustomerHistorySection } from "./components/CustomerHistorySection";
import { CustomerListEmptyState } from "./components/CustomerListEmptyState";
import { CustomerReadSection } from "./components/CustomerReadSection";

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

function getStatusBadgeTone(tone: "success" | "warn" | "danger" | "default"): StatusBadgeTone {
  switch (tone) {
    case "success":
      return "success";
    case "warn":
      return "warning";
    case "danger":
      return "danger";
    default:
      return "neutral";
  }
}

function isDateWithinDays(value: string | null, days: number) {
  if (!value) return false;
  const targetTime = new Date(value).getTime();
  if (!Number.isFinite(targetTime)) return false;
  const diff = targetTime - Date.now();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

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
  const selectedCustomerId = selectedCustomer?.id ?? null;
  const selectedCustomerReadiness = props.selectedCustomerReadiness;
  const visibleCustomerIssues = props.selectedCustomerIssues.filter((issue) => issue.tone !== "success" || Boolean(issue.actionLabel));
  const inlineCustomerIssue =
    selectedCustomerReadiness && visibleCustomerIssues.length === 1 && visibleCustomerIssues[0]?.label === selectedCustomerReadiness.reason
      ? visibleCustomerIssues[0]
      : null;
  const stackedCustomerIssues = inlineCustomerIssue ? [] : visibleCustomerIssues;
  const [recentCustomerIds, setRecentCustomerIds] = useState<number[]>([]);
  const [detailEditSection, setDetailEditSection] = useState<"none" | "core" | "advanced">("none");

  useEffect(() => {
    if (!selectedCustomer) return;
    setRecentCustomerIds((previous) => [selectedCustomer.id, ...previous.filter((id) => id !== selectedCustomer.id)].slice(0, 6));
  }, [selectedCustomer?.id]);

  useEffect(() => {
    setDetailEditSection("none");
  }, [selectedCustomerId, props.customerDetailTab]);

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
      label: "지금 준비",
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
      label: "연결 필요",
      count: props.popbillPendingCustomerCount,
      tone: props.popbillPendingCustomerCount > 0 ? "warn" : "success",
      description:
        props.popbillPendingCustomerCount > 0
          ? "가입 또는 연결이 필요합니다."
          : "없음"
    },
    {
      key: "ready",
      label: "즉시 발행",
      count: props.readyCustomerCount,
      tone: props.readyCustomerCount > 0 ? "success" : "warn",
      description:
        props.readyCustomerCount > 0
          ? "지금 바로 발행 가능합니다."
          : "없음"
    }
  ];
  const customerAttentionCount =
    props.blockedCustomerCount + props.popbillPendingCustomerCount + props.expiringSoonCustomerCount;
  const customerEmptyPrimaryAction =
    props.customerSearchQuery.trim() !== ""
      ? {
          label: "검색 초기화",
          onClick: () => {
            props.setCustomerSearchQuery("");
            focusCustomerList("all");
          }
        }
      : props.customers.length === 0
        ? {
            label: "첫 고객 등록",
            onClick: props.onCreateCustomer
          }
        : props.blockedCustomerCount > 0
          ? {
              label: `준비 필요 ${props.blockedCustomerCount}명 보기`,
              onClick: () => focusCustomerList("blocked")
            }
          : props.popbillPendingCustomerCount > 0
            ? {
                label: `연결 필요 ${props.popbillPendingCustomerCount}명 보기`,
                onClick: () => focusCustomerList("unjoined")
              }
            : {
                label: `즉시 발행 ${props.readyCustomerCount}명 보기`,
                onClick: () => focusCustomerList("ready")
              };
  const customerEmptyPrimaryCreatesCustomer = props.customerSearchQuery.trim() === "" && props.customers.length === 0;

  const selectedCustomerCertificateTone =
    !selectedCustomer?.popbillCertRegistered
      ? "danger"
      : isDateWithinDays(selectedCustomer.popbillCertExpireDate, 30)
        ? "warn"
        : "success";
  const selectedCustomerStatusCards: CustomerDetailStatusCard[] =
    selectedCustomer && selectedCustomerReadiness
      ? [
          {
            label: "발행 준비상태",
            value: selectedCustomerReadiness.label,
            note: selectedCustomerReadiness.reason,
            tone: selectedCustomerReadiness.tone
          },
          {
            label: "팝빌 상태",
            value: props.getCustomerPopbillSummary(selectedCustomer),
            note:
              selectedCustomer.popbillState === "joined"
                ? "고객 계정 연결 완료"
                : selectedCustomer.popbillState === "failed"
                  ? "가입 다시 확인 필요"
                  : "가입 또는 연결 필요",
            tone:
              selectedCustomer.popbillState === "joined"
                ? "success"
                : selectedCustomer.popbillState === "failed"
                  ? "danger"
                  : "warn"
          },
          {
            label: "인증서 상태",
            value: props.getCustomerCertificateSummary(selectedCustomer),
            note: selectedCustomer.popbillCertExpireDate
              ? `만료 ${props.formatCertificateExpireDate(selectedCustomer.popbillCertExpireDate)}`
              : "등록 여부 확인 필요",
            tone: selectedCustomerCertificateTone
          },
          {
            label: "최근 발행",
            value: props.selectedCustomerIssuedDrafts.length > 0 ? `${props.selectedCustomerIssuedDrafts.length}건` : "없음",
            note:
              props.selectedCustomerIssuedDrafts[0]?.issuedAt
                ? `최근 ${props.formatDateTime(props.selectedCustomerIssuedDrafts[0].issuedAt)}`
                : "발행 이력 없음",
            tone: props.selectedCustomerIssuedDrafts.length > 0 ? "success" : "default"
          }
        ]
      : [];
  const selectedCustomerCoreFields =
    selectedCustomer
      ? [
          { label: "대표자명", value: selectedCustomer.customerName || "-", full: false },
          { label: "사업자번호", value: selectedCustomer.businessNumber || "-", full: false },
          { label: "세금계산서 상호", value: selectedCustomer.corpName || "-", full: false },
          { label: "주소", value: selectedCustomer.addr || "-", full: true }
        ]
      : [];
  const selectedCustomerOperatingFields =
    selectedCustomer
      ? [
          { label: "발행 방식", value: props.getIssueModeLabel(selectedCustomer.issueMode), full: false },
          { label: "팝빌 아이디", value: selectedCustomer.popbillUserId || "미입력", full: false },
          { label: "업태", value: selectedCustomer.bizType || "미입력", full: false },
          { label: "업종", value: selectedCustomer.bizClass || "미입력", full: false },
          { label: "고객 연락처", value: selectedCustomer.renewalContactMobile || "미입력", full: false },
          { label: "자동 매칭 주소", value: selectedCustomer.matchAddresses[0] || selectedCustomer.addr || "미입력", full: true }
        ]
      : [];
  const selectedCustomerMemo = selectedCustomer?.memo.trim() ?? "";

  const handleCustomerFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (props.busyKey !== null) return;
    if (!props.selectedCustomer && props.hasReachedManagedCustomerLimit) return;
    const actionKey = props.customerForm.id === null ? "save-customer" : `save-customer-${props.customerForm.id}`;
    void props.runAction(actionKey, async () => {
      await props.onSaveCustomer();
      setDetailEditSection("none");
    });
  };

  const resetSelectedCustomerForm = () => {
    if (!selectedCustomer) return;
    props.onSelectCustomer(selectedCustomer);
    setDetailEditSection("none");
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

  return (
    <div className="stitch-customer-screen">
      <CustomerAlerts
        expiredCertCustomers={props.expiredCertCustomers}
        expiringSoonCustomers={props.expiringSoonCustomers}
        formatCertificateExpireDate={props.formatCertificateExpireDate}
      />

      <div className="stitch-customer-grid">
        <SurfaceCard as="aside" className="stitch-customer-sidebar">
          <div className="stitch-customer-sidebar-head">
            <div>
              <h3>고객 목록</h3>
              <p>
                {activeFilterCopy[props.customerListFilter].title} · 검색 결과 {props.filteredCustomers.length}명
              </p>
            </div>
            <div className="stitch-customer-sidebar-actions">
              <button className={selectedCustomer ? undefined : "btn-secondary"} disabled={props.hasReachedManagedCustomerLimit} onClick={props.onCreateCustomer}>
                새 고객
              </button>
              <button className="btn-secondary" onClick={() => void props.runAction("customers-cert-refresh-all", props.onRefreshAllCertificateStatuses)}>
                인증서 일괄 점검
              </button>
            </div>
          </div>

          <div className="stitch-customer-toolbar">
            <label className="stitch-customer-search-row">
              <input
                placeholder="대표자명 / 상호 / 사업자번호 검색"
                value={props.customerSearchQuery}
                onChange={(event) => props.setCustomerSearchQuery(event.target.value)}
              />
            </label>

            <div className="stitch-customer-quick-filters" aria-label="고객 작업 바로가기">
              <button
                type="button"
                className={props.customerListFilter === "all" ? "stitch-customer-quick-filter is-active" : "stitch-customer-quick-filter"}
                onClick={() => focusCustomerList("all")}
              >
                <span>전체 고객</span>
                <strong>{props.customers.length}</strong>
              </button>
              {queueCards.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  className={
                    props.customerListFilter === card.key
                      ? `stitch-customer-quick-filter tone-${card.tone} is-active`
                      : `stitch-customer-quick-filter tone-${card.tone}`
                  }
                  onClick={() => focusCustomerList(card.key)}
                >
                  <span>{card.label}</span>
                  <strong>{card.count}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="stitch-customer-table-shell">
            <div className="stitch-customer-table-summary">
              <div>
                <strong>{activeFilterCopy[props.customerListFilter].title}</strong>
                <span>{activeFilterCopy[props.customerListFilter].subtitle}</span>
              </div>
              <div className="stitch-customer-table-summary-meta">
                <span>검색 {props.filteredCustomers.length}명</span>
                <span>즉시 발행 {props.readyCustomerCount}명</span>
                <span>연결 필요 {props.popbillPendingCustomerCount}명</span>
              </div>
            </div>

            <div className="stitch-customer-table-wrap">
              <table className="stitch-customer-table">
                <thead>
                  <tr>
                    <th>고객</th>
                    <th>사업자번호</th>
                    <th>발행 준비</th>
                    <th>연결 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {props.filteredCustomers.map((customer) => {
                    const readiness = props.getCustomerIssueReadiness(customer);
                    const isSelected = selectedCustomerId === customer.id;

                    return (
                      <tr
                        key={customer.id}
                        className={isSelected ? "stitch-customer-table-row is-selected" : "stitch-customer-table-row"}
                        onClick={() => props.onSelectCustomer(customer)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          props.onSelectCustomer(customer);
                        }}
                        tabIndex={0}
                        aria-selected={isSelected}
                      >
                        <td>
                          <div className="stitch-customer-table-customer">
                            <strong>{customer.corpName}</strong>
                            <span>{customer.customerName}</span>
                          </div>
                        </td>
                        <td className="stitch-customer-table-business-number">{customer.businessNumber}</td>
                        <td>
                          <div className="stitch-customer-table-status">
                            <StatusBadge compact tone={getStatusBadgeTone(readiness.tone)}>
                              {readiness.label}
                            </StatusBadge>
                            <small>{readiness.reason}</small>
                          </div>
                        </td>
                        <td>
                          <div className="stitch-customer-table-link">
                            <strong>{props.getCustomerPopbillSummary(customer)}</strong>
                            <span>{props.getCustomerCertificateSummary(customer)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {props.filteredCustomers.length === 0 ? (
                    <tr>
                      <td className="stitch-customer-table-empty" colSpan={4}>
                        <CustomerListEmptyState
                          title={props.customerSearchQuery.trim() !== "" ? "검색 결과가 없습니다." : activeFilterCopy[props.customerListFilter].empty}
                          description={
                            props.customerSearchQuery.trim() !== ""
                              ? "검색어를 줄이거나 다른 필터를 선택해 보세요."
                              : "준비 고객을 먼저 보거나 새 고객 등록으로 운영 목록을 채울 수 있습니다."
                          }
                          onPrimaryAction={customerEmptyPrimaryAction.onClick}
                          primaryActionLabel={customerEmptyPrimaryAction.label}
                          primaryActionDisabled={customerEmptyPrimaryCreatesCustomer && props.hasReachedManagedCustomerLimit}
                          onSecondaryAction={props.customerSearchQuery.trim() === "" ? () => focusCustomerList("all") : props.onCreateCustomer}
                          secondaryActionLabel={props.customerSearchQuery.trim() === "" ? "전체 고객 보기" : "새 고객 등록"}
                          secondaryActionDisabled={props.customerSearchQuery.trim() !== "" ? props.hasReachedManagedCustomerLimit : false}
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="stitch-customer-sidebar-foot">
            {props.customers.length > 0 || props.managedCustomerCount > 0 ? (
              <div className="stitch-customer-limit-card compact">
                <strong>
                  관리 고객 {props.managedCustomerCount}명
                  {props.managedCustomerLimit !== null ? ` / ${props.managedCustomerLimit}명` : ""}
                </strong>
                <span>
                  {props.hasReachedManagedCustomerLimit
                    ? "한도에 도달해 새 고객 등록이 잠겨 있습니다."
                    : "현재 작업공간에서 관리 중인 고객 수입니다."}
                </span>
              </div>
            ) : null}

            {recentCustomers.length > 0 ? (
              <div className="stitch-customer-recent compact">
                <strong>최근 본 고객</strong>
                <div className="stitch-customer-recent-chips">
                  {recentCustomers.map((customer) => (
                    <button key={customer.id} type="button" className="btn-secondary" onClick={() => props.onSelectCustomer(customer)}>
                      {customer.customerName}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </SurfaceCard>

        <section className="stitch-customer-detail">
          <SurfaceCard as="div" className="stitch-customer-detail-shell">
          {selectedCustomer && selectedCustomerReadiness ? (
            <CustomerDetailOverview
              customer={selectedCustomer}
              readiness={{
                label: selectedCustomerReadiness.label,
                tone: selectedCustomerReadiness.tone,
                reason: selectedCustomerReadiness.reason,
                actionLabel: inlineCustomerIssue?.actionLabel,
                onAction: inlineCustomerIssue?.actionLabel ? () => runSelectedCustomerIssueAction(inlineCustomerIssue) : undefined
              }}
              statusCards={selectedCustomerStatusCards}
              issues={stackedCustomerIssues.map((issue) => ({
                key: issue.key,
                label: issue.label,
                tone: issue.tone,
                actionLabel: issue.actionLabel,
                onAction: issue.actionLabel ? () => runSelectedCustomerIssueAction(issue) : undefined
              }))}
              certificateNotice={props.customerCertNotice}
              heroActions={
                selectedCustomer.popbillState !== "joined" ? (
                  <button
                    type="button"
                    onClick={() => void props.runAction(`join-${selectedCustomer.id}`, async () => props.onJoinCustomerPopbill(selectedCustomer.id))}
                  >
                    팝빌 가입
                  </button>
                ) : !selectedCustomer.popbillCertRegistered ? (
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
                    인증서 등록
                  </button>
                ) : (
                  <>
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
                  </>
                )
              }
              secondaryActions={
                <>
                  {selectedCustomer.popbillState === "joined" ? (
                    <button className="btn-ghost" onClick={() => void props.runAction(`reset-popbill-${selectedCustomer.id}`, async () => props.onResetPopbillLink(selectedCustomer))}>
                      연결 해제
                    </button>
                  ) : null}
                  <button className="btn-ghost btn-danger" onClick={() => void props.runAction(`delete-customer-${selectedCustomer.id}`, async () => props.onDeleteCustomer(selectedCustomer))}>
                    고객 삭제
                  </button>
                </>
              }
            />
          ) : null}
          {props.selectedCustomer ? (
            <div className="stitch-customer-detail-tabs">
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
            <CustomerHistorySection
              mailboxDataLoading={props.mailboxDataLoading}
              drafts={props.selectedCustomerIssuedDrafts}
              busyKey={props.busyKey}
              runAction={props.runAction}
              onShowDraftPopbillInfo={props.onShowDraftPopbillInfo}
              onOpenDraftPopbillUrl={props.onOpenDraftPopbillUrl}
              formatDateTime={props.formatDateTime}
              formatMoney={props.formatMoney}
              getDraftConfirmNumber={props.getDraftConfirmNumber}
            />
          ) : props.selectedCustomer ? (
            <div className="stitch-customer-info-stack">
              <CustomerReadSection
                title="기본 정보"
                description="평소에는 읽기 화면으로 보고, 필요할 때만 수정합니다."
                isEditing={detailEditSection === "core"}
                openLabel="기본 정보 수정"
                closeLabel="수정 닫기"
                onToggle={() => setDetailEditSection((previous) => (previous === "core" ? "none" : "core"))}
                fields={selectedCustomerCoreFields}
              >
                {detailEditSection === "core" ? (
                <form className="stitch-customer-edit-panel" onSubmit={handleCustomerFormSubmit}>
                  <div className="stitch-customer-form-banner">
                    <strong>기본 정보 수정</strong>
                    <span>대표자명, 사업자번호, 상호, 주소만 먼저 손봅니다.</span>
                  </div>
                  <div className="form-grid stitch-customer-form-primary-grid">
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
                  <div className="button-row stitch-customer-form-submit-row">
                    <button type="submit" disabled={props.busyKey !== null}>
                      {props.isSavingCustomer ? "저장 중..." : "기본 정보 저장"}
                    </button>
                    <button type="button" className="btn-secondary" disabled={props.busyKey !== null} onClick={resetSelectedCustomerForm}>
                      취소
                    </button>
                  </div>
                </form>
                ) : null}
              </CustomerReadSection>

              <CustomerReadSection
                title="운영 설정"
                description="발행 방식과 추가 운영값은 여기서 확인합니다."
                isEditing={detailEditSection === "advanced"}
                openLabel="운영 정보 수정"
                closeLabel="수정 닫기"
                onToggle={() => setDetailEditSection((previous) => (previous === "advanced" ? "none" : "advanced"))}
                fields={selectedCustomerOperatingFields}
              >
                {detailEditSection === "advanced" ? (
                <form className="stitch-customer-edit-panel" onSubmit={handleCustomerFormSubmit}>
                  <div className="stitch-customer-form-banner">
                    <strong>운영 정보 수정</strong>
                    <span>업태, 업종, 연락처, 발행 방식을 조정합니다.</span>
                  </div>
                  <div className="form-grid stitch-customer-form-advanced-grid">
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
                  <div className="button-row stitch-customer-form-submit-row">
                    <button type="submit" disabled={props.busyKey !== null}>
                      {props.isSavingCustomer ? "저장 중..." : "운영 정보 저장"}
                    </button>
                    <button type="button" className="btn-secondary" disabled={props.busyKey !== null} onClick={resetSelectedCustomerForm}>
                      취소
                    </button>
                  </div>
                </form>
                ) : null}
              </CustomerReadSection>

              <section className="stitch-customer-read-section">
                <div className="stitch-customer-section-head">
                  <div className="stitch-customer-section-copy">
                    <strong>메모 / 참고</strong>
                    <span>운영자가 고객별로 남겨둔 참고 사항입니다.</span>
                  </div>
                </div>
                <div className="stitch-customer-note-card">{selectedCustomerMemo || "남겨둔 메모가 없습니다."}</div>
              </section>
            </div>
          ) : (
            <div className="stitch-customer-empty-shell">
              <div className="stitch-customer-empty-form-column">
                <form
                  className="stitch-customer-form-stack"
                  onSubmit={handleCustomerFormSubmit}
                >
                  <div className="stitch-customer-form-banner">
                    <strong>{props.selectedCustomer ? "기본 정보 수정" : "새 고객 등록"}</strong>
                    <span>
                      {props.selectedCustomer
                        ? "발행 준비상태와 연결 상태를 보면서 고객 기본값을 바로 수정합니다."
                        : "기본 정보만 저장하면 이후 팝빌·인증서 연결을 바로 이어갈 수 있습니다."}
                    </span>
                    {!props.selectedCustomer ? (
                      <div className="stitch-customer-empty-inline-metrics">
                        <span>등록 고객 {props.customers.length}명</span>
                        <span>즉시 발행 {props.readyCustomerCount}명</span>
                        <span>연결 필요 {props.popbillPendingCustomerCount}명</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="form-grid stitch-customer-form-primary-grid">
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
                  <details className="stitch-customer-form-advanced">
                    <summary>추가 입력 보기</summary>
                    <div className="form-grid stitch-customer-form-advanced-grid">
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
                    <div className="button-row stitch-customer-form-submit-row">
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

              </div>
            </div>
          )}
          </SurfaceCard>
        </section>
      </div>
    </div>
  );
}
