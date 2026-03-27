create unique index if not exists idx_organization_integrations_popbill_user_id_prefix_unique
  on public.organization_integrations ((upper(trim(popbill_user_id_prefix))))
  where nullif(trim(popbill_user_id_prefix), '') is not null;
