export type IssueMode = "review" | "auto";
export type PopbillState = "pending" | "joined" | "failed";
export type PopbillEnvironment = "test" | "production";
export type MailParseStatus = "pending" | "parsed" | "failed" | "unmatched" | "duplicate" | "ignored";
export type DraftStatus = "review" | "scheduled" | "issuing" | "issued" | "failed";

export interface AppSettings {
  id: number;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFromName: string;
  smtpFromEmail: string;
  notificationEmails: string[];
  defaultIssueDay: number;
  defaultIssueHour: number;
  defaultIssueMinute: number;
  mailPollMinutes: number;
  mailSyncStartAt: string | null;
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
  renewalContactDepartment: string;
  renewalContactFax: string;
  renewalIssuePassword: string;
  schedulerEnabled: boolean;
  certLastCheckedAt: string | null;
  certAlertLastSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: number;
  customerName: string;
  businessNumber: string;
  corpName: string;
  ceoName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  popbillUserId: string;
  popbillPassword: string;
  popbillState: PopbillState;
  popbillCertRegistered: boolean;
  popbillCertExpireDate: string | null;
  issueMode: IssueMode;
  issueDay: number | null;
  issueHour: number | null;
  issueMinute: number | null;
  memo: string;
  mobileNumber: string;
  plantNames: string[];
  matchAddresses: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  customerName: string;
  businessNumber: string;
  corpName: string;
  ceoName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  issueMode: IssueMode;
  issueDay: number | null;
  issueHour: number | null;
  issueMinute: number | null;
  memo: string;
  mobileNumber: string;
  plantNames: string[];
  matchAddresses: string[];
}

export interface CustomerImportProfile {
  headerRowIndex: number;
  fieldHeaderMap: Record<"customerName" | "businessNumber" | "corpName" | "addr", string>;
  createdAt: string;
  updatedAt: string;
}

