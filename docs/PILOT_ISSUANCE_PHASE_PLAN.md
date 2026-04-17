# AUTO-TAX Pilot Issuance Phase Plan

이 문서는 2026-04-16 대화에서 합의한 방향을 기준으로,
시범 운영에 필요한 발행/로그/보안/운영 측면 구현 범위를 phase 단위로 정리한 실행 문서다.

목적은 세 가지다.

1. 시범 운영에서 무엇을 먼저 만들지 순서를 고정한다.
2. 수동 발행과 자동 발행의 제품 규칙을 명확히 한다.
3. 추후 구현 시 결제/요금제 같은 비범위를 다시 끌어오지 않도록 경계를 남긴다.

## 1. 이번 문서의 범위

이번 phase 계획에 포함하는 것:

- 시범 운영 성과 지표 수집
- 에러 케이스 분류와 기록 체계
- 발행 책임 모델 정리
- 수동 발행 / 자동 발행 모드 정리
- 발행 로그 / 증거 데이터 정리
- 로그인 기반 사용 흐름 정리
- 민감정보 보안 경계 정리

이번 phase 계획에서 제외하는 것:

- 결제 시스템 도입
- 구독/요금제 확정
- 가격 실험
- 마케팅용 과금 화면

## 2. 확정한 제품 규칙

### A. 발행 모드 규칙

AUTO-TAX는 고객 단위 `issueMode`를 유지한다.

- `review`: 검수 후 사용자가 직접 발행
- `auto`: 월 자동 발행

의미는 아래와 같이 고정한다.

#### `review` 모드

- 초안 생성 후 사용자가 미리보기/검수한다.
- 로그인한 사용자가 직접 발행 액션을 실행한다.
- 단건 발행이 기본 흐름이다.
- 전체 발행을 유지하더라도, 이는 자동 발행이 아니라 로그인 사용자의 명시적 실행으로 취급한다.

#### `auto` 모드

- 고객이 자동 발행 대상으로 설정되어 있으면 초안이 `scheduled` 상태로 생성된다.
- 스케줄 도달 시 `job_queue`의 `auto-issue`가 발행을 수행한다.
- 자동 발행은 시스템이 임의로 켜는 것이 아니라, 사용자가 사전에 선택한 설정에 의해 동작한다.
- 실무상 신뢰가 확인된 뒤 `review -> auto`로 전환하는 흐름을 권장한다.

### B. 책임 모델 규칙

- `review` 모드의 최종 발행 책임은 발행 버튼을 누른 로그인 사용자에게 있다.
- `auto` 모드의 자동 발행 책임은 자동 발행 설정을 활성화한 사용자/조직 정책에 기반한다.
- 따라서 두 모드 모두 누가 어떤 설정을 켰고, 누가 어떤 발행을 실행했는지 남아야 한다.

### C. 인증/접근 규칙

- 발행 관련 액션은 로그인 사용자만 실행할 수 있어야 한다.
- 조직/권한 문맥이 없는 익명 발행 흐름은 허용하지 않는다.
- 수동 발행, 전체 발행, 자동 발행 설정 변경 모두 감사 대상이다.

## 3. 현재 코드 기준 출발점

현재 구현에 이미 존재하는 축:

- 고객 단위 `issueMode: review | auto`
- 초안 상태 `review | scheduled | issuing | issued | failed`
- 수동 발행 API: `/api/drafts/:id/issue`
- 명시적 일괄 발행 API: `/api/drafts/issue-all`
- 자동 발행 큐: `job_queue.job_type = auto-issue`
- 로그 테이블: `app_logs`
- 초안 발행 시각 필드: `issue_requested_at`, `issued_at`
- 발행 결과 JSON: `popbill_result_json`

즉 이번 작업은 그린필드가 아니라, **기존 발행 구조 위에 시범 운영용 계측/감사/보안 경계를 보강하는 작업**으로 본다.

## 4. 시범 운영에서 반드시 수집할 지표

핵심 KPI는 아래 5개로 고정한다.

1. 자동 초안 생성 성공률
2. 최종 발행 성공률
3. 무수정 발행률
4. 1건 처리 기준 절감 시간
5. 예외율

