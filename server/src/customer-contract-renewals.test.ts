import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerContractRenewalDueItem,
  calculateCompletedContractRenewalPeriod,
  CustomerContractRenewalConflictError,
  getCustomerContractPeriodStatus,
  getCurrentKstDate,
  getCurrentKstYearMonth
} from "./customer-contract-renewals.js";
import type { CustomerReportProfile } from "./domain.js";

function buildProfile(overrides: Partial<CustomerReportProfile> = {}): CustomerReportProfile {
  return {
    customerId: 1,
    certificateRenewalDate: null,
    hasPersonalGeneralCertificate: false,
    hasTaxInvoiceBusinessCertificate: false,
    solarCapacityKw: null,
    contractStartMonth: "2026-05",
    contractEndMonth: "2027-05",
    otherNote: "",
    createdAt: null,
    updatedAt: null,
    ...overrides
  };
}

const baseDueSource = {
  customerId: 1,
  customerName: "홍길동",
  corpName: "태양발전",
  businessNumber: "1234567890",
  renewalContactMobile: "010-0000-0000",
  contractStartMonth: "2026-04",
  contractEndMonth: "2027-04"
};

test("contract renewal due item includes contracts ending this month", () => {
  const item = buildCustomerContractRenewalDueItem(baseDueSource, "2027-04");

  assert.deepEqual(item, {
    customerId: 1,
    customerName: "홍길동",
    corpName: "태양발전",
    businessNumber: "1234567890",
    renewalContactMobile: "010-0000-0000",
    contractStartMonth: "2026-04",
    contractEndMonth: "2027-04",
    nextContractStartMonth: "2027-05",
    nextContractEndMonth: "2028-05",
    status: "due_this_month"
  });
});

test("contract renewal due item keeps overdue customers until completed", () => {
  const item = buildCustomerContractRenewalDueItem(baseDueSource, "2027-06");

  assert.equal(item?.status, "overdue");
  assert.equal(item?.contractEndMonth, "2027-04");
});

test("contract renewal due item accepts stored multi-year contract end months", () => {
  const item = buildCustomerContractRenewalDueItem(
    {
      ...baseDueSource,
      contractStartMonth: "2023-09",
      contractEndMonth: "2027-09"
    },
    "2027-09"
  );

  assert.equal(item?.status, "due_this_month");
  assert.equal(item?.contractStartMonth, "2023-09");
  assert.equal(item?.contractEndMonth, "2027-09");
});

test("contract renewal due item excludes future and invalid contract months", () => {
  assert.equal(buildCustomerContractRenewalDueItem(baseDueSource, "2027-03"), null);
  assert.equal(buildCustomerContractRenewalDueItem({ ...baseDueSource, contractStartMonth: null }, "2027-04"), null);
  assert.equal(buildCustomerContractRenewalDueItem({ ...baseDueSource, contractStartMonth: "2026-99" }, "2027-04"), null);
  assert.equal(buildCustomerContractRenewalDueItem({ ...baseDueSource, contractEndMonth: null }, "2027-04"), null);
  assert.equal(buildCustomerContractRenewalDueItem({ ...baseDueSource, contractEndMonth: "2027-99" }, "2027-04"), null);
  assert.equal(buildCustomerContractRenewalDueItem({ ...baseDueSource, contractEndMonth: "2027-05" }, "2027-04"), null);
});

test("complete contract renewal advances old end by one month and derives the new end", () => {
  const period = calculateCompletedContractRenewalPeriod(buildProfile(), "2027-05");

  assert.deepEqual(period, {
    oldContractStartMonth: "2026-05",
    oldContractEndMonth: "2027-05",
    newContractStartMonth: "2027-06",
    newContractEndMonth: "2028-06"
  });
});

test("complete contract renewal rejects stale expected contract end month", () => {
  assert.throws(
    () => calculateCompletedContractRenewalPeriod(buildProfile(), "2027-04"),
    CustomerContractRenewalConflictError
  );
});

test("current KST month uses Seoul calendar boundaries", () => {
  assert.equal(getCurrentKstYearMonth(new Date("2027-03-31T15:00:00.000Z")), "2027-04");
});

test("current KST date uses Seoul calendar boundaries", () => {
  assert.equal(getCurrentKstDate(new Date("2027-03-31T15:00:00.000Z")), "2027-04-01");
});

test("customer contract period status is derived from current date", () => {
  assert.equal(getCustomerContractPeriodStatus("2019-09-27", "2023-09-26", "2026-05-15"), "expired");
  assert.equal(getCustomerContractPeriodStatus("2023-09-27", "2027-09-27", "2026-05-15"), "active");
  assert.equal(getCustomerContractPeriodStatus("2027-09-28", "2031-09-27", "2026-05-15"), "scheduled");
});
