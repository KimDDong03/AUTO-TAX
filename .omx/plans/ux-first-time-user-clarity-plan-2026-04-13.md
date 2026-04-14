# AUTO-TAX First-Time User UI/UX Clarity Plan

## Requirements Summary
- 목표: 프로젝트를 처음 접한 사람도 1분 안에 `무슨 제품인지 / 지금 뭘 해야 하는지 / 어디서 처리하는지`를 이해할 수 있게 만든다.
- 범위: 프런트 UI/UX 정보 구조, 용어, 빈 상태, 안내 문구, CTA 흐름 중심. 백엔드 동작/스키마 재설계는 범위 밖.
- 유지 조건: 최근 확정한 onboarding 정책(메일 연결 vs 동기화 분리, 헬퍼 선행, 초기 등록 엑셀 정책, 예외 메일 후행 처리)은 되돌리지 않는다.
- 현재 근거:
  - 앱 셸과 cross-tab 흐름은 `web/src/App.tsx:6248-6302`, `web/src/App.tsx:7337-7383`, `web/src/App.tsx:7543-7550`에 집중되어 있다.
  - onboarding step shell은 `web/src/features/onboarding/OnboardingTab.tsx:5-162`가 담당한다.
  - 초기 등록/예외 처리 문구는 `web/src/features/initial-registration/InitialRegistrationTab.tsx:24-374`와 `web/src/features/initial-registration/customer-onboarding-workbook.ts:167-171`에 모여 있다.
  - 작업공간 설정의 상세 문구는 `web/src/features/settings/SettingsTab.tsx:120-374`에 있다.
  - 고객 운영과 인증서 관리의 현재 진입 구조는 `web/src/features/customers/CustomersTab.tsx:158-160`, `web/src/features/customers/CustomersTab.tsx:265-707`, `web/src/features/certificates/CertificatesTab.tsx:577-960`에 있다.

## Acceptance Criteria
1. 첫 사용자 기준으로 홈/도입 준비 진입 후 60초 안에 아래 5가지를 답할 수 있다.
   - 이 제품이 무엇을 자동화하는지
   - 첫 성공까지 남은 단계가 무엇인지
   - 메일 연결과 실제 동기화가 다른 단계인지
   - 미매칭 메일을 어디서 처리하는지
   - 지금 눌러야 할 1차 CTA가 무엇인지
2. 각 메인 탭(`오늘 작업`, `도입 준비`, `고객 운영`, `인증서 관리`, `작업공간 설정`) 상단에는 다음이 모두 있다.
   - 탭 목적 1문장
   - 지금 해야 할 대표 액션 1개
   - 상태 요약 3~4개 이하
3. 내부 용어/업계 용어는 첫 노출 시 반드시 풀이가 붙는다.
   - 예: 팝빌 접두어, 로컬 헬퍼, 전자세금용, 범용, 미매칭 메일, 예외 처리
4. 오늘 작업의 모든 긴급 카드/CTA는 실제 처리 화면의 올바른 문맥으로 이동한다.
5. 문서/테스트 텍스트가 실제 UI 라벨과 어긋나지 않는다.

## Implementation Steps

### 1. Product-level newcomer language system 정리
- 목적: 화면별로 다른 어투/용어를 먼저 통일한다.
- 작업:
  - `docs/PRODUCT_RESHAPE_PLAN.md:78-94`를 기준으로 newcomer-friendly 카피 원칙을 별도 섹션으로 보강한다.
  - 필요하면 `README.md` 상단에 3줄짜리 제품 설명(입력 → 자동화 → 사람 검수)을 추가한다.
- 산출물:
  - 용어 규칙 초안
  - 탭별 목적 문장 초안

### 2. 앱 셸과 상위 IA를 `초보자용 지도`로 재구성
- 목적: 처음 들어온 사람이 탭 이름만 봐도 역할을 안다.
- 작업 위치:
  - `web/src/App.tsx:6248-6302` (긴급 카드/CTA)
  - `web/src/App.tsx:7337-7383` (오늘 작업 상단 상태 구조)
  - `web/src/App.tsx:7543-7550` (도입 준비 탭 진입)
- 작업 내용:
  - hero/긴급 카드/탭 라벨 옆에 짧은 목적 설명 또는 subcopy를 붙인다.
  - `오늘 작업`은 `지금 처리`, `도입 준비`는 `첫 성공까지`, `고객 운영`은 `고객별 상태`, `인증서 관리`는 `발행 막힘 해소`로 역할을 명확히 분리한다.
  - 긴급 카드 CTA는 반드시 해당 세부 단계로 deep-link한다.

### 3. 도입 준비를 `처음 보는 사람용 안내서`로 강화
- 목적: onboarding 자체를 제품 설명서처럼 만든다.
- 작업 위치:
  - `web/src/features/onboarding/OnboardingTab.tsx:5-162`
  - `web/src/App.tsx:6566-7204`
  - `web/src/features/initial-registration/InitialRegistrationTab.tsx:24-374`
  - `web/src/features/settings/SettingsTab.tsx:120-374`
  - `web/src/features/initial-registration/customer-onboarding-workbook.ts:167-171`
