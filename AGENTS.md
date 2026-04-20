# AUTO-TAX Agent Guide

This file is the primary entrypoint for Codex work. Read it before opening other docs.

## Canonical Docs

The active documentation set is intentionally small:

- `AGENTS.md`: repo briefing, commands, invariants, and change map
- `README.md`: short repo entrypoint
- `docs/IMPLEMENTATION.md`: architecture, flows, module ownership
- `docs/SUPABASE_SCHEMA_PLAN.md`: database model and invariants
- `docs/OPERATIONS.md`: env, runbook, deploy, jobs, smoke checks
- `docs/IMPLEMENTATION_STATUS.md`: current backlog and refactor pressure

If a non-canonical note or plan conflicts with one of the files above, trust the canonical doc.
There is intentionally no canonical UI/UX rulebook. Existing layout, styling, and interaction patterns are changeable implementation details unless the user asks to preserve them.

## Read Order

Use the shortest path that fits the task:

- First-pass orientation: `README.md` -> `docs/IMPLEMENTATION.md`
- Data or persistence work: `docs/SUPABASE_SCHEMA_PLAN.md` -> `docs/IMPLEMENTATION.md`
- Runtime, deploy, or cron work: `docs/OPERATIONS.md`
- Current priorities: `docs/IMPLEMENTATION_STATUS.md`

## Repo Map

- `web/`: Vite React app
- `server/`: Express API and Supabase-backed services
- `api/index.ts`: Vercel entrypoint
- `scripts/`: Windows helper scripts, renewal agent, packaging, utilities
- `supabase/`: migrations, config, Edge Function `job-tick`
- `docs/`: active developer docs only

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

Useful build/runtime commands:

```bash
npm run build
npm run build:vercel
npm run dev:vercel
npm run renewal-helper:install
npm run renewal-helper:start
npm run renewal-helper:status
npm run renewal-helper:stop
npm run renewal-agent:dev
```

## Runtime Truths

1. Customer auto-matching is address-first.
   `managed_customer_match_addresses` is the real matching key. `plantNames` is supplemental only.
2. Current code routes public root to a customer access portal.
   That is current implementation state, not a frozen design requirement.
3. Current role behavior is effectively `owner` and non-owner member.
   DB roles still include `admin`, `operator`, and `viewer`, but current workflows mostly expose owner versus member behavior.
4. Popbill secrets are server-managed.
   Runtime env overrides workspace-level values for `AUTO_TAX_POPBILL_*`.
5. There are two job systems.
   `job_queue` handles mail and issuance work. `renewal_automation_jobs` handles local certificate diagnostics and preflight.
6. Local certificate support is Windows-only and not fully autonomous.
   The current scope is read/connect/preflight/prepare/payment-open assistance, not unattended renewal completion.
7. Certificate and Hometax secrets stay off the server wherever possible.
   Do not persist or re-display raw certificate files, certificate passwords, or Hometax credentials.
8. `data/` is potentially user state.
   Do not delete local DB files casually during cleanup.

## High-Value Files

- `web/src/App.tsx`: shell, auth/workspace bootstrap, tab orchestration, remaining cross-feature state
- `web/src/features/*`: feature screens and client state
- `server/src/main.ts`: app creation and route registration
- `server/src/routes/*.ts`: HTTP surface area
- `server/src/supabase-store.ts`: main persistence boundary
- `server/src/mail-sync.ts`: IMAP ingestion and matching path
- `server/src/job-queue.ts`: recurring business job dispatch and execution
- `server/src/renewal-automation.ts`: local renewal queue persistence and agent coordination
- `server/src/services/customer-onboarding-batch-service.ts`: workbook preview and commit batches
- `scripts/renewal-local-helper.ts`: browser-facing Windows helper
- `scripts/renewal-agent.ts`: server-facing Windows renewal worker

## Change Map

When changing customer matching:

- check `server/src/parser.ts`
- check `server/src/mail-sync.ts`
- check `server/src/mail-reprocess.ts`
- check `server/src/supabase-store.ts`
- check `web/src/features/customers/*`
- check `docs/IMPLEMENTATION.md`
- check `docs/SUPABASE_SCHEMA_PLAN.md`

When changing onboarding or import:

- check `web/src/features/onboarding/*`
- check `web/src/features/initial-registration/*`
- check `server/src/routes/settings-routes.ts`
- check `server/src/services/customer-import-service.ts`
- check `server/src/services/customer-onboarding-import-service.ts`
- check `server/src/services/customer-onboarding-batch-service.ts`
- check `docs/IMPLEMENTATION.md`
- check `docs/SUPABASE_SCHEMA_PLAN.md`

When changing draft issuance or pilot reporting:

- check `server/src/routes/draft-routes.ts`
- check `server/src/services/draft-service.ts`
- check `server/src/job-queue.ts`
- check `server/src/pilot-issuance.ts`
- check `docs/IMPLEMENTATION.md`
- check `docs/OPERATIONS.md`

When changing roles or workspace management:

- check `server/src/api-access.ts`
- check `server/src/routes/organization-member-routes.ts`
- check `server/src/routes/ops-routes.ts`
- check `server/src/workspace-admin-service.ts`
- check `web/src/App.tsx`
- check `docs/SUPABASE_SCHEMA_PLAN.md`

When changing renewal helper behavior:

- check `web/src/local-renewal-helper.ts`
- check `web/src/features/certificates/*`
- check `web/src/features/renewal/*`
- check `server/src/routes/renewal-routes.ts`
- check `server/src/services/renewal-*`
- check `server/src/renewal-automation.ts`
- check `scripts/renewal-local-helper.ts`
- check `scripts/renewal-agent.ts`
- check `docs/IMPLEMENTATION.md`
- check `docs/OPERATIONS.md`

When changing cron, retention, or internal jobs:

- check `supabase/functions/job-tick`
- check `server/src/job-queue.ts`
- check `server/src/maintenance-retention.ts`
- check `docs/OPERATIONS.md`
- check `docs/SUPABASE_SCHEMA_PLAN.md`

## Doc Hygiene

- Keep docs only if they help implementation, debugging, or safe operations.
- Prefer updating the canonical docs over creating new long-lived plan files.
- Do not create or preserve house style rules for UI/UX unless the user explicitly asks for them.
- Delete stale wireframes, checklists, and one-off plans instead of letting them become false sources of truth.
- When behavior or invariants change, update the relevant canonical doc in the same change.

## Hygiene

- Safe-to-delete generated directories: `dist/`, `public/`, `tmp/`, `supabase/.temp/`, `supabase/supabase/.temp/`
- Safe-to-delete generated files: `tmp-*.log`, `.tmp-*.cjs`
- Keep `node_modules/` unless there is a specific cleanup reason; deleting it slows iteration.
- Keep `.env` and `data/` unless the task explicitly asks to remove local state.
