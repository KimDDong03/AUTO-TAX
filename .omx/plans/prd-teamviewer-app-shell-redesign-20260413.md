# AUTO-TAX 전면 UI/UX 개편 계획

## Requirements Summary

- 목표는 **예쁜 리디자인**이 아니라 **제품 사용 방식 자체를 단순화하는 전면 개편**이다.
- 기준은 “설명을 읽어야 이해되는 운영툴”이 아니라, **처음 본 사람도 바로 다음 행동을 알 수 있는 앱**이다.
- TeamViewer 레퍼런스는 “분위기 참고” 수준이 아니라 다음 원칙의 출발점으로 사용한다:
  - 짙은 좌측 앱 레일
  - 밝고 비어 있는 메인 작업 공간
  - 강한 액션 중심 구조
  - 적은 문장, 강한 위계
  - 기능 설명보다 **지금 할 일**이 먼저 보이는 화면

## Problem statement

현재 AUTO-TAX는 기능은 많지만, UI가 다음 이유로 무겁게 느껴진다.

1. **텍스트가 너무 많다**
   - 네비에도 설명이 붙어 있고 `web/src/App.tsx:6400-6410`
   - 탭별 intro도 `purpose/help` 문장 중심이다 `web/src/App.tsx:7485-7580`
2. **구조보다 설명으로 이해시키려는 경향이 있다**
   - “이 화면이 무엇인지”를 문장으로 풀고 있음
3. **업무 흐름보다 정보 나열이 먼저다**
   - 사용자는 “지금 뭘 해야 하지?”를 찾는데, UI는 “현재 시스템 상태 설명”을 먼저 보여준다
4. **탭이 기능 기준으로 분리되어 있다**
   - 실제 사용자 관점은 “준비 / 처리 / 막힘 해결 / 설정”인데, 현재는 기능 모듈 중심이다
5. **디자인 시스템이 깔끔하지만 여전히 카드형 admin tool에 머물러 있다**
   - 루트 토큰과 패널 구조가 부드러운 light SaaS 느낌이다 `web/src/styles.css:1-35`, `web/src/styles.css:2126-2218`

## Product redesign thesis

### 새 제품 원칙

AUTO-TAX는 앞으로 이렇게 보여야 한다:

- **읽는 앱이 아니라 누르는 앱**
- **설명형 화면이 아니라 행동형 화면**
- **상세 정보는 들어가서 보고, 메인에서는 결정만 한다**
- **모든 화면에서 “다음 액션 1개”가 가장 먼저 보여야 한다**

## Design decision

### 결정: “기능 탭 앱”에서 “액션 중심 운영 앱”으로 전환

이번 개편에서는 단순 스타일 교체를 넘어서 아래를 바꾼다.

1. **정보구조(IA) 재설계**
2. **카피 대량 삭제**
3. **화면별 우선 액션 재정의**
4. **탭 통합 및 단순화**
5. **TeamViewer-like shell + 초간단 운영 UX**

## New target information architecture

### 현재

- 오늘 작업
- 도입 준비
- 고객 운영
- 인증서 관리
- 작업공간 설정
- 플랫폼 관리자

### 목표 구조

#### 1. 홈
- 오늘 해야 할 일
- 막힌 일
- 준비 안 된 일
- 최근 처리 결과

#### 2. 고객
- 고객 목록
- 고객 상태
- 고객별 필요한 조치

#### 3. 설정
- 메일 연결
- 발행 설정
- 인증서/헬퍼 준비
- 계정/작업공간 설정

#### 4. 관리자
- 플랫폼 관리자 전용

### 구조 의도

- **도입 준비**는 독립 탭이 아니라 **홈 안의 “처음 설정 체크리스트”**로 흡수
- **인증서 관리**는 독립 탭이 아니라 **설정 + 고객 상태 맥락 안으로 재배치**
- 사용자는 “기능 카테고리”가 아니라 **업무 단계** 기준으로 이동한다

## Core UX principles for the overhaul

### 1. 한 화면 = 한 결정

- 화면에 primary action은 1개
- 보조 액션은 숨기거나 약하게
- “읽고 이해”보다 “보고 결정”이 먼저

### 2. 텍스트 예산 도입

- 네비: **라벨만**
- 화면 제목: 최대 1줄
- 보조 설명: 필요할 때만 1문장
- 패널 설명: 기본적으로 제거
- 현재 `purpose/help/description` 계열 카피는 대폭 삭제 대상

### 3. 상태를 문장이 아니라 구조로 보여주기

- 준비됨 / 확인 필요 / 막힘 / 만료 임박
- 문장 설명 대신:
  - 색
  - 칩
  - 숫자
  - 다음 액션 버튼

### 4. 홈 화면은 “통계판”이 아니라 “명령 센터”

- KPI 카드 나열보다:
  - 지금 처리할 것
  - 먼저 해결할 막힘
  - 바로 이동 버튼

### 5. 상세는 들어가서 보고, 메인에서는 요약만 본다

- 메인 화면에서 긴 설명/가이드 제거
- 상세 패널에서만 이유와 이력 노출

