import type React from "react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api, setActiveOrganizationId } from "./api";
import { supabase } from "./supabase";
import type {
  AppSettings,
  BootstrapPayload,
  Customer,
  DashboardPayload,
  InvoiceDraft,
  PartnerPointsPayload
} from "./types";

type TabId = "work" | "customers" | "settings";
type SettingsSectionId = "gmail" | "popbill" | "logs";
type CustomerDetailTabId = "info" | "history";
type MailProvider = "gmail" | "naver" | "daum";

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

function getOrganizationRoleLabel(role: BootstrapPayload["auth"]["activeOrganizationRole"]): string {
  switch (role) {
    case "owner":
      return "소유자";
    case "admin":
      return "관리자";
    case "operator":
      return "운영자";
    case "viewer":
      return "조회전용";
    default:
      return role;
  }
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

function getRenewalAgentStatusMeta(agent: DashboardPayload["renewalAutomation"]["agent"]): {
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

function formatRenewalBridgeSummary(agent: DashboardPayload["renewalAutomation"]["agent"]): string {
  if (agent.bridge.ports.length === 0) {
    return "포트 진단 전";
  }

  return agent.bridge.ports
    .map((port) => `${port.port}/${port.protocol} ${port.reachable ? "연결됨" : "실패"}`)
    .join(" · ");
}

function formatRenewalVersionSummary(agent: DashboardPayload["renewalAutomation"]["agent"]): string {
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

function formatRenewalLicenseSummary(agent: DashboardPayload["renewalAutomation"]["agent"]): string {
  const licenseProbe = agent.bridge.licenseProbe;
  if (!licenseProbe.ok) {
    return licenseProbe.error ?? "라이선스 미검증";
  }

  return `정상 (${licenseProbe.sourcePort ?? "-"})`;
}

function formatRenewalStorageSummary(agent: DashboardPayload["renewalAutomation"]["agent"]): string {
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

function formatRenewalSelectionSummary(agent: DashboardPayload["renewalAutomation"]["agent"]): string {
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

function formatRenewalPreflightSummary(agent: DashboardPayload["renewalAutomation"]["agent"]): string {
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
  certificate: DashboardPayload["renewalAutomation"]["agent"]["bridge"]["storageProbe"]["certificates"][number],
  agent: DashboardPayload["renewalAutomation"]["agent"]
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

function formatRenewalJobStatusLabel(status: DashboardPayload["renewalAutomation"]["jobs"][number]["status"]): string {
  if (status === "queued") return "대기";
  if (status === "claimed") return "실행 중";
  if (status === "completed") return "완료";
  return "실패";
}

function formatRenewalJobLabel(job: DashboardPayload["renewalAutomation"]["jobs"][number]): string {
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
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [partnerPoints, setPartnerPoints] = useState<PartnerPointsPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    return hash === "customers" || hash === "settings" || hash === "work" ? hash : "work";
  });
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormDefaults());
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerListFilter, setCustomerListFilter] = useState<"all" | "blocked">("all");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerDetailTab, setCustomerDetailTab] = useState<CustomerDetailTabId>("info");
  const [workFeedTab, setWorkFeedTab] = useState<"inbox" | "issued">("inbox");
  const [settingsForm, setSettingsForm] = useState<SettingsFormState | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("gmail");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});

  const load = async () => {
    const [payload, nextPartnerPoints] = await Promise.all([
      api<BootstrapPayload>("/api/bootstrap"),
      api<PartnerPointsPayload>("/api/popbill/partner-points")
    ]);
    setError("");
    setActiveOrganizationId(payload.auth.activeOrganizationId);
    const nextSettingsForm = settingsToForm(payload.settings);
    setData(payload);
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

    void supabase.auth.getSession().then(({ data: next }) => {
      if (!mounted) return;
      setAuthSession(next.session);
      setAuthReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setAuthSession(nextSession);
      setError("");
      if (!nextSession) {
        setData(null);
        setPartnerPoints(null);
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
    if (!authReady || !authSession) return;

    void loadWithRetry().catch((loadError: Error) => setError(loadError.message));
  }, [authReady, authSession]);

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

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setError("");
      setAuthBusy(true);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: signInEmail.trim(),
        password: signInPassword
      });
      if (signInError) {
        throw signInError;
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "로그인에 실패했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signUp = async () => {
    try {
      setError("");
      setAuthBusy(true);
      const { data: signUpResult, error: signUpError } = await supabase.auth.signUp({
        email: signInEmail.trim(),
        password: signInPassword
      });

      if (signUpError) {
        throw signUpError;
      }

      if (!signUpResult.session) {
        window.alert("사용자 등록은 완료됐습니다. Supabase 이메일 확인 설정이 켜져 있으면 메일 인증 후 로그인하세요.");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "사용자 등록에 실패했습니다.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setBusyKey(null);
    setError("");
    setData(null);
    setPartnerPoints(null);
    setSettingsForm(null);
    setActiveOrganizationId(null);
    await supabase.auth.signOut();
  };

  const changeOrganization = async (organizationId: string) => {
    setActiveOrganizationId(organizationId);
    setError("");
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
    const normalized = withSelectedMailProviderSettings(settingsForm);
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
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
        popbillLinkId: normalized.popbillLinkId,
        popbillSecretKey: normalized.popbillSecretKey,
        popbillIsTest: false,
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
    const normalized = withSelectedMailProviderSettings(settingsForm);
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
          .filter(Boolean)
      })
    });

    window.alert(
      `${MAIL_PROVIDER_CONFIG[normalized.mailProvider].label} 연결 테스트 결과\nIMAP: ${result.imapOk ? "성공" : "실패"}\n${result.imapMessage}\n\nSMTP: ${result.smtpOk ? "성공" : "실패"}\n${result.smtpMessage}\n\n테스트 메일 발송: ${result.testMailSent ? "예" : "아니오"}`
    );
  };

  const openPartnerChargeUrl = async () => {
    const result = await api<{ url: string }>("/api/popbill/partner-charge-url");
    window.open(result.url, "_blank", "noopener,noreferrer");
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
    certificate: DashboardPayload["renewalAutomation"]["agent"]["bridge"]["storageProbe"]["certificates"][number]
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
    certificate: DashboardPayload["renewalAutomation"]["agent"]["bridge"]["storageProbe"]["certificates"][number]
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
    return <div className="loading-shell">로그인 상태를 확인하는 중입니다.</div>;
  }

  if (!authSession) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-copy">
            <span className="auth-badge">AUTO-TAX</span>
            <h1>작업공간 로그인</h1>
            <p>Supabase에 등록된 이메일 계정으로 로그인한 뒤 태양광 회사 작업공간을 선택해 사용합니다.</p>
          </div>
          <form className="auth-form" onSubmit={(event) => void signIn(event)}>
            <label>
              <span>이메일</span>
              <input
                type="email"
                value={signInEmail}
                onChange={(event) => setSignInEmail(event.target.value)}
                placeholder="operator@company.com"
                autoComplete="email"
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
            {error ? <div className="alert error">{error}</div> : null}
            <div className="auth-actions">
              <button type="submit" disabled={authBusy}>
                {authBusy ? "로그인 중..." : "로그인"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => void signUp()} disabled={authBusy}>
                첫 사용자 등록
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (!data || !settingsForm) {
    return <div className="loading-shell">AUTO-TAX 초기 데이터를 불러오는 중입니다.</div>;
  }

  const currentMembership =
    data.auth.organizations.find((organization) => organization.organizationId === data.auth.activeOrganizationId) ??
    data.auth.organizations[0];
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
    popbillReady: Boolean(data.settings.popbillLinkId && data.settings.popbillSecretKey),
    operatorReady: Boolean(data.settings.operatorContactName && data.settings.operatorContactEmail && data.settings.operatorContactTel)
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
  const recentLogs = data.logs.slice(0, 8);
  const renewalAgent = data.renewalAutomation.agent;
  const renewalJobs = data.renewalAutomation.jobs.slice(0, 6);
  const renewalAgentMeta = getRenewalAgentStatusMeta(renewalAgent);
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
    { key: "popbill", label: "팝빌 키 입력", done: settingsHealth.popbillReady },
    { key: "operator", label: "운영 담당자 입력", done: settingsHealth.operatorReady },
    { key: "customer", label: "고객 1명 이상 등록", done: customerRegistrationReady }
  ];
  const setupPendingCount = setupChecklist.filter((step) => !step.done).length;
  const certAttentionCount = expiredCertCustomers.length + expiringSoonCustomers.length;
  const workNoticeTokens = [
    ...(setupPendingCount > 0 ? [`설정 ${setupPendingCount}개 필요`] : []),
    ...(expiredCertCustomers.length > 0 ? [`만료 ${expiredCertCustomers.length}건`] : []),
    ...(expiringSoonCustomers.length > 0 ? [`30일 이내 ${expiringSoonCustomers.length}건`] : []),
    ...(duplicateMessages.length > 0 ? [`중복 의심 ${duplicateMessages.length}건`] : [])
  ];
  const recommendedSettingsSection: SettingsSectionId = !settingsHealth.mailReady
    ? "gmail"
    : !settingsHealth.popbillReady || !settingsHealth.operatorReady
      ? "popbill"
      : "logs";
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
      title: "팝빌 / 운영자",
      done: settingsHealth.popbillReady && settingsHealth.operatorReady,
      summary: settingsHealth.popbillReady
        ? `${data.settings.operatorContactName || "담당자 미입력"} · 운영`
        : "팝빌 키와 운영 담당자 정보 입력"
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
          <span>작업공간</span>
          {data.auth.organizations.length > 1 ? (
            <select
              className="workspace-select"
              value={data.auth.activeOrganizationId}
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
            <strong>{data.auth.activeOrganizationName}</strong>
          )}
          <p>{currentMembership?.displayName || data.auth.email || "로그인 사용자"}</p>
          <p>{getOrganizationRoleLabel(data.auth.activeOrganizationRole)}</p>
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
                : "content"
        }
      >
        <header className="hero">
          <div className="hero-main">
            <h2>{activeNavLabel}</h2>
            <div className="hero-summary">
              <span className="hero-pill">{data.auth.activeOrganizationName}</span>
              <span className="hero-pill">팝빌 운영</span>
              <span className="hero-pill">파트너 {partnerPoints?.available && partnerPoints.partnerRemainPoint !== null ? `${formatMoney(partnerPoints.partnerRemainPoint)}P` : "-"}</span>
              <span className="hero-pill">발행 대상 {data.counts.actionableDrafts}건</span>
              <span className={certAttentionCount > 0 ? "hero-pill hero-pill-warn" : "hero-pill"}>인증서 주의 {certAttentionCount}건</span>
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
                      <button className="btn-secondary" onClick={() => void runAction("partner-points-refresh-work", load)}>포인트 조회</button>
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
                      <span>파트너 포인트</span>
                      <strong>{partnerPoints?.available && partnerPoints.partnerRemainPoint !== null ? `${formatMoney(partnerPoints.partnerRemainPoint)}P` : "-"}</strong>
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
                <div className="settings-sidebar-actions">
                  <button onClick={() => void runAction("save-settings", saveSettings)}>설정 저장</button>
                  <button className="btn-secondary" onClick={() => setActiveSettingsSection("logs")}>최근 로그 보기</button>
                </div>
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
                  </div>
                </SetupPanel>
              ) : null}

              {activeSettingsSection === "popbill" ? (
                <SetupPanel
                  step={2}
                  className="panel-settings-popbill"
                  title="팝빌 / 운영 담당자"
                  done={settingsHealth.popbillReady && settingsHealth.operatorReady}
                  note="팝빌 키와 운영 담당자 정보를 한 번에 설정합니다."
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
                  <div className="settings-field-stack">
                    <section className="settings-field-group">
                      <div className="settings-field-group-head">
                        <strong>팝빌 연결</strong>
                        <span>API 연결과 포인트 조회에 필요한 기본 정보를 입력합니다.</span>
                      </div>
                      <div className="form-grid">
                        <label>
                          팝빌 LinkID
                          <input value={settingsForm.popbillLinkId} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillLinkId: event.target.value })} />
                        </label>
                        <label>
                          팝빌 파트너 사업자번호
                          <input
                            placeholder="사업자번호 입력"
                            value={settingsForm.popbillPartnerCorpNum}
                            onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillPartnerCorpNum: event.target.value })}
                          />
                        </label>
                        <label className="full">
                          팝빌 SecretKey
                          <div className="password-field">
                            <input
                              type={revealedFields.popbillSecretKey ? "text" : "password"}
                              value={settingsForm.popbillSecretKey}
                              onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillSecretKey: event.target.value })}
                            />
                            <button
                              type="button"
                              className="password-toggle"
                              aria-label={revealedFields.popbillSecretKey ? "팝빌 SecretKey 숨기기" : "팝빌 SecretKey 보기"}
                              onClick={() => toggleRevealField("popbillSecretKey")}
                            >
                              <RevealIcon open={Boolean(revealedFields.popbillSecretKey)} />
                            </button>
                          </div>
                        </label>
                      </div>
                    </section>

                    <section className="settings-field-group">
                      <div className="settings-field-group-head">
                        <strong>고객 계정 자동 생성</strong>
                        <span>신규 고객 등록 시 자동으로 붙는 팝빌 계정 규칙입니다.</span>
                      </div>
                      <div className="form-grid">
                        <label>
                          팝빌 ID 접두어
                          <input value={settingsForm.popbillUserIdPrefix} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, popbillUserIdPrefix: event.target.value })} />
                          <span className="field-hint">신규 고객 팝빌 ID를 만들 때 앞에 붙는 값입니다. 예: <strong>HAE_</strong> 입력 시 <strong>HAE_001</strong>처럼 생성됩니다.</span>
                        </label>
                        <label>
                          팝빌 공통 비밀번호
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
                              aria-label={revealedFields.popbillSharedPassword ? "팝빌 공통 비밀번호 숨기기" : "팝빌 공통 비밀번호 보기"}
                              onClick={() => toggleRevealField("popbillSharedPassword")}
                            >
                              <RevealIcon open={Boolean(revealedFields.popbillSharedPassword)} />
                            </button>
                          </div>
                        </label>
                        <div className="helper-box full">
                          <strong>자동 규칙</strong>
                          <span>고객 저장 시 팝빌 ID는 접두어 + 고객번호 형식으로 생성됩니다.</span>
                          <span>공통 비밀번호는 신규 고객 또는 비어 있는 고객에만 적용됩니다.</span>
                          <span>{formatPartnerPointsMessage(partnerPoints)}</span>
                        </div>
                      </div>
                    </section>

                    <section className="settings-field-group">
                      <div className="settings-field-group-head">
                        <strong>운영 담당자</strong>
                        <span>팝빌 가입과 발행에 쓰는 운영 담당자 정보를 입력합니다.</span>
                      </div>
                      <div className="form-grid">
                        <label>
                          운영 담당자명
                          <input value={settingsForm.operatorContactName} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactName: event.target.value })} />
                        </label>
                        <label>
                          운영 담당자 연락처
                          <input value={settingsForm.operatorContactTel} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactTel: event.target.value })} />
                        </label>
                        <label className="full">
                          운영 담당자 이메일
                          <input value={settingsForm.operatorContactEmail} onChange={(event) => setSettingsForm((prev) => prev && { ...prev, operatorContactEmail: event.target.value })} />
                        </label>
                      </div>
                    </section>

                    <section className="settings-field-group">
                      <div className="settings-field-group-head">
                        <strong>로컬 갱신 에이전트 POC</strong>
                        <span>기본 하트비트는 브리지 상태만 읽고, 요청 시 SignGate 라이선스 검증과 HDD 인증서 목록, 선택 인증서의 certID 조회까지 진행합니다.</span>
                      </div>
                      <div className="info-grid">
                        <div>
                          <span>에이전트 상태</span>
                          <strong>{renewalAgentMeta.label}</strong>
                        </div>
                        <div>
                          <span>브리지 포트</span>
                          <strong>{formatRenewalBridgeSummary(renewalAgent)}</strong>
                        </div>
                        <div>
                          <span>GetVersion</span>
                          <strong>{formatRenewalVersionSummary(renewalAgent)}</strong>
                        </div>
                        <div>
                          <span>라이선스 검증</span>
                          <strong>{formatRenewalLicenseSummary(renewalAgent)}</strong>
                        </div>
                        <div className="full-width">
                          <span>HDD 인증서</span>
                          <strong>{formatRenewalStorageSummary(renewalAgent)}</strong>
                        </div>
                        <div className="full-width">
                          <span>최근 certID 조회</span>
                          <strong>{formatRenewalSelectionSummary(renewalAgent)}</strong>
                        </div>
                        <div className="full-width">
                          <span>최근 갱신 경로 분석</span>
                          <strong>{formatRenewalPreflightSummary(renewalAgent)}</strong>
                        </div>
                        <div>
                          <span>호스트</span>
                          <strong>{renewalAgent.hostname ?? "-"}</strong>
                        </div>
                        <div>
                          <span>마지막 하트비트</span>
                          <strong>{renewalAgent.lastHeartbeatAt ? formatDateTime(renewalAgent.lastHeartbeatAt) : "-"}</strong>
                        </div>
                        <div className="full-width">
                          <span>프로세스 감지</span>
                          <strong>
                            {renewalAgent.process.detected
                              ? renewalAgent.process.names.join(", ") || "SecuKit 프로세스 감지"
                              : renewalAgent.process.detail ?? "미감지"}
                          </strong>
                        </div>
                      </div>
                      <div className="button-row">
                        <button
                          className="btn-secondary"
                          onClick={() => void runAction("renewal-bridge-probe", async () => void (await requestRenewalBridgeProbe()))}
                        >
                          로컬 인증서 목록 진단 요청
                        </button>
                        <span className={`chip ${renewalAgentMeta.chipClassName}`}>{renewalAgentMeta.label}</span>
                      </div>
                      <div className="helper-box full">
                        <strong>certID 조회 조건</strong>
                        <span>행별 `certID 조회` 버튼은 로컬 에이전트가 `selectCertificateIssue` 를 호출하는 반자동 POC입니다.</span>
                        <span>비밀번호는 서버로 전송하지 않고, 전용 PC의 `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD` 또는 `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE` 에서만 읽습니다.</span>
                        <span>`갱신 경로 분석` 버튼은 `showCert` 와 SignGate AJAX 를 재현해서 기관변경/결제/비밀번호확인 단계 중 어디로 가는지 판별합니다.</span>
                        <span>`순정 갱신 아님`으로 표시되면 SignGate 내부 갱신이 아니라 타 기관/외부 신규신청 분기로 빠진 것입니다.</span>
                      </div>
                      {renewalAgent.bridge.storageProbe.ok ? (
                        <div className="table-wrap">
                          <table className="responsive-table">
                            <thead>
                              <tr>
                                <th>CN</th>
                                <th>용도</th>
                                <th>발급기관</th>
                                <th>만료일</th>
                                <th>Serial</th>
                                <th>certID 상태</th>
                                <th>갱신 경로</th>
                                <th>액션</th>
                              </tr>
                            </thead>
                            <tbody>
                              {renewalAgent.bridge.storageProbe.certificates.map((certificate) => (
                                <tr key={`${certificate.index}-${certificate.cn}`}>
                                  <td data-label="CN">{certificate.cn || "-"}</td>
                                  <td data-label="용도">{certificate.usageToName || "-"}</td>
                                  <td data-label="발급기관">{certificate.issuerToName || "-"}</td>
                                  <td data-label="만료일">{certificate.todate ?? "-"}</td>
                                  <td data-label="Serial">{certificate.serial ?? "-"}</td>
                                  <td data-label="certID 상태">
                                    {renewalAgent.bridge.selectionProbe.certificateIndex === certificate.index
                                      ? renewalAgent.bridge.selectionProbe.ok
                                        ? renewalAgent.bridge.selectionProbe.certID ?? "-"
                                        : renewalAgent.bridge.selectionProbe.error ?? "조회 실패"
                                      : "-"}
                                  </td>
                                  <td data-label="갱신 경로">
                                    {formatRenewalPathCell(certificate, renewalAgent)}
                                  </td>
                                  <td data-label="액션">
                                    <div className="button-row">
                                      <button
                                        className="btn-secondary"
                                        onClick={() =>
                                          void runAction(
                                            `renewal-certid-probe-${certificate.index}`,
                                            async () => void (await requestRenewalCertIdProbe(certificate))
                                          )
                                        }
                                      >
                                        certID 조회
                                      </button>
                                      <button
                                        className="btn-secondary"
                                        onClick={() =>
                                          void runAction(
                                            `renewal-preflight-${certificate.index}`,
                                            async () => void (await requestRenewalPreflight(certificate))
                                          )
                                        }
                                      >
                                        갱신 경로 분석
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {renewalAgent.bridge.storageProbe.certificates.length === 0 ? (
                            <div className="empty">조회된 HDD 인증서가 없습니다.</div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="table-wrap">
                        <table className="responsive-table">
                          <thead>
                            <tr>
                              <th>작업</th>
                              <th>상태</th>
                              <th>요약</th>
                              <th>요청시각</th>
                            </tr>
                          </thead>
                          <tbody>
                            {renewalJobs.map((job) => (
                              <tr key={job.id}>
                                <td data-label="작업">#{job.id} {formatRenewalJobLabel(job)}</td>
                                <td data-label="상태">{formatRenewalJobStatusLabel(job.status)}</td>
                                <td data-label="요약">{job.error ?? job.summary}</td>
                                <td data-label="요청시각">{formatDateTime(job.requestedAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {renewalJobs.length === 0 ? <div className="empty">아직 인증서 목록 진단 작업 이력이 없습니다.</div> : null}
                      </div>
                      {renewalAgent.notes.length > 0 ? (
                        <div className="helper-box full">
                          <strong>최근 에이전트 메모</strong>
                          {renewalAgent.notes.map((note) => (
                            <span key={note}>{note}</span>
                          ))}
                        </div>
                      ) : null}
                    </section>
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
