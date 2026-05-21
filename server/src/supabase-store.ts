import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppSettings,
  CompletedBillingMonth,
  Customer,
  CustomerCertificate,
  CustomerCertificateInput,
  CustomerContractRenewalCompletion,
  CustomerContractRenewalDueItem,
  CustomerContractPeriod,
  CustomerContractPeriodInput,
  CustomerContractPeriodMutationResult,
  CustomerContractSummary,
  CustomerImportProfile,
  CustomerInput,
  CustomerReportDetail,
  CustomerReportDetailInput,
  CustomerReportMonth,
  CustomerReportProfile,
  DashboardPayload,
  DraftStatus,
  InboxMessage,
  InvoiceDraft,
  LogEntry,
  MailParseStatus,
  ParsedMail,
  PilotDraftTimeline,
  PilotIssuanceReport,
  PopbillEnvironment,
  PopbillState
} from "./domain.js";
import { buildPilotDraftTimeline, buildPilotIssuanceReport, buildPilotLogContext } from "./pilot-issuance.js";
import {
  createEmptyCustomerReportProfile,
  createEmptyCustomerReportMonth,
  deriveContractEndMonth,
  ensureCustomerReportDetailMonths,
  normalizeCustomerReportDetailInput
} from "./customer-report-detail.js";
import {
  buildCustomerContractRenewalDueItem,
  calculateCompletedContractRenewalPeriod,
  CustomerContractRenewalConflictError,
  getCustomerContractPeriodStatus,
  isValidYearMonth,
  normalizeCustomerContractPeriodInput,
  selectCustomerContractSummaryPeriod
} from "./customer-contract-renewals.js";
import { createSupabaseAdminClient } from "./supabase.js";
import { getRequiredServerManagedPopbillCustomerDefaults } from "./server-managed-settings.js";
import { decryptSecret, encryptSecret } from "./secret-box.js";
import type {
  AppStore,
  CertificateCheckMetadataUpdate,
  MailSyncPruneInput,
  MailSyncPruneResult,
  OrganizationIssueQuota
} from "./store-contract.js";
import {
  buildDraftMgtKey,
  buildPopbillUserId,
  digitsOnly,
  nextDraftMgtKey,
  normalizeAddress,
  normalizePlantName,
  normalizePopbillUserPrefix,
  nowIso,
  sanitizeSensitiveData,
  sanitizeSensitiveText,
  toRoadAddress
} from "./utils.js";

type Row = Record<string, unknown>;

type SupabaseStoreOptions = {
  organizationId?: string | null;
  actorUserId?: string | null;
  bootstrapOrganization?: boolean;
};

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function asJsonString(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? {});
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function buildMailboxSyncKey(imapHost: string, imapUser: string, imapMailbox: string): string {
  const host = imapHost.trim().toLowerCase();
  const user = imapUser.trim().toLowerCase();
  const mailbox = imapMailbox.trim() || "*";
  return `${host}|${user}|${mailbox}`;
}

function normalizedPlantNameMatches(left: string, right: string): boolean {
  const normalizedLeft = normalizePlantName(left);
  const normalizedRight = normalizePlantName(right);
  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  );
}

function customerMatchesParsedPlant(customer: Customer, parsedPlantName: string): boolean {
  if (!parsedPlantName.trim()) {
    return false;
  }

  return [customer.corpName, customer.customerName, ...customer.plantNames].some((name) =>
    normalizedPlantNameMatches(name, parsedPlantName)
  );
}

function buildDashboardCounts(drafts: InvoiceDraft[], inbox: InboxMessage[], customerCount: number) {
  return {
    actionableDrafts: drafts.filter((draft) => draft.status === "review" || draft.status === "failed" || draft.status === "issuing").length,
    customers: customerCount,
    reviewDrafts: drafts.filter((draft) => draft.status === "review").length,
    scheduledDrafts: drafts.filter((draft) => draft.status === "scheduled").length,
    failedDrafts: drafts.filter((draft) => draft.status === "failed").length,
    unmatchedMessages: inbox.filter((message) => message.parseStatus === "unmatched").length
  };
}

function parseDraftBillingMonth(billingMonth: string): { reportYear: number; reportMonth: number } {
  const match = /^([0-9]{4})-([0-9]{2})$/.exec((billingMonth ?? "").trim());
  if (!match) {
    throw new Error(`유효하지 않은 정산월 형식입니다: ${billingMonth}`);
  }

  const reportYear = Number(match[1]);
  const reportMonth = Number(match[2]);
  if (!Number.isInteger(reportYear) || !Number.isInteger(reportMonth) || reportMonth < 1 || reportMonth > 12) {
    throw new Error(`유효하지 않은 정산월 값입니다: ${billingMonth}`);
  }

  return { reportYear, reportMonth };
}

function parseBillingYearMonth(value: string): { reportYear: number; reportMonth: number } | null {
  const trimmed = String(value).trim();
  const strictMatch = /^([0-9]{4})-([0-9]{1,2})$/.exec(trimmed);
  if (strictMatch) {
    const reportYear = Number(strictMatch[1]);
    const reportMonth = Number(strictMatch[2]);
    if (Number.isInteger(reportMonth) && reportMonth >= 1 && reportMonth <= 12) {
      return { reportYear, reportMonth };
    }
  }

  const compactMonthMatch = /^([0-9]{4})-?([0-9]{1,2})(?:-[0-9]{1,2})?$/.exec(trimmed);
  if (compactMonthMatch) {
    const reportYear = Number(compactMonthMatch[1]);
    const reportMonth = Number(compactMonthMatch[2]);
    if (Number.isInteger(reportYear) && Number.isInteger(reportMonth) && reportMonth >= 1 && reportMonth <= 12) {
      return { reportYear, reportMonth };
    }
  }

  const compact = trimmed.replace(/\D/g, "");
  if (compact.length >= 6) {
    const candidateYear = Number(compact.slice(0, 4));
    const candidateMonth = Number(compact.slice(4, 6));
    if (Number.isInteger(candidateYear) && Number.isInteger(candidateMonth) && candidateMonth >= 1 && candidateMonth <= 12) {
      return { reportYear: candidateYear, reportMonth: candidateMonth };
    }
  }

  return null;
}

type DraftReportPeriod = {
  reportYear: number;
  reportMonth: number;
  issueDate: string | null;
};

function resolveDraftReportPeriodFromIssuedDraft(
  draft: Pick<InvoiceDraft, "billingMonth" | "issuedAt" | "writeDate" | "createdAt">
): DraftReportPeriod | null {
  let period: { reportYear: number; reportMonth: number } | null = null;
  try {
    period = parseDraftBillingMonth(draft.billingMonth);
  } catch {
    period = parseBillingYearMonth(draft.billingMonth) ??
      parseIssuedDateMonth(draft.issuedAt ?? null) ??
      parseIssuedDateMonth(draft.writeDate ?? null);
  }

  if (!period) {
    return null;
  }

  const issueDate = parseIssuedDateFromDraft(draft);
  return {
    reportYear: period.reportYear,
    reportMonth: period.reportMonth,
    issueDate
  };
}

function parseIssuedDateMonth(value: string | null | undefined): { reportYear: number; reportMonth: number } | null {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  const directMatch = /^([0-9]{4})-([0-9]{2})-[0-9]{2}$/.exec(trimmed);
  if (directMatch) {
    return { reportYear: Number(directMatch[1]), reportMonth: Number(directMatch[2]) };
  }

  const parsed = new Date(trimmed);
  if (Number.isFinite(parsed.getTime())) {
    return { reportYear: parsed.getFullYear(), reportMonth: parsed.getMonth() + 1 };
  }

  const compact = trimmed.replace(/\D/g, "");
  if (compact.length >= 6) {
    const parsedFromCompact = parseBillingYearMonth(compact.slice(0, 6));
    if (parsedFromCompact) {
      return parsedFromCompact;
    }
  }

  return null;
}

function parseIssuedDateFromDraft(draft: Pick<InvoiceDraft, "issuedAt" | "writeDate" | "createdAt">): string | null {
  if (draft.issuedAt) {
    const trimmed = String(draft.issuedAt).trim();
    const issueDate = trimmed.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
      return issueDate;
    }

    const compact = trimmed.replace(/\D/g, "");
    if (compact.length >= 8) {
      return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    }
  }

  if (draft.writeDate) {
    const trimmed = String(draft.writeDate).trim();
    if (/^\d{8}$/.test(trimmed)) {
      return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
    }
  }

  if (draft.createdAt) {
    const trimmed = String(draft.createdAt).trim();
    const issueDate = trimmed.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
      return issueDate;
    }
  }

  return null;
}

function latestTimestamp(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function getCurrentSeoulYearMonth(): { year: number; month: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  return { year, month };
}

function buildSeoulMonthRange(): { startIso: string; endIso: string } {
  const { year, month } = getCurrentSeoulYearMonth();
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    startIso: `${year}-${pad(month)}-01T00:00:00+09:00`,
    endIso: `${nextMonthYear}-${pad(nextMonth)}-01T00:00:00+09:00`
  };
}

function mapSettings(settingsRow: Row, integrationRow: Row): AppSettings {
  const settingsUpdatedAt = asString(settingsRow.updated_at, nowIso());
  const integrationUpdatedAt = asString(integrationRow.updated_at, settingsUpdatedAt);
  const imapMailbox = asString(integrationRow.imap_mailbox, "*").trim();
  return {
    id: asNumber(settingsRow.legacy_id, 1),
    imapHost: asString(integrationRow.imap_host),
    imapPort: asNumber(integrationRow.imap_port, 993),
    imapSecure: asBoolean(integrationRow.imap_secure, true),
    imapUser: asString(integrationRow.imap_user),
    imapPass: decryptSecret(asString(integrationRow.imap_pass_encrypted)),
    imapMailbox: imapMailbox.toUpperCase() === "INBOX" ? "*" : imapMailbox || "*",
    smtpHost: asString(integrationRow.smtp_host),
    smtpPort: asNumber(integrationRow.smtp_port, 465),
    smtpSecure: asBoolean(integrationRow.smtp_secure, true),
    smtpUser: asString(integrationRow.smtp_user),
    smtpPass: decryptSecret(asString(integrationRow.smtp_pass_encrypted)),
    smtpFromName: asString(integrationRow.smtp_from_name, "AUTO-TAX"),
    smtpFromEmail: asString(integrationRow.smtp_from_email),
    mailConnectionVerifiedAt: asNullableString(settingsRow.mail_connection_verified_at),
    notificationEmails: asStringArray(settingsRow.notification_emails),
    defaultIssueDay: asNumber(settingsRow.default_issue_day, 20),
    defaultIssueHour: asNumber(settingsRow.default_issue_hour, 9),
    defaultIssueMinute: asNumber(settingsRow.default_issue_minute, 0),
    mailPollMinutes: asNumber(settingsRow.mail_poll_minutes, 1440),
    mailSyncStartAt: asNullableString(settingsRow.mail_sync_start_at),
    timezone: asString(settingsRow.timezone, "Asia/Seoul"),
    popbillLinkId: asString(integrationRow.popbill_link_id),
    popbillSecretKey: decryptSecret(asString(integrationRow.popbill_secret_key_encrypted)),
    popbillIsTest: asBoolean(integrationRow.popbill_is_test, false),
    popbillPartnerCorpNum: asString(integrationRow.popbill_partner_corp_num),
    popbillUserIdPrefix: asString(integrationRow.popbill_user_id_prefix, "TEST_"),
    popbillSharedPassword: decryptSecret(asString(integrationRow.popbill_shared_password_encrypted)),
    renewalContactDepartment: asString(integrationRow.renewal_contact_department),
    renewalContactFax: asString(integrationRow.renewal_contact_fax),
    renewalCertificatePassword: "",
    renewalIssuePassword: decryptSecret(asString(integrationRow.renewal_issue_password_encrypted)),
    schedulerEnabled: asBoolean(settingsRow.scheduler_enabled, true),
    certLastCheckedAt: asNullableString(settingsRow.cert_last_checked_at),
    certAlertLastSentAt: asNullableString(settingsRow.cert_alert_last_sent_at),
    createdAt: asString(settingsRow.created_at, nowIso()),
    updatedAt: latestTimestamp(settingsUpdatedAt, integrationUpdatedAt)
  };
}

function mapCustomerImportProfile(row: Row): CustomerImportProfile {
  const rawFieldHeaderMap = row.field_header_map;
  const fieldHeaderMap =
    rawFieldHeaderMap && typeof rawFieldHeaderMap === "object"
      ? rawFieldHeaderMap as Record<"customerName" | "businessNumber" | "corpName" | "addr", string>
      : { customerName: "", businessNumber: "", corpName: "", addr: "" };

  return {
    headerRowIndex: asNumber(row.header_row_index),
    fieldHeaderMap: {
      customerName: asString(fieldHeaderMap.customerName),
      businessNumber: asString(fieldHeaderMap.businessNumber),
      corpName: asString(fieldHeaderMap.corpName),
      addr: asString(fieldHeaderMap.addr)
    },
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
  };
}

function mapCompletedBillingMonth(row: Row): CompletedBillingMonth {
  return {
    billingMonth: asString(row.billing_month),
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
  };
}

function isMissingCustomerImportProfilesTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? asString((error as { code?: unknown }).code) : "";
  const message = "message" in error ? asString((error as { message?: unknown }).message).toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("customer_import_profiles") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("relation")))
  );
}

function isMissingCompletedBillingMonthsTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? asString((error as { code?: unknown }).code) : "";
  const message = "message" in error ? asString((error as { message?: unknown }).message).toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("organization_completed_billing_months") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("relation")))
  );
}

function isMissingMailSyncCheckpointsTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? asString((error as { code?: unknown }).code) : "";
  const message = "message" in error ? asString((error as { message?: unknown }).message).toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("mail_sync_checkpoints") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("relation")))
  );
}

function isManagedCustomerOptionalColumnMissingError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? asString((error as { code?: unknown }).code) : "";
  const message = "message" in error ? asString((error as { message?: unknown }).message).toLowerCase() : "";

  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("managed_customers") &&
      message.includes(columnName) &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("column")))
  );
}

function isManagedCustomerOptionalColumnsMissingError(error: unknown): boolean {
  return (
    isManagedCustomerOptionalColumnMissingError(error, "renewal_contact_mobile") ||
    isManagedCustomerOptionalColumnMissingError(error, "issue_complete_sms_template")
  );
}

function isMissingCustomerCertificatesTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? asString((error as { code?: unknown }).code) : "";
  const message = "message" in error ? asString((error as { message?: unknown }).message).toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("customer_certificates") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("relation")))
  );
}

function isMissingCustomerContractPeriodsTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? asString((error as { code?: unknown }).code) : "";
  const message = "message" in error ? asString((error as { message?: unknown }).message).toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("customer_contract_periods") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("relation")))
  );
}

function isCustomerCertificatesPasswordColumnMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? asString((error as { code?: unknown }).code) : "";
  const message = "message" in error ? asString((error as { message?: unknown }).message).toLowerCase() : "";

  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("customer_certificates") &&
      message.includes("certificate_password_encrypted") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("column")))
  );
}

