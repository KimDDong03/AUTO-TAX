import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../api";
import { supabase } from "../../supabase";
import type { AppSettings, OrganizationMemberRole } from "../../types";
import type { LocalRenewalHelperUpgradeState } from "../../helper-version";
import {
  createEmptyPasswordChangeForm,
  type SettingsAccountState,
  type PasswordChangeFormState
} from "./settingsAccountTypes";
import { normalizeRenewalIssuePasswordInput } from "./settingsFormUtils";
import {
  MAIL_PROVIDER_CONFIG,
  buildMailSettingsSavePayload,
  inferMailProviderFromAddress,
  settingsToForm
} from "./settingsFormPersistence";
import { useSettingsFormPersistence } from "./useSettingsFormPersistence";
import { useSettingsOrganizationMembers } from "./useSettingsOrganizationMembers";
import { useSettingsStoredSecretLoaders } from "./useSettingsStoredSecretLoaders";

export type MailProvider = "gmail" | "naver" | "daum";
export type SettingsSectionId = "gmail" | "popbill" | "helper" | "account";
export type SettingsAutosaveState = "idle" | "pending" | "saving" | "saved" | "error";
export {
  createEmptyPasswordChangeForm,
  createEmptyOrganizationMemberForm,
  createEmptyPasswordResetForm,
  type MemberPasswordResetTarget,
  type OrganizationMemberFormState,
  type PasswordChangeFormState,
  type PasswordResetFormState,
  type SettingsOrganizationMemberItem,
  type SettingsAccountState
} from "./settingsAccountTypes";
export { normalizeRenewalIssuePasswordInput } from "./settingsFormUtils";
export {
  MAIL_PROVIDER_CONFIG,
  inferMailProviderFromAddress,
  settingsToForm
} from "./settingsFormPersistence";

export type SettingsFormState = {
  mailProvider: MailProvider;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  mailAddress: string;
  mailPassword: string;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  notificationEmailsText: string;
  defaultIssueDay: string;
  defaultIssueHour: string;
  defaultIssueMinute: string;
  mailPollMinutes: string;
  mailSyncStartAt: string;
  timezone: string;
  popbillUserIdPrefix: string;
  popbillSharedPassword: string;
  operatorContactName: string;
  operatorContactEmail: string;
  operatorContactTel: string;
  renewalContactDepartment: string;
  renewalContactFax: string;
  renewalCertificatePassword: string;
  renewalIssuePassword: string;
  schedulerEnabled: boolean;
};

export type SettingsHealth = {
  mailReady: boolean;
  popbillReady: boolean;
  operatorReady: boolean;
};

export type UseSettingsScreenStateArgs = {
  activeOrganizationId: string | null;
  bootstrapOrganizationId: string | null;
  activeOrganizationRole: OrganizationMemberRole | null;
  bootstrapSettings: AppSettings | null;
  busyKey: string | null;
  currentUserId: string | null;
  helperReady: boolean;
  helperCertificateCount: number;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantUpgradeState: LocalRenewalHelperUpgradeState;
  setGlobalError: (message: string) => void;
  revealField: (fieldKey: string) => void;
  onRenewalCertificatePasswordChange: (password: string) => void;
  onRenewalIssuePasswordChange: (password: string) => void;
  refreshCustomerRenewalAssistant: () => Promise<void>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  showConfirm: (
    message: string,
    options?: { title?: string; tone?: "default" | "warn" | "danger"; confirmLabel?: string }
  ) => Promise<boolean>;
  showAlert: (
    message: string,
    options?: { title?: string; tone?: "default" | "warn" | "danger" | "success" }
  ) => Promise<void>;
};

type InternalSettingsAccountState = SettingsAccountState & {
  resetAccountState: () => void;
};

