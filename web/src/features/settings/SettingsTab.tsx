import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  FileCog,
  Mail,
  ScrollText,
  UserCog
} from "lucide-react";
import {
  TaskStepper,
  WorkPanel,
  WorkPanelBody,
  WorkPanelHeader,
  type ConsoleStatus,
  type TaskStepItem
} from "@/components/console";
import { RevealIcon } from "../../components/ui";
import { SettingsAccountSection } from "./SettingsAccountSection";
import { SettingsDefaultsSection } from "./SettingsDefaultsSection";
import { SettingsHelperSection } from "./SettingsHelperSection";
import type {
  SettingsSidebarModel,
  SettingsTabSectionsModel
} from "./settingsSectionModels";
import {
  getSubtleHoverMotion,
  getSubtleTapMotion,
  pageCardVariants,
  pageContainerVariants,
  pageDetailVariants,
  pageSectionVariants
} from "../pageMotion";
import {
  MAIL_PROVIDER_CONFIG,
  inferMailProviderFromAddress
} from "./settingsFormPersistence";

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

function getSettingsStepStatus(section: SettingsSidebarModel["settingsSections"][number]): ConsoleStatus {
  return section.done ? "complete" : "needsAttention";
}

function getSettingsStepIcon(sectionId: SettingsSidebarModel["settingsSections"][number]["id"]) {
  const IconComponent =
    sectionId === "onboarding"
      ? ClipboardCheck
      : sectionId === "popbill"
        ? FileCog
      : sectionId === "gmail"
          ? Mail
          : sectionId === "activity"
            ? ScrollText
        : UserCog;

  return <IconComponent className="size-3.5" aria-hidden="true" />;
}

function buildSettingsStepItems(sections: SettingsSidebarModel["settingsSections"]): TaskStepItem[] {
  return sections
    .filter((section) => section.id !== "helper")
    .map((section) => ({
      id: section.id,
      order: getSettingsStepIcon(section.id),
      title: section.title,
      status: getSettingsStepStatus(section)
    }));
}

