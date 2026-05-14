import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeTab } from "./HomeTab";
import type { IssuedMonthlyTrendPayload } from "../../types";

function buildTrend(anchorBillingYear = "2026"): IssuedMonthlyTrendPayload {
  const months = Array.from({ length: 12 }, (_, index) => `${anchorBillingYear}-${String(index + 1).padStart(2, "0")}`).map((billingMonth, index) => ({
    billingMonth,
    issuedDraftCount: index === 0 ? 1 : billingMonth === "2026-04" ? 2 : billingMonth === "2026-05" ? 3 : 0
  }));

  return {
    anchorBillingYear,
    months
  };
}

function renderHomeTab(options: {
  currentBillingMonth?: string;
  trend?: IssuedMonthlyTrendPayload | null;
} = {}) {
  return renderToStaticMarkup(
    <HomeTab
      mailboxDataLoading={false}
      model={{
        actionBarTitle: "홈",
        primaryActionLabel: "메일 동기화",
        primaryActionKey: "sync",
        chips: [],
        onboardingBanner: null,
        priorityTitle: "우선 처리",
        prioritySubtitle: "",
        priorityCards: [],
        priorityEmptyState: { title: "", body: "" },
        reviewTitle: "",
        reviewSubtitle: "",
        reviewEmptyMessage: "",
        recentTitle: "",
        recentSubtitle: "",
        recentInboxEmptyMessage: "",
        recentIssuedEmptyMessage: ""
      }}
      screenTitle="홈"
      userLabel="테스트 사용자"
      workspaceLabel="테스트 작업공간"
      popbillModeLabel="테스트"
      customers={[]}
      reviewDrafts={[]}
      recentInboxMessages={[]}
      recentIssuedDrafts={[]}
      issuedDraftsByCustomerId={new Map()}
      contractRenewalDueItems={[]}
      currentMonthIssuedDraftCount={3}
      currentBillingMonth={options.currentBillingMonth ?? "2026-05"}
      issuedMonthlyTrend={options.trend ?? buildTrend()}
      issuedMonthlyTrendLoading={false}
      issuedMonthlyTrendError=""
      monthlyIssueLimit={10}
      workFeedTab="inbox"
      reprocessableMessageCount={0}
      busyKey={null}
      onOpenAction={() => {}}
      onLoadIssuedMonthlyTrend={() => {}}
      onResetIssuedMonthlyTrend={() => {}}
      onOpenCustomers={() => {}}
      onSelectFeedTab={() => {}}
      onIssueAllReviewDrafts={() => {}}
      onIssueDraft={() => {}}
      onReprocessInboxMessage={() => {}}
      onReprocessAllMessages={() => {}}
      onViewDraft={() => {}}
      onCancelDraft={() => {}}
      onCompleteContractRenewal={() => {}}
      onDownloadContractRenewals={() => {}}
      getInboxDisplayParseStatus={(message) => message.parseStatus}
      getParseStatusLabel={(status) => status}
      getDraftStatusLabel={(status) => status}
      isInboxActionable={() => false}
      formatMoney={(value) => String(value)}
      formatDateTime={(value) => value ?? "-"}
      simplifyIssueError={(value) => value}
    />
  );
}

test("HomeTab renders issued monthly trend year query and twelve line points", () => {
  const markup = renderHomeTab();

  assert.match(markup, /월별 발행 현황/);
  assert.match(markup, /연 조회/);
  assert.match(markup, /type="number"/);
  assert.match(markup, /조회 연도/);
  assert.match(markup, /선택월/);
  assert.match(markup, /연간 합계/);
  assert.equal((markup.match(/lovable-issued-trend-accessible-item/g) ?? []).length, 12);
  assert.match(markup, /2026-05 3건/);
  assert.doesNotMatch(markup, /25\.05/);
});

test("HomeTab shows reset action when the trend year is not the current year", () => {
  const markup = renderHomeTab({
    currentBillingMonth: "2026-05",
    trend: buildTrend("2025")
  });

  assert.match(markup, /올해로 돌아가기/);
  assert.match(markup, /선택월 2025-01 · 1건/);
});
