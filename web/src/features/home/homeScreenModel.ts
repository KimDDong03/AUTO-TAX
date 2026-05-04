export type HomeTone = "default" | "warn" | "danger" | "success";

export type HomeActionKey =
  | "sync"
  | "exceptions"
  | "reviewQueue"
  | "blockedCustomers"
  | "recentIssued"
  | "recentInbox"
  | "onboarding"
  | "certificates";

export type HomePendingOnboardingStep = {
  title: string;
  summary: string;
};

export type HomeMetric = {
  label: string;
  value: string;
  tone: HomeTone;
};

export type HomeOnboardingBannerModel = {
  title: string;
  summary: string;
  progressText: string;
  actionLabel: string;
  actionKey: Extract<HomeActionKey, "onboarding">;
};

export type HomePriorityCard = {
  key: string;
  title: string;
  value: string;
  description: string;
  tone: Exclude<HomeTone, "success">;
  actionLabel: string;
  actionKey: Exclude<HomeActionKey, "onboarding" | "recentIssued" | "recentInbox"> | "certificates";
};

export type HomeScreenModel = {
  actionBarTitle: string;
  primaryActionLabel: string;
  primaryActionKey: HomeActionKey;
  chips: HomeMetric[];
  onboardingBanner: HomeOnboardingBannerModel | null;
  priorityTitle: string;
  prioritySubtitle: string;
  priorityCards: HomePriorityCard[];
  priorityEmptyState: {
    title: string;
    body: string;
  };
  reviewTitle: string;
  reviewSubtitle: string;
  reviewEmptyMessage: string;
  recentTitle: string;
  recentSubtitle: string;
  recentInboxEmptyMessage: string;
  recentIssuedEmptyMessage: string;
};

export type BuildHomeScreenModelInput = {
  onboardingComplete: boolean;
  onboardingPendingStepCount: number;
  onboardingHeroProgressText: string;
  firstPendingOnboardingStep: HomePendingOnboardingStep | null;
  onboardingFirstSyncReady: boolean;
  reviewDraftCount: number;
  unmatchedMessageCount: number;
  unmatchedMessageTotalCount: number;
  blockedCustomerCount: number;
  certificateExpirationCustomerCount: number;
  certAttentionCount: number;
  recentInboxCount: number;
  recentIssuedCount: number;
};

function buildUnmatchedMessageValue(current: number, total: number): string {
  const safeTotal = Math.max(total, current);
  return safeTotal > 0 ? `${current}/${safeTotal}건` : `${current}건`;
}

function buildPrimaryAction(input: BuildHomeScreenModelInput): {
  title: string;
  label: string;
  actionKey: HomeActionKey;
} {
  if (!input.onboardingFirstSyncReady) {
    return {
      title: "운영 시작 준비",
      label: "메일 동기화",
      actionKey: "sync"
    };
  }

  if (input.unmatchedMessageCount > 0) {
    return {
      title: "발행현황 정리",
      label: `발행현황 ${buildUnmatchedMessageValue(input.unmatchedMessageCount, input.unmatchedMessageTotalCount)} 확인`,
      actionKey: "exceptions"
    };
  }

  if (input.reviewDraftCount > 0) {
    return {
      title: "발행대기 처리",
      label: `발행대기 ${input.reviewDraftCount}건 확인`,
      actionKey: "reviewQueue"
    };
  }

  if (input.blockedCustomerCount > 0) {
    return {
      title: "발행 준비 확인",
      label: `막힌 고객 ${input.blockedCustomerCount}명 확인`,
      actionKey: "blockedCustomers"
    };
  }

  if (input.certAttentionCount > 0) {
    return {
      title: "계약만료고객",
      label: `계약만료고객 ${input.certAttentionCount}건 확인`,
      actionKey: "certificates"
    };
  }

  return {
    title: "오늘 흐름 정상",
    label: "최근 결과 보기",
    actionKey: "recentIssued"
  };
}

