import type { Customer, InboxMessage, InvoiceDraft, MailParseStatus } from "./domain.js";
import { parseKepcoMail } from "./parser.js";
import { buildPilotLogContext } from "./pilot-issuance.js";
import type { AppStore } from "./store-contract.js";

type MailReprocessDeps = {
  parseKepcoMail?: typeof parseKepcoMail;
  customerId?: number | null;
  message?: InboxMessage | null;
  customer?: Customer | null;
};

export async function reprocessInboxMessage(
  store: AppStore,
  messageId: number,
  deps: MailReprocessDeps = {}
): Promise<{ status: MailParseStatus; draft?: InvoiceDraft | null }> {
  const parseMail = deps.parseKepcoMail ?? parseKepcoMail;
  const message = deps.message ?? await store.getInboxMessage(messageId);
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

  let customerIdForLog: number | null = null;
  let draftIdForLog: number | null = null;
  let issueModeForLog: InvoiceDraft["issueMode"] | null = null;
  let reprocessStage:
    | "parse"
    | "completed-billing-month"
    | "customer-match"
    | "duplicate-check"
    | "create-draft"
    | "other" = "parse";

  try {
    let parsedMail;
    try {
      parsedMail = parseMail(message.textBody || message.rawSource);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "메일 파싱 실패";
      await store.updateInboxMatchResult({
        messageId,
        parseStatus: "failed",
        parseError: messageText,
        parsedMail: null,
        customerId: null,
        draftId: null
      });
      await store.createLog(
        "error",
        "mail-reprocess",
        "미매칭 메일 재처리 중 메일 파싱에 실패했습니다.",
        buildPilotLogContext(
          {
            messageId,
            error: messageText
          },
          {
            pipeline: "mail-reprocess",
            draftSource: "mail-reprocess",
            errorCategory: "parse",
            reprocessStage: "parse",
            status: "failed"
          }
        )
      );
      return { status: "failed" };
    }

    reprocessStage = "completed-billing-month";
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
      await store.createLog(
        "info",
        "mail-reprocess",
        "완료 처리한 정산월 메일을 재처리 대상에서 제외했습니다.",
        buildPilotLogContext(
          {
            messageId,
            billingMonth: parsedMail.billingMonth
          },
          {
            pipeline: "mail-reprocess",
            draftSource: "mail-reprocess",
            status: "ignored"
          }
        )
      );
      return { status: "ignored" };
    }

    reprocessStage = "customer-match";
    const manualCustomerId = deps.customerId ?? null;
    let manualMatchAddressAdded = false;
    let manualMatchAddress: string | null = null;
    let customer = manualCustomerId
      ? deps.customer && deps.customer.id === manualCustomerId
        ? deps.customer
        : await store.getCustomer(manualCustomerId)
      : await store.findCustomerByMatchAddress(parsedMail.plantAddress);

    if (!customer) {
      if (manualCustomerId) {
        throw new Error("선택한 고객을 찾지 못했습니다.");
      }

      await store.updateInboxMatchResult({
        messageId,
        parseStatus: "unmatched",
        parseError: "",
        parsedMail,
        customerId: null,
        draftId: null
      });
      await store.createLog(
        "warn",
        "mail-reprocess",
        "미매칭 메일 재처리 중 고객 매칭에 실패했습니다.",
        buildPilotLogContext(
          {
            messageId,
            billingMonth: parsedMail.billingMonth,
            plantName: parsedMail.plantName,
            plantAddress: parsedMail.plantAddress
          },
          {
            pipeline: "mail-reprocess",
            draftSource: "mail-reprocess",
            errorCategory: "customer-match",
            status: "unmatched"
          }
        )
      );
      return { status: "unmatched" };
    }

    if (manualCustomerId) {
      try {
        const existingAddressOwner = await store.findCustomerByMatchAddress(parsedMail.plantAddress);
        manualMatchAddressAdded = !existingAddressOwner;
        manualMatchAddress = parsedMail.plantAddress;
        customer = await store.addCustomerMatchAddress(customer.id, parsedMail.plantAddress);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "매칭 주소 저장 실패";
        await store.updateInboxMatchResult({
          messageId,
          parseStatus: "failed",
          parseError: messageText,
          parsedMail,
          customerId: customer.id,
          draftId: null
        });
        await store.createLog(
          "error",
          "mail-reprocess",
          "수동 선택 고객의 매칭 주소 저장에 실패했습니다.",
          buildPilotLogContext(
            {
              messageId,
              customerId: customer.id,
              billingMonth: parsedMail.billingMonth,
              plantAddress: parsedMail.plantAddress,
              error: messageText
            },
            {
              pipeline: "mail-reprocess",
              draftSource: "mail-reprocess",
              errorCategory: "customer-match",
              reprocessStage: "customer-match",
              status: "failed"
            }
          )
        );
        return { status: "failed" };
      }
    }

    customerIdForLog = customer.id;
    issueModeForLog = customer.issueMode;
    reprocessStage = "duplicate-check";
    const existingDraft = await store.findDraftByCustomerAndBillingMonth(customer.id, parsedMail.billingMonth);
    if (existingDraft) {
      draftIdForLog = existingDraft.id;
      issueModeForLog = existingDraft.issueMode;
      await store.updateInboxMatchResult({
        messageId,
        parseStatus: "duplicate",
        parseError: `이미 ${parsedMail.billingMonth} 건이 있습니다. 기존 상태: ${existingDraft.status}`,
        parsedMail,
        customerId: customer.id,
        draftId: existingDraft.id
      });
      await store.createLog(
        "warn",
        "mail-reprocess",
        "재처리 중 같은 고객/정산월 건이 확인되어 중복 의심으로 유지했습니다.",
        buildPilotLogContext(
          {
            messageId,
            customerId: customer.id,
            draftId: existingDraft.id,
            issueMode: existingDraft.issueMode,
            existingDraftId: existingDraft.id,
            existingDraftStatus: existingDraft.status,
            billingMonth: parsedMail.billingMonth
          },
          {
            pipeline: "mail-reprocess",
            draftSource: "mail-reprocess",
            status: "duplicate"
          }
        )
      );
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

    reprocessStage = "create-draft";
    let draft: InvoiceDraft;
    try {
      draft = await store.createDraft({
        customer,
        sourceMessageId: messageId,
        status: "review",
        scheduledFor: null,
        parsedMail,
        draftSource: "mail-reprocess"
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "초안 생성 실패";
      await store.updateInboxMatchResult({
        messageId,
        parseStatus: "failed",
        parseError: messageText,
        parsedMail,
        customerId: customer.id,
        draftId: null
      });
      await store.createLog(
        "error",
        "mail-reprocess",
        "미매칭 메일 재처리 중 초안 생성에 실패했습니다.",
        buildPilotLogContext(
          {
            messageId,
            customerId: customer.id,
            issueMode: customer.issueMode,
            billingMonth: parsedMail.billingMonth,
            error: messageText
          },
          {
            pipeline: "mail-reprocess",
            draftSource: "mail-reprocess",
            errorCategory: "draft-create",
            reprocessStage: "create-draft",
            status: "failed"
          }
        )
      );
      return { status: "failed" };
    }

    draftIdForLog = draft.id;
    issueModeForLog = draft.issueMode;
    await store.createLog(
      "info",
      "mail-reprocess",
      "미매칭 메일 재처리에 성공했습니다.",
      buildPilotLogContext(
        {
          messageId,
          customerId: customer.id,
          draftId: draft.id,
          issueMode: draft.issueMode,
          ...(manualCustomerId
            ? {
                manualMatchAddress,
                manualMatchAddressAdded
              }
            : {})
        },
        {
          pipeline: "mail-reprocess",
          draftSource: "mail-reprocess",
          eventType: "draft-created",
          status: "parsed"
        }
      )
    );

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
    await store.createLog(
      "error",
      "mail-reprocess",
      "미매칭 메일 재처리에 실패했습니다.",
      buildPilotLogContext(
        {
          messageId,
          customerId: customerIdForLog ?? undefined,
          draftId: draftIdForLog ?? undefined,
          issueMode: issueModeForLog ?? undefined,
          error: messageText
        },
        {
          pipeline: "mail-reprocess",
          draftSource: "mail-reprocess",
          errorCategory: "mail-sync",
          reprocessStage,
          status: "failed"
        }
      )
    );
    return { status: "failed" };
  }
}
