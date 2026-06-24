# AUTO-TAX Design System

Status: canonical_design.

AUTO-TAX UI is a dense B2B operations console. The interface should help users quickly understand what is complete, what is blocked, and what action comes next.

## Core Direction

Keywords:

- Angular structure
- Thin lines
- Low-saturation colors
- Dense information layout
- Clear status hierarchy
- Work-first console UI
- Minimal decoration

Avoid:

- Soft, rounded SaaS landing-page styling
- Floating decorative cards
- Heavy shadows
- Gradients and ornamental backgrounds
- Loose spacing that reduces scan speed
- Excessive purple, blue-purple, beige, or dark slate themes

## Palette

### Base

```css
--bg-page: #f6f8fb;
--bg-surface: #ffffff;
--bg-muted: #f8fafc;
--bg-subtle: #f1f5f9;
```

### Borders

```css
--border-default: #dbe3ee;
--border-subtle: #e2e8f0;
--border-strong: #cbd5e1;
```

### Text

```css
--text-primary: #111827;
--text-secondary: #475569;
--text-muted: #64748b;
--text-faint: #94a3b8;
```

### Primary

```css
--primary: #2563eb;
--primary-soft: #eff6ff;
--primary-border: #bfdbfe;
--primary-text: #1d4ed8;
```

### Status

```css
--success: #16a34a;
--success-soft: #f0fdf4;
--success-border: #bbf7d0;

--warning: #d97706;
--warning-soft: #fffbeb;
--warning-border: #fde68a;

--danger: #dc2626;
--danger-soft: #fef2f2;
--danger-border: #fecaca;
```

Color rules:

- Use white and cool gray as the default surface language.
- Use blue only for current state, selection, and primary action.
- Use success, warning, and danger colors only for status meaning.
- Do not use color as decoration.
- Do not give every card a different accent color.

## Typography

Use compact, practical typography. AUTO-TAX screens should feel precise and operational, not editorial.

Recommended scale:

```css
--font-xs: 12px;
--font-sm: 13px;
--font-md: 14px;
--font-lg: 16px;
--font-xl: 18px;
```

Usage:

- Page title: 16-18px, 800-900 weight
- Section title: 14-16px, 700-800 weight
- Body description: 13px, 600-700 weight
- Helper text: 12px, 500-600 weight
- Table and list text: 12-13px
- Button text: 13px, 700 weight

Text rules:

```css
letter-spacing: 0;
line-height: 1.35-1.5;
word-break: keep-all;
overflow-wrap: anywhere;
```

Do not use negative letter spacing. Do not scale font size with viewport width.

## Layout

The main layout unit is a work panel. A work panel groups one task, its current state, inputs, actions, and result feedback.

Preferred flow:

```text
Current state -> Required input -> Action -> Result or validation
```

Panel style:

```css
border: 1px solid var(--border-default);
border-radius: 6px;
background: var(--bg-surface);
box-shadow: none;
```

