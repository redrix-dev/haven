-- 3 of 9. Media: every uploaded file is one row, from before the upload until
-- after the file is gone.

-- ── One row per file ────────────────────────────────────────────────────────
-- The life of a file:
--   pending   The app asked for a place to upload to (create_upload). The row
--             is the permission to upload: storage accepts only this path.
--   attached  A message or a profile uses it.
--   released  Nothing uses it any more. A job deletes the file and then the
--             row, unless a safety case is holding it as evidence.
-- People can upload and read. Nobody but the delete job can remove or replace
-- a file, so evidence cannot be destroyed by its owner.
create type public.media_status as enum ('pending', 'attached', 'released');
create type public.media_purpose as enum ('attachment', 'avatar');
create type public.media_scan_status as enum ('not_scanned', 'pending', 'clear', 'match', 'error');

create table public.media (
  id uuid primary key default private.uuid_v7(),
  owner_id uuid not null references public.profiles (id),
  purpose public.media_purpose not null,
  status public.media_status not null default 'pending',
  -- 'media' (private, served through signed URLs), 'avatars' (public) or
  -- 'evidence' (staff only; where a withheld file is moved to).
  bucket text not null check (bucket in ('media', 'avatars', 'evidence')),
  -- Always <owner id>/<media id>, so the path never has to be stored twice or
  -- trusted from a client.
  object_path text not null generated always as (owner_id::text || '/' || id::text) stored,
  filename text check (char_length(filename) <= 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width integer check (width > 0),
  height integer check (height > 0),
  -- The message this file is attached to. Null for an avatar.
  message_id uuid, -- foreign key added in 7_messages
  -- The slot a scanner fills in. Until one exists every row is 'not_scanned'.
  scan_status public.media_scan_status not null default 'not_scanned',
  scan_vendor text,
  scan_detail jsonb,
  scanned_at timestamptz,
  -- Set when the file is flagged as apparent CSAM. From then on it is served
  -- to nobody but a CSAM reviewer, and a job moves it out of reach.
  withheld_at timestamptz,
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create index media_owner on public.media (owner_id);
create index media_message on public.media (message_id) where message_id is not null;
create index media_pending on public.media (created_at) where status = 'pending';
alter table public.media enable row level security;
-- No policy and no grant. Files reach the apps inside a message or a profile.

alter table public.profiles
  add constraint profiles_avatar_media_fk foreign key (avatar_media_id) references public.media (id);
-- Deleting a file row checks that no profile still shows it.
create index profiles_avatar on public.profiles (avatar_media_id) where avatar_media_id is not null;

-- What the apps get for "a file".
create type public.media_record as (
  id uuid,
  bucket text,
  object_path text,
  filename text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer
);

-- ── Buckets ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', false, 26214400,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'application/pdf']),
  -- Public so a face in a member list is a plain image URL. A picture that
  -- breaks the rules is removed by deleting the file.
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']),
  ('evidence', 'evidence', false, null, null);

-- Upload: only into a place create_upload handed out, only by its owner.
create function private.can_upload(p_bucket text, p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media m
    where m.bucket = p_bucket
      and m.object_path = p_object_path
      and m.owner_id = auth.uid()
      and m.status = 'pending'
  );
$$;
grant execute on function private.can_upload(text, text) to authenticated;

create policy "upload into own slot" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('media', 'avatars') and private.can_upload(bucket_id, name));
-- The read policy for 'media' is in 7_messages (it needs channels) and the
-- one for 'evidence' is in 8_safety. There is no update or delete policy.

-- ── RPCs ────────────────────────────────────────────────────────────────────
-- Step 1 of sending a file: get a place to put it.
create function public.create_upload(
  p_purpose public.media_purpose,
  p_mime_type text,
  p_size_bytes bigint,
  p_filename text default null,
  p_width integer default null,
  p_height integer default null
)
returns public.media_record
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_bucket text := case p_purpose when 'avatar' then 'avatars' else 'media' end;
  v_limit bigint;
  v_types text[];
  v_row public.media;
begin
  select b.file_size_limit, b.allowed_mime_types into v_limit, v_types
  from storage.buckets b where b.id = v_bucket;
  if p_mime_type is null or not (p_mime_type = any (v_types)) then
    perform private.fail('invalid', 'file_type_not_allowed', 'That kind of file cannot be uploaded.');
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > v_limit then
    perform private.fail('invalid', 'file_too_large', 'That file is too large.');
  end if;
  perform private.rate_limit(v_me, 'create_upload', 30, interval '10 minutes');

  insert into public.media (owner_id, purpose, bucket, filename, mime_type, size_bytes, width, height)
  values (v_me, p_purpose, v_bucket, left(private.clean_text(p_filename), 255), p_mime_type, p_size_bytes, p_width, p_height)
  returning * into v_row;
  return row(v_row.id, v_row.bucket, v_row.object_path, v_row.filename, v_row.mime_type,
             v_row.size_bytes, v_row.width, v_row.height)::public.media_record;
end;
$$;

-- Step 2, shared by send_message and set_my_avatar: the upload must really be
-- there, be this person's, and be unused. Size and type come from what
-- storage received, not from what the app said.
create function private.claim_upload(
  p_media_id uuid, p_owner_id uuid, p_purpose public.media_purpose, p_message_id uuid default null
)
returns public.media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.media;
  v_object storage.objects;
begin
  select * into v_row from public.media m where m.id = p_media_id for update;
  if v_row.id is null or v_row.owner_id <> p_owner_id or v_row.purpose <> p_purpose or v_row.status <> 'pending' then
    perform private.fail('invalid', 'upload_not_usable', 'That upload cannot be used.');
  end if;
  select * into v_object from storage.objects o
  where o.bucket_id = v_row.bucket and o.name = v_row.object_path;
  if v_object.id is null then
    perform private.fail('invalid', 'upload_missing', 'The file has not finished uploading.');
  end if;
  update public.media m
  set status = 'attached',
      message_id = p_message_id,
      size_bytes = coalesce((v_object.metadata ->> 'size')::bigint, m.size_bytes),
      mime_type = coalesce(v_object.metadata ->> 'mimetype', m.mime_type)
  where m.id = p_media_id
  returning * into v_row;
  return v_row;
end;
$$;

-- A file nothing uses any more. Deleting it is a job, because only the
-- storage API can remove the bytes. A file held by a safety case is left
-- alone (private.media_is_held is defined in 8_safety).
create function private.release_media(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.media m
  set status = 'released', released_at = now(), message_id = null
  where m.id = p_media_id and m.status <> 'released';
  if found and not private.media_is_held(p_media_id) then
    perform private.enqueue_job('media_delete', jsonb_build_object('media_id', p_media_id), p_media_id::text);
  end if;
end;
$$;

create function public.set_my_avatar(p_media_id uuid)
returns public.profile_record
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_old uuid;
  v_row public.profiles;
begin
  select p.avatar_media_id into v_old from public.profiles p where p.id = v_me for update;
  if p_media_id is not null then
    perform private.claim_upload(p_media_id, v_me, 'avatar');
  end if;
  update public.profiles p set avatar_media_id = p_media_id where p.id = v_me returning * into v_row;
  if v_old is not null then
    perform private.release_media(v_old);
  end if;
  return private.profile_record(v_row);
end;
$$;

-- For the delete job. Returns where the file is only if it may be deleted
-- right now; the check is repeated here because a case can be filed between
-- the release and the job running.
create function public.worker_media_to_delete(p_media_id uuid)
returns table (bucket text, object_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select m.bucket, m.object_path
  from public.media m
  where m.id = p_media_id
    and (m.status = 'released' or (m.status = 'pending' and m.created_at < now() - interval '1 day'))
    and not private.media_is_held(m.id);
end;
$$;

create function public.worker_media_deleted(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.media m
  where m.id = p_media_id
    and m.status in ('released', 'pending')
    and not private.media_is_held(m.id);
end;
$$;

-- Uploads that were started and never used.
create function private.sweep_abandoned_uploads()
returns void
language sql
security definer
set search_path = ''
as $$
  select private.enqueue_job('media_delete', jsonb_build_object('media_id', m.id), m.id::text)
  from public.media m
  where m.status = 'pending' and m.created_at < now() - interval '1 day';
$$;

grant execute on function public.create_upload(public.media_purpose, text, bigint, text, integer, integer) to authenticated;
grant execute on function public.set_my_avatar(uuid) to authenticated;
grant execute on function public.worker_media_to_delete(uuid) to service_role;
grant execute on function public.worker_media_deleted(uuid) to service_role;
