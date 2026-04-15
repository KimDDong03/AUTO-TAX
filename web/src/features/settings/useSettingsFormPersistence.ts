import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../api";
import type { AppSettings } from "../../types";
import {
  MAIL_PROVIDER_CONFIG,
  buildSettingsPayload,
  canAutosaveSettings,
  getSettingsAutosaveLabel,
  getSettingsPayloadSignature,
  inferMailProviderFromAddress,
  settingsToForm
} from "./settingsFormPersistence";
import type {
  SettingsAutosaveState,
  SettingsFormState
} from "./useSettingsScreenState";

type UseSettingsFormPersistenceArgs = {
  currentUserId: string | null;
  isBootstrapReadyForActiveOrganization: boolean;
  bootstrapSettings: AppSettings | null;
  busyKey: string | null;
  setGlobalError: (message: string) => void;
};

type ApplySavedSettingsOptions = {
  syncForm?: boolean;
  baselineForm?: SettingsFormState | null;
};

export function useSettingsFormPersistence({
  currentUserId,
  isBootstrapReadyForActiveOrganization,
  bootstrapSettings,
  busyKey,
  setGlobalError
}: UseSettingsFormPersistenceArgs) {
  const [savedSettingsState, setSavedSettingsState] = useState<AppSettings | null>(null);
  const [settingsFormState, setSettingsFormState] = useState<SettingsFormState | null>(null);
  const [settingsAutosaveState, setSettingsAutosaveState] =
    useState<SettingsAutosaveState>("idle");
  const settingsAutosaveBaselineRef = useRef("");
  const savedSettings =
    savedSettingsState ??
    (isBootstrapReadyForActiveOrganization ? bootstrapSettings : null);
  const settingsForm =
    settingsFormState ?? (savedSettings ? settingsToForm(savedSettings) : null);

  const setSettingsForm = useCallback<
    Dispatch<SetStateAction<SettingsFormState | null>>
  >(
    (nextState) => {
      setSettingsFormState((prev) => {
        const baseState = prev ?? settingsForm;
        if (typeof nextState === "function") {
          return (
            nextState as (
              previousState: SettingsFormState | null
            ) => SettingsFormState | null
          )(baseState);
        }
        return nextState;
      });
    },
    [settingsForm]
  );

  const applySavedSettings = useCallback(
    (nextSavedSettings: AppSettings, options?: ApplySavedSettingsOptions) => {
      const baselineForm = options?.baselineForm ?? settingsToForm(nextSavedSettings);
      setSavedSettingsState(nextSavedSettings);
      if (options?.syncForm !== false) {
        setSettingsFormState(baselineForm);
      }
      settingsAutosaveBaselineRef.current = baselineForm
        ? getSettingsPayloadSignature(baselineForm)
        : "";
      setSettingsAutosaveState("saved");
    },
    []
  );

  const applySettingsFormBaseline = useCallback(
    (nextForm: SettingsFormState) => {
      settingsAutosaveBaselineRef.current = getSettingsPayloadSignature(nextForm);
      setSettingsAutosaveState("saved");
      setSettingsForm(nextForm);
    },
    [setSettingsForm]
  );

  const resetSettingsFormState = useCallback(() => {
    setSavedSettingsState(null);
    setSettingsFormState(null);
    settingsAutosaveBaselineRef.current = "";
    setSettingsAutosaveState("idle");
  }, []);

  useEffect(() => {
    if (currentUserId !== null) {
      return;
    }

    resetSettingsFormState();
  }, [currentUserId, resetSettingsFormState]);

  useEffect(() => {
    if (!isBootstrapReadyForActiveOrganization || !bootstrapSettings) {
      resetSettingsFormState();
      return;
    }

    applySavedSettings(bootstrapSettings);
  }, [
    applySavedSettings,
    bootstrapSettings,
    isBootstrapReadyForActiveOrganization,
    resetSettingsFormState
  ]);

  useEffect(() => {
    if (!settingsForm) {
      return;
    }

    const signature = getSettingsPayloadSignature(settingsForm);

    if (!settingsAutosaveBaselineRef.current) {
      settingsAutosaveBaselineRef.current = signature;
      setSettingsAutosaveState("saved");
      return;
    }

    if (signature === settingsAutosaveBaselineRef.current) {
      setSettingsAutosaveState((prev) => (prev === "error" ? prev : "saved"));
      return;
    }

    setSettingsAutosaveState("pending");

    if (busyKey !== null || !canAutosaveSettings(settingsForm)) {
      return;
    }

    const timerId = window.setTimeout(async () => {
      try {
        setSettingsAutosaveState("saving");
        setGlobalError("");
        const { payload } = buildSettingsPayload(settingsForm);
        const nextSavedSettings = await api<AppSettings>("/api/settings", {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        applySavedSettings(nextSavedSettings, {
          syncForm: false,
          baselineForm: settingsForm
        });
      } catch (saveError) {
        setSettingsAutosaveState("error");
        setGlobalError(
          saveError instanceof Error
            ? saveError.message
            : "설정 자동 저장에 실패했습니다."
        );
      }
    }, 700);

    return () => window.clearTimeout(timerId);
  }, [applySavedSettings, busyKey, setGlobalError, settingsForm]);

  const detectedMailProviderLabel = settingsForm
    ? MAIL_PROVIDER_CONFIG[
        inferMailProviderFromAddress(
          settingsForm.mailAddress,
          settingsForm.mailProvider
        )
      ].label
    : MAIL_PROVIDER_CONFIG.gmail.label;

  return useMemo(
    () => ({
      savedSettings,
      settingsForm,
      setSettingsForm,
      settingsAutosaveState,
      settingsAutosaveLabel: getSettingsAutosaveLabel(settingsAutosaveState),
      detectedMailProviderLabel,
      applySavedSettings,
      applySettingsFormBaseline,
      resetSettingsFormState
    }),
    [
      applySavedSettings,
      applySettingsFormBaseline,
      detectedMailProviderLabel,
      resetSettingsFormState,
      savedSettings,
      settingsAutosaveState,
      setSettingsForm,
      settingsForm
    ]
  );
}
