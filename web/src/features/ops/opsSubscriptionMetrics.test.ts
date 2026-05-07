import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpsSubscriptionMetrics,
  getOpsSubscriptionIssueBlocks,
  getOpsWorkspaceExpectedMonthlyRevenue
} from "./opsSubscriptionMetrics";
import type { OpsWorkspaceSummary, OrganizationStatus } from "../../types";

function createWorkspace(
  organizationId: string,
  organizationStatus: OrganizationStatus,
  monthlyIssueLimit: number,
  organizationPlanCode = "paid"
): OpsWorkspaceSummary {
  return {
    organizationId,
    organizationName: organizationId,
    organizationPlanCode,
    organizationStatus,
    monthlyIssueLimit,
    managedCustomerCount: 0,
    ownerLoginId: null,
    ownerDisplayName: null,
    memberCount: 1,
    issuedDraftCount: 0,
    currentMonthIssuedDraftCount: 0,
    lastIssuedAt: null,
    createdAt: "2026-05-05T00:00:00.000Z"
  };
}

test("issue subscription pricing rounds up by 100-issue block", () => {
  assert.equal(getOpsSubscriptionIssueBlocks(0), 0);
  assert.equal(getOpsSubscriptionIssueBlocks(100), 1);
  assert.equal(getOpsSubscriptionIssueBlocks(200), 2);
  assert.equal(getOpsWorkspaceExpectedMonthlyRevenue(createWorkspace("zero", "active", 0)), 0);
  assert.equal(getOpsWorkspaceExpectedMonthlyRevenue(createWorkspace("hundred", "active", 100)), 100_000);
  assert.equal(getOpsWorkspaceExpectedMonthlyRevenue(createWorkspace("two-hundred", "active", 200)), 200_000);
});

test("subscription metrics include paid active workspaces only", () => {
  const metrics = buildOpsSubscriptionMetrics([
    createWorkspace("paid-active", "active", 100, "paid"),
    createWorkspace("free-trial", "trial", 10, "free_trial"),
    createWorkspace("paid-suspended", "suspended", 100, "paid"),
    createWorkspace("starter-active", "active", 100, "starter")
  ]);

  assert.equal(metrics.subscribedWorkspaceCount, 1);
  assert.equal(metrics.monthlyIssueLimit, 100);
  assert.equal(metrics.expectedMonthlyRevenue, 100_000);
});

test("expected annual revenue is monthly revenue multiplied by 12", () => {
  const metrics = buildOpsSubscriptionMetrics([
    createWorkspace("active-a", "active", 100),
    createWorkspace("active-b", "active", 200)
  ]);

  assert.equal(metrics.expectedMonthlyRevenue, 300_000);
  assert.equal(metrics.expectedAnnualRevenue, metrics.expectedMonthlyRevenue * 12);
});
