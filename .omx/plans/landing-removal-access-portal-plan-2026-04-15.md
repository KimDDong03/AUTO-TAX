# 랜딩 페이지 제거 + 고객 전용 접속 포털 전환 계획 (2026-04-15)

## 1. Requirements Summary
- 온라인 홍보용 랜딩은 제거하고, 제품의 공개 표면을 **고객 전용 접속 포털**로 재정의한다.
- 오프라인 영업으로 계약한 회사만 들어오는 구조이므로 공개 화면의 목적은 `홍보`가 아니라 `접속 / 계약 완료 고객 안내 / 최소한의 지원 안내`여야 한다.
- 현재 비로그인 진입은 `PublicLanding` 한 장에 홍보/가격/운영 소개/문의/로그인을 모두 담고 있으므로 분리가 필요하다 (`web/src/App.tsx:4870-4895`, `web/src/features/public/PublicLanding.tsx:107-549`).
- 현재 공개 영역 기능으로 문서화된 범위도 랜딩·요금·문의·로그인 중심이라 제품 방향과 맞지 않는다 (`docs/FEATURE_LIST.md:280-285`, `docs/SITEMAP.md:86-94`).

## 2. Current-State Findings
1. 비로그인 사용자는 루트에서 바로 `PublicLanding`을 본다 (`web/src/App.tsx:4870-4895`).
2. `PublicLanding`에는 아래 공개 마케팅/세일즈 요소가 함께 있다.
   - 히어로 + 제품 미리보기 (`web/src/features/public/PublicLanding.tsx:131-238`)
   - 로그인 + 도입 문의 폼 (`web/src/features/public/PublicLanding.tsx:240-371`)
   - 운영 방식 소개 (`web/src/features/public/PublicLanding.tsx:373-427`)
   - 가격 계산기 + 플랜 비교 + FAQ (`web/src/features/public/PublicLanding.tsx:429-549`)
3. 도입 문의는 실제 공개 API에 연결되어 있고 익명 허용 경로로 분류된다 (`web/src/App.tsx:2441-2467`, `server/src/routes/core-routes.ts:94-110`, `server/src/api-access.ts:26-32`).
4. 공개 로그인은 별도 엔드포인트로 유지되고, 이 흐름은 현재 제품의 핵심 데이터 플로우로 문서화되어 있다 (`server/src/routes/core-routes.ts:113-139`, `docs/IMPLEMENTATION.md:132-139`).
5. 스모크/운영 문서도 랜딩 렌더링을 전제로 한다 (`scripts/public-landing-smoke.mjs:34-120`, `docs/OPERATIONS.md:177-184`).
6. 비밀번호 재설정은 "재설정 메일로 들어왔을 때의 후속 화면"만 있고, 공개 화면에서 재설정 요청을 시작하는 UX는 보이지 않는다 (`web/src/App.tsx:4789-4865`).

## 3. Decision Drivers
1. **영업 방식 적합성**: 온라인 홍보를 하지 않으므로 공개 루트가 세일즈 랜딩일 이유가 없다.
2. **표면 축소**: 랜딩/문의/가격 계산기/FAQ를 걷어내면 공개 표면과 문서/테스트/스타일 범위가 크게 줄어든다 (`web/src/features/public/PublicLanding.tsx:107-549`, `web/src/styles.css:7768-9125`).
3. **운영 명확성**: 계약 완료 고객에게는 “어디서 로그인하고, 계정 없으면 누구에게 연락하고, 첫 접속 후 무엇을 해야 하는지”만 빠르게 보여주는 것이 더 적합하다.

## 4. Viable Options

### Option A. 로그인만 남기는 초미니 포털
- 구성: 로고, 로그인 폼, 오류 메시지, 아주 짧은 도움말만 제공
- 장점: 가장 단순하고 구현 범위가 작다
- 단점: 계약 막 끝난 고객이나 비밀번호 문제를 겪는 고객이 다음 행동을 알기 어렵다

### Option B. 고객 전용 접속 포털 + 계약 완료 고객 안내 (**권장**)
- 구성: 로그인 카드 + "처음 사용하는 고객" 안내 + "도움이 필요할 때" 안내
- 장점: 랜딩 성격은 없애면서도 영업 완료 후 인수인계 UX를 유지할 수 있다
- 단점: A안보다 약간의 안내 문구/화면 설계가 더 필요하다

### Option C. 공개 루트는 빈 로그인만 두고, 도입/초기안내는 별도 문서(PDF/Notion)로 완전 분리
- 구성: 제품 내 공개 표면은 로그인 전용, 모든 도입 안내는 영업 자료로 처리
- 장점: 웹앱 공개 표면이 최소화된다
- 단점: 고객이 링크 하나만 받아도 필요한 정보를 다 얻기 어려워 영업/운영 의존도가 커진다

## 5. Recommended Product Shape
**Option B를 추천한다.**

