# AUTO-TAX Task Routing

Status: canonical_operations for agent task routing.

Last reviewed: 2026-05-27.

Use this after `AGENTS.md`. Pick the closest task type, read only the listed docs,
then inspect the listed code entrypoints. If a task changes behavior, routing,
commands, env, schema, UI conventions, deployment, or operations, update the
relevant canonical docs in the same change.

## UI 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/design.md`, `docs/IMPLEMENTATION.md`, `docs/ai/DOC_INDEX.md` |
| Start with code | `web/src/App.tsx`, relevant `web/src/features/*`, `web/src/components/ui/*`, `web/src/components/console/*`, `web/src/styles.css` |
| Then check | `components.json`, related `*.test.tsx`, `web/src/types.ts`, API calls in `web/src/api.ts` when data changes |
| Usually ignore | `server/src/*` unless API contracts change; draft IA docs unless layout/IA is the task |
| Verification | Targeted web tests, `npm run test:web`, `npm run check`, browser verification for visible UI |

## API 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/IMPLEMENTATION.md`, `docs/OPERATIONS.md`, `docs/SUPABASE_SCHEMA_PLAN.md` if persistence changes |
| Start with code | `server/src/main.ts`, relevant `server/src/routes/*`, relevant `server/src/services/*`, `server/src/supabase-store.ts`, `server/src/store-contract.ts` |
| Then check | `web/src/api.ts`, `web/src/types.ts`, relevant web feature calls, route tests |
| Usually ignore | UI draft docs; migrations unless schema changes |
| Verification | Targeted route/service tests, `npm run test:server`, `npm run check` |

## DB/schema 변경

| Field | Routing |
| --- | --- |
| Start with docs | `docs/SUPABASE_SCHEMA_PLAN.md`, `docs/OPERATIONS.md`, `docs/IMPLEMENTATION.md` |
| Start with code | `supabase/migrations/`, `server/src/supabase-store.ts`, `server/src/domain.ts`, `server/src/store-contract.ts` |
| Then check | RLS policies, route guards in `server/src/api-access.ts`, affected web types and tests |
| Usually ignore | UI drafts and design docs unless user-facing schema behavior changes |
| Verification | Migration review, targeted store tests, `npm run test:server`, `npm run check`; run Supabase commands only when explicitly needed |

## 인증/권한 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/IMPLEMENTATION.md`, `docs/SUPABASE_SCHEMA_PLAN.md`, `docs/OPERATIONS.md` |
| Start with code | `server/src/api-access.ts`, `server/src/supabase.ts`, `server/src/routes/core-routes.ts`, `server/src/routes/organization-member-routes.ts`, `web/src/features/auth/*`, `web/src/supabase.ts` |
| Then check | RLS helper functions/policies in migrations, `organization_members`, `auth_user_login_index`, affected UI gating in `web/src/App.tsx` |
| Usually ignore | IA drafts unless navigation exposure changes |
| Verification | Auth/access tests, targeted route tests, `npm run test:server`, `npm run test:web`, `npm run check` |

## 운영/배포/env 문제

| Field | Routing |
| --- | --- |
| Start with docs | `docs/OPERATIONS.md`, `README.md`, `docs/ai/repo-map.json` |
| Start with code | `package.json`, `vercel.json`, `.env.local.example`, `.env.vercel.example`, `server/src/env.ts`, `server/src/main.ts`, `api/index.ts`, `web/vite.config.ts` |
| Then check | `supabase/config.toml`, `supabase/functions/job-tick/`, smoke scripts in `scripts/` |
| Usually ignore | UI drafts and design docs |
| Verification | Relevant script from `package.json`, `npm run check`, `npm run build` or `npm run build:vercel`, smoke script when applicable |

## 테스트 실패 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/ai/TASK_ROUTING.md`, then docs for the failing area |
| Start with code | Exact failing test file and implementation file named in the error output |
| Then check | Recent related tests in the same directory, package scripts, fixtures or env requirements |
| Usually ignore | Unrelated canonical docs after the failing area is identified |
| Verification | Re-run the exact failing command first, then the relevant package script such as `npm run test:server`, `npm run test:web`, or `npm run check` |

