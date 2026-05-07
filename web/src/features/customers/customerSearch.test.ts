import test from "node:test";
import assert from "node:assert/strict";
import type { Customer } from "../../types";
import { matchesCustomerSearchQuery } from "./customerSearch";

function createCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    customerName: "홍계정 발전소",
    businessNumber: "1903401587",
    corpName: "홍계정발전소",
    ceoName: "홍길동",
    addr: "서울",
    bizType: "",
    bizClass: "",
    popbillUserId: "",
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
    ...overrides
  };
}

test("matchesCustomerSearchQuery keeps direct name and business number search", () => {
  const customer = createCustomer();

  assert.equal(matchesCustomerSearchQuery(customer, "홍계정"), true);
  assert.equal(matchesCustomerSearchQuery(customer, "1903401587"), true);
  assert.equal(matchesCustomerSearchQuery(customer, "없는이름"), false);
});

test("matchesCustomerSearchQuery supports Korean initial consonant search for customer names", () => {
  const customer = createCustomer({ customerName: "한찬회 발전소", corpName: "한찬회발전소" });

  assert.equal(matchesCustomerSearchQuery(customer, "ㅎㅊㅎ"), true);
  assert.equal(matchesCustomerSearchQuery(customer, "ㅎ ㅊ ㅎ"), true);
  assert.equal(matchesCustomerSearchQuery(customer, "ㅎㄱㅈ"), false);
});

test("matchesCustomerSearchQuery does not treat full Hangul queries as initials-only search", () => {
  const customer = createCustomer({ customerName: "한글자 발전소", corpName: "한글자발전소" });

  assert.equal(matchesCustomerSearchQuery(customer, "홍계정"), false);
});

test("matchesCustomerSearchQuery supports scoped customer search fields", () => {
  const customer = createCustomer({
    corpName: "햇살 발전소",
    customerName: "김대표",
    businessNumber: "1234567890",
    renewalContactMobile: "010-3357-7797"
  });

  assert.equal(matchesCustomerSearchQuery(customer, "햇살", "corpName"), true);
  assert.equal(matchesCustomerSearchQuery(customer, "김대표", "corpName"), false);
  assert.equal(matchesCustomerSearchQuery(customer, "김대표", "customerName"), true);
  assert.equal(matchesCustomerSearchQuery(customer, "123-45-67890", "businessNumber"), true);
  assert.equal(matchesCustomerSearchQuery(customer, "01033577797", "phone"), true);
});

test("matchesCustomerSearchQuery supports issued billing month search", () => {
  const customer = createCustomer();

  assert.equal(matchesCustomerSearchQuery(customer, "2026-05", "issueMonth", ["2026-05"]), true);
  assert.equal(matchesCustomerSearchQuery(customer, "2026년 5월", "issueMonth", ["2026-05"]), true);
  assert.equal(matchesCustomerSearchQuery(customer, "2026년 4월", "issueMonth", ["2026-05"]), false);
});
