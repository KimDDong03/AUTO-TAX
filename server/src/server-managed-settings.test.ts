import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings } from "./domain.js";
import { applyServerManagedSettings, getRequiredServerManagedPopbillCustomerDefaults } from "./server-managed-settings.js";

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
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
    smtpFromName: "AUTO-TAX",
    smtpFromEmail: "",
    mailConnectionVerifiedAt: null,
    notificationEmails: [],
    defaultIssueDay: 26,
    defaultIssueHour: 9,
    defaultIssueMinute: 0,
    mailPollMinutes: 5,
    mailSyncStartAt: null,
    timezone: "Asia/Seoul",
    popbillLinkId: "db-link",
    popbillSecretKey: "db-secret",
    popbillIsTest: false,
    popbillPartnerCorpNum: "",
    popbillUserIdPrefix: "DB_",
    popbillSharedPassword: "db-password",
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: true,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides
  };
}

test("applyServerManagedSettings prefers server env prefix and shared password", () => {
  const previousPrefix = process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX;
  const previousPassword = process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD;

  process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX = " env ";
  process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD = "env-password";

  try {
    const settings = applyServerManagedSettings(createSettings());

    assert.equal(settings.popbillUserIdPrefix, "env");
    assert.equal(settings.popbillSharedPassword, "env-password");
  } finally {
    if (previousPrefix === undefined) {
      delete process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX;
    } else {
      process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX = previousPrefix;
    }

    if (previousPassword === undefined) {
      delete process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD;
    } else {
      process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD = previousPassword;
    }
  }
});

test("getRequiredServerManagedPopbillCustomerDefaults fails closed without env defaults", () => {
  const previousPrefix = process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX;
  const previousPassword = process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD;

  delete process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX;
  process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD = "env-password";

  try {
    assert.throws(
      () => getRequiredServerManagedPopbillCustomerDefaults(),
      /AUTO_TAX_POPBILL_USER_ID_PREFIX/
    );
  } finally {
    if (previousPrefix === undefined) {
      delete process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX;
    } else {
      process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX = previousPrefix;
    }

    if (previousPassword === undefined) {
      delete process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD;
    } else {
      process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD = previousPassword;
    }
  }
});
