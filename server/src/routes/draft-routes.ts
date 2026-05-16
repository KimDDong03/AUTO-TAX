import type { Express } from "express";
import { issueDraftNow } from "../automation.js";
import type { AppSettings, Customer, DraftStatus, InvoiceDraft, ParsedMail } from "../domain.js";
import type { ApiErrorBody } from "../http-errors.js";
import { renderMailPreviewImage } from "../mail-preview-image.js";
import { buildPilotIssuanceReportCsv, buildPilotLogContext } from "../pilot-issuance.js";
import { cancelTaxInvoice, getTaxInvoiceInfo, getTaxInvoicePrintURL, getTaxInvoiceViewURL } from "../popbill-client.js";
import type { AppStore } from "../store-contract.js";
import type { RequestStoreGetter, RequireWorkspaceEditor, ServerManagedSettingsGetter } from "../route-types.js";
import { getCurrentKstYearMonth } from "../customer-contract-renewals.js";

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireWorkspaceEditor: RequireWorkspaceEditor;
  getServerManagedSettings: ServerManagedSettingsGetter;
  getErrorMessage: (error: unknown, fallbackMessage?: string) => string;
  getErrorStatus: (error: unknown, fallbackStatus?: number) => number;
  buildApiErrorBody: (error: unknown, fallbackMessage?: string) => ApiErrorBody;
  issueDraftNow?: typeof issueDraftNow;
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

function parsePilotReportFormat(value: unknown): "json" | "csv" {
  if (typeof value !== "string") {
    return "json";
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "csv" ? "csv" : "json";
}

function parseIssuedMonthlyTrendYear(value: unknown): string {
  if (value === undefined) {
    return getCurrentKstYearMonth().slice(0, 4);
  }

  if (typeof value !== "string") {
    throw new Error("연도 형식이 올바르지 않습니다.");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return getCurrentKstYearMonth().slice(0, 4);
  }

  if (!/^\d{4}$/.test(trimmed)) {
    throw new Error("연도 형식이 올바르지 않습니다.");
  }

  return trimmed;
}

function parseDraftTextField(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label}을 입력해주세요.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label}을 입력해주세요.`);
  }

  return trimmed;
}

function parseDraftOptionalTextField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDraftOptionalTextFieldWithFallback(value: unknown, fallback: string): string {
  return value === undefined ? fallback : parseDraftOptionalTextField(value);
}

function parseDraftMoneyField(value: unknown, label: string): number {
  const rawValue = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  const normalized = rawValue.replace(/[,\s₩원]/g, "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label}은 0 이상의 정수로 입력해주세요.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label}은 0 이상의 정수로 입력해주세요.`);
  }

  return parsed;
}

function parseDraftBusinessNumber(value: unknown): string {
  const trimmed = parseDraftTextField(value, "사업자번호");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 10) {
    throw new Error("사업자번호는 숫자 10자리로 입력해주세요.");
  }
  return trimmed;
}

function parseDraftBillingMonth(value: unknown): string {
  const trimmed = parseDraftTextField(value, "정산월");
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    throw new Error("정산월은 YYYY-MM 형식으로 입력해주세요.");
  }
  return trimmed;
}

function parseDraftWriteDate(value: unknown): string {
  const trimmed = parseDraftTextField(value, "작성일자");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("작성일자는 YYYY-MM-DD 형식으로 입력해주세요.");
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    throw new Error("작성일자가 올바르지 않습니다.");
  }
  return trimmed;
}

function parseDraftCustomerId(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("고객을 선택해주세요.");
  }
  return parsed;
}

function buildEditedParsedMail(draft: InvoiceDraft, body: unknown): ParsedMail {
  const payload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const supplyCost = parseDraftMoneyField(payload.supplyCost, "공급가액");
  const taxTotal = parseDraftMoneyField(payload.taxTotal, "부가세");

  return {
    originalFrom: "",
    plantName: parseDraftOptionalTextFieldWithFallback(payload.plantName, draft.plantName),
    plantAddress: draft.kepcoAddr,
    billingMonth: draft.billingMonth,
    supplyCost,
    taxTotal,
    totalAmount: supplyCost + taxTotal,
    itemName: parseDraftTextField(payload.itemName, "품목"),
    kepcoCorpNum: parseDraftBusinessNumber(payload.kepcoCorpNum),
    kepcoBranchId: parseDraftOptionalTextFieldWithFallback(payload.kepcoBranchId, draft.kepcoBranchId),
    kepcoCorpName: parseDraftTextField(payload.kepcoCorpName, "공급받는자"),
    kepcoCeoName: parseDraftOptionalTextFieldWithFallback(payload.kepcoCeoName, draft.kepcoCeoName),
    kepcoAddr: parseDraftOptionalTextFieldWithFallback(payload.kepcoAddr, draft.kepcoAddr),
    kepcoBizType: parseDraftOptionalTextFieldWithFallback(payload.kepcoBizType, draft.kepcoBizType),
    kepcoBizClass: parseDraftOptionalTextFieldWithFallback(payload.kepcoBizClass, draft.kepcoBizClass),
    rawText: ""
  };
}

