export type IssueMode = "review" | "auto";
export type PopbillState = "pending" | "joined" | "failed";
export type PopbillEnvironment = "test" | "production";
export type MailParseStatus = "pending" | "parsed" | "failed" | "unmatched" | "duplicate" | "ignored";
export type DraftStatus = "review" | "scheduled" | "issuing" | "issued" | "failed";
export type CustomerCertificateKind = "electronic_tax" | "general_personal" | "general_business" | "unknown";
export type CustomerCertificateLinkSource = "auto" | "manual";
export type PublicConsultationRequestStatus = "new" | "contacted" | "workspace_opened" | "closed";
export type PublicSignupRequestStatus = "pending" | "approved" | "rejected";

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
  mailConnectionVerifiedAt: string | null;
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
  renewalContactDepartment: string;
  renewalContactFax: string;
  renewalCertificatePassword: string;
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
  renewalContactMobile: string;
  issueCompleteSmsTemplate?: string;
  memo: string;
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
  renewalContactMobile: string;
  issueCompleteSmsTemplate?: string;
  memo: string;
  plantNames: string[];
  matchAddresses: string[];
}

export interface PublicConsultationRequest {
  id: string;
  name: string;
  phone: string;
  category: string;
  message: string;
  email: string;
  region: string;
  requestIp: string;
  requestUserAgent: string;
  status: PublicConsultationRequestStatus;
  note: string;
  handledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSignupRequest {
  id: string;
  userId: string;
  loginId: string;
  authEmail: string;
  organizationName: string;
  representativeName: string;
  businessRegistrationNumber: string;
  businessAddress: string;
  businessType: string;
  businessItem: string;
  name: string;
  phone: string;
  kepcoEmail: string;
  invoiceEmail: string;
  status: PublicSignupRequestStatus;
  marketingConsent: boolean;
  termsVersion: string;
  privacyVersion: string;
  thirdPartyVersion: string;
  marketingVersion: string | null;
  termsAcceptedAt: string;
  privacyAcceptedAt: string;
  thirdPartyAcceptedAt: string;
  marketingAcceptedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCertificate {
  id: number;
  customerId: number;
  certificateKind: CustomerCertificateKind;
  certificateName: string;
  certificateUsageName: string;
  issuerName: string;
  serial: string | null;
  userDN: string | null;
  oid: string | null;
  expireDate: string | null;
  certDirPath: string | null;
  certificatePasswordConfigured: boolean;
  isPrimary: boolean;
  linkSource: CustomerCertificateLinkSource;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCertificateInput {
  customerId: number;
  certificateKind: CustomerCertificateKind;
  certificateName: string;
  certificateUsageName: string;
  issuerName: string;
  serial: string | null;
  userDN: string | null;
  oid: string | null;
  expireDate: string | null;
  certDirPath: string | null;
  certificatePassword?: string;
  isPrimary: boolean;
  linkSource: CustomerCertificateLinkSource;
}

export interface CustomerReportProfile {
  customerId: number;
  certificateRenewalDate: string | null;
  hasPersonalGeneralCertificate: boolean;
  hasTaxInvoiceBusinessCertificate: boolean;
  solarCapacityKw: number | null;
  contractStartMonth: string | null;
  contractEndMonth: string | null;
  otherNote: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CustomerReportMonth {
  reportYear: number;
  reportMonth: number;
  issueYear: number | null;
  issueDate: string | null;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CustomerReportDetail {
  customerId: number;
  reportYear: number;
  profile: CustomerReportProfile;
  months: CustomerReportMonth[];
}

export type CustomerContractRenewalStatus = "due_this_month" | "overdue";

export interface CustomerContractSummary {
  customerId: number;
  contractStartMonth: string | null;
  contractEndMonth: string | null;
}

export type CustomerContractPeriodStatus = "expired" | "active" | "scheduled";

export interface CustomerContractPeriod {
  id: string;
  customerId: number;
  contractStartDate: string;
  contractEndDate: string;
  status: CustomerContractPeriodStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerContractPeriodInput {
  contractStartDate: string;
  contractEndDate: string;
}

export interface CustomerContractPeriodMutationResult {
  period: CustomerContractPeriod;
  periods: CustomerContractPeriod[];
  summary: CustomerContractSummary;
}

export interface CustomerContractRenewalDueItem {
  customerId: number;
  customerName: string;
  corpName: string;
  businessNumber: string;
  renewalContactMobile: string;
  contractStartMonth: string;
  contractEndMonth: string;
  nextContractStartMonth: string;
  nextContractEndMonth: string;
  status: CustomerContractRenewalStatus;
}

export interface CustomerContractRenewalCompletion {
  completed: true;
  profile: CustomerReportProfile;
  oldContractStartMonth: string;
  oldContractEndMonth: string;
  newContractStartMonth: string;
  newContractEndMonth: string;
}

export interface CustomerReportProfileInput {
  certificateRenewalDate: string | null;
  hasPersonalGeneralCertificate: boolean;
  hasTaxInvoiceBusinessCertificate: boolean;
  solarCapacityKw: number | null;
  contractStartMonth: string | null;
  contractEndMonth: string | null;
  otherNote: string;
}

export interface CustomerReportMonthInput {
  reportMonth: number;
  issueYear: number | null;
  issueDate: string | null;
  supplyAmount: number;
  vatAmount: number;
}

export interface CustomerReportDetailInput {
  reportYear: number;
  profile: CustomerReportProfileInput;
  months: CustomerReportMonthInput[];
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
  popbillMgtKey: string;
  popbillEnvironment: PopbillEnvironment | null;
  popbillResultJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssuedMonthlyTrendPayload {
  anchorBillingYear: string;
  months: Array<{
    billingMonth: string;
    issuedDraftCount: number;
  }>;
}

export interface LogEntry {
  id: number;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  contextJson: string;
  createdAt: string;
}

export const PILOT_ISSUANCE_EVENT_TYPES = [
  "draft-created",
  "draft-preview-opened",
  "manual-issue-clicked",
  "manual-issue-succeeded",
  "manual-issue-failed"
] as const;

export type PilotIssuanceEventType = (typeof PILOT_ISSUANCE_EVENT_TYPES)[number];

export const PILOT_ERROR_CATEGORIES = [
  "auth/session",
  "mail-sync",
  "parse",
  "customer-match",
  "draft-create",
  "manual-issue",
  "certificate/local-helper",
  "external-api"
] as const;

export type PilotErrorCategory = (typeof PILOT_ERROR_CATEGORIES)[number];

export interface PilotRateMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface PilotIssuanceEventCount {
  eventType: PilotIssuanceEventType;
  count: number;
}

export interface PilotErrorCategoryCount {
  errorCategory: PilotErrorCategory;
  count: number;
}

export interface PilotTimeSavingsEstimate {
  assumedMinutesSavedPerAutoSuccess: number;
  autoIssueSuccessCount: number;
  estimatedSavedMinutes: number;
  estimatedSavedHours: number;
  note: string;
}

export interface PilotPeriodBucket {
  bucketType: "week" | "month";
  label: string;
  period: {
    from: string;
    to: string;
  };
  metrics: {
    autoDraftCreationSuccessRate: PilotRateMetric;
    finalIssueSuccessRate: PilotRateMetric;
    exceptionRate: PilotRateMetric;
  };
  eventCounts: PilotIssuanceEventCount[];
  errorCategoryCounts: PilotErrorCategoryCount[];
  totals: {
    trackedDrafts: number;
    trackedEvents: number;
    draftCreationAttempts: number;
    finalIssueAttempts: number;
    exceptionCount: number;
  };
  timeSavings: PilotTimeSavingsEstimate;
}

export interface PilotCustomerSummary {
  customerId: number;
  customerName: string;
  currentIssueMode: IssueMode | null;
  manualIssueSuccessCount: number;
  manualIssueFailureCount: number;
  autoIssueSuccessCount: number;
  autoIssueFailureCount: number;
  finalIssueAttempts: number;
  finalIssueSuccessRate: PilotRateMetric;
  exceptionRate: PilotRateMetric;
  reviewToAutoTransitionCount: number;
  autoToReviewTransitionCount: number;
  lastIssueModeChangedAt: string | null;
  lastIssueModeChangedTo: IssueMode | null;
  hasSuccessfulIssuanceEvidence: boolean;
  autoTransitionEvidenceStatus: "already-auto" | "eligible" | "needs-review";
  autoTransitionEvidenceNote: string;
  latestFailureAt: string | null;
  latestFailureType: string | null;
  latestFailureDraftId: number | null;
  latestFailureTimelinePath: string | null;
  estimatedSavedMinutes: number;
}

export interface PilotFailureTypeSummary {
  rank: number;
  key: string;
  label: string;
  errorCategory: PilotErrorCategory;
  errorOperation: string | null;
  errorCode: string | null;
  messageBucket: string | null;
  count: number;
  lastSeenAt: string;
  latestDraftId: number | null;
  latestCustomerId: number | null;
  latestTimelinePath: string | null;
}

export interface PilotIssuanceReport {
  organizationId: string;
  generatedAt: string;
  period: {
    from: string | null;
    to: string | null;
  };
  metrics: {
    autoDraftCreationSuccessRate: PilotRateMetric;
    finalIssueSuccessRate: PilotRateMetric;
    exceptionRate: PilotRateMetric;
  };
  eventCounts: PilotIssuanceEventCount[];
  errorCategoryCounts: PilotErrorCategoryCount[];
  periodBuckets: {
    weekly: PilotPeriodBucket[];
    monthly: PilotPeriodBucket[];
  };
  customerSummaries: PilotCustomerSummary[];
  topFailureTypes: PilotFailureTypeSummary[];
  timeSavings: PilotTimeSavingsEstimate;
  drilldown: {
    timelinePathTemplate: string;
    memoComparisonProcedure: string;
  };
  totals: {
    trackedDrafts: number;
    trackedEvents: number;
    draftCreationAttempts: number;
    finalIssueAttempts: number;
    exceptionCount: number;
  };
  notes: {
    autoDraftCreationSuccessRate: string;
    finalIssueSuccessRate: string;
    exceptionRate: string;
    draftPreviewOpened: string;
    customerSummaries: string;
    topFailureTypes: string;
    timeSavings: string;
    memoComparison: string;
  };
}

export interface PilotDraftTimelineEntry {
  organizationId: string;
  actorUserId: string | null;
  createdAt: string;
  level: LogEntry["level"];
  scope: string;
  message: string;
  eventType: PilotIssuanceEventType | null;
  draftId: number;
  customerId: number | null;
  issueMode: IssueMode | null;
  errorCategory: PilotErrorCategory | null;
  context: Record<string, unknown>;
}

export interface PilotDraftTimeline {
  organizationId: string;
  draftId: number;
  customerId: number | null;
  issueMode: IssueMode | null;
  events: PilotDraftTimelineEntry[];
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

export interface RenewalPreflightSubmissionProfile {
  contactName: string;
  contactDepartment: string;
  contactEmail: string;
  contactTel: string;
  contactFax: string;
  contactMobile: string;
  issuePassword: string;
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
  renewInfoSubmitMissingFields: string[];
  renewInfoSubmitReady: boolean | null;
  renewInfoSubmitSummary: string | null;
  renewInfoSubmitAttempted: boolean | null;
  renewInfoSubmitResultBranch: "renew-info" | "renew-payment" | "password-confirm" | "unknown" | null;
  renewInfoSubmitResultUrl: string | null;
  renewInfoSubmitResultPageTitle: string | null;
  renewInfoSubmitResultSummary: string | null;
  renewInfoSubmitResultError: string | null;
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
  result: RenewalBridgeProbeResult | null;
  comparisonProfile?: RenewalPreflightComparisonProfile | null;
  submissionProfile?: RenewalPreflightSubmissionProfile | null;
  executeSubmit?: boolean;
}

export interface RenewalAutomationPayload {
  agent: RenewalAgentStatus;
  jobs: RenewalAutomationJob[];
}

export interface DashboardPayload {
  settings: AppSettings;
  customers: Customer[];
  customerCertificates: CustomerCertificate[];
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
