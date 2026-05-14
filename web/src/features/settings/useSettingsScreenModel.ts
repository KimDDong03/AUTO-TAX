import { useCallback, useMemo } from "react";
import type React from "react";
import type { Customer } from "../../types";
import type { SettingsFeatureOrchestration } from "./createSettingsActionAdapters";
import type { SettingsTabModel } from "./SettingsTab";
import type { SettingsSectionSummary } from "./settingsSectionModels";
import type { SettingsFormState, SettingsScreenState, SettingsSectionId } from "./useSettingsScreenState";
import { getSettingsSectionLabel } from "./useSettingsDerivedModel";

export type SettingsScreenProps = {
  userLabel: string;
  workspaceLabel: string;
  popbillModeLabel: string;
  settingsState: SettingsScreenState;
  activeSettingsSection: SettingsSectionId;
  setActiveSettingsSection: React.Dispatch<React.SetStateAction<SettingsSectionId>>;
  customers: Customer[];
  onSaveCustomerIssueCompleteSmsTemplate: (customerId: number, issueCompleteSmsTemplate: string) => Promise<void>;
  onWithdrawOrganization: (input: { organizationName: string; confirmText: string }) => Promise<void>;
  customerRegistrationReady: boolean;
  customerCount: number;
  onboardingComplete: boolean;
  onboardingProgressText: string;
  onboardingPendingStepCount: number;
  onboardingContent: React.ReactNode;
  openOnboarding: () => void;
  openCertificates: () => void;
  busyKey: string | null;
  orchestration: SettingsFeatureOrchestration;
  formatDateTime: (value: string | null) => string;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalAssistantUpgradeState:
    | "unknown"
    | "up-to-date"
    | "upgrade-available"
    | "upgrade-required";
  customerRenewalAssistantUpgradeMessage: string | null;
  customerRenewalAssistantLatestVersion: string | null;
  customerRenewalAssistantMinSupportedVersion: string | null;
  customerRenewalAssistantCheckedAt: string | null;
  customerRenewalLoadedCertificateCount: number;
  renewalHelperDownloadUrl: string;
};

function updateSettingsFormField<K extends keyof SettingsFormState>(
  setSettingsForm: SettingsScreenState["setSettingsForm"],
  field: K,
  value: SettingsFormState[K]
) {
  setSettingsForm((prev) => (prev ? { ...prev, [field]: value } : prev));
}

