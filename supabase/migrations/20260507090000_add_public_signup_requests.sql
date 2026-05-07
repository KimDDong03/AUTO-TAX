do $$
begin
  if not exists (select 1 from pg_type where typname = 'public_signup_request_status') then
    create type public.public_signup_request_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.public_signup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  login_id text not null,
  auth_email text not null,
  organization_name text not null,
  name text not null,
  phone text not null,
  kepco_email text not null,
  status public.public_signup_request_status not null default 'pending',
  marketing_consent boolean not null default false,
  terms_version text not null,
  privacy_version text not null,
  third_party_version text not null,
  marketing_version text,
  terms_accepted_at timestamptz not null,
  privacy_accepted_at timestamptz not null,
  third_party_accepted_at timestamptz not null,
  marketing_accepted_at timestamptz,
  request_ip text not null default '',
  request_user_agent text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint public_signup_requests_login_id_lowercase check (login_id = lower(login_id))
);

create unique index if not exists public_signup_requests_user_id_key
  on public.public_signup_requests (user_id);

create unique index if not exists public_signup_requests_login_id_key
  on public.public_signup_requests (login_id);

create unique index if not exists public_signup_requests_auth_email_key
  on public.public_signup_requests (auth_email);

create index if not exists idx_public_signup_requests_status_created_at
  on public.public_signup_requests (status, created_at desc);

drop trigger if exists trg_public_signup_requests_set_updated_at on public.public_signup_requests;
create trigger trg_public_signup_requests_set_updated_at
before update on public.public_signup_requests
for each row execute function public.set_updated_at();

alter table public.public_signup_requests enable row level security;