## Visual direction

### Mood

- TeamViewer 같은 **깔끔한 데스크톱 앱**
- 짙은 네이비 레일
- 밝은 화이트 작업 영역
- 강한 블루 액센트
- 정리된 행/열 구조
- 평평하고 차분한 패널

### What to remove

- 과한 설명 문구
- “도움말성 부제” 남발
- 동일한 정보를 여러 카드에서 반복하는 패턴
- 너무 많은 작은 패널 분절
- 사용자에게 생각을 시키는 선택지 과다

## Scope

### In scope

1. 인증된 앱 전체 IA 재설계
2. 메인 shell 재설계
3. 홈/고객/설정/관리자 중심으로 네비 재구성
4. copy reduction 전면 적용
5. shared components 재설계
6. 각 탭/플로우 재배치
7. `DESIGN.md` 전면 업데이트

### Out of scope

1. 서버 API 변경
2. 데이터 모델 변경
3. 업무 로직 자체 변경
4. 새 외부 디자인 라이브러리 도입
5. 이번 단계에서의 기능 추가

## Execution plan

### Phase 1 — UX 구조 재설계

**목표:** 지금 화면을 예쁘게 만드는 게 아니라, 무엇을 없애고 무엇만 남길지 결정한다.

Tasks:

1. 현재 top-level IA를 새 구조로 다시 매핑
   - `work + onboarding` → `홈`
   - `customers` → `고객`
   - `certificates + settings` → `설정`
   - `ops` → `관리자`
2. 각 top-level 목적을 1문장으로 축약
3. 각 화면의 primary action을 1개씩 정의
4. 제거 대상 카피/패널/중복 정보 목록 작성

Primary files:

- `web/src/App.tsx:6400-6410`
- `web/src/App.tsx:7485-7580`
- `DESIGN.md`

### Phase 2 — app shell 전면 교체

**목표:** 제품 첫 인상을 완전히 바꾼다.

Tasks:

1. 좌측 네비를 dark rail 기반으로 재설계
2. 상단 hero를 제거하고 compact action bar로 치환
3. workspace meta / quick actions / global status를 상단 유틸리티 바로 재구성
4. nav description 제거, 라벨만 남김
5. active state를 더 강하게 보이도록 재설계

Primary files:

- `web/src/App.tsx:7615-7728`
- `web/src/styles.css:892-1045`

### Phase 3 — shared component 시스템 재정의

**목표:** 전체 화면이 한 제품처럼 보이게 공용 부품부터 바꾼다.

Tasks:

1. `Panel`을 “설명 박스”가 아니라 “작업 컨테이너”로 재정의
2. `StatCard`를 단순 숫자 카드가 아니라 action-linked status tile로 재설계
3. `AppDialog`를 더 간결한 confirm/action UX로 정리
4. 버튼 계층을 단순화
5. chip/status 체계를 더 직관적으로 통일

Primary files:

- `web/src/components/ui.tsx`
- `web/src/styles.css:2126-2218`

### Phase 4 — Home 재구축

**목표:** 사용자가 로그인하자마자 “아 이렇게 하면 되는구나”를 느끼게 만든다.

Tasks:

1. 현재 work 화면을 “오늘 할 일” 중심으로 재구성
2. onboarding 상태를 별도 탭이 아니라 홈 체크리스트로 흡수
3. 상태판형 카드보다 action queue를 메인으로 승격
4. 막힌 항목 / 급한 항목 / 방금 끝난 항목만 노출
5. 불필요한 설명 패널 제거

Primary touchpoints:

- `web/src/App.tsx` work/onboarding render branches
- `web/src/features/onboarding/OnboardingTab.tsx`
- `web/src/features/initial-registration/InitialRegistrationTab.tsx`
- work/onboarding 관련 CSS 섹션

### Phase 5 — Customer UX 재구성

**목표:** 고객 화면에서 “상태 확인 + 바로 조치”가 한눈에 보이게 한다.

Tasks:

1. 고객 리스트를 상태 중심으로 재정렬
2. 고객 상세 진입 전에도 막힘 이유를 짧게 보여줌
3. 고객 상세는 설명보다 action slot 우선
4. 고객 관련 인증서 상태를 고객 맥락에서 노출

Primary touchpoints:

- `web/src/features/customers/CustomersTab.tsx`
- 관련 상태/리스트 CSS

### Phase 6 — Settings UX 재구성

**목표:** 설정은 “다양한 옵션 폼”이 아니라 “준비 완료 체크 화면”처럼 만든다.

Tasks:

1. 설정을 폼 나열에서 readiness checklist 구조로 전환
2. 인증서/헬퍼/메일 연결을 “준비됨 / 확인 필요 / 막힘”으로 요약
3. 상세 입력은 펼쳤을 때만 보이게 단계화
4. 현재 독립 인증서 탭 내용 중 실제 준비 업무는 설정으로 통합

Primary touchpoints:

- `web/src/features/settings/SettingsTab.tsx`
- `web/src/features/certificates/CertificatesTab.tsx`

