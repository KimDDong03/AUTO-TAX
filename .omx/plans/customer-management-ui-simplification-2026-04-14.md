# Customer Management UI Simplification Plan

Date: 2026-04-14
Owner: Codex ($plan direct)
Scope: `web/src/features/customers/CustomersTab.tsx`, `web/src/styles.css`

## Requirements Summary

The customer management screen should move from a dense “status dashboard” presentation to a simpler “operations console” presentation: search -> list -> select -> act. The new shape should feel closer to a quiet B2B admin tool with a list-first layout, restrained copy, and a detail panel that expands only after selection.

Grounding:
- The product design system already says AUTO-TAX should look like an `운영 도구` and prioritize readable, mistake-resistant stateful screens (`DESIGN.md:3`).
- The design system also says a block should read as one surface and to avoid nested cards/boxes (`DESIGN.md:15-16`, `DESIGN.md:78`).
- Copy should stay short and operator-oriented rather than verbose (`DESIGN.md:175-177`).
- The current customer screen violates that intent by stacking alerts, quick-focus cards, filter buttons, summary lines, recent chips, row summaries, and a dense detail panel in one view (`web/src/features/customers/CustomersTab.tsx:483-589`, `web/src/features/customers/CustomersTab.tsx:608-810`).

## Current UX Problems

1. **Too many competing summaries before the list**
   - Expiry alerts, two header actions, four focus cards, five filter chips, a summary line, and recent-customer chips all appear before the customer rows (`CustomersTab.tsx:483-607`).
2. **Each row tries to explain everything**
   - Every customer row shows company, owner, business number, readiness, popbill summary, certificate summary, blocked reason, next step, CTA, and helper text (`CustomersTab.tsx:621-653`).
3. **The detail panel repeats the same state in multiple formats**
   - Readiness chip, lead callout, decision cards, stats row, status row, issue cards, extra actions, and tabs all restate overlapping information (`CustomersTab.tsx:679-824`).
4. **Visual density is amplified by card styling**
   - Focus cards and list rows both use tall bordered cards with shadows and internal sub-blocks (`styles.css:2996-3031`, `styles.css:3182-3330`).
5. **Responsive collapse preserves too much content instead of simplifying hierarchy**
   - Mobile currently stacks the same modules rather than reducing the number of visible layers (`styles.css:5512-5655`).

## Design Direction

### Core interaction model
Default screen flow becomes:
1. Search and quick filter
2. Compact customer list
3. Select customer
4. Review concise detail panel on the right
5. Trigger one primary action

### Visual principles
- List-first, not dashboard-first
- One dominant primary action per context
- Short labels, chips, and metadata instead of explanatory sentences
- Hidden secondary controls via `details`, popover, or secondary section
- More white space, fewer bordered boxes, lower visual noise

## Recommended Information Architecture

### Left column: customer worklist
Keep the left side as the main operating surface.

**Header strip**
- Title: `고객`
- One primary search field
- One compact segmented filter row: `전체 / 막힘 / 발행 가능 / 만료 주의 / 연결 필요`
- Optional right-aligned count summary: `9명 표시`

**Top metrics**
- Reduce the four large focus cards to either:
  - a single compact inline stat strip, or
  - removable summary chips above the list
- Do not show both focus cards and filter buttons at the same time.

**Customer list row design**
Each row should contain only:
- Customer/company name
- One primary status chip
- One short secondary meta line (business number or popbill/cert shorthand)
- One next action button or arrow affordance

Remove from default row view:
- verbose blocked-reason sentence
- duplicated popbill and certificate copy
- helper sentence under CTA

Blocked reason should appear only in the detail panel or as a short tooltip/secondary text when absolutely needed.

### Right column: selected customer side panel
Turn the right side into a calmer inspector panel.

**Top section**
- Customer name + business number
- One status chip
- One primary action button (`인증서 등록`, `팝빌 가입`, `상태 확인`, etc.)

**Status summary section**
Use a simple 2x2 info grid with short labels only:
- 현재 상태
- 막힌 이유
- 다음 행동
- 발행 방식

**Issue section**
- Show only unresolved issues
- Collapse completed/success checklist items by default
- Convert “막힌 이유 / 바로 해결” from multiple loud cards into a cleaner checklist/list group

**Secondary actions**
- Keep `더보기` for destructive/rare actions like 연결 해제 / 삭제
- Keep history tab, but visually demote it to a secondary tab after the overview

### New customer mode
For the empty/new-customer state, keep the existing “필수 4개 먼저” concept but simplify the chrome.

- Show a short intro block
- Keep only the four required fields visible by default
- Leave advanced fields inside `추가 입력 보기`
- Avoid extra progress cards unless they directly help completion

## Concrete File Plan

### 1) Simplify list-panel structure
**Files:** `web/src/features/customers/CustomersTab.tsx`, `web/src/styles.css`

