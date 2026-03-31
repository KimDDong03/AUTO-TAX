alter table if exists public.organization_integrations
  add column if not exists renewal_contact_department text not null default '',
  add column if not exists renewal_contact_fax text not null default '',
  add column if not exists renewal_issue_password_encrypted text not null default '';

alter table if exists public.managed_customers
  add column if not exists renewal_contact_mobile text not null default '';
