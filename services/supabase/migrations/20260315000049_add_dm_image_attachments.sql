-- Add image attachments to direct messages.

create table if not exists public.dm_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  bucket_name text not null default 'dm-message-media',
  object_path text not null check (char_length(trim(object_path)) > 0),
  original_filename text,
  mime_type text not null check (char_length(trim(mime_type)) > 0),
  media_kind text not null check (media_kind = 'image'),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  unique (message_id),
  unique (bucket_name, object_path)
);

create index if not exists idx_dm_message_attachments_conversation
  on public.dm_message_attachments(conversation_id, created_at asc);

create index if not exists idx_dm_message_attachments_expires_at
  on public.dm_message_attachments(expires_at asc);

alter table public.dm_message_attachments enable row level security;

drop policy if exists dm_message_attachments_select_member on public.dm_message_attachments;
create policy dm_message_attachments_select_member
on public.dm_message_attachments
for select
to authenticated
using (
  (
    public.is_dm_conversation_member(conversation_id)
    or public.is_haven_moderator(auth.uid())
  )
  and expires_at > timezone('utc', now())
);

drop policy if exists dm_message_attachments_insert_sender on public.dm_message_attachments;
create policy dm_message_attachments_insert_sender
on public.dm_message_attachments
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and public.can_send_dm_in_conversation(conversation_id)
  and exists (
    select 1
    from public.dm_messages dm
    where dm.id = dm_message_attachments.message_id
      and dm.conversation_id = dm_message_attachments.conversation_id
      and dm.deleted_at is null
  )
);

drop policy if exists dm_message_attachments_delete_owner on public.dm_message_attachments;
create policy dm_message_attachments_delete_owner
on public.dm_message_attachments
for delete
to authenticated
using (owner_user_id = auth.uid());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dm-message-media',
  'dm-message-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_dm_message_media_select_member on storage.objects;
drop policy if exists storage_dm_message_media_insert_sender on storage.objects;
drop policy if exists storage_dm_message_media_delete_sender on storage.objects;

create policy storage_dm_message_media_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dm-message-media'
  and (
    public.is_dm_conversation_member(public.try_parse_uuid(split_part(name, '/', 1)))
    or public.is_haven_moderator(auth.uid())
  )
);

create policy storage_dm_message_media_insert_sender
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dm-message-media'
  and owner = auth.uid()
  and public.can_send_dm_in_conversation(public.try_parse_uuid(split_part(name, '/', 1)))
);

create policy storage_dm_message_media_delete_sender
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dm-message-media'
  and owner = auth.uid()
);

create or replace function public.extract_visible_dm_message_text(p_content text)
returns text
language sql
immutable
as $$
  select case
    when char_length(
      regexp_replace(
        replace(
          replace(
            replace(
              replace(coalesce(p_content, ''), chr(8203), ''),
              chr(8204),
              ''
            ),
            chr(8205),
            ''
          ),
          chr(65279),
          ''
        ),
        '\s+',
        '',
        'g'
      )
    ) = 0
      then null
    else btrim(coalesce(p_content, ''))
  end;
$$;

create or replace function public.dm_message_preview_text(
  p_content text,
  p_has_attachment boolean
)
returns text
language sql
immutable
as $$
  select coalesce(
    public.extract_visible_dm_message_text(p_content),
    case when coalesce(p_has_attachment, false) then 'Sent an image' else null end
  );
$$;

create or replace function public.dm_message_attachments_json(p_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
        'created_at', ma.created_at,
        'expires_at', ma.expires_at
      )
      order by ma.created_at asc, ma.id asc
    ),
    '[]'::jsonb
  )
  from public.dm_message_attachments ma
  where ma.message_id = p_message_id
    and ma.expires_at > timezone('utc', now());
$$;

revoke all on function public.extract_visible_dm_message_text(text) from public;
revoke all on function public.dm_message_preview_text(text, boolean) from public;
revoke all on function public.dm_message_attachments_json(uuid) from public;

create or replace function public.enqueue_dm_message_attachment_deletion_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.bucket_name is null or old.object_path is null then
    return old;
  end if;

  insert into public.message_attachment_deletion_jobs (
    attachment_id,
    message_id,
    community_id,
    bucket_name,
    object_path,
    reason,
    status,
    available_at
  )
  values (
    old.id,
    old.message_id,
    null,
    old.bucket_name,
    old.object_path,
    'dm_attachment_row_delete',
    'pending',
    timezone('utc', now())
  )
  on conflict (bucket_name, object_path)
  where status in ('pending', 'processing', 'retryable_failed')
  do update
  set
    message_id = coalesce(public.message_attachment_deletion_jobs.message_id, excluded.message_id),
    community_id = coalesce(public.message_attachment_deletion_jobs.community_id, excluded.community_id),
    status = 'pending',
    available_at = timezone('utc', now()),
    locked_at = null,
    lease_expires_at = null,
    processed_at = null,
    last_error = null,
    updated_at = timezone('utc', now());

  return old;
