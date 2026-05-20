import React from "react";
import { SetupPanel } from "../../components/ui";
import { SettingsHelperStatusCard } from "./SettingsHelperStatusCard";
import type { SettingsHelperSectionModel } from "./settingsSectionModels";

type SettingsHelperSectionProps = {
  model: SettingsHelperSectionModel;
};

export function SettingsHelperSection({
  model
}: SettingsHelperSectionProps) {
  return (
    <SetupPanel
      step={4}
      className="panel-settings-helper"
      title="AT 헬퍼"
      done={model.done}
      note="AT 헬퍼 연결 / 인증서 읽기 요약"
      actions={
        <div className="button-row">
          <button
            type="button"
            className="btn-secondary"
            disabled={model.helperStatus.busyKey !== null}
            onClick={() =>
              void model.helperStatus.onRefreshCustomerRenewalAssistant()
            }
          >
            상태 다시 확인
          </button>
          <button type="button" onClick={model.helperStatus.openCertificates}>
            인증서 화면 열기
          </button>
        </div>
      }
    >
      <div className="settings-field-stack">
        <section className="settings-field-group">
          <div className="settings-field-group-head">
            <strong>AT 헬퍼</strong>
            <span>현재 연결 상태</span>
          </div>
          <SettingsHelperStatusCard
            helperStatus={model.helperStatus}
            showRefreshAction={false}
          />
        </section>
      </div>
    </SetupPanel>
  );
}
