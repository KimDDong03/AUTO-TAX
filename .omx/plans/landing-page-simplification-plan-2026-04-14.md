# AUTO-TAX 랜딩 간소화 / 구조 재편 계획

작성일: 2026-04-14

## Requirements Summary

- 현재 공개 랜딩은 이미 `App.tsx` 인라인에서 분리되었지만, 실제 읽기 경험은 아직 `설명 텍스트가 많은 운영 소개 페이지`에 가깝다. 핵심 마크업은 `web/src/features/public/PublicLanding.tsx:103-383`에 있고, 데이터/카피는 `web/src/features/public/public-content.ts:22-145`에 모여 있다.
- 텍스트가 많아 보이는 직접 원인은 각 섹션이 거의 항상 **eyebrow + 큰 제목 + 설명 문단 + 카드 설명 문단**을 같이 갖기 때문이다. 예를 들어 hero (`PublicLanding.tsx:106-129`), workflow (`235-249`), fit (`252-264`), pricing (`268-343`), faq (`356-383`)가 모두 같은 패턴으로 반복된다.
- 특히 현재 `public-content.ts`의 카피 구조는 카드마다 완전한 문장을 여러 번 보여준다. hero point 설명 (`47-63`), workflow 설명 (`65-82`), fit section 설명 + 항목 (`84-105`), FAQ 답변 (`107-124`)이 누적되어 첫 인상에서 밀도가 높다.
- 스타일도 현재는 모든 정보 블록을 카드성 표면으로 다루는 경향이 있어 텍스트가 시각적으로 더 많아 보인다. `landing-section`, `landing-proof-card`, `landing-step-card`, `landing-fit-card`, `landing-faq-card`가 모두 같은 강도로 서 있다 (`web/src/styles.css:564-625`, `633-649`, `856-896`).

## Problem Statement

지금 랜딩은 “무엇을 하는 제품인지”는 설명하지만, **너무 많은 짧은 설명이 연속으로 나와서 한 번에 읽히지 않는다.**

필요한 것은 정보 추가가 아니라:

1. **중복 설명 제거**
2. **섹션 병합**
3. **카드 수 축소**
4. **문단을 라벨/리스트/짧은 문장으로 변환**

## Goal

랜딩을 “설명 많은 소개 페이지”에서 **짧게 훑어도 이해되는 운영형 첫 화면**으로 바꾼다.

## Acceptance Criteria

1. 첫 화면의 핵심 카피는 **헤드라인 1개 + 보조문 1개 + 짧은 근거 항목 3개 이하**로 제한한다.
2. 본문 랜딩은 **3개의 주요 정보 블록 + 하단 CTA** 수준으로 줄인다.
3. 각 주요 블록의 도입 설명은 **최대 1문장**만 허용한다.
4. workflow / fit / faq 중 최소 2개는 **별도 독립 섹션이 아니라 병합된 구조**로 재편한다.
5. 로그인 진입, 도입 문의 토글, 가격 계산기, 플랜 전환 동선은 그대로 유지한다.
6. 새 구조가 `DESIGN.md`의 “운영 도구”, “과한 장식 금지”, “카드 중첩 지양” 원칙과 충돌하지 않는다.

## Recommended Direction

### 권장 구조: 3-블록 랜딩

#### Block 1. Hero + 로그인
- 위치: 현재 hero/login 영역 재구성 (`PublicLanding.tsx:103-232`)
- 구성:
  - 헤드라인 1개
  - 보조문 1개
  - 3개 근거 항목: **한 줄 라벨만**
  - 우측 또는 하단 compact 로그인 패널
- 제거/축소:
  - hero proof card의 설명 문단 제거
  - 로그인 카드의 안내 문구/field hint 축소

#### Block 2. 운영 방식 요약
- 위치: 현재 workflow + fit 병합 (`PublicLanding.tsx:235-264`)
- 구성:
  - 좌측: 4단계 흐름 strip
  - 우측: “이런 팀에 맞습니다” / “운영 방식” 2개 짧은 리스트
- 제거/축소:
  - workflow section 설명 문단 축소
  - fit section의 긴 제목/설명 제거
  - list item도 현재보다 더 짧은 명사구로 압축

#### Block 3. 가격 + FAQ
- 위치: 현재 pricing + faq 재구성 (`PublicLanding.tsx:267-383`)
- 구성:
  - 상단: 가격 카드 + 계산기
  - 하단: compact FAQ 3개
- 제거/축소:
  - 가격 section 도입 문장 1개로 축소
  - FAQ는 4개 → 3개 검토
  - FAQ 답변은 1~2문장 → 1문장 또는 disclosure

#### Footer CTA
- 현재 FAQ 하단 CTA (`PublicLanding.tsx:370-381`)를 더 짧은 strip으로 단순화
- 버튼 2개만 유지:
  - 도입 문의
  - 기존 고객 로그인

## Why This Direction

이 방향이 가장 적합한 이유:

