create or replace function public.dismiss_resolved_friend_request_received_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  if old.status <> 'pending' or new.status = 'pending' then
    return new;
  end if;

  update public.notification_recipients nr
  set
    seen_at = coalesce(nr.seen_at, timezone('utc', now())),
    read_at = coalesce(nr.read_at, timezone('utc', now())),
    dismissed_at = coalesce(nr.dismissed_at, timezone('utc', now()))
  from public.notification_events ne
  where nr.event_id = ne.id
    and nr.recipient_user_id = new.recipient_user_id
    and ne.source_kind = 'friend_request'
    and ne.source_id = new.id
    and ne.kind = 'friend_request_received';

  return new;
end;
$$;

drop trigger if exists trg_friend_requests_dismiss_received_notifications_on_resolution on public.friend_requests;
create trigger trg_friend_requests_dismiss_received_notifications_on_resolution
after update of status on public.friend_requests
for each row
execute function public.dismiss_resolved_friend_request_received_notifications();

