import assert from "node:assert/strict";
import test from "node:test";
import { dispatchRecurringJobs } from "./job-queue.js";

function createRecurringDispatchContext(joinedOrganizationIds: string[] = []) {
  return {
    settingsRows: [
      {
        organization_id: "org-1",
        scheduler_enabled: true,
        default_issue_day: 26,
        default_issue_hour: 9,
        default_issue_minute: 0,
        timezone: "Asia/Seoul",
        cert_last_checked_at: null
      }
    ],
    integrationRows: [
      {
        organization_id: "org-1",
        imap_host: "",
        imap_user: "",
        imap_pass_encrypted: ""
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
      },
      enqueueDueAutoIssueJobs: async () => []
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
      },
      enqueueDueAutoIssueJobs: async () => []
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
