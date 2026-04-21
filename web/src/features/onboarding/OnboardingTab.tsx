import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type OnboardingStepTone = "default" | "muted";

export type OnboardingStep = {
  id: string;
  step: number;
  title: string;
  summary: string;
  primaryActionLabel: string;
  blockedReason?: string;
  tone?: OnboardingStepTone;
  done: boolean;
  content: React.ReactNode;
};

type OnboardingTabProps = {
  steps: OnboardingStep[];
  requestedStepId?: string | null;
};

function getOnboardingStepStatusMeta(options: { done: boolean; isRecommended: boolean }) {
  if (options.done) {
    return { label: "완료", chipClassName: "chip chip-success" };
  }

  if (options.isRecommended) {
    return { label: "지금", chipClassName: "chip chip-warn" };
  }

  return { label: "대기", chipClassName: "chip" };
}

export function OnboardingTab(props: OnboardingTabProps) {
  const recommendedStepId = useMemo(
    () => props.steps.find((step) => !step.done)?.id ?? props.steps[props.steps.length - 1]?.id ?? "mail",
    [props.steps]
  );
  const [activeStepId, setActiveStepId] = useState(recommendedStepId);
  const previousRecommendedStepIdRef = useRef(recommendedStepId);
  const previousRequestedStepIdRef = useRef<string | null>(null);

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
    if (!props.requestedStepId) {
      previousRequestedStepIdRef.current = null;
      return;
    }

    if (previousRequestedStepIdRef.current === props.requestedStepId) {
      return;
    }

    if (!props.steps.some((step) => step.id === props.requestedStepId)) {
      return;
    }

    previousRequestedStepIdRef.current = props.requestedStepId;
    setActiveStepId(props.requestedStepId);
    window.requestAnimationFrame(() => {
      document.getElementById("onboarding-active-step")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [props.requestedStepId, props.steps]);

  const activeStep = props.steps.find((step) => step.id === activeStepId) ?? props.steps[0] ?? null;
  const activeStepStatusMeta = activeStep
    ? getOnboardingStepStatusMeta({
        done: activeStep.done,
        isRecommended: activeStep.id === recommendedStepId
      })
    : null;

  return (
    <div className="onboarding-compact-shell">
      <div className="onboarding-step-strip" role="tablist" aria-label="준비 단계">
        {props.steps.map((step) => {
          const isActive = activeStep?.id === step.id;
          const isRecommended = step.id === recommendedStepId;
          const statusMeta = getOnboardingStepStatusMeta({
            done: step.done,
            isRecommended
          });
          return (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={[
                "onboarding-step-chip",
                isActive ? "active" : "",
                step.done ? "is-done" : "",
                !step.done && isRecommended ? "is-recommended" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveStepId(step.id)}
            >
              <div className="onboarding-step-chip-main">
                <div className="onboarding-step-chip-top">
                  <span className="onboarding-step-chip-order">0{step.step}</span>
                  <span className={statusMeta.chipClassName}>{statusMeta.label}</span>
                </div>
                <div className="onboarding-step-chip-copy">
                  <strong>{step.title}</strong>
                  <span className="onboarding-step-chip-summary">{step.summary}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {activeStep ? (
        <section
          id="onboarding-active-step"
          className={activeStep.tone === "muted" ? "onboarding-active-step-shell is-muted" : "onboarding-active-step-shell"}
        >
          <header className="onboarding-active-step-head">
            <div className="onboarding-active-step-copy">
              <div className="onboarding-active-step-top">
                <span className="onboarding-active-step-order">0{activeStep.step}</span>
                <span className={activeStepStatusMeta?.chipClassName ?? "chip"}>{activeStepStatusMeta?.label ?? "대기"}</span>
              </div>
              <strong>{activeStep.title}</strong>
              <p className="onboarding-active-step-summary">{activeStep.summary}</p>
              {activeStep.blockedReason ? <p className="onboarding-inline-warning">{activeStep.blockedReason}</p> : null}
            </div>
          </header>
          <div className="onboarding-flow-section">{activeStep.content}</div>
        </section>
      ) : null}
    </div>
  );
}
