# AUTO-TAX Supabase 스키마 설계안

## 1. 목적

이 문서는 AUTO-TAX를 `Vercel + Supabase` 기반 SaaS로 전환할 때 필요한 초기 데이터 구조를 정리하기 위한 문서이다.

이전 로컬 DB 중심 구조는 단일 운영자 기준이라, 앞으로는 아래 구조를 기준으로 다시 잡는다.

- 고객사
- 고객사 사용자
- 관리 고객
- 메일 수집 이력
- 세금계산서 초안 / 발행 이력
- 인증서 상태
- 운영 로그
- 백그라운드 작업 큐

## 2. 설계 원칙

### 2-1. 고객사 단위 데이터 분리

모든 핵심 데이터는 `고객사(organization)` 기준으로 분리한다.

즉 한 고객사의 사용자는 자기 고객사 데이터만 볼 수 있어야 한다.

### 2-2. 사용자와 데이터 소유 분리

사용자 계정은 Supabase Auth 기준으로 관리하고, 실제 업무 데이터는 `public` 스키마 테이블에서 고객사 ID를 기준으로 관리한다.

### 2-3. 현재 기능과의 연속성 유지

이전 단일 DB 구조에서 쓰던 핵심 개념은 그대로 유지한다.

- 고객
- 발전소명
- 메일 수집
- 초안 생성
- 검수 후 발행
- 인증서 상태
- 로그

다만 SaaS 구조에 맞게 `고객사`라는 상위 단위를 추가한다.

### 2-4. 민감 정보 분리

비밀번호나 외부 연동 키는 평문 저장을 피한다.

초기 설계 기준:

- DB에는 암호화된 값만 저장
- 실제 복호화는 서버 전용 권한에서만 처리
- 일반 사용자 화면에서는 원문 노출 금지

## 3. 이전 구조와 매핑

| 현재 구조 | Supabase 목표 구조 |
| --- | --- |
| `app_settings` | `organization_settings` |
| `customers` | `managed_customers` |
| `customer_plants` | `managed_customer_plants` |
| `customer_match_addresses` | `managed_customer_match_addresses` |
| `inbox_messages` | `inbox_messages` |
| `invoice_drafts` | `invoice_drafts` |
| `logs` | `app_logs` |
| 단일 운영자 | `organizations` + `organization_members` |

## 4. 핵심 테이블 구조

### 4-1. organizations

AUTO-TAX를 구독하는 태양광 회사

주요 컬럼:

- id
- name
- business_number
- plan_code
- status
- created_at
- updated_at

### 4-2. organization_members

고객사 내부 사용자와 역할

주요 컬럼:

- organization_id
- user_id
- role
- display_name
- invited_by
- created_at

역할 예시:

- owner
- admin
- operator
- viewer

### 4-3. organization_settings

고객사별 운영 설정

주요 컬럼:

- organization_id
- timezone
- notification_emails
- default_issue_day
- default_issue_hour
- default_issue_minute
- mail_poll_minutes
- mail_sync_start_at
- scheduler_enabled

### 4-4. organization_integrations

고객사별 메일/팝빌 연동 설정

주요 컬럼:

- organization_id
- imap_host
- imap_port
- imap_secure
- imap_user
- imap_pass_encrypted
- imap_mailbox
- smtp_host
- smtp_port
- smtp_secure
- smtp_user
- smtp_pass_encrypted
- smtp_from_name
- smtp_from_email
- popbill_link_id
- popbill_secret_key_encrypted
- popbill_partner_corp_num
- popbill_user_id_prefix
- popbill_shared_password_encrypted
- operator_contact_name
- operator_contact_email
- operator_contact_tel

### 4-5. managed_customers

고객사가 실제로 관리하는 발행 대상 고객

주요 컬럼:

- organization_id
- customer_name
- business_number
- corp_name
- ceo_name
- addr
- biz_type
- biz_class
- popbill_user_id
- popbill_password_encrypted
- popbill_state
- popbill_cert_registered
- popbill_cert_expire_date
- issue_mode
- issue_day
- issue_hour
- issue_minute
- memo

