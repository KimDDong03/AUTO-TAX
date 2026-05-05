update public.managed_customers
set
  issue_mode = 'review',
  issue_day = null,
  issue_hour = null,
  issue_minute = null,
  updated_at = now()
where issue_mode <> 'review'
  or issue_day is not null
  or issue_hour is not null
  or issue_minute is not null;

update public.invoice_drafts
set
  issue_mode = 'review',
  status = 'review',
  scheduled_for = null,
  updated_at = now()
where issue_mode <> 'review'
  or status = 'scheduled'
  or scheduled_for is not null;

update public.job_queue
set
  status = 'cancelled',
  error = 'auto invoice issue has been removed',
  finished_at = now(),
  updated_at = now()
where job_type = 'auto-issue'
  and status in ('queued', 'claimed', 'failed');
