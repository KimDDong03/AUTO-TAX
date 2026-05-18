import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import {
  buildIssueCompleteMessageContent,
  getTaxCertURL,
  issueTaxInvoice,
  joinMember,
  quitMember,
  sendIssueCompleteMessage
} from "./popbill-client.js";

const require = createRequire(import.meta.url);

function buildSettings(): AppSettings {
  return {
    id: 1,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    imapUser: "kepco-mail@example.com",
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
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z"
  };
}

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
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
    updatedAt: "2026-04-24T00:00:00.000Z",
    ...overrides
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
    popbillMgtKey: "MGT-21",
    popbillEnvironment: "test",
    popbillResultJson: "",
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z"
  };
}

async function withPopbillContactEmailEnv<T>(
  values: { dedicated?: string | null; contactName?: string | null; contactTel?: string | null; opsEmails?: string | null },
  run: () => Promise<T> | T
): Promise<T> {
  const previousDedicated = process.env.AUTO_TAX_POPBILL_CONTACT_EMAIL;
  const previousOpsEmails = process.env.AUTO_TAX_OPS_EMAILS;
  const previousContactName = process.env.AUTO_TAX_POPBILL_CONTACT_NAME;
  const previousContactTel = process.env.AUTO_TAX_POPBILL_CONTACT_TEL;
  if (values.contactName === null) {
    delete process.env.AUTO_TAX_POPBILL_CONTACT_NAME;
  } else {
    process.env.AUTO_TAX_POPBILL_CONTACT_NAME = values.contactName ?? "발행담당자";
  }
  if (values.contactTel === null) {
    delete process.env.AUTO_TAX_POPBILL_CONTACT_TEL;
  } else {
    process.env.AUTO_TAX_POPBILL_CONTACT_TEL = values.contactTel ?? "02-1234-5678";
  }
  if (values.dedicated === null || values.dedicated === undefined) {
    delete process.env.AUTO_TAX_POPBILL_CONTACT_EMAIL;
  } else {
    process.env.AUTO_TAX_POPBILL_CONTACT_EMAIL = values.dedicated;
  }
  if (values.opsEmails === null || values.opsEmails === undefined) {
    delete process.env.AUTO_TAX_OPS_EMAILS;
  } else {
    process.env.AUTO_TAX_OPS_EMAILS = values.opsEmails;
  }

  try {
    return await run();
  } finally {
    if (previousDedicated === undefined) {
      delete process.env.AUTO_TAX_POPBILL_CONTACT_EMAIL;
    } else {
      process.env.AUTO_TAX_POPBILL_CONTACT_EMAIL = previousDedicated;
    }
    if (previousOpsEmails === undefined) {
      delete process.env.AUTO_TAX_OPS_EMAILS;
    } else {
      process.env.AUTO_TAX_OPS_EMAILS = previousOpsEmails;
    }
    if (previousContactName === undefined) {
      delete process.env.AUTO_TAX_POPBILL_CONTACT_NAME;
    } else {
      process.env.AUTO_TAX_POPBILL_CONTACT_NAME = previousContactName;
    }
    if (previousContactTel === undefined) {
      delete process.env.AUTO_TAX_POPBILL_CONTACT_TEL;
    } else {
      process.env.AUTO_TAX_POPBILL_CONTACT_TEL = previousContactTel;
    }
  }
}

test("joinMember sends Popbill member notices to the server-owned contact email", async () => {
  const popbill = require("popbill") as {
    config: (...args: unknown[]) => unknown;
    TaxinvoiceService: () => unknown;
  };
  const originalConfig = popbill.config;
  const originalTaxinvoiceService = popbill.TaxinvoiceService;
  let capturedJoinForm: Record<string, unknown> | null = null;

  popbill.config = () => undefined;
  popbill.TaxinvoiceService = () => ({
    joinMember: (...args: unknown[]) => {
      capturedJoinForm = args[0] as Record<string, unknown>;
      const onSuccess = args[1] as (response: unknown) => void;
      onSuccess({ code: 1 });
    }
  });

  try {
    await withPopbillContactEmailEnv(
      { dedicated: "popbill-notice@auto-tax.test", opsEmails: "ops@example.com" },
      async () => {
        await joinMember(buildSettings(), buildCustomer({ popbillState: "pending" }));
      }
    );
    const joinForm = capturedJoinForm as Record<string, unknown> | null;
    assert.ok(joinForm);
    assert.equal(joinForm.ContactEmail, "popbill-notice@auto-tax.test");
  } finally {
    popbill.config = originalConfig;
    popbill.TaxinvoiceService = originalTaxinvoiceService;
  }
});

