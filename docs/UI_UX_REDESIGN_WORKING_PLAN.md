# AUTO-TAX UI/UX Redesign Working Plan

> Status: Working doc  
> Date: 2026-04-11  
> Audience: future implementation agents and maintainers  
> Relationship:
> - `DESIGN.md` = current canonical design guide
> - `docs/UI_UX_REDESIGN_DESIGN_SYSTEM_V1.md` = redesign direction and design-system draft
> - `this doc` = merge strategy + naming normalization + frontend decomposition plan

---

## 1. Why this document exists

The redesign draft is useful for direction, but it is not enough to implement the redesign safely.

Three practical gaps remained:

1. how `DESIGN.md` should eventually absorb the redesign draft
2. how tokens / components / CSS naming should be normalized before broad UI work
3. how to split `App.tsx` and the oversized tab files so the redesign can be implemented without making the codebase worse

This document exists to close those gaps.

It is intentionally optimized for implementation work, not for presentation.

---

## 2. Current frontend shape snapshot

Measured on **2026-04-11**:

- `web/src/App.tsx`: **7444 lines**
- `web/src/features/customers/CustomersTab.tsx`: **1091 lines**
- `web/src/features/certificates/CertificatesTab.tsx`: **1002 lines**
- `web/src/features/initial-registration/InitialRegistrationTab.tsx`: **657 lines**
- `web/src/features/settings/SettingsTab.tsx`: **608 lines**
- `web/src/features/onboarding/OnboardingTab.tsx`: **331 lines**
- `web/src/components/ui.tsx`: shared UI primitives but still small and incomplete for a system-level redesign

Current structural signals:

- `App.tsx` owns too much orchestration, form state, and cross-tab behavior
- feature folders are too shallow for current complexity
- shared UI naming mixes generic names and legacy stylistic names
- CSS tokens and class names are not yet systematized for a large redesign

Implication:

- do **not** start the redesign by editing screens directly in place without a decomposition pass

---

## 3. Canonical documentation target state

## 3.1 Short version

Future steady state should be:

- `DESIGN.md` -> canonical design system + page archetypes + implementation rules
- `docs/UI_UX_REDESIGN_DESIGN_SYSTEM_V1.md` -> research / decision-history doc
- `docs/UI_UX_REDESIGN_WORKING_PLAN.md` -> implementation playbook until migration is complete

## 3.2 What goes where

### `DESIGN.md` future role

`DESIGN.md` should eventually be the **single canonical UI system doc**.

After merge, it should contain:

1. product tone and design principles
2. page archetypes
3. IA and navigation rules
4. visual tokens
5. component rules
6. interaction rules
7. content rules
8. accessibility baseline
9. implementation checklist

### `docs/UI_UX_REDESIGN_DESIGN_SYSTEM_V1.md` future role

Keep as:

- rationale
- external references
- major redesign decisions
- historical context for why the system changed

This should not become the day-to-day source of implementation truth after merge.

### `docs/UI_UX_REDESIGN_WORKING_PLAN.md` future role

Keep as long as migration is ongoing.

It should track:

- merge tasks
- naming migration
- component migration
- file decomposition
- sequencing risks

When migration is complete, this doc can be archived or reduced to a short migration record.

---

## 4. `DESIGN.md` merge structure plan

## 4.1 Merge goal

Do **not** replace `DESIGN.md` in one giant rewrite.

Instead:

- preserve the concise practical tone of the current file
- absorb the redesign system in structured passes
- keep historical rationale outside the canonical file

## 4.2 Target `DESIGN.md` outline

When merged, `DESIGN.md` should use this shape:

```md
# AUTO-TAX Design System

## 1. Product Role
## 2. Design Principles
## 3. Page Archetypes
## 4. Information Architecture
## 5. Layout System
## 6. Tokens
## 7. Core Components
## 8. Interaction Patterns
## 9. Content and Status Language
## 10. Accessibility Baseline
## 11. Feature-Specific Rules
## 12. Implementation Checklist
## 13. Migration Notes (short-lived; remove later)
```

## 4.3 Merge mapping

### Existing `DESIGN.md` sections to keep

- 제품 인상
- 핵심 원칙
- foundation
- layout rules
- component rules
- interaction rules
- copy rules
- responsive rules
- new UI checklist
- do / don’t

