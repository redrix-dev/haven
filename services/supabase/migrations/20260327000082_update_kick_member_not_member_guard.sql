drop function if exists public.kick_community_member(uuid, uuid);

create function public.kick_community_member(
  p_community_id uuid,
  p_target_user_id uuid
)
returns table (
  kicked_user_id uuid,
  community_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_can_manage_members boolean := false;
  v_target_member_id uuid;
  v_target_is_owner boolean := false;
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
    raise exception 'You cannot remove yourself from the server'
      using errcode = '22023';
  end if;

  select
    public.is_community_owner(p_community_id),
    public.user_has_permission(p_community_id, 'manage_members')
  into v_is_owner, v_can_manage_members;

  if not (coalesce(v_is_owner, false) or coalesce(v_can_manage_members, false)) then
    raise exception 'Missing permission to remove members'
      using errcode = '42501';
  end if;

  select cm.id, cm.is_owner
  into v_target_member_id, v_target_is_owner
  from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = p_target_user_id
  limit 1;

  if v_target_member_id is null then
    raise exception 'User is not a member of this server'
      using errcode = '22023';
  end if;

  if coalesce(v_target_is_owner, false) then
    raise exception 'Owners cannot be removed from the server'
      using errcode = '42501';
  end if;

  if
    not coalesce(v_is_owner, false)
    and not coalesce(public.can_manage_member_by_position(p_community_id, v_target_member_id), false)
  then
    raise exception 'Target member is above your role hierarchy'
      using errcode = '42501';
  end if;

  delete from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = p_target_user_id;

  return query
  select p_target_user_id, p_community_id;
end;
$$;

revoke all on function public.kick_community_member(uuid, uuid) from public;
grant execute on function public.kick_community_member(uuid, uuid) to authenticated;
