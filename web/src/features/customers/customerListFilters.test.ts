import test from "node:test";
import assert from "node:assert/strict";
import type { Customer, CustomerContractRenewalDueItem, InvoiceDraft } from "../../types";
import {
  buildCustomerListFilterContext,
  buildIssuedDraftsByCustomerId,
  getCurrentSeoulBillingMonth,
  matchesCustomerListFilter
} from "./customerListFilters";

function createCustomer(id: number, overrides: Partial<Customer> = {}): Customer {
  return {
    id,
    customerName: `고객 ${id}`,
    businessNumber: `12082000${id}`,
    corpName: `고객 ${id} 발전소`,
    ceoName: `대표 ${id}`,
    addr: "서울",
    bizType: "",
    bizClass: "",
    popbillUserId: "",
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
    ...overrides
  };
}

function createIssuedDraft(customerId: number, billingMonth: string, overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return {
    id: customerId * 10,
    customerId,
    customerName: `고객 ${customerId}`,
    sourceMessageId: customerId,
    issueMode: "review",
    status: "issued",
    scheduledFor: null,
    issueRequestedAt: null,
    issuedAt: "2026-04-20T00:00:00.000Z",
    issueError: "",
    billingMonth,
    writeDate: null,
    itemName: "",
    plantName: "",
    supplyCost: 0,
    taxTotal: 0,
    totalAmount: 0,
    kepcoCorpNum: "",
    kepcoBranchId: "",
    kepcoCorpName: "",
    kepcoCeoName: "",
    kepcoAddr: "",
    kepcoBizType: "",
    kepcoBizClass: "",
    popbillMgtKey: "",
    popbillEnvironment: null,
    popbillResultJson: "",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    ...overrides
  };
}

function createContractDueItem(customerId: number): CustomerContractRenewalDueItem {
  return {
    customerId,
    customerName: `고객 ${customerId}`,
    corpName: `고객 ${customerId} 발전소`,
    businessNumber: `12082000${customerId}`,
    renewalContactMobile: "",
    contractStartMonth: "2025-04",
    contractEndMonth: "2026-04",
    nextContractStartMonth: "2026-04",
    nextContractEndMonth: "2027-04",
    status: "due_this_month"
  };
}

test("getCurrentSeoulBillingMonth formats the month in Seoul time", () => {
  assert.equal(getCurrentSeoulBillingMonth(new Date("2026-03-31T15:01:00.000Z")), "2026-04");
});

test("matchesCustomerListFilter keeps all customers for the all chip", () => {
  const customers = [createCustomer(1), createCustomer(2)];
  const context = buildCustomerListFilterContext({
    currentBillingMonth: "2026-04",
    issuedDraftsByCustomerId: new Map(),
    expiredCertCustomers: [],
    expiringSoonCustomers: [],
    contractRenewalDueItems: []
  });

  assert.deepEqual(
    customers.filter((customer) => matchesCustomerListFilter(customer, "all", context)).map((customer) => customer.id),
    [1, 2]
  );
});

test("matchesCustomerListFilter finds current-month unissued customers", () => {
  const currentMonthDraft = createIssuedDraft(1, "2026-04");
  const previousMonthDraft = createIssuedDraft(2, "2026-03");
  const context = buildCustomerListFilterContext({
    currentBillingMonth: "2026-04",
    issuedDraftsByCustomerId: buildIssuedDraftsByCustomerId([currentMonthDraft, previousMonthDraft]),
    expiredCertCustomers: [],
    expiringSoonCustomers: [],
    contractRenewalDueItems: []
  });

  assert.equal(matchesCustomerListFilter(createCustomer(1), "unissued", context), false);
  assert.equal(matchesCustomerListFilter(createCustomer(2), "unissued", context), true);
  assert.equal(matchesCustomerListFilter(createCustomer(3), "unissued", context), true);
});

test("matchesCustomerListFilter uses certificate and contract due customer sets", () => {
  const expiredCustomer = createCustomer(3);
  const expiringCustomer = createCustomer(4);
  const context = buildCustomerListFilterContext({
    currentBillingMonth: "2026-04",
    issuedDraftsByCustomerId: new Map(),
    expiredCertCustomers: [expiredCustomer],
    expiringSoonCustomers: [expiringCustomer],
    contractRenewalDueItems: [createContractDueItem(2)]
  });

  assert.equal(matchesCustomerListFilter(createCustomer(2), "contract-expiration", context), true);
  assert.equal(matchesCustomerListFilter(createCustomer(3), "certificate-expiration", context), true);
  assert.equal(matchesCustomerListFilter(createCustomer(4), "certificate-expiration", context), true);
  assert.equal(matchesCustomerListFilter(createCustomer(1), "contract-expiration", context), false);
  assert.equal(matchesCustomerListFilter(createCustomer(1), "certificate-expiration", context), false);
});
