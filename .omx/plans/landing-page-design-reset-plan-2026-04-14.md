# AUTO-TAX 공개 랜딩 디자인 리셋 계획

작성일: 2026-04-14

## Requirements Summary

- 사용자 피드백은 이제 단순 간소화가 아니라 **디자인 자체를 다시 짜야 한다**는 단계다.
- 직전 랜딩은 CTA 수와 텍스트 밀도는 줄였지만, 여전히 `hero + 우측 로그인 카드 + 카드형 섹션 반복`이라는 기본 시각 구조를 유지하고 있어 체감상 새 페이지로 느껴지지 않는다.
- 다음 동작은 유지해야 한다.
  - 로그인 동선
  - 도입 문의 토글
  - 가격 계산기
  - 플랜 전환
  - 가격 기반 문의 프리필
- 새 방향은 `DESIGN.md`의 운영 도구 원칙은 지키되, 현재 페이지보다 훨씬 더 **제품 표면 중심 / 엔터프라이즈 신뢰형 / use-case 중심**으로 재설계해야 한다.

## Reference Synthesis

### 1. Linear
- Linear의 핵심은 헤드라인보다 **제품 표면이 먼저 보이는 구조**다. 가격 페이지도 카피를 길게 설명하기보다 플랜 구분과 기능 표를 빠르게 읽게 만든다.
- 참고 포인트:
  - 짧은 헤드라인 + 낮은 CTA 밀도
  - 제품 화면이 페이지 인상을 결정
  - 가격은 카드 장식보다 구조와 표가 중심
- Sources:
  - https://linear.app/pricing
  - https://linear.app/customers

### 2. GitHub Enterprise
- GitHub Enterprise는 엔터프라이즈 톤을 **플랫폼 하나로 통합**, **보안/거버넌스 신뢰**, **큰 제품 비주얼 + 짧은 보조 설명**으로 만든다.
- 참고 포인트:
  - "one secure platform" 식의 단일 플랫폼 framing
  - customer logo / trust strip
  - 긴 설명 대신 큰 섹션 제목 + 짧은 supporting line + 구체 기능 bullet
- Source:
  - https://github.com/enterprise

### 3. Retool for Operations Teams
- Retool은 가장 직접적으로 우리와 비슷한 톤을 준다. `From manual processes to proactive operations`처럼 **대상 팀과 문제를 먼저 정의**하고, 이후 use-case buckets로 풀어낸다.
- 참고 포인트:
  - audience-specific framing
  - "manual -> proactive" 식의 운영 전환 서사
  - 업종/팀 기준 use-case list
  - 스크린샷이 텍스트보다 먼저 설득
- Source:
  - https://retool.com/for/operations-teams

### 4. Stripe Billing Pricing
- Stripe Billing은 가격 구간에서 **설명보다 인터랙션과 plan structure**를 우선한다.
- 참고 포인트:
  - 가격은 설명 섹션이 아니라 계산/비교 surface
  - 플랜 설명은 짧고, included/price가 구조적으로 읽힘
  - FAQ/기능 나열은 가격 아래 보조 정보로 배치
- Source:
  - https://stripe.com/billing/pricing

## Current Landing Diagnosis

### 1. 시각적 중심이 아직 없다
- 현재 hero는 짧아졌지만 결국 `카피 + proof rows` 정도만 있고, 제품 자체가 보이지 않는다.
- 관련 위치:
  - `web/src/features/public/PublicLanding.tsx:99-121`
  - `web/src/features/public/public-content.ts:42-60`

### 2. 로그인 박스가 여전히 메인 구도 한 축을 차지한다
- 우측 sticky 로그인 박스는 utility 역할이어야 하는데, 지금도 first viewport의 절반 가까운 시각 무게를 가져간다.
- 관련 위치:
  - `web/src/features/public/PublicLanding.tsx:124-222`
  - `web/src/styles.css:532-544`

### 3. 전체가 여전히 “하얀 카드 여러 개”로 읽힌다
- hero, section, pricing card, calculator, faq block 모두 둥근 흰 surface 계열이라 새 구조를 넣어도 page rhythm이 거의 바뀌지 않는다.
- 관련 위치:
  - `web/src/styles.css:412-425`
  - `web/src/styles.css:537-629`
  - `web/src/styles.css:728-1048`

### 4. 운영 설명은 있지만 “운영 콘솔”의 인상은 약하다
- 운영 방식/가격/FAQ가 모두 텍스트와 작은 rows 중심이라, 실제 제품을 도입하는 느낌보다 문서 읽는 느낌이 남아 있다.
- 관련 위치:
  - `web/src/features/public/PublicLanding.tsx:225-354`

## Design Reset Direction

