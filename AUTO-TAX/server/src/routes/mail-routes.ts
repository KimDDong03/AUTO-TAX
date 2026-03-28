import type { Express } from "express";
import type { AppStore } from "../store-contract.js";
import type { InvoiceDraft, MailParseStatus } from "../domain.js";
import type { RequestStoreGetter, RequireWorkspaceEditor } from "../route-types.js";
import type { MailSyncResult } from "../mail-sync.js";

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireWorkspaceEditor: RequireWorkspaceEditor;
  reprocessInboxMessage: (
    requestStore: AppStore,
    messageId: number
  ) => Promise<{ status: MailParseStatus; draft?: InvoiceDraft | null }>;
  syncMailbox: (requestStore: AppStore) => Promise<MailSyncResult>;
};

export function registerMailRoutes(deps: RouteDeps) {
  const { app, store, getRequestStore, requireWorkspaceEditor, reprocessInboxMessage, syncMailbox } = deps;

  app.get("/api/inbox", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listInbox());
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

  app.post("/api/mail/sync", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const result = await syncMailbox(requestStore);
    res.json(result);
  });
}
