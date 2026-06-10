import { createHash, randomInt, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http-errors.js";
import { nowIso } from "./utils.js";

type Row = Record<string, unknown>;
type AdminClient = Pick<SupabaseClient, "from">;

type EmailSendInput = {
  to: string;
  subject: string;
  text: string;
};

type EmailSendResult = {
  provider: "dev" | "smtp";
  providerMessageId?: string;
  devCode?: string;
};

type SignupEmailProvider = {
  readonly provider: "dev" | "smtp";
  send(input: EmailSendInput): Promise<EmailSendResult>;
};

const SIGNUP_EMAIL_VERIFICATION_TTL_MS = 5 * 60 * 1000;
const SIGNUP_EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSignupEmail(value: string): string {
  return value.trim().toLowerCase();
}

function hashVerificationCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function createVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function getExpiresAt(): string {
  return new Date(Date.now() + SIGNUP_EMAIL_VERIFICATION_TTL_MS).toISOString();
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function envString(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = envString(key);
  if (value === undefined) {
    return fallback;
  }
  return value !== "0" && value.toLowerCase() !== "false";
}

function envNumber(key: string, fallback: number): number {
  const parsed = Number(envString(key));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function canExposeDevCode(): boolean {
  return !isProductionRuntime();
}

function describeEmailTransportError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.message];
    const extra = error as Error & {
      code?: unknown;
      command?: unknown;
      responseCode?: unknown;
      response?: unknown;
    };

    if (extra.code !== undefined) {
      parts.push(`code=${String(extra.code)}`);
    }
    if (extra.command !== undefined) {
      parts.push(`command=${String(extra.command)}`);
    }
    if (extra.responseCode !== undefined) {
      parts.push(`responseCode=${String(extra.responseCode)}`);
    }
    if (typeof extra.response === "string" && extra.response.trim()) {
      parts.push(`response=${extra.response.trim()}`);
    }

    return parts.join(" | ");
  }

  return String(error);
}

function createSignupEmailProvider(): SignupEmailProvider {
  const supportEmail = envString("AUTO_TAX_SUPPORT_TO_EMAIL");
  const supportAppPassword = envString("AUTO_TAX_SUPPORT_APP_PASSWORD");
  const canUseSupportGmail = Boolean(supportEmail && supportAppPassword);
  const smtpHost = envString("AUTO_TAX_SIGNUP_SMTP_HOST") ?? (canUseSupportGmail ? "smtp.gmail.com" : undefined);
  if (process.env.AUTO_TAX_SIGNUP_EMAIL_PROVIDER === "smtp" || smtpHost) {
    if (!smtpHost) {
      throw new Error("회원가입 메일 인증 SMTP 호스트가 없습니다. AUTO_TAX_SIGNUP_SMTP_HOST를 확인하세요.");
    }

    const smtpPort = envNumber("AUTO_TAX_SIGNUP_SMTP_PORT", 465);
    const smtpSecure = envBool("AUTO_TAX_SIGNUP_SMTP_SECURE", smtpPort === 465);
    const smtpUser = envString("AUTO_TAX_SIGNUP_SMTP_USER") ?? supportEmail;
    const smtpPass = envString("AUTO_TAX_SIGNUP_SMTP_PASS") ?? supportAppPassword;
    const fromEmail = envString("AUTO_TAX_SIGNUP_EMAIL_FROM") ?? smtpUser;
    const fromName = envString("AUTO_TAX_SIGNUP_EMAIL_FROM_NAME") ?? "AUTO-TAX";
    const allowWeakDh = envBool("AUTO_TAX_SIGNUP_SMTP_ALLOW_WEAK_DH", smtpHost === "smtp.whoisworks.com");

    if (!fromEmail) {
      throw new Error("회원가입 메일 인증 발신 주소가 없습니다. AUTO_TAX_SIGNUP_EMAIL_FROM를 확인하세요.");
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass ?? "" } : undefined,
      tls: allowWeakDh ? { ciphers: "DEFAULT@SECLEVEL=0" } : undefined
    });

    return {
      provider: "smtp",
      async send(input) {
        const result = await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: input.to,
          subject: input.subject,
          text: input.text
        });
        return {
          provider: "smtp",
          providerMessageId: result.messageId
        };
      }
    };
  }

  if (isProductionRuntime()) {
    throw new Error("운영 환경에서는 개발용 메일 인증 provider를 사용할 수 없습니다. 회원가입 SMTP 설정을 확인하세요.");
  }

  return {
    provider: "dev",
    async send(input) {
      const codeMatch = input.text.match(/\b(\d{6})\b/);
      console.info(`[dev-email] ${input.to}: ${input.subject} / ${input.text}`);
      return {
        provider: "dev",
        devCode: codeMatch?.[1]
      };
    }
  };
}

