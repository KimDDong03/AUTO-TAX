# AUTO-TAX UI/UX Redesign Design System v1

> Status: Draft  
> Date: 2026-04-11  
> Scope: full-product UI/UX redesign guidance  
> Note: this document is a redesign draft. `DESIGN.md` remains the current canonical design guide until this draft is explicitly adopted and merged. For implementation sequencing, naming normalization, and frontend decomposition, also see `docs/UI_UX_REDESIGN_WORKING_PLAN.md`.

## 1. Why this draft exists

AUTO-TAX already has meaningful functionality, but the current UX still reflects internal system boundaries more than user goals.

Current product documents point to the same structural problems:

- first success is not guided strongly enough
- daily work is visible, but not always ordered by urgency
- customer detail shows status, but not always the reason and next action clearly enough
- certificate management is still too certificate-centric instead of action-centric
- `App.tsx` and several screens still carry orchestration complexity directly in the UI

This v1 draft proposes a redesign direction that is broader than a paint refresh.

The redesign should treat AUTO-TAX as:

- **an operations cockpit** for recurring invoice and certificate work
- **a guided setup product** for new workspaces
- **a triage-first admin tool** for exceptions, blocked states, and audits

It should **not** become:

- a marketing-style SaaS dashboard
- an analytics-first BI surface
- a card-heavy consumer app
- a novelty-heavy design exercise

---

## 2. External reference review

This draft is based on current official references and product docs reviewed on **2026-04-11**.

### 2.1 GitHub security overview

Reference:

- https://docs.github.com/en/code-security/reference/security-at-scale/security-overview-dashboard-metrics
- https://docs.github.com/en/code-security/concepts/security-at-scale/about-security-overview

What is useful:

- the overview is structured around **detection / remediation / prevention**, not raw objects
- top-level filters update the whole view consistently
- trend indicators compare against the previous period
- the dashboard includes **impact analysis tables** to show where intervention matters most

AUTO-TAX takeaway:

- `오늘 작업` should be organized around **urgent exceptions, current work, and recovery velocity**, not only totals
- summary metrics should lead into **actionable queues**
- “top risk / top blocked customers” tables are more useful than more top-row cards

### 2.2 Linear inbox

Reference:

- https://linear.app/docs/inbox

What is useful:

- the inbox is treated as a **notification center with actions**, not a passive feed
- users can filter quickly, search quickly, and act from the list view
- list + detail works well for high-frequency triage

AUTO-TAX takeaway:

- `오늘 작업`, `고객 운영`, and `인증서 관리` should bias toward **queue + detail**
- keyboard-friendly list interaction matters for dense operator workflows
- filters must be fast, visible, and reversible

### 2.3 Stripe dashboard, customers, invoicing, and team settings

Reference:

- https://docs.stripe.com/dashboard/basics
- https://docs.stripe.com/billing/customer
- https://docs.stripe.com/invoicing/dashboard
- https://docs.stripe.com/get-started/account/checklist
- https://docs.stripe.com/get-started/account/teams

What is useful:

- the dashboard sidebar clearly separates operational areas from settings
- customer lists rely on filters and detail pages rather than deep nested cards
- invoice creation keeps drafts and workflow state obvious
- account checklist turns setup into a visible readiness flow
- team access is role-based and edited from a clear settings surface

AUTO-TAX takeaway:

- `도입 준비` needs a real **readiness checklist**
- `고객 운영` should use **list -> detail -> action**
- `작업공간 설정` should feel like a dedicated settings area, not a general dashboard tab
- autosave and draft/pending state must be obvious

### 2.4 Gusto onboarding checklist

Reference:

- https://support.gusto.com/article/210728175340400/View-and-complete-onboarding-checklists-for-admins

What is useful:

- onboarding is represented as a real task list
- overdue and blocked conditions are explicit
- completion changes the entity’s lifecycle state

AUTO-TAX takeaway:

