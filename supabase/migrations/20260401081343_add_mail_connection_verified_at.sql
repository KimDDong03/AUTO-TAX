alter table public.organization_settings
  add column if not exists mail_connection_verified_at timestamptz;;
