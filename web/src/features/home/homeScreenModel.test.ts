import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeScreenModel } from "./homeScreenModel";

test("buildHomeScreenModel keeps onboarding-first priority before first sync", () => {
  const model = buildHomeScreenModel({
    onboardingComplete: false,
    onboardingPendingStepCount: 2,
    onboardingHeroProgressText: "3/5 완료 · 남음 2",
    firstPendingOnboardingStep: {
      title: "첫 메일 동기화",
      summary: "고객/인증서 준비 뒤 첫 동기화 필요"
    },
    onboardingFirstSyncReady: false,
    reviewDraftCount: 0,
    unmatchedMessageCount: 0,
    blockedCustomerCount: 0,
    readyNowCustomerCount: 0,
    certAttentionCount: 0,
    recentInboxCount: 0,
    recentIssuedCount: 0
  });

  assert.equal(model.actionBarTitle, "홈");
  assert.equal(model.primaryActionLabel, "메일 동기화");
  assert.equal(model.primaryActionKey, "sync");
  assert.equal(model.onboardingBanner?.title, "다음 단계 · 첫 메일 동기화");
  assert.deepEqual(model.priorityCards, [
    {
      key: "first-sync",
      title: "첫 메일 동기화",
      value: "1단계",
      description: "메일 연결 테스트와 별개로 실제 자동 매칭을 처음 시작합니다.",
      tone: "warn",
      actionLabel: "메일 동기화",
      actionKey: "sync"
    }
  ]);
});

test("buildHomeScreenModel orders priorities as exceptions then drafts then blocked customers", () => {
  const model = buildHomeScreenModel({
    onboardingComplete: true,
    onboardingPendingStepCount: 0,
    onboardingHeroProgressText: "완료",
    firstPendingOnboardingStep: null,
    onboardingFirstSyncReady: true,
    reviewDraftCount: 5,
    unmatchedMessageCount: 2,
    blockedCustomerCount: 3,
    readyNowCustomerCount: 7,
    certAttentionCount: 1,
    recentInboxCount: 4,
    recentIssuedCount: 2
  });

  assert.equal(model.actionBarTitle, "홈");
  assert.equal(model.primaryActionLabel, "예외 메일 2건 확인");
  assert.equal(model.primaryActionKey, "exceptions");
  assert.equal(model.priorityCards.length, 3);
  assert.deepEqual(
    model.priorityCards.map((card) => card.key),
    ["exceptions", "review", "blocked-customers"]
  );
  assert.deepEqual(model.chips, [
    { label: "검토 초안", value: "5건", tone: "warn" },
    { label: "예외 메일", value: "2건", tone: "warn" },
    { label: "발행 가능 고객", value: "7명", tone: "success" },
    { label: "인증서 주의", value: "1건", tone: "warn" }
  ]);
});
