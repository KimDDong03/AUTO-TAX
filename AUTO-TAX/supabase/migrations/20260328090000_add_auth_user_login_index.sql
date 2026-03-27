create table if not exists public.auth_user_login_index (
  user_id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique,
  auth_email text not null,
  display_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_user_login_index_login_id_lowercase check (login_id = lower(login_id))
);

create unique index if not exists auth_user_login_index_login_id_key
  on public.auth_user_login_index (login_id);

create unique index if not exists auth_user_login_index_auth_email_key
  on public.auth_user_login_index (auth_email);

alter table public.auth_user_login_index enable row level security;

insert into public.auth_user_login_index (
  user_id,
  login_id,
  auth_email,
  display_name,
  created_at,
  updated_at
)
select
  u.id,
  lower(trim(u.raw_user_meta_data ->> 'login_id')) as login_id,
  lower(trim(u.email)) as auth_email,
  nullif(trim(u.raw_user_meta_data ->> 'display_name'), '') as display_name,
  coalesce(u.created_at, now()) as created_at,
  now() as updated_at
from auth.users as u
where coalesce(trim(u.raw_user_meta_data ->> 'login_id'), '') <> ''
  and coalesce(trim(u.email), '') <> ''
on conflict (user_id) do update
set
  login_id = excluded.login_id,
  auth_email = excluded.auth_email,
  display_name = excluded.display_name,
  updated_at = now();
