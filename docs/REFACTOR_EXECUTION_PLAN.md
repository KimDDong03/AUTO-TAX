# 리팩토링 실행 순서

## 목적

- 테스트/운영 팝빌 환경 혼선을 줄인다.
- 화면과 서버 진입점의 결합도를 낮춘다.
- 메일 동기화 비용을 줄이고 운영 안정성을 높인다.

## 실행 순서

### 1. draft 발행 환경 저장 및 mismatch 차단

- `invoice_drafts.popbill_environment` 추가
- 실제 발행 성공 시점에 `test | production` 저장
- 보기/인쇄/문서정보/취소 시 현재 서버 환경과 draft 환경이 다르면 팝빌 호출 전에 차단
- 기존 draft는 강제 추정하지 않고, 성공 조회 시점에 점진적으로 백필

### 2. 고객 화면 분리

- `web/src/features/customers/` 신설
- 고객 목록, 고객 상세, 고객 폼, 팝빌 액션 영역 분리
- `App.tsx` 에서는 탭 전환과 공용 상태만 유지

### 3. 초기 등록 화면 분리

- `web/src/features/initial-registration/` 신설
- 엑셀 업로드, 컬럼 매핑, 빠른 등록, 월별 완료 처리 분리
- 파일 파싱/매핑 헬퍼도 화면 밖으로 이동

### 4. 설정 화면 분리

- `web/src/features/settings/` 신설
- 메일 연결, 팝빌 기본값, 계정 보안 섹션 분리
- 자동 저장 상태 관리 로직을 전용 hook으로 이동

### 5. 서버 customers/drafts/popbill 라우트 분리

- `server/src/routes/customers.ts`
- `server/src/routes/drafts.ts`
- `server/src/routes/popbill.ts`
- `main.ts` 는 앱 생성, 공통 미들웨어, 라우터 mount만 담당

### 6. 서버 서비스 계층 분리

- `server/src/services/popbill-customer-service.ts`
- `server/src/services/draft-service.ts`
- `server/src/services/customer-import-service.ts`
- 팝빌 가입/복구/재시도, draft 발행/취소, 초기 등록 검증을 라우트 밖으로 이동

### 7. 메일 동기화 체크포인트 도입

- 작업공간 설정 또는 별도 상태 테이블에 `last_synced_uid` 저장
- 첫 연결만 최근 N통 백필
- 이후부터는 마지막 UID 이후만 fetch
- 중복 스캔과 불필요한 IMAP 조회를 줄임

## 완료 기준

- 새 발행건은 테스트/운영 환경이 draft에 명시된다.
- `App.tsx` 와 `main.ts` 는 더 이상 기능별 대형 파일 역할을 하지 않는다.
- 메일 동기화는 전체 최근 메일 재스캔보다 체크포인트 기반으로 동작한다.
- 팝빌/초기 등록/고객관리 기능 수정 시 영향 범위가 기능 폴더 안으로 줄어든다.

## 이번 실행 범위

이번 턴에서는 위 순서를 문서화하고, 가능한 범위까지 연속으로 실제 코드에 반영한다.

## 현재 반영 상태

- 완료: `invoice_drafts.popbill_environment` 저장 및 조회/보기/인쇄/취소 mismatch 차단
- 완료: `web/src/features/customers/CustomersTab.tsx` 로 고객 화면 분리
- 완료: `web/src/features/initial-registration/InitialRegistrationTab.tsx` 로 초기 등록 화면 분리
- 완료: `web/src/features/settings/SettingsTab.tsx` 로 설정 화면 분리
- 완료: `server/src/routes/customer-popbill-routes.ts` 로 고객/팝빌 라우트 분리
- 완료: `server/src/routes/draft-routes.ts` 로 초안 발행/취소/조회 라우트 분리
- 완료: `server/src/routes/settings-routes.ts` 로 설정/초기등록/파트너 포인트 라우트 분리
- 완료: `server/src/routes/mail-routes.ts` 로 메일 동기화/재처리 라우트 분리
- 완료: `server/src/routes/core-routes.ts` 로 health/public login/bootstrap/internal jobs 라우트 분리
- 완료: `server/src/routes/organization-member-routes.ts` 로 작업공간 사용자 관리 라우트 분리
- 완료: `server/src/routes/ops-routes.ts` 로 플랫폼 관리자 작업공간 관리 라우트 분리
- 완료: `server/src/routes/renewal-routes.ts` 로 renewal-agent 라우트 분리
- 완료: `server/src/services/customer-import-service.ts` 로 초기 등록 preview/commit 로직 분리
- 완료: `server/src/services/draft-service.ts` 로 draft 환경 검증/백필 로직 분리
- 완료: 메일 동기화 체크포인트 테이블 및 `last_uid` 기반 fetch 도입
- 완료: `server/src/services/popbill-customer-service.ts` 로 팝빌 가입/재시도 로직 분리
- 완료: `server/src/http-errors.ts` 로 공통 `HttpError`/API 에러 응답 로직 분리
- 완료: `server/src/route-types.ts`, `server/src/admin-types.ts` 로 라우트 공용 타입 분리
- 완료: `server/src/app-shell.ts` 로 `/api/logs` 및 SPA fallback 정리
- 완료: `server/src/api-access.ts` 로 API auth/access guard 분리
- 완료: `server/src/auth-utils.ts`, `server/src/auth-user-service.ts`, `server/src/workspace-admin-service.ts` 로 `main.ts` 공통 helper/service 추출
- 완료: `main.ts` 는 현재 앱 생성, route registration, 핵심 schema/normalizer, 에러 처리 중심으로 축소
- 완료: route/service deps 의 느슨한 `any` 타입 정리
- 완료: 세션 변경 중 stale bootstrap/load 요청 취소 처리로 로그아웃 직후 잔여 401 제거
- 완료: `scripts/e2e-smoke.mjs` 로 핵심 경로 E2E 스모크 테스트 파일화
- 완료: `npm run test:server`, `npm run test:e2e:smoke` 실행 스크립트 추가
- 완료: `server/src/auth-utils.test.ts`, `server/src/services/customer-import-service.test.ts`, `server/src/services/draft-service.test.ts` 단위 테스트 추가
- 완료: 고객 초기 등록에서 `xlsx` 지연 로딩 및 웹 번들 분리 설정 적용
- 완료: 핵심 경로 E2E 검증
  - 공개 로그인
  - 고객 등록 엔터 제출
  - 초기 등록 CSV 미리보기/가져오기
  - 설정 사용자 추가
  - 로그아웃
  - 결과: API 4xx/5xx 0건, console error 0건, page error 0건

## 추가 개선 후보

1. route/service 단위 테스트 추가
2. E2E 시나리오를 스크립트 파일로 고정해 회귀 테스트 자동화
3. 웹 번들 청크 분리로 `vite` 경고 중인 대형 번들 축소
