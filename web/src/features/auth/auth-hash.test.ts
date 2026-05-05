import assert from "node:assert/strict";
import test from "node:test";
import {
  getSupabaseAuthHashError,
  getSupabaseAuthHashParams,
  isSupabaseRecoveryHash
} from "./auth-hash.js";

test("isSupabaseRecoveryHash recognizes recovery and token hashes", () => {
  assert.equal(isSupabaseRecoveryHash("#type=recovery"), true);
  assert.equal(isSupabaseRecoveryHash("#access_token=token&refresh_token=refresh"), true);
  assert.equal(isSupabaseRecoveryHash("#home"), false);
});

test("getSupabaseAuthHashError maps expired recovery links", () => {
  assert.equal(
    getSupabaseAuthHashError("#error_code=otp_expired&error_description=expired"),
    "비밀번호 재설정 링크가 만료되었습니다. 새 메일을 다시 받아주세요."
  );
});

test("getSupabaseAuthHashParams strips the hash prefix", () => {
  assert.equal(getSupabaseAuthHashParams("#access_token=token").get("access_token"), "token");
});
