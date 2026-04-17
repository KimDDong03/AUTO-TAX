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
  - emits a separate customer-setting audit log when `issueMode` changes (`review <-> auto`) so auto-issuance enable/disable history remains queryable through `app_logs`
  - blocks `review -> auto` on the server unless the customer already has same-organization successful issuance evidence (`app_logs.context_json.eventType = manual-issue-succeeded`) or a legacy `invoice_drafts.status = issued`
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

Phase 1 pilot instrumentation lives alongside this flow:

- `server/src/mail-sync.ts`
  - writes `draft-created`
  - writes `auto-issue-scheduled` when a matched `auto` customer draft is created as `scheduled`
  - writes structured `errorCategory` values for `parse`, `customer-match`, `draft-create`
- `server/src/mail-reprocess.ts`
  - writes structured `errorCategory` values for `parse`, `customer-match`, `draft-create`, `mail-sync` on the reprocess path
  - writes `draft-created` with `draftSource: "mail-reprocess"` when unmatched mail is successfully reprocessed into a draft
- `server/src/routes/draft-routes.ts`
  - writes `manual-issue-clicked`, `manual-issue-succeeded`, `manual-issue-failed`
  - manual issue logs now reuse `app_logs.actor_user_id` + `app_logs.organization_id` + `created_at`; `context_json` carries `executionPath`, `clickedAt`, `issuedAt`, and an `issuanceSnapshot` on `manual-issue-succeeded` for the Phase 2 audit slice
  - writes `draft-preview-opened` when the web UI explicitly POSTs `/api/drafts/:id/pilot-preview-opened`
  - review-mode preview events can carry a `previewSnapshot` with the same minimal value shape as `issuanceSnapshot`, allowing timeline/context-based comparison without response-shape changes
  - `GET /api/drafts/:id/pilot-timeline` keeps `actorUserId` at the entry level while leaving `clickedAt`, `issuedAt`, `previewSnapshot`, and `issuanceSnapshot` inside the existing `context`
  - `GET /api/drafts/pilot-report` now returns summary metrics plus weekly/monthly buckets, customer transition evidence, failure Top N, and time-savings estimates; `format=csv` exports the same report without a new reporting stack
  - exposes `GET /api/drafts/pilot-report` and `GET /api/drafts/:id/pilot-timeline`
- `server/src/job-queue.ts`
  - writes `auto-issue-started`, `auto-issue-succeeded`, `auto-issue-failed`
- `server/src/pilot-issuance.ts`
  - normalizes `app_logs.context_json`
  - infers/falls back to the Phase 1 error taxonomy where older logs do not have explicit buckets
  - calculates the pilot report metrics on the server side
- `server/src/api-access.ts`, `server/src/routes/renewal-routes.ts`, `server/src/certificate-monitor.ts`, `server/src/main.ts`
  - now write explicit `errorCategory` values for `auth/session`, `certificate/local-helper`, `external-api`
- `server/src/services/popbill-customer-service.ts`
  - now writes explicit `external-api` + `errorOperation` context for Popbill auto-join retry/failure paths

Structured pilot log context uses `app_logs.organization_id` plus `context_json` keys such as:

- `eventType`
- `draftId`
- `customerId`
- `issueMode`
- `errorCategory`
- `draftSource`
- `pipeline`
- `previewSource`
- `status`
- `errorCode`
- `errorOperation`
- `syncStage`
- `reprocessStage`
- `retryReason`
- `executionPath`
- `clickedAt`
- `issuedAt`
- `previewSnapshot`
- `issuanceSnapshot`

Main files:

- `server/src/routes/draft-routes.ts`
- `server/src/services/draft-service.ts`
- `server/src/popbill-client.ts`
- `server/src/pilot-issuance.ts`

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

Security boundary for this flow:

- server does not store or re-display Hometax ID/PW, raw certificate files, or certificate passwords
- onboarding preview/batch persistence strips workbook `certificatePassword` before DB write
- `renewal_automation_jobs` stores contact/comparison context, but strips `submissionProfile.issuePassword` at rest and only rehydrates it for the agent claim path
- `app_logs`, API error bodies, and local-helper error responses mask password/secret/cert-path-like values
- `/api/*` and local-helper responses send `Cache-Control: no-store`

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

## 9. Pilot report calculation notes

Current Phase 5 pilot report shape is returned by `GET /api/drafts/pilot-report`.

- `autoDraftCreationSuccessRate`
  - `draft-created` from `mail-sync`
  - divided by `draft-created + parse/customer-match/draft-create` exceptions from `mail-sync`
- `finalIssueSuccessRate`
  - `manual-issue-succeeded + auto-issue-succeeded`
  - divided by all manual/auto final issuance successes + failures
- `exceptionRate`
  - `(mail-sync draft generation exceptions + final issuance failures)`
  - divided by `(draft generation attempts + final issuance attempts)`
- `periodBuckets.weekly` / `periodBuckets.monthly`
  - group the already-filtered log window by UTC calendar week / month
  - reuse the same success-rate / exception-rate math per bucket
- `customerSummaries`
  - join current customer catalog state with pilot logs
  - expose current `issueMode`, manual/auto success·failure counts, last failure drill-down, and whether successful issuance evidence already exists for `review -> auto`
- `topFailureTypes`
  - rank failures by `errorCategory -> errorOperation -> errorCode -> limited message bucket`
  - keep the latest `draftId` / timeline path so operators can compare the aggregate row with the raw event stream
- `timeSavings`
  - assumes one successful auto issuance saves 10 operator minutes
  - reports total saved minutes / hours for the selected window
- `drilldown`
  - `timelinePathTemplate` and memo-comparison guidance point operators from the aggregate report back to `GET /api/drafts/:id/pilot-timeline`

`draft-preview-opened` is now recorded from the web UI's explicit preview button click via `POST /api/drafts/:id/pilot-preview-opened`.
It is more precise than the earlier backend `view-url` approximation, but it still represents the user action, not a guaranteed Popbill DOM render completion signal.

See `docs/IMPLEMENTATION_STATUS.md` for active backlog and risk ordering.
