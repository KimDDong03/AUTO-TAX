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
import type { AppSettings, CustomerInput, DashboardPayload } from "./domain.js";
import { testMailConnections } from "./mail-test.js";
import { reprocessInboxMessage } from "./mail-reprocess.js";
import { syncMailbox } from "./mail-sync.js";
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
  quitMember
} from "./popbill-client.js";
import { dispatchRecurringJobs, runDueJobs } from "./job-queue.js";
import { RenewalAutomationManager } from "./renewal-automation.js";
import { Scheduler } from "./scheduler.js";
import { applyServerManagedSettings, getServerManagedSettings } from "./server-managed-settings.js";
import type { AppStore } from "./store-contract.js";
import { sendSupportRequest } from "./support-request.js";
import {
  createSupabaseAdminClient,
  createSupabasePublicClient,
  resolveAuthenticatedAppSession,
  type AuthenticatedAppSession
} from "./supabase.js";
import { SupabaseStore } from "./supabase-store.js";
import { digitsOnly, nowIso } from "./utils.js";

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

type ActiveOrganizationSession = AuthenticatedAppSession & {
  activeOrganizationId: string;
  activeOrganizationName: string;
  activeOrganizationRole: NonNullable<AuthenticatedAppSession["activeOrganizationRole"]>;
};

type OpsWorkspaceSummary = {
  organizationId: string;
  organizationName: string;
  organizationBusinessNumber: string | null;
  organizationPlanCode: string;
  organizationStatus: "trial" | "active" | "suspended" | "churned";
  ownerLoginId: string | null;
  ownerDisplayName: string | null;
  memberCount: number;
  issuedDraftCount: number;
  currentMonthIssuedDraftCount: number;
  lastIssuedAt: string | null;
  createdAt: string;
};

type OrganizationMemberSummary = {
  membershipId: string;
  userId: string;
  loginId: string | null;
  displayName: string | null;
  role: "owner" | "member";
  createdAt: string;
};

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

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
  | "popbillUserIdPrefix"
  | "popbillSharedPassword"
  | "operatorContactName"
  | "operatorContactEmail"
  | "operatorContactTel"
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

function resolvePathFromRoot(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function toClientSettings(settings: AppSettings): ClientAppSettings {
  const runtimeSettings = applyServerManagedSettings(settings);
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
    popbillUserIdPrefix: settings.popbillUserIdPrefix,
    popbillSharedPassword: settings.popbillSharedPassword,
    operatorContactName: settings.operatorContactName,
    operatorContactEmail: settings.operatorContactEmail,
    operatorContactTel: settings.operatorContactTel,
    schedulerEnabled: settings.schedulerEnabled,
    certLastCheckedAt: settings.certLastCheckedAt,
    certAlertLastSentAt: settings.certAlertLastSentAt,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
    popbillConfigured: Boolean(runtimeSettings.popbillLinkId && runtimeSettings.popbillSecretKey),
    operatorConfigured: Boolean(
      settings.popbillUserIdPrefix &&
      settings.popbillSharedPassword &&
      settings.operatorContactName &&
      settings.operatorContactEmail &&
      settings.operatorContactTel
    )
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
    notificationEmails: [],
    defaultIssueDay: 26,
    defaultIssueHour: 9,
    defaultIssueMinute: 0,
    mailPollMinutes: 5,
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

function formatYearMonthInSeoul(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  }).format(date);
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
  popbillUserIdPrefix: z.string(),
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
  issueMode: z.enum(["review", "auto"]).optional().default("review"),
  issueDay: z.number().int().min(1).max(31).nullable().optional().default(null),
  issueHour: z.number().int().min(0).max(23).nullable().optional().default(null),
  issueMinute: z.number().int().min(0).max(59).nullable().optional().default(null),
  memo: z.string().default(""),
  plantNames: z.array(z.string().min(1)),
  matchAddresses: z.array(z.string().min(1)).default([])
});

const opsWorkspaceCreateSchema = z.object({
  organizationName: z.string().trim().min(1),
  organizationBusinessNumber: z.string().trim().default(""),
  ownerLoginId: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  ownerDisplayName: z.string().trim().default(""),
  ownerPassword: z.string().default(""),
  planCode: z.string().trim().min(1).default("starter"),
  status: z.enum(["trial", "active", "suspended", "churned"]).default("trial")
});

const organizationMemberCreateSchema = z.object({
  loginId: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  displayName: z.string().trim().default(""),
  password: z.string().default("")
});

const passwordResetSchema = z.object({
  password: z.string().trim().min(8)
});

const publicLoginSchema = z.object({
  account: z.string().trim().min(1),
  password: z.string().min(1)
});

const supportRequestSchema = z.object({
  companyName: z.string().trim().min(1),
  requesterName: z.string().trim().min(1),
  requesterEmail: z.string().trim().email(),
  requesterPhone: z.string().trim().min(1),
  message: z.string().trim().min(1)
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
    req.path === "/public/login" ||
    req.path === "/public/support-request" ||
    req.path === "/automation/renewal-agent/heartbeat" ||
    req.path === "/automation/renewal-agent/jobs/claim" ||
    /^\/automation\/renewal-agent\/jobs\/\d+\/(complete|fail)$/.test(req.path)
  );
}

