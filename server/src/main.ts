import "dotenv/config";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors, { type CorsOptions } from "cors";
import express from "express";
import { z } from "zod";
import { resolveRoadAddress } from "./address-resolver.js";
import { createApiAuthMiddleware, createInternalJobAccessGuard, createRenewalAgentAccessGuard, getLoggingStore, getRequestStore, requireAuthContext, requireOrganizationOwner, requirePlatformAdmin, requireWorkspaceEditor } from "./api-access.js";
import { registerAppShell } from "./app-shell.js";
import { createWorkspaceLoginEmail, isEmailLikeAccount, normalizeEmail, normalizeLoginId } from "./auth-utils.js";
import { findAuthUserByLoginId, listAllAuthUsers, upsertAuthUserLoginIndex } from "./auth-user-service.js";
import { issueDraftNow } from "./automation.js";
import { refreshAllCertificateStatuses, shouldRefreshCertificateStatuses } from "./certificate-monitor.js";
import type { AppSettings, Customer, CustomerInput, DashboardPayload } from "./domain.js";
import { buildApiErrorBody, getErrorMessage, getErrorStatus, HttpError } from "./http-errors.js";
import { testMailConnections } from "./mail-test.js";
import { reprocessInboxMessage } from "./mail-reprocess.js";
import { syncMailbox } from "./mail-sync.js";
import { buildPilotLogContext } from "./pilot-issuance.js";
import {
  cancelTaxInvoice,
  checkIsMember,
  getCertificateExpireDate,
  getPartnerBalance,
  getPartnerChargeURL,
  getTaxInvoiceUnitCost,
  getTaxCertURL,
  getTaxInvoiceInfo,
  getTaxInvoicePrintURL,
  getTaxInvoiceViewURL,
  joinMember,
  PopbillApiError,
  quitMember
} from "./popbill-client.js";
import { registerCoreRoutes } from "./routes/core-routes.js";
import { registerCustomerPopbillRoutes } from "./routes/customer-popbill-routes.js";
import { dispatchRecurringJobs, runDueJobs } from "./job-queue.js";
import { runPlatformMaintenance } from "./maintenance-retention.js";
import { registerDraftRoutes } from "./routes/draft-routes.js";
import { registerMailRoutes } from "./routes/mail-routes.js";
import { registerOrganizationMemberRoutes } from "./routes/organization-member-routes.js";
import { registerOpsRoutes } from "./routes/ops-routes.js";
import { RenewalAutomationManager } from "./renewal-automation.js";
import { registerRenewalRoutes } from "./routes/renewal-routes.js";
import { registerSettingsRoutes } from "./routes/settings-routes.js";
import { Scheduler } from "./scheduler.js";
import {
  buildCustomerImportPreview as buildCustomerImportPreviewService,
  commitCustomerImport,
  normalizeCustomerImportRow as normalizeCustomerImportRowService
} from "./services/customer-import-service.js";
import {
  createCustomerOnboardingPreviewSession,
  getCustomerOnboardingCommitBatchStatus,
  startCustomerOnboardingCommitBatch
} from "./services/customer-onboarding-batch-service.js";
import {
  assertDraftPopbillEnvironment,
  backfillDraftPopbillEnvironmentIfMissing
} from "./services/draft-service.js";
import { autoJoinCustomerPopbill } from "./services/popbill-customer-service.js";
import { applyServerManagedSettings, getServerManagedSettings } from "./server-managed-settings.js";
import type { AppStore } from "./store-contract.js";
import {
  createSupabaseAdminClient,
  createSupabasePublicClient,
  resolveAuthenticatedAppSession,
  type AuthenticatedAppSession
} from "./supabase.js";
import { SupabaseStore } from "./supabase-store.js";
import { digitsOnly, nowIso } from "./utils.js";
import { createDeterministicUuid, createWorkspaceAdminService, createWorkspaceSeed } from "./workspace-admin-service.js";

