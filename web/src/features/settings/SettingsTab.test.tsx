import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsTab, type SettingsTabModel } from "./SettingsTab";

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
    return renderToStaticMarkup(node).replace(/<[^>]*>/g, " ");
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
          id: "onboarding",
          step: 1,
          title: "도입 준비",
          done: false,
          summary: "2/4 완료 · 남음 2"
        },
        {
          id: "popbill",
          step: 2,
          title: "발행 설정",
          done: false,
          summary: "필수값 입력"
        },
        {
          id: "gmail",
          step: 3,
          title: "메일 연결하기",
          done: false,
          summary: "연결 테스트 필요"
        },
        {
          id: "helper",
          step: 4,
          title: "AT 헬퍼",
          done: false,
          summary: "AT 헬퍼 준비 필요"
        },
        {
          id: "account",
          step: 5,
          title: "계정 설정",
          done: true,
          summary: "비밀번호 변경"
        }
      ],
      activeSettingsSection,
      setupPendingCount: 4,
      settingsAutosaveState: "saved",
      settingsAutosaveLabel: "자동 저장",
      customerRegistrationReady: false,
      customerCount: 0,
      nextSettingsSection: "onboarding",
      nextSettingsSectionLabel: "도입 준비",
      setActiveSettingsSection: () => {},
      openCertificates: () => {},
      openOnboarding: () => {}
    },
    sections: {
      onboarding: {
        complete: false,
        progressText: "2/4 완료 · 남음 2",
        pendingStepCount: 2,
        content: <div>도입 준비 본문</div>
      },
      mail: {
        busyKey: null,
        isMailTesting: false,
        done: false,
        detectedMailProviderLabel: "Gmail",
        fields: {
          mailAddress: "",
          mailPassword: "",
          imapHost: "imap.gmail.com",
          imapPort: "993",
          imapSecure: true,
          imapMailbox: "*",
          schedulerEnabled: true,
          defaultIssueDay: "20",
          defaultIssueHour: "9",
          defaultIssueMinute: "0"
        },
        requiresManualImapSettings: false,
        mailPasswordConfigured: false,
        mailPasswordReveal: {
          visible: false,
          toggle: () => {}
        },
        onMailAddressChange: () => {},
        onMailPasswordChange: () => {},
        onImapHostChange: () => {},
        onImapPortChange: () => {},
        onImapSecureChange: () => {},
        onImapMailboxChange: () => {},
        onSchedulerEnabledChange: () => {},
        onDefaultIssueDayChange: () => {},
        onDefaultIssueHourChange: () => {},
        onDefaultIssueMinuteChange: () => {},
        onRunMailSettingsTest: async () => {},
        onSaveAndTestMailSettings: async () => true
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
        onPopbillSharedPasswordChange: () => {},
        onRenewalIssuePasswordChange: () => {},
        onLoadCurrentPopbillSharedPassword: async () => {},
        onLoadCurrentRenewalIssuePassword: async () => {},
        customerMessages: {
          organizationName: "Test Workspace",
          customers: [],
          busyKey: null,
          onSaveIssueCompleteSmsTemplate: async () => {}
        }
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
          certificateReadProgress: null,
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
          resetOrganizationMemberPassword: async () => {},
          withdrawOrganization: async () => {}
        },
        withdrawal: {
          organizationName: "Test Workspace",
          customerCount: 0,
          joinedPopbillCustomerCount: 0,
          memberCount: 0,
          canWithdraw: false,
          onSendPhoneVerification: async () => ({
            verificationId: "30000000-0000-4000-8000-000000000001",
            expiresAt: "2026-05-14T00:05:00.000Z",
            maskedPhone: "010-****-5678"
          }),
          onConfirmPhoneVerification: async () => true,
          onWithdrawOrganization: async () => {}
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

  assert.match(helperText, /AT 헬퍼/);
  assert.doesNotMatch(helperText, /도입 준비 본문/);
  assert.doesNotMatch(helperText, /자동으로 찾은 메일 서비스/);
  assert.doesNotMatch(helperText, /공동인증서 발급용 임시번호/);
});

test("SettingsTab renders onboarding as the first settings detail section", () => {
  const model = createModel("onboarding");
  const tree = SettingsTab({ model });
  const text = collectText(tree);

  assert.match(text, /도입 준비 본문/);
  assert.match(text, /발행 설정/);
  assert.match(text, /메일 연결하기/);
  assert.match(text, /AT 헬퍼/);
  assert.doesNotMatch(text, /메일 연결 설정/);
});

test("SettingsTab keeps local helper details out of issue defaults", () => {
  const defaultsTree = SettingsTab({
    model: createModel("popbill")
  });
  const defaultsText = collectText(defaultsTree);

  assert.match(defaultsText, /공동인증서 발급용 임시번호/);
  assert.doesNotMatch(defaultsText, /운영 이름/);
  assert.doesNotMatch(defaultsText, /운영 연락처/);
  assert.doesNotMatch(defaultsText, /운영 이메일/);
  assert.doesNotMatch(defaultsText, /상태 다시 확인/);
  assert.doesNotMatch(defaultsText, /AT 헬퍼 다운로드/);
});

test("SettingsTab mail detail hides customer-unnecessary transport settings", () => {
  const mailTree = SettingsTab({
    model: createModel("gmail")
  });
  const mailText = collectText(mailTree);

  assert.match(mailText, /메일 연결 설정/);
  assert.match(mailText, /메일 계정/);
  assert.match(mailText, /변경하려면 수정을 누르세요/);
  assert.match(mailText, /수정/);
  assert.doesNotMatch(mailText, /알림 수신 메일/);
  assert.doesNotMatch(mailText, /미매칭 메일 알림 받기/);
  assert.doesNotMatch(mailText, /수집 주기/);
  assert.doesNotMatch(mailText, /IMAP/);
  assert.doesNotMatch(mailText, /SMTP/);
  assert.doesNotMatch(mailText, /포트/);
  assert.doesNotMatch(mailText, /보안/);
  assert.doesNotMatch(mailText, /읽을 폴더/);
  assert.doesNotMatch(mailText, /월간 메일 동기화 일정/);
  assert.doesNotMatch(mailText, /매달 메일 읽기 일정/);
  assert.doesNotMatch(mailText, /기본값은 매월 20일/);
  assert.doesNotMatch(mailText, /5/);
});

test("SettingsTab account summary hides internal role labels", () => {
  const model = createModel("gmail");
  const currentMember = {
    membershipId: "membership-1",
    userId: "user-1",
    loginId: "admin01",
    displayName: "관리자",
    role: "owner" as const,
    createdAt: "2026-05-05T00:00:00.000Z"
  };
  model.sections.account.account.canManageOrganizationMembers = true;
  model.sections.account.account.organizationMembers = [currentMember];
  model.sections.account.account.organizationMemberItems = [
    {
      member: currentMember,
      roleLabel: "owner",
      isCurrentUser: true,
      isOwner: true,
      canRemove: false,
      canResetPassword: false,
      isResetTarget: false
    }
  ];

  const text = collectText(SettingsTab({ model }));

  assert.match(text, /내 계정/);
  assert.match(text, /사용자 수/);
  assert.doesNotMatch(text, /소유자/);
  assert.doesNotMatch(text, /내 역할/);
  assert.doesNotMatch(text, /owner/);
  assert.doesNotMatch(text, /member/);
});
