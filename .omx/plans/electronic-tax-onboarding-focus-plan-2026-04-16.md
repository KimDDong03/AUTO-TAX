# 전자세금용 공동인증서 집중 구현 계획 (2026-04-16)

## 1. 요구사항 요약

### 목표
- 당분간 `범용/개인 공동인증서`는 제품 핵심 흐름에서 배제하고, **전자세금용 공동인증서만** 기준으로 `엑셀 다운로드 → 업로드/미리보기 → 고객 등록 → 인증서 연결/등록 → 등록 상태 확인` 흐름을 안정화한다.
- 사용자가 가장 먼저 확인해야 하는 것은 아래 3가지다.
  1. 이 PC에서 **전자세금용 인증서를 잘 찾는가**
  2. 해당 인증서로 **고객이 정확히 생성/갱신되는가**
  3. 고객별 **팝빌 전자세금용 인증서 등록이 잘 끝나는가**

### 현재 코드 기준 사실
- 초기 등록은 이미 `workbook download/upload` 흐름으로 잡혀 있다 (`docs/IMPLEMENTATION.md:31-38`, `docs/FEATURE_LIST.md:221-233`).
- 현재 워크북 생성은 **전자세금용은 발전소 시트**, **범용은 공동인증서 시트**로 분리돼 있다 (`web/src/features/initial-registration/customer-onboarding-workbook.ts:181-229`).
- 업로드 후 프론트는 전자세금용 인증서를 로컬 헬퍼로 다시 찾고, preflight로 사업자 정보를 읽어 고객 payload를 만든다 (`web/src/App.tsx:2716-3036`).
- 서버 커밋은 워크북에 들어온 모든 인증서 종류를 그대로 저장할 수 있어, 현재 범용/전자세금이 함께 흘러간다 (`server/src/services/customer-onboarding-import-service.ts:515-590`).
- 인증서 탭/모델은 전자세금용과 범용을 함께 묶어 관리하도록 설계돼 있다 (`web/src/features/certificates/useCertificatesScreenModel.ts:56-175`, `web/src/features/certificates/CertificatesTab.tsx:180-220`, `web/src/features/certificates/CertificatesTab.tsx:365-421`, `web/src/features/certificates/CertificatesTab.tsx:548-604`).
- 팝빌 인증서 자동 등록은 현재 `certificateCn + password` 중심으로 로컬 헬퍼를 호출한다 (`web/src/App.tsx:5142-5214`, `web/src/local-renewal-helper.ts:251-259`, `scripts/popbill-cert-registration.ts:84-159`).
- 타입/DB 도메인 자체는 아직 범용 종류를 포함한다 (`web/src/types.ts:6`, `server/src/domain.ts:6`).

### 이번 라운드의 명확한 범위
**포함**
- 전자세금용 인증서 탐색 정확도
- 전자세금용 기준 고객 생성/갱신 정확도
- 전자세금용 인증서 링크/팝빌 등록 정확도
- 업로드/미리보기/결과 메시지의 단순화

**제외**
- 범용/개인 공동인증서 자동 연결 UX
- 범용 인증서 기반 갱신 준비/결제 우선순위 개선
- 범용 인증서용 엑셀 입력/검증/가이드
- DB 스키마에서 범용 타입 제거

### 핵심 결정
- **데이터 모델은 유지하고, 제품 흐름만 전자세금 전용으로 좁힌다.**
- 즉 `CustomerCertificateKind`의 범용 타입은 남기되 (`web/src/types.ts:6`, `server/src/domain.ts:6`), 이번 구현에서는 **초기 등록/인증서 운영의 주 경로에서 범용을 숨기거나 무시**한다.
- 이유: 지금 필요한 것은 제품 성공 경로를 빠르게 고정하는 것이지, 범용 타입 제거에 따른 광범위한 회귀 위험을 만드는 것이 아니다.

## 2. 성공 기준 (Acceptance Criteria)
1. 양식 다운로드 시 운영자에게 보이는 주 입력 대상은 **전자세금용 인증서 행만** 남는다.
2. 업로드 미리보기는 고객별로 아래만 보여준다.
   - 전자세금용 인증서 찾음/못 찾음
   - 고객 생성/갱신 가능 여부
   - 실패 사유(비밀번호 없음, 사업자 정보 읽기 실패, 중복 고객/주소 등)
