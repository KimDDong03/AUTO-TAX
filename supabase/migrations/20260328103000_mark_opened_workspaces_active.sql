update public.organizations
set status = 'active',
    updated_at = timezone('utc', now())
where status = 'trial'
  and exists (
    select 1
    from public.app_logs
    where app_logs.organization_id = organizations.id
      and app_logs.scope = 'ops'
      and app_logs.message = '플랫폼 관리자가 고객사 작업공간을 개통했습니다.'
  );