function isInternalJobApiPath(req: express.Request): boolean {
  return req.path === "/internal/jobs/dispatch" || req.path === "/internal/jobs/run";
}

function setRequestLocals(res: express.Response, authContext: AuthenticatedAppSession, requestStore?: AppStore) {
  const locals = res.locals as RequestLocals;
  locals.authContext = authContext;
  locals.requestStore = requestStore;
}

function getRequestStore(res: express.Response, _fallbackStore?: AppStore | null): AppStore {
  const locals = res.locals as RequestLocals;
  if (!locals.requestStore) {
    throw new HttpError(403, "선택된 고객사 작업공간이 없습니다.");
  }
  return locals.requestStore;
}

function requireAuthContext(res: express.Response): AuthenticatedAppSession {
  const locals = res.locals as RequestLocals;
  if (!locals.authContext) {
    throw new Error("로그인 정보가 없습니다.");
  }
  return locals.authContext;
}

function requirePlatformAdmin(res: express.Response): AuthenticatedAppSession {
  const authContext = requireAuthContext(res);
  if (!authContext.isPlatformAdmin) {
    throw new HttpError(403, "플랫폼 관리자 전용 페이지입니다.");
  }
  return authContext;
}

function requireActiveOrganization(res: express.Response): ActiveOrganizationSession {
  const authContext = requireAuthContext(res);
  if (!authContext.activeOrganizationId || !authContext.activeOrganizationRole) {
    throw new HttpError(403, "선택된 고객사 작업공간이 없습니다.");
  }
  return authContext as ActiveOrganizationSession;
}

function requireOrganizationOwner(res: express.Response): ActiveOrganizationSession {
  const authContext = requireActiveOrganization(res);
  if (authContext.activeOrganizationRole !== "owner") {
    throw new HttpError(403, "소유자만 사용자 관리를 할 수 있습니다.");
  }
  return authContext;
}

function requireWorkspaceEditor(res: express.Response): ActiveOrganizationSession {
  const authContext = requireActiveOrganization(res);
  if (authContext.activeOrganizationRole === "viewer") {
    throw new HttpError(403, "이 작업은 작업공간 멤버만 실행할 수 있습니다.");
  }
  return authContext;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLoginId(value: string): string {
  return value.trim().toLowerCase();
}

function createWorkspaceLoginEmail(loginId: string): string {
  return `${normalizeLoginId(loginId)}@workspace.auto-tax.local`;
}

function isEmailLikeAccount(value: string): boolean {
  return value.includes("@");
}

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

function requireInternalJobAccess(req: express.Request, res: express.Response): "secret" | "ops" {
  if (hasValidJobSecret(req)) {
    return "secret";
  }

  requirePlatformAdmin(res);
  return "ops";
}

type AuthUserSummary = {
  id: string;
  email: string | null;
  loginId: string | null;
  displayName: string | null;
};

async function listAllAuthUsers(adminClient: ReturnType<typeof createSupabaseAdminClient>) {
  const users: AuthUserSummary[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const {
      data: pageData,
      error
    } = await adminClient.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(`Supabase 사용자 목록 조회에 실패했습니다: ${error.message}`);
    }

    const pageUsers = pageData.users.map((user) => {
      const userMetadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
      const loginId =
        typeof userMetadata.login_id === "string" && userMetadata.login_id.trim() !== ""
          ? normalizeLoginId(userMetadata.login_id)
          : null;
      const displayName =
        typeof userMetadata.display_name === "string" && userMetadata.display_name.trim() !== ""
          ? userMetadata.display_name.trim()
          : null;

      return {
        id: user.id,
        email: user.email ?? null,
        loginId,
        displayName
      };
    });
    users.push(...pageUsers);

    if (pageUsers.length < perPage) {
      break;
    }
    page += 1;
  }

  return users;
}

async function findAuthUserByLoginId(adminClient: ReturnType<typeof createSupabaseAdminClient>, loginId: string) {
  const normalizedLoginId = normalizeLoginId(loginId);
  const users = await listAllAuthUsers(adminClient);
  return users.find((user) => normalizeLoginId(user.loginId ?? "") === normalizedLoginId) ?? null;
}

