import type { Express } from "express";
import { z } from "zod";
import type { AppSettings, CustomerImportProfile } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import type { CustomerImportCommitResult, CustomerImportMappedRow, CustomerImportPreviewResult } from "../services/customer-import-service.js";
import type {
  CustomerOnboardingCertificateRow,
  CustomerOnboardingCustomerRow,
  CustomerOnboardingPlantRow
} from "../services/customer-onboarding-import-service.js";
import type {
  CustomerOnboardingCommitBatchStartResult,
  CustomerOnboardingCommitBatchStatusResult,
  CustomerOnboardingPreviewSessionResult
} from "../services/customer-onboarding-batch-service.js";
import type {
  CreateEmptySettings,
  LoggingStoreGetter,
  RequireAuthContext,
  RequireOrganizationAdmin,
  RequestStoreGetter,
  RequirePlatformAdmin,
  RequireWorkspaceEditor,
  ServerManagedSettingsGetter
} from "../route-types.js";

const renewalIssuePasswordSchema = z
  .string()
  .trim()
  .regex(/^$|^\d{6}$/, "발급용 임시번호는 숫자 6자리여야 합니다.");

const settingsSchema = z.object({
  imapHost: z.string(),
  imapPort: z.number().int().min(1),
  imapSecure: z.boolean(),
  imapUser: z.string(),
  imapPass: z.string(),
  imapMailbox: z.string(),
  smtpHost: z.string(),
  smtpPort: z.number().int().min(1),
  smtpSecure: z.boolean(),
  smtpUser: z.string(),
  smtpPass: z.string(),
  smtpFromName: z.string(),
  smtpFromEmail: z.string(),
  notificationEmails: z.array(z.string()).default([]),
  defaultIssueDay: z.number().int().min(1).max(31),
  defaultIssueHour: z.number().int().min(0).max(23),
  defaultIssueMinute: z.number().int().min(0).max(59),
  mailPollMinutes: z.number().int().min(1).max(1440),
  mailSyncStartAt: z.string().nullable(),
  timezone: z.string(),
  renewalContactDepartment: z.string(),
  renewalContactFax: z.string(),
  renewalCertificatePassword: z.string(),
  renewalIssuePassword: renewalIssuePasswordSchema,
  schedulerEnabled: z.boolean()
});

const mailTestSchema = z.object({
  imapHost: z.string(),
  imapPort: z.number().int().min(1),
  imapSecure: z.boolean(),
  imapUser: z.string(),
  imapPass: z.string(),
  imapMailbox: z.string(),
  smtpHost: z.string(),
  smtpPort: z.number().int().min(1),
  smtpSecure: z.boolean(),
  smtpUser: z.string(),
  smtpPass: z.string(),
  smtpFromName: z.string(),
  smtpFromEmail: z.string()
});

const addressLookupSchema = z.object({
  query: z.string().trim().min(1).max(200)
});

const customerImportRowSchema = z.object({
  rowIndex: z.number().int().min(1),
  customerName: z.string().default(""),
  businessNumber: z.string().default(""),
  corpName: z.string().default(""),
  addr: z.string().default("")
});

const customerImportSchema = z.object({
  rows: z.array(customerImportRowSchema).min(1).max(5000)
});

const customerImportProfileSchema = z.object({
  headerRowIndex: z.number().int().min(0).max(20),
  fieldHeaderMap: z.object({
    customerName: z.string().default(""),
    businessNumber: z.string().default(""),
    corpName: z.string().default(""),
    addr: z.string().default("")
  })
});

const customerOnboardingCustomerRowSchema = z.object({
  rowIndex: z.number().int().min(1),
  customerName: z.string().default(""),
  businessNumber: z.string().default(""),
  corpName: z.string().default(""),
  addr: z.string().default(""),
  bizType: z.string().default(""),
  bizClass: z.string().default(""),
  renewalContactMobile: z.string().default(""),
  memo: z.string().default("")
});

const customerOnboardingPlantRowSchema = z.object({
  rowIndex: z.number().int().min(1),
  businessNumber: z.string().default(""),
  plantName: z.string().default(""),
  matchAddress: z.string().default("")
});

const customerOnboardingCertificateRowSchema = z.object({
  rowIndex: z.number().int().min(1),
  businessNumber: z.string().default(""),
  certificateKind: z.enum(["electronic_tax", "general_personal", "general_business", "unknown"]),
  certificateIndex: z.string().default(""),
  certificateName: z.string().default(""),
  certificateUsageName: z.string().default(""),
  issuerName: z.string().default(""),
  serial: z.string().default(""),
  userDN: z.string().default(""),
  expireDate: z.string().nullable().optional().default(null),
  certificatePassword: z.string().default(""),
  isPrimary: z.boolean().default(false)
});

