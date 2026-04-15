import { useMemo } from "react";
import type React from "react";
import { SettingsTab, type SettingsTabModel } from "./SettingsTab";
import { useSettingsScreenState, type SettingsSectionId } from "./useSettingsScreenState";
import type { OrganizationMemberSummary } from "../../types";

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
  canManageOrganizationMembers: boolean;
  organizationMembers: OrganizationMemberSummary[];
  currentUserId: string | null;
  passwordResetTarget: any;
  passwordChangeForm: any;
  passwordResetForm: any;
  organizationMemberForm: any;
  setPasswordChangeForm: React.Dispatch<React.SetStateAction<any>>;
  setPasswordResetForm: React.Dispatch<React.SetStateAction<any>>;
  setOrganizationMemberForm: React.Dispatch<React.SetStateAction<any>>;
  changePassword: () => Promise<void>;
  createOrganizationMember: () => Promise<void>;
  openMemberPasswordReset: (member: OrganizationMemberSummary) => void;
  removeOrganizationMember: (member: OrganizationMemberSummary) => Promise<void>;
  submitPasswordReset: () => Promise<void>;
  cancelPasswordReset: () => void;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  getWorkspaceMemberRoleLabel: (role: OrganizationMemberSummary["role"]) => string;
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
      canManageOrganizationMembers: props.canManageOrganizationMembers,
      organizationMembers: props.organizationMembers,
      currentUserId: props.currentUserId,
      passwordResetTarget: props.passwordResetTarget,
      passwordChangeForm: props.passwordChangeForm,
      passwordResetForm: props.passwordResetForm,
      organizationMemberForm: props.organizationMemberForm,
      setActiveSettingsSection: props.setActiveSettingsSection,
      setSettingsForm: props.settingsState.setSettingsForm,
      setPasswordChangeForm: props.setPasswordChangeForm,
      setPasswordResetForm: props.setPasswordResetForm,
      setOrganizationMemberForm: props.setOrganizationMemberForm,
      onMailAddressChange: props.settingsState.handleSettingsMailAddressChange,
      onRenewalIssuePasswordChange: props.settingsState.handleSettingsRenewalIssuePasswordChange,
      toggleRevealField: props.toggleRevealField,
      runMailSettingsTest: props.settingsState.runMailSettingsTest,
      runLoadCurrentPopbillSharedPassword: props.settingsState.runLoadCurrentPopbillSharedPassword,
      runLoadCurrentRenewalCertificatePassword: props.settingsState.runLoadCurrentRenewalCertificatePassword,
      runLoadCurrentRenewalIssuePassword: props.settingsState.runLoadCurrentRenewalIssuePassword,
      runRefreshCustomerRenewalAssistant: props.settingsState.runRefreshCustomerRenewalAssistant,
      openCertificates: props.openCertificates,
      changePassword: props.changePassword,
      createOrganizationMember: props.createOrganizationMember,
      openMemberPasswordReset: props.openMemberPasswordReset,
      removeOrganizationMember: props.removeOrganizationMember,
      submitPasswordReset: props.submitPasswordReset,
      cancelPasswordReset: props.cancelPasswordReset,
      runAction: props.runAction,
      getWorkspaceMemberRoleLabel: props.getWorkspaceMemberRoleLabel,
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
