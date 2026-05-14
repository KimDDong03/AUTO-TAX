import React, { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { SettingsFeatureOrchestration } from "./createSettingsActionAdapters";
import { SettingsDefaultsOnboardingStep } from "./onboarding/SettingsDefaultsOnboardingStep";
import { SettingsHelperOnboardingStep } from "./onboarding/SettingsHelperOnboardingStep";
import { SettingsMailOnboardingStep } from "./onboarding/SettingsMailOnboardingStep";
import type { SettingsOnboardingModel } from "./useSettingsDerivedModel";
import type { SettingsFormState, SettingsScreenState } from "./useSettingsScreenState";

type SettingsOnboardingFields = Pick<
  SettingsFormState,
  | "mailAddress"
  | "mailPassword"
  | "notificationEmailsText"
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
        mailPassword: settingsState.settingsForm.mailPassword,
        notificationEmailsText: settingsState.settingsForm.notificationEmailsText,
        popbillUserIdPrefix: settingsState.settingsForm.popbillUserIdPrefix,
        popbillSharedPassword: settingsState.settingsForm.popbillSharedPassword,
        renewalIssuePassword: settingsState.settingsForm.renewalIssuePassword,
        renewalCertificatePassword:
          settingsState.settingsForm.renewalCertificatePassword
      }
    : {
        mailAddress: "",
        mailPassword: "",
        notificationEmailsText: "",
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
          notificationEmailsText={settingsState.fields.notificationEmailsText}
          mailPasswordConfigured={settingsState.configured.mailPassword}
          mailPasswordReveal={orchestration.reveals.mailPassword}
          busy={busy}
          isMailTesting={isMailTesting}
          onMailAddressChange={
            settingsState.actions.handleSettingsMailAddressChange
          }
          onMailPasswordChange={(value) => setSettingsField("mailPassword", value)}
          onNotificationEmailsTextChange={(value) =>
            setSettingsField("notificationEmailsText", value)
          }
          onRunMailSettingsTest={settingsState.actions.runMailSettingsTest}
        />
      ),
      defaultsContent: (
        <SettingsDefaultsOnboardingStep
          onboarding={onboarding.defaults}
          hasSavedDefaults={onboarding.hasSavedDefaults}
          autosaveLabel={settingsState.autosaveLabel}
          popbillUserIdPrefix={settingsState.fields.popbillUserIdPrefix}
          popbillSharedPassword={settingsState.fields.popbillSharedPassword}
          renewalIssuePassword={settingsState.fields.renewalIssuePassword}
          renewalCertificatePassword={
            settingsState.fields.renewalCertificatePassword
          }
          popbillSharedPasswordConfigured={
            settingsState.configured.popbillSharedPassword
          }
          renewalIssuePasswordConfigured={
            settingsState.configured.renewalIssuePassword
          }
          renewalCertificatePasswordConfigured={
            settingsState.configured.renewalCertificatePassword
          }
          reveals={{
            popbillSharedPassword: orchestration.reveals.popbillSharedPassword,
            renewalIssuePassword: orchestration.reveals.renewalIssuePassword,
            renewalCertificatePassword:
              orchestration.reveals.renewalCertificatePassword
          }}
          busy={busy}
          onPopbillUserIdPrefixChange={(value) =>
            setSettingsField("popbillUserIdPrefix", value)
          }
          onPopbillSharedPasswordChange={(value) =>
            setSettingsField("popbillSharedPassword", value)
          }
          onRenewalIssuePasswordChange={
            settingsState.actions.handleSettingsRenewalIssuePasswordChange
          }
          onRenewalCertificatePasswordChange={(value) =>
            setSettingsField("renewalCertificatePassword", value)
          }
          onLoadCurrentPopbillSharedPassword={
            settingsState.actions.runLoadCurrentPopbillSharedPassword
          }
          onLoadCurrentRenewalIssuePassword={
            settingsState.actions.runLoadCurrentRenewalIssuePassword
          }
          onLoadCurrentRenewalCertificatePassword={
            settingsState.actions.runLoadCurrentRenewalCertificatePassword
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
          helperUpgradeMessage={helper.upgradeMessage}
          helperLatestVersion={helper.latestVersion}
          helperMinSupportedVersion={helper.minSupportedVersion}
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
