import fs from "node:fs";
import path from "node:path";
import express from "express";
import { z } from "zod";
import { collectBridgeCertificateList, collectBridgeProbeResult, prepareRenewPaymentOpenContext } from "./renewal-agent.ts";
import { registerPopbillCertificate } from "./popbill-cert-registration.ts";
import { openSignGateRenewPaymentWindow } from "./signgate-fee-payment.ts";

const DEFAULT_PORT = 35119;
const DEFAULT_ALLOWED_ORIGINS = ["https://auto-tax-alpha.vercel.app"];
const PREFLIGHT_TRANSPORT_RETRY_COUNT = 1;
const PREFLIGHT_TRANSPORT_RETRY_DELAY_MS = 250;

function readHelperVersionMetadata(): string {
  const entryDirectory = process.argv[1] ? path.dirname(process.argv[1]) : null;
  const candidateVersionFiles = [
    path.resolve(process.cwd(), "scripts", "renewal-local-helper-release.json"),
    path.resolve(process.cwd(), "dist", "renewal-local-helper", "app", "renewal-local-helper-release.json"),
    entryDirectory ? path.resolve(entryDirectory, "renewal-local-helper-release.json") : null,
    entryDirectory ? path.resolve(entryDirectory, "..", "scripts", "renewal-local-helper-release.json") : null
  ].filter((value): value is string => Boolean(value));

  for (const versionFile of candidateVersionFiles) {
    try {
      const parsed = JSON.parse(fs.readFileSync(versionFile, "utf8")) as { version?: string; latestVersion?: string };
      const version = parsed.version?.trim() || parsed.latestVersion?.trim();
      if (version) {
        return version;
      }
    } catch {
      continue;
    }
  }

  const candidatePackageFiles = [
    path.resolve(process.cwd(), "package.json"),
    entryDirectory ? path.resolve(entryDirectory, "..", "package.json") : null
  ].filter((value): value is string => Boolean(value));

  for (const packageFile of candidatePackageFiles) {
    try {
      const parsed = JSON.parse(fs.readFileSync(packageFile, "utf8")) as { version?: string };
      const version = parsed.version?.trim();
      if (version) {
        return version;
      }
    } catch {
      continue;
    }
  }

  return "0.0.0";
}

function readAllowedOrigins(): string[] {
  const configured = process.env.AUTO_TAX_RENEWAL_HELPER_ALLOWED_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...(configured ?? [])];
}

function isLocalLoopbackOrigin(origin: string): boolean {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin);
}

