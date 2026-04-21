import React from "react";
import { RevealIcon } from "../../../components/ui";
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
        <div className="onboarding-main-copy">
          <strong>{onboarding.headline}</strong>
          <p>선택값은 나중에 입력해도 됩니다.</p>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>자동 저장</span>
            <strong>{autosaveLabel}</strong>
          </div>
          <div>
            <span>팝빌 연결</span>
            <strong>{onboarding.popbillReadyLabel}</strong>
          </div>
          <div>
            <span>운영값</span>
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
                onboarding.popbillPrefix.hasError
              )}
              data-required-empty={onboarding.popbillPrefix.missing ? "true" : undefined}
            >
              <span
                className={getOnboardingRequiredLabelClassName(
                  onboarding.popbillPrefix.hasError
                )}
              >
                팝빌 접두어
              </span>
              <input
                id="onboarding-popbill-user-id-prefix"
                className={getOnboardingRequiredInputClassName(
                  onboarding.popbillPrefix.hasError
                )}
                value={popbillUserIdPrefix}
                aria-invalid={onboarding.popbillPrefix.hasError || undefined}
                aria-describedby="onboarding-popbill-prefix-hint"
                onChange={(event) => onPopbillUserIdPrefixChange(event.target.value)}
                placeholder="예: TEST_"
              />
              {renderOnboardingRequiredHint("onboarding-popbill-prefix-hint", {
                missing: onboarding.popbillPrefix.missing,
                defaultText:
                  "예: `TEST_001` · 신규 고객 팝빌 아이디 앞에 붙습니다."
              })}
            </label>
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
                담당자 이름
              </span>
              <input
                className={getOnboardingRequiredInputClassName(
                  onboarding.operatorName.hasError
                )}
                value={operatorContactName}
                aria-invalid={onboarding.operatorName.hasError || undefined}
                aria-describedby="onboarding-operator-name-hint"
                onChange={(event) => onOperatorContactNameChange(event.target.value)}
                placeholder="담당자 이름"
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
                담당자 연락처
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
                담당자 이메일
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
            <label
              className={getOnboardingRequiredFieldClassName(
                onboarding.popbillSharedPassword.hasError
              )}
              data-required-empty={
                onboarding.popbillSharedPassword.missing ? "true" : undefined
              }
            >
              <span
                className={getOnboardingRequiredLabelClassName(
                  onboarding.popbillSharedPassword.hasError
                )}
              >
                신규 고객 기본 비밀번호
              </span>
              <div
                className={getOnboardingPasswordFieldClassName(
                  onboarding.popbillSharedPassword.hasError
                )}
              >
                <input
                  className={getOnboardingRequiredInputClassName(
                    onboarding.popbillSharedPassword.hasError
                  )}
                  type={reveals.popbillSharedPassword.visible ? "text" : "password"}
                  value={popbillSharedPassword}
                  aria-invalid={
                    onboarding.popbillSharedPassword.hasError || undefined
                  }
                  aria-describedby="onboarding-popbill-shared-password-hint"
                  onChange={(event) =>
                    onPopbillSharedPasswordChange(event.target.value)
                  }
                  placeholder={
                    popbillSharedPasswordConfigured
                      ? "변경할 때만 다시 입력"
                      : "신규 고객 공통 비밀번호"
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    reveals.popbillSharedPassword.visible
                      ? "팝빌 기본 비밀번호 숨기기"
                      : "팝빌 기본 비밀번호 보기"
                  }
                  onClick={reveals.popbillSharedPassword.toggle}
                >
                  <RevealIcon open={reveals.popbillSharedPassword.visible} />
                </button>
              </div>
              {renderOnboardingRequiredHint(
                "onboarding-popbill-shared-password-hint",
                {
                  missing: onboarding.popbillSharedPassword.missing,
                  defaultText: popbillSharedPasswordConfigured
                    ? "이미 저장된 값이 있습니다. 필요하면 아래 보조 영역에서 다시 불러오세요."
                    : "신규 고객 계정 초기 비밀번호"
                }
              )}
            </label>
            <label
              className={getOnboardingRequiredFieldClassName(
                onboarding.renewalIssuePassword.hasError
              )}
              data-required-empty={
                onboarding.renewalIssuePassword.missing ? "true" : undefined
              }
            >
              <span
                className={getOnboardingRequiredLabelClassName(
                  onboarding.renewalIssuePassword.hasError
                )}
              >
                공동인증서 발급용 임시번호
              </span>
              <div
                className={getOnboardingPasswordFieldClassName(
                  onboarding.renewalIssuePassword.hasError
                )}
              >
                <input
                  className={getOnboardingRequiredInputClassName(
                    onboarding.renewalIssuePassword.hasError
                  )}
                  type={reveals.renewalIssuePassword.visible ? "text" : "password"}
                  value={renewalIssuePassword}
                  inputMode="numeric"
                  maxLength={6}
                  aria-invalid={
                    onboarding.renewalIssuePassword.hasError || undefined
                  }
                  aria-describedby="onboarding-renewal-issue-password-hint"
                  onChange={(event) =>
                    onRenewalIssuePasswordChange(event.target.value)
                  }
                  placeholder={
                    renewalIssuePasswordConfigured
                      ? "변경할 때만 다시 입력"
                      : "숫자 6자리 입력"
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    reveals.renewalIssuePassword.visible
                      ? "발급용 임시번호 숨기기"
                      : "발급용 임시번호 보기"
                  }
                  onClick={reveals.renewalIssuePassword.toggle}
                >
                  <RevealIcon open={reveals.renewalIssuePassword.visible} />
                </button>
              </div>
              {renderOnboardingRequiredHint(
                "onboarding-renewal-issue-password-hint",
                {
                  missing: onboarding.renewalIssuePassword.missing,
                  defaultText: renewalIssuePasswordConfigured
                    ? "공동인증서 신청 및 갱신 신청용 6자리입니다. 필요하면 아래 보조 영역에서 다시 불러오세요."
                    : "공동인증서 신청 및 갱신 신청용 6자리"
                }
              )}
            </label>
          </div>
        </section>

      </section>

      {hasSavedDefaults ? (
        <details className="settings-advanced-panel">
          <summary>저장된 값 다시 불러오기는 필요할 때만 보기</summary>
          <div className="helper-box-stack">
            <strong>보조 작업</strong>
            <span>
              현재 단계의 메인 흐름은 위 필수 입력을 채우는 것입니다. 저장된 값은
              정말 필요할 때만 불러오세요.
            </span>
            <div className="button-row">
              {popbillSharedPasswordConfigured ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void onLoadCurrentPopbillSharedPassword()}
                >
                  신규 고객 기본 비밀번호 불러오기
                </button>
              ) : null}
              {renewalIssuePasswordConfigured ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void onLoadCurrentRenewalIssuePassword()}
                >
                  발급용 임시번호 불러오기
                </button>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
