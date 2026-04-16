import type {
  IssueMode,
  LogEntry,
  PilotDraftTimeline,
  PilotDraftTimelineEntry,
  PilotErrorCategory,
  PilotIssuanceEventType,
  PilotIssuanceReport
} from "./domain.js";
import { PILOT_ERROR_CATEGORIES, PILOT_ISSUANCE_EVENT_TYPES } from "./domain.js";

type PilotLogLike = {
  organizationId: string;
  actorUserId: string | null;
  createdAt: string;
  level: LogEntry["level"];
  scope: string;
  message: string;
  contextJson: unknown;
};

type PilotActivity = PilotDraftTimelineEntry & {
  trackedEvent: boolean;
  trackedException: boolean;
};

const pilotEventTypeSet = new Set<string>(PILOT_ISSUANCE_EVENT_TYPES);
const pilotErrorCategorySet = new Set<string>(PILOT_ERROR_CATEGORIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPilotEventType(value: unknown): value is PilotIssuanceEventType {
  return typeof value === "string" && pilotEventTypeSet.has(value);
}

function isPilotErrorCategory(value: unknown): value is PilotErrorCategory {
  return typeof value === "string" && pilotErrorCategorySet.has(value);
}

function isIssueMode(value: unknown): value is IssueMode {
  return value === "review" || value === "auto";
}

function cleanObject(value: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries);
}

export function parsePilotLogContext(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return { ...value };
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? { ...parsed } : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function buildPilotLogContext(
  baseContext: unknown,
  additions: Record<string, unknown>
): Record<string, unknown> {
  const merged = {
    ...parsePilotLogContext(baseContext),
    ...additions
  };
  return cleanObject(merged);
}

export function inferPilotErrorCategory(input: Pick<PilotLogLike, "level" | "scope" | "message" | "contextJson">): PilotErrorCategory | null {
  const context = parsePilotLogContext(input.contextJson);
  const explicit = context.errorCategory;
  if (isPilotErrorCategory(explicit)) {
    return explicit;
  }

  const eventType = context.eventType;
  if (isPilotEventType(eventType)) {
    if (eventType === "manual-issue-failed") {
      return "manual-issue";
    }
    if (eventType === "auto-issue-failed") {
      return "auto-issue";
    }
    return null;
  }

  const scope = input.scope.toLowerCase();
  const message = input.message.toLowerCase();

  if (scope === "mail-sync") {
    if (message.includes("파싱")) return "parse";
    if (message.includes("매칭")) return "customer-match";
    if (message.includes("초안")) return "draft-create";
    return input.level === "error" ? "mail-sync" : null;
  }

  if (scope === "mail-reprocess") {
    if (message.includes("파싱")) return "parse";
    if (message.includes("매칭")) return "customer-match";
    if (message.includes("초안")) return "draft-create";
    return input.level === "error" ? "mail-sync" : null;
  }

  if (scope === "drafts" && message.includes("발행") && input.level === "error") {
    return "manual-issue";
  }

  if (scope === "job-runner" && message.includes("자동 발행") && input.level === "error") {
    return "auto-issue";
  }

  if (scope === "renewal-agent" && (input.level === "warn" || input.level === "error")) {
    return "certificate/local-helper";
  }

  if (scope === "popbill" && input.level === "error") {
    return "external-api";
  }

  if (
    scope === "api" &&
    (message.includes("인증") ||
      message.includes("세션") ||
      message.includes("로그인") ||
      message.includes("권한") ||
      asString(context.status).startsWith("401") ||
      asString(context.status).startsWith("403"))
  ) {
    return "auth/session";
  }

  return null;
}

function toPilotActivity(log: PilotLogLike): PilotActivity | null {
  const context = parsePilotLogContext(log.contextJson);
  const eventType = isPilotEventType(context.eventType) ? context.eventType : null;
  const draftId = asNullableNumber(context.draftId);
  const customerId = asNullableNumber(context.customerId);
  const issueMode = isIssueMode(context.issueMode) ? context.issueMode : null;
  const errorCategory = inferPilotErrorCategory(log);

  if (!eventType && draftId === null && errorCategory === null) {
    return null;
  }

  return {
    organizationId: log.organizationId,
    actorUserId: log.actorUserId,
    createdAt: log.createdAt,
    level: log.level,
    scope: log.scope,
    message: log.message,
    eventType,
    draftId: draftId ?? 0,
    customerId,
    issueMode,
    errorCategory,
    context,
    trackedEvent: eventType !== null,
    trackedException: errorCategory !== null
  };
}

function buildRateMetric(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : null
  };
}

