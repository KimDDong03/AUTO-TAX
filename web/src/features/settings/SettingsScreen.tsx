import { useMemo } from "react";
import type React from "react";
import { SettingsTab, type SettingsTabModel } from "./SettingsTab";
import { useSettingsScreenState, type SettingsSectionId } from "./useSettingsScreenState";

type SettingsScreenProps = {
  settingsState: ReturnType<typeof useSettingsScreenState>;
  activeSettingsSection: SettingsSectionId;
  setActiveSettingsSection: React.Dispatch<React.SetStateAction<SettingsSectionId>>;
  customerRegistrationReady: boolean;
  customerCount: number;
  onboardingComplete: boolean;
  onboardingProgressText: string;
  onboardingPendingStepCount: number;
  showCompletedOnboardingNav: boolean;
  onShowCompletedOnboardingNavChange: (nextValue: boolean) => void;
  openOnboarding: () => void;
  openCertificates: () => void;
  busyKey: string | null;
  revealedFields: Record<string, boolean>;
  toggleRevealField: (fieldKey: string) => void;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatDateTime: (value: string | null) => string;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalAssistantUpgradeState: "unknown" | "up-to-date" | "upgrade-available" | "upgrade-required";
  customerRenewalAssistantUpgradeMessage: string | null;
  customerRenewalAssistantLatestVersion: string | null;
  customerRenewalAssistantMinSupportedVersion: string | null;
  customerRenewalAssistantCheckedAt: string | null;
  customerRenewalLoadedCertificateCount: number;
  renewalHelperDownloadUrl: string;
};

export function SettingsScreen(props: SettingsScreenProps) {
  const model = useMemo<SettingsTabModel>(
    () => ({
      settingsSections: props.settingsState.settingsSections,
      activeSettingsSection: props.activeSettingsSection,
      setupPendingCount: props.settingsState.setupPendingCount,
      settingsAutosaveState: props.settingsState.settingsAutosaveState,
      settingsAutosaveLabel: props.settingsState.settingsAutosaveLabel,
      customerRegistrationReady: props.customerRegistrationReady,
      customerCount: props.customerCount,
      onboardingComplete: props.onboardingComplete,
      onboardingProgressText: props.onboardingProgressText,
      onboardingPendingStepCount: props.onboardingPendingStepCount,
      showCompletedOnboardingNav: props.showCompletedOnboardingNav,
      onShowCompletedOnboardingNavChange: props.onShowCompletedOnboardingNavChange,
      openOnboarding: props.openOnboarding,
      busyKey: props.busyKey,
      isMailTesting: props.busyKey === "mail-test",
      settingsHealth: props.settingsState.settingsHealth,
      settingsForm: props.settingsState.settingsForm,
      detectedMailProviderLabel: props.settingsState.detectedMailProviderLabel,
      revealedFields: props.revealedFields,
      mailPasswordConfigured: props.settingsState.mailPasswordConfigured,
      popbillSharedPasswordConfigured: props.settingsState.popbillSharedPasswordConfigured,
      renewalCertificatePasswordConfigured: props.settingsState.renewalCertificatePasswordConfigured,
      renewalIssuePasswordConfigured: props.settingsState.renewalIssuePasswordConfigured,
      customerRenewalAssistantOnline: props.customerRenewalAssistantOnline,
      customerRenewalAssistantHelperVersion: props.customerRenewalAssistantHelperVersion,
      customerRenewalAssistantHelperMessage: props.customerRenewalAssistantHelperMessage,
      customerRenewalAssistantUpgradeState: props.customerRenewalAssistantUpgradeState,
      customerRenewalAssistantUpgradeMessage: props.customerRenewalAssistantUpgradeMessage,
      customerRenewalAssistantLatestVersion: props.customerRenewalAssistantLatestVersion,
      customerRenewalAssistantMinSupportedVersion: props.customerRenewalAssistantMinSupportedVersion,
      customerRenewalAssistantCheckedAt: props.customerRenewalAssistantCheckedAt,
      customerRenewalLoadedCertificateCount: props.customerRenewalLoadedCertificateCount,
      renewalHelperDownloadUrl: props.renewalHelperDownloadUrl,
      account: props.settingsState.account,
      setActiveSettingsSection: props.setActiveSettingsSection,
      setSettingsForm: props.settingsState.setSettingsForm,
      onMailAddressChange: props.settingsState.handleSettingsMailAddressChange,
      onRenewalIssuePasswordChange: props.settingsState.handleSettingsRenewalIssuePasswordChange,
      toggleRevealField: props.toggleRevealField,
      runMailSettingsTest: props.settingsState.runMailSettingsTest,
      runLoadCurrentPopbillSharedPassword: props.settingsState.runLoadCurrentPopbillSharedPassword,
      runLoadCurrentRenewalCertificatePassword: props.settingsState.runLoadCurrentRenewalCertificatePassword,
      runLoadCurrentRenewalIssuePassword: props.settingsState.runLoadCurrentRenewalIssuePassword,
      runRefreshCustomerRenewalAssistant: props.settingsState.runRefreshCustomerRenewalAssistant,
      openCertificates: props.openCertificates,
      runAction: props.runAction,
      formatDateTime: props.formatDateTime
    }),
    [props]
  );

  return (
    <div className="settings-screen">
      <SettingsTab model={model} />
    </div>
  );
}
