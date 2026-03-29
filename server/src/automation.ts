import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import { issueTaxInvoice } from "./popbill-client.js";
import type { AppStore } from "./store-contract.js";
import { formatWriteDate } from "./utils.js";

type IssueDraftNowDeps = {
  issueTaxInvoiceFn?: typeof issueTaxInvoice;
  resolveDraftWriteDateFn?: typeof resolveDraftWriteDate;
};

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

export async function resolveDraftWriteDate(store: AppStore, draft: InvoiceDraft): Promise<Date> {
  const sourceMessage = await store.getInboxMessage(draft.sourceMessageId);
  if (sourceMessage) {
    const receivedAt = new Date(sourceMessage.receivedAt);
    if (isValidDate(receivedAt)) {
      return receivedAt;
    }
  }

  return new Date();
}

export async function issueDraftNow(
  store: AppStore,
  settings: AppSettings,
  customer: Customer,
  draft: InvoiceDraft,
  deps: IssueDraftNowDeps = {}
): Promise<InvoiceDraft> {
  const writeDate = await (deps.resolveDraftWriteDateFn ?? resolveDraftWriteDate)(store, draft);
  const response = await (deps.issueTaxInvoiceFn ?? issueTaxInvoice)(settings, customer, draft, writeDate);
  return await store.updateDraftStatus(
    draft.id,
    "issued",
    "",
    formatWriteDate(writeDate, settings.timezone),
    response,
    settings.popbillIsTest ? "test" : "production"
  );
}
