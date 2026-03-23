import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import { issueTaxInvoice } from "./popbill-client.js";
import { Store } from "./store.js";
import { formatWriteDate } from "./utils.js";

export async function issueDraftNow(store: Store, settings: AppSettings, customer: Customer, draft: InvoiceDraft): Promise<InvoiceDraft> {
  const writeDate = new Date();
  const response = await issueTaxInvoice(settings, customer, draft, writeDate);
  return store.updateDraftStatus(draft.id, "issued", "", formatWriteDate(writeDate), response);
}
