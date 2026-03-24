create or replace function public.create_community_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_everyone_role_id uuid;
  v_owner_role_id uuid;
  v_admin_role_id uuid;
  v_moderator_role_id uuid;
  v_owner_member_id uuid;
begin
  insert into public.roles (community_id, name, color, position, is_default, is_system)
  values (new.id, '@everyone', '#99aab5', 0, true, true)
  returning id into v_everyone_role_id;

  insert into public.roles (community_id, name, color, position, is_default, is_system)
  values (new.id, 'Owner', '#f04747', 100, false, true)
  returning id into v_owner_role_id;

  insert into public.roles (community_id, name, color, position, is_default, is_system)
  values (new.id, 'Admin', '#43b581', 90, false, true)
  returning id into v_admin_role_id;

  insert into public.roles (community_id, name, color, position, is_default, is_system)
  values (new.id, 'Moderator', '#faa61a', 80, false, true)
  returning id into v_moderator_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select v_owner_role_id, key
  from public.permissions_catalog;

  insert into public.role_permissions (role_id, permission_key)
  values
    (v_everyone_role_id, 'view_channels'),
    (v_everyone_role_id, 'send_messages'),
    (v_everyone_role_id, 'create_reports');

  insert into public.role_permissions (role_id, permission_key)
  values
    (v_admin_role_id, 'view_channels'),
    (v_admin_role_id, 'send_messages'),
    (v_admin_role_id, 'manage_server'),
    (v_admin_role_id, 'manage_roles'),
    (v_admin_role_id, 'manage_members'),
    (v_admin_role_id, 'create_channels'),
    (v_admin_role_id, 'manage_channels'),
    (v_admin_role_id, 'manage_channel_permissions'),
    (v_admin_role_id, 'manage_messages'),
    (v_admin_role_id, 'manage_invites'),
    (v_admin_role_id, 'manage_reports'),
    (v_admin_role_id, 'create_reports');

  insert into public.role_permissions (role_id, permission_key)
  values
    (v_moderator_role_id, 'view_channels'),
    (v_moderator_role_id, 'send_messages'),
    (v_moderator_role_id, 'manage_messages'),
    (v_moderator_role_id, 'manage_reports'),
    (v_moderator_role_id, 'create_reports');

  insert into public.community_members (community_id, user_id, is_owner)
  values (new.id, new.created_by_user_id, true)
  returning id into v_owner_member_id;

  insert into public.member_roles (community_id, member_id, role_id, assigned_by_user_id)
  values (new.id, v_owner_member_id, v_owner_role_id, new.created_by_user_id)
  on conflict (member_id, role_id) do nothing;

  insert into public.channels (community_id, name, kind, position, created_by_user_id)
  values (new.id, 'general', 'text', 0, new.created_by_user_id);

  insert into public.community_settings (community_id) values (new.id);
  insert into public.community_developer_access (community_id, enabled, mode)
  values (new.id, false, 'report_only');

  return new;
end;
$$;
