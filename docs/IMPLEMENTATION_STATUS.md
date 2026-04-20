# AUTO-TAX Status / Backlog

This file is the current engineering backlog reference. Keep it short and biased toward what blocks correct implementation.

## 1. Stable Enough To Build On

- workspace bootstrap and auth flow
- owner/member operational split
- customer CRUD and Popbill join flow
- address-based mail matching
- draft generation and issuance
- internal business jobs through `job_queue`
- onboarding preview and commit endpoints
- local certificate listing and customer linking
- renewal preflight and payment-open assistance
- pilot issuance reporting over `app_logs`

## 2. Sharp Edges

### Matching quality

- Real-world KEPCO mail variance still needs broader sample coverage.
- Address normalization remains a regression hotspot.

### Role model mismatch

- The DB role matrix is broader than the current UI.
- Future permission bugs are likely if `admin` or `viewer` start surfacing without a deliberate product/access-control pass.

### Renewal boundary

- Current renewal support helps operators but does not complete the full lifecycle autonomously.
- Windows and SignGate dependencies remain fragile.

### Large orchestration files

- `web/src/App.tsx`
- `server/src/supabase-store.ts`

These still carry too much cross-feature knowledge.

## 3. Immediate Priorities

1. Expand parser and matching confidence with more real mail samples.
2. Continue moving orchestration out of `App.tsx` and `supabase-store.ts`.
3. Harden onboarding batch and renewal flows around real operator scenarios.
4. Keep the product role model explicit instead of accidentally exposing latent DB roles.
5. Keep the documentation set small and update canonical docs whenever runtime behavior changes.

## 4. Nice-To-Have, Not Immediate

- full productized billing or subscription flow
- dedicated worker split for business jobs
- fully autonomous renewal completion
- broader public site or customer portal work

## 5. Documentation Policy

- Canonical docs should stay limited to the active set referenced in `AGENTS.md`.
- One-off plans are acceptable during implementation but should be deleted once the decision lands or becomes stale.
- If a doc does not speed implementation, debugging, or safe operations, remove it.
