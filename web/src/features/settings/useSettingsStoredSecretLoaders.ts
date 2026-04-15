import { useCallback } from "react";
import { api } from "../../api";
import { normalizeRenewalIssuePasswordInput } from "./settingsFormUtils";
import type { SettingsFormState } from "./useSettingsScreenState";

type UseSettingsStoredSecretLoadersArgs = {
  settingsForm: SettingsFormState | null;
  applySettingsFormBaseline: (nextForm: SettingsFormState) => void;
  revealField: (fieldKey: string) => void;
  onRenewalCertificatePasswordChange: (password: string) => void;
  onRenewalIssuePasswordChange: (password: string) => void;
};

export function useSettingsStoredSecretLoaders({
  settingsForm,
  applySettingsFormBaseline,
  revealField,
  onRenewalCertificatePasswordChange,
  onRenewalIssuePasswordChange
}: UseSettingsStoredSecretLoadersArgs) {
  const fetchStoredRenewalCertificatePassword = useCallback(async () => {
    const result = await api<{ password: string }>(
      "/api/settings/renewal-certificate-password"
    );
    return result.password.trim();
  }, []);

  const fetchStoredRenewalIssuePassword = useCallback(async () => {
    const result = await api<{ password: string }>(
      "/api/settings/renewal-issue-password"
    );
    return normalizeRenewalIssuePasswordInput(result.password.trim());
  }, []);

  const loadCurrentPopbillSharedPassword = useCallback(async () => {
    if (!settingsForm) return;
    const result = await api<{ password: string }>(
      "/api/settings/popbill-shared-password"
    );
    applySettingsFormBaseline({
      ...settingsForm,
      popbillSharedPassword: result.password
    });
    revealField("popbillSharedPassword");
  }, [applySettingsFormBaseline, revealField, settingsForm]);

  const loadCurrentRenewalCertificatePassword = useCallback(async () => {
    if (!settingsForm) return;
    const password = await fetchStoredRenewalCertificatePassword();
    onRenewalCertificatePasswordChange(password);
    applySettingsFormBaseline({
      ...settingsForm,
      renewalCertificatePassword: password
    });
    revealField("renewalCertificatePassword");
  }, [
    applySettingsFormBaseline,
    fetchStoredRenewalCertificatePassword,
    onRenewalCertificatePasswordChange,
    revealField,
    settingsForm
  ]);

  const loadCurrentRenewalIssuePassword = useCallback(async () => {
    if (!settingsForm) return;
    const password = await fetchStoredRenewalIssuePassword();
    onRenewalIssuePasswordChange(password);
    applySettingsFormBaseline({
      ...settingsForm,
      renewalIssuePassword: password
    });
    revealField("renewalIssuePassword");
  }, [
    applySettingsFormBaseline,
    fetchStoredRenewalIssuePassword,
    onRenewalIssuePasswordChange,
    revealField,
    settingsForm
  ]);

  return {
    loadCurrentPopbillSharedPassword,
    loadCurrentRenewalCertificatePassword,
    loadCurrentRenewalIssuePassword
  };
}
