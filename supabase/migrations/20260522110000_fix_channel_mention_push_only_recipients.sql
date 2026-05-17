-- 20260514100000_rebuild_messages_subsystem.sql regressed push-only channel mentions:
-- recipient rows were only created when in-app or sound delivery was enabled.

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

  if new.author_user_id is null then
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
