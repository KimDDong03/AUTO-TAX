import type { Express } from "express";
import { z } from "zod";
import type { AuthUserSummary, OpsWorkspaceSummary } from "../admin-types.js";
import { listPublicConsultationRequests, updatePublicConsultationRequest } from "../consultation-requests.js";
import type { AppSettings } from "../domain.js";
import { HttpError } from "../http-errors.js";
import type { RequirePlatformAdmin } from "../route-types.js";
import type { AppStore } from "../store-contract.js";

const opsWorkspaceCreateSchema = z.object({
  organizationName: z.string().trim().min(1),
  organizationBusinessNumber: z.string().trim().default(""),
  managedCustomerLimit: z.number().int().min(1).max(10000).default(50),
  ownerLoginId: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  ownerDisplayName: z.string().trim().default(""),
  ownerPassword: z.string().default(""),
  planCode: z.string().trim().min(1).default("starter"),
  status: z.enum(["trial", "active", "suspended", "churned"]).default("active")
});

const opsWorkspaceLimitUpdateSchema = z.object({
  managedCustomerLimit: z.number().int().min(1).max(10000)
});

const passwordResetSchema = z.object({
  password: z.string().trim().min(8).max(128)
});

const consultationRequestUpdateSchema = z.object({
  status: z.enum(["new", "contacted", "workspace_opened", "closed"]).optional(),
  note: z.string().trim().max(2000).optional()
});

const opsWorkspaceMailSettingsSchema = z.object({
  mailAddress: z.string().trim().email(),
  mailPassword: z.string().default(""),
  operatorContactName: z.string().trim().default(""),
  operatorContactEmail: z.string().trim().email().or(z.literal("")).default(""),
  operatorContactTel: z.string().trim().default(""),
  imapMailbox: z.string().trim().default("INBOX"),
  notificationEmails: z.array(z.string().trim().email()).default([]),
  testConnection: z.boolean().default(true)
});

function inferMailProviderSettings(mailAddress: string) {
  const domain = mailAddress.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "naver.com") {
    return {
      imapHost: "imap.naver.com",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "smtp.naver.com",
      smtpPort: 465,
      smtpSecure: true
    };
  }

  if (domain === "daum.net" || domain === "hanmail.net" || domain === "kakao.com") {
    return {
      imapHost: "imap.daum.net",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "smtp.daum.net",
      smtpPort: 465,
      smtpSecure: true
    };
  }

  return {
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true
  };
}

type RouteDeps = {
  app: Express;
  requirePlatformAdmin: RequirePlatformAdmin;
  createSupabaseAdminClient: () => ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>;
  createOrganizationStore: (options: { organizationId: string; actorUserId: string | null }) => Promise<AppStore>;
  listOpsWorkspaces: (organizationIdsFilter?: string[]) => Promise<OpsWorkspaceSummary[]>;
  getOpsWorkspaceSummaryById: (organizationId: string) => Promise<OpsWorkspaceSummary | null>;
  toClientSettings: (settings: AppSettings) => unknown;
  testMailConnections: (input: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPass: string;
    imapMailbox: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    smtpFromName: string;
    smtpFromEmail: string;
    notificationEmails: string[];
  }) => Promise<{
    imapOk: boolean;
    imapMessage?: string;
    smtpOk: boolean;
    smtpMessage?: string;
    testMailSent?: boolean;
  }>;
  digitsOnly: (value: string) => string;
  normalizeLoginId: (value: string) => string;
  createWorkspaceSeed: (organizationName: string, ownerLoginId: string, businessNumber: string) => string;
  createDeterministicUuid: (seed: string) => string;
  findAuthUserByLoginId: (
    adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>,
    loginId: string
  ) => Promise<AuthUserSummary | null>;
  createWorkspaceLoginEmail: (loginId: string) => string;
  upsertAuthUserLoginIndex: (
    adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>,
    input: { userId: string; loginId: string; email: string; displayName?: string | null }
  ) => Promise<void>;
  isUniqueViolation: (error: unknown, constraintName?: string) => boolean;
  listAllAuthUsers: (adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>) => Promise<AuthUserSummary[]>;
};

