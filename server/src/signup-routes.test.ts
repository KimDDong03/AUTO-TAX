import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { z } from "zod";
import type { OpsWorkspaceSummary } from "./admin-types.js";
import type { AppSettings } from "./domain.js";
import { HttpError } from "./http-errors.js";
import { registerCoreRoutes } from "./routes/core-routes.js";
import { registerOpsRoutes } from "./routes/ops-routes.js";

type SignupRow = {
  id: string;
  user_id: string;
  login_id: string;
  auth_email: string;
  organization_name: string;
  representative_name: string;
  business_registration_number: string;
  business_address: string;
  business_type: string;
  business_item: string;
  name: string;
  phone: string;
  kepco_email: string;
  invoice_email: string;
  status: "pending" | "approved" | "rejected";
  marketing_consent: boolean;
  terms_version: string;
  privacy_version: string;
  third_party_version: string;
  marketing_version: string | null;
  terms_accepted_at: string;
  privacy_accepted_at: string;
  third_party_accepted_at: string;
  marketing_accepted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
  created_at: string;
  updated_at: string;
};

type PhoneVerificationRow = {
  id: string;
  phone: string;
  code_hash: string;
  code_salt: string;
  expires_at: string;
  verified_at: string | null;
  consumed_at: string | null;
  attempt_count: number;
  provider: string;
  provider_message_id: string | null;
  request_ip: string;
  request_user_agent: string;
  created_at: string;
  updated_at: string;
};

type AuthUser = {
  id: string;
  email: string;
  password: string;
  loginId: string;
  displayName: string | null;
};

