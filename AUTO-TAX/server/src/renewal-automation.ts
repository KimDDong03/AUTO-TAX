import type {
  RenewalAgentBridgeStatus,
  RenewalAgentHeartbeat,
  RenewalAgentPortStatus,
  RenewalAgentProcessStatus,
  RenewalAgentStatus,
  RenewalAutomationJob,
  RenewalAutomationPayload,
  RenewalPreflightComparisonProfile,
  RenewalBridgeProbeResult
} from "./domain.js";
import { nowIso } from "./utils.js";

const AGENT_STALE_AFTER_SECONDS = 90;
const JOB_CLAIM_TIMEOUT_SECONDS = 180;
const MAX_JOB_HISTORY = 20;

type StoredHeartbeat = RenewalAgentHeartbeat & {
  receivedAt: string;
};

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
    comparisonProfile: job.comparisonProfile ? { ...job.comparisonProfile } : null
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
    const autoSubmitSuffix = probe.renewInfoAutoSubmitSummary ? ` / ${probe.renewInfoAutoSubmitSummary}` : "";
    const nextStep =
      probe.branch === "change-company" && probe.externalFlowKind === "apply-form"
        ? `순정 갱신 아님 (${probe.issueCompany ?? "-"}) -> 외부 신규신청형 ${probe.externalFlowProductName ?? "신청서"}`
        : probe.branch === "renew-info" && probe.renewInfoPaymentPreviewTotalAmount
          ? `${probe.nextUrl ?? probe.branch} / 예상 결제 ${probe.renewInfoPaymentPreviewTotalAmount}${autoSubmitSuffix}`
          : probe.branch === "renew-info"
            ? `${probe.nextUrl ?? probe.branch}${autoSubmitSuffix}`
          : probe.nextUrl ?? probe.branch;
    return `${certificateLabel} 갱신 경로 분석 성공: ${nextStep}`;
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
  private heartbeat: StoredHeartbeat | null = null;
  private jobs: RenewalAutomationJob[] = [];
  private nextJobId = 1;

  recordHeartbeat(input: RenewalAgentHeartbeat): RenewalAgentStatus {
    this.requeueStaleClaimedJobs();
    this.heartbeat = {
      ...input,
      receivedAt: nowIso()
    };
    return this.getAgentStatus();
  }

  getAgentStatus(): RenewalAgentStatus {
    this.requeueStaleClaimedJobs();

    if (!this.heartbeat) {
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

    const now = Date.now();
    const lastHeartbeatAt = this.heartbeat.receivedAt;
    const online = now - new Date(lastHeartbeatAt).getTime() <= AGENT_STALE_AFTER_SECONDS * 1000;

    return cloneStatus({
      online,
      staleAfterSeconds: AGENT_STALE_AFTER_SECONDS,
      agentId: this.heartbeat.agentId,
      hostname: this.heartbeat.hostname,
      version: this.heartbeat.version,
      os: this.heartbeat.os,
      lastHeartbeatAt,
      process: this.heartbeat.process,
      bridge: this.heartbeat.bridge,
      notes: this.heartbeat.notes
    });
  }

  getSnapshot(): RenewalAutomationPayload {
    this.requeueStaleClaimedJobs();
    return {
      agent: this.getAgentStatus(),
      jobs: this.jobs.map(cloneJob)
    };
  }

  queueBridgeProbe(args?: {
    customerId?: number | null;
    customerName?: string | null;
    requestedBy?: string;
  }): RenewalAutomationJob {
    this.requeueStaleClaimedJobs();

    const requestedAt = nowIso();
    const customerName = args?.customerName?.trim() || null;
    const job: RenewalAutomationJob = {
      id: this.nextJobId,
      type: "bridge-probe",
      status: "queued",
      customerId: args?.customerId ?? null,
      customerName,
      certificateIndex: null,
      certificateCn: null,
      requestedAt,
      claimedAt: null,
      finishedAt: null,
      requestedBy: args?.requestedBy?.trim() || "web-ui",
      claimedBy: null,
      summary: getQueuedSummary({
        type: "bridge-probe",
        customerName,
        certificateIndex: null,
        certificateCn: null
      }),
      error: null,
      comparisonProfile: null,
      result: null
    };

    this.nextJobId += 1;
    this.jobs.unshift(job);
    this.pruneJobs();
    return cloneJob(job);
  }

  queueCertIdProbe(args: {
    certificateIndex: number;
    certificateCn?: string | null;
    customerId?: number | null;
    customerName?: string | null;
    requestedBy?: string;
  }): RenewalAutomationJob {
    this.requeueStaleClaimedJobs();

    const requestedAt = nowIso();
    const customerName = args.customerName?.trim() || null;
    const certificateCn = args.certificateCn?.trim() || null;
    const job: RenewalAutomationJob = {
      id: this.nextJobId,
      type: "certid-probe",
      status: "queued",
      customerId: args.customerId ?? null,
      customerName,
      certificateIndex: args.certificateIndex,
      certificateCn,
      requestedAt,
      claimedAt: null,
      finishedAt: null,
      requestedBy: args.requestedBy?.trim() || "web-ui",
      claimedBy: null,
      summary: getQueuedSummary({
        type: "certid-probe",
        customerName,
        certificateIndex: args.certificateIndex,
        certificateCn
      }),
      error: null,
      comparisonProfile: null,
      result: null
    };

    this.nextJobId += 1;
    this.jobs.unshift(job);
    this.pruneJobs();
    return cloneJob(job);
  }

  queueRenewalPreflight(args: {
    certificateIndex: number;
    certificateCn?: string | null;
    customerId?: number | null;
    customerName?: string | null;
    comparisonProfile?: RenewalPreflightComparisonProfile | null;
    requestedBy?: string;
  }): RenewalAutomationJob {
    this.requeueStaleClaimedJobs();

    const requestedAt = nowIso();
    const customerName = args.customerName?.trim() || null;
    const certificateCn = args.certificateCn?.trim() || null;
    const job: RenewalAutomationJob = {
      id: this.nextJobId,
      type: "renewal-preflight",
      status: "queued",
      customerId: args.customerId ?? null,
      customerName,
      certificateIndex: args.certificateIndex,
      certificateCn,
      requestedAt,
      claimedAt: null,
      finishedAt: null,
      requestedBy: args.requestedBy?.trim() || "web-ui",
      claimedBy: null,
      summary: getQueuedSummary({
        type: "renewal-preflight",
        customerName,
        certificateIndex: args.certificateIndex,
        certificateCn
      }),
      error: null,
      comparisonProfile: args.comparisonProfile ? { ...args.comparisonProfile } : null,
      result: null
    };

    this.nextJobId += 1;
    this.jobs.unshift(job);
    this.pruneJobs();
    return cloneJob(job);
  }

  claimNextJob(agentId: string): RenewalAutomationJob | null {
    this.requeueStaleClaimedJobs();
    const queued = [...this.jobs]
      .filter((job) => job.status === "queued")
      .sort((left, right) => left.id - right.id)[0];

    if (!queued) {
      return null;
    }

    queued.status = "claimed";
    queued.claimedBy = agentId;
    queued.claimedAt = nowIso();
    queued.summary = getClaimedSummary(queued);
    return cloneJob(queued);
  }

  completeJob(jobId: number, agentId: string, result: RenewalBridgeProbeResult): RenewalAutomationJob {
    const job = this.findJob(jobId);
    const clonedResult: RenewalBridgeProbeResult = {
      process: {
        ...result.process,
        names: [...result.process.names]
      },
      bridge: {
        summary: result.bridge.summary,
        ports: result.bridge.ports.map((port) => ({ ...port })),
        versionProbe: {
          ok: result.bridge.versionProbe.ok,
          sourcePort: result.bridge.versionProbe.sourcePort,
          values: {
            ...result.bridge.versionProbe.values
          },
          error: result.bridge.versionProbe.error
        },
        licenseProbe: {
          ok: result.bridge.licenseProbe.ok,
          sourcePort: result.bridge.licenseProbe.sourcePort,
          error: result.bridge.licenseProbe.error
        },
        storageProbe: {
          ok: result.bridge.storageProbe.ok,
          sourcePort: result.bridge.storageProbe.sourcePort,
          mediaType: result.bridge.storageProbe.mediaType,
          certificateCount: result.bridge.storageProbe.certificateCount,
          certificates: result.bridge.storageProbe.certificates.map((certificate) => ({ ...certificate })),
          error: result.bridge.storageProbe.error
        },
        selectionProbe: {
          ok: result.bridge.selectionProbe.ok,
          sourcePort: result.bridge.selectionProbe.sourcePort,
          certificateIndex: result.bridge.selectionProbe.certificateIndex,
          certificateCn: result.bridge.selectionProbe.certificateCn,
          certID: result.bridge.selectionProbe.certID,
          error: result.bridge.selectionProbe.error
        },
        preflightProbe: {
          ok: result.bridge.preflightProbe.ok,
          sourcePort: result.bridge.preflightProbe.sourcePort,
          certificateIndex: result.bridge.preflightProbe.certificateIndex,
          certificateCn: result.bridge.preflightProbe.certificateCn,
          certID: result.bridge.preflightProbe.certID,
          branch: result.bridge.preflightProbe.branch,
          branchPageUrl: result.bridge.preflightProbe.branchPageUrl,
          issueCompany: result.bridge.preflightProbe.issueCompany,
          companyChkYn: result.bridge.preflightProbe.companyChkYn,
          policy: result.bridge.preflightProbe.policy,
          orderNo: result.bridge.preflightProbe.orderNo,
          orderSeq: result.bridge.preflightProbe.orderSeq,
          orderStatus: result.bridge.preflightProbe.orderStatus,
          orderApplySeCd: result.bridge.preflightProbe.orderApplySeCd,
          payYn: result.bridge.preflightProbe.payYn,
          nextUrl: result.bridge.preflightProbe.nextUrl,
          renewInfoPageTitle: result.bridge.preflightProbe.renewInfoPageTitle,
          renewInfoSubmitUrl: result.bridge.preflightProbe.renewInfoSubmitUrl,
          renewInfoSubmitPathKind: result.bridge.preflightProbe.renewInfoSubmitPathKind,
          renewInfoFormFieldNames: [...result.bridge.preflightProbe.renewInfoFormFieldNames],
          renewInfoMustHaveFieldNames: [...result.bridge.preflightProbe.renewInfoMustHaveFieldNames],
          renewInfoFinalNum: result.bridge.preflightProbe.renewInfoFinalNum,
          renewInfoSnapshot: result.bridge.preflightProbe.renewInfoSnapshot
            ? { ...result.bridge.preflightProbe.renewInfoSnapshot }
            : null,
          renewInfoBlockingMismatchFields: [...result.bridge.preflightProbe.renewInfoBlockingMismatchFields],
          renewInfoAutoSubmitReady: result.bridge.preflightProbe.renewInfoAutoSubmitReady,
          renewInfoAutoSubmitSummary: result.bridge.preflightProbe.renewInfoAutoSubmitSummary,
          renewInfoPaymentPreviewLoaded: result.bridge.preflightProbe.renewInfoPaymentPreviewLoaded,
          renewInfoPaymentPreviewItems: [...result.bridge.preflightProbe.renewInfoPaymentPreviewItems],
          renewInfoPaymentPreviewTotalAmount: result.bridge.preflightProbe.renewInfoPaymentPreviewTotalAmount,
          renewInfoPaymentPreviewHasAdditionalAgreement:
            result.bridge.preflightProbe.renewInfoPaymentPreviewHasAdditionalAgreement,
          actionImageUrl: result.bridge.preflightProbe.actionImageUrl,
          actionImageAlt: result.bridge.preflightProbe.actionImageAlt,
          externalFlowKind: result.bridge.preflightProbe.externalFlowKind,
          externalFlowProductName: result.bridge.preflightProbe.externalFlowProductName,
          externalFlowProductId: result.bridge.preflightProbe.externalFlowProductId,
          externalFlowSubmitUrl: result.bridge.preflightProbe.externalFlowSubmitUrl,
          externalFlowSubmitPathKind: result.bridge.preflightProbe.externalFlowSubmitPathKind,
          rawCode: result.bridge.preflightProbe.rawCode,
          message: result.bridge.preflightProbe.message,
          error: result.bridge.preflightProbe.error
        }
      },
      notes: [...result.notes]
    };

    job.status = "completed";
    job.claimedBy = job.claimedBy ?? agentId;
    job.claimedAt = job.claimedAt ?? nowIso();
    job.finishedAt = nowIso();
    job.error = null;
    job.result = clonedResult;
    job.summary =
      job.type === "certid-probe"
        ? summarizeSelectionProbeResult(job, result)
        : job.type === "renewal-preflight"
          ? summarizePreflightProbeResult(job, result)
          : summarizeProbeResult(result);

    if (this.heartbeat && this.heartbeat.agentId === agentId) {
      this.heartbeat = {
        ...this.heartbeat,
        receivedAt: nowIso(),
        process: clonedResult.process,
        bridge: clonedResult.bridge,
        notes: clonedResult.notes
      };
    }

    return cloneJob(job);
  }

  failJob(jobId: number, agentId: string, error: string): RenewalAutomationJob {
    const job = this.findJob(jobId);
    job.status = "failed";
    job.claimedBy = job.claimedBy ?? agentId;
    job.claimedAt = job.claimedAt ?? nowIso();
    job.finishedAt = nowIso();
    job.error = error;
    job.summary = getFailedSummary(job);
    return cloneJob(job);
  }

  private findJob(jobId: number): RenewalAutomationJob {
    this.requeueStaleClaimedJobs();
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job) {
      throw new Error("해당 갱신 자동화 작업을 찾지 못했습니다.");
    }
    return job;
  }

  private requeueStaleClaimedJobs(): void {
    const now = Date.now();
    for (const job of this.jobs) {
      if (job.status !== "claimed" || !job.claimedAt) {
        continue;
      }

      const elapsedMs = now - new Date(job.claimedAt).getTime();
      if (elapsedMs <= JOB_CLAIM_TIMEOUT_SECONDS * 1000) {
        continue;
      }

      job.status = "queued";
      job.claimedAt = null;
      job.claimedBy = null;
      job.finishedAt = null;
      job.error = "이전 에이전트 응답이 없어 대기열로 재등록했습니다.";
      job.summary = getRequeuedSummary(job);
    }
  }

  private pruneJobs(): void {
    if (this.jobs.length <= MAX_JOB_HISTORY) {
      return;
    }
    this.jobs = this.jobs.slice(0, MAX_JOB_HISTORY);
  }
}
