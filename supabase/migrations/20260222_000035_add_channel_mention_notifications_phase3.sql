-- Channel mention notifications (Phase 3)
-- Produces channel_mention notifications from a DB trigger on public.messages inserts.
-- Uses global notification preferences for mention delivery in v1 (server/channel overrides come later).
-- Note: v1 mention parsing supports handle-style usernames ([A-Za-z0-9_], 2-32 chars).

create or replace function public.extract_mentioned_user_ids_from_message(
  p_content text,
  p_community_id uuid
)
returns table(
  user_id uuid,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with handles as (
    select distinct lower(mention_match.parts[2]) as mention_handle
    from regexp_matches(
      coalesce(p_content, ''),
      '(^|[^[:alnum:]_])@([[:alnum:]_]{2,32})',
      'g'
    ) as mention_match(parts)
  )
  select
    p.id as user_id,
    p.username,
    p.avatar_url
  from handles h
  join public.profiles p
    on lower(trim(p.username)) = h.mention_handle
  join public.community_members cm
    on cm.user_id = p.id
   and cm.community_id = p_community_id
  order by lower(p.username), p.id;
$$;

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

create or replace function public.resolve_channel_mention_notification_delivery_for_user(
  p_recipient_user_id uuid,
  p_community_id uuid,
  p_channel_id uuid
)
returns table(deliver_in_app boolean, deliver_sound boolean)
language sql
security definer
set search_path = public
as $$
  -- Phase 3 v1: channel/server overrides are not implemented yet. Use global mention prefs.
  select r.deliver_in_app, r.deliver_sound
  from public.resolve_notification_delivery_for_user(p_recipient_user_id, 'channel_mention') r
  limit 1;
$$;

revoke all on function public.extract_mentioned_user_ids_from_message(text, uuid) from public;
revoke all on function public.can_notify_channel_mention(uuid, uuid, uuid, uuid) from public;
revoke all on function public.resolve_channel_mention_notification_delivery_for_user(uuid, uuid, uuid) from public;
grant execute on function public.extract_mentioned_user_ids_from_message(text, uuid)
  to authenticated, service_role;
grant execute on function public.can_notify_channel_mention(uuid, uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.resolve_channel_mention_notification_delivery_for_user(uuid, uuid, uuid)
  to authenticated, service_role;

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
    select deliver_in_app, deliver_sound
    into v_delivery
    from public.resolve_channel_mention_notification_delivery_for_user(
      v_target.user_id,
      new.community_id,
      new.channel_id
    )
    limit 1;

    if coalesce(v_delivery.deliver_in_app, false) or coalesce(v_delivery.deliver_sound, false) then
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

drop trigger if exists trg_messages_process_channel_mentions on public.messages;
create trigger trg_messages_process_channel_mentions
after insert on public.messages
for each row execute function public.process_channel_message_mentions();
