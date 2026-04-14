# 로컬 헬퍼 구버전 감지 / 업데이트 안내 계획

작성일: 2026-04-14

## Requirements Summary

- 현재 로컬 헬퍼는 `/health` 응답에 `version`을 포함하고 있고 (`scripts/renewal-local-helper.ts:194-205`), 웹은 그 값을 읽어 상태로 보관합니다 (`web/src/local-renewal-helper.ts:95-110`, `web/src/App.tsx:2460-2467`, `web/src/App.tsx:4847-4855`).
- 설정/인증서 화면에는 이미 헬퍼 버전 표시와 다운로드 버튼이 있습니다 (`web/src/features/settings/SettingsTab.tsx:371-391`, `web/src/features/settings/SettingsTab.tsx:444-463`, `web/src/features/certificates/CertificatesTab.tsx:818-826`).
- 다운로드는 이미 `/downloads/renewal-local-helper.zip`로 제공됩니다 (`server/src/app-shell.ts:27-33`, `web/src/App.tsx:6257`).
- 재설치 흐름도 이미 준비돼 있습니다. 설치 스크립트는 기존 실행 헬퍼를 중지하고, 패키지를 `%LOCALAPPDATA%\\AUTO-TAX\\renewal-local-helper`로 복사한 뒤 다시 시작합니다 (`scripts/install-renewal-local-helper-autostart.ps1:79-116`).
- 다만 “최신 버전 / 최소 지원 버전” 기준은 아직 없고, 현재 헬퍼 버전은 루트 `package.json`을 읽습니다 (`package.json:3`, `scripts/renewal-local-helper.ts:14-31`). 이 상태로는 앱 버전과 헬퍼 배포 버전이 어긋날 수 있으므로, **헬퍼 전용 릴리스 메타데이터**가 필요합니다.

## Acceptance Criteria

1. 실행 중인 헬퍼 버전이 `latestVersion`보다 낮으면 설정/인증서 화면에 “새 버전 있음” 안내가 뜬다.
2. 실행 중인 헬퍼 버전이 `minSupportedVersion`보다 낮으면 인증서 읽기/사전점검/결제창 열기/팝빌 등록 같은 헬퍼 의존 작업을 막고 재설치를 안내한다.
3. 헬퍼 버전이 최신이거나 더 높으면 추가 안내가 뜨지 않는다.
4. 릴리스 메타데이터를 못 받아도 기존 온라인/오프라인 상태 확인은 계속 동작하고, 잘못된 차단은 발생하지 않는다.
5. 배포 산출물(zip)과 버전 메타데이터는 같은 빌드 단계에서 같이 갱신된다.
6. 검증에서 “최신”, “업데이트 권장”, “업데이트 필수”, “메타데이터 없음” 4가지 상태 중 최소 3가지를 재현한다.

## Recommended Design

### 선택안
**서버가 헬퍼 릴리스 메타데이터(JSON)를 제공하고, 웹이 현재 헬퍼 버전과 비교해 경고/차단을 결정하는 방식**을 채택합니다.

예시:

```json
{
  "helperVersion": "0.1.3",
  "latestVersion": "0.1.3",
  "minSupportedVersion": "0.1.2",
  "downloadUrl": "/downloads/renewal-local-helper.zip",
  "releasedAt": "2026-04-14T00:00:00.000Z"
}
```

### 대안
- `VITE_RENEWAL_HELPER_MIN_VERSION` 같은 프런트 환경변수만으로 처리  
  → 구현은 빠르지만 zip과 버전 기준이 쉽게 어긋나고, 운영자가 프런트 배포와 헬퍼 배포를 따로 맞춰야 해서 장기 유지보수성이 떨어집니다.

## Implementation Steps

### 1) 헬퍼 릴리스 메타데이터를 배포 산출물에 추가

**대상 파일**
- `scripts/build-renewal-local-helper-package.mjs:15-17`
- `scripts/build-renewal-local-helper-package.mjs:80-86`
- `server/src/app-shell.ts:27-33`

**작업**
- `scripts/build-renewal-local-helper-package.mjs`가 zip을 만들 때 `renewal-local-helper.json`도 함께 생성/복사하게 합니다.
- JSON에는 최소 다음 필드를 넣습니다:
  - `latestVersion`
  - `minSupportedVersion`
  - `downloadUrl`
  - `releasedAt`