end;
$$;

revoke all on function public.enqueue_dm_message_attachment_deletion_job() from public;
grant execute on function public.enqueue_dm_message_attachment_deletion_job() to postgres, service_role;

drop trigger if exists trg_enqueue_dm_message_attachment_deletion_job on public.dm_message_attachments;
create trigger trg_enqueue_dm_message_attachment_deletion_job
after delete on public.dm_message_attachments
for each row execute function public.enqueue_dm_message_attachment_deletion_job();

create or replace function public.refresh_dm_conversation_last_message_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if tg_op = 'UPDATE' and old.deleted_at is not distinct from new.deleted_at then
    return new;
  end if;

  v_conversation_id := case
    when tg_op = 'DELETE' then old.conversation_id
    else new.conversation_id
  end;

  update public.dm_conversations dc
  set
    last_message_at = (
      select max(dm.created_at)
      from public.dm_messages dm
      where dm.conversation_id = v_conversation_id
        and dm.deleted_at is null
    ),
    updated_at = timezone('utc', now())
  where dc.id = v_conversation_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.refresh_dm_conversation_last_message_on_change() from public;
grant execute on function public.refresh_dm_conversation_last_message_on_change() to postgres, service_role;

drop trigger if exists trg_refresh_dm_conversation_last_message_on_delete on public.dm_messages;
create trigger trg_refresh_dm_conversation_last_message_on_delete
after delete on public.dm_messages
for each row execute function public.refresh_dm_conversation_last_message_on_change();

drop trigger if exists trg_refresh_dm_conversation_last_message_on_soft_delete on public.dm_messages;
create trigger trg_refresh_dm_conversation_last_message_on_soft_delete
after update of deleted_at on public.dm_messages
for each row execute function public.refresh_dm_conversation_last_message_on_change();

create or replace function public.cleanup_expired_dm_message_attachments(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 200), 1);
  v_deleted integer := 0;
begin
  with expired_messages as (
    select
      ma.message_id,
      min(ma.expires_at) as first_expired_at
    from public.dm_message_attachments ma
    where ma.bucket_name = 'dm-message-media'
      and ma.expires_at <= timezone('utc', now())
    group by ma.message_id
    order by first_expired_at asc
    limit v_limit
  ),
  deleted_rows as (
    delete from public.dm_messages dm
    using expired_messages em
    where dm.id = em.message_id
    returning dm.id
  )
  select count(*)::integer
  into v_deleted
  from deleted_rows;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.cleanup_expired_dm_message_attachments(integer) from public;
grant execute on function public.cleanup_expired_dm_message_attachments(integer) to authenticated;

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
    and not public.is_blocked_either_direction(auth.uid(), other_profile.id)
  order by coalesce(dc.last_message_at, dc.updated_at, dc.created_at) desc, dc.id desc;
$$;

revoke all on function public.list_my_dm_conversations() from public;
grant execute on function public.list_my_dm_conversations() to authenticated;

drop function if exists public.list_dm_messages(uuid, integer, timestamptz, uuid);
create function public.list_dm_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null
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
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null then
    raise exception 'DM conversation id is required.';
  end if;

  if not public.is_dm_conversation_member(p_conversation_id) then
    raise exception 'You do not have access to this DM conversation.' using errcode = '42501';
  end if;

  return query
  with page as (
    select
      m.id as message_id,
      m.conversation_id,
      m.author_user_id,
      p.username as author_username,
      p.avatar_url as author_avatar_url,
      m.content,
      m.metadata,
      m.created_at,
      m.edited_at,
      m.deleted_at,
      public.dm_message_attachments_json(m.id) as attachments
    from public.dm_messages m
    join public.profiles p
      on p.id = m.author_user_id
    where m.conversation_id = p_conversation_id
      and m.deleted_at is null
      and (
        p_before_created_at is null
        or m.created_at < p_before_created_at
        or (
          p_before_message_id is not null
          and m.created_at = p_before_created_at
          and m.id < p_before_message_id
        )
      )
    order by m.created_at desc, m.id desc
    limit v_limit
  )
  select *
  from page
  order by created_at asc, message_id asc;
end;
$$;

revoke all on function public.list_dm_messages(uuid, integer, timestamptz, uuid) from public;
grant execute on function public.list_dm_messages(uuid, integer, timestamptz, uuid) to authenticated;

