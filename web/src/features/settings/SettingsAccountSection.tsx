import React from "react";
import { Panel } from "../../components/ui";
import { PASSWORD_POLICY_MESSAGE } from "../auth/passwordPolicy";
import { AccountPasswordPanel } from "./AccountPasswordPanel";
import { SettingsOrganizationMembersPanel } from "./SettingsOrganizationMembersPanel";
import type { SettingsAccountSectionModel } from "./settingsSectionModels";

type SettingsAccountSectionProps = {
  model: SettingsAccountSectionModel;
};

export function SettingsAccountSection({
  model
}: SettingsAccountSectionProps) {
  const [withdrawOrganizationName, setWithdrawOrganizationName] = React.useState("");
  const [withdrawConfirmText, setWithdrawConfirmText] = React.useState("");
  const withdrawal = model.withdrawal;
  const expectedConfirmText = "회원탈퇴";
  const withdrawalReady =
    withdrawal.canWithdraw &&
    model.busyKey === null &&
    withdrawOrganizationName.trim() === withdrawal.organizationName &&
    withdrawConfirmText.trim() === expectedConfirmText;
  const isWithdrawing = model.busyKey === "withdraw-organization";
  const submitWithdrawal = () => {
    if (!withdrawalReady) {
      return;
    }

    void model.actions.withdrawOrganization(() =>
      withdrawal.onWithdrawOrganization({
        organizationName: withdrawOrganizationName.trim(),
        confirmText: withdrawConfirmText.trim()
      })
    );
  };

  return (
    <div className="settings-account-stack">
      <AccountPasswordPanel
        title="비밀번호 변경"
        subtitle="현재 계정"
        hintText={`${PASSWORD_POLICY_MESSAGE} 두 칸이 정확히 같아야 저장됩니다.`}
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

      <Panel
        title="고객사 회원탈퇴"
        subtitle="발행 연동 고객을 먼저 해지 처리한 뒤 작업공간 접근을 해지합니다."
        className="settings-organization-withdrawal-panel"
      >
        {withdrawal.canWithdraw ? (
          <form
            className="organization-withdrawal-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitWithdrawal();
            }}
          >
            <div className="organization-withdrawal-summary">
              <div>
                <span>등록 고객</span>
                <strong>{withdrawal.customerCount}명</strong>
              </div>
              <div>
                <span>발행 연동 해지 대상</span>
                <strong>{withdrawal.joinedPopbillCustomerCount}명</strong>
              </div>
              <div>
                <span>접근 해지 사용자</span>
                <strong>{withdrawal.memberCount}명</strong>
              </div>
            </div>

            <div className="helper-box-stack organization-withdrawal-warning">
              <strong>발행 연동 해지 실패가 1건이라도 있으면 고객사 탈퇴를 중단합니다.</strong>
              <span>
                완료되면 작업공간은 탈퇴 상태가 되고, 이 작업공간의 사용자들은 더 이상 접속할 수 없습니다.
              </span>
            </div>

            <div className="workspace-member-create-grid organization-withdrawal-confirm-grid">
              <label>
                작업공간명 입력
                <input
                  autoComplete="off"
                  value={withdrawOrganizationName}
                  onChange={(event) => setWithdrawOrganizationName(event.target.value)}
                  placeholder={withdrawal.organizationName}
                  disabled={model.busyKey !== null}
                />
              </label>
              <label>
                확인 문구 입력
                <input
                  autoComplete="off"
                  value={withdrawConfirmText}
                  onChange={(event) => setWithdrawConfirmText(event.target.value)}
                  placeholder={expectedConfirmText}
                  disabled={model.busyKey !== null}
                />
              </label>
            </div>

            <div className="button-row organization-withdrawal-actions">
              <button
                type="submit"
                className="btn-danger"
                disabled={!withdrawalReady}
              >
                {isWithdrawing ? "탈퇴 처리 중" : "고객사 회원탈퇴"}
              </button>
            </div>
          </form>
        ) : (
          <div className="helper-box-stack">
            <strong>최고 관리자만 고객사 회원탈퇴를 진행할 수 있습니다.</strong>
            <span>발행 연동 해지와 작업공간 접근 해지가 함께 진행되는 작업입니다.</span>
          </div>
        )}
      </Panel>
    </div>
  );
}