이유:
- 온라인 홍보를 없애려는 목적은 달성하면서도, 계약 완료 후 고객이 루트 URL에 들어왔을 때 길을 잃지 않는다.
- 현재 이미 공개 로그인 플로우는 핵심으로 유지해야 한다 (`docs/IMPLEMENTATION.md:132-139`).
- 반면 공개 문의/가격/FAQ는 직접 영업 구조와 어긋난다 (`docs/FEATURE_LIST.md:280-285`).

## 6. Recommended IA / Screen Composition

### 공개 루트(`/`)의 새 역할
**서비스 소개 페이지**가 아니라 **고객 전용 접속 포털**로 바꾼다.

### 화면 구성
1. **상단 헤더**
   - 브랜드명: `AUTO-TAX`
   - 한 줄 설명: `고객 전용 접속 포털`
   - 불필요한 상단 탐색(운영 방식/가격/로그인 섹션 점프) 제거

2. **메인 1열 또는 2열 레이아웃**
   - **왼쪽/상단: 로그인 카드**
     - 로그인 계정
     - 비밀번호
     - 로그인 버튼
     - 로그인 오류/공지
   - **오른쪽/하단: 계약 완료 고객 안내 카드**
     - 누가 이 화면을 써야 하는지
     - 계정 전달 방식(영업/운영 담당자가 발급)
     - 첫 로그인 후 무엇을 확인하는지
       - 작업공간 접속
       - 고객 등록/메일 연결
       - 인증서 준비
   - **보조 도움 카드**
     - 비밀번호/계정 문제 시 연락 경로
     - 응답 시간 또는 담당 채널
     - 필요하면 “재설정 메일은 운영 담당자가 다시 발송” 문구

3. **제거할 요소**
   - 히어로/제품 미리보기
   - 운영 방식 소개 섹션
   - 가격 계산기 / 플랜 비교
   - FAQ
   - 공개 도입 문의 폼

## 7. Content Strategy
- 공개 카피는 “왜 좋은 서비스인지”가 아니라 “누가 어떻게 들어오는지”만 설명한다.
- 추천 카피 톤:
  - 제목: `AUTO-TAX 고객 전용 접속`
  - 설명: `계약이 완료된 고객사가 세금계산서 운영 작업공간에 로그인하는 화면입니다.`
  - 보조 문구: `계정이 아직 없거나 접속이 안 되면 담당 영업/운영자에게 요청하세요.`
- 가격/도입/FAQ는 웹앱 밖의 영업 자료로 이동한다.
- 만약 가격 계산 로직이 영업에서 계속 필요하면, 공개 루트가 아니라 **ops 내부 견적 도구** 또는 별도 세일즈 문서로 옮긴다 (`web/src/App.tsx:798-807`, `web/src/App.tsx:1633-1634`, `web/src/features/public/public-content.ts:295-300`).

## 8. API / Policy Direction

### 유지
- `POST /api/public/login`은 유지 (`server/src/routes/core-routes.ts:113-139`).

### 제거 또는 내부화 권장
- `POST /api/public/support-request`는 공개 영업 구조를 전제로 하므로 제거 후보 1순위 (`server/src/routes/core-routes.ts:94-110`).
- 함께 정리할 것:
  - 익명 허용 경로에서 `/public/support-request` 제거 (`server/src/api-access.ts:26-32`)
  - rate limiter 정리 (`server/src/main.ts:717-728`)
  - `sendSupportRequest` 연결부 사용 여부 재검토 (`server/src/main.ts:63`, `server/src/main.ts:717-722`)

### 비밀번호 지원
- 현재는 recovery 링크로 진입한 후속 화면만 있다 (`web/src/App.tsx:4789-4865`).
- 따라서 공개 포털에는 self-service reset CTA를 성급히 넣기보다, 1차로는 운영 연락 경로를 두는 편이 안전하다.
- 이후 필요하면 별도 2차 과제로 “재설정 메일 다시 받기”를 추가한다.

## 9. Implementation Steps
1. **공개 진입 UX 재정의**
   - `PublicLanding`을 `CustomerAccessPortal` 성격으로 축소하거나 새 컴포넌트로 대체
   - 대상 파일: `web/src/App.tsx:4870-4895`, `web/src/features/public/PublicLanding.tsx:24-549`
2. **비로그인 상태 state 정리**
   - `supportRequestForm`, 가격 계산, 랜딩 스크롤 유틸, 문의 열기 로직 제거 또는 축소
   - 대상 파일: `web/src/App.tsx:793-818`, `web/src/App.tsx:1633-1634`, `web/src/App.tsx:2441-2488`
3. **공개 카피/콘텐츠 모듈 정리**
   - `public-content.ts`에서 랜딩 전용 데이터 삭제
   - 가격 로직이 더 이상 공개에서 안 쓰이면 이동 또는 삭제
   - 대상 파일: `web/src/features/public/public-content.ts`
4. **스타일 대청소**
   - `.landing-*` 대규모 스타일 제거 후, auth-shell 계열 중심의 소형 스타일만 남김
   - 대상 파일: `web/src/styles.css:7768-9125`
