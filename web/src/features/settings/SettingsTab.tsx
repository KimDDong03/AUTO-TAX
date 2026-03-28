import type React from "react";
import { Panel, RevealIcon, SetupPanel } from "../../components/ui";
import type { OrganizationMemberSummary } from "../../types";

type SettingsSectionId = "gmail" | "popbill" | "account";
type SettingsTabProps = {
  settingsSections: Array<{ id: SettingsSectionId; step: number; title: string; done: boolean; summary: string }>;
  activeSettingsSection: SettingsSectionId;
  setupPendingCount: number;
  settingsAutosaveState: "idle" | "pending" | "saving" | "saved" | "error";
  settingsAutosaveLabel: string;
  customerRegistrationReady: boolean;
  customerCount: number;
  busyKey: string | null;
  isMailTesting: boolean;
  settingsHealth: { mailReady: boolean; popbillReady: boolean; operatorReady: boolean };
  settingsForm: any;
  revealedFields: Record<string, boolean>;
  mailPasswordConfigured: boolean;
  popbillSharedPasswordConfigured: boolean;
  detectedMailProviderLabel: string;
  canManageOrganizationMembers: boolean;
  organizationMembers: OrganizationMemberSummary[];
  currentUserId: string | null;
  passwordResetTarget: any;
  passwordChangeForm: any;
  passwordResetForm: any;
  organizationMemberForm: any;
  setActiveSettingsSection: React.Dispatch<React.SetStateAction<SettingsSectionId>>;
  setSettingsForm: React.Dispatch<React.SetStateAction<any>>;
  setPasswordChangeForm: React.Dispatch<React.SetStateAction<any>>;
  setPasswordResetForm: React.Dispatch<React.SetStateAction<any>>;
  setOrganizationMemberForm: React.Dispatch<React.SetStateAction<any>>;
  onMailAddressChange: (value: string) => void;
  toggleRevealField: (fieldKey: string) => void;
  refreshAllCertificateStatuses: () => Promise<void>;
  testMailSettings: () => Promise<void>;
  loadCurrentPopbillSharedPassword: () => Promise<void>;
  changePassword: () => Promise<void>;
  createOrganizationMember: () => Promise<void>;
  openMemberPasswordReset: (member: OrganizationMemberSummary) => void;
  removeOrganizationMember: (member: OrganizationMemberSummary) => Promise<void>;
  submitPasswordReset: () => Promise<void>;
  cancelPasswordReset: () => void;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  getWorkspaceMemberRoleLabel: (role: OrganizationMemberSummary["role"]) => string;
  formatDateTime: (value: string | null) => string;
};

