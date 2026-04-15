import test from "node:test";
import assert from "node:assert/strict";
import type { SettingsHealth } from "./useSettingsScreenState";
import {
  buildSettingsActionBarModel,
  buildSettingsOnboardingModel,
  getSettingsSectionLabel,
  type SettingsOnboardingFields
} from "./useSettingsDerivedModel";

function createSettingsOnboardingFields(
  overrides: Partial<SettingsOnboardingFields> = {}
): SettingsOnboardingFields {
  return {
    mailAddress: "",
    mailPassword: "",
    popbillUserIdPrefix: "",
    operatorContactName: "",
    operatorContactEmail: "",
    operatorContactTel: "",
    popbillSharedPassword: "",
    renewalIssuePassword: "",
    ...overrides
  };
}

const incompleteHealth: SettingsHealth = {
  mailReady: false,
  popbillReady: false,
  operatorReady: false
};

test("buildSettingsActionBarModel maps next settings section and autosave tone", () => {
  const actionBar = buildSettingsActionBarModel({
    setupPendingCount: 2,
    nextSettingsSection: "popbill",
    settingsHealth: {
      mailReady: true,
      popbillReady: false,
      operatorReady: false
    },
    helperReady: false,
    settingsAutosaveLabel: "저장 실패",
    settingsAutosaveState: "error"
  });

  assert.equal(actionBar.title, "준비 상태 점검");
  assert.equal(actionBar.primaryActionLabel, getSettingsSectionLabel("popbill"));
  assert.equal(actionBar.primarySection, "popbill");
  assert.deepEqual(actionBar.chips, [
    { label: "메일", value: "준비됨", tone: "success" },
    { label: "발행", value: "입력 필요", tone: "warn" },
    { label: "인증서", value: "확인 필요", tone: "warn" },
    { label: "자동 저장", value: "저장 실패", tone: "danger" }
  ]);
});

test("buildSettingsOnboardingModel keeps mail/default validation and blocked step order", () => {
  const onboarding = buildSettingsOnboardingModel({
    fields: createSettingsOnboardingFields({
      mailAddress: "bad-email",
      popbillUserIdPrefix: "",
      operatorContactName: "",
      operatorContactTel: "",
      operatorContactEmail: "still-bad"
    }),
    settingsHealth: incompleteHealth,
    configured: {
      mailPasswordConfigured: false,
      popbillSharedPasswordConfigured: false,
      renewalIssuePasswordConfigured: false,
      renewalCertificatePasswordConfigured: false
    },
    helper: {
      ready: false,
      online: false,
      certificateCount: 0,
      upgradeState: "unknown",
      actionBlockedReason: "재설치 필요",
      upgradeMessage: null
    },
    progress: {
      customerRegistrationReady: false,
      certificateReady: false
    }
  });

  assert.equal(onboarding.mail.headline, "메일 주소와 앱 비밀번호만 입력하세요.");
  assert.deepEqual(onboarding.mail.address, {
    missing: false,
    invalid: true,
    hasError: true
  });
  assert.deepEqual(onboarding.mail.password, {
    missing: true,
    hasError: true
  });
  assert.deepEqual(onboarding.defaults.operatorEmail, {
    missing: false,
    invalid: true,
    hasError: true
  });
  assert.deepEqual(onboarding.firstSyncBlockedSteps, [
    "메일 연결",
    "발행 기본값 입력",
    "로컬 헬퍼 준비",
    "고객 초기 등록",
    "인증서 연결 마무리"
  ]);
});

test("buildSettingsOnboardingModel preserves helper upgrade summary and saved default detection", () => {
  const onboarding = buildSettingsOnboardingModel({
    fields: createSettingsOnboardingFields({
      mailAddress: "ops@example.com",
      popbillUserIdPrefix: "TEST_",
      operatorContactName: "담당자",
      operatorContactTel: "01012345678",
      operatorContactEmail: "owner@example.com"
    }),
    settingsHealth: {
      mailReady: true,
      popbillReady: true,
      operatorReady: true
    },
    configured: {
      mailPasswordConfigured: true,
      popbillSharedPasswordConfigured: true,
      renewalIssuePasswordConfigured: true,
      renewalCertificatePasswordConfigured: false
    },
    helper: {
      ready: false,
      online: true,
      certificateCount: 0,
      upgradeState: "upgrade-available",
      actionBlockedReason: "재설치 필요",
      upgradeMessage: "업데이트 후 다시 확인해 두세요."
    },
    progress: {
      customerRegistrationReady: true,
      certificateReady: true
    }
  });

  assert.equal(onboarding.defaults.headline, "필수값 입력 완료");
  assert.equal(onboarding.helperStatusLine, "업데이트 후 다시 확인해 두세요.");
  assert.equal(onboarding.hasSavedDefaults, true);
  assert.deepEqual(onboarding.firstSyncBlockedSteps, ["로컬 헬퍼 준비"]);
});