function useSettingsAccountState({
  activeOrganizationId,
  bootstrapOrganizationId,
  activeOrganizationRole,
  currentUserId,
  setGlobalError,
  showAlert,
  showConfirm
}: Pick<
  UseSettingsScreenStateArgs,
  | "activeOrganizationId"
  | "bootstrapOrganizationId"
  | "activeOrganizationRole"
  | "currentUserId"
  | "setGlobalError"
  | "showAlert"
  | "showConfirm"
>): InternalSettingsAccountState {
  const organizationMembers = useSettingsOrganizationMembers({
    activeOrganizationId,
    bootstrapOrganizationId,
    activeOrganizationRole,
    bootstrapReady:
      activeOrganizationId !== null &&
      activeOrganizationId === bootstrapOrganizationId,
    currentUserId,
    setGlobalError,
    showAlert,
    showConfirm
  });
  const [passwordChangeForm, setPasswordChangeForm] = useState<PasswordChangeFormState>(
    createEmptyPasswordChangeForm
  );

  const resetAccountState = useCallback(() => {
    setPasswordChangeForm(createEmptyPasswordChangeForm());
    organizationMembers.resetOrganizationMemberState();
  }, [organizationMembers.resetOrganizationMemberState]);

  const changePassword = useCallback(async () => {
    const nextPassword = passwordChangeForm.nextPassword.trim();
    const confirmPassword = passwordChangeForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      throw new Error("새 비밀번호는 8자 이상으로 입력하세요.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("새 비밀번호와 확인 값이 일치하지 않습니다.");
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: nextPassword
    });

    if (updateError) {
      throw updateError;
    }

    setPasswordChangeForm(createEmptyPasswordChangeForm());
    await showAlert("비밀번호를 변경했습니다.", {
      title: "비밀번호 변경 완료",
      tone: "success"
    });
  }, [passwordChangeForm, showAlert]);

  return {
    canManageOrganizationMembers: organizationMembers.canManageOrganizationMembers,
    organizationMembers: organizationMembers.organizationMembers,
    organizationMemberItems: organizationMembers.organizationMemberItems,
    passwordChangeForm,
    passwordResetForm: organizationMembers.passwordResetForm,
    passwordResetTarget: organizationMembers.passwordResetTarget,
    organizationMemberForm: organizationMembers.organizationMemberForm,
    setPasswordChangeForm:
      setPasswordChangeForm as Dispatch<SetStateAction<PasswordChangeFormState>>,
    setPasswordResetForm: organizationMembers.setPasswordResetForm,
    setOrganizationMemberForm:
      organizationMembers.setOrganizationMemberForm,
    changePassword,
    createOrganizationMember: organizationMembers.createOrganizationMember,
    openMemberPasswordReset: organizationMembers.openMemberPasswordReset,
    removeOrganizationMember: organizationMembers.removeOrganizationMember,
    submitMemberPasswordReset: organizationMembers.submitMemberPasswordReset,
    cancelPasswordReset: organizationMembers.cancelPasswordReset,
    resetAccountState
  };
}