function mapCustomer(row: Row, plantNames: string[], matchAddresses: string[]): Customer {
  const customerName = asString(row.customer_name);
  return {
    id: asNumber(row.legacy_id),
    customerName,
    businessNumber: asString(row.business_number),
    corpName: asString(row.corp_name),
    ceoName: customerName || asString(row.ceo_name),
    addr: asString(row.addr),
    bizType: asString(row.biz_type),
    bizClass: asString(row.biz_class),
    popbillUserId: asString(row.popbill_user_id),
    popbillPassword: decryptSecret(asString(row.popbill_password_encrypted)),
    popbillState: asString(row.popbill_state, "pending") as PopbillState,
    popbillCertRegistered: asBoolean(row.popbill_cert_registered, false),
    popbillCertExpireDate: asNullableString(row.popbill_cert_expire_date),
    issueMode: "review",
    issueDay: row.issue_day === null ? null : asNumber(row.issue_day),
    issueHour: row.issue_hour === null ? null : asNumber(row.issue_hour),
    issueMinute: row.issue_minute === null ? null : asNumber(row.issue_minute),
    renewalContactMobile: asString(row.renewal_contact_mobile),
    issueCompleteSmsTemplate: asString(row.issue_complete_sms_template),
    memo: asString(row.memo),
    plantNames,
    matchAddresses,
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
  };
}

function mapCustomerCertificate(row: Row): CustomerCertificate {
  return {
    id: asNumber(row.legacy_id),
    customerId: asNumber(row.managed_customer_legacy_id),
    certificateKind: asString(row.certificate_kind, "unknown") as CustomerCertificate["certificateKind"],
    certificateName: asString(row.certificate_name),
    certificateUsageName: asString(row.certificate_usage_name),
    issuerName: asString(row.issuer_name),
    serial: asNullableString(row.certificate_serial),
    userDN: asNullableString(row.certificate_user_dn),
    oid: asNullableString(row.certificate_oid),
    expireDate: asNullableString(row.expire_date),
    certDirPath: asNullableString(row.cert_dir_path),
    certificatePasswordConfigured: false,
    isPrimary: asBoolean(row.is_primary, false),
    linkSource: asString(row.link_source, "manual") as CustomerCertificate["linkSource"],
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
  };
}

function mapCustomerReportProfile(row: Row, customerId: number): CustomerReportProfile {
  const contractStartMonth = asNullableString(row.contract_start_month);
  const storedContractEndMonth = asNullableString(row.contract_end_month);
  return {
    customerId,
    certificateRenewalDate: asNullableString(row.certificate_renewal_date),
    hasPersonalGeneralCertificate: asBoolean(row.has_personal_general_certificate, false),
    hasTaxInvoiceBusinessCertificate: asBoolean(row.has_tax_invoice_business_certificate, false),
    solarCapacityKw: row.solar_capacity_kw === null || row.solar_capacity_kw === undefined ? null : asNumber(row.solar_capacity_kw),
    contractStartMonth,
    contractEndMonth: isValidYearMonth(storedContractEndMonth) ? storedContractEndMonth : deriveContractEndMonth(contractStartMonth),
    otherNote: asString(row.other_note),
    createdAt: asNullableString(row.created_at),
    updatedAt: asNullableString(row.updated_at)
  };
}

function mapCustomerContractPeriod(row: Row, customerId: number): CustomerContractPeriod {
  const contractStartDate = asString(row.contract_start_date);
  const contractEndDate = asString(row.contract_end_date);
  return {
    id: asString(row.id),
    customerId,
    contractStartDate,
    contractEndDate,
    status: getCustomerContractPeriodStatus(contractStartDate, contractEndDate),
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
  };
}