- `server/src/app-shell.ts`에 `/downloads/renewal-local-helper.json` 라우트를 추가해 zip과 같은 배포 경로에서 내려주게 합니다.

**메모**
- zip과 JSON을 같은 빌드 스크립트에서 만들면 “파일은 새 버전인데 기준 JSON은 이전 버전” 같은 drift를 줄일 수 있습니다.

### 2) 헬퍼 버전 기준을 앱 버전과 느슨하게 분리

**대상 파일**
- `package.json:3`
- `scripts/renewal-local-helper.ts:14-31`

**작업**
- 1차 단계에서는 기존처럼 헬퍼가 `package.json` 버전을 계속 써도 되지만, 계획 단계에서 **헬퍼 전용 버전 소스**를 같이 도입하는 쪽을 권장합니다.
- 선택지는 두 가지입니다:
  1. 빌드 스크립트가 헬퍼 전용 `version.json`을 만들고, 헬퍼가 그 파일을 읽는다.
  2. 빌드 시점에 `renewal-local-helper.cjs`에 helper version constant를 주입한다.

**권장**
- 변경 범위가 작은 `version.json` 방식이 더 안전합니다.

### 3) 프런트에 “현재 버전 vs 배포 버전” 비교 로직 추가

**대상 파일**
- `web/src/local-renewal-helper.ts:11-59`
- `web/src/App.tsx:63-70`
- 신규 후보: `web/src/helper-version.ts`

**작업**
- 릴리스 메타데이터 타입을 추가합니다.
- `1.2.3` 형식의 dot-segment를 비교하는 작은 유틸을 직접 작성합니다.  
  (`semver` 같은 새 의존성은 넣지 않음)
- `CustomerRenewalAssistantData`에 아래 필드를 추가합니다:
  - `latestVersion: string | null`
  - `minSupportedVersion: string | null`
  - `upgradeState: "unknown" | "up-to-date" | "upgrade-available" | "upgrade-required"`
  - `upgradeMessage: string | null`

**판정 규칙**
- 현재 버전 < `minSupportedVersion` → `upgrade-required`
- 현재 버전 < `latestVersion` → `upgrade-available`
- 그 외 → `up-to-date`
- 버전 문자열 파싱 실패 / 메타데이터 없음 → `unknown` 또는 경고만 표시

### 4) 상태 로딩 흐름을 App 단에서 통합

**대상 파일**
- `web/src/App.tsx:2460-2467`
- `web/src/App.tsx:2513-2522`
- `web/src/App.tsx:4847-4855`
- `web/src/App.tsx:5010-5017`
- `web/src/App.tsx:5294-5302`
- `web/src/App.tsx:5322-5329`
- `web/src/App.tsx:5435-5443`
- `web/src/App.tsx:5511-5518`

**작업**
- `getLocalRenewalHelperStatus()`만 호출하던 부분을 “헬퍼 health + release metadata” 동시 조회로 바꿉니다.
- 헬퍼 API 응답에서 받은 `response.version`도 같은 비교 함수에 태워 상태를 갱신합니다.
- 앱 전체에서 같은 판정 결과를 재사용하도록 `App.tsx`의 중앙 상태에만 비교 결과를 저장합니다.

**이유**
- 지금도 헬퍼 상태는 `App.tsx`가 단일 소스로 관리하고 Settings/Certificates 등에 props로 내립니다 (`web/src/App.tsx:8240-8241`, `web/src/App.tsx:8299-8303`, `web/src/App.tsx:8340-8341`).

### 5) UI는 “권장 업데이트”와 “필수 업데이트”를 구분해서 노출

**대상 파일**
- `web/src/features/settings/SettingsTab.tsx:371-391`
- `web/src/features/settings/SettingsTab.tsx:444-463`
- `web/src/features/certificates/CertificatesTab.tsx:381-390`
- `web/src/features/certificates/CertificatesTab.tsx:818-826`
- 필요 시 `web/src/App.tsx:7032-7038` 주변 설치 안내 카드

**작업**
- **upgrade-available**:
  - “새 버전이 있습니다. 현재 vX / 최신 vY”
  - 다운로드 버튼 유지
  - 동작은 막지 않음
