import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { AuthUserSummary, OrganizationMemberSummary } from "./admin-types.js";
import type { AppSettings, Customer } from "./domain.js";
import { buildApiErrorBody, getErrorStatus } from "./http-errors.js";
import { registerOrganizationMemberRoutes } from "./routes/organization-member-routes.js";
import type { AppStore } from "./store-contract.js";

function buildSettings(): AppSettings {
  return {
    id: 1,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    imapUser: "",
    imapPass: "",
    imapMailbox: "INBOX",
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "",
    smtpPass: "",
    smtpFromName: "",
    smtpFromEmail: "",
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
    popbillSharedPassword: "",
    operatorContactName: "operator",
    operatorContactEmail: "ops@example.com",
    operatorContactTel: "010-0000-0000",
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: true,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z"
  };
}

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    customerName: "테스트 고객",
    businessNumber: "1234567890",
    corpName: "테스트 고객",
    ceoName: "대표자",
    addr: "서울시 테스트구",
    bizType: "서비스",
    bizClass: "개발",
    popbillUserId: "TEST_001",
    popbillPassword: "secret",
    popbillState: "joined",
    popbillCertRegistered: true,
    popbillCertExpireDate: null,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z",
    ...overrides
  };
}

function createWithdrawalAdminClient() {
  const state = {
    organizations: [{ id: "org-1", status: "active", updated_at: "2026-05-13T00:00:00.000Z" }],
    members: [
      { organization_id: "org-1", user_id: "user-1" },
      { organization_id: "org-1", user_id: "user-2" }
    ],
    jobs: [
      { id: "job-1", organization_id: "org-1", status: "queued", error: null as string | null },
      { id: "job-2", organization_id: "org-1", status: "claimed", error: null as string | null },
      { id: "job-3", organization_id: "org-1", status: "completed", error: null as string | null }
    ],
    deletedUsers: [] as string[]
  };

  type QueryResult = {
    data?: unknown[] | null;
    count?: number | null;
    error: { message: string } | null;
  };

  class Builder {
    private filters = new Map<string, unknown>();
    private notEquals = new Map<string, unknown>();
    private inFilters = new Map<string, unknown[]>();
    private updatePayload: Record<string, unknown> | null = null;
    private deleteRequested = false;
    private countHead = false;

    constructor(private readonly table: string) {}

    select(_columns?: string, options?: { count?: string; head?: boolean }) {
      this.countHead = Boolean(options?.head);
      return this;
    }

    update(payload: Record<string, unknown>) {
      this.updatePayload = payload;
      return this;
    }

    delete() {
      this.deleteRequested = true;
      return this;
    }

    eq(field: string, value: unknown) {
      this.filters.set(field, value);
      return this;
    }

    neq(field: string, value: unknown) {
      this.notEquals.set(field, value);
      return this;
    }

    in(field: string, values: unknown[]) {
      this.inFilters.set(field, values);
      return this;
    }

    limit() {
      return this;
    }

    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private execute(): Promise<QueryResult> {
      if (this.table === "organization_members") {
        return Promise.resolve(this.executeOrganizationMembers());
      }

      if (this.table === "organizations") {
        return Promise.resolve(this.executeOrganizations());
      }

      if (this.table === "job_queue") {
        return Promise.resolve(this.executeJobQueue());
      }

      return Promise.resolve({ data: [], error: null });
    }

    private executeOrganizationMembers(): QueryResult {
      if (this.deleteRequested) {
        const organizationId = this.filters.get("organization_id");
        state.members = state.members.filter((member) => member.organization_id !== organizationId);
        return { data: null, error: null };
      }

      let rows = state.members;
      for (const [field, value] of this.filters.entries()) {
        rows = rows.filter((row) => row[field as keyof typeof row] === value);
      }
      for (const [field, value] of this.notEquals.entries()) {
        rows = rows.filter((row) => row[field as keyof typeof row] !== value);
      }
      return { data: rows, error: null };
    }

    private executeOrganizations(): QueryResult {
      if (this.updatePayload) {
        const id = this.filters.get("id");
        const organization = state.organizations.find((row) => row.id === id);
        if (organization) {
          Object.assign(organization, this.updatePayload);
        }
      }
      return { data: null, error: null };
    }

    private executeJobQueue(): QueryResult {
      const matches = state.jobs.filter((job) => {
        const organizationMatches =
          !this.filters.has("organization_id") || job.organization_id === this.filters.get("organization_id");
        const statusFilter = this.inFilters.get("status");
        const statusMatches = !statusFilter || statusFilter.includes(job.status);
        return organizationMatches && statusMatches;
      });

      if (this.countHead) {
        return { data: null, count: matches.length, error: null };
      }

      if (this.updatePayload) {
        for (const job of matches) {
          Object.assign(job, this.updatePayload);
        }
      }

      return { data: matches, error: null };
    }
  }

  const adminClient = {
    from: (table: string) => new Builder(table),
    auth: {
      admin: {
        deleteUser: async (userId: string) => {
          state.deletedUsers.push(userId);
          return { error: null };
        }
      }
    }
  };

  return {
    state,
    adminClient
  };
}

