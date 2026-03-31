alter table if exists public.managed_customers
  add column if not exists renewal_contact_mobile text not null default '';
