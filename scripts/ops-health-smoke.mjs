import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const npxBin = "npx";

function parseOptionalInteger(value) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalBoolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

function runNpx(args) {
  return new Promise((resolve, reject) => {
    execFile(npxBin, args, {
      cwd: projectRoot,
      shell: process.platform === "win32",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  const startIndex = trimmed.search(/[\[{]/);
  if (startIndex < 0) {
    throw new Error(`JSON output not found: ${trimmed}`);
  }
  return JSON.parse(trimmed.slice(startIndex));
}

async function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF?.trim()) {
    return process.env.SUPABASE_PROJECT_REF.trim();
  }

  return (await fs.readFile(path.join(projectRoot, "supabase", ".temp", "project-ref"), "utf8")).trim();
}

async function readQueueSnapshot() {
  const sql = `
select
  (select count(*) from public.job_queue where status = 'queued') as queued_jobs,
  (select count(*) from public.job_queue where status = 'claimed') as claimed_jobs,
  (select count(*) from public.job_queue where status = 'claimed' and claimed_at <= now() - interval '20 minutes') as stale_claimed_jobs,
  (select count(*) from public.job_queue where status = 'failed') as failed_jobs,
  (select count(*) from public.renewal_automation_jobs where status = 'queued') as queued_renewal_jobs,
  (select count(*) from public.renewal_automation_jobs where status = 'claimed') as claimed_renewal_jobs,
  (select count(*) from public.renewal_automation_jobs where status = 'claimed' and claimed_at <= now() - interval '5 minutes') as stale_claimed_renewal_jobs,
  (select count(*) from public.renewal_automation_jobs where status = 'failed') as failed_renewal_jobs,
  (select count(*) from public.app_logs where created_at >= now() - interval '24 hours') as app_logs_24h,
  (select count(*) from public.app_logs where level in ('error','warn') and created_at >= now() - interval '24 hours') as warning_logs_24h;
`;
  const sqlPath = path.join(os.tmpdir(), `auto-tax-ops-health-${Date.now()}.sql`);
  await fs.writeFile(sqlPath, sql, "utf8");

  try {
    const { stdout } = await runNpx(["supabase", "db", "query", "--linked", "--workdir", ".", "--file", sqlPath, "--output", "json"]);
    const payload = parseJsonOutput(stdout);
    return payload.rows?.[0] ?? {};
  } finally {
    await fs.rm(sqlPath, { force: true });
  }
}

async function assertMigrationState() {
  const { stdout } = await runNpx(["supabase", "db", "push", "--workdir", ".", "--linked", "--dry-run"]);
  if (!stdout.includes("Remote database is up to date.")) {
    throw new Error("remote migration history is not up to date");
  }
}

async function checkDeployedApiReadiness() {
  const rawBaseUrl = process.env.AUTO_TAX_OPS_SMOKE_BASE_URL?.trim() || process.env.AUTO_TAX_SERVER_URL?.trim();
  if (!rawBaseUrl) {
    return { checked: false };
  }

  const baseUrl = trimTrailingSlashes(/^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl : `https://${rawBaseUrl}`);
  const response = await fetch(`${baseUrl}/api/health`);
  if (!response.ok) {
    throw new Error(`deployed API health check failed: ${response.status}`);
  }

  return {
    checked: true,
    baseUrl,
    status: response.status
  };
}

function readConfiguredSignupEmailMode() {
  const provider = process.env.AUTO_TAX_SIGNUP_EMAIL_PROVIDER?.trim().toLowerCase() ?? "";
  const smtpHost = process.env.AUTO_TAX_SIGNUP_SMTP_HOST?.trim() ?? "";
  const supportEmail = process.env.AUTO_TAX_SUPPORT_TO_EMAIL?.trim() ?? "";
  const supportPassword = process.env.AUTO_TAX_SUPPORT_APP_PASSWORD?.trim() ?? "";
  const smtpUser = process.env.AUTO_TAX_SIGNUP_SMTP_USER?.trim() ?? "";
  const smtpPass = process.env.AUTO_TAX_SIGNUP_SMTP_PASS?.trim() ?? "";
  return {
    provider,
    configured: provider === "smtp" || Boolean(smtpHost) || Boolean(supportEmail && supportPassword) || Boolean(smtpUser && smtpPass)
  };
}

function assertProviderProductionMode() {
  const smsProvider = process.env.SMS_PROVIDER?.trim().toLowerCase() ?? "";
  const solapiConfigured = Boolean(
    process.env.SOLAPI_API_KEY?.trim() &&
    process.env.SOLAPI_API_SECRET?.trim() &&
    process.env.SOLAPI_SENDER_NUMBER?.trim()
  );
  const signupEmail = readConfiguredSignupEmailMode();
  const result = {
    smsProvider: smsProvider || "dev",
    smsConfigured: smsProvider === "solapi" && solapiConfigured,
    signupEmailProvider: signupEmail.provider || (signupEmail.configured ? "smtp-compatible" : "dev"),
    signupEmailConfigured: signupEmail.configured
  };

  if (process.env.AUTO_TAX_OPS_SMOKE_SKIP_PROVIDER_CHECK === "1") {
    return {
      ...result,
      skipped: true
    };
  }

  if (!result.smsConfigured) {
    throw new Error("public signup SMS provider is not production-ready; set SMS_PROVIDER=solapi with SOLAPI credentials");
  }
  if (!result.signupEmailConfigured) {
    throw new Error("public signup email provider is not production-ready; configure SMTP/support email credentials");
  }

  return {
    ...result,
    skipped: false
  };
}

async function readJobTickStatus() {
  const requireJobTick = parseOptionalBoolean(process.env.AUTO_TAX_OPS_SMOKE_REQUIRE_JOB_TICK, false);

  try {
    const projectRef = await resolveProjectRef();
    const { stdout: functionsStdout } = await runNpx([
      "supabase",
      "functions",
      "list",
      "--project-ref",
      projectRef,
      "--output",
      "json"
    ]);
    const functions = parseJsonOutput(functionsStdout);
    const jobTick = functions.find((fn) => fn.slug === "job-tick" || fn.name === "job-tick");
    if (!jobTick) {
      if (requireJobTick) {
        throw new Error("job-tick function is missing");
      }
      return {
        required: false,
        present: false,
        status: "missing",
        verifyJwt: null,
        version: null
      };
    }
    if (requireJobTick && jobTick.status !== "ACTIVE") {
      throw new Error(`job-tick is not active: ${jobTick.status}`);
    }
    if (requireJobTick && jobTick.verify_jwt !== false) {
      throw new Error("job-tick verify_jwt must be false because x-auto-tax-job-secret is validated inside the function");
    }
    return {
      required: requireJobTick,
      present: true,
      status: jobTick.status,
      verifyJwt: jobTick.verify_jwt,
      version: jobTick.version
    };
  } catch (error) {
    if (requireJobTick) {
      throw error;
    }
    return {
      required: false,
      present: false,
      status: "not-checked",
      verifyJwt: null,
      version: null,
      warning: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  const providerMode = assertProviderProductionMode();
  const apiReadiness = await checkDeployedApiReadiness();
  const jobTick = await readJobTickStatus();
  await assertMigrationState();
  const queue = await readQueueSnapshot();

  const maxStaleClaimed = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_STALE_CLAIMED) ?? 0;
  const maxStaleRenewalClaimed = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_STALE_RENEWAL_CLAIMED) ?? 0;
  const maxQueuedJobs = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_QUEUED_JOBS);
  const maxFailedJobs = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_FAILED_JOBS);
  const maxQueuedRenewalJobs = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_QUEUED_RENEWAL_JOBS);
  const maxFailedRenewalJobs = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_FAILED_RENEWAL_JOBS);

  if (Number(queue.stale_claimed_jobs ?? 0) > maxStaleClaimed) {
    throw new Error(`stale claimed jobs exceed threshold: ${queue.stale_claimed_jobs}`);
  }
  if (Number(queue.stale_claimed_renewal_jobs ?? 0) > maxStaleRenewalClaimed) {
    throw new Error(`stale claimed renewal jobs exceed threshold: ${queue.stale_claimed_renewal_jobs}`);
  }
  if (maxQueuedJobs !== null && Number(queue.queued_jobs ?? 0) > maxQueuedJobs) {
    throw new Error(`queued jobs exceed threshold: ${queue.queued_jobs}`);
  }
  if (maxFailedJobs !== null && Number(queue.failed_jobs ?? 0) > maxFailedJobs) {
    throw new Error(`failed jobs exceed threshold: ${queue.failed_jobs}`);
  }
  if (maxQueuedRenewalJobs !== null && Number(queue.queued_renewal_jobs ?? 0) > maxQueuedRenewalJobs) {
    throw new Error(`queued renewal jobs exceed threshold: ${queue.queued_renewal_jobs}`);
  }
  if (maxFailedRenewalJobs !== null && Number(queue.failed_renewal_jobs ?? 0) > maxFailedRenewalJobs) {
    throw new Error(`failed renewal jobs exceed threshold: ${queue.failed_renewal_jobs}`);
  }

  console.log(JSON.stringify({
    ok: true,
    apiReadiness,
    providerMode,
    jobTick,
    queue
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (error?.stdout) {
    console.error(error.stdout);
  }
  if (error?.stderr) {
    console.error(error.stderr);
  }
  process.exitCode = 1;
});
