import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { createApiAuthMiddleware } from "./api-access.js";

test("api auth middleware does not trust organization headers when logging missing access tokens", async () => {
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];

  const app = express();
  app.use(
    "/api",
    createApiAuthMiddleware({
      hasValidJobSecret: () => false,
      hasValidRenewalAgentSecret: () => false,
      resolveAuthenticatedAppSession: async () => {
        throw new Error("should not resolve session without a token");
      },
      createRequestStore: async () => {
        throw new Error("should not create a request store without a token");
      },
      createLoggingStoreForOrganizationId: async () =>
        ({
          createLog: async (level: string, scope: string, message: string, context?: unknown) => {
            logs.push({ level, scope, message, context });
          }
        }) as never
    })
  );
  app.get("/api/protected", (_req, res) => {
    res.json({ ok: true });
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const response = await fetch(`${baseUrl}/api/protected`, {
      headers: {
        "X-Organization-Id": "org-123"
      }
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "로그인이 필요합니다."
    });
    assert.deepEqual(logs, []);
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