function createSignupAdminClient() {
  const state = {
    signupRows: [] as SignupRow[],
    phoneVerificationRows: [] as PhoneVerificationRow[],
    authUsers: [] as AuthUser[],
    loginIndexRows: [] as Array<{ user_id: string; login_id: string; auth_email: string; display_name: string | null }>,
    organizations: [] as Array<{ id: string; name: string; status: string; plan_code: string; monthly_issue_limit: number }>,
    members: [] as Array<{ organization_id: string; user_id: string; role: string; display_name: string | null; invited_by: string | null }>,
    settingsByOrganization: new Map<string, AppSettings>()
  };

  class Builder {
    private insertPayload: Record<string, unknown> | null = null;
    private updatePayload: Record<string, unknown> | null = null;
    private filters: Record<string, string> = {};

    constructor(private readonly table: string) {}

    insert(payload: Record<string, unknown>) {
      this.insertPayload = payload;
      return this;
    }

    update(payload: Record<string, unknown>) {
      this.updatePayload = payload;
      return this;
    }

    async upsert(payload: Record<string, unknown>) {
      if (this.table === "auth_user_login_index") {
        const row = {
          user_id: String(payload.user_id),
          login_id: String(payload.login_id),
          auth_email: String(payload.auth_email),
          display_name: payload.display_name ? String(payload.display_name) : null
        };
        const existingIndex = state.loginIndexRows.findIndex((item) => item.user_id === row.user_id);
        if (existingIndex >= 0) {
          state.loginIndexRows[existingIndex] = row;
        } else {
          state.loginIndexRows.push(row);
        }
        return { error: null };
      }

      if (this.table === "organization_members") {
        const row = {
          organization_id: String(payload.organization_id),
          user_id: String(payload.user_id),
          role: String(payload.role),
          display_name: payload.display_name ? String(payload.display_name) : null,
          invited_by: payload.invited_by ? String(payload.invited_by) : null
        };
        const existingIndex = state.members.findIndex(
          (item) => item.organization_id === row.organization_id && item.user_id === row.user_id
        );
        if (existingIndex >= 0) {
          state.members[existingIndex] = row;
        } else {
          state.members.push(row);
        }
        return { error: null };
      }

      return { error: null };
    }

    select() {
      return this;
    }

    order() {
      return this;
    }

    limit(count: number) {
      if (this.table === "public_signup_requests") {
        const rows = state.signupRows.filter((item) =>
          Object.entries(this.filters).every(([field, value]) => String(item[field as keyof SignupRow]) === value)
        );
        return Promise.resolve({ data: rows.slice(0, count), error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }

    eq(field: string, value: string) {
      this.filters[field] = value;
      if (this.table === "organizations" && this.updatePayload) {
        const row = state.organizations.find((item) => field === "id" && item.id === value);
        if (row) {
          Object.assign(row, this.updatePayload);
        }
      }
      if (this.table === "public_signup_phone_verifications" && this.updatePayload) {
        const row = state.phoneVerificationRows.find((item) => field === "id" && item.id === value);
        if (row) {
          Object.assign(row, this.updatePayload, {
            updated_at: "2026-05-07T01:00:00.000Z"
          });
        }
      }
      return this;
    }

    delete() {
      return this;
    }

    async single() {
      if (!this.insertPayload) {
        return { data: null, error: { message: "unsupported single" } };
      }

      const timestamp = "2026-05-07T00:00:00.000Z";
      if (this.table === "public_signup_phone_verifications") {
        const row: PhoneVerificationRow = {
          id: `30000000-0000-4000-8000-${String(state.phoneVerificationRows.length + 1).padStart(12, "0")}`,
          phone: String(this.insertPayload.phone),
          code_hash: String(this.insertPayload.code_hash),
          code_salt: String(this.insertPayload.code_salt),
          expires_at: String(this.insertPayload.expires_at),
          verified_at: null,
          consumed_at: null,
          attempt_count: 0,
          provider: String(this.insertPayload.provider),
          provider_message_id: this.insertPayload.provider_message_id ? String(this.insertPayload.provider_message_id) : null,
          request_ip: String(this.insertPayload.request_ip),
          request_user_agent: String(this.insertPayload.request_user_agent),
          created_at: timestamp,
          updated_at: timestamp
        };
        state.phoneVerificationRows.push(row);
        return { data: row, error: null };
      }

      if (this.table !== "public_signup_requests") {
        return { data: null, error: { message: "unsupported single" } };
      }

      const row: SignupRow = {
        id: `00000000-0000-4000-8000-${String(state.signupRows.length + 1).padStart(12, "0")}`,
        user_id: String(this.insertPayload.user_id),
        login_id: String(this.insertPayload.login_id),
        auth_email: String(this.insertPayload.auth_email),
        organization_name: String(this.insertPayload.organization_name),
        representative_name: String(this.insertPayload.representative_name),
        business_registration_number: String(this.insertPayload.business_registration_number),
        business_address: String(this.insertPayload.business_address),
        business_type: String(this.insertPayload.business_type),
        business_item: String(this.insertPayload.business_item),
        name: String(this.insertPayload.name),
        phone: String(this.insertPayload.phone),
        kepco_email: String(this.insertPayload.kepco_email),
        invoice_email: String(this.insertPayload.invoice_email),
        status: "pending",
        marketing_consent: this.insertPayload.marketing_consent === true,
        terms_version: String(this.insertPayload.terms_version),
        privacy_version: String(this.insertPayload.privacy_version),
        third_party_version: String(this.insertPayload.third_party_version),
        marketing_version: this.insertPayload.marketing_version ? String(this.insertPayload.marketing_version) : null,
        terms_accepted_at: String(this.insertPayload.terms_accepted_at),
        privacy_accepted_at: String(this.insertPayload.privacy_accepted_at),
        third_party_accepted_at: String(this.insertPayload.third_party_accepted_at),
        marketing_accepted_at: this.insertPayload.marketing_accepted_at ? String(this.insertPayload.marketing_accepted_at) : null,
        reviewed_by: null,
        reviewed_at: null,
        review_note: "",
        created_at: timestamp,
        updated_at: timestamp
      };
      state.signupRows.push(row);
      return { data: row, error: null };
    }

    async maybeSingle() {
      if (this.table === "public_signup_requests") {
        let row =
          state.signupRows.find((item) => this.filters.id && item.id === this.filters.id) ??
          state.signupRows.find((item) => this.filters.login_id && item.login_id === this.filters.login_id) ??
          state.signupRows.find(
            (item) =>
              this.filters.name &&
              item.name === this.filters.name &&
              (!this.filters.phone || item.phone === this.filters.phone)
          ) ??
          state.signupRows.find((item) => this.filters.user_id && item.user_id === this.filters.user_id) ??
          null;

        if (row && this.updatePayload) {
          row = Object.assign(row, this.updatePayload, {
            updated_at: "2026-05-07T01:00:00.000Z"
          });
        }
        return { data: row, error: null };
      }

      if (this.table === "public_signup_phone_verifications") {
        return {
          data: state.phoneVerificationRows.find((item) => this.filters.id && item.id === this.filters.id) ?? null,
          error: null
        };
      }

      if (this.table === "organizations" && this.insertPayload) {
        const row = {
          id: String(this.insertPayload.id),
          name: String(this.insertPayload.name),
          status: String(this.insertPayload.status),
          plan_code: String(this.insertPayload.plan_code),
          monthly_issue_limit: Number(this.insertPayload.monthly_issue_limit)
        };
        state.organizations.push(row);
        return { data: { id: row.id }, error: null };
      }

      return { data: null, error: null };
    }
  }

  const client = {
    auth: {
      admin: {
        createUser: async (input: { email: string; password: string; user_metadata?: Record<string, unknown> }) => {
          if (state.authUsers.some((user) => user.email === input.email)) {
            return { data: { user: null }, error: { message: "User already registered" } };
          }

          const user: AuthUser = {
            id: `10000000-0000-4000-8000-${String(state.authUsers.length + 1).padStart(12, "0")}`,
            email: input.email,
            password: input.password,
            loginId: String(input.user_metadata?.login_id ?? ""),
            displayName: input.user_metadata?.display_name ? String(input.user_metadata.display_name) : null
          };
          state.authUsers.push(user);
          return { data: { user }, error: null };
        },
        deleteUser: async (userId: string) => {
          state.authUsers = state.authUsers.filter((user) => user.id !== userId);
          return { data: {}, error: null };
        }
      }
    },
    from(table: string) {
      if (
        ![
          "public_signup_requests",
          "public_signup_phone_verifications",
          "auth_user_login_index",
          "organizations",
          "organization_members",
          "app_logs"
        ].includes(table)
      ) {
        throw new Error(`unexpected table ${table}`);
      }
      return new Builder(table);
    }
  };

  return { state, client };
}

function createPublicClient(state: ReturnType<typeof createSignupAdminClient>["state"]) {
  return {
    auth: {
      signInWithPassword: async (input: { email: string; password: string }) => {
        const user = state.authUsers.find((item) => item.email === input.email && item.password === input.password);
        if (!user) {
          return { data: { session: null, user: null }, error: { message: "invalid credentials" } };
        }
        return {
          data: {
            user,
            session: {
              access_token: `token:${user.id}`,
              refresh_token: "refresh-token"
            }
          },
          error: null
        };
      }
    }
  };
}

function createTestSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  const timestamp = "2026-05-07T00:00:00.000Z";
  return {
    id: 1,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    imapUser: "",
    imapPass: "",
    imapMailbox: "INBOX",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "",
    smtpPass: "",
    smtpFromName: "AUTO-TAX",
    smtpFromEmail: "",
    mailConnectionVerifiedAt: null,
    notificationEmails: [],
    defaultIssueDay: 1,
    defaultIssueHour: 9,
    defaultIssueMinute: 0,
    mailPollMinutes: 1440,
    mailSyncStartAt: null,
    timezone: "Asia/Seoul",
    popbillLinkId: "",
    popbillSecretKey: "",
    popbillIsTest: true,
    popbillPartnerCorpNum: "",
    popbillUserIdPrefix: "",
    popbillSharedPassword: "",
    operatorContactName: "",
    operatorContactEmail: "",
    operatorContactTel: "",
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: false,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function getWorkspaceSummary(
  state: ReturnType<typeof createSignupAdminClient>["state"],
  organizationId: string
): OpsWorkspaceSummary | null {
  const organization = state.organizations.find((item) => item.id === organizationId);
  if (!organization) {
    return null;
  }

  const owner = state.members.find((member) => member.organization_id === organizationId && member.role === "owner") ?? null;
  const ownerIndex = owner ? state.loginIndexRows.find((index) => index.user_id === owner.user_id) ?? null : null;
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationPlanCode: organization.plan_code,
    organizationStatus: organization.status as OpsWorkspaceSummary["organizationStatus"],
    monthlyIssueLimit: organization.monthly_issue_limit,
    managedCustomerCount: 0,
    ownerLoginId: ownerIndex?.login_id ?? null,
    ownerDisplayName: owner?.display_name ?? null,
    memberCount: state.members.filter((member) => member.organization_id === organizationId).length,
    issuedDraftCount: 0,
    currentMonthIssuedDraftCount: 0,
    lastIssuedAt: null,
    createdAt: "2026-05-07T00:00:00.000Z"
  };
}

function registerSignupTestRoutes(app: express.Express, fixture: ReturnType<typeof createSignupAdminClient>) {
  registerCoreRoutes({
    app,
    store: null,
    getRequestStore: () => {
      throw new Error("request store should not be used");
    },
    requireAuthContext: () => ({ isPlatformAdmin: false }) as never,
    requireInternalJobAccess: () => "secret",
    publicLoginLimiter: (_req, _res, next) => next(),
    publicSignupLimiter: (_req, _res, next) => next(),
    publicConsultationLimiter: (_req, _res, next) => next(),
    createSupabaseAdminClient: () => fixture.client as never,
    createSupabasePublicClient: () => createPublicClient(fixture.state) as never,
    resolveAuthenticatedAppSession: async (token) => {
      const userId = token.replace(/^token:/, "");
      const membership = fixture.state.members.find((member) => member.user_id === userId);
      if (!membership) {
        throw new Error("접속 가능한 작업공간이 없습니다.");
      }
      const workspace = getWorkspaceSummary(fixture.state, membership.organization_id);
      return {
        userId,
        email: fixture.state.authUsers.find((user) => user.id === userId)?.email ?? null,
        isPlatformAdmin: false,
        organizations: workspace
          ? [
              {
                organizationId: workspace.organizationId,
                organizationName: workspace.organizationName,
                organizationPlanCode: workspace.organizationPlanCode,
                organizationStatus: workspace.organizationStatus,
                monthlyIssueLimit: workspace.monthlyIssueLimit,
                role: "owner",
                displayName: workspace.ownerDisplayName
              }
            ]
          : [],
        activeOrganizationId: workspace?.organizationId ?? null,
        activeOrganizationName: workspace?.organizationName ?? null,
        activeOrganizationRole: workspace ? "owner" : null,
        activeDisplayName: workspace?.ownerDisplayName ?? null
      };
    },
    findAuthUserByLoginId: async (_adminClient, loginId) => {
      const normalizedLoginId = loginId.trim().toLowerCase();
      const index = fixture.state.loginIndexRows.find((item) => item.login_id === normalizedLoginId) ?? null;
      return index
        ? {
            id: index.user_id,
            email: index.auth_email,
            loginId: index.login_id,
            displayName: index.display_name
          }
        : null;
    },
    isEmailLikeAccount: (value) => value.includes("@"),
    normalizeLoginId: (value) => value.trim().toLowerCase(),
    normalizeEmail: (value) => value.trim().toLowerCase(),
    createWorkspaceLoginEmail: (loginId) => `${loginId.trim().toLowerCase()}@workspace.auto-tax.local`,
    upsertAuthUserLoginIndex: async (adminClient, input) => {
      await adminClient.from("auth_user_login_index").upsert({
        user_id: input.userId,
        login_id: input.loginId,
        auth_email: input.email,
        display_name: input.displayName ?? null
      });
    },
    createEmptyBootstrapWorkspace: () => ({
      settings: {} as never,
      customers: [],
      customerCertificates: [],
      drafts: [],
      inbox: [],
      counts: {
        actionableDrafts: 0,
        customers: 0,
        reviewDrafts: 0,
        scheduledDrafts: 0,
        failedDrafts: 0,
        unmatchedMessages: 0
      }
    }),
    createEmptySettings: () => ({} as never),
    toClientSettings: (value) => value,
    toClientCustomer: (customer) => customer,
    runPlatformMaintenance: async () => ({}),
    dispatchRecurringJobs: async () => ({}),
    runDueJobs: async () => ({})
  });

  registerOpsRoutes({
    app,
    requirePlatformAdmin: () => ({
      userId: "99999999-9999-4999-8999-999999999999",
      isPlatformAdmin: true
    }) as never,
    createSupabaseAdminClient: () => fixture.client as never,
    createOrganizationStore: async ({ organizationId }) => ({
      initialize: async () => undefined,
      getSettings: async () =>
        fixture.state.settingsByOrganization.get(organizationId) ?? createTestSettings(),
      updateSettings: async (input: Partial<AppSettings>) => {
        const current =
          fixture.state.settingsByOrganization.get(organizationId) ?? createTestSettings();
        const next = createTestSettings({
          ...current,
          ...input,
          updatedAt: "2026-05-07T01:00:00.000Z"
        });
        fixture.state.settingsByOrganization.set(organizationId, next);
        return next;
      },
      createLog: async () => undefined,
      close: async () => undefined
    }) as never,
    listOpsWorkspaces: async () =>
      fixture.state.organizations.flatMap((organization) => {
        const workspace = getWorkspaceSummary(fixture.state, organization.id);
        return workspace ? [workspace] : [];
      }),
    getOpsWorkspaceSummaryById: async (organizationId) => getWorkspaceSummary(fixture.state, organizationId),
    toClientSettings: (settings) => settings,
    testMailConnections: async () => ({ imapOk: true, smtpOk: true }),
    normalizeLoginId: (value) => value.trim().toLowerCase(),
    createWorkspaceSeed: (organizationName, ownerLoginId) => `${organizationName}:${ownerLoginId}`,
    createDeterministicUuid: () => "20000000-0000-4000-8000-000000000001",
    findAuthUserByLoginId: async (_adminClient, loginId) => {
      const normalizedLoginId = loginId.trim().toLowerCase();
      const index = fixture.state.loginIndexRows.find((item) => item.login_id === normalizedLoginId) ?? null;
      return index
        ? {
            id: index.user_id,
            email: index.auth_email,
            loginId: index.login_id,
            displayName: index.display_name
          }
        : null;
    },
    createWorkspaceLoginEmail: (loginId) => `${loginId.trim().toLowerCase()}@workspace.auto-tax.local`,
    upsertAuthUserLoginIndex: async (adminClient, input) => {
      await adminClient.from("auth_user_login_index").upsert({
        user_id: input.userId,
        login_id: input.loginId,
        auth_email: input.email,
        display_name: input.displayName ?? null
      });
    },
    isUniqueViolation: () => false,
    listAllAuthUsers: async () => []
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "입력값이 올바르지 않습니다." });
      return;
    }
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "server error";
    res.status(status).json({ error: message });
  });
}

