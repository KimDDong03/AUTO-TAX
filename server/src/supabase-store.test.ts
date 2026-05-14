import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings, Customer, CustomerCertificate } from "./domain.js";
import { SupabaseStore } from "./supabase-store.js";
import { normalizeAddress, toRoadAddress } from "./utils.js";

function buildManagedCustomerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "customer-uuid-7",
    legacy_id: 7,
    customer_name: "테스트 고객",
    business_number: "1234567890",
    corp_name: "테스트 고객",
    ceo_name: "대표자",
    addr: "서울시 강남구 테헤란로 1",
    biz_type: "서비스",
    biz_class: "개발",
    popbill_user_id: "POPBILL_7",
    popbill_password_encrypted: "",
    popbill_state: "pending",
    popbill_cert_registered: false,
    popbill_cert_expire_date: null,
    issue_day: null,
    issue_hour: null,
    issue_minute: null,
    renewal_contact_mobile: "",
    issue_complete_sms_template: "",
    memo: "",
    created_at: "2026-04-16T00:00:00.000Z",
    updated_at: "2026-04-16T00:00:00.000Z",
    ...overrides
  };
}

function buildStoreCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 7,
    customerName: "테스트 고객",
    businessNumber: "1234567890",
    corpName: "테스트 고객",
    ceoName: "대표자",
    addr: "서울시 강남구 테헤란로 1",
    bizType: "서비스",
    bizClass: "개발",
    popbillUserId: "POPBILL_7",
    popbillPassword: "",
    popbillState: "pending",
    popbillCertRegistered: false,
    popbillCertExpireDate: null,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "",
    issueCompleteSmsTemplate: "",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    ...overrides
  };
}

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

