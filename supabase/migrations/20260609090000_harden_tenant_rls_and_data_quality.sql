-- Align direct Supabase RLS with the app-level member-management model.
drop policy if exists organization_members_manage_admin on public.organization_members;
drop policy if exists organization_members_insert_owner_non_owner on public.organization_members;
drop policy if exists organization_members_update_owner_non_owner on public.organization_members;
drop policy if exists organization_members_delete_owner_non_owner on public.organization_members;

create policy organization_members_insert_owner_non_owner
on public.organization_members
for insert
to authenticated
with check (
  role <> 'owner'
  and public.has_org_role(organization_id, array['owner']::public.organization_member_role[])
);

create policy organization_members_update_owner_non_owner
on public.organization_members
for update
to authenticated
using (
  role <> 'owner'
  and public.has_org_role(organization_id, array['owner']::public.organization_member_role[])
)
with check (
  role <> 'owner'
  and public.has_org_role(organization_id, array['owner']::public.organization_member_role[])
);

create policy organization_members_delete_owner_non_owner
on public.organization_members
for delete
to authenticated
using (
  role <> 'owner'
  and public.has_org_role(organization_id, array['owner']::public.organization_member_role[])
);

-- Make match-address rows tenant-scoped at the schema boundary, not only in app code.
alter table public.managed_customer_match_addresses
  add column if not exists organization_id uuid;

update public.managed_customer_match_addresses address
set organization_id = customer.organization_id
from public.managed_customers customer
where address.managed_customer_id = customer.id
  and address.organization_id is distinct from customer.organization_id;

do $$
begin
  if exists (
    select 1
    from public.managed_customer_match_addresses
    where organization_id is null
  ) then
    raise exception 'managed_customer_match_addresses.organization_id backfill failed';
  end if;
end
$$;

alter table public.managed_customer_match_addresses
  alter column organization_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'managed_customers_organization_id_id_key'
  ) then
    alter table public.managed_customers
      add constraint managed_customers_organization_id_id_key
      unique (organization_id, id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'managed_customer_match_addresses_organization_id_fkey'
  ) then
    alter table public.managed_customer_match_addresses
      add constraint managed_customer_match_addresses_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'managed_customer_match_addresses_org_customer_fkey'
  ) then
    alter table public.managed_customer_match_addresses
      add constraint managed_customer_match_addresses_org_customer_fkey
      foreign key (organization_id, managed_customer_id)
      references public.managed_customers(organization_id, id)
      on delete cascade;
  end if;
end
$$;

create or replace function public.set_managed_customer_match_address_organization_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_organization_id uuid;
begin
  select organization_id
    into parent_organization_id
  from public.managed_customers
  where id = new.managed_customer_id;

  if parent_organization_id is null then
    raise exception 'managed customer % does not exist', new.managed_customer_id;
  end if;

  if new.organization_id is null then
    new.organization_id := parent_organization_id;
  elsif new.organization_id <> parent_organization_id then
    raise exception 'managed_customer_match_addresses organization_id does not match parent customer';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_managed_customer_match_addresses_set_organization_id
  on public.managed_customer_match_addresses;
create trigger trg_managed_customer_match_addresses_set_organization_id
before insert or update of organization_id, managed_customer_id
on public.managed_customer_match_addresses
for each row
execute function public.set_managed_customer_match_address_organization_id();

do $$
begin
  if exists (
    select 1
    from (
      select organization_id, normalized_match_address
      from public.managed_customer_match_addresses
      group by organization_id, normalized_match_address
      having count(*) > 1
    ) duplicate_addresses
  ) then
    raise exception 'duplicate managed_customer_match_addresses within an organization';
  end if;
end
$$;

create unique index if not exists idx_managed_customer_match_addresses_org_normalized_unique
  on public.managed_customer_match_addresses (organization_id, normalized_match_address);

create index if not exists idx_managed_customer_match_addresses_org_customer
  on public.managed_customer_match_addresses (organization_id, managed_customer_id);

drop policy if exists managed_customer_match_addresses_select_member on public.managed_customer_match_addresses;
create policy managed_customer_match_addresses_select_member
on public.managed_customer_match_addresses
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists managed_customer_match_addresses_manage_operator on public.managed_customer_match_addresses;
create policy managed_customer_match_addresses_manage_operator
on public.managed_customer_match_addresses
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
);

