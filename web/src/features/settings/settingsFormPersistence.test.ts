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
    operatorContactName: "",
    operatorContactEmail: "",
    operatorContactTel: "",
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
  assert.equal(inferMailProviderFromAddress("worker@gmail.com"), "gmail");
  assert.equal(inferMailProviderFromAddress("not-an-email", "daum"), "daum");
});

test("settingsToForm hides default popbill prefix placeholder until workspace values exist", () => {
  const blankPrefix = settingsToForm(createSettings());
  const configuredPrefix = settingsToForm(
    createSettings({
      popbillSharedPasswordConfigured: true,
      operatorContactName: "담당자"
    })
  );

  assert.equal(blankPrefix.popbillUserIdPrefix, "");
  assert.equal(configuredPrefix.popbillUserIdPrefix, "TEST_");
  assert.equal(blankPrefix.mailProvider, "gmail");
});

test("buildSettingsPayload normalizes provider fields and numeric secret input", () => {
  const { normalized, payload } = buildSettingsPayload({
    ...settingsToForm(createSettings()),
    mailProvider: "gmail",
    mailAddress: "staff@naver.com",
    imapHost: "custom",
    smtpHost: "custom",
    notificationEmailsText: "a@example.com\n\n b@example.com ",
    renewalIssuePassword: "12a3-45"
  });

  assert.equal(normalized.mailProvider, "naver");
  assert.equal(normalized.imapHost, "imap.naver.com");
  assert.equal(normalized.smtpHost, "smtp.naver.com");
  assert.equal(payload.smtpFromName, "AUTO-TAX");
  assert.equal(payload.mailSyncStartAt, null);
  assert.deepEqual(payload.notificationEmails, ["a@example.com", "b@example.com"]);
  assert.equal(payload.renewalIssuePassword, "12345");
});

test("buildMailSettingsSavePayload preserves saved defaults during connection test", () => {
  const savedSettings = createSettings({
    popbillUserIdPrefix: "HAE_",
    smtpFromName: "세금계산서봇",
    operatorContactName: "홍길동",
    operatorContactEmail: "owner@example.com",
    operatorContactTel: "01012345678",
    renewalContactDepartment: "세무",
    renewalContactFax: "0212345678",
    mailSyncStartAt: "2026-04-16T00:00:00.000Z"
  });
  const form = {
    ...settingsToForm(savedSettings),
    popbillUserIdPrefix: "OVERRIDE",
    popbillSharedPassword: "new-secret",
    operatorContactName: "다른 이름",
    operatorContactEmail: "other@example.com",
    operatorContactTel: "01000000000",
    renewalCertificatePassword: "cert-secret",
    renewalIssuePassword: "123456"
  };

  const { payload } = buildMailSettingsSavePayload(form, savedSettings);

  assert.equal(payload.popbillUserIdPrefix, "HAE_");
  assert.equal(payload.smtpFromName, "세금계산서봇");
  assert.equal(payload.mailSyncStartAt, "2026-04-16T00:00:00.000Z");
  assert.equal(payload.popbillSharedPassword, "");
  assert.equal(payload.operatorContactName, "홍길동");
  assert.equal(payload.operatorContactEmail, "owner@example.com");
  assert.equal(payload.renewalCertificatePassword, "");
  assert.equal(payload.renewalIssuePassword, "");
});

test("canAutosaveSettings validates scheduler bounds and renewal issue length", () => {
  const baseForm = settingsToForm(createSettings({ operatorContactName: "담당자" }));

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
