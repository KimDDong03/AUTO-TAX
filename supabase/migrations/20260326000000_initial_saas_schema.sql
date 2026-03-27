create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'organization_member_role') then
    create type public.organization_member_role as enum ('owner', 'admin', 'operator', 'viewer');
  end if;

  if not exists (select 1 from pg_type where typname = 'organization_status') then
    create type public.organization_status as enum ('trial', 'active', 'suspended', 'churned');
  end if;

  if not exists (select 1 from pg_type where typname = 'issue_mode') then
    create type public.issue_mode as enum ('review', 'auto');
  end if;

  if not exists (select 1 from pg_type where typname = 'popbill_state') then
    create type public.popbill_state as enum ('pending', 'joined', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'mail_parse_status') then
    create type public.mail_parse_status as enum ('pending', 'parsed', 'failed', 'unmatched', 'duplicate');
  end if;

  if not exists (select 1 from pg_type where typname = 'draft_status') then
    create type public.draft_status as enum ('review', 'scheduled', 'issuing', 'issued', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'log_level') then
    create type public.log_level as enum ('info', 'warn', 'error');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type public.job_status as enum ('queued', 'claimed', 'completed', 'failed', 'cancelled');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_number text,
  plan_code text not null default 'starter',
  status public.organization_status not null default 'trial',
  managed_customer_limit integer not null default 50,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_member_role not null default 'operator',
  display_name text,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  timezone text not null default 'Asia/Seoul',
  notification_emails text[] not null default '{}',
  default_issue_day integer not null default 25,
  default_issue_hour integer not null default 14,
  default_issue_minute integer not null default 0,
  mail_poll_minutes integer not null default 5,
  mail_sync_start_at timestamptz,
  scheduler_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_integrations (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  imap_host text not null default '',
  imap_port integer not null default 993,
  imap_secure boolean not null default true,
  imap_user text not null default '',
  imap_pass_encrypted text not null default '',
  imap_mailbox text not null default 'INBOX',
  smtp_host text not null default '',
  smtp_port integer not null default 465,
  smtp_secure boolean not null default true,
  smtp_user text not null default '',
  smtp_pass_encrypted text not null default '',
  smtp_from_name text not null default 'AUTO-TAX',
  smtp_from_email text not null default '',
  popbill_link_id text not null default '',
  popbill_secret_key_encrypted text not null default '',
  popbill_partner_corp_num text not null default '',
  popbill_user_id_prefix text not null default 'TEST_',
  popbill_shared_password_encrypted text not null default '',
  operator_contact_name text not null default '',
  operator_contact_email text not null default '',
  operator_contact_tel text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.managed_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_name text not null,
  business_number text not null,
  corp_name text not null,
  ceo_name text not null,
  addr text not null,
  biz_type text not null,
  biz_class text not null,
  popbill_user_id text not null default '',
  popbill_password_encrypted text not null default '',
  popbill_state public.popbill_state not null default 'pending',
  popbill_cert_registered boolean not null default false,
  popbill_cert_expire_date date,
  issue_mode public.issue_mode not null default 'review',
  issue_day integer,
  issue_hour integer,
  issue_minute integer,
  memo text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, business_number)
);

create table if not exists public.managed_customer_plants (
  id uuid primary key default gen_random_uuid(),
  managed_customer_id uuid not null references public.managed_customers(id) on delete cascade,
  plant_name text not null,
  normalized_plant_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (managed_customer_id, normalized_plant_name)
);

create index if not exists idx_managed_customer_plants_normalized_name
  on public.managed_customer_plants (normalized_plant_name);

create table if not exists public.managed_customer_match_addresses (
  id uuid primary key default gen_random_uuid(),
  managed_customer_id uuid not null references public.managed_customers(id) on delete cascade,
  match_address text not null,
  normalized_match_address text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (managed_customer_id, normalized_match_address)
);

