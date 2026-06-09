import assert from "node:assert/strict";
import test from "node:test";
import { dispatchRecurringJobs, JobClaimLostError, runDueJobs } from "./job-queue.js";

function createRecurringDispatchContext(
  joinedOrganizationIds: string[] = [],
  options: {
    settings?: Partial<Record<string, unknown>>;
  } = {}
) {
  return {
    settingsRows: [
      {
        organization_id: "org-1",
        scheduler_enabled: true,
        default_issue_day: 20,
        default_issue_hour: 9,
        default_issue_minute: 0,
        timezone: "Asia/Seoul",
        cert_last_checked_at: null,
        ...options.settings
      }
    ],
    joinedCustomerOrganizationIds: new Set(joinedOrganizationIds)
  };
}

test("dispatchRecurringJobs skips certificate-check when the organization has no joined customers", async () => {
  const hasOpenJobCalls: string[] = [];
  const queuedJobTypes: string[] = [];

  const result = await dispatchRecurringJobs(
    {
      now: new Date("2026-04-14T00:00:00.000Z")
    },
    {
      loadRecurringDispatchContext: async () => createRecurringDispatchContext(),
      hasOpenJob: async (_organizationId, jobType) => {
        hasOpenJobCalls.push(jobType);
        return false;
      },
      enqueueJob: async (args) => {
        queuedJobTypes.push(args.jobType);
        return {} as never;
      }
    }
  );

  assert.deepEqual(hasOpenJobCalls, []);
  assert.deepEqual(queuedJobTypes, []);
  assert.ok(
    result.details.some(
      (detail) =>
        detail.jobType === "certificate-check" &&
        detail.organizationId === "org-1" &&
        detail.action === "skipped" &&
        detail.reason === "no-joined-customers"
    )
  );
});

test("dispatchRecurringJobs queues certificate-check for eligible organizations with joined customers", async () => {
  const hasOpenJobCalls: string[] = [];
  const queuedJobTypes: string[] = [];

  const result = await dispatchRecurringJobs(
    {
      now: new Date("2026-04-14T00:00:00.000Z")
    },
    {
      loadRecurringDispatchContext: async () => createRecurringDispatchContext(["org-1"]),
      hasOpenJob: async (_organizationId, jobType) => {
        hasOpenJobCalls.push(jobType);
        return false;
      },
      enqueueJob: async (args) => {
        queuedJobTypes.push(args.jobType);
        return {} as never;
      }
    }
  );

  assert.deepEqual(hasOpenJobCalls, ["certificate-check"]);
  assert.deepEqual(queuedJobTypes, ["certificate-check"]);
  assert.ok(
    result.details.some(
      (detail) =>
        detail.jobType === "certificate-check" &&
        detail.organizationId === "org-1" &&
        detail.action === "queued" &&
        detail.reason === "due"
    )
  );
});

test("runDueJobs does not retry or fail when late completion loses the runner fence", async () => {
  const followupWrites: string[] = [];
  const result = await runDueJobs(
    {
      now: new Date("2026-04-14T00:00:00.000Z"),
      limit: 1,
      claimedBy: "runner-a"
    },
    {
      requeueStaleClaimedJobs: async () => 0,
      listDueQueuedJobs: async () => [
        {
          id: "job-1",
          organization_id: "org-1",
          managed_customer_id: null,
          job_type: "certificate-check",
          status: "queued",
          run_after: "2026-04-14T00:00:00.000Z",
          payload: {},
          result: null,
          error: null,
          claimed_at: null,
          finished_at: null,
          created_at: "2026-04-14T00:00:00.000Z",
          updated_at: "2026-04-14T00:00:00.000Z"
        }
      ],
      claimQueuedJob: async () =>
        ({
          id: "job-1",
          organizationId: "org-1",
          managedCustomerId: null,
          jobType: "certificate-check",
          status: "claimed",
          runAfter: "2026-04-14T00:00:00.000Z",
          payload: {},
          result: { claimedBy: "runner-a" },
          error: null,
          claimedAt: "2026-04-14T00:00:00.000Z",
          claimedBy: "runner-a",
          finishedAt: null,
          createdAt: "2026-04-14T00:00:00.000Z",
          updatedAt: "2026-04-14T00:00:00.000Z"
        }) as never,
      executeJob: async () => ({ ok: true }),
      completeJob: async () => {
        throw new JobClaimLostError("job-1");
      },
      scheduleRetry: async () => {
        followupWrites.push("retry");
        return { scheduled: false, retryCount: 0 };
      },
      failJob: async () => {
        followupWrites.push("fail");
      }
    } as never
  );

  assert.deepEqual(followupWrites, []);
  assert.equal(result.completed, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.details[0]?.status, "skipped");
});

test("runDueJobs does not fail a job when late failure loses the runner fence", async () => {
  const followupWrites: string[] = [];
  const result = await runDueJobs(
    {
      now: new Date("2026-04-14T00:00:00.000Z"),
      limit: 1,
      claimedBy: "runner-a"
    },
    {
      requeueStaleClaimedJobs: async () => 0,
      listDueQueuedJobs: async () => [
        {
          id: "job-1",
          organization_id: "org-1",
          managed_customer_id: null,
          job_type: "certificate-check",
          status: "queued",
          run_after: "2026-04-14T00:00:00.000Z",
          payload: {},
          result: null,
          error: null,
          claimed_at: null,
          finished_at: null,
          created_at: "2026-04-14T00:00:00.000Z",
          updated_at: "2026-04-14T00:00:00.000Z"
        }
      ],
      claimQueuedJob: async () =>
        ({
          id: "job-1",
          organizationId: "org-1",
          managedCustomerId: null,
          jobType: "certificate-check",
          status: "claimed",
          runAfter: "2026-04-14T00:00:00.000Z",
          payload: { retryCount: 1 },
          result: { claimedBy: "runner-a" },
          error: null,
          claimedAt: "2026-04-14T00:00:00.000Z",
          claimedBy: "runner-a",
          finishedAt: null,
          createdAt: "2026-04-14T00:00:00.000Z",
          updatedAt: "2026-04-14T00:00:00.000Z"
        }) as never,
      executeJob: async () => {
        throw new Error("external timeout");
      },
      completeJob: async () => {
        followupWrites.push("complete");
      },
      scheduleRetry: async () => {
        throw new JobClaimLostError("job-1");
      },
      failJob: async () => {
        followupWrites.push("fail");
      }
    } as never
  );

  assert.deepEqual(followupWrites, []);
  assert.equal(result.completed, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.details[0]?.status, "skipped");
});
