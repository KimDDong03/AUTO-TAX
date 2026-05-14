import { Icon } from "../../components/ui";
import { SettingsTab } from "./SettingsTab";
import { useSettingsScreenModel, type SettingsScreenProps } from "./useSettingsScreenModel";

function getSettingsHeaderChipClassName(tone: "default" | "warn" | "success") {
  if (tone === "warn") return "home-header-chip tone-warn";
  if (tone === "success") return "home-header-chip tone-success";
  return "home-header-chip";
}

export function SettingsScreen(props: SettingsScreenProps) {
  const model = useSettingsScreenModel(props);
  const autosaveTone =
    model.sidebar.settingsAutosaveState === "error"
      ? "warn"
      : model.sidebar.settingsAutosaveState === "saving"
        ? "warn"
        : "success";

  return (
    <div className="settings-screen">
      <header className="home-page-header settings-page-header">
        <div className="home-page-header-copy">
          <h2>설정 관리</h2>
          <div className="home-page-header-chips">
            <span className="home-header-chip home-header-chip-user">
              {props.workspaceLabel}
            </span>
            <span
              className={getSettingsHeaderChipClassName(
                model.sidebar.setupPendingCount > 0 ? "warn" : "success"
              )}
            >
              {model.sidebar.setupPendingCount > 0
                ? `${model.sidebar.setupPendingCount}개 남음`
                : "설정 준비 완료"}
            </span>
            <span className={getSettingsHeaderChipClassName(autosaveTone)}>
              {model.sidebar.settingsAutosaveLabel}
            </span>
          </div>
        </div>
        <div className="home-page-header-account">
          <div className="home-page-header-account-copy">
            <strong>{props.userLabel}</strong>
            <span>
              {props.workspaceLabel} · {props.popbillModeLabel}
            </span>
          </div>
          <span className="home-page-header-account-avatar" aria-hidden="true">
            <Icon
              name="user"
              className="home-page-header-account-avatar-icon"
            />
          </span>
        </div>
      </header>
      <SettingsTab model={model} />
    </div>
  );
}