drop function if exists public.send_dm_message(uuid, text, jsonb);
create function public.send_dm_message(
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

create or replace function public.list_dm_message_reports_for_review(
  p_statuses public.dm_message_report_status[] default null,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_report_id uuid default null
)
returns table(
  report_id uuid,
  conversation_id uuid,
  message_id uuid,
  status public.dm_message_report_status,
  kind text,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  reporter_user_id uuid,
  reporter_username text,
  reporter_avatar_url text,
  reported_user_id uuid,
  reported_username text,
  reported_avatar_url text,
  assigned_to_user_id uuid,
  assigned_to_username text,
  assigned_at timestamptz,
  message_created_at timestamptz,
  message_deleted_at timestamptz,
  message_preview text
)
language plpgsql
security definer
set search_path = public
as $$
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
          and ma.expires_at > timezone('utc', now())
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
$$;

revoke all on function public.list_dm_message_reports_for_review(
  public.dm_message_report_status[],
  integer,
  timestamptz,
  uuid
) from public;
grant execute on function public.list_dm_message_reports_for_review(
  public.dm_message_report_status[],
  integer,
  timestamptz,
  uuid
) to authenticated;

drop function if exists public.get_dm_message_report_detail(uuid);
create function public.get_dm_message_report_detail(p_report_id uuid)
returns table(
  report_id uuid,
  conversation_id uuid,
  message_id uuid,
  status public.dm_message_report_status,
  kind text,
  comment text,
  resolution_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  reporter_user_id uuid,
  reporter_username text,
  reporter_avatar_url text,
  reported_user_id uuid,
  reported_username text,
  reported_avatar_url text,
  assigned_to_user_id uuid,
  assigned_to_username text,
  assigned_at timestamptz,
  message_author_user_id uuid,
  message_author_username text,
  message_author_avatar_url text,
  message_content text,
  message_metadata jsonb,
  message_created_at timestamptz,
  message_edited_at timestamptz,
  message_deleted_at timestamptz,
  message_attachments jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(auth.uid()) then
    raise exception 'Only Haven staff can review DM reports.' using errcode = '42501';
  end if;

  return query
  select
    r.id as report_id,
    r.conversation_id,
    r.message_id,
    r.status,
    r.kind,
    r.comment,
    r.resolution_notes,
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
    dm.author_user_id as message_author_user_id,
    author.username as message_author_username,
    author.avatar_url as message_author_avatar_url,
    dm.content as message_content,
    dm.metadata as message_metadata,
    dm.created_at as message_created_at,
    dm.edited_at as message_edited_at,
    dm.deleted_at as message_deleted_at,
    public.dm_message_attachments_json(dm.id) as message_attachments
  from public.dm_message_reports r
  join public.dm_messages dm
    on dm.id = r.message_id
  left join public.profiles reporter
    on reporter.id = r.reporter_user_id
  left join public.profiles reported
    on reported.id = r.reported_user_id
  left join public.profiles assignee
    on assignee.id = r.assigned_to_user_id
  left join public.profiles author
    on author.id = dm.author_user_id
  where r.id = p_report_id
  limit 1;
end;
$$;

revoke all on function public.get_dm_message_report_detail(uuid) from public;
grant execute on function public.get_dm_message_report_detail(uuid) to authenticated;

drop function if exists public.list_dm_message_context(uuid, integer, integer);
create function public.list_dm_message_context(
  p_message_id uuid,
  p_before integer default 20,
  p_after integer default 20
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
  attachments jsonb,
  is_target boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer := greatest(0, least(coalesce(p_before, 20), 100));
  v_after integer := greatest(0, least(coalesce(p_after, 20), 100));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_haven_moderator(auth.uid()) then
    raise exception 'Only Haven staff can review DM context.' using errcode = '42501';
  end if;

  if p_message_id is null then
    raise exception 'DM message id is required.';
  end if;

  return query
  with target as (
    select dm.id, dm.conversation_id
    from public.dm_messages dm
    where dm.id = p_message_id
    limit 1
  ),
  ordered as (
    select
      dm.id as message_id,
      dm.conversation_id,
      dm.author_user_id,
      p.username as author_username,
      p.avatar_url as author_avatar_url,
      dm.content,
      dm.metadata,
      dm.created_at,
      dm.edited_at,
      dm.deleted_at,
      public.dm_message_attachments_json(dm.id) as attachments,
      row_number() over (order by dm.created_at asc, dm.id asc) as row_num
    from public.dm_messages dm
    join target t
      on t.conversation_id = dm.conversation_id
    left join public.profiles p
      on p.id = dm.author_user_id
  ),
  target_row as (
    select o.row_num
    from ordered o
    where o.message_id = p_message_id
    limit 1
  )
  select
    o.message_id,
    o.conversation_id,
    o.author_user_id,
    o.author_username,
    o.author_avatar_url,
    o.content,
    o.metadata,
    o.created_at,
    o.edited_at,
    o.deleted_at,
    o.attachments,
    (o.message_id = p_message_id) as is_target
  from ordered o
  cross join target_row tr
  where o.row_num between greatest(1, tr.row_num - v_before) and (tr.row_num + v_after)
  order by o.created_at asc, o.message_id asc;

  if not found then
    raise exception 'DM message not found.';
  end if;
end;
$$;

revoke all on function public.list_dm_message_context(uuid, integer, integer) from public;
grant execute on function public.list_dm_message_context(uuid, integer, integer) to authenticated;
