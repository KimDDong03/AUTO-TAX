import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Eraser, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxControl, Icon, PasswordField } from "../../components/ui";
import {
  EmptyState,
  InlineNotice,
  SearchField,
  StatusBadge,
  SummaryFilterCard,
  TableEmptyState,
  TaskStepper,
  type ConsoleTone
} from "../../components/console";
import type { ConsoleStatus, TaskStepItem } from "../../components/console";
import { matchesAnySearchText } from "../../lib/searchMatch";
import type { LocalCertificateUploadSessionResult } from "../../local-renewal-helper";
import type {
  Customer,
  CustomerCertificate,
  CustomerCertificateKind,
  CustomerContractPeriod,
  CustomerContractPeriodMutationResult,
  CustomerContractRenewalDueItem,
  CustomerContractSummary,
  CustomerReportDetail,
  CustomerReportMonth,
  InvoiceDraft
} from "../../types";
import type { CustomerCertificateCandidateView } from "../certificates/useCertificatesScreenModel";
import {
  getCustomerCertificateTodayDateKey,
  normalizeCustomerCertificateExpireDateKey,
  isCustomerCertificateExpired,
  isIssueCapableCustomerCertificateKind
} from "../renewal/customerRenewalCertificateUtils";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";
import {
  buildInitialRegistrationPasswordPasteUpdates,
  getInitialRegistrationChecklistDragSelectionPatch,
  getInitialRegistrationChecklistSearchMatches,
  getInitialRegistrationChecklistSelectionPatch,
  getInitialRegistrationPasswordClearRowIndexes
} from "../initial-registration/initial-registration-review-model";
import {
  filterCustomerOnestopCertificates,
  mergeCustomerOnestopCertificates,
  type CustomerCertificateOnestopDraft,
  type CustomerCertificateOnestopReviewResult,
  type CustomerCertificateOnestopReviewTarget,
  type CustomerCertificateOnestopResult
} from "./customerCertificateOnestop";
import {
  calculateCustomerReportTotals,
  createEmptyCustomerReportDetail,
  deriveContractEndMonth,
  formatCustomerReportIssueDay,
  hasCustomerReportDetailChanges,
  parseMoneyInput,
  parseCustomerReportIssueDay,
  parseNullableNumberInput
} from "./customerReportDetail";
import { useCustomerReportDetail } from "./useCustomerReportDetail";
import {
  getCurrentSeoulBillingMonth,
  type CustomerListFilter
} from "./customerListFilters";
import type { CustomerSearchField } from "./customerSearch";
import {
  buildCustomerContractStatusChip,
  buildCustomerIssueStatusChip,
  type CustomerStatusChip
} from "./customerStatusChips";
import {
  getSubtleHoverMotion,
  getSubtleTapMotion,
  pageContainerVariants,
  pageSectionVariants
} from "../pageMotion";

type CustomerFormState = {
  id: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  popbillUserId: string;
  popbillPassword: string;
  renewalContactMobile: string;
  issueCompleteSmsTemplate: string;
  memo: string;
};

type CustomerDetailTabId = "info" | "history";
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

type CustomerConsoleTone = CustomerIssueReadiness["tone"] | "default";

type CustomerStatusBadge = {
  label: string;
  tone: CustomerConsoleTone;
  detail?: string;
};

type CustomerCertificatePasswordDialog = {
  action: "prepare" | "payment";
  certificateIndex: string;
  certificateName: string;
  certificateKindLabel: string;
  expireLabel: string;
};

type CustomerOnestopStepId = "source" | "result";
type CustomerRenewalAssistantUpgradeState = "unknown" | "up-to-date" | "upgrade-available" | "upgrade-required";
type CustomerOnestopChecklistFilter = "all" | "issues" | "password";
type CustomerOnestopRowStatus =
  | "unchecked"
  | "checking"
  | "ready"
  | "needs_fix"
  | "registered"
  | "failed";

type CustomerOnestopCertificateRow = {
  rowIndex: number;
  certificate: RenewalAgentCertificate;
  certificateIndex: string;
  certificateName: string;
  corpName: string;
  plantName: string;
  customerName: string;
  businessNumber: string;
  certificatePassword: string;
  selected: boolean;
  status: CustomerOnestopRowStatus;
  statusMessage: string;
  draft: CustomerCertificateOnestopDraft | null;
  result: CustomerCertificateOnestopResult | null;
};

type CustomerOnestopDragSelection = {
  selected: boolean;
  anchorRowIndex: number;
  lastRowIndex: number;
  initialSelectedRowIndexes: number[];
};

type CustomerOnestopBatchResult = {
  total: number;
  completed: number;
  failed: number;
  items: Array<{
    rowIndex: number;
    label: string;
    status: "success" | "failed";
    message: string;
    result?: CustomerCertificateOnestopResult;
  }>;
};

const CUSTOMER_ONESTOP_STEP_ORDER: Array<{ id: CustomerOnestopStepId; label: string }> = [
  { id: "source", label: "대상 선택/확인" },
  { id: "result", label: "결과" }
];

type CustomersTabProps = {
  customers: Customer[];
  customerCertificates: CustomerCertificate[];
  customerCertificateItems: CustomerCertificateCandidateView[];
  expiredCertCustomers: Customer[];
  expiringSoonCustomers: Customer[];
  filteredCustomers: Customer[];
  selectedCustomer: Customer | null;
  creatingCustomer: boolean;
  selectedCustomerReadiness: CustomerIssueReadiness | null;
  selectedCustomerIssues: CustomerIssueChecklistItem[];
  selectedCustomerIssuedDrafts: InvoiceDraft[];
  issuedDraftsByCustomerId: Map<number, InvoiceDraft[]>;
  contractSummaries: CustomerContractSummary[];
  contractRenewalDueItems: CustomerContractRenewalDueItem[];
  blockedCustomerCount: number;
  readyCustomerCount: number;
  expiringSoonCustomerCount: number;
  popbillPendingCustomerCount: number;
  busyKey: string | null;
  isSavingCustomer: boolean;
  customerSearchField: CustomerSearchField;
  customerSearchQuery: string;
  customerIssueMonthQuery: string;
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
  customerRenewalAssistantUpgradeState: CustomerRenewalAssistantUpgradeState;
  customerRenewalAssistantUpgradeMessage: string | null;
  renewalHelperDownloadUrl: string;
  customerRenewalLoadedCertificateCount: number;
  userLabel: string;
  workspaceLabel: string;
  workspaceModeLabel: string;
  renewableCustomers: CustomerRenewalCandidateView[];
  customerNameInputRef: React.RefObject<HTMLInputElement | null>;
  customerAddressLookupRef: React.MutableRefObject<string>;
  setCustomerSearchField: React.Dispatch<React.SetStateAction<CustomerSearchField>>;
  setCustomerSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setCustomerIssueMonthQuery: React.Dispatch<React.SetStateAction<string>>;
  setCustomerListFilter: React.Dispatch<React.SetStateAction<CustomerListFilter>>;
  setCustomerDetailTab: React.Dispatch<React.SetStateAction<CustomerDetailTabId>>;
  setCustomerForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  setCustomerAddressResolveMessage: React.Dispatch<React.SetStateAction<string>>;
  onCreateCustomer: () => void;
  onCancelCreateCustomer: () => void;
  onRefreshCustomerRenewalAssistant: () => Promise<void>;
  onLoadCustomerRenewalCertificates: () => Promise<RenewalAgentCertificate[]>;
  onUploadCustomerAddCertificateFiles: (files: File[]) => Promise<LocalCertificateUploadSessionResult>;
  onReviewCustomerCertificateOnestopTargets: (input: {
    targets: CustomerCertificateOnestopReviewTarget[];
    sharedPassword: string;
    onProgress?: (message: string) => void;
  }) => Promise<CustomerCertificateOnestopReviewResult>;
  onExecuteCustomerCertificateOnestop: (input: {
    certificate: RenewalAgentCertificate;
    draft: CustomerCertificateOnestopDraft;
    certificatePassword: string;
  }) => Promise<CustomerCertificateOnestopResult>;
  onStartCustomerRenewal: (customerId: number) => Promise<void>;
  onSelectCustomer: (customer: Customer) => void;
  onSaveCustomer: () => Promise<void>;
  onSaveCustomerMemo: (customerId: number, memo: string) => Promise<void>;
  onJoinCustomerPopbill: (customerId: number) => Promise<void>;
  onOpenCustomerCertRegistration: (customerId: number) => Promise<void>;
  onLinkCustomerCertificate: (certificateIndex: string, customerId: number) => Promise<void>;
  onUnlinkCustomerCertificate: (certificateId: number) => Promise<void>;
  onPrepareCustomerCertificateRenewal: (certificateIndex: string, options?: { showAlert?: boolean; certificatePassword?: string }) => Promise<void>;
  onOpenCustomerCertificatePayment: (certificateIndex: string, options?: { showAlert?: boolean; certificatePassword?: string }) => Promise<void>;
  onRefreshCustomerCertificateStatus: (customerId: number) => Promise<void>;
  onResetPopbillLink: (customer: Customer) => Promise<void>;
  onDeleteCustomers: (customers: Customer[]) => Promise<number[]>;
  onExportSelectedCustomers: (customers: Customer[], reportYear: number) => Promise<void>;
  onShowDraftPopbillInfo: (draftId: number) => Promise<void>;
  onOpenDraftPopbillUrl: (draftId: number, path: "view-url" | "print-url") => Promise<void>;
  onCustomerReportDetailSaved: (detail: CustomerReportDetail) => void | Promise<void>;
  onLoadCustomerContractPeriods: (customerId: number) => Promise<CustomerContractPeriod[]>;
  onAddCustomerContractPeriod: (
    customerId: number,
    input: { contractStartDate: string; contractEndDate: string }
  ) => Promise<CustomerContractPeriodMutationResult>;
  onCompleteCustomerContractRenewal: (item: CustomerContractRenewalDueItem) => Promise<void>;
  resolveCustomerAddress: () => Promise<string>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatCertificateExpireDate: (value: string | null) => string;
  getCustomerIssueReadiness: (customer: Customer) => CustomerIssueReadiness;
  getCustomerCertificateSummary: (customer: Customer) => string;
  getCustomerPopbillSummary: (customer: Customer) => string;
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

function getCustomerConsoleTone(tone: CustomerConsoleTone): ConsoleTone {
  if (tone === "warn") return "warning";
  return tone;
}

function getCustomerOnestopStepStatus(stepIndex: number, activeIndex: number): ConsoleStatus {
  if (stepIndex < activeIndex) return "complete";
  if (stepIndex === activeIndex) return "current";
  return "pending";
}

function buildCustomerOnestopStepItems(activeStep: CustomerOnestopStepId): TaskStepItem[] {
  const activeIndex = Math.max(0, CUSTOMER_ONESTOP_STEP_ORDER.findIndex((step) => step.id === activeStep));
  return CUSTOMER_ONESTOP_STEP_ORDER.map((step, index) => ({
    id: step.id,
    order: index + 1,
    title: step.label,
    status: getCustomerOnestopStepStatus(index, activeIndex)
  }));
}

function renderCustomerStatusChip(chip: CustomerStatusChip | null) {
  if (!chip) {
    return null;
  }

  return (
    <StatusBadge
      tone={getCustomerConsoleTone(chip.tone)}
      icon={false}
      className={`${getToneBadgeClass(chip.tone)} customer-list-status-chip`}
      title={chip.detail}
    >
      {chip.label}
    </StatusBadge>
  );
}

function formatCustomerMonthLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  return `${match[1]}년 ${Number(match[2])}월`;
}

function formatCustomerContractDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return value || "-";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function getCustomerContractPeriodStatusLabel(status: CustomerContractPeriod["status"]): string {
  switch (status) {
    case "expired":
      return "만료";
    case "active":
      return "진행 중";
    case "scheduled":
      return "예정";
    default:
      return status;
  }
}

function getCustomerContractPeriodStatusClass(status: CustomerContractPeriod["status"]): string {
  return [
    "customer-contract-period-status",
    status === "active" ? "tone-success" : status === "scheduled" ? "tone-info" : "tone-warn"
  ].join(" ");
}

function getCurrentCustomerReportYear(): number {
  return new Date().getFullYear();
}

function getInvoiceDraftReportYear(draft: InvoiceDraft): number | null {
  const billingMonthYearCandidate = Number(draft.billingMonth.replace(/[^0-9]/g, "").slice(0, 4));
  if (Number.isInteger(billingMonthYearCandidate) && billingMonthYearCandidate >= 2000 && billingMonthYearCandidate <= 2200) {
    return billingMonthYearCandidate;
  }

  const issuedDateTimestamp = draft.issuedAt ? Date.parse(draft.issuedAt) : NaN;
  if (Number.isFinite(issuedDateTimestamp)) {
    const issuedAtYear = new Date(issuedDateTimestamp).getFullYear();
    if (Number.isInteger(issuedAtYear) && issuedAtYear >= 2000 && issuedAtYear <= 2200) {
      return issuedAtYear;
    }
  }

  const writeDateTimestamp = draft.writeDate ? Date.parse(draft.writeDate) : NaN;
  if (Number.isFinite(writeDateTimestamp)) {
    const writeDateYear = new Date(writeDateTimestamp).getFullYear();
    if (Number.isInteger(writeDateYear) && writeDateYear >= 2000 && writeDateYear <= 2200) {
      return writeDateYear;
    }
  }

  return null;
}

function getCustomerReportIssuedDraftSyncKey(
  customerId: number,
  customerReportYear: number,
  drafts: InvoiceDraft[]
): string {
  const issueDraftSignature = drafts
    .filter((draft) => draft.customerId === customerId && draft.status === "issued")
    .filter((draft) => {
      const draftYear = getInvoiceDraftReportYear(draft);
      return draftYear === null || draftYear === customerReportYear;
    })
    .sort((a, b) => a.id - b.id)
    .map((draft) => `${draft.id}:${draft.issuedAt ?? draft.writeDate ?? ""}:${draft.billingMonth}`)
    .join("|");

  return `${customerId}|${customerReportYear}|${issueDraftSignature}`;
}

function getCustomerOnestopErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatCustomerOnestopCertificateExpireDate(value: string | null | undefined): string {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString("ko-KR");
}

function getCustomerOnestopCertificateKey(certificate: RenewalAgentCertificate): string {
  return [
    certificate.index,
    certificate.serial ?? "",
    certificate.userDN ?? "",
    certificate.cn
  ].join("|");
}

function getCustomerOnestopCertificateLabel(certificate: RenewalAgentCertificate): string {
  return certificate.cn?.trim() || "이름 없는 인증서";
}

function buildCustomerOnestopCertificateRow(
  certificate: RenewalAgentCertificate,
  rowIndex: number,
  selected = true
): CustomerOnestopCertificateRow {
  const label = getCustomerOnestopCertificateLabel(certificate);
  return {
    rowIndex,
    certificate,
    certificateIndex: String(certificate.index ?? ""),
    certificateName: label,
    corpName: label,
    plantName: label,
    customerName: label,
    businessNumber: "",
    certificatePassword: "",
    selected,
    status: "unchecked",
    statusMessage: "",
    draft: null,
    result: null
  };
}

function mergeCustomerOnestopCertificateRows(
  rows: CustomerOnestopCertificateRow[],
  certificates: RenewalAgentCertificate[]
): CustomerOnestopCertificateRow[] {
  const mergedCertificates = mergeCustomerOnestopCertificates(
    rows.map((row) => row.certificate),
    certificates
  );
  let nextRowIndex = rows.reduce((max, row) => Math.max(max, row.rowIndex), 0) + 1;

  return mergedCertificates.map((certificate) => {
    const existingRow = rows.find(
      (row) => mergeCustomerOnestopCertificates([row.certificate], [certificate]).length === 1
    );
    if (!existingRow) {
      return buildCustomerOnestopCertificateRow(certificate, nextRowIndex++);
    }

    const currentKey = getCustomerOnestopCertificateKey(existingRow.certificate);
    const nextKey = getCustomerOnestopCertificateKey(certificate);
    if (currentKey === nextKey) {
      return existingRow;
    }

    const nextLabel = getCustomerOnestopCertificateLabel(certificate);
    const shouldResetReview = existingRow.status !== "registered";
    return {
      ...existingRow,
      certificate,
      certificateIndex: String(certificate.index ?? ""),
      certificateName: nextLabel,
      corpName: existingRow.corpName.trim() || nextLabel,
      plantName: existingRow.plantName.trim() || nextLabel,
      customerName: existingRow.customerName.trim() || nextLabel,
      status: shouldResetReview ? "unchecked" : existingRow.status,
      statusMessage: shouldResetReview ? "" : existingRow.statusMessage,
      draft: shouldResetReview ? null : existingRow.draft,
      result: shouldResetReview ? null : existingRow.result
    };
  });
}

