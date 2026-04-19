import React from "react";
import { RevealIcon, SetupPanel } from "../../components/ui";
import { SettingsHelperInstallGuide } from "./SettingsHelperInstallGuide";
import { SettingsHelperStatusCard } from "./SettingsHelperStatusCard";
import type { SettingsDefaultsSectionModel } from "./settingsSectionModels";

type SettingsDefaultsSectionProps = {
  model: SettingsDefaultsSectionModel;
};

export function SettingsDefaultsSection({
  model
}: SettingsDefaultsSectionProps) {
  return (
    <SetupPanel
      step={2}
      className="panel-settings-popbill"
      title="발행 설정"
      done={model.done}
      note="신규 고객 팝빌 가입과 발행 기본값을 입력합니다."
    >
      <div className="settings-field-stack">
        <section className="settings-field-group">
          <div className="settings-field-group-head">
            <strong>필수 공통값</strong>
            <span>신규 고객과 첫 발행에 공통으로 사용합니다.</span>
          </div>
          <div className="settings-defaults-grid">
            <label className="settings-defaults-cell">
              팝빌 ID 접두어
              <input
                value={model.fields.popbillUserIdPrefix}
                onChange={(event) =>
                  model.onPopbillUserIdPrefixChange(event.target.value)
                }
                placeholder="예: TEST_"
              />
              <span className="field-hint">
                예: `TEST_001`처럼 신규 고객 팝빌 아이디 앞에 붙습니다.
              </span>
            </label>

            <label className="settings-defaults-cell">
              담당자 이름
              <input
                value={model.fields.operatorContactName}
                onChange={(event) =>
                  model.onOperatorContactNameChange(event.target.value)
                }
                placeholder="담당자 이름"
              />
            </label>

            <label className="settings-defaults-cell">
              담당자 연락처
              <input
                value={model.fields.operatorContactTel}
                onChange={(event) =>
                  model.onOperatorContactTelChange(event.target.value)
                }
                placeholder="01012345678"
              />
            </label>

            <label className="settings-defaults-cell">
              담당자 이메일
              <input
                type="email"
                value={model.fields.operatorContactEmail}
                onChange={(event) =>
                  model.onOperatorContactEmailChange(event.target.value)
                }
                placeholder="operator@example.com"
              />
            </label>

            <label className="settings-defaults-cell">
              신규 고객 기본 비밀번호
              <div className="password-field">
                <input
                  type={
                    model.reveals.popbillSharedPassword.visible
                      ? "text"
                      : "password"
                  }
                  value={model.fields.popbillSharedPassword}
                  onChange={(event) =>
                    model.onPopbillSharedPasswordChange(event.target.value)
                  }
                  placeholder={
                    model.configured.popbillSharedPassword
                      ? "변경할 때만 다시 입력"
                      : "신규 고객 기본 비밀번호"
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    model.reveals.popbillSharedPassword.visible
                      ? "신규 고객 기본 비밀번호 숨기기"
                      : "신규 고객 기본 비밀번호 보기"
                  }
                  onClick={model.reveals.popbillSharedPassword.toggle}
                >
                  <RevealIcon
                    open={model.reveals.popbillSharedPassword.visible}
                  />
                </button>
              </div>
              <div className="field-meta-row">
                <span className="field-hint">
                  {model.configured.popbillSharedPassword
                    ? "이미 저장된 값이 있습니다. 필요하면 다시 불러오세요."
                    : "신규 고객 팝빌 계정의 초기 비밀번호입니다."}
                </span>
                {model.configured.popbillSharedPassword ? (
                  <div className="field-action-row">
                    <button
                      type="button"
                      className="btn-secondary field-inline-action"
                      disabled={model.busyKey !== null}
                      onClick={() =>
                        void model.onLoadCurrentPopbillSharedPassword()
                      }
                    >
                      저장된 비밀번호 불러오기
                    </button>
                  </div>
                ) : null}
              </div>
            </label>

            <label className="settings-defaults-cell">
              공동인증서 발급용 임시 비밀번호
              <div className="password-field">
                <input
                  type={
                    model.reveals.renewalIssuePassword.visible
                      ? "text"
                      : "password"
                  }
                  value={model.fields.renewalIssuePassword}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    model.onRenewalIssuePasswordChange(event.target.value)
                  }
                  placeholder={
                    model.configured.renewalIssuePassword
                      ? "변경할 때만 다시 입력"
                      : "숫자 6자리 입력"
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    model.reveals.renewalIssuePassword.visible
                      ? "발급용 임시 비밀번호 숨기기"
                      : "발급용 임시 비밀번호 보기"
                  }
                  onClick={model.reveals.renewalIssuePassword.toggle}
                >
                  <RevealIcon
                    open={model.reveals.renewalIssuePassword.visible}
                  />
                </button>
              </div>
              <div className="field-meta-row">
                <span className="field-hint">
                  {model.configured.renewalIssuePassword
                    ? "이미 저장된 값이 있습니다. 필요하면 다시 불러오세요."
                    : "공동인증서 발급/갱신 요청에 쓰는 6자리 번호입니다."}
                </span>
                {model.configured.renewalIssuePassword ? (
                  <div className="field-action-row">
                    <button
                      type="button"
                      className="btn-secondary field-inline-action"
                      disabled={model.busyKey !== null}
                      onClick={() =>
                        void model.onLoadCurrentRenewalIssuePassword()
                      }
                    >
                      저장된 임시 비밀번호 불러오기
                    </button>
                  </div>
                ) : null}
              </div>
            </label>

            <div className="settings-defaults-status">
              <strong>입력 상태</strong>
              <span>
                팝빌 연결:{" "}
                {model.settingsHealth.popbillReady ? "준비됨" : "설정 필요"}
              </span>
              <span>
                작업공간 운영값:{" "}
                {model.settingsHealth.operatorReady ? "준비됨" : "설정 필요"}
              </span>
            </div>
          </div>
        </section>

        <section className="settings-field-group">
          <div className="settings-field-group-head">
            <strong>로컬 헬퍼 준비</strong>
            <span>현재 PC에서 공동인증서를 읽을 수 있는지 확인합니다.</span>
          </div>
          <SettingsHelperStatusCard
            helperStatus={model.helperStatus}
            showRefreshAction={true}
          />
          <SettingsHelperInstallGuide showAutoRunShortcutNote={true} />
        </section>
      </div>
    </SetupPanel>
  );
}
