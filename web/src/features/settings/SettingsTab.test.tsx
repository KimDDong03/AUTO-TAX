import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { SettingsTab, type SettingsTabModel } from "./SettingsTab";

type TestElement = React.ReactElement<
  Record<string, unknown> & {
    children?: React.ReactNode;
  }
>;

function readElementNode(element: TestElement): React.ReactNode {
  if (typeof element.type === "function") {
    const renderElement = element.type as (
      props: typeof element.props
    ) => React.ReactNode;
    return renderElement(element.props);
  }

  return element.props.children;
}

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
    return collectText(readElementNode(element));
  }

  return "";
}

function createModel(
  activeSettingsSection: SettingsTabModel["sidebar"]["activeSettingsSection"]
): SettingsTabModel {
  return {
    context: {
      userLabel: "테스트 사용자",
      workspaceLabel: "테스트 작업공간",
      popbillModeLabel: "테스트"
    },
    sidebar: {
      settingsSections: [
        {
          id: "gmail",
          step: 1,
          title: "메일 연결",
          done: false,
          summary: "연결 테스트 필요"
        },
        {
          id: "popbill",
          step: 2,
          title: "발행 설정",
          done: false,
          summary: "필수값 입력"
        },
        {
          id: "helper",
          step: 3,
          title: "헬퍼 상태",
          done: false,
          summary: "헬퍼 준비 필요"
        },
        {
          id: "account",
          step: 4,
          title: "계정 / 작업공간",
          done: true,
          summary: "비밀번호 변경"
        }
      ],
      activeSettingsSection,
      setupPendingCount: 3,
      settingsAutosaveState: "saved",
      settingsAutosaveLabel: "자동 저장",
      customerRegistrationReady: false,
      customerCount: 0,
      nextSettingsSection: "gmail",
      nextSettingsSectionLabel: "메일 연결",
      setActiveSettingsSection: () => {},
      openCertificates: () => {},
      openOnboarding: () => {}
    },
    sections: {
      mail: {
        busyKey: null,
        isMailTesting: false,
        done: false,
        detectedMailProviderLabel: "Gmail",
        fields: {
          mailAddress: "",
          mailPassword: "",
          notificationEmailsText: "",
          schedulerEnabled: true,
          defaultIssueDay: "20",
          defaultIssueHour: "9",
          defaultIssueMinute: "0"
        },
        mailPasswordConfigured: false,
        mailPasswordReveal: {
          visible: false,
          toggle: () => {}
        },
        onMailAddressChange: () => {},
        onMailPasswordChange: () => {},
        onNotificationEmailsTextChange: () => {},
        onSchedulerEnabledChange: () => {},
        onDefaultIssueDayChange: () => {},
        onDefaultIssueHourChange: () => {},
        onDefaultIssueMinuteChange: () => {},
        onRunMailSettingsTest: async () => {}
      },
      defaults: {
        busyKey: null,
        done: false,
        settingsHealth: {
          popbillReady: false,
          operatorReady: false
        },
        fields: {
          popbillUserIdPrefix: "",
          operatorContactName: "",
          operatorContactTel: "",
          operatorContactEmail: "",
          popbillSharedPassword: "",
          renewalIssuePassword: ""
        },
        configured: {
          popbillSharedPassword: false,
          renewalIssuePassword: false
        },
        reveals: {
          popbillSharedPassword: { visible: false, toggle: () => {} },
          renewalIssuePassword: { visible: false, toggle: () => {} }
        },
        onPopbillUserIdPrefixChange: () => {},
        onOperatorContactNameChange: () => {},
        onOperatorContactTelChange: () => {},
        onOperatorContactEmailChange: () => {},
        onPopbillSharedPasswordChange: () => {},
        onRenewalIssuePasswordChange: () => {},
        onLoadCurrentPopbillSharedPassword: async () => {},
        onLoadCurrentRenewalIssuePassword: async () => {}
      },
      helper: {
        done: false,
        helperStatus: {
          busyKey: null,
          online: false,
          helperVersion: null,
          helperMessage: "상태 확인 전",
          upgradeNotice: null,
          latestVersion: null,
          minSupportedVersion: null,
          checkedAt: null,
          loadedCertificateCount: 0,
          renewalHelperDownloadUrl: "https://example.com/helper.zip",
          openCertificates: () => {},
          onRefreshCustomerRenewalAssistant: async () => {},
          formatDateTime: () => "-"
        }
      },
      account: {
        onboarding: {
          complete: false,
          progressText: "도입 준비 진행 중",
          pendingStepCount: 2,
          openOnboarding: () => {}
        },
        account: {
          canManageOrganizationMembers: false,
          organizationMembers: [],
          organizationMemberItems: [],
          passwordChangeForm: {
            nextPassword: "",
            confirmPassword: ""
          },
          passwordResetForm: {
            nextPassword: "",
            confirmPassword: ""
          },
          passwordResetTarget: null,
          organizationMemberForm: {
            loginId: "",
            displayName: "",
            password: ""
          },
          setPasswordChangeForm: () => {},
          setPasswordResetForm: () => {},
          setOrganizationMemberForm: () => {},
          changePassword: async () => {},
          createOrganizationMember: async () => {},
          openMemberPasswordReset: () => {},
          removeOrganizationMember: async () => {},
          submitMemberPasswordReset: async () => {},
          cancelPasswordReset: () => {}
        },
        actions: {
          changePassword: async () => {},
          createOrganizationMember: async () => {},
          removeOrganizationMember: async () => {},
          resetOrganizationMemberPassword: async () => {}
        },
        reveals: {
          accountPassword: {
            nextPassword: { visible: false, toggle: () => {} },
            confirmPassword: { visible: false, toggle: () => {} }
          },
          organizationMemberPassword: { visible: false, toggle: () => {} },
          memberResetPassword: {
            nextPassword: { visible: false, toggle: () => {} },
            confirmPassword: { visible: false, toggle: () => {} }
          }
        },
        busyKey: null,
        formatDateTime: () => "-"
      }
    }
  };
}

test("SettingsTab only renders the active detail section content", () => {
  const helperTree = SettingsTab({
    model: createModel("helper")
  });
  const helperText = collectText(helperTree);

  assert.match(helperText, /로컬 헬퍼/);
  assert.doesNotMatch(helperText, /자동으로 찾은 메일 서비스/);
  assert.doesNotMatch(helperText, /필수 공통값/);
});

test("SettingsTab keeps local helper details out of issue defaults", () => {
  const defaultsTree = SettingsTab({
    model: createModel("popbill")
  });
  const defaultsText = collectText(defaultsTree);

  assert.match(defaultsText, /필수 공통값/);
  assert.doesNotMatch(defaultsText, /로컬 헬퍼/);
  assert.doesNotMatch(defaultsText, /헬퍼 다운로드/);
});

test("SettingsTab mail detail hides the legacy five-minute collection setting", () => {
  const mailTree = SettingsTab({
    model: createModel("gmail")
  });
  const mailText = collectText(mailTree);

  assert.match(mailText, /메일 연결 설정/);
  assert.match(mailText, /메일 계정/);
  assert.doesNotMatch(mailText, /수집 주기/);
  assert.doesNotMatch(mailText, /5/);
});
