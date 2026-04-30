import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicConsultationRequest, PublicConsultationRequestStatus } from "./domain.js";

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

export function mapPublicConsultationRequest(row: Row): PublicConsultationRequest {
  return {
    id: asString(row.id),
    name: asString(row.name),
    phone: asString(row.phone),
    status: asString(row.status, "new") as PublicConsultationRequestStatus,
    note: asString(row.note),
    handledBy: asNullableString(row.handled_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at)
  };
}

export async function createPublicConsultationRequest(
  adminClient: AdminClient,
  input: { name: string; phone: string }
): Promise<PublicConsultationRequest> {
  const { data, error } = await adminClient
    .from("public_consultation_requests")
    .insert({
      name: input.name,
      phone: input.phone,
      status: "new"
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`상담 신청 저장에 실패했습니다: ${error.message}`);
  }

  return mapPublicConsultationRequest(data as Row);
}

export async function listPublicConsultationRequests(
  adminClient: AdminClient
): Promise<PublicConsultationRequest[]> {
  const { data, error } = await adminClient
    .from("public_consultation_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`상담 신청 목록 조회에 실패했습니다: ${error.message}`);
  }

  return ((data ?? []) as Row[]).map(mapPublicConsultationRequest);
}

export async function updatePublicConsultationRequest(
  adminClient: AdminClient,
  input: {
    id: string;
    status?: PublicConsultationRequestStatus;
    note?: string;
    handledBy: string | null;
  }
): Promise<PublicConsultationRequest | null> {
  const update: Record<string, unknown> = {
    handled_by: input.handledBy
  };

  if (input.status !== undefined) {
    update.status = input.status;
  }
  if (input.note !== undefined) {
    update.note = input.note;
  }

  const { data, error } = await adminClient
    .from("public_consultation_requests")
    .update(update)
    .eq("id", input.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`상담 신청 상태 저장에 실패했습니다: ${error.message}`);
  }

  return data ? mapPublicConsultationRequest(data as Row) : null;
}
