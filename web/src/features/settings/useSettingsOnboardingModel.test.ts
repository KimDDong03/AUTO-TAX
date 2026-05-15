import test from "node:test";
import assert from "node:assert/strict";
import { selectSettingsOnboardingState } from "./useSettingsOnboardingModel";

test("selectSettingsOnboardingState falls back to empty onboarding fields before settings form loads", () => {
  const noop = () => undefined;
  const state = selectSettingsOnboardingState({
    settingsForm: null,
    settingsAutosaveLabel: "대기",
    detectedMailProviderLabel: "Gmail",
    mailPasswordConfigured: false,
    popbillSharedPasswordConfigured: false,
    renewalCertificatePasswordConfigured: false,
    renewalIssuePasswordConfigured: false,
    setSettingsForm: noop,
    handleSettingsMailAddressChange: noop,
    handleSettingsRenewalIssuePasswordChange: noop,
    runMailSettingsTest: async () => undefined,
    runLoadCurrentPopbillSharedPassword: async () => undefined,
    runLoadCurrentRenewalCertificatePassword: async () => undefined,
    runLoadCurrentRenewalIssuePassword: async () => undefined,
    runRefreshCustomerRenewalAssistant: async () => undefined
  });

  assert.deepEqual(state.fields, {
    mailProvider: "gmail",
    mailAddress: "",
    mailPassword: "",
    imapHost: "",
    imapPort: "993",
    imapSecure: true,
    imapMailbox: "INBOX",
    popbillUserIdPrefix: "",
    popbillSharedPassword: "",
    renewalIssuePassword: "",
    renewalCertificatePassword: ""
  });
  assert.equal(state.autosaveLabel, "대기");
  assert.equal(state.detectedMailProviderLabel, "Gmail");
});