async function listOpsWorkspaces(): Promise<OpsWorkspaceSummary[]> {
  const adminClient = createSupabaseAdminClient();
  const { data: organizations, error: organizationsError } = await adminClient
    .from("organizations")
    .select("id, name, business_number, plan_code, status, created_at")
    .order("created_at", { ascending: false });

  if (organizationsError) {
    throw new Error(`작업공간 목록 조회에 실패했습니다: ${organizationsError.message}`);
  }

  const organizationRows = organizations ?? [];
  if (organizationRows.length === 0) {
    return [];
  }

  const organizationIds = organizationRows.map((organization) => String(organization.id));
  const [members, issuedDrafts, authUsers] = await Promise.all([
    adminClient
      .from("organization_members")
      .select("organization_id, user_id, role, display_name, created_at")
      .in("organization_id", organizationIds)
      .order("created_at", { ascending: true }),
    adminClient
      .from("invoice_drafts")
      .select("organization_id, issued_at")
      .in("organization_id", organizationIds)
      .eq("status", "issued"),
    listAllAuthUsers(adminClient)
  ]);

  if (members.error) {
    throw new Error(`작업공간 멤버 조회에 실패했습니다: ${members.error.message}`);
  }

  if (issuedDrafts.error) {
    throw new Error(`작업공간 발행 이력 조회에 실패했습니다: ${issuedDrafts.error.message}`);
  }

  const accountByUserId = new Map(authUsers.map((user) => [user.id, user.loginId ?? user.email]));
  const membersByOrganizationId = new Map<string, Array<Record<string, unknown>>>();
  const issuedStatsByOrganizationId = new Map<
    string,
    {
      issuedDraftCount: number;
      currentMonthIssuedDraftCount: number;
      lastIssuedAt: string | null;
    }
  >();
  const currentMonthKey = formatYearMonthInSeoul(new Date());

  for (const member of members.data ?? []) {
    const organizationId = String(member.organization_id);
    const list = membersByOrganizationId.get(organizationId) ?? [];
    list.push(member as Record<string, unknown>);
    membersByOrganizationId.set(organizationId, list);
  }

  for (const issuedDraft of issuedDrafts.data ?? []) {
    const organizationId = String(issuedDraft.organization_id);
    const current = issuedStatsByOrganizationId.get(organizationId) ?? {
      issuedDraftCount: 0,
      currentMonthIssuedDraftCount: 0,
      lastIssuedAt: null
    };
    current.issuedDraftCount += 1;

    const issuedAt = issuedDraft.issued_at ? String(issuedDraft.issued_at) : null;
    if (issuedAt && formatYearMonthInSeoul(issuedAt) === currentMonthKey) {
      current.currentMonthIssuedDraftCount += 1;
    }
    if (issuedAt && (!current.lastIssuedAt || new Date(issuedAt).getTime() > new Date(current.lastIssuedAt).getTime())) {
      current.lastIssuedAt = issuedAt;
    }

    issuedStatsByOrganizationId.set(organizationId, current);
  }

  return organizationRows.map((organization) => {
    const organizationId = String(organization.id);
    const organizationMembers = membersByOrganizationId.get(organizationId) ?? [];
    const issuedStats = issuedStatsByOrganizationId.get(organizationId) ?? {
      issuedDraftCount: 0,
      currentMonthIssuedDraftCount: 0,
      lastIssuedAt: null
    };
    const owner = organizationMembers.find((member) => String(member.role) === "owner") ?? null;
    const ownerUserId = owner ? String(owner.user_id) : null;

    return {
      organizationId,
      organizationName: String(organization.name),
      organizationBusinessNumber: organization.business_number ? String(organization.business_number) : null,
      organizationPlanCode: String(organization.plan_code),
      organizationStatus: String(organization.status) as OpsWorkspaceSummary["organizationStatus"],
      ownerLoginId: ownerUserId ? accountByUserId.get(ownerUserId) ?? null : null,
      ownerDisplayName: owner?.display_name ? String(owner.display_name) : null,
      memberCount: organizationMembers.length,
      issuedDraftCount: issuedStats.issuedDraftCount,
      currentMonthIssuedDraftCount: issuedStats.currentMonthIssuedDraftCount,
      lastIssuedAt: issuedStats.lastIssuedAt,
      createdAt: String(organization.created_at)
    };
  });
}

async function listOrganizationMembers(organizationId: string): Promise<OrganizationMemberSummary[]> {
  const adminClient = createSupabaseAdminClient();
  const { data: members, error } = await adminClient
    .from("organization_members")
    .select("id, organization_id, user_id, role, display_name, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`작업공간 사용자 목록 조회에 실패했습니다: ${error.message}`);
  }

  const authUsers = await listAllAuthUsers(adminClient);
  const accountByUserId = new Map(authUsers.map((user) => [user.id, user.loginId ?? user.email]));

  return (members ?? []).map((member) => ({
    membershipId: String(member.id),
    userId: String(member.user_id),
    loginId: accountByUserId.get(String(member.user_id)) ?? null,
    displayName: member.display_name ? String(member.display_name) : null,
    role: String(member.role) === "owner" ? "owner" : "member",
    createdAt: String(member.created_at)
  }));
}

