import type { Express, Request, Response } from "express";
import type { z } from "zod";
import { z as zod } from "zod";
import type { AppSettings, Customer, CustomerInput } from "../domain.js";
import type { CertificateRefreshResult } from "../certificate-monitor.js";
import { MAX_CUSTOMER_REPORT_YEAR, MIN_CUSTOMER_REPORT_YEAR } from "../customer-report-detail.js";
import {
  POPBILL_XMS_LMS_BYTE_LIMIT,
  getPopbillMessageByteLength,
  normalizeIssueCompleteSmsTemplate
} from "../issue-message-template.js";
import {
  CustomerContractRenewalConflictError,
  CustomerContractRenewalInvalidPeriodError,
  getCurrentKstYearMonth
} from "../customer-contract-renewals.js";
import { getCertificateExpireDate, getTaxCertURL, isPopbillMemberMissingError, quitMember } from "../popbill-client.js";
import { RenewalAutomationManager } from "../renewal-automation.js";
import type { AppStore } from "../store-contract.js";
import type { RequestStoreGetter, RequireWorkspaceEditor, ServerManagedSettingsGetter } from "../route-types.js";
import type { AutoJoinCustomerResult } from "../services/popbill-customer-service.js";

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireWorkspaceEditor: RequireWorkspaceEditor;
  getServerManagedSettings: ServerManagedSettingsGetter;
  customerSchema: z.ZodTypeAny;
  normalizeCustomerInput: (input: unknown) => CustomerInput;
  autoJoinCustomerPopbill: (requestStore: AppStore, customer: Customer) => Promise<AutoJoinCustomerResult>;
  toClientCustomer: (customer: Customer) => Customer;
  refreshAllCertificateStatuses: (requestStore: AppStore) => Promise<CertificateRefreshResult>;
  renewalAutomation: RenewalAutomationManager;
  quitCustomerPopbillMember?: typeof quitMember;
};

export type CustomerPopbillQuitResult =
  | {
      status: "not-needed";
      environment: "test" | "production";
      response?: undefined;
      error?: undefined;
    }
  | {
      status: "quit";
      environment: "test" | "production";
      response: unknown;
      error?: undefined;
    }
  | {
      status: "already-missing";
      environment: "test" | "production";
      response?: undefined;
      error: string;
    };

