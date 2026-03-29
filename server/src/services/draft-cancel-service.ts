import type { AppSettings, Customer, InvoiceDraft } from "../domain.js";
import { cancelTaxInvoice, getTaxInvoiceInfo } from "../popbill-client.js";

const POPBILL_TAX_INVOICE_STATE_CANCELED = 600;

export type CancelIssuedDraftResult = {
  response: unknown;
  status: "canceled" | "already-canceled";
  popbillInfo?: unknown;
};

type CancelIssuedDraftDeps = {
  cancelTaxInvoiceFn?: typeof cancelTaxInvoice;
  getTaxInvoiceInfoFn?: typeof getTaxInvoiceInfo;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getPopbillTaxInvoiceStateCode(info: unknown): number | null {
  if (!info || typeof info !== "object") {
    return null;
  }

  return asNumber((info as { stateCode?: unknown }).stateCode);
}

export function isCanceledPopbillTaxInvoice(info: unknown): boolean {
  return getPopbillTaxInvoiceStateCode(info) === POPBILL_TAX_INVOICE_STATE_CANCELED;
}

function buildRecoveredCancelResponse(info: unknown): Record<string, unknown> {
  const stateMemo = info && typeof info === "object" ? asString((info as { stateMemo?: unknown }).stateMemo) : null;
  return {
    code: 1,
    message: "팝빌에서 이미 취소된 문서로 확인되어 재발행 대기로 복구했습니다.",
    recovered: true,
    stateCode: getPopbillTaxInvoiceStateCode(info),
    stateMemo
  };
}

export async function cancelIssuedDraftWithRecovery(
  settings: AppSettings,
  customer: Customer,
  draft: InvoiceDraft,
  memo: string,
  deps: CancelIssuedDraftDeps = {}
): Promise<CancelIssuedDraftResult> {
  const cancelTaxInvoiceFn = deps.cancelTaxInvoiceFn ?? cancelTaxInvoice;
  const getTaxInvoiceInfoFn = deps.getTaxInvoiceInfoFn ?? getTaxInvoiceInfo;

  try {
    const response = await cancelTaxInvoiceFn(settings, customer, draft, memo);
    return {
      response,
      status: "canceled"
    };
  } catch (error) {
    const info = await getTaxInvoiceInfoFn(settings, customer, draft).catch(() => null);
    if (!isCanceledPopbillTaxInvoice(info)) {
      throw error;
    }

    return {
      response: buildRecoveredCancelResponse(info),
      status: "already-canceled",
      popbillInfo: info ?? undefined
    };
  }
}
