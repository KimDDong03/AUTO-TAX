import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { SettingsFeatureOrchestration } from "./createSettingsActionAdapters";
import {
  SettingsDefaultsOnboardingStep,
  SettingsHelperOnboardingStep,
  SettingsMailOnboardingStep
} from "./SettingsOnboardingStepContent";
import type { SettingsOnboardingModel } from "./useSettingsDerivedModel";
import type { SettingsFormState, SettingsScreenState } from "./useSettingsScreenState";

type UseSettingsOnboardingModelArgs = {
  settingsState: Pick<
    SettingsScreenState,
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
  > & {
    settingsForm: SettingsFormState;
  };
  onboarding: SettingsOnboardingModel;
  orchestration: SettingsFeatureOrchestration;
  busyKey: string | null;
  isMailTesting: boolean;
  helperReady: boolean;
  helperUpgradeRequired: boolean;
  helperUpgradeAvailable: boolean;
  helperActionBlockedReason: string;
  helperOnline: boolean;
  helperCheckedAt: string | null;
  helperCertificateCount: number;
  helperUpgradeMessage: string | null;
  helperLatestVersion: string | null;
  helperMinSupportedVersion: string | null;
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
  helperReady,
  helperUpgradeRequired,
  helperUpgradeAvailable,
  helperActionBlockedReason,
  helperOnline,
  helperCheckedAt,
  helperCertificateCount,
  helperUpgradeMessage,
  helperLatestVersion,
  helperMinSupportedVersion,
  renewalHelperDownloadUrl,
  runReadCertificates,
  formatDateTime
}: UseSettingsOnboardingModelArgs): SettingsOnboardingContentModel {
  const busy = busyKey !== null;
  const isReadingCertificates = busyKey === "customer-renewal-bridge-probe";
  const setSettingsField = useCallback(
    <K extends keyof SettingsFormState,>(field: K, value: SettingsFormState[K]) => {
      settingsState.setSettingsForm((prev) =>
        prev
          ? {
              ...prev,
              [field]: value
            }
          : prev
      );
    },
    [settingsState.setSettingsForm]
  );
  const downloadHelper = useCallback(() => {
    window.location.assign(renewalHelperDownloadUrl);
  }, [renewalHelperDownloadUrl]);

  return useMemo(
    () => ({
      mailContent: (
        <SettingsMailOnboardingStep
          onboarding={onboarding.mail}
          autosaveLabel={settingsState.settingsAutosaveLabel}
          detectedMailProviderLabel={settingsState.detectedMailProviderLabel}
          mailAddress={settingsState.settingsForm.mailAddress}
          mailPassword={settingsState.settingsForm.mailPassword}
          notificationEmailsText={settingsState.settingsForm.notificationEmailsText}
          mailPasswordConfigured={settingsState.mailPasswordConfigured}
          mailPasswordReveal={orchestration.reveals.mailPassword}
          busy={busy}
          isMailTesting={isMailTesting}
          onMailAddressChange={settingsState.handleSettingsMailAddressChange}
          onMailPasswordChange={(value) => setSettingsField("mailPassword", value)}
          onNotificationEmailsTextChange={(value) =>
            setSettingsField("notificationEmailsText", value)
          }
          onRunMailSettingsTest={settingsState.runMailSettingsTest}
        />
      ),
      defaultsContent: (
        <SettingsDefaultsOnboardingStep
          onboarding={onboarding.defaults}
          hasSavedDefaults={onboarding.hasSavedDefaults}
          autosaveLabel={settingsState.settingsAutosaveLabel}
          popbillUserIdPrefix={settingsState.settingsForm.popbillUserIdPrefix}
          operatorContactName={settingsState.settingsForm.operatorContactName}
          operatorContactTel={settingsState.settingsForm.operatorContactTel}
          operatorContactEmail={settingsState.settingsForm.operatorContactEmail}
          popbillSharedPassword={settingsState.settingsForm.popbillSharedPassword}
          renewalIssuePassword={settingsState.settingsForm.renewalIssuePassword}
          renewalCertificatePassword={
            settingsState.settingsForm.renewalCertificatePassword
          }
          popbillSharedPasswordConfigured={
            settingsState.popbillSharedPasswordConfigured
          }
          renewalIssuePasswordConfigured={
            settingsState.renewalIssuePasswordConfigured
          }
          renewalCertificatePasswordConfigured={
            settingsState.renewalCertificatePasswordConfigured
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
          onOperatorContactNameChange={(value) =>
            setSettingsField("operatorContactName", value)
          }
          onOperatorContactTelChange={(value) =>
            setSettingsField("operatorContactTel", value)
          }
          onOperatorContactEmailChange={(value) =>
            setSettingsField("operatorContactEmail", value)
          }
          onPopbillSharedPasswordChange={(value) =>
            setSettingsField("popbillSharedPassword", value)
          }
          onRenewalIssuePasswordChange={
            settingsState.handleSettingsRenewalIssuePasswordChange
          }
          onRenewalCertificatePasswordChange={(value) =>
            setSettingsField("renewalCertificatePassword", value)
          }
          onLoadCurrentPopbillSharedPassword={
            settingsState.runLoadCurrentPopbillSharedPassword
          }
          onLoadCurrentRenewalIssuePassword={
            settingsState.runLoadCurrentRenewalIssuePassword
          }
          onLoadCurrentRenewalCertificatePassword={
            settingsState.runLoadCurrentRenewalCertificatePassword
          }
        />
      ),
      helperContent: (
        <SettingsHelperOnboardingStep
          helperReady={helperReady}
          helperUpgradeRequired={helperUpgradeRequired}
          helperUpgradeAvailable={helperUpgradeAvailable}
          helperActionBlockedReason={helperActionBlockedReason}
          helperStatusLine={onboarding.helperStatusLine}
          helperOnline={helperOnline}
          helperCheckedAt={helperCheckedAt}
          helperCertificateCount={helperCertificateCount}
          helperUpgradeMessage={helperUpgradeMessage}
          helperLatestVersion={helperLatestVersion}
          helperMinSupportedVersion={helperMinSupportedVersion}
          busy={busy}
          isReadingCertificates={isReadingCertificates}
          onReadCertificates={runReadCertificates}
          onRefreshHelper={settingsState.runRefreshCustomerRenewalAssistant}
          onDownloadHelper={downloadHelper}
          formatDateTime={formatDateTime}
        />
      )
    }),
    [
      onboarding,
      settingsState,
      orchestration,
      busy,
      isMailTesting,
      helperReady,
      helperUpgradeRequired,
      helperUpgradeAvailable,
      helperActionBlockedReason,
      helperOnline,
      helperCheckedAt,
      helperCertificateCount,
      helperUpgradeMessage,
      helperLatestVersion,
      helperMinSupportedVersion,
      isReadingCertificates,
      runReadCertificates,
      downloadHelper,
      setSettingsField,
      formatDateTime
    ]
  );
}
