import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { matchesCustomerSearchQuery } from "../customers/customerSearch";
import type { Customer, InboxMessage, InvoiceDraft } from "../../types";

type IssuanceFilter = "pending" | "scheduled" | "issuing" | "issued" | "unmatched" | "all";

type IssuanceListEntry =
  | {
      key: string;
      sortTime: number;
      kind: "draft";
      draft: InvoiceDraft;
    }
  | {
      key: string;
      sortTime: number;
      kind: "unmatched";
      message: InboxMessage;
    };

type IssuanceTabProps = {
  mailboxDataLoading: boolean;
  screenTitle: string;
  userLabel: string;
  workspaceLabel: string;
  popbillModeLabel: string;
  requestedFilter?: IssuanceFilter | null;
  onConsumeRequestedFilter?: () => void;
  drafts: InvoiceDraft[];
  unmatchedInboxMessages: InboxMessage[];
  customers: Customer[];
  busyKey: string | null;
  onIssueAllReviewDrafts: () => void;
  onIssueDraft: (draftId: number) => void;
  onReprocessInboxMessage: (messageId: number) => void;
  onViewDraft: (draftId: number) => void;
  onPrintDraft: (draftId: number) => void;
  onCancelDraft: (draftId: number) => void;
  onShowDraftPopbillInfo: (draftId: number) => void;
  formatMoney: (value: number) => string;
  formatDateTime: (value: string | null) => string;
  getDraftStatusLabel: (status: string) => string;
  getDraftConfirmNumber: (draft: InvoiceDraft) => string | null;
  getIssueModeLabel: (mode: "review" | "auto") => string;
  simplifyIssueError: (value: string) => string;
};

const ISSUANCE_FILTERS: Array<{ id: IssuanceFilter; label: string }> = [
  { id: "pending", label: "검수 대기" },
  { id: "scheduled", label: "자동 대기" },
  { id: "issuing", label: "발행 중" },
  { id: "issued", label: "발행 완료" },
  { id: "unmatched", label: "고객 미매칭" },
  { id: "all", label: "전체" }
];

const DRAFT_STATUS_ORDER: Record<InvoiceDraft["status"], number> = {
  review: 0,
  failed: 1,
  scheduled: 2,
  issuing: 3,
  issued: 4
};

function matchesIssuanceFilter(draft: InvoiceDraft, filter: IssuanceFilter): boolean {
  switch (filter) {
    case "pending":
      return draft.status === "review" || draft.status === "failed";
    case "scheduled":
      return draft.status === "scheduled";
    case "issuing":
      return draft.status === "issuing";
    case "issued":
      return draft.status === "issued";
    case "all":
    default:
      return true;
  }
}

function resolveDraftSortTime(draft: InvoiceDraft): number {
  const candidates = [draft.issuedAt, draft.issueRequestedAt, draft.updatedAt, draft.createdAt];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const timestamp = new Date(candidate).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  return 0;
}

