import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerCoreRoutes } from "./routes/core-routes.js";

test("core internal job routes expose maintenance separately without changing dispatch/run behavior", async () => {
  const calls = {
    maintenance: 0,
    dispatch: 0,
    run: 0,
    runLimits: [] as Array<number | undefined>
  };

  const app = express();
  app.use(express.json());

  registerCoreRoutes({
    app,
    store: null,
    getRequestStore: () => {
      throw new Error("request store should not be used in internal job route test");
    },
    requireAuthContext: () =>
      ({
        isPlatformAdmin: true,
        activeOrganizationId: null
      }) as never,
    requireInternalJobAccess: () => "secret",
    publicLoginLimiter: (_req, _res, next) => next(),
    publicSignupLimiter: (_req, _res, next) => next(),
    publicConsultationLimiter: (_req, _res, next) => next(),
    createSupabaseAdminClient: () => ({}) as never,
    createSupabasePublicClient: () =>
      ({
        auth: {
          signInWithPassword: async () => ({
            data: { session: null },
            error: null
          })
        }
      }) as never,
    resolveAuthenticatedAppSession: async () => {
      throw new Error("unused");
    },
    findAuthUserByLoginId: async () => null,
    isEmailLikeAccount: () => true,
    normalizeLoginId: (value) => value.trim().toLowerCase(),
    normalizeEmail: (value) => value,
    createWorkspaceLoginEmail: (loginId) => `${loginId}@workspace.auto-tax.local`,
    upsertAuthUserLoginIndex: async () => undefined,
    createEmptyBootstrapWorkspace: () => ({
      settings: {} as never,
      customers: [],
      customerCertificates: [],
      drafts: [],
      inbox: [],
      counts: {
        actionableDrafts: 0,
        customers: 0,
        reviewDrafts: 0,
        scheduledDrafts: 0,
        failedDrafts: 0,
        unmatchedMessages: 0
      }
    }),
    createEmptySettings: () => ({} as never),
    toClientSettings: (value) => value,
    toClientCustomer: (customer) => customer,
    runPlatformMaintenance: async () => {
      calls.maintenance += 1;
      return {
        maintenanceKey: "retention-prune",
        action: "pruned" as const,
        completedDate: "2026-04-14",
        ranAt: "2026-04-14T00:00:00.000Z",
        totalDeletedRows: 3,
        tables: [
          {
            table: "app_logs",
            retentionDays: 30,
            cutoff: "2026-03-15T00:00:00.000Z",
            deletedRows: 3
          }
        ]
      };
    },
    dispatchRecurringJobs: async () => {
      calls.dispatch += 1;
      return {
        checkedOrganizations: 2,
        dispatched: 1,
        skipped: 1,
        details: []
      };
    },
    runDueJobs: async ({ claimedBy, limit }) => {
      calls.run += 1;
      calls.runLimits.push(limit);
      assert.equal(claimedBy, "cron-runner");
      return {
        attempted: 1,
        claimed: 1,
        completed: 1,
        failed: 0,
        details: []
      };
    }
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const maintenanceResponse = await fetch(`${baseUrl}/api/internal/jobs/maintenance`, {
      method: "POST"
    });
    assert.equal(maintenanceResponse.status, 200);
    assert.deepEqual(await maintenanceResponse.json(), {
      ok: true,
      accessMode: "secret",
      maintenanceKey: "retention-prune",
      action: "pruned",
      completedDate: "2026-04-14",
      ranAt: "2026-04-14T00:00:00.000Z",
      totalDeletedRows: 3,
      tables: [
        {
          table: "app_logs",
          retentionDays: 30,
          cutoff: "2026-03-15T00:00:00.000Z",
          deletedRows: 3
        }
      ]
    });

    const dispatchResponse = await fetch(`${baseUrl}/api/internal/jobs/dispatch`, {
      method: "POST"
    });
    assert.equal(dispatchResponse.status, 200);
    assert.deepEqual(await dispatchResponse.json(), {
      ok: true,
      accessMode: "secret",
      checkedOrganizations: 2,
      dispatched: 1,
      skipped: 1,
      details: []
    });

    const runResponse = await fetch(`${baseUrl}/api/internal/jobs/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ limit: 100 })
    });
    assert.equal(runResponse.status, 200);
    assert.deepEqual(await runResponse.json(), {
      ok: true,
      accessMode: "secret",
      attempted: 1,
      claimed: 1,
      completed: 1,
      failed: 0,
      details: []
    });
    assert.deepEqual(calls, {
      maintenance: 1,
      dispatch: 1,
      run: 1,
      runLimits: [25]
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
