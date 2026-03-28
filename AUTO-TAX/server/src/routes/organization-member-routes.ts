import type { Express } from "express";
import { z } from "zod";
import type { AuthUserSummary, OrganizationMemberSummary } from "../admin-types.js";
import { HttpError } from "../http-errors.js";
import type { AppStore } from "../store-contract.js";
import type { RequireOrganizationOwner, RequestStoreGetter } from "../route-types.js";

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
  password: z.string().trim().min(8).max(128)
});

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireOrganizationOwner: RequireOrganizationOwner;
  createSupabaseAdminClient: () => ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>;
  listOrganizationMembers: (organizationId: string) => Promise<OrganizationMemberSummary[]>;
  normalizeLoginId: (value: string) => string;
  findAuthUserByLoginId: (
    adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>,
    loginId: string
  ) => Promise<AuthUserSummary | null>;
  createWorkspaceLoginEmail: (loginId: string) => string;
  upsertAuthUserLoginIndex: (
    adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>,
    input: { userId: string; loginId: string; email: string; displayName?: string | null }
  ) => Promise<void>;
  listAllAuthUsers: (adminClient: ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>) => Promise<AuthUserSummary[]>;
};

export function registerOrganizationMemberRoutes(deps: RouteDeps) {
  const {
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
  } = deps;

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

      const { data: createdUserResult, error: createUserError } = await adminClient.auth.admin.createUser({
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

    if (memberUser.loginId && memberUser.email) {
      await upsertAuthUserLoginIndex(adminClient, {
        userId: memberUser.id,
        loginId: memberUser.loginId,
        email: memberUser.email,
        displayName: payload.displayName || memberUser.displayName
      });
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
}
