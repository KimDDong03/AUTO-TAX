import type { Express } from "express";
import { z } from "zod";
import type { AppStore } from "../store-contract.js";
import type { InboxMessage, InvoiceDraft, MailParseStatus, ParsedMail } from "../domain.js";
import type { RequestStoreGetter, RequireWorkspaceEditor } from "../route-types.js";
import type { MailSyncOptions, MailSyncResult } from "../mail-sync.js";

const mailSyncSchema = z.object({
  receivedMonth: z.string().trim().regex(/^\d{4}-\d{2}$/).optional(),
  billingMonth: z.string().trim().regex(/^\d{4}-\d{2}$/).optional()
});

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireWorkspaceEditor: RequireWorkspaceEditor;
  reprocessInboxMessage: (
    requestStore: AppStore,
    messageId: number
  ) => Promise<{ status: MailParseStatus; draft?: InvoiceDraft | null }>;
  syncMailbox: (requestStore: AppStore, options?: MailSyncOptions) => Promise<MailSyncResult>;
};

type ClientParsedMail = Omit<ParsedMail, "rawText">;
type ClientInboxMessage = Omit<InboxMessage, "messageUid" | "mailbox" | "rawSource" | "textBody" | "parsedData"> & {
  parsedData?: ClientParsedMail;
};

export function toClientInboxMessage(message: InboxMessage): ClientInboxMessage {
  const {
    messageUid: _messageUid,
    mailbox: _mailbox,
    rawSource: _rawSource,
    textBody: _textBody,
    parsedData,
    ...safeMessage
  } = message;

  if (!parsedData) {
    return safeMessage;
  }

  const { rawText: _rawText, ...safeParsedData } = parsedData;
  return {
    ...safeMessage,
    parsedData: safeParsedData
  };
}

export function registerMailRoutes(deps: RouteDeps) {
  const { app, store, getRequestStore, requireWorkspaceEditor, reprocessInboxMessage, syncMailbox } = deps;

  app.get("/api/inbox", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json((await requestStore.listInbox()).map(toClientInboxMessage));
  });

  app.post("/api/inbox/:id/reprocess", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const messageId = Number(req.params.id);
    const message = await requestStore.getInboxMessage(messageId);
    if (!message) {
      res.status(404).json({ error: "메일을 찾지 못했습니다." });
      return;
    }

    const result = await reprocessInboxMessage(requestStore, messageId);
    res.json({ ok: true, ...result });
  });

  app.post("/api/mail/sync", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = mailSyncSchema.parse(req.body ?? {});
    const result = await syncMailbox(requestStore, {
      receivedMonth: payload.receivedMonth ?? payload.billingMonth ?? null
    });
    res.json(result);
  });
}
