# 도입 준비 상단 중복 제거 + TeamViewer형 좌측 셸 디테일 + 폰트 패스 계획

## Requirements Summary

- onboarding 화면 상단의 중복 CTA(`도입 준비`, `메일 연결 열기`, `설정` 등)를 제거한다.
- TeamViewer 스크린샷처럼 좌측 레일에 **열기/닫기 가능한 토글 버튼**을 추가한다.
- 메인 흰색 캔버스 좌측 상·하단에 TeamViewer류의 **둥근 모서리/컷아웃 디테일**을 추가한다.
- 현재 폰트(`web/src/styles.css:36`)는 TeamViewer 느낌과 거리가 있으므로, **제공된 TeamViewer DOM에서 확인된 `DM Sans` 단서를 기준으로 동일 또는 최대한 근접한 스택**으로 바꾼다.
- onboarding gating, 기존 기능 흐름, backend/API/DB는 건드리지 않는다.

## Current Touchpoints

1. **상단 중복 CTA**
   - `web/src/App.tsx:7561` `screenActionBar.onboarding`
   - `web/src/App.tsx:7754` onboarding action bar
   - `web/src/App.tsx:7806` onboarding hero CTA
2. **좌측 TeamViewer형 shell**
   - `web/src/App.tsx:7416` nav item 구성
   - `web/src/App.tsx:7685` sidebar 마크업
   - `web/src/styles.css:6441` 이후 shell 스타일
3. **도입 준비 내부 구조**
   - `web/src/features/onboarding/OnboardingTab.tsx:35`
   - `web/src/features/onboarding/OnboardingTab.tsx:85`
   - `web/src/features/onboarding/OnboardingTab.tsx:124`
   - `web/src/features/initial-registration/InitialRegistrationTab.tsx:74`
   - `web/src/features/initial-registration/InitialRegistrationTab.tsx:217`
4. **폰트 적용점**
   - `web/src/styles.css:36`

## TeamViewer Reference Findings (provided DOM / inline style)

제공된 TeamViewer DOM 기준으로 이번 패스에 반영할 핵심 단서:

1. **레일 배경색**
   - `rgb(22, 40, 145)` 계열의 강한 딥블루
2. **레일 기본 폭**
   - `style="width: 251px;"`
3. **레일 토글 구조**
   - `hoverZone-202`
   - `thumb-204`
   - `aria-label="숨기기"`
   - 즉, 레일 바깥 경계에 둥근 thumb 버튼이 있고 hover 영역이 별도임
4. **메인 캔버스 구조**
   - 바깥은 딥블루 wrapper
   - 안쪽 main content는 white canvas
   - 레일과 캔버스 사이 경계가 또렷하고 모서리가 부드럽게 연결됨
5. **카드 반경**
   - 여러 widget card가 `border-radius: 16px`
6. **폰트 단서**
   - 제공 DOM 말미 `svgText`에 `font-family: "DM Sans", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif`
   - 이 값을 TeamViewer 유사 폰트 후보의 1순위 근거로 삼는다
7. **nav composition**
   - 상단 브랜드/logo block
   - 중간 primary app nav
   - 하단 secondary/support nav
   - collapse 시에도 아이콘 중심으로 유지되는 구조

## Acceptance Criteria

- onboarding 화면 상단 action bar에는 중복 CTA가 없다.
- onboarding 첫 화면의 주 CTA는 hero 내부 한 곳에만 보인다.
- 좌측 레일에 hover/고정 사용이 가능한 열기/닫기 토글이 생긴다.
- 레일 축소/확장 시 nav 사용성과 active state가 유지된다.
- 메인 흰색 캔버스 왼쪽 상단/하단에 TeamViewer 느낌의 둥근 corner detail이 생긴다.
- 폰트는 실제 TeamViewer와 동일하거나, 동일 폰트 사용이 불가능할 경우 가장 가까운 합법/무의존 대체 스택으로 바뀐다.
- pre/post onboarding gating, hash 보정, nav 노출 규칙, smoke는 유지된다.
- 제공된 TeamViewer DOM에서 보인 레일 폭/블루톤/hover thumb/button 구조가 현재 shell에 반영된다.
- collapse 상태에서 라벨은 숨되, active 식별과 이동 가능성은 유지된다.

## Implementation Steps

1. **상단 onboarding action bar 최소화**
   - 파일: `web/src/App.tsx:7561`, `web/src/App.tsx:7754`, `web/src/App.tsx:7806`
   - 작업:
     - onboarding 전용 `screenActionBar` CTA 제거
     - onboarding action bar는 workspace/status 정도만 남기고 버튼 영역 비우기
     - hero CTA만 primary/secondary 진입점으로 유지

