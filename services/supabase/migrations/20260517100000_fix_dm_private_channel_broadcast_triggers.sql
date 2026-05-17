-- Fixes for the DM private-channel broadcast triggers introduced in
-- 20260516100000_add_dm_private_channel_broadcast_triggers.sql:
--   1. Preference trigger now fires on INSERT as well as UPDATE so the
--      first preference row created for a (conversation, user) pair
--      pushes to the client.
--   2. Revert public.dm_messages REPLICA IDENTITY back to DEFAULT now
--      that the table is no longer in the supabase_realtime publication
--      (REPLICA IDENTITY FULL is unnecessary WAL overhead once the
--      table is broadcast-driven).
--   3. Move the exception handler inside the fanout loop so a failure
--      broadcasting to one recipient does not abort the rest of the
--      fanout.

-- Fix 1: preference trigger fires on INSERT and UPDATE.

drop trigger if exists trg_notify_dm_conversation_preference on public.dm_conversation_notification_preferences;

create trigger trg_notify_dm_conversation_preference
after insert or update on public.dm_conversation_notification_preferences
for each row
execute function public.notify_dm_conversation_preference();

-- Fix 2: revert dm_messages replica identity to default.

alter table public.dm_messages replica identity default;

-- Fix 3: per-iteration exception handling in the message-fanout function.

drop function if exists public.notify_dm_message_recipients() cascade;

create function public.notify_dm_message_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  for rec in
    select m.user_id
    from public.dm_conversation_members m
    where m.conversation_id = NEW.conversation_id
      and m.left_at is null
      and m.user_id <> NEW.author_user_id
  loop
    begin
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
    exception when others then
      null;
    end;
  end loop;
  return NEW;
end;
$$;

create trigger trg_notify_dm_message_recipients
after insert on public.dm_messages
for each row
execute function public.notify_dm_message_recipients();
