# AGENTS.md

Codex entrypoint and routing guide for this repository. Keep this file short:
it is a router, not the full project manual.

## Repository purpose

- AUTO-TAX is a multi-tenant tax invoice operations app for solar operators.
- Runtime surfaces:
  - `web/`: React + Vite workspace app and public portal.
  - `server/`: Express API and Supabase-backed services.
  - `api/`: Vercel serverless entrypoint.
  - `supabase/`: migrations, local Supabase config, and Edge Function `job-tick`.
  - `scripts/`: smoke scripts, Windows renewal helper tooling, renewal agent, packaging helpers.
- Current product shape: consultation/signup-first public portal, existing-customer login,
  workspace operations console, platform `ops`, and Windows-only local certificate assistance.

## Start here

1. Read this file first.
2. Do not read the whole repo by default.
3. Open `docs/ai/TASK_ROUTING.md` and pick the relevant task type.
4. Read only the canonical docs listed for that task.
5. Inspect the code entrypoints from the routing table.
6. Read draft or archived docs only when the task explicitly involves IA, historical decisions,
   wireframes, or stale documentation.

## Documentation map

- `docs/ai/DOC_INDEX.md`: full documentation inventory, status, source-of-truth notes,
  conflict rules, and delete candidates.
- `docs/ai/TASK_ROUTING.md`: task-type routing for docs, code, follow-up checks, and verification.
- `docs/ai/repo-map.json`: machine-readable routing index for agents and tools.
- `README.md`: concise repository overview and common commands.
- `docs/IMPLEMENTATION.md`: canonical runtime and architecture map.
- `docs/OPERATIONS.md`: canonical local/dev/deploy/env/runbook reference.
- `docs/SUPABASE_SCHEMA_PLAN.md`: canonical schema reference; migrations remain authoritative.
- `docs/design.md`: canonical AUTO-TAX UI and design-system guidance.
- `docs/IMPLEMENTATION_STATUS.md`: active backlog, risks, and pressure points.
- `docs/TAB_STRUCTURE_COMPARISON.md`: decision record for current top-level tab/IA direction.
- `docs/IA_DRAFT.md`, `docs/WIREFRAME_FEATURE_SPEC.md`: non-canonical working drafts for IA/UI planning.
- `docs/SITEMAP_DRAFT.md`: archived historical sitemap draft.

## Task routing

Use `docs/ai/TASK_ROUTING.md` before opening feature files.

- UI change: start with `docs/design.md`, then the relevant `web/src/features/*` area.
- API change: start with `docs/IMPLEMENTATION.md`, then `server/src/routes/*` and
  the relevant service/store files.
- DB/schema change: start with `docs/SUPABASE_SCHEMA_PLAN.md`, then `supabase/migrations/`.
- Auth/permission change: start with `docs/IMPLEMENTATION.md` and
  `docs/SUPABASE_SCHEMA_PLAN.md`, then `server/src/api-access.ts`.
- Operations/deploy/env issue: start with `docs/OPERATIONS.md`, `package.json`,
  `vercel.json`, and env templates.
- Design-system change: start with `docs/design.md`, `components.json`,
  `web/src/components/ui/*`, and `web/src/components/console/*`.
- IA/screen-structure change: start with `docs/TAB_STRUCTURE_COMPARISON.md`,
  `docs/design.md`, and current navigation code in `web/src/App.tsx`.
- Onboarding/import change: start with `docs/IMPLEMENTATION.md`,
  `docs/SUPABASE_SCHEMA_PLAN.md`, and the onboarding/import feature and service files.
- Background job/cron/queue change: start with `docs/OPERATIONS.md`,
  `docs/IMPLEMENTATION.md`, `server/src/job-queue.ts`,
  `server/src/renewal-automation.ts`, and `supabase/functions/job-tick/`.
- External integration change: start with `docs/OPERATIONS.md` and the relevant route/service.

## Commands

Package manager: npm.

```bash
npm install
npm run dev
npm run check
npm run test
npm run test:server
npm run test:web
npm run test:scripts
npm run test:e2e:smoke
npm run smoke:ops
npm run build
npm run build:vercel
```

Local renewal helper and agent:

```bash
npm run renewal-helper:install
npm run renewal-helper:start
npm run renewal-helper:status
npm run renewal-helper:stop
npm run renewal-helper:package
npm run renewal-agent:dev
```

## Verification

- Do not claim a command passed unless it was actually run.
- Use the narrowest relevant check first, then broaden when shared behavior changed.
- Type checks: `npm run check`.
- Server tests: `npm run test:server`.
- Web tests: `npm run test:web`.
- Script tests: `npm run test:scripts`.
- Full test suite: `npm run test`.
- Build: `npm run build`; Vercel static build: `npm run build:vercel`.
- E2E smoke: `npm run test:e2e:smoke`.
- Ops smoke: `npm run smoke:ops`.
- UI changes need browser verification when a dev server is involved.

## Do not touch / generated files

Avoid reading or editing generated or bulky output unless the task is specifically about it:

- `node_modules/`
- `dist/`
- `build/`
- `.next/`
- `.turbo/`
- `coverage/`
- `public/`
- `web/public/downloads/`
- `supabase/.temp/`
- `tmp/`
- `tmp-*.log`
- `.codex-runlogs/`
- minified files
- lockfiles, unless dependency resolution is part of the task

Treat with caution:

- `.env`, `.env.local`, `.env.vercel`, and any file containing secrets.
- `data/`, because it may contain local state worth keeping.
- `backups/`, because it is not part of normal source routing.

## Product terminology

- Do not expose Popbill/팝빌 as user-facing wording on customer-facing pages,
  especially the customer management page.
- Treat Popbill as an internal integration detail.
- Prefer customer-facing terms such as `발행 연동`, `인증서 연결`, or
  `공동인증서 등록`, depending on context.
- If an error originates from Popbill, show the actionable cause without naming Popbill
  unless the screen is explicitly internal admin, ops, or developer diagnostics.

## UI design system

- Use shadcn/ui components as the default building blocks for new or changed UI.
- Customize shadcn/ui at the component and variant level to match AUTO-TAX styling.
- Avoid broad global CSS overrides that accidentally restyle unrelated controls.
- Use Lucide icons for interface icons whenever an appropriate icon exists.
- Follow `docs/design.md` for density, color, status, layout, and component rules.

## Documentation maintenance rule

When a change modifies project behavior, architecture, commands, environment variables,
database schema, routing, UI conventions, deployment assumptions, or operational workflows,
update the relevant canonical documentation in the same change.

Before finishing a task, check whether any of these need updates:

- `AGENTS.md`
- `docs/ai/DOC_INDEX.md`
- `docs/ai/TASK_ROUTING.md`
- `docs/ai/repo-map.json`
- runtime / architecture docs
- operations / runbook docs
- schema / migration docs
- design-system docs
- status / backlog docs
- decision records

If a document is no longer accurate, update it, mark it as archived/non-canonical,
or add a clear follow-up note.

Do not create one-off planning documents unless they will be deleted, merged,
or archived after the decision lands.

Do not finish a task with implementation and documentation knowingly out of sync.
