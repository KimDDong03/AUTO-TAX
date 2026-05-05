import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSupabaseAuthTimeoutMs,
  SupabaseAuthTimeoutError,
  withSupabaseAuthTimeout
} from "./supabase-timeout.js";

test("parseSupabaseAuthTimeoutMs accepts only positive integer overrides", () => {
  assert.equal(parseSupabaseAuthTimeoutMs("3000"), 3000);
  assert.equal(parseSupabaseAuthTimeoutMs("0"), undefined);
  assert.equal(parseSupabaseAuthTimeoutMs("-1"), undefined);
  assert.equal(parseSupabaseAuthTimeoutMs("1.5"), undefined);
  assert.equal(parseSupabaseAuthTimeoutMs("abc"), undefined);
  assert.equal(parseSupabaseAuthTimeoutMs(undefined), undefined);
});

test("withSupabaseAuthTimeout resolves completed operations", async () => {
  await assert.doesNotReject(async () => {
    const result = await withSupabaseAuthTimeout(Promise.resolve("ok"), 50);
    assert.equal(result, "ok");
  });
});

test("withSupabaseAuthTimeout rejects stalled operations", async () => {
  await assert.rejects(
    () => withSupabaseAuthTimeout(new Promise<string>(() => undefined), 10),
    SupabaseAuthTimeoutError
  );
});
