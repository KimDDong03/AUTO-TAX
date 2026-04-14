# AUTO-TAX TeamViewer fidelity pass plan

## Requirements Summary

- 목표는 현재 적용된 새 IA(`home / customers / settings / ops`)를 유지하면서, 시각 언어와 운영 감각을 **TeamViewer desktop app에 훨씬 더 가깝게** 끌어당기는 것이다.
- 특히 아래를 반영한다:
  - 좌측 레일에서 `AUTO-TAX`를 TeamViewer처럼 **가로 워드마크 중심**으로 보이게 조정
  - 고객 관리 화면을 **표/리스트 중심의 더 평평하고 정돈된 관리 화면**으로 재구성
  - 전체 폰트를 더 중립적이고 덜 “AI generated”처럼 느껴지게 정리
  - 기능은 유지하고, UI/UX 구조/비주얼만 TeamViewer 스타일에 더 강하게 맞춘다
- 범위 밖:
  - 백엔드/API/DB 변경 없음
  - 새 기능 추가 없음
  - 새 의존성 추가 없음

## Current baseline in code

- top-level IA와 shell 뼈대는 이미 새 구조로 전환되어 있음 `web/src/App.tsx:48`, `web/src/App.tsx:6420`, `web/src/App.tsx:7527`, `web/src/App.tsx:7687`
- 홈은 command-center형 4영역으로 통합됨 `web/src/App.tsx:7745`, `web/src/App.tsx:7788`, `web/src/App.tsx:7871`, `web/src/App.tsx:7892`
- 설정 안에 인증서 영역을 합쳐 둔 상태임 `web/src/App.tsx:8056`, `web/src/App.tsx:8111`, `web/src/features/settings/SettingsTab.tsx:414`, `web/src/features/certificates/CertificatesTab.tsx:796`
- TeamViewer-like override는 이미 별도 CSS override로 얹혀 있음 `web/src/styles.css:5818`, `web/src/styles.css:5852`, `web/src/styles.css:5971`, `web/src/styles.css:6097`
- 고객 화면은 아직 카드형 정보량이 많아 TeamViewer device-list 같은 평평한 관리 감각과 거리가 있음 `web/src/features/customers/CustomersTab.tsx:493`, `web/src/features/customers/CustomersTab.tsx:578`, `web/src/features/customers/CustomersTab.tsx:653`
- onboarding compact shell은 들어갔지만 아직 TeamViewer의 “dense operator panel”보다는 블록이 큼 `web/src/features/onboarding/OnboardingTab.tsx:30`, `web/src/features/onboarding/OnboardingTab.tsx:75`, `web/src/features/onboarding/OnboardingTab.tsx:131`
- 공용 surface primitives는 확장 가능한 상태임 `web/src/components/ui.tsx:55`, `web/src/components/ui.tsx:67`, `web/src/components/ui.tsx:100`, `web/src/components/ui.tsx:150`

## Acceptance Criteria

1. 좌측 레일 상단 브랜드가 현재 badge+설명형보다 TeamViewer처럼 **가로 워드마크형**으로 읽힌다.
2. 고객 화면 첫 인상이 “카드 모음”보다 **운영 리스트/장치 관리 화면**에 가깝다.
3. 폰트가 현재보다 더 중립적이고 단정해 보여, “AI틱” 인상이 줄어든다.
4. 홈/고객/설정/관리자 IA는 유지하되, 전체 시각 언어는 TeamViewer에 더 가까워진다.
5. 설명 텍스트는 더 줄고, 버튼/상태/행/필터 중심으로 판단 가능해야 한다.
6. 변경 후에도 기존 기능 흐름과 e2e smoke 경로는 유지된다.

## Implementation Steps

### 1. Typography + brand language pass

목표: 제품 전체 인상을 먼저 TeamViewer 쪽으로 당긴다.

작업:
- 글로벌 font stack을 더 중립적인 시스템/UI 계열 우선순위로 재정렬
- heading / chip / button / table header weight를 재조정해 “운영툴” 톤 강화
- 좌측 브랜드 영역을 badge 중심에서 **가로 AUTO-TAX 워드마크** 중심으로 재설계
- 브랜드 아래 보조 카피는 제거하거나 극도로 축약

주요 파일:
- `web/src/styles.css:5818`
- `web/src/styles.css:5869`
- `web/src/App.tsx:7614`

### 2. Shell fidelity pass

목표: 현재 dark rail + compact bar를 TeamViewer에 더 가깝게 정리한다.

작업:
- 좌측 rail 폭, nav 간격, active fill, icon/text 정렬을 TeamViewer 밀도로 조정
- top action bar를 더 납작하고 단정하게 축소
- chip/pill을 줄이고, 검색/빠른 액션/우측 유틸리티 배치를 TeamViewer식으로 재정렬
- 배경 대비를 더 평평하게 만들고, shadow 의존도를 낮춘다

주요 파일:
- `web/src/App.tsx:6420`
- `web/src/App.tsx:7527`
- `web/src/App.tsx:7687`
- `web/src/styles.css:5852`
- `web/src/styles.css:5971`

### 3. Customer screen → TeamViewer-style management surface

목표: 사용자가 요청한 핵심. 고객 화면을 “장치 관리”처럼 깔끔한 운영 화면으로 바꾼다.

작업:
- 상단 focus cards 비중을 줄이고, 필터 + 검색 + 상태요약 + 메인 리스트 구조로 재배치
- 고객 목록을 더 평평한 row/table/list 형태로 재구성
- 각 row에서 먼저 보일 정보는:
  - 고객명/상호
  - 상태 chip
  - 막힌 이유 1줄
  - 다음 행동 1개
