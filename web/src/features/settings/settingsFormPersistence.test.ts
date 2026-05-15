import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings } from "../../types";
import {
  buildMailSettingsSavePayload,
  buildSettingsPayload,
  canAutosaveSettings,
  getSettingsAutosaveLabel,
  inferMailProviderFromAddress,
  settingsToForm
} from "./settingsFormPersistence";

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: 1,
    timezone: "Asia/Seoul",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    imapUser: "owner@gmail.com",
    imapPass: "",
    imapMailbox: "INBOX",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "owner@gmail.com",
    smtpPass: "",
    smtpFromEmail: "owner@gmail.com",
    smtpFromName: "AUTO-TAX",
    notificationEmails: ["ops@example.com"],
    defaultIssueDay: 26,
    defaultIssueHour: 9,
    defaultIssueMinute: 0,
    mailPollMinutes: 30,
    mailSyncStartAt: null,
    popbillIsTest: true,
    popbillUserIdPrefix: "TEST_",
    popbillSharedPassword: "",
    popbillSharedPasswordConfigured: false,
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    renewalCertificatePasswordConfigured: false,
    renewalIssuePasswordConfigured: false,
    schedulerEnabled: true,
    mailPasswordConfigured: false,
    mailConnectionVerifiedAt: null,
    popbillConfigured: false,
    operatorConfigured: false,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    ...overrides
  };
}

test("inferMailProviderFromAddress keeps domain-specific overrides", () => {
  assert.equal(inferMailProviderFromAddress("worker@naver.com"), "naver");
  assert.equal(inferMailProviderFromAddress("worker@hanmail.net"), "daum");
  assert.equal(inferMailProviderFromAddress("worker@kakao.com"), "kakao");
  assert.equal(inferMailProviderFromAddress("worker@gmail.com"), "gmail");
  assert.equal(inferMailProviderFromAddress("worker@outlook.com"), "outlook");
  assert.equal(inferMailProviderFromAddress("worker@icloud.com"), "icloud");
  assert.equal(inferMailProviderFromAddress("worker@yahoo.com"), "yahoo");
  assert.equal(inferMailProviderFromAddress("worker@company.co.kr"), "custom");
  assert.equal(inferMailProviderFromAddress("not-an-email", "daum"), "daum");
});

test("settingsToForm keeps server-managed issuing values out of the form", () => {
  const form = settingsToForm(
    createSettings({
      popbillUserIdPrefix: "TEST_",
      popbillSharedPasswordConfigured: true
    })
  );

  assert.equal(form.popbillUserIdPrefix, "");
  assert.equal(form.popbillSharedPassword, "");
  assert.equal(form.mailProvider, "gmail");
  assert.equal("notificationEmailsText" in form, false);
});

test("buildSettingsPayload omits server-managed issuing prefix, password, and alert email recipients", () => {
  const { normalized, payload } = buildSettingsPayload({
    ...settingsToForm(createSettings()),
    mailProvider: "gmail",
    mailAddress: "staff@naver.com",
    imapHost: "custom",
    smtpHost: "custom",
    popbillUserIdPrefix: "OVERRIDE",
    popbillSharedPassword: "new-secret",
    renewalIssuePassword: "12a3-45"
  });

  assert.equal(normalized.mailProvider, "naver");
  assert.equal(normalized.imapHost, "imap.naver.com");
  assert.equal(normalized.smtpHost, "smtp.naver.com");
  assert.equal(payload.smtpPort, 587);
  assert.equal(payload.smtpFromName, "AUTO-TAX");
  assert.equal(payload.mailSyncStartAt, null);
  assert.deepEqual(payload.notificationEmails, []);
  assert.equal(payload.renewalIssuePassword, "12345");
  assert.equal("popbillUserIdPrefix" in payload, false);
  assert.equal("popbillSharedPassword" in payload, false);
});

test("buildSettingsPayload keeps notification email recipients empty", () => {
  const { payload } = buildSettingsPayload({
    ...settingsToForm(createSettings()),
    mailAddress: "billing@example.com"
  });

  assert.deepEqual(payload.notificationEmails, []);
});

test("buildSettingsPayload preserves custom IMAP settings for unsupported domains", () => {
  const { normalized, payload } = buildSettingsPayload({
    ...settingsToForm(createSettings()),
    mailAddress: "billing@company.co.kr",
    imapHost: "imap.company.co.kr",
    imapPort: "993",
    imapSecure: true,
    imapMailbox: "INBOX"
  });

  assert.equal(normalized.mailProvider, "custom");
  assert.equal(payload.imapHost, "imap.company.co.kr");
  assert.equal(payload.imapPort, 993);
  assert.equal(payload.imapSecure, true);
  assert.equal(payload.imapMailbox, "INBOX");
});

test("buildSettingsPayload uses official Outlook IMAP host", () => {
  const { normalized, payload } = buildSettingsPayload({
    ...settingsToForm(createSettings()),
    mailAddress: "billing@outlook.com"
  });

  assert.equal(normalized.mailProvider, "outlook");
  assert.equal(payload.imapHost, "outlook.office365.com");
  assert.equal(payload.imapPort, 993);
  assert.equal(payload.smtpHost, "smtp-mail.outlook.com");
  assert.equal(payload.smtpPort, 587);
});

test("buildMailSettingsSavePayload preserves saved defaults during connection test", () => {
  const savedSettings = createSettings({
    popbillUserIdPrefix: "HAE_",
    smtpFromName: "세금계산서봇",
    renewalContactDepartment: "세무",
    renewalContactFax: "0212345678",
    mailSyncStartAt: "2026-04-16T00:00:00.000Z"
  });
  const form = {
    ...settingsToForm(savedSettings),
    popbillUserIdPrefix: "OVERRIDE",
    popbillSharedPassword: "new-secret",
    renewalCertificatePassword: "cert-secret",
    renewalIssuePassword: "123456"
  };

  const { payload } = buildMailSettingsSavePayload(form, savedSettings);

  assert.equal(payload.smtpFromName, "세금계산서봇");
  assert.equal(payload.mailSyncStartAt, "2026-04-16T00:00:00.000Z");
  assert.equal("popbillUserIdPrefix" in payload, false);
  assert.equal("popbillSharedPassword" in payload, false);
  assert.equal(payload.renewalCertificatePassword, "");
  assert.equal(payload.renewalIssuePassword, "");
});

test("canAutosaveSettings validates scheduler bounds and renewal issue length", () => {
  const baseForm = settingsToForm(createSettings());

  assert.equal(canAutosaveSettings(baseForm), true);
  assert.equal(
    canAutosaveSettings({
      ...baseForm,
      defaultIssueDay: "32"
    }),
    false
  );
  assert.equal(
    canAutosaveSettings({
      ...baseForm,
      renewalIssuePassword: "12345"
    }),
    false
  );
});

test("getSettingsAutosaveLabel keeps existing status text mapping", () => {
  assert.equal(getSettingsAutosaveLabel("saving"), "자동 저장 중");
  assert.equal(getSettingsAutosaveLabel("error"), "저장 실패");
  assert.equal(getSettingsAutosaveLabel("pending"), "저장 대기");
  assert.equal(getSettingsAutosaveLabel("saved"), "자동 저장");
});