export async function quitCustomerPopbillMembership(
  settings: AppSettings,
  customer: Customer,
  quitCustomerPopbillMember: typeof quitMember,
  quitReason: string
): Promise<CustomerPopbillQuitResult> {
  const environment = settings.popbillIsTest ? "test" : "production";
  if (customer.popbillState !== "joined") {
    return { status: "not-needed", environment };
  }

  try {
    const response = await quitCustomerPopbillMember(settings, customer, quitReason);
    return {
      status: "quit",
      environment,
      response
    };
  } catch (error) {
    if (isPopbillMemberMissingError(error)) {
      return {
        status: "already-missing",
        environment,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    throw error;
  }
}

export function registerCustomerPopbillRoutes(deps: RouteDeps) {
  const {
    app,
    store,
    getRequestStore,
    requireWorkspaceEditor,
    getServerManagedSettings,
    customerSchema,
    normalizeCustomerInput,
    autoJoinCustomerPopbill,
    toClientCustomer,
    refreshAllCertificateStatuses,
    renewalAutomation,
    quitCustomerPopbillMember = quitMember
  } = deps;

  const customerCertificateSchema = zod.object({
    customerId: zod.number().int().positive(),
    certificateKind: zod.enum(["electronic_tax", "general_personal", "general_business", "unknown"]),
    certificateName: zod.string().trim().min(1),
    certificateUsageName: zod.string().trim().default(""),
    issuerName: zod.string().trim().default(""),
    serial: zod.string().trim().nullable().optional().default(null),
    userDN: zod.string().trim().nullable().optional().default(null),
    oid: zod.string().trim().nullable().optional().default(null),
    expireDate: zod.string().trim().nullable().optional().default(null),
    certDirPath: zod.string().trim().nullable().optional().default(null),
    certificatePassword: zod.string().trim().optional(),
    isPrimary: zod.boolean().optional().default(false),
    linkSource: zod.enum(["auto", "manual"]).optional().default("manual")
  });

  const customerIssueCompleteSmsTemplateSchema = zod.object({
    issueCompleteSmsTemplate: zod
      .string()
      .default("")
      .refine(
        (value) => getPopbillMessageByteLength(normalizeIssueCompleteSmsTemplate(value)) <= POPBILL_XMS_LMS_BYTE_LIMIT,
        `문자 양식은 LMS 최대 ${POPBILL_XMS_LMS_BYTE_LIMIT}byte 이내로 입력해야 합니다.`
      )
  });

  const nullableTrimmedStringSchema = zod
    .union([zod.string(), zod.null(), zod.undefined()])
    .transform((value) => {
      const trimmed = typeof value === "string" ? value.trim() : "";
      return trimmed === "" ? null : trimmed;
    });
  const nullableDateStringSchema = nullableTrimmedStringSchema.refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "날짜는 YYYY-MM-DD 형식이어야 합니다."
  );
  const nullableMonthStringSchema = nullableTrimmedStringSchema.refine(
    (value) => value === null || /^\d{4}-\d{2}$/.test(value),
    "월은 YYYY-MM 형식이어야 합니다."
  );
  const nullableNonnegativeNumberSchema = zod
    .union([zod.number(), zod.string(), zod.null(), zod.undefined()])
    .transform((value, context) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        context.addIssue({
          code: "custom",
          message: "0 이상의 숫자여야 합니다."
        });
        return zod.NEVER;
      }
      return parsed;
    });
  const nullableIssueYearSchema = zod
    .union([zod.number(), zod.string(), zod.null(), zod.undefined()])
    .transform((value, context) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) {
        context.addIssue({
          code: "custom",
          message: "발행년도는 1900년부터 2200년 사이여야 합니다."
        });
        return zod.NEVER;
      }
      return parsed;
    });
  const reportYearSchema = zod.coerce.number().int().min(MIN_CUSTOMER_REPORT_YEAR).max(MAX_CUSTOMER_REPORT_YEAR);
  const reportMonthSchema = zod.coerce.number().int().min(1).max(12);
  const customerReportMonthSchema = zod.object({
    reportMonth: reportMonthSchema,
    issueYear: nullableIssueYearSchema,
    issueDate: nullableDateStringSchema,
    supplyAmount: zod.coerce.number().finite().min(0).default(0),
    vatAmount: zod.coerce.number().finite().min(0).default(0)
  });
  const customerReportDetailSchema = zod
    .object({
      reportYear: reportYearSchema,
      profile: zod.object({
        certificateRenewalDate: nullableDateStringSchema,
        hasPersonalGeneralCertificate: zod.boolean().default(false),
        hasTaxInvoiceBusinessCertificate: zod.boolean().default(false),
        solarCapacityKw: nullableNonnegativeNumberSchema,
        contractStartMonth: nullableMonthStringSchema,
        contractEndMonth: nullableMonthStringSchema,
        otherNote: zod.string().trim().max(10000).default("")
      }),
      months: zod.array(customerReportMonthSchema).max(12).default([])
    })
    .superRefine((value, context) => {
      const seen = new Set<number>();
      for (const month of value.months) {
        if (seen.has(month.reportMonth)) {
          context.addIssue({
            code: "custom",
            path: ["months"],
            message: `신고 이력 월이 중복되었습니다: ${month.reportMonth}`
          });
          return;
        }
        seen.add(month.reportMonth);
      }
    });
  const customerContractRenewalCompleteSchema = zod.object({
    expectedContractEndMonth: nullableMonthStringSchema.refine((value) => value !== null, "예상 계약 종료월이 필요합니다.")
  });

  function parseCustomerIdParam(value: string): number | null {
    const customerId = Number(value);
    return Number.isInteger(customerId) && customerId > 0 ? customerId : null;
  }

  function getDefaultReportYear(): number {
    return new Date().getFullYear();
  }

  app.get("/api/customers", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json((await requestStore.listCustomers()).map(toClientCustomer));
  });

  app.get("/api/customers/contract-renewals/due", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listCustomerContractRenewalsDue(getCurrentKstYearMonth()));
  });

  app.get("/api/customers/contract-summaries", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listCustomerContractSummaries());
  });

  app.get("/api/customers/:id/report-detail", async (req, res) => {
    const requestStore = getRequestStore(res, store);
    const customerId = parseCustomerIdParam(req.params.id);
    if (customerId === null) {
      res.status(400).json({ error: "고객 ID가 올바르지 않습니다." });
      return;
    }
    const reportYear = reportYearSchema.parse(req.query.year ?? getDefaultReportYear());
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }
    res.json(await requestStore.getCustomerReportDetail(customerId, reportYear));
  });

  app.put("/api/customers/:id/report-detail", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = parseCustomerIdParam(req.params.id);
    if (customerId === null) {
      res.status(400).json({ error: "고객 ID가 올바르지 않습니다." });
      return;
    }
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }
    const payload = customerReportDetailSchema.parse(req.body ?? {});
    const detail = await requestStore.saveCustomerReportDetail(customerId, payload);
    await requestStore.createLog("info", "customers", "고객 신고 상세 정보를 저장했습니다.", {
      customerId,
      reportYear: detail.reportYear
    });
    res.json(detail);
  });

  app.post("/api/customers/:id/contract-renewal/complete", async (req, res) => {
    const authContext = requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = parseCustomerIdParam(req.params.id);
    if (customerId === null) {
      res.status(400).json({ error: "고객 ID가 올바르지 않습니다." });
      return;
    }

    const payload = customerContractRenewalCompleteSchema.parse(req.body ?? {});
    try {
      const result = await requestStore.completeCustomerContractRenewal(customerId, payload.expectedContractEndMonth);
      await requestStore.createLog("info", "customers", "고객 계약 갱신 완료를 기록했습니다.", {
        eventType: "customer-contract-renewal-completed",
        actorUserId: authContext.userId,
        organizationId: authContext.activeOrganizationId,
        customerId,
        oldContractStartMonth: result.oldContractStartMonth,
        oldContractEndMonth: result.oldContractEndMonth,
        newContractStartMonth: result.newContractStartMonth,
        newContractEndMonth: result.newContractEndMonth
      });
      res.json(result);
    } catch (error) {
      if (error instanceof CustomerContractRenewalConflictError) {
        res.status(409).json({ error: error.message });
        return;
      }
      if (error instanceof CustomerContractRenewalInvalidPeriodError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.message.includes("고객을 찾지 못했습니다")) {
        res.status(404).json({ error: "고객을 찾지 못했습니다." });
        return;
      }
      throw error;
    }
  });

  app.get("/api/customer-certificates", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json(await requestStore.listCustomerCertificates());
  });

  app.post("/api/customer-certificates/link", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = customerCertificateSchema.parse(req.body ?? {});
    const certificate = await requestStore.upsertCustomerCertificate(payload);
    await requestStore.createLog("info", "customer-certificates", "고객 공동인증서를 연결했습니다.", {
      customerId: certificate.customerId,
      certificateId: certificate.id,
      certificateKind: certificate.certificateKind,
      certificateName: certificate.certificateName,
      linkSource: certificate.linkSource
    });
    res.status(201).json(certificate);
  });

  app.get("/api/customer-certificates/:id/password", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const certificateId = Number(req.params.id);
    await requestStore.createLog("warn", "customer-certificates", "고객 공동인증서 비밀번호 재표시 요청을 차단했습니다.", {
      certificateId
    });
    res.status(410).json({
      error: "공동인증서 비밀번호는 서버에 저장하지 않습니다. 현재 브라우저 탭이나 로컬 헬퍼에서 다시 입력하세요."
    });
  });

  app.delete("/api/customer-certificates/:id", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const certificateId = Number(req.params.id);
    await requestStore.deleteCustomerCertificate(certificateId);
    await requestStore.createLog("warn", "customer-certificates", "고객 공동인증서 연결을 해제했습니다.", {
      certificateId
    });
    res.json({ ok: true });
  });

  app.post("/api/customers", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = normalizeCustomerInput(customerSchema.parse(req.body));
    const customer = await requestStore.saveCustomer({
      ...payload,
      issueMode: "review",
      issueDay: null,
      issueHour: null,
      issueMinute: null
    });
    const autoJoin = await autoJoinCustomerPopbill(requestStore, customer);
    await requestStore.createLog("info", "customers", "고객을 등록했습니다.", {
      customerId: autoJoin.customer.id,
      autoJoinStatus: autoJoin.status,
      autoJoinError: autoJoin.error ?? null
    });
    res.status(201).json({
      ...toClientCustomer(autoJoin.customer),
      autoJoinStatus: autoJoin.status,
      autoJoinError: autoJoin.error ?? null
    });
  });

  app.put("/api/customers/:id", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const payload = {
      ...normalizeCustomerInput(customerSchema.parse(req.body)),
      issueMode: "review" as const,
      issueDay: null,
      issueHour: null,
      issueMinute: null
    };
    const customer = await requestStore.saveCustomer(payload, customerId);
    await requestStore.createLog("info", "customers", "고객 정보를 수정했습니다.", { customerId });
    res.json(toClientCustomer(customer));
  });

  app.patch("/api/customers/:id/memo", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const payload = zod.object({ memo: zod.string().max(5000).default("") }).parse(req.body);
    const customer = await requestStore.updateCustomerMemo(customerId, payload.memo);
    await requestStore.createLog("info", "customers", "고객 메모를 수정했습니다.", { customerId });
    res.json(toClientCustomer(customer));
  });

  app.patch("/api/customers/:id/issue-complete-sms-template", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const current = await requestStore.getCustomer(customerId);
    if (!current) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const payload = customerIssueCompleteSmsTemplateSchema.parse(req.body);
    const customer = await requestStore.saveCustomer(
      {
        customerName: current.customerName,
        businessNumber: current.businessNumber,
        corpName: current.corpName,
        ceoName: current.ceoName,
        addr: current.addr,
        bizType: current.bizType,
        bizClass: current.bizClass,
        issueMode: "review",
        issueDay: null,
        issueHour: null,
        issueMinute: null,
        renewalContactMobile: current.renewalContactMobile,
        issueCompleteSmsTemplate: normalizeIssueCompleteSmsTemplate(payload.issueCompleteSmsTemplate),
        memo: current.memo,
        plantNames: current.plantNames,
        matchAddresses: current.matchAddresses
      },
      customerId
    );
    await requestStore.createLog("info", "customers", "고객 발행 완료 문자 양식을 수정했습니다.", { customerId });
    res.json(toClientCustomer(customer));
  });

  app.delete("/api/customers/:id", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    let popbillCleanupStatus: "not-needed" | "quit-on-delete" | "already-missing-on-delete" = "not-needed";
    if (customer.popbillState === "joined") {
      const quitResult = await quitCustomerPopbillMembership(
        await getServerManagedSettings(requestStore),
        customer,
        quitCustomerPopbillMember,
        "AUTO-TAX 고객 삭제"
      );

      if (quitResult.status === "quit") {
        popbillCleanupStatus = "quit-on-delete";
        await requestStore.createLog("warn", "popbill", "고객 삭제에 앞서 발행 연동 계정을 먼저 해지 처리했습니다.", {
          customerId,
          customerName: customer.customerName,
          environment: quitResult.environment
        });
      } else if (quitResult.status === "already-missing") {
        popbillCleanupStatus = "already-missing-on-delete";
        await requestStore.createLog("warn", "popbill", "고객 삭제 전에 발행 연동 계정 해지를 시도했지만 이미 존재하지 않아 로컬 삭제만 진행했습니다.", {
          customerId,
          customerName: customer.customerName,
          environment: quitResult.environment,
          error: quitResult.error
        });
      }
    }

    await requestStore.deleteCustomer(customerId);
    await requestStore.createLog("warn", "customers", "고객과 관련 로컬 데이터를 삭제했습니다.", {
      customerId,
      customerName: customer.customerName,
      popbillCleanupStatus
    });
    res.json({ ok: true, popbillCleanupStatus });
  });

  app.post("/api/customers/:id/popbill/join", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const autoJoin = await autoJoinCustomerPopbill(requestStore, customer);
    if (autoJoin.status === "failed") {
      res.status(400).json({
        ok: false,
        status: autoJoin.status,
        error: autoJoin.error ?? "발행 연동에 실패했습니다.",
        customer: toClientCustomer(autoJoin.customer)
      });
      return;
    }

    res.json({
      ok: true,
      status: autoJoin.status,
      customer: toClientCustomer(autoJoin.customer)
    });
  });

  app.post("/api/customers/:id/popbill/reset", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const updated = await requestStore.resetCustomerPopbill(customerId);
    await requestStore.createLog("warn", "popbill", "고객의 발행 연동 로컬 연결 상태를 초기화했습니다.", {
      customerId,
      customerName: customer.customerName
    });
    res.json(toClientCustomer(updated));
  });

  app.post("/api/customers/:id/popbill/quit", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const settings = await getServerManagedSettings(requestStore);
    const quitResult = await quitCustomerPopbillMembership(settings, customer, quitCustomerPopbillMember, "AUTO-TAX 고객 정리");
    const updated = await requestStore.resetCustomerPopbill(customerId);
    await requestStore.createLog("warn", "popbill", "발행 연동 계정 해지를 처리했습니다.", {
      customerId,
      customerName: customer.customerName,
      environment: quitResult.environment,
      quitStatus: quitResult.status
    });
    res.json({
      ok: true,
      response: quitResult.status === "quit" ? quitResult.response : null,
      quitStatus: quitResult.status,
      environment: quitResult.environment,
      customer: toClientCustomer(updated)
    });
  });

  app.post("/api/customers/:id/popbill/cert-url", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const url = await getTaxCertURL(await getServerManagedSettings(requestStore), customer);
    await requestStore.createLog("info", "popbill", "인증서 등록 URL을 발급했습니다.", { customerId });
    res.json({ url });
  });

  app.post("/api/customers/:id/popbill/cert-status", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const customer = await requestStore.getCustomer(customerId);
    if (!customer) {
      res.status(404).json({ error: "고객을 찾지 못했습니다." });
      return;
    }

    const expireDate = await getCertificateExpireDate(await getServerManagedSettings(requestStore), customer);
    const updated = await requestStore.updateCustomerPopbillState(customerId, customer.popbillState, true, expireDate);
    await requestStore.createLog("info", "popbill", "인증서 만료일을 갱신했습니다.", { customerId, expireDate });
    if (!customer.popbillCertRegistered && updated.popbillCertRegistered) {
      const job = await renewalAutomation.queueBridgeProbe({
        customerId,
        customerName: updated.customerName,
        requestedBy: "cert-status-auto"
      });
      await requestStore.createLog("info", "renewal-agent", "인증서 등록 직후 업태/업종 자동 분석 작업을 큐에 추가했습니다.", {
        customerId,
        jobId: job.id
      });
    }
    res.json(toClientCustomer(updated));
  });

  app.post("/api/popbill/cert-status/refresh-all", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const result = await refreshAllCertificateStatuses(requestStore);
    res.json(result);
  });
}
