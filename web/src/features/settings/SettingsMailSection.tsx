import React from "react";
import { RevealIcon, SetupPanel } from "../../components/ui";
import type { SettingsMailSectionModel } from "./settingsSectionModels";

type SettingsMailSectionProps = {
  model: SettingsMailSectionModel;
};

export function SettingsMailSection({ model }: SettingsMailSectionProps) {
  return (
    <SetupPanel
      step={3}
      className="panel-settings-mail"
      title="메일 연결하기"
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
          <span>메일 계정 연결을 확인하고 있습니다.</span>
        </div>
      ) : null}
      <div className="form-grid">
        <label>
          메일 주소
          <input
            placeholder="example@mail.com"
            value={model.fields.mailAddress}
            onChange={(event) => model.onMailAddressChange(event.target.value)}
          />
          <span className="field-hint">
            한전 메일 수신 주소의 메일을 읽는 계정입니다.
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
              ? "변경할 때만 다시 입력하세요."
              : "위 메일 주소로 로그인할 때 쓰는 앱 비밀번호입니다. 메일 읽기 연결에 사용합니다."}
          </span>
        </label>
        {model.requiresManualImapSettings ? (
          <div className="helper-box full">
            <strong>IMAP 직접 설정</strong>
            <span>자동 설정을 지원하지 않는 메일은 수신 서버 정보를 입력해야 합니다.</span>
            <div className="fields four-column">
              <label>
                IMAP 서버
                <input
                  placeholder="imap.company.co.kr"
                  value={model.fields.imapHost}
                  onChange={(event) => model.onImapHostChange(event.target.value)}
                />
              </label>
              <label>
                포트
                <input
                  inputMode="numeric"
                  placeholder="993"
                  value={model.fields.imapPort}
                  onChange={(event) => model.onImapPortChange(event.target.value)}
                />
              </label>
              <label>
                보안
                <select
                  value={model.fields.imapSecure ? "ssl" : "plain"}
                  onChange={(event) =>
                    model.onImapSecureChange(event.target.value === "ssl")
                  }
                >
                  <option value="ssl">SSL 사용</option>
                  <option value="plain">SSL 미사용</option>
                </select>
              </label>
              <label>
                읽을 폴더
                <input
                  placeholder="*"
                  value={model.fields.imapMailbox}
                  onChange={(event) => model.onImapMailboxChange(event.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </SetupPanel>
  );
}
