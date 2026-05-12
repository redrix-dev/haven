-- Clean rebuild of the messages subsystem: new messages shape, RPCs, retired support_report_messages
-- and haven_dev messaging artifacts.

-- ---------------------------------------------------------------------------
-- REMOVE
-- ---------------------------------------------------------------------------

drop trigger if exists trg_enqueue_link_preview_job_for_message on public.messages;
drop trigger if exists trg_messages_process_channel_mentions on public.messages;

drop table if exists public.message_reactions cascade;
drop table if exists public.message_attachments cascade;
drop table if exists public.message_link_previews cascade;
drop table if exists public.link_preview_jobs cascade;
drop table if exists public.message_attachment_deletion_jobs cascade;

drop table if exists public.support_report_messages cascade;

drop table if exists public.messages cascade;

drop table if exists public.community_developer_access_channels cascade;
drop table if exists public.community_developer_access cascade;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'send_message'
  loop
    execute format('drop function %s cascade', r.sig);
  end loop;
end $$;

drop function if exists public.get_message_author_profiles(uuid[], uuid);
drop function if exists public.post_haven_dev_message(uuid, uuid, text, jsonb);
drop function if exists public.can_post_haven_dev_message(uuid);

drop type if exists public.message_author_type cascade;

alter table if exists public.platform_staff
  drop column if exists can_post_haven_dev;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'member_roles'
    ) then
      alter publication supabase_realtime drop table public.member_roles;
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'role_permissions'
    ) then
      alter publication supabase_realtime drop table public.role_permissions;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RECREATE public.messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_user_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  avatar_snapshot_url text,
  content text not null check (char_length(content) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default timezone('utc', clock_timestamp()),
  edited_at timestamptz,
  deleted_at timestamptz,
  is_hidden boolean not null default false
);

create index idx_messages_channel_visible_created_id_desc
  on public.messages (channel_id, created_at desc, id desc)
  where deleted_at is null;

create index idx_messages_community_hidden
  on public.messages (community_id, is_hidden);

create index idx_messages_author
  on public.messages (author_user_id, created_at desc);

alter table public.messages replica identity full;

alter table public.messages enable row level security;

create policy messages_select_visible_channel
on public.messages
for select
to authenticated
using (
  public.can_view_channel(channel_id)
  and (
    not is_hidden
    or public.user_has_permission(community_id, 'can_view_ban_hidden')
  )
);

create policy messages_insert_self
on public.messages
for insert
to authenticated
with check (
  author_user_id = auth.uid()
  and public.can_send_in_channel(channel_id)
);

create policy messages_update_self
on public.messages
for update
to authenticated
using (author_user_id = auth.uid() and deleted_at is null)
with check (author_user_id = auth.uid());

create policy messages_delete_self_or_moderator
on public.messages
for delete
to authenticated
using (
  author_user_id = auth.uid()
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_messages')
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Dependent tables (restored definitions; message_attachments policies omit haven_dev)
-- ---------------------------------------------------------------------------

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(trim(emoji)) between 1 and 32),
  created_at timestamptz not null default timezone('utc', now()),
  unique (message_id, user_id, emoji)
);

create index idx_message_reactions_channel on public.message_reactions (channel_id, created_at asc);
create index idx_message_reactions_message on public.message_reactions (message_id, created_at asc);

alter table public.message_reactions enable row level security;

create policy message_reactions_select_visible_channel
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
  )
);

create policy message_reactions_insert_sender
on public.message_reactions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_send_in_channel(channel_id)
  and exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
      and m.community_id = message_reactions.community_id
      and m.channel_id = message_reactions.channel_id
      and m.deleted_at is null
  )
);

create policy message_reactions_delete_self_or_moderator
on public.message_reactions
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_messages')
);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  bucket_name text not null default 'message-media',
  object_path text not null check (char_length(trim(object_path)) > 0),
  original_filename text,
  mime_type text not null check (char_length(trim(mime_type)) > 0),
  media_kind text not null check (media_kind in ('image', 'video', 'file')),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  unique (bucket_name, object_path),
  constraint message_attachments_bucket_name_check check (bucket_name = 'message-media')
);

create index idx_message_attachments_channel on public.message_attachments (channel_id, created_at asc);
create index idx_message_attachments_expires_at on public.message_attachments (expires_at asc);

alter table public.message_attachments enable row level security;

create policy message_attachments_select_visible_channel
on public.message_attachments
for select
to authenticated
using (
  expires_at > timezone('utc', now())
  and exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
  )
);

