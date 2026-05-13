import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { z } from "zod";
import type {
  AppSettings,
  Customer,
  CustomerContractRenewalCompletion,
  CustomerContractRenewalDueItem,
  CustomerContractSummary,
  CustomerInput,
  CustomerReportDetail,
  CustomerReportDetailInput
} from "./domain.js";
import { CustomerContractRenewalConflictError } from "./customer-contract-renewals.js";
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
    getCustomer?: (customerId: number) => Promise<Customer | null> | Customer | null;
    afterDelete?: () => Promise<void> | void;
    afterReset?: () => Promise<Customer> | Customer;
    saveCustomer?: (input: CustomerInput, customerId?: number) => Promise<Customer> | Customer;
    getCustomerReportDetail?: (customerId: number, reportYear: number) => Promise<CustomerReportDetail> | CustomerReportDetail;
    saveCustomerReportDetail?: (customerId: number, input: CustomerReportDetailInput) => Promise<CustomerReportDetail> | CustomerReportDetail;
    listCustomerContractSummaries?: () => Promise<CustomerContractSummary[]> | CustomerContractSummary[];
    listCustomerContractRenewalsDue?: (currentYearMonth: string) => Promise<CustomerContractRenewalDueItem[]> | CustomerContractRenewalDueItem[];
    completeCustomerContractRenewal?: (
      customerId: number,
      expectedContractEndMonth: string
    ) => Promise<CustomerContractRenewalCompletion> | CustomerContractRenewalCompletion;
    customerSchema?: z.ZodTypeAny;
    normalizeCustomerInput?: (input: unknown) => CustomerInput;
  },
  run: (baseUrl: string, calls: { events: string[]; logs: Array<{ message: string; context?: unknown }> }) => Promise<void>
) {
  const calls = {
    events: [] as string[],
    logs: [] as Array<{ message: string; context?: unknown }>
  };

  const requestStore = {
    getCustomer: async (customerId: number) => {
      if (options.getCustomer) {
        return await options.getCustomer(customerId);
      }
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
    saveCustomer: async (input: CustomerInput, customerId?: number) => {
      calls.events.push("save");
      return (
        (await options.saveCustomer?.(input, customerId)) ??
        (() => {
          throw new Error("saveCustomer should not be used in this test");
        })()
      );
    },
    getCustomerReportDetail: async (customerId: number, reportYear: number) => {
      calls.events.push("get-report-detail");
      return (
        (await options.getCustomerReportDetail?.(customerId, reportYear)) ??
        (() => {
          throw new Error("getCustomerReportDetail should not be used in this test");
        })()
      );
    },
    saveCustomerReportDetail: async (customerId: number, input: CustomerReportDetailInput) => {
      calls.events.push("save-report-detail");
      return (
        (await options.saveCustomerReportDetail?.(customerId, input)) ??
        (() => {
          throw new Error("saveCustomerReportDetail should not be used in this test");
        })()
      );
    },
    listCustomerContractRenewalsDue: async (currentYearMonth: string) => {
      calls.events.push("list-contract-renewals");
      return (
        (await options.listCustomerContractRenewalsDue?.(currentYearMonth)) ??
        (() => {
          throw new Error("listCustomerContractRenewalsDue should not be used in this test");
        })()
      );
    },
    listCustomerContractSummaries: async () => {
      calls.events.push("list-contract-summaries");
      return (
        (await options.listCustomerContractSummaries?.()) ??
        (() => {
          throw new Error("listCustomerContractSummaries should not be used in this test");
        })()
      );
    },
    completeCustomerContractRenewal: async (customerId: number, expectedContractEndMonth: string) => {
      calls.events.push("complete-contract-renewal");
      return (
        (await options.completeCustomerContractRenewal?.(customerId, expectedContractEndMonth)) ??
        (() => {
          throw new Error("completeCustomerContractRenewal should not be used in this test");
        })()
      );
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
    customerSchema: options.customerSchema ?? z.object({}),
    normalizeCustomerInput:
      options.normalizeCustomerInput ??
      (() => {
        throw new Error("normalizeCustomerInput should not be used in this test");
      }),
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

function buildCustomerInput(customer: Customer, overrides: Partial<CustomerInput> = {}): CustomerInput {
  return {
    customerName: customer.customerName,
    businessNumber: customer.businessNumber,
    corpName: customer.corpName,
    ceoName: customer.ceoName,
    addr: customer.addr,
    bizType: customer.bizType,
    bizClass: customer.bizClass,
    issueMode: customer.issueMode,
    issueDay: customer.issueDay,
    issueHour: customer.issueHour,
    issueMinute: customer.issueMinute,
    renewalContactMobile: customer.renewalContactMobile,
    memo: customer.memo,
    plantNames: customer.plantNames,
    matchAddresses: customer.matchAddresses,
    ...overrides
  };
}

function buildCustomerReportDetail(overrides: Partial<CustomerReportDetail> = {}): CustomerReportDetail {
  const customerId = overrides.customerId ?? 1;
  const reportYear = overrides.reportYear ?? 2026;
  return {
    customerId,
    reportYear,
    profile: {
      customerId,
      certificateRenewalDate: "2026-12-31",
      hasPersonalGeneralCertificate: true,
      hasTaxInvoiceBusinessCertificate: false,
      solarCapacityKw: 123.45,
      contractStartMonth: "2026-01",
      contractEndMonth: "2027-01",
      otherNote: "memo",
      createdAt: "2026-04-14T00:00:00.000Z",
      updatedAt: "2026-04-14T00:00:00.000Z"
    },
    months: Array.from({ length: 12 }, (_, index) => ({
      reportYear,
      reportMonth: index + 1,
      issueYear: null,
      issueDate: null,
      supplyAmount: 0,
      vatAmount: 0,
      totalAmount: 0,
      createdAt: null,
      updatedAt: null
    })),
    ...overrides
  };
}

test("customer certificate password endpoint is retired and never returns plaintext", async () => {
  const customer = buildCustomer();

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false)
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customer-certificates/99/password`);
      assert.equal(response.status, 410);
      assert.deepEqual(await response.json(), {
        error: "공동인증서 비밀번호는 서버에 저장하지 않습니다. 현재 브라우저 탭이나 로컬 헬퍼에서 다시 입력하세요."
      });
      assert.equal(
        calls.logs.some((entry) => entry.message.includes("공동인증서 비밀번호 재표시 요청을 차단했습니다.")),
        true
      );
    }
  );
});

test("GET customer report detail returns selected year payload", async () => {
  const customer = buildCustomer();
  const detail = buildCustomerReportDetail({ customerId: customer.id, reportYear: 2027 });

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      getCustomerReportDetail: (customerId, reportYear) => {
        assert.equal(customerId, customer.id);
        assert.equal(reportYear, 2027);
        return detail;
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}/report-detail?year=2027`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), detail);
      assert.deepEqual(calls.events, ["get-report-detail"]);
    }
  );
});