create index if not exists idx_managed_customer_match_addresses_normalized_address
  on public.managed_customer_match_addresses (normalized_match_address);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_uid text not null,
  mailbox text not null default 'INBOX',
  from_address text not null default '',
  subject text not null default '',
  received_at timestamptz not null,
  raw_source text not null default '',
  text_body text not null default '',
  parse_status public.mail_parse_status not null default 'pending',
  parse_error text not null default '',
  parsed_data jsonb,
  managed_customer_id uuid references public.managed_customers(id) on delete set null,
  invoice_draft_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, message_uid)
);

create index if not exists idx_inbox_messages_org_received_at
  on public.inbox_messages (organization_id, received_at desc);

create index if not exists idx_inbox_messages_org_parse_status
  on public.inbox_messages (organization_id, parse_status);

create table if not exists public.invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  managed_customer_id uuid not null references public.managed_customers(id) on delete cascade,
  source_message_id uuid references public.inbox_messages(id) on delete set null,
  issue_mode public.issue_mode not null default 'review',
  status public.draft_status not null default 'review',
  scheduled_for timestamptz,
  issue_requested_at timestamptz,
  issued_at timestamptz,
  issue_error text not null default '',
  billing_month text not null,
  write_date date,
  item_name text not null,
  plant_name text not null,
  supply_cost numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  kepco_corp_num text not null default '',
  kepco_branch_id text not null default '',
  kepco_corp_name text not null default '',
  kepco_ceo_name text not null default '',
  kepco_addr text not null default '',
  kepco_biz_type text not null default '',
  kepco_biz_class text not null default '',
  recipient_email text not null default '',
  popbill_mgt_key text not null,
  popbill_result_json jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, popbill_mgt_key)
);

create index if not exists idx_invoice_drafts_org_status
  on public.invoice_drafts (organization_id, status);

create index if not exists idx_invoice_drafts_org_billing_month
  on public.invoice_drafts (organization_id, billing_month);

create table if not exists public.app_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  level public.log_level not null default 'info',
  scope text not null,
  message text not null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_logs_org_created_at
  on public.app_logs (organization_id, created_at desc);

create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  managed_customer_id uuid references public.managed_customers(id) on delete set null,
  job_type text not null,
  status public.job_status not null default 'queued',
  run_after timestamptz not null default timezone('utc', now()),
  requested_by uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_job_queue_org_status_run_after
  on public.job_queue (organization_id, status, run_after);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inbox_messages_invoice_draft_id_fkey'
  ) then
    alter table public.inbox_messages
      add constraint inbox_messages_invoice_draft_id_fkey
      foreign key (invoice_draft_id)
      references public.invoice_drafts(id)
      on delete set null;
  end if;
end $$;

drop trigger if exists trg_organizations_set_updated_at on public.organizations;
create trigger trg_organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists trg_organization_members_set_updated_at on public.organization_members;
create trigger trg_organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_organization_settings_set_updated_at on public.organization_settings;
create trigger trg_organization_settings_set_updated_at
before update on public.organization_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_organization_integrations_set_updated_at on public.organization_integrations;
create trigger trg_organization_integrations_set_updated_at
before update on public.organization_integrations
for each row execute function public.set_updated_at();

drop trigger if exists trg_managed_customers_set_updated_at on public.managed_customers;
create trigger trg_managed_customers_set_updated_at
before update on public.managed_customers
for each row execute function public.set_updated_at();

drop trigger if exists trg_inbox_messages_set_updated_at on public.inbox_messages;
create trigger trg_inbox_messages_set_updated_at
before update on public.inbox_messages
for each row execute function public.set_updated_at();

drop trigger if exists trg_invoice_drafts_set_updated_at on public.invoice_drafts;
create trigger trg_invoice_drafts_set_updated_at
before update on public.invoice_drafts
for each row execute function public.set_updated_at();

drop trigger if exists trg_job_queue_set_updated_at on public.job_queue;
create trigger trg_job_queue_set_updated_at
before update on public.job_queue
for each row execute function public.set_updated_at();

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles public.organization_member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.role = any(allowed_roles)
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_settings enable row level security;
alter table public.organization_integrations enable row level security;
alter table public.managed_customers enable row level security;
alter table public.managed_customer_plants enable row level security;
alter table public.managed_customer_match_addresses enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.invoice_drafts enable row level security;
alter table public.app_logs enable row level security;
alter table public.job_queue enable row level security;

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin
on public.organizations
for update
to authenticated
using (public.has_org_role(id, array['owner', 'admin']::public.organization_member_role[]))
with check (public.has_org_role(id, array['owner', 'admin']::public.organization_member_role[]));

