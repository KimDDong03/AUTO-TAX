# AUTO-TAX Renewal Helper / SignGate Notes

This file documents the current Windows local-helper boundary. It is not a product spec; it is an implementation/debugging guide.

## 1. Scope Boundary

Current implemented scope:

- local bridge reachability checks
- certificate listing
- certificate-to-customer linking
- certID lookup
- SignGate renewal preflight analysis
- partial renewal preparation assistance
- payment window opening

Not current scope:

- unattended end-to-end renewal completion
- guaranteed successful payment completion
- full remote-only operation without a Windows machine

## 2. Moving Parts

### Browser app

- `web/src/local-renewal-helper.ts`
- `web/src/features/certificates/CertificatesTab.tsx`
- `web/src/features/initial-registration/InitialRegistrationTab.tsx`

### Server

- `server/src/routes/renewal-routes.ts`
- `server/src/renewal-automation.ts`
- `server/src/services/renewal-customer-sync.ts`
- `server/src/services/renewal-page-parser.ts`
- `server/src/services/renewal-password.ts`

### Local scripts

- `scripts/renewal-local-helper.ts`
- `scripts/renewal-agent.ts`
- `scripts/popbill-cert-registration.ts`
- `scripts/signgate-fee-payment.ts`

## 3. Runtime Model

There are two local components:

### Local helper

- browser-facing
- runs on customer/operator Windows PC
- used for certificate listing, Popbill registration support, SignGate payment window opening
- packaged installs live under `%LOCALAPPDATA%\\AUTO-TAX\\renewal-local-helper`; reinstall stops a running helper before overwriting that stable install location

### Renewal agent

- server-facing worker
- heartbeats periodically
- claims queued renewal jobs
- completes/fails diagnostic or preflight jobs

### Security boundary

- server must not persist or re-display Hometax ID/PW, raw certificate files, or certificate passwords
- workspace-level `renewal_issue_password_encrypted` may remain encrypted on the server for agent-side renewal submission, but it is not returned to normal browser responses
- `renewal_automation_jobs.submission_profile_json` strips `issuePassword` at rest and only rehydrates it when the renewal agent claims a customer-bound preflight job
- onboarding preview/batch persistence strips workbook `certificatePassword` before writing preview/batch JSON rows
- local helper / agent errors and logs mask password-like values and local certificate paths; helper HTTP responses are `Cache-Control: no-store`

## 4. Job Types

Persisted in `renewal_automation_jobs`:

- `bridge-probe`
- `certid-probe`
- `renewal-preflight`

Supporting heartbeat state:

- `renewal_agent_heartbeats`

These are separate from business queue work in `job_queue`.

## 5. Endpoints

### Browser/operator-facing

- `GET /api/automation/renewal-agent/snapshot`
- `GET /api/customer-onboarding/renewal`
- `POST /api/customer-onboarding/renewal/bridge-probe`
- `POST /api/customer-onboarding/renewal/preflight`
- `POST /api/automation/renewal-jobs/bridge-probe`
- `POST /api/automation/renewal-jobs/certid-probe`
- `POST /api/automation/renewal-jobs/preflight`

### Agent-facing

- `POST /api/automation/renewal-agent/heartbeat`
- `POST /api/automation/renewal-agent/jobs/claim`
- `POST /api/automation/renewal-agent/jobs/:id/complete`
- `POST /api/automation/renewal-agent/jobs/:id/fail`

## 6. Local Commands

```bash
npm run renewal-helper:install
npm run renewal-helper:start
npm run renewal-helper:status
npm run renewal-helper:stop
npm run renewal-helper:uninstall
npm run renewal-agent:dev
```

## 7. Important Environment Variables

### Helper / browser automation

- `AUTO_TAX_SIGNGATE_HELPER_BROWSER_CHANNEL`
- `AUTO_TAX_SIGNGATE_HELPER_USER_DATA_DIR`
- `AUTO_TAX_POPBILL_HELPER_BROWSER_CHANNEL`
- `AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR`
- `AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR`

Latest helper builds also expose `popbillDebugArtifactSupport`, `popbillDebugArtifactDir`, and `popbillDebugArtifactStages`
through `npm run renewal-helper:status` / `GET /health`, so use that first to confirm the installed helper bundle
actually contains debug-artifact support before changing Popbill selector logic.

### Renewal agent

- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_RENEWAL_AGENT_ID`
- `AUTO_TAX_RENEWAL_AGENT_INTERVAL_MS`
- `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD`
- `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE`

## 8. Debugging Order

1. confirm helper/agent process is running
2. confirm bridge ports are reachable
3. confirm latest heartbeat exists
4. confirm job was queued in `renewal_automation_jobs`
5. confirm agent claimed the job
6. inspect `summary`, `error`, `result_json`
7. inspect browser-side local helper response
8. for Popbill certificate registration ambiguity, inspect the local-helper console output first
9. if the helper reports a Popbill debug artifact path, open the saved JSON + `*.frame.html` snapshot before changing selector logic
10. if no artifact path is produced, run `npm run renewal-helper:status` (or `GET /health`) and confirm
    `popbillDebugArtifactSupport=enabled` plus the resolved artifact directory/stages from the installed helper build

## 9. Known Fragility

- Windows browser automation depends on installed Chrome or Edge
- SignGate flow shape can vary by account/certificate state
- `change-company` and external apply-form branches are not equivalent to standard renewal
- certificate passwords may come from row-level input or workspace-level fallback
- Popbill certificate chooser automation still cannot assume serial/userDN/index are present in the visible candidate row. Public/sample DOM traces for the same certificate module show table/list rows such as `tr#row0dataTable` with leaf `span[title]` text and scrollbar containers like `#MLjquiScrollAreaDownverticalScrollBardataTable`, but they do not prove that serial/userDN/index are exposed per-row in a stable attribute.
- Current helper therefore uses a fail-closed strategy: inspect visible candidate row/list text, row/span attributes (`title`, `id`, `name`, `value`, `data-*`, `aria-*`, `onclick`), hidden/select/input values, and then a second pass that clicks each ambiguous row only to inspect selected/detail DOM evidence. It auto-clicks only when serial/userDN become a unique match, or when `certificateIndex` appears in an explicit `certificateIndex`/`certID`/`인증서번호`-style field. Generic row ids like `row0dataTable` remain diagnostic-only. Otherwise it aborts and writes JSON + frame HTML debug artifacts for the next session.

## 10. What To Update When Changing This Area

- browser helper bridge code
- renewal route schemas
- queue persistence shape
- certificate UI summaries
- this file
