# AUTO-TAX ERD Draft

This ERD draft is derived from the current Supabase migrations in `supabase/migrations/`
through `20260414130000_add_customer_onboarding_batches.sql`.

Conventions:

- `auth_users` is a stand-in for Supabase `auth.users`.
- For readability, many timestamps, `legacy_id`, encrypted secrets, and large JSON fields are omitted.
- `renewal_automation_jobs.customer_id` is a legacy numeric reference, not a foreign key.
- `inbox_messages` and `invoice_drafts` are conceptually paired, but the schema currently uses optional pointers rather than a strict 1:1 constraint.

## 1. Workspace / Auth / Settings

```mermaid
erDiagram
  auth_users {
    uuid id PK
    text email
  }

  auth_user_login_index {
    uuid user_id PK
    text login_id
    text auth_email
    text display_name
  }

  organizations {
    uuid id PK
    text name
    text business_number
    text plan_code
    text status
    int managed_customer_limit
  }

  organization_members {
    uuid id PK
    uuid organization_id
    uuid user_id
    text role
    text display_name
    uuid invited_by
  }

  organization_settings {
    uuid organization_id PK
    text timezone
    int default_issue_day
    int mail_poll_minutes
    bool scheduler_enabled
    datetime mail_connection_verified_at
  }

  organization_integrations {
    uuid organization_id PK
    text imap_host
    text smtp_host
    bool popbill_is_test
    text popbill_user_id_prefix
    text operator_contact_email
  }

  customer_import_profiles {
    uuid organization_id PK
    int header_row_index
    jsonb field_header_map
  }

  auth_users ||--o| auth_user_login_index : login_index
  auth_users ||--o{ organization_members : member_user
  auth_users o|--o{ organization_members : invited_by
  organizations ||--o{ organization_members : has
  organizations ||--o| organization_settings : has
  organizations ||--o| organization_integrations : has
  organizations ||--o| customer_import_profiles : has
```

## 2. Customer / Mail / Billing Flow

```mermaid
erDiagram
  organizations {
    uuid id PK
    text name
  }

  managed_customers {
    uuid id PK
    uuid organization_id
    text customer_name
    text business_number
    text popbill_user_id
    text popbill_state
    text issue_mode
    text renewal_contact_mobile
  }

  managed_customer_plants {
    uuid id PK
    uuid managed_customer_id
    text plant_name
    text normalized_plant_name
  }

  managed_customer_match_addresses {
    uuid id PK
    uuid managed_customer_id
    text match_address
    text normalized_match_address
  }

  customer_certificates {
    uuid id PK
    uuid organization_id
    uuid managed_customer_id
    text certificate_kind
    text certificate_name
    text issuer_name
    date expire_date
    bool is_primary
    text link_source
  }

  inbox_messages {
    uuid id PK
    uuid organization_id
    text message_uid
    text mailbox
    datetime received_at
    text parse_status
    uuid managed_customer_id
    uuid invoice_draft_id
  }

  invoice_drafts {
    uuid id PK
    uuid organization_id
    uuid managed_customer_id
    uuid source_message_id
    text status
    text billing_month
    text item_name
    numeric total_amount
    text popbill_mgt_key
    text popbill_environment
  }

  mail_sync_checkpoints {
    uuid id PK
    uuid organization_id
    text mailbox
    bigint last_uid
  }

  organization_completed_billing_months {
    uuid id PK
    uuid organization_id
    text billing_month
  }

  organizations ||--o{ managed_customers : has
  managed_customers ||--o{ managed_customer_plants : has
  managed_customers ||--o{ managed_customer_match_addresses : matches_by
  organizations ||--o{ customer_certificates : scopes
  managed_customers ||--o{ customer_certificates : owns
  organizations ||--o{ inbox_messages : receives
  managed_customers o|--o{ inbox_messages : matched_to
  organizations ||--o{ invoice_drafts : has
  managed_customers ||--o{ invoice_drafts : billed_for
  inbox_messages o|--o{ invoice_drafts : source_message
  organizations ||--o{ mail_sync_checkpoints : checkpoints
  organizations ||--o{ organization_completed_billing_months : completes
```

## 3. Onboarding / Operations

```mermaid
erDiagram
  auth_users {
    uuid id PK
    text email
  }

  organizations {
    uuid id PK
    text name
  }

  managed_customers {
    uuid id PK
    uuid organization_id
    text customer_name
  }

  app_logs {
    uuid id PK
    uuid organization_id
    uuid actor_user_id
    text level
    text scope
    text message
  }

  job_queue {
    uuid id PK
    uuid organization_id
    uuid managed_customer_id
    text job_type
    text status
    datetime run_after
    uuid requested_by
  }

  customer_onboarding_previews {
    uuid id PK
    uuid organization_id
    uuid requested_by
    jsonb workbook_json
    jsonb preview_json
    datetime expires_at
  }

  customer_onboarding_batches {
    uuid id PK
    uuid organization_id
    uuid preview_id
    uuid requested_by
    text status
    int total_rows
    int completed_rows
    int created_count
    int updated_count
    int failed_count
  }

  customer_onboarding_batch_rows {
    uuid id PK
    uuid batch_id
    uuid organization_id
    int row_index
    text business_number
    text customer_name
    text status
  }

  renewal_agent_heartbeats {
    text agent_id PK
    text hostname
    text version
    text os
    datetime received_at
  }

  renewal_automation_jobs {
    bigint id PK
    text type
    text status
    int customer_id
    text customer_name
    int certificate_index
    text certificate_cn
    text requested_by
  }

  platform_maintenance_runs {
    text maintenance_key PK
    datetime last_attempted_at
    date last_completed_date
    datetime last_completed_at
  }

  organizations ||--o{ app_logs : has
  auth_users o|--o{ app_logs : actor
  organizations ||--o{ job_queue : runs
  managed_customers o|--o{ job_queue : target_customer
  auth_users o|--o{ job_queue : requested_by
  organizations ||--o{ customer_onboarding_previews : owns
  auth_users o|--o{ customer_onboarding_previews : requested_by
  organizations ||--o{ customer_onboarding_batches : owns
  customer_onboarding_previews ||--o{ customer_onboarding_batches : materializes
  auth_users o|--o{ customer_onboarding_batches : requested_by
  customer_onboarding_batches ||--o{ customer_onboarding_batch_rows : contains
  organizations ||--o{ customer_onboarding_batch_rows : scopes
```

## Notes

- `managed_customer_match_addresses` is the canonical customer auto-match table.
- `managed_customer_plants` is supplemental display/reference data, not the primary match key.
- `customer_certificates` is the only customer-level certificate table with an actual foreign key to `managed_customers`.
- `renewal_agent_heartbeats`, `renewal_automation_jobs`, and `platform_maintenance_runs` are operational tables; only the first two are renewal-helper-specific.
- `renewal_automation_jobs.customer_id` is intentionally left unconnected in the ERD because it is not a real FK to `managed_customers.id`.
- Several tables also carry `legacy_id bigint` fields for compatibility; they are omitted here to keep the diagram readable.
