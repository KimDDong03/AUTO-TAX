alter table public.organizations
  add column if not exists managed_customer_limit integer not null default 50;