2. **TeamViewer DOM 기준 shell 토큰 추출 반영**
   - 파일: `web/src/styles.css:6441`, `web/src/App.tsx:7685`
   - 작업:
     - 레일 폭을 TeamViewer DOM 기준 `~251px` 근처로 재조정
     - 레일 블루를 `rgb(22, 40, 145)` 근처 토큰으로 정리
     - 상단 브랜드 / 중간 주 nav / 하단 보조 nav 위계 분리
     - 현재 AUTO-TAX nav 구조 안에서 TeamViewer형 밀도와 배치만 가져오고, 기능 IA는 유지

3. **좌측 레일 collapse UX 추가**
   - 파일: `web/src/App.tsx:7685`, `web/src/styles.css:6441`
   - 작업:
     - sidebar collapsed state 추가
     - `hover zone + thumb button` 구조 추가
     - 레일 바깥 경계에 TeamViewer식 round toggle button 추가
     - hover 시 thumb 노출 + 클릭 시 고정 collapse/expand 동작 구현
     - collapsed 상태에서 아이콘/툴팁/active 유지
     - onboarding/settings만 있는 pre-onboarding 상태에서도 동일하게 자연스럽게 동작

4. **메인 캔버스 좌측 곡면 디테일 적용**
   - 파일: `web/src/styles.css:6441`, `web/src/App.tsx:7685`
   - 작업:
     - content wrapper 또는 shell pseudo-element로 좌측 상·하단 rounded cutout 추가
     - TeamViewer처럼 파란 바탕 위에 흰 캔버스가 얹힌 느낌으로 정리
     - 레일과 흰색 캔버스 경계가 TeamViewer처럼 더 또렷하게 보이도록 조정

5. **폰트 패스**
   - 파일: `web/src/styles.css:36`
   - 작업:
     - 제공 DOM 근거로 `DM Sans`를 1순위 후보로 채택
     - 현재 앱 전체에 적용 가능한지 확인하고, body/button/chip/input 전반 스택을 재정의
     - exact family를 바로 쓸 수 없으면 새 dependency 없이 `DM Sans, Inter, Segoe UI, Noto Sans KR` 순 근접 스택으로 정리
     - self-hosted font 파일을 추가하는 선택지는 라이선스/번들 부담 확인 후 최후순위로 둠
     - heading/body/button/chip 전반 line-height 재조정

6. **간격/정렬 재튜닝**
   - 파일: `web/src/styles.css:6547`, `web/src/styles.css:6795`, `web/src/features/onboarding/OnboardingTab.tsx:85`, `web/src/features/initial-registration/InitialRegistrationTab.tsx:343`
   - 작업:
     - rail collapse 이후 action bar/content 시작점 재정렬
     - onboarding first fold CTA 우선성 유지
     - step row와 초기 등록 카드 높이 재검토
     - TeamViewer card radius 16px 계열과 현재 compact density 사이 균형 조정

7. **회귀 검증 갱신**
   - 파일: `scripts/e2e-smoke.mjs`
   - 작업:
     - onboarding 상단 중복 CTA 제거에 맞춰 selector/expectation 수정
     - collapse 토글 존재 및 기본 상태 검증 추가
     - collapse 전/후 onboarding nav 접근 검증 추가
     - gating smoke는 그대로 유지

## Risks and Mitigations

- **폰트 정확도 불명확**
  - 대응: 이번엔 제공 DOM의 `DM Sans`를 직접 근거로 사용하되, 전체 body font인지 추가 확인하고 라이선스/배포 제약 시 근접 스택으로 제한
- **collapse 추가로 nav 접근성 저하**
  - 대응: active state, keyboard focus, collapsed tooltip/label fallback 유지
- **좌측 cutout 디테일이 레이아웃을 깨뜨릴 위험**
  - 대응: pseudo-element 기반으로만 구현하고 DOM 구조 변경은 최소화
- **onboarding CTA 제거 중 행동 경로가 약해질 위험**
  - 대응: hero CTA 2개만 남기고, 상단에는 클릭 유도 요소를 추가하지 않음
- **TeamViewer를 과하게 베껴 AUTO-TAX 구조가 깨질 위험**
  - 대응: IA/기능은 유지하고 shell token/interaction/density만 제한적으로 흡수

## Verification Steps

1. `npm run check`
2. `npm run test:server`
3. `npm run build:web`
4. `npm run test:e2e:smoke`
5. 수동 확인
   - pre-onboarding first fold에서 CTA가 hero 한 곳에만 있는지
   - sidebar toggle hover/클릭 동작이 자연스러운지
   - collapsed 상태에서도 onboarding/settings 이동이 쉬운지
   - TeamViewer 레퍼런스 대비 좌측 모서리 디테일과 폰트 인상이 개선됐는지
   - 레일 폭/블루톤/hover thumb/button이 제공된 TeamViewer DOM 인상과 충분히 비슷한지
