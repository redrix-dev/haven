create or replace function public.get_my_notification_counts()
returns table(unseen_count integer, unread_count integer)
language sql
security definer
set search_path = public
as $$
select
  count(*) filter (
    where nr.deliver_in_app = true
    and nr.dismissed_at is null
    and nr.seen_at is null
  )::integer as unseen_count,
  count(*) filter (
    where nr.deliver_in_app = true
    and nr.dismissed_at is null
    and nr.read_at is null
  )::integer as unread_count
from public.notification_recipients nr
join public.notification_events ne on ne.id = nr.event_id
where nr.recipient_user_id = auth.uid()
  and ne.kind not in (
    'friend_request_received',
    'friend_request_accepted',
    'dm_message'
  );
$$;
