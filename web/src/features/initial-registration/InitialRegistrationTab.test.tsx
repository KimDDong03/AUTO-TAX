import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInitialRegistrationReviewMessages,
  getInitialRegistrationFlowState
} from "./InitialRegistrationTab";
import { buildInitialRegistrationCandidateReviewState } from "./initial-registration-review-model";

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

test("initial registration groups customer commit and certificate registration as one execution step", () => {
  const flow = getInitialRegistrationFlowState(baseInput);

  assert.equal(flow.stage, "commit");
  assert.equal(flow.headline, "지금 할 일 · 초기 등록 실행");
  assert.equal(flow.description, "반영/등록 2건");
  assert.equal(flow.primaryActionLabel, "초기 등록 실행");
  assert.equal(flow.stepItems[2]?.title, "초기 등록 실행");
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

test("initial registration marks done after customer and certificate registration complete", () => {
  const flow = getInitialRegistrationFlowState({
    ...baseInput,
    registrationReady: true,
    certificateReady: true,
    commitDone: true,
    importableCount: 0,
    certificateAutoTargetCount: 0
  });

  assert.equal(flow.stage, "done");
  assert.equal(flow.headline, "고객 등록 완료");
  assert.equal(flow.description, "고객 등록과 공동인증서 등록이 완료되었습니다.");
  assert.equal(flow.primaryActionLabel, "등록 완료");
  assert.equal(flow.stepItems[3]?.status, "complete");
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

test("initial registration candidate review marks password failures on the matching row", () => {
  const review = buildInitialRegistrationCandidateReviewState({
    rows: [
      {
        rowIndex: 1,
        certificateIndex: "10",
        certificateName: "김수용발전소",
        certificateKindLabel: "전자세금용",
        usageName: "",
        issuerName: "",
        expireDate: "",
        certificatePassword: "",
        plantName: "김수용발전소",
        selected: true
      }
    ],
    preview: null,
    error: "",
    passwordFailureEntries: [
      {
        businessNumber: "index:10",
        customerName: "김수용발전소",
        corpName: "사전조회 비밀번호 오류",
        value: ""
      }
    ]
  });

  const row = review.byRowIndex.get(1);
  assert.equal(review.blockingCount, 1);
  assert.equal(row?.status, "needs_fix");
  assert.equal(row?.issues[0]?.code, "password_invalid");
  assert.equal(row?.issues[0]?.needsPassword, true);
});

test("initial registration candidate review marks corrected password failures as needing recheck", () => {
  const review = buildInitialRegistrationCandidateReviewState({
    rows: [
      {
        rowIndex: 1,
        certificateIndex: "10",
        certificateName: "김수용발전소",
        certificateKindLabel: "전자세금용",
        usageName: "",
        issuerName: "",
        expireDate: "",
        certificatePassword: "new-password",
        plantName: "김수용발전소",
        selected: true
      }
    ],
    preview: null,
    error: "",
    passwordFailureEntries: [
      {
        businessNumber: "index:10",
        customerName: "김수용발전소",
        corpName: "사전조회 비밀번호 오류",
        value: "new-password",
        failedPassword: "old-password"
      }
    ]
  });

  const row = review.byRowIndex.get(1);
  assert.equal(review.blockingCount, 1);
  assert.equal(row?.status, "needs_recheck");
  assert.equal(row?.statusLabel, "재확인 필요");
  assert.equal(row?.issues[0]?.code, "password_needs_recheck");
  assert.equal(row?.issues[0]?.needsPassword, true);
});

test("initial registration candidate review matches sheet labels containing parentheses", () => {
  const certificateName = "김부연()001168820231011111001399";
  const review = buildInitialRegistrationCandidateReviewState({
    rows: [
      {
        rowIndex: 3,
        certificateIndex: "23",
        certificateName,
        certificateKindLabel: "전자세금용",
        usageName: "",
        issuerName: "",
        expireDate: "",
        certificatePassword: "",
        plantName: certificateName,
        corpName: certificateName,
        selected: true
      }
    ],
    preview: {
      previewId: "preview-password",
      totalCustomers: 1,
      createCount: 1,
      updateCount: 0,
      blockedCount: 0,
      totalPlants: 0,
      totalCertificates: 1,
      fileErrors: [],
      rows: [
        {
          rowIndex: 3,
          customerName: certificateName,
          businessNumber: "",
          corpName: certificateName,
          plantCount: 0,
          certificateCount: 1,
          status: "create",
          errors: [],
          warnings: [],
          canImport: true
        }
      ]
    },
    error: `발전소 시트 (${certificateName}): p12/pfx 인증서 비밀번호가 올바르지 않습니다. 공통 비밀번호와 다르면 해당 행의 개별 비밀번호를 입력해 주세요.`
  });

  const row = review.byRowIndex.get(3);
  assert.equal(review.blockingCount, 1);
  assert.equal(review.readyCount, 0);
  assert.equal(review.unmatchedMessages.length, 0);
  assert.equal(row?.status, "needs_fix");
  assert.equal(row?.issues[0]?.code, "password_invalid");
  assert.equal(row?.issues[0]?.needsPassword, true);
});

test("initial registration candidate review requires manual info for missing address warnings", () => {
  const review = buildInitialRegistrationCandidateReviewState({
    rows: [
      {
        rowIndex: 4,
        certificateIndex: "22",
        certificateName: "유학현",
        certificateKindLabel: "전자세금용",
        usageName: "",
        issuerName: "",
        expireDate: "",
        certificatePassword: "",
        businessNumber: "1234567890",
        plantName: "유학현",
        corpName: "유학현",
        selected: true
      }
    ],
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
    },
    error: ""
  });

  const row = review.byRowIndex.get(4);
  assert.equal(review.blockingCount, 1);
  assert.equal(row?.status, "needs_fix");
  assert.equal(row?.issues[0]?.code, "address_missing");
  assert.equal(row?.issues[0]?.needsManualInfo, true);
});
