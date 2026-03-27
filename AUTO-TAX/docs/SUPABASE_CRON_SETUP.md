# Supabase Cron Setup

현재 `job-tick` Edge Function은 배포되어 있습니다.

- 프로젝트 ref: `zydkyozyzprrzbwsnylo`
- 함수 이름: `job-tick`
- 배포 방식: `--no-verify-jwt`
- 함수 보호 방식: `x-auto-tax-job-secret` 헤더 검증

남은 연결 항목은 2개입니다.

- `AUTO_TAX_SERVER_URL`
- `SUPABASE_DB_PASSWORD`

## 1. 서버 URL 준비

Vercel 실제 배포 주소를 확정한 뒤, 아래 값을 둘 다 같은 주소로 맞춥니다.

- Vercel 서버 env: `AUTO_TAX_SERVER_URL`
- Supabase function secret: `AUTO_TAX_SERVER_URL`

예시:

```txt
https://your-auto-tax.vercel.app
```

## 2. 원격 마이그레이션 적용

`SUPABASE_DB_PASSWORD`를 `.env`에 넣은 뒤 아래 명령을 실행합니다.

```bash
npx supabase db push --workdir .
```

현재 추가로 적용할 마이그레이션:

- `supabase/migrations/20260326170000_add_job_queue_runtime_indexes.sql`

## 3. Supabase function secret 반영

`AUTO_TAX_SERVER_URL`를 준비한 뒤 아래 명령으로 올립니다.

```bash
npx supabase secrets set AUTO_TAX_SERVER_URL=https://your-auto-tax.vercel.app --project-ref zydkyozyzprrzbwsnylo
```

`AUTO_TAX_JOB_SECRET`는 이미 원격에 반영해둔 상태입니다. 필요하면 다시 덮어쓸 수 있습니다.

## 4. Cron job 생성

Supabase Dashboard `Jobs`에서 `Create job`으로 생성합니다.

- 이름: `auto-tax-job-tick`
- 스케줄: `* * * * *`
- 방식: `HTTP request`
- URL: `https://zydkyozyzprrzbwsnylo.supabase.co/functions/v1/job-tick`
- Method: `POST`
- Header:
  - `Content-Type: application/json`
  - `x-auto-tax-job-secret: <AUTO_TAX_JOB_SECRET>`
- Body:

```json
{
  "limit": 100
}
```

현재 구조에서는 크론이 매분 `dispatch + run`을 호출하고, 실제 월 자동 처리 여부는 AUTO-TAX 서버가 작업공간 설정을 보고 판단합니다.

## 5. 확인

정상 연결 후 확인할 항목:

- `GET /api/health`
- 운영자 화면의 `작업 생성`, `작업 실행`
- Supabase Dashboard `Functions -> job-tick`
- Supabase Dashboard `Jobs -> History`
- `job_queue` 테이블의 `queued / claimed / completed / failed`

## 참고

Supabase 공식 문서에서 Cron Job은 Dashboard `Jobs`에서 생성하거나 `cron.schedule(...)` + `net.http_post(...)` 방식으로 등록할 수 있습니다.

- https://supabase.com/docs/guides/cron/quickstart
