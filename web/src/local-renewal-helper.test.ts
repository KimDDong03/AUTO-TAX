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
