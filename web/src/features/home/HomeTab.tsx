import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import type { Customer, CustomerContractRenewalDueItem, InboxMessage, InvoiceDraft, IssuedMonthlyTrendPayload } from "../../types";
import type { HomeActionKey, HomeScreenModel } from "./homeScreenModel";

type HomeTabProps = {
  mailboxDataLoading: boolean;
  model: HomeScreenModel;
  screenTitle: string;
  userLabel: string;
  workspaceLabel: string;
  popbillModeLabel: string;
  customers: Customer[];
  reviewDrafts: InvoiceDraft[];
  recentInboxMessages: InboxMessage[];
  recentIssuedDrafts: InvoiceDraft[];
  issuedDraftsByCustomerId: Map<number, InvoiceDraft[]>;
  contractRenewalDueItems: CustomerContractRenewalDueItem[];
  currentMonthIssuedDraftCount: number;
  currentBillingMonth: string;
  issuedMonthlyTrend: IssuedMonthlyTrendPayload | null;
  issuedMonthlyTrendLoading: boolean;
  issuedMonthlyTrendError: string;
  monthlyIssueLimit: number;
  workFeedTab: "inbox" | "issued";
  reprocessableMessageCount: number;
  busyKey: string | null;
  onOpenAction: (actionKey: HomeActionKey) => void;
  onLoadIssuedMonthlyTrend: (anchorBillingMonth: string) => void;
  onResetIssuedMonthlyTrend: () => void;
  onOpenCustomers: () => void;
  onSelectFeedTab: (tab: "inbox" | "issued") => void;
  onIssueAllReviewDrafts: () => void;
  onIssueDraft: (draftId: number) => void;
  onReprocessInboxMessage: (messageId: number) => void;
  onReprocessAllMessages: () => void;
  onViewDraft: (draftId: number) => void;
  onCancelDraft: (draftId: number) => void;
  onCompleteContractRenewal: (item: CustomerContractRenewalDueItem) => void;
  onDownloadContractRenewals: () => void;
  getInboxDisplayParseStatus: (message: InboxMessage) => string;
  getParseStatusLabel: (status: string) => string;
  getDraftStatusLabel: (status: string) => string;
  isInboxActionable: (message: InboxMessage) => boolean;
  formatMoney: (value: number) => string;
  formatDateTime: (value: string | null) => string;
  simplifyIssueError: (value: string) => string;
};

type HomeMetricCard = {
  label: string;
  value: string;
  description: string;
  actionKey: HomeActionKey;
};

type RecentCustomerRow = {
  id: number;
  customerName: string;
  businessNumber: string;
  recentIssuedAt: string | null;
  statusLabel: string;
  statusClassName: string;
  sortTime: number;
};

type IssuedMonthlyTrendMonth = IssuedMonthlyTrendPayload["months"][number];

function isMockHomeRow(id: number): boolean {
  return id < 0;
}

function getTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getDraftSortTime(draft: InvoiceDraft): number {
  return getTimestamp(draft.issuedAt) || getTimestamp(draft.updatedAt) || getTimestamp(draft.createdAt);
}

function getLatestIssuedDraft(drafts: InvoiceDraft[]): InvoiceDraft | null {
  const issuedDrafts = drafts.filter((draft) => draft.status === "issued" && !isMockHomeRow(draft.id));
  if (issuedDrafts.length === 0) return null;
  return [...issuedDrafts].sort((left, right) => getDraftSortTime(right) - getDraftSortTime(left))[0] ?? null;
}

function formatDateOnly(value: string | null): string {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "-";
  return new Date(timestamp).toLocaleDateString("ko-KR");
}

function formatBillingMonthLabel(billingMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(billingMonth);
  if (!match) return billingMonth || "-";
  return `${match[1].slice(2)}.${match[2]}`;
}

function getIssuedMonthlyTrendCount(months: IssuedMonthlyTrendMonth[], billingMonth: string): number {
  return months.find((month) => month.billingMonth === billingMonth)?.issuedDraftCount ?? 0;
}

