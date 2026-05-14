create table if not exists public.public_signup_phone_verifications (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  code_salt text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  provider text not null default 'dev',
  provider_message_id text,
  request_ip text not null default '',
  request_user_agent text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint public_signup_phone_verifications_attempt_count_nonnegative check (attempt_count >= 0)
);

create index if not exists idx_public_signup_phone_verifications_phone_created_at
  on public.public_signup_phone_verifications (phone, created_at desc);

create index if not exists idx_public_signup_phone_verifications_expires_at
  on public.public_signup_phone_verifications (expires_at);

drop trigger if exists trg_public_signup_phone_verifications_set_updated_at on public.public_signup_phone_verifications;
create trigger trg_public_signup_phone_verifications_set_updated_at
before update on public.public_signup_phone_verifications
for each row execute function public.set_updated_at();

alter table public.public_signup_phone_verifications enable row level security;
