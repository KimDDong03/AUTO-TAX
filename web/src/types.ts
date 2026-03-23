export type IssueMode = "review" | "auto";
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
  parseStatus: "pending" | "parsed" | "failed" | "unmatched";
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
  status: DraftStatus;
  scheduledFor: string | null;
  issuedAt: string | null;
  issueError: string;
  billingMonth: string;
  writeDate: string | null;
  itemName: string;
  plantName: string;
  supplyCost: number;
  taxTotal: number;
  totalAmount: number;
}

export interface LogEntry {
  id: number;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  contextJson: string;
  createdAt: string;
}

export interface DashboardPayload {
  settings: AppSettings;
  customers: Customer[];
  drafts: InvoiceDraft[];
  inbox: InboxMessage[];
  logs: LogEntry[];
  counts: {
    actionableDrafts: number;
    customers: number;
    reviewDrafts: number;
    scheduledDrafts: number;
    failedDrafts: number;
    unmatchedMessages: number;
  };
}
