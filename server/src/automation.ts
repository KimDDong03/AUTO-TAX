import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import { issueTaxInvoice } from "./popbill-client.js";
import type { AppStore } from "./store-contract.js";
import { formatWriteDate } from "./utils.js";

export async function issueDraftNow(store: AppStore, settings: AppSettings, customer: Customer, draft: InvoiceDraft): Promise<InvoiceDraft> {
  const writeDate = new Date();
  const response = await issueTaxInvoice(settings, customer, draft, writeDate);
  return await store.updateDraftStatus(
    draft.id,
    "issued",
    "",
    formatWriteDate(writeDate),
    response,
    settings.popbillIsTest ? "test" : "production"
  );
}
