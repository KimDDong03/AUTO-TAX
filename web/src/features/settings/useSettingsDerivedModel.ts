import { useMemo } from "react";
import type { LocalRenewalHelperUpgradeState } from "../../helper-version";
import { normalizeRenewalIssuePasswordInput } from "./settingsFormUtils";
import type {
  SettingsAutosaveState,
  SettingsFormState,
  SettingsHealth,
  SettingsScreenState,
  SettingsSectionId
} from "./useSettingsScreenState";

export type SettingsActionBarChip = {
  label: string;
  value: string;
  tone: "default" | "warn" | "danger" | "success";
};

export type SettingsActionBarModel = {
  title: string;
  primaryActionLabel: string;
  primarySection: SettingsSectionId;
  chips: SettingsActionBarChip[];
};

type SettingsOnboardingFieldState = {
  missing: boolean;
  invalid: boolean;
  hasError: boolean;
};

export type SettingsOnboardingModel = {
  hasSavedDefaults: boolean;
  helperStatusLine: string;
  firstSyncBlockedSteps: string[];
  mail: {
    headline: string;
    address: SettingsOnboardingFieldState;
    password: {
      missing: boolean;
      hasError: boolean;
    };
  };
  defaults: {
    headline: string;
    popbillReadyLabel: string;
    operatorReadyLabel: string;
    popbillPrefix: SettingsOnboardingFieldState;
    operatorName: SettingsOnboardingFieldState;
    operatorTel: SettingsOnboardingFieldState;
    operatorEmail: SettingsOnboardingFieldState;
    popbillSharedPassword: {
      missing: boolean;
      hasError: boolean;
    };
    renewalIssuePassword: {
      missing: boolean;
      hasError: boolean;
    };
  };
};

type UseSettingsDerivedModelArgs = {
  settingsState: Pick<
    SettingsScreenState,
    | "setupPendingCount"
    | "nextSettingsSection"
    | "settingsHealth"
    | "settingsAutosaveLabel"
    | "settingsAutosaveState"
    | "settingsForm"
    | "mailPasswordConfigured"
    | "popbillSharedPasswordConfigured"
    | "renewalCertificatePasswordConfigured"
    | "renewalIssuePasswordConfigured"
    | "detectedMailProviderLabel"
  >;
  helperReady: boolean;
  helperOnline: boolean;
  helperCertificateCount: number;
  helperUpgradeState: LocalRenewalHelperUpgradeState;
  helperActionBlockedReason: string;
  helperUpgradeMessage: string | null;
  onboardingCustomerRegistrationReady: boolean;
  onboardingCertificateReady: boolean;
};

export function getSettingsSectionLabel(section: SettingsSectionId): string {
  switch (section) {
    case "gmail":
      return "메일 연결";
    case "popbill":
      return "발행 설정";
    case "helper":
      return "헬퍼 상태";
    case "account":
    default:
      return "계정 / 작업공간";
  }
}

export function buildSettingsActionBarModel({
  setupPendingCount,
  nextSettingsSection,
  settingsHealth,
  helperReady,
  settingsAutosaveLabel,
  settingsAutosaveState
}: {
  setupPendingCount: number;
  nextSettingsSection: SettingsSectionId;
  settingsHealth: SettingsHealth;
  helperReady: boolean;
  settingsAutosaveLabel: string;
  settingsAutosaveState: SettingsAutosaveState;
}): SettingsActionBarModel {
  return {
    title: setupPendingCount > 0 ? "준비 상태 점검" : "설정 준비 완료",
    primaryActionLabel: getSettingsSectionLabel(nextSettingsSection),
    primarySection: nextSettingsSection,
    chips: [
      {
        label: "메일",
        value: settingsHealth.mailReady ? "준비됨" : "확인 필요",
        tone: settingsHealth.mailReady ? "success" : "warn"
      },
      {
        label: "발행",
        value: settingsHealth.popbillReady && settingsHealth.operatorReady ? "준비됨" : "입력 필요",
        tone: settingsHealth.popbillReady && settingsHealth.operatorReady ? "success" : "warn"
      },
      {
        label: "인증서",
        value: helperReady ? "준비됨" : "확인 필요",
        tone: helperReady ? "success" : "warn"
      },
      {
        label: "자동 저장",
        value: settingsAutosaveLabel,
        tone:
          settingsAutosaveState === "error"
            ? "danger"
            : settingsAutosaveState === "saving"
              ? "warn"
              : "default"
      }
    ]
  };
}

