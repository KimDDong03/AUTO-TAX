import type {
  RenewalAgentBridgeStatus,
  RenewalAgentHeartbeat,
  RenewalAgentPortStatus,
  RenewalAgentProcessStatus,
  RenewalAgentStatus,
  RenewalAutomationJob,
  RenewalAutomationPayload,
  RenewalBridgeProbeResult,
  RenewalPreflightComparisonProfile,
  RenewalPreflightSubmissionProfile
} from "./domain.js";
import { decryptSecret } from "./secret-box.js";
import { createSupabaseAdminClient } from "./supabase.js";
import { nowIso, sanitizeSensitiveData, sanitizeSensitiveText } from "./utils.js";

const AGENT_STALE_AFTER_SECONDS = 90;
const JOB_CLAIM_TIMEOUT_SECONDS = 180;
const MAX_JOB_HISTORY = 20;

type StoredHeartbeat = RenewalAgentHeartbeat & {
  receivedAt: string;
};

type RenewalHeartbeatRow = {
  agent_id: string;
  hostname: string;
  version: string;
  os: string;
  process_json: RenewalAgentProcessStatus | null;
  bridge_json: RenewalAgentBridgeStatus | null;
  notes_json: string[] | null;
  received_at: string;
};

type RenewalAutomationJobRow = {
  id: number;
  type: RenewalAutomationJob["type"];
  status: RenewalAutomationJob["status"];
  customer_id: number | null;
  customer_name: string | null;
  certificate_index: number | null;
  certificate_cn: string | null;
  requested_at: string;
  claimed_at: string | null;
  finished_at: string | null;
  requested_by: string;
  claimed_by: string | null;
  summary: string | null;
  error: string | null;
  result_json: RenewalBridgeProbeResult | null;
  comparison_profile_json: RenewalPreflightComparisonProfile | null;
  submission_profile_json: RenewalPreflightSubmissionProfile | null;
  execute_submit: boolean | null;
};

export class RenewalAutomationClaimLostError extends Error {
  readonly status = 409;