export function isAllowedLocalRenewalHelperOrigin(origin: string | null | undefined, allowedOrigins = readAllowedOrigins()): boolean {
  if (!origin) {
    return true;
  }

  if (isLocalLoopbackOrigin(origin)) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function applyCors(req: express.Request, res: express.Response): boolean {
  const origin = req.header("origin")?.trim();
  if (!isAllowedLocalRenewalHelperOrigin(origin)) {
    res.status(403).json({ error: "허용되지 않은 Origin입니다." });
    return false;
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  return true;
}

function resolvePort(): number {
  const value = Number(process.env.AUTO_TAX_RENEWAL_HELPER_PORT ?? DEFAULT_PORT);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PORT;
}

const preflightRequestSchema = z.object({
  certificateIndex: z.number().int().positive(),
  certificateCn: z.string().trim().nullable().optional(),
  certificatePassword: z.string().trim().min(1).nullable().optional()
});

const renewalComparisonProfileSchema = z.object({
  corpName: z.string(),
  businessNumber: z.string(),
  ceoName: z.string(),
  addr: z.string(),
  bizType: z.string(),
  bizClass: z.string()
});

const renewalSubmissionProfileSchema = z.object({
  contactName: z.string(),
  contactDepartment: z.string(),
  contactEmail: z.string(),
  contactTel: z.string(),
  contactFax: z.string(),
  contactMobile: z.string(),
  issuePassword: z.string()
});

const renewalPreparePaymentSchema = preflightRequestSchema.extend({
  comparisonProfile: renewalComparisonProfileSchema.nullable().optional(),
  submissionProfile: renewalSubmissionProfileSchema.nullable().optional()
});

const renewalOpenPaymentSchema = renewalPreparePaymentSchema;

const popbillCertificateRegistrationSchema = z.object({
  certificateRegistrationUrl: z.string().url(),
  certificateCn: z.string().trim().min(1),
  certificatePassword: z.string().trim().min(1)
});

type LocalPreflightPayload = z.infer<typeof preflightRequestSchema>;

function isRetryablePreflightFailureDetail(detail: string): boolean {
  if (!detail) {
    return false;
  }

  return /failed to connect to 127\.0\.0\.1 port|connection was reset|recv failure|econnreset|econnrefused|socket hang up|timed out|timeout|fetch failed/i.test(
    detail
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPreflightRequest(payload: LocalPreflightPayload) {
  return {
    certificateIndex: payload.certificateIndex,
    certificateCn: payload.certificateCn ?? null,
    certificatePassword: payload.certificatePassword ?? null,
    comparisonProfile: null,
    submissionProfile: null,
    executeSubmit: false
  };
}

async function collectPreflightProbeResult(payload: LocalPreflightPayload) {
  return await collectBridgeProbeResult({
    includeDetailedProbe: true,
    preflightRequest: buildPreflightRequest(payload)
  });
}

async function collectPreflightProbeResultWithRetry(
  payload: LocalPreflightPayload,
  retryCount = PREFLIGHT_TRANSPORT_RETRY_COUNT
) {
  let result = await collectPreflightProbeResult(payload);

  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    const detail = `${result.bridge.preflightProbe.error ?? ""} ${result.bridge.preflightProbe.message ?? ""}`.trim();
    if (!isRetryablePreflightFailureDetail(detail)) {
      return result;
    }

    await delay(PREFLIGHT_TRANSPORT_RETRY_DELAY_MS);
    result = await collectPreflightProbeResult(payload);
  }

  return result;
}

export function createRenewalLocalHelperApp() {
  const app = express();
  const version = readHelperVersionMetadata();

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (!applyCors(req, res)) {
      return;
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", async (_req, res, next) => {
    try {
      const probe = await collectBridgeProbeResult({ includeDetailedProbe: false });
      res.json({
        ok: true,
        version,
        status: {
          processDetected: probe.process.detected,
          bridgeSummary: probe.bridge.summary,
          notes: probe.notes
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bridge-probe", async (_req, res, next) => {
    try {
      const result = await collectBridgeProbeResult({ includeDetailedProbe: true });
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/certificates", async (_req, res, next) => {
    try {
      const result = await collectBridgeCertificateList();
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/preflight", async (req, res, next) => {
    try {
      const payload = preflightRequestSchema.parse(req.body ?? {});
      const result = await collectPreflightProbeResultWithRetry(payload);
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/renewal/prepare-payment", async (req, res, next) => {
    try {
      const payload = renewalPreparePaymentSchema.parse(req.body ?? {});
      const result = await collectBridgeProbeResult({
        includeDetailedProbe: true,
        preflightRequest: {
          certificateIndex: payload.certificateIndex,
          certificateCn: payload.certificateCn ?? null,
          certificatePassword: payload.certificatePassword ?? null,
          comparisonProfile: payload.comparisonProfile ?? null,
          submissionProfile: payload.submissionProfile ?? null,
          executeSubmit: true
        }
      });
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/renewal/open-payment", async (req, res, next) => {
    try {
      const payload = renewalOpenPaymentSchema.parse(req.body ?? {});
      const context = await prepareRenewPaymentOpenContext({
        certificateIndex: payload.certificateIndex,
        certificateCn: payload.certificateCn ?? null,
        certificatePassword: payload.certificatePassword ?? null,
        comparisonProfile: payload.comparisonProfile ?? null,
        submissionProfile: payload.submissionProfile ?? null,
        executeSubmit: true
      });
      const result = await openSignGateRenewPaymentWindow(context);
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/popbill/certificate-registration", async (req, res, next) => {
    try {
      const payload = popbillCertificateRegistrationSchema.parse(req.body ?? {});
      const result = await registerPopbillCertificate(payload);
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "입력값이 올바르지 않습니다.", details: error.flatten() });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "로컬 헬퍼 요청 처리에 실패했습니다."
    });
  });

  return app;
}

export async function startRenewalLocalHelper() {
  const app = createRenewalLocalHelperApp();
  const port = resolvePort();

  return await new Promise<{
    app: express.Express;
    port: number;
    close: () => Promise<void>;
  }>((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`[renewal-local-helper] listening on http://127.0.0.1:${port}`);
      resolve({
        app,
        port,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          })
      });
    });

    server.once("error", reject);
  });
}

const isDirectExecution = (() => {
  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }

  return path.basename(entryArg).toLowerCase().includes("renewal-local-helper");
})();

if (isDirectExecution) {
  void startRenewalLocalHelper();
}
