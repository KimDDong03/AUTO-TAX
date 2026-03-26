# AUTO-TAX Supabase 프로젝트 연결 메모

## 1. 필요한 환경변수

웹과 서버에서 각각 아래 값을 사용한다.

### 브라우저용

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

### 서버용

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 2. 원칙

- `VITE_`로 시작하는 값만 브라우저에서 사용한다.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용한다.
- 서비스 롤 키는 브라우저 코드에 절대 넣지 않는다.

## 3. 현재 코드 위치

- 브라우저 클라이언트: `web/src/supabase.ts`
- 서버 관리자 클라이언트: `server/src/supabase.ts`
- 스키마 설계 문서: `docs/SUPABASE_SCHEMA_PLAN.md`
- 초기 SQL 초안: `supabase/migrations/20260326000000_initial_saas_schema.sql`

## 4. 다음 연결 순서

1. Supabase 프로젝트 환경변수를 로컬 `.env`와 Vercel 환경변수에 등록
2. 초기 SQL 마이그레이션 적용
3. 인증 구조와 고객사/사용자 권한 구조 연결
4. Supabase 기반 저장소를 기준으로 기능별 조회/저장 로직 정리
