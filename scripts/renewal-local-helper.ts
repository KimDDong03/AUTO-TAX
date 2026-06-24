import { spawnSync } from "node:child_process";
import { X509Certificate, randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { z } from "zod";
import {
  collectBridgeCertificateList,
  collectBridgeProbeResult,
  collectHomeTaxBusinessInfoLookup,
  invalidateHomeTaxMagicLineRawCandidateCache,
  importP12ToSignGateHddStore,
  prepareRenewPaymentOpenContext,
  warmHomeTaxBusinessInfoBrowser
} from "./renewal-agent.ts";
import {
  getPopbillChooserDebugReadiness,
  getPopbillDebugArtifactSupport,
  PopbillCertificateRegistrationError,
  registerPopbillCertificate
} from "./popbill-cert-registration.ts";
import { openSignGateRenewPaymentWindow } from "./signgate-fee-payment.ts";
import type {
  CertificateBusinessInfoLookupResult,
  CertificateBusinessInfoLookupStatus,
  HomeTaxBusinessInfoLookupResult,
} from "./hometax-business-info.ts";
import { sanitizeSensitiveData, sanitizeSensitiveText } from "../server/src/utils.js";

const DEFAULT_PORT = 35119;
const DEFAULT_ALLOWED_ORIGINS = ["kiyo.kr", "www.kiyo.kr"];
const PREFLIGHT_TRANSPORT_RETRY_COUNT = 1;
const PREFLIGHT_TRANSPORT_RETRY_DELAY_MS = 250;
const PREFLIGHT_BATCH_MAX_COUNT = 200;
const PREFLIGHT_BATCH_DEFAULT_CONCURRENCY = 16;
const PREFLIGHT_BATCH_MAX_CONCURRENCY = 32;
const HOMETAX_BUSINESS_INFO_BATCH_DEFAULT_CONCURRENCY = 5;
const HOMETAX_BUSINESS_INFO_BATCH_MAX_CONCURRENCY = 5;
const CERTIFICATE_BUSINESS_INFO_SIGNGATE_BATCH_DEFAULT_CONCURRENCY = 16;
const CERTIFICATE_BUSINESS_INFO_SIGNGATE_BATCH_MAX_CONCURRENCY = 32;
const UPLOAD_SESSION_MAX_FILE_COUNT = 500;
const UPLOAD_SESSION_MAX_BASE64_CHARS = 2_500_000;
const UPLOAD_SESSION_TTL_MS = 30 * 60 * 1000;
const UPLOAD_USAGE_NAME_BY_OID: Record<string, string> = {
  "1.2.410.200004.5.2.1.6.257": "전자세금용",
  "1.2.410.200004.5.2.1.6.115": "전자세금용",
  "1.2.410.200004.5.5.1.4.2": "전자세금용",
  "1.2.410.200004.5.1.1.5": "개인 범용",
  "1.2.410.200004.5.1.1.7": "기업 범용",
  "1.2.410.200004.5.2.1.1": "기업 범용",
  "1.2.410.200004.5.2.1.2": "개인 범용",
  "1.2.410.200004.5.3.1.4": "개인 범용",
  "1.2.410.200004.5.4.1.1": "개인 범용",
  "1.2.410.200004.5.3.1.1": "기업 범용",
  "1.2.410.200004.5.4.1.2": "기업 범용",
  "1.2.410.200004.5.5.1.1": "기업 범용",
  "1.2.410.200005.1.1.1": "개인 범용",
  "1.2.410.200005.1.1.5": "기업 범용",
  "1.2.410.200005.1.1.4": "은행/보험용",
  "1.2.410.200005.1.1.6.8": "전자세금용",
  "1.2.410.200012.1.1.1": "개인 범용",
  "1.2.410.200012.1.1.3": "기업 범용"
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

const preflightBatchRequestSchema = z.object({
  requests: z.array(preflightRequestSchema).min(1).max(PREFLIGHT_BATCH_MAX_COUNT),
  concurrency: z.number().int().min(1).max(PREFLIGHT_BATCH_MAX_CONCURRENCY).optional()
});

const businessInfoCertificateIndexSchema = z.union([
  z.number().int().positive(),
  z.string().trim().min(1)
]);

const hometaxBusinessInfoRequestSchema = z.object({
  certificateIndex: businessInfoCertificateIndexSchema,
  certificateCn: z.string().trim().nullable().optional(),
  certificatePassword: z.string().trim().min(1).nullable().optional(),
  serial: z.string().trim().nullable().optional(),
  userDN: z.string().trim().nullable().optional(),
  issuerToName: z.string().trim().nullable().optional(),
  usageToName: z.string().trim().nullable().optional(),
  oid: z.string().trim().nullable().optional(),
  uploadSessionId: z.string().trim().nullable().optional(),
  relativePath: z.string().trim().nullable().optional()
});

const hometaxBusinessInfoBatchRequestSchema = z.object({
  requests: z.array(hometaxBusinessInfoRequestSchema).min(1).max(PREFLIGHT_BATCH_MAX_COUNT),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(HOMETAX_BUSINESS_INFO_BATCH_MAX_CONCURRENCY)
    .optional()
});

const certificateBusinessInfoBatchRequestSchema = z.object({
  requests: z.array(hometaxBusinessInfoRequestSchema).min(1).max(PREFLIGHT_BATCH_MAX_COUNT),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(CERTIFICATE_BUSINESS_INFO_SIGNGATE_BATCH_MAX_CONCURRENCY)
    .optional(),
  signGateConcurrency: z
    .number()
    .int()
    .min(1)
    .max(CERTIFICATE_BUSINESS_INFO_SIGNGATE_BATCH_MAX_CONCURRENCY)
    .optional(),
  homeTaxConcurrency: z
    .number()
    .int()
    .min(1)
    .max(HOMETAX_BUSINESS_INFO_BATCH_MAX_CONCURRENCY)
    .optional()
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
  targetExpireDate: z.string().trim().nullable().optional(),
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

const certificateUploadSessionImportRequestSchema = z.object({
  uploadSessionId: z.string().trim().min(1),
  certificateIndex: z.string().trim().min(1),
  relativePath: z.string().trim().optional(),
  certificatePassword: z.string().trim().min(1)
});

const certificateUploadSessionImportSchema = z.object({
  requests: z.array(certificateUploadSessionImportRequestSchema).min(1).max(50)
});

type LocalPreflightPayload = z.infer<typeof preflightRequestSchema>;
type LocalHomeTaxBusinessInfoPayload = z.infer<typeof hometaxBusinessInfoRequestSchema>;
type CertificateUploadSessionFile = z.infer<typeof certificateUploadSessionFileSchema>;
type CertificateUploadSessionImportRequest = z.infer<typeof certificateUploadSessionImportRequestSchema>;

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

type RenewalBridgeCertificateSummary = Awaited<
  ReturnType<typeof collectBridgeCertificateList>
>["storageProbe"]["certificates"][number];

type StoredCertificateUploadSession = {
  createdAt: number;
  files: CertificateUploadSessionFile[];
  certificates: UploadedCertificateMetadata[];
};

type CertificateUploadSessionImportResult = {
  importedCertificates: RenewalBridgeCertificateSummary[];
  rejectedImports: Array<{
    uploadSessionId: string;
    certificateIndex: string;
    relativePath: string | null;
    reason: string;
  }>;
  warnings: string[];
};

const certificateUploadSessions = new Map<string, StoredCertificateUploadSession>();

function isRetryablePreflightFailureDetail(detail: string): boolean {
  if (!detail) {
    return false;
  }

  return /failed to connect to 127\.0\.0\.1 port|connection was reset|recv failure|econnreset|econnrefused|socket hang up|timed out|timeout|fetch failed/i.test(
    detail
  );
}

function shouldRetryPreflightResult(result: Awaited<ReturnType<typeof collectPreflightProbeResult>>): boolean {
  const probe = result.bridge.preflightProbe;
  const detail = `${probe.error ?? ""} ${probe.message ?? ""}`.trim();
  return isRetryablePreflightFailureDetail(detail) || (probe.ok && !probe.renewInfoSnapshot && !detail);
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

function isUploadPfxCertificateFile(file: Pick<CertificateUploadSessionFile, "name" | "relativePath">): boolean {
  const relativePath = normalizeUploadRelativePath(file.relativePath || file.name);
  return /(^|\/)[^/]+\.(p12|pfx)$/i.test(relativePath) || /\.(p12|pfx)$/i.test(file.name);
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

function decodeCertutilOutput(buffer: Buffer): string {
  try {
    return new TextDecoder("euc-kr").decode(buffer);
  } catch {
    return buffer.toString("utf8");
  }
}

function escapeDumpFieldRegExpLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function extractDumpFieldValue(dumpText: string, labels: string[]): string | null {
  const escapedLabels = labels
    .map((label) => escapeDumpFieldRegExpLabel(label))
    .filter(Boolean)
    .join("|");
  if (!escapedLabels) {
    return null;
  }

  const regex = new RegExp(
    `(?:^|\\r?\\n)\\s*(?:${escapedLabels})\\s*[:=]\\s*([^\\r\\n]+)`,
    "i"
  );
  const match = dumpText.match(regex);
  return match?.[1]?.trim() ?? null;
}

function extractPolicyOidFromDump(dumpText: string): string | null {
  const matches = [...dumpText.matchAll(/Policy Identifier\s*=\s*([0-9]+(?:\.[0-9]+)*)/gi)].map((match) => match[1]);
  return matches.find((oid) => oid && UPLOAD_USAGE_NAME_BY_OID[oid]) ?? matches[0] ?? null;
}

function parseCertutilDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:\s+(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const meridiem = match[4]?.toLowerCase();
  let hour = Number(match[5] ?? 0);
  const minute = Number(match[6] ?? 0);
  const second = Number(match[7] ?? 0);
  if (meridiem === "오후" || meridiem === "pm") {
    hour = hour === 12 ? 12 : hour + 12;
  } else if (meridiem === "오전" || meridiem === "am") {
    hour = hour === 12 ? 0 : hour;
  }

  const parsed = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
    .split(/[\r\n,]+/)
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

function readUploadedPfxDumpText(raw: Buffer, relativePath: string): string | null {
  if (process.platform !== "win32") {
    return null;
  }

  const extension = path.extname(relativePath).toLowerCase() || ".pfx";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-tax-pfx-"));
  const tempFile = path.join(tempDir, `${randomUUID()}${extension}`);
  try {
    fs.writeFileSync(tempFile, raw);
    const result = spawnSync("certutil.exe", ["-v", "-dump", tempFile], {
      encoding: "buffer",
      timeout: 10_000,
      windowsHide: true
    });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(String(result.stdout ?? ""));
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(String(result.stderr ?? ""));
    const text = decodeCertutilOutput(Buffer.concat([stdout, Buffer.from("\n"), stderr]));
    return text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

export function isPfxPasswordMismatchMessage(message: string): boolean {
  return /AUTO_TAX_P12_PASSWORD_MISMATCH|지정된\s*네트워크\s*암호가\s*맞지|network password.*not correct|password.*incorrect|mac verify failure/i.test(message);
}

function validatePfxPasswordWithWindowsCertificateApi(
  filePath: string,
  certificatePassword: string
): { ok: true } | { ok: false; reason: string; passwordMismatch: boolean } {
  if (process.platform !== "win32") {
    return { ok: true };
  }

  const script = `
$ErrorActionPreference = 'Stop'
try {
  $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
  $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($env:AUTO_TAX_P12_VALIDATE_FILE, $env:AUTO_TAX_P12_VALIDATE_PASSWORD, $flags)
  if (-not $cert.HasPrivateKey) {
    throw 'AUTO_TAX_P12_PRIVATE_KEY_MISSING'
  }
  Write-Output 'AUTO_TAX_P12_VALIDATE_OK'
  exit 0
} catch {
  $message = $_.Exception.Message
  if ($message -match '지정된\\s*네트워크\\s*암호가\\s*맞지|network password.*not correct|password.*incorrect|mac verify failure') {
    Write-Output 'AUTO_TAX_P12_PASSWORD_MISMATCH'
  } else {
    Write-Output ('AUTO_TAX_P12_VALIDATE_ERROR: ' + $message)
  }
  exit 2
}
`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      encoding: "buffer",
      env: {
        ...process.env,
        AUTO_TAX_P12_VALIDATE_FILE: filePath,
        AUTO_TAX_P12_VALIDATE_PASSWORD: certificatePassword
      },
      timeout: 10_000,
      windowsHide: true
    }
  );
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(String(result.stdout ?? ""));
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(String(result.stderr ?? ""));
  const message = sanitizeSensitiveText(
    decodeCertutilOutput(Buffer.concat([stdout, Buffer.from("\n"), stderr]))
  ).slice(0, 1200);

  if (result.status === 0 && message.includes("AUTO_TAX_P12_VALIDATE_OK")) {
    return { ok: true };
  }

  if (isPfxPasswordMismatchMessage(message)) {
    return {
      ok: false,
      passwordMismatch: true,
      reason: "p12/pfx 인증서 비밀번호가 올바르지 않습니다. 공통 비밀번호와 다르면 해당 행의 개별 비밀번호를 입력해 주세요."
    };
  }

  return {
    ok: false,
    passwordMismatch: false,
    reason: `p12/pfx 인증서 비밀번호를 확인하지 못했습니다.${message ? ` ${message}` : ""}`
  };
}

function isGenericSignGatePfxImportFailure(message: string | null | undefined): boolean {
  return /인증서\s*가져오기\s*중에\s*문제가\s*발생|375848960/.test(message ?? "");
}

function resolveUploadedPfxCertificateMetadata(
  file: CertificateUploadSessionFile,
  raw: Buffer,
  sessionId: string
): UploadedCertificateMetadata | null {
  const dumpText = readUploadedPfxDumpText(raw, file.relativePath);
  if (!dumpText) {
    return null;
  }

  const subject =
    extractDumpFieldValue(dumpText, ["Subject", "주체"]) ?? "";
  const normalizedSubject = subject
    .replace(/\r?\n/g, ",")
    .replace(/\s*,\s*/g, ",")
    .trim();
  const issuer =
    extractDumpFieldValue(dumpText, ["Issuer", "발급자"]) ?? "";
  const normalizedIssuer = issuer
    .replace(/\r?\n/g, ",")
    .replace(/\s*,\s*/g, ",")
    .trim();
  const cn =
    extractDnAttributeValue(normalizedSubject, "CN") ??
    path.basename(file.name, path.extname(file.name));
  const policyOid = extractPolicyOidFromDump(dumpText);
  const validTo = parseCertutilDate(
    extractDumpFieldValue(dumpText, ["NotAfter", "Not After", "유효 종료일", "만료일"])
  );
  const validFrom = parseCertutilDate(
    extractDumpFieldValue(dumpText, ["NotBefore", "Not Before", "유효 시작일", "발급일"])
  );
  const serial = convertHexSerialToDecimal(
    extractDumpFieldValue(dumpText, ["Serial Number", "Serial", "일련 번호", "시리얼 번호"]) ?? ""
  );

  if (!cn && !serial && !validTo) {
    return null;
  }

  return {
    index: buildUploadCertificateIndex(`${serial ?? ""}|${normalizedSubject}|${file.relativePath}`),
    cn,
    issuerToName: resolveIssuerDisplayName(normalizedIssuer || normalizedSubject),
    usageToName: policyOid ? (UPLOAD_USAGE_NAME_BY_OID[policyOid] ?? policyOid) : "알 수 없음",
    todate: validTo,
    oid: policyOid,
    serial,
    userDN: normalizedSubject || cn || null,
    validateFrom: validFrom,
    detailValidateTo: validTo,
    certDirPath: null,
    listSource: "upload-session",
    supportsPreflight: false,
    uploadSessionId: sessionId,
    fileName: file.name,
    relativePath: file.relativePath,
    privateKeyIncluded: true
  };
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
  const pfxCertificateFiles = normalizedFiles.filter(isUploadPfxCertificateFile);

  if (signCertFiles.length === 0 && pfxCertificateFiles.length === 0) {
    warnings.push("선택한 파일에서 signCert.der 또는 p12/pfx 인증서 파일을 찾지 못했습니다. NPKI 인증서 폴더나 p12/pfx 파일이 있는 폴더를 선택하세요.");
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
      if (!policyOid) {
        rejectedFiles.push({
          name: file.name,
          relativePath: file.relativePath,
          reason: "인증서 정책 OID를 확인하지 못했습니다."
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

  for (const file of pfxCertificateFiles) {
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

      const certificate = resolveUploadedPfxCertificateMetadata(file, raw, sessionId);
      if (!certificate) {
        rejectedFiles.push({
          name: file.name,
          relativePath: file.relativePath,
          reason: "인증서 공개 정보를 읽지 못했습니다."
        });
        continue;
      }
      certificates.push(certificate);
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

function pruneCertificateUploadSessions(now = Date.now()): void {
  for (const [sessionId, session] of certificateUploadSessions.entries()) {
    if (now - session.createdAt > UPLOAD_SESSION_TTL_MS) {
      certificateUploadSessions.delete(sessionId);
    }
  }
}

function storeCertificateUploadSession(
  result: CertificateUploadSessionResult,
  files: CertificateUploadSessionFile[]
): void {
  pruneCertificateUploadSessions();
  certificateUploadSessions.set(result.sessionId, {
    createdAt: Date.now(),
    files: files.map((file) => ({
      ...file,
      relativePath: normalizeUploadRelativePath(file.relativePath || file.name) || file.name
    })),
    certificates: result.certificates
  });
}

function normalizeCertificateFingerprint(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function normalizeSerialFingerprint(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/[^0-9a-f]/gi, "")
    .trim()
    .toLowerCase();
}

function buildSerialFingerprints(value: string | number | null | undefined): Set<string> {
  const normalized = normalizeSerialFingerprint(value);
  const fingerprints = new Set<string>();
  if (!normalized) {
    return fingerprints;
  }

  fingerprints.add(normalized.replace(/^0+/, "") || "0");
  if (/^[0-9]+$/.test(normalized)) {
    try {
      fingerprints.add(BigInt(normalized).toString(10));
    } catch {
      // Keep the raw fingerprint above.
    }
  }
  if (/^[0-9a-f]+$/i.test(normalized)) {
    try {
      const asHex = BigInt(`0x${normalized}`);
      fingerprints.add(asHex.toString(10));
      fingerprints.add(asHex.toString(16));
    } catch {
      // Keep the raw fingerprint above.
    }
  }
  return fingerprints;
}

function fingerprintSetsIntersect(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function buildCertificateIdentityFingerprints(certificate: {
  cn?: string | null;
  userDN?: string | null;
}): Set<string> {
  const fingerprints = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = normalizeCertificateFingerprint(value);
    if (normalized) {
      fingerprints.add(normalized);
    }
  };

  add(certificate.cn);
  add(certificate.userDN);
  add(extractDnAttributeValue(certificate.userDN ?? "", "CN"));
  add(extractDnAttributeValue(certificate.userDN ?? "", "cn"));
  return fingerprints;
}

function normalizeCertificateDateFingerprint(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (!match) {
    return normalizeCertificateFingerprint(raw);
  }

  return [
    match[1],
    match[2]?.padStart(2, "0"),
    match[3]?.padStart(2, "0")
  ].join("");
}

function normalizeIssuerFingerprint(value: string | null | undefined): string {
  const normalized = normalizeCertificateFingerprint(value);
  return normalized === normalizeCertificateFingerprint("알 수 없음") ? "" : normalized;
}

export function uploadedCertificateMatchesBridge(
  uploadedCertificate: UploadedCertificateMetadata,
  bridgeCertificate: RenewalBridgeCertificateSummary
): boolean {
  const uploadedSerials = buildSerialFingerprints(uploadedCertificate.serial);
  const bridgeSerials = buildSerialFingerprints(bridgeCertificate.serial);
  if (
    uploadedSerials.size > 0 &&
    bridgeSerials.size > 0 &&
    fingerprintSetsIntersect(uploadedSerials, bridgeSerials)
  ) {
    return true;
  }

  const uploadedIdentities = buildCertificateIdentityFingerprints(uploadedCertificate);
  const bridgeIdentities = buildCertificateIdentityFingerprints(bridgeCertificate);
  const identityMatches =
    uploadedIdentities.size > 0 &&
    bridgeIdentities.size > 0 &&
    fingerprintSetsIntersect(uploadedIdentities, bridgeIdentities);

  const uploadedIssuer = normalizeIssuerFingerprint(uploadedCertificate.issuerToName);
  const bridgeIssuer = normalizeIssuerFingerprint(bridgeCertificate.issuerToName);
  const uploadedExpire = normalizeCertificateDateFingerprint(
    uploadedCertificate.todate ?? uploadedCertificate.detailValidateTo
  );
  const bridgeExpire = normalizeCertificateDateFingerprint(bridgeCertificate.todate ?? bridgeCertificate.detailValidateTo);
  return Boolean(
    identityMatches &&
      (!uploadedIssuer || !bridgeIssuer || uploadedIssuer === bridgeIssuer) &&
      (!uploadedExpire || !bridgeExpire || uploadedExpire === bridgeExpire)
  );
}

function findStoredUploadFile(
  session: StoredCertificateUploadSession,
  relativePath: string
): CertificateUploadSessionFile | null {
  const normalizedPath = normalizeUploadRelativePath(relativePath);
  return (
    session.files.find((file) => normalizeUploadRelativePath(file.relativePath || file.name) === normalizedPath) ??
    session.files.find((file) => normalizeUploadRelativePath(file.name) === normalizeUploadRelativePath(path.basename(relativePath))) ??
    null
  );
}

function findStoredUploadCertificate(
  request: CertificateUploadSessionImportRequest
): {
  session: StoredCertificateUploadSession;
  certificate: UploadedCertificateMetadata;
} | null {
  pruneCertificateUploadSessions();
  const session = certificateUploadSessions.get(request.uploadSessionId);
  if (!session) {
    return null;
  }

  const requestedRelativePath = request.relativePath
    ? normalizeUploadRelativePath(request.relativePath)
    : "";
  const certificate =
    session.certificates.find(
      (candidate) =>
        candidate.index === request.certificateIndex &&
        (!requestedRelativePath || normalizeUploadRelativePath(candidate.relativePath) === requestedRelativePath)
    ) ??
    session.certificates.find((candidate) => candidate.index === request.certificateIndex) ??
    session.certificates.find(
      (candidate) => requestedRelativePath && normalizeUploadRelativePath(candidate.relativePath) === requestedRelativePath
    );

  return certificate ? { session, certificate } : null;
}

function isUploadedPfxCertificate(certificate: UploadedCertificateMetadata): boolean {
  return /\.(p12|pfx)$/i.test(certificate.relativePath) || /\.(p12|pfx)$/i.test(certificate.fileName);
}

function safeWindowsPathPart(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "AUTO-TAX";
}

function resolveStandardNpkiRoot(): string {
  const candidates = [
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "LocalLow", "NPKI") : null,
    process.env.LOCALAPPDATA ? path.resolve(process.env.LOCALAPPDATA, "..", "LocalLow", "NPKI") : null,
    os.homedir() ? path.join(os.homedir(), "AppData", "LocalLow", "NPKI") : null
  ].filter((value): value is string => Boolean(value));

  return path.resolve(candidates[0] ?? path.join(os.tmpdir(), "NPKI"));
}

function assertPathInsideRoot(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("인증서 저장 경로가 표준 NPKI 저장소 밖으로 벗어났습니다.");
  }
}

function extractNpkiPathIdentity(relativePath: string): {
  issuerCode: string | null;
  userDirectoryName: string | null;
} {
  const parts = normalizeUploadRelativePath(relativePath).split("/").filter(Boolean);
  const npkiIndex = parts.findIndex((part) => part.toUpperCase() === "NPKI");
  if (npkiIndex >= 0) {
    const issuerCode = parts[npkiIndex + 1] ?? null;
    const userMarker = parts[npkiIndex + 2] ?? null;
    const userDirectoryName = /^USER$/i.test(userMarker ?? "") ? parts[npkiIndex + 3] ?? null : null;
    return {
      issuerCode: issuerCode ? safeWindowsPathPart(issuerCode) : null,
      userDirectoryName: userDirectoryName ? safeWindowsPathPart(userDirectoryName) : null
    };
  }

  return {
    issuerCode: null,
    userDirectoryName: null
  };
}

function resolveNPKIIssuerCode(certificate: UploadedCertificateMetadata): string | null {
  const fromPath = extractNpkiPathIdentity(certificate.relativePath).issuerCode;
  if (fromPath) {
    return fromPath;
  }

  const haystack = [
    certificate.issuerToName,
    certificate.userDN,
    certificate.relativePath,
    certificate.fileName
  ].join(" ");
  if (/KICA|한국정보인증/i.test(haystack)) {
    return "KICA";
  }
  if (/SignKorea|코스콤/i.test(haystack)) {
    return "SignKorea";
  }
  if (/CrossCert|한국전자인증/i.test(haystack)) {
    return "CrossCert";
  }
  if (/yessign|금융결제원|KFTC/i.test(haystack)) {
    return "yessign";
  }
  if (/TradeSign|한국무역정보통신|KTNET/i.test(haystack)) {
    return "TradeSign";
  }
  if (/NCASign|NCA|한국전산원/i.test(haystack)) {
    return "NCASign";
  }
  if (/INIPASS|이니텍/i.test(haystack)) {
    return "INIPASS";
  }
  return null;
}

function resolveNPKIUserDirectoryName(certificate: UploadedCertificateMetadata): string {
  return (
    extractNpkiPathIdentity(certificate.relativePath).userDirectoryName ??
    safeWindowsPathPart(certificate.userDN ?? certificate.cn ?? certificate.index)
  );
}

function findSiblingUploadPrivateKey(
  session: StoredCertificateUploadSession,
  certificate: UploadedCertificateMetadata
): CertificateUploadSessionFile | null {
  const certificateDirectory = path.posix.dirname(normalizeUploadRelativePath(certificate.relativePath));
  return (
    session.files.find((file) => {
      const relativePath = normalizeUploadRelativePath(file.relativePath || file.name);
      return path.posix.dirname(relativePath) === certificateDirectory && /(^|\/)signPri\.key$/i.test(relativePath);
    }) ?? null
  );
}

function writeStoredNPKICertificateToStandardStore(
  session: StoredCertificateUploadSession,
  certificate: UploadedCertificateMetadata
): { ok: true } | { ok: false; reason: string } {
  const signCertFile = findStoredUploadFile(session, certificate.relativePath);
  const signPriFile = findSiblingUploadPrivateKey(session, certificate);
  if (!signCertFile || !signPriFile) {
    return {
      ok: false,
      reason: "signCert.der와 signPri.key가 같은 인증서 폴더 안에 있어야 합니다."
    };
  }

  const issuerCode = resolveNPKIIssuerCode(certificate);
  if (!issuerCode) {
    return {
      ok: false,
      reason: "발급기관을 표준 NPKI 저장소 코드로 확인하지 못했습니다."
    };
  }

  try {
    const root = resolveStandardNpkiRoot();
    const certBuffer = decodeUploadBase64(signCertFile.base64);
    const keyBuffer = decodeUploadBase64(signPriFile.base64);
    const userDirectoryName = resolveNPKIUserDirectoryName(certificate);
    const suffix = buildUploadCertificateIndex(
      `${certificate.serial ?? ""}|${certificate.userDN ?? ""}|${certificate.relativePath}`
    ).replace(/^upload-/, "");
    const baseDirectory = path.join(root, issuerCode, "USER", userDirectoryName);
    assertPathInsideRoot(root, baseDirectory);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const targetDirectory = attempt === 0 ? baseDirectory : `${baseDirectory}__auto-tax-${suffix}-${attempt}`;
      const signCertTarget = path.join(targetDirectory, "signCert.der");
      const signPriTarget = path.join(targetDirectory, "signPri.key");
      assertPathInsideRoot(root, signCertTarget);
      assertPathInsideRoot(root, signPriTarget);

      const existingSignCert = fs.existsSync(signCertTarget) ? fs.readFileSync(signCertTarget) : null;
      const existingSignPri = fs.existsSync(signPriTarget) ? fs.readFileSync(signPriTarget) : null;
      const sameExistingPair =
        existingSignCert?.equals(certBuffer) === true && existingSignPri?.equals(keyBuffer) === true;
      if (sameExistingPair) {
        return { ok: true };
      }
      if (existingSignCert || existingSignPri) {
        continue;
      }

      fs.mkdirSync(targetDirectory, { recursive: true });
      fs.writeFileSync(signCertTarget, certBuffer);
      fs.writeFileSync(signPriTarget, keyBuffer);
      return { ok: true };
    }

    return {
      ok: false,
      reason: "표준 NPKI 저장소 안에 같은 이름의 인증서 폴더가 이미 있어 복사하지 못했습니다."
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "표준 NPKI 저장소에 인증서를 복사하지 못했습니다."
    };
  }
}

async function importStoredPfxCertificateToBridgeStore(
  session: StoredCertificateUploadSession,
  certificate: UploadedCertificateMetadata,
  certificatePassword: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const storedFile = findStoredUploadFile(session, certificate.relativePath);
  if (!storedFile) {
    return {
      ok: false,
      reason: "업로드 세션에서 p12/pfx 원본 파일을 찾지 못했습니다."
    };
  }

  const extension = path.extname(storedFile.name || certificate.fileName).toLowerCase() || ".pfx";
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "auto-tax-p12-import-"));
  const tempFileName = `${randomUUID()}${extension}`;
  const tempFilePath = path.join(tempDirectory, tempFileName);
  try {
    fs.writeFileSync(tempFilePath, decodeUploadBase64(storedFile.base64));
    const passwordValidation = validatePfxPasswordWithWindowsCertificateApi(
      tempFilePath,
      certificatePassword
    );
    if (!passwordValidation.ok) {
      return {
        ok: false,
        reason: passwordValidation.reason
      };
    }

    const result = await importP12ToSignGateHddStore({
      filePath: tempDirectory,
      fileName: tempFileName,
      certificatePassword
    });
    if (!result.ok) {
      if (isGenericSignGatePfxImportFailure(result.error)) {
        return {
          ok: false,
          reason:
            "p12/pfx 비밀번호 확인은 통과했지만 SignGate가 인증서를 브리지 저장소로 가져오지 못했습니다. NPKI 원본 폴더(signCert.der/signPri.key)를 선택하거나, Windows/SignGate 인증서 관리에서 먼저 가져온 뒤 공동인증서 읽기를 다시 실행해 주세요."
        };
      }
      return {
        ok: false,
        reason: result.error ?? "p12/pfx 인증서를 SignGate 브리지 저장소로 가져오지 못했습니다."
      };
    }
    return { ok: true };
  } finally {
    fs.rmSync(tempDirectory, { force: true, recursive: true });
  }
}

async function importCertificateUploadSessionCertificates(
  requests: CertificateUploadSessionImportRequest[]
): Promise<CertificateUploadSessionImportResult> {
  const importedUploads: UploadedCertificateMetadata[] = [];
  const rejectedImports: CertificateUploadSessionImportResult["rejectedImports"] = [];
  const warnings: string[] = [];

  for (const request of requests) {
    const stored = findStoredUploadCertificate(request);
    if (!stored) {
      rejectedImports.push({
        uploadSessionId: request.uploadSessionId,
        certificateIndex: request.certificateIndex,
        relativePath: request.relativePath ?? null,
        reason: "업로드 세션이 만료되었거나 인증서 원본을 찾지 못했습니다. 파일/폴더를 다시 선택해 주세요."
      });
      continue;
    }

    const result = isUploadedPfxCertificate(stored.certificate)
      ? await importStoredPfxCertificateToBridgeStore(stored.session, stored.certificate, request.certificatePassword)
      : writeStoredNPKICertificateToStandardStore(stored.session, stored.certificate);
    if (!result.ok) {
      rejectedImports.push({
        uploadSessionId: request.uploadSessionId,
        certificateIndex: request.certificateIndex,
        relativePath: stored.certificate.relativePath,
        reason: result.reason
      });
      continue;
    }

    importedUploads.push(stored.certificate);
  }

  if (importedUploads.length === 0) {
    return {
      importedCertificates: [],
      rejectedImports,
      warnings
    };
  }

  const bridgeList = await collectBridgeCertificateList({ preferCached: false });
  const bridgeCertificates = bridgeList.storageProbe.certificates;
  const importedCertificates: RenewalBridgeCertificateSummary[] = [];
  for (const uploadedCertificate of importedUploads) {
    const matchedCertificate = bridgeCertificates.find(
      (bridgeCertificate) =>
        !importedCertificates.some((importedCertificate) => importedCertificate.index === bridgeCertificate.index) &&
        uploadedCertificateMatchesBridge(uploadedCertificate, bridgeCertificate)
    );
    if (matchedCertificate) {
      importedCertificates.push(matchedCertificate);
    } else {
      warnings.push(`${uploadedCertificate.cn || uploadedCertificate.fileName}: 브리지 저장소로 가져온 뒤 목록에서 다시 찾지 못했습니다.`);
    }
  }

  return {
    importedCertificates,
    rejectedImports,
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
    if (!shouldRetryPreflightResult(result)) {
      return result;
    }

    console.info(
      `[renewal-preflight-helper-retry] certificateIndex=${payload.certificateIndex} attempt=${attempt + 1}/${retryCount} reason=${sanitizeSensitiveText(result.bridge.preflightProbe.error ?? result.bridge.preflightProbe.message ?? "unknown")}`
    );
    await delay(PREFLIGHT_TRANSPORT_RETRY_DELAY_MS);
    result = await collectPreflightProbeResult(payload);
  }

  return result;
}

function buildBusinessInfoLookupFailure(
  payload: LocalHomeTaxBusinessInfoPayload,
  message: string,
): HomeTaxBusinessInfoLookupResult {
  return {
    ok: false,
    source: "hometax",
    status: "lookup-failed",
    stage: "business-info",
    certificateIndex: String(payload.certificateIndex ?? ""),
    certificateCn: payload.certificateCn ?? null,
    sourcePort: null,
    loginCode: null,
    businessInfoSnapshot: null,
    message: null,
    error: message,
  };
}

function hasBusinessInfoSnapshotAddress(snapshot: CertificateBusinessInfoLookupResult["businessInfoSnapshot"]): boolean {
  return Boolean(snapshot?.baseAddress?.trim() || snapshot?.detailAddress?.trim());
}

function resolveBusinessInfoSuccessStatus(
  snapshot: CertificateBusinessInfoLookupResult["businessInfoSnapshot"],
): CertificateBusinessInfoLookupStatus {
  return hasBusinessInfoSnapshotAddress(snapshot) ? "complete" : "missing-address";
}

function normalizeBusinessInfoFailureDetail(value: string | null | undefined): string {
  return sanitizeSensitiveText(String(value ?? "").replace(/\s+/g, " ").trim());
}

function isCertificatePasswordFailureDetail(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    detail.includes("비밀번호") ||
    detail.includes("암호") ||
    normalized.includes("password") ||
    normalized.includes("passwd") ||
    normalized.includes("pwd") ||
    normalized.includes("375848960")
  );
}

function isCertificateSelectionMissingDetail(detail: string): boolean {
  return (
    detail.includes("선택하신 인증서가 없습니다") ||
    detail.includes("인증서를 선택해 주십시오") ||
    detail.includes("브리지 인증서 번호가 없습니다") ||
    detail.includes("certificate index")
  );
}

function isCertificateExpiredFailureDetail(detail: string): boolean {
  return detail.includes("만료") || /expired/i.test(detail);
}

function isSignGateUnsupportedBusinessInfoDetail(detail: string): boolean {
  return (
    /갱신\s*가능한\s*(공동)?인증서가\s*아닙니다/.test(detail) ||
    detail.includes("발급정보를 찾을수 없습니다") ||
    detail.includes("발급정보를 찾을 수 없습니다") ||
    /not\s*renewable|unsupported/i.test(detail)
  );
}

function isSignGateBridgeMediaUnsupportedDetail(detail: string): boolean {
  return (
    detail.includes("미디어(장치) 정보가 없습니다") ||
    detail.includes("미디어 정보가 없습니다") ||
    detail.includes("장치 정보가 없습니다") ||
    detail.includes("356712448") ||
    /NOTSUPPORTMEDIA/i.test(detail)
  );
}

export function isSignGateBusinessInfoFallbackDetail(detail: string): boolean {
  return (
    isSignGateUnsupportedBusinessInfoDetail(detail) ||
    isSignGateBridgeMediaUnsupportedDetail(detail)
  );
}

function isLikelyYessignCertificatePayload(payload: LocalHomeTaxBusinessInfoPayload): boolean {
  const haystack = [
    payload.issuerToName,
    payload.userDN,
    payload.oid,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  return (
    haystack.includes("yessign") ||
    haystack.includes("kftc") ||
    haystack.includes("금융결제원") ||
    haystack.includes("1.2.410.200005")
  );
}

function classifySignGateBusinessInfoFailureStatus(detail: string): CertificateBusinessInfoLookupStatus {
  if (isCertificatePasswordFailureDetail(detail)) {
    return "password-error";
  }

  if (isCertificateSelectionMissingDetail(detail)) {
    return "certificate-not-found";
  }

  if (isSignGateBusinessInfoFallbackDetail(detail)) {
    return "unsupported";
  }

  return "lookup-failed";
}

function buildSignGateBusinessInfoFailureResult(
  payload: LocalHomeTaxBusinessInfoPayload,
  detail: string,
  options?: {
    status?: CertificateBusinessInfoLookupStatus;
    sourcePort?: number | null;
  },
): CertificateBusinessInfoLookupResult {
  return {
    ok: false,
    source: "signgate",
    status: options?.status ?? classifySignGateBusinessInfoFailureStatus(detail),
    stage: "signgate-preflight",
    certificateIndex: String(payload.certificateIndex ?? ""),
    certificateCn: payload.certificateCn ?? null,
    sourcePort: options?.sourcePort ?? null,
    loginCode: null,
    businessInfoSnapshot: null,
    message: null,
    error: normalizeBusinessInfoFailureDetail(detail) || "사업자정보를 읽지 못했습니다.",
  };
}

async function collectSignGateBusinessInfoLookupResult(
  payload: LocalHomeTaxBusinessInfoPayload,
): Promise<CertificateBusinessInfoLookupResult> {
  const certificateIndex = Number(payload.certificateIndex);
  const hasBridgeCertificateIndex = Number.isInteger(certificateIndex) && certificateIndex > 0;

  if (!hasBridgeCertificateIndex) {
    return buildSignGateBusinessInfoFailureResult(
      payload,
      "사업자정보 조회에 사용할 브리지 인증서 번호가 없습니다.",
      { status: "certificate-not-found" },
    );
  }

  const result = await collectPreflightProbeResultWithRetry({
    certificateIndex,
    certificateCn: payload.certificateCn ?? null,
    certificatePassword: payload.certificatePassword ?? null,
  });
  const probe = result.bridge.preflightProbe;
  const snapshot = probe.renewInfoSnapshot ?? null;
  if (snapshot?.businessNumber) {
    return {
      ok: true,
      source: "signgate",
      status: resolveBusinessInfoSuccessStatus(snapshot),
      stage: "signgate-preflight",
      certificateIndex: probe.certificateIndex ?? String(payload.certificateIndex ?? ""),
      certificateCn: probe.certificateCn ?? payload.certificateCn ?? null,
      sourcePort: probe.sourcePort ?? null,
      loginCode: probe.rawCode ?? null,
      businessInfoSnapshot: snapshot,
      message: "SignGate 사업자정보 조회에서 사업자정보를 확인했습니다.",
      error: null,
    };
  }

  const detail =
    probe.error ??
    probe.message ??
    (probe.ok ? "사업자정보 응답에서 사업자번호를 찾지 못했습니다." : "사업자정보를 읽지 못했습니다.");
  return buildSignGateBusinessInfoFailureResult(payload, detail, {
    sourcePort: probe.sourcePort ?? null,
  });
}

function shouldTryHomeTaxAfterSignGateFailure(
  payload: LocalHomeTaxBusinessInfoPayload,
  signGateResult: CertificateBusinessInfoLookupResult,
): boolean {
  if (signGateResult.ok) {
    return false;
  }

  const detail = normalizeBusinessInfoFailureDetail(signGateResult.error ?? signGateResult.message ?? "");
  if (
    signGateResult.status === "password-error" ||
    signGateResult.status === "certificate-not-found" ||
    isCertificatePasswordFailureDetail(detail) ||
    isCertificateSelectionMissingDetail(detail) ||
    isCertificateExpiredFailureDetail(detail)
  ) {
    return false;
  }

  return (
    signGateResult.status === "unsupported" ||
    isSignGateBridgeMediaUnsupportedDetail(detail) ||
    isLikelyYessignCertificatePayload(payload)
  );
}

function buildCombinedBusinessInfoFailureResult(
  signGateResult: CertificateBusinessInfoLookupResult,
  homeTaxResult: HomeTaxBusinessInfoLookupResult,
): CertificateBusinessInfoLookupResult {
  const homeTaxDetail = normalizeBusinessInfoFailureDetail(homeTaxResult.error ?? homeTaxResult.message ?? "");
  const signGateDetail = normalizeBusinessInfoFailureDetail(signGateResult.error ?? signGateResult.message ?? "");
  let fallbackDetail = homeTaxDetail;
  if (homeTaxResult.status === "hometax-not-registered") {
    fallbackDetail =
      "홈택스에 등록되지 않은 인증서라 보조 조회도 실패했습니다. SignGate 조회가 안 되는 인증서는 홈택스에 인증서를 등록한 뒤 다시 시도하거나 수동으로 보완하세요.";
  } else if (homeTaxResult.status === "password-error") {
    fallbackDetail =
      "인증서 비밀번호가 맞지 않아 홈택스 보조 조회도 실패했습니다. 공통 비밀번호 또는 개별 비밀번호를 확인하세요.";
  } else if (homeTaxResult.status === "certificate-not-found") {
    fallbackDetail =
      "홈택스 보조 조회에서 선택한 인증서를 찾지 못했습니다. 공동인증서 읽기 또는 파일/폴더 추가를 다시 실행하세요.";
  }

  return {
    ...homeTaxResult,
    source: "hometax",
    status: homeTaxResult.status ?? "lookup-failed",
    error: [fallbackDetail, signGateDetail ? `SignGate: ${signGateDetail}` : ""]
      .filter(Boolean)
      .join(" / ") || "사업자정보를 읽지 못했습니다.",
  };
}

async function collectHomeTaxBusinessInfoLookupResult(
  payload: LocalHomeTaxBusinessInfoPayload
) {
  const certificateIndex = Number(payload.certificateIndex);
  const hasBridgeCertificateIndex = Number.isInteger(certificateIndex) && certificateIndex > 0;

  if (!hasBridgeCertificateIndex) {
    return buildBusinessInfoLookupFailure(payload, "홈택스 사업자정보 조회에 사용할 브리지 인증서 번호가 없습니다.");
  }

  return await collectHomeTaxBusinessInfoLookup({
    certificateIndex,
    certificateCn: payload.certificateCn ?? null,
    certificatePassword: payload.certificatePassword ?? null,
    serial: payload.serial ?? null,
    userDN: payload.userDN ?? null
  });
}

async function collectCertificateBusinessInfoLookupResult(
  payload: LocalHomeTaxBusinessInfoPayload,
): Promise<CertificateBusinessInfoLookupResult> {
  const signGateResult = await collectSignGateBusinessInfoLookupResult(payload);
  if (signGateResult.ok || !shouldTryHomeTaxAfterSignGateFailure(payload, signGateResult)) {
    return signGateResult;
  }

  const homeTaxResult = await collectHomeTaxBusinessInfoLookupResult(payload);
  if (homeTaxResult.ok) {
    return homeTaxResult;
  }

  return buildCombinedBusinessInfoFailureResult(signGateResult, homeTaxResult);
}

export async function collectCertificateBusinessInfoLookupBatchResults(
  payloads: LocalHomeTaxBusinessInfoPayload[],
  options?: {
    signGateConcurrency?: number;
    homeTaxConcurrency?: number;
    lookupSignGate?: (payload: LocalHomeTaxBusinessInfoPayload) => Promise<CertificateBusinessInfoLookupResult>;
    lookupHomeTax?: (payload: LocalHomeTaxBusinessInfoPayload) => Promise<HomeTaxBusinessInfoLookupResult>;
  },
): Promise<CertificateBusinessInfoLookupResult[]> {
  if (payloads.length === 0) {
    return [];
  }

  const lookupSignGate = options?.lookupSignGate ?? collectSignGateBusinessInfoLookupResult;
  const lookupHomeTax = options?.lookupHomeTax ?? collectHomeTaxBusinessInfoLookupResult;
  const signGateResults = await mapWithConcurrency(
    payloads,
    options?.signGateConcurrency ?? CERTIFICATE_BUSINESS_INFO_SIGNGATE_BATCH_DEFAULT_CONCURRENCY,
    async (payload) => await lookupSignGate(payload)
  );
  const results = [...signGateResults];
  const fallbackRequests = signGateResults
    .map((signGateResult, index) => ({
      index,
      payload: payloads[index] as LocalHomeTaxBusinessInfoPayload,
      signGateResult
    }))
    .filter(({ payload, signGateResult }) =>
      shouldTryHomeTaxAfterSignGateFailure(payload, signGateResult)
    );

  if (fallbackRequests.length === 0) {
    return results;
  }

  const fallbackResults = await mapWithConcurrency(
    fallbackRequests,
    options?.homeTaxConcurrency ?? HOMETAX_BUSINESS_INFO_BATCH_DEFAULT_CONCURRENCY,
    async ({ payload }) => await lookupHomeTax(payload)
  );

  fallbackResults.forEach((homeTaxResult, fallbackIndex) => {
    const fallbackRequest = fallbackRequests[fallbackIndex];
    if (!fallbackRequest) {
      return;
    }
    results[fallbackRequest.index] = homeTaxResult.ok
      ? homeTaxResult
      : buildCombinedBusinessInfoFailureResult(
          fallbackRequest.signGateResult,
          homeTaxResult
        );
  });

  return results;
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
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
      warmHomeTaxBusinessInfoBrowser();
      res.json({
        ok: true,
        version,
        status: {
          processDetected: probe.process.detected,
          bridgeSummary: probe.bridge.summary,
          bridgeTransportSummary: probe.bridge.transportSummary ?? probe.bridge.summary,
          bridgeFunctionalSummary: probe.bridge.functionalSummary ?? probe.bridge.summary,
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
      const [result, certificateList] = await Promise.all([
        collectBridgeProbeResult({ includeDetailedProbe: false }),
        collectBridgeCertificateList({ preferCached: false }),
      ]);
      warmHomeTaxBusinessInfoBrowser();
      result.bridge.licenseProbe = certificateList.licenseProbe;
      result.bridge.storageProbe = certificateList.storageProbe;
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/certificates", async (_req, res, next) => {
    try {
      invalidateHomeTaxMagicLineRawCandidateCache();
      const result = await collectBridgeCertificateList({ preferCached: false });
      invalidateHomeTaxMagicLineRawCandidateCache();
      warmHomeTaxBusinessInfoBrowser();
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/certificates/upload-session", async (req, res, next) => {
    try {
      const payload = certificateUploadSessionSchema.parse(req.body ?? {});
      const result = createCertificateUploadSessionMetadata(payload.files);
      storeCertificateUploadSession(result, payload.files);
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/certificates/import-upload-session", async (req, res, next) => {
    try {
      const payload = certificateUploadSessionImportSchema.parse(req.body ?? {});
      invalidateHomeTaxMagicLineRawCandidateCache();
      const result = await importCertificateUploadSessionCertificates(payload.requests);
      invalidateHomeTaxMagicLineRawCandidateCache();
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/certificates/business-info", async (req, res, next) => {
    try {
      const payload = hometaxBusinessInfoRequestSchema.parse(req.body ?? {});
      const result = await collectCertificateBusinessInfoLookupResult(payload);
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/certificates/business-info-batch", async (req, res, next) => {
    try {
      const payload = certificateBusinessInfoBatchRequestSchema.parse(req.body ?? {});
      const signGateConcurrency =
        payload.signGateConcurrency ??
        payload.concurrency ??
        CERTIFICATE_BUSINESS_INFO_SIGNGATE_BATCH_DEFAULT_CONCURRENCY;
      const homeTaxConcurrency =
        payload.homeTaxConcurrency ?? HOMETAX_BUSINESS_INFO_BATCH_DEFAULT_CONCURRENCY;
      const results = await collectCertificateBusinessInfoLookupBatchResults(
        payload.requests,
        {
          signGateConcurrency,
          homeTaxConcurrency
        }
      );
      res.json({ ok: true, version, results });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/hometax/business-info", async (req, res, next) => {
    try {
      const payload = hometaxBusinessInfoRequestSchema.parse(req.body ?? {});
      const result = await collectHomeTaxBusinessInfoLookupResult(payload);
      res.json({ ok: true, version, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/hometax/business-info-batch", async (req, res, next) => {
    try {
      const payload = hometaxBusinessInfoBatchRequestSchema.parse(req.body ?? {});
      const concurrency =
        payload.concurrency ?? HOMETAX_BUSINESS_INFO_BATCH_DEFAULT_CONCURRENCY;
      const results = await mapWithConcurrency(
        payload.requests,
        concurrency,
        async (request) => await collectHomeTaxBusinessInfoLookupResult(request)
      );
      res.json({ ok: true, version, results });
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

  app.post("/api/preflight-batch", async (req, res, next) => {
    try {
      const payload = preflightBatchRequestSchema.parse(req.body ?? {});
      const concurrency = payload.concurrency ?? PREFLIGHT_BATCH_DEFAULT_CONCURRENCY;
      const results = await mapWithConcurrency(
        payload.requests,
        concurrency,
        async (request) => await collectPreflightProbeResultWithRetry(request)
      );
      res.json({ ok: true, version, results });
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
      if (error instanceof PopbillCertificateRegistrationError) {
        res.json({
          ok: false,
          version,
          error: sanitizeSensitiveText(error.message),
          stage: error.stage,
          timing: error.timing
        });
        return;
      }
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
