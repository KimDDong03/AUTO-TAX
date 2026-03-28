# AUTO-TAX Design System

AUTO-TAX의 UI는 `운영 도구`처럼 보여야 합니다. 화려한 SaaS 랜딩보다 `빠르게 읽히고, 실수하기 어렵고, 상태가 분명한 화면`이 우선입니다.

이 문서는 앞으로 추가되는 화면과 기능이 현재 제품과 같은 결로 나오도록 맞추는 기준 문서입니다.

## 1. 제품 인상

- 인상: 차분함, 신뢰감, 실무형, 정리된 관리도구
- 키워드: `운영`, `점검`, `검수`, `상태`, `이력`, `즉시 실행`
- 피해야 할 인상: 마케팅 랜딩 느낌, 지나친 장식, 카드 중첩, 과한 색상 사용

## 2. 핵심 원칙

1. 한 정보 블록은 한 표면으로 보이게 한다.
   중첩 카드, 카드 안 카드, 박스 안 박스를 기본적으로 피한다.
2. 상태는 텍스트보다 구조와 색으로 먼저 읽히게 한다.
   `chip`, `status`, `alert`를 우선 사용한다.
3. 실행 버튼은 눌렀을 때 즉시 반응해야 한다.
   버튼 텍스트 변경, 비활성화, 진행 문구 중 최소 하나는 바로 보여야 한다.
4. 브라우저 기본 UI를 쓰지 않는다.
   `window.alert`, `window.confirm` 대신 앱 내부 `AppDialog`를 사용한다.
5. 모바일에서도 같은 제품처럼 보여야 한다.
   데스크톱 구조를 억지로 축소하지 말고, 한 열 흐름으로 자연스럽게 재배치한다.

## 3. Foundation

기준 값은 [`web/src/styles.css`](./web/src/styles.css) 의 `:root` 토큰을 따른다.

### Color

- 배경: `--bg`, `--surface`, `--surface-soft`
- 텍스트: `--text`, `--text-subtle`, `--text-faint`
- 주요 행동: `--primary`, `--primary-strong`, `--primary-soft`
- 성공: `--success`, `--success-soft`
- 경고: `--warning`, `--warning-soft`
- 위험: `--danger`, `--danger-soft`
- 경계선: `--border`, `--border-strong`

규칙:

- 새 기능 추가 시 임의 hex 색상부터 만들지 말고 토큰을 먼저 사용한다.
- 새 상태 색이 필요하면 기존 `success / warning / danger / primary`로 해결 가능한지 먼저 본다.

### Typography

- 기본 글꼴: `Pretendard Variable`, `SUIT Variable`, `Noto Sans KR`, `Malgun Gothic`
- 제목: 두껍고 짧게
- 본문: 설명은 짧고 운영 언어로 작성
- 회색 텍스트는 설명용으로만 쓰고, 핵심 값은 항상 진하게

### Radius / Shadow

- 큰 카드: `--radius-lg`
- 일반 카드/그룹: `--radius-md`
- 버튼/작은 요소: `--radius-sm`
- 그림자: `--shadow-sm`, `--shadow-md`

규칙:

- radius를 제각각 늘리지 않는다.
- 강조는 색보다 그림자보다도 `구조`로 먼저 해결한다.

## 4. Layout Rules

### App Shell

- 좌측 사이드바 + 우측 작업 영역 구조 유지
- 상단 hero/header는 현재 제품처럼 요약 정보와 액션 중심
- 새 섹션은 기존 `work`, `customers`, `settings`, `ops` 패턴 안에서 푼다

### Panel

기본 단위는 `Panel` 또는 `SetupPanel`이다.

- 새 기능 블록은 가능하면 `Panel`로 시작한다
- 패널은 `한 기능 / 한 흐름 / 한 책임`만 담는다
- 패널 내부는 다시 카드 중첩하지 말고 `form-grid`, `info-grid`, `list`로 푼다

### Height

- 내용이 적은 패널은 내용 높이만 쓴다
- 비어 있다고 해서 카드가 세로로 길게 늘어나면 안 된다
- 예외: 내부 리스트/로그/테이블만 스크롤이 필요한 경우에만 내부 스크롤 사용

## 5. Component Rules

### Button

- 기본 버튼: primary action 1개
- 보조 버튼: `btn-secondary`
- 위험 버튼: `btn-danger` 조합

규칙:

- 한 영역에 primary 버튼은 보통 1개만 둔다
- 같은 줄에 primary가 2개 이상 나란히 나오지 않게 한다
- 비동기 작업은 클릭 직후 버튼 텍스트가 바뀌거나 비활성화되어야 한다

### Chip / Status

- 상태 표시는 텍스트만 쓰지 말고 `chip`, `status`를 사용한다
- 의미 매핑:
  - 성공/정상: `chip-success`
  - 경고/주의: `chip-warn`
  - 오류/삭제/위험: `chip-danger`
  - 중립/진행: 기본 chip 또는 pending 스타일

