do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'mail_parse_status' and e.enumlabel = 'ignored'
  ) then
    alter type public.mail_parse_status add value 'ignored';
  end if;
end $$;
create table if not exists public.organization_completed_billing_months (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_month text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, billing_month)
);
create index if not exists idx_completed_billing_months_org_billing_month
  on public.organization_completed_billing_months (organization_id, billing_month);
drop trigger if exists trg_completed_billing_months_set_updated_at on public.organization_completed_billing_months;
create trigger trg_completed_billing_months_set_updated_at
before update on public.organization_completed_billing_months
for each row execute function public.set_updated_at();
