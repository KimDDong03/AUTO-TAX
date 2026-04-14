# 망가진 TeamViewer형 셸 상태 복구 계획 (2026-04-14)

## Requirements Summary

첨부 스크린샷 기준으로 현재 셸은 TeamViewer fidelity를 올리려던 의도와 다르게 몇 군데가 실제로 깨져 보인다.
이번 패스의 목표는 **기능 변경 없이 시각/상호작용 붕괴를 복구**하는 것이다.

고정 조건:
- onboarding gating, pre/post nav 규칙, hash 보정은 유지
- backend/API/DB 변경 없음
- 새 npm dependency 없음
- CTA는 다시 여러 군데로 늘리지 않되, **한 곳의 주 CTA는 확실히 보이게** 복구

## Screenshot-grounded problem list

### 1. 좌측 레일 레이아웃이 비정상적으로 비어 보임
- 스크린샷상 브랜드 아래에 큰 빈 파란 박스가 생겨 nav 밀도가 무너져 보인다.
- `도입 준비`, `설정`이 rail 전체에 비해 너무 아래쪽에 깔려 있고 TeamViewer의 상단-중단 위계가 약하다.
- 관련 파일:
  - `web/src/App.tsx:7699-7799`
  - `web/src/styles.css:7447-7779`

### 2. collapse thumb toggle이 기본 인상에서 거의 보이지 않음
- hover dependency가 강해서 스크린샷 기준으로는 토글 존재가 잘 읽히지 않는다.
- hover zone / thumb 구조는 들어갔지만 **발견 가능성**이 부족하다.
- 관련 파일:
  - `web/src/App.tsx:7786-7798`
  - `web/src/styles.css:7677-7719`

### 3. 흰색 메인 캔버스 corner detail이 어색함
- 현재는 좌측 하단 노치만 과하게 보이고, 상단/하단 곡면이 TeamViewer처럼 자연스럽게 이어지지 않는다.
- canvas와 rail 경계가 “의도된 곡면”보다 “레이아웃이 찢어진 것 같은” 인상을 준다.
- 관련 파일:
  - `web/src/styles.css:7789-7810`

### 4. onboarding first fold가 너무 비어 있고 힘이 빠짐
- hero에 CTA를 제거한 뒤 상단 카드가 정보량 대비 너무 크고 비어 보인다.
- 현재는 “중복 CTA 제거”는 되었지만, 대신 상단 영역이 목적 없이 남아 있다.
- 관련 파일:
  - `web/src/App.tsx:7816-7841`
  - `web/src/features/onboarding/OnboardingTab.tsx:83-137`
  - `web/src/features/initial-registration/InitialRegistrationTab.tsx:321-383`

### 5. 전체 폰트/칩/입력 밀도가 너무 작고 옅음
- DM Sans 우선 스택은 들어갔지만 실제 화면 인상은 아직 TeamViewer처럼 또렷하지 않다.
- nav, chip, heading, input의 weight/size/line-height가 얇아 first glance 가독성이 떨어진다.
- 관련 파일:
  - `web/src/styles.css:7405-7426`
  - `web/src/styles.css:7555-7612`
  - `web/src/styles.css:7825+`

## Acceptance Criteria

1. 좌측 rail에 브랜드 아래 큰 빈 박스처럼 보이는 레이아웃 붕괴가 사라진다.
2. 주 nav와 보조 nav가 TeamViewer처럼 위계 있게 정렬된다.
3. thumb toggle이 hover 없이도 존재를 인지할 수 있고, hover/click 사용성은 유지된다.
4. 흰색 canvas의 좌측 상단/하단 곡면이 대칭적이고 자연스럽게 보인다.
5. onboarding first fold는 비어 보이지 않으며, CTA는 한 곳에서만 명확하게 보인다.
6. step strip / active step / initial registration 카드가 현재보다 더 촘촘하고 읽기 쉽게 정리된다.
7. pre-onboarding / post-onboarding gating, nav 노출 규칙, hash 보정은 그대로 유지된다.
8. `npm run check`, `npm run test:server`, `npm run build:web`, `npm run test:e2e:smoke`가 모두 통과한다.

## Implementation Steps

### 1. rail 구조를 다시 단순화한다
- 파일:
  - `web/src/App.tsx:7699-7799`
  - `web/src/styles.css:7447-7676`