async function withSignupServer<T>(
  callback: (baseUrl: string, fixture: ReturnType<typeof createSignupAdminClient>) => Promise<T>
) {
  const fixture = createSignupAdminClient();
  const app = express();
  app.use(express.json());
  registerSignupTestRoutes(app, fixture);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    return await callback(baseUrl, fixture);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

const validSignupPayload = {
  loginId: "solar-owner",
  password: "Password1234!",
  organizationName: "해성태양광",
  representativeName: "홍길동",
  businessRegistrationNumber: "123-45-67890",
  businessAddress: "서울특별시 강남구 테헤란로 123",
  businessType: "서비스업",
  businessItem: "전자세금계산서 자동화",
  name: "홍길동",
  phone: "010-1234-5678",
  kepcoEmail: "kepco@example.com",
  invoiceEmail: "tax@example.com",
  termsAccepted: true,
  privacyAccepted: true,
  thirdPartyAccepted: true,
  marketingConsent: false
};

async function createVerifiedSignupPayload(
  baseUrl: string,
  overrides: Partial<typeof validSignupPayload> = {}
) {
  const payload = { ...validSignupPayload, ...overrides };
  const verificationId = await createVerifiedPhoneVerification(baseUrl, payload.phone);

  return {
    ...payload,
    phoneVerificationId: verificationId
  };
}

async function createVerifiedPhoneVerification(baseUrl: string, phone: string): Promise<string> {
  const send = await fetch(`${baseUrl}/api/public/signup/phone-verifications/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone })
  });
  assert.equal(send.status, 201);
  const sent = await send.json() as { verificationId: string; devCode?: string };
  assert.ok(sent.verificationId);
  assert.ok(sent.devCode);

  const confirm = await fetch(`${baseUrl}/api/public/signup/phone-verifications/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      verificationId: sent.verificationId,
      phone,
      code: sent.devCode
    })
  });
  assert.equal(confirm.status, 200);

  return sent.verificationId;
}

