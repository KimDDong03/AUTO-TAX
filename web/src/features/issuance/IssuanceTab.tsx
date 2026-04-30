import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { matchesCustomerSearchQuery } from "../customers/customerSearch";
import type { Customer, InboxMessage, InvoiceDraft, MailPreviewImageResponse } from "../../types";

type IssuanceFilter = "pending" | "scheduled" | "issuing" | "issued" | "unmatched" | "missingMail" | "all";
type IssuancePeriodFilter = "all" | "month" | "recent30";
type IssuanceSortMode = "status" | "newest" | "oldest" | "amountDesc";
type IssuanceDetailTab = "invoice" | "customer" | "failure" | "popbill";
type UnmatchedDetailTab = "mail" | "extracted" | "exception";

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
    }
  | {
      key: string;
      sortTime: number;
      kind: "missing-mail";
      customer: Customer;
      billingMonth: string;
    };

type DraftMailPreviewState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      preview: MailPreviewImageResponse;
    }
  | {
      status: "error";
      error: string;
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
  inboxMessages: InboxMessage[];
  unmatchedInboxMessages: InboxMessage[];
  customers: Customer[];
  busyKey: string | null;
  onSyncMail: () => void;
  loadDraftMailPreview: (draftId: number) => Promise<MailPreviewImageResponse>;
  onIssueAllReviewDrafts: () => void;
  onIssueSelectedDrafts: (draftIds: number[]) => void;
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
  { id: "missingMail", label: "메일 미수신" },
  { id: "all", label: "전체" }
];

const ISSUANCE_DETAIL_TABS: Array<{ id: IssuanceDetailTab; label: string }> = [
  { id: "invoice", label: "발행 정보" },
  { id: "customer", label: "고객 정보" },
  { id: "failure", label: "실패 사유" },
  { id: "popbill", label: "연동 정보" }
];

