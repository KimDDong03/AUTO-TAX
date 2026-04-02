import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "../../components/ui";

type OnboardingStep = {
  id: string;
  step: number;
  title: string;
  summary: string;
  done: boolean;
};

type OnboardingSectionId = "mail" | "defaults" | "registration" | "first-run";

type OnboardingTabProps = {
  setupPendingCount: number;
  customerCount: number;
  quickRegisterMessageCount: number;
  pendingCertificateRegistrationCount: number;
  linkedCertificateCount: number;
  steps: OnboardingStep[];
  onOpenSettings: () => void;
  mailSetupContent: React.ReactNode;
  defaultsContent: React.ReactNode;
  registrationContent: React.ReactNode;
  firstRunContent: React.ReactNode;
};

export function OnboardingTab(props: OnboardingTabProps) {
  const stepToSectionId = (stepId: string): OnboardingSectionId => {
    switch (stepId) {
      case "mail":
        return "mail";
      case "defaults":
        return "defaults";
      case "customers":
      case "certificates":
        return "registration";
      case "first-run":
        return "first-run";
      default:
        return "mail";
    }
  };

  const defaultActiveStepId = useMemo(
    () => props.steps.find((step) => !step.done)?.id ?? props.steps[props.steps.length - 1]?.id ?? "mail",
    [props.steps]
  );
  const [activeStepId, setActiveStepId] = useState(defaultActiveStepId);

  useEffect(() => {
    setActiveStepId((current) => {
      const currentStep = props.steps.find((step) => step.id === current);
      if (!currentStep) {
        return defaultActiveStepId;
      }
      return current;
    });
  }, [defaultActiveStepId, props.steps]);

  const activeStep = props.steps.find((step) => step.id === activeStepId) ?? props.steps[0] ?? null;
  const activeStepIndex = activeStep ? props.steps.findIndex((step) => step.id === activeStep.id) : -1;
  const previousStep = activeStepIndex > 0 ? props.steps[activeStepIndex - 1] : null;
  const nextStep = activeStepIndex >= 0 && activeStepIndex < props.steps.length - 1 ? props.steps[activeStepIndex + 1] : null;
  const activeSectionId = activeStep ? stepToSectionId(activeStep.id) : "mail";
  const activeContent =
    activeSectionId === "mail"
      ? props.mailSetupContent
      : activeSectionId === "defaults"
        ? props.defaultsContent
        : activeSectionId === "registration"
          ? props.registrationContent
          : props.firstRunContent;
  const focusStep = (stepId: string) => {
    setActiveStepId(stepId);
    const sectionId = stepToSectionId(stepId);
    window.requestAnimationFrame(() => {
      document.getElementById(`onboarding-${sectionId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  };

  return (
    <div className="onboarding-screen">
      <Panel
        className="panel-onboarding-overview"
        title="첫 발행까지 5단계"
        subtitle="단계만 바꿔서 아래에서 처리합니다."
        actions={
          <button type="button" className="btn-secondary" onClick={props.onOpenSettings}>
            고급 설정 열기
          </button>
        }
      >
        <div className="onboarding-overview-head">
          <div className="onboarding-overview-copy">
            <strong>{props.setupPendingCount === 0 ? "기본 준비를 마쳤습니다." : `기본 준비 ${props.setupPendingCount}개가 남아 있습니다.`}</strong>
            <span>남은 단계만 처리하면 됩니다.</span>
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
            <article
              key={step.id}
              className={[
                "onboarding-step-card",
                step.done ? "is-done" : "",
                step.id === activeStepId ? "is-active" : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="onboarding-step-card-head">
                <div className="onboarding-step-title-row">
                  <span className="setup-order">{step.step}</span>
                  <strong>{step.title}</strong>
                </div>
                <span className={`chip ${step.done ? "chip-success" : "chip-warn"}`}>{step.done ? "완료" : "진행 필요"}</span>
              </div>
              <p>{step.summary}</p>
              <button
                type="button"
                className={step.id === activeStepId ? "btn-primary" : "btn-secondary"}
                onClick={() => focusStep(step.id)}
              >
                {step.id === activeStepId ? "현재 단계" : "이 단계 열기"}
              </button>
            </article>
          ))}
        </div>
      </Panel>

      {activeStep ? (
        <div className="onboarding-flow-stack">
          <section className="onboarding-active-stage">
            <div className="onboarding-active-stage-head">
              <div className="onboarding-active-stage-copy">
                <span className="chip chip-default">현재 단계 {activeStep.step}</span>
                <strong>{activeStep.title}</strong>
                <p>{activeStep.summary}</p>
              </div>
              <div className="onboarding-active-stage-actions">
                <button type="button" className="btn-secondary" disabled={!previousStep} onClick={() => previousStep && focusStep(previousStep.id)}>
                  이전 단계
                </button>
                <button type="button" className="btn-secondary" disabled={!nextStep} onClick={() => nextStep && focusStep(nextStep.id)}>
                  다음 단계
                </button>
              </div>
            </div>

            <section className="onboarding-flow-section" id={`onboarding-${activeSectionId}`}>
              {activeContent}
            </section>
          </section>
        </div>
      ) : null}
    </div>
  );
}
