-- Add message reactions and expiring media attachments.

create or replace function public.try_parse_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_value::uuid;
exception
  when others then
    return null;
end;
$$;

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

create index idx_message_reactions_channel on public.message_reactions(channel_id, created_at asc);
create index idx_message_reactions_message on public.message_reactions(message_id, created_at asc);

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
  unique (bucket_name, object_path)
);

create index idx_message_attachments_channel on public.message_attachments(channel_id, created_at asc);
create index idx_message_attachments_expires_at on public.message_attachments(expires_at asc);

alter table public.message_reactions enable row level security;
alter table public.message_attachments enable row level security;

create policy message_reactions_select_visible_channel
on public.message_reactions
for select
to authenticated
using (public.can_view_channel(channel_id));

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

create policy message_attachments_select_visible_channel
on public.message_attachments
for select
to authenticated
using (
  public.can_view_channel(channel_id)
  and expires_at > timezone('utc', now())
);

create policy message_attachments_insert_sender
on public.message_attachments
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and public.can_send_in_channel(channel_id)
  and exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
      and m.community_id = message_attachments.community_id
      and m.channel_id = message_attachments.channel_id
      and m.deleted_at is null
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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'message-media',
  'message-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_message_media_select_visible on storage.objects;
drop policy if exists storage_message_media_insert_sender on storage.objects;
drop policy if exists storage_message_media_delete_sender on storage.objects;

create policy storage_message_media_select_visible
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-media'
  and public.can_view_channel(public.try_parse_uuid(split_part(name, '/', 2)))
);

create policy storage_message_media_insert_sender
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-media'
  and owner = auth.uid()
  and public.can_send_in_channel(public.try_parse_uuid(split_part(name, '/', 2)))
);

create policy storage_message_media_delete_sender
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-media'
  and owner = auth.uid()
);

create or replace function public.cleanup_expired_message_attachments(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 200), 1);
  v_deleted integer := 0;
  v_attachment record;
begin
  for v_attachment in
    select id, bucket_name, object_path
    from public.message_attachments
    where expires_at <= timezone('utc', now())
    order by expires_at asc
    limit v_limit
  loop
    delete from storage.objects
    where bucket_id = v_attachment.bucket_name
      and name = v_attachment.object_path;

    delete from public.message_attachments
    where id = v_attachment.id;

    v_deleted := v_deleted + 1;
  end loop;

  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_message_attachments(integer) from public;
grant execute on function public.cleanup_expired_message_attachments(integer) to authenticated;

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
  end if;
end $$;