const customerOnboardingSchema = z.object({
  customers: z.array(customerOnboardingCustomerRowSchema).min(1).max(2000),
  plants: z.array(customerOnboardingPlantRowSchema).max(5000).default([]),
  certificates: z.array(customerOnboardingCertificateRowSchema).max(5000).default([])
});

const customerOnboardingCommitSchema = z.object({
  previewId: z.string().uuid()
});

const completedBillingMonthSchema = z.object({
  billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "정산월 형식이 올바르지 않습니다.")
});

type RouteDeps = {
  app: Express;
  store: AppStore | null;
  getRequestStore: RequestStoreGetter;
  requireAuthContext: RequireAuthContext;
  requireWorkspaceEditor: RequireWorkspaceEditor;
  requireOrganizationAdmin: RequireOrganizationAdmin;
  requirePlatformAdmin: RequirePlatformAdmin;
  getLoggingStore: LoggingStoreGetter;
  getServerManagedSettings: ServerManagedSettingsGetter;
  applyServerManagedSettings: (settings: AppSettings) => AppSettings;
  createEmptySettings: CreateEmptySettings;
  toClientSettings: (settings: AppSettings, options?: { role?: ReturnType<RequireAuthContext>["activeOrganizationRole"] }) => unknown;
  testMailConnections: (input: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPass: string;
    imapMailbox: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    smtpFromName: string;
    smtpFromEmail: string;
  }) => Promise<unknown>;
  resolveRoadAddress: (query: string) => Promise<{
    resolvedAddress: string;
    postalCode: string | null;
    isRoadAddress: boolean;
  } | null>;
  getPartnerBalance: (settings: AppSettings, corpNum: string) => Promise<{ remainPoint: number }>;
  getTaxInvoiceUnitCost: (settings: AppSettings, corpNum: string) => Promise<number>;
  getPartnerChargeURL: (settings: AppSettings, corpNum: string) => Promise<string>;
  maskBusinessNumber: (value: string) => string | null;
  normalizeCustomerImportRow: (row: z.infer<typeof customerImportRowSchema>) => CustomerImportMappedRow;
  buildCustomerImportPreview: (requestStore: AppStore, rows: CustomerImportMappedRow[]) => Promise<CustomerImportPreviewResult>;
  commitCustomerImport: (requestStore: AppStore, preview: CustomerImportPreviewResult) => Promise<CustomerImportCommitResult>;
  createCustomerOnboardingPreviewSession: (
    requestStore: AppStore,
    workbook: {
      customers: CustomerOnboardingCustomerRow[];
      plants: CustomerOnboardingPlantRow[];
      certificates: CustomerOnboardingCertificateRow[];
    },
    options: {
      organizationId: string;
      requestedByUserId: string | null;
    }
  ) => Promise<CustomerOnboardingPreviewSessionResult>;
  startCustomerOnboardingCommitBatch: (options: {
    organizationId: string;
    requestedByUserId: string | null;
    previewId: string;
  }) => Promise<CustomerOnboardingCommitBatchStartResult>;
  getCustomerOnboardingCommitBatchStatus: (options: {
    organizationId: string;
    batchId: string;
  }) => Promise<CustomerOnboardingCommitBatchStatusResult>;
  runDueJobs: (args: { limit?: number; claimedBy: string }) => Promise<Record<string, unknown>>;
};

