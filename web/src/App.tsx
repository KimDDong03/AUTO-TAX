import type React from "react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api, setActiveOrganizationId } from "./api";
import { supabase } from "./supabase";
import type {
  AppSettings,
  BootstrapPayload,
  Customer,
  InvoiceDraft,
  LogEntry,
  OrganizationMemberSummary,
  OpsWorkspaceCreateResponse,
  OpsWorkspaceSummary,
  PartnerPointsPayload,
  RenewalAutomationPayload
} from "./types";

type TabId = "work" | "customers" | "settings" | "ops";
type SettingsSectionId = "gmail" | "popbill" | "account";
type CustomerDetailTabId = "info" | "history";
type MailProvider = "gmail" | "naver" | "daum";
type RenewalAgentSnapshot = RenewalAutomationPayload["agent"];
type RenewalAgentCertificate = RenewalAgentSnapshot["bridge"]["storageProbe"]["certificates"][number];
type RenewalJob = RenewalAutomationPayload["jobs"][number];
type OpsConsoleData = {
  partnerPoints: PartnerPointsPayload;
  renewalAutomation: RenewalAutomationPayload;
  logs: LogEntry[];
  workspaces: OpsWorkspaceSummary[];
};

type InternalJobDispatchResponse = {
  ok: true;
  accessMode: "secret" | "ops";
  checkedOrganizations: number;
  dispatched: number;
  skipped: number;
};

type InternalJobRunResponse = {
  ok: true;
  accessMode: "secret" | "ops";
  attempted: number;
  claimed: number;
  completed: number;
  failed: number;
};

type OpsWorkspaceFormState = {
  organizationName: string;
  organizationBusinessNumber: string;
  ownerLoginId: string;
  ownerDisplayName: string;
  ownerPassword: string;
};

type SupportRequestFormState = {
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  message: string;
};

type CustomerFormState = {
  id: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  ceoName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  issueMode: "review" | "auto";
  popbillUserId: string;
  popbillPassword: string;
  memo: string;
  plantNamesText: string;
};

type SettingsFormState = {
  mailProvider: MailProvider;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  mailAddress: string;
  mailPassword: string;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  notificationEmailsText: string;
  defaultIssueDay: string;
  defaultIssueHour: string;
  defaultIssueMinute: string;
  mailPollMinutes: string;
  mailSyncStartAt: string;
  timezone: string;
  popbillUserIdPrefix: string;
  popbillSharedPassword: string;
  operatorContactName: string;
  operatorContactEmail: string;
  operatorContactTel: string;
  schedulerEnabled: boolean;
};

type PasswordChangeFormState = {
  nextPassword: string;
  confirmPassword: string;
};

type PasswordResetFormState = {
  nextPassword: string;
  confirmPassword: string;
};

type PasswordResetTarget =
  | {
      kind: "member";
      membershipId: string;
      loginId: string | null;
      displayName: string | null;
    }
  | {
      kind: "owner";
      organizationId: string;
      organizationName: string;
      loginId: string | null;
    };

type OrganizationMemberFormState = {
  loginId: string;
  displayName: string;
  password: string;
};

const baseOpsWorkspaceForm: OpsWorkspaceFormState = {
  organizationName: "",
  organizationBusinessNumber: "",
  ownerLoginId: "",
  ownerDisplayName: "",
  ownerPassword: ""
};

const baseSupportRequestForm: SupportRequestFormState = {
  companyName: "",
  requesterName: "",
  requesterEmail: "",
  requesterPhone: "",
  message: ""
};

const basePasswordChangeForm: PasswordChangeFormState = {
  nextPassword: "",
  confirmPassword: ""
};

const basePasswordResetForm: PasswordResetFormState = {
  nextPassword: "",
  confirmPassword: ""
};

const baseOrganizationMemberForm: OrganizationMemberFormState = {
  loginId: "",
  displayName: "",
  password: ""
};

const MAIL_PROVIDER_CONFIG: Record<
  MailProvider,
  {
    label: string;
    imapHost: string;
    imapPort: string;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: string;
    smtpSecure: boolean;
    defaultMailbox: string;
  }
> = {
  gmail: {
    label: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  },
  naver: {
    label: "네이버 메일",
    imapHost: "imap.naver.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.naver.com",
    smtpPort: "587",
    smtpSecure: false,
    defaultMailbox: "INBOX"
  },
  daum: {
    label: "다음 메일",
    imapHost: "imap.daum.net",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.daum.net",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  }
};

function getTabFromHash(hash: string): TabId | null {
  const value = hash.replace(/^#/, "");
  return value === "customers" || value === "settings" || value === "work" || value === "ops" ? value : null;
}

function getHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

function hasSupabaseAuthHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  if (!raw || getTabFromHash(hash)) return false;

  const params = getHashParams(hash);
  return (
    params.has("access_token") ||
    params.has("refresh_token") ||
    params.has("error") ||
    params.has("error_code") ||
    params.get("type") === "recovery"
  );
}

function isSupabaseRecoveryHash(hash: string): boolean {
  const params = getHashParams(hash);
  return params.get("type") === "recovery" || (params.has("access_token") && params.has("refresh_token"));
}

function decodeHashValue(value: string | null): string | null {
  if (!value) return null;

  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}

function getSupabaseAuthHashError(hash: string): string | null {
  const params = getHashParams(hash);
  const errorCode = params.get("error_code");
  const description = decodeHashValue(params.get("error_description"));

  if (!errorCode && !description) {
    return null;
  }

  if (errorCode === "otp_expired") {
    return "비밀번호 재설정 링크가 만료되었습니다. 새 메일을 다시 받아주세요.";
  }

  return description ?? "비밀번호 재설정 링크를 확인할 수 없습니다.";
}

function clearSupabaseAuthHash() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

const baseCustomerForm: CustomerFormState = {
  id: null,
  customerName: "",
  businessNumber: "",
  corpName: "",
  ceoName: "",
  addr: "",
  bizType: "전기업",
  bizClass: "태양광발전(자가용PPA)",
  issueMode: "review",
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
    form.issueMode === "review" &&
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
    issueMode: customer.issueMode,
    popbillUserId: customer.popbillUserId,
    popbillPassword: customer.popbillPassword,
    memo: customer.memo,
    plantNamesText: customer.plantNames[0] ?? ""
  };
}

function settingsToForm(settings: AppSettings): SettingsFormState {
  const detectedProvider = inferMailProviderFromAddress(
    settings.imapUser || settings.smtpUser || settings.smtpFromEmail,
    inferMailProvider(settings)
  );
  return {
    mailProvider: detectedProvider,
    imapHost: settings.imapHost,
    imapPort: String(settings.imapPort),
    imapSecure: settings.imapSecure,
    mailAddress: settings.imapUser || settings.smtpUser || settings.smtpFromEmail,
    mailPassword: settings.imapPass || settings.smtpPass,
    imapMailbox: settings.imapMailbox,
    smtpHost: settings.smtpHost,
    smtpPort: String(settings.smtpPort),
    smtpSecure: settings.smtpSecure,
    notificationEmailsText: settings.notificationEmails.join("\n"),
    defaultIssueDay: String(settings.defaultIssueDay),
    defaultIssueHour: String(settings.defaultIssueHour),
    defaultIssueMinute: String(settings.defaultIssueMinute),
    mailPollMinutes: String(settings.mailPollMinutes),
    mailSyncStartAt: settings.mailSyncStartAt ?? "",
    timezone: settings.timezone,
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
    ops: "OP",
    issue: "IS",
    unmatched: "ML",
    cert: "CT",
    complete: "OK",
    refresh: "↻",
    sync: "⇄"
  };

  return <span className={props.className ? `glyph ${props.className}` : "glyph"}>{glyphs[props.name] ?? props.name.slice(0, 2).toUpperCase()}</span>;
}

