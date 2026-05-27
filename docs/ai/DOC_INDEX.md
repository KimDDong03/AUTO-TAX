# AUTO-TAX Documentation Index

Status: canonical_operations for agent documentation routing.

Last reviewed: 2026-05-27.

This index exists so new Codex sessions can choose the smallest useful reading set.
Do not use this as a replacement for the canonical runtime, operations, schema, or
design documents it points to.

## Active canonical set

| Document | Status | Use when | Do not use for | Current source of truth | Notes |
| --- | --- | --- | --- | --- | --- |
| `AGENTS.md` | `agent_entrypoint` | Starting any Codex task; checking repository-wide agent rules and routing order. | Detailed architecture, schema, or UI behavior. | Yes, for agent entry and documentation maintenance rules. | Read first, then `docs/ai/TASK_ROUTING.md`. |
| `docs/ai/DOC_INDEX.md` | `canonical_operations` | Deciding which docs are canonical, draft, archived, or stale. | Runtime behavior details. | Yes, for documentation inventory. | Keep updated when any document is added, archived, or demoted. |
| `docs/ai/TASK_ROUTING.md` | `canonical_operations` | Selecting docs and code entrypoints by task type. | Feature behavior details after routing is chosen. | Yes, for agent task routing. | Read immediately after `AGENTS.md`. |
| `docs/ai/repo-map.json` | `canonical_operations` | Machine-readable routing, generated-file exclusions, commands, and risky areas. | Human explanations or nuanced design decisions. | Yes, for structured agent routing. | Keep valid JSON. |
| `README.md` | `canonical_runtime` | Quick repository purpose, runtime surfaces, common commands, and ground truths. | Detailed runtime flows or full runbooks. | Partial; defer to canonical docs below for detail. | Good overview, not a replacement for task routing. |
| `docs/IMPLEMENTATION.md` | `canonical_runtime` | Architecture, feature ownership, primary flows, runtime invariants, and code map. | UI design rules or complete DB column reference. | Yes, for current runtime structure. | Updated against current routes, public portal, and onboarding routing. |
| `docs/OPERATIONS.md` | `canonical_operations` | Env, local dev, deploy shape, smoke tests, cron/jobs, renewal helper, debugging order. | Product IA or detailed schema modeling. | Yes, for commands and operations. | Env templates are `.env.local.example` and `.env.vercel.example`. |
| `docs/SUPABASE_SCHEMA_PLAN.md` | `canonical_schema` | DB tables, RLS mental model, persistence invariants, migration context. | Replacing migrations during schema changes. | Yes as a reference; migrations are authoritative. | Updated for latest public signup, rate-limit, and contract-period tables. |
| `docs/design.md` | `canonical_design` | UI changes, design-system decisions, density, color, status, layout, shadcn/ui use. | Runtime architecture or schema decisions. | Yes, for changed UI. | Supersedes older README claim that there was no canonical design guide. |
| `docs/IMPLEMENTATION_STATUS.md` | `active_backlog` | Current risks, sharp edges, priorities, and pressure points. | Architecture truth or planned feature promises. | Yes, for active backlog only. | Keep short. |

## Decision records

| Document | Status | Use when | Do not use for | Current source of truth | Notes |
| --- | --- | --- | --- | --- | --- |
| `docs/TAB_STRUCTURE_COMPARISON.md` | `decision_record` | IA/top-level-tab decisions, especially onboarding absorbed into home/settings while issuance and certificates stay independent. | Current route implementation details without checking code. | Yes, for the recorded tab decision. | Current code routes active-workspace `#onboarding` to settings. |

## Working drafts

| Document | Status | Use when | Do not use for | Current source of truth | Notes |
| --- | --- | --- | --- | --- | --- |
| `docs/IA_DRAFT.md` | `working_draft` | Exploring IA alternatives or preparing screen-structure work. | Current runtime navigation truth. | No. | Non-canonical; some menu claims need verification against `docs/IMPLEMENTATION.md` and `web/src/App.tsx`. |
| `docs/WIREFRAME_FEATURE_SPEC.md` | `working_draft` | Wireframe planning and feature inventory discussions. | Implementing current behavior without code verification. | No. | Non-canonical; verify public portal, onboarding, and settings claims before relying on them. |

## Archived / historical docs

| Document | Status | Use when | Do not use for | Current source of truth | Notes |
| --- | --- | --- | --- | --- | --- |
| `docs/SITEMAP_DRAFT.md` | `archived_draft` | Historical screen-map context from the earlier IA phase. | Current sitemap or current top-level navigation. | No. | Archived because it predates the current onboarding routing decision. |

## Delete candidates

No document was deleted during this review.

| Document | Status | Why not deleted now | Replacement |
| --- | --- | --- | --- |
| None | N/A | No low-value duplicate was confirmed. | N/A |

## Conflict resolution

Use this order when documents disagree:

1. Current code, tests, migrations, actual config, and package scripts.
2. `AGENTS.md` for agent behavior and documentation maintenance rules.
3. `docs/IMPLEMENTATION.md` for runtime and architecture.
4. `docs/SUPABASE_SCHEMA_PLAN.md` for schema reference, with `supabase/migrations/` authoritative.
5. `docs/OPERATIONS.md` for commands, env, deploy, runbooks, and smoke tests.
6. `docs/design.md` for UI and design-system rules.
7. `docs/IMPLEMENTATION_STATUS.md` for current backlog and known risks.
8. `docs/TAB_STRUCTURE_COMPARISON.md` for recorded IA decisions.
9. Working drafts.
10. Archived drafts.
11. Obsolete/delete-candidate documents.

Reason for the order: this repo has active migrations and package scripts that are more
precise than prose; `AGENTS.md` is kept as the agent router, while detailed canonical
truth is intentionally split by runtime, operations, schema, and design.

## Notes for future agents

- Do not start by reading every file in `web/`, `server/`, or `docs/`.
- Start with `AGENTS.md`, then `docs/ai/TASK_ROUTING.md`, then the relevant canonical docs.
- Draft and archived docs are opt-in context, not implementation truth.
- If code/config/migrations contradict docs, update or mark the docs in the same task.
- Schema changes must update migrations first; then update `docs/SUPABASE_SCHEMA_PLAN.md`.
- Behavior, routing, env, command, deployment, or workflow changes should also update
  `AGENTS.md`, this index, `docs/ai/TASK_ROUTING.md`, and `docs/ai/repo-map.json` when routing changes.
- Keep one-off planning documents out of the canonical set; merge, archive, or remove them after decisions land.