- 상세 패널은 유지하되, 상단 설명 블록을 줄이고 action bar + 상태 summary로 축약
- 최근 본 고객/guide/helper 박스는 2차 영역으로 약화 또는 접기

주요 파일:
- `web/src/features/customers/CustomersTab.tsx:493`
- `web/src/features/customers/CustomersTab.tsx:578`
- `web/src/features/customers/CustomersTab.tsx:653`
- 관련 스타일 섹션 `web/src/styles.css:2966`, `web/src/styles.css:6359`

### 4. Home compactness pass

목표: 홈도 현재 panel-heavy 인상을 줄이고 TeamViewer처럼 더 비어 있고 빨리 읽히게 만든다.

작업:
- “오늘 할 일 / 막힌 일 / 준비 안 된 일 / 최근 처리 결과” 4영역의 패널 높이와 설명량 축소
- onboarding compact shell을 더 dense한 checklist/list 느낌으로 줄임
- table/row density를 높이고 빈 여백을 재정리
- 최근 결과는 card보다 flat activity list에 더 가깝게 조정

주요 파일:
- `web/src/App.tsx:7745`
- `web/src/App.tsx:7788`
- `web/src/App.tsx:7871`
- `web/src/App.tsx:7892`
- `web/src/features/onboarding/OnboardingTab.tsx:75`
- `web/src/styles.css:6097`
- `web/src/styles.css:6152`

### 5. Settings / certificates visual merge pass

목표: 설정도 form-heavy 화면이 아니라 TeamViewer식 관리 섹션처럼 정리한다.

작업:
- 좌측 readiness nav를 더 간결한 section list로 재조정
- helper/certificate 영역은 settings 안에서 별도 “관리 화면”처럼 보여도 shell 언어는 통일
- 카드형 설명을 줄이고, 상태/행동/마지막 확인 값 위주로 재구성
- certificates panel은 settings 내부에서도 별도 화면처럼 과하게 튀지 않도록 시각 계층 재정렬

주요 파일:
- `web/src/features/settings/SettingsTab.tsx:62`
- `web/src/features/settings/SettingsTab.tsx:79`
- `web/src/features/settings/SettingsTab.tsx:414`
- `web/src/features/certificates/CertificatesTab.tsx:796`
- `web/src/styles.css:6304`

### 6. Shared primitive cleanup

목표: 전체 화면이 같은 제품처럼 보이게 공용 부품을 더 TeamViewer스럽게 만든다.

작업:
- `Panel` 헤더 높이/패딩 축소
- `StatCard`를 더 평평하고 작은 status tile로 조정
- `SetupPanel` step chrome 단순화
- dialog/button/input/table 헤더 radius와 border contrast를 정리

주요 파일:
- `web/src/components/ui.tsx:55`
- `web/src/components/ui.tsx:67`
- `web/src/components/ui.tsx:100`
- `web/src/components/ui.tsx:150`
- `web/src/styles.css:6060`

### 7. Copy deletion pass 2

목표: TeamViewer처럼 “설명보다 구조”가 먼저 읽히게 한다.

작업:
- 고객/설정/홈에서 남아 있는 guide/help 문장을 추가 삭제
- subtitle은 유지하더라도 한 줄 초과 금지 원칙 적용
- action button wording을 더 짧게 정리
- glossary/보조문구/상세 설명은 details 또는 하위 패널로만 이동

주요 파일:
- `web/src/App.tsx:7527`
- `web/src/features/customers/CustomersTab.tsx:578`
- `web/src/features/settings/SettingsTab.tsx:79`
- `web/src/features/certificates/CertificatesTab.tsx:796`
- `web/src/features/onboarding/OnboardingTab.tsx:131`

## Risks and Mitigations

### Risk 1 — TeamViewer를 너무 따라가다 AUTO-TAX 정보구조가 흐려질 수 있음
- 대응: IA는 현재 확정된 `home / customers / settings / ops`를 유지하고, visual grammar만 더 강하게 반영

### Risk 2 — 고객 화면을 너무 평평하게 만들면 상세 action discoverability가 떨어질 수 있음
- 대응: list row는 얇게, 우측 상세 패널은 action-first 구조로 유지

### Risk 3 — 폰트 변경이 레이아웃 깨짐으로 이어질 수 있음
- 대응: line-height, button height, table row height를 함께 조정하고 smoke 경로 확인

### Risk 4 — override CSS가 더 커져 유지보수성이 나빠질 수 있음
- 대응: 이번 pass에서는 visual fidelity 우선, 이후 stable되면 styles.css 재정리 단계 분리

## Verification Steps

1. 고객 화면 before/after 스캔 테스트
   - 3초 안에 “누가 막혔는지 / 다음 행동이 무엇인지” 보여야 함
2. 레일/브랜드 확인
   - 좌측 상단이 TeamViewer처럼 가로 워드마크 인상인지 확인
3. 폰트 확인
   - heading, nav, table, input이 현재보다 덜 AI틱하고 더 중립적인지 수동 확인
4. 홈 화면 확인
   - 통계판보다 operator workbench 느낌인지 확인
5. 기술 검증
   - `npm run check`
   - `npm run test:server`
   - `npm run test:e2e:smoke`
6. 가능하면 수동 시각 점검
   - 홈 / 고객 / 설정 / 관리자 4화면 데스크톱 기준 비교

## Recommended Execution Order

1. Typography + brand
2. Shell fidelity
3. Customer screen redesign
4. Home compactness
5. Settings / certificates merge polish
6. Shared primitive cleanup
7. Copy deletion pass
8. Verification
