# AUTO-TAX

한전 신재생에너지 요금안내 메일을 읽어서 고객별 전자세금계산서 초안을 만들고, 검수 후 발행하거나 월 자동 실행일에 자동 발행까지 처리하는 웹 기반 관리 프로그램입니다.

## 현재 구현 범위

- IMAP 메일 수집
- 한전 메일 파싱
- 발전소명 기준 고객 매칭
- 고객/발전소명/팝빌 계정 관리
- 팝빌 연동회원 가입
- 인증서 등록 URL 발급 및 만료일 확인
- 인증서 일괄 점검 및 만료 예정 운영자 알림 메일
- 검수 후 수동 발행
- 검수 대기건 전체 일괄 발행
- SMTP 운영자 알림
- Gmail IMAP/SMTP 연결 테스트
- Supabase 기반 저장
- 팝빌 ID 자동 생성 / 공통 비밀번호 적용
- 인증서 만료일 경고 표시
- 인증서 일괄 점검 시 운영자 알림 메일 발송

## 실행

```bash
npm install
npm run dev
```

- 웹 화면: `http://localhost:5173`
- API 서버: `http://localhost:4300`

프로덕션 빌드:

```bash
npm run build
npm start
```

Vercel 배포용 빌드:

```bash
npm run build:vercel
```

## 설정 순서

1. 작업공간 설정에서 Gmail 계정/앱 비밀번호 입력
2. 고객 등록
3. 고객별 발전소명 등록
4. 팝빌 서버 연결 상태 확인
5. 팝빌 가입
5. 인증서 등록 URL 열기
6. 인증 상태 확인
7. 필요 시 `인증서 일괄 점검` 실행
8. 메일 동기화
9. 자동 발행 고객은 월 자동 실행일에 자동 처리, 검수 고객은 검수 화면에서 개별 발행 또는 전체 발행
10. 필요 시 설정 화면에서 Gmail 연결 테스트 실행

## 문서

- [구현 문서](./docs/IMPLEMENTATION.md)
- [운영 문서](./docs/OPERATIONS.md)
- [고객 온보딩 문서](./docs/ONBOARDING.md)
- [현재 제품 결정](./docs/CURRENT_PRODUCT_DECISIONS.md)
- [SaaS 구조 정리](./docs/SAAS_BUSINESS_MODEL.md)
- [Vercel + Supabase 전환 구조](./docs/VERCEL_SUPABASE_ARCHITECTURE.md)
- [Supabase 스키마 설계안](./docs/SUPABASE_SCHEMA_PLAN.md)
- [Supabase 프로젝트 연결 메모](./docs/SUPABASE_PROJECT_SETUP.md)
- [Supabase Cron 연결 메모](./docs/SUPABASE_CRON_SETUP.md)
- [공동인증서 갱신 로컬 에이전트 POC](./docs/CERTIFICATE_RENEWAL_POC.md)

## 지금 바로 채워야 하는 값

