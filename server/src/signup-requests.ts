import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicSignupRequest, PublicSignupRequestStatus } from "./domain.js";
import { nowIso } from "./utils.js";

export const PUBLIC_SIGNUP_TERMS_VERSION = "terms_2026-05-12";
export const PUBLIC_SIGNUP_PRIVACY_VERSION = "privacy_2026-05-14";
export const PUBLIC_SIGNUP_THIRD_PARTY_VERSION = "third_party_2026-05-12";
export const PUBLIC_SIGNUP_MARKETING_VERSION = "marketing_2026-05-12";

type Row = Record<string, unknown>;
type AdminClient = Pick<SupabaseClient, "from">;

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

export function mapPublicSignupRequest(row: Row): PublicSignupRequest {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    loginId: asString(row.login_id),
    authEmail: asString(row.auth_email),
    organizationName: asString(row.organization_name),
    representativeName: asString(row.representative_name),
    businessRegistrationNumber: asString(row.business_registration_number),
    businessAddress: asString(row.business_address),
    businessType: asString(row.business_type),
    businessItem: asString(row.business_item),
    name: asString(row.name),
    phone: asString(row.phone),
    kepcoEmail: asString(row.kepco_email),
    invoiceEmail: asString(row.invoice_email),
    status: asString(row.status, "pending") as PublicSignupRequestStatus,
    marketingConsent: asBoolean(row.marketing_consent),
    termsVersion: asString(row.terms_version),
    privacyVersion: asString(row.privacy_version),
    thirdPartyVersion: asString(row.third_party_version),
    marketingVersion: asNullableString(row.marketing_version),
    termsAcceptedAt: asString(row.terms_accepted_at),
    privacyAcceptedAt: asString(row.privacy_accepted_at),
    thirdPartyAcceptedAt: asString(row.third_party_accepted_at),
    marketingAcceptedAt: asNullableString(row.marketing_accepted_at),
    reviewedBy: asNullableString(row.reviewed_by),
    reviewedAt: asNullableString(row.reviewed_at),
    reviewNote: asString(row.review_note),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at)
  };
}

export async function createPublicSignupRequest(
  adminClient: AdminClient,
  input: {
    userId: string;
    loginId: string;
    authEmail: string;
    organizationName: string;
    representativeName: string;
    businessRegistrationNumber: string;
    businessAddress: string;
    businessType: string;
    businessItem: string;
    name: string;
    phone: string;
    kepcoEmail: string;
    invoiceEmail: string;
    marketingConsent: boolean;
    requestIp: string;
    requestUserAgent: string;
  }
): Promise<PublicSignupRequest> {
  const acceptedAt = nowIso();
  const { data, error } = await adminClient
    .from("public_signup_requests")
    .insert({
      user_id: input.userId,
      login_id: input.loginId,
      auth_email: input.authEmail,
      organization_name: input.organizationName,
      representative_name: input.representativeName,
      business_registration_number: input.businessRegistrationNumber,
      business_address: input.businessAddress,
      business_type: input.businessType,
      business_item: input.businessItem,
      name: input.name,
      phone: input.phone,
      kepco_email: input.kepcoEmail,
      invoice_email: input.invoiceEmail,
      status: "pending",
      marketing_consent: input.marketingConsent,
      terms_version: PUBLIC_SIGNUP_TERMS_VERSION,
      privacy_version: PUBLIC_SIGNUP_PRIVACY_VERSION,
      third_party_version: PUBLIC_SIGNUP_THIRD_PARTY_VERSION,
      marketing_version: input.marketingConsent ? PUBLIC_SIGNUP_MARKETING_VERSION : null,
      terms_accepted_at: acceptedAt,
      privacy_accepted_at: acceptedAt,
      third_party_accepted_at: acceptedAt,
      marketing_accepted_at: input.marketingConsent ? acceptedAt : null,
      request_ip: input.requestIp,
      request_user_agent: input.requestUserAgent
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`회원가입 신청 저장에 실패했습니다: ${error.message}`);
  }

  return mapPublicSignupRequest(data as Row);
}

export async function listPublicSignupRequests(adminClient: AdminClient): Promise<PublicSignupRequest[]> {
  const { data, error } = await adminClient
    .from("public_signup_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`회원가입 신청 목록 조회에 실패했습니다: ${error.message}`);
  }

  return ((data ?? []) as Row[]).map(mapPublicSignupRequest);
}

export async function getPublicSignupRequestById(
  adminClient: AdminClient,
  id: string
): Promise<PublicSignupRequest | null> {
  const { data, error } = await adminClient
    .from("public_signup_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`회원가입 신청 조회에 실패했습니다: ${error.message}`);
  }

  return data ? mapPublicSignupRequest(data as Row) : null;
}

export async function findPublicSignupRequestByLoginId(
  adminClient: AdminClient,
  loginId: string
): Promise<PublicSignupRequest | null> {
  const { data, error } = await adminClient
    .from("public_signup_requests")
    .select("*")
    .eq("login_id", loginId)
    .maybeSingle();

  if (error) {
    throw new Error(`회원가입 신청 조회에 실패했습니다: ${error.message}`);
  }

  return data ? mapPublicSignupRequest(data as Row) : null;
}

export async function findPublicSignupRequestByKepcoEmail(
  adminClient: AdminClient,
  email: string
): Promise<PublicSignupRequest | null> {
  const { data, error } = await adminClient
    .from("public_signup_requests")
    .select("*")
    .eq("kepco_email", email.trim().toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`회원가입 신청 조회에 실패했습니다: ${error.message}`);
  }

  const row = ((data ?? []) as Row[])[0] ?? null;
  return row ? mapPublicSignupRequest(row) : null;
}

export async function findPublicSignupRequestByUserId(
  adminClient: AdminClient,
  userId: string
): Promise<PublicSignupRequest | null> {
  const { data, error } = await adminClient
    .from("public_signup_requests")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`회원가입 신청 조회에 실패했습니다: ${error.message}`);
  }

  return data ? mapPublicSignupRequest(data as Row) : null;
}

export async function updatePublicSignupRequestStatus(
  adminClient: AdminClient,
  input: {
    id: string;
    status: Extract<PublicSignupRequestStatus, "approved" | "rejected">;
    reviewedBy: string | null;
    reviewNote?: string;
  }
): Promise<PublicSignupRequest | null> {
  const { data, error } = await adminClient
    .from("public_signup_requests")
    .update({
      status: input.status,
      reviewed_by: input.reviewedBy,
      reviewed_at: nowIso(),
      review_note: input.reviewNote?.trim() ?? ""
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`회원가입 신청 상태 저장에 실패했습니다: ${error.message}`);
  }

  return data ? mapPublicSignupRequest(data as Row) : null;
}
