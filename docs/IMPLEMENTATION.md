# AUTO-TAX Implementation Map

Status: canonical_runtime.

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
- Public legal policy screens are served inside the portal with `#terms`, `#privacy`, and `#third-party`.
- Anonymous users can submit consultation/contact inquiries through `POST /api/public/consultation-requests` and `POST /api/public/contact-inquiries`.
- Public signup requests collect login, organization, representative, business-registration, contact, the customer's own KEPCO mail receiving address, phone/email verification, and required consents. Approval creates the owner workspace and seeds signup-derived workspace defaults; KEPCO mail password setup and internal notification recipients are configured separately.
- Existing customers who already received an account can still use the secondary login form.
- The anonymous signup flow creates a pending Supabase user but does not collect mail app passwords.

### Logged-in workspace tabs

- `home`
- `issuance`
- `customers`
- `settings`
- `ops` for platform admins only

`onboarding` is not a persistent top-level tab for an active workspace. The active shell uses a top navigation bar for `home`, `issuance`, `customers`, `settings`, and platform-admin `ops`; legacy `#onboarding` routing resolves into the settings onboarding section. Certificate operations are not a separate top-level tab; home alerts, settings helper links, and legacy `#certificates` routing send users to the customer tab's certificate-focused customer filter. The onboarding content keeps setup, first customer registration, first mail sync, exception handling, and first issue confirmation in one task surface.

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
  - customer-integrated certificate expiration, certificate linking, renewal preparation, and payment entry flows
- `web/src/features/certificates/`
  - shared certificate-listing/model helpers for customer-integrated certificate views
  - no active top-level certificate page
- `web/src/features/renewal/`
  - renewal diagnostics, summaries, and helper-facing client logic
- `web/src/features/settings/`
  - mail config, defaults, member management, helper status
  - newer split screen model for settings
- `web/src/features/initial-registration/`
  - certificate-driven initial registration checklist UI
  - preview and commit flow
  - follow-up automation for certificate registration

### Browser-to-local boundary

- `web/src/local-renewal-helper.ts`
  - talks to the Windows helper running on the operator machine
  - used for certificate listing, browser-selected NPKI/P12/PFX upload-session metadata extraction/import, local checks, prepare/payment-open support, and local Popbill certificate registration help
  - keeps helper reachability, certificate-listing readiness, and SignGate/SecuKit renewal bridge diagnostics as separate signals so UI certificate reads do not depend on raw `14315/14319` TCP probe status
  - certificate listing prefers the HomeTax ML4Web flow: read `ML4Web_Config.js`, follow the configured storage order, and call MagicLine `GetCertList` with the same lowercase `hdd` plus root `hddOpt` option shape that HomeTax uses. It decodes local bridge response bodies from raw bytes so Korean CP949/EUC-KR certificate names stay readable, then falls back to SignGate/SecuKit storage probes when needed. Exported `.p12`/`.pfx` files and arbitrary folders are not auto-scanned; initial registration adds user-selected missing files/folders only through the explicit upload-session action and imports selected candidates into bridge-readable storage only when preview needs HomeTax identity lookup.
- `scripts/hometax-business-info.ts`
  - owns the HomeTax business identity lookup flow used by initial registration
  - keeps the HomeTax browser session, ML4Web signing, HomeTax login/session handoff, taxpayer-basic address lookup, and address parser in one module
  - receives bridge-readable ML4Web certificate candidates from `scripts/renewal-agent.ts` through a narrow dependency-injected handler, so SignGate renewal diagnostics and HomeTax address lookup do not share orchestration code

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
  - owner-only customer-company withdrawal; joined customer Popbill memberships are withdrawn before the workspace is churned and member access is removed
- `server/src/routes/ops-routes.ts`
  - platform admin workspace management and ops console data
  - public consultation request review/status updates
  - public signup approval, owner workspace creation, and signup-derived contact/mail defaults
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

### A. Public consultation, signup, and login

