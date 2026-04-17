# AUTO-TAX Status / Backlog

This file is the current engineering backlog reference. It should stay short and bias toward what blocks correct implementation.

## 1. Stable Enough To Build On

- workspace bootstrap and auth flow
- owner/member operational split
- customer CRUD and Popbill join flow
- address-based mail matching
- draft generation and issuance
- internal business job flow via `job_queue`
- import/onboarding endpoints
- local certificate listing and customer linking
- renewal preflight / prepare / payment-open assistance
- pilot issuance report export and customer auto-transition evidence

## 2. Sharp Edges

### Matching quality

- real-world KEPCO mail variance still needs broader sample coverage
- address normalization is a likely regression hotspot

### Role model mismatch

- DB role matrix is broader than current UI
- future permission bugs are likely if `admin/viewer` starts surfacing without a deliberate UX pass

### Renewal automation boundary

- current flow helps operators but does not complete the whole lifecycle autonomously
- Windows/SignGate dependencies remain fragile

### Large central files

- `web/src/App.tsx`
- `server/src/supabase-store.ts`

These still carry too much orchestration knowledge.

## 3. Immediate Priorities

1. expand parser and matching confidence with more real mail samples
2. tighten renewal flow around real operator scenarios
3. continue reducing orchestration mass in `App.tsx` and `supabase-store.ts`
4. decide whether DB roles beyond `owner/operator` should remain latent or become productized
5. keep docs aligned only around canonical development docs
6. execute the product IA reshape in `docs/PRODUCT_RESHAPE_PLAN.md`, starting with guided onboarding and tab restructuring

## 4. Nice-To-Have, Not Immediate

- full productized billing/subscription flow
- dedicated Node worker split for business jobs
- fully autonomous renewal completion
- customer portal

## 5. Cleanup Policy

- delete dead plans, proposals, mockups, and duplicated docs aggressively
- keep docs only if they speed future implementation or debugging
- generated output should not stay in the working tree