async function getVerificationRow(adminClient: AdminClient, verificationId: string): Promise<Row | null> {
  const { data, error } = await adminClient
    .from("public_signup_email_verifications")
    .select("*")
    .eq("id", verificationId)
    .maybeSingle();

  if (error) {
    throw new Error(`한전 메일 수신 주소 인증 조회에 실패했습니다: ${error.message}`);
  }

  return data ? data as Row : null;
}

export async function createSignupEmailVerification(
  adminClient: AdminClient,
  input: {
    email: string;
    requestIp: string;
    requestUserAgent: string;
  }
): Promise<{ verificationId: string; expiresAt: string; devCode?: string }> {
  const email = normalizeSignupEmail(input.email);
  const code = createVerificationCode();
  const salt = randomUUID();
  const expiresAt = getExpiresAt();
  const emailProvider = createSignupEmailProvider();

  const { data, error } = await adminClient
    .from("public_signup_email_verifications")
    .insert({
      email,
      code_hash: hashVerificationCode(code, salt),
      code_salt: salt,
      expires_at: expiresAt,
      provider: emailProvider.provider,
      provider_message_id: null,
      request_ip: input.requestIp,
      request_user_agent: input.requestUserAgent
    })
    .select("id, expires_at")
    .single();

  if (error) {
    throw new Error(`한전 메일 수신 주소 인증 저장에 실패했습니다: ${error.message}`);
  }

  let sent: EmailSendResult;
  try {
    sent = await emailProvider.send({
      to: email,
      subject: "[AUTO-TAX] 한전 메일 수신 주소 인증번호",
      text: `[AUTO-TAX] 한전 메일 수신 주소 인증번호는 ${code}입니다. 5분 안에 입력해주세요.`
    });
  } catch (error) {
    const detail = describeEmailTransportError(error);
    throw new Error(`한전 메일 수신 주소 인증번호 발송에 실패했습니다: ${detail}`);
  }

  if (sent.providerMessageId) {
    const { error: updateError } = await adminClient
      .from("public_signup_email_verifications")
      .update({
        provider_message_id: sent.providerMessageId,
        updated_at: nowIso()
      })
      .eq("id", asString((data as Row).id));
    if (updateError) {
      console.warn(`한전 메일 수신 주소 인증 발송 ID 저장에 실패했습니다: ${updateError.message}`);
    }
  }

  return {
    verificationId: asString((data as Row).id),
    expiresAt: asString((data as Row).expires_at, expiresAt),
    devCode: canExposeDevCode() ? sent.devCode : undefined
  };
}

export async function sendPublicSignupCompletionEmail(input: {
  to: string;
  name: string;
  organizationName: string;
  loginId: string;
}): Promise<EmailSendResult> {
  const emailProvider = createSignupEmailProvider();
  const normalizedEmail = normalizeSignupEmail(input.to);
  const name = input.name.trim() || "고객";
  const organizationName = input.organizationName.trim() || "신청 고객사";
  const loginId = input.loginId.trim();

  return emailProvider.send({
    to: normalizedEmail,
    subject: "[AUTO-TAX] 회원가입 신청이 완료되었습니다",
    text: [
      `${name}님, AUTO-TAX 회원가입 신청이 완료되었습니다.`,
      "",
      `고객사: ${organizationName}`,
      `로그인 ID: ${loginId}`,
      "",
      "운영자 승인 후 로그인할 수 있습니다.",
      "승인이 완료되면 안내에 따라 AUTO-TAX 서비스를 이용해 주세요."
    ].join("\n")
  });
}

