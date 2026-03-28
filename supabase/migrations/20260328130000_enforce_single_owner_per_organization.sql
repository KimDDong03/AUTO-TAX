create unique index if not exists organization_members_single_owner_idx
on public.organization_members (organization_id)
where role = 'owner';
