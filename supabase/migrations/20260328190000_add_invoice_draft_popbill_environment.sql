alter table public.invoice_drafts
  add column if not exists popbill_environment text;;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoice_drafts_popbill_environment_check'
  ) then
    alter table public.invoice_drafts
      add constraint invoice_drafts_popbill_environment_check
      check (popbill_environment in ('test', 'production'));
  end if;
end
$$;;
create index if not exists idx_invoice_drafts_org_popbill_environment
  on public.invoice_drafts (organization_id, popbill_environment);;
