import type React from "react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api, setActiveOrganizationId } from "./api";
import { AppDialog, type AppDialogState, type AppDialogTone, Icon, Panel, RevealIcon, StatCard } from "./components/ui";
import { CertificatesScreen } from "./features/certificates/CertificatesScreen";
import { useCertificatesScreenModel } from "./features/certificates/useCertificatesScreenModel";
import { CustomersTab } from "./features/customers/CustomersTab";
import { InitialRegistrationTab, getInitialRegistrationFlowState } from "./features/initial-registration/InitialRegistrationTab";
import { OnboardingTab, type OnboardingStep } from "./features/onboarding/OnboardingTab";
import { PublicLanding } from "./features/public/PublicLanding";
import {
  downloadCustomerOnboardingTemplate,
  parseCustomerOnboardingWorkbook,
  type CustomerOnboardingCommitStartResponse,
  type CustomerOnboardingCommitResponse,
  type CustomerOnboardingPreviewResponse,
  type CustomerOnboardingTemplateWorkbookInput,
  type CustomerOnboardingWorkbookInput
} from "./features/initial-registration/customer-onboarding-workbook";
import {
  buildElectronicTaxOnboardingCommitNotice,
  buildElectronicTaxOnboardingTemplateNotice,
  buildElectronicTaxRegistrationFollowupNotice
} from "./features/initial-registration/electronic-tax-onboarding-formatters";
import {
  resolveElectronicTaxOnboardingTemplateWorkbook,
  type CustomerOnboardingResolutionResult
} from "./features/initial-registration/electronic-tax-onboarding-resolver";
import {
  processElectronicTaxOnboardingCertificateRegistrations,
  waitForElectronicTaxOnboardingCommitBatch
} from "./features/initial-registration/electronic-tax-onboarding-orchestration";
import {
  emptyElectronicTaxOnboardingSessionState as emptyCustomerOnboardingSessionState,
  runElectronicTaxOnboardingUploadFlow,
  type ElectronicTaxOnboardingSessionState as CustomerOnboardingSessionState,
  type ElectronicTaxOnboardingUploadFlowResult
} from "./features/initial-registration/electronic-tax-onboarding-upload-flow";
import { useElectronicTaxOnboarding } from "./features/initial-registration/useElectronicTaxOnboarding";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { AccountPasswordPanel } from "./features/settings/AccountPasswordPanel";
import { createSettingsActionAdapters } from "./features/settings/createSettingsActionAdapters";
import {
  MAIL_PROVIDER_CONFIG,
  createEmptyPasswordResetForm,
  normalizeRenewalIssuePasswordInput,
  type PasswordResetFormState,
  type SettingsSectionId,
  useSettingsScreenState
} from "./features/settings/useSettingsScreenState";
import { useSettingsDerivedModel } from "./features/settings/useSettingsDerivedModel";
import {
  selectSettingsOnboardingState,
  useSettingsOnboardingModel
} from "./features/settings/useSettingsOnboardingModel";
import {
  deriveCustomerCertificateKind,
  findCandidateCustomersForCertificate,
  findLocalCertificateForStoredCustomerCertificate,
  findStoredCustomerCertificateForLocalCertificate,
  formatCustomerRenewalStatus,
  getLatestRenewalPreflightProbeForCertificate,
  isElectronicTaxCertificate,
  isRenewalPaymentReady,
  matchesRenewalCertificate,
  normalizeRenewalCertificateKey,
  parseStoredCustomerCertificateKey,
  selectCustomerRenewalCertificate
} from "./features/renewal/customerRenewalCertificateUtils";
import {
  buildLocalRenewalBridgeJob,
  buildLocalRenewalPreflightJob,
  buildCustomerRenewalAssistant,
  getCustomerRenewalAssistantReleaseMetadata,
  type RenewalAgentSnapshot,
  type RenewalAgentCertificate,
  type RenewalJob,
  useRenewalAssistantState
} from "./features/renewal/useRenewalAssistantState";
import {
  formatRenewalBridgeSummary,
  formatRenewalJobLabel,
  formatRenewalJobStatusLabel,
  formatRenewalLicenseSummary,
  formatRenewalPathCell,
  formatRenewalPreflightSummary,
  formatRenewalSelectionSummary,
  formatRenewalStorageSummary,
  formatRenewalVersionSummary
} from "./features/renewal/renewalDiagnosticsFormatters";
import {
  requestLocalPopbillCertificateRegistration,
  requestLocalRenewalBridgeProbe,
  requestLocalRenewalCertificates,
  requestLocalRenewalOpenPayment,
  requestLocalRenewalPreparePayment,
  requestLocalRenewalPreflight
} from "./local-renewal-helper";
import { getSessionSafely, supabase } from "./supabase";
import type {
  BootstrapPayload,
  CompletedBillingMonth,
  Customer,
  CustomerCertificate,
  CustomerCertificateKind,
  CustomerImportProfile,
  InvoiceDraft,
  LogEntry,
  OpsWorkspaceCreateResponse,
  OpsWorkspaceLimitUpdateResponse,
  OpsWorkspaceSummary,
  PartnerPointsPayload,
  RenewalInfoSnapshot,
  RenewalAutomationPayload
} from "./types";

type TabId = "onboarding" | "home" | "customers" | "certificates" | "settings" | "ops";

const ONBOARDING_NAV_STORAGE_KEY_PREFIX = "auto-tax:onboarding-nav:";

function getOnboardingNavStorageKey(organizationId: string): string {
  return `${ONBOARDING_NAV_STORAGE_KEY_PREFIX}${organizationId}`;
}

function readOnboardingNavVisibilityPreference(organizationId: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    const value = window.localStorage.getItem(getOnboardingNavStorageKey(organizationId));
    return value === "show" || value === "true" || value === "1";
  } catch {
    return false;
  }
}

function writeOnboardingNavVisibilityPreference(organizationId: string, show: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getOnboardingNavStorageKey(organizationId), show ? "show" : "hide");
  } catch {
    // ignore storage failures in unsupported/private contexts
  }
}
type CustomerDetailTabId = "info" | "history";
type CustomerListFilter = "all" | "blocked" | "ready" | "expiring" | "unjoined";
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
type CustomerSaveResponse = Customer & {
  autoJoinStatus?: "already-joined" | "linked-existing-member" | "joined" | "linked-after-duplicate-check" | "failed";
  autoJoinError?: string | null;
};
type OpsConsoleData = {
  partnerPoints: PartnerPointsPayload;
  renewalAutomation: RenewalAutomationPayload;
  logs: LogEntry[];
  workspaces: OpsWorkspaceSummary[];
};

type InternalJobDispatchResponse = {
  ok: true;
  accessMode: "secret" | "ops";
  checkedOrganizations: number;
  dispatched: number;
  skipped: number;
};

type InternalJobRunResponse = {
  ok: true;
  accessMode: "secret" | "ops";
  attempted: number;
  claimed: number;
  completed: number;
  failed: number;
};

function shouldLoadMailboxData(activeTab: TabId, customerDetailTab: CustomerDetailTabId): boolean {
  return activeTab === "home" || (activeTab === "customers" && customerDetailTab === "history");
}

type OpsWorkspaceFormState = {
  organizationName: string;
  organizationBusinessNumber: string;
  managedCustomerLimit: string;
  ownerLoginId: string;
  ownerDisplayName: string;
  ownerPassword: string;
};

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

type OwnerPasswordResetTarget = {
  organizationId: string;
  organizationName: string;
  loginId: string | null;
};

type AddressResolveResponse = {
  ok: boolean;
  input: string;
  resolvedAddress: string | null;
  postalCode: string | null;
  isRoadAddress: boolean | null;
};

type CustomerImportFieldId = "customerName" | "businessNumber" | "corpName" | "addr";

type CustomerImportColumnOption = {
  value: string;
  label: string;
};

type CustomerImportMapping = Record<CustomerImportFieldId, string>;

type CustomerImportParsedFile = {
  fileName: string;
  sheetName: string;
  rows: string[][];
};

type CustomerImportMappedRowPayload = {
  rowIndex: number;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
};

type QuickRegisterFormState = {
  messageId: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
};

type CustomerImportPreviewRow = CustomerImportMappedRowPayload & {
  normalizedBusinessNumber: string;
  normalizedAddress: string;
  errors: string[];
  canImport: boolean;
};

type CustomerImportPreviewResponse = {
  totalRows: number;
  importableRows: number;
  blockedRows: number;
  rows: CustomerImportPreviewRow[];
};

type CustomerImportCommitResponse = {
  totalRows: number;
  successCount: number;
  failedCount: number;
  failedRows: Array<{
    rowIndex: number;
    message: string;
  }>;
};

class LoadCancelledError extends Error {
  constructor() {
    super("현재 세션에서 더 이상 유효하지 않은 데이터 불러오기 요청입니다.");
    this.name = "LoadCancelledError";
  }
}

function isLoadCancelledError(error: unknown): error is LoadCancelledError {
  return error instanceof LoadCancelledError;
}

let xlsxModulePromise: Promise<typeof import("xlsx")> | null = null;

function loadXlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }

  return xlsxModulePromise;
}

type BillingMonthSummary = {
  billingMonth: string;
  totalCount: number;
  actionableCount: number;
  latestReceivedAt: string | null;
  completed: boolean;
};

const CUSTOMER_IMPORT_FIELD_OPTIONS: Array<{ id: CustomerImportFieldId; label: string; keywords: string[] }> = [
  { id: "customerName", label: "대표자명", keywords: ["대표", "성명", "고객명", "이름"] },
  { id: "businessNumber", label: "사업자번호", keywords: ["사업자", "등록번호", "사업자번호"] },
  { id: "corpName", label: "세금계산서 상호", keywords: ["상호", "법인명", "업체명", "회사명"] },
  { id: "addr", label: "주소", keywords: ["주소", "소재지", "도로명"] }
];

const EMPTY_CUSTOMER_IMPORT_MAPPING: CustomerImportMapping = {
  customerName: "",
  businessNumber: "",
  corpName: "",
  addr: ""
};

