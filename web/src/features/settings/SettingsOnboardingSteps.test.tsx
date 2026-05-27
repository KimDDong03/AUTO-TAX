import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { SettingsDefaultsOnboardingStep } from "./onboarding/SettingsDefaultsOnboardingStep";
import { SettingsHelperOnboardingStep } from "./onboarding/SettingsHelperOnboardingStep";
import { SettingsMailOnboardingStep } from "./onboarding/SettingsMailOnboardingStep";

const noop = () => {};
const noopAsync = async () => {};
type TestElement = React.ReactElement<
  Record<string, unknown> & {
    children?: React.ReactNode;
  }
>;

function collectText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map((child) => collectText(child)).join(" ");
  }

  if (React.isValidElement(node)) {
    const element = node as TestElement;
    return collectText(element.props.children);
  }

  return "";
}

function findElement(
  node: React.ReactNode,
  predicate: (element: TestElement) => boolean
): TestElement | null {
  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (!React.isValidElement(node)) {
    return null;
  }

  const element = node as TestElement;

  if (predicate(element)) {
    return element;
  }

  return findElement(element.props.children, predicate);
}

test("SettingsMailOnboardingStep keeps required-field hints and busy test button state", () => {
  const tree = SettingsMailOnboardingStep({
    onboarding: {
      headline: "메일 주소와 앱 비밀번호만 입력하세요.",
      address: {
        missing: true,
        invalid: false,
        hasError: true
      },
      password: {
        missing: false,
        hasError: false
      }
    },
    autosaveLabel: "자동 저장",
    detectedMailProviderLabel: "Gmail",
    mailAddress: "",
    mailPassword: "",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    imapSecure: true,
    imapMailbox: "*",
    requiresManualImapSettings: false,
    mailPasswordConfigured: true,
    mailPasswordReveal: {
      visible: false,
      toggle: noop
    },
    busy: true,
    isMailTesting: true,
    onMailAddressChange: noop,
    onMailPasswordChange: noop,
    onImapHostChange: noop,
    onImapPortChange: noop,
    onImapSecureChange: noop,
    onImapMailboxChange: noop,
    onRunMailSettingsTest: noopAsync
  });
  const text = collectText(tree);
  const requiredField = findElement(
    tree,
    (element) =>
      element.type === "label" && element.props["data-required-empty"] === "true"
  );
  const testButton = findElement(
    tree,
    (element) =>
      element.type === "button" &&
      collectText(element).includes("연결 테스트 중...")
  );

  assert.ok(requiredField);
  assert.match(text, /필수 입력 사항입니다\./);
  assert.match(text, /변경할 때만 다시 입력하세요/);
  assert.ok(testButton);
  assert.equal(testButton.props.disabled, true);
});

