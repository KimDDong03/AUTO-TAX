import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings, Customer, LogEntry, PopbillState } from "./domain.js";
import type { AppStore } from "./store-contract.js";
import { refreshAllCertificateStatuses } from "./certificate-monitor.js";

function formatCompactDateOffset(daysFromToday: number): string {
  const target = new Date();
  target.setDate(target.getDate() + daysFromToday);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function createCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    customerName: "테스트 고객",
    businessNumber: "1234567890",
    corpName: "테스트 상호",
    ceoName: "대표자",
    addr: "서울특별시 강남구 테헤란로 1",
    bizType: "업태",
    bizClass: "종목",
    popbillUserId: "POPBILL",
    popbillPassword: "",
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
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides
  };
}

test("refreshAllCertificateStatuses keeps summary semantics without reloading customers", async () => {
  const checkedAt = "2026-04-14T00:00:00.000Z";
  const expiredDate = formatCompactDateOffset(-1);
  const expiringSoonDate = formatCompactDateOffset(10);
  const customers = [
    createCustomer({ id: 1, customerName: "만료 고객", popbillCertExpireDate: null }),
    createCustomer({ id: 2, customerName: "임박 고객", popbillCertExpireDate: expiringSoonDate }),
    createCustomer({ id: 3, customerName: "대기 고객", popbillState: "pending", popbillCertExpireDate: null })
  ];
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const metadataUpdates: Array<Parameters<AppStore["updateCertificateCheckMetadata"]>[0]> = [];
  const logs: Array<{ level: LogEntry["level"]; scope: string; message: string; context: unknown }> = [];
  const notificationBodies: string[] = [];
  let listCustomersCalls = 0;
  let updateSettingsCalled = false;

  const store = {
    getSettings: async () =>
      ({
        certAlertLastSentAt: null
      }) as AppSettings,
    listCustomers: async () => {
      listCustomersCalls += 1;
      assert.equal(listCustomersCalls, 1);
      return customers;
    },
    updateCustomerPopbillState: async (
      customerId: number,
      state: PopbillState,
      certRegistered?: boolean,
      certExpireDate?: string | null
    ) => {
      const customer = customerById.get(customerId);
      assert.ok(customer);
      const updated = {
        ...customer,
        popbillState: state,
        popbillCertRegistered: certRegistered ?? customer.popbillCertRegistered,
        popbillCertExpireDate: certExpireDate ?? customer.popbillCertExpireDate
      };
      customerById.set(customerId, updated);
      return updated;
    },
    updateCertificateCheckMetadata: async (input: Parameters<AppStore["updateCertificateCheckMetadata"]>[0]) => {
      metadataUpdates.push(input);
    },
    updateSettings: async () => {
      updateSettingsCalled = true;
      throw new Error("refreshAllCertificateStatuses should not call updateSettings");
    },
    createLog: async (level: LogEntry["level"], scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const result = await refreshAllCertificateStatuses(store, {
    nowIso: () => checkedAt,
    getCertificateExpireDate: async (_settings, customer) => {
      if (customer.id === 1) {
        return expiredDate;
      }
      throw new Error("인증서 조회 실패");
    },
    sendNotification: async (_settings, _subject, body) => {
      notificationBodies.push(body);
      return true;
    }
  });

  assert.equal(listCustomersCalls, 1);
  assert.equal(updateSettingsCalled, false);
  assert.deepEqual(metadataUpdates, [
    {
      certLastCheckedAt: checkedAt,
      certAlertLastSentAt: checkedAt
    }
  ]);
  assert.equal(result.checked, 2);
  assert.equal(result.updated, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.expired, 1);
  assert.equal(result.expiringSoon, 1);
  assert.equal(result.notificationStatus, "sent");
  assert.equal(result.results.length, 2);
  assert.equal(notificationBodies.length, 1);
  assert.match(notificationBodies[0] ?? "", /만료 고객 1건/);
  assert.match(notificationBodies[0] ?? "", /30일 이내 만료 예정 고객 1건/);
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.level, "error");
  assert.equal(logs[1]?.level, "info");
});
