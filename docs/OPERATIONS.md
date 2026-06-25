# AUTO-TAX Operations Runbook

Status: canonical_operations.

This file is for development, deployment, and runtime debugging work. It is not an end-user operations manual.

## 1. Required Environment

Environment templates are split by runtime:

- `.env.local.example`: local development template. Copy it to `.env` for `npm run dev`.
- `.env.vercel.example`: Vercel dashboard checklist for production or preview deployment.

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
- `AUTO_TAX_POPBILL_CONTACT_NAME`
- `AUTO_TAX_POPBILL_CONTACT_EMAIL`
- `AUTO_TAX_POPBILL_CONTACT_TEL`

Popbill customer identity values are intentionally fail-closed. If `AUTO_TAX_POPBILL_USER_ID_PREFIX`
or `AUTO_TAX_POPBILL_SHARED_PASSWORD` is missing, new customer creation fails instead of falling back
to an organization default prefix.

### Optional or situational

- `VITE_API_BASE_URL`
- `AUTO_TAX_ALLOWED_ORIGINS`
- `AUTO_TAX_POPBILL_PARTNER_CORP_NUM`
- `AUTO_TAX_POPBILL_HELPER_HEADLESS`
- `SMS_PROVIDER=solapi`
- `SOLAPI_API_KEY`
- `SOLAPI_API_SECRET`
- `SOLAPI_SENDER_NUMBER`
- Signup email verification defaults to Gmail SMTP when both `AUTO_TAX_SUPPORT_TO_EMAIL` and `AUTO_TAX_SUPPORT_APP_PASSWORD` are set.
- `AUTO_TAX_SIGNUP_EMAIL_PROVIDER=smtp`
- `AUTO_TAX_SIGNUP_SMTP_HOST`, `AUTO_TAX_SIGNUP_SMTP_PORT`, `AUTO_TAX_SIGNUP_SMTP_SECURE`
- `AUTO_TAX_SIGNUP_SMTP_USER`, `AUTO_TAX_SIGNUP_SMTP_PASS`, `AUTO_TAX_SIGNUP_EMAIL_FROM`, `AUTO_TAX_SIGNUP_EMAIL_FROM_NAME`
- `AUTO_TAX_SIGNUP_SMTP_ALLOW_WEAK_DH`; defaults to enabled only for `smtp.whoisworks.com`, whose TLS handshake uses legacy DH parameters.
- Signup SMTP env values are sender-side service credentials only. Public signup verification codes are sent to the customer-entered KEPCO mail receiving address, not to the service sender address unless the user explicitly typed that same mailbox.
- `AUTO_TAX_JOB_SECRET`; first deployment runs in manual mode without Supabase cron, but this is required when enabling `job-tick` or renewal-agent secret auth.
- `AUTO_TAX_RENEWAL_AGENT_SECRET`; if omitted, renewal agent auth falls back to `AUTO_TAX_JOB_SECRET`
- `AUTO_TAX_RENEWAL_AGENT_*`
- Supabase cron `job-tick`, only if enabled: `AUTO_TAX_SERVER_URL`, `AUTO_TAX_JOB_SECRET`
- `SUPABASE_DB_PASSWORD`
- `AUTO_TAX_RENEWAL_HELPER_ZIP_PATH`
- `VITE_RENEWAL_HELPER_DOWNLOAD_URL`

Popbill certificate registration tries the browserless MagicLine4NX direct path first. Helper-owned
registration jobs run up to five rows at once; local testing showed six simultaneous direct calls can
trip the MagicLine4NX loopback service, so five is the default and maximum batch concurrency. If the
direct path is unavailable on a target PC, the helper falls back to headless browser compatibility
mode. Set `AUTO_TAX_POPBILL_HELPER_HEADLESS=0` only when that compatibility path must be visible for
manual troubleshooting.

## 2. Local Development

Run the app:

```bash
npm install
npm run dev
```

