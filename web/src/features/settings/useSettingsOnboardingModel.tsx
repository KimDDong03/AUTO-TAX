import React, { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { SettingsFeatureOrchestration } from "./createSettingsActionAdapters";
import { SettingsDefaultsOnboardingStep } from "./onboarding/SettingsDefaultsOnboardingStep";
import { SettingsHelperOnboardingStep } from "./onboarding/SettingsHelperOnboardingStep";
import { SettingsMailOnboardingStep } from "./onboarding/SettingsMailOnboardingStep";
import type { SettingsCertificateReadProgress } from "./settingsSectionModels";
import type { SettingsOnboardingModel } from "./useSettingsDerivedModel";
import type { SettingsFormState, SettingsScreenState } from "./useSettingsScreenState";

type SettingsOnboardingFields = Pick<
  SettingsFormState,
  | "mailProvider"
  | "mailAddress"
  | "mailPassword"
  | "imapHost"
  | "imapPort"
  | "imapSecure"
  | "imapMailbox"
  | "popbillUserIdPrefix"
  | "popbillSharedPassword"
  | "renewalIssuePassword"
  | "renewalCertificatePassword"
>;

export type SettingsOnboardingState = {
  fields: SettingsOnboardingFields;
  autosaveLabel: string;
  detectedMailProviderLabel: string;
  configured: {
    mailPassword: boolean;
    popbillSharedPassword: boolean;
    renewalCertificatePassword: boolean;
    renewalIssuePassword: boolean;
  };
  actions: Pick<
    SettingsScreenState,
    | "setSettingsForm"
    | "handleSettingsMailAddressChange"
    | "handleSettingsRenewalIssuePasswordChange"
    | "runMailSettingsTest"
    | "runLoadCurrentPopbillSharedPassword"
    | "runLoadCurrentRenewalCertificatePassword"
    | "runLoadCurrentRenewalIssuePassword"
    | "runRefreshCustomerRenewalAssistant"
  >;
};

export function selectSettingsOnboardingState(
  settingsState: Pick<
    SettingsScreenState,
    | "settingsForm"
    | "settingsAutosaveLabel"
    | "detectedMailProviderLabel"
    | "mailPasswordConfigured"
    | "popbillSharedPasswordConfigured"
    | "renewalCertificatePasswordConfigured"
    | "renewalIssuePasswordConfigured"
    | "setSettingsForm"
    | "handleSettingsMailAddressChange"
    | "handleSettingsRenewalIssuePasswordChange"
    | "runMailSettingsTest"
    | "runLoadCurrentPopbillSharedPassword"
    | "runLoadCurrentRenewalCertificatePassword"
    | "runLoadCurrentRenewalIssuePassword"
    | "runRefreshCustomerRenewalAssistant"
  >
): SettingsOnboardingState {
  const fields: SettingsOnboardingFields = settingsState.settingsForm
    ? {
        mailAddress: settingsState.settingsForm.mailAddress,
        mailProvider: settingsState.settingsForm.mailProvider,
        mailPassword: settingsState.settingsForm.mailPassword,
        imapHost: settingsState.settingsForm.imapHost,
        imapPort: settingsState.settingsForm.imapPort,
        imapSecure: settingsState.settingsForm.imapSecure,
        imapMailbox: settingsState.settingsForm.imapMailbox,
        popbillUserIdPrefix: settingsState.settingsForm.popbillUserIdPrefix,
        popbillSharedPassword: settingsState.settingsForm.popbillSharedPassword,
        renewalIssuePassword: settingsState.settingsForm.renewalIssuePassword,
        renewalCertificatePassword:
          settingsState.settingsForm.renewalCertificatePassword
      }
    : {
        mailAddress: "",
        mailProvider: "gmail",
        mailPassword: "",
        imapHost: "",
        imapPort: "993",
        imapSecure: true,
        imapMailbox: "*",
        popbillUserIdPrefix: "",
        popbillSharedPassword: "",
        renewalIssuePassword: "",
        renewalCertificatePassword: ""
      };

  return {
    fields,
    autosaveLabel: settingsState.settingsAutosaveLabel,
    detectedMailProviderLabel: settingsState.detectedMailProviderLabel,
    configured: {
      mailPassword: settingsState.mailPasswordConfigured,
      popbillSharedPassword: settingsState.popbillSharedPasswordConfigured,
      renewalCertificatePassword:
        settingsState.renewalCertificatePasswordConfigured,
      renewalIssuePassword: settingsState.renewalIssuePasswordConfigured
    },
    actions: {
      setSettingsForm: settingsState.setSettingsForm,
      handleSettingsMailAddressChange:
        settingsState.handleSettingsMailAddressChange,
      handleSettingsRenewalIssuePasswordChange:
        settingsState.handleSettingsRenewalIssuePasswordChange,
      runMailSettingsTest: settingsState.runMailSettingsTest,
      runLoadCurrentPopbillSharedPassword:
        settingsState.runLoadCurrentPopbillSharedPassword,
      runLoadCurrentRenewalCertificatePassword:
        settingsState.runLoadCurrentRenewalCertificatePassword,
      runLoadCurrentRenewalIssuePassword:
        settingsState.runLoadCurrentRenewalIssuePassword,
      runRefreshCustomerRenewalAssistant:
        settingsState.runRefreshCustomerRenewalAssistant
    }
  };
}

type SettingsOnboardingHelperStatus = {
  ready: boolean;
  upgradeRequired: boolean;
  upgradeAvailable: boolean;
  actionBlockedReason: string;
  online: boolean;
  checkedAt: string | null;
  certificateCount: number;
  upgradeMessage: string | null;
  latestVersion: string | null;
  minSupportedVersion: string | null;
};

type UseSettingsOnboardingModelArgs = {
  settingsState: SettingsOnboardingState;
  onboarding: SettingsOnboardingModel;
  orchestration: SettingsFeatureOrchestration;
  busyKey: string | null;
  isMailTesting: boolean;
  helper: SettingsOnboardingHelperStatus;
  certificateReadProgress: SettingsCertificateReadProgress;
  renewalHelperDownloadUrl: string;
  runReadCertificates: () => Promise<void>;
  formatDateTime: (value: string | null) => string;
};

type SettingsOnboardingContentModel = {
  mailContent: ReactNode;
  defaultsContent: ReactNode;
  helperContent: ReactNode;
};

export function useSettingsOnboardingModel({
  settingsState,
  onboarding,
  orchestration,
  busyKey,
  isMailTesting,
  helper,
  certificateReadProgress,
  renewalHelperDownloadUrl,
  runReadCertificates,
  formatDateTime
}: UseSettingsOnboardingModelArgs): SettingsOnboardingContentModel {
  const busy = busyKey !== null;
  const isReadingCertificates = busyKey === "customer-renewal-bridge-probe";
  const setSettingsField = useCallback(
    <K extends keyof SettingsOnboardingFields,>(
      field: K,
      value: SettingsOnboardingFields[K]
    ) => {
      settingsState.actions.setSettingsForm((prev) =>
        prev
          ? {
              ...prev,
              [field]: value
            }
          : prev
      );
    },
    [settingsState.actions]
  );
  const downloadHelper = useCallback(() => {
    window.location.assign(renewalHelperDownloadUrl);
  }, [renewalHelperDownloadUrl]);

  return useMemo(
    () => ({
      mailContent: (
        <SettingsMailOnboardingStep
          onboarding={onboarding.mail}
          autosaveLabel={settingsState.autosaveLabel}
          detectedMailProviderLabel={settingsState.detectedMailProviderLabel}
          mailAddress={settingsState.fields.mailAddress}
          mailPassword={settingsState.fields.mailPassword}
          imapHost={settingsState.fields.imapHost}
          imapPort={settingsState.fields.imapPort}
          imapSecure={settingsState.fields.imapSecure}
          imapMailbox={settingsState.fields.imapMailbox}
          requiresManualImapSettings={settingsState.fields.mailProvider === "custom"}
          mailPasswordConfigured={settingsState.configured.mailPassword}
          mailPasswordReveal={orchestration.reveals.mailPassword}
          busy={busy}
          isMailTesting={isMailTesting}
          onMailAddressChange={
            settingsState.actions.handleSettingsMailAddressChange
          }
          onMailPasswordChange={(value) => setSettingsField("mailPassword", value)}
          onImapHostChange={(value) => setSettingsField("imapHost", value)}
          onImapPortChange={(value) => setSettingsField("imapPort", value)}
          onImapSecureChange={(value) => setSettingsField("imapSecure", value)}
          onImapMailboxChange={(value) => setSettingsField("imapMailbox", value)}
          onRunMailSettingsTest={settingsState.actions.runMailSettingsTest}
        />
      ),
      defaultsContent: (
        <SettingsDefaultsOnboardingStep
          onboarding={onboarding.defaults}
          autosaveLabel={settingsState.autosaveLabel}
          renewalIssuePassword={settingsState.fields.renewalIssuePassword}
          renewalIssuePasswordConfigured={
            settingsState.configured.renewalIssuePassword
          }
          reveals={{
            renewalIssuePassword: orchestration.reveals.renewalIssuePassword
          }}
          busy={busy}
          onRenewalIssuePasswordChange={
            settingsState.actions.handleSettingsRenewalIssuePasswordChange
          }
        />
      ),
      helperContent: (
        <SettingsHelperOnboardingStep
          helperReady={helper.ready}
          helperUpgradeRequired={helper.upgradeRequired}
          helperUpgradeAvailable={helper.upgradeAvailable}
          helperActionBlockedReason={helper.actionBlockedReason}
          helperStatusLine={onboarding.helperStatusLine}
          helperOnline={helper.online}
          helperCheckedAt={helper.checkedAt}
          helperCertificateCount={helper.certificateCount}
          certificateReadProgress={certificateReadProgress}
          busy={busy}
          isReadingCertificates={isReadingCertificates}
          onReadCertificates={runReadCertificates}
          onRefreshHelper={
            settingsState.actions.runRefreshCustomerRenewalAssistant
          }
          onDownloadHelper={downloadHelper}
          formatDateTime={formatDateTime}
        />
      )
    }),
    [
      busy,
      certificateReadProgress,
      downloadHelper,
      formatDateTime,
      helper,
      isMailTesting,
      isReadingCertificates,
      onboarding,
      orchestration.reveals.mailPassword,
      orchestration.reveals.popbillSharedPassword,
      orchestration.reveals.renewalCertificatePassword,
      orchestration.reveals.renewalIssuePassword,
      runReadCertificates,
      setSettingsField,
      settingsState
    ]
  );
}
