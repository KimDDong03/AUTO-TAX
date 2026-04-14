import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_LOG_RETENTION_DAYS,
  JOB_QUEUE_PRUNABLE_STATUSES,
  JOB_QUEUE_RETENTION_DAYS,
  RENEWAL_AUTOMATION_JOB_PRUNABLE_STATUSES,
  RENEWAL_AUTOMATION_JOB_RETENTION_DAYS,
  createSupabaseMaintenanceRepository,
  runPlatformMaintenance
} from "./maintenance-retention.js";

type AppLogRow = {
  id: string;
  createdAt: string;
};

type QueueRow = {
  id: string;
  status: string;
  finishedAt: string | null;
};

type PruneCall = {
  table: string;
  cutoff: string;
  statuses?: readonly string[];
};

function isoDaysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function createInMemoryRepository(seed: {
  appLogs: AppLogRow[];
  jobQueue: QueueRow[];
  renewalAutomationJobs: QueueRow[];
  completedDate?: string | null;
}) {
  const state = {
    appLogs: [...seed.appLogs],
    jobQueue: [...seed.jobQueue],
    renewalAutomationJobs: [...seed.renewalAutomationJobs],
    completedDate: seed.completedDate ?? null,
    pruneCalls: [] as PruneCall[],
    completedSummaries: [] as unknown[]
  };

  return {
    state,
    repository: {
      async getCompletedDate() {
        return state.completedDate;
      },
      async pruneAppLogs(cutoff: string) {
        state.pruneCalls.push({ table: "app_logs", cutoff });
        const before = state.appLogs.length;
        state.appLogs = state.appLogs.filter((row) => row.createdAt >= cutoff);
        return before - state.appLogs.length;
      },
      async pruneJobQueue(cutoff: string, statuses: readonly string[]) {
        state.pruneCalls.push({ table: "job_queue", cutoff, statuses });
        const before = state.jobQueue.length;
        state.jobQueue = state.jobQueue.filter(
          (row) => !(statuses.includes(row.status) && row.finishedAt !== null && row.finishedAt < cutoff)
        );
        return before - state.jobQueue.length;
      },
      async pruneRenewalAutomationJobs(cutoff: string, statuses: readonly string[]) {
        state.pruneCalls.push({ table: "renewal_automation_jobs", cutoff, statuses });
        const before = state.renewalAutomationJobs.length;
        state.renewalAutomationJobs = state.renewalAutomationJobs.filter(
          (row) => !(statuses.includes(row.status) && row.finishedAt !== null && row.finishedAt < cutoff)
        );
        return before - state.renewalAutomationJobs.length;
      },
      async saveCompletedRun(args: { completedDate: string; summary: unknown }) {
        state.completedDate = args.completedDate;
        state.completedSummaries.push(args.summary);
      },
      async saveFailedRun() {
        throw new Error("saveFailedRun should not be called in success cases");
      }
    }
  };
}