1. Public root renders a consultation request form first and the customer login form second.
2. New prospects post `POST /api/public/consultation-requests` or `POST /api/public/contact-inquiries`; the current storage supports name, phone, category, message, email, region, and request metadata.
3. Platform admins review requests in ops and change status through `GET/PATCH /api/ops/consultation-requests`.
4. Public signup requests verify phone/email, then post `POST /api/public/signup`, creating a pending auth user and signup request.
5. Platform admins approve signup requests through `POST /api/ops/signup-requests/:id/approve`, which creates or links the owner workspace and seeds the KEPCO receiving mail address.
6. The platform admin can still save or override the target workspace mail app password from ops and run a mail connection test.
7. Existing customers post `POST /api/public/login`, receive a Supabase session, set the active workspace id, and load `GET /api/bootstrap`.

Signup email invariant:

- The `한전 메일 수신 주소` field is the customer's actual KEPCO receiving mailbox that AUTO-TAX will later read for that workspace.
- Signup email verification sends the code to that customer-entered mailbox. It is not a verification of the AUTO-TAX sender mailbox.
- `AUTO_TAX_SIGNUP_EMAIL_FROM` / `AUTO_TAX_SIGNUP_SMTP_USER` are service-owned sender credentials only, for example `auto-tax@kiyo.kr`; they must not be treated as the customer signup email unless the customer truly owns and uses that mailbox.

Main coupling:

- `web/src/api.ts`
- `server/src/routes/core-routes.ts`
- `server/src/routes/ops-routes.ts`
- `server/src/api-access.ts`
- `server/src/supabase-store.ts`

### B. Mail sync to draft generation

1. A user clicks **메일 동기화** from the issuance/onboarding flow.
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
2. certificate-driven initial registration with an in-app checklist, preview, and async commit

Initial registration flow:

