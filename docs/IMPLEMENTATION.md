# AUTO-TAX Implementation Map

This document is the developer-facing architecture map. It explains where behavior lives, how the major flows move through the system, and which files are tightly coupled.
It is not a visual design guide or UI/UX rulebook. Layout, styling, and information architecture can be redesigned without treating this file as a constraint.

## 1. System Shape

AUTO-TAX currently has four runtime surfaces:

1. React web app in `web/`
2. Express API in `server/`
3. Supabase PostgreSQL + Auth + Edge Function in `supabase/`
4. Windows local helper and renewal agent in `scripts/`

The product is multi-tenant. A logged-in session always operates against one active workspace.

## 2. Current Runtime Shape

### Public surface

- `/` is a customer access portal.
- The anonymous flow is public login and recovery follow-up, not a broad marketing site.

### Logged-in workspace tabs

- `onboarding`
- `home`
- `customers`
- `certificates`
- `settings`
- `ops` for platform admins only

### Runtime truth

- Current role behavior is mainly `owner` versus non-owner member.
- Mail-to-customer matching is address-first.
- Renewal support assists operators but does not complete the full lifecycle unattended.

## 3. Frontend Map

### Shell and shared state

- `web/src/App.tsx`
  - bootstraps auth, workspace, and dashboard state
  - owns tab selection and some remaining cross-feature orchestration
  - still contains more state than we want long term
- `web/src/api.ts`
  - authenticated fetch layer
  - active workspace header handling
- `web/src/types.ts`
  - client domain contracts
- `web/src/components/ui.tsx`
  - canonical UI primitives such as `Panel`, `AppDialog`, and shared status widgets

### Feature areas

- `web/src/features/public/`
  - customer access portal content
- `web/src/features/onboarding/`
  - guided workspace setup flow
- `web/src/features/customers/`
  - managed customer CRUD
  - customer state, notes, and Popbill actions
- `web/src/features/certificates/`
  - certificate listing and customer linking
  - newer split screen model for certificate operations
- `web/src/features/renewal/`
  - renewal diagnostics, summaries, and helper-facing client logic
- `web/src/features/settings/`
  - mail config, defaults, member management, helper status
  - newer split screen model for settings
- `web/src/features/initial-registration/`
  - workbook download/upload
  - preview and commit flow
  - follow-up automation for certificate registration

### Browser-to-local boundary

- `web/src/local-renewal-helper.ts`
  - talks to the Windows helper running on the operator machine
  - used for certificate listing, local checks, prepare/payment-open support, and local Popbill certificate registration help

## 4. Backend Map

### Entry and app setup

- `server/src/main.ts`
  - creates the Express app
  - wires middleware and auth guards
  - registers routes
  - starts the local scheduler for non-serverless runtime
- `api/index.ts`
  - Vercel entrypoint

### Auth and access control

- `server/src/api-access.ts`
  - request session resolution
  - active workspace scoping
  - owner/editor/admin guards
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
  - issue mode transition logging and guards
- `server/src/routes/draft-routes.ts`
  - manual issue, cancel, preview, print, pilot reporting
- `server/src/routes/mail-routes.ts`
  - sync and reprocess
- `server/src/routes/settings-routes.ts`
  - workspace defaults
  - mail test
  - import/onboarding endpoints
- `server/src/routes/organization-member-routes.ts`
  - owner-only member management
- `server/src/routes/ops-routes.ts`
  - platform admin workspace management and ops console data
- `server/src/routes/renewal-routes.ts`
  - renewal snapshots
  - bridge probes and preflight queueing
  - agent heartbeat, claim, complete, fail endpoints

### Core persistence and services

- `server/src/supabase-store.ts`
  - main persistence boundary for dashboard, customers, drafts, settings, logs, and import profiles
- `server/src/mail-sync.ts`
  - IMAP sync
  - parser invocation
  - address-based customer lookup
- `server/src/mail-reprocess.ts`
  - re-run parse and match for stored messages
- `server/src/parser.ts`
  - KEPCO mail parsing
- `server/src/job-queue.ts`
  - recurring business job dispatch and execution
- `server/src/renewal-automation.ts`
  - renewal heartbeat snapshots and local job queue persistence
- `server/src/pilot-issuance.ts`
  - pilot report aggregation over `app_logs` and `invoice_drafts`
- `server/src/certificate-monitor.ts`
  - certificate expiration checks and alerts

### Supporting services

- `server/src/services/customer-import-service.ts`
  - lightweight mapped import flow
- `server/src/services/customer-onboarding-import-service.ts`
  - workbook row normalization and write helpers
- `server/src/services/customer-onboarding-batch-service.ts`
  - preview persistence
  - async commit batches
  - per-row batch status
- `server/src/services/draft-service.ts`
- `server/src/services/popbill-customer-service.ts`
- `server/src/services/renewal-customer-sync.ts`
- `server/src/services/renewal-page-parser.ts`
- `server/src/services/renewal-password.ts`

## 5. Primary Flows

### A. Public login to workspace bootstrap

1. Public root renders the customer access portal.
2. Client posts `POST /api/public/login`.
3. Supabase session is returned to the browser.
4. Client sets the active workspace id.
5. Client loads `GET /api/bootstrap`.
6. `SupabaseStore.getDashboard()` returns scoped workspace data.

Main coupling:

- `web/src/api.ts`
- `server/src/routes/core-routes.ts`
- `server/src/api-access.ts`
- `server/src/supabase-store.ts`

### B. Mail sync to draft generation

1. A user or cron run creates `mail-sync` work.
2. `server/src/mail-sync.ts` pulls mail from IMAP.
3. `server/src/parser.ts` extracts KEPCO fields.
4. Store logic resolves the customer by normalized address.
5. Matching mail creates or updates a draft.
6. Failures write logs and leave the message visible for follow-up or reprocess.