추가 파생 지표:

- 재처리율
- 자동 발행 전환율 (`review -> auto`)
- 자동 발행 실패 후 수동 복구율
- 고객/조직별 발행 성공률

### 계산을 위해 남겨야 할 이벤트 시각

- 메일 수신 시각
- draft 생성 시각
- 검수 화면 진입 시각
- 수동 발행 클릭 시각
- 자동 발행 예약 시각
- 자동 발행 실행 시각
- 발행 완료 시각
- 실패 시각

## 5. Phase 구성

## Phase 1. 시범 운영 계측 기반 만들기

목표:

- 시범 운영 결과를 숫자로 말할 수 있게 한다.
- 에러를 주관식 메모가 아니라 분류 가능한 데이터로 남긴다.

구현 항목:

1. 발행 관련 이벤트 정의
   - `draft-created`
   - `draft-preview-opened`
   - `manual-issue-clicked`
   - `manual-issue-succeeded`
   - `manual-issue-failed`
   - `auto-issue-scheduled`
   - `auto-issue-started`
   - `auto-issue-succeeded`
   - `auto-issue-failed`
2. 에러 taxonomy 정리
   - auth/session
   - mail-sync
   - parse
   - customer-match
   - draft-create
   - manual-issue
   - auto-issue
   - certificate/local-helper
   - external-api
3. `app_logs`와 draft 문맥을 연결할 수 있는 공통 식별자 정리
4. 시범 운영 리포트에 필요한 집계 쿼리/응답 shape 정리

완료 기준:

- 조직 단위로 발행 성공률을 계산할 수 있다.
- draft 단위 타임라인을 복원할 수 있다.
- 에러를 단계별/유형별로 집계할 수 있다.

현재 구현 메모(Phase 범위 변경 아님):

- Phase 1 구현은 별도 metrics 테이블 대신 `app_logs.context_json` 기반으로 진행한다.
- 서버 응답 기준점은 `GET /api/drafts/pilot-report`, `GET /api/drafts/:id/pilot-timeline`이다.
- `draft-preview-opened`는 웹 UI가 `POST /api/drafts/:id/pilot-preview-opened`를 호출할 때 남기는 명시적 클릭 이벤트다.
- 이는 기존 백엔드 `view-url` 근사치보다 명확하지만, Popbill 문서의 실제 DOM 렌더 완료까지 보장하는 신호는 아니다.
- `mail-reprocess` 경로도 `parse` / `customer-match` / `draft-create` / `mail-sync` taxonomy를 명시적으로 남기도록 보강해 fallback 추론 의존을 줄였다.
- Popbill 고객 자동 가입 재시도/실패 로그는 `external-api`와 `errorOperation`을 직접 남기도록 보강했다.

주요 파일:

- `server/src/routes/draft-routes.ts`
- `server/src/job-queue.ts`
- `server/src/supabase-store.ts`
- `server/src/domain.ts`
- `docs/IMPLEMENTATION.md`
- `docs/SUPABASE_SCHEMA_PLAN.md`

## Phase 2. 수동 발행 증거와 감사로그 보강

목표:

- `review` 모드에서 누가 무엇을 보고 어떤 값으로 발행했는지 남긴다.
- “최종 발행은 로그인 사용자가 직접 수행했다”는 증거를 남긴다.

구현 항목:

1. 수동 발행 감사로그 추가
   - actor user id
   - organization id
   - draft id
   - clicked at
   - issued at
   - issue mode
   - 실행 경로 (`single`, `bulk-manual`)
2. 발행 시점 snapshot 저장
   - 공급가액
   - 세액
   - 합계
   - 작성일자
   - 공급자/공급받는자 식별값
   - 수신 이메일
3. preview snapshot hash 또는 정규화 JSON 저장
4. `issue-all`을 유지한다면, 각 건별로 사용자 실행 증거를 남긴다.
5. UI/문구에서 `review` 모드의 의미를 “검수 후 사용자가 직접 발행”으로 통일한다.

현재 구현 메모(Phase 범위 변경 아님):

