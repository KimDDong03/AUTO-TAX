# 공동인증서 갱신 로컬 에이전트 POC

이 문서는 후속 단계 검토용 POC 문서다.

현재 1차 제품 범위는 `전자세금계산서 발행`까지이며, `공동인증서 갱신 보조`는 아직 구현 범위에 포함하지 않는다.

## 목적

SignGate 공동인증서 갱신 흐름을 바로 무인 자동화하지 않고, 먼저 전용 Windows PC에서 아래 항목만 안전하게 확인한다.

- `SecuKitNXS.exe` 관련 프로세스 감지
- 로컬 브리지 포트 `127.0.0.1:14315`, `127.0.0.1:14319` 연결 여부
- 로컬 브리지 `GetVersion` 읽기 전용 호출
- SignGate `checkLicense` 검증
- 하드디스크(`HDD`) 인증서 목록 읽기 전용 조회
- 목록 기준 `viewCertDetailInfomationIssue(ID)` 세부 정보 조회
- 반자동 `selectCertificateIssue(ID, password, certID='@signgate.com')` 기반 `certID` 조회
- `showCert` 와 SignGate AJAX를 재현한 갱신 경로 분석
- AUTO-TAX 서버와 로컬 에이전트 간 작업 큐/하트비트 흐름

현재 단계에서는 **실제 갱신 명령을 보내지 않는다.**

## 구성

- AUTO-TAX 서버
  - 로컬 에이전트 하트비트 수신
  - 인증서 목록 진단 작업 큐 관리
  - 최근 작업/상태를 웹 UI에 노출
- Windows 로컬 에이전트
  - 주기적으로 SecuKit 관련 프로세스, 포트, `GetVersion` 상태만 경량 하트비트로 진단
  - 하트비트 전송
  - 서버에서 큐잉한 `bridge-probe` 작업을 읽어 SignGate 라이선스 검증과 HDD 인증서 목록 조회 결과 전송
  - 서버에서 큐잉한 `certid-probe` 작업을 읽어 선택 인증서의 `certID` 조회 결과 전송
  - 서버에서 큐잉한 `renewal-preflight` 작업을 읽어 기관변경/결제/비밀번호확인 등 다음 갱신 경로를 분석

## 실행

서버 실행:

```bash
npm run dev:server
```

로컬 에이전트 실행:

```bash
npm run renewal-agent:dev
```

다른 서버 주소를 사용할 때:

```bash
npm run renewal-agent:dev -- --server http://127.0.0.1:4300
```

1회만 실행해서 스모크 테스트할 때:

```bash
npm run renewal-agent:dev -- --once
```

환경변수로도 지정 가능:

```bash
AUTO_TAX_SERVER_URL=http://127.0.0.1:4300
AUTO_TAX_RENEWAL_AGENT_ID=office-pc-01
AUTO_TAX_RENEWAL_AGENT_INTERVAL_MS=5000
AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD=인증서비밀번호
# 또는
AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE=C:\secure\cert-password.txt
```

## 웹 UI 확인 위치

- 시스템설정
- `팝빌 / 운영자`
- `로컬 갱신 에이전트 POC`

확인 가능한 정보:

- 에이전트 온라인/오프라인
- 마지막 하트비트 시각
- SecuKit 관련 프로세스 감지 여부
- 브리지 포트 연결 상태
- `GetVersion` 응답 버전 정보
- SignGate 라이선스 검증 상태
- 현재 PC HDD 저장소에서 읽힌 인증서 목록
- 선택된 인증서의 `serial`, `userDN`, 상세 만료시각, 저장 경로
- 선택된 인증서의 `certID` 조회 결과
- 선택된 인증서의 SignGate 갱신 경로 분석 결과
- 최근 인증서 목록 진단 작업 이력

## 서버 API

- `GET /api/automation/renewal-agent/snapshot`
- `POST /api/automation/renewal-jobs/bridge-probe`
- `POST /api/automation/renewal-jobs/certid-probe`
- `POST /api/automation/renewal-jobs/preflight`
- `POST /api/automation/renewal-agent/heartbeat`
- `POST /api/automation/renewal-agent/jobs/claim`
- `POST /api/automation/renewal-agent/jobs/:id/complete`
- `POST /api/automation/renewal-agent/jobs/:id/fail`

## 현재 제한

- 상태는 메모리 큐로 관리한다. 서버 재시작 시 작업/하트비트 이력은 초기화된다.
- 실제 인증서 목록 조회는 SignGate 페이지와 동일하게 `Origin`, `Referer`, `NXS_LICENSE` 핸드셰이크를 재현해야 한다.
- 현재는 `checkLicense`, `selectStorageIssue(HDD, NULL)`, `viewCertDetailInfomationIssue(ID)`, `selectCertificateIssue(ID, password, certID='@signgate.com')`, `showCert` 까지 구현했다.
- SignGate 서버 AJAX(`/renew/ajaxEntrpsCompanyCheck.json`, `/renew/ajaxEntrpsRenewInfoCheck.json`)를 재현해 다음 분기 URL까지 분석한다.
- `change-company` 분기에서는 `stepEntrpsChangeCompany.sg` 페이지를 다시 POST로 열어 실제 외부 이동 URL(`welcome.signra.com`)과 이벤트 배너까지 읽는다.
- `welcome.signra.com`로 넘어가는 경우에는 외부 페이지까지 다시 읽어 `applyForm.action=/web-signra/apply/searchEntprsApplyCompletion.sg`, `kica-applyCommon.js`, `data-sectionType="aply"`를 확인한다.
- 이 외부 페이지는 URL도 `/web-signra/apply/applyEntprsIssue.sg`, 최종 submit도 `/web-signra/apply/searchEntprsApplyCompletion.sg`라서, JS의 `getDestKey()` 기준 `middleUri='/apply'`, `certJobPrgrsSeCd='APLY'` 경로를 탄다. 즉 내부 SignGate `renew` 연속 단계가 아니라 `외부 신규신청형` 플로우다.
- 따라서 `change-company + externalFlowKind=apply-form` 이면 AUTO-TAX UI에서는 `순정 갱신 아님`으로 취급한다. 이 경우는 SignGate 내부 갱신 자동화의 본선이 아니라 예외 분기다.
- 사업자 기준으로 보이는 주요 섹션은 `agre -> aply -> pprs -> pay`이고, 확인 AJAX는 최소한 `/apply/confirm/isBlackListEntrpsUser.json`, 결제 미리보기는 `/apply/getPayInfSection.sg`, 최종 전송은 `applyForm.submit()`이다.
- `certID` 조회는 로컬 에이전트 환경변수(`AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD` 또는 `AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD_FILE`)가 있어야 한다.
- 실제 인증서 갱신 발급(`updateCert`), 결제, 완료 판정은 아직 자동화하지 않는다.

## 다음 단계

1. SignGate 순정 인증서에서 `renew-info`, `renew-payment`, `password-confirm` 분기를 실제 사례로 확보
2. `updateCert` 호출에 필요한 추가 파라미터와 최종 완료 판정 추적
3. 완료 후 Popbill 만료일 재조회까지 연결
4. `change-company -> welcome.signra.com` 예외 분기는 필요 시 별도 흐름으로 분리 추적
