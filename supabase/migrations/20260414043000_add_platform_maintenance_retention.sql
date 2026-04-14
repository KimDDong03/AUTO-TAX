create table if not exists public.platform_maintenance_runs (
  maintenance_key text primary key,
  last_attempted_at timestamptz,
  last_completed_date date,
  last_completed_at timestamptz,
  last_summary_json jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_platform_maintenance_runs_last_completed_date
  on public.platform_maintenance_runs (last_completed_date desc nulls last);
drop trigger if exists trg_platform_maintenance_runs_set_updated_at on public.platform_maintenance_runs;
create trigger trg_platform_maintenance_runs_set_updated_at
before update on public.platform_maintenance_runs
for each row
execute function public.set_updated_at();

alter table public.platform_maintenance_runs enable row level security;

create index if not exists idx_app_logs_created_at
  on public.app_logs (created_at);

create index if not exists idx_job_queue_terminal_finished_at
  on public.job_queue (finished_at)
  where status in ('completed', 'failed', 'cancelled') and finished_at is not null;
create index if not exists idx_renewal_automation_jobs_terminal_finished_at
  on public.renewal_automation_jobs (finished_at)
  where status in ('completed', 'failed') and finished_at is not null;
