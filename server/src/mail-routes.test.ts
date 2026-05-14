import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerMailRoutes, toClientInboxMessage } from "./routes/mail-routes.js";
import type { Customer, InboxMessage } from "./domain.js";
import type { AppStore } from "./store-contract.js";

test("toClientInboxMessage removes raw mail payload before API response", () => {
  const message: InboxMessage = {
    id: 1,
    messageUid: "uid-secret",
    mailbox: "INBOX",
    fromAddress: "kepco@example.test",
    subject: "전력거래 대금",
    receivedAt: "2026-05-08T00:00:00.000Z",
    rawSource: "raw mime source",
    textBody: "mail text body",
    parseStatus: "parsed",
    parseError: "",
    parsedData: {
      originalFrom: "kepco@example.test",
      plantName: "한혜자 발전소",
      plantAddress: "경기도 안성시",
      billingMonth: "2026-03",
      supplyCost: 177000,
      taxTotal: 17700,
      totalAmount: 194700,
      itemName: "3월전력",
      kepcoCorpNum: "1234567890",
      kepcoBranchId: "",
      kepcoCorpName: "한국전력",
      kepcoCeoName: "",
      kepcoAddr: "",
      kepcoBizType: "",
      kepcoBizClass: "",
      rawText: "raw parsed text"
    },
    customerId: 10,
    draftId: 20,
    createdAt: "2026-05-08T00:01:00.000Z"
  };

  const clientMessage = toClientInboxMessage(message) as Record<string, unknown>;

  assert.equal("messageUid" in clientMessage, false);
  assert.equal("mailbox" in clientMessage, false);
  assert.equal("rawSource" in clientMessage, false);
  assert.equal("textBody" in clientMessage, false);
  assert.equal("rawText" in (clientMessage.parsedData as Record<string, unknown>), false);
  assert.equal(clientMessage.subject, "전력거래 대금");
  assert.equal((clientMessage.parsedData as Record<string, unknown>).totalAmount, 194700);
});

test("inbox reprocess route forwards a manually selected customer id", async () => {
  const calls: Array<{ messageId: number; customerId: number | null }> = [];
  const message = {
    id: 12,
    messageUid: "uid-12",
    mailbox: "INBOX",
    fromAddress: "kepco@example.test",
    subject: "고객 미매칭 메일",
    receivedAt: "2026-05-08T00:00:00.000Z",
    rawSource: "raw",
    textBody: "raw",
    parseStatus: "unmatched",
    parseError: "",
    parsedData: null,
    customerId: null,
    draftId: null,
    createdAt: "2026-05-08T00:01:00.000Z"
  } satisfies InboxMessage;
  const requestStore = {
    getInboxMessage: async (messageId: number) => (messageId === message.id ? message : null),
    getCustomer: async (customerId: number) => (customerId === 99 ? ({ id: customerId } as Customer) : null)
  } as AppStore;

  const app = express();
  app.use(express.json());
  registerMailRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({}) as never,
    reprocessInboxMessage: async (_store, messageId, options) => {
      calls.push({
        messageId,
        customerId: options?.customerId ?? null
      });
      return { status: "parsed" };
    },
    syncMailbox: async () => ({
      scanned: 0,
      imported: 0,
      createdDrafts: 0,
      scheduledDrafts: 0,
      unmatched: 0,
      failures: 0,
      receivedMonth: "2026-05"
    })
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${baseUrl}/api/inbox/${message.id}/reprocess`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ customerId: 99 })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, status: "parsed" });
    assert.deepEqual(calls, [{ messageId: message.id, customerId: 99 }]);
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
