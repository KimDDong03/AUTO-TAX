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

type RunMailSettingsTestOptions = {
  settingsFormOverride?: SettingsFormState;
  successAlert?: {
    title: string;
    message: string;
  };
  syncFormOnSuccess?: boolean;
};

export function useSettingsMailTestAction({
  settingsForm,
  savedSettings,
  applySavedSettings,
  showAlert
}: UseSettingsMailTestActionArgs) {
  return useCallback(async (options?: RunMailSettingsTestOptions) => {
    const targetSettingsForm = options?.settingsFormOverride ?? settingsForm;
    if (!targetSettingsForm) return false;

    const { normalized, payload } = buildMailSettingsSavePayload(
      targetSettingsForm,
      savedSettings
    );

    if (!payload.imapHost.trim()) {
      await showAlert(
        "자동 설정을 지원하지 않는 메일입니다. IMAP 서버 주소를 입력한 뒤 다시 테스트해 주세요.",
        { title: "IMAP 직접 설정 필요", tone: "warn" }
      );
      return false;
    }

    const result = await api<{
      imapOk: boolean;
      imapMessage: string;
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
        smtpFromEmail: payload.smtpFromEmail
      })
    });

    const testSucceeded = result.imapOk;
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
        syncForm: options?.syncFormOnSuccess ?? false,
        baselineForm: normalized
      });
    }

    const successAlert = options?.successAlert;
    await showAlert(
      testSucceeded && successAlert
        ? successAlert.message
        : `${MAIL_PROVIDER_CONFIG[normalized.mailProvider].label} 연결 테스트 결과\n메일 읽기: ${
            result.imapOk ? "성공" : "확인 필요"
          }\n\n${
            testSucceeded
              ? "설정을 저장했습니다."
              : "메일 주소와 앱 비밀번호를 다시 확인해 주세요. 설정은 저장하지 않았습니다."
          }`,
      {
        title: testSucceeded && successAlert ? successAlert.title : "메일 연결 테스트 결과",
        tone: testSucceeded ? "success" : "warn"
      }
    );

    return testSucceeded;
  }, [applySavedSettings, savedSettings, settingsForm, showAlert]);
}