drop policy if exists organization_members_select_member on public.organization_members;
create policy organization_members_select_member
on public.organization_members
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists organization_members_manage_admin on public.organization_members;
create policy organization_members_manage_admin
on public.organization_members
for all
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_member_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_member_role[]));

drop policy if exists organization_settings_select_member on public.organization_settings;
create policy organization_settings_select_member
on public.organization_settings
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists organization_settings_update_admin on public.organization_settings;
create policy organization_settings_update_admin
on public.organization_settings
for all
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_member_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_member_role[]));

drop policy if exists organization_integrations_select_admin on public.organization_integrations;
create policy organization_integrations_select_admin
on public.organization_integrations
for select
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_member_role[]));

drop policy if exists organization_integrations_manage_admin on public.organization_integrations;
create policy organization_integrations_manage_admin
on public.organization_integrations
for all
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_member_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_member_role[]));

drop policy if exists managed_customers_select_member on public.managed_customers;
create policy managed_customers_select_member
on public.managed_customers
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists managed_customers_manage_operator on public.managed_customers;
create policy managed_customers_manage_operator
on public.managed_customers
for all
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]));

drop policy if exists managed_customer_plants_select_member on public.managed_customer_plants;
create policy managed_customer_plants_select_member
on public.managed_customer_plants
for select
to authenticated
using (
  exists (
    select 1
    from public.managed_customers mc
    where mc.id = managed_customer_id
      and public.is_org_member(mc.organization_id)
  )
);

drop policy if exists managed_customer_plants_manage_operator on public.managed_customer_plants;
create policy managed_customer_plants_manage_operator
on public.managed_customer_plants
for all
to authenticated
using (
  exists (
    select 1
    from public.managed_customers mc
    where mc.id = managed_customer_id
      and public.has_org_role(mc.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
)
with check (
  exists (
    select 1
    from public.managed_customers mc
    where mc.id = managed_customer_id
      and public.has_org_role(mc.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
);

drop policy if exists managed_customer_match_addresses_select_member on public.managed_customer_match_addresses;
create policy managed_customer_match_addresses_select_member
on public.managed_customer_match_addresses
for select
to authenticated
using (
  exists (
    select 1
    from public.managed_customers mc
    where mc.id = managed_customer_id
      and public.is_org_member(mc.organization_id)
  )
);

drop policy if exists managed_customer_match_addresses_manage_operator on public.managed_customer_match_addresses;
create policy managed_customer_match_addresses_manage_operator
on public.managed_customer_match_addresses
for all
to authenticated
using (
  exists (
    select 1
    from public.managed_customers mc
    where mc.id = managed_customer_id
      and public.has_org_role(mc.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
)
with check (
  exists (
    select 1
    from public.managed_customers mc
    where mc.id = managed_customer_id
      and public.has_org_role(mc.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
);

drop policy if exists inbox_messages_select_member on public.inbox_messages;
create policy inbox_messages_select_member
on public.inbox_messages
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists inbox_messages_manage_operator on public.inbox_messages;
create policy inbox_messages_manage_operator
on public.inbox_messages
for all
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]));

drop policy if exists invoice_drafts_select_member on public.invoice_drafts;
create policy invoice_drafts_select_member
on public.invoice_drafts
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists invoice_drafts_manage_operator on public.invoice_drafts;
create policy invoice_drafts_manage_operator
on public.invoice_drafts
for all
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]));

drop policy if exists app_logs_select_member on public.app_logs;
create policy app_logs_select_member
on public.app_logs
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists app_logs_insert_operator on public.app_logs;
create policy app_logs_insert_operator
on public.app_logs
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]));

drop policy if exists job_queue_select_member on public.job_queue;
create policy job_queue_select_member
on public.job_queue
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists job_queue_manage_operator on public.job_queue;
create policy job_queue_manage_operator
on public.job_queue
for all
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[]));
