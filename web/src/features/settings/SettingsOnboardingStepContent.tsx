import { RevealIcon } from "../../components/ui";
import type { SettingsFeatureRevealAdapters } from "./createSettingsActionAdapters";
import type { SettingsOnboardingModel } from "./useSettingsDerivedModel";

function getOnboardingRequiredFieldClassName(hasError: boolean) {
  return hasError
    ? "onboarding-required-field is-missing"
    : "onboarding-required-field";
}

function getOnboardingRequiredLabelClassName(hasError: boolean) {
  return hasError
    ? "onboarding-required-label is-missing"
    : "onboarding-required-label";
}

function getOnboardingRequiredInputClassName(hasError: boolean) {
  return hasError
    ? "onboarding-required-input is-missing"
    : "onboarding-required-input";
}

function getOnboardingRequiredHintClassName(hasError: boolean) {
  return hasError
    ? "field-hint onboarding-required-hint is-missing"
    : "field-hint onboarding-required-hint";
}

function renderOnboardingRequiredHint(
  hintId: string,
  options: {
    missing: boolean;
    invalid?: boolean;
    invalidText?: string;
    defaultText?: string;
  }
) {
  const hasError = options.missing || Boolean(options.invalid);
  const hintText = options.missing
    ? "필수 입력 사항입니다."
    : options.invalid
      ? options.invalidText
      : options.defaultText;

  if (!hintText) {
    return null;
  }

  return (
    <span id={hintId} className={getOnboardingRequiredHintClassName(hasError)}>
      {hintText}
    </span>
  );
}

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
        <div className="onboarding-main-copy">
          <strong>{onboarding.headline}</strong>
          <p>지금은 연결만 확인합니다.</p>
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
          <div>
            <span>테스트 의미</span>
            <strong>연결만 확인</strong>
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
            <div
              className={
                onboarding.password.hasError
                  ? "password-field onboarding-password-field is-missing"
                  : "password-field onboarding-password-field"
              }
            >
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
                className={
                  onboarding.popbillSharedPassword.hasError
                    ? "password-field onboarding-password-field is-missing"
                    : "password-field onboarding-password-field"
                }
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
                className={
                  onboarding.renewalIssuePassword.hasError
                    ? "password-field onboarding-password-field is-missing"
                    : "password-field onboarding-password-field"
                }
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

        <section className="onboarding-section onboarding-section-muted">
          <div className="onboarding-section-head">
            <strong>나중에 입력 가능</strong>
            <span>필요할 때만</span>
          </div>
          <div className="onboarding-field-grid onboarding-field-grid-single">
            <label>
              인증서 공통 비밀번호 (선택)
              <div className="password-field">
                <input
                  type={reveals.renewalCertificatePassword.visible ? "text" : "password"}
                  value={renewalCertificatePassword}
                  onChange={(event) =>
                    onRenewalCertificatePasswordChange(event.target.value)
                  }
                  placeholder={
                    renewalCertificatePasswordConfigured
                      ? "변경할 때만 다시 입력"
                      : "선택 입력"
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    reveals.renewalCertificatePassword.visible
                      ? "공동인증서 공통 비밀번호 숨기기"
                      : "공동인증서 공통 비밀번호 보기"
                  }
                  onClick={reveals.renewalCertificatePassword.toggle}
                >
                  <RevealIcon open={reveals.renewalCertificatePassword.visible} />
                </button>
              </div>
              <span className="field-hint">
                {renewalCertificatePasswordConfigured
                  ? "이미 저장된 값이 있습니다. 필요하면 아래 보조 영역에서 다시 불러오세요. 엑셀 비밀번호 칸이 비면 이 값을 씁니다."
                  : "비밀번호가 모두 같을 때만 사용합니다. 엑셀 비밀번호 칸이 비면 이 값을 씁니다."}
              </span>
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
              {renewalCertificatePasswordConfigured ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void onLoadCurrentRenewalCertificatePassword()}
                >
                  인증서 공통 비밀번호 불러오기
                </button>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}

