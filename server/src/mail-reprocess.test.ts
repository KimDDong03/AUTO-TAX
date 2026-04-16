import assert from "node:assert/strict";
import test from "node:test";
import type { Customer, InboxMessage, InvoiceDraft, ParsedMail } from "./domain.js";
import { reprocessInboxMessage } from "./mail-reprocess.js";
import type { AppStore } from "./store-contract.js";

function buildParsedMail(overrides: Partial<ParsedMail> = {}): ParsedMail {
  return {
    originalFrom: "kepco@example.com",
    plantName: "테스트 발전소",
    plantAddress: "서울특별시 강남구 테헤란로 1",
    billingMonth: "2026-03",
    supplyCost: 100000,
    taxTotal: 10000,
    totalAmount: 110000,
    itemName: "2026-03 전력구입",
    kepcoCorpNum: "123-45-67890",
    kepcoBranchId: "0001",
    kepcoCorpName: "한국전력",
    kepcoCeoName: "대표자",
    kepcoAddr: "서울특별시 중구 세종대로 1",
    kepcoBizType: "전기",
    kepcoBizClass: "전력",
    recipientEmail: "tax@example.com",
    rawText: "raw",
    ...overrides
  };
}

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 7,
    customerName: "테스트 고객",
    businessNumber: "1234567890",
    corpName: "테스트 고객",
    ceoName: "대표자",
    addr: "서울특별시 강남구 테헤란로 1",
    bizType: "서비스",
    bizClass: "개발",
    popbillUserId: "POPBILL_7",
    popbillPassword: "",
    popbillState: "pending",
    popbillCertRegistered: false,
    popbillCertExpireDate: null,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    ...overrides
  };
}

function buildInboxMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 10,
    messageUid: "INBOX:10",
    mailbox: "INBOX",
    fromAddress: "kepco@example.com",
    subject: "한전 메일",
    receivedAt: "2026-04-16T00:00:00.000Z",
    rawSource: "raw",
    textBody: "raw",
    parseStatus: "unmatched",
    parseError: "",
    parsedData: null,
    customerId: null,
    draftId: null,
    createdAt: "2026-04-16T00:00:00.000Z",
    ...overrides
  };
}

