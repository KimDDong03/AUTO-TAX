import assert from "node:assert/strict";
import test from "node:test";
import { issueDraftNow, resolveDraftWriteDate } from "./automation.js";
import type { AppSettings, Customer, InboxMessage, InvoiceDraft } from "./domain.js";
import type { AppStore } from "./store-contract.js";

const baseSettings = {
  popbillIsTest: false,
  timezone: "Asia/Seoul"
} as AppSettings;

const baseCustomer = {
  id: 11,
  customerName: "테스트 고객",
  businessNumber: "123-45-67890",
  corpName: "테스트 상호",
  ceoName: "홍길동",
  addr: "서울시 테스트구 테스트로 1",
  bizType: "서비스",
  bizClass: "소매",
  popbillUserId: "TEST_011",
  popbillPassword: "password",
  popbillState: "joined",
  popbillCertRegistered: true,
  popbillCertExpireDate: null,
  issueMode: "review",
  issueDay: null,
  issueHour: null,
  issueMinute: null,
  memo: "",
  mobileNumber: "",
  plantNames: [],
  matchAddresses: [],
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z"
} as Customer;

const baseDraft = {
  id: 7,
  customerId: 11,
  customerName: "테스트 고객",
  sourceMessageId: 19,
  issueMode: "review",
  status: "review",
  scheduledFor: null,
  issueRequestedAt: null,
  issuedAt: null,
  issueError: "",
  billingMonth: "2026-03",
  writeDate: null,
  itemName: "2026년3월전력",
  plantName: "테스트 발전소",
  supplyCost: 1000,
  taxTotal: 100,
  totalAmount: 1100,
  kepcoCorpNum: "1234567890",
  kepcoBranchId: "0001",
  kepcoCorpName: "한전",
  kepcoCeoName: "사장",
  kepcoAddr: "전남 나주시",
  kepcoBizType: "전기",
  kepcoBizClass: "공급",
  recipientEmail: "test@example.com",
  popbillMgtKey: "C11-202603-19",
  popbillEnvironment: null,
  popbillResultJson: "",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z"
} as InvoiceDraft;

test("resolveDraftWriteDate uses source mail receivedAt", async () => {
  const store = {
    getInboxMessage: async (messageId: number) =>
      ({
        id: messageId,
        receivedAt: "2026-02-28T06:30:00.000Z"
      }) as InboxMessage
  } as Pick<AppStore, "getInboxMessage"> as AppStore;

  const writeDate = await resolveDraftWriteDate(store, baseDraft);
  assert.equal(writeDate.toISOString(), "2026-02-28T06:30:00.000Z");
});

test("issueDraftNow stores writeDate from source mail date in workspace timezone", async () => {
  const calls: {
    updateDraftStatus: Array<{
      draftId: number;
      status: string;
      issueError: string;
      writeDate: string | null | undefined;
      popbillEnvironment: "test" | "production" | null | undefined;
    }>;
    issueTaxInvoice: Array<{
      writeDate: string;
    }>;
  } = {
    updateDraftStatus: [],
    issueTaxInvoice: []
  };

  const store = {
    updateDraftStatus: async (
      draftId: number,
      status: InvoiceDraft["status"],
      issueError?: string,
      writeDate?: string | null,
      _popbillResult?: unknown,
      popbillEnvironment?: "test" | "production" | null
    ) => {
      calls.updateDraftStatus.push({ draftId, status, issueError: issueError ?? "", writeDate, popbillEnvironment });
      return {
        ...baseDraft,
        status,
        writeDate: writeDate ?? null,
        popbillEnvironment: popbillEnvironment ?? null
      };
    }
  } as Pick<AppStore, "updateDraftStatus"> as AppStore;

  await issueDraftNow(store, baseSettings, baseCustomer, baseDraft, {
    resolveDraftWriteDateFn: async () => new Date("2026-02-28T06:30:00.000Z"),
    issueTaxInvoiceFn: async (_settings, _customer, _draft, writeDate) => {
      calls.issueTaxInvoice.push({ writeDate: writeDate.toISOString() });
      return { ok: true };
    }
  });

  assert.deepEqual(calls.issueTaxInvoice, [{ writeDate: "2026-02-28T06:30:00.000Z" }]);
  assert.deepEqual(calls.updateDraftStatus, [
    {
      draftId: 7,
      status: "issued",
      issueError: "",
      writeDate: "20260228",
      popbillEnvironment: "production"
    }
  ]);
});
