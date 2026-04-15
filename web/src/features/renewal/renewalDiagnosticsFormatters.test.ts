import test from "node:test";
import assert from "node:assert/strict";
import type {
  RenewalAgentStatus,
  RenewalAutomationJob,
  RenewalBridgeCertificateSummary,
  RenewalBridgePreflightProbe
} from "../../types";
import {
  formatRenewalBridgeSummary,
  formatRenewalJobLabel,
  formatRenewalJobStatusLabel,
  formatRenewalPathCell,
  formatRenewalPreflightSummary,
  formatRenewalStorageSummary
} from "./renewalDiagnosticsFormatters";

function createCertificate(
  overrides: Partial<RenewalBridgeCertificateSummary> = {}
): RenewalBridgeCertificateSummary {
  return {
    index: "1",
    cn: "한빛태양광",
    issuerToName: "issuer",
    usageToName: "전자세금용",
    todate: "2026-12-31",
    oid: null,
    serial: "SERIAL-1",
    userDN: "USER-DN-1",
    validateFrom: null,
    detailValidateTo: null,
    certDirPath: "C:/certs/hanbit",
    ...overrides
  };
}

function createPreflightProbe(
  overrides: Partial<RenewalBridgePreflightProbe> = {}
): RenewalBridgePreflightProbe {
  return {
    ok: false,
    sourcePort: 7443,
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
    error: null,
    ...overrides
  };
}

function createAgent(overrides: Partial<RenewalAgentStatus> = {}): RenewalAgentStatus {
  return {
    online: true,
    staleAfterSeconds: 60,
    agentId: "agent-1",
    hostname: "HOST-1",
    version: "1.2.3",
    os: "win32",
    lastHeartbeatAt: "2026-04-15T00:00:00.000Z",
    process: {
      detected: true,
      names: ["renewal-agent"],
      detail: null
    },
    bridge: {
      summary: "ok",
      ports: [
        { port: 7443, protocol: "https", reachable: true, latencyMs: 12, error: null },
        { port: 7080, protocol: "http", reachable: false, latencyMs: null, error: "timeout" }
      ],
      versionProbe: {
        ok: true,
        sourcePort: 7443,
        values: {
          kpmcnt: "1.0.0",
          kpmsvc: "1.1.0",
          secukitNX: "2.0.0"
        },
        error: null
      },
      licenseProbe: {
        ok: true,
        sourcePort: 7443,
        error: null
      },
      storageProbe: {
        ok: true,
        sourcePort: 7443,
        mediaType: "HDD",
        certificateCount: 3,
        certificates: [
          createCertificate(),
          createCertificate({ index: "2", cn: "둘째인증서", todate: "2027-01-31" }),
          createCertificate({ index: "3", cn: "셋째인증서", todate: "2027-02-28" })
        ],
        error: null
      },
      selectionProbe: {
        ok: true,
        sourcePort: 7443,
        certificateIndex: "1",
        certificateCn: "한빛태양광",
        certID: "CERT-001",
        error: null
      },
      preflightProbe: createPreflightProbe({
        ok: true,
        certificateIndex: "1",
        certificateCn: "한빛태양광",
        branch: "renew-info",
        renewInfoAutoSubmitSummary: "자동 입력 12개",
        renewInfoSubmitSummary: "제출 준비 완료",
        nextUrl: "https://example.com/renew"
      })
    },
    notes: [],
    ...overrides
  };
}

function createJob(overrides: Partial<RenewalAutomationJob> = {}): RenewalAutomationJob {
  return {
    id: 1,
    type: "renewal-preflight",
    status: "completed",
    customerId: null,
    customerName: null,
    certificateIndex: 1,
    certificateCn: "한빛태양광",
    requestedAt: "2026-04-15T00:00:00.000Z",
    claimedAt: "2026-04-15T00:00:01.000Z",
    finishedAt: "2026-04-15T00:00:02.000Z",
    requestedBy: "tester",
    claimedBy: "tester",
    summary: "요약",
    error: null,
    result: {
      process: {
        detected: true,
        names: ["renewal-agent"],
        detail: null
      },
      bridge: {
        summary: "ok",
        ports: [],
        versionProbe: {
          ok: false,
          sourcePort: null,
          values: { kpmcnt: null, kpmsvc: null, secukitNX: null },
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
        preflightProbe: createPreflightProbe({
          ok: true,
          certificateIndex: "1",
          certificateCn: "한빛태양광",
          branch: "renew-info",
          renewInfoAutoSubmitSummary: "자동 입력 12개",
          renewInfoSubmitSummary: "제출 준비 완료",
          nextUrl: "https://example.com/renew"
        })
      },
      notes: []
    },
    ...overrides
  };
}

test("formatRenewalBridgeSummary preserves per-port connectivity labels", () => {
  const summary = formatRenewalBridgeSummary(createAgent());
  assert.equal(summary, "7443/https 연결됨 · 7080/http 실패");
});

test("formatRenewalStorageSummary keeps preview truncation text stable", () => {
  const summary = formatRenewalStorageSummary(createAgent());
  assert.equal(summary, "3건 · 한빛태양광 (2026-12-31) · 둘째인증서 (2027-01-31) 외 1건");
});

test("formatRenewalPreflightSummary includes renew-info submit details", () => {
  const summary = formatRenewalPreflightSummary(createAgent());
  assert.equal(
    summary,
    "한빛태양광 · 순정 갱신 · 신청정보 입력 · 자동 입력 12개 · 제출 준비 완료 · https://example.com/renew"
  );
});

test("formatRenewalPathCell keeps apply-form and renew-info branch labels stable", () => {
  const certificate = createCertificate();
  const renewInfoPath = formatRenewalPathCell(certificate, [createJob()]);
  const externalFlowPath = formatRenewalPathCell(certificate, [
    createJob({
      result: {
        process: {
          detected: true,
          names: ["renewal-agent"],
          detail: null
        },
        bridge: {
          summary: "ok",
          ports: [],
          versionProbe: {
            ok: false,
            sourcePort: null,
            values: { kpmcnt: null, kpmsvc: null, secukitNX: null },
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
          preflightProbe: createPreflightProbe({
            ok: true,
            certificateIndex: "1",
            certificateCn: "한빛태양광",
            branch: "change-company",
            issueCompany: "기존기관",
            externalFlowKind: "apply-form",
            externalFlowProductName: "범용 신규신청"
          })
        },
        notes: []
      }
    })
  ]);

  assert.equal(renewInfoPath, "순정 갱신 · 신청정보 입력 · 자동 입력 12개 · 제출 준비 완료");
  assert.equal(externalFlowPath, "순정 갱신 아님 · 기존기관 · 범용 신규신청");
});

test("renewal job labels and statuses preserve ops console wording", () => {
  assert.equal(formatRenewalJobStatusLabel("queued"), "대기");
  assert.equal(
    formatRenewalJobLabel(createJob({ type: "certid-probe", certificateIndex: 4, certificateCn: null })),
    "certID 조회 #4"
  );
  assert.equal(
    formatRenewalJobLabel(createJob({ type: "bridge-probe", customerName: null })),
    "인증서 목록 진단"
  );
});
