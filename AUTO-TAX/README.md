# AUTO-TAX

한전 신재생에너지 요금안내 메일을 읽어서 고객별 전자세금계산서 초안을 만들고, 검수 후 수동으로 팝빌에 발행하는 관리 프로그램입니다.

## 현재 구현 범위

- IMAP 메일 수집
- 한전 메일 파싱
- 발전소명 기준 고객 매칭
- 고객/발전소명/팝빌 계정 관리
- 팝빌 연동회원 가입
- 인증서 등록 URL 발급 및 만료일 확인
- 인증서 일괄 점검 및 만료 예정 운영자 알림 메일
- 검수 후 수동 발행
- 검수 대기건 전체 일괄 발행
- SMTP 운영자 알림
- Gmail IMAP/SMTP 연결 테스트
- 로컬 DB 백업 및 복원
- SQLite 기반 로컬 저장
- 팝빌 ID 자동 생성 / 공통 비밀번호 적용
- Electron 데스크톱 앱 래퍼 및 Windows 실행 패키징
- 인증서 만료일 경고 표시
- 인증서 일괄 점검 시 운영자 알림 메일 발송

## 실행

```bash
npm install
npm run dev
```

- 웹 화면: `http://localhost:5173`
- API 서버: `http://localhost:4300`

프로덕션 빌드:

```bash
npm run build
npm start
```

## 데스크톱 실행

개발 모드 Electron:

```bash
npm run desktop:dev
```

Windows 실행 폴더 빌드:

```bash
npm run desktop:pack
```

Windows 설치파일 빌드:

```bash
npm run desktop:installer
```

- Electron 앱은 패키징 시 `%AppData%/AUTO-TAX/auto-tax.db` 경로에 로컬 DB를 저장합니다.
- 패키징 결과물은 `release/AUTO-TAX-win32-x64/` 폴더에 생성됩니다.
- 이 폴더 안의 `AUTO-TAX.exe`를 바로 실행할 수 있습니다.
- 설치파일은 `release/AUTO-TAX-Setup-0.1.0.exe`로 생성됩니다.

## 설정 순서

1. 시스템 설정에서 Gmail 계정/앱 비밀번호와 팝빌 키 입력
2. 고객 등록
3. 고객별 발전소명 등록
4. 팝빌 계정 규칙 확인
5. 팝빌 가입
5. 인증서 등록 URL 열기
6. 인증 상태 확인
7. 필요 시 `인증서 일괄 점검` 실행
8. 메일 동기화
9. 검수 화면에서 개별 발행 또는 전체 발행
10. 필요 시 설정 화면에서 Gmail 연결 테스트 / DB 백업 실행

## 문서

- [구현 문서](./docs/IMPLEMENTATION.md)
- [운영 문서](./docs/OPERATIONS.md)
- [고객 온보딩 문서](./docs/ONBOARDING.md)

## 지금 바로 채워야 하는 값

`.env` 파일에서 아래 값만 우선 채우면 됩니다.

- `AUTO_TAX_IMAP_USER`
- `AUTO_TAX_IMAP_PASS`
- `AUTO_TAX_SMTP_USER`
- `AUTO_TAX_SMTP_PASS`
- `AUTO_TAX_SMTP_FROM_EMAIL`
- `AUTO_TAX_NOTIFICATION_EMAILS`
- `AUTO_TAX_POPBILL_LINK_ID`
- `AUTO_TAX_POPBILL_SECRET_KEY`
- `AUTO_TAX_POPBILL_USER_ID_PREFIX`
- `AUTO_TAX_POPBILL_SHARED_PASSWORD`
- `AUTO_TAX_OPERATOR_CONTACT_NAME`
- `AUTO_TAX_OPERATOR_CONTACT_EMAIL`
- `AUTO_TAX_OPERATOR_CONTACT_TEL`

같은 Gmail 계정을 쓸 거라면 보통 아래처럼 맞추면 됩니다.

- `AUTO_TAX_IMAP_USER` = Gmail 주소
- `AUTO_TAX_IMAP_PASS` = Gmail 앱 비밀번호
- `AUTO_TAX_SMTP_USER` = Gmail 주소
- `AUTO_TAX_SMTP_PASS` = Gmail 앱 비밀번호
- `AUTO_TAX_SMTP_FROM_EMAIL` = Gmail 주소
- `AUTO_TAX_POPBILL_USER_ID_PREFIX` = 예: `HAE_`
- `AUTO_TAX_POPBILL_SHARED_PASSWORD` = 신규 고객에 공통으로 쓸 팝빌 비밀번호
- `AUTO_TAX_OPERATOR_CONTACT_NAME` = 팝빌 가입에 쓸 운영자명
- `AUTO_TAX_OPERATOR_CONTACT_EMAIL` = 팝빌 가입에 쓸 운영자 이메일
- `AUTO_TAX_OPERATOR_CONTACT_TEL` = 팝빌 가입에 쓸 운영자 연락처

## Gmail 기준 권장 설정

Gmail 계정을 메일 수집용으로 쓰려면 먼저 Google 계정에서 아래를 준비합니다.

1. 메일 전용 Gmail 계정 생성
2. Google 계정 `2단계 인증` 활성화
3. Google 계정 `앱 비밀번호` 생성
4. AUTO-TAX 설정 화면에 아래 값을 입력

설정 화면에서 주로 넣을 값:

- `IMAP 계정`: `your-account@gmail.com`
- `IMAP 비밀번호`: Gmail 로그인 비밀번호가 아니라 `앱 비밀번호`
- `메일함`: 보통 `INBOX`
- `SMTP 계정`: `your-account@gmail.com`
- `SMTP 비밀번호`: `앱 비밀번호`
- `발신자 이름`: 예: `AUTO-TAX`
- `발신 메일`: `your-account@gmail.com`

나머지 Gmail 연결값은 프로그램이 기본값으로 자동 적용합니다.

권장 운영 방식:

- 한전 메일 수신용 Gmail 계정 1개를 따로 둡니다.
- AUTO-TAX는 이 Gmail 계정의 `IMAP`으로 메일을 읽습니다.
- 실패 알림은 같은 Gmail 계정의 `SMTP`로 운영자에게 발송합니다.

참고:

- [Gmail을 다른 메일 클라이언트와 동기화하기](https://support.google.com/mail/answer/7126229?hl=en)
- [앱 비밀번호](https://support.google.com/accounts/answer/185833?hl=en)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)

현재 프로젝트는 `Gmail API`가 아니라 `IMAP/SMTP` 기반입니다. Gmail API는 OAuth와 Restricted scope 운영 부담이 더 커서, 현 단계에서는 `Gmail 계정 + IMAP/SMTP` 구성이 더 단순하고 안정적입니다.

## 핵심 규칙

- 고객 식별: `발전소명 + 주소`
- 품목명: `YYYY년M월전력`
- 공급가액: 메일의 `당월 공급가액`
- 세액: 메일의 `VAT`
- 발행 형태: `청구`
- 실패 처리: `실패 로그 + 운영자 메일 알림`
- 발행 방식: 자동발행 없이 `메일 동기화 -> 검수 -> 개별/전체 발행`
- 팝빌 ID: `접두어 + 고객번호` 형식 자동 생성, 예: `HAE_001`
- 팝빌 비밀번호: 시스템설정의 `팝빌 공통 비밀번호`를 신규 고객에 동일 적용
  이미 생성된 고객 계정의 실제 비밀번호를 자동으로 바꾸지는 않음
- 운영 담당자 연락처: 고객별이 아니라 시스템설정의 공통 운영자 정보 1세트를 사용
