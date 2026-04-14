import type React from "react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api, setActiveOrganizationId } from "./api";
import { AppDialog, type AppDialogState, type AppDialogTone, Icon, Panel, RevealIcon, StatCard } from "./components/ui";
import { CertificatesTab } from "./features/certificates/CertificatesTab";
import { CustomersTab } from "./features/customers/CustomersTab";
import { InitialRegistrationTab, getInitialRegistrationFlowState } from "./features/initial-registration/InitialRegistrationTab";
import { OnboardingTab, type OnboardingStep } from "./features/onboarding/OnboardingTab";
import {
  downloadCustomerOnboardingTemplate,
  parseCustomerOnboardingWorkbook,
  type CustomerOnboardingCommitStartResponse,
  type CustomerOnboardingCommitResponse,
  type CustomerOnboardingPreviewResponse,
  type CustomerOnboardingTemplateWorkbookInput,
  type CustomerOnboardingWorkbookInput
} from "./features/initial-registration/customer-onboarding-workbook";
import { SettingsTab } from "./features/settings/SettingsTab";
import {
  getLocalRenewalHelperReleaseMetadata,
  getLocalRenewalHelperStatus,
  type LocalRenewalHelperReleaseMetadata,
  requestLocalPopbillCertificateRegistration,
  requestLocalRenewalBridgeProbe,
  requestLocalRenewalCertificates,
  requestLocalRenewalOpenPayment,
  requestLocalRenewalPreparePayment,
  requestLocalRenewalPreflight
} from "./local-renewal-helper";
import {
  evaluateLocalRenewalHelperUpgrade,
  type LocalRenewalHelperUpgradeState
} from "./helper-version";
import { getSessionSafely, supabase } from "./supabase";
import type {
  AppSettings,
  BootstrapPayload,
  CompletedBillingMonth,
  Customer,
  CustomerCertificate,
  CustomerCertificateKind,
  CustomerImportProfile,
  InvoiceDraft,
  LogEntry,
  OrganizationMemberSummary,
  OpsWorkspaceCreateResponse,
  OpsWorkspaceLimitUpdateResponse,
  OpsWorkspaceSummary,
  PartnerPointsPayload,
  RenewalBridgePreflightProbe,
  RenewalInfoSnapshot,
  RenewalAutomationPayload
} from "./types";

