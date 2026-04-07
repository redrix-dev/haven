-- Hide banned users' messages and restore them only after unban + rejoin.

drop function if exists public.ban_community_member(uuid, uuid, text);

create function public.ban_community_member(
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

revoke all on function public.ban_community_member(uuid, uuid, text) from public;
grant execute on function public.ban_community_member(uuid, uuid, text) to authenticated;

create or replace function public.unban_community_member(
  p_community_id uuid,
  p_target_user_id uuid,
  p_reason text default null
)
returns public.community_bans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_can_manage_bans boolean := false;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_active_ban public.community_bans;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_community_id is null or p_target_user_id is null then
    raise exception 'Community and target user are required'
      using errcode = '22023';
  end if;

  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'Unban reason exceeds 1000 characters'
      using errcode = '22001';
  end if;

  select
    public.is_community_owner(p_community_id),
    public.user_has_permission(p_community_id, 'manage_bans')
  into v_is_owner, v_can_manage_bans;

  if not (coalesce(v_is_owner, false) or coalesce(v_can_manage_bans, false)) then
    raise exception 'Missing permission to unban members'
      using errcode = '42501';
  end if;

  select cb.*
  into v_active_ban
  from public.community_bans cb
  where cb.community_id = p_community_id
    and cb.banned_user_id = p_target_user_id
    and cb.revoked_at is null
  limit 1
  for update;

  if not found then
    raise exception 'No active ban found for this user'
      using errcode = '22023';
  end if;

  update public.community_bans cb
  set
    revoked_at = timezone('utc', now()),
    revoked_by_user_id = v_actor_user_id,
    revoked_reason = v_reason
  where cb.id = v_active_ban.id
  returning * into v_active_ban;

  if exists (
    select 1
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = p_target_user_id
  )
  and not exists (
    select 1
    from public.community_bans cb
    where cb.community_id = p_community_id
      and cb.banned_user_id = p_target_user_id
      and cb.revoked_at is null
  ) then
    update public.messages m
    set is_hidden = false
    where m.author_user_id = p_target_user_id
      and m.community_id = p_community_id
      and m.is_hidden = true;
  end if;

  return v_active_ban;
end;
$$;

revoke all on function public.unban_community_member(uuid, uuid, text) from public;
grant execute on function public.unban_community_member(uuid, uuid, text) to authenticated;

create or replace function public.redeem_community_invite(
  p_code text
)
returns table (
  community_id uuid,
  community_name text,
  joined boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_invite public.invites;
  v_allow_public_invites boolean := false;
  v_already_member boolean := false;
  v_joined boolean := false;
  v_inserted_rows integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if v_code = '' then
    raise exception 'Invite code is required'
      using errcode = '22023';
  end if;

  select i.*
  into v_invite
  from public.invites i
  where upper(i.code) = v_code
    and i.is_active = true
  for update;

  if not found then
    raise exception 'Invite code is invalid or inactive'
      using errcode = '22023';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= timezone('utc', now()) then
    update public.invites
    set is_active = false
    where id = v_invite.id;

    raise exception 'Invite link has expired'
      using errcode = '22023';
  end if;

  if v_invite.max_uses is not null and v_invite.current_uses >= v_invite.max_uses then
    update public.invites
    set is_active = false
    where id = v_invite.id;

    raise exception 'Invite link has reached max uses'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.community_members cm
    where cm.community_id = v_invite.community_id
      and cm.user_id = v_user_id
  )
  into v_already_member;

  if v_already_member then
    return query
    select c.id, c.name, false
    from public.communities c
    where c.id = v_invite.community_id;
    return;
  end if;

  if exists (
    select 1
    from public.community_bans cb
    where cb.community_id = v_invite.community_id
      and cb.banned_user_id = v_user_id
      and cb.revoked_at is null
  ) then
    raise exception 'You are banned from this server'
      using errcode = '42501';
  end if;

  select coalesce(cs.allow_public_invites, false)
  into v_allow_public_invites
  from public.community_settings cs
  where cs.community_id = v_invite.community_id;

  if not v_allow_public_invites then
    raise exception 'This server is not accepting invite joins right now'
      using errcode = '42501';
  end if;

  insert into public.community_members (
    community_id,
    user_id,
    is_owner
  )
  values (
    v_invite.community_id,
    v_user_id,
    false
  )
  on conflict on constraint community_members_community_id_user_id_key do nothing;

  get diagnostics v_inserted_rows = row_count;
  v_joined := v_inserted_rows > 0;

  if v_joined then
    update public.invites
    set
      current_uses = current_uses + 1,
      is_active = case
        when max_uses is not null and (current_uses + 1) >= max_uses then false
        else is_active
      end
    where id = v_invite.id;

    if not exists (
      select 1
      from public.community_bans cb
      where cb.community_id = v_invite.community_id
        and cb.banned_user_id = v_user_id
        and cb.revoked_at is null
    ) then
      update public.messages m
      set is_hidden = false
      where m.author_user_id = v_user_id
        and m.community_id = v_invite.community_id
        and m.is_hidden = true;
    end if;
  end if;

  return query
  select c.id, c.name, v_joined
  from public.communities c
  where c.id = v_invite.community_id;
end;
$$;

revoke all on function public.redeem_community_invite(text) from public;
grant execute on function public.redeem_community_invite(text) to authenticated;
