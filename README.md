# AUTO-TAX

AUTO-TAX is a multi-tenant tax invoice operations app for solar operators. The current product shape is a customer access portal plus a workspace app for mail ingestion, customer management, invoice draft issuance, and Windows-only local certificate assistance.

## System Shape

- `web/`: React app served by Vite
- `server/`: Express API and Supabase-backed services
- `supabase/`: PostgreSQL schema, auth, and Edge Function `job-tick`
- `scripts/`: Windows helper, renewal agent, packaging, and smoke scripts

## Start

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:4300`

## Core Commands

```bash
npm run check
npm run test:server
npm run test:e2e:smoke
npm run build
npm run build:vercel
```

Local renewal helper:

```bash
npm run renewal-helper:install
npm run renewal-helper:start
npm run renewal-helper:status
npm run renewal-helper:stop
npm run renewal-agent:dev
```

## Working Docs

- [Agent Guide](./AGENTS.md)
- [Architecture / Implementation](./docs/IMPLEMENTATION.md)
- [Schema Reference](./docs/SUPABASE_SCHEMA_PLAN.md)
- [Operations Runbook](./docs/OPERATIONS.md)
- [Status / Backlog](./docs/IMPLEMENTATION_STATUS.md)

## Ground Truths

- Customer auto-matching is address-first through `managed_customer_match_addresses`.
- Public `/` is a customer access portal, not a marketing landing page.
- Product behavior is mostly `owner` versus non-owner member even though the DB still stores broader roles.
- Popbill live secrets are server-managed env values.
- `job_queue` and `renewal_automation_jobs` are separate systems and should not be debugged as one queue.
- There is no canonical design guide; visual and interaction rules are intentionally not fixed in docs.
- `data/` may hold user state; do not remove it casually.
