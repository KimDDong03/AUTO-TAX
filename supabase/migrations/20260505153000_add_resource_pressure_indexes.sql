create index if not exists idx_job_queue_claimed_stale
  on public.job_queue (claimed_at)
  where status = 'claimed' and claimed_at is not null;

create index if not exists idx_job_queue_org_type_status_created_at
  on public.job_queue (organization_id, job_type, status, created_at desc);

create index if not exists idx_job_queue_payload_gin
  on public.job_queue using gin (payload jsonb_path_ops);

create index if not exists idx_app_logs_context_json_gin
  on public.app_logs using gin (context_json jsonb_path_ops);

create index if not exists idx_app_logs_org_scope_created_at
  on public.app_logs (organization_id, scope, created_at desc);

create index if not exists idx_managed_customers_org_popbill_state
  on public.managed_customers (organization_id, popbill_state);

create index if not exists idx_invoice_drafts_org_customer_status
  on public.invoice_drafts (organization_id, managed_customer_id, status);
