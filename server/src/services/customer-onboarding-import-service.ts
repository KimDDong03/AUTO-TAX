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
  certificateIndex?: string;
  certificateName: string;
  certificateUsageName: string;
  issuerName: string;
  serial?: string;
  userDN?: string;
  expireDate?: string | null;
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

export type CustomerOnboardingPreparedCertificateSnapshot = {
  rowIndex: number;
  certificateKind: CustomerCertificateKind;
  certificateIndex?: string;
  certificateName: string;
  certificateUsageName: string;
  issuerName: string;
  serial?: string;
  userDN?: string;
  expireDate?: string | null;
  certificatePassword: string;
  isPrimary: boolean;
};

export type CustomerOnboardingPreparedEntrySnapshot = {
  rowIndex: number;
  existingCustomerId: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  renewalContactMobile: string;
  memo: string;
  plantNames: string[];
  matchAddresses: string[];
  certificates: CustomerOnboardingPreparedCertificateSnapshot[];
  errors: string[];
  warnings: string[];
  canImport: boolean;
};

export type CustomerOnboardingPreparedWorkbookSnapshot = {
  rows: CustomerOnboardingPreviewRow[];
  fileErrors: string[];
  entries: CustomerOnboardingPreparedEntrySnapshot[];
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
  entriesByKey: Map<string, PreparedCustomerEntry>;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCertificateExpireDate(value: string | null | undefined): string | null {
  const raw = normalizeText(value);
  if (!raw) {
    return null;
  }

  const compact = raw.replace(/\D/g, "");
  if (compact.length < 8) {
    return null;
  }

  const year = compact.slice(0, 4);
  const month = compact.slice(4, 6);
  const day = compact.slice(6, 8);
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
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

function isIssueCapableCustomerCertificateKind(kind: CustomerCertificateKind): boolean {
  return kind === "electronic_tax" || kind === "general_business";
}

function entryKeyForCustomerRow(row: { normalizedBusinessNumber: string; rowIndex: number }): string {
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

function findPreparedEntry(
  entriesByKey: Map<string, PreparedCustomerEntry>,
  normalizedBusinessNumber: string,
  rowIndex: number
): PreparedCustomerEntry | null {
  if (normalizedBusinessNumber) {
    return entriesByKey.get(normalizedBusinessNumber) ?? null;
  }

  return entriesByKey.get(`row:${rowIndex}`) ?? null;
}

function buildPreparedEntrySnapshot(entry: PreparedCustomerEntry): CustomerOnboardingPreparedEntrySnapshot {
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

  return {
    rowIndex: entry.row.rowIndex,
    existingCustomerId: entry.existingCustomer?.id ?? null,
    customerName: entry.row.customerName,
    businessNumber: entry.row.normalizedBusinessNumber,
    corpName: entry.row.corpName,
    addr: entry.row.normalizedAddress,
    bizType: entry.row.bizType,
    bizClass: entry.row.bizClass,
    renewalContactMobile: entry.row.renewalContactMobile,
    memo: entry.row.memo,
    plantNames: Array.from(plantNameSet),
    matchAddresses: Array.from(matchAddressSet),
    certificates: entry.certificates.map((certificate) => ({
      rowIndex: certificate.rowIndex,
      certificateKind: certificate.certificateKind,
      certificateIndex: certificate.certificateIndex,
      certificateName: certificate.certificateName,
      certificateUsageName: certificate.certificateUsageName,
      issuerName: certificate.issuerName,
      serial: certificate.serial,
      userDN: certificate.userDN,
      expireDate: normalizeCertificateExpireDate(certificate.expireDate),
      certificatePassword: certificate.certificatePassword,
      isPrimary: certificate.isPrimary
    })),
    errors: Array.from(entry.errors),
    warnings: Array.from(entry.warnings),
    canImport: entry.errors.size === 0
  };
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
    certificateIndex: normalizeText(row.certificateIndex),
    certificateName: normalizeText(row.certificateName),
    certificateUsageName: normalizeText(row.certificateUsageName),
    issuerName: normalizeText(row.issuerName),
    serial: normalizeText(row.serial),
    userDN: normalizeText(row.userDN),
    expireDate: normalizeCertificateExpireDate(row.expireDate),
    certificatePassword: normalizeText(row.certificatePassword),
    normalizedBusinessNumber: digitsOnly(row.businessNumber)
  }));

  const entriesByKey = new Map<string, PreparedCustomerEntry>();

  for (const row of normalizedCustomers) {
    const key = entryKeyForCustomerRow(row);
    const duplicate = entriesByKey.get(key) ?? null;
    const entry =
      duplicate ??
      {
        row,
        existingCustomer: row.normalizedBusinessNumber ? existingByBusinessNumber.get(row.normalizedBusinessNumber) ?? null : null,
        plants: [],
        certificates: [],
        errors: new Set<string>(),
        warnings: new Set<string>()
      };

    if (!duplicate) {
      entriesByKey.set(key, entry);
    }

    if (!row.customerName) {
      entry.errors.add("대표자명이 비어 있습니다.");
    }
    if (!row.corpName) {
      entry.errors.add("상호가 비어 있습니다.");
    }
    if (!row.normalizedBusinessNumber) {
      entry.errors.add("사업자번호가 비어 있습니다.");
    } else if (row.normalizedBusinessNumber.length !== 10) {
      entry.errors.add("사업자번호는 숫자 10자리여야 합니다.");
    }
    if (!row.normalizedAddress) {
      entry.warnings.add("사업장 주소가 없어 고객 등록 후 고객 관리에서 보완하세요.");
    }
    if (!row.bizType) {
      entry.errors.add("업태가 비어 있습니다.");
    }
    if (!row.bizClass) {
      entry.errors.add("업종이 비어 있습니다.");
    }
    if (duplicate) {
      entry.errors.add("업로드 파일 안에 같은 사업자번호가 중복되어 있습니다.");
    }
  }

  const fileErrors: string[] = [];
  const workbookAddressOwners = new Map<string, string>();
  const duplicateCertificateKeys = new Set<string>();

  for (const plant of normalizedPlants) {
    const entry = findPreparedEntry(entriesByKey, plant.normalizedBusinessNumber, plant.rowIndex);
    if (!entry) {
      fileErrors.push(`발전소 시트 ${plant.rowIndex}행: 등록 대상 고객을 찾지 못했습니다.`);
      continue;
    }

    if (!plant.plantName) {
      entry.errors.add(`발전소 시트 ${plant.rowIndex}행: 발전소명이 비어 있습니다.`);
    }
    if (!plant.normalizedMatchAddress) {
      entry.warnings.add(`발전소 시트 ${plant.rowIndex}행: 매칭 주소가 없어 메일 자동 매칭에는 사용하지 않습니다. 고객 등록 후 보완하세요.`);
      continue;
    }

    const existingOwner = existingAddressOwners.get(plant.normalizedMatchAddress);
    if (existingOwner && digitsOnly(existingOwner.businessNumber) !== entry.row.normalizedBusinessNumber) {
      entry.errors.add(`이미 다른 고객에 등록된 매칭 주소입니다. (${existingOwner.customerName})`);
    }

    const workbookOwner = workbookAddressOwners.get(plant.normalizedMatchAddress);
    if (workbookOwner && workbookOwner !== entry.row.normalizedBusinessNumber) {
      entry.errors.add("업로드 파일 안에 다른 고객과 같은 매칭 주소가 중복되어 있습니다.");
      const duplicateOwnerEntry = entriesByKey.get(workbookOwner);
      duplicateOwnerEntry?.errors.add("업로드 파일 안에 다른 고객과 같은 매칭 주소가 중복되어 있습니다.");
    } else if (!workbookOwner) {
      workbookAddressOwners.set(plant.normalizedMatchAddress, entry.row.normalizedBusinessNumber);
    }

    entry.plants.push(plant);
  }

  for (const certificate of normalizedCertificates) {
    const entry = findPreparedEntry(entriesByKey, certificate.normalizedBusinessNumber, certificate.rowIndex);
    if (!entry) {
      fileErrors.push(`공동인증서 시트 ${certificate.rowIndex}행: 등록 대상 고객을 찾지 못했습니다.`);
      continue;
    }

    if (!certificate.certificateName) {
      entry.errors.add(`공동인증서 시트 ${certificate.rowIndex}행: 인증서명이 비어 있습니다.`);
      continue;
    }
    if (certificate.certificateKind === "unknown") {
      entry.warnings.add(`공동인증서 시트 ${certificate.rowIndex}행: 인증서 종류를 확인할 수 없어 이번 초기 등록에서 무시합니다.`);
      continue;
    }
    if (!isIssueCapableCustomerCertificateKind(certificate.certificateKind)) {
      entry.warnings.add(`공동인증서 시트 ${certificate.rowIndex}행: 발행 가능 인증서가 아니어서 이번 초기 등록에서 무시합니다.`);
      continue;
    }

    const certificateKey = `${entry.row.normalizedBusinessNumber}:${certificate.certificateKind}:${certificate.certificateName.toLowerCase()}`;
    if (duplicateCertificateKeys.has(certificateKey)) {
      entry.errors.add(`공동인증서 시트 ${certificate.rowIndex}행: 같은 고객의 인증서가 중복되어 있습니다.`);
      continue;
    }

    duplicateCertificateKeys.add(certificateKey);
    entry.certificates.push(certificate);
  }

  for (const entry of entriesByKey.values()) {
    if (entry.plants.length === 0) {
      if (entry.row.normalizedAddress) {
        entry.warnings.add("발전소 정보가 없어 고객 기본 주소를 매칭 주소로 사용합니다.");
      } else {
        entry.warnings.add("매칭 주소가 없어 한전 메일 자동 매칭에는 고객 등록 후 주소 보완이 필요합니다.");
      }
    }

    if (entry.certificates.length === 0) {
      entry.errors.add("발행 가능 공동인증서를 확인하지 못했습니다.");
    } else {
      const primaryIndex = entry.certificates.findIndex((certificate) => certificate.isPrimary);
      const effectivePrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;
      entry.certificates.forEach((certificate, index) => {
        certificate.isPrimary = index === effectivePrimaryIndex;
      });
    }

    const effectiveMatchAddresses =
      entry.plants.length > 0 ? entry.plants.map((plant) => plant.normalizedMatchAddress) : [entry.row.normalizedAddress];

    for (const matchAddress of effectiveMatchAddresses) {
      const existingOwner = existingAddressOwners.get(matchAddress);
      if (existingOwner && digitsOnly(existingOwner.businessNumber) !== entry.row.normalizedBusinessNumber) {
        entry.errors.add(`이미 다른 고객에 등록된 매칭 주소입니다. (${existingOwner.customerName})`);
      }
    }
  }

  const rows = normalizedCustomers.map<CustomerOnboardingPreviewRow>((row) => {
    const entry = entriesByKey.get(entryKeyForCustomerRow(row)) ?? null;
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
    entriesByKey
  };
}

function buildPreviewResultFromPreparedSnapshot(
  prepared: CustomerOnboardingPreparedWorkbookSnapshot
): CustomerOnboardingPreviewResult {
  const createCount = prepared.rows.filter((row) => row.status === "create").length;
  const updateCount = prepared.rows.filter((row) => row.status === "update").length;
  const blockedCount = prepared.rows.filter((row) => row.status === "blocked").length;
  const totalPlants = prepared.entries.reduce((total, entry) => total + entry.plantNames.length, 0);
  const totalCertificates = prepared.entries.reduce((total, entry) => total + entry.certificates.length, 0);

  return {
    totalCustomers: prepared.rows.length,
    createCount,
    updateCount,
    blockedCount,
    totalPlants,
    totalCertificates,
    fileErrors: prepared.fileErrors,
    rows: prepared.rows
  };
}

export async function prepareCustomerOnboardingWorkbookSnapshot(
  requestStore: AppStore,
  workbook: CustomerOnboardingWorkbookInput,
  options?: {
    resolveAddress?: AddressResolver;
  }
): Promise<CustomerOnboardingPreparedWorkbookSnapshot> {
  const prepared = await prepareCustomerOnboardingWorkbook(
    requestStore,
    workbook,
    options?.resolveAddress ?? resolveRoadAddress
  );

  return {
    rows: prepared.rows,
    fileErrors: prepared.fileErrors,
    entries: Array.from(prepared.entriesByKey.values())
      .sort((left, right) => left.row.rowIndex - right.row.rowIndex)
      .map((entry) => buildPreparedEntrySnapshot(entry))
  };
}

export async function buildCustomerOnboardingPreview(
  requestStore: AppStore,
  workbook: CustomerOnboardingWorkbookInput,
  options?: {
    resolveAddress?: AddressResolver;
  }
): Promise<CustomerOnboardingPreviewResult> {
  const prepared = await prepareCustomerOnboardingWorkbookSnapshot(requestStore, workbook, options);
  return buildPreviewResultFromPreparedSnapshot(prepared);
}

export async function commitCustomerOnboardingPreparedEntry(
  requestStore: AppStore,
  entry: CustomerOnboardingPreparedEntrySnapshot,
  options?: {
    autoJoinCustomer?: (customer: Customer) => Promise<{ status: string; error?: string | null }>;
  }
): Promise<{
  customer: Customer;
  outcome: "create" | "update";
  linkedCertificateCount: number;
  warnings: Array<{ rowIndex: number; message: string }>;
}> {
  const startedAt = Date.now();
  let saveCustomerMs = 0;
  let linkCertificatesMs = 0;
  let autoJoinQueueMs = 0;
  const customerId = entry.existingCustomerId ?? null;

  const saveCustomerStartedAt = Date.now();
  const customer = await requestStore.saveCustomer(
    {
      customerName: entry.customerName,
      businessNumber: entry.businessNumber,
      corpName: entry.corpName,
      ceoName: entry.customerName,
      addr: entry.addr,
      bizType: entry.bizType,
      bizClass: entry.bizClass,
      issueMode: "review",
      issueDay: null,
      issueHour: null,
      issueMinute: null,
      renewalContactMobile: entry.renewalContactMobile,
      memo: entry.memo,
      plantNames: entry.plantNames,
      matchAddresses: entry.matchAddresses
    },
    customerId ?? undefined
  );
  saveCustomerMs = Date.now() - saveCustomerStartedAt;

  const issueCapableCertificates = entry.certificates.filter(
    (certificate) => isIssueCapableCustomerCertificateKind(certificate.certificateKind)
  );
  let linkedCertificateCount = 0;
  const linkCertificatesStartedAt = Date.now();
  for (const [index, certificate] of issueCapableCertificates.entries()) {
    await requestStore.upsertCustomerCertificate({
      customerId: customer.id,
      certificateKind: certificate.certificateKind,
      certificateName: certificate.certificateName,
      certificateUsageName: certificate.certificateUsageName || kindUsageFallback(certificate.certificateKind),
      issuerName: certificate.issuerName,
      serial: certificate.serial || null,
      userDN: certificate.userDN || null,
      oid: null,
      expireDate: normalizeCertificateExpireDate(certificate.expireDate),
      certDirPath: null,
      isPrimary: index === 0,
      linkSource: "manual"
    });
    linkedCertificateCount += 1;
  }
  linkCertificatesMs = Date.now() - linkCertificatesStartedAt;

  const warnings: Array<{ rowIndex: number; message: string }> = [];
  if (options?.autoJoinCustomer) {
    const autoJoinQueueStartedAt = Date.now();
    const autoJoinResult = await options.autoJoinCustomer(customer);
    autoJoinQueueMs = Date.now() - autoJoinQueueStartedAt;
    if (autoJoinResult.status === "failed") {
      warnings.push({
        rowIndex: entry.rowIndex,
        message: `발행 연동 실패: ${autoJoinResult.error ?? "원인을 확인해 주세요."}`
      });
    }
  }

  console.info(
    `[customer-onboarding-timing] row=${entry.rowIndex} customerId=${customer.id} outcome=${customerId ? "update" : "create"} totalMs=${Date.now() - startedAt} saveCustomerMs=${saveCustomerMs} linkCertificatesMs=${linkCertificatesMs} autoJoinQueueMs=${autoJoinQueueMs} certificateCount=${issueCapableCertificates.length}`
  );

  return {
    customer,
    outcome: customerId ? "update" : "create",
    linkedCertificateCount,
    warnings
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
  const prepared = await prepareCustomerOnboardingWorkbookSnapshot(requestStore, workbook, options);

  const failedRows = prepared.entries
    .filter((entry) => !entry.canImport)
    .map((entry) => ({
      rowIndex: entry.rowIndex,
      message: entry.errors.join(" ")
    }));

  let createdCount = 0;
  let updatedCount = 0;
  let linkedCertificateCount = 0;
  const warnings: Array<{ rowIndex: number; message: string }> = [];

  for (const entry of prepared.entries) {
    if (!entry.canImport) {
      continue;
    }

    try {
      const result = await commitCustomerOnboardingPreparedEntry(requestStore, entry, {
        autoJoinCustomer: options?.autoJoinCustomer
      });

      if (result.outcome === "update") {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }

      linkedCertificateCount += result.linkedCertificateCount;
      warnings.push(...result.warnings);
    } catch (error) {
      failedRows.push({
        rowIndex: entry.rowIndex,
        message: error instanceof Error ? error.message : "고객 저장에 실패했습니다."
      });
    }
  }

  const successCount = createdCount + updatedCount;
  if (successCount > 0) {
    await requestStore.createLog("info", "customer-onboarding-import", "고객 초기 등록 가져오기를 실행했습니다.", {
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
