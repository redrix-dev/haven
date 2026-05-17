drop function if exists public.get_my_community_permissions(uuid);

create function public.get_my_community_permissions(p_community_id uuid)
returns table (
  is_owner boolean,
  can_manage_server boolean,
  can_manage_roles boolean,
  can_manage_members boolean,
  can_create_channels boolean,
  can_manage_channel_structure boolean,
  can_manage_channel_permissions boolean,
  can_manage_messages boolean,
  can_manage_bans boolean,
  can_view_ban_hidden boolean,
  can_create_reports boolean,
  can_manage_reports boolean,
  can_refresh_link_previews boolean,
  can_manage_invites boolean,
  is_elevated boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select cm.id, cm.is_owner
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
  ),
  perms as (
    select rp.permission_key
    from public.member_roles mr
    join public.role_permissions rp on rp.role_id = mr.role_id
    join m on m.id = mr.member_id
      and mr.community_id = p_community_id
      and m.is_owner is not true
  )
  select
    coalesce((select m.is_owner from m), false)::boolean as is_owner,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_server')
    end::boolean as can_manage_server,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_roles')
    end::boolean as can_manage_roles,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_members')
    end::boolean as can_manage_members,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'create_channels')
    end::boolean as can_create_channels,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_channels')
    end::boolean as can_manage_channel_structure,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_channel_permissions')
    end::boolean as can_manage_channel_permissions,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_messages')
    end::boolean as can_manage_messages,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_bans')
    end::boolean as can_manage_bans,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'can_view_ban_hidden')
    end::boolean as can_view_ban_hidden,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'create_reports')
    end::boolean as can_create_reports,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_reports')
    end::boolean as can_manage_reports,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'refresh_link_previews')
    end::boolean as can_refresh_link_previews,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (select 1 from perms p where p.permission_key = 'manage_invites')
    end::boolean as can_manage_invites,
    case
      when not exists (select 1 from m) then false
      when (select m.is_owner from m) then true
      else exists (
        select 1
        from public.member_roles mr
        join public.roles r
          on r.id = mr.role_id
          and r.community_id = mr.community_id
        where mr.community_id = p_community_id
          and mr.member_id = (select m.id from m)
          and r.is_system is true
          and r.name in ('Admin', 'Moderator')
      )
    end::boolean as is_elevated;
$$;

revoke all on function public.get_my_community_permissions(uuid) from public;
grant execute on function public.get_my_community_permissions(uuid) to authenticated;
