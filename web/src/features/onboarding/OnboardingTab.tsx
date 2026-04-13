import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type OnboardingStepTone = "default" | "muted";

export type OnboardingStep = {
  id: string;
  step: number;
  title: string;
  summary: string;
  why: string;
  primaryActionLabel: string;
  blockedReason?: string;
  tone?: OnboardingStepTone;
  done: boolean;
  content: React.ReactNode;
};

type OnboardingTabProps = {
  pendingStepCount: number;
  customerCount: number;
  quickRegisterMessageCount: number;
  pendingCertificateRegistrationCount: number;
  linkedCertificateCount: number;
  steps: OnboardingStep[];
  requestedStepId?: string | null;
  onOpenSettings: () => void;
};

export function OnboardingTab(props: OnboardingTabProps) {
  const recommendedStepId = useMemo(
    () => props.steps.find((step) => !step.done)?.id ?? props.steps[props.steps.length - 1]?.id ?? "mail",
    [props.steps]
  );
  const [activeStepId, setActiveStepId] = useState(recommendedStepId);
  const previousRecommendedStepIdRef = useRef(recommendedStepId);

  useEffect(() => {
    setActiveStepId((current) => {
      const currentStep = props.steps.find((step) => step.id === current);
      if (!currentStep) {
        return recommendedStepId;
      }
      return current;
    });
  }, [recommendedStepId, props.steps]);

  useEffect(() => {
    const previousRecommendedStepId = previousRecommendedStepIdRef.current;
    if (previousRecommendedStepId !== recommendedStepId && activeStepId === previousRecommendedStepId) {
      setActiveStepId(recommendedStepId);
    }
    previousRecommendedStepIdRef.current = recommendedStepId;
  }, [activeStepId, recommendedStepId]);

  useEffect(() => {
    if (!props.requestedStepId || !props.steps.some((step) => step.id === props.requestedStepId)) {
      return;
    }

    setActiveStepId(props.requestedStepId);
    window.requestAnimationFrame(() => {
      document.getElementById("onboarding-active-step")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [props.requestedStepId, props.steps]);

  const recommendedStep = props.steps.find((step) => step.id === recommendedStepId) ?? props.steps[0] ?? null;
  const activeStep = props.steps.find((step) => step.id === activeStepId) ?? recommendedStep;
  const activeStepIndex = activeStep ? props.steps.findIndex((step) => step.id === activeStep.id) : -1;
  const activeStepNext = activeStepIndex >= 0 && activeStepIndex < props.steps.length - 1 ? props.steps[activeStepIndex + 1] : null;
  const completedSteps = props.steps.filter((step) => step.done);
  const remainingSteps = props.steps.filter((step) => !step.done);
  const futureStepCount = activeStepIndex >= 0 ? Math.max(props.steps.length - activeStepIndex - 1, 0) : 0;
  const activeStepStatusLabel = activeStep?.done
    ? "완료한 단계"
    : activeStep?.id === recommendedStepId
      ? "현재 단계"
      : "선택한 단계";

  return (
    <div className="onboarding-screen">
      {activeStep ? (
        <section className={activeStep.tone === "muted" ? "onboarding-wizard-shell is-muted" : "onboarding-wizard-shell"} id="onboarding-active-step">
          <header className={activeStep.tone === "muted" ? "onboarding-wizard-hero is-muted" : "onboarding-wizard-hero"}>
            <div className="onboarding-wizard-progress-row">
              <span className={activeStep.done ? "chip chip-success" : activeStep.id === recommendedStepId ? "chip chip-warn" : "chip"}>
                {activeStepStatusLabel}
              </span>
              <span className="onboarding-wizard-progress-count">{`${activeStep.step}/${props.steps.length} 단계`}</span>
            </div>

            <div className="onboarding-wizard-copy">
              <strong>{activeStep.title}</strong>
              <p>{activeStep.why}</p>
            </div>

            <div className="onboarding-wizard-focus">
              <div>
                <span>지금 눌러야 할 버튼</span>
                <strong>{activeStep.primaryActionLabel}</strong>
              </div>
              <div>
                <span>끝나면 다음</span>
                <strong>
                  {activeStepNext ? `${activeStepNext.step}단계 · ${activeStepNext.title}` : "첫 발행 확인까지 마쳤습니다."}
                </strong>
              </div>
            </div>

            <div className={activeStep.tone === "muted" ? "onboarding-wizard-current-note is-muted" : "onboarding-wizard-current-note"}>
              <strong>{activeStep.summary}</strong>
              <span>
                {!activeStep.done && activeStep.blockedReason
                  ? activeStep.blockedReason
                  : activeStep.done
                  ? "완료한 단계 내용은 아래에서 다시 확인할 수 있습니다."
                  : activeStep.id === recommendedStepId
                    ? "지금은 이 단계만 보고, 나머지 단계는 아래 약한 진행 요약으로만 확인하면 됩니다."
                    : "지금 해야 할 단계가 따로 있어도, 이 단계만 미리 열어 확인할 수 있습니다."}
              </span>
            </div>
          </header>

          <section className="onboarding-flow-section">{activeStep.content}</section>
        </section>
      ) : null}

      <section className="onboarding-progress-footer">
        <div className="onboarding-progress-block">
          <span className="onboarding-progress-label">완료한 단계</span>
          {completedSteps.length > 0 ? (
            <ul className="onboarding-progress-list">
              {completedSteps.map((step) => (
                <li key={`completed-${step.id}`}>{`${step.step}단계 · ${step.title}`}</li>
              ))}
            </ul>
          ) : (
            <p className="onboarding-progress-note">아직 완료한 단계가 없습니다.</p>
          )}
        </div>

        <div className="onboarding-progress-block is-current">
          <span className="onboarding-progress-label">지금 위치</span>
          <strong>{activeStep ? `${activeStep.step}단계 · ${activeStep.title}` : "단계를 확인하는 중입니다."}</strong>
          <p className="onboarding-progress-note">
            {props.pendingStepCount === 0
              ? "첫 발행까지 필요한 기본 흐름을 모두 확인했습니다."
              : `남은 기본 단계 ${remainingSteps.length}개 중 현재 단계 1개만 크게 보여줍니다.`}
          </p>
        </div>

        <div className="onboarding-progress-block">
          <span className="onboarding-progress-label">다음 미리 보기</span>
          <strong>{activeStepNext ? `${activeStepNext.step}단계 · ${activeStepNext.title}` : "이후 남은 단계가 없습니다."}</strong>
          <p className="onboarding-progress-note">
            {futureStepCount > 1 ? `이후 ${futureStepCount - 1}단계는 지금 숨겨 두고, 다음 단계가 끝날 때만 순서대로 드러납니다.` : "먼 미래 단계는 여기서 크게 보이지 않게 유지합니다."}
          </p>
        </div>

        <details className="onboarding-advanced-details onboarding-progress-details">
          <summary>문제 해결 / 작업공간 설정은 필요할 때만 보기</summary>
          <div className="helper-box-stack">
            <strong>메인 흐름 밖의 보조 작업</strong>
            <span>설정 수정, 상태 재확인, 문제 해결은 현재 단계를 끝내는 데 꼭 필요할 때만 여세요.</span>
            <div className="button-row">
              <button type="button" className="btn-secondary" onClick={props.onOpenSettings}>
                작업공간 설정 열기
              </button>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
