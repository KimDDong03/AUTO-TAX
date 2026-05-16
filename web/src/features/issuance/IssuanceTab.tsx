import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckboxControl, Icon } from "../../components/ui";
import { matchesCustomerSearchQuery } from "../customers/customerSearch";
import type { Customer, InboxMessage, InvoiceDraft, MailPreviewImageResponse } from "../../types";
import {
  getSubtleHoverMotion,
  getSubtleTapMotion,
  pageCardVariants,
  pageContainerVariants,
  pageSectionVariants
} from "../pageMotion";

type IssuanceFilter = "pending" | "scheduled" | "issuing" | "issued" | "unmatched" | "missingMail" | "all";
type IssuancePeriodFilter = "all" | "month" | "recent30";
type IssuanceSortMode = "status" | "newest" | "oldest" | "amountDesc";

export type DraftTaxInvoiceInfoUpdateInput = {
  kepcoCorpName: string;
  kepcoCorpNum: string;
  kepcoBranchId: string;
  kepcoCeoName: string;
  kepcoAddr: string;
  kepcoBizType: string;
  kepcoBizClass: string;
  itemName: string;
  plantName: string;
  supplyCost: number;
  taxTotal: number;
};

export type ManualDraftCreateInput = {
  customerId: number;
  billingMonth: string;
  writeDate: string;
  itemName: string;
  plantName: string;
  supplyCost: number;
  taxTotal: number;
  kepcoCorpNum: string;
  kepcoBranchId: string;
  kepcoCorpName: string;
  kepcoCeoName: string;
  kepcoAddr: string;
  kepcoBizType: string;
  kepcoBizClass: string;
};

type DraftTaxInvoiceInfoFormState = {
  draftId: number;
  customerLabel: string;
  kepcoCorpName: string;
  kepcoCorpNum: string;
  kepcoBranchId: string;
  kepcoCeoName: string;
  kepcoAddr: string;
  kepcoBizType: string;
  kepcoBizClass: string;
  itemName: string;
  plantName: string;
  supplyCost: string;
  taxTotal: string;
};

type ManualDraftFormState = {
  billingMonth: string;
  writeDate: string;
  itemName: string;
  plantName: string;
  supplyCost: string;
  taxTotal: string;
  kepcoCorpNum: string;
  kepcoBranchId: string;
  kepcoCorpName: string;
  kepcoCeoName: string;
  kepcoAddr: string;
  kepcoBizType: string;
  kepcoBizClass: string;
};

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
  onReprocessInboxMessage: (messageId: number, customerId?: number) => void;
  onViewDraft: (draftId: number) => void;
  onPrintDraft: (draftId: number) => void;
  onCancelDraft: (draftId: number) => void;
  onUnmatchDraft: (draftId: number) => void;
  onCreateManualDraft: (input: ManualDraftCreateInput) => Promise<InvoiceDraft>;
  onUpdateDraftTaxInvoiceInfo: (draftId: number, input: DraftTaxInvoiceInfoUpdateInput) => Promise<void>;
  formatMoney: (value: number) => string;
  formatDateTime: (value: string | null) => string;
  getDraftStatusLabel: (status: string) => string;
  getDraftConfirmNumber: (draft: InvoiceDraft) => string | null;
  simplifyIssueError: (value: string) => string;
};

const ISSUANCE_FILTERS: Array<{ id: IssuanceFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "pending", label: "발행 대기" },
  { id: "issued", label: "발행 완료" },
  { id: "unmatched", label: "고객 미매칭" },
  { id: "missingMail", label: "메일 미수신" }
];

const DEFAULT_KEPCO_TAX_INVOICE_INFO = {
  kepcoCorpNum: "120-82-00052",
  kepcoBranchId: "0194",
  kepcoCorpName: "한국전력공사",
  kepcoCeoName: "김동철",
  kepcoAddr: "전라남도 나주시 전력로 55 (빛가람동, 한국전력공사)",
  kepcoBizType: "전기가스",
  kepcoBizClass: "전기공급"
};

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

function formatIssuanceListDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatKepcoMailSubject(draft: InvoiceDraft): string {
  const month = draft.billingMonth.match(/^\d{4}-(\d{2})$/)?.[1];
  const monthLabel = month ? `${Number(month)}월분` : "정산";
  return `[한전] ${monthLabel} 정산내역서 - ${draft.customerName}`;
}

function formatWon(value: number, formatMoney: (value: number) => string): string {
  return `₩ ${formatMoney(value)}`;
}

function formatDraftMoneyInput(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatManualDraftItemName(billingMonth: string): string {
  const match = billingMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return "";
  }
  return `${Number(match[1])}년${Number(match[2])}월전력`;
}

