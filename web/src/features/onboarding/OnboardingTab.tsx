import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SurfaceButton, SurfaceCard } from "../../components/ui";

type OnboardingStep = {
  id: string;
  step: number;
  title: string;
  summary: string;
  done: boolean;
};

type OnboardingSectionId = "mail" | "defaults" | "registration" | "certificates" | "first-run";
type OnboardingNavigationIntent = {
  stepId: string;
  nonce: number;
};

type OnboardingTabProps = {
  setupPendingCount: number;
  customerCount: number;
  quickRegisterMessageCount: number;
  pendingCertificateRegistrationCount: number;
  linkedCertificateCount: number;
  steps: OnboardingStep[];
  navigationIntent?: OnboardingNavigationIntent | null;
  onOpenSettings: () => void;
  mailSetupContent: React.ReactNode;
  defaultsContent: React.ReactNode;
  registrationContent: React.ReactNode;
  certificateContent: React.ReactNode;
  firstRunContent: React.ReactNode;
};

type OnboardingGuide = {
  icon: string;
  headline: string;
  description: string;
  tips: string[];
};

type OnboardingCompletionCriteria = {
  headline: string;
  items: string[];
};

const ONBOARDING_GUIDE_BY_STEP_ID: Record<string, OnboardingGuide> = {
  mail: {
    icon: "mail",
    headline: "설정 가이드",
    description: "한전 메일 연결이 먼저 안정적으로 붙어야 이후 자동 매칭과 초안 생성이 흔들리지 않습니다.",
    tips: [
      "메일 주소 도메인을 먼저 확인하면 서비스 감지가 자동으로 따라옵니다.",
      "테스트 연결까지 성공해야 다음 단계에서 미매칭 메일 없이 이어집니다."
    ]
  },
  defaults: {
    icon: "receipt_long",
    headline: "설정 가이드",
    description: "발행 기본값은 반복 업무를 줄이는 핵심 단계입니다. 여기서 저장한 값이 신규 고객 기본값으로 이어집니다.",
    tips: [
      "고객 계정 시작 문자와 담당자 정보는 처음 등록 흐름에서 바로 재사용됩니다.",
      "공동인증서 공통 비밀번호는 정말 동일할 때만 입력하는 편이 안전합니다."
    ]
  },
  customers: {
    icon: "upload_file",
    headline: "등록 가이드",
    description: "메일을 붙이기 전에 고객과 공동인증서 양식을 먼저 준비해 두면 첫 자동 매칭 정확도가 더 높아집니다.",
    tips: [
      "로컬 헬퍼를 실행한 뒤 공동인증서 포함 양식을 내려받아 업로드하세요.",
      "여기서는 고객 반영까지 마치고, 예외 메일 정리는 첫 동기화 단계에서 이어서 처리하면 됩니다."
    ]
  },
  certificates: {
    icon: "vpn_key",
    headline: "연결 가이드",
    description: "고객 등록이 끝난 뒤 남은 인증서 연결 대상만 이어서 마무리하면 첫 발행 준비가 거의 끝납니다.",
    tips: [
      "공동인증서 자동 등록 남은 건수부터 먼저 정리하세요.",
      "인증서 연결이 끝나면 첫 동기화와 첫 발행 확인 단계로 넘어갑니다."
    ]
  },
  "first-run": {
    icon: "rocket_launch",
    headline: "실행 가이드",
    description: "모든 기본 준비가 끝나면 메일 동기화, 예외 메일 정리, 월별 완료 처리를 한 번에 마무리합니다.",
    tips: [
      "첫 실행에서는 최근 메일까지 함께 읽으므로 미등록 메일과 발행 대기 목록을 같이 확인하세요.",
      "정산이 끝난 월은 완료 처리해 두면 이후 중복으로 다시 올라오지 않습니다."
    ]
  }
};

