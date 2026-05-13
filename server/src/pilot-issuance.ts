import type {
  Customer,
  IssueMode,
  LogEntry,
  PilotDraftTimeline,
  PilotDraftTimelineEntry,
  PilotErrorCategory,
  PilotFailureTypeSummary,
  PilotIssuanceEventType,
  PilotIssuanceReport,
  PilotPeriodBucket,
  PilotTimeSavingsEstimate
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
  rawEventType: string | null;
};

type PilotCustomerCatalogEntry = Pick<Customer, "id" | "customerName" | "issueMode">;

type PilotSummary = Pick<PilotIssuanceReport, "metrics" | "eventCounts" | "errorCategoryCounts" | "totals"> & {
  timeSavingsSuccessCount: number;
};

type FailureDescriptor = Omit<PilotFailureTypeSummary, "rank" | "count" | "lastSeenAt" | "latestDraftId" | "latestCustomerId" | "latestTimelinePath">;

const pilotEventTypeSet = new Set<string>(PILOT_ISSUANCE_EVENT_TYPES);
const pilotErrorCategorySet = new Set<string>(PILOT_ERROR_CATEGORIES);
const ISSUANCE_SUCCESS_SAVED_MINUTES = 0;
const FAILURE_TOP_N = 5;
const TIMELINE_PATH_TEMPLATE = "/api/drafts/:id/pilot-timeline";

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

