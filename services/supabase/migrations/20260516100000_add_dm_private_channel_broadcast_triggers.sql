-- Broadcast DM_CONVERSATION and DM_MESSAGE to private Realtime topics for direct messages.
-- Also removes DM tables from the supabase_realtime publication; DM updates are delivered
-- via the private_user:<uid> broadcast channel instead of postgres_changes.

drop trigger if exists trg_notify_dm_conversation_member on public.dm_conversation_members;
drop trigger if exists trg_notify_dm_conversation_preference on public.dm_conversation_notification_preferences;
drop trigger if exists trg_notify_dm_message_recipients on public.dm_messages;

drop function if exists public.notify_dm_conversation_member();
drop function if exists public.notify_dm_conversation_preference();
drop function if exists public.notify_dm_message_recipients();

create function public.notify_dm_conversation_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'conversation_id', NEW.conversation_id::text
      ),
      'DM_CONVERSATION',
      'private_user:' || NEW.user_id::text,
      true
    );
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

create trigger trg_notify_dm_conversation_member
after insert on public.dm_conversation_members
for each row
execute function public.notify_dm_conversation_member();

create function public.notify_dm_conversation_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'conversation_id', NEW.conversation_id::text
      ),
      'DM_CONVERSATION',
      'private_user:' || NEW.user_id::text,
      true
    );
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

create trigger trg_notify_dm_conversation_preference
after update on public.dm_conversation_notification_preferences
for each row
execute function public.notify_dm_conversation_preference();

create function public.notify_dm_message_recipients()
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
      from public.dm_conversation_members m
      where m.conversation_id = NEW.conversation_id
        and m.left_at is null
        and m.user_id <> NEW.author_user_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'conversation_id', NEW.conversation_id::text,
          'message_id', NEW.id::text,
          'author_user_id', NEW.author_user_id::text
        ),
        'DM_MESSAGE',
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

create trigger trg_notify_dm_message_recipients
after insert on public.dm_messages
for each row
execute function public.notify_dm_message_recipients();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'dm_conversation_members'
    ) then
      alter publication supabase_realtime drop table public.dm_conversation_members;
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
        and tablename = 'dm_conversation_notification_preferences'
    ) then
      alter publication supabase_realtime drop table public.dm_conversation_notification_preferences;
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
        and tablename = 'dm_conversations'
    ) then
      alter publication supabase_realtime drop table public.dm_conversations;
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
        and tablename = 'dm_messages'
    ) then
      alter publication supabase_realtime drop table public.dm_messages;
    end if;
  end if;
end $$;