type SettingsHelperOnboardingStepProps = {
  helperReady: boolean;
  helperUpgradeRequired: boolean;
  helperUpgradeAvailable: boolean;
  helperActionBlockedReason: string;
  helperStatusLine: string;
  helperOnline: boolean;
  helperCheckedAt: string | null;
  helperCertificateCount: number;
  helperUpgradeMessage: string | null;
  helperLatestVersion: string | null;
  helperMinSupportedVersion: string | null;
  busy: boolean;
  isReadingCertificates: boolean;
  onReadCertificates: () => Promise<void>;
  onRefreshHelper: () => Promise<void>;
  onDownloadHelper: () => void;
  formatDateTime: (value: string | null) => string;
};

export function SettingsHelperOnboardingStep({
  helperReady,
  helperUpgradeRequired,
  helperUpgradeAvailable,
  helperActionBlockedReason,
  helperStatusLine,
  helperOnline,
  helperCheckedAt,
  helperCertificateCount,
  helperUpgradeMessage,
  helperLatestVersion,
  helperMinSupportedVersion,
  busy,
  isReadingCertificates,
  onReadCertificates,
  onRefreshHelper,
  onDownloadHelper,
  formatDateTime
}: SettingsHelperOnboardingStepProps) {
  return (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy">
          <strong>
            {helperReady
              ? "공동인증서 확인 완료"
              : helperUpgradeRequired
                ? "헬퍼를 다시 설치하세요."
                : helperUpgradeAvailable
                  ? "업데이트 후 다시 확인해 두세요."
                  : helperOnline
                    ? "공동인증서를 읽으세요."
                    : "헬퍼를 먼저 실행하세요."}
          </strong>
          <p>{helperStatusLine}</p>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>헬퍼 상태</span>
            <strong>{helperOnline ? "연결됨" : "연결 안 됨"}</strong>
          </div>
          <div>
            <span>읽은 공동인증서</span>
            <strong>{helperCertificateCount}건</strong>
          </div>
          <div>
            <span>마지막 확인</span>
            <strong>{formatDateTime(helperCheckedAt)}</strong>
          </div>
        </div>

        <div className="button-row onboarding-primary-row">
          <button
            type="button"
            disabled={busy || !helperOnline || helperUpgradeRequired}
            title={
              helperUpgradeRequired
                ? helperActionBlockedReason
                : helperOnline
                  ? undefined
                  : "먼저 헬퍼를 설치하고 실행한 뒤 아래 보조 영역에서 상태를 다시 확인하세요."
            }
            onClick={() => void onReadCertificates()}
          >
            {isReadingCertificates ? "공동인증서 읽는 중..." : "공동인증서 읽기"}
          </button>
        </div>
        {helperUpgradeRequired || helperUpgradeAvailable ? (
          <div className="helper-box-stack settings-install-guide">
            <strong>
              {helperUpgradeRequired ? "헬퍼 재설치 필요" : "헬퍼 업데이트 권장"}
            </strong>
            <span>{helperUpgradeMessage}</span>
            {helperLatestVersion ? <span>최신 버전: v{helperLatestVersion}</span> : null}
            {helperMinSupportedVersion ? (
              <span>최소 지원 버전: v{helperMinSupportedVersion}</span>
            ) : null}
          </div>
        ) : null}
      </section>

      <details className="settings-advanced-panel">
        <summary>상태 다시 확인 / 설치 안내 / 다운로드는 필요할 때만 보기</summary>
        <div className="helper-box-stack settings-install-guide">
          <strong>문제 해결과 보조 작업</strong>
          <div className="button-row">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => void onRefreshHelper()}
            >
              상태 다시 확인
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onDownloadHelper}
            >
              헬퍼 다운로드
            </button>
          </div>
          <span>
            고객 PC에서는 <code>renewal-local-helper</code> 압축을 푼 뒤{" "}
            <code>scripts\renewal-helper-install.cmd</code>를 한 번 실행하면 됩니다.
          </span>
          <span>
            설치 직후 바로 시작되고, 이후에는 Windows 로그인 시 자동으로 다시
            실행됩니다.
          </span>
          <span>
            문제가 생기면 바탕화면의 <code>AUTO-TAX Helper Status</code>,{" "}
            <code>AUTO-TAX Helper Start</code>, <code>AUTO-TAX Helper Stop</code>{" "}
            바로가기로 확인할 수 있습니다.
          </span>
        </div>
      </details>
    </div>
  );
}