export async function confirmSignupEmailVerification(
  adminClient: AdminClient,
  input: {
    verificationId: string;
    email: string;
    code: string;
  }
): Promise<void> {
  const row = await getVerificationRow(adminClient, input.verificationId);
  if (!row) {
    throw new HttpError(404, "한전 메일 수신 주소 인증 요청을 찾을 수 없습니다.");
  }

  if (asString(row.email) !== normalizeSignupEmail(input.email)) {
    throw new HttpError(400, "인증 요청한 한전 메일 수신 주소와 일치하지 않습니다.");
  }
  if (asString(row.consumed_at)) {
    throw new HttpError(400, "이미 사용된 한전 메일 수신 주소 인증입니다.");
  }
  if (asString(row.verified_at)) {
    return;
  }
  if (isExpired(asString(row.expires_at))) {
    throw new HttpError(400, "인증번호가 만료되었습니다. 다시 요청해주세요.");
  }
  if (asNumber(row.attempt_count) >= SIGNUP_EMAIL_VERIFICATION_MAX_ATTEMPTS) {
    throw new HttpError(429, "인증번호 확인 횟수가 초과되었습니다. 다시 요청해주세요.");
  }

  const code = input.code.replace(/\D/g, "");
  const expectedHash = asString(row.code_hash);
  const actualHash = hashVerificationCode(code, asString(row.code_salt));
  if (code.length !== 6 || actualHash !== expectedHash) {
    const nextAttemptCount = asNumber(row.attempt_count) + 1;
    const { error } = await adminClient
      .from("public_signup_email_verifications")
      .update({
        attempt_count: nextAttemptCount,
        updated_at: nowIso()
      })
      .eq("id", input.verificationId);
    if (error) {
      throw new Error(`한전 메일 수신 주소 인증 실패 횟수 저장에 실패했습니다: ${error.message}`);
    }
    throw new HttpError(400, "인증번호가 일치하지 않습니다.");
  }

  const { error } = await adminClient
    .from("public_signup_email_verifications")
    .update({
      verified_at: nowIso(),
      updated_at: nowIso()
    })
    .eq("id", input.verificationId);
  if (error) {
    throw new Error(`한전 메일 수신 주소 인증 완료 저장에 실패했습니다: ${error.message}`);
  }
}

export async function consumeSignupEmailVerification(
  adminClient: AdminClient,
  input: {
    verificationId: string;
    email: string;
    allowExpiredVerified?: boolean;
  }
): Promise<void> {
  const row = await getVerificationRow(adminClient, input.verificationId);
  if (!row) {
    throw new HttpError(400, "한전 메일 수신 주소 인증을 먼저 완료해주세요.");
  }
  if (asString(row.email) !== normalizeSignupEmail(input.email)) {
    throw new HttpError(400, "인증한 한전 메일 수신 주소와 가입 메일이 일치하지 않습니다.");
  }
  if (!asString(row.verified_at)) {
    throw new HttpError(400, "한전 메일 수신 주소 인증을 먼저 완료해주세요.");
  }
  if (asString(row.consumed_at)) {
    throw new HttpError(400, "이미 사용된 한전 메일 수신 주소 인증입니다.");
  }
  if (!input.allowExpiredVerified && isExpired(asString(row.expires_at))) {
    throw new HttpError(400, "한전 메일 수신 주소 인증이 만료되었습니다. 다시 인증해주세요.");
  }

  const { error } = await adminClient
    .from("public_signup_email_verifications")
    .update({
      consumed_at: nowIso(),
      updated_at: nowIso()
    })
    .eq("id", input.verificationId);
  if (error) {
    throw new Error(`한전 메일 수신 주소 인증 사용 처리에 실패했습니다: ${error.message}`);
  }
}
