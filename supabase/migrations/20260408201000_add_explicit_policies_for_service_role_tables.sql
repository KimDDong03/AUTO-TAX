-- These tables are intentionally server-only / agent-only data paths.
-- The app uses the Supabase service-role client for them, while browser
-- clients go through vetted API routes instead of querying PostgREST tables
-- directly. Add explicit deny policies so the intent is visible and the
-- advisor no longer reports "RLS enabled, no policy".

drop policy if exists auth_user_login_index_deny_direct_client_access on public.auth_user_login_index;
create policy auth_user_login_index_deny_direct_client_access
on public.auth_user_login_index
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists renewal_agent_heartbeats_deny_direct_client_access on public.renewal_agent_heartbeats;
create policy renewal_agent_heartbeats_deny_direct_client_access
on public.renewal_agent_heartbeats
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists renewal_automation_jobs_deny_direct_client_access on public.renewal_automation_jobs;
create policy renewal_automation_jobs_deny_direct_client_access
on public.renewal_automation_jobs
for all
to anon, authenticated
using (false)
with check (false);
