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
            ? "완료 후에도 보조 메뉴에서 다시 열 수 있습니다"
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
          <span className="field-hint">
            {model.onboarding.complete
              ? "이제 도입 준비는 사이드바 보조 메뉴에 계속 남아 언제든 다시 확인할 수 있습니다."
              : "진행 중에는 보조 메뉴에서 계속 보이며, 완료 후에도 다시 열 수 있습니다."}
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