function formatSeoulDateInput(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function draftToTaxInvoiceInfoForm(draft: InvoiceDraft): DraftTaxInvoiceInfoFormState {
  return {
    draftId: draft.id,
    customerLabel: draft.customerName,
    kepcoCorpName: draft.kepcoCorpName || draft.customerName,
    kepcoCorpNum: draft.kepcoCorpNum,
    kepcoBranchId: draft.kepcoBranchId,
    kepcoCeoName: draft.kepcoCeoName,
    kepcoAddr: draft.kepcoAddr,
    kepcoBizType: draft.kepcoBizType,
    kepcoBizClass: draft.kepcoBizClass,
    itemName: draft.itemName,
    plantName: draft.plantName,
    supplyCost: formatDraftMoneyInput(draft.supplyCost),
    taxTotal: formatDraftMoneyInput(draft.taxTotal)
  };
}

function findLatestCustomerDraft(customerId: number, drafts: InvoiceDraft[]): InvoiceDraft | null {
  return (
    [...drafts]
      .filter((draft) => draft.customerId === customerId)
      .sort((left, right) => resolveDraftSortTime(right) - resolveDraftSortTime(left))[0] ?? null
  );
}

function buildManualDraftForm(entry: Extract<IssuanceListEntry, { kind: "missing-mail" }>, drafts: InvoiceDraft[]): ManualDraftFormState {
  const latestDraft = findLatestCustomerDraft(entry.customer.id, drafts);
  const itemName = formatManualDraftItemName(entry.billingMonth);
  return {
    billingMonth: entry.billingMonth,
    writeDate: formatSeoulDateInput(),
    itemName,
    plantName: latestDraft?.plantName || entry.customer.plantNames[0] || entry.customer.corpName || entry.customer.customerName,
    supplyCost: "",
    taxTotal: "",
    kepcoCorpNum: latestDraft?.kepcoCorpNum || DEFAULT_KEPCO_TAX_INVOICE_INFO.kepcoCorpNum,
    kepcoBranchId: latestDraft?.kepcoBranchId || DEFAULT_KEPCO_TAX_INVOICE_INFO.kepcoBranchId,
    kepcoCorpName: latestDraft?.kepcoCorpName || DEFAULT_KEPCO_TAX_INVOICE_INFO.kepcoCorpName,
    kepcoCeoName: latestDraft?.kepcoCeoName || DEFAULT_KEPCO_TAX_INVOICE_INFO.kepcoCeoName,
    kepcoAddr: latestDraft?.kepcoAddr || DEFAULT_KEPCO_TAX_INVOICE_INFO.kepcoAddr,
    kepcoBizType: latestDraft?.kepcoBizType || DEFAULT_KEPCO_TAX_INVOICE_INFO.kepcoBizType,
    kepcoBizClass: latestDraft?.kepcoBizClass || DEFAULT_KEPCO_TAX_INVOICE_INFO.kepcoBizClass
  };
}

function parseDraftMoneyInput(value: string, label: string): number {
  const normalized = value.replace(/[,\s₩원]/g, "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label}은 0 이상의 정수로 입력해주세요.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label}은 0 이상의 정수로 입력해주세요.`);
  }

  return parsed;
}

function validateDraftBusinessNumber(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 10) {
    throw new Error("사업자번호는 숫자 10자리로 입력해주세요.");
  }
  return trimmed;
}

function getDraftFormErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "세금계산서 정보 저장에 실패했습니다.";
}

function formatDraftFormTotalAmount(form: DraftTaxInvoiceInfoFormState, formatMoney: (value: number) => string): string {
  try {
    return formatWon(parseDraftMoneyInput(form.supplyCost || "0", "공급가액") + parseDraftMoneyInput(form.taxTotal || "0", "부가세"), formatMoney);
  } catch {
    return "-";
  }
}

function formatOptionalInvoiceValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const stringValue = String(value).trim();
  return stringValue || "-";
}

type IssuanceStatus = InvoiceDraft["status"] | "unmatched" | "missing-mail";

function getIssuanceStatusIconName(status: IssuanceStatus): string {
  switch (status) {
    case "review":
    case "scheduled":
      return "warning";
    case "issuing":
      return "loader-circle";
    case "issued":
      return "complete";
    case "failed":
      return "circle-x";
    case "unmatched":
      return "help";
    case "missing-mail":
      return "mail-x";
    default:
      return "warning";
  }
}