function getYearMonthEndDate(yearMonth: string | null): string | null {
  if (!isValidYearMonth(yearMonth)) {
    return null;
  }

  const [yearText, monthText] = yearMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearText}-${monthText}-${String(lastDay).padStart(2, "0")}`;
}

function buildContractPeriodFromProfileRow(profileRow: Row | null, customerId: number): CustomerContractPeriod | null {
  if (!profileRow) {
    return null;
  }

  const contractStartMonth = asNullableString(profileRow.contract_start_month);
  const contractEndMonth = asNullableString(profileRow.contract_end_month) ?? deriveContractEndMonth(contractStartMonth);
  if (!isValidYearMonth(contractStartMonth) || !isValidYearMonth(contractEndMonth)) {
    return null;
  }

  const contractStartDate = `${contractStartMonth}-01`;
  const contractEndDate = getYearMonthEndDate(contractEndMonth);
  if (!contractEndDate) {
    return null;
  }

  return {
    id: `profile-${customerId}-${contractStartDate}-${contractEndDate}`,
    customerId,
    contractStartDate,
    contractEndDate,
    status: getCustomerContractPeriodStatus(contractStartDate, contractEndDate),
    createdAt: asString(profileRow.created_at, nowIso()),
    updatedAt: asString(profileRow.updated_at, nowIso())
  };
}

function mapCustomerReportMonth(row: Row): CustomerReportMonth {
  const supplyAmount = asNumber(row.supply_amount);
  const vatAmount = asNumber(row.vat_amount);
  return {
    reportYear: asNumber(row.report_year),
    reportMonth: asNumber(row.report_month),
    issueYear: row.issue_year === null || row.issue_year === undefined ? null : asNumber(row.issue_year),
    issueDate: asNullableString(row.issue_date),
    supplyAmount,
    vatAmount,
    totalAmount: supplyAmount + vatAmount,
    createdAt: asNullableString(row.created_at),
    updatedAt: asNullableString(row.updated_at)
  };
}

function mapInbox(row: Row): InboxMessage {
  return {
    id: asNumber(row.legacy_id),
    messageUid: asString(row.message_uid),
    mailbox: asString(row.mailbox, "INBOX"),
    fromAddress: asString(row.from_address),
    subject: asString(row.subject),
    receivedAt: asString(row.received_at),
    rawSource: asString(row.raw_source),
    textBody: asString(row.text_body),
    parseStatus: asString(row.parse_status, "pending") as MailParseStatus,
    parseError: asString(row.parse_error),
    parsedData: (row.parsed_data ?? null) as ParsedMail | null,
    customerId: row.managed_customer_legacy_id === null || row.managed_customer_legacy_id === undefined ? null : asNumber(row.managed_customer_legacy_id),
    draftId: row.invoice_draft_legacy_id === null || row.invoice_draft_legacy_id === undefined ? null : asNumber(row.invoice_draft_legacy_id),
    createdAt: asString(row.created_at, nowIso())
  };
}

function mapDraft(row: Row): InvoiceDraft {
  return {
    id: asNumber(row.legacy_id),
    customerId: asNumber(row.managed_customer_legacy_id),
    customerName: asString(row.customer_name),
    sourceMessageId: asNumber(row.source_message_legacy_id),
    issueMode: "review",
    status: asString(row.status, "review") as DraftStatus,
    scheduledFor: asNullableString(row.scheduled_for),
    issueRequestedAt: asNullableString(row.issue_requested_at),
    issuedAt: asNullableString(row.issued_at),
    issueError: asString(row.issue_error),
    billingMonth: asString(row.billing_month),
    writeDate: asNullableString(row.write_date),
    itemName: asString(row.item_name),
    plantName: asString(row.plant_name),
    supplyCost: asNumber(row.supply_cost),
    taxTotal: asNumber(row.tax_total),
    totalAmount: asNumber(row.total_amount),
    kepcoCorpNum: asString(row.kepco_corp_num),
    kepcoBranchId: asString(row.kepco_branch_id),
    kepcoCorpName: asString(row.kepco_corp_name),
    kepcoCeoName: asString(row.kepco_ceo_name),
    kepcoAddr: asString(row.kepco_addr),
    kepcoBizType: asString(row.kepco_biz_type),
    kepcoBizClass: asString(row.kepco_biz_class),
    popbillMgtKey: asString(row.popbill_mgt_key),
    popbillEnvironment: asNullableString(row.popbill_environment) as PopbillEnvironment | null,
    popbillResultJson: typeof row.popbill_result_json === "string" ? row.popbill_result_json : JSON.stringify(row.popbill_result_json ?? ""),
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
  };
}

function mapLog(row: Row): LogEntry {
  return {
    id: asNumber(row.legacy_id),
    level: asString(row.level, "info") as LogEntry["level"],
    scope: asString(row.scope),
    message: sanitizeSensitiveText(asString(row.message)),
    contextJson: asJsonString(sanitizeSensitiveData(row.context_json ?? {})),
    createdAt: asString(row.created_at, nowIso())
  };
}

function mapPilotLogRow(row: Row) {
  return {
    organizationId: asString(row.organization_id),
    actorUserId: asNullableString(row.actor_user_id),
    createdAt: asString(row.created_at, nowIso()),
    level: asString(row.level, "info") as LogEntry["level"],
    scope: asString(row.scope),
    message: sanitizeSensitiveText(asString(row.message)),
    contextJson: sanitizeSensitiveData(row.context_json ?? {})
  };
}

async function assertNoError<T>(label: string, promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function assertUniquePopbillUserPrefix(
  client: SupabaseClient,
  organizationId: string,
  prefix: string
): Promise<void> {
  const normalizedPrefix = normalizePopbillUserPrefix(prefix);
  if (!normalizedPrefix) {
    return;
  }

  const rows = await assertNoError(
    "연동 사용자 ID 접두어 중복 확인 실패",
    client
      .from("organization_integrations")
      .select("organization_id, popbill_user_id_prefix")
      .neq("organization_id", organizationId)
  );

  const duplicated = (rows as Row[]).find(
    (row) => normalizePopbillUserPrefix(asString(row.popbill_user_id_prefix)) === normalizedPrefix
  );

  if (duplicated) {
    throw new Error(`연동 사용자 ID 접두어 '${normalizedPrefix}'는 이미 다른 고객사에서 사용 중입니다. 다른 접두어를 입력하세요.`);
  }
}

function buildDefaultPopbillUserPrefixForOrganization(organizationId: string): string {
  const compactOrganizationId = organizationId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return normalizePopbillUserPrefix(`ORG${compactOrganizationId.slice(0, 8)}_`);
}

export class SupabaseStore implements AppStore {
  private readonly client: SupabaseClient;
  private readonly requestedOrganizationId: string | null;
  private readonly actorUserId: string | null;
  private readonly bootstrapOrganization: boolean;
  private organizationId: string | null = null;
  private initialized = false;
  private settingsRowsCache: { settingsRow: Row; integrationRow: Row } | null = null;
  private issueQuotaCache: OrganizationIssueQuota | null = null;
  private managedCustomerRowCache = new Map<number, Row | null>();
  private customerCache = new Map<number, Customer | null>();

  constructor(options: SupabaseStoreOptions = {}) {
    this.client = createSupabaseAdminClient();
    this.requestedOrganizationId = options.organizationId ?? null;
    this.actorUserId = options.actorUserId ?? null;
    this.bootstrapOrganization = options.bootstrapOrganization ?? true;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const requestedOrganizationId = this.requestedOrganizationId ?? envString("SUPABASE_ORGANIZATION_ID");
    if (requestedOrganizationId) {
      const organization = await assertNoError(
        "조직 조회 실패",
        this.client.from("organizations").select("id").eq("id", requestedOrganizationId).maybeSingle()
      );
      if (!organization) {
        throw new Error(`SUPABASE_ORGANIZATION_ID(${requestedOrganizationId})에 해당하는 조직을 찾지 못했습니다.`);
      }
      this.organizationId = asString((organization as Row).id);
    } else {
      const organizations = await assertNoError(
        "조직 목록 조회 실패",
        this.client.from("organizations").select("id").order("created_at", { ascending: true }).limit(1)
      );
      const organizationRows = organizations ?? [];
      if (organizationRows.length > 0) {
        this.organizationId = asString((organizationRows[0] as Row).id);
      } else if (this.bootstrapOrganization) {
        const created = await assertNoError(
          "기본 조직 생성 실패",
          this.client
            .from("organizations")
            .insert({
              name: envString("AUTO_TAX_ORGANIZATION_NAME") ?? "AUTO-TAX Default Workspace",
              plan_code: "free_trial",
              status: "trial",
              monthly_issue_limit: 10
            })
            .select("id")
            .single()
        );
        this.organizationId = asString((created as Row).id);
      } else {
        throw new Error("사용 가능한 조직이 없습니다.");
      }
    }

    await assertNoError(
      "조직 설정 보장 실패",
      this.client.from("organization_settings").upsert({ organization_id: this.requireOrganizationId() }, { onConflict: "organization_id" })
    );
    await assertNoError(
      "조직 연동 설정 보장 실패",
      this.client.from("organization_integrations").upsert(
        {
          organization_id: this.requireOrganizationId(),
          popbill_user_id_prefix: buildDefaultPopbillUserPrefixForOrganization(this.requireOrganizationId())
        },
        {
          onConflict: "organization_id",
          ignoreDuplicates: true
        }
      )
    );

    this.initialized = true;
  }

  private requireOrganizationId(): string {
    if (!this.organizationId) {
      throw new Error("Supabase 조직이 초기화되지 않았습니다.");
    }
    return this.organizationId;
  }

  private invalidateSettingsCache(): void {
    this.settingsRowsCache = null;
  }

  private cacheManagedCustomerRow(customerId: number, row: Row | null): void {
    this.managedCustomerRowCache.set(customerId, row);
  }

  private cacheCustomer(customer: Customer | null): void {
    if (!customer) {
      return;
    }
    this.customerCache.set(customer.id, customer);
  }

  private buildCachedCustomerFromRow(
    row: Row,
    options?: {
      customerId?: number;
      plantNames?: string[];
      matchAddresses?: string[];
    }
  ): Customer {
    const customerId = options?.customerId ?? asNumber(row.legacy_id);
    const cachedCustomer = this.customerCache.get(customerId);
    const customer = mapCustomer(
      row,
      options?.plantNames ?? cachedCustomer?.plantNames ?? [],
      options?.matchAddresses ?? cachedCustomer?.matchAddresses ?? []
    );
    this.cacheManagedCustomerRow(customer.id, row);
    this.cacheCustomer(customer);
    return customer;
  }

  private async getSettingsRows(): Promise<{ settingsRow: Row; integrationRow: Row }> {
    if (this.settingsRowsCache) {
      return this.settingsRowsCache;
    }
    await this.initialize();
    const organizationId = this.requireOrganizationId();
    const settingsRow = await assertNoError(
      "조직 설정 조회 실패",
      this.client.from("organization_settings").select("*").eq("organization_id", organizationId).single()
    );
    const integrationRow = await assertNoError(
      "조직 연동 설정 조회 실패",
      this.client.from("organization_integrations").select("*").eq("organization_id", organizationId).single()
    );
    this.settingsRowsCache = {
      settingsRow: settingsRow as Row,
      integrationRow: integrationRow as Row
    };
    return this.settingsRowsCache;
  }

  async getCurrentMonthIssuedDraftCount(): Promise<number> {
    await this.initialize();
    const { startIso, endIso } = buildSeoulMonthRange();
    const { count, error } = await this.client
      .from("invoice_drafts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", this.requireOrganizationId())
      .eq("status", "issued")
      .gte("issued_at", startIso)
      .lt("issued_at", endIso);

    if (error) {
      throw new Error(`이번 달 발행 건수 조회 실패: ${error.message}`);
    }

    return count ?? 0;
  }

  private async getIssuedDraftCount(): Promise<number> {
    await this.initialize();
    const { count, error } = await this.client
      .from("invoice_drafts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", this.requireOrganizationId())
      .eq("status", "issued");

    if (error) {
      throw new Error(`누적 발행 건수 조회 실패: ${error.message}`);
    }

    return count ?? 0;
  }

  async getOrganizationIssueQuota(): Promise<OrganizationIssueQuota> {
    if (this.issueQuotaCache) {
      return this.issueQuotaCache;
    }
    await this.initialize();
    const row = await assertNoError(
      "작업공간 발행 한도 조회 실패",
      this.client
        .from("organizations")
        .select("name, plan_code, status, monthly_issue_limit")
        .eq("id", this.requireOrganizationId())
        .single()
    );

    const [issuedDraftCount, currentMonthIssuedDraftCount] = await Promise.all([
      this.getIssuedDraftCount(),
      this.getCurrentMonthIssuedDraftCount()
    ]);
    this.issueQuotaCache = {
      organizationName: asString((row as Row).name),
      organizationPlanCode: asString((row as Row).plan_code, "free_trial"),
      organizationStatus: asString((row as Row).status, "trial") as OrganizationIssueQuota["organizationStatus"],
      monthlyIssueLimit: asNumber((row as Row).monthly_issue_limit),
      issuedDraftCount,
      currentMonthIssuedDraftCount
    };
    return this.issueQuotaCache;
  }

  async getMonthlyIssueLimit(): Promise<number | null> {
    return (await this.getOrganizationIssueQuota()).monthlyIssueLimit;
  }

  private async getManagedCustomerRowByLegacyId(customerId: number): Promise<Row | null> {
    if (this.managedCustomerRowCache.has(customerId)) {
      return this.managedCustomerRowCache.get(customerId) ?? null;
    }
    await this.initialize();
    const data = await assertNoError(
      "고객 조회 실패",
      this.client
        .from("managed_customers")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .eq("legacy_id", customerId)
        .maybeSingle()
    );
    const row = (data as Row | null) ?? null;
    this.cacheManagedCustomerRow(customerId, row);
    return row;
  }

  private async getCustomerCertificateRowByLegacyId(certificateId: number): Promise<Row | null> {
    await this.initialize();
    try {
      const data = await assertNoError(
        "공동인증서 연결 조회 실패",
        this.client
          .from("customer_certificates")
          .select("*")
          .eq("organization_id", this.requireOrganizationId())
          .eq("legacy_id", certificateId)
          .maybeSingle()
      );
      return (data as Row | null) ?? null;
    } catch (error) {
      if (isMissingCustomerCertificatesTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async getInboxRowByLegacyId(messageId: number): Promise<Row | null> {
    await this.initialize();
    const data = await assertNoError(
      "메일 조회 실패",
      this.client
        .from("inbox_messages")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .eq("legacy_id", messageId)
        .maybeSingle()
    );
    return (data as Row | null) ?? null;
  }

  private async getDraftRowByLegacyId(draftId: number): Promise<Row | null> {
    await this.initialize();
    const data = await assertNoError(
      "초안 조회 실패",
      this.client
        .from("invoice_drafts")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .eq("legacy_id", draftId)
        .maybeSingle()
    );
    return (data as Row | null) ?? null;
  }

  private async loadCustomerMaps(customerRows: Row[]): Promise<Map<string, { plantNames: string[]; matchAddresses: string[] }>> {
    const customerIds = customerRows.map((row) => asString(row.id)).filter(Boolean);
    const map = new Map<string, { plantNames: string[]; matchAddresses: string[] }>();
    if (customerIds.length === 0) {
      return map;
    }

    const [plants, addresses] = await Promise.all([
      assertNoError(
        "발전소명 조회 실패",
        this.client.from("managed_customer_plants").select("managed_customer_id, plant_name").in("managed_customer_id", customerIds).order("plant_name", { ascending: true })
      ),
      assertNoError(
        "매칭 주소 조회 실패",
        this.client.from("managed_customer_match_addresses").select("managed_customer_id, match_address").in("managed_customer_id", customerIds).order("match_address", { ascending: true })
      )
    ]);

    for (const customerId of customerIds) {
      map.set(customerId, { plantNames: [], matchAddresses: [] });
    }

    for (const row of plants as Row[]) {
      map.get(asString(row.managed_customer_id))?.plantNames.push(asString(row.plant_name));
    }
    for (const row of addresses as Row[]) {
      map.get(asString(row.managed_customer_id))?.matchAddresses.push(asString(row.match_address));
    }

    return map;
  }

  private async mapCustomerRow(row: Row): Promise<Customer> {
    const relationMap = await this.loadCustomerMaps([row]);
    const relations = relationMap.get(asString(row.id)) ?? { plantNames: [], matchAddresses: [] };
    return this.buildCachedCustomerFromRow(row, {
      plantNames: relations.plantNames,
      matchAddresses: relations.matchAddresses
    });
  }

  private async lookupLegacyId(table: "managed_customers" | "inbox_messages" | "invoice_drafts", uuid: string): Promise<number> {
    if (!uuid) return 0;
    const data = await assertNoError(
      `${table} legacy_id 조회 실패`,
      this.client.from(table).select("legacy_id").eq("id", uuid).single()
    );
    return asNumber((data as Row).legacy_id);
  }

  private async lookupCustomerName(customerUuid: string): Promise<string> {
    if (!customerUuid) return "";
    const data = await assertNoError(
      "고객명 조회 실패",
      this.client.from("managed_customers").select("customer_name").eq("id", customerUuid).single()
    );
    return asString((data as Row).customer_name);
  }

  private async lookupLegacyIdMap(
    table: "managed_customers" | "inbox_messages" | "invoice_drafts",
    uuids: string[]
  ): Promise<Map<string, number>> {
    const uniqueUuids = uniqueStrings(uuids);
    if (uniqueUuids.length === 0) {
      return new Map();
    }

    const rows = await assertNoError(
      `${table} legacy_id 목록 조회 실패`,
      this.client.from(table).select("id, legacy_id").in("id", uniqueUuids)
    );
    return new Map(((rows as Row[]) ?? []).map((row) => [asString(row.id), asNumber(row.legacy_id)]));
  }

  private async lookupCustomerDraftMetadataMap(customerUuids: string[]): Promise<Map<string, { legacyId: number; customerName: string }>> {
    const uniqueUuids = uniqueStrings(customerUuids);
    if (uniqueUuids.length === 0) {
      return new Map();
    }

    const rows = await assertNoError(
      "초안 고객 메타데이터 목록 조회 실패",
      this.client.from("managed_customers").select("id, legacy_id, customer_name").in("id", uniqueUuids)
    );
    return new Map(
      ((rows as Row[]) ?? []).map((row) => [
        asString(row.id),
        {
          legacyId: asNumber(row.legacy_id),
          customerName: asString(row.customer_name)
        }
      ])
    );
  }

  private async buildInboxPayload(row: Row): Promise<InboxMessage> {
    const customerLegacyId = row.managed_customer_id ? await this.lookupLegacyId("managed_customers", asString(row.managed_customer_id)) : null;
    const draftLegacyId = row.invoice_draft_id ? await this.lookupLegacyId("invoice_drafts", asString(row.invoice_draft_id)) : null;
    return mapInbox({
      ...row,
      managed_customer_legacy_id: customerLegacyId,
      invoice_draft_legacy_id: draftLegacyId
    });
  }

  private async buildInboxPayloads(rows: Row[]): Promise<InboxMessage[]> {
    const [customerLegacyIds, draftLegacyIds] = await Promise.all([
      this.lookupLegacyIdMap("managed_customers", rows.map((row) => asString(row.managed_customer_id))),
      this.lookupLegacyIdMap("invoice_drafts", rows.map((row) => asString(row.invoice_draft_id)))
    ]);

    return rows.map((row) =>
      mapInbox({
        ...row,
        managed_customer_legacy_id: row.managed_customer_id ? customerLegacyIds.get(asString(row.managed_customer_id)) ?? 0 : null,
        invoice_draft_legacy_id: row.invoice_draft_id ? draftLegacyIds.get(asString(row.invoice_draft_id)) ?? 0 : null
      })
    );
  }

  private async buildDraftPayload(row: Row): Promise<InvoiceDraft> {
    const [customerLegacyId, sourceMessageLegacyId, customerName] = await Promise.all([
      this.lookupLegacyId("managed_customers", asString(row.managed_customer_id)),
      row.source_message_id ? this.lookupLegacyId("inbox_messages", asString(row.source_message_id)) : Promise.resolve(0),
      this.lookupCustomerName(asString(row.managed_customer_id))
    ]);

    return mapDraft({
      ...row,
      managed_customer_legacy_id: customerLegacyId,
      source_message_legacy_id: sourceMessageLegacyId,
      customer_name: customerName
    });
  }

  private async buildDraftPayloads(rows: Row[]): Promise<InvoiceDraft[]> {
    const [customerMetadata, sourceMessageLegacyIds] = await Promise.all([
      this.lookupCustomerDraftMetadataMap(rows.map((row) => asString(row.managed_customer_id))),
      this.lookupLegacyIdMap("inbox_messages", rows.map((row) => asString(row.source_message_id)))
    ]);

    return rows.map((row) => {
      const customer = customerMetadata.get(asString(row.managed_customer_id));
      return mapDraft({
        ...row,
        managed_customer_legacy_id: customer?.legacyId ?? 0,
        source_message_legacy_id: row.source_message_id ? sourceMessageLegacyIds.get(asString(row.source_message_id)) ?? 0 : 0,
        customer_name: customer?.customerName ?? ""
      });
    });
  }

  private buildCustomerCertificatePayloadWithLegacyId(row: Row, customerLegacyId: number): CustomerCertificate {
    return mapCustomerCertificate({
      ...row,
      managed_customer_legacy_id: customerLegacyId
    });
  }

  private async buildCustomerCertificatePayload(row: Row): Promise<CustomerCertificate> {
    const customerLegacyId = await this.lookupLegacyId("managed_customers", asString(row.managed_customer_id));
    return this.buildCustomerCertificatePayloadWithLegacyId(row, customerLegacyId);
  }

  async getSettings(): Promise<AppSettings> {
    const { settingsRow, integrationRow } = await this.getSettingsRows();
    return mapSettings(settingsRow, integrationRow);
  }

  async getCustomerImportProfile(): Promise<CustomerImportProfile | null> {
    await this.initialize();
    const { data, error } = await this.client
      .from("customer_import_profiles")
      .select("*")
      .eq("organization_id", this.requireOrganizationId())
      .maybeSingle();

    if (error) {
      if (isMissingCustomerImportProfilesTableError(error)) {
        return null;
      }
      throw new Error(`초기 등록 매핑 프로필 조회 실패: ${error.message}`);
    }

    const row = data;
    return row ? mapCustomerImportProfile(row as Row) : null;
  }

  async updateCustomerImportProfile(
    input: Pick<CustomerImportProfile, "headerRowIndex" | "fieldHeaderMap">
  ): Promise<CustomerImportProfile> {
    await this.initialize();
    const { data, error } = await this.client
      .from("customer_import_profiles")
      .upsert(
        {
          organization_id: this.requireOrganizationId(),
          header_row_index: input.headerRowIndex,
          field_header_map: input.fieldHeaderMap
        },
        { onConflict: "organization_id" }
      )
      .select("*")
      .single();

    if (error) {
      if (isMissingCustomerImportProfilesTableError(error)) {
        const timestamp = nowIso();
        return {
          headerRowIndex: input.headerRowIndex,
          fieldHeaderMap: input.fieldHeaderMap,
          createdAt: timestamp,
          updatedAt: timestamp
        };
      }
      throw new Error(`초기 등록 매핑 프로필 저장 실패: ${error.message}`);
    }

    const row = data;
    return mapCustomerImportProfile(row as Row);
  }

  async listCompletedBillingMonths(): Promise<CompletedBillingMonth[]> {
    await this.initialize();
    const { data, error } = await this.client
      .from("organization_completed_billing_months")
      .select("*")
      .eq("organization_id", this.requireOrganizationId())
      .order("billing_month", { ascending: false });

    if (error) {
      if (isMissingCompletedBillingMonthsTableError(error)) {
        return [];
      }
      throw new Error(`완료 처리 월 조회 실패: ${error.message}`);
    }

    return (data ?? []).map((row) => mapCompletedBillingMonth(row as Row));
  }

  async markCompletedBillingMonth(billingMonth: string): Promise<CompletedBillingMonth> {
    await this.initialize();
    const { data, error } = await this.client
      .from("organization_completed_billing_months")
      .upsert(
        {
          organization_id: this.requireOrganizationId(),
          billing_month: billingMonth
        },
        { onConflict: "organization_id,billing_month" }
      )
      .select("*")
      .single();

    if (error) {
      if (isMissingCompletedBillingMonthsTableError(error)) {
        throw new Error("완료 처리 월 테이블이 아직 준비되지 않았습니다. 마이그레이션을 적용한 뒤 다시 시도하세요.");
      }
      throw new Error(`완료 처리 월 저장 실패: ${error.message}`);
    }

    return mapCompletedBillingMonth(data as Row);
  }

  async getMailSyncCheckpoint(mailbox: string): Promise<number | null> {
    await this.initialize();
    const normalizedMailbox = mailbox.trim();
    if (!normalizedMailbox) {
      return null;
    }

    const { data, error } = await this.client
      .from("mail_sync_checkpoints")
      .select("last_uid")
      .eq("organization_id", this.requireOrganizationId())
      .eq("mailbox", normalizedMailbox)
      .maybeSingle();

    if (error) {
      if (isMissingMailSyncCheckpointsTableError(error)) {
        return null;
      }
      throw new Error(`메일 동기화 체크포인트 조회 실패: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return asNumber((data as Row).last_uid, 0);
  }

  async updateMailSyncCheckpoint(mailbox: string, lastUid: number): Promise<void> {
    await this.initialize();
    const normalizedMailbox = mailbox.trim();
    if (!normalizedMailbox) {
      return;
    }

    const { error } = await this.client
      .from("mail_sync_checkpoints")
      .upsert(
        {
          organization_id: this.requireOrganizationId(),
          mailbox: normalizedMailbox,
          last_uid: Math.max(0, Math.trunc(lastUid)),
          updated_at: nowIso()
        },
        { onConflict: "organization_id,mailbox" }
      );

    if (error) {
      if (isMissingMailSyncCheckpointsTableError(error)) {
        return;
      }
      throw new Error(`메일 동기화 체크포인트 저장 실패: ${error.message}`);
    }
  }

  private async clearMailSyncCheckpoint(mailbox: string): Promise<void> {
    await this.initialize();
    const normalizedMailbox = mailbox.trim();
    if (!normalizedMailbox) {
      return;
    }

    const { error } = await this.client
      .from("mail_sync_checkpoints")
      .delete()
      .eq("organization_id", this.requireOrganizationId())
      .eq("mailbox", normalizedMailbox);

    if (error) {
      if (isMissingMailSyncCheckpointsTableError(error)) {
        return;
      }
      throw new Error(`메일 동기화 체크포인트 초기화 실패: ${error.message}`);
    }
  }

  async updateSettings(input: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const nextPopbillUserIdPrefix =
      input.popbillUserIdPrefix !== undefined
        ? normalizePopbillUserPrefix(input.popbillUserIdPrefix)
        : current.popbillUserIdPrefix;
    const nextImapPass = input.imapPass !== undefined ? (input.imapPass.trim() === "" ? current.imapPass : input.imapPass) : current.imapPass;
    const nextSmtpPass = input.smtpPass !== undefined ? (input.smtpPass.trim() === "" ? current.smtpPass : input.smtpPass) : current.smtpPass;
    const nextPopbillSharedPassword =
      input.popbillSharedPassword !== undefined
        ? (input.popbillSharedPassword.trim() === "" ? current.popbillSharedPassword : input.popbillSharedPassword)
        : current.popbillSharedPassword;
    const nextRenewalIssuePassword =
      input.renewalIssuePassword !== undefined
        ? (input.renewalIssuePassword.trim() === "" ? current.renewalIssuePassword : input.renewalIssuePassword)
        : current.renewalIssuePassword;
    const nextRenewalCertificatePassword = "";
    const nextMailConnectionVerifiedAt = input.mailConnectionVerifiedAt !== undefined ? input.mailConnectionVerifiedAt : current.mailConnectionVerifiedAt;
    const next: AppSettings = {
      ...current,
      ...input,
      imapPass: nextImapPass,
      smtpPass: nextSmtpPass,
      popbillUserIdPrefix: nextPopbillUserIdPrefix,
      popbillSharedPassword: nextPopbillSharedPassword,
      renewalCertificatePassword: nextRenewalCertificatePassword,
      renewalIssuePassword: nextRenewalIssuePassword,
      mailConnectionVerifiedAt: nextMailConnectionVerifiedAt,
      notificationEmails: input.notificationEmails ?? current.notificationEmails,
      updatedAt: nowIso()
    };
    const mailSettingsChanged =
      current.imapHost !== next.imapHost ||
      current.imapPort !== next.imapPort ||
      current.imapSecure !== next.imapSecure ||
      current.imapUser !== next.imapUser ||
      current.imapPass !== next.imapPass ||
      current.imapMailbox !== next.imapMailbox ||
      current.smtpHost !== next.smtpHost ||
      current.smtpPort !== next.smtpPort ||
      current.smtpSecure !== next.smtpSecure ||
      current.smtpUser !== next.smtpUser ||
      current.smtpPass !== next.smtpPass ||
      current.smtpFromName !== next.smtpFromName ||
      current.smtpFromEmail !== next.smtpFromEmail ||
      JSON.stringify(current.notificationEmails) !== JSON.stringify(next.notificationEmails);
    if (mailSettingsChanged) {
      next.mailConnectionVerifiedAt = null;
    }
    const hasMailAccountScopeChanged =
      current.imapHost !== next.imapHost ||
      current.imapMailbox !== next.imapMailbox ||
      current.imapUser !== next.imapUser;
    if (hasMailAccountScopeChanged) {
      const oldMailboxSyncKey = buildMailboxSyncKey(current.imapHost, current.imapUser, current.imapMailbox || "*");
      const newMailboxSyncKey = buildMailboxSyncKey(next.imapHost, next.imapUser, next.imapMailbox || "*");
      await this.clearMailSyncCheckpoint(oldMailboxSyncKey);
      if (newMailboxSyncKey !== oldMailboxSyncKey) {
        await this.clearMailSyncCheckpoint(newMailboxSyncKey);
      }
    }

    const organizationId = this.requireOrganizationId();

    if (
      input.popbillUserIdPrefix !== undefined &&
      next.popbillUserIdPrefix !== current.popbillUserIdPrefix
    ) {
      await assertUniquePopbillUserPrefix(this.client, organizationId, next.popbillUserIdPrefix);
    }

    await assertNoError(
      "조직 설정 저장 실패",
      this.client.from("organization_settings").upsert(
        {
          organization_id: organizationId,
          timezone: next.timezone,
          notification_emails: next.notificationEmails,
          default_issue_day: next.defaultIssueDay,
          default_issue_hour: next.defaultIssueHour,
          default_issue_minute: next.defaultIssueMinute,
          mail_poll_minutes: next.mailPollMinutes,
          mail_sync_start_at: next.mailSyncStartAt,
          mail_connection_verified_at: next.mailConnectionVerifiedAt,
          scheduler_enabled: next.schedulerEnabled,
          cert_last_checked_at: next.certLastCheckedAt,
          cert_alert_last_sent_at: next.certAlertLastSentAt
        },
        { onConflict: "organization_id" }
      )
    );

    await assertNoError(
      "조직 연동 설정 저장 실패",
      this.client.from("organization_integrations").upsert(
        {
          organization_id: organizationId,
          imap_host: next.imapHost,
          imap_port: next.imapPort,
          imap_secure: next.imapSecure,
          imap_user: next.imapUser,
          imap_pass_encrypted: encryptSecret(next.imapPass),
          imap_mailbox: next.imapMailbox,
          smtp_host: next.smtpHost,
          smtp_port: next.smtpPort,
          smtp_secure: next.smtpSecure,
          smtp_user: next.smtpUser,
          smtp_pass_encrypted: encryptSecret(next.smtpPass),
          smtp_from_name: next.smtpFromName,
          smtp_from_email: next.smtpFromEmail,
          popbill_link_id: next.popbillLinkId,
          popbill_secret_key_encrypted: encryptSecret(next.popbillSecretKey),
          popbill_is_test: next.popbillIsTest,
          popbill_partner_corp_num: next.popbillPartnerCorpNum,
          popbill_user_id_prefix: next.popbillUserIdPrefix,
          popbill_shared_password_encrypted: encryptSecret(next.popbillSharedPassword),
          renewal_contact_department: next.renewalContactDepartment,
          renewal_contact_fax: next.renewalContactFax,
          renewal_certificate_password_encrypted: "",
          renewal_issue_password_encrypted: encryptSecret(next.renewalIssuePassword)
        },
        { onConflict: "organization_id" }
      )
    );

    this.invalidateSettingsCache();
    return this.getSettings();
  }

  async updateCertificateCheckMetadata(input: CertificateCheckMetadataUpdate): Promise<void> {
    await this.initialize();
    const update: Record<string, string | null> = {};

    if (input.certLastCheckedAt !== undefined) {
      update.cert_last_checked_at = input.certLastCheckedAt;
    }
    if (input.certAlertLastSentAt !== undefined) {
      update.cert_alert_last_sent_at = input.certAlertLastSentAt;
    }
    if (Object.keys(update).length === 0) {
      return;
    }

    await assertNoError(
      "인증서 점검 메타데이터 저장 실패",
      this.client.from("organization_settings").update(update).eq("organization_id", this.requireOrganizationId())
    );
    this.invalidateSettingsCache();
  }

  async listCustomers(): Promise<Customer[]> {
    await this.initialize();
    const rows = await assertNoError(
      "고객 목록 조회 실패",
      this.client
        .from("managed_customers")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .order("customer_name", { ascending: true })
    );

    const relationMap = await this.loadCustomerMaps(rows as Row[]);
    return (rows as Row[]).map((row) => {
      const relations = relationMap.get(asString(row.id)) ?? { plantNames: [], matchAddresses: [] };
      return this.buildCachedCustomerFromRow(row, {
        plantNames: relations.plantNames,
        matchAddresses: relations.matchAddresses
      });
    });
  }

  async listCustomerCertificates(): Promise<CustomerCertificate[]> {
    await this.initialize();
    let rows: unknown;
    try {
      rows = await assertNoError(
        "공동인증서 연결 목록 조회 실패",
        this.client
          .from("customer_certificates")
          .select("*")
          .eq("organization_id", this.requireOrganizationId())
          .order("is_primary", { ascending: false })
          .order("certificate_kind", { ascending: true })
          .order("created_at", { ascending: true })
      );
    } catch (error) {
      if (isMissingCustomerCertificatesTableError(error)) {
        return [];
      }
      throw error;
    }

    const certificateRows = ((rows as Row[]) ?? []);
    const customerLegacyIds = await this.lookupLegacyIdMap(
      "managed_customers",
      certificateRows.map((row) => asString(row.managed_customer_id))
    );
    return certificateRows.map((row) =>
      this.buildCustomerCertificatePayloadWithLegacyId(row, customerLegacyIds.get(asString(row.managed_customer_id)) ?? 0)
    );
  }

  async getCustomerCertificatePassword(certificateId: number): Promise<string> {
    const row = await this.getCustomerCertificateRowByLegacyId(certificateId);
    if (!row) {
      throw new Error("공동인증서 연결을 찾지 못했습니다.");
    }

    return "";
  }

  async getCustomer(customerId: number): Promise<Customer | null> {
    if (this.customerCache.has(customerId)) {
      return this.customerCache.get(customerId) ?? null;
    }
    const row = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!row) return null;
    return this.mapCustomerRow(row);
  }

  async findCustomerByBusinessNumber(businessNumber: string): Promise<Customer | null> {
    await this.initialize();
    const normalized = digitsOnly(businessNumber);
    const row = await assertNoError(
      "사업자번호 고객 조회 실패",
      this.client
        .from("managed_customers")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .eq("business_number", normalized)
        .maybeSingle()
    );
    if (!row) return null;
    return this.mapCustomerRow(row as Row);
  }

  async findCustomerByMatchAddress(matchAddress: string): Promise<Customer | null> {
    await this.initialize();
    const normalized = normalizeAddress(matchAddress);
    if (!normalized) return null;
    const matchRow = await assertNoError(
      "매칭 주소 조회 실패",
      this.client
        .from("managed_customer_match_addresses")
        .select("managed_customer_id")
        .eq("normalized_match_address", normalized)
        .maybeSingle()
    );
    if (!matchRow) return null;

    const customerRow = await assertNoError(
      "매칭 주소 고객 조회 실패",
      this.client
        .from("managed_customers")
        .select("*")
        .eq("id", asString((matchRow as Row).managed_customer_id))
        .eq("organization_id", this.requireOrganizationId())
        .maybeSingle()
    );
    if (!customerRow) return null;
    return this.mapCustomerRow(customerRow as Row);
  }

  async addCustomerMatchAddress(customerId: number, matchAddress: string): Promise<Customer> {
    const current = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!current) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const roadAddress = toRoadAddress(matchAddress);
    const normalizedAddress = normalizeAddress(roadAddress);
    if (!normalizedAddress) {
      return this.mapCustomerRow(current);
    }

    const existingByMatchAddress = await this.findCustomerByMatchAddress(roadAddress);
    if (existingByMatchAddress) {
      if (existingByMatchAddress.id !== customerId) {
        throw new Error(`이미 다른 고객에 등록된 매칭 주소입니다. 기존 고객: ${existingByMatchAddress.customerName}`);
      }

      return existingByMatchAddress;
    }

    await assertNoError(
      "매칭 주소 저장 실패",
      this.client.from("managed_customer_match_addresses").insert({
        managed_customer_id: asString(current.id),
        match_address: roadAddress,
        normalized_match_address: normalizedAddress
      })
    );

    return this.mapCustomerRow(current);
  }

  async saveCustomer(input: CustomerInput, customerId?: number): Promise<Customer> {
    const timestamp = nowIso();
    const popbillCustomerDefaults = getRequiredServerManagedPopbillCustomerDefaults();
    const sharedPassword = popbillCustomerDefaults.popbillSharedPassword;
    const idPrefix = normalizePopbillUserPrefix(popbillCustomerDefaults.popbillUserIdPrefix);
    const normalizedBusinessNumber = digitsOnly(input.businessNumber);
    const roadAddress = toRoadAddress(input.addr);
    const existingByBusinessNumber = await this.findCustomerByBusinessNumber(normalizedBusinessNumber);
    const normalizedMatchAddresses = new Map<string, string>();
    const effectiveMatchAddresses = (input.matchAddresses.filter(Boolean).map((item) => item.trim()).filter(Boolean).length > 0
      ? input.matchAddresses
      : [roadAddress]
    )
      .map((item) => toRoadAddress(item))
      .filter(Boolean);

    if (existingByBusinessNumber && existingByBusinessNumber.id !== customerId) {
      throw new Error(`이미 등록된 사업자번호입니다. 기존 고객: ${existingByBusinessNumber.customerName}`);
    }

    for (const matchAddress of effectiveMatchAddresses) {
      const normalizedAddress = normalizeAddress(matchAddress);
      if (!normalizedAddress) continue;

      const duplicateInInput = normalizedMatchAddresses.get(normalizedAddress);
      if (duplicateInInput) {
        throw new Error(`매칭 주소가 중복되었습니다: ${matchAddress}`);
      }
      normalizedMatchAddresses.set(normalizedAddress, matchAddress);

      const existingByMatchAddress = await this.findCustomerByMatchAddress(matchAddress);
      if (existingByMatchAddress && existingByMatchAddress.id !== customerId) {
        throw new Error(`이미 다른 고객에 등록된 매칭 주소입니다. 기존 고객: ${existingByMatchAddress.customerName}`);
      }
    }

    const organizationId = this.requireOrganizationId();
    let persistedRow: Row;

    if (customerId) {
      const current = await this.getManagedCustomerRowByLegacyId(customerId);
      if (!current) {
        throw new Error("고객을 찾지 못했습니다.");
      }

      const popbillUserId = asString(current.popbill_user_id) || buildPopbillUserId(idPrefix, customerId);
      const popbillPassword = decryptSecret(asString(current.popbill_password_encrypted)) || sharedPassword;

      const updatePayload = {
        customer_name: input.customerName,
        business_number: normalizedBusinessNumber,
        corp_name: input.corpName,
        ceo_name: input.customerName,
        addr: roadAddress,
        biz_type: input.bizType,
        biz_class: input.bizClass,
        popbill_user_id: popbillUserId,
        popbill_password_encrypted: encryptSecret(popbillPassword),
          issue_mode: "review",
        issue_day: input.issueDay,
        issue_hour: input.issueHour,
        issue_minute: input.issueMinute,
        renewal_contact_mobile: input.renewalContactMobile,
        issue_complete_sms_template: input.issueCompleteSmsTemplate ?? "",
        memo: input.memo,
        updated_at: timestamp
      };

      const { data: updatedCustomerData, error: updatedCustomerError } = await this.client
        .from("managed_customers")
        .update(updatePayload)
        .eq("id", asString(current.id))
        .select("*")
        .single();

      if (updatedCustomerError) {
        if (!isManagedCustomerOptionalColumnsMissingError(updatedCustomerError)) {
          throw new Error(`고객 수정 실패: ${updatedCustomerError.message}`);
        }

        const {
          renewal_contact_mobile: _ignoredRenewalContactMobile,
          issue_complete_sms_template: _ignoredIssueCompleteSmsTemplate,
          ...fallbackUpdatePayload
        } = updatePayload;
        persistedRow = await assertNoError(
          "고객 수정 실패",
          this.client
            .from("managed_customers")
            .update(fallbackUpdatePayload)
            .eq("id", asString(current.id))
            .select("*")
            .single()
        ) as Row;
      } else {
        persistedRow = updatedCustomerData as Row;
      }

      await assertNoError(
        "기존 발전소명 삭제 실패",
        this.client.from("managed_customer_plants").delete().eq("managed_customer_id", asString(current.id))
      );
      await assertNoError(
        "기존 매칭 주소 삭제 실패",
        this.client.from("managed_customer_match_addresses").delete().eq("managed_customer_id", asString(current.id))
      );
    } else {
      const insertPayload = {
        organization_id: organizationId,
        customer_name: input.customerName,
        business_number: normalizedBusinessNumber,
        corp_name: input.corpName,
        ceo_name: input.customerName,
        addr: roadAddress,
        biz_type: input.bizType,
        biz_class: input.bizClass,
        issue_mode: "review",
        issue_day: input.issueDay,
        issue_hour: input.issueHour,
        issue_minute: input.issueMinute,
        renewal_contact_mobile: input.renewalContactMobile,
        issue_complete_sms_template: input.issueCompleteSmsTemplate ?? "",
        memo: input.memo
      };

      const { data: insertedCustomerData, error: insertedCustomerError } = await this.client
        .from("managed_customers")
        .insert(insertPayload)
        .select("*")
        .single();

      let createdRow: unknown;
      if (insertedCustomerError) {
        if (!isManagedCustomerOptionalColumnsMissingError(insertedCustomerError)) {
          throw new Error(`고객 생성 실패: ${insertedCustomerError.message}`);
        }

        const {
          renewal_contact_mobile: _ignoredRenewalContactMobile,
          issue_complete_sms_template: _ignoredIssueCompleteSmsTemplate,
          ...fallbackInsertPayload
        } = insertPayload;
        createdRow = await assertNoError(
          "고객 생성 실패",
          this.client
            .from("managed_customers")
            .insert(fallbackInsertPayload)
            .select("*")
            .single()
        );
      } else {
        createdRow = insertedCustomerData;
      }

      const created = createdRow as Row;
      const legacyId = asNumber(created.legacy_id);
      persistedRow = await assertNoError(
        "고객 발행 연동 정보 저장 실패",
        this.client
          .from("managed_customers")
          .update({
            popbill_user_id: buildPopbillUserId(idPrefix, legacyId),
            popbill_password_encrypted: encryptSecret(sharedPassword),
            updated_at: timestamp
          })
          .eq("id", asString(created.id))
          .select("*")
          .single()
      ) as Row;
    }

    const managedCustomerId = asString(persistedRow.id);
    if (effectiveMatchAddresses.length > 0) {
      await assertNoError(
        "매칭 주소 저장 실패",
        this.client.from("managed_customer_match_addresses").insert(
          effectiveMatchAddresses.map((matchAddress) => ({
            managed_customer_id: managedCustomerId,
            match_address: matchAddress.trim(),
            normalized_match_address: normalizeAddress(matchAddress)
          }))
        )
      );
    }

    return this.buildCachedCustomerFromRow(persistedRow, {
      customerId: asNumber(persistedRow.legacy_id),
      plantNames: [],
      matchAddresses: effectiveMatchAddresses
    });
  }

  async updateCustomerMemo(customerId: number, memo: string): Promise<Customer> {
    const current = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!current) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const updatedRow = await assertNoError(
      "고객 메모 저장 실패",
      this.client
        .from("managed_customers")
        .update({
          memo,
          updated_at: nowIso()
        })
        .eq("id", asString(current.id))
        .select("*")
        .single()
    ) as Row;

    const cachedCustomer = this.customerCache.get(customerId);
    return this.buildCachedCustomerFromRow(updatedRow, {
      customerId,
      plantNames: cachedCustomer?.plantNames,
      matchAddresses: cachedCustomer?.matchAddresses
    });
  }

  async getCustomerReportDetail(customerId: number, reportYear: number): Promise<CustomerReportDetail> {
    const customerRow = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const organizationId = this.requireOrganizationId();
    const managedCustomerId = asString(customerRow.id);
    const [profileRow, monthRowsResult] = await Promise.all([
      assertNoError(
        "고객 신고 상세 프로필 조회 실패",
        this.client
          .from("customer_report_profiles")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("managed_customer_id", managedCustomerId)
          .maybeSingle()
      ),
      assertNoError(
        "고객 월별 신고 이력 조회 실패",
        this.client
          .from("customer_report_months")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("managed_customer_id", managedCustomerId)
          .eq("report_year", reportYear)
          .order("report_month", { ascending: true })
      )
    ]);
    let monthRows = ((monthRowsResult as Row[]) ?? []);
    const synced = await this.synchronizeCustomerReportMonthsFromIssuedDrafts(
      organizationId,
      managedCustomerId,
      reportYear,
      monthRows
    );

    if (synced) {
      monthRows = ((await assertNoError(
        "고객 월별 신고 이력 조회 실패",
        this.client
          .from("customer_report_months")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("managed_customer_id", managedCustomerId)
          .eq("report_year", reportYear)
          .order("report_month", { ascending: true })
      )) as Row[]) ?? [];
    }

    return ensureCustomerReportDetailMonths({
      customerId,
      reportYear,
      profile: profileRow ? mapCustomerReportProfile(profileRow as Row, customerId) : createEmptyCustomerReportProfile(customerId),
      months: ((monthRows as Row[]) ?? []).map(mapCustomerReportMonth)
    });
  }

  async upsertCustomerReportDetailFromIssuedDraft(draft: InvoiceDraft): Promise<CustomerReportDetail> {
    const customerRow = await this.getManagedCustomerRowByLegacyId(draft.customerId);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const period = resolveDraftReportPeriodFromIssuedDraft(draft);
    if (!period) {
      throw new Error(`신고 월 계산에 필요한 발행 일/정산월 정보가 없습니다. billingMonth=${draft.billingMonth}, issuedAt=${draft.issuedAt}, writeDate=${draft.writeDate}`);
    }

    const { reportYear, reportMonth, issueDate } = period;
    const organizationId = this.requireOrganizationId();
    const managedCustomerId = asString(customerRow.id);

    await assertNoError(
      "고객 신고 월별 이력 동기화 실패",
      this.client.from("customer_report_months").upsert(
        {
          organization_id: organizationId,
          managed_customer_id: managedCustomerId,
          report_year: reportYear,
          report_month: reportMonth,
          issue_year: issueDate ? Number(issueDate.slice(0, 4)) : reportYear,
          issue_date: issueDate,
          supply_amount: asNumber(draft.supplyCost),
          vat_amount: asNumber(draft.taxTotal),
          updated_at: nowIso()
        },
        { onConflict: "managed_customer_id,report_year,report_month" }
      )
    );

    return this.getCustomerReportDetail(draft.customerId, reportYear);
  }

  private async synchronizeCustomerReportMonthsFromIssuedDrafts(
    organizationId: string,
    managedCustomerId: string,
    reportYear: number,
    monthRows: Row[]
  ): Promise<boolean> {
    const shouldAutoSyncMonth = (reportMonth: number): boolean => {
      const existingRow = monthRows.find((row) => asNumber(row.report_month) === reportMonth);
      if (!existingRow) {
        return true;
      }

      const existingSupplyAmount = asNumber(existingRow.supply_amount);
      const existingVatAmount = asNumber(existingRow.vat_amount);
      const existingIssueDate = asNullableString(existingRow.issue_date);
      return existingSupplyAmount === 0 && existingVatAmount === 0 && existingIssueDate === null;
    };

    const issuedDraftRows = await assertNoError(
      "고객 월별 신고 이력 보정용 발행 이력 조회 실패",
      this.client
        .from("invoice_drafts")
        .select("billing_month,issued_at,write_date,created_at,supply_cost,tax_total")
        .eq("organization_id", organizationId)
        .eq("managed_customer_id", managedCustomerId)
        .eq("status", "issued")
    );

    const monthAggregation = new Map<
      number,
      {
        issueDate: string | null;
        supplyAmount: number;
        vatAmount: number;
      }
    >();

    for (const draft of ((issuedDraftRows as Row[]) ?? [])) {
      const period = resolveDraftReportPeriodFromIssuedDraft({
        billingMonth: asString(draft.billing_month),
        issuedAt: asNullableString(draft.issued_at),
        writeDate: asNullableString(draft.write_date),
        createdAt: asString(draft.created_at)
      });

      if (!period || period.reportYear !== reportYear || !shouldAutoSyncMonth(period.reportMonth)) {
        continue;
      }

      const supplyAmount = asNumber(draft.supply_cost);
      const vatAmount = asNumber(draft.tax_total);
      const existing = monthAggregation.get(period.reportMonth);
      if (!existing) {
        monthAggregation.set(period.reportMonth, {
          issueDate: period.issueDate,
          supplyAmount,
          vatAmount
        });
        continue;
      }

      existing.supplyAmount += supplyAmount;
      existing.vatAmount += vatAmount;
      if (
        period.issueDate &&
        (!existing.issueDate || period.issueDate > existing.issueDate)
      ) {
        existing.issueDate = period.issueDate;
      }
    }

    if (monthAggregation.size === 0) {
      return false;
    }

    await assertNoError(
      "고객 신고 월별 이력 보정 동기화 실패",
      this.client.from("customer_report_months").upsert(
        [...monthAggregation.entries()].map(([reportMonth, monthAggregate]) => ({
          organization_id: organizationId,
          managed_customer_id: managedCustomerId,
          report_year: reportYear,
          report_month: reportMonth,
          issue_year: monthAggregate.issueDate ? asNumber(monthAggregate.issueDate.slice(0, 4)) : reportYear,
          issue_date: monthAggregate.issueDate,
          supply_amount: monthAggregate.supplyAmount,
          vat_amount: monthAggregate.vatAmount,
          updated_at: nowIso()
        })),
        { onConflict: "managed_customer_id,report_year,report_month" }
      )
    );

    return true;
  }

  async saveCustomerReportDetail(customerId: number, input: CustomerReportDetailInput): Promise<CustomerReportDetail> {
    const customerRow = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const normalized = normalizeCustomerReportDetailInput(input);
    const timestamp = nowIso();
    const organizationId = this.requireOrganizationId();
    const managedCustomerId = asString(customerRow.id);
    const [profileRow, monthRows] = await Promise.all([
      assertNoError(
        "고객 신고 상세 프로필 저장 실패",
        this.client
          .from("customer_report_profiles")
          .upsert(
            {
              organization_id: organizationId,
              managed_customer_id: managedCustomerId,
              certificate_renewal_date: normalized.profile.certificateRenewalDate,
              has_personal_general_certificate: normalized.profile.hasPersonalGeneralCertificate,
              has_tax_invoice_business_certificate: normalized.profile.hasTaxInvoiceBusinessCertificate,
              solar_capacity_kw: normalized.profile.solarCapacityKw,
              contract_start_month: normalized.profile.contractStartMonth,
              contract_end_month: normalized.profile.contractEndMonth,
              other_note: normalized.profile.otherNote,
              updated_at: timestamp
            },
            { onConflict: "managed_customer_id" }
          )
          .select("*")
          .single()
      ),
      assertNoError(
        "고객 월별 신고 이력 저장 실패",
        this.client
          .from("customer_report_months")
          .upsert(
            normalized.months.map((month) => ({
              organization_id: organizationId,
              managed_customer_id: managedCustomerId,
              report_year: normalized.reportYear,
              report_month: month.reportMonth,
              issue_year: month.issueYear,
              issue_date: month.issueDate,
              supply_amount: month.supplyAmount,
              vat_amount: month.vatAmount,
              updated_at: timestamp
            })),
            { onConflict: "managed_customer_id,report_year,report_month" }
          )
          .select("*")
      )
    ]);

    return ensureCustomerReportDetailMonths({
      customerId,
      reportYear: normalized.reportYear,
      profile: mapCustomerReportProfile(profileRow as Row, customerId),
      months: ((monthRows as Row[]) ?? []).map(mapCustomerReportMonth)
    });
  }

  async listCustomerContractRenewalsDue(currentYearMonth: string): Promise<CustomerContractRenewalDueItem[]> {
    await this.initialize();
    const organizationId = this.requireOrganizationId();
    const [profileRows, customerRows] = await Promise.all([
      assertNoError(
        "갱신 대상 고객 계약 프로필 조회 실패",
        this.client
          .from("customer_report_profiles")
          .select("*")
          .eq("organization_id", organizationId)
          .not("contract_start_month", "is", null)
          .order("contract_end_month", { ascending: true })
      ),
      assertNoError(
        "갱신 대상 고객 조회 실패",
        this.client
          .from("managed_customers")
          .select("*")
          .eq("organization_id", organizationId)
      )
    ]);

    const customersById = new Map((customerRows as Row[]).map((row) => [asString(row.id), row]));
    return (profileRows as Row[])
      .map((profileRow) => {
        const customerRow = customersById.get(asString(profileRow.managed_customer_id));
        if (!customerRow) {
          return null;
        }
        return buildCustomerContractRenewalDueItem(
          {
            customerId: asNumber(customerRow.legacy_id),
            customerName: asString(customerRow.customer_name),
            corpName: asString(customerRow.corp_name),
            businessNumber: asString(customerRow.business_number),
            renewalContactMobile: asString(customerRow.renewal_contact_mobile),
            contractStartMonth: asNullableString(profileRow.contract_start_month),
            contractEndMonth: asNullableString(profileRow.contract_end_month)
          },
          currentYearMonth
        );
      })
      .filter((item): item is CustomerContractRenewalDueItem => item !== null)
      .sort((left, right) =>
        left.contractEndMonth.localeCompare(right.contractEndMonth) ||
        left.corpName.localeCompare(right.corpName) ||
        left.customerName.localeCompare(right.customerName)
      );
  }

  async listCustomerContractSummaries(): Promise<CustomerContractSummary[]> {
    await this.initialize();
    const organizationId = this.requireOrganizationId();
    const [profileRows, customerRows] = await Promise.all([
      assertNoError(
        "고객 계약 요약 조회 실패",
        this.client
          .from("customer_report_profiles")
          .select("managed_customer_id, contract_start_month, contract_end_month")
          .eq("organization_id", organizationId)
      ),
      assertNoError(
        "고객 계약 요약 고객 조회 실패",
        this.client
          .from("managed_customers")
          .select("id, legacy_id")
          .eq("organization_id", organizationId)
      )
    ]);

    const customersById = new Map((customerRows as Row[]).map((row) => [asString(row.id), row]));
    return ((profileRows as Row[]) ?? [])
      .map((profileRow) => {
        const customerRow = customersById.get(asString(profileRow.managed_customer_id));
        if (!customerRow) {
          return null;
        }

        const contractStartMonth = asNullableString(profileRow.contract_start_month);
        return {
          customerId: asNumber(customerRow.legacy_id),
          contractStartMonth,
          contractEndMonth: isValidYearMonth(asNullableString(profileRow.contract_end_month))
            ? asNullableString(profileRow.contract_end_month)
            : deriveContractEndMonth(contractStartMonth)
        };
      })
      .filter((summary): summary is CustomerContractSummary => summary !== null);
  }

  async listCustomerContractPeriods(customerId: number): Promise<CustomerContractPeriod[]> {
    await this.initialize();
    const customerRow = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const organizationId = this.requireOrganizationId();
    const managedCustomerId = asString(customerRow.id);
    const profileRow = await assertNoError(
      "고객 계약 프로필 조회 실패",
      this.client
        .from("customer_report_profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("managed_customer_id", managedCustomerId)
        .maybeSingle()
    ) as Row | null;
    const profilePeriod = buildContractPeriodFromProfileRow(profileRow, customerId);

    let periodRows: Row[];
    try {
      periodRows = ((await assertNoError(
        "고객 계약 기간 상세 조회 실패",
        this.client
          .from("customer_contract_periods")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("managed_customer_id", managedCustomerId)
          .order("contract_start_date", { ascending: true })
      )) as Row[]) ?? [];
    } catch (error) {
      if (isMissingCustomerContractPeriodsTableError(error)) {
        return profilePeriod ? [profilePeriod] : [];
      }
      throw error;
    }

    const periods = periodRows.map((row) => mapCustomerContractPeriod(row, customerId));
    if (
      profilePeriod &&
      !periods.some(
        (period) =>
          period.contractStartDate === profilePeriod.contractStartDate &&
          period.contractEndDate === profilePeriod.contractEndDate
      )
    ) {
      periods.push(profilePeriod);
    }

    return periods.sort(
      (left, right) =>
        left.contractStartDate.localeCompare(right.contractStartDate) ||
        left.contractEndDate.localeCompare(right.contractEndDate)
    );
  }

  async addCustomerContractPeriod(
    customerId: number,
    input: CustomerContractPeriodInput
  ): Promise<CustomerContractPeriodMutationResult> {
    await this.initialize();
    const customerRow = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const normalized = normalizeCustomerContractPeriodInput(input);
    const organizationId = this.requireOrganizationId();
    const managedCustomerId = asString(customerRow.id);
    const timestamp = nowIso();
    let periodRow: Row;
    try {
      periodRow = await assertNoError(
        "고객 계약 기간 저장 실패",
        this.client
          .from("customer_contract_periods")
          .upsert(
            {
              organization_id: organizationId,
              managed_customer_id: managedCustomerId,
              contract_start_date: normalized.contractStartDate,
              contract_end_date: normalized.contractEndDate,
              updated_at: timestamp
            },
            { onConflict: "managed_customer_id,contract_start_date,contract_end_date" }
          )
          .select("*")
          .single()
      ) as Row;
    } catch (error) {
      if (isMissingCustomerContractPeriodsTableError(error)) {
        throw new Error("고객 계약 기간 테이블이 아직 준비되지 않았습니다. 마이그레이션을 적용한 뒤 다시 시도하세요.");
      }
      throw error;
    }

    const period = mapCustomerContractPeriod(periodRow, customerId);
    const persistedRows = await assertNoError(
      "고객 계약 기간 상세 조회 실패",
      this.client
        .from("customer_contract_periods")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("managed_customer_id", managedCustomerId)
        .order("contract_start_date", { ascending: true })
    ) as Row[];
    const periods = ((persistedRows as Row[]) ?? []).map((row) => mapCustomerContractPeriod(row, customerId));
    const summaryPeriod = selectCustomerContractSummaryPeriod(periods);
    const summary: CustomerContractSummary = {
      customerId,
      contractStartMonth: summaryPeriod?.contractStartDate.slice(0, 7) ?? null,
      contractEndMonth: summaryPeriod?.contractEndDate.slice(0, 7) ?? null
    };

    await assertNoError(
      "고객 계약 프로필 저장 실패",
      this.client
        .from("customer_report_profiles")
        .upsert(
          {
            organization_id: organizationId,
            managed_customer_id: managedCustomerId,
            contract_start_month: summary.contractStartMonth,
            contract_end_month: summary.contractEndMonth,
            updated_at: timestamp
          },
          { onConflict: "managed_customer_id" }
        )
    );

    return {
      period,
      periods,
      summary
    };
  }

  async completeCustomerContractRenewal(
    customerId: number,
    expectedContractEndMonth: string
  ): Promise<CustomerContractRenewalCompletion> {
    await this.initialize();
    const customerRow = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const organizationId = this.requireOrganizationId();
    const managedCustomerId = asString(customerRow.id);
    const profileRow = await assertNoError(
      "고객 계약 프로필 조회 실패",
      this.client
        .from("customer_report_profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("managed_customer_id", managedCustomerId)
        .maybeSingle()
    );

    if (!profileRow) {
      throw new Error("계약 기간을 계산할 수 없습니다.");
    }

    const profile = {
      ...mapCustomerReportProfile(profileRow as Row, customerId),
      contractEndMonth: asNullableString((profileRow as Row).contract_end_month)
    };
    const period = calculateCompletedContractRenewalPeriod(profile, expectedContractEndMonth);
    const timestamp = nowIso();
    const updatedRow = await assertNoError(
      "고객 계약 갱신 완료 저장 실패",
      this.client
        .from("customer_report_profiles")
        .update({
          contract_start_month: period.newContractStartMonth,
          contract_end_month: period.newContractEndMonth,
          updated_at: timestamp
        })
        .eq("organization_id", organizationId)
        .eq("managed_customer_id", managedCustomerId)
        .eq("contract_start_month", period.oldContractStartMonth)
        .eq("contract_end_month", period.oldContractEndMonth)
        .select("*")
        .maybeSingle()
    );

    if (!updatedRow) {
      throw new CustomerContractRenewalConflictError();
    }

    return {
      completed: true,
      profile: mapCustomerReportProfile(updatedRow as Row, customerId),
      oldContractStartMonth: period.oldContractStartMonth,
      oldContractEndMonth: period.oldContractEndMonth,
      newContractStartMonth: period.newContractStartMonth,
      newContractEndMonth: period.newContractEndMonth
    };
  }

  async upsertCustomerCertificate(input: CustomerCertificateInput): Promise<CustomerCertificate> {
    await this.initialize();
    const customerRow = await this.getManagedCustomerRowByLegacyId(input.customerId);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const organizationId = this.requireOrganizationId();
    const managedCustomerId = asString(customerRow.id);
    const serial = asNullableString(input.serial?.trim() ?? null);
    const userDN = asNullableString(input.userDN?.trim() ?? null);
    const certificateName = input.certificateName.trim();
    const certificateUsageName = input.certificateUsageName.trim();

    let existingRow: Row | null = null;
    try {
      if (serial) {
        const existingBySerial = await assertNoError(
          "공동인증서 연결 조회 실패",
          this.client
            .from("customer_certificates")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("certificate_serial", serial)
            .order("created_at", { ascending: false })
            .limit(1)
        );
        existingRow = (existingBySerial as Row[])[0] ?? null;
      } else if (userDN) {
        const existingByUserDn = await assertNoError(
          "공동인증서 연결 조회 실패",
          this.client
            .from("customer_certificates")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("certificate_user_dn", userDN)
            .order("created_at", { ascending: false })
            .limit(1)
        );
        existingRow = (existingByUserDn as Row[])[0] ?? null;
      } else {
        const existingByName = await assertNoError(
          "공동인증서 연결 조회 실패",
          this.client
            .from("customer_certificates")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("managed_customer_id", managedCustomerId)
            .eq("certificate_kind", input.certificateKind)
            .eq("certificate_name", certificateName)
            .order("created_at", { ascending: false })
            .limit(1)
        );
        existingRow = (existingByName as Row[])[0] ?? null;
      }
    } catch (error) {
      if (isMissingCustomerCertificatesTableError(error)) {
        throw new Error("공동인증서 연결 테이블이 아직 준비되지 않았습니다.");
      }
      throw error;
    }

    const payload = {
      organization_id: organizationId,
      managed_customer_id: managedCustomerId,
      certificate_kind: input.certificateKind,
      certificate_name: certificateName,
      certificate_usage_name: certificateUsageName,
      issuer_name: input.issuerName.trim(),
      certificate_serial: serial,
      certificate_user_dn: userDN,
      certificate_oid: asNullableString(input.oid?.trim() ?? null),
      expire_date: asNullableString(input.expireDate?.trim() ?? null),
      cert_dir_path: asNullableString(input.certDirPath?.trim() ?? null),
      certificate_password_encrypted: "",
      is_primary: input.isPrimary,
      link_source: input.linkSource,
      updated_at: nowIso()
    };

    let persistedRow: Row;
    if (existingRow) {
      const { data: updatedCertificateData, error: updatedCertificateError } = await this.client
        .from("customer_certificates")
        .update(payload)
        .eq("id", asString(existingRow.id))
        .select("*")
        .single();

      if (updatedCertificateError) {
        if (!isCustomerCertificatesPasswordColumnMissingError(updatedCertificateError)) {
          throw new Error(`공동인증서 연결 저장 실패: ${updatedCertificateError.message}`);
        }

        const { certificate_password_encrypted: _ignoredCertificatePassword, ...fallbackUpdatePayload } = payload;
        persistedRow = await assertNoError(
          "공동인증서 연결 저장 실패",
          this.client
            .from("customer_certificates")
            .update(fallbackUpdatePayload)
            .eq("id", asString(existingRow.id))
            .select("*")
            .single()
        ) as Row;
      } else {
        persistedRow = updatedCertificateData as Row;
      }
    } else {
      const { data: insertedCertificateData, error: insertedCertificateError } = await this.client
        .from("customer_certificates")
        .insert(payload)
        .select("*")
        .single();

      if (insertedCertificateError) {
        if (!isCustomerCertificatesPasswordColumnMissingError(insertedCertificateError)) {
          throw new Error(`공동인증서 연결 저장 실패: ${insertedCertificateError.message}`);
        }

        const { certificate_password_encrypted: _ignoredCertificatePassword, ...fallbackInsertPayload } = payload;
        persistedRow = await assertNoError(
          "공동인증서 연결 저장 실패",
          this.client
            .from("customer_certificates")
            .insert(fallbackInsertPayload)
            .select("*")
            .single()
        ) as Row;
      } else {
        persistedRow = insertedCertificateData as Row;
      }
    }

    if (input.isPrimary) {
      await assertNoError(
        "기본 공동인증서 상태 갱신 실패",
        this.client
          .from("customer_certificates")
          .update({
            is_primary: false,
            updated_at: nowIso()
          })
          .eq("organization_id", organizationId)
          .eq("managed_customer_id", managedCustomerId)
          .eq("certificate_kind", input.certificateKind)
          .neq("id", asString(persistedRow.id))
      );
    }

    return this.buildCustomerCertificatePayload(persistedRow);
  }

  async deleteCustomerCertificate(certificateId: number): Promise<void> {
    const row = await this.getCustomerCertificateRowByLegacyId(certificateId);
    if (!row) {
      return;
    }

    await assertNoError(
      "공동인증서 연결 삭제 실패",
      this.client.from("customer_certificates").delete().eq("id", asString(row.id))
    );
  }

  async updateCustomerTaxProfile(customerId: number, bizType: string, bizClass: string): Promise<Customer> {
    const current = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!current) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const updatedRow = await assertNoError(
      "고객 업태/업종 저장 실패",
      this.client
        .from("managed_customers")
        .update({
          biz_type: bizType.trim(),
          biz_class: bizClass.trim(),
          updated_at: nowIso()
        })
        .eq("id", asString(current.id))
        .select("*")
        .single()
    );

    return this.buildCachedCustomerFromRow(updatedRow as Row, { customerId });
  }

  async updateCustomerPopbillState(
    customerId: number,
    state: PopbillState,
    certRegistered?: boolean,
    certExpireDate?: string | null
  ): Promise<Customer> {
    const current = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!current) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const payload: Record<string, unknown> = {
      popbill_state: state,
      updated_at: nowIso()
    };
    if (certRegistered !== undefined) {
      payload.popbill_cert_registered = certRegistered;
    }
    if (certExpireDate !== undefined) {
      payload.popbill_cert_expire_date = certExpireDate;
    }

    const updatedRow = await assertNoError(
      "고객 발행 연동 상태 저장 실패",
      this.client
        .from("managed_customers")
        .update(payload)
        .eq("id", asString(current.id))
        .select("*")
        .single()
    );

    return this.buildCachedCustomerFromRow(updatedRow as Row, { customerId });
  }

  async updateCustomerPopbillUserId(customerId: number, popbillUserId: string): Promise<Customer> {
    const current = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!current) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const updatedRow = await assertNoError(
      "고객 발행 연동 ID 저장 실패",
      this.client
        .from("managed_customers")
        .update({
          popbill_user_id: popbillUserId.trim(),
          updated_at: nowIso()
        })
        .eq("id", asString(current.id))
        .select("*")
        .single()
    );

    return this.buildCachedCustomerFromRow(updatedRow as Row, { customerId });
  }

  async resetCustomerPopbill(customerId: number): Promise<Customer> {
    return this.updateCustomerPopbillState(customerId, "pending", false, null);
  }

  async deleteCustomer(customerId: number): Promise<void> {
    const current = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!current) {
      throw new Error("고객을 찾지 못했습니다.");
    }
    const managedCustomerId = asString(current.id);
    await assertNoError(
      "고객 메일 이력 삭제 실패",
      this.client.from("inbox_messages").delete().eq("managed_customer_id", managedCustomerId)
    );
    await assertNoError(
      "고객 삭제 실패",
      this.client.from("managed_customers").delete().eq("id", managedCustomerId)
    );
  }

  async getMessageByUid(messageUid: string): Promise<InboxMessage | null> {
    await this.initialize();
    const row = await assertNoError(
      "메일 UID 조회 실패",
      this.client
        .from("inbox_messages")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .eq("message_uid", messageUid)
        .maybeSingle()
    );
    if (!row) return null;
    return this.buildInboxPayload(row as Row);
  }

  async getInboxMessage(messageId: number): Promise<InboxMessage | null> {
    const row = await this.getInboxRowByLegacyId(messageId);
    if (!row) return null;
    return this.buildInboxPayload(row);
  }

  async saveInboxMessage(args: {
    messageUid: string;
    mailbox: string;
    fromAddress: string;
    subject: string;
    receivedAt: string;
    rawSource: string;
    textBody: string;
    parseStatus: MailParseStatus;
    parseError?: string;
    parsedData?: ParsedMail | null;
    customerId?: number | null;
    draftId?: number | null;
  }): Promise<InboxMessage> {
    const existing = await this.getMessageByUid(args.messageUid);
    if (existing) return existing;

    const customerRow = args.customerId ? await this.getManagedCustomerRowByLegacyId(args.customerId) : null;
    const draftRow = args.draftId ? await this.getDraftRowByLegacyId(args.draftId) : null;

    const inserted = await assertNoError(
      "메일 저장 실패",
      this.client
        .from("inbox_messages")
        .insert({
          organization_id: this.requireOrganizationId(),
          message_uid: args.messageUid,
          mailbox: args.mailbox,
          from_address: args.fromAddress,
          subject: args.subject,
          received_at: args.receivedAt,
          raw_source: args.rawSource,
          text_body: args.textBody,
          parse_status: args.parseStatus,
          parse_error: args.parseError ?? "",
          parsed_data: args.parsedData ?? null,
          managed_customer_id: customerRow ? asString(customerRow.id) : null,
          invoice_draft_id: draftRow ? asString(draftRow.id) : null
        })
        .select("*")
        .single()
    );
    return this.buildInboxPayload(inserted as Row);
  }

  async createDraft(args: {
    customer: Customer;
    sourceMessageId: number;
    status: DraftStatus;
    scheduledFor: string | null;
    parsedMail: ParsedMail;
    draftSource?: "mail-sync" | "mail-reprocess" | "other";
  }): Promise<InvoiceDraft> {
    const sourceMessageRow = await this.getInboxRowByLegacyId(args.sourceMessageId);
    if (!sourceMessageRow) {
      throw new Error("원본 메일을 찾지 못했습니다.");
    }

    const existing = await assertNoError(
      "기존 초안 조회 실패",
      this.client.from("invoice_drafts").select("*").eq("source_message_id", asString(sourceMessageRow.id)).maybeSingle()
    );
    if (existing) {
      return this.buildDraftPayload(existing as Row);
    }

    const customerRow = await this.getManagedCustomerRowByLegacyId(args.customer.id);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const mgtKey = buildDraftMgtKey(args.customer.id, args.parsedMail.billingMonth, args.sourceMessageId);
    const inserted = await assertNoError(
      "초안 저장 실패",
      this.client
        .from("invoice_drafts")
        .insert({
          organization_id: this.requireOrganizationId(),
          managed_customer_id: asString(customerRow.id),
          source_message_id: asString(sourceMessageRow.id),
          created_by: this.actorUserId,
          issue_mode: "review",
          status: args.status,
          scheduled_for: args.scheduledFor,
          billing_month: args.parsedMail.billingMonth,
          item_name: args.parsedMail.itemName,
          plant_name: args.parsedMail.plantName,
          supply_cost: args.parsedMail.supplyCost,
          tax_total: args.parsedMail.taxTotal,
          total_amount: args.parsedMail.totalAmount,
          kepco_corp_num: args.parsedMail.kepcoCorpNum,
          kepco_branch_id: args.parsedMail.kepcoBranchId,
          kepco_corp_name: args.parsedMail.kepcoCorpName,
          kepco_ceo_name: args.parsedMail.kepcoCeoName,
          kepco_addr: args.parsedMail.kepcoAddr,
          kepco_biz_type: args.parsedMail.kepcoBizType,
          kepco_biz_class: args.parsedMail.kepcoBizClass,
          popbill_mgt_key: mgtKey
        })
        .select("*")
        .single()
    );

    await assertNoError(
      "메일-초안 연결 실패",
      this.client
        .from("inbox_messages")
        .update({
          invoice_draft_id: asString((inserted as Row).id),
          managed_customer_id: asString(customerRow.id),
          parse_status: "parsed",
          parse_error: "",
          parsed_data: args.parsedMail
        })
        .eq("id", asString(sourceMessageRow.id))
    );

    const draft = await this.buildDraftPayload(inserted as Row);
    const draftContext = {
      draftId: draft.id,
      customerId: draft.customerId,
      issueMode: draft.issueMode,
      draftSource: args.draftSource ?? "other",
      sourceMessageId: draft.sourceMessageId,
      billingMonth: draft.billingMonth,
      status: draft.status
    };

    await this.createLog("info", "drafts", "초안을 생성했습니다.", buildPilotLogContext(draftContext, {
      eventType: "draft-created"
    }));

    return draft;
  }

  async createManualDraft(args: {
    customer: Customer;
    status: DraftStatus;
    writeDate: string;
    parsedMail: ParsedMail;
  }): Promise<InvoiceDraft> {
    const customerRow = await this.getManagedCustomerRowByLegacyId(args.customer.id);
    if (!customerRow) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    const mgtKey = buildDraftMgtKey(args.customer.id, args.parsedMail.billingMonth, 0);
    const inserted = await assertNoError(
      "수동 발행 초안 저장 실패",
      this.client
        .from("invoice_drafts")
        .insert({
          organization_id: this.requireOrganizationId(),
          managed_customer_id: asString(customerRow.id),
          source_message_id: null,
          created_by: this.actorUserId,
          issue_mode: "review",
          status: args.status,
          scheduled_for: null,
          billing_month: args.parsedMail.billingMonth,
          write_date: args.writeDate,
          item_name: args.parsedMail.itemName,
          plant_name: args.parsedMail.plantName,
          supply_cost: args.parsedMail.supplyCost,
          tax_total: args.parsedMail.taxTotal,
          total_amount: args.parsedMail.totalAmount,
          kepco_corp_num: args.parsedMail.kepcoCorpNum,
          kepco_branch_id: args.parsedMail.kepcoBranchId,
          kepco_corp_name: args.parsedMail.kepcoCorpName,
          kepco_ceo_name: args.parsedMail.kepcoCeoName,
          kepco_addr: args.parsedMail.kepcoAddr,
          kepco_biz_type: args.parsedMail.kepcoBizType,
          kepco_biz_class: args.parsedMail.kepcoBizClass,
          popbill_mgt_key: mgtKey
        })
        .select("*")
        .single()
    );

    const draft = await this.buildDraftPayload(inserted as Row);
    await this.createLog("info", "drafts", "수동 발행 초안을 생성했습니다.", {
      eventType: "draft-created",
      draftId: draft.id,
      customerId: draft.customerId,
      billingMonth: draft.billingMonth,
      writeDate: draft.writeDate,
      source: "manual-missing-mail"
    }).catch(() => {});
    return draft;
  }

  async findDraftByCustomerAndBillingMonth(customerId: number, billingMonth: string): Promise<InvoiceDraft | null> {
    const customerRow = await this.getManagedCustomerRowByLegacyId(customerId);
    if (!customerRow) return null;

    const row = await assertNoError(
      "고객/정산월 초안 조회 실패",
      this.client
        .from("invoice_drafts")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .eq("managed_customer_id", asString(customerRow.id))
        .eq("billing_month", billingMonth)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    if (!row) return null;
    return this.buildDraftPayload(row as Row);
  }

  async refreshDraftFromParsedMail(
    draftId: number,
    parsedMail: ParsedMail,
    options: { sourceMessageId?: number | null } = {}
  ): Promise<InvoiceDraft> {
    const draftRow = await this.getDraftRowByLegacyId(draftId);
    if (!draftRow) {
      throw new Error("초안을 찾지 못했습니다.");
    }

    const sourceMessageRow =
      options.sourceMessageId !== undefined && options.sourceMessageId !== null
        ? await this.getInboxRowByLegacyId(options.sourceMessageId)
        : null;
    if (options.sourceMessageId !== undefined && options.sourceMessageId !== null && !sourceMessageRow) {
      throw new Error("원본 메일을 찾지 못했습니다.");
    }

    const payload: Record<string, unknown> = {
      billing_month: parsedMail.billingMonth,
      item_name: parsedMail.itemName,
      plant_name: parsedMail.plantName,
      supply_cost: parsedMail.supplyCost,
      tax_total: parsedMail.taxTotal,
      total_amount: parsedMail.totalAmount,
      kepco_corp_num: parsedMail.kepcoCorpNum,
      kepco_branch_id: parsedMail.kepcoBranchId,
      kepco_corp_name: parsedMail.kepcoCorpName,
      kepco_ceo_name: parsedMail.kepcoCeoName,
      kepco_addr: parsedMail.kepcoAddr,
      kepco_biz_type: parsedMail.kepcoBizType,
      kepco_biz_class: parsedMail.kepcoBizClass,
      updated_at: nowIso()
    };

    if (options.sourceMessageId !== undefined) {
      payload.source_message_id = sourceMessageRow ? asString(sourceMessageRow.id) : null;
      payload.write_date = null;
      payload.popbill_mgt_key = buildDraftMgtKey(
        await this.lookupLegacyId("managed_customers", asString(draftRow.managed_customer_id)),
        parsedMail.billingMonth,
        options.sourceMessageId ?? 0
      );
    }

    await assertNoError(
      "초안 갱신 실패",
      this.client
        .from("invoice_drafts")
        .update(payload)
        .eq("id", asString(draftRow.id))
    );

    const draft = await this.getDraft(draftId);
    if (!draft) {
      throw new Error("초안 갱신 후 다시 읽지 못했습니다.");
    }
    return draft;
  }

  async unmatchDraftSource(draftId: number): Promise<InboxMessage> {
    const draft = await this.getDraft(draftId);
    if (!draft) {
      throw new Error("초안을 찾지 못했습니다.");
    }

    const draftRow = await this.getDraftRowByLegacyId(draftId);
    if (!draftRow) {
      throw new Error("초안을 찾지 못했습니다.");
    }

    const sourceMessage = await this.getInboxMessage(draft.sourceMessageId);
    if (!sourceMessage) {
      throw new Error("원본 메일을 찾지 못했습니다.");
    }

    if (!sourceMessage.parsedData) {
      throw new Error("원본 메일 파싱 정보를 찾지 못했습니다.");
    }

    const manualMatchAddress = await this.findManualReprocessMatchAddressForDraft(draft, draftRow, sourceMessage);
    const normalizedManualMatchAddress = manualMatchAddress ? normalizeAddress(manualMatchAddress) : "";

    const inbox = await this.updateInboxMatchResult({
      messageId: sourceMessage.id,
      parseStatus: "unmatched",
      parseError: "",
      parsedMail: sourceMessage.parsedData,
      customerId: null,
      draftId: null
    });

    if (normalizedManualMatchAddress) {
      await assertNoError(
        "수동 매칭 주소 복구 실패",
        this.client
          .from("managed_customer_match_addresses")
          .delete()
          .eq("managed_customer_id", asString(draftRow.managed_customer_id))
          .eq("normalized_match_address", normalizedManualMatchAddress)
      );
    }

    await assertNoError(
      "초안 삭제 실패",
      this.client.from("invoice_drafts").delete().eq("id", asString(draftRow.id))
    );

    return inbox;
  }

  private async findManualReprocessMatchAddressForDraft(draft: InvoiceDraft, draftRow: Row, sourceMessage: InboxMessage): Promise<string | null> {
    const rows = await this.listAppLogRows({ draftId: draft.id });
    const matchingRow = [...rows].reverse().find((row) => {
      const context = asRecord(row.context_json);
      return (
        asString(row.scope) === "mail-reprocess" &&
        context?.manualMatchAddressAdded === true
      );
    });
    const context = matchingRow ? asRecord(matchingRow.context_json) : null;
    const matchAddress = context?.manualMatchAddress;
    if (typeof matchAddress === "string" && matchAddress.trim()) {
      return matchAddress;
    }

    const legacyReprocessRow = [...rows].reverse().find((row) => {
      const legacyContext = asRecord(row.context_json);
      return (
        asString(row.scope) === "mail-reprocess" &&
        legacyContext?.draftSource === "mail-reprocess" &&
        legacyContext?.eventType === "draft-created" &&
        legacyContext?.status === "parsed" &&
        legacyContext?.manualMatchAddressAdded === undefined
      );
    });
    if (!legacyReprocessRow) {
      return null;
    }

    return this.findLegacyReprocessMatchAddressForRestore(draft, draftRow, sourceMessage);
  }

  private async findLegacyReprocessMatchAddressForRestore(
    draft: InvoiceDraft,
    draftRow: Row,
    sourceMessage: InboxMessage
  ): Promise<string | null> {
    const parsedAddress = sourceMessage.parsedData?.plantAddress?.trim() ?? "";
    const normalizedParsedAddress = normalizeAddress(parsedAddress);
    if (!parsedAddress || !normalizedParsedAddress) {
      return null;
    }

    const customer = await this.getCustomer(draft.customerId);
    if (!customer) {
      return null;
    }

    if (normalizeAddress(customer.addr) === normalizedParsedAddress) {
      return null;
    }

    const hasCurrentMatchAddress = customer.matchAddresses.some((address) => normalizeAddress(address) === normalizedParsedAddress);
    if (!hasCurrentMatchAddress || customerMatchesParsedPlant(customer, sourceMessage.parsedData?.plantName ?? "")) {
      return null;
    }

    const managedCustomerId = asString(draftRow.managed_customer_id);
    const matchAddressRow = await assertNoError(
      "매칭 주소 복구 후보 조회 실패",
      this.client
        .from("managed_customer_match_addresses")
        .select("created_at")
        .eq("managed_customer_id", managedCustomerId)
        .eq("normalized_match_address", normalizedParsedAddress)
        .maybeSingle()
    );
    if (!matchAddressRow) {
      return null;
    }

    const matchAddressCreatedAt = Date.parse(asString((matchAddressRow as Row).created_at));
    const draftCreatedAt = Date.parse(asString(draftRow.created_at));
    if (Number.isFinite(matchAddressCreatedAt) && Number.isFinite(draftCreatedAt)) {
      const ageBeforeDraftMs = draftCreatedAt - matchAddressCreatedAt;
      if (ageBeforeDraftMs < -60_000 || ageBeforeDraftMs > 10 * 60_000) {
        return null;
      }
    }

    return parsedAddress;
  }

  async updateInboxParsedData(messageId: number, parsedMail: ParsedMail): Promise<InboxMessage> {
    const messageRow = await this.getInboxRowByLegacyId(messageId);
    if (!messageRow) {
      throw new Error("메일을 찾지 못했습니다.");
    }

    await assertNoError(
      "메일 파싱 데이터 저장 실패",
      this.client
        .from("inbox_messages")
        .update({
          parsed_data: parsedMail,
          parse_status: "parsed",
          parse_error: ""
        })
        .eq("id", asString(messageRow.id))
    );

    const inbox = await this.getInboxMessage(messageId);
    if (!inbox) {
      throw new Error("메일 갱신 후 다시 읽지 못했습니다.");
    }
    return inbox;
  }

  async updateInboxMatchResult(args: {
    messageId: number;
    parseStatus: MailParseStatus;
    parseError?: string;
    parsedMail?: ParsedMail | null;
    customerId?: number | null;
    draftId?: number | null;
  }): Promise<InboxMessage> {
    const messageRow = await this.getInboxRowByLegacyId(args.messageId);
    if (!messageRow) {
      throw new Error("메일을 찾지 못했습니다.");
    }
    const customerRow = args.customerId ? await this.getManagedCustomerRowByLegacyId(args.customerId) : null;
    const draftRow = args.draftId ? await this.getDraftRowByLegacyId(args.draftId) : null;

    await assertNoError(
      "메일 매칭 결과 저장 실패",
      this.client
        .from("inbox_messages")
        .update({
          parse_status: args.parseStatus,
          parse_error: args.parseError ?? "",
          parsed_data: args.parsedMail ?? null,
          managed_customer_id: customerRow ? asString(customerRow.id) : null,
          invoice_draft_id: draftRow ? asString(draftRow.id) : null
        })
        .eq("id", asString(messageRow.id))
    );

    const inbox = await this.getInboxMessage(args.messageId);
    if (!inbox) {
      throw new Error("메일 매칭 결과 저장 후 다시 읽지 못했습니다.");
    }
    return inbox;
  }

  async getDraft(draftId: number): Promise<InvoiceDraft | null> {
    const row = await this.getDraftRowByLegacyId(draftId);
    if (!row) return null;
    return this.buildDraftPayload(row);
  }

  async listDrafts(): Promise<InvoiceDraft[]> {
    await this.initialize();
    const rows = await assertNoError(
      "초안 목록 조회 실패",
      this.client
        .from("invoice_drafts")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .order("created_at", { ascending: false })
        .limit(200)
    );
    return this.buildDraftPayloads((rows as Row[]) ?? []);
  }

  async pruneMailSyncArtifacts(input: MailSyncPruneInput): Promise<MailSyncPruneResult> {
    await this.initialize();
    const organizationId = this.requireOrganizationId();
    const activeMessageUidSet = new Set(input.activeMessageUids);
    const pageSize = 1000;
    const inboxRows: Row[] = [];

    for (let offset = 0; ; offset += pageSize) {
      const page = await assertNoError(
        "메일 동기화 정리 대상 조회 실패",
        this.client
          .from("inbox_messages")
          .select("id, message_uid, subject, invoice_draft_id")
          .eq("organization_id", organizationId)
          .gte("received_at", input.receivedAtSince)
          .lt("received_at", input.receivedAtBefore)
          .order("received_at", { ascending: false })
          .range(offset, offset + pageSize - 1)
      );
      const pageRows = (page as Row[]) ?? [];
      inboxRows.push(...pageRows);
      if (pageRows.length < pageSize) {
        break;
      }
    }

    const staleInboxRows = inboxRows.filter((row) => {
      const subject = asString(row.subject);
      const messageUid = asString(row.message_uid);
      return subject.includes(input.relevantSubject) && !activeMessageUidSet.has(messageUid);
    });
    const staleInboxIds = uniqueStrings(staleInboxRows.map((row) => asString(row.id)));
    if (staleInboxIds.length === 0) {
      return {
        deletedDrafts: 0,
        deletedInboxMessages: 0,
        keptDrafts: 0
      };
    }

    const draftRowsBySource = await assertNoError(
      "메일 동기화 정리 대상 초안 조회 실패",
      this.client
        .from("invoice_drafts")
        .select("id, status, source_message_id")
        .eq("organization_id", organizationId)
        .in("source_message_id", staleInboxIds)
    );
    const linkedDraftIds = uniqueStrings(staleInboxRows.map((row) => asString(row.invoice_draft_id)));
    const draftRowsByLinkedId = linkedDraftIds.length > 0
      ? await assertNoError(
          "메일 동기화 연결 초안 조회 실패",
          this.client
            .from("invoice_drafts")
            .select("id, status, source_message_id")
            .eq("organization_id", organizationId)
            .in("id", linkedDraftIds)
        )
      : [];

    const draftRowsById = new Map<string, Row>();
    for (const row of [...((draftRowsBySource as Row[]) ?? []), ...((draftRowsByLinkedId as Row[]) ?? [])]) {
      draftRowsById.set(asString(row.id), row);
    }

    const deletableStatusSet = new Set(input.deletableDraftStatuses);
    const deletableDraftIds: string[] = [];
    const keptDraftSourceMessageIds = new Set<string>();
    for (const row of draftRowsById.values()) {
      const draftId = asString(row.id);
      const sourceMessageId = asString(row.source_message_id);
      const status = asString(row.status) as DraftStatus;
      if (sourceMessageId && staleInboxIds.includes(sourceMessageId) && deletableStatusSet.has(status)) {
        deletableDraftIds.push(draftId);
      } else if (sourceMessageId && staleInboxIds.includes(sourceMessageId)) {
        keptDraftSourceMessageIds.add(sourceMessageId);
      }
    }

    const deletableDraftIdSet = new Set(deletableDraftIds);
    const deletableInboxIds = staleInboxRows
      .filter((row) => {
        const inboxId = asString(row.id);
        const linkedDraftId = asString(row.invoice_draft_id);
        if (keptDraftSourceMessageIds.has(inboxId)) {
          return false;
        }
        return !linkedDraftId || deletableDraftIdSet.has(linkedDraftId);
      })
      .map((row) => asString(row.id))
      .filter(Boolean);

    if (deletableDraftIds.length > 0) {
      await assertNoError(
        "메일 동기화 누락 초안 삭제 실패",
        this.client
          .from("invoice_drafts")
          .delete()
          .eq("organization_id", organizationId)
          .in("id", uniqueStrings(deletableDraftIds))
      );
    }

    if (deletableInboxIds.length > 0) {
      await assertNoError(
        "메일 동기화 누락 메일 삭제 실패",
        this.client
          .from("inbox_messages")
          .delete()
          .eq("organization_id", organizationId)
          .in("id", uniqueStrings(deletableInboxIds))
      );
    }

    return {
      deletedDrafts: uniqueStrings(deletableDraftIds).length,
      deletedInboxMessages: uniqueStrings(deletableInboxIds).length,
      keptDrafts: keptDraftSourceMessageIds.size
    };
  }

  async getIssuedMonthlyTrend(anchorBillingYear: string) {
    if (!/^\d{4}$/.test(anchorBillingYear)) {
      throw new Error("연도 형식이 올바르지 않습니다.");
    }

    await this.initialize();
    const organizationId = this.requireOrganizationId();
    const targetMonths = Array.from({ length: 12 }, (_, index) => `${anchorBillingYear}-${String(index + 1).padStart(2, "0")}`);
    const rows = await assertNoError(
      "월별 발행 현황 조회 실패",
      this.client
        .from("invoice_drafts")
        .select("billing_month")
        .eq("organization_id", organizationId)
        .eq("status", "issued")
        .gte("billing_month", `${anchorBillingYear}-01`)
        .lte("billing_month", `${anchorBillingYear}-12`)
    );
    const countsByBillingMonth = new Map<string, number>();
    for (const row of (rows as Row[]) ?? []) {
      const billingMonth = asString(row.billing_month);
      if (targetMonths.includes(billingMonth)) {
        countsByBillingMonth.set(billingMonth, (countsByBillingMonth.get(billingMonth) ?? 0) + 1);
      }
    }
    const months = targetMonths.map((billingMonth) => ({
      billingMonth,
      issuedDraftCount: countsByBillingMonth.get(billingMonth) ?? 0
    }));

    return {
      anchorBillingYear,
      months
    };
  }

  async listInbox(): Promise<InboxMessage[]> {
    await this.initialize();
    const rows = await assertNoError(
      "메일 목록 조회 실패",
      this.client
        .from("inbox_messages")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .order("received_at", { ascending: false })
        .order("legacy_id", { ascending: false })
        .limit(200)
    );
    return this.buildInboxPayloads((rows as Row[]) ?? []);
  }

  async listLogs(): Promise<LogEntry[]> {
    await this.initialize();
    const rows = await assertNoError(
      "로그 목록 조회 실패",
      this.client
        .from("app_logs")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .order("created_at", { ascending: false })
        .limit(200)
    );
    return (rows as Row[]).map(mapLog);
  }

  private async listAppLogRows(options: {
    from?: string | null;
    to?: string | null;
    draftId?: number | null;
  } = {}): Promise<Row[]> {
    await this.initialize();
    const pageSize = 500;
    const rows: Row[] = [];
    const organizationId = this.requireOrganizationId();

    for (let offset = 0; ; offset += pageSize) {
      let query = this.client
        .from("app_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (options.from) {
        query = query.gte("created_at", options.from);
      }
      if (options.to) {
        query = query.lte("created_at", options.to);
      }
      if (options.draftId !== undefined && options.draftId !== null) {
        query = query.contains("context_json", { draftId: options.draftId });
      }

      const page = await assertNoError("파일럿 로그 조회 실패", query.range(offset, offset + pageSize - 1));
      const pageRows = (page ?? []) as Row[];
      rows.push(...pageRows);
      if (pageRows.length < pageSize) {
        break;
      }
    }

    return rows;
  }

  async updateDraftStatus(
    draftId: number,
    status: DraftStatus,
    issueError = "",
    writeDate?: string | null,
    popbillResult?: unknown,
    popbillEnvironment?: PopbillEnvironment | null
  ): Promise<InvoiceDraft> {
    const draftRow = await this.getDraftRowByLegacyId(draftId);
    if (!draftRow) {
      throw new Error("초안을 찾지 못했습니다.");
    }

    const payload: Record<string, unknown> = {
      status,
      issue_error: issueError,
      updated_at: nowIso()
    };
    if (writeDate !== undefined) {
      payload.write_date = writeDate;
    }
    if (status === "issued") {
      payload.issued_at = nowIso();
      this.issueQuotaCache = null;
    }
    if (popbillResult !== undefined) {
      payload.popbill_result_json = popbillResult;
    }
    if (popbillEnvironment !== undefined) {
      payload.popbill_environment = popbillEnvironment;
    }

    await assertNoError(
      "초안 상태 저장 실패",
      this.client.from("invoice_drafts").update(payload).eq("id", asString(draftRow.id))
    );

    const draft = await this.getDraft(draftId);
    if (!draft) {
      throw new Error("초안 상태 저장 후 다시 읽지 못했습니다.");
    }
    return draft;
  }

  async updateDraftPopbillEnvironment(draftId: number, popbillEnvironment: PopbillEnvironment): Promise<InvoiceDraft> {
    const draftRow = await this.getDraftRowByLegacyId(draftId);
    if (!draftRow) {
      throw new Error("초안을 찾지 못했습니다.");
    }

    await assertNoError(
      "초안 발행 연동 환경 저장 실패",
      this.client
        .from("invoice_drafts")
        .update({
          popbill_environment: popbillEnvironment,
          updated_at: nowIso()
        })
        .eq("id", asString(draftRow.id))
    );

    const updated = await this.getDraft(draftId);
    if (!updated) {
      throw new Error("초안 발행 연동 환경 저장 후 다시 읽지 못했습니다.");
    }
    return updated;
  }

  async claimDraftForIssue(draftId: number): Promise<InvoiceDraft | null> {
    const draftRow = await this.getDraftRowByLegacyId(draftId);
    if (!draftRow) return null;

    const timestamp = nowIso();
    const updated = await assertNoError(
      "초안 발행 선점 실패",
      this.client
        .from("invoice_drafts")
        .update({
          status: "issuing",
          issue_error: "",
          issue_requested_at: timestamp,
          updated_at: timestamp
        })
        .eq("id", asString(draftRow.id))
        .in("status", ["review", "failed", "scheduled"])
        .select("id")
        .maybeSingle()
    );

    if (!updated) {
      return null;
    }
    return this.getDraft(draftId);
  }

  async reopenIssuedDraftForReissue(draftId: number): Promise<InvoiceDraft> {
    const draft = await this.getDraft(draftId);
    if (!draft) {
      throw new Error("발행 건을 찾지 못했습니다.");
    }
    const draftRow = await this.getDraftRowByLegacyId(draftId);
    if (!draftRow) {
      throw new Error("발행 건 원본을 찾지 못했습니다.");
    }

    const nextMgtKey = nextDraftMgtKey(draft.popbillMgtKey, draft.customerId, draft.billingMonth, draft.sourceMessageId);
    await assertNoError(
      "재발행 대기 상태 복원 실패",
      this.client
        .from("invoice_drafts")
        .update({
          status: "review",
          scheduled_for: null,
          issue_requested_at: null,
          issued_at: null,
          issue_error: "",
          write_date: null,
          popbill_result_json: null,
          popbill_environment: null,
          popbill_mgt_key: nextMgtKey,
          updated_at: nowIso()
        })
        .eq("id", asString(draftRow.id))
    );

    const reopened = await this.getDraft(draftId);
    if (!reopened) {
      throw new Error("발행 건을 검수 대기로 되돌리지 못했습니다.");
    }
    return reopened;
  }

  async markDraftRequested(draftId: number): Promise<void> {
    const draftRow = await this.getDraftRowByLegacyId(draftId);
    if (!draftRow) return;

    await assertNoError(
      "발행 요청 시각 저장 실패",
      this.client
        .from("invoice_drafts")
        .update({
          issue_requested_at: nowIso(),
          updated_at: nowIso()
        })
        .eq("id", asString(draftRow.id))
    );
  }

  async getDueAutoDrafts(now: Date): Promise<InvoiceDraft[]> {
    void now;
    return [];
  }

  async createLog(level: LogEntry["level"], scope: string, message: string, context?: unknown): Promise<void> {
    await this.initialize();
    await assertNoError(
      "로그 저장 실패",
      this.client.from("app_logs").insert({
        organization_id: this.requireOrganizationId(),
        actor_user_id: this.actorUserId,
        level,
        scope,
        message: sanitizeSensitiveText(message),
        context_json: sanitizeSensitiveData(context ?? {})
      })
    );
  }

  async getPilotIssuanceReport(options: { from?: string | null; to?: string | null } = {}): Promise<PilotIssuanceReport> {
    const [rows, customers] = await Promise.all([this.listAppLogRows(options), this.listCustomers()]);
    return buildPilotIssuanceReport({
      organizationId: this.requireOrganizationId(),
      from: options.from ?? null,
      to: options.to ?? null,
      customers: customers.map((customer) => ({
        id: customer.id,
        customerName: customer.customerName,
        issueMode: customer.issueMode
      })),
      logs: rows.map(mapPilotLogRow)
    });
  }

  async getDraftPilotTimeline(draftId: number): Promise<PilotDraftTimeline | null> {
    const draft = await this.getDraft(draftId);
    if (!draft) {
      return null;
    }

    const rows = await this.listAppLogRows({ draftId });
    return buildPilotDraftTimeline({
      organizationId: this.requireOrganizationId(),
      draftId,
      customerId: draft.customerId,
      issueMode: draft.issueMode,
      logs: rows.map(mapPilotLogRow)
    });
  }

  async getBootstrapWorkspace(): Promise<Omit<DashboardPayload, "logs" | "renewalAutomation">> {
    const [settings, customers, customerCertificates] = await Promise.all([
      this.getSettings(),
      this.listCustomers(),
      this.listCustomerCertificates()
    ]);

    return {
      settings,
      customers,
      customerCertificates,
      drafts: [],
      inbox: [],
      counts: buildDashboardCounts([], [], customers.length)
    };
  }

  async getDashboard(): Promise<Omit<DashboardPayload, "renewalAutomation">> {
    const [settings, customers, customerCertificates, drafts, inbox, logs] = await Promise.all([
      this.getSettings(),
      this.listCustomers(),
      this.listCustomerCertificates(),
      this.listDrafts(),
      this.listInbox(),
      this.listLogs()
    ]);

    return {
      settings,
      customers,
      customerCertificates,
      drafts,
      inbox,
      logs,
      counts: buildDashboardCounts(drafts, inbox, customers.length)
    };
  }

  async close(): Promise<void> {
    return;
  }
}