type TabId = "onboarding" | "home" | "customers" | "settings" | "ops";
type SettingsSectionId = "gmail" | "popbill" | "helper" | "account";
type CustomerDetailTabId = "info" | "history";
type CustomerListFilter = "all" | "blocked" | "ready" | "expiring" | "unjoined";
type MailProvider = "gmail" | "naver" | "daum";
type RenewalAgentSnapshot = RenewalAutomationPayload["agent"];
type RenewalAgentCertificate = RenewalAgentSnapshot["bridge"]["storageProbe"]["certificates"][number];
type RenewalJob = RenewalAutomationPayload["jobs"][number];
type CustomerRenewalAssistantData = {
  agentOnline: boolean;
  helperVersion: string | null;
  helperMessage: string;
  helperCheckedAt: string | null;
  latestVersion: string | null;
  minSupportedVersion: string | null;
  releaseDownloadUrl: string | null;
  releaseReleasedAt: string | null;
  upgradeState: LocalRenewalHelperUpgradeState;
  upgradeMessage: string | null;
  jobs: RenewalJob[];
  certificates: RenewalAgentCertificate[];
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
type CustomerCertificateCandidateView = {
  key: string;
  certificateIndex: string;
  certificateCn: string;
  certificateKind: CustomerCertificateKind;
  certificateUsage: string;
  issuerName: string;
  certificateExpireDate: string | null;
  linkedCertificateId: number | null;
  linkedCustomerId: number | null;
  linkedCustomerLabel: string | null;
  linkSource: CustomerCertificate["linkSource"] | null;
  suggestedCustomerId: number | null;
  suggestedCustomerLabel: string | null;
  suggestionCount: number;
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
type CustomerOnboardingResolutionResult = {
  workbook: CustomerOnboardingWorkbookInput;
  resolvedCertificateCount: number;
  skippedCertificateCount: number;
  acceptedBeforeWindowCount: number;
  errors: string[];
};

type OnboardingPreflightImportDecision =
  | {
      canImport: true;
      snapshot: RenewalInfoSnapshot;
      acceptedBeforeWindow: boolean;
    }
  | {
      canImport: false;
      failureMessage: string;
    };

type CustomerOnboardingSessionState = {
  templateDownloaded: boolean;
  previewReady: boolean;
  commitDone: boolean;
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

const emptyCustomerOnboardingSessionState: CustomerOnboardingSessionState = {
  templateDownloaded: false,
  previewReady: false,
  commitDone: false
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

type SupportRequestFormState = {
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  message: string;
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

type SettingsFormState = {
  mailProvider: MailProvider;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  mailAddress: string;
  mailPassword: string;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  notificationEmailsText: string;
  defaultIssueDay: string;
  defaultIssueHour: string;
  defaultIssueMinute: string;
  mailPollMinutes: string;
  mailSyncStartAt: string;
  timezone: string;
  popbillUserIdPrefix: string;
  popbillSharedPassword: string;
  operatorContactName: string;
  operatorContactEmail: string;
  operatorContactTel: string;
  renewalContactDepartment: string;
  renewalContactFax: string;
  renewalCertificatePassword: string;
  renewalIssuePassword: string;
  schedulerEnabled: boolean;
};

type PasswordChangeFormState = {
  nextPassword: string;
  confirmPassword: string;
};

type PasswordResetFormState = {
  nextPassword: string;
  confirmPassword: string;
};

type PasswordResetTarget =
  | {
      kind: "member";
      membershipId: string;
      loginId: string | null;
      displayName: string | null;
    }
  | {
      kind: "owner";
      organizationId: string;
      organizationName: string;
      loginId: string | null;
    };

type SettingsAutosaveState = "idle" | "pending" | "saving" | "saved" | "error";

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

function shouldShowPopbillPrefixPlaceholder(settings: AppSettings): boolean {
  const normalizedPrefix = settings.popbillUserIdPrefix.trim().toUpperCase();
  const isDefaultExample = normalizedPrefix === "" || normalizedPrefix === "TEST_" || normalizedPrefix === "HAE_";
  const hasWorkspacePopbillValues =
    settings.popbillSharedPasswordConfigured ||
    Boolean(settings.operatorContactName.trim() || settings.operatorContactEmail.trim() || settings.operatorContactTel.trim());

  return isDefaultExample && !hasWorkspacePopbillValues;
}

type OrganizationMemberFormState = {
  loginId: string;
  displayName: string;
  password: string;
};

type PublicPricingPlanId = "beta" | "standard";

type PublicPricingPlan = {
  id: PublicPricingPlanId;
  label: string;
  badge: string;
  headline: string;
  basePrice: number;
  includedCustomers: number;
  overagePrice: number;
};

const baseOpsWorkspaceForm: OpsWorkspaceFormState = {
  organizationName: "",
  organizationBusinessNumber: "",
  managedCustomerLimit: "50",
  ownerLoginId: "",
  ownerDisplayName: "",
  ownerPassword: ""
};

const baseSupportRequestForm: SupportRequestFormState = {
  companyName: "",
  requesterName: "",
  requesterEmail: "",
  requesterPhone: "",
  message: ""
};

const basePasswordChangeForm: PasswordChangeFormState = {
  nextPassword: "",
  confirmPassword: ""
};

const basePasswordResetForm: PasswordResetFormState = {
  nextPassword: "",
  confirmPassword: ""
};

const baseOrganizationMemberForm: OrganizationMemberFormState = {
  loginId: "",
  displayName: "",
  password: ""
};

const PUBLIC_PRICING_PLANS: Record<PublicPricingPlanId, PublicPricingPlan> = {
  beta: {
    id: "beta",
    label: "오픈베타 1개월",
    badge: "OPEN BETA",
    headline: "도입 전 시험 운영 요금",
    basePrice: 79000,
    includedCustomers: 50,
    overagePrice: 900
  },
  standard: {
    id: "standard",
    label: "정식 요금",
    badge: "STANDARD",
    headline: "기본 월 구독 요금",
    basePrice: 149000,
    includedCustomers: 50,
    overagePrice: 1400
  }
};

const PRICING_EXAMPLE_COUNTS = [100, 200, 300];

const LANDING_HERO_POINTS = [
  {
    label: "한전 메일",
    value: "자동 확인",
    description: "매월 반복 확인 시간을 줄입니다."
  },
  {
    label: "전자세금계산서",
    value: "초안 자동 생성",
    description: "담당자는 검수와 발행에 집중합니다."
  },
  {
    label: "운영 방식",
    value: "검수 후 발행",
    description: "안정화 후 자동 발행으로 전환할 수 있습니다."
  }
];

const MAIL_PROVIDER_CONFIG: Record<
  MailProvider,
  {
    label: string;
    imapHost: string;
    imapPort: string;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: string;
    smtpSecure: boolean;
    defaultMailbox: string;
  }
> = {
  gmail: {
    label: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  },
  naver: {
    label: "네이버 메일",
    imapHost: "imap.naver.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.naver.com",
    smtpPort: "587",
    smtpSecure: false,
    defaultMailbox: "INBOX"
  },
  daum: {
    label: "다음 메일",
    imapHost: "imap.daum.net",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.daum.net",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  }
};

function getTabFromHash(hash: string): TabId | null {
  const value = hash.replace(/^#/, "");

  if (value === "initial" || value === "onboarding") {
    return "onboarding";
  }

  if (value === "work" || value === "home") {
    return "home";
  }

  if (value === "certificates" || value === "settings") {
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
  const fallback = options.hasActiveWorkspace ? (options.onboardingComplete ? "home" : "onboarding") : "ops";

  if (requestedTab === "ops") {
    return options.isPlatformAdmin ? "ops" : fallback;
  }

  if (!options.hasActiveWorkspace) {
    return options.isPlatformAdmin ? "ops" : "onboarding";
  }

  if (options.onboardingComplete) {
    if (requestedTab === "onboarding" || requestedTab === null) {
      return "home";
    }

    if (requestedTab === "home" || requestedTab === "customers" || requestedTab === "settings") {
      return requestedTab;
    }

    return "home";
  }

  if (requestedTab === "settings") {
    return "settings";
  }

  return "onboarding";
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

function settingsToForm(settings: AppSettings): SettingsFormState {
  const detectedProvider = inferMailProviderFromAddress(
    settings.imapUser || settings.smtpUser || settings.smtpFromEmail,
    inferMailProvider(settings)
  );
  return {
    mailProvider: detectedProvider,
    imapHost: settings.imapHost,
    imapPort: String(settings.imapPort),
    imapSecure: settings.imapSecure,
    mailAddress: settings.imapUser || settings.smtpUser || settings.smtpFromEmail,
    mailPassword: "",
    imapMailbox: settings.imapMailbox,
    smtpHost: settings.smtpHost,
    smtpPort: String(settings.smtpPort),
    smtpSecure: settings.smtpSecure,
    notificationEmailsText: settings.notificationEmails.join("\n"),
    defaultIssueDay: String(settings.defaultIssueDay),
    defaultIssueHour: String(settings.defaultIssueHour),
    defaultIssueMinute: String(settings.defaultIssueMinute),
    mailPollMinutes: String(settings.mailPollMinutes),
    mailSyncStartAt: "",
    timezone: settings.timezone,
    popbillUserIdPrefix: shouldShowPopbillPrefixPlaceholder(settings) ? "" : settings.popbillUserIdPrefix,
    popbillSharedPassword: "",
    operatorContactName: settings.operatorContactName,
    operatorContactEmail: settings.operatorContactEmail,
    operatorContactTel: settings.operatorContactTel,
    renewalContactDepartment: settings.renewalContactDepartment,
    renewalContactFax: settings.renewalContactFax,
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: settings.schedulerEnabled
  };
}

function normalizeRenewalIssuePasswordInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function isLikelyEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function getDraftStatusLabel(status: string): string {
  switch (status) {
    case "review":
      return "검수 대기";
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
  return issueMode === "auto" ? "월 자동 발행" : "검수 후 발행";
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

function getWorkspaceMemberRoleLabel(role: OrganizationMemberSummary["role"]): string {
  return role === "owner" ? "소유자" : "멤버";
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

function normalizeManagedCustomerCount(value: string): number {
  const digits = value.replace(/[^\d]/g, "");
  return digits === "" ? 0 : Number.parseInt(digits, 10);
}

function calculatePublicPrice(planId: PublicPricingPlanId, managedCustomerCount: number) {
  const plan = PUBLIC_PRICING_PLANS[planId];
  const normalizedCount = Number.isFinite(managedCustomerCount) ? Math.max(0, Math.floor(managedCustomerCount)) : 0;
  const overageCount = Math.max(0, normalizedCount - plan.includedCustomers);
  const overagePrice = overageCount * plan.overagePrice;

  return {
    plan,
    managedCustomerCount: normalizedCount,
    includedCustomers: plan.includedCustomers,
    overageCount,
    overagePrice,
    totalPrice: plan.basePrice + overagePrice
  };
}

function shouldReplaceSupportRequestMessage(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || trimmed.startsWith("예상 관리 고객 수:");
}

function buildSupportRequestPrefill(planId: PublicPricingPlanId, managedCustomerCount: number): string {
  const pricing = calculatePublicPrice(planId, managedCustomerCount);

  return [
    `예상 관리 고객 수: ${pricing.managedCustomerCount.toLocaleString("ko-KR")}곳`,
    `희망 요금 기준: ${pricing.plan.label}`,
    `예상 월 구독료: ${formatMoney(pricing.totalPrice)}원`,
    "",
    "도입 상담을 받고 싶습니다."
  ].join("\n");
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

function formatRenewalBridgeSummary(agent: RenewalAgentSnapshot): string {
  if (agent.bridge.ports.length === 0) {
    return "포트 진단 전";
  }

  return agent.bridge.ports
    .map((port) => `${port.port}/${port.protocol} ${port.reachable ? "연결됨" : "실패"}`)
    .join(" · ");
}

function formatRenewalVersionSummary(agent: RenewalAgentSnapshot): string {
  const versionProbe = agent.bridge.versionProbe;
  if (!versionProbe.ok) {
    return versionProbe.error ?? "GetVersion 미실행";
  }

  return [
    `secukitNX ${versionProbe.values.secukitNX ?? "-"}`,
    `kpmcnt ${versionProbe.values.kpmcnt ?? "-"}`,
    `kpmsvc ${versionProbe.values.kpmsvc ?? "-"}`
  ].join(" · ");
}

function formatRenewalLicenseSummary(agent: RenewalAgentSnapshot): string {
  const licenseProbe = agent.bridge.licenseProbe;
  if (!licenseProbe.ok) {
    return licenseProbe.error ?? "라이선스 미검증";
  }

  return `정상 (${licenseProbe.sourcePort ?? "-"})`;
}

function formatRenewalStorageSummary(agent: RenewalAgentSnapshot): string {
  const storageProbe = agent.bridge.storageProbe;
  if (!storageProbe.ok) {
    return storageProbe.error ?? "HDD 인증서 미조회";
  }

  if (storageProbe.certificateCount === 0) {
    return "인증서 없음";
  }

  const preview = storageProbe.certificates
    .slice(0, 2)
    .map((certificate) => `${certificate.cn || "이름 없음"} (${certificate.todate ?? "-"})`)
    .join(" · ");
  const suffix = storageProbe.certificateCount > 2 ? ` 외 ${storageProbe.certificateCount - 2}건` : "";
  return `${storageProbe.certificateCount}건 · ${preview}${suffix}`;
}

function isElectronicTaxCertificate(certificate: RenewalAgentCertificate): boolean {
  return certificate.usageToName.includes("전자세금");
}

function deriveCustomerCertificateKind(certificate: Pick<RenewalAgentCertificate, "usageToName">): CustomerCertificateKind {
  const usageName = certificate.usageToName.trim();
  if (usageName.includes("전자세금")) {
    return "electronic_tax";
  }
  if (usageName.includes("개인") && usageName.includes("범용")) {
    return "general_personal";
  }
  if (usageName.includes("사업자") && usageName.includes("범용")) {
    return "general_business";
  }
  return "unknown";
}

function normalizeCustomerCertificateFingerprint(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function matchesStoredCustomerCertificate(
  storedCertificate: CustomerCertificate,
  certificate: RenewalAgentCertificate
): boolean {
  const certificateSerial = normalizeCustomerCertificateFingerprint(certificate.serial);
  const storedSerial = normalizeCustomerCertificateFingerprint(storedCertificate.serial);
  if (certificateSerial && storedSerial) {
    return certificateSerial === storedSerial;
  }

  const certificateUserDn = normalizeCustomerCertificateFingerprint(certificate.userDN);
  const storedUserDn = normalizeCustomerCertificateFingerprint(storedCertificate.userDN);
  if (certificateUserDn && storedUserDn) {
    return certificateUserDn === storedUserDn;
  }

  const usageName = normalizeCustomerRenewalName(storedCertificate.certificateUsageName);
  const localUsageName = normalizeCustomerRenewalName(certificate.usageToName);

  return (
    storedCertificate.certificateKind === deriveCustomerCertificateKind(certificate) &&
    normalizeCustomerRenewalName(storedCertificate.certificateName) === normalizeCustomerRenewalName(certificate.cn) &&
    (usageName === "" || localUsageName === "" || usageName === localUsageName)
  );
}

function formatRenewalSelectionSummary(agent: RenewalAgentSnapshot): string {
  const selectionProbe = agent.bridge.selectionProbe;
  if (
    !selectionProbe.ok &&
    !selectionProbe.error &&
    !selectionProbe.certificateIndex &&
    !selectionProbe.certificateCn &&
    !selectionProbe.certID
  ) {
    return "certID 미조회";
  }

  const label = selectionProbe.certificateCn || (selectionProbe.certificateIndex ? `인증서 #${selectionProbe.certificateIndex}` : "인증서");
  if (selectionProbe.ok) {
    return `${label} · ${selectionProbe.certID ?? "-"}`;
  }

  return `${label} · ${selectionProbe.error ?? "조회 실패"}`;
}

function formatRenewalPreflightSummary(agent: RenewalAgentSnapshot): string {
  const preflightProbe = agent.bridge.preflightProbe;
  if (
    !preflightProbe.ok &&
    !preflightProbe.error &&
    !preflightProbe.message &&
    !preflightProbe.certificateIndex &&
    !preflightProbe.certificateCn
  ) {
    return "갱신 경로 미분석";
  }

  const label = preflightProbe.certificateCn || (preflightProbe.certificateIndex ? `인증서 #${preflightProbe.certificateIndex}` : "인증서");
  if (preflightProbe.ok) {
    const branchText =
      preflightProbe.branch === "change-company" && preflightProbe.externalFlowKind === "apply-form"
        ? `순정 갱신 아님 (${preflightProbe.issueCompany ?? "-"} -> 외부 신규신청)`
        : preflightProbe.branch === "change-company"
          ? `기관변경 필요 (${preflightProbe.issueCompany ?? "-"})`
          : preflightProbe.branch === "renew-payment"
            ? "순정 갱신 · 결제 단계"
            : preflightProbe.branch === "password-confirm"
              ? "순정 갱신 · 발급 직전 비밀번호 확인"
            : preflightProbe.branch === "renew-info"
              ? "순정 갱신 · 신청정보 입력"
              : preflightProbe.branch;
    const externalFlowText =
      preflightProbe.branch === "change-company" && preflightProbe.externalFlowKind === "apply-form"
        ? `외부 신규신청형${preflightProbe.externalFlowProductName ? ` (${preflightProbe.externalFlowProductName})` : ""}`
        : null;
    const urlText = preflightProbe.externalFlowSubmitUrl ?? preflightProbe.nextUrl;
    const autoSubmitText = preflightProbe.renewInfoAutoSubmitSummary;
    const submitReadyText =
      preflightProbe.renewInfoSubmitSummary &&
      preflightProbe.renewInfoSubmitSummary !== autoSubmitText
        ? preflightProbe.renewInfoSubmitSummary
        : null;
    return `${label} · ${branchText}${externalFlowText ? ` · ${externalFlowText}` : ""}${autoSubmitText ? ` · ${autoSubmitText}` : ""}${submitReadyText ? ` · ${submitReadyText}` : ""}${urlText ? ` · ${urlText}` : ""}`;
  }

  return `${label} · ${preflightProbe.error ?? preflightProbe.message ?? "분석 실패"}`;
}

function getLatestRenewalPreflightProbeForCertificate(
  certificate: RenewalAgentCertificate,
  jobs: RenewalJob[],
  agent?: RenewalAgentSnapshot | null
) {
  const latestJobProbe = jobs.find((job) => {
    if (job.type !== "renewal-preflight" || job.status !== "completed" || !job.result) {
      return false;
    }

    return matchesRenewalCertificate(certificate, job);
  })?.result?.bridge.preflightProbe;

  if (latestJobProbe) {
    return latestJobProbe;
  }

  const preflightProbe = agent?.bridge.preflightProbe;
  if (!preflightProbe || !matchesRenewalCertificate(certificate, preflightProbe)) {
    return null;
  }

  return preflightProbe;
}

function formatRenewalPathCell(
  certificate: RenewalAgentCertificate,
  jobs: RenewalJob[],
  agent?: RenewalAgentSnapshot | null
): string {
  const preflightProbe = getLatestRenewalPreflightProbeForCertificate(certificate, jobs, agent);
  if (!preflightProbe) {
    return "-";
  }
  if (!preflightProbe.ok) {
    return preflightProbe.error ?? preflightProbe.message ?? "분석 실패";
  }

  if (preflightProbe.branch === "change-company" && preflightProbe.externalFlowKind === "apply-form") {
    return `순정 갱신 아님 · ${preflightProbe.issueCompany ?? "-"} · ${preflightProbe.externalFlowProductName ?? "외부 신규신청"}`;
  }

  if (preflightProbe.branch === "renew-payment") {
    return "순정 갱신 · 이미 결제 단계";
  }

  if (preflightProbe.branch === "password-confirm") {
    return "순정 갱신 · 이미 발급 직전";
  }

  if (preflightProbe.branch === "renew-info") {
    const summaryParts = [
      preflightProbe.renewInfoAutoSubmitSummary,
      preflightProbe.renewInfoSubmitSummary
    ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
    return summaryParts.length > 0
      ? `순정 갱신 · 신청정보 입력 · ${summaryParts.join(" · ")}`
      : "순정 갱신 · 신청정보 입력";
  }

  return preflightProbe.nextUrl ?? preflightProbe.branch;
}

function formatCustomerDraftStatus(certificate: RenewalAgentCertificate, jobs: RenewalJob[]): string {
  const preflightProbe = getLatestRenewalPreflightProbeForCertificate(certificate, jobs, null);
  if (!preflightProbe) {
    return "정보 읽기 전";
  }
  if (!preflightProbe.ok) {
    return preflightProbe.error ?? preflightProbe.message ?? "정보 읽기 실패";
  }
  if (preflightProbe.renewInfoSnapshot) {
    return "고객 초안 정보 읽음";
  }
  return "고객 초안 정보 없음";
}

function formatRenewalJobStatusLabel(status: RenewalJob["status"]): string {
  if (status === "queued") return "대기";
  if (status === "claimed") return "실행 중";
  if (status === "completed") return "완료";
  return "실패";
}

function formatRenewalJobLabel(job: RenewalJob): string {
  if (job.type === "certid-probe") {
    return job.certificateCn || (job.certificateIndex !== null ? `certID 조회 #${job.certificateIndex}` : "certID 조회");
  }

  if (job.type === "renewal-preflight") {
    return job.certificateCn || (job.certificateIndex !== null ? `갱신 경로 분석 #${job.certificateIndex}` : "갱신 경로 분석");
  }

  return job.customerName ?? "인증서 목록 진단";
}

let localRenewalJobSeed = Date.now();

function nextLocalRenewalJobId(): number {
  localRenewalJobSeed += 1;
  return localRenewalJobSeed;
}

function buildLocalRenewalBridgeJob(
  result: RenewalAutomationPayload["jobs"][number]["result"],
  visibleCertificateCount?: number
): RenewalJob {
  const requestedAt = new Date().toISOString();
  const storageProbe = result?.bridge.storageProbe;
  const storageOk = storageProbe?.ok === true;
  const hasVisibleCertificateCount = typeof visibleCertificateCount === "number";
  const summary = !storageOk
    ? "공동인증서 불러오기에 실패했습니다."
    : hasVisibleCertificateCount
      ? visibleCertificateCount > 0
        ? `전자세금용 공동인증서 ${visibleCertificateCount}건을 불러왔습니다.`
        : "전자세금용 공동인증서를 찾지 못했습니다."
      : `공동인증서 ${storageProbe.certificateCount}건을 불러왔습니다.`;

  return {
    id: nextLocalRenewalJobId(),
    type: "bridge-probe",
    status: storageOk ? "completed" : "failed",
    customerId: null,
    customerName: "공동인증서 목록",
    certificateIndex: null,
    certificateCn: null,
    requestedAt,
    claimedAt: requestedAt,
    finishedAt: requestedAt,
    requestedBy: "localhost-helper",
    claimedBy: "localhost-helper",
    summary,
    error: storageOk ? null : storageProbe?.error ?? result?.notes[0] ?? "공동인증서 불러오기에 실패했습니다.",
    result
  };
}

function buildLocalRenewalPreflightJob(
  certificate: RenewalAgentCertificate,
  result: RenewalAutomationPayload["jobs"][number]["result"]
): RenewalJob {
  const requestedAt = new Date().toISOString();
  const preflightProbe = result?.bridge.preflightProbe;
  const certificateLabel = certificate.cn || `인증서 #${certificate.index}`;
  const summary =
    preflightProbe?.ok === true
      ? preflightProbe.renewInfoSnapshot
        ? `${certificateLabel} 고객 초안 정보를 읽었습니다.`
        : `${certificateLabel} 고객 초안 정보를 읽지 못했습니다.`
      : `${certificateLabel} 정보 읽기에 실패했습니다.`;
  const error =
    preflightProbe?.ok === true
      ? null
      : preflightProbe?.error ??
        result?.bridge.selectionProbe.error ??
        preflightProbe?.message ??
        "공동인증서 정보 읽기에 실패했습니다.";

  return {
    id: nextLocalRenewalJobId(),
    type: "renewal-preflight",
    status: preflightProbe?.ok === true ? "completed" : "failed",
    customerId: null,
    customerName: null,
    certificateIndex: Number(certificate.index),
    certificateCn: certificate.cn || null,
    requestedAt,
    claimedAt: requestedAt,
    finishedAt: requestedAt,
    requestedBy: "localhost-helper",
    claimedBy: "localhost-helper",
    summary,
    error,
    result
  };
}

function getDraftConfirmNumber(draft: InvoiceDraft): string | null {
  if (!draft.popbillResultJson) return null;

  try {
    const parsed = JSON.parse(draft.popbillResultJson) as Record<string, unknown>;
    const confirmValue = parsed.ntsConfirmNum ?? parsed.NTSConfirmNum ?? parsed.confirmNum ?? parsed.confirmNumber;
    return typeof confirmValue === "string" && confirmValue.trim() !== "" ? confirmValue.trim() : null;
  } catch {
    return null;
  }
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeRenewalCertificateKey(value: string | number | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function matchesRenewalCertificate(
  certificate: RenewalAgentCertificate,
  target: {
    certificateIndex?: string | number | null;
    certificateCn?: string | null;
  }
): boolean {
  const certificateIndex = normalizeRenewalCertificateKey(certificate.index);
  const targetIndex = normalizeRenewalCertificateKey(target.certificateIndex);
  if (certificateIndex !== "" && targetIndex !== "") {
    return certificateIndex === targetIndex;
  }

  const certificateCn = normalizeRenewalCertificateKey(certificate.cn);
  const targetCn = normalizeRenewalCertificateKey(target.certificateCn);
  return certificateCn !== "" && targetCn !== "" && certificateCn === targetCn;
}

function normalizeCustomerRenewalName(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function normalizeCustomerRenewalAddress(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function matchesCustomerRenewalCertificateName(
  certificate: RenewalAgentCertificate,
  customer: Customer
): boolean {
  const certificateName = normalizeCustomerRenewalName(certificate.cn);
  if (!certificateName) {
    return false;
  }

  return certificateName === normalizeCustomerRenewalName(customer.corpName) || certificateName === normalizeCustomerRenewalName(customer.customerName);
}

function selectCustomerRenewalCertificate(
  certificates: RenewalAgentCertificate[],
  customer: Customer
): RenewalAgentCertificate | null {
  const directMatches = certificates.filter((certificate) => matchesCustomerRenewalCertificateName(certificate, customer));
  const preferredMatches = directMatches.filter(isElectronicTaxCertificate);

  if (preferredMatches.length === 1) {
    return preferredMatches[0] ?? null;
  }
  if (preferredMatches.length > 1) {
    return null;
  }
  if (directMatches.length === 1) {
    return directMatches[0] ?? null;
  }

  return null;
}

function getLocalCertificateKey(certificate: RenewalAgentCertificate): string {
  const serial = normalizeCustomerCertificateFingerprint(certificate.serial);
  if (serial) {
    return `serial:${serial}`;
  }

  const userDN = normalizeCustomerCertificateFingerprint(certificate.userDN);
  if (userDN) {
    return `dn:${userDN}`;
  }

  return `index:${normalizeRenewalCertificateKey(certificate.index)}:${normalizeCustomerRenewalName(certificate.cn)}:${normalizeCustomerRenewalName(certificate.usageToName)}`;
}

function findStoredCustomerCertificateForLocalCertificate(
  certificate: RenewalAgentCertificate,
  customerCertificates: CustomerCertificate[]
): CustomerCertificate | null {
  const matches = customerCertificates.filter((storedCertificate) => matchesStoredCustomerCertificate(storedCertificate, certificate));
  if (matches.length === 1) {
    return matches[0] ?? null;
  }
  const primaryMatch = matches.find((storedCertificate) => storedCertificate.isPrimary);
  return primaryMatch ?? matches[0] ?? null;
}

function getStoredCustomerCertificateKey(storedCertificate: CustomerCertificate): string {
  return `stored:${storedCertificate.id}`;
}

function parseStoredCustomerCertificateKey(value: string): number | null {
  if (!value.startsWith("stored:")) {
    return null;
  }

  const parsed = Number(value.slice("stored:".length));
  return Number.isFinite(parsed) ? parsed : null;
}

function findLocalCertificateForStoredCustomerCertificate(
  storedCertificate: CustomerCertificate,
  certificates: RenewalAgentCertificate[]
): RenewalAgentCertificate | null {
  const matches = certificates.filter((certificate) => matchesStoredCustomerCertificate(storedCertificate, certificate));
  if (matches.length === 1) {
    return matches[0] ?? null;
  }

  const primaryMatch = matches.find((certificate) => isElectronicTaxCertificate(certificate));
  return primaryMatch ?? matches[0] ?? null;
}

function findCandidateCustomersForCertificate(
  certificate: RenewalAgentCertificate,
  customers: Customer[]
): Customer[] {
  const certificateName = normalizeCustomerRenewalName(certificate.cn);
  if (!certificateName) {
    return [];
  }

  const kind = deriveCustomerCertificateKind(certificate);
  if (kind === "general_personal" || kind === "general_business") {
    return [];
  }

  const matches = customers.filter((customer) => {
    const matchesCorpName = certificateName === normalizeCustomerRenewalName(customer.corpName);
    const matchesCustomerName = certificateName === normalizeCustomerRenewalName(customer.customerName);

    return matchesCorpName || matchesCustomerName;
  });

  return matches;
}

function isRenewalPaymentReady(
  preflightProbe: RenewalBridgePreflightProbe | null
): boolean {
  if (!preflightProbe?.ok) {
    return false;
  }

  return preflightProbe.branch === "renew-payment" || preflightProbe.renewInfoSubmitResultBranch === "renew-payment";
}

function formatCustomerRenewalStatus(
  preflightProbe: RenewalBridgePreflightProbe | null
): Pick<CustomerRenewalCandidateView, "statusText" | "statusTone" | "paymentAmount" | "canOpenPayment"> {
  if (!preflightProbe) {
    return {
      statusText: "갱신 전",
      statusTone: "default",
      paymentAmount: null,
      canOpenPayment: false
    };
  }

  const paymentAmount = preflightProbe.renewInfoPaymentPreviewTotalAmount ?? null;
  if (!preflightProbe.ok) {
    return {
      statusText: preflightProbe.error ?? preflightProbe.message ?? "갱신 준비 실패",
      statusTone: "danger",
      paymentAmount,
      canOpenPayment: false
    };
  }

  if (isRenewalPaymentReady(preflightProbe)) {
    return {
      statusText:
        preflightProbe.renewInfoSubmitResultBranch === "renew-payment"
          ? "갱신 신청 완료 · 결제 대기"
          : "이미 결제 단계",
      statusTone: "success",
      paymentAmount,
      canOpenPayment: true
    };
  }

  if (preflightProbe.renewInfoSubmitAttempted) {
    return {
      statusText:
        preflightProbe.renewInfoSubmitResultError ??
        preflightProbe.renewInfoSubmitResultSummary ??
        preflightProbe.renewInfoSubmitSummary ??
        preflightProbe.renewInfoAutoSubmitSummary ??
        "갱신 신청정보 제출 결과 확인 필요",
      statusTone: preflightProbe.renewInfoSubmitResultError ? "danger" : "warn",
      paymentAmount,
      canOpenPayment: false
    };
  }

  if (preflightProbe.branch === "renew-info") {
    return {
      statusText:
        preflightProbe.renewInfoSubmitSummary ??
        preflightProbe.renewInfoAutoSubmitSummary ??
        "신청정보 입력 단계",
      statusTone:
        preflightProbe.renewInfoSubmitReady === false || preflightProbe.renewInfoAutoSubmitReady === false
          ? "warn"
          : "success",
      paymentAmount,
      canOpenPayment: false
    };
  }

  if (preflightProbe.branch === "change-company") {
    return {
      statusText:
        preflightProbe.externalFlowKind === "apply-form"
          ? `순정 갱신 아님 · ${preflightProbe.externalFlowProductName ?? "외부 신규신청"}`
          : `기관변경 필요 · ${preflightProbe.issueCompany ?? "-"}`,
      statusTone: "danger",
      paymentAmount,
      canOpenPayment: false
    };
  }

  if (preflightProbe.branch === "password-confirm") {
    return {
      statusText: "이미 발급 직전 단계",
      statusTone: "warn",
      paymentAmount,
      canOpenPayment: false
    };
  }

  return {
    statusText: preflightProbe.nextUrl ?? preflightProbe.branch,
    statusTone: "default",
    paymentAmount,
    canOpenPayment: false
  };
}

function getRenewalSnapshotAddress(snapshot: RenewalInfoSnapshot): string {
  const baseAddress = snapshot.baseAddress?.trim() ?? "";
  const detailAddress = snapshot.detailAddress?.trim() ?? "";
  if (baseAddress) {
    return baseAddress;
  }
  return [baseAddress, detailAddress].filter(Boolean).join(" ").trim();
}

function getRenewalSnapshotMatchName(
  certificate: RenewalAgentCertificate,
  snapshot: RenewalInfoSnapshot | null | undefined
): string {
  return (
    snapshot?.companyName?.trim() ||
    snapshot?.ceoName?.trim() ||
    certificate.cn?.trim() ||
    ""
  );
}

function matchesCustomerCertificateAutoLinkFromSnapshot(
  certificate: RenewalAgentCertificate,
  snapshot: RenewalInfoSnapshot | null | undefined,
  customer: Pick<Customer, "customerName" | "corpName" | "addr">
): boolean {
  if (!snapshot) {
    return false;
  }

  const matchName = normalizeCustomerRenewalName(getRenewalSnapshotMatchName(certificate, snapshot));
  const matchAddress = normalizeCustomerRenewalAddress(getRenewalSnapshotAddress(snapshot));
  if (!matchName || !matchAddress) {
    return false;
  }

  const kind = deriveCustomerCertificateKind(certificate);
  const matchesCustomerName = matchName === normalizeCustomerRenewalName(customer.customerName);
  const matchesCorpName = matchName === normalizeCustomerRenewalName(customer.corpName);
  const matchesAddress = matchAddress === normalizeCustomerRenewalAddress(customer.addr);

  if (!matchesAddress) {
    return false;
  }

  if (kind === "general_personal") {
    return matchesCustomerName;
  }

  return matchesCorpName || matchesCustomerName;
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

function normalizeRenewalPreflightDetail(value: string | null | undefined): string {
  const raw = String(value ?? "");
  if (!raw) {
    return "";
  }

  const text = raw
    .replace(/\\n/g, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const curlIndex = text.indexOf("curl:");
  const relevantText = curlIndex >= 0 ? text.slice(curlIndex) : text;
  return relevantText.replace(/\s+/g, " ").trim();
}

function normalizeRenewalCertificateExpireDate(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] ?? null : null;
}

function getTodayDateKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRenewalCertificateExpiredDate(value: string | null | undefined): boolean {
  const normalized = normalizeRenewalCertificateExpireDate(value);
  if (!normalized) {
    return false;
  }

  return normalized < getTodayDateKey();
}

function buildRenewalPreflightFailureMessage(prefix: string, _detail: string, _fallback: string): string {
  return prefix;
}

function isRenewalWindowPendingDetail(detail: string): boolean {
  return detail.includes("갱신 가능 기간은") || detail.includes("갱신가능 기간은");
}

function isRenewalWindowEndedDetail(detail: string): boolean {
  return detail.includes("갱신가능 기간이 종료") || detail.includes("갱신 가능 기간이 종료");
}

function isRenewalIssueInfoMissingDetail(detail: string): boolean {
  return detail.includes("발급정보를 찾을수 없습니다") || detail.includes("발급정보를 찾을 수 없습니다");
}

function isRenewalSelectionMissingDetail(detail: string): boolean {
  return detail.includes("선택하신 인증서가 없습니다") || detail.includes("인증서를 선택해 주십시오");
}

function isRenewalPasswordFailureDetail(detail: string): boolean {
  return detail.includes("비밀번호");
}

function isRenewalBridgeConnectionFailureDetail(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("failed to connect to 127.0.0.1 port") ||
    normalized.includes("could not connect to server") ||
    normalized.includes("connection was reset") ||
    normalized.includes("recv failure")
  );
}

function classifyOnboardingPreflightImportDecision(
  preflightProbe: RenewalBridgePreflightProbe | null | undefined,
  options?: {
    certificateExpireDate?: string | null;
  }
): OnboardingPreflightImportDecision {
  const snapshot = preflightProbe?.renewInfoSnapshot ?? null;
  const detail = normalizeRenewalPreflightDetail(preflightProbe?.error ?? preflightProbe?.message ?? "");

  if (preflightProbe?.ok && snapshot) {
    return {
      canImport: true,
      snapshot,
      acceptedBeforeWindow: false
    };
  }

  if (isRenewalWindowPendingDetail(detail) && snapshot) {
    return {
      canImport: true,
      snapshot,
      acceptedBeforeWindow: true
    };
  }

  if (isRenewalCertificateExpiredDate(options?.certificateExpireDate) || isRenewalWindowEndedDetail(detail)) {
    return {
      canImport: false,
      failureMessage: "인증서 만료"
    };
  }

  if (isRenewalWindowEndedDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage("기간종료", detail, "갱신가능 기간이 종료되었습니다.")
    };
  }

  if (preflightProbe?.ok && snapshot) {
    return {
      canImport: true,
      snapshot,
      acceptedBeforeWindow: false
    };
  }

  if (isRenewalWindowPendingDetail(detail) && snapshot) {
    return {
      canImport: true,
      snapshot,
      acceptedBeforeWindow: true
    };
  }

  if (isRenewalIssueInfoMissingDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "발급정보 없음",
        detail,
        "SignGate에서 사업자 발급정보를 찾지 못했습니다."
      )
    };
  }

  if (isRenewalPasswordFailureDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "비밀번호 오류",
        detail,
        "인증서 비밀번호 확인에 실패했습니다."
      )
    };
  }

  if (isRenewalSelectionMissingDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "인증서 선택 실패",
        detail,
        "선택한 공동인증서를 열지 못했습니다."
      )
    };
  }

  if (isRenewalBridgeConnectionFailureDetail(detail)) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "브리지 연결 실패",
        detail,
        "SignGate 로컬 포트(14315/14319)에 연결하지 못했습니다."
      )
    };
  }

  if (!snapshot) {
    return {
      canImport: false,
      failureMessage: buildRenewalPreflightFailureMessage(
        "사전조회 실패",
        detail,
        "사업자 정보를 읽지 못했습니다."
      )
    };
  }

  return {
    canImport: false,
    failureMessage: buildRenewalPreflightFailureMessage(
      "사전조회 실패",
      detail,
      "등록 가능 상태를 확인하지 못했습니다."
    )
  };
}

function getCustomerOnboardingTemplateCertificateLabel(row: {
  certificateIndex: string;
  certificateName: string;
}) {
  return row.certificateName.trim() || (row.certificateIndex.trim() ? `인증서 #${row.certificateIndex.trim()}` : "인증서");
}

function deriveCustomerOnboardingTemplateCertificateKind(row: {
  certificateKindLabel: string;
  usageName: string;
}): CustomerCertificateKind {
  const normalized = `${row.certificateKindLabel} ${row.usageName}`.replace(/\s+/g, "");
  if (normalized.includes("전자세금")) {
    return "electronic_tax";
  }
  if (normalized.includes("개인") && normalized.includes("범용")) {
    return "general_personal";
  }
  if (normalized.includes("사업자") && normalized.includes("범용")) {
    return "general_business";
  }
  return "unknown";
}

function findMatchingRenewalCertificateFromList(
  certificates: RenewalAgentCertificate[],
  selection: {
    certificateIndex: string;
    certificateName: string;
  }
): RenewalAgentCertificate | null {
  return (
    certificates.find((certificate) =>
      matchesRenewalCertificate(certificate, {
        certificateIndex: selection.certificateIndex,
        certificateCn: selection.certificateName
      })
    ) ??
    certificates.find(
      (certificate) =>
        normalizeRenewalCertificateKey(certificate.cn) === normalizeRenewalCertificateKey(selection.certificateName)
    ) ??
    null
  );
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

function inferMailProvider(settings: Pick<AppSettings, "imapHost" | "smtpHost">): MailProvider {
  const imapHost = settings.imapHost.trim().toLowerCase();
  const smtpHost = settings.smtpHost.trim().toLowerCase();

  if (imapHost.includes("naver") || smtpHost.includes("naver")) return "naver";
  if (imapHost.includes("daum") || smtpHost.includes("daum")) return "daum";
  return "gmail";
}

function inferMailProviderFromAddress(address: string, fallback: MailProvider = "gmail"): MailProvider {
  const normalized = address.trim().toLowerCase();

  if (!normalized.includes("@")) {
    return fallback;
  }

  if (normalized.endsWith("@naver.com")) return "naver";
  if (normalized.endsWith("@daum.net") || normalized.endsWith("@hanmail.net")) return "daum";
  if (normalized.endsWith("@gmail.com")) return "gmail";

  return fallback;
}

function applyMailProviderDefaults(
  setter: React.Dispatch<React.SetStateAction<SettingsFormState | null>>,
  provider: MailProvider
) {
  const config = MAIL_PROVIDER_CONFIG[provider];
  setter((prev) =>
    prev
      ? {
          ...prev,
          mailProvider: provider,
          imapHost: config.imapHost,
          imapPort: config.imapPort,
          imapSecure: config.imapSecure,
          imapMailbox: prev.imapMailbox || config.defaultMailbox,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpSecure: config.smtpSecure
        }
      : prev
  );
}

function withSelectedMailProviderSettings(form: SettingsFormState) {
  const detectedProvider = inferMailProviderFromAddress(form.mailAddress, form.mailProvider);
  const config = MAIL_PROVIDER_CONFIG[detectedProvider];
  return {
    ...form,
    mailProvider: detectedProvider,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapSecure: config.imapSecure,
    imapMailbox: config.defaultMailbox,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure
  };
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
  const [recoveryPasswordForm, setRecoveryPasswordForm] = useState<PasswordResetFormState>(basePasswordResetForm);
  const [showSupportRequestForm, setShowSupportRequestForm] = useState(false);
  const [supportRequestBusy, setSupportRequestBusy] = useState(false);
  const [supportRequestForm, setSupportRequestForm] = useState<SupportRequestFormState>(baseSupportRequestForm);
  const [pricingPlanId, setPricingPlanId] = useState<PublicPricingPlanId>("standard");
  const [managedCustomerCountInput, setManagedCustomerCountInput] = useState("220");
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [opsConsole, setOpsConsole] = useState<OpsConsoleData | null>(null);
  const [customerRenewalAssistant, setCustomerRenewalAssistant] = useState<CustomerRenewalAssistantData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    return getTabFromHash(hash) ?? "home";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [requestedOnboardingStepId, setRequestedOnboardingStepId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormDefaults());
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerListFilter, setCustomerListFilter] = useState<CustomerListFilter>("all");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerDetailTab, setCustomerDetailTab] = useState<CustomerDetailTabId>("info");
  const [workFeedTab, setWorkFeedTab] = useState<"inbox" | "issued">("inbox");
  const [settingsForm, setSettingsForm] = useState<SettingsFormState | null>(null);
  const [passwordChangeForm, setPasswordChangeForm] = useState<PasswordChangeFormState>(basePasswordChangeForm);
  const [passwordResetForm, setPasswordResetForm] = useState<PasswordResetFormState>(basePasswordResetForm);
  const [passwordResetTarget, setPasswordResetTarget] = useState<PasswordResetTarget | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMemberSummary[]>([]);
  const [organizationMemberForm, setOrganizationMemberForm] = useState<OrganizationMemberFormState>(baseOrganizationMemberForm);
  const [opsWorkspaceForm, setOpsWorkspaceForm] = useState<OpsWorkspaceFormState>(baseOpsWorkspaceForm);
  const [workspaceLimitEdits, setWorkspaceLimitEdits] = useState<Record<string, string>>({});
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("gmail");
  const [settingsAutosaveState, setSettingsAutosaveState] = useState<SettingsAutosaveState>("idle");
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
  const [customerOnboardingTemplateWorkbook, setCustomerOnboardingTemplateWorkbook] =
    useState<CustomerOnboardingTemplateWorkbookInput | null>(null);
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
  const settingsAutosaveBaselineRef = useRef("");
  const appDialogResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const customerAddressLookupRef = useRef("");
  const customerRenewalPasswordRef = useRef("");
  const customerRenewalIssuePasswordRef = useRef("");
  const customerCertificatePasswordCacheRef = useRef<Record<number, string>>({});
  const customerOnboardingCertificatesRef = useRef<RenewalAgentCertificate[] | null>(null);
  const customerRenewalAutoLoadedRef = useRef(false);
  const customerRenewalAutoLoadedOrganizationRef = useRef<string | null>(null);
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
  const publicManagedCustomerCount = normalizeManagedCustomerCount(managedCustomerCountInput);
  const publicPricing = calculatePublicPrice(pricingPlanId, publicManagedCustomerCount);
  const deferredCustomerSearchQuery = useDeferredValue(customerSearchQuery);
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

  const getCustomerRenewalAssistantReleaseMetadata = (
    current?: CustomerRenewalAssistantData | null
  ): LocalRenewalHelperReleaseMetadata | null => {
    if (!current?.latestVersion || !current.minSupportedVersion || !current.releaseDownloadUrl || !current.releaseReleasedAt) {
      return null;
    }

    return {
      latestVersion: current.latestVersion,
      minSupportedVersion: current.minSupportedVersion,
      downloadUrl: current.releaseDownloadUrl,
      releasedAt: current.releaseReleasedAt
    };
  };

  const buildCustomerRenewalAssistant = (options: {
    current?: CustomerRenewalAssistantData | null;
    status?: {
      online: boolean;
      version: string | null;
      message: string;
    };
    helperVersion?: string | null;
    helperMessage?: string;
    jobs?: RenewalJob[];
    certificates?: RenewalAgentCertificate[];
    releaseMetadata?: LocalRenewalHelperReleaseMetadata | null;
  }): CustomerRenewalAssistantData => {
    const metadata = options.releaseMetadata ?? null;
    const helperVersion = options.helperVersion ?? options.status?.version ?? options.current?.helperVersion ?? null;
    const upgrade = evaluateLocalRenewalHelperUpgrade(helperVersion, metadata);

    return {
      agentOnline: options.status?.online ?? options.current?.agentOnline ?? false,
      helperVersion,
      helperMessage: options.helperMessage ?? options.status?.message ?? options.current?.helperMessage ?? "공동인증서를 읽어 헬퍼 연결을 확인하세요.",
      helperCheckedAt: new Date().toISOString(),
      latestVersion: metadata?.latestVersion ?? null,
      minSupportedVersion: metadata?.minSupportedVersion ?? null,
      releaseDownloadUrl: metadata?.downloadUrl || defaultRenewalHelperDownloadUrl,
      releaseReleasedAt: metadata?.releasedAt ?? null,
      upgradeState: upgrade.upgradeState,
      upgradeMessage: upgrade.upgradeMessage,
      jobs: options.jobs ?? options.current?.jobs ?? [],
      certificates: options.certificates ?? options.current?.certificates ?? []
    };
  };

  const ensureLocalRenewalHelperActionAllowed = (actionLabel: string) => {
    if (customerRenewalAssistant?.upgradeState !== "upgrade-required") {
      return;
    }

    const helperVersionLabel = customerRenewalAssistant.helperVersion ? `v${customerRenewalAssistant.helperVersion}` : "현재 버전";
    throw new Error(
      `${actionLabel} 전에 로컬 헬퍼를 다시 설치하세요. ${customerRenewalAssistant.upgradeMessage ?? `${helperVersionLabel}은(는) 지원되지 않습니다.`} 압축을 다시 받아 ${
        "scripts\\renewal-helper-install.cmd"
      } 를 실행한 뒤 상태를 다시 확인하세요.`
    );
  };

  const loadCustomerRenewalAssistant = async (
    current?: CustomerRenewalAssistantData | null
  ): Promise<CustomerRenewalAssistantData> => {
    const [status, releaseMetadata] = await Promise.all([
      getLocalRenewalHelperStatus(),
      getLocalRenewalHelperReleaseMetadata()
    ]);
    return buildCustomerRenewalAssistant({
      current,
      status,
      releaseMetadata
    });
  };

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

  const buildIdleCustomerRenewalAssistant = (
    current?: CustomerRenewalAssistantData | null
  ): CustomerRenewalAssistantData =>
    current
      ? {
          ...current,
          helperMessage: current.helperMessage || "공동인증서를 읽어 헬퍼 연결을 확인하세요."
        }
      : {
          agentOnline: false,
          helperVersion: null,
          helperMessage: "공동인증서를 읽어 헬퍼 연결을 확인하세요.",
          helperCheckedAt: null,
          latestVersion: null,
          minSupportedVersion: null,
          releaseDownloadUrl: defaultRenewalHelperDownloadUrl,
          releaseReleasedAt: null,
          upgradeState: "unknown",
          upgradeMessage: null,
          jobs: [],
          certificates: []
        };

  const loadOrganizationMembers = async (payload: BootstrapPayload, loadToken: number) => {
    if (payload.auth.activeOrganizationRole !== "owner") {
      setOrganizationMembers([]);
      return;
    }

    ensureActiveLoad(loadToken);
    const members = await api<OrganizationMemberSummary[]>("/api/organization/members");
    ensureActiveLoad(loadToken);
    setOrganizationMembers(members);
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
    const nextCustomerRenewalAssistant =
      payload.auth.activeOrganizationId && payload.auth.activeOrganizationRole !== "viewer"
        ? buildIdleCustomerRenewalAssistant(customerRenewalAssistant)
        : null;
    setError("");
    setActiveOrganizationId(payload.auth.activeOrganizationId);
    const nextSettingsForm = settingsToForm(payload.settings);
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
    setCustomerRenewalAssistant(nextCustomerRenewalAssistant);
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
    await loadOrganizationMembers(payload, loadToken);
    ensureActiveLoad(loadToken);
    setSettingsForm(nextSettingsForm);
    settingsAutosaveBaselineRef.current = JSON.stringify(buildSettingsPayload(nextSettingsForm).payload);
    setSettingsAutosaveState("saved");
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
        setOrganizationMembers([]);
        setSettingsForm(null);
        setAppDialog(null);
        appDialogResolverRef.current = null;
        settingsAutosaveBaselineRef.current = "";
        setSettingsAutosaveState("idle");
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
    if (activeTab !== "home") {
      return;
    }

    const hasPendingRenewalJobs = customerRenewalAssistant?.jobs.some(
      (job) => job.status === "queued" || job.status === "claimed"
    );
    if (!hasPendingRenewalJobs) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshCustomerRenewalAssistant().catch(() => undefined);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [activeTab, customerRenewalAssistant]);

  useEffect(() => {
    if (activeTab !== "settings") {
      customerRenewalAutoLoadedRef.current = false;
      customerRenewalAutoLoadedOrganizationRef.current = null;
      return;
    }

    const activeOrganizationId = data?.auth.activeOrganizationId ?? null;
    if (!activeOrganizationId || data?.auth.activeOrganizationRole === "viewer") {
      customerRenewalAutoLoadedRef.current = false;
      customerRenewalAutoLoadedOrganizationRef.current = null;
      return;
    }

    if (customerRenewalAutoLoadedOrganizationRef.current !== activeOrganizationId) {
      customerRenewalAutoLoadedOrganizationRef.current = activeOrganizationId;
      customerRenewalAutoLoadedRef.current = false;
    }

    if (!customerRenewalAssistant || customerRenewalAutoLoadedRef.current) {
      return;
    }

    customerRenewalAutoLoadedRef.current = true;
    void (async () => {
      let assistantSnapshot = customerRenewalAssistant;

      if (!assistantSnapshot.agentOnline) {
        setCustomerRenewalAssistant((prev) =>
          prev
            ? {
                ...prev,
                helperMessage: "로컬 헬퍼 연결을 확인하는 중입니다..."
              }
            : prev
        );
        assistantSnapshot = await loadCustomerRenewalAssistant(assistantSnapshot);
        setCustomerRenewalAssistant(assistantSnapshot);
      }
    })().catch(() => {
      customerRenewalAutoLoadedRef.current = false;
    });
  }, [activeTab, customerRenewalAssistant, data?.auth.activeOrganizationId, data?.auth.activeOrganizationRole]);

  useEffect(() => {
    if (activeTab !== "settings" || activeSettingsSection !== "helper") {
      return;
    }

    if (!data?.auth.activeOrganizationId || data.auth.activeOrganizationRole === "viewer") {
      return;
    }

    if (customerRenewalAssistant?.helperCheckedAt) {
      return;
    }

    void refreshCustomerRenewalAssistant().catch(() => undefined);
  }, [
    activeTab,
    activeSettingsSection,
    customerRenewalAssistant?.helperCheckedAt,
    data?.auth.activeOrganizationId,
    data?.auth.activeOrganizationRole
  ]);

  useEffect(() => {
    if (activeTab !== "home") {
      return;
    }

    if (!data?.auth.activeOrganizationId || data.auth.activeOrganizationRole === "viewer") {
      return;
    }

    if (customerRenewalAssistant?.helperCheckedAt) {
      return;
    }

    void refreshCustomerRenewalAssistant().catch(() => undefined);
  }, [
    activeTab,
    customerRenewalAssistant?.helperCheckedAt,
    data?.auth.activeOrganizationId,
    data?.auth.activeOrganizationRole
  ]);

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
    if (!settingsForm) {
      return;
    }

    const signature = getSettingsPayloadSignature(settingsForm);

    if (!settingsAutosaveBaselineRef.current) {
      settingsAutosaveBaselineRef.current = signature;
      setSettingsAutosaveState("saved");
      return;
    }

    if (signature === settingsAutosaveBaselineRef.current) {
      setSettingsAutosaveState((prev) => (prev === "error" ? prev : "saved"));
      return;
    }

    setSettingsAutosaveState("pending");

    if (busyKey !== null || !canAutosaveSettings(settingsForm)) {
      return;
    }

    const timerId = window.setTimeout(async () => {
      try {
        setSettingsAutosaveState("saving");
        setError("");
        const { payload } = buildSettingsPayload(settingsForm);
        const savedSettings = await api<AppSettings>("/api/settings", {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        applySavedSettings(savedSettings, {
          syncForm: false,
          baselineForm: settingsForm
        });
      } catch (saveError) {
        setSettingsAutosaveState("error");
        setError(saveError instanceof Error ? saveError.message : "설정 자동 저장에 실패했습니다.");
      }
    }, 700);

    return () => window.clearTimeout(timerId);
  }, [busyKey, settingsForm]);

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

  const runAction = async (
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
  };

  const submitSupportRequest = async () => {
    try {
      setError("");
      setSupportRequestBusy(true);
      await api("/api/public/support-request", {
        method: "POST",
        body: JSON.stringify({
          companyName: supportRequestForm.companyName.trim(),
          requesterName: supportRequestForm.requesterName.trim(),
          requesterEmail: supportRequestForm.requesterEmail.trim(),
          requesterPhone: supportRequestForm.requesterPhone.trim(),
          message: supportRequestForm.message.trim()
        })
      });

      setSupportRequestForm(baseSupportRequestForm);
      setShowSupportRequestForm(false);
      await showAppAlert("문의가 접수되었습니다. 확인 후 등록 안내 메일을 보내드리겠습니다.", {
        title: "문의 접수 완료",
        tone: "success"
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문의 전송에 실패했습니다.");
    } finally {
      setSupportRequestBusy(false);
    }
  };

  const scrollToLandingSection = (id: string) => {
    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      scrollToElementById(id);
    });
  };

  const openSupportRequest = (prefillMessage?: string) => {
    setShowSupportRequestForm(true);

    if (prefillMessage) {
      setSupportRequestForm((prev) => ({
        ...prev,
        message: shouldReplaceSupportRequestMessage(prev.message) ? prefillMessage : prev.message
      }));
    }

    scrollToLandingSection("landing-login-card");
  };

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
    setPasswordResetTarget(null);
    setPasswordResetForm(basePasswordResetForm);
    setRecoveryMode(false);
    setRecoveryPasswordForm(basePasswordResetForm);
    setOrganizationMembers([]);
    setSettingsForm(null);
    setAppDialog(null);
    appDialogResolverRef.current = null;
    settingsAutosaveBaselineRef.current = "";
    setSettingsAutosaveState("idle");
    setActiveOrganizationId(null);
    clearSupabaseAuthHash();
    await supabase.auth.signOut();
  };

  const changeOrganization = async (organizationId: string) => {
    setActiveOrganizationId(organizationId);
    setError("");
    setPasswordResetTarget(null);
    setPasswordResetForm(basePasswordResetForm);
    await runAction(
      "workspace-change",
      async () => {
        await load();
      },
      { reload: false }
    );
  };

  const toggleRevealField = (fieldKey: string) => {
    setRevealedFields((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
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
    ensureLocalRenewalHelperActionAllowed("공동인증서 읽기");
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
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev)
      })
    );
    customerOnboardingCertificatesRef.current = certificates;
    return certificates;
  };

  const resolveCustomerOnboardingTemplateWorkbook = async (
    templateWorkbook: CustomerOnboardingTemplateWorkbookInput
  ): Promise<CustomerOnboardingResolutionResult> => {
    ensureLocalRenewalHelperActionAllowed("고객 초기 등록 준비");
    const onboardingPreflightConcurrency = 6;
    const sharedPassword = await resolveCustomerRenewalPassword({ promptIfMissing: false });
    const availableCertificates = await loadCustomerOnboardingAvailableCertificates();
    const errors: string[] = [];
    let acceptedBeforeWindowCount = 0;
    const customersByBusinessNumber = new Map<
      string,
      {
        rowIndex: number;
        customerName: string;
        businessNumber: string;
        corpName: string;
        addr: string;
        bizType: string;
        bizClass: string;
        renewalContactMobile: string;
        memo: string;
        fallbackAddress: string;
        plantRows: Array<{
          rowIndex: number;
          plantName: string;
        }>;
        certificateRows: CustomerOnboardingWorkbookInput["certificates"];
      }
    >();
    let resolvedCertificateCount = 0;
    let skippedCertificateCount = 0;

    const ensureWorkbookCustomerEntry = (
      businessNumber: string,
      options: {
        rowIndex: number;
        customerName: string;
        corpName: string;
        addr: string;
        bizType: string;
        bizClass: string;
        renewalContactMobile: string;
        fallbackAddress: string;
      }
    ) => {
      const existingEntry = customersByBusinessNumber.get(businessNumber);
      if (existingEntry) {
        if (!existingEntry.renewalContactMobile && options.renewalContactMobile.trim()) {
          existingEntry.renewalContactMobile = options.renewalContactMobile.trim();
        }
        return existingEntry;
      }

      const createdEntry = {
        rowIndex: options.rowIndex,
        customerName: options.customerName.trim(),
        businessNumber,
        corpName: options.corpName.trim(),
        addr: options.addr.trim(),
        bizType: options.bizType.trim(),
        bizClass: options.bizClass.trim(),
        renewalContactMobile: options.renewalContactMobile.trim(),
        memo: "",
        fallbackAddress: options.fallbackAddress.trim(),
        plantRows: [],
        certificateRows: []
      };
      customersByBusinessNumber.set(businessNumber, createdEntry);
      return createdEntry;
    };

    const applyPlantRowsToEntry = (
      plantRows: CustomerOnboardingTemplateWorkbookInput["plants"],
      fallbackPlantName: string,
      entry: ReturnType<typeof ensureWorkbookCustomerEntry>
    ) => {
      for (const plantRow of plantRows) {
        entry.plantRows.push({
          rowIndex: plantRow.rowIndex,
          plantName: plantRow.plantName.trim() || fallbackPlantName.trim() || entry.corpName
        });
      }
    };

    const plantCertificateGroups = Array.from(
      templateWorkbook.plants
        .reduce(
          (groups, plantRow) => {
            const key =
              normalizeRenewalCertificateKey(plantRow.certificateIndex) ||
              `name:${normalizeRenewalCertificateKey(plantRow.certificateName)}`;
            if (!key) {
              errors.push(`발전소 시트 ${plantRow.rowIndex}행: 로컬인증서번호 또는 인증서명(CN)을 확인하세요.`);
              skippedCertificateCount += 1;
              return groups;
            }

            const existingGroup = groups.get(key);
            if (existingGroup) {
              existingGroup.plantRows.push(plantRow);
              return groups;
            }

            groups.set(key, {
              certificateIndex: plantRow.certificateIndex,
              certificateName: plantRow.certificateName,
              plantRows: [plantRow]
            });
            return groups;
          },
          new Map<
            string,
            {
              certificateIndex: string;
              certificateName: string;
              plantRows: CustomerOnboardingTemplateWorkbookInput["plants"];
            }
          >()
        )
        .values()
    );
    const electronicTaxSelections: Array<{
      rowIndex: number;
      certificateIndex: string;
      certificateName: string;
      certificateLabel: string;
      matchedCertificate: RenewalAgentCertificate;
      effectivePassword: string;
      plantRows: CustomerOnboardingTemplateWorkbookInput["plants"];
      certificatePassword: string;
    }> = [];

    for (const plantGroup of plantCertificateGroups) {
      const certificateLabel = getCustomerOnboardingTemplateCertificateLabel({
        certificateIndex: plantGroup.certificateIndex,
        certificateName: plantGroup.certificateName
      });
      const matchedCertificate = findMatchingRenewalCertificateFromList(availableCertificates, plantGroup);
      if (!matchedCertificate) {
        errors.push(`발전소 시트 (${certificateLabel}): 이 PC에서 같은 전자세금용 공동인증서를 다시 찾지 못했습니다.`);
        skippedCertificateCount += 1;
        continue;
      }

      if (deriveCustomerCertificateKind(matchedCertificate as RenewalAgentCertificate) !== "electronic_tax") {
        errors.push(`발전소 시트 (${certificateLabel}): 전자세금용 공동인증서만 고객 등록에 사용할 수 있습니다.`);
        skippedCertificateCount += 1;
        continue;
      }

      const explicitPlantPasswords = Array.from(
        new Set(plantGroup.plantRows.map((row) => row.certificatePassword.trim()).filter(Boolean))
      );
      if (explicitPlantPasswords.length > 1) {
        errors.push(`발전소 시트 (${certificateLabel}): 같은 인증서에 서로 다른 인증서 비밀번호가 입력되어 있습니다.`);
        skippedCertificateCount += 1;
        continue;
      }

      const enteredPlantPassword = explicitPlantPasswords[0] ?? "";
      const effectivePassword = enteredPlantPassword || sharedPassword;
      if (!effectivePassword) {
        errors.push(
          `발전소 시트 (${certificateLabel}): 인증서 비밀번호를 입력하거나 시스템 설정의 공통 비밀번호를 먼저 저장하세요.`
        );
        skippedCertificateCount += 1;
        continue;
      }

      electronicTaxSelections.push({
        rowIndex: plantGroup.plantRows[0]?.rowIndex ?? 0,
        certificateIndex: plantGroup.certificateIndex,
        certificateName: plantGroup.certificateName,
        certificateLabel,
        matchedCertificate: matchedCertificate as RenewalAgentCertificate,
        effectivePassword,
        plantRows: plantGroup.plantRows,
        certificatePassword: enteredPlantPassword
      });
    }

    const electronicTaxResults = await mapWithConcurrency(
      electronicTaxSelections,
      onboardingPreflightConcurrency,
      async (selection) => {
        const { matchedCertificate, certificateLabel, effectivePassword } = selection;
        const response = await requestLocalRenewalPreflight({
          certificateIndex: Number(matchedCertificate.index),
          certificateCn: matchedCertificate.cn || selection.certificateName || null,
          certificatePassword: effectivePassword
        });
        const preflightProbe = response.result.bridge.preflightProbe;
        const decision = classifyOnboardingPreflightImportDecision(preflightProbe, {
          certificateExpireDate: matchedCertificate.todate ?? matchedCertificate.detailValidateTo ?? null
        });
        if (!decision.canImport) {
          return {
            ok: false as const,
            message: `발전소 시트 (${certificateLabel}): ${decision.failureMessage}`
          };
        }
        const snapshot = decision.snapshot;

        const basePayload = buildCustomerCreatePayloadFromRenewalSnapshot(
          {
            index: String(matchedCertificate.index),
            cn: matchedCertificate.cn || selection.certificateName || certificateLabel
          } as RenewalAgentCertificate,
          snapshot
        );
        const businessNumber = digitsOnly(basePayload.businessNumber);
        if (!businessNumber) {
          return {
            ok: false as const,
            message: `발전소 시트 (${certificateLabel}): 사업자번호를 읽지 못했습니다.`
          };
        }

        return {
          ok: true as const,
          selection,
          matchedCertificate,
          acceptedBeforeWindow: decision.acceptedBeforeWindow,
          businessNumber,
          customerName: basePayload.customerName,
          corpName: basePayload.corpName,
          addr: basePayload.addr,
          bizType: basePayload.bizType,
          bizClass: basePayload.bizClass,
          renewalContactMobile: basePayload.renewalContactMobile
        };
      }
    );

    for (const result of electronicTaxResults) {
      if (!result.ok) {
        errors.push(result.message);
        skippedCertificateCount += 1;
        continue;
      }

      if (result.acceptedBeforeWindow) {
        acceptedBeforeWindowCount += 1;
      }

      const entry = ensureWorkbookCustomerEntry(result.businessNumber, {
        rowIndex: result.selection.rowIndex,
        customerName: result.customerName,
        corpName: result.corpName,
        addr: result.addr,
        bizType: result.bizType,
        bizClass: result.bizClass,
        renewalContactMobile: result.renewalContactMobile,
        fallbackAddress: result.addr
      });

      applyPlantRowsToEntry(
        result.selection.plantRows,
        result.matchedCertificate.cn?.trim() || result.selection.certificateLabel,
        entry
      );
      entry.certificateRows.push({
        rowIndex: result.selection.rowIndex,
        businessNumber: result.businessNumber,
        certificateKind: "electronic_tax",
        certificateName: result.matchedCertificate.cn?.trim() || result.selection.certificateName.trim() || entry.corpName,
        certificateUsageName: "전자세금용",
        issuerName: result.matchedCertificate.issuerToName.trim(),
        certificatePassword: result.selection.certificatePassword,
        isPrimary: entry.certificateRows.length === 0
      });
      resolvedCertificateCount += 1;
    }

    const workbook: CustomerOnboardingWorkbookInput = {
      customers: [],
      plants: [],
      certificates: []
    };

    for (const entry of customersByBusinessNumber.values()) {
      const defaultMatchAddress = entry.addr.trim() || entry.fallbackAddress.trim();
      const plantRows =
        entry.plantRows.length > 0
          ? entry.plantRows
          : [
              {
                rowIndex: entry.rowIndex,
                plantName: entry.corpName
              }
            ];

      workbook.customers.push({
        rowIndex: entry.rowIndex,
        customerName: entry.customerName,
        businessNumber: entry.businessNumber,
        corpName: entry.corpName,
        addr: entry.addr,
        bizType: entry.bizType,
        bizClass: entry.bizClass,
        renewalContactMobile: entry.renewalContactMobile,
        memo: entry.memo
      });
      workbook.plants.push(
        ...plantRows.map((plantRow, index) => ({
          rowIndex: plantRow.rowIndex || entry.rowIndex * 100 + index,
          businessNumber: entry.businessNumber,
          plantName: plantRow.plantName || entry.corpName,
          matchAddress: defaultMatchAddress
        }))
      );
      workbook.certificates.push(...entry.certificateRows);
    }

    return {
      workbook,
      resolvedCertificateCount,
      skippedCertificateCount,
      acceptedBeforeWindowCount,
      errors
    };
  };

  const autoLinkImportedOnboardingGeneralCertificates = async (
    templateWorkbook: CustomerOnboardingTemplateWorkbookInput,
    onboardingWorkbook: CustomerOnboardingWorkbookInput
  ) => {
    ensureLocalRenewalHelperActionAllowed("공동인증서 자동 연결");
    const candidateRows = templateWorkbook.certificates.filter(
      (row) => deriveCustomerOnboardingTemplateCertificateKind(row) !== "electronic_tax"
    );
    if (candidateRows.length === 0) {
      return {
        linkedCount: 0,
        skippedCount: 0,
        warnings: [] as string[]
      };
    }

    const importedBusinessNumbers = new Set(
      onboardingWorkbook.customers
        .map((row) => digitsOnly(row.businessNumber))
        .filter((businessNumber): businessNumber is string => Boolean(businessNumber))
    );
    if (importedBusinessNumbers.size === 0) {
      return {
        linkedCount: 0,
        skippedCount: candidateRows.length,
        warnings: ["범용 공동인증서를 연결할 등록 고객을 찾지 못했습니다."]
      };
    }

    const [customers, availableCertificates] = await Promise.all([
      api<Customer[]>("/api/customers"),
      loadCustomerOnboardingAvailableCertificates()
    ]);
    const importedCustomers = customers.filter((customer) => importedBusinessNumbers.has(digitsOnly(customer.businessNumber)));
    const sharedPassword = await resolveCustomerRenewalPassword({ promptIfMissing: false });

    if (availableCertificates.length === 0) {
      return {
        linkedCount: 0,
        skippedCount: candidateRows.length,
        warnings: ["이 PC에서 범용 공동인증서를 다시 찾지 못해 자동 연결을 진행하지 못했습니다."]
      };
    }

    const results = await mapWithConcurrency(candidateRows, 6, async (certificateRow) => {
      const certificateLabel = getCustomerOnboardingTemplateCertificateLabel(certificateRow);
      const matchedCertificate = findMatchingRenewalCertificateFromList(availableCertificates, {
        certificateIndex: certificateRow.certificateIndex,
        certificateName: certificateRow.certificateName
      });

      if (!matchedCertificate) {
        return {
          status: "skipped" as const,
          message: `공동인증서 ${certificateRow.rowIndex}행 (${certificateLabel}): 이 PC에서 같은 범용 공동인증서를 다시 찾지 못했습니다.`
        };
      }

      const certificateKind = deriveCustomerCertificateKind(matchedCertificate);
      if (certificateKind !== "general_personal" && certificateKind !== "general_business") {
        return {
          status: "skipped" as const,
          message: `공동인증서 ${certificateRow.rowIndex}행 (${certificateLabel}): 범용 공동인증서가 아니라 자동 연결을 건너뜁니다.`
        };
      }

      const effectivePassword = certificateRow.certificatePassword.trim() || sharedPassword;
      if (!effectivePassword) {
        return {
          status: "skipped" as const,
          message: `공동인증서 ${certificateRow.rowIndex}행 (${certificateLabel}): 인증서 비밀번호가 없어 자동 연결을 건너뜁니다.`
        };
      }

      const response = await requestLocalRenewalPreflight({
        certificateIndex: Number(matchedCertificate.index),
        certificateCn: matchedCertificate.cn || certificateRow.certificateName || null,
        certificatePassword: effectivePassword
      });
      const preflightProbe = response.result.bridge.preflightProbe;
      const decision = classifyOnboardingPreflightImportDecision(preflightProbe, {
        certificateExpireDate: matchedCertificate.todate ?? matchedCertificate.detailValidateTo ?? null
      });
      if (!decision.canImport) {
        return {
          status: "skipped" as const,
          message: `공동인증서 ${certificateRow.rowIndex}행 (${certificateLabel}): ${decision.failureMessage}`
        };
      }
      const snapshot = decision.snapshot;

      const businessNumber = digitsOnly(snapshot.businessNumber ?? "");
      const businessNumberMatches = businessNumber
        ? importedCustomers.filter((customer) => digitsOnly(customer.businessNumber) === businessNumber)
        : [];
      const matchedCustomer =
        businessNumberMatches.length === 1
          ? (businessNumberMatches[0] ?? null)
          : importedCustomers.filter((customer) =>
              matchesCustomerCertificateAutoLinkFromSnapshot(matchedCertificate, snapshot, customer)
            ).length === 1
            ? importedCustomers.filter((customer) =>
                matchesCustomerCertificateAutoLinkFromSnapshot(matchedCertificate, snapshot, customer)
              )[0] ?? null
            : null;

      if (!matchedCustomer) {
        const autoMatchCandidates = importedCustomers.filter((customer) =>
          matchesCustomerCertificateAutoLinkFromSnapshot(matchedCertificate, snapshot, customer)
        );
        return {
          status: "skipped" as const,
          message:
            autoMatchCandidates.length > 1
              ? `공동인증서 ${certificateRow.rowIndex}행 (${certificateLabel}): 자동 연결 후보가 여러 명이라 건너뜁니다.`
              : `공동인증서 ${certificateRow.rowIndex}행 (${certificateLabel}): 이번 등록 고객 중 자동 연결 대상을 찾지 못했습니다.`
        };
      }

      await linkCustomerCertificate(matchedCustomer.id, matchedCertificate, {
        linkSource: "auto",
        certificatePassword: effectivePassword
      });
      return {
        status: "linked" as const,
        customerName: matchedCustomer.customerName,
        certificateLabel
      };
    });

    return {
      linkedCount: results.filter((result) => result.status === "linked").length,
      skippedCount: results.filter((result) => result.status === "skipped").length,
      warnings: results
        .filter((result): result is Extract<(typeof results)[number], { status: "skipped"; message: string }> => result.status === "skipped")
        .map((result) => result.message)
    };
  };

  const downloadCustomerOnboardingImportTemplate = async () => {
    const [XLSX, certificates] = await Promise.all([
      loadXlsxModule(),
      loadCustomerOnboardingAvailableCertificates({ forceRefresh: true })
    ]);

    if (certificates.length === 0) {
      throw new Error("이 PC에서 공동인증서를 찾지 못했습니다.");
    }

    downloadCustomerOnboardingTemplate(XLSX, certificates);
    setCustomerOnboardingFileName("");
    setCustomerOnboardingWorkbook(null);
    setCustomerOnboardingTemplateWorkbook(null);
    setCustomerOnboardingPreview(null);
    setCustomerOnboardingSessionState({
      templateDownloaded: true,
      previewReady: false,
      commitDone: false
    });
    setCustomerOnboardingNotice(
      `공동인증서 ${certificates.length}건 기준으로 양식을 다운로드했습니다. 발전소 시트에서 등록할 대상 행만 남기고, 공동인증서 시트에는 범용 인증서 비밀번호만 입력하세요. 주소 예외는 첫 메일 동기화 후 도입 준비의 미매칭 메일 예외 처리 단계에서 나중에 처리하면 됩니다.`
    );
    setCustomerOnboardingError("");
  };

  const handleCustomerOnboardingFileChange = async (file: File | null) => {
    if (!file) {
      setCustomerOnboardingFileName("");
      setCustomerOnboardingWorkbook(null);
      setCustomerOnboardingTemplateWorkbook(null);
      setCustomerOnboardingPreview(null);
      setCustomerOnboardingSessionState((prev) => ({
        ...prev,
        previewReady: false,
        commitDone: false
      }));
      setCustomerOnboardingNotice("");
      setCustomerOnboardingError("");
      return;
    }

    try {
      const XLSX = await loadXlsxModule();
      const parsed = await parseCustomerOnboardingWorkbook(XLSX, file);
      const resolved = await resolveCustomerOnboardingTemplateWorkbook(parsed.workbook);
      setCustomerOnboardingFileName(parsed.fileName);
      setCustomerOnboardingWorkbook(resolved.workbook);
      setCustomerOnboardingTemplateWorkbook(parsed.workbook);
      setCustomerOnboardingSessionState({
        templateDownloaded: true,
        previewReady: false,
        commitDone: false
      });

      if (resolved.workbook.customers.length === 0) {
        setCustomerOnboardingPreview(null);
        setCustomerOnboardingNotice(`${parsed.fileName}에서 발전소 시트에 남긴 등록 대상 행을 찾지 못했습니다.`);
        setCustomerOnboardingError(resolved.errors.join("\n"));
        return;
      }

      const preview = await api<CustomerOnboardingPreviewResponse>("/api/customer-onboarding/preview", {
        method: "POST",
        body: JSON.stringify(resolved.workbook)
      });
      setCustomerOnboardingPreview(preview);
      setCustomerOnboardingSessionState({
        templateDownloaded: true,
        previewReady: true,
        commitDone: false
      });
      setCustomerOnboardingNotice(
        `${parsed.fileName} 업로드 확인을 마쳤습니다. 발전소 시트 기준 고객 ${resolved.workbook.customers.length}건을 등록 대상으로 읽었습니다. 범용 공동인증서는 등록 후 이번 업로드 고객만 대상으로 자동 연결을 시도합니다. 전자세금용 인증서는 다음 단계에서 후속 등록을 마무리하세요.${
          resolved.acceptedBeforeWindowCount > 0
            ? ` 갱신 가능 기간 전이지만 사업자 정보 확인에 성공한 전자세금용 인증서 ${resolved.acceptedBeforeWindowCount}건도 등록 대상으로 포함했습니다.`
            : ""
        }${
          resolved.skippedCertificateCount > 0 ? ` 건너뛴 공동인증서 ${resolved.skippedCertificateCount}건은 아래에서 확인하세요.` : ""
        }`
      );
      setCustomerOnboardingError(resolved.errors.join("\n"));
    } catch (importError) {
      setCustomerOnboardingFileName("");
      setCustomerOnboardingWorkbook(null);
      setCustomerOnboardingTemplateWorkbook(null);
      setCustomerOnboardingPreview(null);
      setCustomerOnboardingSessionState((prev) => ({
        ...prev,
        previewReady: false,
        commitDone: false
      }));
      setCustomerOnboardingNotice("");
      setCustomerOnboardingError(importError instanceof Error ? importError.message : "엑셀 양식을 읽지 못했습니다.");
    }
  };

  const waitForCustomerOnboardingCommitBatch = async (
    batchId: string,
    initial?: CustomerOnboardingCommitStartResponse
  ): Promise<CustomerOnboardingCommitResponse> => {
    if (initial) {
      setCustomerOnboardingNotice(`고객 반영을 시작했습니다. ${initial.completedRows}/${initial.totalRows}건 처리됨`);
    }

    while (true) {
      const batch = await api<CustomerOnboardingCommitResponse>(`/api/customer-onboarding/batches/${batchId}`);

      if (batch.status === "completed") {
        return batch;
      }

      if (batch.status === "failed") {
        throw new Error(batch.error ?? "고객 반영 배치가 실패했습니다.");
      }

      setCustomerOnboardingNotice(`고객 반영 진행 중... ${batch.completedRows}/${batch.totalRows}건 처리됨`);
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
  };

  const commitCustomerOnboardingWorkbook = async () => {
    if (!customerOnboardingWorkbook || !customerOnboardingTemplateWorkbook || !customerOnboardingPreview) {
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
    const result = await waitForCustomerOnboardingCommitBatch(commitStart.batchId, commitStart);
    const autoLinkResult = await autoLinkImportedOnboardingGeneralCertificates(
      customerOnboardingTemplateWorkbook,
      customerOnboardingWorkbook
    ).catch((error) => ({
      linkedCount: 0,
      skippedCount: 0,
      warnings: [error instanceof Error ? `범용 공동인증서 자동 연결 실패: ${error.message}` : "범용 공동인증서 자동 연결에 실패했습니다."]
    }));

    const summary = `가져오기 완료 · 신규 ${result.createdCount}건 / 갱신 ${result.updatedCount}건 / 인증서 ${result.linkedCertificateCount}건`;
    const autoLinkSummary =
      autoLinkResult.linkedCount > 0 || autoLinkResult.skippedCount > 0
        ? `\n범용 공동인증서 자동 연결 · 성공 ${autoLinkResult.linkedCount}건 / 건너뜀 ${autoLinkResult.skippedCount}건`
        : "";
    const warningSummary =
      result.warnings.length > 0 || autoLinkResult.warnings.length > 0
        ? `\n경고 ${result.warnings.length + autoLinkResult.warnings.length}건은 아래 메시지에서 확인하세요.`
        : "";
    setCustomerOnboardingNotice(summary + autoLinkSummary + warningSummary);

    const failedMessages = result.failedRows.map((row) => `${row.rowIndex}행: ${row.message}`);
    const warningMessages = result.warnings.map((warning) => `${warning.rowIndex}행: ${warning.message}`);
    setCustomerOnboardingError([...failedMessages, ...warningMessages, ...autoLinkResult.warnings].join("\n"));

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

  const buildSettingsPayload = (form: SettingsFormState) => {
    const normalized = withSelectedMailProviderSettings(form);
    const renewalIssuePassword = normalizeRenewalIssuePasswordInput(normalized.renewalIssuePassword);
    return {
      normalized,
      payload: {
        imapHost: normalized.imapHost,
        imapPort: Number(normalized.imapPort),
        imapSecure: normalized.imapSecure,
        imapUser: normalized.mailAddress,
        imapPass: normalized.mailPassword,
        imapMailbox: normalized.imapMailbox,
        smtpHost: normalized.smtpHost,
        smtpPort: Number(normalized.smtpPort),
        smtpSecure: normalized.smtpSecure,
        smtpUser: normalized.mailAddress,
        smtpPass: normalized.mailPassword,
        smtpFromName: "AUTO-TAX",
        smtpFromEmail: normalized.mailAddress,
        notificationEmails: normalized.notificationEmailsText
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        defaultIssueDay: Number(normalized.defaultIssueDay),
        defaultIssueHour: Number(normalized.defaultIssueHour),
        defaultIssueMinute: Number(normalized.defaultIssueMinute),
        mailPollMinutes: Number(normalized.mailPollMinutes),
        mailSyncStartAt: null,
        timezone: normalized.timezone,
        popbillUserIdPrefix: normalized.popbillUserIdPrefix.trim(),
        popbillSharedPassword: normalized.popbillSharedPassword,
        operatorContactName: normalized.operatorContactName.trim(),
        operatorContactEmail: normalized.operatorContactEmail.trim(),
        operatorContactTel: normalized.operatorContactTel.trim(),
        renewalContactDepartment: normalized.renewalContactDepartment.trim(),
        renewalContactFax: normalized.renewalContactFax.trim(),
        renewalCertificatePassword: normalized.renewalCertificatePassword,
        renewalIssuePassword,
        schedulerEnabled: normalized.schedulerEnabled
      }
    };
  };

  const buildMailSettingsSavePayload = (form: SettingsFormState) => {
    const { normalized, payload } = buildSettingsPayload(form);
    if (!data) {
      return { normalized, payload };
    }

    return {
      normalized,
      payload: {
        ...payload,
        popbillUserIdPrefix: data.settings.popbillUserIdPrefix,
        popbillSharedPassword: "",
        operatorContactName: data.settings.operatorContactName,
        operatorContactEmail: data.settings.operatorContactEmail,
        operatorContactTel: data.settings.operatorContactTel,
        renewalContactDepartment: data.settings.renewalContactDepartment,
        renewalContactFax: data.settings.renewalContactFax,
        renewalCertificatePassword: "",
        renewalIssuePassword: ""
      }
    };
  };

  const getSettingsPayloadSignature = (form: SettingsFormState) => JSON.stringify(buildSettingsPayload(form).payload);

  const canAutosaveSettings = (form: SettingsFormState) => {
    const { payload } = buildSettingsPayload(form);
    const isFiniteInteger = (value: number) => Number.isInteger(value) && Number.isFinite(value);

    return (
      isFiniteInteger(payload.imapPort) &&
      payload.imapPort >= 1 &&
      isFiniteInteger(payload.smtpPort) &&
      payload.smtpPort >= 1 &&
      isFiniteInteger(payload.defaultIssueDay) &&
      payload.defaultIssueDay >= 1 &&
      payload.defaultIssueDay <= 31 &&
      isFiniteInteger(payload.defaultIssueHour) &&
      payload.defaultIssueHour >= 0 &&
      payload.defaultIssueHour <= 23 &&
      isFiniteInteger(payload.defaultIssueMinute) &&
      payload.defaultIssueMinute >= 0 &&
      payload.defaultIssueMinute <= 59 &&
      isFiniteInteger(payload.mailPollMinutes) &&
      payload.mailPollMinutes >= 1 &&
      payload.mailPollMinutes <= 1440 &&
      (payload.renewalIssuePassword === "" || /^\d{6}$/.test(payload.renewalIssuePassword))
    );
  };

  const applySavedSettings = (
    savedSettings: AppSettings,
    options?: {
      syncForm?: boolean;
      baselineForm?: SettingsFormState | null;
    }
  ) => {
    const baselineForm = options?.baselineForm ?? settingsToForm(savedSettings);
    if (options?.syncForm !== false) {
      setSettingsForm(baselineForm);
    }
    settingsAutosaveBaselineRef.current = baselineForm ? getSettingsPayloadSignature(baselineForm) : "";
    setData((prev) => (prev ? { ...prev, settings: savedSettings } : prev));
    setSettingsAutosaveState("saved");
  };

  const loadCurrentPopbillSharedPassword = async () => {
    if (!settingsForm) return;
    const result = await api<{ password: string }>("/api/settings/popbill-shared-password");
    const nextForm = { ...settingsForm, popbillSharedPassword: result.password };
    settingsAutosaveBaselineRef.current = getSettingsPayloadSignature(nextForm);
    setSettingsAutosaveState("saved");
    setSettingsForm(nextForm);
    setRevealedFields((prev) => ({ ...prev, popbillSharedPassword: true }));
  };

  const fetchStoredRenewalCertificatePassword = async () => {
    const result = await api<{ password: string }>("/api/settings/renewal-certificate-password");
    return result.password.trim();
  };

  const fetchStoredRenewalIssuePassword = async () => {
    const result = await api<{ password: string }>("/api/settings/renewal-issue-password");
    return normalizeRenewalIssuePasswordInput(result.password.trim());
  };

  const fetchStoredCustomerCertificatePassword = async (certificateId: number) => {
    const cachedPassword = customerCertificatePasswordCacheRef.current[certificateId]?.trim();
    if (cachedPassword) {
      return cachedPassword;
    }

    const result = await api<{ password: string }>(`/api/customer-certificates/${certificateId}/password`);
    const password = result.password.trim();
    if (password) {
      customerCertificatePasswordCacheRef.current = {
        ...customerCertificatePasswordCacheRef.current,
        [certificateId]: password
      };
    }
    return password;
  };

  const loadCurrentRenewalCertificatePassword = async () => {
    if (!settingsForm) return;
    const password = await fetchStoredRenewalCertificatePassword();
    customerRenewalPasswordRef.current = password;
    const nextForm = { ...settingsForm, renewalCertificatePassword: password };
    settingsAutosaveBaselineRef.current = getSettingsPayloadSignature(nextForm);
    setSettingsAutosaveState("saved");
    setSettingsForm(nextForm);
    setRevealedFields((prev) => ({ ...prev, renewalCertificatePassword: true }));
  };

  const loadCurrentRenewalIssuePassword = async () => {
    if (!settingsForm) return;
    const password = await fetchStoredRenewalIssuePassword();
    const nextForm = { ...settingsForm, renewalIssuePassword: password };
    customerRenewalIssuePasswordRef.current = password;
    settingsAutosaveBaselineRef.current = getSettingsPayloadSignature(nextForm);
    setSettingsAutosaveState("saved");
    setSettingsForm(nextForm);
    setRevealedFields((prev) => ({ ...prev, renewalIssuePassword: true }));
  };
  const handleSettingsRenewalIssuePasswordChange = (nextValue: string) => {
    const normalizedValue = normalizeRenewalIssuePasswordInput(nextValue);
    customerRenewalIssuePasswordRef.current = normalizedValue.length === 6 ? normalizedValue : "";
    setSettingsForm((prev) => (prev ? { ...prev, renewalIssuePassword: normalizedValue } : prev));
  };

  const testMailSettings = async () => {
    if (!settingsForm) return;
    const { normalized, payload } = buildMailSettingsSavePayload(settingsForm);
    const result = await api<{
      imapOk: boolean;
      imapMessage: string;
      smtpOk: boolean;
      smtpMessage: string;
      testMailSent: boolean;
    }>("/api/system/mail-test", {
      method: "POST",
      body: JSON.stringify({
        imapHost: payload.imapHost,
        imapPort: payload.imapPort,
        imapSecure: payload.imapSecure,
        imapUser: payload.imapUser,
        imapPass: payload.imapPass,
        imapMailbox: payload.imapMailbox,
        smtpHost: payload.smtpHost,
        smtpPort: payload.smtpPort,
        smtpSecure: payload.smtpSecure,
        smtpUser: payload.smtpUser,
        smtpPass: payload.smtpPass,
        smtpFromName: "AUTO-TAX",
        smtpFromEmail: payload.smtpFromEmail,
        notificationEmails: payload.notificationEmails
      })
    });

    const testSucceeded = result.imapOk && result.smtpOk;
    if (testSucceeded) {
      await api<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const verifiedSettings = await api<AppSettings>("/api/settings/mail-connection-verified", {
        method: "POST"
      });
      applySavedSettings(verifiedSettings, {
        syncForm: false,
        baselineForm: normalized
      });
    }

    await showAppAlert(
      `${MAIL_PROVIDER_CONFIG[normalized.mailProvider].label} 연결 테스트 결과\nIMAP: ${result.imapOk ? "성공" : "실패"}\n${result.imapMessage}\n\nSMTP: ${result.smtpOk ? "성공" : "실패"}\n${result.smtpMessage}\n\n테스트 메일 발송: ${result.testMailSent ? "예" : "아니오"}\n\n설정 저장: ${testSucceeded ? "성공" : "실패로 저장 안 함"}`,
      {
        title: "메일 연결 테스트 결과",
        tone: testSucceeded ? "success" : "warn"
      }
    );
  };

  const changePassword = async () => {
    const nextPassword = passwordChangeForm.nextPassword.trim();
    const confirmPassword = passwordChangeForm.confirmPassword.trim();

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

    setPasswordChangeForm(basePasswordChangeForm);
    await showAppAlert("비밀번호를 변경했습니다.", {
      title: "비밀번호 변경 완료",
      tone: "success"
    });
  };

  const returnToLoginFromRecovery = async () => {
    setRecoveryMode(false);
    setRecoveryPasswordForm(basePasswordResetForm);
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

      setRecoveryPasswordForm(basePasswordResetForm);
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

  const openMemberPasswordReset = (member: OrganizationMemberSummary) => {
    setPasswordResetTarget({
      kind: "member",
      membershipId: member.membershipId,
      loginId: member.loginId,
      displayName: member.displayName
    });
    setPasswordResetForm(basePasswordResetForm);
  };

  const openOwnerPasswordReset = (workspace: OpsWorkspaceSummary) => {
    setPasswordResetTarget({
      kind: "owner",
      organizationId: workspace.organizationId,
      organizationName: workspace.organizationName,
      loginId: workspace.ownerLoginId
    });
    setPasswordResetForm(basePasswordResetForm);
  };

  const cancelPasswordReset = () => {
    setPasswordResetTarget(null);
    setPasswordResetForm(basePasswordResetForm);
  };

  const submitPasswordReset = async () => {
    if (!passwordResetTarget) {
      throw new Error("비밀번호를 재설정할 대상을 먼저 선택하세요.");
    }

    const nextPassword = passwordResetForm.nextPassword.trim();
    const confirmPassword = passwordResetForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      throw new Error("임시 비밀번호는 8자 이상으로 입력하세요.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("임시 비밀번호와 확인 값이 일치하지 않습니다.");
    }

    if (passwordResetTarget.kind === "member") {
      const result = await api<{ ok: true; loginId: string | null }>(
        `/api/organization/members/${passwordResetTarget.membershipId}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({
            password: nextPassword
          })
        }
      );

      await showAppAlert(`${result.loginId ?? "선택한 사용자"}의 임시 비밀번호를 재설정했습니다.`, {
        title: "임시 비밀번호 재설정",
        tone: "success"
      });
    } else {
      const result = await api<{ ok: true; ownerLoginId: string | null }>(
        `/api/ops/workspaces/${passwordResetTarget.organizationId}/reset-owner-password`,
        {
          method: "POST",
          body: JSON.stringify({
            password: nextPassword
          })
        }
      );

      await showAppAlert(
        `${passwordResetTarget.organizationName} 작업공간의 owner(${result.ownerLoginId ?? "-"}) 임시 비밀번호를 재설정했습니다.`,
        {
          title: "owner 비밀번호 재설정",
          tone: "success"
        }
      );
    }

    cancelPasswordReset();
  };

  const createOrganizationMember = async () => {
    const result = await api<{
      members: OrganizationMemberSummary[];
      memberAction: "linked-existing-user" | "created-user";
    }>("/api/organization/members", {
      method: "POST",
      body: JSON.stringify({
        loginId: organizationMemberForm.loginId.trim(),
        displayName: organizationMemberForm.displayName.trim(),
        password: organizationMemberForm.password
      })
    });

    setOrganizationMembers(result.members);
    setOrganizationMemberForm(baseOrganizationMemberForm);
    await showAppAlert(
      result.memberAction === "created-user"
        ? "새 사용자 계정을 만들고 작업공간 멤버로 연결했습니다."
        : "기존 사용자 계정을 작업공간 멤버로 연결했습니다.",
      {
        title: "사용자 추가 완료",
        tone: "success"
      }
    );
  };

  const removeOrganizationMember = async (member: OrganizationMemberSummary) => {
    const confirmed = await showAppConfirm(`${member.loginId ?? "선택한 사용자"}를 이 작업공간에서 제거할까요?`, {
      title: "작업공간 사용자 제거",
      tone: "danger",
      confirmLabel: "제거하기"
    });
    if (!confirmed) {
      return;
    }

    const result = await api<{ ok: true; members: OrganizationMemberSummary[] }>(`/api/organization/members/${member.membershipId}`, {
      method: "DELETE"
    });

    setOrganizationMembers(result.members);
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

  const refreshCustomerRenewalAssistant = async () => {
    if (!data?.auth.activeOrganizationId || data.auth.activeOrganizationRole === "viewer") {
      setCustomerRenewalAssistant(null);
      return;
    }

    const status = await getLocalRenewalHelperStatus();
    setCustomerRenewalAssistant((prev) => ({
      agentOnline: status.online,
      helperVersion: status.version,
      helperMessage: status.message,
      helperCheckedAt: new Date().toISOString(),
      jobs: prev?.jobs ?? [],
      certificates: prev?.certificates ?? []
    }));
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

    if (data?.settings.renewalCertificatePasswordConfigured) {
      const storedPassword = await fetchStoredRenewalCertificatePassword();
      if (storedPassword) {
        customerRenewalPasswordRef.current = storedPassword;
        return storedPassword;
      }
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

  const resolveCustomerRenewalIssuePassword = async () => {
    const rawFormPassword = settingsForm?.renewalIssuePassword ?? "";
    const formPassword = normalizeRenewalIssuePasswordInput(rawFormPassword.trim());
    if (formPassword.length === 6) {
      customerRenewalIssuePasswordRef.current = formPassword;
      return formPassword;
    }

    if (rawFormPassword.trim()) {
      return "";
    }

    if (data?.settings.renewalIssuePasswordConfigured) {
      const storedPassword = await fetchStoredRenewalIssuePassword();
      if (storedPassword.length === 6) {
        customerRenewalIssuePasswordRef.current = storedPassword;
        return storedPassword;
      }
    }

    const cachedPassword = normalizeRenewalIssuePasswordInput(customerRenewalIssuePasswordRef.current.trim());
    if (cachedPassword.length === 6) {
      return cachedPassword;
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

  const syncCustomerRenewalCertificates = async (options?: { showAlert?: boolean }) => {
    const showAlert = options?.showAlert ?? true;
    const response = await requestLocalRenewalBridgeProbe();
    const allCertificates = response.result.bridge.storageProbe.ok ? response.result.bridge.storageProbe.certificates : [];
    const bridgeJob = buildLocalRenewalBridgeJob(response.result, allCertificates.length);
    const helperMessage = bridgeJob.error ?? bridgeJob.summary;

    setCustomerRenewalAssistant((prev) => ({
      ...(prev ?? {}),
      agentOnline: true,
      helperVersion: response.version,
      helperMessage,
      helperCheckedAt: new Date().toISOString(),
      jobs: [bridgeJob, ...(prev?.jobs ?? [])],
      certificates: allCertificates
    }));

    if (showAlert) {
      await showAppAlert(
        allCertificates.length > 0
          ? `공동인증서 ${allCertificates.length}건을 불러왔습니다.\n공동인증서 탭에서 고객 연결과 갱신을 진행할 수 있습니다.`
          : bridgeJob.error ?? "공동인증서를 불러오지 못했습니다.",
        {
          title: "공동인증서 읽기",
          tone: allCertificates.length > 0 ? "success" : "danger"
        }
      );
    }

    return allCertificates;
  };

  const loadCustomerRenewalCertificates = async () => {
    await syncCustomerRenewalCertificates({ showAlert: true });
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
              certificateCn: entry.certificate.cn || createdCustomer.customerName,
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

    setCustomerRenewalAssistant((prev) => ({
      ...(prev ?? {}),
      agentOnline: true,
      helperVersion: response.version,
      helperMessage,
      helperCheckedAt: new Date().toISOString(),
      jobs,
      certificates
    }));
    await showAppAlert(alertMessage, {
      title: alertTitle,
      tone: alertTone
    });
  };

  const requestCustomerRenewalPreflight = async (certificate: RenewalAgentCertificate) => {
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
    setCustomerRenewalAssistant((prev) => ({
      ...(prev ?? {}),
      agentOnline: true,
      helperVersion: response.version,
      helperMessage: preflightJob.error ?? preflightJob.summary,
      helperCheckedAt: new Date().toISOString(),
      jobs: [preflightJob, ...(prev?.jobs ?? [])],
      certificates: prev?.certificates ?? []
    }));

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
    const issuePassword = await resolveCustomerRenewalIssuePassword();
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

    setCustomerRenewalAssistant((prev) => ({
      ...(prev ?? {}),
      agentOnline: true,
      helperVersion: response.version,
      helperMessage: status.statusText,
      helperCheckedAt: new Date().toISOString(),
      jobs: [preflightJob, ...(prev?.jobs ?? [])],
      certificates: prev?.certificates ?? []
    }));

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

    setCustomerRenewalAssistant((prev) => ({
      ...(prev ?? {}),
      agentOnline: true,
      helperVersion: response.version,
      helperMessage: response.result.message,
      helperCheckedAt: new Date().toISOString(),
      jobs: prev?.jobs ?? [],
      certificates: prev?.certificates ?? []
    }));

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
    const confirmed = await showAppConfirm(
      `${customer.customerName} 고객을 팝빌 테스트 서버에서 탈퇴시킵니다.\n이 작업은 팝빌 테스트 환경의 연동회원 자체를 제거합니다.\n계속할까요?`,
      {
        title: "팝빌 테스트 회원 탈퇴",
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
    const result = await api<{ url: string }>(`/api/drafts/${draftId}/popbill/${type}`);
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const issueAllReviewDrafts = async () => {
    const targets = data?.drafts.filter((draft) => draft.status === "review" || draft.status === "failed") ?? [];
    if (targets.length === 0) {
      await showAppAlert("발행할 검수 대기/실패 건이 없습니다.", {
        title: "전체 발행"
      });
      return;
    }

    const confirmed = await showAppConfirm(`검수 대기/실패 ${targets.length}건을 전체 발행합니다.\n계속할까요?`, {
      title: "전체 발행 확인",
      tone: "warn",
      confirmLabel: "전체 발행"
    });
    if (!confirmed) return;

    const result = await api<{ total: number; issued: number; failed: number }>("/api/drafts/issue-all", {
      method: "POST"
    });
    await showAppAlert(`전체 발행 완료\n대상: ${result.total}건\n성공: ${result.issued}건\n실패: ${result.failed}건`, {
      title: "전체 발행 완료",
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
      "이 발행 건을 취소하고 검수 대기로 되돌립니다.\n취소 후에는 같은 건을 다시 발행할 수 있습니다.\n계속할까요?",
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
        <div className="landing-shell">
          <header className="landing-topbar">
          <div className="landing-topbar-inner">
            <button type="button" className="landing-brand" onClick={() => scrollToLandingSection("landing-top")}>
              <span className="brand-badge landing-brand-badge">AT</span>
              <span className="landing-brand-copy">
                <strong>AUTO-TAX</strong>
                <span>태양광 회사 전자세금계산서 운영</span>
              </span>
            </button>
            <nav className="landing-nav" aria-label="공개 페이지 탐색">
              <button type="button" className="landing-nav-button" onClick={() => scrollToLandingSection("landing-pricing")}>
                가격 안내
              </button>
              <button type="button" className="landing-nav-button" onClick={() => openSupportRequest()}>
                도입 문의
              </button>
            </nav>
            <div className="landing-topbar-actions">
              <button type="button" className="btn-secondary" onClick={() => scrollToLandingSection("landing-login-card")}>
                로그인
              </button>
            </div>
          </div>
        </header>

        <main className="landing-main">
          <section className="landing-hero-grid" id="landing-top">
            <div className="landing-hero-panel">
              <div className="landing-hero-copy">
                <div className="landing-badge-row">
                  <span className="auth-badge">태양광 회사용</span>
                  <span className="landing-inline-note">관리 고객 수 기준 월 구독형</span>
                </div>
                <h1>태양광 회사의 전자세금계산서 업무를 더 빠르고 정확하게</h1>
                <p>한전 메일 확인부터 초안 작성, 검수 후 발행까지 한 화면에서 처리하는 운영 도구입니다.</p>
              </div>
              <div className="landing-hero-actions">
                <button type="button" onClick={() => scrollToLandingSection("landing-pricing")}>
                  예상 요금 확인하기
                </button>
                <button type="button" className="btn-secondary" onClick={() => openSupportRequest()}>
                  도입 문의
                </button>
              </div>
              <div className="landing-proof-grid">
                {LANDING_HERO_POINTS.map((item) => (
                  <article key={item.label} className="landing-proof-card">
                    <span className="landing-proof-label">{item.label}</span>
                    <strong>{item.value}</strong>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <aside className="landing-side-panel">
              <section className="auth-card landing-auth-card" id="landing-login-card">
                <div className="auth-copy">
                  <span className="auth-badge">작업공간 로그인</span>
                  <h2>도입 문의와 로그인</h2>
                  <p>계정이 있으면 바로 로그인하고, 도입 전이면 아래에서 문의를 남기면 됩니다.</p>
                </div>
                <form className="auth-form" onSubmit={(event) => void signIn(event)}>
                  <label>
                    <span>로그인 계정</span>
                    <input
                      value={signInAccount}
                      onChange={(event) => setSignInAccount(event.target.value)}
                      placeholder="고객사 사용자: 로그인 아이디 / 플랫폼 관리자: 이메일"
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label>
                    <span>비밀번호</span>
                    <input
                      type="password"
                      value={signInPassword}
                      onChange={(event) => setSignInPassword(event.target.value)}
                      placeholder="비밀번호 입력"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  {authNotice ? <div className="alert success">{authNotice}</div> : null}
                  {error ? <div className="alert error">{error}</div> : null}
                  <div className="auth-actions">
                    <button type="submit" disabled={authBusy}>
                      {authBusy ? "로그인 중..." : "로그인"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowSupportRequestForm((prev) => !prev)}
                      disabled={supportRequestBusy}
                    >
                      {showSupportRequestForm ? "문의 닫기" : "도입 문의"}
                    </button>
                  </div>
                  <p className="field-hint">계정이 없으면 `도입 문의`에서 회사명, 담당자, 연락처를 남겨주세요.</p>
                </form>
                {showSupportRequestForm ? (
                  <div className="auth-form support-request-box">
                    <label>
                      <span>회사명</span>
                      <input
                        value={supportRequestForm.companyName}
                        onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, companyName: event.target.value }))}
                        placeholder="회사명 입력"
                      />
                    </label>
                    <label>
                      <span>담당자명</span>
                      <input
                        value={supportRequestForm.requesterName}
                        onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterName: event.target.value }))}
                        placeholder="담당자 이름"
                      />
                    </label>
                    <label>
                      <span>이메일</span>
                      <input
                        type="email"
                        value={supportRequestForm.requesterEmail}
                        onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterEmail: event.target.value }))}
                        placeholder="reply 받을 이메일"
                      />
                    </label>
                    <label>
                      <span>연락처</span>
                      <input
                        value={supportRequestForm.requesterPhone}
                        onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterPhone: event.target.value }))}
                        placeholder="전화번호 또는 휴대폰"
                      />
                    </label>
                    <label>
                      <span>요청 내용</span>
                      <textarea
                        rows={5}
                        value={supportRequestForm.message}
                        onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, message: event.target.value }))}
                        placeholder="작업공간 개통 요청 내용, 필요한 기능, 문의사항을 적어주세요."
                      />
                    </label>
                    <div className="auth-actions">
                      <button type="button" onClick={() => void submitSupportRequest()} disabled={supportRequestBusy}>
                        {supportRequestBusy ? "보내는 중..." : "보내기"}
                      </button>
                    </div>
                    <p className="field-hint">문의는 `ehdrjs0887@gmail.com`으로 접수됩니다.</p>
                  </div>
                ) : null}
              </section>
            </aside>
          </section>

          <section className="landing-section" id="landing-pricing">
            <div className="landing-section-head">
              <span className="landing-eyebrow">가격 안내</span>
              <h2>관리 고객 수에 따라 자동 계산되는 월 구독형 요금제</h2>
              <p>기본 50곳 포함, 초과 고객은 1곳당 추가 과금됩니다.</p>
            </div>
            <div className="landing-pricing-layout">
              <div className="landing-pricing-grid">
                {(Object.values(PUBLIC_PRICING_PLANS) as PublicPricingPlan[]).map((plan) => (
                  <article
                    key={plan.id}
                    className={plan.id === pricingPlanId ? "landing-price-card landing-price-card-active" : "landing-price-card"}
                  >
                    <div className="landing-price-card-head">
                      <span className="landing-price-badge">{plan.badge}</span>
                      <h3>{plan.label}</h3>
                    </div>
                    <p>{plan.headline}</p>
                    <div className="landing-price-figure">{formatMoney(plan.basePrice)}원</div>
                    <div className="landing-price-caption">{plan.includedCustomers}곳 이하</div>
                    <div className="landing-price-inline">
                      <span>초과 고객 1곳당</span>
                      <strong>{formatMoney(plan.overagePrice)}원</strong>
                    </div>
                    <div className="landing-price-examples">
                      {PRICING_EXAMPLE_COUNTS.map((count) => (
                        <div key={`${plan.id}-${count}`} className="landing-price-example-row">
                          <span>{count.toLocaleString("ko-KR")}곳</span>
                          <strong>{formatMoney(calculatePublicPrice(plan.id, count).totalPrice)}원</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <aside className="landing-card landing-calculator-card">
                <div className="landing-calculator-head">
                  <h3>예상 요금 계산기</h3>
                  <p>관리 고객 수를 입력하면 예상 월 구독료를 바로 확인할 수 있습니다.</p>
                </div>
                <div className="landing-segmented" role="tablist" aria-label="요금 기준 선택">
                  {(Object.values(PUBLIC_PRICING_PLANS) as PublicPricingPlan[]).map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      className={plan.id === pricingPlanId ? "active" : ""}
                      onClick={() => setPricingPlanId(plan.id)}
                    >
                      {plan.label}
                    </button>
                  ))}
                </div>
                <label className="landing-form-field">
                  <span>관리 고객 수</span>
                  <input
                    value={managedCustomerCountInput}
                    onChange={(event) => setManagedCustomerCountInput(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                    inputMode="numeric"
                    placeholder="예: 220"
                  />
                </label>
                <div className="landing-calculator-total">
                  <span>예상 월 구독료</span>
                  <strong>{formatMoney(publicPricing.totalPrice)}원</strong>
                  <p>{publicPricing.plan.label} 기준</p>
                </div>
                <div className="landing-breakdown-grid">
                  <div>
                    <span>기본 포함</span>
                    <strong>{publicPricing.includedCustomers.toLocaleString("ko-KR")}곳</strong>
                  </div>
                  <div>
                    <span>초과 고객 수</span>
                    <strong>{publicPricing.overageCount.toLocaleString("ko-KR")}곳</strong>
                  </div>
                  <div>
                    <span>초과분 금액</span>
                    <strong>{formatMoney(publicPricing.overagePrice)}원</strong>
                  </div>
                </div>
                <p className="landing-fineprint">외부 연동 서비스 정책 변경 시 요금 정책이 조정될 수 있습니다.</p>
                <div className="landing-hero-actions landing-calculator-actions">
                  <button type="button" onClick={() => openSupportRequest(buildSupportRequestPrefill(pricingPlanId, publicManagedCustomerCount))}>
                    이 규모로 도입 문의
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => scrollToLandingSection("landing-login-card")}>
                    로그인
                  </button>
                </div>
              </aside>
            </div>
          </section>

          </main>
        </div>
        {appDialog ? <AppDialog dialog={appDialog} onConfirm={() => closeAppDialog(true)} onCancel={() => closeAppDialog(false)} /> : null}
      </>
    );
  }

  if (!data || !settingsForm) {
    return <div className="loading-shell">AUTO-TAX 초기 데이터를 불러오는 중입니다.</div>;
  }

  const isPlatformAdmin = data.auth.isPlatformAdmin;
  const hasActiveWorkspace = Boolean(data.auth.activeOrganizationId);
  const currentMembership =
    (data.auth.activeOrganizationId
      ? data.auth.organizations.find((organization) => organization.organizationId === data.auth.activeOrganizationId) ?? null
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
  const settingsHealth = {
    mailReady: Boolean(
      data.settings.imapUser &&
      data.settings.smtpUser &&
      data.settings.mailPasswordConfigured &&
      data.settings.mailConnectionVerifiedAt
    ),
    popbillReady: data.settings.popbillConfigured,
    operatorReady: data.settings.operatorConfigured
  };
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
  const onboardingElectronicTaxBusinessNumbers = new Set(
    (customerOnboardingWorkbook?.certificates ?? [])
      .filter((certificate) => certificate.certificateKind === "electronic_tax")
      .map((certificate) => digitsOnly(certificate.businessNumber))
      .filter((businessNumber): businessNumber is string => Boolean(businessNumber))
  );
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
  const customerOnboardingSessionActive =
    customerOnboardingSessionState.commitDone ||
    customerOnboardingSessionState.previewReady ||
    customerOnboardingWorkbook !== null ||
    customerOnboardingPreview !== null ||
    customerOnboardingFileName.trim() !== "";
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
  const setupChecklist = [
    { key: "gmail", label: "메일 계정 연결", done: settingsHealth.mailReady },
    { key: "defaults", label: "발행 기본값 입력", done: settingsHealth.popbillReady && settingsHealth.operatorReady },
    {
      key: "helper",
      label: "로컬 헬퍼 준비",
      done: Boolean(customerRenewalAssistant?.agentOnline) && (customerRenewalAssistant?.certificates ?? []).length > 0
    },
    { key: "customer", label: "고객 초기 등록", done: customerRegistrationReady },
    { key: "certificate", label: "발행용 인증서 준비", done: customerRegistrationReady && popbillPendingCustomers.length === 0 }
  ];
  const setupPendingCount = setupChecklist.filter((step) => !step.done).length;
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
  const customerRenewalAssistantJobs = customerRenewalAssistant?.jobs ?? [];
  const customerRenewalAssistantAllCertificates = customerRenewalAssistant?.certificates ?? [];
  const customerRenewalAssistantCertificates = (customerRenewalAssistant?.certificates ?? []).filter(isElectronicTaxCertificate);
  const canUseCustomerRenewalAssistant = data.auth.activeOrganizationRole !== "viewer";
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
  const customerCertificateItems: CustomerCertificateCandidateView[] = [
    ...data.customerCertificates.map((storedCertificate) => {
      const linkedCustomer = data.customers.find((customer) => customer.id === storedCertificate.customerId) ?? null;
      const localCertificate = findLocalCertificateForStoredCustomerCertificate(
        storedCertificate,
        customerRenewalAssistantAllCertificates
      );
      const preflightProbe = localCertificate
        ? getLatestRenewalPreflightProbeForCertificate(localCertificate, customerRenewalAssistantJobs, null)
        : null;
      const status = localCertificate
        ? formatCustomerRenewalStatus(preflightProbe)
        : {
            statusText: customerRenewalAssistant?.agentOnline ? "연결됨 · 로컬 인증서 읽기 전" : "연결됨",
            statusTone: "default" as const,
            paymentAmount: null,
            canOpenPayment: false
          };

      return {
        key: getStoredCustomerCertificateKey(storedCertificate),
        certificateIndex: localCertificate ? String(localCertificate.index) : getStoredCustomerCertificateKey(storedCertificate),
        certificateCn: storedCertificate.certificateName || linkedCustomer?.customerName || `연결된 인증서 #${storedCertificate.id}`,
        certificateKind: storedCertificate.certificateKind,
        certificateUsage: storedCertificate.certificateUsageName,
        issuerName: storedCertificate.issuerName,
        certificateExpireDate: storedCertificate.expireDate,
        linkedCertificateId: storedCertificate.id,
        linkedCustomerId: linkedCustomer?.id ?? null,
        linkedCustomerLabel: linkedCustomer ? `${linkedCustomer.customerName} · ${linkedCustomer.corpName}` : null,
        linkSource: storedCertificate.linkSource,
        suggestedCustomerId: null,
        suggestedCustomerLabel: null,
        suggestionCount: 0,
        statusText: status.statusText,
        statusTone: status.statusTone,
        paymentAmount: status.paymentAmount,
        canOpenPayment: status.canOpenPayment
      } satisfies CustomerCertificateCandidateView;
    }),
    ...customerRenewalAssistantAllCertificates
      .filter((certificate) => !findStoredCustomerCertificateForLocalCertificate(certificate, data.customerCertificates))
      .map((certificate) => {
        const candidateCustomers = findCandidateCustomersForCertificate(certificate, data.customers);
        const suggestedCustomer = candidateCustomers.length === 1 ? candidateCustomers[0] ?? null : null;
        const preflightProbe = getLatestRenewalPreflightProbeForCertificate(certificate, customerRenewalAssistantJobs, null);
        const status = formatCustomerRenewalStatus(preflightProbe);

        return {
          key: getLocalCertificateKey(certificate),
          certificateIndex: String(certificate.index),
          certificateCn: certificate.cn || `인증서 #${certificate.index}`,
          certificateKind: deriveCustomerCertificateKind(certificate),
          certificateUsage: certificate.usageToName,
          issuerName: certificate.issuerToName,
          certificateExpireDate: certificate.todate ?? certificate.detailValidateTo ?? null,
          linkedCertificateId: null,
          linkedCustomerId: null,
          linkedCustomerLabel: null,
          linkSource: null,
          suggestedCustomerId: suggestedCustomer?.id ?? null,
          suggestedCustomerLabel: suggestedCustomer ? `${suggestedCustomer.customerName} · ${suggestedCustomer.corpName}` : null,
          suggestionCount: candidateCustomers.length,
          statusText: status.statusText,
          statusTone: status.statusTone,
          paymentAmount: status.paymentAmount,
          canOpenPayment: status.canOpenPayment
        } satisfies CustomerCertificateCandidateView;
      })
  ]
    .sort((left, right) => {
      const kindOrder = (kind: CustomerCertificateKind) => {
        if (kind === "electronic_tax") return 0;
        if (kind === "general_personal") return 1;
        if (kind === "general_business") return 2;
        return 3;
      };
      const linkPriority = Number(Boolean(right.linkedCustomerId)) - Number(Boolean(left.linkedCustomerId));
      if (linkPriority !== 0) {
        return linkPriority;
      }
      const kindPriority = kindOrder(left.certificateKind) - kindOrder(right.certificateKind);
      if (kindPriority !== 0) {
        return kindPriority;
      }
      const leftTime = left.certificateExpireDate ? new Date(left.certificateExpireDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.certificateExpireDate ? new Date(right.certificateExpireDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || left.certificateCn.localeCompare(right.certificateCn, "ko");
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
  const workspacePopbillIsTest = data.settings.popbillIsTest;
  const workspacePopbillModeLabel = workspacePopbillIsTest ? "팝빌 테스트" : "팝빌 운영";
  const renewalHelperDownloadUrl = customerRenewalAssistant?.releaseDownloadUrl || defaultRenewalHelperDownloadUrl;
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
  const canManageOrganizationMembers = data.auth.activeOrganizationRole === "owner";
  const linkedCustomerCertificateCount = customerCertificateItems.filter((item) => item.linkedCustomerId !== null).length;
  const helperUpgradeRequired = customerRenewalAssistant?.upgradeState === "upgrade-required";
  const helperUpgradeAvailable = customerRenewalAssistant?.upgradeState === "upgrade-available";
  const helperActionBlockedReason =
    customerRenewalAssistant?.upgradeMessage
      ? `${customerRenewalAssistant.upgradeMessage} 압축을 다시 받아 scripts\\renewal-helper-install.cmd 를 실행한 뒤 상태를 다시 확인하세요.`
      : "지원되지 않는 로컬 헬퍼 버전입니다. 새 버전을 다시 설치한 뒤 상태를 다시 확인하세요.";
  const helperReady =
    Boolean(customerRenewalAssistant?.agentOnline) &&
    customerRenewalAssistantAllCertificates.length > 0 &&
    !helperUpgradeRequired;
  const issueSetupPendingCount = popbillPendingCustomers.length;
  const onboardingIssueSetupPendingCount = onboardingPendingCertificateCustomers.length;
  const onboardingCertificateReady = onboardingCustomerRegistrationReady && onboardingIssueSetupPendingCount === 0;
  const onboardingFirstSyncReady = data.inbox.length > 0 || data.drafts.length > 0;
  const exceptionHandlingReady = onboardingFirstSyncReady && unmatchedMessages.length === 0;
  const firstIssueCheckReady =
    onboardingFirstSyncReady &&
    unmatchedMessages.length === 0 &&
    (issuedDrafts.length > 0 || reviewDrafts.length === 0);
  const recommendedSettingsSection: SettingsSectionId = !settingsHealth.mailReady
    ? "gmail"
    : !(settingsHealth.popbillReady && settingsHealth.operatorReady)
      ? "popbill"
      : !helperReady
        ? "helper"
        : "account";
  const openSettingsSection = (section: SettingsSectionId = recommendedSettingsSection) => {
    setActiveSettingsSection(section);
    setActiveTab("settings");
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
            actionLabel: "설정에서 확인",
            onAction: () => {
              openSettingsSection("helper");
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
  const settingsSections: Array<{
    id: SettingsSectionId;
    step: number;
    title: string;
    done: boolean;
    summary: string;
  }> = [
    {
      id: "gmail",
      step: 1,
      title: "메일 연결",
      done: settingsHealth.mailReady,
      summary: settingsHealth.mailReady ? data.settings.imapUser || "준비됨" : "연결 테스트 필요"
    },
    {
      id: "popbill",
      step: 2,
      title: "발행 설정",
      done: settingsHealth.popbillReady && settingsHealth.operatorReady,
      summary: settingsHealth.popbillReady && settingsHealth.operatorReady ? "준비됨" : "필수값 입력"
    },
    {
      id: "helper",
      step: 3,
      title: "인증서 / 헬퍼",
      done: helperReady,
      summary: helperReady
        ? `준비됨 · ${customerRenewalAssistantAllCertificates.length}건 읽음`
        : helperUpgradeRequired
          ? "재설치 필요"
          : customerRenewalAssistant?.agentOnline
            ? helperUpgradeAvailable
              ? "업데이트 권장"
              : "헬퍼 연결됨 · 읽기 확인"
            : "헬퍼 준비 필요"
    },
    {
      id: "account",
      step: 4,
      title: "계정 / 작업공간",
      done: true,
      summary: canManageOrganizationMembers ? "사용자 / 비밀번호" : "비밀번호 변경"
    }
  ];
  const settingsAutosaveLabel =
    settingsAutosaveState === "saving"
      ? "자동 저장 중"
      : settingsAutosaveState === "error"
        ? "저장 실패"
        : settingsAutosaveState === "pending"
          ? "저장 대기"
          : "자동 저장";
  const isMailTesting = busyKey === "mail-test";
  const startCreatingCustomer = () => {
    setCreatingCustomer(true);
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
        `${customer.customerName} 고객의 전자세금용 공동인증서 비밀번호가 없습니다. 엑셀의 인증서 비밀번호를 입력하거나 시스템 설정의 공통 비밀번호를 먼저 저장하세요.`
      );
    }

    const certRegistrationUrl = await getCustomerCertificateRegistrationUrl(customer.id);
    const registrationResponse = await requestLocalPopbillCertificateRegistration({
      certificateRegistrationUrl: certRegistrationUrl,
      certificateCn:
        onboardingCertificateRow?.certificateName.trim() ||
        linkedCertificate?.certificateName.trim() ||
        customer.corpName.trim() ||
        customer.customerName.trim(),
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
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev)
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

    const completedNames: string[] = [];
    const alreadyRegisteredNames: string[] = [];
    const failedDetails: string[] = [];
    const refreshWarnings: string[] = [];

    for (const customer of pendingCustomers) {
      const onboardingCertificateRow = getOnboardingElectronicTaxCertificateRow(customer);
      if (!onboardingCertificateRow) {
        failedDetails.push(`${customer.customerName}: 전자세금용 공동인증서 업로드 정보를 찾지 못했습니다.`);
        continue;
      }

      try {
        const result = await registerCustomerElectronicTaxCertificateAutomatically(customer, {
          onboardingCertificateRow,
          reloadAfter: false
        });
        if (result.outcome === "already-registered") {
          alreadyRegisteredNames.push(customer.customerName);
        } else {
          completedNames.push(customer.customerName);
        }
        if (result.refreshErrorMessage) {
          refreshWarnings.push(`${customer.customerName}: ${result.refreshErrorMessage}`);
        }
      } catch (error) {
        failedDetails.push(`${customer.customerName}: ${error instanceof Error ? error.message : "자동 등록 실패"}`);
      }
    }

    try {
      await load();
    } catch (error) {
      refreshWarnings.push(`전체 새로고침 실패: ${error instanceof Error ? error.message : "새로고침 실패"}`);
    }

    const summaryParts = [
      completedNames.length > 0 ? `자동 등록 ${completedNames.length}건` : null,
      alreadyRegisteredNames.length > 0 ? `이미 등록 ${alreadyRegisteredNames.length}건` : null,
      failedDetails.length > 0 ? `실패 ${failedDetails.length}건` : null
    ].filter((value): value is string => Boolean(value));

    setCustomerOnboardingNotice(
      `전자세금용 인증서 후속 등록을 마쳤습니다. ${summaryParts.join(" · ") || "처리된 대상이 없습니다."}${
        failedDetails.length > 0
          ? `\n\n실패 내역\n${failedDetails.slice(0, 8).join("\n")}`
          : ""
      }${
        refreshWarnings.length > 0
          ? `\n\n상태 반영 경고\n${refreshWarnings.slice(0, 5).join("\n")}`
          : ""
      }`
    );
  };
  const refreshSingleCustomerCertificateStatus = async (customerId: number) => {
    await api(`/api/customers/${customerId}/popbill/cert-status`, { method: "POST" });
  };
  const detectedMailProviderLabel = MAIL_PROVIDER_CONFIG[inferMailProviderFromAddress(settingsForm.mailAddress, settingsForm.mailProvider)].label;
  const handleSettingsMailAddressChange = (nextAddress: string) => {
    setSettingsForm((prev) => {
      if (!prev) return prev;
      const nextProvider = inferMailProviderFromAddress(nextAddress, prev.mailProvider);
      const config = MAIL_PROVIDER_CONFIG[nextProvider];
      return {
        ...prev,
        mailAddress: nextAddress,
        mailProvider: nextProvider,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        imapSecure: config.imapSecure,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpSecure: config.smtpSecure
      };
    });
  };
  const canRunOnboardingFirstSync =
    settingsHealth.mailReady &&
    settingsHealth.popbillReady &&
    settingsHealth.operatorReady &&
    helperReady &&
    onboardingCertificateReady;
  const hasSavedOnboardingDefaults =
    data.settings.popbillSharedPasswordConfigured ||
    data.settings.renewalIssuePasswordConfigured ||
    data.settings.renewalCertificatePasswordConfigured;
  const onboardingImportableCount =
    (customerOnboardingPreview?.createCount ?? 0) + (customerOnboardingPreview?.updateCount ?? 0);
  const onboardingBlockedCount = customerOnboardingPreview?.rows.filter((row) => row.status === "blocked").length ?? 0;
  const onboardingHelperStatusLine = helperReady
    ? `인증서 ${customerRenewalAssistantAllCertificates.length}건 읽음`
    : helperUpgradeRequired
      ? helperActionBlockedReason
      : helperUpgradeAvailable && customerRenewalAssistant?.upgradeMessage
        ? customerRenewalAssistant.upgradeMessage
        : customerRenewalAssistant?.agentOnline
          ? "헬퍼 연결됨"
          : "상태 미확인";
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
  const onboardingFirstSyncBlockedSteps = [
    !settingsHealth.mailReady ? "메일 연결" : null,
    !(settingsHealth.popbillReady && settingsHealth.operatorReady) ? "발행 기본값 입력" : null,
    !helperReady ? "로컬 헬퍼 준비" : null,
    !onboardingCustomerRegistrationReady ? "고객 초기 등록" : null,
    !onboardingCertificateReady ? "인증서 연결 마무리" : null
  ].filter((value): value is string => Boolean(value));
  const onboardingRequiredHintText = "필수 입력 사항입니다.";
  const onboardingMailAddressMissing = settingsForm.mailAddress.trim() === "";
  const onboardingMailAddressInvalid =
    !onboardingMailAddressMissing && !isLikelyEmailAddress(settingsForm.mailAddress);
  const onboardingMailAddressHasError =
    onboardingMailAddressMissing || onboardingMailAddressInvalid;
  const onboardingMailPasswordMissing =
    settingsForm.mailPassword.trim() === "" && !data.settings.mailPasswordConfigured;
  const onboardingPopbillPrefixMissing = settingsForm.popbillUserIdPrefix.trim() === "";
  const onboardingOperatorNameMissing = settingsForm.operatorContactName.trim() === "";
  const onboardingOperatorTelMissing = settingsForm.operatorContactTel.trim() === "";
  const onboardingOperatorEmailMissing = settingsForm.operatorContactEmail.trim() === "";
  const onboardingOperatorEmailInvalid =
    !onboardingOperatorEmailMissing && !isLikelyEmailAddress(settingsForm.operatorContactEmail);
  const onboardingOperatorEmailHasError =
    onboardingOperatorEmailMissing || onboardingOperatorEmailInvalid;
  const onboardingPopbillSharedPasswordMissing =
    settingsForm.popbillSharedPassword.trim() === "" &&
    !data.settings.popbillSharedPasswordConfigured;
  const onboardingRenewalIssuePasswordMissing =
    normalizeRenewalIssuePasswordInput(settingsForm.renewalIssuePassword).length === 0 &&
    !data.settings.renewalIssuePasswordConfigured;
  const getOnboardingRequiredFieldClassName = (hasError: boolean) =>
    hasError ? "onboarding-required-field is-missing" : "onboarding-required-field";
  const getOnboardingRequiredLabelClassName = (hasError: boolean) =>
    hasError ? "onboarding-required-label is-missing" : "onboarding-required-label";
  const getOnboardingRequiredInputClassName = (hasError: boolean) =>
    hasError ? "onboarding-required-input is-missing" : "onboarding-required-input";
  const getOnboardingRequiredHintClassName = (hasError: boolean) =>
    hasError ? "field-hint onboarding-required-hint is-missing" : "field-hint onboarding-required-hint";
  const renderOnboardingRequiredHint = (
    hintId: string,
    options: { missing: boolean; invalid?: boolean; invalidText?: string; defaultText?: string }
  ) => {
    const hasError = options.missing || Boolean(options.invalid);
    const hintText = options.missing
      ? onboardingRequiredHintText
      : options.invalid
        ? options.invalidText
        : options.defaultText;
    if (!hintText) {
      return null;
    }
    return (
      <span id={hintId} className={getOnboardingRequiredHintClassName(hasError)}>
        {hintText}
      </span>
    );
  };
  const onboardingMailSetupContent = (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy">
          <strong>
            {settingsHealth.mailReady
              ? "메일 연결 완료"
              : "메일 주소와 앱 비밀번호만 입력하세요."}
          </strong>
          <p>지금은 연결만 확인합니다.</p>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>자동 저장</span>
            <strong>{settingsAutosaveLabel}</strong>
          </div>
          <div>
            <span>메일 서비스</span>
            <strong>{detectedMailProviderLabel}</strong>
          </div>
          <div>
            <span>테스트 의미</span>
            <strong>연결만 확인</strong>
          </div>
        </div>

        <div className="onboarding-field-grid">
          <label className={getOnboardingRequiredFieldClassName(onboardingMailAddressHasError)} data-required-empty={onboardingMailAddressMissing ? "true" : undefined}>
            <span className={getOnboardingRequiredLabelClassName(onboardingMailAddressHasError)}>메일 주소</span>
            <input
              type="email"
              className={getOnboardingRequiredInputClassName(onboardingMailAddressHasError)}
              placeholder="example@mail.com"
              value={settingsForm.mailAddress}
              aria-invalid={onboardingMailAddressHasError || undefined}
              aria-describedby="onboarding-mail-address-hint"
              onChange={(event) => handleSettingsMailAddressChange(event.target.value)}
            />
            {renderOnboardingRequiredHint(
              "onboarding-mail-address-hint",
              {
                missing: onboardingMailAddressMissing,
                invalid: onboardingMailAddressInvalid,
                invalidText: "메일 형식이 올바르지 않습니다.",
                defaultText: "한전 메일을 읽고 알림 메일을 보낼 때 함께 사용할 계정입니다."
              }
            )}
          </label>
          <label className={getOnboardingRequiredFieldClassName(onboardingMailPasswordMissing)} data-required-empty={onboardingMailPasswordMissing ? "true" : undefined}>
            <span className={getOnboardingRequiredLabelClassName(onboardingMailPasswordMissing)}>앱 비밀번호</span>
            <div className={onboardingMailPasswordMissing ? "password-field onboarding-password-field is-missing" : "password-field onboarding-password-field"}>
              <input
                className={getOnboardingRequiredInputClassName(onboardingMailPasswordMissing)}
                type={revealedFields.mailPassword ? "text" : "password"}
                value={settingsForm.mailPassword}
                aria-invalid={onboardingMailPasswordMissing || undefined}
                aria-describedby="onboarding-mail-password-hint"
                onChange={(event) => setSettingsForm((prev) => prev && { ...prev, mailPassword: event.target.value })}
                placeholder={data.settings.mailPasswordConfigured ? "변경할 때만 다시 입력" : "앱 비밀번호 입력"}
              />
              <button type="button" className="password-toggle" aria-label={revealedFields.mailPassword ? "앱 비밀번호 숨기기" : "앱 비밀번호 보기"} onClick={() => toggleRevealField("mailPassword")}>
                <RevealIcon open={Boolean(revealedFields.mailPassword)} />
              </button>
            </div>
            {renderOnboardingRequiredHint(
              "onboarding-mail-password-hint",
              {
                missing: onboardingMailPasswordMissing,
                defaultText: data.settings.mailPasswordConfigured
                  ? "이미 저장된 앱 비밀번호가 있습니다. 바꿀 때만 다시 입력하세요. 테스트 시 빈칸이면 저장된 값을 사용합니다."
                  : "위 메일 주소로 로그인할 때 쓰는 앱 비밀번호입니다."
              }
            )}
          </label>
        </div>

        <div className="button-row onboarding-primary-row">
          <button type="button" disabled={busyKey !== null} onClick={() => void runAction("mail-test", testMailSettings, { reload: false })}>
            {isMailTesting ? "연결 테스트 중..." : "메일 연결 테스트"}
          </button>
        </div>
      </section>

      <details className="settings-advanced-panel">
        <summary>알림 메일 / 추가 설정은 나중에 보기</summary>
        <div className="onboarding-secondary-stack">
          <label>
            알림 수신 메일
            <textarea rows={4} value={settingsForm.notificationEmailsText} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, notificationEmailsText: event.target.value })} />
            <span className="field-hint">파싱 실패나 발행 실패 알림을 받을 주소입니다. 여러 개면 줄바꿈이나 쉼표로 구분합니다.</span>
          </label>
        </div>
      </details>
    </div>
  );
  const onboardingDefaultsContent = (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy">
          <strong>
            {settingsHealth.popbillReady && settingsHealth.operatorReady
              ? "필수값 입력 완료"
              : "필수값만 먼저 입력하세요."}
          </strong>
          <p>선택값은 나중에 입력해도 됩니다.</p>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>자동 저장</span>
            <strong>{settingsAutosaveLabel}</strong>
          </div>
          <div>
            <span>팝빌 연결</span>
            <strong>{settingsHealth.popbillReady ? "준비됨" : "입력 필요"}</strong>
          </div>
          <div>
            <span>운영값</span>
            <strong>{settingsHealth.operatorReady ? "준비됨" : "입력 필요"}</strong>
          </div>
        </div>

        <section className="onboarding-section">
          <div className="onboarding-section-head">
            <strong>필수 입력</strong>
            <span>먼저 채울 값</span>
          </div>
          <div className="onboarding-field-grid">
            <label className={getOnboardingRequiredFieldClassName(onboardingPopbillPrefixMissing)} data-required-empty={onboardingPopbillPrefixMissing ? "true" : undefined}>
              <span className={getOnboardingRequiredLabelClassName(onboardingPopbillPrefixMissing)}>팝빌 접두어</span>
              <input
                id="onboarding-popbill-user-id-prefix"
                className={getOnboardingRequiredInputClassName(onboardingPopbillPrefixMissing)}
                value={settingsForm.popbillUserIdPrefix}
                aria-invalid={onboardingPopbillPrefixMissing || undefined}
                aria-describedby="onboarding-popbill-prefix-hint"
                onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillUserIdPrefix: event.target.value })}
                placeholder="예: TEST_"
              />
              {renderOnboardingRequiredHint(
                "onboarding-popbill-prefix-hint",
                {
                  missing: onboardingPopbillPrefixMissing,
                  defaultText: "예: `TEST_001` · 신규 고객 팝빌 아이디 앞에 붙습니다."
                }
              )}
            </label>
            <label className={getOnboardingRequiredFieldClassName(onboardingOperatorNameMissing)} data-required-empty={onboardingOperatorNameMissing ? "true" : undefined}>
              <span className={getOnboardingRequiredLabelClassName(onboardingOperatorNameMissing)}>담당자 이름</span>
              <input
                className={getOnboardingRequiredInputClassName(onboardingOperatorNameMissing)}
                value={settingsForm.operatorContactName}
                aria-invalid={onboardingOperatorNameMissing || undefined}
                aria-describedby="onboarding-operator-name-hint"
                onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactName: event.target.value })}
                placeholder="담당자 이름"
              />
              {renderOnboardingRequiredHint("onboarding-operator-name-hint", { missing: onboardingOperatorNameMissing })}
            </label>
            <label className={getOnboardingRequiredFieldClassName(onboardingOperatorTelMissing)} data-required-empty={onboardingOperatorTelMissing ? "true" : undefined}>
              <span className={getOnboardingRequiredLabelClassName(onboardingOperatorTelMissing)}>담당자 연락처</span>
              <input
                className={getOnboardingRequiredInputClassName(onboardingOperatorTelMissing)}
                value={settingsForm.operatorContactTel}
                aria-invalid={onboardingOperatorTelMissing || undefined}
                aria-describedby="onboarding-operator-tel-hint"
                onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactTel: event.target.value })}
                placeholder="01012345678"
              />
              {renderOnboardingRequiredHint("onboarding-operator-tel-hint", { missing: onboardingOperatorTelMissing })}
            </label>
            <label className={getOnboardingRequiredFieldClassName(onboardingOperatorEmailHasError)} data-required-empty={onboardingOperatorEmailMissing ? "true" : undefined}>
              <span className={getOnboardingRequiredLabelClassName(onboardingOperatorEmailHasError)}>담당자 이메일</span>
              <input
                type="email"
                className={getOnboardingRequiredInputClassName(onboardingOperatorEmailHasError)}
                value={settingsForm.operatorContactEmail}
                aria-invalid={onboardingOperatorEmailHasError || undefined}
                aria-describedby="onboarding-operator-email-hint"
                onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactEmail: event.target.value })}
                placeholder="operator@example.com"
              />
              {renderOnboardingRequiredHint("onboarding-operator-email-hint", {
                missing: onboardingOperatorEmailMissing,
                invalid: onboardingOperatorEmailInvalid,
                invalidText: "메일 형식이 올바르지 않습니다."
              })}
            </label>
            <label className={getOnboardingRequiredFieldClassName(onboardingPopbillSharedPasswordMissing)} data-required-empty={onboardingPopbillSharedPasswordMissing ? "true" : undefined}>
              <span className={getOnboardingRequiredLabelClassName(onboardingPopbillSharedPasswordMissing)}>신규 고객 기본 비밀번호</span>
              <div className={onboardingPopbillSharedPasswordMissing ? "password-field onboarding-password-field is-missing" : "password-field onboarding-password-field"}>
                <input
                  className={getOnboardingRequiredInputClassName(onboardingPopbillSharedPasswordMissing)}
                  type={revealedFields.popbillSharedPassword ? "text" : "password"}
                  value={settingsForm.popbillSharedPassword}
                  aria-invalid={onboardingPopbillSharedPasswordMissing || undefined}
                  aria-describedby="onboarding-popbill-shared-password-hint"
                  onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillSharedPassword: event.target.value })}
                  placeholder={data.settings.popbillSharedPasswordConfigured ? "변경할 때만 다시 입력" : "신규 고객 공통 비밀번호"}
                />
                <button type="button" className="password-toggle" aria-label={revealedFields.popbillSharedPassword ? "팝빌 기본 비밀번호 숨기기" : "팝빌 기본 비밀번호 보기"} onClick={() => toggleRevealField("popbillSharedPassword")}>
                  <RevealIcon open={Boolean(revealedFields.popbillSharedPassword)} />
                </button>
              </div>
              {renderOnboardingRequiredHint(
                "onboarding-popbill-shared-password-hint",
                {
                  missing: onboardingPopbillSharedPasswordMissing,
                  defaultText: data.settings.popbillSharedPasswordConfigured
                    ? "이미 저장된 값이 있습니다. 필요하면 아래 보조 영역에서 다시 불러오세요."
                    : "신규 고객 계정 초기 비밀번호"
                }
              )}
            </label>
            <label className={getOnboardingRequiredFieldClassName(onboardingRenewalIssuePasswordMissing)} data-required-empty={onboardingRenewalIssuePasswordMissing ? "true" : undefined}>
              <span className={getOnboardingRequiredLabelClassName(onboardingRenewalIssuePasswordMissing)}>공동인증서 발급용 임시번호</span>
              <div className={onboardingRenewalIssuePasswordMissing ? "password-field onboarding-password-field is-missing" : "password-field onboarding-password-field"}>
                <input
                  className={getOnboardingRequiredInputClassName(onboardingRenewalIssuePasswordMissing)}
                  type={revealedFields.renewalIssuePassword ? "text" : "password"}
                  value={settingsForm.renewalIssuePassword}
                  inputMode="numeric"
                  maxLength={6}
                  aria-invalid={onboardingRenewalIssuePasswordMissing || undefined}
                  aria-describedby="onboarding-renewal-issue-password-hint"
                  onChange={(event) => handleSettingsRenewalIssuePasswordChange(event.target.value)}
                  placeholder={data.settings.renewalIssuePasswordConfigured ? "변경할 때만 다시 입력" : "숫자 6자리 입력"}
                />
                <button type="button" className="password-toggle" aria-label={revealedFields.renewalIssuePassword ? "발급용 임시번호 숨기기" : "발급용 임시번호 보기"} onClick={() => toggleRevealField("renewalIssuePassword")}>
                  <RevealIcon open={Boolean(revealedFields.renewalIssuePassword)} />
                </button>
              </div>
              {renderOnboardingRequiredHint(
                "onboarding-renewal-issue-password-hint",
                {
                  missing: onboardingRenewalIssuePasswordMissing,
                  defaultText: data.settings.renewalIssuePasswordConfigured
                    ? "공동인증서 신청 및 갱신 신청용 6자리입니다. 필요하면 아래 보조 영역에서 다시 불러오세요."
                    : "공동인증서 신청 및 갱신 신청용 6자리"
                }
              )}
            </label>
          </div>
        </section>

        <section className="onboarding-section onboarding-section-muted">
          <div className="onboarding-section-head">
            <strong>나중에 입력 가능</strong>
            <span>필요할 때만</span>
          </div>
          <div className="onboarding-field-grid onboarding-field-grid-single">
            <label>
              인증서 공통 비밀번호 (선택)
              <div className="password-field">
                <input
                  type={revealedFields.renewalCertificatePassword ? "text" : "password"}
                  value={settingsForm.renewalCertificatePassword}
                  onChange={(event) => setSettingsForm((prev) => prev && { ...prev, renewalCertificatePassword: event.target.value })}
                  placeholder={data.settings.renewalCertificatePasswordConfigured ? "변경할 때만 다시 입력" : "선택 입력"}
                />
                <button type="button" className="password-toggle" aria-label={revealedFields.renewalCertificatePassword ? "공동인증서 공통 비밀번호 숨기기" : "공동인증서 공통 비밀번호 보기"} onClick={() => toggleRevealField("renewalCertificatePassword")}>
                  <RevealIcon open={Boolean(revealedFields.renewalCertificatePassword)} />
                </button>
              </div>
              <span className="field-hint">
                {data.settings.renewalCertificatePasswordConfigured
                  ? "이미 저장된 값이 있습니다. 필요하면 아래 보조 영역에서 다시 불러오세요. 엑셀 비밀번호 칸이 비면 이 값을 씁니다."
                  : "비밀번호가 모두 같을 때만 사용합니다. 엑셀 비밀번호 칸이 비면 이 값을 씁니다."}
              </span>
            </label>
          </div>
        </section>
      </section>

      {hasSavedOnboardingDefaults ? (
        <details className="settings-advanced-panel">
          <summary>저장된 값 다시 불러오기는 필요할 때만 보기</summary>
          <div className="helper-box-stack">
            <strong>보조 작업</strong>
            <span>현재 단계의 메인 흐름은 위 필수 입력을 채우는 것입니다. 저장된 값은 정말 필요할 때만 불러오세요.</span>
            <div className="button-row">
              {data.settings.popbillSharedPasswordConfigured ? (
                <button type="button" className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction("load-popbill-shared-password", loadCurrentPopbillSharedPassword, { reload: false })}>
                  신규 고객 기본 비밀번호 불러오기
                </button>
              ) : null}
              {data.settings.renewalIssuePasswordConfigured ? (
                <button type="button" className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction("load-renewal-issue-password", loadCurrentRenewalIssuePassword, { reload: false })}>
                  발급용 임시번호 불러오기
                </button>
              ) : null}
              {data.settings.renewalCertificatePasswordConfigured ? (
                <button type="button" className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction("load-renewal-certificate-password", loadCurrentRenewalCertificatePassword, { reload: false })}>
                  인증서 공통 비밀번호 불러오기
                </button>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
  const onboardingHelperContent = (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy">
          <strong>
            {helperReady
              ? "공동인증서 확인 완료"
              : helperUpgradeRequired
                ? "헬퍼를 다시 설치하세요."
                : helperUpgradeAvailable
                  ? "업데이트 후 다시 확인해 두세요."
                  : customerRenewalAssistant?.agentOnline
                    ? "공동인증서를 읽으세요."
                    : "헬퍼를 먼저 실행하세요."}
          </strong>
          <p>{onboardingHelperStatusLine}</p>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>헬퍼 상태</span>
            <strong>{customerRenewalAssistant?.agentOnline ? "연결됨" : "연결 안 됨"}</strong>
          </div>
          <div>
            <span>읽은 공동인증서</span>
            <strong>{customerRenewalAssistantAllCertificates.length}건</strong>
          </div>
          <div>
            <span>마지막 확인</span>
            <strong>{formatDateTime(customerRenewalAssistant?.helperCheckedAt ?? null)}</strong>
          </div>
        </div>

        <div className="button-row onboarding-primary-row">
          <button
            type="button"
            disabled={busyKey !== null || !customerRenewalAssistant?.agentOnline || helperUpgradeRequired}
            title={
              helperUpgradeRequired
                ? helperActionBlockedReason
                : customerRenewalAssistant?.agentOnline
                  ? undefined
                  : "먼저 헬퍼를 설치하고 실행한 뒤 아래 보조 영역에서 상태를 다시 확인하세요."
            }
            onClick={() =>
              void runAction(
                "customer-renewal-bridge-probe",
                async () => {
                  await syncCustomerRenewalCertificates({ showAlert: false });
                },
                { reload: false }
              )
            }
          >
            {busyKey === "customer-renewal-bridge-probe" ? "공동인증서 읽는 중..." : "공동인증서 읽기"}
          </button>
        </div>
        {helperUpgradeRequired || helperUpgradeAvailable ? (
          <div className="helper-box-stack settings-install-guide">
            <strong>{helperUpgradeRequired ? "헬퍼 재설치 필요" : "헬퍼 업데이트 권장"}</strong>
            <span>{customerRenewalAssistant?.upgradeMessage}</span>
            {customerRenewalAssistant?.latestVersion ? <span>최신 버전: v{customerRenewalAssistant.latestVersion}</span> : null}
            {customerRenewalAssistant?.minSupportedVersion ? <span>최소 지원 버전: v{customerRenewalAssistant.minSupportedVersion}</span> : null}
          </div>
        ) : null}
      </section>

      <details className="settings-advanced-panel">
        <summary>상태 다시 확인 / 설치 안내 / 다운로드는 필요할 때만 보기</summary>
        <div className="helper-box-stack settings-install-guide">
          <strong>문제 해결과 보조 작업</strong>
          <div className="button-row">
            <button
              type="button"
              className="btn-secondary"
              disabled={busyKey !== null}
              onClick={() => void runAction("refresh-customer-renewal-helper", refreshCustomerRenewalAssistant, { reload: false })}
            >
              상태 다시 확인
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.location.assign(renewalHelperDownloadUrl)}
            >
              헬퍼 다운로드
            </button>
          </div>
          <span>
            고객 PC에서는 <code>renewal-local-helper</code> 압축을 푼 뒤 <code>scripts\renewal-helper-install.cmd</code>를 한 번 실행하면 됩니다.
          </span>
          <span>설치 직후 바로 시작되고, 이후에는 Windows 로그인 시 자동으로 다시 실행됩니다.</span>
          <span>
            문제가 생기면 바탕화면의 <code>AUTO-TAX Helper Status</code>, <code>AUTO-TAX Helper Start</code>, <code>AUTO-TAX Helper Stop</code> 바로가기로 확인할 수 있습니다.
          </span>
        </div>
      </details>
    </div>
  );
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
                setActiveSettingsSection("helper");
                setActiveTab("settings");
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
          <button type="button" className="btn-secondary" onClick={() => { setActiveSettingsSection("helper"); setActiveTab("settings"); }}>
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
                  ? "생성된 초안을 검토하고 발행 여부를 확인하세요."
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
      summary: helperReady ? `인증서 ${customerRenewalAssistantAllCertificates.length}건` : "확인 필요",
      primaryActionLabel: helperReady ? "공동인증서 읽기 완료" : "공동인증서 읽기",
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
          helperCertificateCount={customerRenewalAssistantAllCertificates.length}
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
          helperCertificateCount={customerRenewalAssistantAllCertificates.length}
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
  const navItems: Array<{ id: TabId; label: string; icon: string }> = [
    ...(hasActiveWorkspace
      ? onboardingComplete
        ? [
            { id: "home" as const, label: "홈", icon: "dashboard" },
            { id: "customers" as const, label: "고객", icon: "group" },
            { id: "settings" as const, label: "설정", icon: "settings" }
          ]
        : [
            { id: "onboarding" as const, label: "도입 준비", icon: "dashboard" },
            { id: "settings" as const, label: "설정", icon: "settings" }
          ]
      : []),
    ...(isPlatformAdmin ? [{ id: "ops" as const, label: "관리자", icon: "ops" }] : [])
  ];
  const secondaryNavItemIds = new Set<TabId>(["settings", "ops"]);
  const primaryNavItems = navItems.filter((item) => !secondaryNavItemIds.has(item.id));
  const secondaryNavItems = navItems.filter((item) => secondaryNavItemIds.has(item.id));
  const handleNavSelect = (nextTab: TabId) => {
    setActiveTab(nextTab);
    if (nextTab === "onboarding") {
      setRequestedOnboardingStepId(null);
    }
    if (nextTab === "settings") {
      openSettingsSection(recommendedSettingsSection);
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
      title: "검토 후 발행",
      count: reviewDrafts.length,
      description:
        reviewDrafts.length > 0
          ? "초안을 확인하고 지금 바로 발행하거나 오류를 다시 확인합니다."
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
  const nextSettingsSection = settingsSections.find((section) => !section.done)?.id ?? "account";
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
              ? "인증서 / 헬퍼 열기"
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
      title:
        blockedCustomerCount > 0
          ? "막힌 고객 우선"
          : data.customers.length === 0
            ? "첫 고객 등록"
            : "고객 상태 / 다음 조치",
      primaryActionLabel:
        blockedCustomerCount > 0
          ? `막힌 고객 ${blockedCustomerCount}명`
          : data.customers.length === 0
            ? "새 고객 등록"
            : `발행 가능 ${readyNowCustomers.length}명`,
      onPrimaryAction: () => {
        setCustomerListFilter(blockedCustomerCount > 0 ? "blocked" : data.customers.length === 0 ? "all" : "ready");
        if (data.customers.length === 0) {
          startCreatingCustomer();
        }
      },
      chips: [
        { label: "전체", value: `${data.customers.length}명`, tone: data.customers.length > 0 ? "default" : "warn" },
        { label: "막힘", value: `${blockedCustomerCount}명`, tone: blockedCustomerCount > 0 ? "danger" : "success" },
        { label: "발행 가능", value: `${readyNowCustomers.length}명`, tone: readyNowCustomers.length > 0 ? "success" : "default" },
        { label: "연결 마무리", value: `${popbillPendingCustomers.length}명`, tone: popbillPendingCustomers.length > 0 ? "warn" : "success" }
      ]
    },
    settings: {
      title: setupPendingCount > 0 ? "준비 상태 점검" : "설정 준비 완료",
      primaryActionLabel:
        nextSettingsSection === "gmail"
          ? "메일 연결"
          : nextSettingsSection === "popbill"
            ? "발행 설정"
            : nextSettingsSection === "helper"
              ? "인증서 / 헬퍼"
              : "계정 / 작업공간",
      onPrimaryAction: () => setActiveSettingsSection(nextSettingsSection),
      chips: [
        { label: "메일", value: settingsHealth.mailReady ? "준비됨" : "확인 필요", tone: settingsHealth.mailReady ? "success" : "warn" },
        { label: "발행", value: settingsHealth.popbillReady && settingsHealth.operatorReady ? "준비됨" : "입력 필요", tone: settingsHealth.popbillReady && settingsHealth.operatorReady ? "success" : "warn" },
        { label: "인증서", value: helperReady ? "준비됨" : "확인 필요", tone: helperReady ? "success" : "warn" },
        { label: "자동 저장", value: settingsAutosaveLabel, tone: settingsAutosaveState === "error" ? "danger" : settingsAutosaveState === "saving" ? "warn" : "default" }
      ]
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
  const showHomeSyncButton = hasActiveWorkspace && visibleActiveTab === "home";
  const showScreenPrimaryAction = visibleActiveTab !== "onboarding";
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
                actions={reviewDrafts.length > 0 ? <button onClick={() => void runAction("issue-all", issueAllReviewDrafts)}>전체 발행</button> : undefined}
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
                                지금 발행
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
                              : "지금 검토 후 발행할 초안이 없습니다."}
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
          <div className="settings-screen">
            <SettingsTab
              settingsSections={settingsSections}
              activeSettingsSection={activeSettingsSection}
              setupPendingCount={setupPendingCount}
              settingsAutosaveState={settingsAutosaveState}
              settingsAutosaveLabel={settingsAutosaveLabel}
              customerRegistrationReady={customerRegistrationReady}
              customerCount={data.customers.length}
              busyKey={busyKey}
              isMailTesting={isMailTesting}
              settingsHealth={settingsHealth}
              settingsForm={settingsForm}
              detectedMailProviderLabel={detectedMailProviderLabel}
              revealedFields={revealedFields}
              mailPasswordConfigured={data.settings.mailPasswordConfigured}
              popbillSharedPasswordConfigured={data.settings.popbillSharedPasswordConfigured}
              renewalCertificatePasswordConfigured={data.settings.renewalCertificatePasswordConfigured}
              renewalIssuePasswordConfigured={data.settings.renewalIssuePasswordConfigured}
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
              canManageOrganizationMembers={canManageOrganizationMembers}
              organizationMembers={organizationMembers}
              currentUserId={data.auth.userId}
              passwordResetTarget={passwordResetTarget}
              passwordChangeForm={passwordChangeForm}
              passwordResetForm={passwordResetForm}
              organizationMemberForm={organizationMemberForm}
              setActiveSettingsSection={setActiveSettingsSection}
              setSettingsForm={setSettingsForm}
              setPasswordChangeForm={setPasswordChangeForm}
              setPasswordResetForm={setPasswordResetForm}
              setOrganizationMemberForm={setOrganizationMemberForm}
              onMailAddressChange={handleSettingsMailAddressChange}
              onRenewalIssuePasswordChange={handleSettingsRenewalIssuePasswordChange}
              toggleRevealField={toggleRevealField}
              refreshAllCertificateStatuses={refreshAllCertificateStatuses}
              testMailSettings={testMailSettings}
              loadCurrentPopbillSharedPassword={loadCurrentPopbillSharedPassword}
              loadCurrentRenewalCertificatePassword={loadCurrentRenewalCertificatePassword}
              loadCurrentRenewalIssuePassword={loadCurrentRenewalIssuePassword}
              refreshCustomerRenewalAssistant={refreshCustomerRenewalAssistant}
              changePassword={changePassword}
              createOrganizationMember={createOrganizationMember}
              openMemberPasswordReset={openMemberPasswordReset}
              removeOrganizationMember={removeOrganizationMember}
              submitPasswordReset={submitPasswordReset}
              cancelPasswordReset={cancelPasswordReset}
              runAction={runAction}
              getWorkspaceMemberRoleLabel={getWorkspaceMemberRoleLabel}
              formatDateTime={formatDateTime}
            />
            <CertificatesTab
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
              certificateItems={customerCertificateItems}
              onRefreshCustomerRenewalAssistant={refreshCustomerRenewalAssistant}
              onLoadCustomerRenewalCertificates={loadCustomerRenewalCertificates}
              onLinkCustomerCertificate={linkLocalCertificateToCustomer}
              onUnlinkCustomerCertificate={unlinkCustomerCertificate}
              onPrepareCustomerCertificateRenewal={prepareLinkedCustomerCertificateRenewal}
              onOpenCustomerCertificatePayment={openLinkedCustomerCertificatePayment}
              runAction={runAction}
              formatCertificateExpireDate={formatCertificateExpireDate}
            />
          </div>
        ) : null}

        {visibleActiveTab === "ops" ? (
          <div className="ops-layout">
            <Panel
              title="플랫폼 관리자 계정 보안"
              subtitle={`현재 로그인한 플랫폼 관리자 계정(${data.auth.email ?? "이메일 없음"})의 비밀번호를 바꿉니다.`}
              actions={<button onClick={() => void runAction("change-password", changePassword, { reload: false })}>비밀번호 변경</button>}
            >
              <div className="form-grid">
                <label>
                  새 비밀번호
                  <div className="password-field">
                    <input
                      type={revealedFields.nextPassword ? "text" : "password"}
                      value={passwordChangeForm.nextPassword}
                      onChange={(event) =>
                        setPasswordChangeForm((prev) => ({
                          ...prev,
                          nextPassword: event.target.value
                        }))
                      }
                      placeholder="8자 이상 입력"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={revealedFields.nextPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                      onClick={() => toggleRevealField("nextPassword")}
                    >
                      <RevealIcon open={Boolean(revealedFields.nextPassword)} />
                    </button>
                  </div>
                </label>
                <label>
                  새 비밀번호 확인
                  <div className="password-field">
                    <input
                      type={revealedFields.confirmPassword ? "text" : "password"}
                      value={passwordChangeForm.confirmPassword}
                      onChange={(event) =>
                        setPasswordChangeForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value
                        }))
                      }
                      placeholder="한 번 더 입력"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={revealedFields.confirmPassword ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
                      onClick={() => toggleRevealField("confirmPassword")}
                    >
                      <RevealIcon open={Boolean(revealedFields.confirmPassword)} />
                    </button>
                  </div>
                  <span className="field-hint">플랫폼 운영 계정도 여기서 직접 새 비밀번호를 저장할 수 있습니다.</span>
                </label>
              </div>
            </Panel>
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
                          passwordResetTarget?.kind === "owner" &&
                          passwordResetTarget.organizationId === workspace.organizationId;
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
                                        value={passwordResetForm.nextPassword}
                                        onChange={(event) =>
                                          setPasswordResetForm((prev) => ({
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
                                        value={passwordResetForm.confirmPassword}
                                        onChange={(event) =>
                                          setPasswordResetForm((prev) => ({
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
                                        submitPasswordReset,
                                        { reload: false }
                                      )
                                    }
                                  >
                                    임시 비밀번호 저장
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={cancelPasswordReset}
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
