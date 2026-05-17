import { X509Certificate, randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import express from "express";
import { z } from "zod";
import { collectBridgeCertificateList, collectBridgeProbeResult, prepareRenewPaymentOpenContext } from "./renewal-agent.ts";
import {
  getPopbillChooserDebugReadiness,
  getPopbillDebugArtifactSupport,
  registerPopbillCertificate
} from "./popbill-cert-registration.ts";
import { openSignGateRenewPaymentWindow } from "./signgate-fee-payment.ts";
import { sanitizeSensitiveData, sanitizeSensitiveText } from "../server/src/utils.js";

const DEFAULT_PORT = 35119;
const DEFAULT_ALLOWED_ORIGINS = ["kiyo.kr", "www.kiyo.kr"];
const PREFLIGHT_TRANSPORT_RETRY_COUNT = 1;
const PREFLIGHT_TRANSPORT_RETRY_DELAY_MS = 250;
const UPLOAD_SESSION_MAX_FILE_COUNT = 80;
const UPLOAD_SESSION_MAX_BASE64_CHARS = 2_500_000;
const UPLOAD_ELECTRONIC_TAX_OID = "1.2.410.200004.5.2.1.6.257";
const UPLOAD_USAGE_NAME_BY_OID: Record<string, string> = {
  "1.2.410.200004.5.2.1.6.257": "전자세금용",
  "1.2.410.200004.5.2.1.2": "범용(기업)",
  "1.2.410.200005.1.1.4": "은행/보험용"
};

let activeHelperServer: Server | null = null;
let helperShutdownRequested = false;

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
  return [...DEFAULT_ALLOWED_ORIGINS, ...(configured ?? [])]
    .map(resolveAllowedOriginHost)
    .filter(Boolean);
}

function isLocalLoopbackOrigin(origin: string): boolean {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin);
}

function resolveAllowedOriginHost(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname.toLowerCase();
    }
  } catch {
    // no-op
  }

  return normalized;
}

export function isAllowedLocalRenewalHelperOrigin(origin: string | null | undefined, allowedOrigins = readAllowedOrigins()): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.trim().toLowerCase();
  if (isLocalLoopbackOrigin(origin)) {
    return true;
  }

  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  try {
    const parsed = new URL(normalizedOrigin);
    return allowedOrigins.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function applyCors(req: express.Request, res: express.Response): boolean {
  const origin = req.header("origin")?.trim();
  const isAllowedOrigin = isAllowedLocalRenewalHelperOrigin(origin);

  const resolvedAllowedOrigin = origin || "*";
  res.setHeader("Access-Control-Allow-Origin", resolvedAllowedOrigin);

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", origin ? "true" : "false");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Access-Control-Request-Private-Network");
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (!isAllowedOrigin) {
    console.warn(`[renewal-local-helper] blocked origin: ${origin}`);
    res.status(403).json({ error: "허용되지 않은 Origin입니다." });
    return false;
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
  certificateIndex: z.number().int().positive(),
  certificateCn: z.string().trim().nullable().optional(),
  certificateKind: z.literal("electronic_tax").default("electronic_tax"),
  serial: z.string().trim().nullable().optional(),
  userDN: z.string().trim().nullable().optional(),
  certificatePassword: z.string().trim().min(1)
});

const certificateUploadSessionFileSchema = z.object({
  name: z.string().trim().min(1).max(260),
  relativePath: z.string().trim().min(1).max(2000),
  base64: z.string().trim().min(1).max(UPLOAD_SESSION_MAX_BASE64_CHARS)
});

const certificateUploadSessionSchema = z.object({
  files: z.array(certificateUploadSessionFileSchema).min(1).max(UPLOAD_SESSION_MAX_FILE_COUNT)
});

type LocalPreflightPayload = z.infer<typeof preflightRequestSchema>;
type CertificateUploadSessionFile = z.infer<typeof certificateUploadSessionFileSchema>;

type UploadedCertificateMetadata = {
  index: string;
  cn: string;
  issuerToName: string;
  usageToName: string;
  todate: string | null;
  oid: string | null;
  serial: string | null;
  userDN: string | null;
  validateFrom: string | null;
  detailValidateTo: string | null;
  certDirPath: string | null;
  listSource: "upload-session";
  supportsPreflight: false;
  uploadSessionId: string;
  fileName: string;
  relativePath: string;
  privateKeyIncluded: boolean;
};

type CertificateUploadSessionResult = {
  sessionId: string;
  uploadedAt: string;
  certificates: UploadedCertificateMetadata[];
  rejectedFiles: Array<{
    name: string;
    relativePath: string;
    reason: string;
  }>;
  warnings: string[];
};

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

