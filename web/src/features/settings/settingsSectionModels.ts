import type React from "react";
import type {
  SettingsFeatureActionAdapters,
  SettingsFeatureRevealAdapters
} from "./createSettingsActionAdapters";
import type { SettingsAccountState } from "./settingsAccountTypes";
import type {
  SettingsAutosaveState,
  SettingsHealth,
  SettingsSectionId
} from "./useSettingsScreenState";

export type SettingsSectionSummary = {
  id: SettingsSectionId;
  step: number;
  title: string;
  done: boolean;
  summary: string;
};

export type SettingsSidebarModel = {
  settingsSections: SettingsSectionSummary[];
  activeSettingsSection: SettingsSectionId;
  setupPendingCount: number;
  settingsAutosaveState: SettingsAutosaveState;
  settingsAutosaveLabel: string;
  customerRegistrationReady: boolean;
  customerCount: number;
  nextSettingsSection: SettingsSectionId;
  nextSettingsSectionLabel: string;
  setActiveSettingsSection: React.Dispatch<
    React.SetStateAction<SettingsSectionId>
  >;
  openCertificates: () => void;
  openOnboarding: () => void;
};

export type SettingsMailSectionModel = {
  busyKey: string | null;
  isMailTesting: boolean;
  done: boolean;
  detectedMailProviderLabel: string;
  fields: {
    mailAddress: string;
    mailPassword: string;
    notificationEmailsText: string;
    schedulerEnabled: boolean;
    defaultIssueDay: string;
    defaultIssueHour: string;
    defaultIssueMinute: string;
  };
  mailPasswordConfigured: boolean;
  mailPasswordReveal: SettingsFeatureRevealAdapters["mailPassword"];
  onMailAddressChange: (value: string) => void;
  onMailPasswordChange: (value: string) => void;
  onNotificationEmailsTextChange: (value: string) => void;
  onSchedulerEnabledChange: (value: boolean) => void;
  onDefaultIssueDayChange: (value: string) => void;
  onDefaultIssueHourChange: (value: string) => void;
  onDefaultIssueMinuteChange: (value: string) => void;
  onRunMailSettingsTest: () => Promise<void>;
};

export type SettingsDefaultsSectionModel = {
  busyKey: string | null;
  done: boolean;
  settingsHealth: Pick<SettingsHealth, "popbillReady" | "operatorReady">;
  fields: {
    popbillUserIdPrefix: string;
    operatorContactName: string;
    operatorContactTel: string;
    operatorContactEmail: string;
    popbillSharedPassword: string;
    renewalIssuePassword: string;
  };
  configured: {
    popbillSharedPassword: boolean;
    renewalIssuePassword: boolean;
  };
  reveals: Pick<
    SettingsFeatureRevealAdapters,
    | "popbillSharedPassword"
    | "renewalIssuePassword"
  >;
  onPopbillUserIdPrefixChange: (value: string) => void;
  onOperatorContactNameChange: (value: string) => void;
  onOperatorContactTelChange: (value: string) => void;
  onOperatorContactEmailChange: (value: string) => void;
  onPopbillSharedPasswordChange: (value: string) => void;
  onRenewalIssuePasswordChange: (value: string) => void;
  onLoadCurrentPopbillSharedPassword: () => Promise<void>;
  onLoadCurrentRenewalIssuePassword: () => Promise<void>;
};

export type SettingsHelperUpgradeNotice = {
  title: string;
  message: string | null;
} | null;

export type SettingsHelperStatusModel = {
  busyKey: string | null;
  online: boolean;
  helperVersion: string | null;
  helperMessage: string;
  upgradeNotice: SettingsHelperUpgradeNotice;
  latestVersion: string | null;
  minSupportedVersion: string | null;
  checkedAt: string | null;
  loadedCertificateCount: number;
  renewalHelperDownloadUrl: string;
  openCertificates: () => void;
  onRefreshCustomerRenewalAssistant: () => Promise<void>;
  formatDateTime: (value: string | null) => string;
};

export type SettingsHelperSectionModel = {
  done: boolean;
  helperStatus: SettingsHelperStatusModel;
};

export type SettingsAccountSectionModel = {
  onboarding: {
    complete: boolean;
    progressText: string;
    pendingStepCount: number;
    openOnboarding: () => void;
  };
  account: SettingsAccountState;
  actions: Pick<
    SettingsFeatureActionAdapters,
    | "changePassword"
    | "createOrganizationMember"
    | "removeOrganizationMember"
    | "resetOrganizationMemberPassword"
  >;
  reveals: Pick<
    SettingsFeatureRevealAdapters,
    "accountPassword" | "organizationMemberPassword" | "memberResetPassword"
  >;
  busyKey: string | null;
  formatDateTime: (value: string | null) => string;
};

export type SettingsTabSectionsModel = {
  mail: SettingsMailSectionModel;
  defaults: SettingsDefaultsSectionModel;
  helper: SettingsHelperSectionModel;
  account: SettingsAccountSectionModel;
};