function getMetricValue(metrics: HomeScreenModel["chips"], labelKeyword: string, fallback: string): string {
  return metrics.find((metric) => metric.label.includes(labelKeyword))?.value ?? fallback;
}

function buildRecentCustomerRows(props: HomeTabProps): RecentCustomerRow[] {
  const renewalCustomerIds = new Set(props.contractRenewalDueItems.map((item) => item.customerId));

  return props.customers
    .map((customer) => {
      const latestDraft = getLatestIssuedDraft(props.issuedDraftsByCustomerId.get(customer.id) ?? []);
      const fallbackSortTime = getTimestamp(customer.updatedAt) || getTimestamp(customer.createdAt);
      const hasRenewalDue = renewalCustomerIds.has(customer.id);

      return {
        id: customer.id,
        customerName: customer.corpName || customer.customerName,
        businessNumber: customer.businessNumber || "-",
        recentIssuedAt: latestDraft?.issuedAt ?? latestDraft?.updatedAt ?? null,
        statusLabel: latestDraft ? "발행 완료" : hasRenewalDue ? "계약 확인" : "발행 이력 없음",
        statusClassName: latestDraft ? "status status-issued" : hasRenewalDue ? "status status-review" : "status status-pending",
        sortTime: latestDraft ? getDraftSortTime(latestDraft) : fallbackSortTime
      };
    })
    .sort((left, right) => right.sortTime - left.sortTime || left.customerName.localeCompare(right.customerName, "ko-KR"))
    .slice(0, 4);
}

function buildRecentActivities(props: HomeTabProps) {
  const issuedActivities = props.recentIssuedDrafts
    .filter((draft) => !isMockHomeRow(draft.id))
    .slice(0, 3)
    .map((draft) => ({
      id: `issued-${draft.id}`,
      title: draft.customerName,
      detail: `${props.formatMoney(draft.totalAmount)}원 발행 완료`,
      createdAt: draft.issuedAt ?? draft.updatedAt,
      statusClassName: "status status-issued",
      statusLabel: "발행 완료"
    }));

  if (issuedActivities.length > 0) {
    return issuedActivities;
  }

  return props.recentInboxMessages
    .filter((message) => !isMockHomeRow(message.id))
    .slice(0, 3)
    .map((message) => {
      const status = props.getInboxDisplayParseStatus(message);

      return {
        id: `inbox-${message.id}`,
        title: message.parsedData?.plantName ?? "수신 메일",
        detail: props.getParseStatusLabel(status),
        createdAt: message.receivedAt,
        statusClassName: `status status-${status}`,
        statusLabel: props.getParseStatusLabel(status)
      };
    });
}

