import React from "react";
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
  const helperVersionMismatch = helperUpgradeRequired || helperUpgradeAvailable;
  const readBlockedReason = helperVersionMismatch
    ? helperActionBlockedReason
    : helperOnline
      ? undefined
      : "먼저 로컬 헬퍼를 실행한 뒤 상태를 다시 확인하세요.";
  const headline = helperReady
    ? "공동인증서 확인 완료"
    : helperVersionMismatch
      ? helperUpgradeRequired
        ? "헬퍼 재설치 필요"
        : "헬퍼 업데이트 권장"
      : helperOnline
        ? "공동인증서 읽기"
        : "헬퍼 실행 필요";

  return (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy onboarding-task-copy">
          <strong>{headline}</strong>
          {helperVersionMismatch && helperUpgradeMessage ? <p>{helperUpgradeMessage}</p> : null}
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>현재 상태</span>
            <strong>{helperStatusLine}</strong>
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

        <div className="button-row onboarding-primary-row onboarding-primary-row-focal">
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
          <button
            type="button"
            disabled={busy || !helperOnline || helperVersionMismatch}
            title={readBlockedReason}
            onClick={() => void onReadCertificates()}
          >
            {isReadingCertificates ? "공동인증서 읽는 중..." : "공동인증서 읽기"}
          </button>
        </div>
        {helperUpgradeRequired || helperUpgradeAvailable ? (
          <details className="settings-advanced-panel">
            <summary>버전 정보 보기</summary>
            {helperLatestVersion ? <span>최신 버전: v{helperLatestVersion}</span> : null}
            {helperMinSupportedVersion ? (
              <span>최소 지원 버전: v{helperMinSupportedVersion}</span>
            ) : null}
          </details>
        ) : null}
      </section>

      <details className="settings-advanced-panel">
        <summary>설치 안내는 필요할 때만 보기</summary>
        <div className="helper-box-stack settings-install-guide">
          <strong>설치 안내</strong>
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
