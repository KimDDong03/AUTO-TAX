import assert from "node:assert/strict";
import test from "node:test";
import { buildPilotDraftTimeline, buildPilotIssuanceReport, inferPilotErrorCategory } from "./pilot-issuance.js";

test("buildPilotIssuanceReport calculates Phase 1 pilot metrics from structured events", () => {
  const logs = [
    {
      organizationId: "org-1",
      actorUserId: "user-1",
      createdAt: "2026-04-16T00:00:00.000Z",
      level: "info" as const,
      scope: "mail-sync",
      message: "초안을 생성했습니다.",
      contextJson: {
        eventType: "draft-created",
        draftId: 101,
        customerId: 11,
        issueMode: "review",
        draftSource: "mail-sync",
        pipeline: "mail-sync"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: "user-1",
      createdAt: "2026-04-16T00:01:00.000Z",
      level: "info" as const,
      scope: "mail-sync",
      message: "초안을 생성했습니다.",
      contextJson: {
        eventType: "draft-created",
        draftId: 102,
        customerId: 12,
        issueMode: "auto",
        draftSource: "mail-sync",
        pipeline: "mail-sync"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: null,
      createdAt: "2026-04-16T00:02:00.000Z",
      level: "error" as const,
      scope: "mail-sync",
      message: "메일 파싱에 실패했습니다.",
      contextJson: {
        errorCategory: "parse",
        pipeline: "mail-sync"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: null,
      createdAt: "2026-04-16T00:03:00.000Z",
      level: "warn" as const,
      scope: "mail-sync",
      message: "발전소 주소와 고객을 매칭하지 못했습니다.",
      contextJson: {
        errorCategory: "customer-match",
        pipeline: "mail-sync"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: null,
      createdAt: "2026-04-16T00:04:00.000Z",
      level: "error" as const,
      scope: "mail-sync",
      message: "초안 생성에 실패했습니다.",
      contextJson: {
        errorCategory: "draft-create",
        pipeline: "mail-sync"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: "user-1",
      createdAt: "2026-04-16T00:05:00.000Z",
      level: "info" as const,
      scope: "drafts",
      message: "수동 발행 버튼 실행이 기록되었습니다.",
      contextJson: {
        eventType: "manual-issue-clicked",
        draftId: 101,
        customerId: 11,
        issueMode: "review"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: "user-1",
      createdAt: "2026-04-16T00:06:00.000Z",
      level: "info" as const,
      scope: "drafts",
      message: "수동 발행을 완료했습니다.",
      contextJson: {
        eventType: "manual-issue-succeeded",
        draftId: 101,
        customerId: 11,
        issueMode: "review"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: null,
      createdAt: "2026-04-16T00:07:00.000Z",
      level: "info" as const,
      scope: "job-runner",
      message: "자동 발행 실행이 시작되었습니다.",
      contextJson: {
        eventType: "auto-issue-started",
        draftId: 102,
        customerId: 12,
        issueMode: "auto"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: null,
      createdAt: "2026-04-16T00:08:00.000Z",
      level: "info" as const,
      scope: "job-runner",
      message: "자동 발행 큐 작업을 완료했습니다.",
      contextJson: {
        eventType: "auto-issue-succeeded",
        draftId: 102,
        customerId: 12,
        issueMode: "auto"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: "user-2",
      createdAt: "2026-04-16T00:09:00.000Z",
      level: "error" as const,
      scope: "drafts",
      message: "수동 발행에 실패했습니다.",
      contextJson: {
        eventType: "manual-issue-failed",
        errorCategory: "manual-issue",
        draftId: 103,
        customerId: 13,
        issueMode: "review"
      }
    }
  ];

  const report = buildPilotIssuanceReport({
    organizationId: "org-1",
    from: "2026-04-16T00:00:00.000Z",
    to: "2026-04-16T23:59:59.999Z",
    logs
  });

  assert.deepEqual(report.metrics.autoDraftCreationSuccessRate, {
    numerator: 2,
    denominator: 5,
    rate: 0.4
  });
  assert.deepEqual(report.metrics.finalIssueSuccessRate, {
    numerator: 2,
    denominator: 3,
    rate: 2 / 3
  });
  assert.deepEqual(report.metrics.exceptionRate, {
    numerator: 4,
    denominator: 8,
    rate: 0.5
  });
  assert.equal(report.totals.trackedDrafts, 3);
  assert.equal(report.totals.draftCreationAttempts, 5);
  assert.equal(report.totals.finalIssueAttempts, 3);
  assert.equal(report.totals.exceptionCount, 4);
  assert.equal(report.eventCounts.find((entry) => entry.eventType === "draft-created")?.count, 2);
  assert.equal(report.eventCounts.find((entry) => entry.eventType === "manual-issue-failed")?.count, 1);
  assert.equal(report.errorCategoryCounts.find((entry) => entry.errorCategory === "parse")?.count, 1);
  assert.match(report.notes.draftPreviewOpened, /pilot-preview-opened/);
});

test("buildPilotIssuanceReport adds weekly/monthly buckets, customer transition evidence, failure Top N, and time savings", () => {
  const report = buildPilotIssuanceReport({
    organizationId: "org-1",
    from: "2026-04-01T00:00:00.000Z",
    to: "2026-05-31T23:59:59.999Z",
    customers: [
      {
        id: 11,
        customerName: "알파 상사",
        issueMode: "auto"
      },
      {
        id: 12,
        customerName: "베타 산업",
        issueMode: "review"
      }
    ],
    logs: [
      {
        organizationId: "org-1",
        actorUserId: "user-1",
        createdAt: "2026-04-16T00:00:00.000Z",
        level: "info" as const,
        scope: "drafts",
        message: "수동 발행을 완료했습니다.",
        contextJson: {
          eventType: "manual-issue-succeeded",
          draftId: 201,
          customerId: 11,
          issueMode: "review"
        }
      },
      {
        organizationId: "org-1",
        actorUserId: "user-9",
        createdAt: "2026-04-18T01:00:00.000Z",
        level: "info" as const,
        scope: "customers",
        message: "고객 자동 발행 설정을 변경했습니다.",
        contextJson: {
          eventType: "issue-mode-changed",
          customerId: 11,
          previousIssueMode: "review",
          nextIssueMode: "auto",
          changedAt: "2026-04-18T01:00:00.000Z"
        }
      },
      {
        organizationId: "org-1",
        actorUserId: null,
        createdAt: "2026-05-02T00:10:00.000Z",
        level: "info" as const,
        scope: "job-runner",
        message: "자동 발행 큐 작업을 완료했습니다.",
        contextJson: {
          eventType: "auto-issue-succeeded",
          draftId: 202,
          customerId: 11,
          issueMode: "auto"
        }
      },
      {
        organizationId: "org-1",
        actorUserId: null,
        createdAt: "2026-05-03T00:10:00.000Z",
        level: "error" as const,
        scope: "job-runner",
        message: "자동 발행 큐 작업에 실패했습니다.",
        contextJson: {
          eventType: "auto-issue-failed",
          draftId: 203,
          customerId: 12,
          issueMode: "auto",
          errorCategory: "auto-issue",
          errorOperation: "popbill.issueTaxInvoice",
          errorCode: "PB-401"
        }
      },
      {
        organizationId: "org-1",
        actorUserId: null,
        createdAt: "2026-05-03T00:20:00.000Z",
        level: "error" as const,
        scope: "job-runner",
        message: "자동 발행 큐 작업에 실패했습니다.",
        contextJson: {
          eventType: "auto-issue-failed",
          draftId: 204,
          customerId: 12,
          issueMode: "auto",
          errorCategory: "auto-issue",
          errorOperation: "popbill.issueTaxInvoice",
          errorCode: "PB-401"
        }
      },
      {
        organizationId: "org-1",
        actorUserId: null,
        createdAt: "2026-05-03T00:30:00.000Z",
        level: "warn" as const,
        scope: "mail-sync",
        message: "발전소 주소와 고객을 매칭하지 못했습니다.",
        contextJson: {
          errorCategory: "customer-match",
          pipeline: "mail-sync"
        }
      }
    ]
  });

  assert.deepEqual(
    report.periodBuckets.weekly.map((bucket) => bucket.label),
    ["2026-04-13~2026-04-19", "2026-04-27~2026-05-03"]
  );
  assert.deepEqual(
    report.periodBuckets.monthly.map((bucket) => bucket.label),
    ["2026-04", "2026-05"]
  );

  const alpha = report.customerSummaries.find((entry) => entry.customerId === 11);
  assert.equal(alpha?.currentIssueMode, "auto");
  assert.equal(alpha?.manualIssueSuccessCount, 1);
  assert.equal(alpha?.autoIssueSuccessCount, 1);
  assert.equal(alpha?.reviewToAutoTransitionCount, 1);
  assert.equal(alpha?.autoTransitionEvidenceStatus, "already-auto");
  assert.equal(alpha?.estimatedSavedMinutes, 10);

  const beta = report.customerSummaries.find((entry) => entry.customerId === 12);
  assert.equal(beta?.currentIssueMode, "review");
  assert.equal(beta?.autoIssueFailureCount, 2);
  assert.equal(beta?.autoTransitionEvidenceStatus, "needs-review");
  assert.equal(beta?.latestFailureDraftId, 204);
  assert.equal(beta?.latestFailureTimelinePath, "/api/drafts/204/pilot-timeline");

  assert.equal(report.topFailureTypes[0]?.errorCategory, "auto-issue");
  assert.equal(report.topFailureTypes[0]?.errorOperation, "popbill.issueTaxInvoice");
  assert.equal(report.topFailureTypes[0]?.count, 2);
  assert.equal(report.timeSavings.estimatedSavedMinutes, 10);
  assert.match(report.notes.topFailureTypes, /errorCategory/);
  assert.match(report.notes.timeSavings, /10분/);
  assert.match(report.drilldown.memoComparisonProcedure, /pilot-timeline/);
});

test("buildPilotDraftTimeline restores draft-scoped activity in chronological order", () => {
  const logs = [
    {
      organizationId: "org-1",
      actorUserId: "user-1",
      createdAt: "2026-04-16T00:03:00.000Z",
      level: "info" as const,
      scope: "drafts",
      message: "수동 발행 버튼 실행이 기록되었습니다.",
      contextJson: {
        eventType: "manual-issue-clicked",
        draftId: 501,
        customerId: 77,
        issueMode: "review"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: "user-1",
      createdAt: "2026-04-16T00:01:00.000Z",
      level: "info" as const,
      scope: "drafts",
      message: "초안을 생성했습니다.",
      contextJson: {
        eventType: "draft-created",
        draftId: 501,
        customerId: 77,
        issueMode: "review"
      }
    },
    {
      organizationId: "org-1",
      actorUserId: "user-1",
      createdAt: "2026-04-16T00:04:00.000Z",
      level: "error" as const,
      scope: "drafts",
      message: "수동 발행에 실패했습니다.",
      contextJson: {
        eventType: "manual-issue-failed",
        errorCategory: "manual-issue",
        draftId: 501,
        customerId: 77,
        issueMode: "review"
      }
    }
  ];

  const timeline = buildPilotDraftTimeline({
    organizationId: "org-1",
    draftId: 501,
    customerId: 77,
    issueMode: "review",
    logs
  });

  assert.deepEqual(
    timeline.events.map((event) => event.eventType),
    ["draft-created", "manual-issue-clicked", "manual-issue-failed"]
  );
  assert.equal(timeline.events[2]?.errorCategory, "manual-issue");
});

test("buildPilotDraftTimeline keeps manual issue audit context visible with legacy path fallback", () => {
  const issuanceSnapshot = {
    supplyCost: 100000,
    taxTotal: 10000,
    totalAmount: 110000,
    writeDate: "20260416",
    invoicerBusinessNumber: "1112233333",
    invoiceeCorpNum: "1234567890",
    invoiceeTaxRegId: "0010",
    recipientEmail: "kepco-901@example.com"
  };
  const timeline = buildPilotDraftTimeline({
    organizationId: "org-1",
    draftId: 901,
    customerId: 44,
    issueMode: "review",
    logs: [
      {
        organizationId: "org-1",
        actorUserId: "user-1",
        createdAt: "2026-04-16T03:00:00.000Z",
        level: "info" as const,
        scope: "drafts",
        message: "수동 발행 버튼 실행이 기록되었습니다.",
        contextJson: {
          eventType: "manual-issue-clicked",
          draftId: 901,
          customerId: 44,
          issueMode: "review",
          issuePath: "single"
        }
      },
      {
        organizationId: "org-1",
        actorUserId: "user-1",
        createdAt: "2026-04-16T03:00:09.000Z",
        level: "info" as const,
        scope: "drafts",
        message: "수동 발행을 완료했습니다.",
        contextJson: {
          eventType: "manual-issue-succeeded",
          draftId: 901,
          customerId: 44,
          issueMode: "review",
          executionPath: "single",
          clickedAt: "2026-04-16T03:00:00.000Z",
          issuanceSnapshot
        }
      }
    ]
  });

  assert.equal(timeline.events[0]?.context.executionPath, "single");
  assert.equal(timeline.events[0]?.actorUserId, "user-1");
  assert.equal(timeline.events[0]?.context.clickedAt, "2026-04-16T03:00:00.000Z");
  assert.equal(timeline.events[1]?.context.executionPath, "single");
  assert.equal(timeline.events[1]?.actorUserId, "user-1");
  assert.equal(timeline.events[1]?.context.clickedAt, "2026-04-16T03:00:00.000Z");
  assert.equal(timeline.events[1]?.context.issuedAt, "2026-04-16T03:00:09.000Z");
  assert.deepEqual(timeline.events[1]?.context.issuanceSnapshot, issuanceSnapshot);
});

test("buildPilotDraftTimeline keeps review preview snapshots visible for later issuance comparison", () => {
  const comparableSnapshot = {
    supplyCost: 125000,
    taxTotal: 12500,
    totalAmount: 137500,
    writeDate: "20260416",
    invoicerBusinessNumber: "1112233333",
    invoiceeCorpNum: "1234567890",
    invoiceeTaxRegId: "0010",
    recipientEmail: "kepco-901@example.com"
  };
  const timeline = buildPilotDraftTimeline({
    organizationId: "org-1",
    draftId: 901,
    customerId: 44,
    issueMode: "review",
    logs: [
      {
        organizationId: "org-1",
        actorUserId: "user-1",
        createdAt: "2026-04-16T02:59:00.000Z",
        level: "info" as const,
        scope: "drafts",
        message: "초안 미리보기 열기 버튼 실행이 기록되었습니다.",
        contextJson: {
          eventType: "draft-preview-opened",
          draftId: 901,
          customerId: 44,
          issueMode: "review",
          previewPath: "view-url",
          previewSource: "ui-click",
          previewSnapshot: comparableSnapshot
        }
      },
      {
        organizationId: "org-1",
        actorUserId: "user-1",
        createdAt: "2026-04-16T03:00:09.000Z",
        level: "info" as const,
        scope: "drafts",
        message: "수동 발행을 완료했습니다.",
        contextJson: {
          eventType: "manual-issue-succeeded",
          draftId: 901,
          customerId: 44,
          issueMode: "review",
          executionPath: "single",
          clickedAt: "2026-04-16T03:00:00.000Z",
          issuanceSnapshot: comparableSnapshot
        }
      }
    ]
  });

  assert.equal(timeline.events[0]?.actorUserId, "user-1");
  assert.equal(timeline.events[1]?.actorUserId, "user-1");
  assert.deepEqual(timeline.events[0]?.context.previewSnapshot, comparableSnapshot);
  assert.deepEqual(timeline.events[1]?.context.issuanceSnapshot, comparableSnapshot);
});

test("buildPilotIssuanceReport keeps mail-reprocess draft events visible without changing mail-sync success-rate math", () => {
  const report = buildPilotIssuanceReport({
    organizationId: "org-1",
    logs: [
      {
        organizationId: "org-1",
        actorUserId: "user-1",
        createdAt: "2026-04-16T00:00:00.000Z",
        level: "info" as const,
        scope: "mail-sync",
        message: "초안을 생성했습니다.",
        contextJson: {
          eventType: "draft-created",
          draftId: 101,
          customerId: 11,
          issueMode: "review",
          draftSource: "mail-sync",
          pipeline: "mail-sync"
        }
      },
      {
        organizationId: "org-1",
        actorUserId: "user-2",
        createdAt: "2026-04-16T00:01:00.000Z",
        level: "info" as const,
        scope: "mail-reprocess",
        message: "미매칭 메일 재처리에 성공했습니다.",
        contextJson: {
          eventType: "draft-created",
          draftId: 202,
          customerId: 22,
          issueMode: "review",
          draftSource: "mail-reprocess",
          pipeline: "mail-reprocess",
          status: "parsed"
        }
      },
      {
        organizationId: "org-1",
        actorUserId: null,
        createdAt: "2026-04-16T00:02:00.000Z",
        level: "warn" as const,
        scope: "mail-reprocess",
        message: "미매칭 메일 재처리 중 고객 매칭에 실패했습니다.",
        contextJson: {
          pipeline: "mail-reprocess",
          draftSource: "mail-reprocess",
          errorCategory: "customer-match",
          status: "unmatched"
        }
      }
    ]
  });

  assert.deepEqual(report.metrics.autoDraftCreationSuccessRate, {
    numerator: 1,
    denominator: 1,
    rate: 1
  });
  assert.equal(report.eventCounts.find((entry) => entry.eventType === "draft-created")?.count, 2);
  assert.equal(report.errorCategoryCounts.find((entry) => entry.errorCategory === "customer-match")?.count, 1);
});

test("inferPilotErrorCategory keeps legacy fallback buckets available", () => {
  assert.equal(
    inferPilotErrorCategory({
      level: "warn",
      scope: "renewal-agent",
      message: "로컬 인증서 갱신 경로 분석 작업 준비에 실패했습니다.",
      contextJson: {}
    }),
    "certificate/local-helper"
  );
  assert.equal(
    inferPilotErrorCategory({
      level: "error",
      scope: "api",
      message: "세션 검증에 실패했습니다.",
      contextJson: {
        status: 401
      }
    }),
    "auth/session"
  );
  assert.equal(
    inferPilotErrorCategory({
      level: "error",
      scope: "popbill",
      message: "팝빌 호출이 실패했습니다.",
      contextJson: {}
    }),
    "external-api"
  );
});
