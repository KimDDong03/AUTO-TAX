import { createSupabaseAdminClient } from "./supabase.js";

export const PLATFORM_MAINTENANCE_KEY = "retention-prune";
export const APP_LOG_RETENTION_DAYS = 30;
export const JOB_QUEUE_RETENTION_DAYS = 21;
export const RENEWAL_AUTOMATION_JOB_RETENTION_DAYS = 30;
export const PUBLIC_SIGNUP_VERIFICATION_RETENTION_DAYS = 7;
export const JOB_QUEUE_PRUNABLE_STATUSES = ["completed", "failed", "cancelled"] as const;
export const RENEWAL_AUTOMATION_JOB_PRUNABLE_STATUSES = ["completed", "failed"] as const;

export const RETENTION_RULES = {
  appLogs: {
    table: "app_logs",
    retentionDays: APP_LOG_RETENTION_DAYS,
    timestampColumn: "created_at"
  },
  jobQueue: {
    table: "job_queue",
    retentionDays: JOB_QUEUE_RETENTION_DAYS,
    timestampColumn: "finished_at",
    statuses: JOB_QUEUE_PRUNABLE_STATUSES
  },
  renewalAutomationJobs: {
    table: "renewal_automation_jobs",
    retentionDays: RENEWAL_AUTOMATION_JOB_RETENTION_DAYS,
    timestampColumn: "finished_at",
    statuses: RENEWAL_AUTOMATION_JOB_PRUNABLE_STATUSES
  },
  publicSignupPhoneVerifications: {
    table: "public_signup_phone_verifications",
    retentionDays: PUBLIC_SIGNUP_VERIFICATION_RETENTION_DAYS,
    timestampColumn: "expires_at"
  },
  publicSignupEmailVerifications: {
    table: "public_signup_email_verifications",
    retentionDays: PUBLIC_SIGNUP_VERIFICATION_RETENTION_DAYS,
    timestampColumn: "expires_at"
  }
} as const;

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

export type RetentionTableSummary = {
  table: string;
  retentionDays: number;
  timestampColumn: string;
  cutoff: string;
  deletedRows: number;
  statuses?: readonly string[];
};

export type PlatformMaintenanceResult = {
  maintenanceKey: string;
  action: "pruned" | "skipped";
  completedDate: string;
  ranAt: string;
  reason?: string;
  totalDeletedRows: number;
  tables: RetentionTableSummary[];
};

export interface MaintenanceRepository {
  getCompletedDate: (maintenanceKey: string) => Promise<string | null>;
  pruneAppLogs: (cutoff: string) => Promise<number>;
  pruneJobQueue: (cutoff: string, statuses: readonly string[]) => Promise<number>;
  pruneRenewalAutomationJobs: (cutoff: string, statuses: readonly string[]) => Promise<number>;
  prunePublicSignupPhoneVerifications: (cutoff: string) => Promise<number>;
  prunePublicSignupEmailVerifications: (cutoff: string) => Promise<number>;
  saveCompletedRun: (args: {
    maintenanceKey: string;
    completedDate: string;
    ranAt: string;
    summary: PlatformMaintenanceResult;
  }) => Promise<void>;
  saveFailedRun: (args: {
    maintenanceKey: string;
    ranAt: string;
    error: string;
  }) => Promise<void>;
}

type MaintenanceLogger = (message: string, context?: unknown) => void;

function toCompletedDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function toCutoffIso(now: Date, retentionDays: number): string {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
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

async function assertCount(label: string, promise: PromiseLike<CountResult>): Promise<number> {
  const { count, error } = await promise;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return count ?? 0;
}

function defaultLogger(message: string, context?: unknown): void {
  if (context === undefined) {
    console.info(message);
    return;
  }
  console.info(message, context);
}

export function createSupabaseMaintenanceRepository(
  client: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient()
): MaintenanceRepository {
  return {
    async getCompletedDate(maintenanceKey: string): Promise<string | null> {
      const row = await assertNoError(
        "유지보수 실행 이력 조회 실패",
        client
          .from("platform_maintenance_runs")
          .select("last_completed_date")
          .eq("maintenance_key", maintenanceKey)
          .maybeSingle()
      );
      return row?.last_completed_date ? String(row.last_completed_date) : null;
    },

    async pruneAppLogs(cutoff: string): Promise<number> {
      return assertCount(
        "app_logs 보존 기간 정리 실패",
        client.from("app_logs").delete({ count: "exact" }).lt("created_at", cutoff)
      );
    },

    async pruneJobQueue(cutoff: string, statuses: readonly string[]): Promise<number> {
      return assertCount(
        "job_queue 보존 기간 정리 실패",
        client
          .from("job_queue")
          .delete({ count: "exact" })
          .in("status", [...statuses])
          .not("finished_at", "is", null)
          .lt("finished_at", cutoff)
      );
    },

    async pruneRenewalAutomationJobs(cutoff: string, statuses: readonly string[]): Promise<number> {
      return assertCount(
        "renewal_automation_jobs 보존 기간 정리 실패",
        client
          .from("renewal_automation_jobs")
          .delete({ count: "exact" })
          .in("status", [...statuses])
          .not("finished_at", "is", null)
          .lt("finished_at", cutoff)
      );
    },

    async prunePublicSignupPhoneVerifications(cutoff: string): Promise<number> {
      return assertCount(
        "public_signup_phone_verifications 보존 기간 정리 실패",
        client.from("public_signup_phone_verifications").delete({ count: "exact" }).lt("expires_at", cutoff)
      );
    },

    async prunePublicSignupEmailVerifications(cutoff: string): Promise<number> {
      return assertCount(
        "public_signup_email_verifications 보존 기간 정리 실패",
        client.from("public_signup_email_verifications").delete({ count: "exact" }).lt("expires_at", cutoff)
      );
    },

    async saveCompletedRun(args): Promise<void> {
      await assertNoError(
        "유지보수 실행 이력 저장 실패",
        client.from("platform_maintenance_runs").upsert(
          {
            maintenance_key: args.maintenanceKey,
            last_attempted_at: args.ranAt,
            last_completed_date: args.completedDate,
            last_completed_at: args.ranAt,
            last_summary_json: args.summary,
            last_error: null
          },
          {
            onConflict: "maintenance_key"
          }
        )
      );
    },

    async saveFailedRun(args): Promise<void> {
      await assertNoError(
        "유지보수 실패 이력 저장 실패",
        client.from("platform_maintenance_runs").upsert(
          {
            maintenance_key: args.maintenanceKey,
            last_attempted_at: args.ranAt,
            last_error: args.error
          },
          {
            onConflict: "maintenance_key"
          }
        )
      );
    }
  };
}

export async function runPlatformMaintenance(
  options: { now?: Date } = {},
  dependencies: {
    repository?: MaintenanceRepository;
    logger?: MaintenanceLogger;
  } = {}
): Promise<PlatformMaintenanceResult> {
  const now = options.now ?? new Date();
  const ranAt = now.toISOString();
  const completedDate = toCompletedDate(now);
  const repository = dependencies.repository ?? createSupabaseMaintenanceRepository();
  const logger = dependencies.logger ?? defaultLogger;

  try {
    const lastCompletedDate = await repository.getCompletedDate(PLATFORM_MAINTENANCE_KEY);
    if (lastCompletedDate === completedDate) {
      return {
        maintenanceKey: PLATFORM_MAINTENANCE_KEY,
        action: "skipped",
        completedDate,
        ranAt,
        reason: "already-completed-today",
        totalDeletedRows: 0,
        tables: []
      };
    }

    const appLogsCutoff = toCutoffIso(now, RETENTION_RULES.appLogs.retentionDays);
    const jobQueueCutoff = toCutoffIso(now, RETENTION_RULES.jobQueue.retentionDays);
    const renewalAutomationJobsCutoff = toCutoffIso(now, RETENTION_RULES.renewalAutomationJobs.retentionDays);
    const publicSignupVerificationCutoff = toCutoffIso(
      now,
      RETENTION_RULES.publicSignupPhoneVerifications.retentionDays
    );

    const tables: RetentionTableSummary[] = [
      {
        table: RETENTION_RULES.appLogs.table,
        retentionDays: RETENTION_RULES.appLogs.retentionDays,
        timestampColumn: RETENTION_RULES.appLogs.timestampColumn,
        cutoff: appLogsCutoff,
        deletedRows: await repository.pruneAppLogs(appLogsCutoff)
      },
      {
        table: RETENTION_RULES.jobQueue.table,
        retentionDays: RETENTION_RULES.jobQueue.retentionDays,
        timestampColumn: RETENTION_RULES.jobQueue.timestampColumn,
        cutoff: jobQueueCutoff,
        statuses: RETENTION_RULES.jobQueue.statuses,
        deletedRows: await repository.pruneJobQueue(jobQueueCutoff, RETENTION_RULES.jobQueue.statuses)
      },
      {
        table: RETENTION_RULES.renewalAutomationJobs.table,
        retentionDays: RETENTION_RULES.renewalAutomationJobs.retentionDays,
        timestampColumn: RETENTION_RULES.renewalAutomationJobs.timestampColumn,
        cutoff: renewalAutomationJobsCutoff,
        statuses: RETENTION_RULES.renewalAutomationJobs.statuses,
        deletedRows: await repository.pruneRenewalAutomationJobs(
          renewalAutomationJobsCutoff,
          RETENTION_RULES.renewalAutomationJobs.statuses
        )
      },
      {
        table: RETENTION_RULES.publicSignupPhoneVerifications.table,
        retentionDays: RETENTION_RULES.publicSignupPhoneVerifications.retentionDays,
        timestampColumn: RETENTION_RULES.publicSignupPhoneVerifications.timestampColumn,
        cutoff: publicSignupVerificationCutoff,
        deletedRows: await repository.prunePublicSignupPhoneVerifications(publicSignupVerificationCutoff)
      },
      {
        table: RETENTION_RULES.publicSignupEmailVerifications.table,
        retentionDays: RETENTION_RULES.publicSignupEmailVerifications.retentionDays,
        timestampColumn: RETENTION_RULES.publicSignupEmailVerifications.timestampColumn,
        cutoff: publicSignupVerificationCutoff,
        deletedRows: await repository.prunePublicSignupEmailVerifications(publicSignupVerificationCutoff)
      }
    ];

    const result: PlatformMaintenanceResult = {
      maintenanceKey: PLATFORM_MAINTENANCE_KEY,
      action: "pruned",
      completedDate,
      ranAt,
      totalDeletedRows: tables.reduce((sum, table) => sum + table.deletedRows, 0),
      tables
    };

    await repository.saveCompletedRun({
      maintenanceKey: PLATFORM_MAINTENANCE_KEY,
      completedDate,
      ranAt,
      summary: result
    });

    logger("platform-maintenance retention prune completed", result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "platform maintenance failed";
    try {
      await repository.saveFailedRun({
        maintenanceKey: PLATFORM_MAINTENANCE_KEY,
        ranAt,
        error: message
      });
    } catch {
      // Preserve the original maintenance failure when checkpoint persistence is unavailable.
    }
    throw error;
  }
}
