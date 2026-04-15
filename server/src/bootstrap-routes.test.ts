import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerAppShell } from "./app-shell.js";
import type { AppSettings, Customer, CustomerCertificate, InboxMessage, InvoiceDraft, LogEntry } from "./domain.js";
import { registerCoreRoutes } from "./routes/core-routes.js";
import { registerDraftRoutes } from "./routes/draft-routes.js";
import { registerMailRoutes } from "./routes/mail-routes.js";
import type { AppStore } from "./store-contract.js";

test("bootstrap stays slim and mailbox/log data remains on dedicated endpoints", async () => {
  const settings = { companyName: "AUTO-TAX" } as unknown as AppSettings;
  const customers = [{ id: 1, customerName: "테스트 고객" }] as unknown as Customer[];
  const customerCertificates = [{ id: 11, customerId: 1 }] as unknown as CustomerCertificate[];
  const drafts = [{ id: 21, status: "review", customerId: 1 }] as unknown as InvoiceDraft[];
  const inbox = [{ id: 31, parseStatus: "unmatched" }] as unknown as InboxMessage[];
  const logs = [{ id: 41, level: "info", scope: "ops", message: "로그" }] as unknown as LogEntry[];
  const calls = {
    getBootstrapWorkspace: 0,
    getDashboard: 0,
    listDrafts: 0,
    listInbox: 0,
    listLogs: 0
  };

  const requestStore = {
    getBootstrapWorkspace: async () => {
      calls.getBootstrapWorkspace += 1;
      return {
        settings,
        customers,
        customerCertificates,
        drafts: [],
        inbox: [],
        counts: {
          actionableDrafts: 0,
          customers: customers.length,
          reviewDrafts: 0,
          scheduledDrafts: 0,
          failedDrafts: 0,
          unmatchedMessages: 0
        }
      };
    },
    getDashboard: async () => {
      calls.getDashboard += 1;
      throw new Error("/api/bootstrap should not call getDashboard");
    },
    listDrafts: async () => {
      calls.listDrafts += 1;
      return drafts;
    },
    listInbox: async () => {
      calls.listInbox += 1;
      return inbox;
    },
    listLogs: async () => {
      calls.listLogs += 1;
      return logs;
    }
  } as unknown as AppStore;

  const authContext = {
    userId: "user-1",
    email: "owner@example.com",
    displayName: "Owner",
    isPlatformAdmin: true,
    activeOrganizationId: "org-1",
    activeOrganizationName: "AUTO-TAX",
    activeOrganizationRole: "owner",
    organizations: []
  };

  const app = express();
  app.use(express.json());

  registerCoreRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireAuthContext: () => authContext as never,
    requireInternalJobAccess: () => "secret",
    publicLoginLimiter: (_req, _res, next) => next(),
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
    findAuthUserByLoginId: async () => null,
    isEmailLikeAccount: () => true,
    normalizeEmail: (value) => value,
    createEmptyBootstrapWorkspace: () => ({
      settings: settings as never,
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
    createEmptySettings: () => settings,
    toClientSettings: (value) => ({
      ...value,
      clientSettings: true
    }),
    toClientCustomer: (customer) => ({
      ...customer,
      customerName: `${customer.customerName} (client)`
    }),
    runPlatformMaintenance: async () => ({
      action: "skipped"
    }),
    dispatchRecurringJobs: async () => ({}),
    runDueJobs: async () => ({})
  });

  registerMailRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => authContext as never,
    reprocessInboxMessage: async () => ({ status: "parsed" }),
    syncMailbox: async () => ({
      scanned: 0,
      imported: 0,
      createdDrafts: 0,
      scheduledDrafts: 0,
      unmatched: 0,
      failures: 0
    })
  });

  registerDraftRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => authContext as never,
    getServerManagedSettings: async () => settings,
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getErrorStatus: () => 500,
    buildApiErrorBody: () => ({ error: "unused" }),
    assertDraftPopbillEnvironment: async () => undefined,
    backfillDraftPopbillEnvironmentIfMissing: async () => undefined
  });

  registerAppShell({
    app,
    store: requestStore,
    requirePlatformAdmin: () => authContext as never,
    webDist: "__missing_web_dist__"
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const bootstrapResponse = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(bootstrapResponse.status, 200);
    const bootstrapPayload = (await bootstrapResponse.json()) as Record<string, unknown>;

    assert.equal(calls.getBootstrapWorkspace, 1);
    assert.equal(calls.getDashboard, 0);
    assert.equal(calls.listDrafts, 0);
    assert.equal(calls.listInbox, 0);
    assert.equal(calls.listLogs, 0);
    assert.equal("logs" in bootstrapPayload, false);
    assert.deepEqual(bootstrapPayload.drafts, []);
    assert.deepEqual(bootstrapPayload.inbox, []);
    assert.deepEqual(bootstrapPayload.customerCertificates, customerCertificates);
    assert.deepEqual(bootstrapPayload.counts, {
      actionableDrafts: 0,
      customers: 1,
      reviewDrafts: 0,
      scheduledDrafts: 0,
      failedDrafts: 0,
      unmatchedMessages: 0
    });
    assert.deepEqual(bootstrapPayload.settings, {
      companyName: "AUTO-TAX",
      clientSettings: true
    });
    assert.deepEqual(bootstrapPayload.customers, [
      {
        id: 1,
        customerName: "테스트 고객 (client)"
      }
    ]);
    assert.deepEqual(bootstrapPayload.auth, authContext);

    const inboxResponse = await fetch(`${baseUrl}/api/inbox`);
    assert.equal(inboxResponse.status, 200);
    assert.deepEqual(await inboxResponse.json(), inbox);
    assert.equal(calls.listInbox, 1);

    const draftsResponse = await fetch(`${baseUrl}/api/drafts`);
    assert.equal(draftsResponse.status, 200);
    assert.deepEqual(await draftsResponse.json(), drafts);
    assert.equal(calls.listDrafts, 1);

    const logsResponse = await fetch(`${baseUrl}/api/logs`);
    assert.equal(logsResponse.status, 200);
    assert.deepEqual(await logsResponse.json(), logs);
    assert.equal(calls.listLogs, 1);
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
