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
      : "AT 헬퍼 실행 후 상태를 확인하세요.";
  const headline = helperReady
    ? "공동인증서 확인 완료"
      : helperVersionMismatch
        ? helperUpgradeRequired
          ? "AT 헬퍼 재설치 필요"
        : "AT 헬퍼 업데이트 필요"
      : helperOnline
        ? "공동인증서 읽기"
        : "AT 헬퍼 실행 필요";

  return (
    <div className="onboarding-step-body">
      <section className="onboarding-main-card">
        <div className="onboarding-main-copy onboarding-task-copy">
          <strong>{headline}</strong>
        </div>

        <div className="onboarding-inline-status">
          <div>
            <span>상태</span>
            <strong>{helperStatusLine}</strong>
          </div>
          <div>
            <span>전자세금용 공동인증서</span>
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
            onClick={onDownloadHelper}
          >
            AT 헬퍼 다운로드
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void onRefreshHelper()}
          >
            상태 확인
          </button>
          <button
            type="button"
            disabled={busy || !helperOnline || helperVersionMismatch}
            title={readBlockedReason}
            onClick={() => void onReadCertificates()}
          >
            {isReadingCertificates ? "읽는 중..." : "공동인증서 읽기"}
          </button>
        </div>
      </section>
    </div>
  );
}
