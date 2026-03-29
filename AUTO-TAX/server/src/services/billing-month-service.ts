import type { CompletedBillingMonth, InboxMessage, InvoiceDraft } from "../domain.js";

type BillingMonthDraft = Pick<InvoiceDraft, "billingMonth" | "status">;
type BillingMonthInboxMessage = Pick<InboxMessage, "parseStatus" | "parsedData" | "draftId">;

function normalizeCompletedBillingMonth(item: Pick<CompletedBillingMonth, "billingMonth"> | string): string {
  return typeof item === "string" ? item : item.billingMonth;
}

function isBlockingInboxMessage(message: BillingMonthInboxMessage): boolean {
  if (message.parseStatus === "unmatched" || message.parseStatus === "failed") {
    return true;
  }

  if ((message.parseStatus === "parsed" || message.parseStatus === "duplicate") && message.draftId === null) {
    return true;
  }

  return false;
}

export function buildCompletedBillingMonthSet(args: {
  manualCompletedMonths: Array<Pick<CompletedBillingMonth, "billingMonth"> | string>;
  drafts: BillingMonthDraft[];
  inbox: BillingMonthInboxMessage[];
}): Set<string> {
  const completed = new Set(args.manualCompletedMonths.map(normalizeCompletedBillingMonth));
  const draftsByMonth = new Map<string, BillingMonthDraft[]>();
  const blockedMonths = new Set<string>();

  for (const draft of args.drafts) {
    const monthDrafts = draftsByMonth.get(draft.billingMonth) ?? [];
    monthDrafts.push(draft);
    draftsByMonth.set(draft.billingMonth, monthDrafts);
  }

  for (const message of args.inbox) {
    const billingMonth = message.parsedData?.billingMonth;
    if (!billingMonth) {
      continue;
    }

    if (isBlockingInboxMessage(message)) {
      blockedMonths.add(billingMonth);
    }
  }

  for (const [billingMonth, monthDrafts] of draftsByMonth) {
    if (monthDrafts.length === 0) {
      continue;
    }

    if (blockedMonths.has(billingMonth)) {
      continue;
    }

    if (monthDrafts.every((draft) => draft.status === "issued")) {
      completed.add(billingMonth);
    }
  }

  return completed;
}
