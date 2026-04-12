import type { Express, Response } from "express";
import { z } from "zod";
import { HttpError } from "../http-errors.js";
import { RenewalAutomationManager } from "../renewal-automation.js";
import { createSupabaseAdminClient } from "../supabase.js";
import { SupabaseStore } from "../supabase-store.js";
import type {
  RenewalAgentHeartbeat,
  RenewalBridgeProbeResult,
  RenewalBridgeCertificateSummary,
  RenewalPreflightComparisonProfile,
  RenewalPreflightSubmissionProfile
} from "../domain.js";
import {
  buildRenewalComparisonProfile,
  buildRenewalSubmissionProfile,
  selectAutoRenewalCertificate
} from "../services/renewal-customer-sync.js";
import type { AppStore } from "../store-contract.js";
import type {
  RequireAuthContext,
  RequirePlatformAdmin,
  RequireWorkspaceEditor,
  RequireRenewalAgentAccess,
  RequestStoreGetter
} from "../route-types.js";

type CustomerTargetPayload = { customerId?: number | null };
type ParseSchema = {
  parse: (input: unknown) => unknown;
};

async function getCustomerStoreForCustomerId(customerId: number): Promise<{ customerStore: AppStore; customer: NonNullable<Awaited<ReturnType<AppStore["getCustomer"]>>> }> {
  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("managed_customers")
    .select("organization_id")
    .eq("legacy_id", customerId)
    .maybeSingle();
  if (error) {
    throw new Error(`고객 작업공간 조회 실패: ${error.message}`);
  }

  const organizationId = typeof data?.organization_id === "string" ? data.organization_id : "";
  if (!organizationId) {
    throw new Error("고객 작업공간을 찾지 못했습니다.");
  }

  const customerStore = new SupabaseStore({
    organizationId,
    bootstrapOrganization: false
  });
  const customer = await customerStore.getCustomer(customerId);
  if (!customer) {
    throw new Error("고객을 찾지 못했습니다.");
  }

  return { customerStore, customer };
}

async function syncCustomerTaxProfileFromPreflight(customerId: number, result: RenewalBridgeProbeResult): Promise<{
  synced: boolean;
  bizType: string | null;
  bizClass: string | null;
}> {
  const snapshot = result.bridge.preflightProbe.renewInfoSnapshot;
  const bizType = snapshot?.bizType?.trim() || null;
  const bizClass = snapshot?.bizClass?.trim() || null;
  if (!bizType || !bizClass) {
    return {
      synced: false,
      bizType,
      bizClass
    };
  }

  const { customerStore } = await getCustomerStoreForCustomerId(customerId);
  await customerStore.updateCustomerTaxProfile(customerId, bizType, bizClass);
  return {
    synced: true,
    bizType,
    bizClass
  };
}

async function resolveCustomerContext(
  payload: CustomerTargetPayload,
  deps: {
    store: AppStore | null;
    getRequestStore: RequestStoreGetter;
  },
  res: Response
) {
  let customerName: string | null = null;
  let comparisonProfile: RenewalPreflightComparisonProfile | null = null;
  let submissionProfile: RenewalPreflightSubmissionProfile | null = null;
  let requestStore: AppStore | null = null;

  if (payload.customerId !== undefined && payload.customerId !== null) {
    requestStore = deps.getRequestStore(res, deps.store);
    const customer = await requestStore.getCustomer(payload.customerId);
    if (!customer) {
      throw new HttpError(404, "고객을 찾지 못했습니다.");
    }
    customerName = customer.customerName;
    comparisonProfile = buildRenewalComparisonProfile(customer);
    submissionProfile = buildRenewalSubmissionProfile(await requestStore.getSettings(), customer);
  }

  return { customerName, comparisonProfile, submissionProfile, requestStore };
}

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requirePlatformAdmin: RequirePlatformAdmin;
  requireAuthContext: RequireAuthContext;
  requireWorkspaceEditor: RequireWorkspaceEditor;
  requireRenewalAgentAccess: RequireRenewalAgentAccess;
  renewalAutomation: RenewalAutomationManager;
  renewalBridgeProbeRequestSchema: ParseSchema;
  renewalCertIdProbeRequestSchema: ParseSchema;
  renewalPreflightRequestSchema: ParseSchema;
  renewalAgentHeartbeatSchema: ParseSchema;
  renewalAgentClaimSchema: ParseSchema;
  renewalAgentCompleteSchema: ParseSchema;
  renewalAgentFailSchema: ParseSchema;
};

