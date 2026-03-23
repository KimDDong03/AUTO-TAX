export type IssueMode = "review" | "auto";
export type PopbillState = "pending" | "joined" | "failed";
export type MailParseStatus = "pending" | "parsed" | "failed" | "unmatched";
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
  plantNames: string[];
  matchAddresses: string[];
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
