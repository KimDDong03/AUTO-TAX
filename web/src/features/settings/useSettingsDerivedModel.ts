import { useMemo } from "react";
import type { LocalRenewalHelperUpgradeState } from "../../helper-version";
import { normalizeRenewalIssuePasswordInput } from "./settingsFormUtils";
import type {
  SettingsAutosaveState,
  SettingsFormState,
  SettingsHealth,
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

export type SettingsActionBarDerivationInput = {
  setupPendingCount: number;
  nextSettingsSection: SettingsSectionId;
  settingsHealth: SettingsHealth;
  helperReady: boolean;
  settingsAutosaveLabel: string;
  settingsAutosaveState: SettingsAutosaveState;
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

export type SettingsOnboardingFields = Pick<
  SettingsFormState,
  | "mailAddress"
  | "mailPassword"
  | "popbillUserIdPrefix"
  | "operatorContactName"
  | "operatorContactTel"
  | "operatorContactEmail"
  | "popbillSharedPassword"
  | "renewalIssuePassword"
>;

export type SettingsOnboardingConfiguredState = {
  mailPasswordConfigured: boolean;
  popbillSharedPasswordConfigured: boolean;
  renewalIssuePasswordConfigured: boolean;
  renewalCertificatePasswordConfigured: boolean;
};

export type SettingsOnboardingHelperState = {
  ready: boolean;
  online: boolean;
  certificateCount: number;
  upgradeState: LocalRenewalHelperUpgradeState;
  actionBlockedReason: string;
  upgradeMessage: string | null;
};

export type SettingsOnboardingProgressState = {
  customerRegistrationReady: boolean;
  certificateReady: boolean;
};

export type SettingsOnboardingDerivationInput = {
  fields: SettingsOnboardingFields;
  settingsHealth: SettingsHealth;
  configured: SettingsOnboardingConfiguredState;
  helper: SettingsOnboardingHelperState;
  progress: SettingsOnboardingProgressState;
};

type UseSettingsDerivedModelArgs = {
  actionBar: SettingsActionBarDerivationInput;
  onboarding: SettingsOnboardingDerivationInput;
};

export function getSettingsSectionLabel(section: SettingsSectionId): string {
  switch (section) {
    case "onboarding":
      return "도입 준비";
    case "gmail":
      return "메일 연결하기";
    case "popbill":
      return "운영 연락처 및 발행 설정";
    case "helper":
      return "로컬 헬퍼";
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
}: SettingsActionBarDerivationInput): SettingsActionBarModel {
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
  fields,
  settingsHealth,
  configured,
  helper,
  progress
}: SettingsOnboardingDerivationInput): SettingsOnboardingModel {
  const onboardingMailAddressMissing = fields.mailAddress.trim() === "";
  const onboardingMailAddressInvalid =
    !onboardingMailAddressMissing && !isLikelyEmailAddress(fields.mailAddress);
  const onboardingMailPasswordMissing =
    fields.mailPassword.trim() === "" && !configured.mailPasswordConfigured;
  const onboardingOperatorNameMissing = fields.operatorContactName.trim() === "";
  const onboardingOperatorTelMissing = fields.operatorContactTel.trim() === "";
  const onboardingOperatorEmailMissing = fields.operatorContactEmail.trim() === "";
  const onboardingOperatorEmailInvalid =
    !onboardingOperatorEmailMissing &&
    !isLikelyEmailAddress(fields.operatorContactEmail);
  const onboardingRenewalIssuePasswordMissing =
    normalizeRenewalIssuePasswordInput(fields.renewalIssuePassword).length === 0 &&
    !configured.renewalIssuePasswordConfigured;
  const onboardingHelperStatusLine = helper.ready
    ? helper.online && helper.certificateCount > 0
      ? `인증서 ${helper.certificateCount}건 읽음`
      : "이 PC에서 로컬 헬퍼 준비를 완료했습니다."
    : helper.upgradeState === "upgrade-required"
      ? helper.actionBlockedReason
      : helper.upgradeState === "upgrade-available" && helper.upgradeMessage
        ? helper.upgradeMessage
        : helper.online
          ? "헬퍼 연결됨"
          : "상태 미확인";

  return {
    hasSavedDefaults:
      configured.renewalIssuePasswordConfigured,
    helperStatusLine: onboardingHelperStatusLine,
    firstSyncBlockedSteps: [
      !settingsHealth.mailReady ? "운영팀 메일 설정" : null,
      !helper.ready ? "로컬 헬퍼 준비" : null,
      !progress.customerRegistrationReady ? "고객 초기 등록" : null,
      !progress.certificateReady ? "인증서 연결 마무리" : null
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
          ? "운영 연락처 입력 완료"
          : "운영 연락처를 먼저 입력하세요.",
      popbillReadyLabel: settingsHealth.popbillReady ? "준비됨" : "입력 필요",
      operatorReadyLabel: settingsHealth.operatorReady ? "준비됨" : "입력 필요",
      popbillPrefix: {
        missing: false,
        invalid: false,
        hasError: false
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
        missing: false,
        hasError: false
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
  actionBar,
  onboarding
}: UseSettingsDerivedModelArgs) {
  return useMemo(
    () => ({
      actionBar: buildSettingsActionBarModel(actionBar),
      onboarding: buildSettingsOnboardingModel(onboarding)
    }),
    [actionBar, onboarding]
  );
}
