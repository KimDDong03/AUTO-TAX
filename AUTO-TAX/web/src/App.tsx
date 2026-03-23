import type React from "react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { AppSettings, Customer, DashboardPayload } from "./types";

type TabId = "overview" | "customers" | "review" | "settings";

type CustomerFormState = {
  id: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  ceoName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  popbillUserId: string;
  popbillPassword: string;
  memo: string;
  plantNamesText: string;
};

type SettingsFormState = {
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFromName: string;
  smtpFromEmail: string;
  notificationEmailsText: string;
  defaultIssueDay: string;
  defaultIssueHour: string;
  defaultIssueMinute: string;
  mailPollMinutes: string;
  timezone: string;
  popbillLinkId: string;
  popbillSecretKey: string;
  popbillIsTest: boolean;
  popbillUserIdPrefix: string;
  popbillSharedPassword: string;
  operatorContactName: string;
  operatorContactEmail: string;
  operatorContactTel: string;
  schedulerEnabled: boolean;
};

type StorageInfo = {
  databaseFile: string;
  backupDir: string;
  backups: Array<{
    fileName: string;
    sizeBytes: number;
    modifiedAt: string;
  }>;
};

const baseCustomerForm: CustomerFormState = {
  id: null,
  customerName: "",
  businessNumber: "",
  corpName: "",
  ceoName: "",
  addr: "",
  bizType: "",
  bizClass: "",
  popbillUserId: "",
  popbillPassword: "",
  memo: "",
  plantNamesText: ""
};

function createCustomerFormDefaults(): CustomerFormState {
  return {
    ...baseCustomerForm
  };
}

function isPristineCustomerForm(form: CustomerFormState): boolean {
  return (
    form.id === null &&
    form.customerName === "" &&
    form.businessNumber === "" &&
    form.corpName === "" &&
    form.ceoName === "" &&
    form.addr === "" &&
    form.bizType === "" &&
    form.bizClass === "" &&
    form.memo === "" &&
    form.plantNamesText === ""
  );
}

function customerToForm(customer?: Customer | null): CustomerFormState {
  if (!customer) return createCustomerFormDefaults();
  return {
    id: customer.id,
    customerName: customer.customerName,
    businessNumber: customer.businessNumber,
    corpName: customer.corpName,
    ceoName: customer.ceoName,
    addr: customer.addr,
    bizType: customer.bizType,
    bizClass: customer.bizClass,
    popbillUserId: customer.popbillUserId,
    popbillPassword: customer.popbillPassword,
    memo: customer.memo,
    plantNamesText: customer.plantNames.join("\n")
  };
}

function settingsToForm(settings: AppSettings): SettingsFormState {
  return {
    imapHost: settings.imapHost,
    imapPort: String(settings.imapPort),
    imapSecure: settings.imapSecure,
    imapUser: settings.imapUser,
    imapPass: settings.imapPass,
    imapMailbox: settings.imapMailbox,
    smtpHost: settings.smtpHost,
    smtpPort: String(settings.smtpPort),
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser,
    smtpPass: settings.smtpPass,
    smtpFromName: settings.smtpFromName,
    smtpFromEmail: settings.smtpFromEmail,
    notificationEmailsText: settings.notificationEmails.join("\n"),
    defaultIssueDay: String(settings.defaultIssueDay),
    defaultIssueHour: String(settings.defaultIssueHour),
    defaultIssueMinute: String(settings.defaultIssueMinute),
    mailPollMinutes: String(settings.mailPollMinutes),
    timezone: settings.timezone,
    popbillLinkId: settings.popbillLinkId,
    popbillSecretKey: settings.popbillSecretKey,
    popbillIsTest: settings.popbillIsTest,
    popbillUserIdPrefix: settings.popbillUserIdPrefix,
    popbillSharedPassword: settings.popbillSharedPassword,
    operatorContactName: settings.operatorContactName,
    operatorContactEmail: settings.operatorContactEmail,
    operatorContactTel: settings.operatorContactTel,
    schedulerEnabled: settings.schedulerEnabled
  };
}

function Icon(props: { name: string; className?: string }) {
  const glyphs: Record<string, string> = {
    dashboard: "DS",
    group: "CU",
    review: "TX",
    settings: "SY",
    issue: "IS",
    unmatched: "ML",
    cert: "CT",
    complete: "OK",
    refresh: "↻",
    sync: "⇄"
  };

  return <span className={props.className ? `glyph ${props.className}` : "glyph"}>{glyphs[props.name] ?? props.name.slice(0, 2).toUpperCase()}</span>;
}

function getStatIcon(label: string): string {
  if (label.includes("고객")) return "group";
  if (label.includes("발행 대상")) return "issue";
  if (label.includes("발행 완료")) return "complete";
  if (label.includes("실패")) return "review";
  if (label.includes("미매칭")) return "unmatched";
  return "dashboard";
}

function StatCard(props: { label: string; value: number; tone?: "default" | "warn" | "error" }) {
  return (
    <div className={`stat-card stat-${props.tone ?? "default"}`}>
      <div className="stat-card-head">
        <span>{props.label}</span>
        <Icon name={getStatIcon(props.label)} className="stat-card-icon" />
      </div>
      <strong>{props.value}</strong>
    </div>
  );
}

function getDraftStatusLabel(status: string): string {
  switch (status) {
    case "review":
      return "검수 대기";
    case "failed":
      return "발행 실패";
    case "issuing":
      return "발행 중";
    case "issued":
      return "발행 완료";
    default:
      return status;
  }
}

function getParseStatusLabel(status: string): string {
  switch (status) {
    case "parsed":
      return "매칭 완료";
    case "unmatched":
      return "고객 미매칭";
    case "failed":
      return "파싱 실패";
    case "pending":
      return "처리 대기";
    default:
      return status;
  }
}

function getPopbillStateLabel(state: string): string {
  switch (state) {
    case "joined":
      return "팝빌 가입 완료";
    case "pending":
      return "가입 전";
    case "failed":
      return "연동 실패";
    default:
      return state;
  }
}