## 디자인 시스템 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/design.md`, `AGENTS.md`, `components.json` |
| Start with code | `web/src/components/ui/*`, `web/src/components/console/*`, `web/src/styles.css`, representative feature screens |
| Then check | `lucide-react` usage, shadcn/ui aliases, related component tests |
| Usually ignore | Server code and schema docs |
| Verification | Targeted component tests, `npm run test:web`, `npm run check`, browser verification across relevant viewport sizes |

## IA/화면 구조 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/TAB_STRUCTURE_COMPARISON.md`, `docs/IMPLEMENTATION.md`, `docs/design.md`; optionally `docs/IA_DRAFT.md` and `docs/WIREFRAME_FEATURE_SPEC.md` as non-canonical planning input |
| Start with code | `web/src/App.tsx`, `web/src/features/home/*`, `web/src/features/settings/*`, relevant feature tab component |
| Then check | Hash routing, `resolveWorkspaceTab`, visible nav items, settings onboarding section, browser flow |
| Usually ignore | `docs/SITEMAP_DRAFT.md` except for historical context |
| Verification | Targeted web tests, `npm run test:web`, `npm run check`, browser navigation smoke |

## onboarding/import 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/IMPLEMENTATION.md`, `docs/SUPABASE_SCHEMA_PLAN.md`, `docs/OPERATIONS.md`, `docs/design.md` for UI work |
| Start with code | `web/src/features/onboarding/*`, `web/src/features/initial-registration/*`, `web/src/features/settings/onboarding/*`, `server/src/routes/settings-routes.ts`, `server/src/services/customer-import-service.ts`, `server/src/services/customer-onboarding-import-service.ts`, `server/src/services/customer-onboarding-batch-service.ts` |
| Then check | `server/src/job-queue.ts`, `server/src/services/popbill-customer-service.ts`, onboarding migrations, workbook tests |
| Usually ignore | Ops routes unless approval/admin flow changes |
| Verification | Targeted import/onboarding tests, `npm run test:server`, `npm run test:web`, `npm run check` |

## background job/cron/queue 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/OPERATIONS.md`, `docs/IMPLEMENTATION.md`, `docs/SUPABASE_SCHEMA_PLAN.md` |
| Start with code | `server/src/job-queue.ts`, `server/src/maintenance-retention.ts`, `server/src/renewal-automation.ts`, `server/src/routes/core-routes.ts`, `server/src/routes/renewal-routes.ts`, `supabase/functions/job-tick/index.ts` |
| Then check | `renewal_automation_jobs` vs `job_queue` separation, env secrets, ops UI actions |
| Usually ignore | UI design drafts unless queue status UI changes |
| Verification | Targeted job/retention/renewal tests, `npm run test:server`, `npm run check`, `npm run smoke:ops` when environment is available |

## 외부 연동 수정

| Field | Routing |
| --- | --- |
| Start with docs | `docs/OPERATIONS.md`, `docs/IMPLEMENTATION.md`, `docs/SUPABASE_SCHEMA_PLAN.md` if persistence changes |
| Start with code | Popbill: `server/src/popbill-client.ts`, customer/draft routes and services. Mail: `server/src/mail-sync.ts`, `server/src/mail-test.ts`, `server/src/parser.ts`. SMS/email signup: `server/src/sms-provider.ts`, `server/src/signup-*`. Renewal helper: `web/src/local-renewal-helper.ts`, `scripts/renewal-local-helper.ts`, `scripts/renewal-agent.ts` |
| Then check | Env templates, masking/logging, user-facing terminology rules in `AGENTS.md` and `docs/design.md` |
| Usually ignore | IA drafts unless integration affects navigation or onboarding |
| Verification | Targeted integration boundary tests, `npm run test:server`, `npm run test:web` if browser boundary changes, `npm run check` |

## 대규모 리팩터링

| Field | Routing |
| --- | --- |
| Start with docs | `AGENTS.md`, `docs/ai/DOC_INDEX.md`, `docs/IMPLEMENTATION.md`, `docs/IMPLEMENTATION_STATUS.md`, area-specific canonical docs |
| Start with code | Begin at the smallest affected boundary: route group, feature directory, service, or store. Do not start by reading all files. |
| Then check | Public contracts, tests, package scripts, migrations, docs that may become stale |
| Usually ignore | Archived drafts unless the refactor is specifically restoring an older design |
| Verification | Targeted tests during the refactor, then `npm run check`; broaden to `npm run test` and build when shared behavior changes |