function buildManualParsedMail(customer: Customer, body: unknown): ParsedMail {
  const payload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const supplyCost = parseDraftMoneyField(payload.supplyCost, "공급가액");
  const taxTotal = parseDraftMoneyField(payload.taxTotal, "부가세");
  const fallbackPlantName = customer.plantNames[0] || customer.corpName || customer.customerName;

  return {
    originalFrom: "manual",
    plantName: parseDraftOptionalTextFieldWithFallback(payload.plantName, fallbackPlantName),
    plantAddress: customer.addr,
    billingMonth: parseDraftBillingMonth(payload.billingMonth),
    supplyCost,
    taxTotal,
    totalAmount: supplyCost + taxTotal,
    itemName: parseDraftTextField(payload.itemName, "품목"),
    kepcoCorpNum: parseDraftBusinessNumber(payload.kepcoCorpNum),
    kepcoBranchId: parseDraftOptionalTextField(payload.kepcoBranchId),
    kepcoCorpName: parseDraftTextField(payload.kepcoCorpName, "공급받는자"),
    kepcoCeoName: parseDraftOptionalTextField(payload.kepcoCeoName),
    kepcoAddr: parseDraftOptionalTextField(payload.kepcoAddr),
    kepcoBizType: parseDraftOptionalTextField(payload.kepcoBizType),
    kepcoBizClass: parseDraftOptionalTextField(payload.kepcoBizClass),
    rawText: ""
  };
}

type ManualIssueExecutionPath = "single" | "bulk-manual";

type DraftValueSnapshot = {
  supplyCost: number;
  taxTotal: number;
  totalAmount: number;
  writeDate: string | null;
  invoicerBusinessNumber: string;
  invoiceeCorpNum: string;
  invoiceeTaxRegId: string | null;
};

function buildManualIssueAuditContext(
  draft: Pick<InvoiceDraft, "id" | "customerId" | "issueMode" | "issueRequestedAt">,
  executionPath: ManualIssueExecutionPath
) {
  return {
    draftId: draft.id,
    customerId: draft.customerId,
    issueMode: draft.issueMode,
    executionPath,
    clickedAt: draft.issueRequestedAt ?? undefined
  };
}

