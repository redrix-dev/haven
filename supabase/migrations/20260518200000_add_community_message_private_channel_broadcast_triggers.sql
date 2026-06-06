-- Broadcast MESSAGE_INSERT, MESSAGE_UPDATE, MESSAGE_DELETE to private Realtime
-- topics for community messages. All community members receive events for their
-- community regardless of channel access — client ignores events for channels
-- it cannot see. RLS remains the single source of truth for access control.
--
-- Also removes the messages table from supabase_realtime publication so message
-- delivery is handled exclusively via private_user broadcast channels.

drop trigger if exists trg_notify_community_message_insert on public.messages;
drop trigger if exists trg_notify_community_message_update on public.messages;
drop trigger if exists trg_notify_community_message_delete on public.messages;

drop function if exists public.notify_community_message_insert();
drop function if exists public.notify_community_message_update();
drop function if exists public.notify_community_message_delete();

-- INSERT
create function public.notify_community_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  begin
    for rec in
      select m.user_id
      from public.community_members m
      where m.community_id = NEW.community_id
        and m.user_id <> NEW.author_user_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'community_id',   NEW.community_id::text,
          'channel_id',     NEW.channel_id::text,
          'message_id',     NEW.id::text,
          'author_user_id', NEW.author_user_id::text,
          'content',        NEW.content,
          'metadata',       NEW.metadata,
          'created_at',     NEW.created_at::text,
          'deleted_at',     NEW.deleted_at::text,
          'is_hidden',      NEW.is_hidden
        ),
        'MESSAGE_INSERT',
        'private_user:' || rec.user_id::text,
        true
      );
    end loop;
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

create trigger trg_notify_community_message_insert
after insert on public.messages
for each row
execute function public.notify_community_message_insert();

-- UPDATE
create function public.notify_community_message_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  begin
    for rec in
      select m.user_id
      from public.community_members m
      where m.community_id = NEW.community_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'community_id',   NEW.community_id::text,
          'channel_id',     NEW.channel_id::text,
          'message_id',     NEW.id::text,
          'author_user_id', NEW.author_user_id::text,
          'content',        NEW.content,
          'metadata',       NEW.metadata,
          'created_at',     NEW.created_at::text,
          'edited_at',      NEW.edited_at::text,
          'deleted_at',     NEW.deleted_at::text,
          'is_hidden',      NEW.is_hidden
        ),
        'MESSAGE_UPDATE',
        'private_user:' || rec.user_id::text,
        true
      );
    end loop;
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

create trigger trg_notify_community_message_update
after update on public.messages
for each row
execute function public.notify_community_message_update();

-- DELETE
create function public.notify_community_message_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  begin
    for rec in
      select m.user_id
      from public.community_members m
      where m.community_id = OLD.community_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'community_id', OLD.community_id::text,
          'channel_id',   OLD.channel_id::text,
          'message_id',   OLD.id::text
        ),
        'MESSAGE_DELETE',
        'private_user:' || rec.user_id::text,
        true
      );
    end loop;
  exception when others then
    null;
  end;
  return OLD;
end;
$$;

create trigger trg_notify_community_message_delete
after delete on public.messages
for each row
execute function public.notify_community_message_delete();

-- Remove messages from supabase_realtime publication
-- Messages are now delivered exclusively via private_user broadcast channels
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      alter publication supabase_realtime drop table public.messages;
    end if;
  end if;
end $$;

-- Remove message_reactions from supabase_realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_reactions'
    ) then
      alter publication supabase_realtime drop table public.message_reactions;
    end if;
  end if;
end $$;

-- Remove message_attachments from supabase_realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_attachments'
    ) then
      alter publication supabase_realtime drop table public.message_attachments;
    end if;
  end if;
end $$;

-- Remove message_link_previews from supabase_realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_link_previews'
    ) then
      alter publication supabase_realtime drop table public.message_link_previews;
    end if;
  end if;
end $$;