  constructor(jobId: number) {
    super(`갱신 자동화 작업 ${jobId} 선점이 만료되었거나 다른 에이전트로 이동했습니다.`);
    this.name = "RenewalAutomationClaimLostError";
  }
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function defaultProcessStatus(): RenewalAgentProcessStatus {
  return {
    detected: false,
    names: [],
    detail: null
  };
}

function defaultBridgeStatus(): RenewalAgentBridgeStatus {
  return {
    summary: "unknown",
    ports: [],
    versionProbe: {
      ok: false,
      sourcePort: null,
      values: {
        kpmcnt: null,
        kpmsvc: null,
        secukitNX: null
      },
      error: null
    },
    licenseProbe: {
      ok: false,
      sourcePort: null,
      error: null
    },
    storageProbe: {
      ok: false,
      sourcePort: null,
      mediaType: "HDD",
      certificateCount: 0,
      certificates: [],
      error: null
    },
    selectionProbe: {
      ok: false,
      sourcePort: null,
      certificateIndex: null,
      certificateCn: null,
      certID: null,
      error: null
    },
    preflightProbe: {
      ok: false,
      sourcePort: null,
      certificateIndex: null,
      certificateCn: null,
      certID: null,
      branch: "unknown",
      branchPageUrl: null,
      issueCompany: null,
      companyChkYn: null,
      policy: null,
      orderNo: null,
      orderSeq: null,
      orderStatus: null,
      orderApplySeCd: null,
      payYn: null,
      nextUrl: null,
      renewInfoPageTitle: null,
      renewInfoSubmitUrl: null,
      renewInfoSubmitPathKind: null,
      renewInfoFormFieldNames: [],
      renewInfoMustHaveFieldNames: [],
      renewInfoFinalNum: null,
      renewInfoSnapshot: null,
      renewInfoBlockingMismatchFields: [],
      renewInfoAutoSubmitReady: null,
      renewInfoAutoSubmitSummary: null,
      renewInfoSubmitMissingFields: [],
      renewInfoSubmitReady: null,
      renewInfoSubmitSummary: null,
      renewInfoSubmitAttempted: null,
      renewInfoSubmitResultBranch: null,
      renewInfoSubmitResultUrl: null,
      renewInfoSubmitResultPageTitle: null,
      renewInfoSubmitResultSummary: null,
      renewInfoSubmitResultError: null,
      renewInfoPaymentPreviewLoaded: null,
      renewInfoPaymentPreviewItems: [],
      renewInfoPaymentPreviewTotalAmount: null,
      renewInfoPaymentPreviewHasAdditionalAgreement: null,
      actionImageUrl: null,
      actionImageAlt: null,
      externalFlowKind: null,
      externalFlowProductName: null,
      externalFlowProductId: null,
      externalFlowSubmitUrl: null,
      externalFlowSubmitPathKind: null,
      rawCode: null,
      message: null,
      error: null
    }
  };
}

function cloneJob(job: RenewalAutomationJob): RenewalAutomationJob {
  return {
    ...job,
    result: job.result
      ? {
          process: {
            ...job.result.process,
            names: [...job.result.process.names]
          },
          bridge: {
            summary: job.result.bridge.summary,
            ports: job.result.bridge.ports.map((port) => ({ ...port })),
            versionProbe: {
              ok: job.result.bridge.versionProbe.ok,
              sourcePort: job.result.bridge.versionProbe.sourcePort,
              values: {
                ...job.result.bridge.versionProbe.values
              },
              error: job.result.bridge.versionProbe.error
            },
            licenseProbe: {
              ok: job.result.bridge.licenseProbe.ok,
              sourcePort: job.result.bridge.licenseProbe.sourcePort,
              error: job.result.bridge.licenseProbe.error
            },
            storageProbe: {
              ok: job.result.bridge.storageProbe.ok,
              sourcePort: job.result.bridge.storageProbe.sourcePort,
              mediaType: job.result.bridge.storageProbe.mediaType,
              certificateCount: job.result.bridge.storageProbe.certificateCount,
              certificates: job.result.bridge.storageProbe.certificates.map((certificate) => ({ ...certificate })),
              error: job.result.bridge.storageProbe.error
            },
            selectionProbe: {
              ok: job.result.bridge.selectionProbe.ok,
              sourcePort: job.result.bridge.selectionProbe.sourcePort,
              certificateIndex: job.result.bridge.selectionProbe.certificateIndex,
              certificateCn: job.result.bridge.selectionProbe.certificateCn,
              certID: job.result.bridge.selectionProbe.certID,
              error: job.result.bridge.selectionProbe.error
            },
            preflightProbe: {
              ok: job.result.bridge.preflightProbe.ok,
              sourcePort: job.result.bridge.preflightProbe.sourcePort,
              certificateIndex: job.result.bridge.preflightProbe.certificateIndex,
              certificateCn: job.result.bridge.preflightProbe.certificateCn,
              certID: job.result.bridge.preflightProbe.certID,
              branch: job.result.bridge.preflightProbe.branch,
              branchPageUrl: job.result.bridge.preflightProbe.branchPageUrl,
              issueCompany: job.result.bridge.preflightProbe.issueCompany,
              companyChkYn: job.result.bridge.preflightProbe.companyChkYn,
              policy: job.result.bridge.preflightProbe.policy,
              orderNo: job.result.bridge.preflightProbe.orderNo,
              orderSeq: job.result.bridge.preflightProbe.orderSeq,
              orderStatus: job.result.bridge.preflightProbe.orderStatus,
              orderApplySeCd: job.result.bridge.preflightProbe.orderApplySeCd,
              payYn: job.result.bridge.preflightProbe.payYn,
              nextUrl: job.result.bridge.preflightProbe.nextUrl,
              renewInfoPageTitle: job.result.bridge.preflightProbe.renewInfoPageTitle,
              renewInfoSubmitUrl: job.result.bridge.preflightProbe.renewInfoSubmitUrl,
              renewInfoSubmitPathKind: job.result.bridge.preflightProbe.renewInfoSubmitPathKind,
              renewInfoFormFieldNames: [...job.result.bridge.preflightProbe.renewInfoFormFieldNames],
              renewInfoMustHaveFieldNames: [...job.result.bridge.preflightProbe.renewInfoMustHaveFieldNames],
              renewInfoFinalNum: job.result.bridge.preflightProbe.renewInfoFinalNum,
              renewInfoSnapshot: job.result.bridge.preflightProbe.renewInfoSnapshot
                ? { ...job.result.bridge.preflightProbe.renewInfoSnapshot }
                : null,
              renewInfoBlockingMismatchFields: [...job.result.bridge.preflightProbe.renewInfoBlockingMismatchFields],
              renewInfoAutoSubmitReady: job.result.bridge.preflightProbe.renewInfoAutoSubmitReady,
              renewInfoAutoSubmitSummary: job.result.bridge.preflightProbe.renewInfoAutoSubmitSummary,
              renewInfoSubmitMissingFields: [...job.result.bridge.preflightProbe.renewInfoSubmitMissingFields],
              renewInfoSubmitReady: job.result.bridge.preflightProbe.renewInfoSubmitReady,
              renewInfoSubmitSummary: job.result.bridge.preflightProbe.renewInfoSubmitSummary,
              renewInfoSubmitAttempted: job.result.bridge.preflightProbe.renewInfoSubmitAttempted,
              renewInfoSubmitResultBranch: job.result.bridge.preflightProbe.renewInfoSubmitResultBranch,
              renewInfoSubmitResultUrl: job.result.bridge.preflightProbe.renewInfoSubmitResultUrl,
              renewInfoSubmitResultPageTitle: job.result.bridge.preflightProbe.renewInfoSubmitResultPageTitle,
              renewInfoSubmitResultSummary: job.result.bridge.preflightProbe.renewInfoSubmitResultSummary,
              renewInfoSubmitResultError: job.result.bridge.preflightProbe.renewInfoSubmitResultError,
              renewInfoPaymentPreviewLoaded: job.result.bridge.preflightProbe.renewInfoPaymentPreviewLoaded,
              renewInfoPaymentPreviewItems: [...job.result.bridge.preflightProbe.renewInfoPaymentPreviewItems],
              renewInfoPaymentPreviewTotalAmount: job.result.bridge.preflightProbe.renewInfoPaymentPreviewTotalAmount,
              renewInfoPaymentPreviewHasAdditionalAgreement:
                job.result.bridge.preflightProbe.renewInfoPaymentPreviewHasAdditionalAgreement,
              actionImageUrl: job.result.bridge.preflightProbe.actionImageUrl,
              actionImageAlt: job.result.bridge.preflightProbe.actionImageAlt,
              externalFlowKind: job.result.bridge.preflightProbe.externalFlowKind,
              externalFlowProductName: job.result.bridge.preflightProbe.externalFlowProductName,
              externalFlowProductId: job.result.bridge.preflightProbe.externalFlowProductId,
              externalFlowSubmitUrl: job.result.bridge.preflightProbe.externalFlowSubmitUrl,
              externalFlowSubmitPathKind: job.result.bridge.preflightProbe.externalFlowSubmitPathKind,
              rawCode: job.result.bridge.preflightProbe.rawCode,
              message: job.result.bridge.preflightProbe.message,
              error: job.result.bridge.preflightProbe.error
            }
          },
          notes: [...job.result.notes]
        }
      : null,
    comparisonProfile: job.comparisonProfile ? { ...job.comparisonProfile } : null,
    submissionProfile: job.submissionProfile ? { ...job.submissionProfile } : null
  };
}

function cloneStatus(status: RenewalAgentStatus): RenewalAgentStatus {
  return {
    ...status,
    process: {
      ...status.process,
      names: [...status.process.names]
    },
    bridge: {
      summary: status.bridge.summary,
      ports: status.bridge.ports.map((port) => ({ ...port })),
      versionProbe: {
        ok: status.bridge.versionProbe.ok,
        sourcePort: status.bridge.versionProbe.sourcePort,
        values: {
          ...status.bridge.versionProbe.values
        },
        error: status.bridge.versionProbe.error
      },
      licenseProbe: {
        ok: status.bridge.licenseProbe.ok,
        sourcePort: status.bridge.licenseProbe.sourcePort,
        error: status.bridge.licenseProbe.error
      },
      storageProbe: {
        ok: status.bridge.storageProbe.ok,
        sourcePort: status.bridge.storageProbe.sourcePort,
        mediaType: status.bridge.storageProbe.mediaType,
        certificateCount: status.bridge.storageProbe.certificateCount,
        certificates: status.bridge.storageProbe.certificates.map((certificate) => ({ ...certificate })),
        error: status.bridge.storageProbe.error
      },
      selectionProbe: {
        ok: status.bridge.selectionProbe.ok,
        sourcePort: status.bridge.selectionProbe.sourcePort,
        certificateIndex: status.bridge.selectionProbe.certificateIndex,
        certificateCn: status.bridge.selectionProbe.certificateCn,
        certID: status.bridge.selectionProbe.certID,
        error: status.bridge.selectionProbe.error
      },
      preflightProbe: {
        ok: status.bridge.preflightProbe.ok,
        sourcePort: status.bridge.preflightProbe.sourcePort,
        certificateIndex: status.bridge.preflightProbe.certificateIndex,
        certificateCn: status.bridge.preflightProbe.certificateCn,
        certID: status.bridge.preflightProbe.certID,
        branch: status.bridge.preflightProbe.branch,
        branchPageUrl: status.bridge.preflightProbe.branchPageUrl,
        issueCompany: status.bridge.preflightProbe.issueCompany,
        companyChkYn: status.bridge.preflightProbe.companyChkYn,
        policy: status.bridge.preflightProbe.policy,
        orderNo: status.bridge.preflightProbe.orderNo,
        orderSeq: status.bridge.preflightProbe.orderSeq,
        orderStatus: status.bridge.preflightProbe.orderStatus,
        orderApplySeCd: status.bridge.preflightProbe.orderApplySeCd,
        payYn: status.bridge.preflightProbe.payYn,
        nextUrl: status.bridge.preflightProbe.nextUrl,
        renewInfoPageTitle: status.bridge.preflightProbe.renewInfoPageTitle,
        renewInfoSubmitUrl: status.bridge.preflightProbe.renewInfoSubmitUrl,
        renewInfoSubmitPathKind: status.bridge.preflightProbe.renewInfoSubmitPathKind,
        renewInfoFormFieldNames: [...status.bridge.preflightProbe.renewInfoFormFieldNames],
        renewInfoMustHaveFieldNames: [...status.bridge.preflightProbe.renewInfoMustHaveFieldNames],
        renewInfoFinalNum: status.bridge.preflightProbe.renewInfoFinalNum,
        renewInfoSnapshot: status.bridge.preflightProbe.renewInfoSnapshot
          ? { ...status.bridge.preflightProbe.renewInfoSnapshot }
          : null,
        renewInfoBlockingMismatchFields: [...status.bridge.preflightProbe.renewInfoBlockingMismatchFields],
        renewInfoAutoSubmitReady: status.bridge.preflightProbe.renewInfoAutoSubmitReady,
        renewInfoAutoSubmitSummary: status.bridge.preflightProbe.renewInfoAutoSubmitSummary,
        renewInfoSubmitMissingFields: [...status.bridge.preflightProbe.renewInfoSubmitMissingFields],
        renewInfoSubmitReady: status.bridge.preflightProbe.renewInfoSubmitReady,
        renewInfoSubmitSummary: status.bridge.preflightProbe.renewInfoSubmitSummary,
        renewInfoSubmitAttempted: status.bridge.preflightProbe.renewInfoSubmitAttempted,
        renewInfoSubmitResultBranch: status.bridge.preflightProbe.renewInfoSubmitResultBranch,
        renewInfoSubmitResultUrl: status.bridge.preflightProbe.renewInfoSubmitResultUrl,
        renewInfoSubmitResultPageTitle: status.bridge.preflightProbe.renewInfoSubmitResultPageTitle,
        renewInfoSubmitResultSummary: status.bridge.preflightProbe.renewInfoSubmitResultSummary,
        renewInfoSubmitResultError: status.bridge.preflightProbe.renewInfoSubmitResultError,
        renewInfoPaymentPreviewLoaded: status.bridge.preflightProbe.renewInfoPaymentPreviewLoaded,
        renewInfoPaymentPreviewItems: [...status.bridge.preflightProbe.renewInfoPaymentPreviewItems],
        renewInfoPaymentPreviewTotalAmount: status.bridge.preflightProbe.renewInfoPaymentPreviewTotalAmount,
        renewInfoPaymentPreviewHasAdditionalAgreement:
          status.bridge.preflightProbe.renewInfoPaymentPreviewHasAdditionalAgreement,
        actionImageUrl: status.bridge.preflightProbe.actionImageUrl,
        actionImageAlt: status.bridge.preflightProbe.actionImageAlt,
        externalFlowKind: status.bridge.preflightProbe.externalFlowKind,
        externalFlowProductName: status.bridge.preflightProbe.externalFlowProductName,
        externalFlowProductId: status.bridge.preflightProbe.externalFlowProductId,
        externalFlowSubmitUrl: status.bridge.preflightProbe.externalFlowSubmitUrl,
        externalFlowSubmitPathKind: status.bridge.preflightProbe.externalFlowSubmitPathKind,
        rawCode: status.bridge.preflightProbe.rawCode,
        message: status.bridge.preflightProbe.message,
        error: status.bridge.preflightProbe.error
      }
    },
    notes: [...status.notes]
  };
}

function mapHeartbeatRow(row: RenewalHeartbeatRow): StoredHeartbeat {
  return {
    agentId: row.agent_id,
    hostname: row.hostname,
    version: row.version,
    os: row.os,
    process: row.process_json ?? defaultProcessStatus(),
    bridge: row.bridge_json ?? defaultBridgeStatus(),
    notes: Array.isArray(row.notes_json) ? row.notes_json.map((note) => String(note)) : [],
    receivedAt: row.received_at
  };
}

function mapJobRow(row: RenewalAutomationJobRow): RenewalAutomationJob {
  return cloneJob({
    id: Number(row.id),
    type: row.type,
    status: row.status,
    customerId: row.customer_id ?? null,
    customerName: row.customer_name ?? null,
    certificateIndex: row.certificate_index ?? null,
    certificateCn: row.certificate_cn ?? null,
    requestedAt: row.requested_at,
    claimedAt: row.claimed_at ?? null,
    finishedAt: row.finished_at ?? null,
    requestedBy: row.requested_by,
    claimedBy: row.claimed_by ?? null,
    summary: row.summary ?? "",
    error: row.error ?? null,
    result: row.result_json ?? null,
    comparisonProfile: row.comparison_profile_json ?? null,
    submissionProfile: row.submission_profile_json ?? null,
    executeSubmit: row.execute_submit === true
  });
}

function sanitizeSubmissionProfileForStorage(
  profile: RenewalPreflightSubmissionProfile | null | undefined
): RenewalPreflightSubmissionProfile | null {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    issuePassword: ""
  };
}

