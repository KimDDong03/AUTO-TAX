select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('auth_user_login_index', 'renewal_agent_heartbeats', 'renewal_automation_jobs')
order by tablename, policyname;
