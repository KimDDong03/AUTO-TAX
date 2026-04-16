import type {
  AppSettings,
  CompletedBillingMonth,
  Customer,
  CustomerCertificate,
  CustomerCertificateInput,
  CustomerImportProfile,
  CustomerInput,
  DashboardPayload,
  DraftStatus,
  InboxMessage,
  InvoiceDraft,
  LogEntry,
  MailParseStatus,
  ParsedMail,
  PilotDraftTimeline,
  PilotIssuanceReport,
  PopbillEnvironment,
  PopbillState
} from "./domain.js";

export interface CertificateCheckMetadataUpdate {
  certLastCheckedAt?: string | null;
  certAlertLastSentAt?: string | null;
}

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
  listCustomerCertificates(): Promise<CustomerCertificate[]>;
  getCustomerCertificatePassword(certificateId: number): Promise<string>;
  getCustomer(customerId: number): Promise<Customer | null>;
  findCustomerByBusinessNumber(businessNumber: string): Promise<Customer | null>;
  findCustomerByMatchAddress(matchAddress: string): Promise<Customer | null>;
  saveCustomer(input: CustomerInput, customerId?: number): Promise<Customer>;
  upsertCustomerCertificate(input: CustomerCertificateInput): Promise<CustomerCertificate>;
  deleteCustomerCertificate(certificateId: number): Promise<void>;
  updateCustomerTaxProfile(customerId: number, bizType: string, bizClass: string): Promise<Customer>;
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
    draftSource?: "mail-sync" | "mail-reprocess" | "other";
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
  getPilotIssuanceReport(options?: { from?: string | null; to?: string | null }): Promise<PilotIssuanceReport>;
  getDraftPilotTimeline(draftId: number): Promise<PilotDraftTimeline | null>;
  getBootstrapWorkspace(): Promise<Omit<DashboardPayload, "logs" | "renewalAutomation">>;
  getDashboard(): Promise<Omit<DashboardPayload, "renewalAutomation">>;
  updateSettings(input: Partial<AppSettings>): Promise<AppSettings>;
  updateCertificateCheckMetadata(input: CertificateCheckMetadataUpdate): Promise<void>;
  close(): Promise<void>;
}
