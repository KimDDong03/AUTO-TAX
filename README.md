# AUTO-TAX

KEPCO solar mail ingestion + invoice draft/issuance system for solar operators. Current product shape is a multi-tenant web app with workspace auth, Popbill integration, IMAP ingestion, and local certificate assistance.

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

Local certificate helper:

```bash
npm run renewal-helper:install
npm run renewal-helper:start
npm run renewal-helper:status
npm run renewal-helper:stop
npm run renewal-agent:dev
```

## Canonical Docs

- [Agent Guide](./AGENTS.md)
- [Design System](./DESIGN.md)
- [Implementation](./docs/IMPLEMENTATION.md)
- [Schema](./docs/SUPABASE_SCHEMA_PLAN.md)
- [Operations](./docs/OPERATIONS.md)
- [Renewal Helper / SignGate Notes](./docs/CERTIFICATE_RENEWAL_POC.md)
- [Status / Backlog](./docs/IMPLEMENTATION_STATUS.md)

## Notes

- Customer matching is address-first, not plant-name-first.
- Popbill secrets are server-managed env values.
- `dist/`, `public/`, `tmp/`, and Supabase temp folders are disposable generated output.