async function withOrganizationMemberRoutes(
  options: {
    customers: Customer[];
    quitCustomerPopbillMember: (settings: AppSettings, customer: Customer, reason: string) => Promise<unknown>;
  },
  run: (
    baseUrl: string,
    state: ReturnType<typeof createWithdrawalAdminClient>["state"],
    calls: { resets: number[]; logs: string[]; quits: number[] }
  ) => Promise<void>
) {
  const calls = {
    resets: [] as number[],
    logs: [] as string[],
    quits: [] as number[]
  };
  const admin = createWithdrawalAdminClient();
  const requestStore = {
    listCustomers: async () => options.customers,
    resetCustomerPopbill: async (customerId: number) => {
      calls.resets.push(customerId);
      return buildCustomer({ id: customerId, popbillState: "pending", popbillCertRegistered: false });
    },
    createLog: async (_level: string, _scope: string, message: string) => {
      calls.logs.push(message);
    }
  } as unknown as AppStore;

  const members: OrganizationMemberSummary[] = [
    {
      membershipId: "membership-1",
      userId: "user-1",
      loginId: "owner",
      displayName: "Owner",
      role: "owner",
      createdAt: "2026-05-13T00:00:00.000Z"
    },
    {
      membershipId: "membership-2",
      userId: "user-2",
      loginId: "member",
      displayName: "Member",
      role: "member",
      createdAt: "2026-05-13T00:00:00.000Z"
    }
  ];
  const authUsers: AuthUserSummary[] = [
    { id: "user-1", email: "owner@example.com", loginId: "owner", displayName: "Owner" },
    { id: "user-2", email: "member@example.com", loginId: "member", displayName: "Member" }
  ];

  const app = express();
  app.use(express.json());
  registerOrganizationMemberRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireOrganizationOwner: () =>
      ({
        userId: "user-1",
        email: "owner@example.com",
        isPlatformAdmin: false,
        organizations: [],
        activeOrganizationId: "org-1",
        activeOrganizationName: "테스트 고객사",
        activeOrganizationRole: "owner"
      }) as never,
    createSupabaseAdminClient: () => admin.adminClient as never,
    listOrganizationMembers: async () => members,
    getServerManagedSettings: async () => buildSettings(),
    normalizeLoginId: (value) => value.trim().toLowerCase(),
    findAuthUserByLoginId: async () => null,
    createWorkspaceLoginEmail: (loginId) => `${loginId}@example.com`,
    upsertAuthUserLoginIndex: async () => {},
    listAllAuthUsers: async () => authUsers,
    quitCustomerPopbillMember: async (settings, customer, reason) => {
      calls.quits.push(customer.id);
      return options.quitCustomerPopbillMember(settings, customer, reason);
    }
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(getErrorStatus(error, 500)).json(buildApiErrorBody(error));
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, admin.state, calls);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("organization withdrawal quits joined Popbill members before deactivating the workspace", async () => {
  await withOrganizationMemberRoutes(
    {
      customers: [
        buildCustomer({ id: 1, customerName: "가입 고객 1" }),
        buildCustomer({ id: 2, customerName: "가입 고객 2" }),
        buildCustomer({ id: 3, customerName: "대기 고객", popbillState: "pending" })
      ],
      quitCustomerPopbillMember: async () => ({ ok: true })
    },
    async (baseUrl, state, calls) => {
      const response = await fetch(`${baseUrl}/api/organization/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: "테스트 고객사",
          confirmText: "회원탈퇴"
        })
      });
      const payload = (await response.json()) as {
        popbill: { joinedTargets: number; quit: number; skipped: number };
        auth: { removedMemberships: number; deletedAuthUsers: number };
        cancelledJobs: number;
      };

      assert.equal(response.status, 200);
      assert.deepEqual(calls.quits, [1, 2]);
      assert.deepEqual(calls.resets, [1, 2]);
      assert.equal(payload.popbill.joinedTargets, 2);
      assert.equal(payload.popbill.quit, 2);
      assert.equal(payload.popbill.skipped, 1);
      assert.equal(payload.auth.removedMemberships, 2);
      assert.equal(payload.auth.deletedAuthUsers, 2);
      assert.equal(payload.cancelledJobs, 2);
      assert.equal(state.organizations[0]?.status, "churned");
      assert.equal(state.members.filter((member) => member.organization_id === "org-1").length, 0);
      assert.deepEqual(state.deletedUsers, ["user-1", "user-2"]);
      assert.equal(state.jobs.filter((job) => job.status === "cancelled").length, 2);
      assert.equal(calls.logs.at(-1), "고객사 회원탈퇴를 완료했습니다.");
    }
  );
});

test("organization withdrawal stops before workspace deactivation when a Popbill quit fails", async () => {
  await withOrganizationMemberRoutes(
    {
      customers: [
        buildCustomer({ id: 1, customerName: "성공 고객" }),
        buildCustomer({ id: 2, customerName: "실패 고객" })
      ],
      quitCustomerPopbillMember: async (_settings, customer) => {
        if (customer.id === 2) {
          throw new Error("발행 연동 해지 실패");
        }
        return { ok: true };
      }
    },
    async (baseUrl, state, calls) => {
      const response = await fetch(`${baseUrl}/api/organization/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: "테스트 고객사",
          confirmText: "회원탈퇴"
        })
      });
      const payload = (await response.json()) as {
        popbill: { failures: Array<{ customerId: number; error: string }> };
      };

      assert.equal(response.status, 409);
      assert.deepEqual(calls.quits, [1, 2]);
      assert.deepEqual(calls.resets, [1]);
      assert.equal(payload.popbill.failures.length, 1);
      assert.equal(payload.popbill.failures[0]?.customerId, 2);
      assert.equal(state.organizations[0]?.status, "active");
      assert.equal(state.members.filter((member) => member.organization_id === "org-1").length, 2);
      assert.deepEqual(state.deletedUsers, []);
      assert.equal(state.jobs.filter((job) => job.status === "cancelled").length, 0);
      assert.equal(calls.logs.at(-1), "고객사 회원탈퇴가 발행 연동 해지 실패로 중단되었습니다.");
    }
  );
});
