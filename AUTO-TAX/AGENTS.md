# AUTO-TAX Agent Guide

This file is the primary working document for future development. Treat it as the canonical entrypoint before reading other docs.

## Canonical Docs

- `AGENTS.md`: project briefing, commands, invariants, change map
- `README.md`: terse repo entrypoint
- `DESIGN.md`: UI design language
- `docs/IMPLEMENTATION.md`: architecture, flows, module ownership
- `docs/SUPABASE_SCHEMA_PLAN.md`: database model and invariants
- `docs/OPERATIONS.md`: env, local runbook, deploy, cron, smoke checks
- `docs/CERTIFICATE_RENEWAL_POC.md`: local helper / SignGate specifics
- `docs/IMPLEMENTATION_STATUS.md`: current backlog and sharp edges

If another markdown file conflicts with one of the above, assume the above is the source of truth.

## Repo Map

- `web/`: Vite React app
- `server/`: Express API and Supabase-backed services
- `api/index.ts`: Vercel entrypoint
- `scripts/`: Windows helper scripts, renewal helper, one-off utilities
- `supabase/`: config, migrations, Edge Function `job-tick`
- `docs/`: development-only reference docs

## Fast Start

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:4300`

Core validation:

```bash
npm run check
npm run test:server
npm run test:e2e:smoke
```

## Runtime Truths

1. Customer auto-matching is address-first.
   `managed_customer_match_addresses` is the real matching key. `plantNames` is supplemental.
2. Product UI is effectively `owner` and `member`.
   DB roles still include `admin/operator/viewer`, but current workflows expose mainly `owner` and non-owner member behavior.
3. Popbill secrets are server-managed.
   Runtime env overrides workspace values for `AUTO_TAX_POPBILL_*`.
4. There are two job systems.
   `job_queue` handles mail/issue ops. `renewal_automation_jobs` handles local certificate diagnostics/preflight.
5. Local certificate support is Windows-only and not fully autonomous.
   Current scope is read/connect/preflight/prepare/payment-open assistance, not full unattended renewal completion.
6. `data/` is potentially user state.
   Do not delete local DB files casually during cleanup unless the task explicitly says to remove them.

## High-Value Files

- `web/src/App.tsx`: app shell, tab orchestration, shared client state
- `web/src/features/*`: major tab-specific UI
- `server/src/main.ts`: app creation and route registration
- `server/src/routes/*.ts`: HTTP surface area
- `server/src/supabase-store.ts`: main persistence adapter
- `server/src/mail-sync.ts`: IMAP ingestion and matching path
- `server/src/job-queue.ts`: recurring job dispatch/run
- `server/src/renewal-automation.ts`: local renewal job orchestration
- `scripts/renewal-local-helper.ts`: local helper runtime
- `scripts/renewal-agent.ts`: local renewal agent worker

## Change Map

When changing customer matching:

- check `server/src/parser.ts`
- check `server/src/mail-sync.ts`
- check `server/src/mail-reprocess.ts`
- check `server/src/supabase-store.ts`
- check `web/src/features/customers/*`
- check `docs/IMPLEMENTATION.md`

When changing onboarding/import:

- check `web/src/features/initial-registration/*`
- check `server/src/services/customer-import-service.ts`
- check `server/src/services/customer-onboarding-import-service.ts`
- check `server/src/routes/settings-routes.ts`
- check `docs/IMPLEMENTATION.md`

When changing roles/workspace management:

- check `server/src/api-access.ts`
- check `server/src/routes/organization-member-routes.ts`
- check `server/src/routes/ops-routes.ts`
- check `server/src/workspace-admin-service.ts`
- check `docs/SUPABASE_SCHEMA_PLAN.md`

When changing renewal helper behavior:

- check `web/src/local-renewal-helper.ts`
- check `web/src/features/certificates/*`
- check `server/src/routes/renewal-routes.ts`
- check `server/src/services/renewal-*`
- check `scripts/renewal-local-helper.ts`
- check `scripts/renewal-agent.ts`
- check `docs/CERTIFICATE_RENEWAL_POC.md`

## Hygiene

- Safe-to-delete generated directories: `dist/`, `public/`, `tmp/`, `supabase/.temp/`, `supabase/supabase/.temp/`
- Safe-to-delete generated files: `tmp-*.log`, `.tmp-*.cjs`
- Keep `node_modules/` unless there is a specific cleanup reason; deleting it slows iteration.
- Keep `.env` and `data/` unless explicitly cleaning local state.