3. 커밋 시 고객 생성/갱신은 **전자세금용 인증서로 읽은 사업자 정보**를 기준으로 동작한다.
4. 커밋 후 전자세금용 인증서 저장/연결은 고객당 1차 주 인증서 기준으로 안정적으로 남는다.
5. 팝빌 등록 자동화는 성공/이미 등록/실패를 고객별로 구분해 보여준다.
6. 전자세금용 인증서를 못 찾거나 중복 CN이라 자동 등록이 위험하면, **잘못 등록하지 말고 차단 + 이유 노출**한다.
7. 이번 흐름에서 범용/개인 공동인증서가 없어도 초기 등록 핵심 플로우가 끝까지 진행된다.

## 3. 구현 원칙
1. **전자세금 전용 우선**: 전자세금용이 아니면 초기 등록 핵심 플로우에 태우지 않는다.
2. **잘못된 자동화보다 명시적 차단**: CN 중복, 비밀번호 불명, 사업자 정보 미일치면 실패로 돌린다.
3. **프론트 메시지 단순화**: “범용은 나중” 같은 안내 대신, 전자세금 중심 1경로만 안내한다.
4. **기존 스키마/타입은 유지**: 이번 라운드는 제거보다 숨김/우회로 간다.
5. **대형 파일 분리 기회 활용**: `web/src/App.tsx`는 이미 과밀 지점이므로 (`docs/IMPLEMENTATION_STATUS.md:34-39`), 전자세금 온보딩 로직부터 feature 단위로 분리한다.

## 4. 구현 단계

### 단계 1. 전자세금 전용 제품 경계부터 세운다
**목적**: 제품이 범용/개인 공동인증서를 “중요 경로”로 오해하지 않게 만들기.

**변경 대상**
- `web/src/features/initial-registration/customer-onboarding-workbook.ts:181-229`
- `web/src/App.tsx:3178-3200`, `web/src/App.tsx:3220-3258`
- `web/src/features/certificates/useCertificatesScreenModel.ts:56-175`
- `web/src/features/certificates/CertificatesTab.tsx:365-421`, `web/src/features/certificates/CertificatesTab.tsx:548-604`

**실행 내용**
- 엑셀 양식에서 `공동인증서` 시트를 제거하거나 “숨은 호환 레이어”로 내리고, 운영자가 실제 작성하는 시트는 전자세금용 기준 한 장으로 정리한다.
- 다운로드/업로드/미리보기 문구에서 범용 후속 등록 안내를 제거한다.
- 인증서 탭 기본 요약/필터/스토리 카드에서 `범용 없음`을 핵심 경고로 보지 않도록 낮춘다.
- 초기 등록/인증서 탭의 핵심 KPI를 `전자세금 찾음`, `고객 생성 가능`, `팝빌 등록 필요`, `등록 완료` 중심으로 재배치한다.

**산출물**
- 제품 카피와 화면 구조가 “전자세금용 등록 경로” 하나로 정리됨.

### 단계 2. 엑셀 다운로드/업로드를 전자세금용 기준으로 재정의한다
**목적**: 운영자 입력 형식을 최소화하고, 업로드 파서도 전자세금용 기준으로 단순화.

**변경 대상**
- `web/src/features/initial-registration/customer-onboarding-workbook.ts:181-229`, `web/src/features/initial-registration/customer-onboarding-workbook.ts:237-283`
- `server/src/services/customer-onboarding-workbook-template.test.ts:73-185`
- `web/src/App.tsx:2716-3036`

**실행 내용**
- 워크북 스키마를 전자세금용 기준으로 축소한다.
  - 유지 후보 컬럼: `로컬인증서번호`, `인증서명(CN)`, `발전소명`, `인증서 비밀번호`
  - 필요 시 여기에 `확인 메모` 정도만 추가
