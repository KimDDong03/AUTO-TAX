import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { AppSettings } from "./domain.js";
import { toClientSettings } from "./main.js";
import { registerSettingsRoutes } from "./routes/settings-routes.js";
import type { AppStore } from "./store-contract.js";

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: 1,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    imapUser: "",
    imapPass: "",
    imapMailbox: "INBOX",
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "",
    smtpPass: "",
    smtpFromName: "AUTO-TAX",
    smtpFromEmail: "",
    mailConnectionVerifiedAt: null,
    notificationEmails: [],
    defaultIssueDay: 26,
    defaultIssueHour: 9,
    defaultIssueMinute: 0,
    mailPollMinutes: 5,
    mailSyncStartAt: null,
    timezone: "Asia/Seoul",
    popbillLinkId: "link-id",
    popbillSecretKey: "secret-key",
    popbillIsTest: false,
    popbillPartnerCorpNum: "",
    popbillUserIdPrefix: "",
    popbillSharedPassword: "",
    operatorContactName: "",
    operatorContactEmail: "",
    operatorContactTel: "",
    renewalContactDepartment: "",
    renewalContactFax: "",
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: false,
    certLastCheckedAt: null,
    certAlertLastSentAt: null,
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    ...overrides
  };
}

test("stored server-managed password reveal endpoints are blocked and never return plaintext", async () => {
  const logs: Array<{ message: string; context?: unknown }> = [];
  const requestStore = {
    createLog: async (_level: string, _scope: string, message: string, context?: unknown) => {
      logs.push({ message, context });
    }
  } as unknown as AppStore;

  const app = express();
  app.use(express.json());

  registerSettingsRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({ activeOrganizationId: "org-1" }) as never,
    requirePlatformAdmin: () => ({}) as never,
    getLoggingStore: () => requestStore,
    getServerManagedSettings: async () => ({}) as never,
    applyServerManagedSettings: (settings) => settings,
    createEmptySettings: () => ({}) as never,
    toClientSettings: (settings) => settings,
    testMailConnections: async () => {
      throw new Error("unused");
    },
    resolveRoadAddress: async () => null,
    getPartnerBalance: async () => ({ remainPoint: 0 }),
    getTaxInvoiceUnitCost: async () => 0,
    getPartnerChargeURL: async () => "https://example.com",
    maskBusinessNumber: () => null,
    normalizeCustomerImportRow: () => {
      throw new Error("unused");
    },
    buildCustomerImportPreview: async () => {
      throw new Error("unused");
    },
    commitCustomerImport: async () => {
      throw new Error("unused");
    },
    createCustomerOnboardingPreviewSession: async () => {
      throw new Error("unused");
    },
    startCustomerOnboardingCommitBatch: async () => {
      throw new Error("unused");
    },
    getCustomerOnboardingCommitBatchStatus: async () => {
      throw new Error("unused");
    },
    runDueJobs: async () => ({})
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const popbillResponse = await fetch(`${baseUrl}/api/settings/popbill-shared-password`);
    assert.equal(popbillResponse.status, 410);
    assert.deepEqual(await popbillResponse.json(), {
      error: "발행 연동 공통 비밀번호는 서버 운영값으로만 관리합니다. 변경이 필요하면 서버 환경 변수를 수정하세요."
    });

    const issueResponse = await fetch(`${baseUrl}/api/settings/renewal-issue-password`);
    assert.equal(issueResponse.status, 410);
    assert.deepEqual(await issueResponse.json(), {
      error: "발급용 임시번호는 보안 정책상 다시 표시하지 않습니다. 변경이 필요하면 새 값을 다시 입력하세요."
    });

    const certificateResponse = await fetch(`${baseUrl}/api/settings/renewal-certificate-password`);
    assert.equal(certificateResponse.status, 410);
    assert.deepEqual(await certificateResponse.json(), {
      error: "공동인증서 비밀번호는 서버에 저장하지 않습니다. 현재 브라우저 탭이나 로컬 헬퍼에서 다시 입력하세요."
    });

    assert.deepEqual(
      logs.map((entry) => entry.message),
      [
        "발행 연동 공통 비밀번호 재표시 요청을 차단했습니다.",
        "공동인증서 갱신 발급용 비밀번호 재표시 요청을 차단했습니다.",
        "공동인증서 공통 비밀번호 재표시 요청을 차단했습니다."
      ]
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("settings route uses server env for issuing readiness while redacting hidden values", async () => {
  const previousPrefix = process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX;
  const previousPassword = process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD;
  process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX = "AUTO_";
  process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD = "shared-secret";

  const settings = createSettings({
    popbillUserIdPrefix: "",
    popbillSharedPassword: "",
    operatorContactName: "홍길동",
    operatorContactEmail: "owner@example.com",
    operatorContactTel: "010-1234-5678",
    renewalCertificatePassword: "cert-secret",
    renewalIssuePassword: "123456"
  });
  const requestStore = {
    getSettings: async () => settings
  } as unknown as AppStore;

  const app = express();
  app.use(express.json());

  registerSettingsRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireWorkspaceEditor: () => ({ activeOrganizationId: "org-1" }) as never,
    requirePlatformAdmin: () => ({}) as never,
    getLoggingStore: () => requestStore,
    getServerManagedSettings: async () => settings,
    applyServerManagedSettings: (input) => input,
    createEmptySettings: () => settings,
    toClientSettings,
    testMailConnections: async () => {
      throw new Error("unused");
    },
    resolveRoadAddress: async () => null,
    getPartnerBalance: async () => ({ remainPoint: 0 }),
    getTaxInvoiceUnitCost: async () => 0,
    getPartnerChargeURL: async () => "https://example.com",
    maskBusinessNumber: () => null,
    normalizeCustomerImportRow: () => {
      throw new Error("unused");
    },
    buildCustomerImportPreview: async () => {
      throw new Error("unused");
    },
    commitCustomerImport: async () => {
      throw new Error("unused");
    },
    createCustomerOnboardingPreviewSession: async () => {
      throw new Error("unused");
    },
    startCustomerOnboardingCommitBatch: async () => {
      throw new Error("unused");
    },
    getCustomerOnboardingCommitBatchStatus: async () => {
      throw new Error("unused");
    },
    runDueJobs: async () => ({})
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${baseUrl}/api/settings`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(payload.popbillSharedPasswordConfigured, true);
    assert.equal(payload.renewalCertificatePasswordConfigured, true);
    assert.equal(payload.renewalIssuePasswordConfigured, true);
    assert.equal(payload.operatorConfigured, true);
    assert.equal(payload.popbillUserIdPrefix, "");
    assert.equal(payload.popbillSharedPassword, "");
    assert.equal(payload.renewalCertificatePassword, "");
    assert.equal(payload.renewalIssuePassword, "");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    if (previousPrefix === undefined) {
      delete process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX;
    } else {
      process.env.AUTO_TAX_POPBILL_USER_ID_PREFIX = previousPrefix;
    }
    if (previousPassword === undefined) {
      delete process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD;
    } else {
      process.env.AUTO_TAX_POPBILL_SHARED_PASSWORD = previousPassword;
    }
  }
});
