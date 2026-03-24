alter table public.support_reports
  add column if not exists destination text,
  add column if not exists snapshot jsonb;

update public.support_reports
set destination = case
  when coalesce(notes, '') like '%"target":"server_admins"%' then 'server_admins'
  when coalesce(notes, '') like '%"target":"both"%' then 'both'
  when coalesce(notes, '') like '%"type":"user_report"%' then 'haven_staff'
  else 'haven_staff'
end
where destination is null
   or destination not in ('haven_staff', 'server_admins', 'both');

alter table public.support_reports
  alter column destination set default 'haven_staff';

update public.support_reports
set destination = 'haven_staff'
where destination is null;

alter table public.support_reports
  alter column destination set not null;

alter table public.support_reports
  drop constraint if exists support_reports_destination_check;

alter table public.support_reports
  add constraint support_reports_destination_check
  check (destination in ('haven_staff', 'server_admins', 'both'));

-- CHECKPOINT 1 COMPLETE
