-- Courtesy voice controls change the recipient's current session, never a lock.
create function public.send_voice_control(
  p_community_id uuid,
  p_channel_id uuid,
  p_target_user_id uuid,
  p_target_session_id text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner boolean;
  v_target_member uuid;
  v_target_owner boolean;
  v_channel_name text;
  v_actor_name text;
  v_payload jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('mute', 'unmute', 'deafen', 'undeafen', 'remove')
    or p_target_session_id is null or length(p_target_session_id) not between 1 and 120 then
    raise exception 'Invalid voice control' using errcode = '22023';
  end if;
  select c.name into v_channel_name from public.channels c
    where c.id = p_channel_id and c.community_id = p_community_id and c.kind = 'voice';
  if v_channel_name is null or not coalesce(public.can_view_channel(p_channel_id), false) then
    raise exception 'Voice channel is unavailable' using errcode = '42501';
  end if;
  select cm.id, cm.is_owner into v_target_member, v_target_owner
    from public.community_members cm
    where cm.community_id = p_community_id and cm.user_id = p_target_user_id;
  if v_target_member is null then
    raise exception 'Target is not a community member' using errcode = '42501';
  end if;
  if p_target_user_id <> v_actor then
    v_owner := coalesce(public.is_community_owner(p_community_id), false);
    if not (v_owner or coalesce(public.user_has_permission(p_community_id, 'manage_members'), false))
      or coalesce(v_target_owner, false)
      or (not v_owner and not coalesce(public.can_manage_member_by_position(p_community_id, v_target_member), false)) then
      raise exception 'Missing permission to control this member' using errcode = '42501';
    end if;
  end if;
  select p.username into v_actor_name from public.profiles p where p.id = v_actor;
  v_payload := jsonb_build_object(
    'community_id', p_community_id, 'channel_id', p_channel_id,
    'channel_name', v_channel_name, 'target_user_id', p_target_user_id,
    'target_session_id', p_target_session_id,
    'actor_user_id', v_actor, 'actor_name', coalesce(nullif(v_actor_name, ''), 'a moderator'),
    'action', p_action
  );
  perform realtime.send(v_payload, 'VOICE_CONTROL', 'private_user:' || p_target_user_id::text, true);
  return v_payload;
end;
$$;

revoke all on function public.send_voice_control(uuid, uuid, uuid, text, text) from public;
grant execute on function public.send_voice_control(uuid, uuid, uuid, text, text) to authenticated;
