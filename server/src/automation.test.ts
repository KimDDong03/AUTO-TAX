import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { issueDraftNow } from "./automation.js";
import type { AppSettings, Customer, InvoiceDraft, LogEntry } from "./domain.js";
import type { AppStore, OrganizationIssueQuota } from "./store-contract.js";

const require = createRequire(import.meta.url);

function buildSettings(): AppSettings {
  return {
    id: 1,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    imapUser: "",
    imapPass: "",
    imapMailbox: "INBOX",
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "",
    smtpPass: "",
    smtpFromName: "",
    smtpFromEmail: "",
    mailConnectionVerifiedAt: null,
    notificationEmails: [],
    defaultIssueDay: 1,
    defaultIssueHour: 9,
    defaultIssueMinute: 0,
    mailPollMinutes: 5,
    mailSyncStartAt: null,
    timezone: "Asia/Seoul",
    popbillLinkId: "LINK",
    popbillSecretKey: "SECRET",
    popbillIsTest: true,
    popbillPartnerCorpNum: "",
    popbillUserIdPrefix: "TEST_",
    popbillSharedPassword: "",
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: true,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z"
  };
}

function buildCustomer(): Customer {
  return {
    id: 11,
    customerName: "하예리",
    businessNumber: "120-82-00052",
    corpName: "하예리 발전소",
    ceoName: "고객대표자",
    addr: "충청남도 아산시",
    bizType: "전기업",
    bizClass: "태양광",
    popbillUserId: "TEST_011",
    popbillPassword: "secret",
    popbillState: "joined",
    popbillCertRegistered: true,
    popbillCertExpireDate: null,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "010-1234-5678",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z"
  };
}

function buildDraft(): InvoiceDraft {
  return {
    id: 21,
    customerId: 11,
    customerName: "하예리",
    sourceMessageId: 12,
    issueMode: "review",
    status: "review",
    scheduledFor: null,
    issueRequestedAt: null,
    issuedAt: null,
    issueError: "",
    billingMonth: "2026-05",
    writeDate: null,
    itemName: "2026년5월전력",
    plantName: "하예리 발전소",
    supplyCost: 184000,
    taxTotal: 18400,
    totalAmount: 202400,
    kepcoCorpNum: "120-82-00052",
    kepcoBranchId: "",
    kepcoCorpName: "한국전력공사",
    kepcoCeoName: "대표",
    kepcoAddr: "전라남도 나주시",
    kepcoBizType: "전기업",
    kepcoBizClass: "전력",
    popbillMgtKey: "MGT-21",
    popbillEnvironment: null,
    popbillResultJson: "",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z"
  };
}

function buildQuota(overrides: Partial<OrganizationIssueQuota>): OrganizationIssueQuota {
  return {
    organizationName: "해성태양광",
    organizationPlanCode: "free_trial",
    organizationStatus: "trial",
    monthlyIssueLimit: 10,
    issuedDraftCount: 0,
    currentMonthIssuedDraftCount: 0,
    ...overrides
  };
}

test("free trial quota blocks after 10 cumulative issued drafts", async () => {
  let updateCalled = false;
  const store = {
    getOrganizationIssueQuota: async () => buildQuota({ issuedDraftCount: 10 }),
    updateDraftStatus: async () => {
      updateCalled = true;
      return buildDraft();
    }
  } as unknown as AppStore;

  await assert.rejects(
    () => issueDraftNow(store, buildSettings(), buildCustomer(), buildDraft()),
    /무료 체험 발행 한도\(10건\)/
  );
  assert.equal(updateCalled, false);
});

test("paid subscription quota blocks at the current monthly issue limit", async () => {
  const store = {
    getOrganizationIssueQuota: async () =>
      buildQuota({
        organizationPlanCode: "paid",
        organizationStatus: "active",
        monthlyIssueLimit: 100,
        currentMonthIssuedDraftCount: 100
      })
  } as unknown as AppStore;

  await assert.rejects(
    () => issueDraftNow(store, buildSettings(), buildCustomer(), buildDraft()),
    /이번 달 발행 한도\(100건\)/
  );
});

test("issue succeeds even when completion message delivery fails", async () => {
  const popbill = require("popbill") as {
    config: (...args: unknown[]) => unknown;
    TaxinvoiceService: () => unknown;
    MessageService: () => unknown;
  };
  const originalConfig = popbill.config;
  const originalTaxinvoiceService = popbill.TaxinvoiceService;
  const originalMessageService = popbill.MessageService;
  const logs: Array<{ level: LogEntry["level"]; message: string; context?: unknown }> = [];

  popbill.config = () => undefined;
  popbill.TaxinvoiceService = () => ({
    registIssue: (...args: unknown[]) => {
      const onSuccess = args[8] as (response: unknown) => void;
      onSuccess({ code: 1 });
    }
  });
  popbill.MessageService = () => ({
    sendXMS: (...args: unknown[]) => {
      const onError = args[12] as (error: { code: string; message: string }) => void;
      onError({ code: "-1", message: "문자 실패" });
    }
  });

  try {
    const store = {
      getOrganizationIssueQuota: async () => buildQuota({ issuedDraftCount: 9 }),
      updateDraftStatus: async (_draftId: number, status: string, _error: string, writeDate?: string | null) => ({
        ...buildDraft(),
        status,
        issuedAt: "2026-05-07T00:00:00.000Z",
        writeDate: writeDate ?? null
      }),
      upsertCustomerReportDetailFromIssuedDraft: async () => ({}),
      createLog: async (level: LogEntry["level"], _scope: string, message: string, context?: unknown) => {
        logs.push({ level, message, context });
      }
    } as unknown as AppStore;

    const issued = await issueDraftNow(store, buildSettings(), buildCustomer(), buildDraft());

    assert.equal(issued.status, "issued");
    assert.equal(logs.some((log) => log.level === "warn" && log.message === "발행은 완료됐지만 문자 전송에 실패했습니다."), true);
  } finally {
    popbill.config = originalConfig;
    popbill.TaxinvoiceService = originalTaxinvoiceService;
    popbill.MessageService = originalMessageService;
  }
});
