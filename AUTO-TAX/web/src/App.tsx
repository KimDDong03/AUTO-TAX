import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api, setActiveOrganizationId } from "./api";
import { AppDialog, type AppDialogState, type AppDialogTone, Icon, Panel, RevealIcon, SetupPanel, StatCard } from "./components/ui";
import { CustomersTab } from "./features/customers/CustomersTab";
import { InitialRegistrationTab } from "./features/initial-registration/InitialRegistrationTab";
import { SettingsTab } from "./features/settings/SettingsTab";
import { supabase } from "./supabase";
import type {
  AppSettings,
  BootstrapPayload,
  CompletedBillingMonth,
  Customer,
  CustomerImportProfile,
  InvoiceDraft,
  LogEntry,
  OrganizationMemberSummary,
  OpsWorkspaceCreateResponse,
  OpsWorkspaceLimitUpdateResponse,
  OpsWorkspaceSummary,
  PartnerPointsPayload,
  RenewalAutomationPayload
} from "./types";

type TabId = "work" | "customers" | "initial" | "settings" | "ops";
type SettingsSectionId = "gmail" | "popbill" | "account";
type CustomerDetailTabId = "info" | "history";
type MailProvider = "gmail" | "naver" | "daum";
type RenewalAgentSnapshot = RenewalAutomationPayload["agent"];
type RenewalAgentCertificate = RenewalAgentSnapshot["bridge"]["storageProbe"]["certificates"][number];
type RenewalJob = RenewalAutomationPayload["jobs"][number];
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
  return value === "customers" || value === "initial" || value === "settings" || value === "work" || value === "ops" ? value : null;
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
    form.bizType === "" &&
    form.bizClass === "" &&
    form.issueMode === "review" &&
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
    schedulerEnabled: settings.schedulerEnabled
  };
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
      label: "발행 준비 필요",
      tone: "danger",
      reason: "팝빌 가입 필요"
    };
  }

  if (!customer.popbillCertRegistered) {
    return {
      canIssueNow: false,
      label: "발행 준비 필요",
      tone: "danger",
      reason: "인증서 등록 필요"
    };
  }

  if (days !== null && days < 0) {
    return {
      canIssueNow: false,
      label: "발행 준비 필요",
      tone: "danger",
      reason: "인증서 만료"
    };
  }

  if (days !== null && days <= 30) {
    return {
      canIssueNow: true,
      label: "즉시 발행 가능",
      tone: "warn",
      reason: `인증서 만료 ${days}일 전`
    };
  }

  return {
    canIssueNow: true,
    label: "즉시 발행 가능",
    tone: "success",
    reason: "발행 조건 충족"
  };
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
    return `${label} · ${branchText}${externalFlowText ? ` · ${externalFlowText}` : ""}${urlText ? ` · ${urlText}` : ""}`;
  }

  return `${label} · ${preflightProbe.error ?? preflightProbe.message ?? "분석 실패"}`;
}