const ONBOARDING_COMPLETION_CRITERIA_BY_STEP_ID: Record<string, OnboardingCompletionCriteria> = {
  mail: {
    headline: "완료 조건",
    items: ["메일 주소와 앱 비밀번호 저장", "메일 연결 테스트 성공"]
  },
  defaults: {
    headline: "완료 조건",
    items: ["발행 공통값 입력", "신규 고객 기본 비밀번호/담당자 정보 확인"]
  },
  customers: {
    headline: "완료 조건",
    items: ["고객 엑셀 업로드 또는 첫 고객 등록", "예외 행 없는지 미리보기 확인"]
  },
  certificates: {
    headline: "완료 조건",
    items: ["전자세금용 인증서 연결", "남은 미연결 인증서가 예외 처리 수준인지 확인"]
  },
  "first-run": {
    headline: "완료 조건",
    items: ["첫 동기화 후 미매칭/발행 대기 확인", "첫 발행 또는 월 완료 처리 확인"]
  }
};

function getSectionId(stepId: string): OnboardingSectionId {
  switch (stepId) {
    case "mail":
      return "mail";
    case "defaults":
      return "defaults";
    case "customers":
      return "registration";
    case "certificates":
      return "certificates";
    case "first-run":
      return "first-run";
    default:
      return "mail";
  }
}

function getSectionContent(props: OnboardingTabProps, sectionId: OnboardingSectionId) {
  if (sectionId === "mail") return props.mailSetupContent;
  if (sectionId === "defaults") return props.defaultsContent;
  if (sectionId === "registration") return props.registrationContent;
  if (sectionId === "certificates") return props.certificateContent;
  return props.firstRunContent;
}

