# AUTO-TAX Schema Reference

This file is the developer reference for the current Supabase model. The migrations are authoritative. This document exists so Codex and future developers can reason about the model without rereading every SQL file first.

## 1. Source Of Truth

- Schema changes live in `supabase/migrations/`
- Main runtime access patterns live in `server/src/supabase-store.ts`
- Renewal queue persistence lives in `server/src/renewal-automation.ts`
- Retention checkpointing lives in `server/src/maintenance-retention.ts`
- Base RLS helpers and policies begin in `20260326000000_initial_saas_schema.sql`

## 2. Model Groups

### Workspace and auth

- `organizations`
- `organization_members`
- `auth_user_login_index`

### Workspace settings and integrations

- `organization_settings`
- `organization_integrations`

### Managed customer domain

- `managed_customers`
- `managed_customer_plants`
- `managed_customer_match_addresses`
- `customer_certificates`
- `customer_report_profiles`
- `customer_report_months`

### Import and onboarding

- `customer_import_profiles`
- `customer_onboarding_previews`
- `customer_onboarding_batches`
- `customer_onboarding_batch_rows`

### Mail and draft domain

- `mail_sync_checkpoints`
- `inbox_messages`
- `invoice_drafts`
- `organization_completed_billing_months`

### Operational state

- `public_consultation_requests`
- `app_logs`
- `job_queue`
- `renewal_agent_heartbeats`
- `renewal_automation_jobs`
- `platform_maintenance_runs`

## 3. Workspace And Auth Tables

### organizations

Primary workspace record.

Important fields:

- `id`
- `name`
- `business_number`
- `plan_code`
- `status`
- `managed_customer_limit`

Important reality:

- `status = churned` is used for customer-company withdrawal. Auth session resolution filters churned organizations out of selectable memberships.
- The organization row is retained for audit and historical data; member access is removed through `organization_members` deletion.

### organization_members

Workspace membership and role.

Important fields:

- `organization_id`
- `user_id`
- `role`
- `display_name`
- `invited_by`

Important reality:

- The DB supports `owner`, `admin`, `operator`, and `viewer`.
- Current product behavior mostly behaves as owner versus member.

### auth_user_login_index

Lookup table for login-id-based auth.

Important fields:

- `user_id`
- `login_id`
- `auth_email`
- `display_name`

## 4. Settings And Integration Tables

### organization_settings

Workspace-level operational defaults.

Important fields:

- `timezone`
- `notification_emails`
- `default_issue_day`
- `default_issue_hour`
- `default_issue_minute`
- `mail_poll_minutes`
- `mail_sync_start_at`
- `mail_connection_verified_at`
- `scheduler_enabled`
- `cert_last_checked_at`
- `cert_alert_last_sent_at`

Important invariants:

- `default_issue_day` defaults to `20` and controls the monthly automatic `mail-sync` dispatch schedule.
- `mail_poll_minutes` is retained only for compatibility with older payloads and stored rows. Runtime mail sync must not use it as a polling interval.

### organization_integrations

Per-workspace secret and integration settings.

Important fields:

- `imap_*`
- `smtp_*`
- `popbill_is_test`
- `popbill_user_id_prefix`
- `popbill_shared_password_encrypted`
- `renewal_contact_department`
- `renewal_contact_fax`
- `renewal_issue_password_encrypted`
- `renewal_certificate_password_encrypted`

Important invariants:

- Runtime env still overrides live Popbill secrets and customer identity defaults.
- `popbill_user_id_prefix` and `popbill_shared_password_encrypted` are retained for compatibility/internal storage, but customer workspaces no longer read or edit them; use `AUTO_TAX_POPBILL_USER_ID_PREFIX` and `AUTO_TAX_POPBILL_SHARED_PASSWORD` as the authoritative runtime values.
- `renewal_issue_password_encrypted` may remain as an encrypted workspace default for the agent path, but it must not be returned to ordinary browser responses.
- `renewal_certificate_password_encrypted` is legacy/transitional; new code should not rely on server-stored certificate passwords.

## 5. Managed Customer Tables

