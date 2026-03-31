import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import { collectBridgeProbeResult, prepareRenewPaymentOpenContext } from "./renewal-agent.ts";
import { registerPopbillCertificate } from "./popbill-cert-registration.ts";
import { openSignGateRenewPaymentWindow } from "./signgate-fee-payment.ts";

const DEFAULT_PORT = 35119;
const DEFAULT_ALLOWED_ORIGINS = ["https://auto-tax-alpha.vercel.app"];

function resolveCurrentFilePath(): string {
  if (typeof __filename !== "undefined") {
    return __filename;
  }

  return fileURLToPath(import.meta.url);
}

function readPackageVersion(): string {
  const packageFile = path.resolve(path.dirname(resolveCurrentFilePath()), "..", "package.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(packageFile, "utf8")) as { version?: string };
    return parsed.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
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

export function createRenewalLocalHelperApp() {
  const app = express();
  const version = readPackageVersion();

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

  app.post("/api/preflight", async (req, res, next) => {
    try {
      const payload = preflightRequestSchema.parse(req.body ?? {});
      const result = await collectBridgeProbeResult({
        includeDetailedProbe: true,
        preflightRequest: {
          certificateIndex: payload.certificateIndex,
          certificateCn: payload.certificateCn ?? null,
          certificatePassword: payload.certificatePassword ?? null,
          comparisonProfile: null,
          submissionProfile: null,
          executeSubmit: false
        }
      });
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

  const entryBasename = path.basename(entryArg).toLowerCase();
  if (!entryBasename.includes("renewal-local-helper")) {
    return false;
  }

  const currentFile = resolveCurrentFilePath();
  return path.resolve(currentFile) === path.resolve(entryArg);
})();

if (isDirectExecution) {
  void startRenewalLocalHelper();
}