- **upgrade-required**:
  - “이 버전은 더 이상 지원되지 않습니다. 새 버전을 다시 설치하세요.”
  - 다운로드 버튼 + 설치 방법 노출
  - helper-dependent action 차단
- 상태 메시지는 기존 `customerRenewalAssistantHelperMessage`와 분리해, 온라인/오프라인 메시지와 버전 메시지가 서로 덮어쓰지 않게 합니다.

### 6) 헬퍼 의존 액션의 사전 가드 추가

**대상 파일**
- `web/src/local-renewal-helper.ts:95-110`
- `web/src/App.tsx`의 helper action 호출부:
  - 인증서 읽기 (`response.version` 반영부: `web/src/App.tsx:5010-5017`)
  - 인증서 사전점검 (`web/src/App.tsx:5322-5329`, `web/src/App.tsx:5435-5443`)
  - 결제창 열기 (`web/src/App.tsx:5511-5518`)
  - 팝빌 인증서 등록 (`response.version` 반영부가 있는 로컬 헬퍼 호출 경로)

**작업**
- `upgrade-required`이면 요청 전에 공통 가드 함수에서 막습니다.
- `upgrade-available`이면 허용하되, 최초 1회 토스트/배너 정도만 보여줍니다.
- 가드는 반드시 **App 레벨 공통 함수**로 두어 액션별 중복을 피합니다.

### 7) 테스트와 릴리스 체크리스트 추가

**대상 파일**
- `scripts/e2e-smoke.mjs:177`
- `scripts/e2e-smoke.mjs:288-295`
- `scripts/e2e-smoke.mjs:324`
- `scripts/e2e-smoke.mjs:389`
- 필요 시 `docs/OPERATIONS.md`

**작업**
- e2e fake helper의 `/health` 응답 버전을 바꿔가며 다음 케이스를 검증합니다:
  1. 최신 버전
  2. 권장 업데이트 버전
  3. 필수 업데이트 버전
- 릴리스 절차 문서에 “zip 생성 시 metadata JSON도 함께 확인” 단계를 추가합니다.

## Risks and Mitigations

### Risk 1. 앱 버전과 헬퍼 버전이 다르게 흘러서 오탐이 난다
- **원인:** 현재 헬퍼는 루트 `package.json` 버전을 읽습니다 (`scripts/renewal-local-helper.ts:14-31`).
- **대응:** helper 전용 version source를 도입하고, release metadata도 helper 전용으로 관리합니다.

### Risk 2. 최신 버전 기준 JSON은 갱신됐는데 실제 zip은 이전 버전일 수 있다
- **대응:** 둘 다 `scripts/build-renewal-local-helper-package.mjs`에서 한 번에 생성/복사합니다.

### Risk 3. 버전 문자열 형식이 예상과 다르면 사용자를 과하게 막을 수 있다
- **대응:** 파싱 실패 시 hard-block하지 말고 “확인 필요” 경고만 노출합니다.

### Risk 4. 사용자가 zip만 받고 설치를 안 해서 계속 구버전을 실행할 수 있다
- **대응:** 필수 업데이트 메시지에 “압축 해제 → `renewal-helper-install.cmd` 실행”을 명시하고, 설치 스크립트가 기존 프로세스를 교체한다는 점을 재사용합니다 (`scripts/install-renewal-local-helper-autostart.ps1:90-116`).

## Verification Steps

1. `npm run check`
2. 로컬 또는 테스트 서버에서 `/downloads/renewal-local-helper.json` 응답 확인
3. fake helper 버전을 `latestVersion`과 같게 두고 Settings/Certificates에서 경고가 없는지 확인
4. fake helper 버전을 `latestVersion`보다 낮고 `minSupportedVersion` 이상으로 두고 “업데이트 권장” 배너가 뜨는지 확인
5. fake helper 버전을 `minSupportedVersion`보다 낮게 두고:
   - 인증서 읽기
   - 갱신 준비
   - 결제창 열기
   가 차단되는지 확인
6. 메타데이터 응답을 일부러 끊고 기존 health 기반 상태 표시가 계속 되는지 확인

## Suggested Execution Order

1. 배포 메타데이터(JSON) 추가
2. 프런트 타입/비교 유틸 추가
3. App 중앙 상태 확장
4. Settings/Certificates UI 반영
5. helper action 가드 추가
6. e2e / 문서 정리