export function OnboardingTab(props: OnboardingTabProps) {
  const defaultActiveStepId = useMemo(
    () => props.steps.find((step) => !step.done)?.id ?? props.steps[props.steps.length - 1]?.id ?? "mail",
    [props.steps]
  );
  const [activeStepId, setActiveStepId] = useState(defaultActiveStepId);
  const progressRef = useRef<HTMLDivElement | null>(null);

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
  const activeSectionId = activeStep ? getSectionId(activeStep.id) : "mail";
  const activeContent = getSectionContent(props, activeSectionId);
  const completedSteps = props.steps.filter((step) => step.done).length;
  const progressStep = activeStep?.done ? completedSteps : activeStep?.step ?? completedSteps;
  const progressPercent = props.steps.length > 0 ? Math.min(100, Math.round((progressStep / props.steps.length) * 100)) : 0;
  const guide = activeStep ? ONBOARDING_GUIDE_BY_STEP_ID[activeStep.id] ?? ONBOARDING_GUIDE_BY_STEP_ID.mail : ONBOARDING_GUIDE_BY_STEP_ID.mail;
  const completionCriteria = activeStep
    ? ONBOARDING_COMPLETION_CRITERIA_BY_STEP_ID[activeStep.id] ?? ONBOARDING_COMPLETION_CRITERIA_BY_STEP_ID.mail
    : ONBOARDING_COMPLETION_CRITERIA_BY_STEP_ID.mail;

  const scrollToOnboardingTop = () => {
    if (typeof window === "undefined") {
      return;
    }
    window.requestAnimationFrame(() => {
      progressRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  };

  const focusStep = (stepId: string) => {
    setActiveStepId(stepId);
    scrollToOnboardingTop();
  };

  useEffect(() => {
    if (!props.navigationIntent) {
      return;
    }

    const targetStep = props.steps.find((step) => step.id === props.navigationIntent?.stepId);
    if (!targetStep) {
      return;
    }

    setActiveStepId(targetStep.id);
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    scrollToOnboardingTop();
  }, [props.navigationIntent?.nonce, props.steps]);

  return (
    <div className="stitch-onboarding-screen">
      <div ref={progressRef} className="stitch-onboarding-progress">
        <h2>첫 발행까지 5단계</h2>
        <div className="stitch-onboarding-progress-row">
          <div className="stitch-onboarding-progress-track" aria-hidden="true">
            <div className="stitch-onboarding-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span>{progressPercent}% 완료 ({Math.max(progressStep, completedSteps)}단계 진행)</span>
        </div>
      </div>

      <div className="stitch-onboarding-grid">
        <div className="stitch-onboarding-main">
          <SurfaceCard className="stitch-onboarding-active">
            <div className="stitch-onboarding-active-head">
              <div className="stitch-onboarding-active-head-meta">
                <span className="stitch-onboarding-active-step">
                  {activeStep?.step ?? completedSteps}단계
                  <span className="material-symbols-outlined">chevron_right</span>
                  {activeStep?.title ?? "도입 준비"}
                </span>
                <p>{activeStep?.summary ?? "필요한 단계를 순서대로 진행합니다."}</p>
              </div>
              <span className={`stitch-onboarding-badge ${activeStep?.done ? "is-done" : "is-required"}`}>
                {activeStep?.done ? "완료" : "진행 필요"}
              </span>
            </div>

            <div className="stitch-onboarding-form-shell" id={`onboarding-${activeSectionId}`}>
              {activeContent}
            </div>

            <div className="stitch-onboarding-outcome-card">
              <strong>{completionCriteria.headline}</strong>
              <div className="stitch-onboarding-outcome-list">
                {completionCriteria.items.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </SurfaceCard>

          <div className="stitch-onboarding-actions">
            <button type="button" className="stitch-onboarding-ghost-button" disabled={!previousStep} onClick={() => previousStep && focusStep(previousStep.id)}>
              <span className="material-symbols-outlined">arrow_back</span>
              이전 단계
            </button>
            <div className="stitch-onboarding-actions-right">
              <button type="button" className="btn-secondary" onClick={props.onOpenSettings}>
                작업공간 설정
              </button>
              <button type="button" className="stitch-onboarding-primary-button" disabled={!nextStep} onClick={() => nextStep && focusStep(nextStep.id)}>
                다음 단계
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>

        <aside className="stitch-onboarding-side">
          <div className="stitch-onboarding-side-primary">
            <SurfaceCard className={nextStep ? "stitch-onboarding-next-card" : "stitch-onboarding-next-card is-complete"}>
              <div className="stitch-onboarding-next-head">
                <div>
                  <p>{nextStep ? "이어서 할 일" : "도입 완료"}</p>
                  <h5>{nextStep?.title ?? "모든 도입 단계를 마쳤습니다."}</h5>
                </div>
                <span className={nextStep ? "chip chip-warn" : "chip chip-success"}>
                  {nextStep ? `${nextStep.step}단계` : "완료"}
                </span>
              </div>
              <span className="stitch-onboarding-next-summary">{nextStep?.summary ?? "이제 첫 발행 검토와 운영 화면으로 넘어갈 수 있습니다."}</span>
              {nextStep ? (
                <button type="button" className="stitch-onboarding-next-button" onClick={() => focusStep(nextStep.id)}>
                  다음 단계 열기
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              ) : null}
            </SurfaceCard>

            <SurfaceCard className="stitch-onboarding-checklist-card">
              <div className="stitch-onboarding-checklist-head">
                <h4>도입 체크리스트</h4>
                <span>{completedSteps}/{props.steps.length} 완료</span>
              </div>
              <div className="stitch-onboarding-checklist">
                {props.steps.map((step) => {
                  const toneClass = step.done ? "is-done" : step.id === activeStepId ? "is-active" : "is-pending";
                  const iconName = step.done ? "check_circle" : step.id === activeStepId ? "pending" : "radio_button_unchecked";
                  return (
                    <SurfaceButton
                      key={step.id}
                      className={`stitch-onboarding-check-item ${toneClass}`}
                      onClick={() => focusStep(step.id)}
                    >
                      <span className="material-symbols-outlined">{iconName}</span>
                      <span>{step.title}</span>
                    </SurfaceButton>
                  );
                })}
              </div>
            </SurfaceCard>
          </div>

          <div className="stitch-onboarding-side-secondary">
            <details className="stitch-onboarding-guide-details">
              <summary>
                <span className="material-symbols-outlined">{guide.icon}</span>
                <div>
                  <strong>{guide.headline}</strong>
                  <span>{guide.description}</span>
                </div>
              </summary>
              <div className="stitch-onboarding-guide-details-body">
                <div className="stitch-onboarding-guide-stats">
                  <article>
                    <span>등록 고객</span>
                    <strong>{props.customerCount}명</strong>
                  </article>
                  <article>
                    <span>미등록 메일</span>
                    <strong>{props.quickRegisterMessageCount}건</strong>
                  </article>
                  <article>
                    <span>연결된 인증서</span>
                    <strong>{props.linkedCertificateCount}건</strong>
                  </article>
                  <article>
                    <span>자동 등록 남음</span>
                    <strong>{props.pendingCertificateRegistrationCount}건</strong>
                  </article>
                </div>
                <ul>
                  {guide.tips.map((tip) => (
                    <li key={tip}>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}
