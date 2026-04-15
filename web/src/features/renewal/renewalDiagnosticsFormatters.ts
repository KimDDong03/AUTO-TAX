import { getLatestRenewalPreflightProbeForCertificate } from "./customerRenewalCertificateUtils";
import type {
  RenewalAgentCertificate,
  RenewalAgentSnapshot,
  RenewalJob
} from "./useRenewalAssistantState";

export function formatRenewalBridgeSummary(agent: RenewalAgentSnapshot): string {
  if (agent.bridge.ports.length === 0) {
    return "포트 진단 전";
  }

  return agent.bridge.ports
    .map((port) => `${port.port}/${port.protocol} ${port.reachable ? "연결됨" : "실패"}`)
    .join(" · ");
}

export function formatRenewalVersionSummary(agent: RenewalAgentSnapshot): string {
  const versionProbe = agent.bridge.versionProbe;
  if (!versionProbe.ok) {
    return versionProbe.error ?? "GetVersion 미실행";
  }

  return [
    `secukitNX ${versionProbe.values.secukitNX ?? "-"}`,
    `kpmcnt ${versionProbe.values.kpmcnt ?? "-"}`,
    `kpmsvc ${versionProbe.values.kpmsvc ?? "-"}`
  ].join(" · ");
}

export function formatRenewalLicenseSummary(agent: RenewalAgentSnapshot): string {
  const licenseProbe = agent.bridge.licenseProbe;
  if (!licenseProbe.ok) {
    return licenseProbe.error ?? "라이선스 미검증";
  }

  return `정상 (${licenseProbe.sourcePort ?? "-"})`;
}

export function formatRenewalStorageSummary(agent: RenewalAgentSnapshot): string {
  const storageProbe = agent.bridge.storageProbe;
  if (!storageProbe.ok) {
    return storageProbe.error ?? "HDD 인증서 미조회";
  }

  if (storageProbe.certificateCount === 0) {
    return "인증서 없음";
  }

  const preview = storageProbe.certificates
    .slice(0, 2)
    .map((certificate) => `${certificate.cn || "이름 없음"} (${certificate.todate ?? "-"})`)
    .join(" · ");
  const suffix = storageProbe.certificateCount > 2 ? ` 외 ${storageProbe.certificateCount - 2}건` : "";
  return `${storageProbe.certificateCount}건 · ${preview}${suffix}`;
}

export function formatRenewalSelectionSummary(agent: RenewalAgentSnapshot): string {
  const selectionProbe = agent.bridge.selectionProbe;
  if (
    !selectionProbe.ok &&
    !selectionProbe.error &&
    !selectionProbe.certificateIndex &&
    !selectionProbe.certificateCn &&
    !selectionProbe.certID
  ) {
    return "certID 미조회";
  }

  const label =
    selectionProbe.certificateCn ||
    (selectionProbe.certificateIndex ? `인증서 #${selectionProbe.certificateIndex}` : "인증서");
  if (selectionProbe.ok) {
    return `${label} · ${selectionProbe.certID ?? "-"}`;
  }

  return `${label} · ${selectionProbe.error ?? "조회 실패"}`;
}