test("public signup requires mandatory consents", async () => {
  await withSignupServer(async (baseUrl, fixture) => {
    const response = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validSignupPayload, termsAccepted: false })
    });

    assert.equal(response.status, 400);
    assert.equal(fixture.state.signupRows.length, 0);
    assert.equal(fixture.state.authUsers.length, 0);
  });
});

test("public signup rejects uncommon Korean phone prefixes", async () => {
  await withSignupServer(async (baseUrl, fixture) => {
    const response = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validSignupPayload, phone: "0130216846312" })
    });

    assert.equal(response.status, 400);
    assert.equal(fixture.state.signupRows.length, 0);
    assert.equal(fixture.state.authUsers.length, 0);
  });
});

test("public signup requires verified phone before creating auth user", async () => {
  await withSignupServer(async (baseUrl, fixture) => {
    const missingVerification = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validSignupPayload, phoneVerificationId: "30000000-0000-4000-8000-000000000001" })
    });
    assert.equal(missingVerification.status, 400);
    assert.equal(fixture.state.signupRows.length, 0);
    assert.equal(fixture.state.authUsers.length, 0);
  });
});

test("public signup phone verification rejects wrong codes and confirms dev code", async () => {
  await withSignupServer(async (baseUrl) => {
    const send = await fetch(`${baseUrl}/api/public/signup/phone-verifications/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: validSignupPayload.phone })
    });
    assert.equal(send.status, 201);
    const sent = await send.json() as { verificationId: string; devCode?: string };
    assert.ok(sent.devCode);

    const wrong = await fetch(`${baseUrl}/api/public/signup/phone-verifications/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        verificationId: sent.verificationId,
        phone: validSignupPayload.phone,
        code: "000000"
      })
    });
    assert.equal(wrong.status, 400);

    const confirmed = await fetch(`${baseUrl}/api/public/signup/phone-verifications/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        verificationId: sent.verificationId,
        phone: validSignupPayload.phone,
        code: sent.devCode
      })
    });
    assert.equal(confirmed.status, 200);
    assert.deepEqual(await confirmed.json(), { verified: true });
  });
});

test("public signup rejects unreasonable identity fields", async () => {
  await withSignupServer(async (baseUrl, fixture) => {
    const invalidName = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validSignupPayload, name: "fawofpk" })
    });
    assert.equal(invalidName.status, 400);

    const invalidOrganization = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validSignupPayload, organizationName: "fawofpk" })
    });
    assert.equal(invalidOrganization.status, 400);

    const invalidBusinessRegistrationNumber = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validSignupPayload, businessRegistrationNumber: "12345" })
    });
    assert.equal(invalidBusinessRegistrationNumber.status, 400);

    const weakPassword = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validSignupPayload, password: "aaaaaaaa" })
    });
    assert.equal(weakPassword.status, 400);
    assert.equal(fixture.state.signupRows.length, 0);
    assert.equal(fixture.state.authUsers.length, 0);
  });
});

test("signup creates a pending auth user, blocks login until approval, then creates owner workspace", async () => {
  await withSignupServer(async (baseUrl, fixture) => {
    const signupPayload = await createVerifiedSignupPayload(baseUrl);
    const created = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signupPayload)
    });
    assert.equal(created.status, 201);
    assert.equal(fixture.state.signupRows.length, 1);
    assert.equal(fixture.state.signupRows[0]?.marketing_consent, false);
    assert.equal(fixture.state.signupRows[0]?.representative_name, validSignupPayload.representativeName);
    assert.equal(fixture.state.signupRows[0]?.business_registration_number, "1234567890");
    assert.equal(fixture.state.signupRows[0]?.business_address, validSignupPayload.businessAddress);
    assert.equal(fixture.state.signupRows[0]?.business_type, validSignupPayload.businessType);
    assert.equal(fixture.state.signupRows[0]?.business_item, validSignupPayload.businessItem);
    assert.equal(fixture.state.signupRows[0]?.invoice_email, validSignupPayload.invoiceEmail);

    const pendingLogin = await fetch(`${baseUrl}/api/public/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: validSignupPayload.loginId, password: validSignupPayload.password })
    });
    assert.equal(pendingLogin.status, 403);
    assert.equal(((await pendingLogin.json()) as { error: string }).error, "회원가입 승인 대기 중입니다.");

    const approve = await fetch(`${baseUrl}/api/ops/signup-requests/${fixture.state.signupRows[0]?.id}/approve`, {
      method: "POST"
    });
    assert.equal(approve.status, 200);
    assert.equal(fixture.state.signupRows[0]?.status, "approved");
    assert.equal(fixture.state.organizations.length, 1);
    assert.equal(fixture.state.organizations[0]?.plan_code, "free_trial");
    assert.equal(fixture.state.organizations[0]?.status, "trial");
    assert.equal(fixture.state.organizations[0]?.monthly_issue_limit, 10);
    assert.equal(fixture.state.members[0]?.role, "owner");
    const organizationId = fixture.state.organizations[0]?.id;
    assert.ok(organizationId);
    const seededSettings = fixture.state.settingsByOrganization.get(organizationId);
    assert.ok(seededSettings);
    assert.equal(seededSettings.operatorContactName, validSignupPayload.name);
    assert.equal(seededSettings.operatorContactTel, validSignupPayload.phone);
    assert.equal(seededSettings.operatorContactEmail, validSignupPayload.kepcoEmail);
    assert.equal(seededSettings.imapUser, "");
    assert.equal(seededSettings.smtpUser, "");
    assert.equal(seededSettings.smtpFromEmail, "");
    assert.deepEqual(seededSettings.notificationEmails, []);

    const approvedLogin = await fetch(`${baseUrl}/api/public/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: validSignupPayload.loginId, password: validSignupPayload.password })
    });
    assert.equal(approvedLogin.status, 200);
    assert.ok(((await approvedLogin.json()) as { session?: { access_token?: string } }).session?.access_token);
  });
});

test("public login id lookup returns matching signup login id after phone verification", async () => {
  await withSignupServer(async (baseUrl) => {
    const signupPayload = await createVerifiedSignupPayload(baseUrl);
    const created = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signupPayload)
    });
    assert.equal(created.status, 201);

    const lookupVerificationId = await createVerifiedPhoneVerification(baseUrl, validSignupPayload.phone);
    const lookup = await fetch(`${baseUrl}/api/public/signup/login-id-lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: validSignupPayload.name,
        phone: "01012345678",
        phoneVerificationId: lookupVerificationId
      })
    });
    assert.equal(lookup.status, 200);
    assert.deepEqual(await lookup.json(), {
      found: true,
      loginId: validSignupPayload.loginId,
      status: "pending"
    });

    const missingVerificationId = await createVerifiedPhoneVerification(baseUrl, validSignupPayload.phone);
    const missing = await fetch(`${baseUrl}/api/public/signup/login-id-lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "김없음",
        phone: validSignupPayload.phone,
        phoneVerificationId: missingVerificationId
      })
    });
    assert.equal(missing.status, 200);
    assert.deepEqual(await missing.json(), { found: false });
  });
});

test("ops subscription update applies paid 100-issue blocks only", async () => {
  await withSignupServer(async (baseUrl, fixture) => {
    const signupPayload = await createVerifiedSignupPayload(baseUrl);
    await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signupPayload)
    });
    await fetch(`${baseUrl}/api/ops/signup-requests/${fixture.state.signupRows[0]?.id}/approve`, {
      method: "POST"
    });
    const organizationId = fixture.state.organizations[0]?.id;

    const invalid = await fetch(`${baseUrl}/api/ops/workspaces/${organizationId}/subscription`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planCode: "paid", monthlyIssueLimit: 150 })
    });
    assert.equal(invalid.status, 400);

    const valid = await fetch(`${baseUrl}/api/ops/workspaces/${organizationId}/subscription`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planCode: "paid", monthlyIssueLimit: 200 })
    });
    assert.equal(valid.status, 200);
    assert.equal(fixture.state.organizations[0]?.plan_code, "paid");
    assert.equal(fixture.state.organizations[0]?.status, "active");
    assert.equal(fixture.state.organizations[0]?.monthly_issue_limit, 200);
  });
});

test("rejected signup remains unable to login", async () => {
  await withSignupServer(async (baseUrl, fixture) => {
    const signupPayload = await createVerifiedSignupPayload(baseUrl, { loginId: "reject-me", marketingConsent: true });
    const created = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signupPayload)
    });
    assert.equal(created.status, 201);
    assert.equal(fixture.state.signupRows[0]?.marketing_consent, true);

    const reject = await fetch(`${baseUrl}/api/ops/signup-requests/${fixture.state.signupRows[0]?.id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(reject.status, 200);
    assert.equal(fixture.state.signupRows[0]?.status, "rejected");

    const rejectedLogin = await fetch(`${baseUrl}/api/public/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: "reject-me", password: validSignupPayload.password })
    });
    assert.equal(rejectedLogin.status, 403);
    assert.equal(((await rejectedLogin.json()) as { error: string }).error, "회원가입이 반려되었습니다. 관리자에게 문의하세요.");
  });
});

test("public signup login id availability reports duplicate status", async () => {
  await withSignupServer(async (baseUrl) => {
    const available = await fetch(
      `${baseUrl}/api/public/signup/login-id-availability?loginId=${encodeURIComponent(validSignupPayload.loginId)}`
    );
    assert.equal(available.status, 200);
    assert.deepEqual(await available.json(), {
      loginId: validSignupPayload.loginId,
      available: true
    });

    const signupPayload = await createVerifiedSignupPayload(baseUrl);
    const created = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signupPayload)
    });
    assert.equal(created.status, 201);

    const duplicate = await fetch(
      `${baseUrl}/api/public/signup/login-id-availability?loginId=${encodeURIComponent(validSignupPayload.loginId.toUpperCase())}`
    );
    assert.equal(duplicate.status, 200);
    assert.deepEqual(await duplicate.json(), {
      loginId: validSignupPayload.loginId,
      available: false
    });
  });
});

test("duplicate signup login id is rejected", async () => {
  await withSignupServer(async (baseUrl) => {
    const firstPayload = await createVerifiedSignupPayload(baseUrl);
    const first = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(firstPayload)
    });
    assert.equal(first.status, 201);

    const duplicatePayload = await createVerifiedSignupPayload(baseUrl);
    const duplicate = await fetch(`${baseUrl}/api/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(duplicatePayload)
    });
    assert.equal(duplicate.status, 409);
    assert.equal(((await duplicate.json()) as { error: string }).error, "이미 사용중인 아이디입니다.");
  });
});
