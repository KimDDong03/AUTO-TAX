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
  getPartnerBalance,
  getPartnerChargeURL,
  getTaxCertURL,
  getTaxInvoiceInfo,
  getTaxInvoicePrintURL,
  getTaxInvoiceViewURL,
  joinMember,
  quitMember
} from "./popbill-client.js";
import { RenewalAutomationManager } from "./renewal-automation.js";
import { Scheduler } from "./scheduler.js";
import type { AppStore } from "./store-contract.js";
import { resolveAuthenticatedAppSession, type AuthenticatedAppSession } from "./supabase.js";
import { SupabaseStore } from "./supabase-store.js";

export type StartServerOptions = {
  port?: number;
  rootDir?: string;
  webDist?: string;
  startScheduler?: boolean;
};

type RequestLocals = {
  authContext?: AuthenticatedAppSession;
  requestStore?: AppStore;
};

type ClientAppSettings = Pick<
  AppSettings,
  | "id"
  | "imapHost"
  | "imapPort"
  | "imapSecure"
  | "imapUser"
  | "imapPass"
  | "imapMailbox"
  | "smtpHost"
  | "smtpPort"
  | "smtpSecure"
  | "smtpUser"
  | "smtpPass"
  | "smtpFromName"
  | "smtpFromEmail"
  | "notificationEmails"
  | "defaultIssueDay"
  | "defaultIssueHour"
  | "defaultIssueMinute"
  | "mailPollMinutes"
  | "mailSyncStartAt"
  | "timezone"
  | "schedulerEnabled"
  | "certLastCheckedAt"
  | "certAlertLastSentAt"
  | "createdAt"
  | "updatedAt"
> & {
  popbillConfigured: boolean;
  operatorConfigured: boolean;
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

async function applyEnvSettings(store: AppStore): Promise<void> {
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
    mailSyncStartAt: envString("AUTO_TAX_MAIL_SYNC_START_AT"),
    timezone: envString("AUTO_TAX_TIMEZONE"),
    popbillLinkId: envString("AUTO_TAX_POPBILL_LINK_ID"),
    popbillSecretKey: envString("AUTO_TAX_POPBILL_SECRET_KEY"),
    popbillIsTest: envBool("AUTO_TAX_POPBILL_IS_TEST"),
    popbillPartnerCorpNum: envString("AUTO_TAX_POPBILL_PARTNER_CORP_NUM"),
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
    await store.updateSettings(filtered);
  }
}

async function enforceProductionMode(store: AppStore): Promise<void> {
  const settings = await store.getSettings();
  if (settings.popbillIsTest) {
    await store.updateSettings({ popbillIsTest: false });
  }
}

function toClientSettings(settings: AppSettings): ClientAppSettings {
  return {
    id: settings.id,
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapSecure: settings.imapSecure,
    imapUser: settings.imapUser,
    imapPass: settings.imapPass,
    imapMailbox: settings.imapMailbox,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser,
    smtpPass: settings.smtpPass,
    smtpFromName: settings.smtpFromName,
    smtpFromEmail: settings.smtpFromEmail,
    notificationEmails: settings.notificationEmails,
    defaultIssueDay: settings.defaultIssueDay,
    defaultIssueHour: settings.defaultIssueHour,
    defaultIssueMinute: settings.defaultIssueMinute,
    mailPollMinutes: settings.mailPollMinutes,
    mailSyncStartAt: settings.mailSyncStartAt,
    timezone: settings.timezone,
    schedulerEnabled: settings.schedulerEnabled,
    certLastCheckedAt: settings.certLastCheckedAt,
    certAlertLastSentAt: settings.certAlertLastSentAt,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
    popbillConfigured: Boolean(settings.popbillLinkId && settings.popbillSecretKey),
    operatorConfigured: Boolean(settings.operatorContactName && settings.operatorContactEmail && settings.operatorContactTel)
  };
}

function maskBusinessNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
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
  mailSyncStartAt: z.string().nullable(),
  timezone: z.string(),
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

const renewalAgentProcessSchema = z.object({
  detected: z.boolean(),
  names: z.array(z.string()),
  detail: z.string().nullable()
});