### New sections that must be merged in

From `docs/UI_UX_REDESIGN_DESIGN_SYSTEM_V1.md`:

- page archetypes
- IA rules
- expanded layout system
- token namespace redesign
- accessibility baseline
- queue/list/detail/checklist patterns
- migration guidance

## 4.4 Merge sequence

### Pass 1 — add cross-links only

Add top-of-file references in `DESIGN.md`:

- redesign draft
- working plan

No content replacement yet.

### Pass 2 — merge structure-heavy sections

Move into `DESIGN.md`:

- page archetypes
- IA/navigation
- expanded layout system
- interaction state rules

### Pass 3 — merge token/component naming

Move into `DESIGN.md`:

- canonical token naming
- component naming inventory
- CSS naming rules

### Pass 4 — collapse duplication

Remove duplicate guidance from the redesign draft once the canonical file fully covers it.

### Pass 5 — archive

Keep the redesign draft as a decision-history artifact or replace it with a short ADR-style note.

---

## 5. Naming normalization plan

This is the most important prerequisite before real UI implementation work.

Without it:

- token drift will increase
- CSS naming will become less searchable
- shared primitives will fragment
- feature screens will keep inventing their own local vocabulary

## 5.1 Naming principles

1. semantic first
2. shared before feature-local
3. implementation names should describe role, not style
4. no new legacy prefixes
5. do not rename everything at once; use compatibility aliases during migration

## 5.2 Token namespace target

### Canonical token prefixes

- `--color-*`
- `--space-*`
- `--radius-*`
- `--shadow-*`
- `--font-*`
- `--size-*`
- `--z-*`

Implementation note:

- the first alias pass should prioritize **namespace alignment without visual churn**
- where current shipped values are already deeply used (`--space-*`, current radius scale), keep the existing values first and defer future-state value changes to later redesign passes

### Target token groups

#### Color

- `--color-bg-canvas`
- `--color-bg-canvas-subtle`
- `--color-bg-surface`
- `--color-bg-surface-subtle`
- `--color-bg-surface-raised`
- `--color-border-default`
- `--color-border-strong`
- `--color-border-focus`
- `--color-text-default`
- `--color-text-subtle`
- `--color-text-muted`
- `--color-text-inverse`
- `--color-brand-default`
- `--color-brand-strong`
- `--color-brand-subtle`
- `--color-success-default`
- `--color-success-subtle`
- `--color-warning-default`
- `--color-warning-subtle`
- `--color-danger-default`
- `--color-danger-subtle`
- `--color-info-default`
- `--color-info-subtle`

#### Spacing

Use a 4px grid.

- `--space-1: 4px`
- `--space-2: 8px`
- `--space-3: 12px`
- `--space-4: 16px`
- `--space-5: 20px`
- `--space-6: 24px`
- `--space-8: 32px`
- `--space-10: 40px`
- `--space-12: 48px`

#### Radius

- `--radius-1: 6px`
- `--radius-2: 10px`
- `--radius-3: 14px`

#### Shadow

- `--shadow-1`
- `--shadow-2`

## 5.3 Legacy token compatibility map

During migration, keep compatibility aliases in `web/src/styles.css`.

Status:

- initial alias block added to `web/src/styles.css` on **2026-04-11**
- color / radius / shadow / font / size / z namespaces are now available for new code
- spacing values remain on the current shipped scale for now because the existing UI already depends on them

| Current token | Target token |
| --- | --- |
| `--bg` | `--color-bg-canvas` |
| `--bg-accent` | `--color-bg-canvas-subtle` |
| `--surface` | `--color-bg-surface` |
| `--surface-soft` | `--color-bg-surface-subtle` |
| `--surface-muted` | `--color-bg-surface-subtle` or a component-local derived value |
| `--surface-strong` | derived border/surface token; avoid as long-term canonical token |
| `--text` | `--color-text-default` |
| `--text-subtle` | `--color-text-subtle` |
| `--text-faint` | `--color-text-muted` |
| `--primary` | `--color-brand-default` |
| `--primary-strong` | `--color-brand-strong` |
| `--primary-soft` | `--color-brand-subtle` |
| `--success` | `--color-success-default` |
| `--success-soft` | `--color-success-subtle` |
| `--warning` | `--color-warning-default` |
| `--warning-soft` | `--color-warning-subtle` |
| `--danger` | `--color-danger-default` |
| `--danger-soft` | `--color-danger-subtle` |
| `--border` | `--color-border-default` |
| `--border-strong` | `--color-border-strong` |
| `--shadow-sm` | `--shadow-1` |
| `--shadow-md` | `--shadow-2` |
| `--radius-sm` | `--radius-1` |
| `--radius-md` | `--radius-2` |
| `--radius-lg` | `--radius-3` |

