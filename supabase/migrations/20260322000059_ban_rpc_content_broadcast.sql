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

  -- CHECKPOINT 2 COMPLETE
  return query
  select v_ban.banned_user_id, v_ban.community_id;
end;
$$;

revoke all on function public.ban_community_member(uuid, uuid, text) from public;
grant execute on function public.ban_community_member(uuid, uuid, text) to authenticated;