function normalizePilotTimelineContext(
  context: Record<string, unknown>,
  eventType: PilotIssuanceEventType | null,
  createdAt: string
): Record<string, unknown> {
  const normalized = { ...context };
  const executionPath = asNullableString(normalized.executionPath ?? normalized.issuePath);
  if (executionPath) {
    normalized.executionPath = executionPath;
  }
  delete normalized.issuePath;

  if (eventType === "manual-issue-clicked" && !asNullableString(normalized.clickedAt)) {
    normalized.clickedAt = createdAt;
  }

  if (eventType === "manual-issue-succeeded" && !asNullableString(normalized.issuedAt)) {
    normalized.issuedAt = createdAt;
  }

  return cleanObject(normalized);
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
  const parsedContext = parsePilotLogContext(log.contextJson);
  const rawEventType = asNullableString(parsedContext.eventType);
  const eventType = isPilotEventType(rawEventType) ? rawEventType : null;
  const context = normalizePilotTimelineContext(parsedContext, eventType, log.createdAt);
  const draftId = asNullableNumber(context.draftId);
  const customerId = asNullableNumber(context.customerId);
  const issueMode = isIssueMode(context.issueMode) ? context.issueMode : null;
  const errorCategory = inferPilotErrorCategory(log);

  if (!eventType && !rawEventType && draftId === null && customerId === null && errorCategory === null) {
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
    trackedException: errorCategory !== null,
    rawEventType
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

function compareByCreatedAtDesc(left: { createdAt: string }, right: { createdAt: string }) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
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

function buildTimelinePath(draftId: number | null): string | null {
  if (!draftId || draftId <= 0) {
    return null;
  }
  return TIMELINE_PATH_TEMPLATE.replace(":id", String(draftId));
}

function buildPilotSummary(activities: PilotActivity[]): PilotSummary {
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
  const finalIssueSuccessCount = countByEventType(activities, "manual-issue-succeeded");
  const finalIssueFailureCount = countByEventType(activities, "manual-issue-failed");

  const draftCreationAttempts = draftCreatedCount + draftCreationExceptionCount;
  const finalIssueAttempts = finalIssueSuccessCount + finalIssueFailureCount;
  const exceptionCount = draftCreationExceptionCount + finalIssueFailureCount;

  return {
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
    timeSavingsSuccessCount: 0
  };
}

function buildTimeSavingsEstimate(successCount: number): PilotTimeSavingsEstimate {
  const estimatedSavedMinutes = successCount * ISSUANCE_SUCCESS_SAVED_MINUTES;
  return {
    assumedMinutesSavedPerAutoSuccess: ISSUANCE_SUCCESS_SAVED_MINUTES,
    autoIssueSuccessCount: successCount,
    estimatedSavedMinutes,
    estimatedSavedHours: Number((estimatedSavedMinutes / 60).toFixed(1)),
    note: "절감 시간은 산정하지 않습니다."
  };
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff));
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfBucketExclusive(bucketType: PilotPeriodBucket["bucketType"], start: Date): Date {
  if (bucketType === "week") {
    return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

function getBucketKey(bucketType: PilotPeriodBucket["bucketType"], createdAt: string) {
  const timestamp = new Date(createdAt);
  const start = bucketType === "week" ? startOfUtcWeek(timestamp) : startOfUtcMonth(timestamp);
  const endExclusive = endOfBucketExclusive(bucketType, start);
  const endInclusive = new Date(endExclusive.getTime() - 1);

  return {
    key: `${bucketType}:${start.toISOString()}`,
    label:
      bucketType === "week"
        ? `${start.toISOString().slice(0, 10)}~${endInclusive.toISOString().slice(0, 10)}`
        : start.toISOString().slice(0, 7),
    start,
    endInclusive
  };
}

function buildPeriodBuckets(
  activities: PilotActivity[],
  bucketType: PilotPeriodBucket["bucketType"]
): PilotPeriodBucket[] {
  const bucketMap = new Map<
    string,
    {
      label: string;
      start: Date;
      endInclusive: Date;
      activities: PilotActivity[];
    }
  >();

  for (const activity of activities) {
    const bucket = getBucketKey(bucketType, activity.createdAt);
    const existing = bucketMap.get(bucket.key);
    if (existing) {
      existing.activities.push(activity);
      continue;
    }
    bucketMap.set(bucket.key, {
      label: bucket.label,
      start: bucket.start,
      endInclusive: bucket.endInclusive,
      activities: [activity]
    });
  }

  return [...bucketMap.values()]
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .map((bucket) => {
      const summary = buildPilotSummary(bucket.activities);
      return {
        bucketType,
        label: bucket.label,
        period: {
          from: bucket.start.toISOString(),
          to: bucket.endInclusive.toISOString()
        },
        metrics: summary.metrics,
        eventCounts: summary.eventCounts,
        errorCategoryCounts: summary.errorCategoryCounts,
        totals: summary.totals,
        timeSavings: buildTimeSavingsEstimate(summary.timeSavingsSuccessCount)
      };
    });
}

function normalizeFailureMessageBucket(value: unknown): string | null {
  const message = asNullableString(value)?.replace(/\s+/g, " ").trim();
  if (!message) {
    return null;
  }
  if (message.length <= 80) {
    return message;
  }
  return `${message.slice(0, 77)}...`;
}

function buildFailureDescriptor(activity: Pick<PilotActivity, "errorCategory" | "context" | "message">): FailureDescriptor | null {
  if (!activity.errorCategory) {
    return null;
  }

  const errorOperation = asNullableString(activity.context.errorOperation);
  const errorCode = asNullableString(activity.context.errorCode);
  const messageBucket =
    errorOperation || errorCode
      ? null
      : normalizeFailureMessageBucket(activity.context.errorDetails ?? activity.context.error ?? activity.message);
  const key = [activity.errorCategory, errorOperation ?? "", errorCode ?? "", messageBucket ?? ""].join("::");
  const labelSegments = [activity.errorCategory, errorOperation, errorCode, messageBucket].filter(
    (segment): segment is string => Boolean(segment)
  );

  return {
    key,
    label: labelSegments.join(" / "),
    errorCategory: activity.errorCategory,
    errorOperation,
    errorCode,
    messageBucket
  };
}

function buildTopFailureTypes(activities: PilotActivity[]): PilotFailureTypeSummary[] {
  const failureMap = new Map<
    string,
    PilotFailureTypeSummary & {
      createdAt: string;
    }
  >();

  for (const activity of activities) {
    if (!activity.trackedException) {
      continue;
    }
    const descriptor = buildFailureDescriptor(activity);
    if (!descriptor) {
      continue;
    }

    const existing = failureMap.get(descriptor.key);
    if (existing) {
      existing.count += 1;
      if (new Date(activity.createdAt).getTime() >= new Date(existing.createdAt).getTime()) {
        existing.createdAt = activity.createdAt;
        existing.lastSeenAt = activity.createdAt;
        existing.latestDraftId = activity.draftId > 0 ? activity.draftId : null;
        existing.latestCustomerId = activity.customerId;
        existing.latestTimelinePath = buildTimelinePath(activity.draftId > 0 ? activity.draftId : null);
      }
      continue;
    }

    failureMap.set(descriptor.key, {
      rank: 0,
      ...descriptor,
      count: 1,
      createdAt: activity.createdAt,
      lastSeenAt: activity.createdAt,
      latestDraftId: activity.draftId > 0 ? activity.draftId : null,
      latestCustomerId: activity.customerId,
      latestTimelinePath: buildTimelinePath(activity.draftId > 0 ? activity.draftId : null)
    });
  }

  return [...failureMap.values()]
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, FAILURE_TOP_N)
    .map(({ createdAt: _createdAt, ...entry }, index) => ({
      ...entry,
      rank: index + 1
    }));
}

function buildCustomerTransitionNote(
  currentIssueMode: IssueMode | null,
  successCount: number,
  manualIssueSuccessCount: number,
  autoIssueSuccessCount: number
): { status: "already-auto" | "eligible" | "needs-review"; note: string } {
  void currentIssueMode;
  void manualIssueSuccessCount;
  void autoIssueSuccessCount;
  if (successCount > 0) {
    return {
      status: "eligible",
      note: `성공 발행 이력 ${successCount}건이 있습니다.`
    };
  }

  return {
    status: "needs-review",
    note: "성공 발행 이력이 없어 review 유지가 권장됩니다."
  };
}

function buildCustomerSummaries(
  activities: PilotActivity[],
  customers: PilotCustomerCatalogEntry[]
): PilotIssuanceReport["customerSummaries"] {
  const customerCatalog = new Map<number, PilotCustomerCatalogEntry>(
    customers.map((customer) => [customer.id, customer])
  );
  const customerActivityMap = new Map<number, PilotActivity[]>();

  for (const activity of activities) {
    if (activity.customerId === null) {
      continue;
    }

    const entries = customerActivityMap.get(activity.customerId) ?? [];
    entries.push(activity);
    if (!customerActivityMap.has(activity.customerId)) {
      customerActivityMap.set(activity.customerId, entries);
    }
  }

  const customerIds = new Set<number>([
    ...customerActivityMap.keys()
  ]);

  return [...customerIds]
    .map((customerId) => {
      const customer = customerCatalog.get(customerId) ?? null;
      const customerActivities = [...(customerActivityMap.get(customerId) ?? [])].sort(compareByCreatedAt);
      const manualIssueSuccessCount = customerActivities.filter(
        (activity) => activity.eventType === "manual-issue-succeeded"
      ).length;
      const manualIssueFailureCount = customerActivities.filter(
        (activity) => activity.eventType === "manual-issue-failed"
      ).length;
      const autoIssueSuccessCount = 0;
      const autoIssueFailureCount = 0;
      const finalIssueSuccessCount = manualIssueSuccessCount + autoIssueSuccessCount;
      const finalIssueFailureCount = manualIssueFailureCount + autoIssueFailureCount;
      const finalIssueAttempts = finalIssueSuccessCount + finalIssueFailureCount;
      const transitionActivities = customerActivities
        .filter((activity) => activity.rawEventType === "issue-mode-changed")
        .sort(compareByCreatedAtDesc);
      const latestTransition = transitionActivities[0] ?? null;
      const reviewToAutoTransitionCount = transitionActivities.filter(
        (activity) =>
          asNullableString(activity.context.previousIssueMode) === "review" &&
          asNullableString(activity.context.nextIssueMode) === "auto"
      ).length;
      const autoToReviewTransitionCount = transitionActivities.filter(
        (activity) =>
          asNullableString(activity.context.previousIssueMode) === "auto" &&
          asNullableString(activity.context.nextIssueMode) === "review"
      ).length;
      const latestFailure = customerActivities
        .filter((activity) => activity.eventType === "manual-issue-failed")
        .sort(compareByCreatedAtDesc)[0] ?? null;
      const latestFailureDescriptor = latestFailure ? buildFailureDescriptor(latestFailure) : null;
      const transition = buildCustomerTransitionNote(
        customer?.issueMode ?? null,
        finalIssueSuccessCount,
        manualIssueSuccessCount,
        autoIssueSuccessCount
      );

      return {
        customerId,
        customerName: customer?.customerName ?? `고객 #${customerId}`,
        currentIssueMode: customer?.issueMode ?? null,
        manualIssueSuccessCount,
        manualIssueFailureCount,
        autoIssueSuccessCount,
        autoIssueFailureCount,
        finalIssueAttempts,
        finalIssueSuccessRate: buildRateMetric(finalIssueSuccessCount, finalIssueAttempts),
        exceptionRate: buildRateMetric(finalIssueFailureCount, finalIssueAttempts),
        reviewToAutoTransitionCount,
        autoToReviewTransitionCount,
        lastIssueModeChangedAt:
          asNullableString(latestTransition?.context.changedAt) ?? latestTransition?.createdAt ?? null,
        lastIssueModeChangedTo: latestTransition && isIssueMode(latestTransition.context.nextIssueMode)
          ? latestTransition.context.nextIssueMode
          : null,
        hasSuccessfulIssuanceEvidence: finalIssueSuccessCount > 0,
        autoTransitionEvidenceStatus: transition.status,
        autoTransitionEvidenceNote: transition.note,
        latestFailureAt: latestFailure?.createdAt ?? null,
        latestFailureType: latestFailureDescriptor?.label ?? null,
        latestFailureDraftId: latestFailure && latestFailure.draftId > 0 ? latestFailure.draftId : null,
        latestFailureTimelinePath: latestFailure ? buildTimelinePath(latestFailure.draftId > 0 ? latestFailure.draftId : null) : null,
        estimatedSavedMinutes: 0
      };
    })
    .sort((left, right) => {
      if (left.currentIssueMode !== right.currentIssueMode) {
        if (left.currentIssueMode === "auto") return -1;
        if (right.currentIssueMode === "auto") return 1;
      }
      if (right.finalIssueAttempts !== left.finalIssueAttempts) {
        return right.finalIssueAttempts - left.finalIssueAttempts;
      }
      return left.customerName.localeCompare(right.customerName, "ko");
    });
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const normalized = String(value).replace(/"/g, '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

export function buildPilotIssuanceReportCsv(report: PilotIssuanceReport): string {
  const rows: string[][] = [];
  const header = [
    "section",
    "group",
    "label",
    "periodFrom",
    "periodTo",
    "metric",
    "numerator",
    "denominator",
    "rate",
    "count",
    "customerId",
    "customerName",
    "currentIssueMode",
    "manualIssueSuccessCount",
    "autoIssueSuccessCount",
    "manualIssueFailureCount",
    "autoIssueFailureCount",
    "transitionStatus",
    "transitionNote",
    "latestFailureAt",
    "latestFailureType",
    "latestFailureTimelinePath",
    "errorCategory",
    "errorOperation",
    "errorCode",
    "messageBucket",
    "estimatedSavedMinutes",
    "estimatedSavedHours",
    "note"
  ];
  rows.push(header);

  for (const [metricKey, metricValue] of Object.entries(report.metrics)) {
    rows.push([
      "summary",
      "overall",
      "overall",
      report.period.from ?? "",
      report.period.to ?? "",
      metricKey,
      String(metricValue.numerator),
      String(metricValue.denominator),
      metricValue.rate === null ? "" : String(metricValue.rate),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      report.notes[metricKey as keyof typeof report.notes] ?? ""
    ]);
  }

  rows.push([
    "summary",
    "time-savings",
    "time-savings",
    report.period.from ?? "",
    report.period.to ?? "",
    "estimatedSavedMinutes",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    String(report.timeSavings.estimatedSavedMinutes),
    String(report.timeSavings.estimatedSavedHours),
    report.timeSavings.note
  ]);

  for (const bucket of report.periodBuckets.weekly) {
    rows.push([
      "bucket",
      "weekly",
      bucket.label,
      bucket.period.from,
      bucket.period.to,
      "finalIssueSuccessRate",
      String(bucket.metrics.finalIssueSuccessRate.numerator),
      String(bucket.metrics.finalIssueSuccessRate.denominator),
      bucket.metrics.finalIssueSuccessRate.rate === null ? "" : String(bucket.metrics.finalIssueSuccessRate.rate),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      String(bucket.timeSavings.estimatedSavedMinutes),
      String(bucket.timeSavings.estimatedSavedHours),
      bucket.timeSavings.note
    ]);
  }

  for (const bucket of report.periodBuckets.monthly) {
    rows.push([
      "bucket",
      "monthly",
      bucket.label,
      bucket.period.from,
      bucket.period.to,
      "finalIssueSuccessRate",
      String(bucket.metrics.finalIssueSuccessRate.numerator),
      String(bucket.metrics.finalIssueSuccessRate.denominator),
      bucket.metrics.finalIssueSuccessRate.rate === null ? "" : String(bucket.metrics.finalIssueSuccessRate.rate),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      String(bucket.timeSavings.estimatedSavedMinutes),
      String(bucket.timeSavings.estimatedSavedHours),
      bucket.timeSavings.note
    ]);
  }

  for (const customer of report.customerSummaries) {
    rows.push([
      "customer",
      "customer",
      customer.customerName,
      report.period.from ?? "",
      report.period.to ?? "",
      "finalIssueSuccessRate",
      String(customer.finalIssueSuccessRate.numerator),
      String(customer.finalIssueSuccessRate.denominator),
      customer.finalIssueSuccessRate.rate === null ? "" : String(customer.finalIssueSuccessRate.rate),
      "",
      String(customer.customerId),
      customer.customerName,
      customer.currentIssueMode ?? "",
      String(customer.manualIssueSuccessCount),
      String(customer.autoIssueSuccessCount),
      String(customer.manualIssueFailureCount),
      String(customer.autoIssueFailureCount),
      customer.autoTransitionEvidenceStatus,
      customer.autoTransitionEvidenceNote,
      customer.latestFailureAt ?? "",
      customer.latestFailureType ?? "",
      customer.latestFailureTimelinePath ?? "",
      "",
      "",
      "",
      "",
      String(customer.estimatedSavedMinutes),
      String(Number((customer.estimatedSavedMinutes / 60).toFixed(1))),
      ""
    ]);
  }

  for (const failure of report.topFailureTypes) {
    rows.push([
      "failure",
      "top-failure",
      failure.label,
      report.period.from ?? "",
      report.period.to ?? "",
      "",
      "",
      "",
      "",
      String(failure.count),
      failure.latestCustomerId === null ? "" : String(failure.latestCustomerId),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      failure.lastSeenAt,
      failure.label,
      failure.latestTimelinePath ?? "",
      failure.errorCategory,
      failure.errorOperation ?? "",
      failure.errorCode ?? "",
      failure.messageBucket ?? "",
      "",
      "",
      ""
    ]);
  }

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
}

export function buildPilotIssuanceReport(args: {
  organizationId: string;
  from?: string | null;
  to?: string | null;
  customers?: PilotCustomerCatalogEntry[];
  logs: PilotLogLike[];
}): PilotIssuanceReport {
  const activities = args.logs
    .map((log) => toPilotActivity(log))
    .filter((activity): activity is PilotActivity => Boolean(activity))
    .sort(compareByCreatedAt);
  const summary = buildPilotSummary(activities);

  return {
    organizationId: args.organizationId,
    generatedAt: new Date().toISOString(),
    period: {
      from: args.from ?? null,
      to: args.to ?? null
    },
    metrics: summary.metrics,
    eventCounts: summary.eventCounts,
    errorCategoryCounts: summary.errorCategoryCounts,
    periodBuckets: {
      weekly: buildPeriodBuckets(activities, "week"),
      monthly: buildPeriodBuckets(activities, "month")
    },
    customerSummaries: buildCustomerSummaries(activities, args.customers ?? []),
    topFailureTypes: buildTopFailureTypes(activities),
    timeSavings: buildTimeSavingsEstimate(summary.timeSavingsSuccessCount),
    drilldown: {
      timelinePathTemplate: TIMELINE_PATH_TEMPLATE,
      memoComparisonProcedure:
        "운영 메모에 남긴 draftId 또는 고객별 최신 실패 draftId로 /api/drafts/:id/pilot-timeline 를 조회해 실제 발행/실패 로그와 대조합니다."
    },
    totals: summary.totals,
    notes: {
      autoDraftCreationSuccessRate:
        "메일 동기화(mail-sync) 경로에서 기록된 draft-created 성공 수 / (draft-created + parse/customer-match/draft-create 예외 수)입니다.",
      finalIssueSuccessRate:
        "manual-issue-succeeded / (manual-issue-succeeded + manual-issue-failed)입니다.",
      exceptionRate:
        "메일 동기화 기반 초안 생성 예외(parse/customer-match/draft-create)와 최종 발행 실패를 전체 초안 생성·최종 발행 시도 대비로 계산합니다.",
      draftPreviewOpened:
        "draft-preview-opened는 웹 UI의 미리보기 버튼 클릭 시 POST /api/drafts/:id/pilot-preview-opened가 남기는 명시적 이벤트이며, 연동 문서가 실제 렌더링되었는지까지는 보장하지 않습니다.",
      customerSummaries:
        "고객별 성공률/예외율은 같은 기간의 최종 발행 성공·실패 로그 기준입니다.",
      topFailureTypes:
        `실패 유형 Top N은 errorCategory -> errorOperation -> errorCode -> 제한된 message bucket 순으로 묶은 상위 ${FAILURE_TOP_N}개입니다.`,
      timeSavings:
        "절감 시간은 산정하지 않습니다.",
      memoComparison:
        "리포트의 latestFailureDraftId/latestFailureTimelinePath와 draft timeline drill-down을 이용해 운영 메모와 app_logs 실제 이벤트를 대조합니다."
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
    .map(({ trackedEvent: _trackedEvent, trackedException: _trackedException, rawEventType: _rawEventType, ...entry }) => entry);

  return {
    organizationId: args.organizationId,
    draftId: args.draftId,
    customerId: args.customerId,
    issueMode: args.issueMode,
    events
  };
}
