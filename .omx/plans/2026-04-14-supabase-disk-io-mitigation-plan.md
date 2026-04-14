# AUTO-TAX Supabase Disk IO Mitigation Plan

Date: 2026-04-14  
Mode: `$plan` direct  
Scope: Apply the previously identified Disk IO reduction priorities 1-5 without changing core invoice/mail behavior.

## Requirements Summary

- Reduce unnecessary Supabase read/write pressure on the current free-tier project by addressing the five hottest paths:
  1. certificate-check queue fan-out
  2. certificate-check write amplification
  3. certificate-check double-read of customers
  4. bootstrap over-fetching
  5. missing retention/pruning
- Keep changes small, reviewable, and reversible.
- Reuse the existing job-tick / internal-jobs architecture instead of adding a new scheduler stack (`docs/OPERATIONS.md:130-140`, `supabase/functions/job-tick/index.ts:89-107`, `server/src/routes/core-routes.ts:168-187`).
- Do not add dependencies.

## Current Evidence

- Recurring job dispatch reads all organization settings/integrations and enqueues background work in `dispatchRecurringJobs()` (`server/src/job-queue.ts:698-710`).
- Certificate refresh currently:
  - loads all customers, filters joined customers, and later loads all customers again (`server/src/certificate-monitor.ts:98-101`, `server/src/certificate-monitor.ts:133-145`)
  - updates settings through the full `updateSettings()` path (`server/src/certificate-monitor.ts:170-173`)
- `updateSettings()` writes both `organization_settings` and `organization_integrations`, even when only cert timestamps change (`server/src/supabase-store.ts:841-954`).
- `listCustomers()` also loads plant/address relation tables via `loadCustomerMaps()` (`server/src/supabase-store.ts:597-618`, `server/src/supabase-store.ts:957-968`).
- `/api/bootstrap` always calls `getDashboard()`, which eagerly loads drafts, inbox, and logs (`server/src/routes/core-routes.ts:154-164`, `server/src/supabase-store.ts:2013-2023`), even though:
  - logs are discarded in bootstrap (`server/src/routes/core-routes.ts:155-156`)
  - mailbox data is already lazy-loadable via dedicated client calls (`web/src/App.tsx:2328-2358`)
- Ops logs are already a separate endpoint and only needed for the ops console (`server/src/app-shell.ts:17-25`, `web/src/App.tsx:2298-2308`).

## Acceptance Criteria

1. `dispatchRecurringJobs()` skips certificate-check queueing for organizations with no joined Popbill customers and still preserves the once-per-KST-day guard for eligible organizations.
2. Background certificate refresh no longer calls the full `updateSettings()` path when only `cert_last_checked_at` / `cert_alert_last_sent_at` must change.
3. Certificate refresh no longer performs a full second `listCustomers()` pass after processing.
4. `/api/bootstrap` no longer reads `app_logs`, `invoice_drafts`, or `inbox_messages` by default; mailbox data remains available via `/api/inbox` and `/api/drafts`, and ops logs remain available via `/api/logs`.
5. Old rows in `app_logs`, `job_queue`, and `renewal_automation_jobs` are pruned by a scheduled retention path with explicit retention windows and safety guards.
6. Server tests cover the new dispatch gating, narrow cert timestamp writes, bootstrap slimming, and retention behavior.
7. Manual smoke proves:
   - login/bootstrap still works
   - mailbox tabs still load drafts/inbox on demand
   - ops console still loads logs
   - manual and scheduled cert refresh still complete

## Recommended Delivery Shape

Ship as three reviewable PRs:

1. **PR A — Background job pressure reduction**
   - priorities 1, 2, 3
2. **PR B — Read-path slimming**
   - priority 4
3. **PR C — Retention / pruning**
   - priority 5

This keeps rollback simple and isolates behavior risk.

## Implementation Steps

### Step 1 — Add a joined-customer eligibility gate before queueing certificate checks

**Why:** Current recurring dispatch fans out cert checks per enabled organization (`server/src/job-queue.ts:698-710`) even when an org may have nothing meaningful to check.

