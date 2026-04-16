import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerDraftRoutes } from "./routes/draft-routes.js";
import type { AppStore } from "./store-contract.js";

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

test("draft preview opened route records an explicit frontend pilot event", async () => {
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];
  const requestStore = {
    getPilotIssuanceReport: async () => ({ ok: true }),
    getDraftPilotTimeline: async () => null,
    getDraft: async () =>
      ({
        id: 501,
        customerId: 77,
        issueMode: "review"
      }) as Awaited<ReturnType<AppStore["getDraft"]>>,
    getCustomer: async () =>
      ({
        id: 77
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
      eventType: "draft-preview-opened"
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
