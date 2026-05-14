alter table public.messages
  add column if not exists is_platform_staff boolean not null default false;

create or replace function public.send_user_message(
  p_community_id uuid,
  p_channel_id uuid,
  p_content text,
  p_reply_to_message_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_display_name text;
  v_avatar_url text;
  v_trimmed text;
  v_is_staff boolean;
  v_reply_to_message_id uuid := p_reply_to_message_id;
  v_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.can_send_in_channel(p_channel_id) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.channels c
    where c.id = p_channel_id
    and c.community_id = p_community_id
  ) then
    raise exception 'Channel not in community' using errcode = '22023';
  end if;

  v_trimmed := trim(p_content);
  if v_trimmed is null or char_length(v_trimmed) < 1
    or char_length(v_trimmed) > 4000 then
    raise exception 'Invalid content length' using errcode = '22023';
  end if;

  select p.username, p.avatar_url
  into v_display_name, v_avatar_url
  from public.profiles p
  where p.id = v_uid
  limit 1;

  if v_display_name is null or char_length(trim(v_display_name)) < 1 then
    raise exception 'Profile username required' using errcode = '22023';
  end if;

  select exists(
    select 1 from public.platform_staff ps
    where ps.user_id = v_uid
    and ps.is_active = true
  ) into v_is_staff;

  if v_reply_to_message_id is not null then
    if not exists (
      select 1 from public.messages m
      where m.id = v_reply_to_message_id
      and m.channel_id = p_channel_id
    ) then
      v_reply_to_message_id := null;
    end if;
  end if;

  insert into public.messages (
    community_id,
    channel_id,
    author_user_id,
    display_name,
    avatar_snapshot_url,
    content,
    metadata,
    reply_to_message_id,
    is_platform_staff
  )
  values (
    p_community_id,
    p_channel_id,
    v_uid,
    trim(v_display_name),
    v_avatar_url,
    v_trimmed,
    coalesce(p_metadata, '{}'::jsonb),
    v_reply_to_message_id,
    coalesce(v_is_staff, false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.send_user_message(uuid, uuid, text, uuid, jsonb)
  from public;
grant execute on function public.send_user_message(uuid, uuid, text, uuid, jsonb)
  to authenticated;
