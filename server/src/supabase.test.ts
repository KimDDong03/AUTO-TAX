import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "./http-errors.js";
import { parseOpsAdminEmailsFromRaw, resolveActiveOrganizationMembership } from "./supabase.js";

test("parseOpsAdminEmailsFromRaw accepts common Vercel environment value formats", () => {
  const parsed = parseOpsAdminEmailsFromRaw(`
    "Admin@Example.com";
    ops@example.com, support@example.com
    'owner@example.com'
  `);

  assert.deepEqual([...parsed].sort(), [
    "admin@example.com",
    "ops@example.com",
    "owner@example.com",
    "support@example.com"
  ]);
});

test("resolveActiveOrganizationMembership rejects unknown preferred organization instead of falling back", () => {
  const memberships = [
    {
      organizationId: "org-1",
      organizationName: "첫 고객사",
      organizationPlanCode: "trial",
      organizationStatus: "active" as const,
      monthlyIssueLimit: 100,
      role: "owner" as const,
      displayName: "Owner"
    }
  ];

  assert.throws(
    () => resolveActiveOrganizationMembership(memberships, "org-2"),
    (error) =>
      error instanceof HttpError &&
      error.status === 403 &&
      error.message === "선택한 작업공간에 접근할 권한이 없습니다."
  );
});