- Remove or compress the alert banners at the top into a smaller inline status strip.
- Replace `customer-focus-grid` with a compact summary/filter strip or remove it entirely.
- Merge the filter buttons and the summary line into one toolbar zone.
- Remove `recentCustomers` from the primary visual flow or move it behind a small “최근 본 고객” disclosure.

Targeted areas:
- `CustomersTab.tsx:483-607`
- `styles.css:2996-3070`

### 2) Redesign customer rows as compact operational rows
**Files:** `web/src/features/customers/CustomersTab.tsx`, `web/src/styles.css`

- Replace the current 4-block article row with a tighter two-line list item.
- Keep only one human-readable reason or next-step clue, not both.
- Convert the action cell into a cleaner trailing CTA / chevron zone.
- Preserve keyboard selection behavior.

Targeted areas:
- `CustomersTab.tsx:608-663`
- `styles.css:3182-3321`

### 3) Reduce repetition in the detail panel
**Files:** `web/src/features/customers/CustomersTab.tsx`, `web/src/styles.css`

- Keep one headline status area.
- Replace the current callout + decision cards + stats row + status row stack with a single summary grid.
- Show only actionable issues by default.
- Keep `더보기` for destructive/low-frequency actions.

Targeted areas:
- `CustomersTab.tsx:679-824`
- `styles.css:3322+` (detail panel block and related customer detail styles)

### 4) Keep form mode simple and separate from inspection mode
**Files:** `web/src/features/customers/CustomersTab.tsx`, `web/src/styles.css`

- New customer creation should feel like a clean form, not like the selected-customer inspector.
- Retain the current advanced fields pattern, but reduce ornamental progress blocks if they distract from the required four fields.

Targeted areas:
- `CustomersTab.tsx:899-1028`

### 5) Rework responsive behavior around fewer layers
**Files:** `web/src/styles.css`

- On narrow widths, preserve one toolbar, one list, one detail stack.
- Remove nonessential summary modules before rows become cramped.
- Ensure filters wrap as pills or collapse into a simpler selector without duplicating metrics.

Targeted areas:
- `styles.css:5418-5655`

## Proposed Delivery Phases

### Phase 1 — Structural cleanup
- Remove redundant summary modules
- Consolidate toolbar/filter/search zones
- Preserve existing data/actions

### Phase 2 — List redesign
- Implement compact rows
- Tune hierarchy for blocked/ready states
- Reduce text length and secondary metadata

### Phase 3 — Detail panel redesign
- Build concise status summary
- Demote noisy issue presentation
- Keep history as secondary view

### Phase 4 — Mobile/responsive pass
- Verify one-column behavior
- Prevent row/detail overflow
- Ensure action buttons remain obvious

### Phase 5 — Copy pass
- Shorten labels and helper text across list/detail/form
- Remove duplicate operational explanations

## Acceptance Criteria

1. The customer screen shows at most one primary toolbar area above the list.
2. The default list view does not show both large summary cards and filter chips together.
3. Each customer row exposes no more than:
   - one main name block,
   - one status chip,
   - one short metadata line,
   - one action affordance.
4. The selected-customer panel has one headline status section and one concise info grid instead of multiple stacked status modules.
5. “Blocked reason” is shown once in the default detail view, not repeated across row + callout + cards.
6. New customer creation still supports the existing required four fields and advanced details flow.
7. At widths under the current mobile breakpoint, hierarchy remains readable without stacked redundant modules.
8. No new color system or component family is introduced outside the existing design tokens/components.

## Risks and Mitigations

- **Risk:** Simplifying too aggressively hides important issue context.
  - **Mitigation:** Keep the full issue list in the selected detail panel and use progressive disclosure rather than deleting data.
- **Risk:** Existing users may rely on at-a-glance metric cards.
  - **Mitigation:** Preserve counts in a lighter inline stat/filter strip.
- **Risk:** Compact rows may reduce discoverability of the next action.
  - **Mitigation:** Keep one clear trailing action per row and use selection highlight consistently.
- **Risk:** Form and detail states may become too visually similar.
  - **Mitigation:** Keep “new customer” mode with distinct introductory copy and default field focus.

## Verification Plan

1. Review the updated screen against `DESIGN.md` principles for one-surface layout and short operator-focused copy.
2. Run visual comparison against the current customer screen and the reference direction:
   - less vertical clutter above the list
   - more white space
   - fewer repeated status messages
3. Validate desktop behavior for:
   - searching
   - filter switching
   - selecting a customer
   - primary action click states
   - switching between overview/history
4. Validate mobile/narrow-width behavior for:
   - toolbar wrapping
   - row readability
   - detail stack readability
5. Run project checks after implementation:
   - `npm run check`
   - `npm run test:server`
   - targeted UI smoke if available

## Recommendation

Use a **list-first inspector layout** as the primary redesign path. This is the closest match to the reference images and the most aligned with AUTO-TAX’s existing design-system rule that the product should feel like a calm operational tool instead of a stacked dashboard.
