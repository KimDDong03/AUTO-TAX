import assert from "node:assert/strict";
import test from "node:test";
import type { Customer, CustomerInput, LogEntry } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import { commitCustomerImport, normalizeCustomerImportRow, type CustomerImportPreviewResult } from "./customer-import-service.js";

test("normalizeCustomerImportRow trims mapped customer import cells", () => {
  assert.deepEqual(
    normalizeCustomerImportRow({
      rowIndex: 3,
      customerName: "  홍길동  ",
      businessNumber: " 123-45-67890 ",
      corpName: "  테스트상호 ",
      addr: "  서울특별시 강남구 테헤란로 123 "
    }),
    {
      rowIndex: 3,
      customerName: "홍길동",
      businessNumber: "123-45-67890",
      corpName: "테스트상호",
      addr: "서울특별시 강남구 테헤란로 123"
    }
  );
});

test("commitCustomerImport saves importable rows and reports blocked or failed rows", async () => {
  const savedPayloads: CustomerInput[] = [];
  const logs: Array<{ level: LogEntry["level"]; scope: string; message: string; context: unknown }> = [];
  const requestStore = {
    saveCustomer: async (input: CustomerInput) => {
      savedPayloads.push(input);
      if (String(input.customerName).includes("실패")) {
        throw new Error("의도한 저장 실패");
      }
      return {
        id: savedPayloads.length,
        customerName: String(input.customerName),
        businessNumber: String(input.businessNumber),
        corpName: String(input.corpName),
        ceoName: String(input.ceoName),
        addr: String(input.addr),
        bizType: String(input.bizType),
        bizClass: String(input.bizClass),
        popbillUserId: "",
        popbillPassword: "",
        popbillState: "pending",
        popbillCertRegistered: false,
        popbillCertExpireDate: null,
        issueMode: "review",
        issueDay: null,
        issueHour: null,
        issueMinute: null,
        memo: "",
        mobileNumber: "",
        plantNames: [],
        matchAddresses: [String(input.addr)],
        createdAt: "2026-03-28T00:00:00.000Z",
        updatedAt: "2026-03-28T00:00:00.000Z"
      } as unknown as Customer;
    },
    createLog: async (level: LogEntry["level"], scope: string, message: string, context?: unknown) => {
      logs.push({ level, scope, message, context });
    }
  } as unknown as Pick<AppStore, "saveCustomer" | "createLog"> as AppStore;

  const preview: CustomerImportPreviewResult = {
    totalRows: 3,
    importableRows: 2,
    blockedRows: 1,
    rows: [
      {
        rowIndex: 2,
        customerName: "정상 고객",
        businessNumber: "1234567890",
        corpName: "정상 상호",
        addr: "서울특별시 강남구 테헤란로 123",
        normalizedBusinessNumber: "1234567890",
        normalizedAddress: "서울특별시강남구테헤란로123",
        errors: [],
        canImport: true
      },
      {
        rowIndex: 3,
        customerName: "실패 고객",
        businessNumber: "2234567890",
        corpName: "실패 상호",
        addr: "부산광역시 해운대구 센텀중앙로 97",
        normalizedBusinessNumber: "2234567890",
        normalizedAddress: "부산광역시해운대구센텀중앙로97",
        errors: [],
        canImport: true
      },
      {
        rowIndex: 4,
        customerName: "차단 고객",
        businessNumber: "3234567890",
        corpName: "차단 상호",
        addr: "대전광역시 유성구 대학로 99",
        normalizedBusinessNumber: "3234567890",
        normalizedAddress: "대전광역시유성구대학로99",
        errors: ["이미 등록된 고객의 사업자번호입니다."],
        canImport: false
      }
    ]
  };

  const result = await commitCustomerImport(requestStore, preview);

  assert.equal(result.successCount, 1);
  assert.equal(result.failedCount, 2);
  assert.deepEqual(
    result.failedRows,
    [
      { rowIndex: 4, message: "이미 등록된 고객의 사업자번호입니다." },
      { rowIndex: 3, message: "의도한 저장 실패" }
    ]
  );
  assert.equal(savedPayloads.length, 2);
  assert.equal(savedPayloads[0]?.bizType, "전기업");
  assert.equal(savedPayloads[0]?.bizClass, "태양광발전(자가용PPA)");
  assert.equal(savedPayloads[0]?.mobileNumber, "");
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.scope, "customer-import");
});
