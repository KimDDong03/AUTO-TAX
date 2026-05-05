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

async function main() {
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
    throw new Error("job-tick function is missing");
  }
  if (jobTick.status !== "ACTIVE") {
    throw new Error(`job-tick is not active: ${jobTick.status}`);
  }
  if (jobTick.verify_jwt !== false) {
    throw new Error("job-tick verify_jwt must be false because x-auto-tax-job-secret is validated inside the function");
  }

  await assertMigrationState();
  const queue = await readQueueSnapshot();

  const maxStaleClaimed = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_STALE_CLAIMED) ?? 0;
  const maxQueuedJobs = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_QUEUED_JOBS);
  const maxFailedJobs = parseOptionalInteger(process.env.AUTO_TAX_OPS_SMOKE_MAX_FAILED_JOBS);

  if (Number(queue.stale_claimed_jobs ?? 0) > maxStaleClaimed) {
    throw new Error(`stale claimed jobs exceed threshold: ${queue.stale_claimed_jobs}`);
  }
  if (maxQueuedJobs !== null && Number(queue.queued_jobs ?? 0) > maxQueuedJobs) {
    throw new Error(`queued jobs exceed threshold: ${queue.queued_jobs}`);
  }
  if (maxFailedJobs !== null && Number(queue.failed_jobs ?? 0) > maxFailedJobs) {
    throw new Error(`failed jobs exceed threshold: ${queue.failed_jobs}`);
  }

  console.log(JSON.stringify({
    ok: true,
    projectRef,
    jobTick: {
      status: jobTick.status,
      verifyJwt: jobTick.verify_jwt,
      version: jobTick.version
    },
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