`.env` 파일에서 아래 값만 우선 채우면 됩니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTO_TAX_OPS_EMAILS`
- `AUTO_TAX_JOB_SECRET`
- `AUTO_TAX_SERVER_URL`
- `AUTO_TAX_SUPPORT_APP_PASSWORD`
- `AUTO_TAX_POPBILL_LINK_ID`
- `AUTO_TAX_POPBILL_SECRET_KEY`
- `AUTO_TAX_POPBILL_IS_TEST`

팝빌 관련 값은 모두 서버 전용입니다.

- `AUTO_TAX_POPBILL_*`

이 값들은 Vercel 서버 환경변수에만 두고, 브라우저로 내려가면 안 됩니다.

- `AUTO_TAX_OPS_EMAILS` = 운영자 전용 탭에 접근할 이메일 목록, 여러 개면 쉼표로 구분
- `AUTO_TAX_JOB_SECRET` = Supabase Edge Function과 내부 큐 API가 서로 호출할 때 쓰는 서버 전용 비밀값
- `AUTO_TAX_SERVER_URL` = Supabase Edge Function이 호출할 실제 Vercel API 주소
- `AUTO_TAX_SUPPORT_APP_PASSWORD` = 로그인 화면의 `요청 문의`를 실제 메일로 보내기 위한 Gmail 앱 비밀번호
- `AUTO_TAX_POPBILL_IS_TEST` = 테스트 계정이면 `true`, 운영 계정이면 `false`

팝빌 사용자 ID 접두어, 공통 비밀번호, 운영 담당자 정보는 서버 env가 아니라 작업공간 설정에 저장합니다.

아래 값들은 지금은 비워두고, 필요할 때만 추가하면 됩니다.

- `SUPABASE_ORGANIZATION_ID`
- `AUTO_TAX_ORGANIZATION_NAME`
- `AUTO_TAX_ORGANIZATION_BUSINESS_NUMBER`
- `AUTO_TAX_POPBILL_PARTNER_CORP_NUM`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `AUTO_TAX_RENEWAL_AGENT_*`

`AUTO_TAX_JOB_SECRET`는 `Supabase Edge Function -> Vercel API` 내부 배치 호출을 잠그는 서버 전용 비밀값입니다. 무료 배치 구조(`pg_cron + Edge Function + job_queue`)를 붙일 때만 추가하면 됩니다. `SUPABASE_DB_PASSWORD`는 원격 마이그레이션을 적용할 때 CLI가 사용합니다.

## 첫 로그인 준비

웹 화면은 Supabase Auth 로그인 후에만 열립니다.

1. Supabase `Authentication -> Users`에서 운영자 계정을 직접 만들거나
2. 운영자 탭에서 고객사 작업공간과 첫 owner 계정을 개통합니다.

공개 회원가입은 열지 않습니다. 고객사 사용자는 운영자가 개통한 `로그인 아이디`로만 로그인합니다. 운영자(플랫폼 관리자)만 이메일 로그인을 사용합니다.

`AUTO_TAX_OPS_EMAILS`에 등록된 이메일로 로그인하면 `운영자` 탭이 보입니다. 여기서 새 고객사 작업공간을 만들고 첫 owner 로그인 아이디를 바로 개통할 수 있습니다.

중요:

- 앱 화면에서는 회원가입 경로를 노출하지 않습니다.
- Supabase Hosted 프로젝트도 `Authentication` 설정에서 `Enable email signups`를 꺼야 합니다.
- 저장소의 [config.toml](./supabase/config.toml)도 같은 기준으로 `enable_signup = false`로 맞춰두었습니다.
- 고객사 `owner`는 자기 작업공간 `member`의 임시 비밀번호를 재설정할 수 있습니다.
- `owner` 임시 비밀번호 재설정은 `운영자` 탭에서 처리합니다.

## Vercel 배포 메모

- Vercel Express 진입점: `src/server.ts`
- Vercel 정적 산출물: `public`
- Vercel 설정 파일: `vercel.json`
- Vercel 배포 시 웹 화면은 `public` 정적 파일로 서빙되고, API는 Express 함수로 처리됩니다.

주의:

- 현재 `setInterval` 기반 스케줄러는 로컬 서버용입니다.
- Vercel 배포에서는 항상 켜져 있지 않으므로 `자동 메일 동기화`, `자동 발행`, `인증서 정기 점검`은 별도 Cron/큐/워커 구조로 옮겨야 합니다.
- 초기 무료 구조는 `Supabase pg_cron + Edge Function + job_queue`를 기준으로 보고, 크론은 `dispatch`까지만 맡깁니다.
- 내부 큐 API는 `/api/internal/jobs/dispatch`, `/api/internal/jobs/run`이며, Edge Function에서 `AUTO_TAX_JOB_SECRET`으로 호출합니다.
- Supabase `job-tick` 함수에는 별도로 `AUTO_TAX_SERVER_URL`, `AUTO_TAX_JOB_SECRET` 시크릿을 넣어야 합니다.
- Supabase `job-tick` 함수는 `--no-verify-jwt`로 배포하고, 함수 내부에서 `x-auto-tax-job-secret` 헤더를 직접 검증합니다.
- 기본값은 `매월 26일 지정 시각`이고, 고객사 작업공간에서 월 자동 실행일/시각을 바꿀 수 있습니다.
- 자동 처리 작업은 실패 시 큐에서 몇 차례 자동 재시도한 뒤 최종 실패로 남기고 알림 메일을 보냅니다.
- 고객사 수와 작업량이 늘어나면 실제 실행만 `별도 Node 워커`로 분리합니다.

## Gmail 기준 권장 설정

Gmail 계정을 메일 수집용으로 쓰려면 먼저 Google 계정에서 아래를 준비합니다.

1. 메일 전용 Gmail 계정 생성
2. Google 계정 `2단계 인증` 활성화
3. Google 계정 `앱 비밀번호` 생성
4. AUTO-TAX 작업공간 설정 화면에 아래 값을 입력

설정 화면에서 주로 넣을 값:

- `IMAP 계정`: `your-account@gmail.com`
- `IMAP 비밀번호`: Gmail 로그인 비밀번호가 아니라 `앱 비밀번호`
- `메일함`: 보통 `INBOX`
- `SMTP 계정`: `your-account@gmail.com`
- `SMTP 비밀번호`: `앱 비밀번호`
- `발신자 이름`: 예: `AUTO-TAX`
- `발신 메일`: `your-account@gmail.com`

나머지 Gmail 연결값은 프로그램이 기본값으로 자동 적용합니다.

권장 운영 방식:

- 한전 메일 수신용 Gmail 계정 1개를 따로 둡니다.
- AUTO-TAX는 이 Gmail 계정의 `IMAP`으로 메일을 읽습니다.
- 실패 알림은 같은 Gmail 계정의 `SMTP`로 운영자에게 발송합니다.

참고:

- [Gmail을 다른 메일 클라이언트와 동기화하기](https://support.google.com/mail/answer/7126229?hl=en)
- [앱 비밀번호](https://support.google.com/accounts/answer/185833?hl=en)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)

현재 프로젝트는 `Gmail API`가 아니라 `IMAP/SMTP` 기반입니다. Gmail API는 OAuth와 Restricted scope 운영 부담이 더 커서, 현 단계에서는 `Gmail 계정 + IMAP/SMTP` 구성이 더 단순하고 안정적입니다.

## 핵심 규칙

- 고객 식별: `발전소명 + 주소`
- 품목명: `YYYY년M월전력`
- 공급가액: 메일의 `당월 공급가액`
- 세액: 메일의 `VAT`
- 발행 형태: `청구`
- 실패 처리: `실패 로그 + 운영자 메일 알림`
- 발행 방식: `매월 26일 자동 메일 동기화 -> 자동 발행 고객 즉시 발행 -> 검수 고객은 수동 발행`
- 수동 처리: 사용자는 언제든 `메일 동기화`, `개별 발행`, `전체 발행`을 직접 실행 가능
- 팝빌 ID: 조직 설정의 `접두어 + 고객번호` 형식 자동 생성, 예: `HAE_001`
- 팝빌 비밀번호: 조직 설정의 `팝빌 공통 비밀번호`를 신규 고객에 동일 적용
  이미 생성된 고객 계정의 실제 비밀번호를 자동으로 바꾸지는 않음
- 운영 담당자 연락처: 고객별이 아니라 조직 설정의 공통 운영자 정보 1세트를 사용
