export type IssueMode = "review" | "auto";
export type DraftStatus = "review" | "scheduled" | "issuing" | "issued" | "failed";
export type OrganizationMemberRole = "owner" | "admin" | "operator" | "viewer";
export type OrganizationStatus = "trial" | "active" | "suspended" | "churned";

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
  mailPasswordConfigured: boolean;
  notificationEmails: string[];
  defaultIssueDay: number;
  defaultIssueHour: number;
  defaultIssueMinute: number;
  mailPollMinutes: number;
  mailSyncStartAt: string | null;
  timezone: string;
  popbillUserIdPrefix: string;
  popbillSharedPassword: string;
  operatorContactName: string;
  operatorContactEmail: string;
  operatorContactTel: string;
  popbillConfigured: boolean;
  popbillSharedPasswordConfigured: boolean;
  operatorConfigured: boolean;
  schedulerEnabled: boolean;
  certLastCheckedAt: string | null;
  certAlertLastSentAt: string | null;
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
  popbillState: "pending" | "joined" | "failed";
  popbillCertRegistered: boolean;
  popbillCertExpireDate: string | null;
  issueMode: IssueMode;
  issueDay: number | null;
  issueHour: number | null;
  issueMinute: number | null;
  memo: string;
  plantNames: string[];
  matchAddresses: string[];
}

export interface InboxMessage {
  id: number;
  subject: string;
  fromAddress: string;
  receivedAt: string;
  parseStatus: "pending" | "parsed" | "failed" | "unmatched" | "duplicate";
  parseError: string;
  customerId: number | null;
  draftId: number | null;
  parsedData: {
    plantName: string;
    plantAddress: string;
    billingMonth: string;
    supplyCost: number;
    taxTotal: number;
    itemName: string;
    kepcoBranchId: string;
  } | null;
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
  type: "bridge-probe" | "certid-probe" | "renewal-preflight";
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

export interface AuthenticatedOrganizationMembership {
  organizationId: string;
  organizationName: string;
  organizationBusinessNumber: string | null;
  organizationPlanCode: string;
  organizationStatus: OrganizationStatus;
  managedCustomerLimit: number | null;
  role: OrganizationMemberRole;
  displayName: string | null;
}

export interface AuthenticatedAppSession {
  userId: string;
  email: string | null;
  isPlatformAdmin: boolean;
  organizations: AuthenticatedOrganizationMembership[];
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationRole: OrganizationMemberRole | null;
  activeDisplayName: string | null;
}

export interface BootstrapPayload extends Omit<DashboardPayload, "logs" | "renewalAutomation"> {
  auth: AuthenticatedAppSession;
}

export interface PartnerPointsPayload {
  available: boolean;
  isTest: boolean;
  referenceCorpNum: string | null;
  partnerRemainPoint: number | null;
  taxInvoiceUnitCost: number | null;
  message: string;
}

export interface OpsWorkspaceSummary {
  organizationId: string;
  organizationName: string;
  organizationBusinessNumber: string | null;
  organizationPlanCode: string;
  organizationStatus: OrganizationStatus;
  managedCustomerLimit: number | null;
  managedCustomerCount: number;
  ownerLoginId: string | null;
  ownerDisplayName: string | null;
  memberCount: number;
  issuedDraftCount: number;
  currentMonthIssuedDraftCount: number;
  lastIssuedAt: string | null;
  createdAt: string;
}

export interface OpsWorkspaceCreateResponse {
  workspace: OpsWorkspaceSummary;
  ownerAction: "linked-existing-user" | "created-user";
  workspaceAction: "created" | "reused-existing";
}

export interface OpsWorkspaceLimitUpdateResponse {
  workspace: OpsWorkspaceSummary;
}

export interface OrganizationMemberSummary {
  membershipId: string;
  userId: string;
  loginId: string | null;
  displayName: string | null;
  role: "owner" | "member";
  createdAt: string;
}
