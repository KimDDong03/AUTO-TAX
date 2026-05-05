import { z } from "zod";
import { refreshAllCertificateStatuses, shouldRefreshCertificateStatuses } from "./certificate-monitor.js";
import { getErrorMessage } from "./http-errors.js";
import { syncMailbox } from "./mail-sync.js";
import { sendNotification } from "./notifier.js";
import { getServerManagedSettings } from "./server-managed-settings.js";
import { runCustomerOnboardingCommitBatch } from "./services/customer-onboarding-batch-service.js";
import { autoJoinCustomerPopbill } from "./services/popbill-customer-service.js";
import { createSupabaseAdminClient } from "./supabase.js";
import { SupabaseStore } from "./supabase-store.js";
import { nowIso } from "./utils.js";

type Row = Record<string, unknown>;
type QueueJobType =
  | "mail-sync"
  | "certificate-check"
  | "customer-onboarding-commit"
  | "customer-popbill-auto-join";
type QueueJobStatus = "queued" | "claimed" | "completed" | "failed" | "cancelled";

type QueueJob = {
  id: string;
  organizationId: string;
  managedCustomerId: string | null;
  jobType: QueueJobType;
  status: QueueJobStatus;
  runAfter: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  claimedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const JOB_CLAIM_TIMEOUT_MINUTES: Record<QueueJobType, number> = {
  "mail-sync": 15,
  "certificate-check": 15,
  "customer-onboarding-commit": 20,
  "customer-popbill-auto-join": 5
};
const MAX_JOB_RUN_LIMIT = 25;

type DispatchDetail = {
  jobType: QueueJobType;
  organizationId: string;
  action: "queued" | "skipped";
  reason: string;
  draftId?: number;
};

type RecurringDispatchContext = {
  settingsRows: Row[];
  integrationRows: Row[];
  joinedCustomerOrganizationIds: Set<string>;
};

type DispatchRecurringJobsDependencies = {
  loadRecurringDispatchContext: () => Promise<RecurringDispatchContext>;
  hasOpenJob: typeof hasOpenJob;
  getLatestJobReferenceAt: typeof getLatestJobReferenceAt;
  enqueueJob: typeof enqueueJob;
};

export type JobDispatchResult = {
  checkedOrganizations: number;
  dispatched: number;
  skipped: number;
  details: DispatchDetail[];
};

export type JobRunResult = {
  attempted: number;
  claimed: number;
  completed: number;
  failed: number;
  details: Array<{
    jobId: string;
    jobType: QueueJobType;
    organizationId: string;
    status: "completed" | "failed" | "skipped" | "retried";
    message: string;
  }>;
};

const customerPopbillAutoJoinPayloadSchema = z.object({
  customerId: z.number().int().positive()
});

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function normalizeTimeZone(value: string | null): string {
  const candidate = value?.trim() || "Asia/Seoul";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "Asia/Seoul";
  }
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year") ?? "0"),
    month: Number(values.get("month") ?? "0"),
    day: Number(values.get("day") ?? "0"),
    hour: Number(values.get("hour") ?? "0"),
    minute: Number(values.get("minute") ?? "0")
  };
}

function getEffectiveMonthlyDay(year: number, month: number, configuredDay: number): number {
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.max(1, Math.min(configuredDay, maxDay));
}

function hasReachedMonthlySchedule(
  now: Date,
  timeZone: string,
  configuredDay: number,
  scheduledHour: number,
  scheduledMinute: number
): boolean {
  const parts = getZonedParts(now, timeZone);
  const scheduledDay = getEffectiveMonthlyDay(parts.year, parts.month, configuredDay);

  if (parts.day > scheduledDay) return true;
  if (parts.day < scheduledDay) return false;
  if (parts.hour > scheduledHour) return true;
  if (parts.hour < scheduledHour) return false;
  return parts.minute >= scheduledMinute;
}

