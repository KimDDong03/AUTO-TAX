import assert from "node:assert/strict";
import test from "node:test";
import { getOrganizationRoleLabel } from "./organizationRole";

test("getOrganizationRoleLabel keeps the product role model narrow", () => {
  assert.equal(getOrganizationRoleLabel("owner"), "소유자");
  assert.equal(getOrganizationRoleLabel("admin"), "멤버");
  assert.equal(getOrganizationRoleLabel("operator"), "멤버");
  assert.equal(getOrganizationRoleLabel("viewer"), "조회전용");
  assert.equal(getOrganizationRoleLabel(null), "플랫폼 관리자");
});
