import type { LocalRenewalHelperUpgradeState } from "../../helper-version";
import type { SettingsSectionSummary } from "./settingsSectionModels";
import type { SettingsHealth, SettingsSectionId } from "./useSettingsScreenState";

type BuildSettingsSectionSummaryArgs = {
  settingsHealth: SettingsHealth;
  helperReady: boolean;
  helperCertificateCount: number;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantUpgradeState: LocalRenewalHelperUpgradeState;
  settingsMailAddress: string | null | undefined;
  canManageOrganizationMembers: boolean;
};

export type SettingsSectionSummaryState = {
  settingsSections: SettingsSectionSummary[];
  setupPendingCount: number;
  nextSettingsSection: SettingsSectionId;
  recommendedSettingsSection: SettingsSectionId;
};

export function buildSettingsSectionSummary({
  settingsHealth,
  helperReady,
  helperCertificateCount,
  customerRenewalAssistantOnline,
  customerRenewalAssistantUpgradeState,
  settingsMailAddress,
  canManageOrganizationMembers
}: BuildSettingsSectionSummaryArgs): SettingsSectionSummaryState {
  const settingsSections: SettingsSectionSummary[] = [
    {
      id: "onboarding",
      step: 1,
      title: "도입 준비",
      done: true,
      summary: "진행 상태 확인"
    },
    {
      id: "popbill",
      step: 2,
      title: "발행 설정",
      done: settingsHealth.popbillReady,
      summary:
        settingsHealth.popbillReady
          ? "준비됨"
          : "필수값 입력"
    },
    {
      id: "gmail",
      step: 3,
      title: "메일 연결하기",
      done: settingsHealth.mailReady,
      summary: settingsHealth.mailReady
        ? settingsMailAddress || "준비됨"
        : "연결 테스트 필요"
    },
    {
      id: "helper",
      step: 4,
      title: "로컬 헬퍼",
      done: helperReady,
      summary: helperReady
        ? customerRenewalAssistantOnline && helperCertificateCount > 0
          ? `준비됨 · ${helperCertificateCount}건 읽음`
          : "준비됨 · 이전 설정 유지"
        : customerRenewalAssistantUpgradeState === "upgrade-required"
          ? "재설치 필요"
          : customerRenewalAssistantOnline
            ? customerRenewalAssistantUpgradeState === "upgrade-available"
              ? "업데이트 권장"
              : "헬퍼 연결됨 · 읽기 확인"
            : "헬퍼 준비 필요"
    },
    {
      id: "account",
      step: 5,
      title: "계정 설정",
      done: true,
      summary: canManageOrganizationMembers ? "사용자 / 비밀번호" : "비밀번호 변경"
    }
  ];
  const setupPendingCount = settingsSections.filter(
    (section) => !section.done
  ).length;
  const recommendedSettingsSection: SettingsSectionId = !settingsHealth.popbillReady
    ? "popbill"
    : !settingsHealth.mailReady
      ? "gmail"
      : !helperReady
        ? "helper"
        : "account";
  const nextSettingsSection =
    settingsSections.find((section) => !section.done)?.id ?? "account";

  return {
    settingsSections,
    setupPendingCount,
    nextSettingsSection,
    recommendedSettingsSection
  };
}