function getCustomerOnestopRowLabel(row: CustomerOnestopCertificateRow): string {
  return row.draft?.corpName.trim() || row.corpName.trim() || row.certificateName.trim() || "공동인증서";
}

function getCustomerOnestopRowStatusLabel(row: CustomerOnestopCertificateRow): string {
  if (!row.selected) return "";
  switch (row.status) {
    case "checking":
      return "확인 중";
    case "ready":
      return "통과";
    case "needs_fix":
      return "수정 필요";
    case "registered":
      return "완료";
    case "failed":
      return "실패";
    case "unchecked":
    default:
      return "확인 전";
  }
}

function getCustomerOnestopRowStatusClass(row: CustomerOnestopCertificateRow): string {
  switch (row.status) {
    case "checking":
      return "status-checking";
    case "ready":
    case "registered":
      return "status-ready";
    case "needs_fix":
    case "failed":
      return "status-needs_fix";
    case "unchecked":
    default:
      return "status-unchecked";
  }
}

function isCustomerOnestopPasswordIssue(message: string): boolean {
  const normalized = message.replace(/\s+/g, "").toLowerCase();
  return normalized.includes("비밀번호") || normalized.includes("암호") || normalized.includes("password");
}

function formatCustomerOnestopHiddenCertificateSummary(
  filterResult: ReturnType<typeof filterCustomerOnestopCertificates>
): string {
  return [
    filterResult.hiddenExpiredCount > 0 ? `만료 ${filterResult.hiddenExpiredCount}건 제외` : "",
    filterResult.hiddenRegisteredCount > 0 ? `이미 등록된 고객 ${filterResult.hiddenRegisteredCount}건 제외` : ""
  ]
    .filter(Boolean)
    .join(", ");
}

function buildCustomerOnestopCertificateNotice(
  sourceLabel: string,
  certificates: RenewalAgentCertificate[],
  filterResult: ReturnType<typeof filterCustomerOnestopCertificates>
): string {
  const hiddenSummary = formatCustomerOnestopHiddenCertificateSummary(filterResult);
  const suffix = hiddenSummary ? ` (${hiddenSummary})` : "";
  if (filterResult.availableCertificates.length > 0) {
    return `${sourceLabel} 발행 가능 공동인증서 ${filterResult.availableCertificates.length}건을 표시합니다.${suffix}`;
  }
  if (certificates.length > 0) {
    return `${sourceLabel} 표시할 새 발행 가능 공동인증서가 없습니다.${suffix}`;
  }
  return `${sourceLabel} 발행 가능 공동인증서를 찾지 못했습니다.`;
}

function normalizeCustomerCertificateText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function isTaxInvoiceCertificate(certificate: CustomerCertificate): boolean {
  const usageText = normalizeCustomerCertificateText(certificate.certificateUsageName);
  const nameText = normalizeCustomerCertificateText(certificate.certificateName);
  return isIssueCapableCustomerCertificateKind(certificate.certificateKind) || usageText.includes("전자세금") || usageText.includes("세금계산서") || nameText.includes("전자세금");
}

function isNonElectronicTaxCustomerCertificate(certificate: CustomerCertificate): boolean {
  const usageText = normalizeCustomerCertificateText(certificate.certificateUsageName);
  const nameText = normalizeCustomerCertificateText(certificate.certificateName);
  return !isTaxInvoiceCertificate(certificate) && !usageText.includes("전자세금") && !nameText.includes("전자세금");
}

function getCustomerAutoCertificateStatus(
  certificates: CustomerCertificate[],
  predicate: (certificate: CustomerCertificate) => boolean
): CustomerStatusBadge {
  const certificate = certificates.find(predicate) ?? null;
  if (!certificate) {
    return { label: "미확인", tone: "default" };
  }

  return {
    label: "확인",
    tone: "success",
    detail: certificate.certificateUsageName || certificate.certificateName || undefined
  };
}

function isNonElectronicTaxCertificateKind(kind: CustomerCertificateKind): boolean {
  return !isIssueCapableCustomerCertificateKind(kind);
}

function getCustomerCertificateKindLabel(kind: CustomerCertificateKind): string {
  switch (kind) {
    case "electronic_tax":
      return "전자세금용";
    case "general_personal":
      return "개인 범용";
    case "general_business":
      return "기업 범용";
    default:
      return "용도 미상";
  }
}

function formatCustomerCertificateExpireDate(value: string | null | undefined): string {
  if (!value) return "만료일 -";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return `만료 ${value}`;
  return `만료 ${new Date(timestamp).toLocaleDateString("ko-KR")}`;
}

function formatCustomerCertificateDate(value: string | null | undefined): string {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString("ko-KR");
}

function formatCustomerCertificateExpireDateLabel(value: string | null | undefined): string {
  if (!value) return "만료일 미확인";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return `만료일 ${value}`;
  return `만료일 ${new Date(timestamp).toLocaleDateString("ko-KR")}`;
}

