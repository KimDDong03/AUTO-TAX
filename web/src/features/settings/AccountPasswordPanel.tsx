import { Panel, RevealIcon } from "../../components/ui";
import type { SettingsAccountState } from "./settingsAccountTypes";

type AccountPasswordPanelProps = {
  title: string;
  subtitle: string;
  hintText: string;
  account: Pick<SettingsAccountState, "passwordChangeForm" | "setPasswordChangeForm" | "changePassword">;
  revealedFields: Record<string, boolean>;
  toggleRevealField: (fieldKey: string) => void;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  actionKey?: string;
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
  revealedFields,
  toggleRevealField,
  runAction,
  actionKey = "change-password",
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
          onClick={() =>
            void runAction(actionKey, account.changePassword, {
              reload: false
            })
          }
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
              type={revealedFields.nextPassword ? "text" : "password"}
              value={account.passwordChangeForm.nextPassword}
              onChange={(event) => updatePasswordChangeField(account, "nextPassword", event.target.value)}
              placeholder="8자 이상 입력"
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={revealedFields.nextPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
              onClick={() => toggleRevealField("nextPassword")}
            >
              <RevealIcon open={Boolean(revealedFields.nextPassword)} />
            </button>
          </div>
        </label>
        <label>
          새 비밀번호 확인
          <div className="password-field">
            <input
              type={revealedFields.confirmPassword ? "text" : "password"}
              value={account.passwordChangeForm.confirmPassword}
              onChange={(event) => updatePasswordChangeField(account, "confirmPassword", event.target.value)}
              placeholder="한 번 더 입력"
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={revealedFields.confirmPassword ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
              onClick={() => toggleRevealField("confirmPassword")}
            >
              <RevealIcon open={Boolean(revealedFields.confirmPassword)} />
            </button>
          </div>
          <span className="field-hint">{hintText}</span>
        </label>
      </div>
    </Panel>
  );
}
