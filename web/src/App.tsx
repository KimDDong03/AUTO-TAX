import type React from "react";
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api, setActiveOrganizationId, setApiAccessToken } from "./api";
import { AppDialog, type AppDialogState, type AppDialogTone, CheckboxControl, Icon, Panel, RevealIcon, StatCard } from "./components/ui";
import { getOrganizationRoleLabel } from "./organizationRole";
import { useCertificatesScreenModel } from "./features/certificates/useCertificatesScreenModel";
import { matchesCustomerSearchQuery, type CustomerSearchField } from "./features/customers/customerSearch";
import {
  buildCustomerListFilterContext,
  buildIssuedDraftsByCustomerId,
  getCurrentSeoulBillingMonth,
  matchesCustomerListFilter,
  type CustomerListFilter
} from "./features/customers/customerListFilters";
import {
  buildCustomerCertificateOnestopDraftFromCertificate,
  runCustomerCertificateOnestopRegistration,
  type CustomerCertificateOnestopDraft,
  type CustomerCertificateOnestopResult
} from "./features/customers/customerCertificateOnestop";
import { normalizeCustomerReportDetail } from "./features/customers/customerReportDetail";
import { downloadSelectedCustomersWorkbook } from "./features/customers/customerSelectedExport";
import { downloadCustomerContractRenewalsWorkbook } from "./features/home/customerContractRenewals";
import type { DraftTaxInvoiceInfoUpdateInput, ManualDraftCreateInput } from "./features/issuance/IssuanceTab";
import { buildHomeScreenModel, type HomeActionKey } from "./features/home/homeScreenModel";
import {
  InitialRegistrationTab,
  getInitialRegistrationFlowState,
  type InitialRegistrationJoinProgress
} from "./features/initial-registration/InitialRegistrationTab";
import type { OnboardingStep } from "./features/onboarding/OnboardingTab";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_PLACEHOLDER } from "./features/auth/passwordPolicy";
import {
  type PublicSignupEmailVerificationSendResult,
  type PublicLoginIdLookupResult,
  type PublicSignupInput,
  type PublicSignupLoginIdAvailability,
  type PublicSignupPhoneVerificationSendResult
} from "./features/public/PublicLanding";
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
  type CustomerOnboardingResolutionResult,
  type OnboardingPreflightCache
} from "./features/initial-registration/electronic-tax-onboarding-resolver";
import {
  processElectronicTaxOnboardingCertificateRegistrations,
  type ElectronicTaxOnboardingCertificateRegistrationProgress,
  waitForElectronicTaxOnboardingCommitBatch
} from "./features/initial-registration/electronic-tax-onboarding-orchestration";
import {
  emptyElectronicTaxOnboardingSessionState as emptyCustomerOnboardingSessionState,
  runElectronicTaxOnboardingUploadFlow,
  type ElectronicTaxOnboardingSessionState as CustomerOnboardingSessionState,
  type ElectronicTaxOnboardingUploadFlowResult
} from "./features/initial-registration/electronic-tax-onboarding-upload-flow";
import { useElectronicTaxOnboarding } from "./features/initial-registration/useElectronicTaxOnboarding";
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
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { useSettingsDerivedModel } from "./features/settings/useSettingsDerivedModel";
import {
  selectSettingsOnboardingState,
  useSettingsOnboardingModel
} from "./features/settings/useSettingsOnboardingModel";
import type { SettingsCertificateReadProgress } from "./features/settings/settingsSectionModels";
import {
  deriveCustomerCertificateKind,
  findCandidateCustomersForCertificate,
  findLocalCertificateForStoredCustomerCertificate,
  findRenewalCertificatesByIdentity,
  findStoredCustomerCertificateForLocalCertificate,
  formatCustomerRenewalStatus,
  getLatestRenewalPreflightProbeForCertificate,
  isCustomerCertificateExpired,
  isElectronicTaxCertificate,
  isRenewalPaymentReady,
  matchesRenewalCertificate,
  normalizeCustomerCertificateExpireDateKey,
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
  requestLocalCertificateUploadSession,
  requestLocalPopbillCertificateRegistration,
  requestLocalRenewalCertificates,
  requestLocalRenewalBridgeProbe,
  requestLocalRenewalOpenPayment,
  requestLocalRenewalPreparePayment,
  requestLocalRenewalPreflight,
  requestLocalRenewalPreflightBatch
} from "./local-renewal-helper";
import {
  buildOpsSubscriptionMetrics,
  getOpsSubscriptionIssueBlocks,
  getOpsWorkspaceExpectedMonthlyRevenue,
  isOpsSubscriptionWorkspace,
  OPS_SUBSCRIPTION_ISSUE_BLOCK_SIZE,
  OPS_SUBSCRIPTION_MONTHLY_BLOCK_PRICE
} from "./features/ops/opsSubscriptionMetrics";
import {
  clearSupabaseAuthHash,
  getSupabaseAuthHashError,
  getSupabaseAuthHashParams,
  isSupabaseRecoveryHash
} from "./features/auth/auth-hash";
import { useAuthSessionBootstrap } from "./features/auth/useAuthSessionBootstrap";
import { getSessionSafely, resetPasswordForEmailSafely, setSessionSafely, signOutSafely, updateUserSafely } from "./supabase";
import { USER_FACING_AUTH_TIMEOUT_MESSAGE } from "./supabase-timeout";
import { assertSafeSpreadsheetFile, assertSafeSpreadsheetWorkbook } from "./spreadsheet-security";
import type {
  BootstrapPayload,
  AppSettings,
  CompletedBillingMonth,
  Customer,
  CustomerCertificate,
  CustomerCertificateKind,
  CustomerContractPeriod,
  CustomerContractPeriodMutationResult,
  CustomerContractRenewalCompletion,
  CustomerContractRenewalDueItem,
  CustomerContractSummary,
  CustomerImportProfile,
  CustomerReportDetail,
  InboxMessage,
  InvoiceDraft,
  IssuedMonthlyTrendPayload,
  LogEntry,
  MailPreviewImageResponse,
  OpsWorkspaceSubscriptionUpdateResponse,
  OpsSignupApproveResponse,
  OpsWorkspaceSummary,
  PartnerPointsPayload,
  PublicConsultationRequest,
  PublicConsultationRequestStatus,
  PublicSignupRequest,
  PublicSignupRequestStatus,
  RenewalInfoSnapshot,
  RenewalAutomationPayload
} from "./types";

type TabId = "onboarding" | "home" | "issuance" | "customers" | "certificates" | "settings" | "ops";
type OpsSectionId =
  | "subscription"
  | "signup-requests"
  | "consultation"
  | "workspaces"
  | "owner-security"
  | "agent-status"
  | "logs"
  | "account-security";
type ConsultationStatusFilter = "all" | PublicConsultationRequestStatus;
type TopnavTaskNotification = {
  key: string;
  title: string;
  description: string;
  count: number;
  tone: "danger" | "warn" | "info";
  actionLabel: string;
  onAction: () => void;
};

const LAZY_CHUNK_RELOAD_KEY = "auto-tax.lazy-chunk-reloaded";

function isLazyChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(message);
}

function lazyWithReload<T extends React.ComponentType<any>>(
  loader: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const loaded = await loader();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(LAZY_CHUNK_RELOAD_KEY);
      }
      return loaded;
    } catch (error) {
      if (
        isLazyChunkLoadError(error) &&
        typeof window !== "undefined" &&
        window.sessionStorage.getItem(LAZY_CHUNK_RELOAD_KEY) !== "1"
      ) {
        window.sessionStorage.setItem(LAZY_CHUNK_RELOAD_KEY, "1");
        window.location.reload();
        return await new Promise<{ default: T }>(() => undefined);
      }
      throw error;
    }
  });
}

const CertificatesScreen = lazyWithReload(() =>
  import("./features/certificates/CertificatesScreen").then((module) => ({ default: module.CertificatesScreen }))
);
const CustomersTab = lazyWithReload(() =>
  import("./features/customers/CustomersTab").then((module) => ({ default: module.CustomersTab }))
);
const HomeTab = lazyWithReload(() =>
  import("./features/home/HomeTab").then((module) => ({ default: module.HomeTab }))
);
const IssuanceTab = lazyWithReload(() =>
  import("./features/issuance/IssuanceTab").then((module) => ({ default: module.IssuanceTab }))
);
const OnboardingTab = lazyWithReload(() =>
  import("./features/onboarding/OnboardingTab").then((module) => ({ default: module.OnboardingTab }))
);
const PublicLanding = lazyWithReload(() =>
  import("./features/public/PublicLanding").then((module) => ({ default: module.PublicLanding }))
);

const OPS_DEFAULT_SECTION: OpsSectionId = "subscription";
const OPS_SECTION_HASH_BY_ID = {
  subscription: "ops",
  "signup-requests": "ops-signup-requests",
  consultation: "ops-consultation-requests",
  workspaces: "ops-workspaces",
  "owner-security": "ops-owner-security",
  "agent-status": "ops-agent-status",
  logs: "ops-logs",
  "account-security": "ops-account-security"
} satisfies Record<OpsSectionId, string>;

const HELPER_SETUP_STORAGE_KEY_PREFIX = "auto-tax:helper-setup:";
const CUSTOMER_ONBOARDING_STORAGE_KEY_PREFIX = "auto-tax:customer-onboarding:";
const HOME_MOCK_REVIEW_TARGET_COUNT = 15;
const HOME_MOCK_RECENT_INBOX_TARGET_COUNT = 10;
const HOME_MOCK_RECENT_ISSUED_TARGET_COUNT = 10;
const HOME_MOCK_BASE_TIME = Date.UTC(2026, 3, 21, 9, 0, 0);
const HOME_MOCK_LABEL = "[목업]";
const HOME_MOCK_CUSTOMER_PREFIXES = ["한서", "도원", "청해", "서광", "미래", "남도", "동해", "하람", "새론", "비전"];
const HOME_MOCK_PLANT_PREFIXES = ["원주 신림", "충주 노은", "이천 덕평", "보령 청소", "태안 근흥", "해남 화산", "당진 송악", "영암 삼호"];
const HOME_MOCK_REGIONS = [
  "강원특별자치도 원주시 신림면",
  "충청북도 충주시 노은면",
  "경기도 이천시 덕평로",
  "충청남도 보령시 청소면",
  "충청남도 태안군 근흥면",
  "전라남도 해남군 화산면",
  "충청남도 당진시 송악읍",
  "전라남도 영암군 삼호읍"
];

function buildHomeMockTimestamp(index: number, minuteStep: number): string {
  return new Date(HOME_MOCK_BASE_TIME - index * minuteStep * 60_000).toISOString();
}

function buildHomeMockBillingMonth(index: number): string {
  const year = 2026 - Math.floor(index / 6);
  const month = 4 - (index % 6);
  const normalizedMonth = month > 0 ? month : 12 + month;
  const normalizedYear = month > 0 ? year : year - 1;
  return `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`;
}

function buildHomeMockCustomerName(index: number): string {
  return `${HOME_MOCK_CUSTOMER_PREFIXES[index % HOME_MOCK_CUSTOMER_PREFIXES.length]} 발전소`;
}

function buildHomeMockPlantName(index: number): string {
  return `${HOME_MOCK_PLANT_PREFIXES[index % HOME_MOCK_PLANT_PREFIXES.length]} 태양광`;
}

function buildHomeMockAddress(index: number): string {
  const region = HOME_MOCK_REGIONS[index % HOME_MOCK_REGIONS.length];
  return `${region} ${810 + index}`;
}

function padHomeCollection<T>(items: T[], targetCount: number, createItem: (index: number) => T): T[] {
  if (items.length >= targetCount) {
    return items;
  }

  return [
    ...items,
    ...Array.from({ length: targetCount - items.length }, (_, index) => createItem(index))
  ];
}

function buildHomeMockReviewDraft(index: number): InvoiceDraft {
  const billingMonth = buildHomeMockBillingMonth(index);
  const supplyCost = 148_000 + (index % 6) * 17_000;
  const taxTotal = Math.round(supplyCost * 0.1);
  const statusCycle: InvoiceDraft["status"][] = ["review", "review", "failed", "review", "issuing"];
  const status = statusCycle[index % statusCycle.length];
  const customerName = buildHomeMockCustomerName(index);
  const plantName = buildHomeMockPlantName(index);
  const createdAt = buildHomeMockTimestamp(index, 95);
  const updatedAt = buildHomeMockTimestamp(index, 70);

  return {
    id: -1100 - index,
    customerId: -1100 - index,
    customerName,
    sourceMessageId: -2100 - index,
    issueMode: "review",
    status,
    scheduledFor: null,
    issueRequestedAt: status === "issuing" ? updatedAt : null,
    issuedAt: null,
    issueError: status === "failed" ? "목업 발행 실패: 발행 확인 대기" : "",
    billingMonth,
    writeDate: `${billingMonth}-25`,
    itemName: `${billingMonth.replace("-", "년")}월전력`,
    plantName,
    supplyCost,
    taxTotal,
    totalAmount: supplyCost + taxTotal,
    kepcoCorpNum: `5101${String(700000 + index).padStart(6, "0")}`,
    kepcoBranchId: `ORG3AF92FB3_${410 + index}`,
    kepcoCorpName: `${customerName} 한국전력`,
    kepcoCeoName: `${HOME_MOCK_CUSTOMER_PREFIXES[index % HOME_MOCK_CUSTOMER_PREFIXES.length]} 대표`,
    kepcoAddr: buildHomeMockAddress(index),
    kepcoBizType: "전기 생산업",
    kepcoBizClass: "태양광 발전",
    popbillMgtKey: `MOCK-REVIEW-${index + 1}`,
    popbillEnvironment: "test",
    popbillResultJson: "",
    createdAt,
    updatedAt
  };
}

function buildHomeMockIssuedDraft(index: number): InvoiceDraft {
  const billingMonth = buildHomeMockBillingMonth(index);
  const supplyCost = 176_000 + (index % 5) * 19_000;
  const taxTotal = Math.round(supplyCost * 0.1);
  const customerName = buildHomeMockCustomerName(index + 20);
  const plantName = buildHomeMockPlantName(index + 20);
  const issuedAt = buildHomeMockTimestamp(index, 140);

  return {
    id: -3100 - index,
    customerId: -3100 - index,
    customerName,
    sourceMessageId: -4100 - index,
    issueMode: "review",
    status: "issued",
    scheduledFor: null,
    issueRequestedAt: issuedAt,
    issuedAt,
    issueError: "",
    billingMonth,
    writeDate: `${billingMonth}-25`,
    itemName: `${billingMonth.replace("-", "년")}월전력`,
    plantName,
    supplyCost,
    taxTotal,
    totalAmount: supplyCost + taxTotal,
    kepcoCorpNum: `6202${String(800000 + index).padStart(6, "0")}`,
    kepcoBranchId: `ORG3AF92FB3_${510 + index}`,
    kepcoCorpName: `${customerName} 한국전력`,
    kepcoCeoName: `${HOME_MOCK_CUSTOMER_PREFIXES[(index + 2) % HOME_MOCK_CUSTOMER_PREFIXES.length]} 대표`,
    kepcoAddr: buildHomeMockAddress(index + 20),
    kepcoBizType: "전기 생산업",
    kepcoBizClass: "신재생 발전",
    popbillMgtKey: `MOCK-ISSUED-${index + 1}`,
    popbillEnvironment: "test",
    popbillResultJson: "",
    createdAt: issuedAt,
    updatedAt: issuedAt
  };
}

function buildHomeMockInboxMessage(index: number): InboxMessage {
  const billingMonth = buildHomeMockBillingMonth(index);
  const supplyCost = 132_000 + (index % 7) * 15_000;
  const taxTotal = Math.round(supplyCost * 0.1);
  const parseStatusCycle: InboxMessage["parseStatus"][] = ["parsed", "parsed", "duplicate", "ignored", "parsed"];
  const parseStatus = parseStatusCycle[index % parseStatusCycle.length];
  const customerName = buildHomeMockCustomerName(index + 40);
  const plantName = buildHomeMockPlantName(index + 40);

  return {
    id: -5100 - index,
    subject: `${HOME_MOCK_LABEL} ${customerName} ${billingMonth.replace("-", "년 ")}월 전력 사용 안내`,
    fromAddress: `alerts${index + 1}@kepco.demo.local`,
    receivedAt: buildHomeMockTimestamp(index, 55),
    parseStatus,
    parseError: parseStatus === "duplicate" ? "기존 초안과 중복으로 분류됨" : "",
    customerId: parseStatus === "parsed" ? -6100 - index : null,
    draftId: null,
    parsedData: {
      plantName,
      plantAddress: buildHomeMockAddress(index + 40),
      billingMonth,
      supplyCost,
      taxTotal,
      itemName: `${billingMonth.replace("-", "년")}월전력`,
      kepcoBranchId: `ORG3AF92FB3_${610 + index}`
    }
  };
}

function getHelperSetupStorageKey(organizationId: string): string {
  return `${HELPER_SETUP_STORAGE_KEY_PREFIX}${organizationId}`;
}

function readHelperSetupCompletedPreference(organizationId: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    const value = window.localStorage.getItem(getHelperSetupStorageKey(organizationId));
    return value === "done" || value === "true" || value === "1";
  } catch {
    return false;
  }
}

function writeHelperSetupCompletedPreference(organizationId: string, completed: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getHelperSetupStorageKey(organizationId), completed ? "done" : "pending");
  } catch {
    // ignore storage failures in unsupported/private contexts
  }
}

function getCustomerOnboardingStorageKey(organizationId: string): string {
  return `${CUSTOMER_ONBOARDING_STORAGE_KEY_PREFIX}${organizationId}`;
}

type PersistedCustomerOnboardingState = {
  fileName: string;
  workbook: CustomerOnboardingWorkbookInput | null;
  preview: CustomerOnboardingPreviewResponse | null;
  sessionState: CustomerOnboardingSessionState;
  attemptedCertificateBusinessNumbers: string[];
  certificatePasswordOverrides: Record<string, string>;
  preflightPasswordFailureEntries: Array<{
    key: string;
    label: string;
  }>;
  notice: string;
  error: string;
};

type OnboardingCertificatePasswordOverrideEntry = {
  businessNumber: string;
  customerName: string;
  corpName: string;
  value: string;
};

function readPersistedCustomerOnboardingState(
  organizationId: string
): PersistedCustomerOnboardingState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getCustomerOnboardingStorageKey(organizationId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedCustomerOnboardingState> | null;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : "",
      workbook: parsed.workbook ?? null,
      preview: parsed.preview ?? null,
      sessionState:
        parsed.sessionState && typeof parsed.sessionState === "object"
          ? {
              templateDownloaded: Boolean(parsed.sessionState.templateDownloaded),
              previewReady: Boolean(parsed.sessionState.previewReady),
              commitDone: Boolean(parsed.sessionState.commitDone),
              certificateDone: Boolean(parsed.sessionState.certificateDone),
              targetBusinessNumbers: Array.isArray(parsed.sessionState.targetBusinessNumbers)
                ? parsed.sessionState.targetBusinessNumbers
                    .map((value) => String(value ?? "").replace(/\D/g, ""))
                    .filter((value) => value.length > 0)
                : []
            }
          : emptyCustomerOnboardingSessionState,
      attemptedCertificateBusinessNumbers: Array.isArray(parsed.attemptedCertificateBusinessNumbers)
        ? parsed.attemptedCertificateBusinessNumbers
            .map((value) => String(value ?? "").replace(/\D/g, ""))
            .filter((value) => value.length > 0)
        : [],
      certificatePasswordOverrides:
        parsed.certificatePasswordOverrides && typeof parsed.certificatePasswordOverrides === "object"
          ? Object.fromEntries(
              Object.entries(parsed.certificatePasswordOverrides)
                .map(([key, value]) => [
                  String(key ?? "").includes(":")
                    ? String(key ?? "").trim()
                    : String(key ?? "").replace(/\D/g, ""),
                  typeof value === "string" ? value : ""
                ])
                .filter(([key, value]) => key.length > 0 && value.trim() !== "")
            )
          : {},
      preflightPasswordFailureEntries: Array.isArray(parsed.preflightPasswordFailureEntries)
        ? parsed.preflightPasswordFailureEntries
            .map((entry) => ({
              key: typeof entry?.key === "string" ? entry.key.trim() : "",
              label: typeof entry?.label === "string" ? entry.label.trim() : ""
            }))
            .filter((entry) => entry.key && entry.label)
        : [],
      notice: typeof parsed.notice === "string" ? parsed.notice : "",
      error: typeof parsed.error === "string" ? parsed.error : ""
    };
  } catch {
    return null;
  }
}

