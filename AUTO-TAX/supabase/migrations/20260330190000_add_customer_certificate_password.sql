alter table public.customer_certificates
  add column if not exists certificate_password_encrypted text not null default '';
