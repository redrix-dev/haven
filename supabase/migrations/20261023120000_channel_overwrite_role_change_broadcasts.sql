-- Access loss, server side.
--
-- 1. Channel permission overwrites now broadcast ROLE_CHANGE to the users they
--    affect, like role assignments and role permissions already do. The client
--    reloads that community's permissions and channel list on ROLE_CHANGE, so a
--    channel hidden from someone leaves their sidebar right away. Before this,
--    an overwrite change reached nobody until something else reloaded channels.
--
-- 2. broadcast_member_channel_access_revoked is dropped. It only let a user
--    broadcast to themselves, and nothing has called it since its trigger
--    (the web client's channel-access-lost handler) went unused; overwrite
--    changes now carry that signal from the database.
--
-- 3. ban_community_member no longer sends member_banned. Removing the member
--    row already fires COMMUNITY_MEMBERSHIP_CHANGE to the banned user, which is
--    what the client acts on; the second event only fed a handler registry
--    nothing registered. The function is otherwise unchanged (copied from
--    20260605100000); CREATE OR REPLACE keeps its grants.

-- ---------------------------------------------------------------------------
-- 1. ROLE_CHANGE on channel overwrites
-- ---------------------------------------------------------------------------

create or replace function public.notify_channel_role_overwrite_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  v_community_id uuid;
  rec record;
begin
  if tg_op = 'DELETE' then
    v_role_id := old.role_id;
    v_community_id := old.community_id;
  else
    v_role_id := new.role_id;
    v_community_id := new.community_id;
  end if;

  -- Everyone holding the role (@everyone is a real member_roles row).
  for rec in
    select distinct cm.user_id as uid
    from public.member_roles mr
    inner join public.community_members cm
      on cm.id = mr.member_id
      and cm.community_id = mr.community_id
    where mr.role_id = v_role_id
      and mr.community_id = v_community_id
  loop
    begin
      perform realtime.send(
        jsonb_build_object('community_id', v_community_id::text),
        'ROLE_CHANGE',
        'private_user:' || rec.uid::text,
        true
      );
    exception
      when others then
        null;
    end;
  end loop;

  return null;
end;
$$;

create or replace function public.notify_channel_member_overwrite_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_community_id uuid;
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_member_id := old.member_id;
    v_community_id := old.community_id;
  else
    v_member_id := new.member_id;
    v_community_id := new.community_id;
  end if;

  select cm.user_id into v_user_id
  from public.community_members cm
  where cm.id = v_member_id
    and cm.community_id = v_community_id;

  if v_user_id is not null then
    begin
      perform realtime.send(
        jsonb_build_object('community_id', v_community_id::text),
        'ROLE_CHANGE',
        'private_user:' || v_user_id::text,
        true
      );
    exception
      when others then
        null;
    end;
  end if;

  return null;
end;
$$;

drop trigger if exists notify_channel_role_overwrite_change_trigger
  on public.channel_role_overwrites;
create trigger notify_channel_role_overwrite_change_trigger
after insert or update or delete on public.channel_role_overwrites
for each row
execute function public.notify_channel_role_overwrite_change();

drop trigger if exists notify_channel_member_overwrite_change_trigger
  on public.channel_member_overwrites;
create trigger notify_channel_member_overwrite_change_trigger
after insert or update or delete on public.channel_member_overwrites
for each row
execute function public.notify_channel_member_overwrite_change();

-- Trigger functions are never called directly; firing a trigger does not check
-- EXECUTE, so no client role needs it.
revoke execute on function public.notify_channel_role_overwrite_change()
  from public, anon, authenticated;
revoke execute on function public.notify_channel_member_overwrite_change()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop the self-only revocation broadcast
-- ---------------------------------------------------------------------------

drop function if exists public.broadcast_member_channel_access_revoked(uuid, uuid, uuid);

-- ---------------------------------------------------------------------------
-- 3. Ban without the member_banned broadcast
-- ---------------------------------------------------------------------------

create or replace function public.ban_community_member(
  p_community_id uuid,
  p_target_user_id uuid,
  p_reason text
)
returns table (
  banned_user_id uuid,
  community_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_can_manage_bans boolean := false;
  v_target_member_id uuid;
  v_target_is_owner boolean := false;
  v_reason text := trim(coalesce(p_reason, ''));
  v_existing_ban_id uuid;
  v_ban public.community_bans;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_community_id is null or p_target_user_id is null then
    raise exception 'Community and target user are required'
      using errcode = '22023';
  end if;

  if p_target_user_id = v_actor_user_id then
    raise exception 'You cannot ban yourself'
      using errcode = '22023';
  end if;

  if v_reason = '' then
    raise exception 'Ban reason is required'
      using errcode = '22023';
  end if;

  if char_length(v_reason) > 1000 then
    raise exception 'Ban reason exceeds 1000 characters'
      using errcode = '22001';
  end if;

  select
    public.is_community_owner(p_community_id),
    public.user_has_permission(p_community_id, 'manage_bans')
  into v_is_owner, v_can_manage_bans;

  if not (coalesce(v_is_owner, false) or coalesce(v_can_manage_bans, false)) then
    raise exception 'Missing permission to ban members'
      using errcode = '42501';
  end if;

  select cm.id, cm.is_owner
  into v_target_member_id, v_target_is_owner
  from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = p_target_user_id
  limit 1;

  if coalesce(v_target_is_owner, false) then
    raise exception 'Owners cannot be banned'
      using errcode = '42501';
  end if;

  if
    not coalesce(v_is_owner, false)
    and v_target_member_id is not null
    and not coalesce(public.can_manage_member_by_position(p_community_id, v_target_member_id), false)
  then
    raise exception 'Target member is above your role hierarchy'
      using errcode = '42501';
  end if;

  select cb.id
  into v_existing_ban_id
  from public.community_bans cb
  where cb.community_id = p_community_id
    and cb.banned_user_id = p_target_user_id
    and cb.revoked_at is null
  limit 1
  for update;

  if v_existing_ban_id is not null then
    raise exception 'User is already banned from this server'
      using errcode = '23505';
  end if;

  insert into public.community_bans (
    community_id,
    banned_user_id,
    banned_by_user_id,
    reason,
    banned_at
  )
  values (
    p_community_id,
    p_target_user_id,
    v_actor_user_id,
    v_reason,
    timezone('utc', now())
  )
  returning * into v_ban;

  delete from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = p_target_user_id;

  update public.messages m
  set is_hidden = true
  where m.author_user_id = p_target_user_id
    and m.community_id = p_community_id
    and m.is_hidden = false;

  return query
  select v_ban.banned_user_id, v_ban.community_id;
end;
$$;
