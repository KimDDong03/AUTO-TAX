import type { Customer } from "./domain.js";
import { sendNotification } from "./notifier.js";
import { getCertificateExpireDate } from "./popbill-client.js";
import type { AppStore } from "./store-contract.js";
import { nowIso } from "./utils.js";

type NotificationStatus = "not-needed" | "sent" | "skipped-already-sent-today" | "skipped-no-target";

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

function formatCustomerLine(customer: Customer): string {
  const daysUntil = getDaysUntilDate(customer.popbillCertExpireDate);
  const suffix =
    daysUntil === null
      ? customer.popbillCertExpireDate ?? "만료일 미확인"
      : daysUntil < 0
        ? `${customer.popbillCertExpireDate} (만료)`
        : `${customer.popbillCertExpireDate} (${daysUntil}일 남음)`;
  return `- ${customer.customerName}: ${suffix}`;
}

function buildNotificationBody(expiredCustomers: Customer[], expiringSoonCustomers: Customer[], checkedAt: string): string {
  const lines = [
    `[AUTO-TAX] 인증서 만료 점검 결과`,
    `점검시각: ${checkedAt}`,
    ``
  ];

  if (expiredCustomers.length > 0) {
    lines.push(`만료 고객 ${expiredCustomers.length}건`);
    lines.push(...expiredCustomers.map(formatCustomerLine));
    lines.push("");
  }

  if (expiringSoonCustomers.length > 0) {
    lines.push(`30일 이내 만료 예정 고객 ${expiringSoonCustomers.length}건`);
    lines.push(...expiringSoonCustomers.map(formatCustomerLine));
    lines.push("");
  }

  lines.push("AUTO-TAX 고객관리 화면에서 인증 상태 확인 또는 인증서 등록/재등록을 진행하세요.");
  return lines.join("\n");
}

export async function refreshAllCertificateStatuses(store: AppStore): Promise<CertificateRefreshResult> {
  const checkedAt = nowIso();
  const settings = await store.getSettings();
  const joinedCustomers = (await store.listCustomers()).filter((customer) => customer.popbillState === "joined");
  const results: CertificateRefreshItem[] = [];

  for (const customer of joinedCustomers) {
    try {
      const expireDate = await getCertificateExpireDate(settings, customer);
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
      await store.createLog("error", "popbill", "인증서 일괄 점검 중 고객 만료일 조회에 실패했습니다.", {
        customerId: customer.id,
        customerName: customer.customerName,
        error: message
      });
    }
  }

  const latestCustomers = (await store.listCustomers()).filter((customer) => customer.popbillState === "joined");
  const expiredCustomers = latestCustomers.filter((customer) => {
    const daysUntil = getDaysUntilDate(customer.popbillCertExpireDate);
    return daysUntil !== null && daysUntil < 0;
  });
  const expiringSoonCustomers = latestCustomers.filter((customer) => {
    const daysUntil = getDaysUntilDate(customer.popbillCertExpireDate);
    return daysUntil !== null && daysUntil >= 0 && daysUntil <= 30;
  });

  const nextSettings: Parameters<AppStore["updateSettings"]>[0] = {
    certLastCheckedAt: checkedAt
  };

  let notificationStatus: NotificationStatus = "not-needed";
  let notificationMessage = "만료 또는 만료 예정 고객이 없어 알림을 보내지 않았습니다.";

  if (expiredCustomers.length > 0 || expiringSoonCustomers.length > 0) {
    if (sameKstDay(settings.certAlertLastSentAt, checkedAt)) {
      notificationStatus = "skipped-already-sent-today";
      notificationMessage = "오늘은 이미 인증서 만료 알림을 발송했습니다.";
    } else {
      const sent = await sendNotification(
        settings,
        `[AUTO-TAX] 인증서 만료 점검 ${expiredCustomers.length > 0 ? "경고" : "예정"} 안내`,
        buildNotificationBody(expiredCustomers, expiringSoonCustomers, checkedAt)
      );

      if (sent) {
        notificationStatus = "sent";
        notificationMessage = "운영자 알림 메일을 발송했습니다.";
        nextSettings.certAlertLastSentAt = checkedAt;
      } else {
        notificationStatus = "skipped-no-target";
        notificationMessage = "알림 수신 메일 또는 SMTP 설정이 없어 메일을 보내지 못했습니다.";
      }
    }
  }

  await store.updateSettings(nextSettings);
  await store.createLog("info", "popbill", "인증서 일괄 점검을 완료했습니다.", {
    checked: joinedCustomers.length,
    updated: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    expired: expiredCustomers.length,
    expiringSoon: expiringSoonCustomers.length,
    notificationStatus
  });

  return {
    checkedAt,
    checked: joinedCustomers.length,
    updated: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    expired: expiredCustomers.length,
    expiringSoon: expiringSoonCustomers.length,
    notificationStatus,
    notificationMessage,
    results
  };
}
