import React, { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { StatusBadge, type ConsoleTone } from "../../components/console";
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
  onLoadIssuedMonthlyTrend: (anchorBillingYear: string) => void;
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
  statusTone: ConsoleTone;
  sortTime: number;
};

type RecentActivityRow = {
  id: string;
  title: string;
  detail: string;
  createdAt: string | null;
  statusTone: ConsoleTone;
  statusLabel: string;
};

type IssuedMonthlyTrendMonth = IssuedMonthlyTrendPayload["months"][number];

type TrendChartDatum = IssuedMonthlyTrendMonth & {
  label: string;
  selected: boolean;
};

type TrendDotProps = {
  cx?: number;
  cy?: number;
  payload?: TrendChartDatum;
};

type TrendLabelProps = {
  index?: number;
  x?: number;
  y?: number;
  value?: number | string;
  payload?: TrendChartDatum;
};

type TrendChartClickState = {
  activePayload?: Array<{
    payload?: TrendChartDatum;
  }>;
};

type IssuedTrendTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: TrendChartDatum;
  }>;
  formatMoney: (value: number) => string;
};

const homeMotionEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

const homeContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.07
    }
  }
};

const homeSectionVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.42,
      ease: homeMotionEase
    }
  }
};

const homeMetricVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: homeMotionEase
    }
  }
};

const homeActivityItemVariants: Variants = {
  hidden: { opacity: 0, x: 10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.32,
      ease: homeMotionEase
    }
  }
};

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
  return `${Number(match[2])}월`;
}

function getBillingYear(billingMonth: string): string {
  const match = /^(\d{4})-\d{2}$/.exec(billingMonth);
  return match?.[1] ?? String(new Date().getFullYear());
}

function getDefaultSelectedTrendBillingMonth(anchorBillingYear: string, currentBillingMonth: string): string {
  if (currentBillingMonth.startsWith(`${anchorBillingYear}-`)) {
    return currentBillingMonth;
  }
  return `${anchorBillingYear}-01`;
}

function getMetricValue(metrics: HomeScreenModel["chips"], labelKeyword: string, fallback: string): string {
  return metrics.find((metric) => metric.label.includes(labelKeyword))?.value ?? fallback;
}

function IssuedTrendTooltip({ active, payload, formatMoney }: IssuedTrendTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0]?.payload as TrendChartDatum | undefined;
  if (!datum) {
    return null;
  }

  return (
    <div className="lovable-issued-trend-tooltip">
      <span>{datum.billingMonth}</span>
      <strong>{formatMoney(datum.issuedDraftCount)}건</strong>
    </div>
  );
}

function buildRecentCustomerRows(props: HomeTabProps): RecentCustomerRow[] {
  const renewalCustomerIds = new Set(props.contractRenewalDueItems.map((item) => item.customerId));

  return props.customers
    .map((customer) => {
      const latestDraft = getLatestIssuedDraft(props.issuedDraftsByCustomerId.get(customer.id) ?? []);
      const fallbackSortTime = getTimestamp(customer.updatedAt) || getTimestamp(customer.createdAt);
      const hasRenewalDue = renewalCustomerIds.has(customer.id);
      const statusTone: ConsoleTone = latestDraft ? "success" : hasRenewalDue ? "warning" : "default";

      return {
        id: customer.id,
        customerName: customer.corpName || customer.customerName,
        businessNumber: customer.businessNumber || "-",
        recentIssuedAt: latestDraft?.issuedAt ?? latestDraft?.updatedAt ?? null,
        statusLabel: latestDraft ? "발행 완료" : hasRenewalDue ? "계약 확인" : "발행 이력 없음",
        statusTone,
        sortTime: latestDraft ? getDraftSortTime(latestDraft) : fallbackSortTime
      };
    })
    .sort((left, right) => right.sortTime - left.sortTime || left.customerName.localeCompare(right.customerName, "ko-KR"))
    .slice(0, 4);
}

