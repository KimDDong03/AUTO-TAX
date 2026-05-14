import { createRequire } from "node:module";
import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import {
  POPBILL_XMS_LMS_BYTE_LIMIT,
  buildIssueCompleteMessageContent as buildIssueCompleteMessageContentFromTemplate,
  getPopbillMessageByteLength
} from "./issue-message-template.js";
import { digitsOnly, formatWriteDate } from "./utils.js";

export {
  DEFAULT_ISSUE_COMPLETE_SMS_TEMPLATE,
  POPBILL_XMS_LMS_BYTE_LIMIT,
  POPBILL_XMS_SMS_BYTE_LIMIT,
  getPopbillMessageByteLength,
  normalizeIssueCompleteSmsTemplate,
  resolveIssueCompleteSmsTemplate,
  validateIssueCompleteSmsTemplateByteLength
} from "./issue-message-template.js";

const require = createRequire(import.meta.url);
const popbill = require("popbill");
const MGT_KEY_TYPE_SELL = popbill.MgtKeyType?.SELL ?? "SELL";

export type PopbillOperation =
  | "join-member"
  | "check-member"
  | "quit-member"
  | "contact-update"
  | "cert-url"
  | "cert-expire-date"
  | "partner-balance"
  | "unit-cost"
  | "balance"
  | "partner-charge-url"
  | "invoice-info"
  | "invoice-view-url"
  | "invoice-print-url"
  | "invoice-cancel"
  | "invoice-issue"
  | "message-send";

type CallbackResult<T> = {
  response?: T;
  error?: { code?: string | number; message?: string };
};

type PopbillErrorInfo = {
  status: number;
  message: string;
};

function formatPopbillCode(code: string): string {
  return code === "POPBILL" ? "POPBILL" : `POPBILL ${code}`;
}

function appendCode(message: string, code: string): string {
  return `${message} [${formatPopbillCode(code)}]`;
}

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolvePopbillNoticeContactEmail(settings: AppSettings): string {
  const explicitContactEmail = envString("AUTO_TAX_POPBILL_CONTACT_EMAIL");
  if (explicitContactEmail) {
    return explicitContactEmail;
  }

  const opsEmail = envString("AUTO_TAX_OPS_EMAILS")
    ?.split(",")
    .map((item) => item.trim())
    .find(Boolean);
  return opsEmail ?? settings.operatorContactEmail;
}

function matchesAny(source: string, patterns: string[]): boolean {
  return patterns.some((pattern) => source.includes(pattern));
}

function mapPopbillError(operation: PopbillOperation, code: string, rawMessage: string): PopbillErrorInfo {
  const normalized = rawMessage.toLowerCase();

  if (
    code === "-99003008" ||
    normalized.includes("연동회원으로 가입된 사업자 번호가 존재하지 않습니다") ||
    normalized.includes("가입된 사업자 번호가 존재하지 않습니다")
  ) {
    return {
      status: 409,
      message: appendCode("발행 연동 계정이 없습니다. 고객 발행 연동을 다시 진행하세요.", code)
    };
  }

  if (
    operation === "join-member" &&
    matchesAny(normalized, ["회원아이디", "아이디", "중복", "사용중", "duplicate", "already", "exists"])
  ) {
    return {
      status: 409,
      message: appendCode("발행 연동 ID가 이미 사용 중입니다. 다른 ID로 다시 시도하세요.", code)
    };
  }

  if (normalized.includes("포인트 부족")) {
    return {
      status: 409,
      message: appendCode("발행 포인트가 부족합니다. 포인트를 충전한 뒤 다시 시도하세요.", code)
    };
  }

  if (matchesAny(normalized, ["공동인증서", "인증서"])) {
    return {
      status: 409,
      message: appendCode("공동인증서가 등록되지 않았거나 인증서 상태를 확인할 수 없습니다.", code)
    };
  }

  if (
    ["invoice-info", "invoice-view-url", "invoice-print-url", "invoice-cancel"].includes(operation) &&
    matchesAny(normalized, ["문서를 찾을 수", "문서가 존재하지", "관리번호", "해당 문서", "조회된 문서", "존재하지"])
  ) {
    return {
      status: 404,
      message: appendCode(
        "발행 문서를 찾지 못했습니다. 현재 연결 모드와 문서가 발행된 환경(테스트/운영)이 같은지 확인하세요.",
        code
      )
    };
  }

  const fallbackByOperation: Record<PopbillOperation, string> = {
    "join-member": "발행 연동에 실패했습니다.",
    "check-member": "발행 연동 상태 확인에 실패했습니다.",
    "quit-member": "발행 연동 계정 해지에 실패했습니다.",
    "contact-update": "발행 연동 연락처를 갱신하지 못했습니다.",
    "cert-url": "전자세금용 공동인증서 등록 URL을 가져오지 못했습니다.",
    "cert-expire-date": "전자세금용 공동인증서 상태를 조회하지 못했습니다.",
    "partner-balance": "연동 포인트를 조회하지 못했습니다.",
    "unit-cost": "전자세금계산서 연동 단가를 조회하지 못했습니다.",
    balance: "연동 잔액을 조회하지 못했습니다.",
    "partner-charge-url": "연동 충전 페이지 URL을 가져오지 못했습니다.",
    "invoice-info": "발행 문서 정보를 조회하지 못했습니다.",
    "invoice-view-url": "발행 문서 보기 URL을 가져오지 못했습니다.",
    "invoice-print-url": "발행 문서 인쇄 URL을 가져오지 못했습니다.",
    "invoice-cancel": "발행 문서 취소에 실패했습니다.",
    "invoice-issue": "전자세금계산서 발행에 실패했습니다.",
    "message-send": "발행 완료 문자 전송에 실패했습니다."
  };

  return {
    status: 400,
    message: appendCode(fallbackByOperation[operation], code)
  };
}

