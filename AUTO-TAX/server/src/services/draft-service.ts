import type { AppSettings, InvoiceDraft, PopbillEnvironment } from "../domain.js";
import type { AppStore } from "../store-contract.js";

export function resolveCurrentPopbillEnvironment(settings: Pick<AppSettings, "popbillIsTest">): PopbillEnvironment {
  return settings.popbillIsTest ? "test" : "production";
}

export async function assertDraftPopbillEnvironment(
  settings: AppSettings,
  draft: Pick<InvoiceDraft, "popbillEnvironment">
): Promise<void> {
  if (!draft.popbillEnvironment) {
    return;
  }

  const currentEnvironment = resolveCurrentPopbillEnvironment(settings);
  if (draft.popbillEnvironment !== currentEnvironment) {
    const issuedEnvironment = draft.popbillEnvironment === "test" ? "테스트" : "운영";
    const currentEnvironmentLabel = currentEnvironment === "test" ? "테스트" : "운영";
    const error = new Error(
      `이 문서는 ${issuedEnvironment} 환경에서 발행되었습니다. 현재 ${currentEnvironmentLabel} 모드에서는 조회할 수 없습니다.`
    ) as Error & { status?: number };
    error.status = 409;
    throw error;
  }
}

export async function backfillDraftPopbillEnvironmentIfMissing(
  requestStore: AppStore,
  settings: AppSettings,
  draft: Pick<InvoiceDraft, "id" | "popbillEnvironment">
): Promise<void> {
  if (draft.popbillEnvironment) {
    return;
  }

  await requestStore.updateDraftPopbillEnvironment(draft.id, resolveCurrentPopbillEnvironment(settings));
}