export type StartServerOptions = {
  port?: number;
  rootDir?: string;
  webDist?: string;
  startScheduler?: boolean;
  storeInitializationTimeoutMs?: number;
  allowStoreInitializationFailure?: boolean;
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
  | "mailConnectionVerifiedAt"
  | "notificationEmails"
  | "defaultIssueDay"
  | "defaultIssueHour"
  | "defaultIssueMinute"
  | "mailPollMinutes"
  | "mailSyncStartAt"
  | "timezone"
  | "popbillIsTest"
  | "popbillUserIdPrefix"
  | "popbillSharedPassword"
  | "operatorContactName"
  | "operatorContactEmail"
  | "operatorContactTel"
  | "renewalContactDepartment"
  | "renewalContactFax"
  | "renewalCertificatePassword"
  | "renewalIssuePassword"
  | "schedulerEnabled"
  | "certLastCheckedAt"
  | "certAlertLastSentAt"
  | "createdAt"
  | "updatedAt"
> & {
  mailPasswordConfigured: boolean;
  popbillConfigured: boolean;
  popbillSharedPasswordConfigured: boolean;
  renewalCertificatePasswordConfigured: boolean;
  renewalIssuePasswordConfigured: boolean;
  operatorConfigured: boolean;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimiterOptions = {
  keyPrefix: string;
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: express.Request) => string;
  persistent?: boolean;
};

const rateLimitEntries = new Map<string, RateLimitEntry>();
const DEFAULT_ALLOWED_WEB_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://[::1]:5173"
] as const;
const LOOPBACK_WEB_ORIGIN_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:35119",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

function isUniqueViolation(error: { code?: unknown; message?: unknown } | null | undefined, constraintName?: string) {
  if (!error) {
    return false;
  }

  const errorCode = typeof error.code === "string" ? error.code : String(error.code ?? "");
  const message = typeof error.message === "string" ? error.message.toLowerCase() : String(error.message ?? "").toLowerCase();
  const normalizedConstraint = constraintName?.toLowerCase() ?? null;
  return (
    errorCode === "23505" &&
    (normalizedConstraint === null || message.includes(normalizedConstraint) || message.includes("duplicate"))
  );
}

