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

type SettingsMailOnboardingStepProps = {
  onboarding: SettingsOnboardingModel["mail"];
  autosaveLabel: string;
  detectedMailProviderLabel: string;
  mailAddress: string;
  mailPassword: string;
  notificationEmailsText: string;
  mailPasswordConfigured: boolean;
  mailPasswordReveal: SettingsFeatureRevealAdapters["mailPassword"];
  busy: boolean;
  isMailTesting: boolean;
  onMailAddressChange: (value: string) => void;
  onMailPasswordChange: (value: string) => void;
  onNotificationEmailsTextChange: (value: string) => void;
  onRunMailSettingsTest: () => Promise<void>;
};

export function SettingsMailOnboardingStep({
  onboarding,
  autosaveLabel,
  detectedMailProviderLabel,
  mailAddress,
  mailPassword,
  notificationEmailsText,
  mailPasswordConfigured,
  mailPasswordReveal,
  busy,
  isMailTesting,
  onMailAddressChange,
  onMailPasswordChange,
  onNotificationEmailsTextChange,
  onRunMailSettingsTest
}: SettingsMailOnboardingStepProps) {
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
            <span>메일 서비스</span>
            <strong>{detectedMailProviderLabel}</strong>
          </div>
        </div>

        <div className="onboarding-field-grid">
          <label
            className={getOnboardingRequiredFieldClassName(onboarding.address.hasError)}
            data-required-empty={onboarding.address.missing ? "true" : undefined}
          >
            <span
              className={getOnboardingRequiredLabelClassName(
                onboarding.address.hasError
              )}
            >
              메일 주소
            </span>
            <input
              type="email"
              className={getOnboardingRequiredInputClassName(onboarding.address.hasError)}
              placeholder="example@mail.com"
              value={mailAddress}
              aria-invalid={onboarding.address.hasError || undefined}
              aria-describedby="onboarding-mail-address-hint"
              onChange={(event) => onMailAddressChange(event.target.value)}
            />
            {renderOnboardingRequiredHint("onboarding-mail-address-hint", {
              missing: onboarding.address.missing,
              invalid: onboarding.address.invalid,
              invalidText: "메일 형식이 올바르지 않습니다.",
              defaultText:
                "한전 메일을 읽고 알림 메일을 보낼 때 함께 사용할 계정입니다."
            })}
          </label>
          <label
            className={getOnboardingRequiredFieldClassName(onboarding.password.hasError)}
            data-required-empty={onboarding.password.missing ? "true" : undefined}
          >
            <span
              className={getOnboardingRequiredLabelClassName(
                onboarding.password.hasError
              )}
            >
              앱 비밀번호
            </span>
            <div className={getOnboardingPasswordFieldClassName(onboarding.password.hasError)}>
              <input
                className={getOnboardingRequiredInputClassName(
                  onboarding.password.hasError
                )}
                type={mailPasswordReveal.visible ? "text" : "password"}
                value={mailPassword}
                aria-invalid={onboarding.password.hasError || undefined}
                aria-describedby="onboarding-mail-password-hint"
                onChange={(event) => onMailPasswordChange(event.target.value)}
                placeholder={
                  mailPasswordConfigured
                    ? "변경할 때만 다시 입력"
                    : "앱 비밀번호 입력"
                }
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={
                  mailPasswordReveal.visible
                    ? "앱 비밀번호 숨기기"
                    : "앱 비밀번호 보기"
                }
                onClick={mailPasswordReveal.toggle}
              >
                <RevealIcon open={mailPasswordReveal.visible} />
              </button>
            </div>
            {renderOnboardingRequiredHint("onboarding-mail-password-hint", {
              missing: onboarding.password.missing,
              defaultText: mailPasswordConfigured
                ? "이미 저장된 앱 비밀번호가 있습니다. 바꿀 때만 다시 입력하세요. 테스트 시 빈칸이면 저장된 값을 사용합니다."
                : "위 메일 주소로 로그인할 때 쓰는 앱 비밀번호입니다."
            })}
          </label>
        </div>

        <div className="button-row onboarding-primary-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRunMailSettingsTest()}
          >
            {isMailTesting ? "연결 테스트 중..." : "메일 연결 테스트"}
          </button>
        </div>
      </section>

      <details className="settings-advanced-panel">
        <summary>알림 메일 / 추가 설정은 나중에 보기</summary>
        <div className="onboarding-secondary-stack">
          <label>
            알림 수신 메일
            <textarea
              rows={4}
              value={notificationEmailsText}
              onChange={(event) =>
                onNotificationEmailsTextChange(event.target.value)
              }
            />
            <span className="field-hint">
              파싱 실패나 발행 실패 알림을 받을 주소입니다. 여러 개면 줄바꿈이나
              쉼표로 구분합니다.
            </span>
          </label>
        </div>
      </details>
    </div>
  );
}
