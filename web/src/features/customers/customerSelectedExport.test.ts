import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSelectedCustomerBasicInfoRows,
  buildSelectedCustomerExportFileName,
  buildSelectedCustomerReportRows,
  downloadSelectedCustomersWorkbook,
  type SelectedCustomerExportItem
} from "./customerSelectedExport";
import { createEmptyCustomerReportDetail } from "./customerReportDetail";
import type { Customer } from "../../types";

function createCustomer(overrides: Partial<Customer>): Customer {
  return {
    id: 1,
    customerName: "홍성철",
    businessNumber: "1234567890",
    corpName: "홍성철 발전소",
    ceoName: "홍성철",
    addr: "강원특별자치도 원주시",
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
    renewalContactMobile: "010-1111-1111",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    ...overrides
  };
}

const firstReport = createEmptyCustomerReportDetail(1, 2026);
firstReport.profile.solarCapacityKw = 99.5;
firstReport.profile.contractStartMonth = "2025-04";
firstReport.months[0] = {
  ...firstReport.months[0],
  supplyAmount: 1000,
  vatAmount: 90,
  totalAmount: 0
};
firstReport.months[1] = {
  ...firstReport.months[1],
  supplyAmount: 1900000,
  vatAmount: 4910,
  totalAmount: 0
};

const secondReport = createEmptyCustomerReportDetail(2, 2026);
secondReport.profile.solarCapacityKw = 120;
secondReport.profile.contractStartMonth = "2025-05";
secondReport.profile.contractEndMonth = "2026-05";
secondReport.months[2] = {
  ...secondReport.months[2],
  supplyAmount: 2000,
  vatAmount: 200,
  totalAmount: 0
};

const exportItems: SelectedCustomerExportItem[] = [
  {
    customer: createCustomer({
      id: 1,
      customerName: "홍성철",
      corpName: "홍성철발전소",
      businessNumber: "1112233333",
      renewalContactMobile: "0120315",
      addr: "강원 원주시",
      bizType: "전기업",
      bizClass: "태양광발전",
      plantNames: ["홍성철 1호기", "홍성철 2호기"],
      matchAddresses: ["강원 원주시 신림면"],
      memo: "검수 후 발행"
    }),
    reportDetail: firstReport
  },
  {
    customer: createCustomer({
      id: 2,
      customerName: "홍계정",
      corpName: "홍계정발전소",
      businessNumber: "2223344444",
      renewalContactMobile: "010-2222-2222",
      addr: "충북 충주시",
      bizType: "전기업",
      bizClass: "발전업"
    }),
    reportDetail: secondReport
  }
];

test("selected customer export builds the basic info sheet in selected order", () => {
  assert.deepEqual(buildSelectedCustomerBasicInfoRows(exportItems), [
    [
      "순서",
      "대표자명",
      "상호명",
      "사업자등록번호",
      "전화번호",
      "사업장 주소",
      "업태",
      "업종",
      "태양광 용량 KW",
      "계약기간 시작",
      "계약기간 종료",
      "발전소명",
      "메일 매칭 주소",
      "메모"
    ],
    [
      1,
      "홍성철",
      "홍성철발전소",
      "1112233333",
      "0120315",
      "강원 원주시",
      "전기업",
      "태양광발전",
      99.5,
      "2025-04",
      "2026-04",
      "홍성철 1호기, 홍성철 2호기",
      "강원 원주시 신림면",
      "검수 후 발행"
    ],
    [
      2,
      "홍계정",
      "홍계정발전소",
      "2223344444",
      "010-2222-2222",
      "충북 충주시",
      "전기업",
      "발전업",
      120,
      "2025-05",
      "2026-05",
      "-",
      "-",
      "-"
    ]
  ]);
});

test("selected customer export uses monthly supply amount for the report sheet", () => {
  const rows = buildSelectedCustomerReportRows(exportItems);

  assert.deepEqual(rows[0], ["순서", "대표자명", "상호명", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]);
  assert.deepEqual(rows[1], [1, "홍성철", "홍성철발전소", 1000, 1900000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(rows[2], [2, "홍계정", "홍계정발전소", 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test("selected customer export writes the two requested workbook sheets", () => {
  const sheetNames: string[] = [];
  const calls: {
    fileName?: string;
    rows: Array<Array<unknown>>;
  } = {
    rows: []
  };
  const fakeXlsx = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: (rows: Array<Array<unknown>>) => {
        calls.rows = rows;
        return {};
      },
      book_append_sheet: (_workbook: unknown, _worksheet: unknown, sheetName: string) => {
        sheetNames.push(sheetName);
      },
      encode_cell: ({ r, c }: { r: number; c: number }) => `${r}:${c}`
    },
    writeFile: (_workbook: unknown, fileName: string) => {
      calls.fileName = fileName;
    }
  } as unknown as typeof import("xlsx");

  const fileName = downloadSelectedCustomersWorkbook(fakeXlsx, exportItems, {
    reportYear: 2026,
    now: new Date("2026-04-29T03:00:00.000Z")
  });

  assert.equal(fileName, "AUTO-TAX_선택고객_2026_2026-04-29.xlsx");
  assert.equal(buildSelectedCustomerExportFileName(2026, new Date("2026-04-29T03:00:00.000Z")), fileName);
  assert.deepEqual(sheetNames, ["고객 기본정보", "신고이력(공급가액)"]);
  assert.equal(calls.fileName, fileName);
  assert.equal(calls.rows.length, 3);
});
