import type { ComponentProps } from "react";
import { SettingsTab } from "./SettingsTab";

export type SettingsScreenProps = ComponentProps<typeof SettingsTab>;

export function SettingsScreen(props: SettingsScreenProps) {
  return (
    <div className="settings-screen">
      <SettingsTab {...props} />
    </div>
  );
}
