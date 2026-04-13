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
  renewalCertificatePasswordConfigured: boolean;
  renewalIssuePasswordConfigured: boolean;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalAssistantCheckedAt: string | null;
  customerRenewalLoadedCertificateCount: number;
  renewalHelperDownloadUrl: string;
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
  onRenewalIssuePasswordChange: (value: string) => void;
  toggleRevealField: (fieldKey: string) => void;
  refreshAllCertificateStatuses: () => Promise<void>;
  testMailSettings: () => Promise<void>;
  loadCurrentPopbillSharedPassword: () => Promise<void>;
  loadCurrentRenewalCertificatePassword: () => Promise<void>;
  loadCurrentRenewalIssuePassword: () => Promise<void>;
  refreshCustomerRenewalAssistant: () => Promise<void>;
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
  const nextSettingsSection = props.settingsSections.find((section) => !section.done)?.id ?? "account";
  const nextSettingsSectionLabel =
    nextSettingsSection === "gmail" ? "메일 연결" : nextSettingsSection === "popbill" ? "발행 기본값" : "계정 보안";

  return (
    <div className="settings-layout">
      <aside className="settings-sidebar-stack">
        <section className="panel settings-sidebar-panel">
          <header className="panel-header settings-sidebar-header">
            <div>
              <h2>작업공간 공통 설정</h2>
              <p className="settings-sidebar-purpose">도입 준비에서 막히지 않도록 메일, 발행 기본값, 로컬 헬퍼 같은 공통값을 보조로 관리합니다.</p>
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
            <div className="settings-inline-copy">
              <strong>
                {props.setupPendingCount === 0
                  ? "기본 설정을 모두 마쳤습니다."
                  : `지금은 ${nextSettingsSectionLabel}부터 마무리하세요.`}
              </strong>
              <span>
                {props.customerRegistrationReady
                  ? `등록 고객 ${props.customerCount}명 기준으로 설정이 적용됩니다.`
                  : "실제 순서 진행은 도입 준비 탭에서 이어가고, 이 화면은 필요한 설정만 보조로 수정하면 됩니다."}
              </span>
            </div>
            <div className="button-row settings-inline-actions">
              <button type="button" onClick={() => props.setActiveSettingsSection(nextSettingsSection)}>
                {nextSettingsSectionLabel} 열기
              </button>
              <button className="btn-secondary" onClick={() => void props.runAction("refresh-certificates", props.refreshAllCertificateStatuses)}>
                인증서 일괄 점검
              </button>
            </div>
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
            note="한전 메일 계정을 연결하고 테스트합니다. 실제 첫 메일 동기화는 도입 준비 단계에서 나중에 실행합니다."
            actions={
              <button disabled={props.busyKey !== null} onClick={() => void props.runAction("mail-test", props.testMailSettings, { reload: false })}>
                {props.isMailTesting ? "연결 테스트 중..." : "메일 연결 테스트"}
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
                <span>첫 동기화 시 읽는 기본 범위</span>
                <strong>최근 메일 1000통</strong>
                <p className="settings-inline-help">이 단계는 테스트만 하고, 실제 메일 수집은 도입 준비 단계에서 별도로 실행합니다.</p>
              </div>
              <div className="settings-detected-provider full">
                <span>자동으로 찾은 메일 서비스</span>
                <strong>{props.detectedMailProviderLabel}</strong>
              </div>
              <label>
                메일 주소
                <input placeholder="example@mail.com" value={props.settingsForm.mailAddress} onChange={(event) => props.onMailAddressChange(event.target.value)} />
                <span className="field-hint">한전 메일을 읽고 알림 메일을 보낼 때 함께 사용할 계정입니다. 도메인을 보고 서비스가 자동 감지됩니다.</span>
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
                    : "위 메일 주소로 로그인할 때 쓰는 앱 비밀번호입니다. 수신/발신 모두 이 값을 사용합니다."}
                </span>
              </label>
              <label className="full">
                알림 수신 메일
                <textarea rows={4} value={props.settingsForm.notificationEmailsText} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, notificationEmailsText: event.target.value })} />
                <span className="field-hint">파싱 실패나 발행 실패 알림을 받을 주소입니다. 여러 개면 줄바꿈이나 쉼표로 구분합니다.</span>
              </label>
              <details className="settings-advanced-panel full">
                <summary>월 자동 발행 일정은 나중에 보기</summary>
                <div className="helper-box">
                  <strong>매달 자동 실행 일정</strong>
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
                  <span>기본값은 매월 26일입니다. 이 일정이 되면 메일을 읽고, 자동 발행 고객은 바로 세금계산서를 발행합니다.</span>
                </div>
              </details>
            </div>
          </SetupPanel>
        ) : null}

        {props.activeSettingsSection === "popbill" ? (
          <SetupPanel
            step={2}
            className="panel-settings-popbill"
            title="발행 기본값"
            done={props.settingsHealth.popbillReady && props.settingsHealth.operatorReady}
            note="신규 고객 생성과 첫 발행 준비에 필요한 작업공간 공통값입니다."
          >
            <div className="settings-field-stack">
              <section className="settings-field-group">
                <div className="settings-field-group-head">
                  <strong>고객 생성과 발행에 쓰는 공통값</strong>
                  <span>팝빌 접두어, 담당자 정보, 기본 비밀번호를 먼저 정리합니다.</span>
                </div>
                <div className="settings-defaults-grid">
                  <label className="settings-defaults-cell">
                    팝빌 접두어
                    <input value={props.settingsForm.popbillUserIdPrefix} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, popbillUserIdPrefix: event.target.value })} placeholder="예: TEST_" />
                    <span className="field-hint">예: `TEST_001` · 신규 고객 팝빌 아이디 앞에 붙고, 다른 작업공간과 겹치면 저장할 수 없습니다.</span>
                  </label>
                  <label className="settings-defaults-cell">
                    담당자 이름
                    <input value={props.settingsForm.operatorContactName} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, operatorContactName: event.target.value })} placeholder="담당자 이름" />
                  </label>
                  <label className="settings-defaults-cell">
                    담당자 연락처
                    <input value={props.settingsForm.operatorContactTel} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, operatorContactTel: event.target.value })} placeholder="01012345678" />
                  </label>
                  <label className="settings-defaults-cell">
                    담당자 이메일
                    <input type="email" value={props.settingsForm.operatorContactEmail} onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, operatorContactEmail: event.target.value })} placeholder="operator@example.com" />
                  </label>
                  <label className="settings-defaults-cell">
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
                          ? "이미 저장된 값이 있습니다. 필요하면 불러오세요."
                          : "신규 고객 계정 초기 비밀번호"}
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
                  <label className="settings-defaults-cell">
                    공동인증서 발급용 임시번호
                    <div className="password-field">
                      <input
                        type={props.revealedFields.renewalIssuePassword ? "text" : "password"}
                        value={props.settingsForm.renewalIssuePassword}
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(event) => props.onRenewalIssuePasswordChange(event.target.value)}
                        placeholder={props.renewalIssuePasswordConfigured ? "변경할 때만 다시 입력" : "숫자 6자리 입력"}
                      />
                      <button type="button" className="password-toggle" aria-label={props.revealedFields.renewalIssuePassword ? "발급용 임시번호 숨기기" : "발급용 임시번호 보기"} onClick={() => props.toggleRevealField("renewalIssuePassword")}>
                        <RevealIcon open={Boolean(props.revealedFields.renewalIssuePassword)} />
                      </button>
                    </div>
                    <div className="field-meta-row">
                      <span className="field-hint">
                        {props.renewalIssuePasswordConfigured
                          ? "공동인증서 신청 및 갱신 신청용 6자리입니다. 필요하면 불러오세요."
                          : "공동인증서 신청 및 갱신 신청용 6자리"}
                      </span>
                      {props.renewalIssuePasswordConfigured ? (
                        <div className="field-action-row">
                          <button type="button" className="btn-secondary field-inline-action" disabled={props.busyKey !== null} onClick={() => void props.runAction("load-renewal-issue-password", props.loadCurrentRenewalIssuePassword, { reload: false })}>
                            저장된 임시번호 불러오기
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <label className="settings-defaults-cell settings-defaults-cell-span-2">
                    인증서 공통 비밀번호 (선택)
                    <div className="password-field">
                      <input
                        type={props.revealedFields.renewalCertificatePassword ? "text" : "password"}
                        value={props.settingsForm.renewalCertificatePassword}
                        onChange={(event) => props.setSettingsForm((prev: any) => prev && { ...prev, renewalCertificatePassword: event.target.value })}
                        placeholder={props.renewalCertificatePasswordConfigured ? "변경할 때만 다시 입력" : "선택 입력"}
                      />
                      <button type="button" className="password-toggle" aria-label={props.revealedFields.renewalCertificatePassword ? "공동인증서 공통 비밀번호 숨기기" : "공동인증서 공통 비밀번호 보기"} onClick={() => props.toggleRevealField("renewalCertificatePassword")}>
                        <RevealIcon open={Boolean(props.revealedFields.renewalCertificatePassword)} />
                      </button>
                    </div>
                    <div className="field-meta-row">
                      <span className="field-hint">
                        {props.renewalCertificatePasswordConfigured
                          ? "이미 저장된 값이 있습니다. 필요하면 불러오세요. 엑셀 비밀번호 칸이 비면 이 값을 씁니다."
                          : "비밀번호가 모두 같을 때만 사용합니다. 엑셀 비밀번호 칸이 비면 이 값을 씁니다."}
                      </span>
                      {props.renewalCertificatePasswordConfigured ? (
                        <div className="field-action-row">
                          <button type="button" className="btn-secondary field-inline-action" disabled={props.busyKey !== null} onClick={() => void props.runAction("load-renewal-certificate-password", props.loadCurrentRenewalCertificatePassword, { reload: false })}>
                            저장된 비밀번호 불러오기
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <div className="settings-defaults-status">
                    <strong>입력 상태</strong>
                    <span>팝빌 연결: {props.settingsHealth.popbillReady ? "준비됨" : "설정 필요"}</span>
                    <span>작업공간 운영값: {props.settingsHealth.operatorReady ? "준비됨" : "설정 필요"}</span>
                  </div>
                </div>
              </section>

              <section className="settings-field-group">
                <div className="settings-field-group-head">
                  <strong>로컬 헬퍼 준비</strong>
                  <span>엑셀 양식 다운로드 전에 현재 PC의 공동인증서 읽기 상태를 먼저 확인합니다.</span>
                </div>
                <div className="helper-box-stack settings-helper-status-card">
                  <div className="settings-helper-status-head">
                    <div className="settings-helper-status-meta">
                      <span className={props.customerRenewalAssistantOnline ? "chip chip-success" : "chip chip-danger"}>
                        {props.customerRenewalAssistantOnline ? "연결됨" : "연결 안 됨"}
                      </span>
                      {props.customerRenewalAssistantHelperVersion ? <span className="chip">v{props.customerRenewalAssistantHelperVersion}</span> : null}
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => window.location.assign(props.renewalHelperDownloadUrl)}
                      >
                        헬퍼 다운로드
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={props.busyKey !== null}
                        onClick={() => void props.runAction("refresh-customer-renewal-helper", props.refreshCustomerRenewalAssistant, { reload: false })}
                      >
                        상태 다시 확인
                      </button>
                    </div>
                  </div>
                  <span>상태 메시지: {props.customerRenewalAssistantHelperMessage}</span>
                  <span>마지막 확인: {props.formatDateTime(props.customerRenewalAssistantCheckedAt)}</span>
                  <span>현재 읽은 공동인증서: {props.customerRenewalLoadedCertificateCount}건</span>
                </div>
                <details className="settings-advanced-panel">
                  <summary>설치 안내와 세부 정보 보기</summary>
                  <div className="helper-box-stack settings-install-guide">
                    <strong>설치 안내</strong>
                    <span>
                      고객 PC에서는 위 <code>헬퍼 다운로드</code>로 받은 <code>renewal-local-helper</code> 압축을 푼 뒤 <code>scripts\renewal-helper-install.cmd</code>를 한 번 실행하면 됩니다.
                    </span>
                    <span>설치 직후 바로 시작되고, 이후에는 Windows 로그인 시 자동으로 다시 실행됩니다.</span>
                    <span>
                      문제가 생기면 바탕화면의 <code>AUTO-TAX Helper Status</code>, <code>AUTO-TAX Helper Start</code>, <code>AUTO-TAX Helper Stop</code> 바로가기로 확인할 수 있습니다.
                    </span>
                    <span>자동실행만 꺼도 Start / Stop / Status 바로가기는 그대로 남습니다.</span>
                  </div>
                </details>
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
              subtitle={props.canManageOrganizationMembers ? "owner만 회사 내부 사용자를 추가하거나 제거합니다." : "현재 계정은 사용자 관리 권한이 없습니다."}
              actions={props.canManageOrganizationMembers ? <button onClick={() => void props.runAction("create-organization-member", props.createOrganizationMember, { reload: false })}>사용자 추가</button> : null}
            >
              {props.canManageOrganizationMembers ? (
                <>
                  <div className="helper-box workspace-member-summary">
                    <strong>현재 사용자 {props.organizationMembers.length}명</strong>
                    <span>owner는 여기서 제거할 수 없습니다.</span>
                  </div>

                  <div className="workspace-member-create-box">
                    <div className="workspace-member-create-grid">
                      <label>
                        로그인 아이디
                        <input value={props.organizationMemberForm.loginId} onChange={(event) => props.setOrganizationMemberForm((prev: any) => ({ ...prev, loginId: event.target.value }))} placeholder="예: team01" />
                      </label>
                      <label>
                        이름
                        <input value={props.organizationMemberForm.displayName} onChange={(event) => props.setOrganizationMemberForm((prev: any) => ({ ...prev, displayName: event.target.value }))} placeholder="표시 이름" />
                      </label>
                      <label>
                        임시 비밀번호
                        <div className="password-field">
                          <input type={props.revealedFields.organizationMemberPassword ? "text" : "password"} value={props.organizationMemberForm.password} onChange={(event) => props.setOrganizationMemberForm((prev: any) => ({ ...prev, password: event.target.value }))} placeholder="새 계정이면 8자 이상" />
                          <button type="button" className="password-toggle" aria-label={props.revealedFields.organizationMemberPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"} onClick={() => props.toggleRevealField("organizationMemberPassword")}>
                            <RevealIcon open={Boolean(props.revealedFields.organizationMemberPassword)} />
                          </button>
                        </div>
                      </label>
                    </div>
                    <div className="workspace-member-create-note">
                      <span>기존 로그인 아이디면 현재 계정을 멤버로 연결합니다.</span>
                      <span>새 로그인 아이디면 임시 비밀번호 8자 이상이 필요합니다.</span>
                    </div>
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
