-- HAV-19: media no longer expires. An attachment is kept until its message,
-- its owner's account, or its community (or DM conversation) is deleted; the
-- existing delete triggers queue the storage object for removal then.
--
-- Before this, every attachment had an expires_at (clients defaulted to 30
-- days for community media and 24 hours for DM images), reads hid it after
-- that, and the media-maintenance worker deleted the whole message.
--
-- Old clients: send_dm_message ignores an expiresInHours key if one is still
-- sent. A community upload from an old client that still writes expires_at
-- fails until the client updates.

-- 1. Reads stop filtering on expiry.
alter policy message_attachments_select_visible_channel
on public.message_attachments
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
  )
);

alter policy dm_message_attachments_select_member
on public.dm_message_attachments
using (
  public.is_dm_conversation_member(conversation_id)
  or public.is_haven_moderator(auth.uid())
);

-- 2. Functions that read or write attachments, as they were minus expiry.
--    Bodies are the live definitions with only the expiry lines removed.

CREATE OR REPLACE FUNCTION public.dm_message_attachments_json(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ma.id,
        'message_id', ma.message_id,
        'conversation_id', ma.conversation_id,
        'owner_user_id', ma.owner_user_id,
        'bucket_name', ma.bucket_name,
        'object_path', ma.object_path,
        'original_filename', ma.original_filename,
        'mime_type', ma.mime_type,
        'media_kind', ma.media_kind,
        'size_bytes', ma.size_bytes,
        'created_at', ma.created_at
      )
      order by ma.created_at asc, ma.id asc
    ),
    '[]'::jsonb
  )
  from public.dm_message_attachments ma
  where ma.message_id = p_message_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_channel_message(p_community_id uuid, p_channel_id uuid, p_message_id uuid)
 RETURNS TABLE(id uuid, channel_id uuid, author_user_id uuid, display_name text, avatar_snapshot_url text, content text, metadata jsonb, reply_to_message_id uuid, created_at timestamp with time zone, edited_at timestamp with time zone, deleted_at timestamp with time zone, is_hidden boolean, is_platform_staff boolean, reactions jsonb, attachment jsonb, link_preview jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with base as (
    select m.*
    from public.messages m
    where m.id = p_message_id
      and m.channel_id = p_channel_id
      and m.community_id = p_community_id
      and exists (
        select 1
        from public.channels c
        where c.id = p_channel_id
          and c.community_id = p_community_id
      )
      and public.can_view_channel(p_channel_id)
      and (
        not m.is_hidden
        or public.user_has_permission(p_community_id, 'can_view_ban_hidden')
      )
  )
  select
    b.id,
    b.channel_id,
    b.author_user_id,
    b.display_name,
    b.avatar_snapshot_url,
    b.content,
    b.metadata,
    b.reply_to_message_id,
    b.created_at,
    b.edited_at,
    b.deleted_at,
    b.is_hidden,
    b.is_platform_staff,
    (
      select jsonb_agg(to_jsonb(mr))
      from public.message_reactions mr
      where mr.message_id = b.id
    ) as reactions,
    (
      select to_jsonb(row_to_json(s))
      from (
        select *
        from public.message_attachments ma
        where ma.message_id = b.id
        order by ma.created_at desc, ma.id desc
        limit 1
      ) s
    ) as attachment,
    (
      select to_jsonb(row_to_json(lp))
      from (
        select *
        from public.message_link_previews mlp
        where mlp.message_id = b.id
        limit 1
      ) lp
    ) as link_preview
  from base b;
$function$;

CREATE OR REPLACE FUNCTION public.list_channel_messages(p_community_id uuid, p_channel_id uuid, p_limit integer DEFAULT 50, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_message_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, channel_id uuid, author_user_id uuid, display_name text, avatar_snapshot_url text, content text, metadata jsonb, reply_to_message_id uuid, created_at timestamp with time zone, edited_at timestamp with time zone, deleted_at timestamp with time zone, is_hidden boolean, is_platform_staff boolean, reactions jsonb, attachment jsonb, link_preview jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with lim as (
    select least(greatest(coalesce(p_limit, 50), 1), 100) as n
  ),
  base as (
    select m.*
    from public.messages m, lim
    where m.channel_id = p_channel_id
      and m.community_id = p_community_id
      and exists (
        select 1
        from public.channels c
        where c.id = p_channel_id
          and c.community_id = p_community_id
      )
      and public.can_view_channel(p_channel_id)
      and (
        not m.is_hidden
        or public.user_has_permission(p_community_id, 'can_view_ban_hidden')
      )
      and (
        p_before_created_at is null
        or m.created_at < p_before_created_at
        or (
          m.created_at = p_before_created_at
          and p_before_message_id is not null
          and m.id < p_before_message_id
        )
      )
    order by m.created_at desc, m.id desc
    limit (select n from lim)
  )
  select
    b.id,
    b.channel_id,
    b.author_user_id,
    b.display_name,
    b.avatar_snapshot_url,
    b.content,
    b.metadata,
    b.reply_to_message_id,
    b.created_at,
    b.edited_at,
    b.deleted_at,
    b.is_hidden,
    b.is_platform_staff,
    (
      select jsonb_agg(to_jsonb(mr))
      from public.message_reactions mr
      where mr.message_id = b.id
    ) as reactions,
    (
      select to_jsonb(row_to_json(s))
      from (
        select *
        from public.message_attachments ma
        where ma.message_id = b.id
        order by ma.created_at desc, ma.id desc
        limit 1
      ) s
    ) as attachment,
    (
      select to_jsonb(row_to_json(lp))
      from (
        select *
        from public.message_link_previews mlp
        where mlp.message_id = b.id
        limit 1
      ) lp
    ) as link_preview
  from base b
  order by b.created_at desc, b.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.list_dm_message_reports_for_review(p_statuses dm_message_report_status[] DEFAULT NULL::dm_message_report_status[], p_limit integer DEFAULT 50, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_report_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(report_id uuid, conversation_id uuid, message_id uuid, status dm_message_report_status, kind text, comment text, created_at timestamp with time zone, updated_at timestamp with time zone, reporter_user_id uuid, reporter_username text, reporter_avatar_url text, reported_user_id uuid, reported_username text, reported_avatar_url text, assigned_to_user_id uuid, assigned_to_username text, assigned_at timestamp with time zone, message_created_at timestamp with time zone, message_deleted_at timestamp with time zone, message_preview text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(auth.uid()) then
    raise exception 'Only Haven staff can review DM reports.' using errcode = '42501';
  end if;

  return query
  with bounded as (
    select greatest(1, least(coalesce(p_limit, 50), 100)) as next_limit
  )
  select
    r.id as report_id,
    r.conversation_id,
    r.message_id,
    r.status,
    r.kind,
    r.comment,
    r.created_at,
    r.updated_at,
    r.reporter_user_id,
    reporter.username as reporter_username,
    reporter.avatar_url as reporter_avatar_url,
    r.reported_user_id,
    reported.username as reported_username,
    reported.avatar_url as reported_avatar_url,
    r.assigned_to_user_id,
    assignee.username as assigned_to_username,
    r.assigned_at,
    dm.created_at as message_created_at,
    dm.deleted_at as message_deleted_at,
    case
      when preview.preview_text is null then null
      when char_length(preview.preview_text) > 220 then substring(preview.preview_text from 1 for 220) || '...'
      else preview.preview_text
    end as message_preview
  from public.dm_message_reports r
  join public.dm_messages dm
    on dm.id = r.message_id
  left join public.profiles reporter
    on reporter.id = r.reporter_user_id
  left join public.profiles reported
    on reported.id = r.reported_user_id
  left join public.profiles assignee
    on assignee.id = r.assigned_to_user_id
  left join lateral (
    select public.dm_message_preview_text(
      dm.content,
      exists (
        select 1
        from public.dm_message_attachments ma
        where ma.message_id = dm.id
      )
    ) as preview_text
  ) preview on true
  cross join bounded b
  where (
      p_statuses is null
      or coalesce(array_length(p_statuses, 1), 0) = 0
      or r.status = any (p_statuses)
    )
    and (
      p_before_created_at is null
      or r.created_at < p_before_created_at
      or (
        p_before_report_id is not null
        and r.created_at = p_before_created_at
        and r.id < p_before_report_id
      )
    )
  order by r.created_at desc, r.id desc
  limit (select next_limit from bounded);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_dm_conversations()
 RETURNS TABLE(conversation_id uuid, kind dm_conversation_kind, other_user_id uuid, other_username text, other_avatar_url text, created_at timestamp with time zone, updated_at timestamp with time zone, last_message_at timestamp with time zone, last_message_id uuid, last_message_author_user_id uuid, last_message_preview text, last_message_created_at timestamp with time zone, unread_count integer, is_muted boolean, muted_until timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.send_dm_message(p_conversation_id uuid, p_content text, p_metadata jsonb DEFAULT '{}'::jsonb, p_image_attachment jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(message_id uuid, conversation_id uuid, author_user_id uuid, author_username text, author_avatar_url text, content text, metadata jsonb, created_at timestamp with time zone, edited_at timestamp with time zone, deleted_at timestamp with time zone, attachments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
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

    if v_attachment_bucket is null
       or v_attachment_object_path is null
       or v_attachment_mime_type is null
       or v_attachment_media_kind is null
       or v_attachment_size_bytes is null then
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
      size_bytes
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
      v_attachment_size_bytes
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
$function$;

-- 3. The expiry sweeps go. The deletion job queue they fed stays: it is what
--    removes storage objects when an attachment row is deleted.
drop function public.cleanup_expired_message_attachments(integer);
drop function public.cleanup_expired_dm_message_attachments(integer);

-- 4. The column itself.
drop index if exists public.idx_message_attachments_expires_at;
drop index if exists public.idx_dm_message_attachments_expires_at;
alter table public.message_attachments drop column expires_at;
alter table public.dm_message_attachments drop column expires_at;
