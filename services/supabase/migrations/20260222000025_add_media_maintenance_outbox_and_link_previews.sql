-- Centralize message media cleanup side effects and add link preview queues/cache.
-- External side effects (storage deletes, URL unfurls) are handled by edge workers.

create table if not exists public.message_attachment_deletion_jobs (
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

create index if not exists idx_message_attachment_deletion_jobs_status_available
  on public.message_attachment_deletion_jobs(status, available_at asc, created_at asc);

create index if not exists idx_message_attachment_deletion_jobs_message
  on public.message_attachment_deletion_jobs(message_id, created_at asc);

create unique index if not exists uq_message_attachment_deletion_jobs_active_object
  on public.message_attachment_deletion_jobs(bucket_name, object_path)
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

-- Helper used by message triggers and workers to identify the first preview candidate URL.
create or replace function public.extract_first_http_url(p_content text)
returns text
language sql
immutable
strict
as $$
  select nullif((regexp_match(p_content, '(?i)(https?://[^\s<>"''`]+)'))[1], '');
$$;

revoke all on function public.extract_first_http_url(text) from public;
grant execute on function public.extract_first_http_url(text) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'link_preview_status'
  ) then
    create type public.link_preview_status as enum ('pending', 'ready', 'unsupported', 'failed');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'link_embed_provider'
  ) then
    create type public.link_embed_provider as enum ('none', 'youtube', 'vimeo');
  end if;
end $$;

create table if not exists public.link_preview_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_url text not null unique,
  final_url text,
  status public.link_preview_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  thumbnail_bucket_name text,
  thumbnail_object_path text,
  thumbnail_source_url text,
  fetched_at timestamptz,
  stale_after timestamptz,
  etag text,
  last_modified text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_link_preview_cache_status_stale
  on public.link_preview_cache(status, stale_after asc nulls first);

alter table public.link_preview_cache enable row level security;