function writePersistedCustomerOnboardingState(
  organizationId: string,
  state: PersistedCustomerOnboardingState | null
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const key = getCustomerOnboardingStorageKey(organizationId);
    if (!state) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

type OnboardingCertificateAutoRunnerProps = {
  active: boolean;
  commitDone: boolean;
  hasWorkbook: boolean;
  certificateReady: boolean;
  busyKey: string | null;
  pendingJoinCount: number;
  pollPendingJoins: () => Promise<void>;
};

function buildInitialRegistrationJoinProgress(
  customers: Customer[],
  targetBusinessNumbers: string[]
): InitialRegistrationJoinProgress | null {
  const normalizedTargets = Array.from(
    new Set(
      targetBusinessNumbers
        .map((businessNumber) => digitsOnly(businessNumber))
        .filter((businessNumber): businessNumber is string => Boolean(businessNumber))
    )
  );
  if (normalizedTargets.length === 0) {
    return null;
  }

  let completed = 0;
  let failed = 0;
  for (const businessNumber of normalizedTargets) {
    const customer = customers.find((item) => digitsOnly(item.businessNumber) === businessNumber);
    if (customer?.popbillState === "joined") {
      completed += 1;
    } else if (customer?.popbillState === "failed") {
      failed += 1;
    }
  }

  const total = normalizedTargets.length;
  const pending = Math.max(0, total - completed - failed);
  return {
    total,
    completed,
    pending,
    failed,
    status: completed === total ? "complete" : "running"
  };
}

function OnboardingCertificateAutoRunner({
  active,
  commitDone,
  hasWorkbook,
  certificateReady,
  busyKey,
  pendingJoinCount,
  pollPendingJoins
}: OnboardingCertificateAutoRunnerProps) {
  useEffect(() => {
    if (!active || !commitDone || !hasWorkbook || certificateReady) {
      return;
    }

    if (
      busyKey === "customer-onboarding-commit" ||
      busyKey === "customer-onboarding-cert-registration"
    ) {
      return;
    }

    if (pendingJoinCount > 0) {
      const timeout = window.setTimeout(() => {
        void pollPendingJoins();
      }, 3000);
      return () => window.clearTimeout(timeout);
    }
  }, [
    active,
    busyKey,
    certificateReady,
    commitDone,
    hasWorkbook,
    pendingJoinCount,
    pollPendingJoins
  ]);

  return null;
}
type CustomerDetailTabId = "info" | "history";
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
type OrganizationWithdrawalResponse = {
  ok: true;
  organizationId: string;
  organizationName: string;
  popbill: {
    totalCustomers: number;
    joinedTargets: number;
    skipped: number;
    quit: number;
    alreadyMissing: number;
    localResetFailed: number;
  };
  auth: {
    removedMemberships: number;
    deletedAuthUsers: number;
    retainedAuthUsers: number;
    authDeleteFailures: Array<{
      userId: string;
      loginId: string | null;
      error: string;
    }>;
  };
  cancelledJobs: number;
};
type OrganizationWithdrawalPhoneVerificationSendResult = {
  verificationId: string;
  expiresAt: string;
  maskedPhone: string;
  devCode?: string;
};
type OpsConsoleData = {
  partnerPoints: PartnerPointsPayload;
  renewalAutomation: RenewalAutomationPayload;
  logs: LogEntry[];
  workspaces: OpsWorkspaceSummary[];
  signupRequests: PublicSignupRequest[];
  consultationRequests: PublicConsultationRequest[];
};
type OpsLogDiagnosticRow = {
  label: string;
  value: string;
};
type OpsLogDiagnostic = {
  title: string;
  rows: OpsLogDiagnosticRow[];
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

function shouldLoadMailboxData(activeTab: TabId, _customerDetailTab: CustomerDetailTabId): boolean {
  return activeTab === "home" || activeTab === "issuance" || activeTab === "customers";
}

type OpsWorkspaceMailSettingsTarget = {
  organizationId: string;
  organizationName: string;
};

type OpsWorkspaceMailSettingsFormState = {
  mailAddress: string;
  mailPassword: string;
  testConnection: boolean;
};

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

let xlsxModulePromise: Promise<typeof import("@e965/xlsx")> | null = null;

function loadXlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("@e965/xlsx");
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

const baseOpsWorkspaceMailSettingsForm: OpsWorkspaceMailSettingsFormState = {
  mailAddress: "",
  mailPassword: "",
  testConnection: true
};

function getOpsSectionFromHash(hash: string): OpsSectionId | null {
  const value = hash.replace(/^#/, "");

  if (value === "ops-consultation") {
    return "consultation";
  }

  if (value === "ops-workspace-create") {
    return "signup-requests";
  }

  const match = (Object.entries(OPS_SECTION_HASH_BY_ID) as Array<[OpsSectionId, string]>).find(
    ([, sectionHash]) => sectionHash === value
  );

  return match?.[0] ?? null;
}

function getOpsSectionHash(section: OpsSectionId): string {
  return `#${OPS_SECTION_HASH_BY_ID[section]}`;
}

function getTabFromHash(hash: string): TabId | null {
  const value = hash.replace(/^#/, "");

  if (getOpsSectionFromHash(hash)) {
    return "ops";
  }

  if (value === "initial" || value === "onboarding") {
    return "onboarding";
  }

  if (value === "work" || value === "home") {
    return "home";
  }

  if (value === "issuance") {
    return "issuance";
  }

  if (value === "certificates") {
    return "certificates";
  }

  if (value === "settings") {
    return "settings";
  }

  if (value === "customers") {
    return value;
  }

  return null;
}

function isPublicAuthHash(hash: string): boolean {
  const value = (() => {
    try {
      return decodeURIComponent(hash).replace(/^#/, "");
    } catch {
      return hash.replace(/^#/, "");
    }
  })();
  return (
    value === "" ||
    value === "home" ||
    value === "login" ||
    value === "public-login-card" ||
    value === "signup" ||
    value === "public-signup-card" ||
    ["서비스 소개", "기능", "서비스 과정", "요금 안내", "문의하기"].includes(value.replaceAll("-", " "))
  );
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

  if (requestedTab === "onboarding") {
    return "settings";
  }

  if (
    requestedTab === "home" ||
    requestedTab === "issuance" ||
    requestedTab === "customers" ||
    requestedTab === "certificates" ||
    requestedTab === "settings"
  ) {
    return requestedTab;
  }

  return "home";
}

function hasSupabaseAuthHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  if (!raw || getTabFromHash(hash)) return false;

  const params = getSupabaseAuthHashParams(hash);
  return (
    params.has("access_token") ||
    params.has("refresh_token") ||
    params.has("error") ||
    params.has("error_code") ||
    params.get("type") === "recovery"
  );
}

function getPasswordRecoveryRedirectUrl(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

const baseCustomerForm: CustomerFormState = {
  id: null,
  customerName: "",
  businessNumber: "",
  corpName: "",
  addr: "",
  bizType: "전기업",
  bizClass: "태양광발전(자가용PPA)",
  popbillUserId: "",
  popbillPassword: "",
  renewalContactMobile: "",
  issueCompleteSmsTemplate: "",
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
    form.renewalContactMobile === "" &&
    form.issueCompleteSmsTemplate === "" &&
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
    popbillUserId: customer.popbillUserId,
    popbillPassword: customer.popbillPassword,
    renewalContactMobile: customer.renewalContactMobile,
    issueCompleteSmsTemplate: customer.issueCompleteSmsTemplate ?? "",
    memo: customer.memo
  };
}

function getDraftStatusLabel(status: string): string {
  switch (status) {
    case "review":
      return "발행 대기";
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

function getOrganizationPlanLabel(planCode: string): string {
  switch (planCode) {
    case "free_trial":
    case "starter":
      return "무료 체험";
    case "paid":
      return "유료 구독";
    default:
      return planCode || "-";
  }
}

function getConsultationStatusLabel(status: PublicConsultationRequestStatus): string {
  switch (status) {
    case "new":
      return "신규";
    case "contacted":
      return "연락 완료";
    case "workspace_opened":
      return "개통 완료";
    case "closed":
      return "종료";
    default:
      return status;
  }
}

function getConsultationStatusChipClass(status: PublicConsultationRequestStatus): string {
  switch (status) {
    case "new":
      return "chip-warn";
    case "workspace_opened":
      return "chip-success";
    case "closed":
      return "chip-danger";
    case "contacted":
    default:
      return "";
  }
}

const CONSULTATION_STATUS_FILTERS: Array<{
  value: ConsultationStatusFilter;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "new", label: "신규" },
  { value: "contacted", label: "연락 완료" },
  { value: "workspace_opened", label: "개통 완료" },
  { value: "closed", label: "종료" }
];

function getSignupStatusLabel(status: PublicSignupRequestStatus): string {
  switch (status) {
    case "pending":
      return "승인 대기";
    case "approved":
      return "승인 완료";
    case "rejected":
      return "반려";
    default:
      return status;
  }
}

function getSignupStatusChipClass(status: PublicSignupRequestStatus): string {
  switch (status) {
    case "pending":
      return "chip-warn";
    case "approved":
      return "chip-success";
    case "rejected":
      return "chip-danger";
    default:
      return "";
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
    return `운영 확인 필요${suffix}`;
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

function sanitizeSupplierDisplayText(value: string): string {
  return value
    .replace(/팝빌\s*전자세금용\s*공동인증서/g, "전자세금용 공동인증서")
    .replace(/팝빌\s*전자세금용\s*인증서/g, "전자세금용 인증서")
    .replace(/팝빌\s*인증서/g, "전자세금용 인증서")
    .replace(/팝빌\s*가입/g, "등록 처리")
    .replace(/팝빌\s*연동회원/g, "등록 계정")
    .replace(/팝빌\s*문서/g, "문서")
    .replace(/팝빌\s*연동/g, "등록 처리")
    .replace(/팝빌/g, "등록 처리")
    .replace(/Popbill|POPBILL/g, "등록 처리");
}

function sanitizeInternalDisplayText(value: string): string {
  if (/Supabase 인증 응답이 \d+ms 안에 완료되지 않았습니다\.?/.test(value) || value.includes("SupabaseAuthTimeoutError")) {
    return USER_FACING_AUTH_TIMEOUT_MESSAGE;
  }

  return value
    .replace(/Supabase/gi, "인증 서버")
    .replace(/\b\d+ms\b/g, "일정 시간");
}

function getDisplayErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const codeSuffix = error.code ? ` (${error.code})` : "";
    return `${sanitizeInternalDisplayText(sanitizeSupplierDisplayText(error.message))}${codeSuffix}`;
  }

  return error instanceof Error
    ? sanitizeInternalDisplayText(sanitizeSupplierDisplayText(error.message))
    : fallback;
}

function parseLogContextJson(log: LogEntry): Record<string, unknown> | null {
  if (!log.contextJson.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(log.contextJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function getLogContextText(context: Record<string, unknown>, key: string): string {
  const value = context[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function formatPopbillJoinOperation(value: string): string {
  switch (value) {
    case "check-is-member":
      return "연동회원 가입 여부 확인";
    case "join-member":
      return "연동회원 신규가입";
    default:
      return value || "-";
  }
}

function getOpsPopbillJoinDiagnostic(log: LogEntry): OpsLogDiagnostic | null {
  const context = parseLogContextJson(log);
  if (!context || log.scope !== "popbill") {
    return null;
  }

  const operation = getLogContextText(context, "errorOperation");
  const supportCategory = getLogContextText(context, "supportCategory");
  const isJoinFailure =
    supportCategory === "popbill-join" ||
    operation === "join-member" ||
    operation === "check-is-member" ||
    log.message.includes("팝빌 자동 가입");

  if (!isJoinFailure) {
    return null;
  }

  return {
    title: "발행 연동 가입 오류 원인",
    rows: [
      { label: "고객 ID", value: getLogContextText(context, "customerId") || "-" },
      { label: "단계", value: formatPopbillJoinOperation(operation) },
      { label: "연동 오류 코드", value: getLogContextText(context, "errorCode") || "-" },
      { label: "연동 원문", value: getLogContextText(context, "error") || "-" },
      { label: "고객 화면 안내", value: getLogContextText(context, "userFacingError") || "AUTO-TAX 운영팀 문의 안내" }
    ]
  };
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
      reason: "운영 확인 필요"
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

  if (days !== null && days < 60) {
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
        label: "운영 확인 필요",
        tone: "danger",
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

  if (days !== null && days < 60) {
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
        : leftDays !== null && leftDays < 60
          ? 2
          : !leftReadiness.canIssueNow
            ? 3
            : 4;
  const rightPriority =
    right.popbillState !== "joined" || !right.popbillCertRegistered
      ? 0
      : rightDays !== null && rightDays < 0
        ? 1
        : rightDays !== null && rightDays < 60
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

function buildCurrentCustomerListFilterContext(
  customers: Customer[],
  drafts: InvoiceDraft[],
  contractRenewalDueItems: CustomerContractRenewalDueItem[]
) {
  const expiredCertCustomers: Customer[] = [];
  const expiringSoonCustomers: Customer[] = [];

  for (const customer of customers) {
    const days = getDaysUntilDate(customer.popbillCertExpireDate);
    if (days !== null && days < 0) {
      expiredCertCustomers.push(customer);
    } else if (days !== null && days >= 0 && days < 60) {
      expiringSoonCustomers.push(customer);
    }
  }

  return buildCustomerListFilterContext({
    currentBillingMonth: getCurrentSeoulBillingMonth(),
    issuedDraftsByCustomerId: buildIssuedDraftsByCustomerId(drafts),
    expiredCertCustomers,
    expiringSoonCustomers,
    contractRenewalDueItems
  });
}

function getDaysUntilDate(value: string | null): number | null {
  if (!value) return null;
  const expireDateKey = normalizeCustomerCertificateExpireDateKey(value);
  if (!expireDateKey) return null;
  const [year, month, day] = expireDateKey.split("-").map(Number);
  const target = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

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
    return "등록 처리 완료";
  }

  if (customer.popbillState === "failed") {
    return "등록 처리 확인 필요";
  }

  return "등록 처리 대기";
}

function getCustomerCertificateSummary(customer: Customer): string {
  if (!customer.popbillCertRegistered) {
    return "인증서 미등록";
  }

  const days = getDaysUntilDate(customer.popbillCertExpireDate);
  if (days !== null && days < 0) {
    return "인증서 만료";
  }

  if (days !== null && days < 60) {
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
    return "운영 개통 전입니다. 계약/개통 후 조회 가능합니다.";
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

function getOnboardingElectronicTaxBusinessNumbers(
  workbook: CustomerOnboardingWorkbookInput | null
): string[] {
  if (!workbook) {
    return [];
  }

  return [...new Set(
    (workbook.certificates ?? [])
      .filter((certificate) => certificate.certificateKind === "electronic_tax")
      .map((certificate) => digitsOnly(certificate.businessNumber))
      .filter((businessNumber): businessNumber is string => Boolean(businessNumber))
  )];
}

function areOnboardingCustomersRegistered(customers: Customer[], targetBusinessNumbers: string[] = []): boolean {
  if (customers.length === 0) {
    return false;
  }
  const normalizedTargets = [...new Set(targetBusinessNumbers.map((businessNumber) => digitsOnly(businessNumber)).filter(Boolean))];
  if (normalizedTargets.length === 0) {
    return true;
  }
  const registeredBusinessNumbers = new Set(customers.map((customer) => digitsOnly(customer.businessNumber)).filter(Boolean));
  return normalizedTargets.every((businessNumber) => registeredBusinessNumbers.has(businessNumber));
}

function areOnboardingCustomersJoined(customers: Customer[], targetBusinessNumbers: string[] = []): boolean {
  if (customers.length === 0) {
    return false;
  }
  const normalizedTargets = [...new Set(targetBusinessNumbers.map((businessNumber) => digitsOnly(businessNumber)).filter(Boolean))];
  if (normalizedTargets.length === 0) {
    return false;
  }
  return normalizedTargets.every((businessNumber) => {
    const customer = customers.find((item) => digitsOnly(item.businessNumber) === businessNumber);
    return customer?.popbillState === "joined";
  });
}

function filterOnboardingTargetBusinessNumbersToExistingCustomers(
  customers: Customer[],
  targetBusinessNumbers: string[]
): string[] {
  const registeredBusinessNumbers = new Set(customers.map((customer) => digitsOnly(customer.businessNumber)).filter(Boolean));
  const filtered = targetBusinessNumbers.filter((businessNumber) => registeredBusinessNumbers.has(digitsOnly(businessNumber)));
  return filtered.length > 0 ? filtered : targetBusinessNumbers;
}

function getOnboardingElectronicTaxCertificateRowForCustomer(
  workbook: CustomerOnboardingWorkbookInput | null,
  customer: Customer
): CustomerOnboardingWorkbookInput["certificates"][number] | null {
  const businessNumber = digitsOnly(customer.businessNumber);
  const matches = (workbook?.certificates ?? []).filter(
    (certificate) =>
      certificate.certificateKind === "electronic_tax" && digitsOnly(certificate.businessNumber) === businessNumber
  );
  return matches.find((certificate) => certificate.isPrimary) ?? matches[0] ?? null;
}

function getPrimaryElectronicTaxCertificateForCustomer(
  customerCertificates: CustomerCertificate[],
  customerId: number
): CustomerCertificate | null {
  const matches = customerCertificates.filter(
    (certificate) => certificate.customerId === customerId && certificate.certificateKind === "electronic_tax"
  );
  return matches.find((certificate) => certificate.isPrimary) ?? matches[0] ?? null;
}

function hasExpiredOnboardingElectronicTaxCertificate(options: {
  workbook: CustomerOnboardingWorkbookInput | null;
  customer: Customer;
  customerCertificates?: CustomerCertificate[];
  localCertificates?: RenewalAgentCertificate[];
}): boolean {
  const linkedCertificate = getPrimaryElectronicTaxCertificateForCustomer(
    options.customerCertificates ?? [],
    options.customer.id
  );
  if (linkedCertificate?.expireDate && isCustomerCertificateExpired(linkedCertificate.expireDate)) {
    return true;
  }

  const onboardingCertificateRow = getOnboardingElectronicTaxCertificateRowForCustomer(options.workbook, options.customer);
  const certificateLabel =
    onboardingCertificateRow?.certificateName.trim() ||
    linkedCertificate?.certificateName.trim() ||
    options.customer.corpName.trim() ||
    options.customer.customerName.trim();
  const identity = {
    certificateIndex: onboardingCertificateRow?.certificateIndex ?? null,
    certificateCn: certificateLabel || null,
    serial: onboardingCertificateRow?.serial || linkedCertificate?.serial || null,
    userDN: onboardingCertificateRow?.userDN || linkedCertificate?.userDN || null
  };
  return findRenewalCertificatesByIdentity(
    (options.localCertificates ?? []).filter(
      (certificate) => deriveCustomerCertificateKind(certificate) === "electronic_tax"
    ),
    identity
  ).some((certificate) => isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null));
}

function getOnboardingPendingCertificateCustomers(
  workbook: CustomerOnboardingWorkbookInput | null,
  customers: Customer[],
  fallbackBusinessNumbers: string[] = [],
  options: {
    customerCertificates?: CustomerCertificate[];
    localCertificates?: RenewalAgentCertificate[];
  } = {}
): Customer[] {
  const workbookBusinessNumbers = getOnboardingElectronicTaxBusinessNumbers(workbook);
  const businessNumbers =
    workbookBusinessNumbers.length > 0
      ? workbookBusinessNumbers
      : [...new Set(fallbackBusinessNumbers.map((businessNumber) => digitsOnly(businessNumber)).filter(Boolean))];
  if (businessNumbers.length === 0) {
    return [];
  }

  return businessNumbers
    .map((businessNumber) => customers.find((customer) => digitsOnly(customer.businessNumber) === businessNumber) ?? null)
    .filter(
      (customer): customer is Customer =>
        Boolean(
          customer &&
            (customer.popbillState !== "joined" || !customer.popbillCertRegistered) &&
            !hasExpiredOnboardingElectronicTaxCertificate({
              workbook,
              customer,
              customerCertificates: options.customerCertificates,
              localCertificates: options.localCertificates
            })
        )
    );
}

function getOnboardingCertificateRegistrationTargets(
  workbook: CustomerOnboardingWorkbookInput | null,
  customers: Customer[],
  fallbackBusinessNumbers: string[] = [],
  options: {
    customerCertificates?: CustomerCertificate[];
    localCertificates?: RenewalAgentCertificate[];
  } = {}
): Customer[] {
  return getOnboardingPendingCertificateCustomers(workbook, customers, fallbackBusinessNumbers, options).filter(
    (customer) => customer.popbillState === "joined" && !customer.popbillCertRegistered
  );
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
    issueCompleteSmsTemplate: draft.issueCompleteSmsTemplate.trim(),
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
  const [workspaceLogs, setWorkspaceLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hashTab = getTabFromHash(hash);
    return hashTab ?? "home";
  });
  const [activeOpsSection, setActiveOpsSection] = useState<OpsSectionId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    return getOpsSectionFromHash(hash) ?? OPS_DEFAULT_SECTION;
  });
  const [consultationStatusFilter, setConsultationStatusFilter] =
    useState<ConsultationStatusFilter>("all");
  const [requestedOnboardingStepId, setRequestedOnboardingStepId] = useState<string | null>(null);
  const [requestedIssuanceFilter, setRequestedIssuanceFilter] = useState<"unmatched" | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormDefaults());
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerListFilter, setCustomerListFilter] = useState<CustomerListFilter>("all");
  const [customerSearchField, setCustomerSearchField] = useState<CustomerSearchField>("all");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerIssueMonthQuery, setCustomerIssueMonthQuery] = useState("");
  const [customerDetailTab, setCustomerDetailTab] = useState<CustomerDetailTabId>("info");
  const [workFeedTab, setWorkFeedTab] = useState<"inbox" | "issued">("inbox");
  const [ownerPasswordResetForm, setOwnerPasswordResetForm] = useState<PasswordResetFormState>(
    createEmptyPasswordResetForm
  );
  const [ownerPasswordResetTarget, setOwnerPasswordResetTarget] =
    useState<OwnerPasswordResetTarget | null>(null);
  const [opsWorkspaceMailSettingsTarget, setOpsWorkspaceMailSettingsTarget] =
    useState<OpsWorkspaceMailSettingsTarget | null>(null);
  const [opsWorkspaceMailSettingsForm, setOpsWorkspaceMailSettingsForm] =
    useState<OpsWorkspaceMailSettingsFormState>(baseOpsWorkspaceMailSettingsForm);
  const [workspaceLimitEdits, setWorkspaceLimitEdits] = useState<Record<string, string>>({});
  const navigateToOpsSection = useCallback((section: OpsSectionId) => {
    setActiveTab("ops");
    setActiveOpsSection(section);

    if (typeof window === "undefined") {
      return;
    }

    const nextHash = getOpsSectionHash(section);
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", nextHash);
    }
  }, []);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("onboarding");
  const [taskNotificationOpen, setTaskNotificationOpen] = useState(false);
  const [appDialog, setAppDialog] = useState<AppDialogState | null>(null);
  const [customerAddressResolveMessage, setCustomerAddressResolveMessage] = useState("");
  const [customerImportFile, setCustomerImportFile] = useState<CustomerImportParsedFile | null>(null);
  const [customerImportHeaderRowIndex, setCustomerImportHeaderRowIndex] = useState(0);
  const [customerImportMapping, setCustomerImportMapping] = useState<CustomerImportMapping>(EMPTY_CUSTOMER_IMPORT_MAPPING);
  const [customerImportPreview, setCustomerImportPreview] = useState<CustomerImportPreviewResponse | null>(null);
  const [customerImportProfile, setCustomerImportProfile] = useState<CustomerImportProfile | null>(null);
  const [completedBillingMonths, setCompletedBillingMonths] = useState<CompletedBillingMonth[]>([]);
  const [issuedMonthlyTrend, setIssuedMonthlyTrend] = useState<IssuedMonthlyTrendPayload | null>(null);
  const [issuedMonthlyTrendLoading, setIssuedMonthlyTrendLoading] = useState(false);
  const [issuedMonthlyTrendError, setIssuedMonthlyTrendError] = useState("");
  const [customerContractRenewalsDue, setCustomerContractRenewalsDue] = useState<CustomerContractRenewalDueItem[]>([]);
  const [customerContractSummaries, setCustomerContractSummaries] = useState<CustomerContractSummary[]>([]);
  const [customerImportError, setCustomerImportError] = useState("");
  const [customerImportNotice, setCustomerImportNotice] = useState("");
  const [customerOnboardingFileName, setCustomerOnboardingFileName] = useState("");
  const [customerOnboardingWorkbook, setCustomerOnboardingWorkbook] = useState<CustomerOnboardingWorkbookInput | null>(null);
  const [customerOnboardingPreview, setCustomerOnboardingPreview] = useState<CustomerOnboardingPreviewResponse | null>(null);
  const [customerOnboardingSessionState, setCustomerOnboardingSessionState] =
    useState<CustomerOnboardingSessionState>(emptyCustomerOnboardingSessionState);
  const [customerOnboardingSharedPassword, setCustomerOnboardingSharedPassword] = useState("");
  const [customerOnboardingCertificatePasswordOverrides, setCustomerOnboardingCertificatePasswordOverrides] =
    useState<Record<string, string>>({});
  const [customerOnboardingPreflightPasswordFailureEntries, setCustomerOnboardingPreflightPasswordFailureEntries] =
    useState<Array<{ key: string; label: string }>>([]);
  const [customerOnboardingAttemptedCertificateBusinessNumbers, setCustomerOnboardingAttemptedCertificateBusinessNumbers] =
    useState<string[]>([]);
  const [customerOnboardingNotice, setCustomerOnboardingNotice] = useState("");
  const [customerOnboardingCertificateRegistrationProgress, setCustomerOnboardingCertificateRegistrationProgress] =
    useState<ElectronicTaxOnboardingCertificateRegistrationProgress | null>(null);
  const [customerOnboardingJoinProgress, setCustomerOnboardingJoinProgress] =
    useState<InitialRegistrationJoinProgress | null>(null);
  const [certificateReadProgress, setCertificateReadProgress] =
    useState<SettingsCertificateReadProgress>(null);
  const [customerOnboardingError, setCustomerOnboardingError] = useState("");
  const [quickRegisterForm, setQuickRegisterForm] = useState<QuickRegisterFormState>(createQuickRegisterForm());
  const [quickRegisterNotice, setQuickRegisterNotice] = useState("");
  const [quickRegisterError, setQuickRegisterError] = useState("");
  const [completedBillingNotice, setCompletedBillingNotice] = useState("");
  const [customerCertNotice, setCustomerCertNotice] = useState("");
  const [onboardingFirstSyncResult, setOnboardingFirstSyncResult] = useState<{
    organizationId: string;
    status: "success" | "danger";
    message: string;
  } | null>(null);
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
  const customerOnboardingPreflightCacheRef = useRef<OnboardingPreflightCache>(new Map());
  const customerOnboardingStorageHydratedOrganizationRef = useRef<string | null>(null);
  const customerNameInputRef = useRef<HTMLInputElement | null>(null);
  const certSyncInFlightRef = useRef(false);
  const mailboxLoadInFlightRef = useRef(false);
  const mailboxLoadedOrganizationRef = useRef<string | null>(null);
  const authSessionRef = useRef<Session | null>(null);
  const activeLoadTokenRef = useRef(0);
  const taskNotificationRef = useRef<HTMLDivElement | null>(null);
  const tabRoutingStateRef = useRef<{ hasActiveWorkspace: boolean; onboardingComplete: boolean; isPlatformAdmin: boolean }>({
    hasActiveWorkspace: false,
    onboardingComplete: false,
    isPlatformAdmin: false
  });
  const deferredCustomerSearchQuery = useDeferredValue(customerSearchQuery);
  const deferredCustomerSearchField = useDeferredValue(customerSearchField);
  const deferredCustomerIssueMonthQuery = useDeferredValue(customerIssueMonthQuery);
  const activeOrganizationId = data?.auth.activeOrganizationId ?? null;
  useEffect(() => {
    if (!taskNotificationOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!taskNotificationRef.current?.contains(target)) {
        setTaskNotificationOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTaskNotificationOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [taskNotificationOpen]);
  useEffect(() => {
    setCustomerOnboardingSharedPassword("");
    customerOnboardingPreflightCacheRef.current.clear();
  }, [activeOrganizationId]);
  useEffect(() => {
    if (!activeOrganizationId) {
      customerOnboardingStorageHydratedOrganizationRef.current = null;
      return;
    }

    const persisted = readPersistedCustomerOnboardingState(activeOrganizationId);
    setCustomerOnboardingFileName(persisted?.fileName ?? "");
    setCustomerOnboardingWorkbook(persisted?.workbook ?? null);
    setCustomerOnboardingPreview(persisted?.preview ?? null);
    setCustomerOnboardingSessionState(
      persisted?.sessionState ?? emptyCustomerOnboardingSessionState
    );
    setCustomerOnboardingCertificatePasswordOverrides(
      persisted?.certificatePasswordOverrides ?? {}
    );
    setCustomerOnboardingPreflightPasswordFailureEntries(
      persisted?.preflightPasswordFailureEntries ?? []
    );
    setCustomerOnboardingAttemptedCertificateBusinessNumbers(
      persisted?.attemptedCertificateBusinessNumbers ?? []
    );
    setCustomerOnboardingNotice(persisted?.notice ?? "");
    setCustomerOnboardingError(persisted?.error ?? "");
    customerOnboardingStorageHydratedOrganizationRef.current = activeOrganizationId;
  }, [activeOrganizationId]);
  useEffect(() => {
    if (!activeOrganizationId) {
      return;
    }

    if (customerOnboardingStorageHydratedOrganizationRef.current !== activeOrganizationId) {
      return;
    }

    const hasPersistableState =
      customerOnboardingFileName.trim() !== "" ||
      customerOnboardingWorkbook !== null ||
      customerOnboardingPreview !== null ||
      customerOnboardingSessionState.templateDownloaded ||
      customerOnboardingSessionState.previewReady ||
      customerOnboardingSessionState.commitDone ||
      customerOnboardingSessionState.certificateDone ||
      Object.keys(customerOnboardingCertificatePasswordOverrides).length > 0 ||
      customerOnboardingPreflightPasswordFailureEntries.length > 0 ||
      customerOnboardingSessionState.targetBusinessNumbers.length > 0 ||
      customerOnboardingAttemptedCertificateBusinessNumbers.length > 0 ||
      customerOnboardingNotice.trim() !== "" ||
      customerOnboardingError.trim() !== "";

    writePersistedCustomerOnboardingState(
      activeOrganizationId,
      hasPersistableState
        ? {
            fileName: customerOnboardingFileName,
            workbook: customerOnboardingWorkbook,
            preview: customerOnboardingPreview,
            sessionState: customerOnboardingSessionState,
            certificatePasswordOverrides:
              customerOnboardingCertificatePasswordOverrides,
            preflightPasswordFailureEntries:
              customerOnboardingPreflightPasswordFailureEntries,
            attemptedCertificateBusinessNumbers:
              customerOnboardingAttemptedCertificateBusinessNumbers,
            notice: customerOnboardingNotice,
            error: customerOnboardingError
          }
        : null
    );
  }, [
    activeOrganizationId,
    customerOnboardingError,
    customerOnboardingFileName,
    customerOnboardingNotice,
    customerOnboardingPreview,
    customerOnboardingCertificatePasswordOverrides,
    customerOnboardingPreflightPasswordFailureEntries,
    customerOnboardingSessionState,
    customerOnboardingWorkbook,
    customerOnboardingAttemptedCertificateBusinessNumbers
  ]);
  useEffect(() => {
    if (!activeOrganizationId || !data) {
      return;
    }

    if (!customerOnboardingSessionState.commitDone || data.customers.length > 0) {
      return;
    }

    setCustomerOnboardingSessionState((prev) =>
      prev.commitDone || prev.certificateDone
        ? {
            ...prev,
            commitDone: false,
            certificateDone: false
          }
        : prev
    );
  }, [activeOrganizationId, customerOnboardingSessionState.commitDone, data]);
  const [helperSetupPreference, setHelperSetupPreference] = useState<{
    organizationId: string | null;
    completed: boolean;
  }>({
    organizationId: null,
    completed: false
  });
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
  const loadIssuedMonthlyTrend = useCallback(
    async (anchorBillingYear?: string) => {
      if (!activeOrganizationId) {
        setIssuedMonthlyTrend(null);
        setIssuedMonthlyTrendError("");
        setIssuedMonthlyTrendLoading(false);
        return;
      }

      setIssuedMonthlyTrendLoading(true);
      setIssuedMonthlyTrendError("");
      try {
        const query = anchorBillingYear ? `?year=${encodeURIComponent(anchorBillingYear)}` : "";
        setIssuedMonthlyTrend(await api<IssuedMonthlyTrendPayload>(`/api/drafts/issued-monthly-trend${query}`));
      } catch (trendError) {
        setIssuedMonthlyTrendError(getDisplayErrorMessage(trendError, "월별 발행 현황을 불러오지 못했습니다."));
      } finally {
        setIssuedMonthlyTrendLoading(false);
      }
    },
    [activeOrganizationId]
  );
  useEffect(() => {
    if (!activeOrganizationId) {
      setIssuedMonthlyTrend(null);
      setIssuedMonthlyTrendError("");
      setIssuedMonthlyTrendLoading(false);
      return;
    }

    void loadIssuedMonthlyTrend();
  }, [activeOrganizationId, loadIssuedMonthlyTrend]);
  const invalidateActiveLoads = () => {
    activeLoadTokenRef.current += 1;
  };
  const ensureActiveLoad = (loadToken: number) => {
    if (activeLoadTokenRef.current !== loadToken || !authSessionRef.current) {
      throw new LoadCancelledError();
    }
  };

  const loadOpsConsole = async (options?: { includeWorkspaceLogs?: boolean }): Promise<OpsConsoleData> => {
    const [partnerPoints, renewalAutomation, logs, workspaces, signupRequests, consultationRequests] = await Promise.all([
      api<PartnerPointsPayload>("/api/popbill/partner-points"),
      api<RenewalAutomationPayload>("/api/automation/renewal-agent/snapshot"),
      options?.includeWorkspaceLogs ? api<LogEntry[]>("/api/logs") : Promise.resolve([]),
      api<OpsWorkspaceSummary[]>("/api/ops/workspaces"),
      api<PublicSignupRequest[]>("/api/ops/signup-requests"),
      api<PublicConsultationRequest[]>("/api/ops/consultation-requests")
    ]);

    return {
      partnerPoints,
      renewalAutomation,
      logs,
      workspaces,
      signupRequests,
      consultationRequests
    };
  };

  const defaultRenewalHelperDownloadUrl =
    import.meta.env.VITE_RENEWAL_HELPER_DOWNLOAD_URL?.trim() || "/downloads/AT%20helper.exe";
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

  const refreshIssuanceData = async (options?: { includeCustomers?: boolean }) => {
    const activeOrganizationId = data?.auth.activeOrganizationId ?? null;
    if (!activeOrganizationId) {
      return;
    }

    setMailboxDataLoading(true);
    try {
      const [inbox, drafts, customers] = await Promise.all([
        api<BootstrapPayload["inbox"]>("/api/inbox"),
        api<BootstrapPayload["drafts"]>("/api/drafts"),
        options?.includeCustomers ? api<Customer[]>("/api/customers") : Promise.resolve(null)
      ]);
      setData((prev) =>
        prev && prev.auth.activeOrganizationId === activeOrganizationId
          ? {
              ...prev,
              inbox,
              drafts,
              ...(customers ? { customers } : {})
            }
          : prev
      );
      mailboxLoadedOrganizationRef.current = activeOrganizationId;
      setMailboxDataLoaded(true);
    } finally {
      setMailboxDataLoading(false);
    }
  };

  const load = async (): Promise<BootstrapPayload> => {
    const loadToken = activeLoadTokenRef.current + 1;
    activeLoadTokenRef.current = loadToken;
    const payload = await api<BootstrapPayload>("/api/bootstrap");
    ensureActiveLoad(loadToken);
    const [
      nextOpsConsole,
      nextWorkspaceLogs,
      nextCompletedBillingMonths,
      nextCustomerContractRenewalsDue,
      nextCustomerContractSummaries
    ] = await Promise.all([
      payload.auth.isPlatformAdmin
        ? loadOpsConsole({ includeWorkspaceLogs: Boolean(payload.auth.activeOrganizationId) })
        : Promise.resolve(null),
      payload.auth.activeOrganizationId ? api<LogEntry[]>("/api/logs") : Promise.resolve([]),
      payload.auth.activeOrganizationId
        ? api<{ months: CompletedBillingMonth[] }>("/api/completed-billing-months").then((response) => response.months)
        : Promise.resolve([]),
      payload.auth.activeOrganizationId
        ? api<CustomerContractRenewalDueItem[]>("/api/customers/contract-renewals/due")
        : Promise.resolve([]),
      payload.auth.activeOrganizationId
        ? api<CustomerContractSummary[]>("/api/customers/contract-summaries")
        : Promise.resolve([])
    ]);
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
    setWorkspaceLogs(nextWorkspaceLogs);
    setCompletedBillingMonths(nextCompletedBillingMonths);
    setCustomerContractRenewalsDue(nextCustomerContractRenewalsDue);
    setCustomerContractSummaries(nextCustomerContractSummaries);
    setWorkspaceLimitEdits(
      nextOpsConsole
        ? Object.fromEntries(
            nextOpsConsole.workspaces.map((workspace) => [
              workspace.organizationId,
              String(workspace.monthlyIssueLimit)
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
    return nextPayload;
  };

  const refreshCustomerContractRenewalsDue = async () => {
    if (!activeOrganizationId) {
      setCustomerContractRenewalsDue([]);
      return;
    }

    const nextCustomerContractRenewalsDue = await api<CustomerContractRenewalDueItem[]>("/api/customers/contract-renewals/due");
    setCustomerContractRenewalsDue(nextCustomerContractRenewalsDue);
  };

  const upsertCustomerContractSummary = (summary: CustomerContractSummary) => {
    setCustomerContractSummaries((current) => {
      if (current.some((entry) => entry.customerId === summary.customerId)) {
        return current.map((entry) => (entry.customerId === summary.customerId ? summary : entry));
      }
      return [...current, summary];
    });
  };

  const handleCustomerReportDetailSaved = async (detail: CustomerReportDetail) => {
    upsertCustomerContractSummary({
      customerId: detail.customerId,
      contractStartMonth: detail.profile.contractStartMonth,
      contractEndMonth: detail.profile.contractEndMonth
    });
    await refreshCustomerContractRenewalsDue();
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
    if (activeTab !== "home" || !activeOrganizationId) {
      return;
    }

    void refreshCustomerContractRenewalsDue();
  }, [activeOrganizationId, activeTab]);

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

  const showAppProgress = (
    message: string,
    options?: {
      title?: string;
      tone?: AppDialogTone;
    }
  ) => {
    setAppDialog({
      kind: "progress",
      title: options?.title ?? "처리 중",
      message,
      confirmLabel: "",
      tone: options?.tone ?? "default"
    });
  };

  const closeAppProgress = () => {
    setAppDialog((prev) => (prev?.kind === "progress" ? null : prev));
  };

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
          await loadIssuedMonthlyTrend(issuedMonthlyTrend?.anchorBillingYear);
        }
      } catch (actionError) {
        setError(getDisplayErrorMessage(actionError, "작업에 실패했습니다."));
      } finally {
        setBusyKey(null);
      }
    },
    [activeTab, customerDetailTab, issuedMonthlyTrend?.anchorBillingYear, load, loadIssuedMonthlyTrend, loadMailboxData]
  );

  const syncCustomerOnboardingCertificateDone = useCallback(
    (payload: BootstrapPayload) => {
      const targetBusinessNumbers =
        customerOnboardingSessionState.targetBusinessNumbers.length > 0
          ? customerOnboardingSessionState.targetBusinessNumbers
          : getOnboardingElectronicTaxBusinessNumbers(customerOnboardingWorkbook);
      const registrationDone = areOnboardingCustomersJoined(payload.customers, targetBusinessNumbers);
      const certificateDone =
        registrationDone &&
        getOnboardingPendingCertificateCustomers(
          customerOnboardingWorkbook,
          payload.customers,
          targetBusinessNumbers,
          {
            customerCertificates: payload.customerCertificates
          }
        ).length === 0;
      setCustomerOnboardingSessionState((prev) =>
        prev.commitDone === registrationDone && prev.certificateDone === certificateDone
          ? prev
          : {
              ...prev,
              commitDone: registrationDone,
              certificateDone
            }
      );
      return certificateDone;
    },
    [
      customerOnboardingSessionState.targetBusinessNumbers,
      customerOnboardingWorkbook
    ]
  );

  const pollOnboardingPendingJoins = useCallback(async () => {
    try {
      await api("/api/customer-onboarding/follow-up/run", {
        method: "POST",
        body: JSON.stringify({ limit: 5 })
      });
    } catch {
      // best-effort trigger while onboarding waits for async Popbill joins
    }

    try {
      const payload = await load();
      const targetBusinessNumbers = customerOnboardingSessionState.targetBusinessNumbers;
      const joinProgress = buildInitialRegistrationJoinProgress(payload.customers, targetBusinessNumbers);
      if (joinProgress) {
        setCustomerOnboardingJoinProgress(joinProgress);
        setCustomerOnboardingNotice(
          joinProgress.status === "complete"
            ? `발행 연동 준비 완료 ${joinProgress.completed}/${joinProgress.total}건`
            : `발행 연동 준비 중 ${joinProgress.completed}/${joinProgress.total}건`
        );
      }
      syncCustomerOnboardingCertificateDone(payload);
    } catch {
      // keep polling on the next cycle
    }
  }, [customerOnboardingSessionState.targetBusinessNumbers, load, syncCustomerOnboardingCertificateDone]);

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
    (certificate) =>
      deriveCustomerCertificateKind(certificate) === "electronic_tax" &&
      !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
  ).length;
  const customerRenewalAssistantGeneralCertificateCount = customerRenewalAssistantAllCertificates.filter((certificate) => {
    const kind = deriveCustomerCertificateKind(certificate);
    return (
      (kind === "general_personal" || kind === "general_business") &&
      !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
    );
  }).length;
  const customerRenewalAssistantAvailableCertificateCount = customerRenewalAssistantAllCertificates.filter(
    (certificate) => !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
  ).length;
  const helperSetupCompleted =
    helperSetupPreference.organizationId === activeOrganizationId && helperSetupPreference.completed;
  const helperVersionMismatch = helperUpgradeRequired || helperUpgradeAvailable;
  const helperOnboardingReady =
    helperReady ||
    (helperSetupCompleted &&
      Boolean(customerRenewalAssistant?.agentOnline) &&
      !helperVersionMismatch);

  const settingsScreenState = useSettingsScreenState({
    activeOrganizationId,
    bootstrapOrganizationId: data?.auth.activeOrganizationId ?? null,
    activeOrganizationRole: data?.auth.activeOrganizationRole ?? null,
    bootstrapSettings: data?.settings ?? null,
    busyKey,
    currentUserId: data?.auth.userId ?? null,
    helperReady: helperOnboardingReady,
    helperCertificateCount: customerRenewalAssistantAvailableCertificateCount,
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
  const runSettingsCertificateRead = useCallback(
    async () =>
      runAction(
        "customer-renewal-bridge-probe",
        async () => {
          setCertificateReadProgress({
            label: "AT 헬퍼 확인 중",
            detail: "공동인증서를 읽기 전에 헬퍼 연결 상태를 확인하고 있습니다.",
            percent: 10,
            completedCount: 0,
            totalCount: null,
            status: "running"
          });
          try {
            setCertificateReadProgress({
              label: "공동인증서 저장소 읽는 중",
              detail: "PC의 공동인증서 저장소에서 공동인증서를 찾고 있습니다.",
              percent: 25,
              completedCount: 0,
              totalCount: null,
              status: "running"
            });
            const certificates = await syncCustomerRenewalCertificates({ showAlert: false });
            const electronicTaxCertificateCount = certificates.filter(
              (certificate) =>
                deriveCustomerCertificateKind(certificate) === "electronic_tax" &&
                !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
            ).length;
            const generalCertificateCount = certificates.filter((certificate) => {
              const kind = deriveCustomerCertificateKind(certificate);
              return (
                (kind === "general_personal" || kind === "general_business") &&
                !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
              );
            }).length;
            const availableCertificateCount = electronicTaxCertificateCount + generalCertificateCount;
            setCertificateReadProgress({
              label: "읽기 완료",
              detail: `사용 가능한 전자세금용 공동인증서 ${electronicTaxCertificateCount}건, 범용 공동인증서 ${generalCertificateCount}건을 확인했습니다.`,
              percent: 100,
              completedCount: availableCertificateCount,
              totalCount: availableCertificateCount,
              status: "done"
            });
          } catch (readError) {
            setCertificateReadProgress({
              label: "읽기 실패",
              detail: getDisplayErrorMessage(readError, "공동인증서를 읽지 못했습니다."),
              percent: 100,
              completedCount: 0,
              totalCount: null,
              status: "error"
            });
            throw readError;
          }
        },
        { reload: false }
      ),
    [runAction, syncCustomerRenewalCertificates]
  );
  const customerOnboardingSessionActive =
    customerOnboardingSessionState.commitDone ||
    customerOnboardingSessionState.previewReady ||
    customerOnboardingSessionState.targetBusinessNumbers.length > 0 ||
    customerOnboardingWorkbook !== null ||
    customerOnboardingPreview !== null ||
    customerOnboardingFileName.trim() !== "";
  const rawCustomerOnboardingTargetBusinessNumbers =
    customerOnboardingSessionState.targetBusinessNumbers.length > 0
      ? customerOnboardingSessionState.targetBusinessNumbers
      : getOnboardingElectronicTaxBusinessNumbers(customerOnboardingWorkbook);
  const customerOnboardingTargetBusinessNumbers =
    data &&
    customerOnboardingSessionActive &&
    customerOnboardingPreview === null &&
    customerOnboardingSessionState.previewReady
      ? filterOnboardingTargetBusinessNumbersToExistingCustomers(data.customers, rawCustomerOnboardingTargetBusinessNumbers)
      : rawCustomerOnboardingTargetBusinessNumbers;
  const settingsDerivedOnboardingPendingCertificateCount =
    !data
      ? 0
      : customerOnboardingSessionActive
        ? getOnboardingPendingCertificateCustomers(
            customerOnboardingWorkbook,
            data.customers,
            customerOnboardingTargetBusinessNumbers,
            {
              customerCertificates: data.customerCertificates,
              localCertificates: customerRenewalAssistantAllCertificates
            }
          ).length
        : data.customers.filter(
            (customer) =>
              customer.popbillState !== "joined" || !customer.popbillCertRegistered
          ).length;
  const settingsDerivedOnboardingCustomersRegistered =
    data && customerOnboardingSessionActive
      ? areOnboardingCustomersRegistered(data.customers, customerOnboardingTargetBusinessNumbers)
      : false;
  const settingsDerivedOnboardingCustomersJoined =
    data && customerOnboardingSessionActive
      ? areOnboardingCustomersJoined(data.customers, customerOnboardingTargetBusinessNumbers)
      : false;
  const settingsDerivedCustomerRegistrationReady = customerOnboardingSessionActive
    ? settingsDerivedOnboardingCustomersJoined
    : (data?.customers.length ?? 0) > 0;
  useEffect(() => {
    if (!activeOrganizationId || !data || !customerOnboardingSessionActive) {
      return;
    }

    if (!areOnboardingCustomersRegistered(data.customers, customerOnboardingTargetBusinessNumbers)) {
      return;
    }

    const pendingCertificateCount = getOnboardingPendingCertificateCustomers(
      customerOnboardingWorkbook,
      data.customers,
      customerOnboardingTargetBusinessNumbers,
      {
        customerCertificates: data.customerCertificates,
        localCertificates: customerRenewalAssistantAllCertificates
      }
    ).length;
    setCustomerOnboardingSessionState((prev) => {
      const nextCommitDone = areOnboardingCustomersJoined(data.customers, customerOnboardingTargetBusinessNumbers);
      const nextCertificateDone = nextCommitDone && pendingCertificateCount === 0 ? true : prev.certificateDone;
      return prev.commitDone === nextCommitDone && prev.certificateDone === nextCertificateDone
        ? prev
        : {
            ...prev,
            commitDone: nextCommitDone,
            certificateDone: nextCertificateDone
          };
    });
  }, [
    activeOrganizationId,
    customerOnboardingSessionActive,
    customerOnboardingSessionState.targetBusinessNumbers,
    customerOnboardingTargetBusinessNumbers,
    customerOnboardingWorkbook,
    customerRenewalAssistantAllCertificates,
    data
  ]);
  const settingsDerivedModel = useSettingsDerivedModel({
    actionBar: {
      setupPendingCount: settingsScreenState.setupPendingCount,
      nextSettingsSection: settingsScreenState.nextSettingsSection,
      settingsHealth,
        helperReady: helperOnboardingReady,
      settingsAutosaveLabel: settingsScreenState.settingsAutosaveLabel,
      settingsAutosaveState: settingsScreenState.settingsAutosaveState
    },
    onboarding: {
      fields: {
        mailAddress: settingsForm?.mailAddress ?? "",
        mailPassword: settingsForm?.mailPassword ?? "",
        popbillUserIdPrefix: settingsForm?.popbillUserIdPrefix ?? "",
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
        ready: helperOnboardingReady,
        online: customerRenewalAssistant?.agentOnline ?? false,
        certificateCount: customerRenewalAssistantAvailableCertificateCount,
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
      ready: helperOnboardingReady,
      upgradeRequired: helperUpgradeRequired,
      upgradeAvailable: helperUpgradeAvailable,
      actionBlockedReason: helperActionBlockedReason,
      online: customerRenewalAssistant?.agentOnline ?? false,
      electronicTaxCertificateCount: customerRenewalAssistantElectronicTaxCertificateCount,
      generalCertificateCount: customerRenewalAssistantGeneralCertificateCount,
      upgradeMessage: customerRenewalAssistant?.upgradeMessage ?? null,
      latestVersion: customerRenewalAssistant?.latestVersion ?? null,
      minSupportedVersion: customerRenewalAssistant?.minSupportedVersion ?? null
    },
    certificateReadProgress,
    renewalHelperDownloadUrl,
    runReadCertificates: runSettingsCertificateRead
  });

  const certificatesScreenModel = useCertificatesScreenModel({
    customers: data?.customers ?? [],
    customerCertificates: data?.customerCertificates ?? [],
    customerRenewalAssistantOnline: customerRenewalAssistant?.agentOnline ?? false,
    customerRenewalAssistantJobs,
    customerRenewalAssistantAllCertificates
  });

  useAuthSessionBootstrap({
    authSessionRef,
    setAuthReady,
    setAuthSession,
    setRecoveryMode,
    setError,
    setAuthNotice,
    onSignedOut: () => {
      invalidateActiveLoads();
      setData(null);
      setOpsConsole(null);
      setWorkspaceLogs([]);
      setCustomerContractRenewalsDue([]);
      setAppDialog(null);
      appDialogResolverRef.current = null;
      setActiveOrganizationId(null);
    }
  });

  useEffect(() => {
    if (!authReady || !authSession || recoveryMode) return;

    void loadWithRetry().catch(async (loadError) => {
      if (!isLoadCancelledError(loadError)) {
        const message = getDisplayErrorMessage(loadError, "초기 데이터를 불러오지 못했습니다.");
        if (loadError instanceof ApiError && (loadError.status === 401 || loadError.status === 403)) {
          invalidateActiveLoads();
          if (loadError.status === 401) {
            setError("로그인 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
            return;
          }

          authSessionRef.current = null;
          setAuthSession(null);
          setData(null);
          setOpsConsole(null);
          setWorkspaceLogs([]);
          setCustomerContractRenewalsDue([]);
          setActiveOrganizationId(null);
          setAuthNotice("접속 가능한 작업공간이 없어 다시 로그인해야 합니다.");
          await signOutSafely({ scope: "local" });
          return;
        }
        setError(message);
      }
    });
  }, [authReady, authSession, recoveryMode]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;

      if (isSupabaseRecoveryHash(hash)) {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
        return;
      }

      if ((!authSession || !data) && isPublicAuthHash(hash)) {
        return;
      }

      const nextOpsSection = getOpsSectionFromHash(hash);
      const nextTab = getTabFromHash(hash);

      if (nextTab) {
        const resolvedTab = resolveWorkspaceTab(nextTab, tabRoutingStateRef.current);
        if (nextTab === "onboarding" && tabRoutingStateRef.current.hasActiveWorkspace) {
          setRequestedOnboardingStepId(null);
          setActiveSettingsSection("onboarding");
        }
        if (nextOpsSection) {
          setActiveOpsSection(nextOpsSection);
        }
        setActiveTab(resolvedTab);
        if (resolvedTab !== nextTab) {
          window.history.replaceState(null, "", `#${resolvedTab}`);
        }
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
  }, [authSession, data]);

  useEffect(() => {
    if (recoveryMode || hasSupabaseAuthHash(window.location.hash)) {
      return;
    }

    if (!authSession) {
      return;
    }

    if (!data && isPublicAuthHash(window.location.hash)) {
      return;
    }

    const activeHash = activeTab === "ops" ? getOpsSectionHash(activeOpsSection) : `#${activeTab}`;
    if (window.location.hash !== activeHash) {
      window.history.replaceState(null, "", activeHash);
    }
  }, [activeTab, activeOpsSection, authSession, data, recoveryMode]);

  useEffect(() => {
    if (!activeOrganizationId) {
      setHelperSetupPreference({
        organizationId: null,
        completed: false
      });
      return;
    }

    setHelperSetupPreference({
      organizationId: activeOrganizationId,
      completed: readHelperSetupCompletedPreference(activeOrganizationId)
    });
  }, [activeOrganizationId]);

  useEffect(() => {
    if (!helperSetupPreference.organizationId) {
      return;
    }

    writeHelperSetupCompletedPreference(
      helperSetupPreference.organizationId,
      helperSetupPreference.completed
    );
  }, [helperSetupPreference]);

  useEffect(() => {
    if (!activeOrganizationId || !helperReady) {
      return;
    }

    setHelperSetupPreference((prev) =>
      prev.organizationId === activeOrganizationId && prev.completed
        ? prev
        : {
            organizationId: activeOrganizationId,
            completed: true
          }
    );
  }, [activeOrganizationId, helperReady]);

  useEffect(() => {
    if (!data) return;

    const nextTab = resolveWorkspaceTab(activeTab, tabRoutingStateRef.current);

    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, data, customerRenewalAssistant]);

  useEffect(() => {
    if (!data || activeTab !== "customers" || creatingCustomer) return;
    const customerListFilterContext = buildCurrentCustomerListFilterContext(
      data.customers,
      data.drafts,
      customerContractRenewalsDue
    );
    const issuedDraftsByCustomerId = buildIssuedDraftsByCustomerId(data.drafts);
    const visibleCustomers = data.customers.filter((customer) => {
      const matchesFilter = matchesCustomerListFilter(customer, customerListFilter, customerListFilterContext);
      const customerIssueMonths = (issuedDraftsByCustomerId.get(customer.id) ?? []).map((draft) => draft.billingMonth);
      const matchesSearch = matchesCustomerSearchQuery(customer, customerSearchQuery, customerSearchField, customerIssueMonths);
      const matchesIssueMonth = matchesCustomerSearchQuery(customer, customerIssueMonthQuery, "issueMonth", customerIssueMonths);
      return matchesFilter && matchesSearch && matchesIssueMonth;
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
  }, [
    activeTab,
    creatingCustomer,
    customerContractRenewalsDue,
    customerForm,
    customerIssueMonthQuery,
    customerListFilter,
    customerSearchField,
    customerSearchQuery,
    data
  ]);

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
    if (!data) return;

    const nextExceptionMessages = [...data.inbox]
      .filter((message) => isInboxActionable(message))
      .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());

    if (nextExceptionMessages.length === 0) {
      if (quickRegisterForm.messageId !== null) {
        setQuickRegisterForm(createQuickRegisterForm());
      }
      return;
    }

    const selectedMessage = quickRegisterForm.messageId
      ? nextExceptionMessages.find((message) => message.id === quickRegisterForm.messageId) ?? null
      : null;

    if (!selectedMessage) {
      setQuickRegisterForm(createQuickRegisterForm(nextExceptionMessages[0]));
    }
  }, [data, quickRegisterForm.messageId, completedBillingMonths]);

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
      if (appDialog.kind === "progress") {
        if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault();
        }
        return;
      }

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
      const { error: sessionError } = await setSessionSafely({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token
      });
      setApiAccessToken(result.session.access_token);
      if (sessionError) throw sessionError;
      const { session, error: sessionReadError } = await getSessionSafely();
      if (sessionReadError) throw sessionReadError;
      if (!session) {
        throw new Error("로그인 세션을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      authSessionRef.current = session;
      setAuthSession(session);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "로그인에 실패했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signUp = async (input: PublicSignupInput): Promise<boolean> => {
    try {
      setError("");
      setAuthNotice("");
      setAuthBusy(true);
      await api<{ request: PublicSignupRequest }>("/api/public/signup", {
        method: "POST",
        body: JSON.stringify(input)
      });
      setAuthNotice("회원가입 신청이 접수되었습니다. 운영자 승인 후 로그인할 수 있습니다.");
      return true;
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "회원가입 신청에 실패했습니다.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  };

  const checkSignupLoginIdAvailability = async (loginId: string): Promise<PublicSignupLoginIdAvailability> => {
    const query = new URLSearchParams({ loginId: loginId.trim() });
    return api<PublicSignupLoginIdAvailability>(`/api/public/signup/login-id-availability?${query.toString()}`);
  };

  const sendSignupPhoneVerification = async (phone: string): Promise<PublicSignupPhoneVerificationSendResult> => {
    return api<PublicSignupPhoneVerificationSendResult>("/api/public/signup/phone-verifications/send", {
      method: "POST",
      body: JSON.stringify({ phone })
    });
  };

  const confirmSignupPhoneVerification = async (input: {
    verificationId: string;
    phone: string;
    code: string;
  }): Promise<boolean> => {
    const result = await api<{ verified: boolean }>("/api/public/signup/phone-verifications/confirm", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return result.verified;
  };

  const sendSignupEmailVerification = async (email: string): Promise<PublicSignupEmailVerificationSendResult> => {
    return api<PublicSignupEmailVerificationSendResult>("/api/public/signup/email-verifications/send", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  };

  const confirmSignupEmailVerification = async (input: {
    verificationId: string;
    email: string;
    code: string;
  }): Promise<boolean> => {
    const result = await api<{ verified: boolean }>("/api/public/signup/email-verifications/confirm", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return result.verified;
  };

  const findLoginId = async (input: {
    email: string;
    emailVerificationId: string;
  }): Promise<PublicLoginIdLookupResult> => {
    try {
      setError("");
      setAuthNotice("");
      setAuthBusy(true);
      return await api<PublicLoginIdLookupResult>("/api/public/signup/login-id-lookup", {
        method: "POST",
        body: JSON.stringify(input)
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const requestPasswordReset = async (email: string): Promise<boolean> => {
    try {
      setError("");
      setAuthNotice("");
      setAuthBusy(true);

      const { error: resetError } = await resetPasswordForEmailSafely(email.trim(), {
        redirectTo: getPasswordRecoveryRedirectUrl()
      });

      if (resetError) {
        throw resetError;
      }

      setAuthNotice("비밀번호 재설정 메일을 보냈습니다. 메일의 링크에서 새 비밀번호를 설정하세요.");
      return true;
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "비밀번호 재설정 메일을 보내지 못했습니다.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    invalidateActiveLoads();
    authSessionRef.current = null;
    setApiAccessToken(null);
    setBusyKey(null);
    setError("");
    setAuthNotice("");
    setData(null);
    setOpsConsole(null);
    setWorkspaceLogs([]);
    setOwnerPasswordResetTarget(null);
    setOwnerPasswordResetForm(createEmptyPasswordResetForm());
    setOpsWorkspaceMailSettingsTarget(null);
    setOpsWorkspaceMailSettingsForm(baseOpsWorkspaceMailSettingsForm);
    setRecoveryMode(false);
    setRecoveryPasswordForm(createEmptyPasswordResetForm());
    setAppDialog(null);
    appDialogResolverRef.current = null;
    setActiveOrganizationId(null);
    setCustomerContractRenewalsDue([]);
    clearSupabaseAuthHash();
    const { error: signOutError } = await signOutSafely();
    if (signOutError) {
      setError(signOutError.message);
    }
  };

  const sendWithdrawalPhoneVerification = async (): Promise<OrganizationWithdrawalPhoneVerificationSendResult> => {
    return api<OrganizationWithdrawalPhoneVerificationSendResult>("/api/organization/withdrawal-phone-verifications/send", {
      method: "POST"
    });
  };

  const confirmWithdrawalPhoneVerification = async (input: { verificationId: string; code: string }): Promise<boolean> => {
    const result = await api<{ verified: boolean }>("/api/organization/withdrawal-phone-verifications/confirm", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return result.verified;
  };

  const withdrawOrganization = async (input: { organizationName: string; confirmText: string; phoneVerificationId: string }) => {
    const confirmed = await showAppConfirm(
      [
        `${input.organizationName} 고객사 회원탈퇴를 진행합니다.`,
        "등록된 대표자 휴대폰 인증이 확인된 경우에만 탈퇴가 진행됩니다.",
        "발행 연동 고객 해지가 먼저 실행되고, 실패가 있으면 작업공간 탈퇴는 중단됩니다.",
        "완료 후 현재 작업공간 사용자들은 더 이상 접속할 수 없습니다."
      ].join("\n"),
      {
        title: "고객사 회원탈퇴",
        tone: "danger",
        confirmLabel: "탈퇴 진행"
      }
    );
    if (!confirmed) {
      return;
    }

    let result: OrganizationWithdrawalResponse;
    try {
      result = await api<OrganizationWithdrawalResponse>("/api/organization/withdraw", {
        method: "POST",
        body: JSON.stringify(input)
      });
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        await showAppAlert(`${error.message}\n\n${error.details}`, {
          title: "회원탈퇴 중단",
          tone: "danger"
        });
      }
      throw error;
    }

    const warnings = [
      result.popbill.localResetFailed > 0
        ? `로컬 발행 연동 상태 초기화 실패 ${result.popbill.localResetFailed}건은 로그에 남겼습니다.`
        : null,
      result.auth.authDeleteFailures.length > 0
        ? `인증 계정 삭제 실패 ${result.auth.authDeleteFailures.length}건은 접근 해지 후 로그에 남겼습니다.`
        : null
    ].filter(Boolean);

    await showAppAlert(
      [
        `${result.organizationName} 고객사 회원탈퇴를 완료했습니다.`,
        `발행 연동 해지 대상 ${result.popbill.joinedTargets}건 중 해지 ${result.popbill.quit}건, 이미 없음 ${result.popbill.alreadyMissing}건입니다.`,
        `작업공간 사용자 ${result.auth.removedMemberships}명의 접근을 해지했고 대기 작업 ${result.cancelledJobs}건을 취소했습니다.`,
        ...warnings
      ].join("\n"),
      {
        title: "회원탈퇴 완료",
        tone: warnings.length > 0 ? "warn" : "success"
      }
    );

    await signOut();
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
      issueMode: "review",
      issueDay: null,
      issueHour: null,
      issueMinute: null,
      renewalContactMobile: customerForm.renewalContactMobile,
      issueCompleteSmsTemplate: customerForm.issueCompleteSmsTemplate,
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

  const saveCustomerMemo = async (customerId: number, memo: string) => {
    const savedCustomer = await api<CustomerSaveResponse>(`/api/customers/${customerId}/memo`, {
      method: "PATCH",
      body: JSON.stringify({ memo })
    });
    setData((prev) =>
      prev
        ? {
            ...prev,
            customers: prev.customers.map((customer) => (customer.id === savedCustomer.id ? savedCustomer : customer))
          }
        : prev
    );
    setCustomerForm((prev) => (prev.id === savedCustomer.id ? customerToForm(savedCustomer) : prev));
  };

  const saveCustomerIssueCompleteSmsTemplate = async (customerId: number, issueCompleteSmsTemplate: string) => {
    await runAction(
      `save-customer-message-template-${customerId}`,
      async () => {
        const savedCustomer = await api<CustomerSaveResponse>(`/api/customers/${customerId}/issue-complete-sms-template`, {
          method: "PATCH",
          body: JSON.stringify({ issueCompleteSmsTemplate })
        });
        setData((prev) =>
          prev
            ? {
                ...prev,
                customers: prev.customers.map((customer) => (customer.id === savedCustomer.id ? savedCustomer : customer))
              }
            : prev
        );
        setCustomerForm((prev) => (prev.id === savedCustomer.id ? customerToForm(savedCustomer) : prev));
      },
      { reload: false }
    );
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
      assertSafeSpreadsheetFile(file);
      const XLSX = await loadXlsxModule();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = file.name.toLowerCase().endsWith(".csv")
        ? XLSX.read(decodeCustomerImportCsv(arrayBuffer), { type: "string", raw: false })
        : XLSX.read(arrayBuffer, { type: "array" });
      assertSafeSpreadsheetWorkbook(XLSX, workbook);
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
          message: prev?.helperMessage ?? "준비 완료"
        },
        helperVersion: response.version,
        helperMessage: prev?.helperMessage ?? "준비 완료",
        jobs: prev?.jobs ?? [],
        certificates: prev?.certificates ?? [],
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
        defaultRenewalHelperDownloadUrl
      })
    );
    const electronicTaxCertificates = (certificates as RenewalAgentCertificate[]).filter(
      (certificate) => deriveCustomerCertificateKind(certificate) === "electronic_tax"
    );
    customerOnboardingCertificatesRef.current = electronicTaxCertificates;
    return electronicTaxCertificates;
  };
  const { resolveSingleElectronicTaxCertificate } = useElectronicTaxOnboarding({
    loadAvailableCertificates: loadCustomerOnboardingAvailableCertificates
  });

  const resolveCustomerOnboardingTemplateWorkbook = async (
    templateWorkbook: CustomerOnboardingTemplateWorkbookInput,
    onProgress?: (message: string) => void
  ): Promise<CustomerOnboardingResolutionResult> => {
    ensureLocalRenewalHelperActionAllowed("고객 초기 등록 준비");
    return await resolveElectronicTaxOnboardingTemplateWorkbook({
      templateWorkbook,
      loadAvailableCertificates: loadCustomerOnboardingAvailableCertificates,
      resolveSharedPassword: async () => customerOnboardingSharedPassword.trim(),
      certificatePasswordOverrides: customerOnboardingCertificatePasswordOverrides,
      requestPreflight: requestLocalRenewalPreflight,
      requestPreflightBatch: requestLocalRenewalPreflightBatch,
      preflightCache: customerOnboardingPreflightCacheRef.current,
      onProgress
    });
  };

  const downloadCustomerOnboardingImportTemplate = async () => {
    const [XLSX, certificates] = await Promise.all([
      loadXlsxModule(),
      loadCustomerOnboardingAvailableCertificates({ forceRefresh: true })
    ]);
    const activeCertificates = (certificates as RenewalAgentCertificate[]).filter(
      (certificate) =>
        deriveCustomerCertificateKind(certificate) === "electronic_tax" &&
        !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
    );
    if (activeCertificates.length === 0) {
      throw new Error("이 PC에서 전자세금용 공동인증서를 찾지 못했습니다.");
    }

    downloadCustomerOnboardingTemplate(XLSX, activeCertificates);
    setCustomerOnboardingFileName("");
    setCustomerOnboardingWorkbook(null);
    setCustomerOnboardingPreview(null);
    setCustomerOnboardingCertificatePasswordOverrides({});
    setCustomerOnboardingPreflightPasswordFailureEntries([]);
    setCustomerOnboardingAttemptedCertificateBusinessNumbers([]);
    setCustomerOnboardingJoinProgress(null);
    setCustomerOnboardingCertificateRegistrationProgress(null);
    customerOnboardingPreflightCacheRef.current.clear();
    setCustomerOnboardingSessionState({
      templateDownloaded: true,
      previewReady: false,
      commitDone: false,
      certificateDone: false,
      targetBusinessNumbers: []
    });
    setCustomerOnboardingNotice(
      buildElectronicTaxOnboardingTemplateNotice({
        certificateCount: activeCertificates.length
      })
    );
    setCustomerOnboardingError("");
  };

  const applyElectronicTaxOnboardingUploadFlowResult = (result: ElectronicTaxOnboardingUploadFlowResult) => {
    setCustomerOnboardingFileName(result.fileName);
    setCustomerOnboardingWorkbook(result.workbook);
    setCustomerOnboardingPreview(result.preview);
    setCustomerOnboardingPreflightPasswordFailureEntries(result.passwordFailureEntries);
    setCustomerOnboardingAttemptedCertificateBusinessNumbers([]);
    setCustomerOnboardingJoinProgress(null);
    setCustomerOnboardingCertificateRegistrationProgress(null);
    setCustomerOnboardingSessionState(result.sessionState);
    setCustomerOnboardingNotice(result.notice);
    setCustomerOnboardingError(result.error);
  };

  const handleCustomerOnboardingFileChange = async (file: File | null) => {
    if (!customerOnboardingSharedPassword.trim()) {
      setCustomerOnboardingError("공통 공동인증서 비밀번호를 입력한 뒤 양식을 업로드하세요.");
      return;
    }

    setCustomerOnboardingNotice("업로드 시작...");
    setCustomerOnboardingError("");
    const result = await runElectronicTaxOnboardingUploadFlow({
      file,
      previousSessionState: customerOnboardingSessionState,
      onProgress: (message) => {
        setCustomerOnboardingNotice(message);
      },
      parseWorkbook: async (selectedFile) => {
        assertSafeSpreadsheetFile(selectedFile);
        const XLSX = await loadXlsxModule();
        return await parseCustomerOnboardingWorkbook(XLSX, selectedFile);
      },
      resolveWorkbook: async (templateWorkbook) =>
        resolveCustomerOnboardingTemplateWorkbook(templateWorkbook, (message) => {
          setCustomerOnboardingNotice(message);
        }),
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
    setCustomerOnboardingAttemptedCertificateBusinessNumbers([]);
    setCustomerOnboardingJoinProgress(null);
    setCustomerOnboardingCertificateRegistrationProgress(null);
    setCustomerOnboardingSessionState((prev) => ({
      ...prev,
      commitDone: false,
      certificateDone: false
    }));
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
      kickRunner: async () => {
        await api("/api/customer-onboarding/follow-up/run", {
          method: "POST",
          body: JSON.stringify({ limit: 1 })
        });
      },
      onProgress: setCustomerOnboardingNotice
    });

    const targetBusinessNumbers =
      customerOnboardingSessionState.targetBusinessNumbers.length > 0
        ? customerOnboardingSessionState.targetBusinessNumbers
        : getOnboardingElectronicTaxBusinessNumbers(customerOnboardingWorkbook);
    const latestPayload = await load();
    const committedTargetBusinessNumbers = filterOnboardingTargetBusinessNumbersToExistingCustomers(
      latestPayload.customers,
      targetBusinessNumbers
    );
    const joinProgress = buildInitialRegistrationJoinProgress(latestPayload.customers, committedTargetBusinessNumbers);
    setCustomerOnboardingJoinProgress(joinProgress);
    const registrationDone = areOnboardingCustomersJoined(latestPayload.customers, committedTargetBusinessNumbers);
    const certificateDone =
      registrationDone &&
      getOnboardingPendingCertificateCustomers(
        customerOnboardingWorkbook,
        latestPayload.customers,
        committedTargetBusinessNumbers,
        {
          customerCertificates: latestPayload.customerCertificates,
          localCertificates: customerRenewalAssistantAllCertificates
        }
      ).length === 0;
    const pendingJoinCount = committedTargetBusinessNumbers.filter((businessNumber) => {
      const customer = latestPayload.customers.find((item) => digitsOnly(item.businessNumber) === digitsOnly(businessNumber));
      return !customer || customer.popbillState !== "joined";
    }).length;
    const onboardingCommitFollowupNotice = !registrationDone
      ? joinProgress
        ? `발행 연동 준비 중 ${joinProgress.completed}/${joinProgress.total}건`
        : `발행 연동 가입 대기 ${pendingJoinCount}건`
      : certificateDone
        ? "공동인증서까지 완료"
        : "다음 단계에서 공동인증서를 연결하세요";
    setCustomerOnboardingNotice(`${buildElectronicTaxOnboardingCommitNotice(result)}\n${onboardingCommitFollowupNotice}`);

    const failedMessages = result.failedRows.map((row) => `${row.rowIndex}행: ${row.message}`);
    const warningMessages = result.warnings.map((warning) => `${warning.rowIndex}행: ${warning.message}`);
    setCustomerOnboardingError([...failedMessages, ...warningMessages].join("\n"));

    setCustomerOnboardingPreview(null);
    setCustomerOnboardingSessionState((prev) => ({
      ...prev,
      templateDownloaded: true,
      previewReady: true,
      commitDone: registrationDone,
      certificateDone,
      targetBusinessNumbers: committedTargetBusinessNumbers
    }));
  };

  const selectQuickRegisterMessage = (messageId: number) => {
    const message = exceptionMessages.find((item) => item.id === messageId) ?? null;
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
      const { error: signOutError } = await signOutSafely();
      if (signOutError) {
        setError(signOutError.message);
      }
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

      if (!isStrongPassword(nextPassword)) {
        throw new Error(PASSWORD_POLICY_MESSAGE);
      }

      if (nextPassword !== confirmPassword) {
        throw new Error("새 비밀번호와 확인 값이 일치하지 않습니다.");
      }

      const { error: updateError } = await updateUserSafely({
        password: nextPassword
      });

      if (updateError) {
        throw updateError;
      }

      setRecoveryPasswordForm(createEmptyPasswordResetForm());
      setRecoveryMode(false);
      clearSupabaseAuthHash();
      const { error: signOutError } = await signOutSafely();
      setAuthNotice(
        signOutError
          ? "비밀번호를 변경했습니다. 로그아웃 응답이 지연되어 새로고침 후 다시 로그인하세요."
          : "비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요."
      );
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
    navigateToOpsSection("owner-security");
  };

  const cancelOwnerPasswordReset = () => {
    setOwnerPasswordResetTarget(null);
    setOwnerPasswordResetForm(createEmptyPasswordResetForm());
    navigateToOpsSection("workspaces");
  };

  const submitOwnerPasswordReset = async () => {
    if (!ownerPasswordResetTarget) {
      throw new Error("비밀번호를 재설정할 대상을 먼저 선택하세요.");
    }

    const nextPassword = ownerPasswordResetForm.nextPassword.trim();
    const confirmPassword = ownerPasswordResetForm.confirmPassword.trim();

    if (!isStrongPassword(nextPassword)) {
      throw new Error(PASSWORD_POLICY_MESSAGE);
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

  const updateWorkspaceSubscription = async (workspace: OpsWorkspaceSummary) => {
    const rawValue = workspaceLimitEdits[workspace.organizationId] ?? String(workspace.monthlyIssueLimit);
    const monthlyIssueLimit = Number(rawValue);
    const planCode = monthlyIssueLimit === 10 ? "free_trial" : "paid";

    if (!Number.isInteger(monthlyIssueLimit) || monthlyIssueLimit < 1) {
      throw new Error("월 발행 한도는 1 이상 숫자로 입력하세요.");
    }
    if (planCode === "paid" && (monthlyIssueLimit < 100 || monthlyIssueLimit % 100 !== 0)) {
      throw new Error("유료 구독 월 발행 한도는 100건 이상, 100건 단위로 입력하세요.");
    }

    const result = await api<OpsWorkspaceSubscriptionUpdateResponse>(
      `/api/ops/workspaces/${workspace.organizationId}/subscription`,
      {
        method: "PUT",
        body: JSON.stringify({ planCode, monthlyIssueLimit })
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
      [workspace.organizationId]: String(result.workspace.monthlyIssueLimit)
    }));
    await showAppAlert(
      `${result.workspace.organizationName} 작업공간의 구독 상태를 ${getOrganizationPlanLabel(result.workspace.organizationPlanCode)} / 월 ${result.workspace.monthlyIssueLimit}건으로 저장했습니다.`,
      {
        title: "구독 상태 저장",
        tone: "success"
      }
    );
  };

  const updateConsultationRequestStatus = async (
    request: PublicConsultationRequest,
    status: PublicConsultationRequestStatus
  ) => {
    const result = await api<{ request: PublicConsultationRequest }>(
      `/api/ops/consultation-requests/${request.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status })
      }
    );

    setOpsConsole((prev) =>
      prev
        ? {
            ...prev,
            consultationRequests: prev.consultationRequests.map((item) =>
              item.id === result.request.id ? result.request : item
            )
          }
        : prev
    );
  };

  const approveSignupRequest = async (request: PublicSignupRequest) => {
    const confirmed = await showAppConfirm(
      `${request.organizationName} 작업공간을 만들고 ${request.loginId} 계정을 owner로 승인합니다.`,
      {
        title: "회원가입 승인",
        tone: "success",
        confirmLabel: "승인"
      }
    );
    if (!confirmed) return;

    const result = await api<OpsSignupApproveResponse>(`/api/ops/signup-requests/${request.id}/approve`, {
      method: "POST"
    });

    setOpsConsole((prev) => {
      if (!prev) return prev;
      const nextWorkspaces = prev.workspaces.some((workspace) => workspace.organizationId === result.workspace.organizationId)
        ? prev.workspaces.map((workspace) =>
            workspace.organizationId === result.workspace.organizationId ? result.workspace : workspace
          )
        : [result.workspace, ...prev.workspaces];

      return {
        ...prev,
        signupRequests: prev.signupRequests.map((item) =>
          item.id === result.request.id ? result.request : item
        ),
        workspaces: nextWorkspaces
      };
    });

    await showAppAlert(
      `${result.workspace.organizationName} 작업공간을 개통했습니다.\nowner 로그인 ID: ${result.workspace.ownerLoginId ?? request.loginId}`,
      {
        title: "회원가입 승인 완료",
        tone: "success"
      }
    );
  };

  const rejectSignupRequest = async (request: PublicSignupRequest) => {
    const confirmed = await showAppConfirm(
      `${request.organizationName} / ${request.loginId} 회원가입 신청을 반려합니다. 반려 후 이 계정은 로그인할 수 없습니다.`,
      {
        title: "회원가입 반려",
        tone: "warn",
        confirmLabel: "반려"
      }
    );
    if (!confirmed) return;

    const result = await api<{ request: PublicSignupRequest }>(`/api/ops/signup-requests/${request.id}/reject`, {
      method: "POST",
      body: JSON.stringify({})
    });

    setOpsConsole((prev) =>
      prev
        ? {
            ...prev,
            signupRequests: prev.signupRequests.map((item) =>
              item.id === result.request.id ? result.request : item
            )
          }
        : prev
    );
  };

  const openOpsWorkspaceMailSettings = (workspace: OpsWorkspaceSummary) => {
    setOpsWorkspaceMailSettingsTarget({
      organizationId: workspace.organizationId,
      organizationName: workspace.organizationName
    });
    setOpsWorkspaceMailSettingsForm(baseOpsWorkspaceMailSettingsForm);
  };

  const cancelOpsWorkspaceMailSettings = () => {
    setOpsWorkspaceMailSettingsTarget(null);
    setOpsWorkspaceMailSettingsForm(baseOpsWorkspaceMailSettingsForm);
  };

  const submitOpsWorkspaceMailSettings = async () => {
    if (!opsWorkspaceMailSettingsTarget) {
      throw new Error("메일 설정을 저장할 작업공간을 먼저 선택하세요.");
    }

    const mailAddress = opsWorkspaceMailSettingsForm.mailAddress.trim();
    if (!mailAddress) {
      throw new Error("메일 주소를 입력하세요.");
    }

    const result = await api<{
      settings: AppSettings;
      mailTest: null | {
        imapOk: boolean;
        imapMessage?: string;
      };
    }>(`/api/ops/workspaces/${opsWorkspaceMailSettingsTarget.organizationId}/mail-settings`, {
      method: "PUT",
      body: JSON.stringify({
        mailAddress,
        mailPassword: opsWorkspaceMailSettingsForm.mailPassword,
        testConnection: opsWorkspaceMailSettingsForm.testConnection
      })
    });

    const mailTestSummary = result.mailTest
      ? `\n메일 읽기: ${result.mailTest.imapOk ? "성공" : "실패"}${result.mailTest.imapMessage ? ` · ${result.mailTest.imapMessage}` : ""}`
      : "\n연결 테스트는 실행하지 않았습니다.";

    await showAppAlert(
      `${opsWorkspaceMailSettingsTarget.organizationName} 작업공간의 메일 설정을 저장했습니다.${mailTestSummary}`,
      {
        title: "작업공간 메일 설정",
        tone: result.mailTest && !result.mailTest.imapOk ? "warn" : "success"
      }
    );
    cancelOpsWorkspaceMailSettings();
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

  const isExpiredPopbillCertificateRegistrationError = (error: unknown) => {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
    const normalized = message.replace(/\s+/g, "");
    return (
      normalized.includes("만료된토큰") ||
      normalized.includes("토큰이만료") ||
      normalized.includes("팝빌인증서등록URL이만료") ||
      normalized.includes("인증서등록URL이만료")
    );
  };

  const isCertificatePasswordRejectedRegistrationError = (error: unknown) => {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
    const normalized = message.replace(/\s+/g, "");
    return normalized.includes("공동인증서비밀번호가올바르지않습니다") || normalized.includes("비밀번호가올바르지");
  };

  const isTransientPopbillCertificateBrowserError = (error: unknown) => {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
    return /Target\.createTarget|Failed to open a new tab|Target page, context or browser has been closed|browser has been closed|page has been closed/i.test(message);
  };

  const waitForPopbillCertificateBrowserRecovery = async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  };

  const requestLocalPopbillCertificateRegistrationWithRetry = async (options: {
    customerId: number;
    certificateIndex: number;
    certificateCn?: string | null;
    certificateKind: "electronic_tax";
    serial?: string | null;
    userDN?: string | null;
    targetExpireDate?: string | null;
    certificatePassword: string;
  }) => {
    const runOnce = async () => {
      const certificateRegistrationUrl = await getCustomerCertificateRegistrationUrl(options.customerId);
      return await requestLocalPopbillCertificateRegistration({
        certificateRegistrationUrl,
        certificateIndex: options.certificateIndex,
        certificateCn: options.certificateCn,
        certificateKind: options.certificateKind,
        serial: options.serial,
        userDN: options.userDN,
        targetExpireDate: options.targetExpireDate,
        certificatePassword: options.certificatePassword
      });
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await runOnce();
      } catch (error) {
        const canRetry =
          attempt === 0 &&
          (isExpiredPopbillCertificateRegistrationError(error) ||
            isTransientPopbillCertificateBrowserError(error));
        if (!canRetry) {
          throw error;
        }
        await waitForPopbillCertificateBrowserRecovery();
      }
    }

    throw new Error("공동인증서 자동 등록에 실패했습니다.");
  };

  const verifyElectronicTaxCertificatePasswordByPreflight = async (
    certificate: RenewalAgentCertificate,
    certificatePassword: string
  ): Promise<boolean> => {
    const certificateIndex = Number(certificate.index);
    if (!Number.isFinite(certificateIndex) || certificateIndex <= 0 || !certificatePassword.trim()) {
      return false;
    }

    const response = await requestLocalRenewalPreflight({
      certificateIndex,
      certificateCn: certificate.cn || null,
      certificatePassword
    });
    const preflightProbe = response.result.bridge.preflightProbe;
    return Boolean(preflightProbe.ok || preflightProbe.renewInfoSnapshot);
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
        const refreshedCertificates = await syncCustomerRenewalCertificates({
          showAlert: false,
          skipReadinessCheck: true
        });
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
                `${createdCustomer.customerName}: ${getDisplayErrorMessage(error, "공동인증서 연결 실패")}`
              );
            }
            existingBusinessNumbers.add(digitsOnly(createdCustomer.businessNumber));
          } catch (error) {
            failedDetails.push(
              `${certificate.cn || `인증서 #${certificate.index}`}: ${getDisplayErrorMessage(error, "고객 생성 실패")}`
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
              `${createdCustomer.customerName}: ${createdCustomer.popbillState === "failed" ? "등록 처리 확인 필요" : "등록 처리 대기"}`
            );
            continue;
          }

          try {
            const registrationResponse = await requestLocalPopbillCertificateRegistrationWithRetry({
              customerId: createdCustomer.id,
              certificateIndex: Number(entry.certificate.index),
              certificateCn: entry.certificate.cn || createdCustomer.customerName,
              certificateKind: "electronic_tax",
              serial: entry.certificate.serial || null,
              userDN: entry.certificate.userDN || null,
              targetExpireDate: entry.certificate.todate || entry.certificate.detailValidateTo || null,
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
                `${createdCustomer.customerName}: ${getDisplayErrorMessage(error, "인증서 상태 반영 실패")}`
              );
            }
          } catch (error) {
            certificateRegistrationFailedDetails.push(
              `${createdCustomer.customerName}: ${getDisplayErrorMessage(error, "전자세금용 인증서 자동 등록 실패")}`
            );
          }
        }

        const summaryParts = [
          `전자세금용 공동인증서 ${certificates.length}건 처리`,
          `고객 생성 ${createdCount}건`,
          existingCount > 0 ? `기존 고객 ${existingCount}건` : null,
          missingDataCount > 0 ? `정보 부족 ${missingDataCount}건` : null,
          failedCount > 0 ? `실패 ${failedCount}건` : null,
          certificateRegistrationCompletedNames.length > 0 ? `전자세금용 인증서 자동 등록 ${certificateRegistrationCompletedNames.length}건` : null,
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
              `자동 새로고침 실패: ${getDisplayErrorMessage(error, "새로고침 실패")}`
            );
          }
        }

        alertMessage = `${batchSummary}${
          failedDetails.length > 0 ? `\n\n실패 내역\n${failedDetails.slice(0, 5).join("\n")}` : ""
        }${
          certificateRegistrationCompletedNames.length > 0
            ? `\n\n전자세금용 인증서 자동 등록 완료\n${certificateRegistrationCompletedNames.slice(0, 5).join("\n")}`
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
            ? `\n\n전자세금용 인증서 자동 등록 실패\n${certificateRegistrationFailedDetails.slice(0, 5).join("\n")}\n실패한 고객은 고객관리에서 인증서 등록을 다시 시도하면 됩니다.`
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
      contactName: "",
      contactDepartment: "",
      contactEmail: "",
      contactTel: "",
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
    if (customerRenewalAssistant?.agentOnline || customerRenewalAssistant?.upgradeState === "upgrade-required" || customerRenewalAssistant?.upgradeState === "upgrade-available") {
      ensureLocalRenewalHelperActionAllowed("갱신 준비");
    }
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
    if (customerRenewalAssistant?.agentOnline || customerRenewalAssistant?.upgradeState === "upgrade-required" || customerRenewalAssistant?.upgradeState === "upgrade-available") {
      ensureLocalRenewalHelperActionAllowed("결제 창 열기");
    }
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
    options?: { showAlert?: boolean; certificatePassword?: string }
  ) => {
    const { certificate, linkedCertificate } = await resolveLinkedCustomerCertificateForAction(certificateIndex);

    await prepareCustomerRenewal(linkedCertificate.customerId, {
      showAlert: options?.showAlert,
      certificatePassword: options?.certificatePassword,
      certificateOverride: certificate
    });
  };

  const openLinkedCustomerCertificatePayment = async (
    certificateIndex: string,
    options?: { showAlert?: boolean; certificatePassword?: string }
  ) => {
    const { certificate, linkedCertificate } = await resolveLinkedCustomerCertificateForAction(certificateIndex);

    await openCustomerRenewalPayment(linkedCertificate.customerId, {
      showAlert: options?.showAlert,
      certificatePassword: options?.certificatePassword,
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
    setCustomerIssueMonthQuery("");
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
      `${customer.customerName} 고객의 등록 처리 상태를 초기화합니다.\n외부 계정은 삭제되지 않고, 앱 상태만 pending/인증전으로 돌아갑니다.`,
      {
        title: "등록 처리 상태 초기화",
        tone: "warn",
        confirmLabel: "초기화"
      }
    );
    if (!confirmed) return;

    await api(`/api/customers/${customer.id}/popbill/reset`, {
      method: "POST"
    });
  };

  const deleteCustomers = async (customers: Customer[]) => {
    const uniqueCustomers = customers.filter(
      (customer, index, list) => list.findIndex((item) => item.id === customer.id) === index
    );
    if (uniqueCustomers.length === 0) {
      return [];
    }

    if (uniqueCustomers.length > 1) {
      const confirmed = await showAppConfirm(
        `선택한 고객 ${uniqueCustomers.length}명을 삭제합니다.\n발행 연동 완료 고객은 삭제 전에 연동 해지 처리가 먼저 진행됩니다.\n관련된 로컬 메일 매칭/발행초안도 같이 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`,
        {
          title: "고객 일괄 삭제",
          tone: "danger",
          confirmLabel: "선택 고객 삭제"
        }
      );
      if (!confirmed) return [];

      const deletedIds: number[] = [];
      const failedDetails: string[] = [];

      showAppProgress(`선택한 고객 ${uniqueCustomers.length}명을 삭제하는 중입니다.\n잠시만 기다려 주세요.`, {
        title: "고객 삭제 중",
        tone: "warn"
      });

      try {
        for (const customer of uniqueCustomers) {
          try {
            await api(`/api/customers/${customer.id}`, {
              method: "DELETE"
            });
            deletedIds.push(customer.id);
          } catch (error) {
            failedDetails.push(`${customer.customerName}: ${getDisplayErrorMessage(error, "삭제 실패")}`);
          }
        }
      } finally {
        closeAppProgress();
      }

      setCustomerForm((prev) =>
        prev.id !== null && deletedIds.includes(prev.id) ? createCustomerFormDefaults() : prev
      );

      const failedCount = failedDetails.length;
      const successCount = deletedIds.length;
      const detailText = failedCount > 0 ? `\n실패 내역\n${failedDetails.slice(0, 8).join("\n")}` : "";
      await showAppAlert(
        failedCount > 0
          ? `고객 일괄 삭제를 마쳤습니다.\n대상: ${uniqueCustomers.length}명\n삭제 완료: ${successCount}명\n삭제 실패: ${failedCount}명${detailText}`
          : `성공적으로 삭제되었습니다.\n삭제 완료: ${successCount}명\n확인을 누르면 고객 목록을 새로 불러옵니다.`,
        {
          title: failedCount > 0 ? "고객 일괄 삭제 완료" : "고객 삭제 완료",
          tone: failedCount > 0 ? "warn" : "success"
        }
      );
      return deletedIds;
    }

    const [customer] = uniqueCustomers;
    if (!customer) return [];
    const confirmed = await showAppConfirm(
      `${customer.customerName} 고객을 삭제합니다.\n관련된 로컬 메일 매칭/발행초안도 같이 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`,
      {
        title: "고객 삭제",
        tone: "danger",
        confirmLabel: "삭제하기"
      }
    );
    if (!confirmed) return [];

    showAppProgress(`${customer.customerName} 고객을 삭제하는 중입니다.\n잠시만 기다려 주세요.`, {
      title: "고객 삭제 중",
      tone: "warn"
    });

    try {
      await api(`/api/customers/${customer.id}`, {
        method: "DELETE"
      });
    } finally {
      closeAppProgress();
    }

    setCustomerForm((prev) => (prev.id === customer.id ? createCustomerFormDefaults() : prev));
    await showAppAlert("성공적으로 삭제되었습니다.\n확인을 누르면 고객 목록을 새로 불러옵니다.", {
      title: "고객 삭제 완료",
      tone: "success"
    });
    return [customer.id];
  };

  const quitPopbillMember = async (customer: Customer) => {
    const popbillEnvironmentLabel = data?.settings.popbillIsTest ? "테스트" : "운영";
    const confirmed = await showAppConfirm(
      `${customer.customerName} 고객을 ${popbillEnvironmentLabel} 등록 계정에서 해지합니다.\n이 작업은 ${popbillEnvironmentLabel} 환경의 외부 계정 자체를 제거합니다.\n계속할까요?`,
      {
        title: `${popbillEnvironmentLabel} 등록 계정 해지`,
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
      title: "발행 문서 정보"
    });
  };

  const updateDraftTaxInvoiceInfo = async (draftId: number, input: DraftTaxInvoiceInfoUpdateInput) => {
    try {
      setError("");
      setBusyKey(`draft-tax-info-${draftId}`);
      const updatedDraft = await api<InvoiceDraft>(`/api/drafts/${draftId}/tax-invoice-info`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              drafts: prev.drafts.map((draft) => (draft.id === draftId ? updatedDraft : draft))
            }
          : prev
      );
    } catch (updateError) {
      const message = getDisplayErrorMessage(updateError, "세금계산서 정보 저장에 실패했습니다.");
      setError(message);
      throw new Error(message);
    } finally {
      setBusyKey(null);
    }
  };

  const createManualDraft = async (input: ManualDraftCreateInput): Promise<InvoiceDraft> => {
    try {
      setError("");
      setBusyKey(`manual-draft-${input.customerId}`);
      const draft = await api<InvoiceDraft>("/api/drafts/manual", {
        method: "POST",
        body: JSON.stringify(input)
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              drafts: [draft, ...prev.drafts.filter((item) => item.id !== draft.id)]
            }
          : prev
      );
      return draft;
    } catch (createError) {
      const message = getDisplayErrorMessage(createError, "수동 발행 초안을 만들지 못했습니다.");
      setError(message);
      throw new Error(message);
    } finally {
      setBusyKey(null);
    }
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

  const issueSelectedDrafts = async (draftIds: number[]) => {
    const selectedDraftIds = new Set(draftIds);
    const targets =
      data?.drafts.filter((draft) => selectedDraftIds.has(draft.id) && (draft.status === "review" || draft.status === "failed")) ?? [];

    if (targets.length === 0) {
      await showAppAlert("선택한 항목 중 직접 발행할 검수 대기/실패 건이 없습니다.", {
        title: "선택 일괄 발행"
      });
      return;
    }

    const confirmed = await showAppConfirm(`선택한 검수 대기/실패 ${targets.length}건을 직접 발행합니다.\n계속할까요?`, {
      title: "선택 일괄 발행 확인",
      tone: "warn",
      confirmLabel: "선택 일괄 발행"
    });
    if (!confirmed) return;

    let issued = 0;
    let failed = 0;
    const failedDetails: string[] = [];

    for (const draft of targets) {
      try {
        await api(`/api/drafts/${draft.id}/issue`, { method: "POST" });
        issued += 1;
      } catch (error) {
        failed += 1;
        const message = getDisplayErrorMessage(error, "발행 실패");
        failedDetails.push(`${draft.customerName}: ${message}`);
      }
    }

    const detailLines = failedDetails.length > 0 ? `\n실패 상세:\n${failedDetails.slice(0, 5).join("\n")}` : "";
    await showAppAlert(`선택 일괄 발행 완료\n대상: ${targets.length}건\n성공: ${issued}건\n실패: ${failed}건${detailLines}`, {
      title: "선택 일괄 발행 완료",
      tone: failed > 0 ? "warn" : "success"
    });
  };

  const issueDraftWithConfirmation = async (draftId: number) => {
    const confirmed = await showAppConfirm(
      "발행하시겠습니까?\n발행 시 고객에게 발행 문자가 전송됩니다.",
      {
        title: "발행 확인",
        tone: "warn",
        confirmLabel: "발행하기"
      }
    );
    if (!confirmed) return;

    await api(`/api/drafts/${draftId}/issue`, { method: "POST" });
  };

  const refreshAllCertificateStatuses = async () => {
    const result = await api<{
      checked: number;
      updated: number;
      failed: number;
      expired: number;
      expiringSoon: number;
    }>("/api/popbill/cert-status/refresh-all", {
      method: "POST"
    });

    await showAppAlert(
      `인증서 일괄 점검 완료\n점검 대상: ${result.checked}건\n갱신 성공: ${result.updated}건\n조회 실패: ${result.failed}건\n만료: ${result.expired}건\n60일 미만 만료 예정: ${result.expiringSoon}건`,
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

  const unmatchDraftCustomer = async (draftId: number) => {
    const confirmed = await showAppConfirm(
      "이 초안의 고객 매칭을 해제하고 원본 메일을 다시 고객 미매칭 상태로 되돌립니다.\n잘못 선택한 고객을 다시 찾을 수 있습니다.\n계속할까요?",
      {
        title: "고객 매칭 해제",
        tone: "warn",
        confirmLabel: "매칭 해제"
      }
    );
    if (!confirmed) return;

    await api(`/api/drafts/${draftId}/unmatch`, {
      method: "POST"
    });
    await refreshIssuanceData({ includeCustomers: true });
  };

  const reprocessInboxMessage = async (messageId: number, customerId?: number) => {
    await api(`/api/inbox/${messageId}/reprocess`, {
      method: "POST",
      body: JSON.stringify(customerId ? { customerId } : {})
    });
    await refreshIssuanceData({ includeCustomers: Boolean(customerId) });
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

    await refreshIssuanceData();
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
                    placeholder={PASSWORD_POLICY_PLACEHOLDER}
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
        <Suspense fallback={<div className="loading-shell">화면을 불러오는 중입니다.</div>}>
          <PublicLanding
            signInAccount={signInAccount}
            setSignInAccount={setSignInAccount}
            signInPassword={signInPassword}
            setSignInPassword={setSignInPassword}
            authNotice={authNotice}
            error={error}
            authBusy={authBusy}
            onSignIn={signIn}
            onSignUp={signUp}
            onCheckLoginIdAvailability={checkSignupLoginIdAvailability}
            onSendSignupPhoneVerification={sendSignupPhoneVerification}
            onConfirmSignupPhoneVerification={confirmSignupPhoneVerification}
            onSendSignupEmailVerification={sendSignupEmailVerification}
            onConfirmSignupEmailVerification={confirmSignupEmailVerification}
            onFindLoginId={findLoginId}
            onPasswordReset={requestPasswordReset}
          />
        </Suspense>
        {appDialog ? <AppDialog dialog={appDialog} onConfirm={() => closeAppDialog(true)} onCancel={() => closeAppDialog(false)} /> : null}
      </>
    );
  }

  if (!data || !settingsForm) {
    return (
      <div className="loading-shell">
        {error ? (
          <div className="loading-shell-stack">
            <strong>초기 데이터를 불러오지 못했습니다.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void signOut()}>
              로그인 화면으로 돌아가기
            </button>
          </div>
        ) : (
          "AUTO-TAX 초기 데이터를 불러오는 중입니다."
        )}
      </div>
    );
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
  let failedDraftCount = 0;
  let reviewReadyDraftCount = 0;
  let issuancePendingDraftCount = 0;
  let issuanceIssuedDraftCount = 0;
  for (const draft of data.drafts) {
    if (draft.status === "review" || draft.status === "failed" || draft.status === "issuing") {
      reviewDrafts.push(draft);
    }
    if (draft.status === "review" || draft.status === "failed") {
      issuancePendingDraftCount += 1;
    } else if (draft.status === "issued") {
      issuanceIssuedDraftCount += 1;
    }
    if (draft.status === "failed") {
      failedDraftCount += 1;
    }
    if (draft.status === "review") {
      reviewReadyDraftCount += 1;
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
    } else if (days !== null && days >= 0 && days < 60) {
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
  const customerListFilterContext = buildCustomerListFilterContext({
    currentBillingMonth: getCurrentSeoulBillingMonth(),
    issuedDraftsByCustomerId,
    expiredCertCustomers,
    expiringSoonCustomers,
    contractRenewalDueItems: customerContractRenewalsDue
  });
  const exceptionMessages = [...data.inbox]
    .filter((message) => isInboxActionable(message))
    .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());
  const unmatchedInboxMessages = [...data.inbox]
    .filter((message) => getInboxDisplayParseStatus(message) === "unmatched")
    .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());
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
    .slice(0, HOME_MOCK_RECENT_INBOX_TARGET_COUNT);
  const recentIssuedDrafts = [...issuedDrafts]
    .sort((left, right) => {
      const rightTimestamp = new Date(right.issuedAt ?? right.updatedAt ?? right.createdAt).getTime();
      const leftTimestamp = new Date(left.issuedAt ?? left.updatedAt ?? left.createdAt).getTime();
      return (Number.isFinite(rightTimestamp) ? rightTimestamp : 0) - (Number.isFinite(leftTimestamp) ? leftTimestamp : 0);
    })
    .slice(0, HOME_MOCK_RECENT_ISSUED_TARGET_COUNT);
  const currentHomeBillingMonth = getCurrentSeoulBillingMonth();
  const currentMonthIssuedDraftCount = issuedDrafts.filter((draft) => draft.billingMonth === currentHomeBillingMonth).length;
  const homeMonthlyIssueLimit = currentMembership?.monthlyIssueLimit ?? 0;
  const homeReviewDrafts = reviewDrafts.slice(0, HOME_MOCK_REVIEW_TARGET_COUNT);
  const homeRecentInboxMessages = recentInboxMessages;
  const homeRecentIssuedDrafts = recentIssuedDrafts;
  const filteredCustomers = data.customers
    .filter((customer) => matchesCustomerListFilter(customer, customerListFilter, customerListFilterContext))
    .filter((customer) => {
      const customerIssueMonths = (issuedDraftsByCustomerId.get(customer.id) ?? []).map((draft) => draft.billingMonth);
      return (
        matchesCustomerSearchQuery(customer, deferredCustomerSearchQuery, deferredCustomerSearchField, customerIssueMonths) &&
        matchesCustomerSearchQuery(customer, deferredCustomerIssueMonthQuery, "issueMonth", customerIssueMonths)
      );
    })
    .sort(compareCustomersForList);
  const customerImportHeaderCandidates = customerImportFile
    ? customerImportFile.rows.slice(0, Math.min(customerImportFile.rows.length, 5)).map((row, index) => ({
        index,
        preview: row.slice(0, 4).join(" | ") || `빈 행 ${index + 1}`
      }))
    : [];
  const selectedQuickRegisterMessage = quickRegisterForm.messageId
    ? exceptionMessages.find((message) => message.id === quickRegisterForm.messageId) ?? null
    : null;
  const pendingOnboardingCertificateRegistrationTargets = customerOnboardingSessionActive
    ? getOnboardingCertificateRegistrationTargets(
        customerOnboardingWorkbook,
        data.customers,
        customerOnboardingSessionState.targetBusinessNumbers,
        {
          customerCertificates: data.customerCertificates,
          localCertificates: customerRenewalAssistantAllCertificates
        }
      )
    : data.customers.filter(
        (customer) => customer.popbillState === "joined" && !customer.popbillCertRegistered
      );
  const onboardingCertificatePasswordOverrideEntries: OnboardingCertificatePasswordOverrideEntry[] =
    !customerOnboardingSessionState.commitDone
      ? customerOnboardingPreflightPasswordFailureEntries.map((entry) => ({
          businessNumber: entry.key,
          customerName: entry.label,
          corpName: "사전조회 비밀번호 오류",
          value: customerOnboardingCertificatePasswordOverrides[entry.key] ?? ""
        }))
      : [];
  const hasRegisteredCustomers = data.customers.length > 0;
  const sessionTargetCustomersRegistered = areOnboardingCustomersRegistered(
    data.customers,
    customerOnboardingTargetBusinessNumbers
  );
  const sessionTargetCustomersJoined = areOnboardingCustomersJoined(
    data.customers,
    customerOnboardingTargetBusinessNumbers
  );
  const onboardingCertificateFollowUpActive =
    customerOnboardingSessionActive || (hasRegisteredCustomers && popbillPendingCustomers.length > 0);
  const onboardingCustomerDatabaseReady = customerOnboardingSessionActive
    ? sessionTargetCustomersRegistered
    : hasRegisteredCustomers;
  const onboardingCustomerRegistrationReady = customerOnboardingSessionActive
    ? sessionTargetCustomersJoined
    : hasRegisteredCustomers;
  const onboardingPendingCertificateCustomers = customerOnboardingSessionActive
    ? getOnboardingPendingCertificateCustomers(
        customerOnboardingWorkbook,
        data.customers,
        customerOnboardingSessionState.targetBusinessNumbers,
        {
          customerCertificates: data.customerCertificates,
          localCertificates: customerRenewalAssistantAllCertificates
        }
      )
    : popbillPendingCustomers;
  const pendingOnboardingPopbillJoinCustomers = onboardingPendingCertificateCustomers.filter(
    (customer) => customer.popbillState === "pending"
  );
  const failedOnboardingPopbillJoinCustomers = onboardingPendingCertificateCustomers.filter(
    (customer) => customer.popbillState === "failed"
  );
  const attemptedOnboardingCertificateBusinessNumberSet = new Set(
    customerOnboardingAttemptedCertificateBusinessNumbers
  );
  const onboardingCertificateRetryCount = pendingOnboardingCertificateRegistrationTargets.filter((customer) =>
    attemptedOnboardingCertificateBusinessNumberSet.has(digitsOnly(customer.businessNumber))
  ).length;
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
  const opsAgent = opsConsole?.renewalAutomation.agent ?? null;
  const opsJobs = opsConsole?.renewalAutomation.jobs ?? [];
  const opsLogs = opsConsole?.logs ?? [];
  const opsWorkspaces = opsConsole?.workspaces ?? [];
  const opsSignupRequests = opsConsole?.signupRequests ?? [];
  const opsConsultationRequests = opsConsole?.consultationRequests ?? [];
  const opsConsultationStatusCounts = opsConsultationRequests.reduce<Record<ConsultationStatusFilter, number>>(
    (counts, request) => {
      counts.all += 1;
      counts[request.status] += 1;
      return counts;
    },
    {
      all: 0,
      new: 0,
      contacted: 0,
      workspace_opened: 0,
      closed: 0
    }
  );
  const filteredOpsConsultationRequests =
    consultationStatusFilter === "all"
      ? opsConsultationRequests
      : opsConsultationRequests.filter((request) => request.status === consultationStatusFilter);
  const pendingSignupRequestCount = opsSignupRequests.filter((request) => request.status === "pending").length;
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
  const isSavingCustomer =
    busyKey === "save-customer" ||
    busyKey === "save-customer-top" ||
    (customerForm.id !== null && busyKey === `save-customer-${customerForm.id}`);
  const isQuickRegistering = busyKey === "quick-register-unmatched";
  const partnerTaxInvoiceUnitCost = opsConsole?.partnerPoints.taxInvoiceUnitCost ?? null;
  const opsPartnerIsTest = opsConsole?.partnerPoints.isTest ?? false;
  const workspacePopbillIsTest = currentWorkspaceSettings?.popbillIsTest ?? data.settings.popbillIsTest;
  const workspacePopbillModeLabel = workspacePopbillIsTest ? "테스트 발행" : "운영 발행";
  const opsPartnerModeLabel = opsPartnerIsTest ? "테스트 모드" : "운영 모드";
  const opsPartnerModeDescription = opsPartnerIsTest
    ? "현재 테스트 발행 환경으로 연결되어 있습니다. 실제 고객 운영 전에는 운영 모드 전환 여부를 다시 확인하세요."
    : "현재 운영 발행 환경으로 연결되어 있습니다. 실제 발행과 파트너 포인트가 운영 기준으로 반영됩니다.";
  const totalWorkspaceIssuedDraftCount = opsWorkspaces.reduce((sum, workspace) => sum + workspace.issuedDraftCount, 0);
  const totalWorkspaceCurrentMonthIssuedDraftCount = opsWorkspaces.reduce(
    (sum, workspace) => sum + workspace.currentMonthIssuedDraftCount,
    0
  );
  const totalWorkspaceEstimatedPointUsage =
    partnerTaxInvoiceUnitCost === null ? null : totalWorkspaceIssuedDraftCount * partnerTaxInvoiceUnitCost;
  const totalWorkspaceCurrentMonthEstimatedPointUsage =
    partnerTaxInvoiceUnitCost === null ? null : totalWorkspaceCurrentMonthIssuedDraftCount * partnerTaxInvoiceUnitCost;
  const opsSubscriptionMetrics = buildOpsSubscriptionMetrics(opsWorkspaces);
  const opsMenuItems: Array<{ section: OpsSectionId; label: string }> = [
    { section: "subscription", label: "구독/매출" },
    { section: "signup-requests", label: `가입 승인${pendingSignupRequestCount > 0 ? ` ${pendingSignupRequestCount}` : ""}` },
    { section: "consultation", label: "상담 신청" },
    { section: "workspaces", label: "작업공간 관리" },
    { section: "owner-security", label: "owner 비밀번호 재설정" },
    { section: "agent-status", label: "renewal agent 상태" },
    { section: "logs", label: "운영 로그" },
    { section: "account-security", label: "내 계정 보안" }
  ];
  const opsAgentStatusMeta = opsAgent ? getRenewalAgentStatusMeta(opsAgent) : null;
  const opsCertificates = opsAgent?.bridge.storageProbe.certificates ?? [];
  const issueSetupPendingCount = popbillPendingCustomers.length;
  const onboardingIssueSetupPendingCount = onboardingPendingCertificateCustomers.length;
  const onboardingCertificateReady = onboardingCustomerRegistrationReady && (
    customerOnboardingSessionActive
      ? customerOnboardingSessionState.certificateDone || onboardingIssueSetupPendingCount === 0
      : onboardingIssueSetupPendingCount === 0
  );
  const settingsActionBar = settingsDerivedModel.actionBar;
  const settingsOnboardingModel = settingsDerivedModel.onboarding;
  const onboardingFirstSyncReady = data.inbox.length > 0 || data.drafts.length > 0;
  const openSettingsSection = (section: SettingsSectionId = settingsActionBar.primarySection) => {
    setActiveSettingsSection(section);
    setActiveTab("settings");
  };
  const openCertificates = () => {
    setActiveTab("customers");
    setCustomerListFilter("certificate-expiration");
  };
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

    const selectedCertificate = matches.find((certificate) => certificate.isPrimary) ?? matches[0] ?? null;
    if (!selectedCertificate) {
      return null;
    }

    const certificateOverrideKeys = [
      businessNumber,
      selectedCertificate.certificateIndex?.trim() ? `index:${selectedCertificate.certificateIndex.trim()}` : "",
      selectedCertificate.certificateName.trim()
        ? `name:${normalizeRenewalCertificateKey(selectedCertificate.certificateName)}`
        : ""
    ].filter(Boolean);
    const overridePassword =
      certificateOverrideKeys
        .map((key) => customerOnboardingCertificatePasswordOverrides[key]?.trim() ?? "")
        .find(Boolean) ?? "";
    return overridePassword
      ? {
          ...selectedCertificate,
          certificatePassword: overridePassword
        }
      : selectedCertificate;
  };

  const updateCustomerOnboardingCertificatePasswordOverride = (businessNumber: string, value: string) => {
    const overrideKey = String(businessNumber ?? "").includes(":")
      ? String(businessNumber ?? "").trim()
      : String(businessNumber ?? "").replace(/\D/g, "");
    if (!overrideKey) {
      return;
    }

    setCustomerOnboardingCertificatePasswordOverrides((prev) => {
      const next = { ...prev };
      const trimmedValue = value.trim();
      if (trimmedValue) {
        next[overrideKey] = value;
      } else {
        delete next[overrideKey];
      }
      return next;
    });
  };

  const registerCustomerElectronicTaxCertificateAutomatically = async (
    customer: Customer,
    options?: {
      onboardingCertificateRow?: CustomerOnboardingWorkbookInput["certificates"][number] | null;
      reloadAfter?: boolean;
    }
  ) => {
    ensureLocalRenewalHelperActionAllowed("전자세금용 인증서 등록");
    if (customer.popbillState !== "joined") {
      throw new Error(`${customer.customerName} 고객은 발행 연동 준비가 완료되지 않아 전자세금용 인증서 등록을 진행할 수 없습니다.`);
    }
    const businessNumber = digitsOnly(customer.businessNumber);
    if (customerOnboardingAttemptedCertificateBusinessNumbers.includes(businessNumber)) {
      try {
        const refreshed = await refreshSingleCustomerCertificateStatus(customer.id);
        if (refreshed.popbillCertRegistered) {
          return {
            outcome: "already-registered" as const,
            refreshErrorMessage: ""
          };
        }
      } catch {
        // If the status API says no certificate is registered yet, continue with browser-based registration.
      }
    }
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
    let registrationResponse: Awaited<ReturnType<typeof requestLocalPopbillCertificateRegistrationWithRetry>>;
    try {
      registrationResponse = await requestLocalPopbillCertificateRegistrationWithRetry({
        customerId: customer.id,
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
        targetExpireDate:
          selectedLocalCertificate?.todate ||
          selectedLocalCertificate?.detailValidateTo ||
          onboardingCertificateRow?.expireDate ||
          linkedCertificate?.expireDate ||
          null,
        certificatePassword: effectivePassword
      });
    } catch (error) {
      if (isCertificatePasswordRejectedRegistrationError(error)) {
        const passwordStillValid = await verifyElectronicTaxCertificatePasswordByPreflight(
          selectedLocalCertificate,
          effectivePassword
        ).catch(() => false);
        if (passwordStillValid) {
          throw new Error(
            `${customer.customerName} 고객은 사전조회에서 비밀번호가 확인됐지만 등록 화면에서 같은 인증서를 확정하지 못했습니다. AT 헬퍼에서 공동인증서를 다시 읽고 재시도하세요.`
          );
        }
      }
      throw error;
    }
    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status: {
          online: true,
          version: registrationResponse.version,
          message: sanitizeSupplierDisplayText(registrationResponse.result.message)
        },
        helperVersion: registrationResponse.version,
        helperMessage: sanitizeSupplierDisplayText(registrationResponse.result.message),
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
      refreshErrorMessage = getDisplayErrorMessage(error, "인증서 상태를 다시 확인하지 못했습니다.");
    }

    if (options?.reloadAfter !== false) {
      try {
        await load();
      } catch (error) {
        const reloadErrorMessage = getDisplayErrorMessage(error, "화면 새로고침에 실패했습니다.");
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

  const buildCustomerCertificateOnestopDraftFromSnapshot = (
    certificate: RenewalAgentCertificate,
    snapshot: RenewalInfoSnapshot | null
  ): CustomerCertificateOnestopDraft => {
    if (!snapshot) {
      return buildCustomerCertificateOnestopDraftFromCertificate(certificate);
    }

    const draft = buildCustomerDraftFromRenewalSnapshot(certificate, snapshot);
    return {
      customerName: draft.customerName,
      businessNumber: draft.businessNumber,
      corpName: draft.corpName,
      addr: draft.addr,
      bizType: draft.bizType,
      bizClass: draft.bizClass,
      renewalContactMobile: draft.renewalContactMobile,
      issueCompleteSmsTemplate: draft.issueCompleteSmsTemplate,
      memo: draft.memo
    };
  };

  const loadCustomerAddElectronicTaxCertificates = async () =>
    await loadCustomerOnboardingAvailableCertificates({ forceRefresh: true });

  const uploadCustomerAddCertificateFiles = async (files: File[]) => {
    ensureLocalRenewalHelperActionAllowed("전자세금용 공동인증서 업로드");
    const response = await requestLocalCertificateUploadSession(files);
    setCustomerRenewalAssistant((prev) =>
      buildCustomerRenewalAssistant({
        current: prev,
        status: {
          online: true,
          version: response.version,
          message:
            response.result.certificates.length > 0
              ? `업로드 인증서 ${response.result.certificates.length}건을 읽었습니다.`
              : "업로드한 파일에서 전자세금용 공동인증서를 찾지 못했습니다."
        },
        helperVersion: response.version,
        helperMessage:
          response.result.certificates.length > 0
            ? `업로드 인증서 ${response.result.certificates.length}건을 읽었습니다.`
            : "업로드한 파일에서 전자세금용 공동인증서를 찾지 못했습니다.",
        jobs: prev?.jobs ?? [],
        certificates: prev?.certificates ?? [],
        releaseMetadata: getCustomerRenewalAssistantReleaseMetadata(prev),
        defaultRenewalHelperDownloadUrl
      })
    );
    return response.result;
  };

  const previewCustomerCertificateOnestop = async (
    certificate: RenewalAgentCertificate,
    certificatePassword: string
  ): Promise<{
    draft: CustomerCertificateOnestopDraft;
    message: string;
  }> => {
    ensureLocalRenewalHelperActionAllowed("전자세금용 공동인증서 정보 확인");
    const certificateIndex = Number(certificate.index);
    const canRunPreflight =
      Number.isInteger(certificateIndex) &&
      certificateIndex > 0 &&
      certificate.supportsPreflight !== false;

    if (!canRunPreflight) {
      return {
        draft: buildCustomerCertificateOnestopDraftFromSnapshot(certificate, null),
        message: "파일 기반 인증서는 고객 기본값 자동 조회를 건너뜁니다. 확인 화면에서 사업자 정보를 입력하세요."
      };
    }

    if (!certificatePassword.trim()) {
      throw new Error("공동인증서 비밀번호를 입력하세요.");
    }

    const response = await requestLocalRenewalPreflight({
      certificateIndex,
      certificateCn: certificate.cn || null,
      certificatePassword
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
      throw new Error(preflightJob.error);
    }

    const snapshot = response.result.bridge.preflightProbe.renewInfoSnapshot;
    return {
      draft: buildCustomerCertificateOnestopDraftFromSnapshot(certificate, snapshot),
      message: snapshot
        ? "공동인증서에서 사업자 정보를 읽었습니다. 저장 전 확인하세요."
        : "공동인증서 메타데이터만 확인했습니다. 사업자 정보를 직접 입력하세요."
    };
  };

  const executeCustomerCertificateOnestop = async (input: {
    certificate: RenewalAgentCertificate;
    draft: CustomerCertificateOnestopDraft;
    certificatePassword: string;
  }): Promise<CustomerCertificateOnestopResult> => {
    ensureLocalRenewalHelperActionAllowed("고객 원스톱 등록");
    const result = await runCustomerCertificateOnestopRegistration({
      customers: data?.customers ?? [],
      draft: input.draft,
      certificate: input.certificate,
      certificatePassword: input.certificatePassword,
      createCustomer: async (payload) => {
        const savedCustomer = await api<CustomerSaveResponse>("/api/customers", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        return {
          customer: savedCustomer,
          autoJoinStatus: savedCustomer.autoJoinStatus,
          autoJoinError: savedCustomer.autoJoinError ?? null
        };
      },
      joinPopbill: async (customerId) => {
        const response = await api<{
          ok: true;
          status: string;
          customer: CustomerSaveResponse;
        }>(`/api/customers/${customerId}/popbill/join`, { method: "POST" });
        return response.customer;
      },
      linkCertificate: async (customerId, certificate, options) =>
        await linkCustomerCertificate(customerId, certificate, { linkSource: options?.linkSource ?? "auto" }),
      loadAvailableCertificates: loadCustomerAddElectronicTaxCertificates,
      registerCertificate: async (customer, certificate, certificatePassword) => {
        const registrationResponse = await requestLocalPopbillCertificateRegistrationWithRetry({
          customerId: customer.id,
          certificateIndex: Number(certificate.index),
          certificateCn: certificate.cn || customer.corpName || customer.customerName,
          certificateKind: "electronic_tax",
          serial: certificate.serial || null,
          userDN: certificate.userDN || null,
          targetExpireDate: certificate.todate || certificate.detailValidateTo || null,
          certificatePassword
        });
        return {
          outcome: registrationResponse.result.outcome
        };
      },
      refreshCertificateStatus: async (customerId) =>
        await api<CustomerSaveResponse>(`/api/customers/${customerId}/popbill/cert-status`, { method: "POST" })
    });

    const latestPayload = await load();
    const latestCustomer = latestPayload.customers.find((customer) => customer.id === result.customer.id) ?? result.customer;
    setCustomerDetailTab("info");
    setCustomerForm(customerToForm(latestCustomer));
    setCustomerAddressResolveMessage("");
    customerAddressLookupRef.current = "";
    return {
      ...result,
      customer: latestCustomer
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
      throw new Error("전자세금용 인증서 등록이 필요한 고객이 없습니다.");
    }
    setCustomerOnboardingCertificateRegistrationProgress(null);
    const skippedBeforeJoinCount = onboardingPendingCertificateCustomers.filter(
      (customer) => customer.popbillState !== "joined"
    ).length;

    setCustomerOnboardingAttemptedCertificateBusinessNumbers((prev) =>
      Array.from(
        new Set([
          ...prev,
          ...pendingCustomers
            .map((customer) => digitsOnly(customer.businessNumber))
            .filter((businessNumber): businessNumber is string => Boolean(businessNumber))
        ])
      )
    );

    const { completedNames, alreadyRegisteredNames, failedDetails, refreshWarnings } =
      await processElectronicTaxOnboardingCertificateRegistrations({
        pendingCustomers,
        getOnboardingCertificateRow: getOnboardingElectronicTaxCertificateRow,
        registerCustomer: registerCustomerElectronicTaxCertificateAutomatically,
        reloadAll: async () => {
          await load();
        },
        onProgress: setCustomerOnboardingCertificateRegistrationProgress
      });

    setCustomerOnboardingCertificateRegistrationProgress({
      total: pendingCustomers.length,
      current: pendingCustomers.length,
      completed: completedNames.length,
      alreadyRegistered: alreadyRegisteredNames.length,
      failed: failedDetails.length,
      currentCustomerName: "",
      status: failedDetails.length > 0 ? "failed" : "success"
    });

    setCustomerOnboardingNotice(
      buildElectronicTaxRegistrationFollowupNotice({
        completedNames,
        alreadyRegisteredNames,
        failedDetails,
        refreshWarnings,
        skippedBeforeJoinCount
      })
    );

    const latestPayload = await load();
    syncCustomerOnboardingCertificateDone(latestPayload);
  };
  const refreshSingleCustomerCertificateStatus = async (customerId: number) =>
    await api<CustomerSaveResponse>(`/api/customers/${customerId}/popbill/cert-status`, { method: "POST" });
  const canRunOnboardingFirstSync =
    settingsHealth.mailReady &&
    helperOnboardingReady &&
    onboardingCertificateReady;
  const onboardingImportableCount =
    (customerOnboardingPreview?.createCount ?? 0) + (customerOnboardingPreview?.updateCount ?? 0);
  const onboardingBlockedCount = customerOnboardingPreview?.rows.filter((row) => row.status === "blocked").length ?? 0;
  const onboardingCustomerRegistrationSubmitted =
    customerOnboardingSessionActive &&
    onboardingCustomerDatabaseReady &&
    customerOnboardingSessionState.previewReady;
  const onboardingRegistrationFlow = getInitialRegistrationFlowState({
    helperReady,
    helperCertificateCount: customerRenewalAssistantElectronicTaxCertificateCount,
    registrationReady: onboardingCustomerRegistrationReady,
    certificateReady: onboardingCertificateReady,
    certificateAutoTargetCount: pendingOnboardingCertificateRegistrationTargets.length,
    certificatePendingJoinCount: pendingOnboardingPopbillJoinCustomers.length,
    certificateFailedJoinCount: failedOnboardingPopbillJoinCustomers.length,
    certificateRetryCount: onboardingCertificateRetryCount,
    certificateRegistrationRunning: busyKey === "customer-onboarding-cert-registration",
    templateDownloaded: customerOnboardingSessionState.templateDownloaded,
    previewReady: customerOnboardingSessionState.previewReady,
    commitDone: onboardingCustomerRegistrationSubmitted,
    importableCount: onboardingImportableCount,
    blockedCount: onboardingBlockedCount,
    hasSelectedFile: Boolean(customerOnboardingFileName)
  });
  const onboardingRegistrationStage = onboardingRegistrationFlow.stage;
  const onboardingRegistrationPrimaryActionLabel = onboardingRegistrationFlow.primaryActionLabel;
  const onboardingRegistrationBlockedReason = onboardingRegistrationFlow.blockedReason;
  const onboardingFirstSyncBlockedSteps = settingsOnboardingModel.firstSyncBlockedSteps;
  const onboardingHelperContent = settingsOnboardingContent.helperContent;
  const onboardingCertificateAutoTargetCount = pendingOnboardingCertificateRegistrationTargets.length;
  const onboardingPendingPopbillJoinCount = pendingOnboardingPopbillJoinCustomers.length;
  const onboardingFailedPopbillJoinCount = failedOnboardingPopbillJoinCustomers.length;
  const onboardingCertificatePrimaryActionLabel = !onboardingCustomerRegistrationReady
    ? "고객 등록 후 가능"
    : onboardingCertificateAutoTargetCount > 0
      ? onboardingCertificateRetryCount > 0 && busyKey !== "customer-onboarding-cert-registration"
        ? "공동인증서 다시 확인"
        : "공동인증서 반영"
      : onboardingPendingPopbillJoinCount > 0
        ? "고객 반영 확인 중"
        : onboardingFailedPopbillJoinCount > 0
          ? "고객 반영 확인 필요"
          : onboardingCertificateReady
            ? "공동인증서 반영 완료"
            : "반영 대상 없음";
  const onboardingCertificateActionDisabled =
    busyKey !== null ||
    !onboardingCustomerRegistrationReady ||
    onboardingPendingPopbillJoinCount > 0 ||
    onboardingFailedPopbillJoinCount > 0 ||
    onboardingCertificateAutoTargetCount === 0;
  const onboardingCertificateActionTitle = !onboardingCustomerRegistrationReady
    ? "먼저 고객 초기 등록을 끝내세요."
    : onboardingPendingPopbillJoinCount > 0
      ? "고객 반영 상태를 확인하는 중입니다."
      : onboardingFailedPopbillJoinCount > 0
        ? "고객 반영 확인이 끝난 뒤 다시 실행하세요."
        : onboardingCertificateAutoTargetCount === 0
          ? "연결할 공동인증서가 없습니다."
          : undefined;
  const proceedOnboardingCertificateFollowUpAction = () => {
    if (onboardingCertificateAutoTargetCount > 0) {
      void runAction(
        "customer-onboarding-cert-registration",
        proceedOnboardingCertificateRegistration,
        { reload: false }
      );
      return;
    }

    if (onboardingCertificateReady) {
      setRequestedOnboardingStepId("first-sync");
    }
  };
  const openUnmatchedIssuanceMessages = () => {
    setRequestedIssuanceFilter("unmatched");
    setActiveTab("issuance");
  };
  const runOnboardingFirstSync = async () => {
    if (!activeOrganizationId) {
      const message = "작업공간을 확인할 수 없어 첫 메일 동기화를 실행하지 못했습니다.";
      setError(message);
      setOnboardingFirstSyncResult(null);
      return;
    }

    try {
      setError("");
      setBusyKey("sync");
      setOnboardingFirstSyncResult(null);
      await api("/api/mail/sync", { method: "POST" });

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

      const actionableCount = inbox.filter(isInboxActionable).length;
      const resultSummary =
        inbox.length === 0 && drafts.length === 0
          ? "첫 메일 동기화가 완료됐습니다. 새로 수신된 메일이나 생성된 초안은 없습니다."
          : `첫 메일 동기화가 완료됐습니다. 수신 메일 ${inbox.length}건, 초안 ${drafts.length}건, 확인 필요 ${actionableCount}건입니다.`;
      setOnboardingFirstSyncResult({ organizationId: activeOrganizationId, status: "success", message: resultSummary });
      await loadIssuedMonthlyTrend(issuedMonthlyTrend?.anchorBillingYear);
    } catch (syncError) {
      const message = getDisplayErrorMessage(syncError, "첫 메일 동기화에 실패했습니다.");
      setError(message);
      setOnboardingFirstSyncResult({ organizationId: activeOrganizationId, status: "danger", message });
    } finally {
      setBusyKey(null);
    }
  };
  const topnavTaskNotifications: TopnavTaskNotification[] = [
    ...(failedDraftCount > 0
      ? [
          {
            key: "failed-drafts",
            title: `발행 실패 ${failedDraftCount}건`,
            description: "실패한 세금계산서를 확인하고 재처리하세요.",
            count: failedDraftCount,
            tone: "danger" as const,
            actionLabel: "발행 화면으로 이동",
            onAction: () => {
              setTaskNotificationOpen(false);
              setActiveTab("issuance");
            }
          }
        ]
      : []),
    ...(unmatchedInboxMessages.length > 0
      ? [
          {
            key: "unmatched-mails",
            title: `고객 미매칭 ${unmatchedInboxMessages.length}건`,
            description: "한전 메일과 고객을 연결해야 합니다.",
            count: unmatchedInboxMessages.length,
            tone: "warn" as const,
            actionLabel: "미매칭 확인",
            onAction: () => {
              setTaskNotificationOpen(false);
              openUnmatchedIssuanceMessages();
            }
          }
        ]
      : []),
    ...(reviewReadyDraftCount > 0
      ? [
          {
            key: "review-drafts",
            title: `발행 전 확인 ${reviewReadyDraftCount}건`,
            description: "발행 전 초안 내용을 검토하세요.",
            count: reviewReadyDraftCount,
            tone: "info" as const,
            actionLabel: "초안 확인",
            onAction: () => {
              setTaskNotificationOpen(false);
              setActiveTab("issuance");
            }
          }
        ]
      : []),
    ...(certAttentionCount > 0
      ? [
          {
            key: "certificate-expiration",
            title: `인증서 만료 예정 ${certAttentionCount}건`,
            description: "만료 또는 60일 미만 만료 고객을 확인하세요.",
            count: certAttentionCount,
            tone: "warn" as const,
            actionLabel: "고객 필터로 이동",
            onAction: () => {
              setTaskNotificationOpen(false);
              setCustomerListFilter("certificate-expiration");
              setActiveTab("customers");
            }
          }
        ]
      : []),
    ...(customerContractRenewalsDue.length > 0
      ? [
          {
            key: "contract-expiration",
            title: `계약 만료 예정 ${customerContractRenewalsDue.length}건`,
            description: "계약 갱신 확인이 필요한 고객입니다.",
            count: customerContractRenewalsDue.length,
            tone: "warn" as const,
            actionLabel: "계약 필터로 이동",
            onAction: () => {
              setTaskNotificationOpen(false);
              setCustomerListFilter("contract-expiration");
              setActiveTab("customers");
            }
          }
        ]
      : []),
    ...(settingsScreenState.setupPendingCount > 0
      ? [
          {
            key: "settings-incomplete",
            title: `설정 미완료 ${settingsScreenState.setupPendingCount}개`,
            description: "메일, 발행 설정, AT 헬퍼 상태를 마무리하세요.",
            count: settingsScreenState.setupPendingCount,
            tone: "info" as const,
            actionLabel: "설정으로 이동",
            onAction: () => {
              setTaskNotificationOpen(false);
              openSettingsSection(settingsActionBar.primarySection);
            }
          }
        ]
      : [])
  ];
  const topnavTaskNotificationCount = topnavTaskNotifications.reduce((total, item) => total + item.count, 0);
  const topnavTaskNotificationBadge =
    topnavTaskNotificationCount > 99 ? "99+" : topnavTaskNotificationCount > 0 ? String(topnavTaskNotificationCount) : "";
  const activeOnboardingFirstSyncResult =
    onboardingFirstSyncResult?.organizationId === activeOrganizationId ? onboardingFirstSyncResult : null;
  const onboardingFirstSyncCompleted =
    onboardingFirstSyncReady ||
    activeOnboardingFirstSyncResult?.status === "success" ||
    workspaceLogs.some(
      (log) =>
        log.level === "info" &&
        log.scope === "mail-sync" &&
        log.message.includes("메일 동기화를 완료")
    );
  const onboardingFirstSyncStatusMessage =
    busyKey === "sync"
      ? "메일을 가져오고 초안을 갱신하는 중입니다."
      : activeOnboardingFirstSyncResult?.message ??
        (onboardingFirstSyncReady
          ? `첫 메일 동기화가 완료됐습니다. 현재 초안 ${reviewDrafts.length}건, 미매칭 메일 ${exceptionMessages.length}건입니다.`
          : onboardingFirstSyncCompleted
            ? "첫 메일 동기화가 완료됐습니다."
          : "");
  const onboardingFirstSyncContent = (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy onboarding-task-copy">
          <strong>
            {busyKey === "sync"
              ? "첫 메일 동기화 중"
              : onboardingFirstSyncCompleted
                ? "첫 메일 동기화 완료"
                : canRunOnboardingFirstSync
                  ? "첫 메일 동기화 실행"
                  : "이전 단계 완료 필요"}
          </strong>
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
          <div>
            <span>미매칭 메일</span>
            <strong>{exceptionMessages.length}건</strong>
          </div>
        </div>

        {onboardingFirstSyncStatusMessage ? (
          <div
            className={`context-empty-state onboarding-sync-result-card tone-${
              activeOnboardingFirstSyncResult?.status === "danger" ? "danger" : busyKey === "sync" ? "info" : "success"
            }`}
          >
            <Icon
              name={activeOnboardingFirstSyncResult?.status === "danger" ? "warning" : busyKey === "sync" ? "sync" : "complete"}
              className="onboarding-sync-result-icon"
            />
            <div className="onboarding-sync-result-copy">
              <strong>
                {activeOnboardingFirstSyncResult?.status === "danger"
                  ? "동기화 실패"
                  : busyKey === "sync"
                    ? "동기화 진행 중"
                    : "동기화 완료"}
              </strong>
              <p>{onboardingFirstSyncStatusMessage}</p>
            </div>
          </div>
        ) : null}

        {onboardingFirstSyncCompleted && exceptionMessages.length > 0 ? (
          <div className="button-row onboarding-primary-row">
            <button type="button" className="btn-secondary" onClick={openUnmatchedIssuanceMessages}>
              세금계산서 발행 &gt; 미매칭 메일로 이동
            </button>
          </div>
        ) : canRunOnboardingFirstSync && !onboardingFirstSyncCompleted ? (
          <div className="button-row onboarding-primary-row">
            <button type="button" disabled={busyKey !== null} onClick={() => void runOnboardingFirstSync()}>
              {busyKey === "sync" ? "동기화 중..." : "첫 메일 동기화 실행"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
  const onboardingSteps: OnboardingStep[] = [
    {
      id: "helper",
      step: 1,
      title: "AT 헬퍼 준비",
      summary: helperOnboardingReady
        ? customerRenewalAssistantAvailableCertificateCount > 0
          ? `공동인증서 ${customerRenewalAssistantAvailableCertificateCount}건`
          : "준비 완료"
        : "확인 필요",
      primaryActionLabel: helperOnboardingReady ? "공동인증서 읽기 완료" : "공동인증서 읽기",
      blockedReason: helperVersionMismatch
        ? helperActionBlockedReason
        : customerRenewalAssistant?.agentOnline
          ? undefined
          : "AT 헬퍼 실행 후 확인하세요.",
      done: helperOnboardingReady,
      content: onboardingHelperContent
    },
    {
      id: "registration",
      step: 2,
      title: "고객 초기 등록",
      summary: onboardingCertificateReady
        ? `등록 ${data.customers.length}명`
        : onboardingRegistrationStage === "download" || onboardingRegistrationStage === "upload"
          ? "양식 받기/올리기"
          : onboardingRegistrationStage === "commit"
            ? `반영 ${onboardingImportableCount}건`
            : onboardingRegistrationStage === "certificate"
              ? onboardingCertificateAutoTargetCount > 0
                ? `공동인증서 ${onboardingCertificateAutoTargetCount}건`
                : onboardingPendingPopbillJoinCount > 0
                  ? "고객 반영 확인 중"
                  : "공동인증서 확인"
            : onboardingRegistrationFlow.needsUploadRetry
              ? "재업로드"
              : "양식 업로드",
      primaryActionLabel: onboardingCertificateReady ? "고객 초기 등록 완료" : onboardingRegistrationPrimaryActionLabel,
      blockedReason: onboardingRegistrationBlockedReason,
      done: onboardingCertificateReady,
      content: (
        <InitialRegistrationTab
          mode="registration"
          busyKey={busyKey}
          customerOnboardingFileName={customerOnboardingFileName}
          customerOnboardingPreview={customerOnboardingPreview}
          customerOnboardingNotice={customerOnboardingNotice}
          customerOnboardingError={customerOnboardingError}
          certificateRegistrationProgress={customerOnboardingCertificateRegistrationProgress}
          joinProgress={customerOnboardingJoinProgress}
          pendingOnboardingCertificateRegistrationCount={pendingOnboardingCertificateRegistrationTargets.length}
          quickRegisterMessages={exceptionMessages}
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
          certificateReady={onboardingCertificateReady}
          certificateAutoTargetCount={onboardingCertificateAutoTargetCount}
          certificatePendingJoinCount={onboardingPendingPopbillJoinCount}
          certificateFailedJoinCount={onboardingFailedPopbillJoinCount}
          certificateRetryCount={onboardingCertificateRetryCount}
          certificatePrimaryActionLabel={onboardingCertificatePrimaryActionLabel}
          certificateActionDisabled={onboardingCertificateActionDisabled}
          certificateActionTitle={onboardingCertificateActionTitle}
          registrationStage={onboardingRegistrationStage}
          registrationBlockedReason={onboardingRegistrationBlockedReason}
          registrationTemplateDownloaded={customerOnboardingSessionState.templateDownloaded}
          registrationPreviewReady={customerOnboardingSessionState.previewReady}
          registrationCommitDone={customerOnboardingSessionState.commitDone}
          customerOnboardingSharedPassword={customerOnboardingSharedPassword}
          onCustomerOnboardingSharedPasswordChange={setCustomerOnboardingSharedPassword}
          certificatePasswordOverrideEntries={onboardingCertificatePasswordOverrideEntries}
          onCertificatePasswordOverrideChange={updateCustomerOnboardingCertificatePasswordOverride}
          showBillingMonthCompletion={false}
          downloadCustomerOnboardingTemplate={downloadCustomerOnboardingImportTemplate}
          handleCustomerOnboardingFileChange={handleCustomerOnboardingFileChange}
          commitCustomerOnboardingWorkbook={commitCustomerOnboardingWorkbook}
          proceedOnboardingCertificateFollowUp={proceedOnboardingCertificateFollowUpAction}
          setQuickRegisterForm={setQuickRegisterForm}
          selectQuickRegisterMessage={selectQuickRegisterMessage}
          submitQuickRegister={submitQuickRegister}
          onReprocessInboxMessage={reprocessInboxMessage}
          markBillingMonthCompleted={markBillingMonthCompleted}
          runAction={runAction}
          formatDateTime={formatDateTime}
          formatMoney={formatMoney}
          getInboxDisplayParseStatus={getInboxDisplayParseStatus}
          getParseStatusLabel={getParseStatusLabel}
        />
      )
    },
    {
      id: "first-sync",
      step: 3,
      title: "첫 메일 동기화",
      summary: onboardingFirstSyncCompleted
        ? "첫 메일 동기화 완료"
        : !onboardingCertificateReady
          ? "이전 단계 완료 후 실행"
          : activeOnboardingFirstSyncResult?.status === "danger"
            ? "동기화 실패"
          : "첫 동기화 필요",
      primaryActionLabel: onboardingFirstSyncCompleted ? "첫 메일 동기화 완료" : "첫 메일 동기화 실행",
      blockedReason:
        onboardingFirstSyncCompleted || canRunOnboardingFirstSync
          ? undefined
          : `먼저 ${onboardingFirstSyncBlockedSteps.join(" → ")} 단계를 끝내세요.`,
      done: onboardingFirstSyncCompleted,
      content: onboardingFirstSyncContent
    }
  ];
  const onboardingSetupSteps = onboardingSteps;
  const onboardingCompletionStepIds = new Set([
    "helper",
    "registration",
    "first-sync"
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
    if (!hasActiveWorkspace) {
      setActiveTab("onboarding");
      return;
    }
    setActiveSettingsSection("onboarding");
    setActiveTab("settings");
  };
  const reopenOnboarding = () => {
    openOnboardingStep(firstPendingOnboardingStep?.id ?? onboardingCompletionSteps[0]?.id ?? null);
  };
  const navItems: Array<{ id: TabId; label: string; icon: string }> = [
    ...(hasActiveWorkspace
        ? [
            { id: "home" as const, label: "홈", icon: "dashboard" },
            { id: "issuance" as const, label: "세금계산서 발행", icon: "issue" },
            { id: "customers" as const, label: "고객 관리", icon: "group" },
            { id: "certificates" as const, label: "인증서", icon: "certificate" },
            { id: "settings" as const, label: "설정", icon: "settings" }
          ]
      : []),
    ...(isPlatformAdmin ? [{ id: "ops" as const, label: "관리자", icon: "ops" }] : [])
  ];
  const visibleNavItems = navItems.filter((item) => item.id !== "certificates");
  const handleNavSelect = (nextTab: TabId) => {
    if (nextTab === "ops") {
      navigateToOpsSection(OPS_DEFAULT_SECTION);
      return;
    }

    setActiveTab(nextTab);
    if (nextTab === "settings") {
      openSettingsSection("onboarding");
    }
  };
  const certificateUnlinkedCount = certificatesScreenModel.metrics.unlinkedCount;
  const certificatePaymentReadyCount = certificatesScreenModel.metrics.paymentReadyCount;
  const certificateActionNeededCount = certificatesScreenModel.metrics.actionNeededCount;
  const homeScreenModel = buildHomeScreenModel({
    onboardingComplete,
    onboardingPendingStepCount,
    onboardingHeroProgressText,
    firstPendingOnboardingStep: firstPendingOnboardingStep
      ? {
          title: firstPendingOnboardingStep.title,
          summary: firstPendingOnboardingStep.summary
        }
      : null,
    onboardingFirstSyncReady: onboardingFirstSyncCompleted,
    reviewDraftCount: homeReviewDrafts.length,
    unmatchedMessageCount: exceptionMessages.length,
    unmatchedMessageTotalCount: data.inbox.length,
    blockedCustomerCount,
    certificateExpirationCustomerCount: expiredCertCustomers.length + expiringSoonCustomers.length,
    certAttentionCount,
    recentInboxCount: homeRecentInboxMessages.length,
    recentIssuedCount: homeRecentIssuedDrafts.length
  });
  const handleHomeAction = (actionKey: HomeActionKey) => {
    switch (actionKey) {
      case "sync":
        void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })));
        return;
      case "exceptions":
        setRequestedIssuanceFilter("unmatched");
        setActiveTab("issuance");
        return;
      case "recentInbox":
        setWorkFeedTab("inbox");
        scrollToElementById("work-recent-history");
        return;
      case "reviewQueue":
        setActiveTab("issuance");
        return;
      case "blockedCustomers":
        setActiveTab("customers");
        setCustomerListFilter("unissued");
        return;
      case "recentIssued":
        setWorkFeedTab("issued");
        scrollToElementById("work-recent-history");
        return;
      case "onboarding":
        reopenOnboarding();
        return;
      case "certificates":
        openCertificates();
        return;
    }
  };
  const completeCustomerContractRenewal = async (item: CustomerContractRenewalDueItem) => {
    const completion = await api<CustomerContractRenewalCompletion>(`/api/customers/${item.customerId}/contract-renewal/complete`, {
      method: "POST",
      body: JSON.stringify({
        expectedContractEndMonth: item.contractEndMonth
      })
    });
    setCustomerContractRenewalsDue((current) => current.filter((entry) => entry.customerId !== item.customerId));
    upsertCustomerContractSummary({
      customerId: item.customerId,
      contractStartMonth: completion.profile.contractStartMonth,
      contractEndMonth: completion.profile.contractEndMonth
    });
  };
  const loadCustomerContractPeriods = async (customerId: number): Promise<CustomerContractPeriod[]> => {
    return await api<CustomerContractPeriod[]>(`/api/customers/${customerId}/contract-periods`);
  };
  const addCustomerContractPeriod = async (
    customerId: number,
    input: { contractStartDate: string; contractEndDate: string }
  ): Promise<CustomerContractPeriodMutationResult> => {
    const result = await api<CustomerContractPeriodMutationResult>(`/api/customers/${customerId}/contract-periods`, {
      method: "POST",
      body: JSON.stringify(input)
    });
    upsertCustomerContractSummary(result.summary);
    await refreshCustomerContractRenewalsDue();
    return result;
  };
  const downloadCustomerContractRenewals = async () => {
    const XLSX = await loadXlsxModule();
    downloadCustomerContractRenewalsWorkbook(XLSX, customerContractRenewalsDue);
  };
  const downloadSelectedCustomers = async (customers: Customer[], reportYear: number) => {
    const [XLSX, reportDetails] = await Promise.all([
      loadXlsxModule(),
      Promise.all(
        customers.map(async (customer) =>
          normalizeCustomerReportDetail(
            await api<CustomerReportDetail>(`/api/customers/${customer.id}/report-detail?year=${encodeURIComponent(String(reportYear))}`)
          )
        )
      )
    ]);

    downloadSelectedCustomersWorkbook(
      XLSX,
      customers.map((customer, index) => ({
        customer,
        reportDetail: reportDetails[index]
      })),
      { reportYear }
    );
  };
  const screenActionBar = {
    onboarding: {
      title: "도입 준비",
      primaryActionLabel:
        firstPendingOnboardingStep?.id === "defaults"
            ? "발행 설정 열기"
            : firstPendingOnboardingStep?.id === "helper"
              ? "AT 헬퍼 상태 열기"
              : firstPendingOnboardingStep?.primaryActionLabel ?? "도입 준비 보기",
      onPrimaryAction: () => {
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
      title: homeScreenModel.actionBarTitle,
      primaryActionLabel: homeScreenModel.primaryActionLabel,
      onPrimaryAction: () => handleHomeAction(homeScreenModel.primaryActionKey),
      chips: homeScreenModel.chips
    },
    issuance: {
      title: "세금계산서 발행",
      primaryActionLabel: "검수 건 직접 발행",
      onPrimaryAction: () => {
        void runAction("issue-all", issueAllReviewDrafts);
      },
      chips: [
        { label: "발행 대기", value: `${issuancePendingDraftCount}건`, tone: "success" },
        { label: "발행 완료", value: `${issuanceIssuedDraftCount}건`, tone: issuanceIssuedDraftCount > 0 ? "success" : "default" }
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
      ]
    },
    certificates: {
      title: certificateActionNeededCount > 0 ? "인증서 조치 필요" : "인증서 상태 확인",
      primaryActionLabel: helperReady ? "인증서 불러오기" : "AT 헬퍼 상태 확인",
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
      primaryActionLabel: "가입 승인",
      onPrimaryAction: () => navigateToOpsSection("signup-requests"),
      chips: [
        { label: "상담 신청", value: `${opsConsultationRequests.filter((request) => request.status === "new").length}건`, tone: opsConsultationRequests.some((request) => request.status === "new") ? "warn" : "default" },
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
  const isNavItemActive = (itemId: TabId) => visibleActiveTab === itemId;
  const topnavUserLabel = currentMembership?.displayName || data.auth.activeDisplayName || data.auth.email || "로그인 사용자";
  const topnavProfileInitial = (activeWorkspaceName.trim()[0] || topnavUserLabel.trim()[0] || "A").toLocaleUpperCase("ko-KR");
  const handleTopnavSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActiveTab("customers");
  };
  const showHomeSyncButton = false;
  const showScreenPrimaryAction = visibleActiveTab === "ops" || visibleActiveTab === "certificates" || visibleActiveTab === "issuance";
  const showActionBarActions = showHomeSyncButton || showScreenPrimaryAction;
  const showGlobalActionBar =
    visibleActiveTab !== "home" &&
    visibleActiveTab !== "customers" &&
    visibleActiveTab !== "issuance" &&
    visibleActiveTab !== "certificates" &&
    visibleActiveTab !== "settings";
  return (
    <>
      <div className="app-shell app-shell-topnav">
        <header className="topnav-shell">
          <Button type="button" variant="ghost" className="topnav-brand" aria-label="홈으로 이동" onClick={() => handleNavSelect("home")}>
            <span className="brand-badge topnav-brand-badge">AT</span>
            <div className="brand-copy">
              <img src="/logo-O2APlXk3.png" alt="AUTO-TAX" className="topnav-brand-logo" />
            </div>
          </Button>

          <nav className="topnav-list" aria-label="주 메뉴">
            {visibleNavItems.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={isNavItemActive(item.id) ? "secondary" : "ghost"}
                aria-label={item.label}
                className={isNavItemActive(item.id) ? "topnav-button active" : "topnav-button"}
                onClick={() => handleNavSelect(item.id)}
              >
                <Icon name={item.icon} className="nav-icon topnav-icon" />
                <span className="nav-title">{item.label}</span>
              </Button>
            ))}
          </nav>

          <div className="topnav-context">
            <form className="topnav-search" role="search" onSubmit={handleTopnavSearchSubmit}>
              <Icon name="search" className="topnav-search-icon" />
              <Input
                type="search"
                value={customerSearchQuery}
                onChange={(event) => {
                  setCustomerSearchField("all");
                  setCustomerSearchQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setActiveTab("customers");
                  }
                }}
                placeholder="고객명, 사업자번호 검색"
                aria-label="고객명 또는 고객 사업자번호 검색"
              />
            </form>
            <div className="topnav-notification-wrap" ref={taskNotificationRef}>
              <button
                type="button"
                className={taskNotificationOpen ? "topnav-notification active" : "topnav-notification"}
                aria-label="업무 알림"
                aria-expanded={taskNotificationOpen}
                aria-controls="topnav-task-notifications"
                onClick={() => setTaskNotificationOpen((open) => !open)}
              >
                <Icon name="bell" className="topnav-notification-icon" />
                {topnavTaskNotificationBadge ? (
                  <span className="topnav-notification-badge" aria-label={`처리할 업무 ${topnavTaskNotificationCount}건`}>
                    {topnavTaskNotificationBadge}
                  </span>
                ) : null}
              </button>
              {taskNotificationOpen ? (
                <div id="topnav-task-notifications" className="topnav-notification-panel" role="dialog" aria-label="업무 알림">
                  <div className="topnav-notification-head">
                    <div>
                      <strong>업무 알림</strong>
                      <span>처리해야 하는 항목만 표시합니다.</span>
                    </div>
                    <span className={topnavTaskNotificationCount > 0 ? "topnav-notification-total active" : "topnav-notification-total"}>
                      {topnavTaskNotificationCount}건
                    </span>
                  </div>
                  {topnavTaskNotifications.length > 0 ? (
                    <div className="topnav-notification-list">
                      {topnavTaskNotifications.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={`topnav-notification-item tone-${item.tone}`}
                          onClick={item.onAction}
                        >
                          <span className="topnav-notification-item-main">
                            <strong>{item.title}</strong>
                            <span>{item.description}</span>
                          </span>
                          <span className="topnav-notification-action">{item.actionLabel}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="topnav-notification-empty">
                      <strong>처리할 알림이 없습니다.</strong>
                      <span>발행 실패, 미매칭, 만료 예정, 설정 미완료가 생기면 여기에 표시됩니다.</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <details className="topnav-profile">
              <summary className="topnav-profile-summary">
                <span className="topnav-profile-avatar" aria-hidden="true">
                  {topnavProfileInitial}
                </span>
                <span className="topnav-profile-copy">
                  <strong>{topnavUserLabel}</strong>
                  <span>{activeWorkspaceName}</span>
                </span>
              </summary>
              <div className="topnav-profile-menu">
                {hasActiveWorkspace && data.auth.organizations.length > 1 ? (
                  <label>
                    작업공간
                    <select
                      className="workspace-select topnav-workspace-select"
                      value={data.auth.activeOrganizationId ?? ""}
                      onChange={(event) => void changeOrganization(event.target.value)}
                      disabled={busyKey !== null}
                      aria-label="작업공간 선택"
                    >
                      {data.auth.organizations.map((organization) => (
                        <option key={organization.organizationId} value={organization.organizationId}>
                          {organization.organizationName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  className="btn-secondary topnav-logout"
                  aria-label="로그아웃"
                  onClick={() => void signOut()}
                  disabled={busyKey !== null}
                >
                  로그아웃
                </button>
              </div>
            </details>
          </div>
        </header>

        <main
          className={
            visibleActiveTab === "onboarding"
              ? "content content-onboarding"
              : visibleActiveTab === "home"
              ? "content content-home"
              : visibleActiveTab === "customers"
                ? "content content-customers"
                : visibleActiveTab === "issuance"
                  ? "content content-issuance"
                : visibleActiveTab === "certificates"
                  ? "content content-certificates"
                : visibleActiveTab === "settings"
                  ? "content content-settings"
                  : visibleActiveTab === "ops"
                    ? "content content-ops"
                    : "content"
          }
        >
          {showGlobalActionBar ? (
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
          ) : null}

          {error ? <div className="alert error">{error}</div> : null}

          <OnboardingCertificateAutoRunner
            active={onboardingCertificateFollowUpActive}
            commitDone={onboardingCustomerDatabaseReady}
            hasWorkbook={customerOnboardingWorkbook !== null}
            certificateReady={onboardingCertificateReady}
            busyKey={busyKey}
            pendingJoinCount={onboardingPendingPopbillJoinCount}
            pollPendingJoins={pollOnboardingPendingJoins}
          />

        <Suspense fallback={<div className="loading-shell">화면을 불러오는 중입니다.</div>}>
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
          <HomeTab
            mailboxDataLoading={mailboxDataLoading}
            model={homeScreenModel}
            screenTitle={activeScreenBar.title}
            userLabel={currentMembership?.displayName || data.auth.email || "로그인 사용자"}
            workspaceLabel={activeWorkspaceName}
            popbillModeLabel={workspacePopbillModeLabel}
            customers={data.customers}
            reviewDrafts={homeReviewDrafts}
            recentInboxMessages={homeRecentInboxMessages}
            recentIssuedDrafts={homeRecentIssuedDrafts}
            issuedDraftsByCustomerId={issuedDraftsByCustomerId}
            contractRenewalDueItems={customerContractRenewalsDue}
            currentMonthIssuedDraftCount={currentMonthIssuedDraftCount}
            currentBillingMonth={currentHomeBillingMonth}
            issuedMonthlyTrend={issuedMonthlyTrend}
            issuedMonthlyTrendLoading={issuedMonthlyTrendLoading}
            issuedMonthlyTrendError={issuedMonthlyTrendError}
            monthlyIssueLimit={homeMonthlyIssueLimit}
            workFeedTab={workFeedTab}
            reprocessableMessageCount={reprocessableMessages.length}
            busyKey={busyKey}
            onOpenAction={handleHomeAction}
            onLoadIssuedMonthlyTrend={(anchorBillingYear) => void loadIssuedMonthlyTrend(anchorBillingYear)}
            onResetIssuedMonthlyTrend={() => void loadIssuedMonthlyTrend()}
            onOpenCustomers={() => setActiveTab("customers")}
            onSelectFeedTab={setWorkFeedTab}
            onIssueAllReviewDrafts={() => void runAction("issue-all", issueAllReviewDrafts)}
            onIssueDraft={(draftId) =>
              void runAction(`issue-${draftId}`, async () => void (await issueDraftWithConfirmation(draftId)))
            }
            onReprocessInboxMessage={(messageId) =>
              void runAction(`reprocess-${messageId}`, async () => void (await reprocessInboxMessage(messageId)), { reload: false })
            }
            onReprocessAllMessages={() => void runAction("reprocess-all-unmatched", reprocessAllUnmatchedMessages, { reload: false })}
            onViewDraft={(draftId) =>
              void runAction(`draft-view-${draftId}`, async () => void (await openDraftPopbillUrl(draftId, "view-url")))
            }
            onCancelDraft={(draftId) =>
              void runAction(`draft-cancel-${draftId}`, async () => void (await cancelIssuedDraft(draftId)))
            }
            onCompleteContractRenewal={(item) =>
              void runAction(`contract-renewal-${item.customerId}`, async () => void (await completeCustomerContractRenewal(item)), { reload: false })
            }
            onDownloadContractRenewals={() =>
              void runAction("contract-renewals-export", downloadCustomerContractRenewals, { reload: false })
            }
            getInboxDisplayParseStatus={getInboxDisplayParseStatus}
            getParseStatusLabel={getParseStatusLabel}
            getDraftStatusLabel={getDraftStatusLabel}
            isInboxActionable={isInboxActionable}
            formatMoney={formatMoney}
            formatDateTime={formatDateTime}
            simplifyIssueError={simplifyIssueError}
          />
        ) : null}

        {visibleActiveTab === "issuance" ? (
          <IssuanceTab
            mailboxDataLoading={mailboxDataLoading}
            screenTitle={activeScreenBar.title}
            userLabel={currentMembership?.displayName || data.auth.email || "로그인 사용자"}
            workspaceLabel={activeWorkspaceName}
            popbillModeLabel={workspacePopbillModeLabel}
            requestedFilter={requestedIssuanceFilter}
            onConsumeRequestedFilter={() => setRequestedIssuanceFilter(null)}
            drafts={data.drafts}
            inboxMessages={data.inbox}
            unmatchedInboxMessages={unmatchedInboxMessages}
            customers={data.customers}
            busyKey={busyKey}
            onSyncMail={() => void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })))}
            loadDraftMailPreview={(draftId) => api<MailPreviewImageResponse>(`/api/drafts/${draftId}/mail-preview-image`)}
            onIssueAllReviewDrafts={() => void runAction("issue-all", issueAllReviewDrafts)}
            onIssueSelectedDrafts={(draftIds) => void runAction("issue-selected", async () => void (await issueSelectedDrafts(draftIds)))}
            onIssueDraft={(draftId) =>
              void runAction(`issue-${draftId}`, async () => void (await issueDraftWithConfirmation(draftId)))
            }
            onReprocessInboxMessage={(messageId, customerId) =>
              void runAction(
                customerId ? `reprocess-${messageId}-customer-${customerId}` : `reprocess-${messageId}`,
                async () => void (await reprocessInboxMessage(messageId, customerId)),
                { reload: false }
              )
            }
            onViewDraft={(draftId) =>
              void runAction(`draft-view-${draftId}`, async () => void (await openDraftPopbillUrl(draftId, "view-url")))
            }
            onPrintDraft={(draftId) =>
              void runAction(`draft-print-${draftId}`, async () => void (await openDraftPopbillUrl(draftId, "print-url")))
            }
            onCancelDraft={(draftId) =>
              void runAction(`draft-cancel-${draftId}`, async () => void (await cancelIssuedDraft(draftId)))
            }
            onUnmatchDraft={(draftId) =>
              void runAction(`draft-unmatch-${draftId}`, async () => void (await unmatchDraftCustomer(draftId)), { reload: false })
            }
            onCreateManualDraft={createManualDraft}
            onUpdateDraftTaxInvoiceInfo={updateDraftTaxInvoiceInfo}
            formatMoney={formatMoney}
            formatDateTime={formatDateTime}
            getDraftStatusLabel={getDraftStatusLabel}
            getDraftConfirmNumber={getDraftConfirmNumber}
            simplifyIssueError={simplifyIssueError}
          />
        ) : null}

        {visibleActiveTab === "customers" ? (
          <CustomersTab
            customers={data.customers}
            customerCertificates={data.customerCertificates}
            customerCertificateItems={certificatesScreenModel.certificateItems}
            expiredCertCustomers={expiredCertCustomers}
            expiringSoonCustomers={expiringSoonCustomers}
            filteredCustomers={filteredCustomers}
            selectedCustomer={selectedCustomer}
            creatingCustomer={creatingCustomer}
            selectedCustomerReadiness={selectedCustomerReadiness}
            selectedCustomerIssues={selectedCustomerIssues}
            selectedCustomerIssuedDrafts={selectedCustomerIssuedDrafts}
            issuedDraftsByCustomerId={issuedDraftsByCustomerId}
            contractSummaries={customerContractSummaries}
            contractRenewalDueItems={customerContractRenewalsDue}
            blockedCustomerCount={blockedCustomerCount}
            readyCustomerCount={readyNowCustomers.length}
            expiringSoonCustomerCount={expiringSoonCustomers.length}
            popbillPendingCustomerCount={popbillPendingCustomers.length}
            busyKey={busyKey}
            isSavingCustomer={isSavingCustomer}
            customerSearchField={customerSearchField}
            customerSearchQuery={customerSearchQuery}
            customerIssueMonthQuery={customerIssueMonthQuery}
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
            customerRenewalAssistantUpgradeState={customerRenewalAssistant?.upgradeState ?? "unknown"}
            customerRenewalAssistantUpgradeMessage={customerRenewalAssistant?.upgradeMessage ?? null}
            renewalHelperDownloadUrl={renewalHelperDownloadUrl}
            customerRenewalLoadedCertificateCount={customerRenewalAssistantAvailableCertificateCount}
            userLabel={currentMembership?.displayName || data.auth.email || "로그인 사용자"}
            workspaceLabel={activeWorkspaceName}
            workspaceModeLabel={workspacePopbillModeLabel}
            renewableCustomers={customerRenewalCandidates}
            customerNameInputRef={customerNameInputRef}
            customerAddressLookupRef={customerAddressLookupRef}
            setCustomerSearchField={setCustomerSearchField}
            setCustomerSearchQuery={setCustomerSearchQuery}
            setCustomerIssueMonthQuery={setCustomerIssueMonthQuery}
            setCustomerListFilter={setCustomerListFilter}
            setCustomerDetailTab={setCustomerDetailTab}
            setCustomerForm={setCustomerForm}
            setCustomerAddressResolveMessage={setCustomerAddressResolveMessage}
            onCreateCustomer={startCreatingCustomer}
            onCancelCreateCustomer={cancelCreatingCustomer}
            onRefreshCustomerRenewalAssistant={refreshCustomerRenewalAssistant}
            onLoadCustomerRenewalCertificates={async () => {
              await syncCustomerRenewalCertificates({ showAlert: false, skipReadinessCheck: true });
            }}
            onLoadCustomerAddCertificates={loadCustomerAddElectronicTaxCertificates}
            onUploadCustomerAddCertificateFiles={uploadCustomerAddCertificateFiles}
            onPreviewCustomerCertificateOnestop={previewCustomerCertificateOnestop}
            onExecuteCustomerCertificateOnestop={executeCustomerCertificateOnestop}
            onStartCustomerRenewal={startCustomerRenewal}
            onSelectCustomer={selectCustomerForEdit}
            onSaveCustomer={saveCustomer}
            onSaveCustomerMemo={saveCustomerMemo}
            onJoinCustomerPopbill={joinCustomerPopbill}
            onOpenCustomerCertRegistration={openCustomerCertRegistration}
            onLinkCustomerCertificate={linkLocalCertificateToCustomer}
            onUnlinkCustomerCertificate={unlinkCustomerCertificate}
            onPrepareCustomerCertificateRenewal={prepareLinkedCustomerCertificateRenewal}
            onOpenCustomerCertificatePayment={openLinkedCustomerCertificatePayment}
            onRefreshCustomerCertificateStatus={async (customerId) => {
              await refreshSingleCustomerCertificateStatus(customerId);
            }}
            onResetPopbillLink={resetPopbillLink}
            onDeleteCustomers={deleteCustomers}
            onExportSelectedCustomers={downloadSelectedCustomers}
            onShowDraftPopbillInfo={showDraftPopbillInfo}
            onOpenDraftPopbillUrl={openDraftPopbillUrl}
            onCustomerReportDetailSaved={handleCustomerReportDetailSaved}
            onLoadCustomerContractPeriods={loadCustomerContractPeriods}
            onAddCustomerContractPeriod={addCustomerContractPeriod}
            onCompleteCustomerContractRenewal={(item) =>
              runAction(`contract-renewal-${item.customerId}`, async () => void (await completeCustomerContractRenewal(item)), { reload: false })
            }
            resolveCustomerAddress={resolveCustomerAddress}
            runAction={runAction}
            formatCertificateExpireDate={formatCertificateExpireDate}
            getCustomerIssueReadiness={getCachedCustomerIssueReadiness}
            getCustomerCertificateSummary={getCustomerCertificateSummary}
            getCustomerPopbillSummary={getCustomerPopbillSummary}
            getDraftConfirmNumber={getDraftConfirmNumber}
            formatDateTime={formatDateTime}
            formatMoney={formatMoney}
          />
        ) : null}

        {visibleActiveTab === "settings" ? (
          <SettingsScreen
            userLabel={currentMembership?.displayName || data.auth.email || "로그인 사용자"}
            workspaceLabel={activeWorkspaceName}
            popbillModeLabel={workspacePopbillModeLabel}
            settingsState={settingsScreenState}
            activeSettingsSection={activeSettingsSection}
            logs={workspaceLogs}
            customers={data.customers}
            onSaveCustomerIssueCompleteSmsTemplate={saveCustomerIssueCompleteSmsTemplate}
            onSendWithdrawalPhoneVerification={sendWithdrawalPhoneVerification}
            onConfirmWithdrawalPhoneVerification={confirmWithdrawalPhoneVerification}
            onWithdrawOrganization={withdrawOrganization}
            customerRegistrationReady={customerRegistrationReady}
            customerCount={data.customers.length}
            onboardingComplete={onboardingComplete}
            onboardingProgressText={onboardingHeroProgressText}
            onboardingPendingStepCount={onboardingPendingStepCount}
            onboardingContent={
              <OnboardingTab
                steps={onboardingSetupSteps}
                requestedStepId={requestedOnboardingStepId}
              />
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
            customerRenewalLoadedCertificateCount={customerRenewalAssistantAvailableCertificateCount}
            customerRenewalElectronicTaxCertificateCount={customerRenewalAssistantElectronicTaxCertificateCount}
            customerRenewalGeneralCertificateCount={customerRenewalAssistantGeneralCertificateCount}
            certificateReadProgress={certificateReadProgress}
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
            customerRenewalLoadedCertificateCount={customerRenewalAssistantAvailableCertificateCount}
            userLabel={currentMembership?.displayName || data.auth.email || "로그인 사용자"}
            workspaceLabel={activeWorkspaceName}
            popbillModeLabel={workspacePopbillModeLabel}
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
        </Suspense>

        {visibleActiveTab === "ops" ? (
          <div className="ops-layout">
            <aside className="ops-admin-rail" aria-label="관리자 메뉴">
              <section className="panel ops-admin-menu">
                <div className="ops-admin-menu-head">
                  <strong>관리자 메뉴</strong>
                  <span>{data.auth.email ?? "admin"}</span>
                </div>
                <nav className="ops-admin-menu-list" aria-label="관리자 로컬 메뉴">
                  {opsMenuItems.map((item) => (
                    <a
                      key={item.section}
                      href={getOpsSectionHash(item.section)}
                      className={activeOpsSection === item.section ? "active" : undefined}
                      onClick={() => setActiveOpsSection(item.section)}
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
                <div className="ops-admin-session">
                  <span>세션</span>
                  <strong>{activeWorkspaceName}</strong>
                  <small>{formatDateTime(new Date().toISOString())}</small>
                </div>
              </section>
            </aside>
            {opsConsole ? (
              <div className="ops-section-main">
                {activeOpsSection === "signup-requests" ? (
                  <Panel
                    className="panel-ops-signup-requests"
                    id="ops-signup-requests"
                    title="가입 승인"
                    subtitle="고객이 직접 신청한 계정을 검토하고 승인 시 새 작업공간과 owner 멤버십을 자동 생성합니다."
                  >
                    <div className="ops-workspace-table-wrap">
                      {opsSignupRequests.length > 0 ? (
                        <table className="ops-workspace-table ops-signup-table">
                          <thead>
                            <tr>
                              <th>상태</th>
                              <th>회사 정보</th>
                              <th>사업자 정보</th>
                              <th>가입자</th>
                              <th>연락처</th>
                              <th>마케팅</th>
                              <th>신청일</th>
                              <th>액션</th>
                            </tr>
                          </thead>
                          <tbody>
                            {opsSignupRequests.map((request) => (
                              <tr key={request.id}>
                                <td>
                                  <span className={`chip ${getSignupStatusChipClass(request.status)}`}>
                                    {getSignupStatusLabel(request.status)}
                                  </span>
                                </td>
                                <td>
                                  <strong>{request.organizationName}</strong>
                                  <span>{request.businessRegistrationNumber || "-"}</span>
                                  <span>{request.businessAddress || "-"}</span>
                                  {request.reviewNote ? <span>{request.reviewNote}</span> : null}
                                </td>
                                <td>
                                  <strong>{request.representativeName || "-"}</strong>
                                  <span>{request.businessType || "-"} / {request.businessItem || "-"}</span>
                                  <span>{request.invoiceEmail || "-"}</span>
                                </td>
                                <td>
                                  <strong>{request.name}</strong>
                                  <span>{request.loginId}</span>
                                </td>
                                <td>
                                  <span>{request.phone}</span>
                                  <span>{request.kepcoEmail}</span>
                                </td>
                                <td>{request.marketingConsent ? "동의" : "미동의"}</td>
                                <td>{formatDateTime(request.createdAt)}</td>
                                <td>
                                  <div className="ops-table-actions">
                                    <button
                                      className="btn-secondary"
                                      disabled={busyKey !== null || request.status !== "pending"}
                                      onClick={() =>
                                        void runAction(
                                          `ops-signup-approve-${request.id}`,
                                          async () => void (await approveSignupRequest(request)),
                                          { reload: false }
                                        )
                                      }
                                    >
                                      승인
                                    </button>
                                    <button
                                      className="btn-secondary"
                                      disabled={busyKey !== null || request.status !== "pending"}
                                      onClick={() =>
                                        void runAction(
                                          `ops-signup-reject-${request.id}`,
                                          async () => void (await rejectSignupRequest(request)),
                                          { reload: false }
                                        )
                                      }
                                    >
                                      반려
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="empty">접수된 회원가입 신청이 없습니다.</div>
                      )}
                    </div>
                  </Panel>
                ) : null}

                {activeOpsSection === "consultation" ? (
                  <Panel
                  className="panel-ops-consultation"
                  id="ops-consultation-requests"
                  title="상담 신청"
                  subtitle="공개 화면에서 접수된 문의 내용과 연락 상태를 관리합니다."
                >
                  <div className="ops-consultation-status-filters" aria-label="상담 신청 상태 필터">
                    {CONSULTATION_STATUS_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        className={consultationStatusFilter === filter.value ? "is-active" : ""}
                        onClick={() => setConsultationStatusFilter(filter.value)}
                      >
                        <span>{filter.label}</span>
                        <strong>{opsConsultationStatusCounts[filter.value]}건</strong>
                      </button>
                    ))}
                  </div>
                  <div className="ops-list">
                    {filteredOpsConsultationRequests.length > 0 ? (
                      filteredOpsConsultationRequests.slice(0, 12).map((request) => (
                        <article key={request.id} className="ops-card">
                          <div className="ops-card-head">
                            <div>
                              <strong>{request.name}</strong>
                              <span>{request.phone}</span>
                            </div>
                            <span className={`chip ${getConsultationStatusChipClass(request.status)}`}>
                              {getConsultationStatusLabel(request.status)}
                            </span>
                          </div>
                          <div className="ops-card-meta">
                            <span>접수 {formatDateTime(request.createdAt)}</span>
                            <span>{request.category}</span>
                            {request.email ? <span>{request.email}</span> : null}
                            {request.region ? <span>{request.region}</span> : null}
                            {request.note ? <span>{request.note}</span> : null}
                          </div>
                          <div className="ops-consultation-detail">
                            <strong>상담 내용</strong>
                            <p>{request.message.trim() || "작성된 상담 내용이 없습니다."}</p>
                          </div>
                          <div className="ops-card-actions">
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={busyKey !== null || request.status === "contacted"}
                              onClick={() =>
                                void runAction(
                                  `ops-consultation-contacted-${request.id}`,
                                  async () => void (await updateConsultationRequestStatus(request, "contacted")),
                                  { reload: false }
                                )
                              }
                            >
                              연락 완료
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={busyKey !== null || request.status === "workspace_opened"}
                              onClick={() =>
                                void runAction(
                                  `ops-consultation-opened-${request.id}`,
                                  async () => void (await updateConsultationRequestStatus(request, "workspace_opened")),
                                  { reload: false }
                                )
                              }
                            >
                              개통 완료
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={busyKey !== null || request.status === "closed"}
                              onClick={() =>
                                void runAction(
                                  `ops-consultation-closed-${request.id}`,
                                  async () => void (await updateConsultationRequestStatus(request, "closed")),
                                  { reload: false }
                                )
                              }
                            >
                              종료
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty">
                        {consultationStatusFilter === "all"
                          ? "접수된 상담 신청이 없습니다."
                          : `${getConsultationStatusLabel(consultationStatusFilter)} 상태의 상담 신청이 없습니다.`}
                      </div>
                    )}
                  </div>
                  </Panel>
                ) : null}

                {activeOpsSection === "subscription" ? (
                  <>
                <section className={`alert ${opsPartnerIsTest ? "warn" : "success"} ops-mode-banner`}>
                  <div className="ops-mode-banner-head">
                    <strong>발행 연동 현재 연결 모드</strong>
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
                <Panel
                  className="panel-ops-subscription"
                  id="ops-subscription"
                  title="구독/매출"
                  subtitle={`월 발행 ${OPS_SUBSCRIPTION_ISSUE_BLOCK_SIZE}건당 ${formatMoney(OPS_SUBSCRIPTION_MONTHLY_BLOCK_PRICE)}원 기준의 예상 지표입니다. 계좌 입금 확인 후 운영자가 수동으로 유료 구독을 적용합니다.`}
                >
                  <section className="stats-grid stats-grid-compact ops-subscription-kpis">
                    <StatCard
                      label="총 구독 중인 사용자수"
                      value={opsSubscriptionMetrics.subscribedWorkspaceCount}
                      tone={opsSubscriptionMetrics.subscribedWorkspaceCount > 0 ? "default" : "warn"}
                    />
                    <StatCard
                      label="유료 월 발행 한도"
                      value={`${formatMoney(opsSubscriptionMetrics.monthlyIssueLimit)}건`}
                      tone={opsSubscriptionMetrics.monthlyIssueLimit > 0 ? "default" : "warn"}
                    />
                    <StatCard
                      label="예상 월 매출"
                      value={`${formatMoney(opsSubscriptionMetrics.expectedMonthlyRevenue)}원`}
                      tone={opsSubscriptionMetrics.expectedMonthlyRevenue > 0 ? "default" : "warn"}
                    />
                    <StatCard
                      label="예상 연 매출"
                      value={`${formatMoney(opsSubscriptionMetrics.expectedAnnualRevenue)}원`}
                      tone={opsSubscriptionMetrics.expectedAnnualRevenue > 0 ? "default" : "warn"}
                    />
                  </section>
                  <p className="ops-helper-text">
                    예상 매출은 plan_code가 paid이고 active인 작업공간만 포함합니다. 무료 체험, 중지, 해지 작업공간은 예상 매출에서 제외합니다.
                  </p>
                </Panel>
                  </>
                ) : null}

                {activeOpsSection === "workspaces" ? (
                  <Panel className="panel-ops-workspaces" id="ops-workspaces" title="개통된 고객사 작업공간">
                  <p className="ops-helper-text">
                    고객사별 발행 완료 건수를 기준으로 사용량을 집계합니다.
                    {partnerTaxInvoiceUnitCost !== null
                      ? ` 현재 전자세금계산서 연동 단가 ${formatMoney(partnerTaxInvoiceUnitCost)}P 기준 추정 사용 포인트도 함께 표시합니다.`
                      : " 전자세금계산서 연동 단가를 읽지 못해 추정 포인트는 아직 계산하지 못했습니다."}
                  </p>
                  <div className="ops-workspace-table-wrap">
                    {opsWorkspaces.length > 0 ? (
                      <table className="ops-workspace-table">
                        <thead>
                          <tr>
                            <th>작업공간 ID</th>
                            <th>작업공간명</th>
                            <th>플랜</th>
                            <th>owner</th>
                            <th>상태</th>
                            <th>예상 월 구독료</th>
                            <th>월 발행 한도</th>
                            <th>이번 달 발행</th>
                            <th>등록 고객</th>
                            <th>포인트</th>
                            <th>최근 발행</th>
                            <th>액션</th>
                          </tr>
                        </thead>
                        <tbody>
                          {opsWorkspaces.map((workspace, index) => {
                            const workspaceEstimatedPointUsage = getWorkspaceEstimatedPointUsage(workspace, partnerTaxInvoiceUnitCost);
                            const workspaceCurrentMonthEstimatedPointUsage = getWorkspaceCurrentMonthEstimatedPointUsage(
                              workspace,
                              partnerTaxInvoiceUnitCost
                            );
                            const workspaceSubscriptionEligible = isOpsSubscriptionWorkspace(workspace);
                            const workspaceSubscriptionBlocks = getOpsSubscriptionIssueBlocks(workspace.monthlyIssueLimit);
                            const workspaceExpectedMonthlyRevenue = workspaceSubscriptionEligible
                              ? getOpsWorkspaceExpectedMonthlyRevenue(workspace)
                              : 0;
                            const workspaceCode = `WS-${String(index + 1).padStart(4, "0")}`;

                            return (
                              <tr key={workspace.organizationId}>
                                <td>{workspaceCode}</td>
                                <td>
                                  <strong>{workspace.organizationName}</strong>
                                </td>
                                <td>{getOrganizationPlanLabel(workspace.organizationPlanCode)}</td>
                                <td>
                                  {workspace.ownerDisplayName ? `${workspace.ownerDisplayName} · ` : ""}
                                  {workspace.ownerLoginId ?? "-"}
                                </td>
                                <td>
                                  <span className={`chip ${workspace.organizationStatus === "active" ? "chip-success" : workspace.organizationStatus === "trial" ? "chip-warn" : "chip-danger"}`}>
                                    {getOrganizationStatusLabel(workspace.organizationStatus)}
                                  </span>
                                </td>
                                <td>
                                  {workspaceSubscriptionEligible ? (
                                    <span className="ops-subscription-fee-cell">
                                      <strong>{formatMoney(workspaceExpectedMonthlyRevenue)}원</strong>
                                    <span>{workspaceSubscriptionBlocks}구간 · 월 {formatMoney(workspace.monthlyIssueLimit)}건</span>
                                    </span>
                                  ) : (
                                    <span className="muted">구독 제외</span>
                                  )}
                                </td>
                                <td>
                                  <div className="ops-limit-cell">
                                    <span>월 {formatMoney(workspace.monthlyIssueLimit)}건</span>
                                    <input
                                      aria-label={`${workspace.organizationName} 월 발행 한도`}
                                      type="number"
                                      min="10"
                                      step="10"
                                      value={workspaceLimitEdits[workspace.organizationId] ?? String(workspace.monthlyIssueLimit)}
                                      onChange={(event) =>
                                        setWorkspaceLimitEdits((prev) => ({
                                          ...prev,
                                          [workspace.organizationId]: event.target.value
                                        }))
                                      }
                                    />
                                    <span className="field-hint">10건은 무료 체험, 유료 구독은 100건 단위</span>
                                  </div>
                                </td>
                                <td>{formatMoney(workspace.currentMonthIssuedDraftCount)}건</td>
                                <td>{formatMoney(workspace.managedCustomerCount)}명</td>
                                <td>
                                  <span>누적 {workspaceEstimatedPointUsage !== null ? `${formatMoney(workspaceEstimatedPointUsage)}P` : "-"}</span>
                                  <span>이번 달 {workspaceCurrentMonthEstimatedPointUsage !== null ? `${formatMoney(workspaceCurrentMonthEstimatedPointUsage)}P` : "-"}</span>
                                </td>
                                <td>{formatDateTime(workspace.lastIssuedAt)}</td>
                                <td>
                                  <div className="ops-table-actions">
                                    <button
                                      className="btn-secondary"
                                      disabled={busyKey !== null}
                                      onClick={() => openOwnerPasswordReset(workspace)}
                                    >
                                      owner 재설정
                                    </button>
                                    <button
                                      className="btn-secondary"
                                      disabled={busyKey !== null}
                                      onClick={() => openOpsWorkspaceMailSettings(workspace)}
                                    >
                                      메일 설정
                                    </button>
                                    <button
                                      className="btn-secondary"
                                      disabled={busyKey !== null}
                                      onClick={() =>
                                        void runAction(
                                          `ops-workspace-limit-${workspace.organizationId}`,
                                          async () => void (await updateWorkspaceSubscription(workspace)),
                                          { reload: false }
                                        )
                                      }
                                    >
                                      구독 저장
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty">아직 개통된 고객사 작업공간이 없습니다.</div>
                    )}
                  </div>
                  {opsWorkspaceMailSettingsTarget ? (() => {
                    const workspace = opsWorkspaces.find((item) => item.organizationId === opsWorkspaceMailSettingsTarget.organizationId);
                    if (!workspace) {
                      return null;
                    }

                    return (
                      <div id="ops-mail-settings" className="helper-box-stack inline-password-reset ops-mail-settings-panel">
                        <strong>{workspace.organizationName} 메일 설정</strong>
                        <span className="field-hint">메일 앱 비밀번호는 저장 후 다시 표시하지 않습니다. 비워두면 기존 저장값을 유지합니다.</span>
                        <div className="form-grid">
                          <label>
                            메일 주소
                            <input
                              value={opsWorkspaceMailSettingsForm.mailAddress}
                              onChange={(event) =>
                                setOpsWorkspaceMailSettingsForm((prev) => ({
                                  ...prev,
                                  mailAddress: event.target.value
                                }))
                              }
                              placeholder="customer@gmail.com"
                            />
                          </label>
                          <label>
                            앱 비밀번호
                            <div className="password-field">
                              <input
                                type={revealedFields.opsMailPassword ? "text" : "password"}
                                value={opsWorkspaceMailSettingsForm.mailPassword}
                                onChange={(event) =>
                                  setOpsWorkspaceMailSettingsForm((prev) => ({
                                    ...prev,
                                    mailPassword: event.target.value
                                  }))
                                }
                                placeholder="변경할 때만 입력"
                              />
                              <button
                                type="button"
                                className="password-toggle"
                                aria-label={revealedFields.opsMailPassword ? "앱 비밀번호 숨기기" : "앱 비밀번호 보기"}
                                onClick={() => toggleRevealField("opsMailPassword")}
                              >
                                <RevealIcon open={Boolean(revealedFields.opsMailPassword)} />
                              </button>
                            </div>
                          </label>
                          <CheckboxControl
                            containerClassName="checkbox-row full"
                            checked={opsWorkspaceMailSettingsForm.testConnection}
                            label="저장 후 메일 연결 테스트 실행"
                            onChange={(event) =>
                              setOpsWorkspaceMailSettingsForm((prev) => ({
                                ...prev,
                                testConnection: event.target.checked
                              }))
                            }
                          />
                        </div>
                        <div className="button-row">
                          <button
                            onClick={() =>
                              void runAction(
                                `ops-mail-settings-${workspace.organizationId}`,
                                submitOpsWorkspaceMailSettings,
                                { reload: false }
                              )
                            }
                            disabled={busyKey !== null}
                          >
                            메일 설정 저장
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={cancelOpsWorkspaceMailSettings}
                            disabled={busyKey !== null}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    );
                  })() : null}
                  </Panel>
                ) : null}

                {activeOpsSection === "owner-security" ? (() => {
                  const workspace = ownerPasswordResetTarget
                    ? opsWorkspaces.find((item) => item.organizationId === ownerPasswordResetTarget.organizationId) ?? null
                    : null;

                  return (
                    <Panel
                      className="panel-ops-owner-security"
                      id="ops-owner-security"
                      title="owner 비밀번호 재설정"
                      subtitle="작업공간 관리에서 대상을 선택하면 해당 owner 계정의 임시 비밀번호를 저장할 수 있습니다."
                    >
                      {workspace ? (
                        <div className="helper-box-stack inline-password-reset ops-owner-reset-panel">
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
                                  placeholder={PASSWORD_POLICY_PLACEHOLDER}
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
                      ) : (
                        <div className="empty">작업공간 관리에서 owner 재설정 대상을 먼저 선택하세요.</div>
                      )}
                    </Panel>
                  );
                })() : null}

                {activeOpsSection === "agent-status" ? (
                <div className="ops-grid" id="ops-agent-status">
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
                    title="전자세금계산서 연동 운영"
                    subtitle="고객사 화면에는 보이지 않는 플랫폼 공통 운영 영역입니다."
                    actions={
                      <>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          void runAction("ops-refresh", async () => {
                            await load();
                          })
                        }
                      >
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

                ) : null}

                {activeOpsSection === "agent-status" ? (
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
                </div>
                ) : null}

                {activeOpsSection === "logs" ? (
                <div className="ops-grid" id="ops-logs">
                  <Panel className="panel-ops-logs" title="최근 운영 로그">
                    <div className="ops-list">
                      {opsLogs.length > 0 ? (
                        opsLogs.slice(0, 12).map((log) => {
                          const popbillDiagnostic = getOpsPopbillJoinDiagnostic(log);
                          return (
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
                              {popbillDiagnostic ? (
                                <div className="ops-log-diagnostic">
                                  <strong>{popbillDiagnostic.title}</strong>
                                  <dl>
                                    {popbillDiagnostic.rows.map((row) => (
                                      <div key={row.label}>
                                        <dt>{row.label}</dt>
                                        <dd>{row.value}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                </div>
                              ) : null}
                              <div className="ops-card-meta">
                                <span>{formatDateTime(log.createdAt)}</span>
                                <span>{log.contextJson || "-"}</span>
                              </div>
                            </article>
                          );
                        })
                      ) : (
                        <div className="empty">표시할 운영 로그가 없습니다.</div>
                      )}
                    </div>
                  </Panel>
                </div>
                ) : null}

                {activeOpsSection === "account-security" ? (
                  <div id="ops-account-security">
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
                  </div>
                ) : null}
              </div>
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