- 파서는 기존 파일 호환을 위해 구형 `공동인증서` 시트를 읽더라도 **이번 흐름에서는 무시**하고 경고만 남긴다.
- `resolveCustomerOnboardingTemplateWorkbook`는 계속 로컬 헬퍼 인증서 목록 + preflight를 사용하되, 전자세금용이 아닌 인증서는 즉시 제외한다 (`web/src/App.tsx:2848-2958`).
- 업로드 결과는 “읽은 인증서 수 / 고객 생성 후보 수 / 차단 건수 / 차단 사유” 중심으로 재정리한다.

**산출물**
- 운영자가 채워야 할 파일이 훨씬 단순해지고, 업로드 파이프라인이 사실상 전자세금 전용으로 고정됨.

### 단계 3. 고객 생성/갱신을 전자세금 인증서 읽기 결과 중심으로 고정한다
**목적**: “고객 잘 등록 되는지”를 가장 먼저 안정화.

**변경 대상**
- `web/src/App.tsx:2897-3036`
- `server/src/services/customer-onboarding-import-service.ts:301-458`
- `server/src/services/customer-onboarding-import-service.ts:515-590`
- `server/src/services/customer-onboarding-import-service.test.ts:39-235`

**실행 내용**
- 서버 preview/commit에서 이번 온보딩 경로는 `certificateKind === "electronic_tax"`만 유효 입력으로 취급한다.
- 전자세금 인증서에서 읽은 사업자번호/상호/주소가 고객 생성의 원본이 되도록 유지한다.
- 주소 중복, 사업자번호 중복, 고객 충돌 메시지는 현재처럼 서버에서 막되 (`server/src/services/customer-onboarding-import-service.ts:331-430`), 프론트에서 고객별 액션 가능 상태를 더 분명하게 보여준다.
- `commitCustomerOnboardingPreparedEntry`는 전자세금 인증서를 주 인증서(`isPrimary`)로 저장하고, 범용 저장은 이번 경로에서 건너뛴다 (`server/src/services/customer-onboarding-import-service.ts:554-571`).

**산출물**
- 고객 생성/갱신 성공률을 전자세금 인증서 품질과 직접 연결해 볼 수 있음.

### 단계 4. 전자세금 인증서 등록 자동화를 안전하게 만든다
**목적**: “잘 찾았는데 잘못 등록되는” 사고를 막는다.

**변경 대상**
- `web/src/App.tsx:5129-5282`
- `web/src/local-renewal-helper.ts:251-259`
- `scripts/renewal-local-helper.ts:297-305`
- `scripts/popbill-cert-registration.ts:84-159`
- `web/src/features/renewal/customerRenewalCertificateUtils.ts:20-38`, `web/src/features/renewal/customerRenewalCertificateUtils.ts:182-203`

**실행 내용**
- 자동 등록 호출 payload를 `certificateCn`만이 아니라 **certificateIndex + CN + 저장된 식별값(serial/userDN)** 중심으로 확장 검토한다.
- Popbill 화면에서 동일 CN 인증서가 여러 개일 때는 자동 클릭을 강행하지 말고, **중복 감지 후 실패 처리 + 수동 선택 안내**로 바꾼다.
- 전자세금 인증서 탐색 유틸은 현재 `usageToName.includes("전자세금")` 기반이므로 (`web/src/features/renewal/customerRenewalCertificateUtils.ts:20-30`, `server/src/services/renewal-customer-sync.ts:16-18`), 실제 운영 샘플을 보고 별칭/표기 변형을 보강한다.
- 등록 후에는 기존처럼 cert status refresh를 호출하되 (`web/src/App.tsx:5192-5214`, `server/src/routes/customer-popbill-routes.ts:326-340`), 고객별 결과 로그를 더 자세히 보여준다.

**산출물**
- 자동 등록 성공률은 유지하되, 오등록 위험은 낮아짐.

### 단계 5. 화면/로직 분리로 유지보수 비용을 낮춘다
**목적**: 이번 기능을 고치면서 `App.tsx` 과밀도도 같이 줄이기.

**변경 대상**
- `web/src/App.tsx:2688-3258`, `web/src/App.tsx:5129-5282`
- 신규 후보: `web/src/features/initial-registration/useElectronicTaxOnboarding.ts`
- 신규 후보: `web/src/features/initial-registration/electronic-tax-onboarding-formatters.ts`