function buildDraftValueSnapshot(
  customer: Pick<Customer, "businessNumber">,
  draft: Pick<
    InvoiceDraft,
    "supplyCost" | "taxTotal" | "totalAmount" | "writeDate" | "kepcoCorpNum" | "kepcoBranchId"
  >
): DraftValueSnapshot {
  return {
    supplyCost: draft.supplyCost,
    taxTotal: draft.taxTotal,
    totalAmount: draft.totalAmount,
    writeDate: draft.writeDate ?? null,
    invoicerBusinessNumber: customer.businessNumber,
    invoiceeCorpNum: draft.kepcoCorpNum,
    invoiceeTaxRegId: draft.kepcoBranchId || null
  };
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
    issueDraftNow: issueDraftNowImpl = issueDraftNow,
    assertDraftPopbillEnvironment,
    backfillDraftPopbillEnvironmentIfMissing
  } = deps;

  app.get("/api/drafts", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listDrafts());
  });

  app.get("/api/drafts/issued-monthly-trend", async (req, res) => {
    const requestStore = getRequestStore(res, store);

    let anchorBillingYear: string;
    try {
      const requestedYear = req.query.year ?? (typeof req.query.anchor === "string" ? req.query.anchor.slice(0, 4) : undefined);
      anchorBillingYear = parseIssuedMonthlyTrendYear(requestedYear);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "연도 형식이 올바르지 않습니다." });
      return;
    }

    try {
      res.json(await requestStore.getIssuedMonthlyTrend(anchorBillingYear));
    } catch (error) {
      res.status(getErrorStatus(error, 500)).json(buildApiErrorBody(error, "월별 발행 현황을 불러오지 못했습니다."));
    }
  });

  app.post("/api/drafts/manual", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);

    let customerId: number;
    let writeDate: string;
    try {
      customerId = parseDraftCustomerId((req.body as Record<string, unknown> | undefined)?.customerId);
      writeDate = parseDraftWriteDate((req.body as Record<string, unknown> | undefined)?.writeDate);
    } catch (error) {
      res.status(400).json({ error: getErrorMessage(error, "수동 발행 정보가 올바르지 않습니다.") });
      return;
    }

    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    let parsedMail: ParsedMail;
    try {
      parsedMail = buildManualParsedMail(customer, req.body);
    } catch (error) {
      res.status(400).json({ error: getErrorMessage(error, "수동 발행 정보가 올바르지 않습니다.") });
      return;
    }

    const existingDraft = await requestStore.findDraftByCustomerAndBillingMonth(customer.id, parsedMail.billingMonth);
    if (existingDraft) {
      res.status(409).json({ error: "이미 해당 정산월 발행 초안이 있습니다.", draft: existingDraft });
      return;
    }

    try {
      const draft = await requestStore.createManualDraft({
        customer,
        status: "review",
        writeDate,
        parsedMail
      });
      res.status(201).json(draft);
    } catch (error) {
      res.status(getErrorStatus(error, 500)).json(buildApiErrorBody(error, "수동 발행 초안을 만들지 못했습니다."));
    }
  });

  app.get("/api/drafts/pilot-report", async (req, res) => {
    const requestStore = getRequestStore(res, store);

    try {
      const from = parseOptionalIsoTimestamp(req.query.from);
      const to = parseOptionalIsoTimestamp(req.query.to);
      const report = await requestStore.getPilotIssuanceReport({ from, to });
      if (parsePilotReportFormat(req.query.format) === "csv") {
        const filenameDate = report.generatedAt.slice(0, 10);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="pilot-report-${filenameDate}.csv"`);
        res.send(buildPilotIssuanceReportCsv(report));
        return;
      }

      res.json(report);
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

  app.get("/api/drafts/:id/mail-preview-image", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 대기건을 찾지 못했습니다." });
      return;
    }

    const sourceMessage = await requestStore.getInboxMessage(draft.sourceMessageId);
    if (!sourceMessage) {
      res.status(404).json({ error: "원본 메일을 찾지 못했습니다." });
      return;
    }

    try {
      const preview = await renderMailPreviewImage(sourceMessage);
      res.setHeader("Cache-Control", "no-store");
      res.json(preview);
    } catch (error) {
      res.status(getErrorStatus(error, 500)).json(buildApiErrorBody(error, "원본 메일 이미지 생성에 실패했습니다."));
    }
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

    const manualIssueContext = buildManualIssueAuditContext(claimedDraft, "single");
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
      const issued = await issueDraftNowImpl(requestStore, await getServerManagedSettings(requestStore), customer, claimedDraft);
      await requestStore.createLog(
        "info",
        "drafts",
        "수동 발행을 완료했습니다.",
        buildPilotLogContext(manualIssueContext, {
          eventType: "manual-issue-succeeded",
          issuedAt: issued.issuedAt ?? undefined,
          issuanceSnapshot: buildDraftValueSnapshot(customer, issued)
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

      const manualIssueContext = buildManualIssueAuditContext(claimedDraft, "bulk-manual");
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
        const issued = await issueDraftNowImpl(requestStore, await getServerManagedSettings(requestStore), customer, claimedDraft);
        await requestStore.createLog(
          "info",
          "drafts",
          "수동 발행을 완료했습니다.",
          buildPilotLogContext(manualIssueContext, {
            eventType: "manual-issue-succeeded",
            issuedAt: issued.issuedAt ?? undefined,
            issuanceSnapshot: buildDraftValueSnapshot(customer, issued)
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

    await requestStore.createLog("info", "drafts", "검수 후 직접 발행 대기/실패 건 전체 발행을 실행했습니다.", {
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
    await requestStore.createLog("warn", "drafts", "발행 완료 건을 취소하고 직접 발행 대기로 되돌렸습니다.", {
      draftId,
      customerId: customer.id,
      previousMgtKey: draft.popbillMgtKey,
      nextMgtKey: reopened.popbillMgtKey
    });
    res.json({ ok: true, response, draft: reopened });
  });

  app.post("/api/drafts/:id/unmatch", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    if (draft.status === "issued" || draft.status === "issuing") {
      res.status(400).json({ error: "발행 중이거나 발행 완료된 건은 매칭을 해제할 수 없습니다." });
      return;
    }

    await requestStore.unmatchDraftSource(draftId);
    await requestStore.createLog("warn", "drafts", "발행 전 초안의 고객 매칭을 해제했습니다.", {
      draftId,
      customerId: draft.customerId,
      sourceMessageId: draft.sourceMessageId,
      billingMonth: draft.billingMonth,
      previousStatus: draft.status
    });

    res.json({ ok: true });
  });

  app.patch("/api/drafts/:id/tax-invoice-info", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const draftId = Number(req.params.id);
    const draft = await requestStore.getDraft(draftId);
    if (!draft) {
      res.status(404).json({ error: "발행 건을 찾지 못했습니다." });
      return;
    }

    if (draft.status === "issued" || draft.status === "issuing") {
      res.status(400).json({ error: "발행 중이거나 발행 완료된 문서는 수정할 수 없습니다." });
      return;
    }

    let parsedMail: ParsedMail;
    try {
      parsedMail = buildEditedParsedMail(draft, req.body);
    } catch (error) {
      res.status(400).json({ error: getErrorMessage(error, "세금계산서 정보가 올바르지 않습니다.") });
      return;
    }

    const updated = await requestStore.refreshDraftFromParsedMail(draftId, parsedMail);
    res.json(updated);
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
          eventType: "draft-preview-opened",
          previewSnapshot: draft.issueMode === "review" ? buildDraftValueSnapshot(customer, draft) : undefined
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
