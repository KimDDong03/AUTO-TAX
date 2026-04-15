import React from "react";
import { Panel } from "../../components/ui";
import { AccountPasswordPanel } from "./AccountPasswordPanel";
import { SettingsOrganizationMembersPanel } from "./SettingsOrganizationMembersPanel";
import type { SettingsAccountSectionModel } from "./settingsSectionModels";

type SettingsAccountSectionProps = {
  model: SettingsAccountSectionModel;
};

export function SettingsAccountSection({
  model
}: SettingsAccountSectionProps) {
  return (
    <div className="settings-account-stack">
      <Panel
        title="도입 준비 메뉴"
        subtitle={
          model.onboarding.complete
            ? "완료 후 자동 숨김 / 필요 시 다시 열기"
            : `진행 중 · 남은 ${model.onboarding.pendingStepCount}단계`
        }
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={model.onboarding.openOnboarding}
          >
            도입 준비 다시 열기
          </button>
        }
      >
        <div className="helper-box-stack">
          <strong>{model.onboarding.progressText}</strong>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={model.onboarding.showCompletedOnboardingNav}
              onChange={(event) =>
                model.onboarding.onShowCompletedOnboardingNavChange(
                  event.target.checked
                )
              }
            />
            <span>완료된 도입 준비 메뉴 계속 표시</span>
          </label>
          <span className="field-hint">
            {model.onboarding.complete
              ? model.onboarding.showCompletedOnboardingNav
                ? "현재는 도입 준비가 완료된 뒤에도 사이드바에 계속 표시됩니다."
                : "현재는 도입 준비가 완료되어 사이드바에서 자동으로 숨겨집니다."
              : "진행 중에는 메뉴가 계속 보이며, 이 토글은 완료된 뒤의 표시 여부를 기억합니다."}
          </span>
        </div>
      </Panel>

      <AccountPasswordPanel
        title="비밀번호 변경"
        subtitle="현재 계정"
        hintText="새 비밀번호는 8자 이상으로 입력하고, 두 칸이 정확히 같아야 저장됩니다."
        account={model.account}
        reveals={model.reveals.accountPassword}
        onSubmit={() => model.actions.changePassword(model.account.changePassword)}
      />

      <SettingsOrganizationMembersPanel
        account={model.account}
        actions={model.actions}
        reveals={{
          organizationMemberPassword: model.reveals.organizationMemberPassword,
          memberResetPassword: model.reveals.memberResetPassword
        }}
        busyKey={model.busyKey}
        formatDateTime={model.formatDateTime}
      />
    </div>
  );
}