test("PUT customer report detail validates and saves report payload", async () => {
  const customer = buildCustomer();
  const detail = buildCustomerReportDetail({ customerId: customer.id, reportYear: 2026 });

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      saveCustomerReportDetail: (customerId, input) => {
        assert.equal(customerId, customer.id);
        assert.equal(input.reportYear, 2026);
        assert.equal(input.months.length, 1);
        assert.equal(input.months[0].reportMonth, 1);
        assert.equal(input.months[0].supplyAmount, 1000);
        assert.equal(input.months[0].vatAmount, 100);
        assert.equal(input.profile.certificateRenewalDate, "2026-12-31");
        return detail;
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}/report-detail`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportYear: 2026,
          profile: {
            certificateRenewalDate: "2026-12-31",
            hasPersonalGeneralCertificate: true,
            hasTaxInvoiceBusinessCertificate: false,
            solarCapacityKw: 123.45,
            contractStartMonth: "2026-01",
            contractEndMonth: "2027-01",
            otherNote: "memo"
          },
          months: [
            {
              reportMonth: 1,
              issueYear: 2026,
              issueDate: "2026-02-10",
              supplyAmount: 1000,
              vatAmount: 100
            }
          ]
        })
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), detail);
      assert.deepEqual(calls.events, ["save-report-detail"]);
      assert.equal(calls.logs.some((entry) => entry.message.includes("고객 신고 상세 정보를 저장했습니다.")), true);
    }
  );
});

test("customer report detail endpoints return not found outside workspace scope", async () => {
  const customer = buildCustomer();

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      getCustomer: async () => null,
      getCustomerReportDetail: () => {
        throw new Error("getCustomerReportDetail should not be called");
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}/report-detail?year=2026`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "고객을 찾지 못했습니다." });
      assert.deepEqual(calls.events, []);
    }
  );
});

