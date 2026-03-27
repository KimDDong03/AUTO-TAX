import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }
  return value;
}

export function createSupabaseAdminClient() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_SECRET_KEY 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function createSupabasePublicClient() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!publishableKey) {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY 또는 VITE_SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export type OrganizationMemberRole = "owner" | "admin" | "operator" | "viewer";
export type OrganizationStatus = "trial" | "active" | "suspended" | "churned";

export interface AuthenticatedOrganizationMembership {
  organizationId: string;
  organizationName: string;
  organizationBusinessNumber: string | null;
  organizationPlanCode: string;
  organizationStatus: OrganizationStatus;
  managedCustomerLimit: number | null;
  role: OrganizationMemberRole;
  displayName: string | null;
}

export interface AuthenticatedAppSession {
  userId: string;
  email: string | null;
  isPlatformAdmin: boolean;
  organizations: AuthenticatedOrganizationMembership[];
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationRole: OrganizationMemberRole | null;
  activeDisplayName: string | null;
}

type MembershipRow = {
  organization_id: string;
  role: OrganizationMemberRole;
  display_name: string | null;
  organizations:
    | {
        id: string;
        name: string;
        business_number: string | null;
        plan_code: string;
        status: OrganizationStatus;
        managed_customer_limit: number | null;
      }
    | Array<{
        id: string;
        name: string;
        business_number: string | null;
        plan_code: string;
        status: OrganizationStatus;
        managed_customer_limit: number | null;
      }>
    | null;
};

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseOpsAdminEmails(): Set<string> {
  const raw = envString("AUTO_TAX_OPS_EMAILS");
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function listOrganizationMemberships(
  client: SupabaseClient,
  userId: string
): Promise<AuthenticatedOrganizationMembership[]> {
  const { data, error } = await client
    .from("organization_members")
    .select(
      "organization_id, role, display_name, organizations(id, name, business_number, plan_code, status, managed_customer_limit)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`조직 멤버십 조회에 실패했습니다: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => {
    const membership = row as MembershipRow;
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;

    if (!organization) {
      return [];
    }

    return [
      {
        organizationId: organization.id,
        organizationName: organization.name,
        organizationBusinessNumber: organization.business_number,
        organizationPlanCode: organization.plan_code,
        organizationStatus: organization.status,
        managedCustomerLimit: organization.managed_customer_limit,
        role: membership.role,
        displayName: membership.display_name
      }
    ];
  });
}

export async function resolveAuthenticatedAppSession(
  accessToken: string,
  preferredOrganizationId?: string | null
): Promise<AuthenticatedAppSession> {
  const client = createSupabaseAdminClient();
  const {
    data: { user },
    error: userError
  } = await client.auth.getUser(accessToken);

  if (userError || !user) {
    throw new Error("로그인 정보를 확인하지 못했습니다.");
  }

  const opsAdminEmails = parseOpsAdminEmails();
  const normalizedEmail = user.email?.trim().toLowerCase() ?? null;
  const isPlatformAdmin = normalizedEmail !== null && opsAdminEmails.has(normalizedEmail);
  const organizations = await listOrganizationMemberships(client, user.id);

  if (organizations.length === 0 && !isPlatformAdmin) {
    throw new Error("접속 가능한 작업공간이 없습니다.");
  }

  const activeOrganization =
    organizations.find((item) => item.organizationId === preferredOrganizationId) ?? organizations[0] ?? null;

  return {
    userId: user.id,
    email: user.email ?? null,
    isPlatformAdmin,
    organizations,
    activeOrganizationId: activeOrganization?.organizationId ?? null,
    activeOrganizationName: activeOrganization?.organizationName ?? null,
    activeOrganizationRole: activeOrganization?.role ?? null,
    activeDisplayName: activeOrganization?.displayName ?? null
  };
}
