import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type OnboardingStepTone = "default" | "muted";
type OnboardingStepLayout = "default" | "compact";

export type OnboardingStep = {
  id: string;
  step: number;
  title: string;
  summary: string;
  primaryActionLabel: string;
  blockedReason?: string;
  tone?: OnboardingStepTone;
  layout?: OnboardingStepLayout;
  done: boolean;
  content: React.ReactNode;
};

type OnboardingTabProps = {
  steps: OnboardingStep[];
  requestedStepId?: string | null;
  requestedStepRequestKey?: number;
};

function getOnboardingStepStatusMeta(options: { done: boolean; isRecommended: boolean }) {
  if (options.done) {
    return { label: "완료", variant: "secondary" as const };
  }

  if (options.isRecommended) {
    return { label: "지금", variant: "default" as const };
  }

  return { label: "대기", variant: "outline" as const };
}

export function OnboardingTab(props: OnboardingTabProps) {
  const recommendedStepId = useMemo(
    () => props.steps.find((step) => !step.done)?.id ?? props.steps[props.steps.length - 1]?.id ?? "mail",
    [props.steps]
  );
  const [activeStepId, setActiveStepId] = useState(recommendedStepId);
  const previousRequestedStepRef = useRef<{ id: string; requestKey: number } | null>(null);

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
    if (!props.requestedStepId) {
      previousRequestedStepRef.current = null;
      return;
    }

    const requestKey = props.requestedStepRequestKey ?? 0;
    if (
      previousRequestedStepRef.current?.id === props.requestedStepId &&
      previousRequestedStepRef.current.requestKey === requestKey
    ) {
      return;
    }

    if (!props.steps.some((step) => step.id === props.requestedStepId)) {
      return;
    }

    previousRequestedStepRef.current = { id: props.requestedStepId, requestKey };
    setActiveStepId(props.requestedStepId);
    window.requestAnimationFrame(() => {
      document.getElementById("onboarding-active-step")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [props.requestedStepId, props.requestedStepRequestKey, props.steps]);

  const activeStep = props.steps.find((step) => step.id === activeStepId) ?? props.steps[0] ?? null;
  const activeStepStatusMeta = activeStep
    ? getOnboardingStepStatusMeta({
        done: activeStep.done,
        isRecommended: activeStep.id === recommendedStepId
      })
    : null;
  const completedStepCount = props.steps.filter((step) => step.done).length;
  const progressText = `${completedStepCount}/${props.steps.length} 완료`;

  return (
    <div className="onboarding-task-shell">
      {activeStep ? (
        <section
          id="onboarding-active-step"
          className={[
            "onboarding-active-step-shell",
            activeStep.tone === "muted" ? "is-muted" : "",
            activeStep.layout === "compact" ? "is-compact" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <header className="onboarding-active-step-head">
            <div className="onboarding-active-step-copy">
              <div className="onboarding-active-step-meta">
                <Badge variant="outline" className="onboarding-active-progress">{progressText}</Badge>
                <Badge variant={activeStepStatusMeta?.variant ?? "outline"}>
                  {activeStepStatusMeta?.label ?? "대기"}
                </Badge>
              </div>
              <div className="onboarding-active-step-title-row">
                <span className="onboarding-active-step-order">0{activeStep.step}</span>
                <div>
                  <strong>{activeStep.title}</strong>
                  <p className="onboarding-active-step-summary">{activeStep.summary}</p>
                </div>
              </div>
              {activeStep.blockedReason ? (
                <p className="onboarding-inline-warning">{activeStep.blockedReason}</p>
              ) : null}
            </div>
          </header>
          <div className="onboarding-flow-section">{activeStep.content}</div>
        </section>
      ) : null}

      <aside className="onboarding-step-strip onboarding-stepper-rail" role="tablist" aria-label="준비 단계">
        <div className="onboarding-step-strip-head">
          <strong>진행 목록</strong>
          <span>{progressText}</span>
        </div>
        <div className="onboarding-step-list">
          {props.steps.map((step) => {
            const isActive = activeStep?.id === step.id;
            const isRecommended = step.id === recommendedStepId;
            const statusMeta = getOnboardingStepStatusMeta({
              done: step.done,
              isRecommended
            });
            return (
              <Button
                key={step.id}
                type="button"
                variant={isActive ? "secondary" : "ghost"}
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
                <span className="onboarding-step-chip-order">0{step.step}</span>
                <span className="onboarding-step-chip-copy">
                  <strong>{step.title}</strong>
                  <span className="onboarding-step-chip-summary">{step.summary}</span>
                </span>
                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              </Button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