test("GET customer contract renewals returns due list", async () => {
  const customer = buildCustomer();
  const dueItems: CustomerContractRenewalDueItem[] = [
    {
      customerId: customer.id,
      customerName: customer.customerName,
      corpName: customer.corpName,
      businessNumber: customer.businessNumber,
      renewalContactMobile: customer.renewalContactMobile,
      contractStartMonth: "2026-04",
      contractEndMonth: "2027-04",
      nextContractStartMonth: "2027-05",
      nextContractEndMonth: "2028-05",
      status: "due_this_month"
    }
  ];

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      listCustomerContractRenewalsDue: (currentYearMonth) => {
        assert.match(currentYearMonth, /^\d{4}-\d{2}$/);
        return dueItems;
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/contract-renewals/due`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), dueItems);
      assert.deepEqual(calls.events, ["list-contract-renewals"]);
    }
  );
});

test("GET customer contract summaries returns list contract status inputs", async () => {
  const customer = buildCustomer();
  const summaries: CustomerContractSummary[] = [
    {
      customerId: customer.id,
      contractStartMonth: "2026-06",
      contractEndMonth: "2027-06"
    }
  ];

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      listCustomerContractSummaries: () => summaries
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/contract-summaries`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), summaries);
      assert.deepEqual(calls.events, ["list-contract-summaries"]);
    }
  );
});

test("POST customer contract renewal complete records new period and audit log", async () => {
  const customer = buildCustomer();
  const completion: CustomerContractRenewalCompletion = {
    completed: true,
    profile: buildCustomerReportDetail({
      customerId: customer.id,
      profile: {
        ...buildCustomerReportDetail({ customerId: customer.id }).profile,
        contractStartMonth: "2027-06",
        contractEndMonth: "2028-06"
      }
    }).profile,
    oldContractStartMonth: "2026-05",
    oldContractEndMonth: "2027-05",
    newContractStartMonth: "2027-06",
    newContractEndMonth: "2028-06"
  };

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      completeCustomerContractRenewal: (customerId, expectedContractEndMonth) => {
        assert.equal(customerId, customer.id);
        assert.equal(expectedContractEndMonth, "2027-05");
        return completion;
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}/contract-renewal/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedContractEndMonth: "2027-05" })
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), completion);
      assert.deepEqual(calls.events, ["complete-contract-renewal"]);
      const log = calls.logs.find((entry) => entry.message.includes("고객 계약 갱신 완료"));
      assert.deepEqual(log?.context, {
        eventType: "customer-contract-renewal-completed",
        actorUserId: "user-1",
        organizationId: "org-1",
        customerId: customer.id,
        oldContractStartMonth: "2026-05",
        oldContractEndMonth: "2027-05",
        newContractStartMonth: "2027-06",
        newContractEndMonth: "2028-06"
      });
    }
  );
});