### 4-6. managed_customer_plants

관리 고객의 발전소명 목록

주요 컬럼:

- managed_customer_id
- plant_name
- normalized_plant_name

### 4-7. managed_customer_match_addresses

관리 고객의 주소 매칭 규칙

주요 컬럼:

- managed_customer_id
- match_address
- normalized_match_address

### 4-8. inbox_messages

메일 수집 및 처리 이력

주요 컬럼:

- organization_id
- message_uid
- mailbox
- from_address
- subject
- received_at
- raw_source
- text_body
- parse_status
- parse_error
- parsed_data
- managed_customer_id
- invoice_draft_id

### 4-9. invoice_drafts

세금계산서 초안과 발행 상태

주요 컬럼:

- organization_id
- managed_customer_id
- source_message_id
- issue_mode
- status
- scheduled_for
- issue_requested_at
- issued_at
- issue_error
- billing_month
- write_date
- item_name
- plant_name
- supply_cost
- tax_total
- total_amount
- kepco 정보 컬럼
- recipient_email
- popbill_mgt_key
- popbill_result_json

### 4-10. app_logs

고객사 기준 운영 로그

주요 컬럼:

- organization_id
- actor_user_id
- level
- scope
- message
- context_json
- created_at

### 4-11. job_queue

메일 동기화, 자동 발행, 인증서 점검 등의 백그라운드 작업

주요 컬럼:

- organization_id
- managed_customer_id
- job_type
- status
- run_after
- requested_by
- payload
- result
- error

## 5. 왜 job_queue가 필요한가

현재 구조는 서버 내부에서 계속 돌아가는 스케줄러에 의존한다.

하지만 Vercel 구조에서는 상시 실행 방식보다 `작업을 큐에 넣고, 따로 처리하는 구조`가 더 안전하다.

따라서 아래 작업은 `job_queue` 기반으로 전환하는 것이 맞다.

- 메일 동기화
- 자동 발행
- 인증서 상태 점검
- 알림 발송

## 6. 인증서 관련 데이터 처리

초기 단계에서는 `managed_customers`에 아래 컬럼을 그대로 두어 현재 기능과의 연속성을 유지한다.

- popbill_cert_registered
- popbill_cert_expire_date

이후 인증서 이력과 갱신 절차가 커지면 별도 테이블로 분리할 수 있다.

예:

- certificate_records
- certificate_renewal_jobs
- certificate_alert_history

## 7. 권한 구조 원칙

Supabase RLS 기준 원칙은 아래와 같다.

- 사용자는 자기 고객사의 데이터만 조회 가능
- owner / admin만 설정 수정 가능
- operator는 실무 데이터 수정 가능
- viewer는 조회만 가능

즉 `organization_members`의 역할을 기준으로 정책을 건다.

## 8. 현재 코드 기준 우선 전환 대상

현재 코드에서 가장 먼저 바꿔야 하는 부분은 아래다.

1. `Store` 클래스
2. 이전 단일 DB 테이블 생성 로직 제거
3. 전역 `app_settings` 구조
4. 단일 고객 배열 기준 조회 로직
5. 서버 내부 스케줄러

## 9. 초기 마이그레이션 범위

첫 Supabase 마이그레이션에서는 아래까지만 만드는 것이 적절하다.

- organizations
- organization_members
- organization_settings
- organization_integrations
- managed_customers
- managed_customer_plants
- managed_customer_match_addresses
- inbox_messages
- invoice_drafts
- app_logs
- job_queue
- updated_at 트리거
- 기본 RLS 함수 및 정책

## 10. 다음 작업

이 문서 다음으로 바로 이어질 작업은 아래다.

1. Supabase 초기 SQL 마이그레이션 작성
2. 타입 정의를 Supabase 기준으로 재구성
3. 현재 `Store` API와 Supabase 테이블 매핑표 작성
4. 고객사 권한별 화면 접근 정책 정리
