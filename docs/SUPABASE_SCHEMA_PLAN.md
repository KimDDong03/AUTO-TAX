# AUTO-TAX Schema Reference

This file is a developer reference for the current Supabase model. The migrations are authoritative; this file exists so future development can reason about the model without reading every SQL file each time.

## 1. Source of Truth

- schema changes live in `supabase/migrations/`
- runtime access patterns live in `server/src/supabase-store.ts`
- RLS helpers and policies start in `20260326000000_initial_saas_schema.sql`

## 2. Model Groups

### Workspace and auth

- `organizations`
- `organization_members`
- `auth_user_login_index`

### Workspace settings

- `organization_settings`
- `organization_integrations`

### Managed customer domain

- `managed_customers`
- `managed_customer_plants`
- `managed_customer_match_addresses`
- `customer_certificates`

### Mail and draft domain

- `mail_sync_checkpoints`
- `inbox_messages`
- `invoice_drafts`
- `organization_completed_billing_months`

### Operational state

- `app_logs`
- `job_queue`
- `renewal_agent_heartbeats`
- `renewal_automation_jobs`
- `customer_import_profiles`

## 3. Workspace/Auth Tables

### organizations

Primary workspace record.

Important fields:

- `id`
- `name`
- `business_number`
- `plan_code`
- `status`
- `managed_customer_limit`

### organization_members

Workspace membership and role.

Important fields:

- `organization_id`
- `user_id`
- `role`
- `display_name`
- `invited_by`

Important reality:

- DB supports `owner/admin/operator/viewer`
- current product UX effectively maps to `owner` vs non-owner member workflows

### auth_user_login_index

Needed because non-platform users log in with login id, not user-facing email.

Important fields:

- `user_id`
- `login_id`
- `auth_email`
- `display_name`

## 4. Settings Tables

### organization_settings

Operational defaults for a workspace.

Important fields:

- `timezone`
- `notification_emails`
- `default_issue_day`
- `default_issue_hour`
- `default_issue_minute`
- `mail_poll_minutes`
- `mail_sync_start_at`
- `scheduler_enabled`
- `cert_last_checked_at`
- `cert_alert_last_sent_at`

### organization_integrations

Per-workspace integration settings.

Important fields:

- `imap_*`
- `smtp_*`
- `popbill_is_test`
- `popbill_user_id_prefix`
- `popbill_shared_password_encrypted`
- `operator_contact_*`
- `renewal_contact_department`
- `renewal_contact_fax`
- `renewal_issue_password_encrypted`
- `renewal_certificate_password_encrypted`

Important invariant:

- server env still overrides runtime Popbill secrets
- treat `AUTO_TAX_POPBILL_*` env as authoritative for live credentials

## 5. Managed Customer Tables

### managed_customers

The main business entity.

Important fields:

- `organization_id`
- `customer_name`
- `business_number`
- `corp_name`
- `ceo_name`
- `addr`
- `biz_type`
- `biz_class`
- `popbill_user_id`
- `popbill_password_encrypted`
- `popbill_state`
- `popbill_cert_registered`
- `popbill_cert_expire_date`
- `issue_mode`
- `issue_day`
- `issue_hour`
- `issue_minute`
- `renewal_contact_mobile`
- `memo`

Important invariant:

- uniqueness is `(organization_id, business_number)`

### managed_customer_plants

Supplemental plant-name storage.

Use:

- display/reference
- onboarding help
- historical compatibility

Do not treat this as the primary auto-match key.

### managed_customer_match_addresses

Actual auto-match substrate.

Important fields:

- `managed_customer_id`
- `match_address`
- `normalized_match_address`

Important invariant:

- this is the canonical mail-to-customer matching table

### customer_certificates

Per-customer local certificate metadata.

Important fields:

- `organization_id`
- `managed_customer_id`
- `certificate_kind`
- `certificate_name`
- `certificate_usage_name`
- `issuer_name`
- `certificate_serial`
- `certificate_user_dn`
- `certificate_oid`
- `expire_date`
- `cert_dir_path`
- `certificate_password_encrypted`
- `is_primary`
- `link_source`

## 6. Mail and Draft Tables

### mail_sync_checkpoints

Stores per-workspace per-mailbox last UID.

Important fields:

- `organization_id`
- `mailbox`
- `last_uid`

### inbox_messages

Mail ingestion and parse state.

Important fields:

- `organization_id`
- `message_uid`
- `mailbox`
- `from_address`
- `subject`
- `received_at`
- `raw_source`
- `text_body`
- `parse_status`
- `parse_error`
- `parsed_data`
- `managed_customer_id`
- `invoice_draft_id`

Current `parse_status` values:

- `pending`
- `parsed`
- `failed`
- `unmatched`
- `duplicate`
- `ignored`

### invoice_drafts

Invoice draft and issuance record.

Important fields:

- `organization_id`
- `managed_customer_id`
- `source_message_id`
- `issue_mode`
- `status`
- `scheduled_for`
- `issue_requested_at`
- `issued_at`
- `issue_error`
- `billing_month`
- `write_date`
- `item_name`
- `plant_name`
- `supply_cost`
- `tax_total`
- `total_amount`
- `kepco_*`
- `recipient_email`
- `popbill_mgt_key`
- `popbill_environment`
- `popbill_result_json`

Important invariant:

- `popbill_environment` protects against cross-environment misuse of older drafts

### organization_completed_billing_months

Allows operators to mark a billing month complete so older mail stops surfacing in current work.

## 7. Operational Tables

### app_logs

Scoped app log stream.

Important fields:

- `organization_id`
- `actor_user_id`
- `level`
- `scope`
- `message`
- `context_json`

### job_queue

Business recurring work queue.

Typical job types:

- `mail-sync`
- `auto-issue`
- `certificate-check`

Important fields:

- `organization_id`
- `managed_customer_id`
- `job_type`
- `status`
- `run_after`
- `requested_by`
- `payload`
- `result`
- `error`

### renewal_agent_heartbeats

Latest local renewal agent status snapshot.

Important fields:

- `agent_id`
- `hostname`
- `version`
- `os`
- `process_json`
- `bridge_json`
- `notes_json`
- `received_at`

### renewal_automation_jobs

Local helper / agent diagnostic queue.

Current job types:

- `bridge-probe`
- `certid-probe`
- `renewal-preflight`

Important fields:

- `type`
- `status`
- `customer_id`
- `customer_name`
- `certificate_index`
- `certificate_cn`
- `requested_by`
- `claimed_by`
- `summary`
- `error`
- `result_json`
- `comparison_profile_json`
- `submission_profile_json`
- `execute_submit`

### customer_import_profiles

Per-workspace saved import header mapping.

## 8. RLS Mental Model

The initial migration sets the pattern:

- membership check: `is_org_member`
- role check: `has_org_role`
- read policies generally require membership
- write policies generally require `owner/admin/operator`

Do not assume every later migration copied the initial pattern perfectly. When changing policies, inspect the relevant SQL file directly.

## 9. Legacy Fields

Several tables carry `legacy_id` bigint fields.

These exist for compatibility with older code paths and client-side assumptions. Do not remove them casually unless the entire app has been migrated off numeric IDs.

## 10. Current Schema Risks

- product UX and DB role matrix are not fully aligned
- some integration columns still exist for compatibility but are no longer the main runtime source
- renewal automation persistence exists outside `job_queue`, so debugging requires checking two systems