Spacing scale:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
```

Spacing rules:

- Related controls: 6-10px
- Sections inside a panel: 12-16px
- Panel padding: 12-16px
- Avoid large empty vertical gaps.
- Prefer alignment over decoration.

Structure rules:

- Keep information from the same task inside one panel.
- Do not place status cards far away from the action they describe.
- Do not nest cards inside cards.
- Use full-width rows, tables, or panels instead of floating decorative cards.
- If a status is duplicated in another area, keep only the more actionable one.

## Status UI

Status is a core AUTO-TAX surface. It should be short, stable, and repeated consistently.

Recommended labels:

```text
완료
지금
대기
확인 필요
실패
```

Status badge rules:

- Keep badges small.
- Use consistent positions.
- Use color by meaning only.
- Avoid multiple badges that say the same thing.

Progress display rules:

- Progress belongs near the active task.
- Prefer an inline status strip inside the current work panel over a separate floating card.
- Include only the useful facts: title, current item/status, progress bar, completed count, failed count.
- Do not show progress again as a separate notice below unless it adds new action guidance.

## Buttons

Buttons should look like work controls, not marketing CTAs.

Recommended style:

```css
height: 34-38px;
border-radius: 4-6px;
font-size: 13px;
font-weight: 700;
```

Button hierarchy:

- Primary: main execution
- Outline: secondary execution
- Ghost or text: low-priority actions

Rules:

- Align button widths within the same work area.
- Keep labels short and action-oriented.
- Avoid multiple strong-colored buttons in one row.
- Avoid pill-shaped buttons except for compact status badges.

Password visibility controls:

- Use the shared `PasswordField` control for password inputs with show/hide behavior.
- Treat the visibility toggle as an input adornment, not as a normal action button.
- The toggle must stay 28px square, icon-only, inside the input field, with no hover movement.
- Do not let broad button hover styles change password toggle position, transform, border, or background.

## Tables And Lists

AUTO-TAX should lean on tables and lists for operational data.

Rules:

- Keep row height compact.
- Use thin borders for row separation.
- Use subtle backgrounds for hover and selected states.
- Align numeric and status data consistently.
- Empty states should be short and functional.
- Avoid decorative empty states unless they clarify the next action.

## Customer-Facing Terminology

Do not expose internal integration names on customer-facing screens.

Use:

- 발행 연동
- 인증서 연결
- 공동인증서 등록

Avoid customer-facing use of:

- Popbill
- 팝빌

Exception:

- Public legal terms, privacy notices, and required third-party disclosure consent may name `팝빌(Popbill)` when the user must be told the legal recipient or processor.
- This exception applies only to legal/consent copy. Marketing copy, workspace operations UI, customer management, helper flows, alerts, empty states, and ordinary error messages should still use customer-facing wording such as `발행 연동`, `인증서 연결`, or `공동인증서 등록`.

If an internal integration causes an error, show the actionable cause without naming the integration unless the surface is explicitly internal admin, ops, or developer diagnostics.

## Component Rules

- Use shadcn/ui components as the default and preferred building blocks for all new or redesigned UI.
- Use Lucide icons for interface icons whenever an appropriate icon exists.
- Do not hand-roll standard controls when a shadcn/ui component already exists.
- Do not create custom button, badge, alert, card, input, table, dialog, dropdown, tab, tooltip, checkbox, switch, progress, or select patterns unless there is a clear product-specific need.
- If custom behavior is required, compose it from shadcn/ui primitives first.
- Customize shadcn/ui at the component or variant level.
- Avoid broad global CSS overrides that unintentionally restyle unrelated controls.
- Keep local CSS focused on layout, density, and AUTO-TAX-specific variants.
- Use icons in tool buttons where a familiar icon communicates the action clearly.
- Prefer shared component wrappers over one-off per-screen styling.

### Allowed UI Building Blocks

Use these libraries as the primary design surface:

- shadcn/ui for reusable UI components and primitives.
- Lucide for interface icons.

Avoid:

- One-off hand-written controls for common UI patterns.
- Screen-specific button or badge styles that duplicate existing variants.
- Raw SVG icons when a Lucide icon exists.
- New visual systems that bypass the shared component layer.

When redesigning an existing screen, first identify which hand-rolled controls can be replaced by shared shadcn/ui-based components. Keep custom CSS only where it expresses AUTO-TAX layout, density, or workflow-specific structure.

## Do And Do Not

Do:

- Use thin borders to define structure.
- Keep current state and next action close together.
- Keep status language short.
- Align controls and values to stable columns.
- Reduce duplicate notices.
- Preserve dense but readable spacing.

Do not:

- Scatter floating cards across a workflow.
- Use gradients or decorative blobs.
- Add broad shadows for depth.
- Mix multiple radius systems in one screen.
- Make every status visually loud.
- Add new abstractions or visual variants for one-off cases.

## Review Checklist

Before shipping a screen, verify:

1. Is the current state immediately visible?
2. Is the next action obvious?
3. Is any status or count duplicated?
4. Are panels, fields, buttons, and badges aligned?
5. Does the screen use thin borders instead of decorative shadows?
6. Are colors used by meaning rather than decoration?
7. Does the screen still work as a dense operations console on smaller widths?