- Phase 2 첫 vertical slice는 새 audit 테이블 없이 `app_logs`를 재사용한다.
- 수동 발행 `manual-issue-clicked / succeeded / failed` 로그는 `actor_user_id`, `organization_id`, `created_at`와 함께 `context_json.executionPath`, `clickedAt`, `issuedAt`를 남겨 draft 단위 복원을 돕는다.
- 수동 발행 성공 로그는 같은 `manual-issue-succeeded` 이벤트 안에 `issuanceSnapshot`으로 공급가액/세액/합계/작성일자/거래처 식별값/수신 이메일 최소본을 함께 남긴다.
- `review` 모드의 `draft-preview-opened`는 같은 `app_logs.context_json`에 `previewSnapshot` 정규화 JSON을 남겨, “봤던 값 vs 실제 발행값” 비교 기반을 만든다.
- `issue-all`도 각 draft별로 동일한 수동 발행 이벤트를 남겨 사용자 명시 실행 증거를 분리 추적한다.
- 고객 설정/홈 검수 큐 UI는 `review`를 “검수 후 직접 발행”으로 안내하고, `issue-all`도 로그인 사용자의 직접 실행으로 표시한다.

완료 기준:

- 특정 발행 건에 대해 “누가 클릭했는지 / 언제 클릭했는지 / 어떤 데이터였는지”를 조회할 수 있다.
- 수동 발행과 자동 발행 로그가 구분된다.
- 전체 발행도 사용자 명시 실행으로 추적된다.

2026-04-16 구현 기준으로 위 완료 기준을 충족하므로, Phase 2는 완료 상태로 본다.

주요 파일:

- `server/src/routes/draft-routes.ts`
- `server/src/supabase-store.ts`
- `web/src/App.tsx`
- `web/src/features/customers/CustomersTab.tsx`
- `docs/SUPABASE_SCHEMA_PLAN.md`

## Phase 3. 자동 발행 전환 규칙 정리

목표:

- 자동 발행을 없애는 것이 아니라, 신뢰를 확인한 뒤 켜는 흐름으로 정리한다.
- 자동 발행이 켜진 근거와 변경 이력을 남긴다.

구현 항목:

1. `review -> auto` 전환 UX 정리
   - 최소 1회 이상 정상 발행 경험 후 자동 전환 권장 문구 제공
   - 고객별 자동 발행 활성화/비활성화 이력 저장
2. 자동 발행 설정 변경 로그 추가
   - 변경자
   - 변경 시각
   - 이전 값 / 다음 값
   - 변경 사유(optional)
3. 자동 발행 실패 복귀 규칙 정리
   - 실패 시 `failed`로 전환
   - 운영자가 다시 검수 후 수동 발행 가능한 상태를 유지
4. 자동 발행 상태 표시 보강
   - 예정 시각
   - 최근 자동 발행 성공/실패
   - 최근 실패 원인

현재 구현 메모(Phase 범위 변경 아님):

- 고객 설정 수정 시 `issueMode`가 바뀌면 `app_logs`에 “고객 자동 발행 설정을 변경했습니다.” 로그를 남긴다.
- 변경 로그는 새 테이블 없이 `app_logs.actor_user_id` / `organization_id`와 `context_json.customerId`, `changedAt`, `previousIssueMode`, `nextIssueMode`를 함께 남긴다.
- `review -> auto` 전환은 서버 hard guard로만 막고, 같은 organization/customer 기준 `manual-issue-succeeded` 로그가 있거나 레거시 `invoice_drafts.status = issued` 이력이 있을 때만 허용한다.
- 고객 UI는 `review = 검수 후 로그인 사용자가 직접 발행`, `auto = 설정 기반 월 자동 발행`을 최소 문구로 안내하고, 자동 발행 실패 시 실패 초안에서 직접 발행으로 복구 가능함을 함께 노출한다.
- 자동 발행 실패 시 draft status는 계속 `failed`로 남고, 홈 검수 큐/직접 발행 경로가 `failed` 상태도 포함하므로 운영자는 기존 수동 발행 흐름으로 그대로 복구할 수 있다.

