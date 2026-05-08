import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerContractRenewalWorkbookFileName,
  buildCustomerContractRenewalWorksheetRows,
  downloadCustomerContractRenewalsWorkbook,
  formatContractRenewalStatus
} from "./customerContractRenewals";
import type { CustomerContractRenewalDueItem } from "../../types";

const dueItem: CustomerContractRenewalDueItem = {
  customerId: 1,
  customerName: "홍길동",
  corpName: "태양발전",
  businessNumber: "1234567890",
  renewalContactMobile: "010-0000-0000",
  contractStartMonth: "2026-05",
  contractEndMonth: "2027-05",
  nextContractStartMonth: "2027-06",
  nextContractEndMonth: "2028-06",
  status: "overdue"
};

test("customer contract renewal labels match Home status wording", () => {
  assert.equal(formatContractRenewalStatus("due_this_month"), "이번 달");
  assert.equal(formatContractRenewalStatus("overdue"), "미완료");
});

test("customer contract renewal export builds the fixed column order", () => {
  assert.deepEqual(buildCustomerContractRenewalWorksheetRows([dueItem]), [
    [
      "상호명",
      "대표자명",
      "사업자등록번호",
      "연락처",
      "계약시작월",
      "계약종료월",
      "다음계약시작월",
      "다음계약종료월",
      "상태"
    ],
    ["태양발전", "홍길동", "1234567890", "010-0000-0000", "2026-05", "2027-05", "2027-06", "2028-06", "미완료"]
  ]);
});

test("customer contract renewal export writes the requested sheet and KST filename", () => {
  const calls: {
    rows?: Array<Array<unknown>>;
    sheetName?: string;
    fileName?: string;
  } = {};
  const fakeXlsx = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: (rows: Array<Array<unknown>>) => {
        calls.rows = rows;
        return {};
      },
      book_append_sheet: (_workbook: unknown, _worksheet: unknown, sheetName: string) => {
        calls.sheetName = sheetName;
      }
    },
    writeFile: (_workbook: unknown, fileName: string) => {
      calls.fileName = fileName;
    }
  } as unknown as typeof import("@e965/xlsx");

  const fileName = downloadCustomerContractRenewalsWorkbook(fakeXlsx, [dueItem], {
    now: new Date("2027-03-31T15:00:00.000Z")
  });

  assert.equal(fileName, "AUTO-TAX_갱신고객_2027-04.xlsx");
  assert.equal(buildCustomerContractRenewalWorkbookFileName(new Date("2027-03-31T15:00:00.000Z")), fileName);
  assert.equal(calls.fileName, fileName);
  assert.equal(calls.sheetName, "갱신 고객");
  assert.equal(calls.rows?.length, 2);
});
