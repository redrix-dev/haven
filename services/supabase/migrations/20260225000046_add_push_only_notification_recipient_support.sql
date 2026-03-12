-- Allow notification recipient rows to be created for push-only delivery
-- (deliver_in_app=false, deliver_sound=false, push pref enabled).

create or replace function public.create_notification_event_with_recipients(
  p_kind public.notification_kind,
  p_source_kind public.notification_source_kind,
  p_source_id uuid,
  p_actor_user_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_recipients jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
  v_event_id uuid;
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to create notification events'
      using errcode = '42501';
  end if;

  if p_source_id is null then
    raise exception 'Notification source id is required';
  end if;

  insert into public.notification_events (
    kind,
    source_kind,
    source_id,
    actor_user_id,
    payload
  )
  values (
    p_kind,
    p_source_kind,
    p_source_id,
    p_actor_user_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  insert into public.notification_recipients (
    event_id,
    recipient_user_id,
    deliver_in_app,
    deliver_sound
  )
  select
    v_event_id,
    parsed.recipient_user_id,
    parsed.deliver_in_app,
    parsed.deliver_sound
  from (
    select distinct on (recipient_user_id)
      recipient_user_id,
      coalesce(deliver_in_app, true) as deliver_in_app,
      coalesce(deliver_sound, false) as deliver_sound
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as x(
      recipient_user_id uuid,
      deliver_in_app boolean,
      deliver_sound boolean
    )
    where recipient_user_id is not null
  ) parsed
  where parsed.deliver_in_app
     or parsed.deliver_sound
     or public.resolve_notification_push_delivery_for_user(parsed.recipient_user_id, p_kind);

  return v_event_id;
end;
$$;

revoke all on function public.create_notification_event_with_recipients(
  public.notification_kind,
  public.notification_source_kind,
  uuid,
  uuid,
  jsonb,
  jsonb
) from public;
grant execute on function public.create_notification_event_with_recipients(
  public.notification_kind,
  public.notification_source_kind,
  uuid,
  uuid,
  jsonb,
  jsonb
) to postgres, service_role;

create or replace function public.send_friend_request(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(trim(coalesce(p_username, '')));
  v_sender_user_id uuid := auth.uid();
  v_target_user_id uuid;
  v_target_username text;
  v_match_count integer := 0;
  v_pair_low uuid;
  v_pair_high uuid;
  v_existing_pending public.friend_requests%rowtype;
  v_request_id uuid;
  v_sender_profile public.profiles%rowtype;
  v_deliver_in_app boolean := true;
  v_deliver_sound boolean := false;
  v_deliver_push boolean := true;
  v_notification_event_id uuid;
begin
  if v_sender_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if char_length(v_query) < 2 then
    raise exception 'Username is required.';
  end if;

  perform public.assert_friend_request_rate_limit(v_sender_user_id);

  select count(*)::integer
  into v_match_count
  from public.profiles p
  where lower(trim(p.username)) = v_query;

  if v_match_count = 0 then
    raise exception 'No user found with that username.';
  end if;

  if v_match_count > 1 then
    raise exception 'Multiple users matched that username. Case-insensitive username uniqueness must be enforced before using friend search.';
  end if;

  select p.id, p.username
  into v_target_user_id, v_target_username
  from public.profiles p
  where lower(trim(p.username)) = v_query
  limit 1;

  if v_target_user_id is null then
    raise exception 'No user found with that username.';
  end if;

  if v_target_user_id = v_sender_user_id then
    raise exception 'You cannot send a friend request to yourself.';
  end if;

  if public.is_blocked_either_direction(v_sender_user_id, v_target_user_id) then
    raise exception 'Friend requests are not available for this user.';
  end if;

  if public.are_friends(v_sender_user_id, v_target_user_id) then
    raise exception 'You are already friends with this user.';
  end if;

  v_pair_low := least(v_sender_user_id, v_target_user_id);
  v_pair_high := greatest(v_sender_user_id, v_target_user_id);

  select *
  into v_existing_pending
  from public.friend_requests fr
  where fr.pair_user_low_id = v_pair_low
    and fr.pair_user_high_id = v_pair_high
    and fr.status = 'pending'
  order by fr.created_at desc
  limit 1
  for update;

  if found then
    if v_existing_pending.sender_user_id = v_sender_user_id then
      raise exception 'Friend request already pending.';
    end if;
    raise exception 'This user already sent you a friend request.';
  end if;

  insert into public.friend_requests (
    sender_user_id,
    recipient_user_id,
    status
  )
  values (
    v_sender_user_id,
    v_target_user_id,
    'pending'
  )
  returning id into v_request_id;

  select *
  into v_sender_profile
  from public.profiles p
  where p.id = v_sender_user_id
  limit 1;

  select
    r.deliver_in_app,
    r.deliver_sound,
    public.resolve_notification_push_delivery_for_user(v_target_user_id, 'friend_request_received')
  into v_deliver_in_app, v_deliver_sound, v_deliver_push
  from public.resolve_notification_delivery_for_user(v_target_user_id, 'friend_request_received') r
  limit 1;

  if coalesce(v_deliver_in_app, false)
     or coalesce(v_deliver_sound, false)
     or coalesce(v_deliver_push, false) then
    insert into public.notification_events (
      kind,
      source_kind,
      source_id,
      actor_user_id,
      payload
    )
    values (
      'friend_request_received',
      'friend_request',
      v_request_id,
      v_sender_user_id,
      jsonb_build_object(
        'friendRequestId', v_request_id,
        'senderUserId', v_sender_user_id,
        'senderUsername', coalesce(v_sender_profile.username, 'Unknown User'),
        'recipientUserId', v_target_user_id,
        'title', 'Friend request received',
        'message', coalesce(v_sender_profile.username, 'Someone') || ' sent you a friend request.'
      )
    )
    returning id into v_notification_event_id;

    insert into public.notification_recipients (
      event_id,
      recipient_user_id,
      deliver_in_app,
      deliver_sound
    )
    values (
      v_notification_event_id,
      v_target_user_id,
      coalesce(v_deliver_in_app, true),
      coalesce(v_deliver_sound, false)
    );
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.send_friend_request(text) from public;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.accept_friend_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_request public.friend_requests%rowtype;
  v_pair_low uuid;
  v_pair_high uuid;
  v_other_user_id uuid;
  v_deliver_in_app boolean := true;
  v_deliver_sound boolean := false;
  v_deliver_push boolean := true;
  v_notification_event_id uuid;
  v_recipient_profile public.profiles%rowtype;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'Friend request id is required.';
  end if;

  select *
  into v_request
  from public.friend_requests fr
  where fr.id = p_request_id
  for update;

  if not found then
    raise exception 'Friend request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Friend request is no longer pending.';
  end if;

  if v_request.recipient_user_id <> v_me then
    raise exception 'Only the recipient can accept this friend request.'
      using errcode = '42501';
  end if;

  if public.is_blocked_either_direction(v_request.sender_user_id, v_request.recipient_user_id) then
    raise exception 'Cannot accept a friend request for a blocked user.';
  end if;

  v_pair_low := least(v_request.sender_user_id, v_request.recipient_user_id);
  v_pair_high := greatest(v_request.sender_user_id, v_request.recipient_user_id);
  v_other_user_id := v_request.sender_user_id;

  insert into public.friendships (
    user_low_id,
    user_high_id,
    created_via_request_id
  )
  values (
    v_pair_low,
    v_pair_high,
    v_request.id
  )
  on conflict (user_low_id, user_high_id) do nothing;

  update public.friend_requests
  set
    status = 'accepted',
    responded_at = timezone('utc', now()),
    responded_by_user_id = v_me
  where id = v_request.id;

  update public.notification_recipients nr
  set
    seen_at = coalesce(nr.seen_at, timezone('utc', now())),
    read_at = coalesce(nr.read_at, timezone('utc', now()))
  from public.notification_events ne
  where nr.event_id = ne.id
    and nr.recipient_user_id = v_me
    and ne.source_kind = 'friend_request'
    and ne.source_id = v_request.id
    and ne.kind = 'friend_request_received'
    and nr.dismissed_at is null;

  select *
  into v_recipient_profile
  from public.profiles p
  where p.id = v_me
  limit 1;

  select
    r.deliver_in_app,
    r.deliver_sound,
    public.resolve_notification_push_delivery_for_user(v_request.sender_user_id, 'friend_request_accepted')
  into v_deliver_in_app, v_deliver_sound, v_deliver_push
  from public.resolve_notification_delivery_for_user(v_request.sender_user_id, 'friend_request_accepted') r
  limit 1;

  if coalesce(v_deliver_in_app, false)
     or coalesce(v_deliver_sound, false)
     or coalesce(v_deliver_push, false) then
    insert into public.notification_events (
      kind,
      source_kind,
      source_id,
      actor_user_id,
      payload
    )
    values (
      'friend_request_accepted',
      'friend_request',
      v_request.id,
      v_me,
      jsonb_build_object(
        'friendRequestId', v_request.id,
        'actorUserId', v_me,
        'actorUsername', coalesce(v_recipient_profile.username, 'Unknown User'),
        'title', 'Friend request accepted',
        'message', coalesce(v_recipient_profile.username, 'Someone') || ' accepted your friend request.'
      )
    )
    returning id into v_notification_event_id;

    insert into public.notification_recipients (
      event_id,
      recipient_user_id,
      deliver_in_app,
      deliver_sound
    )
    values (
      v_notification_event_id,
      v_request.sender_user_id,
      coalesce(v_deliver_in_app, true),
      coalesce(v_deliver_sound, false)
    );
  end if;

  return v_other_user_id;
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;

create or replace function public.send_dm_message(
  p_conversation_id uuid,
  p_content text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  message_id uuid,
  conversation_id uuid,
  author_user_id uuid,
  author_username text,
  author_avatar_url text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_content text := trim(coalesce(p_content, ''));
  v_message public.dm_messages%rowtype;
  v_sender_profile public.profiles%rowtype;
  v_delivery record;
  v_recipient record;
  v_notification_event_id uuid;
  v_message_preview text;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null then
    raise exception 'DM conversation id is required.';
  end if;

  if char_length(v_content) < 1 or char_length(v_content) > 4000 then
    raise exception 'DM content must be between 1 and 4000 characters.';
  end if;

  if not public.can_send_dm_in_conversation(p_conversation_id) then
    raise exception 'You cannot send messages in this DM conversation.' using errcode = '42501';
  end if;

  perform public.assert_dm_send_rate_limit(v_me);

  insert into public.dm_messages (
    conversation_id,
    author_user_id,
    content,
    metadata
  )
  values (
    p_conversation_id,
    v_me,
    v_content,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_message;

  update public.dm_conversations
  set
    last_message_at = v_message.created_at,
    updated_at = timezone('utc', now())
  where id = p_conversation_id;

  update public.dm_conversation_members as m
  set last_read_at = timezone('utc', now())
  where m.conversation_id = p_conversation_id
    and m.user_id = v_me;

  select *
  into v_sender_profile
  from public.profiles p
  where p.id = v_me
  limit 1;

  v_message_preview := case
    when char_length(v_content) > 180 then substring(v_content from 1 for 180) || '...'
    else v_content
  end;

  for v_recipient in
    select m.user_id
    from public.dm_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id <> v_me
      and m.left_at is null
  loop
    if public.is_blocked_either_direction(v_me, v_recipient.user_id) then
      continue;
    end if;

    select
      deliver_in_app,
      deliver_sound,
      (
        public.resolve_notification_push_delivery_for_user(v_recipient.user_id, 'dm_message')
        and not exists (
          select 1
          from public.dm_conversation_notification_preferences pref
          where pref.conversation_id = p_conversation_id
            and pref.user_id = v_recipient.user_id
            and coalesce(pref.in_app_override, false) = false
            and coalesce(pref.sound_override, false) = false
            and (
              pref.muted_until is null
              or pref.muted_until > timezone('utc', now())
            )
        )
      ) as deliver_push
    into v_delivery
    from public.resolve_dm_notification_delivery_for_user(v_recipient.user_id, p_conversation_id)
    limit 1;

    if coalesce(v_delivery.deliver_in_app, false)
       or coalesce(v_delivery.deliver_sound, false)
       or coalesce(v_delivery.deliver_push, false) then
      insert into public.notification_events (
        kind,
        source_kind,
        source_id,
        actor_user_id,
        payload
      )
      values (
        'dm_message',
        'dm_message',
        v_message.id,
        v_me,
        jsonb_build_object(
          'dmMessageId', v_message.id,
          'conversationId', p_conversation_id,
          'title', 'Direct message',
          'message', v_message_preview
        )
      )
      returning id into v_notification_event_id;

      insert into public.notification_recipients (
        event_id,
        recipient_user_id,
        deliver_in_app,
        deliver_sound
      )
      values (
        v_notification_event_id,
        v_recipient.user_id,
        coalesce(v_delivery.deliver_in_app, true),
        coalesce(v_delivery.deliver_sound, false)
      );
    end if;
  end loop;

  return query
  select
    v_message.id,
    v_message.conversation_id,
    v_message.author_user_id,
    v_sender_profile.username,
    v_sender_profile.avatar_url,
    v_message.content,
    v_message.metadata,
    v_message.created_at,
    v_message.edited_at,
    v_message.deleted_at;
end;
$$;

revoke all on function public.send_dm_message(uuid, text, jsonb) from public;
grant execute on function public.send_dm_message(uuid, text, jsonb) to authenticated;

create or replace function public.process_channel_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_profile public.profiles%rowtype;
  v_channel_name text;
  v_community_name text;
  v_message_preview text;
  v_delivery record;
  v_target record;
  v_notification_event_id uuid;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if new.author_type <> 'user' or new.author_user_id is null then
    return new;
  end if;

  if new.deleted_at is not null then
    return new;
  end if;

  if new.content is null or position('@' in new.content) = 0 then
    return new;
  end if;

  select *
  into v_actor_profile
  from public.profiles p
  where p.id = new.author_user_id
  limit 1;

  select c.name, comm.name
  into v_channel_name, v_community_name
  from public.channels c
  join public.communities comm
    on comm.id = c.community_id
  where c.id = new.channel_id
    and c.community_id = new.community_id
  limit 1;

  v_message_preview := case
    when char_length(new.content) > 180 then substring(new.content from 1 for 180) || '...'
    else new.content
  end;

  for v_target in
    select mentioned.user_id, mentioned.username
    from public.extract_mentioned_user_ids_from_message(new.content, new.community_id) mentioned
    where public.can_notify_channel_mention(
      new.author_user_id,
      mentioned.user_id,
      new.community_id,
      new.channel_id
    )
  loop
    select
      deliver_in_app,
      deliver_sound,
      public.resolve_notification_push_delivery_for_user(v_target.user_id, 'channel_mention') as deliver_push
    into v_delivery
    from public.resolve_channel_mention_notification_delivery_for_user(
      v_target.user_id,
      new.community_id,
      new.channel_id
    )
    limit 1;

    if coalesce(v_delivery.deliver_in_app, false)
       or coalesce(v_delivery.deliver_sound, false)
       or coalesce(v_delivery.deliver_push, false) then
      insert into public.notification_events (
        kind,
        source_kind,
        source_id,
        actor_user_id,
        payload
      )
      values (
        'channel_mention',
        'message',
        new.id,
        new.author_user_id,
        jsonb_build_object(
          'messageId', new.id,
          'communityId', new.community_id,
          'channelId', new.channel_id,
          'title', coalesce(v_actor_profile.username, 'Someone') || ' mentioned you',
          'message',
            coalesce(v_actor_profile.username, 'Someone')
            || ' mentioned you in #'
            || coalesce(v_channel_name, 'channel')
            || case
                 when v_message_preview is not null and char_length(trim(v_message_preview)) > 0
                   then ': ' || v_message_preview
                 else ''
               end,
          'channelName', v_channel_name,
          'communityName', v_community_name
        )
      )
      returning id into v_notification_event_id;

      insert into public.notification_recipients (
        event_id,
        recipient_user_id,
        deliver_in_app,
        deliver_sound
      )
      values (
        v_notification_event_id,
        v_target.user_id,
        coalesce(v_delivery.deliver_in_app, true),
        coalesce(v_delivery.deliver_sound, false)
      )
      on conflict (event_id, recipient_user_id) do nothing;
    end if;
  end loop;

  return new;
end;
$$;