test("getIssuedMonthlyTrend counts issued drafts for each target billing month", async () => {
  const calls: Array<{
    table: string;
    selectColumns: string;
    selectOptions: Record<string, unknown>;
    filters: Array<[string, unknown]>;
  }> = [];
  const countsByBillingMonth = new Map([
    ["2025-05", 1],
    ["2026-04", 2],
    ["2026-05", 3]
  ]);
  const fakeClient = {
    from(table: string) {
      const call = {
        table,
        selectColumns: "",
        selectOptions: {} as Record<string, unknown>,
        filters: [] as Array<[string, unknown]>
      };
      calls.push(call);
      const query = {
        select(columns: string, options: Record<string, unknown>) {
          call.selectColumns = columns;
          call.selectOptions = options;
          return query;
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value]);
          return query;
        },
        then<TResult1 = { count: number; error: null }, TResult2 = never>(
          onfulfilled?: ((value: { count: number; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          const billingMonth = call.filters.find(([column]) => column === "billing_month")?.[1];
          const result = {
            count: typeof billingMonth === "string" ? countsByBillingMonth.get(billingMonth) ?? 0 : 0,
            error: null
          };
          return Promise.resolve(result).then(onfulfilled, onrejected);
        }
      };
      return query;
    }
  };
  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;
  Object.assign(store as object, {
    client: fakeClient,
    initialized: true,
    organizationId: "org-1"
  });

  const trend = await store.getIssuedMonthlyTrend("2026-05");

  assert.equal(trend.anchorBillingMonth, "2026-05");
  assert.equal(trend.months.length, 13);
  assert.equal(trend.months[0]?.billingMonth, "2025-05");
  assert.equal(trend.months[12]?.billingMonth, "2026-05");
  assert.deepEqual(trend.months.filter((month) => month.issuedDraftCount > 0), [
    { billingMonth: "2025-05", issuedDraftCount: 1 },
    { billingMonth: "2026-04", issuedDraftCount: 2 },
    { billingMonth: "2026-05", issuedDraftCount: 3 }
  ]);
  assert.deepEqual(trend.comparison, {
    anchor: { billingMonth: "2026-05", issuedDraftCount: 3 },
    previous: { billingMonth: "2026-04", issuedDraftCount: 2 },
    sameMonthLastYear: { billingMonth: "2025-05", issuedDraftCount: 1 }
  });
  assert.equal(calls.length, 13);
  assert.equal(calls.every((call) => call.table === "invoice_drafts"), true);
  assert.equal(calls.every((call) => call.selectColumns === "*"), true);
  assert.equal(calls.every((call) => call.selectOptions.count === "exact" && call.selectOptions.head === true), true);
  assert.equal(calls.every((call) => call.filters.some(([column, value]) => column === "organization_id" && value === "org-1")), true);
  assert.equal(calls.every((call) => call.filters.some(([column, value]) => column === "status" && value === "issued")), true);
  assert.equal(calls.some((call) => call.filters.some(([column]) => column === "source_message_id")), false);
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

test("addCustomerMatchAddress inserts a normalized match address for the customer", async () => {
  const matchAddress = "경기도 성남시 (분당구) 대왕판교로 1";
  const inserts: Array<Record<string, unknown>> = [];
  const currentRow = buildManagedCustomerRow();

  const fakeClient = {
    from(table: string) {
      if (table === "managed_customer_match_addresses") {
        return {
          insert(payload: Record<string, unknown>) {
            inserts.push(payload);
            return Promise.resolve({ data: null, error: null });
          },
          select() {
            return {
              in() {
                return {
                  order() {
                    return Promise.resolve({
                      data: inserts.map((payload) => ({
                        managed_customer_id: payload.managed_customer_id,
                        match_address: payload.match_address
                      })),
                      error: null
                    });
                  }
                };
              }
            };
          }
        };
      }

      assert.equal(table, "managed_customer_plants");
      return {
        select() {
          return {
            in() {
              return {
                order() {
                  return Promise.resolve({ data: [], error: null });
                }
              };
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
    customerCache: new Map(),
    managedCustomerRowCache: new Map(),
    getManagedCustomerRowByLegacyId: async () => currentRow,
    findCustomerByMatchAddress: async () => null
  });

  const customer = await store.addCustomerMatchAddress(7, matchAddress);

  assert.deepEqual(inserts, [
    {
      managed_customer_id: "customer-uuid-7",
      match_address: toRoadAddress(matchAddress),
      normalized_match_address: normalizeAddress(matchAddress)
    }
  ]);
  assert.deepEqual(customer.matchAddresses, [toRoadAddress(matchAddress)]);
});

test("addCustomerMatchAddress is a no-op when the address already belongs to the same customer", async () => {
  const existingCustomer = buildStoreCustomer({
    matchAddresses: ["경기도 성남시 대왕판교로 1"]
  });

  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;
  Object.assign(store as object, {
    getManagedCustomerRowByLegacyId: async () => buildManagedCustomerRow(),
    findCustomerByMatchAddress: async () => existingCustomer,
    client: {
      from() {
        throw new Error("duplicate same-customer address should not insert");
      }
    }
  });

  const customer = await store.addCustomerMatchAddress(7, "경기도 성남시 대왕판교로 1");

  assert.equal(customer, existingCustomer);
});

test("addCustomerMatchAddress rejects an address already mapped to another customer", async () => {
  const existingCustomer = buildStoreCustomer({
    id: 8,
    customerName: "기존 고객",
    matchAddresses: ["경기도 성남시 대왕판교로 1"]
  });

  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;
  Object.assign(store as object, {
    getManagedCustomerRowByLegacyId: async () => buildManagedCustomerRow(),
    findCustomerByMatchAddress: async () => existingCustomer,
    client: {
      from() {
        throw new Error("conflicting address should not insert");
      }
    }
  });

  await assert.rejects(
    () => store.addCustomerMatchAddress(7, "경기도 성남시 대왕판교로 1"),
    /이미 다른 고객에 등록된 매칭 주소입니다\. 기존 고객: 기존 고객/
  );
});
