import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceLoginEmail, isEmailLikeAccount, normalizeEmail, normalizeLoginId } from "./auth-utils.js";

test("auth utils normalize login/email consistently", () => {
  assert.equal(normalizeEmail("  Team@Example.COM "), "team@example.com");
  assert.equal(normalizeLoginId("  Team_01 "), "team_01");
});

test("createWorkspaceLoginEmail builds deterministic workspace email", () => {
  assert.equal(createWorkspaceLoginEmail(" Team01 "), "team01@workspace.auto-tax.local");
});

test("isEmailLikeAccount distinguishes email-like account strings", () => {
  assert.equal(isEmailLikeAccount("team01"), false);
  assert.equal(isEmailLikeAccount("team01@example.com"), true);
});