- `도입 준비` should be a **task completion surface**, not a loose collection of forms
- tasks need states like `시작 전`, `진행 중`, `완료`, `점검 필요`
- some steps are required, some optional, and that distinction should be visible

### 2.5 GOV.UK task list, summary list, notification banner

Reference:

- https://design-system.service.gov.uk/components/task-list/
- https://design-system.service.gov.uk/patterns/complete-multiple-tasks/
- https://design-system.service.gov.uk/components/summary-list/
- https://design-system.service.gov.uk/components/notification-banner/

What is useful:

- use a task list only when work spans multiple tasks and potentially multiple sessions
- task names must stay short and concrete
- status text should be scannable and readable
- summary lists are excellent for **facts + inline change actions**
- notification banners should be used sparingly and only for the right level of message

AUTO-TAX takeaway:

- `도입 준비` should use a task-list pattern because setup is multi-step and multi-session
- customer/company/certificate facts should be displayed as a **summary list**, not ad hoc field piles
- global banners must be reserved for service-wide issues; page-specific issues belong in section-level alerts

### 2.6 Primer Product UI

Reference:

- https://primer.style/product/
- https://primer.style/product/ui-patterns
- https://primer.style/product/ui-patterns/loading/
- https://primer.style/design/ui-patterns/saving/
- https://primer.style/product/ui-patterns/progressive-disclosure/
- https://primer.style/product/components/text-input/accessibility/
- https://primer.style/product/components/page-layout/accessibility/
- https://primer.style/product/components/nav-list/accessibility/
- https://primer.style/product/components/heading/accessibility/
- https://primer.style/product/components/token/accessibility/

What is useful:

- visible labels are mandatory; placeholders are not labels
- page layout should use clear landmarks and reduce cognitive load
- loading behavior should change by expected wait time
- progressive disclosure should be used sparingly and paired with text
- save patterns should be chosen intentionally and not mixed inside one form
- tokens / labels / navigation components all have explicit accessibility expectations

AUTO-TAX takeaway:

- settings forms need stricter labeling and error association
- loading states must be more deliberate
- section hierarchy and headings need to become more systematic
- chips and badges must maintain contrast and target sizes

### 2.7 Atlassian Design System

Reference:

- https://atlassian.design/foundations/content/designing-messages/
- https://atlassian.design/foundations/content/
- https://atlassian.design/components/button
- https://atlassian.design/components/form/
- https://atlassian.design/components/section-message

What is useful:

- use different message components for different scopes
- success, info, warning, and error each need different tone and structure
- button copy should describe what will happen
- UI copy should be short, scannable, and sentence-case

AUTO-TAX takeaway:

- success copy should say what changed, not just “성공”
- warnings should describe the impact and next action
- section-level status feedback should become a reusable component pattern

### 2.8 Carbon Design System

Reference:

- https://carbondesignsystem.com/components/data-table/usage/
- https://carbondesignsystem.com/components/data-table/accessibility/
- https://carbondesignsystem.com/patterns/loading-pattern/
- https://carbondesignsystem.com/patterns/dialog-pattern

What is useful:

- data tables support sorting, expansion, batch actions, and a toolbar
- row hover helps scanning even when rows are not clickable
- loading should distinguish skeleton, inline loading, and full-screen loading
- complex tables should generally stay out of dialogs

AUTO-TAX takeaway:

- queues and dense admin lists should use a consistent toolbar/table pattern
- row expansion is better than deep card nesting for secondary detail
- dialogs should stay short and decisive

### 2.9 Shopify app design guidelines

Reference:

- https://shopify.dev/docs/apps/design
- https://shopify.dev/apps/design/app-structure
- https://shopify.dev/apps/launch/built-for-shopify/requirements

What is useful:

- good admin tools feel familiar inside their host environment
- mobile and embedded contexts matter from the start
- predictable spacing, page headers, and app body structure build trust

AUTO-TAX takeaway:

- AUTO-TAX should adopt a **repeatable app shell anatomy**
- page headers, nav, and body layout must look systematic across every tab

---

## 3. What the redesign should actually do

