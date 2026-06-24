import { Panel, PasswordField } from "../../components/ui";
import { PASSWORD_POLICY_PLACEHOLDER } from "../auth/passwordPolicy";
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
          <PasswordField
            visible={reveals.nextPassword.visible}
            onVisibleChange={() => reveals.nextPassword.toggle()}
            value={account.passwordChangeForm.nextPassword}
            onChange={(event) => updatePasswordChangeField(account, "nextPassword", event.target.value)}
            placeholder={PASSWORD_POLICY_PLACEHOLDER}
            revealLabel="새 비밀번호 보기"
            hideLabel="새 비밀번호 숨기기"
          />
        </label>
        <label>
          새 비밀번호 확인
          <PasswordField
            visible={reveals.confirmPassword.visible}
            onVisibleChange={() => reveals.confirmPassword.toggle()}
            value={account.passwordChangeForm.confirmPassword}
            onChange={(event) => updatePasswordChangeField(account, "confirmPassword", event.target.value)}
            placeholder="한 번 더 입력"
            revealLabel="비밀번호 확인 보기"
            hideLabel="비밀번호 확인 숨기기"
          />
          <span className="field-hint">{hintText}</span>
        </label>
      </div>
    </Panel>
  );
}
