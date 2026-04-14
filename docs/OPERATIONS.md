# AUTO-TAX Operations Runbook

This file is for development and deployment work, not end-user operations.

## 1. Required Environment

### Browser/runtime

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

### Server

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTO_TAX_OPS_EMAILS`
- `AUTO_TAX_SUPPORT_APP_PASSWORD`
- `AUTO_TAX_POPBILL_LINK_ID`
- `AUTO_TAX_POPBILL_SECRET_KEY`
- `AUTO_TAX_POPBILL_IS_TEST`

### Internal jobs / Edge Function

- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_JOB_SECRET`

### Optional / situational

- `AUTO_TAX_POPBILL_PARTNER_CORP_NUM`
- `SUPABASE_DB_PASSWORD`
- `AUTO_TAX_RENEWAL_AGENT_*`
- `AUTO_TAX_RENEWAL_HELPER_ZIP_PATH`
- `VITE_RENEWAL_HELPER_DOWNLOAD_URL`

## 2. Local Development

### Run app

```bash
npm install
npm run dev
```

### Typecheck and tests

```bash
npm run check
npm run test:server
npm run test:e2e:smoke
```

### Vercel-local path

```bash
npm run dev:vercel
```

## 3. Local Certificate Helper

### Helper commands

```bash
npm run renewal-helper:install
npm run renewal-helper:package
npm run renewal-helper:start
npm run renewal-helper:status
npm run renewal-helper:stop
npm run renewal-helper:uninstall
```

- `renewal-helper:install` now stops any currently running helper before copying/re-registering the install so in-place upgrades pick up the new package cleanly.

### Helper package download

- `npm run renewal-helper:package` creates:
  - `dist/renewal-local-helper/`
  - `dist/renewal-local-helper.zip`
- the same command also refreshes:
  - `web/public/downloads/renewal-local-helper.zip`
- Vercel/public site default download path:
  - `/downloads/renewal-local-helper.zip`
- local/self-hosted server download path:
  - `/downloads/renewal-local-helper.zip`
- if the zip is stored elsewhere, set:
  - `VITE_RENEWAL_HELPER_DOWNLOAD_URL`
- if the server should serve a non-default zip path, set:
  - `AUTO_TAX_RENEWAL_HELPER_ZIP_PATH`

### Renewal agent

```bash
npm run renewal-agent:dev
```

Useful env:

- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_RENEWAL_AGENT_ID`
- `AUTO_TAX_RENEWAL_AGENT_INTERVAL_MS`
- `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD`
- `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE`

See `docs/CERTIFICATE_RENEWAL_POC.md` for the renewal-specific runtime model.

## 4. Database and Migrations

### Local/remote migration push

```bash
npx supabase db push --workdir .
```

### Schema review

- inspect `supabase/migrations/`
- inspect `docs/SUPABASE_SCHEMA_PLAN.md`
- inspect `server/src/supabase-store.ts`

## 5. Vercel Build/Serve Shape

- Vercel server entry: `api/index.ts`
- static output directory: `public/`
- local Node server entry: `server/src/main.ts`

Build commands:

```bash
npm run build
npm run build:vercel
```

## 6. Cron / Internal Jobs

### Business queue flow

1. Supabase cron hits Edge Function `job-tick`
2. Edge Function calls Vercel API using `AUTO_TAX_JOB_SECRET`
3. Vercel endpoints:
   - `POST /api/internal/jobs/maintenance`
   - `POST /api/internal/jobs/dispatch`
   - `POST /api/internal/jobs/run`
4. Work is persisted in `job_queue`

### Retention / pruning

- platform-wide maintenance runs through `POST /api/internal/jobs/maintenance`
- maintenance is checkpointed by `platform_maintenance_runs`, so cron can call it every tick without re-pruning more than once per UTC day
- retention defaults:
  - `app_logs`: 30 days by `created_at`
  - `job_queue`: 21 days for terminal rows (`completed`, `failed`, `cancelled`) by `finished_at`
  - `renewal_automation_jobs`: 30 days for terminal rows (`completed`, `failed`) by `finished_at`
- queued / claimed rows are never prune targets

### Edge Function deployment assumptions

- function name: `job-tick`
- deploy with `--no-verify-jwt`
- validate `x-auto-tax-job-secret` inside the function

### Minimum remote secrets

- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_JOB_SECRET`

## 7. Health and Smoke Checks

### Basic health

- `GET /api/health`

Expected:

```json
{ "ok": true }
```

### Manual smoke checklist

1. landing page renders
2. public login works
3. bootstrap loads with active workspace
4. customer create/edit works
5. mail sync endpoint responds
6. draft list loads
7. internal jobs can dispatch/run from ops UI

### Scripted smoke

```bash
npm run test:e2e:smoke
```

## 8. File Hygiene

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

`data/` may contain local state worth keeping even if the current product is Supabase-first.

## 9. Debugging Shortcuts

When auth/session looks wrong:

- inspect `server/src/api-access.ts`
- inspect `web/src/api.ts`
- inspect `web/src/supabase.ts`

When mail sync looks wrong:

- inspect `server/src/mail-sync.ts`
- inspect `server/src/mail-reprocess.ts`
- inspect `server/src/parser.ts`
- inspect `mail_sync_checkpoints`

When auto-issue / recurring jobs look wrong:

- inspect `server/src/job-queue.ts`
- inspect `/api/internal/jobs/dispatch`
- inspect `/api/internal/jobs/run`
- inspect `job_queue`

When local renewal flow looks wrong:

- inspect `server/src/routes/renewal-routes.ts`
- inspect `server/src/renewal-automation.ts`
- inspect `renewal_agent_heartbeats`
- inspect `renewal_automation_jobs`
