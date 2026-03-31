import type React from "react";
import { Panel } from "../../components/ui";

type OnboardingStep = {
  id: string;
  step: number;
  title: string;
  summary: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
};

type OnboardingTabProps = {
  setupPendingCount: number;
  customerCount: number;
  quickRegisterMessageCount: number;
  pendingCertificateRegistrationCount: number;
  linkedCertificateCount: number;
  steps: OnboardingStep[];
  onOpenSettings: () => void;
  registrationContent: React.ReactNode;
};

export function OnboardingTab(props: OnboardingTabProps) {
  return (
    <div className="onboarding-screen">
      <Panel
        className="panel-onboarding-overview"
        title="첫 발행까지 5단계"
        subtitle="도입 준비는 여기서 순서대로 확인하고, 세부값은 작업공간 설정에서 계속 수정합니다."
        actions={
          <button type="button" className="btn-secondary" onClick={props.onOpenSettings}>
            작업공간 설정 열기
          </button>
        }
      >
        <div className="onboarding-overview-head">
          <div className="onboarding-overview-copy">
            <strong>{props.setupPendingCount === 0 ? "기본 준비를 마쳤습니다." : `기본 준비 ${props.setupPendingCount}개가 남아 있습니다.`}</strong>
            <span>메일 연결, 발행 기본값, 고객과 인증서 연결이 끝나면 오늘 작업에서 바로 첫 동기화와 발행 확인이 가능합니다.</span>
          </div>
          <div className="onboarding-overview-metrics">
            <div>
              <span>등록 고객</span>
              <strong>{props.customerCount}명</strong>
            </div>
            <div>
              <span>미등록 메일</span>
              <strong>{props.quickRegisterMessageCount}건</strong>
            </div>
            <div>
              <span>연결된 인증서</span>
              <strong>{props.linkedCertificateCount}건</strong>
            </div>
            <div>
              <span>자동 등록 남음</span>
              <strong>{props.pendingCertificateRegistrationCount}건</strong>
            </div>
          </div>
        </div>
        <div className="onboarding-step-grid">
          {props.steps.map((step) => (
            <article key={step.id} className={step.done ? "onboarding-step-card is-done" : "onboarding-step-card"}>
              <div className="onboarding-step-card-head">
                <div className="onboarding-step-title-row">
                  <span className="setup-order">{step.step}</span>
                  <strong>{step.title}</strong>
                </div>
                <span className={`chip ${step.done ? "chip-success" : "chip-warn"}`}>{step.done ? "완료" : "진행 필요"}</span>
              </div>
              <p>{step.summary}</p>
              <button type="button" className="btn-secondary" onClick={step.onAction}>
                {step.actionLabel}
              </button>
            </article>
          ))}
        </div>
      </Panel>

      <section className="onboarding-registration-block" id="onboarding-registration">
        {props.registrationContent}
      </section>
    </div>
  );
}
