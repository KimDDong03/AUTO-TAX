import { resolveRoadAddress } from "../address-resolver.js";
import type { Customer } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import { digitsOnly, normalizeAddress, toRoadAddress } from "../utils.js";

export type CustomerImportMappedRow = {
  rowIndex: number;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
};

export type CustomerImportPreviewRow = CustomerImportMappedRow & {
  normalizedBusinessNumber: string;
  normalizedAddress: string;
  errors: string[];
  canImport: boolean;
};

export type CustomerImportPreviewResult = {
  totalRows: number;
  importableRows: number;
  blockedRows: number;
  rows: CustomerImportPreviewRow[];
};

export type CustomerImportCommitResult = {
  totalRows: number;
  successCount: number;
  failedCount: number;
  failedRows: Array<{ rowIndex: number; message: string }>;
};

export function normalizeCustomerImportRow(row: {
  rowIndex: number;
  customerName?: string;
  businessNumber?: string;
  corpName?: string;
  addr?: string;
}): CustomerImportMappedRow {
  return {
    rowIndex: row.rowIndex,
    customerName: row.customerName?.trim() ?? "",
    businessNumber: row.businessNumber?.trim() ?? "",
    corpName: row.corpName?.trim() ?? "",
    addr: row.addr?.trim() ?? ""
  };
}

export async function buildCustomerImportPreview(
  requestStore: AppStore,
  inputRows: CustomerImportMappedRow[]
): Promise<CustomerImportPreviewResult> {
  const customers = await requestStore.listCustomers();
  const businessNumberMap = new Map<string, Customer>();
  const addressMap = new Map<string, Customer>();

  for (const customer of customers) {
    const normalizedBusinessNumber = digitsOnly(customer.businessNumber);
    if (normalizedBusinessNumber) {
      businessNumberMap.set(normalizedBusinessNumber, customer);
    }

    const normalizedCustomerAddress = normalizeAddress(customer.addr);
    if (normalizedCustomerAddress && !addressMap.has(normalizedCustomerAddress)) {
      addressMap.set(normalizedCustomerAddress, customer);
    }

    for (const matchAddress of customer.matchAddresses) {
      const normalizedMatchAddress = normalizeAddress(matchAddress);
      if (normalizedMatchAddress && !addressMap.has(normalizedMatchAddress)) {
        addressMap.set(normalizedMatchAddress, customer);
      }
    }
  }

  const resolvedAddressCache = new Map<string, string>();
  const normalizedRows = await Promise.all(
    inputRows.map(async (row) => {
      const normalizedBusinessNumber = digitsOnly(row.businessNumber);
      const rawAddress = row.addr.trim();

      let normalizedAddress = "";
      if (rawAddress) {
        const cachedAddress = resolvedAddressCache.get(rawAddress);
        if (cachedAddress !== undefined) {
          normalizedAddress = cachedAddress;
        } else {
          const resolved = await resolveRoadAddress(rawAddress);
          normalizedAddress = toRoadAddress(resolved?.resolvedAddress ?? rawAddress);
          resolvedAddressCache.set(rawAddress, normalizedAddress);
        }
      }

      return {
        ...row,
        businessNumber: normalizedBusinessNumber,
        addr: normalizedAddress,
        normalizedBusinessNumber,
        normalizedAddress
      };
    })
  );

  const businessNumberCounts = new Map<string, number>();
  const addressCounts = new Map<string, number>();

  for (const row of normalizedRows) {
    if (row.normalizedBusinessNumber) {
      businessNumberCounts.set(row.normalizedBusinessNumber, (businessNumberCounts.get(row.normalizedBusinessNumber) ?? 0) + 1);
    }
    if (row.normalizedAddress) {
      addressCounts.set(row.normalizedAddress, (addressCounts.get(row.normalizedAddress) ?? 0) + 1);
    }
  }

  const rows = normalizedRows.map<CustomerImportPreviewRow>((row) => {
    const errors: string[] = [];

    if (!row.customerName) {
      errors.push("대표자명이 비어 있습니다.");
    }
    if (!row.corpName) {
      errors.push("세금계산서 상호가 비어 있습니다.");
    }
    if (!row.normalizedBusinessNumber) {
      errors.push("사업자번호가 비어 있습니다.");
    } else if (row.normalizedBusinessNumber.length !== 10) {
      errors.push("사업자번호는 숫자 10자리여야 합니다.");
    }
    if (!row.normalizedAddress) {
      errors.push("주소를 확인할 수 없습니다.");
    }

    if (row.normalizedBusinessNumber && businessNumberCounts.get(row.normalizedBusinessNumber)! > 1) {
      errors.push("업로드 파일 안에 같은 사업자번호가 중복되어 있습니다.");
    }
    if (row.normalizedAddress && addressCounts.get(row.normalizedAddress)! > 1) {
      errors.push("업로드 파일 안에 같은 주소가 중복되어 있습니다.");
    }

    const existingByBusinessNumber = row.normalizedBusinessNumber ? businessNumberMap.get(row.normalizedBusinessNumber) : null;
    if (existingByBusinessNumber) {
      errors.push(`이미 등록된 고객의 사업자번호입니다. (${existingByBusinessNumber.customerName})`);
    }

    const existingByAddress = row.normalizedAddress ? addressMap.get(row.normalizedAddress) : null;
    if (existingByAddress) {
      errors.push(`이미 등록된 고객의 주소입니다. (${existingByAddress.customerName})`);
    }

    return {
      ...row,
      normalizedBusinessNumber: row.normalizedBusinessNumber,
      normalizedAddress: row.normalizedAddress,
      errors,
      canImport: errors.length === 0
    };
  });

  const importableRows = rows.filter((row) => row.canImport).length;
  return {
    totalRows: rows.length,
    importableRows,
    blockedRows: rows.length - importableRows,
    rows
  };
}

export async function commitCustomerImport(requestStore: AppStore, preview: CustomerImportPreviewResult): Promise<CustomerImportCommitResult> {
  const failedRows: Array<{ rowIndex: number; message: string }> = preview.rows
    .filter((row) => !row.canImport)
    .map((row) => ({
      rowIndex: row.rowIndex,
      message: row.errors.join(" ")
    }));

  let successCount = 0;
  for (const row of preview.rows) {
    if (!row.canImport) {
      continue;
    }

    try {
      await requestStore.saveCustomer({
        customerName: row.customerName,
        businessNumber: row.businessNumber,
        corpName: row.corpName,
        ceoName: row.customerName,
        addr: row.addr,
        bizType: "전기업",
        bizClass: "태양광발전(자가용PPA)",
        issueMode: "review",
        issueDay: null,
        issueHour: null,
        issueMinute: null,
        renewalContactMobile: "",
        memo: "",
        plantNames: [],
        matchAddresses: [row.addr]
      });
      successCount += 1;
    } catch (error) {
      failedRows.push({
        rowIndex: row.rowIndex,
        message: error instanceof Error ? error.message : "고객 저장에 실패했습니다."
      });
    }
  }

  if (successCount > 0) {
    await requestStore.createLog("info", "customer-import", "초기 등록 엑셀 가져오기를 실행했습니다.", {
      totalRows: preview.totalRows,
      successCount,
      failedCount: failedRows.length
    });
  }

  return {
    totalRows: preview.totalRows,
    successCount,
    failedCount: failedRows.length,
    failedRows
  };
}
