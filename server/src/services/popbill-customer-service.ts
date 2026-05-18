import type { AppSettings, Customer } from "../domain.js";
import { buildPilotLogContext } from "../pilot-issuance.js";
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
export const POPBILL_JOIN_SUPPORT_MESSAGE =
  "발행 연동 가입을 완료하지 못했습니다. AUTO-TAX 운영팀에 문의해 주세요.";
export const POPBILL_ALREADY_MEMBER_MESSAGE =
  "이미 팝빌에 가입된 사업자번호입니다. 기존 팝빌 계정 정보 확인 후 발행 연동을 진행해야 합니다.";
type PopbillAutoJoinOperation = "check-is-member" | "join-member";

type AutoJoinCustomerDeps = {
  checkIsMember?: typeof checkIsMember;
  joinMember?: typeof joinMember;
};

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

function isAlreadyPopbillMemberError(error: unknown, errorMessage: string): boolean {
  return (
    (error instanceof PopbillApiError && error.code === "-10001000") ||
    errorMessage.includes("가입된 회원")
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
      error: `발행 연동 자동 가입 대기열 확인 실패: ${openJob.error.message}`
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
      error: `발행 연동 자동 가입 작업 등록 실패: ${queued.error.message}`
    };
  }

  return { status: "queued" };
}

