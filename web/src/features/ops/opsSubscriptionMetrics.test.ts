import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpsSubscriptionMetrics,
  getOpsWorkspaceExpectedMonthlyRevenue
} from "./opsSubscriptionMetrics";
import type { OpsWorkspaceSummary, OrganizationStatus } from "../../types";

function createWorkspace(
  organizationId: string,
  organizationStatus: OrganizationStatus,
  managedCustomerCount: number
): OpsWorkspaceSummary {
  return {
    organizationId,
    organizationName: organizationId,
    organizationBusinessNumber: null,
    organizationPlanCode: "standard",
    organizationStatus,
    managedCustomerLimit: null,
    managedCustomerCount,
    ownerLoginId: null,
    ownerDisplayName: null,
    memberCount: 1,
    issuedDraftCount: 0,
    currentMonthIssuedDraftCount: 0,
    lastIssuedAt: null,
    createdAt: "2026-05-05T00:00:00.000Z"
  };
}

test("registered customer subscription pricing rounds up by 100-customer block", () => {
  assert.equal(getOpsWorkspaceExpectedMonthlyRevenue(createWorkspace("zero", "active", 0)), 0);
  assert.equal(getOpsWorkspaceExpectedMonthlyRevenue(createWorkspace("one", "active", 1)), 100_000);
  assert.equal(getOpsWorkspaceExpectedMonthlyRevenue(createWorkspace("hundred", "active", 100)), 100_000);
  assert.equal(getOpsWorkspaceExpectedMonthlyRevenue(createWorkspace("hundred-one", "active", 101)), 200_000);
});

test("subscription metrics include active and trial workspaces only", () => {
  const metrics = buildOpsSubscriptionMetrics([
    createWorkspace("active", "active", 1),
    createWorkspace("trial", "trial", 101),
    createWorkspace("suspended", "suspended", 100),
    createWorkspace("churned", "churned", 100)
  ]);

  assert.equal(metrics.subscribedWorkspaceCount, 2);
  assert.equal(metrics.registeredCustomerCount, 102);
  assert.equal(metrics.expectedMonthlyRevenue, 300_000);
});

test("expected annual revenue is monthly revenue multiplied by 12", () => {
  const metrics = buildOpsSubscriptionMetrics([
    createWorkspace("active-a", "active", 100),
    createWorkspace("active-b", "active", 101)
  ]);

  assert.equal(metrics.expectedMonthlyRevenue, 300_000);
  assert.equal(metrics.expectedAnnualRevenue, metrics.expectedMonthlyRevenue * 12);
});
