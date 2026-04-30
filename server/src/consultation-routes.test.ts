import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerCoreRoutes } from "./routes/core-routes.js";
import { registerOpsRoutes } from "./routes/ops-routes.js";

type ConsultationRow = {
  id: string;
  name: string;
  phone: string;
  status: "new" | "contacted" | "workspace_opened" | "closed";
  note: string;
  handled_by: string | null;
  created_at: string;
  updated_at: string;
};

function createConsultationAdminClient() {
  const rows: ConsultationRow[] = [];

  class Builder {
    private insertPayload: Partial<ConsultationRow> | null = null;
    private updatePayload: Partial<ConsultationRow> | null = null;
    private idFilter: string | null = null;

    insert(payload: Partial<ConsultationRow>) {
      this.insertPayload = payload;
      return this;
    }

    update(payload: Partial<ConsultationRow>) {
      this.updatePayload = payload;
      return this;
    }

    select() {
      return this;
    }

    order() {
      return this;
    }

    eq(field: string, value: string) {
      if (field === "id") {
        this.idFilter = value;
      }
      return this;
    }

    async single() {
      if (!this.insertPayload) {
        return { data: null, error: { message: "missing insert" } };
      }

      const timestamp = "2026-04-29T00:00:00.000Z";
      const row: ConsultationRow = {
        id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
        name: this.insertPayload.name ?? "",
        phone: this.insertPayload.phone ?? "",
        status: this.insertPayload.status ?? "new",
        note: "",
        handled_by: null,
        created_at: timestamp,
        updated_at: timestamp
      };
      rows.push(row);
      return { data: row, error: null };
    }

    async maybeSingle() {
      const row = rows.find((item) => item.id === this.idFilter) ?? null;
      if (!row) {
        return { data: null, error: null };
      }

      Object.assign(row, this.updatePayload ?? {}, {
        updated_at: "2026-04-29T01:00:00.000Z"
      });
      return { data: row, error: null };
    }

    async limit(count: number) {
      return { data: rows.slice(0, count), error: null };
    }
  }

  return {
    rows,
    client: {
      from(table: string) {
        assert.equal(table, "public_consultation_requests");
        return new Builder();
      }
    }
  };
}

function registerCoreForConsultationTest(app: express.Express, adminClient: unknown, limiter = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()) {
  registerCoreRoutes({
    app,
    store: null,
    getRequestStore: () => {
      throw new Error("request store should not be used");
    },
    requireAuthContext: () => ({ isPlatformAdmin: false }) as never,
    requireInternalJobAccess: () => "secret",
    publicLoginLimiter: (_req, _res, next) => next(),
    publicConsultationLimiter: limiter,
    createSupabaseAdminClient: () => adminClient as never,
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
    runPlatformMaintenance: async () => ({}),
    dispatchRecurringJobs: async () => ({}),
    runDueJobs: async () => ({})
  });
}

test("public consultation route validates, stores, and applies its limiter", async () => {
  const { client, rows } = createConsultationAdminClient();
  let requestCount = 0;
  const app = express();
  app.use(express.json());
  registerCoreForConsultationTest(app, client, (_req, res, next) => {
    requestCount += 1;
    if (requestCount > 1) {
      res.status(429).json({ error: "too many" });
      return;
    }
    next();
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const created = await fetch(`${baseUrl}/api/public/consultation-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "홍길동", phone: "010-1234-5678" })
    });
    assert.equal(created.status, 201);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.name, "홍길동");

    const limited = await fetch(`${baseUrl}/api/public/consultation-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "김길동", phone: "010-0000-0000" })
    });
    assert.equal(limited.status, 429);
    assert.equal(rows.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("ops consultation routes list and update requests behind platform-admin guard", async () => {
  const { client } = createConsultationAdminClient();
  const app = express();
  app.use(express.json());
  registerCoreForConsultationTest(app, client);
  registerOpsRoutes({
    app,
    requirePlatformAdmin: () => ({
      userId: "11111111-1111-4111-8111-111111111111",
      isPlatformAdmin: true
    }) as never,
    createSupabaseAdminClient: () => client as never,
    createOrganizationStore: async () => {
      throw new Error("unused");
    },
    listOpsWorkspaces: async () => [],
    getOpsWorkspaceSummaryById: async () => null,
    toClientSettings: (settings) => settings,
    testMailConnections: async () => ({ imapOk: true, smtpOk: true }),
    digitsOnly: (value) => value.replace(/\D/g, ""),
    normalizeLoginId: (value) => value.trim().toLowerCase(),
    createWorkspaceSeed: () => "seed",
    createDeterministicUuid: () => "00000000-0000-4000-8000-000000000001",
    findAuthUserByLoginId: async () => null,
    createWorkspaceLoginEmail: (loginId) => `${loginId}@example.test`,
    upsertAuthUserLoginIndex: async () => undefined,
    isUniqueViolation: () => false,
    listAllAuthUsers: async () => []
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const created = await fetch(`${baseUrl}/api/public/consultation-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "홍길동", phone: "010-1234-5678" })
    });
    const createdPayload = (await created.json()) as { request: { id: string } };

    const list = await fetch(`${baseUrl}/api/ops/consultation-requests`);
    assert.equal(list.status, 200);
    assert.equal(((await list.json()) as unknown[]).length, 1);

    const updated = await fetch(`${baseUrl}/api/ops/consultation-requests/${createdPayload.request.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "contacted", note: "통화 완료" })
    });
    assert.equal(updated.status, 200);
    assert.deepEqual((await updated.json() as { request: Record<string, unknown> }).request, {
      id: createdPayload.request.id,
      name: "홍길동",
      phone: "010-1234-5678",
      status: "contacted",
      note: "통화 완료",
      handledBy: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T01:00:00.000Z"
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