export function SettingsTab(props: SettingsTabProps) {
  return (
    <div className="settings-layout">
      <aside className="settings-sidebar-stack">
        <section className="panel settings-sidebar-panel">
          <header className="panel-header settings-sidebar-header">
            <div>
              <h2>처음 설정 순서</h2>
            </div>
            <span className={`chip ${props.setupPendingCount === 0 ? "chip-success" : "chip-warn"}`}>
              {props.setupPendingCount === 0 ? "준비 완료" : `${props.setupPendingCount}개 남음`}
            </span>
          </header>
          <div className="settings-step-list">
            {props.settingsSections.map((section) => (
              <button
                key={section.id}
                className={props.activeSettingsSection === section.id ? "settings-step-card active" : "settings-step-card"}
                onClick={() => props.setActiveSettingsSection(section.id)}
              >
                <div className="settings-step-head">
                  <span className="setup-order">{section.step}</span>
                  <div className="settings-step-copy">
                    <strong>{section.title}</strong>
                    <span>{section.summary}</span>
                  </div>
                </div>
                <span className={`chip ${section.done ? "chip-success" : "chip-danger"}`}>{section.done ? "완료" : "입력 필요"}</span>
              </button>
            ))}
          </div>
          {props.activeSettingsSection !== "account" ? (
            <div className="settings-sidebar-actions settings-sidebar-actions-passive">
              <span
                className={
                  props.settingsAutosaveState === "error"
                    ? "chip chip-danger"
                    : props.settingsAutosaveState === "saving"
                      ? "chip chip-warn"
                      : "chip chip-success"
                }
              >
                {props.settingsAutosaveLabel}
              </span>
            </div>
          ) : null}
          <div className="settings-inline-note">
            <strong>{props.customerRegistrationReady ? `고객 ${props.customerCount}명 등록됨` : "고객 등록이 필요합니다."}</strong>
            <span>설정을 마치면 고객관리에서 고객을 등록하고 메일 동기화 테스트를 진행하면 됩니다.</span>
            <button className="btn-secondary" onClick={() => void props.runAction("refresh-certificates", props.refreshAllCertificateStatuses)}>인증서 일괄 점검</button>
          </div>
        </section>
      </aside>

      <div className="settings-detail">
        {props.activeSettingsSection === "gmail" ? (
          <SetupPanel
            step={1}
            className="panel-settings-mail"
            title="메일 연결"
            done={props.settingsHealth.mailReady}
            note="한전 메일을 읽고 알림을 보내는 메일 계정을 연결합니다."
            actions={
              <button disabled={props.busyKey !== null} onClick={() => void props.runAction("mail-test", props.testMailSettings, { reload: false })}>
                {props.isMailTesting ? "메일 연결 확인 중..." : "메일 연결 테스트"}
              </button>
            }
          >
            {props.isMailTesting ? (
              <div className="settings-action-feedback">
                <span className="chip chip-warn">테스트 중</span>
                <span>IMAP/SMTP 연결을 확인하고 있습니다.</span>
              </div>
            ) : null}
            <div className="form-grid">
              <div className="settings-detected-provider full">
                <span>메일 수집 범위</span>
                <strong>최근 1000통 기준으로 바로 연동</strong>
                <p className="settings-inline-help">기존 메일까지 함께 읽고, 이미 처리한 달은 초기 등록의 월별 완료 처리에서 제외합니다.</p>
              </div>
              <div className="settings-detected-provider full">
                <span>감지된 메일 서비스</span>
                <strong>{props.detectedMailProviderLabel}</strong>
              </div>
              <label>
                메일 주소
                <input placeholder="example@mail.com" value={props.settingsForm.mailAddress} onChange={(event) => props.onMailAddressChange(event.target.value)} />
                <span className="field-hint">한전 메일을 읽고 알림 메일을 보낼 때 함께 사용하는 주소입니다. 도메인을 보고 서비스가 자동 감지됩니다.</span>
              </label>
              <label>
                앱 비밀번호
                <div className="password-field">
                  <input
                    type={props.revealedFields.mailPassword ? "text" : "password"}
                    value={props.settingsForm.mailPassword}
                    onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, mailPassword: event.target.value })}
                    placeholder={props.mailPasswordConfigured ? "변경할 때만 다시 입력" : "앱 비밀번호 입력"}
                  />
                  <button type="button" className="password-toggle" aria-label={props.revealedFields.mailPassword ? "앱 비밀번호 숨기기" : "앱 비밀번호 보기"} onClick={() => props.toggleRevealField("mailPassword")}>
                    <RevealIcon open={Boolean(props.revealedFields.mailPassword)} />
                  </button>
                </div>
                <span className="field-hint">
                  {props.mailPasswordConfigured
                    ? "이미 저장된 앱 비밀번호가 있습니다. 바꿀 때만 다시 입력하세요. 테스트 연결 시 빈칸이면 서버에 저장된 값을 사용합니다."
                    : "위 메일 주소로 로그인할 때 쓰는 비밀번호입니다. 수신/발신 모두 이 값을 사용합니다."}
                </span>
              </label>
              <label className="full">
                알림 수신 메일
                <textarea rows={4} value={props.settingsForm.notificationEmailsText} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, notificationEmailsText: event.target.value })} />
                <span className="field-hint">파싱 실패나 발행 실패 알림을 받을 주소입니다. 여러 개면 줄바꿈이나 쉼표로 구분합니다.</span>
              </label>
              <div className="helper-box full">
                <strong>월 자동 처리</strong>
                <div className="fields three-column">
                  <label>
                    자동 실행
                    <select value={props.settingsForm.schedulerEnabled ? "on" : "off"} onChange={(event) => props.setSettingsForm((prev: any) => prev ? { ...prev, schedulerEnabled: event.target.value === "on" } : prev)}>
                      <option value="on">사용</option>
                      <option value="off">중지</option>
                    </select>
                  </label>
                  <label>
                    실행일
                    <input type="number" min="1" max="31" value={props.settingsForm.defaultIssueDay} onChange={(event) => props.setSettingsForm((prev: any) => (prev ? { ...prev, defaultIssueDay: event.target.value } : prev))} />
                  </label>
                  <label>
                    실행 시각
                    <div className="inline-time-fields">
                      <input type="number" min="0" max="23" value={props.settingsForm.defaultIssueHour} onChange={(event) => props.setSettingsForm((prev: any) => (prev ? { ...prev, defaultIssueHour: event.target.value } : prev))} />
                      <span>:</span>
                      <input type="number" min="0" max="59" value={props.settingsForm.defaultIssueMinute} onChange={(event) => props.setSettingsForm((prev: any) => (prev ? { ...prev, defaultIssueMinute: event.target.value } : prev))} />
                    </div>
                  </label>
                </div>
                <span>기본값은 매월 26일입니다. 이 시각이 되면 메일을 자동으로 읽고, 자동 발행 고객은 바로 전자세금계산서를 발행합니다.</span>
              </div>
            </div>
          </SetupPanel>
        ) : null}

        {props.activeSettingsSection === "popbill" ? (
          <SetupPanel
            step={2}
            className="panel-settings-popbill"
            title="팝빌 기본값"
            done={props.settingsHealth.popbillReady && props.settingsHealth.operatorReady}
            note="고객사에서 직접 관리해야 하는 발행 기본값만 입력합니다."
          >
            <div className="settings-field-stack">
              <section className="settings-field-group">
                <div className="settings-field-group-head">
                  <strong>작업공간별 운영값</strong>
                  <span>신규 고객 팝빌 계정 생성과 발행 처리에 쓰는 기본값입니다.</span>
                </div>
                <div className="fields two-column">
                  <label>
                    팝빌 사용자 ID 접두어
                    <input value={props.settingsForm.popbillUserIdPrefix} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, popbillUserIdPrefix: event.target.value })} placeholder="예: TEST_" />
                    <span className="field-hint">신규 고객 팝빌 ID를 만들 때 앞에 붙는 값입니다. 예: `TEST_001` · 다른 고객사와 중복되면 저장할 수 없습니다.</span>
                  </label>
                  <label className="settings-field-full-width">
                    신규 고객 기본 비밀번호
                    <div className="password-field">
                      <input
                        type={props.revealedFields.popbillSharedPassword ? "text" : "password"}
                        value={props.settingsForm.popbillSharedPassword}
                        onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, popbillSharedPassword: event.target.value })}
                        placeholder={props.popbillSharedPasswordConfigured ? "변경할 때만 다시 입력" : "신규 고객 공통 비밀번호"}
                      />
                      <button type="button" className="password-toggle" aria-label={props.revealedFields.popbillSharedPassword ? "팝빌 기본 비밀번호 숨기기" : "팝빌 기본 비밀번호 보기"} onClick={() => props.toggleRevealField("popbillSharedPassword")}>
                        <RevealIcon open={Boolean(props.revealedFields.popbillSharedPassword)} />
                      </button>
                    </div>
                    <div className="field-meta-row">
                      <span className="field-hint">
                        {props.popbillSharedPasswordConfigured
                          ? "이미 저장된 기본 비밀번호가 있습니다. 변경하거나 확인하려면 불러오기를 누르세요."
                          : "신규 고객 팝빌 계정을 만들 때 초기 비밀번호로 사용합니다."}
                      </span>
                      {props.popbillSharedPasswordConfigured ? (
                        <div className="field-action-row">
                          <button type="button" className="btn-secondary field-inline-action" disabled={props.busyKey !== null} onClick={() => void props.runAction("load-popbill-shared-password", props.loadCurrentPopbillSharedPassword, { reload: false })}>
                            저장된 비밀번호 불러오기
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <label>
                    운영 담당자명
                    <input value={props.settingsForm.operatorContactName} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, operatorContactName: event.target.value })} placeholder="담당자 이름" />
                  </label>
                  <label>
                    운영 담당자 이메일
                    <input type="email" value={props.settingsForm.operatorContactEmail} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, operatorContactEmail: event.target.value })} placeholder="operator@example.com" />
                  </label>
                  <label>
                    운영 담당자 연락처
                    <input value={props.settingsForm.operatorContactTel} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, operatorContactTel: event.target.value })} placeholder="01012345678" />
                  </label>
                </div>
                <div className="helper-box full">
                  <strong>현재 상태</strong>
                  <span>팝빌 연결: {props.settingsHealth.popbillReady ? "준비됨" : "설정 필요"}</span>
                  <span>작업공간 운영값: {props.settingsHealth.operatorReady ? "준비됨" : "설정 필요"}</span>
                </div>
              </section>
            </div>
          </SetupPanel>
        ) : null}

        {props.activeSettingsSection === "account" ? (
          <div className="settings-account-stack">
            <Panel
              title="비밀번호 변경"
              subtitle="현재 로그인한 계정의 비밀번호를 바꿉니다."
              actions={<button onClick={() => void props.runAction("change-password", props.changePassword, { reload: false })}>비밀번호 변경</button>}
            >
              <div className="form-grid">
                <label>
                  새 비밀번호
                  <div className="password-field">
                    <input type={props.revealedFields.nextPassword ? "text" : "password"} value={props.passwordChangeForm.nextPassword} onChange={(event) => props.setPasswordChangeForm((prev: any) => ({ ...prev, nextPassword: event.target.value }))} placeholder="8자 이상 입력" />
                    <button type="button" className="password-toggle" aria-label={props.revealedFields.nextPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"} onClick={() => props.toggleRevealField("nextPassword")}>
                      <RevealIcon open={Boolean(props.revealedFields.nextPassword)} />
                    </button>
                  </div>
                </label>
                <label>
                  새 비밀번호 확인
                  <div className="password-field">
                    <input type={props.revealedFields.confirmPassword ? "text" : "password"} value={props.passwordChangeForm.confirmPassword} onChange={(event) => props.setPasswordChangeForm((prev: any) => ({ ...prev, confirmPassword: event.target.value }))} placeholder="한 번 더 입력" />
                    <button type="button" className="password-toggle" aria-label={props.revealedFields.confirmPassword ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"} onClick={() => props.toggleRevealField("confirmPassword")}>
                      <RevealIcon open={Boolean(props.revealedFields.confirmPassword)} />
                    </button>
                  </div>
                  <span className="field-hint">새 비밀번호는 8자 이상으로 입력하고, 두 칸이 정확히 같아야 저장됩니다.</span>
                </label>
              </div>
            </Panel>

            <Panel
              title="작업공간 사용자 관리"
              subtitle={props.canManageOrganizationMembers ? "owner가 같은 회사 내부 사용자를 추가하거나 제거할 수 있습니다." : "현재 계정은 사용자 관리 권한이 없습니다."}
              actions={props.canManageOrganizationMembers ? <button onClick={() => void props.runAction("create-organization-member", props.createOrganizationMember, { reload: false })}>사용자 추가</button> : null}
            >
              {props.canManageOrganizationMembers ? (
                <>
                  <div className="form-grid">
                    <label>
                      로그인 아이디
                      <input value={props.organizationMemberForm.loginId} onChange={(event) => props.setOrganizationMemberForm((prev: any) => ({ ...prev, loginId: event.target.value }))} placeholder="예: team01" />
                    </label>
                    <label>
                      이름
                      <input value={props.organizationMemberForm.displayName} onChange={(event) => props.setOrganizationMemberForm((prev: any) => ({ ...prev, displayName: event.target.value }))} placeholder="표시 이름" />
                    </label>
                    <label className="full">
                      임시 비밀번호
                      <div className="password-field">
                        <input type={props.revealedFields.organizationMemberPassword ? "text" : "password"} value={props.organizationMemberForm.password} onChange={(event) => props.setOrganizationMemberForm((prev: any) => ({ ...prev, password: event.target.value }))} placeholder="기존 계정이면 비워두고, 새 계정이면 8자 이상 입력" />
                        <button type="button" className="password-toggle" aria-label={props.revealedFields.organizationMemberPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"} onClick={() => props.toggleRevealField("organizationMemberPassword")}>
                          <RevealIcon open={Boolean(props.revealedFields.organizationMemberPassword)} />
                        </button>
                      </div>
                      <span className="field-hint">이미 존재하는 로그인 아이디면 현재 계정을 멤버로 연결하고, 처음 만드는 로그인 아이디면 임시 비밀번호가 필요합니다.</span>
                      <span className="field-hint">같은 회사에서 쓸 로그인 아이디입니다. 영어, 숫자, `.`, `_`, `-`만 권장합니다.</span>
                    </label>
                  </div>
                  <div className="helper-box">
                    <strong>현재 사용자 {props.organizationMembers.length}명</strong>
                    <span>소유자(owner)는 여기서 삭제할 수 없습니다.</span>
                  </div>

                  <div className="workspace-member-list">
                    {props.organizationMembers.length > 0 ? (
                      props.organizationMembers.map((member) => {
                        const isCurrentUser = member.userId === props.currentUserId;
                        const isOwner = member.role === "owner";
                        const canRemove = !isOwner && !isCurrentUser;
                        const canResetPassword = !isOwner;
                        const isResetTarget = props.passwordResetTarget?.kind === "member" && props.passwordResetTarget.membershipId === member.membershipId;

                        return (
                          <article key={member.membershipId} className="workspace-member-card">
                            <div className="workspace-member-card-head">
                              <div>
                                <strong>{member.displayName || member.loginId || "이름 없음"}</strong>
                                <span>{member.loginId || "로그인 아이디 없음"}</span>
                              </div>
                              <span className={isOwner ? "chip chip-success" : "chip"}>{props.getWorkspaceMemberRoleLabel(member.role)}</span>
                            </div>
                            <div className="workspace-member-card-meta">
                              <span>등록일 {props.formatDateTime(member.createdAt)}</span>
                              {isCurrentUser ? <span>현재 로그인 계정</span> : null}
                            </div>
                            <div className="workspace-member-card-actions">
                              {canResetPassword ? (
                                <button className="btn-secondary" disabled={props.busyKey !== null} onClick={() => props.openMemberPasswordReset(member)}>
                                  임시 비밀번호 재설정
                                </button>
                              ) : null}
                              {canRemove ? (
                                <button className="btn-secondary btn-danger" disabled={props.busyKey !== null} onClick={() => void props.runAction(`remove-organization-member-${member.membershipId}`, async () => props.removeOrganizationMember(member), { reload: false })}>
                                  제거
                                </button>
                              ) : (
                                <span className="field-hint">{isOwner ? "owner 계정 비밀번호는 플랫폼 관리자 탭에서 재설정합니다." : "현재 로그인한 계정입니다."}</span>
                              )}
                            </div>
                            {isResetTarget ? (
                              <div className="helper-box-stack inline-password-reset">
                                <strong>{member.loginId ?? "선택한 사용자"} 임시 비밀번호 재설정</strong>
                                <div className="form-grid">
                                  <label>
                                    새 임시 비밀번호
                                    <div className="password-field">
                                      <input type={props.revealedFields.memberResetNextPassword ? "text" : "password"} value={props.passwordResetForm.nextPassword} onChange={(event) => props.setPasswordResetForm((prev: any) => ({ ...prev, nextPassword: event.target.value }))} placeholder="8자 이상 입력" />
                                      <button type="button" className="password-toggle" aria-label={props.revealedFields.memberResetNextPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"} onClick={() => props.toggleRevealField("memberResetNextPassword")}>
                                        <RevealIcon open={Boolean(props.revealedFields.memberResetNextPassword)} />
                                      </button>
                                    </div>
                                  </label>
                                  <label>
                                    새 임시 비밀번호 확인
                                    <div className="password-field">
                                      <input type={props.revealedFields.memberResetConfirmPassword ? "text" : "password"} value={props.passwordResetForm.confirmPassword} onChange={(event) => props.setPasswordResetForm((prev: any) => ({ ...prev, confirmPassword: event.target.value }))} placeholder="한 번 더 입력" />
                                      <button type="button" className="password-toggle" aria-label={props.revealedFields.memberResetConfirmPassword ? "임시 비밀번호 확인 숨기기" : "임시 비밀번호 확인 보기"} onClick={() => props.toggleRevealField("memberResetConfirmPassword")}>
                                        <RevealIcon open={Boolean(props.revealedFields.memberResetConfirmPassword)} />
                                      </button>
                                    </div>
                                  </label>
                                </div>
                                <div className="button-row">
                                  <button onClick={() => void props.runAction(`reset-member-password-${member.membershipId}`, props.submitPasswordReset, { reload: false })}>
                                    임시 비밀번호 저장
                                  </button>
                                  <button type="button" className="btn-secondary" onClick={props.cancelPasswordReset}>
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
                  <span>이 작업공간의 owner만 회사 내부 사용자를 추가하거나 제거할 수 있습니다.</span>
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  );
}

