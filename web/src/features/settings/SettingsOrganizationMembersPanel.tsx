import React from "react";
import { Panel, PasswordField } from "../../components/ui";
import { PASSWORD_POLICY_PLACEHOLDER } from "../auth/passwordPolicy";
import type {
  SettingsFeatureActionAdapters,
  SettingsFeatureRevealAdapters
} from "./createSettingsActionAdapters";
import type {
  OrganizationMemberFormState,
  PasswordResetFormState,
  SettingsAccountState
} from "./settingsAccountTypes";

function updateObjectField<T extends Record<string, unknown>, K extends keyof T>(
  setState: React.Dispatch<React.SetStateAction<T>>,
  field: K,
  value: T[K]
) {
  setState((prev) => ({ ...prev, [field]: value }));
}

type SettingsOrganizationMembersPanelProps = {
  account: Pick<
    SettingsAccountState,
    | "canManageOrganizationMembers"
    | "organizationMembers"
    | "organizationMemberItems"
    | "passwordResetForm"
    | "organizationMemberForm"
    | "setPasswordResetForm"
    | "setOrganizationMemberForm"
    | "createOrganizationMember"
    | "openMemberPasswordReset"
    | "removeOrganizationMember"
    | "submitMemberPasswordReset"
    | "cancelPasswordReset"
  >;
  actions: Pick<
    SettingsFeatureActionAdapters,
    | "createOrganizationMember"
    | "removeOrganizationMember"
    | "resetOrganizationMemberPassword"
  >;
  reveals: Pick<
    SettingsFeatureRevealAdapters,
    "organizationMemberPassword" | "memberResetPassword"
  >;
  busyKey: string | null;
  formatDateTime: (value: string | null) => string;
};

