import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { AppSettings } from "./domain.js";
import { HttpError } from "./http-errors.js";
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

test("toClientSettings redacts operational integration identifiers for viewers", () => {
  const payload = toClientSettings(
    createSettings({
      imapHost: "imap.example.com",
      imapUser: "owner@example.com",
      imapPass: "mail-secret",
      imapMailbox: "INBOX",
      smtpHost: "smtp.example.com",
      smtpUser: "sender@example.com",
      smtpPass: "smtp-secret",
      smtpFromName: "AUTO-TAX",
      smtpFromEmail: "sender@example.com",
      notificationEmails: ["ops@example.com"],
      mailConnectionVerifiedAt: "2026-04-16T00:00:00.000Z",
      renewalContactDepartment: "운영팀",
      renewalContactFax: "02-0000-0000",
      renewalIssuePassword: "123456"
    }),
    { role: "viewer" }
  );

  assert.equal(payload.imapHost, "");
  assert.equal(payload.imapUser, "");
  assert.equal(payload.imapMailbox, "");
  assert.equal(payload.smtpHost, "");
  assert.equal(payload.smtpUser, "");
  assert.equal(payload.smtpFromName, "");
  assert.equal(payload.smtpFromEmail, "");
  assert.deepEqual(payload.notificationEmails, []);
  assert.equal(payload.mailConnectionVerifiedAt, null);
  assert.equal(payload.renewalContactDepartment, "");
  assert.equal(payload.renewalContactFax, "");
  assert.equal(payload.mailPasswordConfigured, false);
  assert.equal(payload.renewalIssuePasswordConfigured, false);
});

test("settings update rejects operator role before persisting operational settings", async () => {
  let updateCalled = false;
  const requestStore = {
    updateSettings: async () => {
      updateCalled = true;
      return createSettings();
    },
    createLog: async () => undefined
  } as unknown as AppStore;

  const app = express();
  app.use(express.json());

  registerSettingsRoutes({
    app,
    store: requestStore,
    getRequestStore: () => requestStore,
    requireAuthContext: () => ({ activeOrganizationRole: "operator" }) as never,
    requireWorkspaceEditor: () => ({ activeOrganizationId: "org-1", activeOrganizationRole: "operator" }) as never,
    requireOrganizationAdmin: () => {
      throw new HttpError(403, "소유자 또는 관리자만 운영 설정을 변경할 수 있습니다.");
    },
    requirePlatformAdmin: () => ({}) as never,
    getLoggingStore: () => requestStore,
    getServerManagedSettings: async () => createSettings(),
    applyServerManagedSettings: (settings) => settings,
    createEmptySettings: () => createSettings(),
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

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "server error" });
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imapHost: "imap.example.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "owner@example.com",
        imapPass: "secret",
        imapMailbox: "INBOX",
        smtpHost: "smtp.example.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "sender@example.com",
        smtpPass: "secret",
        smtpFromName: "AUTO-TAX",
        smtpFromEmail: "sender@example.com",
        notificationEmails: ["ops@example.com"],
        defaultIssueDay: 20,
        defaultIssueHour: 9,
        defaultIssueMinute: 0,
        mailPollMinutes: 1440,
        mailSyncStartAt: null,
        timezone: "Asia/Seoul",
        renewalContactDepartment: "",
        renewalContactFax: "",
        renewalCertificatePassword: "",
        renewalIssuePassword: "",
        schedulerEnabled: true
      })
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "소유자 또는 관리자만 운영 설정을 변경할 수 있습니다."
    });
    assert.equal(updateCalled, false);
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
    requireAuthContext: () => ({ activeOrganizationRole: "owner" }) as never,
    requireWorkspaceEditor: () => ({ activeOrganizationId: "org-1" }) as never,
    requireOrganizationAdmin: () => ({ activeOrganizationId: "org-1", activeOrganizationRole: "owner" }) as never,
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
      error: "공동인증서 비밀번호는 서버에 저장하지 않습니다. 현재 브라우저 탭이나 AT 헬퍼에서 다시 입력하세요."
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
    requireAuthContext: () => ({ activeOrganizationRole: "owner" }) as never,
    requireWorkspaceEditor: () => ({ activeOrganizationId: "org-1" }) as never,
    requireOrganizationAdmin: () => ({ activeOrganizationId: "org-1", activeOrganizationRole: "owner" }) as never,
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