Rule:

- new code uses target tokens
- old tokens remain as aliases until migration is mostly done
- remove aliases only after shared primitives and major pages are migrated

## 5.4 React component naming target

### Shared primitives

Use names that describe function:

- `AppShell`
- `PageHeader`
- `AlertBand`
- `MetricStrip`
- `MetricCard`
- `FilterBar`
- `QueueTable`
- `DetailPane`
- `TaskChecklist`
- `SummaryList`
- `StatusBadge`
- `SectionMessage`
- `FormSection`
- `EmptyState`
- `SkeletonBlock`
- `ActivityTimeline`
- `Dialog`

### Compatibility wrappers

Current components can survive temporarily:

- `Panel`
- `SetupPanel`
- `AppDialog`
- `StatCard`
- `SurfaceCard`
- `SurfaceButton`

But the target is:

| Current component | Target direction |
| --- | --- |
| `Panel` | keep, but use as low-level section surface |
| `SetupPanel` | evolve into `TaskChecklistSection` or `FormSection` depending on use |
| `AppDialog` | keep API if useful, but rename surface/component docs to `Dialog` |
| `StatCard` | narrow to `MetricCard`; grouped usage becomes `MetricStrip` |
| `SurfaceCard` | rename to `AppSurface` or absorb into `Panel`/`DetailPane` usage |
| `SurfaceButton` | use sparingly; prefer explicit button variants |

Rule:

- do not introduce more generic names like `Card2`, `DashboardCard`, `InfoBox`

## 5.5 CSS class naming target

### Allowed prefixes

- `ui-` for shared primitives
- `layout-` for reusable layout patterns
- `page-` for page-level composition
- `feature-<slug>-` for feature-specific classes
- state classes: `is-*`, `has-*`

### Legacy prefixes

- `stitch-` = legacy; do not add new `stitch-*` classes

Rule:

- existing `stitch-*` classes may remain during migration
- new shared code must not use `stitch-*`

### Examples

Good:

- `ui-page-header`
- `ui-filter-bar`
- `layout-split-pane`
- `page-customers-shell`
- `feature-certificates-queue`
- `is-active`

Avoid:

- `stitch-dashboard-card-v2`
- `new-panel`
- `card-stronger`

## 5.6 Feature naming normalization

Feature directory and class naming should align with product IA:

| Current concept | Target concept |
| --- | --- |
| work | work / today-work |
| onboarding + initial-registration | onboarding |
| customers | customers |
| certificates | certificates |
| settings | workspace-settings |
| ops | platform-admin |

This does **not** mean renaming all files immediately.
It means new docs, new components, and new architecture should use the target product language.

---

## 6. Frontend decomposition plan

## 6.1 `App.tsx` target role

After decomposition, `App.tsx` should only own:

- auth/session bootstrap
- active workspace selection
- top-level data loading coordination
- top-level tab routing/selection
- global dialog portal
- top-level transient notifications

`App.tsx` should **not** directly own:

- per-feature form state
- per-feature filter state
- per-feature edit mode toggles
- feature-specific derived queues
- feature-specific helper messages

## 6.2 Target frontend shape

Recommended target structure:

```text
web/src/
  app/
    AppShell.tsx
    AppSidebar.tsx
    AppTopbar.tsx
    AppDialogs.tsx
    app-types.ts
    useAppBootstrap.ts
    useAppSession.ts
  components/
    ui/
      layout/
      feedback/
      data-display/
      forms/
      navigation/
      overlays/
  pages/
    work/
    onboarding/
    customers/
    certificates/
    workspace-settings/
    platform-admin/
  features/
    customers/
    certificates/
    onboarding/
    settings/
  lib/
    format/
    status/
    view-models/
```

If a large `pages/` introduction is too disruptive, use a transitional form:

```text
web/src/features/customers/
  CustomersPage.tsx
  components/
  hooks/
  model/
```

That is acceptable.

## 6.3 Transitional rule

Prefer **feature-local extraction first**, global relocation second.

Meaning:

- split large tab files inside their feature folders first
- once stable, move clearly shared pieces into `components/ui` or `lib`

This keeps churn smaller.

---

## 7. Per-screen split plan

## 7.1 Customers

Current file:

- `web/src/features/customers/CustomersTab.tsx` (~1091 lines)

Current migration status:

- first feature-local extraction started on **2026-04-11**
- extracted sections:
  - `components/CustomerAlerts.tsx`
  - `components/CustomerDetailOverview.tsx`
  - `components/CustomerReadSection.tsx`
  - `components/CustomerHistorySection.tsx`
  - `components/CustomerListEmptyState.tsx`
- goal of this pass: reduce `CustomersTab` breadth without changing ownership of form state yet

Target split:

```text
web/src/features/customers/
  CustomersPage.tsx
  components/
    CustomerQueueSummary.tsx
    CustomerListPane.tsx
    CustomerListFilters.tsx
    CustomerDetailHeader.tsx
    CustomerIssueChecklist.tsx
    CustomerSummaryList.tsx
    CustomerHistoryPanel.tsx
    CustomerRenewalPanel.tsx
    CustomerEditForm.tsx
  hooks/
    useCustomerListView.ts
    useCustomerDetailView.ts
  model/
    customer-view-model.ts
```

Split rules:

- list filtering logic moves to `useCustomerListView`
- readiness/checklist derivation moves to `customer-view-model.ts`
- edit state stays in `CustomerEditForm`
- history display stays separate from customer info

## 7.2 Certificates

Current file:

- `web/src/features/certificates/CertificatesTab.tsx` (~1002 lines)

Target split:

```text
web/src/features/certificates/
  CertificatesPage.tsx
  components/
    CertificateQueueSummary.tsx
    CertificateFilterBar.tsx
    CertificateQueueTable.tsx
    CertificateBatchActions.tsx
    CertificateDetailPane.tsx
    LinkedCustomerCertificateMatrix.tsx
    RenewalAssistantPanel.tsx
  hooks/
    useCertificateFilters.ts
    useBatchPrepareFlow.ts
  model/
    certificate-view-model.ts
```

Split rules:

- batch preparation state must leave the main page component
- certificate row derivation and grouping live in view-model code
- filter intent handling belongs in a small dedicated hook

## 7.3 Settings

Current file:

- `web/src/features/settings/SettingsTab.tsx` (~608 lines)

Target split:

```text
web/src/features/settings/
  WorkspaceSettingsPage.tsx
  components/
    SettingsNav.tsx
    SettingsStatusLine.tsx
    sections/
      MailSettingsSection.tsx
      BillingDefaultsSection.tsx
      MemberManagementSection.tsx
      SecuritySettingsSection.tsx
      LocalHelperSection.tsx
  hooks/
    useSettingsAutosaveState.ts
```

Split rules:

- one file per major settings section
- nav/status shell stays separate from field content
- install guide modal should be isolated

## 7.4 Onboarding / Initial registration

Current files:

- `web/src/features/onboarding/OnboardingTab.tsx`
- `web/src/features/initial-registration/InitialRegistrationTab.tsx`

Target direction:

- onboarding becomes the real product surface
- initial registration becomes a subflow under onboarding

Target split:

```text
web/src/features/onboarding/
  OnboardingPage.tsx
  components/
    OnboardingProgressHeader.tsx
    OnboardingTaskChecklist.tsx
    OnboardingReadinessPane.tsx
    steps/
      MailSetupStep.tsx
      BillingDefaultsStep.tsx
      CustomerImportStep.tsx
      CertificateLinkStep.tsx
      FirstRunCheckStep.tsx
  hooks/
    useOnboardingProgress.ts
```

For the current import-heavy subflows:

```text
web/src/features/initial-registration/
  components/
    OnboardingWorkbookImportPanel.tsx
    QuickRegisterPanel.tsx
    BillingMonthCompletionPanel.tsx
  hooks/
    useWorkbookPreview.ts
```

Rule:

- `initial-registration` becomes implementation detail
- `onboarding` becomes user-facing architecture

---

## 8. Shared primitive extraction plan