### Table

- 표는 `한 덩어리 표면`으로 보이게 유지한다
- 빈 상태는 표 밖 박스로 넣지 말고 표 내부 행처럼 처리한다
- 헤더와 본문, 빈 상태가 서로 다른 카드처럼 보이면 안 된다

### Empty State

- 문구는 짧게
- `무엇이 없는지`만 말하고, 길게 설명하지 않는다
- 예: `지금 발행할 건이 없습니다.`

### Dialog

공용 `AppDialog`를 사용한다.

- 알림형: 결과 안내
- 확인형: 삭제, 초기화, 전체 발행처럼 되돌리기 어렵거나 영향이 큰 작업

규칙:

- 브라우저 네이티브 팝업 금지
- 제목은 동작명, 본문은 결과/영향 설명
- 확인 버튼 문구는 `확인`, `삭제하기`, `초기화`, `전체 발행`처럼 동사형으로 쓴다

### Form

- 입력 필드는 한 줄 설명보다 라벨이 먼저
- 보조 설명은 `field-hint`
- 관련 필드 묶음은 `settings-detected-provider`, `helper-box-stack`, `settings-field-group` 같은 기존 그룹형 패턴을 우선 사용

규칙:

- 입력창을 설명 없이 던지지 않는다
- 민감 정보 입력은 `password-field` 패턴 유지
- 액션 버튼이 필드 옆에 붙을 때는 줄 정렬이 깨지지 않도록 별도 액션 행을 둔다

## 6. Interaction Rules

### Immediate Feedback

길게 걸리는 작업은 아래 중 최소 1개가 즉시 보여야 한다.

- 버튼 텍스트 변경
- 진행 chip 노출
- 패널 내 짧은 진행 문구
- 버튼 비활성화

### Save Behavior

- 설정류는 자동 저장을 기본으로 본다
- 자동 저장 상태는 `저장 대기 / 자동 저장 중 / 저장 실패 / 자동 저장`처럼 짧게 표시
- 사용자가 저장 버튼을 찾아 헤매게 하지 않는다

### Confirmation

다음 작업은 확인 모달을 우선 고려한다.

- 삭제
- 초기화
- 대량 실행
- 취소/되돌리기
- 외부 시스템 상태를 바꾸는 동작

## 7. Copy Rules

- 짧고 운영자 관점으로 쓴다
- `설정 필요`, `준비됨`, `점검 필요`, `발행 대상`, `확인 필요`처럼 실무 용어를 유지한다
- 장황한 설명 대신 제목 + 짧은 보조문구 구조로 쓴다
- 버튼 문구는 `저장`, `점검`, `재처리`, `전체 발행`, `초기화`처럼 바로 행동이 보이게 쓴다

피해야 할 표현:

- 추상적인 마케팅 문구
- 감탄형 문구
- 같은 말을 두 번 반복하는 설명

## 8. Responsive Rules

- 모바일에서는 한 열 흐름이 기본
- 데스크톱에서 좌우 분리된 액션은 모바일에서 세로 stack으로 자연스럽게 내려간다
- 모바일에서 버튼은 가급적 전체 폭 사용
- 작은 화면에서 텍스트가 찌그러지면 줄바꿈을 허용하고, 고정폭을 줄인다

## 9. New UI Checklist

새 화면/기능을 추가할 때 아래를 확인한다.

1. 기존 `Panel`, `SetupPanel`, `chip`, `status`, `alert`, `AppDialog`로 해결 가능한가
2. 새 색상/새 radius/새 shadow 없이 기존 토큰으로 충분한가
3. 카드가 두 겹, 세 겹으로 중첩되어 보이지 않는가
4. 빈 상태가 표/리스트 바깥에 따로 떠 있지 않은가
5. 클릭 후 바로 반응이 보이는가
6. 모바일에서 한 열로 자연스럽게 정리되는가
7. 브라우저 기본 팝업을 쓰지 않았는가

## 10. Do / Don’t

Do

- 기존 시각 언어를 이어서 쓴다
- 운영 화면답게 밀도 있게 구성한다
- 상태와 액션을 분명하게 보여준다
- 사용자 행동 직후 피드백을 준다

Don’t

- 카드 안에 또 카드, 박스 안에 또 박스를 습관처럼 넣지 않는다
- 기능마다 다른 버튼 스타일을 만들지 않는다
- 새 기능이라고 완전히 다른 UI 언어를 쓰지 않는다
- 브라우저 기본 `alert`, `confirm`을 다시 도입하지 않는다

## 11. Current Canonical Components

현재 AUTO-TAX에서 기준으로 삼을 컴포넌트/패턴:

- `Panel`
- `SetupPanel`
- `StatCard`
- `chip`, `status`, `alert`
- `app-dialog`
- `form-grid`, `info-grid`
- `table-wrap + queue-table`

새 UI는 이 패턴을 우선 재사용하고, 정말 부족할 때만 확장한다.