1. The setup helper step downloads/checks AT helper and exposes the primary "공동인증서 읽기" action next to the helper status check. Its status summary shows only the non-expired issue-capable total to avoid exposing certificate-purpose distinctions to operators; expired and personal-use certificates are excluded from that count.
2. That read action reads standard bridge-backed NPKI storage through `/api/certificates`, matching the HomeTax-style local certificate list path. It always bypasses the helper's previous certificate-list cache and replaces the in-memory initial-registration candidate set with the freshly read NPKI result. Certificates that already exist in the customer certificate registry are excluded before the candidate checklist is built, using serial/userDN first and conservative issuer/expiry/OID metadata only when those strong identifiers are unavailable.
3. The customer initial registration step treats the read result only as a candidate list. Rows start unselected, and certificate source refreshes or manual file/folder appends reset checklist selection so the operator must explicitly select managed customers before preview/registration. Any candidate-list or selected-certificate preparation change invalidates the previous preview/commit state, and the UI blocks commit if the last checked certificate count no longer matches the selected checklist. The checklist supports row-click toggles, Shift range selection, Ctrl/Meta additive selection, and selected-row deletion; deleted candidates are removed from the in-memory candidate set so later manual uploads append to the remaining list instead of reviving removed rows.
4. Certificates outside the bridge-backed list are an exception path. File/folder selection is hidden behind the collapsed "missing certificate" action, goes through `/api/certificates/upload-session`, and appends issue-capable NPKI `signCert.der`/`signPri.key` pairs or `.p12`/`.pfx` metadata to the in-memory checklist without removing the bridge-read candidates. If the same certificate is already present from the bridge/NPKI read or already registered to a customer, the upload-session copy is excluded and the bridge-readable row is kept when applicable.
5. The UI keeps the checklist as the primary surface: the customer initial-registration step uses a compact active-step header and one candidate workspace rather than stacked status cards. The workspace shows only read/selected counts, bulk selection/delete actions, the shared password field, the selected-customer check action, and a table with target checkbox, read-only customer-facing company name, and optional per-certificate password. The candidate table owns its vertical scroll area so long certificate lists remain visibly scrollable inside the work surface. Routine status cards and generic success notices are hidden on this selection step.
6. During target check, file/folder-added candidates are prepared for the bridge-backed lookup path instead of using paid certificate-registration APIs: NPKI pairs are copied into the standard LocalLow NPKI store, while `.p12`/`.pfx` files are imported through SecuKit NXS `CertManagement.importP12` using the entered certificate password. The import path warms SecuKit's normal HDD storage selection before `importP12`, then re-reads the bridge certificate list and swaps the upload-session candidate for the bridge-backed certificate index.
7. Bridge-supported certificates use the unified certificate business-info lookup route (`/api/certificates/business-info` or batch). The route tries the SignGate renewal information snapshot first because that path can return the business number, company name, representative, industry fields, and address for most issue-capable certificates without requiring a HomeTax account. If SignGate returns a certificate/provider boundary such as "not renewable", missing SignGate issue information, or storage-media information missing for a certificate that is still bridge-readable through HomeTax ML4Web, the helper tries the HomeTax business-info lookup as a secondary path. Password failures, expired certificates, missing bridge certificate indexes, and explicit certificate-selection failures do not fall through to HomeTax because those are operator/action errors rather than provider coverage gaps. The older `/api/hometax/business-info` route remains available only as a diagnostic HomeTax-only endpoint.
8. The HomeTax secondary branch no longer falls back to YESKEY/yessign subscriber-info lookup. The HomeTax branch first uses HomeTax MagicLine4NX directly against the local `127.0.0.1:42235` service: `Sign`, `GetCertString`, and `GetVIDRandom` are called with the bridge HDD/NPKI storage index, the raw `pkcEncSsn$serial$yyyyMMddHHmmss$signature` value is wrapped with the same UTF-8 Base64 layer that HomeTax's ML4Web UI callback returns, and the result is posted to portal `pubcLogin.do`. If the direct path cannot produce login material or HomeTax rejects it, the helper falls back to the HTML5 ML4Web UI path (`ntsCertAuth`, certificate-frame selection, `tranx2PEM`, `getRandomfromPrivateKey`). After login success it reads HomeTax's `/permission.do` session map, using the `/token.do` portal handoff when HomeTax requires that extra session step. When a business number is available, the helper opens HomeTax's common taxpayer-basic WebSquare screen (`/ui/comm/a/b/UTEABHAA19.xml` on `hometax.go.kr`), injects the authenticated session map into the page session store, resolves the screen's live `$p.main().$p` work scope, and runs the taxpayer-basic and business-basic lookup paths (`ATTABZAA001R01`/`ATTABZAA001R02` via `nts_loadBizCd`) used by HomeTax common screens so address fields can be merged from the business profile response.
9. Certificate business-info lookup uses a helper-owned job pipeline. The initial-registration UI sends selected rows to `/api/certificates/business-info-jobs`, polls the job state, and displays helper-reported progress instead of owning provider concurrency itself. The helper exposes `/api/certificates/business-info-capabilities` for the active policy, keeps the legacy `/api/certificates/business-info-batch` route as a compatibility path, and runs SignGate-first lookups with adaptive default concurrency 16. Only provider-boundary failures are queued into the HomeTax secondary phase with default concurrency 5. Password failures, missing certificate indexes, expired certificates, and explicit selection failures stay in the SignGate phase result so operators see the real action item instead of a misleading HomeTax fallback. SignGate concurrency is lowered temporarily only for transient connection/timeout-style failures and recovers after stable batches; password/provider/account failures do not affect the throttle. HomeTax certificate login material is normally produced without opening the ML4Web certificate frame; the frame is still treated as single-lane global state when that fallback path is needed. The helper keeps the HomeTax Playwright browser process warm while the helper is running and opens isolated browser contexts only for fallback certificate-frame signing or taxpayer-basic address lookup. If the native certificate dialog does not open at all, only that dialog-open step is retried once with a fresh page; password, signing, login, and taxpayer lookup failures remain fail-closed. If the taxpayer-basic screen returns identity data without address fields, the helper reopens only that screen once with the same authenticated HomeTax session to wait for the address-bearing response.
10. Initial-registration certificate registration keeps registration URL lifetime in the web layer. Popbill certificate-registration URLs are one-time, short-lived links, so the UI does not pre-create a whole batch of URLs. It prepares selected customer/certificate pairs without URLs, then requests a fresh registration URL immediately before each row calls the helper's single `/api/popbill/certificate-registration` route. The helper's `auto` mode and helper-owned `/api/popbill/certificate-registration-jobs` route both attempt the browserless Popbill MagicLine4NX direct path first: the helper reads the current HDD/NPKI certificate list from the local `127.0.0.1:42235` service, matches the selected certificate by serial/userDN or CN plus expiry, builds the same certificate payload that the Popbill ML4Web popup posts, exchanges the fresh popup token, and posts directly to `/__API_V1__/Taxinvoice/Preference/Certificate`. Operator-action failures such as wrong password, expired certificate, expired registration URL, or business-number mismatch stay failed. If the direct path cannot use the popup token or local direct invocation shape on a given PC, the helper falls back to the existing browser automation path. The UI's row retry path also moves from explicit `direct` to explicit `headless` compatibility mode so it does not repeat a failed direct attempt with a fresh URL. The helper still owns the one-row browser/context lifetime, certificate-frame matching, and per-row failure capture for that compatibility path. Headless registration uses a fresh temporary Chrome profile and removes it after close. If headless Chrome cannot expose the ML4Web certificate-selection frame, or if an expired-token signal is detected, the UI requests a new registration URL and retries that same row once in visible compatibility mode through the same helper route. `AUTO_TAX_POPBILL_HELPER_HEADLESS=0` still forces headed compatibility mode for PCs where ML4Web cannot work headlessly, and explicit `AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR` keeps persistent-profile behavior for manual troubleshooting. Helper-owned certificate-registration jobs default to five concurrent rows and cap at five because local testing confirmed five simultaneous MagicLine4NX direct calls succeeded while six simultaneous calls can produce a loopback connection refusal.
11. If business-info lookup returns taxpayer identity but no business or matching address even after the taxpayer-basic lookup path, customer preview stays importable and shows a supplement warning. The address lookup remains required for KEPCO mail matching, so missing-address customers need address completion in customer management before automatic mail matching can work. When the HomeTax taxpayer-basic helper call failed, the target-check review message includes that lookup detail so operators can distinguish a true missing address from a lookup-path problem.
12. If the unified business-info lookup fails after it was attempted, initial registration surfaces that business-info/manual-information failure and does not fall through to the legacy SignGate renewal preflight path. SignGate preflight remains a renewal diagnostic path for renewal/payment operations. If a selected upload-session certificate cannot be imported or matched back to the bridge list, preview fails that row with an actionable message instead of silently using incomplete data.
13. Preview and commit still use the server customer-onboarding endpoints and async batch flow.

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

