import type { ParsedMail } from "./domain.js";
import { ensureBranchId, formatItemName, toRoadAddress } from "./utils.js";

function cleanText(input: string): string {
  return input.replace(/\r/g, "").trim();
}

function extractOriginalText(input: string): string {
  const text = cleanText(input);
  const marker = "-----Original Message-----";
  if (text.includes(marker)) {
    return text.split(marker).slice(1).join(marker).trim();
  }
  return text;
}

function matchRequired(text: string, pattern: RegExp, label: string): string {
  const match = text.match(pattern);
  if (!match?.[1]) {
    throw new Error(`${label} 값을 찾지 못했습니다.`);
  }
  return match[1].trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchScoped(text: string, label: string, nextLabels: string[]): string {
  const nextPattern = nextLabels
    .map((nextLabel) => `\\s*(?:○\\s*)?${escapeRegex(nextLabel)}\\s*[:：]`)
    .join("|");
  const terminator = nextPattern ? `(?:${nextPattern}|\\s*※|$)` : `(?:\\s*※|$)`;
  const pattern = new RegExp(`${escapeRegex(label)}\\s*[:：]\\s*([\\s\\S]*?)(?=${terminator})`);
  return matchRequired(text, pattern, label);
}

function parseAmount(value: string): number {
  return Number(value.replace(/[^\d]/g, ""));
}

function matchBillingMonthAndSupplyCost(text: string): RegExpMatchArray | null {
  return (
    text.match(/(\d{4})\s*[.\-]?\s*(\d{1,2})\s*월분\s+구입\s*전력금액\s*(?:은|는)\s+공급가액\s*기준?\s*([\d,]+)원/i) ??
    text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월분\s+구입\s*전력금액\s*(?:은|는)\s+공급가액\s*기준?\s*([\d,]+)원/i)
  );
}

function matchBillingMonthFallback(text: string): RegExpMatchArray | null {
  return (
    text.match(/(\d{4})\s*[.\-]?\s*(\d{1,2})\s*월분/i) ??
    text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월분/i)
  );
}

function matchSupplyCostFallback(text: string): string | null {
  return text.match(/공급가액\s*[:：]?\s*([\d,]+)원/i)?.[1] ?? null;
}

export function parseKepcoMail(rawText: string): ParsedMail {
  const original = extractOriginalText(rawText);
  const normalized = original.replace(/[ \t]+/g, " ");

  const originalFromMatch = normalized.match(/From:\s*"?.*?"?<([^>]+)>/i);
  const originalFrom = originalFromMatch?.[1]?.trim() ?? "";

  const plantName = matchRequired(normalized, /발전소명\s*[:：]\s*([^\n]+)/, "발전소명");
  const plantAddress = toRoadAddress(matchRequired(normalized, /(?:^|\n)\s*(?:○\s*)?주\s*소\s*[:：]\s*([^\n]+)/, "발전소 주소"));

  const monthMatch = matchBillingMonthAndSupplyCost(normalized);
  const fallbackMonthMatch = monthMatch ? null : matchBillingMonthFallback(normalized);
  const amountText = monthMatch?.[3] ?? matchSupplyCostFallback(normalized);

  const monthText = monthMatch?.[1] ?? fallbackMonthMatch?.[1];
  const monthIndex = monthMatch?.[2] ?? fallbackMonthMatch?.[2];

  if (!monthText || !monthIndex || !amountText) {
    throw new Error("정산월 또는 공급가액을 찾지 못했습니다.");
  }

  const billingMonth = `${monthText}-${monthIndex.padStart(2, "0")}`;
  const supplyCost = parseAmount(amountText);

  const vatMatch = normalized.match(/(?:VAT|부가세|부가가치세)\s*[:：]?\s*([\d,]+)원/i);
  const taxTotal = vatMatch ? parseAmount(vatMatch[1]) : Math.floor(supplyCost * 0.1);

  const kepcoCorpNum = matchRequired(normalized, /등록번호\s*[:：]\s*([\d-]+)/, "한전 등록번호");
  const kepcoBranchId = ensureBranchId(matchRequired(normalized, /종사업장(?:번호)?\s*[:：]\s*(\d+)/, "한전 종사업장번호"));
  const kepcoCorpName = matchScoped(normalized, "상호", ["성명", "사업장 주소", "업태"]);
  const kepcoCeoName = matchScoped(normalized, "성명", ["사업장 주소", "업태"]);
  const kepcoAddr = matchScoped(normalized, "사업장 주소", ["업태"]);
  const kepcoBizType = matchScoped(normalized, "업태", ["종목"])
    .replace(/\s*\/\s*종목\s*[:：].*$/, "")
    .replace(/\s*\/\s*$/, "")
    .trim();
  const kepcoBizClass = matchScoped(normalized, "종목", []).trim();

  return {
    originalFrom,
    plantName,
    plantAddress,
    billingMonth,
    supplyCost,
    taxTotal,
    totalAmount: supplyCost + taxTotal,
    itemName: formatItemName(billingMonth),
    kepcoCorpNum,
    kepcoBranchId,
    kepcoCorpName,
    kepcoCeoName,
    kepcoAddr,
    kepcoBizType,
    kepcoBizClass,
    rawText: original
  };
}
