import { SettingsTab } from "./SettingsTab";
import { useSettingsScreenModel, type SettingsScreenProps } from "./useSettingsScreenModel";

export function SettingsScreen(props: SettingsScreenProps) {
  const model = useSettingsScreenModel(props);

  return (
    <div className="settings-screen">
      <SettingsTab model={model} />
    </div>
  );
}