function resolveInboxSortTime(message: InboxMessage): number {
  const timestamp = new Date(message.receivedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isToday(value: string | null): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}

function getHeaderChipClassName(tone: "default" | "warn" | "success"): string {
  if (tone === "success") return "home-header-chip tone-success";
  if (tone === "warn") return "home-header-chip tone-warn";
  return "home-header-chip";
}

function getIssuanceListEntryOrder(entry: IssuanceListEntry): number {
  if (entry.kind === "unmatched") return -1;
  return DRAFT_STATUS_ORDER[entry.draft.status];
}

function compareIssuanceListEntries(left: IssuanceListEntry, right: IssuanceListEntry): number {
  const statusOrder = getIssuanceListEntryOrder(left) - getIssuanceListEntryOrder(right);
  if (statusOrder !== 0) return statusOrder;
  return right.sortTime - left.sortTime;
}

function normalizeCustomerFinderValue(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function normalizedValueIncludes(source: string, target: string): boolean {
  const normalizedSource = normalizeCustomerFinderValue(source);
  const normalizedTarget = normalizeCustomerFinderValue(target);
  if (normalizedSource === "" || normalizedTarget === "") {
    return false;
  }
  return normalizedSource.includes(normalizedTarget) || normalizedTarget.includes(normalizedSource);
}

function matchesCustomerFinderQuery(customer: Customer, query: string): boolean {
  const normalizedQuery = normalizeCustomerFinderValue(query);
  if (normalizedQuery === "") {
    return true;
  }

  if (matchesCustomerSearchQuery(customer, query)) {
    return true;
  }

  return [customer.addr, ...customer.plantNames, ...customer.matchAddresses].some((value) => normalizedValueIncludes(value, query));
}

function scoreCustomerForUnmatchedMessage(customer: Customer, message: InboxMessage): number {
  let score = 0;
  const plantName = message.parsedData?.plantName ?? "";
  const plantAddress = message.parsedData?.plantAddress ?? "";
  const subject = message.subject ?? "";

  if (plantAddress !== "") {
    if (normalizedValueIncludes(customer.addr, plantAddress)) {
      score += 120;
    }
    if (customer.matchAddresses.some((value) => normalizedValueIncludes(value, plantAddress))) {
      score += 120;
    }
  }

  if (plantName !== "") {
    if (customer.plantNames.some((value) => normalizedValueIncludes(value, plantName))) {
      score += 90;
    }
    if ([customer.customerName, customer.corpName].some((value) => normalizedValueIncludes(value, plantName))) {
      score += 50;
    }
  }

  if (subject !== "" && [customer.customerName, customer.corpName, customer.businessNumber].some((value) => normalizedValueIncludes(subject, value))) {
    score += 18;
  }

  return score;
}

export function IssuanceTab(props: IssuanceTabProps) {
  const pendingManualCount = useMemo(
    () => props.drafts.filter((draft) => draft.status === "review" || draft.status === "failed").length,
    [props.drafts]
  );
  const scheduledCount = useMemo(() => props.drafts.filter((draft) => draft.status === "scheduled").length, [props.drafts]);
  const issuingCount = useMemo(() => props.drafts.filter((draft) => draft.status === "issuing").length, [props.drafts]);
  const issuedCount = useMemo(() => props.drafts.filter((draft) => draft.status === "issued").length, [props.drafts]);
  const todayIssuedDrafts = useMemo(
    () => props.drafts.filter((draft) => draft.status === "issued" && isToday(draft.issuedAt)),
    [props.drafts]
  );
  const todayIssuedAmount = useMemo(
    () => todayIssuedDrafts.reduce((total, draft) => total + draft.totalAmount, 0),
    [todayIssuedDrafts]
  );
  const failedCount = useMemo(() => props.drafts.filter((draft) => draft.status === "failed").length, [props.drafts]);
  const unmatchedMessageCount = props.unmatchedInboxMessages.length;
  const defaultFilter: IssuanceFilter =
    pendingManualCount > 0
      ? "pending"
      : unmatchedMessageCount > 0
        ? "unmatched"
        : scheduledCount > 0
        ? "scheduled"
        : issuingCount > 0
          ? "issuing"
          : issuedCount > 0
            ? "issued"
            : "all";
  const [activeFilter, setActiveFilter] = useState<IssuanceFilter>(defaultFilter);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [customerFinderOpen, setCustomerFinderOpen] = useState(false);
  const [customerFinderQuery, setCustomerFinderQuery] = useState("");
  const previousRequestedFilterRef = useRef<IssuanceFilter | null>(null);

  useEffect(() => {
    if (!props.requestedFilter) {
      previousRequestedFilterRef.current = null;
      return;
    }

    if (previousRequestedFilterRef.current === props.requestedFilter) {
      return;
    }

    previousRequestedFilterRef.current = props.requestedFilter;
    setActiveFilter(props.requestedFilter);
    setSelectedEntryKey(null);
    props.onConsumeRequestedFilter?.();
  }, [props.onConsumeRequestedFilter, props.requestedFilter, previousRequestedFilterRef]);

  const sortedDrafts = useMemo(
    () =>
      [...props.drafts].sort((left, right) => {
        const statusOrder = DRAFT_STATUS_ORDER[left.status] - DRAFT_STATUS_ORDER[right.status];
        if (statusOrder !== 0) return statusOrder;
        return resolveDraftSortTime(right) - resolveDraftSortTime(left);
      }),
    [props.drafts]
  );
  const draftEntries = useMemo<IssuanceListEntry[]>(
    () =>
      sortedDrafts.map((draft) => ({
        key: `draft-${draft.id}`,
        sortTime: resolveDraftSortTime(draft),
        kind: "draft",
        draft
      })),
    [sortedDrafts]
  );
  const unmatchedEntries = useMemo<IssuanceListEntry[]>(
    () =>
      [...props.unmatchedInboxMessages]
        .sort((left, right) => resolveInboxSortTime(right) - resolveInboxSortTime(left))
        .map((message) => ({
          key: `unmatched-${message.id}`,
          sortTime: resolveInboxSortTime(message),
          kind: "unmatched",
          message
        })),
    [props.unmatchedInboxMessages]
  );
  const filteredEntries = useMemo(
    () =>
      activeFilter === "all"
        ? [...draftEntries, ...unmatchedEntries].sort(compareIssuanceListEntries)
        : activeFilter === "unmatched"
          ? unmatchedEntries
          : draftEntries.filter((entry) => entry.kind === "draft" && matchesIssuanceFilter(entry.draft, activeFilter)),
    [activeFilter, draftEntries, unmatchedEntries]
  );

  useEffect(() => {
    if (filteredEntries.length === 0) {
      if (selectedEntryKey !== null) {
        setSelectedEntryKey(null);
      }
      return;
    }

    if (selectedEntryKey === null || !filteredEntries.some((entry) => entry.key === selectedEntryKey)) {
      setSelectedEntryKey(filteredEntries[0].key);
    }
  }, [filteredEntries, selectedEntryKey]);

  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => entry.key === selectedEntryKey) ?? null,
    [filteredEntries, selectedEntryKey]
  );
  const selectedDraft = selectedEntry?.kind === "draft" ? selectedEntry.draft : null;
  const selectedUnmatchedMessage = selectedEntry?.kind === "unmatched" ? selectedEntry.message : null;
  const selectedCustomer = useMemo(
    () => (selectedDraft ? props.customers.find((customer) => customer.id === selectedDraft.customerId) ?? null : null),
    [props.customers, selectedDraft]
  );
  const selectedDraftConfirmNumber = selectedDraft ? props.getDraftConfirmNumber(selectedDraft) : null;

  const canIssueSelectedDraft = selectedDraft?.status === "review" || selectedDraft?.status === "failed";
  const canCancelSelectedDraft = selectedDraft?.status === "issued";
  const canShowPopbillInfo = selectedDraft?.status === "issued";
  const selectedUnmatchedAmount =
    selectedUnmatchedMessage?.parsedData !== null && selectedUnmatchedMessage?.parsedData !== undefined
      ? selectedUnmatchedMessage.parsedData.supplyCost + selectedUnmatchedMessage.parsedData.taxTotal
      : null;
  const customerFinderResults = useMemo(() => {
    if (!selectedUnmatchedMessage) {
      return [];
    }

    return [...props.customers]
      .filter((customer) => matchesCustomerFinderQuery(customer, customerFinderQuery))
      .map((customer) => ({
        customer,
        score: scoreCustomerForUnmatchedMessage(customer, selectedUnmatchedMessage)
      }))
      .sort((left, right) => {
        const scoreDiff = right.score - left.score;
        if (scoreDiff !== 0) return scoreDiff;
        return left.customer.corpName.localeCompare(right.customer.corpName, "ko-KR");
      });
  }, [customerFinderQuery, props.customers, selectedUnmatchedMessage]);

  useEffect(() => {
    setCustomerFinderOpen(false);
    setCustomerFinderQuery("");
  }, [selectedUnmatchedMessage?.id]);

  useEffect(() => {
    if (!customerFinderOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCustomerFinderOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [customerFinderOpen]);

  return (
    <div className="issuance-screen">
      <header className="home-page-header issuance-page-header">
        <div className="home-page-header-copy">
          <h2>{props.screenTitle}</h2>
          <div className="home-page-header-chips">
            <span className="home-header-chip">{props.workspaceLabel}</span>
            <span className={getHeaderChipClassName(pendingManualCount > 0 ? "warn" : "default")}>검수 대기 {pendingManualCount}건</span>
            <span className={getHeaderChipClassName("default")}>자동 대기 {scheduledCount}건</span>
            <span className={getHeaderChipClassName(issuingCount > 0 ? "warn" : "default")}>발행 중 {issuingCount}건</span>
            <span className={getHeaderChipClassName(issuedCount > 0 ? "success" : "default")}>발행 완료 {issuedCount}건</span>
            <span className={getHeaderChipClassName(unmatchedMessageCount > 0 ? "warn" : "default")}>고객 미매칭 {unmatchedMessageCount}건</span>
          </div>
        </div>
        <div className="home-page-header-account">
          <div className="home-page-header-account-copy">
            <strong>{props.userLabel}</strong>
            <span>
              {props.workspaceLabel} · {props.popbillModeLabel}
            </span>
          </div>
          <span className="home-page-header-account-avatar" aria-hidden="true">
            <Icon name="user" className="home-page-header-account-avatar-icon" />
          </span>
        </div>
      </header>

      <div className="issuance-main-column">
        {props.mailboxDataLoading ? (
          <div className="helper-box import-helper-box">
            <strong>세금계산서 발행 데이터를 새로 읽는 중입니다.</strong>
          </div>
        ) : null}

        <section className="issuance-summary-grid">
          <article className="issuance-summary-card">
            <div className="issuance-summary-card-head">
              <span>검수 대기</span>
              <Icon name="issue" className="issuance-summary-card-icon" />
            </div>
            <strong>{pendingManualCount}건</strong>
            <p>수동 검토 후 바로 발행 가능한 초안과 실패 건입니다.</p>
          </article>
          <article className="issuance-summary-card">
            <div className="issuance-summary-card-head">
              <span>오늘 발행</span>
              <Icon name="complete" className="issuance-summary-card-icon" />
            </div>
            <strong>{props.formatMoney(todayIssuedAmount)}원</strong>
            <p>{todayIssuedDrafts.length}건 발행 완료</p>
          </article>
          <article className="issuance-summary-card">
            <div className="issuance-summary-card-head">
              <span>자동 대기</span>
              <Icon name="dashboard" className="issuance-summary-card-icon" />
            </div>
            <strong>{scheduledCount}건</strong>
            <p>고객 발행 주기 기준으로 예약된 초안입니다.</p>
          </article>
          <article className="issuance-summary-card tone-warn">
            <div className="issuance-summary-card-head">
              <span>실패 / 발행 중</span>
              <Icon name="review" className="issuance-summary-card-icon" />
            </div>
            <strong>{failedCount + issuingCount}건</strong>
            <p>실패 {failedCount}건 · 발행 중 {issuingCount}건</p>
          </article>
        </section>

        <div className="issuance-workspace">
          <section className="issuance-list-panel">
            <div className="issuance-panel-head">
              <div>
                <h2>발행 대기 / 미매칭 메일</h2>
                <p>왼쪽에서 발행 대기 건이나 고객 미매칭 메일을 고르고, 오른쪽에서 같은 화면 안에서 바로 확인합니다.</p>
              </div>
              {pendingManualCount > 0 ? (
                <button type="button" onClick={props.onIssueAllReviewDrafts} disabled={props.busyKey !== null}>
                  검수 건 직접 발행
                </button>
              ) : null}
            </div>

            <div className="issuance-filter-row" role="tablist" aria-label="세금계산서 발행 필터">
              {ISSUANCE_FILTERS.map((filter) => {
                const count =
                  filter.id === "pending"
                    ? pendingManualCount
                    : filter.id === "scheduled"
                      ? scheduledCount
                      : filter.id === "issuing"
                      ? issuingCount
                      : filter.id === "issued"
                        ? issuedCount
                        : filter.id === "unmatched"
                          ? unmatchedMessageCount
                          : props.drafts.length + unmatchedMessageCount;

                return (
                  <button
                    key={filter.id}
                    type="button"
                    className={activeFilter === filter.id ? "issuance-filter-chip active" : "issuance-filter-chip"}
                    onClick={() => setActiveFilter(filter.id)}
                  >
                    {filter.label} {count}
                  </button>
                );
              })}
            </div>

            <div className="issuance-list">
              {filteredEntries.length === 0 ? (
                <div className="issuance-empty-state">
                  <strong>표시할 발행 건이 없습니다.</strong>
                  <p>현재 필터 조건에 맞는 세금계산서 초안이나 미매칭 메일이 없습니다.</p>
                </div>
              ) : (
                filteredEntries.map((entry) =>
                  entry.kind === "draft" ? (
                    <button
                      key={entry.key}
                      type="button"
                      className={selectedEntry?.key === entry.key ? "issuance-list-item is-selected" : "issuance-list-item"}
                      onClick={() => setSelectedEntryKey(entry.key)}
                    >
                      <div className="issuance-list-item-head">
                        <strong>{entry.draft.customerName}</strong>
                        <span className={`status status-${entry.draft.status}`}>{props.getDraftStatusLabel(entry.draft.status)}</span>
                      </div>
                      <span className="issuance-list-item-subtitle">
                        {entry.draft.itemName} · {entry.draft.billingMonth || "정산월 미확인"}
                      </span>
                      <div className="issuance-list-item-meta">
                        <span>{props.formatMoney(entry.draft.totalAmount)}원</span>
                        <span>{props.formatDateTime(entry.draft.issuedAt ?? entry.draft.issueRequestedAt ?? entry.draft.updatedAt)}</span>
                      </div>
                      {entry.draft.issueError ? <p className="cell-error">{props.simplifyIssueError(entry.draft.issueError)}</p> : null}
                    </button>
                  ) : (
                    <button
                      key={entry.key}
                      type="button"
                      className={selectedEntry?.key === entry.key ? "issuance-list-item is-selected" : "issuance-list-item"}
                      onClick={() => setSelectedEntryKey(entry.key)}
                    >
                      <div className="issuance-list-item-head">
                        <strong>{entry.message.parsedData?.plantName || "미매칭 메일"}</strong>
                        <span className="status status-unmatched">고객 미매칭</span>
                      </div>
                      <span className="issuance-list-item-subtitle">
                        {entry.message.subject || entry.message.parsedData?.plantAddress || entry.message.fromAddress}
                      </span>
                      <div className="issuance-list-item-meta">
                        <span>
                          {entry.message.parsedData
                            ? `${props.formatMoney(entry.message.parsedData.supplyCost + entry.message.parsedData.taxTotal)}원`
                            : "금액 미확인"}
                        </span>
                        <span>{props.formatDateTime(entry.message.receivedAt)}</span>
                      </div>
                    </button>
                  )
                )
              )}
            </div>
          </section>

          <section className="issuance-detail-panel">
            {selectedDraft ? (
              <div className="issuance-detail-scroll">
                <div className="issuance-detail-hero">
                  <div className="issuance-detail-hero-copy">
                    <div className="issuance-detail-hero-top">
                      <span className={`status status-${selectedDraft.status}`}>{props.getDraftStatusLabel(selectedDraft.status)}</span>
                      <span className="issuance-detail-mode">{props.getIssueModeLabel(selectedDraft.issueMode)}</span>
                    </div>
                    <h2>{selectedDraft.customerName}</h2>
                    <p>
                      {selectedDraft.itemName} · {selectedDraft.billingMonth || "정산월 미확인"} · 합계 {props.formatMoney(selectedDraft.totalAmount)}원
                    </p>
                  </div>
                  <div className="issuance-detail-actions">
                    <button type="button" className="btn-secondary" onClick={() => props.onViewDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                      보기
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => props.onPrintDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                      인쇄
                    </button>
                    {canShowPopbillInfo ? (
                      <button type="button" className="btn-secondary" onClick={() => props.onShowDraftPopbillInfo(selectedDraft.id)} disabled={props.busyKey !== null}>
                        팝빌 정보
                      </button>
                    ) : null}
                    {canIssueSelectedDraft ? (
                      <button type="button" onClick={() => props.onIssueDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                        지금 직접 발행
                      </button>
                    ) : null}
                    {canCancelSelectedDraft ? (
                      <button type="button" className="btn-secondary" onClick={() => props.onCancelDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                        발행 취소
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="issuance-detail-grid">
                  <section className="issuance-detail-card">
                    <div className="issuance-detail-card-head">
                      <h3>발행 정보</h3>
                    </div>
                    <dl className="issuance-detail-facts">
                      <div>
                        <dt>정산월</dt>
                        <dd>{selectedDraft.billingMonth || "-"}</dd>
                      </div>
                      <div>
                        <dt>작성일</dt>
                        <dd>{selectedDraft.writeDate || "-"}</dd>
                      </div>
                      <div>
                        <dt>공급가액</dt>
                        <dd>{props.formatMoney(selectedDraft.supplyCost)}원</dd>
                      </div>
                      <div>
                        <dt>부가세</dt>
                        <dd>{props.formatMoney(selectedDraft.taxTotal)}원</dd>
                      </div>
                      <div>
                        <dt>합계</dt>
                        <dd>{props.formatMoney(selectedDraft.totalAmount)}원</dd>
                      </div>
                      <div>
                        <dt>원본 메일 ID</dt>
                        <dd>{selectedDraft.sourceMessageId}</dd>
                      </div>
                      <div>
                        <dt>관리번호</dt>
                        <dd>{selectedDraft.popbillMgtKey || "-"}</dd>
                      </div>
                      <div>
                        <dt>확인번호</dt>
                        <dd>{selectedDraftConfirmNumber ?? "-"}</dd>
                      </div>
                      <div>
                        <dt>발행 요청</dt>
                        <dd>{props.formatDateTime(selectedDraft.issueRequestedAt)}</dd>
                      </div>
                      <div>
                        <dt>발행 완료</dt>
                        <dd>{props.formatDateTime(selectedDraft.issuedAt)}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="issuance-detail-card">
                    <div className="issuance-detail-card-head">
                      <h3>고객 / 공급받는자 정보</h3>
                    </div>
                    <dl className="issuance-detail-facts">
                      <div>
                        <dt>고객명</dt>
                        <dd>{selectedDraft.customerName}</dd>
                      </div>
                      <div>
                        <dt>법인명</dt>
                        <dd>{selectedCustomer?.corpName || "-"}</dd>
                      </div>
                      <div>
                        <dt>사업자번호</dt>
                        <dd>{selectedCustomer?.businessNumber || "-"}</dd>
                      </div>
                      <div>
                        <dt>주소</dt>
                        <dd>{selectedCustomer?.addr || "-"}</dd>
                      </div>
                      <div>
                        <dt>품목</dt>
                        <dd>{selectedDraft.itemName}</dd>
                      </div>
                      <div>
                        <dt>사업 유형</dt>
                        <dd>{selectedCustomer ? `${selectedCustomer.bizType} / ${selectedCustomer.bizClass}` : "-"}</dd>
                      </div>
                      <div>
                        <dt>발전소명</dt>
                        <dd>{selectedDraft.plantName || "-"}</dd>
                      </div>
                      <div>
                        <dt>수신 이메일</dt>
                        <dd>{selectedDraft.recipientEmail || "-"}</dd>
                      </div>
                      <div>
                        <dt>팝빌 상태</dt>
                        <dd>{selectedCustomer ? `${selectedCustomer.popbillState} / 인증서 ${selectedCustomer.popbillCertRegistered ? "등록" : "미등록"}` : "-"}</dd>
                      </div>
                      <div>
                        <dt>고객 발행 방식</dt>
                        <dd>{selectedCustomer ? props.getIssueModeLabel(selectedCustomer.issueMode) : "-"}</dd>
                      </div>
                    </dl>
                  </section>
                </div>

                {selectedDraft.issueError ? (
                  <section className="issuance-detail-card issuance-detail-card-danger">
                    <div className="issuance-detail-card-head">
                      <h3>최근 실패 사유</h3>
                    </div>
                    <p className="issuance-detail-error">{props.simplifyIssueError(selectedDraft.issueError)}</p>
                  </section>
                ) : null}
              </div>
            ) : selectedUnmatchedMessage ? (
              <div className="issuance-detail-scroll">
                <div className="issuance-detail-hero">
                  <div className="issuance-detail-hero-copy">
                    <div className="issuance-detail-hero-top">
                      <span className="status status-unmatched">고객 미매칭</span>
                      <span className="issuance-detail-mode">메일 예외</span>
                    </div>
                    <h2>{selectedUnmatchedMessage.parsedData?.plantName || "미매칭 메일"}</h2>
                    <p>
                      {selectedUnmatchedMessage.subject || selectedUnmatchedMessage.fromAddress}
                      {selectedUnmatchedMessage.parsedData?.billingMonth ? ` · ${selectedUnmatchedMessage.parsedData.billingMonth}` : ""}
                    </p>
                  </div>
                  <div className="issuance-detail-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setCustomerFinderOpen(true)}
                    >
                      고객 목록 보기
                    </button>
                  </div>
                </div>

                <div className="issuance-detail-grid">
                  <section className="issuance-detail-card">
                    <div className="issuance-detail-card-head">
                      <h3>메일 정보</h3>
                    </div>
                    <dl className="issuance-detail-facts">
                      <div>
                        <dt>메일 ID</dt>
                        <dd>{selectedUnmatchedMessage.id}</dd>
                      </div>
                      <div>
                        <dt>상태</dt>
                        <dd>고객 미매칭</dd>
                      </div>
                      <div>
                        <dt>제목</dt>
                        <dd>{selectedUnmatchedMessage.subject || "-"}</dd>
                      </div>
                      <div>
                        <dt>발신 주소</dt>
                        <dd>{selectedUnmatchedMessage.fromAddress || "-"}</dd>
                      </div>
                      <div>
                        <dt>수신 시각</dt>
                        <dd>{props.formatDateTime(selectedUnmatchedMessage.receivedAt)}</dd>
                      </div>
                      <div>
                        <dt>연결 고객</dt>
                        <dd>-</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="issuance-detail-card">
                    <div className="issuance-detail-card-head">
                      <h3>추출 정보</h3>
                    </div>
                    <dl className="issuance-detail-facts">
                      <div>
                        <dt>발전소명</dt>
                        <dd>{selectedUnmatchedMessage.parsedData?.plantName || "-"}</dd>
                      </div>
                      <div>
                        <dt>정산월</dt>
                        <dd>{selectedUnmatchedMessage.parsedData?.billingMonth || "-"}</dd>
                      </div>
                      <div>
                        <dt>주소</dt>
                        <dd>{selectedUnmatchedMessage.parsedData?.plantAddress || "-"}</dd>
                      </div>
                      <div>
                        <dt>품목</dt>
                        <dd>{selectedUnmatchedMessage.parsedData?.itemName || "-"}</dd>
                      </div>
                      <div>
                        <dt>공급가액</dt>
                        <dd>
                          {selectedUnmatchedMessage.parsedData
                            ? `${props.formatMoney(selectedUnmatchedMessage.parsedData.supplyCost)}원`
                            : "-"}
                        </dd>
                      </div>
                      <div>
                        <dt>부가세</dt>
                        <dd>
                          {selectedUnmatchedMessage.parsedData
                            ? `${props.formatMoney(selectedUnmatchedMessage.parsedData.taxTotal)}원`
                            : "-"}
                        </dd>
                      </div>
                      <div>
                        <dt>합계</dt>
                        <dd>{selectedUnmatchedAmount !== null ? `${props.formatMoney(selectedUnmatchedAmount)}원` : "-"}</dd>
                      </div>
                      <div>
                        <dt>지점 ID</dt>
                        <dd>{selectedUnmatchedMessage.parsedData?.kepcoBranchId || "-"}</dd>
                      </div>
                    </dl>
                  </section>
                </div>

                {selectedUnmatchedMessage.parseError ? (
                  <section className="issuance-detail-card issuance-detail-card-danger">
                    <div className="issuance-detail-card-head">
                      <h3>예외 메모</h3>
                    </div>
                    <p className="issuance-detail-error">{selectedUnmatchedMessage.parseError}</p>
                  </section>
                ) : null}
              </div>
            ) : (
              <div className="issuance-empty-state is-detail">
                <strong>선택된 발행 건이 없습니다.</strong>
                <p>왼쪽 목록에서 세금계산서 초안이나 고객 미매칭 메일을 선택하면 상세 정보가 표시됩니다.</p>
              </div>
            )}
          </section>
        </div>
      </div>
      {customerFinderOpen && selectedUnmatchedMessage ? (
        <div className="issuance-picker-backdrop" role="presentation" onClick={() => setCustomerFinderOpen(false)}>
          <section
            className="issuance-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="issuance-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="issuance-picker-head">
              <div className="issuance-picker-copy">
                <strong id="issuance-picker-title">매칭할 고객 찾기</strong>
                <p>
                  {selectedUnmatchedMessage.parsedData?.plantName || "미매칭 메일"} ·{" "}
                  {selectedUnmatchedMessage.parsedData?.plantAddress || "주소 없음"}
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setCustomerFinderOpen(false)}>
                닫기
              </button>
            </header>

            <div className="issuance-picker-search">
              <label className="field-label" htmlFor="issuance-customer-finder-search">
                고객 검색
              </label>
              <input
                id="issuance-customer-finder-search"
                type="search"
                value={customerFinderQuery}
                autoFocus
                placeholder="고객명, 상호, 사업자번호, 주소 검색"
                onChange={(event) => setCustomerFinderQuery(event.target.value)}
              />
            </div>

            <div className="issuance-picker-result-head">
              <span>검색 결과 {customerFinderResults.length}명</span>
              <span>주소와 발전소명이 비슷한 고객이 위에 정렬됩니다.</span>
            </div>

            <div className="issuance-picker-result-list">
              {customerFinderResults.length > 0 ? (
                customerFinderResults.map(({ customer, score }) => (
                  <article key={`issuance-customer-finder-${customer.id}`} className="issuance-picker-result-card">
                    <div className="issuance-picker-result-top">
                      <div className="issuance-picker-result-copy">
                        <strong>{customer.corpName}</strong>
                        <span>
                          {customer.customerName} · {customer.businessNumber}
                        </span>
                      </div>
                      {score > 0 ? <span className="status status-review">추천 후보</span> : null}
                    </div>
                    <div className="issuance-picker-result-meta">
                      <div>
                        <dt>주소</dt>
                        <dd>{customer.addr || "-"}</dd>
                      </div>
                      <div>
                        <dt>발전소명</dt>
                        <dd>{customer.plantNames.length > 0 ? customer.plantNames.join(", ") : "-"}</dd>
                      </div>
                      <div>
                        <dt>자동 매칭 주소</dt>
                        <dd>{customer.matchAddresses.length > 0 ? customer.matchAddresses.join(", ") : "-"}</dd>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="issuance-picker-empty">
                  <strong>조건에 맞는 고객이 없습니다.</strong>
                  <p>고객명, 상호, 사업자번호, 주소를 바꿔서 다시 검색해 보세요.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
