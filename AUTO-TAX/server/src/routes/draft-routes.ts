import type { Express } from "express";
import { issueDraftNow } from "../automation.js";
import type { AppSettings, DraftStatus, InvoiceDraft } from "../domain.js";
import type { ApiErrorBody } from "../http-errors.js";
import { getTaxInvoiceInfo, getTaxInvoicePrintURL, getTaxInvoiceViewURL } from "../popbill-client.js";
import type { AppStore } from "../store-contract.js";
import type { RequestStoreGetter, RequireWorkspaceEditor, ServerManagedSettingsGetter } from "../route-types.js";
import { cancelIssuedDraftWithRecovery } from "../services/draft-cancel-service.js";

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireWorkspaceEditor: RequireWorkspaceEditor;
  getServerManagedSettings: ServerManagedSettingsGetter;
  getErrorMessage: (error: unknown, fallbackMessage?: string) => string;
  getErrorStatus: (error: unknown, fallbackStatus?: number) => number;
  buildApiErrorBody: (error: unknown, fallbackMessage?: string) => ApiErrorBody;
  assertDraftPopbillEnvironment: (settings: AppSettings, draft: Pick<InvoiceDraft, "popbillEnvironment">) => Promise<void>;
  backfillDraftPopbillEnvironmentIfMissing: (
    requestStore: AppStore,
    settings: AppSettings,
    draft: Pick<InvoiceDraft, "id" | "popbillEnvironment">
  ) => Promise<void>;
};

export function registerDraftRoutes(deps: RouteDeps) {
  const {
    app,
    store,
    getRequestStore,
    requireWorkspaceEditor,
    getServerManagedSettings,
    getErrorMessage,
    getErrorStatus,
    buildApiErrorBody,
    assertDraftPopbillEnvironment,
    backfillDraftPopbillEnvironmentIfMissing
  } = deps;

  app.get("/api/drafts", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listDrafts());
  });

  app.post("/api/drafts/:id/issue", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 대기건을 찾지 못했습니다." });
      return;
    }

    const claimedDraft = await requestStore.claimDraftForIssue(draftId);
    if (!claimedDraft) {
      res.status(409).json({ error: "이미 발행 중이거나 발행 가능한 상태가 아닙니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    try {
      const issued = await issueDraftNow(requestStore, await getServerManagedSettings(requestStore), customer, claimedDraft);
      await requestStore.createLog("info", "drafts", "수동 발행을 완료했습니다.", { draftId, customerId: customer.id });
      res.json(issued);
    } catch (error) {
      const message = getErrorMessage(error, "수동 발행 실패");
      const failed = await requestStore.updateDraftStatus(draftId, "failed", message);
      res.status(getErrorStatus(error, 500)).json({
        ...buildApiErrorBody(error, message),
        draft: failed
      });
    }
  });

  app.post("/api/drafts/issue-all", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const drafts = (await requestStore.listDrafts()).filter((draft) => draft.status === "review" || draft.status === "failed");
    const results: Array<{ draftId: number; customerId: number; status: "issued" | "failed"; error?: string }> = [];

    for (const draft of drafts) {
      const claimedDraft = await requestStore.claimDraftForIssue(draft.id);
      if (!claimedDraft) {
        results.push({ draftId: draft.id, customerId: draft.customerId, status: "failed", error: "이미 발행 중이거나 발행 가능한 상태가 아닙니다." });
        continue;
      }

      const customer = await requestStore.getCustomer(draft.customerId);
      if (!customer) {
        await requestStore.updateDraftStatus(draft.id, "failed", "고객 정보를 찾지 못했습니다.");
        results.push({ draftId: draft.id, customerId: draft.customerId, status: "failed", error: "고객 정보를 찾지 못했습니다." });
        continue;
      }

      try {
        await issueDraftNow(requestStore, await getServerManagedSettings(requestStore), customer, claimedDraft);
        results.push({ draftId: draft.id, customerId: customer.id, status: "issued" });
      } catch (error) {
        const message = getErrorMessage(error, "일괄 발행 실패");
        await requestStore.updateDraftStatus(draft.id, "failed", message);
        results.push({ draftId: draft.id, customerId: customer.id, status: "failed", error: message });
      }
    }

    await requestStore.createLog("info", "drafts", "검수 대기/실패 건 전체 발행을 실행했습니다.", {
      total: drafts.length,
      issued: results.filter((item) => item.status === "issued").length,
      failed: results.filter((item) => item.status === "failed").length
    });

    res.json({
      ok: true,
      total: drafts.length,
      issued: results.filter((item) => item.status === "issued").length,
      failed: results.filter((item) => item.status === "failed").length,
      results
    });
  });

  app.post("/api/drafts/:id/cancel", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    if (draft.status !== "issued") {
      res.status(400).json({ error: "발행 완료된 건만 취소할 수 있습니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await getServerManagedSettings(requestStore);
    await assertDraftPopbillEnvironment(settings, draft);
    const cancelResult = await cancelIssuedDraftWithRecovery(settings, customer, draft, "AUTO-TAX 재발행 테스트 취소");
    let reopened: InvoiceDraft;
    try {
      reopened = await requestStore.reopenIssuedDraftForReissue(draftId);
    } catch (error) {
      const syncError = new Error("팝빌 취소는 완료됐지만 재발행 대기 상태 복원에 실패했습니다. 잠시 후 다시 시도하세요.") as Error & {
        status?: number;
      };
      syncError.status = 502;
      throw Object.assign(syncError, { cause: error });
    }

    await requestStore.createLog(
      cancelResult.status === "already-canceled" ? "info" : "warn",
      "drafts",
      cancelResult.status === "already-canceled"
        ? "팝빌에서 이미 취소된 발행 건을 확인해 재발행 대기로 복구했습니다."
        : "발행 완료 건을 취소하고 검수 대기로 되돌렸습니다.",
      {
        draftId,
        customerId: customer.id,
        previousMgtKey: draft.popbillMgtKey,
        nextMgtKey: reopened.popbillMgtKey,
        recoveredFromAlreadyCanceled: cancelResult.status === "already-canceled"
      }
    );
    res.json({
      ok: true,
      response: cancelResult.response,
      draft: reopened,
      recovered: cancelResult.status === "already-canceled"
    });
  });

  app.get("/api/drafts/:id/popbill/info", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await getServerManagedSettings(requestStore);
    await assertDraftPopbillEnvironment(settings, draft);
    const info = await getTaxInvoiceInfo(settings, customer, draft);
    await backfillDraftPopbillEnvironmentIfMissing(requestStore, settings, draft);
    res.json(info);
  });

  app.get("/api/drafts/:id/popbill/view-url", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await getServerManagedSettings(requestStore);
    await assertDraftPopbillEnvironment(settings, draft);
    const url = await getTaxInvoiceViewURL(settings, customer, draft);
    await backfillDraftPopbillEnvironmentIfMissing(requestStore, settings, draft);
    res.json({ url });
  });

  app.get("/api/drafts/:id/popbill/print-url", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await getServerManagedSettings(requestStore);
    await assertDraftPopbillEnvironment(settings, draft);
    const url = await getTaxInvoicePrintURL(settings, customer, draft);
    await backfillDraftPopbillEnvironmentIfMissing(requestStore, settings, draft);
    res.json({ url });
  });
}