function sanitizeJobForExternalRead(job: RenewalAutomationJob): RenewalAutomationJob {
  const clonedJob = cloneJob(job);
  clonedJob.error = clonedJob.error ? sanitizeSensitiveText(clonedJob.error) : null;
  clonedJob.result = clonedJob.result ? (sanitizeSensitiveData(clonedJob.result) as RenewalBridgeProbeResult) : null;
  clonedJob.submissionProfile = sanitizeSubmissionProfileForStorage(clonedJob.submissionProfile);
  return clonedJob;
}

function summarizeBridgePorts(ports: RenewalAgentPortStatus[]): string {
  if (ports.length === 0) {
    return "포트 정보 없음";
  }

  return ports
    .map((port) => `${port.port}/${port.protocol}:${port.reachable ? "연결됨" : "실패"}`)
    .join(", ");
}

function summarizeProbeResult(result: RenewalBridgeProbeResult): string {
  const processSummary = result.process.detected
    ? `프로세스 감지(${result.process.names.join(", ") || "이름 미상"})`
    : "프로세스 미감지";
  const versionSummary = result.bridge.versionProbe.ok
    ? `버전 ${result.bridge.versionProbe.values.secukitNX ?? "-"}`
    : "버전 조회 실패";
  const certSummary = result.bridge.storageProbe.ok
    ? `HDD 인증서 ${result.bridge.storageProbe.certificateCount}건`
    : result.bridge.storageProbe.error
      ? "HDD 인증서 조회 실패"
      : "HDD 인증서 미조회";
  return `${processSummary} / ${summarizeBridgePorts(result.bridge.ports)} / ${versionSummary} / ${certSummary}`;
}

