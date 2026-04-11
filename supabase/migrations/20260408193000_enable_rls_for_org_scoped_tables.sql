-- These tables live in the public schema and are exposed to PostgREST.
-- Keep direct table access scoped to workspace editors; customer_certificates
-- also stores encrypted password material, so viewer-safe reads should go
-- through the server API rather than raw table access.

alter table public.customer_import_profiles enable row level security;
alter table public.organization_completed_billing_months enable row level security;
alter table public.customer_certificates enable row level security;

drop policy if exists customer_import_profiles_select_operator on public.customer_import_profiles;
create policy customer_import_profiles_select_operator
on public.customer_import_profiles
for select
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
);

drop policy if exists customer_import_profiles_manage_operator on public.customer_import_profiles;
create policy customer_import_profiles_manage_operator
on public.customer_import_profiles
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
);

drop policy if exists organization_completed_billing_months_select_operator on public.organization_completed_billing_months;
create policy organization_completed_billing_months_select_operator
on public.organization_completed_billing_months
for select
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
);

drop policy if exists organization_completed_billing_months_manage_operator on public.organization_completed_billing_months;
create policy organization_completed_billing_months_manage_operator
on public.organization_completed_billing_months
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
);

drop policy if exists customer_certificates_select_operator on public.customer_certificates;
create policy customer_certificates_select_operator
on public.customer_certificates
for select
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
);

drop policy if exists customer_certificates_manage_operator on public.customer_certificates;
create policy customer_certificates_manage_operator
on public.customer_certificates
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'operator']::public.organization_member_role[]
  )
);