function envString(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

function shouldAllowLoopbackOrigins(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isProductionRuntime(env);
}

function collectAllowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const allowed = new Set<string>();
  const configuredOrigins = env.AUTO_TAX_ALLOWED_ORIGINS?.trim() || undefined;
  const configuredServerUrl = env.AUTO_TAX_SERVER_URL?.trim() || undefined;
  const configuredVercelUrl = env.VERCEL_URL?.trim() || undefined;

  if (shouldAllowLoopbackOrigins(env)) {
    for (const origin of DEFAULT_ALLOWED_WEB_ORIGINS) {
      allowed.add(origin);
    }
  }

  if (configuredOrigins) {
    for (const entry of configuredOrigins.split(",")) {
      const normalized = normalizeOrigin(entry);
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }

  const normalizedServerOrigin = normalizeOrigin(configuredServerUrl);
  if (normalizedServerOrigin) {
    allowed.add(normalizedServerOrigin);
  }

  const normalizedVercelOrigin = normalizeOrigin(
    configuredVercelUrl && /^https?:\/\//i.test(configuredVercelUrl)
      ? configuredVercelUrl
      : configuredVercelUrl
        ? `https://${configuredVercelUrl}`
        : undefined
  );
  if (normalizedVercelOrigin) {
    allowed.add(normalizedVercelOrigin);
  }

  return allowed;
}

function isLoopbackWebOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      LOOPBACK_WEB_ORIGIN_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(
  origin: string | null | undefined,
  allowedOrigins = collectAllowedOrigins(),
  allowLoopbackOrigins = shouldAllowLoopbackOrigins()
): boolean {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  return allowedOrigins.has(normalized) || (allowLoopbackOrigins && isLoopbackWebOrigin(normalized));
}

export function buildClientApiErrorBody(error: unknown, status: number) {
  if (status >= 500 && !(error instanceof PopbillApiError) && !(error instanceof HttpError)) {
    return { error: "서버 오류가 발생했습니다." };
  }

  return buildApiErrorBody(error, "서버 오류가 발생했습니다.");
}

function createCorsOptions(): CorsOptions {
  const allowedOrigins = collectAllowedOrigins();
  const allowLoopbackOrigins = shouldAllowLoopbackOrigins();

  return {
    origin(origin, callback) {
      callback(null, isAllowedCorsOrigin(origin, allowedOrigins, allowLoopbackOrigins));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Organization-Id",
      "X-Auto-Tax-Job-Secret",
      "X-Auto-Tax-Agent-Secret"
    ],
    exposedHeaders: ["Retry-After"],
    maxAge: 60 * 60
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isSecureRequest(req: express.Request): boolean {
  if (req.secure) {
    return true;
  }

  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwardedProto === "https";
}

function resolveRequestIp(req: express.Request): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded
      .split(",")
      .map((item) => item.trim())
      .find(Boolean);
    if (first) {
      return first;
    }
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

function resolveApiErrorCategory(status: number, message: string, error: unknown): "auth/session" | "external-api" | null {
  if (error instanceof PopbillApiError) {
    return "external-api";
  }

  if (status === 401 || status === 403 || /인증|세션|로그인|권한/.test(message)) {
    return "auth/session";
  }

  return null;
}

function pruneExpiredRateLimitEntries(now: number): void {
  for (const [key, entry] of rateLimitEntries) {
    if (entry.resetAt <= now) {
      rateLimitEntries.delete(key);
    }
  }
}

function createRateLimiter(options: RateLimiterOptions): express.RequestHandler {
  const applyMemoryLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    if (rateLimitEntries.size > 1024) {
      pruneExpiredRateLimitEntries(now);
    }

    const scopedKey = options.keyGenerator?.(req) ?? resolveRequestIp(req);
    const key = `${options.keyPrefix}:${scopedKey}`;
    const current = rateLimitEntries.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitEntries.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      next();
      return;
    }

    if (current.count >= options.max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      res.status(429).json({ error: options.message });
      return;
    }

    current.count += 1;
    rateLimitEntries.set(key, current);
    next();
  };

  if (!options.persistent) {
    return applyMemoryLimit;
  }

  return async (req, res, next) => {
    const now = Date.now();
    const scopedKey = options.keyGenerator?.(req) ?? resolveRequestIp(req);
    const rateKey = createHash("sha256").update(`${options.keyPrefix}:${scopedKey}`).digest("hex");
    const resetAt = new Date(now + options.windowMs).toISOString();

    try {
      const { data, error } = await createSupabaseAdminClient().rpc("increment_public_rate_limit", {
        p_key: rateKey,
        p_window_reset_at: resetAt
      });
      if (error) {
        throw error;
      }

      const count = Number((data as { count?: unknown } | null)?.count ?? 1);
      const effectiveResetAt = String((data as { reset_at?: unknown } | null)?.reset_at ?? resetAt);
      if (count > options.max) {
        const retryMs = Math.max(0, new Date(effectiveResetAt).getTime() - now);
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryMs / 1000))));
        res.status(429).json({ error: options.message });
        return;
      }

      next();
    } catch {
      applyMemoryLimit(req, res, next);
    }
  };
}

