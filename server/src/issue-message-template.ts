import type { Customer, InvoiceDraft } from "./domain.js";

export const POPBILL_XMS_SMS_BYTE_LIMIT = 90;
export const POPBILL_XMS_LMS_BYTE_LIMIT = 2000;

export const DEFAULT_ISSUE_COMPLETE_SMS_TEMPLATE =
  "{회사명}에서 {발전소명} 세금계산서 {금액}원 발행이 완료되었습니다.";

export function getPopbillMessageByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : 2;
  }
  return bytes;
}

export function normalizeIssueCompleteSmsTemplate(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

export function resolveIssueCompleteSmsTemplate(value: string | null | undefined): string {
  const normalized = normalizeIssueCompleteSmsTemplate(value);
  return normalized || DEFAULT_ISSUE_COMPLETE_SMS_TEMPLATE;
}

export function validateIssueCompleteSmsTemplateByteLength(template: string): string | null {
  const bytes = getPopbillMessageByteLength(resolveIssueCompleteSmsTemplate(template));
  if (bytes > POPBILL_XMS_LMS_BYTE_LIMIT) {
    return `문자 양식은 팝빌 LMS 최대 ${POPBILL_XMS_LMS_BYTE_LIMIT}byte 이내로 입력해야 합니다.`;
  }
  return null;
}

export function renderIssueCompleteSmsTemplate(
  template: string,
  values: {
    organizationName: string;
    customerName: string;
    plantName: string;
    totalAmount: string;
  }
): string {
  const replacements: Record<string, string> = {
    회사명: values.organizationName,
    고객명: values.customerName,
    발전소명: values.plantName,
    금액: values.totalAmount,
    organizationName: values.organizationName,
    customerName: values.customerName,
    plantName: values.plantName,
    totalAmount: values.totalAmount
  };

  return template.replace(/\{([^{}]+)\}/g, (placeholder, key: string) => replacements[key.trim()] ?? placeholder);
}

export function buildIssueCompleteMessageContent(
  input: { organizationName: string },
  customer: Pick<Customer, "customerName" | "issueCompleteSmsTemplate">,
  draft: Pick<InvoiceDraft, "plantName" | "totalAmount">
): string {
  const senderName = input.organizationName.trim();
  const customerName = customer.customerName.trim();
  const targetName = draft.plantName.trim() || customerName;
  const totalAmount = new Intl.NumberFormat("ko-KR").format(draft.totalAmount);
  const template = resolveIssueCompleteSmsTemplate(customer.issueCompleteSmsTemplate);
  return renderIssueCompleteSmsTemplate(template, {
    organizationName: senderName,
    customerName,
    plantName: targetName,
    totalAmount
  });
}
