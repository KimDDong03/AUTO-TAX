import { resolveRoadAddress } from "../address-resolver.js";
import type { Customer, CustomerCertificateKind } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import { digitsOnly, normalizeAddress, toRoadAddress } from "../utils.js";

type AddressResolver = (query: string) => Promise<{ resolvedAddress: string } | null>;

export type CustomerOnboardingCustomerRow = {
  rowIndex: number;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  renewalContactMobile: string;
  memo: string;
};

export type CustomerOnboardingPlantRow = {
  rowIndex: number;
  businessNumber: string;
  plantName: string;
  matchAddress: string;
};

export type CustomerOnboardingCertificateRow = {
  rowIndex: number;
  businessNumber: string;
  certificateKind: CustomerCertificateKind;
  certificateName: string;
  certificateUsageName: string;
  issuerName: string;
  certificatePassword: string;
  isPrimary: boolean;
};

export type CustomerOnboardingWorkbookInput = {
  customers: CustomerOnboardingCustomerRow[];
  plants: CustomerOnboardingPlantRow[];
  certificates: CustomerOnboardingCertificateRow[];
};

export type CustomerOnboardingPreviewRow = {
  rowIndex: number;
  customerName: string;
  businessNumber: string;
  corpName: string;
  plantCount: number;
  certificateCount: number;
  status: "create" | "update" | "blocked";
  errors: string[];
  warnings: string[];
  canImport: boolean;
};

export type CustomerOnboardingPreviewResult = {
  totalCustomers: number;
  createCount: number;
  updateCount: number;
  blockedCount: number;
  totalPlants: number;
  totalCertificates: number;
  fileErrors: string[];
  rows: CustomerOnboardingPreviewRow[];
};

export type CustomerOnboardingCommitResult = {
  totalCustomers: number;
  createdCount: number;
  updatedCount: number;
  successCount: number;
  failedCount: number;
  linkedCertificateCount: number;
  warnings: Array<{ rowIndex: number; message: string }>;
  failedRows: Array<{ rowIndex: number; message: string }>;
};

type NormalizedCustomerRow = CustomerOnboardingCustomerRow & {
  normalizedBusinessNumber: string;
  normalizedAddress: string;
};

type NormalizedPlantRow = CustomerOnboardingPlantRow & {
  normalizedBusinessNumber: string;
  normalizedMatchAddress: string;
};

type NormalizedCertificateRow = CustomerOnboardingCertificateRow & {
  normalizedBusinessNumber: string;
};

type PreparedCustomerEntry = {
  row: NormalizedCustomerRow;
  existingCustomer: Customer | null;
  plants: NormalizedPlantRow[];
  certificates: NormalizedCertificateRow[];
  errors: Set<string>;
  warnings: Set<string>;
};

type PreparedWorkbook = {
  rows: CustomerOnboardingPreviewRow[];
  fileErrors: string[];
  entriesByBusinessNumber: Map<string, PreparedCustomerEntry>;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function kindUsageFallback(kind: CustomerCertificateKind): string {
  switch (kind) {
    case "electronic_tax":
      return "전자세금용";
    case "general_personal":
      return "개인범용";
    case "general_business":
      return "사업자범용";
    default:
      return "";
  }
}

function entryKeyForCustomerRow(row: { normalizedBusinessNumber: string; rowIndex: number }) {
  return row.normalizedBusinessNumber || `row:${row.rowIndex}`;
}

function buildExistingCustomerAddressMap(customers: Customer[]): Map<string, Customer> {
  const map = new Map<string, Customer>();

  for (const customer of customers) {
    const addresses = customer.matchAddresses.length > 0 ? customer.matchAddresses : [customer.addr];
    for (const address of addresses) {
      const normalized = normalizeAddress(address);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, customer);
      }
    }
  }

  return map;
}

async function normalizeResolvedAddress(
  rawValue: string,
  cache: Map<string, string>,
  resolveAddress: AddressResolver
): Promise<string> {
  const value = rawValue.trim();
  if (!value) {
    return "";
  }

  const cached = cache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const resolved = await resolveAddress(value).catch(() => null);
  const normalized = toRoadAddress(resolved?.resolvedAddress ?? value);
  cache.set(value, normalized);
  return normalized;
}