## Decision
**현재의 “정리된 카드형 소개 페이지”를 버리고, “운영 콘솔 프리뷰 중심의 엔터프라이즈 랜딩”으로 전환한다.**

이 리셋에서 핵심은 텍스트를 더 줄이는 것만이 아니라, **페이지의 첫 인상을 카피가 아니라 제품 표면이 결정하게 만드는 것**이다.

## Core Principles

1. **Product-first**
   - 첫 화면에서 텍스트보다 운영 화면 프리뷰가 먼저 읽혀야 한다.
2. **Utility separated from narrative**
   - 로그인/문의는 utility lane으로 분리하고 hero와 경쟁시키지 않는다.
3. **Enterprise calm**
   - 과장 없이 차분한 톤, 큰 surface, 적은 장식, 신뢰 중심 구성.
4. **Use-case specific**
   - “태양광 전자세금계산서 운영”이라는 대상/문제를 계속 잃지 않는다.
5. **Calculator-first pricing**
   - 가격은 카드 나열보다 계산기와 비교 구조가 중심이어야 한다.

## Target Information Architecture

### Block 1. Hero + Product Frame
**목표:** “무슨 도구인지”를 5초 안에 이해시키기

구성:
- 좌측:
  - badge 1
  - headline 1
  - supporting sentence 1
  - CTA 2 (`운영 방식 보기`, `가격 보기`)
  - proof row 3개 이하
- 우측 또는 하단:
  - **큰 운영 콘솔 프레임 1개**
  - 실제 앱을 축약한 preview 구성
    - 메일 수집 상태
    - 발행 대상 수
    - 검수 필요 건
    - 발행 준비/완료 상태

중요:
- 로그인 박스를 hero 옆 메인 축에서 제거한다.
- hero는 카피 섹션이 아니라 **제품 프리뷰 섹션**이 되어야 한다.

대상 파일:
- `web/src/features/public/PublicLanding.tsx`
- `web/src/features/public/public-content.ts`
- `web/src/styles.css`

### Block 2. Utility Rail (로그인/문의)
**목표:** 로그인/문의 기능은 유지하되, 시각 위계는 낮추기

권장 구조:
- hero 바로 아래 또는 topbar 아래의 **가로 utility rail**
- desktop:
  - 좌: `기존 고객 로그인` 필드 2개 + 로그인 버튼
  - 우: `도입 문의` 토글 텍스트 버튼
- mobile:
  - 접히는 utility panel 또는 1열 stacked rail

중요:
- 로그인은 utility action으로 보여야지 랜딩의 “반쪽 레이아웃”이 되면 안 된다.
- 도입 문의 폼은 기본 접힘 유지.
- 기존 id/동작은 유지하거나 smoke script와 함께 안전하게 갱신.

현재 유지해야 할 로직 연결점:
- `web/src/App.tsx:931-940` — 가격 기반 문의 프리필
- `web/src/App.tsx:3192-3239` — 문의 제출/토글/스크롤
- `web/src/App.tsx:3241-3265` — 공개 로그인

### Block 3. Operating System Narrative
**목표:** “운영이 어떻게 바뀌는지”를 텍스트 아닌 구조로 보여주기

구성:
- 좌측 큰 lane: 4-step 운영 흐름
  1. 메일 수집
  2. 대상 정리
  3. 초안 준비
  4. 검수 발행
- 우측 보조 lane:
  - `이런 팀`
  - `운영 원칙`
- 가능하면 step 옆에 hero product frame과 연결되는 callout 사용

중요:
- 현재처럼 단순한 step list 자체는 유지 가능하나, visual density를 높이기 위해 **timeline / connector / highlighted state**가 필요하다.
- 카드 4개를 다시 늘어놓는 방식은 피한다.

대상 파일:
- `web/src/features/public/PublicLanding.tsx:225-257`
- `web/src/features/public/public-content.ts:63-114`
- `web/src/styles.css:607-714`, `960-1009`

### Block 4. Pricing Control Surface
**목표:** 가격을 “읽는 섹션”이 아니라 “맞춰보는 섹션”으로 만들기

구성:
- 좌측: **계산기 우선**
  - 플랜 전환 segmented control
  - 고객 수 입력
  - 예상 금액
  - 포함/초과 breakdown
  - `이 규모로 도입 문의`
- 우측: 카드 대신 **plain comparison table/list**
  - 플랜명
  - 기본 요금
  - 포함 고객 수
  - 초과 단가
- FAQ는 pricing 아래의 아주 약한 row list

중요:
- 현재 price cards는 줄이긴 했지만 여전히 card comparison 느낌이 강하다.
- 다음 버전은 `comparison table/list + calculator` 구조가 더 맞다.