export function useSettingsScreenState({
  activeOrganizationId,
  bootstrapOrganizationId,
  activeOrganizationRole,
  bootstrapSettings,
  busyKey,
  currentUserId,
  helperReady,
  helperCertificateCount,
  customerRenewalAssistantOnline,
  customerRenewalAssistantUpgradeState,
  setGlobalError,
  revealField,
  onRenewalCertificatePasswordChange,
  onRenewalIssuePasswordChange,
  refreshCustomerRenewalAssistant,
  runAction,
  showConfirm,
  showAlert
}: UseSettingsScreenStateArgs) {
  const account = useSettingsAccountState({
    activeOrganizationId,
    bootstrapOrganizationId,
    activeOrganizationRole,
    currentUserId,
    setGlobalError,
    showAlert,
    showConfirm
  });
  const isBootstrapReadyForActiveOrganization =
    activeOrganizationId !== null &&
    activeOrganizationId === bootstrapOrganizationId &&
    bootstrapSettings !== null;
  const publicAccount: SettingsAccountState = account;
  const {
    savedSettings,
    settingsForm,
    setSettingsForm,
    settingsAutosaveState,
    settingsAutosaveLabel,
    detectedMailProviderLabel,
    applySavedSettings,
    applySettingsFormBaseline
  } = useSettingsFormPersistence({
    currentUserId,
    isBootstrapReadyForActiveOrganization,
    bootstrapSettings,
    busyKey,
    setGlobalError
  });

  const settingsHealth = useMemo<SettingsHealth>(
    () => ({
      mailReady: Boolean(
        savedSettings?.imapUser &&
          savedSettings.smtpUser &&
          savedSettings.mailPasswordConfigured &&
          savedSettings.mailConnectionVerifiedAt
      ),
      popbillReady: savedSettings?.popbillConfigured ?? false,
      operatorReady: savedSettings?.operatorConfigured ?? false
    }),
    [savedSettings]
  );

  useEffect(() => {
    if (currentUserId !== null) {
      return;
    }

    account.resetAccountState();
  }, [account.resetAccountState, currentUserId]);

  const settingsSections = useMemo<
    Array<{ id: SettingsSectionId; step: number; title: string; done: boolean; summary: string }>
  >(
    () => [
      {
        id: "gmail",
        step: 1,
        title: "메일 연결",
        done: settingsHealth.mailReady,
        summary: settingsHealth.mailReady ? savedSettings?.imapUser || "준비됨" : "연결 테스트 필요"
      },
      {
        id: "popbill",
        step: 2,
        title: "발행 설정",
        done: settingsHealth.popbillReady && settingsHealth.operatorReady,
        summary: settingsHealth.popbillReady && settingsHealth.operatorReady ? "준비됨" : "필수값 입력"
      },
      {
        id: "helper",
        step: 3,
        title: "헬퍼 상태",
        done: helperReady,
        summary: helperReady
          ? `준비됨 · ${helperCertificateCount}건 읽음`
          : customerRenewalAssistantUpgradeState === "upgrade-required"
            ? "재설치 필요"
            : customerRenewalAssistantOnline
              ? customerRenewalAssistantUpgradeState === "upgrade-available"
                ? "업데이트 권장"
                : "헬퍼 연결됨 · 읽기 확인"
              : "헬퍼 준비 필요"
      },
      {
        id: "account",
        step: 4,
        title: "계정 / 작업공간",
        done: true,
        summary: publicAccount.canManageOrganizationMembers ? "사용자 / 비밀번호" : "비밀번호 변경"
      }
    ],
    [
      customerRenewalAssistantOnline,
      customerRenewalAssistantUpgradeState,
      helperCertificateCount,
      helperReady,
      publicAccount.canManageOrganizationMembers,
      savedSettings?.imapUser,
      settingsHealth.mailReady,
      settingsHealth.operatorReady,
      settingsHealth.popbillReady
    ]
  );

  const setupPendingCount = settingsSections.filter((section) => !section.done).length;
  const recommendedSettingsSection: SettingsSectionId = !settingsHealth.mailReady
    ? "gmail"
    : !(settingsHealth.popbillReady && settingsHealth.operatorReady)
      ? "popbill"
      : !helperReady
        ? "helper"
        : "account";
  const nextSettingsSection = settingsSections.find((section) => !section.done)?.id ?? "account";
  const {
    loadCurrentPopbillSharedPassword,
    loadCurrentRenewalCertificatePassword,
    loadCurrentRenewalIssuePassword
  } = useSettingsStoredSecretLoaders({
    settingsForm,
    applySettingsFormBaseline,
    revealField,
    onRenewalCertificatePasswordChange,
    onRenewalIssuePasswordChange
  });

  const handleSettingsRenewalIssuePasswordChange = useCallback(
    (nextValue: string) => {
      const normalizedValue = normalizeRenewalIssuePasswordInput(nextValue);
      onRenewalIssuePasswordChange(normalizedValue.length === 6 ? normalizedValue : "");
      setSettingsForm((prev) => (prev ? { ...prev, renewalIssuePassword: normalizedValue } : prev));
    },
    [onRenewalIssuePasswordChange, setSettingsForm]
  );

  const handleSettingsMailAddressChange = useCallback(
    (nextAddress: string) => {
      setSettingsForm((prev) => {
        if (!prev) return prev;
        const nextProvider = inferMailProviderFromAddress(nextAddress, prev.mailProvider);
        const config = MAIL_PROVIDER_CONFIG[nextProvider];
        return {
          ...prev,
          mailAddress: nextAddress,
          mailProvider: nextProvider,
          imapHost: config.imapHost,
          imapPort: config.imapPort,
          imapSecure: config.imapSecure,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpSecure: config.smtpSecure
        };
      });
    },
    [setSettingsForm]
  );

  const testMailSettings = useCallback(async () => {
    if (!settingsForm) return;
    const { normalized, payload } = buildMailSettingsSavePayload(settingsForm, savedSettings);
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
      const verifiedSettings = await api<AppSettings>("/api/settings/mail-connection-verified", {
        method: "POST"
      });
      applySavedSettings(verifiedSettings, {
        syncForm: false,
        baselineForm: normalized
      });
    }

    await showAlert(
      `${MAIL_PROVIDER_CONFIG[normalized.mailProvider].label} 연결 테스트 결과\nIMAP: ${
        result.imapOk ? "성공" : "실패"
      }\n${result.imapMessage}\n\nSMTP: ${result.smtpOk ? "성공" : "실패"}\n${result.smtpMessage}\n\n테스트 메일 발송: ${
        result.testMailSent ? "예" : "아니오"
      }\n\n설정 저장: ${testSucceeded ? "성공" : "실패로 저장 안 함"}`,
      {
        title: "메일 연결 테스트 결과",
        tone: testSucceeded ? "success" : "warn"
      }
    );
  }, [applySavedSettings, savedSettings, settingsForm, showAlert]);

  const runSettingsAction = useCallback(
    async (key: string, action: () => Promise<void>) =>
      runAction(key, action, { reload: false }),
    [runAction]
  );
  const runMailSettingsTest = useCallback(
    async () => runSettingsAction("mail-test", testMailSettings),
    [runSettingsAction, testMailSettings]
  );
  const runLoadCurrentPopbillSharedPassword = useCallback(
    async () =>
      runSettingsAction(
        "load-popbill-shared-password",
        loadCurrentPopbillSharedPassword
      ),
    [loadCurrentPopbillSharedPassword, runSettingsAction]
  );
  const runLoadCurrentRenewalCertificatePassword = useCallback(
    async () =>
      runSettingsAction(
        "load-renewal-certificate-password",
        loadCurrentRenewalCertificatePassword
      ),
    [loadCurrentRenewalCertificatePassword, runSettingsAction]
  );
  const runLoadCurrentRenewalIssuePassword = useCallback(
    async () =>
      runSettingsAction(
        "load-renewal-issue-password",
        loadCurrentRenewalIssuePassword
      ),
    [loadCurrentRenewalIssuePassword, runSettingsAction]
  );
  const runRefreshCustomerRenewalAssistant = useCallback(
    async () =>
      runSettingsAction(
        "refresh-customer-renewal-helper",
        refreshCustomerRenewalAssistant
      ),
    [refreshCustomerRenewalAssistant, runSettingsAction]
  );

  return {
    savedSettings,
    settingsForm,
    setSettingsForm,
    settingsHealth,
    settingsSections,
    setupPendingCount,
    nextSettingsSection,
    recommendedSettingsSection,
    settingsAutosaveState,
    settingsAutosaveLabel,
    detectedMailProviderLabel,
    mailPasswordConfigured: savedSettings?.mailPasswordConfigured ?? false,
    popbillSharedPasswordConfigured: savedSettings?.popbillSharedPasswordConfigured ?? false,
    renewalCertificatePasswordConfigured: savedSettings?.renewalCertificatePasswordConfigured ?? false,
    renewalIssuePasswordConfigured: savedSettings?.renewalIssuePasswordConfigured ?? false,
    applySavedSettings,
    account: publicAccount,
    handleSettingsMailAddressChange,
    handleSettingsRenewalIssuePasswordChange,
    testMailSettings,
    loadCurrentPopbillSharedPassword,
    loadCurrentRenewalCertificatePassword,
    loadCurrentRenewalIssuePassword,
    runMailSettingsTest,
    runLoadCurrentPopbillSharedPassword,
    runLoadCurrentRenewalCertificatePassword,
    runLoadCurrentRenewalIssuePassword,
    runRefreshCustomerRenewalAssistant
  };
}

export type SettingsScreenState = ReturnType<typeof useSettingsScreenState>;
