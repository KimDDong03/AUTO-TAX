import type { Express } from "express";
import { z } from "zod";
import type { AuthUserSummary, OrganizationMemberSummary } from "../admin-types.js";
import type { Customer } from "../domain.js";
import { getErrorMessage, HttpError } from "../http-errors.js";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from "../password-policy.js";
import { quitMember } from "../popbill-client.js";
import type { AppStore } from "../store-contract.js";
import type { RequireOrganizationOwner, RequestStoreGetter, ServerManagedSettingsGetter } from "../route-types.js";
import { quitCustomerPopbillMembership } from "./customer-popbill-routes.js";

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
  password: z.string().trim().max(128).refine(isStrongPassword, PASSWORD_POLICY_MESSAGE)
});

const organizationWithdrawConfirmText = "회원탈퇴";

const organizationWithdrawSchema = z.object({
  organizationName: z.string().trim().min(1),
  confirmText: z.string().trim()
});

type SupabaseAdminClient = ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>;

type OrganizationWithdrawalPopbillFailure = {
  customerId: number;
  customerName: string;
  businessNumber: string;
  error: string;
};

type OrganizationWithdrawalPopbillSummary = {
  totalCustomers: number;
  joinedTargets: number;
  skipped: number;
  quit: number;
  alreadyMissing: number;
  localResetFailed: number;
  failures: OrganizationWithdrawalPopbillFailure[];
};

type OrganizationWithdrawalAuthSummary = {
  removedMemberships: number;
  deletedAuthUsers: number;
  retainedAuthUsers: number;
  authDeleteFailures: Array<{
    userId: string;
    loginId: string | null;
    error: string;
  }>;
};

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireOrganizationOwner: RequireOrganizationOwner;
  createSupabaseAdminClient: () => ReturnType<typeof import("../supabase.js").createSupabaseAdminClient>;
  listOrganizationMembers: (organizationId: string) => Promise<OrganizationMemberSummary[]>;
  getServerManagedSettings: ServerManagedSettingsGetter;
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
  quitCustomerPopbillMember?: typeof quitMember;
};

function getCustomerWithdrawalLabel(customer: Customer): string {
  return customer.corpName.trim() || customer.customerName.trim() || `고객 #${customer.id}`;
}

function buildPopbillFailureDetails(failures: OrganizationWithdrawalPopbillFailure[]): string {
  return failures
    .map((failure) => `${failure.customerName}: ${failure.error}`)
    .join("\n");
}

