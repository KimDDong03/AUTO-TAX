import "dotenv/config";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { issueDraftNow } from "./automation.js";
import { refreshAllCertificateStatuses, shouldRefreshCertificateStatuses } from "./certificate-monitor.js";
import type { AppSettings, CustomerInput } from "./domain.js";
import { testMailConnections } from "./mail-test.js";
import { reprocessInboxMessage } from "./mail-reprocess.js";
import { syncMailbox } from "./mail-sync.js";
import {
  cancelTaxInvoice,
  checkIsMember,
  getCertificateExpireDate,
  getTaxCertURL,
  getTaxInvoiceInfo,
  getTaxInvoicePrintURL,
  getTaxInvoiceViewURL,
  joinMember,
  quitMember
} from "./popbill-client.js";
import { Scheduler } from "./scheduler.js";
import { Store } from "./store.js";

export type StartServerOptions = {
  port?: number;
  rootDir?: string;
  databaseFile?: string;
  webDist?: string;
  startScheduler?: boolean;
};

function envString(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function envInt(name: string): number | undefined {
  const value = envString(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function envBool(name: string): boolean | undefined {
  const value = envString(name)?.toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

function envList(name: string): string[] | undefined {
  const value = envString(name);
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolvePathFromRoot(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function applyEnvSettings(store: Store): void {
  const payload: Partial<AppSettings> = {
    imapHost: envString("AUTO_TAX_IMAP_HOST"),
    imapPort: envInt("AUTO_TAX_IMAP_PORT"),
    imapSecure: envBool("AUTO_TAX_IMAP_SECURE"),
    imapUser: envString("AUTO_TAX_IMAP_USER"),
    imapPass: envString("AUTO_TAX_IMAP_PASS"),
    imapMailbox: envString("AUTO_TAX_IMAP_MAILBOX"),
    smtpHost: envString("AUTO_TAX_SMTP_HOST"),
    smtpPort: envInt("AUTO_TAX_SMTP_PORT"),
    smtpSecure: envBool("AUTO_TAX_SMTP_SECURE"),
    smtpUser: envString("AUTO_TAX_SMTP_USER"),
    smtpPass: envString("AUTO_TAX_SMTP_PASS"),
    smtpFromName: envString("AUTO_TAX_SMTP_FROM_NAME"),
    smtpFromEmail: envString("AUTO_TAX_SMTP_FROM_EMAIL"),
    notificationEmails: envList("AUTO_TAX_NOTIFICATION_EMAILS"),
    defaultIssueDay: envInt("AUTO_TAX_DEFAULT_ISSUE_DAY"),
    defaultIssueHour: envInt("AUTO_TAX_DEFAULT_ISSUE_HOUR"),
    defaultIssueMinute: envInt("AUTO_TAX_DEFAULT_ISSUE_MINUTE"),
    mailPollMinutes: envInt("AUTO_TAX_MAIL_POLL_MINUTES"),
    timezone: envString("AUTO_TAX_TIMEZONE"),
    popbillLinkId: envString("AUTO_TAX_POPBILL_LINK_ID"),
    popbillSecretKey: envString("AUTO_TAX_POPBILL_SECRET_KEY"),
    popbillIsTest: envBool("AUTO_TAX_POPBILL_IS_TEST"),
    popbillUserIdPrefix: envString("AUTO_TAX_POPBILL_USER_ID_PREFIX"),
    popbillSharedPassword: envString("AUTO_TAX_POPBILL_SHARED_PASSWORD"),
    operatorContactName: envString("AUTO_TAX_OPERATOR_CONTACT_NAME"),
    operatorContactEmail: envString("AUTO_TAX_OPERATOR_CONTACT_EMAIL"),
    operatorContactTel: envString("AUTO_TAX_OPERATOR_CONTACT_TEL"),
    schedulerEnabled: envBool("AUTO_TAX_SCHEDULER_ENABLED")
  };

  const filtered = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<AppSettings>;

  if (Object.keys(filtered).length > 0) {
    store.updateSettings(filtered);
  }
}

const settingsSchema = z.object({
  imapHost: z.string(),
  imapPort: z.number().int().min(1),
  imapSecure: z.boolean(),
  imapUser: z.string(),
  imapPass: z.string(),
  imapMailbox: z.string(),
  smtpHost: z.string(),
  smtpPort: z.number().int().min(1),
  smtpSecure: z.boolean(),
  smtpUser: z.string(),
  smtpPass: z.string(),
  smtpFromName: z.string(),
  smtpFromEmail: z.string(),
  notificationEmails: z.array(z.string()),
  defaultIssueDay: z.number().int().min(1).max(31),
  defaultIssueHour: z.number().int().min(0).max(23),
  defaultIssueMinute: z.number().int().min(0).max(59),
  mailPollMinutes: z.number().int().min(1).max(1440),
  timezone: z.string(),
  popbillLinkId: z.string(),
  popbillSecretKey: z.string(),
  popbillIsTest: z.boolean(),
  popbillUserIdPrefix: z.string().min(1),
  popbillSharedPassword: z.string(),
  operatorContactName: z.string(),
  operatorContactEmail: z.string(),
  operatorContactTel: z.string(),
  schedulerEnabled: z.boolean()
});

const mailTestSchema = z.object({
  imapHost: z.string(),
  imapPort: z.number().int().min(1),
  imapSecure: z.boolean(),
  imapUser: z.string(),
  imapPass: z.string(),
  imapMailbox: z.string(),
  smtpHost: z.string(),
  smtpPort: z.number().int().min(1),
  smtpSecure: z.boolean(),
  smtpUser: z.string(),
  smtpPass: z.string(),
  smtpFromName: z.string(),
  smtpFromEmail: z.string(),
  notificationEmails: z.array(z.string())
});

const customerSchema = z.object({
  customerName: z.string().min(1),
  businessNumber: z.string().min(1),
  corpName: z.string().min(1),
  ceoName: z.string().min(1),
  addr: z.string().min(1),
  bizType: z.string().min(1),
  bizClass: z.string().min(1),
  issueMode: z.literal("review").optional().default("review"),
  issueDay: z.number().int().min(1).max(31).nullable().optional().default(null),
  issueHour: z.number().int().min(0).max(23).nullable().optional().default(null),
  issueMinute: z.number().int().min(0).max(59).nullable().optional().default(null),
  memo: z.string().default(""),
  plantNames: z.array(z.string().min(1)),
  matchAddresses: z.array(z.string().min(1)).default([])
});

export function createApp(store: Store, webDist: string) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/bootstrap", (_req, res) => {
    res.json(store.getDashboard());
  });

  app.get("/api/settings", (_req, res) => {
    res.json(store.getSettings());
  });

  app.put("/api/settings", (req, res) => {
    const payload = settingsSchema.parse(req.body) satisfies Partial<AppSettings>;
    const settings = store.updateSettings(payload);
    store.createLog("info", "settings", "시스템 설정을 저장했습니다.");
    res.json(settings);
  });

  app.get("/api/system/storage", (_req, res) => {
    const databaseFile = store.getDatabaseFile();
    const backupDir = path.join(path.dirname(databaseFile), "backups");
    const backups = fs.existsSync(backupDir)
      ? fs
          .readdirSync(backupDir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".db"))
          .map((entry) => {
            const fullPath = path.join(backupDir, entry.name);
            const stat = fs.statSync(fullPath);
            return {
              fileName: entry.name,
              sizeBytes: stat.size,
              modifiedAt: stat.mtime.toISOString()
            };
          })
          .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
      : [];

    res.json({
      databaseFile,
      backupDir,
      backups
    });
  });

  app.post("/api/system/database/backup", async (_req, res) => {
    const databaseFile = store.getDatabaseFile();
    const backupDir = path.join(path.dirname(databaseFile), "backups");
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+$/, "")
      .replace("T", "-");
    const fileName = `auto-tax-backup-${timestamp}.db`;
    const destinationFile = path.join(backupDir, fileName);

    await store.createDatabaseBackup(destinationFile);
    store.createLog("info", "system", "데이터베이스 백업을 생성했습니다.", { fileName });
    res.json({ ok: true, fileName, destinationFile });
  });

  app.post("/api/system/database/restore", (req, res) => {
    const body = z.object({ fileName: z.string().min(1) }).parse(req.body);
    const fileName = path.basename(body.fileName);
    const databaseFile = store.getDatabaseFile();
    const backupDir = path.join(path.dirname(databaseFile), "backups");
    const sourceFile = path.join(backupDir, fileName);

    if (!fs.existsSync(sourceFile)) {
      res.status(404).json({ error: "복원할 백업 파일을 찾지 못했습니다." });
      return;
    }

    store.restoreDatabaseBackup(sourceFile);
    applyEnvSettings(store);
    store.createLog("warn", "system", "데이터베이스를 백업 파일로 복원했습니다.", { fileName });
    res.json({ ok: true, fileName });
  });

  app.post("/api/system/mail-test", async (req, res) => {
    const payload = mailTestSchema.parse(req.body);
    const result = await testMailConnections(payload);
    res.json(result);
  });

  app.get("/api/customers", (_req, res) => {
    res.json(store.listCustomers());
  });

  app.post("/api/customers", (req, res) => {
    const payload = customerSchema.parse(req.body) satisfies CustomerInput;
    const customer = store.saveCustomer(payload);
    store.createLog("info", "customers", "고객을 등록했습니다.", { customerId: customer.id });
    res.status(201).json(customer);
  });

  app.put("/api/customers/:id", (req, res) => {
    const customerId = Number(req.params.id);
    const payload = customerSchema.parse(req.body) satisfies CustomerInput;
    const customer = store.saveCustomer(payload, customerId);
    store.createLog("info", "customers", "고객 정보를 수정했습니다.", { customerId });
    res.json(customer);
  });

  app.delete("/api/customers/:id", (req, res) => {
    const customerId = Number(req.params.id);
    const customer = store.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    store.deleteCustomer(customerId);
    store.createLog("warn", "customers", "고객과 관련 로컬 데이터를 삭제했습니다.", {
      customerId,
      customerName: customer.customerName
    });
    res.json({ ok: true });
  });

  app.post("/api/customers/:id/popbill/join", async (req, res) => {
    const customerId = Number(req.params.id);
    const customer = store.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = store.getSettings();

    if (customer.popbillState === "joined") {
      store.createLog("info", "popbill", "이미 가입된 고객이라 팝빌 가입을 건너뛰었습니다.", { customerId });
      res.json({ ok: true, status: "already-joined" });
      return;
    }

    const isExistingMember = await checkIsMember(settings, customer.businessNumber);
    if (isExistingMember) {
      store.updateCustomerPopbillState(customerId, "joined");
      store.createLog("info", "popbill", "기존 팝빌 연동회원으로 확인되어 로컬 상태를 joined로 연결했습니다.", { customerId });
      res.json({ ok: true, status: "linked-existing-member" });
      return;
    }

    try {
      const response = await joinMember(settings, customer);
      store.updateCustomerPopbillState(customerId, "joined");
      store.createLog("info", "popbill", "팝빌 연동회원 가입을 완료했습니다.", { customerId });
      res.json({ ok: true, status: "joined", response });
    } catch (error) {
      const fallbackMemberState = await checkIsMember(settings, customer.businessNumber).catch(() => false);
      if (fallbackMemberState) {
        store.updateCustomerPopbillState(customerId, "joined");
        store.createLog("warn", "popbill", "가입 중 중복/기존 회원으로 확인되어 로컬 상태를 joined로 보정했습니다.", {
          customerId,
          error: error instanceof Error ? error.message : String(error)
        });
        res.json({ ok: true, status: "linked-after-duplicate-check" });
        return;
      }
      throw error;
    }
  });

  app.post("/api/customers/:id/popbill/reset", (req, res) => {
    const customerId = Number(req.params.id);
    const customer = store.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const updated = store.resetCustomerPopbill(customerId);
    store.createLog("warn", "popbill", "고객의 팝빌 로컬 연결 상태를 초기화했습니다.", {
      customerId,
      customerName: customer.customerName
    });
    res.json(updated);
  });

  app.post("/api/customers/:id/popbill/quit", async (req, res) => {
    const customerId = Number(req.params.id);
    const customer = store.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = store.getSettings();
    if (!settings.popbillIsTest) {
      res.status(400).json({ error: "팝빌 탈퇴는 테스트 환경에서만 허용됩니다." });
      return;
    }

    const response = await quitMember(settings, customer, "AUTO-TAX 테스트 정리");
    const updated = store.resetCustomerPopbill(customerId);
    store.createLog("warn", "popbill", "팝빌 테스트 연동회원을 탈퇴 처리했습니다.", {
      customerId,
      customerName: customer.customerName
    });
    res.json({ ok: true, response, customer: updated });
  });

  app.post("/api/customers/:id/popbill/cert-url", async (req, res) => {
    const customerId = Number(req.params.id);
    const customer = store.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const url = await getTaxCertURL(store.getSettings(), customer);
    store.createLog("info", "popbill", "인증서 등록 URL을 발급했습니다.", { customerId });
    res.json({ url });
  });

  app.post("/api/customers/:id/popbill/cert-status", async (req, res) => {
    const customerId = Number(req.params.id);
    const customer = store.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const expireDate = await getCertificateExpireDate(store.getSettings(), customer);
    const updated = store.updateCustomerPopbillState(customerId, customer.popbillState, true, expireDate);
    store.createLog("info", "popbill", "인증서 만료일을 갱신했습니다.", { customerId, expireDate });
    res.json(updated);
  });

  app.post("/api/popbill/cert-status/refresh-all", async (_req, res) => {
    const result = await refreshAllCertificateStatuses(store);
    res.json(result);
  });

  app.get("/api/inbox", (_req, res) => {
    res.json(store.listInbox());
  });

  app.post("/api/inbox/:id/reprocess", async (req, res) => {
    const messageId = Number(req.params.id);
    const message = store.getInboxMessage(messageId);
    if (!message) {
      res.status(404).json({ error: "메일을 찾지 못했습니다." });
      return;
    }

    const result = await reprocessInboxMessage(store, messageId);
    res.json({ ok: true, ...result });
  });

  app.post("/api/mail/sync", async (_req, res) => {
    const result = await syncMailbox(store);
    res.json(result);
  });

  app.get("/api/drafts", (_req, res) => {
    res.json(store.listDrafts());
  });

  app.post("/api/drafts/:id/issue", async (req, res) => {
    const draftId = Number(req.params.id);
    const draft = store.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 대기건을 찾지 못했습니다." });
      return;
    }

    const claimedDraft = store.claimDraftForIssue(draftId);
    if (!claimedDraft) {
      res.status(409).json({ error: "이미 발행 중이거나 발행 가능한 상태가 아닙니다." });
      return;
    }

    const customer = store.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    try {
      const issued = await issueDraftNow(store, store.getSettings(), customer, claimedDraft);
      store.createLog("info", "drafts", "수동 발행을 완료했습니다.", { draftId, customerId: customer.id });
      res.json(issued);
    } catch (error) {
      const message = error instanceof Error ? error.message : "수동 발행 실패";
      const failed = store.updateDraftStatus(draftId, "failed", message);
      res.status(500).json(failed);
    }
  });

  app.post("/api/drafts/issue-all", async (_req, res) => {
    const drafts = store.listDrafts().filter((draft) => draft.status === "review" || draft.status === "failed");
    const results: Array<{ draftId: number; customerId: number; status: "issued" | "failed"; error?: string }> = [];

    for (const draft of drafts) {
      const claimedDraft = store.claimDraftForIssue(draft.id);
      if (!claimedDraft) {
        results.push({ draftId: draft.id, customerId: draft.customerId, status: "failed", error: "이미 발행 중이거나 발행 가능한 상태가 아닙니다." });
        continue;
      }

      const customer = store.getCustomer(draft.customerId);
      if (!customer) {
        store.updateDraftStatus(draft.id, "failed", "고객 정보를 찾지 못했습니다.");
        results.push({ draftId: draft.id, customerId: draft.customerId, status: "failed", error: "고객 정보를 찾지 못했습니다." });
        continue;
      }

      try {
        await issueDraftNow(store, store.getSettings(), customer, claimedDraft);
        results.push({ draftId: draft.id, customerId: customer.id, status: "issued" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "일괄 발행 실패";
        store.updateDraftStatus(draft.id, "failed", message);
        results.push({ draftId: draft.id, customerId: customer.id, status: "failed", error: message });
      }
    }

    store.createLog("info", "drafts", "검수 대기/실패 건 전체 발행을 실행했습니다.", {
      total: drafts.length,
      issued: results.filter((item) => item.status === "issued").length,
      failed: results.filter((item) => item.status === "failed").length
    });

    res.json({
      ok: true,
      total: drafts.length,
      issued: results.filter((item) => item.status === "issued").length,
      failed: results.filter((item) => item.status === "failed").length,
      results
    });
  });

  app.post("/api/drafts/:id/cancel", async (req, res) => {
    const draftId = Number(req.params.id);
    const draft = store.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    if (draft.status !== "issued") {
      res.status(400).json({ error: "발행 완료된 건만 취소할 수 있습니다." });
      return;
    }

    const customer = store.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const response = await cancelTaxInvoice(store.getSettings(), customer, draft, "AUTO-TAX 재발행 테스트 취소");
    const reopened = store.reopenIssuedDraftForReissue(draftId);
    store.createLog("warn", "drafts", "발행 완료 건을 취소하고 검수 대기로 되돌렸습니다.", {
      draftId,
      customerId: customer.id,
      previousMgtKey: draft.popbillMgtKey,
      nextMgtKey: reopened.popbillMgtKey
    });
    res.json({ ok: true, response, draft: reopened });
  });

  app.get("/api/drafts/:id/popbill/info", async (req, res) => {
    const draftId = Number(req.params.id);
    const draft = store.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = store.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const info = await getTaxInvoiceInfo(store.getSettings(), customer, draft);
    res.json(info);
  });

  app.get("/api/drafts/:id/popbill/view-url", async (req, res) => {
    const draftId = Number(req.params.id);
    const draft = store.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = store.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const url = await getTaxInvoiceViewURL(store.getSettings(), customer, draft);
    res.json({ url });
  });

  app.get("/api/drafts/:id/popbill/print-url", async (req, res) => {
    const draftId = Number(req.params.id);
    const draft = store.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = store.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const url = await getTaxInvoicePrintURL(store.getSettings(), customer, draft);
    res.json({ url });
  });

  app.get("/api/logs", (_req, res) => {
    res.json(store.listLogs());
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "서버 오류";
    store.createLog("error", "api", "API 요청 처리에 실패했습니다.", { error: message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "입력값이 올바르지 않습니다.", details: error.flatten() });
      return;
    }
    res.status(500).json({ error: message });
  });

  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  return app;
}

export function startServer(options: StartServerOptions = {}) {
  const rootDir = options.rootDir ?? path.resolve(process.cwd());
  const databaseFile = options.databaseFile
    ? resolvePathFromRoot(rootDir, options.databaseFile)
    : envString("AUTO_TAX_DB")
      ? resolvePathFromRoot(rootDir, envString("AUTO_TAX_DB") as string)
      : path.join(rootDir, "data", "auto-tax.db");
  const webDist = options.webDist
    ? resolvePathFromRoot(rootDir, options.webDist)
    : path.join(rootDir, "dist", "web");
  const port = options.port ?? Number(process.env.PORT ?? 4300);

  const store = new Store(databaseFile);
  applyEnvSettings(store);
  const scheduler = new Scheduler(store);
  const app = createApp(store, webDist);
  const server = app.listen(port, () => {
    store.createLog("info", "server", "AUTO-TAX 서버가 시작되었습니다.", { port });
    if (options.startScheduler === true) {
      scheduler.start();
    }
    const settings = store.getSettings();
    if (shouldRefreshCertificateStatuses(settings.certLastCheckedAt)) {
      void refreshAllCertificateStatuses(store).catch((error) => {
        const message = error instanceof Error ? error.message : "인증서 자동 점검 실패";
        store.createLog("error", "popbill", "앱 시작 시 인증서 자동 점검에 실패했습니다.", { error: message });
      });
    }
    console.log(`AUTO-TAX server listening on http://localhost:${port}`);
  });

  return {
    app,
    store,
    scheduler,
    server,
    port,
    databaseFile,
    webDist,
    close: () =>
      new Promise<void>((resolve, reject) => {
        scheduler.stop();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          store.close();
          resolve();
        });
      })
  };
}

function isDirectExecution(): boolean {
  const currentFile = fileURLToPath(import.meta.url);
  const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return currentFile === entryFile;
}

if (isDirectExecution()) {
  startServer();
}
