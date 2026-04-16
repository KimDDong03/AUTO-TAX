import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings, Customer } from "./domain.js";
import { PopbillApiError } from "./popbill-client.js";
import { autoJoinCustomerPopbill } from "./services/popbill-customer-service.js";
import type { AppStore } from "./store-contract.js";

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 3,
    customerName: "테스트 고객",
    businessNumber: "1234567890",
    corpName: "테스트 고객",
    ceoName: "대표자",
    addr: "서울특별시 강남구 테헤란로 1",
    bizType: "서비스",
    bizClass: "개발",
    popbillUserId: "TEST_3",
    popbillPassword: "",
    popbillState: "pending",
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
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    ...overrides
  };
}

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
    popbillPartnerCorpNum: "1234567890",
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
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z"
  };
}

test("autoJoinCustomerPopbill writes explicit external-api logs for final join failures", async () => {
  const customer = buildCustomer();
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];

  const store = {
    updateCustomerPopbillState: async (_customerId: number, state: Customer["popbillState"]) =>
      buildCustomer({ popbillState: state }),
    createLog: async (level: string, scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const result = await autoJoinCustomerPopbill(
    store,
    customer,
    async () => buildSettings(),
    (_error, fallbackMessage) => fallbackMessage ?? "fallback",
    {
      checkIsMember: async () => false,
      joinMember: async () => {
        throw new PopbillApiError("join-member", "-99999999", "가입 실패");
      }
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.customer.popbillState, "failed");
  assert.deepEqual(logs, [
    {
      level: "error",
      scope: "popbill",
      message: "고객 등록 직후 팝빌 자동 가입에 실패했습니다.",
      context: {
        customerId: 3,
        issueMode: "review",
        error: "가입 실패",
        errorCategory: "external-api",
        errorOperation: "join-member",
        errorCode: "-99999999"
      }
    }
  ]);
});

test("autoJoinCustomerPopbill writes explicit external-api retry logs for user-id conflicts", async () => {
  const customer = buildCustomer();
  const logs: Array<{ level: string; scope: string; message: string; context?: unknown }> = [];
  const updatedUserIds: string[] = [];
  let joinAttempts = 0;

  const store = {
    updateCustomerPopbillUserId: async (_customerId: number, popbillUserId: string) => {
      updatedUserIds.push(popbillUserId);
      return buildCustomer({ popbillUserId });
    },
    updateCustomerPopbillState: async (_customerId: number, state: Customer["popbillState"]) =>
      buildCustomer({
        popbillState: state,
        popbillUserId: updatedUserIds.at(-1) ?? customer.popbillUserId
      }),
    createLog: async (level: string, scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as AppStore;

  const result = await autoJoinCustomerPopbill(
    store,
    customer,
    async () => buildSettings(),
    (_error, fallbackMessage) => fallbackMessage ?? "fallback",
    {
      checkIsMember: async () => false,
      joinMember: async () => {
        joinAttempts += 1;
        if (joinAttempts === 1) {
          throw new PopbillApiError("join-member", "-99003200", "회원아이디 중복");
        }
      }
    }
  );

  assert.equal(result.status, "joined");
  assert.deepEqual(updatedUserIds, ["TEST_003_2"]);
  assert.equal(logs[0]?.message, "팝빌 회원 아이디 충돌 가능성으로 다른 아이디로 자동 재시도합니다.");
  assert.deepEqual(logs[0]?.context, {
    customerId: 3,
    issueMode: "review",
    attempt: 2,
    popbillUserId: "TEST_003_2",
    error: "회원아이디 중복",
    errorCategory: "external-api",
    errorOperation: "join-member",
    errorCode: "-99003200",
    retryReason: "user-id-conflict"
  });
});