완료 기준:

- 고객이 왜 자동 발행 대상인지 설명할 수 있다.
- 누가 자동 발행을 켰는지 남는다.
- 자동 발행 실패 후 운영자가 수동 복구 흐름으로 자연스럽게 이어갈 수 있다.

2026-04-17 구현 기준으로 위 완료 기준을 충족하므로, Phase 3은 최소 범위로 완료 상태로 본다.

주요 파일:

- `web/src/features/customers/CustomersTab.tsx`
- `server/src/job-queue.ts`
- `server/src/mail-sync.ts`
- `server/src/supabase-store.ts`
- `docs/IMPLEMENTATION.md`

## Phase 4. 보안 경계 정리

목표:

- 사용자 PC에서 다루는 민감 자격증명과 서버에 남는 운영 데이터의 경계를 명확히 한다.
- 시범 운영 단계에서도 외부 설명 가능한 수준의 보안 원칙을 적용한다.

구현 항목:

1. 서버 저장 금지 대상 명시
   - 홈택스 ID/PW
   - 공동인증서 원본 파일
   - 공동인증서 비밀번호
2. 로컬 저장 원칙 정리
   - 사용자 PC의 안전한 저장소 사용
   - 평문 저장 금지
   - 로그/임시파일/전송 payload 마스킹
3. 서버 측 민감 필드 audit
   - local-helper/renewal 계열 비밀번호 저장 경로 점검
   - 시범 운영 범위에서 불필요 저장 제거 또는 차단
4. HTTPS 필수 원칙 반영
5. JWT 세션 운용 원칙 반영
   - 만료
   - inactivity timeout 검토
   - 단일 세션/민감 액션 재검증 검토
6. 로그 마스킹 정책 추가

주의:

- 현재 Popbill 환경변수는 서버 관리 비밀로 남아 있는 구조를 유지한다.
- 이번 phase의 핵심은 **홈택스/로컬 인증서 자격정보를 서버에 남기지 않는 경계**를 명확히 하는 것이다.

현재 구현 메모(Phase 범위 변경 아님):

- 서버 저장 금지 대상은 새 코드 기준으로 고정한다: 홈택스 ID/PW, 공동인증서 원본 파일, 공동인증서 비밀번호.
- `organization_integrations.renewal_certificate_password_encrypted`, `customer_certificates.certificate_password_encrypted`, onboarding preview/batch의 `certificatePassword`는 새 쓰기 경로에서 저장하지 않거나 빈 값으로 정리한다.
- `renewal_automation_jobs.submission_profile_json`에는 연락처만 저장하고 `issuePassword`는 at-rest로 남기지 않는다. 고객 기준 preflight job은 agent claim 시점에만 encrypted workspace 설정에서 다시 채운다.
- `app_logs`, API 에러 응답, 로컬 헬퍼 오류 응답/콘솔은 비밀번호류와 `certDirPath` 같은 로컬 인증서 경로를 마스킹한다.
- `/api/*`와 로컬 헬퍼 응답은 `Cache-Control: no-store`를 전제로 한다.
- JWT 세션은 현행 Supabase 세션을 그대로 쓰고, invalid refresh token 감지 시 로컬 세션을 비우고 재로그인을 강제한다. 별도 inactivity timeout/재인증 flow는 이번 phase에서 추가하지 않는다.

완료 기준:

- “무엇이 서버에 남고 무엇이 남지 않는지”를 문서와 코드 양쪽에서 설명할 수 있다.
- 민감정보가 `app_logs`나 일반 API 응답에 노출되지 않는다.
- 운영 배포 환경에서 HTTPS 전제를 만족한다.

주요 파일:

- `web/src/api.ts`
- `web/src/supabase.ts`
- `server/src/api-access.ts`
- `server/src/supabase-store.ts`
- `server/src/routes/settings-routes.ts`
- `server/src/routes/renewal-routes.ts`
- `scripts/renewal-local-helper.ts`
- `docs/OPERATIONS.md`
- `docs/CERTIFICATE_RENEWAL_POC.md`

