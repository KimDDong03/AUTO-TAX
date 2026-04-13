# AUTO-TAX

AUTO-TAX는 한전 정산 메일을 읽고, 고객/인증서 준비 상태를 확인한 뒤, 세금계산서 초안 생성과 발행을 자동화하는 도구입니다.
흐름은 `입력(메일 연결·고객 등록·인증서 준비) → 자동화(메일 파싱·초안 생성·발행) → 사람 검수/예외 처리(미매칭 메일·발행 막힘 해결)` 순서로 이해하면 됩니다.

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