export function formatRenewalPreflightSummary(agent: RenewalAgentSnapshot): string {
  const preflightProbe = agent.bridge.preflightProbe;
  if (
    !preflightProbe.ok &&
    !preflightProbe.error &&
    !preflightProbe.message &&
    !preflightProbe.certificateIndex &&
    !preflightProbe.certificateCn
  ) {
    return "갱신 경로 미분석";
  }

  const label =
    preflightProbe.certificateCn ||
    (preflightProbe.certificateIndex ? `인증서 #${preflightProbe.certificateIndex}` : "인증서");
  if (preflightProbe.ok) {
    const branchText =
      preflightProbe.branch === "change-company" &&
      preflightProbe.externalFlowKind === "apply-form"
        ? `순정 갱신 아님 (${preflightProbe.issueCompany ?? "-"} -> 외부 신규신청)`
        : preflightProbe.branch === "change-company"
          ? `기관변경 필요 (${preflightProbe.issueCompany ?? "-"})`
          : preflightProbe.branch === "renew-payment"
            ? "순정 갱신 · 결제 단계"
            : preflightProbe.branch === "password-confirm"
              ? "순정 갱신 · 발급 직전 비밀번호 확인"
              : preflightProbe.branch === "renew-info"
                ? "순정 갱신 · 신청정보 입력"
                : preflightProbe.branch;
    const externalFlowText =
      preflightProbe.branch === "change-company" &&
      preflightProbe.externalFlowKind === "apply-form"
        ? `외부 신규신청형${
            preflightProbe.externalFlowProductName ? ` (${preflightProbe.externalFlowProductName})` : ""
          }`
        : null;
    const urlText = preflightProbe.externalFlowSubmitUrl ?? preflightProbe.nextUrl;
    const autoSubmitText = preflightProbe.renewInfoAutoSubmitSummary;
    const submitReadyText =
      preflightProbe.renewInfoSubmitSummary &&
      preflightProbe.renewInfoSubmitSummary !== autoSubmitText
        ? preflightProbe.renewInfoSubmitSummary
        : null;
    return `${label} · ${branchText}${externalFlowText ? ` · ${externalFlowText}` : ""}${
      autoSubmitText ? ` · ${autoSubmitText}` : ""
    }${submitReadyText ? ` · ${submitReadyText}` : ""}${urlText ? ` · ${urlText}` : ""}`;
  }

  return `${label} · ${preflightProbe.error ?? preflightProbe.message ?? "분석 실패"}`;
}

export function formatRenewalPathCell(
  certificate: RenewalAgentCertificate,
  jobs: RenewalJob[],
  agent?: RenewalAgentSnapshot | null
): string {
  const preflightProbe = getLatestRenewalPreflightProbeForCertificate(certificate, jobs, agent);
  if (!preflightProbe) {
    return "-";
  }
  if (!preflightProbe.ok) {
    return preflightProbe.error ?? preflightProbe.message ?? "분석 실패";
  }

  if (
    preflightProbe.branch === "change-company" &&
    preflightProbe.externalFlowKind === "apply-form"
  ) {
    return `순정 갱신 아님 · ${preflightProbe.issueCompany ?? "-"} · ${
      preflightProbe.externalFlowProductName ?? "외부 신규신청"
    }`;
  }

  if (preflightProbe.branch === "renew-payment") {
    return "순정 갱신 · 이미 결제 단계";
  }

  if (preflightProbe.branch === "password-confirm") {
    return "순정 갱신 · 이미 발급 직전";
  }

  if (preflightProbe.branch === "renew-info") {
    const summaryParts = [
      preflightProbe.renewInfoAutoSubmitSummary,
      preflightProbe.renewInfoSubmitSummary
    ].filter(
      (value, index, values): value is string =>
        Boolean(value) && values.indexOf(value) === index
    );
    return summaryParts.length > 0
      ? `순정 갱신 · 신청정보 입력 · ${summaryParts.join(" · ")}`
      : "순정 갱신 · 신청정보 입력";
  }

  return preflightProbe.nextUrl ?? preflightProbe.branch;
}

export function formatRenewalJobStatusLabel(status: RenewalJob["status"]): string {
  if (status === "queued") return "대기";
  if (status === "claimed") return "실행 중";
  if (status === "completed") return "완료";
  return "실패";
}

export function formatRenewalJobLabel(job: RenewalJob): string {
  if (job.type === "certid-probe") {
    return (
      job.certificateCn ||
      (job.certificateIndex !== null ? `certID 조회 #${job.certificateIndex}` : "certID 조회")
    );
  }

  if (job.type === "renewal-preflight") {
    return (
      job.certificateCn ||
      (job.certificateIndex !== null ? `갱신 경로 분석 #${job.certificateIndex}` : "갱신 경로 분석")
    );
  }

  return job.customerName ?? "인증서 목록 진단";
}
