import { createHash, randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http-errors.js";
import type { SmsProvider } from "./sms-provider.js";
import { nowIso } from "./utils.js";

type Row = Record<string, unknown>;
type AdminClient = Pick<SupabaseClient, "from">;

const SIGNUP_PHONE_VERIFICATION_TTL_MS = 5 * 60 * 1000;
const SIGNUP_PHONE_VERIFICATION_MAX_ATTEMPTS = 5;

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

export function normalizeSignupPhone(value: string): string {
  return value.replace(/\D/g, "");
}

function hashVerificationCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function createVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function getExpiresAt(): string {
  return new Date(Date.now() + SIGNUP_PHONE_VERIFICATION_TTL_MS).toISOString();
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function getSmsSendFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "휴대폰 인증 문자 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }

  const message = `${error.message} ${asString((error as { errorMessage?: unknown }).errorMessage, "")}`.trim();
  if (message.includes("허용되지 않은 IP")) {
    return "현재 SOLAPI API 접근이 차단되어 휴대폰 인증 문자를 발송할 수 없습니다. SOLAPI 콘솔에서 Vercel 서버 아웃바운드 IP를 허용 목록에 추가해 주세요.";
  }

  return "휴대폰 인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

async function getVerificationRow(adminClient: AdminClient, verificationId: string): Promise<Row | null> {
  const { data, error } = await adminClient
    .from("public_signup_phone_verifications")
    .select("*")
    .eq("id", verificationId)
    .maybeSingle();

  if (error) {
    throw new Error(`휴대폰 인증 조회에 실패했습니다: ${error.message}`);
  }

  return data ? data as Row : null;
}

export async function createSignupPhoneVerification(
  adminClient: AdminClient,
  smsProvider: SmsProvider,
  input: {
    phone: string;
    requestIp: string;
    requestUserAgent: string;
  }
): Promise<{ verificationId: string; expiresAt: string; devCode?: string }> {
  const phone = normalizeSignupPhone(input.phone);
  const code = createVerificationCode();
  const salt = randomUUID();
  const expiresAt = getExpiresAt();

  const { data, error } = await adminClient
    .from("public_signup_phone_verifications")
    .insert({
      phone,
      code_hash: hashVerificationCode(code, salt),
      code_salt: salt,
      expires_at: expiresAt,
      provider: smsProvider.provider,
      provider_message_id: null,
      request_ip: input.requestIp,
      request_user_agent: input.requestUserAgent
    })
    .select("id, expires_at")
    .single();

  if (error) {
    throw new Error(`휴대폰 인증 저장에 실패했습니다: ${error.message}`);
  }

  let sent;
  try {
    sent = await smsProvider.send({
      to: phone,
      text: `[AUTO-TAX] 인증번호는 ${code}입니다. 5분 안에 입력해주세요.`
    });
  } catch (error) {
    throw new HttpError(503, getSmsSendFailureMessage(error));
  }

  if (sent.providerMessageId) {
    const { error: updateError } = await adminClient
      .from("public_signup_phone_verifications")
      .update({
        provider_message_id: sent.providerMessageId,
        updated_at: nowIso()
      })
      .eq("id", asString((data as Row).id));
    if (updateError) {
      console.warn(`휴대폰 인증 발송 ID 저장에 실패했습니다: ${updateError.message}`);
    }
  }

  return {
    verificationId: asString((data as Row).id),
    expiresAt: asString((data as Row).expires_at, expiresAt),
    devCode: sent.devCode
  };
}

export async function confirmSignupPhoneVerification(
  adminClient: AdminClient,
  input: {
    verificationId: string;
    phone: string;
    code: string;
  }
): Promise<void> {
  const row = await getVerificationRow(adminClient, input.verificationId);
  if (!row) {
    throw new HttpError(404, "휴대폰 인증 요청을 찾을 수 없습니다.");
  }

  if (asString(row.phone) !== normalizeSignupPhone(input.phone)) {
    throw new HttpError(400, "인증 요청한 휴대폰 번호와 일치하지 않습니다.");
  }
  if (asString(row.consumed_at)) {
    throw new HttpError(400, "이미 사용된 휴대폰 인증입니다.");
  }
  if (asString(row.verified_at)) {
    return;
  }
  if (isExpired(asString(row.expires_at))) {
    throw new HttpError(400, "인증번호가 만료되었습니다. 다시 요청해주세요.");
  }
  if (asNumber(row.attempt_count) >= SIGNUP_PHONE_VERIFICATION_MAX_ATTEMPTS) {
    throw new HttpError(429, "인증번호 확인 횟수가 초과되었습니다. 다시 요청해주세요.");
  }

  const code = input.code.replace(/\D/g, "");
  const expectedHash = asString(row.code_hash);
  const actualHash = hashVerificationCode(code, asString(row.code_salt));
  if (code.length !== 6 || actualHash !== expectedHash) {
    const nextAttemptCount = asNumber(row.attempt_count) + 1;
    const { error } = await adminClient
      .from("public_signup_phone_verifications")
      .update({
        attempt_count: nextAttemptCount,
        updated_at: nowIso()
      })
      .eq("id", input.verificationId);
    if (error) {
      throw new Error(`휴대폰 인증 실패 횟수 저장에 실패했습니다: ${error.message}`);
    }
    throw new HttpError(400, "인증번호가 일치하지 않습니다.");
  }

  const { error } = await adminClient
    .from("public_signup_phone_verifications")
    .update({
      verified_at: nowIso(),
      updated_at: nowIso()
    })
    .eq("id", input.verificationId);
  if (error) {
    throw new Error(`휴대폰 인증 완료 저장에 실패했습니다: ${error.message}`);
  }
}

export async function consumeSignupPhoneVerification(
  adminClient: AdminClient,
  input: {
    verificationId: string;
    phone: string;
  }
): Promise<void> {
  const row = await getVerificationRow(adminClient, input.verificationId);
  if (!row) {
    throw new HttpError(400, "휴대폰 인증을 먼저 완료해주세요.");
  }
  if (asString(row.phone) !== normalizeSignupPhone(input.phone)) {
    throw new HttpError(400, "인증한 휴대폰 번호와 가입 전화번호가 일치하지 않습니다.");
  }
  if (!asString(row.verified_at)) {
    throw new HttpError(400, "휴대폰 인증을 먼저 완료해주세요.");
  }
  if (asString(row.consumed_at)) {
    throw new HttpError(400, "이미 사용된 휴대폰 인증입니다.");
  }
  if (isExpired(asString(row.expires_at))) {
    throw new HttpError(400, "휴대폰 인증이 만료되었습니다. 다시 인증해주세요.");
  }

  const { error } = await adminClient
    .from("public_signup_phone_verifications")
    .update({
      consumed_at: nowIso(),
      updated_at: nowIso()
    })
    .eq("id", input.verificationId);
  if (error) {
    throw new Error(`휴대폰 인증 사용 처리에 실패했습니다: ${error.message}`);
  }
}
