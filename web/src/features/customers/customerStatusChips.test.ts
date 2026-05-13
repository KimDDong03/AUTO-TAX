import assert from "node:assert/strict";
import test from "node:test";
import type { Customer, CustomerContractRenewalDueItem, CustomerContractSummary } from "../../types";
import {
  buildCustomerContractStatusChip,
  buildCustomerIssueStatusChip
} from "./customerStatusChips";

function createCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    customerName: "홍길동",
    businessNumber: "1234567890",
    corpName: "테스트발전소",
    ceoName: "홍길동",
    addr: "서울",
    bizType: "발전",
    bizClass: "태양광",
    popbillUserId: "",
    popbillPassword: "",
    popbillState: "joined",
    popbillCertRegistered: true,
    popbillCertExpireDate: "2026-12-31",
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "",
    issueCompleteSmsTemplate: "",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides
  };
}

function createDueItem(overrides: Partial<CustomerContractRenewalDueItem> = {}): CustomerContractRenewalDueItem {
  return {
    customerId: 1,
    customerName: "홍길동",
    corpName: "테스트발전소",
    businessNumber: "1234567890",
    renewalContactMobile: "",
    contractStartMonth: "2025-05",
    contractEndMonth: "2026-05",
    nextContractStartMonth: "2026-06",
    nextContractEndMonth: "2027-06",
    status: "due_this_month",
    ...overrides
  };
}

test("buildCustomerIssueStatusChip hides internal registration wording", () => {
  const now = new Date("2026-05-13T00:00:00+09:00");

  assert.equal(
    buildCustomerIssueStatusChip(createCustomer({ popbillCertExpireDate: "2026-06-01" }), { canIssueNow: true }, now).label,
    "인증서 임박"
  );
  assert.equal(
    buildCustomerIssueStatusChip(createCustomer({ popbillCertExpireDate: "2026-05-01" }), { canIssueNow: false }, now).label,
    "인증서 만료"
  );
  assert.equal(
    buildCustomerIssueStatusChip(createCustomer({ popbillState: "pending", popbillCertRegistered: false }), { canIssueNow: false }, now).label,
    "인증서 필요"
  );
  assert.equal(
    buildCustomerIssueStatusChip(createCustomer({ popbillCertExpireDate: "2026-12-31" }), { canIssueNow: true }, now).label,
    "발행 가능"
  );
});

test("buildCustomerContractStatusChip distinguishes missing, due, overdue, and normal contracts", () => {
  const normalSummary: CustomerContractSummary = {
    customerId: 1,
    contractStartMonth: "2026-06",
    contractEndMonth: "2027-06"
  };

  assert.equal(buildCustomerContractStatusChip(null, null, "2026-05").label, "계약 미입력");
  assert.equal(buildCustomerContractStatusChip(normalSummary, null, "2026-05").label, "계약 정상");
  assert.equal(
    buildCustomerContractStatusChip({ ...normalSummary, contractStartMonth: "2025-05", contractEndMonth: "2026-05" }, null, "2026-05").label,
    "계약 임박"
  );
  assert.equal(
    buildCustomerContractStatusChip(
      { ...normalSummary, contractStartMonth: "2025-04", contractEndMonth: "2026-04" },
      createDueItem({ status: "overdue", contractEndMonth: "2026-04" }),
      "2026-05"
    ).label,
    "계약 만료"
  );
});
