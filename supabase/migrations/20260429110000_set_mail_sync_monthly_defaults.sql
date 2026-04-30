alter table public.organization_settings
  alter column default_issue_day set default 20,
  alter column default_issue_hour set default 9,
  alter column default_issue_minute set default 0,
  alter column mail_poll_minutes set default 1440;

update public.organization_settings
set
  default_issue_day = case
    when default_issue_day in (25, 26)
      and default_issue_hour in (9, 14)
      and default_issue_minute = 0
      then 20
    else default_issue_day
  end,
  default_issue_hour = case
    when default_issue_day in (25, 26)
      and default_issue_hour in (9, 14)
      and default_issue_minute = 0
      then 9
    else default_issue_hour
  end,
  default_issue_minute = case
    when default_issue_day in (25, 26)
      and default_issue_hour in (9, 14)
      and default_issue_minute = 0
      then 0
    else default_issue_minute
  end,
  mail_poll_minutes = case
    when mail_poll_minutes = 5 then 1440
    else mail_poll_minutes
  end,
  updated_at = timezone('utc', now())
where
  (
    default_issue_day in (25, 26)
    and default_issue_hour in (9, 14)
    and default_issue_minute = 0
  )
  or mail_poll_minutes = 5;