export function HomeTab(props: HomeTabProps) {
  const liveReviewDrafts = props.reviewDrafts.filter((draft) => !isMockHomeRow(draft.id));
  const issueProgress =
    props.monthlyIssueLimit > 0
      ? `${props.formatMoney(props.currentMonthIssuedDraftCount)} / ${props.formatMoney(props.monthlyIssueLimit)}`
      : props.formatMoney(props.currentMonthIssuedDraftCount);
  const recentCustomerRows = buildRecentCustomerRows(props);
  const recentActivities = buildRecentActivities(props);
  const certificateAttentionValue = getMetricValue(props.model.chips, "인증서", "0명");
  const contractRenewalValue = `${props.contractRenewalDueItems.length}명`;
  const hasReviewDrafts = liveReviewDrafts.length > 0;
  const trendAnchorBillingMonth = props.issuedMonthlyTrend?.anchorBillingMonth ?? props.currentBillingMonth;
  const [trendQueryBillingMonth, setTrendQueryBillingMonth] = useState(trendAnchorBillingMonth);
  const [selectedTrendBillingMonth, setSelectedTrendBillingMonth] = useState(trendAnchorBillingMonth);
  const trendMonths = props.issuedMonthlyTrend?.months ?? [];
  const maxTrendCount = Math.max(1, ...trendMonths.map((month) => month.issuedDraftCount));
  const selectedTrendCount = useMemo(
    () => getIssuedMonthlyTrendCount(trendMonths, selectedTrendBillingMonth),
    [selectedTrendBillingMonth, trendMonths]
  );
  const isTrendCustomAnchor = Boolean(props.issuedMonthlyTrend && props.issuedMonthlyTrend.anchorBillingMonth !== props.currentBillingMonth);

  useEffect(() => {
    setTrendQueryBillingMonth(trendAnchorBillingMonth);
    setSelectedTrendBillingMonth(trendAnchorBillingMonth);
  }, [trendAnchorBillingMonth]);

  const metricCards: HomeMetricCard[] = [
    {
      label: "발행 대기",
      value: props.formatMoney(liveReviewDrafts.length),
      description: hasReviewDrafts ? "검토 후 발행 필요" : "대기 중인 초안 없음",
      actionKey: "reviewQueue"
    },
    {
      label: "발행 현황",
      value: issueProgress,
      description: "이번 달 누적",
      actionKey: "recentIssued"
    },
    {
      label: "인증서 만료 예정",
      value: certificateAttentionValue,
      description: "30일 이내 만료",
      actionKey: "certificates"
    },
    {
      label: "계약 만료 예정",
      value: contractRenewalValue,
      description: "갱신 확인 필요",
      actionKey: "blockedCustomers"
    }
  ];

  return (
    <div className="home-screen lovable-home">
      <section className="lovable-home-hero" aria-labelledby="lovable-home-title">
        <h2 id="lovable-home-title">안녕하세요, {props.workspaceLabel}님</h2>
        <p>
          {hasReviewDrafts
            ? `오늘 검토할 세금계산서 초안 ${props.formatMoney(liveReviewDrafts.length)}건이 도착했습니다.`
            : "오늘 검토할 세금계산서 초안은 없습니다."}
        </p>
      </section>

      {props.mailboxDataLoading ? (
        <div className="lovable-home-loading">
          <strong>메일과 발행 대기를 읽는 중입니다.</strong>
        </div>
      ) : null}

      <section className="lovable-overview" aria-label="홈 운영 지표">
        <div className="lovable-overview-head">
          <h3>Overview</h3>
          <span>Today</span>
        </div>
        <div className="lovable-metric-grid">
          {metricCards.map((metric) => (
            <button
              key={metric.label}
              type="button"
              className="lovable-metric-card"
              onClick={() => props.onOpenAction(metric.actionKey)}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <em>{metric.description}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="lovable-issued-trend" aria-labelledby="lovable-issued-trend-title">
        <div className="lovable-issued-trend-head">
          <div>
            <h3 id="lovable-issued-trend-title">월별 발행 현황</h3>
          </div>
          <form
            className="lovable-issued-trend-query"
            onSubmit={(event) => {
              event.preventDefault();
              if (trendQueryBillingMonth) {
                props.onLoadIssuedMonthlyTrend(trendQueryBillingMonth);
              }
            }}
          >
            <label>
              <span>연월 조회</span>
              <input
                type="month"
                value={trendQueryBillingMonth}
                onChange={(event) => setTrendQueryBillingMonth(event.target.value)}
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={props.issuedMonthlyTrendLoading || !trendQueryBillingMonth}>
              조회
            </button>
            {isTrendCustomAnchor ? (
              <button type="button" className="lovable-link-button" onClick={props.onResetIssuedMonthlyTrend}>
                최근 월로 돌아가기
              </button>
            ) : null}
          </form>
        </div>

        <div className="lovable-issued-trend-summary" aria-label="월별 발행 비교">
          <div>
            <span>기준월</span>
            <strong>{props.formatMoney(props.issuedMonthlyTrend?.comparison.anchor.issuedDraftCount ?? 0)}건</strong>
          </div>
          <div>
            <span>전월</span>
            <strong>{props.formatMoney(props.issuedMonthlyTrend?.comparison.previous.issuedDraftCount ?? 0)}건</strong>
          </div>
          <div>
            <span>전년 동월</span>
            <strong>{props.formatMoney(props.issuedMonthlyTrend?.comparison.sameMonthLastYear.issuedDraftCount ?? 0)}건</strong>
          </div>
        </div>

        {props.issuedMonthlyTrendError ? (
          <div className="lovable-issued-trend-message">{props.issuedMonthlyTrendError}</div>
        ) : null}

        <div className="lovable-issued-trend-chart-wrap">
          <div className="lovable-issued-trend-chart" aria-label="최근 13개월 발행 완료 건수">
            {trendMonths.map((month) => {
              const isAnchor = month.billingMonth === trendAnchorBillingMonth;
              const isSelected = month.billingMonth === selectedTrendBillingMonth;
              const barHeight = Math.max(6, Math.round((month.issuedDraftCount / maxTrendCount) * 100));
              return (
                <button
                  key={month.billingMonth}
                  type="button"
                  className={[
                    "lovable-issued-trend-bar",
                    isAnchor ? "is-anchor" : "",
                    isSelected ? "is-selected" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedTrendBillingMonth(month.billingMonth)}
                  aria-pressed={isSelected}
                  aria-label={`${month.billingMonth} 발행 완료 ${props.formatMoney(month.issuedDraftCount)}건`}
                >
                  <span className="lovable-issued-trend-value">{props.formatMoney(month.issuedDraftCount)}</span>
                  <span className="lovable-issued-trend-track">
                    <span className="lovable-issued-trend-fill" style={{ height: `${barHeight}%` }} />
                  </span>
                  <span className="lovable-issued-trend-label">{formatBillingMonthLabel(month.billingMonth)}</span>
                </button>
              );
            })}
            {trendMonths.length === 0 ? (
              <div className="lovable-issued-trend-empty">
                {props.issuedMonthlyTrendLoading ? "월별 발행 현황을 불러오는 중입니다." : "월별 발행 현황이 없습니다."}
              </div>
            ) : null}
          </div>
        </div>
        <div className="lovable-issued-trend-selected" aria-live="polite">
          선택월 {selectedTrendBillingMonth || "-"} · {props.formatMoney(selectedTrendCount)}건
        </div>
      </section>

      <section className="lovable-home-lower-grid">
        <article className="lovable-home-panel lovable-recent-customers">
          <div className="lovable-panel-head">
            <div>
              <h3>최근 고객</h3>
              <p>최근 발행 활동 기준</p>
            </div>
            <button type="button" className="lovable-link-button" onClick={props.onOpenCustomers}>
              전체 보기
            </button>
          </div>
          <div className="lovable-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>고객명</th>
                  <th>사업자번호</th>
                  <th>최근 발행</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {recentCustomerRows.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.customerName}</td>
                    <td>{customer.businessNumber}</td>
                    <td>{formatDateOnly(customer.recentIssuedAt)}</td>
                    <td>
                      <span className={customer.statusClassName}>{customer.statusLabel}</span>
                    </td>
                  </tr>
                ))}
                {recentCustomerRows.length === 0 ? (
                  <tr>
                    <td className="lovable-empty-cell" colSpan={4}>
                      등록된 고객이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="lovable-home-panel lovable-activity-panel">
          <div className="lovable-panel-head">
            <div>
              <h3>최근 활동</h3>
            </div>
          </div>

          {recentActivities.length > 0 ? (
            <div className="lovable-activity-list">
              {recentActivities.map((activity) => (
                <article key={activity.id} className="lovable-activity-item">
                  <div>
                    <strong>{activity.title}</strong>
                    <p>{activity.detail}</p>
                    <span>{props.formatDateTime(activity.createdAt)}</span>
                  </div>
                  <span className={activity.statusClassName}>{activity.statusLabel}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="lovable-empty-state">
              <span className="lovable-empty-icon">
                <Icon name="dashboard" />
              </span>
              <strong>아직 활동 기록이 없어요</strong>
              <p>발행, 검토, 설정 변경이 있을 때 여기에 표시됩니다.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