async function prepareCustomerOnboardingWorkbook(
  requestStore: AppStore,
  workbook: CustomerOnboardingWorkbookInput,
  resolveAddress: AddressResolver
): Promise<PreparedWorkbook> {
  const customers = await requestStore.listCustomers();
  const existingByBusinessNumber = new Map<string, Customer>();
  for (const customer of customers) {
    const normalizedBusinessNumber = digitsOnly(customer.businessNumber);
    if (normalizedBusinessNumber) {
      existingByBusinessNumber.set(normalizedBusinessNumber, customer);
    }
  }
  const existingAddressOwners = buildExistingCustomerAddressMap(customers);

  const addressCache = new Map<string, string>();
  const normalizedCustomers = await Promise.all(
    workbook.customers.map(async (row) => ({
      ...row,
      customerName: normalizeText(row.customerName),
      businessNumber: normalizeText(row.businessNumber),
      corpName: normalizeText(row.corpName),
      addr: normalizeText(row.addr),
      bizType: normalizeText(row.bizType),
      bizClass: normalizeText(row.bizClass),
      renewalContactMobile: normalizeText(row.renewalContactMobile),
      memo: normalizeText(row.memo),
      normalizedBusinessNumber: digitsOnly(row.businessNumber),
      normalizedAddress: await normalizeResolvedAddress(row.addr, addressCache, resolveAddress)
    }))
  );
  const normalizedPlants = await Promise.all(
    workbook.plants.map(async (row) => ({
      ...row,
      plantName: normalizeText(row.plantName),
      businessNumber: normalizeText(row.businessNumber),
      matchAddress: normalizeText(row.matchAddress),
      normalizedBusinessNumber: digitsOnly(row.businessNumber),
      normalizedMatchAddress: await normalizeResolvedAddress(row.matchAddress, addressCache, resolveAddress)
    }))
  );
  const normalizedCertificates = workbook.certificates.map((row) => ({
    ...row,
    businessNumber: normalizeText(row.businessNumber),
    certificateName: normalizeText(row.certificateName),
    certificateUsageName: normalizeText(row.certificateUsageName),
    issuerName: normalizeText(row.issuerName),
    certificatePassword: normalizeText(row.certificatePassword),
    normalizedBusinessNumber: digitsOnly(row.businessNumber)
  }));

  const entriesByBusinessNumber = new Map<string, PreparedCustomerEntry>();
  for (const row of normalizedCustomers) {
    const entryKey = entryKeyForCustomerRow(row);
    const existingEntry = entriesByBusinessNumber.get(entryKey) ?? null;
    const entry =
      existingEntry ??
      {
        row,
        existingCustomer: row.normalizedBusinessNumber ? existingByBusinessNumber.get(row.normalizedBusinessNumber) ?? null : null,
        plants: [],
        certificates: [],
        errors: new Set<string>(),
        warnings: new Set<string>()
      };

    if (!existingEntry) {
      entriesByBusinessNumber.set(entryKey, entry);
    }

    if (!row.customerName) {
      entry.errors.add("대표자명이 비어 있습니다.");
    }
    if (!row.corpName) {
      entry.errors.add("세금계산서 상호가 비어 있습니다.");
    }
    if (!row.normalizedBusinessNumber) {
      entry.errors.add("사업자번호가 비어 있습니다.");
    } else if (row.normalizedBusinessNumber.length !== 10) {
      entry.errors.add("사업자번호는 숫자 10자리여야 합니다.");
    }
    if (!row.normalizedAddress) {
      entry.errors.add("사업자 주소를 확인할 수 없습니다.");
    }
    if (!row.bizType) {
      entry.errors.add("업태가 비어 있습니다.");
    }
    if (!row.bizClass) {
      entry.errors.add("업종이 비어 있습니다.");
    }
    if (existingEntry) {
      entry.errors.add("등록 대상 안에 같은 사업자번호가 중복되어 있습니다.");
    }
  }

  const fileErrors: string[] = [];
  const workbookAddressOwners = new Map<string, string>();
  const duplicateCertificateKeys = new Set<string>();

  for (const plant of normalizedPlants) {
    const entry =
      normalizedCustomers
        .map((row) => entriesByBusinessNumber.get(entryKeyForCustomerRow(row)))
        .find((candidate) => candidate?.row.normalizedBusinessNumber === plant.normalizedBusinessNumber) ?? null;
    if (!entry) {
      fileErrors.push(`발전소 시트 ${plant.rowIndex}행: 등록 대상 고객 목록에 없는 사업자번호입니다.`);
      continue;
    }
    if (!plant.plantName) {
      entry.errors.add(`발전소 시트 ${plant.rowIndex}행: 발전소명이 비어 있습니다.`);
    }
    if (!plant.normalizedMatchAddress) {
      entry.errors.add(`발전소 시트 ${plant.rowIndex}행: 자동 매칭에 사용할 기본 주소를 확인할 수 없습니다.`);
      continue;
    }

    const existingOwner = existingAddressOwners.get(plant.normalizedMatchAddress);
    if (existingOwner && digitsOnly(existingOwner.businessNumber) !== entry.row.normalizedBusinessNumber) {
      entry.errors.add(`이미 다른 고객에 등록된 기본 매칭 주소입니다. (${existingOwner.customerName})`);
    }

    const workbookOwner = workbookAddressOwners.get(plant.normalizedMatchAddress);
    if (workbookOwner && workbookOwner !== entry.row.normalizedBusinessNumber) {
      entry.errors.add("업로드 파일 안에 다른 고객과 같은 기본 매칭 주소가 중복되어 있습니다.");
      const duplicateOwner = entriesByBusinessNumber.get(workbookOwner);
      duplicateOwner?.errors.add("업로드 파일 안에 다른 고객과 같은 기본 매칭 주소가 중복되어 있습니다.");
    } else if (!workbookOwner) {
      workbookAddressOwners.set(plant.normalizedMatchAddress, entry.row.normalizedBusinessNumber);
    }

    entry.plants.push(plant);
  }

  for (const certificate of normalizedCertificates) {
    const entry =
      normalizedCustomers
        .map((row) => entriesByBusinessNumber.get(entryKeyForCustomerRow(row)))
        .find((candidate) => candidate?.row.normalizedBusinessNumber === certificate.normalizedBusinessNumber) ?? null;
    if (!entry) {
      fileErrors.push(`공동인증서 시트 ${certificate.rowIndex}행: 등록 대상 고객 목록에 없는 사업자번호입니다.`);
      continue;
    }
    if (!certificate.certificateName) {
      entry.errors.add(`공동인증서 시트 ${certificate.rowIndex}행: 인증서명이 비어 있습니다.`);
      continue;
    }
    if (certificate.certificateKind === "unknown") {
      entry.errors.add(`공동인증서 시트 ${certificate.rowIndex}행: 인증서 종류를 확인할 수 없습니다.`);
      continue;
    }

    const certificateKey = `${entry.row.normalizedBusinessNumber}:${certificate.certificateKind}:${certificate.certificateName.toLowerCase()}`;
    if (duplicateCertificateKeys.has(certificateKey)) {
      entry.errors.add(`공동인증서 시트 ${certificate.rowIndex}행: 같은 고객에 같은 인증서가 중복되어 있습니다.`);
      continue;
    }
    duplicateCertificateKeys.add(certificateKey);
    entry.certificates.push(certificate);
  }

  for (const entry of entriesByBusinessNumber.values()) {
    if (entry.plants.length === 0) {
      entry.warnings.add("발전소 정보가 없어 고객 기본 주소를 자동 매칭 기본 주소로 사용합니다.");
    }

    const effectiveMatchAddresses = entry.plants.length > 0 ? entry.plants.map((row) => row.normalizedMatchAddress) : [entry.row.normalizedAddress];
    for (const matchAddress of effectiveMatchAddresses) {
      const existingOwner = existingAddressOwners.get(matchAddress);
      if (existingOwner && digitsOnly(existingOwner.businessNumber) !== entry.row.normalizedBusinessNumber) {
        entry.errors.add(`이미 다른 고객에 등록된 기본 매칭 주소입니다. (${existingOwner.customerName})`);
      }
    }
  }

  const rows = normalizedCustomers.map<CustomerOnboardingPreviewRow>((row) => {
    const entry = entriesByBusinessNumber.get(entryKeyForCustomerRow(row)) ?? null;
    const errors = Array.from(entry?.errors ?? []);
    const warnings = Array.from(entry?.warnings ?? []);
    const canImport = errors.length === 0;

    return {
      rowIndex: row.rowIndex,
      customerName: row.customerName,
      businessNumber: row.normalizedBusinessNumber,
      corpName: row.corpName,
      plantCount: entry?.plants.length ?? 0,
      certificateCount: entry?.certificates.length ?? 0,
      status: canImport ? (entry?.existingCustomer ? "update" : "create") : "blocked",
      errors,
      warnings,
      canImport
    };
  });

  return {
    rows,
    fileErrors,
    entriesByBusinessNumber
  };
}

