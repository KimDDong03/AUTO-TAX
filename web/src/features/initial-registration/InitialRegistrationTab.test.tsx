import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInitialRegistrationReviewMessages,
  getInitialRegistrationFlowState
} from "./InitialRegistrationTab";

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

test("initial registration starts with target selection after helper certificate read", () => {
  const flow = getInitialRegistrationFlowState({
    ...baseInput,
    templateDownloaded: false,
    previewReady: false,
    hasSelectedFile: false
  });

  assert.equal(flow.stage, "download");
  assert.equal(flow.primaryActionLabel, "대상 선택");
  assert.equal(flow.stepItems[0]?.title, "등록 대상 선택");
});

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
  assert.equal(flow.stepItems[2]?.status, "current");
  assert.equal(flow.stepItems[2]?.description, "가입 대기 2건");
  assert.equal(flow.stepItems[3]?.status, "locked");
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
  assert.equal(flow.stepItems[2]?.status, "complete");
  assert.equal(flow.stepItems[3]?.status, "current");
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
  assert.equal(flow.primaryActionLabel, "공동인증서 등록");
  assert.equal(flow.stepItems[3]?.description, "등록 대기 130건");
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
  assert.equal(flow.stepItems[3]?.description, "확인 필요 3건");
});

test("initial registration review messages expose blocked row details", () => {
  const messages = buildInitialRegistrationReviewMessages({
    error: "",
    preview: {
      previewId: "preview-1",
      totalCustomers: 2,
      createCount: 0,
      updateCount: 0,
      blockedCount: 2,
      totalPlants: 2,
      totalCertificates: 0,
      fileErrors: [],
      rows: [
        {
          rowIndex: 1,
          customerName: "유학현",
          businessNumber: "1111111111",
          corpName: "유학현 발전소",
          plantCount: 1,
          certificateCount: 0,
          status: "blocked",
          errors: ["발행 가능 공동인증서를 확인하지 못했습니다."],
          warnings: [],
          canImport: false
        },
        {
          rowIndex: 2,
          customerName: "하달용",
          businessNumber: "2222222222",
          corpName: "하달용 발전소",
          plantCount: 1,
          certificateCount: 0,
          status: "blocked",
          errors: ["이미 다른 고객에 등록된 매칭 주소입니다."],
          warnings: [],
          canImport: false
        }
      ]
    }
  });

  assert.deepEqual(messages, [
    "유학현 발전소: 발행 가능 공동인증서를 확인하지 못했습니다.",
    "하달용 발전소: 이미 다른 고객에 등록된 매칭 주소입니다."
  ]);
});

test("initial registration review messages include HomeTax lookup errors", () => {
  const messages = buildInitialRegistrationReviewMessages({
    preview: null,
    error:
      "발전소 시트 (유학현): 사업자정보 조회 실패: 홈택스 로그인 세션에서 사업자번호를 찾지 못했습니다.\n" +
      "발전소 시트 (하달용): 사업자정보 조회 실패: 홈택스 로그인 세션에서 사업자번호를 찾지 못했습니다."
  });

  assert.deepEqual(messages, [
    "발전소 시트 (유학현): 사업자정보 조회 실패: 홈택스 로그인 세션에서 사업자번호를 찾지 못했습니다.",
    "발전소 시트 (하달용): 사업자정보 조회 실패: 홈택스 로그인 세션에서 사업자번호를 찾지 못했습니다."
  ]);
});

test("initial registration review messages include preview warnings", () => {
  const messages = buildInitialRegistrationReviewMessages({
    error: "",
    preview: {
      previewId: "preview-1",
      totalCustomers: 1,
      createCount: 1,
      updateCount: 0,
      blockedCount: 0,
      totalPlants: 0,
      totalCertificates: 1,
      fileErrors: [],
      rows: [
        {
          rowIndex: 4,
          customerName: "유학현",
          businessNumber: "1234567890",
          corpName: "유학현",
          plantCount: 0,
          certificateCount: 1,
          status: "create",
          errors: [],
          warnings: ["사업장 주소가 없어 고객 등록 후 고객 관리에서 보완하세요."],
          canImport: true
        }
      ]
    }
  });

  assert.deepEqual(messages, [
    "유학현: 사업장 주소가 없어 고객 등록 후 고객 관리에서 보완하세요."
  ]);
});
