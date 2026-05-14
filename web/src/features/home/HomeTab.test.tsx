import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeTab } from "./HomeTab";
import type { IssuedMonthlyTrendPayload } from "../../types";

function buildTrend(anchorBillingMonth = "2026-05"): IssuedMonthlyTrendPayload {
  const months = [
    "2025-05",
    "2025-06",
    "2025-07",
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05"
  ].map((billingMonth, index) => ({
    billingMonth,
    issuedDraftCount: index === 0 ? 1 : billingMonth === "2026-04" ? 2 : billingMonth === "2026-05" ? 3 : 0
  }));

  return {
    anchorBillingMonth,
    months,
    comparison: {
      anchor: { billingMonth: anchorBillingMonth, issuedDraftCount: anchorBillingMonth === "2026-05" ? 3 : 0 },
      previous: { billingMonth: "2026-04", issuedDraftCount: 2 },
      sameMonthLastYear: { billingMonth: "2025-05", issuedDraftCount: 1 }
    }
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

test("HomeTab renders issued monthly trend summary and thirteen bars", () => {
  const markup = renderHomeTab();

  assert.match(markup, /월별 발행 현황/);
  assert.match(markup, /연월 조회/);
  assert.match(markup, /type="month"/);
  assert.match(markup, /기준월/);
  assert.match(markup, /전월/);
  assert.match(markup, /전년 동월/);
  assert.equal((markup.match(/lovable-issued-trend-bar/g) ?? []).length, 13);
  assert.match(markup, /2026-05 발행 완료 3건/);
});

test("HomeTab shows reset action when the trend anchor is not the current month", () => {
  const markup = renderHomeTab({
    currentBillingMonth: "2026-05",
    trend: buildTrend("2026-03")
  });

  assert.match(markup, /최근 월로 돌아가기/);
  assert.match(markup, /선택월 2026-03 · 0건/);
});
