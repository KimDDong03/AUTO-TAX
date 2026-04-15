import { Panel, RevealIcon } from "../../components/ui";
import type { SettingsPasswordRevealPair } from "./createSettingsActionAdapters";
import type { SettingsAccountState } from "./settingsAccountTypes";

type AccountPasswordPanelProps = {
  title: string;
  subtitle: string;
  hintText: string;
  account: Pick<SettingsAccountState, "passwordChangeForm" | "setPasswordChangeForm">;
  reveals: SettingsPasswordRevealPair;
  onSubmit: () => Promise<void>;
  actionLabel?: string;
  className?: string;
};

function updatePasswordChangeField(
  account: Pick<SettingsAccountState, "setPasswordChangeForm">,
  field: "nextPassword" | "confirmPassword",
  value: string
) {
  account.setPasswordChangeForm((prev) => ({
    ...prev,
    [field]: value
  }));
}

export function AccountPasswordPanel({
  title,
  subtitle,
  hintText,
  account,
  reveals,
  onSubmit,
  actionLabel = "비밀번호 변경",
  className
}: AccountPasswordPanelProps) {
  return (
    <Panel
      className={className}
      title={title}
      subtitle={subtitle}
      actions={
        <button
          onClick={() => void onSubmit()}
        >
          {actionLabel}
        </button>
      }
    >
      <div className="form-grid">
        <label>
          새 비밀번호
          <div className="password-field">
            <input
              type={reveals.nextPassword.visible ? "text" : "password"}
              value={account.passwordChangeForm.nextPassword}
              onChange={(event) => updatePasswordChangeField(account, "nextPassword", event.target.value)}
              placeholder="8자 이상 입력"
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={reveals.nextPassword.visible ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
              onClick={reveals.nextPassword.toggle}
            >
              <RevealIcon open={reveals.nextPassword.visible} />
            </button>
          </div>
        </label>
        <label>
          새 비밀번호 확인
          <div className="password-field">
            <input
              type={reveals.confirmPassword.visible ? "text" : "password"}
              value={account.passwordChangeForm.confirmPassword}
              onChange={(event) => updatePasswordChangeField(account, "confirmPassword", event.target.value)}
              placeholder="한 번 더 입력"
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={reveals.confirmPassword.visible ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
              onClick={reveals.confirmPassword.toggle}
            >
              <RevealIcon open={reveals.confirmPassword.visible} />
            </button>
          </div>
          <span className="field-hint">{hintText}</span>
        </label>
      </div>
    </Panel>
  );
}
