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
  const [withdrawPhoneVerification, setWithdrawPhoneVerification] = React.useState<{
    verificationId: string;
    code: string;
    maskedPhone: string;
    status: "idle" | "sending" | "sent" | "verifying" | "verified" | "error";
    message: string;
    devCode?: string;
  }>({
    verificationId: "",
    code: "",
    maskedPhone: "",
    status: "idle",
    message: ""
  });
  const withdrawal = model.withdrawal;
  const expectedConfirmText = "회원탈퇴";
  const phoneVerificationReady = withdrawPhoneVerification.status === "verified" && withdrawPhoneVerification.verificationId;
  const withdrawalReady =
    withdrawal.canWithdraw &&
    model.busyKey === null &&
    withdrawOrganizationName.trim() === withdrawal.organizationName &&
    withdrawConfirmText.trim() === expectedConfirmText &&
    Boolean(phoneVerificationReady);
  const isWithdrawing = model.busyKey === "withdraw-organization";
  const requestWithdrawalPhoneVerification = async () => {
    setWithdrawPhoneVerification((prev) => ({
      ...prev,
      verificationId: "",
      code: "",
      status: "sending",
      message: "대표자 휴대폰으로 인증번호를 보내는 중입니다.",
      devCode: undefined
    }));

    try {
      const result = await withdrawal.onSendPhoneVerification();
      setWithdrawPhoneVerification({
        verificationId: result.verificationId,
        code: result.devCode ?? "",
        maskedPhone: result.maskedPhone,
        status: "sent",
        message: result.devCode
          ? `개발용 인증번호 ${result.devCode}를 입력하세요.`
          : `${result.maskedPhone} 번호로 인증번호를 보냈습니다.`,
        devCode: result.devCode
      });
    } catch (error) {
      setWithdrawPhoneVerification((prev) => ({
        ...prev,
        verificationId: "",
        code: "",
        status: "error",
        message: error instanceof Error ? error.message : "인증번호 발송에 실패했습니다."
      }));
    }
  };
  const confirmWithdrawalPhoneVerification = async () => {
    if (!withdrawPhoneVerification.verificationId || withdrawPhoneVerification.code.trim().length !== 6) {
      setWithdrawPhoneVerification((prev) => ({
        ...prev,
        status: "error",
        message: "인증번호 6자리를 입력하세요."
      }));
      return;
    }

    setWithdrawPhoneVerification((prev) => ({
      ...prev,
      status: "verifying",
      message: "인증번호를 확인하는 중입니다."
    }));

    try {
      const verified = await withdrawal.onConfirmPhoneVerification({
        verificationId: withdrawPhoneVerification.verificationId,
        code: withdrawPhoneVerification.code
      });
      setWithdrawPhoneVerification((prev) => ({
        ...prev,
        status: verified ? "verified" : "error",
        message: verified ? "대표자 휴대폰 인증이 완료되었습니다." : "인증번호 확인에 실패했습니다."
      }));
    } catch (error) {
      setWithdrawPhoneVerification((prev) => ({
        ...prev,
        status: "error",
        message: error instanceof Error ? error.message : "인증번호 확인에 실패했습니다."
      }));
    }
  };
  const submitWithdrawal = () => {
    if (!withdrawalReady) {
      return;
    }

    void model.actions.withdrawOrganization(() =>
      withdrawal.onWithdrawOrganization({
        organizationName: withdrawOrganizationName.trim(),
        confirmText: withdrawConfirmText.trim(),
        phoneVerificationId: withdrawPhoneVerification.verificationId
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
                가입 시 등록한 대표자 휴대폰 인증까지 완료해야 탈퇴할 수 있습니다. 완료되면 작업공간은 탈퇴
                상태가 되고, 이 작업공간의 사용자들은 더 이상 접속할 수 없습니다.
              </span>
            </div>

            <div className="workspace-member-create-grid organization-withdrawal-confirm-grid">
              <label>
                대표자 휴대폰 인증
                <div className="organization-withdrawal-verification-control">
                  <input
                    value={withdrawPhoneVerification.maskedPhone || "등록된 대표자 휴대폰"}
                    readOnly
                    disabled={model.busyKey !== null}
                  />
                  <button
                    type="button"
                    className="organization-withdrawal-verification-button"
                    disabled={model.busyKey !== null || withdrawPhoneVerification.status === "sending"}
                    onClick={() => void requestWithdrawalPhoneVerification()}
                  >
                    {withdrawPhoneVerification.status === "sending"
                      ? "발송 중"
                      : withdrawPhoneVerification.status === "verified"
                        ? "재전송"
                        : "인증번호"}
                  </button>
                </div>
                <span
                  className={`field-hint portal-password-hint ${
                    withdrawPhoneVerification.status === "verified"
                      ? "portal-field-ok"
                      : withdrawPhoneVerification.status === "error"
                        ? "portal-field-error"
                        : ""
                  }`}
                >
                  {withdrawPhoneVerification.message || "\u00a0"}
                </span>
              </label>
              <label>
                휴대폰 인증번호
                <div className="organization-withdrawal-verification-control">
                  <input
                    value={withdrawPhoneVerification.code}
                    onChange={(event) => {
                      const code = event.target.value.replace(/\D/g, "").slice(0, 6);
                      setWithdrawPhoneVerification((prev) => ({
                        ...prev,
                        code,
                        status: prev.status === "verified" ? "sent" : prev.status,
                        message: prev.status === "verified" ? "인증번호를 다시 확인해주세요." : prev.message
                      }));
                    }}
                    placeholder="6자리"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    disabled={
                      model.busyKey !== null ||
                      !withdrawPhoneVerification.verificationId ||
                      withdrawPhoneVerification.status === "verified"
                    }
                  />
                  <button
                    type="button"
                    className="organization-withdrawal-verification-button"
                    disabled={
                      model.busyKey !== null ||
                      withdrawPhoneVerification.status === "verified" ||
                      withdrawPhoneVerification.status === "verifying" ||
                      !withdrawPhoneVerification.verificationId ||
                      withdrawPhoneVerification.code.length !== 6
                    }
                    onClick={() => void confirmWithdrawalPhoneVerification()}
                  >
                    {withdrawPhoneVerification.status === "verifying"
                      ? "확인 중"
                      : withdrawPhoneVerification.status === "verified"
                        ? "완료"
                        : "확인"}
                  </button>
                </div>
              </label>
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
