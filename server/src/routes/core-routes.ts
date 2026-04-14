import type { Express } from "express";
import { z } from "zod";
import type { AppSettings, Customer } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import type { AuthenticatedAppSession } from "../supabase.js";
import type { AuthUserSummary } from "../admin-types.js";
import type {
  AppRateLimiter,
  CreateEmptyBootstrapWorkspace,
  CreateEmptySettings,
  LoggingStoreGetter,
  RequestStoreGetter,
  RequireAuthContext,
  RequireInternalJobAccess
} from "../route-types.js";
import { HttpError } from "../http-errors.js";

const publicLoginSchema = z.object({
  account: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(256)
});

const supportRequestSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  requesterName: z.string().trim().min(1).max(80),
  requesterEmail: z.string().trim().email().max(255),
  requesterPhone: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(2000)
});

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getLoggingStore: LoggingStoreGetter;
  getRequestStore: RequestStoreGetter;
  requireAuthContext: RequireAuthContext;
  requireInternalJobAccess: RequireInternalJobAccess;
  publicSupportRequestLimiter: AppRateLimiter;
  publicLoginLimiter: AppRateLimiter;
  sendSupportRequest: (payload: {
    companyName: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    message: string;
    userAgent: string | null;
  }) => Promise<void>;
  createSupabaseAdminClient: () => ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>;
  createSupabasePublicClient: () => ReturnType<typeof import("../supabase.js").createSupabasePublicClient>;
  findAuthUserByLoginId: (
    adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>,
    loginId: string
  ) => Promise<AuthUserSummary | null>;
  isEmailLikeAccount: (value: string) => boolean;
  normalizeEmail: (value: string) => string;
  createEmptyBootstrapWorkspace: CreateEmptyBootstrapWorkspace;
  createEmptySettings: CreateEmptySettings;
  toClientSettings: (settings: AppSettings) => unknown;
  toClientCustomer: (customer: Customer) => Customer;
  dispatchRecurringJobs: () => Promise<Record<string, unknown>>;
  runDueJobs: (args: { limit?: number; claimedBy: string }) => Promise<Record<string, unknown>>;
};

export function registerCoreRoutes(deps: RouteDeps) {
  const {
    app,
    store,
    getLoggingStore,
    getRequestStore,
    requireAuthContext,
    requireInternalJobAccess,
    publicSupportRequestLimiter,
    publicLoginLimiter,
    sendSupportRequest,
    createSupabaseAdminClient,
    createSupabasePublicClient,
    findAuthUserByLoginId,
    isEmailLikeAccount,
    normalizeEmail,
    createEmptyBootstrapWorkspace,
    createEmptySettings,
    toClientSettings,
    toClientCustomer,
    dispatchRecurringJobs,
    runDueJobs
  } = deps;

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/public/support-request", publicSupportRequestLimiter, async (req, res) => {
    const payload = supportRequestSchema.parse(req.body ?? {});

    try {
      await sendSupportRequest({
        ...payload,
        userAgent: req.header("user-agent") ?? null
      });
    } catch (error) {
      const loggingStore = getLoggingStore(res, store);
      void loggingStore?.createLog("error", "support-request", "작업공간 개통 문의 메일 전송에 실패했습니다.", {
        error: error instanceof Error ? error.message : String(error)
      });
        throw new HttpError(503, "문의 접수가 일시적으로 불가능합니다. 잠시 후 다시 시도해주세요.");
    }

    res.status(201).json({ ok: true });
  });

  app.post("/api/public/login", publicLoginLimiter, async (req, res) => {
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
    const { data: signInResult, error: signInError } = await publicClient.auth.signInWithPassword({
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
    const workspaceDashboard = await requestStore.getBootstrapWorkspace();
    res.json({
      ...workspaceDashboard,
      customers: workspaceDashboard.customers.map(toClientCustomer),
      settings: toClientSettings(workspaceDashboard.settings),
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
}
