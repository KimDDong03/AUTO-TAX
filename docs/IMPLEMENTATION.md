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

- `/` is a consultation-first access portal.
- Anonymous users can submit a name and phone number through `POST /api/public/consultation-requests`.
- Existing customers who already received an account can still use the secondary login form.
- The anonymous flow does not create Supabase users, workspaces, or collect mail app passwords.

### Logged-in workspace tabs

- `home`
- `issuance`
- `customers`
- `certificates`
- `settings`
- `ops` for platform admins only

`onboarding` is not a persistent top-level tab. The active shell uses a top navigation bar for `home`, `issuance`, `customers`, `certificates`, `settings`, and platform-admin `ops`; onboarding opens as a large modal from the home setup card, settings, or legacy `#onboarding` hash compatibility. The modal keeps setup, first customer registration, first mail sync, exception handling, and first issue confirmation in one task surface.

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
  - certificate-first customer add flow for one-stop customer creation, certificate linking, Popbill join, and Popbill certificate registration retries
  - two-pane customer console with report-detail profile and monthly report history editing
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
  - used for certificate listing, browser-selected NPKI upload-session metadata extraction, local checks, prepare/payment-open support, and local Popbill certificate registration help

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
  - public consultation request intake
  - bootstrap
  - internal job endpoints
- `server/src/routes/customer-popbill-routes.ts`
  - customer CRUD
  - Popbill member actions
  - issue mode transition logging and guards
  - customer report-detail `GET/PUT` endpoints
  - customer contract renewal due/complete endpoints backed by report-detail contract months
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
  - public consultation request review/status updates
  - platform-admin workspace mail/contact setup for 상담 후 개통
- `server/src/routes/renewal-routes.ts`
  - renewal snapshots
  - bridge probes and preflight queueing
  - agent heartbeat, claim, complete, fail endpoints

### Core persistence and services

- `server/src/supabase-store.ts`
  - main persistence boundary for dashboard, customers, customer report details, drafts, settings, logs, and import profiles
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

### A. Public consultation and login

1. Public root renders a consultation request form first and the customer login form second.
2. New prospects post `POST /api/public/consultation-requests` with only `name` and `phone`.
3. Platform admins review requests in ops and change status through `GET/PATCH /api/ops/consultation-requests`.
4. After 상담, an operator uses the existing ops workspace-create flow to create the workspace and first owner account.
5. The platform admin can save the target workspace mail address/app password/contact values from ops and run a mail connection test.
6. Existing customers post `POST /api/public/login`, receive a Supabase session, set the active workspace id, and load `GET /api/bootstrap`.

Main coupling:

- `web/src/api.ts`
- `server/src/routes/core-routes.ts`
- `server/src/routes/ops-routes.ts`
- `server/src/api-access.ts`
- `server/src/supabase-store.ts`

### B. Mail sync to draft generation

1. A user clicks **메일 동기화** from the issuance/onboarding flow, or the monthly job dispatcher creates `mail-sync` work after the configured monthly schedule is reached. The default monthly day is the 20th.
2. `server/src/mail-sync.ts` pulls IMAP messages in a Seoul-calendar received-month range. Manual API calls accept `receivedMonth` or `billingMonth` as `YYYY-MM`; the default is the current KST month.
3. `server/src/parser.ts` extracts KEPCO fields.
4. Store logic resolves the customer by normalized address.
5. Matching mail creates or updates a draft.
6. Failures write logs and leave the message visible for follow-up or reprocess.

Important invariant:

- Auto-match uses `managed_customer_match_addresses.normalized_match_address`.
- `managed_customer_plants` is not the primary match key.
- IMAP date filtering is by received month only. The actual 정산월 remains parser-derived after the message body is read.
- `mail_poll_minutes` is legacy storage only. It must not be used to run five-minute mail collection.

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

- `web/src/App.tsx` for the top navigation shell and onboarding modal compatibility
- `web/src/features/onboarding/*`
- `web/src/features/initial-registration/*`
- `server/src/routes/settings-routes.ts`
- `server/src/services/customer-import-service.ts`
- `server/src/services/customer-onboarding-import-service.ts`
- `server/src/services/customer-onboarding-batch-service.ts`

### C-1. Customer report detail

1. The customer screen shows a left customer selector and a right customer detail pane.
2. The left selector intentionally shows only `corpName` and `customerName`.
3. The right detail pane reads `GET /api/customers/:id/report-detail?year=YYYY` on demand.
4. Operators edit report profile fields and 12 monthly rows, then save through `PUT /api/customers/:id/report-detail`.
5. Contract end month is derived as the same month one year after the contract start month.
6. The monthly total is calculated in app code as `supplyAmount + vatAmount`; it is not stored.
7. Home contract-renewal alerts read customers whose derived contract end month is this month or earlier.
8. Completing a contract renewal advances the start month to the previous end month plus one month and derives the new end month from that new start month.

Main files:

- `web/src/features/customers/CustomersTab.tsx`
- `web/src/features/customers/useCustomerReportDetail.ts`
- `web/src/features/customers/customerReportDetail.ts`
- `server/src/routes/customer-popbill-routes.ts`
- `server/src/customer-report-detail.ts`
- `server/src/customer-contract-renewals.ts`
- `server/src/supabase-store.ts`
- `docs/SUPABASE_SCHEMA_PLAN.md`

### D. Draft issuance and pilot reporting

1. A draft is created from matched mail.
2. The issuance screen can render a source-derived mail preview image through `GET /api/drafts/:id/mail-preview-image` using the draft's stored `inbox_messages.raw_source`.
3. The issuance screen also synthesizes current-month `메일 미수신` rows for managed customers that have no draft or matched mail for the current billing month.
4. The draft is issued manually or scheduled for auto issue.
5. Route and job code call the Popbill client.
6. Draft state, result payloads, and audit signals are persisted.
7. Pilot reporting reads `app_logs` and `invoice_drafts` without a separate metrics table.
8. Customer Popbill join failures shown to workspace users use support-contact copy, while raw Popbill cause, code, and operation stay in `app_logs.context_json` for the platform-admin `ops` screen.

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
- Browser-selected NPKI files for manual customer add are posted only to the `127.0.0.1` helper upload-session endpoint; the app server receives customer fields and certificate metadata only.
- Onboarding preview and batch persistence strip workbook `certificatePassword` before DB write.
- `renewal_automation_jobs.submission_profile_json` strips `issuePassword` at rest and only rehydrates it for the agent claim path.
- `app_logs`, API errors, and helper responses mask password-like values and local certificate paths.
- `/api/*` and helper responses send `Cache-Control: no-store`.

## 6. Job Systems

### Business jobs

- Storage: `job_queue`
- Purpose: mail sync, auto issue, certificate checks, other recurring business work
- Trigger path: `supabase/functions/job-tick` -> internal API endpoints
- `mail-sync` dispatch is monthly, defaulting to the 20th, and is separate from the manual **메일 동기화** button.

### Renewal helper jobs

- Storage: `renewal_automation_jobs`
- Purpose: local certificate diagnostics and renewal preflight
- Execution model: Windows renewal agent heartbeat plus claim/complete/fail loop

Do not debug these two systems as if they were one queue.

## 7. Non-Obvious Invariants

1. Popbill runtime values are server-owned.
   Workspace settings are supplemental. `AUTO_TAX_POPBILL_*` env values remain authoritative for credentials, mode, customer user-id prefix, and the shared new-customer password. Customer workspace browsers must not read or edit the prefix/shared password values.
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
