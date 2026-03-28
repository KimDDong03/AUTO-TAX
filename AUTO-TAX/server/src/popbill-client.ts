import { createRequire } from "node:module";
import type { AppSettings, Customer, InvoiceDraft } from "./domain.js";
import { digitsOnly, formatWriteDate } from "./utils.js";

const require = createRequire(import.meta.url);
const popbill = require("popbill");
const MGT_KEY_TYPE_SELL = popbill.MgtKeyType?.SELL ?? "SELL";

type CallbackResult<T> = {
  response?: T;
  error?: { code?: string | number; message?: string };
};

function getService(settings: AppSettings): any {
  if (!settings.popbillLinkId || !settings.popbillSecretKey) {
    throw new Error("팝빌 LinkID 또는 SecretKey가 설정되지 않았습니다.");
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

function promisify<T>(executor: (done: (result: CallbackResult<T>) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    executor((result) => {
      if (result.error) {
        reject(new Error(`[${result.error.code ?? "POPBILL"}] ${result.error.message ?? "팝빌 호출 실패"}`));
        return;
      }
      resolve(result.response as T);
    });
  });
}

function assertCustomerPopbillIdentity(customer: Customer): void {
  if (!customer.popbillUserId) {
    throw new Error("고객 팝빌 ID가 없습니다. 시스템설정의 팝빌 ID 접두어를 확인한 뒤 고객을 다시 저장하세요.");
  }
}

function assertOperatorContact(settings: AppSettings): void {
  if (!settings.operatorContactName || !settings.operatorContactEmail || !settings.operatorContactTel) {
    throw new Error("시스템설정의 운영 담당자명, 이메일, 연락처를 먼저 입력하세요.");
  }
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
    throw new Error("고객 팝빌 비밀번호가 없습니다. 시스템설정의 팝빌 공통 비밀번호를 저장한 뒤 고객을 다시 저장하세요.");
  }
  const service = getService(settings);
  return promisify((done) => {
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
        ContactEmail: settings.operatorContactEmail,
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
  return promisify((done) => {
    service.checkIsMember(
      digitsOnly(businessNumber),
      (response: unknown) => done({ response: response === true || response === "true" || response === 1 || response === "1" }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function quitMember(settings: AppSettings, customer: Customer, quitReason: string): Promise<unknown> {
  assertCustomerPopbillIdentity(customer);
  if (!quitReason.trim()) {
    throw new Error("팝빌 탈퇴 사유가 비어 있습니다.");
  }
  const service = getService(settings);
  return promisify((done) => {
    service.quitMember(
      digitsOnly(customer.businessNumber),
      quitReason,
      customer.popbillUserId || "",
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}

export async function getTaxCertURL(settings: AppSettings, customer: Customer): Promise<string> {
  assertCustomerPopbillIdentity(customer);
  const service = getService(settings);
  return promisify((done) => {
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
  return promisify<unknown>((done) => {
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
  return promisify<unknown>((done) => {
    service.getUnitCost(
      digitsOnly(businessNumber),
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  }).then((response) => parsePointValue(response));
}

export async function getBalance(settings: AppSettings, businessNumber: string): Promise<number> {
  const service = getService(settings);
  return promisify<unknown>((done) => {
    service.getBalance(
      digitsOnly(businessNumber),
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  }).then((response) => parsePointValue(response));
}

export async function getPartnerChargeURL(settings: AppSettings, businessNumber: string): Promise<string> {
  const service = getService(settings);
  return promisify((done) => {
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
  return promisify<string>((done) => {
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
  return promisify((done) => {
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
  return promisify((done) => {
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
  return promisify((done) => {
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
  return promisify((done) => {
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
    invoicerEmail: settings.operatorContactEmail || "",
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
    invoiceeEmail1: draft.recipientEmail,
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

  return promisify((done) => {
    service.registIssue(
      digitsOnly(customer.businessNumber),
      taxinvoice,
      false,
      false,
      "AUTO-TAX 자동 발행",
      "",
      "",
      customer.popbillUserId || "",
      (response: unknown) => done({ response }),
      (error: CallbackResult<never>["error"]) => done({ error })
    );
  });
}
