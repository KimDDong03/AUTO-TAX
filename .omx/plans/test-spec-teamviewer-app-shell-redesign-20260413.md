# Test spec — AUTO-TAX 전면 UI/UX 개편

## Goal

전면 개편 후에도 제품이 더 단순해지고 더 빨리 이해되면서, 기존 업무 흐름은 유지되는지 검증한다.

## UX validation goals

### 1. First-glance clarity

사용자가 로그인 후 첫 화면에서 아래를 바로 이해해야 한다.

- 지금 해야 할 일
- 막힌 일
- 설정 안 된 일
- 어디를 눌러야 하는지

### 2. Reduced copy

아래 요소의 텍스트량이 기존 대비 유의미하게 줄어야 한다.

- nav
- page header
- panel subtitle
- helper copy
- onboarding guidance copy

### 3. Action-first behavior

각 주요 화면에서 아래가 보여야 한다.

- primary action 1개
- 상태 요약
- 다음 이동 경로

## Functional test areas

### 1. Shell / navigation

검증:

- 새 top-level nav가 정상 동작
- active state가 정확함
- workspace switching 유지
- logout 유지
- 관리자 진입 조건 유지

Touchpoints:

- `web/src/App.tsx:6400-6410`
- `web/src/App.tsx:7615-7728`
- `web/src/styles.css:892-1045`

### 2. Home

검증:

- 오늘 할 일 목록이 정상 노출
- onboarding 준비 항목이 홈 안에서 이해 가능
- 긴 설명 없이도 다음 행동이 보임
- 최근 결과 / 막힘 / 급한 항목이 구분됨

Touchpoints:

- `web/src/App.tsx` work/onboarding render branches
- `web/src/features/onboarding/OnboardingTab.tsx`
- `web/src/features/initial-registration/InitialRegistrationTab.tsx`

### 3. Customer

검증:

- 고객별 상태가 리스트에서 빠르게 읽힘
- 고객 상세에서 필요한 조치가 먼저 보임
- 고객 관련 인증서/발행 readiness가 고객 맥락에서 이해 가능

Touchpoints:

- `web/src/features/customers/CustomersTab.tsx`

### 4. Settings

검증:

- 메일/발행/인증서/헬퍼 준비 상태가 체크리스트처럼 보임
- 필요한 입력은 확장했을 때만 자세히 나타남
- 현재보다 폼 과밀감이 줄어듦

Touchpoints:

- `web/src/features/settings/SettingsTab.tsx`
- `web/src/features/certificates/CertificatesTab.tsx`

### 5. Admin / Ops

검증:

- 플랫폼 관리자 화면도 action-first 구조를 유지
- 진단/로그/작업이 읽기 쉽게 정리됨

Touchpoints:

- `web/src/App.tsx:8175+`

## Visual validation

### Desktop

- dark rail + bright canvas 구조가 명확함
- TeamViewer-like app mood가 느껴짐
- 전체가 마케팅 사이트가 아니라 운영 앱처럼 보임

### Mobile / tablet

- nav가 무너지지 않음
- header/action overflow 없음
- 긴 텍스트 의존도가 낮아 작은 화면에서도 읽힘

## Heuristic UX checks

각 화면에서 아래 질문에 “예”가 나와야 함:

1. 지금 해야 할 일이 바로 보이나?
2. 상태가 문장보다 구조로 읽히나?
3. 설명을 다 읽지 않아도 이해되나?
4. primary action이 하나로 보이나?
5. 이 화면이 왜 존재하는지 직감적으로 보이나?

## Technical verification

1. `npm run check`
2. `npm run test:server`
3. `npm run test:e2e:smoke`

## Manual before/after comparison

비교 대상:

1. 로그인 직후 첫 화면
2. 고객 리스트
3. 고객 상세
4. 설정 메인
5. 관리자 화면

비교 기준:

- 텍스트량 감소
- 클릭 경로 단축
- 행동 우선성 증가
- 시각적 복잡도 감소
