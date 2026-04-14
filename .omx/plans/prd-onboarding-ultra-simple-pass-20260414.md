# 도입 준비 초단순화 패스 계획

## Requirements Summary

- 목표는 **도입 준비 첫 화면을 완전 초심자 기준으로 다시 단순화**하는 것이다.
- 지금 구조는 이미 onboarding-gated shell은 맞지만, 첫 화면에 요약 블록과 상태 문구가 너무 많이 겹친다.
- 사용자는 “읽고 이해”보다 **지금 눌러야 할 버튼 1개**를 먼저 봐야 한다.
- 텍스트는 지금보다 훨씬 줄이고, 상태는 숫자/칩/행 구조로만 읽히게 만든다.

## Current Overload Points

1. 상단 action bar + onboarding hero + compact summary + active-step meta가 모두 상태를 반복한다.  
   - `web/src/App.tsx:7566-7600`
   - `web/src/App.tsx:7813-7859`
   - `web/src/features/onboarding/OnboardingTab.tsx:75-166`
2. onboarding 본문이 “전체 단계 + 현재 단계 상세 + 세부 메타”를 한 화면에 같이 보여 줘 첫 인상이 무겁다.  
   - `web/src/features/onboarding/OnboardingTab.tsx:98-166`
3. 초기 등록 단계도 headline/description/stage list/status box가 겹쳐 텍스트 밀도가 높다.  
   - `web/src/features/initial-registration/InitialRegistrationTab.tsx:309-369`
4. 스타일도 hero/focus/meta/summary 타일이 모두 살아 있어 시각적으로 “설정 도구”보다 “설명 화면”처럼 느껴진다.  
   - `web/src/styles.css:6829-6934`

## Design Principles

1. 첫 화면 첫 줄에는 **현재 할 일 1개**만 보인다.
2. 상태 요약은 **최대 3개**까지만 남긴다.
3. “왜” 설명은 기본 숨김, 막혔을 때만 짧게 노출한다.
4. 전체 단계는 보여도 되지만 **행 제목 수준**으로만 보여 주고 기본은 접힌다.
5. 초기 등록/헬퍼/설정 연결도 각 화면의 **주 버튼 1개 + 짧은 상태 1줄**로 통일한다.

## Target UX

### 첫 화면
- 제목: `도입 준비`
- 본문 핵심:
  - `지금 할 일` 1줄
  - primary CTA 1개
  - secondary CTA 1개(`설정`)
  - progress chip 1개(`4단계 중 2단계 남음` 같은 형태)

### 단계 목록
- 4개 단계(`메일 / 발행 / 헬퍼 / 초기 등록`)를 한 줄 행으로만 표시
- 각 행은:
  - 단계명
  - 상태 chip(`완료 / 지금 / 대기`)
  - 선택 시에만 짧은 본문 노출

### 활성 단계
- 남길 것:
  - 단계명
  - 짧은 상태 1줄
  - 버튼 1개
- 제거/축소할 것:
  - `다음 버튼 / 다음 단계 / 막힌 이유` 3박스 메타
  - 중복 요약 타일
  - 장문 설명 문단

### 초기 등록
- 상단 문구를 더 줄이고,
- `지금 할 일`, `버튼`, `3단계 진행줄`만 남긴다.
- 파일명/반영 가능/검토 필요 박스는 파일 업로드 이후에만 보이게 줄인다.

## Acceptance Criteria

- onboarding 첫 화면에서 첫 fold 기준 텍스트 줄 수가 지금보다 명확히 줄어든다.
- 한 화면에서 동시에 읽어야 하는 상태 그룹이 `action bar 제외 최대 2개`를 넘지 않는다.
- 사용자는 화면 진입 후 3초 안에 “지금 눌러야 할 버튼”을 찾을 수 있는 구조가 된다.
- `도입 준비` 화면에 중복 상태 표현(상단 hero와 본문 summary가 같은 정보를 반복)이 제거된다.
- `InitialRegistrationTab`의 기본 노출 텍스트가 줄고, 업로드 전에는 불필요한 상태 박스가 숨겨진다.
- onboarding gating 자체(`pre/post nav`, hash 보정, home/customer 노출 조건)는 유지된다.

## Implementation Steps

1. **onboarding shell 정보 계층 축소**
   - `web/src/App.tsx:7566-7600`
   - `web/src/App.tsx:7813-7859`
   - 작업:
     - onboarding action bar chips를 4개 → 2~3개로 축소
     - hero 문구를 `현재 할 일` 중심 1~2문장으로 축소
     - hero 내부 focus card 4개를 1~2개 수준으로 줄이거나 progress row로 대체

2. **OnboardingTab 자체를 “요약판”에서 “단계 선택기”로 축소**
   - `web/src/features/onboarding/OnboardingTab.tsx:75-166`
   - 작업:
     - `onboarding-compact-summary` 제거 또는 1개 progress bar로 축소
     - `onboarding-active-step-meta` 제거
     - step chip 카피를 더 짧게 정리
     - active step summary를 1줄 상태로 축소

3. **초기 등록 화면 텍스트 예산 재설계**
   - `web/src/features/initial-registration/InitialRegistrationTab.tsx:309-369`
   - 작업:
     - headline/description를 각각 더 짧게 축약
     - blocked warning은 필요할 때만 1줄
     - stage item description은 문장형 → 짧은 상태형으로 축소
     - 파일/반영/검토 3칸 status는 업로드 이후에만 노출

4. **스타일을 “설명 카드”에서 “플랫한 작업 흐름”으로 정리**
   - `web/src/styles.css:6829-6934`
   - 작업:
     - hero / summary / meta 박스 수를 줄인 구조에 맞춰 CSS 정리
     - step list를 더 얇고 평평한 row 형태로 정리
     - spacing과 min-height를 줄여 first fold 밀도를 낮춤

5. **smoke / 수동 검증 포인트 갱신**
   - `scripts/e2e-smoke.mjs`
   - 작업:
     - onboarding gating smoke는 유지
     - 필요하면 onboarding 첫 화면 존재 selector만 새 구조에 맞게 조정

## Risks and Mitigations

- **위험:** 텍스트를 너무 줄여 단계 의미가 사라질 수 있음  
  **대응:** 기본은 짧게, 막힌 상태에서만 1줄 warning 또는 `details`로 보충

- **위험:** App hero와 OnboardingTab를 동시에 줄이다가 CTA 위치가 흔들릴 수 있음  
  **대응:** primary CTA 책임은 App hero 또는 active step 중 한 곳으로만 고정

- **위험:** 초기 등록 화면의 상태 박스를 숨기면 진행감이 약해질 수 있음  
  **대응:** 업로드 전에는 숨기고, 업로드 이후에만 상태 박스를 노출

## Verification Steps

1. pre-onboarding 로그인 시 첫 화면이 더 짧고 단순하게 보이는지 수동 확인
2. 첫 화면에서 primary CTA가 스크롤 없이 바로 보이는지 확인
3. 단계 전환 시 현재 단계/다음 행동이 여전히 명확한지 확인
4. `npm run check`
5. `npm run build:web`
6. `npm run test:e2e:smoke`
