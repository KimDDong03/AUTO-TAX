# AUTO-TAX Operations Runbook

This file is for development, deployment, and runtime debugging work. It is not an end-user operations manual.

## 1. Required Environment

### Browser runtime

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

### Server

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTO_TAX_ENCRYPTION_KEY`
- `AUTO_TAX_OPS_EMAILS`
- `AUTO_TAX_POPBILL_LINK_ID`
- `AUTO_TAX_POPBILL_SECRET_KEY`
- `AUTO_TAX_POPBILL_IS_TEST`
- `AUTO_TAX_POPBILL_USER_ID_PREFIX`
- `AUTO_TAX_POPBILL_SHARED_PASSWORD`

### Internal jobs and cron

- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_JOB_SECRET`

### Optional or situational

- `VITE_API_BASE_URL`
- `AUTO_TAX_ALLOWED_ORIGINS`
- `AUTO_TAX_POPBILL_CONTACT_EMAIL` (falls back to the first `AUTO_TAX_OPS_EMAILS` address)
- `AUTO_TAX_POPBILL_PARTNER_CORP_NUM`
- `AUTO_TAX_RENEWAL_AGENT_*`
- `SUPABASE_DB_PASSWORD`
- `AUTO_TAX_RENEWAL_HELPER_ZIP_PATH`
- `VITE_RENEWAL_HELPER_DOWNLOAD_URL`

## 2. Local Development

Run the app:

```bash
npm install
npm run dev
```

- Local CORS allows browser origins on `localhost`, `127.0.0.1`, and `[::1]` even when Vite moves off port `5173`.
- Use `AUTO_TAX_ALLOWED_ORIGINS` only when you need extra non-loopback origins.

Validate:

```bash
npm run check
npm run test:server
npm run test:e2e:smoke
```

Local Vercel path:

```bash
npm run dev:vercel
```

## 3. Build And Serve Shape

- Local Node server entry: `server/src/main.ts`
- Vercel entry: `api/index.ts`
- Static Vercel output: `public/`

Build commands:

```bash
npm run build
npm run build:vercel
```

## 4. Security Boundary

- Production deployment assumes HTTPS end-to-end.
- `/api/*` responses and Windows local helper responses send `Cache-Control: no-store`.
- Server-managed secrets include mail credentials, Popbill env values, the customer user-id prefix/shared password defaults, and the optional encrypted renewal issue password default.
- Set `AUTO_TAX_ENCRYPTION_KEY` in production as an app-specific high-entropy key. Do not rely on the Supabase service role key as the encryption-key fallback for real customer data.
- The public consultation form accepts only name and phone. Do not collect mail app passwords, Hometax credentials, or account passwords on the public page.
- Do not store Hometax credentials, raw certificate files, or certificate passwords on the server.
- Browser auth follows the current Supabase JWT lifecycle. Invalid refresh-token recovery clears the local session and forces re-login.
- Customer-company withdrawal is owner-only and must withdraw joined managed customers from Popbill before the workspace is marked `churned`. A non-already-missing Popbill failure stops the withdrawal so operators can resolve the external account first.

## 5. Database And Migrations

Push local schema changes:

```bash
npx supabase db push --workdir .
```

When reviewing schema changes:

- inspect `supabase/migrations/`
- inspect `docs/SUPABASE_SCHEMA_PLAN.md`
- inspect `server/src/supabase-store.ts`

## 6. Internal Jobs And Retention

### Business queue flow

1. Supabase cron hits Edge Function `job-tick`.
2. `job-tick` calls the API using `AUTO_TAX_JOB_SECRET`.
3. Internal endpoints run:
   - `POST /api/internal/jobs/maintenance`
   - `POST /api/internal/jobs/dispatch`
   - `POST /api/internal/jobs/run`
4. Business work persists in `job_queue`.

`job-tick` runs at most 10 queued jobs by default. Explicit run limits are clamped to 25 so cron or manual retries cannot flood the database after a backlog.

`mail-sync` is dispatched at most once per workspace/month after the workspace's monthly schedule is reached. The default day is the 20th; there is no five-minute mail collection loop.

### Retention

- Maintenance is checkpointed by `platform_maintenance_runs`, so cron can call it every tick without pruning more than once per UTC day.
- Current default retention:
  - `app_logs`: 30 days by `created_at`
  - `job_queue`: 21 days for terminal rows by `finished_at`
  - `renewal_automation_jobs`: 30 days for terminal rows by `finished_at`
- Queued or claimed rows are never prune targets.

### Edge Function deployment assumptions

- Function name: `job-tick`
- Deploy with `--no-verify-jwt`
- Validate `x-auto-tax-job-secret` inside the function

Minimum remote secrets:

- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_JOB_SECRET`

## 7. Local Renewal Helper And Agent

There are two local Windows components:

### Local helper

- Browser-facing HTTP helper
- Runs on the operator PC
- Handles certificate listing, browser-selected NPKI upload-session metadata extraction, local checks, and payment-window/open support
- Stable install path: `%LOCALAPPDATA%\\AUTO-TAX\\renewal-local-helper`

Commands:

```bash
npm run renewal-helper:install
npm run renewal-helper:package
npm run renewal-helper:start
npm run renewal-helper:status
npm run renewal-helper:stop
npm run renewal-helper:uninstall
```

Packaging output:

- `dist/renewal-local-helper/`
- `dist/renewal-local-helper.zip`
- `web/public/downloads/renewal-local-helper.zip`

Download path defaults:

- Vercel/public: `/downloads/renewal-local-helper.zip`
- local/self-hosted server: `/downloads/renewal-local-helper.zip`

Override locations with:

- `VITE_RENEWAL_HELPER_DOWNLOAD_URL`
- `AUTO_TAX_RENEWAL_HELPER_ZIP_PATH`

### Renewal agent

- Server-facing Windows worker
- Heartbeats regularly
- Claims queued renewal jobs
- Completes diagnostics and preflight work

Command:

```bash
npm run renewal-agent:dev
```

Useful env:

- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_RENEWAL_AGENT_ID`
- `AUTO_TAX_RENEWAL_AGENT_INTERVAL_MS`
- `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD`
- `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE`

Operational rules:

- Certificate passwords must stay in the current browser/helper or agent context only.
- Do not write certificate passwords to settings tables, customer certificate rows, onboarding preview rows, or app logs.
- Raw NPKI files selected during manual customer add must stay inside the browser-to-`127.0.0.1` helper request; persist only extracted certificate metadata and customer fields.

### Renewal debugging order

1. Confirm helper install and `renewal-helper:status`.
2. Confirm browser-to-helper reachability.
3. Check `GET /api/automation/renewal-agent/snapshot`.
4. Inspect `renewal_agent_heartbeats`.
5. Inspect `renewal_automation_jobs`.
6. Inspect `server/src/routes/renewal-routes.ts`, `server/src/renewal-automation.ts`, and the Windows scripts.

## 8. Health And Smoke Checks

### Basic health

- `GET /api/health`

Expected response:

```json
{ "ok": true }
```

### Manual smoke checklist

1. Public portal renders at `/` with 상담 신청 first and existing-customer login second.
2. Public consultation request accepts name/phone and appears in the ops 상담 신청 list.
3. Public login shows the expected error flow on invalid credentials.
4. Bootstrap loads with the active workspace.
5. Customer create/edit works.
6. Manual mail sync responds. `POST /api/mail/sync` may include `{ "receivedMonth": "YYYY-MM" }`; if omitted, the server uses the current KST month.
7. Draft list loads.
8. Internal jobs can dispatch and run from the ops UI.

### Scripted smoke

```bash
npm run test:e2e:smoke
npm run smoke:ops
node scripts/public-access-portal-smoke.mjs
```

`npm run smoke:ops` checks the linked Supabase project for:

- `job-tick` is active and deployed with JWT verification disabled.
- remote migration history is up to date.
- queue/log pressure snapshot, failing on stale claimed jobs by default.

## 9. Pilot Reporting

Current report endpoints:

- `GET /api/drafts/pilot-report?from=<ISO>&to=<ISO>`
- `GET /api/drafts/pilot-report?from=<ISO>&to=<ISO>&format=csv`
- `GET /api/drafts/:id/pilot-timeline`

The report currently includes:

- overall success and exception rates
- weekly and monthly buckets
- customer-level transition evidence
- failure Top N
- estimated saved time

## 10. File Hygiene

Disposable generated output:

- `dist/`
- `public/`
- `tmp/`
- `supabase/.temp/`
- `supabase/supabase/.temp/`
- `tmp-*.log`
- `.tmp-*.cjs`

Treat with caution:

- `.env`
- `data/`
- `node_modules/`

`data/` may contain local state worth keeping.

## 11. Debugging Shortcuts

When auth or workspace session looks wrong:

- inspect `server/src/api-access.ts`
- inspect `web/src/api.ts`
- inspect `web/src/supabase.ts`

When mail sync looks wrong:

- inspect `server/src/mail-sync.ts`
- inspect `server/src/mail-reprocess.ts`
- inspect `server/src/parser.ts`
- inspect `mail_sync_checkpoints`

When recurring business jobs look wrong:

- inspect `server/src/job-queue.ts`
- inspect `server/src/maintenance-retention.ts`
- inspect internal job endpoints
- inspect `job_queue`
- inspect pilot reporting endpoints when the issue is timing or audit related

When local renewal flow looks wrong:

- inspect `server/src/routes/renewal-routes.ts`
- inspect `server/src/renewal-automation.ts`
- inspect `renewal_agent_heartbeats`
- inspect `renewal_automation_jobs`
- inspect `scripts/renewal-local-helper.ts`
- inspect `scripts/renewal-agent.ts`