function parseOpsAdminEmails(): Set<string> {
  const raw = process.env.AUTO_TAX_OPS_EMAILS?.trim();
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function hasOtherOrganizationMembership(
  adminClient: SupabaseAdminClient,
  organizationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await adminClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .neq("organization_id", organizationId)
    .limit(1);

  if (error) {
    throw new Error(`작업공간 사용자 소속 확인에 실패했습니다: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

async function planWithdrawnAuthUsers(
  adminClient: SupabaseAdminClient,
  organizationId: string,
  members: OrganizationMemberSummary[],
  allAuthUsers: AuthUserSummary[]
): Promise<{
  deleteTargets: OrganizationMemberSummary[];
  retainedAuthUsers: number;
}> {
  const opsAdminEmails = parseOpsAdminEmails();
  const authUserById = new Map(allAuthUsers.map((user) => [user.id, user]));
  const deleteTargets: OrganizationMemberSummary[] = [];
  let retainedAuthUsers = 0;

  for (const member of members) {
    const authUser = authUserById.get(member.userId);
    const email = authUser?.email?.trim().toLowerCase() ?? null;
    if (email && opsAdminEmails.has(email)) {
      retainedAuthUsers += 1;
      continue;
    }

    if (await hasOtherOrganizationMembership(adminClient, organizationId, member.userId)) {
      retainedAuthUsers += 1;
      continue;
    }

    deleteTargets.push(member);
  }

  return {
    deleteTargets,
    retainedAuthUsers
  };
}

async function quitOrganizationCustomerPopbillMemberships({
  requestStore,
  settings,
  quitCustomerPopbillMember
}: {
  requestStore: AppStore;
  settings: Awaited<ReturnType<ServerManagedSettingsGetter>>;
  quitCustomerPopbillMember: typeof quitMember;
}): Promise<OrganizationWithdrawalPopbillSummary> {
  const customers = await requestStore.listCustomers();
  const summary: OrganizationWithdrawalPopbillSummary = {
    totalCustomers: customers.length,
    joinedTargets: 0,
    skipped: 0,
    quit: 0,
    alreadyMissing: 0,
    localResetFailed: 0,
    failures: []
  };

  for (const customer of customers) {
    if (customer.popbillState !== "joined") {
      summary.skipped += 1;
      continue;
    }

    summary.joinedTargets += 1;
    try {
      const result = await quitCustomerPopbillMembership(
        settings,
        customer,
        quitCustomerPopbillMember,
        "AUTO-TAX 고객사 회원탈퇴"
      );
      if (result.status === "quit") {
        summary.quit += 1;
      } else if (result.status === "already-missing") {
        summary.alreadyMissing += 1;
      }

      try {
        await requestStore.resetCustomerPopbill(customer.id);
      } catch {
        summary.localResetFailed += 1;
      }
    } catch (error) {
      summary.failures.push({
        customerId: customer.id,
        customerName: getCustomerWithdrawalLabel(customer),
        businessNumber: customer.businessNumber,
        error: getErrorMessage(error, "발행 연동 계정 해지에 실패했습니다.")
      });
    }
  }

  return summary;
}

async function cancelOpenOrganizationJobs(adminClient: SupabaseAdminClient, organizationId: string): Promise<number> {
  const openJobs = await adminClient
    .from("job_queue")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["queued", "claimed"]);

  if (openJobs.error) {
    throw new Error(`대기 중인 작업 확인에 실패했습니다: ${openJobs.error.message}`);
  }

  if ((openJobs.count ?? 0) === 0) {
    return 0;
  }

  const now = new Date().toISOString();
  const cancelled = await adminClient
    .from("job_queue")
    .update({
      status: "cancelled",
      error: "고객사 회원탈퇴로 작업이 취소되었습니다.",
      finished_at: now,
      updated_at: now
    })
    .eq("organization_id", organizationId)
    .in("status", ["queued", "claimed"]);

  if (cancelled.error) {
    throw new Error(`대기 중인 작업 취소에 실패했습니다: ${cancelled.error.message}`);
  }

  return openJobs.count ?? 0;
}

async function deactivateOrganization(
  adminClient: SupabaseAdminClient,
  organizationId: string
): Promise<void> {
  const { error } = await adminClient
    .from("organizations")
    .update({
      status: "churned",
      updated_at: new Date().toISOString()
    })
    .eq("id", organizationId);

  if (error) {
    throw new Error(`작업공간 탈퇴 상태 저장에 실패했습니다: ${error.message}`);
  }
}

async function removeOrganizationAccess({
  adminClient,
  organizationId,
  members,
  deleteTargets
}: {
  adminClient: SupabaseAdminClient;
  organizationId: string;
  members: OrganizationMemberSummary[];
  deleteTargets: OrganizationMemberSummary[];
}): Promise<Omit<OrganizationWithdrawalAuthSummary, "retainedAuthUsers">> {
  const { error: membershipDeleteError } = await adminClient
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId);

  if (membershipDeleteError) {
    throw new Error(`작업공간 사용자 접근 해지에 실패했습니다: ${membershipDeleteError.message}`);
  }

  const authDeleteFailures: OrganizationWithdrawalAuthSummary["authDeleteFailures"] = [];
  let deletedAuthUsers = 0;

  for (const member of deleteTargets) {
    const { error } = await adminClient.auth.admin.deleteUser(member.userId);
    if (error) {
      authDeleteFailures.push({
        userId: member.userId,
        loginId: member.loginId,
        error: error.message
      });
      continue;
    }

    deletedAuthUsers += 1;
  }

  return {
    removedMemberships: members.length,
    deletedAuthUsers,
    authDeleteFailures
  };
}

export function registerOrganizationMemberRoutes(deps: RouteDeps) {
  const {
    app,
    store,
    getRequestStore,
    requireOrganizationOwner,
    createSupabaseAdminClient,
    listOrganizationMembers,
    getServerManagedSettings,
    normalizeLoginId,
    findAuthUserByLoginId,
    createWorkspaceLoginEmail,
    upsertAuthUserLoginIndex,
    listAllAuthUsers,
    quitCustomerPopbillMember = quitMember
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
      if (!isStrongPassword(payload.password.trim())) {
        throw new HttpError(400, `새 사용자 계정을 만들려면 ${PASSWORD_POLICY_MESSAGE}`);
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

  app.post("/api/organization/withdraw", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const authContext = requireOrganizationOwner(res);
    const payload = organizationWithdrawSchema.parse(req.body ?? {});

    if (payload.confirmText !== organizationWithdrawConfirmText) {
      throw new HttpError(400, `확인 문구로 '${organizationWithdrawConfirmText}'를 입력해야 합니다.`);
    }

    if (payload.organizationName !== authContext.activeOrganizationName) {
      throw new HttpError(400, "작업공간명이 현재 고객사와 일치하지 않습니다.");
    }

    const adminClient = createSupabaseAdminClient();
    const settings = await getServerManagedSettings(requestStore);
    const members = await listOrganizationMembers(authContext.activeOrganizationId);
    const allAuthUsers = await listAllAuthUsers(adminClient);
    const authPlan = await planWithdrawnAuthUsers(
      adminClient,
      authContext.activeOrganizationId,
      members,
      allAuthUsers
    );

    const popbill = await quitOrganizationCustomerPopbillMemberships({
      requestStore,
      settings,
      quitCustomerPopbillMember
    });

    if (popbill.failures.length > 0) {
      await requestStore.createLog("error", "organization-withdrawal", "고객사 회원탈퇴가 발행 연동 해지 실패로 중단되었습니다.", {
        organizationId: authContext.activeOrganizationId,
        organizationName: authContext.activeOrganizationName,
        popbill
      });
      res.status(409).json({
        error: "발행 연동 해지 실패가 있어 고객사 회원탈퇴를 중단했습니다.",
        errorDetails: buildPopbillFailureDetails(popbill.failures),
        popbill
      });
      return;
    }

    const cancelledJobs = await cancelOpenOrganizationJobs(adminClient, authContext.activeOrganizationId);
    await deactivateOrganization(adminClient, authContext.activeOrganizationId);
    const access = await removeOrganizationAccess({
      adminClient,
      organizationId: authContext.activeOrganizationId,
      members,
      deleteTargets: authPlan.deleteTargets
    });

    const auth: OrganizationWithdrawalAuthSummary = {
      ...access,
      retainedAuthUsers: authPlan.retainedAuthUsers
    };

    await requestStore.createLog("warn", "organization-withdrawal", "고객사 회원탈퇴를 완료했습니다.", {
      organizationId: authContext.activeOrganizationId,
      organizationName: authContext.activeOrganizationName,
      popbill,
      auth,
      cancelledJobs
    });

    res.json({
      ok: true,
      organizationId: authContext.activeOrganizationId,
      organizationName: authContext.activeOrganizationName,
      popbill,
      auth,
      cancelledJobs
    });
  });
}
