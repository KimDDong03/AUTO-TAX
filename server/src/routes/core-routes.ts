import type { Express } from "express";
import { z } from "zod";
import type { AppSettings, Customer } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import type { AuthenticatedAppSession } from "../supabase.js";
import type { AuthUserSummary } from "../admin-types.js";
import { createPublicConsultationRequest } from "../consultation-requests.js";
import {
  createPublicSignupRequest,
  findPublicSignupRequestByKepcoEmail,
  findPublicSignupRequestByLoginId,
  findPublicSignupRequestByUserId
} from "../signup-requests.js";
import {
  confirmSignupPhoneVerification,
  consumeSignupPhoneVerification,
  createSignupPhoneVerification
} from "../signup-phone-verifications.js";
import {
  confirmSignupEmailVerification,
  consumeSignupEmailVerification,
  createSignupEmailVerification
} from "../signup-email-verifications.js";
import { createSmsProvider } from "../sms-provider.js";
import type {
  AppRateLimiter,
  CreateEmptyBootstrapWorkspace,
  CreateEmptySettings,
  RequestStoreGetter,
  RequireAuthContext,
  RequireInternalJobAccess
} from "../route-types.js";
import { HttpError } from "../http-errors.js";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from "../password-policy.js";

const publicLoginSchema = z.object({
  account: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(256)
});

const publicSignupPhoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(32)
  .regex(/^[0-9+\-()\s.]+$/, "전화번호 형식이 올바르지 않습니다.")
  .refine((value) => isKoreanMobilePhone(value), "휴대폰 번호는 010, 011, 016, 017, 018, 019로 시작하는 10~11자리 번호로 입력하세요.");

const publicSignupPhoneVerificationSendSchema = z.object({
  phone: publicSignupPhoneSchema
});

const publicSignupPhoneVerificationConfirmSchema = z.object({
  verificationId: z.uuid(),
  phone: publicSignupPhoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, "인증번호 6자리를 입력하세요.")
});

const publicSignupEmailSchema = z.string().trim().email().max(160);

const publicSignupEmailVerificationSendSchema = z.object({
  email: publicSignupEmailSchema
});

const publicSignupEmailVerificationConfirmSchema = z.object({
  verificationId: z.uuid(),
  email: publicSignupEmailSchema,
  code: z.string().trim().regex(/^\d{6}$/, "인증번호 6자리를 입력하세요.")
});

const publicSignupSchema = z.object({
  loginId: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "로그인 ID는 영문/숫자로 시작하고 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다."),
  password: z
    .string()
    .min(10, PASSWORD_POLICY_MESSAGE)
    .max(128)
    .refine(isStrongPassword, PASSWORD_POLICY_MESSAGE),
  organizationName: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .refine(isReasonableOrganizationName, "고객사명은 한글을 포함한 실제 상호명으로 입력하세요."),
  representativeName: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .refine(isReasonableRepresentativeName, "대표자명을 2~40자로 입력하세요."),
  businessRegistrationNumber: z
    .string()
    .trim()
    .min(10)
    .max(16)
    .refine(isValidBusinessRegistrationNumber, "사업자등록번호는 숫자 10자리로 입력하세요.")
    .transform(normalizeBusinessRegistrationNumber),
  businessAddress: z.string().trim().min(5).max(160),
  businessType: z.string().trim().min(2).max(80),
  businessItem: z.string().trim().min(2).max(80),
  name: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .refine(isKoreanPersonName, "이름은 한글 실명 2~20자로 입력하세요."),
  phone: publicSignupPhoneSchema,
  phoneVerificationId: z.uuid(),
  kepcoEmail: publicSignupEmailSchema,
  kepcoEmailVerificationId: z.uuid(),
  invoiceEmail: z.string().trim().email().max(160),
  termsAccepted: z.boolean().refine((value) => value, "서비스 이용약관에 동의해야 합니다."),
  privacyAccepted: z.boolean().refine((value) => value, "개인정보 수집/이용에 동의해야 합니다."),
  thirdPartyAccepted: z.boolean().refine((value) => value, "개인정보 처리위탁 및 외부 제공에 동의해야 합니다."),
  marketingConsent: z.boolean().default(false)
});

