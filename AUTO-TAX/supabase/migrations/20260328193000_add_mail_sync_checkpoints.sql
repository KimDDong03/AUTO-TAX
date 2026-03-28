create table if not exists public.mail_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailbox text not null,
  last_uid bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, mailbox)
);

create index if not exists idx_mail_sync_checkpoints_org_mailbox
  on public.mail_sync_checkpoints (organization_id, mailbox);

drop trigger if exists trg_mail_sync_checkpoints_set_updated_at on public.mail_sync_checkpoints;
create trigger trg_mail_sync_checkpoints_set_updated_at
before update on public.mail_sync_checkpoints
for each row
execute function public.set_updated_at();

alter table public.mail_sync_checkpoints enable row level security;

drop policy if exists mail_sync_checkpoints_select_member on public.mail_sync_checkpoints;
create policy mail_sync_checkpoints_select_member
on public.mail_sync_checkpoints
for select
using (
  public.user_belongs_to_organization(organization_id)
);

drop policy if exists mail_sync_checkpoints_manage_operator on public.mail_sync_checkpoints;
create policy mail_sync_checkpoints_manage_operator
on public.mail_sync_checkpoints
for all
using (
  public.user_can_operate_organization(organization_id)
)
with check (
  public.user_can_operate_organization(organization_id)
);
