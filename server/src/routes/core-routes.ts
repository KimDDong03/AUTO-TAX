import type { Express } from "express";
import { z } from "zod";
import type { AppSettings, Customer } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import type { AuthenticatedAppSession } from "../supabase.js";
import type { AuthUserSummary } from "../admin-types.js";
import { createPublicConsultationRequest } from "../consultation-requests.js";
import type {
  AppRateLimiter,
  CreateEmptyBootstrapWorkspace,
  CreateEmptySettings,
  RequestStoreGetter,
  RequireAuthContext,
  RequireInternalJobAccess
} from "../route-types.js";
import { HttpError } from "../http-errors.js";

const publicLoginSchema = z.object({
  account: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(256)
});

const DEFAULT_PUBLIC_LOGIN_TIMEOUT_MS = 5000;
const MAX_INTERNAL_JOB_RUN_LIMIT = 25;

const publicConsultationRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(32)
    .regex(/^[0-9+\-()\s.]+$/, "전화번호 형식이 올바르지 않습니다.")
});

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireAuthContext: RequireAuthContext;
  requireInternalJobAccess: RequireInternalJobAccess;
  publicLoginLimiter: AppRateLimiter;
  publicConsultationLimiter: AppRateLimiter;
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
  runPlatformMaintenance: () => Promise<Record<string, unknown>>;
  dispatchRecurringJobs: () => Promise<Record<string, unknown>>;
  runDueJobs: (args: { limit?: number; claimedBy: string }) => Promise<Record<string, unknown>>;
};

class PublicLoginTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`인증 서버 응답이 ${timeoutMs}ms 안에 완료되지 않았습니다.`);
  }
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function getPublicLoginTimeoutMs(): number {
  return parsePositiveInteger(process.env.AUTO_TAX_PUBLIC_LOGIN_TIMEOUT_MS) ?? DEFAULT_PUBLIC_LOGIN_TIMEOUT_MS;
}

async function withPublicLoginTimeout<T>(operation: Promise<T>): Promise<T> {
  const timeoutMs = getPublicLoginTimeoutMs();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  operation.catch(() => undefined);

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new PublicLoginTimeoutError(timeoutMs)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function toPublicLoginError(error: unknown): unknown {
  if (error instanceof PublicLoginTimeoutError) {
    return new HttpError(503, "인증 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.");
  }
  return error;
}

export function registerCoreRoutes(deps: RouteDeps) {
  const {
    app,
    store,
    getRequestStore,
    requireAuthContext,
    requireInternalJobAccess,
    publicLoginLimiter,
    publicConsultationLimiter,
    createSupabaseAdminClient,
    createSupabasePublicClient,
    findAuthUserByLoginId,
    isEmailLikeAccount,
    normalizeEmail,
    createEmptyBootstrapWorkspace,
    createEmptySettings,
    toClientSettings,
    toClientCustomer,
    runPlatformMaintenance,
    dispatchRecurringJobs,
    runDueJobs
  } = deps;

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/public/login", publicLoginLimiter, async (req, res) => {
    const payload = publicLoginSchema.parse(req.body ?? {});
    const account = payload.account.trim();
    let email = account;

    if (!isEmailLikeAccount(account)) {
      const matchedUser = await withPublicLoginTimeout(
        findAuthUserByLoginId(createSupabaseAdminClient(), account)
      ).catch((error) => {
        throw toPublicLoginError(error);
      });
      if (!matchedUser?.email) {
        throw new HttpError(401, "로그인 정보가 올바르지 않습니다.");
      }
      email = matchedUser.email;
    }

    const publicClient = createSupabasePublicClient();
    const { data: signInResult, error: signInError } = await withPublicLoginTimeout(
      publicClient.auth.signInWithPassword({
        email: normalizeEmail(email),
        password: payload.password
      })
    ).catch((error) => {
      throw toPublicLoginError(error);
    });

    if (signInError || !signInResult.session) {
      throw new HttpError(401, "로그인 정보가 올바르지 않습니다.");
    }

    res.json({
      session: signInResult.session
    });
  });

  app.post("/api/public/consultation-requests", publicConsultationLimiter, async (req, res) => {
    const payload = publicConsultationRequestSchema.parse(req.body ?? {});
    const request = await createPublicConsultationRequest(createSupabaseAdminClient(), {
      name: payload.name,
      phone: payload.phone
    });

    res.status(201).json({ request });
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

  app.post("/api/internal/jobs/maintenance", async (req, res) => {
    const accessMode = requireInternalJobAccess(req, res);
    const result = await runPlatformMaintenance();
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
        limit: z.number().int().min(1).optional()
      })
      .parse(req.body ?? {});
    const result = await runDueJobs({
      limit: payload.limit === undefined ? undefined : Math.min(payload.limit, MAX_INTERNAL_JOB_RUN_LIMIT),
      claimedBy: accessMode === "secret" ? "cron-runner" : "ops-runner"
    });
    res.json({
      ok: true,
      accessMode,
      ...result
    });
  });
}
