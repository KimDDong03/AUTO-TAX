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
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapMailbox: string;
  requiresManualImapSettings: boolean;
  mailPasswordConfigured: boolean;
  mailPasswordReveal: SettingsFeatureRevealAdapters["mailPassword"];
  busy: boolean;
  isMailTesting: boolean;
  onMailAddressChange: (value: string) => void;
  onMailPasswordChange: (value: string) => void;
  onImapHostChange: (value: string) => void;
  onImapPortChange: (value: string) => void;
  onImapSecureChange: (value: boolean) => void;
  onImapMailboxChange: (value: string) => void;
  onRunMailSettingsTest: () => Promise<void>;
};

export function SettingsMailOnboardingStep({
  onboarding,
  autosaveLabel,
  detectedMailProviderLabel,
  mailAddress,
  mailPassword,
  imapHost,
  imapPort,
  imapSecure,
  imapMailbox,
  requiresManualImapSettings,
  mailPasswordConfigured,
  mailPasswordReveal,
  busy,
  isMailTesting,
  onMailAddressChange,
  onMailPasswordChange,
  onImapHostChange,
  onImapPortChange,
  onImapSecureChange,
  onImapMailboxChange,
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
                "한전 수신메일을 읽을 계정입니다."
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

        {requiresManualImapSettings ? (
          <div className="onboarding-manual-mail-settings">
            <div className="onboarding-manual-mail-head">
              <strong>IMAP 직접 설정</strong>
              <span>자동 설정을 지원하지 않는 메일은 수신 서버 정보를 입력해야 합니다.</span>
            </div>
            <div className="onboarding-field-grid">
              <label>
                IMAP 서버
                <input
                  placeholder="imap.company.co.kr"
                  value={imapHost}
                  onChange={(event) => onImapHostChange(event.target.value)}
                />
              </label>
              <label>
                포트
                <input
                  inputMode="numeric"
                  placeholder="993"
                  value={imapPort}
                  onChange={(event) => onImapPortChange(event.target.value)}
                />
              </label>
              <label>
                보안
                <select
                  value={imapSecure ? "ssl" : "plain"}
                  onChange={(event) =>
                    onImapSecureChange(event.target.value === "ssl")
                  }
                >
                  <option value="ssl">SSL 사용</option>
                  <option value="plain">SSL 미사용</option>
                </select>
              </label>
              <label>
                읽을 폴더
                <input
                  placeholder="INBOX"
                  value={imapMailbox}
                  onChange={(event) => onImapMailboxChange(event.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}

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

    </div>
  );
}