export function buildSettingsOnboardingModel({
  settingsForm,
  settingsHealth,
  mailPasswordConfigured,
  popbillSharedPasswordConfigured,
  renewalIssuePasswordConfigured,
  renewalCertificatePasswordConfigured,
  helperReady,
  helperOnline,
  helperCertificateCount,
  helperUpgradeState,
  helperActionBlockedReason,
  helperUpgradeMessage,
  onboardingCustomerRegistrationReady,
  onboardingCertificateReady
}: {
  settingsForm: SettingsFormState;
  settingsHealth: SettingsHealth;
  mailPasswordConfigured: boolean;
  popbillSharedPasswordConfigured: boolean;
  renewalIssuePasswordConfigured: boolean;
  renewalCertificatePasswordConfigured: boolean;
  helperReady: boolean;
  helperOnline: boolean;
  helperCertificateCount: number;
  helperUpgradeState: LocalRenewalHelperUpgradeState;
  helperActionBlockedReason: string;
  helperUpgradeMessage: string | null;
  onboardingCustomerRegistrationReady: boolean;
  onboardingCertificateReady: boolean;
}): SettingsOnboardingModel {
  const onboardingMailAddressMissing = settingsForm.mailAddress.trim() === "";
  const onboardingMailAddressInvalid =
    !onboardingMailAddressMissing && !isLikelyEmailAddress(settingsForm.mailAddress);
  const onboardingMailPasswordMissing =
    settingsForm.mailPassword.trim() === "" && !mailPasswordConfigured;
  const onboardingPopbillPrefixMissing = settingsForm.popbillUserIdPrefix.trim() === "";
  const onboardingOperatorNameMissing = settingsForm.operatorContactName.trim() === "";
  const onboardingOperatorTelMissing = settingsForm.operatorContactTel.trim() === "";
  const onboardingOperatorEmailMissing = settingsForm.operatorContactEmail.trim() === "";
  const onboardingOperatorEmailInvalid =
    !onboardingOperatorEmailMissing && !isLikelyEmailAddress(settingsForm.operatorContactEmail);
  const onboardingPopbillSharedPasswordMissing =
    settingsForm.popbillSharedPassword.trim() === "" &&
    !popbillSharedPasswordConfigured;
  const onboardingRenewalIssuePasswordMissing =
    normalizeRenewalIssuePasswordInput(settingsForm.renewalIssuePassword).length === 0 &&
    !renewalIssuePasswordConfigured;
  const onboardingHelperStatusLine = helperReady
    ? `인증서 ${helperCertificateCount}건 읽음`
    : helperUpgradeState === "upgrade-required"
      ? helperActionBlockedReason
      : helperUpgradeState === "upgrade-available" && helperUpgradeMessage
        ? helperUpgradeMessage
        : helperOnline
          ? "헬퍼 연결됨"
          : "상태 미확인";

  return {
    hasSavedDefaults:
      popbillSharedPasswordConfigured ||
      renewalIssuePasswordConfigured ||
      renewalCertificatePasswordConfigured,
    helperStatusLine: onboardingHelperStatusLine,
    firstSyncBlockedSteps: [
      !settingsHealth.mailReady ? "메일 연결" : null,
      !(settingsHealth.popbillReady && settingsHealth.operatorReady) ? "발행 기본값 입력" : null,
      !helperReady ? "로컬 헬퍼 준비" : null,
      !onboardingCustomerRegistrationReady ? "고객 초기 등록" : null,
      !onboardingCertificateReady ? "인증서 연결 마무리" : null
    ].filter((value): value is string => Boolean(value)),
    mail: {
      headline: settingsHealth.mailReady ? "메일 연결 완료" : "메일 주소와 앱 비밀번호만 입력하세요.",
      address: {
        missing: onboardingMailAddressMissing,
        invalid: onboardingMailAddressInvalid,
        hasError: onboardingMailAddressMissing || onboardingMailAddressInvalid
      },
      password: {
        missing: onboardingMailPasswordMissing,
        hasError: onboardingMailPasswordMissing
      }
    },
    defaults: {
      headline:
        settingsHealth.popbillReady && settingsHealth.operatorReady
          ? "필수값 입력 완료"
          : "필수값만 먼저 입력하세요.",
      popbillReadyLabel: settingsHealth.popbillReady ? "준비됨" : "입력 필요",
      operatorReadyLabel: settingsHealth.operatorReady ? "준비됨" : "입력 필요",
      popbillPrefix: {
        missing: onboardingPopbillPrefixMissing,
        invalid: false,
        hasError: onboardingPopbillPrefixMissing
      },
      operatorName: {
        missing: onboardingOperatorNameMissing,
        invalid: false,
        hasError: onboardingOperatorNameMissing
      },
      operatorTel: {
        missing: onboardingOperatorTelMissing,
        invalid: false,
        hasError: onboardingOperatorTelMissing
      },
      operatorEmail: {
        missing: onboardingOperatorEmailMissing,
        invalid: onboardingOperatorEmailInvalid,
        hasError: onboardingOperatorEmailMissing || onboardingOperatorEmailInvalid
      },
      popbillSharedPassword: {
        missing: onboardingPopbillSharedPasswordMissing,
        hasError: onboardingPopbillSharedPasswordMissing
      },
      renewalIssuePassword: {
        missing: onboardingRenewalIssuePasswordMissing,
        hasError: onboardingRenewalIssuePasswordMissing
      }
    }
  };
}

function isLikelyEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function useSettingsDerivedModel({
  settingsState,
  helperReady,
  helperOnline,
  helperCertificateCount,
  helperUpgradeState,
  helperActionBlockedReason,
  helperUpgradeMessage,
  onboardingCustomerRegistrationReady,
  onboardingCertificateReady
}: UseSettingsDerivedModelArgs) {
  return useMemo(
    () => ({
      actionBar: buildSettingsActionBarModel({
        setupPendingCount: settingsState.setupPendingCount,
        nextSettingsSection: settingsState.nextSettingsSection,
        settingsHealth: settingsState.settingsHealth,
        helperReady,
        settingsAutosaveLabel: settingsState.settingsAutosaveLabel,
        settingsAutosaveState: settingsState.settingsAutosaveState
      }),
      onboarding: buildSettingsOnboardingModel({
        settingsForm: settingsState.settingsForm!,
        settingsHealth: settingsState.settingsHealth,
        mailPasswordConfigured: settingsState.mailPasswordConfigured,
        popbillSharedPasswordConfigured: settingsState.popbillSharedPasswordConfigured,
        renewalIssuePasswordConfigured: settingsState.renewalIssuePasswordConfigured,
        renewalCertificatePasswordConfigured: settingsState.renewalCertificatePasswordConfigured,
        helperReady,
        helperOnline,
        helperCertificateCount,
        helperUpgradeState,
        helperActionBlockedReason,
        helperUpgradeMessage,
        onboardingCustomerRegistrationReady,
        onboardingCertificateReady
      })
    }),
    [
      helperActionBlockedReason,
      helperCertificateCount,
      helperOnline,
      helperReady,
      helperUpgradeMessage,
      helperUpgradeState,
      onboardingCertificateReady,
      onboardingCustomerRegistrationReady,
      settingsState
    ]
  );
}