function IssuanceStatusBadge(props: { status: IssuanceStatus; label: string; className?: string }) {
  const iconName = getIssuanceStatusIconName(props.status);
  const className = ["status", `status-${props.status}`, "issuance-status-badge", props.className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className}>
      <Icon name={iconName} className="status-icon" />
      <span>{props.label}</span>
    </span>
  );
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
  const shouldReduceMotion = useReducedMotion();
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
  const [activeFilter, setActiveFilter] = useState<IssuanceFilter>(props.requestedFilter ?? defaultFilter);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [issuanceSearchQuery, setIssuanceSearchQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState<IssuancePeriodFilter>("all");
  const [sortMode, setSortMode] = useState<IssuanceSortMode>("status");
  const [customerFinderOpen, setCustomerFinderOpen] = useState(false);
  const [customerFinderQuery, setCustomerFinderQuery] = useState("");
  const [taxInvoiceInfoForm, setTaxInvoiceInfoForm] = useState<DraftTaxInvoiceInfoFormState | null>(null);
  const [taxInvoiceInfoError, setTaxInvoiceInfoError] = useState("");
  const [taxInvoiceInfoSaving, setTaxInvoiceInfoSaving] = useState(false);
  const [manualDraftFormEdits, setManualDraftFormEdits] = useState<Partial<ManualDraftFormState>>({});
  const [manualDraftBasisOpen, setManualDraftBasisOpen] = useState(false);
  const [manualDraftError, setManualDraftError] = useState("");
  const [manualDraftSaving, setManualDraftSaving] = useState(false);
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
    () => visibleEntries.find((entry) => entry.key === selectedEntryKey) ?? visibleEntries[0] ?? null,
    [selectedEntryKey, visibleEntries]
  );
  const selectedDraft = selectedEntry?.kind === "draft" ? selectedEntry.draft : null;
  const selectedUnmatchedMessage = selectedEntry?.kind === "unmatched" ? selectedEntry.message : null;
  const selectedMissingMailEntry = selectedEntry?.kind === "missing-mail" ? selectedEntry : null;
  const selectedDraftMailPreview = selectedDraft ? mailPreviewByDraftId[selectedDraft.id] ?? null : null;
  const selectedDraftHasMailSource = Boolean(selectedDraft && selectedDraft.sourceMessageId > 0);
  const selectedMissingMailLatestDraft = selectedMissingMailEntry
    ? findLatestCustomerDraft(selectedMissingMailEntry.customer.id, props.drafts)
    : null;
  const manualDraftBaseForm = useMemo(
    () => (selectedMissingMailEntry ? buildManualDraftForm(selectedMissingMailEntry, props.drafts) : null),
    [props.drafts, selectedMissingMailEntry]
  );
  const manualDraftForm = manualDraftBaseForm ? { ...manualDraftBaseForm, ...manualDraftFormEdits } : null;
  const selectedDraftSourceMessage = useMemo(
    () => (selectedDraft ? props.inboxMessages.find((message) => message.id === selectedDraft.sourceMessageId) ?? null : null),
    [props.inboxMessages, selectedDraft?.sourceMessageId]
  );
  const selectedDraftWriteDate = selectedDraft?.writeDate ?? selectedDraftSourceMessage?.receivedAt ?? null;
  const isSelectedDraftIssued = selectedDraft?.status === "issued";
  const canUnmatchSelectedDraft =
    selectedDraft !== null &&
    selectedDraft.sourceMessageId > 0 &&
    (selectedDraft.status === "review" || selectedDraft.status === "failed" || selectedDraft.status === "scheduled");
  const isTaxInvoiceInfoEditing = Boolean(selectedDraft && taxInvoiceInfoForm?.draftId === selectedDraft.id);
  const selectedDraftCustomer = useMemo(
    () => (selectedDraft ? props.customers.find((customer) => customer.id === selectedDraft.customerId) ?? null : null),
    [props.customers, selectedDraft?.customerId]
  );
  const visibleIssueableEntries = useMemo(
    () => visibleEntries.filter(isIssueSelectableEntry),
    [visibleEntries]
  );
  const checkedVisibleIssueableEntryCount = useMemo(
    () => visibleIssueableEntries.filter((entry) => checkedEntryKeys.has(entry.key)).length,
    [checkedEntryKeys, visibleIssueableEntries]
  );
  const allVisibleIssueableEntriesChecked =
    visibleIssueableEntries.length > 0 && checkedVisibleIssueableEntryCount === visibleIssueableEntries.length;
  const someVisibleIssueableEntriesChecked =
    checkedVisibleIssueableEntryCount > 0 && !allVisibleIssueableEntriesChecked;
  const checkedIssueableDraftIds = useMemo(
    () =>
      visibleIssueableEntries
        .filter((entry) => checkedEntryKeys.has(entry.key))
        .map((entry) => entry.draft.id),
    [checkedEntryKeys, visibleIssueableEntries]
  );
  const selectedIssueButtonLabel = "선택 일괄 발행";
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
  }, [selectedUnmatchedMessage?.id]);

  useEffect(() => {
    setManualDraftFormEdits({});
    setManualDraftBasisOpen(false);
    setManualDraftError("");
  }, [selectedMissingMailEntry?.key]);

  useEffect(() => {
    if (!selectedDraft || selectedDraft.sourceMessageId <= 0) {
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

  const handleEntryRowClick = (event: React.MouseEvent<HTMLElement>, entry: IssuanceListEntry) => {
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

  const toggleVisibleIssueableEntriesChecked = () => {
    setCheckedEntryKeys((prev) => {
      const next = new Set(prev);

      if (allVisibleIssueableEntriesChecked) {
        visibleIssueableEntries.forEach((entry) => next.delete(entry.key));
      } else {
        visibleIssueableEntries.forEach((entry) => next.add(entry.key));
      }

      return next;
    });
  };

  const handleSelectedIssueClick = () => {
    if (checkedIssueableDraftIds.length > 0) {
      props.onIssueSelectedDrafts(checkedIssueableDraftIds);
    }
  };

  useEffect(() => {
    if (!taxInvoiceInfoForm) {
      return;
    }

    if (selectedDraft?.id !== taxInvoiceInfoForm.draftId) {
      setTaxInvoiceInfoError("");
      setTaxInvoiceInfoForm(null);
    }
  }, [selectedDraft?.id, taxInvoiceInfoForm?.draftId]);

  const openTaxInvoiceInfoEditor = (draft: InvoiceDraft) => {
    setTaxInvoiceInfoError("");
    setTaxInvoiceInfoForm(draftToTaxInvoiceInfoForm(draft));
  };

  const updateTaxInvoiceInfoFormField = (field: keyof DraftTaxInvoiceInfoFormState, value: string) => {
    setTaxInvoiceInfoError("");
    setTaxInvoiceInfoForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleTaxInvoiceInfoSave = async () => {
    if (!taxInvoiceInfoForm) {
      return;
    }

    try {
      const kepcoCorpName = taxInvoiceInfoForm.kepcoCorpName.trim();
      const itemName = taxInvoiceInfoForm.itemName.trim();
      if (!kepcoCorpName) {
        throw new Error("공급받는자를 입력해주세요.");
      }
      if (!itemName) {
        throw new Error("품목을 입력해주세요.");
      }

      const input: DraftTaxInvoiceInfoUpdateInput = {
        kepcoCorpName,
        kepcoCorpNum: validateDraftBusinessNumber(taxInvoiceInfoForm.kepcoCorpNum),
        kepcoBranchId: taxInvoiceInfoForm.kepcoBranchId.trim(),
        kepcoCeoName: taxInvoiceInfoForm.kepcoCeoName.trim(),
        kepcoAddr: taxInvoiceInfoForm.kepcoAddr.trim(),
        kepcoBizType: taxInvoiceInfoForm.kepcoBizType.trim(),
        kepcoBizClass: taxInvoiceInfoForm.kepcoBizClass.trim(),
        itemName,
        plantName: taxInvoiceInfoForm.plantName.trim(),
        supplyCost: parseDraftMoneyInput(taxInvoiceInfoForm.supplyCost, "공급가액"),
        taxTotal: parseDraftMoneyInput(taxInvoiceInfoForm.taxTotal, "부가세")
      };

      setTaxInvoiceInfoSaving(true);
      await props.onUpdateDraftTaxInvoiceInfo(taxInvoiceInfoForm.draftId, input);
      setTaxInvoiceInfoForm(null);
      setTaxInvoiceInfoError("");
    } catch (error) {
      setTaxInvoiceInfoError(getDraftFormErrorMessage(error));
    } finally {
      setTaxInvoiceInfoSaving(false);
    }
  };

  const updateManualDraftFormField = (field: keyof ManualDraftFormState, value: string) => {
    setManualDraftFormEdits((prev) =>
      field === "billingMonth"
        ? {
            ...prev,
            billingMonth: value,
            itemName: formatManualDraftItemName(value)
          }
        : {
            ...prev,
            [field]: value
          }
    );
    setManualDraftError("");
  };

  const handleManualDraftCreate = async () => {
    if (!selectedMissingMailEntry || !manualDraftForm) {
      return;
    }

    try {
      if (!/^\d{4}-\d{2}$/.test(manualDraftForm.billingMonth.trim())) {
        throw new Error("정산월은 YYYY-MM 형식으로 입력해주세요.");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(manualDraftForm.writeDate.trim())) {
        throw new Error("작성일자는 YYYY-MM-DD 형식으로 입력해주세요.");
      }

      const input: ManualDraftCreateInput = {
        customerId: selectedMissingMailEntry.customer.id,
        billingMonth: manualDraftForm.billingMonth.trim(),
        writeDate: manualDraftForm.writeDate.trim(),
        itemName: manualDraftForm.itemName.trim(),
        plantName: manualDraftForm.plantName.trim(),
        supplyCost: parseDraftMoneyInput(manualDraftForm.supplyCost, "공급가액"),
        taxTotal: parseDraftMoneyInput(manualDraftForm.taxTotal, "부가세"),
        kepcoCorpNum: validateDraftBusinessNumber(manualDraftForm.kepcoCorpNum),
        kepcoBranchId: manualDraftForm.kepcoBranchId.trim(),
        kepcoCorpName: manualDraftForm.kepcoCorpName.trim(),
        kepcoCeoName: manualDraftForm.kepcoCeoName.trim(),
        kepcoAddr: manualDraftForm.kepcoAddr.trim(),
        kepcoBizType: manualDraftForm.kepcoBizType.trim(),
        kepcoBizClass: manualDraftForm.kepcoBizClass.trim()
      };

      if (!input.itemName) {
        throw new Error("품목을 입력해주세요.");
      }
      if (!input.plantName) {
        throw new Error("발전소명을 입력해주세요.");
      }
      if (!input.kepcoCorpName) {
        throw new Error("공급받는자를 입력해주세요.");
      }

      setManualDraftSaving(true);
      const draft = await props.onCreateManualDraft(input);
      setSelectedEntryKey(`draft-${draft.id}`);
      setManualDraftFormEdits({});
      setManualDraftBasisOpen(false);
      setManualDraftError("");
    } catch (error) {
      setManualDraftError(getDraftFormErrorMessage(error));
    } finally {
      setManualDraftSaving(false);
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

  const renderTaxInvoiceValueRow = (label: string, value: string) => (
    <div className="issuance-tax-invoice-row" key={label}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  const renderTaxInvoiceInputRow = (
    label: string,
    field: keyof DraftTaxInvoiceInfoFormState,
    options: { type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; placeholder?: string } = {}
  ) => (
    <div className="issuance-tax-invoice-row" key={label}>
      <dt>{label}</dt>
      <dd>
        <input
          className="issuance-inline-edit-input"
          value={taxInvoiceInfoForm?.[field] ?? ""}
          aria-label={label}
          type={options.type}
          inputMode={options.inputMode}
          placeholder={options.placeholder}
          onChange={(event) => updateTaxInvoiceInfoFormField(field, event.target.value)}
        />
      </dd>
    </div>
  );

  const renderManualDraftField = (
    label: string,
    field: keyof ManualDraftFormState,
    options: { type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; placeholder?: string } = {}
  ) => (
    <label className="issuance-manual-draft-field" key={field}>
      <span>{label}</span>
      <input
        value={manualDraftForm?.[field] ?? ""}
        aria-label={label}
        type={options.type}
        inputMode={options.inputMode}
        placeholder={options.placeholder}
        onChange={(event) => updateManualDraftFormField(field, event.target.value)}
      />
    </label>
  );

  const renderTaxInvoiceSection = (title: string, rows: React.ReactNode) => (
    <section className="issuance-tax-invoice-section" aria-label={`${title} 정보`}>
      <h3>{title}</h3>
      <dl className="issuance-tax-invoice-table">{rows}</dl>
    </section>
  );

  return (
    <motion.div
      className="issuance-screen"
      variants={pageContainerVariants}
      initial={shouldReduceMotion ? false : "hidden"}
      animate={shouldReduceMotion ? undefined : "visible"}
    >
      <div className="issuance-main-column">
        <motion.div className="issuance-console-toolbar" variants={pageSectionVariants}>
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
                <motion.button
                  key={filter.id}
                  type="button"
                  className={
                    activeFilter === filter.id
                      ? "home-header-chip issuance-filter-chip active"
                      : "home-header-chip issuance-filter-chip"
                  }
                  aria-pressed={activeFilter === filter.id}
                  whileHover={getSubtleHoverMotion(shouldReduceMotion)}
                  whileTap={getSubtleTapMotion(shouldReduceMotion)}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  <span className="issuance-filter-label">{filter.label}</span>
                  <span className="issuance-filter-count">{count}명</span>
                </motion.button>
              );
            })}
          </div>

          {props.mailboxDataLoading ? (
            <div className="issuance-refresh-status" role="status" aria-live="polite">
              <Icon name="sync" className="issuance-refresh-status-icon" />
              <span>데이터 새로 읽는 중</span>
            </div>
          ) : null}

          <div className="issuance-console-actions" aria-label="세금계산서 발행 작업">
            <button type="button" className="btn-secondary" onClick={props.onSyncMail} disabled={props.busyKey !== null}>
              <Icon name="sync" className="button-icon" />
              {props.busyKey === "sync" ? "가져오는 중..." : "메일 다시 가져오기"}
            </button>
            <button type="button" onClick={handleSelectedIssueClick} disabled={!canIssueCheckedDrafts || props.busyKey !== null}>
              <Icon name="send" className="button-icon" />
              {selectedIssueButtonLabel}
            </button>
          </div>
        </motion.div>

        <motion.section className="issuance-summary-grid" variants={pageContainerVariants}>
          <motion.article className="issuance-summary-card" variants={pageCardVariants}>
            <div className="issuance-summary-card-head">
              <span>발행 대기</span>
              <Icon name="issue" className="issuance-summary-card-icon" />
            </div>
            <strong>{pendingManualCount}건</strong>
            <p>수동 검토 후 바로 발행 가능한 초안과 실패 건입니다.</p>
          </motion.article>
          <motion.article className="issuance-summary-card" variants={pageCardVariants}>
            <div className="issuance-summary-card-head">
              <span>오늘 발행</span>
              <Icon name="complete" className="issuance-summary-card-icon" />
            </div>
            <strong>{props.formatMoney(todayIssuedAmount)}원</strong>
            <p>{todayIssuedDrafts.length}건 발행 완료</p>
          </motion.article>
          <motion.article className="issuance-summary-card" variants={pageCardVariants}>
            <div className="issuance-summary-card-head">
              <span>자동 대기</span>
              <Icon name="dashboard" className="issuance-summary-card-icon" />
            </div>
            <strong>{scheduledCount}건</strong>
            <p>고객 발행 주기 기준으로 예약된 초안입니다.</p>
          </motion.article>
          <motion.article className="issuance-summary-card tone-warn" variants={pageCardVariants}>
            <div className="issuance-summary-card-head">
              <span>실패 / 발행 중</span>
              <Icon name="review" className="issuance-summary-card-icon" />
            </div>
            <strong>{failedCount + issuingCount}건</strong>
            <p>실패 {failedCount}건 · 발행 중 {issuingCount}건</p>
          </motion.article>
        </motion.section>

        <motion.div className="issuance-workspace" variants={pageSectionVariants}>
          <motion.section className="issuance-list-panel" layout>
            <div className="issuance-panel-head">
              <CheckboxControl
                checked={allVisibleIssueableEntriesChecked}
                readOnly
                disabled={visibleIssueableEntries.length === 0}
                aria-label={`초안 목록 (${visibleEntries.length})`}
                ref={(element) => {
                  if (element) {
                    element.indeterminate = someVisibleIssueableEntriesChecked;
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleVisibleIssueableEntriesChecked();
                }}
              />
              <div>
                <h2>
                  초안 목록 <span>({visibleEntries.length})</span>
                </h2>
                <p className="sr-only">
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
                      <th aria-label="선택">
                        <CheckboxControl
                          checked={allVisibleIssueableEntriesChecked}
                          readOnly
                          disabled={visibleIssueableEntries.length === 0}
                          aria-label="표시된 발행 가능 초안 전체 선택"
                          ref={(element) => {
                            if (element) {
                              element.indeterminate = someVisibleIssueableEntriesChecked;
                            }
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleVisibleIssueableEntriesChecked();
                          }}
                        />
                      </th>
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
                              <CheckboxControl
                                checked={isChecked}
                                readOnly
                                aria-label={`${draft.customerName} 행 선택`}
                                onClick={(event) => handleEntryCheckboxClick(event, entry, isChecked)}
                              />
                            </td>
                            <td className="issuance-table-status-cell">
                              <IssuanceStatusBadge status={draft.status} label={props.getDraftStatusLabel(draft.status)} />
                            </td>
                            <td className="issuance-table-date-cell">{formatIssuanceListDateTime(draft.issuedAt ?? draft.issueRequestedAt ?? draft.updatedAt)}</td>
                            <td className="issuance-table-customer-cell">
                              <strong>{draft.customerName}</strong>
                            </td>
                            <td className="issuance-table-business-cell">{draft.kepcoCorpNum || "-"}</td>
                            <td className="issuance-table-amount-cell">{formatWon(draft.totalAmount, props.formatMoney)}</td>
                            <td className="issuance-table-subject-cell">
                              <span className="issuance-table-subject">{formatKepcoMailSubject(draft)}</span>
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
                              <CheckboxControl
                                checked={isChecked}
                                readOnly
                                aria-label={`${customer.customerName} 행 선택`}
                                onClick={(event) => handleEntryCheckboxClick(event, entry, isChecked)}
                              />
                            </td>
                            <td className="issuance-table-status-cell">
                              <IssuanceStatusBadge status="missing-mail" label="메일 미수신" />
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
                        ? formatWon(message.parsedData.supplyCost + message.parsedData.taxTotal, props.formatMoney)
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
                            <CheckboxControl
                              checked={isChecked}
                              readOnly
                              aria-label={`${message.subject || "미매칭 메일"} 행 선택`}
                              onClick={(event) => handleEntryCheckboxClick(event, entry, isChecked)}
                            />
                          </td>
                          <td className="issuance-table-status-cell">
                            <IssuanceStatusBadge status="unmatched" label="고객 미매칭" />
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
          </motion.section>

          <motion.section className="issuance-detail-panel" layout>
            <div className="issuance-detail-panel-head">
              <h2>상세</h2>
            </div>
            {selectedDraft ? (
              <div className="issuance-detail-scroll">
                <div className="issuance-detail-hero">
                  <div className="issuance-detail-hero-copy">
                    <h2>{selectedDraft.customerName}</h2>
                    <p>{formatKepcoMailSubject(selectedDraft)}</p>
                  </div>
                  <IssuanceStatusBadge
                    status={selectedDraft.status}
                    label={props.getDraftStatusLabel(selectedDraft.status)}
                    className="issuance-detail-status-badge"
                  />
                </div>

                <div className="issuance-detail-tabset">
                  <div className={selectedDraftHasMailSource ? "issuance-invoice-compare" : "issuance-invoice-compare is-manual-draft"} aria-label="발행 정보">
                    {selectedDraftHasMailSource ? (
                      <div className="issuance-mail-preview" aria-label="한전 이메일 캡처본">
                        <div className="issuance-card-title">
                          <Icon name="mail" className="issuance-card-title-icon" />
                          한전 이메일 캡처본
                        </div>
                        <div className="issuance-mail-preview-body">
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
                      </div>
                    ) : null}

                    <section
                      className={
                        isTaxInvoiceInfoEditing
                          ? "issuance-detail-facts-shell issuance-tax-invoice-info-shell is-editing"
                          : "issuance-detail-facts-shell issuance-tax-invoice-info-shell"
                      }
                      aria-label="자동 등록된 세금계산서 정보"
                    >
                      <div className="issuance-card-title">
                        <Icon name="document" className="issuance-card-title-icon" />
                        자동 등록된 세금계산서 정보
                      </div>
                      <div className="issuance-tax-invoice-layout">
                        {renderTaxInvoiceSection(
                          "발행 내용",
                          isTaxInvoiceInfoEditing && taxInvoiceInfoForm ? (
                            <>
                              {renderTaxInvoiceValueRow("작성일자", formatIssuanceTableDate(selectedDraftWriteDate))}
                              {renderTaxInvoiceInputRow("품목", "itemName")}
                              {renderTaxInvoiceInputRow("공급가액", "supplyCost", { inputMode: "numeric" })}
                              {renderTaxInvoiceInputRow("부가세", "taxTotal", { inputMode: "numeric" })}
                              {renderTaxInvoiceValueRow("합계금액", formatDraftFormTotalAmount(taxInvoiceInfoForm, props.formatMoney))}
                            </>
                          ) : (
                            <>
                              {renderTaxInvoiceValueRow("작성일자", formatIssuanceTableDate(selectedDraftWriteDate))}
                              {renderTaxInvoiceValueRow("품목", formatOptionalInvoiceValue(selectedDraft.itemName))}
                              {renderTaxInvoiceValueRow("공급가액", formatWon(selectedDraft.supplyCost, props.formatMoney))}
                              {renderTaxInvoiceValueRow("부가세", formatWon(selectedDraft.taxTotal, props.formatMoney))}
                              {renderTaxInvoiceValueRow("합계금액", formatWon(selectedDraft.totalAmount, props.formatMoney))}
                            </>
                          )
                        )}

                        <div className="issuance-tax-invoice-party-grid">
                          {renderTaxInvoiceSection(
                            "공급자",
                            <>
                              {renderTaxInvoiceValueRow("등록번호", formatOptionalInvoiceValue(selectedDraftCustomer?.businessNumber))}
                              {renderTaxInvoiceValueRow("상호", formatOptionalInvoiceValue(selectedDraftCustomer?.corpName || selectedDraft.customerName))}
                              {renderTaxInvoiceValueRow("대표자명", formatOptionalInvoiceValue(selectedDraftCustomer?.ceoName))}
                              {renderTaxInvoiceValueRow("주소", formatOptionalInvoiceValue(selectedDraftCustomer?.addr))}
                              {renderTaxInvoiceValueRow("업태", formatOptionalInvoiceValue(selectedDraftCustomer?.bizType))}
                              {renderTaxInvoiceValueRow("종목", formatOptionalInvoiceValue(selectedDraftCustomer?.bizClass))}
                            </>
                          )}
                          {renderTaxInvoiceSection(
                            "공급받는자",
                            isTaxInvoiceInfoEditing && taxInvoiceInfoForm ? (
                              <>
                                {renderTaxInvoiceInputRow("등록번호", "kepcoCorpNum", {
                                  inputMode: "numeric",
                                  placeholder: "123-45-67890"
                                })}
                                {renderTaxInvoiceInputRow("종사업장번호", "kepcoBranchId", { inputMode: "numeric" })}
                                {renderTaxInvoiceInputRow("상호", "kepcoCorpName")}
                                {renderTaxInvoiceInputRow("대표자명", "kepcoCeoName")}
                                {renderTaxInvoiceInputRow("주소", "kepcoAddr")}
                                {renderTaxInvoiceInputRow("업태", "kepcoBizType")}
                                {renderTaxInvoiceInputRow("종목", "kepcoBizClass")}
                              </>
                            ) : (
                              <>
                                {renderTaxInvoiceValueRow("등록번호", formatOptionalInvoiceValue(selectedDraft.kepcoCorpNum))}
                                {renderTaxInvoiceValueRow("종사업장번호", formatOptionalInvoiceValue(selectedDraft.kepcoBranchId))}
                                {renderTaxInvoiceValueRow("상호", formatOptionalInvoiceValue(selectedDraft.kepcoCorpName || selectedDraft.customerName))}
                                {renderTaxInvoiceValueRow("대표자명", formatOptionalInvoiceValue(selectedDraft.kepcoCeoName))}
                                {renderTaxInvoiceValueRow("주소", formatOptionalInvoiceValue(selectedDraft.kepcoAddr))}
                                {renderTaxInvoiceValueRow("업태", formatOptionalInvoiceValue(selectedDraft.kepcoBizType))}
                                {renderTaxInvoiceValueRow("종목", formatOptionalInvoiceValue(selectedDraft.kepcoBizClass))}
                              </>
                            )
                          )}
                        </div>
                      </div>
                      {isTaxInvoiceInfoEditing && taxInvoiceInfoError ? <p className="issuance-inline-edit-error">{taxInvoiceInfoError}</p> : null}
                    </section>
                  </div>
                </div>
                <div className="issuance-detail-footer-actions">
                  <div className="issuance-detail-footer-buttons">
                    {isSelectedDraftIssued ? (
                      <>
                        <button type="button" className="btn-secondary" onClick={() => props.onViewDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                          보기
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => props.onCancelDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                          발행 취소
                        </button>
                      </>
                    ) : isTaxInvoiceInfoEditing ? (
                      <button
                        type="button"
                        onClick={() => void handleTaxInvoiceInfoSave()}
                        disabled={taxInvoiceInfoSaving || props.busyKey !== null}
                      >
                        <Icon name="complete" className="button-icon" />
                        {taxInvoiceInfoSaving ? "저장 중..." : "수정 완료"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => openTaxInvoiceInfoEditor(selectedDraft)}
                          disabled={props.busyKey !== null}
                          aria-label="자동 등록된 세금계산서 정보 수정"
                        >
                          <Icon name="edit" className="button-icon" />
                          세금계산서 정보 수정
                        </button>
                        {canUnmatchSelectedDraft ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => props.onUnmatchDraft(selectedDraft.id)}
                            disabled={props.busyKey !== null}
                          >
                            <Icon name="undo" className="button-icon" />
                            매칭 해제
                          </button>
                        ) : null}
                        <button type="button" onClick={() => props.onIssueDraft(selectedDraft.id)} disabled={props.busyKey !== null}>
                          <Icon name="send" className="button-icon" />
                          발행하기
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : selectedUnmatchedMessage ? (
              <div className="issuance-detail-scroll">
                <div className="issuance-detail-hero">
                  <div className="issuance-detail-hero-copy">
                    <h2>{selectedUnmatchedMessage.parsedData?.plantName || "미매칭 메일"}</h2>
                    <p>
                      {selectedUnmatchedMessage.subject || "제목 없음"}
                      {selectedUnmatchedMessage.parsedData?.billingMonth ? ` · ${selectedUnmatchedMessage.parsedData.billingMonth}` : ""}
                    </p>
                  </div>
                  <IssuanceStatusBadge status="unmatched" label="고객 미매칭" className="issuance-detail-status-badge" />
                </div>

                <div className="issuance-detail-tabset">
                  <div className="issuance-invoice-compare issuance-unmatched-mail-grid" aria-label="미매칭 메일 정보">
                    <section className="issuance-detail-facts-shell" aria-label="메일 정보">
                      <div className="issuance-card-title">
                        <Icon name="mail" className="issuance-card-title-icon" />
                        메일 정보
                      </div>
                      <dl className="issuance-detail-facts issuance-detail-facts-parsed">
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
                          <dt>수신 시각</dt>
                          <dd>{props.formatDateTime(selectedUnmatchedMessage.receivedAt)}</dd>
                        </div>
                        <div>
                          <dt>연결 고객</dt>
                          <dd>-</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="issuance-detail-facts-shell" aria-label="자동 추출 정보">
                      <div className="issuance-card-title">
                        <Icon name="document" className="issuance-card-title-icon" />
                        자동 추출 정보
                      </div>
                      <dl className="issuance-detail-facts issuance-detail-facts-parsed">
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
                              ? formatWon(selectedUnmatchedMessage.parsedData.supplyCost, props.formatMoney)
                              : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt>부가세</dt>
                          <dd>
                            {selectedUnmatchedMessage.parsedData
                              ? formatWon(selectedUnmatchedMessage.parsedData.taxTotal, props.formatMoney)
                              : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt>합계금액</dt>
                          <dd>{selectedUnmatchedAmount !== null ? formatWon(selectedUnmatchedAmount, props.formatMoney) : "-"}</dd>
                        </div>
                        <div>
                          <dt>지점 ID</dt>
                          <dd>{selectedUnmatchedMessage.parsedData?.kepcoBranchId || "-"}</dd>
                        </div>
                      </dl>
                    </section>

                  </div>
                </div>

                <div className="issuance-detail-footer-actions">
                  <p>고객을 연결하면 자동 등록된 세금계산서 정보로 전환됩니다.</p>
                  <div className="issuance-detail-footer-buttons">
                    <button type="button" className="btn-secondary" onClick={() => props.onReprocessInboxMessage(selectedUnmatchedMessage.id)} disabled={props.busyKey !== null}>
                      <Icon name="refresh" className="button-icon" />
                      재처리
                    </button>
                    <button type="button" onClick={() => setCustomerFinderOpen(true)}>
                      <Icon name="search" className="button-icon" />
                      고객 찾기
                    </button>
                  </div>
                </div>
              </div>
            ) : selectedMissingMailEntry ? (
              <div className="issuance-detail-scroll">
                <div className="issuance-detail-hero">
                  <div className="issuance-detail-hero-copy">
                    <h2>{selectedMissingMailEntry.customer.customerName}</h2>
                    <p>
                      {selectedMissingMailEntry.billingMonth} 정산월 메일이 아직 수신 목록에 없습니다.
                    </p>
                  </div>
                  <IssuanceStatusBadge status="missing-mail" label="메일 미수신" className="issuance-detail-status-badge" />
                </div>

                <div className="issuance-detail-tabset">
                  <div className="issuance-invoice-compare" aria-label="메일 미수신 정보">
                    <section className="issuance-detail-facts-shell" aria-label="메일 수신 대기 정보">
                      <div className="issuance-card-title">
                        <Icon name="mail-x" className="issuance-card-title-icon" />
                        메일 수신 대기 정보
                      </div>
                      <dl className="issuance-detail-facts issuance-detail-facts-parsed">
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
                          <dt>연동 상태</dt>
                          <dd>
                            {selectedMissingMailEntry.customer.popbillState} / 인증서{" "}
                            {selectedMissingMailEntry.customer.popbillCertRegistered ? "등록" : "미등록"}
                          </dd>
                        </div>
                      </dl>
                    </section>
                    {manualDraftForm ? (
                      <section className="issuance-detail-facts-shell issuance-manual-draft-shell" aria-label="수동 발행 정보">
                        <div className="issuance-card-title">
                          <Icon name="pencil" className="issuance-card-title-icon" />
                          수동 발행
                        </div>
                        <div className="issuance-manual-draft-form">
                          <div className="issuance-manual-draft-grid">
                            {renderManualDraftField("정산월", "billingMonth", { type: "month" })}
                            {renderManualDraftField("작성일자", "writeDate", { type: "date" })}
                            {renderManualDraftField("공급가액", "supplyCost", { inputMode: "numeric", placeholder: "121,867" })}
                            {renderManualDraftField("부가세", "taxTotal", { inputMode: "numeric", placeholder: "12,186" })}
                            {renderManualDraftField("품목", "itemName")}
                            <div className="issuance-manual-draft-total">
                              <span>합계금액</span>
                              <strong>
                                {formatDraftFormTotalAmount(
                                  {
                                    ...manualDraftForm,
                                    draftId: 0,
                                    customerLabel: selectedMissingMailEntry.customer.customerName
                                  },
                                  props.formatMoney
                                )}
                              </strong>
                            </div>
                          </div>

                          {selectedMissingMailLatestDraft ? (
                            <div className="issuance-manual-draft-basis-note">
                              <span>공급받는자 기준 정보는 최근 초안 기준으로 채웠습니다.</span>
                              <button type="button" className="btn-secondary" onClick={() => setManualDraftBasisOpen((open) => !open)}>
                                {manualDraftBasisOpen ? "기준 정보 닫기" : "기준 정보 수정"}
                              </button>
                            </div>
                          ) : null}

                          {!selectedMissingMailLatestDraft || manualDraftBasisOpen ? (
                            <div className="issuance-manual-draft-grid is-basis">
                              {renderManualDraftField("등록번호", "kepcoCorpNum", { inputMode: "numeric" })}
                              {renderManualDraftField("종사업장번호", "kepcoBranchId", { inputMode: "numeric" })}
                              {renderManualDraftField("상호", "kepcoCorpName")}
                              {renderManualDraftField("대표자명", "kepcoCeoName")}
                              {renderManualDraftField("주소", "kepcoAddr")}
                              {renderManualDraftField("업태", "kepcoBizType")}
                              {renderManualDraftField("종목", "kepcoBizClass")}
                              {renderManualDraftField("발전소명", "plantName")}
                            </div>
                          ) : null}
                        </div>
                        {manualDraftError ? <p className="issuance-inline-edit-error">{manualDraftError}</p> : null}
                      </section>
                    ) : null}
                  </div>
                </div>

                <div className="issuance-detail-footer-actions">
                  <p>메일이 없어도 문자로 받은 금액을 입력해 직접 발행 초안을 만들 수 있습니다.</p>
                  <div className="issuance-detail-footer-buttons">
                    <button type="button" className="btn-secondary" onClick={props.onSyncMail} disabled={props.busyKey !== null}>
                      <Icon name="sync" className="button-icon" />
                      {props.busyKey === "sync" ? "가져오는 중..." : "메일 다시 가져오기"}
                    </button>
                    <button type="button" onClick={handleManualDraftCreate} disabled={props.busyKey !== null || manualDraftSaving}>
                      <Icon name="issue" className="button-icon" />
                      {manualDraftSaving ? "만드는 중..." : "수동 발행"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="issuance-empty-state is-detail">
                <strong>선택된 발행 건이 없습니다.</strong>
                <p>왼쪽 목록에서 세금계산서 초안, 고객 미매칭 메일, 메일 미수신 고객을 선택하면 상세 정보가 표시됩니다.</p>
              </div>
            )}
          </motion.section>
        </motion.div>
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
              <span>이름이 달라도 선택할 수 있고, 주소와 발전소명이 비슷한 고객이 위에 정렬됩니다.</span>
            </div>

            <div className="issuance-picker-result-list">
              {customerFinderResults.length > 0 ? (
                customerFinderResults.map(({ customer, score }) => (
                  <article key={`issuance-customer-finder-${customer.id}`} className="issuance-picker-result-card">
                    <div className="issuance-picker-result-top">
                      <div className="issuance-picker-result-copy">
                        <strong>{customer.corpName}</strong>
                        <span>
                          {customer.customerName} · {customer.businessNumber || "-"} · {customer.addr || "-"}
                        </span>
                      </div>
                      <div className="issuance-picker-result-actions">
                        {score > 0 ? <span className="status status-review">추천 후보</span> : null}
                        <button
                          type="button"
                          className="btn-secondary issuance-picker-select-button"
                          onClick={() => {
                            setCustomerFinderOpen(false);
                            props.onReprocessInboxMessage(selectedUnmatchedMessage.id, customer.id);
                          }}
                          disabled={props.busyKey !== null}
                        >
                          선택
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="issuance-picker-empty">
                  <strong>조건에 맞는 고객이 없습니다.</strong>
                  <p>등록된 고객명, 상호, 사업자번호, 주소를 바꿔서 다시 검색해 보세요. 이름이 달라도 선택할 수 있습니다.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </motion.div>
  );
}
