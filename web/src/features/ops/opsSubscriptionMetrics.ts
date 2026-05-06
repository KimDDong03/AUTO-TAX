import type { OpsWorkspaceSummary } from "../../types";

export const OPS_SUBSCRIPTION_CUSTOMER_BLOCK_SIZE = 100;
export const OPS_SUBSCRIPTION_MONTHLY_BLOCK_PRICE = 100_000;

export type OpsSubscriptionWorkspace = Pick<
  OpsWorkspaceSummary,
  "organizationStatus" | "managedCustomerCount"
>;

export function isOpsSubscriptionWorkspace(workspace: Pick<OpsWorkspaceSummary, "organizationStatus">): boolean {
  return workspace.organizationStatus === "active" || workspace.organizationStatus === "trial";
}

export function getOpsSubscriptionCustomerBlocks(managedCustomerCount: number): number {
  if (!Number.isFinite(managedCustomerCount) || managedCustomerCount <= 0) {
    return 0;
  }

  return Math.ceil(managedCustomerCount / OPS_SUBSCRIPTION_CUSTOMER_BLOCK_SIZE);
}

export function getOpsWorkspaceExpectedMonthlyRevenue(workspace: Pick<OpsWorkspaceSummary, "managedCustomerCount">): number {
  return getOpsSubscriptionCustomerBlocks(workspace.managedCustomerCount) * OPS_SUBSCRIPTION_MONTHLY_BLOCK_PRICE;
}

export function buildOpsSubscriptionMetrics(workspaces: OpsWorkspaceSummary[]) {
  const subscriptionWorkspaces = workspaces.filter(isOpsSubscriptionWorkspace);
  const subscribedWorkspaceCount = subscriptionWorkspaces.length;
  const registeredCustomerCount = subscriptionWorkspaces.reduce(
    (sum, workspace) => sum + workspace.managedCustomerCount,
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
    expectedMonthlyRevenue,
    expectedAnnualRevenue: expectedMonthlyRevenue * 12
  };
}