export async function buildCustomerOnboardingPreview(
  requestStore: AppStore,
  workbook: CustomerOnboardingWorkbookInput,
  options?: {
    resolveAddress?: AddressResolver;
  }
): Promise<CustomerOnboardingPreviewResult> {
  const prepared = await prepareCustomerOnboardingWorkbook(
    requestStore,
    workbook,
    options?.resolveAddress ?? resolveRoadAddress
  );

  const createCount = prepared.rows.filter((row) => row.status === "create").length;
  const updateCount = prepared.rows.filter((row) => row.status === "update").length;
  const blockedCount = prepared.rows.filter((row) => row.status === "blocked").length;

  return {
    totalCustomers: prepared.rows.length,
    createCount,
    updateCount,
    blockedCount,
    totalPlants: workbook.plants.length,
    totalCertificates: workbook.certificates.length,
    fileErrors: prepared.fileErrors,
    rows: prepared.rows
  };
}

export async function commitCustomerOnboardingImport(
  requestStore: AppStore,
  workbook: CustomerOnboardingWorkbookInput,
  options?: {
    resolveAddress?: AddressResolver;
    autoJoinCustomer?: (customer: Customer) => Promise<{ status: string; error?: string | null }>;
  }
): Promise<CustomerOnboardingCommitResult> {
  const prepared = await prepareCustomerOnboardingWorkbook(
    requestStore,
    workbook,
    options?.resolveAddress ?? resolveRoadAddress
  );

  const failedRows = prepared.rows
    .filter((row) => !row.canImport)
    .map((row) => ({
      rowIndex: row.rowIndex,
      message: row.errors.join(" ")
    }));

  let createdCount = 0;
  let updatedCount = 0;
  let linkedCertificateCount = 0;
  const warnings: Array<{ rowIndex: number; message: string }> = [];

  for (const row of prepared.rows) {
    if (!row.canImport) {
      continue;
    }

    const entry =
      Array.from(prepared.entriesByBusinessNumber.values()).find((candidate) => candidate.row.rowIndex === row.rowIndex) ?? null;
    if (!entry) {
      failedRows.push({
        rowIndex: row.rowIndex,
        message: "가져오기 대상 고객을 다시 찾지 못했습니다."
      });
      continue;
    }

    const plantNameSet = new Set<string>();
    const matchAddressSet = new Set<string>();

    for (const plant of entry.plants) {
      if (plant.plantName) {
        plantNameSet.add(plant.plantName);
      }
      if (plant.normalizedMatchAddress) {
        matchAddressSet.add(plant.normalizedMatchAddress);
      }
    }

    if (matchAddressSet.size === 0 && entry.row.normalizedAddress) {
      matchAddressSet.add(entry.row.normalizedAddress);
    }

    try {
      const customer = await requestStore.saveCustomer(
        {
          customerName: entry.row.customerName,
          businessNumber: entry.row.normalizedBusinessNumber,
          corpName: entry.row.corpName,
          ceoName: entry.row.customerName,
          addr: entry.row.normalizedAddress,
          bizType: entry.row.bizType,
          bizClass: entry.row.bizClass,
          issueMode: "review",
          issueDay: null,
          issueHour: null,
          issueMinute: null,
          renewalContactMobile: entry.row.renewalContactMobile,
          memo: entry.row.memo,
          plantNames: Array.from(plantNameSet),
          matchAddresses: Array.from(matchAddressSet)
        },
        entry.existingCustomer?.id
      );

      if (entry.existingCustomer) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }

      for (const certificate of entry.certificates) {
        await requestStore.upsertCustomerCertificate({
          customerId: customer.id,
          certificateKind: certificate.certificateKind,
          certificateName: certificate.certificateName,
          certificateUsageName: certificate.certificateUsageName || kindUsageFallback(certificate.certificateKind),
          issuerName: certificate.issuerName,
          serial: null,
          userDN: null,
          oid: null,
          expireDate: null,
          certDirPath: null,
          certificatePassword: certificate.certificatePassword,
          isPrimary: certificate.isPrimary,
          linkSource: "manual"
        });
        linkedCertificateCount += 1;
      }

      if (options?.autoJoinCustomer) {
        const autoJoinResult = await options.autoJoinCustomer(customer);
        if (autoJoinResult.status === "failed") {
          warnings.push({
            rowIndex: row.rowIndex,
            message: `팝빌 자동 가입 실패: ${autoJoinResult.error ?? "원인을 확인하세요."}`
          });
        }
      }
    } catch (error) {
      failedRows.push({
        rowIndex: row.rowIndex,
        message: error instanceof Error ? error.message : "고객 저장에 실패했습니다."
      });
    }
  }

  const successCount = createdCount + updatedCount;
  if (successCount > 0) {
    await requestStore.createLog("info", "customer-onboarding-import", "엑셀 초기 등록 가져오기를 실행했습니다.", {
      totalCustomers: prepared.rows.length,
      createdCount,
      updatedCount,
      linkedCertificateCount,
      failedCount: failedRows.length,
      warningCount: warnings.length
    });
  }

  return {
    totalCustomers: prepared.rows.length,
    createdCount,
    updatedCount,
    successCount,
    failedCount: failedRows.length,
    linkedCertificateCount,
    warnings,
    failedRows
  };
}
