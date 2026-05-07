import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import { issueTaxInvoice, sendIssueCompleteMessage } from "./popbill-client.js";
import type { AppStore, OrganizationIssueQuota } from "./store-contract.js";
import { formatWriteDate } from "./utils.js";

function isPaidPlan(quota: Pick<OrganizationIssueQuota, "organizationPlanCode" | "organizationStatus">): boolean {
  return quota.organizationPlanCode === "paid" && quota.organizationStatus === "active";
}

async function resolveIssueQuota(store: AppStore): Promise<OrganizationIssueQuota | null> {
  if (store.getOrganizationIssueQuota) {
    return await store.getOrganizationIssueQuota();
  }

  if (!store.getMonthlyIssueLimit || !store.getCurrentMonthIssuedDraftCount) {
    return null;
  }

  const [monthlyIssueLimit, currentMonthIssuedDraftCount] = await Promise.all([
    store.getMonthlyIssueLimit(),
    store.getCurrentMonthIssuedDraftCount()
  ]);

  return {
    organizationName: "",
    organizationPlanCode: "paid",
    organizationStatus: "active",
    monthlyIssueLimit: monthlyIssueLimit ?? Number.MAX_SAFE_INTEGER,
    issuedDraftCount: currentMonthIssuedDraftCount,
    currentMonthIssuedDraftCount
  };
}

async function assertWithinIssueQuota(store: AppStore): Promise<OrganizationIssueQuota | null> {
  const quota = await resolveIssueQuota(store);
  if (!quota) {
    return null;
  }

  if (isPaidPlan(quota)) {
    if (quota.currentMonthIssuedDraftCount >= quota.monthlyIssueLimit) {
      throw new Error(
        `이번 달 발행 한도(${quota.monthlyIssueLimit}건)를 초과했습니다. 한도 조정 후 다시 시도하세요.`
      );
    }

    return quota;
  }

  if (quota.issuedDraftCount >= quota.monthlyIssueLimit) {
    throw new Error(
      `무료 체험 발행 한도(${quota.monthlyIssueLimit}건)를 모두 사용했습니다. 유료 구독 적용 후 다시 시도하세요.`
    );
  }

  return quota;
}

export async function issueDraftNow(store: AppStore, settings: AppSettings, customer: Customer, draft: InvoiceDraft): Promise<InvoiceDraft> {
  const quota = await assertWithinIssueQuota(store);
  const writeDate = new Date();
  const response = await issueTaxInvoice(settings, customer, draft, writeDate);
  const issuedDraft = await store.updateDraftStatus(
    draft.id,
    "issued",
    "",
    formatWriteDate(writeDate),
    response,
    settings.popbillIsTest ? "test" : "production"
  );

  try {
    await store.upsertCustomerReportDetailFromIssuedDraft(issuedDraft);
  } catch (error) {
    await store.createLog(
      "warn",
      "drafts",
      "발행 완료 후 신고 이력 자동 동기화에 실패했습니다.",
      {
        draftId: issuedDraft.id,
        customerId: issuedDraft.customerId,
        billingMonth: issuedDraft.billingMonth,
        issueError: error instanceof Error ? error.message : String(error)
      }
    ).catch(() => {});
  }

  if (quota?.organizationName) {
    try {
      await sendIssueCompleteMessage(settings, customer, issuedDraft, {
        organizationName: quota.organizationName,
        receiverMobile: customer.renewalContactMobile
      });
      await store.createLog("info", "drafts", "발행 완료 문자를 전송했습니다.", {
        draftId: issuedDraft.id,
        customerId: issuedDraft.customerId,
        organizationName: quota.organizationName
      }).catch(() => {});
    } catch (error) {
      await store.createLog("warn", "drafts", "발행은 완료됐지만 문자 전송에 실패했습니다.", {
        draftId: issuedDraft.id,
        customerId: issuedDraft.customerId,
        organizationName: quota.organizationName,
        error: error instanceof Error ? error.message : String(error)
      }).catch(() => {});
    }
  }

  return issuedDraft;
}
