import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerDraftRoutes } from "./routes/draft-routes.js";
import type { AppStore } from "./store-contract.js";

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

test("draft pilot report route forwards normalized period filters", async () => {
  const calls: Array<{ from: string | null; to: string | null }> = [];
  const requestStore = {
    getPilotIssuanceReport: async (options?: { from?: string | null; to?: string | null }) => {
      calls.push({
        from: options?.from ?? null,
        to: options?.to ?? null
      });
      return {
        ok: true,
        from: options?.from ?? null,
        to: options?.to ?? null
      };
    },
    getDraftPilotTimeline: async () => null
  } as unknown as AppStore;

  const app = express();
  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    getServerManagedSettings: async () => ({}) as never,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(
      `${baseUrl}/api/drafts/pilot-report?from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.999Z`
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-04-30T23:59:59.999Z"
    });
    assert.deepEqual(calls, [
      {
        from: "2026-04-01T00:00:00.000Z",
        to: "2026-04-30T23:59:59.999Z"
      }
    ]);
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

test("draft pilot report route can export the Phase 5 report as csv", async () => {
  const requestStore = {
    getPilotIssuanceReport: async () => ({
      organizationId: "org-1",
      generatedAt: "2026-04-17T00:00:00.000Z",
      period: {
        from: "2026-04-01T00:00:00.000Z",
        to: "2026-04-30T23:59:59.999Z"
      },
      metrics: {
        autoDraftCreationSuccessRate: { numerator: 2, denominator: 4, rate: 0.5 },
        finalIssueSuccessRate: { numerator: 3, denominator: 4, rate: 0.75 },
        exceptionRate: { numerator: 2, denominator: 8, rate: 0.25 }
      },
      eventCounts: [],
      errorCategoryCounts: [],
      periodBuckets: {
        weekly: [
          {
            bucketType: "week",
            label: "2026-04-13~2026-04-19",
            period: {
              from: "2026-04-13T00:00:00.000Z",
              to: "2026-04-19T23:59:59.999Z"
            },
            metrics: {
              autoDraftCreationSuccessRate: { numerator: 1, denominator: 2, rate: 0.5 },
              finalIssueSuccessRate: { numerator: 1, denominator: 1, rate: 1 },
              exceptionRate: { numerator: 0, denominator: 3, rate: 0 }
            },
            eventCounts: [],
            errorCategoryCounts: [],
            totals: {
              trackedDrafts: 1,
              trackedEvents: 3,
              draftCreationAttempts: 2,
              finalIssueAttempts: 1,
              exceptionCount: 0
            },
            timeSavings: {
              assumedMinutesSavedPerAutoSuccess: 10,
              autoIssueSuccessCount: 1,
              estimatedSavedMinutes: 10,
              estimatedSavedHours: 0.2,
              note: "자동 발행 성공 1건당 운영자의 수동 발행 처리 10분을 절감한다고 가정합니다."
            }
          }
        ],
        monthly: []
      },
      customerSummaries: [
        {
          customerId: 11,
          customerName: "알파 상사",
          currentIssueMode: "auto",
          manualIssueSuccessCount: 1,
          manualIssueFailureCount: 0,
          autoIssueSuccessCount: 1,
          autoIssueFailureCount: 0,
          finalIssueAttempts: 2,
          finalIssueSuccessRate: { numerator: 2, denominator: 2, rate: 1 },
          exceptionRate: { numerator: 0, denominator: 2, rate: 0 },
          reviewToAutoTransitionCount: 1,
          autoToReviewTransitionCount: 0,
          lastIssueModeChangedAt: "2026-04-17T00:00:00.000Z",
          lastIssueModeChangedTo: "auto",
          hasSuccessfulIssuanceEvidence: true,
          autoTransitionEvidenceStatus: "already-auto",
          autoTransitionEvidenceNote: "현재 auto 모드로 운영 중입니다.",
          latestFailureAt: null,
          latestFailureType: null,
          latestFailureDraftId: null,
          latestFailureTimelinePath: null,
          estimatedSavedMinutes: 10
        }
      ],
      topFailureTypes: [
        {
          rank: 1,
          key: "auto-issue::popbill.issueTaxInvoice::PB-401::",
          label: "auto-issue / popbill.issueTaxInvoice / PB-401",
          errorCategory: "auto-issue",
          errorOperation: "popbill.issueTaxInvoice",
          errorCode: "PB-401",
          messageBucket: null,
          count: 2,
          lastSeenAt: "2026-04-18T00:00:00.000Z",
          latestDraftId: 33,
          latestCustomerId: 11,
          latestTimelinePath: "/api/drafts/33/pilot-timeline"
        }
      ],
      timeSavings: {
        assumedMinutesSavedPerAutoSuccess: 10,
        autoIssueSuccessCount: 1,
        estimatedSavedMinutes: 10,
        estimatedSavedHours: 0.2,
        note: "자동 발행 성공 1건당 운영자의 수동 발행 처리 10분을 절감한다고 가정합니다."
      },
      drilldown: {
        timelinePathTemplate: "/api/drafts/:id/pilot-timeline",
        memoComparisonProcedure: "운영 메모에 남긴 draftId 또는 고객별 최신 실패 draftId로 /api/drafts/:id/pilot-timeline 를 조회해 실제 발행/실패 로그와 대조합니다."
      },
      totals: {
        trackedDrafts: 3,
        trackedEvents: 8,
        draftCreationAttempts: 4,
        finalIssueAttempts: 4,
        exceptionCount: 2
      },
      notes: {
        autoDraftCreationSuccessRate: "메일 동기화 기반 성공률",
        finalIssueSuccessRate: "최종 발행 성공률",
        exceptionRate: "예외율",
        draftPreviewOpened: "미리보기 이벤트",
        customerSummaries: "고객별 성공률",
        topFailureTypes: "실패 유형 Top N",
        timeSavings: "자동 성공 1건당 10분",
        memoComparison: "draft timeline drill-down"
      }
    }),
    getDraftPilotTimeline: async () => null
  } as unknown as AppStore;

  const app = express();
  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    getServerManagedSettings: async () => ({}) as never,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/drafts/pilot-report?format=csv`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(response.headers.get("content-disposition") ?? "", /pilot-report-2026-04-17\.csv/);
    const body = (await response.text()).replace(/^\uFEFF/, "");
    assert.match(body, /^section,group,label,/);
    assert.match(body, /summary,overall,overall/);
    assert.match(body, /customer,customer,알파 상사/);
    assert.match(body, /failure,top-failure,auto-issue \/ popbill.issueTaxInvoice \/ PB-401/);
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

test("draft pilot timeline route returns 404 when draft timeline is unavailable", async () => {
  const requestStore = {
    getPilotIssuanceReport: async () => ({ ok: true }),
    getDraftPilotTimeline: async () => null
  } as unknown as AppStore;

  const app = express();
  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    getServerManagedSettings: async () => ({}) as never,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/drafts/404/pilot-timeline`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "발행 대기건을 찾지 못했습니다."
    });
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

test("draft pilot timeline route preserves actor and context evidence without reshaping it", async () => {
  const comparableSnapshot = {
    supplyCost: 100000,
    taxTotal: 10000,
    totalAmount: 110000,
    writeDate: "20260416",
    invoicerBusinessNumber: "1112233333",
    invoiceeCorpNum: "1234567890",
    invoiceeTaxRegId: "0010",
    recipientEmail: "kepco-501@example.com"
  };
  const expectedTimeline = {
    organizationId: "org-1",
    draftId: 501,
    customerId: 77,
    issueMode: "review",
    events: [
      {
        organizationId: "org-1",
        actorUserId: "user-1",
        createdAt: "2026-04-16T01:00:00.000Z",
        level: "info",
        scope: "drafts",
        message: "초안 미리보기 열기 버튼 실행이 기록되었습니다.",
        eventType: "draft-preview-opened",
        draftId: 501,
        customerId: 77,
        issueMode: "review",
        errorCategory: null,
        context: {
          previewSource: "ui-click",
          previewSnapshot: comparableSnapshot
        }
      },
      {
        organizationId: "org-1",
        actorUserId: "user-1",
        createdAt: "2026-04-16T01:02:07.000Z",
        level: "info",
        scope: "drafts",
        message: "수동 발행을 완료했습니다.",
        eventType: "manual-issue-succeeded",
        draftId: 501,
        customerId: 77,
        issueMode: "review",
        errorCategory: null,
        context: {
          executionPath: "single",
          clickedAt: "2026-04-16T01:02:03.000Z",
          issuedAt: "2026-04-16T01:02:07.000Z",
          issuanceSnapshot: comparableSnapshot
        }
      }
    ]
  };
  const requestStore = {
    getPilotIssuanceReport: async () => ({ ok: true }),
    getDraftPilotTimeline: async () => expectedTimeline
  } as unknown as AppStore;

  const app = express();
  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    getServerManagedSettings: async () => ({}) as never,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/drafts/501/pilot-timeline`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expectedTimeline);
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

test("draft preview opened route records an explicit frontend pilot event", async () => {
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];
  const expectedPreviewSnapshot = {
    supplyCost: 100000,
    taxTotal: 10000,
    totalAmount: 110000,
    writeDate: "20260416",
    invoicerBusinessNumber: "1112233333",
    invoiceeCorpNum: "1234567890",
    invoiceeTaxRegId: "0010",
    recipientEmail: "kepco-501@example.com"
  };
  const requestStore = {
    getPilotIssuanceReport: async () => ({ ok: true }),
    getDraftPilotTimeline: async () => null,
    getDraft: async () =>
      ({
        id: 501,
        customerId: 77,
        issueMode: "review",
        supplyCost: 100000,
        taxTotal: 10000,
        totalAmount: 110000,
        writeDate: "20260416",
        kepcoCorpNum: "1234567890",
        kepcoBranchId: "0010",
        recipientEmail: "kepco-501@example.com"
      }) as Awaited<ReturnType<AppStore["getDraft"]>>,
    getCustomer: async () =>
      ({
        id: 77,
        businessNumber: "1112233333"
      }) as Awaited<ReturnType<AppStore["getCustomer"]>>,
    createLog: async (level: string, scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const app = express();
  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    getServerManagedSettings: async () => ({}) as never,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/drafts/501/pilot-preview-opened`, {
      method: "POST"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.level, "info");
    assert.equal(logs[0]?.scope, "drafts");
    assert.equal(logs[0]?.message, "초안 미리보기 열기 버튼 실행이 기록되었습니다.");
    assert.deepEqual(logs[0]?.context, {
      draftId: 501,
      customerId: 77,
      issueMode: "review",
      previewPath: "view-url",
      previewSource: "ui-click",
      eventType: "draft-preview-opened",
      previewSnapshot: expectedPreviewSnapshot
    });
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

test("single manual issue route records audit-ready manual issue context", async () => {
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];
  const clickedAt = "2026-04-16T01:02:03.000Z";
  const issuedAt = "2026-04-16T01:02:07.000Z";
  const writeDate = "20260416";
  const customer = {
    id: 77,
    businessNumber: "1112233333"
  };
  const draft = {
    id: 501,
    customerId: 77,
    issueMode: "review",
    status: "review",
    issueRequestedAt: null,
    issuedAt: null,
    writeDate: null,
    supplyCost: 100000,
    taxTotal: 10000,
    totalAmount: 110000,
    kepcoCorpNum: "1234567890",
    kepcoBranchId: "0010",
    recipientEmail: "kepco-501@example.com"
  };
  const claimedDraft = {
    ...draft,
    issueRequestedAt: clickedAt,
    status: "issuing"
  };
  const issuedDraft = {
    ...claimedDraft,
    status: "issued",
    issuedAt,
    writeDate
  };
  const expectedSnapshot = {
    supplyCost: 100000,
    taxTotal: 10000,
    totalAmount: 110000,
    writeDate,
    invoicerBusinessNumber: customer.businessNumber,
    invoiceeCorpNum: "1234567890",
    invoiceeTaxRegId: "0010",
    recipientEmail: "kepco-501@example.com"
  };
  const requestStore = {
    getPilotIssuanceReport: async () => ({ ok: true }),
    getDraftPilotTimeline: async () => null,
    getDraft: async () => draft,
    claimDraftForIssue: async () => claimedDraft,
    getCustomer: async () => customer,
    createLog: async (level: string, scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const app = express();
  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    getServerManagedSettings: async () => ({}) as never,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    issueDraftNow: async () => issuedDraft as never,
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/drafts/501/issue`, {
      method: "POST"
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { issuedAt?: string };
    assert.equal(body.issuedAt, issuedAt);
    assert.equal(logs.length, 2);

    assert.deepEqual(asRecord(logs[0]?.context), {
      draftId: 501,
      customerId: 77,
      issueMode: "review",
      executionPath: "single",
      clickedAt,
      eventType: "manual-issue-clicked"
    });
    assert.deepEqual(asRecord(logs[1]?.context), {
      draftId: 501,
      customerId: 77,
      issueMode: "review",
      executionPath: "single",
      clickedAt,
      issuedAt,
      eventType: "manual-issue-succeeded",
      issuanceSnapshot: expectedSnapshot
    });
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

test("bulk manual issue route records per-draft manual issue evidence", async () => {
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];
  const clickedAtByDraftId = new Map([
    [601, "2026-04-16T02:00:00.000Z"],
    [602, "2026-04-16T02:05:00.000Z"]
  ]);
  const issuedAt = "2026-04-16T02:00:11.000Z";
  const writeDate = "20260416";
  const drafts = [
    {
      id: 601,
      customerId: 81,
      issueMode: "review",
      status: "review",
      supplyCost: 200000,
      taxTotal: 20000,
      totalAmount: 220000,
      kepcoCorpNum: "2223344445",
      kepcoBranchId: "1000",
      recipientEmail: "kepco-601@example.com"
    },
    {
      id: 602,
      customerId: 82,
      issueMode: "review",
      status: "failed",
      supplyCost: 300000,
      taxTotal: 30000,
      totalAmount: 330000,
      kepcoCorpNum: "3334455556",
      kepcoBranchId: "",
      recipientEmail: "kepco-602@example.com"
    }
  ];
  const customer = {
    id: 81,
    businessNumber: "9988877777"
  };
  const claimedDrafts = new Map(
    drafts.map((draft) => [
      draft.id,
      {
        ...draft,
        issueRequestedAt: clickedAtByDraftId.get(draft.id),
        issuedAt: null,
        issueError: "",
        writeDate: null,
        popbillResultJson: "",
        popbillEnvironment: null
      }
    ])
  );
  const expectedSnapshot = {
    supplyCost: 200000,
    taxTotal: 20000,
    totalAmount: 220000,
    writeDate,
    invoicerBusinessNumber: customer.businessNumber,
    invoiceeCorpNum: "2223344445",
    invoiceeTaxRegId: "1000",
    recipientEmail: "kepco-601@example.com"
  };

  const requestStore = {
    getPilotIssuanceReport: async () => ({ ok: true }),
    getDraftPilotTimeline: async () => null,
    listDrafts: async () => drafts,
    claimDraftForIssue: async (draftId: number) => claimedDrafts.get(draftId) ?? null,
    getCustomer: async (customerId: number) => (customerId === 81 ? customer : null),
    updateDraftStatus: async (draftId: number, status: string, issueError?: string) => ({
      ...(claimedDrafts.get(draftId) ?? {}),
      status,
      issueError: issueError ?? ""
    }),
    createLog: async (level: string, scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const app = express();
  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    getServerManagedSettings: async () => ({}) as never,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    issueDraftNow: async (_store, _settings, _customer, draft) =>
      ({
        ...draft,
        status: "issued",
        issuedAt,
        writeDate
      }) as never,
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/drafts/issue-all`, {
      method: "POST"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      total: 2,
      issued: 1,
      failed: 1,
      results: [
        {
          draftId: 601,
          customerId: 81,
          status: "issued"
        },
        {
          draftId: 602,
          customerId: 82,
          status: "failed",
          error: "고객 정보를 찾지 못했습니다."
        }
      ]
    });

    const draftLogs = logs.filter((entry) => asRecord(entry.context).eventType);
    assert.equal(draftLogs.length, 4);

    const findDraftEvent = (draftId: number, eventType: string) =>
      draftLogs.find((entry) => {
        const context = asRecord(entry.context);
        return context.draftId === draftId && context.eventType === eventType;
      });

    assert.deepEqual(asRecord(findDraftEvent(601, "manual-issue-clicked")?.context), {
      draftId: 601,
      customerId: 81,
      issueMode: "review",
      executionPath: "bulk-manual",
      clickedAt: clickedAtByDraftId.get(601),
      eventType: "manual-issue-clicked"
    });
    assert.deepEqual(asRecord(findDraftEvent(601, "manual-issue-succeeded")?.context), {
      draftId: 601,
      customerId: 81,
      issueMode: "review",
      executionPath: "bulk-manual",
      clickedAt: clickedAtByDraftId.get(601),
      issuedAt,
      eventType: "manual-issue-succeeded",
      issuanceSnapshot: expectedSnapshot
    });
    assert.deepEqual(asRecord(findDraftEvent(602, "manual-issue-clicked")?.context), {
      draftId: 602,
      customerId: 82,
      issueMode: "review",
      executionPath: "bulk-manual",
      clickedAt: clickedAtByDraftId.get(602),
      eventType: "manual-issue-clicked"
    });
    assert.deepEqual(asRecord(findDraftEvent(602, "manual-issue-failed")?.context), {
      draftId: 602,
      customerId: 82,
      issueMode: "review",
      executionPath: "bulk-manual",
      clickedAt: clickedAtByDraftId.get(602),
      eventType: "manual-issue-failed",
      errorCategory: "manual-issue",
      error: "고객 정보를 찾지 못했습니다."
    });
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

test("draft pilot report route rejects invalid timestamps", async () => {
  const requestStore = {
    getPilotIssuanceReport: async () => ({ ok: true }),
    getDraftPilotTimeline: async () => null
  } as unknown as AppStore;

  const app = express();
  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    getServerManagedSettings: async () => ({}) as never,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/drafts/pilot-report?from=not-a-date`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "유효한 ISO 시각이 아닙니다."
    });
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
