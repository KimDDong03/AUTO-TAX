# AUTO-TAX Tab / Component Split Plan

이 문서는 **목표 IA를 실제 프론트 구조로 옮기기 위한 구현 설계 문서**다.

목표:

- `인증서`를 `설정`에서 분리해 **독립 탭/화면**으로 만든다
- `SettingsTab`은 **헬퍼 상태 요약만** 담당하게 줄인다
- 현재 `App.tsx`에 몰린 화면 조합 책임을 단계적으로 줄인다

관련 문서:

- `docs/WIREFRAME_ERD.md`
- `docs/SITEMAP.md`
- `docs/LOW_FI_WIREFRAMES.md`
- `docs/FEATURE_LIST.md`

---

## 1. 이번 설계에서 고정하는 결정

1. `고객 상세`의 발행 이력은 **탭 분리**
2. `인증서 상세`는 **리스트 행 인라인 확장**
3. `설정`의 헬퍼 영역은 **요약형**
4. `인증서 실무 작업`은 `settings`가 아니라 **`certificates` 탭**

---

## 2. 현재 결합 상태

현재 `web/src/App.tsx`에서 확인되는 결합:

### 2-1. 탭 구조

- `TabId = "onboarding" | "home" | "customers" | "settings" | "ops"`
- `getTabFromHash()`에서 `#certificates`를 **`settings`로 매핑**
- `resolveWorkspaceTab()`도 `certificates`를 독립 탭으로 취급하지 않음

즉, **주소/탭 레벨에서 인증서 화면이 독립 엔터티가 아님**.

### 2-2. 렌더링 구조

현재 `visibleActiveTab === "settings"`일 때:

- `<SettingsTab />`
- `<CertificatesTab />`

가 **같은 화면 안에서 연속 렌더링**된다.

즉, 지금은 `settings-screen`이 사실상:

- 설정 화면
- 인증서 작업대

를 합친 구조다.

### 2-3. 상태/자동 로딩 결합

현재 `App.tsx`의 effect 일부는 인증서/헬퍼 상태를 `settings` 탭에 묶고 있다.

대표 결합:

- `activeTab !== "settings"`일 때 헬퍼 자동 로딩 ref reset
- `activeTab === "settings" && activeSettingsSection === "helper"`일 때 헬퍼 새로고침

즉, 인증서 작업의 선행 상태 관리가 **탭 분리 전제 없이 settings 중심**으로 작성돼 있다.

### 2-4. SettingsTab 책임 초과

현재 `SettingsTab`은:

- 메일 연결
- 발행 설정
- 계정/작업공간
- 헬퍼 상태 요약

뿐 아니라, 일부 인증서 작업 흐름까지 간접적으로 끌고 있다.

예:

- `refreshAllCertificateStatuses`
- 인증서 일괄 점검 버튼

이건 목표 구조와 맞지 않는다.

---

## 3. 목표 구조

## 3-1. 목표 탭

사용자용 메인 탭:

- `home`
- `customers`
- `certificates`
- `settings`
- `onboarding`

관리자 전용:

- `ops`

## 3-2. 목표 화면 책임

### Settings

담당:

- 메일 연결
- 발행 설정
- 헬퍼 상태 요약
- 계정/작업공간

비담당:

- 인증서 리스트
- 고객-인증서 연결
- 갱신 준비
- 결제 열기

### Certificates

담당:

- 헬퍼 연결/새로고침
- 인증서 목록
- 필터/검색
- 인라인 확장 상세
- 연결/해제
- 갱신 준비/결제 열기

---

## 4. 구현 전략

한 번에 크게 갈아엎지 말고 **2단계**로 나눈다.

### Phase 1 — 탭 분리 우선

목표:

- IA와 렌더링 구조를 먼저 바로잡는다
- 동작은 최대한 유지한다

핵심:

- `certificates`를 실제 `TabId`로 추가
- `CertificatesTab`을 `settings` 렌더 분기에서 제거
- 별도 `visibleActiveTab === "certificates"` 분기에서 렌더
- `SettingsTab`에서는 인증서 작업대 책임 제거