export async function autoJoinCustomerPopbill(
  requestStore: AppStore,
  customer: Customer,
  getSettings: (requestStore: AppStore) => Promise<AppSettings>,
  _getErrorMessage: (error: unknown, fallbackMessage?: string) => string,
  deps: AutoJoinCustomerDeps = {}
): Promise<AutoJoinCustomerResult> {
  const timingStartedAt = Date.now();
  let finalStatus: AutoJoinCustomerResult["status"] | "unknown" = "unknown";
  let checkMembershipMs = 0;
  let joinMemberMs = 0;
  let fallbackCheckMs = 0;
  let joinAttempts = 0;
  const checkCustomerMembership = deps.checkIsMember ?? checkIsMember;
  const joinCustomerMembership = deps.joinMember ?? joinMember;

  const buildAutoJoinLogContext = (
    logCustomer: Customer,
    baseContext: Record<string, unknown>,
    additions: Record<string, unknown> = {}
  ) =>
    buildPilotLogContext(
      {
        customerId: logCustomer.id,
        issueMode: logCustomer.issueMode,
        ...baseContext
      },
      additions
    );

  const toErrorCode = (error: unknown) => (error instanceof PopbillApiError ? error.code : undefined);
  const logTiming = () => {
    console.info(
      `[popbill-auto-join-timing] customerId=${customer.id} status=${finalStatus} totalMs=${Date.now() - timingStartedAt} checkMembershipMs=${checkMembershipMs} joinMemberMs=${joinMemberMs} fallbackCheckMs=${fallbackCheckMs} joinAttempts=${joinAttempts}`
    );
  };

  if (customer.popbillState === "joined") {
    finalStatus = "already-joined";
    logTiming();
    return { customer, status: "already-joined" };
  }

  let settings: AppSettings | null = null;
  let joinTarget = customer;
  let lastExternalApiFailure: { operation: PopbillAutoJoinOperation; code?: string } | null = null;
  let retryJoinFailure: { message: string; code?: string } | null = null;

  try {
    settings = await getSettings(requestStore);
    let isExistingMember: boolean;
    try {
      const checkStartedAt = Date.now();
      isExistingMember = await checkCustomerMembership(settings, customer.businessNumber);
      checkMembershipMs += Date.now() - checkStartedAt;
      lastExternalApiFailure = null;
    } catch (error) {
      lastExternalApiFailure = {
        operation: "check-is-member",
        code: toErrorCode(error)
      };
      throw error;
    }

    if (isExistingMember) {
      const updated = await requestStore.updateCustomerPopbillState(customer.id, "joined");
      await requestStore.createLog(
        "info",
        "popbill",
        "고객 등록 직후 기존 발행 연동 계정으로 확인되어 joined로 연결했습니다.",
        buildAutoJoinLogContext(updated, {})
      );
      finalStatus = "linked-existing-member";
      return { customer: updated, status: "linked-existing-member" };
    }

    for (let attempt = 0; attempt < AUTO_JOIN_POPBILL_MAX_ID_RETRIES; attempt += 1) {
      if (attempt > 0) {
        const nextPopbillUserId = buildPopbillRetryUserId(settings.popbillUserIdPrefix, customer.id, attempt);
        joinTarget = await requestStore.updateCustomerPopbillUserId(customer.id, nextPopbillUserId);
        await requestStore.createLog(
          "warn",
          "popbill",
          "발행 연동 계정 아이디 충돌 가능성으로 다른 아이디로 자동 재시도합니다.",
          buildAutoJoinLogContext(
            joinTarget,
            {
              attempt: attempt + 1,
              popbillUserId: nextPopbillUserId,
              error: retryJoinFailure?.message
            },
            {
              errorCategory: retryJoinFailure ? "external-api" : undefined,
              errorOperation: retryJoinFailure ? "join-member" : undefined,
              errorCode: retryJoinFailure?.code,
              retryReason: retryJoinFailure ? "user-id-conflict" : undefined
            }
          )
        );
        retryJoinFailure = null;
      }

      const joinStartedAt = Date.now();
      try {
        joinAttempts += 1;
        await joinCustomerMembership(settings, joinTarget);
        joinMemberMs += Date.now() - joinStartedAt;
        lastExternalApiFailure = null;
        const updated = await requestStore.updateCustomerPopbillState(customer.id, "joined");
        await requestStore.createLog(
          "info",
          "popbill",
          "고객 등록 직후 발행 연동 계정 가입을 완료했습니다.",
          buildAutoJoinLogContext(updated, {
            popbillUserId: updated.popbillUserId,
            retryCount: attempt
          })
        );
        finalStatus = "joined";
        return { customer: updated, status: "joined" };
      } catch (error) {
        joinMemberMs += Date.now() - joinStartedAt;
        const errorMessage =
          error instanceof PopbillApiError ? error.rawMessage : error instanceof Error ? error.message : "발행 연동 자동 가입에 실패했습니다.";
        lastExternalApiFailure = {
          operation: "join-member",
          code: toErrorCode(error)
        };
        const fallbackCheckStartedAt = Date.now();
        const fallbackMemberState = await checkCustomerMembership(settings, customer.businessNumber).catch(() => false);
        fallbackCheckMs += Date.now() - fallbackCheckStartedAt;

        if (fallbackMemberState) {
          const updated = await requestStore.updateCustomerPopbillState(customer.id, "joined");
          await requestStore.createLog(
            "warn",
            "popbill",
            "고객 등록 직후 중복/기존 회원으로 확인되어 joined로 보정했습니다.",
            buildAutoJoinLogContext(
              updated,
              {
                error: errorMessage
              },
              {
                errorCategory: "external-api",
                errorOperation: "join-member",
                errorCode: toErrorCode(error)
              }
            )
          );
          finalStatus = "linked-after-duplicate-check";
          return { customer: updated, status: "linked-after-duplicate-check" };
        }

        if (attempt < AUTO_JOIN_POPBILL_MAX_ID_RETRIES - 1 && isPopbillUserIdConflictError(errorMessage)) {
          retryJoinFailure = {
            message: errorMessage,
            code: toErrorCode(error)
          };
          continue;
        }

        throw error;
      }
    }

    throw new Error("발행 연동 자동 가입 재시도 한도를 초과했습니다.");
  } catch (error) {
    const errorMessage =
      error instanceof PopbillApiError ? error.rawMessage : error instanceof Error ? error.message : "발행 연동 자동 가입에 실패했습니다.";
    const userFacingError = isAlreadyPopbillMemberError(error, errorMessage)
      ? POPBILL_ALREADY_MEMBER_MESSAGE
      : POPBILL_JOIN_SUPPORT_MESSAGE;
    const fallbackCheckStartedAt = Date.now();
    const fallbackMemberState =
      settings ? await checkCustomerMembership(settings, customer.businessNumber).catch(() => false) : false;
    fallbackCheckMs += Date.now() - fallbackCheckStartedAt;
    const failureContext = lastExternalApiFailure ?? (error instanceof PopbillApiError ? { operation: "join-member" as const, code: error.code } : null);

    if (fallbackMemberState) {
      const updated = await requestStore.updateCustomerPopbillState(customer.id, "joined");
      await requestStore.createLog(
        "warn",
        "popbill",
        "고객 등록 직후 중복/기존 회원으로 확인되어 joined로 보정했습니다.",
        buildAutoJoinLogContext(
          updated,
          {
            error: errorMessage
          },
          {
            errorCategory: failureContext ? "external-api" : undefined,
            errorOperation: failureContext?.operation,
            errorCode: failureContext?.code
          }
        )
      );
      finalStatus = "linked-after-duplicate-check";
      return { customer: updated, status: "linked-after-duplicate-check" };
    }

    const failedCustomer = await requestStore.updateCustomerPopbillState(customer.id, "failed");
    await requestStore.createLog(
      "error",
      "popbill",
      "고객 등록 직후 발행 연동 자동 가입에 실패했습니다.",
      buildAutoJoinLogContext(
        failedCustomer,
        {
          error: errorMessage
        },
        {
          errorCategory: failureContext ? "external-api" : undefined,
          errorOperation: failureContext?.operation,
          errorCode: failureContext?.code,
          supportCategory: "popbill-join",
          userFacingError
        }
      )
    );
    finalStatus = "failed";
    return {
      customer: failedCustomer,
      status: "failed",
      error: userFacingError
    };
  } finally {
    logTiming();
  }
}