function Panel(props: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={props.className ? `panel ${props.className}` : "panel"}>
      <header className="panel-header">
        <div>
          <h2>{props.title}</h2>
          {props.subtitle ? <p>{props.subtitle}</p> : null}
        </div>
        {props.actions ? <div className="panel-actions">{props.actions}</div> : null}
      </header>
      {props.children}
    </section>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function formatCertificateExpireDate(value: string | null): string {
  if (!value) return "-";

  const compact = value.replace(/\D/g, "");
  if (compact.length === 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("ko-KR");
  }

  return value;
}

function formatNotificationStatus(status: string, message: string): string {
  switch (status) {
    case "sent":
      return `${message}`;
    case "skipped-already-sent-today":
      return `${message}`;
    case "skipped-no-target":
      return `${message}`;
    default:
      return message;
  }
}

function getCustomerIssueReadiness(customer: Customer): {
  canIssueNow: boolean;
  label: string;
  tone: "success" | "warn" | "danger";
  reason: string;
} {
  const days = getDaysUntilDate(customer.popbillCertExpireDate);

  if (customer.popbillState !== "joined") {
    return {
      canIssueNow: false,
      label: "발행 준비 필요",
      tone: "danger",
      reason: "팝빌 가입 필요"
    };
  }

  if (!customer.popbillCertRegistered) {
    return {
      canIssueNow: false,
      label: "발행 준비 필요",
      tone: "danger",
      reason: "인증서 등록 필요"
    };
  }

  if (days !== null && days < 0) {
    return {
      canIssueNow: false,
      label: "발행 준비 필요",
      tone: "danger",
      reason: "인증서 만료"
    };
  }

  if (days !== null && days <= 30) {
    return {
      canIssueNow: true,
      label: "즉시 발행 가능",
      tone: "warn",
      reason: `인증서 만료 ${days}일 전`
    };
  }

  return {
    canIssueNow: true,
    label: "즉시 발행 가능",
    tone: "success",
    reason: "발행 조건 충족"
  };
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

function summarizePopbillInfo(payload: Record<string, unknown>): string {
  const lines = [
    `상태코드: ${payload.stateCode ?? "-"}`,
    `발행일시: ${payload.issueDT ?? "-"}`,
    `작성일자: ${payload.writeDate ?? "-"}`,
    `관리번호: ${payload.invoicerMgtKey ?? "-"}`,
    `국세청 승인번호: ${payload.ntsconfirmNum ?? "-"}`,
    `공급가액: ${payload.supplyCostTotal ?? "-"}`,
    `세액: ${payload.taxTotal ?? "-"}`,
    `발행형태: ${payload.purposeType ?? "-"}`,
    `공급받는자: ${payload.invoiceeCorpName ?? "-"}`
  ];
  return lines.join("\n");
}

function applyGmailDefaults(setter: React.Dispatch<React.SetStateAction<SettingsFormState | null>>) {
  setter((prev) =>
    prev
      ? {
          ...prev,
          imapHost: "imap.gmail.com",
          imapPort: "993",
          imapSecure: true,
          imapMailbox: "INBOX",
          smtpHost: "smtp.gmail.com",
          smtpPort: "465",
          smtpSecure: true
        }
      : prev
  );
}

function withGmailSettings(form: SettingsFormState) {
  return {
    ...form,
    imapHost: "imap.gmail.com",
    imapPort: "993",
    imapSecure: true,
    imapMailbox: form.imapMailbox || "INBOX",
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    smtpSecure: true
  };
}

export function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    return hash === "customers" || hash === "review" || hash === "settings" || hash === "overview" ? hash : "overview";
  });
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormDefaults());
  const [settingsForm, setSettingsForm] = useState<SettingsFormState | null>(null);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    const [payload, nextStorageInfo] = await Promise.all([
      api<DashboardPayload>("/api/bootstrap"),
      api<StorageInfo>("/api/system/storage")
    ]);
    const nextSettingsForm = settingsToForm(payload.settings);
    setData(payload);
    setStorageInfo(nextStorageInfo);
    setSettingsForm(nextSettingsForm);
    setCustomerForm((prev) => {
      if (prev.id) {
        const current = payload.customers.find((customer) => customer.id === prev.id);
        return customerToForm(current);
      }

      if (isPristineCustomerForm(prev)) {
        return createCustomerFormDefaults();
      }

      return prev;
    });
  };

  const loadWithRetry = async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await load();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("초기 데이터를 불러오지 못했습니다.");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw lastError ?? new Error("초기 데이터를 불러오지 못했습니다.");
  };

  useEffect(() => {
    void loadWithRetry().catch((loadError: Error) => setError(loadError.message));
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "customers" || hash === "review" || hash === "settings" || hash === "overview") {
        setActiveTab(hash);
      }
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, "", `#${activeTab}`);
    }
  }, [activeTab]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    try {
      setError("");
      setBusyKey(key);
      await action();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "작업에 실패했습니다.");
    } finally {
      setBusyKey(null);
    }
  };

  const saveCustomer = async () => {
    const payload = {
      customerName: customerForm.customerName,
      businessNumber: customerForm.businessNumber,
      corpName: customerForm.corpName,
      ceoName: customerForm.ceoName,
      addr: customerForm.addr,
      bizType: customerForm.bizType,
      bizClass: customerForm.bizClass,
      memo: customerForm.memo,
      plantNames: customerForm.plantNamesText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      matchAddresses: customerForm.addr.trim() ? [customerForm.addr.trim()] : []
    };

    if (customerForm.id) {
      await api(`/api/customers/${customerForm.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await api("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    setCustomerForm(createCustomerFormDefaults());
  };

  const saveSettings = async () => {
    if (!settingsForm) return;
    const normalized = withGmailSettings(settingsForm);
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        imapHost: normalized.imapHost,
        imapPort: Number(normalized.imapPort),
        imapSecure: normalized.imapSecure,
        imapUser: normalized.imapUser,
        imapPass: normalized.imapPass,
        imapMailbox: normalized.imapMailbox,
        smtpHost: normalized.smtpHost,
        smtpPort: Number(normalized.smtpPort),
        smtpSecure: normalized.smtpSecure,
        smtpUser: normalized.smtpUser,
        smtpPass: normalized.smtpPass,
        smtpFromName: normalized.smtpFromName,
        smtpFromEmail: normalized.smtpFromEmail,
        notificationEmails: normalized.notificationEmailsText
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        defaultIssueDay: Number(normalized.defaultIssueDay),
        defaultIssueHour: Number(normalized.defaultIssueHour),
        defaultIssueMinute: Number(normalized.defaultIssueMinute),
        mailPollMinutes: Number(normalized.mailPollMinutes),
        timezone: normalized.timezone,
        popbillLinkId: normalized.popbillLinkId,
        popbillSecretKey: normalized.popbillSecretKey,
        popbillIsTest: normalized.popbillIsTest,
        popbillUserIdPrefix: normalized.popbillUserIdPrefix,
        popbillSharedPassword: normalized.popbillSharedPassword,
        operatorContactName: normalized.operatorContactName,
        operatorContactEmail: normalized.operatorContactEmail,
        operatorContactTel: normalized.operatorContactTel,
        schedulerEnabled: normalized.schedulerEnabled
      })
    });
  };

  const testMailSettings = async () => {
    if (!settingsForm) return;
    const normalized = withGmailSettings(settingsForm);
    const result = await api<{
      imapOk: boolean;
      imapMessage: string;
      smtpOk: boolean;
      smtpMessage: string;
      testMailSent: boolean;
    }>("/api/system/mail-test", {
      method: "POST",
      body: JSON.stringify({
        imapHost: normalized.imapHost,
        imapPort: Number(normalized.imapPort),
        imapSecure: normalized.imapSecure,
        imapUser: normalized.imapUser,
        imapPass: normalized.imapPass,
        imapMailbox: normalized.imapMailbox,
        smtpHost: normalized.smtpHost,
        smtpPort: Number(normalized.smtpPort),
        smtpSecure: normalized.smtpSecure,
        smtpUser: normalized.smtpUser,
        smtpPass: normalized.smtpPass,
        smtpFromName: normalized.smtpFromName,
        smtpFromEmail: normalized.smtpFromEmail,
        notificationEmails: normalized.notificationEmailsText
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
      })
    });

    window.alert(
      `Gmail 연결 테스트 결과\nIMAP: ${result.imapOk ? "성공" : "실패"}\n${result.imapMessage}\n\nSMTP: ${result.smtpOk ? "성공" : "실패"}\n${result.smtpMessage}\n\n테스트 메일 발송: ${result.testMailSent ? "예" : "아니오"}`
    );
  };

  const createDatabaseBackup = async () => {
    const result = await api<{ fileName: string; destinationFile: string }>("/api/system/database/backup", {
      method: "POST"
    });
    window.alert(`백업을 생성했습니다.\n파일: ${result.fileName}\n경로: ${result.destinationFile}`);
  };

  const restoreDatabaseBackup = async (fileName: string) => {
    const confirmed = window.confirm(`백업 파일 ${fileName}으로 현재 데이터를 복원합니다.\n현재 데이터는 덮어써집니다.\n계속할까요?`);
    if (!confirmed) return;

    await api("/api/system/database/restore", {
      method: "POST",
      body: JSON.stringify({ fileName })
    });

    window.alert(`백업 복원이 완료되었습니다.\n복원 파일: ${fileName}`);
  };

  const resetPopbillLink = async (customer: Customer) => {
    const confirmed = window.confirm(
      `${customer.customerName} 고객의 팝빌 로컬 연결 상태를 초기화합니다.\n팝빌 실제 계정은 삭제되지 않고, 앱 상태만 pending/인증전으로 돌아갑니다.`
    );
    if (!confirmed) return;

    await api(`/api/customers/${customer.id}/popbill/reset`, {
      method: "POST"
    });
  };

  const deleteCustomer = async (customer: Customer) => {
    const confirmed = window.confirm(
      `${customer.customerName} 고객을 삭제합니다.\n관련된 로컬 메일 매칭/발행초안도 같이 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;

    await api(`/api/customers/${customer.id}`, {
      method: "DELETE"
    });

    setCustomerForm((prev) => (prev.id === customer.id ? createCustomerFormDefaults() : prev));
  };

  const quitPopbillMember = async (customer: Customer) => {
    const confirmed = window.confirm(
      `${customer.customerName} 고객을 팝빌 테스트 서버에서 탈퇴시킵니다.\n이 작업은 팝빌 테스트 환경의 연동회원 자체를 제거합니다.\n계속할까요?`
    );
    if (!confirmed) return;

    await api(`/api/customers/${customer.id}/popbill/quit`, {
      method: "POST"
    });
  };

  const showDraftPopbillInfo = async (draftId: number) => {
    const info = await api<Record<string, unknown>>(`/api/drafts/${draftId}/popbill/info`);
    window.alert(summarizePopbillInfo(info));
  };

  const openDraftPopbillUrl = async (draftId: number, type: "view-url" | "print-url") => {
    const result = await api<{ url: string }>(`/api/drafts/${draftId}/popbill/${type}`);
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const issueAllReviewDrafts = async () => {
    const targets = data?.drafts.filter((draft) => draft.status === "review" || draft.status === "failed") ?? [];
    if (targets.length === 0) {
      window.alert("발행할 검수 대기/실패 건이 없습니다.");
      return;
    }

    const confirmed = window.confirm(`검수 대기/실패 ${targets.length}건을 전체 발행합니다.\n계속할까요?`);
    if (!confirmed) return;

    const result = await api<{ total: number; issued: number; failed: number }>("/api/drafts/issue-all", {
      method: "POST"
    });
    window.alert(`전체 발행 완료\n대상: ${result.total}건\n성공: ${result.issued}건\n실패: ${result.failed}건`);
  };

  const refreshAllCertificateStatuses = async () => {
    const result = await api<{
      checked: number;
      updated: number;
      failed: number;
      expired: number;
      expiringSoon: number;
      notificationStatus: string;
      notificationMessage: string;
    }>("/api/popbill/cert-status/refresh-all", {
      method: "POST"
    });

    window.alert(
      `인증서 일괄 점검 완료\n점검 대상: ${result.checked}건\n갱신 성공: ${result.updated}건\n조회 실패: ${result.failed}건\n만료: ${result.expired}건\n30일 이내 만료 예정: ${result.expiringSoon}건\n알림: ${formatNotificationStatus(result.notificationStatus, result.notificationMessage)}`
    );
  };

  const cancelIssuedDraft = async (draftId: number) => {
    const confirmed = window.confirm(
      "이 발행 건을 취소하고 검수 대기로 되돌립니다.\n취소 후에는 같은 건을 다시 발행할 수 있습니다.\n계속할까요?"
    );
    if (!confirmed) return;

    await api(`/api/drafts/${draftId}/cancel`, {
      method: "POST"
    });
  };

  const reprocessInboxMessage = async (messageId: number) => {
    await api(`/api/inbox/${messageId}/reprocess`, {
      method: "POST"
    });
  };

  const reprocessAllUnmatchedMessages = async () => {
    const targets = data?.inbox.filter((message) => message.parseStatus === "unmatched" || message.parseStatus === "failed") ?? [];
    if (targets.length === 0) {
      window.alert("재처리할 미매칭/실패 메일이 없습니다.");
      return;
    }

    const confirmed = window.confirm(`미매칭/실패 메일 ${targets.length}건을 다시 처리합니다.\n계속할까요?`);
    if (!confirmed) return;

    let success = 0;
    let stillPending = 0;

    for (const message of targets) {
      const result = await api<{ status: string }>(`/api/inbox/${message.id}/reprocess`, {
        method: "POST"
      });
      if (result.status === "parsed") {
        success += 1;
      } else {
        stillPending += 1;
      }
    }

    window.alert(`메일 재처리 완료\n성공: ${success}건\n미매칭/실패 유지: ${stillPending}건`);
  };

  if (!data || !settingsForm) {
    return <div className="loading-shell">AUTO-TAX 초기 데이터를 불러오는 중입니다.</div>;
  }

  const reviewDrafts = data.drafts.filter((draft) => draft.status === "review" || draft.status === "failed" || draft.status === "issuing");
  const issuedDrafts = data.drafts.filter((draft) => draft.status === "issued");
  const expiredCertCustomers = data.customers.filter((customer) => {
    const days = getDaysUntilDate(customer.popbillCertExpireDate);
    return days !== null && days < 0;
  });
  const issueReadyCustomers = data.customers.filter((customer) => getCustomerIssueReadiness(customer).canIssueNow);
  const issueBlockedCustomers = data.customers.filter((customer) => !getCustomerIssueReadiness(customer).canIssueNow);
  const expiringSoonCustomers = data.customers.filter((customer) => {
    const days = getDaysUntilDate(customer.popbillCertExpireDate);
    return days !== null && days >= 0 && days <= 30;
  });
  const settingsHealth = {
    gmailReady: Boolean(data.settings.imapUser && data.settings.imapPass && data.settings.smtpUser && data.settings.smtpPass),
    popbillReady: Boolean(data.settings.popbillLinkId && data.settings.popbillSecretKey),
    operatorReady: Boolean(data.settings.operatorContactName && data.settings.operatorContactEmail && data.settings.operatorContactTel)
  };
  const navItems: Array<{ id: TabId; label: string; meta: string; icon: string }> = [
    { id: "overview", label: "대시보드", meta: "전체 현황", icon: "dashboard" },
    { id: "customers", label: "고객관리", meta: `${data.counts.customers}곳`, icon: "group" },
    { id: "review", label: "검수/발행", meta: `${data.counts.actionableDrafts}건 대기`, icon: "review" },
    { id: "settings", label: "시스템설정", meta: `${storageInfo?.backups.length ?? 0}개 백업`, icon: "settings" }
  ];
  const tabCopy: Record<TabId, { kicker: string; title: string; description: string; notes: string[] }> = {
    overview: {
      kicker: "Situation Room",
      title: "오늘의 운영 흐름",
      description: "발행 대기, 미매칭 메일, 인증서 주의를 한 번에 보고 우선순위를 잡습니다.",
      notes: [`발행 대상 ${data.counts.actionableDrafts}건`, `미매칭 ${data.counts.unmatchedMessages}건`]
    },
    customers: {
      kicker: "Customer Registry",
      title: "고객 정보와 인증서 상태",
      description: "고객 기본정보, 발전소명, 팝빌 연결 상태를 관리합니다.",
      notes: [`고객 ${data.counts.customers}곳`, `만료 주의 ${expiredCertCustomers.length + expiringSoonCustomers.length}건`]
    },
    review: {
      kicker: "Billing Desk",
      title: "검수와 발행 처리",
      description: "발행 대기건 확인, 일괄 발행, 발행 완료 문서 확인을 한 화면에서 처리합니다.",
      notes: [`대기/실패 ${reviewDrafts.length}건`, `발행 완료 ${issuedDrafts.length}건`]
    },
    settings: {
      kicker: "System Control",
      title: "연동 설정과 데이터 관리",
      description: "Gmail, 팝빌, 백업/복원, 운영자 연락처를 정리합니다.",
      notes: [`백업 ${storageInfo?.backups.length ?? 0}개`, `알림 메일 ${data.settings.notificationEmails.length}개`]
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">AT</span>
          <div>
            <h1>AUTO-TAX</h1>
            <p>한전 메일 기반 전자세금계산서 자동화</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={activeTab === item.id ? "nav-button active" : "nav-button"}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon name={item.icon} className="nav-icon" />
              <div className="nav-copy">
                <span className="nav-title">{item.label}</span>
                <span className="nav-meta">{item.meta}</span>
              </div>
            </button>
          ))}
        </nav>

        <div className="sidebar-meta">
          <span>{data.settings.popbillIsTest ? "팝빌 테스트" : "팝빌 운영"}</span>
          <span>수동 발행 모드</span>
        </div>
      </aside>

      <main className="content">
        <header className="hero">
          <div>
            <span className="eyebrow">Solar Billing Automation</span>
            <h2>메일 수집, 고객 매칭, 검수, 발행을 한 화면에서 관리합니다.</h2>
            <div className="hero-summary">
              <span className="hero-pill">{data.settings.popbillIsTest ? "팝빌 테스트" : "팝빌 운영"}</span>
              <span className="hero-pill">발행 대상 {data.counts.actionableDrafts}건</span>
              <span className="hero-pill">미매칭 메일 {data.counts.unmatchedMessages}건</span>
              <span className={`hero-pill ${expiredCertCustomers.length > 0 ? "hero-pill-danger" : expiringSoonCustomers.length > 0 ? "hero-pill-warn" : ""}`}>
                인증서 주의 {expiredCertCustomers.length + expiringSoonCustomers.length}건
              </span>
            </div>
          </div>
          <div className="hero-actions">
            <button className="btn-secondary" onClick={() => void runAction("refresh", load)} disabled={busyKey !== null}>
              <Icon name="refresh" className="button-icon" />
              새로고침
            </button>
            <button onClick={() => void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })))} disabled={busyKey !== null}>
              <Icon name="sync" className="button-icon" />
              메일 즉시 동기화
            </button>
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}
        {expiredCertCustomers.length > 0 ? (
          <div className="alert error">
            인증서 만료 고객 {expiredCertCustomers.length}건: {expiredCertCustomers.map((customer) => customer.customerName).join(", ")}
          </div>
        ) : null}
        {expiringSoonCustomers.length > 0 ? (
          <div className="alert warn">
            인증서 만료 예정 30일 이내 {expiringSoonCustomers.length}건: {expiringSoonCustomers
              .map((customer) => `${customer.customerName}(${formatCertificateExpireDate(customer.popbillCertExpireDate)})`)
              .join(", ")}
          </div>
        ) : null}

        <section className="stats-grid">
          <StatCard label="고객 수" value={data.counts.customers} />
          <StatCard label="발행 대상" value={data.counts.actionableDrafts} tone="warn" />
          <StatCard label="발행 완료" value={issuedDrafts.length} />
          <StatCard label="실패 건" value={data.counts.failedDrafts} tone="error" />
          <StatCard label="고객 미매칭" value={data.counts.unmatchedMessages} tone="warn" />
        </section>

        <section className="workspace-bar">
          <div>
            <span className="workspace-kicker">{tabCopy[activeTab].kicker}</span>
            <h3>{tabCopy[activeTab].title}</h3>
            <p>{tabCopy[activeTab].description}</p>
          </div>
          <div className="workspace-notes">
            {tabCopy[activeTab].notes.map((note) => (
              <span key={note} className="workspace-note">
                {note}
              </span>
            ))}
          </div>
        </section>

        {activeTab === "overview" ? (
          <div className="overview-layout">
            <Panel
              className="panel-priority"
              title="지금 처리할 일"
              subtitle="운영자가 바로 손대야 하는 건만 먼저 모았습니다."
              actions={<button className="btn-secondary" onClick={() => setActiveTab("review")}>검수 화면으로</button>}
            >
              <div className="list">
                {reviewDrafts.slice(0, 6).map((draft) => (
                  <article key={draft.id} className="list-item">
                    <div>
                      <strong>{draft.customerName}</strong>
                      <p>{draft.itemName}</p>
                    </div>
                    <div className="list-meta">
                      <span>{formatMoney(draft.supplyCost)}원</span>
                      <em className={`status status-${draft.status}`}>{getDraftStatusLabel(draft.status)}</em>
                    </div>
                  </article>
                ))}
                {reviewDrafts.length === 0 ? <div className="empty">발행 대상 건이 없습니다.</div> : null}
              </div>
            </Panel>

            <Panel className="panel-mail" title="최근 메일" subtitle="메일 수집 결과에서 예외 건을 먼저 확인하세요.">
              <div className="list">
                {data.inbox.slice(0, 6).map((message) => (
                  <article key={message.id} className="list-item">
                    <div>
                      <strong>{message.subject}</strong>
                      <p>{message.parsedData?.plantName ?? message.fromAddress}</p>
                    </div>
                    <div className="list-meta">
                      <span>{formatDateTime(message.receivedAt)}</span>
                      <em className={`status status-${message.parseStatus}`}>{getParseStatusLabel(message.parseStatus)}</em>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel
              className="panel-cert"
              title="인증서 상태"
              subtitle="만료일을 갱신하고 운영자 알림 메일을 보낼 수 있습니다."
              actions={<button onClick={() => void runAction("cert-refresh-all", refreshAllCertificateStatuses)}>인증서 일괄 점검</button>}
            >
              <div className="info-grid">
                <div>
                  <span>최근 점검 시각</span>
                  <strong>{formatDateTime(data.settings.certLastCheckedAt)}</strong>
                </div>
                <div>
                  <span>최근 알림 발송</span>
                  <strong>{formatDateTime(data.settings.certAlertLastSentAt)}</strong>
                </div>
                <div>
                  <span>만료 고객</span>
                  <strong>{expiredCertCustomers.length}건</strong>
                </div>
                <div>
                  <span>30일 이내 만료 예정</span>
                  <strong>{expiringSoonCustomers.length}건</strong>
                </div>
              </div>
            </Panel>

            <Panel className="panel-readiness" title="운영 준비 상태" subtitle="실제 작업 전에 꼭 필요한 설정이 갖춰졌는지 빠르게 확인합니다.">
              <div className="info-grid">
                <div>
                  <span>Gmail 연결 정보</span>
                  <strong>{settingsHealth.gmailReady ? "입력 완료" : "미입력"}</strong>
                </div>
                <div>
                  <span>팝빌 연동 키</span>
                  <strong>{settingsHealth.popbillReady ? "입력 완료" : "미입력"}</strong>
                </div>
                <div>
                  <span>운영자 연락처</span>
                  <strong>{settingsHealth.operatorReady ? "입력 완료" : "미입력"}</strong>
                </div>
                <div>
                  <span>알림 메일</span>
                  <strong>{data.settings.notificationEmails.length}개</strong>
                </div>
              </div>
            </Panel>

            <Panel className="panel-logs" title="최근 로그" subtitle="메일, 팝빌, 시스템 이벤트 최근 6건입니다.">
              <div className="log-list">
                {data.logs.slice(0, 6).map((log) => (
                  <div key={log.id} className={`log-row log-${log.level}`}>
                    <strong>{log.scope}</strong>
                    <span>{log.message}</span>
                    <time>{formatDateTime(log.createdAt)}</time>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeTab === "customers" ? (
          <div className="customers-layout">
            <Panel
              className="panel-customer-list"
              title="고객 목록"
              subtitle="발전소명으로 고객을 매칭하고 인증서 상태를 관리합니다."
              actions={<button onClick={() => void runAction("customers-cert-refresh-all", refreshAllCertificateStatuses)}>인증서 일괄 점검</button>}
            >
              <div className="helper-box">
                <strong>발행 가능 고객 {issueReadyCustomers.length}곳</strong>
                <span>발행 준비 필요 고객 {issueBlockedCustomers.length}곳</span>
              </div>
              <div className="list">
                {data.customers.map((customer) => (
                  <article key={customer.id} className={`customer-card ${getCustomerIssueReadiness(customer).canIssueNow ? "customer-card-ready" : "customer-card-blocked"}`}>
                    <div className="customer-card-header">
                      <div>
                        <strong>{customer.customerName}</strong>
                        <p>{customer.plantNames.join(", ")}</p>
                      </div>
                      <div className="chip-row">
                        {(() => {
                          const readiness = getCustomerIssueReadiness(customer);
                          return <span className={`chip ${readiness.tone === "success" ? "chip-success" : readiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>{readiness.label}</span>;
                        })()}
                        <span className="chip">수동발행</span>
                        <span className="chip">{getPopbillStateLabel(customer.popbillState)}</span>
                        <span className="chip">{customer.popbillCertRegistered ? "인증완료" : "인증전"}</span>
                        {(() => {
                          const days = getDaysUntilDate(customer.popbillCertExpireDate);
                          if (days === null) return null;
                          if (days < 0) return <span className="chip chip-danger">인증서 만료</span>;
                          if (days <= 30) return <span className="chip chip-warn">만료 {days}일 전</span>;
                          return null;
                        })()}
                      </div>
                    </div>
                    <div className="customer-card-meta">
                      <p><strong>주소</strong> {customer.addr}</p>
                      <p><strong>팝빌 ID</strong> {customer.popbillUserId || "미생성"}</p>
                      <p><strong>인증서 만료일</strong> {formatCertificateExpireDate(customer.popbillCertExpireDate)}</p>
                      <p><strong>발행 상태</strong> {getCustomerIssueReadiness(customer).reason}</p>
                    </div>
                    <div className="button-row">
                      <button onClick={() => setCustomerForm(customerToForm(customer))}>수정</button>
                      <button
                        className="btn-secondary"
                        disabled={customer.popbillState === "joined"}
                        onClick={() => void runAction(`join-${customer.id}`, async () => void (await api(`/api/customers/${customer.id}/popbill/join`, { method: "POST" })))}
                      >
                        {customer.popbillState === "joined" ? "가입 완료" : "팝빌 가입"}
                      </button>
                      <button className="btn-secondary" onClick={() => void runAction(`reset-popbill-${customer.id}`, async () => void (await resetPopbillLink(customer)))}>연결 해제</button>
                      <button
                        className="btn-secondary"
                        disabled={!data.settings.popbillIsTest}
                        onClick={() => void runAction(`quit-popbill-${customer.id}`, async () => void (await quitPopbillMember(customer)))}
                      >
                        팝빌 탈퇴
                      </button>
                      <button
                        onClick={() =>
                          void runAction(`cert-url-${customer.id}`, async () => {
                            const result = await api<{ url: string }>(`/api/customers/${customer.id}/popbill/cert-url`, {
                              method: "POST"
                            });
                            window.open(result.url, "_blank", "noopener,noreferrer");
                          })
                        }
                      >
                        {customer.popbillCertRegistered ? "인증서 재등록" : "인증서 등록"}
                      </button>
                      <button className="btn-secondary" onClick={() => void runAction(`cert-status-${customer.id}`, async () => void (await api(`/api/customers/${customer.id}/popbill/cert-status`, { method: "POST" })))}>만료일 확인</button>
                      <button className="btn-danger" onClick={() => void runAction(`delete-customer-${customer.id}`, async () => void (await deleteCustomer(customer)))}>고객 삭제</button>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel
              className="panel-customer-editor"
              title={customerForm.id ? "고객 수정" : "고객 등록"}
              subtitle="사업자 정보와 발전소명 별칭을 관리하면 팝빌 계정은 규칙에 맞춰 자동으로 붙습니다."
              actions={customerForm.id ? <button onClick={() => setCustomerForm(createCustomerFormDefaults())}>새 고객</button> : null}
            >
              <div className="form-grid">
                <label>
                  고객명
                  <input value={customerForm.customerName} onChange={(event) => setCustomerForm((prev) => ({ ...prev, customerName: event.target.value }))} />
                </label>
                <label>
                  사업자번호
                  <input value={customerForm.businessNumber} onChange={(event) => setCustomerForm((prev) => ({ ...prev, businessNumber: event.target.value }))} />
                </label>
                <label>
                  상호
                  <input value={customerForm.corpName} onChange={(event) => setCustomerForm((prev) => ({ ...prev, corpName: event.target.value }))} />
                </label>
                <label>
                  대표자
                  <input value={customerForm.ceoName} onChange={(event) => setCustomerForm((prev) => ({ ...prev, ceoName: event.target.value }))} />
                </label>
                <label className="full">
                  주소
                  <input value={customerForm.addr} onChange={(event) => setCustomerForm((prev) => ({ ...prev, addr: event.target.value }))} />
                </label>
                <label>
                  업태
                  <input value={customerForm.bizType} onChange={(event) => setCustomerForm((prev) => ({ ...prev, bizType: event.target.value }))} />
                </label>
                <label>
                  업종
                  <input value={customerForm.bizClass} onChange={(event) => setCustomerForm((prev) => ({ ...prev, bizClass: event.target.value }))} />
                </label>
                <div className="helper-box full">
                  <strong>팝빌 계정은 자동 생성됩니다.</strong>
                  <span>신규 고객 저장 시 ID는 `{settingsForm.popbillUserIdPrefix || "HAE_"} + 고객번호` 형식으로 생성됩니다.</span>
                  <span>비밀번호는 시스템설정의 `팝빌 공통 비밀번호`를 사용합니다.</span>
                  <span>이미 생성된 고객 계정의 ID/비밀번호는 유지됩니다.</span>
                  <span>현재 고객 팝빌 ID: {customerForm.id ? customerForm.popbillUserId || "저장 후 생성" : "저장 후 자동 생성"}</span>
                </div>
                <div className="helper-box">
                  <strong>발행 방식은 검수 후 수동 발행으로 고정됩니다.</strong>
                  <span>메일을 불러온 뒤 검수 화면에서 개별 발행 또는 전체 발행을 실행합니다.</span>
                </div>
                <label className="full">
                  발전소명
                  <textarea
                    rows={4}
                    value={customerForm.plantNamesText}
                    onChange={(event) => setCustomerForm((prev) => ({ ...prev, plantNamesText: event.target.value }))}
                    placeholder={"한 줄에 하나씩 입력\n예: 이상택태양광"}
                  />
                </label>
                <label className="full">
                  메모
                  <textarea rows={3} value={customerForm.memo} onChange={(event) => setCustomerForm((prev) => ({ ...prev, memo: event.target.value }))} />
                </label>
              </div>
              <div className="button-row">
                <button onClick={() => void runAction("save-customer", saveCustomer)}>{customerForm.id ? "고객 저장" : "고객 등록"}</button>
              </div>
            </Panel>
          </div>
        ) : null}

        {activeTab === "review" ? (
          <div className="review-layout">
            <Panel
              className="panel-review-queue"
              title="검수 대기/실패 건"
              subtitle="운영자가 직접 발행하거나 실패 원인을 확인합니다."
              actions={<button onClick={() => void runAction("issue-all", issueAllReviewDrafts)}>표시 건 전체 발행</button>}
            >
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>고객</th>
                      <th>품목</th>
                      <th>공급가액</th>
                      <th>상태</th>
                      <th>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewDrafts.map((draft) => (
                      <tr key={draft.id}>
                        <td data-label="ID">{draft.id}</td>
                        <td data-label="고객">{draft.customerName}</td>
                        <td data-label="품목">{draft.itemName}</td>
                        <td data-label="공급가액">{formatMoney(draft.supplyCost)}원</td>
                        <td data-label="상태">
                          <span className={`status status-${draft.status}`}>{getDraftStatusLabel(draft.status)}</span>
                          {draft.issueError ? <p className="cell-error">{draft.issueError}</p> : null}
                        </td>
                        <td data-label="액션">
                          {draft.status === "issuing" ? (
                            <span className="status status-pending">발행 중</span>
                          ) : (
                            <button
                              disabled={busyKey !== null}
                              onClick={() => void runAction(`issue-${draft.id}`, async () => void (await api(`/api/drafts/${draft.id}/issue`, { method: "POST" })))}
                            >
                              지금 발행
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reviewDrafts.length === 0 ? <div className="empty">검수 또는 실패 건이 없습니다.</div> : null}
              </div>
            </Panel>

            <Panel className="panel-review-issued" title="발행 완료 건" subtitle="발행 결과와 팝빌 확인 링크를 봅니다.">
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>고객</th>
                      <th>발행시각</th>
                      <th>합계금액</th>
                      <th>상태</th>
                      <th>확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuedDrafts.map((draft) => (
                      <tr key={draft.id}>
                        <td data-label="ID">{draft.id}</td>
                        <td data-label="고객">{draft.customerName}</td>
                        <td data-label="발행시각">{formatDateTime(draft.issuedAt)}</td>
                        <td data-label="합계금액">{formatMoney(draft.totalAmount)}원</td>
                        <td data-label="상태">
                          <span className={`status status-${draft.status}`}>{getDraftStatusLabel(draft.status)}</span>
                        </td>
                        <td data-label="확인">
                          {draft.status === "issued" ? (
                            <div className="button-row">
                              <button className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction(`draft-info-${draft.id}`, async () => void (await showDraftPopbillInfo(draft.id)))}>상태조회</button>
                              <button className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction(`draft-view-${draft.id}`, async () => void (await openDraftPopbillUrl(draft.id, "view-url")))}>보기</button>
                              <button className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction(`draft-print-${draft.id}`, async () => void (await openDraftPopbillUrl(draft.id, "print-url")))}>인쇄</button>
                              <button className="btn-danger" disabled={busyKey !== null} onClick={() => void runAction(`draft-cancel-${draft.id}`, async () => void (await cancelIssuedDraft(draft.id)))}>발행 취소</button>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {issuedDrafts.length === 0 ? <div className="empty">발행 완료 건이 없습니다.</div> : null}
              </div>
            </Panel>

            <Panel
              className="panel-review-mail"
              title="최근 수신 메일"
              subtitle="발전소명, 정산월, 공급가액 파싱 결과를 확인합니다."
              actions={<button onClick={() => void runAction("reprocess-all-unmatched", reprocessAllUnmatchedMessages)}>미매칭 메일 재처리</button>}
            >
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>수신시각</th>
                      <th>제목</th>
                      <th>발전소명</th>
                      <th>주소</th>
                      <th>정산월</th>
                      <th>공급가액</th>
                      <th>상태</th>
                      <th>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inbox.map((message) => (
                      <tr key={message.id}>
                        <td data-label="수신시각">{formatDateTime(message.receivedAt)}</td>
                        <td data-label="제목">{message.subject}</td>
                        <td data-label="발전소명">{message.parsedData?.plantName ?? "-"}</td>
                        <td data-label="주소">{message.parsedData?.plantAddress ?? "-"}</td>
                        <td data-label="정산월">{message.parsedData?.billingMonth ?? "-"}</td>
                        <td data-label="공급가액">{message.parsedData ? `${formatMoney(message.parsedData.supplyCost)}원` : "-"}</td>
                        <td data-label="상태">
                          <span className={`status status-${message.parseStatus}`}>{getParseStatusLabel(message.parseStatus)}</span>
                          {message.parseError ? <p className="cell-error">{message.parseError}</p> : null}
                        </td>
                        <td data-label="액션">
                          {message.parseStatus === "unmatched" || message.parseStatus === "failed" ? (
                            <button onClick={() => void runAction(`reprocess-${message.id}`, async () => void (await reprocessInboxMessage(message.id)))}>
                              재처리
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel className="panel-review-logs" title="이벤트 로그" subtitle="서버, 메일 수집, 팝빌 처리 로그를 추적합니다.">
              <div className="log-list">
                {data.logs.map((log) => (
                  <div key={log.id} className={`log-row log-${log.level}`}>
                    <div>
                      <strong>{log.scope}</strong>
                      <span>{log.message}</span>
                    </div>
                    <time>{formatDateTime(log.createdAt)}</time>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <div className="settings-layout">
            <Panel
              className="panel-settings-mail"
              title="메일/알림 설정"
              subtitle="Gmail 기준으로 IMAP 수집과 SMTP 알림을 구성합니다."
              actions={
                <>
                  <button className="btn-secondary" onClick={() => applyGmailDefaults(setSettingsForm)}>Gmail 기본값 넣기</button>
                  <button onClick={() => void runAction("mail-test", testMailSettings)}>Gmail 연결 테스트</button>
                </>
              }
            >
              <div className="helper-box">
                <strong>Gmail 전용 기본값이 자동 적용됩니다.</strong>
                <span>IMAP `imap.gmail.com:993`, SMTP `smtp.gmail.com:465`, SSL 켬 상태로 저장됩니다.</span>
                <span>사용자는 Gmail 계정과 앱 비밀번호만 입력하면 됩니다.</span>
                <span>비밀번호는 Gmail 로그인 비밀번호가 아니라 2단계 인증 후 만든 앱 비밀번호를 넣는 것을 권장합니다.</span>
              </div>
              <div className="form-grid">
                <label>
                  IMAP 계정
                  <input
                    placeholder="example@gmail.com"
                    value={settingsForm.imapUser}
                    onChange={(event) => setSettingsForm((prev) => prev && { ...prev, imapUser: event.target.value })}
                  />
                </label>
                <label>
                  IMAP 비밀번호 / 앱 비밀번호
                  <input type="password" value={settingsForm.imapPass} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, imapPass: event.target.value })} />
                </label>
                <label>
                  메일함
                  <input
                    placeholder="INBOX"
                    value={settingsForm.imapMailbox}
                    onChange={(event) => setSettingsForm((prev) => prev && { ...prev, imapMailbox: event.target.value })}
                  />
                </label>
                <label>
                  SMTP 계정
                  <input
                    placeholder="example@gmail.com"
                    value={settingsForm.smtpUser}
                    onChange={(event) => setSettingsForm((prev) => prev && { ...prev, smtpUser: event.target.value })}
                  />
                </label>
                <label>
                  SMTP 비밀번호 / 앱 비밀번호
                  <input type="password" value={settingsForm.smtpPass} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, smtpPass: event.target.value })} />
                </label>
                <label>
                  발신자 이름
                  <input value={settingsForm.smtpFromName} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, smtpFromName: event.target.value })} />
                </label>
                <label>
                  발신 메일
                  <input
                    placeholder="example@gmail.com"
                    value={settingsForm.smtpFromEmail}
                    onChange={(event) => setSettingsForm((prev) => prev && { ...prev, smtpFromEmail: event.target.value })}
                  />
                </label>
                <label className="full">
                  알림 수신 메일
                  <textarea rows={4} value={settingsForm.notificationEmailsText} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, notificationEmailsText: event.target.value })} />
                </label>
              </div>
            </Panel>

            <Panel className="panel-settings-operator" title="운영 담당자" subtitle="고객별이 아니라 시스템 공통으로 쓰는 팝빌 가입용 연락처입니다.">
              <div className="form-grid">
                <label>
                  운영 담당자명
                  <input value={settingsForm.operatorContactName} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactName: event.target.value })} />
                </label>
                <label>
                  운영 담당자 이메일
                  <input value={settingsForm.operatorContactEmail} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactEmail: event.target.value })} />
                </label>
                <label>
                  운영 담당자 연락처
                  <input value={settingsForm.operatorContactTel} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactTel: event.target.value })} />
                </label>
              </div>
            </Panel>

            <Panel className="panel-settings-popbill" title="팝빌 설정" subtitle="팝빌 테스트/운영 전환과 계정 규칙을 관리합니다.">
              <div className="form-grid">
                <label>
                  팝빌 LinkID
                  <input value={settingsForm.popbillLinkId} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillLinkId: event.target.value })} />
                </label>
                <label>
                  팝빌 ID 접두어
                  <input value={settingsForm.popbillUserIdPrefix} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillUserIdPrefix: event.target.value })} />
                </label>
                <label className="full">
                  팝빌 SecretKey
                  <input type="password" value={settingsForm.popbillSecretKey} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillSecretKey: event.target.value })} />
                </label>
                <label className="full">
                  팝빌 공통 비밀번호
                  <input
                    type="password"
                    value={settingsForm.popbillSharedPassword}
                    onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillSharedPassword: event.target.value })}
                    placeholder="신규 고객 팝빌 계정에 공통으로 사용할 비밀번호"
                  />
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={settingsForm.popbillIsTest} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillIsTest: event.target.checked })} />
                  팝빌 테스트 모드
                </label>
                <div className="helper-box full">
                  <strong>팝빌 계정 규칙</strong>
                  <span>신규 고객을 저장하면 팝빌 ID는 접두어 + 고객번호 형식으로 자동 생성됩니다.</span>
                  <span>공통 비밀번호는 신규 고객 또는 아직 팝빌 비밀번호가 비어 있는 고객에만 적용됩니다.</span>
                </div>
              </div>
              <div className="button-row">
                <button onClick={() => void runAction("save-settings", saveSettings)}>설정 저장</button>
              </div>
            </Panel>

            <Panel
              className="panel-settings-backup"
              title="데이터 백업/복원"
              subtitle="설치본 기준 로컬 SQLite 데이터를 백업하고 필요 시 복원합니다."
              actions={<button className="btn-secondary" onClick={() => void runAction("db-backup", createDatabaseBackup)}>백업 생성</button>}
            >
              <div className="info-grid">
                <div className="full-width">
                  <span>현재 DB 경로</span>
                  <strong>{storageInfo?.databaseFile ?? "-"}</strong>
                </div>
                <div className="full-width">
                  <span>백업 폴더</span>
                  <strong>{storageInfo?.backupDir ?? "-"}</strong>
                </div>
              </div>
              <div className="helper-box">
                <strong>복원 전 주의</strong>
                <span>백업 복원 시 현재 로컬 데이터는 덮어써집니다.</span>
                <span>중요한 변경 후에는 먼저 새 백업을 만든 뒤 복원 작업을 진행하는 것이 안전합니다.</span>
              </div>
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>파일명</th>
                      <th>크기</th>
                      <th>수정시각</th>
                      <th>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(storageInfo?.backups ?? []).map((backup) => (
                      <tr key={backup.fileName}>
                        <td data-label="파일명">{backup.fileName}</td>
                        <td data-label="크기">{formatBytes(backup.sizeBytes)}</td>
                        <td data-label="수정시각">{formatDateTime(backup.modifiedAt)}</td>
                        <td data-label="액션">
                          <button className="btn-secondary" onClick={() => void runAction(`restore-backup-${backup.fileName}`, async () => void (await restoreDatabaseBackup(backup.fileName)))}>
                            이 백업으로 복원
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(storageInfo?.backups.length ?? 0) === 0 ? <div className="empty">생성된 백업 파일이 없습니다.</div> : null}
              </div>
            </Panel>
          </div>
        ) : null}
      </main>
    </div>
  );
}
