import test from "node:test";
import assert from "node:assert/strict";
import {
  getLocalRenewalHelperStatus,
  resetLocalRenewalHelperStatusCacheForTests
} from "./local-renewal-helper";

test("getLocalRenewalHelperStatus deduplicates concurrent offline probes", async () => {
  resetLocalRenewalHelperStatusCacheForTests();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 0));
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    const [first, second] = await Promise.all([
      getLocalRenewalHelperStatus(),
      getLocalRenewalHelperStatus()
    ]);

    assert.equal(fetchCalls, 1);
    assert.equal(first.online, false);
    assert.equal(second.online, false);
    assert.equal(first.message, second.message);
  } finally {
    globalThis.fetch = originalFetch;
    resetLocalRenewalHelperStatusCacheForTests();
  }
});

test("getLocalRenewalHelperStatus reuses cached offline status until a forced refresh", async () => {
  resetLocalRenewalHelperStatusCacheForTests();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    const first = await getLocalRenewalHelperStatus({ force: true });
    const cached = await getLocalRenewalHelperStatus();
    const forced = await getLocalRenewalHelperStatus({ force: true });

    assert.equal(fetchCalls, 2);
    assert.equal(first.online, false);
    assert.equal(cached.online, false);
    assert.equal(forced.online, false);
  } finally {
    globalThis.fetch = originalFetch;
    resetLocalRenewalHelperStatusCacheForTests();
  }
});

test("getLocalRenewalHelperStatus does not force the wrong private network target space", async () => {
  resetLocalRenewalHelperStatusCacheForTests();
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (_input, init) => {
    capturedInit = init;
    return new Response(
      JSON.stringify({
        ok: true,
        version: "0.1.17",
        status: {
          processDetected: true,
          bridgeSummary: "ok",
          notes: ["로컬 헬퍼가 준비되었습니다."]
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const status = await getLocalRenewalHelperStatus({ force: true });

    assert.equal(status.online, true);
    assert.equal((capturedInit as RequestInit & { targetAddressSpace?: string } | undefined)?.targetAddressSpace, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    resetLocalRenewalHelperStatusCacheForTests();
  }
});
