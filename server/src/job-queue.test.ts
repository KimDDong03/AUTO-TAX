import assert from "node:assert/strict";
import test from "node:test";
import { dispatchRecurringJobs } from "./job-queue.js";

function createRecurringDispatchContext(
  joinedOrganizationIds: string[] = [],
  options: {
    mailConfigured?: boolean;
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
    integrationRows: [
      {
        organization_id: "org-1",
        imap_host: options.mailConfigured ? "imap.example.com" : "",
        imap_user: options.mailConfigured ? "billing@example.com" : "",
        imap_pass_encrypted: options.mailConfigured ? "encrypted" : ""
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

test("dispatchRecurringJobs skips mail-sync before the monthly 20th schedule", async () => {
  const queuedJobTypes: string[] = [];

  const result = await dispatchRecurringJobs(
    {
      now: new Date("2026-04-19T00:00:00.000Z")
    },
    {
      loadRecurringDispatchContext: async () => createRecurringDispatchContext([], { mailConfigured: true }),
      hasOpenJob: async () => false,
      getLatestJobReferenceAt: async () => null,
      enqueueJob: async (args) => {
        queuedJobTypes.push(args.jobType);
        return {} as never;
      }
    }
  );

  assert.deepEqual(queuedJobTypes, []);
  assert.ok(
    result.details.some(
      (detail) =>
        detail.jobType === "mail-sync" &&
        detail.organizationId === "org-1" &&
        detail.action === "skipped" &&
        detail.reason === "monthly-schedule-not-reached"
    )
  );
});

test("dispatchRecurringJobs queues mail-sync on the monthly 20th schedule", async () => {
  const queuedJobTypes: string[] = [];

  const result = await dispatchRecurringJobs(
    {
      now: new Date("2026-04-20T00:00:00.000Z")
    },
    {
      loadRecurringDispatchContext: async () => createRecurringDispatchContext([], { mailConfigured: true }),
      hasOpenJob: async () => false,
      getLatestJobReferenceAt: async () => null,
      enqueueJob: async (args) => {
        queuedJobTypes.push(args.jobType);
        return {} as never;
      }
    }
  );

  assert.deepEqual(queuedJobTypes, ["mail-sync"]);
  assert.ok(
    result.details.some(
      (detail) =>
        detail.jobType === "mail-sync" &&
        detail.organizationId === "org-1" &&
        detail.action === "queued" &&
        detail.reason === "due"
    )
  );
});

test("dispatchRecurringJobs does not queue a second mail-sync after this month already ran", async () => {
  const queuedJobTypes: string[] = [];

  const result = await dispatchRecurringJobs(
    {
      now: new Date("2026-04-21T00:00:00.000Z")
    },
    {
      loadRecurringDispatchContext: async () => createRecurringDispatchContext([], { mailConfigured: true }),
      hasOpenJob: async () => false,
      getLatestJobReferenceAt: async () => "2026-04-20T00:00:00.000Z",
      enqueueJob: async (args) => {
        queuedJobTypes.push(args.jobType);
        return {} as never;
      }
    }
  );

  assert.deepEqual(queuedJobTypes, []);
  assert.ok(
    result.details.some(
      (detail) =>
        detail.jobType === "mail-sync" &&
        detail.organizationId === "org-1" &&
        detail.action === "skipped" &&
        detail.reason === "already-ran-this-month"
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
