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
  const nextPattern = nextLabels.map((nextLabel) => `\\s*○\\s*${escapeRegex(nextLabel)}\\s*:`).join("|");
  const terminator = nextPattern ? `(?:${nextPattern}|\\s*※|$)` : `(?:\\s*※|$)`;
  const pattern = new RegExp(`${escapeRegex(label)}\\s*:\\s*([\\s\\S]*?)(?=${terminator})`);
  return matchRequired(text, pattern, label);
}

function parseAmount(value: string): number {
  return Number(value.replace(/[^\d]/g, ""));
}

export function parseKepcoMail(rawText: string): ParsedMail {
  const original = extractOriginalText(rawText);
  const normalized = original.replace(/[ \t]+/g, " ");

  const originalFromMatch = normalized.match(/From:\s*"?.*?"?<([^>]+)>/i);
  const originalFrom = originalFromMatch?.[1]?.trim() ?? "";

  const plantName = matchRequired(normalized, /발전소명\s*:\s*([^\n]+)/, "발전소명");
  const plantAddress = toRoadAddress(matchRequired(normalized, /(?:^|\n)\s*(?:○\s*)?주\s*소\s*:\s*([^\n]+)/, "발전소 주소"));

  const monthMatch = normalized.match(/(\d{4})\.(\d{2})월분 구입전력금액은 공급가액 기준\s*([\d,]+)원/);
  if (!monthMatch) {
    throw new Error("정산월 또는 공급가액을 찾지 못했습니다.");
  }

  const billingMonth = `${monthMatch[1]}-${monthMatch[2]}`;
  const supplyCost = parseAmount(monthMatch[3]);

  const vatMatch = normalized.match(/VAT\s*:\s*([\d,]+)원/);
  const taxTotal = vatMatch ? parseAmount(vatMatch[1]) : Math.floor(supplyCost * 0.1);

  const recipientEmail =
    normalized.match(/그 외\s*:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1] ??
    normalized.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*\(타 기관 이용 시\)/i)?.[1] ??
    "";

  const kepcoCorpNum = matchRequired(normalized, /등록번호\s*:\s*([\d-]+)/, "한전 등록번호");
  const kepcoBranchId = ensureBranchId(matchRequired(normalized, /종사업장(?:번호)?\s*:\s*(\d+)/, "한전 종사업장번호"));
  const kepcoCorpName = matchScoped(normalized, "상호", ["성명", "사업장 주소", "업태"]);
  const kepcoCeoName = matchScoped(normalized, "성명", ["사업장 주소", "업태"]);
  const kepcoAddr = matchScoped(normalized, "사업장 주소", ["업태"]);
  const kepcoBizType = matchScoped(normalized, "업태", ["종목"]).replace(/\s*\/\s*종목\s*:.*$/, "").trim();
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
    recipientEmail: recipientEmail.trim(),
    rawText: original
  };
}
