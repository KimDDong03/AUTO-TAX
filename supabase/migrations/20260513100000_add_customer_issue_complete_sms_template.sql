alter table public.managed_customers
  add column if not exists issue_complete_sms_template text not null default '';
