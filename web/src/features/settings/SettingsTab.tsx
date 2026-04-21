import React from "react";
import { SettingsAccountSection } from "./SettingsAccountSection";
import { SettingsDefaultsSection } from "./SettingsDefaultsSection";
import { SettingsHelperSection } from "./SettingsHelperSection";
import { SettingsMailSection } from "./SettingsMailSection";
import type {
  SettingsSidebarModel,
  SettingsTabSectionsModel
} from "./settingsSectionModels";

export type SettingsTabModel = {
  sidebar: SettingsSidebarModel;
  sections: SettingsTabSectionsModel;
};

type SettingsTabProps = {
  model: SettingsTabModel;
};

function SettingsTabDetail({ model }: SettingsTabProps) {
  switch (model.sidebar.activeSettingsSection) {
    case "gmail":
      return <SettingsMailSection model={model.sections.mail} />;
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
    <div className="settings-layout">
      <aside className="settings-sidebar-stack">
        <section className="panel settings-sidebar-panel">
          <header className="panel-header settings-sidebar-header">
            <div className="settings-sidebar-header-copy">
              <div className="settings-sidebar-header-top">
                <span
                  className={`chip ${
                    sidebar.setupPendingCount === 0 ? "chip-success" : "chip-warn"
                  }`}
                >
                  {sidebar.setupPendingCount === 0
                    ? "설정 완료"
                    : `${sidebar.setupPendingCount}개 남음`}
                </span>
                <span
                  className={`chip ${
                    sidebar.settingsAutosaveState === "error"
                      ? "chip-danger"
                      : sidebar.settingsAutosaveState === "saving"
                        ? "chip-warn"
                        : "chip-success"
                  }`}
                >
                  {sidebar.settingsAutosaveLabel}
                </span>
              </div>
              <h2>설정 항목</h2>
              <p className="settings-sidebar-purpose">
                {activeSection
                  ? `현재 ${activeSection.title}을(를) 점검 중입니다.`
                  : "필요한 항목부터 차례대로 점검합니다."}
              </p>
            </div>
          </header>

          <div className="settings-sidebar-current">
            <strong>{activeSection?.title ?? "설정"}</strong>
            <span>
              {activeSection?.summary ??
                "메일, 발행 기본값, 헬퍼, 계정을 순서대로 점검합니다."}
            </span>
          </div>

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
              >
                <div className="settings-step-head">
                  <span className="setup-order">{section.step}</span>
                  <div className="settings-step-copy">
                    <strong>{section.title}</strong>
                    <span>{section.summary}</span>
                  </div>
                </div>
                <span
                  className={`chip ${section.done ? "chip-success" : "chip-warn"}`}
                >
                  {section.done ? "완료" : "입력 필요"}
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
                onClick={() =>
                  sidebar.setActiveSettingsSection(sidebar.nextSettingsSection)
                }
              >
                {sidebar.nextSettingsSectionLabel} 열기
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={sidebar.openCertificates}
              >
                인증서 화면 열기
              </button>
            </div>
          </div>
        </section>
      </aside>

      <div className="settings-detail">
        <SettingsTabDetail model={model} />
      </div>
    </div>
  );
}