export function registerSettingsRoutes(deps: RouteDeps) {
  const {
    app,
    store,
    getRequestStore,
    requireAuthContext,
    requireWorkspaceEditor,
    requireOrganizationAdmin,
    requirePlatformAdmin,
    getLoggingStore,
    getServerManagedSettings,
    applyServerManagedSettings,
    createEmptySettings,
    toClientSettings,
    testMailConnections,
    resolveRoadAddress,
    getPartnerBalance,
    getTaxInvoiceUnitCost,
    getPartnerChargeURL,
    maskBusinessNumber,
    normalizeCustomerImportRow,
    buildCustomerImportPreview,
    commitCustomerImport,
    createCustomerOnboardingPreviewSession,
    startCustomerOnboardingCommitBatch,
    getCustomerOnboardingCommitBatchStatus,
    runDueJobs
  } = deps;

  app.get("/api/settings", async (_req, res) => {
    const authContext = requireAuthContext(res);
    const requestStore = getRequestStore(res, store);
    res.json(toClientSettings(await requestStore.getSettings(), { role: authContext.activeOrganizationRole }));
  });

  app.get("/api/settings/popbill-shared-password", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    await requestStore.createLog("warn", "settings", "발행 연동 공통 비밀번호 재표시 요청을 차단했습니다.");
    res.status(410).json({
      error: "발행 연동 공통 비밀번호는 서버 운영값으로만 관리합니다. 변경이 필요하면 서버 환경 변수를 수정하세요."
    });
  });

  app.get("/api/settings/renewal-issue-password", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    await requestStore.createLog("warn", "settings", "공동인증서 갱신 발급용 비밀번호 재표시 요청을 차단했습니다.");
    res.status(410).json({
      error: "발급용 임시번호는 보안 정책상 다시 표시하지 않습니다. 변경이 필요하면 새 값을 다시 입력하세요."
    });
  });

  app.get("/api/settings/renewal-certificate-password", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    await requestStore.createLog("warn", "settings", "공동인증서 공통 비밀번호 재표시 요청을 차단했습니다.");
    res.status(410).json({
      error: "공동인증서 비밀번호는 서버에 저장하지 않습니다. 현재 브라우저 탭이나 AT 헬퍼에서 다시 입력하세요."
    });
  });

  app.get("/api/popbill/partner-points", async (_req, res) => {
    requirePlatformAdmin(res);
    const settings = store ? await getServerManagedSettings(store) : applyServerManagedSettings(createEmptySettings());
    const referenceCorpNum = settings.popbillPartnerCorpNum.trim();

    if (!settings.popbillLinkId || !settings.popbillSecretKey) {
      res.json({
        available: false,
        isTest: settings.popbillIsTest,
        referenceCorpNum: null,
        partnerRemainPoint: null,
        taxInvoiceUnitCost: null,
        message: "전자세금계산서 연동이 아직 준비되지 않았습니다."
      });
      return;
    }

    if (!referenceCorpNum) {
      res.json({
        available: false,
        isTest: settings.popbillIsTest,
        referenceCorpNum: null,
        partnerRemainPoint: null,
        taxInvoiceUnitCost: null,
        message: "전자세금계산서 연동 결제 정보가 아직 준비되지 않았습니다."
      });
      return;
    }

    try {
      const [partnerBalance, taxInvoiceUnitCost] = await Promise.all([
        getPartnerBalance(settings, referenceCorpNum),
        getTaxInvoiceUnitCost(settings, referenceCorpNum)
      ]);

      res.json({
        available: true,
        isTest: settings.popbillIsTest,
        referenceCorpNum: maskBusinessNumber(referenceCorpNum),
        partnerRemainPoint: partnerBalance.remainPoint,
        taxInvoiceUnitCost,
        message: settings.popbillIsTest ? "전자세금계산서 테스트 환경 연동 포인트입니다." : "전자세금계산서 운영 환경 연동 포인트입니다."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "전자세금계산서 연동 포인트 조회에 실패했습니다.";
      res.json({
        available: false,
        isTest: settings.popbillIsTest,
        referenceCorpNum: maskBusinessNumber(referenceCorpNum),
        partnerRemainPoint: null,
        taxInvoiceUnitCost: null,
        message
      });
    }
  });

  app.get("/api/popbill/partner-charge-url", async (_req, res) => {
    requirePlatformAdmin(res);
    const loggingStore = getLoggingStore(res, store);
    const settings = store ? await getServerManagedSettings(store) : applyServerManagedSettings(createEmptySettings());
    const referenceCorpNum = settings.popbillPartnerCorpNum.trim();

    if (!settings.popbillLinkId || !settings.popbillSecretKey) {
      res.status(400).json({ error: "전자세금계산서 연동이 아직 준비되지 않았습니다." });
      return;
    }

    if (!referenceCorpNum) {
      res.status(400).json({ error: "전자세금계산서 연동 결제 정보가 아직 준비되지 않았습니다." });
      return;
    }

    const url = await getPartnerChargeURL(settings, referenceCorpNum);
    await loggingStore?.createLog("info", "popbill", "파트너 포인트 충전 URL을 발급했습니다.", {
      referenceCorpNum,
      isTest: settings.popbillIsTest
    });
    res.json({ url });
  });

  app.put("/api/settings", async (req, res) => {
    const authContext = requireOrganizationAdmin(res);
    const requestStore = getRequestStore(res, store);
    const payload = settingsSchema.parse(req.body) as Partial<AppSettings>;
    const settings = await requestStore.updateSettings(payload);
    await requestStore.createLog("info", "settings", "시스템 설정을 저장했습니다.");
    res.json(toClientSettings(settings, { role: authContext.activeOrganizationRole }));
  });

  app.post("/api/system/mail-test", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = mailTestSchema.parse(req.body);
    const currentSettings = await requestStore.getSettings();
    const result = await testMailConnections({
      ...payload,
      imapPass: payload.imapPass || currentSettings.imapPass,
      smtpPass: payload.smtpPass || currentSettings.smtpPass
    });
    res.json(result);
  });

  app.post("/api/settings/mail-connection-verified", async (_req, res) => {
    const authContext = requireOrganizationAdmin(res);
    const requestStore = getRequestStore(res, store);
    const currentSettings = await requestStore.getSettings();
    const verifiedSettings = await requestStore.updateSettings({
      mailConnectionVerifiedAt:
        currentSettings.imapUser && currentSettings.smtpUser && (currentSettings.imapPass || currentSettings.smtpPass)
          ? new Date().toISOString()
          : null
    });
    await requestStore.createLog("info", "settings", "메일 연결 검증 상태를 갱신했습니다.");
    res.json(toClientSettings(verifiedSettings, { role: authContext.activeOrganizationRole }));
  });

  app.get("/api/address/resolve", async (req, res) => {
    requireWorkspaceEditor(res);
    const { query } = addressLookupSchema.parse(req.query);
    const resolved = await resolveRoadAddress(query);
    res.json({
      ok: resolved !== null,
      input: query,
      resolvedAddress: resolved?.resolvedAddress ?? null,
      postalCode: resolved?.postalCode ?? null,
      isRoadAddress: resolved?.isRoadAddress ?? null
    });
  });

  app.post("/api/customer-import/preview", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = customerImportSchema.parse(req.body);
    const rows = payload.rows.map(normalizeCustomerImportRow);
    res.json(await buildCustomerImportPreview(requestStore, rows));
  });

  app.get("/api/customer-import/profile", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    res.json({ profile: await requestStore.getCustomerImportProfile() });
  });

  app.put("/api/customer-import/profile", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = customerImportProfileSchema.parse(req.body) as Pick<CustomerImportProfile, "headerRowIndex" | "fieldHeaderMap">;
    const profile = await requestStore.updateCustomerImportProfile(payload);
    res.json({ profile });
  });

  app.get("/api/completed-billing-months", async (_req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    res.json({ months: await requestStore.listCompletedBillingMonths() });
  });

  app.post("/api/completed-billing-months", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = completedBillingMonthSchema.parse(req.body);
    const month = await requestStore.markCompletedBillingMonth(payload.billingMonth);
    res.json({ month });
  });

  app.post("/api/customer-import/commit", async (req, res) => {
    requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = customerImportSchema.parse(req.body);
    const rows = payload.rows.map(normalizeCustomerImportRow);
    const preview = await buildCustomerImportPreview(requestStore, rows);
    res.json(await commitCustomerImport(requestStore, preview));
  });

  app.post("/api/customer-onboarding/preview", async (req, res) => {
    const authContext = requireWorkspaceEditor(res);
    const requestStore = getRequestStore(res, store);
    const payload = customerOnboardingSchema.parse(req.body);
    res.json(
      await createCustomerOnboardingPreviewSession(requestStore, payload, {
        organizationId: authContext.activeOrganizationId,
        requestedByUserId: authContext.userId
      })
    );
  });

  app.post("/api/customer-onboarding/commit", async (req, res) => {
    const authContext = requireWorkspaceEditor(res);
    const payload = customerOnboardingCommitSchema.parse(req.body);
    const batch = await startCustomerOnboardingCommitBatch({
      organizationId: authContext.activeOrganizationId,
      requestedByUserId: authContext.userId,
      previewId: payload.previewId
    });

    if (batch.status === "queued") {
      setImmediate(() => {
        void runDueJobs({
          limit: 1,
          claimedBy: "customer-onboarding-trigger"
        }).catch(() => {
          /* background trigger is best-effort; polling endpoint will reflect the actual state */
        });
      });
    }

    res.status(202).json(batch);
  });

  app.get("/api/customer-onboarding/batches/:batchId", async (req, res) => {
    const authContext = requireWorkspaceEditor(res);
    res.json(
      await getCustomerOnboardingCommitBatchStatus({
        organizationId: authContext.activeOrganizationId,
        batchId: z.string().uuid().parse(req.params.batchId)
      })
    );
  });

  app.post("/api/customer-onboarding/follow-up/run", async (req, res) => {
    requireWorkspaceEditor(res);
    const payload = z
      .object({
        limit: z.number().int().min(1).max(20).optional()
      })
      .parse(req.body ?? {});
    const result = await runDueJobs({
      limit: payload.limit ?? 5,
      claimedBy: "customer-onboarding-poll"
    });
    res.json({
      ok: true,
      ...result
    });
  });
}