- 현재 과밀감의 핵심은 **텍스트 양**보다 **설명 레이어 수**다.
- 가격 계산기와 로그인은 기능적으로 중요하므로 제거보다 **compact화**가 낫다.
- workflow / fit / faq를 전부 독립 섹션으로 두면 다시 장문 구조가 되기 쉽다.
- 따라서 “정보 삭제 + 섹션 병합”이 가장 큰 효과를 낸다.

## Scope of Change

### 1. 카피 데이터 재설계
- 대상: `web/src/features/public/public-content.ts`
- 작업:
  - `LANDING_HERO_POINTS`: `description` 제거 검토
  - `LANDING_WORKFLOW_STEPS`: 설명 문장을 한 줄 동사구로 축소하거나 제거
  - `LANDING_FIT_SECTIONS`: `title/description/items` 3중 구조를 `label + items` 수준으로 평탄화
  - `LANDING_FAQS`: 3개만 남기고 답변을 더 짧게 압축

### 2. 랜딩 섹션 병합
- 대상: `web/src/features/public/PublicLanding.tsx`
- 작업:
  - `workflow`와 `fit`를 독립 section 2개가 아니라 **하나의 운영 요약 블록**으로 합친다
  - `pricing`와 `faq`도 상하 결합된 하나의 정보 블록으로 재구성한다
  - 결과적으로 section count를 줄인다

### 3. 로그인 패널 compact화
- 대상: `web/src/features/public/PublicLanding.tsx:133-230`
- 작업:
  - 카드 제목을 더 짧게
  - 안내문 1문장만 유지
  - field hint 축소 또는 제거
  - 문의 폼은 기본 hidden 유지

### 4. 스타일 밀도 재조정
- 대상: `web/src/styles.css:495-896`
- 작업:
  - proof/fit/faq 카드 강도를 낮춘다
  - 모든 블록을 동일한 “큰 카드”로 다루지 않도록 차등화한다
  - 가능하면 일부 블록은 카드 대신 plain row/list 느낌으로 처리한다
  - section head 하단 `p`의 존재를 기본값이 아니라 선택값으로 바꾼다

## Implementation Steps

1. **현재 카피를 1차 감축**
   - `public-content.ts`에서 hero / workflow / fit / faq 문구를 절반 수준으로 줄인다.
   - 먼저 데이터 구조를 평탄화해서 렌더링이 긴 문단을 전제로 하지 않게 만든다.

2. **섹션 구조를 3-블록으로 재편**
   - `PublicLanding.tsx`에서
     - hero/login
     - 운영 요약(workflow + fit)
     - 가격/FAQ
     - footer CTA
     구조로 재배치한다.

3. **로그인/문의 패널을 compact화**
   - 제목/보조문구/hint를 줄이고, 폼 자체는 그대로 유지한다.
   - 문의 토글과 로그인 submit 동선은 건드리지 않는다.

4. **시각 밀도 조정**
   - `styles.css`에서 proof, fit, faq의 카드성 강도를 줄인다.
   - 섹션 간 여백과 제목 크기를 다듬어 “섹션은 많아 보이는데 정보는 적은” 느낌을 없앤다.

5. **FAQ를 하단 보조정보로 축소**
   - FAQ를 메인 섹션처럼 보이지 않게 하고, 가격 아래에서 빠르게 확인하는 수준으로 정리한다.

## Risks and Mitigations

- **위험:** 텍스트를 너무 줄여 제품 맥락이 약해질 수 있음
  - **대응:** hero 보조문 1개 + 운영 요약 블록 1개는 반드시 유지

- **위험:** 구조를 크게 바꾸다 로그인/문의 동선이 묻힐 수 있음
  - **대응:** 상단 로그인 버튼 + hero 근처 로그인 패널은 유지

- **위험:** 섹션을 합치며 오히려 복잡한 nested layout이 생길 수 있음
  - **대응:** “큰 블록 3개” 원칙을 먼저 확정하고, 내부는 카드가 아니라 list/row 우선으로 푼다

## Verification Steps

1. 첫 화면에서 보이는 텍스트가 **현재 대비 체감상 크게 줄었는지** 확인
2. hero에서 5초 안에
   - 누구용인지
   - 무엇을 자동화하는지
   - 로그인/문의가 어디 있는지
   가 파악되는지 확인
3. 가격 계산기 입력/플랜 전환이 그대로 동작하는지 확인
4. 로그인/도입 문의 토글이 그대로 유지되는지 확인
5. 모바일에서 block 수가 많아 보이지 않고 자연스럽게 1열로 흐르는지 확인

## Deliverable

다음 구현 세션에서는 아래 순서로 진행하는 것이 적합하다.

1. `public-content.ts` 카피/데이터 평탄화
2. `PublicLanding.tsx` 구조를 3-블록으로 재편
3. `styles.css`에서 카드 강도/텍스트 밀도 조정
4. `npm run check` + 브라우저 동선 확인
