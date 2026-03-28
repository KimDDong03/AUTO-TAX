import type {
  AppSettings,
  CompletedBillingMonth,
  Customer,
  CustomerImportProfile,
  CustomerInput,
  DashboardPayload,
  DraftStatus,
  InboxMessage,
  InvoiceDraft,
  LogEntry,
  MailParseStatus,
  ParsedMail,
  PopbillEnvironment,
  PopbillState
} from "./domain.js";

export interface AppStore {
  initialize(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  getCustomerImportProfile(): Promise<CustomerImportProfile | null>;
  updateCustomerImportProfile(input: Pick<CustomerImportProfile, "headerRowIndex" | "fieldHeaderMap">): Promise<CustomerImportProfile>;
  listCompletedBillingMonths(): Promise<CompletedBillingMonth[]>;
  markCompletedBillingMonth(billingMonth: string): Promise<CompletedBillingMonth>;
  getMailSyncCheckpoint(mailbox: string): Promise<number | null>;
  updateMailSyncCheckpoint(mailbox: string, lastUid: number): Promise<void>;
  listCustomers(): Promise<Customer[]>;
  getCustomer(customerId: number): Promise<Customer | null>;
  findCustomerByBusinessNumber(businessNumber: string): Promise<Customer | null>;
  findCustomerByMatchAddress(matchAddress: string): Promise<Customer | null>;
  saveCustomer(input: CustomerInput, customerId?: number): Promise<Customer>;
  updateCustomerPopbillUserId(customerId: number, popbillUserId: string): Promise<Customer>;
  updateCustomerPopbillState(customerId: number, state: PopbillState, certRegistered?: boolean, certExpireDate?: string | null): Promise<Customer>;
  resetCustomerPopbill(customerId: number): Promise<Customer>;
  deleteCustomer(customerId: number): Promise<void>;
  getMessageByUid(messageUid: string): Promise<InboxMessage | null>;
  getInboxMessage(messageId: number): Promise<InboxMessage | null>;
  saveInboxMessage(args: {
    messageUid: string;
    mailbox: string;
    fromAddress: string;
    subject: string;
    receivedAt: string;
    rawSource: string;
    textBody: string;
    parseStatus: MailParseStatus;
    parseError?: string;
    parsedData?: ParsedMail | null;
    customerId?: number | null;
    draftId?: number | null;
  }): Promise<InboxMessage>;
  createDraft(args: {
    customer: Customer;
    sourceMessageId: number;
    status: DraftStatus;
    scheduledFor: string | null;
    parsedMail: ParsedMail;
  }): Promise<InvoiceDraft>;
  findDraftByCustomerAndBillingMonth(customerId: number, billingMonth: string): Promise<InvoiceDraft | null>;
  refreshDraftFromParsedMail(draftId: number, parsedMail: ParsedMail): Promise<InvoiceDraft>;
  updateInboxParsedData(messageId: number, parsedMail: ParsedMail): Promise<InboxMessage>;
  updateInboxMatchResult(args: {
    messageId: number;
    parseStatus: MailParseStatus;
    parseError?: string;
    parsedMail?: ParsedMail | null;
    customerId?: number | null;
    draftId?: number | null;
  }): Promise<InboxMessage>;
  getDraft(draftId: number): Promise<InvoiceDraft | null>;
  listDrafts(): Promise<InvoiceDraft[]>;
  listInbox(): Promise<InboxMessage[]>;
  listLogs(): Promise<LogEntry[]>;
  updateDraftStatus(
    draftId: number,
    status: DraftStatus,
    issueError?: string,
    writeDate?: string | null,
    popbillResult?: unknown,
    popbillEnvironment?: PopbillEnvironment | null
  ): Promise<InvoiceDraft>;
  updateDraftPopbillEnvironment(draftId: number, popbillEnvironment: PopbillEnvironment): Promise<InvoiceDraft>;
  claimDraftForIssue(draftId: number): Promise<InvoiceDraft | null>;
  reopenIssuedDraftForReissue(draftId: number): Promise<InvoiceDraft>;
  markDraftRequested(draftId: number): Promise<void>;
  getDueAutoDrafts(now: Date): Promise<InvoiceDraft[]>;
  createLog(level: LogEntry["level"], scope: string, message: string, context?: unknown): Promise<void>;
  getDashboard(): Promise<Omit<DashboardPayload, "renewalAutomation">>;
  updateSettings(input: Partial<AppSettings>): Promise<AppSettings>;
  close(): Promise<void>;
}