function SettingsOption1MailDetail({ model }: SettingsTabProps) {
  const mail = model.sections.mail;
  const sidebar = model.sidebar;
  const [mailEditing, setMailEditing] = React.useState(false);
  const [mailDraft, setMailDraft] = React.useState(() => ({
    mailAddress: mail.fields.mailAddress,
    mailPassword: mail.fields.mailPassword,
    imapHost: mail.fields.imapHost,
    imapPort: mail.fields.imapPort,
    imapSecure: mail.fields.imapSecure,
    imapMailbox: mail.fields.imapMailbox
  }));
  const mailDraftRequiresManualImap =
    inferMailProviderFromAddress(
      mailDraft.mailAddress,
      mail.requiresManualImapSettings ? "custom" : "gmail"
    ) === "custom";

  React.useEffect(() => {
    if (mailEditing) {
      return;
    }

    setMailDraft({
      mailAddress: mail.fields.mailAddress,
      mailPassword: mail.fields.mailPassword,
      imapHost: mail.fields.imapHost,
      imapPort: mail.fields.imapPort,
      imapSecure: mail.fields.imapSecure,
      imapMailbox: mail.fields.imapMailbox
    });
  }, [
    mail.fields.mailAddress,
    mail.fields.mailPassword,
    mail.fields.imapHost,
    mail.fields.imapPort,
    mail.fields.imapSecure,
    mail.fields.imapMailbox,
    mailEditing
  ]);

  const startMailEdit = () => {
    setMailDraft({
      mailAddress: mail.fields.mailAddress,
      mailPassword: mail.fields.mailPassword,
      imapHost: mail.fields.imapHost,
      imapPort: mail.fields.imapPort,
      imapSecure: mail.fields.imapSecure,
      imapMailbox: mail.fields.imapMailbox
    });
    setMailEditing(true);
  };

  const cancelMailEdit = () => {
    setMailDraft({
      mailAddress: mail.fields.mailAddress,
      mailPassword: mail.fields.mailPassword,
      imapHost: mail.fields.imapHost,
      imapPort: mail.fields.imapPort,
      imapSecure: mail.fields.imapSecure,
      imapMailbox: mail.fields.imapMailbox
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
            <span>한전 수신메일을 읽기 위한 계정과 수신 서버를 설정합니다.</span>
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
                setMailDraft((prev) => {
                  const nextMailAddress = event.target.value;
                  const providerFallback = mail.requiresManualImapSettings
                    ? "custom"
                    : "gmail";
                  const prevProvider = inferMailProviderFromAddress(
                    prev.mailAddress,
                    providerFallback
                  );
                  const nextProvider = inferMailProviderFromAddress(
                    nextMailAddress,
                    providerFallback
                  );
                  const prevConfig = MAIL_PROVIDER_CONFIG[prevProvider];
                  const nextConfig = MAIL_PROVIDER_CONFIG[nextProvider];
                  const shouldReplaceImapFields =
                    nextProvider !== "custom" ||
                    prev.imapHost.trim() === "" ||
                    prev.imapHost.trim() === prevConfig.imapHost;

                  return {
                    ...prev,
                    mailAddress: nextMailAddress,
                    imapHost: shouldReplaceImapFields
                      ? nextConfig.imapHost
                      : prev.imapHost,
                    imapPort: shouldReplaceImapFields
                      ? nextConfig.imapPort
                      : prev.imapPort,
                    imapSecure: shouldReplaceImapFields
                      ? nextConfig.imapSecure
                      : prev.imapSecure,
                    imapMailbox:
                      shouldReplaceImapFields && nextConfig.defaultMailbox
                        ? nextConfig.defaultMailbox
                        : prev.imapMailbox
                  };
                })
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
        </div>

        {mailDraftRequiresManualImap ? (
          <div className="settings-option1-manual-mail">
            <div className="settings-option1-manual-mail-head">
              <strong>IMAP 직접 설정</strong>
              <span>자동 설정을 지원하지 않는 메일은 수신 서버 정보를 입력해야 합니다.</span>
            </div>
            <div className="settings-option1-form-grid">
              <label className="settings-option1-field">
                IMAP 서버
                <input
                  placeholder="imap.company.co.kr"
                  value={mailDraft.imapHost}
                  readOnly={!mailEditing}
                  onChange={(event) =>
                    setMailDraft((prev) => ({
                      ...prev,
                      imapHost: event.target.value
                    }))
                  }
                />
              </label>
              <label className="settings-option1-field">
                포트
                <input
                  inputMode="numeric"
                  placeholder="993"
                  value={mailDraft.imapPort}
                  readOnly={!mailEditing}
                  onChange={(event) =>
                    setMailDraft((prev) => ({
                      ...prev,
                      imapPort: event.target.value
                    }))
                  }
                />
              </label>
              <label className="settings-option1-field">
                보안
                <select
                  value={mailDraft.imapSecure ? "ssl" : "plain"}
                  disabled={!mailEditing}
                  onChange={(event) =>
                    setMailDraft((prev) => ({
                      ...prev,
                      imapSecure: event.target.value === "ssl"
                    }))
                  }
                >
                  <option value="ssl">SSL 사용</option>
                  <option value="plain">SSL 미사용</option>
                </select>
              </label>
              <label className="settings-option1-field">
                읽을 폴더
                <input
                  placeholder="*"
                  value={mailDraft.imapMailbox}
                  readOnly={!mailEditing}
                  onChange={(event) =>
                    setMailDraft((prev) => ({
                      ...prev,
                      imapMailbox: event.target.value
                    }))
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

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
    case "onboarding":
      return <>{model.sections.onboarding.content}</>;
    case "gmail":
      return <SettingsOption1MailDetail model={model} />;
    case "popbill":
      return <SettingsDefaultsSection model={model.sections.defaults} />;
    case "helper":
      return <SettingsHelperSection model={model.sections.helper} />;
    case "activity":
      return <SettingsActivityDetail model={model} />;
    case "account":
    default:
      return <SettingsAccountSection model={model.sections.account} />;
  }
}

function getSettingsLogLevelLabel(level: "info" | "warn" | "error") {
  if (level === "error") return "실패";
  if (level === "warn") return "주의";
  return "기록";
}

function getSettingsLogChipClassName(level: "info" | "warn" | "error") {
  if (level === "error") return "chip chip-danger";
  if (level === "warn") return "chip chip-warn";
  return "chip chip-success";
}

function parseSettingsLogContext(contextJson: string): Record<string, unknown> {
  if (!contextJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(contextJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getSettingsLogCategory(log: { scope: string; message: string }): string | null {
  if (log.scope === "auth") return "로그인";
  if (log.scope === "drafts" && !log.message.includes("미리보기")) return "세금계산서 발행";
  if (log.scope === "customers") return "고객 관리";
  if (log.scope === "customer-certificates") return "공동인증서";
  if (log.scope === "organization-members") return "계정 관리";
  if (log.scope === "organization-withdrawal") return "계정 관리";
  if (log.scope === "settings") return "설정";
  if (log.scope === "popbill" && (log.message.includes("고객 삭제") || log.message.includes("인증서 만료일"))) return "발행 연동";
  return null;
}

function getCustomerVisibleSettingsLogMessage(message: string): string {
  if (message === "초안을 생성했습니다.") return "발행 초안이 생성되었습니다.";
  if (message === "수동 발행 초안을 생성했습니다.") return "수동 발행 초안이 생성되었습니다.";
  if (message === "수동 발행 버튼 실행이 기록되었습니다.") return "발행 버튼을 눌렀습니다.";
  if (message === "일괄 수동 발행 버튼 실행이 기록되었습니다.") return "일괄 발행 버튼을 눌렀습니다.";
  if (message === "수동 발행을 완료했습니다.") return "세금계산서 발행이 완료되었습니다.";
  if (message === "수동 발행에 실패했습니다.") return "세금계산서 발행에 실패했습니다.";
  if (message === "검수 후 직접 발행 대기/실패 건 전체 발행을 실행했습니다.") return "선택 가능한 발행 건 전체 발행을 실행했습니다.";
  if (message === "발행 완료 건을 취소하고 직접 발행 대기로 되돌렸습니다.") return "발행 완료 건을 취소했습니다.";
  if (message === "발행 전 초안의 고객 매칭을 해제했습니다.") return "발행 전 초안의 고객 매칭을 해제했습니다.";
  if (message === "고객과 관련 로컬 데이터를 삭제했습니다.") return "고객을 삭제했습니다.";
  if (message === "시스템 설정을 저장했습니다.") return "설정을 저장했습니다.";
  if (message === "메일 연결 검증 상태를 갱신했습니다.") return "메일 연결을 확인했습니다.";
  if (message === "고객 삭제에 앞서 발행 연동 계정을 먼저 해지 처리했습니다.") return "고객 삭제 전 발행 연동 해지를 처리했습니다.";
  if (message === "고객 삭제 전에 발행 연동 계정 해지를 시도했지만 이미 존재하지 않아 로컬 삭제만 진행했습니다.") {
    return "발행 연동 해지 확인 후 고객을 삭제했습니다.";
  }
  return message;
}

function buildSettingsLogDetail(log: { scope: string; contextJson: string }): string {
  const context = parseSettingsLogContext(log.contextJson);
  const parts: string[] = [];
  const actor = typeof context.actorDisplayName === "string" ? context.actorDisplayName.trim() : "";
  const billingMonth = typeof context.billingMonth === "string" ? context.billingMonth.trim() : "";
  const issued = typeof context.issued === "number" ? context.issued : null;
  const failed = typeof context.failed === "number" ? context.failed : null;

  if (actor) {
    parts.push(`작업자 ${actor}`);
  }

  if (billingMonth) {
    parts.push(`정산월 ${billingMonth}`);
  }

  if (issued !== null || failed !== null) {
    parts.push(`성공 ${issued ?? 0}건 · 실패 ${failed ?? 0}건`);
  }

  return parts.join(" · ");
}

function getCustomerVisibleSettingsLogs(logs: SettingsTabModel["sections"]["activity"]["logs"]) {
  return logs
    .map((log) => ({
      ...log,
      category: getSettingsLogCategory(log),
      displayMessage: getCustomerVisibleSettingsLogMessage(log.message),
      detail: buildSettingsLogDetail(log)
    }))
    .filter((log): log is typeof log & { category: string; displayMessage: string } => log.category !== null);
}

function SettingsActivityDetail({ model }: SettingsTabProps) {
  const activity = model.sections.activity;
  const logs = getCustomerVisibleSettingsLogs(activity.logs).slice(0, 30);

  return (
    <WorkPanel className="settings-option1-card settings-activity-card">
      <WorkPanelHeader
        title="업무 내역"
        description="로그인, 발행, 고객 관리처럼 확인이 필요한 업무 기록만 최신순으로 표시합니다."
      />
      <WorkPanelBody className="settings-activity-list">
        {logs.length > 0 ? (
          logs.map((log) => (
            <article key={log.id} className="settings-activity-item">
              <div className="settings-activity-item-head">
                <div>
                  <strong>{log.displayMessage}</strong>
                  <span>{activity.formatDateTime(log.createdAt)} · {log.category}</span>
                </div>
                <span className={getSettingsLogChipClassName(log.level)}>
                  {getSettingsLogLevelLabel(log.level)}
                </span>
              </div>
              {log.detail ? <p>{log.detail}</p> : null}
            </article>
          ))
        ) : (
          <div className="empty">표시할 업무 내역이 없습니다.</div>
        )}
      </WorkPanelBody>
    </WorkPanel>
  );
}

function SettingsTabContent({ model }: SettingsTabProps) {
  const shouldReduceMotion = useReducedMotion();
  const sidebar = model.sidebar;
  const activeSection = sidebar.settingsSections.find(
    (section) => section.id === sidebar.activeSettingsSection
  );
  const settingsStepItems = React.useMemo(
    () => buildSettingsStepItems(sidebar.settingsSections),
    [sidebar.settingsSections]
  );

  return (
    <>
      <motion.div
        className="settings-layout settings-option1-layout"
        variants={pageContainerVariants}
        initial={shouldReduceMotion ? false : "hidden"}
        animate={shouldReduceMotion ? undefined : "visible"}
      >
        <motion.aside className="settings-sidebar-stack" variants={pageSectionVariants}>
          <WorkPanel className="settings-sidebar-panel">
            <motion.div className="settings-step-list" variants={pageContainerVariants}>
              <TaskStepper
                steps={settingsStepItems}
                activeId={sidebar.activeSettingsSection}
                label="설정 섹션"
                onSelect={(step) => sidebar.setActiveSettingsSection(step.id as SettingsSidebarModel["activeSettingsSection"])}
                className="settings-console-stepper"
              />
            </motion.div>

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
            </div>
          </WorkPanel>
        </motion.aside>

        <motion.main className="settings-option1-main" variants={pageSectionVariants}>
          <motion.div
            key={sidebar.activeSettingsSection}
            className="settings-detail"
            aria-label={activeSection?.title ?? "설정"}
            variants={pageDetailVariants}
            initial={shouldReduceMotion ? false : "hidden"}
            animate={shouldReduceMotion ? undefined : "visible"}
            layout
          >
            <SettingsTabDetail model={model} />
          </motion.div>
        </motion.main>
      </motion.div>
    </>
  );
}

export function SettingsTab(props: SettingsTabProps) {
  return <SettingsTabContent {...props} />;
}