function hasCompletedMonthlySchedule(
  latestReferenceAt: string | null,
  now: Date,
  timeZone: string,
  configuredDay: number,
  scheduledHour: number,
  scheduledMinute: number
): boolean {
  if (!latestReferenceAt) {
    return false;
  }

  const current = getZonedParts(now, timeZone);
  const latest = getZonedParts(new Date(latestReferenceAt), timeZone);
  if (current.year !== latest.year || current.month !== latest.month) {
    return false;
  }

  const scheduledDay = getEffectiveMonthlyDay(current.year, current.month, configuredDay);
  if (latest.day > scheduledDay) return true;
  if (latest.day < scheduledDay) return false;
  if (latest.hour > scheduledHour) return true;
  if (latest.hour < scheduledHour) return false;
  return latest.minute >= scheduledMinute;
}

function createMonthlyBatchKey(now: Date, timeZone: string, scheduledDay: number): string {
  const parts = getZonedParts(now, timeZone);
  return `monthly:${parts.year}-${String(parts.month).padStart(2, "0")}:${scheduledDay}:${timeZone}`;
}

function getRetryPolicy(jobType: QueueJobType): { maxRetries: number; delayMinutes: number } {
  switch (jobType) {
    case "mail-sync":
      return { maxRetries: 2, delayMinutes: 10 };
    case "certificate-check":
      return { maxRetries: 1, delayMinutes: 30 };
    case "customer-onboarding-commit":
      return { maxRetries: 1, delayMinutes: 1 };
    case "customer-popbill-auto-join":
      return { maxRetries: 2, delayMinutes: 3 };
    default:
      return { maxRetries: 0, delayMinutes: 0 };
  }
}

async function scheduleRetry(job: QueueJob, errorMessage: string): Promise<{ scheduled: boolean; retryCount: number }> {
  const client = createSupabaseAdminClient();
  const retryPolicy = getRetryPolicy(job.jobType);
  const currentRetryCount = asNumber(job.payload.retryCount, 0);

  if (currentRetryCount >= retryPolicy.maxRetries) {
    return {
      scheduled: false,
      retryCount: currentRetryCount
    };
  }

  const retryCount = currentRetryCount + 1;
  const runAfter = new Date(Date.now() + retryPolicy.delayMinutes * 60_000).toISOString();
  await assertNoError(
    "작업 재시도 예약 실패",
    client
      .from("job_queue")
      .update({
        status: "queued",
        run_after: runAfter,
        payload: {
          ...job.payload,
          retryCount,
          lastError: errorMessage,
          lastRetriedAt: nowIso()
        },
        error: null,
        claimed_at: null,
        finished_at: null,
        result: {
          ...(job.result ?? {}),
          retryScheduled: true
        }
      })
      .eq("id", job.id)
      .eq("status", "claimed")
  );

  return {
    scheduled: true,
    retryCount
  };
}

async function requeueStaleClaimedJobs(now: Date): Promise<number> {
  const client = createSupabaseAdminClient();
  const earliestStaleClaimedAt = new Date(
    now.getTime() - Math.min(...Object.values(JOB_CLAIM_TIMEOUT_MINUTES)) * 60_000
  ).toISOString();
  const claimedRows = await assertNoError(
    "stale claimed job 조회 실패",
    client
      .from("job_queue")
      .select("*")
      .eq("status", "claimed")
      .not("claimed_at", "is", null)
      .lte("claimed_at", earliestStaleClaimedAt)
  );
  let requeuedCount = 0;

  for (const row of (claimedRows ?? []) as Row[]) {
    const job = mapQueueJob(row);
    if (!job.claimedAt) {
      continue;
    }

    const claimStartedAt = Date.parse(job.claimedAt);
    if (!Number.isFinite(claimStartedAt)) {
      continue;
    }

    const timeoutMinutes = JOB_CLAIM_TIMEOUT_MINUTES[job.jobType] ?? 10;
    const staleCutoff = now.getTime() - timeoutMinutes * 60_000;
    if (claimStartedAt > staleCutoff) {
      continue;
    }

    await assertNoError(
      "stale claimed job 재큐잉 실패",
      client
        .from("job_queue")
        .update({
          status: "queued",
          run_after: now.toISOString(),
          claimed_at: null,
          finished_at: null,
          error: "이전 runner 응답이 끝나지 않아 자동으로 다시 대기열에 올렸습니다.",
          result: {
            ...(job.result ?? {}),
            recoveredFromStaleClaim: true,
            previousClaimedAt: job.claimedAt,
            requeuedAt: nowIso()
          }
        })
        .eq("id", job.id)
        .eq("status", "claimed")
    );
    requeuedCount += 1;
  }

  return requeuedCount;
}

