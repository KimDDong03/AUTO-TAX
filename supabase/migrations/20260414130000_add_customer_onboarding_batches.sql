create table if not exists public.customer_onboarding_previews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  workbook_json jsonb not null,
  preview_json jsonb not null,
  entries_json jsonb not null,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '1 day'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_onboarding_previews_org_created_idx
  on public.customer_onboarding_previews (organization_id, created_at desc);

create table if not exists public.customer_onboarding_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preview_id uuid not null references public.customer_onboarding_previews(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'queued',
  total_rows integer not null default 0,
  completed_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  failed_count integer not null default 0,
  linked_certificate_count integer not null default 0,
  warnings_json jsonb not null default '[]'::jsonb,
  failed_rows_json jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_onboarding_batches_org_status_created_idx
  on public.customer_onboarding_batches (organization_id, status, created_at desc);

create table if not exists public.customer_onboarding_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.customer_onboarding_batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  row_index integer not null,
  business_number text not null default '',
  customer_name text not null default '',
  status text not null default 'pending',
  payload_json jsonb not null,
  warning_messages_json jsonb not null default '[]'::jsonb,
  error_message text,
  customer_legacy_id bigint,
  linked_certificate_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (batch_id, row_index)
);

create index if not exists customer_onboarding_batch_rows_batch_status_idx
  on public.customer_onboarding_batch_rows (batch_id, status, row_index);
