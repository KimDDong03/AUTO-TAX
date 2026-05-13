import React from "react";
import { RevealIcon, StatusBadge, type StatusBadgeTone } from "../../components/ui";
import { SettingsAccountSection } from "./SettingsAccountSection";
import { SettingsDefaultsSection } from "./SettingsDefaultsSection";
import { SettingsHelperSection } from "./SettingsHelperSection";
import type {
  SettingsSidebarModel,
  SettingsTabSectionsModel
} from "./settingsSectionModels";

export type SettingsTabModel = {
  context: {
    userLabel: string;
    workspaceLabel: string;
    popbillModeLabel: string;
  };
  sidebar: SettingsSidebarModel;
  sections: SettingsTabSectionsModel;
};

type SettingsTabProps = {
  model: SettingsTabModel;
};

function parseProgressText(progressText: string) {
  const match = progressText.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;

  const completed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return {
    completed: Math.min(Math.max(completed, 0), total),
    total
  };
}

function getAutosaveBadgeTone(state: SettingsSidebarModel["settingsAutosaveState"]): StatusBadgeTone {
  return state === "error"
    ? "danger"
    : state === "saving" || state === "pending"
      ? "warn"
      : "success";
}

function SettingsReadinessSummary({ model }: SettingsTabProps) {
  const sidebar = model.sidebar;
  const onboarding = model.sections.account.onboarding;
  const parsedProgress = parseProgressText(onboarding.progressText);
  const fallbackTotal = sidebar.settingsSections.length;
  const completed =
    parsedProgress?.completed ??
    sidebar.settingsSections.filter((section) => section.done).length;
  const total = parsedProgress?.total ?? fallbackTotal;
  const incomplete = Math.max(total - completed, 0);
  const reviewCount = sidebar.settingsSections.filter((section) => !section.done).length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const helperCheckedAt = model.sections.helper.helperStatus.checkedAt;
  const lastUpdate = helperCheckedAt
    ? model.sections.helper.helperStatus.formatDateTime(helperCheckedAt)
    : sidebar.settingsAutosaveLabel;

  return (
    <section className="settings-option1-card settings-option1-status-card">
      <div className="settings-option1-status-title">
        <strong>설정 준비 상태</strong>
        <StatusBadge tone={getAutosaveBadgeTone(sidebar.settingsAutosaveState)}>
          {sidebar.settingsAutosaveLabel}
        </StatusBadge>
      </div>
      <div className="settings-option1-progress-row">
        <div className="settings-option1-progress-copy">
          <span>전체 진행률</span>
          <strong>
            {completed} / {total} 완료
          </strong>
          <div className="settings-option1-progress-track" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className="settings-option1-status-metrics">
          <div>
            <span>필수 완료</span>
            <strong>{completed}</strong>
          </div>
          <div>
            <span>확인 필요</span>
            <strong>{reviewCount}</strong>
          </div>
          <div>
            <span>미완료</span>
            <strong>{incomplete}</strong>
          </div>
          <div>
            <span>마지막 업데이트</span>
            <strong>{lastUpdate}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsOnboardingCard({ model }: SettingsTabProps) {
  const onboarding = model.sections.account.onboarding;

  return (
    <section className="settings-option1-card settings-option1-reopen-card">
      <strong>도입 준비 다시 열기</strong>
      <span>도입 준비를 다시 시작하거나 진행 상태를 확인할 수 있습니다.</span>
      <button type="button" onClick={onboarding.openOnboarding}>
        도입 준비 다시 열기
      </button>
    </section>
  );
}

function SettingsOption1MailDetail({ model }: SettingsTabProps) {
  const mail = model.sections.mail;
  const sidebar = model.sidebar;
  const [mailEditing, setMailEditing] = React.useState(false);
  const [mailDraft, setMailDraft] = React.useState(() => ({
    mailAddress: mail.fields.mailAddress,
    mailPassword: mail.fields.mailPassword,
    notificationEmailsText: mail.fields.notificationEmailsText
  }));

  React.useEffect(() => {
    if (mailEditing) {
      return;
    }

    setMailDraft({
      mailAddress: mail.fields.mailAddress,
      mailPassword: mail.fields.mailPassword,
      notificationEmailsText: mail.fields.notificationEmailsText
    });
  }, [
    mail.fields.mailAddress,
    mail.fields.mailPassword,
    mail.fields.notificationEmailsText,
    mailEditing
  ]);

  const startMailEdit = () => {
    setMailDraft({
      mailAddress: mail.fields.mailAddress,
      mailPassword: mail.fields.mailPassword,
      notificationEmailsText: mail.fields.notificationEmailsText
    });
    setMailEditing(true);
  };

  const cancelMailEdit = () => {
    setMailDraft({
      mailAddress: mail.fields.mailAddress,
      mailPassword: mail.fields.mailPassword,
      notificationEmailsText: mail.fields.notificationEmailsText
    });
    setMailEditing(false);
  };

  const saveMailEdit = async () => {
    const testSucceeded = await mail.onSaveAndTestMailSettings(mailDraft);
    if (testSucceeded) {
      setMailEditing(false);
    }
  };

  return (
    <div className="settings-option1-detail-grid">
      <section className="settings-option1-card settings-option1-mail-card panel-settings-mail">
        <div className="settings-option1-card-head">
          <div>
            <strong>메일 연결 설정</strong>
            <span>메일 주소와 앱 비밀번호만 입력합니다.</span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={mail.busyKey !== null || mailEditing}
            onClick={() => void mail.onRunMailSettingsTest()}
          >
            {mail.isMailTesting ? "테스트 중" : "연결 테스트"}
          </button>
        </div>

        {mail.isMailTesting ? (
          <div className="settings-action-feedback">
            <span className="chip chip-warn">테스트 중</span>
            <span>메일 계정 연결을 확인하고 있습니다.</span>
          </div>
        ) : null}

        <div className="settings-option1-form-grid">
          <label className="settings-option1-field">
            메일 계정
            <input
              placeholder="billing@company.co.kr"
              value={mailDraft.mailAddress}
              readOnly={!mailEditing}
              onChange={(event) =>
                setMailDraft((prev) => ({
                  ...prev,
                  mailAddress: event.target.value
                }))
              }
            />
          </label>
          <label className="settings-option1-field">
            앱 비밀번호
            <div className="password-field">
              <input
                type={mail.mailPasswordReveal.visible ? "text" : "password"}
                value={mailDraft.mailPassword}
                readOnly={!mailEditing}
                onChange={(event) =>
                  setMailDraft((prev) => ({
                    ...prev,
                    mailPassword: event.target.value
                  }))
                }
                placeholder={
                  mail.mailPasswordConfigured
                    ? "변경할 때만 다시 입력"
                    : "앱 비밀번호 입력"
                }
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={
                  mail.mailPasswordReveal.visible
                    ? "앱 비밀번호 숨기기"
                    : "앱 비밀번호 보기"
                }
                onClick={mail.mailPasswordReveal.toggle}
              >
                <RevealIcon open={mail.mailPasswordReveal.visible} />
              </button>
            </div>
          </label>
          <label className="settings-option1-field settings-option1-field-wide">
            알림 수신 메일
            <textarea
              rows={3}
              value={mailDraft.notificationEmailsText}
              readOnly={!mailEditing}
              onChange={(event) =>
                setMailDraft((prev) => ({
                  ...prev,
                  notificationEmailsText: event.target.value
                }))
              }
            />
            <span className="field-hint">비워두면 메일 계정으로 받습니다.</span>
          </label>
        </div>

        <div className="settings-option1-save-row">
          <span className="settings-option1-save-indicator">{mailEditing ? "수정 중" : "저장"}</span>
          <span className="settings-option1-save-copy">
            {mailEditing ? "수정 후 저장을 눌러 반영하세요." : `${sidebar.settingsAutosaveLabel}. 변경하려면 수정을 누르세요.`}
          </span>
          <div className="settings-option1-edit-actions">
            {mailEditing ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={mail.busyKey !== null}
                  onClick={cancelMailEdit}
                >
                  취소
                </button>
                <button type="button" disabled={mail.busyKey !== null} onClick={() => void saveMailEdit()}>
                  {mail.isMailTesting ? "테스트 중" : "저장"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                disabled={mail.busyKey !== null}
                onClick={startMailEdit}
              >
                수정
              </button>
            )}
          </div>
        </div>
      </section>

      <SettingsOption1AccountPanel model={model} />
    </div>
  );
}

function SettingsOption1AccountPanel({ model }: SettingsTabProps) {
  const accountSection = model.sections.account;
  const account = accountSection.account;
  const currentMember = account.organizationMemberItems.find(
    (item) => item.isCurrentUser
  );
  const memberCount = Math.max(
    account.organizationMembers.length,
    account.canManageOrganizationMembers ? 1 : 0
  );
  const userLabel = currentMember?.member.displayName || model.context.userLabel;
  const loginLabel = currentMember?.member.loginId || model.context.userLabel;

  return (
    <section className="settings-option1-card settings-option1-account-card">
      <div className="settings-option1-card-head">
        <div>
          <strong>내 계정</strong>
          <span>현재 로그인 계정과 작업공간입니다.</span>
        </div>
      </div>

      <dl className="settings-option1-account-facts">
        <div>
          <dt>작업공간명</dt>
          <dd>{model.context.workspaceLabel}</dd>
        </div>
        <div>
          <dt>사용자</dt>
          <dd>{userLabel}</dd>
        </div>
        <div>
          <dt>로그인 계정</dt>
          <dd>{loginLabel}</dd>
        </div>
        <div>
          <dt>사용자 수</dt>
          <dd>{memberCount}명</dd>
        </div>
      </dl>

      <div className="settings-option1-member-head">
        <strong>사용자 관리</strong>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => model.sidebar.setActiveSettingsSection("account")}
        >
          사용자 관리
        </button>
      </div>
      <p className="settings-option1-account-note">
        사용자 추가와 비밀번호 재설정은 필요한 경우에만 관리 화면에서 처리합니다.
      </p>
    </section>
  );
}

function SettingsTabDetail({ model }: SettingsTabProps) {
  switch (model.sidebar.activeSettingsSection) {
    case "gmail":
      return <SettingsOption1MailDetail model={model} />;
    case "popbill":
      return <SettingsDefaultsSection model={model.sections.defaults} />;
    case "helper":
      return <SettingsHelperSection model={model.sections.helper} />;
    case "account":
    default:
      return <SettingsAccountSection model={model.sections.account} />;
  }
}

export function SettingsTab({ model }: SettingsTabProps) {
  const sidebar = model.sidebar;
  const activeSection = sidebar.settingsSections.find(
    (section) => section.id === sidebar.activeSettingsSection
  );

  return (
    <div className="settings-layout settings-option1-layout">
      <aside className="settings-sidebar-stack">
        <section className="panel settings-sidebar-panel">
          <div className="settings-step-list">
            {sidebar.settingsSections.map((section) => (
              <button
                key={section.id}
                className={
                  sidebar.activeSettingsSection === section.id
                    ? "settings-step-card active"
                    : "settings-step-card"
                }
                onClick={() => sidebar.setActiveSettingsSection(section.id)}
                aria-current={
                  sidebar.activeSettingsSection === section.id ? "page" : undefined
                }
              >
                <span className="settings-option1-nav-label">{section.title}</span>
                <span className="settings-option1-nav-state">
                  {section.done ? "완료" : "확인 필요"}
                </span>
              </button>
            ))}
          </div>

          <div className="settings-inline-note">
            <div className="settings-inline-copy">
              <strong>
                {sidebar.setupPendingCount === 0
                  ? "설정 준비 완료"
                  : `${sidebar.nextSettingsSectionLabel} 점검`}
              </strong>
              <span>
                {sidebar.customerRegistrationReady
                  ? `고객 ${sidebar.customerCount}명 기준`
                  : "필요한 항목만 수정"}
              </span>
            </div>
            <div className="button-row settings-inline-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={sidebar.openOnboarding}
              >
                도입 준비 다시 열기
              </button>
            </div>
          </div>
        </section>
      </aside>

      <main className="settings-option1-main">
        <div className="settings-option1-top-row">
          <SettingsReadinessSummary model={model} />
          <SettingsOnboardingCard model={model} />
        </div>
        <div className="settings-detail" aria-label={activeSection?.title ?? "설정"}>
          <SettingsTabDetail model={model} />
        </div>
      </main>
    </div>
  );
}
