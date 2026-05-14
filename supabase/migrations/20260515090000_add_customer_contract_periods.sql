create table if not exists public.customer_contract_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  managed_customer_id uuid not null references public.managed_customers(id) on delete cascade,
  contract_start_date date not null,
  contract_end_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (managed_customer_id, contract_start_date, contract_end_date),
  constraint customer_contract_periods_valid_range check (contract_end_date >= contract_start_date)
);

create index if not exists idx_customer_contract_periods_org_customer_start
  on public.customer_contract_periods (organization_id, managed_customer_id, contract_start_date);

drop trigger if exists trg_customer_contract_periods_set_updated_at on public.customer_contract_periods;
create trigger trg_customer_contract_periods_set_updated_at
before update on public.customer_contract_periods
for each row
execute function public.set_updated_at();

insert into public.customer_contract_periods (
  organization_id,
  managed_customer_id,
  contract_start_date,
  contract_end_date
)
select
  organization_id,
  managed_customer_id,
  (contract_start_month || '-01')::date as contract_start_date,
  (date_trunc('month', (contract_end_month || '-01')::date) + interval '1 month - 1 day')::date as contract_end_date
from public.customer_report_profiles
where contract_start_month ~ '^[0-9]{4}-[0-9]{2}$'
  and contract_end_month ~ '^[0-9]{4}-[0-9]{2}$'
on conflict (managed_customer_id, contract_start_date, contract_end_date) do nothing;

alter table public.customer_contract_periods enable row level security;

drop policy if exists customer_contract_periods_select_member on public.customer_contract_periods;
create policy customer_contract_periods_select_member
on public.customer_contract_periods
for select
to authenticated
using (
  exists (
    select 1
    from public.managed_customers customer
    where customer.id = managed_customer_id
      and customer.organization_id = organization_id
      and public.is_org_member(customer.organization_id)
  )
);

drop policy if exists customer_contract_periods_manage_editor on public.customer_contract_periods;
create policy customer_contract_periods_manage_editor
on public.customer_contract_periods
for all
to authenticated
using (
  exists (
    select 1
    from public.managed_customers customer
    where customer.id = managed_customer_id
      and customer.organization_id = organization_id
      and public.has_org_role(customer.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
)
with check (
  exists (
    select 1
    from public.managed_customers customer
    where customer.id = managed_customer_id
      and customer.organization_id = organization_id
      and public.has_org_role(customer.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
);