test("issue complete message can use a customer-specific template", () => {
  const content = buildIssueCompleteMessageContent(
    { organizationName: "AUTO SOLAR" },
    buildCustomer({
      customerName: "Green Farm",
      issueCompleteSmsTemplate: "[{고객명}] {발전소명} {금액}원 / {회사명}"
    }),
    {
      ...buildDraft(),
      plantName: "Plant A",
      totalAmount: 123456
    }
  );

  assert.equal(content, "[Green Farm] Plant A 123,456원 / AUTO SOLAR");
});

test("joinMember requires explicit Popbill contact environment values", async () => {
  await withPopbillContactEmailEnv(
    { dedicated: null, contactName: "발행담당자", contactTel: "02-1234-5678", opsEmails: "ops-primary@auto-tax.test" },
    async () => {
      await assert.rejects(
        joinMember(buildSettings(), buildCustomer({ popbillState: "pending" })),
        /서버 Popbill 연락처 환경값/
      );
    }
  );
});

test("joinMember sends Popbill member notices only to the explicit Popbill contact email", async () => {
  const popbill = require("popbill") as {
    config: (...args: unknown[]) => unknown;
    TaxinvoiceService: () => unknown;
  };
  const originalConfig = popbill.config;
  const originalTaxinvoiceService = popbill.TaxinvoiceService;
  let capturedJoinForm: Record<string, unknown> | null = null;

  popbill.config = () => undefined;
  popbill.TaxinvoiceService = () => ({
    joinMember: (...args: unknown[]) => {
      capturedJoinForm = args[0] as Record<string, unknown>;
      const onSuccess = args[1] as (response: unknown) => void;
      onSuccess({ code: 1 });
    }
  });

  try {
    await withPopbillContactEmailEnv(
      { dedicated: "popbill-explicit@auto-tax.test", opsEmails: "ops-primary@auto-tax.test, ops-secondary@auto-tax.test" },
      async () => {
        await joinMember(buildSettings(), buildCustomer({ popbillState: "pending" }));
      }
    );
    const joinForm = capturedJoinForm as Record<string, unknown> | null;
    assert.ok(joinForm);
    assert.equal(joinForm.ContactEmail, "popbill-explicit@auto-tax.test");
  } finally {
    popbill.config = originalConfig;
    popbill.TaxinvoiceService = originalTaxinvoiceService;
  }
});

test("quitMember updates the Popbill contact email before member withdrawal", async () => {
  const popbill = require("popbill") as {
    config: (...args: unknown[]) => unknown;
    TaxinvoiceService: () => unknown;
  };
  const originalConfig = popbill.config;
  const originalTaxinvoiceService = popbill.TaxinvoiceService;
  const calls: Array<{ method: string; args: unknown[] }> = [];

  popbill.config = () => undefined;
  popbill.TaxinvoiceService = () => ({
    updateContact: (...args: unknown[]) => {
      calls.push({ method: "updateContact", args });
      const onSuccess = args[3] as (response: unknown) => void;
      onSuccess({ code: 1 });
    },
    quitMember: (...args: unknown[]) => {
      calls.push({ method: "quitMember", args });
      const onSuccess = args[3] as (response: unknown) => void;
      onSuccess({ code: 1 });
    }
  });

  try {
    await withPopbillContactEmailEnv(
      { dedicated: "popbill-notice@auto-tax.test", opsEmails: "ops-primary@auto-tax.test, ops-secondary@auto-tax.test" },
      async () => {
        await quitMember(buildSettings(), buildCustomer(), "AUTO-TAX 고객 삭제");
      }
    );
    assert.equal(calls[0]?.method, "updateContact");
    assert.equal(calls[1]?.method, "quitMember");
    assert.equal(calls[0]?.args[0], "1208200052");
    assert.equal(calls[0]?.args[1], "TEST_011");
    assert.deepEqual(calls[0]?.args[2], {
      personName: "발행담당자",
      tel: "02-1234-5678",
      hp: "",
      email: "popbill-notice@auto-tax.test",
      fax: "",
      searchAllAllowYN: true,
      mgrYN: true
    });
  } finally {
    popbill.config = originalConfig;
    popbill.TaxinvoiceService = originalTaxinvoiceService;
  }
});