function summarizeSelectionProbeResult(job: RenewalAutomationJob, result: RenewalBridgeProbeResult): string {
  const certificateLabel = job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
  if (result.bridge.selectionProbe.ok) {
    return `${certificateLabel} certID 조회 성공: ${result.bridge.selectionProbe.certID ?? "-"}`;
  }

  return `${certificateLabel} certID 조회 실패: ${result.bridge.selectionProbe.error ?? "원인 미상"}`;
}

function summarizePreflightProbeResult(job: RenewalAutomationJob, result: RenewalBridgeProbeResult): string {
  const certificateLabel = job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
  const probe = result.bridge.preflightProbe;
  if (probe.ok) {
    const nextStep =
      probe.branch === "change-company" && probe.externalFlowKind === "apply-form"
        ? `순정 갱신 아님 (${probe.issueCompany ?? "-"}) -> 외부 신규신청형 ${probe.externalFlowProductName ?? "신청서"}`
        : probe.nextUrl ?? probe.branch;
    return `${certificateLabel} 갱신 경로 분석 성공: ${nextStep}${probe.renewInfoAutoSubmitSummary ? ` / ${probe.renewInfoAutoSubmitSummary}` : ""}`;
  }

  return `${certificateLabel} 갱신 경로 분석 실패: ${probe.error ?? probe.message ?? "원인 미상"}`;
}

