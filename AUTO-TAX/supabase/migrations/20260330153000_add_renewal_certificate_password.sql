alter table if exists public.organization_integrations
  add column if not exists renewal_certificate_password_encrypted text not null default '';
