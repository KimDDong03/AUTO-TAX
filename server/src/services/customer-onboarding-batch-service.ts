import { getErrorMessage } from "../http-errors.js";
import { createSupabaseAdminClient } from "../supabase.js";
import { SupabaseStore } from "../supabase-store.js";
import { nowIso } from "../utils.js";
import type { AppStore } from "../store-contract.js";
import {
  commitCustomerOnboardingPreparedEntry,
  prepareCustomerOnboardingWorkbookSnapshot,
  type CustomerOnboardingCommitResult,
  type CustomerOnboardingPreparedEntrySnapshot,
  type CustomerOnboardingPreviewResult,
  type CustomerOnboardingWorkbookInput
} from "./customer-onboarding-import-service.js";
import { autoJoinCustomerPopbill } from "./popbill-customer-service.js";
import { getServerManagedSettings } from "../server-managed-settings.js";

type Row = Record<string, unknown>;

type BatchStatus = "queued" | "running" | "completed" | "failed";
type BatchRowStatus = "pending" | "processing" | "completed" | "failed" | "blocked";

type FailedRowMessage = { rowIndex: number; message: string };
type WarningMessage = { rowIndex: number; message: string };

export type CustomerOnboardingPreviewSessionResult = CustomerOnboardingPreviewResult & {
  previewId: string;
  createdAt: string;
  expiresAt: string;
};

export type CustomerOnboardingCommitBatchStartResult = {
  batchId: string;
  previewId: string;
  status: BatchStatus;
  totalRows: number;
  completedRows: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
};

