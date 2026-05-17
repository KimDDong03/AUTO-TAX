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
  const isCheckingHelper =
    helperStatus.busyKey === "refresh-customer-renewal-helper" ||
    helperStatus.busyKey === "customer-renewal-bridge-probe";
  const certificateCountText = isCheckingHelper ? "확인 중" : `${helperStatus.loadedCertificateCount}건`;

  return (
    <div className="helper-box-stack settings-helper-status-card">
      <div className="settings-helper-status-head">
        <div className="settings-helper-status-meta">
          <span
            className={helperStatus.online ? "chip chip-success" : "chip chip-danger"}
          >
            {helperStatus.online ? "연결됨" : "연결 안 됨"}
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
            헬퍼 다운로드
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
              {isCheckingHelper ? "확인 중..." : "상태 다시 확인"}
            </button>
          ) : null}
          <button type="button" onClick={helperStatus.openCertificates}>
            인증서 화면 열기
          </button>
        </div>
      </div>
      <span>상태: {helperStatus.helperMessage}</span>
      {isCheckingHelper ? (
        <span className="settings-helper-progress">
          공동인증서를 읽는 중입니다. 잠시만 기다려 주세요.
        </span>
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
      <span>읽은 공동인증서: {certificateCountText}</span>
    </div>
  );
}