async function hasBatchSummaryLog(organizationId: string, batchKey: string): Promise<boolean> {
  const client = createSupabaseAdminClient();
  const { count, error } = await client
    .from("app_logs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("scope", "job-batch-summary")
    .contains("context_json", { batchKey });

  if (error) {
    throw new Error(`배치 요약 로그 확인에 실패했습니다: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

function parseBatchMonthLabel(batchKey: string): string {
  const match = batchKey.match(/^monthly:(\d{4})-(\d{2}):/);
  if (!match) {
    return "이번 달";
  }
  return `${match[1]}-${match[2]}`;
}

async function maybeSendBatchSummary(organizationId: string, batchKey: string): Promise<void> {
  if (await hasBatchSummaryLog(organizationId, batchKey)) {
    return;
  }

  const client = createSupabaseAdminClient();
  const { count: remainingCount, error: remainingError } = await client
    .from("job_queue")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .contains("payload", { batchKey })
    .in("status", ["queued", "claimed"]);

  if (remainingError) {
    throw new Error(`배치 열린 작업 조회에 실패했습니다: ${remainingError.message}`);
  }

  if ((remainingCount ?? 0) > 0) {
    return;
  }

  const rows = await assertNoError(
    "배치 작업 조회 실패",
    client
      .from("job_queue")
      .select("*")
      .eq("organization_id", organizationId)
      .contains("payload", { batchKey })
      .order("created_at", { ascending: true })
  );

  const jobs = (rows ?? []) as Row[];
  const mailSyncJob = jobs.find((row) => asString(row.job_type) === "mail-sync") ?? null;
  const mailSyncResult = (mailSyncJob?.result as Record<string, unknown> | null) ?? {};

  const monthLabel = parseBatchMonthLabel(batchKey);
  const lines = [
    `[AUTO-TAX] 월 자동 처리 요약`,
    `대상 월: ${monthLabel}`,
    `배치 키: ${batchKey}`,
    ``,
    `메일 동기화`,
    `- 읽은 메일: ${asNumber(mailSyncResult.scanned, 0)}건`,
    `- 가져온 메일: ${asNumber(mailSyncResult.imported, 0)}건`,
    `- 생성된 초안: ${asNumber(mailSyncResult.createdDrafts, 0)}건`,
    `- 고객 미매칭: ${asNumber(mailSyncResult.unmatched, 0)}건`,
    `- 파싱 실패: ${asNumber(mailSyncResult.failures, 0)}건`
  ];

  const store = new SupabaseStore({
    organizationId,
    bootstrapOrganization: false
  });
  await store.initialize();
  const settings = await store.getSettings();
  const sent = await sendNotification(settings, `[AUTO-TAX] ${monthLabel} 자동 처리 요약`, lines.join("\n"));

  await store.createLog("info", "job-batch-summary", "월 자동 처리 요약을 정리했습니다.", {
    batchKey,
    sent,
    unmatched: asNumber(mailSyncResult.unmatched, 0),
    parseFailures: asNumber(mailSyncResult.failures, 0)
  });
}

async function assertNoError<T>(label: string, promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function listOrganizationsWithJoinedPopbillCustomers(
  client: ReturnType<typeof createSupabaseAdminClient>,
  organizationIds: string[]
): Promise<Set<string>> {
  if (organizationIds.length === 0) {
    return new Set();
  }

  const rows = await assertNoError(
    "joined 팝빌 고객 조직 조회 실패",
    client
      .from("managed_customers")
      .select("organization_id")
      .in("organization_id", organizationIds)
      .eq("popbill_state", "joined")
  );

  return new Set(((rows ?? []) as Row[]).map((row) => asString(row.organization_id)).filter(Boolean));
}

async function loadRecurringDispatchContext(): Promise<RecurringDispatchContext> {
  const client = createSupabaseAdminClient();
  const [settingsRows, integrationRows] = await Promise.all([
    assertNoError(
      "조직 설정 목록 조회 실패",
      client.from("organization_settings").select("organization_id, scheduler_enabled, default_issue_day, default_issue_hour, default_issue_minute, timezone, cert_last_checked_at")
    ),
    assertNoError(
      "조직 연동 목록 조회 실패",
      client.from("organization_integrations").select("organization_id, imap_host, imap_user, imap_pass_encrypted")
    )
  ]);
  const normalizedSettingsRows = ((settingsRows ?? []) as Row[]).map((row) => row);

  return {
    settingsRows: normalizedSettingsRows,
    integrationRows: ((integrationRows ?? []) as Row[]).map((row) => row),
    joinedCustomerOrganizationIds: await listOrganizationsWithJoinedPopbillCustomers(
      client,
      normalizedSettingsRows
        .filter((row) => asBoolean(row.scheduler_enabled, true))
        .map((row) => asString(row.organization_id))
        .filter(Boolean)
    )
  };
}

function mapQueueJob(row: Row): QueueJob {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    managedCustomerId: asNullableString(row.managed_customer_id),
    jobType: asString(row.job_type) as QueueJobType,
    status: asString(row.status, "queued") as QueueJobStatus,
    runAfter: asString(row.run_after),
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    result: (row.result as Record<string, unknown> | null) ?? null,
    error: asNullableString(row.error),
    claimedAt: asNullableString(row.claimed_at),
    finishedAt: asNullableString(row.finished_at),
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
  };
}

async function hasOpenJob(
  organizationId: string,
  jobType: QueueJobType,
  payloadFilter?: Record<string, unknown>
): Promise<boolean> {
  const client = createSupabaseAdminClient();
  let query = client
    .from("job_queue")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("job_type", jobType)
    .in("status", ["queued", "claimed"]);

  if (payloadFilter) {
    query = query.contains("payload", payloadFilter);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`열린 작업 확인에 실패했습니다: ${error.message}`);
  }
  return (count ?? 0) > 0;
}

async function getLatestJobReferenceAt(organizationId: string, jobType: QueueJobType): Promise<string | null> {
  const client = createSupabaseAdminClient();
  const row = await assertNoError(
    "최근 작업 조회 실패",
    client
      .from("job_queue")
      .select("created_at, claimed_at, finished_at, run_after")
      .eq("organization_id", organizationId)
      .eq("job_type", jobType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );

  if (!row) {
    return null;
  }

  const latestRow = row as Row;
  return (
    asNullableString(latestRow.finished_at) ??
    asNullableString(latestRow.claimed_at) ??
    asNullableString(latestRow.run_after) ??
    asNullableString(latestRow.created_at)
  );
}

async function enqueueJob(args: {
  organizationId: string;
  managedCustomerId?: string | null;
  jobType: QueueJobType;
  runAfter?: string;
  payload?: Record<string, unknown>;
}): Promise<QueueJob | null> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("job_queue")
    .insert({
      organization_id: args.organizationId,
      managed_customer_id: args.managedCustomerId ?? null,
      job_type: args.jobType,
      status: "queued",
      run_after: args.runAfter ?? nowIso(),
      payload: args.payload ?? {}
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return null;
    }
    throw new Error(`작업 큐 등록 실패: ${error.message}`);
  }

  return mapQueueJob(data as Row);
}

async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  const client = createSupabaseAdminClient();
  await assertNoError(
    "작업 완료 처리 실패",
    client
      .from("job_queue")
      .update({
        status: "completed",
        result,
        error: null,
        finished_at: nowIso()
      })
      .eq("id", jobId)
  );
}

async function failJob(jobId: string, errorMessage: string, result?: Record<string, unknown>): Promise<void> {
  const client = createSupabaseAdminClient();
  await assertNoError(
    "작업 실패 처리 실패",
    client
      .from("job_queue")
      .update({
        status: "failed",
        error: errorMessage,
        result: result ?? null,
        finished_at: nowIso()
      })
      .eq("id", jobId)
  );
}

async function claimQueuedJob(jobId: string, claimedBy: string): Promise<QueueJob | null> {
  const client = createSupabaseAdminClient();
  const claimed = await assertNoError(
    "작업 선점 실패",
    client
      .from("job_queue")
      .update({
        status: "claimed",
        claimed_at: nowIso(),
        result: {
          claimedBy
        },
        error: null
      })
      .eq("id", jobId)
      .eq("status", "queued")
      .select("*")
      .maybeSingle()
  );

  return claimed ? mapQueueJob(claimed as Row) : null;
}

async function executeMailSyncJob(job: QueueJob): Promise<Record<string, unknown>> {
  const store = new SupabaseStore({
    organizationId: job.organizationId,
    bootstrapOrganization: false
  });
  await store.initialize();
  const batchKey = asNullableString(job.payload.batchKey);
  const result = await syncMailbox(store, {
    mode: "scheduled"
  });
  return {
    ...result,
    batchKey
  };
}

async function executeCertificateCheckJob(job: QueueJob): Promise<Record<string, unknown>> {
  const store = new SupabaseStore({
    organizationId: job.organizationId,
    bootstrapOrganization: false
  });
  await store.initialize();
  const result = await refreshAllCertificateStatuses(store);
  return {
    ...result
  };
}

async function executeCustomerOnboardingCommitJob(job: QueueJob): Promise<Record<string, unknown>> {
  const batchId = asString(job.payload.batchId);
  if (!batchId) {
    throw new Error("customer-onboarding-commit payload.batchId is required");
  }

  const result = await runCustomerOnboardingCommitBatch(batchId);
  setImmediate(() => {
    void runDueJobs({
      limit: 25,
      claimedBy: "customer-onboarding-followup"
    }).catch(() => {
      /* best-effort follow-up runner for queued customer popbill auto-join jobs */
    });
  });
  return {
    batchId,
    status: result.status,
    completedRows: result.completedRows,
    totalRows: result.totalRows,
    successCount: result.successCount,
    failedCount: result.failedCount
  };
}

async function executeCustomerPopbillAutoJoinJob(job: QueueJob): Promise<Record<string, unknown>> {
  const payload = customerPopbillAutoJoinPayloadSchema.parse(job.payload ?? {});
  const store = new SupabaseStore({
    organizationId: job.organizationId,
    bootstrapOrganization: false
  });
  await store.initialize();

  const customer = await store.getCustomer(payload.customerId);
  if (!customer) {
    return {
      skipped: true,
      reason: "customer-not-found",
      customerId: payload.customerId
    };
  }

  const result = await autoJoinCustomerPopbill(store, customer, getServerManagedSettings, getErrorMessage);
  if (result.status === "failed") {
    throw new Error(result.error ?? "팝빌 자동 가입에 실패했습니다.");
  }

  return {
    customerId: result.customer.id,
    status: result.status,
    popbillState: result.customer.popbillState,
    popbillUserId: result.customer.popbillUserId ?? null
  };
}

async function executeJob(job: QueueJob): Promise<Record<string, unknown>> {
  if (job.jobType === "mail-sync") {
    return executeMailSyncJob(job);
  }
  if (job.jobType === "certificate-check") {
    return executeCertificateCheckJob(job);
  }
  if (job.jobType === "customer-onboarding-commit") {
    return executeCustomerOnboardingCommitJob(job);
  }
  if (job.jobType === "customer-popbill-auto-join") {
    return executeCustomerPopbillAutoJoinJob(job);
  }
  throw new Error(`지원하지 않는 job_type입니다: ${job.jobType}`);
}

export async function dispatchRecurringJobs(
  options: { now?: Date } = {},
  dependencies: Partial<DispatchRecurringJobsDependencies> = {}
): Promise<JobDispatchResult> {
  const now = options.now ?? new Date();
  const nowIsoString = now.toISOString();
  const details: DispatchDetail[] = [];
  const loadRecurringDispatchContextImpl = dependencies.loadRecurringDispatchContext ?? loadRecurringDispatchContext;
  const hasOpenJobImpl = dependencies.hasOpenJob ?? hasOpenJob;
  const getLatestJobReferenceAtImpl = dependencies.getLatestJobReferenceAt ?? getLatestJobReferenceAt;
  const enqueueJobImpl = dependencies.enqueueJob ?? enqueueJob;
  const { settingsRows, integrationRows, joinedCustomerOrganizationIds } = await loadRecurringDispatchContextImpl();

  const integrationByOrganizationId = new Map<string, Row>();
  for (const row of integrationRows) {
    integrationByOrganizationId.set(asString(row.organization_id), row);
  }

  for (const row of settingsRows) {
    const organizationId = asString(row.organization_id);
    if (!asBoolean(row.scheduler_enabled, true)) {
      details.push({
        jobType: "mail-sync",
        organizationId,
        action: "skipped",
        reason: "scheduler-disabled"
      });
      continue;
    }

    const integrationRow = integrationByOrganizationId.get(organizationId) ?? {};
    const timeZone = normalizeTimeZone(asNullableString(row.timezone));
    const scheduledDay = Math.max(1, Math.min(asNumber(row.default_issue_day, 20), 31));
    const scheduledHour = Math.max(0, Math.min(asNumber(row.default_issue_hour, 9), 23));
    const scheduledMinute = Math.max(0, Math.min(asNumber(row.default_issue_minute, 0), 59));
    const batchKey = createMonthlyBatchKey(now, timeZone, scheduledDay);
    const mailConfigured = Boolean(
      asString(integrationRow.imap_host) && asString(integrationRow.imap_user) && asString(integrationRow.imap_pass_encrypted)
    );
    if (mailConfigured) {
      const mailOpen = await hasOpenJobImpl(organizationId, "mail-sync");
      const latestMailReference = await getLatestJobReferenceAtImpl(organizationId, "mail-sync");

      if (mailOpen) {
        details.push({
          jobType: "mail-sync",
          organizationId,
          action: "skipped",
          reason: "open-job-exists"
        });
      } else if (!hasReachedMonthlySchedule(now, timeZone, scheduledDay, scheduledHour, scheduledMinute)) {
        details.push({
          jobType: "mail-sync",
          organizationId,
          action: "skipped",
          reason: "monthly-schedule-not-reached"
        });
      } else if (
        hasCompletedMonthlySchedule(latestMailReference, now, timeZone, scheduledDay, scheduledHour, scheduledMinute)
      ) {
        details.push({
          jobType: "mail-sync",
          organizationId,
          action: "skipped",
          reason: "already-ran-this-month"
        });
      } else {
        const queuedJob = await enqueueJobImpl({
          organizationId,
          jobType: "mail-sync",
          runAfter: nowIsoString,
          payload: {
            dispatchedAt: nowIsoString,
            mode: "scheduled",
            scheduleDay: scheduledDay,
            scheduleHour: scheduledHour,
            scheduleMinute: scheduledMinute,
            timezone: timeZone,
            batchKey
          }
        });
        details.push(
          queuedJob
            ? {
                jobType: "mail-sync",
                organizationId,
                action: "queued",
                reason: "due"
              }
            : {
                jobType: "mail-sync",
                organizationId,
                action: "skipped",
                reason: "open-job-raced"
              }
        );
      }
    } else {
      details.push({
        jobType: "mail-sync",
        organizationId,
        action: "skipped",
        reason: "mail-not-configured"
      });
    }

    if (!joinedCustomerOrganizationIds.has(organizationId)) {
      details.push({
        jobType: "certificate-check",
        organizationId,
        action: "skipped",
        reason: "no-joined-customers"
      });
      continue;
    }

    const certOpen = await hasOpenJobImpl(organizationId, "certificate-check");
    const certDue = shouldRefreshCertificateStatuses(asNullableString(row.cert_last_checked_at), nowIsoString);
    if (certOpen) {
      details.push({
        jobType: "certificate-check",
        organizationId,
        action: "skipped",
        reason: "open-job-exists"
      });
    } else if (!certDue) {
      details.push({
        jobType: "certificate-check",
        organizationId,
        action: "skipped",
        reason: "already-checked-today"
      });
    } else {
      const queuedJob = await enqueueJobImpl({
        organizationId,
        jobType: "certificate-check",
        runAfter: nowIsoString,
        payload: {
          dispatchedAt: nowIsoString
        }
      });
      details.push(
        queuedJob
          ? {
              jobType: "certificate-check",
              organizationId,
              action: "queued",
              reason: "due"
            }
          : {
              jobType: "certificate-check",
              organizationId,
              action: "skipped",
              reason: "open-job-raced"
            }
      );
    }
  }

  return {
    checkedOrganizations: settingsRows.length,
    dispatched: details.filter((detail) => detail.action === "queued").length,
    skipped: details.filter((detail) => detail.action === "skipped").length,
    details
  };
}

export async function runDueJobs(options: {
  now?: Date;
  limit?: number;
  claimedBy?: string;
} = {}): Promise<JobRunResult> {
  const client = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, MAX_JOB_RUN_LIMIT));
  const claimedBy = options.claimedBy ?? "job-runner";
  await requeueStaleClaimedJobs(now);
  const details: JobRunResult["details"] = [];
  let attempted = 0;
  let claimed = 0;
  let completed = 0;
  let failed = 0;

  while (claimed < limit) {
    const rows = await assertNoError(
      "실행 대기 작업 조회 실패",
      client
        .from("job_queue")
        .select("*")
        .eq("status", "queued")
        .lte("run_after", now.toISOString())
        .order("run_after", { ascending: true })
        .limit(Math.min(limit - claimed, 25))
    );

    if (!rows || rows.length === 0) {
      break;
    }

    attempted += rows.length;

    for (const row of rows as Row[]) {
      if (claimed >= limit) {
        break;
      }

      const queuedJob = mapQueueJob(row);
      const job = await claimQueuedJob(queuedJob.id, claimedBy);
      if (!job) {
        continue;
      }

      claimed += 1;

      try {
        const result = await executeJob(job);
        await completeJob(job.id, result);
        completed += 1;
        details.push({
          jobId: job.id,
          jobType: job.jobType,
          organizationId: job.organizationId,
          status: result.skipped === true ? "skipped" : "completed",
          message: result.skipped === true ? asString(result.reason, "skipped") : "completed"
        });
        const batchKey = asNullableString(job.payload.batchKey);
        if (batchKey) {
          await maybeSendBatchSummary(job.organizationId, batchKey);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "작업 실행 실패";
        const retry = await scheduleRetry(job, message);
        if (retry.scheduled) {
          details.push({
            jobId: job.id,
            jobType: job.jobType,
            organizationId: job.organizationId,
            status: "retried",
            message: `${retry.retryCount}회차 재시도를 예약했습니다.`
          });
        } else {
          await failJob(job.id, message, {
            ...(job.result ?? {}),
            lastError: message,
            retryCount: asNumber(job.payload.retryCount, 0)
          });
          failed += 1;
          details.push({
            jobId: job.id,
            jobType: job.jobType,
            organizationId: job.organizationId,
            status: "failed",
            message
          });
          const batchKey = asNullableString(job.payload.batchKey);
          if (batchKey) {
            await maybeSendBatchSummary(job.organizationId, batchKey);
          }
        }
      }
    }
  }

  return {
    attempted,
    claimed,
    completed,
    failed,
    details
  };
}
