import type { Customer } from "../../types";

export type CustomerSearchField = "all" | "corpName" | "customerName" | "businessNumber" | "phone" | "issueMonth";

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_INITIAL_INTERVAL = 588;
const HANGUL_INITIAL_CONSONANTS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ"
] as const;
const HANGUL_INITIAL_CONSONANT_SET = new Set<string>(HANGUL_INITIAL_CONSONANTS);

function normalizeCustomerSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function compactCustomerSearchValue(value: string): string {
  return normalizeCustomerSearchValue(value).replace(/[\s-]+/g, "");
}

function isInitialConsonantQuery(value: string): boolean {
  const compactValue = value.replace(/\s+/g, "");
  return compactValue.length > 0 && [...compactValue].every((character) => HANGUL_INITIAL_CONSONANT_SET.has(character));
}

function extractInitialConsonants(value: string): string {
  let result = "";

  for (const character of value.replace(/\s+/g, "")) {
    const codePoint = character.charCodeAt(0);

    if (codePoint >= HANGUL_SYLLABLE_START && codePoint <= HANGUL_SYLLABLE_END) {
      const syllableIndex = codePoint - HANGUL_SYLLABLE_START;
      result += HANGUL_INITIAL_CONSONANTS[Math.floor(syllableIndex / HANGUL_INITIAL_INTERVAL)];
      continue;
    }

    if (HANGUL_INITIAL_CONSONANT_SET.has(character)) {
      result += character;
    }
  }

  return result;
}

function matchesCustomerSearchValue(value: string, normalizedQuery: string, compactQuery: string): boolean {
  const normalizedValue = normalizeCustomerSearchValue(value);
  if (normalizedValue.includes(normalizedQuery)) {
    return true;
  }

  const compactValue = compactCustomerSearchValue(value);
  return compactQuery.length > 0 && compactValue.includes(compactQuery);
}

function expandIssueMonthSearchValues(issueMonths: string[]): string[] {
  return issueMonths.flatMap((issueMonth) => {
    const normalizedIssueMonth = issueMonth.trim();
    const match = /^(\d{4})-(\d{2})$/.exec(normalizedIssueMonth);
    if (!match) {
      return normalizedIssueMonth ? [normalizedIssueMonth] : [];
    }

    const [, year, paddedMonth] = match;
    const month = String(Number(paddedMonth));
    return [
      normalizedIssueMonth,
      `${year}${paddedMonth}`,
      `${year}${month}`,
      `${year}년 ${month}월`,
      `${year}년${month}월`,
      `${year}. ${month}.`,
      `${year}.${month}.`,
      `${year}.${month}`
    ];
  });
}

function getCustomerSearchValues(customer: Customer, field: CustomerSearchField, issueMonths: string[]): string[] {
  const issueMonthValues = expandIssueMonthSearchValues(issueMonths);

  switch (field) {
    case "corpName":
      return [customer.corpName];
    case "customerName":
      return [customer.customerName];
    case "businessNumber":
      return [customer.businessNumber];
    case "phone":
      return [customer.renewalContactMobile];
    case "issueMonth":
      return issueMonthValues;
    case "all":
    default:
      return [
        customer.corpName,
        customer.customerName,
        customer.businessNumber,
        customer.renewalContactMobile,
        ...issueMonthValues
      ];
  }
}

function getInitialConsonantSearchValues(customer: Customer, field: CustomerSearchField): string[] {
  switch (field) {
    case "corpName":
      return [customer.corpName];
    case "customerName":
      return [customer.customerName];
    case "all":
      return [customer.corpName, customer.customerName];
    default:
      return [];
  }
}

export function matchesCustomerSearchQuery(
  customer: Customer,
  query: string,
  field: CustomerSearchField = "all",
  issueMonths: string[] = []
): boolean {
  const normalizedQuery = normalizeCustomerSearchValue(query);
  if (normalizedQuery === "") {
    return true;
  }

  const compactQuery = compactCustomerSearchValue(query);
  const useInitialConsonantSearch = isInitialConsonantQuery(query);
  const normalizedInitialQuery = useInitialConsonantSearch ? query.replace(/\s+/g, "") : "";

  if (
    useInitialConsonantSearch &&
    getInitialConsonantSearchValues(customer, field).some((value) => extractInitialConsonants(value).includes(normalizedInitialQuery))
  ) {
    return true;
  }

  return getCustomerSearchValues(customer, field, issueMonths).some((value) =>
    matchesCustomerSearchValue(value, normalizedQuery, compactQuery)
  );
}
