import type { AppSettings, Customer } from "../domain.js";
import { checkIsMember, joinMember, PopbillApiError } from "../popbill-client.js";
import { createSupabaseAdminClient } from "../supabase.js";
import type { AppStore } from "../store-contract.js";
import { nowIso } from "../utils.js";
import { buildPopbillUserId } from "../utils.js";

export type AutoJoinCustomerResult = {
  customer: Customer;
  status: "already-joined" | "linked-existing-member" | "joined" | "linked-after-duplicate-check" | "failed";
  error?: string;
};

export type QueueAutoJoinCustomerJobResult = {
  status: "already-joined" | "queued" | "already-queued" | "failed";
  error?: string | null;
};

const AUTO_JOIN_POPBILL_MAX_ID_RETRIES = 5;

function isPopbillUserIdConflictError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    (normalized.includes("id") && (normalized.includes("duplicate") || normalized.includes("exists") || normalized.includes("already"))) ||
    normalized.includes("회원아이디") ||
    normalized.includes("아이디") ||
    normalized.includes("사용중") ||
    normalized.includes("중복")
  );
}

function buildPopbillRetryUserId(prefix: string, customerId: number, attempt: number): string {
  const base = buildPopbillUserId(prefix, customerId);
  return attempt <= 0 ? base : `${base}_${attempt + 1}`;
}

export async function queueAutoJoinCustomerPopbillJob(options: {
  organizationId: string;
  requestedByUserId: string | null;
  customer: Customer;
}): Promise<QueueAutoJoinCustomerJobResult> {
  if (options.customer.popbillState === "joined") {
    return { status: "already-joined" };
  }

  const client = createSupabaseAdminClient();
  const openJob = await client
    .from("job_queue")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", options.organizationId)
    .eq("job_type", "customer-popbill-auto-join")
    .contains("payload", { customerId: options.customer.id })
    .in("status", ["queued", "claimed"]);

  if (openJob.error) {
    return {
      status: "failed",
      error: `팝빌 자동 가입 대기열 확인 실패: ${openJob.error.message}`
    };
  }

  if ((openJob.count ?? 0) > 0) {
    return { status: "already-queued" };
  }

  const queued = await client
    .from("job_queue")
    .insert({
      organization_id: options.organizationId,
      managed_customer_id: null,
      job_type: "customer-popbill-auto-join",
      status: "queued",
      run_after: nowIso(),
      requested_by: options.requestedByUserId,
      payload: {
        customerId: options.customer.id,
        customerName: options.customer.customerName,
        businessNumber: options.customer.businessNumber
      }
    })
    .select("id")
    .single();

  if (queued.error) {
    return {
      status: "failed",
      error: `팝빌 자동 가입 작업 등록 실패: ${queued.error.message}`
    };
  }

  return { status: "queued" };
}

export async function autoJoinCustomerPopbill(
  requestStore: AppStore,
  customer: Customer,
  getSettings: (requestStore: AppStore) => Promise<AppSettings>,
  getErrorMessage: (error: unknown, fallbackMessage?: string) => string
): Promise<AutoJoinCustomerResult> {
  if (customer.popbillState === "joined") {
    return { customer, status: "already-joined" };
  }

  let settings: AppSettings | null = null;
  let joinTarget = customer;

  try {
    settings = await getSettings(requestStore);
    const isExistingMember = await checkIsMember(settings, customer.businessNumber);
    if (isExistingMember) {
      const updated = await requestStore.updateCustomerPopbillState(customer.id, "joined");
      await requestStore.createLog("info", "popbill", "고객 등록 직후 기존 팝빌 연동회원으로 확인되어 joined로 연결했습니다.", {
        customerId: customer.id
      });
      return { customer: updated, status: "linked-existing-member" };
    }

    for (let attempt = 0; attempt < AUTO_JOIN_POPBILL_MAX_ID_RETRIES; attempt += 1) {
      if (attempt > 0) {
        const nextPopbillUserId = buildPopbillRetryUserId(settings.popbillUserIdPrefix, customer.id, attempt);
        joinTarget = await requestStore.updateCustomerPopbillUserId(customer.id, nextPopbillUserId);
        await requestStore.createLog("warn", "popbill", "팝빌 회원 아이디 충돌 가능성으로 다른 아이디로 자동 재시도합니다.", {
          customerId: customer.id,
          attempt: attempt + 1,
          popbillUserId: nextPopbillUserId
        });
      }

      try {
        await joinMember(settings, joinTarget);
        const updated = await requestStore.updateCustomerPopbillState(customer.id, "joined");
        await requestStore.createLog("info", "popbill", "고객 등록 직후 팝빌 연동회원 가입을 완료했습니다.", {
          customerId: customer.id,
          popbillUserId: updated.popbillUserId,
          retryCount: attempt
        });
        return { customer: updated, status: "joined" };
      } catch (error) {
        const errorMessage =
          error instanceof PopbillApiError ? error.rawMessage : error instanceof Error ? error.message : "팝빌 자동 가입에 실패했습니다.";
        const fallbackMemberState = await checkIsMember(settings, customer.businessNumber).catch(() => false);

        if (fallbackMemberState) {
          const updated = await requestStore.updateCustomerPopbillState(customer.id, "joined");
          await requestStore.createLog("warn", "popbill", "고객 등록 직후 중복/기존 회원으로 확인되어 joined로 보정했습니다.", {
            customerId: customer.id,
            error: errorMessage
          });
          return { customer: updated, status: "linked-after-duplicate-check" };
        }

        if (attempt < AUTO_JOIN_POPBILL_MAX_ID_RETRIES - 1 && isPopbillUserIdConflictError(errorMessage)) {
          continue;
        }

        throw error;
      }
    }

    throw new Error("팝빌 자동 가입 재시도 한도를 초과했습니다.");
  } catch (error) {
    const errorMessage =
      error instanceof PopbillApiError ? error.rawMessage : error instanceof Error ? error.message : "팝빌 자동 가입에 실패했습니다.";
    const fallbackMemberState =
      settings ? await checkIsMember(settings, customer.businessNumber).catch(() => false) : false;

    if (fallbackMemberState) {
      const updated = await requestStore.updateCustomerPopbillState(customer.id, "joined");
      await requestStore.createLog("warn", "popbill", "고객 등록 직후 중복/기존 회원으로 확인되어 joined로 보정했습니다.", {
        customerId: customer.id,
        error: errorMessage
      });
      return { customer: updated, status: "linked-after-duplicate-check" };
    }

    const failedCustomer = await requestStore.updateCustomerPopbillState(customer.id, "failed");
    await requestStore.createLog("error", "popbill", "고객 등록 직후 팝빌 자동 가입에 실패했습니다.", {
      customerId: customer.id,
      error: errorMessage
    });
    return { customer: failedCustomer, status: "failed", error: getErrorMessage(error, errorMessage) };
  }
}
