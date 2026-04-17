import assert from "node:assert/strict";
import test from "node:test";
import { RenewalAutomationManager } from "./renewal-automation.js";
import { encryptSecret } from "./secret-box.js";
import { REDACTED_SENSITIVE_VALUE } from "./utils.js";

function createProbeResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    process: {
      detected: true,
      names: ["kcaseagt"],
      detail: null
    },
    bridge: {
      summary: "ok",
      ports: [],
      versionProbe: {
        ok: true,
        sourcePort: 443,
        values: {
          kpmcnt: "1",
          kpmsvc: "1",
          secukitNX: "1"
        },
        error: null
      },
      licenseProbe: {
        ok: true,
        sourcePort: 443,
        error: null
      },
      storageProbe: {
        ok: true,
        sourcePort: 443,
        mediaType: "HDD",
        certificateCount: 1,
        certificates: [
          {
            index: "1",
            cn: "한빛발전소",
            issuerToName: "금융결제원",
            usageToName: "전자세금용",
            todate: null,
            oid: null,
            serial: "SERIAL-1",
            userDN: "USER-DN-1",
            validateFrom: null,
            detailValidateTo: null,
            certDirPath: "C:/Users/User/NPKI/hanbit"
          }
        ],
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
    },
    notes: [],
    ...overrides
  };
}

test("queueRenewalPreflight strips issuePassword before storing renewal job payload", async () => {
  const insertedPayloads: Array<Record<string, unknown>> = [];
  const manager = Object.create(RenewalAutomationManager.prototype) as RenewalAutomationManager;

  Object.assign(manager as object, {
    client: {
      from(table: string) {
        assert.equal(table, "renewal_automation_jobs");
        return {
          insert(payload: Record<string, unknown>) {
            insertedPayloads.push(payload);
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: 11,
                      type: payload.type,
                      status: payload.status,
                      customer_id: payload.customer_id,
                      customer_name: payload.customer_name,
                      certificate_index: payload.certificate_index,
                      certificate_cn: payload.certificate_cn,
                      requested_at: payload.requested_at,
                      claimed_at: null,
                      finished_at: null,
                      requested_by: payload.requested_by,
                      claimed_by: null,
                      summary: payload.summary,
                      error: null,
                      result_json: null,
                      comparison_profile_json: payload.comparison_profile_json ?? null,
                      submission_profile_json: payload.submission_profile_json ?? null,
                      execute_submit: payload.execute_submit ?? false
                    },
                    error: null
                  })
                };
              }
            };
          }
        };
      }
    }
  });

  const job = await manager.queueRenewalPreflight({
    customerId: 77,
    customerName: "한빛발전소",
    certificateIndex: 1,
    certificateCn: "한빛발전소",
    submissionProfile: {
      contactName: "담당자",
      contactDepartment: "",
      contactEmail: "ops@example.com",
      contactTel: "02-1234-5678",
      contactFax: "",
      contactMobile: "010-1111-2222",
      issuePassword: "123456"
    }
  });

  assert.equal(insertedPayloads.length, 1);
  assert.deepEqual(insertedPayloads[0]?.submission_profile_json, {
    contactName: "담당자",
    contactDepartment: "",
    contactEmail: "ops@example.com",
    contactTel: "02-1234-5678",
    contactFax: "",
    contactMobile: "010-1111-2222",
    issuePassword: ""
  });
  assert.equal(job.submissionProfile?.issuePassword, "");
});

test("claimNextJob rehydrates issuePassword for the agent while keeping stored result paths redacted", async () => {
  process.env.AUTO_TAX_ENCRYPTION_KEY = "test-renewal-automation-key";
  const manager = Object.create(RenewalAutomationManager.prototype) as RenewalAutomationManager;
  const claimedRow = {
    id: 21,
    type: "renewal-preflight",
    status: "claimed",
    customer_id: 77,
    customer_name: "한빛발전소",
    certificate_index: 1,
    certificate_cn: "한빛발전소",
    requested_at: "2026-04-17T00:00:00.000Z",
    claimed_at: "2026-04-17T00:01:00.000Z",
    finished_at: null,
    requested_by: "web-ui",
    claimed_by: "agent-1",
    summary: "queued",
    error: null,
    result_json: createProbeResult(),
    comparison_profile_json: null,
    submission_profile_json: {
      contactName: "담당자",
      contactDepartment: "",
      contactEmail: "ops@example.com",
      contactTel: "02-1234-5678",
      contactFax: "",
      contactMobile: "010-1111-2222",
      issuePassword: ""
    },
    execute_submit: false
  };

  Object.assign(manager as object, {
    client: {
      async rpc(method: string, args: Record<string, unknown>) {
        assert.equal(method, "claim_next_renewal_automation_job");
        assert.equal(args.p_agent_id, "agent-1");
        return { data: [claimedRow], error: null };
      },
      from(table: string) {
        if (table === "managed_customers") {
          return {
            select() {
              return {
                eq(column: string, value: unknown) {
                  assert.equal(column, "legacy_id");
                  assert.equal(value, 77);
                  return {
                    maybeSingle: async () => ({
                      data: { organization_id: "org-1" },
                      error: null
                    })
                  };
                }
              };
            }
          };
        }

        assert.equal(table, "organization_integrations");
        return {
          select() {
            return {
              eq(column: string, value: unknown) {
                assert.equal(column, "organization_id");
                assert.equal(value, "org-1");
                return {
                  maybeSingle: async () => ({
                    data: {
                      renewal_issue_password_encrypted: encryptSecret("654321")
                    },
                    error: null
                  })
                };
              }
            };
          }
        };
      }
    }
  });

  const job = await manager.claimNextJob("agent-1");

  assert.equal(job?.submissionProfile?.issuePassword, "654321");
  assert.equal(job?.result?.bridge.storageProbe.certificates[0]?.certDirPath, REDACTED_SENSITIVE_VALUE);
});
