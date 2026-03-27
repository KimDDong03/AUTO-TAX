import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppSettings,
  Customer,
  CustomerInput,
  DashboardPayload,
  DraftStatus,
  InboxMessage,
  InvoiceDraft,
  LogEntry,
  MailParseStatus,
  ParsedMail,
  PopbillState
} from "./domain.js";
import { createSupabaseAdminClient } from "./supabase.js";
import { applyServerManagedSettings } from "./server-managed-settings.js";
import { decryptSecret, encryptSecret } from "./secret-box.js";
import type { AppStore } from "./store-contract.js";
import {
  buildDraftMgtKey,
  buildPopbillUserId,
  digitsOnly,
  nextDraftMgtKey,
  normalizeAddress,
  normalizePlantName,
  normalizePopbillUserPrefix,
  nowIso,
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

function asJsonString(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? {});
}

function latestTimestamp(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function mapSettings(settingsRow: Row, integrationRow: Row): AppSettings {
  const settingsUpdatedAt = asString(settingsRow.updated_at, nowIso());
  const integrationUpdatedAt = asString(integrationRow.updated_at, settingsUpdatedAt);
  return {
    id: asNumber(settingsRow.legacy_id, 1),
    imapHost: asString(integrationRow.imap_host),
    imapPort: asNumber(integrationRow.imap_port, 993),
    imapSecure: asBoolean(integrationRow.imap_secure, true),
    imapUser: asString(integrationRow.imap_user),
    imapPass: decryptSecret(asString(integrationRow.imap_pass_encrypted)),
    imapMailbox: asString(integrationRow.imap_mailbox, "INBOX"),
    smtpHost: asString(integrationRow.smtp_host),
    smtpPort: asNumber(integrationRow.smtp_port, 465),
    smtpSecure: asBoolean(integrationRow.smtp_secure, true),
    smtpUser: asString(integrationRow.smtp_user),
    smtpPass: decryptSecret(asString(integrationRow.smtp_pass_encrypted)),
    smtpFromName: asString(integrationRow.smtp_from_name, "AUTO-TAX"),
    smtpFromEmail: asString(integrationRow.smtp_from_email),
    notificationEmails: asStringArray(settingsRow.notification_emails),
    defaultIssueDay: asNumber(settingsRow.default_issue_day, 26),
    defaultIssueHour: asNumber(settingsRow.default_issue_hour, 9),
    defaultIssueMinute: asNumber(settingsRow.default_issue_minute, 0),
    mailPollMinutes: asNumber(settingsRow.mail_poll_minutes, 5),
    mailSyncStartAt: asNullableString(settingsRow.mail_sync_start_at),
    timezone: asString(settingsRow.timezone, "Asia/Seoul"),
    popbillLinkId: asString(integrationRow.popbill_link_id),
    popbillSecretKey: decryptSecret(asString(integrationRow.popbill_secret_key_encrypted)),
    popbillIsTest: asBoolean(integrationRow.popbill_is_test, false),
    popbillPartnerCorpNum: asString(integrationRow.popbill_partner_corp_num),
    popbillUserIdPrefix: asString(integrationRow.popbill_user_id_prefix, "TEST_"),
    popbillSharedPassword: decryptSecret(asString(integrationRow.popbill_shared_password_encrypted)),
    operatorContactName: asString(integrationRow.operator_contact_name),
    operatorContactEmail: asString(integrationRow.operator_contact_email),
    operatorContactTel: asString(integrationRow.operator_contact_tel),
    schedulerEnabled: asBoolean(settingsRow.scheduler_enabled, true),
    certLastCheckedAt: asNullableString(settingsRow.cert_last_checked_at),
    certAlertLastSentAt: asNullableString(settingsRow.cert_alert_last_sent_at),
    createdAt: asString(settingsRow.created_at, nowIso()),
    updatedAt: latestTimestamp(settingsUpdatedAt, integrationUpdatedAt)
  };
}

function mapCustomer(row: Row, plantNames: string[], matchAddresses: string[]): Customer {
  return {
    id: asNumber(row.legacy_id),
    customerName: asString(row.customer_name),
    businessNumber: asString(row.business_number),
    corpName: asString(row.corp_name),
    ceoName: asString(row.ceo_name),
    addr: asString(row.addr),
    bizType: asString(row.biz_type),
    bizClass: asString(row.biz_class),
    popbillUserId: asString(row.popbill_user_id),
    popbillPassword: decryptSecret(asString(row.popbill_password_encrypted)),
    popbillState: asString(row.popbill_state, "pending") as PopbillState,
    popbillCertRegistered: asBoolean(row.popbill_cert_registered, false),
    popbillCertExpireDate: asNullableString(row.popbill_cert_expire_date),
    issueMode: asString(row.issue_mode, "review") as Customer["issueMode"],
    issueDay: row.issue_day === null ? null : asNumber(row.issue_day),
    issueHour: row.issue_hour === null ? null : asNumber(row.issue_hour),
    issueMinute: row.issue_minute === null ? null : asNumber(row.issue_minute),
    memo: asString(row.memo),
    plantNames,
    matchAddresses,
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
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
    issueMode: asString(row.issue_mode, "review") as InvoiceDraft["issueMode"],
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
    recipientEmail: asString(row.recipient_email),
    popbillMgtKey: asString(row.popbill_mgt_key),
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
    message: asString(row.message),
    contextJson: asJsonString(row.context_json),
    createdAt: asString(row.created_at, nowIso())
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
    "팝빌 사용자 ID 접두어 중복 확인 실패",
    client
      .from("organization_integrations")
      .select("organization_id, popbill_user_id_prefix")
      .neq("organization_id", organizationId)
  );

  const duplicated = (rows as Row[]).find(
    (row) => normalizePopbillUserPrefix(asString(row.popbill_user_id_prefix)) === normalizedPrefix
  );

  if (duplicated) {
    throw new Error(`팝빌 사용자 ID 접두어 '${normalizedPrefix}'는 이미 다른 고객사에서 사용 중입니다. 다른 접두어를 입력하세요.`);
  }
}

export class SupabaseStore implements AppStore {
  private readonly client: SupabaseClient;
  private readonly requestedOrganizationId: string | null;
  private readonly actorUserId: string | null;
  private readonly bootstrapOrganization: boolean;
  private organizationId: string | null = null;
  private initialized = false;

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
              business_number: digitsOnly(envString("AUTO_TAX_ORGANIZATION_BUSINESS_NUMBER") ?? ""),
              plan_code: "starter",
              status: "trial",
              managed_customer_limit: 50
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
      this.client.from("organization_integrations").upsert({ organization_id: this.requireOrganizationId() }, { onConflict: "organization_id" })
    );

    this.initialized = true;
  }

  private requireOrganizationId(): string {
    if (!this.organizationId) {
      throw new Error("Supabase 조직이 초기화되지 않았습니다.");
    }
    return this.organizationId;
  }

  private async getSettingsRows(): Promise<{ settingsRow: Row; integrationRow: Row }> {
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
    return {
      settingsRow: settingsRow as Row,
      integrationRow: integrationRow as Row
    };
  }

  private async getManagedCustomerLimit(): Promise<number | null> {
    await this.initialize();
    const row = await assertNoError(
      "작업공간 한도 조회 실패",
      this.client
        .from("organizations")
        .select("managed_customer_limit")
        .eq("id", this.requireOrganizationId())
        .single()
    );

    const value = (row as Row).managed_customer_limit;
    if (value === null || value === undefined) {
      return null;
    }

    return asNumber(value);
  }

  private async getManagedCustomerRowByLegacyId(customerId: number): Promise<Row | null> {
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
    return (data as Row | null) ?? null;
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
    return mapCustomer(row, relations.plantNames, relations.matchAddresses);
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

  private async buildInboxPayload(row: Row): Promise<InboxMessage> {
    const customerLegacyId = row.managed_customer_id ? await this.lookupLegacyId("managed_customers", asString(row.managed_customer_id)) : null;
    const draftLegacyId = row.invoice_draft_id ? await this.lookupLegacyId("invoice_drafts", asString(row.invoice_draft_id)) : null;
    return mapInbox({
      ...row,
      managed_customer_legacy_id: customerLegacyId,
      invoice_draft_legacy_id: draftLegacyId
    });
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

  async getSettings(): Promise<AppSettings> {
    const { settingsRow, integrationRow } = await this.getSettingsRows();
    return mapSettings(settingsRow, integrationRow);
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
    const next: AppSettings = {
      ...current,
      ...input,
      imapPass: nextImapPass,
      smtpPass: nextSmtpPass,
      popbillUserIdPrefix: nextPopbillUserIdPrefix,
      popbillSharedPassword: nextPopbillSharedPassword,
      notificationEmails: input.notificationEmails ?? current.notificationEmails,
      updatedAt: nowIso()
    };
    const organizationId = this.requireOrganizationId();

    await assertUniquePopbillUserPrefix(this.client, organizationId, next.popbillUserIdPrefix);

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
          operator_contact_name: next.operatorContactName,
          operator_contact_email: next.operatorContactEmail,
          operator_contact_tel: next.operatorContactTel
        },
        { onConflict: "organization_id" }
      )
    );

    return this.getSettings();
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
      return mapCustomer(row, relations.plantNames, relations.matchAddresses);
    });
  }

  async getCustomer(customerId: number): Promise<Customer | null> {
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

  async saveCustomer(input: CustomerInput, customerId?: number): Promise<Customer> {
    const timestamp = nowIso();
    const settings = applyServerManagedSettings(await this.getSettings());
    const sharedPassword = settings.popbillSharedPassword;
    const idPrefix = normalizePopbillUserPrefix(settings.popbillUserIdPrefix);
    const normalizedBusinessNumber = digitsOnly(input.businessNumber);
    const roadAddress = toRoadAddress(input.addr);
    const existingByBusinessNumber = await this.findCustomerByBusinessNumber(normalizedBusinessNumber);
    const normalizedMatchAddresses = new Map<string, string>();
    const normalizedPlantNames = new Map<string, string>();
    const effectiveMatchAddresses = (input.matchAddresses.filter(Boolean).map((item) => item.trim()).filter(Boolean).length > 0
      ? input.matchAddresses
      : [roadAddress]
    )
      .map((item) => toRoadAddress(item))
      .filter(Boolean);

    if (existingByBusinessNumber && existingByBusinessNumber.id !== customerId) {
      throw new Error(`이미 등록된 사업자번호입니다. 기존 고객: ${existingByBusinessNumber.customerName}`);
    }

    for (const plantName of input.plantNames.filter(Boolean)) {
      const normalizedPlantName = normalizePlantName(plantName);
      const duplicatePlant = normalizedPlantNames.get(normalizedPlantName);
      if (duplicatePlant) {
        throw new Error(`같은 고객에 발전소명이 중복되었습니다: ${plantName}`);
      }
      normalizedPlantNames.set(normalizedPlantName, plantName);
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

      persistedRow = await assertNoError(
        "고객 수정 실패",
        this.client
          .from("managed_customers")
          .update({
            customer_name: input.customerName,
            business_number: normalizedBusinessNumber,
            corp_name: input.corpName,
            ceo_name: input.ceoName,
            addr: roadAddress,
            biz_type: input.bizType,
            biz_class: input.bizClass,
            popbill_user_id: popbillUserId,
            popbill_password_encrypted: encryptSecret(popbillPassword),
            issue_mode: input.issueMode,
            issue_day: input.issueDay,
            issue_hour: input.issueHour,
            issue_minute: input.issueMinute,
            memo: input.memo,
            updated_at: timestamp
          })
          .eq("id", asString(current.id))
          .select("*")
          .single()
      ) as Row;

      await assertNoError(
        "기존 발전소명 삭제 실패",
        this.client.from("managed_customer_plants").delete().eq("managed_customer_id", asString(current.id))
      );
      await assertNoError(
        "기존 매칭 주소 삭제 실패",
        this.client.from("managed_customer_match_addresses").delete().eq("managed_customer_id", asString(current.id))
      );
    } else {
      const [managedCustomerLimit, existingCustomerCountResult] = await Promise.all([
        this.getManagedCustomerLimit(),
        this.client
          .from("managed_customers")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
      ]);
      if (existingCustomerCountResult.error) {
        throw new Error(`현재 관리 고객 수 조회 실패: ${existingCustomerCountResult.error.message}`);
      }
      const currentCustomerCount = existingCustomerCountResult.count ?? 0;
      if (managedCustomerLimit !== null && currentCustomerCount >= managedCustomerLimit) {
        throw new Error(`관리 고객 등록 한도(${managedCustomerLimit}명)를 초과했습니다. 플랫폼 관리자에게 한도 상향을 요청하세요.`);
      }

      const createdRow = await assertNoError(
        "고객 생성 실패",
        this.client
          .from("managed_customers")
          .insert({
            organization_id: organizationId,
            customer_name: input.customerName,
            business_number: normalizedBusinessNumber,
            corp_name: input.corpName,
            ceo_name: input.ceoName,
            addr: roadAddress,
            biz_type: input.bizType,
            biz_class: input.bizClass,
            issue_mode: input.issueMode,
            issue_day: input.issueDay,
            issue_hour: input.issueHour,
            issue_minute: input.issueMinute,
            memo: input.memo
          })
          .select("*")
          .single()
      );

      const created = createdRow as Row;
      const legacyId = asNumber(created.legacy_id);
      persistedRow = await assertNoError(
        "고객 팝빌 정보 저장 실패",
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
    if (input.plantNames.filter(Boolean).length > 0) {
      await assertNoError(
        "발전소명 저장 실패",
        this.client.from("managed_customer_plants").insert(
          input.plantNames.filter(Boolean).map((plantName) => ({
            managed_customer_id: managedCustomerId,
            plant_name: plantName.trim(),
            normalized_plant_name: normalizePlantName(plantName)
          }))
        )
      );
    }

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

    const customer = await this.getCustomer(asNumber(persistedRow.legacy_id));
    if (!customer) {
      throw new Error("고객 저장 결과를 다시 읽지 못했습니다.");
    }
    return customer;
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

    await assertNoError(
      "고객 팝빌 상태 저장 실패",
      this.client.from("managed_customers").update(payload).eq("id", asString(current.id))
    );

    const customer = await this.getCustomer(customerId);
    if (!customer) {
      throw new Error("고객 상태 업데이트 후 다시 읽지 못했습니다.");
    }
    return customer;
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

  async findCustomerByPlantAndAddress(plantName: string, plantAddress?: string | null): Promise<Customer | null> {
    const normalizedPlant = normalizePlantName(plantName);
    const plantRows = await assertNoError(
      "발전소명 매칭 조회 실패",
      this.client.from("managed_customer_plants").select("managed_customer_id").eq("normalized_plant_name", normalizedPlant)
    );
    const candidateIds = [...new Set((plantRows as Row[]).map((row) => asString(row.managed_customer_id)).filter(Boolean))];
    if (candidateIds.length === 0) return null;

    const customerRows = await assertNoError(
      "발전소명 고객 조회 실패",
      this.client
        .from("managed_customers")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .in("id", candidateIds)
        .order("legacy_id", { ascending: true })
    );

    const customers = await Promise.all((customerRows as Row[]).map((row) => this.mapCustomerRow(row)));
    if (customers.length === 0) return null;
    if (customers.length === 1) {
      const customer = customers[0];
      if (!plantAddress || customer.matchAddresses.length === 0) return customer;
      const normalizedAddress = normalizeAddress(plantAddress);
      return customer.matchAddresses.some((address) => normalizeAddress(address) === normalizedAddress) ? customer : null;
    }

    if (!plantAddress) return null;
    const normalizedAddress = normalizeAddress(plantAddress);
    const matchedCustomers = customers.filter((customer) =>
      customer.matchAddresses.some((address) => normalizeAddress(address) === normalizedAddress)
    );
    return matchedCustomers.length === 1 ? matchedCustomers[0] : null;
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
          issue_mode: args.customer.issueMode,
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
          recipient_email: args.parsedMail.recipientEmail,
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

    return this.buildDraftPayload(inserted as Row);
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

  async refreshDraftFromParsedMail(draftId: number, parsedMail: ParsedMail): Promise<InvoiceDraft> {
    const draftRow = await this.getDraftRowByLegacyId(draftId);
    if (!draftRow) {
      throw new Error("초안을 찾지 못했습니다.");
    }

    await assertNoError(
      "초안 갱신 실패",
      this.client
        .from("invoice_drafts")
        .update({
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
          recipient_email: parsedMail.recipientEmail,
          updated_at: nowIso()
        })
        .eq("id", asString(draftRow.id))
    );

    const draft = await this.getDraft(draftId);
    if (!draft) {
      throw new Error("초안 갱신 후 다시 읽지 못했습니다.");
    }
    return draft;
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
    return Promise.all((rows as Row[]).map((row) => this.buildDraftPayload(row)));
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
    return Promise.all((rows as Row[]).map((row) => this.buildInboxPayload(row)));
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

  async updateDraftStatus(
    draftId: number,
    status: DraftStatus,
    issueError = "",
    writeDate?: string | null,
    popbillResult?: unknown
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
    }
    if (popbillResult !== undefined) {
      payload.popbill_result_json = popbillResult;
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
    await this.initialize();
    const rows = await assertNoError(
      "자동 발행 대상 조회 실패",
      this.client
        .from("invoice_drafts")
        .select("*")
        .eq("organization_id", this.requireOrganizationId())
        .eq("status", "scheduled")
        .lte("scheduled_for", now.toISOString())
        .order("scheduled_for", { ascending: true })
    );
    return Promise.all((rows as Row[]).map((row) => this.buildDraftPayload(row)));
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
        message,
        context_json: context ?? {}
      })
    );
  }

  async getDashboard(): Promise<Omit<DashboardPayload, "renewalAutomation">> {
    const [settings, customers, drafts, inbox, logs] = await Promise.all([
      this.getSettings(),
      this.listCustomers(),
      this.listDrafts(),
      this.listInbox(),
      this.listLogs()
    ]);

    return {
      settings,
      customers,
      drafts,
      inbox,
      logs,
      counts: {
        actionableDrafts: drafts.filter((draft) => draft.status === "review" || draft.status === "failed" || draft.status === "issuing").length,
        customers: customers.length,
        reviewDrafts: drafts.filter((draft) => draft.status === "review").length,
        scheduledDrafts: drafts.filter((draft) => draft.status === "scheduled").length,
        failedDrafts: drafts.filter((draft) => draft.status === "failed").length,
        unmatchedMessages: inbox.filter((message) => message.parseStatus === "unmatched").length
      }
    };
  }

  async close(): Promise<void> {
    return;
  }
}
