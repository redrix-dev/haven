begin;

update public.permissions_catalog
set description = case key
  when 'manage_server' then 'Change server name, description, and general settings'
  when 'manage_roles' then 'Create, edit, and assign roles to members'
  when 'manage_members' then 'Kick and manage server members'
  when 'manage_bans' then 'Ban and unban members from the server'
  when 'create_channels' then 'Create new channels in the server'
  when 'manage_channels' then 'Edit, delete, and reorder channels'
  when 'manage_channel_permissions' then 'Control who can see and use each channel'
  when 'manage_messages' then 'Delete messages from any member'
  when 'create_reports' then 'Submit reports about messages or members'
  when 'manage_reports' then 'Review and action reports filed in this server'
  else description
end
where key in (
  'manage_server',
  'manage_roles',
  'manage_members',
  'manage_bans',
  'create_channels',
  'manage_channels',
  'manage_channel_permissions',
  'manage_messages',
  'create_reports',
  'manage_reports'
);

alter table public.support_reports
  alter column status drop default;

alter type public.support_report_status rename to support_report_status_old;

create type public.support_report_status as enum (
  'pending',
  'under_review',
  'resolved',
  'dismissed',
  'escalated'
);

alter table public.support_reports
  alter column status type public.support_report_status
  using (
    case status::text
      when 'open' then 'pending'
      when 'in_review' then 'under_review'
      when 'resolved' then 'resolved'
      when 'closed' then 'dismissed'
      else 'pending'
    end
  )::public.support_report_status;

alter table public.support_reports
  alter column status set default 'pending';

drop type public.support_report_status_old;

commit;

-- CHECKPOINT 2 COMPLETE