- Vite uses `127.0.0.1:5174` with strict port binding. If that port is already in use, stop the conflicting process before opening the app in a browser.
- Local CORS allows browser origins on `localhost`, `127.0.0.1`, and `[::1]` for development and preview checks.
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
npm run check
npm run build
npm run build:vercel
```

Vercel uses `npm run check && npm run build:vercel` as the configured build command, so server/API type errors must fail before static upload.

## 4. Security Boundary

- Production deployment assumes HTTPS end-to-end.
- `/api/*` responses and Windows local helper responses send `Cache-Control: no-store`.
- The production CSP allows the jsDelivr Pretendard stylesheet/font CDN used by the web bundle.
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

## 6. Optional Internal Jobs And Retention

This is only needed when the deployment uses Supabase cron to run background jobs. The first production deployment runs in manual mode: leave `job-tick` disabled and run internal jobs from the ops UI or a deliberate operator command. The app can still run without `job-tick` when operational follow-up is handled manually.

### Business queue flow

1. Supabase cron hits Edge Function `job-tick`.
2. `job-tick` calls the API using `AUTO_TAX_JOB_SECRET`.
3. Internal endpoints run:
   - `POST /api/internal/jobs/maintenance`
   - `POST /api/internal/jobs/dispatch`
   - `POST /api/internal/jobs/run`
4. Business work persists in `job_queue`.

`job-tick` runs at most 10 queued jobs by default. Explicit run limits are clamped to 25 so cron or manual retries cannot flood the database after a backlog.

Mail sync is not dispatched by cron. Users trigger mail sync from the app when they need to fetch mail.

### Retention

- Maintenance is checkpointed by `platform_maintenance_runs`, so cron can call it every tick without pruning more than once per UTC day.
- Current default retention:
  - `app_logs`: 30 days by `created_at`
  - `job_queue`: 21 days for terminal rows by `finished_at`
  - `renewal_automation_jobs`: 30 days for terminal rows by `finished_at`
  - `public_signup_phone_verifications`: 7 days after `expires_at`
  - `public_signup_email_verifications`: 7 days after `expires_at`
- Queued or claimed rows are never prune targets.

### Production migration rollout

- Review new migrations for ordinary `CREATE INDEX` statements on hot tables before production rollout.
- If `app_logs`, `job_queue`, `invoice_drafts`, or customer tables already hold large production volume, rehearse the migration against a recent copy and schedule a low-traffic window. Split high-cost index builds into a dedicated rollout when lock time is not acceptable.

### Edge Function deployment assumptions

- Function name: `job-tick`
- Deploy with `--no-verify-jwt`
- Validate `x-auto-tax-job-secret` inside the function

Minimum remote secrets:

- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_JOB_SECRET`

Smoke behavior:

- Default `npm run smoke:ops` treats `job-tick` as optional.
- Set `AUTO_TAX_OPS_SMOKE_REQUIRE_JOB_TICK=true` only after cron has been intentionally enabled; then the smoke requires the function to be active and deployed with JWT verification disabled.

## 7. Local Renewal Helper And Agent

There are two local Windows components:

### Local helper

- Browser-facing HTTP helper
- Runs on the operator PC
- Handles certificate listing, certificate business-info lookup, browser-selected NPKI/P12/PFX upload-session metadata extraction/import, local checks, and payment-window/open support
- Stable install path: `%LOCALAPPDATA%\\AUTO-TAX\\renewal-local-helper`
- The installed Windows logon autostart task runs the helper in the background without opening the tray app; manual Start still opens the tray for status/exit controls.
- The tray right-click menu must open immediately; helper health refresh runs in the background and should not block menu display.
- Packaged installs register `AT helper` under the current user's Windows installed-apps list; uninstalling it there removes the scheduled task, tray/helper files, and helper desktop shortcuts.
- Packaged and script installs check for the local certificate programs needed by the helper flow before starting the helper. If HomeTax MAGIC-PKI or SignGate SecuKit NXS is missing, the installer downloads and runs the official Windows installer. Override the URLs with `AUTO_TAX_MAGIC_PKI_DOWNLOAD_URL` and `AUTO_TAX_SECUKIT_NXS_DOWNLOAD_URL` if the vendor moves a release.
- Helper diagnostics separate three signals:
  - helper reachability: `GET http://127.0.0.1:35119/health`
  - certificate listing: `POST http://127.0.0.1:35119/api/certificates`
  - Initial-registration business lookup: `POST http://127.0.0.1:35119/api/certificates/business-info`
  - HomeTax-only diagnostic business lookup: `POST http://127.0.0.1:35119/api/hometax/business-info`
  - SignGate/SecuKit renewal bridge diagnostics: `POST http://127.0.0.1:35119/api/bridge-probe`
- `bridgeTransportSummary` is the raw TCP probe for SignGate/SecuKit ports `14315/14319`.
  `bridgeFunctionalSummary` and legacy `bridgeSummary` are functional readiness summaries. Do not treat a raw TCP failure as proof that certificate listing is unavailable when `GetVersion`, license, or storage probes succeed.
- Setup step readiness is helper/program readiness, not certificate presence. It is complete when the helper is reachable, the helper version is supported, and `/health` reports a non-down functional certificate-program state.
- Initial registration should use `/api/certificates` for automatic standard NPKI storage lookup only. If certificates are outside the bridge-readable list, the operator can explicitly choose files or folders through `/api/certificates/upload-session`; the web app appends the parsed issue-capable certificates to the checklist without clearing existing bridge-read candidates, while excluding upload-session copies that already match a bridge/NPKI certificate.
- When initial-registration preview needs a bridge-backed lookup for an upload-session candidate, the web app first calls `/api/certificates/import-upload-session` with the selected certificates and entered passwords, chunked at 50 import rows per helper request. The helper prepares only those selected candidates for the bridge-backed path: NPKI `signCert.der`/`signPri.key` pairs are copied to the standard LocalLow NPKI store, and `.p12`/`.pfx` files first validate the password through the Windows certificate API before importing through SecuKit NXS `CertManagement.importP12`. The helper warms SecuKit's standard HDD storage selection before importing P12/PFX files, so an otherwise empty local HDD store can still accept an imported certificate. The app then uses the re-read bridge certificate index for business-info lookup and later browser automation. If any selected upload-session certificate fails password validation, NPKI import, or bridge-list rematching, the initial-registration check stops before SignGate/HomeTax business-info lookup and leaves only those rows as password/import issues.
- Initial registration reads business identity through the unified certificate business-info route. That route tries the SignGate renewal information snapshot first, then uses HomeTax only when SignGate cannot serve the certificate/provider family, such as yessign, missing SignGate issue information, or missing SignGate storage-media details for a certificate that is still bridge-readable through HomeTax ML4Web. Password failures, expired certificates, missing bridge certificate indexes, and explicit certificate-selection failures fail closed instead of falling through to another provider.
- The HomeTax secondary route uses the same HomeTax MagicLine material that the HTML5 UI produces, but it now tries the faster local MagicLine4NX service path first. It does not use YESKEY/yessign subscriber-info as a fallback; uploaded P12/PFX certificates must be imported into the bridge-readable store before business lookup can run. The helper calls `Sign`, `GetCertString`, and `GetVIDRandom` on `127.0.0.1:42235` with the bridge HDD/NPKI storage index, builds the raw `pkcEncSsn$serial$yyyyMMddHHmmss$signature` value, wraps it with the same UTF-8 Base64 layer returned by HomeTax's ML4Web callback, and posts portal `pubcLogin.do`. If that direct path fails or HomeTax rejects it, the helper falls back to the HTML5 frame path: `ntsCertAuth` opens the ML4Web certificate frame, the helper selects the matching HDD/NPKI certificate inside that frame, then reads `tranx2PEM` and `getRandomfromPrivateKey`. After login success it reads the authenticated taxpayer fields from HomeTax's `/permission.do` session map, using `/token.do` as the portal handoff when needed. If the session provides a business number, the helper opens HomeTax's common taxpayer-basic WebSquare screen (`/ui/comm/a/b/UTEABHAA19.xml` on `hometax.go.kr`), injects the authenticated session map into the page session store, resolves the screen's live `$p.main().$p` work scope, and runs the taxpayer-basic and business-basic lookup actions (`ATTABZAA001R01`/`ATTABZAA001R02` through `nts_loadBizCd`) to merge address fields from the business profile response.
- HomeTax business-info orchestration lives in `scripts/hometax-business-info.ts`. The local helper wraps it with the SignGate-first strategy in `scripts/renewal-local-helper.ts`, while the renewal agent supplies only the bridge-readable ML4Web certificate candidate list. HomeTax login, address lookup, browser-context lifetime, raw candidate cache, and parsers stay out of the SignGate renewal/payment flow.
- Certificate business-info lookup is a helper-owned job pipeline. The web app creates `/api/certificates/business-info-jobs`, polls job progress, and keeps `/api/certificates/business-info-batch` only as the legacy compatibility route when an older helper is installed. The helper exposes `/api/certificates/business-info-capabilities` for the active policy, runs SignGate-first rows at adaptive default concurrency 16, and sends only provider-boundary failures to the HomeTax secondary phase at default concurrency 5. Password failures, expired certificates, missing bridge indexes, and explicit certificate-selection failures fail in the SignGate phase without falling through. SignGate concurrency is lowered only for transient connection/timeout-style failures and recovers after stable batches; operator/account/provider failures do not lower concurrency. The ML4Web certificate frame is used only as a fallback and is still treated as single-lane global state. The helper uses a longer timeout and does not retry the same batch as duplicate individual requests after timeout. SignGate renewal preflight can still use higher-concurrency batches. The helper keeps the HomeTax Playwright browser process warm while the helper is running and uses fresh isolated browser contexts for fallback signing or taxpayer-basic address lookup. If the native certificate dialog does not open at all, only that dialog-open step is retried once with a fresh page; password, signing, login, and taxpayer lookup failures remain fail-closed. If the authenticated taxpayer-basic screen returns identity data without address fields, the helper reopens only that taxpayer-basic screen once with the same HomeTax session to wait for the address-bearing response. Upload-session certificate imports invalidate the raw ML4Web certificate-list cache so newly imported certificates are visible immediately.
- Popbill certificate registration is helper-assisted and batch-executed during initial registration. The Popbill certificate-registration URL is short-lived, so the web app creates five-row windows, requests fresh URLs for only the current window through `/api/customers/popbill/cert-urls`, and submits those rows to the helper job route `/api/popbill/certificate-registration-jobs` in explicit `direct` mode. The helper still owns direct MagicLine4NX payload creation and, for compatibility retries, the one-row browser/context lifetime, certificate-frame matching, and failure capture. Direct structural failures retry only the failed row with a fresh URL starting at headless compatibility mode; expired-token rows retry from direct with a fresh URL; frame-readiness failures can still escalate to visible compatibility mode. Successful rows are confirmed through `/api/customers/popbill/cert-status-batch` instead of one customer at a time. Password and certificate-selection failures remain actionable row failures. Frame readiness failures write both the ML4Web child frame HTML and the main certificate page HTML under the local Popbill debug artifact directory so the clicked page state can be diagnosed without rerunning immediately.
- If business-info lookup yields a business number but the address lookup path fails or returns no address, initial registration should keep the row importable and include the helper's address lookup detail in the target-check review message before the generic address-completion warning. Address completion remains required before automatic KEPCO mail matching can use that customer.
- Renewal management screens that need the installed Windows certificate list should use `/api/certificates`; customer-add and initial-registration missing-certificate flows can use browser file/folder selection with `/api/certificates/upload-session`. Renewal preflight/payment diagnostics can use `/api/bridge-probe` or the preflight endpoints.
- `/api/certificates` should return bridge-backed certificate storage only. It prefers the HomeTax ML4Web storage flow, including the lowercase `hdd` storage name and root `hddOpt` option returned by `SelectStorageInfo`, then falls back to SignGate/SecuKit storage probes when needed.
- When the same certificate appears in both ML4Web and SignGate/SecuKit results, keep the ML4Web display metadata but upgrade the row with the SignGate/SecuKit numeric certificate index so initial-registration preflight can use the same row.
- Local bridge response bodies are decoded from raw bytes and choose UTF-8 or Korean CP949/EUC-KR as needed, so certificate names from Windows security modules stay readable in `/api/certificates`.
- User-selected NPKI folders and `.p12`/`.pfx` files are handled only through explicit browser-to-helper actions; the helper should not automatically scan Desktop, Documents, Downloads, or arbitrary folders for exported certificate files.
- Upload-session certificates provide local metadata for customer-add matching and initial-registration missing-certificate candidates. The helper keeps raw upload material in memory with a short TTL; it writes/imports certificate material only for operator-selected customer-add or initial-registration candidates that must enter bridge-backed business identity lookup.
- The helper treats electronic-tax-purpose certificates and business/corporate general-purpose certificates as issue-capable. Personal general-purpose and bank/insurance-only certificates stay non-issue-capable.
- Browser-selected upload sessions accept NPKI `signCert.der`/`signPri.key` pairs and P12/PFX files. P12/PFX metadata is read locally with Windows `certutil -v -dump` for list/export use; importing P12/PFX into bridge-readable storage requires the certificate password later. Folder or multi-file selection can send up to 500 certificate material files per session.

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
- `dist/renewal-local-helper.exe`
- `dist/renewal-local-helper.zip`
- `web/public/downloads/renewal-local-helper.json`
- `web/public/downloads/AT helper-<version>.exe`
- `web/public/downloads/AT helper-<version>.zip`

Download path defaults:

- Vercel/public: read `/downloads/renewal-local-helper.json`, then use the versioned `downloadUrl`.
- local/self-hosted server: read `/downloads/renewal-local-helper.json`, then use the versioned `downloadUrl`.

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
- Raw NPKI/P12/PFX files selected during manual customer add or initial registration must stay inside the browser-to-`127.0.0.1` helper boundary. Persist only extracted certificate metadata and customer fields; the helper may write/import only the selected customer-add or initial-registration certificate material locally to prepare bridge-backed business identity lookup.

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

`npm run test:e2e:smoke` creates and deletes test Auth/DB rows through the Supabase service role. It is for local or explicitly approved non-production targets only. Remote targets require `AUTO_TAX_E2E_ALLOW_REMOTE_WRITES=true`; production targets additionally require `AUTO_TAX_E2E_ALLOW_PRODUCTION_WRITES=true`.

`npm run smoke:ops` checks the linked Supabase project for:

- deployed API readiness at `/api/health` when `AUTO_TAX_OPS_SMOKE_BASE_URL` or `AUTO_TAX_SERVER_URL` is set.
- `job-tick` status when project metadata is available; it only requires active/JWT-disabled when `AUTO_TAX_OPS_SMOKE_REQUIRE_JOB_TICK=true`.
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

Managed release assets:

- `web/public/downloads/` should contain only `renewal-local-helper.json` and the latest versioned helper exe/zip needed by that metadata. Do not keep old helper binaries in git.

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

When deployment health looks wrong:

- inspect Vercel function logs for `api/index.ts`
- inspect Supabase Edge Function logs only if `job-tick` is enabled
- run `npm run smoke:ops` with `AUTO_TAX_OPS_SMOKE_BASE_URL` set to the deployed app URL
