import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import { issueTaxInvoice } from "./popbill-client.js";
import type { AppStore } from "./store-contract.js";
import { formatWriteDate } from "./utils.js";

async function assertWithinMonthlyIssueLimit(store: AppStore): Promise<void> {
  if (!store.getMonthlyIssueLimit || !store.getCurrentMonthIssuedDraftCount) {
    return;
  }

  const [monthlyIssueLimit, currentMonthIssuedDraftCount] = await Promise.all([
    store.getMonthlyIssueLimit(),
    store.getCurrentMonthIssuedDraftCount()
  ]);

  if (monthlyIssueLimit !== null && currentMonthIssuedDraftCount >= monthlyIssueLimit) {
    throw new Error(
      `이번 달 발행 한도(${monthlyIssueLimit}건)를 초과했습니다. 한도 조정 후 다시 시도하세요.`
    );
  }
}

export async function issueDraftNow(store: AppStore, settings: AppSettings, customer: Customer, draft: InvoiceDraft): Promise<InvoiceDraft> {
  await assertWithinMonthlyIssueLimit(store);
  const writeDate = new Date();
  const response = await issueTaxInvoice(settings, customer, draft, writeDate);
  const issuedDraft = await store.updateDraftStatus(
    draft.id,
    "issued",
    "",
    formatWriteDate(writeDate),
    response,
    settings.popbillIsTest ? "test" : "production"
  );

  try {
    await store.upsertCustomerReportDetailFromIssuedDraft(issuedDraft);
  } catch (error) {
    await store.createLog(
      "warn",
      "drafts",
      "발행 완료 후 신고 이력 자동 동기화에 실패했습니다.",
      {
        draftId: issuedDraft.id,
        customerId: issuedDraft.customerId,
        billingMonth: issuedDraft.billingMonth,
        issueError: error instanceof Error ? error.message : String(error)
      }
    ).catch(() => {});
  }

  return issuedDraft;
}
