import type { Express, Request, Response } from "express";
import type { z } from "zod";
import type { AppSettings, Customer, CustomerInput } from "../domain.js";
import type { CertificateRefreshResult } from "../certificate-monitor.js";
import { checkIsMember, getCertificateExpireDate, getTaxCertURL, quitMember } from "../popbill-client.js";
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
};

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
    refreshAllCertificateStatuses
  } = deps;

  app.get("/api/customers", async (_req, res) => {
    const requestStore = getRequestStore(res, store);
    res.json((await requestStore.listCustomers()).map(toClientCustomer));
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
    const payload = normalizeCustomerInput(customerSchema.parse(req.body));
    const customer = await requestStore.saveCustomer(payload, customerId);
    await requestStore.createLog("info", "customers", "고객 정보를 수정했습니다.", { customerId });
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
      const settings = await getServerManagedSettings(requestStore);
      if (settings.popbillIsTest) {
        try {
          await quitMember(settings, customer, "AUTO-TAX 테스트 고객 삭제");
          popbillCleanupStatus = "quit-on-delete";
          await requestStore.createLog("warn", "popbill", "테스트 환경 고객 삭제와 함께 팝빌 테스트 회원을 탈퇴 처리했습니다.", {
            customerId,
            customerName: customer.customerName
          });
        } catch (error) {
          const fallbackMemberState = await checkIsMember(settings, customer.businessNumber).catch(() => false);
          if (fallbackMemberState) {
            throw error;
          }
          popbillCleanupStatus = "already-missing-on-delete";
          await requestStore.createLog("warn", "popbill", "테스트 환경 고객 삭제 시 팝빌 회원이 이미 없어 로컬 삭제만 진행했습니다.", {
            customerId,
            customerName: customer.customerName,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    await requestStore.deleteCustomer(customerId);
    await requestStore.createLog("warn", "customers", "고객과 관련 로컬 데이터를 삭제했습니다.", {
      customerId,
      customerName: customer.customerName,
      popbillCleanupStatus
    });
    res.json({ ok: true });
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
    if (!settings.popbillIsTest) {
      res.status(400).json({ error: "팝빌 탈퇴는 테스트 환경에서만 허용됩니다." });
      return;
    }

    const response = await quitMember(settings, customer, "AUTO-TAX 테스트 정리");
    const updated = await requestStore.resetCustomerPopbill(customerId);
    await requestStore.createLog("warn", "popbill", "팝빌 테스트 연동회원을 탈퇴 처리했습니다.", {
      customerId,
      customerName: customer.customerName
    });
    res.json({ ok: true, response, customer: toClientCustomer(updated) });
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
    res.json(toClientCustomer(updated));
  });

  app.post("/api/popbill/cert-status/refresh-all", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const result = await refreshAllCertificateStatuses(requestStore);
    res.json(result);
  });
}
