alter table public.organization_integrations
  alter column imap_mailbox set default '*';

update public.organization_integrations
set
  imap_mailbox = '*',
  updated_at = timezone('utc', now())
where
  btrim(imap_mailbox) = ''
  or lower(btrim(imap_mailbox)) = 'inbox';