**실행 내용**
- 아래 묶음을 App에서 분리한다.
  - 인증서 목록 로드/캐시
  - 업로드 워크북 해석/정규화
  - onboarding preview/commit orchestration
  - 전자세금 인증서 일괄 자동 등록
- 분리 후 `InitialRegistrationTab`에는 “입력/상태 표시”, hook에는 “흐름 orchestration”만 남긴다.

**산출물**
- 이후 범용 인증서를 다시 붙이거나, 전자세금 전용 플로우를 더 다듬을 때 수정 범위가 줄어든다.

## 5. 우선순위 / 실행 순서
1. **워크북/카피 단순화** (단계 1~2)
2. **서버 preview/commit 전자세금 전용 enforcement** (단계 3)
3. **자동 등록 안전장치** (단계 4)
4. **App.tsx 분리** (단계 5)

이 순서가 좋은 이유는, 먼저 입력 형식과 성공 경로를 단순화해야 이후 등록 실패 원인을 빠르게 구분할 수 있기 때문이다.

## 6. 리스크와 대응

### 리스크 1. 기존 엑셀 양식 사용자가 갑자기 깨질 수 있음
- **대응**: 구형 `공동인증서` 시트는 1~2 릴리스 동안 read-only 호환으로 남기고, 업로드 시 “이번 라운드에서는 무시됨” 경고를 노출한다.

### 리스크 2. CN 중복 인증서에서 잘못된 팝빌 등록이 발생할 수 있음
- **대응**: 중복이면 자동 등록 차단. 정확한 선택 근거가 확보되기 전까지는 실패 처리 + 수동 안내.

### 리스크 3. 전자세금용 표기 변형 때문에 탐색 누락이 날 수 있음
- **대응**: 운영 샘플 수집 후 `deriveCustomerCertificateKind` / `isTaxCertificate` 규칙 테스트 보강.

### 리스크 4. 범용 흐름을 UI에서 숨기면 certificates 탭 일부 로직이 어색해질 수 있음
- **대응**: 데이터 모델은 유지하고, 기본 필터/카드/문구만 낮추는 방식으로 점진 전환.

## 7. 테스트 전략

### 단위 테스트
- `server/src/services/customer-onboarding-workbook-template.test.ts`
  - 전자세금 전용 양식 생성
  - 구형 범용 시트 입력 무시/경고
- `server/src/services/customer-onboarding-import-service.test.ts`
  - 전자세금 인증서만 커밋되는지
  - 주소/사업자번호 중복 차단이 유지되는지
- `web/src/features/renewal/customerRenewalCertificateUtils.test.ts`
  - 전자세금 판별 별칭
  - CN 중복/식별자 충돌 시 자동화 차단 조건

### 통합 테스트
- preview API → commit API까지 전자세금 전용 workbook으로 create/update가 맞는지
- 커밋 후 전자세금 인증서가 primary로 저장되는지
- cert-status refresh까지 이어지는지

### E2E / 스모크
- `scripts/e2e-smoke.mjs`에 전자세금 전용 온보딩 happy path 추가/보강 (`scripts/e2e-smoke.mjs:70-72`, `scripts/e2e-smoke.mjs:412`)
- 시나리오:
  1. 로컬 헬퍼에서 전자세금 인증서 1건 발견
  2. 양식 다운로드
  3. 발전소명 입력 후 업로드
  4. preview 성공
  5. commit 성공
  6. 팝빌 등록 자동화 성공 또는 already-registered
  7. 고객 목록/인증서 탭 상태 반영 확인

## 8. 완료 정의
- 운영자가 범용 인증서를 몰라도, **전자세금용 인증서만으로** 첫 고객 등록과 팝빌 등록까지 이해하고 수행할 수 있다.
- 업로드 실패 원인이 고객 단위로 보인다.
- 잘못된 자동 등록보다 “안전한 실패”가 우선된다.
- 전자세금용 인증서 발견/고객 생성/팝빌 등록 세 단계의 성공률을 각자 분리해 측정할 수 있다.
