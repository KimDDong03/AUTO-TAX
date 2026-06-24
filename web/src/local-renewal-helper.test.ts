import test from "node:test";
import assert from "node:assert/strict";
import {
  getLocalRenewalHelperStatus,
  requestLocalCertificateBusinessInfoLookupBatch,
  requestLocalHomeTaxBusinessInfoLookupBatch,
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

test("getLocalRenewalHelperStatus marks loopback helper fetches for local network access", async () => {
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
          notes: ["AT 헬퍼가 준비되었습니다."]
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
    assert.equal((capturedInit as RequestInit & { targetAddressSpace?: string } | undefined)?.targetAddressSpace, "loopback");
  } finally {
    globalThis.fetch = originalFetch;
    resetLocalRenewalHelperStatusCacheForTests();
  }
});

test("requestLocalHomeTaxBusinessInfoLookupBatch uses bounded parallel helper batch", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: unknown;

  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        ok: true,
        version: "0.1.70",
        results: [
          {
            ok: true,
            source: "hometax",
            stage: "business-info",
            certificateIndex: "10",
            certificateCn: "테스트",
            sourcePort: 42235,
            loginCode: "S",
            businessInfoSnapshot: null,
            message: "ok",
            error: null
          }
        ]
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
    const responses = await requestLocalHomeTaxBusinessInfoLookupBatch([
      {
        certificateIndex: 10,
        certificateCn: "테스트",
        certificatePassword: "secret"
      },
      {
        certificateIndex: 11,
        certificateCn: "테스트2",
        certificatePassword: "secret"
      }
    ]);

    assert.equal((capturedBody as { concurrency?: number } | undefined)?.concurrency, 2);
    assert.equal((capturedBody as { requests?: unknown[] } | undefined)?.requests?.length, 2);
    assert.equal(responses[0]?.result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestLocalCertificateBusinessInfoLookupBatch uses helper-owned business-info job endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: unknown;

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        ok: true,
        version: "0.1.95",
        job: {
          id: "job-1",
          status: "complete",
          phase: "complete",
          total: 1,
          completed: 1,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:01.000Z",
          error: null,
          signGate: { total: 1, completed: 1, concurrency: 16 },
          homeTax: { total: 0, completed: 0, concurrency: 5 },
          results: [
            {
              ok: true,
              source: "signgate",
              status: "complete",
              stage: "signgate-preflight",
              certificateIndex: "10",
              certificateCn: "테스트",
              sourcePort: 14319,
              loginCode: "0000",
              businessInfoSnapshot: null,
              message: "ok",
              error: null
            }
          ]
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
    const responses = await requestLocalCertificateBusinessInfoLookupBatch([
      {
        certificateIndex: 10,
        certificateCn: "테스트",
        certificatePassword: "secret",
        issuerToName: "SignGate",
        oid: "1.2.410.200004.5.2.1.6.257"
      }
    ]);

    assert.match(capturedUrl, /\/api\/certificates\/business-info-jobs$/);
    assert.equal((capturedBody as { concurrency?: number } | undefined)?.concurrency, undefined);
    assert.equal((capturedBody as { homeTaxConcurrency?: number } | undefined)?.homeTaxConcurrency, undefined);
    assert.equal((capturedBody as { requests?: Array<{ issuerToName?: string | null }> } | undefined)?.requests?.[0]?.issuerToName, "SignGate");
    assert.equal(responses[0]?.result.source, "signgate");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestLocalCertificateBusinessInfoLookupBatch reports helper-owned job progress", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: unknown;
  const progressMessages: string[] = [];

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/certificates/business-info-jobs")) {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          ok: true,
          version: "0.1.95",
          job: {
            id: "job-2",
            status: "running",
            phase: "signgate",
            total: 20,
            completed: 0,
            createdAt: "2026-06-24T00:00:00.000Z",
            updatedAt: "2026-06-24T00:00:00.000Z",
            error: null,
            signGate: { total: 20, completed: 0, concurrency: 16 },
            homeTax: { total: 0, completed: 0, concurrency: 5 },
            results: null
          }
        }),
        {
          status: 202,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        version: "0.1.95",
        job: {
          id: "job-2",
          status: "complete",
          phase: "complete",
          total: 20,
          completed: 20,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:01.000Z",
          error: null,
          signGate: { total: 20, completed: 20, concurrency: 16 },
          homeTax: { total: 5, completed: 5, concurrency: 5 },
          results: Array.from({ length: 20 }, (_, index) => ({
            ok: true,
            source: "signgate",
            status: "complete",
            stage: "signgate-preflight",
            certificateIndex: String(index + 1),
            certificateCn: `테스트${index + 1}`,
            sourcePort: 14319,
            loginCode: "0000",
            businessInfoSnapshot: null,
            message: "ok",
            error: null
          }))
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
    const responses = await requestLocalCertificateBusinessInfoLookupBatch(
      Array.from({ length: 20 }, (_, index) => ({
        certificateIndex: index + 1,
        certificateCn: `테스트${index + 1}`,
        certificatePassword: "secret"
      })),
      {
        onProgress: (message) => progressMessages.push(message)
      }
    );

    assert.equal((capturedBody as { concurrency?: number } | undefined)?.concurrency, undefined);
    assert.equal((capturedBody as { homeTaxConcurrency?: number } | undefined)?.homeTaxConcurrency, undefined);
    assert.equal((capturedBody as { requests?: unknown[] } | undefined)?.requests?.length, 20);
    assert.match(progressMessages.join("\n"), /SignGate 조회 0\/20건 완료/);
    assert.match(progressMessages.join("\n"), /사업자정보 조회 20\/20건 완료/);
    assert.equal(responses.length, 20);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestLocalCertificateBusinessInfoLookupBatch keeps legacy batch fallback without web-owned concurrency", async () => {
  const originalFetch = globalThis.fetch;
  const capturedUrls: string[] = [];
  let capturedBatchBody: unknown;

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    capturedUrls.push(url);
    if (url.endsWith("/api/certificates/business-info-jobs")) {
      return new Response(JSON.stringify({ ok: false, error: "not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    capturedBatchBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        ok: true,
        version: "0.1.94",
        results: [
          {
            ok: true,
            source: "signgate",
            status: "complete",
            stage: "signgate-preflight",
            certificateIndex: "1",
            certificateCn: "테스트",
            sourcePort: 14319,
            loginCode: "0000",
            businessInfoSnapshot: null,
            message: "ok",
            error: null
          }
        ]
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
    const responses = await requestLocalCertificateBusinessInfoLookupBatch([
      {
        certificateIndex: 1,
        certificateCn: "테스트",
        certificatePassword: "secret"
      }
    ]);

    assert.match(capturedUrls[0] ?? "", /\/api\/certificates\/business-info-jobs$/);
    assert.match(capturedUrls[1] ?? "", /\/api\/certificates\/business-info-batch$/);
    assert.equal((capturedBatchBody as { concurrency?: number } | undefined)?.concurrency, undefined);
    assert.equal((capturedBatchBody as { homeTaxConcurrency?: number } | undefined)?.homeTaxConcurrency, undefined);
    assert.equal(responses[0]?.result.source, "signgate");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestLocalHomeTaxBusinessInfoLookupBatch caps HomeTax lookup concurrency at five", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: unknown;

  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        ok: true,
        version: "0.1.87",
        results: Array.from({ length: 6 }, (_, index) => ({
          ok: true,
          source: "hometax",
          stage: "business-info",
          certificateIndex: String(index + 1),
          certificateCn: `테스트${index + 1}`,
          sourcePort: 42235,
          loginCode: "S",
          businessInfoSnapshot: null,
          message: "ok",
          error: null
        }))
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
    const responses = await requestLocalHomeTaxBusinessInfoLookupBatch(
      Array.from({ length: 6 }, (_, index) => ({
        certificateIndex: index + 1,
        certificateCn: `테스트${index + 1}`,
        certificatePassword: "secret"
      }))
    );

    assert.equal((capturedBody as { concurrency?: number } | undefined)?.concurrency, 5);
    assert.equal((capturedBody as { requests?: unknown[] } | undefined)?.requests?.length, 6);
    assert.equal(responses.length, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestLocalHomeTaxBusinessInfoLookupBatch does not retry individual lookups after batch failure", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const progressMessages: string[] = [];

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    const responses = await requestLocalHomeTaxBusinessInfoLookupBatch(
      [
        {
          certificateIndex: 10,
          certificateCn: "유학현",
          certificatePassword: "secret"
        },
        {
          certificateIndex: 11,
          certificateCn: "하달용",
          certificatePassword: "secret"
        }
      ],
      {
        onProgress: (message) => progressMessages.push(message)
      }
    );

    assert.equal(fetchCalls, 1);
    assert.equal(responses.length, 2);
    assert.equal(responses[0]?.result.ok, false);
    assert.match(responses[0]?.result.error ?? "", /AT 헬퍼/);
    assert.deepEqual(progressMessages, ["2건 홈택스 조회 응답 실패"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