const renewalAgentPortSchema = z.object({
  port: z.number().int().positive(),
  protocol: z.union([z.literal("https"), z.literal("http")]),
  reachable: z.boolean(),
  latencyMs: z.number().finite().nullable(),
  error: z.string().nullable()
});

const renewalAgentBridgeSchema = z.object({
  summary: z.union([z.literal("ok"), z.literal("partial"), z.literal("down"), z.literal("unknown")]),
  ports: z.array(renewalAgentPortSchema),
  versionProbe: z.object({
    ok: z.boolean(),
    sourcePort: z.number().int().positive().nullable(),
    values: z.object({
      kpmcnt: z.string().nullable(),
      kpmsvc: z.string().nullable(),
      secukitNX: z.string().nullable()
    }),
    error: z.string().nullable()
  }),
  licenseProbe: z.object({
    ok: z.boolean(),
    sourcePort: z.number().int().positive().nullable(),
    error: z.string().nullable()
  }),
  storageProbe: z.object({
    ok: z.boolean(),
    sourcePort: z.number().int().positive().nullable(),
    mediaType: z.literal("HDD"),
    certificateCount: z.number().int().min(0),
    certificates: z.array(
      z.object({
        index: z.string(),
        cn: z.string(),
        issuerToName: z.string(),
        usageToName: z.string(),
        todate: z.string().nullable(),
        oid: z.string().nullable(),
        serial: z.string().nullable(),
        userDN: z.string().nullable(),
        validateFrom: z.string().nullable(),
        detailValidateTo: z.string().nullable(),
        certDirPath: z.string().nullable()
      })
    ),
    error: z.string().nullable()
  }),
  selectionProbe: z.object({
    ok: z.boolean(),
    sourcePort: z.number().int().positive().nullable(),
    certificateIndex: z.string().nullable(),
    certificateCn: z.string().nullable(),
    certID: z.string().nullable(),
    error: z.string().nullable()
  }),
  preflightProbe: z.object({
    ok: z.boolean(),
    sourcePort: z.number().int().positive().nullable(),
    certificateIndex: z.string().nullable(),
    certificateCn: z.string().nullable(),
    certID: z.string().nullable(),
    branch: z.union([
      z.literal("change-company"),
      z.literal("renew-info"),
      z.literal("renew-payment"),
      z.literal("password-confirm"),
      z.literal("unsupported"),
      z.literal("unknown")
    ]),
    branchPageUrl: z.string().nullable(),
    issueCompany: z.string().nullable(),
    companyChkYn: z.string().nullable(),
    policy: z.string().nullable(),
    orderNo: z.string().nullable(),
    orderSeq: z.string().nullable(),
    orderStatus: z.string().nullable(),
    orderApplySeCd: z.string().nullable(),
    payYn: z.string().nullable(),
    nextUrl: z.string().nullable(),
    actionImageUrl: z.string().nullable(),
    actionImageAlt: z.string().nullable(),
    externalFlowKind: z.union([z.literal("apply-form"), z.literal("unknown")]).nullable(),
    externalFlowProductName: z.string().nullable(),
    externalFlowProductId: z.string().nullable(),
    externalFlowSubmitUrl: z.string().nullable(),
    externalFlowSubmitPathKind: z.union([z.literal("apply"), z.literal("renew"), z.literal("unknown")]).nullable(),
    rawCode: z.string().nullable(),
    message: z.string().nullable(),
    error: z.string().nullable()
  })
});

const renewalAgentHeartbeatSchema = z.object({
  agentId: z.string().min(1),
  hostname: z.string().min(1),
  version: z.string().min(1),
  os: z.string().min(1),
  process: renewalAgentProcessSchema,
  bridge: renewalAgentBridgeSchema,
  notes: z.array(z.string()).default([])
});

const renewalAgentClaimSchema = z.object({
  agentId: z.string().min(1)
});

const renewalBridgeProbeRequestSchema = z.object({
  customerId: z.number().int().positive().nullable().optional()
});

const renewalCertIdProbeRequestSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  certificateIndex: z.number().int().positive(),
  certificateCn: z.string().nullable().optional()
});

const renewalPreflightRequestSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  certificateIndex: z.number().int().positive(),
  certificateCn: z.string().nullable().optional()
});

const renewalAgentCompleteSchema = z.object({
  agentId: z.string().min(1),
  result: z.object({
    process: renewalAgentProcessSchema,
    bridge: renewalAgentBridgeSchema,
    notes: z.array(z.string()).default([])
  })
});

const renewalAgentFailSchema = z.object({
  agentId: z.string().min(1),
  error: z.string().min(1)
});

function readAccessToken(req: express.Request): string | null {
  const authorization = req.header("authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function isAnonymousApiPath(req: express.Request): boolean {
  return (
    req.method === "OPTIONS" ||
    req.path === "/health" ||
    req.path === "/automation/renewal-agent/heartbeat" ||
    req.path === "/automation/renewal-agent/jobs/claim" ||
    /^\/automation\/renewal-agent\/jobs\/\d+\/(complete|fail)$/.test(req.path)
  );
}

function setRequestLocals(res: express.Response, authContext: AuthenticatedAppSession, requestStore: AppStore) {
  const locals = res.locals as RequestLocals;
  locals.authContext = authContext;
  locals.requestStore = requestStore;
}

function getRequestStore(res: express.Response, fallbackStore: AppStore): AppStore {
  const locals = res.locals as RequestLocals;
  return locals.requestStore ?? fallbackStore;
}

function requireAuthContext(res: express.Response): AuthenticatedAppSession {
  const locals = res.locals as RequestLocals;
  if (!locals.authContext) {
    throw new Error("로그인 정보가 없습니다.");
  }
  return locals.authContext;
}

export async function createApp(store: AppStore, webDist: string) {
  const app = express();
  const renewalAutomation = new RenewalAutomationManager();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.use("/api", async (req, res, next) => {
    if (isAnonymousApiPath(req)) {
      next();
      return;
    }

    const accessToken = readAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: "로그인이 필요합니다." });
      return;
    }

    try {
      const authContext = await resolveAuthenticatedAppSession(accessToken, req.header("x-organization-id"));
      const requestStore = new SupabaseStore({
        organizationId: authContext.activeOrganizationId,
        actorUserId: authContext.userId,
        bootstrapOrganization: false
      });
      await requestStore.initialize();
      setRequestLocals(res, authContext, requestStore);
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "로그인 확인에 실패했습니다.";
      res.status(401).json({ error: message });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/bootstrap", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    const authContext = requireAuthContext(res);
    const dashboard = await requestStore.getDashboard();
    res.json({
      ...dashboard,
      settings: toClientSettings(dashboard.settings),
      renewalAutomation: renewalAutomation.getSnapshot(),
      auth: authContext
    });
  });

  app.get("/api/automation/renewal-agent/snapshot", (_req, res) => {
    res.json(renewalAutomation.getSnapshot());
  });

  app.post("/api/automation/renewal-jobs/bridge-probe", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const payload = renewalBridgeProbeRequestSchema.parse(req.body ?? {});
    let customerName: string | null = null;

    if (payload.customerId !== undefined && payload.customerId !== null) {
      const customer = await requestStore.getCustomer(payload.customerId);
      if (!customer) {
        res.status(404).json({ error: "고객을 찾지 못했습니다." });
        return;
      }
      customerName = customer.customerName;
    }

    const job = renewalAutomation.queueBridgeProbe({
      customerId: payload.customerId ?? null,
      customerName,
      requestedBy: requireAuthContext(res).email ?? "web-ui"
    });

    await requestStore.createLog("info", "renewal-agent", "로컬 인증서 목록 진단 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-jobs/certid-probe", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const payload = renewalCertIdProbeRequestSchema.parse(req.body ?? {});
    let customerName: string | null = null;

    if (payload.customerId !== undefined && payload.customerId !== null) {
      const customer = await requestStore.getCustomer(payload.customerId);
      if (!customer) {
        res.status(404).json({ error: "고객을 찾지 못했습니다." });
        return;
      }
      customerName = customer.customerName;
    }

    const job = renewalAutomation.queueCertIdProbe({
      customerId: payload.customerId ?? null,
      customerName,
      certificateIndex: payload.certificateIndex,
      certificateCn: payload.certificateCn ?? null,
      requestedBy: requireAuthContext(res).email ?? "web-ui"
    });

    await requestStore.createLog("info", "renewal-agent", "로컬 인증서 certID 조회 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName,
      certificateIndex: job.certificateIndex,
      certificateCn: job.certificateCn
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-jobs/preflight", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const payload = renewalPreflightRequestSchema.parse(req.body ?? {});
    let customerName: string | null = null;

    if (payload.customerId !== undefined && payload.customerId !== null) {
      const customer = await requestStore.getCustomer(payload.customerId);
      if (!customer) {
        res.status(404).json({ error: "고객을 찾지 못했습니다." });
        return;
      }
      customerName = customer.customerName;
    }

    const job = renewalAutomation.queueRenewalPreflight({
      customerId: payload.customerId ?? null,
      customerName,
      certificateIndex: payload.certificateIndex,
      certificateCn: payload.certificateCn ?? null,
      requestedBy: requireAuthContext(res).email ?? "web-ui"
    });

    await requestStore.createLog("info", "renewal-agent", "로컬 인증서 갱신 경로 분석 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName,
      certificateIndex: job.certificateIndex,
      certificateCn: job.certificateCn
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-agent/heartbeat", (req, res) => {
    const payload = renewalAgentHeartbeatSchema.parse(req.body);
    const agent = renewalAutomation.recordHeartbeat(payload);
    res.json({ ok: true, agent });
  });

  app.post("/api/automation/renewal-agent/jobs/claim", (req, res) => {
    const payload = renewalAgentClaimSchema.parse(req.body);
    const job = renewalAutomation.claimNextJob(payload.agentId);
    res.json({ job });
  });

  app.post("/api/automation/renewal-agent/jobs/:id/complete", async (req, res) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = renewalAgentCompleteSchema.parse(req.body);
    const job = renewalAutomation.completeJob(params.id, payload.agentId, payload.result);

    await store.createLog(
      "info",
      "renewal-agent",
      job.type === "certid-probe"
        ? "로컬 인증서 certID 조회 작업이 완료되었습니다."
        : job.type === "renewal-preflight"
          ? "로컬 인증서 갱신 경로 분석 작업이 완료되었습니다."
          : "로컬 인증서 목록 진단 작업이 완료되었습니다.",
      {
      jobId: job.id,
      type: job.type,
      claimedBy: job.claimedBy,
      summary: job.summary
      }
    );

    res.json(job);
  });

  app.post("/api/automation/renewal-agent/jobs/:id/fail", async (req, res) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = renewalAgentFailSchema.parse(req.body);
    const job = renewalAutomation.failJob(params.id, payload.agentId, payload.error);

    await store.createLog(
      "warn",
      "renewal-agent",
      job.type === "certid-probe"
        ? "로컬 인증서 certID 조회 작업이 실패했습니다."
        : job.type === "renewal-preflight"
          ? "로컬 인증서 갱신 경로 분석 작업이 실패했습니다."
          : "로컬 인증서 목록 진단 작업이 실패했습니다.",
      {
      jobId: job.id,
      type: job.type,
      claimedBy: job.claimedBy,
      error: job.error
      }
    );

    res.json(job);
  });

  app.get("/api/settings", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(toClientSettings(await requestStore.getSettings()));
  });

  app.get("/api/popbill/partner-points", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    const settings = await requestStore.getSettings();
    const referenceCorpNum = settings.popbillPartnerCorpNum.trim();

    if (!settings.popbillLinkId || !settings.popbillSecretKey) {
      res.json({
        available: false,
        isTest: settings.popbillIsTest,
        referenceCorpNum: null,
        partnerRemainPoint: null,
        message: "팝빌 연결이 아직 준비되지 않았습니다."
      });
      return;
    }

    if (!referenceCorpNum) {
      res.json({
        available: false,
        isTest: settings.popbillIsTest,
        referenceCorpNum: null,
        partnerRemainPoint: null,
        message: "팝빌 파트너 결제 정보가 아직 준비되지 않았습니다."
      });
      return;
    }

    try {
      const partnerBalance = await getPartnerBalance(settings, referenceCorpNum);

      res.json({
        available: true,
        isTest: settings.popbillIsTest,
        referenceCorpNum: maskBusinessNumber(referenceCorpNum),
        partnerRemainPoint: partnerBalance.remainPoint,
        message: settings.popbillIsTest ? "팝빌 테스트 환경 파트너 포인트입니다." : "팝빌 운영 환경 파트너 포인트입니다."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "팝빌 파트너 포인트 조회에 실패했습니다.";
      res.json({
        available: false,
        isTest: settings.popbillIsTest,
        referenceCorpNum,
        partnerRemainPoint: null,
        message
      });
    }
  });

  app.get("/api/popbill/partner-charge-url", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    const settings = await requestStore.getSettings();
    const referenceCorpNum = settings.popbillPartnerCorpNum.trim();

    if (!settings.popbillLinkId || !settings.popbillSecretKey) {
      res.status(400).json({ error: "팝빌 연결이 아직 준비되지 않았습니다." });
      return;
    }

    if (!referenceCorpNum) {
      res.status(400).json({ error: "팝빌 파트너 결제 정보가 아직 준비되지 않았습니다." });
      return;
    }

    const url = await getPartnerChargeURL(settings, referenceCorpNum);
    await requestStore.createLog("info", "popbill", "파트너 포인트 충전 URL을 발급했습니다.", {
      referenceCorpNum,
      isTest: settings.popbillIsTest
    });
    res.json({ url });
  });

  app.put("/api/settings", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const payload = settingsSchema.parse(req.body) satisfies Partial<AppSettings>;
    const settings = await requestStore.updateSettings(payload);
    await requestStore.createLog("info", "settings", "시스템 설정을 저장했습니다.");
    res.json(toClientSettings(settings));
  });

  app.post("/api/system/mail-test", async (req, res) => {
    const payload = mailTestSchema.parse(req.body);
    const result = await testMailConnections(payload);
    res.json(result);
  });

  app.get("/api/customers", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listCustomers());
  });

  app.post("/api/customers", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const payload = customerSchema.parse(req.body) satisfies CustomerInput;
    const customer = await requestStore.saveCustomer(payload);
    await requestStore.createLog("info", "customers", "고객을 등록했습니다.", { customerId: customer.id });
    res.status(201).json(customer);
  });

  app.put("/api/customers/:id", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const payload = customerSchema.parse(req.body) satisfies CustomerInput;
    const customer = await requestStore.saveCustomer(payload, customerId);
    await requestStore.createLog("info", "customers", "고객 정보를 수정했습니다.", { customerId });
    res.json(customer);
  });

  app.delete("/api/customers/:id", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    await requestStore.deleteCustomer(customerId);
    await requestStore.createLog("warn", "customers", "고객과 관련 로컬 데이터를 삭제했습니다.", {
      customerId,
      customerName: customer.customerName
    });
    res.json({ ok: true });
  });

  app.post("/api/customers/:id/popbill/join", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await requestStore.getSettings();

    if (customer.popbillState === "joined") {
      await requestStore.createLog("info", "popbill", "이미 가입된 고객이라 팝빌 가입을 건너뛰었습니다.", { customerId });
      res.json({ ok: true, status: "already-joined" });
      return;
    }

    const isExistingMember = await checkIsMember(settings, customer.businessNumber);
    if (isExistingMember) {
      await requestStore.updateCustomerPopbillState(customerId, "joined");
      await requestStore.createLog("info", "popbill", "기존 팝빌 연동회원으로 확인되어 로컬 상태를 joined로 연결했습니다.", { customerId });
      res.json({ ok: true, status: "linked-existing-member" });
      return;
    }

    try {
      const response = await joinMember(settings, customer);
      await requestStore.updateCustomerPopbillState(customerId, "joined");
      await requestStore.createLog("info", "popbill", "팝빌 연동회원 가입을 완료했습니다.", { customerId });
      res.json({ ok: true, status: "joined", response });
    } catch (error) {
      const fallbackMemberState = await checkIsMember(settings, customer.businessNumber).catch(() => false);
      if (fallbackMemberState) {
        await requestStore.updateCustomerPopbillState(customerId, "joined");
        await requestStore.createLog("warn", "popbill", "가입 중 중복/기존 회원으로 확인되어 로컬 상태를 joined로 보정했습니다.", {
          customerId,
          error: error instanceof Error ? error.message : String(error)
        });
        res.json({ ok: true, status: "linked-after-duplicate-check" });
        return;
      }
      throw error;
    }
  });

  app.post("/api/customers/:id/popbill/reset", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const updated = await requestStore.resetCustomerPopbill(customerId);
    await requestStore.createLog("warn", "popbill", "고객의 팝빌 로컬 연결 상태를 초기화했습니다.", {
      customerId,
      customerName: customer.customerName
    });
    res.json(updated);
  });

  app.post("/api/customers/:id/popbill/quit", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await requestStore.getSettings();
    if (!settings.popbillIsTest) {
      res.status(400).json({ error: "팝빌 탈퇴는 테스트 환경에서만 허용됩니다." });
      return;
    }

    const response = await quitMember(settings, customer, "AUTO-TAX 테스트 정리");
    const updated = await requestStore.resetCustomerPopbill(customerId);
    await requestStore.createLog("warn", "popbill", "팝빌 테스트 연동회원을 탈퇴 처리했습니다.", {
      customerId,
      customerName: customer.customerName
    });
    res.json({ ok: true, response, customer: updated });
  });

  app.post("/api/customers/:id/popbill/cert-url", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const url = await getTaxCertURL(await requestStore.getSettings(), customer);
    await requestStore.createLog("info", "popbill", "인증서 등록 URL을 발급했습니다.", { customerId });
    res.json({ url });
  });

  app.post("/api/customers/:id/popbill/cert-status", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const expireDate = await getCertificateExpireDate(await requestStore.getSettings(), customer);
    const updated = await requestStore.updateCustomerPopbillState(customerId, customer.popbillState, true, expireDate);
    await requestStore.createLog("info", "popbill", "인증서 만료일을 갱신했습니다.", { customerId, expireDate });
    res.json(updated);
  });

  app.post("/api/popbill/cert-status/refresh-all", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    const result = await refreshAllCertificateStatuses(requestStore);
    res.json(result);
  });

  app.get("/api/inbox", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listInbox());
  });

  app.post("/api/inbox/:id/reprocess", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const messageId = Number(req.params.id);
    const message = await requestStore.getInboxMessage(messageId);
    if (!message) {
      res.status(404).json({ error: "메일을 찾지 못했습니다." });
      return;
    }

    const result = await reprocessInboxMessage(requestStore, messageId);
    res.json({ ok: true, ...result });
  });

  app.post("/api/mail/sync", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    const result = await syncMailbox(requestStore);
    res.json(result);
  });

  app.get("/api/drafts", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listDrafts());
  });

  app.post("/api/drafts/:id/issue", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 대기건을 찾지 못했습니다." });
      return;
    }

    const claimedDraft = await requestStore.claimDraftForIssue(draftId);
    if (!claimedDraft) {
      res.status(409).json({ error: "이미 발행 중이거나 발행 가능한 상태가 아닙니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    try {
      const issued = await issueDraftNow(requestStore, await requestStore.getSettings(), customer, claimedDraft);
      await requestStore.createLog("info", "drafts", "수동 발행을 완료했습니다.", { draftId, customerId: customer.id });
      res.json(issued);
    } catch (error) {
      const message = error instanceof Error ? error.message : "수동 발행 실패";
      const failed = await requestStore.updateDraftStatus(draftId, "failed", message);
      res.status(500).json(failed);
    }
  });

  app.post("/api/drafts/issue-all", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    const drafts = (await requestStore.listDrafts()).filter((draft) => draft.status === "review" || draft.status === "failed");
    const results: Array<{ draftId: number; customerId: number; status: "issued" | "failed"; error?: string }> = [];

    for (const draft of drafts) {
      const claimedDraft = await requestStore.claimDraftForIssue(draft.id);
      if (!claimedDraft) {
        results.push({ draftId: draft.id, customerId: draft.customerId, status: "failed", error: "이미 발행 중이거나 발행 가능한 상태가 아닙니다." });
        continue;
      }

      const customer = await requestStore.getCustomer(draft.customerId);
      if (!customer) {
        await requestStore.updateDraftStatus(draft.id, "failed", "고객 정보를 찾지 못했습니다.");
        results.push({ draftId: draft.id, customerId: draft.customerId, status: "failed", error: "고객 정보를 찾지 못했습니다." });
        continue;
      }

      try {
        await issueDraftNow(requestStore, await requestStore.getSettings(), customer, claimedDraft);
        results.push({ draftId: draft.id, customerId: customer.id, status: "issued" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "일괄 발행 실패";
        await requestStore.updateDraftStatus(draft.id, "failed", message);
        results.push({ draftId: draft.id, customerId: customer.id, status: "failed", error: message });
      }
    }

    await requestStore.createLog("info", "drafts", "검수 대기/실패 건 전체 발행을 실행했습니다.", {
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
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    if (draft.status !== "issued") {
      res.status(400).json({ error: "발행 완료된 건만 취소할 수 있습니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const response = await cancelTaxInvoice(await requestStore.getSettings(), customer, draft, "AUTO-TAX 재발행 테스트 취소");
    const reopened = await requestStore.reopenIssuedDraftForReissue(draftId);
    await requestStore.createLog("warn", "drafts", "발행 완료 건을 취소하고 검수 대기로 되돌렸습니다.", {
      draftId,
      customerId: customer.id,
      previousMgtKey: draft.popbillMgtKey,
      nextMgtKey: reopened.popbillMgtKey
    });
    res.json({ ok: true, response, draft: reopened });
  });

  app.get("/api/drafts/:id/popbill/info", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const info = await getTaxInvoiceInfo(await requestStore.getSettings(), customer, draft);
    res.json(info);
  });

  app.get("/api/drafts/:id/popbill/view-url", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const url = await getTaxInvoiceViewURL(await requestStore.getSettings(), customer, draft);
    res.json({ url });
  });

  app.get("/api/drafts/:id/popbill/print-url", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const url = await getTaxInvoicePrintURL(await requestStore.getSettings(), customer, draft);
    res.json({ url });
  });

  app.get("/api/logs", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listLogs());
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "서버 오류";
    const requestStore = getRequestStore(res, store);
    void requestStore.createLog("error", "api", "API 요청 처리에 실패했습니다.", { error: message });
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

export async function createConfiguredStore(options: { bootstrapOrganization?: boolean } = {}) {
  const store = new SupabaseStore({
    bootstrapOrganization: options.bootstrapOrganization ?? true
  });
  await store.initialize();
  await applyEnvSettings(store);
  await enforceProductionMode(store);
  return store;
}

export async function startServer(options: StartServerOptions = {}) {
  const rootDir = options.rootDir ?? path.resolve(process.cwd());
  const webDist = options.webDist
    ? resolvePathFromRoot(rootDir, options.webDist)
    : path.join(rootDir, "dist", "web");
  const port = options.port ?? Number(process.env.PORT ?? 4300);

  const store = await createConfiguredStore();
  const scheduler = new Scheduler(store);
  const app = await createApp(store, webDist);
  const server = app.listen(port, () => {
    void store.createLog("info", "server", "AUTO-TAX 서버가 시작되었습니다.", { port });
    if (options.startScheduler === true) {
      scheduler.start();
    }
    void store.getSettings().then((settings) => {
      if (!shouldRefreshCertificateStatuses(settings.certLastCheckedAt)) {
        return;
      }
      void refreshAllCertificateStatuses(store).catch((error) => {
        const message = error instanceof Error ? error.message : "인증서 자동 점검 실패";
        void store.createLog("error", "popbill", "앱 시작 시 인증서 자동 점검에 실패했습니다.", { error: message });
      });
    });
    console.log(`AUTO-TAX server listening on http://localhost:${port}`);
  });

  return {
    app,
    store,
    scheduler,
    server,
    port,
    webDist,
    close: () =>
      new Promise<void>((resolve, reject) => {
        scheduler.stop();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          void store.close().then(resolve).catch(reject);
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
  void startServer();
}