### 3.1 Product north star

AUTO-TAX should feel like:

- **a calm control room**
- **a guided setup checklist**
- **a dense but readable operator console**

The redesign should optimize for these three outcomes:

1. a new workspace can reach **first invoice issuance** without guessing
2. a daily operator can see **what needs action now**
3. a reviewer can understand **why something is blocked and what to do next**

### 3.2 UX strategy

Do not redesign page by page in isolation.

The product needs **three page archetypes**:

1. **Guided setup page**
   - for `도입 준비`
   - checklist + readiness + next step

2. **Operational queue page**
   - for `오늘 작업`, `인증서 관리`
   - alerts + filter bar + queue table + quick actions

3. **Record workbench page**
   - for `고객 운영`, `작업공간 설정`, parts of `플랫폼 관리자`
   - list/detail or nav/content layout with a clear primary pane

This is the core redesign decision.

The system should not use one generic “dashboard card grid” pattern everywhere.

---

## 4. Information architecture v1

### 4.1 Primary navigation

Primary tabs:

1. `오늘 작업`
2. `도입 준비`
3. `고객 운영`
4. `인증서 관리`
5. `작업공간 설정`
6. `플랫폼 관리자`

### 4.2 Navigation rules

- primary nav should remain in the left sidebar
- only one top-level destination is active at a time
- each destination should have one clear user job
- avoid cross-linking users into hidden settings when a blocked reason can open the exact required task

### 4.3 Page-level subnavigation

Use page-level subnav only when it reduces complexity.

Allowed:

- `작업공간 설정`: `메일`, `발행 기본값`, `구성원`, `보안`, `연동`
- `플랫폼 관리자`: `작업공간`, `지원 요청`, `로그`

Avoid subnav for:

- `오늘 작업`
- `도입 준비`

Those should remain single-story pages.

---

## 5. Layout system v1

## 5.1 Shell anatomy

Every page uses the same outer structure:

1. **App nav**
2. **Page header**
3. **Optional alert band**
4. **Main content area**
5. **Optional side context pane**

### 5.2 Width and density

- desktop content width: fluid, with a comfortable max around `1440px`
- standard content gutter: `24px`
- dense desktop table text is acceptable
- mobile should collapse to a single-column flow

### 5.3 Grid

Base layout grid:

- 12-column page grid on desktop
- 8-column tablet adaptation
- 4-column mobile adaptation

Recommended page patterns:

- setup page: `8 / 4` split
- operational queue page: full-width queue + optional right context pane
- settings page: left nav + right content
- customer workbench: list pane + detail pane

### 5.4 Spacing scale

Adopt a simpler 4px-based scale:

- `4`
- `8`
- `12`
- `16`
- `20`
- `24`
- `32`
- `40`
- `48`

Rule:

- use spacing to show hierarchy before using borders or shadows

### 5.5 Elevation

Use only 3 surface levels:

- canvas
- surface
- raised surface

Avoid more than one raised child inside a raised parent.

---

## 6. Visual foundation v1

### 6.1 Tone

The redesign should remain:

- calm
- structured
- high-trust
- low-noise

It may become more polished, but not more decorative.

### 6.2 Color tokens

Proposed token set:

```css
:root {
  --color-bg-canvas: #f4f7fb;
  --color-bg-canvas-subtle: #eef3f8;
  --color-bg-surface: #ffffff;
  --color-bg-surface-subtle: #f7f9fc;
  --color-bg-surface-raised: #ffffff;

  --color-border-default: #d8e0ea;
  --color-border-strong: #bcc7d5;
  --color-border-focus: #3b82f6;

  --color-text-default: #16202a;
  --color-text-subtle: #445266;
  --color-text-muted: #66768d;
  --color-text-inverse: #ffffff;

  --color-brand-default: #0b57d0;
  --color-brand-strong: #0847ad;
  --color-brand-subtle: #e7efff;

  --color-success-default: #1f7a47;
  --color-success-subtle: #e9f6ee;
  --color-success-border: #b9dfc6;

  --color-warning-default: #9a6200;
  --color-warning-subtle: #fff3da;
  --color-warning-border: #efcf8f;

  --color-danger-default: #c23a2b;
  --color-danger-subtle: #fde7e4;
  --color-danger-border: #f1bdb7;

  --color-info-default: #1668c7;
  --color-info-subtle: #e7f0fe;
  --color-info-border: #bdd3fb;
}
```