function formatRenewalPathCell(
  certificate: RenewalAgentCertificate,
  agent: RenewalAgentSnapshot
): string {
  const preflightProbe = agent.bridge.preflightProbe;
  if (preflightProbe.certificateIndex !== certificate.index) {
    return "-";
  }

  if (!preflightProbe.ok) {
    return preflightProbe.error ?? preflightProbe.message ?? "분석 실패";
  }

  if (preflightProbe.branch === "change-company" && preflightProbe.externalFlowKind === "apply-form") {
    return `순정 갱신 아님 · ${preflightProbe.issueCompany ?? "-"} · ${preflightProbe.externalFlowProductName ?? "외부 신규신청"}`;
  }

  if (preflightProbe.branch === "renew-payment") {
    return "순정 갱신 · 결제 단계";
  }

  if (preflightProbe.branch === "password-confirm") {
    return "순정 갱신 · 발급 직전";
  }

  if (preflightProbe.branch === "renew-info") {
    return "순정 갱신 · 신청정보 입력";
  }

  return preflightProbe.nextUrl ?? preflightProbe.branch;
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
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    return getTabFromHash(hash) ?? "work";
  });
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormDefaults());
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerListFilter, setCustomerListFilter] = useState<"all" | "blocked">("all");
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
  const [quickRegisterForm, setQuickRegisterForm] = useState<QuickRegisterFormState>(createQuickRegisterForm());
  const [quickRegisterNotice, setQuickRegisterNotice] = useState("");
  const [quickRegisterError, setQuickRegisterError] = useState("");
  const [completedBillingNotice, setCompletedBillingNotice] = useState("");
  const [customerCertNotice, setCustomerCertNotice] = useState("");
  const [pendingCertSyncCustomerId, setPendingCertSyncCustomerId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});
  const settingsAutosaveBaselineRef = useRef("");
  const appDialogResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const customerAddressLookupRef = useRef("");
  const customerNameInputRef = useRef<HTMLInputElement | null>(null);
  const certSyncInFlightRef = useRef(false);
  const authSessionRef = useRef<Session | null>(null);
  const activeLoadTokenRef = useRef(0);
  const publicManagedCustomerCount = normalizeManagedCustomerCount(managedCustomerCountInput);
  const publicPricing = calculatePublicPrice(pricingPlanId, publicManagedCustomerCount);
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
    const [nextImportProfile, nextCompletedBillingMonths] = payload.auth.activeOrganizationId
      ? await Promise.all([
          api<{ profile: CustomerImportProfile | null }>("/api/customer-import/profile").then((response) => response.profile),
          api<{ months: CompletedBillingMonth[] }>("/api/completed-billing-months").then((response) => response.months)
        ])
      : [null, []];
    ensureActiveLoad(loadToken);
    setError("");
    setActiveOrganizationId(payload.auth.activeOrganizationId);
    const nextSettingsForm = settingsToForm(payload.settings);
    setData(payload);
    setOpsConsole(nextOpsConsole);
    setCustomerImportProfile(nextImportProfile);
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

    void supabase.auth.getSession().then(({ data: next }) => {
      if (!mounted) return;
      authSessionRef.current = next.session;
      setAuthSession(next.session);
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
        setActiveTab(nextTab);
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
    if (data && !data.auth.isPlatformAdmin && activeTab === "ops") {
      setActiveTab("work");
    }
  }, [activeTab, data]);

  useEffect(() => {
    if (data?.auth.isPlatformAdmin && data.auth.organizations.length === 0 && activeTab !== "ops") {
      setActiveTab("ops");
    }
  }, [activeTab, data]);

  useEffect(() => {
    if (!data || activeTab !== "customers" || creatingCustomer) return;
    const normalizedSearch = customerSearchQuery.trim().toLocaleLowerCase("ko-KR");
    const visibleCustomers = data.customers.filter((customer) => {
      const matchesFilter = customerListFilter === "blocked" ? !getCustomerIssueReadiness(customer).canIssueNow : true;
      const matchesSearch =
        normalizedSearch === "" ||
        customer.customerName.toLocaleLowerCase("ko-KR").includes(normalizedSearch) ||
        customer.corpName.toLocaleLowerCase("ko-KR").includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    });

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
    if (!data || activeTab !== "initial") return;

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
    setPendingCertSyncCustomerId(null);
  }, [creatingCustomer, customerForm.id]);

  useEffect(() => {
    if (activeTab !== "customers" || pendingCertSyncCustomerId === null) {
      return;
    }

    let disposed = false;
    const tryRefreshCertificateStatus = async () => {
      if (disposed || certSyncInFlightRef.current) {
        return;
      }

      certSyncInFlightRef.current = true;
      try {
        await api(`/api/customers/${pendingCertSyncCustomerId}/popbill/cert-status`, {
          method: "POST"
        });
        await load();
        if (!disposed) {
          setCustomerCertNotice("인증서 상태를 자동으로 다시 확인했습니다.");
        }
      } catch {
        if (!disposed) {
          setCustomerCertNotice("인증서 등록 후 상태를 아직 확인하지 못했습니다. 완료 후 다시 이 화면으로 돌아오거나 만료일 확인을 눌러주세요.");
        }
      } finally {
        certSyncInFlightRef.current = false;
        if (!disposed) {
          setPendingCertSyncCustomerId(null);
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
  }, [activeTab, pendingCertSyncCustomerId]);

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
      memo: customerForm.memo,
      plantNames: [],
      matchAddresses: normalizedAddress ? [normalizedAddress] : []
    };

    if (customerForm.id) {
      await api(`/api/customers/${customerForm.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await api("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    if (isEditing) {
      setCreatingCustomer(false);
      return;
    }

    setCreatingCustomer(true);
    setCustomerForm(createCustomerFormDefaults());
    setCustomerAddressResolveMessage("");
    customerAddressLookupRef.current = "";
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

  const selectQuickRegisterMessage = (messageId: number) => {
    const message = quickRegisterMessages.find((item) => item.id === messageId) ?? null;
    setQuickRegisterForm(createQuickRegisterForm(message));
    setQuickRegisterNotice("");
    setQuickRegisterError("");
  };

  const submitQuickRegister = async () => {
    if (!quickRegisterForm.messageId) {
      setQuickRegisterError("등록할 미매칭 메일을 선택하세요.");
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
        operatorContactTel: data.settings.operatorContactTel
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
      payload.mailPollMinutes <= 1440
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
      const savedSettings = await api<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      applySavedSettings(savedSettings, {
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
    const result = await api<{ id: number }>("/api/automation/renewal-jobs/preflight", {
      method: "POST",
      body: JSON.stringify({
        certificateIndex: Number(certificate.index),
        certificateCn: certificate.cn || null
      })
    });

    await showAppAlert(
      `갱신 경로 분석 작업을 큐에 추가했습니다.\n작업번호: ${result.id}\n로컬 에이전트에 인증서 비밀번호 환경변수가 지정되어 있어야 실제 분석됩니다.`,
      {
        title: "갱신 경로 분석 작업 추가",
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
  const reviewDrafts = data.drafts.filter((draft) => draft.status === "review" || draft.status === "failed" || draft.status === "issuing");
  const issuedDrafts = data.drafts.filter((draft) => draft.status === "issued");
  const expiredCertCustomers = data.customers.filter((customer) => {
    const days = getDaysUntilDate(customer.popbillCertExpireDate);
    return days !== null && days < 0;
  });
  const expiringSoonCustomers = data.customers.filter((customer) => {
    const days = getDaysUntilDate(customer.popbillCertExpireDate);
    return days !== null && days >= 0 && days <= 30;
  });
  const settingsHealth = {
    mailReady: Boolean(data.settings.imapUser && data.settings.smtpUser && data.settings.mailPasswordConfigured),
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
  const readyNowCustomers = data.customers.filter((customer) => getCustomerIssueReadiness(customer).canIssueNow);
  const blockedIssueCustomers = data.customers.filter((customer) => !getCustomerIssueReadiness(customer).canIssueNow);
  const normalizedCustomerSearch = customerSearchQuery.trim().toLocaleLowerCase("ko-KR");
  const filteredCustomers = (customerListFilter === "blocked" ? blockedIssueCustomers : data.customers).filter((customer) =>
    normalizedCustomerSearch === "" ||
    customer.customerName.toLocaleLowerCase("ko-KR").includes(normalizedCustomerSearch) ||
    customer.corpName.toLocaleLowerCase("ko-KR").includes(normalizedCustomerSearch)
  );
  const customerImportHeaderCandidates = customerImportFile
    ? customerImportFile.rows.slice(0, Math.min(customerImportFile.rows.length, 5)).map((row, index) => ({
        index,
        preview: row.slice(0, 4).join(" | ") || `빈 행 ${index + 1}`
      }))
    : [];
  const selectedQuickRegisterMessage = quickRegisterForm.messageId
    ? quickRegisterMessages.find((message) => message.id === quickRegisterForm.messageId) ?? null
    : null;
  const workLayoutClassName = "work-layout";
  const selectedCustomer = customerForm.id ? data.customers.find((customer) => customer.id === customerForm.id) ?? null : null;
  const selectedCustomerReadiness = selectedCustomer ? getCustomerIssueReadiness(selectedCustomer) : null;
  const selectedCustomerIssuedDrafts = selectedCustomer
    ? data.drafts
      .filter((draft) => draft.customerId === selectedCustomer.id && draft.status === "issued")
      .sort((left, right) => {
        const rightTime = right.issuedAt ? new Date(right.issuedAt).getTime() : 0;
        const leftTime = left.issuedAt ? new Date(left.issuedAt).getTime() : 0;
        return rightTime - leftTime || right.id - left.id;
      })
    : [];
  const customerRegistrationReady = data.customers.length > 0;
  const blockedCustomerCount = data.customers.filter((customer) => !getCustomerIssueReadiness(customer).canIssueNow).length;
  const setupChecklist = [
    { key: "gmail", label: "메일 계정 연결", done: settingsHealth.mailReady },
    { key: "popbill", label: "팝빌 연결 준비", done: settingsHealth.popbillReady },
    { key: "operator", label: "운영 정보 준비", done: settingsHealth.operatorReady },
    { key: "customer", label: "고객 1명 이상 등록", done: customerRegistrationReady }
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
  const isCreatingWorkspace = busyKey === "ops-create-workspace";
  const isSavingCustomer =
    busyKey === "save-customer" ||
    busyKey === "save-customer-top" ||
    (customerForm.id !== null && busyKey === `save-customer-${customerForm.id}`);
  const isQuickRegistering = busyKey === "quick-register-unmatched";
  const partnerTaxInvoiceUnitCost = opsConsole?.partnerPoints.taxInvoiceUnitCost ?? null;
  const opsPartnerIsTest = opsConsole?.partnerPoints.isTest ?? false;
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
  const workNoticeTokens = [
    ...(setupPendingCount > 0 ? [`설정 ${setupPendingCount}개 필요`] : []),
    ...(expiredCertCustomers.length > 0 ? [`만료 ${expiredCertCustomers.length}건`] : []),
    ...(expiringSoonCustomers.length > 0 ? [`30일 이내 ${expiringSoonCustomers.length}건`] : []),
    ...(duplicateMessages.length > 0 ? [`중복 의심 ${duplicateMessages.length}건`] : [])
  ];
  const recommendedSettingsSection: SettingsSectionId = !settingsHealth.mailReady
    ? "gmail"
    : "popbill";
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
      summary: settingsHealth.mailReady ? data.settings.imapUser || "메일 연결 완료" : "메일 계정과 앱 비밀번호 입력"
    },
    {
      id: "popbill",
      step: 2,
      title: "팝빌 / 담당자",
      done: settingsHealth.popbillReady && settingsHealth.operatorReady,
      summary: settingsHealth.popbillReady && settingsHealth.operatorReady
        ? "플랫폼 키 연결 및 작업공간 운영값 준비 완료"
        : "팝빌 연결 또는 작업공간 운영값 확인 필요"
    },
    {
      id: "account",
      step: 3,
      title: "계정 보안",
      done: true,
      summary: canManageOrganizationMembers ? "로그인 비밀번호 변경 및 사용자 관리" : "로그인 비밀번호 변경"
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
  const navItems: Array<{ id: TabId; label: string; icon: string }> = [
    ...(hasActiveWorkspace
      ? [
          { id: "work" as const, label: "오늘 작업", icon: "dashboard" },
          { id: "customers" as const, label: "고객관리", icon: "group" },
          { id: "initial" as const, label: "초기 등록", icon: "initial" },
          { id: "settings" as const, label: "시스템설정", icon: "settings" }
        ]
      : []),
    ...(isPlatformAdmin ? [{ id: "ops" as const, label: "플랫폼 관리자", icon: "ops" }] : [])
  ];
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
  const openCustomerCertRegistration = async (customerId: number) => {
    const result = await api<{ url: string }>(`/api/customers/${customerId}/popbill/cert-url`, {
      method: "POST"
    });
    setCustomerCertNotice("인증서 등록 창을 열었습니다. 등록 후 이 화면으로 돌아오면 상태를 자동으로 다시 확인합니다.");
    setPendingCertSyncCustomerId(customerId);
    window.open(result.url, "_blank", "noopener,noreferrer");
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
  const activeNavLabel = navItems.find((item) => item.id === activeTab)?.label ?? "AUTO-TAX";

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">AT</span>
          <div>
            <h1>AUTO-TAX</h1>
            <p>한전 메일 기반 전자세금계산서 자동화</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={activeTab === item.id ? "nav-button active" : "nav-button"}
              onClick={() => {
                setActiveTab(item.id);
                if (item.id === "settings") {
                  setActiveSettingsSection(recommendedSettingsSection);
                }
              }}
            >
              <Icon name={item.icon} className="nav-icon" />
              <div className="nav-copy">
                <span className="nav-title">{item.label}</span>
              </div>
            </button>
          ))}
        </nav>

        <div className="sidebar-meta">
          <span>{hasActiveWorkspace ? "작업공간" : "플랫폼"}</span>
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
          <p>{currentMembership?.displayName || data.auth.email || "로그인 사용자"}</p>
          <p>{activeRoleLabel}</p>
          <button className="btn-secondary sidebar-logout" onClick={() => void signOut()} disabled={busyKey !== null}>
            로그아웃
          </button>
        </div>
      </aside>

      <main
        className={
          activeTab === "work"
            ? "content content-work"
            : activeTab === "customers"
              ? "content content-customers"
              : activeTab === "initial"
                ? "content content-customers"
              : activeTab === "settings"
                ? "content content-settings"
                : activeTab === "ops"
                  ? "content content-ops"
                : "content"
        }
      >
        <header className="hero">
          <div className="hero-main">
            <h2>{activeNavLabel}</h2>
            <div className="hero-summary">
              <span className="hero-pill">{activeWorkspaceName}</span>
              {activeTab === "ops" ? (
                <>
                  <span className="hero-pill">플랫폼 관리자 전용</span>
                  <span className="hero-pill">
                    파트너 {opsConsole?.partnerPoints.available && opsConsole.partnerPoints.partnerRemainPoint !== null ? `${formatMoney(opsConsole.partnerPoints.partnerRemainPoint)}P` : "-"}
                  </span>
                  <span className="hero-pill">로그 {opsLogs.length}건</span>
                  <span className={opsAgent?.online ? "hero-pill" : "hero-pill hero-pill-warn"}>
                    {opsAgentStatusMeta?.label ?? "에이전트 상태 확인 필요"}
                  </span>
                </>
              ) : (
                <>
                  <span className="hero-pill">팝빌 운영</span>
                  <span className="hero-pill">발행 대상 {data.counts.actionableDrafts}건</span>
                  <span className={certAttentionCount > 0 ? "hero-pill hero-pill-warn" : "hero-pill"}>인증서 주의 {certAttentionCount}건</span>
                </>
              )}
            </div>
          </div>
          <div className="hero-actions">
            <button className="btn-secondary" onClick={() => void runAction("refresh", load)} disabled={busyKey !== null}>
              <Icon name="refresh" className="button-icon" />
              새로고침
            </button>
            {hasActiveWorkspace && activeTab !== "ops" ? (
              <button onClick={() => void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })))} disabled={busyKey !== null}>
                <Icon name="sync" className="button-icon" />
                메일 즉시 동기화
              </button>
            ) : null}
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}

        {activeTab === "work" ? (
          <div className="work-screen">
            {workNoticeTokens.length > 0 ? (
              <section className="work-inline-bar">
                <div className="work-inline-copy">
                  <strong>확인 필요</strong>
                  <div className="work-inline-chips">
                    {workNoticeTokens.map((item) => (
                      <span key={item} className="chip chip-warn">{item}</span>
                    ))}
                  </div>
                </div>
                {setupPendingCount > 0 ? (
                  <button className="btn-secondary" onClick={() => setActiveTab("settings")}>설정 열기</button>
                ) : null}
              </section>
            ) : null}

            <section className="stats-grid stats-grid-compact work-stats">
              <StatCard label="발행 대상" value={reviewDrafts.length} tone={reviewDrafts.length > 0 ? "warn" : "default"} />
              <StatCard label="미매칭 메일" value={unmatchedMessages.length} tone={unmatchedMessages.length > 0 ? "warn" : "default"} />
              <StatCard label="인증서 주의" value={certAttentionCount} tone={certAttentionCount > 0 ? "error" : "default"} />
            </section>

            <div className={workLayoutClassName}>
              <Panel
                className="panel-work-queue"
                title="발행할 건"
                actions={
                  <>
                    <button onClick={() => void runAction("issue-all", issueAllReviewDrafts)}>전체 발행</button>
                  </>
                }
              >
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
                            지금 발행할 건이 없습니다.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <div className="work-side-column">
                <Panel
                  className="panel-work-status"
                title="운영 체크"
                actions={
                  <>
                    <button onClick={() => void runAction("cert-refresh-all", refreshAllCertificateStatuses)}>인증서 점검</button>
                  </>
                }
              >
                <div className="info-grid">
                    <div>
                      <span>메일</span>
                      <strong>{settingsHealth.mailReady ? "준비됨" : "설정 필요"}</strong>
                    </div>
                    <div>
                      <span>팝빌</span>
                      <strong>{settingsHealth.popbillReady ? "준비됨" : "설정 필요"}</strong>
                    </div>
                    <div>
                      <span>발행 대상</span>
                      <strong>{reviewDrafts.length}건</strong>
                    </div>
                    <div>
                      <span>인증서 주의</span>
                      <strong>{certAttentionCount}건</strong>
                    </div>
                  </div>
                  <div className="compact-status-stack">
                    <div className="history-split">
                      <section className="history-block">
                        <header className="history-block-head">
                          <div className="history-title-row">
                            <strong>최근 처리</strong>
                            <div className="history-tabs">
                              <button
                                type="button"
                                className={workFeedTab === "inbox" ? "btn-secondary active-filter" : "btn-secondary"}
                                onClick={() => setWorkFeedTab("inbox")}
                              >
                                최근 수신 메일
                              </button>
                              <button
                                type="button"
                                className={workFeedTab === "issued" ? "btn-secondary active-filter" : "btn-secondary"}
                                onClick={() => setWorkFeedTab("issued")}
                              >
                                최근 발행 완료
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
                                    <span className={`status status-${getInboxDisplayParseStatus(message)}`}>{getParseStatusLabel(getInboxDisplayParseStatus(message))}</span>
                                    {isInboxActionable(message) ? (
                                      <button className="btn-secondary" onClick={() => void runAction(`reprocess-${message.id}`, async () => void (await reprocessInboxMessage(message.id)))}>재처리</button>
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
                                    <button className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction(`draft-view-${draft.id}`, async () => void (await openDraftPopbillUrl(draft.id, "view-url")))}>보기</button>
                                    <button className="btn-danger" disabled={busyKey !== null} onClick={() => void runAction(`draft-cancel-${draft.id}`, async () => void (await cancelIssuedDraft(draft.id)))}>취소</button>
                                  </div>
                                </div>
                              ))}
                          {workFeedTab === "inbox" && recentInboxPreview.length === 0 ? <div className="empty">최근 수신 메일이 없습니다.</div> : null}
                          {workFeedTab === "issued" && recentIssuedPreview.length === 0 ? <div className="empty">최근 발행 완료 이력이 없습니다.</div> : null}
                        </div>
                      </section>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "customers" ? (
          <CustomersTab
            customers={data.customers}
            expiredCertCustomers={expiredCertCustomers}
            expiringSoonCustomers={expiringSoonCustomers}
            filteredCustomers={filteredCustomers}
            selectedCustomer={selectedCustomer}
            selectedCustomerReadiness={selectedCustomerReadiness}
            selectedCustomerIssuedDrafts={selectedCustomerIssuedDrafts}
            blockedCustomerCount={blockedCustomerCount}
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
            customerNameInputRef={customerNameInputRef}
            customerAddressLookupRef={customerAddressLookupRef}
            setCustomerSearchQuery={setCustomerSearchQuery}
            setCustomerListFilter={setCustomerListFilter}
            setCustomerDetailTab={setCustomerDetailTab}
            setCustomerForm={setCustomerForm}
            setCustomerAddressResolveMessage={setCustomerAddressResolveMessage}
            onCreateCustomer={startCreatingCustomer}
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
            getCustomerIssueReadiness={getCustomerIssueReadiness}
            getCustomerCertificateSummary={getCustomerCertificateSummary}
            getCustomerPopbillSummary={getCustomerPopbillSummary}
            getIssueModeLabel={getIssueModeLabel}
            getDraftConfirmNumber={getDraftConfirmNumber}
            formatDateTime={formatDateTime}
            formatMoney={formatMoney}
          />
        ) : null}

        {activeTab === "initial" ? (
          <InitialRegistrationTab
            customerImportFile={customerImportFile}
            customerImportRowsPayload={customerImportRowsPayload}
            customerImportHeaderCandidates={customerImportHeaderCandidates}
            customerImportHeaderRowIndex={customerImportHeaderRowIndex}
            customerImportMapping={customerImportMapping}
            customerImportHeaderOptions={customerImportHeaderOptions}
            customerImportPreview={customerImportPreview}
            customerImportNotice={customerImportNotice}
            customerImportError={customerImportError}
            canPreviewCustomerImport={canPreviewCustomerImport}
            busyKey={busyKey}
            quickRegisterMessages={quickRegisterMessages}
            quickRegisterForm={quickRegisterForm}
            selectedQuickRegisterMessage={selectedQuickRegisterMessage}
            isQuickRegistering={isQuickRegistering}
            quickRegisterNotice={quickRegisterNotice}
            quickRegisterError={quickRegisterError}
            billingMonthSummaries={billingMonthSummaries}
            completedBillingNotice={completedBillingNotice}
            setCustomerImportFile={setCustomerImportFile}
            setCustomerImportHeaderRowIndex={setCustomerImportHeaderRowIndex}
            setCustomerImportMapping={setCustomerImportMapping}
            setCustomerImportPreview={setCustomerImportPreview}
            setCustomerImportError={setCustomerImportError}
            setCustomerImportNotice={setCustomerImportNotice}
            setQuickRegisterForm={setQuickRegisterForm}
            handleCustomerImportFileChange={handleCustomerImportFileChange}
            applyCustomerImportHeaderRow={applyCustomerImportHeaderRow}
            previewCustomerImport={previewCustomerImport}
            commitCustomerImport={commitCustomerImport}
            selectQuickRegisterMessage={selectQuickRegisterMessage}
            submitQuickRegister={submitQuickRegister}
            markBillingMonthCompleted={markBillingMonthCompleted}
            runAction={runAction}
            formatDateTime={formatDateTime}
            getInboxDisplayParseStatus={getInboxDisplayParseStatus}
            getParseStatusLabel={getParseStatusLabel}
            customerImportFieldOptions={CUSTOMER_IMPORT_FIELD_OPTIONS}
            emptyCustomerImportMapping={EMPTY_CUSTOMER_IMPORT_MAPPING}
          />
        ) : null}

        {activeTab === "settings" ? (
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
            toggleRevealField={toggleRevealField}
            refreshAllCertificateStatuses={refreshAllCertificateStatuses}
            testMailSettings={testMailSettings}
            loadCurrentPopbillSharedPassword={loadCurrentPopbillSharedPassword}
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
        ) : null}

        {activeTab === "ops" ? (
          <div className="ops-layout">
            {opsConsole ? (
              <>
                <Panel
                  className="panel-ops-workspace-create"
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
                      사업자번호
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.organizationBusinessNumber}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, organizationBusinessNumber: event.target.value }))}
                        placeholder="숫자만 입력"
                      />
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
                                <span>{workspace.organizationBusinessNumber || "사업자번호 없음"}</span>
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
                              <span>경로: {opsAgent ? formatRenewalPathCell(certificate, opsAgent) : "-"}</span>
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

