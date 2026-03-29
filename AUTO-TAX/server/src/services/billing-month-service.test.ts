import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedMail } from "../domain.js";
import { buildCompletedBillingMonthSet } from "./billing-month-service.js";

function createParsedMail(billingMonth: string): ParsedMail {
  return {
    originalFrom: "",
    plantName: "",
    plantAddress: "",
    billingMonth,
    supplyCost: 0,
    taxTotal: 0,
    totalAmount: 0,
    itemName: "",
    kepcoCorpNum: "",
    kepcoBranchId: "",
    kepcoCorpName: "",
    kepcoCeoName: "",
    kepcoAddr: "",
    kepcoBizType: "",
    kepcoBizClass: "",
    recipientEmail: "",
    rawText: ""
  };
}

test("buildCompletedBillingMonthSet auto-completes month when all drafts are issued", () => {
  const completed = buildCompletedBillingMonthSet({
    manualCompletedMonths: [],
    drafts: [
      { billingMonth: "2026-03", status: "issued" },
      { billingMonth: "2026-03", status: "issued" }
    ],
    inbox: [
      { parseStatus: "parsed", parsedData: createParsedMail("2026-03"), draftId: 1 },
      { parseStatus: "duplicate", parsedData: createParsedMail("2026-03"), draftId: 2 }
    ]
  });

  assert.deepEqual([...completed], ["2026-03"]);
});

test("buildCompletedBillingMonthSet keeps month incomplete when unresolved mail exists", () => {
  const completed = buildCompletedBillingMonthSet({
    manualCompletedMonths: [],
    drafts: [{ billingMonth: "2026-03", status: "issued" }],
    inbox: [{ parseStatus: "unmatched", parsedData: createParsedMail("2026-03"), draftId: null }]
  });

  assert.deepEqual([...completed], []);
});

test("buildCompletedBillingMonthSet preserves manually completed months", () => {
  const completed = buildCompletedBillingMonthSet({
    manualCompletedMonths: [{ billingMonth: "2026-01" }],
    drafts: [],
    inbox: []
  });

  assert.deepEqual([...completed], ["2026-01"]);
});