Rules:

- color is semantic first, decorative second
- use surface and border shifts before introducing more color
- red should primarily indicate **blocked / failed / risky**
- orange should indicate **needs attention soon**
- blue should indicate **context / progress / selection**
- green should indicate **confirmed completion or healthy state**

### 6.3 Typography

Primary font stack:

- `Pretendard Variable`
- `SUIT Variable`
- `Noto Sans KR`
- `Malgun Gothic`

Suggested scale:

- page title: `24 / 32`, `700`
- section title: `18 / 26`, `700`
- panel title: `16 / 24`, `700`
- body: `14 / 22`, `400~500`
- dense body/table: `13 / 20`, `400~500`
- meta/caption: `12 / 18`, `500`

Rules:

- base UI copy should remain readable at dense operational sizes
- avoid gray for critical values
- heading hierarchy must match document hierarchy

### 6.4 Radius and shadow

Proposed scale:

- small: `6px`
- medium: `10px`
- large: `14px`

Shadows:

- `shadow-sm`: subtle hover/raised state
- `shadow-md`: dialogs and floating surfaces only

Rules:

- buttons and fields should not look pill-shaped
- shadows should be soft and sparse
- structure should do most of the work

### 6.5 Iconography

- line icons only
- use icons to reinforce meaning, not replace text
- status icons must always be paired with status text

---

## 7. Interaction system v1

### 7.1 Save patterns

Apply one save model per form.

#### Autosave

Use for:

- workspace settings
- toggle-based configuration
- fields where immediate persistence reduces friction

Required visible states:

- `저장 전`
- `저장 중`
- `저장됨`
- `저장 실패`

#### Explicit save

Use for:

- multi-field business actions
- destructive changes
- actions with legal or external-system consequences

Rule:

- do not mix autosave and explicit save inside one logical form

### 7.2 Loading

Based on Primer and Carbon guidance:

- `< 1s`: no loading indicator
- `1–3s`: inline spinner or button loading state
- `3–10s`: skeleton or determinate progress if possible
- `> 10s`: background job pattern + persistent status message

Rules:

- never leave the user guessing whether the app is frozen
- preserve layout during loading to reduce jumpiness
- when partial data is available, render it progressively

### 7.3 Feedback

Use the right scope:

- **inline validation** for one field
- **section message** for one panel/flow
- **page alert band** for page-wide issues
- **global banner** only for environment/service-wide issues
- **dialog** for decisions, not for status reporting

### 7.4 Confirmation

Always confirm:

- delete
- reset
- bulk issue
- external state change with cost or legal effect
- irreversible certificate/payment-related actions

### 7.5 Progressive disclosure

Use sparingly.

Good uses:

- advanced options
- secondary diagnostics
- long logs and raw technical detail

Bad uses:

- hiding primary actions
- hiding required context for the current task
- turning simple forms into accordion mazes

---

## 8. Content design v1

### 8.1 Tone of voice

AUTO-TAX copy should be:

- factual
- calm
- short
- operator-centered

It should not be:

- celebratory by default
- marketing-heavy
- vague
- repetitive

### 8.2 Button labels

Prefer verbs:

- `저장`
- `연결 확인`
- `재동기화`
- `고객 등록`
- `인증서 연결`
- `결제 열기`
- `전체 발행`

Avoid:

- `확인`
- `진행`
- `완료`

unless the context is already explicit.

### 8.3 Status vocabulary

Core status set:

- `준비됨`
- `진행 중`
- `점검 필요`
- `조치 필요`
- `검토 필요`
- `실패`
- `만료 임박`
- `미연결`
- `완료`

