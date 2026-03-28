create table if not exists public.customer_import_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  header_row_index integer not null default 0,
  field_header_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_customer_import_profiles_set_updated_at on public.customer_import_profiles;
create trigger trg_customer_import_profiles_set_updated_at
before update on public.customer_import_profiles
for each row execute function public.set_updated_at();