**Files**
- `server/src/job-queue.ts`
- `server/src/supabase-store.ts` or a new focused query helper module if that keeps `job-queue.ts` smaller

**Plan**
- Add a single admin-side eligibility query that returns which `scheduler_enabled=true` organizations actually have at least one `managed_customers.popbill_state = 'joined'`.
- Fold that eligibility map into `dispatchRecurringJobs()` before the certificate-check branch.
- Skip queueing with a clear reason like `no-joined-customers` so ops diagnostics remain understandable.
- Preserve the existing once-per-day guard via `shouldRefreshCertificateStatuses()` (`server/src/certificate-monitor.ts:60-61`) and existing open-job checks.

**Tests**
- dispatch skips when scheduler is enabled but joined-customer count is zero
- dispatch still queues once for eligible organizations
- mail-sync path remains unchanged

### Step 2 — Split narrow cert timestamp writes out of `updateSettings()`

**Why:** `refreshAllCertificateStatuses()` only needs to touch cert timestamps, but today it routes through `store.updateSettings(nextSettings)` (`server/src/certificate-monitor.ts:170-173`), which triggers full upserts in both settings and integrations (`server/src/supabase-store.ts:841-954`).

**Files**
- `server/src/store-contract.ts`
- `server/src/supabase-store.ts`
- `server/src/certificate-monitor.ts`

**Plan**
- Add focused store methods such as:
  - `updateCertificateCheckMetadata({ certLastCheckedAt, certAlertLastSentAt? })`
  - or separate `touchCertLastCheckedAt()` / `touchCertAlertLastSentAt()`
- Implement them as a direct `organization_settings.update(...)` call only.
- Replace the `updateSettings(nextSettings)` usage in `refreshAllCertificateStatuses()` with the narrow method.
- Keep existing `updateSettings()` for user-driven settings UI only.

**Tests**
- cert refresh updates only the expected settings columns
- no integration-row write occurs on background cert refresh
- notification sent/not-sent cases still update timestamps correctly

### Step 3 — Remove the second full customer read from certificate refresh

**Why:** Certificate refresh loads customers once at start (`server/src/certificate-monitor.ts:98-101`) and again after processing (`server/src/certificate-monitor.ts:133-145`). Each `listCustomers()` call also loads plant/address relation tables (`server/src/supabase-store.ts:597-618`, `server/src/supabase-store.ts:957-968`).

**Files**
- `server/src/certificate-monitor.ts`
- optionally `server/src/supabase-store.ts` if a narrower lookup helper is cleaner

**Plan**
- Rework `refreshAllCertificateStatuses()` so the post-processing counts come from:
  - the original joined customer list plus in-memory updated results, or
  - a narrow follow-up query that reads only the minimal certificate status fields
- Avoid a second full `listCustomers()` call.
- Keep notification body contents unchanged.

**Tests**
- expired/expiringSoon counts remain correct after the refactor
- failures still log and do not break summary counts

### Step 4 — Slim `/api/bootstrap` to only the data needed for first paint

**Why:** Bootstrap currently over-fetches and then discards/overwrites data (`server/src/routes/core-routes.ts:154-164`, `server/src/supabase-store.ts:2013-2023`).

**Files**
- `server/src/supabase-store.ts`
- `server/src/routes/core-routes.ts`
- `web/src/App.tsx`

**Plan**
- Split `getDashboard()` into smaller read models, e.g.:
  - `getBootstrapWorkspace()` → settings, customers, customerCertificates, counts needed for first paint
  - `listDrafts()`, `listInbox()`, `listLogs()` remain dedicated endpoints
- Update `/api/bootstrap` to use the slim read model instead of `getDashboard()`.
- Keep mailbox loading on the existing lazy path in `loadMailboxData()` (`web/src/App.tsx:2328-2358`).
- Keep ops logs on `/api/logs` only (`server/src/app-shell.ts:17-25`, `web/src/App.tsx:2298-2308`).
- Review `counts` dependencies so the home screen still has the needed badges; if some counts currently depend on drafts/inbox scans, replace them with targeted count queries instead of full table loads.