Rules:

- keep statuses short
- use sentence case, not uppercase
- do not invent near-synonyms screen by screen

### 8.4 Success and error copy

Success:

- say what changed
- no exclamation marks
- no generic “성공”

Examples:

- `메일 설정 저장됨`
- `고객 12건을 등록했습니다`
- `인증서 연결을 마쳤습니다`

Errors:

- say what failed
- say what the user can do next

Examples:

- `메일 연결을 확인하지 못했습니다. 비밀번호와 IMAP 설정을 다시 확인해 주세요.`
- `인증서 결제 페이지를 열지 못했습니다. 로컬 도우미 연결 상태를 먼저 점검해 주세요.`

---

## 9. Accessibility baseline v1

The redesign must meet these baseline requirements:

- every field has a visible label
- placeholder is never the only label
- heading hierarchy is logical and implemented correctly
- exactly one main landmark per page
- navigation is labeled
- status is not conveyed by color alone
- interactive targets should be at least `24x24`, preferably `32x32`
- focus styles are visible and consistent
- loading and async results are announced appropriately
- text contrast meets WCAG AA expectations

Additional product rules:

- table rows should be keyboard reachable when interactive
- row actions must remain usable without hover
- dialog focus trap is mandatory
- truncated business-critical text should prefer wrapping over ellipsis

---

## 10. Core component inventory v1

These are the reusable building blocks the redesign should standardize.

### 10.1 AppShell

Purpose:

- global navigation
- workspace context
- global status entry points

Rules:

- one sidebar model across the app
- active section is always obvious
- avoid per-page custom shells

### 10.2 PageHeader

Contents:

- title
- subtitle
- primary action
- optional secondary actions
- optional compact health summary

Rules:

- one primary action max
- subtitle explains current job, not system trivia
- no huge hero treatment

### 10.3 AlertBand

Purpose:

- page-level warnings or deadlines

Rules:

- appears below page header
- max one per page by default
- merge similar alerts into one message

### 10.4 StatStrip

Purpose:

- compact KPI/status summary

Rules:

- max 4 items
- only use when metrics help choose what to do next
- if metrics do not drive action, remove them

### 10.5 FilterBar

Contents:

- quick filters
- search
- date/status selectors
- saved/default view
- result count

Rules:

- filters stay visible above queues
- changing filters should preserve context and not reset unrelated state unnecessarily

### 10.6 QueueTable

Purpose:

- main operational list for work items

Capabilities:

- sorting
- filtering
- row actions
- optional row expansion
- empty state inside the table container

Rules:

- toolbar belongs to the table, not in a separate random card
- use hover for scanning support, not as the only interaction cue
- batch actions only when operationally justified

### 10.7 DetailPane

Purpose:

- show the selected customer, certificate, or workspace record

Rules:

- header includes status + name + primary action
- blocked reasons must be visible near the top
- use summary list and action checklist before long raw forms

### 10.8 TaskChecklist

Purpose:

- guided setup and multi-session completion

Rules:

- one row = one meaningful task
- task names must be short and concrete
- each row shows status and next action
- optional hint text stays one short sentence

### 10.9 SummaryList

Purpose:

- read-only facts with inline change actions

Use for:

- company details
- certificate metadata
- workspace defaults
- connection status summaries

### 10.10 StatusBadge

Purpose:

- compact state labeling

Variants:

- neutral
- info
- success
- warning
- danger

Rules:

- semantic colors only
- no raw hex usage in feature code
- keep label text short

### 10.11 SectionMessage

Purpose:

- section-scoped information, warning, error, or success

Rules:

- should sit immediately above the affected content
- should explain impact and next action
- do not use modal for this

### 10.12 FormSection

Purpose:

- group related fields and one save model

Rules:

- visible labels required
- helper text below label or field
- secrets use dedicated reveal/copy patterns
- error message must explain correction path

### 10.13 EmptyState

Purpose:

