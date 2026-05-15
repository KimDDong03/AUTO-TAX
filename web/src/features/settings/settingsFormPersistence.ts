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
  },
  kakao: {
    label: "카카오메일",
    imapHost: "imap.kakao.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.kakao.com",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  },
  outlook: {
    label: "Outlook",
    imapHost: "outlook.office365.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp-mail.outlook.com",
    smtpPort: "587",
    smtpSecure: false,
    defaultMailbox: "INBOX"
  },
  icloud: {
    label: "iCloud Mail",
    imapHost: "imap.mail.me.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.mail.me.com",
    smtpPort: "587",
    smtpSecure: false,
    defaultMailbox: "INBOX"
  },
  yahoo: {
    label: "Yahoo Mail",
    imapHost: "imap.mail.yahoo.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  },
  custom: {
    label: "직접 설정",
    imapHost: "",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  }
};

const MAIL_PROVIDER_BY_DOMAIN: Record<string, MailProvider> = {
  "gmail.com": "gmail",
  "googlemail.com": "gmail",
  "naver.com": "naver",
  "daum.net": "daum",
  "hanmail.net": "daum",
  "kakao.com": "kakao",
  "outlook.com": "outlook",
  "hotmail.com": "outlook",
  "live.com": "outlook",
  "msn.com": "outlook",
  "icloud.com": "icloud",
  "me.com": "icloud",
  "mac.com": "icloud",
  "yahoo.com": "yahoo",
  "yahoo.co.kr": "yahoo",
  "ymail.com": "yahoo"
};

function inferMailProvider(
  settings: Pick<AppSettings, "imapHost" | "smtpHost">
): MailProvider {
  const imapHost = settings.imapHost.trim().toLowerCase();
  const smtpHost = settings.smtpHost.trim().toLowerCase();

  if (!imapHost && !smtpHost) return "gmail";
  if (imapHost.includes("naver") || smtpHost.includes("naver")) return "naver";
  if (imapHost.includes("daum") || smtpHost.includes("daum")) return "daum";
  if (imapHost.includes("kakao") || smtpHost.includes("kakao")) return "kakao";
  if (
    imapHost.includes("outlook") ||
    imapHost.includes("office365") ||
    smtpHost.includes("outlook")
  ) return "outlook";
  if (imapHost.includes("mail.me.com") || smtpHost.includes("mail.me.com")) return "icloud";
  if (imapHost.includes("yahoo") || smtpHost.includes("yahoo")) return "yahoo";
  return "custom";
}

export function inferMailProviderFromAddress(
  address: string,
  fallback: MailProvider = "gmail"
): MailProvider {
  const normalized = address.trim().toLowerCase();

  if (!normalized.includes("@")) {
    return fallback;
  }

  const domain = normalized.split("@")[1] ?? "";
  return MAIL_PROVIDER_BY_DOMAIN[domain] ?? "custom";
}

export function applyMailProviderDefaults(
  form: SettingsFormState,
  provider: MailProvider
): SettingsFormState {
  const config = MAIL_PROVIDER_CONFIG[provider];

  if (provider === "custom") {
    const previousConfig = MAIL_PROVIDER_CONFIG[form.mailProvider];
    const shouldKeepManualValues =
      form.mailProvider === "custom" ||
      (form.imapHost.trim() !== "" &&
        form.imapHost.trim() !== previousConfig.imapHost);

    return {
      ...form,
      mailProvider: provider,
      imapHost: shouldKeepManualValues ? form.imapHost : config.imapHost,
      imapPort: shouldKeepManualValues ? form.imapPort : config.imapPort,
      imapSecure: shouldKeepManualValues ? form.imapSecure : config.imapSecure,
      imapMailbox:
        shouldKeepManualValues && form.imapMailbox.trim()
          ? form.imapMailbox
          : config.defaultMailbox,
      smtpHost: shouldKeepManualValues ? form.smtpHost : config.smtpHost,
      smtpPort: shouldKeepManualValues ? form.smtpPort : config.smtpPort,
      smtpSecure: shouldKeepManualValues ? form.smtpSecure : config.smtpSecure
    };
  }

  return {
    ...form,
    mailProvider: provider,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapSecure: config.imapSecure,
    imapMailbox: config.defaultMailbox,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure
  };
}

function withSelectedMailProviderSettings(
  form: SettingsFormState
): SettingsFormState {
  const detectedProvider = inferMailProviderFromAddress(
    form.mailAddress,
    form.mailProvider
  );
  return applyMailProviderDefaults(form, detectedProvider);
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
    defaultIssueDay: String(settings.defaultIssueDay),
    defaultIssueHour: String(settings.defaultIssueHour),
    defaultIssueMinute: String(settings.defaultIssueMinute),
    mailPollMinutes: String(settings.mailPollMinutes),
    mailSyncStartAt: "",
    timezone: settings.timezone,
    popbillUserIdPrefix: "",
    popbillSharedPassword: "",
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
      notificationEmails: [],
      defaultIssueDay: Number(normalized.defaultIssueDay || 0),
      defaultIssueHour: Number(normalized.defaultIssueHour || 0),
      defaultIssueMinute: Number(normalized.defaultIssueMinute || 0),
      mailPollMinutes: Number(normalized.mailPollMinutes || 0),
      mailSyncStartAt: normalized.mailSyncStartAt.trim() || null,
      timezone: normalized.timezone.trim(),
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
    payload.imapHost.trim() !== "" &&
    payload.imapUser.trim() !== "" &&
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