export function registerOpsRoutes(deps: RouteDeps) {
  const {
    app,
    requirePlatformAdmin,
    createSupabaseAdminClient,
    createOrganizationStore,
    listOpsWorkspaces,
    getOpsWorkspaceSummaryById,
    toClientSettings,
    testMailConnections,
    digitsOnly,
    normalizeLoginId,
    createWorkspaceSeed,
    createDeterministicUuid,
    findAuthUserByLoginId,
    createWorkspaceLoginEmail,
    upsertAuthUserLoginIndex,
    isUniqueViolation,
    listAllAuthUsers
  } = deps;

  app.get("/api/ops/workspaces", async (_req, res) => {
    requirePlatformAdmin(res);
    res.json(await listOpsWorkspaces());
  });

  app.get("/api/ops/consultation-requests", async (_req, res) => {
    requirePlatformAdmin(res);
    res.json(await listPublicConsultationRequests(createSupabaseAdminClient()));
  });

  app.patch("/api/ops/consultation-requests/:id", async (req, res) => {
    const authContext = requirePlatformAdmin(res);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const payload = consultationRequestUpdateSchema.parse(req.body ?? {});
    if (payload.status === undefined && payload.note === undefined) {
      throw new HttpError(400, "변경할 상담 신청 값이 없습니다.");
    }

    const request = await updatePublicConsultationRequest(createSupabaseAdminClient(), {
      id: params.id,
      status: payload.status,
      note: payload.note,
      handledBy: authContext.userId
    });

    if (!request) {
      throw new HttpError(404, "상담 신청을 찾지 못했습니다.");
    }

    res.json({ request });
  });

  app.post("/api/ops/workspaces", async (req, res) => {
    const authContext = requirePlatformAdmin(res);
    const payload = opsWorkspaceCreateSchema.parse(req.body ?? {});
    const adminClient = createSupabaseAdminClient();
    const normalizedBusinessNumber = digitsOnly(payload.organizationBusinessNumber);
    const normalizedOwnerLoginId = normalizeLoginId(payload.ownerLoginId);
    const workspaceId = createDeterministicUuid(
      createWorkspaceSeed(payload.organizationName, normalizedOwnerLoginId, normalizedBusinessNumber)
    );

    let ownerUser = await findAuthUserByLoginId(adminClient, normalizedOwnerLoginId);
    let createdUserId: string | null = null;
    if (!ownerUser) {
      if (payload.ownerPassword.trim().length < 8) {
        throw new HttpError(400, "새 owner 계정을 만들려면 8자 이상 임시 비밀번호가 필요합니다.");
      }

      const { data: createdUserResult, error: createUserError } = await adminClient.auth.admin.createUser({
        email: createWorkspaceLoginEmail(normalizedOwnerLoginId),
        password: payload.ownerPassword,
        email_confirm: true,
        user_metadata: {
          login_id: normalizedOwnerLoginId,
          ...(payload.ownerDisplayName ? { display_name: payload.ownerDisplayName } : {})
        }
      });

      if (createUserError || !createdUserResult.user) {
        ownerUser = await findAuthUserByLoginId(adminClient, normalizedOwnerLoginId);
        if (!ownerUser) {
          throw new Error(`owner 계정 생성에 실패했습니다: ${createUserError?.message ?? "사용자 생성 실패"}`);
        }
      } else {
        ownerUser = {
          id: createdUserResult.user.id,
          email: createdUserResult.user.email ?? createWorkspaceLoginEmail(normalizedOwnerLoginId),
          loginId: normalizedOwnerLoginId,
          displayName: payload.ownerDisplayName || null
        };
        createdUserId = createdUserResult.user.id;
      }
    }

    if (ownerUser.loginId && ownerUser.email) {
      await upsertAuthUserLoginIndex(adminClient, {
        userId: ownerUser.id,
        loginId: ownerUser.loginId,
        email: ownerUser.email,
        displayName: payload.ownerDisplayName || ownerUser.displayName
      });
    }

    if (normalizedBusinessNumber) {
      const { data: existingOrganizations, error: existingOrganizationError } = await adminClient
        .from("organizations")
        .select("id")
        .eq("business_number", normalizedBusinessNumber);

      if (existingOrganizationError) {
        throw new Error(`기존 작업공간 확인에 실패했습니다: ${existingOrganizationError.message}`);
      }

      const conflictingOrganization = (existingOrganizations ?? []).find((organization) => String(organization.id) !== workspaceId);
      if (conflictingOrganization) {
        throw new HttpError(409, "같은 사업자번호를 가진 작업공간이 이미 있습니다.");
      }
    }

    let createdOrganizationId: string | null = null;
    let workspaceAction: "created" | "reused-existing" = "created";

    try {
      const { data: organization, error: organizationError } = await adminClient
        .from("organizations")
        .insert({
          id: workspaceId,
          name: payload.organizationName,
          business_number: normalizedBusinessNumber || null,
          status: payload.status,
          plan_code: payload.planCode,
          managed_customer_limit: payload.managedCustomerLimit
        })
        .select("id")
        .maybeSingle();

      if (organizationError) {
        const reusedOrganization =
          isUniqueViolation(organizationError, "organizations_pkey") || isUniqueViolation(organizationError, "organizations_business_number_key")
            ? await getOpsWorkspaceSummaryById(workspaceId)
            : null;

        if (!reusedOrganization) {
          throw new Error(`작업공간 생성에 실패했습니다: ${organizationError.message}`);
        }

        createdOrganizationId = reusedOrganization.organizationId;
        workspaceAction = "reused-existing";
      } else if (organization) {
        createdOrganizationId = String(organization.id);
      }

      if (!createdOrganizationId) {
        throw new Error("작업공간 생성 결과를 확인하지 못했습니다.");
      }

      const { error: membershipError } = await adminClient
        .from("organization_members")
        .upsert(
          {
            organization_id: createdOrganizationId,
            user_id: ownerUser.id,
            role: "owner",
            display_name: payload.ownerDisplayName || ownerUser.displayName || null,
            invited_by: authContext.userId
          },
          { onConflict: "organization_id,user_id" }
        );

      if (membershipError) {
        if (isUniqueViolation(membershipError, "organization_members_single_owner_idx")) {
          throw new HttpError(409, "이 작업공간에는 owner 계정을 1명만 둘 수 있습니다.");
        }
        throw new Error(`첫 owner 연결에 실패했습니다: ${membershipError.message}`);
      }

      if (workspaceAction === "created") {
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
      }

      const workspace = await getOpsWorkspaceSummaryById(createdOrganizationId);
      if (!workspace) {
        throw new Error("개통 결과를 다시 읽지 못했습니다.");
      }

      res.status(workspaceAction === "created" ? 201 : 200).json({
        workspace,
        ownerAction: createdUserId ? "created-user" : "linked-existing-user",
        workspaceAction
      });
    } catch (error) {
      if (createdOrganizationId && workspaceAction === "created") {
        await adminClient.from("organizations").delete().eq("id", createdOrganizationId);
      }

      if (createdUserId) {
        await adminClient.auth.admin.deleteUser(createdUserId);
      }

      throw error;
    }
  });

  app.put("/api/ops/workspaces/:organizationId/managed-customer-limit", async (req, res) => {
    requirePlatformAdmin(res);
    const params = z.object({ organizationId: z.string().uuid() }).parse(req.params);
    const payload = opsWorkspaceLimitUpdateSchema.parse(req.body ?? {});
    const adminClient = createSupabaseAdminClient();

    const { error: updateError } = await adminClient
      .from("organizations")
      .update({
        managed_customer_limit: payload.managedCustomerLimit
      })
      .eq("id", params.organizationId);

    if (updateError) {
      throw new Error(`월 발행 한도 저장에 실패했습니다: ${updateError.message}`);
    }

    const workspace = await getOpsWorkspaceSummaryById(params.organizationId);
    if (!workspace) {
      throw new Error("한도 저장 후 작업공간을 다시 찾지 못했습니다.");
    }

    res.json({ workspace });
  });

  app.put("/api/ops/workspaces/:organizationId/mail-settings", async (req, res) => {
    const authContext = requirePlatformAdmin(res);
    const params = z.object({ organizationId: z.string().uuid() }).parse(req.params);
    const payload = opsWorkspaceMailSettingsSchema.parse(req.body ?? {});
    const requestStore = await createOrganizationStore({
      organizationId: params.organizationId,
      actorUserId: authContext.userId
    });

    try {
      const currentSettings = await requestStore.getSettings();
      const provider = inferMailProviderSettings(payload.mailAddress);
      const nextPassword = payload.mailPassword.trim() || currentSettings.imapPass || currentSettings.smtpPass;
      const nextSettingsInput: Partial<AppSettings> = {
        imapHost: provider.imapHost,
        imapPort: provider.imapPort,
        imapSecure: provider.imapSecure,
        imapUser: payload.mailAddress,
        imapPass: nextPassword,
        imapMailbox: payload.imapMailbox || currentSettings.imapMailbox || "INBOX",
        smtpHost: provider.smtpHost,
        smtpPort: provider.smtpPort,
        smtpSecure: provider.smtpSecure,
        smtpUser: payload.mailAddress,
        smtpPass: nextPassword,
        smtpFromName: payload.operatorContactName || currentSettings.smtpFromName || "AUTO-TAX",
        smtpFromEmail: payload.mailAddress,
        notificationEmails: payload.notificationEmails,
        operatorContactName: payload.operatorContactName,
        operatorContactEmail: payload.operatorContactEmail,
        operatorContactTel: payload.operatorContactTel
      };

      let settings = await requestStore.updateSettings(nextSettingsInput);
      let mailTestResult: {
        imapOk: boolean;
        imapMessage?: string;
        smtpOk: boolean;
        smtpMessage?: string;
        testMailSent?: boolean;
      } | null = null;

      if (payload.testConnection) {
        mailTestResult = await testMailConnections({
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
          notificationEmails: settings.notificationEmails
        });

        if (mailTestResult.imapOk && mailTestResult.smtpOk) {
          settings = await requestStore.updateSettings({
            mailConnectionVerifiedAt: new Date().toISOString()
          });
        }
      }

      await requestStore.createLog("info", "ops", "플랫폼 관리자가 작업공간 메일/담당자 설정을 저장했습니다.", {
        mailAddress: payload.mailAddress,
        testConnection: payload.testConnection,
        testSucceeded: mailTestResult ? Boolean(mailTestResult.imapOk && mailTestResult.smtpOk) : null
      });

      res.json({
        settings: toClientSettings(settings),
        mailTest: mailTestResult
      });
    } finally {
      await requestStore.close();
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
}