create policy message_attachments_insert_sender
on public.message_attachments
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and bucket_name = 'message-media'
  and public.can_send_in_channel(channel_id)
  and exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
      and m.community_id = message_attachments.community_id
      and m.channel_id = message_attachments.channel_id
      and m.deleted_at is null
  )
  and exists (
    select 1
    from storage.objects so
    where so.bucket_id = message_attachments.bucket_name
      and so.name = message_attachments.object_path
      and so.owner = auth.uid()
  )
);

create policy message_attachments_delete_self_or_moderator
on public.message_attachments
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_messages')
);

create table public.message_attachment_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid,
  message_id uuid,
  community_id uuid,
  bucket_name text not null check (char_length(trim(bucket_name)) > 0),
  object_path text not null check (char_length(trim(object_path)) > 0),
  reason text not null default 'attachment_row_delete',
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'retryable_failed', 'done', 'dead_letter')
  ),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  lease_expires_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_message_attachment_deletion_jobs_status_available
  on public.message_attachment_deletion_jobs (status, available_at asc, created_at asc);

create index idx_message_attachment_deletion_jobs_message
  on public.message_attachment_deletion_jobs (message_id, created_at asc);

create unique index uq_message_attachment_deletion_jobs_active_object
  on public.message_attachment_deletion_jobs (bucket_name, object_path)
  where status in ('pending', 'processing', 'retryable_failed');

alter table public.message_attachment_deletion_jobs enable row level security;

create or replace function public.enqueue_message_attachment_deletion_job()
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
    old.community_id,
    old.bucket_name,
    old.object_path,
    'attachment_row_delete',
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

revoke all on function public.enqueue_message_attachment_deletion_job() from public;
grant execute on function public.enqueue_message_attachment_deletion_job() to postgres, service_role;

drop trigger if exists trg_enqueue_message_attachment_deletion_job on public.message_attachments;
create trigger trg_enqueue_message_attachment_deletion_job
after delete on public.message_attachments
for each row execute function public.enqueue_message_attachment_deletion_job();

drop trigger if exists trg_message_attachment_deletion_jobs_set_updated_at on public.message_attachment_deletion_jobs;
create trigger trg_message_attachment_deletion_jobs_set_updated_at
before update on public.message_attachment_deletion_jobs
for each row execute function public.set_updated_at();

revoke all on table public.message_attachment_deletion_jobs from public;
revoke all on table public.message_attachment_deletion_jobs from authenticated;

create table public.message_link_previews (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  source_url text,
  normalized_url text,
  status public.link_preview_status not null default 'pending',
  cache_id uuid references public.link_preview_cache(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  embed_provider public.link_embed_provider not null default 'none',
  thumbnail_bucket_name text,
  thumbnail_object_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_message_link_previews_channel
  on public.message_link_previews (channel_id, updated_at desc);

create index idx_message_link_previews_status
  on public.message_link_previews (status, updated_at desc);

alter table public.message_link_previews replica identity full;

alter table public.message_link_previews enable row level security;

create policy message_link_previews_select_visible_channel
on public.message_link_previews
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_link_previews.message_id
  )
);

drop trigger if exists trg_message_link_previews_set_updated_at on public.message_link_previews;
create trigger trg_message_link_previews_set_updated_at
before update on public.message_link_previews
for each row execute function public.set_updated_at();