### managed_customers

Primary business entity for customer operations and issuance settings.

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
- `issue_complete_sms_template`
- `memo`

Important invariant:

- Uniqueness is effectively `(organization_id, business_number)`.
- `issue_mode` and issue schedule columns are legacy compatibility fields. Current product behavior treats customers as review/manual issuance only.
- `issue_complete_sms_template` stores the optional customer-specific tax-invoice issue-complete SMS/LMS body. Blank means the product default template is used.

### managed_customer_plants

Supplemental plant-name storage.

Use it for:

- display and reference
- onboarding help
- compatibility with historical workflows

Do not treat it as the primary auto-match key.

### managed_customer_match_addresses

Canonical mail-to-customer matching substrate.

Important fields:

- `managed_customer_id`
- `match_address`
- `normalized_match_address`

Important invariant:

- This is the real matching table for auto-match logic.

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

Important invariants:

- `certificate_password_encrypted` is legacy/transitional only; new flows should not store or return certificate passwords from this table.
- `cert_dir_path` is local metadata, not a certificate payload, and should be masked in logs and errors.
- RLS is read-scoped to workspace members and write-scoped to workspace editors.

### customer_report_profiles

One editable report-detail profile per managed customer.

Important fields:

- `organization_id`
- `managed_customer_id`
- `certificate_renewal_date`
- `has_personal_general_certificate`
- `has_tax_invoice_business_certificate`
- `solar_capacity_kw`
- `contract_start_month`
- `contract_end_month`
- `other_note`

Important invariants:

- There is one profile row per `managed_customer_id`.
- `contract_end_month` is derived in app code as the same month one year after `contract_start_month`.
- The Home renewal list uses this profile only: due customers are those whose derived `contract_end_month` is the current KST month or earlier.
- Renewal completion updates the same profile row by setting the next `contract_start_month` to old `contract_end_month + 1 month`; the next `contract_end_month` remains derived from that new start month.
- The table stores only operational/reporting detail; it does not store resident registration numbers.
- RLS is read-scoped to workspace members and write-scoped to workspace editors through the linked customer.

### customer_report_months

Per-customer monthly report history, grouped by report year.

Important fields:

- `organization_id`
- `managed_customer_id`
- `report_year`
- `report_month`
- `issue_year`
- `issue_date`
- `supply_amount`
- `vat_amount`

Important invariants:

- Uniqueness is `(managed_customer_id, report_year, report_month)`.
- `report_month` is constrained to `1` through `12`.
- `total_amount` is not stored. App code calculates it as `supply_amount + vat_amount`.
- RLS is read-scoped to workspace members and write-scoped to workspace editors through the linked customer.

## 6. Import And Onboarding Tables

### customer_import_profiles

Saved column-mapping profiles for the lightweight import flow.

Important fields:

- `organization_id`
- `name`
- `mapping_json`

Important invariant:

- RLS is editor-scoped because the profile is part of the import workflow, not a viewer-facing read model.

### customer_onboarding_previews

Short-lived persisted workbook preview sessions.

Important fields:

- `organization_id`
- `requested_by`
- `workbook_json`
- `preview_json`
- `entries_json`
- `expires_at`

Important invariant:

- Workbook-derived certificate passwords must be stripped before preview rows are persisted.
- RLS is editor-scoped. `viewer` members must not read or mutate persisted preview payloads.

### customer_onboarding_batches

Async onboarding commit batches.

Important fields:

- `organization_id`
- `preview_id`
- `requested_by`
- `status`
- `total_rows`
- `completed_rows`
- `created_count`
- `updated_count`
- `failed_count`
- `linked_certificate_count`
- `warnings_json`
- `failed_rows_json`
- `error`
- `started_at`
- `finished_at`

Important invariants:

- RLS is editor-scoped.
- `preview_id` must always point at a preview row from the same `organization_id`.

### customer_onboarding_batch_rows

Per-row execution state for a batch.

Important fields:

- `batch_id`
- `organization_id`
- `row_index`
- `business_number`
- `customer_name`
- `status`
- `payload_json`
- `warning_messages_json`
- `error_message`
- `customer_legacy_id`
- `linked_certificate_count`

