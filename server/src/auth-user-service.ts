import type { AuthUserSummary } from "./admin-types.js";
import { normalizeEmail, normalizeLoginId } from "./auth-utils.js";
import { nowIso } from "./utils.js";

export type SupabaseAdminClient = ReturnType<typeof import("./supabase.js").createSupabaseAdminClient>;

type AuthUserLoginIndexRow = {
  user_id: string;
  login_id: string;
  auth_email: string;
  display_name: string | null;
};

export type UpsertAuthUserLoginIndexInput = {
  userId: string;
  loginId: string;
  email: string;
  displayName?: string | null;
};

function isMissingRelationError(error: unknown, relationName: string): boolean {
  const message = typeof error === "object" && error && "message" in error ? String(error.message ?? "") : "";
  const code = typeof error === "object" && error && "code" in error ? String(error.code ?? "") : "";
  return code === "42P01" || message.includes(relationName);
}

function mapIndexedAuthUser(row: AuthUserLoginIndexRow): AuthUserSummary {
  return {
    id: String(row.user_id),
    email: String(row.auth_email),
    loginId: normalizeLoginId(String(row.login_id)),
    displayName: row.display_name ? String(row.display_name) : null
  };
}

async function listIndexedAuthUsers(
  adminClient: SupabaseAdminClient,
  options: {
    userIds?: string[];
    loginId?: string;
  } = {}
): Promise<AuthUserSummary[] | null> {
  let query = adminClient.from("auth_user_login_index").select("user_id, login_id, auth_email, display_name");

  if (options.userIds && options.userIds.length > 0) {
    query = query.in("user_id", options.userIds);
  }

  if (options.loginId) {
    query = query.eq("login_id", normalizeLoginId(options.loginId));
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelationError(error, "auth_user_login_index")) {
      return null;
    }

    throw new Error(`로그인 조회 인덱스 조회에 실패했습니다: ${error.message}`);
  }

  return (data ?? []).map((row) => mapIndexedAuthUser(row as AuthUserLoginIndexRow));
}

export async function upsertAuthUserLoginIndex(
  adminClient: SupabaseAdminClient,
  account: UpsertAuthUserLoginIndexInput
): Promise<void> {
  const { error } = await adminClient.from("auth_user_login_index").upsert(
    {
      user_id: account.userId,
      login_id: normalizeLoginId(account.loginId),
      auth_email: normalizeEmail(account.email),
      display_name: account.displayName?.trim() || null,
      updated_at: nowIso()
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`로그인 조회 인덱스 저장에 실패했습니다: ${error.message}`);
  }
}

export async function listAllAuthUsers(adminClient: SupabaseAdminClient): Promise<AuthUserSummary[]> {
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

export async function listAuthUsersByIds(adminClient: SupabaseAdminClient, userIds: string[]): Promise<AuthUserSummary[]> {
  if (userIds.length === 0) {
    return [];
  }

  const uniqueUserIds = [...new Set(userIds)];
  const indexedUsers = await listIndexedAuthUsers(adminClient, { userIds: uniqueUserIds });
  const indexedList = indexedUsers ?? [];
  const indexedByUserId = new Map(indexedList.map((user) => [user.id, user]));
  const missingUserIds = uniqueUserIds.filter((userId) => !indexedByUserId.has(userId));

  if (missingUserIds.length === 0) {
    return uniqueUserIds.flatMap((userId) => {
      const user = indexedByUserId.get(userId);
      return user ? [user] : [];
    });
  }

  const allUsers = await listAllAuthUsers(adminClient);
  const fallbackUsers = allUsers.filter((user) => missingUserIds.includes(user.id));

  for (const user of fallbackUsers) {
    if (user.loginId && user.email) {
      void upsertAuthUserLoginIndex(adminClient, {
        userId: user.id,
        loginId: user.loginId,
        email: user.email,
        displayName: user.displayName
      }).catch(() => undefined);
    }
  }

  const mergedByUserId = new Map<string, AuthUserSummary>();
  for (const user of indexedList) {
    mergedByUserId.set(user.id, user);
  }
  for (const user of fallbackUsers) {
    mergedByUserId.set(user.id, user);
  }

  return uniqueUserIds.flatMap((userId) => {
    const user = mergedByUserId.get(userId);
    return user ? [user] : [];
  });
}

export async function findAuthUserByLoginId(adminClient: SupabaseAdminClient, loginId: string): Promise<AuthUserSummary | null> {
  const normalizedLoginId = normalizeLoginId(loginId);
  const indexedUsers = await listIndexedAuthUsers(adminClient, { loginId: normalizedLoginId });
  const indexedMatch = indexedUsers?.[0] ?? null;
  if (indexedMatch) {
    return indexedMatch;
  }

  const users = await listAllAuthUsers(adminClient);
  const matchedUser = users.find((user) => normalizeLoginId(user.loginId ?? "") === normalizedLoginId) ?? null;

  if (matchedUser?.loginId && matchedUser.email) {
    void upsertAuthUserLoginIndex(adminClient, {
      userId: matchedUser.id,
      loginId: matchedUser.loginId,
      email: matchedUser.email,
      displayName: matchedUser.displayName
    }).catch(() => undefined);
  }

  return matchedUser;
}
