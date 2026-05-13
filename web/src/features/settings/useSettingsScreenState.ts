import { useCallback, useEffect, useMemo } from "react";
import type { AppSettings, OrganizationMemberRole } from "../../types";
import type { LocalRenewalHelperUpgradeState } from "../../helper-version";
import type { SettingsAccountState } from "./settingsAccountTypes";
import { normalizeRenewalIssuePasswordInput } from "./settingsFormUtils";
import {
  MAIL_PROVIDER_CONFIG,
  inferMailProviderFromAddress,
  settingsToForm
} from "./settingsFormPersistence";
import { buildSettingsSectionSummary } from "./settingsSectionSummary";
import { useSettingsFormPersistence } from "./useSettingsFormPersistence";
import { useSettingsAccountFacade } from "./useSettingsAccountFacade";
import { useSettingsMailTestAction } from "./useSettingsMailTestAction";
import { useSettingsStoredSecretLoaders } from "./useSettingsStoredSecretLoaders";
import type { SettingsMailEditableFields } from "./settingsSectionModels";

export type MailProvider = "gmail" | "naver" | "daum";
export type SettingsSectionId = "onboarding" | "gmail" | "popbill" | "helper" | "account";
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
  const account = useSettingsAccountFacade({
    activeOrganizationId,
    bootstrapOrganizationId,
    activeOrganizationRole,
    currentUserId,
    setGlobalError,
    showAlert,
    showConfirm
  });
  const isBootstrapReadyForActiveOrganization =
    activeOrganizationId === bootstrapOrganizationId && bootstrapSettings !== null;
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

  const {
    settingsSections,
    setupPendingCount,
    nextSettingsSection,
    recommendedSettingsSection
  } = useMemo(
    () =>
      buildSettingsSectionSummary({
        settingsHealth,
        helperReady,
        helperCertificateCount,
        customerRenewalAssistantOnline,
        customerRenewalAssistantUpgradeState,
        settingsMailAddress: savedSettings?.imapUser,
        canManageOrganizationMembers: publicAccount.canManageOrganizationMembers
      }),
    [
      customerRenewalAssistantOnline,
      customerRenewalAssistantUpgradeState,
      helperCertificateCount,
      helperReady,
      publicAccount.canManageOrganizationMembers,
      savedSettings?.imapUser,
      settingsHealth
    ]
  );
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

  const testMailSettings = useSettingsMailTestAction({
    settingsForm,
    savedSettings,
    applySavedSettings,
    showAlert
  });

  const runSettingsAction = useCallback(
    async (key: string, action: () => Promise<void>) =>
      runAction(key, action, { reload: false }),
    [runAction]
  );
  const runMailSettingsTest = useCallback(
    async () =>
      runSettingsAction("mail-test", async () => {
        await testMailSettings();
      }),
    [runSettingsAction, testMailSettings]
  );
  const runSaveAndTestMailSettings = useCallback(
    async (fields: SettingsMailEditableFields) => {
      if (!settingsForm) return false;

      const nextProvider = inferMailProviderFromAddress(
        fields.mailAddress,
        settingsForm.mailProvider
      );
      const config = MAIL_PROVIDER_CONFIG[nextProvider];
      const nextSettingsForm: SettingsFormState = {
        ...settingsForm,
        ...fields,
        mailProvider: nextProvider,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        imapSecure: config.imapSecure,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpSecure: config.smtpSecure
      };
      let testSucceeded = false;

      await runSettingsAction("mail-test", async () => {
        testSucceeded = await testMailSettings({
          settingsFormOverride: nextSettingsForm,
          successAlert: {
            title: "메일 연결 완료",
            message: "이메일 연결 설정이 성공적으로 완료되었습니다."
          },
          syncFormOnSuccess: true
        });
      });

      return testSucceeded;
    },
    [runSettingsAction, settingsForm, testMailSettings]
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
    runSaveAndTestMailSettings,
    runLoadCurrentPopbillSharedPassword,
    runLoadCurrentRenewalCertificatePassword,
    runLoadCurrentRenewalIssuePassword,
    runRefreshCustomerRenewalAssistant
  };
}

export type SettingsScreenState = ReturnType<typeof useSettingsScreenState>;
