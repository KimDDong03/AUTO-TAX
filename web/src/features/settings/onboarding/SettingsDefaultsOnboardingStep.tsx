import React from "react";
import type { SettingsFeatureRevealAdapters } from "../createSettingsActionAdapters";
import type { SettingsOnboardingModel } from "../useSettingsDerivedModel";
import {
  getOnboardingRequiredFieldClassName,
  getOnboardingRequiredInputClassName,
  getOnboardingRequiredLabelClassName,
  renderOnboardingRequiredHint
} from "./settingsOnboardingFieldUi";

type SettingsDefaultsOnboardingStepProps = {
  onboarding: SettingsOnboardingModel["defaults"];
  hasSavedDefaults: boolean;
  autosaveLabel: string;
  popbillUserIdPrefix: string;
  operatorContactName: string;
  operatorContactTel: string;
  operatorContactEmail: string;
  popbillSharedPassword: string;
  renewalIssuePassword: string;
  renewalCertificatePassword: string;
  popbillSharedPasswordConfigured: boolean;
  renewalIssuePasswordConfigured: boolean;
  renewalCertificatePasswordConfigured: boolean;
  reveals: Pick<
    SettingsFeatureRevealAdapters,
    | "popbillSharedPassword"
    | "renewalIssuePassword"
    | "renewalCertificatePassword"
  >;
  busy: boolean;
  onPopbillUserIdPrefixChange: (value: string) => void;
  onOperatorContactNameChange: (value: string) => void;
  onOperatorContactTelChange: (value: string) => void;
  onOperatorContactEmailChange: (value: string) => void;
  onPopbillSharedPasswordChange: (value: string) => void;
  onRenewalIssuePasswordChange: (value: string) => void;
  onRenewalCertificatePasswordChange: (value: string) => void;
  onLoadCurrentPopbillSharedPassword: () => Promise<void>;
  onLoadCurrentRenewalIssuePassword: () => Promise<void>;
  onLoadCurrentRenewalCertificatePassword: () => Promise<void>;
};

export function SettingsDefaultsOnboardingStep({
  onboarding,
  hasSavedDefaults,
  autosaveLabel,
  popbillUserIdPrefix,
  operatorContactName,
  operatorContactTel,
  operatorContactEmail,
  popbillSharedPassword,
  renewalIssuePassword,
  renewalCertificatePassword,
  popbillSharedPasswordConfigured,
  renewalIssuePasswordConfigured,
  renewalCertificatePasswordConfigured,
  reveals,
  busy,
  onPopbillUserIdPrefixChange,
  onOperatorContactNameChange,
  onOperatorContactTelChange,
  onOperatorContactEmailChange,
  onPopbillSharedPasswordChange,
  onRenewalIssuePasswordChange,
  onRenewalCertificatePasswordChange,
  onLoadCurrentPopbillSharedPassword,
  onLoadCurrentRenewalIssuePassword,
  onLoadCurrentRenewalCertificatePassword
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
            <span>운영 연락처</span>
            <strong>{onboarding.operatorReadyLabel}</strong>
          </div>
        </div>

        <section className="onboarding-section">
          <div className="onboarding-section-head">
            <strong>필수 입력</strong>
            <span>먼저 채울 값</span>
          </div>
          <div className="onboarding-field-grid">
            <label
              className={getOnboardingRequiredFieldClassName(
                onboarding.operatorName.hasError
              )}
              data-required-empty={onboarding.operatorName.missing ? "true" : undefined}
            >
              <span
                className={getOnboardingRequiredLabelClassName(
                  onboarding.operatorName.hasError
                )}
              >
                운영 이름
              </span>
              <input
                className={getOnboardingRequiredInputClassName(
                  onboarding.operatorName.hasError
                )}
                value={operatorContactName}
                aria-invalid={onboarding.operatorName.hasError || undefined}
                aria-describedby="onboarding-operator-name-hint"
                onChange={(event) => onOperatorContactNameChange(event.target.value)}
                placeholder="운영 이름"
              />
              {renderOnboardingRequiredHint("onboarding-operator-name-hint", {
                missing: onboarding.operatorName.missing
              })}
            </label>
            <label
              className={getOnboardingRequiredFieldClassName(
                onboarding.operatorTel.hasError
              )}
              data-required-empty={onboarding.operatorTel.missing ? "true" : undefined}
            >
              <span
                className={getOnboardingRequiredLabelClassName(
                  onboarding.operatorTel.hasError
                )}
              >
                운영 연락처
              </span>
              <input
                className={getOnboardingRequiredInputClassName(
                  onboarding.operatorTel.hasError
                )}
                value={operatorContactTel}
                aria-invalid={onboarding.operatorTel.hasError || undefined}
                aria-describedby="onboarding-operator-tel-hint"
                onChange={(event) => onOperatorContactTelChange(event.target.value)}
                placeholder="01012345678"
              />
              {renderOnboardingRequiredHint("onboarding-operator-tel-hint", {
                missing: onboarding.operatorTel.missing
              })}
            </label>
            <label
              className={getOnboardingRequiredFieldClassName(
                onboarding.operatorEmail.hasError
              )}
              data-required-empty={onboarding.operatorEmail.missing ? "true" : undefined}
            >
              <span
                className={getOnboardingRequiredLabelClassName(
                  onboarding.operatorEmail.hasError
                )}
              >
                운영 이메일
              </span>
              <input
                type="email"
                className={getOnboardingRequiredInputClassName(
                  onboarding.operatorEmail.hasError
                )}
                value={operatorContactEmail}
                aria-invalid={onboarding.operatorEmail.hasError || undefined}
                aria-describedby="onboarding-operator-email-hint"
                onChange={(event) => onOperatorContactEmailChange(event.target.value)}
                placeholder="operator@example.com"
              />
              {renderOnboardingRequiredHint("onboarding-operator-email-hint", {
                missing: onboarding.operatorEmail.missing,
                invalid: onboarding.operatorEmail.invalid,
                invalidText: "메일 형식이 올바르지 않습니다."
              })}
            </label>
          </div>
        </section>

      </section>
    </div>
  );
}
