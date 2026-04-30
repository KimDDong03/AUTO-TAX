import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyCustomerReportMonth,
  deriveContractEndMonth,
  ensureCustomerReportDetailMonths,
  normalizeCustomerReportDetailInput
} from "./customer-report-detail.js";

test("deriveContractEndMonth returns the same month one year after the start month", () => {
  assert.equal(deriveContractEndMonth("2026-01"), "2027-01");
  assert.equal(deriveContractEndMonth("2026-12"), "2027-12");
  assert.equal(deriveContractEndMonth(null), null);
});

test("normalizeCustomerReportDetailInput pads missing months to 12 rows", () => {
  const detail = normalizeCustomerReportDetailInput({
    reportYear: 2026,
    profile: {
      certificateRenewalDate: "",
      hasPersonalGeneralCertificate: true,
      hasTaxInvoiceBusinessCertificate: false,
      solarCapacityKw: 99.5,
      contractStartMonth: "2026-01",
      contractEndMonth: "",
      otherNote: "  memo  "
    },
    months: [
      {
        reportMonth: 3,
        issueYear: 2026,
        issueDate: "2026-04-10",
        supplyAmount: 1000,
        vatAmount: 100
      }
    ]
  });

  assert.equal(detail.months.length, 12);
  assert.deepEqual(detail.months[0], {
    reportMonth: 1,
    issueYear: 2026,
    issueDate: null,
    supplyAmount: 0,
    vatAmount: 0
  });
  assert.deepEqual(detail.months[2], {
    reportMonth: 3,
    issueYear: 2026,
    issueDate: "2026-04-10",
    supplyAmount: 1000,
    vatAmount: 100
  });
  assert.equal(detail.profile.otherNote, "memo");
  assert.equal(detail.profile.certificateRenewalDate, null);
  assert.equal(detail.profile.contractEndMonth, "2027-01");
});

test("normalizeCustomerReportDetailInput rejects duplicate months", () => {
  assert.throws(
    () =>
      normalizeCustomerReportDetailInput({
        reportYear: 2026,
        profile: {
          certificateRenewalDate: null,
          hasPersonalGeneralCertificate: false,
          hasTaxInvoiceBusinessCertificate: false,
          solarCapacityKw: null,
          contractStartMonth: null,
          contractEndMonth: null,
          otherNote: ""
        },
        months: [
          {
            reportMonth: 1,
            issueYear: null,
            issueDate: null,
            supplyAmount: 0,
            vatAmount: 0
          },
          {
            reportMonth: 1,
            issueYear: null,
            issueDate: null,
            supplyAmount: 0,
            vatAmount: 0
          }
        ]
      }),
    /중복/
  );
});

test("ensureCustomerReportDetailMonths fills missing persisted rows with computed totals", () => {
  const detail = ensureCustomerReportDetailMonths({
    customerId: 7,
    reportYear: 2026,
    profile: {
      customerId: 7,
      certificateRenewalDate: null,
      hasPersonalGeneralCertificate: false,
      hasTaxInvoiceBusinessCertificate: false,
      solarCapacityKw: null,
      contractStartMonth: null,
      contractEndMonth: null,
      otherNote: "",
      createdAt: null,
      updatedAt: null
    },
    months: [
      {
        ...createEmptyCustomerReportMonth(2026, 12),
        supplyAmount: 2000,
        vatAmount: 200,
        totalAmount: 2200
      }
    ]
  });

  assert.equal(detail.months.length, 12);
  assert.equal(detail.months[0].reportMonth, 1);
  assert.equal(detail.months[11].totalAmount, 2200);
});