function resolvePathFromRoot(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

export function toClientSettings(settings: AppSettings): ClientAppSettings {
  const runtimeSettings = applyServerManagedSettings(settings);
  const mailPasswordConfigured = Boolean(trimOrNull(settings.imapPass) || trimOrNull(settings.smtpPass));
  const popbillSharedPasswordConfigured = Boolean(trimOrNull(runtimeSettings.popbillSharedPassword));
  const renewalCertificatePasswordConfigured = Boolean(trimOrNull(settings.renewalCertificatePassword));
  const renewalIssuePasswordConfigured = Boolean(trimOrNull(settings.renewalIssuePassword));
  return {
    id: settings.id,
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapSecure: settings.imapSecure,
    imapUser: settings.imapUser,
    imapPass: "",
    imapMailbox: settings.imapMailbox,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser,
    smtpPass: "",
    smtpFromName: settings.smtpFromName,
    smtpFromEmail: settings.smtpFromEmail,
    mailConnectionVerifiedAt: settings.mailConnectionVerifiedAt,
    notificationEmails: settings.notificationEmails,
    defaultIssueDay: settings.defaultIssueDay,
    defaultIssueHour: settings.defaultIssueHour,
    defaultIssueMinute: settings.defaultIssueMinute,
    mailPollMinutes: settings.mailPollMinutes,
    mailSyncStartAt: settings.mailSyncStartAt,
    timezone: settings.timezone,
    popbillIsTest: runtimeSettings.popbillIsTest,
    popbillUserIdPrefix: "",
    popbillSharedPassword: "",
    operatorContactName: settings.operatorContactName,
    operatorContactEmail: settings.operatorContactEmail,
    operatorContactTel: settings.operatorContactTel,
    renewalContactDepartment: settings.renewalContactDepartment,
    renewalContactFax: settings.renewalContactFax,
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: settings.schedulerEnabled,
    certLastCheckedAt: settings.certLastCheckedAt,
    certAlertLastSentAt: settings.certAlertLastSentAt,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
    mailPasswordConfigured,
    popbillConfigured: Boolean(runtimeSettings.popbillLinkId && runtimeSettings.popbillSecretKey),
    popbillSharedPasswordConfigured,
    renewalCertificatePasswordConfigured,
    renewalIssuePasswordConfigured,
    operatorConfigured: Boolean(
      runtimeSettings.popbillUserIdPrefix &&
      popbillSharedPasswordConfigured &&
      settings.operatorContactName &&
      settings.operatorContactEmail &&
      settings.operatorContactTel
    )
  };
}

function toClientCustomer(customer: Customer): Customer {
  return {
    ...customer,
    popbillPassword: ""
  };
}

function createEmptySettings(): AppSettings {
  const timestamp = nowIso();
  return {
    id: 1,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    imapUser: "",
    imapPass: "",
    imapMailbox: "INBOX",
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "",
    smtpPass: "",
    smtpFromName: "AUTO-TAX",
    smtpFromEmail: "",
    mailConnectionVerifiedAt: null,
    notificationEmails: [],
    defaultIssueDay: 20,
    defaultIssueHour: 9,
    defaultIssueMinute: 0,
    mailPollMinutes: 1440,
    mailSyncStartAt: null,
    timezone: "Asia/Seoul",
    popbillLinkId: "",
    popbillSecretKey: "",
    popbillIsTest: false,
    popbillPartnerCorpNum: "",
    popbillUserIdPrefix: "TEST_",
    popbillSharedPassword: "",
    operatorContactName: "",
    operatorContactEmail: "",
    operatorContactTel: "",
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: true,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createEmptyBootstrapWorkspace(): Omit<DashboardPayload, "logs" | "renewalAutomation"> {
  return {
    settings: createEmptySettings(),
    customers: [],
    customerCertificates: [],
    drafts: [],
    inbox: [],
    counts: {
      actionableDrafts: 0,
      customers: 0,
      reviewDrafts: 0,
      scheduledDrafts: 0,
      failedDrafts: 0,
      unmatchedMessages: 0
    }
  };
}

function maskBusinessNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

const customerSchema = z.object({
  customerName: z.string().min(1),
  businessNumber: z.string().min(1),
  corpName: z.string().min(1),
  ceoName: z.string().trim().optional().default(""),
  addr: z.string().min(1),
  bizType: z.string().min(1),
  bizClass: z.string().min(1),
  issueMode: z.literal("review").optional().default("review"),
  issueDay: z.number().int().min(1).max(31).nullable().optional().default(null),
  issueHour: z.number().int().min(0).max(23).nullable().optional().default(null),
  issueMinute: z.number().int().min(0).max(59).nullable().optional().default(null),
  renewalContactMobile: z.string().default(""),
  memo: z.string().default(""),
  plantNames: z.array(z.string().min(1)).default([]),
  matchAddresses: z.array(z.string().min(1)).default([])
});

function normalizeCustomerInput(payload: z.infer<typeof customerSchema>): CustomerInput {
  const customerName = payload.customerName.trim();
  return {
    customerName,
    businessNumber: payload.businessNumber,
    corpName: payload.corpName,
    ceoName: customerName,
    addr: payload.addr,
    bizType: payload.bizType,
    bizClass: payload.bizClass,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: payload.renewalContactMobile,
    memo: payload.memo,
    plantNames: payload.plantNames,
    matchAddresses: payload.matchAddresses
  };
}

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
    renewInfoPageTitle: z.string().nullable(),
    renewInfoSubmitUrl: z.string().nullable(),
    renewInfoSubmitPathKind: z.union([z.literal("apply"), z.literal("renew"), z.literal("unknown")]).nullable(),
    renewInfoFormFieldNames: z.array(z.string()),
    renewInfoMustHaveFieldNames: z.array(z.string()),
    renewInfoFinalNum: z.string().nullable(),
    renewInfoSnapshot: z.object({
      companyName: z.string().nullable(),
      businessNumber: z.string().nullable(),
      ceoName: z.string().nullable(),
      bizType: z.string().nullable(),
      bizClass: z.string().nullable(),
      businessFieldCode: z.string().nullable(),
      postalCode: z.string().nullable(),
      baseAddress: z.string().nullable(),
      detailAddress: z.string().nullable(),
      contactName: z.string().nullable(),
      contactDepartment: z.string().nullable(),
      contactEmail: z.string().nullable(),
      contactTel: z.string().nullable(),
      contactFax: z.string().nullable(),
      contactMobile: z.string().nullable()
    }).nullable(),
    renewInfoBlockingMismatchFields: z.array(z.string()),
    renewInfoAutoSubmitReady: z.boolean().nullable(),
    renewInfoAutoSubmitSummary: z.string().nullable(),
    renewInfoSubmitMissingFields: z.array(z.string()),
    renewInfoSubmitReady: z.boolean().nullable(),
    renewInfoSubmitSummary: z.string().nullable(),
    renewInfoSubmitAttempted: z.boolean().nullable(),
    renewInfoSubmitResultBranch: z.union([
      z.literal("renew-info"),
      z.literal("renew-payment"),
      z.literal("password-confirm"),
      z.literal("unknown")
    ]).nullable(),
    renewInfoSubmitResultUrl: z.string().nullable(),
    renewInfoSubmitResultPageTitle: z.string().nullable(),
    renewInfoSubmitResultSummary: z.string().nullable(),
    renewInfoSubmitResultError: z.string().nullable(),
    renewInfoPaymentPreviewLoaded: z.boolean().nullable(),
    renewInfoPaymentPreviewItems: z.array(z.string()),
    renewInfoPaymentPreviewTotalAmount: z.string().nullable(),
    renewInfoPaymentPreviewHasAdditionalAgreement: z.boolean().nullable(),
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
  certificateCn: z.string().nullable().optional(),
  executeSubmit: z.boolean().optional()
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

function readJobSecret(req: express.Request): string | null {
  const headerValue = req.header("x-auto-tax-job-secret")?.trim();
  if (headerValue) {
    return headerValue;
  }

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

function hasValidJobSecret(req: express.Request): boolean {
  const configuredSecret = envString("AUTO_TAX_JOB_SECRET");
  if (!configuredSecret) {
    return false;
  }

  return readJobSecret(req) === configuredSecret;
}

function readRenewalAgentSecret(req: express.Request): string | null {
  const dedicatedHeader = req.header("x-auto-tax-agent-secret")?.trim();
  if (dedicatedHeader) {
    return dedicatedHeader;
  }

  return readJobSecret(req);
}

function hasValidRenewalAgentSecret(req: express.Request): boolean {
  const configuredSecret = envString("AUTO_TAX_RENEWAL_AGENT_SECRET") ?? envString("AUTO_TAX_JOB_SECRET");
  if (!configuredSecret) {
    return false;
  }

  return readRenewalAgentSecret(req) === configuredSecret;
}

const publicLoginLimiter = createRateLimiter({
  keyPrefix: "public-login",
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  persistent: true,
  keyGenerator: (req) => {
    const account =
      req.body && typeof req.body === "object" && "account" in req.body
        ? String((req.body as { account?: string }).account ?? "").trim().toLowerCase()
        : "";
    return `${resolveRequestIp(req)}:${account}`;
  }
});

const publicConsultationLimiter = createRateLimiter({
  keyPrefix: "public-consultation",
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "상담 신청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  persistent: true,
  keyGenerator: (req) => resolveRequestIp(req)
});

const publicSignupLimiter = createRateLimiter({
  keyPrefix: "public-signup",
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "회원가입 신청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  persistent: true,
  keyGenerator: (req) => resolveRequestIp(req)
});

const requireInternalJobAccess = createInternalJobAccessGuard({
  hasValidJobSecret
});

const requireRenewalAgentAccess = createRenewalAgentAccessGuard({
  hasValidRenewalAgentSecret
});

const {
  listOpsWorkspaces,
  getOpsWorkspaceSummaryById,
  listOrganizationMembers
} = createWorkspaceAdminService({
  createSupabaseAdminClient
});

export async function createApp(store: AppStore | null, webDist: string, rootDir = process.cwd()) {
  const app = express();
  const renewalAutomation = new RenewalAutomationManager();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(cors(createCorsOptions()));
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
    }
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );

    if (req.path.startsWith("/api")) {
      res.setHeader("Cache-Control", "no-store");
    }

    if (isSecureRequest(req)) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  });

  app.use(
    "/api",
    createApiAuthMiddleware({
      hasValidJobSecret,
      hasValidRenewalAgentSecret,
      resolveAuthenticatedAppSession,
      createLoggingStoreForOrganizationId: async ({ organizationId, actorUserId }) => {
        const loggingStore = new SupabaseStore({
          organizationId,
          actorUserId: actorUserId ?? undefined,
          bootstrapOrganization: false
        });
        await loggingStore.initialize();
        return loggingStore;
      },
      createRequestStore: async (authContext: AuthenticatedAppSession) => {
        const requestStore = new SupabaseStore({
          organizationId: authContext.activeOrganizationId ?? undefined,
          actorUserId: authContext.userId,
          bootstrapOrganization: false
        });
        await requestStore.initialize();
        return requestStore;
      }
    })
  );

  registerCoreRoutes({
    app,
    store,
    getRequestStore,
    requireAuthContext,
    requireInternalJobAccess,
    publicLoginLimiter,
    publicSignupLimiter,
    publicConsultationLimiter,
    createSupabaseAdminClient,
    createSupabasePublicClient,
    resolveAuthenticatedAppSession,
    findAuthUserByLoginId,
    isEmailLikeAccount,
    normalizeLoginId,
    normalizeEmail,
    createWorkspaceLoginEmail,
    upsertAuthUserLoginIndex,
    createEmptyBootstrapWorkspace,
    createEmptySettings,
    toClientSettings,
    toClientCustomer,
    runPlatformMaintenance,
    dispatchRecurringJobs,
    runDueJobs
  });

  registerOrganizationMemberRoutes({
    app,
    store,
    getRequestStore,
    requireOrganizationOwner,
    createSupabaseAdminClient,
    listOrganizationMembers,
    normalizeLoginId,
    findAuthUserByLoginId,
    createWorkspaceLoginEmail,
    upsertAuthUserLoginIndex,
    listAllAuthUsers
  });

  registerOpsRoutes({
    app,
    requirePlatformAdmin,
    createSupabaseAdminClient,
    createOrganizationStore: async ({ organizationId, actorUserId }) => {
      const requestStore = new SupabaseStore({
        organizationId,
        actorUserId: actorUserId ?? undefined,
        bootstrapOrganization: false
      });
      await requestStore.initialize();
      return requestStore;
    },
    listOpsWorkspaces,
    getOpsWorkspaceSummaryById,
    toClientSettings,
    testMailConnections,
    normalizeLoginId,
    createWorkspaceSeed,
    createDeterministicUuid,
    findAuthUserByLoginId,
    createWorkspaceLoginEmail,
    upsertAuthUserLoginIndex,
    isUniqueViolation: (error: unknown, constraintName?: string) =>
      isUniqueViolation(error as { code?: unknown; message?: unknown } | null | undefined, constraintName),
    listAllAuthUsers
  });

  registerRenewalRoutes({
    app,
    store,
    getRequestStore,
    requirePlatformAdmin,
    requireAuthContext,
    requireWorkspaceEditor,
    requireRenewalAgentAccess,
    renewalAutomation,
    renewalBridgeProbeRequestSchema,
    renewalCertIdProbeRequestSchema,
    renewalPreflightRequestSchema,
    renewalAgentHeartbeatSchema,
    renewalAgentClaimSchema,
    renewalAgentCompleteSchema,
    renewalAgentFailSchema
  });

  registerSettingsRoutes({
    app,
    store,
    getRequestStore,
    requireWorkspaceEditor,
    requirePlatformAdmin,
    getLoggingStore,
    getServerManagedSettings,
    applyServerManagedSettings,
    createEmptySettings,
    toClientSettings,
    testMailConnections,
    resolveRoadAddress,
    getPartnerBalance,
    getTaxInvoiceUnitCost,
    getPartnerChargeURL,
    maskBusinessNumber,
    normalizeCustomerImportRow: normalizeCustomerImportRowService,
    buildCustomerImportPreview: buildCustomerImportPreviewService,
    commitCustomerImport,
    createCustomerOnboardingPreviewSession,
    startCustomerOnboardingCommitBatch,
    getCustomerOnboardingCommitBatchStatus,
    runDueJobs: ({ limit, claimedBy }) =>
      runDueJobs({
        limit,
        claimedBy
      })
  });

  registerCustomerPopbillRoutes({
    app,
    store,
    getRequestStore,
    requireWorkspaceEditor,
    getServerManagedSettings,
    customerSchema,
    normalizeCustomerInput: (input: unknown) => normalizeCustomerInput(input as z.infer<typeof customerSchema>),
    autoJoinCustomerPopbill: (requestStore: AppStore, customer: Customer) =>
      autoJoinCustomerPopbill(requestStore, customer, getServerManagedSettings, getErrorMessage),
    toClientCustomer,
    refreshAllCertificateStatuses,
    renewalAutomation
  });

  registerMailRoutes({
    app,
    store,
    getRequestStore,
    requireWorkspaceEditor,
    reprocessInboxMessage,
    syncMailbox
  });

  registerDraftRoutes({
    app,
    store,
    getRequestStore,
    requireWorkspaceEditor,
    getServerManagedSettings,
    getErrorMessage,
    getErrorStatus,
    buildApiErrorBody,
    assertDraftPopbillEnvironment,
    backfillDraftPopbillEnvironmentIfMissing
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "서버 오류";
    const status = getErrorStatus(error, 500);
    const errorCategory = resolveApiErrorCategory(status, message, error);
    const loggingStore = getLoggingStore(res, store);
    void loggingStore?.createLog(
      "error",
      "api",
      "API 요청 처리에 실패했습니다.",
      buildPilotLogContext(
        {
          error: message,
          stack: error instanceof Error ? error.stack ?? null : null
        },
        {
          status,
          errorCategory: errorCategory ?? undefined,
          errorCode: error instanceof PopbillApiError ? error.code : undefined,
          errorOperation: error instanceof PopbillApiError ? error.operation : undefined
        }
      )
    );
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "입력값이 올바르지 않습니다.", details: error.flatten() });
      return;
    }
    res.status(status).json(buildClientApiErrorBody(error, status));
  });

  registerAppShell({
    app,
    store,
    requirePlatformAdmin,
    webDist,
    renewalHelperZipPath: envString("AUTO_TAX_RENEWAL_HELPER_ZIP_PATH")
      ? resolvePathFromRoot(rootDir, envString("AUTO_TAX_RENEWAL_HELPER_ZIP_PATH") as string)
      : path.join(rootDir, "dist", "renewal-local-helper.zip")
  });

  return app;
}

