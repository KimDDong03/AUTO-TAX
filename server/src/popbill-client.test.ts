import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import { issueTaxInvoice } from "./popbill-client.js";

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
    operatorContactName: "발행담당자",
    operatorContactEmail: "issue@example.com",
    operatorContactTel: "02-1234-5678",
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: true,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z"
  };
}

function buildCustomer(): Customer {
  return {
    id: 11,
    customerName: "고객대표자",
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
    renewalContactMobile: "",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z"
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
    billingMonth: "2026-04",
    writeDate: null,
    itemName: "2026년4월전력",
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
    recipientEmail: "billing@example.com",
    popbillMgtKey: "MGT-21",
    popbillEnvironment: "test",
    popbillResultJson: "",
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z"
  };
}

test("issueTaxInvoice uses billing settings operator contact instead of customer name", async () => {
  const popbill = require("popbill") as {
    config: (...args: unknown[]) => unknown;
    TaxinvoiceService: () => unknown;
  };
  const originalConfig = popbill.config;
  const originalTaxinvoiceService = popbill.TaxinvoiceService;
  let capturedTaxinvoice: Record<string, unknown> | null = null;

  popbill.config = () => undefined;
  popbill.TaxinvoiceService = () => ({
    registIssue: (...args: unknown[]) => {
      capturedTaxinvoice = args[1] as Record<string, unknown>;
      const onSuccess = args[8] as (response: unknown) => void;
      onSuccess({ code: 1 });
    }
  });

  try {
    const settings = buildSettings();
    const customer = buildCustomer();
    await issueTaxInvoice(settings, customer, buildDraft(), new Date("2026-04-25T00:00:00+09:00"));
    assert.ok(capturedTaxinvoice);
    const taxinvoice = capturedTaxinvoice as Record<string, unknown>;

    assert.equal(taxinvoice.invoicerContactName, settings.operatorContactName);
    assert.equal(taxinvoice.invoicerTEL, settings.operatorContactTel);
    assert.equal(taxinvoice.invoicerEmail, settings.operatorContactEmail);
    assert.notEqual(taxinvoice.invoicerContactName, customer.customerName);
  } finally {
    popbill.config = originalConfig;
    popbill.TaxinvoiceService = originalTaxinvoiceService;
  }
});