const publicSignupLoginIdAvailabilitySchema = z.object({
  loginId: publicSignupSchema.shape.loginId
});

const publicSignupLoginIdLookupSchema = z.object({
  email: publicSignupEmailSchema,
  emailVerificationId: z.uuid()
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

const publicContactInquirySchema = z.object({
  category: z.enum(["요금제 문의", "서비스 문의", "기타 문의"]),
  message: z.string().trim().min(1).max(2000),
  email: z.string().trim().email().max(160),
  name: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(32)
    .regex(/^[0-9+\-()\s.]+$/, "전화번호 형식이 올바르지 않습니다."),
  region: z.string().trim().min(1).max(40),
  consent: z.boolean().refine((value) => value, "개인정보 수집·이용에 동의해야 합니다.")
});

const DUPLICATE_SIGNUP_LOGIN_ID_MESSAGE = "이미 사용중인 아이디입니다.";

function isKoreanMobilePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits);
}

function isKoreanPersonName(value: string): boolean {
  return /^[가-힣]{2,20}$/.test(value.trim());
}

function normalizeBusinessRegistrationNumber(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidBusinessRegistrationNumber(value: string): boolean {
  return /^\d{10}$/.test(normalizeBusinessRegistrationNumber(value));
}

function isReasonableRepresentativeName(value: string): boolean {
  return /^[가-힣A-Za-z\s·.-]{2,40}$/.test(value.trim());
}

function isReasonableOrganizationName(value: string): boolean {
  const normalized = value.trim();
  return (
    /[가-힣]/.test(normalized) &&
    /^[가-힣A-Za-z0-9\s().,&·_\-]+$/.test(normalized) &&
    normalized.replace(/\s+/g, "").length >= 2
  );
}

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireAuthContext: RequireAuthContext;
  requireInternalJobAccess: RequireInternalJobAccess;
  publicLoginLimiter: AppRateLimiter;
  publicSignupLimiter: AppRateLimiter;
  publicConsultationLimiter: AppRateLimiter;
  createSupabaseAdminClient: () => ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>;
  createSupabasePublicClient: () => ReturnType<typeof import("../supabase.js").createSupabasePublicClient>;
  resolveAuthenticatedAppSession: (
    accessToken: string,
    preferredOrganizationId?: string | null
  ) => Promise<AuthenticatedAppSession>;
  findAuthUserByLoginId: (
    adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>,
    loginId: string
  ) => Promise<AuthUserSummary | null>;
  isEmailLikeAccount: (value: string) => boolean;
  normalizeLoginId: (value: string) => string;
  normalizeEmail: (value: string) => string;
  createWorkspaceLoginEmail: (loginId: string) => string;
  upsertAuthUserLoginIndex: (
    adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>,
    input: { userId: string; loginId: string; email: string; displayName?: string | null }
  ) => Promise<void>;
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
  } = deps;

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/public/login", publicLoginLimiter, async (req, res) => {
    const payload = publicLoginSchema.parse(req.body ?? {});
    const account = payload.account.trim();
    let email = account;
    let adminClient: ReturnType<typeof createSupabaseAdminClient> | null = null;

    if (!isEmailLikeAccount(account)) {
      adminClient = createSupabaseAdminClient();
      const matchedUser = await withPublicLoginTimeout(
        findAuthUserByLoginId(adminClient, account)
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

    try {
      await resolveAuthenticatedAppSession(signInResult.session.access_token, null);
    } catch (sessionError) {
      const message = sessionError instanceof Error ? sessionError.message : "";
      if (message !== "접속 가능한 작업공간이 없습니다.") {
        throw sessionError;
      }

      const signupRequest = await findPublicSignupRequestByUserId(adminClient ?? createSupabaseAdminClient(), signInResult.user.id);
      if (signupRequest?.status === "pending") {
        throw new HttpError(403, "회원가입 승인 대기 중입니다.");
      }
      if (signupRequest?.status === "rejected") {
        throw new HttpError(403, "회원가입이 반려되었습니다. 관리자에게 문의하세요.");
      }

      throw new HttpError(403, "접속 가능한 작업공간이 없습니다.");
    }

    res.json({
      session: signInResult.session
    });
  });

  app.get("/api/public/signup/login-id-availability", publicSignupLimiter, async (req, res) => {
    const payload = publicSignupLoginIdAvailabilitySchema.parse(req.query ?? {});
    const adminClient = createSupabaseAdminClient();
    const loginId = normalizeLoginId(payload.loginId);

    const [existingAuthUser, existingSignupRequest] = await Promise.all([
      findAuthUserByLoginId(adminClient, loginId),
      findPublicSignupRequestByLoginId(adminClient, loginId)
    ]);

    res.json({
      loginId,
      available: !existingAuthUser && !existingSignupRequest
    });
  });

  app.post("/api/public/signup/phone-verifications/send", publicSignupLimiter, async (req, res) => {
    const payload = publicSignupPhoneVerificationSendSchema.parse(req.body ?? {});
    let smsProvider;
    try {
      smsProvider = createSmsProvider();
    } catch (error) {
      throw new HttpError(
        503,
        "휴대폰 인증 문자 발송 설정이 아직 준비되지 않았습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요."
      );
    }

    try {
      const result = await createSignupPhoneVerification(createSupabaseAdminClient(), smsProvider, {
        phone: payload.phone,
        requestIp: req.ip ?? req.socket.remoteAddress ?? "",
        requestUserAgent: req.header("user-agent") ?? ""
      });
      res.status(201).json(result);
      return;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      console.error("[signup] 휴대폰 인증 문자 발송에 실패했습니다.", error);
      throw new HttpError(503, "휴대폰 인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }

    return;
  });

  app.post("/api/public/signup/phone-verifications/confirm", publicSignupLimiter, async (req, res) => {
    const payload = publicSignupPhoneVerificationConfirmSchema.parse(req.body ?? {});
    await confirmSignupPhoneVerification(createSupabaseAdminClient(), payload);
    res.json({ verified: true });
  });

  app.post("/api/public/signup/email-verifications/send", publicSignupLimiter, async (req, res) => {
    const payload = publicSignupEmailVerificationSendSchema.parse(req.body ?? {});
    const result = await createSignupEmailVerification(createSupabaseAdminClient(), {
      email: payload.email,
      requestIp: req.ip ?? req.socket.remoteAddress ?? "",
      requestUserAgent: req.header("user-agent") ?? ""
    });

    res.status(201).json(result);
  });

  app.post("/api/public/signup/email-verifications/confirm", publicSignupLimiter, async (req, res) => {
    const payload = publicSignupEmailVerificationConfirmSchema.parse(req.body ?? {});
    await confirmSignupEmailVerification(createSupabaseAdminClient(), payload);
    res.json({ verified: true });
  });

  app.post("/api/public/signup/login-id-lookup", publicSignupLimiter, async (req, res) => {
    const payload = publicSignupLoginIdLookupSchema.parse(req.body ?? {});
    const adminClient = createSupabaseAdminClient();

    await consumeSignupEmailVerification(adminClient, {
      verificationId: payload.emailVerificationId,
      email: payload.email
    });

    const request = await findPublicSignupRequestByKepcoEmail(adminClient, payload.email);

    if (!request || request.status === "rejected") {
      res.json({ found: false });
      return;
    }

    res.json({
      found: true,
      loginId: request.loginId,
      status: request.status
    });
  });

  app.post("/api/public/signup", publicSignupLimiter, async (req, res) => {
    const payload = publicSignupSchema.parse(req.body ?? {});
    const adminClient = createSupabaseAdminClient();
    const loginId = normalizeLoginId(payload.loginId);
    const authEmail = createWorkspaceLoginEmail(loginId);

    const [existingAuthUser, existingSignupRequest] = await Promise.all([
      findAuthUserByLoginId(adminClient, loginId),
      findPublicSignupRequestByLoginId(adminClient, loginId)
    ]);
    if (existingAuthUser || existingSignupRequest) {
      throw new HttpError(409, DUPLICATE_SIGNUP_LOGIN_ID_MESSAGE);
    }

    await consumeSignupPhoneVerification(adminClient, {
      verificationId: payload.phoneVerificationId,
      phone: payload.phone
    });
    await consumeSignupEmailVerification(adminClient, {
      verificationId: payload.kepcoEmailVerificationId,
      email: payload.kepcoEmail
    });

    const { data: createdUserResult, error: createUserError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        login_id: loginId,
        display_name: payload.name,
        organization_name: payload.organizationName,
        representative_name: payload.representativeName,
        business_registration_number: payload.businessRegistrationNumber,
        business_address: payload.businessAddress,
        business_type: payload.businessType,
        business_item: payload.businessItem,
        kepco_email: payload.kepcoEmail,
        invoice_email: payload.invoiceEmail
      }
    });

    if (createUserError || !createdUserResult.user) {
      const message = createUserError?.message ?? "사용자 생성 실패";
      if (message.toLowerCase().includes("already")) {
        throw new HttpError(409, DUPLICATE_SIGNUP_LOGIN_ID_MESSAGE);
      }
      throw new Error(`회원가입 계정 생성에 실패했습니다: ${message}`);
    }

    try {
      await upsertAuthUserLoginIndex(adminClient, {
        userId: createdUserResult.user.id,
        loginId,
        email: createdUserResult.user.email ?? authEmail,
        displayName: payload.name
      });

      const request = await createPublicSignupRequest(adminClient, {
        userId: createdUserResult.user.id,
        loginId,
        authEmail: createdUserResult.user.email ?? authEmail,
        organizationName: payload.organizationName,
        representativeName: payload.representativeName,
        businessRegistrationNumber: payload.businessRegistrationNumber,
        businessAddress: payload.businessAddress,
        businessType: payload.businessType,
        businessItem: payload.businessItem,
        name: payload.name,
        phone: payload.phone,
        kepcoEmail: payload.kepcoEmail,
        invoiceEmail: payload.invoiceEmail,
        marketingConsent: payload.marketingConsent,
        requestIp: req.ip ?? req.socket.remoteAddress ?? "",
        requestUserAgent: req.header("user-agent") ?? ""
      });

      res.status(201).json({ request });
    } catch (error) {
      await adminClient.auth.admin.deleteUser(createdUserResult.user.id).catch(() => undefined);
      throw error;
    }
  });

  app.post("/api/public/consultation-requests", publicConsultationLimiter, async (req, res) => {
    const payload = publicConsultationRequestSchema.parse(req.body ?? {});
    const request = await createPublicConsultationRequest(createSupabaseAdminClient(), {
      name: payload.name,
      phone: payload.phone
    });

    res.status(201).json({ request });
  });

  app.post("/api/public/contact-inquiries", publicConsultationLimiter, async (req, res) => {
    const payload = publicContactInquirySchema.parse(req.body ?? {});
    const request = await createPublicConsultationRequest(createSupabaseAdminClient(), {
      category: payload.category,
      message: payload.message,
      email: payload.email,
      name: payload.name,
      phone: payload.phone,
      region: payload.region,
      requestIp: req.ip ?? req.socket.remoteAddress ?? "",
      requestUserAgent: req.header("user-agent") ?? ""
    });

    res.status(201).json({ ok: true, request });
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
