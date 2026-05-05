import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerCoreRoutes } from "./routes/core-routes.js";

function registerPublicLoginTestRoutes(app: express.Express) {
  registerCoreRoutes({
    app,
    store: null,
    getRequestStore: () => {
      throw new Error("request store should not be used");
    },
    requireAuthContext: () => ({ isPlatformAdmin: false }) as never,
    requireInternalJobAccess: () => "secret",
    publicLoginLimiter: (_req, _res, next) => next(),
    publicConsultationLimiter: (_req, _res, next) => next(),
    createSupabaseAdminClient: () => {
      throw new Error("admin client should not be used for email login");
    },
    createSupabasePublicClient: () =>
      ({
        auth: {
          signInWithPassword: async () => new Promise(() => undefined)
        }
      }) as never,
    findAuthUserByLoginId: async () => null,
    isEmailLikeAccount: () => true,
    normalizeEmail: (value) => value.trim().toLowerCase(),
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

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof Error && "status" in error ? Number((error as { status: unknown }).status) : 500;
    const message = error instanceof Error ? error.message : "server error";
    res.status(status).json({ error: message });
  });
}

test("public login returns 503 when Supabase auth does not respond", async () => {
  const previousTimeout = process.env.AUTO_TAX_PUBLIC_LOGIN_TIMEOUT_MS;
  process.env.AUTO_TAX_PUBLIC_LOGIN_TIMEOUT_MS = "10";

  const app = express();
  app.use(express.json());
  registerPublicLoginTestRoutes(app);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/public/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: "user@example.test", password: "password" })
    });
    const payload = (await response.json()) as { error?: string };

    assert.equal(response.status, 503);
    assert.equal(payload.error, "인증 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.");
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

    if (previousTimeout === undefined) {
      delete process.env.AUTO_TAX_PUBLIC_LOGIN_TIMEOUT_MS;
    } else {
      process.env.AUTO_TAX_PUBLIC_LOGIN_TIMEOUT_MS = previousTimeout;
    }
  }
});
