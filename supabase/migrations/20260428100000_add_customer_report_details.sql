create table if not exists public.customer_report_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  managed_customer_id uuid not null references public.managed_customers(id) on delete cascade,
  certificate_renewal_date date,
  has_personal_general_certificate boolean not null default false,
  has_tax_invoice_business_certificate boolean not null default false,
  solar_capacity_kw numeric(10, 3),
  contract_start_month text,
  contract_end_month text,
  other_note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (managed_customer_id),
  constraint customer_report_profiles_solar_capacity_nonnegative check (
    solar_capacity_kw is null or solar_capacity_kw >= 0
  ),
  constraint customer_report_profiles_contract_start_month_format check (
    contract_start_month is null or contract_start_month ~ '^[0-9]{4}-[0-9]{2}$'
  ),
  constraint customer_report_profiles_contract_end_month_format check (
    contract_end_month is null or contract_end_month ~ '^[0-9]{4}-[0-9]{2}$'
  )
);

create index if not exists idx_customer_report_profiles_org_customer
  on public.customer_report_profiles (organization_id, managed_customer_id);

create table if not exists public.customer_report_months (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  managed_customer_id uuid not null references public.managed_customers(id) on delete cascade,
  report_year integer not null,
  report_month integer not null,
  issue_year integer,
  issue_date date,
  supply_amount numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (managed_customer_id, report_year, report_month),
  constraint customer_report_months_report_year_check check (report_year between 2000 and 2100),
  constraint customer_report_months_report_month_check check (report_month between 1 and 12),
  constraint customer_report_months_issue_year_check check (issue_year is null or issue_year between 1900 and 2200),
  constraint customer_report_months_supply_amount_nonnegative check (supply_amount >= 0),
  constraint customer_report_months_vat_amount_nonnegative check (vat_amount >= 0)
);

create index if not exists idx_customer_report_months_org_customer_year
  on public.customer_report_months (organization_id, managed_customer_id, report_year);

drop trigger if exists trg_customer_report_profiles_set_updated_at on public.customer_report_profiles;
create trigger trg_customer_report_profiles_set_updated_at
before update on public.customer_report_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_customer_report_months_set_updated_at on public.customer_report_months;
create trigger trg_customer_report_months_set_updated_at
before update on public.customer_report_months
for each row
execute function public.set_updated_at();

alter table public.customer_report_profiles enable row level security;
alter table public.customer_report_months enable row level security;

drop policy if exists customer_report_profiles_select_member on public.customer_report_profiles;
create policy customer_report_profiles_select_member
on public.customer_report_profiles
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

drop policy if exists customer_report_profiles_manage_editor on public.customer_report_profiles;
create policy customer_report_profiles_manage_editor
on public.customer_report_profiles
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

drop policy if exists customer_report_months_select_member on public.customer_report_months;
create policy customer_report_months_select_member
on public.customer_report_months
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

drop policy if exists customer_report_months_manage_editor on public.customer_report_months;
create policy customer_report_months_manage_editor
on public.customer_report_months
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
