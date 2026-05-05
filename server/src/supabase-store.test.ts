import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings, Customer, CustomerCertificate } from "./domain.js";
import { SupabaseStore } from "./supabase-store.js";

test("getBootstrapWorkspace skips drafts, inbox, and logs reads while keeping bootstrap shape", async () => {
  const settings = { companyName: "AUTO-TAX" } as unknown as AppSettings;
  const customers = [{ id: 1, customerName: "테스트 고객" }] as unknown as Customer[];
  const customerCertificates = [{ id: 10, customerId: 1 }] as unknown as CustomerCertificate[];
  const calls: string[] = [];

  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;
  Object.assign(store as object, {
    getSettings: async () => {
      calls.push("getSettings");
      return settings;
    },
    listCustomers: async () => {
      calls.push("listCustomers");
      return customers;
    },
    listCustomerCertificates: async () => {
      calls.push("listCustomerCertificates");
      return customerCertificates;
    },
    listDrafts: async () => {
      throw new Error("getBootstrapWorkspace should not call listDrafts");
    },
    listInbox: async () => {
      throw new Error("getBootstrapWorkspace should not call listInbox");
    },
    listLogs: async () => {
      throw new Error("getBootstrapWorkspace should not call listLogs");
    }
  });

  const result = await store.getBootstrapWorkspace();

  assert.deepEqual(calls, ["getSettings", "listCustomers", "listCustomerCertificates"]);
  assert.deepEqual(result, {
    settings,
    customers,
    customerCertificates,
    drafts: [],
    inbox: [],
    counts: {
      actionableDrafts: 0,
      customers: 1,
      reviewDrafts: 0,
      scheduledDrafts: 0,
      failedDrafts: 0,
      unmatchedMessages: 0
    }
  });
});

test("getPilotIssuanceReport enriches Phase 5 customer summaries with current customer catalog", async () => {
  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;
  Object.assign(store as object, {
    listAppLogRows: async () => [
      {
        organization_id: "org-1",
        actor_user_id: "user-1",
        created_at: "2026-04-16T00:00:00.000Z",
        level: "info",
        scope: "drafts",
        message: "수동 발행을 완료했습니다.",
        context_json: {
          eventType: "manual-issue-succeeded",
          draftId: 91,
          customerId: 7,
          issueMode: "review"
        }
      }
    ],
    listCustomers: async () =>
      [
        {
          id: 7,
          customerName: "Phase 5 고객",
          issueMode: "review"
        }
      ] as Customer[],
    requireOrganizationId: () => "org-1"
  });

  const report = await store.getPilotIssuanceReport();

  assert.equal(report.customerSummaries[0]?.customerName, "Phase 5 고객");
  assert.equal(report.customerSummaries[0]?.autoTransitionEvidenceStatus, "eligible");
});

test("updateCertificateCheckMetadata updates only organization_settings cert metadata columns", async () => {
  const calls: Array<{
    table: string;
    payload: Record<string, unknown>;
    filters: Array<[string, unknown]>;
  }> = [];

  const fakeClient = {
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          const call = {
            table,
            payload,
            filters: [] as Array<[string, unknown]>
          };
          calls.push(call);
          return {
            eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return Promise.resolve({ data: null, error: null });
            }
          };
        }
      };
    }
  };

  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;
  Object.assign(store as object, {
    client: fakeClient,
    initialized: true,
    organizationId: "org-1"
  });

  await store.updateCertificateCheckMetadata({
    certLastCheckedAt: "2026-04-14T00:00:00.000Z",
    certAlertLastSentAt: "2026-04-14T01:00:00.000Z"
  });

  assert.deepEqual(calls, [
    {
      table: "organization_settings",
      payload: {
        cert_last_checked_at: "2026-04-14T00:00:00.000Z",
        cert_alert_last_sent_at: "2026-04-14T01:00:00.000Z"
      },
      filters: [["organization_id", "org-1"]]
    }
  ]);
  assert.equal(calls.some((call) => call.table === "organization_integrations"), false);
});

test("createLog masks password-like fields before persisting app_logs context", async () => {
  const inserts: Array<Record<string, unknown>> = [];
  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;

  Object.assign(store as object, {
    client: {
      from(table: string) {
        assert.equal(table, "app_logs");
        return {
          insert(payload: Record<string, unknown>) {
            inserts.push(payload);
            return Promise.resolve({ data: null, error: null });
          }
        };
      }
    },
    initialized: true,
    organizationId: "org-1",
    actorUserId: "user-1"
  });

  await store.createLog("error", "renewal-agent", "certificatePassword=tax-pass", {
    certificatePassword: "tax-pass",
    submissionProfile: {
      issuePassword: "123456"
    },
    certDirPath: "C:/Users/User/NPKI/hanbit"
  });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0]?.message, "certificatePassword=[REDACTED]");
  assert.deepEqual(inserts[0]?.context_json, {
    certificatePassword: "[REDACTED]",
    submissionProfile: {
      issuePassword: "[REDACTED]"
    },
    certDirPath: "[REDACTED]"
  });
});

test("updateSettings clears renewal certificate password instead of persisting it", async () => {
  process.env.AUTO_TAX_ENCRYPTION_KEY = "test-supabase-store-key";
  const upserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const currentSettings: AppSettings = {
    id: 1,
    imapHost: "imap.example.com",
    imapPort: 993,
    imapSecure: true,
    imapUser: "mail@example.com",
    imapPass: "mail-pass",
    imapMailbox: "INBOX",
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "mail@example.com",
    smtpPass: "smtp-pass",
    smtpFromName: "AUTO-TAX",
    smtpFromEmail: "mail@example.com",
    mailConnectionVerifiedAt: null,
    notificationEmails: [],
    defaultIssueDay: 1,
    defaultIssueHour: 9,
    defaultIssueMinute: 0,
    mailPollMinutes: 5,
    mailSyncStartAt: null,
    timezone: "Asia/Seoul",
    popbillLinkId: "LINK",
    popbillSecretKey: "SECRET",
    popbillIsTest: true,
    popbillPartnerCorpNum: "",
    popbillUserIdPrefix: "TEST_",
    popbillSharedPassword: "popbill-pass",
    operatorContactName: "담당자",
    operatorContactEmail: "ops@example.com",
    operatorContactTel: "010-0000-0000",
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: true,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z"
  };

  const fakeClient = {
    from(table: string) {
      if (table === "organization_integrations") {
        return {
          select() {
            return {
              neq() {
                return Promise.resolve({ data: [], error: null });
              }
            };
          },
          upsert(payload: Record<string, unknown>) {
            upserts.push({ table, payload });
            return Promise.resolve({ data: null, error: null });
          }
        };
      }

      assert.equal(table, "organization_settings");
      return {
        upsert(payload: Record<string, unknown>) {
          upserts.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  };

  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;
  Object.assign(store as object, {
    client: fakeClient,
    initialized: true,
    organizationId: "org-1",
    getSettings: async () => currentSettings
  });

  await store.updateSettings({
    renewalCertificatePassword: "shared-cert-pass",
    renewalIssuePassword: "123456"
  });

  const integrationUpsert = upserts.find((entry) => entry.table === "organization_integrations");
  assert.equal(integrationUpsert?.payload.renewal_certificate_password_encrypted, "");
  assert.notEqual(integrationUpsert?.payload.renewal_issue_password_encrypted, "");
});
