do $$
begin
  if not exists (select 1 from pg_type where typname = 'public_consultation_request_status') then
    create type public.public_consultation_request_status as enum ('new', 'contacted', 'workspace_opened', 'closed');
  end if;
end $$;

create table if not exists public.public_consultation_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  status public.public_consultation_request_status not null default 'new',
  note text not null default '',
  handled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_public_consultation_requests_set_updated_at on public.public_consultation_requests;
create trigger trg_public_consultation_requests_set_updated_at
before update on public.public_consultation_requests
for each row execute function public.set_updated_at();

create index if not exists idx_public_consultation_requests_status_created_at
  on public.public_consultation_requests (status, created_at desc);

create index if not exists idx_public_consultation_requests_created_at
  on public.public_consultation_requests (created_at desc);

alter table public.public_consultation_requests enable row level security;
