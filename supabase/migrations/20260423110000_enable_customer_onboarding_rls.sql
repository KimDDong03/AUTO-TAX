alter table public.customer_import_profiles enable row level security;
alter table public.customer_certificates enable row level security;
alter table public.organization_completed_billing_months enable row level security;
alter table public.customer_onboarding_previews enable row level security;
alter table public.customer_onboarding_batches enable row level security;
alter table public.customer_onboarding_batch_rows enable row level security;

drop policy if exists customer_import_profiles_select_editor on public.customer_import_profiles;
create policy customer_import_profiles_select_editor
on public.customer_import_profiles
for select
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
);

drop policy if exists customer_import_profiles_manage_editor on public.customer_import_profiles;
create policy customer_import_profiles_manage_editor
on public.customer_import_profiles
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
);

drop policy if exists customer_certificates_select_member on public.customer_certificates;
create policy customer_certificates_select_member
on public.customer_certificates
for select
to authenticated
using (
  exists (
    select 1
    from public.managed_customers customer
    where customer.id = managed_customer_id
      and customer.organization_id = organization_id
      and public.is_org_member(customer.organization_id)
  )
);

drop policy if exists customer_certificates_manage_editor on public.customer_certificates;
create policy customer_certificates_manage_editor
on public.customer_certificates
for all
to authenticated
using (
  exists (
    select 1
    from public.managed_customers customer
    where customer.id = managed_customer_id
      and customer.organization_id = organization_id
      and public.has_org_role(customer.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
)
with check (
  exists (
    select 1
    from public.managed_customers customer
    where customer.id = managed_customer_id
      and customer.organization_id = organization_id
      and public.has_org_role(customer.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
);

drop policy if exists organization_completed_billing_months_select_editor on public.organization_completed_billing_months;
create policy organization_completed_billing_months_select_editor
on public.organization_completed_billing_months
for select
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
);

drop policy if exists organization_completed_billing_months_manage_editor on public.organization_completed_billing_months;
create policy organization_completed_billing_months_manage_editor
on public.organization_completed_billing_months
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
);

drop policy if exists customer_onboarding_previews_select_editor on public.customer_onboarding_previews;
create policy customer_onboarding_previews_select_editor
on public.customer_onboarding_previews
for select
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
);

drop policy if exists customer_onboarding_previews_manage_editor on public.customer_onboarding_previews;
create policy customer_onboarding_previews_manage_editor
on public.customer_onboarding_previews
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
);

drop policy if exists customer_onboarding_batches_select_editor on public.customer_onboarding_batches;
create policy customer_onboarding_batches_select_editor
on public.customer_onboarding_batches
for select
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
);

drop policy if exists customer_onboarding_batches_manage_editor on public.customer_onboarding_batches;
create policy customer_onboarding_batches_manage_editor
on public.customer_onboarding_batches
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  and exists (
    select 1
    from public.customer_onboarding_previews preview
    where preview.id = preview_id
      and preview.organization_id = organization_id
  )
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  and exists (
    select 1
    from public.customer_onboarding_previews preview
    where preview.id = preview_id
      and preview.organization_id = organization_id
  )
);

drop policy if exists customer_onboarding_batch_rows_select_editor on public.customer_onboarding_batch_rows;
create policy customer_onboarding_batch_rows_select_editor
on public.customer_onboarding_batch_rows
for select
to authenticated
using (
  exists (
    select 1
    from public.customer_onboarding_batches batch
    where batch.id = batch_id
      and batch.organization_id = organization_id
      and public.has_org_role(batch.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
);

drop policy if exists customer_onboarding_batch_rows_manage_editor on public.customer_onboarding_batch_rows;
create policy customer_onboarding_batch_rows_manage_editor
on public.customer_onboarding_batch_rows
for all
to authenticated
using (
  exists (
    select 1
    from public.customer_onboarding_batches batch
    where batch.id = batch_id
      and batch.organization_id = organization_id
      and public.has_org_role(batch.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
)
with check (
  exists (
    select 1
    from public.customer_onboarding_batches batch
    where batch.id = batch_id
      and batch.organization_id = organization_id
      and public.has_org_role(batch.organization_id, array['owner', 'admin', 'operator']::public.organization_member_role[])
  )
);
