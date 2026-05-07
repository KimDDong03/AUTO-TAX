import type { OpsWorkspaceSummary } from "../../types";

export const OPS_SUBSCRIPTION_ISSUE_BLOCK_SIZE = 100;
export const OPS_SUBSCRIPTION_MONTHLY_BLOCK_PRICE = 100_000;

export type OpsSubscriptionWorkspace = Pick<
  OpsWorkspaceSummary,
  "organizationStatus" | "organizationPlanCode" | "monthlyIssueLimit"
>;

export function isOpsSubscriptionWorkspace(
  workspace: Pick<OpsWorkspaceSummary, "organizationStatus" | "organizationPlanCode">
): boolean {
  return workspace.organizationStatus === "active" && workspace.organizationPlanCode === "paid";
}

export function getOpsSubscriptionIssueBlocks(monthlyIssueLimit: number): number {
  if (!Number.isFinite(monthlyIssueLimit) || monthlyIssueLimit <= 0) {
    return 0;
  }

  return Math.ceil(monthlyIssueLimit / OPS_SUBSCRIPTION_ISSUE_BLOCK_SIZE);
}

export function getOpsWorkspaceExpectedMonthlyRevenue(workspace: Pick<OpsWorkspaceSummary, "monthlyIssueLimit">): number {
  return getOpsSubscriptionIssueBlocks(workspace.monthlyIssueLimit) * OPS_SUBSCRIPTION_MONTHLY_BLOCK_PRICE;
}

export function buildOpsSubscriptionMetrics(workspaces: OpsWorkspaceSummary[]) {
  const subscriptionWorkspaces = workspaces.filter(isOpsSubscriptionWorkspace);
  const subscribedWorkspaceCount = subscriptionWorkspaces.length;
  const registeredCustomerCount = subscriptionWorkspaces.reduce(
    (sum, workspace) => sum + workspace.managedCustomerCount,
    0
  );
  const monthlyIssueLimit = subscriptionWorkspaces.reduce(
    (sum, workspace) => sum + workspace.monthlyIssueLimit,
    0
  );
  const expectedMonthlyRevenue = subscriptionWorkspaces.reduce(
    (sum, workspace) => sum + getOpsWorkspaceExpectedMonthlyRevenue(workspace),
    0
  );

  return {
    subscriptionWorkspaces,
    subscribedWorkspaceCount,
    registeredCustomerCount,
    monthlyIssueLimit,
    expectedMonthlyRevenue,
    expectedAnnualRevenue: expectedMonthlyRevenue * 12
  };
}
