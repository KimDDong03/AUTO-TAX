import assert from "node:assert/strict";
import test from "node:test";
import { getInitialRegistrationFlowState } from "./InitialRegistrationTab";

const baseInput = {
  helperReady: true,
  helperCertificateCount: 3,
  registrationReady: false,
  certificateReady: false,
  certificateAutoTargetCount: 0,
  certificatePendingJoinCount: 0,
  certificateFailedJoinCount: 0,
  certificateRetryCount: 0,
  certificateRegistrationRunning: false,
  templateDownloaded: true,
  previewReady: true,
  commitDone: false,
  importableCount: 2,
  blockedCount: 0,
  hasSelectedFile: true
};

test("initial registration keeps certificate step locked while customer join is pending", () => {
  const flow = getInitialRegistrationFlowState({
    ...baseInput,
    commitDone: true,
    importableCount: 0,
    certificatePendingJoinCount: 2
  });

  assert.equal(flow.stage, "commit");
  assert.equal(flow.commitCompleted, false);
  assert.equal(flow.blockedReason, "발행 연동 가입 대기 2건");
  assert.equal(flow.stepItems[1]?.status, "current");
  assert.equal(flow.stepItems[1]?.description, "가입 대기 2건");
  assert.equal(flow.stepItems[2]?.status, "locked");
});

test("initial registration opens certificate step after customers are joined", () => {
  const flow = getInitialRegistrationFlowState({
    ...baseInput,
    registrationReady: true,
    commitDone: true,
    importableCount: 0,
    certificateAutoTargetCount: 2
  });

  assert.equal(flow.stage, "certificate");
  assert.equal(flow.commitCompleted, true);
  assert.equal(flow.stepItems[1]?.status, "complete");
  assert.equal(flow.stepItems[2]?.status, "current");
});

test("initial registration does not label in-progress certificate attempts as retries", () => {
  const flow = getInitialRegistrationFlowState({
    ...baseInput,
    registrationReady: true,
    commitDone: true,
    importableCount: 0,
    certificateAutoTargetCount: 130,
    certificateRetryCount: 122,
    certificateRegistrationRunning: true
  });

  assert.equal(flow.stage, "certificate");
  assert.equal(flow.description, "등록 대기 130건");
  assert.equal(flow.primaryActionLabel, "공동인증서 반영");
  assert.equal(flow.stepItems[2]?.description, "등록 대기 130건");
});

test("initial registration labels attempted remaining certificate targets as needing review after processing", () => {
  const flow = getInitialRegistrationFlowState({
    ...baseInput,
    registrationReady: true,
    commitDone: true,
    importableCount: 0,
    certificateAutoTargetCount: 3,
    certificateRetryCount: 3,
    certificateRegistrationRunning: false
  });

  assert.equal(flow.stage, "certificate");
  assert.equal(flow.description, "확인 필요 3건");
  assert.equal(flow.primaryActionLabel, "공동인증서 다시 확인");
  assert.equal(flow.stepItems[2]?.description, "확인 필요 3건");
});
