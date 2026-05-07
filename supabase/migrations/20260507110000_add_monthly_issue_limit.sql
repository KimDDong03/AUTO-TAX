alter table public.organizations
  add column if not exists monthly_issue_limit integer not null default 10;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_monthly_issue_limit_positive'
  ) then
    alter table public.organizations
      add constraint organizations_monthly_issue_limit_positive
      check (monthly_issue_limit > 0);
  end if;
end
$$;