function getQueuedSummary(job: Pick<RenewalAutomationJob, "type" | "customerName" | "certificateIndex" | "certificateCn">): string {
  if (job.type === "certid-probe") {
    const certificateLabel =
      job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
    return `${certificateLabel} certID 조회 대기`;
  }

  if (job.type === "renewal-preflight") {
    const certificateLabel =
      job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
    return `${certificateLabel} 갱신 경로 분석 대기`;
  }

  return job.customerName ? `${job.customerName} 기준 인증서 목록 진단 대기` : "인증서 목록 진단 대기";
}

function getClaimedSummary(job: Pick<RenewalAutomationJob, "type" | "customerName" | "certificateIndex" | "certificateCn">): string {
  if (job.type === "certid-probe") {
    const certificateLabel =
      job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
    return `${certificateLabel} certID 조회 실행 중`;
  }

  if (job.type === "renewal-preflight") {
    const certificateLabel =
      job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
    return `${certificateLabel} 갱신 경로 분석 실행 중`;
  }

  return job.customerName ? `${job.customerName} 기준 인증서 목록 진단 실행 중` : "인증서 목록 진단 실행 중";
}

function getFailedSummary(job: Pick<RenewalAutomationJob, "type" | "customerName" | "certificateIndex" | "certificateCn">): string {
  if (job.type === "certid-probe") {
    const certificateLabel =
      job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
    return `${certificateLabel} certID 조회 실패`;
  }

  if (job.type === "renewal-preflight") {
    const certificateLabel =
      job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
    return `${certificateLabel} 갱신 경로 분석 실패`;
  }

  return job.customerName ? `${job.customerName} 기준 인증서 목록 진단 실패` : "인증서 목록 진단 실패";
}

function getRequeuedSummary(job: Pick<RenewalAutomationJob, "type" | "customerName" | "certificateIndex" | "certificateCn">): string {
  if (job.type === "certid-probe") {
    const certificateLabel =
      job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
    return `${certificateLabel} certID 조회 재대기`;
  }

  if (job.type === "renewal-preflight") {
    const certificateLabel =
      job.certificateCn?.trim() || (job.certificateIndex !== null ? `인증서 #${job.certificateIndex}` : "인증서");
    return `${certificateLabel} 갱신 경로 분석 재대기`;
  }

  return job.customerName ? `${job.customerName} 기준 인증서 목록 진단 재대기` : "인증서 목록 진단 재대기";
}