Before heavy page redesign, extract or formalize these primitives:

1. `PageHeader`
2. `AlertBand`
3. `StatusBadge`
4. `SectionMessage`
5. `SummaryList`
6. `FilterBar`
7. `QueueTable`
8. `EmptyState`
9. `SkeletonBlock`
10. `Dialog`

Recommended implementation order:

### Step A

Low-risk wrappers around current styles:

- `StatusBadge`
- `SectionMessage`
- `EmptyState`

Status:

- initial wrappers landed in `web/src/components/ui.tsx` + `web/src/styles.css` on **2026-04-11**
- current goal was API and naming stabilization, not page-level adoption yet
- first live adoption landed in shared primitives: `AppDialog` + `SetupPanel` now render `StatusBadge`
- first feature-level adoption landed in `CertificatesTab`: unlinked certificate compact empty block now uses `EmptyState`
- broader `CertificatesTab` adoption landed next: queue status note uses `SectionMessage`, customer status chips use `StatusBadge`, and linked-certificate empty state uses `EmptyState`
- broader `CustomersTab` adoption landed next: top certificate warnings use `SectionMessage`, readiness chips use `StatusBadge`, and list/history empty states use `EmptyState`

### Step B

Layout primitives:

- `PageHeader`
- `SummaryList`
- `FilterBar`

### Step C

Higher-impact list/queue primitives:

- `QueueTable`
- `DetailPane`
- `ActivityTimeline`

### Step D

Migrate feature screens onto those primitives.

---

## 9. Safe implementation order

This is the order that minimizes churn.

## 9.1 Stage 0 — documentation and inventory

- keep current docs linked
- freeze target names in docs before code churn

## 9.2 Stage 1 — token layer

- add canonical tokens ✅ initial alias pass landed in `web/src/styles.css` on 2026-04-11
- keep legacy aliases
- no visual redesign yet

## 9.3 Stage 2 — primitive layer

- build new shared primitives ✅ Step A wrappers (`StatusBadge`, `SectionMessage`, `EmptyState`) landed on 2026-04-11
- keep old screens working

## 9.4 Stage 3 — screen decomposition

- split `SettingsTab`
- split `CustomersTab` ✅ started with feature-local section extraction on 2026-04-11
- split `CertificatesTab`
- move onboarding subflows under onboarding

## 9.5 Stage 4 — visual redesign on top of split screens

- rebuild `오늘 작업`
- rebuild `도입 준비`
- rebuild `고객 운영`
- rebuild `인증서 관리`

## 9.6 Stage 5 — remove legacy names

- stop adding old tokens/classes
- rename legacy primitives only after usage is reduced enough

Rule:

- do not combine Stage 1 through Stage 5 in a single PR

---

## 10. Non-negotiable guardrails

1. no new dependencies just for styling
2. no giant CSS rewrite before component boundaries exist
3. no full token rename without alias compatibility
4. no page redesign while `App.tsx` still directly owns all feature-local state for that screen
5. no new `stitch-*` classes
6. no new one-off status chips with custom colors
7. do not move onboarding and initial-registration concepts apart again

---

## 11. Working checklist for future implementation agents

Before editing UI code:

- which page archetype is this?
- does the page already have shared primitives available?
- can the logic first be moved out of `App.tsx` or the tab file?
- are new names using canonical prefixes?
- are old names being kept only as compatibility aliases?

Before finishing:

- are labels visible?
- are blocked reasons near the top?
- does loading have a deliberate strategy?
- does the screen reduce card nesting?
- is the implementation moving toward the target file structure?

---

## 12. Recommended near-term doc tasks

These are the next documentation actions worth taking:

1. add a short cross-link block at the top of `DESIGN.md`
2. keep this working plan updated when decomposition starts
3. once token work begins, add an actual alias block to `web/src/styles.css` ✅ done 2026-04-11
4. when the first page archetype ships, update `DESIGN.md` instead of only updating the redesign draft

---

## 13. Bottom line

The redesign is feasible, but only if it is treated as:

- a **design-system migration**
- a **naming cleanup**
- and a **frontend decomposition**

not just a visual refresh.

The safest path is:

1. document names
2. add token aliases
3. extract primitives
4. split large screens
5. redesign the screens

Anything else will make the UI prettier and the implementation harder at the same time.
