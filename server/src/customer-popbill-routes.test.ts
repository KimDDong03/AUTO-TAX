import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { z } from "zod";
import type { AppSettings, Customer } from "./domain.js";
import { PopbillApiError } from "./popbill-client.js";
import { registerCustomerPopbillRoutes } from "./routes/customer-popbill-routes.js";
import type { AppStore } from "./store-contract.js";

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
    popbillCertRegistered: false,
    popbillCertExpireDate: null,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    createdAt: "2026-04-14T00:00:00.000Z",
    updatedAt: "2026-04-14T00:00:00.000Z",
    ...overrides
  };
}

function buildSettings(popbillIsTest: boolean): AppSettings {
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
    popbillIsTest,
    popbillPartnerCorpNum: "",
    popbillUserIdPrefix: "TEST_",
    popbillSharedPassword: "",
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
    createdAt: "2026-04-14T00:00:00.000Z",
    updatedAt: "2026-04-14T00:00:00.000Z"
  };
}

async function withCustomerRoutes(
  options: {
    customer: Customer;
    settings: AppSettings;
    quitCustomerPopbillMember?: (settings: AppSettings, customer: Customer, reason: string) => Promise<unknown>;
    afterDelete?: () => Promise<void> | void;
    afterReset?: () => Promise<Customer> | Customer;
  },
  run: (baseUrl: string, calls: { events: string[]; logs: Array<{ message: string; context?: unknown }> }) => Promise<void>
) {
  const calls = {
    events: [] as string[],
    logs: [] as Array<{ message: string; context?: unknown }>
  };

  const requestStore = {
    getCustomer: async (customerId: number) => {
      assert.equal(customerId, options.customer.id);
      return options.customer;
    },
    deleteCustomer: async (customerId: number) => {
      assert.equal(customerId, options.customer.id);
      calls.events.push("delete");
      await options.afterDelete?.();
    },
    resetCustomerPopbill: async (customerId: number) => {
      assert.equal(customerId, options.customer.id);
      calls.events.push("reset");
      return (await options.afterReset?.()) ?? buildCustomer({ ...options.customer, popbillState: "pending", popbillCertRegistered: false });
    },
    createLog: async (_level: string, _scope: string, message: string, context?: unknown) => {
      calls.logs.push({ message, context });
    }
  } as unknown as AppStore;

  const app = express();
  app.use(express.json());

  registerCustomerPopbillRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () =>
      ({
        userId: "user-1",
        activeOrganizationId: "org-1",
        activeOrganizationRole: "owner"
      }) as never,
    getServerManagedSettings: async () => options.settings,
    customerSchema: z.object({}),
    normalizeCustomerInput: () => {
      throw new Error("normalizeCustomerInput should not be used in this test");
    },
    autoJoinCustomerPopbill: async () => {
      throw new Error("autoJoinCustomerPopbill should not be used in this test");
    },
    toClientCustomer: (customer) => customer,
    refreshAllCertificateStatuses: async () => {
      throw new Error("refreshAllCertificateStatuses should not be used in this test");
    },
    renewalAutomation: {} as never,
    quitCustomerPopbillMember: options.quitCustomerPopbillMember as never
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls);
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

test("delete customer quits Popbill before local deletion in production", async () => {
  const customer = buildCustomer();
  const events: string[] = [];

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      quitCustomerPopbillMember: async (_settings, nextCustomer, reason) => {
        assert.equal(nextCustomer.id, customer.id);
        assert.equal(reason, "AUTO-TAX 고객 삭제");
        events.push("quit");
        return { code: 1, message: "신청 완료" };
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}`, { method: "DELETE" });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        popbillCleanupStatus: "quit-on-delete"
      });
      assert.deepEqual([...events, ...calls.events], ["quit", "delete"]);
      assert.equal(calls.logs.some((entry) => entry.message.includes("팝빌 연동회원을 먼저 탈퇴 처리")), true);
      assert.equal(calls.logs.some((entry) => entry.message.includes("고객과 관련 로컬 데이터를 삭제")), true);
      const popbillLog = calls.logs.find((entry) => entry.message.includes("팝빌 연동회원을 먼저 탈퇴 처리"));
      assert.deepEqual(popbillLog?.context, {
        customerId: customer.id,
        customerName: customer.customerName,
        environment: "production"
      });
    }
  );
});

test("delete customer continues when Popbill member is already missing", async () => {
  const customer = buildCustomer();
  const events: string[] = [];

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      quitCustomerPopbillMember: async () => {
        events.push("quit");
        throw new PopbillApiError("quit-member", "-99003008", "연동회원으로 가입된 사업자 번호가 존재하지 않습니다. [POPBILL]");
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}`, { method: "DELETE" });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        popbillCleanupStatus: "already-missing-on-delete"
      });
      assert.deepEqual([...events, ...calls.events], ["quit", "delete"]);
      const popbillLog = calls.logs.find((entry) => entry.message.includes("이미 존재하지 않아 로컬 삭제만 진행"));
      assert.deepEqual(popbillLog?.context, {
        customerId: customer.id,
        customerName: customer.customerName,
        environment: "production",
        error: "팝빌 연동회원이 없습니다. 고객 팝빌 가입을 다시 진행하세요. [POPBILL -99003008]"
      });
    }
  );
});

test("explicit Popbill quit route resets local state even in production when member is already missing", async () => {
  const customer = buildCustomer();
  const events: string[] = [];

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      quitCustomerPopbillMember: async () => {
        events.push("quit");
        throw new PopbillApiError("quit-member", "-99003008", "연동회원으로 가입된 사업자 번호가 존재하지 않습니다. [POPBILL]");
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}/popbill/quit`, { method: "POST" });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        response: null,
        quitStatus: "already-missing",
        environment: "production",
        customer: buildCustomer({ popbillState: "pending", popbillCertRegistered: false })
      });
      assert.deepEqual([...events, ...calls.events], ["quit", "reset"]);
      const popbillLog = calls.logs.find((entry) => entry.message.includes("팝빌 연동회원 탈퇴를 처리"));
      assert.deepEqual(popbillLog?.context, {
        customerId: customer.id,
        customerName: customer.customerName,
        environment: "production",
        quitStatus: "already-missing"
      });
    }
  );
});
