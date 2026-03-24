import type React from "react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { AppSettings, Customer, DashboardPayload, PartnerPointsPayload } from "./types";

type TabId = "work" | "customers" | "settings";
type SettingsSectionId = "gmail" | "popbill" | "operator" | "backup" | "logs";

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
  popbillPartnerCorpNum: string;
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
  bizType: "전기업",
  bizClass: "태양광발전(자가용PPA)",
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
    plantNamesText: customer.plantNames[0] ?? ""
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
    popbillPartnerCorpNum: settings.popbillPartnerCorpNum,
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

function SetupPanel(props: {
  step: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  note?: string;
}) {
  return (
    <section className={props.className ? `panel setup-panel ${props.className}` : "panel setup-panel"}>
      <header className="panel-header setup-panel-header">
        <div className="setup-panel-title">
          <span className="setup-order">{props.step}</span>
          <div>
            <h2>{props.title}</h2>
            {props.note ? <p>{props.note}</p> : null}
          </div>
        </div>
        <div className="panel-actions">
          <span className={`chip ${props.done ? "chip-success" : "chip-danger"}`}>{props.done ? "완료" : "설정 필요"}</span>
          {props.actions}
        </div>
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

function getCustomerPopbillSummary(customer: Customer): string {
  if (customer.popbillState === "joined") {
    return `팝빌 연결됨${customer.popbillUserId ? ` · ${customer.popbillUserId}` : ""}`;
  }

  if (customer.popbillState === "failed") {
    return "팝빌 연결 실패";
  }

  return "팝빌 가입 필요";
}

function getCustomerCertificateSummary(customer: Customer): string {
  if (!customer.popbillCertRegistered) {
    return "인증서 미등록";
  }

  const days = getDaysUntilDate(customer.popbillCertExpireDate);
  if (days !== null && days < 0) {
    return "인증서 만료";
  }

  if (days !== null && days <= 30) {
    return `인증서 ${days}일 남음`;
  }

  return `인증서 ${formatCertificateExpireDate(customer.popbillCertExpireDate)}`;
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
  const [partnerPoints, setPartnerPoints] = useState<PartnerPointsPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    return hash === "customers" || hash === "settings" || hash === "work" ? hash : "work";
  });
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormDefaults());
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [settingsForm, setSettingsForm] = useState<SettingsFormState | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("gmail");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    const [payload, nextStorageInfo, nextPartnerPoints] = await Promise.all([
      api<DashboardPayload>("/api/bootstrap"),
      api<StorageInfo>("/api/system/storage"),
      api<PartnerPointsPayload>("/api/popbill/partner-points")
    ]);
    const nextSettingsForm = settingsToForm(payload.settings);
    setData(payload);
    setStorageInfo(nextStorageInfo);
    setPartnerPoints(nextPartnerPoints);
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
      if (hash === "customers" || hash === "settings" || hash === "work") {
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

  useEffect(() => {
    if (!data || activeTab !== "customers" || creatingCustomer) return;
    if (customerForm.id !== null) return;
    if (!isPristineCustomerForm(customerForm)) return;
    if (data.customers.length === 0) return;
    setCustomerForm(customerToForm(data.customers[0]));
  }, [activeTab, creatingCustomer, customerForm, data]);

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
    const isEditing = customerForm.id !== null;
    const normalizedPlantName = customerForm.plantNamesText.trim();
    const payload = {
      customerName: customerForm.customerName,
      businessNumber: customerForm.businessNumber,
      corpName: customerForm.corpName,
      ceoName: customerForm.ceoName,
      addr: customerForm.addr,
      bizType: customerForm.bizType,
      bizClass: customerForm.bizClass,
      memo: customerForm.memo,
      plantNames: normalizedPlantName ? [normalizedPlantName] : [],
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

    if (isEditing) {
      setCreatingCustomer(false);
      return;
    }

    setCreatingCustomer(true);
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
        popbillPartnerCorpNum: normalized.popbillPartnerCorpNum,
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

  const openPartnerChargeUrl = async () => {
    const result = await api<{ url: string }>("/api/popbill/partner-charge-url");
    window.open(result.url, "_blank", "noopener,noreferrer");
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
  const expiringSoonCustomers = data.customers.filter((customer) => {
    const days = getDaysUntilDate(customer.popbillCertExpireDate);
    return days !== null && days >= 0 && days <= 30;
  });
  const settingsHealth = {
    gmailReady: Boolean(data.settings.imapUser && data.settings.imapPass && data.settings.smtpUser && data.settings.smtpPass),
    popbillReady: Boolean(data.settings.popbillLinkId && data.settings.popbillSecretKey),
    operatorReady: Boolean(data.settings.operatorContactName && data.settings.operatorContactEmail && data.settings.operatorContactTel)
  };
  const unmatchedMessages = data.inbox.filter((message) => message.parseStatus === "unmatched" || message.parseStatus === "failed");
  const recentInboxMessages = [...data.inbox]
    .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime())
    .slice(0, 6);
  const recentIssuedDrafts = issuedDrafts.slice(0, 8);
  const recentLogs = data.logs.slice(0, 8);
  const readyNowCustomers = data.customers.filter((customer) => getCustomerIssueReadiness(customer).canIssueNow);
  const blockedIssueCustomers = data.customers.filter((customer) => !getCustomerIssueReadiness(customer).canIssueNow);
  const workLayoutClassName = "work-layout";
  const selectedCustomer = customerForm.id ? data.customers.find((customer) => customer.id === customerForm.id) ?? null : null;
  const selectedCustomerReadiness = selectedCustomer ? getCustomerIssueReadiness(selectedCustomer) : null;
  const customerRegistrationReady = data.customers.length > 0;
  const readyCustomerCount = data.customers.filter((customer) => getCustomerIssueReadiness(customer).canIssueNow).length;
  const blockedCustomerCount = data.customers.length - readyCustomerCount;
  const setupChecklist = [
    { key: "gmail", label: "Gmail 계정 연결", done: settingsHealth.gmailReady },
    { key: "popbill", label: "팝빌 키 입력", done: settingsHealth.popbillReady },
    { key: "operator", label: "운영 담당자 입력", done: settingsHealth.operatorReady },
    { key: "customer", label: "고객 1명 이상 등록", done: customerRegistrationReady }
  ];
  const setupPendingCount = setupChecklist.filter((step) => !step.done).length;
  const certAttentionCount = expiredCertCustomers.length + expiringSoonCustomers.length;
  const recommendedSettingsSection: SettingsSectionId = !settingsHealth.gmailReady
    ? "gmail"
    : !settingsHealth.popbillReady
      ? "popbill"
      : !settingsHealth.operatorReady
        ? "operator"
        : "backup";
  const settingsSections: Array<{
    id: SettingsSectionId;
    step: number;
    title: string;
    done: boolean;
    summary: string;
  }> = [
    {
      id: "gmail",
      step: 1,
      title: "메일 연결",
      done: settingsHealth.gmailReady,
      summary: settingsHealth.gmailReady ? data.settings.imapUser || "Gmail 연결 완료" : "Gmail 계정과 앱 비밀번호 입력"
    },
    {
      id: "popbill",
      step: 2,
      title: "팝빌 연결",
      done: settingsHealth.popbillReady,
      summary: settingsHealth.popbillReady
        ? `${data.settings.popbillIsTest ? "테스트" : "운영"} · ${partnerPoints?.referenceCorpNum || "사업자번호 확인"}`
        : "LinkID, SecretKey, 파트너 사업자번호 입력"
    },
    {
      id: "operator",
      step: 3,
      title: "운영 담당자",
      done: settingsHealth.operatorReady,
      summary: settingsHealth.operatorReady ? `${data.settings.operatorContactName} · ${data.settings.operatorContactEmail}` : "담당자명, 이메일, 연락처 입력"
    },
    {
      id: "backup",
      step: 4,
      title: "데이터 백업",
      done: Boolean(storageInfo),
      summary: storageInfo ? `${storageInfo.backups.length}개 백업 파일` : "백업 폴더 확인"
    }
  ];
  const navItems: Array<{ id: TabId; label: string; icon: string }> = [
    { id: "work", label: "오늘 작업", icon: "dashboard" },
    { id: "customers", label: "고객관리", icon: "group" },
    { id: "settings", label: "시스템설정", icon: "settings" }
  ];
  const activeNavLabel = navItems.find((item) => item.id === activeTab)?.label ?? "AUTO-TAX";

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
              onClick={() => {
                setActiveTab(item.id);
                if (item.id === "settings") {
                  setActiveSettingsSection(recommendedSettingsSection);
                }
              }}
            >
              <Icon name={item.icon} className="nav-icon" />
              <div className="nav-copy">
                <span className="nav-title">{item.label}</span>
              </div>
            </button>
          ))}
        </nav>

        <div className="sidebar-meta">
          <span>{data.settings.popbillIsTest ? "테스트 환경" : "운영 환경"}</span>
        </div>
      </aside>

      <main className="content">
        <header className="hero">
          <div className="hero-main">
            <h2>{activeNavLabel}</h2>
            <div className="hero-summary">
              <span className="hero-pill">{data.settings.popbillIsTest ? "팝빌 테스트" : "팝빌 운영"}</span>
              <span className="hero-pill">파트너 {partnerPoints?.available && partnerPoints.partnerRemainPoint !== null ? `${formatMoney(partnerPoints.partnerRemainPoint)}P` : "-"}</span>
              {activeTab !== "settings" ? <span className="hero-pill">발행 대상 {data.counts.actionableDrafts}건</span> : null}
              {certAttentionCount > 0 ? <span className="hero-pill hero-pill-warn">인증서 주의 {certAttentionCount}건</span> : null}
            </div>
          </div>
          <div className="hero-actions">
            <button className="btn-secondary" onClick={() => void runAction("refresh", load)} disabled={busyKey !== null}>
              <Icon name="refresh" className="button-icon" />
              새로고침
            </button>
            {activeTab === "work" ? (
              <button onClick={() => void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })))} disabled={busyKey !== null}>
                <Icon name="sync" className="button-icon" />
                메일 즉시 동기화
              </button>
            ) : null}
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

        {activeTab === "work" ? (
          <div className={workLayoutClassName}>
            <section className="stats-grid stats-grid-compact">
              <StatCard label="발행 대상" value={reviewDrafts.length} tone={reviewDrafts.length > 0 ? "warn" : "default"} />
              <StatCard label="미매칭 메일" value={unmatchedMessages.length} tone={unmatchedMessages.length > 0 ? "warn" : "default"} />
              <StatCard label="인증서 주의" value={certAttentionCount} tone={certAttentionCount > 0 ? "error" : "default"} />
            </section>

            {setupPendingCount > 0 ? (
              <Panel
                className="panel-setup"
                title="처음 설정"
                actions={<button onClick={() => setActiveTab("settings")}>설정으로 이동</button>}
              >
                <div className="setup-list">
                  {setupChecklist.map((step, index) => (
                    <div key={step.key} className={step.done ? "setup-step done" : "setup-step"}>
                      <span className="setup-order">{index + 1}</span>
                      <div className="setup-copy">
                        <strong>{step.label}</strong>
                        <span>{step.done ? "완료됨" : "아직 설정되지 않았습니다."}</span>
                      </div>
                      <span className={`chip ${step.done ? "chip-success" : "chip-danger"}`}>{step.done ? "완료" : "필요"}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            <Panel
              className="panel-work-queue"
              title="발행할 건"
              actions={
                <>
                  <button className="btn-secondary" onClick={() => void runAction("sync-work", async () => void (await api("/api/mail/sync", { method: "POST" })))}>
                    메일 동기화
                  </button>
                  <button onClick={() => void runAction("issue-all", issueAllReviewDrafts)}>전체 발행</button>
                </>
              }
            >
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead>
                    <tr>
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
                            <button disabled={busyKey !== null} onClick={() => void runAction(`issue-${draft.id}`, async () => void (await api(`/api/drafts/${draft.id}/issue`, { method: "POST" })))}>
                              지금 발행
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reviewDrafts.length === 0 ? <div className="empty">지금 발행할 건이 없습니다.</div> : null}
              </div>
            </Panel>

            <Panel
              className="panel-work-status"
              title="작업 상태"
              actions={
                <>
                  <button className="btn-secondary" onClick={() => void runAction("partner-points-refresh-work", load)}>포인트 조회</button>
                  <button onClick={() => void runAction("cert-refresh-all", refreshAllCertificateStatuses)}>인증서 점검</button>
                </>
              }
            >
              <div className="info-grid">
                <div>
                  <span>Gmail</span>
                  <strong>{settingsHealth.gmailReady ? "준비됨" : "설정 필요"}</strong>
                </div>
                <div>
                  <span>팝빌</span>
                  <strong>{settingsHealth.popbillReady ? "준비됨" : "설정 필요"}</strong>
                </div>
                <div>
                  <span>운영자</span>
                  <strong>{settingsHealth.operatorReady ? "준비됨" : "설정 필요"}</strong>
                </div>
                <div>
                  <span>파트너 포인트</span>
                  <strong>{partnerPoints?.available && partnerPoints.partnerRemainPoint !== null ? `${formatMoney(partnerPoints.partnerRemainPoint)}P` : "-"}</strong>
                </div>
                <div>
                  <span>인증서 주의</span>
                  <strong>{certAttentionCount}건</strong>
                </div>
                <div>
                  <span>최근 점검</span>
                  <strong>{formatDateTime(data.settings.certLastCheckedAt)}</strong>
                </div>
              </div>
              <div className="helper-box">
                <strong>{partnerPoints?.isTest ? "테스트" : "운영"}</strong>
                <span>{partnerPoints?.message ?? "포인트 조회 전입니다."}</span>
              </div>
            </Panel>

            <Panel
              className="panel-work-readiness"
              title="고객 준비 상태"
              actions={<button className="btn-secondary" onClick={() => setActiveTab("customers")}>고객관리 열기</button>}
            >
              <div className="customer-list-summary">
                <span className="chip chip-success">즉시 발행 가능 {readyNowCustomers.length}명</span>
                <span className="chip chip-danger">준비 필요 {blockedIssueCustomers.length}명</span>
              </div>
              <div className="list">
                {blockedIssueCustomers.slice(0, 4).map((customer) => {
                  const readiness = getCustomerIssueReadiness(customer);
                  return (
                    <div key={customer.id} className="list-item">
                      <div>
                        <strong>{customer.customerName}</strong>
                        <p>{customer.addr}</p>
                      </div>
                      <div className="list-meta">
                        <span className={`chip ${readiness.tone === "success" ? "chip-success" : readiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>{readiness.reason}</span>
                      </div>
                    </div>
                  );
                })}
                {blockedIssueCustomers.length === 0 ? (
                  <div className="empty">모든 고객이 발행 가능한 상태입니다.</div>
                ) : null}
              </div>
            </Panel>

            <Panel
              className="panel-work-inbox"
              title="최근 수신 메일"
              actions={unmatchedMessages.length > 0 ? <button onClick={() => void runAction("reprocess-all-unmatched", reprocessAllUnmatchedMessages)}>미매칭 전체 재처리</button> : undefined}
            >
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>수신시각</th>
                      <th>발전소명</th>
                      <th>주소</th>
                      <th>상태</th>
                      <th>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInboxMessages.map((message) => (
                      <tr key={message.id}>
                        <td data-label="수신시각">{formatDateTime(message.receivedAt)}</td>
                        <td data-label="발전소명">{message.parsedData?.plantName ?? "-"}</td>
                        <td data-label="주소">{message.parsedData?.plantAddress ?? "-"}</td>
                        <td data-label="상태">
                          <span className={`status status-${message.parseStatus}`}>{getParseStatusLabel(message.parseStatus)}</span>
                          {message.parseError ? <p className="cell-error">{message.parseError}</p> : null}
                        </td>
                        <td data-label="액션">
                          {message.parseStatus === "unmatched" || message.parseStatus === "failed" ? (
                            <button onClick={() => void runAction(`reprocess-${message.id}`, async () => void (await reprocessInboxMessage(message.id)))}>재처리</button>
                          ) : (
                            <span className="status status-parsed">확인 완료</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recentInboxMessages.length === 0 ? <div className="empty">최근 수신 메일이 없습니다.</div> : null}
              </div>
            </Panel>

            <Panel className="panel-work-issued" title="최근 발행 완료">
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>고객</th>
                      <th>발행시각</th>
                      <th>합계금액</th>
                      <th>확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentIssuedDrafts.map((draft) => (
                      <tr key={draft.id}>
                        <td data-label="고객">{draft.customerName}</td>
                        <td data-label="발행시각">{formatDateTime(draft.issuedAt)}</td>
                        <td data-label="합계금액">{formatMoney(draft.totalAmount)}원</td>
                        <td data-label="확인">
                          <div className="button-row">
                            <button className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction(`draft-info-${draft.id}`, async () => void (await showDraftPopbillInfo(draft.id)))}>상태</button>
                            <button className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction(`draft-view-${draft.id}`, async () => void (await openDraftPopbillUrl(draft.id, "view-url")))}>보기</button>
                            <button className="btn-danger" disabled={busyKey !== null} onClick={() => void runAction(`draft-cancel-${draft.id}`, async () => void (await cancelIssuedDraft(draft.id)))}>취소</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recentIssuedDrafts.length === 0 ? <div className="empty">최근 발행 완료 이력이 없습니다.</div> : null}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeTab === "customers" ? (
          <div className="customers-layout">
            <Panel
              className="panel-customer-list"
              title="고객 목록"
              actions={
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setCreatingCustomer(true);
                      setCustomerForm(createCustomerFormDefaults());
                    }}
                  >
                    새 고객
                  </button>
                  <button onClick={() => void runAction("customers-cert-refresh-all", refreshAllCertificateStatuses)}>인증서 일괄 점검</button>
                </>
              }
            >
              <div className="customer-list-summary">
                <span className="chip chip-success">즉시 발행 가능 {readyCustomerCount}명</span>
                <span className="chip chip-danger">준비 필요 {blockedCustomerCount}명</span>
              </div>
              <div className="list">
                {data.customers.map((customer) => {
                  const readiness = getCustomerIssueReadiness(customer);
                  const isSelected = customerForm.id === customer.id;

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      className={`customer-summary ${isSelected ? "selected" : ""} ${readiness.canIssueNow ? "customer-summary-ready" : "customer-summary-blocked"}`}
                      onClick={() => {
                        setCreatingCustomer(false);
                        setCustomerForm(customerToForm(customer));
                      }}
                    >
                      <div className="customer-summary-head">
                        <div>
                          <strong>{customer.customerName}</strong>
                          <p>{customer.plantNames.join(", ")}</p>
                        </div>
                        <span className={`chip ${readiness.tone === "success" ? "chip-success" : readiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>{readiness.label}</span>
                      </div>
                      <div className="customer-summary-meta">
                        <span>{customer.addr}</span>
                        <span>{getCustomerCertificateSummary(customer)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel
              className="panel-customer-editor"
              title={selectedCustomer ? `${selectedCustomer.customerName}` : "새 고객 등록"}
              actions={selectedCustomer ? (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setCreatingCustomer(true);
                    setCustomerForm(createCustomerFormDefaults());
                  }}
                >
                  새 고객 등록
                </button>
              ) : null}
            >
              {selectedCustomer && selectedCustomerReadiness ? (
                <div className="customer-detail-top">
                  <div className="customer-detail-copy">
                    <strong>{selectedCustomer.customerName}</strong>
                    <span>{selectedCustomer.addr}</span>
                    <span>{getCustomerPopbillSummary(selectedCustomer)} · {getCustomerCertificateSummary(selectedCustomer)}</span>
                  </div>
                  <div className="customer-detail-stats">
                    <div>
                      <span>발전소명</span>
                      <strong>{selectedCustomer.plantNames.join(", ") || "-"}</strong>
                    </div>
                    <div>
                      <span>팝빌 상태</span>
                      <strong>{getCustomerPopbillSummary(selectedCustomer)}</strong>
                    </div>
                    <div>
                      <span>인증서 상태</span>
                      <strong>{getCustomerCertificateSummary(selectedCustomer)}</strong>
                    </div>
                  </div>
                  <div className="customer-detail-actions">
                    <span className={`chip ${selectedCustomerReadiness.tone === "success" ? "chip-success" : selectedCustomerReadiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>
                      {selectedCustomerReadiness.label}
                    </span>
                    {selectedCustomer.popbillState === "joined" ? (
                      <button className="btn-secondary" onClick={() => void runAction(`reset-popbill-${selectedCustomer.id}`, async () => void (await resetPopbillLink(selectedCustomer)))}>
                        연결 해제
                      </button>
                    ) : (
                      <button
                        className="btn-secondary"
                        onClick={() => void runAction(`join-${selectedCustomer.id}`, async () => void (await api(`/api/customers/${selectedCustomer.id}/popbill/join`, { method: "POST" })))}
                      >
                        팝빌 가입
                      </button>
                    )}
                    <button
                      onClick={() =>
                        void runAction(`cert-url-${selectedCustomer.id}`, async () => {
                          const result = await api<{ url: string }>(`/api/customers/${selectedCustomer.id}/popbill/cert-url`, {
                            method: "POST"
                          });
                          window.open(result.url, "_blank", "noopener,noreferrer");
                        })
                      }
                    >
                      {selectedCustomer.popbillCertRegistered ? "인증서 재등록" : "인증서 등록"}
                    </button>
                    <button className="btn-secondary" onClick={() => void runAction(`cert-status-${selectedCustomer.id}`, async () => void (await api(`/api/customers/${selectedCustomer.id}/popbill/cert-status`, { method: "POST" })))}>만료일 확인</button>
                  </div>
                  <div className="customer-detail-secondary">
                    <button className="btn-ghost btn-danger" onClick={() => void runAction(`delete-customer-${selectedCustomer.id}`, async () => void (await deleteCustomer(selectedCustomer)))}>
                      고객 삭제
                    </button>
                    {data.settings.popbillIsTest && selectedCustomer.popbillState === "joined" ? (
                      <button
                        className="btn-ghost"
                        onClick={() => void runAction(`quit-popbill-${selectedCustomer.id}`, async () => void (await quitPopbillMember(selectedCustomer)))}
                      >
                        테스트 팝빌 탈퇴
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="customer-empty-state">
                  <strong>새 고객을 등록합니다.</strong>
                  <span>기존 고객을 수정하려면 왼쪽 목록에서 고객을 선택하세요.</span>
                </div>
              )}
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
                <label className="full">
                  발전소명
                  <input
                    value={customerForm.plantNamesText}
                    onChange={(event) => setCustomerForm((prev) => ({ ...prev, plantNamesText: event.target.value }))}
                    placeholder="예: 이상택태양광"
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

        {activeTab === "settings" ? (
          <div className="settings-layout">
            <aside className="settings-sidebar-stack">
              <section className="panel settings-sidebar-panel">
                <header className="panel-header settings-sidebar-header">
                  <div>
                    <h2>처음 설정 순서</h2>
                  </div>
                  <span className={`chip ${setupPendingCount === 0 ? "chip-success" : "chip-warn"}`}>
                    {setupPendingCount === 0 ? "준비 완료" : `${setupPendingCount}개 남음`}
                  </span>
                </header>
                <div className="settings-step-list">
                  {settingsSections.map((section) => (
                    <button
                      key={section.id}
                      className={activeSettingsSection === section.id ? "settings-step-card active" : "settings-step-card"}
                      onClick={() => setActiveSettingsSection(section.id)}
                    >
                      <div className="settings-step-head">
                        <span className="setup-order">{section.step}</span>
                        <div className="settings-step-copy">
                          <strong>{section.title}</strong>
                          <span>{section.summary}</span>
                        </div>
                      </div>
                      <span className={`chip ${section.done ? "chip-success" : "chip-danger"}`}>{section.done ? "완료" : "입력 필요"}</span>
                    </button>
                  ))}
                </div>
                <div className="settings-sidebar-actions">
                  <button onClick={() => void runAction("save-settings", saveSettings)}>설정 저장</button>
                  <button className="btn-secondary" onClick={() => setActiveSettingsSection("logs")}>최근 로그 보기</button>
                </div>
              </section>

              <section className="panel settings-sidebar-panel">
                <header className="panel-header settings-sidebar-header">
                  <div>
                    <h2>다음 단계</h2>
                  </div>
                </header>
                <div className="settings-inline-note">
                  <strong>{customerRegistrationReady ? `고객 ${data.customers.length}명 등록됨` : "고객 등록이 필요합니다."}</strong>
                  <span>메일 매칭과 발행 테스트를 하려면 고객관리에서 고객을 먼저 등록하면 됩니다.</span>
                </div>
                <div className="settings-sidebar-actions">
                  <button className="btn-secondary" onClick={() => setActiveTab("customers")}>고객관리로 이동</button>
                  <button className="btn-secondary" onClick={() => void runAction("refresh-certificates", refreshAllCertificateStatuses)}>인증서 일괄 점검</button>
                </div>
              </section>
            </aside>

            <div className="settings-detail">
              {activeSettingsSection === "gmail" ? (
                <SetupPanel
                  step={1}
                  className="panel-settings-mail"
                  title="메일 연결"
                  done={settingsHealth.gmailReady}
                  note="한전 메일을 읽고 알림을 보내는 Gmail 계정을 연결합니다."
                  actions={
                    <>
                      <button className="btn-secondary" onClick={() => applyGmailDefaults(setSettingsForm)}>Gmail 기본값 넣기</button>
                      <button onClick={() => void runAction("mail-test", testMailSettings)}>Gmail 연결 테스트</button>
                    </>
                  }
                >
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
                </SetupPanel>
              ) : null}

              {activeSettingsSection === "popbill" ? (
                <SetupPanel
                  step={2}
                  className="panel-settings-popbill"
                  title="팝빌 연결"
                  done={settingsHealth.popbillReady}
                  note="팝빌 키와 파트너 사업자번호를 입력하고 포인트를 확인합니다."
                  actions={
                    <>
                      <button className="btn-secondary" onClick={() => void runAction("partner-points-refresh-settings", load)}>포인트 조회</button>
                      <button
                        disabled={busyKey !== null || !partnerPoints?.referenceCorpNum}
                        onClick={() => void runAction("partner-charge-settings", openPartnerChargeUrl)}
                      >
                        포인트 충전
                      </button>
                    </>
                  }
                >
                  <div className="info-grid">
                    <div>
                      <span>파트너 잔여포인트</span>
                      <strong>{partnerPoints?.available && partnerPoints.partnerRemainPoint !== null ? `${formatMoney(partnerPoints.partnerRemainPoint)}P` : "-"}</strong>
                    </div>
                    <div className="full-width">
                      <span>조회 기준</span>
                      <strong>{partnerPoints?.referenceCorpNum ?? "팝빌 파트너 사업자번호를 입력하세요."}</strong>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label>
                      팝빌 LinkID
                      <input value={settingsForm.popbillLinkId} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillLinkId: event.target.value })} />
                    </label>
                    <label>
                      팝빌 ID 접두어
                      <input value={settingsForm.popbillUserIdPrefix} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillUserIdPrefix: event.target.value })} />
                    </label>
                    <label>
                      팝빌 파트너 사업자번호
                      <input
                        placeholder="예: 290-42-01164"
                        value={settingsForm.popbillPartnerCorpNum}
                        onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillPartnerCorpNum: event.target.value })}
                      />
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
                        placeholder="신규 고객 공통 비밀번호"
                      />
                    </label>
                    <label className="checkbox">
                      <input type="checkbox" checked={settingsForm.popbillIsTest} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillIsTest: event.target.checked })} />
                      팝빌 테스트 모드
                    </label>
                    <div className="helper-box full">
                      <strong>자동 규칙</strong>
                      <span>고객 저장 시 팝빌 ID는 접두어 + 고객번호 형식으로 생성됩니다.</span>
                      <span>공통 비밀번호는 신규 고객 또는 비어 있는 고객에만 적용됩니다.</span>
                      <span>{partnerPoints?.message ?? "포인트 조회 전입니다."}</span>
                    </div>
                  </div>
                </SetupPanel>
              ) : null}

              {activeSettingsSection === "operator" ? (
                <SetupPanel
                  step={3}
                  done={settingsHealth.operatorReady}
                  note="팝빌 가입과 발행에 공통으로 사용하는 운영 담당자 정보입니다."
                  className="panel-settings-operator"
                  title="운영 담당자"
                >
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
                </SetupPanel>
              ) : null}

              {activeSettingsSection === "backup" ? (
                <SetupPanel
                  step={4}
                  className="panel-settings-backup"
                  title="데이터 백업"
                  done={Boolean(storageInfo)}
                  note="설치본 기준 로컬 데이터를 백업하고 필요하면 복원합니다."
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
                </SetupPanel>
              ) : null}

              {activeSettingsSection === "logs" ? (
                <Panel className="panel-settings-logs" title="최근 로그">
                  <div className="log-list">
                    {recentLogs.map((log) => (
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
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