2026-04-17 구현 기준으로, 새 저장/응답/로그 경로에 대한 Phase 4 최소 범위는 완료 상태로 본다.

## Phase 5. 시범 운영 운영 리포트와 정착

목표:

- 시범 운영 중 누적된 로그를 실제 운영 판단 자료로 바꾼다.
- 자동 발행 확대 여부를 감으로 결정하지 않게 한다.

구현 항목:

1. 주간/월간 시범 운영 리포트 뷰 또는 export
2. 고객별 발행 성공률 / 예외율 / 수동 대비 자동 전환 현황
3. 주요 실패 유형 Top N
4. 1건 처리 기준 절감 시간 추정치
5. 운영 메모와 실제 로그를 대조할 수 있는 화면 또는 절차 정리

완료 기준:

- 시범 운영 종료 시 성과/문제/확대 조건을 숫자로 정리할 수 있다.
- 어떤 고객을 자동 발행으로 전환해도 되는지 판단 근거가 생긴다.

현재 구현 메모(Phase 범위 변경 아님):

- 기존 `GET /api/drafts/pilot-report`는 주간/월간 bucket, 고객별 성공률/예외율/전환 근거, 실패 유형 Top 5, 절감 시간 추정치를 함께 반환한다.
- 같은 endpoint에 `format=csv`를 붙이면 운영자가 그대로 저장/공유 가능한 CSV export를 받을 수 있다.
- 고객별 리포트는 현재 `issueMode`, 수동/자동 성공·실패 수, 최신 실패 유형/시점, `review -> auto` 전환 이력과 “성공 발행 이력 있음/없음” 근거를 같이 보여준다.
- 실패 유형 Top N은 `errorCategory -> errorOperation -> errorCode -> 제한된 message bucket` 순으로 묶는다.
- 절감 시간은 자동 발행 성공 1건당 운영자의 수동 발행 처리 10분 절감 가정으로 계산한다.
- 운영 메모 대조는 리포트가 돌려주는 `latestFailureDraftId` / `latestFailureTimelinePath`와 `GET /api/drafts/:id/pilot-timeline` 절차를 기준으로 한다.

2026-04-17 구현 기준으로 위 완료 기준을 충족하므로, Phase 5는 완료 상태로 본다.

## 6. Phase 선후관계

권장 순서:

1. Phase 1 계측
2. Phase 2 수동 발행 감사로그
3. Phase 3 자동 발행 전환 규칙
4. Phase 4 보안 경계
5. Phase 5 시범 운영 리포트

이 순서를 권장하는 이유:

- 계측 없이 보강하면 시범 운영 성과를 증명할 수 없다.
- 수동 발행 근거가 먼저 있어야 자동 발행 전환 논리가 자연스럽다.
- 보안 경계는 병행 가능하지만, 최소한 어떤 데이터가 오가는지 계측/로그 구조를 본 뒤 정리하는 편이 안전하다.

## 7. 구현 원칙 메모

- 자동 발행은 삭제 대상이 아니라 **사용자 opt-in 기반 자동화**로 유지한다.
- `review`와 `auto`는 충돌 개념이 아니라, 같은 제품 안의 두 운영 모드다.
- 시범 운영에서 가장 중요한 것은 “완전 자동화”가 아니라 “무엇이 잘됐고 무엇이 실패했는지 설명 가능한 상태”다.
- 결제/요금제는 이후 별도 문서로 다룬다. 이 문서에 다시 넣지 않는다.

## 8. 관련 파일 맵

현재 이 문서와 직접 연결되는 주요 파일:

- `server/src/routes/draft-routes.ts`
- `server/src/job-queue.ts`
- `server/src/mail-sync.ts`
- `server/src/supabase-store.ts`
- `server/src/api-access.ts`
- `web/src/App.tsx`
- `web/src/features/customers/CustomersTab.tsx`
- `web/src/api.ts`
- `web/src/supabase.ts`
- `docs/IMPLEMENTATION.md`
- `docs/SUPABASE_SCHEMA_PLAN.md`
- `docs/OPERATIONS.md`
- `docs/CERTIFICATE_RENEWAL_POC.md`