function compareByCreatedAt(left: { createdAt: string }, right: { createdAt: string }) {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function countByEventType(activities: PilotActivity[], eventType: PilotIssuanceEventType): number {
  return activities.filter((activity) => activity.eventType === eventType).length;
}

function countByErrorCategory(activities: PilotActivity[], errorCategory: PilotErrorCategory): number {
  return activities.filter((activity) => activity.errorCategory === errorCategory).length;
}

function isMailSyncDraftCreationActivity(activity: PilotActivity): boolean {
  return (
    activity.scope === "mail-sync" ||
    asString(activity.context.pipeline) === "mail-sync" ||
    asString(activity.context.draftSource) === "mail-sync"
  );
}

export function buildPilotIssuanceReport(args: {
  organizationId: string;
  from?: string | null;
  to?: string | null;
  logs: PilotLogLike[];
}): PilotIssuanceReport {
  const activities = args.logs
    .map((log) => toPilotActivity(log))
    .filter((activity): activity is PilotActivity => Boolean(activity))
    .sort(compareByCreatedAt);

  const draftCreatedCount = activities.filter(
    (activity) => activity.eventType === "draft-created" && isMailSyncDraftCreationActivity(activity)
  ).length;
  const draftCreationExceptionCount = activities.filter(
    (activity) =>
      isMailSyncDraftCreationActivity(activity) &&
      (activity.errorCategory === "parse" ||
        activity.errorCategory === "customer-match" ||
        activity.errorCategory === "draft-create")
  ).length;

  const finalIssueSuccessCount =
    countByEventType(activities, "manual-issue-succeeded") + countByEventType(activities, "auto-issue-succeeded");
  const finalIssueFailureCount =
    countByEventType(activities, "manual-issue-failed") + countByEventType(activities, "auto-issue-failed");

  const draftCreationAttempts = draftCreatedCount + draftCreationExceptionCount;
  const finalIssueAttempts = finalIssueSuccessCount + finalIssueFailureCount;
  const exceptionCount = draftCreationExceptionCount + finalIssueFailureCount;

  return {
    organizationId: args.organizationId,
    generatedAt: new Date().toISOString(),
    period: {
      from: args.from ?? null,
      to: args.to ?? null
    },
    metrics: {
      autoDraftCreationSuccessRate: buildRateMetric(draftCreatedCount, draftCreationAttempts),
      finalIssueSuccessRate: buildRateMetric(finalIssueSuccessCount, finalIssueAttempts),
      exceptionRate: buildRateMetric(exceptionCount, draftCreationAttempts + finalIssueAttempts)
    },
    eventCounts: PILOT_ISSUANCE_EVENT_TYPES.map((eventType) => ({
      eventType,
      count: countByEventType(activities, eventType)
    })),
    errorCategoryCounts: PILOT_ERROR_CATEGORIES.map((errorCategory) => ({
      errorCategory,
      count: countByErrorCategory(activities, errorCategory)
    })),
    totals: {
      trackedDrafts: new Set(activities.filter((activity) => activity.draftId > 0).map((activity) => activity.draftId)).size,
      trackedEvents: activities.filter((activity) => activity.trackedEvent || activity.trackedException).length,
      draftCreationAttempts,
      finalIssueAttempts,
      exceptionCount
    },
    notes: {
      autoDraftCreationSuccessRate:
        "메일 동기화(mail-sync) 경로에서 기록된 draft-created 성공 수 / (draft-created + parse/customer-match/draft-create 예외 수)입니다.",
      finalIssueSuccessRate:
        "manual-issue-succeeded + auto-issue-succeeded / (manual-issue-succeeded + manual-issue-failed + auto-issue-succeeded + auto-issue-failed)입니다.",
      exceptionRate:
        "메일 동기화 기반 초안 생성 예외(parse/customer-match/draft-create)와 최종 발행 실패(manual/auto)를 전체 초안 생성·최종 발행 시도 대비로 계산합니다.",
      draftPreviewOpened:
        "draft-preview-opened는 웹 UI의 미리보기 버튼 클릭 시 POST /api/drafts/:id/pilot-preview-opened가 남기는 명시적 이벤트이며, Popbill 문서가 실제 렌더링되었는지까지는 보장하지 않습니다."
    }
  };
}

export function buildPilotDraftTimeline(args: {
  organizationId: string;
  draftId: number;
  customerId: number | null;
  issueMode: IssueMode | null;
  logs: PilotLogLike[];
}): PilotDraftTimeline {
  const events = args.logs
    .map((log) => toPilotActivity(log))
    .filter((activity): activity is PilotActivity => activity !== null && activity.draftId === args.draftId)
    .sort(compareByCreatedAt)
    .map(({ trackedEvent: _trackedEvent, trackedException: _trackedException, ...entry }) => entry);

  return {
    organizationId: args.organizationId,
    draftId: args.draftId,
    customerId: args.customerId,
    issueMode: args.issueMode,
    events
  };
}
