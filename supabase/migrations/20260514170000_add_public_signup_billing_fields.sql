alter table public.public_signup_requests
  add column if not exists representative_name text not null default '',
  add column if not exists business_registration_number text not null default '',
  add column if not exists business_address text not null default '',
  add column if not exists business_type text not null default '',
  add column if not exists business_item text not null default '',
  add column if not exists invoice_email text not null default '';
