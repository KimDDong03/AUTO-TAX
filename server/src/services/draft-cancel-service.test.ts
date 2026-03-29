import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings, Customer, InvoiceDraft } from "../domain.js";
import { PopbillApiError } from "../popbill-client.js";
import {
  cancelIssuedDraftWithRecovery,
  getPopbillTaxInvoiceStateCode,
  isCanceledPopbillTaxInvoice
} from "./draft-cancel-service.js";

const baseSettings = {
  popbillIsTest: true
} as AppSettings;

const baseCustomer = {
  id: 8,
  businessNumber: "123-45-67890",
  popbillUserId: "TEST_008"
} as Customer;

const baseDraft = {
  id: 6,
  customerId: 8,
  popbillMgtKey: "C8-202602-1"
} as InvoiceDraft;

test("getPopbillTaxInvoiceStateCode reads numeric and string state codes", () => {
  assert.equal(getPopbillTaxInvoiceStateCode({ stateCode: 600 }), 600);
  assert.equal(getPopbillTaxInvoiceStateCode({ stateCode: "600" }), 600);
  assert.equal(getPopbillTaxInvoiceStateCode({ stateCode: "abc" }), null);
  assert.equal(getPopbillTaxInvoiceStateCode(null), null);
});

test("isCanceledPopbillTaxInvoice matches canceled state code", () => {
  assert.equal(isCanceledPopbillTaxInvoice({ stateCode: 600 }), true);
  assert.equal(isCanceledPopbillTaxInvoice({ stateCode: 300 }), false);
});

test("cancelIssuedDraftWithRecovery returns normal result when cancel succeeds", async () => {
  let infoCalls = 0;
  const result = await cancelIssuedDraftWithRecovery(baseSettings, baseCustomer, baseDraft, "memo", {
    cancelTaxInvoiceFn: async () => ({ code: 1, message: "ok" }),
    getTaxInvoiceInfoFn: async () => {
      infoCalls += 1;
      return { stateCode: 600 };
    }
  });

  assert.equal(result.status, "canceled");
  assert.deepEqual(result.response, { code: 1, message: "ok" });
  assert.equal(infoCalls, 0);
});

test("cancelIssuedDraftWithRecovery reconciles already canceled documents", async () => {
  const result = await cancelIssuedDraftWithRecovery(baseSettings, baseCustomer, baseDraft, "memo", {
    cancelTaxInvoiceFn: async () => {
      throw new PopbillApiError("invoice-cancel", "-11002030", "이미 취소된 문서입니다.");
    },
    getTaxInvoiceInfoFn: async () => ({
      stateCode: 600,
      stateMemo: "AUTO-TAX 재발행 테스트 취소"
    })
  });

  assert.equal(result.status, "already-canceled");
  assert.deepEqual(result.response, {
    code: 1,
    message: "팝빌에서 이미 취소된 문서로 확인되어 재발행 대기로 복구했습니다.",
    recovered: true,
    stateCode: 600,
    stateMemo: "AUTO-TAX 재발행 테스트 취소"
  });
  assert.deepEqual(result.popbillInfo, {
    stateCode: 600,
    stateMemo: "AUTO-TAX 재발행 테스트 취소"
  });
});

test("cancelIssuedDraftWithRecovery rethrows original error when info is not canceled", async () => {
  const originalError = new PopbillApiError("invoice-cancel", "-11002030", "취소할 수 없는 상태입니다.");

  await assert.rejects(
    () =>
      cancelIssuedDraftWithRecovery(baseSettings, baseCustomer, baseDraft, "memo", {
        cancelTaxInvoiceFn: async () => {
          throw originalError;
        },
        getTaxInvoiceInfoFn: async () => ({ stateCode: 300 })
      }),
    (error: unknown) => {
      assert.equal(error, originalError);
      return true;
    }
  );
});
