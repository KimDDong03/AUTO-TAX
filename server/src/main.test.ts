import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { buildClientApiErrorBody, createApp, isAllowedCorsOrigin, resolveDirectStartServerOptions } from "./main.js";

test("isAllowedCorsOrigin accepts localhost dev origins on non-default Vite ports", () => {
  assert.equal(isAllowedCorsOrigin("http://localhost:5174", new Set()), true);
  assert.equal(isAllowedCorsOrigin("http://127.0.0.1:4173", new Set()), true);
  assert.equal(isAllowedCorsOrigin("http://[::1]:5175", new Set()), true);
});

test("isAllowedCorsOrigin rejects loopback origins when production loopback allowance is disabled", () => {
  assert.equal(isAllowedCorsOrigin("http://localhost:5174", new Set(), false), false);
  assert.equal(isAllowedCorsOrigin("http://127.0.0.1:4173", new Set(), false), false);
  assert.equal(
    isAllowedCorsOrigin("http://localhost:5174", new Set(["http://localhost:5174"]), false),
    true
  );
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

test("createApp sends browser security headers on API responses", async () => {
  const app = await createApp(null, "__missing_web_dist__");
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("buildClientApiErrorBody hides unexpected 500 error details from API clients", () => {
  assert.deepEqual(
    buildClientApiErrorBody(new Error("Unsupported state or unable to authenticate data"), 500),
    { error: "서버 오류가 발생했습니다." }
  );
});
