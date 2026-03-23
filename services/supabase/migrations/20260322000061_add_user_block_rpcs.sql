do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_blocks'
  ) then
    create table public.user_blocks (
      id uuid primary key default gen_random_uuid(),
      blocker_user_id uuid not null references auth.users(id) on delete cascade,
      blocked_user_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz not null default timezone('utc', now()),
      constraint user_blocks_blocker_blocked_unique unique (blocker_user_id, blocked_user_id),
      constraint user_blocks_not_self check (blocker_user_id <> blocked_user_id)
    );
  end if;
end
$$;

alter table public.user_blocks enable row level security;
alter table public.user_blocks replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'user_blocks_select_blocker'
  ) then
    create policy user_blocks_select_blocker
    on public.user_blocks
    for select
    to authenticated
    using (blocker_user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'user_blocks_insert_blocker'
  ) then
    create policy user_blocks_insert_blocker
    on public.user_blocks
    for insert
    to authenticated
    with check (blocker_user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'user_blocks_delete_blocker'
  ) then
    create policy user_blocks_delete_blocker
    on public.user_blocks
    for delete
    to authenticated
    using (blocker_user_id = auth.uid());
  end if;
end
$$;

create or replace function public.list_users_blocking_me()
returns table(blocker_user_id uuid)
language sql
security definer
set search_path = public
as $$
  select ub.blocker_user_id
  from public.user_blocks ub
  where ub.blocked_user_id = auth.uid()
  order by ub.created_at desc, ub.blocker_user_id asc;
$$;

revoke all on function public.list_users_blocking_me() from public;
grant execute on function public.list_users_blocking_me() to authenticated;