export function CustomersTab(props: CustomersTabProps) {
  const shouldReduceMotion = useReducedMotion();
  const selectedCustomer = props.selectedCustomer;
  const selectedCustomerReadiness = props.selectedCustomerReadiness;
  const visibleCustomerIssues = props.selectedCustomerIssues.filter((issue) => issue.tone !== "success" || Boolean(issue.actionLabel));
  const customerContractSummaryById = useMemo(
    () => new Map(props.contractSummaries.map((summary) => [summary.customerId, summary])),
    [props.contractSummaries]
  );
  const customerContractRenewalDueById = useMemo(
    () => new Map(props.contractRenewalDueItems.map((item) => [item.customerId, item])),
    [props.contractRenewalDueItems]
  );
  const [customerDetailPanelOpen, setCustomerDetailPanelOpen] = useState(false);
  const [customerTableViewportHeight, setCustomerTableViewportHeight] = useState<number | null>(null);
  const [checkedCustomerIds, setCheckedCustomerIds] = useState<Set<number>>(() => new Set());
  const [customerReportYear, setCustomerReportYear] = useState(getCurrentCustomerReportYear);
  const [customerHistoryDetailOpen, setCustomerHistoryDetailOpen] = useState(false);
  const [customerContractPeriods, setCustomerContractPeriods] = useState<CustomerContractPeriod[]>([]);
  const [customerContractPeriodsLoading, setCustomerContractPeriodsLoading] = useState(false);
  const [customerContractPeriodsError, setCustomerContractPeriodsError] = useState("");
  const [customerContractAddOpen, setCustomerContractAddOpen] = useState(false);
  const [customerContractAddForm, setCustomerContractAddForm] = useState({
    contractStartDate: "",
    contractEndDate: ""
  });
  const [customerContractAddError, setCustomerContractAddError] = useState("");
  const [customerContractAdding, setCustomerContractAdding] = useState(false);
  const [customerDetailEditing, setCustomerDetailEditing] = useState(false);
  const customerReportDetail = useCustomerReportDetail(selectedCustomer?.id ?? null, customerReportYear, {
    onSaved: props.onCustomerReportDetailSaved,
    autoSave: false
  });
  const [customerReportIssueDateDrafts, setCustomerReportIssueDateDrafts] = useState<Record<string, string>>({});
  const selectedCustomerIssuedDraftsSyncKey = useMemo(() => {
    if (!selectedCustomer) {
      return "";
    }
    return getCustomerReportIssuedDraftSyncKey(selectedCustomer.id, customerReportYear, props.selectedCustomerIssuedDrafts);
  }, [selectedCustomer?.id, customerReportYear, props.selectedCustomerIssuedDrafts]);
  const selectedCustomerIssuedDraftsSyncKeyRef = useRef("");
  const previousCustomerDetailTabRef = useRef<CustomerDetailTabId>("info");
  const customerMainColumnRef = useRef<HTMLDivElement | null>(null);
  const customerTableWrapRef = useRef<HTMLDivElement | null>(null);
  const customerOnestopFileInputRef = useRef<HTMLInputElement | null>(null);
  const customerOnestopFolderInputRef = useRef<HTMLInputElement | null>(null);
  const customerOnestopTableRef = useRef<HTMLDivElement | null>(null);
  const customerOnestopSelectAllInputRef = useRef<HTMLInputElement | null>(null);
  const [customerOnestopStep, setCustomerOnestopStep] = useState<CustomerOnestopStepId>("source");
  const [customerOnestopRows, setCustomerOnestopRows] = useState<CustomerOnestopCertificateRow[]>([]);
  const [customerOnestopCertificateSearchQuery, setCustomerOnestopCertificateSearchQuery] = useState("");
  const [customerOnestopFilter, setCustomerOnestopFilter] = useState<CustomerOnestopChecklistFilter>("all");
  const [customerOnestopBulkPassword, setCustomerOnestopBulkPassword] = useState("");
  const [customerOnestopBulkPasswordVisible, setCustomerOnestopBulkPasswordVisible] = useState(false);
  const [customerOnestopLastAnchorRowIndex, setCustomerOnestopLastAnchorRowIndex] = useState<number | null>(null);
  const [customerOnestopDragSelection, setCustomerOnestopDragSelection] = useState<CustomerOnestopDragSelection | null>(null);
  const customerOnestopRowMouseSelectionHandledRef = useRef(false);
  const [customerOnestopNotice, setCustomerOnestopNotice] = useState("");
  const [customerOnestopError, setCustomerOnestopError] = useState("");
  const [customerOnestopUploadSummary, setCustomerOnestopUploadSummary] = useState<LocalCertificateUploadSessionResult | null>(null);
  const [customerOnestopResult, setCustomerOnestopResult] = useState<CustomerOnestopBatchResult | null>(null);
  const [customerCertificateSelectorOpen, setCustomerCertificateSelectorOpen] = useState(false);
  const [customerCertificateSearchQuery, setCustomerCertificateSearchQuery] = useState("");
  const [customerCertificateSelectedKey, setCustomerCertificateSelectedKey] = useState<string | null>(null);
  const [customerCertificateActionNotice, setCustomerCertificateActionNotice] = useState("");
  const [customerCertificatePasswordDialog, setCustomerCertificatePasswordDialog] = useState<CustomerCertificatePasswordDialog | null>(null);
  const [customerCertificatePasswordInput, setCustomerCertificatePasswordInput] = useState("");

  useEffect(() => {
    if (props.creatingCustomer) {
      setCustomerDetailPanelOpen(true);
      props.setCustomerDetailTab("info");
    }
  }, [props.creatingCustomer, props.setCustomerDetailTab]);

  useEffect(() => {
    if (!props.creatingCustomer) {
      return;
    }

    setCustomerOnestopStep("source");
    setCustomerOnestopRows([]);
    setCustomerOnestopCertificateSearchQuery("");
    setCustomerOnestopFilter("all");
    setCustomerOnestopBulkPassword("");
    setCustomerOnestopBulkPasswordVisible(false);
    setCustomerOnestopLastAnchorRowIndex(null);
    setCustomerOnestopDragSelection(null);
    setCustomerOnestopNotice("");
    setCustomerOnestopError("");
    setCustomerOnestopUploadSummary(null);
    setCustomerOnestopResult(null);
  }, [props.creatingCustomer]);

  useEffect(() => {
    if (!props.creatingCustomer && !selectedCustomer) {
      setCustomerDetailPanelOpen(false);
    }
  }, [props.creatingCustomer, selectedCustomer]);

  useEffect(() => {
    if (selectedCustomer) {
      setCustomerDetailEditing(false);
      setCustomerHistoryDetailOpen(false);
      setCustomerContractPeriods([]);
      setCustomerContractPeriodsError("");
      setCustomerContractAddOpen(false);
      setCustomerContractAddForm({
        contractStartDate: "",
        contractEndDate: ""
      });
      setCustomerContractAddError("");
      setCustomerCertificateSelectorOpen(false);
      setCustomerCertificateSearchQuery("");
      setCustomerCertificateSelectedKey(null);
      setCustomerCertificateActionNotice("");
      setCustomerCertificatePasswordDialog(null);
      setCustomerCertificatePasswordInput("");
    }
  }, [selectedCustomer?.id]);

  useEffect(() => {
    if (!customerHistoryDetailOpen || !selectedCustomer) {
      return;
    }

    let cancelled = false;
    setCustomerContractPeriodsLoading(true);
    setCustomerContractPeriodsError("");
    void props.onLoadCustomerContractPeriods(selectedCustomer.id)
      .then((periods) => {
        if (!cancelled) {
          setCustomerContractPeriods(periods);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCustomerContractPeriodsError(error instanceof Error ? error.message : "계약 기간 상세정보를 불러오지 못했습니다.");
          setCustomerContractPeriods([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCustomerContractPeriodsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customerHistoryDetailOpen, selectedCustomer?.id]);

  useEffect(() => {
    setCustomerReportIssueDateDrafts({});
  }, [selectedCustomer?.id, customerReportYear]);

  useEffect(() => {
    if (!selectedCustomer) {
      selectedCustomerIssuedDraftsSyncKeyRef.current = "";
      previousCustomerDetailTabRef.current = props.customerDetailTab;
      return;
    }

    const isHistoryTab = props.customerDetailTab === "history";
    const wasHistoryTab = previousCustomerDetailTabRef.current === "history";
    const previousSyncKey = selectedCustomerIssuedDraftsSyncKeyRef.current;

    if (isHistoryTab && (previousSyncKey !== selectedCustomerIssuedDraftsSyncKey || !wasHistoryTab)) {
      void customerReportDetail.reload();
    }

    selectedCustomerIssuedDraftsSyncKeyRef.current = selectedCustomerIssuedDraftsSyncKey;
    previousCustomerDetailTabRef.current = props.customerDetailTab;
  }, [customerReportDetail, props.customerDetailTab, selectedCustomer?.id, selectedCustomerIssuedDraftsSyncKey]);

  useEffect(() => {
    const updateCustomerTableViewportHeight = () => {
      const mainColumnEl = customerMainColumnRef.current;
      const tableWrapEl = customerTableWrapRef.current;
      if (!mainColumnEl || !tableWrapEl) {
        return;
      }

      const tableWrapTop = tableWrapEl.getBoundingClientRect().top;
      const mainColumnStyles = window.getComputedStyle(mainColumnEl);
      const reservedBottomSpace = (parseFloat(mainColumnStyles.paddingBottom) || 0) + 24;
      const availableTableHeight = Math.max(
        320,
        Math.floor(window.innerHeight - tableWrapTop - reservedBottomSpace)
      );
      setCustomerTableViewportHeight((prev) => (prev === availableTableHeight ? prev : availableTableHeight));
    };

    const animationFrameId = window.requestAnimationFrame(updateCustomerTableViewportHeight);
    window.addEventListener("resize", updateCustomerTableViewportHeight);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => updateCustomerTableViewportHeight());
    if (customerTableWrapRef.current) {
      resizeObserver?.observe(customerTableWrapRef.current);
    }
    if (customerMainColumnRef.current) {
      resizeObserver?.observe(customerMainColumnRef.current);
    }

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updateCustomerTableViewportHeight);
      resizeObserver?.disconnect();
    };
  }, [customerDetailPanelOpen, props.creatingCustomer, props.filteredCustomers.length, selectedCustomer]);

  useEffect(() => {
    if (!customerDetailPanelOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (customerHistoryDetailOpen) {
        setCustomerHistoryDetailOpen(false);
        return;
      }
      if (customerCertificateSelectorOpen) {
        setCustomerCertificateSelectorOpen(false);
        setCustomerCertificateSelectedKey(null);
        return;
      }
      if (customerCertificatePasswordDialog) {
        setCustomerCertificatePasswordDialog(null);
        setCustomerCertificatePasswordInput("");
        return;
      }
      setCustomerDetailPanelOpen(false);
      if (props.creatingCustomer) {
        props.setCustomerDetailTab("info");
        props.onCancelCreateCustomer();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [
    customerCertificateSelectorOpen,
    customerCertificatePasswordDialog,
    customerDetailPanelOpen,
    customerHistoryDetailOpen,
    props.creatingCustomer,
    props.onCancelCreateCustomer,
    props.setCustomerDetailTab
  ]);

  const activeFilterCopy: Record<
    CustomerListFilter,
    {
      empty: string;
      body: string;
    }
  > = {
    all: {
      empty: "등록된 고객이 없습니다.",
      body: "새 고객부터 등록하세요."
    },
    unissued: {
      empty: "이번 달 미발행 고객이 없습니다.",
      body: "이번 달 세금계산서 발행은 모두 끝났습니다."
    },
    "certificate-expiration": {
      empty: "인증서 만료 예정 고객이 없습니다.",
      body: "만료됐거나 60일 미만으로 남은 인증서가 없습니다."
    },
    "contract-expiration": {
      empty: "계약 만료 예정 고객이 없습니다.",
      body: "계약 갱신 대상 고객이 없습니다."
    }
  };

  const getCustomerCertificateDays = (customer: Customer) => {
    const expireDateKey = normalizeCustomerCertificateExpireDateKey(customer.popbillCertExpireDate);
    const todayDateKey = getCustomerCertificateTodayDateKey();
    if (!expireDateKey) return null;
    const expireDate = new Date(`${expireDateKey}T00:00:00Z`);
    const todayDate = new Date(`${todayDateKey}T00:00:00Z`);
    const expireTime = expireDate.getTime();
    const todayTime = todayDate.getTime();
    if (!Number.isFinite(expireTime) || !Number.isFinite(todayTime)) return null;
    return Math.round((expireTime - todayTime) / (24 * 60 * 60 * 1000));
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
    return {
      title: activeFilterCopy[props.customerListFilter].empty,
      body: activeFilterCopy[props.customerListFilter].body
    };
  })();
  const selectedCustomerPrimaryIssue = visibleCustomerIssues.find((issue) => Boolean(issue.actionLabel)) ?? visibleCustomerIssues[0] ?? null;
  const hiddenResolvedIssueCount = props.selectedCustomerIssues.filter((issue) => issue.tone === "success" && !issue.actionLabel).length;
  const customerCertificateTodayDateKey = getCustomerCertificateTodayDateKey();
  const customerOnestopSearchMatchedRows = useMemo(
    () => getInitialRegistrationChecklistSearchMatches(customerOnestopRows, customerOnestopCertificateSearchQuery),
    [customerOnestopRows, customerOnestopCertificateSearchQuery]
  );
  const customerOnestopIssueRowIndexes = new Set(
    customerOnestopRows
      .filter((row) => row.selected && (row.status === "needs_fix" || row.status === "failed"))
      .map((row) => row.rowIndex)
  );
  const customerOnestopPasswordRowIndexes = new Set(
    customerOnestopRows
      .filter((row) => row.selected && (row.certificatePassword.trim() !== "" || row.status === "needs_fix"))
      .map((row) => row.rowIndex)
  );
  const customerOnestopVisibleRows = customerOnestopSearchMatchedRows.filter((row) => {
    if (customerOnestopFilter === "issues") {
      return customerOnestopIssueRowIndexes.has(row.rowIndex);
    }
    if (customerOnestopFilter === "password") {
      return customerOnestopPasswordRowIndexes.has(row.rowIndex);
    }
    return true;
  });
  const customerOnestopVisibleRowIndexes = customerOnestopVisibleRows.map((row) => row.rowIndex);
  const customerOnestopSelectedRows = customerOnestopRows.filter((row) => row.selected);
  const customerOnestopVisibleSelectedRows = customerOnestopVisibleRows.filter((row) => row.selected);
  const customerOnestopSelectedCount = customerOnestopSelectedRows.length;
  const customerOnestopVisibleSelectedCount = customerOnestopVisibleSelectedRows.length;
  const customerOnestopReadyRows = customerOnestopSelectedRows.filter((row) => row.status === "ready" && row.draft);
  const customerOnestopIssueCount = customerOnestopSelectedRows.filter((row) => row.status === "needs_fix" || row.status === "failed").length;
  const customerOnestopPasswordCount = customerOnestopRows.filter((row) => row.certificatePassword.trim() !== "").length;
  const allCustomerOnestopVisibleRowsSelected =
    customerOnestopVisibleRows.length > 0 &&
    customerOnestopVisibleRows.every((row) => row.selected);
  const customerOnestopVisibleSelectedPasswordRowIndexes = getInitialRegistrationPasswordClearRowIndexes(customerOnestopVisibleRows);
  const canClearCustomerOnestopVisibleSelectedPasswords =
    props.busyKey === null && customerOnestopVisibleSelectedPasswordRowIndexes.length > 0;
  const customerOnestopBulkPasswordReady = customerOnestopBulkPassword.trim() !== "";
  const customerOnestopSelectedRowsPasswordReady =
    customerOnestopSelectedCount > 0 &&
    (customerOnestopBulkPasswordReady ||
      customerOnestopSelectedRows.every((row) => row.certificatePassword.trim() !== ""));
  const customerOnestopCanReview =
    props.busyKey === null &&
    customerOnestopSelectedRowsPasswordReady;
  const customerOnestopCanExecute =
    props.busyKey === null &&
    customerOnestopSelectedCount > 0 &&
    customerOnestopReadyRows.length === customerOnestopSelectedCount &&
    customerOnestopIssueCount === 0;
  const customerOnestopPrimaryActionLabel =
    customerOnestopCanExecute
      ? "선택 고객 등록"
      : props.busyKey === "customer-add-preflight"
        ? "확인 중..."
        : "선택 고객 확인";
  const customerOnestopPrimaryActionTitle =
    customerOnestopSelectedCount === 0
      ? "등록할 인증서를 선택하세요."
      : !customerOnestopSelectedRowsPasswordReady
        ? "선택한 행에 비밀번호를 입력하세요."
        : customerOnestopIssueCount > 0
          ? "수정 필요 행을 고친 뒤 다시 확인하세요."
          : undefined;

  useEffect(() => {
    if (!customerOnestopSelectAllInputRef.current) {
      return;
    }
    customerOnestopSelectAllInputRef.current.indeterminate =
      customerOnestopVisibleSelectedCount > 0 &&
      customerOnestopVisibleSelectedCount < customerOnestopVisibleRows.length;
  }, [customerOnestopVisibleRows.length, customerOnestopVisibleSelectedCount]);

  useEffect(() => {
    if (customerOnestopFilter === "issues" && customerOnestopIssueRowIndexes.size === 0) {
      setCustomerOnestopFilter("all");
    }
    if (customerOnestopFilter === "password" && customerOnestopPasswordRowIndexes.size === 0) {
      setCustomerOnestopFilter("all");
    }
  }, [customerOnestopFilter, customerOnestopIssueRowIndexes.size, customerOnestopPasswordRowIndexes.size]);
  const getCustomerIssueHelpText = (issue: CustomerIssueChecklistItem) => {
    switch (issue.actionKind) {
      case "join-popbill":
        return "운영팀 확인이 필요합니다.";
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

  const closeDetailPanel = () => {
    setCustomerDetailPanelOpen(false);
    if (props.creatingCustomer) {
      props.setCustomerDetailTab("info");
      props.onCancelCreateCustomer();
    }
  };

  const handleCreateCustomer = () => {
    setCustomerDetailPanelOpen(true);
    props.setCustomerDetailTab("info");
    props.onCreateCustomer();
  };

  const patchCustomerOnestopRows = (
    rowIndexes: number[],
    updater: (row: CustomerOnestopCertificateRow) => CustomerOnestopCertificateRow
  ) => {
    const rowIndexSet = new Set(rowIndexes);
    setCustomerOnestopRows((prev) => prev.map((row) => (rowIndexSet.has(row.rowIndex) ? updater(row) : row)));
  };

  const updateCustomerOnestopRowsSelection = (rowIndexes: number[], selected: boolean) => {
    patchCustomerOnestopRows(rowIndexes, (row) => ({
      ...row,
      selected
    }));
  };

  const applyCustomerOnestopRowsPassword = (rowIndexes: number[], value: string) => {
    patchCustomerOnestopRows(rowIndexes, (row) => ({
      ...row,
      certificatePassword: value,
      status: row.status === "registered" ? row.status : "unchecked",
      statusMessage: "",
      draft: row.status === "registered" ? row.draft : null,
      result: row.status === "registered" ? row.result : null
    }));
  };

  const applyCustomerOnestopPasswordValues = (updates: Array<{ rowIndex: number; value: string }>) => {
    const valuesByRowIndex = new Map(updates.map((update) => [update.rowIndex, update.value]));
    setCustomerOnestopRows((prev) =>
      prev.map((row) => {
        if (!valuesByRowIndex.has(row.rowIndex)) {
          return row;
        }
        return {
          ...row,
          certificatePassword: valuesByRowIndex.get(row.rowIndex) ?? "",
          status: row.status === "registered" ? row.status : "unchecked",
          statusMessage: "",
          draft: row.status === "registered" ? row.draft : null,
          result: row.status === "registered" ? row.result : null
        };
      })
    );
  };

  const applyCustomerOnestopRowSelection = (
    row: CustomerOnestopCertificateRow,
    selected: boolean,
    event: { shiftKey: boolean }
  ) => {
    if (event.shiftKey) {
      window.getSelection()?.removeAllRanges();
    }
    const patch = getInitialRegistrationChecklistSelectionPatch(customerOnestopRows, {
      rowIndex: row.rowIndex,
      selected,
      anchorRowIndex: customerOnestopLastAnchorRowIndex,
      shiftKey: event.shiftKey
    });
    updateCustomerOnestopRowsSelection(patch.rowIndexes, patch.selected);
    setCustomerOnestopLastAnchorRowIndex(row.rowIndex);
  };

  const isCustomerOnestopRowInteractiveTarget = (target: EventTarget | null) => {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest("input, button, a, textarea, select, label, summary"))
    );
  };

  const applyPasswordFromCustomerOnestopCell = (row: CustomerOnestopCertificateRow, value: string) => {
    const rowInVisibleSelection =
      row.selected === true &&
      customerOnestopVisibleSelectedRows.some((visibleRow) => visibleRow.rowIndex === row.rowIndex) &&
      customerOnestopVisibleSelectedRows.length > 1;
    applyCustomerOnestopRowsPassword(
      rowInVisibleSelection ? customerOnestopVisibleSelectedRows.map((visibleRow) => visibleRow.rowIndex) : [row.rowIndex],
      value
    );
  };

  const applyCustomerOnestopPasswordPaste = (
    text: string,
    startRowIndex: number | null,
    selectedRowIndexes: number[]
  ) => {
    const updates = buildInitialRegistrationPasswordPasteUpdates({
      rows: customerOnestopVisibleRows,
      selectedRowIndexes,
      startRowIndex,
      text
    });
    if (updates.length === 0) {
      return false;
    }

    applyCustomerOnestopPasswordValues(updates);
    return true;
  };

  const handleCustomerOnestopTablePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (props.busyKey !== null || customerOnestopVisibleSelectedRows.length === 0) {
      return;
    }
    if (isCustomerOnestopRowInteractiveTarget(event.target)) {
      return;
    }
    const text = event.clipboardData.getData("text");
    if (!applyCustomerOnestopPasswordPaste(
      text,
      null,
      customerOnestopVisibleSelectedRows.map((row) => row.rowIndex)
    )) {
      return;
    }
    event.preventDefault();
  };

  const handleCustomerOnestopPasswordPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    row: CustomerOnestopCertificateRow
  ) => {
    if (props.busyKey !== null) {
      return;
    }
    const selectedTargets =
      row.selected === true && customerOnestopVisibleSelectedRows.length > 1
        ? customerOnestopVisibleSelectedRows.map((visibleRow) => visibleRow.rowIndex)
        : [];
    const text = event.clipboardData.getData("text");
    if (!applyCustomerOnestopPasswordPaste(text, row.rowIndex, selectedTargets)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const clearCustomerOnestopVisibleSelectedPasswords = () => {
    if (!canClearCustomerOnestopVisibleSelectedPasswords) {
      return;
    }
    applyCustomerOnestopRowsPassword(customerOnestopVisibleSelectedPasswordRowIndexes, "");
    customerOnestopTableRef.current?.focus({ preventScroll: true });
  };

  const handleCustomerOnestopTableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Delete" || props.busyKey !== null || isCustomerOnestopRowInteractiveTarget(event.target)) {
      return;
    }
    if (!canClearCustomerOnestopVisibleSelectedPasswords) {
      return;
    }

    event.preventDefault();
    clearCustomerOnestopVisibleSelectedPasswords();
  };

  const beginCustomerOnestopRowMouseSelection = (
    row: CustomerOnestopCertificateRow,
    rowSelected: boolean,
    event: React.MouseEvent<HTMLTableRowElement>
  ) => {
    if (
      props.busyKey !== null ||
      event.button !== 0 ||
      isCustomerOnestopRowInteractiveTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    customerOnestopTableRef.current?.focus({ preventScroll: true });
    customerOnestopRowMouseSelectionHandledRef.current = true;
    const nextSelected = !rowSelected;
    if (event.shiftKey) {
      applyCustomerOnestopRowSelection(row, nextSelected, event);
      setCustomerOnestopDragSelection(null);
      return;
    }

    const initialSelectedRowIndexes = customerOnestopVisibleRows
      .filter((visibleRow) => visibleRow.selected === true)
      .map((visibleRow) => visibleRow.rowIndex);
    updateCustomerOnestopRowsSelection([row.rowIndex], nextSelected);
    setCustomerOnestopLastAnchorRowIndex(row.rowIndex);
    setCustomerOnestopDragSelection({
      selected: nextSelected,
      anchorRowIndex: row.rowIndex,
      lastRowIndex: row.rowIndex,
      initialSelectedRowIndexes
    });
  };

  const extendCustomerOnestopRowMouseSelection = (row: CustomerOnestopCertificateRow) => {
    if (
      !customerOnestopDragSelection ||
      props.busyKey !== null ||
      customerOnestopDragSelection.lastRowIndex === row.rowIndex
    ) {
      return;
    }

    const patch = getInitialRegistrationChecklistDragSelectionPatch(customerOnestopVisibleRows, {
      anchorRowIndex: customerOnestopDragSelection.anchorRowIndex,
      currentRowIndex: row.rowIndex,
      selected: customerOnestopDragSelection.selected,
      initialSelectedRowIndexes: customerOnestopDragSelection.initialSelectedRowIndexes
    });
    if (patch.selectedRowIndexes.length > 0) {
      updateCustomerOnestopRowsSelection(patch.selectedRowIndexes, true);
    }
    if (patch.deselectedRowIndexes.length > 0) {
      updateCustomerOnestopRowsSelection(patch.deselectedRowIndexes, false);
    }
    setCustomerOnestopLastAnchorRowIndex(row.rowIndex);
    setCustomerOnestopDragSelection({ ...customerOnestopDragSelection, lastRowIndex: row.rowIndex });
  };

  const deleteSelectedCustomerOnestopRows = () => {
    if (customerOnestopSelectedCount === 0 || props.busyKey !== null) {
      return;
    }
    setCustomerOnestopRows((prev) => prev.filter((row) => !row.selected));
    setCustomerOnestopNotice(`선택한 인증서 ${customerOnestopSelectedCount}건을 목록에서 삭제했습니다.`);
  };

  const appendCustomerOnestopCertificates = (
    sourceLabel: string,
    certificates: RenewalAgentCertificate[],
    options?: { uploadSummary?: LocalCertificateUploadSessionResult | null }
  ) => {
    const filterResult = filterCustomerOnestopCertificates({
      certificates,
      customers: props.customers,
      customerCertificates: props.customerCertificates,
      todayDateKey: customerCertificateTodayDateKey
    });
    setCustomerOnestopRows((prev) => mergeCustomerOnestopCertificateRows(prev, filterResult.availableCertificates));
    setCustomerOnestopCertificateSearchQuery("");
    setCustomerOnestopUploadSummary(options?.uploadSummary ?? null);
    setCustomerOnestopNotice(buildCustomerOnestopCertificateNotice(sourceLabel, certificates, filterResult));
  };

  const readCustomerOnestopCertificates = () => {
    void props.runAction(
      "customer-add-read-certificates",
      async () => {
        try {
          setCustomerOnestopError("");
          const certificates = await props.onLoadCustomerRenewalCertificates();
          appendCustomerOnestopCertificates("공동인증서 저장소에서", certificates);
        } catch (error) {
          setCustomerOnestopError(getCustomerOnestopErrorMessage(error, "공동인증서를 읽지 못했습니다."));
        }
      },
      { reload: false }
    );
  };

  const uploadCustomerOnestopFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    void props.runAction(
      "customer-add-upload-certificates",
      async () => {
        try {
          setCustomerOnestopError("");
          const result = await props.onUploadCustomerAddCertificateFiles(files);
          const certificates = result.certificates as RenewalAgentCertificate[];
          appendCustomerOnestopCertificates("선택한 파일/폴더에서", certificates, { uploadSummary: result });
        } catch (error) {
          setCustomerOnestopError(getCustomerOnestopErrorMessage(error, "인증서 파일을 읽지 못했습니다."));
        }
      },
      { reload: false }
    );
  };

  const handleCustomerOnestopUploadInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    uploadCustomerOnestopFiles(files);
  };

  const reviewSelectedCustomerOnestopRows = () => {
    if (!customerOnestopCanReview) {
      setCustomerOnestopError(customerOnestopPrimaryActionTitle || "선택한 행을 확인할 수 없습니다.");
      return;
    }

    void props.runAction(
      "customer-add-preflight",
      async () => {
        try {
          setCustomerOnestopError("");
          const targets = customerOnestopRows.filter((row) => row.selected);
          const targetRowIndexes = targets.map((row) => row.rowIndex);
          const sharedPassword = customerOnestopBulkPassword.trim();
          patchCustomerOnestopRows(targetRowIndexes, (current) => ({
            ...current,
            certificatePassword: current.certificatePassword.trim() || sharedPassword,
            status: "checking",
            statusMessage: "확인 중",
            draft: null,
            result: null
          }));

          const reviewResult = await props.onReviewCustomerCertificateOnestopTargets({
            sharedPassword,
            targets: targets.map((row) => ({
              rowIndex: row.rowIndex,
              certificate: row.certificate,
              certificateIndex: row.certificateIndex,
              certificateName: row.certificateName,
              certificatePassword: row.certificatePassword.trim(),
              corpName: row.corpName,
              plantName: row.plantName,
              customerName: row.customerName,
              businessNumber: row.businessNumber
            })),
            onProgress: (message) => {
              setCustomerOnestopNotice(message);
            }
          });
          const reviewedRowsByIndex = new Map(reviewResult.rows.map((row) => [row.rowIndex, row]));
          setCustomerOnestopRows((currentRows) =>
            currentRows.map((row) => {
              if (!targetRowIndexes.includes(row.rowIndex)) {
                return row;
              }
              const reviewedRow = reviewedRowsByIndex.get(row.rowIndex);
              const certificatePassword = row.certificatePassword.trim() || sharedPassword;
              if (!reviewedRow || reviewedRow.status !== "ready" || !reviewedRow.draft) {
                return {
                  ...row,
                  certificatePassword,
                  status: "needs_fix",
                  statusMessage: reviewedRow?.message ?? "사업자정보를 확인하지 못했습니다.",
                  draft: null,
                  result: null
                };
              }

              const certificate = reviewedRow.certificate ?? row.certificate;
              const draft = reviewedRow.draft;
              return {
                ...row,
                certificate,
                certificateIndex: String(certificate.index ?? row.certificateIndex),
                certificateName: getCustomerOnestopCertificateLabel(certificate),
                corpName: draft.corpName || getCustomerOnestopCertificateLabel(certificate),
                plantName: draft.corpName || row.plantName,
                customerName: draft.customerName || row.customerName,
                businessNumber: draft.businessNumber || row.businessNumber,
                certificatePassword,
                status: "ready",
                statusMessage: reviewedRow.message,
                draft,
                result: null
              };
            })
          );
          setCustomerOnestopFilter(reviewResult.failedCount > 0 ? "issues" : "all");
          setCustomerOnestopNotice(
            reviewResult.failedCount > 0
              ? `확인 필요 ${reviewResult.failedCount}건이 있습니다. 비밀번호를 수정한 뒤 다시 확인하세요.`
              : `선택한 인증서 ${reviewResult.resolvedCount}건을 확인했습니다. 선택 고객 등록을 실행하세요.`
          );
        } catch (error) {
          setCustomerOnestopError(getCustomerOnestopErrorMessage(error, "고객 기본값을 읽지 못했습니다."));
        }
      },
      { reload: false }
    );
  };

  const executeCustomerOnestopRegistration = () => {
    if (!customerOnestopCanExecute) {
      setCustomerOnestopError(customerOnestopPrimaryActionTitle || "등록할 수 있는 행이 없습니다.");
      return;
    }

    void props.runAction(
      "customer-add-onestop",
      async () => {
        try {
          setCustomerOnestopError("");
          const targets = customerOnestopRows.filter((row) => row.selected && row.status === "ready" && row.draft);
          const items: CustomerOnestopBatchResult["items"] = [];
          for (const row of targets) {
            try {
              const result = await props.onExecuteCustomerCertificateOnestop({
                certificate: row.certificate,
                draft: row.draft!,
                certificatePassword: row.certificatePassword
              });
              items.push({
                rowIndex: row.rowIndex,
                label: getCustomerOnestopRowLabel(row),
                status: "success",
                message: "등록을 완료했습니다.",
                result
              });
              patchCustomerOnestopRows([row.rowIndex], (current) => ({
                ...current,
                status: "registered",
                statusMessage: "등록 완료",
                result
              }));
            } catch (error) {
              const message = getCustomerOnestopErrorMessage(error, "고객 등록에 실패했습니다.");
              items.push({
                rowIndex: row.rowIndex,
                label: getCustomerOnestopRowLabel(row),
                status: "failed",
                message
              });
              patchCustomerOnestopRows([row.rowIndex], (current) => ({
                ...current,
                status: "failed",
                statusMessage: message,
                result: null
              }));
            }
          }
          setCustomerOnestopResult({
            total: targets.length,
            completed: items.filter((item) => item.status === "success").length,
            failed: items.filter((item) => item.status === "failed").length,
            items
          });
          setCustomerOnestopNotice("등록 실행 결과를 확인하세요.");
          setCustomerOnestopStep("result");
        } catch (error) {
          setCustomerOnestopError(getCustomerOnestopErrorMessage(error, "고객 원스톱 등록에 실패했습니다."));
        }
      },
      { reload: false }
    );
  };

  const runCustomerOnestopPrimaryAction = () => {
    if (customerOnestopCanExecute) {
      executeCustomerOnestopRegistration();
      return;
    }
    reviewSelectedCustomerOnestopRows();
  };

  const focusCustomer = (customer: Customer) => {
    setCustomerDetailPanelOpen(true);
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
      return { label: "열기", kind: "open-detail" };
    }
    if (!customer.popbillCertRegistered) {
      return { label: "등록", kind: "register-certificate" };
    }
    if (days !== null && days < 60) {
      return { label: "점검", kind: "check-certificate" };
    }

    return { label: "열기", kind: "open-detail" };
  };

  const runCustomerPrimaryAction = (customer: Customer, action: CustomerPrimaryAction) => {
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
      ? selectedCustomerPrimaryIssue?.actionKind && selectedCustomerPrimaryIssue.actionKind !== "join-popbill"
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
  const detailPanelIssues = visibleCustomerIssues.filter((issue) => issue.key !== selectedCustomerPrimaryIssue?.key);

  const getCustomerCertificateStatus = (customer: Customer): CustomerStatusBadge => {
    const days = getCustomerCertificateDays(customer);

    if (customer.popbillState !== "joined") {
      return {
        label: "미확인",
        tone: "default"
      };
    }
    if (!customer.popbillCertRegistered) {
      return {
        label: "미등록",
        tone: "warn"
      };
    }
    if (days !== null && days <= 0) {
      return {
        label: "만료",
        tone: "danger",
        detail: props.formatCertificateExpireDate(customer.popbillCertExpireDate)
      };
    }
    if (days !== null && days < 60) {
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
  const getLatestIssuedDraftForCustomer = (customerId: number) => props.issuedDraftsByCustomerId.get(customerId)?.[0] ?? null;
  const currentBillingMonth = getCurrentSeoulBillingMonth();
  const selectedCustomerIssueMonthQuery = /^\d{4}-\d{2}$/.test(props.customerIssueMonthQuery)
    ? props.customerIssueMonthQuery
    : "";
  const issuedThisMonthCustomerIds = useMemo(() => {
    const customerIds = new Set<number>();
    if (!currentBillingMonth) return customerIds;
    props.issuedDraftsByCustomerId.forEach((drafts, customerId) => {
      if (drafts.some((draft) => draft.billingMonth === currentBillingMonth)) {
        customerIds.add(customerId);
      }
    });
    return customerIds;
  }, [currentBillingMonth, props.issuedDraftsByCustomerId]);

  useEffect(() => {
    if (props.customerIssueMonthQuery && !/^\d{4}-\d{2}$/.test(props.customerIssueMonthQuery)) {
      props.setCustomerIssueMonthQuery("");
    }
  }, [props.customerIssueMonthQuery, props.setCustomerIssueMonthQuery]);

  const unissuedThisMonthCustomerCount = props.customers.filter((customer) => !issuedThisMonthCustomerIds.has(customer.id)).length;
  const certificateExpirationCustomerCount = props.expiredCertCustomers.length + props.expiringSoonCustomerCount;
  const visibleTableCustomers = props.filteredCustomers;
  const visibleCustomerIdSet = useMemo(() => new Set(visibleTableCustomers.map((customer) => customer.id)), [visibleTableCustomers]);
  const customerListPanelStyle =
    customerTableViewportHeight !== null
      ? ({
          "--customer-list-panel-min-height": `${customerTableViewportHeight + 27}px`,
          "--customer-table-viewport-height": `${customerTableViewportHeight}px`
        } as React.CSSProperties)
      : undefined;
  const checkedVisibleCustomers = useMemo(
    () => visibleTableCustomers.filter((customer) => checkedCustomerIds.has(customer.id)),
    [checkedCustomerIds, visibleTableCustomers]
  );
  const checkedVisibleCustomerCount = checkedVisibleCustomers.length;
  const allVisibleCustomersChecked = visibleTableCustomers.length > 0 && checkedVisibleCustomerCount === visibleTableCustomers.length;
  const someVisibleCustomersChecked = checkedVisibleCustomerCount > 0 && !allVisibleCustomersChecked;

  useEffect(() => {
    setCheckedCustomerIds((prev) => {
      let changed = false;
      const next = new Set<number>();

      prev.forEach((customerId) => {
        if (visibleCustomerIdSet.has(customerId)) {
          next.add(customerId);
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [visibleCustomerIdSet]);

  const toggleVisibleCustomersChecked = () => {
    setCheckedCustomerIds((prev) => {
      const next = new Set(prev);

      if (allVisibleCustomersChecked) {
        visibleTableCustomers.forEach((customer) => next.delete(customer.id));
      } else {
        visibleTableCustomers.forEach((customer) => next.add(customer.id));
      }

      return next;
    });
  };

  const toggleCustomerChecked = (customerId: number) => {
    setCheckedCustomerIds((prev) => {
      const next = new Set(prev);

      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }

      return next;
    });
  };

  const checkOnlyCustomer = (customerId: number) => {
    setCheckedCustomerIds((prev) => {
      if (prev.size === 1 && prev.has(customerId)) {
        return prev;
      }
      return new Set([customerId]);
    });
  };

  const handleCustomerRowClick = (event: React.MouseEvent<HTMLTableRowElement>, customer: Customer) => {
    if (event.ctrlKey || event.metaKey) {
      toggleCustomerChecked(customer.id);
    } else {
      checkOnlyCustomer(customer.id);
    }
    focusCustomer(customer);
  };

  const exportSelectedCustomersWorkbook = () => {
    if (checkedVisibleCustomers.length === 0) {
      return;
    }

    void props.runAction(
      "customers-export-selected",
      async () => props.onExportSelectedCustomers(checkedVisibleCustomers, customerReportYear),
      { reload: false }
    );
  };

  const selectedCustomerCertificateStatus = selectedCustomer ? getCustomerCertificateStatus(selectedCustomer) : null;
  const selectedCustomerCertificates = selectedCustomer
    ? props.customerCertificates.filter((certificate) => certificate.customerId === selectedCustomer.id)
    : [];
  const selectedCustomerGeneralCertificateStatus = getCustomerAutoCertificateStatus(
    selectedCustomerCertificates,
    isNonElectronicTaxCustomerCertificate
  );
  const selectedCustomerCertificateItems = selectedCustomer
    ? props.customerCertificateItems.filter((item) => item.linkedCustomerId === selectedCustomer.id)
    : [];
  const selectedCustomerElectronicTaxCertificate =
    selectedCustomerCertificateItems.find((item) => isIssueCapableCustomerCertificateKind(item.certificateKind)) ?? null;
  const selectedCustomerGeneralCertificate =
    selectedCustomerCertificateItems.find((item) => isNonElectronicTaxCertificateKind(item.certificateKind)) ?? null;
  const selectedCustomerElectronicTaxCertificateFallback =
    selectedCustomerCertificateStatus?.detail && selectedCustomerCertificateStatus.detail !== "-"
      ? `만료일 ${selectedCustomerCertificateStatus.detail}`
      : "만료일 미확인";
  const customerCertificateHelperVersionMismatch =
    props.customerRenewalAssistantUpgradeState === "upgrade-required" ||
    props.customerRenewalAssistantUpgradeState === "upgrade-available";
  const customerCertificateHelperUnavailable =
    !props.canUseCustomerRenewalAssistant ||
    !props.customerRenewalAssistantOnline ||
    customerCertificateHelperVersionMismatch;
  const customerCertificateHelperMessage = !props.canUseCustomerRenewalAssistant
    ? "편집 권한이 있는 사용자만 공동인증서 작업을 실행할 수 있습니다."
    : customerCertificateHelperVersionMismatch
      ? props.customerRenewalAssistantUpgradeMessage || "AT 헬퍼를 업데이트한 뒤 다시 시도하세요."
      : !props.customerRenewalAssistantOnline
        ? props.customerRenewalAssistantHelperMessage || "고객 PC에서 AT 헬퍼를 실행하세요."
        : "";
  const selectedCustomerElectronicTaxCertificateActionVisible =
    Boolean(selectedCustomerElectronicTaxCertificate) &&
    (selectedCustomerElectronicTaxCertificate?.canOpenPayment ||
      selectedCustomerCertificateStatus?.tone === "warn" ||
      selectedCustomerCertificateStatus?.tone === "danger" ||
      selectedCustomerElectronicTaxCertificate?.statusTone === "warn" ||
      selectedCustomerElectronicTaxCertificate?.statusTone === "danger");
  const selectedCustomerElectronicTaxCertificateActionBusyKey = selectedCustomerElectronicTaxCertificate?.canOpenPayment
    ? `customer-certificate-payment-${selectedCustomerElectronicTaxCertificate.certificateIndex}`
    : `customer-certificate-prepare-${selectedCustomerElectronicTaxCertificate?.certificateIndex ?? ""}`;
  const selectedCustomerElectronicTaxCertificateActionDisabled =
    props.busyKey !== null ||
    !selectedCustomerElectronicTaxCertificate ||
    !props.canUseCustomerRenewalAssistant ||
    customerCertificateHelperVersionMismatch;
  const selectedCustomerElectronicTaxCertificateActionTitle = !props.canUseCustomerRenewalAssistant
    ? customerCertificateHelperMessage
    : customerCertificateHelperVersionMismatch
      ? customerCertificateHelperMessage
      : !props.customerRenewalAssistantOnline
        ? "클릭하면 AT 헬퍼 연결 확인과 공동인증서 확인을 먼저 시도합니다."
        : selectedCustomerElectronicTaxCertificate?.certificateIndex.startsWith("stored:")
          ? "클릭하면 이 PC의 공동인증서를 다시 읽고 갱신을 진행합니다."
          : undefined;
  const unlinkedCustomerCertificateItems = props.customerCertificateItems.filter(
    (item) =>
      item.linkedCustomerId === null &&
      isNonElectronicTaxCertificateKind(item.certificateKind) &&
      !isCustomerCertificateExpired(item.certificateExpireDate, customerCertificateTodayDateKey)
  );
  const visibleCustomerCertificateCandidates = unlinkedCustomerCertificateItems
    .filter((item) => {
      return matchesAnySearchText(customerCertificateSearchQuery, [
        item.certificateCn,
        item.certificateUsage,
        item.issuerName,
        item.suggestedCustomerLabel,
        getCustomerCertificateKindLabel(item.certificateKind)
      ]);
    })
    .sort((left, right) => {
      if (selectedCustomer) {
        const leftSuggested = left.suggestedCustomerId === selectedCustomer.id ? 0 : 1;
        const rightSuggested = right.suggestedCustomerId === selectedCustomer.id ? 0 : 1;
        if (leftSuggested !== rightSuggested) return leftSuggested - rightSuggested;
      }
      return left.certificateCn.localeCompare(right.certificateCn, "ko");
    });
  const selectedCustomerCertificateCandidate =
    visibleCustomerCertificateCandidates.find((item) => item.key === customerCertificateSelectedKey) ?? null;

  const loadCustomerCertificateCandidates = () => {
    void props.runAction(
      "customer-renewal-bridge-probe",
      async () => {
        await props.onRefreshCustomerRenewalAssistant();
        await props.onLoadCustomerRenewalCertificates();
      },
      { reload: false }
    );
  };

  const openCustomerCertificateSelector = () => {
    setCustomerCertificateSelectorOpen(true);
    setCustomerCertificateActionNotice("");
    setCustomerCertificateSelectedKey(null);
    loadCustomerCertificateCandidates();
  };

  const closeCustomerCertificateSelector = () => {
    setCustomerCertificateSelectorOpen(false);
    setCustomerCertificateSelectedKey(null);
  };

  const linkSelectedCustomerCertificateCandidate = () => {
    if (!selectedCustomer || !selectedCustomerCertificateCandidate) {
      return;
    }

    void props.runAction(
      `customer-certificate-link-${selectedCustomerCertificateCandidate.certificateIndex}`,
      async () => {
        await props.onLinkCustomerCertificate(selectedCustomerCertificateCandidate.certificateIndex, selectedCustomer.id);
        setCustomerCertificateSelectorOpen(false);
        setCustomerCertificateSelectedKey(null);
        setCustomerCertificateActionNotice("범용 공동인증서를 고객에 연결했습니다.");
      }
    );
  };

  const openCustomerCertificatePasswordDialog = (
    action: CustomerCertificatePasswordDialog["action"],
    certificate: CustomerCertificateCandidateView | null,
    certificateKindLabel: string,
    fallbackExpireLabel: string
  ) => {
    if (!certificate) {
      return;
    }

    setCustomerCertificatePasswordInput("");
    setCustomerCertificatePasswordDialog({
      action,
      certificateIndex: certificate.certificateIndex,
      certificateName: certificate.certificateCn || `${certificateKindLabel} 공동인증서`,
      certificateKindLabel,
      expireLabel: certificate.certificateExpireDate
        ? formatCustomerCertificateExpireDateLabel(certificate.certificateExpireDate)
        : fallbackExpireLabel
    });
  };

  const closeCustomerCertificatePasswordDialog = () => {
    setCustomerCertificatePasswordDialog(null);
    setCustomerCertificatePasswordInput("");
  };

  const runCustomerCertificatePasswordAction = (
    dialog: CustomerCertificatePasswordDialog,
    certificatePassword: string
  ) => {
    const certificateIsStored = dialog.certificateIndex.startsWith("stored:");

    void props.runAction(
      `customer-certificate-${dialog.action}-${dialog.certificateIndex}`,
      async () => {
        if (!props.customerRenewalAssistantOnline || certificateIsStored) {
          setCustomerCertificateActionNotice("AT 헬퍼 연결과 공동인증서 저장소를 확인하는 중입니다.");
          await props.onRefreshCustomerRenewalAssistant().catch(() => undefined);
          await props.onLoadCustomerRenewalCertificates().catch(() => undefined);
        }

        if (dialog.action === "payment") {
          await props.onOpenCustomerCertificatePayment(dialog.certificateIndex, {
            showAlert: false,
            certificatePassword
          });
          setCustomerCertificateActionNotice(`${dialog.certificateKindLabel} 인증서 결제 창을 열었습니다. 결제를 마치고 고객 탭으로 돌아오세요.`);
          return;
        }

        await props.onPrepareCustomerCertificateRenewal(dialog.certificateIndex, {
          showAlert: false,
          certificatePassword
        });
        setCustomerCertificateActionNotice(`${dialog.certificateKindLabel} 인증서 갱신 준비가 완료됐습니다. 결제를 이어서 실행하세요.`);
      },
      { reload: false }
    );

    setCustomerCertificatePasswordDialog(null);
    setCustomerCertificatePasswordInput("");
  };

  const submitCustomerCertificatePasswordDialog = () => {
    if (!customerCertificatePasswordDialog || customerCertificatePasswordInput.trim() === "") {
      return;
    }

    runCustomerCertificatePasswordAction(customerCertificatePasswordDialog, customerCertificatePasswordInput);
  };

  const prepareSelectedCustomerGeneralCertificateRenewal = () => {
    openCustomerCertificatePasswordDialog(
      "prepare",
      selectedCustomerGeneralCertificate,
      "범용",
      selectedCustomerGeneralCertificateStatus.detail || "만료일 미확인"
    );
  };

  const prepareSelectedCustomerElectronicTaxCertificateRenewal = () => {
    openCustomerCertificatePasswordDialog(
      "prepare",
      selectedCustomerElectronicTaxCertificate,
      "전자세금용",
      selectedCustomerElectronicTaxCertificateFallback
    );
  };

  const openSelectedCustomerGeneralCertificatePayment = () => {
    openCustomerCertificatePasswordDialog(
      "payment",
      selectedCustomerGeneralCertificate,
      "범용",
      selectedCustomerGeneralCertificateStatus.detail || "만료일 미확인"
    );
  };

  const openSelectedCustomerElectronicTaxCertificatePayment = () => {
    openCustomerCertificatePasswordDialog(
      "payment",
      selectedCustomerElectronicTaxCertificate,
      "전자세금용",
      selectedCustomerElectronicTaxCertificateFallback
    );
  };

  const openCustomerHistoryDetail = () => {
    setCustomerContractAddOpen(false);
    setCustomerContractAddError("");
    setCustomerHistoryDetailOpen(true);
  };

  const renderCustomerCertificateMeta = (
    item: CustomerCertificateCandidateView | null,
    fallback: string,
    expireDateFallback?: string
  ) => {
    if (!item) {
      return <small>{fallback}</small>;
    }

    return (
      <small>
        {item.certificateCn || "이름 없는 인증서"} ·{" "}
        {item.certificateExpireDate ? formatCustomerCertificateExpireDate(item.certificateExpireDate) : expireDateFallback ?? "만료일 미확인"}
      </small>
    );
  };

  const renderCustomerCertificateExpireMeta = (item: CustomerCertificateCandidateView | null, fallback: string) => (
    <small>{item?.certificateExpireDate ? formatCustomerCertificateExpireDateLabel(item.certificateExpireDate) : fallback}</small>
  );

  const renderCustomerCertificateSelector = () => {
    if (!customerCertificateSelectorOpen || !selectedCustomer) {
      return null;
    }

    const selectorTitle = selectedCustomerGeneralCertificate ? "범용 인증서 교체" : "범용 인증서 등록";

    return (
      <div
        className="customer-certificate-selector-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeCustomerCertificateSelector();
          }
        }}
      >
        <section
          className="customer-certificate-selector-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-certificate-selector-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="customer-certificate-selector" aria-label="범용 인증서 선택">
            <div className="customer-certificate-selector-head">
              <div>
                <strong id="customer-certificate-selector-title">{selectorTitle}</strong>
                <span>
                  {selectedCustomer.corpName || selectedCustomer.customerName} 고객에 연결할 만료되지 않은 PC 공동인증서를 고릅니다.
                </span>
              </div>
              <button type="button" className="btn-ghost" onClick={closeCustomerCertificateSelector}>
                닫기
              </button>
            </div>
            <div className="customer-certificate-selector-controls">
              <input
                type="text"
                value={customerCertificateSearchQuery}
                onChange={(event) => setCustomerCertificateSearchQuery(event.target.value)}
                placeholder="인증서명, 용도, 발급기관 검색"
                aria-label="범용 인증서 검색"
              />
            </div>
            {customerCertificateHelperMessage ? (
              <div className="customer-certificate-inline-alert">
                <span>{customerCertificateHelperMessage}</span>
                {customerCertificateHelperVersionMismatch || !props.customerRenewalAssistantOnline ? (
                  <button type="button" className="btn-secondary" onClick={() => window.location.assign(props.renewalHelperDownloadUrl)}>
                    AT 헬퍼 다운로드
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="customer-certificate-candidate-table" aria-label="연결 가능한 범용 인증서">
              <div className="customer-certificate-candidate-head" aria-hidden="true">
                <span>인증서명</span>
                <span>용도</span>
                <span>발급기관</span>
                <span>만료일</span>
                <span>추천</span>
              </div>
              <div className="customer-certificate-candidate-list">
                {visibleCustomerCertificateCandidates.length > 0 ? (
                  visibleCustomerCertificateCandidates.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={customerCertificateSelectedKey === item.key ? "active" : ""}
                      disabled={props.busyKey !== null}
                      onClick={() => setCustomerCertificateSelectedKey(item.key)}
                    >
                      <span className="customer-certificate-candidate-name">
                        <strong>{item.certificateCn || "이름 없는 인증서"}</strong>
                      </span>
                      <span>{item.certificateUsage || "비전자세금용"}</span>
                      <span>{item.issuerName || "-"}</span>
                      <span>{formatCustomerCertificateDate(item.certificateExpireDate)}</span>
                      {item.suggestedCustomerId === selectedCustomer.id ? <em>추천</em> : <span>-</span>}
                    </button>
                  ))
                ) : (
                  <div className="customer-certificate-empty">
                    <strong>연결 가능한 범용 인증서가 없습니다.</strong>
                    <span>만료되지 않은 PC 인증서를 다시 읽거나 검색어를 확인하세요.</span>
                  </div>
                )}
              </div>
            </div>
            <div className="customer-certificate-selector-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={props.busyKey !== null || customerCertificateHelperUnavailable}
                title={customerCertificateHelperUnavailable ? customerCertificateHelperMessage : undefined}
                onClick={loadCustomerCertificateCandidates}
              >
                공동인증서 확인
              </button>
              <button
                type="button"
                disabled={props.busyKey !== null || !selectedCustomerCertificateCandidate}
                onClick={linkSelectedCustomerCertificateCandidate}
              >
                연결
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderCustomerCertificatePasswordDialog = () => {
    if (!customerCertificatePasswordDialog || !selectedCustomer) {
      return null;
    }

    const dialog = customerCertificatePasswordDialog;
    const dialogTitle = dialog.action === "payment" ? "결제 열기" : "갱신 준비";
    const submitLabel = dialog.action === "payment" ? "결제 열기" : "갱신 준비";

    return (
      <div
        className="customer-certificate-selector-backdrop customer-certificate-password-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeCustomerCertificatePasswordDialog();
          }
        }}
      >
        <section
          className="customer-certificate-password-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-certificate-password-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <form
            className="customer-certificate-password-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              submitCustomerCertificatePasswordDialog();
            }}
          >
            <div className="customer-certificate-selector-head">
              <div>
                <strong id="customer-certificate-password-title">{dialogTitle}</strong>
                <span>
                  {selectedCustomer.corpName || selectedCustomer.customerName} 고객의 {dialog.certificateKindLabel} 공동인증서 비밀번호를 입력하세요.
                </span>
              </div>
              <button type="button" className="btn-ghost" onClick={closeCustomerCertificatePasswordDialog}>
                닫기
              </button>
            </div>
            <dl className="customer-certificate-password-summary">
              <div>
                <dt>인증서</dt>
                <dd>{dialog.certificateName}</dd>
              </div>
              <div>
                <dt>만료일</dt>
                <dd>{dialog.expireLabel}</dd>
              </div>
            </dl>
            <label className="customer-certificate-password-field">
              공동인증서 비밀번호
              <input
                type="password"
                autoComplete="off"
                value={customerCertificatePasswordInput}
                autoFocus
                onChange={(event) => setCustomerCertificatePasswordInput(event.target.value)}
              />
            </label>
            <p className="customer-certificate-password-note">비밀번호는 저장하지 않고 이번 {dialogTitle} 요청에만 사용합니다.</p>
            <div className="customer-certificate-selector-actions">
              <button type="button" className="btn-secondary" onClick={closeCustomerCertificatePasswordDialog}>
                취소
              </button>
              <button type="submit" disabled={props.busyKey !== null || customerCertificatePasswordInput.trim() === ""}>
                {props.busyKey === `customer-certificate-${dialog.action}-${dialog.certificateIndex}` ? "진행 중" : submitLabel}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  };

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

  const customerSummaryCards = useMemo<
    Array<{
      key: string;
      filter: CustomerListFilter;
      label: string;
      value: string;
      tone: CustomerConsoleTone;
    }>
  >(
    () => [
      {
        key: "total",
        filter: "all",
        label: "전체",
        value: `${props.customers.length}명`,
        tone: "default" as CustomerConsoleTone
      },
      {
        key: "invoice-unissued",
        filter: "unissued",
        label: "이번 달 미발행",
        value: `${unissuedThisMonthCustomerCount}명`,
        tone: unissuedThisMonthCustomerCount > 0 ? ("warn" as CustomerConsoleTone) : ("success" as CustomerConsoleTone)
      },
      {
        key: "certificate-expiration",
        filter: "certificate-expiration",
        label: "인증서 만료 예정",
        value: `${certificateExpirationCustomerCount}명`,
        tone: certificateExpirationCustomerCount > 0 ? ("warn" as CustomerConsoleTone) : ("success" as CustomerConsoleTone)
      },
      {
        key: "contract-expiration",
        filter: "contract-expiration",
        label: "계약 만료 예정",
        value: `${props.contractRenewalDueItems.length}명`,
        tone: props.contractRenewalDueItems.length > 0 ? ("warn" as CustomerConsoleTone) : ("success" as CustomerConsoleTone)
      }
    ],
    [
      certificateExpirationCustomerCount,
      props.contractRenewalDueItems.length,
      props.customers.length,
      unissuedThisMonthCustomerCount
    ]
  );
  const hasActiveFilter =
    props.customerListFilter !== "all" ||
    props.customerSearchField !== "all" ||
    props.customerSearchQuery.trim() !== "" ||
    props.customerIssueMonthQuery.trim() !== "";
  const detailPanelOpen = props.creatingCustomer || Boolean(selectedCustomer);
  const selectedRecentIssuedDraft = props.selectedCustomerIssuedDrafts[0] ?? null;
  const selectedReportDraft = useMemo(() => {
    if (!selectedCustomer) {
      return null;
    }
    const draft = customerReportDetail.draft;
    if (draft && draft.customerId === selectedCustomer.id && draft.reportYear === customerReportYear) {
      return draft;
    }
    return createEmptyCustomerReportDetail(selectedCustomer.id, customerReportYear);
  }, [customerReportDetail.draft, customerReportYear, selectedCustomer]);
  const selectedReportTotals = useMemo(
    () =>
      selectedReportDraft
        ? calculateCustomerReportTotals(selectedReportDraft.months)
        : {
            firstHalf: 0,
            secondHalf: 0,
            annual: 0,
            supply: 0,
            vat: 0
          },
    [selectedReportDraft]
  );

  const updateCustomerReportDraft = (updater: (draft: CustomerReportDetail) => CustomerReportDetail) => {
    if (!selectedCustomer || !customerDetailEditing) {
      return;
    }
    customerReportDetail.setDraft((prev) => {
      const base =
        prev && prev.customerId === selectedCustomer.id && prev.reportYear === customerReportYear
          ? prev
          : createEmptyCustomerReportDetail(selectedCustomer.id, customerReportYear);
      return updater(base);
    });
  };

  const updateCustomerReportProfile = <K extends keyof CustomerReportDetail["profile"]>(
    key: K,
    value: CustomerReportDetail["profile"][K]
  ) => {
    updateCustomerReportDraft((draft) => ({
      ...draft,
      profile: {
        ...draft.profile,
        [key]: value,
        ...(key === "contractStartMonth"
          ? { contractEndMonth: deriveContractEndMonth(value as string | null) }
          : {})
      }
    }));
  };

  const updateCustomerReportMonth = (
    reportMonth: number,
    updater: (month: CustomerReportMonth) => CustomerReportMonth
  ) => {
    updateCustomerReportDraft((draft) => ({
      ...draft,
      months: draft.months.map((month) => (month.reportMonth === reportMonth ? updater(month) : month))
    }));
  };
  const updateCustomerReportSupplyAmount = (reportMonth: number, value: string) => {
    const supplyAmount = parseMoneyInput(value);
    updateCustomerReportMonth(reportMonth, (current) => ({
      ...current,
      issueYear: customerReportYear,
      supplyAmount,
      totalAmount: supplyAmount + current.vatAmount
    }));
  };
  const updateCustomerReportVatAmount = (reportMonth: number, value: string) => {
    const vatAmount = parseMoneyInput(value);
    updateCustomerReportMonth(reportMonth, (current) => ({
      ...current,
      issueYear: customerReportYear,
      vatAmount,
      totalAmount: current.supplyAmount + vatAmount
    }));
  };

  const getCustomerReportIssueDateDraftKey = (reportMonth: number) => `${customerReportYear}-${reportMonth}`;
  const getCustomerReportIssueDateInputValue = (month: CustomerReportMonth) =>
    customerReportIssueDateDrafts[getCustomerReportIssueDateDraftKey(month.reportMonth)] ??
    formatCustomerReportIssueDay(month.issueDate);
  const isCustomerReportIssueDateInputInvalid = (reportMonth: number, value: string) =>
    value.trim() !== "" && parseCustomerReportIssueDay(value, customerReportYear, reportMonth) === null;
  const hasInvalidCustomerReportIssueDateDraft = selectedReportDraft
    ? selectedReportDraft.months.some((month) => {
        const draftValue = customerReportIssueDateDrafts[getCustomerReportIssueDateDraftKey(month.reportMonth)];
        return draftValue !== undefined && isCustomerReportIssueDateInputInvalid(month.reportMonth, draftValue);
      })
    : false;
  const customerMemoValue =
    selectedCustomer && props.customerForm.id === selectedCustomer.id ? props.customerForm.memo : (selectedCustomer?.memo ?? "");
  const customerMemoChanged = Boolean(selectedCustomer) && customerMemoValue !== selectedCustomer?.memo;
  const customerReportDetailChanged = hasCustomerReportDetailChanges(customerReportDetail.detail, customerReportDetail.draft);
  const customerDetailChanged = customerMemoChanged || customerReportDetailChanged;
  const customerDetailSaving =
    props.busyKey !== null || props.isSavingCustomer || customerReportDetail.saving;
  const customerDetailSaveBlocked =
    customerDetailSaving || hasInvalidCustomerReportIssueDateDraft || !customerDetailChanged;
  const resetCustomerDetailEditDraft = () => {
    if (!selectedCustomer) {
      return;
    }
    props.setCustomerForm((prev) =>
      prev.id === selectedCustomer.id ? { ...prev, memo: selectedCustomer.memo } : prev
    );
    customerReportDetail.setDraft(
      customerReportDetail.detail ?? createEmptyCustomerReportDetail(selectedCustomer.id, customerReportYear)
    );
    setCustomerReportIssueDateDrafts({});
    setCustomerCertificateSelectorOpen(false);
    setCustomerCertificateSelectedKey(null);
    setCustomerCertificateActionNotice("");
  };
  const cancelCustomerDetailEdit = () => {
    resetCustomerDetailEditDraft();
    setCustomerDetailEditing(false);
  };
  const saveCustomerDetailEdit = () => {
    if (
      !selectedCustomer ||
      hasInvalidCustomerReportIssueDateDraft ||
      customerReportDetail.loading ||
      customerReportDetail.saving ||
      props.busyKey !== null ||
      !customerDetailChanged
    ) {
      return;
    }
    void props.runAction(
      `save-customer-detail-${selectedCustomer.id}`,
      async () => {
        if (customerMemoChanged) {
          await props.onSaveCustomerMemo(selectedCustomer.id, customerMemoValue);
        }
        if (customerReportDetailChanged) {
          const reportSaved = await customerReportDetail.save();
          if (!reportSaved) {
            return;
          }
        }
        setCustomerReportIssueDateDrafts({});
        setCustomerCertificateSelectorOpen(false);
        setCustomerCertificateSelectedKey(null);
        setCustomerCertificateActionNotice("");
        setCustomerDetailEditing(false);
      },
      { reload: false }
    );
  };
  const saveCustomerContractPeriod = () => {
    if (!selectedCustomer || customerContractAdding) {
      return;
    }

    const contractStartDate = customerContractAddForm.contractStartDate.trim();
    const contractEndDate = customerContractAddForm.contractEndDate.trim();
    if (!contractStartDate || !contractEndDate) {
      setCustomerContractAddError("계약 시작일과 종료일을 입력하세요.");
      return;
    }
    if (contractStartDate > contractEndDate) {
      setCustomerContractAddError("계약 종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    setCustomerContractAdding(true);
    setCustomerContractAddError("");
    void props.onAddCustomerContractPeriod(selectedCustomer.id, {
      contractStartDate,
      contractEndDate
    })
      .then((result) => {
        setCustomerContractPeriods(result.periods);
        setCustomerContractAddForm({
          contractStartDate: "",
          contractEndDate: ""
        });
        setCustomerContractAddOpen(false);
      })
      .catch((error) => {
        setCustomerContractAddError(error instanceof Error ? error.message : "계약 기간을 추가하지 못했습니다.");
      })
      .finally(() => {
        setCustomerContractAdding(false);
      });
  };
  const updateCustomerReportIssueDay = (reportMonth: number, value: string) => {
    const sanitizedValue = value.replace(/\D/g, "").slice(0, 2);
    const parsed = parseCustomerReportIssueDay(sanitizedValue, customerReportYear, reportMonth);
    const nextDisplayValue = parsed?.dayText ?? sanitizedValue;

    setCustomerReportIssueDateDrafts((prev) => ({
      ...prev,
      [getCustomerReportIssueDateDraftKey(reportMonth)]: nextDisplayValue
    }));

    if (parsed !== null) {
      updateCustomerReportMonth(reportMonth, (current) => ({
        ...current,
        issueYear: customerReportYear,
        issueDate: parsed.issueDate
      }));
    }
  };
  const normalizeCustomerReportIssueDayDraft = (reportMonth: number) => {
    const draftKey = getCustomerReportIssueDateDraftKey(reportMonth);
    const draftValue = customerReportIssueDateDrafts[draftKey];
    if (draftValue === undefined) {
      return;
    }

    const parsed = parseCustomerReportIssueDay(draftValue, customerReportYear, reportMonth);
    if (parsed !== null) {
      setCustomerReportIssueDateDrafts((prev) => ({
        ...prev,
        [draftKey]: parsed.dayText ?? ""
      }));
    }
  };

  const renderCustomerTableRows = () => {
    if (visibleTableCustomers.length === 0) {
      return (
        <TableEmptyState
          colSpan={4}
          title={customerListEmptyState.title}
          body={customerListEmptyState.body}
          rowClassName="customer-console-empty-row"
          className="context-empty-state customer-table-empty"
          actions={
            <div className="customer-console-empty-actions">
              <button type="button" onClick={handleCreateCustomer}>
                새 고객 등록
              </button>
            </div>
          }
        />
      );
    }

    return visibleTableCustomers.map((customer) => {
      const isSelected = !props.creatingCustomer && detailPanelOpen && props.selectedCustomer?.id === customer.id;
      const isChecked = checkedCustomerIds.has(customer.id);
      const summaryTitle = customer.corpName || customer.customerName;
      const issueStatusChip = buildCustomerIssueStatusChip(customer, props.getCustomerIssueReadiness(customer));
      const contractStatusChip = buildCustomerContractStatusChip(
        customerContractSummaryById.get(customer.id),
        customerContractRenewalDueById.get(customer.id)
      );
      return (
        <tr
          key={customer.id}
          aria-selected={isSelected}
          className={isSelected ? "is-selected" : undefined}
          tabIndex={0}
          onClick={(event) => handleCustomerRowClick(event, customer)}
          onKeyDown={(event) => handleCustomerRowKeyDown(event, customer)}
        >
          <td className="customer-console-col-check">
            <CheckboxControl
              checked={isChecked}
              readOnly
              aria-label={`${summaryTitle} 선택`}
              onClick={(event) => {
                event.stopPropagation();
                toggleCustomerChecked(customer.id);
              }}
            />
          </td>
          <td className="customer-console-col-name">
            <div className="customer-console-primary-cell">
              <strong>{summaryTitle}</strong>
            </div>
          </td>
          <td className="customer-console-col-owner">
            <div className="customer-console-cell-stack">
              <strong>{customer.customerName || "-"}</strong>
            </div>
          </td>
          <td className="customer-console-col-status">
            <div className="customer-status-chip-row">
              {renderCustomerStatusChip(issueStatusChip)}
              {renderCustomerStatusChip(contractStatusChip)}
            </div>
          </td>
        </tr>
      );
    });
  };

  const renderDetailPanel = () => {
    if (
      !selectedCustomer ||
      !selectedCustomerReadiness ||
      !selectedCustomerCertificateStatus ||
      !selectedReportDraft
    ) {
      return null;
    }

    const reportProfile = selectedReportDraft.profile;
    const reportYearOptions = Array.from({ length: 8 }, (_, index) => getCurrentCustomerReportYear() + 1 - index);
    const customerReportSaveStatus = customerReportDetail.saving
      ? "저장 중..."
      : customerDetailEditing
        ? "수정 중"
        : customerReportDetail.notice || "읽기 전용";
    const customerMemoSaveStatus = props.isSavingCustomer
      ? "저장 중..."
      : customerMemoChanged
        ? "저장 대기"
        : "저장됨";
    const selectedContractSummary = customerContractSummaryById.get(selectedCustomer.id);
    const selectedContractRenewalDueItem = customerContractRenewalDueById.get(selectedCustomer.id);
    const displayContractStartMonth = selectedContractSummary?.contractStartMonth ?? reportProfile.contractStartMonth;
    const displayContractEndMonth =
      selectedContractSummary?.contractEndMonth ?? reportProfile.contractEndMonth ?? deriveContractEndMonth(reportProfile.contractStartMonth);
    const contractEndMonth = reportProfile.contractEndMonth ?? deriveContractEndMonth(reportProfile.contractStartMonth);
    const customerHistorySummaryText =
      props.mailboxDataLoading && props.selectedCustomerIssuedDrafts.length === 0
        ? "발행 이력을 불러오는 중입니다."
        : selectedRecentIssuedDraft
          ? `최근 발행 ${props.formatDateTime(selectedRecentIssuedDraft.issuedAt)}`
          : "아직 발행 이력이 없습니다.";
    const solarCapacityLabel =
      reportProfile.solarCapacityKw !== null && reportProfile.solarCapacityKw !== undefined
        ? `${reportProfile.solarCapacityKw} KW`
        : "미입력";
    const contractPeriodSummaryLabel = displayContractStartMonth
      ? `${formatCustomerMonthLabel(displayContractStartMonth)} ~ ${formatCustomerMonthLabel(displayContractEndMonth)}`
      : "미입력";
    const customerBusinessAddress = selectedCustomer.addr.trim();
    const customerSolarAddress =
      selectedCustomer.matchAddresses.map((address) => address.trim()).find((address) => address.length > 0) ??
      customerBusinessAddress;
    return (
      <div
        className={`customer-detail-panel-body customer-detail-option3-body ${
          customerDetailEditing ? "is-editing" : "is-readonly"
        }`}
      >
        <div className="customer-detail-overview">
          <div className="customer-detail-main-stack">
            <section className="customer-detail-section customer-info-card customer-info-basic-card">
              <div className="customer-detail-section-head">
                <h3>기본 정보</h3>
                {customerDetailEditing ? (
                  <span className={props.isSavingCustomer ? "customer-auto-save-status" : "customer-auto-save-status tone-success"}>
                    {customerMemoSaveStatus}
                  </span>
                ) : null}
              </div>
              <dl className="customer-detail-context-grid customer-detail-basic-facts">
                <div>
                  <dt>상호명</dt>
                  <dd>{selectedCustomer.corpName || "-"}</dd>
                </div>
                <div>
                  <dt>대표자명</dt>
                  <dd>{selectedCustomer.customerName || "-"}</dd>
                </div>
                <div>
                  <dt>사업자등록번호</dt>
                  <dd>{selectedCustomer.businessNumber || "-"}</dd>
                </div>
                <div>
                  <dt>전화번호</dt>
                  <dd className="customer-detail-nowrap-value">{selectedCustomer.renewalContactMobile || "-"}</dd>
                </div>
                <div>
                  <dt>사업장 주소</dt>
                  <dd title={customerBusinessAddress || undefined}>{customerBusinessAddress || "-"}</dd>
                </div>
                <div>
                  <dt>태양광 주소</dt>
                  <dd title={customerSolarAddress || undefined}>{customerSolarAddress || "-"}</dd>
                </div>
              </dl>
            </section>

            <div className="customer-detail-side-stack">
              <section className="customer-detail-section customer-info-card customer-info-contract-card">
                <div className="customer-detail-section-head customer-report-auto-save-head">
                  <h3>계약/발행</h3>
                  <div className="customer-contract-head-actions">
                    {selectedContractRenewalDueItem ? (
                      <button
                        type="button"
                        className="btn-secondary customer-contract-renewal-button"
                        disabled={props.busyKey === `contract-renewal-${selectedCustomer.id}`}
                        onClick={() => void props.onCompleteCustomerContractRenewal(selectedContractRenewalDueItem)}
                      >
                        {props.busyKey === `contract-renewal-${selectedCustomer.id}` ? "갱신 중" : "계약 갱신"}
                      </button>
                    ) : null}
                    <button type="button" className="btn-ghost customer-history-detail-button" onClick={openCustomerHistoryDetail}>
                      상세정보보기
                    </button>
                    <span className={customerReportDetail.error ? "customer-auto-save-status tone-danger" : customerReportDetail.saving ? "customer-auto-save-status" : "customer-auto-save-status tone-success"}>
                      {customerReportDetail.error || customerReportSaveStatus}
                    </span>
                  </div>
                </div>
                {customerDetailEditing ? (
                  <div className="customer-report-profile-grid customer-info-contract-grid">
                    <label>
                      <span className="customer-contract-field-label">태양광 용량 KW</span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={reportProfile.solarCapacityKw ?? ""}
                        onInput={(event) => updateCustomerReportProfile("solarCapacityKw", parseNullableNumberInput(event.currentTarget.value))}
                        onChange={(event) => updateCustomerReportProfile("solarCapacityKw", parseNullableNumberInput(event.target.value))}
                      />
                    </label>
                    <div className="customer-contract-period-field customer-contract-period-action-row">
                      <span className="customer-contract-period-label">계약기간</span>
                      <span className="customer-contract-period-inputs">
                        <input
                          type="month"
                          aria-label="계약 시작 월"
                          value={reportProfile.contractStartMonth ?? ""}
                          onInput={(event) => updateCustomerReportProfile("contractStartMonth", event.currentTarget.value || null)}
                          onChange={(event) => updateCustomerReportProfile("contractStartMonth", event.target.value || null)}
                        />
                        <span aria-hidden="true">~</span>
                        <input
                          type="month"
                          aria-label="계약 종료 월"
                          value={deriveContractEndMonth(reportProfile.contractStartMonth) ?? ""}
                          readOnly
                          aria-readonly="true"
                        />
                      </span>
                    </div>
                  </div>
                ) : (
                  <dl className="customer-detail-context-grid customer-info-contract-summary">
                    <div>
                      <dt>태양광 용량 KW</dt>
                      <dd>{solarCapacityLabel}</dd>
                    </div>
                    <div className="customer-contract-period-action-row">
                      <dt>계약기간</dt>
                      <dd>{contractPeriodSummaryLabel}</dd>
                    </div>
                  </dl>
                )}
                <div className="customer-history-summary" aria-label="운영 이력 요약">
                  <div className="customer-history-summary-main">
                    <span>운영 이력</span>
                    <strong>{props.selectedCustomerIssuedDrafts.length}건</strong>
                    <em>{customerHistorySummaryText}</em>
                  </div>
                </div>
              </section>

              <section className="customer-detail-section customer-info-card customer-info-certificate-card">
                <div className="customer-detail-section-head customer-certificate-card-head">
                  <h3>인증서</h3>
                </div>
                <div className="customer-certificate-management-list">
                  <div className="customer-certificate-management-row">
                    <div className="customer-certificate-management-main">
                      <div className="customer-certificate-management-title">
                        <strong>전자세금용</strong>
                        <span className={getToneBadgeClass(selectedCustomerCertificateStatus.tone)}>{selectedCustomerCertificateStatus.label}</span>
                        {selectedCustomerElectronicTaxCertificateActionVisible ? (
                          <div className="customer-certificate-management-actions">
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={selectedCustomerElectronicTaxCertificateActionDisabled}
                              title={selectedCustomerElectronicTaxCertificateActionTitle}
                              onClick={
                                selectedCustomerElectronicTaxCertificate?.canOpenPayment
                                  ? openSelectedCustomerElectronicTaxCertificatePayment
                                  : prepareSelectedCustomerElectronicTaxCertificateRenewal
                              }
                            >
                              {props.busyKey === selectedCustomerElectronicTaxCertificateActionBusyKey
                                ? selectedCustomerElectronicTaxCertificate?.canOpenPayment
                                  ? "여는 중"
                                  : "갱신 중"
                                : selectedCustomerElectronicTaxCertificate?.canOpenPayment
                                  ? "결제"
                                  : "갱신"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {renderCustomerCertificateExpireMeta(selectedCustomerElectronicTaxCertificate, selectedCustomerElectronicTaxCertificateFallback)}
                    </div>
                  </div>
                  <div className="customer-certificate-management-row">
                    <div className="customer-certificate-management-main">
                      <div className="customer-certificate-management-title">
                        <strong>범용</strong>
                        <span
                          className={getToneBadgeClass(
                            selectedCustomerGeneralCertificate?.statusTone ?? selectedCustomerGeneralCertificateStatus.tone
                          )}
                        >
                          {selectedCustomerGeneralCertificate?.statusText ?? selectedCustomerGeneralCertificateStatus.label}
                        </span>
                        {customerDetailEditing ? (
                          <div className="customer-certificate-management-actions">
                            <button type="button" className="btn-ghost" disabled={props.busyKey !== null} onClick={openCustomerCertificateSelector}>
                              {selectedCustomerGeneralCertificate ? "범용 인증서 교체" : "범용 인증서 등록"}
                            </button>
                            {selectedCustomerGeneralCertificate ? (
                              selectedCustomerGeneralCertificate.canOpenPayment ? (
                                <button
                                  type="button"
                                  disabled={props.busyKey !== null || customerCertificateHelperUnavailable}
                                  title={customerCertificateHelperUnavailable ? customerCertificateHelperMessage : undefined}
                                  onClick={openSelectedCustomerGeneralCertificatePayment}
                                >
                                  결제 열기
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={props.busyKey !== null || customerCertificateHelperUnavailable}
                                  title={customerCertificateHelperUnavailable ? customerCertificateHelperMessage : undefined}
                                  onClick={prepareSelectedCustomerGeneralCertificateRenewal}
                                >
                                  갱신 준비
                                </button>
                              )
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {renderCustomerCertificateMeta(
                        selectedCustomerGeneralCertificate,
                        selectedCustomerGeneralCertificateStatus.detail || "갱신 준비와 결제에 사용할 범용 인증서를 연결하세요."
                      )}
                      {selectedCustomerGeneralCertificate?.paymentAmount ? (
                        <small>결제 예정 {selectedCustomerGeneralCertificate.paymentAmount}</small>
                      ) : null}
                    </div>
                  </div>
                </div>
                {customerDetailEditing && customerCertificateActionNotice ? (
                  <p className="customer-certificate-action-notice">{customerCertificateActionNotice}</p>
                ) : null}
              </section>

              <section className="customer-detail-section customer-info-card customer-info-memo-card">
                <div className="customer-detail-section-head">
                  <h3>메모</h3>
                </div>
                {customerDetailEditing ? (
                  <textarea
                    rows={2}
                    value={customerMemoValue}
                    placeholder="고객별 확인 사항을 입력하세요."
                    onChange={(event) => {
                      const nextMemo = event.target.value;
                      props.setCustomerForm((prev) =>
                        prev.id === selectedCustomer.id
                          ? {
                              ...prev,
                              memo: nextMemo
                            }
                          : prev
                      );
                    }}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && customerMemoChanged && props.busyKey === null) {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  <p className="customer-detail-memo-read">{customerMemoValue.trim() || "-"}</p>
                )}
              </section>
            </div>

            <section className="customer-detail-section customer-report-history-section">
              <div className="customer-detail-section-head customer-report-history-head">
                <div className="customer-report-history-titlebar">
                  <h3>신고 이력</h3>
                  <select
                    className="customer-report-year-select"
                    aria-label="신고 연도"
                    value={customerReportYear}
                    onChange={(event) => setCustomerReportYear(Number(event.target.value))}
                  >
                    {reportYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}년
                      </option>
                    ))}
                  </select>
                  {customerReportDetail.loading ? (
                    <span className="customer-report-history-status">신고 상세를 불러오는 중입니다.</span>
                  ) : null}
                </div>
                <div className="customer-report-inline-totals" aria-label="신고 이력 합계">
                  <div>
                    <span>1분기합계</span>
                    <strong>{props.formatMoney(selectedReportTotals.firstHalf)}원</strong>
                  </div>
                  <div>
                    <span>2분기합계</span>
                    <strong>{props.formatMoney(selectedReportTotals.secondHalf)}원</strong>
                  </div>
                </div>
              </div>
              {customerReportDetail.error ? <p className="customer-detail-card-note tone-danger">{customerReportDetail.error}</p> : null}
              <div className="customer-report-table-wrap">
                <table className="customer-report-table">
                  <colgroup>
                    <col className="customer-report-month-column" />
                    <col className="customer-report-day-column" />
                    <col className="customer-report-supply-column" />
                    <col className="customer-report-vat-column" />
                    <col className="customer-report-total-column" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>월</th>
                      <th>일</th>
                      <th>공급가액</th>
                      <th>부가세</th>
                      <th>합계액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReportDraft.months.map((month) => {
                      const issueDateInputValue = getCustomerReportIssueDateInputValue(month);
                      const issueDateInvalid = isCustomerReportIssueDateInputInvalid(month.reportMonth, issueDateInputValue);
                      const issueDayText = formatCustomerReportIssueDay(month.issueDate);
                      return (
                        <tr key={month.reportMonth}>
                          <td>{month.reportMonth}월</td>
                          <td>
                            {customerDetailEditing ? (
                              <input
                                type="text"
                                inputMode="numeric"
                                aria-label={`${month.reportMonth}월 발행일`}
                                aria-invalid={issueDateInvalid}
                                value={issueDateInputValue}
                                onInput={(event) => updateCustomerReportIssueDay(month.reportMonth, event.currentTarget.value)}
                                onChange={(event) => updateCustomerReportIssueDay(month.reportMonth, event.target.value)}
                                onBlur={() => normalizeCustomerReportIssueDayDraft(month.reportMonth)}
                              />
                            ) : (
                              <span className={`customer-report-read-value ${issueDayText ? "is-number" : "is-empty"}`}>
                                {issueDayText || "-"}
                              </span>
                            )}
                          </td>
                          <td>
                            {customerDetailEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={month.supplyAmount > 0 ? month.supplyAmount : ""}
                                onInput={(event) => updateCustomerReportSupplyAmount(month.reportMonth, event.currentTarget.value)}
                                onChange={(event) => updateCustomerReportSupplyAmount(month.reportMonth, event.target.value)}
                              />
                            ) : (
                              <span className={`customer-report-read-value ${month.supplyAmount > 0 ? "is-number" : "is-empty"}`}>
                                {month.supplyAmount > 0 ? props.formatMoney(month.supplyAmount) : "-"}
                              </span>
                            )}
                          </td>
                          <td>
                            {customerDetailEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={month.vatAmount > 0 ? month.vatAmount : ""}
                                onInput={(event) => updateCustomerReportVatAmount(month.reportMonth, event.currentTarget.value)}
                                onChange={(event) => updateCustomerReportVatAmount(month.reportMonth, event.target.value)}
                              />
                            ) : (
                              <span className={`customer-report-read-value ${month.vatAmount > 0 ? "is-number" : "is-empty"}`}>
                                {month.vatAmount > 0 ? props.formatMoney(month.vatAmount) : "-"}
                              </span>
                            )}
                          </td>
                          <td className={`customer-report-total-cell ${month.supplyAmount + month.vatAmount > 0 ? "is-number" : "is-empty"}`}>
                            <span className="customer-report-read-value">
                              {month.supplyAmount + month.vatAmount > 0 ? `${props.formatMoney(month.supplyAmount + month.vatAmount)}원` : "-"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {customerDetailEditing && hasInvalidCustomerReportIssueDateDraft ? (
                <p className="customer-detail-card-note tone-danger">발행일은 해당 월에 맞는 숫자만 입력하세요.</p>
              ) : null}
            </section>
          </div>
        </div>

          {customerHistoryDetailOpen ? (
            <div className="customer-history-detail-modal" onMouseDown={() => setCustomerHistoryDetailOpen(false)}>
              <section
                className="customer-history-detail-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="customer-history-detail-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="customer-history-detail-head">
                  <div>
                    <h3 id="customer-history-detail-title">계약 기간 상세정보</h3>
                    <p>{selectedCustomer.corpName || selectedCustomer.customerName || "선택 고객"}</p>
                  </div>
                  <div className="customer-history-detail-head-actions">
                    <button
                      type="button"
                      className="btn-secondary customer-contract-add-toggle"
                      onClick={() => {
                        setCustomerContractAddOpen((open) => !open);
                        setCustomerContractAddError("");
                      }}
                    >
                      <Icon name="plus" className="button-icon" />
                      계약 추가
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setCustomerHistoryDetailOpen(false)}>
                      닫기
                    </button>
                  </div>
                </header>
                <div className="customer-contract-period-body">
                  {customerContractAddOpen ? (
                    <div className="customer-contract-period-add-form">
                      <label>
                        계약 시작일
                        <input
                          type="date"
                          value={customerContractAddForm.contractStartDate}
                          onChange={(event) =>
                            setCustomerContractAddForm((prev) => ({
                              ...prev,
                              contractStartDate: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label>
                        계약 종료일
                        <input
                          type="date"
                          value={customerContractAddForm.contractEndDate}
                          onChange={(event) =>
                            setCustomerContractAddForm((prev) => ({
                              ...prev,
                              contractEndDate: event.target.value
                            }))
                          }
                        />
                      </label>
                      <div className="customer-contract-period-add-actions">
                        <button type="button" className="btn-ghost" onClick={() => setCustomerContractAddOpen(false)}>
                          취소
                        </button>
                        <button type="button" disabled={customerContractAdding} onClick={saveCustomerContractPeriod}>
                          {customerContractAdding ? "저장 중" : "저장"}
                        </button>
                      </div>
                      {customerContractAddError ? <p className="customer-contract-period-error">{customerContractAddError}</p> : null}
                    </div>
                  ) : null}
                  {customerContractPeriodsError ? (
                    <p className="customer-contract-period-error">{customerContractPeriodsError}</p>
                  ) : null}
                  <div className="customer-contract-period-table-wrap">
                    <table className="customer-contract-period-table">
                      <thead>
                        <tr>
                          <th>번호</th>
                          <th>계약기간</th>
                          <th>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerContractPeriodsLoading ? (
                          <tr>
                            <td colSpan={3}>계약 기간을 불러오는 중입니다.</td>
                          </tr>
                        ) : customerContractPeriods.length > 0 ? (
                          customerContractPeriods.map((period, index) => (
                            <tr key={period.id}>
                              <td>{index + 1}</td>
                              <td>
                                {formatCustomerContractDate(period.contractStartDate)} ~{" "}
                                {formatCustomerContractDate(period.contractEndDate)}
                              </td>
                              <td>
                                <span className={getCustomerContractPeriodStatusClass(period.status)}>
                                  {getCustomerContractPeriodStatusLabel(period.status)}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3}>저장된 계약 기간이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
    );
  };

  const renderCustomerOnestopSteps = () => {
    return (
      <TaskStepper
        className="customer-onestop-steps"
        label="고객 등록 단계"
        activeId={customerOnestopStep}
        steps={buildCustomerOnestopStepItems(customerOnestopStep)}
      />
    );
  };

  const renderCustomerOnestopReviewWorkspace = () => {
    const directoryInputProps = {
      type: "file",
      multiple: true,
      directory: "",
      webkitdirectory: "",
      onChange: handleCustomerOnestopUploadInputChange
    } as React.InputHTMLAttributes<HTMLInputElement> & { directory: string; webkitdirectory: string };
    const selectedActionSummary =
      customerOnestopCertificateSearchQuery.trim() !== "" || customerOnestopFilter !== "all"
        ? `선택 ${customerOnestopSelectedCount}건 · 현재 보기 ${customerOnestopVisibleSelectedCount}건`
        : `선택 ${customerOnestopSelectedCount}건`;
    const selectedActions = customerOnestopSelectedCount > 0 ? (
      <div className="initial-onboarding-selected-actionbar">
        <div className="initial-onboarding-selected-actionbar-head">
          <strong>{selectedActionSummary}</strong>
          <span>선택한 고객에만 적용됩니다.</span>
        </div>
        <div className="initial-registration-candidate-toolbar">
          <label className="initial-registration-shared-password">
            <span>공통 비밀번호</span>
            <PasswordField
              visible={customerOnestopBulkPasswordVisible}
              onVisibleChange={setCustomerOnestopBulkPasswordVisible}
              value={customerOnestopBulkPassword}
              disabled={props.busyKey !== null}
              onChange={(event) => setCustomerOnestopBulkPassword(event.target.value)}
              placeholder="빈 비밀번호 행에 공통 적용"
              revealLabel="공통 비밀번호 보기"
              hideLabel="공통 비밀번호 숨기기"
            />
          </label>
          <Button
            type="button"
            size="sm"
            className="initial-registration-review-button"
            disabled={props.busyKey !== null || (!customerOnestopCanReview && !customerOnestopCanExecute)}
            title={customerOnestopPrimaryActionTitle}
            onClick={runCustomerOnestopPrimaryAction}
          >
            {customerOnestopPrimaryActionLabel}
          </Button>
        </div>
        <div className="initial-onboarding-review-actions">
          <button
            type="button"
            className="btn-secondary initial-onboarding-review-clear-password"
            disabled={!canClearCustomerOnestopVisibleSelectedPasswords}
            title={
              canClearCustomerOnestopVisibleSelectedPasswords
                ? "선택한 행의 개별 비밀번호를 비웁니다."
                : "개별 비밀번호가 입력된 행을 선택하세요."
            }
            onClick={clearCustomerOnestopVisibleSelectedPasswords}
          >
            <Eraser aria-hidden="true" />
            <span>비밀번호 지우기</span>
          </button>
          <button
            type="button"
            className="btn-secondary initial-onboarding-review-delete"
            disabled={props.busyKey !== null || customerOnestopSelectedCount === 0}
            onClick={deleteSelectedCustomerOnestopRows}
          >
            선택 삭제
          </button>
        </div>
      </div>
    ) : null;

    return (
      <section className="customer-detail-section customer-onestop-section">
        <div className="customer-detail-section-head">
          <div>
            <h3>선택 고객 확인</h3>
            <p>
              {customerOnestopRows.length > 0
                ? `등록 대상 ${customerOnestopRows.length}건 · 선택 ${customerOnestopSelectedCount}건`
                : "공동인증서를 읽거나 파일/폴더를 추가하세요."}
            </p>
          </div>
        </div>
        <input
          ref={customerOnestopFileInputRef}
          className="customer-onestop-file-input"
          type="file"
          multiple
          accept=".der,.key,.p12,.pfx"
          aria-label="인증서 파일 선택"
          onChange={handleCustomerOnestopUploadInputChange}
        />
        <input
          {...directoryInputProps}
          ref={customerOnestopFolderInputRef}
          className="customer-onestop-file-input"
          aria-label="인증서 폴더 선택"
        />
        <div className="customer-onestop-source-actions" aria-label="공동인증서 추가 방법">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.busyKey !== null}
            title={
              props.customerRenewalAssistantOnline
                ? "표준 NPKI 저장소에서 공동인증서를 읽습니다."
                : "AT 헬퍼 연결 후 공동인증서를 읽을 수 있습니다."
            }
            onClick={readCustomerOnestopCertificates}
          >
            공동인증서 읽기
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.busyKey !== null}
            onClick={() => customerOnestopFileInputRef.current?.click()}
          >
            파일 추가
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.busyKey !== null}
            onClick={() => customerOnestopFolderInputRef.current?.click()}
          >
            폴더 추가
          </Button>
        </div>
        <div className="initial-onboarding-review-viewbar customer-onestop-review-viewbar">
          <label className="initial-onboarding-review-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={customerOnestopCertificateSearchQuery}
              disabled={props.busyKey !== null}
              aria-label="선택 고객 검색"
              placeholder="상호명, 인증서명, 사업자번호 검색"
              onChange={(event) => setCustomerOnestopCertificateSearchQuery(event.target.value)}
            />
            {customerOnestopCertificateSearchQuery.trim() !== "" ? (
              <button
                type="button"
                aria-label="검색어 지우기"
                disabled={props.busyKey !== null}
                onClick={() => setCustomerOnestopCertificateSearchQuery("")}
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="initial-onboarding-review-filter" role="group" aria-label="등록 대상 보기 필터">
            <button
              type="button"
              className={customerOnestopFilter === "all" ? "is-active" : undefined}
              disabled={props.busyKey !== null}
              aria-pressed={customerOnestopFilter === "all"}
              onClick={() => setCustomerOnestopFilter("all")}
            >
              전체 {customerOnestopRows.length}
            </button>
            <button
              type="button"
              className={customerOnestopFilter === "issues" ? "is-active" : undefined}
              disabled={props.busyKey !== null || customerOnestopIssueCount === 0}
              aria-pressed={customerOnestopFilter === "issues"}
              onClick={() => setCustomerOnestopFilter("issues")}
            >
              확인 필요 {customerOnestopIssueCount}
            </button>
            <button
              type="button"
              className={customerOnestopFilter === "password" ? "is-active" : undefined}
              disabled={props.busyKey !== null || customerOnestopPasswordCount === 0}
              aria-pressed={customerOnestopFilter === "password"}
              onClick={() => setCustomerOnestopFilter("password")}
            >
              비밀번호 {customerOnestopPasswordCount}
            </button>
          </div>
        </div>
        {selectedActions}
        {customerOnestopRows.length > 0 ? (
          <div
            ref={customerOnestopTableRef}
            className={[
              "initial-registration-candidate-table-shell",
              "initial-onboarding-review-table-wrap",
              "customer-onestop-review-table-wrap",
              customerOnestopDragSelection ? "is-drag-selecting" : ""
            ].filter(Boolean).join(" ")}
            tabIndex={-1}
            aria-label="고객 추가 대상 표"
            onKeyDown={handleCustomerOnestopTableKeyDown}
            onPaste={handleCustomerOnestopTablePaste}
          >
            <table className="initial-onboarding-review-table customer-onestop-review-table">
              <thead>
                <tr>
                  <th>
                    <input
                      ref={customerOnestopSelectAllInputRef}
                      className="initial-onboarding-review-check initial-onboarding-review-check-all"
                      type="checkbox"
                      checked={allCustomerOnestopVisibleRowsSelected}
                      disabled={props.busyKey !== null || customerOnestopVisibleRows.length === 0}
                      aria-label={allCustomerOnestopVisibleRowsSelected ? "현재 보기 등록 대상 전체 해제" : "현재 보기 등록 대상 전체 선택"}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => {
                        if (customerOnestopVisibleRowIndexes.length > 0) {
                          updateCustomerOnestopRowsSelection(
                            customerOnestopVisibleRowIndexes,
                            !allCustomerOnestopVisibleRowsSelected
                          );
                        }
                      }}
                    />
                  </th>
                  <th>상호명</th>
                  <th>개별 비밀번호</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {customerOnestopVisibleRows.length === 0 ? (
                  <tr className="initial-onboarding-review-empty-row">
                    <td colSpan={4}>
                      <span className="initial-onboarding-review-empty">검색 결과가 없습니다.</span>
                    </td>
                  </tr>
                ) : customerOnestopVisibleRows.map((row) => {
                  const rowSelected = row.selected === true;
                  const statusClassName = getCustomerOnestopRowStatusClass(row);
                  const hasReviewIssues = rowSelected && (row.status === "needs_fix" || row.status === "failed");
                  const rowStatusLabel = getCustomerOnestopRowStatusLabel(row);
                  const rowLabel = getCustomerOnestopRowLabel(row);
                  return (
                    <tr
                      key={`${row.rowIndex}:${getCustomerOnestopCertificateKey(row.certificate)}`}
                      className={[
                        rowSelected ? "is-selected" : "",
                        hasReviewIssues ? "has-review-issues" : "",
                        statusClassName
                      ].filter(Boolean).join(" ") || undefined}
                      aria-selected={rowSelected}
                      onMouseDown={(event) => {
                        beginCustomerOnestopRowMouseSelection(row, rowSelected, event);
                      }}
                      onMouseEnter={() => {
                        extendCustomerOnestopRowMouseSelection(row);
                      }}
                      onMouseUp={() => {
                        setCustomerOnestopDragSelection(null);
                      }}
                      onClick={(event) => {
                        if (props.busyKey !== null || isCustomerOnestopRowInteractiveTarget(event.target)) {
                          return;
                        }
                        if (customerOnestopRowMouseSelectionHandledRef.current) {
                          customerOnestopRowMouseSelectionHandledRef.current = false;
                          return;
                        }
                        applyCustomerOnestopRowSelection(row, !rowSelected, event);
                      }}
                    >
                      <td>
                        <input
                          className="initial-onboarding-review-check"
                          type="checkbox"
                          checked={rowSelected}
                          disabled={props.busyKey !== null}
                          aria-label={`${rowLabel} 등록 대상 선택`}
                          onClick={(event) => {
                            event.stopPropagation();
                            applyCustomerOnestopRowSelection(row, event.currentTarget.checked, event);
                          }}
                          onChange={() => undefined}
                        />
                      </td>
                      <td>
                        <span className="initial-onboarding-review-readonly">
                          {rowLabel}
                        </span>
                      </td>
                      <td>
                        <input
                          className={[
                            "initial-onboarding-review-password",
                            row.status === "needs_fix" && isCustomerOnestopPasswordIssue(row.statusMessage) ? "has-error" : ""
                          ].filter(Boolean).join(" ")}
                          type="password"
                          value={row.certificatePassword}
                          disabled={props.busyKey !== null || !rowSelected}
                          aria-invalid={row.status === "needs_fix" || undefined}
                          title={row.statusMessage || undefined}
                          onClick={(event) => event.stopPropagation()}
                          onPaste={(event) => handleCustomerOnestopPasswordPaste(event, row)}
                          onChange={(event) => applyPasswordFromCustomerOnestopCell(row, event.target.value)}
                          placeholder="공통 비밀번호 사용"
                        />
                      </td>
                      <td>
                        {rowSelected ? (
                          <span className={`initial-onboarding-row-status ${statusClassName}`}>
                            {rowStatusLabel}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            className="context-empty-state customer-onestop-empty"
            title="등록 후보가 없습니다."
            body="공동인증서를 읽거나 파일/폴더를 추가하세요."
          />
        )}
        {customerOnestopUploadSummary &&
        (customerOnestopUploadSummary.warnings.length > 0 ||
          customerOnestopUploadSummary.rejectedFiles.length > 0) ? (
          <div className="customer-onestop-upload-summary">
            {customerOnestopUploadSummary.warnings.slice(0, 3).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            {customerOnestopUploadSummary.rejectedFiles.slice(0, 3).map((file) => (
              <p key={`${file.relativePath}:${file.reason}`}>{file.relativePath}: {file.reason}</p>
            ))}
          </div>
        ) : null}
      </section>
    );
  };

  const renderCustomerOnestopResultStep = () => (
    <section className="customer-detail-section customer-onestop-section">
      <div className="customer-detail-section-head">
        <div>
          <h3>등록 결과</h3>
          <p>
            {customerOnestopResult
              ? `완료 ${customerOnestopResult.completed}건 · 실패 ${customerOnestopResult.failed}건`
              : "결과를 확인하세요."}
          </p>
        </div>
      </div>
      {customerOnestopResult ? (
        <div className="customer-onestop-result-list">
          {customerOnestopResult.items.map((item) => (
            <article key={`${item.rowIndex}:${item.status}`} className={`customer-onestop-result ${item.status}`}>
              <span className={getToneBadgeClass(item.status === "success" ? "success" : "danger")}>
                {item.status === "success" ? "완료" : "실패"}
              </span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.message}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <div className="customer-form-actions">
        <button type="button" className="btn-secondary" onClick={() => setCustomerOnestopStep("source")}>
          목록으로
        </button>
        <button type="button" className="btn-secondary" onClick={closeDetailPanel}>
          닫기
        </button>
      </div>
    </section>
  );

  const renderCustomerOnestopActiveStep = () => {
    if (customerOnestopStep === "result") return renderCustomerOnestopResultStep();
    return renderCustomerOnestopReviewWorkspace();
  };

  const renderCreatePanel = () => (
    <>
      <header className="customer-detail-panel-head">
        <div className="customer-detail-panel-copy">
          <span className="customer-console-kicker">운영 / 신규 등록</span>
          <strong>고객 추가</strong>
          <p>전자세금용 공동인증서로 고객 정보를 확인하고 인증서를 연결합니다.</p>
        </div>
        <div className="customer-detail-panel-head-actions">
          <span className={customerOnestopSelectedCount > 0 ? getToneBadgeClass("success") : getToneBadgeClass("warn")}>
            선택 {customerOnestopSelectedCount}/{customerOnestopRows.length}
          </span>
          <button type="button" className="btn-secondary" onClick={closeDetailPanel}>
            닫기
          </button>
        </div>
      </header>

      <div className="customer-detail-panel-body customer-console-create-body customer-onestop-create-body">
        <section className="customer-detail-section customer-create-progress-card customer-onestop-progress-card">
          <div className="customer-create-progress-head">
            <div>
              <h3>진행 상태</h3>
              <p>{customerOnestopNotice || "인증서를 선택해 등록을 시작하세요."}</p>
            </div>
          </div>
          {renderCustomerOnestopSteps()}
          {customerOnestopError ? (
            <InlineNotice tone="danger" className="customer-onestop-error">
              {customerOnestopError}
            </InlineNotice>
          ) : null}
        </section>
        {renderCustomerOnestopActiveStep()}
      </div>
    </>
  );

  return (
    <motion.div
      className="customers-screen customer-console-screen"
      variants={pageContainerVariants}
      initial={shouldReduceMotion ? false : "hidden"}
      animate={shouldReduceMotion ? undefined : "visible"}
    >
      <div className={`customer-console-shell ${detailPanelOpen ? "is-detail-open" : "is-detail-empty"}`}>
        <motion.section className="customer-summary-grid" aria-label="고객 운영 요약" variants={pageSectionVariants}>
          {customerSummaryCards.map((card) => (
            <SummaryFilterCard
              key={card.key}
              asChild
              active={props.customerListFilter === card.filter}
              tone={card.tone === "warn" ? "warning" : card.tone}
              variant="pill"
              onClick={() => props.setCustomerListFilter(card.filter)}
            >
              <motion.button
                type="button"
                whileHover={getSubtleHoverMotion(shouldReduceMotion)}
                whileTap={getSubtleTapMotion(shouldReduceMotion)}
              >
                <span>{card.label}</span>
                <div className="summary-filter-card-count">
                  <strong>{card.value}</strong>
                </div>
              </motion.button>
            </SummaryFilterCard>
          ))}
          <div className="customer-summary-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={exportSelectedCustomersWorkbook}
              disabled={props.busyKey !== null || checkedVisibleCustomers.length === 0}
              aria-label={
                checkedVisibleCustomers.length > 0
                  ? `선택한 고객 ${checkedVisibleCustomers.length}명 데이터 내보내기`
                  : "선택한 고객 데이터 내보내기"
              }
            >
              <Icon name="download" className="button-icon" />
              내보내기
            </button>
            <button type="button" className="customer-console-primary-cta" onClick={handleCreateCustomer}>
              <Icon name="plus" className="button-icon" />
              고객 추가
            </button>
            {selectedCustomer && !props.creatingCustomer ? (
              customerDetailEditing ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary customer-detail-top-action"
                    disabled={customerDetailSaving}
                    onClick={cancelCustomerDetailEdit}
                  >
                    <Icon name="undo" className="button-icon" />
                    취소
                  </button>
                  <button
                    type="button"
                    className="btn-secondary customer-detail-top-action customer-detail-save-action"
                    disabled={customerDetailSaveBlocked}
                    onClick={saveCustomerDetailEdit}
                  >
                    <Icon name="complete" className="button-icon" />
                    저장
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-secondary customer-detail-top-action"
                  disabled={props.busyKey !== null}
                  onClick={() => setCustomerDetailEditing(true)}
                >
                  <Icon name="edit" className="button-icon" />
                  수정
                </button>
              )
            ) : null}
            <button
              type="button"
              className="btn-secondary customer-console-danger-action"
              onClick={() => {
                const customersToDelete = [...checkedVisibleCustomers];
                if (customersToDelete.length === 0) return;
                void props.runAction(
                  `delete-customers-${customersToDelete.map((customer) => customer.id).join("-")}`,
                  async () => {
                    const deletedCustomerIds = await props.onDeleteCustomers(customersToDelete);
                    setCheckedCustomerIds((prev) => {
                      const next = new Set(prev);
                      deletedCustomerIds.forEach((customerId) => next.delete(customerId));
                      return next;
                    });
                  }
                );
              }}
              disabled={props.busyKey !== null || props.creatingCustomer || checkedVisibleCustomerCount === 0}
              aria-label={
                checkedVisibleCustomerCount > 0
                  ? `선택한 고객 ${checkedVisibleCustomerCount}명 삭제`
                  : "선택한 고객 삭제"
              }
            >
              <Icon name="trash" className="button-icon" />
              {checkedVisibleCustomerCount > 1 ? `${checkedVisibleCustomerCount}명 삭제` : "고객 삭제"}
            </button>
          </div>
        </motion.section>

        <motion.div ref={customerMainColumnRef} className="customer-console-main-column" variants={pageSectionVariants}>
          <header className="customer-console-page-header">
            <SearchField
              variant="console"
              className="customer-console-page-search"
              iconClassName="customer-console-page-search-icon"
              inputClassName="customer-console-page-search-input"
              aria-label="고객 통합 검색"
              placeholder="검색"
              value={props.customerSearchQuery}
              onChange={(event) => {
                props.setCustomerSearchField("all");
                props.setCustomerSearchQuery(event.target.value);
              }}
            />
            <label className="customer-console-page-search-month" aria-label="세금계산서 발행월 검색">
              <span className="customer-console-page-search-month-label">발행월</span>
              <input
                className="customer-console-page-search-input"
                type="month"
                value={selectedCustomerIssueMonthQuery}
                onChange={(event) => props.setCustomerIssueMonthQuery(event.target.value)}
              />
            </label>
          </header>

          <motion.section className="panel panel-customer-list customer-console-panel" layout style={customerListPanelStyle}>
            <div
              ref={customerTableWrapRef}
              className="customer-console-table-wrap"
            >
              <table className="customer-console-table">
                <thead>
                  <tr>
                    <th className="customer-console-col-check" aria-label="선택">
                      <CheckboxControl
                        checked={allVisibleCustomersChecked}
                        readOnly
                        disabled={visibleTableCustomers.length === 0}
                        aria-label="표시된 고객 전체 선택"
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = someVisibleCustomersChecked;
                          }
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleVisibleCustomersChecked();
                        }}
                      />
                    </th>
                    <th>상호명</th>
                    <th className="customer-console-col-owner">대표자명</th>
                    <th className="customer-console-col-status">상태</th>
                  </tr>
                </thead>
                <tbody>{renderCustomerTableRows()}</tbody>
              </table>
            </div>
          </motion.section>

        </motion.div>

        <motion.section
          className={`panel customer-detail-panel ${
            props.creatingCustomer ? "is-create" : selectedCustomer ? "is-detail" : "is-empty"
          }`}
          aria-label={props.creatingCustomer ? "새 고객 등록" : selectedCustomer ? "고객 상세" : "고객 선택 안내"}
          variants={pageSectionVariants}
          layout
        >
          {props.creatingCustomer ? (
            renderCreatePanel()
          ) : selectedCustomer ? (
            renderDetailPanel()
          ) : (
            <div className="issuance-empty-state customer-detail-empty-state is-detail">
              <strong>선택된 고객이 없습니다.</strong>
              <p>왼쪽 목록에서 고객을 선택하면 상세 정보와 발행 이력을 확인할 수 있습니다.</p>
            </div>
          )}
        </motion.section>
      </div>
      {renderCustomerCertificateSelector()}
      {renderCustomerCertificatePasswordDialog()}
    </motion.div>
  );
}