function buildWorkspaceRequesterKey(session: { userId: string; activeOrganizationId?: string | null }) {
  return `${session.userId}:${session.activeOrganizationId ?? "workspace"}`;
}

function isRequesterOwnedJob(requesterKey: string, job: { requestedBy: string; type: string }) {
  return requesterKey === job.requestedBy && (job.type === "bridge-probe" || job.type === "renewal-preflight");
}

function selectLatestRequesterCertificates(
  jobs: Array<{
    type: string;
    status: string;
    result: RenewalBridgeProbeResult | null;
  }>
): RenewalBridgeCertificateSummary[] {
  const latestCompletedBridgeProbe = jobs.find(
    (job) => job.type === "bridge-probe" && job.status === "completed" && job.result?.bridge.storageProbe.ok
  );

  return latestCompletedBridgeProbe?.result?.bridge.storageProbe.certificates ?? [];
}

export function registerRenewalRoutes(deps: RouteDeps) {
  const {
    app,
    store,
    getRequestStore,
    requirePlatformAdmin,
    requireAuthContext,
    requireWorkspaceEditor,
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

  const customerOnboardingPreflightRequestSchema = z.object({
    certificateIndex: z.number().int().positive(),
    certificateCn: z.string().nullable().optional()
  });

  app.get("/api/automation/renewal-agent/snapshot", async (_req, res) => {
    requirePlatformAdmin(res);
    res.json(await renewalAutomation.getSnapshot());
  });

  app.get("/api/customer-onboarding/renewal", async (_req, res) => {
    const workspaceSession = requireWorkspaceEditor(res);
    const requesterKey = buildWorkspaceRequesterKey(workspaceSession);
    const snapshot = await renewalAutomation.getSnapshot();
    const jobs = snapshot.jobs.filter((job) => isRequesterOwnedJob(requesterKey, job));

    res.json({
      agentOnline: snapshot.agent.online,
      jobs,
      certificates: selectLatestRequesterCertificates(jobs)
    });
  });

  app.post("/api/customer-onboarding/renewal/bridge-probe", async (_req, res) => {
    const workspaceSession = requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const requesterKey = buildWorkspaceRequesterKey(workspaceSession);
    const job = await renewalAutomation.queueBridgeProbe({
      requestedBy: requesterKey,
      customerName: workspaceSession.activeOrganizationName
    });

    await requestStore.createLog("info", "renewal-agent", "고객 등록용 로컬 인증서 목록 진단 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      organizationId: workspaceSession.activeOrganizationId
    });

    res.status(201).json(job);
  });

  app.post("/api/customer-onboarding/renewal/preflight", async (req, res) => {
    const workspaceSession = requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const requesterKey = buildWorkspaceRequesterKey(workspaceSession);
    const payload = customerOnboardingPreflightRequestSchema.parse(req.body ?? {});
    const job = await renewalAutomation.queueRenewalPreflight({
      certificateIndex: payload.certificateIndex,
      certificateCn: payload.certificateCn ?? null,
      requestedBy: requesterKey
    });

    await requestStore.createLog("info", "renewal-agent", "고객 등록용 공동인증서 갱신 경로 분석 작업을 큐에 추가했습니다.", {
      jobId: job.id,
      organizationId: workspaceSession.activeOrganizationId,
      certificateIndex: job.certificateIndex,
      certificateCn: job.certificateCn
    });

    res.status(201).json(job);
  });

  app.post("/api/automation/renewal-jobs/bridge-probe", async (req, res) => {
    requirePlatformAdmin(res);
    const payload = renewalBridgeProbeRequestSchema.parse(req.body ?? {}) as CustomerTargetPayload;
    const { customerName, requestStore } = await resolveCustomerContext(payload, { store, getRequestStore }, res);

    const job = await renewalAutomation.queueBridgeProbe({
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
    const payload = renewalCertIdProbeRequestSchema.parse(req.body ?? {}) as CustomerTargetPayload & {
      certificateIndex: number;
      certificateCn?: string | null;
    };
    const { customerName, requestStore } = await resolveCustomerContext(payload, { store, getRequestStore }, res);

    const job = await renewalAutomation.queueCertIdProbe({
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
    const payload = renewalPreflightRequestSchema.parse(req.body ?? {}) as CustomerTargetPayload & {
      certificateIndex: number;
      certificateCn?: string | null;
      executeSubmit?: boolean;
    };
    const { customerName, comparisonProfile, submissionProfile, requestStore } = await resolveCustomerContext(payload, { store, getRequestStore }, res);

    const job = await renewalAutomation.queueRenewalPreflight({
      customerId: payload.customerId ?? null,
      customerName,
      certificateIndex: payload.certificateIndex,
      certificateCn: payload.certificateCn ?? null,
      comparisonProfile,
      submissionProfile,
      executeSubmit: payload.executeSubmit === true,
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

  app.post("/api/automation/renewal-agent/heartbeat", async (req, res) => {
    requireRenewalAgentAccess(req);
    const payload = renewalAgentHeartbeatSchema.parse(req.body) as RenewalAgentHeartbeat;
    const agent = await renewalAutomation.recordHeartbeat(payload);
    res.json({ ok: true, agent });
  });

  app.post("/api/automation/renewal-agent/jobs/claim", async (req, res) => {
    requireRenewalAgentAccess(req);
    const payload = renewalAgentClaimSchema.parse(req.body) as { agentId: string };
    const job = await renewalAutomation.claimNextJob(payload.agentId);
    res.json({ job });
  });

  app.post("/api/automation/renewal-agent/jobs/:id/complete", async (req, res) => {
    requireRenewalAgentAccess(req);
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = renewalAgentCompleteSchema.parse(req.body) as {
      agentId: string;
      result: RenewalBridgeProbeResult;
    };
    const job = await renewalAutomation.completeJob(params.id, payload.agentId, payload.result);
    let taxProfileSync: {
      synced: boolean;
      bizType: string | null;
      bizClass: string | null;
    } | null = null;
    let autoQueuedPreflightJobId: number | null = null;

    if (job.type === "bridge-probe" && job.customerId && payload.result.bridge.storageProbe.ok) {
      try {
        const { customerStore, customer } = await getCustomerStoreForCustomerId(job.customerId);
        const matchedCertificate = selectAutoRenewalCertificate(payload.result.bridge.storageProbe.certificates, customer);
        if (matchedCertificate) {
          const autoJob = await renewalAutomation.queueRenewalPreflight({
            customerId: customer.id,
            customerName: customer.customerName,
            certificateIndex: Number(matchedCertificate.index),
            certificateCn: matchedCertificate.cn,
            comparisonProfile: buildRenewalComparisonProfile(customer),
            submissionProfile: buildRenewalSubmissionProfile(await customerStore.getSettings(), customer),
            requestedBy: "renewal-agent-auto"
          });
          autoQueuedPreflightJobId = autoJob.id;
        } else if (store) {
          await store.createLog("warn", "renewal-agent", "인증서 등록 후 자동 분석용 공동인증서를 자동 매칭하지 못했습니다.", {
            jobId: job.id,
            customerId: job.customerId
          });
        }
      } catch (error) {
        if (store) {
          await store.createLog("warn", "renewal-agent", "인증서 등록 후 자동 분석 작업 준비에 실패했습니다.", {
            jobId: job.id,
            customerId: job.customerId,
            error: error instanceof Error ? error.message : "원인 미상"
          });
        }
      }
    }

    if (job.type === "renewal-preflight" && job.customerId && payload.result.bridge.preflightProbe.ok) {
      try {
        taxProfileSync = await syncCustomerTaxProfileFromPreflight(job.customerId, payload.result);
      } catch (error) {
        if (store) {
          await store.createLog("warn", "renewal-agent", "인증서 분석 업태/업종 자동 반영에 실패했습니다.", {
            jobId: job.id,
            customerId: job.customerId,
            error: error instanceof Error ? error.message : "원인 미상"
          });
        }
      }
    }

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
          summary: job.summary,
          taxProfileSync,
          autoQueuedPreflightJobId
        }
      );
    }

    res.json(job);
  });

  app.post("/api/automation/renewal-agent/jobs/:id/fail", async (req, res) => {
    requireRenewalAgentAccess(req);
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const payload = renewalAgentFailSchema.parse(req.body) as { agentId: string; error: string };
    const job = await renewalAutomation.failJob(params.id, payload.agentId, payload.error);

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