test("POST customer contract renewal complete returns 409 for stale expected month", async () => {
  const customer = buildCustomer();

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      completeCustomerContractRenewal: () => {
        throw new CustomerContractRenewalConflictError();
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}/contract-renewal/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedContractEndMonth: "2027-05" })
      });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error: "계약 종료월이 변경되었습니다. 새로고침 후 다시 처리하세요."
      });
      assert.deepEqual(calls.events, ["complete-contract-renewal"]);
      assert.equal(calls.logs.length, 0);
    }
  );
});

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
        error: "발행 연동 계정이 없습니다. 고객 발행 연동을 다시 진행하세요. [POPBILL -99003008]"
      });
    }
  );
});

test("delete customer continues when Popbill contact update says the member is missing", async () => {
  const customer = buildCustomer();
  const events: string[] = [];

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      quitCustomerPopbillMember: async () => {
        events.push("quit");
        throw new PopbillApiError("contact-update", "-10000006", "해당 회원을 찾을 수 없습니다.");
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
      assert.equal(calls.logs.some((entry) => entry.context), true);
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

test("update customer ignores auto issue mode requests and saves review mode", async () => {
  const customer = buildCustomer();

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      customerSchema: z.any(),
      normalizeCustomerInput: (input) => input as CustomerInput,
      saveCustomer: async (input, customerId) => {
        assert.equal(customerId, customer.id);
        assert.equal(input.issueMode, "review");
        assert.equal(input.issueDay, null);
        assert.equal(input.issueHour, null);
        assert.equal(input.issueMinute, null);
        return buildCustomer({ issueMode: "review" });
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(buildCustomerInput(customer, { issueMode: "auto" }))
      });
      assert.equal(response.status, 200);
      const responseBody = (await response.json()) as Customer;
      assert.equal(responseBody.issueMode, "review");
      assert.deepEqual(calls.events, ["save"]);
      assert.equal(calls.logs.some((entry) => entry.message.includes("고객 정보를 수정했습니다.")), true);
      assert.equal(calls.logs.some((entry) => entry.message.includes("발행 설정을 변경했습니다.")), false);
    }
  );
});

test("update customer skips issue mode audit log when issue mode is unchanged", async () => {
  const customer = buildCustomer();

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      customerSchema: z.any(),
      normalizeCustomerInput: (input) => input as CustomerInput,
      saveCustomer: async (input, customerId) => {
        assert.equal(customerId, customer.id);
        assert.equal(input.issueMode, "review");
        return buildCustomer({
          updatedAt: "2026-04-17T02:03:04.000Z"
        });
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(buildCustomerInput(customer))
      });
      assert.equal(response.status, 200);
      assert.deepEqual(calls.events, ["save"]);
      assert.equal(calls.logs.some((entry) => entry.message.includes("고객 정보를 수정했습니다.")), true);
      assert.equal(calls.logs.some((entry) => entry.message.includes("발행 설정을 변경했습니다.")), false);
    }
  );
});

test("update customer normalizes legacy auto customers to review without audit log", async () => {
  const customer = buildCustomer({
    issueMode: "auto"
  });

  await withCustomerRoutes(
    {
      customer,
      settings: buildSettings(false),
      customerSchema: z.any(),
      normalizeCustomerInput: (input) => input as CustomerInput,
      saveCustomer: async (input, customerId) => {
        assert.equal(customerId, customer.id);
        assert.equal(input.issueMode, "review");
        return buildCustomer({
          issueMode: "review",
          updatedAt: "2026-04-17T03:04:05.000Z"
        });
      }
    },
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/customers/${customer.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(buildCustomerInput(customer, { issueMode: "review" }))
      });
      assert.equal(response.status, 200);
      assert.deepEqual(calls.events, ["save"]);
      assert.equal(calls.logs.some((entry) => entry.message.includes("고객 정보를 수정했습니다.")), true);
      assert.equal(calls.logs.some((entry) => entry.message.includes("발행 설정을 변경했습니다.")), false);
    }
  );
});