**Tests**
- bootstrap response shape remains valid for initial render
- drafts/inbox still load via their dedicated routes
- ops console still loads logs independently

### Step 5 — Add explicit retention/pruning for operational tables

**Why:** The repo currently has no cleanup path for `app_logs`, `job_queue`, or `renewal_automation_jobs`, so operational churn accumulates indefinitely.

**Files**
- new migration under `supabase/migrations/`
- `server/src/routes/core-routes.ts` or a new internal maintenance route module
- `supabase/functions/job-tick/index.ts`
- optional new server module such as `server/src/maintenance-retention.ts`

**Plan**
- Introduce a daily prune path reusing the existing cron/internal-job flow (`docs/OPERATIONS.md:130-140`, `supabase/functions/job-tick/index.ts:89-107`).
- Retention defaults:
  - `app_logs`: keep 30 days
  - `job_queue`: keep completed/failed/cancelled rows 14-30 days
  - `renewal_automation_jobs`: keep completed/failed/cancelled rows 30 days
- Never delete:
  - queued/claimed jobs
  - the newest N rows per table if you want an extra safety buffer
- Emit one summary log/metric for pruning so the action is observable without becoming noisy.

**Design choice**
- Prefer a dedicated internal maintenance endpoint over forcing retention into organization-scoped `job_queue`, because retention is platform-wide and not naturally tied to one organization.

**Tests**
- prune deletes only rows older than the retention window
- prune leaves active jobs intact
- job-tick invokes maintenance at the intended cadence without breaking current dispatch/run behavior

### Step 6 — Verification and rollout

**Files / commands**
- `npm run check`
- `npm run test:server`
- targeted manual smoke from `docs/OPERATIONS.md`

**Plan**
- Before each PR, capture a small before/after baseline:
  - `job_queue` rows created per day
  - `app_logs` rows created per day
  - scheduled certificate-check count at the KST midnight window
- After deploy, verify:
  - fewer cert-check rows are created for empty organizations
  - no-op daily cert refreshes no longer rewrite unrelated settings/integration rows
  - bootstrap no longer reads mailbox/log tables on first paint
  - prune job removes stale rows safely

## Risks and Mitigations

- **Risk:** eligibility gate accidentally suppresses real cert checks  
  **Mitigation:** add tests for joined/non-joined organizations and log explicit skip reasons.

- **Risk:** slim bootstrap drops counts the UI expects  
  **Mitigation:** enumerate every bootstrap consumer in `web/src/App.tsx` before changing the payload and backfill with targeted count queries where needed.

- **Risk:** retention removes useful audit/debug data too aggressively  
  **Mitigation:** start with conservative windows, exclude active jobs, and make windows easy to adjust in one module/migration.

- **Risk:** splitting settings writes creates drift between UI settings saves and background timestamp updates  
  **Mitigation:** keep `updateSettings()` as the only full settings write path and add dedicated tests for the new narrow metadata method.

## Verification Steps

1. Unit/server tests for:
   - dispatch eligibility gate
   - narrow cert metadata update method
   - certificate refresh summary correctness without second customer load
   - bootstrap slim path
   - prune safety
2. `npm run check`
3. `npm run test:server`
4. Manual smoke:
   - login and initial bootstrap
   - navigate to mailbox tab and confirm lazy inbox/draft load
   - open ops console and confirm logs still load
   - run manual cert refresh and confirm status + notification behavior
5. Post-deploy monitoring in Supabase:
   - `Disk IO % consumed`
   - cache hit rate
   - query performance / top DB calls

## Suggested Execution Order

1. Step 2 (narrow writes) — fastest payoff, low UI risk
2. Step 1 (eligibility gate) — biggest recurring background reduction
3. Step 3 (remove second customer read) — straightforward follow-up
4. Step 4 (bootstrap slimming) — medium risk, UI-sensitive
5. Step 5 (retention) — safe once operational paths are stable

