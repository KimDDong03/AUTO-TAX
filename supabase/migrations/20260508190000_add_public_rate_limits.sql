create table if not exists public.public_rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.public_rate_limits enable row level security;

create index if not exists idx_public_rate_limits_reset_at
  on public.public_rate_limits (reset_at);

create or replace function public.increment_public_rate_limit(
  p_key text,
  p_window_reset_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.public_rate_limits%rowtype;
  next_count integer;
  next_reset_at timestamptz;
begin
  select *
    into existing
  from public.public_rate_limits
  where key = p_key
  for update;

  if not found or existing.reset_at <= timezone('utc', now()) then
    next_count := 1;
    next_reset_at := p_window_reset_at;

    insert into public.public_rate_limits (key, count, reset_at, updated_at)
    values (p_key, next_count, next_reset_at, timezone('utc', now()))
    on conflict (key) do update
      set count = excluded.count,
          reset_at = excluded.reset_at,
          updated_at = excluded.updated_at;
  else
    next_count := existing.count + 1;
    next_reset_at := existing.reset_at;

    update public.public_rate_limits
      set count = next_count,
          updated_at = timezone('utc', now())
    where key = p_key;
  end if;

  delete from public.public_rate_limits
  where reset_at < timezone('utc', now()) - interval '1 day';

  return jsonb_build_object(
    'count', next_count,
    'reset_at', next_reset_at
  );
end;
$$;

revoke all on function public.increment_public_rate_limit(text, timestamptz) from public;
grant execute on function public.increment_public_rate_limit(text, timestamptz) to service_role;
