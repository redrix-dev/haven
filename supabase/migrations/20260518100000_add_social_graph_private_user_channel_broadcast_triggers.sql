-- Broadcast SOCIAL_CHANGE to private Realtime topics for friend_requests, friendships,
-- and user_blocks. Removes those tables from supabase_realtime publication when present;
-- social graph updates are delivered via private_user:<uid> broadcasts instead.

drop trigger if exists trg_notify_friend_request_users on public.friend_requests;
drop trigger if exists trg_notify_friendship_users on public.friendships;
drop trigger if exists trg_notify_user_block_users on public.user_blocks;

drop function if exists public.notify_friend_request_users() cascade;
drop function if exists public.notify_friendship_users() cascade;
drop function if exists public.notify_user_block_users() cascade;

create function public.notify_friend_request_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid;
  v_recipient uuid;
  v_event_type text;
begin
  v_event_type := TG_OP;
  if TG_OP = 'DELETE' then
    v_sender := OLD.sender_user_id;
    v_recipient := OLD.recipient_user_id;
  else
    v_sender := NEW.sender_user_id;
    v_recipient := NEW.recipient_user_id;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'event_type', v_event_type,
        'sender_user_id', v_sender::text,
        'recipient_user_id', v_recipient::text
      ),
      'SOCIAL_CHANGE',
      'private_user:' || v_sender::text,
      true
    );
  exception when others then null;
  end;

  begin
    perform realtime.send(
      jsonb_build_object(
        'event_type', v_event_type,
        'sender_user_id', v_sender::text,
        'recipient_user_id', v_recipient::text
      ),
      'SOCIAL_CHANGE',
      'private_user:' || v_recipient::text,
      true
    );
  exception when others then null;
  end;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create trigger trg_notify_friend_request_users
  after insert or update or delete on public.friend_requests
  for each row
  execute function public.notify_friend_request_users();

create function public.notify_friendship_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_low uuid;
  v_high uuid;
  v_event_type text;
begin
  v_event_type := TG_OP;
  if TG_OP = 'DELETE' then
    v_low := OLD.user_low_id;
    v_high := OLD.user_high_id;
  else
    v_low := NEW.user_low_id;
    v_high := NEW.user_high_id;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'event_type', v_event_type
      ),
      'SOCIAL_CHANGE',
      'private_user:' || v_low::text,
      true
    );
  exception when others then null;
  end;

  begin
    perform realtime.send(
      jsonb_build_object(
        'event_type', v_event_type
      ),
      'SOCIAL_CHANGE',
      'private_user:' || v_high::text,
      true
    );
  exception when others then null;
  end;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create trigger trg_notify_friendship_users
  after insert or delete on public.friendships
  for each row
  execute function public.notify_friendship_users();

create function public.notify_user_block_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocker uuid;
  v_blocked uuid;
  v_event_type text;
begin
  v_event_type := TG_OP;
  if TG_OP = 'DELETE' then
    v_blocker := OLD.blocker_user_id;
    v_blocked := OLD.blocked_user_id;
  else
    v_blocker := NEW.blocker_user_id;
    v_blocked := NEW.blocked_user_id;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'event_type', v_event_type,
        'blocker_user_id', v_blocker::text,
        'blocked_user_id', v_blocked::text
      ),
      'SOCIAL_CHANGE',
      'private_user:' || v_blocker::text,
      true
    );
  exception when others then null;
  end;

  begin
    perform realtime.send(
      jsonb_build_object(
        'event_type', v_event_type,
        'blocker_user_id', v_blocker::text,
        'blocked_user_id', v_blocked::text
      ),
      'SOCIAL_CHANGE',
      'private_user:' || v_blocked::text,
      true
    );
  exception when others then null;
  end;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create trigger trg_notify_user_block_users
  after insert or delete on public.user_blocks
  for each row
  execute function public.notify_user_block_users();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'friend_requests'
    ) then
      alter publication supabase_realtime drop table public.friend_requests;
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
        and tablename = 'friendships'
    ) then
      alter publication supabase_realtime drop table public.friendships;
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
        and tablename = 'user_blocks'
    ) then
      alter publication supabase_realtime drop table public.user_blocks;
    end if;
  end if;
end $$;
