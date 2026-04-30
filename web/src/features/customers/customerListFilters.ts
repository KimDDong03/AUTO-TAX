import type { Customer, CustomerContractRenewalDueItem, InvoiceDraft } from "../../types";

export type CustomerListFilter = "all" | "unissued" | "certificate-expiration" | "contract-expiration";
export type CustomerIssueModeFilter = "all" | Customer["issueMode"];

export type CustomerListFilterContext = {
  currentBillingMonth: string;
  issuedCustomerIds: Set<number>;
  certificateExpirationCustomerIds: Set<number>;
  contractRenewalCustomerIds: Set<number>;
};

export function getCurrentSeoulBillingMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return year && month ? `${year}-${month}` : "";
}

export function buildIssuedDraftsByCustomerId(drafts: InvoiceDraft[]): Map<number, InvoiceDraft[]> {
  const issuedDraftsByCustomerId = new Map<number, InvoiceDraft[]>();

  for (const draft of drafts) {
    if (draft.status !== "issued") continue;
    const customerDrafts = issuedDraftsByCustomerId.get(draft.customerId) ?? [];
    customerDrafts.push(draft);
    if (!issuedDraftsByCustomerId.has(draft.customerId)) {
      issuedDraftsByCustomerId.set(draft.customerId, customerDrafts);
    }
  }

  return issuedDraftsByCustomerId;
}

export function buildCustomerListFilterContext(input: {
  currentBillingMonth?: string;
  issuedDraftsByCustomerId: Map<number, InvoiceDraft[]>;
  expiredCertCustomers: Customer[];
  expiringSoonCustomers: Customer[];
  contractRenewalDueItems: CustomerContractRenewalDueItem[];
}): CustomerListFilterContext {
  const currentBillingMonth = input.currentBillingMonth ?? getCurrentSeoulBillingMonth();
  const issuedCustomerIds = new Set<number>();
  const certificateExpirationCustomerIds = new Set<number>();
  const contractRenewalCustomerIds = new Set<number>();

  if (currentBillingMonth) {
    input.issuedDraftsByCustomerId.forEach((drafts, customerId) => {
      if (drafts.some((draft) => draft.billingMonth === currentBillingMonth)) {
        issuedCustomerIds.add(customerId);
      }
    });
  }

  for (const customer of input.expiredCertCustomers) {
    certificateExpirationCustomerIds.add(customer.id);
  }
  for (const customer of input.expiringSoonCustomers) {
    certificateExpirationCustomerIds.add(customer.id);
  }
  for (const item of input.contractRenewalDueItems) {
    contractRenewalCustomerIds.add(item.customerId);
  }

  return {
    currentBillingMonth,
    issuedCustomerIds,
    certificateExpirationCustomerIds,
    contractRenewalCustomerIds
  };
}

export function matchesCustomerListFilter(
  customer: Customer,
  filter: CustomerListFilter,
  context: CustomerListFilterContext
): boolean {
  if (filter === "unissued") {
    return Boolean(context.currentBillingMonth) && !context.issuedCustomerIds.has(customer.id);
  }

  if (filter === "certificate-expiration") {
    return context.certificateExpirationCustomerIds.has(customer.id);
  }

  if (filter === "contract-expiration") {
    return context.contractRenewalCustomerIds.has(customer.id);
  }

  return true;
}

export function matchesCustomerIssueModeFilter(customer: Customer, filter: CustomerIssueModeFilter): boolean {
  return filter === "all" || customer.issueMode === filter;
}