export async function createApp(store: AppStore | null, webDist: string) {
  const app = express();
  const renewalAutomation = new RenewalAutomationManager();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.use("/api", async (req, res, next) => {
    if (isInternalJobApiPath(req) && hasValidJobSecret(req)) {
      next();
      return;
    }

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
      if (authContext.activeOrganizationId) {
        const requestStore = new SupabaseStore({
          organizationId: authContext.activeOrganizationId,
          actorUserId: authContext.userId,
          bootstrapOrganization: false
        });
        await requestStore.initialize();
        setRequestLocals(res, authContext, requestStore);
      } else {
        setRequestLocals(res, authContext);
      }
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "로그인 확인에 실패했습니다.";
      res.status(401).json({ error: message });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/public/support-request", async (req, res) => {
    const payload = supportRequestSchema.parse(req.body ?? {});

    try {
      await sendSupportRequest({
        ...payload,
        userAgent: req.header("user-agent") ?? null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "문의 메일 전송에 실패했습니다.";
      if (message.includes("문의 메일 발송 설정")) {
        throw new HttpError(503, message);
      }
      throw error;
    }

    res.status(201).json({ ok: true });
  });

  app.post("/api/public/login", async (req, res) => {
    const payload = publicLoginSchema.parse(req.body ?? {});
    const account = payload.account.trim();
    let email = account;

    if (!isEmailLikeAccount(account)) {
      const matchedUser = await findAuthUserByLoginId(createSupabaseAdminClient(), account);
      if (!matchedUser?.email) {
        throw new HttpError(401, "로그인 정보가 올바르지 않습니다.");
      }
      email = matchedUser.email;
    }

    const publicClient = createSupabasePublicClient();
    const {
      data: signInResult,
      error: signInError
    } = await publicClient.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: payload.password
    });

    if (signInError || !signInResult.session) {
      throw new HttpError(401, "로그인 정보가 올바르지 않습니다.");
    }

    res.json({
      session: signInResult.session
    });
  });

  app.get("/api/bootstrap", async (_req, res) => {
    const authContext = requireAuthContext(res);
    if (!authContext.activeOrganizationId) {
      if (!authContext.isPlatformAdmin) {
        throw new HttpError(403, "접속 가능한 작업공간이 없습니다.");
      }

      res.json({
        ...createEmptyBootstrapWorkspace(),
        settings: toClientSettings(createEmptySettings()),
        auth: authContext
      });
      return;
    }

    const requestStore = getRequestStore(res, store);
    const dashboard = await requestStore.getDashboard();
    const { logs: _logs, ...workspaceDashboard } = dashboard;
    res.json({
      ...workspaceDashboard,
      settings: toClientSettings(dashboard.settings),
      auth: authContext
    });
  });

  app.post("/api/internal/jobs/dispatch", async (req, res) => {
    const accessMode = requireInternalJobAccess(req, res);
    const result = await dispatchRecurringJobs();
    res.json({
      ok: true,
      accessMode,
      ...result
    });
  });

  app.post("/api/internal/jobs/run", async (req, res) => {
    const accessMode = requireInternalJobAccess(req, res);
    const payload = z
      .object({
        limit: z.number().int().min(1).max(100).optional()
      })
      .parse(req.body ?? {});
    const result = await runDueJobs({
      limit: payload.limit,
      claimedBy: accessMode === "secret" ? "cron-runner" : "ops-runner"
    });
    res.json({
      ok: true,
      accessMode,
      ...result
    });
  });

  app.get("/api/organization/members", async (_req, res) => {
    const authContext = requireOrganizationOwner(res);
    res.json(await listOrganizationMembers(authContext.activeOrganizationId));
  });

  app.post("/api/organization/members", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const authContext = requireOrganizationOwner(res);
    const payload = organizationMemberCreateSchema.parse(req.body ?? {});
    const adminClient = createSupabaseAdminClient();
    const normalizedLoginId = normalizeLoginId(payload.loginId);

    const existingMembers = await listOrganizationMembers(authContext.activeOrganizationId);
    if (existingMembers.some((member) => normalizeLoginId(member.loginId ?? "") === normalizedLoginId)) {
      throw new HttpError(409, "이미 이 작업공간에 등록된 로그인 아이디입니다.");
    }

    let memberUser = await findAuthUserByLoginId(adminClient, normalizedLoginId);
    let createdUserId: string | null = null;

    if (!memberUser) {
      if (payload.password.trim().length < 8) {
        throw new HttpError(400, "새 사용자 계정을 만들려면 8자 이상 임시 비밀번호가 필요합니다.");
      }

      const {
        data: createdUserResult,
        error: createUserError
      } = await adminClient.auth.admin.createUser({
        email: createWorkspaceLoginEmail(normalizedLoginId),
        password: payload.password,
        email_confirm: true,
        user_metadata: {
          login_id: normalizedLoginId,
          ...(payload.displayName ? { display_name: payload.displayName } : {})
        }
      });

      if (createUserError || !createdUserResult.user) {
        throw new Error(`사용자 계정 생성에 실패했습니다: ${createUserError?.message ?? "사용자 생성 실패"}`);
      }

      memberUser = {
        id: createdUserResult.user.id,
        email: createdUserResult.user.email ?? createWorkspaceLoginEmail(normalizedLoginId),
        loginId: normalizedLoginId,
        displayName: payload.displayName || null
      };
      createdUserId = createdUserResult.user.id;
    }

    try {
      const { error: membershipError } = await adminClient.from("organization_members").insert({
        organization_id: authContext.activeOrganizationId,
        user_id: memberUser.id,
        role: "operator",
        display_name: payload.displayName || null,
        invited_by: authContext.userId
      });

      if (membershipError) {
        throw new Error(`작업공간 사용자 연결에 실패했습니다: ${membershipError.message}`);
      }

      await requestStore.createLog("info", "organization-members", "작업공간 사용자를 추가했습니다.", {
        targetLoginId: memberUser.loginId ?? normalizedLoginId,
        createdUser: createdUserId !== null
      });

      res.status(201).json({
        members: await listOrganizationMembers(authContext.activeOrganizationId),
        memberAction: createdUserId ? "created-user" : "linked-existing-user"
      });
    } catch (error) {
      if (createdUserId) {
        await adminClient.auth.admin.deleteUser(createdUserId);
      }
      throw error;
    }
  });

  app.delete("/api/organization/members/:id", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const authContext = requireOrganizationOwner(res);
    const membershipId = z.object({ id: z.string().uuid() }).parse(req.params).id;
    const adminClient = createSupabaseAdminClient();
    const { data: membership, error: membershipError } = await adminClient
      .from("organization_members")
      .select("id, user_id, role, display_name")
      .eq("organization_id", authContext.activeOrganizationId)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError) {
      throw new Error(`작업공간 사용자 조회에 실패했습니다: ${membershipError.message}`);
    }

    if (!membership) {
      throw new HttpError(404, "사용자를 찾지 못했습니다.");
    }

    if (String(membership.role) === "owner") {
      throw new HttpError(400, "owner 계정은 여기서 삭제할 수 없습니다.");
    }

    if (String(membership.user_id) === authContext.userId) {
      throw new HttpError(400, "자기 자신의 계정은 여기서 제거할 수 없습니다.");
    }

    const targetUser = (await listAllAuthUsers(adminClient)).find((user) => user.id === String(membership.user_id)) ?? null;
    const targetLoginId = targetUser?.loginId ?? targetUser?.email ?? null;

    const { error: deleteError } = await adminClient
      .from("organization_members")
      .delete()
      .eq("organization_id", authContext.activeOrganizationId)
      .eq("id", membershipId);

    if (deleteError) {
      throw new Error(`작업공간 사용자 제거에 실패했습니다: ${deleteError.message}`);
    }

    await requestStore.createLog("warn", "organization-members", "작업공간 사용자를 제거했습니다.", {
      targetMembershipId: membershipId,
      targetLoginId
    });

    res.json({
      ok: true,
      members: await listOrganizationMembers(authContext.activeOrganizationId)
    });
  });

  app.post("/api/organization/members/:id/reset-password", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const authContext = requireOrganizationOwner(res);
    const membershipId = z.object({ id: z.string().uuid() }).parse(req.params).id;
    const payload = passwordResetSchema.parse(req.body ?? {});
    const adminClient = createSupabaseAdminClient();
    const { data: membership, error: membershipError } = await adminClient
      .from("organization_members")
      .select("id, user_id, role")
      .eq("organization_id", authContext.activeOrganizationId)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError) {
      throw new Error(`작업공간 사용자 조회에 실패했습니다: ${membershipError.message}`);
    }

    if (!membership) {
      throw new HttpError(404, "사용자를 찾지 못했습니다.");
    }

    if (String(membership.role) === "owner") {
      throw new HttpError(400, "owner 계정 비밀번호는 플랫폼 관리자에게 요청하세요.");
    }

    const allUsers = await listAllAuthUsers(adminClient);
    const targetUser = allUsers.find((user) => user.id === String(membership.user_id)) ?? null;
    const targetLoginId = targetUser?.loginId ?? targetUser?.email ?? null;

    const { data: updatedUserResult, error: updateUserError } = await adminClient.auth.admin.updateUserById(
      String(membership.user_id),
      {
        password: payload.password
      }
    );

    if (updateUserError || !updatedUserResult.user) {
      throw new Error(`임시 비밀번호 재설정에 실패했습니다: ${updateUserError?.message ?? "비밀번호 재설정 실패"}`);
    }

    await requestStore.createLog("warn", "organization-members", "작업공간 사용자 임시 비밀번호를 재설정했습니다.", {
      targetMembershipId: membershipId,
      targetLoginId
    });

    res.json({
      ok: true,
      loginId: targetLoginId
    });
  });

  app.get("/api/ops/workspaces", async (_req, res) => {
    requirePlatformAdmin(res);
    res.json(await listOpsWorkspaces());
  });

  app.post("/api/ops/workspaces", async (req, res) => {
    const authContext = requirePlatformAdmin(res);
    const payload = opsWorkspaceCreateSchema.parse(req.body ?? {});
    const adminClient = createSupabaseAdminClient();
    const normalizedBusinessNumber = digitsOnly(payload.organizationBusinessNumber);
    const normalizedOwnerLoginId = normalizeLoginId(payload.ownerLoginId);

    if (normalizedBusinessNumber) {
      const { data: existingOrganization, error: existingOrganizationError } = await adminClient
        .from("organizations")
        .select("id")
        .eq("business_number", normalizedBusinessNumber)
        .maybeSingle();

      if (existingOrganizationError) {
        throw new Error(`기존 작업공간 확인에 실패했습니다: ${existingOrganizationError.message}`);
      }

      if (existingOrganization) {
        throw new HttpError(409, "같은 사업자번호를 가진 작업공간이 이미 있습니다.");
      }
    }

    let ownerUser = await findAuthUserByLoginId(adminClient, normalizedOwnerLoginId);
    let createdUserId: string | null = null;
    if (!ownerUser) {
      if (payload.ownerPassword.trim().length < 8) {
        throw new HttpError(400, "새 owner 계정을 만들려면 8자 이상 임시 비밀번호가 필요합니다.");
      }

      const {
        data: createdUserResult,
        error: createUserError
      } = await adminClient.auth.admin.createUser({
        email: createWorkspaceLoginEmail(normalizedOwnerLoginId),
        password: payload.ownerPassword,
        email_confirm: true,
        user_metadata: {
          login_id: normalizedOwnerLoginId,
          ...(payload.ownerDisplayName ? { display_name: payload.ownerDisplayName } : {})
        }
      });

      if (createUserError || !createdUserResult.user) {
        throw new Error(`owner 계정 생성에 실패했습니다: ${createUserError?.message ?? "사용자 생성 실패"}`);
      }

      ownerUser = {
        id: createdUserResult.user.id,
        email: createdUserResult.user.email ?? createWorkspaceLoginEmail(normalizedOwnerLoginId),
        loginId: normalizedOwnerLoginId,
        displayName: payload.ownerDisplayName || null
      };
      createdUserId = createdUserResult.user.id;
    }

    let createdOrganizationId: string | null = null;

    try {
      const { data: organization, error: organizationError } = await adminClient
        .from("organizations")
        .insert({
          name: payload.organizationName,
          business_number: normalizedBusinessNumber || null,
          plan_code: payload.planCode,
          status: payload.status
        })
        .select("id, name, business_number, plan_code, status, created_at")
        .single();

      if (organizationError || !organization) {
        throw new Error(`작업공간 생성에 실패했습니다: ${organizationError?.message ?? "조직 생성 실패"}`);
      }

      createdOrganizationId = String(organization.id);

      const { error: settingsError } = await adminClient.from("organization_settings").upsert(
        {
          organization_id: createdOrganizationId
        },
        { onConflict: "organization_id" }
      );

      if (settingsError) {
        throw new Error(`작업공간 기본 설정 생성에 실패했습니다: ${settingsError.message}`);
      }

      const { error: integrationsError } = await adminClient.from("organization_integrations").upsert(
        {
          organization_id: createdOrganizationId
        },
        { onConflict: "organization_id" }
      );

      if (integrationsError) {
        throw new Error(`작업공간 연동 설정 생성에 실패했습니다: ${integrationsError.message}`);
      }

      const { error: membershipError } = await adminClient.from("organization_members").insert({
        organization_id: createdOrganizationId,
        user_id: ownerUser.id,
        role: "owner",
        display_name: payload.ownerDisplayName || null,
        invited_by: authContext.userId
      });

      if (membershipError) {
        throw new Error(`첫 owner 연결에 실패했습니다: ${membershipError.message}`);
      }

      const { error: logError } = await adminClient.from("app_logs").insert({
        organization_id: createdOrganizationId,
        actor_user_id: authContext.userId,
        level: "info",
        scope: "ops",
        message: "플랫폼 관리자가 고객사 작업공간을 개통했습니다.",
        context_json: {
          ownerLoginId: ownerUser.loginId ?? normalizedOwnerLoginId,
          ownerAction: createdUserId ? "created-user" : "linked-existing-user"
        }
      });

      if (logError) {
        throw new Error(`개통 로그 저장에 실패했습니다: ${logError.message}`);
      }

      const workspace: OpsWorkspaceSummary = {
        organizationId: createdOrganizationId,
        organizationName: String(organization.name),
        organizationBusinessNumber: organization.business_number ? String(organization.business_number) : null,
        organizationPlanCode: String(organization.plan_code),
        organizationStatus: String(organization.status) as OpsWorkspaceSummary["organizationStatus"],
        ownerLoginId: ownerUser.loginId ?? normalizedOwnerLoginId,
        ownerDisplayName: payload.ownerDisplayName || null,
        memberCount: 1,
        issuedDraftCount: 0,
        currentMonthIssuedDraftCount: 0,
        lastIssuedAt: null,
        createdAt: String(organization.created_at)
      };

      res.status(201).json({
        workspace,
        ownerAction: createdUserId ? "created-user" : "linked-existing-user"
      });
    } catch (error) {
      if (createdOrganizationId) {
        await adminClient.from("organizations").delete().eq("id", createdOrganizationId);
      }

      if (createdUserId) {
        await adminClient.auth.admin.deleteUser(createdUserId);
      }

      throw error;
    }
  });

  app.post("/api/ops/workspaces/:organizationId/reset-owner-password", async (req, res) => {
    const authContext = requirePlatformAdmin(res);
    const payload = passwordResetSchema.parse(req.body ?? {});
    const params = z.object({ organizationId: z.string().uuid() }).parse(req.params);
    const adminClient = createSupabaseAdminClient();
    const { data: ownerMembership, error: ownerMembershipError } = await adminClient
      .from("organization_members")
      .select("id, user_id, role")
      .eq("organization_id", params.organizationId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (ownerMembershipError) {
      throw new Error(`owner 계정 조회에 실패했습니다: ${ownerMembershipError.message}`);
    }

    if (!ownerMembership) {
      throw new HttpError(404, "owner 계정을 찾지 못했습니다.");
    }

    const allUsers = await listAllAuthUsers(adminClient);
    const ownerUser = allUsers.find((user) => user.id === String(ownerMembership.user_id)) ?? null;
    const ownerLoginId = ownerUser?.loginId ?? ownerUser?.email ?? null;

    const { data: updatedUserResult, error: updateUserError } = await adminClient.auth.admin.updateUserById(
      String(ownerMembership.user_id),
      {
        password: payload.password
      }
    );

    if (updateUserError || !updatedUserResult.user) {
      throw new Error(`owner 임시 비밀번호 재설정에 실패했습니다: ${updateUserError?.message ?? "비밀번호 재설정 실패"}`);
    }

    const { error: logError } = await adminClient.from("app_logs").insert({
      organization_id: params.organizationId,
      actor_user_id: authContext.userId,
      level: "warn",
      scope: "ops",
      message: "플랫폼 관리자가 owner 임시 비밀번호를 재설정했습니다.",
      context_json: {
        ownerLoginId
      }
    });

    if (logError) {
      throw new Error(`owner 비밀번호 재설정 로그 저장에 실패했습니다: ${logError.message}`);
    }

    res.json({
      ok: true,
      ownerLoginId
    });
  });

  app.get("/api/automation/renewal-agent/snapshot", (_req, res) => {
    requirePlatformAdmin(res);
    res.json(renewalAutomation.getSnapshot());
  });

  app.post("/api/automation/renewal-jobs/bridge-probe", async (req, res) => {
    requirePlatformAdmin(res);
    const payload = renewalBridgeProbeRequestSchema.parse(req.body ?? {});
    let customerName: string | null = null;
    let requestStore: AppStore | null = null;

    if (payload.customerId !== undefined && payload.customerId !== null) {
      requestStore = getRequestStore(res, store);
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

    await requestStore?.createLog("info", "renewal-agent", "로컬 인증서 목록 진단 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-jobs/certid-probe", async (req, res) => {
    requirePlatformAdmin(res);
    const payload = renewalCertIdProbeRequestSchema.parse(req.body ?? {});
    let customerName: string | null = null;
    let requestStore: AppStore | null = null;

    if (payload.customerId !== undefined && payload.customerId !== null) {
      requestStore = getRequestStore(res, store);
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

    await requestStore?.createLog("info", "renewal-agent", "로컬 인증서 certID 조회 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName,
      certificateIndex: job.certificateIndex,
      certificateCn: job.certificateCn
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-jobs/preflight", async (req, res) => {
    requirePlatformAdmin(res);
    const payload = renewalPreflightRequestSchema.parse(req.body ?? {});
    let customerName: string | null = null;
    let requestStore: AppStore | null = null;

    if (payload.customerId !== undefined && payload.customerId !== null) {
      requestStore = getRequestStore(res, store);
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

    await requestStore?.createLog("info", "renewal-agent", "로컬 인증서 갱신 경로 분석 작업을 큐에 추가했습니다.", {
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

    if (store) {
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
    }

    res.json(job);
  });

  app.post("/api/automation/renewal-agent/jobs/:id/fail", async (req, res) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = renewalAgentFailSchema.parse(req.body);
    const job = renewalAutomation.failJob(params.id, payload.agentId, payload.error);

    if (store) {
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
    }

    res.json(job);
  });

  app.get("/api/settings", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(toClientSettings(await requestStore.getSettings()));
  });

  app.get("/api/popbill/partner-points", async (_req, res) => {
    requirePlatformAdmin(res);
    const settings = store ? await getServerManagedSettings(store) : applyServerManagedSettings(createEmptySettings());
    const referenceCorpNum = settings.popbillPartnerCorpNum.trim();

    if (!settings.popbillLinkId || !settings.popbillSecretKey) {
      res.json({
        available: false,
        isTest: settings.popbillIsTest,
        referenceCorpNum: null,
        partnerRemainPoint: null,
        taxInvoiceUnitCost: null,
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
        taxInvoiceUnitCost: null,
        message: "팝빌 파트너 결제 정보가 아직 준비되지 않았습니다."
      });
      return;
    }

    try {
      const [partnerBalance, taxInvoiceUnitCost] = await Promise.all([
        getPartnerBalance(settings, referenceCorpNum),
        getTaxInvoiceUnitCost(settings, referenceCorpNum)
      ]);

      res.json({
        available: true,
        isTest: settings.popbillIsTest,
        referenceCorpNum: maskBusinessNumber(referenceCorpNum),
        partnerRemainPoint: partnerBalance.remainPoint,
        taxInvoiceUnitCost,
        message: settings.popbillIsTest ? "팝빌 테스트 환경 파트너 포인트입니다." : "팝빌 운영 환경 파트너 포인트입니다."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "팝빌 파트너 포인트 조회에 실패했습니다.";
      res.json({
        available: false,
        isTest: settings.popbillIsTest,
        referenceCorpNum,
        partnerRemainPoint: null,
        taxInvoiceUnitCost: null,
        message
      });
    }
  });

  app.get("/api/popbill/partner-charge-url", async (_req, res) => {
    requirePlatformAdmin(res);
    const requestStore = store ? getRequestStore(res, store) : null;
    const settings = store ? await getServerManagedSettings(store) : applyServerManagedSettings(createEmptySettings());
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
    await requestStore?.createLog("info", "popbill", "파트너 포인트 충전 URL을 발급했습니다.", {
      referenceCorpNum,
      isTest: settings.popbillIsTest
    });
    res.json({ url });
  });

  app.put("/api/settings", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = settingsSchema.parse(req.body) satisfies Partial<AppSettings>;
    const settings = await requestStore.updateSettings(payload);
    await requestStore.createLog("info", "settings", "시스템 설정을 저장했습니다.");
    res.json(toClientSettings(settings));
  });

  app.post("/api/system/mail-test", async (req, res) => {
    requireWorkspaceEditor(res);
    const payload = mailTestSchema.parse(req.body);
    const result = await testMailConnections(payload);
    res.json(result);
  });

  app.get("/api/customers", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listCustomers());
  });

  app.post("/api/customers", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = customerSchema.parse(req.body) satisfies CustomerInput;
    const customer = await requestStore.saveCustomer({
      ...payload,
      issueMode: "review",
      issueDay: null,
      issueHour: null,
      issueMinute: null
    });
    await requestStore.createLog("info", "customers", "고객을 등록했습니다.", { customerId: customer.id });
    res.status(201).json(customer);
  });

  app.put("/api/customers/:id", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const payload = customerSchema.parse(req.body) satisfies CustomerInput;
    const customer = await requestStore.saveCustomer(payload, customerId);
    await requestStore.createLog("info", "customers", "고객 정보를 수정했습니다.", { customerId });
    res.json(customer);
  });

  app.delete("/api/customers/:id", async (req, res) => {
    requireWorkspaceEditor(res);
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
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await getServerManagedSettings(requestStore);

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
    requireWorkspaceEditor(res);
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
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await getServerManagedSettings(requestStore);
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
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const url = await getTaxCertURL(await getServerManagedSettings(requestStore), customer);
    await requestStore.createLog("info", "popbill", "인증서 등록 URL을 발급했습니다.", { customerId });
    res.json({ url });
  });

  app.post("/api/customers/:id/popbill/cert-status", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const expireDate = await getCertificateExpireDate(await getServerManagedSettings(requestStore), customer);
    const updated = await requestStore.updateCustomerPopbillState(customerId, customer.popbillState, true, expireDate);
    await requestStore.createLog("info", "popbill", "인증서 만료일을 갱신했습니다.", { customerId, expireDate });
    res.json(updated);
  });

  app.post("/api/popbill/cert-status/refresh-all", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const result = await refreshAllCertificateStatuses(requestStore);
    res.json(result);
  });

  app.get("/api/inbox", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listInbox());
  });

  app.post("/api/inbox/:id/reprocess", async (req, res) => {
    requireWorkspaceEditor(res);
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
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const result = await syncMailbox(requestStore);
    res.json(result);
  });

  app.get("/api/drafts", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listDrafts());
  });

  app.post("/api/drafts/:id/issue", async (req, res) => {
    requireWorkspaceEditor(res);
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
      const issued = await issueDraftNow(requestStore, await getServerManagedSettings(requestStore), customer, claimedDraft);
      await requestStore.createLog("info", "drafts", "수동 발행을 완료했습니다.", { draftId, customerId: customer.id });
      res.json(issued);
    } catch (error) {
      const message = error instanceof Error ? error.message : "수동 발행 실패";
      const failed = await requestStore.updateDraftStatus(draftId, "failed", message);
      res.status(500).json(failed);
    }
  });

  app.post("/api/drafts/issue-all", async (_req, res) => {
    requireWorkspaceEditor(res);
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
        await issueDraftNow(requestStore, await getServerManagedSettings(requestStore), customer, claimedDraft);
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
    requireWorkspaceEditor(res);
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

    const response = await cancelTaxInvoice(await getServerManagedSettings(requestStore), customer, draft, "AUTO-TAX 재발행 테스트 취소");
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

    const info = await getTaxInvoiceInfo(await getServerManagedSettings(requestStore), customer, draft);
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

    const url = await getTaxInvoiceViewURL(await getServerManagedSettings(requestStore), customer, draft);
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

    const url = await getTaxInvoicePrintURL(await getServerManagedSettings(requestStore), customer, draft);
    res.json({ url });
  });

  app.get("/api/logs", async (_req, res) => {
    requirePlatformAdmin(res);
    if (!store) {
      res.json([]);
      return;
    }

    res.json(await store.listLogs());
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "서버 오류";
    const requestStore = getRequestStore(res, store);
    void requestStore.createLog("error", "api", "API 요청 처리에 실패했습니다.", { error: message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "입력값이 올바르지 않습니다.", details: error.flatten() });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
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

function isNoOrganizationStoreError(error: unknown): boolean {
  return error instanceof Error && error.message === "사용 가능한 조직이 없습니다.";
}

export async function createConfiguredStore(options: { bootstrapOrganization?: boolean } = {}): Promise<AppStore | null> {
  const store = new SupabaseStore({
    bootstrapOrganization: options.bootstrapOrganization ?? false
  });

  try {
    await store.initialize();
    return store;
  } catch (error) {
    if (isNoOrganizationStoreError(error)) {
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

  const store = await createConfiguredStore();
  const scheduler = store ? new Scheduler(store) : null;
  const app = await createApp(store, webDist);
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
          void store.createLog("error", "popbill", "앱 시작 시 인증서 자동 점검에 실패했습니다.", { error: message });
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
  void startServer();
}