function normalizeUploadRelativePath(value: string): string {
  return value
    .replace(/\0/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function isUploadSignCertFile(file: Pick<CertificateUploadSessionFile, "name" | "relativePath">): boolean {
  const relativePath = normalizeUploadRelativePath(file.relativePath || file.name);
  return /(^|\/)signCert\.der$/i.test(relativePath) || /^signCert\.der$/i.test(file.name);
}

function hasSiblingUploadPrivateKey(
  signCertFile: Pick<CertificateUploadSessionFile, "name" | "relativePath">,
  files: Array<Pick<CertificateUploadSessionFile, "name" | "relativePath">>
): boolean {
  const signCertRelativePath = normalizeUploadRelativePath(signCertFile.relativePath || signCertFile.name);
  const signCertDirectory = path.posix.dirname(signCertRelativePath);
  return files.some((file) => {
    const relativePath = normalizeUploadRelativePath(file.relativePath || file.name);
    return path.posix.dirname(relativePath) === signCertDirectory && /(^|\/)signPri\.key$/i.test(relativePath);
  });
}

function decodeUploadBase64(value: string): Buffer {
  const normalized = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(normalized, "base64");
}

function encodeOidComponent(value: number): number[] {
  if (value === 0) {
    return [0];
  }

  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    bytes.unshift(remaining & 0x7f);
    remaining >>= 7;
  }
  return bytes.map((byte, index) => (index < bytes.length - 1 ? byte | 0x80 : byte));
}

function encodeObjectIdentifier(oid: string): Buffer | null {
  const parts = oid.split(".").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    return null;
  }

  const [first, second, ...rest] = parts;
  if (first === undefined || second === undefined) {
    return null;
  }

  return Buffer.from([
    ...encodeOidComponent(first * 40 + second),
    ...rest.flatMap(encodeOidComponent)
  ]);
}

function bufferIncludesSequence(buffer: Buffer, sequence: Buffer): boolean {
  if (sequence.length === 0 || buffer.length < sequence.length) {
    return false;
  }
  return buffer.indexOf(sequence) !== -1;
}

function certificateDerContainsOid(raw: Buffer, oid: string): boolean {
  const encodedOid = encodeObjectIdentifier(oid);
  if (!encodedOid) {
    return false;
  }
  const shortDerOid = Buffer.from([0x06, encodedOid.length, ...encodedOid]);
  return bufferIncludesSequence(raw, shortDerOid);
}

function resolveUploadedCertificatePolicyOid(raw: Buffer): string | null {
  for (const oid of Object.keys(UPLOAD_USAGE_NAME_BY_OID)) {
    if (certificateDerContainsOid(raw, oid)) {
      return oid;
    }
  }
  return null;
}

function extractDnAttributeValue(userDn: string, attribute: string): string | null {
  const pattern = new RegExp(`(?:^|,)${attribute}=([^,]+)`, "i");
  const match = userDn.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function resolveIssuerDisplayName(issuer: string): string {
  const organization = issuer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^O=/i.test(line))
    ?.replace(/^O=/i, "")
    .trim();
  if (organization === "KICA") {
    return "한국정보인증";
  }
  return organization || "알 수 없음";
}

function convertHexSerialToDecimal(serialHex: string): string | null {
  const normalized = serialHex.replace(/[^0-9a-f]/gi, "").trim();
  if (!normalized) {
    return null;
  }
  try {
    return BigInt(`0x${normalized}`).toString(10);
  } catch {
    return null;
  }
}

function buildUploadCertificateIndex(input: string): string {
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = Math.abs(hash >>> 0);
  return `upload-${normalized.toString(36)}`;
}

function getUploadedCertificateUserDn(relativePath: string): string | null {
  const normalizedPath = normalizeUploadRelativePath(relativePath);
  const directoryName = path.posix.basename(path.posix.dirname(normalizedPath)).trim();
  return directoryName && directoryName !== "." ? directoryName : null;
}

