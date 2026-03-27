# AUTO-TAX Implementation Guide

## 목적

AUTO-TAX는 한전의 `신재생에너지 요금안내` 메일을 읽고, 발전소명 기준으로 고객을 매칭한 뒤 전자세금계산서 초안을 만들고 팝빌로 발행하는 프로그램이다.

핵심 목표는 아래 4가지다.

- 메일 수집 자동화
- 고객 매칭 자동화
- 검수 후 발행 / 자동 발행 지원
- 팝빌 연동회원 가입 및 인증서 등록 지원

## 현재 구조

### 기술 스택

- Backend: Node.js + TypeScript + Express
- Frontend: React + Vite
- Database: Supabase PostgreSQL
- Mail read: IMAP (`imapflow`)
- Mail parse: `mailparser` + 규칙 기반 파서
- Tax invoice: Popbill Node SDK
- Notification: SMTP (`nodemailer`)

### 주요 경로

- 서버 진입점: `server/src/main.ts`
- 메일 파싱: `server/src/parser.ts`
- 메일 동기화: `server/src/mail-sync.ts`
- 발행 스케줄: `server/src/scheduler.ts`
- 팝빌 연동: `server/src/popbill-client.ts`
- 데이터 저장: `server/src/supabase-store.ts`
- 관리 화면: `web/src/App.tsx`

## 업무 플로우

### 1. 고객 온보딩

1. 운영자가 고객 정보를 등록한다.
2. 고객별 발전소명을 등록한다.
3. 저장 시 팝빌 ID를 자동 생성하고 공통 비밀번호를 적용한다.
4. 팝빌 연동회원 가입을 실행한다.
4. 인증서 등록 URL을 열어 고객 인증서를 1회 등록한다.
5. 인증 상태를 확인한다.
6. 기본은 `검수 후 발행` 모드로 둔다.

### 2. 메일 수집

1. 스케줄러가 IMAP으로 메일함을 읽는다.
2. 제목에 `신재생에너지 요금안내`가 포함된 메일만 대상으로 한다.
3. 메일 원문 또는 전달 메일의 원본 메시지 블록을 기준으로 파싱한다.
4. 아래 값을 추출한다.

- 발전소명
- 정산월
- 당월 공급가액
- VAT
- 한전 등록번호
- 종사업장번호
- 한전 상호/대표자/주소/업태/종목
- 수신 메일 주소

### 3. 고객 매칭

1. 파싱된 `발전소명`을 정규화한다.
2. `managed_customer_plants.normalized_plant_name`과 비교한다.
3. 일치하는 고객이 있으면 초안을 생성한다.
4. 없으면 `unmatched`로 저장하고 운영자 알림을 보낸다.

### 4. 초안 생성

초안 생성 시 아래 규칙을 사용한다.

- 품목명: `YYYY년M월전력`
- 공급가액: 메일의 `당월 공급가액`
- 세액: 메일의 `VAT`
- 합계금액: 공급가액 + 세액
- 발행형태: `청구`
- 관리번호: `C{customerId}-{billingMonth}-{messageId}`

### 5. 발행

- 고객 모드가 `review`면 검수 대기로 둔다.
- 고객 모드가 `auto`면 월 자동 실행일의 메일 동기화 작업에서 `scheduled`로 만들고 즉시 자동 발행 큐로 넘긴다.
- 월 자동 실행일/시각은 고객사 작업공간 설정에서 바꿀 수 있고, 기본값은 `매월 26일`이다.
- 발행 실패 시 `failed`로 바꾸고 운영자 메일 알림을 보낸다.

## 팝빌 매핑 규칙

### 공급자

- 공급자 = 고객
- 고객 사업자번호 / 상호 / 대표자 / 주소 / 업태 / 업종 사용

### 공급받는자

- 공급받는자 = 한국전력공사
- 메일에서 읽은 등록번호 사용
- 메일에서 읽은 종사업장번호 사용
- 메일에서 읽은 상호 / 대표자 / 주소 / 업태 / 종목 사용

### 세금계산서 상세

- 품목명: `2026년2월전력` 같은 형식
- 수량: `1`
- 공급가액: 메일 값
- 세액: 메일 값
- 작성일: 실제 발행일

## 데이터 모델

### organization_settings / organization_integrations

- IMAP/SMTP 설정
- 운영자 알림 메일 목록
- 기본 발행일 / 발행 시각
- 메일 폴링 주기
- 스케줄러 활성화 여부

### managed_customers

- 고객 기본 사업자 정보
- 자동 생성된 팝빌 사용자 ID / 비밀번호
- 팝빌 가입 상태
- 인증서 등록 상태 / 만료일
- 고객별 발행 모드
- 고객별 발행일 / 시 / 분

### managed_customer_plants

- 발전소명
- 정규화된 발전소명
- 고객 연결

### inbox_messages

- 메일 UID
- 제목 / 발신자 / 수신시각
- 원문 / 텍스트 본문
- 파싱 상태
- 파싱 결과 JSON
- 연결된 고객 / 초안 ID

### invoice_drafts

- 고객
- 원본 메일
- 발행 상태
- 예약 시각
- 정산월 / 품목명 / 금액
- 한전 정보
- 팝빌 결과

### app_logs

- 레벨
- 범위
- 메시지
- 컨텍스트 JSON

## 환경 설정

환경값은 두 종류로 나뉜다.

- 고객사별 메일/스케줄 값: Supabase 작업공간 설정에 저장
- 서버 전용 팝빌 값: `.env` 또는 Vercel 서버 환경변수에 저장
- 조직별 팝빌 운영 정책 값: Supabase 작업공간 설정 화면에서 관리

중요 키:

- `AUTO_TAX_POPBILL_LINK_ID`
- `AUTO_TAX_POPBILL_SECRET_KEY`
- `AUTO_TAX_POPBILL_IS_TEST`

조직별로 따로 관리하는 값:

- 팝빌 사용자 ID 접두어
- 팝빌 공통 비밀번호
- 팝빌 가입용 운영 담당자 이름/이메일/연락처

추가 참고:

- `AUTO_TAX_POPBILL_PARTNER_CORP_NUM`은 파트너 포인트 조회/충전이 필요할 때만 추가한다.
- `SUPABASE_ORGANIZATION_ID`, `AUTO_TAX_ORGANIZATION_*`는 부트스트랩 또는 기본 작업공간 고정이 필요할 때만 추가한다.
- `AUTO_TAX_SERVER_URL`, `AUTO_TAX_RENEWAL_AGENT_*`는 로컬 인증서/갱신 에이전트를 붙일 때만 추가한다.

## 현재 제약

- 메일 파서는 현재 한전 샘플 형식 기준 정규식 기반이다.
- 고객 매칭은 `발전소명`에 의존한다.
- 다중 사용자 권한 분리는 아직 없다.
- 첨부파일 기반 파싱은 아직 없다.
- 자동발행 전 사전 검증 규칙은 현재 최소 수준이다.

## 다음 확장 후보

- 메일 샘플별 파서 전략 분리
- 고객 일괄 업로드 CSV
- 발행 취소/재발행 지원
- 감사 로그 화면 보강
- 운영자 SMS 또는 카카오 알림 추가