### Phase 2 — 컴포넌트 경계 정리

목표:

- `App.tsx` 화면 조합 책임 축소
- 화면 단위 props 묶음 정리

핵심:

- `SettingsScreen` 도입
- `CertificatesScreen` 도입
- 이후 필요 시 훅 분리

---

## 5. Phase 1 상세 설계

## 5-1. 탭/라우팅 변경

대상 파일:

- `web/src/App.tsx`

변경:

1. `TabId`에 `"certificates"` 추가
2. `getTabFromHash()` 수정
   - `#certificates` → `"certificates"`
   - `#settings` → `"settings"`
3. `resolveWorkspaceTab()` 수정
   - `"certificates"`를 정상 사용자 탭으로 허용
4. 사이드바 메뉴 수정
   - primary nav: `home`, `customers`, `certificates`
   - secondary nav: `settings`, `onboarding`, `ops`

## 5-2. 액션바 변경

대상 파일:

- `web/src/App.tsx`

변경:

- `screenActionBar`에 `certificates` 항목 추가
- 기존 `settings` 액션바의 인증서 관련 의미를 헬퍼 상태 요약 중심으로 축소

추천 `certificates` 액션바:

- title: `인증서 작업`
- primaryAction:
  - 헬퍼 미연결이면 `헬퍼 상태 새로고침`
  - 연결되어 있으면 `인증서 불러오기`
- chips:
  - 읽은 인증서 수
  - 미연결 수
  - 결제 가능 수
  - 조치 필요 수

## 5-3. 렌더 분기 변경

현재:

- `visibleActiveTab === "settings"`에서 `SettingsTab` + `CertificatesTab` 함께 렌더

목표:

- `visibleActiveTab === "settings"` → `SettingsTab`만 렌더
- `visibleActiveTab === "certificates"` → `CertificatesTab` 렌더

추가:

- content class 분기에도 `content-certificates` 추가
- 필요 시 래퍼 class `certificates-screen` 추가

## 5-4. SettingsTab 책임 축소

대상 파일:

- `web/src/features/settings/SettingsTab.tsx`

유지:

- 헬퍼 연결 상태
- 버전
- 업데이트 필요 여부
- 마지막 확인 시각
- 읽은 인증서 수
- 상태 새로고침
- 인증서 화면 이동

제거:

- `refreshAllCertificateStatuses`
- `인증서 일괄 점검` CTA

추가 권장 prop:

- `openCertificates: () => void`

즉, SettingsTab은:

- "인증서를 여기서 작업"이 아니라
- "인증서 상태를 보고, 작업은 인증서 화면으로 보냄"

구조로 바꾼다.

## 5-5. 헬퍼/인증서 자동 로딩 조건 정리

대상 파일:

- `web/src/App.tsx`

현재 문제:

- helper auto-load/ref reset 로직이 `activeTab === "settings"`에 묶여 있음

목표:

- `settings`
- `certificates`
- `home`(이미 일부 존재)

중 헬퍼 상태가 필요할 때만 로딩되도록 정리

권장 규칙:

- `settings` 또는 `certificates` 진입 시 helper snapshot이 비어 있으면 로딩
- `settings/helper` 섹션에서는 요약 정보만 새로고침
- `certificates`에서는 인증서 작업 전 helper 상태가 최신이 아니면 먼저 새로고침

---

## 6. Phase 2 상세 설계

## 6-1. 새로운 화면 컴포넌트

추천 추가 파일:

- `web/src/features/settings/SettingsScreen.tsx`
- `web/src/features/certificates/CertificatesScreen.tsx`

역할:

### SettingsScreen

- `SettingsTab`에 필요한 props만 받아 연결
- settings 화면 전용 조합 책임 담당

### CertificatesScreen

- `CertificatesTab`에 필요한 props만 받아 연결
- certificates 화면 전용 조합 책임 담당

