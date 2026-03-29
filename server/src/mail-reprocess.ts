import type { InvoiceDraft, MailParseStatus } from "./domain.js";
import { parseKepcoMail } from "./parser.js";
import type { AppStore } from "./store-contract.js";

export async function reprocessInboxMessage(
  store: AppStore,
  messageId: number
): Promise<{ status: MailParseStatus; draft?: InvoiceDraft | null }> {
  const message = await store.getInboxMessage(messageId);
  if (!message) {
    throw new Error("메일을 찾지 못했습니다.");
  }

  if (message.draftId) {
    const existingDraft = await store.getDraft(message.draftId);
    if (existingDraft) {
      await store.updateInboxMatchResult({
        messageId,
        parseStatus: "parsed",
        parseError: "",
        parsedMail: message.parsedData,
        customerId: existingDraft.customerId,
        draftId: message.draftId
      });
      return { status: "parsed", draft: existingDraft };
    }
  }

  try {
    const parsedMail = parseKepcoMail(message.textBody || message.rawSource);
    const completedBillingMonthSet = new Set((await store.listCompletedBillingMonths()).map((item) => item.billingMonth));

    if (completedBillingMonthSet.has(parsedMail.billingMonth)) {
      await store.updateInboxMatchResult({
        messageId,
        parseStatus: "ignored",
        parseError: "초기 등록에서 완료 처리한 정산월입니다.",
        parsedMail,
        customerId: null,
        draftId: null
      });
      await store.createLog("info", "mail-reprocess", "완료 처리한 정산월 메일을 재처리 대상에서 제외했습니다.", {
        messageId,
        billingMonth: parsedMail.billingMonth
      });
      return { status: "ignored" };
    }

    const customer = await store.findCustomerByMatchAddress(parsedMail.plantAddress);

    if (!customer) {
      await store.updateInboxMatchResult({
        messageId,
        parseStatus: "unmatched",
        parseError: "",
        parsedMail,
        customerId: null,
        draftId: null
      });
      return { status: "unmatched" };
    }

    const existingDraft = await store.findDraftByCustomerAndBillingMonth(customer.id, parsedMail.billingMonth);
    if (existingDraft) {
      await store.updateInboxMatchResult({
        messageId,
        parseStatus: "duplicate",
        parseError: `이미 ${parsedMail.billingMonth} 건이 있습니다. 기존 상태: ${existingDraft.status}`,
        parsedMail,
        customerId: customer.id,
        draftId: existingDraft.id
      });
      await store.createLog("warn", "mail-reprocess", "재처리 중 같은 고객/정산월 건이 확인되어 중복 의심으로 유지했습니다.", {
        messageId,
        customerId: customer.id,
        existingDraftId: existingDraft.id,
        billingMonth: parsedMail.billingMonth
      });
      return { status: "duplicate", draft: existingDraft };
    }

    await store.updateInboxMatchResult({
      messageId,
      parseStatus: "parsed",
      parseError: "",
      parsedMail,
      customerId: customer.id,
      draftId: null
    });

    const draft = await store.createDraft({
      customer,
      sourceMessageId: messageId,
      status: "review",
      scheduledFor: null,
      parsedMail
    });

    await store.createLog("info", "mail-reprocess", "미매칭 메일 재처리에 성공했습니다.", {
      messageId,
      customerId: customer.id,
      draftId: draft.id
    });

    return { status: "parsed", draft };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "메일 재처리 실패";
    await store.updateInboxMatchResult({
      messageId,
      parseStatus: "failed",
      parseError: messageText,
      parsedMail: null,
      customerId: null,
      draftId: null
    });
    await store.createLog("error", "mail-reprocess", "미매칭 메일 재처리에 실패했습니다.", {
      messageId,
      error: messageText
    });
    return { status: "failed" };
  }
}
