export type PublicPricingPlanId = "beta" | "standard";
export type LandingTone = "neutral" | "success" | "warn";

export type PublicPricingPlan = {
  id: PublicPricingPlanId;
  label: string;
  badge: string;
  summary: string;
  basePrice: number;
  includedCustomers: number;
  overagePrice: number;
};

export type PublicPricingQuote = {
  plan: PublicPricingPlan;
  managedCustomerCount: number;
  includedCustomers: number;
  overageCount: number;
  overagePrice: number;
  totalPrice: number;
};

export type LandingConsoleSummaryItem = {
  label: string;
  value: string;
  detail: string;
  tone: LandingTone;
};

export type LandingConsoleQueueRow = {
  stage: string;
  title: string;
  detail: string;
  note: string;
  status: string;
  tone: LandingTone;
};

export type LandingConsoleSideSectionItem = {
  label: string;
  detail: string;
  status: string;
  tone: LandingTone;
};

export type LandingConsoleSideSection = {
  title: string;
  summary: string;
  items: readonly LandingConsoleSideSectionItem[];
};

export type LandingWorkflowStep = {
  title: string;
  summary: string;
  detail: string;
  status: string;
  tone: LandingTone;
};

export type LandingWorkflowSideSectionItem = {
  label: string;
  detail: string;
  status: string;
  tone: LandingTone;
};

export type LandingWorkflowSideSection = {
  title: string;
  summary: string;
  items: readonly LandingWorkflowSideSectionItem[];
};

export const PUBLIC_PRICING_PLANS: Record<PublicPricingPlanId, PublicPricingPlan> = {
  beta: {
    id: "beta",
    label: "시험 운영",
    badge: "시험",
    summary: "50곳 이하",
    basePrice: 79000,
    includedCustomers: 50,
    overagePrice: 900
  },
  standard: {
    id: "standard",
    label: "기본 운영",
    badge: "운영",
    summary: "반복 발행",
    basePrice: 149000,
    includedCustomers: 50,
    overagePrice: 1400
  }
};

export const PUBLIC_PRICING_PLAN_LIST = Object.values(PUBLIC_PRICING_PLANS) as PublicPricingPlan[];

export const LANDING_HERO = {
  badge: "태양광 전자세금계산서 운영",
  headline: "메일 수집부터 검수 발행까지 같은 운영 화면에서",
  description: "수집, 검수, 초안, 발행 마감을 같은 흐름으로 봅니다."
} as const;

export const LANDING_HERO_POINTS = [
  {
    label: "메일 수집",
    value: "누락 확인"
  },
  {
    label: "검수 큐",
    value: "예외만 확인"
  },
  {
    label: "발행 마감",
    value: "검수 후 발행"
  }
] as const;

export const LANDING_PRODUCT_PREVIEW = {
  eyebrow: "운영 보드",
  title: "오늘 운영 보드",
  description: "상태와 예외만 먼저 읽힙니다.",
  chips: ["동기화 정상", "주소 우선 매칭"],
  summary: [
    {
      label: "운영 상태",
      value: "정상",
      detail: "06:20 동기화",
      tone: "success"
    },
    {
      label: "검수 필요",
      value: "7건",
      detail: "예외 7건",
      tone: "warn"
    },
    {
      label: "발행 준비",
      value: "89건",
      detail: "초안 89건",
      tone: "neutral"
    },
    {
      label: "완료",
      value: "96건",
      detail: "이력 96건",
      tone: "success"
    }
  ] satisfies readonly LandingConsoleSummaryItem[],
  queueRows: [
    {
      stage: "운영 상태",
      title: "메일 수집",
      detail: "한전 메일 18건 · 누락 없음",
      note: "06:20",
      status: "정상",
      tone: "success"
    },
    {
      stage: "검수 필요",
      title: "주소 예외",
      detail: "신규 2곳 · 주소 차이 5건",
      note: "예외 중심",
      status: "검수 필요",
      tone: "warn"
    },
    {
      stage: "발행 준비",
      title: "초안 준비",
      detail: "89건 · 공급가액 정리",
      note: "검수 전",
      status: "준비됨",
      tone: "neutral"
    },
    {
      stage: "완료",
      title: "발행 완료",
      detail: "96건 · 전송 이력 저장",
      note: "최근 결과",
      status: "완료",
      tone: "success"
    }
  ] satisfies readonly LandingConsoleQueueRow[],
  sideSections: [
    {
      title: "검수 메모",
      summary: "예외만 확인",
      items: [
        {
          label: "주소 우선 매칭",
          detail: "주소 기준 후보만 남깁니다.",
          status: "기준",
          tone: "neutral"
        }
      ]
    },
    {
      title: "운영 기록",
      summary: "발행 후 바로 확인",
      items: [
        {
          label: "검수 후 발행",
          detail: "발행 직후 결과를 같이 확인합니다.",
          status: "기록",
          tone: "success"
        }
      ]
    }
  ] satisfies readonly LandingConsoleSideSection[]
} as const;

