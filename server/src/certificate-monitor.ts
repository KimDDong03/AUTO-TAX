import type { Customer } from "./domain.js";
import { buildPilotLogContext } from "./pilot-issuance.js";
import { getCertificateExpireDate } from "./popbill-client.js";
import { applyServerManagedSettings } from "./server-managed-settings.js";
import type { AppStore } from "./store-contract.js";
import { nowIso } from "./utils.js";

type NotificationStatus = "disabled";
type RefreshAllCertificateStatusesDependencies = {
  nowIso: () => string;
  getCertificateExpireDate: typeof getCertificateExpireDate;
};

export interface CertificateRefreshItem {
  customerId: number;
  customerName: string;
  expireDate: string | null;
  daysUntil: number | null;
  ok: boolean;
  error?: string;
}

export interface CertificateRefreshResult {
  checkedAt: string;
  checked: number;
  updated: number;
  failed: number;
  expired: number;
  expiringSoon: number;
  notificationStatus: NotificationStatus;
  notificationMessage: string;
  results: CertificateRefreshItem[];
}

function getDaysUntilDate(value: string | null): number | null {
  if (!value) return null;
  const compact = value.replace(/\D/g, "");
  const target =
    compact.length === 8
      ? new Date(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)))
      : new Date(value);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function sameKstDay(left: string | null, right: string): boolean {
  if (!left) return false;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date(left)) === formatter.format(new Date(right));
}

export function shouldRefreshCertificateStatuses(lastCheckedAt: string | null, referenceAt = nowIso()): boolean {
  return !sameKstDay(lastCheckedAt, referenceAt);
}

export async function refreshAllCertificateStatuses(
  store: AppStore,
  dependencies: Partial<RefreshAllCertificateStatusesDependencies> = {}
): Promise<CertificateRefreshResult> {
  const checkedAt = (dependencies.nowIso ?? nowIso)();
  const loadCertificateExpireDate = dependencies.getCertificateExpireDate ?? getCertificateExpireDate;
  const settings = applyServerManagedSettings(await store.getSettings());
  const joinedCustomers = (await store.listCustomers()).filter((customer) => customer.popbillState === "joined");
  const results: CertificateRefreshItem[] = [];

  for (const customer of joinedCustomers) {
    try {
      const expireDate = await loadCertificateExpireDate(settings, customer);
      const updated = await store.updateCustomerPopbillState(customer.id, customer.popbillState, true, expireDate);
      results.push({
        customerId: updated.id,
        customerName: updated.customerName,
        expireDate: updated.popbillCertExpireDate,
        daysUntil: getDaysUntilDate(updated.popbillCertExpireDate),
        ok: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "인증서 만료일 조회 실패";
      results.push({
        customerId: customer.id,
        customerName: customer.customerName,
        expireDate: customer.popbillCertExpireDate,
        daysUntil: getDaysUntilDate(customer.popbillCertExpireDate),
        ok: false,
        error: message
      });
      await store.createLog(
        "error",
        "popbill",
        "인증서 일괄 점검 중 고객 만료일 조회에 실패했습니다.",
        buildPilotLogContext(
          {
            customerId: customer.id,
            customerName: customer.customerName,
            error: message
          },
          {
            errorCategory: "external-api",
            errorOperation: "cert-expire-date"
          }
        )
      );
    }
  }

  const latestCustomers = results.map((item) => ({
    customerName: item.customerName,
    popbillCertExpireDate: item.expireDate
  }));
  const expiredCustomers = latestCustomers.filter((customer) => {
    const daysUntil = getDaysUntilDate(customer.popbillCertExpireDate);
    return daysUntil !== null && daysUntil < 0;
  });
  const expiringSoonCustomers = latestCustomers.filter((customer) => {
    const daysUntil = getDaysUntilDate(customer.popbillCertExpireDate);
    return daysUntil !== null && daysUntil >= 0 && daysUntil < 60;
  });

  const nextMetadata: Parameters<AppStore["updateCertificateCheckMetadata"]>[0] = {
    certLastCheckedAt: checkedAt
  };
  const notificationStatus: NotificationStatus = "disabled";
  const notificationMessage = "이메일 업무 알림은 사용하지 않습니다.";

  const updatedCount = results.filter((item) => item.ok).length;
  const failedCount = results.length - updatedCount;

  await store.updateCertificateCheckMetadata(nextMetadata);
  await store.createLog("info", "popbill", "인증서 일괄 점검을 완료했습니다.", {
    checked: joinedCustomers.length,
    updated: updatedCount,
    failed: failedCount,
    expired: expiredCustomers.length,
    expiringSoon: expiringSoonCustomers.length
  });

  return {
    checkedAt,
    checked: joinedCustomers.length,
    updated: updatedCount,
    failed: failedCount,
    expired: expiredCustomers.length,
    expiringSoon: expiringSoonCustomers.length,
    notificationStatus,
    notificationMessage,
    results
  };
}