export function SettingsOrganizationMembersPanel({
  account,
  actions,
  reveals,
  busyKey,
  formatDateTime
}: SettingsOrganizationMembersPanelProps) {
  const setPasswordResetField = <K extends keyof PasswordResetFormState>(
    field: K,
    value: PasswordResetFormState[K]
  ) => updateObjectField(account.setPasswordResetForm, field, value);
  const setOrganizationMemberField = <K extends keyof OrganizationMemberFormState>(
    field: K,
    value: OrganizationMemberFormState[K]
  ) => updateObjectField(account.setOrganizationMemberForm, field, value);

  return (
    <Panel
      title="작업공간 사용자 관리"
      subtitle={account.canManageOrganizationMembers ? "내부 사용자 관리" : "권한 없음"}
      actions={
        account.canManageOrganizationMembers ? (
          <button onClick={() => void actions.createOrganizationMember(account.createOrganizationMember)}>
            사용자 추가
          </button>
        ) : null
      }
    >
      {account.canManageOrganizationMembers ? (
        <>
          <div className="helper-box workspace-member-summary">
            <strong>현재 사용자 {account.organizationMembers.length}명</strong>
            <span>대표 관리자는 제거할 수 없습니다.</span>
          </div>

          <div className="workspace-member-create-box">
            <div className="workspace-member-create-grid">
              <label>
                로그인 아이디
                <input
                  value={account.organizationMemberForm.loginId}
                  onChange={(event) =>
                    setOrganizationMemberField("loginId", event.target.value)
                  }
                  placeholder="예: team01"
                />
              </label>
              <label>
                이름
                <input
                  value={account.organizationMemberForm.displayName}
                  onChange={(event) =>
                    setOrganizationMemberField("displayName", event.target.value)
                  }
                  placeholder="표시 이름"
                />
              </label>
              <label>
                임시 비밀번호
                <PasswordField
                  visible={reveals.organizationMemberPassword.visible}
                  onVisibleChange={() => reveals.organizationMemberPassword.toggle()}
                  value={account.organizationMemberForm.password}
                  onChange={(event) =>
                    setOrganizationMemberField("password", event.target.value)
                  }
                  placeholder={`새 계정이면 ${PASSWORD_POLICY_PLACEHOLDER}`}
                  revealLabel="임시 비밀번호 보기"
                  hideLabel="임시 비밀번호 숨기기"
                />
              </label>
            </div>
            <div className="workspace-member-create-note">
              <span>기존 아이디면 멤버 연결</span>
              <span>새 아이디면 강한 임시 비밀번호 필요</span>
            </div>
          </div>

          <div className="workspace-member-list">
            {account.organizationMemberItems.length > 0 ? (
              account.organizationMemberItems.map((item) => {
                const {
                  member,
                  canRemove,
                  canResetPassword,
                  isCurrentUser,
                  isOwner,
                  isResetTarget,
                  roleLabel
                } = item;

                return (
                  <article key={member.membershipId} className="workspace-member-card">
                    <div className="workspace-member-card-head">
                      <div>
                        <strong>{member.displayName || member.loginId || "이름 없음"}</strong>
                        <span>{member.loginId || "로그인 아이디 없음"}</span>
                      </div>
                      <span className={isOwner ? "chip chip-success" : "chip"}>{roleLabel}</span>
                    </div>
                    <div className="workspace-member-card-meta">
                      <span>등록일 {formatDateTime(member.createdAt)}</span>
                      {isCurrentUser ? <span>현재 로그인 계정</span> : null}
                    </div>
                    <div className="workspace-member-card-actions">
                      {canResetPassword ? (
                        <button
                          className="btn-secondary"
                          disabled={busyKey !== null}
                          onClick={() => account.openMemberPasswordReset(member)}
                        >
                          임시 비밀번호 재설정
                        </button>
                      ) : null}
                      {canRemove ? (
                        <button
                          className="btn-secondary btn-danger"
                          disabled={busyKey !== null}
                          onClick={() =>
                            void actions.removeOrganizationMember(
                              member.membershipId,
                              async () => account.removeOrganizationMember(member)
                            )
                          }
                        >
                          제거
                        </button>
                      ) : (
                        <span className="field-hint">
                          {isOwner
                            ? "대표 관리자 비밀번호는 운영 관리자에게 문의하세요."
                            : "현재 로그인한 계정입니다."}
                        </span>
                      )}
                    </div>
                    {isResetTarget ? (
                      <div className="helper-box-stack inline-password-reset">
                        <strong>{member.loginId ?? "선택한 사용자"} 임시 비밀번호 재설정</strong>
                        <div className="form-grid">
                          <label>
                            새 임시 비밀번호
                            <PasswordField
                              visible={reveals.memberResetPassword.nextPassword.visible}
                              onVisibleChange={() => reveals.memberResetPassword.nextPassword.toggle()}
                              value={account.passwordResetForm.nextPassword}
                              onChange={(event) =>
                                setPasswordResetField("nextPassword", event.target.value)
                              }
                              placeholder={PASSWORD_POLICY_PLACEHOLDER}
                              revealLabel="임시 비밀번호 보기"
                              hideLabel="임시 비밀번호 숨기기"
                            />
                          </label>
                          <label>
                            새 임시 비밀번호 확인
                            <PasswordField
                              visible={reveals.memberResetPassword.confirmPassword.visible}
                              onVisibleChange={() => reveals.memberResetPassword.confirmPassword.toggle()}
                              value={account.passwordResetForm.confirmPassword}
                              onChange={(event) =>
                                setPasswordResetField("confirmPassword", event.target.value)
                              }
                              placeholder="한 번 더 입력"
                              revealLabel="임시 비밀번호 확인 보기"
                              hideLabel="임시 비밀번호 확인 숨기기"
                            />
                          </label>
                        </div>
                        <div className="button-row">
                          <button
                            onClick={() =>
                              void actions.resetOrganizationMemberPassword(
                                member.membershipId,
                                account.submitMemberPasswordReset
                              )
                            }
                          >
                            임시 비밀번호 저장
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={account.cancelPasswordReset}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="empty">등록된 작업공간 사용자가 없습니다.</div>
            )}
          </div>
        </>
      ) : (
        <div className="helper-box-stack">
          <strong>사용자 관리 권한 없음</strong>
          <span>관리자만 사용자를 관리할 수 있습니다.</span>
        </div>
      )}
    </Panel>
  );
}
