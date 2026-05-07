import { createHash } from "node:crypto";
import type { OpsWorkspaceSummary, OrganizationMemberSummary } from "./admin-types.js";
import { normalizeLoginId } from "./auth-utils.js";
import type { SupabaseAdminClient } from "./auth-user-service.js";
import { listAuthUsersByIds } from "./auth-user-service.js";

function formatYearMonthInSeoul(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  }).format(date);
}

function normalizeWorkspaceName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createDeterministicUuid(seed: string): string {
  const hash = createHash("sha256").update(seed).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function createWorkspaceSeed(organizationName: string, ownerLoginId: string): string {
  return `workspace:name:${normalizeWorkspaceName(organizationName)}|owner:${normalizeLoginId(ownerLoginId)}`;
}

type WorkspaceAdminServiceDeps = {
  createSupabaseAdminClient: () => SupabaseAdminClient;
};

export function createWorkspaceAdminService(deps: WorkspaceAdminServiceDeps) {
  const { createSupabaseAdminClient } = deps;

  async function listOpsWorkspaces(organizationIdsFilter?: string[]): Promise<OpsWorkspaceSummary[]> {
    const adminClient = createSupabaseAdminClient();
    let organizationsQuery = adminClient
      .from("organizations")
      .select("id, name, plan_code, status, monthly_issue_limit, created_at")
      .order("created_at", { ascending: false });

    if (organizationIdsFilter && organizationIdsFilter.length > 0) {
      organizationsQuery = organizationsQuery.in("id", organizationIdsFilter);
    }

    const { data: organizations, error: organizationsError } = await organizationsQuery;

    if (organizationsError) {
      throw new Error(`작업공간 목록 조회에 실패했습니다: ${organizationsError.message}`);
    }

    const organizationRows = organizations ?? [];
    if (organizationRows.length === 0) {
      return [];
    }

    const organizationIds = organizationRows.map((organization) => String(organization.id));
    const [members, issuedDrafts, managedCustomers] = await Promise.all([
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
      adminClient
        .from("managed_customers")
        .select("organization_id")
        .in("organization_id", organizationIds)
    ]);

    if (members.error) {
      throw new Error(`작업공간 멤버 조회에 실패했습니다: ${members.error.message}`);
    }

    if (issuedDrafts.error) {
      throw new Error(`작업공간 발행 이력 조회에 실패했습니다: ${issuedDrafts.error.message}`);
    }

    if (managedCustomers.error) {
      throw new Error(`작업공간 고객 수 조회에 실패했습니다: ${managedCustomers.error.message}`);
    }

    const membersByOrganizationId = new Map<string, Array<Record<string, unknown>>>();
    const managedCustomerCountByOrganizationId = new Map<string, number>();
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

    const memberUserIds = (members.data ?? []).map((member) => String(member.user_id));
    const authUsers = await listAuthUsersByIds(adminClient, memberUserIds);
    const accountByUserId = new Map(authUsers.map((user) => [user.id, user.loginId ?? user.email]));

    for (const managedCustomer of managedCustomers.data ?? []) {
      const organizationId = String(managedCustomer.organization_id);
      managedCustomerCountByOrganizationId.set(
        organizationId,
        (managedCustomerCountByOrganizationId.get(organizationId) ?? 0) + 1
      );
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
        organizationPlanCode: String(organization.plan_code),
        organizationStatus: String(organization.status) as OpsWorkspaceSummary["organizationStatus"],
        monthlyIssueLimit: Number(organization.monthly_issue_limit ?? 10),
        managedCustomerCount: managedCustomerCountByOrganizationId.get(organizationId) ?? 0,
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

  async function getOpsWorkspaceSummaryById(organizationId: string): Promise<OpsWorkspaceSummary | null> {
    const [workspace] = await listOpsWorkspaces([organizationId]);
    return workspace ?? null;
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

    const authUsers = await listAuthUsersByIds(
      adminClient,
      (members ?? []).map((member) => String(member.user_id))
    );
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

  return {
    listOpsWorkspaces,
    getOpsWorkspaceSummaryById,
    listOrganizationMembers
  };
}