- 작업 내용:
  - 각 단계 카드에 `왜 필요한지 / 지금 하는 일 / 끝나면 다음에 뭐 하는지`를 1~2문장으로 고정 포맷화한다.
  - 단계 상단에 `처음이면 이 순서대로만 하면 됩니다` 형태의 초보자 안내 문구를 추가한다.
  - `메일 연결`, `첫 메일 동기화`, `미매칭 메일 예외 처리`를 시각적으로 더 강하게 분리한다.
  - 로컬 헬퍼/엑셀 양식/인증서 연결 문구를 작업 순서 기준으로 통일한다.

### 4. 오늘 작업을 `운영자 대시보드`가 아니라 `해야 할 일 목록`으로 다시 다듬기
- 목적: 첫 사용자도 상태판이 아니라 액션판으로 읽게 만든다.
- 작업 위치:
  - `web/src/App.tsx:7337-7530`
- 작업 내용:
  - 상단을 `지금 멈춰 있는 것`, `오늘 확인할 것`, `최근 들어온 것` 3블록으로 재구성한다.
  - `발행 대상`, `미매칭 메일`, `인증서 주의`는 숫자만 보여주지 말고 바로 해결 버튼을 붙인다.
  - 빈 상태에서는 “지금 문제가 없는 상태”와 “아직 데이터가 없어서 비어 있는 상태”를 구분한다.

### 5. 고객 운영 화면을 `상태 설명 + 해결 액션` 중심으로 강화
- 목적: 초보자도 고객 상세를 열자마자 `왜 안 되는지`를 읽게 만든다.
- 작업 위치:
  - `web/src/features/customers/CustomersTab.tsx:158-160`
  - `web/src/features/customers/CustomersTab.tsx:265-707`
- 작업 내용:
  - 고객 리스트 필터명을 더 평이한 언어로 다듬고, 각 필터에 설명 한 줄을 붙인다.
  - 고객 상세 상단의 readiness 정보를 `발행 가능 / 아직 준비 필요 / 왜 막혔는지 / 바로 해결` 구조로 고정한다.
  - 새 고객 등록 폼은 `필수 4개`와 `나중에 입력해도 되는 값`을 분리한다.

### 6. 인증서 관리 화면을 `인증서 목록`보다 `막힘 해결 화면`으로 강화
- 목적: 인증서 지식이 적은 사용자도 여기서 무엇을 해야 할지 안다.
- 작업 위치:
  - `web/src/features/certificates/CertificatesTab.tsx:577-960`
- 작업 내용:
  - 상단 제목/서브타이틀/칩을 `누가 왜 막혔는지` 중심 문장으로 바꾼다.
  - `전자세금용`, `범용`, `미연결`의 차이를 설명하는 짧은 도움말을 상단에 둔다.
  - 기본 보기에서 `조치 필요 고객`만 먼저 노출하고, 미연결 공동인증서 raw 리스트는 접은 상태를 유지한다.

### 7. Empty / Help / Glossary-lite pass
- 목적: 새 사용자가 막히는 건 대부분 빈 화면과 용어다.
- 작업:
  - 각 탭의 empty state를 `왜 비어 있는지 + 다음 CTA` 형식으로 통일한다.
  - 별도 glossary 문서를 지금 만들지 않더라도, 각 핵심 용어 첫 노출마다 inline help를 붙인다.
  - 후속으로 glossary가 필요하면 `docs/` 하위 독립 문서로 분리할 수 있게 용어 원문을 모아둔다.

### 8. Verification / UX proof 단계
- 코드 검증:
  - `npm run check`
  - `npm run test:server`
  - 가능하면 `npm run test:e2e:smoke`
- 수동 UX 검증:
  - 신규 사용자 시나리오: 로그인 직후 → 도입 준비 → 첫 동기화 전까지
  - 운영자 시나리오: 오늘 작업 → 미매칭 메일 → 고객 상세 → 인증서 관리
  - 빈 데이터 시나리오와 일부 데이터만 있는 시나리오 각각 확인

## Risks and Mitigations
- 리스크: 문구만 늘어나고 실제 이해도는 개선되지 않을 수 있음.
  - 대응: 모든 상단 카피를 1문장 + CTA 1개 원칙으로 제한.
- 리스크: 탭별 목적이 다시 겹칠 수 있음.
  - 대응: 각 탭의 대표 질문을 먼저 정의하고, 그 질문에 답하지 않는 요소는 하위로 내린다.
- 리스크: 기존 운영자에게 너무 초보자용처럼 느껴질 수 있음.
  - 대응: 기본 진입은 친절하게 만들되, 세부/고급 옵션은 `details`나 보조 패널로 유지.
- 리스크: deep-link/CTA가 실제 문맥으로 안 가면 오히려 혼란이 커짐.
  - 대응: 모든 긴급 카드/버튼에 대해 목적지 단계까지 검증한다.

## Verification Steps
1. newcomer readability checklist 작성 후 실제 화면으로 체크
2. 도입 준비 8단계에서 각 단계별 `현재 하는 일` 문장이 존재하는지 확인
3. 오늘 작업의 긴급 카드가 올바른 탭/단계로 이동하는지 확인
4. 고객 운영/인증서 관리에서 상단 10초 스캔만으로 `왜 막혔는지` 읽히는지 확인
5. `npm run check`, `npm run test:server`, 가능하면 `npm run test:e2e:smoke`

## Suggested Delivery Shape
- Phase 1: 앱 셸 + 도입 준비 + 오늘 작업 newcomer copy/CTA 정리
- Phase 2: 고객 운영 + 인증서 관리 상태 설명 강화
- Phase 3: empty/help/glossary-lite pass + smoke verification