export function createCertificateUploadSessionMetadata(
  files: CertificateUploadSessionFile[]
): CertificateUploadSessionResult {
  const sessionId = randomUUID();
  const uploadedAt = new Date().toISOString();
  const rejectedFiles: CertificateUploadSessionResult["rejectedFiles"] = [];
  const warnings: string[] = [];
  const certificates: UploadedCertificateMetadata[] = [];
  const normalizedFiles = files.map((file) => ({
    ...file,
    relativePath: normalizeUploadRelativePath(file.relativePath || file.name) || file.name
  }));
  const signCertFiles = normalizedFiles.filter(isUploadSignCertFile);

  if (signCertFiles.length === 0) {
    warnings.push("선택한 파일에서 signCert.der를 찾지 못했습니다. NPKI 인증서 폴더나 signCert.der 파일을 선택하세요.");
  }

  for (const file of signCertFiles) {
    try {
      const raw = decodeUploadBase64(file.base64);
      if (raw.length === 0) {
        rejectedFiles.push({
          name: file.name,
          relativePath: file.relativePath,
          reason: "빈 인증서 파일입니다."
        });
        continue;
      }

      const certificate = new X509Certificate(raw);
      const policyOid = resolveUploadedCertificatePolicyOid(raw);
      if (policyOid !== UPLOAD_ELECTRONIC_TAX_OID) {
        rejectedFiles.push({
          name: file.name,
          relativePath: file.relativePath,
          reason: policyOid
            ? `전자세금용 공동인증서가 아닙니다. (${UPLOAD_USAGE_NAME_BY_OID[policyOid] ?? policyOid})`
            : "인증서 정책 OID를 확인하지 못했습니다."
        });
        continue;
      }

      const validTo = new Date(certificate.validTo);
      const validFrom = new Date(certificate.validFrom);
      const userDN = getUploadedCertificateUserDn(file.relativePath);
      const subject = certificate.subject.replace(/\r?\n/g, ",");
      const serial = convertHexSerialToDecimal(certificate.serialNumber);
      const cn = extractDnAttributeValue(userDN ?? "", "cn") ?? extractDnAttributeValue(subject, "CN") ?? "";
      const privateKeyIncluded = hasSiblingUploadPrivateKey(file, normalizedFiles);
      if (!privateKeyIncluded) {
        warnings.push(`${file.relativePath}: signPri.key를 함께 찾지 못했습니다. 메타데이터만 읽고 자동 등록은 로컬 인증서 목록에서 다시 확인합니다.`);
      }

      certificates.push({
        index: buildUploadCertificateIndex(`${serial ?? ""}|${userDN ?? ""}|${file.relativePath}`),
        cn,
        issuerToName: resolveIssuerDisplayName(certificate.issuer),
        usageToName: UPLOAD_USAGE_NAME_BY_OID[policyOid] ?? policyOid,
        todate: Number.isNaN(validTo.getTime()) ? null : validTo.toISOString(),
        oid: policyOid,
        serial,
        userDN,
        validateFrom: Number.isNaN(validFrom.getTime()) ? null : validFrom.toISOString(),
        detailValidateTo: Number.isNaN(validTo.getTime()) ? null : validTo.toISOString(),
        certDirPath: null,
        listSource: "upload-session",
        supportsPreflight: false,
        uploadSessionId: sessionId,
        fileName: file.name,
        relativePath: file.relativePath,
        privateKeyIncluded
      });
    } catch {
      rejectedFiles.push({
        name: file.name,
        relativePath: file.relativePath,
        reason: "인증서 파일을 읽지 못했습니다."
      });
    }
  }

  return {
    sessionId,
    uploadedAt,
    certificates,
    rejectedFiles,
    warnings
  };
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
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
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
  app.use(express.json({ limit: "16mb" }));

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
        },
        popbillDebugArtifacts: getPopbillDebugArtifactSupport()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bridge-probe", async (_req, res, next) => {
    try {
      const result = await collectBridgeProbeResult({ includeDetailedProbe: true });
      const certificateList = await collectBridgeCertificateList({ preferCached: false });
      result.bridge.licenseProbe = certificateList.licenseProbe;
      result.bridge.storageProbe = certificateList.storageProbe;
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

  app.post("/api/certificates/upload-session", async (req, res, next) => {
    try {
      const payload = certificateUploadSessionSchema.parse(req.body ?? {});
      const result = createCertificateUploadSessionMetadata(payload.files);
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

  app.post("/api/shutdown", (_req, res) => {
    if (helperShutdownRequested) {
      res.json({ ok: true, version, shuttingDown: true });
      return;
    }

    helperShutdownRequested = true;
    res.json({ ok: true, version, shuttingDown: true });

    setTimeout(() => {
      const server = activeHelperServer;
      if (!server) {
        process.exit(0);
        return;
      }

      server.close((error) => {
        if (error) {
          console.error("[renewal-local-helper] shutdown failed", error);
          process.exit(1);
          return;
        }

        activeHelperServer = null;
        process.exit(0);
      });
    }, 50);
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "입력값이 올바르지 않습니다.", details: sanitizeSensitiveData(error.flatten()) });
      return;
    }

    res.status(500).json({
      error: sanitizeSensitiveText(error instanceof Error ? error.message : "로컬 헬퍼 요청 처리에 실패했습니다.")
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
      activeHelperServer = server;
      helperShutdownRequested = false;
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
              activeHelperServer = null;
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
  return entryBasename === "renewal-local-helper" ||
    entryBasename === "renewal-local-helper.ts" ||
    entryBasename === "renewal-local-helper.js" ||
    entryBasename === "renewal-local-helper.cjs" ||
    entryBasename === "renewal-local-helper.mjs";
})();

if (isDirectExecution) {
  void startRenewalLocalHelper();
}