function normalizeImportCell(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function scoreDecodedCustomerImportText(value: string): number {
  const sample = value.slice(0, 300);
  const replacementPenalty = (sample.match(/�/g) ?? []).length * 10;
  const mojibakePenalty = (sample.match(/[ÃÂÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîï]/g) ?? []).length;
  const keywordScore = ["대표자명", "사업자번호", "세금계산서 상호", "주소", "상호", "대표", "사업자"].reduce(
    (total, keyword) => total + (sample.includes(keyword) ? 8 : 0),
    0
  );

  return keywordScore - replacementPenalty - mojibakePenalty;
}

function decodeCustomerImportCsv(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const candidates = ["utf-8", "euc-kr"]
    .map((encoding) => {
      try {
        return {
          encoding,
          text: new TextDecoder(encoding).decode(bytes)
        };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is { encoding: string; text: string } => candidate !== null)
    .sort((left, right) => scoreDecodedCustomerImportText(right.text) - scoreDecodedCustomerImportText(left.text));

  return candidates[0]?.text ?? new TextDecoder("utf-8").decode(bytes);
}

function buildCustomerImportColumnOptions(rows: string[][], headerRowIndex: number): CustomerImportColumnOption[] {
  const headerRow = rows[headerRowIndex] ?? [];
  return headerRow.map((value, index) => ({
    value: String(index),
    label: normalizeImportCell(value) || `열 ${index + 1}`
  }));
}

function guessCustomerImportMapping(columns: CustomerImportColumnOption[]): CustomerImportMapping {
  const nextMapping = { ...EMPTY_CUSTOMER_IMPORT_MAPPING };

  for (const field of CUSTOMER_IMPORT_FIELD_OPTIONS) {
    const matchedColumn = columns.find((column) => {
      const normalizedLabel = column.label.replace(/\s+/g, "").toLowerCase();
      return field.keywords.some((keyword) => normalizedLabel.includes(keyword.replace(/\s+/g, "").toLowerCase()));
    });
    if (matchedColumn) {
      nextMapping[field.id] = matchedColumn.value;
    }
  }

  return nextMapping;
}

function buildCustomerImportMappingFromProfile(
  columns: CustomerImportColumnOption[],
  profile: Pick<CustomerImportProfile, "fieldHeaderMap">
): CustomerImportMapping {
  const nextMapping = { ...EMPTY_CUSTOMER_IMPORT_MAPPING };

  for (const field of CUSTOMER_IMPORT_FIELD_OPTIONS) {
    const targetHeader = normalizeImportCell(profile.fieldHeaderMap[field.id]).toLowerCase();
    if (!targetHeader) continue;
    const matchedColumn = columns.find((column) => normalizeImportCell(column.label).toLowerCase() === targetHeader);
    if (matchedColumn) {
      nextMapping[field.id] = matchedColumn.value;
    }
  }

  return nextMapping;
}

function buildCustomerImportRowsPayload(
  rows: string[][],
  headerRowIndex: number,
  mapping: CustomerImportMapping
): CustomerImportMappedRowPayload[] {
  const fieldColumnIndexes = Object.fromEntries(
    (Object.entries(mapping) as Array<[CustomerImportFieldId, string]>).map(([fieldId, columnIndex]) => [
      fieldId,
      columnIndex === "" ? -1 : Number(columnIndex)
    ])
  ) as Record<CustomerImportFieldId, number>;

  return rows.slice(headerRowIndex + 1).flatMap((row, index) => {
    const mappedRow: CustomerImportMappedRowPayload = {
      rowIndex: headerRowIndex + 2 + index,
      customerName: fieldColumnIndexes.customerName >= 0 ? normalizeImportCell(row[fieldColumnIndexes.customerName]) : "",
      businessNumber: fieldColumnIndexes.businessNumber >= 0 ? normalizeImportCell(row[fieldColumnIndexes.businessNumber]) : "",
      corpName: fieldColumnIndexes.corpName >= 0 ? normalizeImportCell(row[fieldColumnIndexes.corpName]) : "",
      addr: fieldColumnIndexes.addr >= 0 ? normalizeImportCell(row[fieldColumnIndexes.addr]) : ""
    };

    if (!mappedRow.customerName && !mappedRow.businessNumber && !mappedRow.corpName && !mappedRow.addr) {
      return [];
    }

    return [mappedRow];
  });
}

function isCustomerImportMappingComplete(mapping: CustomerImportMapping): boolean {
  return Object.values(mapping).every((value) => value !== "");
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function createQuickRegisterForm(message?: BootstrapPayload["inbox"][number] | null): QuickRegisterFormState {
  return {
    messageId: message?.id ?? null,
    customerName: "",
    businessNumber: "",
    corpName: "",
    addr: message?.parsedData?.plantAddress ?? ""
  };
}

const baseOpsWorkspaceForm: OpsWorkspaceFormState = {
  organizationName: "",
  organizationBusinessNumber: "",
  managedCustomerLimit: "50",
  ownerLoginId: "",
  ownerDisplayName: "",
  ownerPassword: ""
};

function getTabFromHash(hash: string): TabId | null {
  const value = hash.replace(/^#/, "");

  if (value === "initial" || value === "onboarding") {
    return "onboarding";
  }

  if (value === "work" || value === "home") {
    return "home";
  }

  if (value === "certificates") {
    return "certificates";
  }

  if (value === "settings") {
    return "settings";
  }

  if (value === "customers" || value === "ops") {
    return value;
  }

  return null;
}

function resolveWorkspaceTab(
  requestedTab: TabId | null,
  options: { hasActiveWorkspace: boolean; onboardingComplete: boolean; isPlatformAdmin: boolean }
): TabId {
  const fallback = options.hasActiveWorkspace ? "home" : options.isPlatformAdmin ? "ops" : "onboarding";

  if (requestedTab === "ops") {
    return options.isPlatformAdmin ? "ops" : fallback;
  }

  if (!options.hasActiveWorkspace) {
    return options.isPlatformAdmin ? "ops" : "onboarding";
  }

  if (
    requestedTab === "home" ||
    requestedTab === "customers" ||
    requestedTab === "certificates" ||
    requestedTab === "settings" ||
    requestedTab === "onboarding"
  ) {
    return requestedTab;
  }

  return "home";
}

function getHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

function hasSupabaseAuthHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  if (!raw || getTabFromHash(hash)) return false;

  const params = getHashParams(hash);
  return (
    params.has("access_token") ||
    params.has("refresh_token") ||
    params.has("error") ||
    params.has("error_code") ||
    params.get("type") === "recovery"
  );
}

function isSupabaseRecoveryHash(hash: string): boolean {
  const params = getHashParams(hash);
  return params.get("type") === "recovery" || (params.has("access_token") && params.has("refresh_token"));
}

function decodeHashValue(value: string | null): string | null {
  if (!value) return null;

  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}

function getSupabaseAuthHashError(hash: string): string | null {
  const params = getHashParams(hash);
  const errorCode = params.get("error_code");
  const description = decodeHashValue(params.get("error_description"));

  if (!errorCode && !description) {
    return null;
  }

  if (errorCode === "otp_expired") {
    return "비밀번호 재설정 링크가 만료되었습니다. 새 메일을 다시 받아주세요.";
  }

  return description ?? "비밀번호 재설정 링크를 확인할 수 없습니다.";
}

function clearSupabaseAuthHash() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

const baseCustomerForm: CustomerFormState = {
  id: null,
  customerName: "",
  businessNumber: "",
  corpName: "",
  addr: "",
  bizType: "전기업",
  bizClass: "태양광발전(자가용PPA)",
  issueMode: "review",
  popbillUserId: "",
  popbillPassword: "",
  renewalContactMobile: "",
  memo: ""
};

function createCustomerFormDefaults(): CustomerFormState {
  return {
    ...baseCustomerForm
  };
}

function isPristineCustomerForm(form: CustomerFormState): boolean {
  return (
    form.id === null &&
    form.customerName === "" &&
    form.businessNumber === "" &&
    form.corpName === "" &&
    form.addr === "" &&
    form.bizType === baseCustomerForm.bizType &&
    form.bizClass === baseCustomerForm.bizClass &&
    form.issueMode === "review" &&
    form.renewalContactMobile === "" &&
    form.memo === ""
  );
}

function customerToForm(customer?: Customer | null): CustomerFormState {
  if (!customer) return createCustomerFormDefaults();
  return {
    id: customer.id,
    customerName: customer.customerName,
    businessNumber: customer.businessNumber,
    corpName: customer.corpName,
    addr: customer.addr,
    bizType: customer.bizType,
    bizClass: customer.bizClass,
    issueMode: customer.issueMode,
    popbillUserId: customer.popbillUserId,
    popbillPassword: customer.popbillPassword,
    renewalContactMobile: customer.renewalContactMobile,
    memo: customer.memo
  };
}

function getDraftStatusLabel(status: string): string {
  switch (status) {
    case "review":
      return "직접 발행 대기";
    case "scheduled":
      return "자동 발행 대기";
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

function getIssueModeLabel(issueMode: "review" | "auto"): string {
  return issueMode === "auto" ? "월 자동 발행" : "검수 후 직접 발행";
}

function getOrganizationRoleLabel(role: BootstrapPayload["auth"]["activeOrganizationRole"]): string {
  switch (role) {
    case "owner":
      return "소유자";
    case "admin":
    case "operator":
      return "멤버";
    case "viewer":
      return "조회전용";
    case null:
      return "플랫폼 관리자";
    default:
      return role ?? "플랫폼 관리자";
  }
}

function getOrganizationStatusLabel(status: OpsWorkspaceSummary["organizationStatus"]): string {
  switch (status) {
    case "trial":
      return "체험";
    case "active":
      return "운영중";
    case "suspended":
      return "중지";
    case "churned":
      return "해지";
    default:
      return status;
  }
}

function simplifyIssueError(message: string): string {
  if (!message) return "";

  const codeMatch = message.match(/\[POPBILL\s+(-?\d+)\]/i) ?? message.match(/\[(-?\d+)\]/);
  const suffix = codeMatch?.[1] ? ` (${codeMatch[1]})` : "";

  const normalized = message
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\(-?\d+\)/g, " ")
    .replace(/-?\d{5,}/g, " ")
    .replace(/^(목업|수동|일괄)\s*발행\s*실패\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes("연동회원으로 가입된 사업자 번호가 존재하지 않습니다")) {
    return `팝빌 가입 필요${suffix}`;
  }

  if (normalized.includes("포인트 부족")) {
    return `포인트 부족${suffix}`;
  }

  if (normalized.includes("공동인증서") || normalized.includes("인증서")) {
    return `인증서 확인 필요${suffix}`;
  }

  if (normalized.includes("사업자 번호") || normalized.includes("사업자번호")) {
    return `사업자번호 확인 필요${suffix}`;
  }

  if (normalized.includes("문서를 찾지 못했습니다") || normalized.includes("문서 정보를 조회하지 못했습니다")) {
    return `문서 환경 확인 필요${suffix}`;
  }

  return `오류 확인 필요${suffix}`;
}

function getParseStatusLabel(status: string): string {
  switch (status) {
    case "parsed":
      return "매칭 완료";
    case "unmatched":
      return "고객 미매칭";
    case "failed":
      return "파싱 실패";
    case "duplicate":
      return "중복 의심";
    case "ignored":
      return "완료 처리";
    case "pending":
      return "처리 대기";
    default:
      return status;
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function scrollToElementById(id: string): void {
  if (typeof document === "undefined") return;

  const element = document.getElementById(id);
  if (!element) return;

  element.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function formatCertificateExpireDate(value: string | null): string {
  if (!value) return "-";

  const compact = value.replace(/\D/g, "");
  if (compact.length === 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("ko-KR");
  }

  return value;
}

function formatNotificationStatus(status: string, message: string): string {
  switch (status) {
    case "sent":
      return `${message}`;
    case "skipped-already-sent-today":
      return `${message}`;
    case "skipped-no-target":
      return `${message}`;
    default:
      return message;
  }
}

function getCustomerIssueReadiness(customer: Customer): {
  canIssueNow: boolean;
  label: string;
  tone: "success" | "warn" | "danger";
  reason: string;
} {
  const days = getDaysUntilDate(customer.popbillCertExpireDate);

  if (customer.popbillState !== "joined") {
    return {
      canIssueNow: false,
      label: "준비 필요",
      tone: "danger",
      reason: "팝빌 가입 필요"
    };
  }

  if (!customer.popbillCertRegistered) {
    return {
      canIssueNow: false,
      label: "준비 필요",
      tone: "danger",
      reason: "인증서 등록 필요"
    };
  }

  if (days !== null && days < 0) {
    return {
      canIssueNow: false,
      label: "준비 필요",
      tone: "danger",
      reason: "인증서 만료"
    };
  }

  if (days !== null && days <= 30) {
    return {
      canIssueNow: true,
      label: "발행 가능",
      tone: "warn",
      reason: `만료 ${days}일 전`
    };
  }

  return {
    canIssueNow: true,
    label: "발행 가능",
    tone: "success",
    reason: "준비 완료"
  };
}

function getCustomerIssueChecklist(customer: Customer): Array<{
  key: string;
  label: string;
  tone: "success" | "warn" | "danger";
  actionLabel?: string;
  actionKind?: "join-popbill" | "register-certificate" | "check-certificate";
}> {
  const days = getDaysUntilDate(customer.popbillCertExpireDate);

  if (customer.popbillState !== "joined") {
    return [
      {
        key: "join-popbill",
        label: "팝빌 가입 필요",
        tone: "danger",
        actionLabel: "팝빌 가입",
        actionKind: "join-popbill"
      }
    ];
  }

  if (!customer.popbillCertRegistered) {
    return [
      {
        key: "register-certificate",
        label: "전자세금 인증서 등록 필요",
        tone: "danger",
        actionLabel: "인증서 등록",
        actionKind: "register-certificate"
      }
    ];
  }

  if (days !== null && days < 0) {
    return [
      {
        key: "expired-certificate",
        label: "인증서 만료",
        tone: "danger",
        actionLabel: "만료일 확인",
        actionKind: "check-certificate"
      }
    ];
  }

  if (days !== null && days <= 30) {
    return [
      {
        key: "expiring-certificate",
        label: `만료 ${days}일 전`,
        tone: "warn"
      }
    ];
  }

  return [
    {
      key: "ready",
      label: "발행 가능",
      tone: "success"
    }
  ];
}

function matchesCustomerListFilter(customer: Customer, filter: CustomerListFilter): boolean {
  const readiness = getCustomerIssueReadiness(customer);
  if (filter === "blocked") {
    return !readiness.canIssueNow;
  }

  if (filter === "ready") {
    return readiness.canIssueNow;
  }

  if (filter === "expiring") {
    const days = getDaysUntilDate(customer.popbillCertExpireDate);
    return days !== null && days >= 0 && days <= 30;
  }

  if (filter === "unjoined") {
    return customer.popbillState !== "joined" || !customer.popbillCertRegistered;
  }

  return true;
}

function compareCustomersForList(left: Customer, right: Customer): number {
  const leftReadiness = getCustomerIssueReadiness(left);
  const rightReadiness = getCustomerIssueReadiness(right);
  const leftDays = getDaysUntilDate(left.popbillCertExpireDate);
  const rightDays = getDaysUntilDate(right.popbillCertExpireDate);
  const leftPriority =
    left.popbillState !== "joined" || !left.popbillCertRegistered
      ? 0
      : leftDays !== null && leftDays < 0
        ? 1
        : leftDays !== null && leftDays <= 30
          ? 2
          : !leftReadiness.canIssueNow
            ? 3
            : 4;
  const rightPriority =
    right.popbillState !== "joined" || !right.popbillCertRegistered
      ? 0
      : rightDays !== null && rightDays < 0
        ? 1
        : rightDays !== null && rightDays <= 30
          ? 2
          : !rightReadiness.canIssueNow
            ? 3
            : 4;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const normalizedLeftDays = leftDays ?? Number.MAX_SAFE_INTEGER;
  const normalizedRightDays = rightDays ?? Number.MAX_SAFE_INTEGER;
  if (normalizedLeftDays !== normalizedRightDays) {
    return normalizedLeftDays - normalizedRightDays;
  }

  return left.customerName.localeCompare(right.customerName, "ko");
}

function getDaysUntilDate(value: string | null): number | null {
  if (!value) return null;
  const compact = value.replace(/\D/g, "");
  const target =
    compact.length === 8
      ? new Date(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)))
      : new Date(value);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function getCustomerPopbillSummary(customer: Customer): string {
  if (customer.popbillState === "joined") {
    return `팝빌 연결됨${customer.popbillUserId ? ` · ${customer.popbillUserId}` : ""}`;
  }

  if (customer.popbillState === "failed") {
    return "팝빌 연결 실패";
  }

  return "팝빌 가입 필요";
}

function getCustomerCertificateSummary(customer: Customer): string {
  if (!customer.popbillCertRegistered) {
    return "인증서 미등록";
  }

  const days = getDaysUntilDate(customer.popbillCertExpireDate);
  if (days !== null && days < 0) {
    return "인증서 만료";
  }

  if (days !== null && days <= 30) {
    return `인증서 ${days}일 남음`;
  }

  return `인증서 ${formatCertificateExpireDate(customer.popbillCertExpireDate)}`;
}

function summarizePopbillInfo(payload: Record<string, unknown>): string {
  const lines = [
    `상태코드: ${payload.stateCode ?? "-"}`,
    `발행일시: ${payload.issueDT ?? "-"}`,
    `작성일자: ${payload.writeDate ?? "-"}`,
    `관리번호: ${payload.invoicerMgtKey ?? "-"}`,
    `국세청 승인번호: ${payload.ntsconfirmNum ?? "-"}`,
    `공급가액: ${payload.supplyCostTotal ?? "-"}`,
    `세액: ${payload.taxTotal ?? "-"}`,
    `발행형태: ${payload.purposeType ?? "-"}`,
    `공급받는자: ${payload.invoiceeCorpName ?? "-"}`
  ];
  return lines.join("\n");
}

function formatPartnerPointsMessage(partnerPoints: PartnerPointsPayload | null): string {
  if (!partnerPoints?.message) {
    return "포인트 조회 전입니다.";
  }

  if (
    !partnerPoints.available &&
    !partnerPoints.isTest &&
    partnerPoints.message.includes("연동회원으로 가입된 사업자 번호가 존재하지 않습니다")
  ) {
    return "운영 팝빌 연동 전입니다. 계약/개통 후 조회 가능합니다.";
  }

  return partnerPoints.message;
}

function getWorkspaceEstimatedPointUsage(workspace: OpsWorkspaceSummary, unitCost: number | null): number | null {
  if (unitCost === null) {
    return null;
  }

  return workspace.issuedDraftCount * unitCost;
}

function getWorkspaceCurrentMonthEstimatedPointUsage(workspace: OpsWorkspaceSummary, unitCost: number | null): number | null {
  if (unitCost === null) {
    return null;
  }

  return workspace.currentMonthIssuedDraftCount * unitCost;
}

function getRenewalAgentStatusMeta(agent: RenewalAgentSnapshot): {
  label: string;
  chipClassName: string;
} {
  if (agent.online) {
    return {
      label: "에이전트 온라인",
      chipClassName: "chip-success"
    };
  }

  if (agent.lastHeartbeatAt) {
    return {
      label: "에이전트 오프라인",
      chipClassName: "chip-warn"
    };
  }

  return {
    label: "에이전트 미연결",
    chipClassName: "chip-danger"
  };
}

function getDraftConfirmNumber(draft: InvoiceDraft): string | null {
  if (!draft.popbillResultJson) return null;

  try {
    const parsed = JSON.parse(draft.popbillResultJson) as Record<string, unknown>;
    const confirmValue =
      parsed.ntsConfirmNum ?? parsed.NTSConfirmNum ?? parsed.confirmNum ?? parsed.confirmNumber;
    return typeof confirmValue === "string" && confirmValue.trim() !== ""
      ? confirmValue.trim()
      : null;
  } catch {
    return null;
  }
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function getRenewalSnapshotAddress(snapshot: RenewalInfoSnapshot): string {
  const baseAddress = snapshot.baseAddress?.trim() ?? "";
  const detailAddress = snapshot.detailAddress?.trim() ?? "";
  if (baseAddress) {
    return baseAddress;
  }
  return [baseAddress, detailAddress].filter(Boolean).join(" ").trim();
}

function buildCustomerDraftFromRenewalSnapshot(
  certificate: RenewalAgentCertificate,
  snapshot: RenewalInfoSnapshot
): CustomerFormState {
  const companyName = snapshot.companyName?.trim() || certificate.cn.trim();
  const customerName = snapshot.ceoName?.trim() || companyName;

  return {
    ...createCustomerFormDefaults(),
    customerName,
    businessNumber: snapshot.businessNumber?.trim() ?? "",
    corpName: companyName,
    addr: getRenewalSnapshotAddress(snapshot),
    bizType: snapshot.bizType?.trim() || baseCustomerForm.bizType,
    bizClass: snapshot.bizClass?.trim() || baseCustomerForm.bizClass,
    renewalContactMobile: snapshot.contactMobile?.trim() ?? ""
  };
}

function buildCustomerCreatePayloadFromRenewalSnapshot(
  certificate: RenewalAgentCertificate,
  snapshot: RenewalInfoSnapshot
) {
  const draft = buildCustomerDraftFromRenewalSnapshot(certificate, snapshot);
  const normalizedAddress = draft.addr.trim();
  return {
    customerName: draft.customerName.trim(),
    businessNumber: draft.businessNumber.trim(),
    corpName: draft.corpName.trim(),
    ceoName: draft.customerName.trim(),
    addr: normalizedAddress,
    bizType: draft.bizType.trim(),
    bizClass: draft.bizClass.trim(),
    issueMode: "review" as const,
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: draft.renewalContactMobile.trim(),
    memo: "",
    plantNames: [],
    matchAddresses: normalizedAddress ? [normalizedAddress] : []
  };
}

function getCustomerDraftSnapshotForCertificate(
  certificate: RenewalAgentCertificate,
  agent: RenewalAgentSnapshot | null,
  jobs: RenewalJob[]
): RenewalInfoSnapshot | null {
  const latestJobSnapshot = jobs.find((job) => {
    if (job.type !== "renewal-preflight" || job.status !== "completed" || !job.result) {
      return false;
    }

    const probe = job.result.bridge.preflightProbe;
    return probe.ok && probe.renewInfoSnapshot !== null && matchesRenewalCertificate(certificate, job);
  })?.result?.bridge.preflightProbe.renewInfoSnapshot;

  if (latestJobSnapshot) {
    return latestJobSnapshot;
  }

  if (!agent) {
    return null;
  }

  const probe = agent.bridge.preflightProbe;
  if (!probe.ok || !probe.renewInfoSnapshot || !matchesRenewalCertificate(certificate, probe)) {
    return null;
  }

  return probe.renewInfoSnapshot;
}

export function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [signInAccount, setSignInAccount] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(() =>
    typeof window !== "undefined" ? isSupabaseRecoveryHash(window.location.hash) : false
  );
  const [recoveryPasswordForm, setRecoveryPasswordForm] = useState<PasswordResetFormState>(
    createEmptyPasswordResetForm
  );
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [opsConsole, setOpsConsole] = useState<OpsConsoleData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    return getTabFromHash(hash) ?? "home";
  });
  const [onboardingNavPreference, setOnboardingNavPreference] = useState<{
    organizationId: string | null;
    showCompletedOnboardingNav: boolean;
  }>({
    organizationId: null,
    showCompletedOnboardingNav: false
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [requestedOnboardingStepId, setRequestedOnboardingStepId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormDefaults());
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerListFilter, setCustomerListFilter] = useState<CustomerListFilter>("all");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerDetailTab, setCustomerDetailTab] = useState<CustomerDetailTabId>("info");
  const [workFeedTab, setWorkFeedTab] = useState<"inbox" | "issued">("inbox");
  const [ownerPasswordResetForm, setOwnerPasswordResetForm] = useState<PasswordResetFormState>(
    createEmptyPasswordResetForm
  );
  const [ownerPasswordResetTarget, setOwnerPasswordResetTarget] =
    useState<OwnerPasswordResetTarget | null>(null);
  const [opsWorkspaceForm, setOpsWorkspaceForm] = useState<OpsWorkspaceFormState>(baseOpsWorkspaceForm);
  const [workspaceLimitEdits, setWorkspaceLimitEdits] = useState<Record<string, string>>({});
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("gmail");
  const [appDialog, setAppDialog] = useState<AppDialogState | null>(null);
  const [customerAddressResolveMessage, setCustomerAddressResolveMessage] = useState("");
  const [customerImportFile, setCustomerImportFile] = useState<CustomerImportParsedFile | null>(null);
  const [customerImportHeaderRowIndex, setCustomerImportHeaderRowIndex] = useState(0);
  const [customerImportMapping, setCustomerImportMapping] = useState<CustomerImportMapping>(EMPTY_CUSTOMER_IMPORT_MAPPING);
  const [customerImportPreview, setCustomerImportPreview] = useState<CustomerImportPreviewResponse | null>(null);
  const [customerImportProfile, setCustomerImportProfile] = useState<CustomerImportProfile | null>(null);
  const [completedBillingMonths, setCompletedBillingMonths] = useState<CompletedBillingMonth[]>([]);
  const [customerImportError, setCustomerImportError] = useState("");
  const [customerImportNotice, setCustomerImportNotice] = useState("");
  const [customerOnboardingFileName, setCustomerOnboardingFileName] = useState("");
  const [customerOnboardingWorkbook, setCustomerOnboardingWorkbook] = useState<CustomerOnboardingWorkbookInput | null>(null);
  const [customerOnboardingPreview, setCustomerOnboardingPreview] = useState<CustomerOnboardingPreviewResponse | null>(null);
  const [customerOnboardingSessionState, setCustomerOnboardingSessionState] =
    useState<CustomerOnboardingSessionState>(emptyCustomerOnboardingSessionState);
  const [customerOnboardingNotice, setCustomerOnboardingNotice] = useState("");
  const [customerOnboardingError, setCustomerOnboardingError] = useState("");
  const [quickRegisterForm, setQuickRegisterForm] = useState<QuickRegisterFormState>(createQuickRegisterForm());
  const [quickRegisterNotice, setQuickRegisterNotice] = useState("");
  const [quickRegisterError, setQuickRegisterError] = useState("");
  const [completedBillingNotice, setCompletedBillingNotice] = useState("");
  const [customerCertNotice, setCustomerCertNotice] = useState("");
  const [mailboxDataLoading, setMailboxDataLoading] = useState(false);
  const [mailboxDataLoaded, setMailboxDataLoaded] = useState(false);
  const [pendingCertSyncCustomerIds, setPendingCertSyncCustomerIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});
  const appDialogResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const customerAddressLookupRef = useRef("");
  const customerRenewalPasswordRef = useRef("");
  const customerRenewalIssuePasswordRef = useRef("");
  const customerCertificatePasswordCacheRef = useRef<Record<number, string>>({});
  const customerOnboardingCertificatesRef = useRef<RenewalAgentCertificate[] | null>(null);
  const customerNameInputRef = useRef<HTMLInputElement | null>(null);
  const certSyncInFlightRef = useRef(false);
  const mailboxLoadInFlightRef = useRef(false);
  const mailboxLoadedOrganizationRef = useRef<string | null>(null);
  const authSessionRef = useRef<Session | null>(null);
  const activeLoadTokenRef = useRef(0);
  const tabRoutingStateRef = useRef<{ hasActiveWorkspace: boolean; onboardingComplete: boolean; isPlatformAdmin: boolean }>({
    hasActiveWorkspace: false,
    onboardingComplete: false,
    isPlatformAdmin: false
  });
  const deferredCustomerSearchQuery = useDeferredValue(customerSearchQuery);
  const activeOrganizationId = data?.auth.activeOrganizationId ?? null;
  const showCompletedOnboardingNav =
    onboardingNavPreference.organizationId === activeOrganizationId && onboardingNavPreference.showCompletedOnboardingNav;
  const customerImportHeaderOptions = customerImportFile
    ? buildCustomerImportColumnOptions(customerImportFile.rows, customerImportHeaderRowIndex)
    : [];
  const customerImportRowsPayload = customerImportFile
    ? buildCustomerImportRowsPayload(customerImportFile.rows, customerImportHeaderRowIndex, customerImportMapping)
    : [];
  const canPreviewCustomerImport =
    customerImportFile !== null &&
    isCustomerImportMappingComplete(customerImportMapping) &&
    customerImportRowsPayload.length > 0;
  const completedBillingMonthSet = new Set(completedBillingMonths.map((item) => item.billingMonth));
  const isBillingMonthCompleted = (billingMonth?: string | null) => Boolean(billingMonth && completedBillingMonthSet.has(billingMonth));
  const getInboxDisplayParseStatus = (message: BootstrapPayload["inbox"][number]) => {
    if (message.parseStatus === "ignored") {
      return "ignored";
    }

    return isBillingMonthCompleted(message.parsedData?.billingMonth) ? "ignored" : message.parseStatus;
  };
  const isInboxActionable = (message: BootstrapPayload["inbox"][number]) => {
    const status = getInboxDisplayParseStatus(message);
    return status === "unmatched" || status === "failed" || status === "duplicate";
  };
  const invalidateActiveLoads = () => {
    activeLoadTokenRef.current += 1;
  };
  const ensureActiveLoad = (loadToken: number) => {
    if (activeLoadTokenRef.current !== loadToken || !authSessionRef.current) {
      throw new LoadCancelledError();
    }
  };

  const loadOpsConsole = async (): Promise<OpsConsoleData> => {
    const [partnerPoints, renewalAutomation, logs, workspaces] = await Promise.all([
      api<PartnerPointsPayload>("/api/popbill/partner-points"),
      api<RenewalAutomationPayload>("/api/automation/renewal-agent/snapshot"),
      api<LogEntry[]>("/api/logs"),
      api<OpsWorkspaceSummary[]>("/api/ops/workspaces")
    ]);

    return {
      partnerPoints,
      renewalAutomation,
      logs,
      workspaces
    };
  };

  const defaultRenewalHelperDownloadUrl =
    import.meta.env.VITE_RENEWAL_HELPER_DOWNLOAD_URL?.trim() || "/downloads/renewal-local-helper.zip";
  const loadMailboxData = async (options?: { force?: boolean }) => {
    const activeOrganizationId = data?.auth.activeOrganizationId ?? null;
    if (!activeOrganizationId) {
      setMailboxDataLoaded(false);
      setMailboxDataLoading(false);
      mailboxLoadedOrganizationRef.current = null;
      return;
    }

    if (!options?.force && mailboxLoadedOrganizationRef.current === activeOrganizationId) {
      setMailboxDataLoaded(true);
      return;
    }

    if (mailboxLoadInFlightRef.current) {
      return;
    }

    mailboxLoadInFlightRef.current = true;
    setMailboxDataLoading(true);
    try {
      const [inbox, drafts] = await Promise.all([
        api<BootstrapPayload["inbox"]>("/api/inbox"),
        api<BootstrapPayload["drafts"]>("/api/drafts")
      ]);
      setData((prev) =>
        prev && prev.auth.activeOrganizationId === activeOrganizationId
          ? {
              ...prev,
              inbox,
              drafts
            }
          : prev
      );
      mailboxLoadedOrganizationRef.current = activeOrganizationId;
      setMailboxDataLoaded(true);
    } finally {
      mailboxLoadInFlightRef.current = false;
      setMailboxDataLoading(false);
    }
  };

  const load = async () => {
    const loadToken = activeLoadTokenRef.current + 1;
    activeLoadTokenRef.current = loadToken;
    const payload = await api<BootstrapPayload>("/api/bootstrap");
    ensureActiveLoad(loadToken);
    const nextOpsConsole = payload.auth.isPlatformAdmin ? await loadOpsConsole() : null;
    ensureActiveLoad(loadToken);
    const nextCompletedBillingMonths = payload.auth.activeOrganizationId
      ? await api<{ months: CompletedBillingMonth[] }>("/api/completed-billing-months").then((response) => response.months)
      : [];
    ensureActiveLoad(loadToken);
    setError("");
    setActiveOrganizationId(payload.auth.activeOrganizationId);
    const nextActiveOrganizationId = payload.auth.activeOrganizationId ?? null;
    const mailboxDataStillValid = mailboxLoadedOrganizationRef.current === nextActiveOrganizationId;
    const nextPayload =
      mailboxDataStillValid && data?.auth.activeOrganizationId === nextActiveOrganizationId
        ? {
            ...payload,
            inbox: data.inbox,
            drafts: data.drafts
          }
        : payload;
    setData(nextPayload);
    setMailboxDataLoaded(mailboxDataStillValid);
    if (!mailboxDataStillValid) {
      mailboxLoadedOrganizationRef.current = null;
      setMailboxDataLoading(false);
    }
    customerCertificatePasswordCacheRef.current = {};
    setOpsConsole(nextOpsConsole);
    setCompletedBillingMonths(nextCompletedBillingMonths);
    setWorkspaceLimitEdits(
      nextOpsConsole
        ? Object.fromEntries(
            nextOpsConsole.workspaces.map((workspace) => [
              workspace.organizationId,
              String(workspace.managedCustomerLimit ?? "")
            ])
          )
        : {}
    );
    setCustomerForm((prev) => {
      if (prev.id) {
        const current = payload.customers.find((customer) => customer.id === prev.id);
        return customerToForm(current);
      }

      if (isPristineCustomerForm(prev)) {
        return createCustomerFormDefaults();
      }

      return prev;
    });
  };

  const loadWithRetry = async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await load();
        return;
      } catch (error) {
        if (isLoadCancelledError(error)) {
          return;
        }
        lastError = error instanceof Error ? error : new Error("초기 데이터를 불러오지 못했습니다.");
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw lastError ?? new Error("초기 데이터를 불러오지 못했습니다.");
  };

  const openAppDialog = (dialog: AppDialogState) =>
    new Promise<boolean>((resolve) => {
      appDialogResolverRef.current = resolve;
      setAppDialog(dialog);
    });

  const closeAppDialog = (confirmed: boolean) => {
    const resolve = appDialogResolverRef.current;
    appDialogResolverRef.current = null;
    setAppDialog(null);
    resolve?.(confirmed);
  };

  const showAppAlert = async (
    message: string,
    options?: {
      title?: string;
      tone?: AppDialogTone;
      confirmLabel?: string;
    }
  ) => {
    await openAppDialog({
      kind: "alert",
      title: options?.title ?? "안내",
      message,
      confirmLabel: options?.confirmLabel ?? "확인",
      tone: options?.tone ?? "default"
    });
  };

  const showAppConfirm = (
    message: string,
    options?: {
      title?: string;
      tone?: AppDialogTone;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  ) =>
    openAppDialog({
      kind: "confirm",
      title: options?.title ?? "이 작업을 진행할까요?",
      message,
      confirmLabel: options?.confirmLabel ?? "진행하기",
      cancelLabel: options?.cancelLabel ?? "취소",
      tone: options?.tone ?? "default"
    });

  const runAction = useCallback(
    async (
      key: string,
      action: () => Promise<void>,
      options?: {
        reload?: boolean;
      }
    ) => {
      try {
        setError("");
        setBusyKey(key);
        await action();
        if (options?.reload !== false) {
          await load();
          if (shouldLoadMailboxData(activeTab, customerDetailTab)) {
            await loadMailboxData({ force: true });
          }
        }
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "작업에 실패했습니다.");
      } finally {
        setBusyKey(null);
      }
    },
    [activeTab, customerDetailTab, load, loadMailboxData]
  );

  const {
    canUseCustomerRenewalAssistant,
    customerRenewalAssistant,
    setCustomerRenewalAssistant,
    customerRenewalAssistantJobs,
    customerRenewalAssistantAllCertificates,
    customerRenewalAssistantCertificates,
    helperReady,
    helperUpgradeRequired,
    helperUpgradeAvailable,
    helperActionBlockedReason,
    renewalHelperDownloadUrl,
    refreshCustomerRenewalAssistant,
    syncCustomerRenewalCertificates,
    loadCustomerRenewalCertificates,
    ensureLocalRenewalHelperActionAllowed
  } = useRenewalAssistantState({
    activeTab,
    isSettingsHelperActive: activeSettingsSection === "helper",
    activeOrganizationId,
    activeOrganizationRole: data?.auth.activeOrganizationRole,
    defaultRenewalHelperDownloadUrl,
    showAlert: showAppAlert
  });
  const customerRenewalAssistantElectronicTaxCertificateCount = customerRenewalAssistantAllCertificates.filter(
    (certificate) => deriveCustomerCertificateKind(certificate) === "electronic_tax"
  ).length;

  const settingsScreenState = useSettingsScreenState({
    activeOrganizationId,
    bootstrapOrganizationId: data?.auth.activeOrganizationId ?? null,
    activeOrganizationRole: data?.auth.activeOrganizationRole ?? null,
    bootstrapSettings: data?.settings ?? null,
    busyKey,
    currentUserId: data?.auth.userId ?? null,
    helperReady,
    helperCertificateCount: customerRenewalAssistantAllCertificates.length,
    customerRenewalAssistantOnline: customerRenewalAssistant?.agentOnline ?? false,
    customerRenewalAssistantUpgradeState: customerRenewalAssistant?.upgradeState ?? "unknown",
    setGlobalError: setError,
    revealField: (fieldKey) => setRevealedFields((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] ? true : prev[fieldKey] })),
    onRenewalCertificatePasswordChange: (password) => {
      customerRenewalPasswordRef.current = password;
    },
    onRenewalIssuePasswordChange: (password) => {
      customerRenewalIssuePasswordRef.current = password;
    },
    refreshCustomerRenewalAssistant,
    runAction,
    showConfirm: showAppConfirm,
    showAlert: showAppAlert
  });

  const settingsForm = settingsScreenState.settingsForm;
  const settingsHealth = settingsScreenState.settingsHealth;
  const currentWorkspaceSettings = settingsScreenState.savedSettings ?? data?.settings ?? null;
  const isMailTesting = busyKey === "mail-test";
  const customerOnboardingSessionActive =
    customerOnboardingSessionState.commitDone ||
    customerOnboardingSessionState.previewReady ||
    customerOnboardingWorkbook !== null ||
    customerOnboardingPreview !== null ||
    customerOnboardingFileName.trim() !== "";
  const onboardingElectronicTaxBusinessNumbers = new Set(
    (customerOnboardingWorkbook?.certificates ?? [])
      .filter((certificate) => certificate.certificateKind === "electronic_tax")
      .map((certificate) => digitsOnly(certificate.businessNumber))
      .filter((businessNumber): businessNumber is string => Boolean(businessNumber))
  );
  const settingsDerivedOnboardingPendingCertificateCount =
    !data
      ? 0
      : customerOnboardingSessionActive
        ? [...onboardingElectronicTaxBusinessNumbers]
            .map(
              (businessNumber) =>
                data.customers.find(
                  (customer) => digitsOnly(customer.businessNumber) === businessNumber
                ) ?? null
            )
            .filter(
              (customer): customer is Customer =>
                Boolean(
                  customer &&
                    (customer.popbillState !== "joined" || !customer.popbillCertRegistered)
                )
            ).length
        : data.customers.filter(
            (customer) =>
              customer.popbillState !== "joined" || !customer.popbillCertRegistered
          ).length;
  const settingsDerivedCustomerRegistrationReady = customerOnboardingSessionActive
    ? customerOnboardingSessionState.commitDone
    : (data?.customers.length ?? 0) > 0;
  const settingsDerivedModel = useSettingsDerivedModel({
    actionBar: {
      setupPendingCount: settingsScreenState.setupPendingCount,
      nextSettingsSection: settingsScreenState.nextSettingsSection,
      settingsHealth,
      helperReady,
      settingsAutosaveLabel: settingsScreenState.settingsAutosaveLabel,
      settingsAutosaveState: settingsScreenState.settingsAutosaveState
    },
    onboarding: {
      fields: {
        mailAddress: settingsForm?.mailAddress ?? "",
        mailPassword: settingsForm?.mailPassword ?? "",
        popbillUserIdPrefix: settingsForm?.popbillUserIdPrefix ?? "",
        operatorContactName: settingsForm?.operatorContactName ?? "",
        operatorContactTel: settingsForm?.operatorContactTel ?? "",
        operatorContactEmail: settingsForm?.operatorContactEmail ?? "",
        popbillSharedPassword: settingsForm?.popbillSharedPassword ?? "",
        renewalIssuePassword: settingsForm?.renewalIssuePassword ?? ""
      },
      settingsHealth,
      configured: {
        mailPasswordConfigured: settingsScreenState.mailPasswordConfigured,
        popbillSharedPasswordConfigured:
          settingsScreenState.popbillSharedPasswordConfigured,
        renewalIssuePasswordConfigured:
          settingsScreenState.renewalIssuePasswordConfigured,
        renewalCertificatePasswordConfigured:
          settingsScreenState.renewalCertificatePasswordConfigured
      },
      helper: {
        ready: helperReady,
        online: customerRenewalAssistant?.agentOnline ?? false,
        certificateCount: customerRenewalAssistantAllCertificates.length,
        upgradeState: customerRenewalAssistant?.upgradeState ?? "unknown",
        actionBlockedReason: helperActionBlockedReason,
        upgradeMessage: customerRenewalAssistant?.upgradeMessage ?? null
      },
      progress: {
        customerRegistrationReady: settingsDerivedCustomerRegistrationReady,
        certificateReady:
          settingsDerivedCustomerRegistrationReady &&
          settingsDerivedOnboardingPendingCertificateCount === 0
      }
    }
  });
  const toggleRevealField = useCallback((fieldKey: string) => {
    setRevealedFields((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  }, []);
  const settingsFeatureOrchestration = useMemo(
    () =>
      createSettingsActionAdapters({
        revealedFields,
        toggleRevealField,
        runAction
      }),
    [revealedFields, runAction, toggleRevealField]
  );
  const settingsOnboardingState =
    selectSettingsOnboardingState(settingsScreenState);
  const settingsOnboardingContent = useSettingsOnboardingModel({
    settingsState: settingsOnboardingState,
    onboarding: settingsDerivedModel.onboarding,
    orchestration: settingsFeatureOrchestration,
    busyKey,
    isMailTesting,
    helper: {
      ready: helperReady,
      upgradeRequired: helperUpgradeRequired,
      upgradeAvailable: helperUpgradeAvailable,
      actionBlockedReason: helperActionBlockedReason,
      online: customerRenewalAssistant?.agentOnline ?? false,
      checkedAt: customerRenewalAssistant?.helperCheckedAt ?? null,
      certificateCount: customerRenewalAssistantAllCertificates.length,
      upgradeMessage: customerRenewalAssistant?.upgradeMessage ?? null,
      latestVersion: customerRenewalAssistant?.latestVersion ?? null,
      minSupportedVersion: customerRenewalAssistant?.minSupportedVersion ?? null
    },
    renewalHelperDownloadUrl,
    runReadCertificates: async () =>
      runAction(
        "customer-renewal-bridge-probe",
        async () => {
          await syncCustomerRenewalCertificates({ showAlert: false });
        },
        { reload: false }
      ),
    formatDateTime
  });

  const certificatesScreenModel = useCertificatesScreenModel({
    customers: data?.customers ?? [],
    customerCertificates: data?.customerCertificates ?? [],
    customerRenewalAssistantOnline: customerRenewalAssistant?.agentOnline ?? false,
    customerRenewalAssistantJobs,
    customerRenewalAssistantAllCertificates
  });

  useEffect(() => {
    let mounted = true;

    const applyAuthHashState = (hash: string) => {
      const recoveryHash = isSupabaseRecoveryHash(hash);
      const recoveryError = getSupabaseAuthHashError(hash);

      if (!mounted) return;

      if (recoveryHash) {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
        return;
      }

      if (recoveryError) {
        setRecoveryMode(false);
        setError(recoveryError);
        clearSupabaseAuthHash();
      }
    };

    if (typeof window !== "undefined") {
      applyAuthHashState(window.location.hash);
    }

    void getSessionSafely()
      .then(({ session, clearedInvalidRefreshToken }) => {
        if (!mounted) return;
        authSessionRef.current = session;
        setAuthSession(session);
        if (clearedInvalidRefreshToken) {
          setAuthNotice("로그인 세션이 만료되어 다시 로그인해 주세요.");
        }
        setAuthReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        authSessionRef.current = null;
        setAuthSession(null);
        setAuthReady(true);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      authSessionRef.current = nextSession;
      setAuthSession(nextSession);

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
      } else if (event === "SIGNED_OUT") {
        setRecoveryMode(false);
      } else if (nextSession) {
        setError("");
      }

      if (!nextSession) {
        invalidateActiveLoads();
        setData(null);
        setOpsConsole(null);
        setAppDialog(null);
        appDialogResolverRef.current = null;
        setActiveOrganizationId(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !authSession || recoveryMode) return;

    void loadWithRetry().catch((loadError) => {
      if (!isLoadCancelledError(loadError)) {
        setError(loadError instanceof Error ? loadError.message : "초기 데이터를 불러오지 못했습니다.");
      }
    });
  }, [authReady, authSession, recoveryMode]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      const nextTab = getTabFromHash(hash);

      if (nextTab) {
        const resolvedTab = resolveWorkspaceTab(nextTab, tabRoutingStateRef.current);
        setActiveTab(resolvedTab);
        if (resolvedTab !== nextTab) {
          window.history.replaceState(null, "", `#${resolvedTab}`);
        }
        return;
      }

      if (isSupabaseRecoveryHash(hash)) {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
        return;
      }

      const recoveryError = getSupabaseAuthHashError(hash);
      if (recoveryError) {
        setRecoveryMode(false);
        setError(recoveryError);
        clearSupabaseAuthHash();
      }
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (recoveryMode || hasSupabaseAuthHash(window.location.hash)) {
      return;
    }

    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, "", `#${activeTab}`);
    }
  }, [activeTab, recoveryMode]);

  useEffect(() => {
    if (!activeOrganizationId) {
      setOnboardingNavPreference({
        organizationId: null,
        showCompletedOnboardingNav: false
      });
      return;
    }

    setOnboardingNavPreference({
      organizationId: activeOrganizationId,
      showCompletedOnboardingNav: readOnboardingNavVisibilityPreference(activeOrganizationId)
    });
  }, [activeOrganizationId]);

  useEffect(() => {
    if (!onboardingNavPreference.organizationId) {
      return;
    }

    writeOnboardingNavVisibilityPreference(
      onboardingNavPreference.organizationId,
      onboardingNavPreference.showCompletedOnboardingNav
    );
  }, [onboardingNavPreference]);

  useEffect(() => {
    if (!data) return;

    const nextTab = resolveWorkspaceTab(activeTab, tabRoutingStateRef.current);

    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, data, customerRenewalAssistant]);

  useEffect(() => {
    if (!data || activeTab !== "customers" || creatingCustomer) return;
    const normalizedSearch = customerSearchQuery.trim().toLocaleLowerCase("ko-KR");
    const visibleCustomers = data.customers.filter((customer) => {
      const matchesFilter = matchesCustomerListFilter(customer, customerListFilter);
      const matchesSearch =
        normalizedSearch === "" ||
        customer.customerName.toLocaleLowerCase("ko-KR").includes(normalizedSearch) ||
        customer.corpName.toLocaleLowerCase("ko-KR").includes(normalizedSearch) ||
        customer.businessNumber.toLocaleLowerCase("ko-KR").includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    }).sort(compareCustomersForList);

    if (visibleCustomers.length === 0) {
      if (customerForm.id !== null) {
        setCustomerForm(createCustomerFormDefaults());
      }
      return;
    }

    if (customerForm.id === null) {
      if (!isPristineCustomerForm(customerForm)) return;
      setCustomerForm(customerToForm(visibleCustomers[0]));
      return;
    }

    if (!visibleCustomers.some((customer) => customer.id === customerForm.id)) {
      setCustomerForm(customerToForm(visibleCustomers[0]));
    }
  }, [activeTab, creatingCustomer, customerForm, customerListFilter, customerSearchQuery, data]);

  useEffect(() => {
    if (!data?.auth.activeOrganizationId) {
      return;
    }

    if (!shouldLoadMailboxData(activeTab, customerDetailTab)) {
      return;
    }

    if (mailboxLoadedOrganizationRef.current === data.auth.activeOrganizationId || mailboxLoadInFlightRef.current) {
      return;
    }

    void loadMailboxData().catch((mailboxError) => {
      setError(mailboxError instanceof Error ? mailboxError.message : "메일 데이터를 불러오지 못했습니다.");
    });
  }, [activeTab, customerDetailTab, data?.auth.activeOrganizationId]);

  useEffect(() => {
    if (!data || activeTab !== "home") return;

    const nextQuickRegisterMessages = data.inbox
      .filter((message) => getInboxDisplayParseStatus(message) === "unmatched" && message.parsedData?.plantAddress)
      .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());

    if (nextQuickRegisterMessages.length === 0) {
      if (quickRegisterForm.messageId !== null) {
        setQuickRegisterForm(createQuickRegisterForm());
      }
      return;
    }

    const selectedMessage = quickRegisterForm.messageId
      ? nextQuickRegisterMessages.find((message) => message.id === quickRegisterForm.messageId) ?? null
      : null;

    if (!selectedMessage) {
      setQuickRegisterForm(createQuickRegisterForm(nextQuickRegisterMessages[0]));
    }
  }, [activeTab, data, quickRegisterForm.messageId, completedBillingMonths]);

  useEffect(() => {
    if (creatingCustomer || customerForm.id === null) {
      setCustomerDetailTab("info");
    }
  }, [creatingCustomer, customerForm.id]);

  useEffect(() => {
    setCustomerCertNotice("");
    setPendingCertSyncCustomerIds([]);
  }, [creatingCustomer, customerForm.id]);

  useEffect(() => {
    if (pendingCertSyncCustomerIds.length === 0) {
      return;
    }

    let disposed = false;
    const tryRefreshCertificateStatus = async () => {
      if (disposed || certSyncInFlightRef.current || pendingCertSyncCustomerIds.length === 0) {
        return;
      }

      certSyncInFlightRef.current = true;
      try {
        let refreshedCount = 0;
        let failedCount = 0;

        for (const customerId of pendingCertSyncCustomerIds) {
          try {
            await api(`/api/customers/${customerId}/popbill/cert-status`, {
              method: "POST"
            });
            refreshedCount += 1;
          } catch {
            failedCount += 1;
          }
        }

        if (refreshedCount > 0) {
          await load();
        }

        if (!disposed) {
          if (refreshedCount > 0 && failedCount === 0) {
            setCustomerCertNotice(
              refreshedCount === 1 ? "인증서 상태를 자동으로 다시 확인했습니다." : `인증서 상태 ${refreshedCount}건을 자동으로 다시 확인했습니다.`
            );
          } else if (refreshedCount > 0) {
            setCustomerCertNotice(`인증서 상태 ${refreshedCount}건을 확인했고 ${failedCount}건은 아직 확인하지 못했습니다.`);
          } else {
            setCustomerCertNotice("인증서 등록 후 상태를 아직 확인하지 못했습니다. 완료 후 다시 이 화면으로 돌아오거나 만료일 확인을 눌러주세요.");
          }
        }
      } finally {
        certSyncInFlightRef.current = false;
        if (!disposed) {
          setPendingCertSyncCustomerIds([]);
        }
      }
    };

    const handleWindowFocus = () => {
      void tryRefreshCertificateStatus();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void tryRefreshCertificateStatus();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pendingCertSyncCustomerIds]);

  useEffect(() => {
    if (activeTab !== "customers") {
      return;
    }

    if (!creatingCustomer || customerForm.id !== null) {
      return;
    }

    const timerId = window.setTimeout(() => {
      customerNameInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [activeTab, creatingCustomer, customerForm.id]);

  useEffect(() => {
    if (!appDialog) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAppDialog(appDialog.kind === "alert" ? true : false);
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "TEXTAREA") {
          return;
        }
        event.preventDefault();
        closeAppDialog(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [appDialog]);

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setError("");
      setAuthNotice("");
      setAuthBusy(true);
      const result = await api<{
        session: {
          access_token: string;
          refresh_token: string;
        };
      }>("/api/public/login", {
        method: "POST",
        body: JSON.stringify({
          account: signInAccount.trim(),
          password: signInPassword
        })
      });
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token
      });
      if (sessionError) throw sessionError;
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "로그인에 실패했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    invalidateActiveLoads();
    authSessionRef.current = null;
    setBusyKey(null);
    setError("");
    setAuthNotice("");
    setData(null);
    setOpsConsole(null);
    setOwnerPasswordResetTarget(null);
    setOwnerPasswordResetForm(createEmptyPasswordResetForm());
    setRecoveryMode(false);
    setRecoveryPasswordForm(createEmptyPasswordResetForm());
    setAppDialog(null);
    appDialogResolverRef.current = null;
    setActiveOrganizationId(null);
    clearSupabaseAuthHash();
    await supabase.auth.signOut();
  };

  const changeOrganization = async (organizationId: string) => {
    setActiveOrganizationId(organizationId);
    setError("");
    setOwnerPasswordResetTarget(null);
    setOwnerPasswordResetForm(createEmptyPasswordResetForm());
    await runAction(
      "workspace-change",
      async () => {
        await load();
      },
      { reload: false }
    );
  };

  const resolveCustomerAddress = async () => {
    const rawAddress = customerForm.addr.trim();

    if (!rawAddress) {
      customerAddressLookupRef.current = "";
      setCustomerAddressResolveMessage("");
      return "";
    }

    if (customerAddressLookupRef.current === rawAddress) {
      return rawAddress;
    }

    setCustomerAddressResolveMessage("주소 보정 중...");

    try {
      const result = await api<AddressResolveResponse>(`/api/address/resolve?query=${encodeURIComponent(rawAddress)}`);

      if (!result.ok || !result.resolvedAddress) {
        customerAddressLookupRef.current = "";
        setCustomerAddressResolveMessage("도로명과 건물번호를 더 자세히 입력하면 전체 주소로 보정됩니다.");
        return rawAddress;
      }

      const resolvedAddress = result.resolvedAddress;
      customerAddressLookupRef.current = resolvedAddress;
      setCustomerForm((prev) => (prev.addr.trim() === rawAddress ? { ...prev, addr: resolvedAddress } : prev));
      setCustomerAddressResolveMessage(
        resolvedAddress === rawAddress
          ? result.postalCode
            ? `주소 확인 완료 · 우편번호 ${result.postalCode}`
            : "주소 확인 완료"
          : result.postalCode
            ? `전체 주소로 보정했습니다 · 우편번호 ${result.postalCode}`
            : "전체 주소로 보정했습니다."
      );
      return resolvedAddress;
    } catch {
      customerAddressLookupRef.current = "";
      setCustomerAddressResolveMessage("주소 자동 보정에 실패했습니다.");
      return rawAddress;
    }
  };

  const saveCustomer = async () => {
    const isEditing = customerForm.id !== null;
    const resolvedAddress = await resolveCustomerAddress();
    const normalizedAddress = (resolvedAddress || customerForm.addr).trim();
    const payload = {
      customerName: customerForm.customerName,
      businessNumber: customerForm.businessNumber,
      corpName: customerForm.corpName,
      ceoName: customerForm.customerName,
      addr: resolvedAddress || customerForm.addr,
      bizType: customerForm.bizType,
      bizClass: customerForm.bizClass,
      issueMode: isEditing ? customerForm.issueMode : "review",
      issueDay: null,
      issueHour: null,
      issueMinute: null,
      renewalContactMobile: customerForm.renewalContactMobile,
      memo: customerForm.memo,
      plantNames: [],
      matchAddresses: normalizedAddress ? [normalizedAddress] : []
    };

    if (customerForm.id) {
      const savedCustomer = await api<CustomerSaveResponse>(`/api/customers/${customerForm.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setCreatingCustomer(false);
      setCustomerDetailTab("info");
      setCustomerForm(customerToForm(savedCustomer));
      setCustomerAddressResolveMessage("");
      customerAddressLookupRef.current = "";
      return;
    } else {
      const savedCustomer = await api<CustomerSaveResponse>("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setCreatingCustomer(false);
      setCustomerDetailTab("info");
      setCustomerForm(customerToForm(savedCustomer));
      setCustomerAddressResolveMessage("");
      customerAddressLookupRef.current = "";
      return;
    }
  };

  const applyCustomerImportHeaderRow = (nextHeaderRowIndex: number) => {
    if (!customerImportFile) return;
    setCustomerImportHeaderRowIndex(nextHeaderRowIndex);
    const nextColumns = buildCustomerImportColumnOptions(customerImportFile.rows, nextHeaderRowIndex);
    const guessedMapping = guessCustomerImportMapping(nextColumns);
    const profileMapping =
      customerImportProfile && customerImportProfile.headerRowIndex === nextHeaderRowIndex
        ? buildCustomerImportMappingFromProfile(nextColumns, customerImportProfile)
        : EMPTY_CUSTOMER_IMPORT_MAPPING;
    setCustomerImportMapping({ ...guessedMapping, ...Object.fromEntries(Object.entries(profileMapping).filter(([, value]) => value !== "")) });
    setCustomerImportPreview(null);
    setCustomerImportError("");
    setCustomerImportNotice("");
  };

  const handleCustomerImportFileChange = async (file: File | null) => {
    if (!file) {
      setCustomerImportFile(null);
      setCustomerImportHeaderRowIndex(0);
      setCustomerImportMapping(EMPTY_CUSTOMER_IMPORT_MAPPING);
      setCustomerImportPreview(null);
      setCustomerImportError("");
      setCustomerImportNotice("");
      return;
    }

    try {
      const XLSX = await loadXlsxModule();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = file.name.toLowerCase().endsWith(".csv")
        ? XLSX.read(decodeCustomerImportCsv(arrayBuffer), { type: "string", raw: false })
        : XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error("읽을 수 있는 시트가 없습니다.");
      }

      const sheet = workbook.Sheets[firstSheetName];
      const parsedRows = (XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        blankrows: false,
        defval: ""
      }) as unknown[][])
        .map((row) => (Array.isArray(row) ? row.map((cell) => normalizeImportCell(cell)) : []))
        .filter((row) => row.some((cell) => cell !== ""));

      if (parsedRows.length === 0) {
        throw new Error("비어 있는 파일입니다.");
      }

      const nextFile = {
        fileName: file.name,
        sheetName: firstSheetName,
        rows: parsedRows
      };

      const preferredHeaderRowIndex =
        customerImportProfile && customerImportProfile.headerRowIndex < parsedRows.length
          ? customerImportProfile.headerRowIndex
          : 0;
      const nextColumns = buildCustomerImportColumnOptions(parsedRows, preferredHeaderRowIndex);
      const guessedMapping = guessCustomerImportMapping(nextColumns);
      const profileMapping = customerImportProfile
        ? buildCustomerImportMappingFromProfile(nextColumns, customerImportProfile)
        : EMPTY_CUSTOMER_IMPORT_MAPPING;

      setCustomerImportFile(nextFile);
      setCustomerImportHeaderRowIndex(preferredHeaderRowIndex);
      setCustomerImportMapping({ ...guessedMapping, ...Object.fromEntries(Object.entries(profileMapping).filter(([, value]) => value !== "")) });
      setCustomerImportPreview(null);
      setCustomerImportError("");
      setCustomerImportNotice(`${file.name} 파일을 불러왔습니다.`);
    } catch (importError) {
      setCustomerImportFile(null);
      setCustomerImportHeaderRowIndex(0);
      setCustomerImportMapping(EMPTY_CUSTOMER_IMPORT_MAPPING);
      setCustomerImportPreview(null);
      setCustomerImportNotice("");
      setCustomerImportError(importError instanceof Error ? importError.message : "파일을 읽지 못했습니다.");
    }
  };

  const previewCustomerImport = async () => {
    if (!canPreviewCustomerImport) {
      setCustomerImportError("헤더와 4개 필드 매핑을 먼저 확인하세요.");
      return;
    }

    setCustomerImportError("");
    setCustomerImportNotice("");
    const profilePayload = {
      headerRowIndex: customerImportHeaderRowIndex,
      fieldHeaderMap: Object.fromEntries(
        CUSTOMER_IMPORT_FIELD_OPTIONS.map((field) => [
          field.id,
          customerImportHeaderOptions.find((option) => option.value === customerImportMapping[field.id])?.label ?? ""
        ])
      ) as CustomerImportProfile["fieldHeaderMap"]
    };
    const savedProfile = await api<{ profile: CustomerImportProfile }>("/api/customer-import/profile", {
      method: "PUT",
      body: JSON.stringify(profilePayload)
    });
    setCustomerImportProfile(savedProfile.profile);
    const preview = await api<CustomerImportPreviewResponse>("/api/customer-import/preview", {
      method: "POST",
      body: JSON.stringify({ rows: customerImportRowsPayload })
    });
    setCustomerImportPreview(preview);
  };

  const commitCustomerImport = async () => {
    if (!customerImportPreview || customerImportPreview.importableRows === 0) {
      setCustomerImportError("가져올 수 있는 행이 없습니다.");
      return;
    }

    setCustomerImportError("");
    const result = await api<CustomerImportCommitResponse>("/api/customer-import/commit", {
      method: "POST",
      body: JSON.stringify({ rows: customerImportRowsPayload })
    });

    setCustomerImportNotice(`가져오기 완료 · 성공 ${result.successCount}건 / 실패 ${result.failedCount}건`);
    if (result.failedCount > 0) {
      setCustomerImportError(result.failedRows.map((row) => `${row.rowIndex}행: ${row.message}`).join("\n"));
    } else {
      setCustomerImportError("");
    }
    await load();
    const followUpPreview = await api<CustomerImportPreviewResponse>("/api/customer-import/preview", {
      method: "POST",
      body: JSON.stringify({ rows: customerImportRowsPayload })
    });
    setCustomerImportPreview(followUpPreview);
  };

  const loadCustomerOnboardingAvailableCertificates = async (options?: { forceRefresh?: boolean }) => {
    ensureLocalRenewalHelperActionAllowed("전자세금용 공동인증서 읽기");
    if (!options?.forceRefresh && customerOnboardingCertificatesRef.current) {
      return customerOnboardingCertificatesRef.current;
    }

    const response = await requestLocalRenewalCertificates();
    const certificates = response.result.storageProbe.ok ? response.result.storageProbe.certificates : [];
    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status: {
          online: true,
          version: response.version,
          message: prev?.helperMessage ?? "로컬 헬퍼가 준비되었습니다."
        },
        helperVersion: response.version,
        helperMessage: prev?.helperMessage ?? "로컬 헬퍼가 준비되었습니다.",
        jobs: prev?.jobs ?? [],
        certificates: prev?.certificates ?? [],
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
        defaultRenewalHelperDownloadUrl
      })
    );
    const electronicTaxCertificates = certificates.filter((certificate) => deriveCustomerCertificateKind(certificate) === "electronic_tax");
    customerOnboardingCertificatesRef.current = electronicTaxCertificates;
    return electronicTaxCertificates;
  };
  const { resolveSingleElectronicTaxCertificate } = useElectronicTaxOnboarding({
    loadAvailableCertificates: loadCustomerOnboardingAvailableCertificates
  });

  const resolveCustomerOnboardingTemplateWorkbook = async (
    templateWorkbook: CustomerOnboardingTemplateWorkbookInput
  ): Promise<CustomerOnboardingResolutionResult> => {
    ensureLocalRenewalHelperActionAllowed("고객 초기 등록 준비");
    return await resolveElectronicTaxOnboardingTemplateWorkbook({
      templateWorkbook,
      loadAvailableCertificates: loadCustomerOnboardingAvailableCertificates,
      resolveSharedPassword: async () => await resolveCustomerRenewalPassword({ promptIfMissing: false }),
      requestPreflight: requestLocalRenewalPreflight
    });
  };

  const downloadCustomerOnboardingImportTemplate = async () => {
    const [XLSX, certificates] = await Promise.all([
      loadXlsxModule(),
      loadCustomerOnboardingAvailableCertificates({ forceRefresh: true })
    ]);

    if (certificates.length === 0) {
      throw new Error("이 PC에서 전자세금용 공동인증서를 찾지 못했습니다.");
    }

    downloadCustomerOnboardingTemplate(XLSX, certificates);
    setCustomerOnboardingFileName("");
    setCustomerOnboardingWorkbook(null);
    setCustomerOnboardingPreview(null);
    setCustomerOnboardingSessionState({
      templateDownloaded: true,
      previewReady: false,
      commitDone: false
    });
    setCustomerOnboardingNotice(buildElectronicTaxOnboardingTemplateNotice(certificates.length));
    setCustomerOnboardingError("");
  };

  const applyElectronicTaxOnboardingUploadFlowResult = (result: ElectronicTaxOnboardingUploadFlowResult) => {
    setCustomerOnboardingFileName(result.fileName);
    setCustomerOnboardingWorkbook(result.workbook);
    setCustomerOnboardingPreview(result.preview);
    setCustomerOnboardingSessionState(result.sessionState);
    setCustomerOnboardingNotice(result.notice);
    setCustomerOnboardingError(result.error);
  };

  const handleCustomerOnboardingFileChange = async (file: File | null) => {
    const result = await runElectronicTaxOnboardingUploadFlow({
      file,
      previousSessionState: customerOnboardingSessionState,
      parseWorkbook: async (selectedFile) => {
        const XLSX = await loadXlsxModule();
        return await parseCustomerOnboardingWorkbook(XLSX, selectedFile);
      },
      resolveWorkbook: resolveCustomerOnboardingTemplateWorkbook,
      previewWorkbook: async (workbook) =>
        await api<CustomerOnboardingPreviewResponse>("/api/customer-onboarding/preview", {
          method: "POST",
          body: JSON.stringify(workbook)
        })
    });
    applyElectronicTaxOnboardingUploadFlowResult(result);
  };

  const commitCustomerOnboardingWorkbook = async () => {
    if (!customerOnboardingWorkbook || !customerOnboardingPreview) {
      setCustomerOnboardingError("먼저 고객 초기 등록 양식을 업로드하세요.");
      return;
    }

    const importableCount = customerOnboardingPreview.createCount + customerOnboardingPreview.updateCount;
    if (importableCount === 0) {
      setCustomerOnboardingError("가져올 수 있는 고객이 없습니다.");
      return;
    }

    setCustomerOnboardingError("");
    const commitStart = await api<CustomerOnboardingCommitStartResponse>("/api/customer-onboarding/commit", {
      method: "POST",
      body: JSON.stringify({
        previewId: customerOnboardingPreview.previewId
      })
    });
    const result = await waitForElectronicTaxOnboardingCommitBatch({
      batchId: commitStart.batchId,
      initial: commitStart,
      loadBatch: async (batchId) => await api<CustomerOnboardingCommitResponse>(`/api/customer-onboarding/batches/${batchId}`),
      onProgress: setCustomerOnboardingNotice
    });

    setCustomerOnboardingNotice(buildElectronicTaxOnboardingCommitNotice(result));

    const failedMessages = result.failedRows.map((row) => `${row.rowIndex}행: ${row.message}`);
    const warningMessages = result.warnings.map((warning) => `${warning.rowIndex}행: ${warning.message}`);
    setCustomerOnboardingError([...failedMessages, ...warningMessages].join("\n"));

    await load();
    setCustomerOnboardingPreview(null);
    setCustomerOnboardingSessionState((prev) => ({
      ...prev,
      templateDownloaded: true,
      previewReady: true,
      commitDone: true
    }));
  };

  const selectQuickRegisterMessage = (messageId: number) => {
    const message = quickRegisterMessages.find((item) => item.id === messageId) ?? null;
    setQuickRegisterForm(createQuickRegisterForm(message));
    setQuickRegisterNotice("");
    setQuickRegisterError("");
  };

  const submitQuickRegister = async () => {
    if (!quickRegisterForm.messageId) {
      setQuickRegisterError("처리할 예외 메일을 선택하세요.");
      return;
    }

    const customerName = quickRegisterForm.customerName.trim();
    const businessNumber = quickRegisterForm.businessNumber.trim();
    const corpName = quickRegisterForm.corpName.trim();
    const addr = quickRegisterForm.addr.trim();

    if (!customerName || !businessNumber || !corpName || !addr) {
      setQuickRegisterError("대표자명, 사업자번호, 세금계산서 상호, 주소를 모두 입력하세요.");
      return;
    }

    setQuickRegisterError("");
    setQuickRegisterNotice("");

    await api("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        customerName,
        businessNumber,
        corpName,
        ceoName: customerName,
        addr,
        bizType: "전기업",
        bizClass: "태양광발전(자가용PPA)",
        issueMode: "review",
        issueDay: null,
        issueHour: null,
        issueMinute: null,
        memo: "",
        plantNames: [],
        matchAddresses: [addr]
      })
    });

    const result = await api<{ ok: true; status: string }>(`/api/inbox/${quickRegisterForm.messageId}/reprocess`, {
      method: "POST"
    });

    setQuickRegisterNotice(`고객 등록 후 메일 재처리 완료 · ${getParseStatusLabel(result.status)}`);
    await load();
  };

  const markBillingMonthCompleted = async (summary: BillingMonthSummary) => {
    const confirmed = await showAppConfirm(
      `${summary.billingMonth} 정산월 메일 ${summary.totalCount}건을 완료 처리합니다.\n이 달 메일은 더 이상 확인 대상에 올리지 않습니다.`,
      {
        title: "정산월 완료 처리",
        tone: "warn",
        confirmLabel: "완료 처리"
      }
    );
    if (!confirmed) return;

    setCompletedBillingNotice("");
    const response = await api<{ month: CompletedBillingMonth }>("/api/completed-billing-months", {
      method: "POST",
      body: JSON.stringify({ billingMonth: summary.billingMonth })
    });
    setCompletedBillingMonths((prev) => {
      const next = [...prev.filter((item) => item.billingMonth !== response.month.billingMonth), response.month];
      return next.sort((left, right) => right.billingMonth.localeCompare(left.billingMonth));
    });
    setCompletedBillingNotice(`${summary.billingMonth} 정산월을 완료 처리했습니다.`);
  };

  const fetchStoredCustomerCertificatePassword = async (certificateId: number) => {
    const cachedPassword = customerCertificatePasswordCacheRef.current[certificateId]?.trim();
    return cachedPassword || "";
  };

  const returnToLoginFromRecovery = async () => {
    setRecoveryMode(false);
    setRecoveryPasswordForm(createEmptyPasswordResetForm());
    clearSupabaseAuthHash();
    setError("");

    if (authSession) {
      await supabase.auth.signOut();
    }
  };

  const submitRecoveryPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const nextPassword = recoveryPasswordForm.nextPassword.trim();
      const confirmPassword = recoveryPasswordForm.confirmPassword.trim();

      setError("");
      setAuthNotice("");
      setAuthBusy(true);

      if (!authSession) {
        throw new Error("비밀번호 재설정 링크를 다시 열어주세요.");
      }

      if (nextPassword.length < 8) {
        throw new Error("새 비밀번호는 8자 이상으로 입력하세요.");
      }

      if (nextPassword !== confirmPassword) {
        throw new Error("새 비밀번호와 확인 값이 일치하지 않습니다.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: nextPassword
      });

      if (updateError) {
        throw updateError;
      }

      setRecoveryPasswordForm(createEmptyPasswordResetForm());
      setRecoveryMode(false);
      clearSupabaseAuthHash();
      await supabase.auth.signOut();
      setAuthNotice("비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요.");
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const openOwnerPasswordReset = (workspace: OpsWorkspaceSummary) => {
    setOwnerPasswordResetTarget({
      organizationId: workspace.organizationId,
      organizationName: workspace.organizationName,
      loginId: workspace.ownerLoginId
    });
    setOwnerPasswordResetForm(createEmptyPasswordResetForm());
  };

  const cancelOwnerPasswordReset = () => {
    setOwnerPasswordResetTarget(null);
    setOwnerPasswordResetForm(createEmptyPasswordResetForm());
  };

  const submitOwnerPasswordReset = async () => {
    if (!ownerPasswordResetTarget) {
      throw new Error("비밀번호를 재설정할 대상을 먼저 선택하세요.");
    }

    const nextPassword = ownerPasswordResetForm.nextPassword.trim();
    const confirmPassword = ownerPasswordResetForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      throw new Error("임시 비밀번호는 8자 이상으로 입력하세요.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("임시 비밀번호와 확인 값이 일치하지 않습니다.");
    }

    const result = await api<{ ok: true; ownerLoginId: string | null }>(
      `/api/ops/workspaces/${ownerPasswordResetTarget.organizationId}/reset-owner-password`,
      {
        method: "POST",
        body: JSON.stringify({
          password: nextPassword
        })
      }
    );

    await showAppAlert(
      `${ownerPasswordResetTarget.organizationName} 작업공간의 owner(${result.ownerLoginId ?? "-"}) 임시 비밀번호를 재설정했습니다.`,
      {
        title: "owner 비밀번호 재설정",
        tone: "success"
      }
    );
    cancelOwnerPasswordReset();
  };

  const openPartnerChargeUrl = async () => {
    const result = await api<{ url: string }>("/api/popbill/partner-charge-url");
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const dispatchInternalJobs = async () => {
    const result = await api<InternalJobDispatchResponse>("/api/internal/jobs/dispatch", {
      method: "POST"
    });

    await showAppAlert(
      `배치 작업 생성이 완료되었습니다.\n확인한 작업공간: ${result.checkedOrganizations}곳\n새로 큐에 넣은 작업: ${result.dispatched}건\n건너뛴 작업: ${result.skipped}건`,
      {
        title: "배치 작업 생성 완료",
        tone: "success"
      }
    );
  };

  const runInternalJobs = async () => {
    const result = await api<InternalJobRunResponse>("/api/internal/jobs/run", {
      method: "POST",
      body: JSON.stringify({ limit: 100 })
    });

    await showAppAlert(
      `배치 작업 실행이 완료되었습니다.\n조회한 작업: ${result.attempted}건\n선점한 작업: ${result.claimed}건\n완료: ${result.completed}건\n실패: ${result.failed}건`,
      {
        title: "배치 작업 실행 완료",
        tone: "success"
      }
    );
  };

  const createWorkspace = async () => {
    const managedCustomerLimit = Number(opsWorkspaceForm.managedCustomerLimit);
    if (!Number.isInteger(managedCustomerLimit) || managedCustomerLimit < 1) {
      throw new Error("관리 고객 한도는 1 이상 숫자로 입력하세요.");
    }

    const payload = {
      organizationName: opsWorkspaceForm.organizationName.trim(),
      organizationBusinessNumber: opsWorkspaceForm.organizationBusinessNumber.trim(),
      managedCustomerLimit,
      ownerLoginId: opsWorkspaceForm.ownerLoginId.trim(),
      ownerDisplayName: opsWorkspaceForm.ownerDisplayName.trim(),
      ownerPassword: opsWorkspaceForm.ownerPassword
    };

    const result = await api<OpsWorkspaceCreateResponse>("/api/ops/workspaces", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setOpsWorkspaceForm(baseOpsWorkspaceForm);
    await showAppAlert(
      result.workspaceAction === "reused-existing"
        ? `이미 개통된 고객사 작업공간을 다시 불러왔습니다.\n작업공간: ${result.workspace.organizationName}\nowner 로그인 아이디: ${result.workspace.ownerLoginId}`
        : result.ownerAction === "created-user"
          ? `고객사 작업공간을 개통했습니다.\n작업공간: ${result.workspace.organizationName}\nowner 로그인 아이디: ${result.workspace.ownerLoginId}\n새 계정이 생성되었습니다. 전달한 임시 비밀번호로 첫 로그인하면 됩니다.`
          : `고객사 작업공간을 개통했습니다.\n작업공간: ${result.workspace.organizationName}\nowner 로그인 아이디: ${result.workspace.ownerLoginId}\n기존 사용자 계정을 owner로 연결했습니다.`,
      {
        title: "고객사 작업공간 개통",
        tone: "success"
      }
    );
  };

  const updateWorkspaceManagedCustomerLimit = async (workspace: OpsWorkspaceSummary) => {
    const rawValue = workspaceLimitEdits[workspace.organizationId] ?? String(workspace.managedCustomerLimit ?? "");
    const managedCustomerLimit = Number(rawValue);

    if (!Number.isInteger(managedCustomerLimit) || managedCustomerLimit < 1) {
      throw new Error("관리 고객 한도는 1 이상 숫자로 입력하세요.");
    }

    const result = await api<OpsWorkspaceLimitUpdateResponse>(
      `/api/ops/workspaces/${workspace.organizationId}/managed-customer-limit`,
      {
        method: "PUT",
        body: JSON.stringify({ managedCustomerLimit })
      }
    );

    setOpsConsole((prev) =>
      prev
        ? {
            ...prev,
            workspaces: prev.workspaces.map((item) =>
              item.organizationId === result.workspace.organizationId ? result.workspace : item
            )
          }
        : prev
    );
    setWorkspaceLimitEdits((prev) => ({
      ...prev,
      [workspace.organizationId]: String(result.workspace.managedCustomerLimit ?? "")
    }));
    await showAppAlert(
      `${result.workspace.organizationName} 작업공간의 관리 고객 한도를 ${result.workspace.managedCustomerLimit ?? "-"}명으로 저장했습니다.`,
      {
        title: "관리 고객 한도 저장",
        tone: "success"
      }
    );
  };

  const requestRenewalBridgeProbe = async (customerId?: number | null) => {
    const result = await api<{ id: number }>("/api/automation/renewal-jobs/bridge-probe", {
      method: "POST",
      body: JSON.stringify({
        customerId: customerId ?? null
      })
    });

    await showAppAlert(`로컬 인증서 목록 진단 작업을 큐에 추가했습니다.\n작업번호: ${result.id}`, {
      title: "진단 작업 추가",
      tone: "success"
    });
  };

  const requestRenewalCertIdProbe = async (
    certificate: RenewalAgentCertificate
  ) => {
    const result = await api<{ id: number }>("/api/automation/renewal-jobs/certid-probe", {
      method: "POST",
      body: JSON.stringify({
        certificateIndex: Number(certificate.index),
        certificateCn: certificate.cn || null
      })
    });

    await showAppAlert(
      `certID 조회 작업을 큐에 추가했습니다.\n작업번호: ${result.id}\n로컬 에이전트에 인증서 비밀번호 환경변수가 지정되어 있어야 실제 조회됩니다.`,
      {
        title: "certID 조회 작업 추가",
        tone: "success"
      }
    );
  };

  const requestRenewalPreflight = async (
    certificate: RenewalAgentCertificate
  ) => {
    const customers = data?.customers ?? [];
    const normalizedCn = certificate.cn.trim();
    const matchingCustomers = normalizedCn === ""
      ? []
      : customers.filter((customer) => {
          const corpName = customer.corpName.trim();
          const customerName = customer.customerName.trim();
          return corpName === normalizedCn || customerName === normalizedCn;
        });
    const matchedCustomerId = matchingCustomers.length === 1 ? matchingCustomers[0]?.id ?? null : null;
    const result = await api<{ id: number }>("/api/automation/renewal-jobs/preflight", {
      method: "POST",
      body: JSON.stringify({
        customerId: matchedCustomerId,
        certificateIndex: Number(certificate.index),
        certificateCn: certificate.cn || null
      })
    });

    await showAppAlert(
      `갱신 경로 분석 작업을 큐에 추가했습니다.\n작업번호: ${result.id}${matchedCustomerId ? `\n고객 기준 비교: ${matchingCustomers[0]?.customerName ?? "-"}` : ""}\n완료 후에는 고객관리 탭에서 고객 초안을 만들 수 있습니다.\n로컬 에이전트에 인증서 비밀번호 환경변수가 지정되어 있어야 실제 분석됩니다.`,
      {
        title: "갱신 경로 분석 작업 추가",
        tone: "success"
      }
    );
  };

  const resolveCustomerRenewalPassword = async (options?: { promptIfMissing?: boolean; linkedCertificateId?: number | null }) => {
    if (options?.linkedCertificateId) {
      const storedCertificatePassword = await fetchStoredCustomerCertificatePassword(options.linkedCertificateId);
      if (storedCertificatePassword) {
        customerRenewalPasswordRef.current = storedCertificatePassword;
        return storedCertificatePassword;
      }
    }

    const formPassword = settingsForm?.renewalCertificatePassword.trim() ?? "";
    if (formPassword) {
      customerRenewalPasswordRef.current = formPassword;
      return formPassword;
    }

    const cachedPassword = customerRenewalPasswordRef.current.trim();
    if (cachedPassword) {
      return cachedPassword;
    }

    if (!options?.promptIfMissing) {
      return "";
    }

    const promptedPassword =
      window
        .prompt(
          "공동인증서 비밀번호를 입력하세요.\n이 값은 현재 브라우저 탭 메모리에만 유지됩니다.",
          ""
        )
        ?.trim() || "";
    if (promptedPassword) {
      customerRenewalPasswordRef.current = promptedPassword;
    }
    return promptedPassword;
  };

  const resolveCustomerRenewalIssuePassword = async (options?: { promptIfMissing?: boolean }) => {
    const rawFormPassword = settingsForm?.renewalIssuePassword ?? "";
    const formPassword = normalizeRenewalIssuePasswordInput(rawFormPassword.trim());
    if (formPassword.length === 6) {
      customerRenewalIssuePasswordRef.current = formPassword;
      return formPassword;
    }

    if (rawFormPassword.trim()) {
      return "";
    }

    const cachedPassword = normalizeRenewalIssuePasswordInput(customerRenewalIssuePasswordRef.current.trim());
    if (cachedPassword.length === 6) {
      return cachedPassword;
    }

    if (!options?.promptIfMissing) {
      return "";
    }

    const promptedPassword = normalizeRenewalIssuePasswordInput(
      window
        .prompt(
          "공동인증서 발급용 임시번호 6자리를 입력하세요.\n이 값은 현재 브라우저 탭 메모리에만 유지됩니다.",
          ""
        )
        ?.trim() || ""
    );
    if (promptedPassword.length === 6) {
      customerRenewalIssuePasswordRef.current = promptedPassword;
      return promptedPassword;
    }

    return "";
  };

  const createCustomerFromRenewalSnapshot = async (
    certificate: RenewalAgentCertificate,
    snapshot: RenewalInfoSnapshot
  ) => {
    const payload = buildCustomerCreatePayloadFromRenewalSnapshot(certificate, snapshot);
    if (
      !payload.customerName ||
      !payload.businessNumber ||
      !payload.corpName ||
      !payload.addr ||
      !payload.bizType ||
      !payload.bizClass
    ) {
      throw new Error("고객 생성에 필요한 사업자 기본값이 부족합니다.");
    }

    return await api<CustomerSaveResponse>("/api/customers", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  };

  const queuePendingCustomerCertificateSync = (customerIds: number[]) => {
    if (customerIds.length === 0) {
      return;
    }

    setPendingCertSyncCustomerIds((prev) => {
      const next = new Set(prev);
      customerIds.forEach((customerId) => next.add(customerId));
      return Array.from(next);
    });
  };

  const getCustomerCertificateRegistrationUrl = async (customerId: number) => {
    const result = await api<{ url: string }>(`/api/customers/${customerId}/popbill/cert-url`, {
      method: "POST"
    });
    return result.url;
  };

  const linkCustomerCertificate = async (
    customerId: number,
    certificate: RenewalAgentCertificate,
    options?: { linkSource?: CustomerCertificate["linkSource"]; certificatePassword?: string }
  ) => {
    return await api<CustomerCertificate>("/api/customer-certificates/link", {
      method: "POST",
      body: JSON.stringify({
        customerId,
        certificateKind: deriveCustomerCertificateKind(certificate),
        certificateName: certificate.cn || "",
        certificateUsageName: certificate.usageToName || "",
        issuerName: certificate.issuerToName || "",
        serial: certificate.serial || null,
        userDN: certificate.userDN || null,
        oid: certificate.oid || null,
        expireDate: certificate.todate || certificate.detailValidateTo || null,
        certDirPath: certificate.certDirPath || null,
        certificatePassword: options?.certificatePassword ?? "",
        isPrimary: deriveCustomerCertificateKind(certificate) === "electronic_tax",
        linkSource: options?.linkSource ?? "manual"
      })
    });
  };

  const unlinkCustomerCertificate = async (certificateId: number) => {
    await api(`/api/customer-certificates/${certificateId}`, {
      method: "DELETE"
    });
  };

  const resolveLinkedCustomerCertificateForAction = async (certificateIndex: string) => {
    const storedCertificateId = parseStoredCustomerCertificateKey(certificateIndex);
    if (storedCertificateId !== null) {
      const linkedCertificate = (data?.customerCertificates ?? []).find((entry) => entry.id === storedCertificateId) ?? null;
      if (!linkedCertificate) {
        throw new Error("저장된 공동인증서 연결 정보를 다시 찾지 못했습니다.");
      }

      let certificate = findLocalCertificateForStoredCustomerCertificate(
        linkedCertificate,
        customerRenewalAssistant?.certificates ?? []
      );
      if (!certificate) {
        const refreshedCertificates = await syncCustomerRenewalCertificates({ showAlert: false });
        certificate = findLocalCertificateForStoredCustomerCertificate(linkedCertificate, refreshedCertificates);
      }

      if (!certificate) {
        throw new Error("이 PC에서 저장된 공동인증서를 다시 찾지 못했습니다. 공동인증서 읽기를 다시 실행하세요.");
      }

      return {
        certificate,
        linkedCertificate
      };
    }

    const certificate = getLocalCustomerCertificateByIndex(certificateIndex);
    if (!certificate) {
      throw new Error("이 PC에서 선택한 공동인증서를 다시 찾지 못했습니다.");
    }

    const linkedCertificate = findStoredCustomerCertificateForLocalCertificate(certificate, data?.customerCertificates ?? []);
    if (!linkedCertificate) {
      throw new Error("먼저 이 공동인증서를 고객과 연결하세요.");
    }

    return {
      certificate,
      linkedCertificate
    };
  };

  const requestCustomerRenewalBridgeProbe = async () => {
    ensureLocalRenewalHelperActionAllowed("공동인증서 읽기");
    const response = await requestLocalRenewalBridgeProbe();
    const allCertificates = response.result.bridge.storageProbe.ok ? response.result.bridge.storageProbe.certificates : [];
    const certificates = allCertificates.filter(isElectronicTaxCertificate);
    let bridgeJob = buildLocalRenewalBridgeJob(response.result, certificates.length);
    let jobs: RenewalJob[] = [bridgeJob];
    let helperMessage = bridgeJob.error ?? bridgeJob.summary;
    let alertTitle = "공동인증서 불러오기";
    let alertTone: AppDialogTone = certificates.length > 0 ? "success" : allCertificates.length > 0 ? "warn" : "danger";
    let alertMessage =
      certificates.length > 0
        ? `전자세금용 공동인증서 ${certificates.length}건을 불러왔습니다.\n원하는 인증서에서 정보 읽기를 누르면 고객 초안을 바로 만들 수 있습니다.`
        : allCertificates.length > 0
          ? "전자세금용 공동인증서를 찾지 못했습니다.\n고객 초안 만들기에는 전자세금용 공동인증서만 표시합니다."
          : bridgeJob.error ?? "공동인증서를 불러오지 못했습니다.";

    if (certificates.length > 0) {
      const sharedPassword = await resolveCustomerRenewalPassword({ promptIfMissing: false });
      if (sharedPassword) {
        const existingBusinessNumbers = new Set(
          (data?.customers ?? [])
            .map((customer) => digitsOnly(customer.businessNumber))
            .filter(Boolean)
        );
        const createdCustomerEntries: Array<{ customer: Customer; certificate: RenewalAgentCertificate }> = [];
        const preflightJobs: RenewalJob[] = [];
        const failedDetails: string[] = [];
        const certificateRegistrationCompletedNames: string[] = [];
        const certificateRegistrationAlreadyRegisteredNames: string[] = [];
        const certificateRegistrationSkippedNames: string[] = [];
        const certificateRegistrationFailedDetails: string[] = [];
        const certificateRegistrationRefreshFailedDetails: string[] = [];
        const certificateLinkFailedDetails: string[] = [];
        let existingCount = 0;
        let missingDataCount = 0;
        let refreshedCertificateStatusCount = 0;

        for (const certificate of certificates) {
          try {
            const preflightResponse = await requestLocalRenewalPreflight({
              certificateIndex: Number(certificate.index),
              certificateCn: certificate.cn || null,
              certificatePassword: sharedPassword
            });
            const preflightJob = buildLocalRenewalPreflightJob(certificate, preflightResponse.result);
            preflightJobs.unshift(preflightJob);

            if (preflightJob.error) {
              failedDetails.push(`${certificate.cn || `인증서 #${certificate.index}`}: ${preflightJob.error}`);
              continue;
            }

            const snapshot = preflightResponse.result.bridge.preflightProbe.renewInfoSnapshot;
            if (!snapshot) {
              missingDataCount += 1;
              continue;
            }

            const businessNumber = digitsOnly(snapshot.businessNumber ?? "");
            if (!businessNumber) {
              missingDataCount += 1;
              continue;
            }

            if (existingBusinessNumbers.has(businessNumber)) {
              existingCount += 1;
              continue;
            }

            const createdCustomer = await createCustomerFromRenewalSnapshot(certificate, snapshot);
            createdCustomerEntries.push({ customer: createdCustomer, certificate });
            try {
              await linkCustomerCertificate(createdCustomer.id, certificate, { linkSource: "auto" });
            } catch (error) {
              certificateLinkFailedDetails.push(
                `${createdCustomer.customerName}: ${error instanceof Error ? error.message : "공동인증서 연결 실패"}`
              );
            }
            existingBusinessNumbers.add(digitsOnly(createdCustomer.businessNumber));
          } catch (error) {
            failedDetails.push(
              `${certificate.cn || `인증서 #${certificate.index}`}: ${error instanceof Error ? error.message : "고객 생성 실패"}`
            );
          }
        }

        const createdCustomers = createdCustomerEntries.map((entry) => entry.customer);
        const createdCount = createdCustomers.length;
        const failedCount = failedDetails.length;

        for (const entry of createdCustomerEntries) {
          const createdCustomer = entry.customer;
          if (createdCustomer.popbillState !== "joined") {
            certificateRegistrationSkippedNames.push(
              `${createdCustomer.customerName}: ${createdCustomer.popbillState === "failed" ? "팝빌 가입 실패" : "팝빌 가입 미완료"}`
            );
            continue;
          }

          try {
            const certRegistrationUrl = await getCustomerCertificateRegistrationUrl(createdCustomer.id);
            const registrationResponse = await requestLocalPopbillCertificateRegistration({
              certificateRegistrationUrl: certRegistrationUrl,
              certificateIndex: Number(entry.certificate.index),
              certificateCn: entry.certificate.cn || createdCustomer.customerName,
              certificateKind: "electronic_tax",
              serial: entry.certificate.serial || null,
              userDN: entry.certificate.userDN || null,
              certificatePassword: sharedPassword
            });
            if (registrationResponse.result.outcome === "already-registered") {
              certificateRegistrationAlreadyRegisteredNames.push(createdCustomer.customerName);
            } else {
              certificateRegistrationCompletedNames.push(createdCustomer.customerName);
            }

            try {
              await refreshSingleCustomerCertificateStatus(createdCustomer.id);
              refreshedCertificateStatusCount += 1;
            } catch (error) {
              certificateRegistrationRefreshFailedDetails.push(
                `${createdCustomer.customerName}: ${error instanceof Error ? error.message : "인증서 상태 반영 실패"}`
              );
            }
          } catch (error) {
            certificateRegistrationFailedDetails.push(
              `${createdCustomer.customerName}: ${error instanceof Error ? error.message : "팝빌 인증서 자동 등록 실패"}`
            );
          }
        }

        const summaryParts = [
          `전자세금용 공동인증서 ${certificates.length}건 처리`,
          `고객 생성 ${createdCount}건`,
          existingCount > 0 ? `기존 고객 ${existingCount}건` : null,
          missingDataCount > 0 ? `정보 부족 ${missingDataCount}건` : null,
          failedCount > 0 ? `실패 ${failedCount}건` : null,
          certificateRegistrationCompletedNames.length > 0 ? `팝빌 인증서 자동 등록 ${certificateRegistrationCompletedNames.length}건` : null,
          certificateRegistrationAlreadyRegisteredNames.length > 0
            ? `이미 등록된 인증서 ${certificateRegistrationAlreadyRegisteredNames.length}건`
            : null
        ].filter((value): value is string => Boolean(value));
        const batchSummary = summaryParts.join(" · ");

        bridgeJob = {
          ...bridgeJob,
          summary: batchSummary,
          error: failedCount > 0 && createdCount === 0 && existingCount === 0 ? failedDetails[0] ?? bridgeJob.error : null
        };
        jobs = [bridgeJob, ...preflightJobs];
        helperMessage = bridgeJob.error ?? batchSummary;
        alertTitle = "전자세금용 공동인증서 고객 생성";
        alertTone =
          failedCount > 0
            ? createdCount > 0 || existingCount > 0
              ? "warn"
              : "danger"
            : "success";

        if (createdCustomers.length > 0 || refreshedCertificateStatusCount > 0) {
          try {
            await load();
          } catch (error) {
            certificateRegistrationRefreshFailedDetails.push(
              `자동 새로고침 실패: ${error instanceof Error ? error.message : "새로고침 실패"}`
            );
          }
        }

        alertMessage = `${batchSummary}${
          failedDetails.length > 0 ? `\n\n실패 내역\n${failedDetails.slice(0, 5).join("\n")}` : ""
        }${
          certificateRegistrationCompletedNames.length > 0
            ? `\n\n팝빌 인증서 자동 등록 완료\n${certificateRegistrationCompletedNames.slice(0, 5).join("\n")}`
            : ""
        }${
          certificateRegistrationSkippedNames.length > 0
            ? `\n\n인증서 등록 건너뜀\n${certificateRegistrationSkippedNames.slice(0, 5).join("\n")}`
            : ""
        }${
          certificateRegistrationAlreadyRegisteredNames.length > 0
            ? `\n\n이미 등록된 인증서\n${certificateRegistrationAlreadyRegisteredNames.slice(0, 5).join("\n")}`
            : ""
        }${
          certificateRegistrationFailedDetails.length > 0
            ? `\n\n팝빌 인증서 자동 등록 실패\n${certificateRegistrationFailedDetails.slice(0, 5).join("\n")}\n실패한 고객은 고객관리에서 인증서 등록을 다시 시도하면 됩니다.`
            : ""
        }${
          certificateLinkFailedDetails.length > 0
            ? `\n\n공동인증서 연결 실패\n${certificateLinkFailedDetails.slice(0, 5).join("\n")}`
            : ""
        }${
          certificateRegistrationRefreshFailedDetails.length > 0
            ? `\n\n등록 후 상태 반영 실패\n${certificateRegistrationRefreshFailedDetails.slice(0, 5).join("\n")}`
            : ""
        }`;

        if (createdCustomers.length > 0 && refreshedCertificateStatusCount === 0) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  customers: [...prev.customers, ...createdCustomers],
                  counts: {
                    ...prev.counts,
                    customers: prev.counts.customers + createdCustomers.length
                  }
                }
              : prev
          );
        }
      } else {
        alertMessage = `전자세금용 공동인증서 ${certificates.length}건을 불러왔습니다.\n고객 생성이나 정보 읽기를 진행하려면 인증서별 비밀번호가 필요합니다.`;
      }
    }

    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status: {
          online: true,
          version: response.version,
          message: helperMessage
        },
        helperVersion: response.version,
        helperMessage,
        jobs,
        certificates,
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
        defaultRenewalHelperDownloadUrl
      })
    );
    await showAppAlert(alertMessage, {
      title: alertTitle,
      tone: alertTone
    });
  };

  const requestCustomerRenewalPreflight = async (certificate: RenewalAgentCertificate) => {
    ensureLocalRenewalHelperActionAllowed("고객 초안 정보 읽기");
    const inputPassword = await resolveCustomerRenewalPassword({ promptIfMissing: true });
    if (!inputPassword) {
      throw new Error("공동인증서 비밀번호 입력이 필요합니다.");
    }

    customerRenewalPasswordRef.current = inputPassword;
    const response = await requestLocalRenewalPreflight({
      certificateIndex: Number(certificate.index),
      certificateCn: certificate.cn || null,
      certificatePassword: inputPassword
    });
    const preflightJob = buildLocalRenewalPreflightJob(certificate, response.result);
    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status: {
          online: true,
          version: response.version,
          message: preflightJob.error ?? preflightJob.summary
        },
        helperVersion: response.version,
        helperMessage: preflightJob.error ?? preflightJob.summary,
        jobs: [preflightJob, ...(prev?.jobs ?? [])],
        certificates: prev?.certificates ?? [],
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
        defaultRenewalHelperDownloadUrl
      })
    );

    if (preflightJob.error) {
      customerRenewalPasswordRef.current = "";
      throw new Error(preflightJob.error);
    }

    await showAppAlert(
      `공동인증서 정보 읽기를 완료했습니다.\n${preflightJob.summary}\n완료되면 이 카드에서 고객 초안을 바로 열 수 있습니다.`,
      {
        title: "고객 초안 정보 읽기",
        tone: "success"
      }
    );
  };

  const getCustomerRenewalCertificateForCustomer = (customerId: number) => {
    const customer = (data?.customers ?? []).find((entry) => entry.id === customerId) ?? null;
    if (!customer) {
      return { customer: null, certificate: null };
    }

    const certificate = selectCustomerRenewalCertificate(
      (customerRenewalAssistant?.certificates ?? []).filter(isElectronicTaxCertificate),
      customer
    );

    return { customer, certificate };
  };

  const getLocalCustomerCertificateByIndex = (certificateIndex: string) =>
    (customerRenewalAssistant?.certificates ?? []).find(
      (certificate) => normalizeRenewalCertificateKey(certificate.index) === normalizeRenewalCertificateKey(certificateIndex)
    ) ?? null;

  const getCustomerById = (customerId: number) =>
    (data?.customers ?? []).find((entry) => entry.id === customerId) ?? null;

  const getCustomerRenewalProbeForCertificate = (certificate: RenewalAgentCertificate | null) => {
    if (!certificate) {
      return null;
    }

    return getLatestRenewalPreflightProbeForCertificate(
      certificate,
      customerRenewalAssistant?.jobs ?? [],
      null
    );
  };

  const buildCustomerRenewalSubmissionProfile = async (customer: Customer) => {
    const issuePassword = await resolveCustomerRenewalIssuePassword({ promptIfMissing: true });
    return {
      contactName: settingsForm?.operatorContactName?.trim() ?? data?.settings.operatorContactName?.trim() ?? "",
      contactDepartment: "",
      contactEmail: settingsForm?.operatorContactEmail?.trim() ?? data?.settings.operatorContactEmail?.trim() ?? "",
      contactTel: settingsForm?.operatorContactTel?.trim() ?? data?.settings.operatorContactTel?.trim() ?? "",
      contactFax: "",
      contactMobile: customer.renewalContactMobile.trim(),
      issuePassword
    };
  };

  const buildCustomerRenewalComparisonProfile = (customer: Customer) => ({
    corpName: customer.corpName,
    businessNumber: customer.businessNumber,
    ceoName: customer.ceoName,
    addr: customer.addr,
    bizType: customer.bizType,
    bizClass: customer.bizClass
  });

  const prepareCustomerRenewal = async (
    customerId: number,
    options?: { showAlert?: boolean; certificatePassword?: string; certificateOverride?: RenewalAgentCertificate | null }
  ) => {
    ensureLocalRenewalHelperActionAllowed("갱신 준비");
    const customer = getCustomerById(customerId);
    const certificate = options?.certificateOverride ?? getCustomerRenewalCertificateForCustomer(customerId).certificate;
    if (!customer || !certificate) {
      throw new Error("이 PC에서 고객과 매칭되는 공동인증서를 찾지 못했습니다.");
    }

    const linkedCertificate = findStoredCustomerCertificateForLocalCertificate(certificate, data?.customerCertificates ?? []);
    const inputPassword =
      options?.certificatePassword ??
      (await resolveCustomerRenewalPassword({
        promptIfMissing: true,
        linkedCertificateId: linkedCertificate?.id ?? null
      }));
    if (!inputPassword) {
      throw new Error("공동인증서 비밀번호 입력이 필요합니다.");
    }

    const response = await requestLocalRenewalPreparePayment({
      certificateIndex: Number(certificate.index),
      certificateCn: certificate.cn || null,
      certificatePassword: inputPassword,
      comparisonProfile: buildCustomerRenewalComparisonProfile(customer),
      submissionProfile: await buildCustomerRenewalSubmissionProfile(customer)
    });

    const preflightJob = buildLocalRenewalPreflightJob(certificate, response.result);
    const preflightProbe = response.result.bridge.preflightProbe;
    const status = formatCustomerRenewalStatus(preflightProbe);

    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status: {
          online: true,
          version: response.version,
          message: status.statusText
        },
        helperVersion: response.version,
        helperMessage: status.statusText,
        jobs: [preflightJob, ...(prev?.jobs ?? [])],
        certificates: prev?.certificates ?? [],
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
        defaultRenewalHelperDownloadUrl
      })
    );

    if (!preflightProbe.ok) {
      throw new Error(preflightProbe.error ?? preflightProbe.message ?? "갱신 준비에 실패했습니다.");
    }

    if (!isRenewalPaymentReady(preflightProbe)) {
      throw new Error(
        preflightProbe.renewInfoSubmitResultError ??
          preflightProbe.renewInfoSubmitResultSummary ??
          (preflightProbe.renewInfoSubmitReady === true
            ? "갱신 신청정보 자동 제출이 결제 단계까지 완료되지 않았습니다."
            : status.statusText)
      );
    }

    if (options?.showAlert !== false) {
      await showAppAlert(
        `${customer.customerName} 고객 갱신 준비를 완료했습니다.\n이제 \`결제하기\`를 누르면 SignGate 결제 창이 열립니다.`,
        {
          title: "갱신 준비 완료",
          tone: "success"
        }
      );
    }

    return preflightProbe;
  };

  const openCustomerRenewalPayment = async (
    customerId: number,
    options?: {
      certificatePassword?: string;
      skipReadyCheck?: boolean;
      certificateOverride?: RenewalAgentCertificate | null;
      showAlert?: boolean;
    }
  ) => {
    ensureLocalRenewalHelperActionAllowed("결제 창 열기");
    const customer = getCustomerById(customerId);
    const certificate = options?.certificateOverride ?? getCustomerRenewalCertificateForCustomer(customerId).certificate;
    if (!customer || !certificate) {
      throw new Error("이 PC에서 고객과 매칭되는 공동인증서를 찾지 못했습니다.");
    }

    const preflightProbe = getCustomerRenewalProbeForCertificate(certificate);
    if (!options?.skipReadyCheck && !isRenewalPaymentReady(preflightProbe)) {
      throw new Error("먼저 갱신 준비를 완료하세요.");
    }

    const linkedCertificate = findStoredCustomerCertificateForLocalCertificate(certificate, data?.customerCertificates ?? []);
    const inputPassword =
      options?.certificatePassword ??
      (await resolveCustomerRenewalPassword({
        promptIfMissing: true,
        linkedCertificateId: linkedCertificate?.id ?? null
      }));
    if (!inputPassword) {
      throw new Error("공동인증서 비밀번호 입력이 필요합니다.");
    }

    const response = await requestLocalRenewalOpenPayment({
      certificateIndex: Number(certificate.index),
      certificateCn: certificate.cn || null,
      certificatePassword: inputPassword,
      comparisonProfile: buildCustomerRenewalComparisonProfile(customer),
      submissionProfile: await buildCustomerRenewalSubmissionProfile(customer)
    });

    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status: {
          online: true,
          version: response.version,
          message: response.result.message
        },
        helperVersion: response.version,
        helperMessage: response.result.message,
        jobs: prev?.jobs ?? [],
        certificates: prev?.certificates ?? [],
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
        defaultRenewalHelperDownloadUrl
      })
    );

    if (options?.showAlert !== false) {
      await showAppAlert(
        `${customer.customerName} 고객의 SignGate 갱신 결제 창을 열었습니다.\n열린 창에서 결제수단을 선택하고 결제를 마무리하세요.`,
        {
          title: "결제 창 열기",
          tone: "success"
        }
      );
    }
  };

  const startCustomerRenewal = async (
    customerId: number,
    options?: { certificateOverride?: RenewalAgentCertificate | null }
  ) => {
    const customer = getCustomerById(customerId);
    const certificate = options?.certificateOverride ?? getCustomerRenewalCertificateForCustomer(customerId).certificate;
    if (!customer || !certificate) {
      throw new Error("이 PC에서 고객과 매칭되는 공동인증서를 찾지 못했습니다.");
    }

    const linkedCertificate = findStoredCustomerCertificateForLocalCertificate(certificate, data?.customerCertificates ?? []);
    const inputPassword = await resolveCustomerRenewalPassword({
      promptIfMissing: true,
      linkedCertificateId: linkedCertificate?.id ?? null
    });
    if (!inputPassword) {
      throw new Error("공동인증서 비밀번호 입력이 필요합니다.");
    }

    let preflightProbe = getCustomerRenewalProbeForCertificate(certificate);
    if (!isRenewalPaymentReady(preflightProbe)) {
      preflightProbe = await prepareCustomerRenewal(customerId, {
        showAlert: false,
        certificatePassword: inputPassword,
        certificateOverride: certificate
      });
    }

    if (!isRenewalPaymentReady(preflightProbe)) {
      const status = formatCustomerRenewalStatus(preflightProbe);
      throw new Error(status.statusText);
    }

    await openCustomerRenewalPayment(customerId, {
      certificatePassword: inputPassword,
      skipReadyCheck: true,
      certificateOverride: certificate
    });
  };

  const linkLocalCertificateToCustomer = async (certificateIndex: string, customerId: number) => {
    const certificate = getLocalCustomerCertificateByIndex(certificateIndex);
    if (!certificate) {
      throw new Error("이 PC에서 선택한 공동인증서를 다시 찾지 못했습니다.");
    }

    await linkCustomerCertificate(customerId, certificate, { linkSource: "manual" });
  };

  const prepareLinkedCustomerCertificateRenewal = async (
    certificateIndex: string,
    options?: { showAlert?: boolean }
  ) => {
    const { certificate, linkedCertificate } = await resolveLinkedCustomerCertificateForAction(certificateIndex);

    await prepareCustomerRenewal(linkedCertificate.customerId, {
      showAlert: options?.showAlert,
      certificateOverride: certificate
    });
  };

  const openLinkedCustomerCertificatePayment = async (
    certificateIndex: string,
    options?: { showAlert?: boolean }
  ) => {
    const { certificate, linkedCertificate } = await resolveLinkedCustomerCertificateForAction(certificateIndex);

    await openCustomerRenewalPayment(linkedCertificate.customerId, {
      showAlert: options?.showAlert,
      certificateOverride: certificate
    });
  };

  const openCustomerDraftFromUserCertificate = async (certificate: RenewalAgentCertificate) => {
    if (!hasActiveWorkspace) {
      throw new Error("먼저 고객을 등록할 작업공간을 선택하세요.");
    }

    const snapshot = getCustomerDraftSnapshotForCertificate(certificate, null, customerRenewalAssistant?.jobs ?? []);
    if (!snapshot) {
      throw new Error("먼저 이 인증서로 정보 읽기를 실행해 고객 기본값을 읽어오세요.");
    }

    const businessNumber = digitsOnly(snapshot.businessNumber ?? "");
    const existingCustomer =
      businessNumber === ""
        ? null
        : (data?.customers ?? []).find((customer) => digitsOnly(customer.businessNumber) === businessNumber) ?? null;

    setCustomerSearchQuery("");
    setCustomerListFilter("all");
    setCustomerDetailTab("info");
    setActiveTab("customers");
    setCustomerAddressResolveMessage("");
    customerAddressLookupRef.current = "";

    if (existingCustomer) {
      setCreatingCustomer(false);
      setCustomerForm(customerToForm(existingCustomer));
      await showAppAlert(
        `같은 사업자번호로 등록된 고객이 이미 있어서 기존 고객을 열었습니다.\n고객: ${existingCustomer.customerName}`,
        {
          title: "기존 고객 열기",
          tone: "warn"
        }
      );
      return;
    }

    setCreatingCustomer(true);
    setCustomerForm(buildCustomerDraftFromRenewalSnapshot(certificate, snapshot));
    await showAppAlert(
      "공동인증서 분석값으로 새 고객 초안을 채웠습니다.\n저장 전에 주소와 휴대폰 번호만 확인하면 됩니다.",
      {
        title: "고객 초안 준비",
        tone: "success"
      }
    );
  };

  const resetPopbillLink = async (customer: Customer) => {
    const confirmed = await showAppConfirm(
      `${customer.customerName} 고객의 팝빌 로컬 연결 상태를 초기화합니다.\n팝빌 실제 계정은 삭제되지 않고, 앱 상태만 pending/인증전으로 돌아갑니다.`,
      {
        title: "팝빌 연결 상태 초기화",
        tone: "warn",
        confirmLabel: "초기화"
      }
    );
    if (!confirmed) return;

    await api(`/api/customers/${customer.id}/popbill/reset`, {
      method: "POST"
    });
  };

  const deleteCustomer = async (customer: Customer) => {
    const confirmed = await showAppConfirm(
      `${customer.customerName} 고객을 삭제합니다.\n관련된 로컬 메일 매칭/발행초안도 같이 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`,
      {
        title: "고객 삭제",
        tone: "danger",
        confirmLabel: "삭제하기"
      }
    );
    if (!confirmed) return;

    await api(`/api/customers/${customer.id}`, {
      method: "DELETE"
    });

    setCustomerForm((prev) => (prev.id === customer.id ? createCustomerFormDefaults() : prev));
  };

  const quitPopbillMember = async (customer: Customer) => {
    const popbillEnvironmentLabel = data?.settings.popbillIsTest ? "테스트" : "운영";
    const confirmed = await showAppConfirm(
      `${customer.customerName} 고객을 팝빌 ${popbillEnvironmentLabel} 서버에서 탈퇴시킵니다.\n이 작업은 팝빌 ${popbillEnvironmentLabel} 환경의 연동회원 자체를 제거합니다.\n계속할까요?`,
      {
        title: `팝빌 ${popbillEnvironmentLabel} 회원 탈퇴`,
        tone: "danger",
        confirmLabel: "탈퇴시키기"
      }
    );
    if (!confirmed) return;

    await api(`/api/customers/${customer.id}/popbill/quit`, {
      method: "POST"
    });
  };

  const showDraftPopbillInfo = async (draftId: number) => {
    const info = await api<Record<string, unknown>>(`/api/drafts/${draftId}/popbill/info`);
    await showAppAlert(summarizePopbillInfo(info), {
      title: "팝빌 문서 정보"
    });
  };

  const openDraftPopbillUrl = async (draftId: number, type: "view-url" | "print-url") => {
    if (type === "view-url") {
      void api(`/api/drafts/${draftId}/pilot-preview-opened`, {
        method: "POST"
      }).catch((error) => {
        console.warn("draft-preview-opened 계측 기록에 실패했습니다.", error);
      });
    }

    const result = await api<{ url: string }>(`/api/drafts/${draftId}/popbill/${type}`);
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const issueAllReviewDrafts = async () => {
    const targets = data?.drafts.filter((draft) => draft.status === "review" || draft.status === "failed") ?? [];
    if (targets.length === 0) {
      await showAppAlert("직접 발행할 검수 대기/실패 건이 없습니다.", {
        title: "검수 건 직접 발행"
      });
      return;
    }

    const confirmed = await showAppConfirm(`검수 대기/실패 ${targets.length}건을 로그인 사용자가 직접 발행합니다.\n계속할까요?`, {
      title: "검수 건 직접 발행 확인",
      tone: "warn",
      confirmLabel: "직접 발행"
    });
    if (!confirmed) return;

    const result = await api<{ total: number; issued: number; failed: number }>("/api/drafts/issue-all", {
      method: "POST"
    });
    await showAppAlert(`검수 건 직접 발행 완료\n대상: ${result.total}건\n성공: ${result.issued}건\n실패: ${result.failed}건`, {
      title: "검수 건 직접 발행 완료",
      tone: "success"
    });
  };

  const refreshAllCertificateStatuses = async () => {
    const result = await api<{
      checked: number;
      updated: number;
      failed: number;
      expired: number;
      expiringSoon: number;
      notificationStatus: string;
      notificationMessage: string;
    }>("/api/popbill/cert-status/refresh-all", {
      method: "POST"
    });

    await showAppAlert(
      `인증서 일괄 점검 완료\n점검 대상: ${result.checked}건\n갱신 성공: ${result.updated}건\n조회 실패: ${result.failed}건\n만료: ${result.expired}건\n30일 이내 만료 예정: ${result.expiringSoon}건\n알림: ${formatNotificationStatus(result.notificationStatus, result.notificationMessage)}`,
      {
        title: "인증서 일괄 점검 완료",
        tone: "success"
      }
    );
  };

  const cancelIssuedDraft = async (draftId: number) => {
    const confirmed = await showAppConfirm(
      "이 발행 건을 취소하고 직접 발행 대기로 되돌립니다.\n취소 후에는 같은 건을 다시 발행할 수 있습니다.\n계속할까요?",
      {
        title: "발행 취소",
        tone: "warn",
        confirmLabel: "취소하고 되돌리기"
      }
    );
    if (!confirmed) return;

    await api(`/api/drafts/${draftId}/cancel`, {
      method: "POST"
    });
  };

  const reprocessInboxMessage = async (messageId: number) => {
    await api(`/api/inbox/${messageId}/reprocess`, {
      method: "POST"
    });
  };

  const reprocessAllUnmatchedMessages = async () => {
    const targets = data?.inbox.filter((message) => isInboxActionable(message)) ?? [];
    if (targets.length === 0) {
      await showAppAlert("재처리할 확인 메일이 없습니다.", {
        title: "메일 재처리"
      });
      return;
    }

    const confirmed = await showAppConfirm(`확인 메일 ${targets.length}건을 다시 처리합니다.\n계속할까요?`, {
      title: "메일 재처리 확인",
      tone: "warn",
      confirmLabel: "재처리"
    });
    if (!confirmed) return;

    let success = 0;
    let stillPending = 0;

    for (const message of targets) {
      const result = await api<{ status: string }>(`/api/inbox/${message.id}/reprocess`, {
        method: "POST"
      });
      if (result.status === "parsed") {
        success += 1;
      } else {
        stillPending += 1;
      }
    }

    await showAppAlert(`메일 재처리 완료\n성공: ${success}건\n확인 필요 유지: ${stillPending}건`, {
      title: "메일 재처리 완료",
      tone: "success"
    });
  };

  if (!authReady) {
    return <div className="loading-shell">{recoveryMode ? "비밀번호 재설정 링크를 확인하는 중입니다." : "로그인 상태를 확인하는 중입니다."}</div>;
  }

  if (recoveryMode) {
    return (
      <>
        <div className="auth-shell">
          <section className="auth-card">
            <div className="auth-copy">
              <span className="auth-badge">AUTO-TAX</span>
              <h1>새 비밀번호 설정</h1>
              <p>재설정 메일에서 열린 화면입니다. 새 비밀번호를 저장한 뒤 다시 로그인하세요.</p>
            </div>
            <form className="auth-form" onSubmit={(event) => void submitRecoveryPassword(event)}>
              <label>
                <span>새 비밀번호</span>
                <div className="password-field">
                  <input
                    type={revealedFields.recoveryNextPassword ? "text" : "password"}
                    value={recoveryPasswordForm.nextPassword}
                    onChange={(event) =>
                      setRecoveryPasswordForm((prev) => ({
                        ...prev,
                        nextPassword: event.target.value
                      }))
                    }
                    placeholder="8자 이상 입력"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={revealedFields.recoveryNextPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                    onClick={() => toggleRevealField("recoveryNextPassword")}
                  >
                    <RevealIcon open={Boolean(revealedFields.recoveryNextPassword)} />
                  </button>
                </div>
              </label>
              <label>
                <span>새 비밀번호 확인</span>
                <div className="password-field">
                  <input
                    type={revealedFields.recoveryConfirmPassword ? "text" : "password"}
                    value={recoveryPasswordForm.confirmPassword}
                    onChange={(event) =>
                      setRecoveryPasswordForm((prev) => ({
                        ...prev,
                        confirmPassword: event.target.value
                      }))
                    }
                    placeholder="한 번 더 입력"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={revealedFields.recoveryConfirmPassword ? "새 비밀번호 확인 숨기기" : "새 비밀번호 확인 보기"}
                    onClick={() => toggleRevealField("recoveryConfirmPassword")}
                  >
                    <RevealIcon open={Boolean(revealedFields.recoveryConfirmPassword)} />
                  </button>
                </div>
              </label>
              {error ? <div className="alert error">{error}</div> : null}
              <div className="auth-actions">
                <button type="submit" disabled={authBusy}>
                  {authBusy ? "저장 중..." : "새 비밀번호 저장"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => void returnToLoginFromRecovery()} disabled={authBusy}>
                  로그인으로 돌아가기
                </button>
              </div>
              <p className="field-hint">링크가 만료되었으면 Supabase에서 새 재설정 메일을 다시 보내세요.</p>
            </form>
          </section>
        </div>
        {appDialog ? <AppDialog dialog={appDialog} onConfirm={() => closeAppDialog(true)} onCancel={() => closeAppDialog(false)} /> : null}
      </>
    );
  }

  if (!authSession) {
    return (
      <>
        <PublicLanding
          signInAccount={signInAccount}
          setSignInAccount={setSignInAccount}
          signInPassword={signInPassword}
          setSignInPassword={setSignInPassword}
          authNotice={authNotice}
          error={error}
          authBusy={authBusy}
          onSignIn={signIn}
        />
        {appDialog ? <AppDialog dialog={appDialog} onConfirm={() => closeAppDialog(true)} onCancel={() => closeAppDialog(false)} /> : null}
      </>
    );
  }

  if (!data || !settingsForm) {
    return <div className="loading-shell">AUTO-TAX 초기 데이터를 불러오는 중입니다.</div>;
  }

  const isPlatformAdmin = data.auth.isPlatformAdmin;
  const hasActiveWorkspace = Boolean(activeOrganizationId);
  const currentMembership =
    (activeOrganizationId
      ? data.auth.organizations.find((organization) => organization.organizationId === activeOrganizationId) ?? null
      : null) ?? null;
  const activeWorkspaceName = data.auth.activeOrganizationName ?? (isPlatformAdmin ? "플랫폼 관리자" : "작업공간 없음");
  const activeRoleLabel =
    !hasActiveWorkspace && isPlatformAdmin ? "플랫폼 관리자" : getOrganizationRoleLabel(data.auth.activeOrganizationRole);
  const reviewDrafts: InvoiceDraft[] = [];
  const issuedDrafts: InvoiceDraft[] = [];
  const issuedDraftsByCustomerId = new Map<number, InvoiceDraft[]>();
  for (const draft of data.drafts) {
    if (draft.status === "review" || draft.status === "failed" || draft.status === "issuing") {
      reviewDrafts.push(draft);
    }
    if (draft.status === "issued") {
      issuedDrafts.push(draft);
      const customerDrafts = issuedDraftsByCustomerId.get(draft.customerId) ?? [];
      customerDrafts.push(draft);
      if (!issuedDraftsByCustomerId.has(draft.customerId)) {
        issuedDraftsByCustomerId.set(draft.customerId, customerDrafts);
      }
    }
  }
  const customerReadinessMap = new Map<number, ReturnType<typeof getCustomerIssueReadiness>>();
  const expiredCertCustomers: Customer[] = [];
  const expiringSoonCustomers: Customer[] = [];
  const blockedIssueCustomers: Customer[] = [];
  const readyNowCustomers: Customer[] = [];
  const popbillPendingCustomers: Customer[] = [];
  for (const customer of data.customers) {
    const readiness = getCustomerIssueReadiness(customer);
    customerReadinessMap.set(customer.id, readiness);
    const days = getDaysUntilDate(customer.popbillCertExpireDate);
    if (days !== null && days < 0) {
      expiredCertCustomers.push(customer);
    } else if (days !== null && days >= 0 && days <= 30) {
      expiringSoonCustomers.push(customer);
    }
    if (readiness.canIssueNow) {
      readyNowCustomers.push(customer);
    } else {
      blockedIssueCustomers.push(customer);
    }
    if (customer.popbillState !== "joined" || !customer.popbillCertRegistered) {
      popbillPendingCustomers.push(customer);
    }
  }
  const unmatchedMessages = data.inbox.filter((message) => {
    const status = getInboxDisplayParseStatus(message);
    return status === "unmatched" || status === "failed";
  });
  const quickRegisterMessages = data.inbox
    .filter((message) => getInboxDisplayParseStatus(message) === "unmatched" && message.parsedData?.plantAddress)
    .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());
  const duplicateMessages = data.inbox.filter((message) => getInboxDisplayParseStatus(message) === "duplicate");
  const reprocessableMessages = data.inbox.filter((message) => isInboxActionable(message));
  const billingMonthSummaryMap = new Map<string, BillingMonthSummary>();
  for (const message of data.inbox) {
    const billingMonth = message.parsedData?.billingMonth;
    if (!billingMonth) continue;
    const status = getInboxDisplayParseStatus(message);
    const existing = billingMonthSummaryMap.get(billingMonth);
    const latestReceivedAt =
      existing && existing.latestReceivedAt && new Date(existing.latestReceivedAt).getTime() >= new Date(message.receivedAt).getTime()
        ? existing.latestReceivedAt
        : message.receivedAt;
    billingMonthSummaryMap.set(billingMonth, {
      billingMonth,
      totalCount: (existing?.totalCount ?? 0) + 1,
      actionableCount:
        (existing?.actionableCount ?? 0) + (status === "unmatched" || status === "failed" || status === "duplicate" ? 1 : 0),
      latestReceivedAt,
      completed: isBillingMonthCompleted(billingMonth)
    });
  }
  for (const month of completedBillingMonths) {
    if (billingMonthSummaryMap.has(month.billingMonth)) continue;
    billingMonthSummaryMap.set(month.billingMonth, {
      billingMonth: month.billingMonth,
      totalCount: 0,
      actionableCount: 0,
      latestReceivedAt: null,
      completed: true
    });
  }
  const billingMonthSummaries = [...billingMonthSummaryMap.values()].sort((left, right) => right.billingMonth.localeCompare(left.billingMonth));
  const recentInboxMessages = [...data.inbox]
    .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime())
    .slice(0, 6);
  const recentIssuedDrafts = issuedDrafts.slice(0, 8);
  const recentInboxPreview = recentInboxMessages.slice(0, 4);
  const recentIssuedPreview = recentIssuedDrafts.slice(0, 4);
  const normalizedCustomerSearch = deferredCustomerSearchQuery.trim().toLocaleLowerCase("ko-KR");
  const filteredCustomers = data.customers
    .filter((customer) => matchesCustomerListFilter(customer, customerListFilter))
    .filter((customer) =>
      normalizedCustomerSearch === "" ||
      customer.customerName.toLocaleLowerCase("ko-KR").includes(normalizedCustomerSearch) ||
      customer.corpName.toLocaleLowerCase("ko-KR").includes(normalizedCustomerSearch) ||
      customer.businessNumber.toLocaleLowerCase("ko-KR").includes(normalizedCustomerSearch)
    )
    .sort(compareCustomersForList);
  const customerImportHeaderCandidates = customerImportFile
    ? customerImportFile.rows.slice(0, Math.min(customerImportFile.rows.length, 5)).map((row, index) => ({
        index,
        preview: row.slice(0, 4).join(" | ") || `빈 행 ${index + 1}`
      }))
    : [];
  const selectedQuickRegisterMessage = quickRegisterForm.messageId
    ? quickRegisterMessages.find((message) => message.id === quickRegisterForm.messageId) ?? null
    : null;
  const pendingOnboardingCertificateRegistrationTargets = (customerOnboardingWorkbook?.customers ?? [])
    .map((row) => digitsOnly(row.businessNumber))
    .filter((businessNumber, index, values): businessNumber is string => Boolean(businessNumber) && values.indexOf(businessNumber) === index)
    .filter((businessNumber) => onboardingElectronicTaxBusinessNumbers.has(businessNumber))
    .map((businessNumber) => data.customers.find((customer) => digitsOnly(customer.businessNumber) === businessNumber) ?? null)
    .filter(
      (customer): customer is Customer =>
        Boolean(customer && customer.popbillState === "joined" && !customer.popbillCertRegistered)
    );
  const hasRegisteredCustomers = data.customers.length > 0;
  const onboardingCustomerRegistrationReady = customerOnboardingSessionActive
    ? customerOnboardingSessionState.commitDone
    : hasRegisteredCustomers;
  const onboardingPendingCertificateCustomers = customerOnboardingSessionActive
    ? [...onboardingElectronicTaxBusinessNumbers]
        .map((businessNumber) => data.customers.find((customer) => digitsOnly(customer.businessNumber) === businessNumber) ?? null)
        .filter(
          (customer): customer is Customer =>
            Boolean(customer && (customer.popbillState !== "joined" || !customer.popbillCertRegistered))
        )
    : popbillPendingCustomers;
  const selectedCustomer = customerForm.id ? data.customers.find((customer) => customer.id === customerForm.id) ?? null : null;
  const selectedCustomerReadiness = selectedCustomer
    ? customerReadinessMap.get(selectedCustomer.id) ?? getCustomerIssueReadiness(selectedCustomer)
    : null;
  const selectedCustomerIssues = selectedCustomer ? getCustomerIssueChecklist(selectedCustomer) : [];
  const selectedCustomerIssuedDrafts = selectedCustomer
    ? [...(issuedDraftsByCustomerId.get(selectedCustomer.id) ?? [])].sort((left, right) => {
        const rightTime = right.issuedAt ? new Date(right.issuedAt).getTime() : 0;
        const leftTime = left.issuedAt ? new Date(left.issuedAt).getTime() : 0;
        return rightTime - leftTime || right.id - left.id;
      })
    : [];
  const getCachedCustomerIssueReadiness = (customer: Customer) =>
    customerReadinessMap.get(customer.id) ?? getCustomerIssueReadiness(customer);
  const customerRegistrationReady = hasRegisteredCustomers;
  const blockedCustomerCount = blockedIssueCustomers.length;
  const certAttentionCount = expiredCertCustomers.length + expiringSoonCustomers.length;
  const activeOrganizationMembership =
    data.auth.organizations.find((organization) => organization.organizationId === data.auth.activeOrganizationId) ?? null;
  const managedCustomerLimit = activeOrganizationMembership?.managedCustomerLimit ?? null;
  const managedCustomerCount = data.counts.customers;
  const hasReachedManagedCustomerLimit =
    managedCustomerLimit !== null && managedCustomerCount >= managedCustomerLimit;
  const opsAgent = opsConsole?.renewalAutomation.agent ?? null;
  const opsJobs = opsConsole?.renewalAutomation.jobs ?? [];
  const opsLogs = opsConsole?.logs ?? [];
  const opsWorkspaces = opsConsole?.workspaces ?? [];
  const customerRenewalCandidates: CustomerRenewalCandidateView[] = data.customers
    .filter((customer) => customer.popbillState === "joined" && customer.popbillCertRegistered)
    .map((customer) => {
      const certificate = selectCustomerRenewalCertificate(customerRenewalAssistantCertificates, customer);
      if (!certificate) {
        return null;
      }

      const preflightProbe = getLatestRenewalPreflightProbeForCertificate(
        certificate,
        customerRenewalAssistantJobs,
        null
      );
      const status = formatCustomerRenewalStatus(preflightProbe);

      return {
        customerId: customer.id,
        customerName: customer.customerName,
        corpName: customer.corpName,
        certificateCn: certificate.cn || customer.customerName,
        certificateExpireDate: customer.popbillCertExpireDate ?? certificate.todate,
        certificateUsage: certificate.usageToName,
        statusText: status.statusText,
        statusTone: status.statusTone,
        paymentAmount: status.paymentAmount,
        canOpenPayment: status.canOpenPayment
      } satisfies CustomerRenewalCandidateView;
    })
    .filter((candidate): candidate is CustomerRenewalCandidateView => candidate !== null)
    .sort((left, right) => {
      const leftTime = left.certificateExpireDate ? new Date(left.certificateExpireDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.certificateExpireDate ? new Date(right.certificateExpireDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || left.customerName.localeCompare(right.customerName, "ko");
    });
  const latestCustomerRenewalJob = customerRenewalAssistantJobs[0] ?? null;
  const isCreatingWorkspace = busyKey === "ops-create-workspace";
  const isSavingCustomer =
    busyKey === "save-customer" ||
    busyKey === "save-customer-top" ||
    (customerForm.id !== null && busyKey === `save-customer-${customerForm.id}`);
  const isQuickRegistering = busyKey === "quick-register-unmatched";
  const partnerTaxInvoiceUnitCost = opsConsole?.partnerPoints.taxInvoiceUnitCost ?? null;
  const opsPartnerIsTest = opsConsole?.partnerPoints.isTest ?? false;
  const workspacePopbillIsTest = currentWorkspaceSettings?.popbillIsTest ?? data.settings.popbillIsTest;
  const workspacePopbillModeLabel = workspacePopbillIsTest ? "팝빌 테스트" : "팝빌 운영";
  const opsPartnerModeLabel = opsPartnerIsTest ? "테스트 모드" : "운영 모드";
  const opsPartnerModeDescription = opsPartnerIsTest
    ? "현재 팝빌 테스트 환경으로 연결되어 있습니다. 실제 고객 운영 전에는 운영 모드 전환 여부를 다시 확인하세요."
    : "현재 팝빌 운영 환경으로 연결되어 있습니다. 실제 발행과 파트너 포인트가 운영 기준으로 반영됩니다.";
  const totalWorkspaceIssuedDraftCount = opsWorkspaces.reduce((sum, workspace) => sum + workspace.issuedDraftCount, 0);
  const totalWorkspaceCurrentMonthIssuedDraftCount = opsWorkspaces.reduce(
    (sum, workspace) => sum + workspace.currentMonthIssuedDraftCount,
    0
  );
  const totalWorkspaceEstimatedPointUsage =
    partnerTaxInvoiceUnitCost === null ? null : totalWorkspaceIssuedDraftCount * partnerTaxInvoiceUnitCost;
  const totalWorkspaceCurrentMonthEstimatedPointUsage =
    partnerTaxInvoiceUnitCost === null ? null : totalWorkspaceCurrentMonthIssuedDraftCount * partnerTaxInvoiceUnitCost;
  const opsAgentStatusMeta = opsAgent ? getRenewalAgentStatusMeta(opsAgent) : null;
  const opsCertificates = opsAgent?.bridge.storageProbe.certificates ?? [];
  const issueSetupPendingCount = popbillPendingCustomers.length;
  const onboardingIssueSetupPendingCount = onboardingPendingCertificateCustomers.length;
  const onboardingCertificateReady = onboardingCustomerRegistrationReady && onboardingIssueSetupPendingCount === 0;
  const settingsActionBar = settingsDerivedModel.actionBar;
  const settingsOnboardingModel = settingsDerivedModel.onboarding;
  const onboardingFirstSyncReady = data.inbox.length > 0 || data.drafts.length > 0;
  const exceptionHandlingReady = onboardingFirstSyncReady && unmatchedMessages.length === 0;
  const firstIssueCheckReady =
    onboardingFirstSyncReady &&
    unmatchedMessages.length === 0 &&
    (issuedDrafts.length > 0 || reviewDrafts.length === 0);
  const openSettingsSection = (section: SettingsSectionId = settingsActionBar.primarySection) => {
    setActiveSettingsSection(section);
    setActiveTab("settings");
  };
  const openCertificates = () => {
    setActiveTab("certificates");
  };
  const workPriorityCards = [
    ...(unmatchedMessages.length > 0
      ? [
          {
            key: "unmatched",
            title: "예외 메일",
            count: unmatchedMessages.length,
            description: "주소 예외를 처리해야 다음 발행이 이어집니다.",
            tone: "warn" as const,
            actionLabel: "최근 수신 보기",
            onAction: () => {
              setWorkFeedTab("inbox");
              scrollToElementById("work-recent-history");
            }
          }
        ]
      : []),
    ...(certAttentionCount > 0
      ? [
          {
            key: "cert",
            title: "인증서 주의",
            count: certAttentionCount,
            description: expiredCertCustomers.length > 0 ? "만료 고객부터 먼저 확인하세요." : "만료 전 점검이 필요합니다.",
            tone: expiredCertCustomers.length > 0 ? ("danger" as const) : ("warn" as const),
            actionLabel: "인증서에서 확인",
            onAction: () => {
              openCertificates();
            }
          }
        ]
      : []),
    ...(duplicateMessages.length > 0
      ? [
          {
            key: "duplicate",
            title: "중복 의심",
            count: duplicateMessages.length,
            description: "최근 수신에서 한 번 더 확인하세요.",
            tone: "default" as const,
            actionLabel: "최근 수신 보기",
            onAction: () => {
              setWorkFeedTab("inbox");
              scrollToElementById("work-recent-history");
            }
          }
        ]
      : [])
  ];
  const startCreatingCustomer = () => {
    setCreatingCustomer(true);
    setCustomerForm(createCustomerFormDefaults());
    setCustomerAddressResolveMessage("");
    customerAddressLookupRef.current = "";
  };
  const cancelCreatingCustomer = () => {
    setCreatingCustomer(false);
    setCustomerDetailTab("info");
    setCustomerForm(createCustomerFormDefaults());
    setCustomerAddressResolveMessage("");
    customerAddressLookupRef.current = "";
  };
  const selectCustomerForEdit = (customer: Customer) => {
    setCreatingCustomer(false);
    setCustomerDetailTab("info");
    setCustomerForm(customerToForm(customer));
    setCustomerAddressResolveMessage("");
    customerAddressLookupRef.current = "";
  };
  const joinCustomerPopbill = async (customerId: number) => {
    await api(`/api/customers/${customerId}/popbill/join`, { method: "POST" });
  };

  const getPrimaryElectronicTaxCustomerCertificate = (customerId: number) => {
    const matches = (data?.customerCertificates ?? []).filter(
      (certificate) => certificate.customerId === customerId && certificate.certificateKind === "electronic_tax"
    );
    if (matches.length === 0) {
      return null;
    }

    return matches.find((certificate) => certificate.isPrimary) ?? matches[0] ?? null;
  };

  const getOnboardingElectronicTaxCertificateRow = (customer: Customer) => {
    const businessNumber = digitsOnly(customer.businessNumber);
    const matches = (customerOnboardingWorkbook?.certificates ?? []).filter(
      (certificate) =>
        certificate.certificateKind === "electronic_tax" && digitsOnly(certificate.businessNumber) === businessNumber
    );
    if (matches.length === 0) {
      return null;
    }

    return matches.find((certificate) => certificate.isPrimary) ?? matches[0] ?? null;
  };

  const registerCustomerElectronicTaxCertificateAutomatically = async (
    customer: Customer,
    options?: {
      onboardingCertificateRow?: CustomerOnboardingWorkbookInput["certificates"][number] | null;
      reloadAfter?: boolean;
    }
  ) => {
    ensureLocalRenewalHelperActionAllowed("팝빌 인증서 등록");
    const onboardingCertificateRow = options?.onboardingCertificateRow ?? getOnboardingElectronicTaxCertificateRow(customer);
    const linkedCertificate = getPrimaryElectronicTaxCustomerCertificate(customer.id);
    const effectivePassword =
      onboardingCertificateRow?.certificatePassword.trim() ||
      (await resolveCustomerRenewalPassword({
        promptIfMissing: false,
        linkedCertificateId: linkedCertificate?.id ?? null
      }));

    if (!effectivePassword) {
      throw new Error(
        `${customer.customerName} 고객의 전자세금용 공동인증서 비밀번호가 없습니다. 엑셀의 인증서 비밀번호를 입력하거나 현재 브라우저 탭에서 공통 비밀번호를 다시 입력하세요.`
      );
    }

    const selectedLocalCertificate = await resolveSingleElectronicTaxCertificate(
      customer,
      onboardingCertificateRow,
      linkedCertificate
    );
    const certRegistrationUrl = await getCustomerCertificateRegistrationUrl(customer.id);
    const registrationResponse = await requestLocalPopbillCertificateRegistration({
      certificateRegistrationUrl: certRegistrationUrl,
      certificateIndex: Number(selectedLocalCertificate.index),
      certificateCn:
        selectedLocalCertificate?.cn.trim() ||
        onboardingCertificateRow?.certificateName.trim() ||
        linkedCertificate?.certificateName.trim() ||
        customer.corpName.trim() ||
        customer.customerName.trim(),
      certificateKind: "electronic_tax",
      serial: selectedLocalCertificate?.serial || onboardingCertificateRow?.serial || linkedCertificate?.serial || null,
      userDN: selectedLocalCertificate?.userDN || onboardingCertificateRow?.userDN || linkedCertificate?.userDN || null,
      certificatePassword: effectivePassword
    });
    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status: {
          online: true,
          version: registrationResponse.version,
          message: registrationResponse.result.message
        },
        helperVersion: registrationResponse.version,
        helperMessage: registrationResponse.result.message,
        jobs: prev?.jobs ?? [],
        certificates: prev?.certificates ?? [],
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
        defaultRenewalHelperDownloadUrl
      })
    );

    let refreshErrorMessage = "";
    try {
      await refreshSingleCustomerCertificateStatus(customer.id);
    } catch (error) {
      refreshErrorMessage = error instanceof Error ? error.message : "인증서 상태를 다시 확인하지 못했습니다.";
    }

    if (options?.reloadAfter !== false) {
      try {
        await load();
      } catch (error) {
        const reloadErrorMessage = error instanceof Error ? error.message : "화면 새로고침에 실패했습니다.";
        refreshErrorMessage = refreshErrorMessage
          ? `${refreshErrorMessage} / ${reloadErrorMessage}`
          : reloadErrorMessage;
      }
    }

    return {
      outcome: registrationResponse.result.outcome,
      refreshErrorMessage
    };
  };

  const openCustomerCertRegistration = async (customerId: number) => {
    const result = await getCustomerCertificateRegistrationUrl(customerId);
    setCustomerCertNotice("인증서 등록 창을 열었습니다. 등록 후 이 화면으로 돌아오면 상태를 자동으로 다시 확인합니다.");
    queuePendingCustomerCertificateSync([customerId]);
    window.open(result, "_blank", "noopener,noreferrer");
  };

  const proceedOnboardingCertificateRegistration = async () => {
    const pendingCustomers = [...pendingOnboardingCertificateRegistrationTargets];
    if (pendingCustomers.length === 0) {
      throw new Error("팝빌 전자세금용 인증서 등록이 필요한 고객이 없습니다.");
    }

    const { completedNames, alreadyRegisteredNames, failedDetails, refreshWarnings } =
      await processElectronicTaxOnboardingCertificateRegistrations({
        pendingCustomers,
        getOnboardingCertificateRow: getOnboardingElectronicTaxCertificateRow,
        registerCustomer: registerCustomerElectronicTaxCertificateAutomatically,
        reloadAll: load
      });

    setCustomerOnboardingNotice(
      buildElectronicTaxRegistrationFollowupNotice({
        completedNames,
        alreadyRegisteredNames,
        failedDetails,
        refreshWarnings
      })
    );
  };
  const refreshSingleCustomerCertificateStatus = async (customerId: number) => {
    await api(`/api/customers/${customerId}/popbill/cert-status`, { method: "POST" });
  };
  const canRunOnboardingFirstSync =
    settingsHealth.mailReady &&
    settingsHealth.popbillReady &&
    settingsHealth.operatorReady &&
    helperReady &&
    onboardingCertificateReady;
  const onboardingImportableCount =
    (customerOnboardingPreview?.createCount ?? 0) + (customerOnboardingPreview?.updateCount ?? 0);
  const onboardingBlockedCount = customerOnboardingPreview?.rows.filter((row) => row.status === "blocked").length ?? 0;
  const onboardingRegistrationFlow = getInitialRegistrationFlowState({
    helperReady,
    helperCertificateCount: customerRenewalAssistantAllCertificates.length,
    registrationReady: onboardingCustomerRegistrationReady,
    templateDownloaded: customerOnboardingSessionState.templateDownloaded,
    previewReady: customerOnboardingSessionState.previewReady,
    commitDone: customerOnboardingSessionState.commitDone,
    importableCount: onboardingImportableCount,
    blockedCount: onboardingBlockedCount,
    hasSelectedFile: Boolean(customerOnboardingFileName)
  });
  const onboardingRegistrationStage = onboardingRegistrationFlow.stage;
  const onboardingRegistrationPrimaryActionLabel = onboardingRegistrationFlow.primaryActionLabel;
  const onboardingRegistrationBlockedReason = onboardingRegistrationFlow.blockedReason;
  const onboardingFirstSyncBlockedSteps = settingsOnboardingModel.firstSyncBlockedSteps;
  const onboardingMailSetupContent = settingsOnboardingContent.mailContent;
  const onboardingDefaultsContent = settingsOnboardingContent.defaultsContent;
  const onboardingHelperContent = settingsOnboardingContent.helperContent;
  const onboardingCertificateAutoTargetCount = pendingOnboardingCertificateRegistrationTargets.length;
  const onboardingCertificateNeedsManualFollowUp =
    onboardingCustomerRegistrationReady && onboardingCertificateAutoTargetCount === 0 && onboardingIssueSetupPendingCount > 0;
  const onboardingCertificatePrimaryActionLabel = !onboardingCustomerRegistrationReady
    ? "먼저 고객 초기 등록 완료"
    : onboardingCertificateAutoTargetCount > 0
      ? "전자세금용 등록 마무리"
      : onboardingIssueSetupPendingCount > 0
        ? "인증서 관리 열기"
        : "첫 메일 동기화 단계 보기";
  const onboardingCertificateCompletionContent = (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy">
          <strong>
            {!onboardingCustomerRegistrationReady
              ? "먼저 고객 초기 등록을 끝내세요."
              : onboardingIssueSetupPendingCount === 0
                ? "발행용 인증서 준비가 완료되었습니다."
                : onboardingCertificateAutoTargetCount > 0
                  ? "전자세금용 인증서 후속 등록을 마무리하세요."
                  : "자동 대상은 없지만 아직 인증서 확인이 필요한 고객이 있습니다."}
          </strong>
          <p>
            {!onboardingCustomerRegistrationReady
              ? "고객 등록 후에야 실제 발행 준비 상태를 확인할 수 있습니다."
              : onboardingCertificateAutoTargetCount > 0
                ? "이번 업로드로 만든 고객은 여기서 전자세금용 인증서를 순서대로 마무리할 수 있습니다."
                : onboardingIssueSetupPendingCount > 0
                  ? "자동으로 바로 이어갈 대상은 없으므로, 이제 인증서 관리 화면에서 미연결 고객을 확인하면 됩니다."
                  : "이 단계는 끝났습니다. 다음 단계인 첫 메일 동기화로 바로 넘어가면 됩니다."}
          </p>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>자동 마무리 대상</span>
            <strong>{onboardingCertificateAutoTargetCount}건</strong>
          </div>
          <div>
            <span>발행 준비 미완료</span>
            <strong>{onboardingIssueSetupPendingCount}명</strong>
          </div>
          <div>
            <span>현재 해야 할 일</span>
            <strong>
              {!onboardingCustomerRegistrationReady
                ? "고객 초기 등록"
                : onboardingCertificateAutoTargetCount > 0
                  ? "전자세금용 등록 마무리"
                  : onboardingIssueSetupPendingCount > 0
                    ? "인증서 관리에서 확인"
                    : "첫 메일 동기화"}
            </strong>
          </div>
        </div>

        <div className="button-row onboarding-primary-row">
          <button
            type="button"
            disabled={busyKey !== null || !onboardingCustomerRegistrationReady}
            title={
              !onboardingCustomerRegistrationReady
                ? "먼저 고객 초기 등록을 끝내세요."
                : undefined
            }
            onClick={() => {
              if (onboardingCertificateAutoTargetCount > 0) {
                void runAction(
                  "customer-onboarding-cert-registration",
                  proceedOnboardingCertificateRegistration,
                  { reload: false }
                );
                return;
              }

              if (onboardingIssueSetupPendingCount > 0) {
                openCertificates();
                return;
              }

              setRequestedOnboardingStepId("first-sync");
            }}
          >
            {busyKey === "customer-onboarding-cert-registration" && onboardingCertificateAutoTargetCount > 0
              ? "전자세금용 등록 마무리 중..."
              : onboardingCertificatePrimaryActionLabel}
          </button>
        </div>
      </section>

      {onboardingIssueSetupPendingCount > 0 ? (
        <details className="settings-advanced-panel">
          <summary>{onboardingCertificateNeedsManualFollowUp ? "인증서 관리에서 확인할 고객 보기" : "수동 확인이 필요한 고객 보기"}</summary>
          <div className="ops-list">
            {onboardingPendingCertificateCustomers.slice(0, 6).map((customer) => (
              <article key={`onboarding-pending-cert-${customer.id}`} className="ops-card">
                <div className="ops-card-head">
                  <div>
                    <strong>{customer.customerName}</strong>
                    <span>{customer.corpName || customer.businessNumber}</span>
                  </div>
                  <span className="chip chip-warn">준비 필요</span>
                </div>
                <div className="ops-card-meta">
                  <span>{customer.popbillState !== "joined" ? "팝빌 가입 필요" : "전자세금용 인증서 등록 필요"}</span>
                </div>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      <details className="settings-advanced-panel">
        <summary>인증서 관리 화면은 필요할 때만 열기</summary>
        <div className="button-row">
          <button type="button" className="btn-secondary" onClick={openCertificates}>
            인증서 관리 열기
          </button>
        </div>
      </details>
    </div>
  );
  const onboardingFirstSyncContent = (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy">
          <strong>{canRunOnboardingFirstSync ? "이제 실제 메일을 처음 읽어올 차례입니다." : "아직 시작할 수 없습니다."}</strong>
          <p>
            {canRunOnboardingFirstSync
              ? "메일 연결 테스트와 실제 메일 읽기는 분리되어 있습니다. 지금 동기화를 실행하면 자동 매칭이 시작되고, 남은 예외만 다음 단계에서 처리합니다."
              : "준비가 덜 된 상태에서는 동기화 버튼보다 먼저 막힌 단계를 끝내야 합니다."}
          </p>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>등록 고객</span>
            <strong>{data.customers.length}명</strong>
          </div>
          <div>
            <span>인증서 준비</span>
            <strong>{issueSetupPendingCount === 0 ? "완료" : `${issueSetupPendingCount}명 미완료`}</strong>
          </div>
          <div>
            <span>현재 초안</span>
            <strong>{reviewDrafts.length}건</strong>
          </div>
        </div>

        {!canRunOnboardingFirstSync ? (
          <p className="onboarding-inline-warning">{`먼저 끝낼 단계: ${onboardingFirstSyncBlockedSteps.join(" → ")}`}</p>
        ) : null}

        {canRunOnboardingFirstSync ? (
          <div className="button-row onboarding-primary-row">
            <button type="button" disabled={busyKey !== null} onClick={() => void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })))}>
              {busyKey === "sync" ? "동기화 중..." : "첫 메일 동기화 실행"}
            </button>
          </div>
        ) : null}
      </section>

      <details className="settings-advanced-panel">
        <summary>오늘 작업 화면은 필요할 때만 열기</summary>
        <div className="button-row">
          <button type="button" className="btn-secondary" onClick={() => setActiveTab("home")}>
            오늘 작업 열기
          </button>
        </div>
      </details>
    </div>
  );
  const onboardingFirstIssueCheckContent = (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy">
          <strong>
            {!onboardingFirstSyncReady
              ? "먼저 첫 메일 동기화를 실행하세요."
              : unmatchedMessages.length > 0
                ? "예외 메일을 먼저 처리하세요."
                : reviewDrafts.length > 0
                  ? "생성된 초안을 검토한 뒤 로그인 사용자가 직접 발행하세요."
                  : issuedDrafts.length > 0
                    ? "첫 발행 결과까지 확인했습니다."
                    : "현재 발행 대상 메일은 없습니다."}
          </strong>
          <p>상세 확인은 `오늘 작업` 탭에서 진행합니다. 이 단계에서는 마지막으로 열어야 할 화면만 분명하게 보여줍니다.</p>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>검토할 초안</span>
            <strong>{reviewDrafts.length}건</strong>
          </div>
          <div>
            <span>발행 완료</span>
            <strong>{issuedDrafts.length}건</strong>
          </div>
          <div>
            <span>예외 메일</span>
            <strong>{unmatchedMessages.length}건</strong>
          </div>
        </div>

        <div className="button-row onboarding-primary-row">
          <button type="button" onClick={() => setActiveTab("home")}>
            오늘 작업 열기
          </button>
        </div>
      </section>
    </div>
  );
  const onboardingSteps: OnboardingStep[] = [
    {
      id: "mail",
      step: 1,
      title: "메일 연결",
      summary: settingsHealth.mailReady ? "연결됨" : "입력 필요",
      primaryActionLabel: settingsHealth.mailReady ? "메일 연결 테스트 완료" : "메일 연결 테스트",
      done: settingsHealth.mailReady,
      content: onboardingMailSetupContent
    },
    {
      id: "defaults",
      step: 2,
      title: "발행 기본값 입력",
      summary:
        settingsHealth.popbillReady && settingsHealth.operatorReady
          ? "완료"
          : "입력 필요",
      primaryActionLabel: settingsHealth.popbillReady && settingsHealth.operatorReady ? "필수 입력 완료" : "필수값 입력",
      done: settingsHealth.popbillReady && settingsHealth.operatorReady,
      content: onboardingDefaultsContent
    },
    {
      id: "helper",
      step: 3,
      title: "로컬 헬퍼 준비",
      summary: helperReady ? `전자세금용 인증서 ${customerRenewalAssistantElectronicTaxCertificateCount}건` : "확인 필요",
      primaryActionLabel: helperReady ? "전자세금용 공동인증서 읽기 완료" : "전자세금용 공동인증서 읽기",
      blockedReason: helperUpgradeRequired
        ? helperActionBlockedReason
        : customerRenewalAssistant?.agentOnline
          ? undefined
          : "헬퍼 실행 후 다시 확인하세요.",
      done: helperReady,
      content: onboardingHelperContent
    },
    {
      id: "registration",
      step: 4,
      title: "고객 초기 등록",
      summary: onboardingCustomerRegistrationReady
        ? `등록 ${data.customers.length}명`
        : onboardingRegistrationStage === "download"
          ? "양식 받기"
          : onboardingRegistrationStage === "commit"
            ? `반영 ${onboardingImportableCount}건`
            : onboardingRegistrationFlow.needsUploadRetry
              ? "재업로드"
              : "양식 업로드",
      primaryActionLabel: onboardingCustomerRegistrationReady ? "고객 초기 등록 완료" : onboardingRegistrationPrimaryActionLabel,
      blockedReason: onboardingRegistrationBlockedReason,
      done: onboardingCustomerRegistrationReady,
      content: (
        <InitialRegistrationTab
          mode="registration"
          busyKey={busyKey}
          customerOnboardingFileName={customerOnboardingFileName}
          customerOnboardingPreview={customerOnboardingPreview}
          customerOnboardingNotice={customerOnboardingNotice}
          customerOnboardingError={customerOnboardingError}
          pendingOnboardingCertificateRegistrationCount={pendingOnboardingCertificateRegistrationTargets.length}
          quickRegisterMessages={quickRegisterMessages}
          quickRegisterForm={quickRegisterForm}
          selectedQuickRegisterMessage={selectedQuickRegisterMessage}
          isQuickRegistering={isQuickRegistering}
          quickRegisterNotice={quickRegisterNotice}
          quickRegisterError={quickRegisterError}
          billingMonthSummaries={billingMonthSummaries}
          completedBillingNotice={completedBillingNotice}
          helperReady={helperReady}
          helperCertificateCount={customerRenewalAssistantElectronicTaxCertificateCount}
          registrationReady={onboardingCustomerRegistrationReady}
          registrationStage={onboardingRegistrationStage}
          registrationBlockedReason={onboardingRegistrationBlockedReason}
          registrationTemplateDownloaded={customerOnboardingSessionState.templateDownloaded}
          registrationPreviewReady={customerOnboardingSessionState.previewReady}
          registrationCommitDone={customerOnboardingSessionState.commitDone}
          showBillingMonthCompletion={false}
          downloadCustomerOnboardingTemplate={downloadCustomerOnboardingImportTemplate}
          handleCustomerOnboardingFileChange={handleCustomerOnboardingFileChange}
          commitCustomerOnboardingWorkbook={commitCustomerOnboardingWorkbook}
          setQuickRegisterForm={setQuickRegisterForm}
          selectQuickRegisterMessage={selectQuickRegisterMessage}
          submitQuickRegister={submitQuickRegister}
          markBillingMonthCompleted={markBillingMonthCompleted}
          runAction={runAction}
          formatDateTime={formatDateTime}
          getInboxDisplayParseStatus={getInboxDisplayParseStatus}
          getParseStatusLabel={getParseStatusLabel}
        />
      )
    },
    {
      id: "certificates",
      step: 5,
      title: "인증서 연결 마무리",
      summary: !onboardingCustomerRegistrationReady
        ? "고객 등록 후 진행"
        : onboardingIssueSetupPendingCount === 0
          ? "발행용 인증서 준비 완료"
          : onboardingCertificateAutoTargetCount > 0
            ? `전자세금용 후속 등록 ${onboardingCertificateAutoTargetCount}건 남음`
            : `인증서 관리에서 수동 확인 ${onboardingIssueSetupPendingCount}명`,
      primaryActionLabel: onboardingCertificateReady ? "전자세금용 등록 마무리 완료" : onboardingCertificatePrimaryActionLabel,
      blockedReason: !onboardingCustomerRegistrationReady ? "먼저 고객 초기 등록을 끝내세요." : undefined,
      done: onboardingCertificateReady,
      content: onboardingCertificateCompletionContent
    },
    {
      id: "first-sync",
      step: 6,
      title: "첫 메일 동기화",
      summary: !onboardingCertificateReady
        ? "이전 단계 완료 후 실행"
        : onboardingFirstSyncReady
          ? "첫 메일 동기화 완료"
          : "고객/인증서 준비 뒤 첫 동기화 필요",
      primaryActionLabel: onboardingFirstSyncReady ? "첫 메일 동기화 완료" : "첫 메일 동기화 실행",
      blockedReason: canRunOnboardingFirstSync ? undefined : `먼저 ${onboardingFirstSyncBlockedSteps.join(" → ")} 단계를 끝내세요.`,
      done: onboardingFirstSyncReady,
      content: onboardingFirstSyncContent
    },
    {
      id: "exceptions",
      step: 7,
      title: "미매칭 메일 예외 처리",
      summary: !onboardingFirstSyncReady
        ? "첫 동기화 후 확인"
        : unmatchedMessages.length > 0
          ? `예외 메일 ${unmatchedMessages.length}건 처리 필요`
          : "예외 메일 없음",
      primaryActionLabel: !onboardingFirstSyncReady ? "첫 메일 동기화 후 예외 확인" : unmatchedMessages.length > 0 ? "예외 고객 등록 후 메일 연결" : "지금 처리할 예외 없음",
      blockedReason: !onboardingFirstSyncReady
        ? "먼저 첫 메일 동기화를 실행하세요."
        : unmatchedMessages.length === 0
          ? "지금 처리할 예외 메일이 없습니다."
          : undefined,
      tone: onboardingFirstSyncReady && unmatchedMessages.length === 0 ? "muted" : "default",
      done: exceptionHandlingReady,
      content: (
        <InitialRegistrationTab
          mode="exceptions"
          busyKey={busyKey}
          customerOnboardingFileName={customerOnboardingFileName}
          customerOnboardingPreview={customerOnboardingPreview}
          customerOnboardingNotice={customerOnboardingNotice}
          customerOnboardingError={customerOnboardingError}
          pendingOnboardingCertificateRegistrationCount={pendingOnboardingCertificateRegistrationTargets.length}
          quickRegisterMessages={quickRegisterMessages}
          quickRegisterForm={quickRegisterForm}
          selectedQuickRegisterMessage={selectedQuickRegisterMessage}
          isQuickRegistering={isQuickRegistering}
          quickRegisterNotice={quickRegisterNotice}
          quickRegisterError={quickRegisterError}
          billingMonthSummaries={billingMonthSummaries}
          completedBillingNotice={completedBillingNotice}
          helperReady={helperReady}
          helperCertificateCount={customerRenewalAssistantElectronicTaxCertificateCount}
          registrationTemplateDownloaded={customerOnboardingSessionState.templateDownloaded}
          registrationPreviewReady={customerOnboardingSessionState.previewReady}
          registrationCommitDone={customerOnboardingSessionState.commitDone}
          showBillingMonthCompletion
          downloadCustomerOnboardingTemplate={downloadCustomerOnboardingImportTemplate}
          handleCustomerOnboardingFileChange={handleCustomerOnboardingFileChange}
          commitCustomerOnboardingWorkbook={commitCustomerOnboardingWorkbook}
          setQuickRegisterForm={setQuickRegisterForm}
          selectQuickRegisterMessage={selectQuickRegisterMessage}
          submitQuickRegister={submitQuickRegister}
          markBillingMonthCompleted={markBillingMonthCompleted}
          runAction={runAction}
          formatDateTime={formatDateTime}
          getInboxDisplayParseStatus={getInboxDisplayParseStatus}
          getParseStatusLabel={getParseStatusLabel}
        />
      )
    },
    {
      id: "first-issue",
      step: 8,
      title: "첫 발행 확인",
      summary: !onboardingFirstSyncReady
        ? "첫 동기화 후 확인"
        : unmatchedMessages.length > 0
          ? "예외 처리 후 초안 확인"
        : reviewDrafts.length > 0
          ? `검토할 초안 ${reviewDrafts.length}건`
          : issuedDrafts.length > 0
            ? `발행 확인 ${issuedDrafts.length}건`
            : "발행 대상 없음",
      primaryActionLabel: "오늘 작업 열기",
      blockedReason: !onboardingFirstSyncReady
        ? "먼저 첫 메일 동기화를 실행하세요."
        : unmatchedMessages.length > 0
          ? "먼저 예외 메일을 처리하세요."
          : undefined,
      done: firstIssueCheckReady,
      content: onboardingFirstIssueCheckContent
    }
  ];
  const onboardingSetupStepIds = new Set([
    "mail",
    "defaults",
    "helper",
    "registration",
    ...(customerOnboardingSessionActive ? (["certificate"] as const) : [])
  ]);
  const onboardingSetupSteps = onboardingSteps.filter((step) => onboardingSetupStepIds.has(step.id));
  const onboardingCompletionStepIds = new Set([
    "mail",
    "defaults",
    "registration",
    ...(customerOnboardingSessionActive ? (["certificate"] as const) : [])
  ]);
  const onboardingCompletionSteps = onboardingSteps.filter((step) => onboardingCompletionStepIds.has(step.id));
  const onboardingSetupCompletedCount = onboardingCompletionSteps.filter((step) => step.done).length;
  const onboardingPendingStepCount = onboardingCompletionSteps.filter((step) => !step.done).length;
  const onboardingComplete = onboardingPendingStepCount === 0;
  tabRoutingStateRef.current = { hasActiveWorkspace, onboardingComplete, isPlatformAdmin };
  const firstPendingOnboardingStep =
    onboardingCompletionSteps.find((step) => !step.done) ?? onboardingCompletionSteps[0] ?? null;
  const onboardingHeroTaskLine = firstPendingOnboardingStep
    ? `지금 할 일 · ${firstPendingOnboardingStep.title}`
    : "준비 완료 · 홈과 고객을 바로 사용할 수 있습니다.";
  const onboardingHeroFocusLabel = onboardingPendingStepCount > 0 ? "현재 단계" : "준비 상태";
  const onboardingHeroFocusTitle = firstPendingOnboardingStep
    ? `0${firstPendingOnboardingStep.step} · ${firstPendingOnboardingStep.title}`
    : "홈 / 고객 사용 가능";
  const onboardingHeroFocusSummary =
    firstPendingOnboardingStep?.summary ?? "도입 준비가 끝나 홈과 고객 화면을 바로 사용할 수 있습니다.";
  const onboardingHeroProgressText =
    onboardingPendingStepCount === 0
      ? `${onboardingSetupCompletedCount}/${onboardingSetupSteps.length} 완료`
      : `${onboardingSetupCompletedCount}/${onboardingSetupSteps.length} 완료 · 남음 ${onboardingPendingStepCount}`;
  const openOnboardingStep = (stepId?: string | null) => {
    setRequestedOnboardingStepId(stepId ?? null);
    setActiveTab("onboarding");
  };
  const reopenOnboarding = () => {
    openOnboardingStep(firstPendingOnboardingStep?.id ?? onboardingCompletionSteps[0]?.id ?? null);
  };
  const showOnboardingNavItem = hasActiveWorkspace && (!onboardingComplete || showCompletedOnboardingNav);
  const navItems: Array<{ id: TabId; label: string; icon: string }> = [
    ...(hasActiveWorkspace
      ? [
          { id: "home" as const, label: "홈", icon: "dashboard" },
          { id: "customers" as const, label: "고객", icon: "group" },
          { id: "certificates" as const, label: "인증서", icon: "settings" },
          { id: "settings" as const, label: "설정", icon: "settings" },
          ...(showOnboardingNavItem ? [{ id: "onboarding" as const, label: "도입 준비", icon: "dashboard" }] : [])
        ]
      : []),
    ...(isPlatformAdmin ? [{ id: "ops" as const, label: "관리자", icon: "ops" }] : [])
  ];
  const secondaryNavItemIds = new Set<TabId>(["settings", "onboarding", "ops"]);
  const primaryNavItems = navItems.filter((item) => !secondaryNavItemIds.has(item.id));
  const secondaryNavItems = navItems.filter((item) => secondaryNavItemIds.has(item.id));
  const handleNavSelect = (nextTab: TabId) => {
    setActiveTab(nextTab);
    if (nextTab === "onboarding") {
      setRequestedOnboardingStepId(null);
    }
    if (nextTab === "settings") {
      openSettingsSection(settingsActionBar.primarySection);
    }
  };

  const workPriorityEmptyState =
    workPriorityCards.length > 0
      ? null
      : !onboardingFirstSyncReady
        ? {
            title: "지금 막힌 항목은 없지만, 아직 메일 동기화를 시작하지 않았습니다.",
            body: "메일을 처음 읽어오면 초안과 예외 메일이 이 화면에 바로 쌓입니다."
          }
        : {
            title: "지금 멈춘 항목이 없습니다.",
            body: "오늘은 아래의 검토할 초안과 최근 들어온 메일만 확인하면 됩니다."
          };
  const workRoutineCards: Array<{
    key: string;
    title: string;
    count: number;
    description: string;
    tone: "success" | "warn" | "default";
    actionLabel: string;
    onAction: () => void;
  }> = [
    {
      key: "drafts",
      title: "검수 후 직접 발행",
      count: reviewDrafts.length,
      description:
        reviewDrafts.length > 0
          ? "초안을 확인하고 로그인 사용자가 직접 발행하거나 오류를 다시 확인합니다."
          : onboardingFirstSyncReady
            ? "지금 검토할 초안이 없습니다."
            : "메일 동기화를 시작하면 초안이 생성됩니다.",
      tone: reviewDrafts.length > 0 ? "warn" : onboardingFirstSyncReady ? "success" : "default",
      actionLabel: reviewDrafts.length > 0 ? "초안 확인하기" : onboardingFirstSyncReady ? "최근 발행 보기" : "메일 동기화",
      onAction:
        reviewDrafts.length > 0
          ? () => scrollToElementById("work-review-queue")
          : onboardingFirstSyncReady
            ? () => {
                setWorkFeedTab("issued");
                scrollToElementById("work-recent-history");
              }
            : () => {
                void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })));
              }
    },
    {
      key: "customers",
      title: "고객별 발행 준비",
      count: blockedCustomerCount,
      description:
        blockedCustomerCount > 0
          ? "발행이 막힌 고객부터 이유를 확인하고 바로 해결합니다."
          : readyNowCustomers.length > 0
            ? "지금 발행 가능한 고객이 준비되어 있습니다."
            : customerRegistrationReady
              ? "아직 발행 가능한 고객이 없습니다."
              : "고객 등록을 마치면 고객별 준비 상태가 보입니다.",
      tone: blockedCustomerCount > 0 ? "warn" : readyNowCustomers.length > 0 ? "success" : "default",
      actionLabel:
        blockedCustomerCount > 0
          ? "막힌 고객 보기"
          : readyNowCustomers.length > 0
            ? "발행 가능한 고객 보기"
            : customerRegistrationReady
              ? "고객 전체 보기"
              : "첫 고객 등록 보기",
      onAction: () => {
        setActiveTab("customers");
        setCustomerListFilter(
          blockedCustomerCount > 0 ? "blocked" : readyNowCustomers.length > 0 ? "ready" : customerRegistrationReady ? "all" : "all"
        );
        if (!customerRegistrationReady) {
          startCreatingCustomer();
        }
      }
    },
    {
      key: "sync",
      title: onboardingFirstSyncReady ? "최근 수신 점검" : "첫 메일 동기화",
      count: onboardingFirstSyncReady ? recentInboxPreview.length : data.inbox.length + data.drafts.length,
      description: onboardingFirstSyncReady
        ? recentInboxPreview.length > 0
          ? "방금 들어온 메일과 예외 여부를 빠르게 확인합니다."
          : "최근 들어온 메일이 없어도 첫 동기화는 끝난 상태입니다."
        : "메일 연결 테스트와 별개로, 실제 자동 매칭은 여기서 처음 시작합니다.",
      tone: onboardingFirstSyncReady ? (recentInboxPreview.length > 0 ? "warn" : "success") : "warn",
      actionLabel: onboardingFirstSyncReady ? "최근 들어온 것 보기" : "동기화 단계 열기",
      onAction: onboardingFirstSyncReady
        ? () => {
            setWorkFeedTab("inbox");
            scrollToElementById("work-recent-history");
          }
        : () => openOnboardingStep("first-sync")
    }
  ];
  const recentInboxEmptyMessage = !onboardingFirstSyncReady
    ? "아직 메일을 처음 읽어오지 않았습니다. 상단의 메일 동기화 버튼을 누르면 최근 수신이 여기에 표시됩니다."
    : "최근 들어온 메일이 없습니다. 문제가 없어서 비어 있는 상태입니다.";
  const recentIssuedEmptyMessage =
    issuedDrafts.length > 0
      ? "최근 발행 완료 이력이 없습니다."
      : !onboardingFirstSyncReady
        ? "아직 발행 결과가 없습니다. 메일 동기화와 초안 확인을 마치면 여기에 쌓입니다."
        : "아직 발행 완료 이력이 없습니다.";
  const certificateUnlinkedCount = certificatesScreenModel.metrics.unlinkedCount;
  const certificatePaymentReadyCount = certificatesScreenModel.metrics.paymentReadyCount;
  const certificateActionNeededCount = certificatesScreenModel.metrics.actionNeededCount;
  const homePrimaryActionLabel =
    reviewDrafts.length > 0
      ? `초안 ${reviewDrafts.length}건 확인`
      : unmatchedMessages.length > 0
        ? "예외 메일 확인"
        : onboardingFirstSyncReady
          ? "최근 결과 보기"
          : "메일 동기화";
  const homePrimaryAction =
    reviewDrafts.length > 0
      ? () => scrollToElementById("work-review-queue")
      : unmatchedMessages.length > 0
        ? () => {
            setWorkFeedTab("inbox");
            scrollToElementById("work-recent-history");
          }
        : onboardingFirstSyncReady
          ? () => {
              setWorkFeedTab("issued");
              scrollToElementById("work-recent-history");
            }
          : () => {
              void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })));
            };
  const screenActionBar = {
    onboarding: {
      title: "도입 준비",
      primaryActionLabel:
        firstPendingOnboardingStep?.id === "mail"
          ? "메일 연결 열기"
          : firstPendingOnboardingStep?.id === "defaults"
            ? "발행 설정 열기"
            : firstPendingOnboardingStep?.id === "helper"
              ? "헬퍼 상태 열기"
              : firstPendingOnboardingStep?.primaryActionLabel ?? "도입 준비 보기",
      onPrimaryAction: () => {
        if (firstPendingOnboardingStep?.id === "mail") {
          openSettingsSection("gmail");
          return;
        }
        if (firstPendingOnboardingStep?.id === "defaults") {
          openSettingsSection("popbill");
          return;
        }
        if (firstPendingOnboardingStep?.id === "helper") {
          openSettingsSection("helper");
          return;
        }
        openOnboardingStep(firstPendingOnboardingStep?.id);
      },
      chips: []
    },
    home: {
      title:
        reviewDrafts.length > 0
          ? "초안 검토부터 시작"
          : blockedCustomerCount > 0
            ? "막힘 먼저 해결"
            : onboardingFirstSyncReady
              ? "오늘 흐름 정상"
              : "운영 시작 준비",
      primaryActionLabel: homePrimaryActionLabel,
      onPrimaryAction: homePrimaryAction,
      chips: [
        { label: "오늘 할 일", value: `${reviewDrafts.length + unmatchedMessages.length}건`, tone: reviewDrafts.length + unmatchedMessages.length > 0 ? "warn" : "success" },
        { label: "막힘", value: `${workPriorityCards.length}건`, tone: workPriorityCards.length > 0 ? "danger" : "success" },
        { label: "고객", value: `${data.customers.length}명`, tone: data.customers.length > 0 ? "default" : "warn" },
        { label: "최근 결과", value: `${recentIssuedPreview.length}건`, tone: recentIssuedPreview.length > 0 ? "default" : "success" }
      ]
    },
    customers: {
      title: data.customers.length === 0 ? "고객 데이터 콘솔 준비" : "고객 데이터 콘솔",
      primaryActionLabel: "새 고객",
      onPrimaryAction: startCreatingCustomer,
      chips: [
        { label: "전체", value: `${data.customers.length}명`, tone: data.customers.length > 0 ? "default" : "warn" },
        { label: "조치 필요", value: `${blockedCustomerCount}명`, tone: blockedCustomerCount > 0 ? "danger" : "success" },
        { label: "발행 가능", value: `${readyNowCustomers.length}명`, tone: readyNowCustomers.length > 0 ? "success" : "default" },
        { label: "연결 필요", value: `${popbillPendingCustomers.length}명`, tone: popbillPendingCustomers.length > 0 ? "warn" : "success" }
      ]
    },
    certificates: {
      title: certificateActionNeededCount > 0 ? "인증서 조치 필요" : "인증서 상태 확인",
      primaryActionLabel: helperReady ? "인증서 불러오기" : "헬퍼 상태 확인",
      onPrimaryAction: () => {
        if (helperReady) {
          void runAction("customer-renewal-bridge-probe", loadCustomerRenewalCertificates, { reload: false });
          return;
        }

        void settingsScreenState.runRefreshCustomerRenewalAssistant();
      },
      chips: [
        {
          label: "읽은 인증서",
          value: `${certificatesScreenModel.metrics.loadedCertificateCount}건`,
          tone: certificatesScreenModel.metrics.loadedCertificateCount > 0 ? "default" : "warn"
        },
        { label: "조치 필요", value: `${certificateActionNeededCount}건`, tone: certificateActionNeededCount > 0 ? "warn" : "success" },
        { label: "미연결", value: `${certificateUnlinkedCount}건`, tone: certificateUnlinkedCount > 0 ? "warn" : "success" },
        { label: "결제 가능", value: `${certificatePaymentReadyCount}건`, tone: certificatePaymentReadyCount > 0 ? "success" : "default" }
      ]
    },
    settings: {
      title: settingsActionBar.title,
      primaryActionLabel: settingsActionBar.primaryActionLabel,
      onPrimaryAction: () => setActiveSettingsSection(settingsActionBar.primarySection),
      chips: settingsActionBar.chips
    },
    ops: {
      title: "플랫폼 운영 상태",
      primaryActionLabel: "새 작업공간",
      onPrimaryAction: () => scrollToElementById("ops-workspace-create"),
      chips: [
        { label: "작업공간", value: `${opsWorkspaces.length}개`, tone: opsWorkspaces.length > 0 ? "default" : "warn" },
        { label: "운영 로그", value: `${opsLogs.length}건`, tone: opsLogs.some((log) => log.level === "error") ? "danger" : "default" },
        { label: "진단 작업", value: `${opsJobs.length}건`, tone: opsJobs.some((job) => job.status === "failed") ? "warn" : "success" },
        { label: "파트너 포인트", value: opsConsole?.partnerPoints.partnerRemainPoint !== null && opsConsole?.partnerPoints.partnerRemainPoint !== undefined ? `${formatMoney(opsConsole.partnerPoints.partnerRemainPoint)}P` : "-", tone: "default" }
      ]
    }
  } satisfies Record<
    TabId,
    {
      title: string;
      primaryActionLabel: string;
      onPrimaryAction: () => void;
      chips: Array<{ label: string; value: string; tone: "default" | "warn" | "danger" | "success" }>;
    }
  >;
  const visibleActiveTab = resolveWorkspaceTab(activeTab, {
    hasActiveWorkspace,
    onboardingComplete,
    isPlatformAdmin
  });
  const activeScreenBar = screenActionBar[visibleActiveTab];
  const activeNavLabel = navItems.find((item) => item.id === visibleActiveTab)?.label ?? "AUTO-TAX";
  const showHomeSyncButton = false;
  const showScreenPrimaryAction = visibleActiveTab === "ops" || visibleActiveTab === "certificates";
  const showActionBarActions = showHomeSyncButton || showScreenPrimaryAction;
  const workspaceBadgeText = (activeWorkspaceName || "AUTO-TAX").replace(/\s+/g, "").slice(0, 2).toUpperCase() || "AT";
  const sidebarToggleLabel = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 숨기기";

  return (
    <>
      <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
        <div className={sidebarCollapsed ? "sidebar-shell is-collapsed" : "sidebar-shell"}>
          <aside className={sidebarCollapsed ? "sidebar is-collapsed" : "sidebar"}>
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                AT
              </span>
              <div className="brand-copy">
                <span className="brand-kicker">Operations</span>
                <h1>AUTO-TAX</h1>
              </div>
            </div>

            <div className="sidebar-body">
              <div className="sidebar-nav-stack">
                {primaryNavItems.length > 0 ? (
                  <div className="sidebar-nav-cluster">
                    {!sidebarCollapsed ? <span className="sidebar-nav-caption">주 메뉴</span> : null}
                    <nav className="nav-list sidebar-nav-group" aria-label="주 메뉴">
                      {primaryNavItems.map((item) => (
                        <button
                          key={item.id}
                          aria-label={item.label}
                          title={sidebarCollapsed ? item.label : undefined}
                          className={visibleActiveTab === item.id ? "nav-button active" : "nav-button"}
                          onClick={() => handleNavSelect(item.id)}
                        >
                          <Icon name={item.icon} className="nav-icon" />
                          <div className="nav-copy">
                            <span className="nav-title">{item.label}</span>
                          </div>
                        </button>
                      ))}
                    </nav>
                  </div>
                ) : null}

                <div className="sidebar-support-stack">
                  {secondaryNavItems.length > 0 ? (
                    <div className="sidebar-nav-cluster sidebar-nav-cluster-secondary">
                      {!sidebarCollapsed ? <span className="sidebar-nav-caption">보조 메뉴</span> : null}
                      <nav className="nav-list sidebar-nav-group sidebar-nav-group-secondary" aria-label="보조 메뉴">
                        {secondaryNavItems.map((item) => (
                          <button
                            key={item.id}
                            aria-label={item.label}
                            title={sidebarCollapsed ? item.label : undefined}
                            className={visibleActiveTab === item.id ? "nav-button active" : "nav-button"}
                            onClick={() => handleNavSelect(item.id)}
                          >
                            <Icon name={item.icon} className="nav-icon" />
                            <div className="nav-copy">
                              <span className="nav-title">{item.label}</span>
                            </div>
                          </button>
                        ))}
                      </nav>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="sidebar-meta">
                <div className="sidebar-meta-head">
                  <span className="sidebar-meta-badge" aria-hidden="true">
                    {workspaceBadgeText}
                  </span>
                  <div className="sidebar-meta-copy">
                    <span className="sidebar-meta-label">{hasActiveWorkspace ? "작업공간" : "플랫폼"}</span>
                    {hasActiveWorkspace && data.auth.organizations.length > 1 ? (
                      <select
                        className="workspace-select"
                        value={data.auth.activeOrganizationId ?? ""}
                        onChange={(event) => void changeOrganization(event.target.value)}
                        disabled={busyKey !== null}
                      >
                        {data.auth.organizations.map((organization) => (
                          <option key={organization.organizationId} value={organization.organizationId}>
                            {organization.organizationName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong>{activeWorkspaceName}</strong>
                    )}
                  </div>
                </div>
                <div className="sidebar-meta-details">
                  <p>{currentMembership?.displayName || data.auth.email || "로그인 사용자"}</p>
                  <p>{activeRoleLabel}</p>
                </div>
                <button
                  className="btn-secondary sidebar-logout"
                  aria-label="로그아웃"
                  onClick={() => void signOut()}
                  disabled={busyKey !== null}
                >
                  {sidebarCollapsed ? "종료" : "로그아웃"}
                </button>
              </div>
            </div>
          </aside>

          <div className="sidebar-hover-zone">
            <button
              type="button"
              className="sidebar-thumb-toggle"
              aria-label={sidebarToggleLabel}
              title={sidebarToggleLabel}
              onClick={() => setSidebarCollapsed((current) => !current)}
            >
              <span className="sidebar-thumb-icon" aria-hidden="true">
                {sidebarCollapsed ? "›" : "‹"}
              </span>
            </button>
          </div>
        </div>

        <main
          className={
            visibleActiveTab === "onboarding"
              ? "content content-onboarding"
              : visibleActiveTab === "home"
              ? "content content-home"
              : visibleActiveTab === "customers"
                ? "content content-customers"
                : visibleActiveTab === "certificates"
                  ? "content content-certificates"
                : visibleActiveTab === "settings"
                  ? "content content-settings"
                  : visibleActiveTab === "ops"
                    ? "content content-ops"
                    : "content"
          }
        >
          <header className={visibleActiveTab === "onboarding" ? "action-bar is-onboarding" : "action-bar"}>
            <div className={visibleActiveTab === "onboarding" ? "action-bar-main is-status-only" : "action-bar-main"}>
              {visibleActiveTab !== "onboarding" ? (
                <div className="action-bar-copy">
                  <span className="action-bar-label">{activeNavLabel}</span>
                  <strong>{activeScreenBar.title}</strong>
                </div>
              ) : null}
              <div className="action-bar-status">
                <span className="action-bar-pill action-bar-pill-workspace">{activeWorkspaceName}</span>
                {visibleActiveTab !== "ops" ? <span className={workspacePopbillIsTest ? "action-bar-pill tone-warn" : "action-bar-pill"}>{workspacePopbillModeLabel}</span> : null}
                {activeScreenBar.chips.map((metric) => (
                  <span
                    key={`${visibleActiveTab}-${metric.label}`}
                    className={[
                      "action-bar-pill",
                      metric.tone === "success"
                        ? "tone-success"
                        : metric.tone === "warn"
                          ? "tone-warn"
                          : metric.tone === "danger"
                            ? "tone-danger"
                            : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {metric.label} {metric.value}
                  </span>
                ))}
              </div>
            </div>
            {showActionBarActions ? (
              <div className="action-bar-actions">
                {showHomeSyncButton ? (
                  <button className="btn-secondary" onClick={() => void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })))} disabled={busyKey !== null}>
                    <Icon name="sync" className="button-icon" />
                    메일 동기화
                  </button>
                ) : null}
                {showScreenPrimaryAction ? (
                  <button type="button" onClick={activeScreenBar.onPrimaryAction}>
                    {activeScreenBar.primaryActionLabel}
                  </button>
                ) : null}
              </div>
            ) : null}
          </header>

          {error ? <div className="alert error">{error}</div> : null}

        {visibleActiveTab === "onboarding" ? (
          <div className="onboarding-screen">
            <div className={onboardingPendingStepCount > 0 ? "onboarding-wizard-shell" : "onboarding-wizard-shell is-muted"}>
              <section className={onboardingPendingStepCount > 0 ? "onboarding-wizard-hero" : "onboarding-wizard-hero is-muted"}>
                <div className="onboarding-wizard-progress-row">
                  <span className={onboardingPendingStepCount === 0 ? "chip chip-success" : "chip chip-warn"}>진행</span>
                  <span className="onboarding-wizard-progress-count">{onboardingHeroProgressText}</span>
                </div>
                <div className="onboarding-wizard-head">
                  <div className="onboarding-wizard-copy">
                    <strong>도입 준비</strong>
                    <p>{onboardingHeroTaskLine}</p>
                    {firstPendingOnboardingStep?.blockedReason ? (
                      <p className="onboarding-inline-warning">{firstPendingOnboardingStep.blockedReason}</p>
                    ) : null}
                  </div>
                  <div className={onboardingPendingStepCount > 0 ? "onboarding-wizard-focus" : "onboarding-wizard-focus is-complete"}>
                    <span>{onboardingHeroFocusLabel}</span>
                    <strong>{onboardingHeroFocusTitle}</strong>
                    <p>{onboardingHeroFocusSummary}</p>
                  </div>
                </div>
              </section>

              <section className="onboarding-main-card">
                <OnboardingTab
                  steps={onboardingSetupSteps}
                  requestedStepId={requestedOnboardingStepId}
                />
              </section>
            </div>
          </div>
        ) : null}

        {visibleActiveTab === "home" ? (
          <div className="home-screen">
            {mailboxDataLoading ? (
              <div className="helper-box import-helper-box">
                <strong>메일과 발행 대기를 읽는 중입니다.</strong>
              </div>
            ) : null}
            <div className="home-layout">
              {!onboardingComplete ? (
                <Panel
                  className="panel-home-setup"
                  title="도입 준비 진행"
                  subtitle={firstPendingOnboardingStep ? `다음 단계 · ${firstPendingOnboardingStep.title}` : "남은 단계 점검"}
                  actions={<button type="button" onClick={reopenOnboarding}>이어하기</button>}
                >
                  <div className="helper-box-stack">
                    <strong>{onboardingHeroProgressText}</strong>
                    <span>
                      남은 단계 {onboardingPendingStepCount}개
                      {firstPendingOnboardingStep ? ` · ${firstPendingOnboardingStep.summary}` : ""}
                    </span>
                    <span className="field-hint">도입 준비는 보조 진입점으로 유지되며, 완료되면 사이드바에서 자동으로 숨겨집니다.</span>
                  </div>
                </Panel>
              ) : null}
              <Panel
                className="panel-home-blocked"
                title="막힌 일"
                subtitle={workPriorityCards.length > 0 ? "우선 해결" : "정상"}
              >
                {workPriorityCards.length > 0 ? (
                  <div className="work-priority-grid">
                    {workPriorityCards.map((card) => (
                      <article
                        key={card.key}
                        className={
                          card.tone === "danger"
                            ? "work-priority-card tone-danger"
                            : card.tone === "warn"
                              ? "work-priority-card tone-warn"
                              : "work-priority-card"
                        }
                      >
                        <div className="work-priority-card-head">
                          <div>
                            <span className="work-priority-label">{card.title}</span>
                            <strong>{card.count}건</strong>
                          </div>
                          <span className={`chip ${card.tone === "danger" ? "chip-danger" : card.tone === "warn" ? "chip-warn" : ""}`}>
                            {card.tone === "danger" ? "즉시 확인" : card.tone === "warn" ? "확인 필요" : "참고"}
                          </span>
                        </div>
                        <p>{card.description}</p>
                        <button type="button" className="btn-secondary" onClick={card.onAction}>
                          {card.actionLabel}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="work-priority-empty">
                    <span className="chip chip-success">정상</span>
                    <strong>{workPriorityEmptyState?.title}</strong>
                    <p>{workPriorityEmptyState?.body}</p>
                  </div>
                )}
              </Panel>

              <Panel
                className="panel-home-today"
                title="오늘 할 일"
                subtitle="바로 처리"
                actions={reviewDrafts.length > 0 ? <button onClick={() => void runAction("issue-all", issueAllReviewDrafts)}>검수 건 직접 발행</button> : undefined}
              >
                <div className="work-action-grid">
                  {workRoutineCards.map((card) => (
                    <article
                      key={card.key}
                      className={[
                        "work-action-card",
                        card.tone === "success" ? "tone-success" : card.tone === "warn" ? "tone-warn" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="work-action-card-head">
                        <div>
                          <span className="work-priority-label">{card.title}</span>
                          <strong>{card.count}건</strong>
                        </div>
                        <span className={`chip ${card.tone === "success" ? "chip-success" : card.tone === "warn" ? "chip-warn" : ""}`}>
                          {card.tone === "success" ? "바로 확인" : card.tone === "warn" ? "오늘 확인" : "안내"}
                        </span>
                      </div>
                      <p>{card.description}</p>
                      <button type="button" className="btn-secondary" onClick={card.onAction}>
                        {card.actionLabel}
                      </button>
                    </article>
                  ))}
                </div>
                <div className="work-section-label" id="work-review-queue">
                  <strong>검토할 초안</strong>
                  <span>{reviewDrafts.length}건</span>
                </div>
                <div className={reviewDrafts.length === 0 ? "table-wrap queue-table-shell is-empty" : "table-wrap queue-table-shell"}>
                  <table className="responsive-table queue-table">
                    <thead>
                      <tr>
                        <th>고객</th>
                        <th>품목</th>
                        <th>공급가액</th>
                        <th>상태</th>
                        <th>액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewDrafts.map((draft) => (
                        <tr key={draft.id}>
                          <td data-label="고객">{draft.customerName}</td>
                          <td data-label="품목">{draft.itemName}</td>
                          <td data-label="공급가액">{formatMoney(draft.supplyCost)}원</td>
                          <td data-label="상태">
                            <span className={`status status-${draft.status}`}>{getDraftStatusLabel(draft.status)}</span>
                            {draft.issueError ? <p className="cell-error" title={draft.issueError}>{simplifyIssueError(draft.issueError)}</p> : null}
                          </td>
                          <td data-label="액션">
                            {draft.status === "issuing" ? (
                              <span className="status status-pending">발행 중</span>
                            ) : (
                              <button disabled={busyKey !== null} onClick={() => void runAction(`issue-${draft.id}`, async () => void (await api(`/api/drafts/${draft.id}/issue`, { method: "POST" })))}>
                                지금 직접 발행
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {reviewDrafts.length === 0 ? (
                        <tr className="queue-empty-row">
                          <td className="queue-empty-cell" colSpan={5}>
                            {!onboardingFirstSyncReady
                              ? "아직 첫 메일 동기화를 하지 않아 초안이 없습니다."
                              : "지금 검수 후 직접 발행할 초안이 없습니다."}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel
                className="panel-home-recent"
                title="최근 처리 결과"
                subtitle="최근 흐름"
              >
                <div className="compact-status-stack">
                  <div className="history-split">
                    <section className="history-block" id="work-recent-history">
                      <header className="history-block-head">
                        <div className="history-title-row">
                          <div className="history-title-copy">
                            <strong>최근 흐름</strong>
                            <span className="history-caption">수신 / 발행</span>
                          </div>
                          <div className="history-tabs">
                            <button
                              type="button"
                              className={workFeedTab === "inbox" ? "btn-secondary active-filter" : "btn-secondary"}
                              onClick={() => setWorkFeedTab("inbox")}
                            >
                              최근 수신 {recentInboxPreview.length}
                            </button>
                            <button
                              type="button"
                              className={workFeedTab === "issued" ? "btn-secondary active-filter" : "btn-secondary"}
                              onClick={() => setWorkFeedTab("issued")}
                            >
                              최근 발행 {recentIssuedPreview.length}
                            </button>
                          </div>
                        </div>
                        <div className="history-head-action">
                          {workFeedTab === "inbox" && reprocessableMessages.length > 0 ? (
                            <button className="btn-secondary" onClick={() => void runAction("reprocess-all-unmatched", reprocessAllUnmatchedMessages)}>재처리</button>
                          ) : (
                            <span className="history-head-spacer" />
                          )}
                        </div>
                      </header>
                      <div className="history-list">
                        {workFeedTab === "inbox"
                          ? recentInboxPreview.map((message) => (
                              <div key={message.id} className="history-row">
                                <div>
                                  <strong>{message.parsedData?.plantName ?? "미확인 메일"}</strong>
                                  <span>{formatDateTime(message.receivedAt)}</span>
                                </div>
                                <div className="history-actions">
                                  <span className={`status status-${getInboxDisplayParseStatus(message)}`}>
                                    {getParseStatusLabel(getInboxDisplayParseStatus(message))}
                                  </span>
                                  {isInboxActionable(message) ? (
                                    <button
                                      className="btn-secondary"
                                      onClick={() => void runAction(`reprocess-${message.id}`, async () => void (await reprocessInboxMessage(message.id)))}
                                    >
                                      재처리
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          : recentIssuedPreview.map((draft) => (
                              <div key={draft.id} className="history-row">
                                <div>
                                  <strong>{draft.customerName}</strong>
                                  <span>{formatMoney(draft.totalAmount)}원 · {formatDateTime(draft.issuedAt)}</span>
                                </div>
                                <div className="history-actions">
                                  <button
                                    className="btn-secondary"
                                    disabled={busyKey !== null}
                                    onClick={() => void runAction(`draft-view-${draft.id}`, async () => void (await openDraftPopbillUrl(draft.id, "view-url")))}
                                  >
                                    보기
                                  </button>
                                  <button
                                    className="btn-danger"
                                    disabled={busyKey !== null}
                                    onClick={() => void runAction(`draft-cancel-${draft.id}`, async () => void (await cancelIssuedDraft(draft.id)))}
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ))}
                        {workFeedTab === "inbox" && recentInboxPreview.length === 0 ? <div className="empty">{recentInboxEmptyMessage}</div> : null}
                        {workFeedTab === "issued" && recentIssuedPreview.length === 0 ? <div className="empty">{recentIssuedEmptyMessage}</div> : null}
                      </div>
                    </section>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        ) : null}

        {visibleActiveTab === "customers" ? (
          <CustomersTab
            customers={data.customers}
            expiredCertCustomers={expiredCertCustomers}
            expiringSoonCustomers={expiringSoonCustomers}
            filteredCustomers={filteredCustomers}
            selectedCustomer={selectedCustomer}
            creatingCustomer={creatingCustomer}
            selectedCustomerReadiness={selectedCustomerReadiness}
            selectedCustomerIssues={selectedCustomerIssues}
            selectedCustomerIssuedDrafts={selectedCustomerIssuedDrafts}
            blockedCustomerCount={blockedCustomerCount}
            readyCustomerCount={readyNowCustomers.length}
            expiringSoonCustomerCount={expiringSoonCustomers.length}
            popbillPendingCustomerCount={popbillPendingCustomers.length}
            managedCustomerCount={managedCustomerCount}
            managedCustomerLimit={managedCustomerLimit}
            hasReachedManagedCustomerLimit={hasReachedManagedCustomerLimit}
            busyKey={busyKey}
            isSavingCustomer={isSavingCustomer}
            customerSearchQuery={customerSearchQuery}
            customerListFilter={customerListFilter}
            customerDetailTab={customerDetailTab}
            customerForm={customerForm}
            customerCertNotice={customerCertNotice}
            customerAddressResolveMessage={customerAddressResolveMessage}
            mailboxDataLoading={mailboxDataLoading}
            canUseCustomerRenewalAssistant={canUseCustomerRenewalAssistant}
            customerRenewalAssistantOnline={customerRenewalAssistant?.agentOnline ?? false}
            customerRenewalAssistantHelperVersion={customerRenewalAssistant?.helperVersion ?? null}
            customerRenewalAssistantHelperMessage={customerRenewalAssistant?.helperMessage || "상태 확인 전"}
            customerRenewalLoadedCertificateCount={customerRenewalAssistantCertificates.length}
            renewableCustomers={customerRenewalCandidates}
            customerNameInputRef={customerNameInputRef}
            customerAddressLookupRef={customerAddressLookupRef}
            setCustomerSearchQuery={setCustomerSearchQuery}
            setCustomerListFilter={setCustomerListFilter}
            setCustomerDetailTab={setCustomerDetailTab}
            setCustomerForm={setCustomerForm}
            setCustomerAddressResolveMessage={setCustomerAddressResolveMessage}
            onCreateCustomer={startCreatingCustomer}
            onCancelCreateCustomer={cancelCreatingCustomer}
            onRefreshCustomerRenewalAssistant={refreshCustomerRenewalAssistant}
            onLoadCustomerRenewalCertificates={loadCustomerRenewalCertificates}
            onStartCustomerRenewal={startCustomerRenewal}
            onSelectCustomer={selectCustomerForEdit}
            onSaveCustomer={saveCustomer}
            onJoinCustomerPopbill={joinCustomerPopbill}
            onOpenCustomerCertRegistration={openCustomerCertRegistration}
            onRefreshCustomerCertificateStatus={refreshSingleCustomerCertificateStatus}
            onRefreshAllCertificateStatuses={refreshAllCertificateStatuses}
            onResetPopbillLink={resetPopbillLink}
            onDeleteCustomer={deleteCustomer}
            onShowDraftPopbillInfo={showDraftPopbillInfo}
            onOpenDraftPopbillUrl={openDraftPopbillUrl}
            resolveCustomerAddress={resolveCustomerAddress}
            runAction={runAction}
            formatCertificateExpireDate={formatCertificateExpireDate}
            getCustomerIssueReadiness={getCachedCustomerIssueReadiness}
            getCustomerCertificateSummary={getCustomerCertificateSummary}
            getCustomerPopbillSummary={getCustomerPopbillSummary}
            getIssueModeLabel={getIssueModeLabel}
            getDraftConfirmNumber={getDraftConfirmNumber}
            formatDateTime={formatDateTime}
            formatMoney={formatMoney}
          />
        ) : null}

        {visibleActiveTab === "settings" ? (
          <SettingsScreen
            settingsState={settingsScreenState}
            activeSettingsSection={activeSettingsSection}
            customerRegistrationReady={customerRegistrationReady}
            customerCount={data.customers.length}
            onboardingComplete={onboardingComplete}
            onboardingProgressText={onboardingHeroProgressText}
            onboardingPendingStepCount={onboardingPendingStepCount}
            showCompletedOnboardingNav={showCompletedOnboardingNav}
            onShowCompletedOnboardingNavChange={(nextValue) =>
              setOnboardingNavPreference({
                organizationId: activeOrganizationId,
                showCompletedOnboardingNav: nextValue
              })
            }
            openOnboarding={reopenOnboarding}
            busyKey={busyKey}
            customerRenewalAssistantOnline={customerRenewalAssistant?.agentOnline ?? false}
            customerRenewalAssistantHelperVersion={customerRenewalAssistant?.helperVersion ?? null}
            customerRenewalAssistantHelperMessage={customerRenewalAssistant?.helperMessage || "상태 확인 전"}
            customerRenewalAssistantUpgradeState={customerRenewalAssistant?.upgradeState ?? "unknown"}
            customerRenewalAssistantUpgradeMessage={customerRenewalAssistant?.upgradeMessage ?? null}
            customerRenewalAssistantLatestVersion={customerRenewalAssistant?.latestVersion ?? null}
            customerRenewalAssistantMinSupportedVersion={customerRenewalAssistant?.minSupportedVersion ?? null}
            customerRenewalAssistantCheckedAt={customerRenewalAssistant?.helperCheckedAt ?? null}
            customerRenewalLoadedCertificateCount={customerRenewalAssistantAllCertificates.length}
            renewalHelperDownloadUrl={renewalHelperDownloadUrl}
            setActiveSettingsSection={setActiveSettingsSection}
            orchestration={settingsFeatureOrchestration}
            openCertificates={openCertificates}
            formatDateTime={formatDateTime}
          />
        ) : null}

        {visibleActiveTab === "certificates" ? (
          <CertificatesScreen
            customers={data.customers}
            busyKey={busyKey}
            canUseCustomerRenewalAssistant={canUseCustomerRenewalAssistant}
            customerRenewalAssistantOnline={customerRenewalAssistant?.agentOnline ?? false}
            customerRenewalAssistantHelperVersion={customerRenewalAssistant?.helperVersion ?? null}
            customerRenewalAssistantHelperMessage={customerRenewalAssistant?.helperMessage || "상태 확인 전"}
            customerRenewalAssistantUpgradeState={customerRenewalAssistant?.upgradeState ?? "unknown"}
            customerRenewalAssistantUpgradeMessage={customerRenewalAssistant?.upgradeMessage ?? null}
            customerRenewalAssistantLatestVersion={customerRenewalAssistant?.latestVersion ?? null}
            customerRenewalAssistantMinSupportedVersion={customerRenewalAssistant?.minSupportedVersion ?? null}
            renewalHelperDownloadUrl={renewalHelperDownloadUrl}
            customerRenewalLoadedCertificateCount={customerRenewalAssistantAllCertificates.length}
            certificatesModel={certificatesScreenModel}
            onLinkCustomerCertificate={linkLocalCertificateToCustomer}
            onUnlinkCustomerCertificate={unlinkCustomerCertificate}
            onPrepareCustomerCertificateRenewal={prepareLinkedCustomerCertificateRenewal}
            onOpenCustomerCertificatePayment={openLinkedCustomerCertificatePayment}
            runRefreshCustomerRenewalAssistant={async () =>
              runAction("customer-renewal-refresh", refreshCustomerRenewalAssistant, { reload: false })
            }
            runLoadCustomerRenewalCertificates={async () =>
              runAction("customer-renewal-bridge-probe", loadCustomerRenewalCertificates, { reload: false })
            }
            runAction={runAction}
            formatCertificateExpireDate={formatCertificateExpireDate}
          />
        ) : null}

        {visibleActiveTab === "ops" ? (
          <div className="ops-layout">
            <AccountPasswordPanel
              title="플랫폼 관리자 계정 보안"
              subtitle={`현재 로그인한 플랫폼 관리자 계정(${data.auth.email ?? "이메일 없음"})의 비밀번호를 바꿉니다.`}
              hintText="플랫폼 운영 계정도 여기서 직접 새 비밀번호를 저장할 수 있습니다."
              account={settingsScreenState.account}
              reveals={settingsFeatureOrchestration.reveals.accountPassword}
              onSubmit={() =>
                settingsFeatureOrchestration.actions.changePassword(
                  settingsScreenState.account.changePassword
                )
              }
            />
            {opsConsole ? (
              <>
                <Panel
                  className="panel-ops-workspace-create"
                  id="ops-workspace-create"
                  title="고객사 작업공간 개통"
                  subtitle={isCreatingWorkspace ? "고객사 작업공간과 첫 owner 계정을 만드는 중입니다. 잠시만 기다려주세요." : "새 고객사를 만들고 첫 owner 로그인 아이디를 바로 연결합니다."}
                  actions={
                    <button disabled={busyKey !== null} onClick={() => void runAction("ops-create-workspace", createWorkspace)}>
                      {isCreatingWorkspace ? "작업공간 개통 중..." : "작업공간 개통"}
                    </button>
                  }
                >
                  {isCreatingWorkspace ? (
                    <div className="helper-box full-width">
                      <strong>개통 진행 중</strong>
                      <span>계정 확인, 작업공간 생성, 첫 owner 연결을 순서대로 처리하고 있습니다. 완료될 때까지 창을 닫지 말고 잠시 기다려주세요.</span>
                    </div>
                  ) : null}
                  <div className="form-grid">
                    <label>
                      고객사명
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.organizationName}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, organizationName: event.target.value }))}
                        placeholder="예: 해성태양광"
                      />
                    </label>
                    <label>
                      사업자번호 (선택)
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.organizationBusinessNumber}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, organizationBusinessNumber: event.target.value }))}
                        placeholder="숫자만 입력 · 개인 사용 작업공간이면 비워두기"
                      />
                      <span className="field-hint">이 작업공간을 쓰는 운영 주체의 선택 정보입니다. 관리 고객의 사업자번호와는 별개입니다.</span>
                    </label>
                    <label>
                      관리 고객 한도
                      <input
                        disabled={busyKey !== null}
                        type="number"
                        min="1"
                        step="1"
                        value={opsWorkspaceForm.managedCustomerLimit}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, managedCustomerLimit: event.target.value }))}
                        placeholder="예: 50"
                      />
                      <span className="field-hint">이 고객사가 등록할 수 있는 최대 관리 고객 수입니다.</span>
                    </label>
                    <label>
                      첫 owner 로그인 아이디
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.ownerLoginId}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, ownerLoginId: event.target.value }))}
                        placeholder="예: admin01"
                      />
                    </label>
                    <label>
                      owner 이름
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.ownerDisplayName}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, ownerDisplayName: event.target.value }))}
                        placeholder="담당자 이름"
                      />
                    </label>
                    <label className="full">
                      임시 비밀번호
                      <div className="password-field">
                        <input
                          disabled={busyKey !== null}
                          type={revealedFields.opsOwnerPassword ? "text" : "password"}
                          value={opsWorkspaceForm.ownerPassword}
                          onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, ownerPassword: event.target.value }))}
                          placeholder="기존 사용자면 비워두고, 새 사용자면 8자 이상 입력"
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          disabled={busyKey !== null}
                          aria-label={revealedFields.opsOwnerPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"}
                          onClick={() => toggleRevealField("opsOwnerPassword")}
                        >
                          <RevealIcon open={Boolean(revealedFields.opsOwnerPassword)} />
                        </button>
                      </div>
                      <span className="field-hint">이미 존재하는 로그인 아이디면 기존 계정을 owner로 연결하고, 처음 만드는 로그인 아이디면 임시 비밀번호가 필요합니다.</span>
                    </label>
                  </div>
                </Panel>

                <section className={`alert ${opsPartnerIsTest ? "warn" : "success"} ops-mode-banner`}>
                  <div className="ops-mode-banner-head">
                    <strong>팝빌 현재 연결 모드</strong>
                    <span className={`chip ${opsPartnerIsTest ? "chip-warn" : "chip-success"}`}>{opsPartnerModeLabel}</span>
                  </div>
                  <p>{opsPartnerModeDescription}</p>
                </section>

                <section className="stats-grid stats-grid-compact ops-stats">
                  <StatCard
                    label="파트너 포인트"
                    value={opsConsole.partnerPoints.available && opsConsole.partnerPoints.partnerRemainPoint !== null ? opsConsole.partnerPoints.partnerRemainPoint : 0}
                    tone={opsConsole.partnerPoints.available ? "default" : "warn"}
                  />
                  <StatCard
                    label="이번 달 발행"
                    value={totalWorkspaceCurrentMonthIssuedDraftCount}
                    tone={totalWorkspaceCurrentMonthIssuedDraftCount > 0 ? "default" : "warn"}
                  />
                  <StatCard
                    label={partnerTaxInvoiceUnitCost === null ? "누적 발행" : "누적 추정 사용"}
                    value={partnerTaxInvoiceUnitCost === null ? totalWorkspaceIssuedDraftCount : totalWorkspaceEstimatedPointUsage ?? 0}
                    tone="default"
                  />
                  <StatCard label="운영 로그" value={opsLogs.length} tone={opsLogs.some((log) => log.level === "error") ? "error" : "default"} />
                  <StatCard label="진단 작업" value={opsJobs.length} tone={opsJobs.some((job) => job.status === "failed") ? "warn" : "default"} />
                </section>

                <Panel className="panel-ops-workspaces" title="개통된 고객사 작업공간">
                  <p className="ops-helper-text">
                    고객사별 발행 완료 건수를 기준으로 사용량을 집계합니다.
                    {partnerTaxInvoiceUnitCost !== null
                      ? ` 현재 팝빌 전자세금계산서 단가 ${formatMoney(partnerTaxInvoiceUnitCost)}P 기준 추정 사용 포인트도 함께 표시합니다.`
                      : " 팝빌 전자세금계산서 단가를 읽지 못해 추정 포인트는 아직 계산하지 못했습니다."}
                  </p>
                  <div className="ops-list">
                    {opsWorkspaces.length > 0 ? (
                      opsWorkspaces.map((workspace) => {
                        const isOwnerResetTarget =
                          ownerPasswordResetTarget?.organizationId === workspace.organizationId;
                        const workspaceEstimatedPointUsage = getWorkspaceEstimatedPointUsage(workspace, partnerTaxInvoiceUnitCost);
                        const workspaceCurrentMonthEstimatedPointUsage = getWorkspaceCurrentMonthEstimatedPointUsage(
                          workspace,
                          partnerTaxInvoiceUnitCost
                        );

                        return (
                          <article key={workspace.organizationId} className="ops-card">
                            <div className="ops-card-head">
                              <div>
                                <strong>{workspace.organizationName}</strong>
                                <span>{workspace.organizationBusinessNumber || "사업자번호(선택) 미입력"}</span>
                              </div>
                              <span className={`chip ${workspace.organizationStatus === "active" ? "chip-success" : workspace.organizationStatus === "trial" ? "chip-warn" : "chip-danger"}`}>
                                {getOrganizationStatusLabel(workspace.organizationStatus)}
                              </span>
                            </div>
                            <div className="ops-card-meta">
                              <span>owner: {workspace.ownerDisplayName ? `${workspace.ownerDisplayName} · ` : ""}{workspace.ownerLoginId ?? "-"}</span>
                              <span>멤버 {workspace.memberCount}명</span>
                              <span>플랜 {workspace.organizationPlanCode}</span>
                              <span>
                                관리 고객 {workspace.managedCustomerCount}명
                                {workspace.managedCustomerLimit !== null ? ` / 한도 ${workspace.managedCustomerLimit}명` : ""}
                              </span>
                              <span>누적 발행 {formatMoney(workspace.issuedDraftCount)}건</span>
                              <span>이번 달 발행 {formatMoney(workspace.currentMonthIssuedDraftCount)}건</span>
                              <span>
                                누적 추정 사용 {workspaceEstimatedPointUsage !== null ? `${formatMoney(workspaceEstimatedPointUsage)}P` : "-"}
                              </span>
                              <span>
                                이번 달 추정 사용 {workspaceCurrentMonthEstimatedPointUsage !== null ? `${formatMoney(workspaceCurrentMonthEstimatedPointUsage)}P` : "-"}
                              </span>
                              <span>최근 발행 {formatDateTime(workspace.lastIssuedAt)}</span>
                              <span>생성 {formatDateTime(workspace.createdAt)}</span>
                            </div>
                            <div className="ops-card-actions">
                              <button
                                className="btn-secondary"
                                disabled={busyKey !== null}
                                onClick={() => openOwnerPasswordReset(workspace)}
                              >
                                owner 비밀번호 재설정
                              </button>
                            </div>
                            <div className="helper-box-stack">
                              <strong>관리 고객 한도</strong>
                              <div className="form-grid">
                                <label>
                                  현재 등록 고객
                                  <input value={`${workspace.managedCustomerCount}명`} disabled />
                                </label>
                                <label>
                                  최대 등록 가능 수
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={workspaceLimitEdits[workspace.organizationId] ?? String(workspace.managedCustomerLimit ?? "")}
                                    onChange={(event) =>
                                      setWorkspaceLimitEdits((prev) => ({
                                        ...prev,
                                        [workspace.organizationId]: event.target.value
                                      }))
                                    }
                                  />
                                </label>
                              </div>
                              <div className="button-row">
                                <button
                                  className="btn-secondary"
                                  disabled={busyKey !== null}
                                  onClick={() =>
                                    void runAction(
                                      `ops-workspace-limit-${workspace.organizationId}`,
                                      async () => void (await updateWorkspaceManagedCustomerLimit(workspace)),
                                      { reload: false }
                                    )
                                  }
                                >
                                  한도 저장
                                </button>
                              </div>
                            </div>
                            {isOwnerResetTarget ? (
                              <div className="helper-box-stack inline-password-reset">
                                <strong>{workspace.organizationName} owner 임시 비밀번호 재설정</strong>
                                <div className="form-grid">
                                  <label>
                                    새 임시 비밀번호
                                    <div className="password-field">
                                      <input
                                        type={revealedFields.ownerResetNextPassword ? "text" : "password"}
                                        value={ownerPasswordResetForm.nextPassword}
                                        onChange={(event) =>
                                          setOwnerPasswordResetForm((prev) => ({
                                            ...prev,
                                            nextPassword: event.target.value
                                          }))
                                        }
                                        placeholder="8자 이상 입력"
                                      />
                                      <button
                                        type="button"
                                        className="password-toggle"
                                        aria-label={revealedFields.ownerResetNextPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"}
                                        onClick={() => toggleRevealField("ownerResetNextPassword")}
                                      >
                                        <RevealIcon open={Boolean(revealedFields.ownerResetNextPassword)} />
                                      </button>
                                    </div>
                                  </label>
                                  <label>
                                    새 임시 비밀번호 확인
                                    <div className="password-field">
                                      <input
                                        type={revealedFields.ownerResetConfirmPassword ? "text" : "password"}
                                        value={ownerPasswordResetForm.confirmPassword}
                                        onChange={(event) =>
                                          setOwnerPasswordResetForm((prev) => ({
                                            ...prev,
                                            confirmPassword: event.target.value
                                          }))
                                        }
                                        placeholder="한 번 더 입력"
                                      />
                                      <button
                                        type="button"
                                        className="password-toggle"
                                        aria-label={revealedFields.ownerResetConfirmPassword ? "임시 비밀번호 확인 숨기기" : "임시 비밀번호 확인 보기"}
                                        onClick={() => toggleRevealField("ownerResetConfirmPassword")}
                                      >
                                        <RevealIcon open={Boolean(revealedFields.ownerResetConfirmPassword)} />
                                      </button>
                                    </div>
                                  </label>
                                </div>
                                <div className="button-row">
                                  <button
                                    onClick={() =>
                                      void runAction(
                                        `reset-owner-password-${workspace.organizationId}`,
                                        submitOwnerPasswordReset,
                                        { reload: false }
                                      )
                                    }
                                  >
                                    임시 비밀번호 저장
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={cancelOwnerPasswordReset}
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    ) : (
                      <div className="empty">아직 개통된 고객사 작업공간이 없습니다.</div>
                    )}
                  </div>
                </Panel>

                <div className="ops-grid">
                  <Panel
                    title="배치 작업"
                    subtitle="Supabase cron 없이도 플랫폼 관리자가 큐 생성과 실행을 수동으로 점검할 수 있습니다."
                    actions={
                      <>
                        <button className="btn-secondary" onClick={() => void runAction("ops-dispatch-jobs", dispatchInternalJobs, { reload: false })}>
                          작업 생성
                        </button>
                        <button onClick={() => void runAction("ops-run-jobs", runInternalJobs, { reload: false })}>
                          작업 실행
                        </button>
                      </>
                    }
                  >
                    <div className="info-grid">
                      <div>
                        <span>생성 API</span>
                        <strong>/api/internal/jobs/dispatch</strong>
                      </div>
                      <div>
                        <span>실행 API</span>
                        <strong>/api/internal/jobs/run</strong>
                      </div>
                      <div className="full">
                        <span>운영 메모</span>
                        <strong>무료 운영 단계에서는 Supabase cron이 이 두 API를 주기적으로 깨우고, 플랫폼 관리자는 여기서 수동 점검을 할 수 있습니다.</strong>
                      </div>
                    </div>
                  </Panel>

                  <Panel
                    className="panel-ops-partner"
                    title="팝빌 파트너 운영"
                    subtitle="고객사 화면에는 보이지 않는 플랫폼 공통 운영 영역입니다."
                    actions={
                      <>
                        <button className="btn-secondary" onClick={() => void runAction("ops-refresh", load)}>
                          새로고침
                        </button>
                        <button onClick={() => void runAction("ops-charge-url", openPartnerChargeUrl, { reload: false })}>
                          충전 페이지
                        </button>
                      </>
                    }
                  >
                    <div className="info-grid">
                      <div>
                        <span>파트너 포인트</span>
                        <strong>
                          {opsConsole.partnerPoints.available && opsConsole.partnerPoints.partnerRemainPoint !== null
                            ? `${formatMoney(opsConsole.partnerPoints.partnerRemainPoint)}P`
                            : "-"}
                        </strong>
                      </div>
                      <div>
                        <span>현재 연결 모드</span>
                        <strong>{opsPartnerModeLabel}</strong>
                      </div>
                      <div>
                        <span>조회 기준</span>
                        <strong>{opsConsole.partnerPoints.referenceCorpNum ?? "-"}</strong>
                      </div>
                      <div>
                        <span>전자세금계산서 단가</span>
                        <strong>
                          {opsConsole.partnerPoints.taxInvoiceUnitCost !== null
                            ? `${formatMoney(opsConsole.partnerPoints.taxInvoiceUnitCost)}P`
                            : "-"}
                        </strong>
                      </div>
                      <div>
                        <span>이번 달 추정 사용</span>
                        <strong>
                          {totalWorkspaceCurrentMonthEstimatedPointUsage !== null
                            ? `${formatMoney(totalWorkspaceCurrentMonthEstimatedPointUsage)}P`
                            : "-"}
                        </strong>
                      </div>
                    </div>
                    <p className="ops-helper-text">{formatPartnerPointsMessage(opsConsole.partnerPoints)}</p>
                  </Panel>

                  <Panel
                    className="panel-ops-agent"
                    title="로컬 인증서 진단"
                    subtitle="고객용 설정에서 분리한 내부 진단 화면입니다."
                    actions={
                      <button onClick={() => void runAction("ops-bridge-probe", async () => void (await requestRenewalBridgeProbe(null)))}>
                        전체 진단 실행
                      </button>
                    }
                  >
                    <div className="info-grid">
                      <div>
                        <span>에이전트</span>
                        <strong>{opsAgentStatusMeta?.label ?? "-"}</strong>
                      </div>
                      <div>
                        <span>호스트</span>
                        <strong>{opsAgent?.hostname ?? "-"}</strong>
                      </div>
                      <div>
                        <span>브리지</span>
                        <strong>{opsAgent ? formatRenewalBridgeSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div>
                        <span>최근 heartbeat</span>
                        <strong>{opsAgent ? formatDateTime(opsAgent.lastHeartbeatAt) : "-"}</strong>
                      </div>
                      <div>
                        <span>버전</span>
                        <strong>{opsAgent ? formatRenewalVersionSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div>
                        <span>라이선스</span>
                        <strong>{opsAgent ? formatRenewalLicenseSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div>
                        <span>인증서 저장소</span>
                        <strong>{opsAgent ? formatRenewalStorageSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div>
                        <span>certID</span>
                        <strong>{opsAgent ? formatRenewalSelectionSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div className="full">
                        <span>갱신 경로</span>
                        <strong>{opsAgent ? formatRenewalPreflightSummary(opsAgent) : "-"}</strong>
                      </div>
                    </div>
                    <div className="ops-list">
                      {opsCertificates.length > 0 ? (
                        opsCertificates.map((certificate) => (
                          <article key={`${certificate.index}-${certificate.cn}`} className="ops-card">
                            <div className="ops-card-head">
                              <div>
                                <strong>{certificate.cn || `인증서 #${certificate.index}`}</strong>
                                <span>{certificate.issuerToName || "-"}</span>
                              </div>
                              <span className="chip chip-warn">{certificate.todate ?? "-"}</span>
                            </div>
                            <div className="ops-card-meta">
                              <span>certID: {opsAgent?.bridge.selectionProbe.certificateIndex === certificate.index ? opsAgent.bridge.selectionProbe.certID ?? "-" : "-"}</span>
                              <span>경로: {formatRenewalPathCell(certificate, opsJobs, opsAgent)}</span>
                            </div>
                            <div className="ops-card-actions">
                              <button
                                className="btn-secondary"
                                onClick={() =>
                                  void runAction(`ops-certid-${certificate.index}`, async () => void (await requestRenewalCertIdProbe(certificate)))
                                }
                              >
                                certID 조회
                              </button>
                              <button
                                onClick={() =>
                                  void runAction(`ops-preflight-${certificate.index}`, async () => void (await requestRenewalPreflight(certificate)))
                                }
                              >
                                경로 분석
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="empty">아직 로컬 인증서 목록 진단 결과가 없습니다.</div>
                      )}
                    </div>
                  </Panel>
                </div>

                <div className="ops-grid">
                  <Panel className="panel-ops-jobs" title="최근 진단 작업">
                    <div className="ops-list">
                      {opsJobs.length > 0 ? (
                        opsJobs.slice(0, 8).map((job) => (
                          <article key={job.id} className="ops-card">
                            <div className="ops-card-head">
                              <div>
                                <strong>{formatRenewalJobLabel(job)}</strong>
                                <span>{job.requestedBy}</span>
                              </div>
                              <span className={`chip ${job.status === "completed" ? "chip-success" : job.status === "failed" ? "chip-danger" : "chip-warn"}`}>
                                {formatRenewalJobStatusLabel(job.status)}
                              </span>
                            </div>
                            <div className="ops-card-meta">
                              <span>요청 {formatDateTime(job.requestedAt)}</span>
                              <span>완료 {formatDateTime(job.finishedAt)}</span>
                              <span>{job.summary || job.error || "-"}</span>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="empty">최근 진단 작업이 없습니다.</div>
                      )}
                    </div>
                  </Panel>

                  <Panel className="panel-ops-logs" title="최근 운영 로그">
                    <div className="ops-list">
                      {opsLogs.length > 0 ? (
                        opsLogs.slice(0, 12).map((log) => (
                          <article key={log.id} className="ops-card">
                            <div className="ops-card-head">
                              <div>
                                <strong>{log.message}</strong>
                                <span>{log.scope}</span>
                              </div>
                              <span className={`chip ${log.level === "error" ? "chip-danger" : log.level === "warn" ? "chip-warn" : "chip-success"}`}>
                                {log.level.toUpperCase()}
                              </span>
                            </div>
                            <div className="ops-card-meta">
                              <span>{formatDateTime(log.createdAt)}</span>
                              <span>{log.contextJson || "-"}</span>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="empty">표시할 운영 로그가 없습니다.</div>
                      )}
                    </div>
                  </Panel>
                </div>
              </>
            ) : (
              <div className="empty">플랫폼 관리자 데이터를 불러오는 중입니다.</div>
            )}
          </div>
        ) : null}
        </main>
      </div>
      {appDialog ? <AppDialog dialog={appDialog} onConfirm={() => closeAppDialog(true)} onCancel={() => closeAppDialog(false)} /> : null}
    </>
  );
}