create table public.link_preview_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reason text not null check (reason in ('insert', 'edit', 'backfill', 'retry')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'retryable_failed', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_link_preview_jobs_status_available
  on public.link_preview_jobs (status, available_at asc, created_at asc);

create unique index uq_link_preview_jobs_active_message
  on public.link_preview_jobs (message_id)
  where status in ('pending', 'processing', 'retryable_failed');

alter table public.link_preview_jobs enable row level security;

drop trigger if exists trg_link_preview_jobs_set_updated_at on public.link_preview_jobs;
create trigger trg_link_preview_jobs_set_updated_at
before update on public.link_preview_jobs
for each row execute function public.set_updated_at();

revoke all on table public.link_preview_jobs from public;
revoke all on table public.link_preview_jobs from authenticated;

create or replace function public.enqueue_link_preview_job_for_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_url text;
  v_new_url text;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      return new;
    end if;

    v_new_url := public.extract_first_http_url(new.content);
    if v_new_url is null then
      return new;
    end if;

    v_reason := 'insert';
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is distinct from new.deleted_at then
      delete from public.message_link_previews where message_id = new.id;
      delete from public.link_preview_jobs
      where message_id = new.id
        and status in ('pending', 'processing', 'retryable_failed');
      return new;
    end if;

    v_old_url := case when old.deleted_at is null then public.extract_first_http_url(old.content) else null end;
    v_new_url := case when new.deleted_at is null then public.extract_first_http_url(new.content) else null end;

    if coalesce(v_old_url, '') = coalesce(v_new_url, '') then
      return new;
    end if;

    if v_new_url is null then
      delete from public.message_link_previews where message_id = new.id;
      delete from public.link_preview_jobs
      where message_id = new.id
        and status in ('pending', 'processing', 'retryable_failed');
      return new;
    end if;

    v_reason := case when v_old_url is null then 'insert' else 'edit' end;
  else
    return new;
  end if;

  insert into public.message_link_previews (
    message_id,
    community_id,
    channel_id,
    source_url,
    normalized_url,
    status,
    cache_id,
    snapshot,
    embed_provider,
    thumbnail_bucket_name,
    thumbnail_object_path,
    updated_at
  )
  values (
    new.id,
    new.community_id,
    new.channel_id,
    v_new_url,
    null,
    'pending',
    null,
    '{}'::jsonb,
    'none',
    null,
    null,
    timezone('utc', now())
  )
  on conflict (message_id)
  do update
  set
    source_url = excluded.source_url,
    normalized_url = null,
    status = 'pending',
    cache_id = null,
    snapshot = '{}'::jsonb,
    embed_provider = 'none',
    thumbnail_bucket_name = null,
    thumbnail_object_path = null,
    updated_at = timezone('utc', now());

  insert into public.link_preview_jobs (
    message_id,
    reason,
    status,
    available_at
  )
  values (
    new.id,
    v_reason,
    'pending',
    timezone('utc', now())
  )
  on conflict (message_id)
  where status in ('pending', 'processing', 'retryable_failed')
  do update
  set
    reason = excluded.reason,
    status = 'pending',
    available_at = timezone('utc', now()),
    locked_at = null,
    lease_expires_at = null,
    last_error = null,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

revoke all on function public.enqueue_link_preview_job_for_message() from public;
grant execute on function public.enqueue_link_preview_job_for_message() to postgres, service_role;

drop trigger if exists trg_enqueue_link_preview_job_for_message on public.messages;
create trigger trg_enqueue_link_preview_job_for_message
after insert or update of content, deleted_at on public.messages
for each row execute function public.enqueue_link_preview_job_for_message();

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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_reactions'
    ) then
      alter publication supabase_realtime add table public.message_reactions;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_attachments'
    ) then
      alter publication supabase_realtime add table public.message_attachments;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_link_previews'
    ) then
      alter publication supabase_realtime add table public.message_link_previews;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_channel_messages(
  p_community_id uuid,
  p_channel_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null
)
returns table (
  id uuid,
  author_user_id uuid,
  display_name text,
  avatar_snapshot_url text,
  content text,
  metadata jsonb,
  reply_to_message_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  is_hidden boolean,
  reactions jsonb,
  attachment jsonb,
  link_preview jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
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
          and ma.expires_at > timezone('utc', now())
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
$$;

revoke all on function public.list_channel_messages(uuid, uuid, integer, timestamptz, uuid) from public;
grant execute on function public.list_channel_messages(uuid, uuid, integer, timestamptz, uuid) to authenticated;

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
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_display_name text;
  v_avatar_url text;
  v_trimmed text := trim(coalesce(p_content, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.can_send_in_channel(p_channel_id) then
    raise exception 'Cannot send in this channel' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.channels c
    where c.id = p_channel_id
      and c.community_id = p_community_id
  ) then
    raise exception 'Channel not in community' using errcode = '22023';
  end if;

  if char_length(v_trimmed) < 1 or char_length(v_trimmed) > 4000 then
    raise exception 'Message content must be between 1 and 4000 characters' using errcode = '22023';
  end if;

  if p_reply_to_message_id is not null then
    if not exists (
      select 1
      from public.messages rm
      where rm.id = p_reply_to_message_id
        and rm.channel_id = p_channel_id
        and rm.community_id = p_community_id
        and rm.deleted_at is null
    ) then
      raise exception 'Invalid reply target' using errcode = '22023';
    end if;
  end if;

  select p.username, p.avatar_url
  into v_display_name, v_avatar_url
  from public.profiles p
  where p.id = v_uid
  limit 1;

  if v_display_name is null or char_length(trim(v_display_name)) < 1 then
    raise exception 'Profile username required' using errcode = '22023';
  end if;

  insert into public.messages (
    community_id,
    channel_id,
    author_user_id,
    display_name,
    avatar_snapshot_url,
    content,
    metadata,
    reply_to_message_id
  )
  values (
    p_community_id,
    p_channel_id,
    v_uid,
    trim(v_display_name),
    v_avatar_url,
    v_trimmed,
    coalesce(p_metadata, '{}'::jsonb),
    p_reply_to_message_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.send_user_message(uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.send_user_message(uuid, uuid, text, uuid, jsonb) to authenticated;
