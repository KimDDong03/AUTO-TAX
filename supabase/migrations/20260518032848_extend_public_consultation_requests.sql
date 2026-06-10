alter table public.public_consultation_requests
  add column if not exists category text not null default '상담 신청',
  add column if not exists message text not null default '',
  add column if not exists email text not null default '',
  add column if not exists region text not null default '',
  add column if not exists request_ip text not null default '',
  add column if not exists request_user_agent text not null default '';