test("mail reprocess writes explicit customer-match logs for unmatched messages", async () => {
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];
  const updates: Array<Parameters<AppStore["updateInboxMatchResult"]>[0]> = [];
  const parsedMail = buildParsedMail();

  const store = {
    getInboxMessage: async () => buildInboxMessage(),
    listCompletedBillingMonths: async () => [],
    findCustomerByMatchAddress: async () => null,
    updateInboxMatchResult: async (input: Parameters<AppStore["updateInboxMatchResult"]>[0]) => {
      updates.push(input);
      return {} as never;
    },
    createLog: async (level: string, scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const result = await reprocessInboxMessage(store, 10, {
    parseKepcoMail: () => parsedMail
  });

  assert.equal(result.status, "unmatched");
  assert.deepEqual(updates, [
    {
      messageId: 10,
      parseStatus: "unmatched",
      parseError: "",
      parsedMail,
      customerId: null,
      draftId: null
    }
  ]);
  assert.deepEqual(logs, [
    {
      level: "warn",
      scope: "mail-reprocess",
      message: "미매칭 메일 재처리 중 고객 매칭에 실패했습니다.",
      context: {
        messageId: 10,
        billingMonth: "2026-03",
        plantName: "테스트 발전소",
        plantAddress: "서울특별시 강남구 테헤란로 1",
        pipeline: "mail-reprocess",
        draftSource: "mail-reprocess",
        errorCategory: "customer-match",
        status: "unmatched"
      }
    }
  ]);
});

test("mail reprocess writes explicit draft-create logs when draft creation fails", async () => {
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];
  const updates: Array<Parameters<AppStore["updateInboxMatchResult"]>[0]> = [];
  const customer = buildCustomer();
  const parsedMail = buildParsedMail();

  const store = {
    getInboxMessage: async () => buildInboxMessage(),
    listCompletedBillingMonths: async () => [],
    findCustomerByMatchAddress: async () => customer,
    findDraftByCustomerAndBillingMonth: async () => null,
    updateInboxMatchResult: async (input: Parameters<AppStore["updateInboxMatchResult"]>[0]) => {
      updates.push(input);
      return {} as never;
    },
    createDraft: async () => {
      throw new Error("draft insert failed");
    },
    createLog: async (level: string, scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const result = await reprocessInboxMessage(store, 10, {
    parseKepcoMail: () => parsedMail
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(updates, [
    {
      messageId: 10,
      parseStatus: "parsed",
      parseError: "",
      parsedMail,
      customerId: 7,
      draftId: null
    },
    {
      messageId: 10,
      parseStatus: "failed",
      parseError: "draft insert failed",
      parsedMail,
      customerId: 7,
      draftId: null
    }
  ]);
  assert.deepEqual(logs, [
    {
      level: "error",
      scope: "mail-reprocess",
      message: "미매칭 메일 재처리 중 초안 생성에 실패했습니다.",
      context: {
        messageId: 10,
        customerId: 7,
        issueMode: "review",
        billingMonth: "2026-03",
        error: "draft insert failed",
        pipeline: "mail-reprocess",
        draftSource: "mail-reprocess",
        errorCategory: "draft-create",
        reprocessStage: "create-draft",
        status: "failed"
      }
    }
  ]);
});

test("mail reprocess records draft-created events for successful draft recreation", async () => {
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];
  const customer = buildCustomer();
  const parsedMail = buildParsedMail();
  const draft = {
    id: 55,
    customerId: customer.id,
    customerName: customer.customerName,
    sourceMessageId: 10,
    issueMode: "review",
    status: "review",
    scheduledFor: null,
    issueRequestedAt: null,
    issuedAt: null,
    issueError: "",
    billingMonth: parsedMail.billingMonth,
    writeDate: null,
    itemName: parsedMail.itemName,
    plantName: parsedMail.plantName,
    supplyCost: parsedMail.supplyCost,
    taxTotal: parsedMail.taxTotal,
    totalAmount: parsedMail.totalAmount,
    kepcoCorpNum: parsedMail.kepcoCorpNum,
    kepcoBranchId: parsedMail.kepcoBranchId,
    kepcoCorpName: parsedMail.kepcoCorpName,
    kepcoCeoName: parsedMail.kepcoCeoName,
    kepcoAddr: parsedMail.kepcoAddr,
    kepcoBizType: parsedMail.kepcoBizType,
    kepcoBizClass: parsedMail.kepcoBizClass,
    recipientEmail: parsedMail.recipientEmail,
    popbillMgtKey: "MGT-55",
    popbillEnvironment: null,
    popbillResultJson: "{}",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z"
  } satisfies InvoiceDraft;

  const store = {
    getInboxMessage: async () => buildInboxMessage(),
    listCompletedBillingMonths: async () => [],
    findCustomerByMatchAddress: async () => customer,
    findDraftByCustomerAndBillingMonth: async () => null,
    updateInboxMatchResult: async () => ({}) as never,
    createDraft: async () => draft,
    createLog: async (level: string, scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const result = await reprocessInboxMessage(store, 10, {
    parseKepcoMail: () => parsedMail
  });

  assert.equal(result.status, "parsed");
  assert.deepEqual(logs, [
    {
      level: "info",
      scope: "mail-reprocess",
      message: "미매칭 메일 재처리에 성공했습니다.",
      context: {
        messageId: 10,
        customerId: 7,
        draftId: 55,
        issueMode: "review",
        pipeline: "mail-reprocess",
        draftSource: "mail-reprocess",
        eventType: "draft-created",
        status: "parsed"
      }
    }
  ]);
});