-- Add tenant-consistency foreign keys for customer-owned child tables.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_certificates_org_customer_fkey'
  ) then
    alter table public.customer_certificates
      add constraint customer_certificates_org_customer_fkey
      foreign key (organization_id, managed_customer_id)
      references public.managed_customers(organization_id, id)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_report_profiles_org_customer_fkey'
  ) then
    alter table public.customer_report_profiles
      add constraint customer_report_profiles_org_customer_fkey
      foreign key (organization_id, managed_customer_id)
      references public.managed_customers(organization_id, id)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_report_months_org_customer_fkey'
  ) then
    alter table public.customer_report_months
      add constraint customer_report_months_org_customer_fkey
      foreign key (organization_id, managed_customer_id)
      references public.managed_customers(organization_id, id)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_contract_periods_org_customer_fkey'
  ) then
    alter table public.customer_contract_periods
      add constraint customer_contract_periods_org_customer_fkey
      foreign key (organization_id, managed_customer_id)
      references public.managed_customers(organization_id, id)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_drafts_org_customer_fkey'
  ) then
    alter table public.invoice_drafts
      add constraint invoice_drafts_org_customer_fkey
      foreign key (organization_id, managed_customer_id)
      references public.managed_customers(organization_id, id)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inbox_messages_org_customer_fkey'
  ) then
    alter table public.inbox_messages
      add constraint inbox_messages_org_customer_fkey
      foreign key (organization_id, managed_customer_id)
      references public.managed_customers(organization_id, id)
      on delete set null (managed_customer_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'job_queue_org_customer_fkey'
  ) then
    alter table public.job_queue
      add constraint job_queue_org_customer_fkey
      foreign key (organization_id, managed_customer_id)
      references public.managed_customers(organization_id, id)
      on delete set null (managed_customer_id);
  end if;
end
$$;

-- Strengthen month, schedule, and amount checks at the database boundary.
alter table public.customer_report_profiles
  drop constraint if exists customer_report_profiles_contract_start_month_format,
  drop constraint if exists customer_report_profiles_contract_end_month_format;

alter table public.customer_report_profiles
  add constraint customer_report_profiles_contract_start_month_format
    check (contract_start_month is null or contract_start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  add constraint customer_report_profiles_contract_end_month_format
    check (contract_end_month is null or contract_end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_drafts_billing_month_format'
  ) then
    alter table public.invoice_drafts
      add constraint invoice_drafts_billing_month_format
      check (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organization_completed_billing_months_billing_month_format'
  ) then
    alter table public.organization_completed_billing_months
      add constraint organization_completed_billing_months_billing_month_format
      check (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_drafts_amounts_nonnegative'
  ) then
    alter table public.invoice_drafts
      add constraint invoice_drafts_amounts_nonnegative
      check (supply_cost >= 0 and tax_total >= 0 and total_amount >= 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'managed_customers_issue_schedule_range'
  ) then
    alter table public.managed_customers
      add constraint managed_customers_issue_schedule_range
      check (
        (issue_day is null or issue_day between 1 and 31)
        and (issue_hour is null or issue_hour between 0 and 23)
        and (issue_minute is null or issue_minute between 0 and 59)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organization_settings_schedule_range'
  ) then
    alter table public.organization_settings
      add constraint organization_settings_schedule_range
      check (
        default_issue_day between 1 and 31
        and default_issue_hour between 0 and 23
        and default_issue_minute between 0 and 59
        and mail_poll_minutes between 1 and 1440
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_managed_customer_limit_positive'
  ) then
    alter table public.organizations
      add constraint organizations_managed_customer_limit_positive
      check (managed_customer_limit > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mail_sync_checkpoints_last_uid_nonnegative'
  ) then
    alter table public.mail_sync_checkpoints
      add constraint mail_sync_checkpoints_last_uid_nonnegative
      check (last_uid >= 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'public_signup_phone_verifications_timestamp_order'
  ) then
    alter table public.public_signup_phone_verifications
      add constraint public_signup_phone_verifications_timestamp_order
      check (
        expires_at > created_at
        and (verified_at is null or verified_at >= created_at)
        and (consumed_at is null or (verified_at is not null and consumed_at >= verified_at))
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'public_signup_email_verifications_timestamp_order'
  ) then
    alter table public.public_signup_email_verifications
      add constraint public_signup_email_verifications_timestamp_order
      check (
        expires_at > created_at
        and (verified_at is null or verified_at >= created_at)
        and (consumed_at is null or (verified_at is not null and consumed_at >= verified_at))
      );
  end if;
end
$$;
