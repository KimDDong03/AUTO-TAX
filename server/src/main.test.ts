import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedCorsOrigin, resolveDirectStartServerOptions } from "./main.js";

test("isAllowedCorsOrigin accepts localhost dev origins on non-default Vite ports", () => {
  assert.equal(isAllowedCorsOrigin("http://localhost:5174", new Set()), true);
  assert.equal(isAllowedCorsOrigin("http://127.0.0.1:4173", new Set()), true);
  assert.equal(isAllowedCorsOrigin("http://[::1]:5175", new Set()), true);
});

test("isAllowedCorsOrigin still rejects unrelated origins unless explicitly allowed", () => {
  assert.equal(isAllowedCorsOrigin("https://example.test", new Set()), false);
  assert.equal(
    isAllowedCorsOrigin("https://preview.example.test", new Set(["https://preview.example.test"])),
    true
  );
});

test("resolveDirectStartServerOptions allows Supabase startup fallback for npm dev server", () => {
  assert.deepEqual(resolveDirectStartServerOptions({ npm_lifecycle_event: "dev:server" }), {
    storeInitializationTimeoutMs: 5000,
    allowStoreInitializationFailure: true
  });
});

test("resolveDirectStartServerOptions keeps production startup strict by default", () => {
  assert.deepEqual(resolveDirectStartServerOptions({ npm_lifecycle_event: "start" }), {
    storeInitializationTimeoutMs: undefined,
    allowStoreInitializationFailure: false
  });
});

test("resolveDirectStartServerOptions accepts explicit store startup overrides", () => {
  assert.deepEqual(
    resolveDirectStartServerOptions({
      npm_lifecycle_event: "start",
      AUTO_TAX_STORE_INIT_TIMEOUT_MS: "12000",
      AUTO_TAX_ALLOW_STORE_INIT_FAILURE: "1"
    }),
    {
      storeInitializationTimeoutMs: 12000,
      allowStoreInitializationFailure: true
    }
  );
});

test("resolveDirectStartServerOptions lets explicit false override dev fallback", () => {
  assert.deepEqual(
    resolveDirectStartServerOptions({
      npm_lifecycle_event: "dev:server",
      AUTO_TAX_ALLOW_STORE_INIT_FAILURE: "0"
    }),
    {
      storeInitializationTimeoutMs: 5000,
      allowStoreInitializationFailure: false
    }
  );
});