export class PopbillApiError extends Error {
  readonly code: string;
  readonly rawMessage: string;
  readonly operation: PopbillOperation;
  readonly status: number;

  constructor(operation: PopbillOperation, code: string | number | undefined, rawMessage: string | undefined) {
    const normalizedCode = String(code ?? "POPBILL");
    const normalizedRawMessage = rawMessage?.trim() || "외부 연동 호출 실패";
    const mapped = mapPopbillError(operation, normalizedCode, normalizedRawMessage);
    super(mapped.message);
    this.name = "PopbillApiError";
    this.code = normalizedCode;
    this.rawMessage = normalizedRawMessage;
    this.operation = operation;
    this.status = mapped.status;
  }
}

export function isPopbillMemberMissingError(error: unknown): boolean {
  if (!(error instanceof PopbillApiError)) {
    return false;
  }

  const normalizedRawMessage = error.rawMessage.toLowerCase();
  return (
    error.code === "-99003008" ||
    (error.operation === "contact-update" && error.code === "-10000006") ||
    normalizedRawMessage.includes("연동회원으로 가입된 사업자 번호가 존재하지 않습니다") ||
    normalizedRawMessage.includes("가입된 사업자 번호가 존재하지 않습니다")
  );
}

function isPopbillQuitUserIdMismatchError(error: unknown): boolean {
  if (!(error instanceof PopbillApiError)) {
    return false;
  }

  const normalizedRawMessage = error.rawMessage.toLowerCase();
  return (
    error.operation === "quit-member" &&
    (error.code === "-10000038" ||
      normalizedRawMessage.includes("회원의 아이디가 아닙니다") ||
      normalizedRawMessage.includes("member id"))
  );
}

function getService(settings: AppSettings): any {
  if (!settings.popbillLinkId || !settings.popbillSecretKey) {
    throw new Error("발행 연동 서버 운영값이 설정되지 않았습니다.");
  }

  popbill.config({
    LinkID: settings.popbillLinkId,
    SecretKey: settings.popbillSecretKey,
    IsTest: settings.popbillIsTest,
    defaultErrorHandler: () => undefined
  });

  // The Popbill Node SDK caches service singletons on the module export object.
  // When IsTest flips between test and production, we must clear the cached
  // service so the next instance picks up the new config.
  delete popbill._TaxinvoiceService;

  return popbill.TaxinvoiceService();
}

function getMessageService(settings: AppSettings): any {
  if (!settings.popbillLinkId || !settings.popbillSecretKey) {
    throw new Error("발행 연동 서버 운영값이 설정되지 않았습니다.");
  }

  popbill.config({
    LinkID: settings.popbillLinkId,
    SecretKey: settings.popbillSecretKey,
    IsTest: settings.popbillIsTest,
    defaultErrorHandler: () => undefined
  });

  delete popbill._MessageService;

  return popbill.MessageService();
}