export class RenewalAutomationManager {
  private readonly client = createSupabaseAdminClient();

  async recordHeartbeat(input: RenewalAgentHeartbeat): Promise<RenewalAgentStatus> {
    const receivedAt = nowIso();
    const { error } = await this.client.from("renewal_agent_heartbeats").upsert({
      agent_id: input.agentId,
      hostname: input.hostname,
      version: input.version,
      os: input.os,
      process_json: input.process,
      bridge_json: input.bridge,
      notes_json: input.notes,
      received_at: receivedAt
    });

    if (error) {
      throw new Error(`갱신 에이전트 heartbeat 저장 실패: ${error.message}`);
    }

    return this.getAgentStatus();
  }

  async getAgentStatus(): Promise<RenewalAgentStatus> {
    await this.requeueStaleClaimedJobs();

    const { data, error } = await this.client
      .from("renewal_agent_heartbeats")
      .select("agent_id, hostname, version, os, process_json, bridge_json, notes_json, received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`갱신 에이전트 상태 조회 실패: ${error.message}`);
    }

    if (!data) {
      return {
        online: false,
        staleAfterSeconds: AGENT_STALE_AFTER_SECONDS,
        agentId: null,
        hostname: null,
        version: null,
        os: null,
        lastHeartbeatAt: null,
        process: defaultProcessStatus(),
        bridge: defaultBridgeStatus(),
        notes: []
      };
    }

    const heartbeat = mapHeartbeatRow(data as RenewalHeartbeatRow);
    const online = Date.now() - new Date(heartbeat.receivedAt).getTime() <= AGENT_STALE_AFTER_SECONDS * 1000;

    return cloneStatus({
      online,
      staleAfterSeconds: AGENT_STALE_AFTER_SECONDS,
      agentId: heartbeat.agentId,
      hostname: heartbeat.hostname,
      version: heartbeat.version,
      os: heartbeat.os,
      lastHeartbeatAt: heartbeat.receivedAt,
      process: heartbeat.process,
      bridge: heartbeat.bridge,
      notes: heartbeat.notes
    });
  }

