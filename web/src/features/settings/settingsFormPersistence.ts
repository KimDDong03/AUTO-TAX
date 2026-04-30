import type { AppSettings } from "../../types";
import { normalizeRenewalIssuePasswordInput } from "./settingsFormUtils";
import type {
  MailProvider,
  SettingsAutosaveState,
  SettingsFormState
} from "./useSettingsScreenState";

export const MAIL_PROVIDER_CONFIG: Record<
  MailProvider,
  {
    label: string;
    imapHost: string;
    imapPort: string;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: string;
    smtpSecure: boolean;
    defaultMailbox: string;
  }
> = {
  gmail: {
    label: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  },
  naver: {
    label: "네이버 메일",
    imapHost: "imap.naver.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.naver.com",
    smtpPort: "587",
    smtpSecure: false,
    defaultMailbox: "INBOX"
  },
  daum: {
    label: "다음 메일",
    imapHost: "imap.daum.net",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.daum.net",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  }
};

function inferMailProvider(
  settings: Pick<AppSettings, "imapHost" | "smtpHost">
): MailProvider {
  const imapHost = settings.imapHost.trim().toLowerCase();
  const smtpHost = settings.smtpHost.trim().toLowerCase();

  if (imapHost.includes("naver") || smtpHost.includes("naver")) return "naver";
  if (imapHost.includes("daum") || smtpHost.includes("daum")) return "daum";
  return "gmail";
}

export function inferMailProviderFromAddress(
  address: string,
  fallback: MailProvider = "gmail"
): MailProvider {
  const normalized = address.trim().toLowerCase();

  if (!normalized.includes("@")) {
    return fallback;
  }

  if (normalized.endsWith("@naver.com")) return "naver";
  if (normalized.endsWith("@daum.net") || normalized.endsWith("@hanmail.net")) {
    return "daum";
  }
  if (normalized.endsWith("@gmail.com")) return "gmail";

  return fallback;
}

function withSelectedMailProviderSettings(
  form: SettingsFormState
): SettingsFormState {
  const detectedProvider = inferMailProviderFromAddress(
    form.mailAddress,
    form.mailProvider
  );
  const config = MAIL_PROVIDER_CONFIG[detectedProvider];
  return {
    ...form,
    mailProvider: detectedProvider,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapSecure: config.imapSecure,
    imapMailbox: config.defaultMailbox,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure
  };
}

export function settingsToForm(settings: AppSettings): SettingsFormState {
  const detectedProvider = inferMailProviderFromAddress(
    settings.imapUser || settings.smtpUser || settings.smtpFromEmail,
    inferMailProvider(settings)
  );
  return {
    mailProvider: detectedProvider,
    imapHost: settings.imapHost,
    imapPort: String(settings.imapPort),
    imapSecure: settings.imapSecure,
    mailAddress: settings.imapUser || settings.smtpUser || settings.smtpFromEmail,
    mailPassword: "",
    imapMailbox: settings.imapMailbox,
    smtpHost: settings.smtpHost,
    smtpPort: String(settings.smtpPort),
    smtpSecure: settings.smtpSecure,
    notificationEmailsText: settings.notificationEmails.join("\n"),
    defaultIssueDay: String(settings.defaultIssueDay),
    defaultIssueHour: String(settings.defaultIssueHour),
    defaultIssueMinute: String(settings.defaultIssueMinute),
    mailPollMinutes: String(settings.mailPollMinutes),
    mailSyncStartAt: "",
    timezone: settings.timezone,
    popbillUserIdPrefix: "",
    popbillSharedPassword: "",
    operatorContactName: settings.operatorContactName,
    operatorContactEmail: settings.operatorContactEmail,
    operatorContactTel: settings.operatorContactTel,
    renewalContactDepartment: settings.renewalContactDepartment,
    renewalContactFax: settings.renewalContactFax,
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: settings.schedulerEnabled
  };
}

export function buildSettingsPayload(form: SettingsFormState) {
  const normalized = withSelectedMailProviderSettings(form);
  const renewalIssuePassword = normalizeRenewalIssuePasswordInput(
    normalized.renewalIssuePassword
  );
  return {
    normalized,
    payload: {
      imapHost: normalized.imapHost.trim(),
      imapPort: Number(normalized.imapPort || 0),
      imapSecure: normalized.imapSecure,
      imapUser: normalized.mailAddress.trim(),
      imapPass: normalized.mailPassword.trim(),
      imapMailbox:
        normalized.imapMailbox.trim() ||
        MAIL_PROVIDER_CONFIG[normalized.mailProvider].defaultMailbox,
      smtpHost: normalized.smtpHost.trim(),
      smtpPort: Number(normalized.smtpPort || 0),
      smtpSecure: normalized.smtpSecure,
      smtpUser: normalized.mailAddress.trim(),
      smtpPass: normalized.mailPassword.trim(),
      smtpFromName: "AUTO-TAX",
      smtpFromEmail: normalized.mailAddress.trim(),
      notificationEmails: normalized.notificationEmailsText
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
      defaultIssueDay: Number(normalized.defaultIssueDay || 0),
      defaultIssueHour: Number(normalized.defaultIssueHour || 0),
      defaultIssueMinute: Number(normalized.defaultIssueMinute || 0),
      mailPollMinutes: Number(normalized.mailPollMinutes || 0),
      mailSyncStartAt: normalized.mailSyncStartAt.trim() || null,
      timezone: normalized.timezone.trim(),
      operatorContactName: normalized.operatorContactName.trim(),
      operatorContactEmail: normalized.operatorContactEmail.trim(),
      operatorContactTel: normalized.operatorContactTel.trim(),
      renewalContactDepartment: normalized.renewalContactDepartment.trim(),
      renewalContactFax: normalized.renewalContactFax.trim(),
      renewalCertificatePassword: normalized.renewalCertificatePassword,
      renewalIssuePassword,
      schedulerEnabled: normalized.schedulerEnabled
    }
  };
}

export function buildMailSettingsSavePayload(
  form: SettingsFormState,
  savedSettings: AppSettings | null
) {
  const { normalized, payload } = buildSettingsPayload(form);
  if (!savedSettings) {
    return { normalized, payload };
  }

  return {
    normalized,
    payload: {
      ...payload,
      smtpFromName: savedSettings.smtpFromName,
      mailSyncStartAt: savedSettings.mailSyncStartAt,
      operatorContactName: savedSettings.operatorContactName,
      operatorContactEmail: savedSettings.operatorContactEmail,
      operatorContactTel: savedSettings.operatorContactTel,
      renewalContactDepartment: savedSettings.renewalContactDepartment,
      renewalContactFax: savedSettings.renewalContactFax,
      renewalCertificatePassword: "",
      renewalIssuePassword: ""
    }
  };
}

export function getSettingsPayloadSignature(form: SettingsFormState) {
  return JSON.stringify(buildSettingsPayload(form).payload);
}

export function canAutosaveSettings(form: SettingsFormState) {
  const { payload } = buildSettingsPayload(form);
  const isFiniteInteger = (value: number) =>
    Number.isInteger(value) && Number.isFinite(value);

  return (
    isFiniteInteger(payload.imapPort) &&
    payload.imapPort >= 1 &&
    isFiniteInteger(payload.smtpPort) &&
    payload.smtpPort >= 1 &&
    isFiniteInteger(payload.defaultIssueDay) &&
    payload.defaultIssueDay >= 1 &&
    payload.defaultIssueDay <= 31 &&
    isFiniteInteger(payload.defaultIssueHour) &&
    payload.defaultIssueHour >= 0 &&
    payload.defaultIssueHour <= 23 &&
    isFiniteInteger(payload.defaultIssueMinute) &&
    payload.defaultIssueMinute >= 0 &&
    payload.defaultIssueMinute <= 59 &&
    isFiniteInteger(payload.mailPollMinutes) &&
    payload.mailPollMinutes >= 1 &&
    payload.mailPollMinutes <= 1440 &&
    (payload.renewalIssuePassword === "" ||
      /^\d{6}$/.test(payload.renewalIssuePassword))
  );
}

export function getSettingsAutosaveLabel(
  settingsAutosaveState: SettingsAutosaveState
) {
  return settingsAutosaveState === "saving"
    ? "자동 저장 중"
    : settingsAutosaveState === "error"
      ? "저장 실패"
      : settingsAutosaveState === "pending"
        ? "저장 대기"
        : "자동 저장";
}