- communicate absence meaningfully

Structure:

- title
- one-sentence explanation
- one relevant action max

Rules:

- no illustration-first empty states for dense admin screens
- empty states in tables and panels should stay inside the same surface

### 10.14 SkeletonState

Purpose:

- communicate loading without layout shift

Rules:

- mirror the final shape
- use for panels, lists, and tables
- do not skeletonize every button/control

### 10.15 Dialog

Purpose:

- irreversible decision
- short form
- important confirmation

Rules:

- concise title
- direct explanation
- explicit confirm button label
- no large tables or complex workflows in dialogs

### 10.16 ActivityTimeline

Purpose:

- audit trail and recent work

Use for:

- sync results
- issuance activity
- renewal operations
- workspace admin activity

---

## 11. Page blueprints v1

### 11.1 오늘 작업

Pattern:

- page header
- alert band for urgent exceptions
- compact stat strip
- main queue table
- recent activity timeline

Priority order:

1. urgent exceptions
2. ready-to-process queue
3. recent actions

Do not:

- stack multiple competing summary cards above the queue

### 11.2 도입 준비

Pattern:

- progress header
- task checklist
- right-side readiness summary

Five default tasks:

1. 메일 연결
2. 발행 기본값
3. 고객 등록
4. 인증서 연결
5. 첫 동기화 / 첫 발행 확인

Each task shows:

- current status
- why it matters
- next action
- success condition

### 11.3 고객 운영

Pattern:

- filter/search rail
- customer list
- selected customer detail workbench

Customer detail top block:

- `발행 가능` or `발행 불가`
- blocked-reason checklist
- immediate fixes

Do not bury blocked reasons below unrelated metadata.

### 11.4 인증서 관리

Pattern:

- default view = `조치 필요`
- grouped queue
- selected certificate/customer linkage detail

Primary buckets:

- `갱신 필요`
- `결제 가능`
- `미연결`
- `정상 연결`

### 11.5 작업공간 설정

Pattern:

- left nav
- right content pane
- section-scoped autosave

Suggested sections:

- 메일
- 발행 기본값
- 구성원
- 보안
- 연동 / 로컬 도우미

### 11.6 플랫폼 관리자

Pattern:

- dense tables
- workspace detail drawer/pane
- logs and support queues

Rule:

- reuse the same table, filter, and detail components rather than inventing separate admin-only visual language

---

## 12. Migration guidance from current system

This redesign should be implemented as an evolution, not a visual reset with random one-off components.

### 12.1 Keep

- `Panel`
- `SetupPanel`
- `AppDialog`
- chip/status semantics
- current calm blue-based brand direction
- sidebar + work area shell

### 12.2 Refactor

- `StatCard` -> `StatStrip` family with stricter usage rules
- settings sections -> `FormSection` + autosave state pattern
- customer detail -> `SummaryList` + blocked-reason checklist
- certificate queues -> `QueueTable` + grouped states

### 12.3 Add

- `PageHeader`
- `AlertBand`
- `FilterBar`
- `QueueTable`
- `TaskChecklist`
- `SectionMessage`
- `SummaryList`
- `SkeletonState`
- `ActivityTimeline`

### 12.4 Avoid

- adding more nested “surface inside surface inside panel” patterns
- introducing new decorative color families without semantic need
- implementing separate ad hoc styles per feature team/file

---

## 13. Implementation priorities

### Phase 1 — foundation

- align tokens in `web/src/styles.css`
- add missing primitives in `web/src/components/ui.tsx`
- standardize page header, alert band, filter bar

### Phase 2 — shell and settings

- stabilize shell anatomy
- convert settings to nav/content + autosave sections
- apply consistent heading hierarchy

### Phase 3 — operational pages

- rebuild `오늘 작업` into triage-first queue
- rebuild `인증서 관리` around action-needed grouping

### Phase 4 — workbench pages

- rebuild `고객 운영` around list/detail + blocked reasons
- align admin tables and drawers to the same system

### Phase 5 — polish and hardening

