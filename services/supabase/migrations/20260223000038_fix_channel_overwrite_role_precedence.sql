-- Hotfix: correct channel overwrite precedence so @everyone denies can be
-- overridden by non-default role allows (Discord-like role overwrite behavior).
-- Previous logic aggregated all role overwrites together, causing any explicit
-- @everyone deny to always win even when a Moderator/Admin role allowed access.

create or replace function public.can_view_channel(p_channel_id uuid)
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
    select cm.id as member_id, cm.community_id
    from public.community_members cm
    join target t on t.community_id = cm.community_id
    where cm.user_id = auth.uid()
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
  )
  select case
    when not exists (select 1 from target) then false
    when not exists (select 1 from me) then false
    when public.is_community_owner((select community_id from target)) then true
    when coalesce((select has_deny from member_decision), false) then false
    when coalesce((select has_allow from member_decision), false) then true
    when coalesce((select has_deny from non_default_role_decision), false) then false
    when coalesce((select has_allow from non_default_role_decision), false) then true
    when coalesce((select has_deny from everyone_role_decision), false) then false
    when coalesce((select has_allow from everyone_role_decision), false) then true
    else public.user_has_permission((select community_id from target), 'view_channels')
  end;
$$;

create or replace function public.can_send_in_channel(p_channel_id uuid)
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
    select cm.id as member_id, cm.community_id
    from public.community_members cm
    join target t on t.community_id = cm.community_id
    where cm.user_id = auth.uid()
    limit 1
  ),
  everyone_role_decision as (
    select
      bool_or(cro.can_send = false) as has_deny,
      bool_or(cro.can_send = true) as has_allow
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
      bool_or(cro.can_send = false) as has_deny,
      bool_or(cro.can_send = true) as has_allow
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
      bool_or(cmo.can_send = false) as has_deny,
      bool_or(cmo.can_send = true) as has_allow
    from me
    join target t on true
    left join public.channel_member_overwrites cmo
      on cmo.community_id = t.community_id
     and cmo.channel_id = t.id
     and cmo.member_id = me.member_id
  )
  select case
    when not exists (select 1 from target) then false
    when not exists (select 1 from me) then false
    when public.is_community_owner((select community_id from target)) then true
    when coalesce((select has_deny from member_decision), false) then false
    when coalesce((select has_allow from member_decision), false) then true
    when coalesce((select has_deny from non_default_role_decision), false) then false
    when coalesce((select has_allow from non_default_role_decision), false) then true
    when coalesce((select has_deny from everyone_role_decision), false) then false
    when coalesce((select has_allow from everyone_role_decision), false) then true
    else public.user_has_permission((select community_id from target), 'send_messages')
  end;
$$;