test("runPlatformMaintenance prunes only old terminal rows and leaves open rows untouched", async () => {
  const now = new Date("2026-04-14T12:00:00.000Z");
  const { repository, state } = createInMemoryRepository({
    appLogs: [
      { id: "log-old", createdAt: isoDaysBefore(now, APP_LOG_RETENTION_DAYS + 5) },
      { id: "log-recent", createdAt: isoDaysBefore(now, APP_LOG_RETENTION_DAYS - 5) }
    ],
    jobQueue: [
      { id: "job-old-completed", status: "completed", finishedAt: isoDaysBefore(now, JOB_QUEUE_RETENTION_DAYS + 5) },
      { id: "job-old-failed", status: "failed", finishedAt: isoDaysBefore(now, JOB_QUEUE_RETENTION_DAYS + 6) },
      { id: "job-old-cancelled", status: "cancelled", finishedAt: isoDaysBefore(now, JOB_QUEUE_RETENTION_DAYS + 7) },
      { id: "job-recent-completed", status: "completed", finishedAt: isoDaysBefore(now, JOB_QUEUE_RETENTION_DAYS - 3) },
      { id: "job-old-queued", status: "queued", finishedAt: isoDaysBefore(now, JOB_QUEUE_RETENTION_DAYS + 9) },
      { id: "job-old-claimed", status: "claimed", finishedAt: isoDaysBefore(now, JOB_QUEUE_RETENTION_DAYS + 10) },
      { id: "job-terminal-without-finish", status: "completed", finishedAt: null }
    ],
    renewalAutomationJobs: [
      {
        id: "renewal-old-completed",
        status: "completed",
        finishedAt: isoDaysBefore(now, RENEWAL_AUTOMATION_JOB_RETENTION_DAYS + 5)
      },
      {
        id: "renewal-old-failed",
        status: "failed",
        finishedAt: isoDaysBefore(now, RENEWAL_AUTOMATION_JOB_RETENTION_DAYS + 6)
      },
      {
        id: "renewal-recent-failed",
        status: "failed",
        finishedAt: isoDaysBefore(now, RENEWAL_AUTOMATION_JOB_RETENTION_DAYS - 4)
      },
      {
        id: "renewal-old-queued",
        status: "queued",
        finishedAt: isoDaysBefore(now, RENEWAL_AUTOMATION_JOB_RETENTION_DAYS + 10)
      },
      {
        id: "renewal-old-claimed",
        status: "claimed",
        finishedAt: isoDaysBefore(now, RENEWAL_AUTOMATION_JOB_RETENTION_DAYS + 11)
      }
    ]
  });

  const result = await runPlatformMaintenance(
    { now },
    {
      repository,
      logger: () => {}
    }
  );

  assert.equal(result.action, "pruned");
  assert.equal(result.completedDate, "2026-04-14");
  assert.equal(result.totalDeletedRows, 6);
  assert.deepEqual(
    result.tables.map((table) => ({
      table: table.table,
      deletedRows: table.deletedRows,
      retentionDays: table.retentionDays
    })),
    [
      {
        table: "app_logs",
        deletedRows: 1,
        retentionDays: APP_LOG_RETENTION_DAYS
      },
      {
        table: "job_queue",
        deletedRows: 3,
        retentionDays: JOB_QUEUE_RETENTION_DAYS
      },
      {
        table: "renewal_automation_jobs",
        deletedRows: 2,
        retentionDays: RENEWAL_AUTOMATION_JOB_RETENTION_DAYS
      }
    ]
  );
  assert.deepEqual(
    state.jobQueue.map((row) => row.id).sort(),
    ["job-old-claimed", "job-old-queued", "job-recent-completed", "job-terminal-without-finish"].sort()
  );
  assert.deepEqual(
    state.renewalAutomationJobs.map((row) => row.id).sort(),
    ["renewal-old-claimed", "renewal-old-queued", "renewal-recent-failed"].sort()
  );
  assert.deepEqual(
    state.pruneCalls.map((call) => ({
      table: call.table,
      statuses: call.statuses ?? null
    })),
    [
      { table: "app_logs", statuses: null },
      { table: "job_queue", statuses: JOB_QUEUE_PRUNABLE_STATUSES },
      { table: "renewal_automation_jobs", statuses: RENEWAL_AUTOMATION_JOB_PRUNABLE_STATUSES }
    ]
  );
  assert.equal(state.completedSummaries.length, 1);
});

test("runPlatformMaintenance skips when the retention run already completed today", async () => {
  const now = new Date("2026-04-14T03:00:00.000Z");
  let pruneCalled = false;

  const result = await runPlatformMaintenance(
    { now },
    {
      repository: {
        async getCompletedDate() {
          return "2026-04-14";
        },
        async pruneAppLogs() {
          pruneCalled = true;
          return 0;
        },
        async pruneJobQueue() {
          pruneCalled = true;
          return 0;
        },
        async pruneRenewalAutomationJobs() {
          pruneCalled = true;
          return 0;
        },
        async saveCompletedRun() {
          throw new Error("saveCompletedRun should not be called on skip");
        },
        async saveFailedRun() {
          throw new Error("saveFailedRun should not be called on skip");
        }
      },
      logger: () => {}
    }
  );

  assert.equal(pruneCalled, false);
  assert.equal(result.action, "skipped");
  assert.equal(result.reason, "already-completed-today");
  assert.equal(result.totalDeletedRows, 0);
  assert.deepEqual(result.tables, []);
});

