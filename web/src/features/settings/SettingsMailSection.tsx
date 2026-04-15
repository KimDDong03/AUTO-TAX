import React from "react";
import { RevealIcon, SetupPanel } from "../../components/ui";
import type { SettingsMailSectionModel } from "./settingsSectionModels";

type SettingsMailSectionProps = {
  model: SettingsMailSectionModel;
};

export function SettingsMailSection({ model }: SettingsMailSectionProps) {
  return (
    <SetupPanel
      step={1}
      className="panel-settings-mail"
      title="메일 연결"
      done={model.done}
      note="메일 계정 연결 / 테스트"
      actions={
        <button
          disabled={model.busyKey !== null}
          onClick={() => void model.onRunMailSettingsTest()}
        >
          {model.isMailTesting ? "연결 테스트 중..." : "메일 연결 테스트"}
        </button>
      }
    >
      {model.isMailTesting ? (
        <div className="settings-action-feedback">
          <span className="chip chip-warn">테스트 중</span>
          <span>IMAP/SMTP 연결을 확인하고 있습니다.</span>
        </div>
      ) : null}
      <div className="form-grid">
        <div className="settings-detected-provider full">
          <span>첫 동기화 시 읽는 기본 범위</span>
          <strong>최근 메일 1000통</strong>
          <p className="settings-inline-help">실제 수집은 홈 준비 단계에서 실행합니다.</p>
        </div>
        <div className="settings-detected-provider full">
          <span>자동으로 찾은 메일 서비스</span>
          <strong>{model.detectedMailProviderLabel}</strong>
        </div>
        <label>
          메일 주소
          <input
            placeholder="example@mail.com"
            value={model.fields.mailAddress}
            onChange={(event) => model.onMailAddressChange(event.target.value)}
          />
          <span className="field-hint">
            읽기 / 알림에 같이 쓰는 계정입니다.
          </span>
        </label>
        <label>
          앱 비밀번호
          <div className="password-field">
            <input
              type={model.mailPasswordReveal.visible ? "text" : "password"}
              value={model.fields.mailPassword}
              onChange={(event) => model.onMailPasswordChange(event.target.value)}
              placeholder={
                model.mailPasswordConfigured
                  ? "변경할 때만 다시 입력"
                  : "앱 비밀번호 입력"
              }
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={
                model.mailPasswordReveal.visible
                  ? "앱 비밀번호 숨기기"
                  : "앱 비밀번호 보기"
              }
              onClick={model.mailPasswordReveal.toggle}
            >
              <RevealIcon open={model.mailPasswordReveal.visible} />
            </button>
          </div>
          <span className="field-hint">
            {model.mailPasswordConfigured
              ? "이미 저장된 앱 비밀번호가 있습니다. 바꿀 때만 다시 입력하세요. 테스트 연결 시 빈칸이면 서버에 저장된 값을 사용합니다."
              : "위 메일 주소로 로그인할 때 쓰는 앱 비밀번호입니다. 수신/발신 모두 이 값을 사용합니다."}
          </span>
        </label>
        <label className="full">
          알림 수신 메일
          <textarea
            rows={4}
            value={model.fields.notificationEmailsText}
            onChange={(event) =>
              model.onNotificationEmailsTextChange(event.target.value)
            }
          />
          <span className="field-hint">실패 알림 수신 주소</span>
        </label>
        <details className="settings-advanced-panel full">
          <summary>자동 발행 일정</summary>
          <div className="helper-box">
            <strong>매달 자동 실행 일정</strong>
            <div className="fields three-column">
              <label>
                자동 실행
                <select
                  value={model.fields.schedulerEnabled ? "on" : "off"}
                  onChange={(event) =>
                    model.onSchedulerEnabledChange(event.target.value === "on")
                  }
                >
                  <option value="on">사용</option>
                  <option value="off">중지</option>
                </select>
              </label>
              <label>
                실행일
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={model.fields.defaultIssueDay}
                  onChange={(event) =>
                    model.onDefaultIssueDayChange(event.target.value)
                  }
                />
              </label>
              <label>
                실행 시각
                <div className="inline-time-fields">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={model.fields.defaultIssueHour}
                    onChange={(event) =>
                      model.onDefaultIssueHourChange(event.target.value)
                    }
                  />
                  <span>:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={model.fields.defaultIssueMinute}
                    onChange={(event) =>
                      model.onDefaultIssueMinuteChange(event.target.value)
                    }
                  />
                </div>
              </label>
            </div>
            <span>기본값은 매월 26일입니다.</span>
          </div>
        </details>
      </div>
    </SetupPanel>
  );
}