function buildPriorityCards(input: BuildHomeScreenModelInput): HomePriorityCard[] {
  const cards: HomePriorityCard[] = [];

  if (!input.onboardingFirstSyncReady) {
    cards.push({
      key: "first-sync",
      title: "첫 메일 동기화",
      value: "1단계",
      description: "메일 연결 테스트와 별개로 실제 자동 매칭을 처음 시작합니다.",
      tone: "warn",
      actionLabel: "메일 동기화",
      actionKey: "sync"
    });
  }

  if (input.unmatchedMessageCount > 0) {
    cards.push({
      key: "exceptions",
      title: "발행현황",
      value: buildUnmatchedMessageValue(input.unmatchedMessageCount, input.unmatchedMessageTotalCount),
      description: "발행현황을 처리해야 다음 발행이 계속 이어집니다.",
      tone: "warn",
      actionLabel: "발행현황 확인",
      actionKey: "exceptions"
    });
  }

  if (input.reviewDraftCount > 0) {
    cards.push({
      key: "review",
      title: "발행대기",
      value: `${input.reviewDraftCount}건`,
      description: "검수 후 직접 발행 대기 중인 항목부터 처리합니다.",
      tone: "warn",
      actionLabel: "발행대기 확인",
      actionKey: "reviewQueue"
    });
  }

  if (input.blockedCustomerCount > 0) {
    cards.push({
      key: "blocked-customers",
      title: "발행 준비 막힘",
      value: `${input.blockedCustomerCount}명`,
      description: "인증서 등록과 만료 상태가 막힌 고객부터 해결합니다.",
      tone: "danger",
      actionLabel: "막힌 고객 보기",
      actionKey: "blockedCustomers"
    });
  }

  if (input.certAttentionCount > 0) {
    cards.push({
      key: "certificates",
      title: "계약만료고객",
      value: `${input.certAttentionCount}건`,
      description: "계약 만료 위험 고객을 우선 점검합니다.",
      tone: "warn",
      actionLabel: "계약만료고객 확인",
      actionKey: "certificates"
    });
  }

  return cards.slice(0, 3);
}

export function buildHomeScreenModel(input: BuildHomeScreenModelInput): HomeScreenModel {
  const primaryAction = buildPrimaryAction(input);
  const priorityCards = buildPriorityCards(input);

  return {
    actionBarTitle: "홈",
    primaryActionLabel: primaryAction.label,
    primaryActionKey: primaryAction.actionKey,
    chips: [
      {
        label: "발행대기",
        value: `${input.reviewDraftCount}건`,
        tone: input.reviewDraftCount > 0 ? "warn" : "success"
      },
      {
        label: "발행현황",
        value: buildUnmatchedMessageValue(input.unmatchedMessageCount, input.unmatchedMessageTotalCount),
        tone: input.unmatchedMessageCount > 0 ? "warn" : "success"
      },
      {
        label: "인증서 만료 예정 고객",
        value: `${input.certificateExpirationCustomerCount}명`,
        tone: input.certificateExpirationCustomerCount > 0 ? "warn" : "success"
      },
      {
        label: "계약만료고객",
        value: `${input.certAttentionCount}건`,
        tone: input.certAttentionCount > 0 ? "warn" : "success"
      }
    ],
    onboardingBanner: !input.onboardingComplete
      ? {
          title: input.firstPendingOnboardingStep
            ? `다음 단계 · ${input.firstPendingOnboardingStep.title}`
            : "남은 단계 점검",
          summary:
            input.firstPendingOnboardingStep?.summary ??
            "도입 준비는 보조 진입점으로 유지되며 완료 후에도 홈은 계속 운영 시작판으로 남습니다.",
          progressText: input.onboardingHeroProgressText,
          actionLabel: "이어하기",
          actionKey: "onboarding"
        }
      : null,
    priorityTitle: "지금 먼저 처리",
    prioritySubtitle: priorityCards.length > 0 ? "우선순위 순서대로 처리" : "지금 바로 막힌 일 없음",
    priorityCards,
    priorityEmptyState: !input.onboardingFirstSyncReady
      ? {
          title: "아직 첫 메일 동기화를 시작하지 않았습니다.",
          body: "첫 동기화를 실행하면 초안과 발행현황이 이 화면에 바로 쌓입니다."
        }
      : {
          title: "지금 바로 막힌 일은 없습니다.",
          body: "오늘은 아래의 발행대기와 최근 흐름만 확인하면 됩니다."
        },
    reviewTitle: "발행대기",
    reviewSubtitle: input.reviewDraftCount > 0 ? `발행대기 ${input.reviewDraftCount}건` : "지금 바로 직접 발행할 초안 없음",
    reviewEmptyMessage: !input.onboardingFirstSyncReady
      ? "아직 첫 메일 동기화를 하지 않아 초안이 없습니다."
      : "지금 검수 후 직접 발행할 항목이 없습니다.",
    recentTitle: "최근 흐름",
    recentSubtitle: "최근 수신 / 발행 결과",
    recentInboxEmptyMessage: !input.onboardingFirstSyncReady
      ? "아직 메일을 처음 읽어오지 않았습니다. 메일 동기화를 실행하면 최근 수신이 여기에 표시됩니다."
      : input.recentInboxCount === 0
        ? "최근 들어온 메일이 없습니다. 문제가 없어서 비어 있는 상태입니다."
        : "최근 수신을 확인하세요.",
    recentIssuedEmptyMessage: !input.onboardingFirstSyncReady
      ? "아직 발행 결과가 없습니다. 메일 동기화와 초안 확인을 마치면 여기에 쌓입니다."
      : input.recentIssuedCount === 0
        ? "아직 발행 완료 이력이 없습니다."
        : "최근 발행 결과를 확인하세요."
  };
}