export type CustomerOnboardingCommitBatchStatusResult = CustomerOnboardingCommitResult & {
  batchId: string;
  previewId: string;
  status: BatchStatus;
  completedRows: number;
  totalRows: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

async function assertNoError<T>(
  label: string,
  promise: PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

function buildPreviewResultFromPreparedSnapshot(
  prepared: Awaited<ReturnType<typeof prepareCustomerOnboardingWorkbookSnapshot>>
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

function mapBatchStatus(row: Row): CustomerOnboardingCommitBatchStatusResult {
  const warnings = asArray<WarningMessage>(row.warnings_json, []);
  const failedRows = asArray<FailedRowMessage>(row.failed_rows_json, []);
  const createdCount = asNumber(row.created_count);
  const updatedCount = asNumber(row.updated_count);

  return {
    batchId: asString(row.id),
    previewId: asString(row.preview_id),
    status: asString(row.status, "queued") as BatchStatus,
    totalCustomers: asNumber(row.total_rows),
    totalRows: asNumber(row.total_rows),
    completedRows: asNumber(row.completed_rows),
    createdCount,
    updatedCount,
    successCount: createdCount + updatedCount,
    failedCount: asNumber(row.failed_count),
    linkedCertificateCount: asNumber(row.linked_certificate_count),
    warnings,
    failedRows,
    error: asNullableString(row.error),
    startedAt: asNullableString(row.started_at),
    finishedAt: asNullableString(row.finished_at),
    createdAt: asString(row.created_at, nowIso()),
    updatedAt: asString(row.updated_at, nowIso())
  };
}

async function getPreviewRow(organizationId: string, previewId: string): Promise<Row> {
  const client = createSupabaseAdminClient();
  const row = await assertNoError(
    "고객 등록 미리보기 조회 실패",
    client
      .from("customer_onboarding_previews")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", previewId)
      .maybeSingle()
  );

  if (!row) {
    throw new Error("미리보기 정보를 찾지 못했습니다. 파일을 다시 업로드해 주세요.");
  }

  const expiresAt = asNullableString((row as Row).expires_at);
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    throw new Error("미리보기 정보가 만료되었습니다. 파일을 다시 업로드해 주세요.");
  }

  return row as Row;
}

async function updateBatchSnapshot(
  batchId: string,
  snapshot: Pick<
    CustomerOnboardingCommitBatchStatusResult,
    | "status"
    | "completedRows"
    | "createdCount"
    | "updatedCount"
    | "failedCount"
    | "linkedCertificateCount"
    | "warnings"
    | "failedRows"
    | "error"
    | "startedAt"
    | "finishedAt"
  >
): Promise<void> {
  const client = createSupabaseAdminClient();
  await assertNoError(
    "고객 등록 배치 상태 갱신 실패",
    client
      .from("customer_onboarding_batches")
      .update({
        status: snapshot.status,
        completed_rows: snapshot.completedRows,
        created_count: snapshot.createdCount,
        updated_count: snapshot.updatedCount,
        failed_count: snapshot.failedCount,
        linked_certificate_count: snapshot.linkedCertificateCount,
        warnings_json: snapshot.warnings,
        failed_rows_json: snapshot.failedRows,
        error: snapshot.error,
        started_at: snapshot.startedAt,
        finished_at: snapshot.finishedAt,
        updated_at: nowIso()
      })
      .eq("id", batchId)
  );
}

export async function createCustomerOnboardingPreviewSession(
  requestStore: AppStore,
  workbook: CustomerOnboardingWorkbookInput,
  options: {
    organizationId: string;
    requestedByUserId: string | null;
  }
): Promise<CustomerOnboardingPreviewSessionResult> {
  const prepared = await prepareCustomerOnboardingWorkbookSnapshot(requestStore, workbook);
  const preview = buildPreviewResultFromPreparedSnapshot(prepared);
  const client = createSupabaseAdminClient();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const row = await assertNoError(
    "고객 등록 미리보기 저장 실패",
    client
      .from("customer_onboarding_previews")
      .insert({
        organization_id: options.organizationId,
        requested_by: options.requestedByUserId,
        workbook_json: workbook,
        preview_json: preview,
        entries_json: prepared.entries,
        created_at: createdAt,
        updated_at: createdAt,
        expires_at: expiresAt
      })
      .select("id")
      .single()
  );

  return {
    ...preview,
    previewId: asString((row as Row).id),
    createdAt,
    expiresAt
  };
}

export async function startCustomerOnboardingCommitBatch(options: {
  organizationId: string;
  requestedByUserId: string | null;
  previewId: string;
}): Promise<CustomerOnboardingCommitBatchStartResult> {
  const previewRow = await getPreviewRow(options.organizationId, options.previewId);
  const entries = asArray<CustomerOnboardingPreparedEntrySnapshot>(previewRow.entries_json, []);
  const createdAt = nowIso();
  const pendingEntries = entries.filter((entry) => entry.canImport);
  const failedRows = entries
    .filter((entry) => !entry.canImport)
    .map<FailedRowMessage>((entry) => ({
      rowIndex: entry.rowIndex,
      message: entry.errors.join(" ")
    }));

  const client = createSupabaseAdminClient();
  const batchRow = await assertNoError(
    "고객 등록 배치 생성 실패",
    client
      .from("customer_onboarding_batches")
      .insert({
        organization_id: options.organizationId,
        preview_id: options.previewId,
        requested_by: options.requestedByUserId,
        status: pendingEntries.length > 0 ? "queued" : "completed",
        total_rows: entries.length,
        completed_rows: failedRows.length,
        created_count: 0,
        updated_count: 0,
        failed_count: failedRows.length,
        linked_certificate_count: 0,
        warnings_json: [],
        failed_rows_json: failedRows,
        error: null,
        started_at: pendingEntries.length > 0 ? null : createdAt,
        finished_at: pendingEntries.length > 0 ? null : createdAt,
        created_at: createdAt,
        updated_at: createdAt
      })
      .select("*")
      .single()
  );

  const batchId = asString((batchRow as Row).id);
  if (entries.length > 0) {
    await assertNoError(
      "고객 등록 배치 행 생성 실패",
      client.from("customer_onboarding_batch_rows").insert(
        entries.map((entry) => ({
          batch_id: batchId,
          organization_id: options.organizationId,
          row_index: entry.rowIndex,
          business_number: entry.businessNumber,
          customer_name: entry.customerName,
          status: entry.canImport ? "pending" : "blocked",
          payload_json: entry,
          warning_messages_json: [],
          error_message: entry.canImport ? null : entry.errors.join(" "),
          customer_legacy_id: entry.existingCustomerId,
          linked_certificate_count: 0,
          created_at: createdAt,
          updated_at: createdAt
        }))
      )
    );
  }

  if (pendingEntries.length > 0) {
    await assertNoError(
      "고객 등록 배치 작업 큐 등록 실패",
      client.from("job_queue").insert({
        organization_id: options.organizationId,
        managed_customer_id: null,
        job_type: "customer-onboarding-commit",
        status: "queued",
        run_after: createdAt,
        requested_by: options.requestedByUserId,
        payload: {
          batchId
        }
      })
    );
  }

  return {
    batchId,
    previewId: options.previewId,
    status: pendingEntries.length > 0 ? "queued" : "completed",
    totalRows: entries.length,
    completedRows: failedRows.length,
    successCount: 0,
    failedCount: failedRows.length,
    createdAt
  };
}

export async function getCustomerOnboardingCommitBatchStatus(options: {
  organizationId: string;
  batchId: string;
}): Promise<CustomerOnboardingCommitBatchStatusResult> {
  const client = createSupabaseAdminClient();
  const row = await assertNoError(
    "고객 등록 배치 조회 실패",
    client
      .from("customer_onboarding_batches")
      .select("*")
      .eq("organization_id", options.organizationId)
      .eq("id", options.batchId)
      .maybeSingle()
  );

  if (!row) {
    throw new Error("고객 등록 배치를 찾지 못했습니다.");
  }

  return mapBatchStatus(row as Row);
}

export async function runCustomerOnboardingCommitBatch(batchId: string): Promise<CustomerOnboardingCommitBatchStatusResult> {
  const client = createSupabaseAdminClient();
  const batchRow = await assertNoError(
    "고객 등록 배치 조회 실패",
    client.from("customer_onboarding_batches").select("*").eq("id", batchId).maybeSingle()
  );

  if (!batchRow) {
    throw new Error(`고객 등록 배치를 찾지 못했습니다. batchId=${batchId}`);
  }

  const batch = mapBatchStatus(batchRow as Row);
  if (batch.status === "completed") {
    return batch;
  }

  const startedAt = batch.startedAt ?? nowIso();
  await updateBatchSnapshot(batchId, {
    status: "running",
    completedRows: batch.completedRows,
    createdCount: batch.createdCount,
    updatedCount: batch.updatedCount,
    failedCount: batch.failedCount,
    linkedCertificateCount: batch.linkedCertificateCount,
    warnings: batch.warnings,
    failedRows: batch.failedRows,
    error: null,
    startedAt,
    finishedAt: null
  });

  const store = new SupabaseStore({
    organizationId: asString((batchRow as Row).organization_id),
    bootstrapOrganization: false
  });
  await store.initialize();

  const pendingRows = await assertNoError(
    "고객 등록 배치 행 조회 실패",
    client
      .from("customer_onboarding_batch_rows")
      .select("*")
      .eq("batch_id", batchId)
      .in("status", ["pending", "processing"])
      .order("row_index", { ascending: true })
  );

  let completedRows = batch.completedRows;
  let createdCount = batch.createdCount;
  let updatedCount = batch.updatedCount;
  let failedCount = batch.failedCount;
  let linkedCertificateCount = batch.linkedCertificateCount;
  const warnings = [...batch.warnings];
  const failedRows = [...batch.failedRows];

  try {
    for (const rawRow of (pendingRows ?? []) as Row[]) {
      const rowId = asString(rawRow.id);
      const payload = (rawRow.payload_json ?? {}) as CustomerOnboardingPreparedEntrySnapshot;

      await assertNoError(
        "고객 등록 배치 행 처리 시작 실패",
        client
          .from("customer_onboarding_batch_rows")
          .update({
            status: "processing",
            updated_at: nowIso()
          })
          .eq("id", rowId)
      );

      try {
        const result = await commitCustomerOnboardingPreparedEntry(store, payload, {
          autoJoinCustomer: (customer) =>
            autoJoinCustomerPopbill(store, customer, getServerManagedSettings, getErrorMessage)
        });

        completedRows += 1;
        linkedCertificateCount += result.linkedCertificateCount;
        warnings.push(...result.warnings);
        if (result.outcome === "update") {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }

        await assertNoError(
          "고객 등록 배치 행 완료 처리 실패",
          client
            .from("customer_onboarding_batch_rows")
            .update({
              status: "completed",
              customer_legacy_id: result.customer.id,
              linked_certificate_count: result.linkedCertificateCount,
              warning_messages_json: result.warnings,
              error_message: null,
              updated_at: nowIso()
            })
            .eq("id", rowId)
        );
      } catch (error) {
        completedRows += 1;
        failedCount += 1;
        const message = error instanceof Error ? error.message : "고객 저장에 실패했습니다.";
        failedRows.push({
          rowIndex: payload.rowIndex,
          message
        });

        await assertNoError(
          "고객 등록 배치 행 실패 처리 실패",
          client
            .from("customer_onboarding_batch_rows")
            .update({
              status: "failed",
              error_message: message,
              updated_at: nowIso()
            })
            .eq("id", rowId)
        );
      }

      await updateBatchSnapshot(batchId, {
        status: "running",
        completedRows,
        createdCount,
        updatedCount,
        failedCount,
        linkedCertificateCount,
        warnings,
        failedRows,
        error: null,
        startedAt,
        finishedAt: null
      });
    }

    const finishedAt = nowIso();
    await updateBatchSnapshot(batchId, {
      status: "completed",
      completedRows,
      createdCount,
      updatedCount,
      failedCount,
      linkedCertificateCount,
      warnings,
      failedRows,
      error: null,
      startedAt,
      finishedAt
    });

    return getCustomerOnboardingCommitBatchStatus({
      organizationId: asString((batchRow as Row).organization_id),
      batchId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "고객 등록 배치 실행에 실패했습니다.";
    const finishedAt = nowIso();
    await updateBatchSnapshot(batchId, {
      status: "failed",
      completedRows,
      createdCount,
      updatedCount,
      failedCount,
      linkedCertificateCount,
      warnings,
      failedRows,
      error: message,
      startedAt,
      finishedAt
    });
    throw error;
  }
}