create or replace function public.block_user(p_target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.block_user_social(p_target_user_id);
  return p_target_user_id;
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.unblock_user_social(p_target_user_id);
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.list_my_dm_conversations()
returns table(
  conversation_id uuid,
  kind public.dm_conversation_kind,
  other_user_id uuid,
  other_username text,
  other_avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  last_message_id uuid,
  last_message_author_user_id uuid,
  last_message_preview text,
  last_message_created_at timestamptz,
  unread_count integer,
  is_muted boolean,
  muted_until timestamptz
)
language sql
security definer
set search_path = public
as $$
  with my_memberships as (
    select m.conversation_id, m.last_read_at
    from public.dm_conversation_members m
    where m.user_id = auth.uid()
      and m.left_at is null
  )
  select
    dc.id as conversation_id,
    dc.kind,
    other_profile.id as other_user_id,
    other_profile.username as other_username,
    other_profile.avatar_url as other_avatar_url,
    dc.created_at,
    dc.updated_at,
    coalesce(lm.created_at, dc.last_message_at) as last_message_at,
    lm.id as last_message_id,
    lm.author_user_id as last_message_author_user_id,
    case
      when lm.preview_text is null then null
      when char_length(lm.preview_text) > 180 then substring(lm.preview_text from 1 for 180) || '...'
      else lm.preview_text
    end as last_message_preview,
    lm.created_at as last_message_created_at,
    coalesce(unread_counts.unread_count, 0)::integer as unread_count,
    (
      coalesce(dm_pref.muted_until > timezone('utc', now()), false)
      or (
        coalesce(dm_pref.in_app_override, true) = false
        and coalesce(dm_pref.sound_override, true) = false
      )
    ) as is_muted,
    dm_pref.muted_until
  from my_memberships mm
  join public.dm_conversations dc
    on dc.id = mm.conversation_id
  left join public.dm_conversation_notification_preferences dm_pref
    on dm_pref.conversation_id = dc.id
   and dm_pref.user_id = auth.uid()
  left join lateral (
    select
      case
        when dc.kind = 'direct' and dc.direct_user_low_id = auth.uid() then dc.direct_user_high_id
        when dc.kind = 'direct' and dc.direct_user_high_id = auth.uid() then dc.direct_user_low_id
        else null
      end as other_user_id
  ) as direct_other on true
  left join public.profiles other_profile
    on other_profile.id = direct_other.other_user_id
  left join lateral (
    select
      m.id,
      m.author_user_id,
      m.created_at,
      public.dm_message_preview_text(
        m.content,
        exists (
          select 1
          from public.dm_message_attachments ma
          where ma.message_id = m.id
            and ma.expires_at > timezone('utc', now())
        )
      ) as preview_text
    from public.dm_messages m
    where m.conversation_id = dc.id
      and m.deleted_at is null
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::integer as unread_count
    from public.dm_messages m
    where m.conversation_id = dc.id
      and m.deleted_at is null
      and m.author_user_id <> auth.uid()
      and (mm.last_read_at is null or m.created_at > mm.last_read_at)
  ) unread_counts on true
  where dc.kind = 'direct'
  order by coalesce(dc.last_message_at, dc.updated_at, dc.created_at) desc, dc.id desc;
$$;

revoke all on function public.list_my_dm_conversations() from public;
grant execute on function public.list_my_dm_conversations() to authenticated;

create or replace function public.send_dm_message(
  p_conversation_id uuid,
  p_content text,
  p_metadata jsonb default '{}'::jsonb,
  p_image_attachment jsonb default null
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
  deleted_at timestamptz,
  attachments jsonb
)
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_me uuid := auth.uid();
  v_content text := trim(coalesce(p_content, ''));
  v_has_attachment boolean := coalesce(jsonb_typeof(p_image_attachment) = 'object', false);
  v_message public.dm_messages%rowtype;
  v_sender_profile public.profiles%rowtype;
  v_delivery record;
  v_recipient record;
  v_notification_event_id uuid;
  v_message_preview text;
  v_attachment_bucket text;
  v_attachment_object_path text;
  v_attachment_original_filename text;
  v_attachment_mime_type text;
  v_attachment_media_kind text;
  v_attachment_size_bytes bigint;
  v_attachment_expires_in_hours integer;
  v_attachment_expires_at timestamptz;
  v_inserted_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_other_user_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null then
    raise exception 'DM conversation id is required.';
  end if;

  if char_length(v_content) > 4000 then
    raise exception 'DM content must be between 1 and 4000 characters.';
  end if;

  if not v_has_attachment and char_length(v_content) < 1 then
    raise exception 'DM content or image is required.';
  end if;

  select
    case
      when dc.kind = 'direct' and dc.direct_user_low_id = v_me then dc.direct_user_high_id
      when dc.kind = 'direct' and dc.direct_user_high_id = v_me then dc.direct_user_low_id
      else null
    end
  into v_other_user_id
  from public.dm_conversations dc
  where dc.id = p_conversation_id
  limit 1;

  if v_other_user_id is not null
     and public.is_blocked_either_direction(v_me, v_other_user_id) then
    raise exception 'Messaging is unavailable in this conversation because one of you has blocked the other.'
      using errcode = '42501';
  end if;

  if not public.can_send_dm_in_conversation(p_conversation_id) then
    raise exception 'You cannot send messages in this DM conversation.' using errcode = '42501';
  end if;

  if v_has_attachment then
    v_attachment_bucket := nullif(trim(coalesce(p_image_attachment->>'bucketName', p_image_attachment->>'bucket_name', '')), '');
    v_attachment_object_path := nullif(trim(coalesce(p_image_attachment->>'objectPath', p_image_attachment->>'object_path', '')), '');
    v_attachment_original_filename := nullif(trim(coalesce(p_image_attachment->>'originalFilename', p_image_attachment->>'original_filename', '')), '');
    v_attachment_mime_type := nullif(trim(coalesce(p_image_attachment->>'mimeType', p_image_attachment->>'mime_type', '')), '');
    v_attachment_media_kind := nullif(trim(coalesce(p_image_attachment->>'mediaKind', p_image_attachment->>'media_kind', '')), '');
    v_attachment_size_bytes := nullif(coalesce(p_image_attachment->>'sizeBytes', p_image_attachment->>'size_bytes', ''), '')::bigint;
    v_attachment_expires_in_hours := nullif(coalesce(p_image_attachment->>'expiresInHours', p_image_attachment->>'expires_in_hours', ''), '')::integer;

    if v_attachment_bucket is null
       or v_attachment_object_path is null
       or v_attachment_mime_type is null
       or v_attachment_media_kind is null
       or v_attachment_size_bytes is null
       or v_attachment_expires_in_hours is null then
      raise exception 'Invalid DM image attachment.';
    end if;

    if v_attachment_bucket <> 'dm-message-media' then
      raise exception 'Unsupported DM image bucket.';
    end if;

    if v_attachment_media_kind <> 'image' or v_attachment_mime_type not like 'image/%' then
      raise exception 'Only image attachments are supported in direct messages.';
    end if;

    if v_attachment_size_bytes <= 0 then
      raise exception 'DM image size must be greater than zero.';
    end if;

    if v_attachment_expires_in_hours not in (1, 24, 168, 720) then
      raise exception 'DM image expiry must be one of 1, 24, 168, or 720 hours.';
    end if;

    if public.try_parse_uuid(split_part(v_attachment_object_path, '/', 1)) is distinct from p_conversation_id then
      raise exception 'DM image path does not match the conversation.';
    end if;

    if not exists (
      select 1
      from storage.objects so
      where so.bucket_id = v_attachment_bucket
        and so.name = v_attachment_object_path
        and so.owner = v_me
    ) then
      raise exception 'Uploaded DM image not found.';
    end if;

    v_attachment_expires_at := timezone('utc', now())
      + make_interval(hours => v_attachment_expires_in_hours);
    v_inserted_metadata := v_inserted_metadata || jsonb_build_object('hasAttachment', true);
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
    case
      when char_length(v_content) > 0 then v_content
      else chr(8203)
    end,
    v_inserted_metadata
  )
  returning * into v_message;

  if v_has_attachment then
    insert into public.dm_message_attachments (
      message_id,
      conversation_id,
      owner_user_id,
      bucket_name,
      object_path,
      original_filename,
      mime_type,
      media_kind,
      size_bytes,
      expires_at
    )
    values (
      v_message.id,
      p_conversation_id,
      v_me,
      v_attachment_bucket,
      v_attachment_object_path,
      v_attachment_original_filename,
      v_attachment_mime_type,
      v_attachment_media_kind,
      v_attachment_size_bytes,
      v_attachment_expires_at
    );
  end if;

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

  v_message_preview := public.dm_message_preview_text(v_message.content, v_has_attachment);
  if v_message_preview is null then
    v_message_preview := 'New direct message';
  elsif char_length(v_message_preview) > 180 then
    v_message_preview := substring(v_message_preview from 1 for 180) || '...';
  end if;

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
    v_message.deleted_at,
    public.dm_message_attachments_json(v_message.id);
end;
$$;

revoke all on function public.send_dm_message(uuid, text, jsonb, jsonb) from public;
grant execute on function public.send_dm_message(uuid, text, jsonb, jsonb) to authenticated;

-- CHECKPOINT 1 COMPLETE
