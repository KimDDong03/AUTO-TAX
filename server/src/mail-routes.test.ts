import assert from "node:assert/strict";
import test from "node:test";
import { toClientInboxMessage } from "./routes/mail-routes.js";
import type { InboxMessage } from "./domain.js";

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
      recipientEmail: "",
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