  async getSnapshot(): Promise<RenewalAutomationPayload> {
    await this.requeueStaleClaimedJobs();
    const [agent, jobsResult] = await Promise.all([
      this.getAgentStatus(),
      this.client
        .from("renewal_automation_jobs")
        .select(
          "id, type, status, customer_id, customer_name, certificate_index, certificate_cn, requested_at, claimed_at, finished_at, requested_by, claimed_by, summary, error, result_json, comparison_profile_json, submission_profile_json, execute_submit"
        )
        .order("requested_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MAX_JOB_HISTORY)
    ]);

    if (jobsResult.error) {
      throw new Error(`갱신 자동화 작업 목록 조회 실패: ${jobsResult.error.message}`);
    }

    return {
      agent,
      jobs: (jobsResult.data ?? []).map((row) => sanitizeJobForExternalRead(mapJobRow(row as RenewalAutomationJobRow)))
    };
  }

  async queueBridgeProbe(args?: {
    customerId?: number | null;
    customerName?: string | null;
    requestedBy?: string;
  }): Promise<RenewalAutomationJob> {
    const customerName = args?.customerName?.trim() || null;
    const requestedAt = nowIso();
    const insertPayload = {
      type: "bridge-probe" as const,
      status: "queued" as const,
      customer_id: args?.customerId ?? null,
      customer_name: customerName,
      certificate_index: null,
      certificate_cn: null,
      requested_at: requestedAt,
      requested_by: args?.requestedBy?.trim() || "web-ui",
      summary: getQueuedSummary({
        type: "bridge-probe",
        customerName,
        certificateIndex: null,
        certificateCn: null
      }),
      execute_submit: false
    };

    const { data, error } = await this.client
      .from("renewal_automation_jobs")
      .insert(insertPayload)
      .select(
        "id, type, status, customer_id, customer_name, certificate_index, certificate_cn, requested_at, claimed_at, finished_at, requested_by, claimed_by, summary, error, result_json, comparison_profile_json, submission_profile_json, execute_submit"
      )
      .single();

    if (error) {
      throw new Error(`인증서 목록 진단 작업 생성 실패: ${error.message}`);
    }

    return mapJobRow(data as RenewalAutomationJobRow);
  }

  async queueCertIdProbe(args: {
    certificateIndex: number;
    certificateCn?: string | null;
    customerId?: number | null;
    customerName?: string | null;
    requestedBy?: string;
  }): Promise<RenewalAutomationJob> {
    const customerName = args.customerName?.trim() || null;
    const certificateCn = args.certificateCn?.trim() || null;
    const requestedAt = nowIso();
    const insertPayload = {
      type: "certid-probe" as const,
      status: "queued" as const,
      customer_id: args.customerId ?? null,
      customer_name: customerName,
      certificate_index: args.certificateIndex,
      certificate_cn: certificateCn,
      requested_at: requestedAt,
      requested_by: args.requestedBy?.trim() || "web-ui",
      summary: getQueuedSummary({
        type: "certid-probe",
        customerName,
        certificateIndex: args.certificateIndex,
        certificateCn
      }),
      execute_submit: false
    };

    const { data, error } = await this.client
      .from("renewal_automation_jobs")
      .insert(insertPayload)
      .select(
        "id, type, status, customer_id, customer_name, certificate_index, certificate_cn, requested_at, claimed_at, finished_at, requested_by, claimed_by, summary, error, result_json, comparison_profile_json, submission_profile_json, execute_submit"
      )
      .single();

    if (error) {
      throw new Error(`certID 조회 작업 생성 실패: ${error.message}`);
    }

    return mapJobRow(data as RenewalAutomationJobRow);
  }

  async queueRenewalPreflight(args: {
    certificateIndex: number;
    certificateCn?: string | null;
    customerId?: number | null;
    customerName?: string | null;
    comparisonProfile?: RenewalPreflightComparisonProfile | null;
    submissionProfile?: RenewalPreflightSubmissionProfile | null;
    executeSubmit?: boolean;
    requestedBy?: string;
  }): Promise<RenewalAutomationJob> {
    const customerName = args.customerName?.trim() || null;
    const certificateCn = args.certificateCn?.trim() || null;
    const requestedAt = nowIso();
    const insertPayload = {
      type: "renewal-preflight" as const,
      status: "queued" as const,
      customer_id: args.customerId ?? null,
      customer_name: customerName,
      certificate_index: args.certificateIndex,
      certificate_cn: certificateCn,
      requested_at: requestedAt,
      requested_by: args.requestedBy?.trim() || "web-ui",
      summary: getQueuedSummary({
        type: "renewal-preflight",
        customerName,
        certificateIndex: args.certificateIndex,
        certificateCn
      }),
      comparison_profile_json: args.comparisonProfile ? { ...args.comparisonProfile } : null,
      submission_profile_json: sanitizeSubmissionProfileForStorage(args.submissionProfile),
      execute_submit: args.executeSubmit === true
    };

    const { data, error } = await this.client
      .from("renewal_automation_jobs")
      .insert(insertPayload)
      .select(
        "id, type, status, customer_id, customer_name, certificate_index, certificate_cn, requested_at, claimed_at, finished_at, requested_by, claimed_by, summary, error, result_json, comparison_profile_json, submission_profile_json, execute_submit"
      )
      .single();

    if (error) {
      throw new Error(`갱신 경로 분석 작업 생성 실패: ${error.message}`);
    }

    return mapJobRow(data as RenewalAutomationJobRow);
  }

  async claimNextJob(agentId: string): Promise<RenewalAutomationJob | null> {
    const { data, error } = await this.client.rpc("claim_next_renewal_automation_job", {
      p_agent_id: agentId,
      p_claim_timeout_seconds: JOB_CLAIM_TIMEOUT_SECONDS
    });

    if (error) {
      throw new Error(`갱신 자동화 작업 선점 실패: ${error.message}`);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return null;
    }

    return await this.attachClaimTimeIssuePassword(sanitizeJobForExternalRead(mapJobRow(row as RenewalAutomationJobRow)));
  }

  async completeJob(jobId: number, agentId: string, result: RenewalBridgeProbeResult): Promise<RenewalAutomationJob> {
    const job = await this.findJob(jobId);
    const clonedResult: RenewalBridgeProbeResult = cloneJob({
      ...job,
      result
    }).result as RenewalBridgeProbeResult;
    const storedResult = sanitizeSensitiveData(clonedResult) as RenewalBridgeProbeResult;
    const finishedAt = nowIso();

    const { data, error } = await this.client
      .from("renewal_automation_jobs")
      .update({
        status: "completed",
        claimed_by: job.claimedBy ?? agentId,
        claimed_at: job.claimedAt ?? finishedAt,
        finished_at: finishedAt,
        error: null,
        result_json: storedResult,
        summary:
          job.type === "certid-probe"
            ? summarizeSelectionProbeResult(job, result)
            : job.type === "renewal-preflight"
              ? summarizePreflightProbeResult(job, result)
              : summarizeProbeResult(result)
      })
      .eq("id", jobId)
      .eq("status", "claimed")
      .eq("claimed_by", agentId)
      .select(
        "id, type, status, customer_id, customer_name, certificate_index, certificate_cn, requested_at, claimed_at, finished_at, requested_by, claimed_by, summary, error, result_json, comparison_profile_json, submission_profile_json, execute_submit"
      )
      .maybeSingle();

    if (error) {
      throw new Error(`갱신 자동화 작업 완료 저장 실패: ${error.message}`);
    }
    if (!data) {
      throw new RenewalAutomationClaimLostError(jobId);
    }

    const { error: heartbeatError } = await this.client
      .from("renewal_agent_heartbeats")
      .update({
        process_json: storedResult.process,
        bridge_json: storedResult.bridge,
        notes_json: storedResult.notes,
        received_at: finishedAt
      })
      .eq("agent_id", agentId);

    if (heartbeatError) {
      throw new Error(`갱신 에이전트 상태 갱신 실패: ${heartbeatError.message}`);
    }

    return mapJobRow(data as RenewalAutomationJobRow);
  }

  async failJob(jobId: number, agentId: string, errorMessage: string): Promise<RenewalAutomationJob> {
    const job = await this.findJob(jobId);
    const finishedAt = nowIso();
    const sanitizedErrorMessage = sanitizeSensitiveText(errorMessage);
    const { data, error } = await this.client
      .from("renewal_automation_jobs")
      .update({
        status: "failed",
        claimed_by: job.claimedBy ?? agentId,
        claimed_at: job.claimedAt ?? finishedAt,
        finished_at: finishedAt,
        error: sanitizedErrorMessage,
        summary: getFailedSummary(job)
      })
      .eq("id", jobId)
      .eq("status", "claimed")
      .eq("claimed_by", agentId)
      .select(
        "id, type, status, customer_id, customer_name, certificate_index, certificate_cn, requested_at, claimed_at, finished_at, requested_by, claimed_by, summary, error, result_json, comparison_profile_json, submission_profile_json, execute_submit"
      )
      .maybeSingle();

    if (error) {
      throw new Error(`갱신 자동화 작업 실패 저장 실패: ${error.message}`);
    }
    if (!data) {
      throw new RenewalAutomationClaimLostError(jobId);
    }

    return mapJobRow(data as RenewalAutomationJobRow);
  }

  private async attachClaimTimeIssuePassword(job: RenewalAutomationJob): Promise<RenewalAutomationJob> {
    if (job.type !== "renewal-preflight" || !job.customerId || !job.submissionProfile) {
      return job;
    }

    const { data: customerData, error: customerError } = await this.client
      .from("managed_customers")
      .select("organization_id")
      .eq("legacy_id", job.customerId)
      .maybeSingle();

    if (customerError) {
      throw new Error(`갱신 자동화 작업 고객 작업공간 조회 실패: ${customerError.message}`);
    }

    const organizationId = readNullableString(customerData?.organization_id);
    if (!organizationId) {
      return job;
    }

    const { data: integrationData, error: integrationError } = await this.client
      .from("organization_integrations")
      .select("renewal_issue_password_encrypted")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (integrationError) {
      throw new Error(`갱신 자동화 작업 발급용 임시번호 조회 실패: ${integrationError.message}`);
    }

    const issuePassword = decryptSecret(readNullableString(integrationData?.renewal_issue_password_encrypted) ?? "");
    if (!issuePassword) {
      return job;
    }

    return {
      ...job,
      submissionProfile: {
        ...job.submissionProfile,
        issuePassword
      }
    };
  }

  private async findJob(jobId: number): Promise<RenewalAutomationJob> {
    await this.requeueStaleClaimedJobs();
    const { data, error } = await this.client
      .from("renewal_automation_jobs")
      .select(
        "id, type, status, customer_id, customer_name, certificate_index, certificate_cn, requested_at, claimed_at, finished_at, requested_by, claimed_by, summary, error, result_json, comparison_profile_json, submission_profile_json, execute_submit"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      throw new Error(`갱신 자동화 작업 조회 실패: ${error.message}`);
    }
    if (!data) {
      throw new Error("해당 갱신 자동화 작업을 찾지 못했습니다.");
    }

    return mapJobRow(data as RenewalAutomationJobRow);
  }

  private async requeueStaleClaimedJobs(): Promise<void> {
    const staleBefore = new Date(Date.now() - JOB_CLAIM_TIMEOUT_SECONDS * 1000).toISOString();
    const { data, error } = await this.client
      .from("renewal_automation_jobs")
      .select(
        "id, type, status, customer_id, customer_name, certificate_index, certificate_cn, requested_at, claimed_at, finished_at, requested_by, claimed_by, summary, error, result_json, comparison_profile_json, submission_profile_json, execute_submit"
      )
      .eq("status", "claimed")
      .lt("claimed_at", staleBefore);

    if (error) {
      throw new Error(`갱신 자동화 stale 작업 조회 실패: ${error.message}`);
    }

    for (const row of data ?? []) {
      const job = mapJobRow(row as RenewalAutomationJobRow);
      const { error: updateError } = await this.client
        .from("renewal_automation_jobs")
        .update({
          status: "queued",
          claimed_at: null,
          claimed_by: null,
          finished_at: null,
          error: "이전 에이전트 응답이 없어 대기열로 재등록했습니다.",
          summary: getRequeuedSummary(job)
        })
        .eq("id", row.id)
        .eq("status", "claimed");

      if (updateError) {
        throw new Error(`갱신 자동화 stale 작업 재등록 실패: ${updateError.message}`);
      }
    }
  }
}
