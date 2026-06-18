import test from "node:test";
import assert from "node:assert/strict";

process.env.AUTO_TAX_RENEWAL_AGENT_DISABLE_AUTO_START = "1";

const { shouldRunFilesystemCertificateFallback } = await import(
  "./renewal-agent.ts"
);

test("certificate list skips filesystem fallback after a successful bridge-backed list", () => {
  assert.equal(
    shouldRunFilesystemCertificateFallback({
      ok: true,
      certificateCount: 246,
    }),
    false,
  );
});

test("certificate list uses filesystem fallback when bridge-backed list is unavailable or empty", () => {
  assert.equal(
    shouldRunFilesystemCertificateFallback({
      ok: false,
      certificateCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldRunFilesystemCertificateFallback({
      ok: true,
      certificateCount: 0,
    }),
    true,
  );
});
