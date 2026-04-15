# AUTO-TAX Implementation

This document is the developer-facing architecture map. It should explain where behavior lives, what the major flows are, and which files are coupled.

## 1. System Shape

AUTO-TAX currently has four runtime surfaces:

1. React web app in `web/`
2. Express API in `server/`
3. Supabase PostgreSQL + Auth + Edge Function
4. Windows local helper / renewal agent in `scripts/`

The product is multi-tenant. A logged-in session always operates against an active workspace.

## 2. Frontend Map

### App shell

- `web/src/App.tsx`
  - bootstraps auth/workspace/session state
  - owns tab selection
  - coordinates shared actions and cross-tab refreshes

### Feature areas

- `web/src/features/customers/`
  - managed customer CRUD
  - Popbill actions
  - certificate refresh shortcuts
- `web/src/features/initial-registration/`
  - workbook download/upload
  - quick customer registration from unmatched mail
  - completed billing month flow
- `web/src/features/certificates/`
  - local certificate listing
  - certificate-to-customer linking
  - preflight / prepare / payment-open flows
- `web/src/features/settings/`
  - mail config
  - workspace defaults
  - member management
  - helper status

### Shared frontend files

- `web/src/api.ts`: authenticated fetch layer and active workspace header handling
- `web/src/local-renewal-helper.ts`: browser-to-local-helper bridge calls
- `web/src/types.ts`: client domain contracts
- `web/src/components/ui.tsx`: canonical UI primitives

## 3. Backend Map

### Entry and registration

- `server/src/main.ts`
  - creates app
  - wires middleware
  - registers routes
  - starts optional local scheduler only for local runtime

### Access control and auth

- `server/src/api-access.ts`
  - session resolution
  - active workspace scoping
  - platform admin vs workspace role guards
- `server/src/auth-utils.ts`
- `server/src/auth-user-service.ts`
- `server/src/workspace-admin-service.ts`

### Route groups

- `server/src/routes/core-routes.ts`
  - health
  - public login
  - bootstrap
  - internal job endpoints
- `server/src/routes/customer-popbill-routes.ts`
  - customer CRUD
  - Popbill member actions
- `server/src/routes/draft-routes.ts`
  - draft issue / cancel / print / view
- `server/src/routes/mail-routes.ts`
  - sync and reprocess
- `server/src/routes/settings-routes.ts`
  - workspace settings
  - mail test
  - address resolve
  - import/onboarding endpoints
- `server/src/routes/organization-member-routes.ts`
  - owner-only member management
- `server/src/routes/ops-routes.ts`
  - platform admin workspace management
- `server/src/routes/renewal-routes.ts`
  - local renewal agent snapshot, queueing, heartbeat, preflight

### Core services

- `server/src/supabase-store.ts`
  - main persistence boundary
  - dashboard loading
  - customer, draft, settings, logs, job state
- `server/src/mail-sync.ts`
  - IMAP sync
  - parser invocation
  - address-based customer lookup
- `server/src/mail-reprocess.ts`
  - re-run matching/parsing for existing messages
- `server/src/parser.ts`
  - KEPCO mail parsing
- `server/src/job-queue.ts`
  - recurring job dispatch/run
- `server/src/certificate-monitor.ts`
  - Popbill certificate check and alerting
- `server/src/renewal-automation.ts`
  - local renewal automation queue persistence adapter

### Supporting services

- `server/src/services/customer-import-service.ts`
- `server/src/services/customer-onboarding-import-service.ts`
- `server/src/services/draft-service.ts`
- `server/src/services/popbill-customer-service.ts`
- `server/src/services/renewal-customer-sync.ts`
- `server/src/services/renewal-page-parser.ts`
- `server/src/services/renewal-password.ts`

## 4. Primary Data Flows

### A. Public access portal login to workspace bootstrap

1. Public root renders the customer-only access portal
2. `POST /api/public/login`
3. Supabase session returned to client
4. Client stores active workspace id
5. `GET /api/bootstrap`
6. `SupabaseStore.getDashboard()` returns scoped workspace data

