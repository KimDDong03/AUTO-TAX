import React from "react";

type SettingsHelperInstallGuideProps = {
  showAutoRunShortcutNote?: boolean;
};

export function SettingsHelperInstallGuide({
  showAutoRunShortcutNote = false
}: SettingsHelperInstallGuideProps) {
  return (
    <details className="settings-advanced-panel">
      <summary>설치 안내</summary>
      <div className="helper-box-stack settings-install-guide">
        <strong>설치 안내</strong>
        <span>
          고객 PC에서 <code>renewal-local-helper</code> 압축을 푼 뒤{" "}
          <code>scripts\renewal-helper-install.cmd</code>를 한 번 실행합니다.
        </span>
        <span>
          설치 직후 시작되고 이후에는 Windows 로그인 때 자동 실행됩니다.
        </span>
        <span>
          문제 시 바탕화면의 <code>AUTO-TAX Helper Status</code>, <code>Start</code>,{" "}
          <code>Stop</code> 바로가기로 확인합니다.
        </span>
        {showAutoRunShortcutNote ? (
          <span>자동실행만 꺼도 Start / Stop / Status 바로가기는 그대로 남습니다.</span>
        ) : null}
      </div>
    </details>
  );
}