export function useSettingsScreenModel(
  props: SettingsScreenProps
) {
  const settingsForm = props.settingsState.settingsForm!;
  const setSettingsField = useCallback(
    <K extends keyof SettingsFormState>(
      field: K,
      value: SettingsFormState[K]
    ) => {
      updateSettingsFormField(props.settingsState.setSettingsForm, field, value);
    },
    [props.settingsState.setSettingsForm]
  );

  const helperUpgradeNotice = useMemo(
    () =>
      props.customerRenewalAssistantUpgradeState === "upgrade-required"
        ? {
            title: "헬퍼 재설치 필요",
            message: props.customerRenewalAssistantUpgradeMessage
          }
        : props.customerRenewalAssistantUpgradeState === "upgrade-available"
          ? {
              title: "헬퍼 업데이트 권장",
              message: props.customerRenewalAssistantUpgradeMessage
            }
          : null,
    [
      props.customerRenewalAssistantUpgradeMessage,
      props.customerRenewalAssistantUpgradeState
    ]
  );

  const helperStatus = useMemo(
    () => ({
      busyKey: props.busyKey,
      online: props.customerRenewalAssistantOnline,
      helperVersion: props.customerRenewalAssistantHelperVersion,
      helperMessage: props.customerRenewalAssistantHelperMessage,
      upgradeNotice: helperUpgradeNotice,
      latestVersion: props.customerRenewalAssistantLatestVersion,
      minSupportedVersion: props.customerRenewalAssistantMinSupportedVersion,
      checkedAt: props.customerRenewalAssistantCheckedAt,
      loadedCertificateCount: props.customerRenewalLoadedCertificateCount,
      renewalHelperDownloadUrl: props.renewalHelperDownloadUrl,
      openCertificates: props.openCertificates,
      onRefreshCustomerRenewalAssistant:
        props.settingsState.runRefreshCustomerRenewalAssistant,
      formatDateTime: props.formatDateTime
    }),
    [
      helperUpgradeNotice,
      props.busyKey,
      props.customerRenewalAssistantCheckedAt,
      props.customerRenewalAssistantHelperMessage,
      props.customerRenewalAssistantHelperVersion,
      props.customerRenewalAssistantLatestVersion,
      props.customerRenewalAssistantMinSupportedVersion,
      props.customerRenewalAssistantOnline,
      props.customerRenewalLoadedCertificateCount,
      props.formatDateTime,
      props.openCertificates,
      props.renewalHelperDownloadUrl,
      props.settingsState.runRefreshCustomerRenewalAssistant
    ]
  );
  const settingsSections = useMemo<SettingsSectionSummary[]>(() => {
    const onboardingSection: SettingsSectionSummary = {
      id: "onboarding",
      step: 1,
      title: "도입 준비",
      done: props.onboardingComplete,
      summary: props.onboardingComplete ? "준비 완료" : props.onboardingProgressText
    };
    const normalizedSections = props.settingsState.settingsSections.map((section) =>
      section.id === "onboarding"
        ? onboardingSection
        : section
    );

    if (normalizedSections.some((section) => section.id === "onboarding")) {
      return normalizedSections;
    }

    return [onboardingSection, ...normalizedSections];
  }, [
    props.onboardingComplete,
    props.onboardingProgressText,
    props.settingsState.settingsSections
  ]);
  const setupPendingCount = settingsSections.filter((section) => !section.done).length;
  const nextSettingsSection =
    settingsSections.find((section) => !section.done)?.id ?? "account";

  return useMemo<SettingsTabModel>(
    () => ({
      context: {
        userLabel: props.userLabel,
        workspaceLabel: props.workspaceLabel,
        popbillModeLabel: props.popbillModeLabel
      },
      sidebar: {
        settingsSections,
        activeSettingsSection: props.activeSettingsSection,
        setupPendingCount,
        settingsAutosaveState: props.settingsState.settingsAutosaveState,
        settingsAutosaveLabel: props.settingsState.settingsAutosaveLabel,
        customerRegistrationReady: props.customerRegistrationReady,
        customerCount: props.customerCount,
        nextSettingsSection,
        nextSettingsSectionLabel: getSettingsSectionLabel(nextSettingsSection),
        setActiveSettingsSection: props.setActiveSettingsSection,
        openCertificates: props.openCertificates,
        openOnboarding: props.openOnboarding
      },
      sections: {
        onboarding: {
          complete: props.onboardingComplete,
          progressText: props.onboardingProgressText,
          pendingStepCount: props.onboardingPendingStepCount,
          content: props.onboardingContent
        },
        mail: {
          busyKey: props.busyKey,
          isMailTesting: props.busyKey === "mail-test",
          done: props.settingsState.settingsHealth.mailReady,
          detectedMailProviderLabel: props.settingsState.detectedMailProviderLabel,
          fields: {
            mailAddress: settingsForm.mailAddress,
            mailPassword: settingsForm.mailPassword,
            notificationEmailsText: settingsForm.notificationEmailsText,
            schedulerEnabled: settingsForm.schedulerEnabled,
            defaultIssueDay: settingsForm.defaultIssueDay,
            defaultIssueHour: settingsForm.defaultIssueHour,
            defaultIssueMinute: settingsForm.defaultIssueMinute
          },
          mailPasswordConfigured: props.settingsState.mailPasswordConfigured,
          mailPasswordReveal: props.orchestration.reveals.mailPassword,
          onMailAddressChange: props.settingsState.handleSettingsMailAddressChange,
          onMailPasswordChange: (value) =>
            setSettingsField("mailPassword", value),
          onNotificationEmailsTextChange: (value) =>
            setSettingsField("notificationEmailsText", value),
          onSchedulerEnabledChange: (value) =>
            setSettingsField("schedulerEnabled", value),
          onDefaultIssueDayChange: (value) =>
            setSettingsField("defaultIssueDay", value),
          onDefaultIssueHourChange: (value) =>
            setSettingsField("defaultIssueHour", value),
          onDefaultIssueMinuteChange: (value) =>
            setSettingsField("defaultIssueMinute", value),
          onRunMailSettingsTest: props.settingsState.runMailSettingsTest,
          onSaveAndTestMailSettings:
            props.settingsState.runSaveAndTestMailSettings
        },
        defaults: {
          busyKey: props.busyKey,
          done:
            props.settingsState.settingsHealth.popbillReady &&
            props.settingsState.settingsHealth.operatorReady,
          settingsHealth: {
            popbillReady: props.settingsState.settingsHealth.popbillReady,
            operatorReady: props.settingsState.settingsHealth.operatorReady
          },
          fields: {
            popbillUserIdPrefix: settingsForm.popbillUserIdPrefix,
            popbillSharedPassword: settingsForm.popbillSharedPassword,
            renewalIssuePassword: settingsForm.renewalIssuePassword
          },
          configured: {
            popbillSharedPassword:
              props.settingsState.popbillSharedPasswordConfigured,
            renewalIssuePassword:
              props.settingsState.renewalIssuePasswordConfigured
          },
          reveals: {
            popbillSharedPassword:
              props.orchestration.reveals.popbillSharedPassword,
            renewalIssuePassword:
              props.orchestration.reveals.renewalIssuePassword
          },
          onPopbillUserIdPrefixChange: (value) =>
            setSettingsField("popbillUserIdPrefix", value),
          onPopbillSharedPasswordChange: (value) =>
            setSettingsField("popbillSharedPassword", value),
          onRenewalIssuePasswordChange:
            props.settingsState.handleSettingsRenewalIssuePasswordChange,
          onLoadCurrentPopbillSharedPassword:
            props.settingsState.runLoadCurrentPopbillSharedPassword,
          onLoadCurrentRenewalIssuePassword:
            props.settingsState.runLoadCurrentRenewalIssuePassword,
          customerMessages: {
            organizationName: props.workspaceLabel,
            customers: props.customers,
            busyKey: props.busyKey,
            onSaveIssueCompleteSmsTemplate: props.onSaveCustomerIssueCompleteSmsTemplate
          }
        },
        helper: {
          done:
            props.customerRenewalAssistantOnline &&
            props.customerRenewalLoadedCertificateCount > 0,
          helperStatus
        },
        account: {
          onboarding: {
            complete: props.onboardingComplete,
            progressText: props.onboardingProgressText,
            pendingStepCount: props.onboardingPendingStepCount,
            openOnboarding: props.openOnboarding
          },
          account: props.settingsState.account,
          actions: {
            changePassword: props.orchestration.actions.changePassword,
            createOrganizationMember:
              props.orchestration.actions.createOrganizationMember,
            removeOrganizationMember:
              props.orchestration.actions.removeOrganizationMember,
            resetOrganizationMemberPassword:
              props.orchestration.actions.resetOrganizationMemberPassword,
            withdrawOrganization: props.orchestration.actions.withdrawOrganization
          },
          withdrawal: {
            organizationName: props.workspaceLabel,
            customerCount: props.customers.length,
            joinedPopbillCustomerCount: props.customers.filter(
              (customer) => customer.popbillState === "joined"
            ).length,
            memberCount: props.settingsState.account.organizationMembers.length,
            canWithdraw: props.settingsState.account.canManageOrganizationMembers,
            onWithdrawOrganization: props.onWithdrawOrganization
          },
          reveals: {
            accountPassword: props.orchestration.reveals.accountPassword,
            organizationMemberPassword:
              props.orchestration.reveals.organizationMemberPassword,
            memberResetPassword:
              props.orchestration.reveals.memberResetPassword
          },
          busyKey: props.busyKey,
          formatDateTime: props.formatDateTime
        }
      }
    }),
    [
      helperStatus,
      props.activeSettingsSection,
      props.busyKey,
      props.customers,
      props.customerCount,
      props.customerRegistrationReady,
      props.customerRenewalAssistantOnline,
      props.customerRenewalLoadedCertificateCount,
      props.formatDateTime,
      props.onboardingComplete,
      props.onboardingContent,
      props.onboardingPendingStepCount,
      props.onboardingProgressText,
      props.onSaveCustomerIssueCompleteSmsTemplate,
      props.onWithdrawOrganization,
      props.openCertificates,
      props.openOnboarding,
      props.popbillModeLabel,
      props.orchestration.actions.changePassword,
      props.orchestration.actions.createOrganizationMember,
      props.orchestration.actions.removeOrganizationMember,
      props.orchestration.actions.resetOrganizationMemberPassword,
      props.orchestration.actions.withdrawOrganization,
      props.orchestration.reveals.accountPassword,
      props.orchestration.reveals.mailPassword,
      props.orchestration.reveals.memberResetPassword,
      props.orchestration.reveals.organizationMemberPassword,
      props.orchestration.reveals.popbillSharedPassword,
      props.orchestration.reveals.renewalCertificatePassword,
      props.orchestration.reveals.renewalIssuePassword,
      props.setActiveSettingsSection,
      props.settingsState.account,
      props.settingsState.detectedMailProviderLabel,
      props.settingsState.handleSettingsMailAddressChange,
      props.settingsState.handleSettingsRenewalIssuePasswordChange,
      props.settingsState.mailPasswordConfigured,
      props.settingsState.popbillSharedPasswordConfigured,
      props.settingsState.renewalCertificatePasswordConfigured,
      props.settingsState.renewalIssuePasswordConfigured,
      props.settingsState.runLoadCurrentPopbillSharedPassword,
      props.settingsState.runLoadCurrentRenewalCertificatePassword,
      props.settingsState.runLoadCurrentRenewalIssuePassword,
      props.settingsState.runMailSettingsTest,
      props.settingsState.runSaveAndTestMailSettings,
      props.settingsState.settingsAutosaveLabel,
      props.settingsState.settingsAutosaveState,
      props.settingsState.settingsHealth.mailReady,
      props.settingsState.settingsHealth.operatorReady,
      props.settingsState.settingsHealth.popbillReady,
      props.userLabel,
      props.workspaceLabel,
      setSettingsField,
      settingsForm.defaultIssueDay,
      settingsForm.defaultIssueHour,
      settingsForm.defaultIssueMinute,
      settingsForm.mailAddress,
      settingsForm.mailPassword,
      settingsForm.notificationEmailsText,
      settingsForm.popbillSharedPassword,
      settingsForm.popbillUserIdPrefix,
      settingsForm.renewalCertificatePassword,
      settingsForm.renewalIssuePassword,
      settingsForm.schedulerEnabled,
      nextSettingsSection,
      settingsSections,
      setupPendingCount
    ]
  );
}