Main coupling:

- `web/src/api.ts`
- `server/src/routes/core-routes.ts`
- `server/src/api-access.ts`
- `server/src/supabase-store.ts`

### B. Mail sync to draft generation

1. User runs manual sync or cron creates `mail-sync` work
2. `server/src/mail-sync.ts` reads IMAP
3. `server/src/parser.ts` extracts KEPCO fields
4. Store resolves customer by normalized address
5. Matching message creates or updates draft
6. Failures create logs and notifications

Important invariant:

- auto-match uses `managed_customer_match_addresses.normalized_match_address`
- `plantNames` is not the primary matching key

### C. Customer onboarding/import

There are two distinct ingestion paths:

1. lightweight CSV/XLSX customer import with column mapping
2. certificate-driven onboarding workbook

Main files:

- `web/src/features/initial-registration/*`
- `server/src/routes/settings-routes.ts`
- `server/src/services/customer-import-service.ts`
- `server/src/services/customer-onboarding-import-service.ts`

### D. Regular draft issuance

1. Draft created from matched mail
2. User issues manually or queue issues automatically
3. Draft routes call Popbill client
4. Draft stores environment and Popbill result

Main files:

- `server/src/routes/draft-routes.ts`
- `server/src/services/draft-service.ts`
- `server/src/popbill-client.ts`

### E. Local certificate / renewal assistance

1. Browser calls local helper for certificate list or payment open
2. Renewal routes queue `bridge-probe`, `certid-probe`, `renewal-preflight`
3. Local renewal agent heartbeats and claims jobs
4. Results persist in `renewal_automation_jobs`
5. UI renders certificate list and preflight state

Main files:

- `web/src/local-renewal-helper.ts`
- `web/src/features/certificates/*`
- `server/src/routes/renewal-routes.ts`
- `server/src/renewal-automation.ts`
- `scripts/renewal-agent.ts`
- `scripts/renewal-local-helper.ts`

## 5. Job Systems

### Business jobs

- storage: `job_queue`
- purpose: mail sync, auto issue, recurring business work
- trigger path: `supabase/functions/job-tick` -> `/api/internal/jobs/dispatch` and `/api/internal/jobs/run`

### Renewal helper jobs

- storage: `renewal_automation_jobs`
- purpose: local certificate diagnostics and preflight analysis
- execution model: local Windows agent heartbeat + claim/complete/fail loop

Do not mix the two systems conceptually when debugging.

## 6. Non-Obvious Invariants

1. Current runtime treats Popbill secrets as server-owned.
   Workspace values are supplemental; env overrides remain authoritative.
2. Current UI exposes `owner` and non-owner behavior, not the full DB role matrix.
3. Public root is a customer-only access portal, not a marketing landing page.
   The only anonymous product action is public login.
4. `public/` is generated output for Vercel static serving.
5. `dist/renewal-local-helper` is generated packaging output, not source.

## 7. Change Impact Guide

If you touch mail parsing:

- update `server/src/parser.ts`
- inspect `server/src/parser.test.ts`
- inspect `server/src/mail-sync.ts`
- inspect address matching assumptions in `server/src/supabase-store.ts`

If you touch workspace roles:

- update `server/src/api-access.ts`
- update relevant route guards
- update `web/src/App.tsx` conditional rendering
- update schema notes in `docs/SUPABASE_SCHEMA_PLAN.md`

If you touch renewal flows:

- update both browser bridge and server queue semantics
- inspect `scripts/renewal-agent.ts`
- inspect `scripts/renewal-local-helper.ts`
- inspect `web/src/features/certificates/CertificatesTab.tsx`
- inspect `docs/CERTIFICATE_RENEWAL_POC.md`

## 8. Current Pain Points

- `web/src/App.tsx` still owns a lot of orchestration state
- `server/src/supabase-store.ts` remains large and central
- role model in DB is broader than role model in product UX
- renewal flow is partially automated but still operationally fragile

See `docs/IMPLEMENTATION_STATUS.md` for active backlog and risk ordering.
