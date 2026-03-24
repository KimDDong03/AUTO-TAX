import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
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
import {
  buildDraftMgtKey,
  buildPopbillUserId,
  digitsOnly,
  nextDraftMgtKey,
  normalizeAddress,
  normalizePlantName,
  normalizePopbillUserPrefix,
  nowIso,
  safeJsonParse,
  toRoadAddress
} from "./utils.js";

type DbRow = Record<string, unknown>;

function mapSettings(row: DbRow): AppSettings {
  return {
    id: Number(row.id),
    imapHost: String(row.imap_host ?? ""),
    imapPort: Number(row.imap_port ?? 993),
    imapSecure: Number(row.imap_secure ?? 1) === 1,
    imapUser: String(row.imap_user ?? ""),
    imapPass: String(row.imap_pass ?? ""),
    imapMailbox: String(row.imap_mailbox ?? "INBOX"),
    smtpHost: String(row.smtp_host ?? ""),
    smtpPort: Number(row.smtp_port ?? 465),
    smtpSecure: Number(row.smtp_secure ?? 1) === 1,
    smtpUser: String(row.smtp_user ?? ""),
    smtpPass: String(row.smtp_pass ?? ""),
    smtpFromName: String(row.smtp_from_name ?? "AUTO-TAX"),
    smtpFromEmail: String(row.smtp_from_email ?? ""),
    notificationEmails: safeJsonParse(String(row.notification_emails_json ?? "[]"), [] as string[]),
    defaultIssueDay: Number(row.default_issue_day ?? 25),
    defaultIssueHour: Number(row.default_issue_hour ?? 14),
    defaultIssueMinute: Number(row.default_issue_minute ?? 0),
    mailPollMinutes: Number(row.mail_poll_minutes ?? 5),
    timezone: String(row.timezone ?? "Asia/Seoul"),
    popbillLinkId: String(row.popbill_link_id ?? ""),
    popbillSecretKey: String(row.popbill_secret_key ?? ""),
    popbillIsTest: Number(row.popbill_is_test ?? 1) === 1,
    popbillPartnerCorpNum: String(row.popbill_partner_corp_num ?? ""),
    popbillUserIdPrefix: String(row.popbill_user_id_prefix ?? "HAE_"),
    popbillSharedPassword: String(row.popbill_shared_password ?? ""),
    operatorContactName: String(row.operator_contact_name ?? ""),
    operatorContactEmail: String(row.operator_contact_email ?? ""),
    operatorContactTel: String(row.operator_contact_tel ?? ""),
    schedulerEnabled: Number(row.scheduler_enabled ?? 1) === 1,
    certLastCheckedAt: row.cert_last_checked_at ? String(row.cert_last_checked_at) : null,
    certAlertLastSentAt: row.cert_alert_last_sent_at ? String(row.cert_alert_last_sent_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapCustomer(row: DbRow, plantNames: string[], matchAddresses: string[]): Customer {
  return {
    id: Number(row.id),
    customerName: String(row.customer_name ?? ""),
    businessNumber: String(row.business_number ?? ""),
    corpName: String(row.corp_name ?? ""),
    ceoName: String(row.ceo_name ?? ""),
    addr: String(row.addr ?? ""),
    bizType: String(row.biz_type ?? ""),
    bizClass: String(row.biz_class ?? ""),
    popbillUserId: String(row.popbill_user_id ?? ""),
    popbillPassword: String(row.popbill_password ?? ""),
    popbillState: String(row.popbill_state ?? "pending") as PopbillState,
    popbillCertRegistered: Number(row.popbill_cert_registered ?? 0) === 1,
    popbillCertExpireDate: row.popbill_cert_expire_date ? String(row.popbill_cert_expire_date) : null,
    issueMode: String(row.issue_mode ?? "review") as Customer["issueMode"],
    issueDay: row.issue_day === null ? null : Number(row.issue_day),
    issueHour: row.issue_hour === null ? null : Number(row.issue_hour),
    issueMinute: row.issue_minute === null ? null : Number(row.issue_minute),
    memo: String(row.memo ?? ""),
    plantNames,
    matchAddresses,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapInbox(row: DbRow): InboxMessage {
  return {
    id: Number(row.id),
    messageUid: String(row.message_uid ?? ""),
    mailbox: String(row.mailbox ?? "INBOX"),
    fromAddress: String(row.from_address ?? ""),
    subject: String(row.subject ?? ""),
    receivedAt: String(row.received_at ?? ""),
    rawSource: String(row.raw_source ?? ""),
    textBody: String(row.text_body ?? ""),
    parseStatus: String(row.parse_status ?? "pending") as MailParseStatus,
    parseError: String(row.parse_error ?? ""),
    parsedData: row.parsed_json ? safeJsonParse(String(row.parsed_json), null as ParsedMail | null) : null,
    customerId: row.customer_id === null ? null : Number(row.customer_id),
    draftId: row.draft_id === null ? null : Number(row.draft_id),
    createdAt: String(row.created_at ?? "")
  };
}

function mapDraft(row: DbRow): InvoiceDraft {
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name ?? ""),
    sourceMessageId: Number(row.source_message_id),
    issueMode: String(row.issue_mode ?? "review") as InvoiceDraft["issueMode"],
    status: String(row.status ?? "review") as DraftStatus,
    scheduledFor: row.scheduled_for ? String(row.scheduled_for) : null,
    issueRequestedAt: row.issue_requested_at ? String(row.issue_requested_at) : null,
    issuedAt: row.issued_at ? String(row.issued_at) : null,
    issueError: String(row.issue_error ?? ""),
    billingMonth: String(row.billing_month ?? ""),
    writeDate: row.write_date ? String(row.write_date) : null,
    itemName: String(row.item_name ?? ""),
    plantName: String(row.plant_name ?? ""),
    supplyCost: Number(row.supply_cost ?? 0),
    taxTotal: Number(row.tax_total ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    kepcoCorpNum: String(row.kepco_corp_num ?? ""),
    kepcoBranchId: String(row.kepco_branch_id ?? ""),
    kepcoCorpName: String(row.kepco_corp_name ?? ""),
    kepcoCeoName: String(row.kepco_ceo_name ?? ""),
    kepcoAddr: String(row.kepco_addr ?? ""),
    kepcoBizType: String(row.kepco_biz_type ?? ""),
    kepcoBizClass: String(row.kepco_biz_class ?? ""),
    recipientEmail: String(row.recipient_email ?? ""),
    popbillMgtKey: String(row.popbill_mgt_key ?? ""),
    popbillResultJson: String(row.popbill_result_json ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapLog(row: DbRow): LogEntry {
  return {
    id: Number(row.id),
    level: String(row.level ?? "info") as LogEntry["level"],
    scope: String(row.scope ?? ""),
    message: String(row.message ?? ""),
    contextJson: String(row.context_json ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}

export class Store {
  private db: Database.Database;
  private readonly databaseFile: string;

  constructor(databaseFile: string) {
    this.databaseFile = databaseFile;
    this.db = this.openDatabase(databaseFile);
    this.initialize();
  }

  private openDatabase(databaseFile: string): Database.Database {
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    const db = new Database(databaseFile);
    db.pragma("journal_mode = WAL");
    return db;
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        imap_host TEXT NOT NULL DEFAULT '',
        imap_port INTEGER NOT NULL DEFAULT 993,
        imap_secure INTEGER NOT NULL DEFAULT 1,
        imap_user TEXT NOT NULL DEFAULT '',
        imap_pass TEXT NOT NULL DEFAULT '',
        imap_mailbox TEXT NOT NULL DEFAULT 'INBOX',
        smtp_host TEXT NOT NULL DEFAULT '',
        smtp_port INTEGER NOT NULL DEFAULT 465,
        smtp_secure INTEGER NOT NULL DEFAULT 1,
        smtp_user TEXT NOT NULL DEFAULT '',
        smtp_pass TEXT NOT NULL DEFAULT '',
        smtp_from_name TEXT NOT NULL DEFAULT 'AUTO-TAX',
        smtp_from_email TEXT NOT NULL DEFAULT '',
        notification_emails_json TEXT NOT NULL DEFAULT '[]',
        default_issue_day INTEGER NOT NULL DEFAULT 25,
        default_issue_hour INTEGER NOT NULL DEFAULT 14,
        default_issue_minute INTEGER NOT NULL DEFAULT 0,
        mail_poll_minutes INTEGER NOT NULL DEFAULT 5,
        timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
        popbill_link_id TEXT NOT NULL DEFAULT '',
        popbill_secret_key TEXT NOT NULL DEFAULT '',
        popbill_is_test INTEGER NOT NULL DEFAULT 1,
        popbill_partner_corp_num TEXT NOT NULL DEFAULT '',
        popbill_user_id_prefix TEXT NOT NULL DEFAULT 'HAE_',
        popbill_shared_password TEXT NOT NULL DEFAULT '',
        operator_contact_name TEXT NOT NULL DEFAULT '',
        operator_contact_email TEXT NOT NULL DEFAULT '',
        operator_contact_tel TEXT NOT NULL DEFAULT '',
        scheduler_enabled INTEGER NOT NULL DEFAULT 1,
        cert_last_checked_at TEXT,
        cert_alert_last_sent_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        business_number TEXT NOT NULL,
        corp_name TEXT NOT NULL,
        ceo_name TEXT NOT NULL,
        addr TEXT NOT NULL,
        biz_type TEXT NOT NULL,
        biz_class TEXT NOT NULL,
        contact_name TEXT NOT NULL DEFAULT '',
        contact_email TEXT NOT NULL DEFAULT '',
        contact_tel TEXT NOT NULL DEFAULT '',
        popbill_user_id TEXT NOT NULL DEFAULT '',
        popbill_password TEXT NOT NULL DEFAULT '',
        popbill_state TEXT NOT NULL DEFAULT 'pending',
        popbill_cert_registered INTEGER NOT NULL DEFAULT 0,
        popbill_cert_expire_date TEXT,
        issue_mode TEXT NOT NULL DEFAULT 'review',
        issue_day INTEGER,
        issue_hour INTEGER,
        issue_minute INTEGER,
        memo TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customer_plants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        plant_name TEXT NOT NULL,
        normalized_plant_name TEXT NOT NULL,
        UNIQUE(customer_id, normalized_plant_name)
      );

      CREATE TABLE IF NOT EXISTS customer_match_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        match_address TEXT NOT NULL,
        normalized_match_address TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS inbox_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_uid TEXT NOT NULL UNIQUE,
        mailbox TEXT NOT NULL,
        from_address TEXT NOT NULL,
        subject TEXT NOT NULL,
        received_at TEXT NOT NULL,
        raw_source TEXT NOT NULL,
        text_body TEXT NOT NULL,
        parse_status TEXT NOT NULL DEFAULT 'pending',
        parse_error TEXT NOT NULL DEFAULT '',
        parsed_json TEXT,
        customer_id INTEGER REFERENCES customers(id),
        draft_id INTEGER REFERENCES invoice_drafts(id),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoice_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        source_message_id INTEGER NOT NULL UNIQUE REFERENCES inbox_messages(id),
        issue_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduled_for TEXT,
        issue_requested_at TEXT,
        issued_at TEXT,
        issue_error TEXT NOT NULL DEFAULT '',
        billing_month TEXT NOT NULL,
        write_date TEXT,
        item_name TEXT NOT NULL,
        plant_name TEXT NOT NULL,
        supply_cost INTEGER NOT NULL,
        tax_total INTEGER NOT NULL,
        total_amount INTEGER NOT NULL,
        kepco_corp_num TEXT NOT NULL,
        kepco_branch_id TEXT NOT NULL,
        kepco_corp_name TEXT NOT NULL,
        kepco_ceo_name TEXT NOT NULL,
        kepco_addr TEXT NOT NULL,
        kepco_biz_type TEXT NOT NULL,
        kepco_biz_class TEXT NOT NULL,
        recipient_email TEXT NOT NULL DEFAULT '',
        recipient_email_secondary TEXT NOT NULL DEFAULT '',
        popbill_mgt_key TEXT NOT NULL DEFAULT '',
        popbill_result_json TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        scope TEXT NOT NULL,
        message TEXT NOT NULL,
        context_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
    `);

    const row = this.db.prepare("SELECT COUNT(*) as count FROM app_settings").get() as DbRow;
    if (Number(row.count) === 0) {
      const timestamp = nowIso();
      this.db.prepare("INSERT INTO app_settings (id, created_at, updated_at) VALUES (1, ?, ?)").run(timestamp, timestamp);
    }

    this.ensureColumn("app_settings", "popbill_user_id_prefix", "TEXT NOT NULL DEFAULT 'HAE_'");
    this.ensureColumn("app_settings", "popbill_shared_password", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("app_settings", "popbill_partner_corp_num", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("app_settings", "operator_contact_name", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("app_settings", "operator_contact_email", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("app_settings", "operator_contact_tel", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("app_settings", "cert_last_checked_at", "TEXT");
    this.ensureColumn("app_settings", "cert_alert_last_sent_at", "TEXT");
    this.ensureColumn("invoice_drafts", "recipient_email_secondary", "TEXT NOT NULL DEFAULT ''");
    this.migrateCustomerPlantsTable();
    this.normalizeManualOnlyMode();
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as DbRow[];
    const hasColumn = columns.some((column) => String(column.name) === columnName);
    if (!hasColumn) {
      this.db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
    }
  }

  private migrateCustomerPlantsTable(): void {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'customer_plants'")
      .get() as DbRow | undefined;
    const sql = String(row?.sql ?? "");
    if (!sql.includes("normalized_plant_name TEXT NOT NULL UNIQUE")) {
      return;
    }

    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE customer_plants_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          plant_name TEXT NOT NULL,
          normalized_plant_name TEXT NOT NULL,
          UNIQUE(customer_id, normalized_plant_name)
        );
      `);
      this.db.exec(`
        INSERT INTO customer_plants_new (id, customer_id, plant_name, normalized_plant_name)
        SELECT id, customer_id, plant_name, normalized_plant_name
        FROM customer_plants;
      `);
      this.db.exec("DROP TABLE customer_plants;");
      this.db.exec("ALTER TABLE customer_plants_new RENAME TO customer_plants;");
    })();
  }

  private normalizeManualOnlyMode(): void {
    const timestamp = nowIso();
    this.db.prepare("UPDATE customers SET issue_mode = 'review' WHERE issue_mode <> 'review'").run();
    this.db
      .prepare("UPDATE invoice_drafts SET status = 'review', scheduled_for = NULL, updated_at = ? WHERE status = 'scheduled'")
      .run(timestamp);
  }

  getSettings(): AppSettings {
    const row = this.db.prepare("SELECT * FROM app_settings WHERE id = 1").get() as DbRow;
    return mapSettings(row);
  }

  getDatabaseFile(): string {
    return this.databaseFile;
  }

  close(): void {
    if (this.db.open) {
      this.db.close();
    }
  }

  async createDatabaseBackup(destinationFile: string): Promise<void> {
    fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
    await this.db.backup(destinationFile);
  }

  restoreDatabaseBackup(sourceFile: string): void {
    if (!fs.existsSync(sourceFile)) {
      throw new Error("복원할 백업 파일을 찾지 못했습니다.");
    }

    this.close();
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${this.databaseFile}${suffix}`;
      if (fs.existsSync(sidecar)) {
        fs.rmSync(sidecar, { force: true });
      }
    }
    fs.copyFileSync(sourceFile, this.databaseFile);
    this.db = this.openDatabase(this.databaseFile);
    this.initialize();
  }

  updateSettings(input: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const next: AppSettings = {
      ...current,
      ...input,
      notificationEmails: input.notificationEmails ?? current.notificationEmails,
      updatedAt: nowIso()
    };

    this.db.prepare(`
      UPDATE app_settings SET
        imap_host = @imapHost,
        imap_port = @imapPort,
        imap_secure = @imapSecure,
        imap_user = @imapUser,
        imap_pass = @imapPass,
        imap_mailbox = @imapMailbox,
        smtp_host = @smtpHost,
        smtp_port = @smtpPort,
        smtp_secure = @smtpSecure,
        smtp_user = @smtpUser,
        smtp_pass = @smtpPass,
        smtp_from_name = @smtpFromName,
        smtp_from_email = @smtpFromEmail,
        notification_emails_json = @notificationEmailsJson,
        default_issue_day = @defaultIssueDay,
        default_issue_hour = @defaultIssueHour,
        default_issue_minute = @defaultIssueMinute,
        mail_poll_minutes = @mailPollMinutes,
        timezone = @timezone,
        popbill_link_id = @popbillLinkId,
        popbill_secret_key = @popbillSecretKey,
        popbill_is_test = @popbillIsTest,
        popbill_partner_corp_num = @popbillPartnerCorpNum,
        popbill_user_id_prefix = @popbillUserIdPrefix,
        popbill_shared_password = @popbillSharedPassword,
        operator_contact_name = @operatorContactName,
        operator_contact_email = @operatorContactEmail,
        operator_contact_tel = @operatorContactTel,
        scheduler_enabled = @schedulerEnabled,
        cert_last_checked_at = @certLastCheckedAt,
        cert_alert_last_sent_at = @certAlertLastSentAt,
        updated_at = @updatedAt
      WHERE id = 1
    `).run({
      ...next,
      imapSecure: next.imapSecure ? 1 : 0,
      smtpSecure: next.smtpSecure ? 1 : 0,
      popbillIsTest: next.popbillIsTest ? 1 : 0,
      schedulerEnabled: next.schedulerEnabled ? 1 : 0,
      notificationEmailsJson: JSON.stringify(next.notificationEmails)
    });

    return this.getSettings();
  }

  listCustomers(): Customer[] {
    const rows = this.db.prepare("SELECT * FROM customers ORDER BY customer_name ASC").all() as DbRow[];
    const plants = this.db.prepare("SELECT customer_id, plant_name FROM customer_plants ORDER BY plant_name ASC").all() as DbRow[];
    const addresses = this.db.prepare("SELECT customer_id, match_address FROM customer_match_addresses ORDER BY match_address ASC").all() as DbRow[];
    const plantMap = new Map<number, string[]>();
    const addressMap = new Map<number, string[]>();
    for (const row of plants) {
      const customerId = Number(row.customer_id);
      const values = plantMap.get(customerId) ?? [];
      values.push(String(row.plant_name));
      plantMap.set(customerId, values);
    }
    for (const row of addresses) {
      const customerId = Number(row.customer_id);
      const values = addressMap.get(customerId) ?? [];
      values.push(String(row.match_address));
      addressMap.set(customerId, values);
    }
    return rows.map((row) => mapCustomer(row, plantMap.get(Number(row.id)) ?? [], addressMap.get(Number(row.id)) ?? []));
  }

  getCustomer(customerId: number): Customer | null {
    const row = this.db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId) as DbRow | undefined;
    if (!row) return null;
    const plantRows = this.db.prepare("SELECT plant_name FROM customer_plants WHERE customer_id = ? ORDER BY plant_name ASC").all(customerId) as DbRow[];
    const addressRows = this.db.prepare("SELECT match_address FROM customer_match_addresses WHERE customer_id = ? ORDER BY match_address ASC").all(customerId) as DbRow[];
    return mapCustomer(
      row,
      plantRows.map((plantRow) => String(plantRow.plant_name)),
      addressRows.map((addressRow) => String(addressRow.match_address))
    );
  }

  findCustomerByBusinessNumber(businessNumber: string): Customer | null {
    const normalized = digitsOnly(businessNumber);
    const rows = this.db.prepare("SELECT * FROM customers ORDER BY id ASC").all() as DbRow[];
    const row = rows.find((candidate) => digitsOnly(String(candidate.business_number ?? "")) === normalized);
    if (!row) return null;
    const customerId = Number(row.id);
    const plantRows = this.db.prepare("SELECT plant_name FROM customer_plants WHERE customer_id = ? ORDER BY plant_name ASC").all(customerId) as DbRow[];
    const addressRows = this.db.prepare("SELECT match_address FROM customer_match_addresses WHERE customer_id = ? ORDER BY match_address ASC").all(customerId) as DbRow[];
    return mapCustomer(
      row,
      plantRows.map((plantRow) => String(plantRow.plant_name)),
      addressRows.map((addressRow) => String(addressRow.match_address))
    );
  }

  findCustomerByMatchAddress(matchAddress: string): Customer | null {
    const normalized = normalizeAddress(matchAddress);
    const row = this.db.prepare(`
      SELECT c.*
      FROM customer_match_addresses cma
      JOIN customers c ON c.id = cma.customer_id
      WHERE cma.normalized_match_address = ?
      LIMIT 1
    `).get(normalized) as DbRow | undefined;

    if (!row) return null;

    const customerId = Number(row.id);
    const plantRows = this.db.prepare("SELECT plant_name FROM customer_plants WHERE customer_id = ? ORDER BY plant_name ASC").all(customerId) as DbRow[];
    const addressRows = this.db.prepare("SELECT match_address FROM customer_match_addresses WHERE customer_id = ? ORDER BY match_address ASC").all(customerId) as DbRow[];
    return mapCustomer(
      row,
      plantRows.map((plantRow) => String(plantRow.plant_name)),
      addressRows.map((addressRow) => String(addressRow.match_address))
    );
  }

  saveCustomer(input: CustomerInput, customerId?: number): Customer {
    const timestamp = nowIso();
    const settings = this.getSettings();
    const sharedPassword = settings.popbillSharedPassword;
    const idPrefix = normalizePopbillUserPrefix(settings.popbillUserIdPrefix);
    const normalizedBusinessNumber = digitsOnly(input.businessNumber);
    const roadAddress = toRoadAddress(input.addr);
    const existingByBusinessNumber = this.findCustomerByBusinessNumber(normalizedBusinessNumber);
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
      if (!normalizedAddress) {
        continue;
      }

      const duplicateInInput = normalizedMatchAddresses.get(normalizedAddress);
      if (duplicateInInput) {
        throw new Error(`매칭 주소가 중복되었습니다: ${matchAddress}`);
      }
      normalizedMatchAddresses.set(normalizedAddress, matchAddress);

      const existingByMatchAddress = this.findCustomerByMatchAddress(matchAddress);
      if (existingByMatchAddress && existingByMatchAddress.id !== customerId) {
        throw new Error(`이미 다른 고객에 등록된 매칭 주소입니다. 기존 고객: ${existingByMatchAddress.customerName}`);
      }
    }

    if (customerId) {
      const current = this.getCustomer(customerId);
      const popbillUserId = current?.popbillUserId || buildPopbillUserId(idPrefix, customerId);
      const popbillPassword = current?.popbillPassword || sharedPassword;

      this.db.prepare(`
        UPDATE customers SET
          customer_name = @customerName,
          business_number = @businessNumber,
          corp_name = @corpName,
          ceo_name = @ceoName,
          addr = @addr,
          biz_type = @bizType,
          biz_class = @bizClass,
          popbill_user_id = @popbillUserId,
          popbill_password = @popbillPassword,
          issue_mode = @issueMode,
          issue_day = @issueDay,
          issue_hour = @issueHour,
          issue_minute = @issueMinute,
          memo = @memo,
          updated_at = @updatedAt
        WHERE id = @id
      `).run({
        ...input,
        addr: roadAddress,
        businessNumber: normalizedBusinessNumber,
        popbillUserId,
        popbillPassword,
        id: customerId,
        updatedAt: timestamp
      });
      this.db.prepare("DELETE FROM customer_plants WHERE customer_id = ?").run(customerId);
      this.db.prepare("DELETE FROM customer_match_addresses WHERE customer_id = ?").run(customerId);
    } else {
      const result = this.db.prepare(`
        INSERT INTO customers (
          customer_name,
          business_number,
          corp_name,
          ceo_name,
          addr,
          biz_type,
          biz_class,
          issue_mode,
          issue_day,
          issue_hour,
          issue_minute,
          memo,
          created_at,
          updated_at
        ) VALUES (
          @customerName,
          @businessNumber,
          @corpName,
          @ceoName,
          @addr,
          @bizType,
          @bizClass,
          @issueMode,
          @issueDay,
          @issueHour,
          @issueMinute,
          @memo,
          @createdAt,
          @updatedAt
        )
      `).run({
        ...input,
        addr: roadAddress,
        businessNumber: normalizedBusinessNumber,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      customerId = Number(result.lastInsertRowid);

      this.db.prepare(`
        UPDATE customers SET
          popbill_user_id = ?,
          popbill_password = ?,
          updated_at = ?
        WHERE id = ?
      `).run(buildPopbillUserId(idPrefix, customerId), sharedPassword, timestamp, customerId);
    }

    const insertPlant = this.db.prepare(`
      INSERT INTO customer_plants (customer_id, plant_name, normalized_plant_name)
      VALUES (?, ?, ?)
    `);
    for (const plantName of input.plantNames.filter(Boolean)) {
      insertPlant.run(customerId, plantName.trim(), normalizePlantName(plantName));
    }

    const insertMatchAddress = this.db.prepare(`
      INSERT INTO customer_match_addresses (customer_id, match_address, normalized_match_address)
      VALUES (?, ?, ?)
    `);
    for (const matchAddress of effectiveMatchAddresses) {
      insertMatchAddress.run(customerId, matchAddress.trim(), normalizeAddress(matchAddress));
    }

    const customer = this.getCustomer(customerId);
    if (!customer) {
      throw new Error("Failed to persist customer");
    }
    return customer;
  }

  updateCustomerPopbillState(customerId: number, state: PopbillState, certRegistered?: boolean, certExpireDate?: string | null): Customer {
    this.db.prepare(`
      UPDATE customers SET
        popbill_state = ?,
        popbill_cert_registered = COALESCE(?, popbill_cert_registered),
        popbill_cert_expire_date = COALESCE(?, popbill_cert_expire_date),
        updated_at = ?
      WHERE id = ?
    `).run(
      state,
      certRegistered === undefined ? null : certRegistered ? 1 : 0,
      certExpireDate === undefined ? null : certExpireDate,
      nowIso(),
      customerId
    );
    const customer = this.getCustomer(customerId);
    if (!customer) {
      throw new Error("Customer not found after popbill update");
    }
    return customer;
  }

  resetCustomerPopbill(customerId: number): Customer {
    this.db.prepare(`
      UPDATE customers SET
        popbill_state = 'pending',
        popbill_cert_registered = 0,
        popbill_cert_expire_date = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(nowIso(), customerId);

    const customer = this.getCustomer(customerId);
    if (!customer) {
      throw new Error("Customer not found after popbill reset");
    }
    return customer;
  }

  deleteCustomer(customerId: number): void {
    const customer = this.getCustomer(customerId);
    if (!customer) {
      throw new Error("고객을 찾지 못했습니다.");
    }

    this.db.transaction(() => {
      const draftRows = this.db.prepare("SELECT id FROM invoice_drafts WHERE customer_id = ?").all(customerId) as DbRow[];
      const draftIds = draftRows.map((row) => Number(row.id));

      if (draftIds.length > 0) {
        const placeholders = draftIds.map(() => "?").join(", ");
        this.db.prepare(`UPDATE inbox_messages SET draft_id = NULL WHERE draft_id IN (${placeholders})`).run(...draftIds);
        this.db.prepare(`DELETE FROM invoice_drafts WHERE id IN (${placeholders})`).run(...draftIds);
      }

      this.db.prepare("DELETE FROM inbox_messages WHERE customer_id = ?").run(customerId);
      this.db.prepare("DELETE FROM customer_match_addresses WHERE customer_id = ?").run(customerId);
      this.db.prepare("DELETE FROM customer_plants WHERE customer_id = ?").run(customerId);
      this.db.prepare("DELETE FROM customers WHERE id = ?").run(customerId);
    })();
  }

  findCustomerByPlantAndAddress(plantName: string, plantAddress?: string | null): Customer | null {
    const rows = this.db.prepare(`
      SELECT c.*
      FROM customer_plants cp
      JOIN customers c ON c.id = cp.customer_id
      WHERE cp.normalized_plant_name = ?
      ORDER BY c.id ASC
    `).all(normalizePlantName(plantName)) as DbRow[];

    if (rows.length === 0) return null;
    if (rows.length === 1) {
      const customerId = Number(rows[0].id);
      const customer = this.getCustomer(customerId);
      if (!customer) return null;
      if (!plantAddress || customer.matchAddresses.length === 0) return customer;
      const normalizedAddress = normalizeAddress(plantAddress);
      return customer.matchAddresses.some((address) => normalizeAddress(address) === normalizedAddress) ? customer : null;
    }

    if (!plantAddress) return null;
    const normalizedAddress = normalizeAddress(plantAddress);
    const matchedCustomers = rows
      .map((row) => this.getCustomer(Number(row.id)))
      .filter((customer): customer is Customer => Boolean(customer))
      .filter((customer) => customer.matchAddresses.some((address) => normalizeAddress(address) === normalizedAddress));

    if (matchedCustomers.length === 1) {
      return matchedCustomers[0];
    }

    return null;
  }

  getMessageByUid(messageUid: string): InboxMessage | null {
    const row = this.db.prepare("SELECT * FROM inbox_messages WHERE message_uid = ?").get(messageUid) as DbRow | undefined;
    return row ? mapInbox(row) : null;
  }

  getInboxMessage(messageId: number): InboxMessage | null {
    const row = this.db.prepare("SELECT * FROM inbox_messages WHERE id = ?").get(messageId) as DbRow | undefined;
    return row ? mapInbox(row) : null;
  }

  saveInboxMessage(args: {
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
  }): InboxMessage {
    const existing = this.getMessageByUid(args.messageUid);
    if (existing) return existing;

    const timestamp = nowIso();
    const result = this.db.prepare(`
      INSERT INTO inbox_messages (
        message_uid,
        mailbox,
        from_address,
        subject,
        received_at,
        raw_source,
        text_body,
        parse_status,
        parse_error,
        parsed_json,
        customer_id,
        created_at
      ) VALUES (
        @messageUid,
        @mailbox,
        @fromAddress,
        @subject,
        @receivedAt,
        @rawSource,
        @textBody,
        @parseStatus,
        @parseError,
        @parsedJson,
        @customerId,
        @createdAt
      )
    `).run({
      ...args,
      parseError: args.parseError ?? "",
      parsedJson: args.parsedData ? JSON.stringify(args.parsedData) : null,
      customerId: args.customerId ?? null,
      createdAt: timestamp
    });

    const row = this.db.prepare("SELECT * FROM inbox_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as DbRow;
    return mapInbox(row);
  }

  createDraft(args: {
    customer: Customer;
    sourceMessageId: number;
    status: DraftStatus;
    scheduledFor: string | null;
    parsedMail: ParsedMail;
  }): InvoiceDraft {
    const existing = this.db.prepare(`
      SELECT d.*, c.customer_name
      FROM invoice_drafts d
      JOIN customers c ON c.id = d.customer_id
      WHERE source_message_id = ?
    `).get(args.sourceMessageId) as DbRow | undefined;
    if (existing) {
      return mapDraft(existing);
    }

    const timestamp = nowIso();
    const mgtKey = buildDraftMgtKey(args.customer.id, args.parsedMail.billingMonth, args.sourceMessageId);
    const result = this.db.prepare(`
      INSERT INTO invoice_drafts (
        customer_id,
        source_message_id,
        issue_mode,
        status,
        scheduled_for,
        billing_month,
        item_name,
        plant_name,
        supply_cost,
        tax_total,
        total_amount,
        kepco_corp_num,
        kepco_branch_id,
        kepco_corp_name,
        kepco_ceo_name,
        kepco_addr,
        kepco_biz_type,
        kepco_biz_class,
        recipient_email,
        popbill_mgt_key,
        created_at,
        updated_at
      ) VALUES (
        @customerId,
        @sourceMessageId,
        @issueMode,
        @status,
        @scheduledFor,
        @billingMonth,
        @itemName,
        @plantName,
        @supplyCost,
        @taxTotal,
        @totalAmount,
        @kepcoCorpNum,
        @kepcoBranchId,
        @kepcoCorpName,
        @kepcoCeoName,
        @kepcoAddr,
        @kepcoBizType,
        @kepcoBizClass,
        @recipientEmail,
        @mgtKey,
        @createdAt,
        @updatedAt
      )
    `).run({
      customerId: args.customer.id,
      sourceMessageId: args.sourceMessageId,
      issueMode: args.customer.issueMode,
      status: args.status,
      scheduledFor: args.scheduledFor,
      billingMonth: args.parsedMail.billingMonth,
      itemName: args.parsedMail.itemName,
      plantName: args.parsedMail.plantName,
      supplyCost: args.parsedMail.supplyCost,
      taxTotal: args.parsedMail.taxTotal,
      totalAmount: args.parsedMail.totalAmount,
      kepcoCorpNum: args.parsedMail.kepcoCorpNum,
      kepcoBranchId: args.parsedMail.kepcoBranchId,
      kepcoCorpName: args.parsedMail.kepcoCorpName,
      kepcoCeoName: args.parsedMail.kepcoCeoName,
      kepcoAddr: args.parsedMail.kepcoAddr,
      kepcoBizType: args.parsedMail.kepcoBizType,
      kepcoBizClass: args.parsedMail.kepcoBizClass,
      recipientEmail: args.parsedMail.recipientEmail,
      mgtKey,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const draftId = Number(result.lastInsertRowid);
    this.db
      .prepare("UPDATE inbox_messages SET draft_id = ?, customer_id = ?, parse_status = 'parsed', parse_error = '' WHERE id = ?")
      .run(draftId, args.customer.id, args.sourceMessageId);
    const row = this.db.prepare(`
      SELECT d.*, c.customer_name
      FROM invoice_drafts d
      JOIN customers c ON c.id = d.customer_id
      WHERE d.id = ?
    `).get(draftId) as DbRow;
    return mapDraft(row);
  }

  refreshDraftFromParsedMail(draftId: number, parsedMail: ParsedMail): InvoiceDraft {
    this.db.prepare(`
      UPDATE invoice_drafts SET
        billing_month = @billingMonth,
        item_name = @itemName,
        plant_name = @plantName,
        supply_cost = @supplyCost,
        tax_total = @taxTotal,
        total_amount = @totalAmount,
        kepco_corp_num = @kepcoCorpNum,
        kepco_branch_id = @kepcoBranchId,
        kepco_corp_name = @kepcoCorpName,
        kepco_ceo_name = @kepcoCeoName,
        kepco_addr = @kepcoAddr,
        kepco_biz_type = @kepcoBizType,
        kepco_biz_class = @kepcoBizClass,
        recipient_email = @recipientEmail,
        updated_at = @updatedAt
      WHERE id = @draftId
    `).run({
      ...parsedMail,
      draftId,
      updatedAt: nowIso()
    });

    const draft = this.getDraft(draftId);
    if (!draft) {
      throw new Error("Draft not found after refresh");
    }
    return draft;
  }

  updateInboxParsedData(messageId: number, parsedMail: ParsedMail): InboxMessage {
    this.db.prepare(`
      UPDATE inbox_messages SET
        parsed_json = ?,
        parse_status = 'parsed',
        parse_error = ''
      WHERE id = ?
    `).run(JSON.stringify(parsedMail), messageId);

    const inbox = this.getInboxMessage(messageId);
    if (!inbox) {
      throw new Error("Inbox message not found after parsed data update");
    }
    return inbox;
  }

  updateInboxMatchResult(args: {
    messageId: number;
    parseStatus: MailParseStatus;
    parseError?: string;
    parsedMail?: ParsedMail | null;
    customerId?: number | null;
    draftId?: number | null;
  }): InboxMessage {
    this.db.prepare(`
      UPDATE inbox_messages SET
        parse_status = @parseStatus,
        parse_error = @parseError,
        parsed_json = @parsedJson,
        customer_id = @customerId,
        draft_id = @draftId
      WHERE id = @messageId
    `).run({
      messageId: args.messageId,
      parseStatus: args.parseStatus,
      parseError: args.parseError ?? "",
      parsedJson: args.parsedMail ? JSON.stringify(args.parsedMail) : null,
      customerId: args.customerId ?? null,
      draftId: args.draftId ?? null
    });

    const inbox = this.getInboxMessage(args.messageId);
    if (!inbox) {
      throw new Error("Inbox message not found after match update");
    }
    return inbox;
  }

  getDraft(draftId: number): InvoiceDraft | null {
    const row = this.db.prepare(`
      SELECT d.*, c.customer_name
      FROM invoice_drafts d
      JOIN customers c ON c.id = d.customer_id
      WHERE d.id = ?
    `).get(draftId) as DbRow | undefined;
    return row ? mapDraft(row) : null;
  }

  listDrafts(): InvoiceDraft[] {
    const rows = this.db.prepare(`
      SELECT d.*, c.customer_name
      FROM invoice_drafts d
      JOIN customers c ON c.id = d.customer_id
      ORDER BY d.created_at DESC
      LIMIT 200
    `).all() as DbRow[];
    return rows.map(mapDraft);
  }

  listInbox(): InboxMessage[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM inbox_messages
      ORDER BY received_at DESC, id DESC
      LIMIT 200
    `).all() as DbRow[];
    return rows.map(mapInbox);
  }

  listLogs(): LogEntry[] {
    const rows = this.db.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 200").all() as DbRow[];
    return rows.map(mapLog);
  }

  updateDraftStatus(draftId: number, status: DraftStatus, issueError = "", writeDate?: string | null, popbillResult?: unknown): InvoiceDraft {
    const serialized = popbillResult === undefined ? null : JSON.stringify(popbillResult);
    this.db.prepare(`
      UPDATE invoice_drafts SET
        status = ?,
        issue_error = ?,
        write_date = COALESCE(?, write_date),
        issued_at = CASE WHEN ? = 'issued' THEN ? ELSE issued_at END,
        updated_at = ?,
        popbill_result_json = COALESCE(?, popbill_result_json)
      WHERE id = ?
    `).run(
      status,
      issueError,
      writeDate ?? null,
      status,
      status === "issued" ? nowIso() : null,
      nowIso(),
      serialized,
      draftId
    );
    const draft = this.getDraft(draftId);
    if (!draft) {
      throw new Error("Draft not found after status update");
    }
    return draft;
  }

  claimDraftForIssue(draftId: number): InvoiceDraft | null {
    const timestamp = nowIso();
    const result = this.db.prepare(`
      UPDATE invoice_drafts SET
        status = 'issuing',
        issue_error = '',
        issue_requested_at = ?,
        updated_at = ?
      WHERE id = ?
        AND status IN ('review', 'failed')
    `).run(timestamp, timestamp, draftId);

    if (Number(result.changes ?? 0) === 0) {
      return null;
    }

    return this.getDraft(draftId);
  }

  reopenIssuedDraftForReissue(draftId: number): InvoiceDraft {
    const draft = this.getDraft(draftId);
    if (!draft) {
      throw new Error("발행 건을 찾지 못했습니다.");
    }

    const nextMgtKey = nextDraftMgtKey(draft.popbillMgtKey, draft.customerId, draft.billingMonth, draft.sourceMessageId);
    this.db.prepare(`
      UPDATE invoice_drafts SET
        status = 'review',
        scheduled_for = NULL,
        issue_requested_at = NULL,
        issued_at = NULL,
        issue_error = '',
        write_date = NULL,
        popbill_result_json = '',
        popbill_mgt_key = ?,
        updated_at = ?
      WHERE id = ?
    `).run(nextMgtKey, nowIso(), draftId);

    const reopened = this.getDraft(draftId);
    if (!reopened) {
      throw new Error("발행 건을 검수 대기로 되돌리지 못했습니다.");
    }
    return reopened;
  }

  markDraftRequested(draftId: number): void {
    this.db.prepare(`
      UPDATE invoice_drafts
      SET issue_requested_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), nowIso(), draftId);
  }

  getDueAutoDrafts(now: Date): InvoiceDraft[] {
    const rows = this.db.prepare(`
      SELECT d.*, c.customer_name
      FROM invoice_drafts d
      JOIN customers c ON c.id = d.customer_id
      WHERE d.status = 'scheduled'
        AND d.scheduled_for IS NOT NULL
        AND d.scheduled_for <= ?
      ORDER BY d.scheduled_for ASC
    `).all(now.toISOString()) as DbRow[];
    return rows.map(mapDraft);
  }

  createLog(level: LogEntry["level"], scope: string, message: string, context?: unknown): void {
    this.db.prepare(`
      INSERT INTO logs (level, scope, message, context_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(level, scope, message, JSON.stringify(context ?? {}), nowIso());
  }

  getDashboard(): DashboardPayload {
    const settings = this.getSettings();
    const customers = this.listCustomers();
    const drafts = this.listDrafts();
    const inbox = this.listInbox();
    const logs = this.listLogs();

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
}
