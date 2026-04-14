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

## 9. Known Fragility

- Windows browser automation depends on installed Chrome or Edge
- SignGate flow shape can vary by account/certificate state
- `change-company` and external apply-form branches are not equivalent to standard renewal
- certificate passwords may come from row-level input or workspace-level fallback

## 10. What To Update When Changing This Area

- browser helper bridge code
- renewal route schemas
- queue persistence shape
- certificate UI summaries
- this file