export const LANDING_WORKFLOW_STEPS = [
  {
    title: "메일 수집",
    summary: "동기화와 누락 확인",
    detail: "시간 · 첨부 기준",
    status: "수집 기준",
    tone: "success"
  },
  {
    title: "대상 정리",
    summary: "주소 기준 매칭",
    detail: "예외만 분리",
    status: "주소 우선",
    tone: "neutral"
  },
  {
    title: "초안 준비",
    summary: "확정 건 초안 준비",
    detail: "보류 사유 분리",
    status: "초안 생성",
    tone: "neutral"
  },
  {
    title: "검수 발행",
    summary: "검수 후 발행 마감",
    detail: "완료 이력 저장",
    status: "검수 후 발행",
    tone: "success"
  }
] satisfies readonly LandingWorkflowStep[];

export const LANDING_FIT_SECTIONS = [
  {
    title: "이런 팀",
    summary: "반복 발행 운영",
    items: [
      {
        label: "태양광 운영사",
        detail: "관리 고객이 계속 늘어나는 팀",
        status: "대상",
        tone: "neutral"
      },
      {
        label: "검수 중심 운영",
        detail: "예외만 짧게 확인하고 마감하는 팀",
        status: "흐름",
        tone: "success"
      }
    ]
  },
  {
    title: "운영 원칙",
    summary: "같은 기준 유지",
    items: [
      {
        label: "예외만 분리",
        detail: "막힌 건만 검수 큐로 남깁니다.",
        status: "검수",
        tone: "warn"
      },
      {
        label: "검수 후 발행",
        detail: "마지막 확인 뒤 발행으로 마감합니다.",
        status: "기본",
        tone: "neutral"
      }
    ]
  }
] as const satisfies readonly LandingWorkflowSideSection[];

export const LANDING_FAQS = [
  {
    question: "누가 쓰나요?",
    answer: "태양광 운영사의 반복 발행 운영에 맞춘 도구입니다."
  },
  {
    question: "완전 자동 발행인가요?",
    answer: "기본은 검수 후 발행입니다."
  },
  {
    question: "상담은 어떻게 진행하나요?",
    answer: "규모를 계산한 뒤 같은 기준으로 문의를 남기면 됩니다."
  }
] as const;

export function normalizeManagedCustomerCount(value: string): number {
  const digits = value.replace(/[^\d]/g, "");
  return digits === "" ? 0 : Number.parseInt(digits, 10);
}

export function calculatePublicPrice(planId: PublicPricingPlanId, managedCustomerCount: number): PublicPricingQuote {
  const plan = PUBLIC_PRICING_PLANS[planId];
  const normalizedCount = Number.isFinite(managedCustomerCount) ? Math.max(0, Math.floor(managedCustomerCount)) : 0;
  const overageCount = Math.max(0, normalizedCount - plan.includedCustomers);
  const overagePrice = overageCount * plan.overagePrice;

  return {
    plan,
    managedCustomerCount: normalizedCount,
    includedCustomers: plan.includedCustomers,
    overageCount,
    overagePrice,
    totalPrice: plan.basePrice + overagePrice
  };
}