5. **공개 문의 제거 시 서버 정리**
   - `/api/public/support-request`, limiter, 익명 접근 whitelist, 메일 발송 연결 정리
   - 대상 파일: `server/src/routes/core-routes.ts:94-110`, `server/src/api-access.ts:26-32`, `server/src/main.ts:717-722`
6. **문서/사이트맵/체크리스트 업데이트**
   - 공개 사이트맵을 "랜딩"에서 "고객 전용 접속"으로 변경
   - 대상 파일: `docs/SITEMAP.md:86-94`, `docs/FEATURE_LIST.md:280-285`, `docs/OPERATIONS.md:177-184`, `docs/IMPLEMENTATION.md:132-139`, `docs/IMPLEMENTATION.md:226-227`
7. **스모크 테스트 교체**
   - `public-landing-smoke`를 `public-access-portal-smoke` 성격으로 바꿔 로그인 화면 존재와 오류 처리만 검증
   - 대상 파일: `scripts/public-landing-smoke.mjs:34-120`

## 10. Acceptance Criteria
- 비로그인 진입 시 공개 루트에는 홍보성 섹션(히어로/운영 방식/가격/FAQ/문의 폼)이 나타나지 않는다.
- 비로그인 진입 시 로그인 폼은 즉시 보이고, 기존 공개 로그인 API로 로그인 가능하다.
- 계약 완료 고객이 봐야 할 최소 안내(누가 쓰는지, 계정 없을 때 연락 경로, 첫 접속 후 해야 할 일)가 한 화면 안에 있다.
- 공개 문의를 제거하기로 결정하면 `/api/public/support-request`와 관련 익명 허용/문서/테스트가 함께 정리된다.
- 운영 문서와 스모크 체크리스트는 더 이상 "랜딩 페이지 렌더링"을 성공 기준으로 삼지 않는다.

## 11. Risks and Mitigations
- **리스크: 신규 계약 고객이 첫 접속에서 길을 잃을 수 있음**
  - 대응: 로그인 카드 옆에 계약 완료 고객용 3단계 안내를 둔다.
- **리스크: 문의 폼 제거 후 지원 채널이 사라질 수 있음**
  - 대응: 공개 문의를 없애는 대신 담당 채널/연락 문구를 반드시 남긴다.
- **리스크: 가격 계산기 삭제 후 영업팀이 불편해질 수 있음**
  - 대응: 가격 로직이 필요하면 공개 화면이 아니라 ops 내부 도구나 외부 영업 문서로 이동한다.
- **리스크: CSS/문서/스모크가 남아 반쪽 제거가 될 수 있음**
  - 대응: UI 제거와 문서/테스트 제거를 같은 배치로 묶는다.

## 12. Verification Steps
1. 비로그인 상태에서 `/` 진입 시 로그인 카드와 고객용 안내만 보이는지 확인
2. 잘못된 로그인 정보 입력 시 오류 메시지가 기존처럼 보이는지 확인 (`/api/public/login` 유지)
3. recovery 링크 진입 시 비밀번호 재설정 화면이 계속 정상 동작하는지 확인 (`web/src/App.tsx:4789-4865`)
4. 공개 문의를 제거했다면 관련 API가 제거되었거나 내부 전용으로 바뀌었는지 확인
5. `npm run check`
6. `npm run test:server`
7. 공개 스모크 스크립트(이름 변경 시 새 스크립트) 실행

## 13. Recommended Rollout Order
- **1차**: 공개 루트를 고객 전용 접속 포털로 축소
- **2차**: 공개 문의 제거 및 서버/API/문서 정리
- **3차**: 가격 계산 필요 여부 판단 후 내부 견적 도구 이관 또는 완전 삭제

## ADR
- **Decision**: 공개 랜딩을 제거하고, 루트 진입을 고객 전용 접속 포털로 전환한다.
- **Drivers**: 오프라인 직영업 방식, 공개 표면 축소, 계약 완료 고객 UX 단순화.
- **Alternatives considered**:
  - 로그인만 남기는 초미니 포털
  - 고객 전용 접속 포털 + 계약 완료 고객 안내
  - 공개 루트 최소화 + 외부 문서 완전 분리
- **Why chosen**: 로그인만 남기면 처음 들어오는 계약 고객이 막히고, 외부 문서 완전 분리는 운영 의존도가 너무 높다. 접속 포털 + 최소 안내가 균형점이다.
- **Consequences**: 공개 세일즈 요소와 관련 API/문서/테스트/스타일을 함께 걷어낼 수 있지만, 고객 지원 문구와 첫 접속 안내는 새로 설계해야 한다.
- **Follow-ups**:
  1. 공개 문의를 진짜 삭제할지, 담당 채널 안내로 대체할지 최종 결정
  2. 가격 계산 로직의 내부 존치 여부 결정
  3. 필요 시 self-service 비밀번호 재설정 요청 UX를 별도 과제로 추가