test("quitMember falls back to corp-number-only withdrawal when contact update cannot use the auto user id", async () => {
  const popbill = require("popbill") as {
    config: (...args: unknown[]) => unknown;
    TaxinvoiceService: () => unknown;
  };
  const originalConfig = popbill.config;
  const originalTaxinvoiceService = popbill.TaxinvoiceService;
  const calls: Array<{ method: string; args: unknown[] }> = [];

  popbill.config = () => undefined;
  popbill.TaxinvoiceService = () => ({
    updateContact: (...args: unknown[]) => {
      calls.push({ method: "updateContact", args });
      const onError = args[4] as (error: { code: string; message: string }) => void;
      onError({ code: "-10000038", message: "회원의 아이디가 아닙니다." });
    },
    quitMember: (...args: unknown[]) => {
      calls.push({ method: "quitMember", args });
      const onSuccess = args[2] as (response: unknown) => void;
      onSuccess({ code: 1 });
    }
  });

  try {
    await withPopbillContactEmailEnv(
      { dedicated: "popbill-notice@auto-tax.test", opsEmails: "ops-primary@auto-tax.test, ops-secondary@auto-tax.test" },
      async () => {
        await quitMember(buildSettings(), buildCustomer(), "AUTO-TAX 고객 삭제");
      }
    );
    assert.equal(calls[0]?.method, "updateContact");
    assert.equal(calls[1]?.method, "quitMember");
    assert.equal(calls[1]?.args[0], "1208200052");
    assert.equal(calls[1]?.args[1], "AUTO-TAX 고객 삭제");
  } finally {
    popbill.config = originalConfig;
    popbill.TaxinvoiceService = originalTaxinvoiceService;
  }
});

test("issueTaxInvoice leaves optional supplier contact fields blank and uses fixed KEPCO recipient emails", async () => {
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

    assert.equal(taxinvoice.invoicerContactName, "");
    assert.equal(taxinvoice.invoicerTEL, "");
    assert.equal(taxinvoice.invoicerEmail, "");
    assert.equal(taxinvoice.invoiceeEmail1, "kepcoppa@kepco.co.kr");
    assert.deepEqual(taxinvoice.addContactList, [
      {
        serialNum: 1,
        contactName: "한국전력공사",
        email: "ppa0194@kepco.co.kr"
      }
    ]);
    assert.equal("remark1" in taxinvoice, false);
    assert.notEqual(taxinvoice.invoicerContactName, customer.customerName);
  } finally {
    popbill.config = originalConfig;
    popbill.TaxinvoiceService = originalTaxinvoiceService;
  }
});

test("issue complete message is sent as the workspace company without AUTO-TAX branding", async () => {
  const content = buildIssueCompleteMessageContent(
    { organizationName: "해성태양광" },
    buildCustomer(),
    buildDraft()
  );
  assert.match(content, /202,400/);
  assert.match(content, /세금계산서/);
  assert.match(content, /발행이 완료되었습니다/);
  assert.equal(content.includes("AUTO-TAX"), false);

  const popbill = require("popbill") as {
    config: (...args: unknown[]) => unknown;
    MessageService: () => unknown;
  };
  const originalConfig = popbill.config;
  const originalMessageService = popbill.MessageService;
  let capturedArgs: unknown[] | null = null;

  popbill.config = () => undefined;
  popbill.MessageService = () => ({
    sendXMS: (...args: unknown[]) => {
      capturedArgs = args;
      const onSuccess = args[11] as (response: unknown) => void;
      onSuccess({ receiptNum: "R-1" });
    }
  });

  try {
    const settings = buildSettings();
    const customer = {
      ...buildCustomer(),
      renewalContactMobile: "010-1234-5678"
    };
    await withPopbillContactEmailEnv(
      { dedicated: null, opsEmails: null },
      async () => {
        await sendIssueCompleteMessage(settings, customer, buildDraft(), {
          organizationName: "해성태양광",
          receiverMobile: customer.renewalContactMobile
        });
      }
    );

    assert.ok(capturedArgs);
    assert.equal(capturedArgs[0], "1208200052");
    assert.equal(capturedArgs[1], "0212345678");
    assert.equal(capturedArgs[2], "01012345678");
    assert.equal(capturedArgs[5], content);
    assert.equal(capturedArgs[10], customer.popbillUserId);
  } finally {
    popbill.config = originalConfig;
    popbill.MessageService = originalMessageService;
  }
});