export interface CompletedBillingMonth {
  billingMonth: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedMail {
  originalFrom: string;
  plantName: string;
  plantAddress: string;
  billingMonth: string;
  supplyCost: number;
  taxTotal: number;
  totalAmount: number;
  itemName: string;
  kepcoCorpNum: string;
  kepcoBranchId: string;
  kepcoCorpName: string;
  kepcoCeoName: string;
  kepcoAddr: string;
  kepcoBizType: string;
  kepcoBizClass: string;
  recipientEmail: string;
  rawText: string;
}

export interface InboxMessage {
  id: number;
  messageUid: string;
  mailbox: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  rawSource: string;
  textBody: string;
  parseStatus: MailParseStatus;
  parseError: string;
  parsedData: ParsedMail | null;
  customerId: number | null;
  draftId: number | null;
  createdAt: string;
}

export interface InvoiceDraft {
  id: number;
  customerId: number;
  customerName: string;
  sourceMessageId: number;
  issueMode: IssueMode;
  status: DraftStatus;
  scheduledFor: string | null;
  issueRequestedAt: string | null;
  issuedAt: string | null;
  issueError: string;
  billingMonth: string;
  writeDate: string | null;
  itemName: string;
  plantName: string;
  supplyCost: number;
  taxTotal: number;
  totalAmount: number;
  kepcoCorpNum: string;
  kepcoBranchId: string;
  kepcoCorpName: string;
  kepcoCeoName: string;
  kepcoAddr: string;
  kepcoBizType: string;
  kepcoBizClass: string;
  recipientEmail: string;
  popbillMgtKey: string;
  popbillEnvironment: PopbillEnvironment | null;
  popbillResultJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  id: number;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  contextJson: string;
  createdAt: string;
}

export type RenewalAutomationJobType = "bridge-probe" | "certid-probe" | "renewal-preflight";
export type RenewalAutomationJobStatus = "queued" | "claimed" | "completed" | "failed";
export type RenewalBridgeSummary = "ok" | "partial" | "down" | "unknown";

export interface RenewalAgentPortStatus {
  port: number;
  protocol: "https" | "http";
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}

export interface RenewalAgentProcessStatus {
  detected: boolean;
  names: string[];
  detail: string | null;
}

export interface RenewalAgentBridgeStatus {
  summary: RenewalBridgeSummary;
  ports: RenewalAgentPortStatus[];
  versionProbe: RenewalBridgeVersionProbe;
  licenseProbe: RenewalBridgeLicenseProbe;
  storageProbe: RenewalBridgeStorageProbe;
  selectionProbe: RenewalBridgeSelectionProbe;
  preflightProbe: RenewalBridgePreflightProbe;
}

export interface RenewalBridgeVersionProbe {
  ok: boolean;
  sourcePort: number | null;
  values: {
    kpmcnt: string | null;
    kpmsvc: string | null;
    secukitNX: string | null;
  };
  error: string | null;
}

export interface RenewalBridgeLicenseProbe {
  ok: boolean;
  sourcePort: number | null;
  error: string | null;
}

export interface RenewalBridgeCertificateSummary {
  index: string;
  cn: string;
  issuerToName: string;
  usageToName: string;
  todate: string | null;
  oid: string | null;
  serial: string | null;
  userDN: string | null;
  validateFrom: string | null;
  detailValidateTo: string | null;
  certDirPath: string | null;
}

export interface RenewalBridgeStorageProbe {
  ok: boolean;
  sourcePort: number | null;
  mediaType: "HDD";
  certificateCount: number;
  certificates: RenewalBridgeCertificateSummary[];
  error: string | null;
}

export interface RenewalBridgeSelectionProbe {
  ok: boolean;
  sourcePort: number | null;
  certificateIndex: string | null;
  certificateCn: string | null;
  certID: string | null;
  error: string | null;
}

export interface RenewalInfoSnapshot {
  companyName: string | null;
  businessNumber: string | null;
  ceoName: string | null;
  bizType: string | null;
  bizClass: string | null;
  businessFieldCode: string | null;
  postalCode: string | null;
  baseAddress: string | null;
  detailAddress: string | null;
  contactName: string | null;
  contactDepartment: string | null;
  contactEmail: string | null;
  contactTel: string | null;
  contactFax: string | null;
  contactMobile: string | null;
}

export interface RenewalPreflightComparisonProfile {
  corpName: string;
  businessNumber: string;
  ceoName: string;
  addr: string;
  bizType: string;
  bizClass: string;
}

export interface RenewalBridgePreflightProbe {
  ok: boolean;
  sourcePort: number | null;
  certificateIndex: string | null;
  certificateCn: string | null;
  certID: string | null;
  branch: "change-company" | "renew-info" | "renew-payment" | "password-confirm" | "unsupported" | "unknown";
  branchPageUrl: string | null;
  issueCompany: string | null;
  companyChkYn: string | null;
  policy: string | null;
  orderNo: string | null;
  orderSeq: string | null;
  orderStatus: string | null;
  orderApplySeCd: string | null;
  payYn: string | null;
  nextUrl: string | null;
  renewInfoPageTitle: string | null;
  renewInfoSubmitUrl: string | null;
  renewInfoSubmitPathKind: "apply" | "renew" | "unknown" | null;
  renewInfoFormFieldNames: string[];
  renewInfoMustHaveFieldNames: string[];
  renewInfoFinalNum: string | null;
  renewInfoSnapshot: RenewalInfoSnapshot | null;
  renewInfoBlockingMismatchFields: string[];
  renewInfoAutoSubmitReady: boolean | null;
  renewInfoAutoSubmitSummary: string | null;
  renewInfoPaymentPreviewLoaded: boolean | null;
  renewInfoPaymentPreviewItems: string[];
  renewInfoPaymentPreviewTotalAmount: string | null;
  renewInfoPaymentPreviewHasAdditionalAgreement: boolean | null;
  actionImageUrl: string | null;
  actionImageAlt: string | null;
  externalFlowKind: "apply-form" | "unknown" | null;
  externalFlowProductName: string | null;
  externalFlowProductId: string | null;
  externalFlowSubmitUrl: string | null;
  externalFlowSubmitPathKind: "apply" | "renew" | "unknown" | null;
  rawCode: string | null;
  message: string | null;
  error: string | null;
}

export interface RenewalBridgeProbeResult {
  process: RenewalAgentProcessStatus;
  bridge: RenewalAgentBridgeStatus;
  notes: string[];
}

export interface RenewalAgentHeartbeat {
  agentId: string;
  hostname: string;
  version: string;
  os: string;
  process: RenewalAgentProcessStatus;
  bridge: RenewalAgentBridgeStatus;
  notes: string[];
}

export interface RenewalAgentStatus {
  online: boolean;
  staleAfterSeconds: number;
  agentId: string | null;
  hostname: string | null;
  version: string | null;
  os: string | null;
  lastHeartbeatAt: string | null;
  process: RenewalAgentProcessStatus;
  bridge: RenewalAgentBridgeStatus;
  notes: string[];
}

export interface RenewalAutomationJob {
  id: number;
  type: RenewalAutomationJobType;
  status: RenewalAutomationJobStatus;
  customerId: number | null;
  customerName: string | null;
  certificateIndex: number | null;
  certificateCn: string | null;
  requestedAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
  requestedBy: string;
  claimedBy: string | null;
  summary: string;
  error: string | null;
  comparisonProfile: RenewalPreflightComparisonProfile | null;
  result: RenewalBridgeProbeResult | null;
}

export interface RenewalAutomationPayload {
  agent: RenewalAgentStatus;
  jobs: RenewalAutomationJob[];
}

export interface DashboardPayload {
  settings: AppSettings;
  customers: Customer[];
  drafts: InvoiceDraft[];
  inbox: InboxMessage[];
  logs: LogEntry[];
  renewalAutomation: RenewalAutomationPayload;
  counts: {
    actionableDrafts: number;
    customers: number;
    reviewDrafts: number;
    scheduledDrafts: number;
    failedDrafts: number;
    unmatchedMessages: number;
  };
}