test("SettingsDefaultsOnboardingStep keeps onboarding focused on renewal issue password", () => {
  const configuredTree = SettingsDefaultsOnboardingStep({
    onboarding: {
      headline: "필수값만 먼저 입력하세요.",
      popbillReadyLabel: "입력 필요",
      operatorReadyLabel: "준비됨",
      popbillPrefix: { missing: false, invalid: false, hasError: false },
      popbillSharedPassword: { missing: false, hasError: false },
      renewalIssuePassword: { missing: false, hasError: false }
    },
    autosaveLabel: "자동 저장",
    renewalIssuePassword: "",
    renewalIssuePasswordConfigured: true,
    reveals: {
      renewalIssuePassword: { visible: false, toggle: noop }
    },
    busy: false,
    onRenewalIssuePasswordChange: noop
  });
  const hiddenTree = SettingsDefaultsOnboardingStep({
    onboarding: {
      headline: "필수값만 먼저 입력하세요.",
      popbillReadyLabel: "입력 필요",
      operatorReadyLabel: "입력 필요",
      popbillPrefix: { missing: false, invalid: false, hasError: false },
      popbillSharedPassword: { missing: false, hasError: false },
      renewalIssuePassword: { missing: false, hasError: false }
    },
    autosaveLabel: "자동 저장",
    renewalIssuePassword: "",
    renewalIssuePasswordConfigured: false,
    reveals: {
      renewalIssuePassword: { visible: false, toggle: noop }
    },
    busy: false,
    onRenewalIssuePasswordChange: noop
  });
  const configuredText = collectText(configuredTree);
  const hiddenText = collectText(hiddenTree);
  const renewalIssuePasswordInput = findElement(
    configuredTree,
    (element) =>
      element.type === "input" &&
      element.props["aria-describedby"] === "onboarding-renewal-issue-password-hint"
  );

  assert.match(configuredText, /발급용 임시/);
  assert.doesNotMatch(configuredText, /운영 이름/);
  assert.doesNotMatch(configuredText, /운영 연락처/);
  assert.doesNotMatch(configuredText, /운영 이메일/);
  assert.doesNotMatch(configuredText, /팝빌/);
  assert.doesNotMatch(configuredText, /접두어/);
  assert.doesNotMatch(configuredText, /신규 고객 기본 비밀번호/);
  assert.doesNotMatch(configuredText, /인증서 공통 비밀번호 \(선택\)/);
  assert.doesNotMatch(configuredText, /인증서 공통 비밀번호 불러오기/);
  assert.ok(renewalIssuePasswordInput);
  assert.doesNotMatch(hiddenText, /저장된 값 다시 불러오기는 필요할 때만 보기/);
});

test("SettingsHelperOnboardingStep keeps helper headline precedence and action state", () => {
  const readyTree = SettingsHelperOnboardingStep({
    helperReady: true,
    helperUpgradeRequired: true,
    helperUpgradeAvailable: true,
    helperActionBlockedReason: "재설치 필요",
    helperStatusLine: "인증서 3건 읽음",
    helperOnline: true,
    electronicTaxCertificateCount: 2,
    generalCertificateCount: 1,
    certificateReadProgress: null,
    busy: false,
    isReadingCertificates: false,
    onReadCertificates: noopAsync,
    onRefreshHelper: noopAsync,
    onDownloadHelper: noop
  });
  const offlineTree = SettingsHelperOnboardingStep({
    helperReady: false,
    helperUpgradeRequired: false,
    helperUpgradeAvailable: false,
    helperActionBlockedReason: "재설치 필요",
    helperStatusLine: "상태 미확인",
    helperOnline: false,
    electronicTaxCertificateCount: 0,
    generalCertificateCount: 0,
    certificateReadProgress: null,
    busy: true,
    isReadingCertificates: false,
    onReadCertificates: noopAsync,
    onRefreshHelper: noopAsync,
    onDownloadHelper: noop
  });
  const offlineButton = findElement(
    offlineTree,
    (element) =>
      element.type === "button" &&
      collectText(element).includes("공동인증서 읽기")
  );
  const versionMismatchButton = findElement(
    readyTree,
    (element) =>
      element.type === "button" &&
      collectText(element).includes("공동인증서 읽기")
  );

  assert.match(collectText(readyTree), /공동인증서 확인 완료/);
  assert.doesNotMatch(collectText(readyTree), /버전 정보 보기/);
  assert.match(collectText(readyTree), /상태 확인/);
  assert.match(collectText(readyTree), /AT 헬퍼 다운로드/);
  assert.match(collectText(readyTree), /전자세금용 공동인증서\s*2\s*건/);
  assert.match(collectText(readyTree), /범용 공동인증서\s*1\s*건/);
  assert.doesNotMatch(collectText(readyTree), /마지막 확인/);
  assert.ok(versionMismatchButton);
  assert.equal(versionMismatchButton.props.disabled, true);
  assert.ok(offlineButton);
  assert.equal(offlineButton.props.disabled, true);
  assert.match(String(offlineButton.props.title), /AT 헬퍼 실행 후 상태를 확인/);
});
