import type { Express, Request, Response } from "express";
import type { z } from "zod";
import { z as zod } from "zod";
import type { AppSettings, Customer, CustomerInput } from "../domain.js";
import type { CertificateRefreshResult } from "../certificate-monitor.js";
import { getCertificateExpireDate, getTaxCertURL, isPopbillMemberMissingError, quitMember } from "../popbill-client.js";
import { RenewalAutomationManager } from "../renewal-automation.js";
import type { AppStore } from "../store-contract.js";
import type { RequestStoreGetter, RequireWorkspaceEditor, ServerManagedSettingsGetter } from "../route-types.js";
import type { AutoJoinCustomerResult } from "../services/popbill-customer-service.js";

const AUTO_ISSUE_ENABLEMENT_EVIDENCE_REQUIRED_MESSAGE =
  "자동 발행은 이 고객으로 최소 1회 이상 정상 발행을 확인한 뒤 활성화할 수 있습니다.";

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

  app.get("/api/customers", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json((await requestStore.listCustomers()).map(toClientCustomer));
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
    const authContext = requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const customerId = Number(req.params.id);
    const payload = normalizeCustomerInput(customerSchema.parse(req.body));
    const currentCustomer = await requestStore.getCustomer(customerId);
    if (currentCustomer?.issueMode === "review" && payload.issueMode === "auto") {
      const canEnableAutoIssue = await requestStore.canEnableAutoIssueForCustomer(customerId);
      if (!canEnableAutoIssue) {
        res.status(409).json({ error: AUTO_ISSUE_ENABLEMENT_EVIDENCE_REQUIRED_MESSAGE });
        return;
      }
    }
    const customer = await requestStore.saveCustomer(payload, customerId);
    await requestStore.createLog("info", "customers", "고객 정보를 수정했습니다.", { customerId });
    if (currentCustomer && currentCustomer.issueMode !== customer.issueMode) {
      await requestStore.createLog("info", "customers", "고객 자동 발행 설정을 변경했습니다.", {
        eventType: "issue-mode-changed",
        actorUserId: authContext.userId,
        organizationId: authContext.activeOrganizationId,
        customerId,
        changedAt: customer.updatedAt,
        previousIssueMode: currentCustomer.issueMode,
        nextIssueMode: customer.issueMode
      });
    }
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
        await requestStore.createLog("warn", "popbill", "고객 삭제에 앞서 팝빌 연동회원을 먼저 탈퇴 처리했습니다.", {
          customerId,
          customerName: customer.customerName,
          environment: quitResult.environment
        });
      } else if (quitResult.status === "already-missing") {
        popbillCleanupStatus = "already-missing-on-delete";
        await requestStore.createLog("warn", "popbill", "고객 삭제 전에 팝빌 회원 탈퇴를 시도했지만 이미 존재하지 않아 로컬 삭제만 진행했습니다.", {
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
        error: autoJoin.error ?? "팝빌 가입에 실패했습니다.",
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
    await requestStore.createLog("warn", "popbill", "고객의 팝빌 로컬 연결 상태를 초기화했습니다.", {
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
    await requestStore.createLog("warn", "popbill", "팝빌 연동회원 탈퇴를 처리했습니다.", {
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