Operational invariants:

- Certificate-driven onboarding and one-stop customer add use only non-expired issue-capable certificates: electronic-tax certificates and business/enterprise/corporate general certificates. Personal general and unknown certificates are hidden from customer registration candidate lists and ignored at the server import boundary. Expired certificates are filtered before checklist generation/preflight and block customer creation, Popbill join, and Popbill certificate registration.
- Follow-up Popbill certificate registration only targets customers whose Popbill join state is `joined`; pending or failed join customers are skipped until join completes.

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

### C-2. Customer-company withdrawal

1. Owners start withdrawal from the settings account section and must type the current workspace name plus `회원탈퇴`.
2. `POST /api/organization/withdraw` verifies owner access and the confirmation text.
3. All managed customers with `popbillState = joined` are withdrawn from Popbill first. Already-missing Popbill members are treated as handled, but any other Popbill failure returns `409` and stops workspace withdrawal.
4. After Popbill targets are handled, open `job_queue` rows for the workspace are marked `cancelled`, the organization status becomes `churned`, and all organization memberships are deleted.
5. Auth users are deleted only when they belong to no other organization and are not listed in `AUTO_TAX_OPS_EMAILS`; retained users lose this workspace access through membership deletion.
6. Churned organizations are filtered out of authenticated workspace membership resolution, so stale membership rows cannot keep a withdrawn workspace selectable.