const UNMATCHED_DETAIL_TABS: Array<{ id: UnmatchedDetailTab; label: string }> = [
  { id: "mail", label: "메일 정보" },
  { id: "extracted", label: "추출 정보" },
  { id: "exception", label: "예외 사유" }
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

function isIssuableDraft(draft: InvoiceDraft): boolean {
  return draft.status === "review" || draft.status === "failed";
}

function isIssueSelectableEntry(entry: IssuanceListEntry): entry is Extract<IssuanceListEntry, { kind: "draft" }> {
  return entry.kind === "draft" && isIssuableDraft(entry.draft);
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

function getCurrentSeoulBillingMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return year && month ? `${year}-${month}` : "";
}

function getBillingMonthSortTime(billingMonth: string): number {
  const timestamp = new Date(`${billingMonth}-01T00:00:00+09:00`).getTime();
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

function formatIssuanceTableDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("ko-KR");
}

function getIssuanceListEntryOrder(entry: IssuanceListEntry): number {
  if (entry.kind === "missing-mail") return 6;
  if (entry.kind === "unmatched") return 5;
  return DRAFT_STATUS_ORDER[entry.draft.status];
}

function compareIssuanceListEntries(left: IssuanceListEntry, right: IssuanceListEntry): number {
  const statusOrder = getIssuanceListEntryOrder(left) - getIssuanceListEntryOrder(right);
  if (statusOrder !== 0) return statusOrder;
  return right.sortTime - left.sortTime;
}

function getIssuanceEntryAmount(entry: IssuanceListEntry): number {
  if (entry.kind === "draft") {
    return entry.draft.totalAmount;
  }

  if (entry.kind === "missing-mail") {
    return 0;
  }

  return entry.message.parsedData ? entry.message.parsedData.supplyCost + entry.message.parsedData.taxTotal : 0;
}

function getIssuanceEntrySearchText(entry: IssuanceListEntry): string {
  if (entry.kind === "draft") {
    const draft = entry.draft;
    return [
      draft.customerName,
      draft.kepcoCorpNum,
      draft.plantName,
      draft.itemName,
      draft.billingMonth,
      draft.recipientEmail,
      draft.popbillMgtKey
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (entry.kind === "missing-mail") {
    const customer = entry.customer;
    return [
      customer.customerName,
      customer.corpName,
      customer.businessNumber,
      customer.addr,
      customer.bizType,
      customer.bizClass,
      entry.billingMonth,
      ...customer.plantNames,
      ...customer.matchAddresses
    ]
      .filter(Boolean)
      .join(" ");
  }

  const message = entry.message;
  return [
    message.subject,
    message.fromAddress,
    message.parsedData?.plantName,
    message.parsedData?.plantAddress,
    message.parsedData?.billingMonth,
    message.parsedData?.itemName,
    message.parsedData?.kepcoBranchId
  ]
    .filter(Boolean)
    .join(" ");
}

function matchesIssuanceEntrySearch(entry: IssuanceListEntry, query: string): boolean {
  const normalizedQuery = normalizeCustomerFinderValue(query);
  if (normalizedQuery === "") {
    return true;
  }

  return normalizeCustomerFinderValue(getIssuanceEntrySearchText(entry)).includes(normalizedQuery);
}

function matchesIssuanceEntryPeriod(entry: IssuanceListEntry, period: IssuancePeriodFilter): boolean {
  if (period === "all") {
    return true;
  }

  if (entry.kind === "missing-mail") {
    return period === "month";
  }

  const entryDate = new Date(entry.sortTime);
  if (Number.isNaN(entryDate.getTime())) {
    return false;
  }

  const now = new Date();
  if (period === "month") {
    return entryDate.getFullYear() === now.getFullYear() && entryDate.getMonth() === now.getMonth();
  }

  const recent30Start = new Date(now);
  recent30Start.setDate(now.getDate() - 30);
  return entryDate >= recent30Start;
}

function compareVisibleIssuanceEntries(sortMode: IssuanceSortMode, left: IssuanceListEntry, right: IssuanceListEntry): number {
  if (sortMode === "newest") {
    return right.sortTime - left.sortTime;
  }

  if (sortMode === "oldest") {
    return left.sortTime - right.sortTime;
  }

  if (sortMode === "amountDesc") {
    const amountDiff = getIssuanceEntryAmount(right) - getIssuanceEntryAmount(left);
    if (amountDiff !== 0) {
      return amountDiff;
    }
  }

  return compareIssuanceListEntries(left, right);
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
  const currentBillingMonth = useMemo(() => getCurrentSeoulBillingMonth(), []);
  const defaultFilter: IssuanceFilter = "all";
  const [activeFilter, setActiveFilter] = useState<IssuanceFilter>(defaultFilter);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [issuanceSearchQuery, setIssuanceSearchQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState<IssuancePeriodFilter>("all");
  const [sortMode, setSortMode] = useState<IssuanceSortMode>("status");
  const [detailTab, setDetailTab] = useState<IssuanceDetailTab>("invoice");
  const [unmatchedDetailTab, setUnmatchedDetailTab] = useState<UnmatchedDetailTab>("mail");
  const [customerFinderOpen, setCustomerFinderOpen] = useState(false);
  const [customerFinderQuery, setCustomerFinderQuery] = useState("");
  const [checkedEntryKeys, setCheckedEntryKeys] = useState<Set<string>>(() => new Set());
  const [mailPreviewByDraftId, setMailPreviewByDraftId] = useState<Record<number, DraftMailPreviewState>>({});
  const previousRequestedFilterRef = useRef<IssuanceFilter | null>(null);
  const mailPreviewRequestedDraftIdsRef = useRef<Set<number>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(
    () => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    },
    []
  );

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
    setCheckedEntryKeys(new Set());
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
  const missingMailEntries = useMemo<IssuanceListEntry[]>(() => {
    if (!currentBillingMonth) {
      return [];
    }

    const customerIdsWithCurrentMonthMail = new Set<number>();

    props.drafts.forEach((draft) => {
      if (draft.billingMonth === currentBillingMonth) {
        customerIdsWithCurrentMonthMail.add(draft.customerId);
      }
    });

    props.inboxMessages.forEach((message) => {
      if (message.customerId !== null && message.parsedData?.billingMonth === currentBillingMonth) {
        customerIdsWithCurrentMonthMail.add(message.customerId);
      }
    });

    const sortTime = getBillingMonthSortTime(currentBillingMonth);

    return [...props.customers]
      .filter((customer) => !customerIdsWithCurrentMonthMail.has(customer.id))
      .sort((left, right) => {
        const corpNameCompare = left.corpName.localeCompare(right.corpName, "ko-KR");
        if (corpNameCompare !== 0) return corpNameCompare;
        return left.customerName.localeCompare(right.customerName, "ko-KR");
      })
      .map((customer) => ({
        key: `missing-mail-${customer.id}`,
        sortTime,
        kind: "missing-mail",
        customer,
        billingMonth: currentBillingMonth
      }));
  }, [currentBillingMonth, props.customers, props.drafts, props.inboxMessages]);
  const missingMailCount = missingMailEntries.length;
  const filteredEntries = useMemo(
    () =>
      activeFilter === "all"
        ? [...draftEntries, ...unmatchedEntries, ...missingMailEntries].sort(compareIssuanceListEntries)
        : activeFilter === "unmatched"
          ? unmatchedEntries
          : activeFilter === "missingMail"
            ? missingMailEntries
          : draftEntries.filter((entry) => entry.kind === "draft" && matchesIssuanceFilter(entry.draft, activeFilter)),
    [activeFilter, draftEntries, missingMailEntries, unmatchedEntries]
  );
  const visibleEntries = useMemo(
    () =>
      filteredEntries
        .filter((entry) => matchesIssuanceEntrySearch(entry, issuanceSearchQuery))
        .filter((entry) => matchesIssuanceEntryPeriod(entry, periodFilter))
        .sort((left, right) => compareVisibleIssuanceEntries(sortMode, left, right)),
    [filteredEntries, issuanceSearchQuery, periodFilter, sortMode]
  );

  useEffect(() => {
    if (visibleEntries.length === 0) {
      if (selectedEntryKey !== null) {
        setSelectedEntryKey(null);
      }
      return;
    }

    if (selectedEntryKey === null || !visibleEntries.some((entry) => entry.key === selectedEntryKey)) {
      setSelectedEntryKey(visibleEntries[0].key);
    }
  }, [selectedEntryKey, visibleEntries]);

  const selectedEntry = useMemo(
    () => visibleEntries.find((entry) => entry.key === selectedEntryKey) ?? null,
    [selectedEntryKey, visibleEntries]
  );
  const selectedDraft = selectedEntry?.kind === "draft" ? selectedEntry.draft : null;
  const selectedUnmatchedMessage = selectedEntry?.kind === "unmatched" ? selectedEntry.message : null;
  const selectedMissingMailEntry = selectedEntry?.kind === "missing-mail" ? selectedEntry : null;
  const selectedCustomer = useMemo(
    () => (selectedDraft ? props.customers.find((customer) => customer.id === selectedDraft.customerId) ?? null : null),
    [props.customers, selectedDraft]
  );
  const selectedDraftConfirmNumber = selectedDraft ? props.getDraftConfirmNumber(selectedDraft) : null;
  const selectedDraftMailPreview = selectedDraft ? mailPreviewByDraftId[selectedDraft.id] ?? null : null;

  const canIssueSelectedDraft = selectedDraft?.status === "review" || selectedDraft?.status === "failed";
  const isSelectedDraftIssued = selectedDraft?.status === "issued";
  const canShowPopbillInfo = Boolean(selectedDraft?.popbillMgtKey);
  const checkedIssueableDraftIds = useMemo(
    () =>
      visibleEntries
        .filter(isIssueSelectableEntry)
        .filter((entry) => checkedEntryKeys.has(entry.key))
        .map((entry) => entry.draft.id),
    [checkedEntryKeys, visibleEntries]
  );
  const selectedIssueButtonLabel = checkedIssueableDraftIds.length > 0 ? `선택 발행 ${checkedIssueableDraftIds.length}` : "선택 발행";
  const canIssueCheckedDrafts = checkedIssueableDraftIds.length > 0;
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
    setUnmatchedDetailTab("mail");
  }, [selectedUnmatchedMessage?.id]);

  useEffect(() => {
    setDetailTab("invoice");
  }, [selectedEntry?.key]);

  useEffect(() => {
    if (!selectedDraft) {
      return;
    }

    const draftId = selectedDraft.id;
    if (mailPreviewRequestedDraftIdsRef.current.has(draftId)) {
      return;
    }

    mailPreviewRequestedDraftIdsRef.current.add(draftId);
    setMailPreviewByDraftId((prev) => ({
      ...prev,
      [draftId]: {
        status: "loading"
      }
    }));

    void props.loadDraftMailPreview(draftId)
      .then((preview) => {
        if (!isMountedRef.current) {
          return;
        }

        setMailPreviewByDraftId((prev) => ({
          ...prev,
          [draftId]: {
            status: "ready",
            preview
          }
        }));
      })
      .catch((error) => {
        if (!isMountedRef.current) {
          return;
        }

        setMailPreviewByDraftId((prev) => ({
          ...prev,
          [draftId]: {
            status: "error",
            error: error instanceof Error ? error.message : "원본 메일 이미지를 불러오지 못했습니다."
          }
        }));
      });
  }, [props.loadDraftMailPreview, selectedDraft?.id]);

  useEffect(() => {
    const visibleEntryKeys = new Set(visibleEntries.map((entry) => entry.key));
    setCheckedEntryKeys((prev) => {
      let changed = false;
      const next = new Set<string>();

      prev.forEach((entryKey) => {
        if (visibleEntryKeys.has(entryKey)) {
          next.add(entryKey);
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });

  }, [visibleEntries]);

  const selectOnlyEntry = (entry: IssuanceListEntry) => {
    setCheckedEntryKeys(new Set([entry.key]));
    setSelectedEntryKey(entry.key);
  };

  const setEntryChecked = (entry: IssuanceListEntry, checked: boolean) => {
    setCheckedEntryKeys((prev) => {
      const next = new Set(prev);

      if (checked) {
        next.add(entry.key);
      } else {
        next.delete(entry.key);
      }

      return next;
    });
    setSelectedEntryKey(entry.key);
  };

  const toggleEntryChecked = (entry: IssuanceListEntry) => {
    setEntryChecked(entry, !checkedEntryKeys.has(entry.key));
  };

  const handleEntryRowClick = (event: React.MouseEvent<HTMLTableRowElement>, entry: IssuanceListEntry) => {
    if (event.ctrlKey) {
      toggleEntryChecked(entry);
      return;
    }

    selectOnlyEntry(entry);
  };

  const handleEntryCheckboxClick = (event: React.MouseEvent<HTMLInputElement>, entry: IssuanceListEntry, isChecked: boolean) => {
    event.stopPropagation();
    setEntryChecked(entry, !isChecked);
  };

  const handleSelectedIssueClick = () => {
    if (checkedIssueableDraftIds.length > 0) {
      props.onIssueSelectedDrafts(checkedIssueableDraftIds);
    }
  };

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
      <header className="issuance-console-head">
        <h2>{props.screenTitle}</h2>
      </header>

      <div className="issuance-main-column">
        {props.mailboxDataLoading ? (
          <div className="helper-box import-helper-box">
            <strong>세금계산서 발행 데이터를 새로 읽는 중입니다.</strong>
          </div>
        ) : null}

        <div className="issuance-console-toolbar">
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
                        : filter.id === "missingMail"
                          ? missingMailCount
                          : props.drafts.length + unmatchedMessageCount + missingMailCount;

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

          <div className="issuance-console-actions" aria-label="세금계산서 발행 작업">
            <button type="button" className="btn-secondary" onClick={props.onSyncMail} disabled={props.busyKey !== null}>
              <Icon name="sync" className="button-icon" />
              {props.busyKey === "sync" ? "동기화 중..." : "메일 동기화"}
            </button>
            <button type="button" onClick={handleSelectedIssueClick} disabled={!canIssueCheckedDrafts || props.busyKey !== null}>
              {selectedIssueButtonLabel}
            </button>
          </div>
        </div>

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
                <h2>초안 목록</h2>
                <p>
                  {visibleEntries.length} / {filteredEntries.length}건 표시
                </p>
              </div>
            </div>

            <div className="issuance-table-tools">
              <label className="issuance-search-field" htmlFor="issuance-list-search">
                <span className="sr-only">초안 검색</span>
                <input
                  id="issuance-list-search"
                  type="search"
                  value={issuanceSearchQuery}
                  placeholder="검색 (고객명, 사업자번호, 메일제목)"
                  onChange={(event) => setIssuanceSearchQuery(event.target.value)}
                />
              </label>
              <label className="sr-only" htmlFor="issuance-period-filter">
                기간 선택
              </label>
              <select
                id="issuance-period-filter"
                value={periodFilter}
                onChange={(event) => setPeriodFilter(event.target.value as IssuancePeriodFilter)}
              >
                <option value="all">기간 선택</option>
                <option value="month">이번 달</option>
                <option value="recent30">최근 30일</option>
              </select>
              <label className="sr-only" htmlFor="issuance-sort-mode">
                정렬
              </label>
              <select id="issuance-sort-mode" value={sortMode} onChange={(event) => setSortMode(event.target.value as IssuanceSortMode)}>
                <option value="status">정렬</option>
                <option value="newest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="amountDesc">금액 높은순</option>
              </select>
            </div>

            <div className="issuance-table-shell">
              {visibleEntries.length === 0 ? (
                <div className="issuance-empty-state">
                  <strong>표시할 발행 건이 없습니다.</strong>
                  <p>현재 필터 조건에 맞는 세금계산서 초안이나 미매칭 메일이 없습니다.</p>
                </div>
              ) : (
                <table className="issuance-list-table">
                  <thead>
                    <tr>
                      <th aria-label="선택" />
                      <th>상태</th>
                      <th>메일 날짜</th>
                      <th>고객명</th>
                      <th>사업자번호</th>
                      <th>공급가액</th>
                      <th>메일 제목</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((entry) => {
                      const isSelected = selectedEntry?.key === entry.key;
                      const isChecked = checkedEntryKeys.has(entry.key);
                      const rowClassName = [
                        "issuance-table-row",
                        isSelected ? "is-selected" : "",
                        isChecked ? "is-checked" : ""
                      ]
                        .filter(Boolean)
                        .join(" ");
                      const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }
                        event.preventDefault();
                        if (event.ctrlKey) {
                          toggleEntryChecked(entry);
                          return;
                        }
                        selectOnlyEntry(entry);
                      };

                      if (entry.kind === "draft") {
                        const draft = entry.draft;
                        return (
                          <tr
                            key={entry.key}
                            tabIndex={0}
                            aria-selected={isSelected}
                            className={rowClassName}
                            onClick={(event) => handleEntryRowClick(event, entry)}
                            onKeyDown={handleRowKeyDown}
                          >
                            <td className="issuance-table-check-cell">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                readOnly
                                aria-label={`${draft.customerName} 행 선택`}
                                onClick={(event) => handleEntryCheckboxClick(event, entry, isChecked)}
                              />
                            </td>
                            <td className="issuance-table-status-cell">
                              <span className={`status status-${draft.status}`}>{props.getDraftStatusLabel(draft.status)}</span>
                            </td>
                            <td className="issuance-table-date-cell">{formatIssuanceTableDate(draft.issuedAt ?? draft.issueRequestedAt ?? draft.updatedAt)}</td>
                            <td className="issuance-table-customer-cell">
                              <strong>{draft.customerName}</strong>
                            </td>
                            <td className="issuance-table-business-cell">{draft.kepcoCorpNum || "-"}</td>
                            <td className="issuance-table-amount-cell">{props.formatMoney(draft.supplyCost)}원</td>
                            <td className="issuance-table-subject-cell">
                              <span className="issuance-table-subject">
                                {draft.itemName} · {draft.billingMonth || "정산월 미확인"}
                              </span>
                              {draft.issueError ? <span className="cell-error">{props.simplifyIssueError(draft.issueError)}</span> : null}
                            </td>
                          </tr>
                        );
                      }

                      if (entry.kind === "missing-mail") {
                        const customer = entry.customer;

                        return (
                          <tr
                            key={entry.key}
                            tabIndex={0}
                            aria-selected={isSelected}
                            className={rowClassName}
                            onClick={(event) => handleEntryRowClick(event, entry)}
                            onKeyDown={handleRowKeyDown}
                          >
                            <td className="issuance-table-check-cell">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                readOnly
                                aria-label={`${customer.customerName} 행 선택`}
                                onClick={(event) => handleEntryCheckboxClick(event, entry, isChecked)}
                              />
                            </td>
                            <td className="issuance-table-status-cell">
                              <span className="status status-missing-mail">메일 미수신</span>
                            </td>
                            <td className="issuance-table-date-cell">-</td>
                            <td className="issuance-table-customer-cell">
                              <strong>{customer.customerName}</strong>
                            </td>
                            <td className="issuance-table-business-cell">{customer.businessNumber || "-"}</td>
                            <td className="issuance-table-amount-cell">-</td>
                            <td className="issuance-table-subject-cell">
                              <span className="issuance-table-subject">{entry.billingMonth} 메일 대기</span>
                            </td>
                          </tr>
                        );
                      }

                      const message = entry.message;
                      const parsedAmount = message.parsedData
                        ? `${props.formatMoney(message.parsedData.supplyCost + message.parsedData.taxTotal)}원`
                        : "금액 미확인";

                      return (
                        <tr
                          key={entry.key}
                          tabIndex={0}
                          aria-selected={isSelected}
                          className={rowClassName}
                          onClick={(event) => handleEntryRowClick(event, entry)}
                          onKeyDown={handleRowKeyDown}
                        >
                          <td className="issuance-table-check-cell">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              aria-label={`${message.subject || "미매칭 메일"} 행 선택`}
                              onClick={(event) => handleEntryCheckboxClick(event, entry, isChecked)}
                            />
                          </td>
                          <td className="issuance-table-status-cell">
                            <span className="status status-unmatched">고객 미매칭</span>
                          </td>
                          <td className="issuance-table-date-cell">{formatIssuanceTableDate(message.receivedAt)}</td>
                          <td className="issuance-table-customer-cell">
                            <strong>{message.parsedData?.plantName || "미매칭 메일"}</strong>
                          </td>
                          <td className="issuance-table-business-cell">-</td>
                          <td className="issuance-table-amount-cell">{parsedAmount}</td>
                          <td className="issuance-table-subject-cell">
                            <span className="issuance-table-subject">{message.subject || message.parsedData?.plantAddress || "-"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="issuance-detail-panel">
            <div className="issuance-detail-panel-head">
              <h2>상세</h2>
              <span aria-hidden="true">×</span>
            </div>
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
                </div>

                <div className="issuance-detail-tabset">
                  <div className="issuance-detail-tabs" role="tablist" aria-label="발행 상세 정보">
                    {ISSUANCE_DETAIL_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={detailTab === tab.id}
                        className={detailTab === tab.id ? "active" : ""}
                        onClick={() => setDetailTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="issuance-detail-grid">
                    <section className="issuance-detail-card" aria-label="발행 정보" hidden={detailTab !== "invoice"}>
                      <div className="issuance-invoice-compare">
                        <div className="issuance-mail-preview" aria-label="원본 메일 금액 이미지">
                          {selectedDraftMailPreview?.status === "ready" ? (
                            <img
                              src={selectedDraftMailPreview.preview.imageDataUrl}
                              width={selectedDraftMailPreview.preview.width}
                              height={selectedDraftMailPreview.preview.height}
                              alt={`${selectedDraft.customerName} 원본 메일 금액 영역`}
                            />
                          ) : selectedDraftMailPreview?.status === "error" ? (
                            <p className="issuance-mail-preview-state">{selectedDraftMailPreview.error}</p>
                          ) : (
                            <p className="issuance-mail-preview-state">원본 메일 이미지를 불러오는 중입니다.</p>
                          )}
                        </div>

                        <dl className="issuance-detail-facts issuance-detail-facts-parsed">
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
                            <dt>품목</dt>
                            <dd>{selectedDraft.itemName || "-"}</dd>
                          </div>
                          <div>
                            <dt>수신 이메일</dt>
                            <dd>{selectedDraft.recipientEmail || "-"}</dd>
                          </div>
                          <div>
                            <dt>원본 메일 ID</dt>
                            <dd>{selectedDraft.sourceMessageId}</dd>
                          </div>
                        </dl>
                      </div>
                    </section>

                    <section className="issuance-detail-card" aria-label="고객 정보" hidden={detailTab !== "customer"}>
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
                        <dt>연동 상태</dt>
                        <dd>{selectedCustomer ? `${selectedCustomer.popbillState} / 인증서 ${selectedCustomer.popbillCertRegistered ? "등록" : "미등록"}` : "-"}</dd>
                      </div>
                      <div>
                        <dt>고객 발행 방식</dt>
                        <dd>{selectedCustomer ? props.getIssueModeLabel(selectedCustomer.issueMode) : "-"}</dd>
                      </div>
                      </dl>
                    </section>

                    <section className="issuance-detail-card issuance-detail-card-danger" aria-label="실패 사유" hidden={detailTab !== "failure"}>
                      <p className="issuance-detail-error">
                        {selectedDraft.issueError ? props.simplifyIssueError(selectedDraft.issueError) : "현재 선택한 초안에는 실패 사유가 없습니다."}
                      </p>
                    </section>

                    <section className="issuance-detail-card" aria-label="연동 정보" hidden={detailTab !== "popbill"}>
                      <dl className="issuance-detail-facts">
                      <div>
                        <dt>관리번호</dt>
                        <dd>{selectedDraft.popbillMgtKey || "-"}</dd>
                      </div>
                      <div>
                        <dt>확인번호</dt>
                        <dd>{selectedDraftConfirmNumber ?? "-"}</dd>
                      </div>
                      <div>
                        <dt>연동 상태</dt>
                        <dd>{selectedCustomer ? `${selectedCustomer.popbillState} / 인증서 ${selectedCustomer.popbillCertRegistered ? "등록" : "미등록"}` : "-"}</dd>
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
                  </div>
                </div>

                <div className="issuance-detail-footer-actions">
                  {isSelectedDraftIssued ? (
                    <>
                      <button type="button" className="btn-secondary" onClick={() => props.onViewDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                        보기
                      </button>
                      <button type="button" onClick={() => props.onPrintDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                        인쇄
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => props.onShowDraftPopbillInfo(selectedDraft.id)}
                        disabled={!canShowPopbillInfo || props.busyKey !== null}
                      >
                        연동 정보
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => props.onCancelDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                        발행 취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-secondary" onClick={() => props.onViewDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                        보기
                      </button>
                      <button type="button" onClick={() => props.onIssueDraft(selectedDraft.id)} disabled={!canIssueSelectedDraft || props.busyKey !== null}>
                        직접 발행
                      </button>
                      <button type="button" onClick={() => props.onPrintDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                        인쇄
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => props.onShowDraftPopbillInfo(selectedDraft.id)}
                        disabled={!canShowPopbillInfo || props.busyKey !== null}
                      >
                        연동 정보
                      </button>
                    </>
                  )}
                </div>
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
                </div>

                <div className="issuance-detail-tabset">
                  <div className="issuance-detail-tabs is-unmatched" role="tablist" aria-label="미매칭 메일 상세 정보">
                    {UNMATCHED_DETAIL_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={unmatchedDetailTab === tab.id}
                        className={unmatchedDetailTab === tab.id ? "active" : ""}
                        onClick={() => setUnmatchedDetailTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="issuance-detail-grid">
                    <section className="issuance-detail-card" aria-label="메일 정보" hidden={unmatchedDetailTab !== "mail"}>
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

                    <section className="issuance-detail-card" aria-label="추출 정보" hidden={unmatchedDetailTab !== "extracted"}>
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

                    <section className="issuance-detail-card issuance-detail-card-danger" aria-label="예외 사유" hidden={unmatchedDetailTab !== "exception"}>
                      <p className="issuance-detail-error">{selectedUnmatchedMessage.parseError || "현재 표시할 예외 사유가 없습니다."}</p>
                    </section>
                  </div>
                </div>

                <div className="issuance-detail-footer-actions">
                  <button type="button" onClick={() => setCustomerFinderOpen(true)}>
                    고객 찾기
                  </button>
                  <button type="button" onClick={() => props.onReprocessInboxMessage(selectedUnmatchedMessage.id)} disabled={props.busyKey !== null}>
                    재처리
                  </button>
                </div>
              </div>
            ) : selectedMissingMailEntry ? (
              <div className="issuance-detail-scroll">
                <div className="issuance-detail-hero">
                  <div className="issuance-detail-hero-copy">
                    <div className="issuance-detail-hero-top">
                      <span className="status status-missing-mail">메일 미수신</span>
                      <span className="issuance-detail-mode">메일 대기</span>
                    </div>
                    <h2>{selectedMissingMailEntry.customer.customerName}</h2>
                    <p>
                      {selectedMissingMailEntry.billingMonth} 정산월 메일이 아직 수신 목록에 없습니다.
                    </p>
                  </div>
                </div>

                <div className="issuance-detail-grid">
                  <section className="issuance-detail-card" aria-label="메일 미수신 고객 정보">
                    <dl className="issuance-detail-facts">
                    <div>
                      <dt>정산월</dt>
                      <dd>{selectedMissingMailEntry.billingMonth}</dd>
                    </div>
                    <div>
                      <dt>상태</dt>
                      <dd>메일 미수신</dd>
                    </div>
                    <div>
                      <dt>고객명</dt>
                      <dd>{selectedMissingMailEntry.customer.customerName}</dd>
                    </div>
                    <div>
                      <dt>법인명</dt>
                      <dd>{selectedMissingMailEntry.customer.corpName || "-"}</dd>
                    </div>
                    <div>
                      <dt>사업자번호</dt>
                      <dd>{selectedMissingMailEntry.customer.businessNumber || "-"}</dd>
                    </div>
                    <div>
                      <dt>주소</dt>
                      <dd>{selectedMissingMailEntry.customer.addr || "-"}</dd>
                    </div>
                    <div>
                      <dt>발전소명</dt>
                      <dd>
                        {selectedMissingMailEntry.customer.plantNames.length > 0
                          ? selectedMissingMailEntry.customer.plantNames.join(", ")
                          : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt>고객 발행 방식</dt>
                      <dd>{props.getIssueModeLabel(selectedMissingMailEntry.customer.issueMode)}</dd>
                    </div>
                    <div>
                      <dt>연동 상태</dt>
                      <dd>
                        {selectedMissingMailEntry.customer.popbillState} / 인증서{" "}
                        {selectedMissingMailEntry.customer.popbillCertRegistered ? "등록" : "미등록"}
                      </dd>
                    </div>
                    </dl>
                  </section>
                </div>

                <div className="issuance-detail-footer-actions">
                  <button type="button" className="btn-secondary" onClick={props.onSyncMail} disabled={props.busyKey !== null}>
                    <Icon name="sync" className="button-icon" />
                    {props.busyKey === "sync" ? "동기화 중..." : "메일 동기화"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="issuance-empty-state is-detail">
                <strong>선택된 발행 건이 없습니다.</strong>
                <p>왼쪽 목록에서 세금계산서 초안, 고객 미매칭 메일, 메일 미수신 고객을 선택하면 상세 정보가 표시됩니다.</p>
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
