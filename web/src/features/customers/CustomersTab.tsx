import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Icon } from "../../components/ui";
import type { LocalCertificateUploadSessionResult } from "../../local-renewal-helper";
import type {
  Customer,
  CustomerCertificate,
  CustomerCertificateKind,
  CustomerContractRenewalDueItem,
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
  matchesCustomerIssueModeFilter,
  type CustomerIssueModeFilter,
  type CustomerListFilter
} from "./customerListFilters";

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
  contractRenewalDueItems: CustomerContractRenewalDueItem[];
  blockedCustomerCount: number;
  readyCustomerCount: number;
  expiringSoonCustomerCount: number;
  popbillPendingCustomerCount: number;
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
  onSaveCustomerIssueMode: (customer: Customer, issueMode: Customer["issueMode"]) => Promise<void>;
  onJoinCustomerPopbill: (customerId: number) => Promise<void>;
  onOpenCustomerCertRegistration: (customerId: number) => Promise<void>;
  onLinkCustomerCertificate: (certificateIndex: string, customerId: number) => Promise<void>;
  onUnlinkCustomerCertificate: (certificateId: number) => Promise<void>;
  onPrepareCustomerCertificateRenewal: (certificateIndex: string, options?: { showAlert?: boolean }) => Promise<void>;
  onOpenCustomerCertificatePayment: (certificateIndex: string, options?: { showAlert?: boolean }) => Promise<void>;
  onRefreshCustomerCertificateStatus: (customerId: number) => Promise<void>;
  onRefreshAllCertificateStatuses: () => Promise<void>;
  onResetPopbillLink: (customer: Customer) => Promise<void>;
  onDeleteCustomer: (customer: Customer) => Promise<void>;
  onExportSelectedCustomers: (customers: Customer[], reportYear: number) => Promise<void>;
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

function getIssueModeGuide(issueMode: Customer["issueMode"]): string {
  return issueMode === "auto"
    ? "설정된 고객만 월 자동 발행합니다. 실패 시 실패 초안이 남아 검수 후 직접 발행으로 복구할 수 있습니다."
    : "초안 검수 뒤 로그인 사용자가 직접 발행합니다. 최소 1회 이상 정상 발행 경험 후 자동 전환을 권장합니다.";
}

