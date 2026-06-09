import { z } from "zod";
import { refreshAllCertificateStatuses, shouldRefreshCertificateStatuses } from "./certificate-monitor.js";
import { getErrorMessage } from "./http-errors.js";
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
  claimedBy: string | null;
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
  joinedCustomerOrganizationIds: Set<string>;
};

type DispatchRecurringJobsDependencies = {
  loadRecurringDispatchContext: () => Promise<RecurringDispatchContext>;
  hasOpenJob: typeof hasOpenJob;
  enqueueJob: typeof enqueueJob;
};

type RunDueJobsDependencies = {
  requeueStaleClaimedJobs: typeof requeueStaleClaimedJobs;
  listDueQueuedJobs: typeof listDueQueuedJobs;
  claimQueuedJob: typeof claimQueuedJob;
  executeJob: typeof executeJob;
  completeJob: typeof completeJob;
  scheduleRetry: typeof scheduleRetry;
  failJob: typeof failJob;
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

export class JobClaimLostError extends Error {
  readonly status = 409;

  constructor(jobId: string) {
    super(`작업 ${jobId} 선점이 만료되었거나 다른 runner로 이동했습니다.`);
    this.name = "JobClaimLostError";
  }
}

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

function getRetryPolicy(jobType: QueueJobType): { maxRetries: number; delayMinutes: number } {
  switch (jobType) {
    case "mail-sync":
      return { maxRetries: 0, delayMinutes: 0 };
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
  const claimedBy = requireClaimedBy(job);

  if (currentRetryCount >= retryPolicy.maxRetries) {
    return {
      scheduled: false,
      retryCount: currentRetryCount
    };
  }

  const retryCount = currentRetryCount + 1;
  const runAfter = new Date(Date.now() + retryPolicy.delayMinutes * 60_000).toISOString();
  const updated = await assertNoError(
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
      .contains("result", { claimedBy })
      .select("id")
      .maybeSingle()
  );

  if (!updated) {
    throw new JobClaimLostError(job.id);
  }

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
    "joined 발행 연동 고객 조직 조회 실패",
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
  const settingsRows = await assertNoError(
    "조직 설정 목록 조회 실패",
    client.from("organization_settings").select("organization_id, scheduler_enabled, cert_last_checked_at")
  );
  const normalizedSettingsRows = ((settingsRows ?? []) as Row[]).map((row) => row);

  return {
    settingsRows: normalizedSettingsRows,
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
  const result = (row.result as Record<string, unknown> | null) ?? null;
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    managedCustomerId: asNullableString(row.managed_customer_id),
    jobType: asString(row.job_type) as QueueJobType,
    status: asString(row.status, "queued") as QueueJobStatus,
    runAfter: asString(row.run_after),
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    result,
    error: asNullableString(row.error),
    claimedAt: asNullableString(row.claimed_at),
    claimedBy: asNullableString(result?.claimedBy),
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

function requireClaimedBy(job: QueueJob): string {
  if (!job.claimedBy) {
    throw new JobClaimLostError(job.id);
  }
  return job.claimedBy;
}

async function completeJob(job: QueueJob, result: Record<string, unknown>): Promise<void> {
  const client = createSupabaseAdminClient();
  const claimedBy = requireClaimedBy(job);
  const updated = await assertNoError(
    "작업 완료 처리 실패",
    client
      .from("job_queue")
      .update({
        status: "completed",
        result,
        error: null,
        finished_at: nowIso()
      })
      .eq("id", job.id)
      .eq("status", "claimed")
      .contains("result", { claimedBy })
      .select("id")
      .maybeSingle()
  );

  if (!updated) {
    throw new JobClaimLostError(job.id);
  }
}

async function failJob(job: QueueJob, errorMessage: string, result?: Record<string, unknown>): Promise<void> {
  const client = createSupabaseAdminClient();
  const claimedBy = requireClaimedBy(job);
  const updated = await assertNoError(
    "작업 실패 처리 실패",
    client
      .from("job_queue")
      .update({
        status: "failed",
        error: errorMessage,
        result: result ?? null,
        finished_at: nowIso()
      })
      .eq("id", job.id)
      .eq("status", "claimed")
      .contains("result", { claimedBy })
      .select("id")
      .maybeSingle()
  );

  if (!updated) {
    throw new JobClaimLostError(job.id);
  }
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

async function listDueQueuedJobs(
  client: ReturnType<typeof createSupabaseAdminClient>,
  now: Date,
  limit: number
): Promise<Row[]> {
  const rows = await assertNoError(
    "실행 대기 작업 조회 실패",
    client
      .from("job_queue")
      .select("*")
      .eq("status", "queued")
      .lte("run_after", now.toISOString())
      .order("run_after", { ascending: true })
      .limit(Math.min(limit, 25))
  );

  return rows ?? [];
}

function skipRetiredMailSyncJob(job: QueueJob): Record<string, unknown> {
  return {
    skipped: true,
    reason: "scheduled-mail-sync-disabled",
    previousMode: asNullableString(job.payload.mode)
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
    throw new Error(result.error ?? "발행 연동 자동 가입에 실패했습니다.");
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
    return skipRetiredMailSyncJob(job);
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
  const enqueueJobImpl = dependencies.enqueueJob ?? enqueueJob;
  const { settingsRows, joinedCustomerOrganizationIds } = await loadRecurringDispatchContextImpl();

  for (const row of settingsRows) {
    const organizationId = asString(row.organization_id);
    if (!asBoolean(row.scheduler_enabled, true)) {
      details.push({
        jobType: "certificate-check",
        organizationId,
        action: "skipped",
        reason: "scheduler-disabled"
      });
      continue;
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
} = {}, dependencies: Partial<RunDueJobsDependencies> = {}): Promise<JobRunResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, MAX_JOB_RUN_LIMIT));
  const claimedBy = options.claimedBy ?? "job-runner";
  const requeueStaleClaimedJobsImpl = dependencies.requeueStaleClaimedJobs ?? requeueStaleClaimedJobs;
  const claimQueuedJobImpl = dependencies.claimQueuedJob ?? claimQueuedJob;
  const executeJobImpl = dependencies.executeJob ?? executeJob;
  const completeJobImpl = dependencies.completeJob ?? completeJob;
  const scheduleRetryImpl = dependencies.scheduleRetry ?? scheduleRetry;
  const failJobImpl = dependencies.failJob ?? failJob;
  let dueJobsClient: ReturnType<typeof createSupabaseAdminClient> | null = null;
  const listDueQueuedJobsImpl = async (listNow: Date, listLimit: number): Promise<Row[]> => {
    if (dependencies.listDueQueuedJobs) {
      return dependencies.listDueQueuedJobs(undefined as never, listNow, listLimit);
    }
    if (!dueJobsClient) {
      dueJobsClient = createSupabaseAdminClient();
    }
    return listDueQueuedJobs(dueJobsClient, listNow, listLimit);
  };
  await requeueStaleClaimedJobsImpl(now);
  const details: JobRunResult["details"] = [];
  let attempted = 0;
  let claimed = 0;
  let completed = 0;
  let failed = 0;

  while (claimed < limit) {
    const rows = await listDueQueuedJobsImpl(now, limit - claimed);

    if (!rows || rows.length === 0) {
      break;
    }

    attempted += rows.length;

    for (const row of rows as Row[]) {
      if (claimed >= limit) {
        break;
      }

      const queuedJob = mapQueueJob(row);
      const job = await claimQueuedJobImpl(queuedJob.id, claimedBy);
      if (!job) {
        continue;
      }

      claimed += 1;

      try {
        const result = await executeJobImpl(job);
        await completeJobImpl(job, result);
        completed += 1;
        details.push({
          jobId: job.id,
          jobType: job.jobType,
          organizationId: job.organizationId,
          status: result.skipped === true ? "skipped" : "completed",
          message: result.skipped === true ? asString(result.reason, "skipped") : "completed"
        });
      } catch (error) {
        if (error instanceof JobClaimLostError) {
          details.push({
            jobId: job.id,
            jobType: job.jobType,
            organizationId: job.organizationId,
            status: "skipped",
            message: error.message
          });
          continue;
        }

        const message = error instanceof Error ? error.message : "작업 실행 실패";
        let retry;
        try {
          retry = await scheduleRetryImpl(job, message);
        } catch (retryError) {
          if (retryError instanceof JobClaimLostError) {
            details.push({
              jobId: job.id,
              jobType: job.jobType,
              organizationId: job.organizationId,
              status: "skipped",
              message: retryError.message
            });
            continue;
          }
          throw retryError;
        }
        if (retry.scheduled) {
          details.push({
            jobId: job.id,
            jobType: job.jobType,
            organizationId: job.organizationId,
            status: "retried",
            message: `${retry.retryCount}회차 재시도를 예약했습니다.`
          });
        } else {
          try {
            await failJobImpl(job, message, {
              ...(job.result ?? {}),
              lastError: message,
              retryCount: asNumber(job.payload.retryCount, 0)
            });
          } catch (failError) {
            if (failError instanceof JobClaimLostError) {
              details.push({
                jobId: job.id,
                jobType: job.jobType,
                organizationId: job.organizationId,
                status: "skipped",
                message: failError.message
              });
              continue;
            }
            throw failError;
          }
          failed += 1;
          details.push({
            jobId: job.id,
            jobType: job.jobType,
            organizationId: job.organizationId,
            status: "failed",
            message
          });
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
