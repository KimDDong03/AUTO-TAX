import { useCallback } from "react";
import { api } from "../../api";
import type { AppSettings } from "../../types";
import {
  MAIL_PROVIDER_CONFIG,
  buildMailSettingsSavePayload
} from "./settingsFormPersistence";
import type { SettingsFormState } from "./useSettingsScreenState";

type UseSettingsMailTestActionArgs = {
  settingsForm: SettingsFormState | null;
  savedSettings: AppSettings | null;
  applySavedSettings: (
    nextSettings: AppSettings,
    options?: {
      syncForm?: boolean;
      baselineForm?: SettingsFormState | null;
    }
  ) => void;
  showAlert: (
    message: string,
    options?: { title?: string; tone?: "default" | "warn" | "danger" | "success" }
  ) => Promise<void>;
};

export function useSettingsMailTestAction({
  settingsForm,
  savedSettings,
  applySavedSettings,
  showAlert
}: UseSettingsMailTestActionArgs) {
  return useCallback(async () => {
    if (!settingsForm) return;

    const { normalized, payload } = buildMailSettingsSavePayload(
      settingsForm,
      savedSettings
    );
    const result = await api<{
      imapOk: boolean;
      imapMessage: string;
      smtpOk: boolean;
      smtpMessage: string;
      testMailSent: boolean;
    }>("/api/system/mail-test", {
      method: "POST",
      body: JSON.stringify({
        imapHost: payload.imapHost,
        imapPort: payload.imapPort,
        imapSecure: payload.imapSecure,
        imapUser: payload.imapUser,
        imapPass: payload.imapPass,
        imapMailbox: payload.imapMailbox,
        smtpHost: payload.smtpHost,
        smtpPort: payload.smtpPort,
        smtpSecure: payload.smtpSecure,
        smtpUser: payload.smtpUser,
        smtpPass: payload.smtpPass,
        smtpFromName: "AUTO-TAX",
        smtpFromEmail: payload.smtpFromEmail,
        notificationEmails: payload.notificationEmails
      })
    });

    const testSucceeded = result.imapOk && result.smtpOk;
    if (testSucceeded) {
      await api<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const verifiedSettings = await api<AppSettings>(
        "/api/settings/mail-connection-verified",
        {
          method: "POST"
        }
      );
      applySavedSettings(verifiedSettings, {
        syncForm: false,
        baselineForm: normalized
      });
    }

    await showAlert(
      `${MAIL_PROVIDER_CONFIG[normalized.mailProvider].label} 연결 테스트 결과\nIMAP: ${
        result.imapOk ? "성공" : "실패"
      }\n${result.imapMessage}\n\nSMTP: ${result.smtpOk ? "성공" : "실패"}\n${
        result.smtpMessage
      }\n\n테스트 메일 발송: ${
        result.testMailSent ? "예" : "아니오"
      }\n\n설정 저장: ${testSucceeded ? "성공" : "실패로 저장 안 함"}`,
      {
        title: "메일 연결 테스트 결과",
        tone: testSucceeded ? "success" : "warn"
      }
    );
  }, [applySavedSettings, savedSettings, settingsForm, showAlert]);
}