Main files:

- `web/src/App.tsx`
- `web/src/features/settings/SettingsAccountSection.tsx`
- `server/src/routes/organization-member-routes.ts`
- `server/src/supabase.ts`
- `server/src/popbill-client.ts`

### D. Draft issuance and pilot reporting

1. A draft is created from matched mail.
2. The issuance screen can render a source-derived mail preview image through `GET /api/drafts/:id/mail-preview-image` using the draft's stored `inbox_messages.raw_source`.
3. The issuance screen also synthesizes current-month `메일 미수신` rows for managed customers that have no draft or matched mail for the current billing month.
4. The draft stays in review until a logged-in user issues it from the issuance screen.
5. Route code calls the Popbill client for user-triggered issuance.
6. After successful issuance, the optional customer-specific `issue_complete_sms_template` is rendered for the Popbill `SendXMS` issue-complete message. Blank uses the default template. Rendered content must remain within Popbill LMS `2,000byte`.
7. Draft state, result payloads, and audit signals are persisted.
8. Pilot reporting reads `app_logs` and `invoice_drafts` without a separate metrics table.
9. Customer Popbill join failures shown to workspace users use support-contact copy, while raw Popbill cause, code, and operation stay in `app_logs.context_json` for the platform-admin `ops` screen.

Main files:

- `server/src/routes/draft-routes.ts`
- `server/src/services/draft-service.ts`
- `server/src/job-queue.ts`
- `server/src/pilot-issuance.ts`
- `server/src/popbill-client.ts`

### E. Local certificate and renewal assistance

1. The browser talks to the local helper for certificate list, certificate business-info lookup, and local actions.
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
- Browser-selected NPKI/P12/PFX files for manual customer add and initial-registration missing-certificate selection are posted only to the `127.0.0.1` helper upload-session endpoint; the app server receives customer fields and certificate metadata only. The helper keeps upload-session material in local memory with a short TTL and writes/imports only the operator-selected initial-registration candidates needed for bridge-backed HomeTax lookup.
- Onboarding preview and batch persistence strip checklist/workbook `certificatePassword` before DB write.
- `renewal_automation_jobs.submission_profile_json` strips `issuePassword` at rest and only rehydrates it for the agent claim path.
- `app_logs`, API errors, and helper responses mask password-like values and local certificate paths.
- `/api/*` and helper responses send `Cache-Control: no-store`.

## 6. Job Systems

### Business jobs

- Storage: `job_queue`
- Purpose: certificate checks, onboarding commit batches, Popbill auto-join follow-up, and other queued business work
- Trigger path: `supabase/functions/job-tick` -> internal API endpoints
- `mail-sync` is manual only. Cron does not enqueue scheduled mail sync jobs.

### Renewal helper jobs

- Storage: `renewal_automation_jobs`
- Purpose: local certificate diagnostics and renewal preflight
- Execution model: Windows renewal agent heartbeat plus claim/complete/fail loop

Do not debug these two systems as if they were one queue.

## 7. Non-Obvious Invariants

1. Popbill runtime values are server-owned.
   Workspace settings are supplemental. `AUTO_TAX_POPBILL_*` env values remain authoritative for credentials, mode, customer user-id prefix, shared new-customer password, and the Popbill member notice contact email. Customer workspace browsers must not read or edit the prefix/shared password values.
   Internal AUTO-TAX operational notifications prefer `AUTO_TAX_OPS_EMAILS`; customer contact email is not auto-seeded as an internal alert recipient.
2. UI roles are narrower than DB roles.
   The DB still stores `owner/admin/operator/viewer`, but product behavior is mostly owner versus member.
3. The public root is an acquisition and access portal, not the workspace app.
   Anonymous behavior should stay tightly scoped to consultation/contact, signup request, and existing-customer login flows.
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
