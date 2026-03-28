import type { Express, Response } from "express";
import { z } from "zod";
import { HttpError } from "../http-errors.js";
import { RenewalAutomationManager } from "../renewal-automation.js";
import type {
  RenewalAgentHeartbeat,
  RenewalBridgeProbeResult
} from "../domain.js";
import type { AppStore } from "../store-contract.js";
import type {
  RequireAuthContext,
  RequirePlatformAdmin,
  RequireRenewalAgentAccess,
  RequestStoreGetter
} from "../route-types.js";

type CustomerTargetPayload = { customerId?: number | null };

async function resolveCustomerContext(
  payload: CustomerTargetPayload,
  deps: {
    store: AppStore | null;
    getRequestStore: RequestStoreGetter;
  },
  res: Response
) {
  let customerName: string | null = null;
  let requestStore: AppStore | null = null;

  if (payload.customerId !== undefined && payload.customerId !== null) {
    requestStore = deps.getRequestStore(res, deps.store);
    const customer = await requestStore.getCustomer(payload.customerId);
    if (!customer) {
      throw new HttpError(404, "고객을 찾지 못했습니다.");
    }
    customerName = customer.customerName;
  }

  return { customerName, requestStore };
}

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requirePlatformAdmin: RequirePlatformAdmin;
  requireAuthContext: RequireAuthContext;
  requireRenewalAgentAccess: RequireRenewalAgentAccess;
  renewalAutomation: RenewalAutomationManager;
  renewalBridgeProbeRequestSchema: z.ZodType<{
    customerId?: number | null;
  }>;
  renewalCertIdProbeRequestSchema: z.ZodType<{
    customerId?: number | null;
    certificateIndex: number;
    certificateCn?: string | null;
  }>;
  renewalPreflightRequestSchema: z.ZodType<{
    customerId?: number | null;
    certificateIndex: number;
    certificateCn?: string | null;
  }>;
  renewalAgentHeartbeatSchema: z.ZodType<RenewalAgentHeartbeat>;
  renewalAgentClaimSchema: z.ZodType<{ agentId: string }>;
  renewalAgentCompleteSchema: z.ZodType<{ agentId: string; result: RenewalBridgeProbeResult }>;
  renewalAgentFailSchema: z.ZodType<{ agentId: string; error: string }>;
};

export function registerRenewalRoutes(deps: RouteDeps) {
  const {
    app,
    store,
    getRequestStore,
    requirePlatformAdmin,
    requireAuthContext,
    requireRenewalAgentAccess,
    renewalAutomation,
    renewalBridgeProbeRequestSchema,
    renewalCertIdProbeRequestSchema,
    renewalPreflightRequestSchema,
    renewalAgentHeartbeatSchema,
    renewalAgentClaimSchema,
    renewalAgentCompleteSchema,
    renewalAgentFailSchema
  } = deps;

  app.get("/api/automation/renewal-agent/snapshot", (_req, res) => {
    requirePlatformAdmin(res);
    res.json(renewalAutomation.getSnapshot());
  });

  app.post("/api/automation/renewal-jobs/bridge-probe", async (req, res) => {
    requirePlatformAdmin(res);
    const payload = renewalBridgeProbeRequestSchema.parse(req.body ?? {});
    const { customerName, requestStore } = await resolveCustomerContext(payload, { store, getRequestStore }, res);

    const job = renewalAutomation.queueBridgeProbe({
      customerId: payload.customerId ?? null,
      customerName,
      requestedBy: requireAuthContext(res).email ?? "web-ui"
    });

    await requestStore?.createLog("info", "renewal-agent", "로컬 인증서 목록 진단 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-jobs/certid-probe", async (req, res) => {
    requirePlatformAdmin(res);
    const payload = renewalCertIdProbeRequestSchema.parse(req.body ?? {});
    const { customerName, requestStore } = await resolveCustomerContext(payload, { store, getRequestStore }, res);

    const job = renewalAutomation.queueCertIdProbe({
      customerId: payload.customerId ?? null,
      customerName,
      certificateIndex: payload.certificateIndex,
      certificateCn: payload.certificateCn ?? null,
      requestedBy: requireAuthContext(res).email ?? "web-ui"
    });

    await requestStore?.createLog("info", "renewal-agent", "로컬 인증서 certID 조회 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName,
      certificateIndex: job.certificateIndex,
      certificateCn: job.certificateCn
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-jobs/preflight", async (req, res) => {
    requirePlatformAdmin(res);
    const payload = renewalPreflightRequestSchema.parse(req.body ?? {});
    const { customerName, requestStore } = await resolveCustomerContext(payload, { store, getRequestStore }, res);

    const job = renewalAutomation.queueRenewalPreflight({
      customerId: payload.customerId ?? null,
      customerName,
      certificateIndex: payload.certificateIndex,
      certificateCn: payload.certificateCn ?? null,
      requestedBy: requireAuthContext(res).email ?? "web-ui"
    });

    await requestStore?.createLog("info", "renewal-agent", "로컬 인증서 갱신 경로 분석 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName,
      certificateIndex: job.certificateIndex,
      certificateCn: job.certificateCn
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-agent/heartbeat", (req, res) => {
    requireRenewalAgentAccess(req);
    const payload = renewalAgentHeartbeatSchema.parse(req.body);
    const agent = renewalAutomation.recordHeartbeat(payload);
    res.json({ ok: true, agent });
  });

  app.post("/api/automation/renewal-agent/jobs/claim", (req, res) => {
    requireRenewalAgentAccess(req);
    const payload = renewalAgentClaimSchema.parse(req.body);
    const job = renewalAutomation.claimNextJob(payload.agentId);
    res.json({ job });
  });

  app.post("/api/automation/renewal-agent/jobs/:id/complete", async (req, res) => {
    requireRenewalAgentAccess(req);
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = renewalAgentCompleteSchema.parse(req.body);
    const job = renewalAutomation.completeJob(params.id, payload.agentId, payload.result);

    if (store) {
      await store.createLog(
        "info",
        "renewal-agent",
        job.type === "certid-probe"
          ? "로컬 인증서 certID 조회 작업이 완료되었습니다."
          : job.type === "renewal-preflight"
            ? "로컬 인증서 갱신 경로 분석 작업이 완료되었습니다."
            : "로컬 인증서 목록 진단 작업이 완료되었습니다.",
        {
          jobId: job.id,
          type: job.type,
          claimedBy: job.claimedBy,
          summary: job.summary
        }
      );
    }

    res.json(job);
  });

  app.post("/api/automation/renewal-agent/jobs/:id/fail", async (req, res) => {
    requireRenewalAgentAccess(req);
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = renewalAgentFailSchema.parse(req.body);
    const job = renewalAutomation.failJob(params.id, payload.agentId, payload.error);

    if (store) {
      await store.createLog(
        "warn",
        "renewal-agent",
        job.type === "certid-probe"
          ? "로컬 인증서 certID 조회 작업이 실패했습니다."
          : job.type === "renewal-preflight"
            ? "로컬 인증서 갱신 경로 분석 작업이 실패했습니다."
            : "로컬 인증서 목록 진단 작업이 실패했습니다.",
        {
          jobId: job.id,
          type: job.type,
          claimedBy: job.claimedBy,
          error: job.error
        }
      );
    }

    res.json(job);
  });
}