- 작업:
  - `sidebar-nav-stack`/group 구조에서 빈 공간을 만드는 레이아웃 원인을 제거
  - 브랜드 → 주 nav → 보조 nav → workspace/meta 카드 흐름을 명확하게 재배치
  - pre-onboarding처럼 nav 개수가 적을 때도 rail이 비정상적으로 비어 보이지 않게 min/max spacing 재조정

### 2. thumb toggle의 기본 노출과 hit area를 재설계한다
- 파일:
  - `web/src/App.tsx:7786-7798`
  - `web/src/styles.css:7677-7719`
- 작업:
  - hover-only에서 벗어나 기본 visible 또는 rail-edge hint 상태 추가
  - hover zone이 아닌 thumb 자체가 주된 affordance로 읽히게 조정
  - collapsed/expanded 양쪽에서 위치가 흔들리지 않게 center anchoring 재정리

### 3. canvas 곡면 디테일 구현 방식을 바꾼다
- 파일:
  - `web/src/styles.css:7789-7810`
- 작업:
  - 현재 pseudo-element 노치 방식이 어색하면 wrapper/inner-canvas 구조 또는 더 얕은 mask형 방식으로 교체
  - 좌측 상단/하단 곡면을 둘 다 분명히 보이되, 하단 노치만 튀지 않게 균형 조정
  - rail과 canvas 경계 shadow/radius를 함께 튜닝

### 4. onboarding first fold를 다시 compact focal layout으로 정리한다
- 파일:
  - `web/src/App.tsx:7816-7841`
  - `web/src/features/onboarding/OnboardingTab.tsx:83-137`
  - `web/src/features/initial-registration/InitialRegistrationTab.tsx:321-383`
- 작업:
  - 상단 hero 높이와 padding 축소
  - hero는 상태/진행 한 줄만 담당하고, 실제 CTA는 active step 또는 registration focal card에서 더 강하게 보이게 재배치
  - step strip과 active step 간 간격 축소
  - mail/defaults/helper/registration 단계 first fold에서 primary action이 바로 읽히도록 정렬 보정

### 5. typography / density를 TeamViewer 쪽으로 다시 조인다
- 파일:
  - `web/src/styles.css:7405-7426`
  - `web/src/styles.css:7555-7612`
  - `web/src/styles.css:7811+`
- 작업:
  - nav title, chips, panel headings, input text, helper copy의 font-size/weight/line-height 재조정
  - DM Sans 우선 인상은 유지하되 한국어 fallback 구간에서 너무 얇아 보이지 않게 weight 기준 재조정
  - chip/input/button의 높이와 radius를 현재보다 한 단계 또렷하게 맞춤

### 6. smoke + 수동 시각 점검 포인트를 강화한다
- 파일:
  - `scripts/e2e-smoke.mjs:568-590`
- 작업:
  - toggle 존재뿐 아니라 visible state를 더 명확히 검증할 수 있는 selector 보강 검토
  - onboarding first fold에서 CTA 존재 위치가 한 곳으로 유지되는지 점검
  - 필요 시 visual regression용 최소 screenshot 캡처 스크립트 또는 수동 체크리스트 문구 추가

## Risks and Mitigations

- **위험:** CTA를 다시 살리는 과정에서 중복 CTA가 재발할 수 있음  
  **대응:** hero/action bar에는 버튼을 두지 않고, active step focal area 한 곳만 primary CTA 소유

- **위험:** rail compact화 중 collapsed nav 접근성이 떨어질 수 있음  
  **대응:** active state, aria-label, tooltip/title, icon-only fallback 유지

- **위험:** corner detail을 다시 만지다가 캔버스/콘텐츠 폭이 흔들릴 수 있음  
  **대응:** 곡면 디테일은 shell wrapper 수준에서 처리하고 actual content width/padding은 분리 유지

- **위험:** screenshot 기준 미세 조정이 많아 smoke는 통과하지만 실제 인상이 어색할 수 있음  
  **대응:** 구현 후 반드시 pre-onboarding 수동 스냅샷 비교를 같이 수행

## Verification Steps

1. `npm run check`
2. `npm run test:server`
3. `npm run build:web`
4. `npm run test:e2e:smoke`
5. 수동 확인
   - pre-onboarding rail에 큰 빈 박스가 사라졌는지
   - thumb toggle이 기본 상태에서도 존재를 인지할 수 있는지
   - 곡면 디테일이 상단/하단 모두 자연스러운지
   - onboarding first fold가 비어 보이지 않는지
   - CTA가 한 곳에서만 강하게 보이는지
   - 폰트/칩/입력 밀도가 지금보다 또렷해졌는지