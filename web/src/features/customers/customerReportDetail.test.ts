import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCustomerReportTotals,
  createEmptyCustomerReportDetail,
  deriveContractEndMonth,
  formatCustomerReportIssueDay,
  normalizeCustomerReportDetail,
  parseCustomerReportIssueDay,
  toCustomerReportDetailInput
} from "./customerReportDetail";

test("deriveContractEndMonth returns the same month one year after the start month", () => {
  assert.equal(deriveContractEndMonth("2026-01"), "2027-01");
  assert.equal(deriveContractEndMonth("2026-12"), "2027-12");
  assert.equal(deriveContractEndMonth(null), null);
});

test("calculateCustomerReportTotals computes first half, second half, and annual sums", () => {
  const detail = createEmptyCustomerReportDetail(1, 2026);
  detail.months[0] = {
    ...detail.months[0],
    supplyAmount: 1000,
    vatAmount: 100,
    totalAmount: 1100
  };
  detail.months[6] = {
    ...detail.months[6],
    supplyAmount: 2000,
    vatAmount: 200,
    totalAmount: 2200
  };

  assert.deepEqual(calculateCustomerReportTotals(detail.months), {
    firstHalf: 1100,
    secondHalf: 2200,
    annual: 3300,
    supply: 3000,
    vat: 300
  });
});

test("normalizeCustomerReportDetail pads months and recomputes total amount", () => {
  const detail = normalizeCustomerReportDetail({
    ...createEmptyCustomerReportDetail(1, 2026),
    months: [
      {
        reportYear: 2026,
        reportMonth: 12,
        issueYear: 2026,
        issueDate: "2026-12-25",
        supplyAmount: 4000,
        vatAmount: 400,
        totalAmount: 0,
        createdAt: null,
        updatedAt: null
      }
    ]
  });

  assert.equal(detail.months.length, 12);
  assert.equal(detail.months[0].reportMonth, 1);
  assert.equal(detail.months[0].issueYear, 2026);
  assert.equal(detail.months[11].totalAmount, 4400);
});

test("customer report issue date helpers expose only issue day", () => {
  assert.equal(formatCustomerReportIssueDay("2026-02-10"), "10");
  assert.equal(formatCustomerReportIssueDay("2026-02-05"), "5");
  assert.equal(formatCustomerReportIssueDay(null), "");
  assert.deepEqual(parseCustomerReportIssueDay("10", 2026, 2), {
    dayText: "10",
    issueDate: "2026-02-10"
  });
  assert.deepEqual(parseCustomerReportIssueDay("5", 2026, 2), {
    dayText: "5",
    issueDate: "2026-02-05"
  });
  assert.equal(parseCustomerReportIssueDay("30", 2026, 2), null);
});

test("toCustomerReportDetailInput strips computed fields before save", () => {
  const detail = createEmptyCustomerReportDetail(1, 2026);
  detail.profile.contractStartMonth = "2026-01";
  detail.profile.contractEndMonth = "2026-12";
  detail.months[0] = {
    ...detail.months[0],
    supplyAmount: 1000,
    vatAmount: 100,
    totalAmount: 99999
  };

  assert.deepEqual(toCustomerReportDetailInput(detail).months[0], {
    reportMonth: 1,
    issueYear: 2026,
    issueDate: null,
    supplyAmount: 1000,
    vatAmount: 100
  });
  assert.equal(toCustomerReportDetailInput(detail).profile.contractEndMonth, "2027-01");
});
