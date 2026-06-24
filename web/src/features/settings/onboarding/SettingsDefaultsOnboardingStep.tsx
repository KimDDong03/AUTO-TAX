import React from "react";
import { PasswordField } from "../../../components/ui";
import type { SettingsFeatureRevealAdapters } from "../createSettingsActionAdapters";
import type { SettingsOnboardingModel } from "../useSettingsDerivedModel";
import {
  getOnboardingPasswordFieldClassName,
  getOnboardingRequiredFieldClassName,
  getOnboardingRequiredInputClassName,
  getOnboardingRequiredLabelClassName,
  renderOnboardingRequiredHint
} from "./settingsOnboardingFieldUi";

type SettingsDefaultsOnboardingStepProps = {
  onboarding: SettingsOnboardingModel["defaults"];
  autosaveLabel: string;
  renewalIssuePassword: string;
  renewalIssuePasswordConfigured: boolean;
  reveals: Pick<SettingsFeatureRevealAdapters, "renewalIssuePassword">;
  busy: boolean;
  onRenewalIssuePasswordChange: (value: string) => void;
};

export function SettingsDefaultsOnboardingStep({
  onboarding,
  autosaveLabel,
  renewalIssuePassword,
  renewalIssuePasswordConfigured,
  reveals,
  busy,
  onRenewalIssuePasswordChange
}: SettingsDefaultsOnboardingStepProps) {
  return (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy onboarding-task-copy">
          <strong>{onboarding.headline}</strong>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>자동 저장</span>
            <strong>{autosaveLabel}</strong>
          </div>
          <div>
            <span>발행 설정</span>
            <strong>{onboarding.operatorReadyLabel}</strong>
          </div>
        </div>

        <section className="onboarding-section">
          <div className="onboarding-section-head">
            <strong>필수 입력</strong>
            <span>공동인증서 발급/갱신 요청에 쓰는 값</span>
          </div>
          <div className="onboarding-field-grid">
            <label
              className={getOnboardingRequiredFieldClassName(
                onboarding.renewalIssuePassword.hasError
              )}
              data-required-empty={onboarding.renewalIssuePassword.missing ? "true" : undefined}
            >
              <span
                className={getOnboardingRequiredLabelClassName(
                  onboarding.renewalIssuePassword.hasError
                )}
              >
                공동인증서 발급용 임시 비밀번호
              </span>
              <PasswordField
                visible={reveals.renewalIssuePassword.visible}
                onVisibleChange={() => reveals.renewalIssuePassword.toggle()}
                fieldClassName={getOnboardingPasswordFieldClassName(onboarding.renewalIssuePassword.hasError)}
                inputClassName={getOnboardingRequiredInputClassName(
                  onboarding.renewalIssuePassword.hasError
                )}
                value={renewalIssuePassword}
                inputMode="numeric"
                maxLength={6}
                aria-invalid={onboarding.renewalIssuePassword.hasError || undefined}
                aria-describedby="onboarding-renewal-issue-password-hint"
                onChange={(event) => onRenewalIssuePasswordChange(event.target.value)}
                placeholder={
                  renewalIssuePasswordConfigured
                    ? "변경할 때만 다시 입력"
                    : "숫자 6자리 입력"
                }
                revealLabel="발급용 임시 비밀번호 보기"
                hideLabel="발급용 임시 비밀번호 숨기기"
                toggleDisabled={busy}
              />
              {renderOnboardingRequiredHint("onboarding-renewal-issue-password-hint", {
                missing: onboarding.renewalIssuePassword.missing,
                defaultText: renewalIssuePasswordConfigured
                  ? "이미 저장된 값이 있습니다."
                  : "숫자 6자리입니다."
              })}
            </label>
          </div>
        </section>

      </section>
    </div>
  );
}
