-- Broadcast NOTIFICATION to private Realtime topics when a notification recipient row is inserted.
-- Also removes public.notification_recipients from the supabase_realtime publication so
-- clients no longer receive postgres_changes for that table; notifications are delivered
-- via the private_user:<uid> broadcast channel instead.

drop trigger if exists trg_notify_notification_recipient on public.notification_recipients;
drop function if exists public.notify_notification_recipient();

create function public.notify_notification_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'recipient_id', NEW.id::text,
        'event_id', NEW.event_id::text,
        'deliver_sound', NEW.deliver_sound
      ),
      'NOTIFICATION',
      'private_user:' || NEW.recipient_user_id::text,
      true
    );
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

create trigger trg_notify_notification_recipient
after insert on public.notification_recipients
for each row
execute function public.notify_notification_recipient();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notification_recipients'
    ) then
      alter publication supabase_realtime drop table public.notification_recipients;
    end if;
  end if;
end $$;
