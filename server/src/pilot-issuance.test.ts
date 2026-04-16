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