- loading and skeleton consistency
- focus and keyboard pass
- copy pass
- mobile reflow pass

---

## 14. Design principles checklist

Before shipping a redesigned screen, confirm:

1. does the page match one of the three page archetypes?
2. is the primary user job obvious within 3 seconds?
3. is the primary action unique and easy to find?
4. are blocked states explained with a next action?
5. are labels visible and headings hierarchical?
6. is there a deliberate loading strategy?
7. are notifications scoped correctly?
8. are we using table/list density where the work is dense, and checklist guidance where the work is sequential?
9. does the page avoid nested cards?
10. does mobile collapse cleanly into one column?

---

## 15. Bottom line

The AUTO-TAX redesign should not be led by “make it prettier.”

It should be led by:

- **triage-first operations**
- **guided first success**
- **blocked-reason clarity**
- **consistent admin-grade structure**

If v1 is adopted, the future canonical `DESIGN.md` should evolve from:

- a component-and-tone guide

to:

- a **full product design system** covering
  - page archetypes
  - tokens
  - messaging
  - loading
  - settings behavior
  - operational queues
  - accessibility

---

## 16. Source links

- GitHub Security overview dashboard metrics: https://docs.github.com/en/code-security/reference/security-at-scale/security-overview-dashboard-metrics
- GitHub About security overview: https://docs.github.com/en/code-security/concepts/security-at-scale/about-security-overview
- Linear Inbox: https://linear.app/docs/inbox
- Stripe Web Dashboard: https://docs.stripe.com/dashboard/basics
- Stripe Customers: https://docs.stripe.com/billing/customer
- Stripe Invoicing dashboard: https://docs.stripe.com/invoicing/dashboard
- Stripe account checklist: https://docs.stripe.com/get-started/account/checklist
- Stripe teams: https://docs.stripe.com/get-started/account/teams
- Gusto onboarding checklist: https://support.gusto.com/article/210728175340400/View-and-complete-onboarding-checklists-for-admins
- GOV.UK task list: https://design-system.service.gov.uk/components/task-list/
- GOV.UK complete multiple tasks: https://design-system.service.gov.uk/patterns/complete-multiple-tasks/
- GOV.UK summary list: https://design-system.service.gov.uk/components/summary-list/
- GOV.UK notification banner: https://design-system.service.gov.uk/components/notification-banner/
- Primer Product UI: https://primer.style/product/
- Primer UI patterns: https://primer.style/product/ui-patterns
- Primer loading: https://primer.style/product/ui-patterns/loading/
- Primer saving: https://primer.style/design/ui-patterns/saving/
- Primer progressive disclosure: https://primer.style/product/ui-patterns/progressive-disclosure/
- Primer text input accessibility: https://primer.style/product/components/text-input/accessibility/
- Primer page layout accessibility: https://primer.style/product/components/page-layout/accessibility/
- Primer nav list accessibility: https://primer.style/product/components/nav-list/accessibility/
- Primer heading accessibility: https://primer.style/product/components/heading/accessibility/
- Primer token accessibility: https://primer.style/product/components/token/accessibility/
- Atlassian designing messages: https://atlassian.design/foundations/content/designing-messages/
- Atlassian content guidance: https://atlassian.design/foundations/content/
- Atlassian form component: https://atlassian.design/components/form/
- Atlassian section message: https://atlassian.design/components/section-message
- Carbon data table usage: https://carbondesignsystem.com/components/data-table/usage/
- Carbon data table accessibility: https://carbondesignsystem.com/components/data-table/accessibility/
- Carbon loading pattern: https://carbondesignsystem.com/patterns/loading-pattern/
- Carbon dialog pattern: https://carbondesignsystem.com/patterns/dialog-pattern
- Shopify app design guidelines: https://shopify.dev/docs/apps/design
- Shopify app structure: https://shopify.dev/apps/design/app-structure
- Shopify Built for Shopify design requirements: https://shopify.dev/apps/launch/built-for-shopify/requirements