function buildRecentActivities(props: HomeTabProps): RecentActivityRow[] {
  const issuedActivities = props.recentIssuedDrafts
    .filter((draft) => !isMockHomeRow(draft.id))
    .slice(0, 3)
    .map((draft): RecentActivityRow => ({
      id: `issued-${draft.id}`,
      title: draft.customerName,
      detail: `${props.formatMoney(draft.totalAmount)}원 발행 완료`,
      createdAt: draft.issuedAt ?? draft.updatedAt,
      statusTone: "success",
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
        statusTone: (status === "failed" || status === "unmatched" ? "danger" : status === "parsed" ? "success" : "warning") satisfies ConsoleTone,
        statusLabel: props.getParseStatusLabel(status)
      };
    });
}

export function HomeTab(props: HomeTabProps) {
  const shouldReduceMotion = useReducedMotion();
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
  const currentTrendYear = getBillingYear(props.currentBillingMonth);
  const trendAnchorBillingYear = props.issuedMonthlyTrend?.anchorBillingYear ?? currentTrendYear;
  const defaultSelectedTrendBillingMonth = getDefaultSelectedTrendBillingMonth(trendAnchorBillingYear, props.currentBillingMonth);
  const [trendQueryBillingYear, setTrendQueryBillingYear] = useState(trendAnchorBillingYear);
  const [selectedTrendBillingMonth, setSelectedTrendBillingMonth] = useState(defaultSelectedTrendBillingMonth);
  const trendMonths = props.issuedMonthlyTrend?.months ?? [];
  const trendTotalCount = trendMonths.reduce((sum, month) => sum + month.issuedDraftCount, 0);
  const isTrendCustomAnchor = Boolean(props.issuedMonthlyTrend && props.issuedMonthlyTrend.anchorBillingYear !== currentTrendYear);
  const trendChartData: TrendChartDatum[] = useMemo(
    () =>
      trendMonths.map((month) => ({
        ...month,
        label: formatBillingMonthLabel(month.billingMonth),
        selected: month.billingMonth === selectedTrendBillingMonth
      })),
    [selectedTrendBillingMonth, trendMonths]
  );
  const handleTrendChartClick = (state: unknown) => {
    const billingMonth = (state as TrendChartClickState | null)?.activePayload?.[0]?.payload?.billingMonth;
    if (billingMonth) {
      setSelectedTrendBillingMonth(billingMonth);
    }
  };
  const renderTrendDot = (dotProps: unknown) => {
    const { cx, cy, payload } = dotProps as TrendDotProps;
    if (typeof cx !== "number" || typeof cy !== "number" || !payload) {
      return null;
    }

    const isSelected = payload.billingMonth === selectedTrendBillingMonth;
    const selectPoint = () => setSelectedTrendBillingMonth(payload.billingMonth);
    return (
      <circle
        className={["lovable-issued-trend-dot", isSelected ? "is-selected" : ""].filter(Boolean).join(" ")}
        cx={cx}
        cy={cy}
        r={isSelected ? 6 : 5}
        role="button"
        tabIndex={0}
        aria-label={`${payload.billingMonth} 발행 완료 ${props.formatMoney(payload.issuedDraftCount)}건`}
        onClick={selectPoint}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectPoint();
          }
        }}
      />
    );
  };
  const renderTrendLabel = (labelProps: unknown) => {
    const { index, x, y, value, payload } = labelProps as TrendLabelProps;
    const trendDatum = payload ?? (typeof index === "number" ? trendChartData[index] : undefined);
    if (typeof x !== "number" || typeof y !== "number" || !trendDatum) {
      return null;
    }

    const issuedCount = Number(value ?? trendDatum.issuedDraftCount ?? 0);
    if (!Number.isFinite(issuedCount) || (issuedCount === 0 && !trendDatum.selected)) {
      return null;
    }

    return (
      <text className="lovable-issued-trend-label-value" x={x} y={Math.max(14, y - 16)} textAnchor="middle">
        {props.formatMoney(issuedCount)}
      </text>
    );
  };

  useEffect(() => {
    setTrendQueryBillingYear(trendAnchorBillingYear);
    setSelectedTrendBillingMonth(defaultSelectedTrendBillingMonth);
  }, [defaultSelectedTrendBillingMonth, trendAnchorBillingYear]);

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
      description: "60일 미만 만료",
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
    <motion.div
      className="home-screen lovable-home"
      variants={homeContainerVariants}
      initial={shouldReduceMotion ? false : "hidden"}
      animate={shouldReduceMotion ? undefined : "visible"}
    >
      <motion.section className="lovable-home-hero" aria-labelledby="lovable-home-title" variants={homeSectionVariants}>
        <h2 id="lovable-home-title">안녕하세요, {props.workspaceLabel}님</h2>
        <p>
          {hasReviewDrafts
            ? `오늘 검토할 세금계산서 초안 ${props.formatMoney(liveReviewDrafts.length)}건이 도착했습니다.`
            : "오늘 검토할 세금계산서 초안은 없습니다."}
        </p>
      </motion.section>

      {props.mailboxDataLoading ? (
        <motion.div className="lovable-home-loading" variants={homeSectionVariants}>
          <strong>메일과 발행 대기를 읽는 중입니다.</strong>
        </motion.div>
      ) : null}

      <motion.section className="lovable-overview" aria-label="홈 운영 지표" variants={homeSectionVariants}>
        <div className="lovable-overview-head">
          <h3>Overview</h3>
          <span>Today</span>
        </div>
        <div className="lovable-metric-grid">
          {metricCards.map((metric) => (
            <motion.button
              key={metric.label}
              type="button"
              className="lovable-metric-card"
              variants={homeMetricVariants}
              whileHover={
                shouldReduceMotion
                  ? undefined
                  : {
                      y: -3,
                      borderColor: "#b8c6df",
                      boxShadow: "0 16px 30px rgba(15, 23, 42, 0.08)"
                    }
              }
              whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
              onClick={() => props.onOpenAction(metric.actionKey)}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <em>{metric.description}</em>
            </motion.button>
          ))}
        </div>
      </motion.section>

      <motion.section className="lovable-issued-trend" aria-labelledby="lovable-issued-trend-title" variants={homeSectionVariants}>
        <div className="lovable-issued-trend-head">
          <div className="lovable-issued-trend-titleline">
            <h3 id="lovable-issued-trend-title">월별 발행 현황</h3>
          </div>
          <form
            className="lovable-issued-trend-query"
            onSubmit={(event) => {
              event.preventDefault();
              if (trendQueryBillingYear) {
                props.onLoadIssuedMonthlyTrend(trendQueryBillingYear);
              }
            }}
          >
            <span className="lovable-issued-trend-total">
              연간 합계 <strong>{props.formatMoney(trendTotalCount)}건</strong>
            </span>
            <label>
              <span>연 조회</span>
              <input
                type="number"
                min="2000"
                max="2200"
                step="1"
                value={trendQueryBillingYear}
                onChange={(event) => setTrendQueryBillingYear(event.target.value)}
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={props.issuedMonthlyTrendLoading || !trendQueryBillingYear}>
              조회
            </button>
            {isTrendCustomAnchor ? (
              <button type="button" className="lovable-link-button" onClick={props.onResetIssuedMonthlyTrend}>
                올해로 돌아가기
              </button>
            ) : null}
          </form>
        </div>

        {props.issuedMonthlyTrendError ? (
          <div className="lovable-issued-trend-message">{props.issuedMonthlyTrendError}</div>
        ) : null}

        <div className="lovable-issued-trend-chart-wrap">
          <div className="lovable-issued-trend-chart" aria-label={`${trendAnchorBillingYear}년 월별 발행 완료 건수`}>
            {trendChartData.length > 0 ? (
              <>
                <div className="lovable-issued-trend-recharts">
                  <ResponsiveContainer width="100%" height={118}>
                    <LineChart
                      data={trendChartData}
                      margin={{ top: 12, right: 14, left: 14, bottom: 2 }}
                      onClick={handleTrendChartClick}
                    >
                      <defs>
                        <linearGradient id="issuedTrendStroke" x1="0" x2="1" y1="0" y2="0">
                          <stop offset="0%" stopColor="#6f91c8" />
                          <stop offset="50%" stopColor="#2457a6" />
                          <stop offset="100%" stopColor="#0f4fb7" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#e5e9f2" strokeDasharray="4 7" />
                      {trendChartData.map((month) => (
                        <ReferenceLine
                          key={`guide-${month.billingMonth}`}
                          segment={[
                            { x: month.label, y: 0 },
                            { x: month.label, y: month.issuedDraftCount }
                          ]}
                          stroke={month.selected ? "#2457a6" : "#c7d2e5"}
                          strokeDasharray="4 7"
                          strokeWidth={month.selected ? 2 : 1.5}
                        />
                      ))}
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tickMargin={14}
                        interval={0}
                        minTickGap={0}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        hide
                        tickLine={false}
                        tickMargin={8}
                        width={0}
                        domain={[0, (dataMax: number) => Math.max(1, dataMax)]}
                      />
                      <Tooltip
                        content={<IssuedTrendTooltip formatMoney={props.formatMoney} />}
                        cursor={{ stroke: "#b8c6df", strokeDasharray: "4 6", strokeWidth: 1.5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="issuedDraftCount"
                        stroke="url(#issuedTrendStroke)"
                        strokeWidth={3}
                        dot={renderTrendDot}
                        activeDot={{ r: 7, stroke: "#163f80", strokeWidth: 3, fill: "#2457a6" }}
                        isAnimationActive={!shouldReduceMotion}
                        animationDuration={950}
                        animationEasing="ease-out"
                      >
                        <LabelList
                          dataKey="issuedDraftCount"
                          content={renderTrendLabel}
                        />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <ul className="lovable-issued-trend-accessible-list" aria-label={`${trendAnchorBillingYear}년 월별 발행 완료 건수 목록`}>
                  {trendChartData.map((month) => (
                    <li key={month.billingMonth} className="lovable-issued-trend-accessible-item">
                      {month.billingMonth} {props.formatMoney(month.issuedDraftCount)}건
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="lovable-issued-trend-empty">
                {props.issuedMonthlyTrendLoading ? "월별 발행 현황을 불러오는 중입니다." : "월별 발행 현황이 없습니다."}
              </div>
            )}
          </div>
        </div>
      </motion.section>

      <motion.section className="lovable-home-lower-grid" variants={homeSectionVariants}>
        <motion.article className="lovable-home-panel lovable-recent-customers" variants={homeSectionVariants}>
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
                      <StatusBadge tone={customer.statusTone} size="xs" icon={false}>
                        {customer.statusLabel}
                      </StatusBadge>
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
        </motion.article>

        <motion.aside className="lovable-home-panel lovable-activity-panel" variants={homeSectionVariants}>
          <div className="lovable-panel-head">
            <div>
              <h3>최근 활동</h3>
            </div>
          </div>

          {recentActivities.length > 0 ? (
            <div className="lovable-activity-list">
              {recentActivities.map((activity) => (
                <motion.article key={activity.id} className="lovable-activity-item" variants={homeActivityItemVariants}>
                  <div>
                    <strong>{activity.title}</strong>
                    <p>{activity.detail}</p>
                    <span>{props.formatDateTime(activity.createdAt)}</span>
                  </div>
                  <StatusBadge tone={activity.statusTone} size="xs" icon={false}>
                    {activity.statusLabel}
                  </StatusBadge>
                </motion.article>
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
        </motion.aside>
      </motion.section>
    </motion.div>
  );
}