function isNoOrganizationStoreError(error: unknown): boolean {
  return error instanceof Error && error.message === "사용 가능한 조직이 없습니다.";
}

class StoreInitializationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Supabase 초기화가 ${timeoutMs}ms 안에 완료되지 않았습니다.`);
  }
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return undefined;
}

function isDevServerLifecycle(value: string | undefined): boolean {
  return value === "dev" || value === "dev:server";
}

export function resolveDirectStartServerOptions(env: NodeJS.ProcessEnv = process.env): StartServerOptions {
  const configuredTimeoutMs = parsePositiveInteger(env.AUTO_TAX_STORE_INIT_TIMEOUT_MS);
  const configuredAllowFailure = parseBoolean(env.AUTO_TAX_ALLOW_STORE_INIT_FAILURE);
  const isDevServer = isDevServerLifecycle(env.npm_lifecycle_event);
  return {
    storeInitializationTimeoutMs: configuredTimeoutMs ?? (isDevServer ? 5000 : undefined),
    allowStoreInitializationFailure: configuredAllowFailure ?? isDevServer
  };
}

async function initializeStore(store: SupabaseStore, timeoutMs: number | undefined): Promise<void> {
  if (!timeoutMs) {
    await store.initialize();
    return;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const initializePromise = store.initialize();
  initializePromise.catch(() => undefined);
  try {
    await Promise.race([
      initializePromise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new StoreInitializationTimeoutError(timeoutMs)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function createConfiguredStore(
  options: {
    bootstrapOrganization?: boolean;
    initializationTimeoutMs?: number;
    allowInitializationFailure?: boolean;
  } = {}
): Promise<AppStore | null> {
  const store = new SupabaseStore({
    bootstrapOrganization: options.bootstrapOrganization ?? false
  });

  try {
    await initializeStore(store, options.initializationTimeoutMs);
    return store;
  } catch (error) {
    if (isNoOrganizationStoreError(error)) {
      return null;
    }
    if (options.allowInitializationFailure) {
      const message = error instanceof Error ? error.message : "Supabase 초기화 실패";
      console.warn(`[AUTO-TAX] Supabase store initialization skipped: ${message}`);
      return null;
    }
    throw error;
  }
}

export async function startServer(options: StartServerOptions = {}) {
  const rootDir = options.rootDir ?? path.resolve(process.cwd());
  const webDist = options.webDist
    ? resolvePathFromRoot(rootDir, options.webDist)
    : path.join(rootDir, "dist", "web");
  const port = options.port ?? Number(process.env.PORT ?? 4300);

  const store = await createConfiguredStore({
    initializationTimeoutMs: options.storeInitializationTimeoutMs,
    allowInitializationFailure: options.allowStoreInitializationFailure
  });
  const scheduler = store ? new Scheduler(store) : null;
  const app = await createApp(store, webDist, rootDir);
  const server = app.listen(port, () => {
    if (store) {
      void store.createLog("info", "server", "AUTO-TAX 서버가 시작되었습니다.", { port });
    }
    if (options.startScheduler === true && scheduler) {
      scheduler.start();
    }
    if (store) {
      void store.getSettings().then((settings) => {
        if (!shouldRefreshCertificateStatuses(settings.certLastCheckedAt)) {
          return;
        }
        void refreshAllCertificateStatuses(store).catch((error) => {
          const message = error instanceof Error ? error.message : "인증서 자동 점검 실패";
          void store.createLog(
            "error",
            "popbill",
            "앱 시작 시 인증서 자동 점검에 실패했습니다.",
            buildPilotLogContext(
              {
                error: message
              },
              {
                errorCategory: "external-api",
                errorOperation: "cert-expire-date"
              }
            )
          );
        });
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
    webDist,
    close: () =>
      new Promise<void>((resolve, reject) => {
        scheduler?.stop();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          if (!store) {
            resolve();
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
  void startServer(resolveDirectStartServerOptions());
}
