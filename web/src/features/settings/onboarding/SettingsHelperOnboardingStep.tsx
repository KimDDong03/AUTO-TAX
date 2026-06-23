import React from "react";
import type { SettingsCertificateReadProgress } from "../settingsSectionModels";

type SettingsHelperOnboardingStepProps = {
  helperReady: boolean;
  helperUpgradeRequired: boolean;
  helperUpgradeAvailable: boolean;
  helperActionBlockedReason: string;
  helperStatusLine: string;
  helperOnline: boolean;
  electronicTaxCertificateCount: number;
  generalCertificateCount: number;
  certificateReadProgress: SettingsCertificateReadProgress;
  busy: boolean;
  isReadingCertificates?: boolean;
  onRefreshHelper: () => Promise<void>;
  onReadCertificates?: () => Promise<void>;
  onDownloadHelper: () => void;
};

export function SettingsHelperOnboardingStep({
  helperReady,
  helperUpgradeRequired,
  helperUpgradeAvailable,
  helperActionBlockedReason,
  helperStatusLine,
  helperOnline,
  electronicTaxCertificateCount,
  generalCertificateCount,
  certificateReadProgress,
  busy,
  isReadingCertificates = false,
  onRefreshHelper,
  onReadCertificates,
  onDownloadHelper
}: SettingsHelperOnboardingStepProps) {
  const helperVersionMismatch = helperUpgradeRequired || helperUpgradeAvailable;
  const issueCapableCertificateCount =
    electronicTaxCertificateCount + generalCertificateCount;
  const headline = helperReady
    ? "AT 헬퍼 준비 완료"
      : helperVersionMismatch
        ? helperUpgradeRequired
          ? "AT 헬퍼 재설치 필요"
        : "AT 헬퍼 업데이트 필요"
      : helperOnline
        ? "공동인증서 프로그램 확인 완료"
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
            <span>발행 가능 공동인증서</span>
            <strong>{issueCapableCertificateCount}건</strong>
          </div>
          <div>
            <span>집계 기준</span>
            <strong>만료/개인용 제외</strong>
          </div>
        </div>

        {certificateReadProgress ? (
          <div
            className={[
              "certificate-read-progress",
              certificateReadProgress.status === "done" ? "is-done" : "",
              certificateReadProgress.status === "error" ? "is-error" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="certificate-read-progress-head">
              <div>
                <span>읽기 현황</span>
                <strong>{certificateReadProgress.label}</strong>
              </div>
              <b>
                {certificateReadProgress.totalCount === null
                  ? `${certificateReadProgress.completedCount}건`
                  : `${certificateReadProgress.completedCount}/${certificateReadProgress.totalCount}건`}
              </b>
            </div>
            <div
              className="certificate-read-progress-track"
              aria-label="공동인증서 파일/폴더 선택 진행률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={certificateReadProgress.percent}
              role="progressbar"
            >
              <span style={{ width: `${certificateReadProgress.percent}%` }} />
            </div>
            <p>{certificateReadProgress.detail}</p>
          </div>
        ) : null}

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
          {onReadCertificates ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => void onReadCertificates()}
            >
              {isReadingCertificates ? "읽는 중..." : "공동인증서 읽기"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
