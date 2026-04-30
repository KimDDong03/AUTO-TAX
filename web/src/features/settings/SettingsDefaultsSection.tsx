import React from "react";
import { RevealIcon, SetupPanel } from "../../components/ui";
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
      note="신규 고객 기본 발행값을 확인합니다."
    >
      <div className="settings-field-stack">
        <section className="settings-field-group">
          <div className="settings-field-group-head">
            <strong>필수 공통값</strong>
            <span>담당자 정보와 인증서 발급용 값을 관리합니다.</span>
          </div>
          <div className="settings-defaults-grid">
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
                작업공간 운영값:{" "}
                {model.settingsHealth.operatorReady ? "준비됨" : "설정 필요"}
              </span>
            </div>
          </div>
        </section>

      </div>
    </SetupPanel>
  );
}