test("runPlatformMaintenance checkpoints failures before rethrowing the prune error", async () => {
  const now = new Date("2026-04-14T12:00:00.000Z");
  const failures: Array<{
    maintenanceKey: string;
    ranAt: string;
    error: string;
  }> = [];

  await assert.rejects(
    () =>
      runPlatformMaintenance(
        { now },
        {
          repository: {
            async getCompletedDate() {
              return null;
            },
            async pruneAppLogs() {
              throw new Error("app_logs prune failed");
            },
            async pruneJobQueue() {
              throw new Error("pruneJobQueue should not be called after app log prune failure");
            },
            async pruneRenewalAutomationJobs() {
              throw new Error("pruneRenewalAutomationJobs should not be called after app log prune failure");
            },
            async saveCompletedRun() {
              throw new Error("saveCompletedRun should not be called on failure");
            },
            async saveFailedRun(args) {
              failures.push(args);
            }
          },
          logger: () => {}
        }
      ),
    /app_logs prune failed/
  );

  assert.deepEqual(failures, [
    {
      maintenanceKey: "retention-prune",
      ranAt: now.toISOString(),
      error: "app_logs prune failed"
    }
  ]);
});

test("runPlatformMaintenance preserves the original prune error when failure checkpointing also fails", async () => {
  const now = new Date("2026-04-14T12:00:00.000Z");

  await assert.rejects(
    () =>
      runPlatformMaintenance(
        { now },
        {
          repository: {
            async getCompletedDate() {
              return null;
            },
            async pruneAppLogs() {
              throw new Error("app_logs prune failed");
            },
            async pruneJobQueue() {
              throw new Error("pruneJobQueue should not be called after app log prune failure");
            },
            async pruneRenewalAutomationJobs() {
              throw new Error("pruneRenewalAutomationJobs should not be called after app log prune failure");
            },
            async saveCompletedRun() {
              throw new Error("saveCompletedRun should not be called on failure");
            },
            async saveFailedRun() {
              throw new Error("checkpoint write failed");
            }
          },
          logger: () => {}
        }
      ),
    /app_logs prune failed/
  );
});

test("createSupabaseMaintenanceRepository applies explicit safety filters to prune queries", async () => {
  const calls: Array<{
    table: string;
    deleteOptions: Record<string, unknown>;
    filters: Array<[string, ...unknown[]]>;
  }> = [];

  const fakeClient = {
    from(table: string) {
      return {
        delete(deleteOptions: Record<string, unknown>) {
          const call = {
            table,
            deleteOptions,
            filters: [] as Array<[string, ...unknown[]]>
          };
          calls.push(call);
          const chain = {
            in(column: string, values: unknown[]) {
              call.filters.push(["in", column, values]);
              return chain;
            },
            not(column: string, operator: string, value: unknown) {
              call.filters.push(["not", column, operator, value]);
              return chain;
            },
            lt(column: string, value: unknown) {
              call.filters.push(["lt", column, value]);
              return Promise.resolve({
                data: null,
                error: null,
                count: table === "app_logs" ? 1 : 2
              });
            }
          };
          return chain;
        }
      };
    }
  };

  const repository = createSupabaseMaintenanceRepository(fakeClient as never);
  await repository.pruneAppLogs("2026-03-15T12:00:00.000Z");
  await repository.pruneJobQueue("2026-03-24T12:00:00.000Z", JOB_QUEUE_PRUNABLE_STATUSES);
  await repository.pruneRenewalAutomationJobs(
    "2026-03-15T12:00:00.000Z",
    RENEWAL_AUTOMATION_JOB_PRUNABLE_STATUSES
  );

  assert.deepEqual(calls, [
    {
      table: "app_logs",
      deleteOptions: { count: "exact" },
      filters: [["lt", "created_at", "2026-03-15T12:00:00.000Z"]]
    },
    {
      table: "job_queue",
      deleteOptions: { count: "exact" },
      filters: [
        ["in", "status", [...JOB_QUEUE_PRUNABLE_STATUSES]],
        ["not", "finished_at", "is", null],
        ["lt", "finished_at", "2026-03-24T12:00:00.000Z"]
      ]
    },
    {
      table: "renewal_automation_jobs",
      deleteOptions: { count: "exact" },
      filters: [
        ["in", "status", [...RENEWAL_AUTOMATION_JOB_PRUNABLE_STATUSES]],
        ["not", "finished_at", "is", null],
        ["lt", "finished_at", "2026-03-15T12:00:00.000Z"]
      ]
    }
  ]);
});