create table if not exists public.message_link_previews (
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

create index if not exists idx_message_link_previews_channel
  on public.message_link_previews(channel_id, updated_at desc);

create index if not exists idx_message_link_previews_status
  on public.message_link_previews(status, updated_at desc);

alter table public.message_link_previews enable row level security;

drop policy if exists message_link_previews_select_visible_channel on public.message_link_previews;
create policy message_link_previews_select_visible_channel
on public.message_link_previews
for select
to authenticated
using (public.can_view_channel(channel_id));

create table if not exists public.link_preview_jobs (
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

create index if not exists idx_link_preview_jobs_status_available
  on public.link_preview_jobs(status, available_at asc, created_at asc);

create unique index if not exists uq_link_preview_jobs_active_message
  on public.link_preview_jobs(message_id)
  where status in ('pending', 'processing', 'retryable_failed');

alter table public.link_preview_jobs enable row level security;

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

create or replace function public.claim_message_attachment_deletion_jobs(
  p_limit integer default 50,
  p_lease_seconds integer default 60
)
returns table (
  id uuid,
  attachment_id uuid,
  message_id uuid,
  community_id uuid,
  bucket_name text,
  object_path text,
  reason text,
  attempts integer,
  status text,
  available_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 60), 5);
begin
  return query
  with candidates as (
    select j.id
    from public.message_attachment_deletion_jobs j
    where (
      j.status in ('pending', 'retryable_failed')
      and j.available_at <= timezone('utc', now())
    )
      or (
        j.status = 'processing'
        and coalesce(j.lease_expires_at, j.locked_at, j.available_at, j.created_at) <= timezone('utc', now())
      )
    order by j.available_at asc, j.created_at asc
    limit v_limit
    for update skip locked
  ),
  claimed as (
    update public.message_attachment_deletion_jobs j
    set
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = timezone('utc', now()),
      lease_expires_at = timezone('utc', now()) + make_interval(secs => v_lease_seconds),
      updated_at = timezone('utc', now())
    from candidates c
    where j.id = c.id
    returning j.id, j.attachment_id, j.message_id, j.community_id, j.bucket_name, j.object_path,
      j.reason, j.attempts, j.status, j.available_at, j.created_at
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_message_attachment_deletion_jobs(integer, integer) from public;
grant execute on function public.claim_message_attachment_deletion_jobs(integer, integer) to service_role, postgres;

create or replace function public.complete_message_attachment_deletion_job(
  p_job_id uuid,
  p_outcome text,
  p_error text default null,
  p_retry_delay_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_job_id is null then
    raise exception 'p_job_id is required' using errcode = '22004';
  end if;

  if p_outcome not in ('done', 'retryable_failed', 'dead_letter') then
    raise exception 'Unsupported outcome: %', p_outcome using errcode = '22023';
  end if;

  update public.message_attachment_deletion_jobs
  set
    status = p_outcome,
    last_error = case when p_outcome = 'done' then null else left(coalesce(p_error, ''), 4000) end,
    available_at = case
      when p_outcome = 'retryable_failed'
        then timezone('utc', now()) + make_interval(secs => greatest(coalesce(p_retry_delay_seconds, 60), 5))
      else available_at
    end,
    locked_at = null,
    lease_expires_at = null,
    processed_at = case when p_outcome = 'done' then timezone('utc', now()) else processed_at end,
    updated_at = timezone('utc', now())
  where id = p_job_id;
end;
$$;

revoke all on function public.complete_message_attachment_deletion_job(uuid, text, text, integer) from public;
grant execute on function public.complete_message_attachment_deletion_job(uuid, text, text, integer) to service_role, postgres;

create or replace function public.claim_link_preview_jobs(
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  message_id uuid,
  reason text,
  attempts integer,
  status text,
  available_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 25), 1);
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 15);
begin
  return query
  with candidates as (
    select j.id
    from public.link_preview_jobs j
    where (
      j.status in ('pending', 'retryable_failed')
      and j.available_at <= timezone('utc', now())
    )
      or (
        j.status = 'processing'
        and coalesce(j.lease_expires_at, j.locked_at, j.available_at, j.created_at) <= timezone('utc', now())
      )
    order by j.available_at asc, j.created_at asc
    limit v_limit
    for update skip locked
  ),
  claimed as (
    update public.link_preview_jobs j
    set
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = timezone('utc', now()),
      lease_expires_at = timezone('utc', now()) + make_interval(secs => v_lease_seconds),
      updated_at = timezone('utc', now())
    from candidates c
    where j.id = c.id
    returning j.id, j.message_id, j.reason, j.attempts, j.status, j.available_at, j.created_at
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_link_preview_jobs(integer, integer) from public;
grant execute on function public.claim_link_preview_jobs(integer, integer) to service_role, postgres;

create or replace function public.complete_link_preview_job(
  p_job_id uuid,
  p_outcome text,
  p_error text default null,
  p_retry_delay_seconds integer default 120
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_job_id is null then
    raise exception 'p_job_id is required' using errcode = '22004';
  end if;

  if p_outcome not in ('done', 'retryable_failed', 'failed') then
    raise exception 'Unsupported outcome: %', p_outcome using errcode = '22023';
  end if;

  update public.link_preview_jobs
  set
    status = p_outcome,
    last_error = case when p_outcome = 'done' then null else left(coalesce(p_error, ''), 4000) end,
    available_at = case
      when p_outcome = 'retryable_failed'
        then timezone('utc', now()) + make_interval(secs => greatest(coalesce(p_retry_delay_seconds, 120), 10))
      else available_at
    end,
    locked_at = null,
    lease_expires_at = null,
    updated_at = timezone('utc', now())
  where id = p_job_id;
end;
$$;

revoke all on function public.complete_link_preview_job(uuid, text, text, integer) from public;
grant execute on function public.complete_link_preview_job(uuid, text, text, integer) to service_role, postgres;

-- Reusable helper for bounded backfill queueing from edge functions.
create or replace function public.enqueue_link_preview_jobs_for_messages(
  p_message_ids uuid[],
  p_reason text default 'backfill'
)
returns table (
  message_id uuid,
  queued boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reason not in ('insert', 'edit', 'backfill', 'retry') then
    raise exception 'Unsupported reason: %', p_reason using errcode = '22023';
  end if;

  return query
  with requested as (
    select distinct unnest(coalesce(p_message_ids, '{}'::uuid[])) as message_id
  ),
  eligible as (
    select m.id as message_id, m.community_id, m.channel_id, public.extract_first_http_url(m.content) as source_url
    from public.messages m
    join requested r on r.message_id = m.id
    where m.deleted_at is null
  ),
  seeded_preview_rows as (
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
      thumbnail_object_path
    )
    select
      e.message_id,
      e.community_id,
      e.channel_id,
      e.source_url,
      null,
      'pending',
      null,
      '{}'::jsonb,
      'none',
      null,
      null
    from eligible e
    where e.source_url is not null
    on conflict (message_id)
    do update
    set
      source_url = excluded.source_url,
      normalized_url = coalesce(public.message_link_previews.normalized_url, excluded.normalized_url),
      updated_at = timezone('utc', now())
    returning message_id
  ),
  queued_jobs as (
    insert into public.link_preview_jobs (message_id, reason, status, available_at)
    select e.message_id, p_reason, 'pending', timezone('utc', now())
    from eligible e
    where e.source_url is not null
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
      updated_at = timezone('utc', now())
    returning message_id
  )
  select e.message_id, q.message_id is not null as queued
  from eligible e
  left join queued_jobs q on q.message_id = e.message_id
  where e.source_url is not null;
end;
$$;

revoke all on function public.enqueue_link_preview_jobs_for_messages(uuid[], text) from public;
grant execute on function public.enqueue_link_preview_jobs_for_messages(uuid[], text) to service_role, postgres;

-- Use existing updated_at helper on mutable worker/cache tables.
drop trigger if exists trg_message_attachment_deletion_jobs_set_updated_at on public.message_attachment_deletion_jobs;
create trigger trg_message_attachment_deletion_jobs_set_updated_at
before update on public.message_attachment_deletion_jobs
for each row execute function public.set_updated_at();

drop trigger if exists trg_link_preview_cache_set_updated_at on public.link_preview_cache;
create trigger trg_link_preview_cache_set_updated_at
before update on public.link_preview_cache
for each row execute function public.set_updated_at();

drop trigger if exists trg_message_link_previews_set_updated_at on public.message_link_previews;
create trigger trg_message_link_previews_set_updated_at
before update on public.message_link_previews
for each row execute function public.set_updated_at();

drop trigger if exists trg_link_preview_jobs_set_updated_at on public.link_preview_jobs;
create trigger trg_link_preview_jobs_set_updated_at
before update on public.link_preview_jobs
for each row execute function public.set_updated_at();

-- Private bucket for mirrored link preview images.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'link-preview-images',
  'link-preview-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_link_preview_images_select_authenticated on storage.objects;
create policy storage_link_preview_images_select_authenticated
on storage.objects
for select
to authenticated
using (bucket_id = 'link-preview-images');

-- Keep internal worker tables private from clients.
revoke all on table public.message_attachment_deletion_jobs from public;
revoke all on table public.message_attachment_deletion_jobs from authenticated;
revoke all on table public.link_preview_jobs from public;
revoke all on table public.link_preview_jobs from authenticated;
revoke all on table public.link_preview_cache from public;
revoke all on table public.link_preview_cache from authenticated;

-- Realtime updates for link preview rows.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
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
