import type { Express } from "express";
import { issueDraftNow } from "../automation.js";
import type { AppSettings, DraftStatus, InvoiceDraft } from "../domain.js";
import type { ApiErrorBody } from "../http-errors.js";
import { buildPilotLogContext } from "../pilot-issuance.js";
import { cancelTaxInvoice, getTaxInvoiceInfo, getTaxInvoicePrintURL, getTaxInvoiceViewURL } from "../popbill-client.js";
import type { AppStore } from "../store-contract.js";
import type { RequestStoreGetter, RequireWorkspaceEditor, ServerManagedSettingsGetter } from "../route-types.js";

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

function parseOptionalIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("유효한 ISO 시각이 아닙니다.");
  }

  return parsed.toISOString();
}

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

  app.get("/api/drafts/pilot-report", async (req, res) => {
    const requestStore = getRequestStore(res, store);

    try {
      const from = parseOptionalIsoTimestamp(req.query.from);
      const to = parseOptionalIsoTimestamp(req.query.to);
      res.json(await requestStore.getPilotIssuanceReport({ from, to }));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "잘못된 조회 조건입니다." });
    }
  });

  app.get("/api/drafts/:id/pilot-timeline", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const timeline = await requestStore.getDraftPilotTimeline(draftId);
    if (!timeline) {
      res.status(404).json({ error: "발행 대기건을 찾지 못했습니다." });
      return;
    }

    res.json(timeline);
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

    const manualIssueContext = {
      draftId,
      customerId: claimedDraft.customerId,
      issueMode: claimedDraft.issueMode,
      issuePath: "single"
    };
    await requestStore.createLog(
      "info",
      "drafts",
      "수동 발행 버튼 실행이 기록되었습니다.",
      buildPilotLogContext(manualIssueContext, {
        eventType: "manual-issue-clicked"
      })
    );

    const customer = await requestStore.getCustomer(draft.customerId);
    if (!customer) {
      const message = "고객을 찾지 못했습니다.";
      await requestStore.updateDraftStatus(draftId, "failed", message);
      await requestStore.createLog(
        "error",
        "drafts",
        "수동 발행에 실패했습니다.",
        buildPilotLogContext(manualIssueContext, {
          eventType: "manual-issue-failed",
          errorCategory: "manual-issue",
          error: message
        })
      );
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    try {
      const issued = await issueDraftNow(requestStore, await getServerManagedSettings(requestStore), customer, claimedDraft);
      await requestStore.createLog(
        "info",
        "drafts",
        "수동 발행을 완료했습니다.",
        buildPilotLogContext(manualIssueContext, {
          eventType: "manual-issue-succeeded"
        })
      );
      res.json(issued);
    } catch (error) {
      const message = getErrorMessage(error, "수동 발행 실패");
      const failed = await requestStore.updateDraftStatus(draftId, "failed", message);
      await requestStore.createLog(
        "error",
        "drafts",
        "수동 발행에 실패했습니다.",
        buildPilotLogContext(manualIssueContext, {
          eventType: "manual-issue-failed",
          errorCategory: "manual-issue",
          error: message
        })
      );
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

      const manualIssueContext = {
        draftId: draft.id,
        customerId: claimedDraft.customerId,
        issueMode: claimedDraft.issueMode,
        issuePath: "bulk-manual"
      };
      await requestStore.createLog(
        "info",
        "drafts",
        "일괄 수동 발행 버튼 실행이 기록되었습니다.",
        buildPilotLogContext(manualIssueContext, {
          eventType: "manual-issue-clicked"
        })
      );

      const customer = await requestStore.getCustomer(draft.customerId);
      if (!customer) {
        const message = "고객 정보를 찾지 못했습니다.";
        await requestStore.updateDraftStatus(draft.id, "failed", message);
        await requestStore.createLog(
          "error",
          "drafts",
          "수동 발행에 실패했습니다.",
          buildPilotLogContext(manualIssueContext, {
            eventType: "manual-issue-failed",
            errorCategory: "manual-issue",
            error: message
          })
        );
        results.push({ draftId: draft.id, customerId: draft.customerId, status: "failed", error: "고객 정보를 찾지 못했습니다." });
        continue;
      }

      try {
        await issueDraftNow(requestStore, await getServerManagedSettings(requestStore), customer, claimedDraft);
        await requestStore.createLog(
          "info",
          "drafts",
          "수동 발행을 완료했습니다.",
          buildPilotLogContext(manualIssueContext, {
            eventType: "manual-issue-succeeded"
          })
        );
        results.push({ draftId: draft.id, customerId: customer.id, status: "issued" });
      } catch (error) {
        const message = getErrorMessage(error, "일괄 발행 실패");
        await requestStore.updateDraftStatus(draft.id, "failed", message);
        await requestStore.createLog(
          "error",
          "drafts",
          "수동 발행에 실패했습니다.",
          buildPilotLogContext(manualIssueContext, {
            eventType: "manual-issue-failed",
            errorCategory: "manual-issue",
            error: message
          })
        );
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
    const response = await cancelTaxInvoice(settings, customer, draft, "AUTO-TAX 재발행 테스트 취소");
    const reopened = await requestStore.reopenIssuedDraftForReissue(draftId);
    await requestStore.createLog("warn", "drafts", "발행 완료 건을 취소하고 검수 대기로 되돌렸습니다.", {
      draftId,
      customerId: customer.id,
      previousMgtKey: draft.popbillMgtKey,
      nextMgtKey: reopened.popbillMgtKey
    });
    res.json({ ok: true, response, draft: reopened });
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

  app.post("/api/drafts/:id/pilot-preview-opened", async (req, res) => {
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

    await requestStore.createLog(
      "info",
      "drafts",
      "초안 미리보기 열기 버튼 실행이 기록되었습니다.",
      buildPilotLogContext(
        {
          draftId,
          customerId: customer.id,
          issueMode: draft.issueMode,
          previewPath: "view-url",
          previewSource: "ui-click"
        },
        {
          eventType: "draft-preview-opened"
        }
      )
    );

    res.json({ ok: true });
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