### Phase 7 — 관리자 화면 정리

**목표:** ops도 같은 제품 언어 안에서 더 단순하게 만든다.

Tasks:

1. 플랫폼 관리자 화면도 action-first 구조로 정리
2. 로그/진단/작업/포인트 영역을 역할별로 분리
3. 복잡한 운영 카드들을 더 단순한 list + action 구조로 변환

Primary touchpoints:

- `web/src/App.tsx:8175+`

### Phase 8 — copy pass / deletion pass

**목표:** 실제로 텍스트를 덜어낸다.

Tasks:

1. 제목 아래 설명 문장 전수 점검
2. 중복 라벨/부제/설명 삭제
3. 버튼 문구를 동사형으로 재정리
4. “읽어야만 이해되는 문구” 제거

## Copy rules for the overhaul

### Keep

- 오늘 할 일
- 확인 필요
- 준비됨
- 막힘
- 만료 임박
- 지금 처리
- 다시 확인
- 설정하기

### Remove or minimize

- 장문 소개
- 탭 설명 부제
- “이 화면에서는 ~ 할 수 있습니다” 류 문장
- 같은 상태를 문장 + 칩 + 카드로 반복하는 패턴

## Acceptance Criteria

1. 로그인 후 첫 화면에서 사용자는 **3초 안에 다음 행동을 이해**할 수 있다.
2. top-level navigation은 현재보다 적은 개수의 더 단순한 목적 중심 구조가 된다.
3. 네비에는 설명문이 없고, 화면 내 장문 intro도 대부분 제거된다.
4. 홈 화면은 통계판보다 action center에 가깝다.
5. onboarding과 certificates의 핵심 준비 업무는 더 자연스러운 위치로 흡수된다.
6. 모든 주요 화면에서 primary action이 명확하다.
7. 현재 대비 전체 UI 텍스트량이 눈에 띄게 감소한다.
8. 제품 전체가 TeamViewer-like desktop app mood를 가지되, AUTO-TAX 업무 맥락은 유지한다.

## Risks and mitigations

### Risk 1 — 너무 많이 합쳐서 기능을 찾기 어려워질 수 있음

Mitigation:

- top-level은 줄이되, 내부 세부 액션은 명확히 분기
- 고객/설정/관리자 같은 명확한 목적 축은 유지

### Risk 2 — 텍스트를 줄이다가 의미가 사라질 수 있음

Mitigation:

- 메인에서는 짧게, 상세에서는 충분히
- 설명 삭제 전 상태/행동 구조를 먼저 강화

### Risk 3 — 대수술이라 CSS/구조 영향 범위가 큼

Mitigation:

- shell → shared primitives → home → customers → settings → ops 순서로 단계 적용
- 각 단계마다 시각/회귀 검증

## Verification steps

1. IA before/after 비교
2. 홈 화면 5초 스캔 테스트
   - “지금 뭘 해야 하는지 보이는가?”
3. 고객 화면 5초 스캔 테스트
   - “어느 고객이 막혔는지 보이는가?”
4. 설정 화면 5초 스캔 테스트
   - “무엇이 미설정인지 보이는가?”
5. 텍스트량 비교
   - redesign 전후 top-level shell 텍스트 수 비교
6. 기술 검증
   - `npm run check`
   - `npm run test:server`
   - `npm run test:e2e:smoke`

## Recommended build order

1. UX 구조도 작성
2. 카피 삭제 기준 수립
3. App shell 교체
4. Shared component 재정의
5. Home 재구축
6. Customer 재구축
7. Settings/Certificates 재구축
8. Ops 정리
9. 전체 copy deletion pass
10. QA

## ADR

### Decision

AUTO-TAX를 “기능 탭 기반 운영툴”에서 “액션 중심 초간단 운영 앱”으로 전면 개편한다.

### Drivers

1. 글자가 너무 많아 한눈에 이해되지 않음
2. 설명 중심 UX가 행동 중심 UX보다 앞서 있음
3. 현재 구조가 사용자 업무 흐름보다 내부 기능 구조를 더 닮아 있음

### Alternatives considered

1. **스타일만 리디자인**
   - 기각: 문제의 핵심이 정보 구조와 카피 과잉이라서 부족함
2. **현재 탭 구조 유지 + 카피만 축소**
   - 기각: 사용 흐름 자체가 더 단순해질 필요가 있음
3. **전체 기능 재구현**
   - 기각: 이번 단계의 목표는 UX 전면 개편이지 로직 재작성 아님

### Why chosen

전체 IA, shell, 카피, 작업 흐름을 같이 손봐야만 “한눈에 이해되는 제품”으로 바뀐다.

### Consequences

- 프론트 구조 변경 폭이 커짐
- 디자인/카피/탭 구조를 같이 다뤄야 함
- 대신 제품 인상이 완전히 달라질 수 있음

### Follow-ups

1. 홈 화면의 정확한 카드/리스트 구조 와이어 정리
2. 새 top-level nav 구조 확정
3. copy deletion rule을 실제 컴포넌트에 적용

