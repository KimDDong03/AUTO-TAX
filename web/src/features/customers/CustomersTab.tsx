import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { CheckboxControl, Icon } from "../../components/ui";
import type { LocalCertificateUploadSessionResult } from "../../local-renewal-helper";
import type {
  Customer,
  CustomerCertificate,
  CustomerCertificateKind,
  CustomerContractRenewalDueItem,
  CustomerContractSummary,
  CustomerReportDetail,
  CustomerReportMonth,
  InvoiceDraft
} from "../../types";
import type { CustomerCertificateCandidateView } from "../certificates/useCertificatesScreenModel";
import {
  getCustomerCertificateTodayDateKey,
  isCustomerCertificateExpired
} from "../renewal/customerRenewalCertificateUtils";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";
import {
  buildCustomerCertificateOnestopDraftFromCertificate,
  filterCustomerOnestopCertificates,
  findExistingCustomerByBusinessNumber,
  validateCustomerCertificateOnestopDraft,
  type CustomerCertificateOnestopDraft,
  type CustomerCertificateOnestopResult
} from "./customerCertificateOnestop";
import {
  calculateCustomerReportTotals,
  createEmptyCustomerReportDetail,
  deriveContractEndMonth,
  formatCustomerReportIssueDay,
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

type CustomerOnestopStepId = "source" | "password" | "confirm" | "result";
type CustomerRenewalAssistantUpgradeState = "unknown" | "up-to-date" | "upgrade-available" | "upgrade-required";

const CUSTOMER_SEARCH_FIELD_OPTIONS: Array<{
  value: CustomerSearchField;
  label: string;
  placeholder: string;
}> = [
  { value: "all", label: "전체", placeholder: "전체 검색" },
  { value: "corpName", label: "고객명", placeholder: "고객명 검색" },
  { value: "customerName", label: "대표자명", placeholder: "대표자명 검색" },
  { value: "businessNumber", label: "사업자등록번호", placeholder: "사업자등록번호 검색" },
  { value: "phone", label: "전화번호", placeholder: "전화번호 검색" },
  { value: "issueMonth", label: "세금계산서 발행월", placeholder: "예: 2026-05" }
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
  setCustomerListFilter: React.Dispatch<React.SetStateAction<CustomerListFilter>>;
  setCustomerDetailTab: React.Dispatch<React.SetStateAction<CustomerDetailTabId>>;
  setCustomerForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  setCustomerAddressResolveMessage: React.Dispatch<React.SetStateAction<string>>;
  onCreateCustomer: () => void;
  onCancelCreateCustomer: () => void;
  onRefreshCustomerRenewalAssistant: () => Promise<void>;
  onLoadCustomerRenewalCertificates: () => Promise<void>;
  onLoadCustomerAddCertificates: () => Promise<RenewalAgentCertificate[]>;
  onUploadCustomerAddCertificateFiles: (files: File[]) => Promise<LocalCertificateUploadSessionResult>;
  onPreviewCustomerCertificateOnestop: (
    certificate: RenewalAgentCertificate,
    certificatePassword: string
  ) => Promise<{
    draft: CustomerCertificateOnestopDraft;
    message: string;
  }>;
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
  onPrepareCustomerCertificateRenewal: (certificateIndex: string, options?: { showAlert?: boolean }) => Promise<void>;
  onOpenCustomerCertificatePayment: (certificateIndex: string, options?: { showAlert?: boolean }) => Promise<void>;
  onRefreshCustomerCertificateStatus: (customerId: number) => Promise<void>;
  onResetPopbillLink: (customer: Customer) => Promise<void>;
  onDeleteCustomers: (customers: Customer[]) => Promise<number[]>;
  onExportSelectedCustomers: (customers: Customer[], reportYear: number) => Promise<void>;
  onShowDraftPopbillInfo: (draftId: number) => Promise<void>;
  onOpenDraftPopbillUrl: (draftId: number, path: "view-url" | "print-url") => Promise<void>;
  onCustomerReportDetailSaved: (detail: CustomerReportDetail) => void | Promise<void>;
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

function renderCustomerStatusChip(chip: CustomerStatusChip) {
  return (
    <span className={`${getToneBadgeClass(chip.tone)} customer-list-status-chip`} title={chip.detail}>
      {chip.label}
    </span>
  );
}

function parseCustomerTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatCustomerDate(value: string | null | undefined): string {
  const timestamp = parseCustomerTimestamp(value);
  if (timestamp === null) return "-";
  return new Date(timestamp).toLocaleDateString("ko-KR");
}

function formatCustomerMonthLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  return `${match[1]}년 ${Number(match[2])}월`;
}

function getCustomerDraftStatusLabel(status: InvoiceDraft["status"]): string {
  switch (status) {
    case "review":
    case "scheduled":
      return "발행 대기";
    case "failed":
      return "발행 실패";
    case "issuing":
      return "발행 중";
    case "issued":
      return "발행 완료";
    default:
      return status;
  }
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

function createEmptyCustomerOnestopDraft(): CustomerCertificateOnestopDraft {
  return {
    customerName: "",
    businessNumber: "",
    corpName: "",
    addr: "",
    bizType: "전기업",
    bizClass: "태양광발전(자가용PPA)",
    renewalContactMobile: "",
    issueCompleteSmsTemplate: "",
    memo: ""
  };
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
    return `${sourceLabel} 전자세금용 공동인증서 ${filterResult.availableCertificates.length}건을 표시합니다.${suffix}`;
  }
  if (certificates.length > 0) {
    return `${sourceLabel} 표시할 새 전자세금용 공동인증서가 없습니다.${suffix}`;
  }
  return `${sourceLabel} 전자세금용 공동인증서를 찾지 못했습니다.`;
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
  return certificate.certificateKind === "electronic_tax" || usageText.includes("전자세금") || usageText.includes("세금계산서") || nameText.includes("전자세금");
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
  return kind !== "electronic_tax";
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
  const customerSearchFilterRef = useRef<HTMLDivElement | null>(null);
  const [customerSearchFilterOpen, setCustomerSearchFilterOpen] = useState(false);
  const [customerOnestopStep, setCustomerOnestopStep] = useState<CustomerOnestopStepId>("source");
  const [customerOnestopCertificates, setCustomerOnestopCertificates] = useState<RenewalAgentCertificate[]>([]);
  const [customerOnestopCertificateSearchQuery, setCustomerOnestopCertificateSearchQuery] = useState("");
  const [customerOnestopSelectedCertificate, setCustomerOnestopSelectedCertificate] = useState<RenewalAgentCertificate | null>(null);
  const [customerOnestopPassword, setCustomerOnestopPassword] = useState("");
  const [customerOnestopDraft, setCustomerOnestopDraft] = useState<CustomerCertificateOnestopDraft>(createEmptyCustomerOnestopDraft);
  const [customerOnestopNotice, setCustomerOnestopNotice] = useState("");
  const [customerOnestopError, setCustomerOnestopError] = useState("");
  const [customerOnestopUploadSummary, setCustomerOnestopUploadSummary] = useState<LocalCertificateUploadSessionResult | null>(null);
  const [customerOnestopResult, setCustomerOnestopResult] = useState<CustomerCertificateOnestopResult | null>(null);
  const [customerCertificateSelectorOpen, setCustomerCertificateSelectorOpen] = useState(false);
  const [customerCertificateSearchQuery, setCustomerCertificateSearchQuery] = useState("");
  const [customerCertificateSelectedKey, setCustomerCertificateSelectedKey] = useState<string | null>(null);
  const [customerCertificateActionNotice, setCustomerCertificateActionNotice] = useState("");

  useEffect(() => {
    if (!customerSearchFilterOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (customerSearchFilterRef.current?.contains(event.target as Node)) {
        return;
      }
      setCustomerSearchFilterOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [customerSearchFilterOpen]);

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
    setCustomerOnestopCertificates([]);
    setCustomerOnestopCertificateSearchQuery("");
    setCustomerOnestopSelectedCertificate(null);
    setCustomerOnestopPassword("");
    setCustomerOnestopDraft(createEmptyCustomerOnestopDraft());
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
      setCustomerCertificateSelectorOpen(false);
      setCustomerCertificateSearchQuery("");
      setCustomerCertificateSelectedKey(null);
      setCustomerCertificateActionNotice("");
    }
  }, [selectedCustomer?.id]);

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
      if (customerCertificateSelectorOpen) {
        setCustomerCertificateSelectorOpen(false);
        setCustomerCertificateSelectedKey(null);
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
    customerDetailPanelOpen,
    props.creatingCustomer,
    props.onCancelCreateCustomer,
    props.setCustomerDetailTab
  ]);

  const activeFilterCopy: Record<
    CustomerListFilter,
    {
      title: string;
      empty: string;
      body: string;
    }
  > = {
    all: {
      title: "전체 고객",
      empty: "등록된 고객이 없습니다.",
      body: "새 고객부터 등록하세요."
    },
    unissued: {
      title: "이번 달 미발행 고객",
      empty: "이번 달 미발행 고객이 없습니다.",
      body: "이번 달 세금계산서 발행은 모두 끝났습니다."
    },
    "certificate-expiration": {
      title: "인증서 만료 예정 고객",
      empty: "인증서 만료 예정 고객이 없습니다.",
      body: "만료됐거나 30일 안에 만료되는 인증서가 없습니다."
    },
    "contract-expiration": {
      title: "계약 만료 예정 고객",
      empty: "계약 만료 예정 고객이 없습니다.",
      body: "계약 갱신 대상 고객이 없습니다."
    }
  };

  const getCustomerCertificateDays = (customer: Customer) => {
    if (!customer.popbillCertExpireDate) return null;
    const expireTime = new Date(customer.popbillCertExpireDate).getTime();
    if (!Number.isFinite(expireTime)) return null;
    return Math.ceil((expireTime - Date.now()) / (1000 * 60 * 60 * 24));
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
  const customerOnestopRequiredFieldChecks = [
    { label: "대표자명", done: customerOnestopDraft.customerName.trim() !== "" },
    { label: "사업자번호", done: customerOnestopDraft.businessNumber.trim() !== "" },
    { label: "상호", done: customerOnestopDraft.corpName.trim() !== "" },
    { label: "주소", done: customerOnestopDraft.addr.trim() !== "" },
    { label: "업태", done: customerOnestopDraft.bizType.trim() !== "" },
    { label: "업종", done: customerOnestopDraft.bizClass.trim() !== "" }
  ];
  const customerOnestopMissingFieldLabels = validateCustomerCertificateOnestopDraft(customerOnestopDraft);
  const customerOnestopRequiredCompletedCount = customerOnestopRequiredFieldChecks.filter((field) => field.done).length;
  const customerOnestopExistingCustomer = findExistingCustomerByBusinessNumber(props.customers, customerOnestopDraft.businessNumber);
  const customerCertificateTodayDateKey = getCustomerCertificateTodayDateKey();
  const customerOnestopCertificateFilter = useMemo(
    () =>
      filterCustomerOnestopCertificates({
        certificates: customerOnestopCertificates,
        customers: props.customers,
        customerCertificates: props.customerCertificates,
        searchQuery: customerOnestopCertificateSearchQuery,
        todayDateKey: customerCertificateTodayDateKey
      }),
    [
      customerOnestopCertificates,
      props.customers,
      props.customerCertificates,
      customerOnestopCertificateSearchQuery,
      customerCertificateTodayDateKey
    ]
  );
  const customerOnestopCanExecute =
    Boolean(customerOnestopSelectedCertificate) &&
    customerOnestopPassword.trim() !== "" &&
    customerOnestopMissingFieldLabels.length === 0 &&
    !customerOnestopExistingCustomer &&
    props.busyKey === null;
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

  const selectCustomerOnestopCertificate = (certificate: RenewalAgentCertificate) => {
    setCustomerOnestopSelectedCertificate(certificate);
    setCustomerOnestopPassword("");
    setCustomerOnestopDraft(buildCustomerCertificateOnestopDraftFromCertificate(certificate));
    setCustomerOnestopResult(null);
    setCustomerOnestopError("");
    setCustomerOnestopNotice("공동인증서 비밀번호를 입력하면 고객 정보 확인으로 넘어갑니다.");
    setCustomerOnestopStep("password");
  };

  const loadCustomerOnestopPcCertificates = () => {
    void props.runAction(
      "customer-add-load-certificates",
      async () => {
        try {
          setCustomerOnestopError("");
          setCustomerOnestopUploadSummary(null);
          const certificates = await props.onLoadCustomerAddCertificates();
          const filterResult = filterCustomerOnestopCertificates({
            certificates,
            customers: props.customers,
            customerCertificates: props.customerCertificates,
            todayDateKey: customerCertificateTodayDateKey
          });
          setCustomerOnestopCertificates(certificates);
          setCustomerOnestopCertificateSearchQuery("");
          setCustomerOnestopNotice(buildCustomerOnestopCertificateNotice("PC에서", certificates, filterResult));
          if (filterResult.availableCertificates.length === 1) {
            selectCustomerOnestopCertificate(filterResult.availableCertificates[0]!);
          }
        } catch (error) {
          setCustomerOnestopError(getCustomerOnestopErrorMessage(error, "공동인증서 목록을 읽지 못했습니다."));
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
          const filterResult = filterCustomerOnestopCertificates({
            certificates,
            customers: props.customers,
            customerCertificates: props.customerCertificates,
            todayDateKey: customerCertificateTodayDateKey
          });
          setCustomerOnestopUploadSummary(result);
          setCustomerOnestopCertificates(certificates);
          setCustomerOnestopCertificateSearchQuery("");
          setCustomerOnestopNotice(buildCustomerOnestopCertificateNotice("업로드한 파일에서", certificates, filterResult));
          if (filterResult.availableCertificates.length === 1) {
            selectCustomerOnestopCertificate(filterResult.availableCertificates[0]!);
          }
        } catch (error) {
          setCustomerOnestopError(getCustomerOnestopErrorMessage(error, "인증서 파일을 읽지 못했습니다."));
        }
      },
      { reload: false }
    );
  };

  const confirmCustomerOnestopPassword = () => {
    if (!customerOnestopSelectedCertificate) {
      setCustomerOnestopError("먼저 전자세금용 공동인증서를 선택하세요.");
      return;
    }

    void props.runAction(
      "customer-add-preflight",
      async () => {
        try {
          setCustomerOnestopError("");
          const result = await props.onPreviewCustomerCertificateOnestop(
            customerOnestopSelectedCertificate,
            customerOnestopPassword
          );
          const existingCustomer = findExistingCustomerByBusinessNumber(props.customers, result.draft.businessNumber);
          if (existingCustomer) {
            const selectedCertificateKey = getCustomerOnestopCertificateKey(customerOnestopSelectedCertificate);
            setCustomerOnestopCertificates((prev) =>
              prev.filter((certificate) => getCustomerOnestopCertificateKey(certificate) !== selectedCertificateKey)
            );
            setCustomerOnestopSelectedCertificate(null);
            setCustomerOnestopPassword("");
            setCustomerOnestopNotice(
              `이미 등록된 고객이라 목록에서 제외했습니다: ${existingCustomer.corpName || existingCustomer.customerName}`
            );
            setCustomerOnestopStep("source");
            return;
          }
          setCustomerOnestopDraft(result.draft);
          setCustomerOnestopNotice(result.message);
          setCustomerOnestopStep("confirm");
        } catch (error) {
          setCustomerOnestopError(getCustomerOnestopErrorMessage(error, "고객 기본값을 읽지 못했습니다."));
        }
      },
      { reload: false }
    );
  };

  const executeCustomerOnestopRegistration = () => {
    if (!customerOnestopSelectedCertificate) {
      setCustomerOnestopError("먼저 전자세금용 공동인증서를 선택하세요.");
      return;
    }

    void props.runAction(
      "customer-add-onestop",
      async () => {
        try {
          setCustomerOnestopError("");
          const result = await props.onExecuteCustomerCertificateOnestop({
            certificate: customerOnestopSelectedCertificate,
            draft: customerOnestopDraft,
            certificatePassword: customerOnestopPassword
          });
          setCustomerOnestopResult(result);
          setCustomerOnestopNotice("등록 실행 결과를 확인하세요. 실패한 단계만 같은 화면에서 다시 시도할 수 있습니다.");
          setCustomerOnestopStep("result");
        } catch (error) {
          setCustomerOnestopError(getCustomerOnestopErrorMessage(error, "고객 원스톱 등록에 실패했습니다."));
        }
      },
      { reload: false }
    );
  };

  const updateCustomerOnestopDraft = <K extends keyof CustomerCertificateOnestopDraft>(
    key: K,
    value: CustomerCertificateOnestopDraft[K]
  ) => {
    setCustomerOnestopDraft((prev) => ({
      ...prev,
      [key]: value
    }));
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
    if (days !== null && days <= 30) {
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
  const getLatestIssuedDraftForCustomer = (customerId: number) => props.issuedDraftsByCustomerId.get(customerId)?.[0] ?? null;
  const currentBillingMonth = getCurrentSeoulBillingMonth();
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
  const unissuedThisMonthCustomerCount = props.customers.filter((customer) => !issuedThisMonthCustomerIds.has(customer.id)).length;
  const certificateExpirationCustomerCount = props.expiredCertCustomers.length + props.expiringSoonCustomerCount;
  const visibleTableCustomers = props.filteredCustomers;
  const visibleCustomerIdSet = useMemo(() => new Set(visibleTableCustomers.map((customer) => customer.id)), [visibleTableCustomers]);
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
    selectedCustomerCertificateItems.find((item) => item.certificateKind === "electronic_tax") ?? null;
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
      ? props.customerRenewalAssistantUpgradeMessage || "로컬 헬퍼를 업데이트한 뒤 다시 시도하세요."
      : !props.customerRenewalAssistantOnline
        ? props.customerRenewalAssistantHelperMessage || "고객 PC에서 로컬 헬퍼를 실행하세요."
        : "";
  const unlinkedCustomerCertificateItems = props.customerCertificateItems.filter(
    (item) =>
      item.linkedCustomerId === null &&
      isNonElectronicTaxCertificateKind(item.certificateKind) &&
      !isCustomerCertificateExpired(item.certificateExpireDate, customerCertificateTodayDateKey)
  );
  const visibleCustomerCertificateCandidates = unlinkedCustomerCertificateItems
    .filter((item) => {
      const query = customerCertificateSearchQuery.trim().toLowerCase();
      if (!query) return true;
      return [
        item.certificateCn,
        item.certificateUsage,
        item.issuerName,
        item.suggestedCustomerLabel,
        getCustomerCertificateKindLabel(item.certificateKind)
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
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

  const prepareSelectedCustomerGeneralCertificateRenewal = () => {
    if (!selectedCustomerGeneralCertificate) {
      return;
    }

    void props.runAction(
      `customer-certificate-prepare-${selectedCustomerGeneralCertificate.certificateIndex}`,
      async () => {
        await props.onPrepareCustomerCertificateRenewal(selectedCustomerGeneralCertificate.certificateIndex, { showAlert: false });
        setCustomerCertificateActionNotice("갱신 준비가 완료됐습니다. 결제 열기를 이어서 실행하세요.");
      },
      { reload: false }
    );
  };

  const openSelectedCustomerGeneralCertificatePayment = () => {
    if (!selectedCustomerGeneralCertificate) {
      return;
    }

    void props.runAction(
      `customer-certificate-payment-${selectedCustomerGeneralCertificate.certificateIndex}`,
      async () => {
        await props.onOpenCustomerCertificatePayment(selectedCustomerGeneralCertificate.certificateIndex, { showAlert: false });
        setCustomerCertificateActionNotice("결제 창을 열었습니다. 결제를 마치고 고객 탭으로 돌아오세요.");
      },
      { reload: false }
    );
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
                    헬퍼 다운로드
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
                공동인증서 읽기
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
    props.customerSearchQuery.trim() !== "";
  const selectedCustomerSearchFieldOption =
    CUSTOMER_SEARCH_FIELD_OPTIONS.find((option) => option.value === props.customerSearchField) ?? CUSTOMER_SEARCH_FIELD_OPTIONS[0]!;
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
        <tr className="customer-console-empty-row">
          <td colSpan={4}>
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
    const customerMemoValue = props.customerForm.id === selectedCustomer.id ? props.customerForm.memo : selectedCustomer.memo;
    const customerMemoChanged = customerMemoValue !== selectedCustomer.memo;
    const customerMemoSaveStatus = props.isSavingCustomer
      ? "저장 중..."
      : customerMemoChanged
        ? "저장 대기"
        : "저장됨";
    const contractEndMonth = deriveContractEndMonth(reportProfile.contractStartMonth);
    const customerHistorySummaryText =
      props.mailboxDataLoading && props.selectedCustomerIssuedDrafts.length === 0
        ? "발행 이력을 불러오는 중입니다."
        : selectedRecentIssuedDraft
          ? `최근 발행 ${props.formatDateTime(selectedRecentIssuedDraft.issuedAt)}`
          : "아직 발행 이력이 없습니다.";
    const contractPeriodLabel = reportProfile.contractStartMonth
      ? `${formatCustomerMonthLabel(reportProfile.contractStartMonth)} ~ ${formatCustomerMonthLabel(contractEndMonth)}`
      : "계약기간 미입력";
    const selectedContractRenewalDueItem =
      props.contractRenewalDueItems.find((item) => item.customerId === selectedCustomer.id) ?? null;
    const solarCapacityLabel =
      reportProfile.solarCapacityKw !== null && reportProfile.solarCapacityKw !== undefined
        ? `${reportProfile.solarCapacityKw} KW`
        : "미입력";
    const contractPeriodSummaryLabel = reportProfile.contractStartMonth
      ? `${formatCustomerMonthLabel(reportProfile.contractStartMonth)} ~ ${formatCustomerMonthLabel(contractEndMonth)}`
      : "미입력";
    const resetCustomerDetailEditDraft = () => {
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
        hasInvalidCustomerReportIssueDateDraft ||
        customerReportDetail.loading ||
        customerReportDetail.saving ||
        props.busyKey !== null
      ) {
        return;
      }
      void props.runAction(
        `save-customer-detail-${selectedCustomer.id}`,
        async () => {
          if (customerMemoChanged) {
            await props.onSaveCustomerMemo(selectedCustomer.id, customerMemoValue);
          }
          const reportSaved = await customerReportDetail.save();
          if (!reportSaved) {
            return;
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
    const customerDetailSaving =
      props.busyKey !== null || props.isSavingCustomer || customerReportDetail.saving;
    const customerDetailSaveBlocked =
      customerDetailSaving || hasInvalidCustomerReportIssueDateDraft;

    return (
      <div
        className={`customer-detail-panel-body customer-detail-option3-body ${
          customerDetailEditing ? "is-editing" : "is-readonly"
        }`}
      >
        <div className="customer-detail-overview">
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
              <div className="wide">
                <dt>사업장 주소</dt>
                <dd>{selectedCustomer.addr || "-"}</dd>
              </div>
            </dl>
            {customerDetailEditing ? (
              <label className="customer-detail-memo-field">
                메모
                <textarea
                  rows={1}
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
              </label>
            ) : (
              <div className="customer-detail-read-row customer-detail-memo-summary">
                <span>메모</span>
                <p>{customerMemoValue.trim() || "-"}</p>
              </div>
            )}
          </section>

          <section className="customer-detail-section customer-info-card customer-report-summary-card">
            <div className="customer-detail-section-head">
              <h3>신고 합계</h3>
            </div>
            <div className="customer-report-totals customer-report-summary-totals" aria-label="신고 이력 합계">
              <div>
                <span>1분기합계</span>
                <strong>{props.formatMoney(selectedReportTotals.firstHalf)}원</strong>
              </div>
              <div>
                <span>2분기합계</span>
                <strong>{props.formatMoney(selectedReportTotals.secondHalf)}원</strong>
              </div>
              <div>
                <span>공급가액</span>
                <strong>{props.formatMoney(selectedReportTotals.supply)}원</strong>
              </div>
              <div>
                <span>부가세</span>
                <strong>{props.formatMoney(selectedReportTotals.vat)}원</strong>
              </div>
              <div>
                <span>총계</span>
                <strong>{props.formatMoney(selectedReportTotals.annual)}원</strong>
              </div>
            </div>
          </section>

          <div className="customer-detail-overview-side">
            <section className="customer-detail-section customer-info-card customer-info-contract-card">
              <div className="customer-detail-section-head customer-report-auto-save-head">
                <h3>계약/발행</h3>
                <span className={customerReportDetail.error ? "customer-auto-save-status tone-danger" : customerReportDetail.saving ? "customer-auto-save-status" : "customer-auto-save-status tone-success"}>
                  {customerReportDetail.error || customerReportSaveStatus}
                </span>
              </div>
              <div className="customer-history-summary" aria-label="운영 이력 요약">
                <div className="customer-history-summary-main">
                  <span>운영 이력</span>
                  <strong>{props.selectedCustomerIssuedDrafts.length}건</strong>
                  <em>{customerHistorySummaryText}</em>
                </div>
                <button type="button" className="btn-ghost customer-history-detail-button" onClick={() => setCustomerHistoryDetailOpen(true)}>
                  상세정보보기
                </button>
              </div>
              {customerDetailEditing ? (
                <div className="customer-report-profile-grid customer-info-contract-grid">
                  <label>
                    태양광 용량 KW
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={reportProfile.solarCapacityKw ?? ""}
                      onInput={(event) => updateCustomerReportProfile("solarCapacityKw", parseNullableNumberInput(event.currentTarget.value))}
                      onChange={(event) => updateCustomerReportProfile("solarCapacityKw", parseNullableNumberInput(event.target.value))}
                    />
                  </label>
                  <label className="customer-contract-period-field">
                    계약기간
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
                  </label>
                </div>
              ) : (
                <dl className="customer-detail-context-grid customer-info-contract-summary">
                  <div>
                    <dt>태양광 용량 KW</dt>
                    <dd>{solarCapacityLabel}</dd>
                  </div>
                  <div>
                    <dt>계약기간</dt>
                    <dd>{contractPeriodSummaryLabel}</dd>
                  </div>
                </dl>
              )}
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
                    </div>
                    {renderCustomerCertificateMeta(
                      selectedCustomerGeneralCertificate,
                      selectedCustomerGeneralCertificateStatus.detail || "갱신 준비와 결제에 사용할 범용 인증서를 연결하세요."
                    )}
                    {selectedCustomerGeneralCertificate?.paymentAmount ? (
                      <small>결제 예정 {selectedCustomerGeneralCertificate.paymentAmount}</small>
                    ) : null}
                  </div>
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
              </div>
              {customerDetailEditing && customerCertificateActionNotice ? (
                <p className="customer-certificate-action-notice">{customerCertificateActionNotice}</p>
              ) : null}
            </section>
          </div>
        </div>

        <section className="customer-detail-section customer-report-history-section">
            <div className="customer-detail-section-head customer-report-history-head">
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
            </div>
            {customerReportDetail.loading ? <p className="customer-detail-card-note">신고 상세를 불러오는 중입니다.</p> : null}
            {customerReportDetail.error ? <p className="customer-detail-card-note tone-danger">{customerReportDetail.error}</p> : null}
            <div className="customer-report-table-wrap">
              <table className="customer-report-table">
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
                    return (
                      <tr key={month.reportMonth}>
                        <td>{month.reportMonth}월</td>
                        <td>
                          {customerDetailEditing ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="-"
                              aria-label={`${month.reportMonth}월 발행일`}
                              aria-invalid={issueDateInvalid}
                              value={issueDateInputValue}
                              onInput={(event) => updateCustomerReportIssueDay(month.reportMonth, event.currentTarget.value)}
                              onChange={(event) => updateCustomerReportIssueDay(month.reportMonth, event.target.value)}
                              onBlur={() => normalizeCustomerReportIssueDayDraft(month.reportMonth)}
                            />
                          ) : (
                            <span className="customer-report-read-value">{formatCustomerReportIssueDay(month.issueDate) || "-"}</span>
                          )}
                        </td>
                        <td>
                          {customerDetailEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="-"
                              value={month.supplyAmount > 0 ? month.supplyAmount : ""}
                              onInput={(event) => updateCustomerReportSupplyAmount(month.reportMonth, event.currentTarget.value)}
                              onChange={(event) => updateCustomerReportSupplyAmount(month.reportMonth, event.target.value)}
                            />
                          ) : (
                            <span className="customer-report-read-value">
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
                              placeholder="-"
                              value={month.vatAmount > 0 ? month.vatAmount : ""}
                              onInput={(event) => updateCustomerReportVatAmount(month.reportMonth, event.currentTarget.value)}
                              onChange={(event) => updateCustomerReportVatAmount(month.reportMonth, event.target.value)}
                            />
                          ) : (
                            <span className="customer-report-read-value">
                              {month.vatAmount > 0 ? props.formatMoney(month.vatAmount) : "-"}
                            </span>
                          )}
                        </td>
                        <td className="customer-report-total-cell">
                          {month.supplyAmount + month.vatAmount > 0 ? `${props.formatMoney(month.supplyAmount + month.vatAmount)}원` : "-"}
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

          <div className="customer-detail-edit-footer" aria-label="고객 상세 수정">
            <div className="customer-detail-edit-actions">
              {customerDetailEditing ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={customerDetailSaving}
                    onClick={cancelCustomerDetailEdit}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={customerDetailSaveBlocked}
                    onClick={saveCustomerDetailEdit}
                  >
                    저장
                  </button>
                </>
              ) : (
                <button type="button" className="btn-secondary" disabled={props.busyKey !== null} onClick={() => setCustomerDetailEditing(true)}>
                  수정
                </button>
              )}
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
                    <h3 id="customer-history-detail-title">고객 상세정보</h3>
                    <p>{selectedCustomer.corpName || selectedCustomer.customerName || "선택 고객"}</p>
                  </div>
                  <button type="button" className="btn-ghost" onClick={() => setCustomerHistoryDetailOpen(false)}>
                    닫기
                  </button>
                </header>
                <div className="customer-history-detail-grid">
                  <div className="customer-history-detail-column">
                    <div className="customer-history-detail-column-head">
                      <h4>운영 이력</h4>
                      <span>{props.selectedCustomerIssuedDrafts.length}건</span>
                    </div>
                    {props.selectedCustomerIssuedDrafts.length > 0 ? (
                      <div className="customer-history-detail-list">
                        {props.selectedCustomerIssuedDrafts.map((draft) => (
                          <div key={draft.id} className="customer-history-detail-row">
                            <div>
                              <strong>{formatCustomerMonthLabel(draft.billingMonth)}</strong>
                              <span>{getCustomerDraftStatusLabel(draft.status)}</span>
                            </div>
                            <dl>
                              <div>
                                <dt>발행일</dt>
                                <dd>{props.formatDateTime(draft.issuedAt ?? draft.issueRequestedAt ?? draft.createdAt)}</dd>
                              </div>
                              <div>
                                <dt>합계액</dt>
                                <dd>{props.formatMoney(draft.totalAmount)}원</dd>
                              </div>
                            </dl>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="customer-history-detail-empty">
                        {props.mailboxDataLoading ? "발행 이력을 불러오는 중입니다." : "아직 발행 이력이 없습니다."}
                      </p>
                    )}
                  </div>
                  <div className="customer-history-detail-column">
                    <div className="customer-history-detail-column-head">
                      <h4>계약기간</h4>
                      <span>{selectedContractRenewalDueItem ? "갱신 예정" : "현재"}</span>
                    </div>
                    <dl className="customer-history-contract-list">
                      <div>
                        <dt>현재 계약기간</dt>
                        <dd>{contractPeriodLabel}</dd>
                      </div>
                      <div>
                        <dt>태양광 용량</dt>
                        <dd>{reportProfile.solarCapacityKw !== null ? `${reportProfile.solarCapacityKw} KW` : "-"}</dd>
                      </div>
                      {selectedContractRenewalDueItem ? (
                        <>
                          <div>
                            <dt>다음 계약기간</dt>
                            <dd>
                              {formatCustomerMonthLabel(selectedContractRenewalDueItem.nextContractStartMonth)} ~{" "}
                              {formatCustomerMonthLabel(selectedContractRenewalDueItem.nextContractEndMonth)}
                            </dd>
                          </div>
                          <div>
                            <dt>상태</dt>
                            <dd>{selectedContractRenewalDueItem.status === "overdue" ? "계약 만료" : "계약 만료 예정"}</dd>
                          </div>
                        </>
                      ) : null}
                    </dl>
                    <p className="customer-history-detail-empty">이전 계약기간 기록은 아직 저장된 항목이 없습니다.</p>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
    );
  };

  const renderCustomerOnestopSteps = () => {
    const steps: Array<{ id: CustomerOnestopStepId; label: string }> = [
      { id: "source", label: "인증서 선택" },
      { id: "password", label: "비밀번호" },
      { id: "confirm", label: "정보 확인" },
      { id: "result", label: "결과" }
    ];
    const activeIndex = steps.findIndex((step) => step.id === customerOnestopStep);
    return (
      <div className="customer-onestop-steps" aria-label="고객 등록 단계">
        {steps.map((step, index) => (
          <span
            key={step.id}
            className={[
              "customer-onestop-step",
              step.id === customerOnestopStep ? "is-active" : "",
              index < activeIndex ? "is-done" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {step.label}
          </span>
        ))}
      </div>
    );
  };

  const renderCustomerOnestopCertificateList = () => {
    if (customerOnestopCertificates.length === 0) {
      return (
        <div className="context-empty-state customer-onestop-empty">
          <strong>인증서 없음</strong>
          <p>PC에서 찾기 또는 파일/폴더 올리기를 실행하세요.</p>
        </div>
      );
    }

    if (customerOnestopCertificateFilter.availableCertificates.length === 0) {
      const hiddenSummary = formatCustomerOnestopHiddenCertificateSummary(customerOnestopCertificateFilter);
      return (
        <div className="context-empty-state customer-onestop-empty">
          <strong>표시할 인증서 없음</strong>
          <p>{hiddenSummary || "만료되었거나 이미 등록된 고객의 인증서는 제외했습니다."}</p>
        </div>
      );
    }

    if (customerOnestopCertificateFilter.visibleCertificates.length === 0) {
      return (
        <div className="context-empty-state customer-onestop-empty">
          <strong>검색 결과 없음</strong>
          <p>인증서명, 발급기관, 만료일로 다시 검색하세요.</p>
        </div>
      );
    }

    return (
      <div className="customer-onestop-certificate-list">
        {customerOnestopCertificateFilter.visibleCertificates.map((certificate) => {
          const selected =
            customerOnestopSelectedCertificate &&
            getCustomerOnestopCertificateKey(customerOnestopSelectedCertificate) ===
              getCustomerOnestopCertificateKey(certificate);
          return (
            <button
              type="button"
              key={getCustomerOnestopCertificateKey(certificate)}
              className={selected ? "customer-onestop-certificate is-selected" : "customer-onestop-certificate"}
              onClick={() => selectCustomerOnestopCertificate(certificate)}
            >
              <Icon name="cert" className="customer-onestop-certificate-icon" />
              <span>
                <strong>{certificate.cn || "이름 없는 인증서"}</strong>
                <small>{certificate.usageToName || "용도 미상"} · {certificate.issuerToName || "발급기관 미상"}</small>
                <small>만료 {formatCustomerOnestopCertificateExpireDate(certificate.todate ?? certificate.detailValidateTo)}</small>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderCustomerOnestopSourceStep = () => {
    const directoryInputProps = {
      type: "file",
      multiple: true,
      directory: "",
      webkitdirectory: "",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        uploadCustomerOnestopFiles(files);
      }
    } as React.InputHTMLAttributes<HTMLInputElement> & { directory: string; webkitdirectory: string };

    return (
      <section className="customer-detail-section customer-onestop-section">
        <div className="customer-detail-section-head">
          <div>
            <h3>전자세금용 공동인증서 선택</h3>
            <p>PC에 있는 인증서를 찾거나 NPKI 파일/폴더를 로컬 헬퍼로만 보냅니다.</p>
          </div>
        </div>
        <div className="customer-onestop-source-actions">
          <button type="button" onClick={loadCustomerOnestopPcCertificates} disabled={props.busyKey !== null}>
            <Icon name="search" />
            PC에서 찾기
          </button>
          <label className="customer-onestop-file-button">
            <Icon name="cert" />
            로컬 파일 올리기
            <input
              type="file"
              multiple
              accept=".der,.key"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                uploadCustomerOnestopFiles(files);
              }}
            />
          </label>
          <label className="customer-onestop-file-button">
            <Icon name="dashboard" />
            폴더 올리기
            <input {...directoryInputProps} />
          </label>
        </div>
        {customerOnestopCertificateFilter.availableCertificates.length > 0 ? (
          <label className="customer-onestop-certificate-search" aria-label="인증서 검색">
            <Icon name="search" className="customer-onestop-certificate-search-icon" />
            <input
              type="search"
              placeholder="인증서명, 발급기관, 만료일 검색"
              value={customerOnestopCertificateSearchQuery}
              onChange={(event) => setCustomerOnestopCertificateSearchQuery(event.target.value)}
            />
          </label>
        ) : null}
        {renderCustomerOnestopCertificateList()}
        {customerOnestopUploadSummary ? (
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

  const renderCustomerOnestopPasswordStep = () => (
    <section className="customer-detail-section customer-onestop-section">
      <div className="customer-detail-section-head">
        <div>
          <h3>비밀번호</h3>
          <p>{customerOnestopSelectedCertificate?.cn || "선택한 인증서"} 확인에만 사용합니다.</p>
        </div>
      </div>
      <label className="customer-onestop-password">
        공동인증서 비밀번호
        <input
          type="password"
          autoComplete="off"
          value={customerOnestopPassword}
          onChange={(event) => setCustomerOnestopPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirmCustomerOnestopPassword();
            }
          }}
        />
      </label>
      <div className="customer-form-actions">
        <button type="button" className="btn-secondary" onClick={() => setCustomerOnestopStep("source")}>
          이전
        </button>
        <button type="button" onClick={confirmCustomerOnestopPassword} disabled={props.busyKey !== null || customerOnestopPassword.trim() === ""}>
          고객 정보 확인
        </button>
      </div>
    </section>
  );

  const renderCustomerOnestopConfirmStep = () => (
    <section className="customer-detail-section customer-onestop-section">
      <div className="customer-detail-section-head">
        <div>
          <h3>고객 정보 확인</h3>
          <p>
            {customerOnestopExistingCustomer
              ? `이미 등록된 사업자번호입니다: ${customerOnestopExistingCustomer.corpName || customerOnestopExistingCustomer.customerName}`
              : customerOnestopMissingFieldLabels.length > 0
                ? `남은 항목: ${customerOnestopMissingFieldLabels.join(", ")}`
                : "확인 후 한 번에 실행합니다."}
          </p>
        </div>
      </div>
      <div className="customer-onestop-form-grid">
        <label>
          대표자명
          <input value={customerOnestopDraft.customerName} onChange={(event) => updateCustomerOnestopDraft("customerName", event.target.value)} />
        </label>
        <label>
          사업자번호
          <input value={customerOnestopDraft.businessNumber} onChange={(event) => updateCustomerOnestopDraft("businessNumber", event.target.value)} />
        </label>
        <label>
          세금계산서 상호
          <input value={customerOnestopDraft.corpName} onChange={(event) => updateCustomerOnestopDraft("corpName", event.target.value)} />
        </label>
        <label className="wide">
          주소
          <input value={customerOnestopDraft.addr} onChange={(event) => updateCustomerOnestopDraft("addr", event.target.value)} />
        </label>
        <label>
          업태
          <input value={customerOnestopDraft.bizType} onChange={(event) => updateCustomerOnestopDraft("bizType", event.target.value)} />
        </label>
        <label>
          업종
          <input value={customerOnestopDraft.bizClass} onChange={(event) => updateCustomerOnestopDraft("bizClass", event.target.value)} />
        </label>
        <label>
          고객 연락처
          <input value={customerOnestopDraft.renewalContactMobile} onChange={(event) => updateCustomerOnestopDraft("renewalContactMobile", event.target.value)} />
        </label>
        <label className="wide">
          메모
          <textarea rows={3} value={customerOnestopDraft.memo} onChange={(event) => updateCustomerOnestopDraft("memo", event.target.value)} />
        </label>
      </div>
      <div className="customer-create-progress-list" aria-label="고객 정보 입력 상태">
        {customerOnestopRequiredFieldChecks.map((field) => (
          <span key={field.label} className={field.done ? "customer-create-progress-chip is-complete" : "customer-create-progress-chip"}>
            {field.label}
          </span>
        ))}
      </div>
      <div className="customer-form-actions">
        <button type="button" className="btn-secondary" onClick={() => setCustomerOnestopStep("password")}>
          이전
        </button>
        <button type="button" onClick={executeCustomerOnestopRegistration} disabled={!customerOnestopCanExecute}>
          등록 실행
        </button>
      </div>
    </section>
  );

  const renderCustomerOnestopResultStep = () => (
    <section className="customer-detail-section customer-onestop-section">
      <div className="customer-detail-section-head">
        <div>
          <h3>등록 결과</h3>
          <p>{customerOnestopResult?.customer.corpName || customerOnestopResult?.customer.customerName || "결과를 확인하세요."}</p>
        </div>
      </div>
      {customerOnestopResult ? (
        <div className="customer-onestop-result-list">
          {customerOnestopResult.steps.map((step) => (
            <article key={step.key} className={`customer-onestop-result ${step.status}`}>
              <span className={getToneBadgeClass(step.status === "success" ? "success" : step.status === "failed" ? "danger" : "default")}>
                {step.status === "success" ? "완료" : step.status === "failed" ? "실패" : "보류"}
              </span>
              <div>
                <strong>{step.label}</strong>
                <p>{step.message}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <div className="customer-form-actions">
        <button type="button" className="btn-secondary" onClick={closeDetailPanel}>
          닫기
        </button>
        {customerOnestopResult?.canRetryPopbillJoin || customerOnestopResult?.canRetryCertificateRegistration ? (
          <button type="button" onClick={executeCustomerOnestopRegistration} disabled={props.busyKey !== null}>
            실패 단계 재시도
          </button>
        ) : null}
      </div>
    </section>
  );

  const renderCustomerOnestopActiveStep = () => {
    if (customerOnestopStep === "password") return renderCustomerOnestopPasswordStep();
    if (customerOnestopStep === "confirm") return renderCustomerOnestopConfirmStep();
    if (customerOnestopStep === "result") return renderCustomerOnestopResultStep();
    return renderCustomerOnestopSourceStep();
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
          <span className={customerOnestopRequiredCompletedCount === customerOnestopRequiredFieldChecks.length ? getToneBadgeClass("success") : getToneBadgeClass("warn")}>
            필수 {customerOnestopRequiredCompletedCount}/{customerOnestopRequiredFieldChecks.length}
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
          {customerOnestopError ? <p className="customer-onestop-error">{customerOnestopError}</p> : null}
        </section>
        {renderCustomerOnestopActiveStep()}
      </div>
    </>
  );

  return (
    <div className="customers-screen customer-console-screen">
      <div className="customer-console-shell">
        <section className="customer-summary-grid" aria-label="고객 운영 요약">
          {customerSummaryCards.map((card) => (
            <button
              key={card.key}
              type="button"
              className={[
                "customer-summary-card",
                props.customerListFilter === card.filter ? "is-active" : "",
                card.tone === "danger"
                  ? "tone-danger"
                  : card.tone === "warn"
                    ? "tone-warn"
                    : card.tone === "success"
                      ? "tone-success"
                      : ""
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={props.customerListFilter === card.filter}
              onClick={() => props.setCustomerListFilter(card.filter)}
            >
              <span>{card.label}</span>
              <div className="customer-summary-card-row">
                <strong>{card.value}</strong>
              </div>
            </button>
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
        </section>

        <div ref={customerMainColumnRef} className="customer-console-main-column">
          <header className="customer-console-page-header">
            <div ref={customerSearchFilterRef} className="customer-console-field-filter">
              <button
                type="button"
                className="customer-console-field-filter-trigger"
                onClick={() => setCustomerSearchFilterOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={customerSearchFilterOpen}
                aria-label="검색 필터"
              >
                <Icon name="filter" className="customer-console-page-header-icon" />
                <span>{selectedCustomerSearchFieldOption.label}</span>
              </button>
              {customerSearchFilterOpen ? (
                <div className="customer-console-field-filter-menu" role="listbox" aria-label="검색 필터 선택">
                  {CUSTOMER_SEARCH_FIELD_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={option.value === props.customerSearchField ? "is-selected" : ""}
                      onClick={() => {
                        props.setCustomerSearchField(option.value);
                        setCustomerSearchFilterOpen(false);
                      }}
                      role="option"
                      aria-selected={option.value === props.customerSearchField}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="customer-console-page-search" aria-label="고객 검색">
              <Icon name="search" className="customer-console-page-search-icon" />
              <span
                className={[
                  "customer-console-page-search-text",
                  props.customerSearchQuery ? "" : "is-placeholder"
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {props.customerSearchQuery || selectedCustomerSearchFieldOption.placeholder}
              </span>
              <input
                className="customer-console-page-search-input"
                type="text"
                placeholder={selectedCustomerSearchFieldOption.placeholder}
                value={props.customerSearchQuery}
                onChange={(event) => props.setCustomerSearchQuery(event.target.value)}
              />
            </label>
          </header>

          <section className="panel panel-customer-list customer-console-panel">
            <div className="customer-console-table-topbar">
              <div className="customer-console-table-title">
                <strong>{activeFilterCopy[props.customerListFilter].title} ({visibleTableCustomers.length})</strong>
              </div>
              <div className="customer-console-table-actions">
                {hasActiveFilter ? (
                  <button
                    type="button"
                    className="btn-secondary customer-console-reset"
                    onClick={() => {
                      props.setCustomerListFilter("all");
                      props.setCustomerSearchField("all");
                      props.setCustomerSearchQuery("");
                    }}
                  >
                    필터 초기화
                  </button>
                ) : null}
              </div>
            </div>

            <div
              ref={customerTableWrapRef}
              className="customer-console-table-wrap"
              style={customerTableViewportHeight !== null ? { maxHeight: `${customerTableViewportHeight}px` } : undefined}
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
                    <th>대표자명</th>
                    <th className="customer-console-col-status">상태</th>
                  </tr>
                </thead>
                <tbody>{renderCustomerTableRows()}</tbody>
              </table>
            </div>
          </section>

        </div>

        {detailPanelOpen ? (
          <section
            className={`panel customer-detail-panel ${props.creatingCustomer ? "is-create" : "is-detail"}`}
            aria-label={props.creatingCustomer ? "새 고객 등록" : "고객 상세"}
          >
            {props.creatingCustomer ? renderCreatePanel() : renderDetailPanel()}
          </section>
        ) : null}
      </div>
      {renderCustomerCertificateSelector()}
    </div>
  );
}