Important invariant:

- Auto-match uses `managed_customer_match_addresses.normalized_match_address`.
- `managed_customer_plants` is not the primary match key.

### C. Onboarding and import

There are two distinct ingestion paths:

1. lightweight CSV/XLSX customer import with column mapping
2. certificate-driven onboarding workbook with preview and async commit

Main endpoints:

- `POST /api/customer-import/preview`
- `POST /api/customer-import/commit`
- `POST /api/customer-onboarding/preview`
- `POST /api/customer-onboarding/commit`
- `GET /api/customer-onboarding/batches/:batchId`
- `POST /api/customer-onboarding/follow-up/run`

Main files:

- `web/src/features/onboarding/*`
- `web/src/features/initial-registration/*`
- `server/src/routes/settings-routes.ts`
- `server/src/services/customer-import-service.ts`
- `server/src/services/customer-onboarding-import-service.ts`
- `server/src/services/customer-onboarding-batch-service.ts`

### D. Draft issuance and pilot reporting

1. A draft is created from matched mail.
2. The draft is issued manually or scheduled for auto issue.
3. Route and job code call the Popbill client.
4. Draft state, result payloads, and audit signals are persisted.
5. Pilot reporting reads `app_logs` and `invoice_drafts` without a separate metrics table.

Main files:

- `server/src/routes/draft-routes.ts`
- `server/src/services/draft-service.ts`
- `server/src/job-queue.ts`
- `server/src/pilot-issuance.ts`
- `server/src/popbill-client.ts`

### E. Local certificate and renewal assistance

1. The browser talks to the local helper for certificate list and local actions.
2. Renewal routes queue `bridge-probe`, `certid-probe`, or `renewal-preflight`.
3. The Windows renewal agent heartbeats and claims queued jobs.
4. Results persist in `renewal_automation_jobs`.
5. The UI renders helper state, certificate state, and preflight summaries.

Main files:

- `web/src/local-renewal-helper.ts`
- `web/src/features/certificates/*`
- `web/src/features/renewal/*`
- `server/src/routes/renewal-routes.ts`
- `server/src/renewal-automation.ts`
- `scripts/renewal-local-helper.ts`
- `scripts/renewal-agent.ts`

Security boundary for this flow:

- The server must not persist or re-display Hometax credentials, raw certificate files, or certificate passwords.
- Onboarding preview and batch persistence strip workbook `certificatePassword` before DB write.
- `renewal_automation_jobs.submission_profile_json` strips `issuePassword` at rest and only rehydrates it for the agent claim path.
- `app_logs`, API errors, and helper responses mask password-like values and local certificate paths.
- `/api/*` and helper responses send `Cache-Control: no-store`.

## 6. Job Systems

### Business jobs

- Storage: `job_queue`
- Purpose: mail sync, auto issue, certificate checks, other recurring business work
- Trigger path: `supabase/functions/job-tick` -> internal API endpoints

### Renewal helper jobs

- Storage: `renewal_automation_jobs`
- Purpose: local certificate diagnostics and renewal preflight
- Execution model: Windows renewal agent heartbeat plus claim/complete/fail loop

Do not debug these two systems as if they were one queue.

## 7. Non-Obvious Invariants

1. Popbill secrets are server-owned at runtime.
   Workspace settings are supplemental. `AUTO_TAX_POPBILL_*` env values remain authoritative.
2. UI roles are narrower than DB roles.
   The DB still stores `owner/admin/operator/viewer`, but product behavior is mostly owner versus member.
3. The public root is not a general landing page.
   Anonymous behavior should stay tightly scoped to access portal flows.
4. `public/` is generated output for Vercel builds.
5. `dist/renewal-local-helper/` is packaging output, not source.

## 8. Change Impact Guide

If you touch mail parsing or matching:

- update `server/src/parser.ts`
- inspect `server/src/parser.test.ts`
- inspect `server/src/mail-sync.ts`
- inspect `server/src/mail-reprocess.ts`
- inspect `server/src/supabase-store.ts`
- inspect `docs/SUPABASE_SCHEMA_PLAN.md`

If you touch onboarding or import:

- inspect `web/src/features/onboarding/*`
- inspect `web/src/features/initial-registration/*`
- inspect `server/src/routes/settings-routes.ts`
- inspect `server/src/services/customer-import-service.ts`
- inspect `server/src/services/customer-onboarding-import-service.ts`
- inspect `server/src/services/customer-onboarding-batch-service.ts`
- inspect onboarding tables in `docs/SUPABASE_SCHEMA_PLAN.md`

If you touch workspace roles or membership:

- update `server/src/api-access.ts`
- update relevant route guards
- update `web/src/App.tsx` conditional rendering
- update schema notes in `docs/SUPABASE_SCHEMA_PLAN.md`

If you touch renewal flows:

- update both browser helper calls and server queue semantics
- inspect `scripts/renewal-agent.ts`
- inspect `scripts/renewal-local-helper.ts`
- inspect `web/src/features/certificates/*`
- inspect `web/src/features/renewal/*`
- inspect `docs/OPERATIONS.md`

If you touch internal jobs or retention:

- inspect `supabase/functions/job-tick`
- inspect `server/src/job-queue.ts`
- inspect `server/src/maintenance-retention.ts`
- inspect retention tables in `docs/SUPABASE_SCHEMA_PLAN.md`

## 9. Current Pressure Points

- `web/src/App.tsx` still owns too much orchestration state
- `server/src/supabase-store.ts` remains large and central
- DB role breadth is larger than the current UX model
- Renewal assistance is useful but still operationally fragile