function getIssueModeListHint(issueMode: Customer["issueMode"]): string {
  return issueMode === "auto"
    ? "설정 기반 자동 발행 · 실패 시 직접 발행 복구"
    : "로그인 사용자가 직접 발행 · 정상 발행 후 자동 전환 권장";
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

function getCurrentCustomerReportYear(): number {
  return new Date().getFullYear();
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
  const [customerDetailPanelOpen, setCustomerDetailPanelOpen] = useState(false);
  const [customerTableViewportHeight, setCustomerTableViewportHeight] = useState<number | null>(null);
  const [customerIssueModeFilter, setCustomerIssueModeFilter] = useState<CustomerIssueModeFilter>("all");
  const [customerIssueModeDraft, setCustomerIssueModeDraft] = useState<Customer["issueMode"]>("review");
  const [bulkIssueModeMenuOpen, setBulkIssueModeMenuOpen] = useState(false);
  const [checkedCustomerIds, setCheckedCustomerIds] = useState<Set<number>>(() => new Set());
  const [customerReportYear, setCustomerReportYear] = useState(getCurrentCustomerReportYear);
  const customerReportDetail = useCustomerReportDetail(selectedCustomer?.id ?? null, customerReportYear);
  const [customerReportIssueDateDrafts, setCustomerReportIssueDateDrafts] = useState<Record<string, string>>({});
  const customerMainColumnRef = useRef<HTMLDivElement | null>(null);
  const customerTableWrapRef = useRef<HTMLDivElement | null>(null);
  const [customerOnestopStep, setCustomerOnestopStep] = useState<CustomerOnestopStepId>("source");
  const [customerOnestopCertificates, setCustomerOnestopCertificates] = useState<RenewalAgentCertificate[]>([]);
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
      setCustomerIssueModeDraft(selectedCustomer.issueMode);
      setCustomerCertificateSelectorOpen(false);
      setCustomerCertificateSearchQuery("");
      setCustomerCertificateSelectedKey(null);
      setCustomerCertificateActionNotice("");
    }
  }, [selectedCustomer?.id, selectedCustomer?.issueMode]);

  useEffect(() => {
    setCustomerReportIssueDateDrafts({});
  }, [selectedCustomer?.id, customerReportYear]);

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
  const customerOnestopCanExecute =
    Boolean(customerOnestopSelectedCertificate) &&
    customerOnestopPassword.trim() !== "" &&
    customerOnestopMissingFieldLabels.length === 0 &&
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
          setCustomerOnestopCertificates(certificates);
          setCustomerOnestopNotice(
            certificates.length > 0
              ? `PC에서 전자세금용 공동인증서 ${certificates.length}건을 찾았습니다.`
              : "PC에서 전자세금용 공동인증서를 찾지 못했습니다."
          );
          if (certificates.length === 1) {
            selectCustomerOnestopCertificate(certificates[0]!);
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
          setCustomerOnestopUploadSummary(result);
          setCustomerOnestopCertificates(certificates);
          setCustomerOnestopNotice(
            certificates.length > 0
              ? `업로드한 파일에서 전자세금용 공동인증서 ${certificates.length}건을 읽었습니다.`
              : "업로드한 파일에서 전자세금용 공동인증서를 찾지 못했습니다."
          );
          if (certificates.length === 1) {
            selectCustomerOnestopCertificate(certificates[0]!);
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
  const issuedThisMonthCustomerCount = (() => {
    if (!currentBillingMonth) return 0;
    let count = 0;
    props.issuedDraftsByCustomerId.forEach((drafts) => {
      if (drafts.some((draft) => draft.billingMonth === currentBillingMonth)) {
        count += 1;
      }
    });
    return count;
  })();
  const certificateExpirationCustomerCount = props.expiredCertCustomers.length + props.expiringSoonCustomerCount;
  const visibleTableCustomers = useMemo(
    () =>
      props.filteredCustomers.filter((customer) => matchesCustomerIssueModeFilter(customer, customerIssueModeFilter)),
    [customerIssueModeFilter, props.filteredCustomers]
  );
  const visibleCustomerIdSet = useMemo(() => new Set(visibleTableCustomers.map((customer) => customer.id)), [visibleTableCustomers]);
  const checkedVisibleCustomers = useMemo(
    () => visibleTableCustomers.filter((customer) => checkedCustomerIds.has(customer.id)),
    [checkedCustomerIds, visibleTableCustomers]
  );
  const checkedVisibleCustomerCount = checkedVisibleCustomers.length;
  const allVisibleCustomersChecked = visibleTableCustomers.length > 0 && checkedVisibleCustomerCount === visibleTableCustomers.length;
  const someVisibleCustomersChecked = checkedVisibleCustomerCount > 0 && !allVisibleCustomersChecked;

  useEffect(() => {
    if (checkedVisibleCustomerCount === 0) {
      setBulkIssueModeMenuOpen(false);
    }
  }, [checkedVisibleCustomerCount]);

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

  const changeSelectedCustomersIssueMode = (issueMode: Customer["issueMode"]) => {
    const targetCustomers = checkedVisibleCustomers.filter((customer) => customer.issueMode !== issueMode);
    if (targetCustomers.length === 0) {
      setBulkIssueModeMenuOpen(false);
      return;
    }

    const issueModeLabel = props.getIssueModeLabel(issueMode);
    const confirmed = window.confirm(`선택한 고객 ${targetCustomers.length}명을 ${issueModeLabel}으로 변경할까요?`);
    if (!confirmed) {
      return;
    }

    void props.runAction(
      `customers-issue-mode-${issueMode}`,
      async () => {
        for (const customer of targetCustomers) {
          await props.onSaveCustomerIssueMode(customer, issueMode);
        }
        setBulkIssueModeMenuOpen(false);
        setCheckedCustomerIds(new Set());
      }
    );
  };

  const saveSelectedCustomerIssueMode = () => {
    if (!selectedCustomer || customerIssueModeDraft === selectedCustomer.issueMode) {
      return;
    }

    void props.runAction(
      `customer-issue-mode-${selectedCustomer.id}`,
      async () => props.onSaveCustomerIssueMode(selectedCustomer, customerIssueModeDraft)
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
  const customerCertificateTodayDateKey = getCustomerCertificateTodayDateKey();
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
                type="search"
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
        key: "invoice-issued",
        filter: "unissued",
        label: "세금계산서 발행",
        value: `${issuedThisMonthCustomerCount}/${props.customers.length}건`,
        tone:
          props.customers.length > 0 && issuedThisMonthCustomerCount < props.customers.length
            ? ("warn" as CustomerConsoleTone)
            : ("success" as CustomerConsoleTone)
      },
      {
        key: "certificate-expiration",
        filter: "certificate-expiration",
        label: "인증서 만료 예정 고객",
        value: `${certificateExpirationCustomerCount}명`,
        tone: certificateExpirationCustomerCount > 0 ? ("warn" as CustomerConsoleTone) : ("success" as CustomerConsoleTone)
      },
      {
        key: "contract-expiration",
        filter: "contract-expiration",
        label: "계약 만료 예정 고객",
        value: `${props.contractRenewalDueItems.length}명`,
        tone: props.contractRenewalDueItems.length > 0 ? ("warn" as CustomerConsoleTone) : ("success" as CustomerConsoleTone)
      }
    ],
    [
      certificateExpirationCustomerCount,
      issuedThisMonthCustomerCount,
      props.contractRenewalDueItems.length,
      props.customers.length
    ]
  );
  const hasActiveFilter =
    props.customerListFilter !== "all" ||
    props.customerSearchQuery.trim() !== "" ||
    customerIssueModeFilter !== "all";
  const customerIssueModeOptions: Array<{ key: CustomerIssueModeFilter; label: string }> = [
    { key: "all", label: "전체" },
    { key: "review", label: "직접 발행" },
    { key: "auto", label: "자동 발행" }
  ];
  const checkedReviewTargetCount = checkedVisibleCustomers.filter((customer) => customer.issueMode !== "review").length;
  const checkedAutoTargetCount = checkedVisibleCustomers.filter((customer) => customer.issueMode !== "auto").length;
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
    if (!selectedCustomer) {
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
      const issueModeLabel = customer.issueMode === "auto" ? "자동 발행" : "직접 발행";

      return (
        <tr
          key={customer.id}
          aria-selected={isSelected}
          className={isSelected ? "is-selected" : undefined}
          tabIndex={0}
          onClick={() => focusCustomer(customer)}
          onKeyDown={(event) => handleCustomerRowKeyDown(event, customer)}
        >
          <td className="customer-console-col-check">
            <input
              type="checkbox"
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
          <td className="customer-console-col-mode">
            <span
              className={`customer-console-mode-badge mode-${customer.issueMode}`}
              title={getIssueModeListHint(customer.issueMode)}
            >
              {issueModeLabel}
            </span>
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

    return (
      <div className="customer-detail-panel-body customer-detail-option3-body">
          <section className="customer-detail-section customer-info-card customer-info-basic-card">
            <div className="customer-detail-section-head">
              <h3>기본 정보</h3>
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
            <div className="customer-issue-mode-editor" aria-label="발행 모드 변경">
              <span>발행 모드</span>
              <div className="customer-issue-mode-segment">
                <button
                  type="button"
                  className={customerIssueModeDraft === "review" ? "is-active" : undefined}
                  aria-pressed={customerIssueModeDraft === "review"}
                  disabled={props.busyKey !== null}
                  onClick={() => setCustomerIssueModeDraft("review")}
                >
                  직접 발행
                </button>
                <button
                  type="button"
                  className={customerIssueModeDraft === "auto" ? "is-active" : undefined}
                  aria-pressed={customerIssueModeDraft === "auto"}
                  disabled={props.busyKey !== null}
                  onClick={() => setCustomerIssueModeDraft("auto")}
                >
                  자동 발행
                </button>
              </div>
              {customerIssueModeDraft !== selectedCustomer.issueMode ? (
                <button
                  type="button"
                  className="btn-secondary customer-issue-mode-save"
                  disabled={props.busyKey !== null}
                  onClick={saveSelectedCustomerIssueMode}
                >
                  변경 저장
                </button>
              ) : null}
            </div>
          </section>

          <section className="customer-detail-section customer-info-card customer-info-contract-card">
            <div className="customer-detail-section-head">
              <h3>계약/발행</h3>
            </div>
            <div className="customer-report-profile-grid customer-info-contract-grid">
              <label>
                태양광 용량 KW
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={reportProfile.solarCapacityKw ?? ""}
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
              </div>
            </div>
            {customerCertificateActionNotice ? <p className="customer-certificate-action-notice">{customerCertificateActionNotice}</p> : null}
          </section>

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
            <div className="customer-report-totals" aria-label="신고 이력 합계">
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
                <span>통계</span>
                <strong>{props.formatMoney(selectedReportTotals.annual)}원</strong>
              </div>
            </div>
            {customerReportDetail.loading ? <p className="customer-detail-card-note">신고 상세를 불러오는 중입니다.</p> : null}
            {customerReportDetail.error ? <p className="customer-detail-card-note tone-danger">{customerReportDetail.error}</p> : null}
            {customerReportDetail.notice ? <p className="customer-detail-card-note tone-success">{customerReportDetail.notice}</p> : null}
            <div className="customer-report-table-wrap">
              <table className="customer-report-table">
                <thead>
                  <tr>
                    <th>발행년도</th>
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
                        <td className="customer-report-year-cell">{customerReportYear}년</td>
                        <td>{month.reportMonth}월</td>
                        <td>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="일"
                            aria-label={`${month.reportMonth}월 발행일`}
                            aria-invalid={issueDateInvalid}
                            value={issueDateInputValue}
                            onChange={(event) => updateCustomerReportIssueDay(month.reportMonth, event.target.value)}
                            onBlur={() => normalizeCustomerReportIssueDayDraft(month.reportMonth)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={month.supplyAmount}
                            onChange={(event) =>
                              updateCustomerReportMonth(month.reportMonth, (current) => {
                                const supplyAmount = parseMoneyInput(event.target.value);
                                return {
                                  ...current,
                                  issueYear: customerReportYear,
                                  supplyAmount,
                                  totalAmount: supplyAmount + current.vatAmount
                                };
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={month.vatAmount}
                            onChange={(event) =>
                              updateCustomerReportMonth(month.reportMonth, (current) => {
                                const vatAmount = parseMoneyInput(event.target.value);
                                return {
                                  ...current,
                                  issueYear: customerReportYear,
                                  vatAmount,
                                  totalAmount: current.supplyAmount + vatAmount
                                };
                              })
                            }
                          />
                        </td>
                        <td className="customer-report-total-cell">{props.formatMoney(month.supplyAmount + month.vatAmount)}원</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hasInvalidCustomerReportIssueDateDraft ? (
              <p className="customer-detail-card-note tone-danger">발행일은 해당 월에 맞는 숫자만 입력하세요.</p>
            ) : null}
            <div className="customer-detail-card-actions customer-report-save-actions">
              <button
                type="button"
                disabled={
                  !customerReportDetail.draft ||
                  customerReportDetail.loading ||
                  customerReportDetail.saving ||
                  hasInvalidCustomerReportIssueDateDraft
                }
                onClick={() => void customerReportDetail.save()}
              >
                {customerReportDetail.saving ? "신고 이력 저장 중..." : "신고 이력 저장"}
              </button>
            </div>
          </section>

          <section className="customer-detail-section customer-detail-action-strip" aria-label="고객 작업">
            <div className="customer-detail-action-summary">
              <span>운영 이력</span>
              <strong>{props.selectedCustomerIssuedDrafts.length}건</strong>
              <em>
                {props.mailboxDataLoading && props.selectedCustomerIssuedDrafts.length === 0
                  ? "발행 이력을 불러오는 중입니다."
                  : selectedRecentIssuedDraft
                    ? `최근 발행 ${props.formatDateTime(selectedRecentIssuedDraft.issuedAt)}`
                    : "아직 발행 이력이 없습니다."}
              </em>
            </div>
            <div className="customer-detail-action-buttons">
              <button
                className="btn-ghost btn-danger"
                onClick={() => void props.runAction(`delete-customer-${selectedCustomer.id}`, async () => props.onDeleteCustomer(selectedCustomer))}
              >
                고객 삭제
              </button>
            </div>
          </section>
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

    return (
      <div className="customer-onestop-certificate-list">
        {customerOnestopCertificates.map((certificate) => {
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
              ? `같은 사업자번호의 기존 고객을 사용합니다: ${customerOnestopExistingCustomer.corpName || customerOnestopExistingCustomer.customerName}`
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
            <div className="customer-bulk-issue-mode">
              <button
                type="button"
                className="btn-secondary customer-bulk-issue-mode-trigger"
                disabled={props.busyKey !== null || checkedVisibleCustomers.length === 0}
                aria-haspopup="menu"
                aria-expanded={bulkIssueModeMenuOpen}
                aria-label={
                  checkedVisibleCustomers.length > 0
                    ? `선택한 고객 ${checkedVisibleCustomers.length}명 발행모드 변경`
                    : "선택한 고객 발행모드 변경"
                }
                onClick={() => setBulkIssueModeMenuOpen((prev) => !prev)}
              >
                {checkedVisibleCustomers.length > 0 ? <span>선택 {checkedVisibleCustomers.length}명</span> : null}
                발행모드 변경
              </button>
              {bulkIssueModeMenuOpen ? (
                <div className="customer-bulk-issue-mode-menu" role="menu" aria-label="선택 고객 발행모드 변경">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={props.busyKey !== null || checkedReviewTargetCount === 0}
                    onClick={() => changeSelectedCustomersIssueMode("review")}
                  >
                    직접 발행으로 변경
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={props.busyKey !== null || checkedAutoTargetCount === 0}
                    onClick={() => changeSelectedCustomersIssueMode("auto")}
                  >
                    자동 발행으로 변경
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={exportSelectedCustomersWorkbook}
              disabled={props.busyKey !== null || checkedVisibleCustomers.length === 0}
              aria-label={
                checkedVisibleCustomers.length > 0
                  ? `선택한 고객 ${checkedVisibleCustomers.length}명 내보내기`
                  : "선택한 고객 내보내기"
              }
            >
              내보내기
            </button>
            <button type="button" className="customer-console-primary-cta" onClick={handleCreateCustomer}>
              고객 추가
            </button>
          </div>
        </section>

        <div ref={customerMainColumnRef} className="customer-console-main-column">
          <header className="customer-console-page-header">
            <label className="customer-console-page-search" aria-label="고객 검색">
              <Icon name="search" className="customer-console-page-search-icon" />
              <input
                placeholder="검색"
                value={props.customerSearchQuery}
                onChange={(event) => props.setCustomerSearchQuery(event.target.value)}
              />
            </label>
            <div className="customer-console-filter-strip customer-console-mode-filter" aria-label="발행 모드 필터">
              {customerIssueModeOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={customerIssueModeFilter === option.key ? "btn-secondary active-filter" : "btn-secondary"}
                  aria-pressed={customerIssueModeFilter === option.key}
                  onClick={() => setCustomerIssueModeFilter(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </header>

          <section className="panel panel-customer-list customer-console-panel">
            <div className="customer-console-table-topbar">
              <div className="customer-console-table-title">
                <strong>{activeFilterCopy[props.customerListFilter].title} ({visibleTableCustomers.length})</strong>
                <span>상호순</span>
              </div>
              <div className="customer-console-table-actions">
                {hasActiveFilter ? (
                  <button
                    type="button"
                    className="btn-secondary customer-console-reset"
                    onClick={() => {
                      props.setCustomerListFilter("all");
                      props.setCustomerSearchQuery("");
                      setCustomerIssueModeFilter("all");
                    }}
                  >
                    필터 초기화
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={props.busyKey !== null}
                  onClick={() => void props.runAction("customers-cert-refresh-all", props.onRefreshAllCertificateStatuses)}
                >
                  인증서 일괄 점검
                </button>
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
                      <input
                        type="checkbox"
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
                    <th className="customer-console-col-mode">발행 모드</th>
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
