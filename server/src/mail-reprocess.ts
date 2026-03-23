import type { InvoiceDraft, MailParseStatus } from "./domain.js";
import { parseKepcoMail } from "./parser.js";
import { Store } from "./store.js";

export async function reprocessInboxMessage(
  store: Store,
  messageId: number
): Promise<{ status: MailParseStatus; draft?: InvoiceDraft | null }> {
  const message = store.getInboxMessage(messageId);
  if (!message) {
    throw new Error("메일을 찾지 못했습니다.");
  }

  if (message.draftId) {
    const existingDraft = store.getDraft(message.draftId);
    store.updateInboxMatchResult({
      messageId,
      parseStatus: "parsed",
      parseError: "",
      parsedMail: message.parsedData,
      customerId: existingDraft?.customerId ?? message.customerId,
      draftId: message.draftId
    });
    return { status: "parsed", draft: existingDraft };
  }

  try {
    const parsedMail = parseKepcoMail(message.textBody || message.rawSource);
    const customer = store.findCustomerByPlantAndAddress(parsedMail.plantName, parsedMail.plantAddress);

    if (!customer) {
      store.updateInboxMatchResult({
        messageId,
        parseStatus: "unmatched",
        parseError: "",
        parsedMail,
        customerId: null,
        draftId: null
      });
      return { status: "unmatched" };
    }

    store.updateInboxMatchResult({
      messageId,
      parseStatus: "parsed",
      parseError: "",
      parsedMail,
      customerId: customer.id,
      draftId: null
    });

    const draft = store.createDraft({
      customer,
      sourceMessageId: messageId,
      status: "review",
      scheduledFor: null,
      parsedMail
    });

    store.createLog("info", "mail-reprocess", "미매칭 메일 재처리에 성공했습니다.", {
      messageId,
      customerId: customer.id,
      draftId: draft.id
    });

    return { status: "parsed", draft };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "메일 재처리 실패";
    store.updateInboxMatchResult({
      messageId,
      parseStatus: "failed",
      parseError: messageText,
      parsedMail: null,
      customerId: null,
      draftId: null
    });
    store.createLog("error", "mail-reprocess", "미매칭 메일 재처리에 실패했습니다.", {
      messageId,
      error: messageText
    });
    return { status: "failed" };
  }
}
