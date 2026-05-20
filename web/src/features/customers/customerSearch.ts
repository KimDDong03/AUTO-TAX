import type { Customer } from "../../types";
import {
  compactSearchValue,
  extractInitialConsonants,
  isInitialConsonantQuery,
  matchesSearchText,
  normalizeInitialConsonantQuery,
  normalizeSearchValue
} from "../../lib/searchMatch";

export type CustomerSearchField = "all" | "corpName" | "customerName" | "businessNumber" | "phone" | "issueMonth";

function normalizeCustomerSearchValue(value: string): string {
  return normalizeSearchValue(value);
}

function compactCustomerSearchValue(value: string): string {
  return compactSearchValue(value);
}

function matchesCustomerSearchValue(value: string, normalizedQuery: string, compactQuery: string): boolean {
  return matchesSearchText(value, normalizedQuery) || (compactQuery.length > 0 && compactCustomerSearchValue(value).includes(compactQuery));
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
  const normalizedInitialQuery = useInitialConsonantSearch ? normalizeInitialConsonantQuery(query) : "";

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
