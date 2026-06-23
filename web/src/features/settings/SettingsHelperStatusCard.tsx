import React from "react";
import type { SettingsHelperStatusModel } from "./settingsSectionModels";

type SettingsHelperStatusCardProps = {
  helperStatus: SettingsHelperStatusModel;
  showRefreshAction: boolean;
};

export function SettingsHelperStatusCard({
  helperStatus,
  showRefreshAction
}: SettingsHelperStatusCardProps) {
  const isRefreshingHelper = helperStatus.busyKey === "refresh-customer-renewal-helper";
  const isReadingCertificates = helperStatus.busyKey === "customer-renewal-bridge-probe";
  const issueCapableCertificateCountText = isReadingCertificates
    ? "확인 중"
    : `${helperStatus.loadedElectronicTaxCertificateCount + helperStatus.loadedGeneralCertificateCount}건`;

  return (
    <div className="helper-box-stack settings-helper-status-card">
      <div className="settings-helper-status-head">
        <div className="settings-helper-status-meta">
          <span
            className={helperStatus.online ? "chip chip-success" : "chip chip-danger"}
          >
            {helperStatus.online ? "AT 헬퍼 연결됨" : "AT 헬퍼 연결 안 됨"}
          </span>
          {helperStatus.helperVersion ? (
            <span className="chip">v{helperStatus.helperVersion}</span>
          ) : null}
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              window.location.assign(helperStatus.renewalHelperDownloadUrl)
            }
          >
            AT 헬퍼 다운로드
          </button>
          {showRefreshAction ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={helperStatus.busyKey !== null}
              onClick={() =>
                void helperStatus.onRefreshCustomerRenewalAssistant()
              }
            >
              {isRefreshingHelper ? "확인 중..." : "상태 확인"}
            </button>
          ) : null}
          <button type="button" onClick={helperStatus.openCertificates}>
            인증서 화면 열기
          </button>
        </div>
      </div>
      <span>상태: {helperStatus.helperMessage}</span>
      {isReadingCertificates ? (
        <span className="settings-helper-progress">
          공동인증서 읽는 중...
        </span>
      ) : null}
      {helperStatus.certificateReadProgress ? (
        <div
          className={[
            "certificate-read-progress",
            "is-compact",
            helperStatus.certificateReadProgress.status === "done" ? "is-done" : "",
            helperStatus.certificateReadProgress.status === "error" ? "is-error" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="certificate-read-progress-head">
            <div>
              <span>읽기 현황</span>
              <strong>{helperStatus.certificateReadProgress.label}</strong>
            </div>
            <b>
              {helperStatus.certificateReadProgress.totalCount === null
                ? `${helperStatus.certificateReadProgress.completedCount}건`
                : `${helperStatus.certificateReadProgress.completedCount}/${helperStatus.certificateReadProgress.totalCount}건`}
            </b>
          </div>
          <div
            className="certificate-read-progress-track"
            aria-label="공동인증서 확인 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={helperStatus.certificateReadProgress.percent}
            role="progressbar"
          >
            <span style={{ width: `${helperStatus.certificateReadProgress.percent}%` }} />
          </div>
          <p>{helperStatus.certificateReadProgress.detail}</p>
        </div>
      ) : null}
      {helperStatus.upgradeNotice ? (
        <div className="helper-box-stack settings-install-guide">
          <strong>{helperStatus.upgradeNotice.title}</strong>
          <span>{helperStatus.upgradeNotice.message}</span>
          {helperStatus.latestVersion ? (
            <span>최신 버전: v{helperStatus.latestVersion}</span>
          ) : null}
          {helperStatus.minSupportedVersion ? (
            <span>최소 지원 버전: v{helperStatus.minSupportedVersion}</span>
          ) : null}
        </div>
      ) : null}
      <span>마지막 확인: {helperStatus.formatDateTime(helperStatus.checkedAt)}</span>
      <span>발행 가능 공동인증서: {issueCapableCertificateCountText}</span>
      <span>집계 기준: 만료/개인용 제외</span>
    </div>
  );
}
