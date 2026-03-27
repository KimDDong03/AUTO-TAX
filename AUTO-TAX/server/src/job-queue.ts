import { z } from "zod";
import { issueDraftNow } from "./automation.js";
import { refreshAllCertificateStatuses, shouldRefreshCertificateStatuses } from "./certificate-monitor.js";
import { syncMailbox } from "./mail-sync.js";
import { sendNotification } from "./notifier.js";
import { getServerManagedSettings } from "./server-managed-settings.js";
import { createSupabaseAdminClient } from "./supabase.js";
import { SupabaseStore } from "./supabase-store.js";
import { nowIso } from "./utils.js";

type Row = Record<string, unknown>;
type QueueJobType = "mail-sync" | "auto-issue" | "certificate-check";
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

type DispatchDetail = {
  jobType: QueueJobType;
  organizationId: string;
  action: "queued" | "skipped";
  reason: string;
  draftId?: number;
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

const autoIssuePayloadSchema = z.object({
  draftId: z.number().int().positive()
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
    case "auto-issue":
      return { maxRetries: 3, delayMinutes: 5 };
    case "certificate-check":
      return { maxRetries: 1, delayMinutes: 30 };
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
  const autoIssueJobs = jobs.filter((row) => asString(row.job_type) === "auto-issue");

  const mailSyncResult = (mailSyncJob?.result as Record<string, unknown> | null) ?? {};
  const completedIssues = autoIssueJobs.filter(
    (row) => asString(row.status) === "completed" && asBoolean((row.result as Record<string, unknown> | null)?.skipped, false) === false
  );
  const skippedIssues = autoIssueJobs.filter(
    (row) => asString(row.status) === "completed" && asBoolean((row.result as Record<string, unknown> | null)?.skipped, false) === true
  );
  const failedIssues = autoIssueJobs.filter((row) => asString(row.status) === "failed");

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
    `- 자동 발행 예약: ${asNumber(mailSyncResult.scheduledDrafts, 0)}건`,
    `- 고객 미매칭: ${asNumber(mailSyncResult.unmatched, 0)}건`,
    `- 파싱 실패: ${asNumber(mailSyncResult.failures, 0)}건`,
    ``,
    `자동 발행`,
    `- 성공: ${completedIssues.length}건`,
    `- 건너뜀: ${skippedIssues.length}건`,
    `- 실패: ${failedIssues.length}건`
  ];

  if (failedIssues.length > 0) {
    lines.push("", "실패 건");
    for (const row of failedIssues.slice(0, 10)) {
      const result = (row.result as Record<string, unknown> | null) ?? {};
      const draftId = asNumber((row.payload as Record<string, unknown> | null)?.draftId, 0);
      lines.push(`- draftId=${draftId}: ${asString(row.error || result.lastError, "오류 확인 필요")}`);
    }
  }

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
    autoIssueCompleted: completedIssues.length,
    autoIssueFailed: failedIssues.length,
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

async function enqueueDueAutoIssueJobs(options: {
  organizationId?: string;
  now?: Date;
  batchKey?: string | null;
} = {}): Promise<DispatchDetail[]> {
  const client = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const nowIsoString = now.toISOString();
  let query = client
    .from("invoice_drafts")
    .select("organization_id, managed_customer_id, legacy_id")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIsoString)
    .order("scheduled_for", { ascending: true });

  if (options.organizationId) {
    query = query.eq("organization_id", options.organizationId);
  }

  const rows = await assertNoError("자동 발행 대상 초안 조회 실패", query);
  const details: DispatchDetail[] = [];

  for (const row of (rows ?? []) as Row[]) {
    const organizationId = asString(row.organization_id);
    const draftId = asNumber(row.legacy_id);
    const managedCustomerId = asNullableString(row.managed_customer_id);
    const openJob = await hasOpenJob(organizationId, "auto-issue", {
      draftId
    });

    if (openJob) {
      details.push({
        jobType: "auto-issue",
        organizationId,
        action: "skipped",
        reason: "open-job-exists",
        draftId
      });
      continue;
    }

    const queuedJob = await enqueueJob({
      organizationId,
      managedCustomerId,
      jobType: "auto-issue",
      runAfter: nowIsoString,
      payload: {
        draftId,
        dispatchedAt: nowIsoString,
        ...(options.batchKey ? { batchKey: options.batchKey } : {})
      }
    });

    details.push(
      queuedJob
        ? {
            jobType: "auto-issue",
            organizationId,
            action: "queued",
            reason: "due",
            draftId
          }
        : {
            jobType: "auto-issue",
            organizationId,
            action: "skipped",
            reason: "open-job-raced",
            draftId
          }
    );
  }

  return details;
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
  const autoIssueQueueDetails = await enqueueDueAutoIssueJobs({
    organizationId: job.organizationId,
    batchKey
  });
  return {
    ...result,
    batchKey,
    autoIssueQueued: autoIssueQueueDetails.filter((detail) => detail.action === "queued").length,
    autoIssueSkipped: autoIssueQueueDetails.filter((detail) => detail.action === "skipped").length
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

async function executeAutoIssueJob(job: QueueJob): Promise<Record<string, unknown>> {
  const payload = autoIssuePayloadSchema.parse(job.payload ?? {});
  const store = new SupabaseStore({
    organizationId: job.organizationId,
    bootstrapOrganization: false
  });
  await store.initialize();

  const draft = await store.getDraft(payload.draftId);
  if (!draft) {
    return {
      skipped: true,
      reason: "draft-not-found",
      draftId: payload.draftId
    };
  }

  const claimedDraft = await store.claimDraftForIssue(payload.draftId);
  if (!claimedDraft) {
    return {
      skipped: true,
      reason: "draft-not-claimable",
      draftId: payload.draftId
    };
  }

  const customer = await store.getCustomer(claimedDraft.customerId);
  if (!customer) {
    const message = `자동 발행 대상 고객을 찾지 못했습니다. draftId=${payload.draftId}`;
    await store.updateDraftStatus(payload.draftId, "failed", message);
    await sendNotification(
      await store.getSettings(),
      "[AUTO-TAX] 자동 발행 실패",
      `자동 발행 대상 고객을 찾지 못했습니다.\n초안 번호: ${payload.draftId}\n오류: ${message}`
    );
    throw new Error(message);
  }

  try {
    const issuedDraft = await issueDraftNow(store, await getServerManagedSettings(store), customer, claimedDraft);
    await store.createLog("info", "job-runner", "자동 발행 큐 작업을 완료했습니다.", {
      draftId: payload.draftId,
      customerId: customer.id
    });

    return {
      skipped: false,
      draftId: payload.draftId,
      status: issuedDraft.status,
      issuedAt: issuedDraft.issuedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "자동 발행 실패";
    await store.updateDraftStatus(payload.draftId, "failed", message);
    await store.createLog("error", "job-runner", "자동 발행 큐 작업이 실패했습니다.", {
      draftId: payload.draftId,
      customerId: customer.id,
      error: message
    });
    await sendNotification(
      await store.getSettings(),
      "[AUTO-TAX] 자동 발행 실패",
      `자동 발행에 실패했습니다.\n고객: ${customer.customerName}\n초안 번호: ${payload.draftId}\n오류: ${message}`
    );
    throw error;
  }
}

async function executeJob(job: QueueJob): Promise<Record<string, unknown>> {
  if (job.jobType === "mail-sync") {
    return executeMailSyncJob(job);
  }
  if (job.jobType === "certificate-check") {
    return executeCertificateCheckJob(job);
  }
  if (job.jobType === "auto-issue") {
    return executeAutoIssueJob(job);
  }
  throw new Error(`지원하지 않는 job_type입니다: ${job.jobType}`);
}

export async function dispatchRecurringJobs(options: { now?: Date } = {}): Promise<JobDispatchResult> {
  const client = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const nowIsoString = now.toISOString();
  const details: DispatchDetail[] = [];

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

  const integrationByOrganizationId = new Map<string, Row>();
  for (const row of (integrationRows ?? []) as Row[]) {
    integrationByOrganizationId.set(asString(row.organization_id), row);
  }

  for (const row of (settingsRows ?? []) as Row[]) {
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
    const scheduledDay = Math.max(1, Math.min(asNumber(row.default_issue_day, 26), 31));
    const scheduledHour = Math.max(0, Math.min(asNumber(row.default_issue_hour, 9), 23));
    const scheduledMinute = Math.max(0, Math.min(asNumber(row.default_issue_minute, 0), 59));
    const batchKey = createMonthlyBatchKey(now, timeZone, scheduledDay);
    const mailConfigured = Boolean(
      asString(integrationRow.imap_host) && asString(integrationRow.imap_user) && asString(integrationRow.imap_pass_encrypted)
    );
    if (mailConfigured) {
      const mailOpen = await hasOpenJob(organizationId, "mail-sync");
      const latestMailReference = await getLatestJobReferenceAt(organizationId, "mail-sync");

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
        const queuedJob = await enqueueJob({
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

    const certOpen = await hasOpenJob(organizationId, "certificate-check");
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
      const queuedJob = await enqueueJob({
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

  details.push(...(await enqueueDueAutoIssueJobs({ now })));

  return {
    checkedOrganizations: (settingsRows ?? []).length,
    dispatched: details.filter((detail) => detail.action === "queued").length,
    skipped: details.filter((detail) => detail.action === "skipped").length,
    details
  };
}

export async function runDueJobs(options: { now?: Date; limit?: number; claimedBy?: string } = {}): Promise<JobRunResult> {
  const client = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 100));
  const claimedBy = options.claimedBy ?? "job-runner";
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
