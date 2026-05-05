import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationMemberRole } from "./supabase.js";
import { isOrganizationOwnerRole, isWorkspaceEditorRole } from "./access-policy.js";

const roles: OrganizationMemberRole[] = ["owner", "admin", "operator", "viewer"];

test("organization owner policy allows only owner", () => {
  assert.deepEqual(
    roles.filter(isOrganizationOwnerRole),
    ["owner"]
  );
});

test("workspace editor policy makes viewer read-only", () => {
  assert.deepEqual(
    roles.filter(isWorkspaceEditorRole),
    ["owner", "admin", "operator"]
  );
  assert.equal(isWorkspaceEditorRole(null), false);
  assert.equal(isWorkspaceEditorRole(undefined), false);
});