Important invariants:

- RLS is editor-scoped through the parent batch.
- `organization_id` must stay aligned with the parent batch organization.

## 7. Mail And Draft Tables

### mail_sync_checkpoints

Stores per-workspace mailbox checkpoint state.

Important fields:

- `organization_id`
- `mailbox`
- `last_uid`

Important invariant:

- Month-bounded IMAP sync can rescan an explicit received month; duplicate `message_uid` handling remains the durable dedupe boundary.

### inbox_messages

Mail ingestion, parse, and match state.

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

Draft and issuance record.

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

Important invariants:

- `popbill_environment` protects against cross-environment misuse of old drafts.
- Pilot reporting links draft lifecycle metrics through `app_logs.context_json.draftId`; there is no separate draft metrics table.

### organization_completed_billing_months

Allows operators to mark a billing month complete so older mail stops surfacing in active worklists.

Important invariant:

- RLS is editor-scoped because completion state directly changes active operational queues.

## 8. Operational Tables

### public_consultation_requests

Anonymous consultation intake queue. It is intentionally not tied to a workspace because the workspace may not exist yet.

Important fields:

- `id`
- `name`
- `phone`
- `status`
- `note`
- `handled_by`
- `created_at`
- `updated_at`

Current `status` values:

- `new`
- `contacted`
- `workspace_opened`
- `closed`

Important invariants:

- The public form stores only name and phone.
- It does not create Supabase auth users, organization rows, or pending workspaces.
- Ops routes update status and notes with the platform admin user recorded in `handled_by`.

### app_logs

Scoped application log stream.

Important fields:

- `organization_id`
- `actor_user_id`
- `level`
- `scope`
- `message`
- `context_json`

Important invariants:

- Organization scoping stays authoritative in `organization_id`.
- Pilot issuance reporting reuses `app_logs` instead of adding a new reporting table.
- Customer contract-renewal completion is logged here with old/new contract months and the acting user context; there is no separate renewal history table.
- Passwords, secrets, and certificate-path-like values should be masked before write and again on read surfaces.

Common `context_json` keys:

- `eventType`
- `draftId`
- `customerId`
- `issueMode`
- `errorCategory`
- `errorOperation`
- `draftSource`
- `pipeline`
- `previewSource`
- `status`
- `errorCode`
- `supportCategory`
- `userFacingError`
- `errorOperation`
- `syncStage`
- `reprocessStage`
- `retryReason`
- `executionPath`
- `clickedAt`
- `issuedAt`
- `previewSnapshot`
- `issuanceSnapshot`

### job_queue

Business recurring work queue.

Typical job types:

- `mail-sync`
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

Latest local renewal agent snapshot.

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

Local certificate diagnostics and renewal preflight queue.

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
- `requested_at`
- `claimed_at`
- `finished_at`

Important invariants:

- Valid job types are `bridge-probe`, `certid-probe`, and `renewal-preflight`.
- This queue is separate from `job_queue`.
- `submission_profile_json` must not persist raw issue passwords at rest.

### platform_maintenance_runs

Checkpoint table for retention and maintenance work.

Important fields:

- `maintenance_key`
- `last_attempted_at`
- `last_completed_date`
- `last_completed_at`
- `last_summary_json`
- `last_error`

## 9. RLS Mental Model

- Workspace-scoped tables should filter by the active organization membership.
- Platform admin flows are explicit exceptions and should stay obvious in route code.
- Auth resolution and workspace scoping live in `server/src/api-access.ts`; schema and app code must agree.

## 10. Current Schema Risks And Legacy Notes

- Address matching quality depends on keeping `managed_customer_match_addresses` complete and normalized.
- DB roles are broader than the current product behavior model, which increases latent permission risk.
- Certificate-password columns exist for compatibility but should keep shrinking in importance.
- Reporting still depends on `app_logs` semantics; changing log shapes carelessly can break pilot metrics.
- Business jobs and renewal jobs are intentionally separate; do not collapse them into one abstraction without a deliberate redesign.