대상 파일:
- `web/src/features/public/PublicLanding.tsx:260-354`
- `web/src/styles.css:716-1048`

## Visual Language Reset

### Keep
- 기존 color token
- 운영 도구 톤
- 차분한 primary 사용
- sharp한 info hierarchy

### Change hard
1. **card repetition 줄이기**
   - section마다 똑같은 둥근 흰 박스를 쓰지 않는다.
2. **large frame 도입**
   - hero용 큰 console frame 1개를 만든다.
3. **band rhythm 만들기**
   - section을 모두 카드가 아니라 band/rail/surface mix로 설계한다.
4. **trust strip 도입 검토**
   - 숫자/대상/운영 기준을 짧은 strip으로 배치한다.
5. **utility UI 경량화**
   - 로그인/문의는 박스보다 rail, drawer, compact panel에 가깝게.

## Concrete Implementation Steps

### Step 1. 새 와이어프레임 기준으로 콘텐츠 모델 재정의
- `web/src/features/public/public-content.ts`
- 작업:
  - hero copy 유지하되 product frame용 mock data 추가
  - 운영 흐름 텍스트는 timeline/callout 기준으로 재정의
  - pricing comparison용 row labels 정리
  - FAQ는 그대로 3개 유지

### Step 2. PublicLanding 구조를 4개 밴드로 재배치
- `web/src/features/public/PublicLanding.tsx`
- 작업:
  - hero에서 로그인 분리
  - utility rail 추가
  - product preview frame 추가
  - operations band를 timeline + side lists로 재작성
  - pricing을 calculator-first + comparison list로 재배치

### Step 3. landing 전용 surface language를 다시 잡기
- `web/src/styles.css`
- 작업:
  - `landing-*` 구간의 section/card 규칙 재설계
  - hero frame / utility rail / comparison list / faq row 스타일 추가
  - 기존 card-stacking 인상 제거
  - mobile에서 rail -> stack 흐름 정리

### Step 4. smoke 검증 selector를 새 구조에 맞게 갱신
- `scripts/public-landing-smoke.mjs`
- 작업:
  - hero CTA 수
  - 로그인 이동
  - 도입 문의 토글
  - 계산기 / 플랜 전환 / 프리필
  - 모바일 1열 흐름
  검증을 새 markup 기준으로 조정

## Acceptance Criteria

1. 첫 화면에 **큰 product frame 1개**가 존재한다.
2. hero는 **headline 1 + supporting sentence 1 + CTA 2 + proof 3 이하**를 유지한다.
3. 로그인/문의는 hero 주구도에서 분리된 utility surface로 보인다.
4. 운영 방식 섹션은 카드 4개 나열이 아니라 **timeline 또는 connected flow**로 읽힌다.
5. 가격 섹션은 **calculator-first**이며, plan 정보는 plain comparison 구조로 읽힌다.
6. FAQ는 main promo section이 아니라 row/list 보조 정보로 보인다.
7. 로그인, 문의 토글, 계산기, 플랜 전환, 가격 기반 문의 프리필이 모두 유지된다.

## Risks and Mitigations

- **위험:** product preview를 억지 mockup처럼 꾸미면 마케팅 느낌이 강해질 수 있음
  - **대응:** 실제 AUTO-TAX 화면에서 쓰는 상태 라벨/운영 용어만 사용하고, decorative fake chart는 금지

- **위험:** 로그인 분리 후 기존 고객 접근성이 떨어질 수 있음
  - **대응:** topbar `로그인` 유지 + utility rail에 즉시 입력 가능 구조 유지

- **위험:** 큰 리셋 이후 모바일 흐름이 어색해질 수 있음
  - **대응:** desktop wireframe보다 mobile stack 순서를 먼저 정의하고 구현

## Verification Steps

1. hero first viewport에서 아래가 5초 안에 읽혀야 한다.
   - 무엇을 하는 도구인지
   - 운영 화면이 어떤 느낌인지
   - 어디서 로그인하는지
2. 로그인/문의는 main sales CTA처럼 튀지 않고 utility처럼 보여야 한다.
3. 가격 구간은 plan 카드보다 계산기를 먼저 쓰게 해야 한다.
4. `npm run check` 통과
5. `node scripts/public-landing-smoke.mjs` 통과
6. desktop/mobile screenshot 확인

## Recommendation

다음 세션은 **카피 미세조정 없이 바로 와이어프레임 리셋 구현**으로 들어가는 것이 맞다.
우선순위는 아래 순서다.

1. hero product frame 추가
2. 로그인/문의 utility rail 분리
3. operations timeline 재설계
4. pricing comparison table/list 재설계
5. faq 약화 및 spacing 재조정