이 단계의 목적은 **UI 변경**보다 **App.tsx의 화면 조합 코드 감소**다.

## 6-2. App.tsx에 남길 책임

Phase 2 이후에도 우선 `App.tsx`에 남겨도 되는 것:

- auth/session/workspace bootstrap
- 공통 API load
- global dialog
- shared actions
- hash/tab routing
- cross-screen busyKey

## 6-3. 이후 추가 분리 후보

필요 시 다음 단계에서 분리:

- `useSettingsScreenState`
- `useCertificatesScreenState`
- `useCustomerScreenState`

하지만 **이번 단계에서 hook 분리까지 한 번에 하지 않는다**.
먼저 탭 구조를 바로잡는 것이 우선이다.

---

## 7. 파일별 변경 예상

## 7-1. 꼭 바뀌는 파일

- `web/src/App.tsx`
- `web/src/features/settings/SettingsTab.tsx`
- `web/src/features/certificates/CertificatesTab.tsx`
- `web/src/styles.css` (필요 시 `content-certificates`, `certificates-screen`)

## 7-2. 추가 생성 권장 파일

- `web/src/features/settings/SettingsScreen.tsx`
- `web/src/features/certificates/CertificatesScreen.tsx`

## 7-3. 문서

- `docs/WIREFRAME_ERD.md`
- `docs/SITEMAP.md`
- `docs/LOW_FI_WIREFRAMES.md`

현재 문서 기준은 이미 목표 구조를 반영하고 있으므로, 구현 시 기준 문서로 사용 가능하다.

---

## 8. Acceptance Criteria

다음이 만족되면 분리 1차 완료로 본다.

### 탭/화면

- [ ] 사이드바에 `인증서` 탭이 별도로 보인다
- [ ] `#certificates` 해시 진입이 가능하다
- [ ] `settings` 탭에서 더 이상 `CertificatesTab`이 렌더되지 않는다
- [ ] `certificates` 탭에서 인증서 작업 전체가 가능하다

### 설정 화면

- [ ] SettingsTab은 헬퍼 상태 요약만 보여준다
- [ ] 설정 화면에 `인증서 일괄 점검` 같은 작업대 성격 CTA가 없다
- [ ] 설정 화면에서 `인증서 화면으로 이동`이 가능하다

### 인증서 화면

- [ ] 인증서 리스트가 독립 화면에서 보인다
- [ ] 상세는 행 인라인 확장 방식이다
- [ ] 연결/해제/갱신/결제 액션이 모두 여기서 가능하다

### 상태/자동 로딩

- [ ] settings / certificates 전환 시 helper 상태가 깨지지 않는다
- [ ] home의 기존 helper snapshot 갱신 흐름이 유지된다

---

## 9. 구현 순서 추천

### Step 1

- `TabId`, hash, resolve, navItems 분리

### Step 2

- `screenActionBar.certificates` 추가
- content class 분기 추가

### Step 3

- `CertificatesTab`를 settings branch에서 제거
- certificates branch 추가

### Step 4

- `SettingsTab`에서 작업대 성격 props/CTA 제거
- `openCertificates` 연결

### Step 5

- helper auto-load 조건을 settings/certificates 기준으로 재정리

### Step 6

- 필요 시 `SettingsScreen`, `CertificatesScreen` 추가

---

## 10. 이번 단계에서 하지 않는 것

- backend API 변경
- 고객 화면 대개편
- onboarding 전체 구조 재작성
- certificate domain state hook 대수술
- styles 전면 교체

즉, 이번 설계의 목적은 **IA를 실제 렌더 구조에 맞추는 것**이다.

---

## 11. 다음 바로 이어질 작업

이 문서 다음 단계는 두 가지 중 하나다.

1. **이 설계대로 실제 코드 분리 구현 시작**
2. **구현 전에 screen-level props/파일 스켈레톤만 먼저 생성**

추천은 1번이다.
현재는 방향이 이미 충분히 고정되었고, 가장 큰 리스크가 문서보다 구현 불일치이기 때문이다.
