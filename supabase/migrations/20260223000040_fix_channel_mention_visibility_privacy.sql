-- Hotfix: prevent channel mention notification leaks for members who cannot view the channel.
-- Problem:
--   can_notify_channel_mention(...) only checked community membership + block state,
--   so mentions in private/mod-only channels could notify users who were not allowed
--   to view that channel.
-- Fix:
--   Add a parameterized channel-visibility helper and require it in mention eligibility.

create or replace function public.can_user_view_channel_as(
  p_user_id uuid,
  p_channel_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select c.id, c.community_id
    from public.channels c
    where c.id = p_channel_id
  ),
  me as (
    select cm.id as member_id, cm.community_id, cm.is_owner
    from public.community_members cm
    join target t on t.community_id = cm.community_id
    where cm.user_id = p_user_id
    limit 1
  ),
  everyone_role_decision as (
    select
      bool_or(cro.can_view = false) as has_deny,
      bool_or(cro.can_view = true) as has_allow
    from me
    join public.member_roles mr
      on mr.member_id = me.member_id
     and mr.community_id = me.community_id
    join public.roles r
      on r.id = mr.role_id
     and r.community_id = me.community_id
     and r.is_default = true
    join target t on true
    left join public.channel_role_overwrites cro
      on cro.community_id = t.community_id
     and cro.channel_id = t.id
     and cro.role_id = r.id
  ),
  non_default_role_decision as (
    select
      bool_or(cro.can_view = false) as has_deny,
      bool_or(cro.can_view = true) as has_allow
    from me
    join public.member_roles mr
      on mr.member_id = me.member_id
     and mr.community_id = me.community_id
    join public.roles r
      on r.id = mr.role_id
     and r.community_id = me.community_id
     and coalesce(r.is_default, false) = false
    join target t on true
    left join public.channel_role_overwrites cro
      on cro.community_id = t.community_id
     and cro.channel_id = t.id
     and cro.role_id = r.id
  ),
  member_decision as (
    select
      bool_or(cmo.can_view = false) as has_deny,
      bool_or(cmo.can_view = true) as has_allow
    from me
    join target t on true
    left join public.channel_member_overwrites cmo
      on cmo.community_id = t.community_id
     and cmo.channel_id = t.id
     and cmo.member_id = me.member_id
  ),
  base_permission_decision as (
    select exists (
      select 1
      from me
      join public.member_roles mr
        on mr.member_id = me.member_id
       and mr.community_id = me.community_id
      join public.role_permissions rp
        on rp.role_id = mr.role_id
      where rp.permission_key = 'view_channels'
    ) as has_permission
  )
  select case
    when p_user_id is null or p_channel_id is null then false
    when not exists (select 1 from target) then false
    when not exists (select 1 from me) then false
    when coalesce((select is_owner from me), false) then true
    when coalesce((select has_deny from member_decision), false) then false
    when coalesce((select has_allow from member_decision), false) then true
    when coalesce((select has_deny from non_default_role_decision), false) then false
    when coalesce((select has_allow from non_default_role_decision), false) then true
    when coalesce((select has_deny from everyone_role_decision), false) then false
    when coalesce((select has_allow from everyone_role_decision), false) then true
    else coalesce((select has_permission from base_permission_decision), false)
  end;
$$;

revoke all on function public.can_user_view_channel_as(uuid, uuid) from public;
grant execute on function public.can_user_view_channel_as(uuid, uuid) to authenticated, service_role;

create or replace function public.can_notify_channel_mention(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_community_id uuid,
  p_channel_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_actor_user_id is null
        or p_target_user_id is null
        or p_community_id is null
        or p_channel_id is null
        or p_actor_user_id = p_target_user_id then false
      when public.is_blocked_either_direction(p_actor_user_id, p_target_user_id) then false
      when not public.can_user_view_channel_as(p_target_user_id, p_channel_id) then false
      else exists (
        select 1
        from public.channels c
        join public.community_members cm
          on cm.community_id = c.community_id
        where c.id = p_channel_id
          and c.community_id = p_community_id
          and cm.user_id = p_target_user_id
      )
    end;
$$;

revoke all on function public.can_notify_channel_mention(uuid, uuid, uuid, uuid) from public;
grant execute on function public.can_notify_channel_mention(uuid, uuid, uuid, uuid)
  to authenticated, service_role;