function RevealIcon(props: { open: boolean }) {
  return (
    <svg className="reveal-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12C3.9 8.8 7.4 6.5 12 6.5C16.6 6.5 20.1 8.8 22 12C20.1 15.2 16.6 17.5 12 17.5C7.4 17.5 3.9 15.2 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
      {props.open ? null : (
        <path
          d="M4 4L20 20"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
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
    case "scheduled":
      return "자동 발행 대기";
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

function getIssueModeLabel(issueMode: "review" | "auto"): string {
  return issueMode === "auto" ? "월 자동 발행" : "검수 후 발행";
}

function getOrganizationRoleLabel(role: BootstrapPayload["auth"]["activeOrganizationRole"]): string {
  switch (role) {
    case "owner":
      return "소유자";
    case "admin":
    case "operator":
      return "멤버";
    case "viewer":
      return "조회전용";
    case null:
      return "플랫폼 관리자";
    default:
      return role ?? "플랫폼 관리자";
  }
}

function getOrganizationStatusLabel(status: OpsWorkspaceSummary["organizationStatus"]): string {
  switch (status) {
    case "trial":
      return "체험";
    case "active":
      return "운영중";
    case "suspended":
      return "중지";
    case "churned":
      return "해지";
    default:
      return status;
  }
}

function getWorkspaceMemberRoleLabel(role: OrganizationMemberSummary["role"]): string {
  return role === "owner" ? "소유자" : "멤버";
}

function simplifyIssueError(message: string): string {
  if (!message) return "";

  const normalized = message
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\(-?\d+\)/g, " ")
    .replace(/-?\d{5,}/g, " ")
    .replace(/^(목업|수동|일괄)\s*발행\s*실패\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes("연동회원으로 가입된 사업자 번호가 존재하지 않습니다")) {
    return "팝빌 가입 필요";
  }

  if (normalized.includes("포인트 부족")) {
    return "포인트 부족";
  }

  if (normalized.includes("공동인증서") || normalized.includes("인증서")) {
    return "인증서 확인 필요";
  }

  if (normalized.includes("사업자 번호") || normalized.includes("사업자번호")) {
    return "사업자번호 확인 필요";
  }

  return "오류 확인 필요";
}

function getParseStatusLabel(status: string): string {
  switch (status) {
    case "parsed":
      return "매칭 완료";
    case "unmatched":
      return "고객 미매칭";
    case "failed":
      return "파싱 실패";
    case "duplicate":
      return "중복 의심";
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

function formatPartnerPointsMessage(partnerPoints: PartnerPointsPayload | null): string {
  if (!partnerPoints?.message) {
    return "포인트 조회 전입니다.";
  }

  if (
    !partnerPoints.available &&
    !partnerPoints.isTest &&
    partnerPoints.message.includes("연동회원으로 가입된 사업자 번호가 존재하지 않습니다")
  ) {
    return "운영 팝빌 연동 전입니다. 계약/개통 후 조회 가능합니다.";
  }

  return partnerPoints.message;
}

function getWorkspaceEstimatedPointUsage(workspace: OpsWorkspaceSummary, unitCost: number | null): number | null {
  if (unitCost === null) {
    return null;
  }

  return workspace.issuedDraftCount * unitCost;
}

function getWorkspaceCurrentMonthEstimatedPointUsage(workspace: OpsWorkspaceSummary, unitCost: number | null): number | null {
  if (unitCost === null) {
    return null;
  }

  return workspace.currentMonthIssuedDraftCount * unitCost;
}

function getRenewalAgentStatusMeta(agent: RenewalAgentSnapshot): {
  label: string;
  chipClassName: string;
} {
  if (agent.online) {
    return {
      label: "에이전트 온라인",
      chipClassName: "chip-success"
    };
  }

  if (agent.lastHeartbeatAt) {
    return {
      label: "에이전트 오프라인",
      chipClassName: "chip-warn"
    };
  }

  return {
    label: "에이전트 미연결",
    chipClassName: "chip-danger"
  };
}

function formatRenewalBridgeSummary(agent: RenewalAgentSnapshot): string {
  if (agent.bridge.ports.length === 0) {
    return "포트 진단 전";
  }

  return agent.bridge.ports
    .map((port) => `${port.port}/${port.protocol} ${port.reachable ? "연결됨" : "실패"}`)
    .join(" · ");
}

function formatRenewalVersionSummary(agent: RenewalAgentSnapshot): string {
  const versionProbe = agent.bridge.versionProbe;
  if (!versionProbe.ok) {
    return versionProbe.error ?? "GetVersion 미실행";
  }

  return [
    `secukitNX ${versionProbe.values.secukitNX ?? "-"}`,
    `kpmcnt ${versionProbe.values.kpmcnt ?? "-"}`,
    `kpmsvc ${versionProbe.values.kpmsvc ?? "-"}`
  ].join(" · ");
}

function formatRenewalLicenseSummary(agent: RenewalAgentSnapshot): string {
  const licenseProbe = agent.bridge.licenseProbe;
  if (!licenseProbe.ok) {
    return licenseProbe.error ?? "라이선스 미검증";
  }

  return `정상 (${licenseProbe.sourcePort ?? "-"})`;
}

function formatRenewalStorageSummary(agent: RenewalAgentSnapshot): string {
  const storageProbe = agent.bridge.storageProbe;
  if (!storageProbe.ok) {
    return storageProbe.error ?? "HDD 인증서 미조회";
  }

  if (storageProbe.certificateCount === 0) {
    return "인증서 없음";
  }

  const preview = storageProbe.certificates
    .slice(0, 2)
    .map((certificate) => `${certificate.cn || "이름 없음"} (${certificate.todate ?? "-"})`)
    .join(" · ");
  const suffix = storageProbe.certificateCount > 2 ? ` 외 ${storageProbe.certificateCount - 2}건` : "";
  return `${storageProbe.certificateCount}건 · ${preview}${suffix}`;
}

function formatRenewalSelectionSummary(agent: RenewalAgentSnapshot): string {
  const selectionProbe = agent.bridge.selectionProbe;
  if (
    !selectionProbe.ok &&
    !selectionProbe.error &&
    !selectionProbe.certificateIndex &&
    !selectionProbe.certificateCn &&
    !selectionProbe.certID
  ) {
    return "certID 미조회";
  }

  const label = selectionProbe.certificateCn || (selectionProbe.certificateIndex ? `인증서 #${selectionProbe.certificateIndex}` : "인증서");
  if (selectionProbe.ok) {
    return `${label} · ${selectionProbe.certID ?? "-"}`;
  }

  return `${label} · ${selectionProbe.error ?? "조회 실패"}`;
}

function formatRenewalPreflightSummary(agent: RenewalAgentSnapshot): string {
  const preflightProbe = agent.bridge.preflightProbe;
  if (
    !preflightProbe.ok &&
    !preflightProbe.error &&
    !preflightProbe.message &&
    !preflightProbe.certificateIndex &&
    !preflightProbe.certificateCn
  ) {
    return "갱신 경로 미분석";
  }

  const label = preflightProbe.certificateCn || (preflightProbe.certificateIndex ? `인증서 #${preflightProbe.certificateIndex}` : "인증서");
  if (preflightProbe.ok) {
    const branchText =
      preflightProbe.branch === "change-company" && preflightProbe.externalFlowKind === "apply-form"
        ? `순정 갱신 아님 (${preflightProbe.issueCompany ?? "-"} -> 외부 신규신청)`
        : preflightProbe.branch === "change-company"
          ? `기관변경 필요 (${preflightProbe.issueCompany ?? "-"})`
          : preflightProbe.branch === "renew-payment"
            ? "순정 갱신 · 결제 단계"
            : preflightProbe.branch === "password-confirm"
              ? "순정 갱신 · 발급 직전 비밀번호 확인"
            : preflightProbe.branch === "renew-info"
              ? "순정 갱신 · 신청정보 입력"
              : preflightProbe.branch;
    const externalFlowText =
      preflightProbe.branch === "change-company" && preflightProbe.externalFlowKind === "apply-form"
        ? `외부 신규신청형${preflightProbe.externalFlowProductName ? ` (${preflightProbe.externalFlowProductName})` : ""}`
        : null;
    const urlText = preflightProbe.externalFlowSubmitUrl ?? preflightProbe.nextUrl;
    return `${label} · ${branchText}${externalFlowText ? ` · ${externalFlowText}` : ""}${urlText ? ` · ${urlText}` : ""}`;
  }

  return `${label} · ${preflightProbe.error ?? preflightProbe.message ?? "분석 실패"}`;
}

function formatRenewalPathCell(
  certificate: RenewalAgentCertificate,
  agent: RenewalAgentSnapshot
): string {
  const preflightProbe = agent.bridge.preflightProbe;
  if (preflightProbe.certificateIndex !== certificate.index) {
    return "-";
  }

  if (!preflightProbe.ok) {
    return preflightProbe.error ?? preflightProbe.message ?? "분석 실패";
  }

  if (preflightProbe.branch === "change-company" && preflightProbe.externalFlowKind === "apply-form") {
    return `순정 갱신 아님 · ${preflightProbe.issueCompany ?? "-"} · ${preflightProbe.externalFlowProductName ?? "외부 신규신청"}`;
  }

  if (preflightProbe.branch === "renew-payment") {
    return "순정 갱신 · 결제 단계";
  }

  if (preflightProbe.branch === "password-confirm") {
    return "순정 갱신 · 발급 직전";
  }

  if (preflightProbe.branch === "renew-info") {
    return "순정 갱신 · 신청정보 입력";
  }

  return preflightProbe.nextUrl ?? preflightProbe.branch;
}

function formatRenewalJobStatusLabel(status: RenewalJob["status"]): string {
  if (status === "queued") return "대기";
  if (status === "claimed") return "실행 중";
  if (status === "completed") return "완료";
  return "실패";
}

function formatRenewalJobLabel(job: RenewalJob): string {
  if (job.type === "certid-probe") {
    return job.certificateCn || (job.certificateIndex !== null ? `certID 조회 #${job.certificateIndex}` : "certID 조회");
  }

  if (job.type === "renewal-preflight") {
    return job.certificateCn || (job.certificateIndex !== null ? `갱신 경로 분석 #${job.certificateIndex}` : "갱신 경로 분석");
  }

  return job.customerName ?? "인증서 목록 진단";
}

function getDraftConfirmNumber(draft: InvoiceDraft): string | null {
  if (!draft.popbillResultJson) return null;

  try {
    const parsed = JSON.parse(draft.popbillResultJson) as Record<string, unknown>;
    const confirmValue = parsed.ntsConfirmNum ?? parsed.NTSConfirmNum ?? parsed.confirmNum ?? parsed.confirmNumber;
    return typeof confirmValue === "string" && confirmValue.trim() !== "" ? confirmValue.trim() : null;
  } catch {
    return null;
  }
}

function inferMailProvider(settings: Pick<AppSettings, "imapHost" | "smtpHost">): MailProvider {
  const imapHost = settings.imapHost.trim().toLowerCase();
  const smtpHost = settings.smtpHost.trim().toLowerCase();

  if (imapHost.includes("naver") || smtpHost.includes("naver")) return "naver";
  if (imapHost.includes("daum") || smtpHost.includes("daum")) return "daum";
  return "gmail";
}

function inferMailProviderFromAddress(address: string, fallback: MailProvider = "gmail"): MailProvider {
  const normalized = address.trim().toLowerCase();

  if (!normalized.includes("@")) {
    return fallback;
  }

  if (normalized.endsWith("@naver.com")) return "naver";
  if (normalized.endsWith("@daum.net") || normalized.endsWith("@hanmail.net")) return "daum";
  if (normalized.endsWith("@gmail.com")) return "gmail";

  return fallback;
}

function applyMailProviderDefaults(
  setter: React.Dispatch<React.SetStateAction<SettingsFormState | null>>,
  provider: MailProvider
) {
  const config = MAIL_PROVIDER_CONFIG[provider];
  setter((prev) =>
    prev
      ? {
          ...prev,
          mailProvider: provider,
          imapHost: config.imapHost,
          imapPort: config.imapPort,
          imapSecure: config.imapSecure,
          imapMailbox: prev.imapMailbox || config.defaultMailbox,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpSecure: config.smtpSecure
        }
      : prev
  );
}

function withSelectedMailProviderSettings(form: SettingsFormState) {
  const detectedProvider = inferMailProviderFromAddress(form.mailAddress, form.mailProvider);
  const config = MAIL_PROVIDER_CONFIG[detectedProvider];
  return {
    ...form,
    mailProvider: detectedProvider,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapSecure: config.imapSecure,
    imapMailbox: config.defaultMailbox,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure
  };
}

export function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [signInAccount, setSignInAccount] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(() =>
    typeof window !== "undefined" ? isSupabaseRecoveryHash(window.location.hash) : false
  );
  const [recoveryPasswordForm, setRecoveryPasswordForm] = useState<PasswordResetFormState>(basePasswordResetForm);
  const [showSupportRequestForm, setShowSupportRequestForm] = useState(false);
  const [supportRequestBusy, setSupportRequestBusy] = useState(false);
  const [supportRequestForm, setSupportRequestForm] = useState<SupportRequestFormState>(baseSupportRequestForm);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [opsConsole, setOpsConsole] = useState<OpsConsoleData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    return getTabFromHash(hash) ?? "work";
  });
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormDefaults());
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerListFilter, setCustomerListFilter] = useState<"all" | "blocked">("all");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerDetailTab, setCustomerDetailTab] = useState<CustomerDetailTabId>("info");
  const [workFeedTab, setWorkFeedTab] = useState<"inbox" | "issued">("inbox");
  const [settingsForm, setSettingsForm] = useState<SettingsFormState | null>(null);
  const [passwordChangeForm, setPasswordChangeForm] = useState<PasswordChangeFormState>(basePasswordChangeForm);
  const [passwordResetForm, setPasswordResetForm] = useState<PasswordResetFormState>(basePasswordResetForm);
  const [passwordResetTarget, setPasswordResetTarget] = useState<PasswordResetTarget | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMemberSummary[]>([]);
  const [organizationMemberForm, setOrganizationMemberForm] = useState<OrganizationMemberFormState>(baseOrganizationMemberForm);
  const [opsWorkspaceForm, setOpsWorkspaceForm] = useState<OpsWorkspaceFormState>(baseOpsWorkspaceForm);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("gmail");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});

  const loadOpsConsole = async (): Promise<OpsConsoleData> => {
    const [partnerPoints, renewalAutomation, logs, workspaces] = await Promise.all([
      api<PartnerPointsPayload>("/api/popbill/partner-points"),
      api<RenewalAutomationPayload>("/api/automation/renewal-agent/snapshot"),
      api<LogEntry[]>("/api/logs"),
      api<OpsWorkspaceSummary[]>("/api/ops/workspaces")
    ]);

    return {
      partnerPoints,
      renewalAutomation,
      logs,
      workspaces
    };
  };

  const loadOrganizationMembers = async (payload: BootstrapPayload) => {
    if (payload.auth.activeOrganizationRole !== "owner") {
      setOrganizationMembers([]);
      return;
    }

    const members = await api<OrganizationMemberSummary[]>("/api/organization/members");
    setOrganizationMembers(members);
  };

  const load = async () => {
    const payload = await api<BootstrapPayload>("/api/bootstrap");
    const nextOpsConsole = payload.auth.isPlatformAdmin ? await loadOpsConsole() : null;
    setError("");
    setActiveOrganizationId(payload.auth.activeOrganizationId);
    const nextSettingsForm = settingsToForm(payload.settings);
    setData(payload);
    setOpsConsole(nextOpsConsole);
    await loadOrganizationMembers(payload);
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
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw lastError ?? new Error("초기 데이터를 불러오지 못했습니다.");
  };

  useEffect(() => {
    let mounted = true;

    const applyAuthHashState = (hash: string) => {
      const recoveryHash = isSupabaseRecoveryHash(hash);
      const recoveryError = getSupabaseAuthHashError(hash);

      if (!mounted) return;

      if (recoveryHash) {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
        return;
      }

      if (recoveryError) {
        setRecoveryMode(false);
        setError(recoveryError);
        clearSupabaseAuthHash();
      }
    };

    if (typeof window !== "undefined") {
      applyAuthHashState(window.location.hash);
    }

    void supabase.auth.getSession().then(({ data: next }) => {
      if (!mounted) return;
      setAuthSession(next.session);
      setAuthReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setAuthSession(nextSession);

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
      } else if (event === "SIGNED_OUT") {
        setRecoveryMode(false);
      } else if (nextSession) {
        setError("");
      }

      if (!nextSession) {
        setData(null);
        setOpsConsole(null);
        setOrganizationMembers([]);
        setSettingsForm(null);
        setActiveOrganizationId(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !authSession || recoveryMode) return;

    void loadWithRetry().catch((loadError: Error) => setError(loadError.message));
  }, [authReady, authSession, recoveryMode]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      const nextTab = getTabFromHash(hash);

      if (nextTab) {
        setActiveTab(nextTab);
        return;
      }

      if (isSupabaseRecoveryHash(hash)) {
        setRecoveryMode(true);
        setError("");
        setAuthNotice("");
        return;
      }

      const recoveryError = getSupabaseAuthHashError(hash);
      if (recoveryError) {
        setRecoveryMode(false);
        setError(recoveryError);
        clearSupabaseAuthHash();
      }
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (recoveryMode || hasSupabaseAuthHash(window.location.hash)) {
      return;
    }

    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, "", `#${activeTab}`);
    }
  }, [activeTab, recoveryMode]);

  useEffect(() => {
    if (data && !data.auth.isPlatformAdmin && activeTab === "ops") {
      setActiveTab("work");
    }
  }, [activeTab, data]);

  useEffect(() => {
    if (data?.auth.isPlatformAdmin && data.auth.organizations.length === 0 && activeTab !== "ops") {
      setActiveTab("ops");
    }
  }, [activeTab, data]);

  useEffect(() => {
    if (!data || activeTab !== "customers" || creatingCustomer) return;
    const normalizedSearch = customerSearchQuery.trim().toLocaleLowerCase("ko-KR");
    const visibleCustomers = data.customers.filter((customer) => {
      const matchesFilter = customerListFilter === "blocked" ? !getCustomerIssueReadiness(customer).canIssueNow : true;
      const matchesSearch =
        normalizedSearch === "" || customer.customerName.toLocaleLowerCase("ko-KR").includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    });

    if (visibleCustomers.length === 0) {
      if (customerForm.id !== null) {
        setCustomerForm(createCustomerFormDefaults());
      }
      return;
    }

    if (customerForm.id === null) {
      if (!isPristineCustomerForm(customerForm)) return;
      setCustomerForm(customerToForm(visibleCustomers[0]));
      return;
    }

    if (!visibleCustomers.some((customer) => customer.id === customerForm.id)) {
      setCustomerForm(customerToForm(visibleCustomers[0]));
    }
  }, [activeTab, creatingCustomer, customerForm, customerListFilter, customerSearchQuery, data]);

  useEffect(() => {
    if (creatingCustomer || customerForm.id === null) {
      setCustomerDetailTab("info");
    }
  }, [creatingCustomer, customerForm.id]);

  const runAction = async (
    key: string,
    action: () => Promise<void>,
    options?: {
      reload?: boolean;
    }
  ) => {
    try {
      setError("");
      setBusyKey(key);
      await action();
      if (options?.reload !== false) {
        await load();
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "작업에 실패했습니다.");
    } finally {
      setBusyKey(null);
    }
  };

  const submitSupportRequest = async () => {
    try {
      setError("");
      setSupportRequestBusy(true);
      await api("/api/public/support-request", {
        method: "POST",
        body: JSON.stringify({
          companyName: supportRequestForm.companyName.trim(),
          requesterName: supportRequestForm.requesterName.trim(),
          requesterEmail: supportRequestForm.requesterEmail.trim(),
          requesterPhone: supportRequestForm.requesterPhone.trim(),
          message: supportRequestForm.message.trim()
        })
      });

      setSupportRequestForm(baseSupportRequestForm);
      setShowSupportRequestForm(false);
      window.alert("문의가 접수되었습니다. 확인 후 등록 안내 메일을 보내드리겠습니다.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문의 전송에 실패했습니다.");
    } finally {
      setSupportRequestBusy(false);
    }
  };

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setError("");
      setAuthNotice("");
      setAuthBusy(true);
      const result = await api<{
        session: {
          access_token: string;
          refresh_token: string;
        };
      }>("/api/public/login", {
        method: "POST",
        body: JSON.stringify({
          account: signInAccount.trim(),
          password: signInPassword
        })
      });
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token
      });
      if (sessionError) throw sessionError;
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "로그인에 실패했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setBusyKey(null);
    setError("");
    setAuthNotice("");
    setData(null);
    setOpsConsole(null);
    setPasswordResetTarget(null);
    setPasswordResetForm(basePasswordResetForm);
    setRecoveryMode(false);
    setRecoveryPasswordForm(basePasswordResetForm);
    setOrganizationMembers([]);
    setSettingsForm(null);
    setActiveOrganizationId(null);
    clearSupabaseAuthHash();
    await supabase.auth.signOut();
  };

  const changeOrganization = async (organizationId: string) => {
    setActiveOrganizationId(organizationId);
    setError("");
    setPasswordResetTarget(null);
    setPasswordResetForm(basePasswordResetForm);
    await runAction(
      "workspace-change",
      async () => {
        await load();
      },
      { reload: false }
    );
  };

  const toggleRevealField = (fieldKey: string) => {
    setRevealedFields((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
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
      issueMode: isEditing ? customerForm.issueMode : "review",
      issueDay: null,
      issueHour: null,
      issueMinute: null,
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

  const buildSettingsPayload = (form: SettingsFormState) => {
    const normalized = withSelectedMailProviderSettings(form);
    return {
      normalized,
      payload: {
        imapHost: normalized.imapHost,
        imapPort: Number(normalized.imapPort),
        imapSecure: normalized.imapSecure,
        imapUser: normalized.mailAddress,
        imapPass: normalized.mailPassword,
        imapMailbox: normalized.imapMailbox,
        smtpHost: normalized.smtpHost,
        smtpPort: Number(normalized.smtpPort),
        smtpSecure: normalized.smtpSecure,
        smtpUser: normalized.mailAddress,
        smtpPass: normalized.mailPassword,
        smtpFromName: "AUTO-TAX",
        smtpFromEmail: normalized.mailAddress,
        notificationEmails: normalized.notificationEmailsText
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        defaultIssueDay: Number(normalized.defaultIssueDay),
        defaultIssueHour: Number(normalized.defaultIssueHour),
        defaultIssueMinute: Number(normalized.defaultIssueMinute),
        mailPollMinutes: Number(normalized.mailPollMinutes),
        mailSyncStartAt: normalized.mailSyncStartAt.trim() ? normalized.mailSyncStartAt : null,
        timezone: normalized.timezone,
        popbillUserIdPrefix: normalized.popbillUserIdPrefix.trim(),
        popbillSharedPassword: normalized.popbillSharedPassword,
        operatorContactName: normalized.operatorContactName.trim(),
        operatorContactEmail: normalized.operatorContactEmail.trim(),
        operatorContactTel: normalized.operatorContactTel.trim(),
        schedulerEnabled: normalized.schedulerEnabled
      }
    };
  };

  const applySavedSettings = (savedSettings: AppSettings) => {
    setSettingsForm(settingsToForm(savedSettings));
    setData((prev) => (prev ? { ...prev, settings: savedSettings } : prev));
  };

  const saveSettings = async () => {
    if (!settingsForm) return;
    const { payload } = buildSettingsPayload(settingsForm);
    const savedSettings = await api<AppSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    applySavedSettings(savedSettings);
  };

  const testMailSettings = async () => {
    if (!settingsForm) return;
    const { normalized, payload } = buildSettingsPayload(settingsForm);
    const result = await api<{
      imapOk: boolean;
      imapMessage: string;
      smtpOk: boolean;
      smtpMessage: string;
      testMailSent: boolean;
    }>("/api/system/mail-test", {
      method: "POST",
      body: JSON.stringify({
        imapHost: payload.imapHost,
        imapPort: payload.imapPort,
        imapSecure: payload.imapSecure,
        imapUser: payload.imapUser,
        imapPass: payload.imapPass,
        imapMailbox: payload.imapMailbox,
        smtpHost: payload.smtpHost,
        smtpPort: payload.smtpPort,
        smtpSecure: payload.smtpSecure,
        smtpUser: payload.smtpUser,
        smtpPass: payload.smtpPass,
        smtpFromName: "AUTO-TAX",
        smtpFromEmail: payload.smtpFromEmail,
        notificationEmails: payload.notificationEmails
      })
    });

    const testSucceeded = result.imapOk && result.smtpOk;
    if (testSucceeded) {
      const savedSettings = await api<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      applySavedSettings(savedSettings);
    }

    window.alert(
      `${MAIL_PROVIDER_CONFIG[normalized.mailProvider].label} 연결 테스트 결과\nIMAP: ${result.imapOk ? "성공" : "실패"}\n${result.imapMessage}\n\nSMTP: ${result.smtpOk ? "성공" : "실패"}\n${result.smtpMessage}\n\n테스트 메일 발송: ${result.testMailSent ? "예" : "아니오"}\n\n설정 저장: ${testSucceeded ? "성공" : "실패로 저장 안 함"}`
    );
  };

  const changePassword = async () => {
    const nextPassword = passwordChangeForm.nextPassword.trim();
    const confirmPassword = passwordChangeForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      throw new Error("새 비밀번호는 8자 이상으로 입력하세요.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("새 비밀번호와 확인 값이 일치하지 않습니다.");
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: nextPassword
    });

    if (updateError) {
      throw updateError;
    }

    setPasswordChangeForm(basePasswordChangeForm);
    window.alert("비밀번호를 변경했습니다.");
  };

  const returnToLoginFromRecovery = async () => {
    setRecoveryMode(false);
    setRecoveryPasswordForm(basePasswordResetForm);
    clearSupabaseAuthHash();
    setError("");

    if (authSession) {
      await supabase.auth.signOut();
    }
  };

  const submitRecoveryPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const nextPassword = recoveryPasswordForm.nextPassword.trim();
      const confirmPassword = recoveryPasswordForm.confirmPassword.trim();

      setError("");
      setAuthNotice("");
      setAuthBusy(true);

      if (!authSession) {
        throw new Error("비밀번호 재설정 링크를 다시 열어주세요.");
      }

      if (nextPassword.length < 8) {
        throw new Error("새 비밀번호는 8자 이상으로 입력하세요.");
      }

      if (nextPassword !== confirmPassword) {
        throw new Error("새 비밀번호와 확인 값이 일치하지 않습니다.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: nextPassword
      });

      if (updateError) {
        throw updateError;
      }

      setRecoveryPasswordForm(basePasswordResetForm);
      setRecoveryMode(false);
      clearSupabaseAuthHash();
      await supabase.auth.signOut();
      setAuthNotice("비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요.");
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const openMemberPasswordReset = (member: OrganizationMemberSummary) => {
    setPasswordResetTarget({
      kind: "member",
      membershipId: member.membershipId,
      loginId: member.loginId,
      displayName: member.displayName
    });
    setPasswordResetForm(basePasswordResetForm);
  };

  const openOwnerPasswordReset = (workspace: OpsWorkspaceSummary) => {
    setPasswordResetTarget({
      kind: "owner",
      organizationId: workspace.organizationId,
      organizationName: workspace.organizationName,
      loginId: workspace.ownerLoginId
    });
    setPasswordResetForm(basePasswordResetForm);
  };

  const cancelPasswordReset = () => {
    setPasswordResetTarget(null);
    setPasswordResetForm(basePasswordResetForm);
  };

  const submitPasswordReset = async () => {
    if (!passwordResetTarget) {
      throw new Error("비밀번호를 재설정할 대상을 먼저 선택하세요.");
    }

    const nextPassword = passwordResetForm.nextPassword.trim();
    const confirmPassword = passwordResetForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      throw new Error("임시 비밀번호는 8자 이상으로 입력하세요.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("임시 비밀번호와 확인 값이 일치하지 않습니다.");
    }

    if (passwordResetTarget.kind === "member") {
      const result = await api<{ ok: true; loginId: string | null }>(
        `/api/organization/members/${passwordResetTarget.membershipId}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({
            password: nextPassword
          })
        }
      );

      window.alert(`${result.loginId ?? "선택한 사용자"}의 임시 비밀번호를 재설정했습니다.`);
    } else {
      const result = await api<{ ok: true; ownerLoginId: string | null }>(
        `/api/ops/workspaces/${passwordResetTarget.organizationId}/reset-owner-password`,
        {
          method: "POST",
          body: JSON.stringify({
            password: nextPassword
          })
        }
      );

      window.alert(
        `${passwordResetTarget.organizationName} 작업공간의 owner(${result.ownerLoginId ?? "-"}) 임시 비밀번호를 재설정했습니다.`
      );
    }

    cancelPasswordReset();
  };

  const createOrganizationMember = async () => {
    const result = await api<{
      members: OrganizationMemberSummary[];
      memberAction: "linked-existing-user" | "created-user";
    }>("/api/organization/members", {
      method: "POST",
      body: JSON.stringify({
        loginId: organizationMemberForm.loginId.trim(),
        displayName: organizationMemberForm.displayName.trim(),
        password: organizationMemberForm.password
      })
    });

    setOrganizationMembers(result.members);
    setOrganizationMemberForm(baseOrganizationMemberForm);
    window.alert(
      result.memberAction === "created-user"
        ? "새 사용자 계정을 만들고 작업공간 멤버로 연결했습니다."
        : "기존 사용자 계정을 작업공간 멤버로 연결했습니다."
    );
  };

  const removeOrganizationMember = async (member: OrganizationMemberSummary) => {
    const confirmed = window.confirm(`${member.loginId ?? "선택한 사용자"}를 이 작업공간에서 제거할까요?`);
    if (!confirmed) {
      return;
    }

    const result = await api<{ ok: true; members: OrganizationMemberSummary[] }>(`/api/organization/members/${member.membershipId}`, {
      method: "DELETE"
    });

    setOrganizationMembers(result.members);
  };

  const openPartnerChargeUrl = async () => {
    const result = await api<{ url: string }>("/api/popbill/partner-charge-url");
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const dispatchInternalJobs = async () => {
    const result = await api<InternalJobDispatchResponse>("/api/internal/jobs/dispatch", {
      method: "POST"
    });

    window.alert(
      `배치 작업 생성이 완료되었습니다.\n확인한 작업공간: ${result.checkedOrganizations}곳\n새로 큐에 넣은 작업: ${result.dispatched}건\n건너뛴 작업: ${result.skipped}건`
    );
  };

  const runInternalJobs = async () => {
    const result = await api<InternalJobRunResponse>("/api/internal/jobs/run", {
      method: "POST",
      body: JSON.stringify({ limit: 100 })
    });

    window.alert(
      `배치 작업 실행이 완료되었습니다.\n조회한 작업: ${result.attempted}건\n선점한 작업: ${result.claimed}건\n완료: ${result.completed}건\n실패: ${result.failed}건`
    );
  };

  const createWorkspace = async () => {
    const payload = {
      organizationName: opsWorkspaceForm.organizationName.trim(),
      organizationBusinessNumber: opsWorkspaceForm.organizationBusinessNumber.trim(),
      ownerLoginId: opsWorkspaceForm.ownerLoginId.trim(),
      ownerDisplayName: opsWorkspaceForm.ownerDisplayName.trim(),
      ownerPassword: opsWorkspaceForm.ownerPassword
    };

    const result = await api<OpsWorkspaceCreateResponse>("/api/ops/workspaces", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setOpsWorkspaceForm(baseOpsWorkspaceForm);
    window.alert(
      result.workspaceAction === "reused-existing"
        ? `이미 개통된 고객사 작업공간을 다시 불러왔습니다.\n작업공간: ${result.workspace.organizationName}\nowner 로그인 아이디: ${result.workspace.ownerLoginId}`
        : result.ownerAction === "created-user"
          ? `고객사 작업공간을 개통했습니다.\n작업공간: ${result.workspace.organizationName}\nowner 로그인 아이디: ${result.workspace.ownerLoginId}\n새 계정이 생성되었습니다. 전달한 임시 비밀번호로 첫 로그인하면 됩니다.`
          : `고객사 작업공간을 개통했습니다.\n작업공간: ${result.workspace.organizationName}\nowner 로그인 아이디: ${result.workspace.ownerLoginId}\n기존 사용자 계정을 owner로 연결했습니다.`
    );
  };

  const requestRenewalBridgeProbe = async (customerId?: number | null) => {
    const result = await api<{ id: number }>("/api/automation/renewal-jobs/bridge-probe", {
      method: "POST",
      body: JSON.stringify({
        customerId: customerId ?? null
      })
    });

    window.alert(`로컬 인증서 목록 진단 작업을 큐에 추가했습니다.\n작업번호: ${result.id}`);
  };

  const requestRenewalCertIdProbe = async (
    certificate: RenewalAgentCertificate
  ) => {
    const result = await api<{ id: number }>("/api/automation/renewal-jobs/certid-probe", {
      method: "POST",
      body: JSON.stringify({
        certificateIndex: Number(certificate.index),
        certificateCn: certificate.cn || null
      })
    });

    window.alert(
      `certID 조회 작업을 큐에 추가했습니다.\n작업번호: ${result.id}\n로컬 에이전트에 인증서 비밀번호 환경변수가 지정되어 있어야 실제 조회됩니다.`
    );
  };

  const requestRenewalPreflight = async (
    certificate: RenewalAgentCertificate
  ) => {
    const result = await api<{ id: number }>("/api/automation/renewal-jobs/preflight", {
      method: "POST",
      body: JSON.stringify({
        certificateIndex: Number(certificate.index),
        certificateCn: certificate.cn || null
      })
    });

    window.alert(
      `갱신 경로 분석 작업을 큐에 추가했습니다.\n작업번호: ${result.id}\n로컬 에이전트에 인증서 비밀번호 환경변수가 지정되어 있어야 실제 분석됩니다.`
    );
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
    const targets = data?.inbox.filter((message) => message.parseStatus === "unmatched" || message.parseStatus === "failed" || message.parseStatus === "duplicate") ?? [];
    if (targets.length === 0) {
      window.alert("재처리할 확인 메일이 없습니다.");
      return;
    }

    const confirmed = window.confirm(`확인 메일 ${targets.length}건을 다시 처리합니다.\n계속할까요?`);
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

    window.alert(`메일 재처리 완료\n성공: ${success}건\n확인 필요 유지: ${stillPending}건`);
  };

  if (!authReady) {
    return <div className="loading-shell">{recoveryMode ? "비밀번호 재설정 링크를 확인하는 중입니다." : "로그인 상태를 확인하는 중입니다."}</div>;
  }

  if (recoveryMode) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-copy">
            <span className="auth-badge">AUTO-TAX</span>
            <h1>새 비밀번호 설정</h1>
            <p>재설정 메일에서 열린 화면입니다. 새 비밀번호를 저장한 뒤 다시 로그인하세요.</p>
          </div>
          <form className="auth-form" onSubmit={(event) => void submitRecoveryPassword(event)}>
            <label>
              <span>새 비밀번호</span>
              <div className="password-field">
                <input
                  type={revealedFields.recoveryNextPassword ? "text" : "password"}
                  value={recoveryPasswordForm.nextPassword}
                  onChange={(event) =>
                    setRecoveryPasswordForm((prev) => ({
                      ...prev,
                      nextPassword: event.target.value
                    }))
                  }
                  placeholder="8자 이상 입력"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={revealedFields.recoveryNextPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                  onClick={() => toggleRevealField("recoveryNextPassword")}
                >
                  <RevealIcon open={Boolean(revealedFields.recoveryNextPassword)} />
                </button>
              </div>
            </label>
            <label>
              <span>새 비밀번호 확인</span>
              <div className="password-field">
                <input
                  type={revealedFields.recoveryConfirmPassword ? "text" : "password"}
                  value={recoveryPasswordForm.confirmPassword}
                  onChange={(event) =>
                    setRecoveryPasswordForm((prev) => ({
                      ...prev,
                      confirmPassword: event.target.value
                    }))
                  }
                  placeholder="한 번 더 입력"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={revealedFields.recoveryConfirmPassword ? "새 비밀번호 확인 숨기기" : "새 비밀번호 확인 보기"}
                  onClick={() => toggleRevealField("recoveryConfirmPassword")}
                >
                  <RevealIcon open={Boolean(revealedFields.recoveryConfirmPassword)} />
                </button>
              </div>
            </label>
            {error ? <div className="alert error">{error}</div> : null}
            <div className="auth-actions">
              <button type="submit" disabled={authBusy}>
                {authBusy ? "저장 중..." : "새 비밀번호 저장"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => void returnToLoginFromRecovery()} disabled={authBusy}>
                로그인으로 돌아가기
              </button>
            </div>
            <p className="field-hint">링크가 만료되었으면 Supabase에서 새 재설정 메일을 다시 보내세요.</p>
          </form>
        </section>
      </div>
    );
  }

  if (!authSession) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-copy">
            <span className="auth-badge">AUTO-TAX</span>
            <h1>작업공간 로그인</h1>
            <p>플랫폼 관리자가 개통한 로그인 계정으로 로그인한 뒤 태양광 회사 작업공간을 선택해 사용합니다.</p>
          </div>
          <form className="auth-form" onSubmit={(event) => void signIn(event)}>
            <label>
              <span>로그인 계정</span>
              <input
                value={signInAccount}
                onChange={(event) => setSignInAccount(event.target.value)}
                placeholder="고객사 사용자: 로그인 아이디 / 플랫폼 관리자: 이메일"
                autoComplete="username"
                required
              />
            </label>
            <label>
              <span>비밀번호</span>
              <input
                type="password"
                value={signInPassword}
                onChange={(event) => setSignInPassword(event.target.value)}
                placeholder="비밀번호 입력"
                autoComplete="current-password"
                required
              />
            </label>
            {authNotice ? <div className="alert success">{authNotice}</div> : null}
            {error ? <div className="alert error">{error}</div> : null}
            <div className="auth-actions">
              <button type="submit" disabled={authBusy}>
                {authBusy ? "로그인 중..." : "로그인"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowSupportRequestForm((prev) => !prev)}
                disabled={supportRequestBusy}
              >
                {showSupportRequestForm ? "문의 닫기" : "요청 문의"}
              </button>
            </div>
            <p className="field-hint">계정이 없으면 `요청 문의`에서 회사명, 담당자, 연락처를 남겨주세요.</p>
          </form>
          {showSupportRequestForm ? (
            <div className="auth-form support-request-box">
              <label>
                <span>회사명</span>
                <input
                  value={supportRequestForm.companyName}
                  onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, companyName: event.target.value }))}
                  placeholder="회사명 입력"
                />
              </label>
              <label>
                <span>담당자명</span>
                <input
                  value={supportRequestForm.requesterName}
                  onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterName: event.target.value }))}
                  placeholder="담당자 이름"
                />
              </label>
              <label>
                <span>이메일</span>
                <input
                  type="email"
                  value={supportRequestForm.requesterEmail}
                  onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterEmail: event.target.value }))}
                  placeholder="reply 받을 이메일"
                />
              </label>
              <label>
                <span>연락처</span>
                <input
                  value={supportRequestForm.requesterPhone}
                  onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterPhone: event.target.value }))}
                  placeholder="전화번호 또는 휴대폰"
                />
              </label>
              <label>
                <span>요청 내용</span>
                <textarea
                  rows={5}
                  value={supportRequestForm.message}
                  onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, message: event.target.value }))}
                  placeholder="작업공간 개통 요청 내용, 필요한 기능, 문의사항을 적어주세요."
                />
              </label>
              <div className="auth-actions">
                <button type="button" onClick={() => void submitSupportRequest()} disabled={supportRequestBusy}>
                  {supportRequestBusy ? "보내는 중..." : "보내기"}
                </button>
              </div>
              <p className="field-hint">문의는 `ehdrjs0887@gmail.com`으로 접수됩니다.</p>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  if (!data || !settingsForm) {
    return <div className="loading-shell">AUTO-TAX 초기 데이터를 불러오는 중입니다.</div>;
  }

  const isPlatformAdmin = data.auth.isPlatformAdmin;
  const hasActiveWorkspace = Boolean(data.auth.activeOrganizationId);
  const currentMembership =
    (data.auth.activeOrganizationId
      ? data.auth.organizations.find((organization) => organization.organizationId === data.auth.activeOrganizationId) ?? null
      : null) ?? null;
  const activeWorkspaceName = data.auth.activeOrganizationName ?? (isPlatformAdmin ? "플랫폼 관리자" : "작업공간 없음");
  const activeRoleLabel =
    !hasActiveWorkspace && isPlatformAdmin ? "플랫폼 관리자" : getOrganizationRoleLabel(data.auth.activeOrganizationRole);
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
    mailReady: Boolean(data.settings.imapUser && data.settings.imapPass && data.settings.smtpUser && data.settings.smtpPass),
    popbillReady: data.settings.popbillConfigured,
    operatorReady: data.settings.operatorConfigured
  };
  const unmatchedMessages = data.inbox.filter((message) => message.parseStatus === "unmatched" || message.parseStatus === "failed");
  const duplicateMessages = data.inbox.filter((message) => message.parseStatus === "duplicate");
  const reprocessableMessages = data.inbox.filter((message) => message.parseStatus === "unmatched" || message.parseStatus === "failed" || message.parseStatus === "duplicate");
  const recentInboxMessages = [...data.inbox]
    .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime())
    .slice(0, 6);
  const recentIssuedDrafts = issuedDrafts.slice(0, 8);
  const recentInboxPreview = recentInboxMessages.slice(0, 4);
  const recentIssuedPreview = recentIssuedDrafts.slice(0, 4);
  const readyNowCustomers = data.customers.filter((customer) => getCustomerIssueReadiness(customer).canIssueNow);
  const blockedIssueCustomers = data.customers.filter((customer) => !getCustomerIssueReadiness(customer).canIssueNow);
  const normalizedCustomerSearch = customerSearchQuery.trim().toLocaleLowerCase("ko-KR");
  const filteredCustomers = (customerListFilter === "blocked" ? blockedIssueCustomers : data.customers).filter((customer) =>
    normalizedCustomerSearch === "" || customer.customerName.toLocaleLowerCase("ko-KR").includes(normalizedCustomerSearch)
  );
  const workLayoutClassName = "work-layout";
  const selectedCustomer = customerForm.id ? data.customers.find((customer) => customer.id === customerForm.id) ?? null : null;
  const selectedCustomerReadiness = selectedCustomer ? getCustomerIssueReadiness(selectedCustomer) : null;
  const selectedCustomerIssuedDrafts = selectedCustomer
    ? data.drafts
      .filter((draft) => draft.customerId === selectedCustomer.id && draft.status === "issued")
      .sort((left, right) => {
        const rightTime = right.issuedAt ? new Date(right.issuedAt).getTime() : 0;
        const leftTime = left.issuedAt ? new Date(left.issuedAt).getTime() : 0;
        return rightTime - leftTime || right.id - left.id;
      })
    : [];
  const customerRegistrationReady = data.customers.length > 0;
  const blockedCustomerCount = data.customers.filter((customer) => !getCustomerIssueReadiness(customer).canIssueNow).length;
  const setupChecklist = [
    { key: "gmail", label: "메일 계정 연결", done: settingsHealth.mailReady },
    { key: "popbill", label: "팝빌 연결 준비", done: settingsHealth.popbillReady },
    { key: "operator", label: "운영 정보 준비", done: settingsHealth.operatorReady },
    { key: "customer", label: "고객 1명 이상 등록", done: customerRegistrationReady }
  ];
  const setupPendingCount = setupChecklist.filter((step) => !step.done).length;
  const certAttentionCount = expiredCertCustomers.length + expiringSoonCustomers.length;
  const opsAgent = opsConsole?.renewalAutomation.agent ?? null;
  const opsJobs = opsConsole?.renewalAutomation.jobs ?? [];
  const opsLogs = opsConsole?.logs ?? [];
  const opsWorkspaces = opsConsole?.workspaces ?? [];
  const isCreatingWorkspace = busyKey === "ops-create-workspace";
  const partnerTaxInvoiceUnitCost = opsConsole?.partnerPoints.taxInvoiceUnitCost ?? null;
  const totalWorkspaceIssuedDraftCount = opsWorkspaces.reduce((sum, workspace) => sum + workspace.issuedDraftCount, 0);
  const totalWorkspaceCurrentMonthIssuedDraftCount = opsWorkspaces.reduce(
    (sum, workspace) => sum + workspace.currentMonthIssuedDraftCount,
    0
  );
  const totalWorkspaceEstimatedPointUsage =
    partnerTaxInvoiceUnitCost === null ? null : totalWorkspaceIssuedDraftCount * partnerTaxInvoiceUnitCost;
  const totalWorkspaceCurrentMonthEstimatedPointUsage =
    partnerTaxInvoiceUnitCost === null ? null : totalWorkspaceCurrentMonthIssuedDraftCount * partnerTaxInvoiceUnitCost;
  const opsAgentStatusMeta = opsAgent ? getRenewalAgentStatusMeta(opsAgent) : null;
  const opsCertificates = opsAgent?.bridge.storageProbe.certificates ?? [];
  const canManageOrganizationMembers = data.auth.activeOrganizationRole === "owner";
  const workNoticeTokens = [
    ...(setupPendingCount > 0 ? [`설정 ${setupPendingCount}개 필요`] : []),
    ...(expiredCertCustomers.length > 0 ? [`만료 ${expiredCertCustomers.length}건`] : []),
    ...(expiringSoonCustomers.length > 0 ? [`30일 이내 ${expiringSoonCustomers.length}건`] : []),
    ...(duplicateMessages.length > 0 ? [`중복 의심 ${duplicateMessages.length}건`] : [])
  ];
  const recommendedSettingsSection: SettingsSectionId = !settingsHealth.mailReady
    ? "gmail"
    : "popbill";
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
      done: settingsHealth.mailReady,
      summary: settingsHealth.mailReady ? data.settings.imapUser || "메일 연결 완료" : "메일 계정과 앱 비밀번호 입력"
    },
    {
      id: "popbill",
      step: 2,
      title: "팝빌 / 담당자",
      done: settingsHealth.popbillReady && settingsHealth.operatorReady,
      summary: settingsHealth.popbillReady && settingsHealth.operatorReady
        ? "플랫폼 키 연결 및 작업공간 운영값 준비 완료"
        : "팝빌 연결 또는 작업공간 운영값 확인 필요"
    },
    {
      id: "account",
      step: 3,
      title: "계정 보안",
      done: true,
      summary: canManageOrganizationMembers ? "로그인 비밀번호 변경 및 사용자 관리" : "로그인 비밀번호 변경"
    }
  ];
  const navItems: Array<{ id: TabId; label: string; icon: string }> = [
    ...(hasActiveWorkspace
      ? [
          { id: "work" as const, label: "오늘 작업", icon: "dashboard" },
          { id: "customers" as const, label: "고객관리", icon: "group" },
          { id: "settings" as const, label: "시스템설정", icon: "settings" }
        ]
      : []),
    ...(isPlatformAdmin ? [{ id: "ops" as const, label: "플랫폼 관리자", icon: "ops" }] : [])
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
          <span>{hasActiveWorkspace ? "작업공간" : "플랫폼"}</span>
          {hasActiveWorkspace && data.auth.organizations.length > 1 ? (
            <select
              className="workspace-select"
              value={data.auth.activeOrganizationId ?? ""}
              onChange={(event) => void changeOrganization(event.target.value)}
              disabled={busyKey !== null}
            >
              {data.auth.organizations.map((organization) => (
                <option key={organization.organizationId} value={organization.organizationId}>
                  {organization.organizationName}
                </option>
              ))}
            </select>
          ) : (
            <strong>{activeWorkspaceName}</strong>
          )}
          <p>{currentMembership?.displayName || data.auth.email || "로그인 사용자"}</p>
          <p>{activeRoleLabel}</p>
          <button className="btn-secondary sidebar-logout" onClick={() => void signOut()} disabled={busyKey !== null}>
            로그아웃
          </button>
        </div>
      </aside>

      <main
        className={
          activeTab === "work"
            ? "content content-work"
            : activeTab === "customers"
              ? "content content-customers"
              : activeTab === "settings"
                ? "content content-settings"
                : activeTab === "ops"
                  ? "content content-ops"
                : "content"
        }
      >
        <header className="hero">
          <div className="hero-main">
            <h2>{activeNavLabel}</h2>
            <div className="hero-summary">
              <span className="hero-pill">{activeWorkspaceName}</span>
              {activeTab === "ops" ? (
                <>
                  <span className="hero-pill">플랫폼 관리자 전용</span>
                  <span className="hero-pill">
                    파트너 {opsConsole?.partnerPoints.available && opsConsole.partnerPoints.partnerRemainPoint !== null ? `${formatMoney(opsConsole.partnerPoints.partnerRemainPoint)}P` : "-"}
                  </span>
                  <span className="hero-pill">로그 {opsLogs.length}건</span>
                  <span className={opsAgent?.online ? "hero-pill" : "hero-pill hero-pill-warn"}>
                    {opsAgentStatusMeta?.label ?? "에이전트 상태 확인 필요"}
                  </span>
                </>
              ) : (
                <>
                  <span className="hero-pill">팝빌 운영</span>
                  <span className="hero-pill">발행 대상 {data.counts.actionableDrafts}건</span>
                  <span className={certAttentionCount > 0 ? "hero-pill hero-pill-warn" : "hero-pill"}>인증서 주의 {certAttentionCount}건</span>
                </>
              )}
            </div>
          </div>
          <div className="hero-actions">
            <button className="btn-secondary" onClick={() => void runAction("refresh", load)} disabled={busyKey !== null}>
              <Icon name="refresh" className="button-icon" />
              새로고침
            </button>
            {hasActiveWorkspace && activeTab !== "ops" ? (
              <button onClick={() => void runAction("sync", async () => void (await api("/api/mail/sync", { method: "POST" })))} disabled={busyKey !== null}>
                <Icon name="sync" className="button-icon" />
                메일 즉시 동기화
              </button>
            ) : null}
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}

        {activeTab === "work" ? (
          <div className="work-screen">
            {workNoticeTokens.length > 0 ? (
              <section className="work-inline-bar">
                <div className="work-inline-copy">
                  <strong>확인 필요</strong>
                  <div className="work-inline-chips">
                    {workNoticeTokens.map((item) => (
                      <span key={item} className="chip chip-warn">{item}</span>
                    ))}
                  </div>
                </div>
                {setupPendingCount > 0 ? (
                  <button className="btn-secondary" onClick={() => setActiveTab("settings")}>설정 열기</button>
                ) : null}
              </section>
            ) : null}

            <section className="stats-grid stats-grid-compact work-stats">
              <StatCard label="발행 대상" value={reviewDrafts.length} tone={reviewDrafts.length > 0 ? "warn" : "default"} />
              <StatCard label="미매칭 메일" value={unmatchedMessages.length} tone={unmatchedMessages.length > 0 ? "warn" : "default"} />
              <StatCard label="인증서 주의" value={certAttentionCount} tone={certAttentionCount > 0 ? "error" : "default"} />
            </section>

            <div className={workLayoutClassName}>
              <Panel
                className="panel-work-queue"
                title="발행할 건"
                actions={
                  <>
                    <button onClick={() => void runAction("issue-all", issueAllReviewDrafts)}>전체 발행</button>
                  </>
                }
              >
                <div className="table-wrap">
                  <table className="responsive-table queue-table">
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
                            {draft.issueError ? <p className="cell-error" title={draft.issueError}>{simplifyIssueError(draft.issueError)}</p> : null}
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

              <div className="work-side-column">
                <Panel
                  className="panel-work-status"
                title="운영 체크"
                actions={
                  <>
                    <button onClick={() => void runAction("cert-refresh-all", refreshAllCertificateStatuses)}>인증서 점검</button>
                  </>
                }
              >
                <div className="info-grid">
                    <div>
                      <span>메일</span>
                      <strong>{settingsHealth.mailReady ? "준비됨" : "설정 필요"}</strong>
                    </div>
                    <div>
                      <span>팝빌</span>
                      <strong>{settingsHealth.popbillReady ? "준비됨" : "설정 필요"}</strong>
                    </div>
                    <div>
                      <span>발행 대상</span>
                      <strong>{reviewDrafts.length}건</strong>
                    </div>
                    <div>
                      <span>인증서 주의</span>
                      <strong>{certAttentionCount}건</strong>
                    </div>
                  </div>
                  <div className="compact-status-stack">
                    <div className="history-split">
                      <section className="history-block">
                        <header className="history-block-head">
                          <div className="history-title-row">
                            <strong>최근 처리</strong>
                            <div className="history-tabs">
                              <button
                                type="button"
                                className={workFeedTab === "inbox" ? "btn-secondary active-filter" : "btn-secondary"}
                                onClick={() => setWorkFeedTab("inbox")}
                              >
                                최근 수신 메일
                              </button>
                              <button
                                type="button"
                                className={workFeedTab === "issued" ? "btn-secondary active-filter" : "btn-secondary"}
                                onClick={() => setWorkFeedTab("issued")}
                              >
                                최근 발행 완료
                              </button>
                            </div>
                          </div>
                          <div className="history-head-action">
                            {workFeedTab === "inbox" && reprocessableMessages.length > 0 ? (
                              <button className="btn-secondary" onClick={() => void runAction("reprocess-all-unmatched", reprocessAllUnmatchedMessages)}>재처리</button>
                            ) : (
                              <span className="history-head-spacer" />
                            )}
                          </div>
                        </header>
                        <div className="history-list">
                          {workFeedTab === "inbox"
                            ? recentInboxPreview.map((message) => (
                                <div key={message.id} className="history-row">
                                  <div>
                                    <strong>{message.parsedData?.plantName ?? "미확인 메일"}</strong>
                                    <span>{formatDateTime(message.receivedAt)}</span>
                                  </div>
                                  <div className="history-actions">
                                    <span className={`status status-${message.parseStatus}`}>{getParseStatusLabel(message.parseStatus)}</span>
                                    {message.parseStatus === "unmatched" || message.parseStatus === "failed" || message.parseStatus === "duplicate" ? (
                                      <button className="btn-secondary" onClick={() => void runAction(`reprocess-${message.id}`, async () => void (await reprocessInboxMessage(message.id)))}>재처리</button>
                                    ) : null}
                                  </div>
                                </div>
                              ))
                            : recentIssuedPreview.map((draft) => (
                                <div key={draft.id} className="history-row">
                                  <div>
                                    <strong>{draft.customerName}</strong>
                                    <span>{formatMoney(draft.totalAmount)}원 · {formatDateTime(draft.issuedAt)}</span>
                                  </div>
                                  <div className="history-actions">
                                    <button className="btn-secondary" disabled={busyKey !== null} onClick={() => void runAction(`draft-view-${draft.id}`, async () => void (await openDraftPopbillUrl(draft.id, "view-url")))}>보기</button>
                                    <button className="btn-danger" disabled={busyKey !== null} onClick={() => void runAction(`draft-cancel-${draft.id}`, async () => void (await cancelIssuedDraft(draft.id)))}>취소</button>
                                  </div>
                                </div>
                              ))}
                          {workFeedTab === "inbox" && recentInboxPreview.length === 0 ? <div className="empty">최근 수신 메일이 없습니다.</div> : null}
                          {workFeedTab === "issued" && recentIssuedPreview.length === 0 ? <div className="empty">최근 발행 완료 이력이 없습니다.</div> : null}
                        </div>
                      </section>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "customers" ? (
          <div className="customers-screen">
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
                <div className="customer-list-toolbar">
                  <div className="customer-list-search">
                    <input
                      placeholder="고객명 검색"
                      value={customerSearchQuery}
                      onChange={(event) => setCustomerSearchQuery(event.target.value)}
                    />
                  </div>
                  <div className="customer-list-filters">
                    <button
                      type="button"
                      className={customerListFilter === "all" ? "btn-secondary active-filter" : "btn-secondary"}
                      onClick={() => setCustomerListFilter("all")}
                    >
                      전체 {data.customers.length}명
                    </button>
                    <button
                      type="button"
                      className={customerListFilter === "blocked" ? "btn-secondary active-filter" : "btn-secondary"}
                      onClick={() => setCustomerListFilter("blocked")}
                    >
                      준비 필요만 {blockedCustomerCount}명
                    </button>
                  </div>
                </div>
                <div className="list">
                  {filteredCustomers.map((customer) => {
                    const readiness = getCustomerIssueReadiness(customer);
                    const isSelected = customerForm.id === customer.id;

                    return (
                      <button
                        key={customer.id}
                        type="button"
                        className={`customer-summary ${isSelected ? "selected" : ""} ${readiness.canIssueNow ? "customer-summary-ready" : "customer-summary-blocked"}`}
                        onClick={() => {
                          setCreatingCustomer(false);
                          setCustomerDetailTab("info");
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
                  {filteredCustomers.length === 0 ? (
                    <div className="empty">
                      {customerSearchQuery.trim() !== ""
                        ? "검색 결과가 없습니다."
                        : customerListFilter === "blocked"
                          ? "준비 필요 고객이 없습니다."
                          : "등록된 고객이 없습니다."}
                    </div>
                  ) : null}
                </div>
              </Panel>

              <Panel
                className="panel-customer-editor"
                title={selectedCustomer ? `${selectedCustomer.customerName}` : "새 고객 등록"}
                actions={selectedCustomer && customerDetailTab === "info" ? (
                  <button
                    onClick={() => void runAction("save-customer-top", saveCustomer)}
                  >
                    고객 저장
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
                        <span>발행 방식</span>
                        <strong>{getIssueModeLabel(selectedCustomer.issueMode)}</strong>
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
                      {selectedCustomer.popbillState !== "joined" && (
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
                    <details className="customer-detail-secondary">
                      <summary>더보기</summary>
                      <div className="customer-detail-secondary-actions">
                        {selectedCustomer.popbillState === "joined" ? (
                          <button className="btn-ghost" onClick={() => void runAction(`reset-popbill-${selectedCustomer.id}`, async () => void (await resetPopbillLink(selectedCustomer)))}>
                            연결 해제
                          </button>
                        ) : null}
                        <button className="btn-ghost btn-danger" onClick={() => void runAction(`delete-customer-${selectedCustomer.id}`, async () => void (await deleteCustomer(selectedCustomer)))}>
                          고객 삭제
                        </button>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="customer-empty-state">
                    <strong>새 고객을 등록합니다.</strong>
                    <span>기존 고객을 수정하려면 왼쪽 목록에서 고객을 선택하세요.</span>
                  </div>
                )}
                {selectedCustomer ? (
                  <div className="customer-detail-tabs">
                    <button
                      type="button"
                      className={customerDetailTab === "info" ? "btn-secondary active-filter" : "btn-secondary"}
                      onClick={() => setCustomerDetailTab("info")}
                    >
                      기본 정보
                    </button>
                    <button
                      type="button"
                      className={customerDetailTab === "history" ? "btn-secondary active-filter" : "btn-secondary"}
                      onClick={() => setCustomerDetailTab("history")}
                    >
                      발행 이력 {selectedCustomerIssuedDrafts.length}건
                    </button>
                  </div>
                ) : null}

                {selectedCustomer && customerDetailTab === "history" ? (
                  <div className="customer-history-list">
                    {selectedCustomerIssuedDrafts.length > 0 ? (
                      selectedCustomerIssuedDrafts.map((draft) => {
                        const confirmNumber = getDraftConfirmNumber(draft);
                        return (
                          <article key={draft.id} className="customer-history-card">
                            <div className="customer-history-head">
                              <div>
                                <strong>{draft.itemName}</strong>
                                <span>{formatDateTime(draft.issuedAt)}</span>
                              </div>
                              <span className="chip chip-success">발행 완료</span>
                            </div>
                            <div className="customer-history-meta">
                              <span>공급가액 {formatMoney(draft.supplyCost)}원</span>
                              <span>합계 {formatMoney(draft.totalAmount)}원</span>
                              <span>관리번호 {draft.popbillMgtKey || "-"}</span>
                              <span>승인번호 {confirmNumber ?? "-"}</span>
                            </div>
                            <div className="customer-history-actions">
                              <button
                                className="btn-secondary"
                                disabled={busyKey !== null}
                                onClick={() => void runAction(`draft-info-${draft.id}`, async () => void (await showDraftPopbillInfo(draft.id)))}
                              >
                                상태조회
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={busyKey !== null}
                                onClick={() => void runAction(`draft-view-customer-${draft.id}`, async () => void (await openDraftPopbillUrl(draft.id, "view-url")))}
                              >
                                보기
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={busyKey !== null}
                                onClick={() => void runAction(`draft-print-customer-${draft.id}`, async () => void (await openDraftPopbillUrl(draft.id, "print-url")))}
                              >
                                인쇄
                              </button>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className="empty">이 고객의 발행 이력이 없습니다.</div>
                    )}
                  </div>
                ) : (
                  <>
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
                        발행 방식
                        <select
                          value={customerForm.issueMode}
                          onChange={(event) =>
                            setCustomerForm((prev) => ({
                              ...prev,
                              issueMode:
                                prev.id === null ? "review" : event.target.value === "auto" ? "auto" : "review"
                            }))
                          }
                          disabled={customerForm.id === null}
                        >
                          <option value="review">검수 후 발행</option>
                          <option value="auto" disabled={customerForm.id === null}>월 자동 발행</option>
                        </select>
                        <span className="field-hint">
                          {customerForm.id === null
                            ? "처음 등록하는 고객은 먼저 검수 후 발행으로 저장됩니다. 저장 후 수정 화면에서 월 자동 발행으로 바꿀 수 있습니다."
                            : "자동 발행 고객은 작업공간 설정의 월 자동 실행일/시각에 메일 동기화 후 바로 발행되고, 검수 고객은 초안만 만들어집니다."}
                        </span>
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
                    {!selectedCustomer ? (
                      <div className="button-row">
                        <button onClick={() => void runAction("save-customer", saveCustomer)}>고객 등록</button>
                      </div>
                    ) : null}
                  </>
                )}
              </Panel>
            </div>
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
                {activeSettingsSection !== "account" ? (
                  <div className="settings-sidebar-actions">
                    <button onClick={() => void runAction("save-settings", saveSettings)}>설정 저장</button>
                  </div>
                ) : null}
                <div className="settings-inline-note">
                  <strong>{customerRegistrationReady ? `고객 ${data.customers.length}명 등록됨` : "고객 등록이 필요합니다."}</strong>
                  <span>설정을 마치면 고객관리에서 고객을 등록하고 메일 동기화 테스트를 진행하면 됩니다.</span>
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
                  done={settingsHealth.mailReady}
                  note="한전 메일을 읽고 알림을 보내는 메일 계정을 연결합니다."
                  actions={
                    <>
                      <button onClick={() => void runAction("mail-test", testMailSettings, { reload: false })}>메일 연결 테스트</button>
                    </>
                  }
                >
                  <div className="form-grid">
                    <div className="settings-detected-provider full">
                      <span>메일 수집 시작 기준</span>
                      <strong>{settingsForm.mailSyncStartAt ? formatDateTime(settingsForm.mailSyncStartAt) : "설정 안 됨"}</strong>
                      <div className="button-row">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setSettingsForm((prev) =>
                              prev ? { ...prev, mailSyncStartAt: new Date().toISOString() } : prev
                            )
                          }
                        >
                          지금부터 시작
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setSettingsForm((prev) => (prev ? { ...prev, mailSyncStartAt: "" } : prev))
                          }
                        >
                          기준 해제
                        </button>
                      </div>
                    </div>
                    <div className="settings-detected-provider full">
                      <span>감지된 메일 서비스</span>
                      <strong>{MAIL_PROVIDER_CONFIG[inferMailProviderFromAddress(settingsForm.mailAddress, settingsForm.mailProvider)].label}</strong>
                    </div>
                    <label>
                      메일 주소
                      <input
                        placeholder="example@mail.com"
                        value={settingsForm.mailAddress}
                        onChange={(event) =>
                          setSettingsForm((prev) => {
                            if (!prev) return prev;
                            const nextAddress = event.target.value;
                            const nextProvider = inferMailProviderFromAddress(nextAddress, prev.mailProvider);
                            const config = MAIL_PROVIDER_CONFIG[nextProvider];
                            return {
                              ...prev,
                              mailAddress: nextAddress,
                              mailProvider: nextProvider,
                              imapHost: config.imapHost,
                              imapPort: config.imapPort,
                              imapSecure: config.imapSecure,
                              smtpHost: config.smtpHost,
                              smtpPort: config.smtpPort,
                              smtpSecure: config.smtpSecure
                            };
                          })
                        }
                      />
                      <span className="field-hint">한전 메일을 읽고 알림 메일을 보낼 때 함께 사용하는 주소입니다. 도메인을 보고 서비스가 자동 감지됩니다.</span>
                    </label>
                    <label>
                      앱 비밀번호
                      <div className="password-field">
                        <input
                          type={revealedFields.mailPassword ? "text" : "password"}
                          value={settingsForm.mailPassword}
                          onChange={(event) => setSettingsForm((prev) => prev && { ...prev, mailPassword: event.target.value })}
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          aria-label={revealedFields.mailPassword ? "앱 비밀번호 숨기기" : "앱 비밀번호 보기"}
                          onClick={() => toggleRevealField("mailPassword")}
                        >
                          <RevealIcon open={Boolean(revealedFields.mailPassword)} />
                        </button>
                      </div>
                      <span className="field-hint">위 메일 주소로 로그인할 때 쓰는 비밀번호입니다. 수신/발신 모두 이 값을 사용합니다.</span>
                    </label>
                    <label className="full">
                      알림 수신 메일
                      <textarea rows={4} value={settingsForm.notificationEmailsText} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, notificationEmailsText: event.target.value })} />
                      <span className="field-hint">파싱 실패나 발행 실패 알림을 받을 주소입니다. 여러 개면 줄바꿈이나 쉼표로 구분합니다.</span>
                    </label>
                    <div className="helper-box full">
                      <strong>월 자동 처리</strong>
                      <div className="fields three-column">
                        <label>
                          자동 실행
                          <select
                            value={settingsForm.schedulerEnabled ? "on" : "off"}
                            onChange={(event) =>
                              setSettingsForm((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      schedulerEnabled: event.target.value === "on"
                                    }
                                  : prev
                              )
                            }
                          >
                            <option value="on">사용</option>
                            <option value="off">중지</option>
                          </select>
                        </label>
                        <label>
                          실행일
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={settingsForm.defaultIssueDay}
                            onChange={(event) => setSettingsForm((prev) => (prev ? { ...prev, defaultIssueDay: event.target.value } : prev))}
                          />
                        </label>
                        <label>
                          실행 시각
                          <div className="inline-time-fields">
                            <input
                              type="number"
                              min="0"
                              max="23"
                              value={settingsForm.defaultIssueHour}
                              onChange={(event) => setSettingsForm((prev) => (prev ? { ...prev, defaultIssueHour: event.target.value } : prev))}
                            />
                            <span>:</span>
                            <input
                              type="number"
                              min="0"
                              max="59"
                              value={settingsForm.defaultIssueMinute}
                              onChange={(event) => setSettingsForm((prev) => (prev ? { ...prev, defaultIssueMinute: event.target.value } : prev))}
                            />
                          </div>
                        </label>
                      </div>
                      <span>기본값은 매월 26일입니다. 이 시각이 되면 메일을 자동으로 읽고, 자동 발행 고객은 바로 전자세금계산서를 발행합니다.</span>
                    </div>
                  </div>
                </SetupPanel>
              ) : null}

              {activeSettingsSection === "popbill" ? (
                <SetupPanel
                  step={2}
                  className="panel-settings-popbill"
                  title="팝빌 기본값"
                  done={settingsHealth.popbillReady && settingsHealth.operatorReady}
                  note="고객사에서 직접 관리해야 하는 발행 기본값만 입력합니다."
                >
                  <div className="settings-field-stack">
                    <section className="settings-field-group">
                      <div className="settings-field-group-head">
                        <strong>작업공간별 운영값</strong>
                        <span>신규 고객 팝빌 계정 생성과 발행 처리에 쓰는 기본값입니다.</span>
                      </div>
                      <div className="fields two-column">
                        <label>
                          팝빌 사용자 ID 접두어
                          <input
                            value={settingsForm.popbillUserIdPrefix}
                            onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillUserIdPrefix: event.target.value })}
                            placeholder="예: TEST_"
                          />
                          <span className="field-hint">신규 고객 팝빌 ID를 만들 때 앞에 붙는 값입니다. 예: `TEST_001` · 다른 고객사와 중복되면 저장할 수 없습니다.</span>
                        </label>
                        <label>
                          신규 고객 기본 비밀번호
                          <div className="password-field">
                            <input
                              type={revealedFields.popbillSharedPassword ? "text" : "password"}
                              value={settingsForm.popbillSharedPassword}
                              onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillSharedPassword: event.target.value })}
                              placeholder="신규 고객 공통 비밀번호"
                            />
                            <button
                              type="button"
                              className="password-toggle"
                              aria-label={revealedFields.popbillSharedPassword ? "팝빌 기본 비밀번호 숨기기" : "팝빌 기본 비밀번호 보기"}
                              onClick={() => toggleRevealField("popbillSharedPassword")}
                            >
                              <RevealIcon open={Boolean(revealedFields.popbillSharedPassword)} />
                            </button>
                          </div>
                          <span className="field-hint">신규 고객 팝빌 계정을 만들 때 초기 비밀번호로 사용합니다.</span>
                        </label>
                        <label>
                          운영 담당자명
                          <input
                            value={settingsForm.operatorContactName}
                            onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactName: event.target.value })}
                            placeholder="담당자 이름"
                          />
                        </label>
                        <label>
                          운영 담당자 이메일
                          <input
                            type="email"
                            value={settingsForm.operatorContactEmail}
                            onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactEmail: event.target.value })}
                            placeholder="operator@example.com"
                          />
                        </label>
                        <label>
                          운영 담당자 연락처
                          <input
                            value={settingsForm.operatorContactTel}
                            onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactTel: event.target.value })}
                            placeholder="01012345678"
                          />
                        </label>
                      </div>
                      <div className="helper-box full">
                        <strong>현재 상태</strong>
                        <span>팝빌 연결: {settingsHealth.popbillReady ? "준비됨" : "설정 필요"}</span>
                        <span>작업공간 운영값: {settingsHealth.operatorReady ? "준비됨" : "설정 필요"}</span>
                      </div>
                    </section>
                  </div>
                </SetupPanel>
              ) : null}

              {activeSettingsSection === "account" ? (
                <div className="settings-account-stack">
                  <Panel
                    title="비밀번호 변경"
                    subtitle="현재 로그인한 계정의 비밀번호를 바꿉니다."
                    actions={
                      <button onClick={() => void runAction("change-password", changePassword, { reload: false })}>
                        비밀번호 변경
                      </button>
                    }
                  >
                    <div className="form-grid">
                      <label>
                        새 비밀번호
                        <div className="password-field">
                          <input
                            type={revealedFields.nextPassword ? "text" : "password"}
                            value={passwordChangeForm.nextPassword}
                            onChange={(event) =>
                              setPasswordChangeForm((prev) => ({
                                ...prev,
                                nextPassword: event.target.value
                              }))
                            }
                            placeholder="8자 이상 입력"
                          />
                          <button
                            type="button"
                            className="password-toggle"
                            aria-label={revealedFields.nextPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                            onClick={() => toggleRevealField("nextPassword")}
                          >
                            <RevealIcon open={Boolean(revealedFields.nextPassword)} />
                          </button>
                        </div>
                      </label>
                      <label>
                        새 비밀번호 확인
                        <div className="password-field">
                          <input
                            type={revealedFields.confirmPassword ? "text" : "password"}
                            value={passwordChangeForm.confirmPassword}
                            onChange={(event) =>
                              setPasswordChangeForm((prev) => ({
                                ...prev,
                                confirmPassword: event.target.value
                              }))
                            }
                            placeholder="한 번 더 입력"
                          />
                          <button
                            type="button"
                            className="password-toggle"
                            aria-label={revealedFields.confirmPassword ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
                            onClick={() => toggleRevealField("confirmPassword")}
                          >
                            <RevealIcon open={Boolean(revealedFields.confirmPassword)} />
                          </button>
                        </div>
                        <span className="field-hint">새 비밀번호는 8자 이상으로 입력하고, 두 칸이 정확히 같아야 저장됩니다.</span>
                      </label>
                    </div>
                  </Panel>

                  <Panel
                    title="작업공간 사용자 관리"
                    subtitle={
                      canManageOrganizationMembers
                        ? "owner가 같은 회사 내부 사용자를 추가하거나 제거할 수 있습니다."
                        : "현재 계정은 사용자 관리 권한이 없습니다."
                    }
                    actions={
                      canManageOrganizationMembers ? (
                        <button onClick={() => void runAction("create-organization-member", createOrganizationMember, { reload: false })}>
                          사용자 추가
                        </button>
                      ) : null
                    }
                  >
                    {canManageOrganizationMembers ? (
                      <>
                        <div className="form-grid">
                          <label>
                            로그인 아이디
                            <input
                              value={organizationMemberForm.loginId}
                              onChange={(event) =>
                                setOrganizationMemberForm((prev) => ({
                                  ...prev,
                                  loginId: event.target.value
                                }))
                              }
                              placeholder="예: team01"
                            />
                          </label>
                          <label>
                            이름
                            <input
                              value={organizationMemberForm.displayName}
                              onChange={(event) =>
                                setOrganizationMemberForm((prev) => ({
                                  ...prev,
                                  displayName: event.target.value
                                }))
                              }
                              placeholder="표시 이름"
                            />
                          </label>
                          <label className="full">
                            임시 비밀번호
                            <div className="password-field">
                              <input
                                type={revealedFields.organizationMemberPassword ? "text" : "password"}
                                value={organizationMemberForm.password}
                                onChange={(event) =>
                                  setOrganizationMemberForm((prev) => ({
                                    ...prev,
                                    password: event.target.value
                                  }))
                                }
                                placeholder="기존 계정이면 비워두고, 새 계정이면 8자 이상 입력"
                              />
                              <button
                                type="button"
                                className="password-toggle"
                                aria-label={revealedFields.organizationMemberPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"}
                                onClick={() => toggleRevealField("organizationMemberPassword")}
                              >
                                <RevealIcon open={Boolean(revealedFields.organizationMemberPassword)} />
                              </button>
                            </div>
                            <span className="field-hint">이미 존재하는 로그인 아이디면 현재 계정을 멤버로 연결하고, 처음 만드는 로그인 아이디면 임시 비밀번호가 필요합니다.</span>
                            <span className="field-hint">같은 회사에서 쓸 로그인 아이디입니다. 영어, 숫자, `.`, `_`, `-`만 권장합니다.</span>
                          </label>
                        </div>

                        <div className="helper-box">
                          <strong>현재 사용자 {organizationMembers.length}명</strong>
                          <span>소유자(owner)는 여기서 삭제할 수 없습니다.</span>
                        </div>

                        <div className="workspace-member-list">
                          {organizationMembers.length > 0 ? (
                            organizationMembers.map((member) => {
                              const isCurrentUser = member.userId === data.auth.userId;
                              const isOwner = member.role === "owner";
                              const canRemove = !isOwner && !isCurrentUser;
                              const canResetPassword = !isOwner;
                              const isResetTarget =
                                passwordResetTarget?.kind === "member" &&
                                passwordResetTarget.membershipId === member.membershipId;

                              return (
                                <article key={member.membershipId} className="workspace-member-card">
                                  <div className="workspace-member-card-head">
                                    <div>
                                      <strong>{member.displayName || member.loginId || "이름 없음"}</strong>
                                      <span>{member.loginId || "로그인 아이디 없음"}</span>
                                    </div>
                                    <span className={isOwner ? "chip chip-success" : "chip"}>
                                      {getWorkspaceMemberRoleLabel(member.role)}
                                    </span>
                                  </div>
                                  <div className="workspace-member-card-meta">
                                    <span>등록일 {formatDateTime(member.createdAt)}</span>
                                    {isCurrentUser ? <span>현재 로그인 계정</span> : null}
                                  </div>
                                  <div className="workspace-member-card-actions">
                                    {canResetPassword ? (
                                      <button
                                        className="btn-secondary"
                                        disabled={busyKey !== null}
                                        onClick={() => openMemberPasswordReset(member)}
                                      >
                                        임시 비밀번호 재설정
                                      </button>
                                    ) : null}
                                    {canRemove ? (
                                      <button
                                        className="btn-secondary btn-danger"
                                        disabled={busyKey !== null}
                                        onClick={() => void runAction(`remove-organization-member-${member.membershipId}`, async () => void (await removeOrganizationMember(member)), { reload: false })}
                                      >
                                        제거
                                      </button>
                                    ) : (
                                      <span className="field-hint">
                                        {isOwner ? "owner 계정 비밀번호는 플랫폼 관리자 탭에서 재설정합니다." : "현재 로그인한 계정입니다."}
                                      </span>
                                    )}
                                  </div>
                                  {isResetTarget ? (
                                    <div className="helper-box-stack inline-password-reset">
                                      <strong>{member.loginId ?? "선택한 사용자"} 임시 비밀번호 재설정</strong>
                                      <div className="form-grid">
                                        <label>
                                          새 임시 비밀번호
                                          <div className="password-field">
                                            <input
                                              type={revealedFields.memberResetNextPassword ? "text" : "password"}
                                              value={passwordResetForm.nextPassword}
                                              onChange={(event) =>
                                                setPasswordResetForm((prev) => ({
                                                  ...prev,
                                                  nextPassword: event.target.value
                                                }))
                                              }
                                              placeholder="8자 이상 입력"
                                            />
                                            <button
                                              type="button"
                                              className="password-toggle"
                                              aria-label={revealedFields.memberResetNextPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"}
                                              onClick={() => toggleRevealField("memberResetNextPassword")}
                                            >
                                              <RevealIcon open={Boolean(revealedFields.memberResetNextPassword)} />
                                            </button>
                                          </div>
                                        </label>
                                        <label>
                                          새 임시 비밀번호 확인
                                          <div className="password-field">
                                            <input
                                              type={revealedFields.memberResetConfirmPassword ? "text" : "password"}
                                              value={passwordResetForm.confirmPassword}
                                              onChange={(event) =>
                                                setPasswordResetForm((prev) => ({
                                                  ...prev,
                                                  confirmPassword: event.target.value
                                                }))
                                              }
                                              placeholder="한 번 더 입력"
                                            />
                                            <button
                                              type="button"
                                              className="password-toggle"
                                              aria-label={revealedFields.memberResetConfirmPassword ? "임시 비밀번호 확인 숨기기" : "임시 비밀번호 확인 보기"}
                                              onClick={() => toggleRevealField("memberResetConfirmPassword")}
                                            >
                                              <RevealIcon open={Boolean(revealedFields.memberResetConfirmPassword)} />
                                            </button>
                                          </div>
                                        </label>
                                      </div>
                                      <div className="button-row">
                                        <button
                                          onClick={() =>
                                            void runAction(
                                              `reset-member-password-${member.membershipId}`,
                                              submitPasswordReset,
                                              { reload: false }
                                            )
                                          }
                                        >
                                          임시 비밀번호 저장
                                        </button>
                                        <button
                                          type="button"
                                          className="btn-secondary"
                                          onClick={cancelPasswordReset}
                                        >
                                          취소
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </article>
                              );
                            })
                          ) : (
                            <div className="empty">등록된 작업공간 사용자가 없습니다.</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="helper-box-stack">
                        <strong>사용자 관리 권한 없음</strong>
                        <span>이 작업공간의 owner만 회사 내부 사용자를 추가하거나 제거할 수 있습니다.</span>
                      </div>
                    )}
                  </Panel>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "ops" ? (
          <div className="ops-layout">
            {opsConsole ? (
              <>
                <Panel
                  className="panel-ops-workspace-create"
                  title="고객사 작업공간 개통"
                  subtitle={isCreatingWorkspace ? "고객사 작업공간과 첫 owner 계정을 만드는 중입니다. 잠시만 기다려주세요." : "새 고객사를 만들고 첫 owner 로그인 아이디를 바로 연결합니다."}
                  actions={
                    <button disabled={busyKey !== null} onClick={() => void runAction("ops-create-workspace", createWorkspace)}>
                      {isCreatingWorkspace ? "작업공간 개통 중..." : "작업공간 개통"}
                    </button>
                  }
                >
                  {isCreatingWorkspace ? (
                    <div className="helper-box full-width">
                      <strong>개통 진행 중</strong>
                      <span>계정 확인, 작업공간 생성, 첫 owner 연결을 순서대로 처리하고 있습니다. 완료될 때까지 창을 닫지 말고 잠시 기다려주세요.</span>
                    </div>
                  ) : null}
                  <div className="form-grid">
                    <label>
                      고객사명
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.organizationName}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, organizationName: event.target.value }))}
                        placeholder="예: 해성태양광"
                      />
                    </label>
                    <label>
                      사업자번호
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.organizationBusinessNumber}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, organizationBusinessNumber: event.target.value }))}
                        placeholder="숫자만 입력"
                      />
                    </label>
                    <label>
                      첫 owner 로그인 아이디
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.ownerLoginId}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, ownerLoginId: event.target.value }))}
                        placeholder="예: admin01"
                      />
                    </label>
                    <label>
                      owner 이름
                      <input
                        disabled={busyKey !== null}
                        value={opsWorkspaceForm.ownerDisplayName}
                        onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, ownerDisplayName: event.target.value }))}
                        placeholder="담당자 이름"
                      />
                    </label>
                    <label className="full">
                      임시 비밀번호
                      <div className="password-field">
                        <input
                          disabled={busyKey !== null}
                          type={revealedFields.opsOwnerPassword ? "text" : "password"}
                          value={opsWorkspaceForm.ownerPassword}
                          onChange={(event) => setOpsWorkspaceForm((prev) => ({ ...prev, ownerPassword: event.target.value }))}
                          placeholder="기존 사용자면 비워두고, 새 사용자면 8자 이상 입력"
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          disabled={busyKey !== null}
                          aria-label={revealedFields.opsOwnerPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"}
                          onClick={() => toggleRevealField("opsOwnerPassword")}
                        >
                          <RevealIcon open={Boolean(revealedFields.opsOwnerPassword)} />
                        </button>
                      </div>
                      <span className="field-hint">이미 존재하는 로그인 아이디면 기존 계정을 owner로 연결하고, 처음 만드는 로그인 아이디면 임시 비밀번호가 필요합니다.</span>
                    </label>
                  </div>
                </Panel>

                <section className="stats-grid stats-grid-compact ops-stats">
                  <StatCard
                    label="파트너 포인트"
                    value={opsConsole.partnerPoints.available && opsConsole.partnerPoints.partnerRemainPoint !== null ? opsConsole.partnerPoints.partnerRemainPoint : 0}
                    tone={opsConsole.partnerPoints.available ? "default" : "warn"}
                  />
                  <StatCard
                    label="이번 달 발행"
                    value={totalWorkspaceCurrentMonthIssuedDraftCount}
                    tone={totalWorkspaceCurrentMonthIssuedDraftCount > 0 ? "default" : "warn"}
                  />
                  <StatCard
                    label={partnerTaxInvoiceUnitCost === null ? "누적 발행" : "누적 추정 사용"}
                    value={partnerTaxInvoiceUnitCost === null ? totalWorkspaceIssuedDraftCount : totalWorkspaceEstimatedPointUsage ?? 0}
                    tone="default"
                  />
                  <StatCard label="운영 로그" value={opsLogs.length} tone={opsLogs.some((log) => log.level === "error") ? "error" : "default"} />
                  <StatCard label="진단 작업" value={opsJobs.length} tone={opsJobs.some((job) => job.status === "failed") ? "warn" : "default"} />
                </section>

                <Panel className="panel-ops-workspaces" title="개통된 고객사 작업공간">
                  <p className="ops-helper-text">
                    고객사별 발행 완료 건수를 기준으로 사용량을 집계합니다.
                    {partnerTaxInvoiceUnitCost !== null
                      ? ` 현재 팝빌 전자세금계산서 단가 ${formatMoney(partnerTaxInvoiceUnitCost)}P 기준 추정 사용 포인트도 함께 표시합니다.`
                      : " 팝빌 전자세금계산서 단가를 읽지 못해 추정 포인트는 아직 계산하지 못했습니다."}
                  </p>
                  <div className="ops-list">
                    {opsWorkspaces.length > 0 ? (
                      opsWorkspaces.map((workspace) => {
                        const isOwnerResetTarget =
                          passwordResetTarget?.kind === "owner" &&
                          passwordResetTarget.organizationId === workspace.organizationId;
                        const workspaceEstimatedPointUsage = getWorkspaceEstimatedPointUsage(workspace, partnerTaxInvoiceUnitCost);
                        const workspaceCurrentMonthEstimatedPointUsage = getWorkspaceCurrentMonthEstimatedPointUsage(
                          workspace,
                          partnerTaxInvoiceUnitCost
                        );

                        return (
                          <article key={workspace.organizationId} className="ops-card">
                            <div className="ops-card-head">
                              <div>
                                <strong>{workspace.organizationName}</strong>
                                <span>{workspace.organizationBusinessNumber || "사업자번호 없음"}</span>
                              </div>
                              <span className={`chip ${workspace.organizationStatus === "active" ? "chip-success" : workspace.organizationStatus === "trial" ? "chip-warn" : "chip-danger"}`}>
                                {getOrganizationStatusLabel(workspace.organizationStatus)}
                              </span>
                            </div>
                            <div className="ops-card-meta">
                              <span>owner: {workspace.ownerDisplayName ? `${workspace.ownerDisplayName} · ` : ""}{workspace.ownerLoginId ?? "-"}</span>
                              <span>멤버 {workspace.memberCount}명</span>
                              <span>플랜 {workspace.organizationPlanCode}</span>
                              <span>누적 발행 {formatMoney(workspace.issuedDraftCount)}건</span>
                              <span>이번 달 발행 {formatMoney(workspace.currentMonthIssuedDraftCount)}건</span>
                              <span>
                                누적 추정 사용 {workspaceEstimatedPointUsage !== null ? `${formatMoney(workspaceEstimatedPointUsage)}P` : "-"}
                              </span>
                              <span>
                                이번 달 추정 사용 {workspaceCurrentMonthEstimatedPointUsage !== null ? `${formatMoney(workspaceCurrentMonthEstimatedPointUsage)}P` : "-"}
                              </span>
                              <span>최근 발행 {formatDateTime(workspace.lastIssuedAt)}</span>
                              <span>생성 {formatDateTime(workspace.createdAt)}</span>
                            </div>
                            <div className="ops-card-actions">
                              <button
                                className="btn-secondary"
                                disabled={busyKey !== null}
                                onClick={() => openOwnerPasswordReset(workspace)}
                              >
                                owner 비밀번호 재설정
                              </button>
                            </div>
                            {isOwnerResetTarget ? (
                              <div className="helper-box-stack inline-password-reset">
                                <strong>{workspace.organizationName} owner 임시 비밀번호 재설정</strong>
                                <div className="form-grid">
                                  <label>
                                    새 임시 비밀번호
                                    <div className="password-field">
                                      <input
                                        type={revealedFields.ownerResetNextPassword ? "text" : "password"}
                                        value={passwordResetForm.nextPassword}
                                        onChange={(event) =>
                                          setPasswordResetForm((prev) => ({
                                            ...prev,
                                            nextPassword: event.target.value
                                          }))
                                        }
                                        placeholder="8자 이상 입력"
                                      />
                                      <button
                                        type="button"
                                        className="password-toggle"
                                        aria-label={revealedFields.ownerResetNextPassword ? "임시 비밀번호 숨기기" : "임시 비밀번호 보기"}
                                        onClick={() => toggleRevealField("ownerResetNextPassword")}
                                      >
                                        <RevealIcon open={Boolean(revealedFields.ownerResetNextPassword)} />
                                      </button>
                                    </div>
                                  </label>
                                  <label>
                                    새 임시 비밀번호 확인
                                    <div className="password-field">
                                      <input
                                        type={revealedFields.ownerResetConfirmPassword ? "text" : "password"}
                                        value={passwordResetForm.confirmPassword}
                                        onChange={(event) =>
                                          setPasswordResetForm((prev) => ({
                                            ...prev,
                                            confirmPassword: event.target.value
                                          }))
                                        }
                                        placeholder="한 번 더 입력"
                                      />
                                      <button
                                        type="button"
                                        className="password-toggle"
                                        aria-label={revealedFields.ownerResetConfirmPassword ? "임시 비밀번호 확인 숨기기" : "임시 비밀번호 확인 보기"}
                                        onClick={() => toggleRevealField("ownerResetConfirmPassword")}
                                      >
                                        <RevealIcon open={Boolean(revealedFields.ownerResetConfirmPassword)} />
                                      </button>
                                    </div>
                                  </label>
                                </div>
                                <div className="button-row">
                                  <button
                                    onClick={() =>
                                      void runAction(
                                        `reset-owner-password-${workspace.organizationId}`,
                                        submitPasswordReset,
                                        { reload: false }
                                      )
                                    }
                                  >
                                    임시 비밀번호 저장
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={cancelPasswordReset}
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    ) : (
                      <div className="empty">아직 개통된 고객사 작업공간이 없습니다.</div>
                    )}
                  </div>
                </Panel>

                <div className="ops-grid">
                  <Panel
                    title="배치 작업"
                    subtitle="Supabase cron 없이도 플랫폼 관리자가 큐 생성과 실행을 수동으로 점검할 수 있습니다."
                    actions={
                      <>
                        <button className="btn-secondary" onClick={() => void runAction("ops-dispatch-jobs", dispatchInternalJobs, { reload: false })}>
                          작업 생성
                        </button>
                        <button onClick={() => void runAction("ops-run-jobs", runInternalJobs, { reload: false })}>
                          작업 실행
                        </button>
                      </>
                    }
                  >
                    <div className="info-grid">
                      <div>
                        <span>생성 API</span>
                        <strong>/api/internal/jobs/dispatch</strong>
                      </div>
                      <div>
                        <span>실행 API</span>
                        <strong>/api/internal/jobs/run</strong>
                      </div>
                      <div className="full">
                        <span>운영 메모</span>
                        <strong>무료 운영 단계에서는 Supabase cron이 이 두 API를 주기적으로 깨우고, 플랫폼 관리자는 여기서 수동 점검을 할 수 있습니다.</strong>
                      </div>
                    </div>
                  </Panel>

                  <Panel
                    className="panel-ops-partner"
                    title="팝빌 파트너 운영"
                    subtitle="고객사 화면에는 보이지 않는 플랫폼 공통 운영 영역입니다."
                    actions={
                      <>
                        <button className="btn-secondary" onClick={() => void runAction("ops-refresh", load)}>
                          새로고침
                        </button>
                        <button onClick={() => void runAction("ops-charge-url", openPartnerChargeUrl, { reload: false })}>
                          충전 페이지
                        </button>
                      </>
                    }
                  >
                    <div className="info-grid">
                      <div>
                        <span>파트너 포인트</span>
                        <strong>
                          {opsConsole.partnerPoints.available && opsConsole.partnerPoints.partnerRemainPoint !== null
                            ? `${formatMoney(opsConsole.partnerPoints.partnerRemainPoint)}P`
                            : "-"}
                        </strong>
                      </div>
                      <div>
                        <span>운영 환경</span>
                        <strong>{opsConsole.partnerPoints.isTest ? "테스트" : "운영"}</strong>
                      </div>
                      <div>
                        <span>조회 기준</span>
                        <strong>{opsConsole.partnerPoints.referenceCorpNum ?? "-"}</strong>
                      </div>
                      <div>
                        <span>전자세금계산서 단가</span>
                        <strong>
                          {opsConsole.partnerPoints.taxInvoiceUnitCost !== null
                            ? `${formatMoney(opsConsole.partnerPoints.taxInvoiceUnitCost)}P`
                            : "-"}
                        </strong>
                      </div>
                      <div>
                        <span>이번 달 추정 사용</span>
                        <strong>
                          {totalWorkspaceCurrentMonthEstimatedPointUsage !== null
                            ? `${formatMoney(totalWorkspaceCurrentMonthEstimatedPointUsage)}P`
                            : "-"}
                        </strong>
                      </div>
                    </div>
                    <p className="ops-helper-text">{formatPartnerPointsMessage(opsConsole.partnerPoints)}</p>
                  </Panel>

                  <Panel
                    className="panel-ops-agent"
                    title="로컬 인증서 진단"
                    subtitle="고객용 설정에서 분리한 내부 진단 화면입니다."
                    actions={
                      <button onClick={() => void runAction("ops-bridge-probe", async () => void (await requestRenewalBridgeProbe(null)))}>
                        전체 진단 실행
                      </button>
                    }
                  >
                    <div className="info-grid">
                      <div>
                        <span>에이전트</span>
                        <strong>{opsAgentStatusMeta?.label ?? "-"}</strong>
                      </div>
                      <div>
                        <span>호스트</span>
                        <strong>{opsAgent?.hostname ?? "-"}</strong>
                      </div>
                      <div>
                        <span>브리지</span>
                        <strong>{opsAgent ? formatRenewalBridgeSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div>
                        <span>최근 heartbeat</span>
                        <strong>{opsAgent ? formatDateTime(opsAgent.lastHeartbeatAt) : "-"}</strong>
                      </div>
                      <div>
                        <span>버전</span>
                        <strong>{opsAgent ? formatRenewalVersionSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div>
                        <span>라이선스</span>
                        <strong>{opsAgent ? formatRenewalLicenseSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div>
                        <span>인증서 저장소</span>
                        <strong>{opsAgent ? formatRenewalStorageSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div>
                        <span>certID</span>
                        <strong>{opsAgent ? formatRenewalSelectionSummary(opsAgent) : "-"}</strong>
                      </div>
                      <div className="full">
                        <span>갱신 경로</span>
                        <strong>{opsAgent ? formatRenewalPreflightSummary(opsAgent) : "-"}</strong>
                      </div>
                    </div>

                    <div className="ops-list">
                      {opsCertificates.length > 0 ? (
                        opsCertificates.map((certificate) => (
                          <article key={`${certificate.index}-${certificate.cn}`} className="ops-card">
                            <div className="ops-card-head">
                              <div>
                                <strong>{certificate.cn || `인증서 #${certificate.index}`}</strong>
                                <span>{certificate.issuerToName || "-"}</span>
                              </div>
                              <span className="chip chip-warn">{certificate.todate ?? "-"}</span>
                            </div>
                            <div className="ops-card-meta">
                              <span>certID: {opsAgent?.bridge.selectionProbe.certificateIndex === certificate.index ? opsAgent.bridge.selectionProbe.certID ?? "-" : "-"}</span>
                              <span>경로: {opsAgent ? formatRenewalPathCell(certificate, opsAgent) : "-"}</span>
                            </div>
                            <div className="ops-card-actions">
                              <button
                                className="btn-secondary"
                                onClick={() =>
                                  void runAction(`ops-certid-${certificate.index}`, async () => void (await requestRenewalCertIdProbe(certificate)))
                                }
                              >
                                certID 조회
                              </button>
                              <button
                                onClick={() =>
                                  void runAction(`ops-preflight-${certificate.index}`, async () => void (await requestRenewalPreflight(certificate)))
                                }
                              >
                                경로 분석
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="empty">아직 로컬 인증서 목록 진단 결과가 없습니다.</div>
                      )}
                    </div>
                  </Panel>
                </div>

                <div className="ops-grid">
                  <Panel className="panel-ops-jobs" title="최근 진단 작업">
                    <div className="ops-list">
                      {opsJobs.length > 0 ? (
                        opsJobs.slice(0, 8).map((job) => (
                          <article key={job.id} className="ops-card">
                            <div className="ops-card-head">
                              <div>
                                <strong>{formatRenewalJobLabel(job)}</strong>
                                <span>{job.requestedBy}</span>
                              </div>
                              <span className={`chip ${job.status === "completed" ? "chip-success" : job.status === "failed" ? "chip-danger" : "chip-warn"}`}>
                                {formatRenewalJobStatusLabel(job.status)}
                              </span>
                            </div>
                            <div className="ops-card-meta">
                              <span>요청 {formatDateTime(job.requestedAt)}</span>
                              <span>완료 {formatDateTime(job.finishedAt)}</span>
                              <span>{job.summary || job.error || "-"}</span>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="empty">최근 진단 작업이 없습니다.</div>
                      )}
                    </div>
                  </Panel>

                  <Panel className="panel-ops-logs" title="최근 운영 로그">
                    <div className="ops-list">
                      {opsLogs.length > 0 ? (
                        opsLogs.slice(0, 12).map((log) => (
                          <article key={log.id} className="ops-card">
                            <div className="ops-card-head">
                              <div>
                                <strong>{log.message}</strong>
                                <span>{log.scope}</span>
                              </div>
                              <span className={`chip ${log.level === "error" ? "chip-danger" : log.level === "warn" ? "chip-warn" : "chip-success"}`}>
                                {log.level.toUpperCase()}
                              </span>
                            </div>
                            <div className="ops-card-meta">
                              <span>{formatDateTime(log.createdAt)}</span>
                              <span>{log.contextJson || "-"}</span>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="empty">표시할 운영 로그가 없습니다.</div>
                      )}
                    </div>
                  </Panel>
                </div>
              </>
            ) : (
              <div className="empty">플랫폼 관리자 데이터를 불러오는 중입니다.</div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
