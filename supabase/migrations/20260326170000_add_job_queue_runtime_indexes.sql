create index if not exists idx_job_queue_status_run_after
  on public.job_queue (status, run_after, created_at);
create index if not exists idx_invoice_drafts_status_scheduled_for
  on public.invoice_drafts (status, scheduled_for, organization_id);