function promisify<T>(
  operation: PopbillOperation,
  executor: (done: (result: CallbackResult<T>) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    executor((result) => {
      if (result.error) {
        reject(new PopbillApiError(operation, result.error.code, result.error.message));
        return;
      }
      resolve(result.response as T);
    });
  });
}

function assertCustomerPopbillIdentity(customer: Customer): void {
  if (!customer.popbillUserId) {
    throw new Error("고객 발행 연동 ID가 없습니다. 서버 발행 연동 운영값을 확인한 뒤 고객을 다시 저장하세요.");
  }
}

function assertOperatorContact(settings: AppSettings): void {
  if (!settings.operatorContactName || !resolvePopbillNoticeContactEmail(settings) || !settings.operatorContactTel) {
    throw new Error("시스템설정의 운영 이름, 이메일, 연락처를 먼저 입력하세요.");
  }
}

async function updatePopbillMemberContact(settings: AppSettings, customer: Customer): Promise<unknown> {
  assertCustomerPopbillIdentity(customer);
  assertOperatorContact(settings);
  const service = getService(settings);
  return await promisify("contact-update", (done) => {
    service.updateContact(
      digitsOnly(customer.businessNumber),
      customer.popbillUserId,
      {
        personName: settings.operatorContactName,
        tel: settings.operatorContactTel,
        hp: "",
        email: resolvePopbillNoticeContactEmail(settings),
        fax: "",
        searchAllAllowYN: true,
        mgrYN: true
      },
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

function parsePointValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCertificateExpireDate(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const compact = trimmed.replace(/\D/g, "");
  if (compact.length >= 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
    const day = `${parsed.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  throw new Error(`인증서 만료일 형식을 해석하지 못했습니다: ${value}`);
}

export async function joinMember(settings: AppSettings, customer: Customer): Promise<unknown> {
  assertCustomerPopbillIdentity(customer);
  assertOperatorContact(settings);
  if (!customer.popbillPassword) {
    throw new Error("고객 발행 연동 비밀번호가 없습니다. 서버 발행 연동 운영값을 확인한 뒤 고객을 다시 저장하세요.");
  }
  const service = getService(settings);
  return promisify("join-member", (done) => {
    service.joinMember(
      {
        LinkID: settings.popbillLinkId,
        CorpNum: digitsOnly(customer.businessNumber),
        CEOName: customer.ceoName,
        CorpName: customer.corpName,
        Addr: customer.addr,
        BizType: customer.bizType,
        BizClass: customer.bizClass,
        ContactName: settings.operatorContactName,
        ContactEmail: resolvePopbillNoticeContactEmail(settings),
        ContactTEL: settings.operatorContactTel,
        ID: customer.popbillUserId,
        PWD: customer.popbillPassword
      },
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function checkIsMember(settings: AppSettings, businessNumber: string): Promise<boolean> {
  const service = getService(settings);
  return promisify("check-member", (done) => {
    service.checkIsMember(
      digitsOnly(businessNumber),
      (response: unknown) => done({ response: response === true || response === "true" || response === 1 || response === "1" }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function quitMember(settings: AppSettings, customer: Customer, quitReason: string): Promise<unknown> {
  if (!quitReason.trim()) {
    throw new Error("발행 연동 해지 사유가 비어 있습니다.");
  }
  const corpNum = digitsOnly(customer.businessNumber);
  const popbillUserId = customer.popbillUserId?.trim() ?? "";

  if (popbillUserId) {
    await updatePopbillMemberContact(settings, customer);
  }

  const service = getService(settings);
  const quitByCorpNumOnly = async () =>
    await promisify("quit-member", (done) => {
      service.quitMember(
        corpNum,
        quitReason,
        (response: unknown) => done({ response }),
        (error: CallbackResult<never>["error"]) => done({ error })
      );
    });

  if (!popbillUserId) {
    return await quitByCorpNumOnly();
  }

  try {
    return await promisify("quit-member", (done) => {
      service.quitMember(
        corpNum,
        quitReason,
        popbillUserId,
        (response: unknown) => done({ response }),
        (error: CallbackResult<never>["error"]) => done({ error })
      );
    });
  } catch (error) {
    if (!isPopbillQuitUserIdMismatchError(error)) {
      throw error;
    }

    return await quitByCorpNumOnly();
  }
}

export async function getTaxCertURL(settings: AppSettings, customer: Customer): Promise<string> {
  assertCustomerPopbillIdentity(customer);
  const service = getService(settings);
  return promisify("cert-url", (done) => {
    service.getTaxCertURL(
      digitsOnly(customer.businessNumber),
      customer.popbillUserId || "",
      (response: string) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function getPartnerBalance(settings: AppSettings, businessNumber: string): Promise<{ remainPoint: number; defUsedPoint: number }> {
  const service = getService(settings);
  return promisify<unknown>("partner-balance", (done) => {
    service.getPartnerBalance(
      digitsOnly(businessNumber),
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  }).then((response) => ({
    remainPoint: parsePointValue(response),
    defUsedPoint: 0
  }));
}

export async function getTaxInvoiceUnitCost(settings: AppSettings, businessNumber: string): Promise<number> {
  const service = getService(settings);
  return promisify<unknown>("unit-cost", (done) => {
    service.getUnitCost(
      digitsOnly(businessNumber),
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  }).then((response) => parsePointValue(response));
}

export async function getBalance(settings: AppSettings, businessNumber: string): Promise<number> {
  const service = getService(settings);
  return promisify<unknown>("balance", (done) => {
    service.getBalance(
      digitsOnly(businessNumber),
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  }).then((response) => parsePointValue(response));
}

export async function getPartnerChargeURL(settings: AppSettings, businessNumber: string): Promise<string> {
  const service = getService(settings);
  return promisify("partner-charge-url", (done) => {
    service.getPartnerURL(
      digitsOnly(businessNumber),
      "CHRG",
      (response: string) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function getCertificateExpireDate(settings: AppSettings, customer: Customer): Promise<string> {
  assertCustomerPopbillIdentity(customer);
  const service = getService(settings);
  return promisify<string>("cert-expire-date", (done) => {
    service.getCertificateExpireDate(
      digitsOnly(customer.businessNumber),
      customer.popbillUserId || "",
      (response: string) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  }).then((response) => normalizeCertificateExpireDate(response));
}

export async function getTaxInvoiceInfo(settings: AppSettings, customer: Customer, draft: InvoiceDraft): Promise<unknown> {
  assertCustomerPopbillIdentity(customer);
  const service = getService(settings);
  return promisify("invoice-info", (done) => {
    service.getInfo(
      digitsOnly(customer.businessNumber),
      MGT_KEY_TYPE_SELL,
      draft.popbillMgtKey,
      customer.popbillUserId || "",
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function getTaxInvoiceViewURL(settings: AppSettings, customer: Customer, draft: InvoiceDraft): Promise<string> {
  assertCustomerPopbillIdentity(customer);
  const service = getService(settings);
  return promisify("invoice-view-url", (done) => {
    service.getViewURL(
      digitsOnly(customer.businessNumber),
      MGT_KEY_TYPE_SELL,
      draft.popbillMgtKey,
      customer.popbillUserId || "",
      (response: string) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function getTaxInvoicePrintURL(settings: AppSettings, customer: Customer, draft: InvoiceDraft): Promise<string> {
  assertCustomerPopbillIdentity(customer);
  const service = getService(settings);
  return promisify("invoice-print-url", (done) => {
    service.getPrintURL(
      digitsOnly(customer.businessNumber),
      MGT_KEY_TYPE_SELL,
      draft.popbillMgtKey,
      customer.popbillUserId || "",
      (response: string) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function cancelTaxInvoice(settings: AppSettings, customer: Customer, draft: InvoiceDraft, memo: string): Promise<unknown> {
  assertCustomerPopbillIdentity(customer);
  const service = getService(settings);
  return promisify("invoice-cancel", (done) => {
    service.cancelIssue(
      digitsOnly(customer.businessNumber),
      MGT_KEY_TYPE_SELL,
      draft.popbillMgtKey,
      memo,
      customer.popbillUserId || "",
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function issueTaxInvoice(
  settings: AppSettings,
  customer: Customer,
  draft: InvoiceDraft,
  writeDate: Date
): Promise<unknown> {
  assertCustomerPopbillIdentity(customer);
  const service = getService(settings);
  const formattedWriteDate = formatWriteDate(writeDate);

  const taxinvoice = {
    writeDate: formattedWriteDate,
    chargeDirection: "정과금",
    issueType: "정발행",
    purposeType: "청구",
    issueTiming: "직접발행",
    taxType: "과세",
    invoicerCorpNum: digitsOnly(customer.businessNumber),
    invoicerMgtKey: draft.popbillMgtKey,
    invoicerTaxRegID: "",
    invoicerCorpName: customer.corpName,
    invoicerCEOName: customer.ceoName,
    invoicerAddr: customer.addr,
    invoicerBizClass: customer.bizClass,
    invoicerBizType: customer.bizType,
    invoicerContactName: "",
    invoicerTEL: "",
    invoicerEmail: "",
    invoicerSMSSendYN: false,
    invoiceeType: "사업자",
    invoiceeCorpNum: digitsOnly(draft.kepcoCorpNum),
    invoiceeTaxRegID: draft.kepcoBranchId,
    invoiceeCorpName: draft.kepcoCorpName,
    invoiceeCEOName: draft.kepcoCeoName,
    invoiceeAddr: draft.kepcoAddr,
    invoiceeBizClass: draft.kepcoBizClass,
    invoiceeBizType: draft.kepcoBizType,
    invoiceeContactName1: "",
    invoiceeTEL1: "",
    invoiceeEmail1: settings.imapUser,
    invoiceeSMSSendYN: false,
    taxTotal: String(draft.taxTotal),
    supplyCostTotal: String(draft.supplyCost),
    totalAmount: String(draft.totalAmount),
    serialNum: "1",
    remark1: draft.plantName,
    detailList: [
      {
        serialNum: 1,
        itemName: draft.itemName,
        purchaseDT: formattedWriteDate,
        supplyCost: String(draft.supplyCost),
        tax: String(draft.taxTotal),
        qty: "1"
      }
    ]
  };

  return promisify("invoice-issue", (done) => {
    service.registIssue(
      digitsOnly(customer.businessNumber),
      taxinvoice,
      false,
      false,
      "세금계산서 발행",
      "",
      "",
      customer.popbillUserId || "",
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export type IssueCompleteMessageInput = {
  organizationName: string;
  receiverMobile: string;
};

export function buildIssueCompleteMessageContent(
  input: Pick<IssueCompleteMessageInput, "organizationName">,
  customer: Pick<Customer, "customerName" | "issueCompleteSmsTemplate">,
  draft: Pick<InvoiceDraft, "plantName" | "totalAmount">
): string {
  return buildIssueCompleteMessageContentFromTemplate(input, customer, draft);

  const senderName = input.organizationName.trim();
  const targetName = draft.plantName.trim() || customer.customerName.trim();
  const totalAmount = new Intl.NumberFormat("ko-KR").format(draft.totalAmount);
  return `${senderName}에서 ${targetName} 세금계산서 ${totalAmount}원 발행이 완료되었습니다.`;
}

export function normalizeIssueMessageReceiver(value: string): string | null {
  const normalized = digitsOnly(value);
  return /^01[016789]\d{7,8}$/.test(normalized) ? normalized : null;
}

export async function sendIssueCompleteMessage(
  settings: AppSettings,
  customer: Customer,
  draft: InvoiceDraft,
  input: IssueCompleteMessageInput
): Promise<unknown> {
  assertCustomerPopbillIdentity(customer);
  const receiver = normalizeIssueMessageReceiver(input.receiverMobile);
  if (!receiver) {
    throw new Error("수신 가능한 고객 휴대폰 번호가 없습니다.");
  }

  const sender = digitsOnly(settings.operatorContactTel);
  if (!sender) {
    throw new Error("문자 발신번호가 설정되지 않았습니다.");
  }

  const service = getMessageService(settings);
  const content = buildIssueCompleteMessageContent(input, customer, draft);
  const contentBytes = getPopbillMessageByteLength(content);
  if (contentBytes > POPBILL_XMS_LMS_BYTE_LIMIT) {
    throw new Error(`문자 내용이 LMS 최대 ${POPBILL_XMS_LMS_BYTE_LIMIT}byte를 초과했습니다.`);
  }

  return promisify("message-send", (done) => {
    service.sendXMS(
      digitsOnly(customer.businessNumber),
      sender,
      receiver,
      customer.customerName,
      "세금계산서 발행 완료",
      content,
      "",
      false,
      settings.operatorContactName || "",
      `issue-${draft.id}`,
      customer.popbillUserId || "",
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}
