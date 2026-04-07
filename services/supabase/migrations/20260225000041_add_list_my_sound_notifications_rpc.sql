-- Add sound-eligible notification listing RPC without changing inbox semantics.
-- This supports foreground sound playback for notifications that are sound-enabled
-- but intentionally hidden from the in-app inbox (deliver_in_app = false).

create or replace function public.list_my_sound_notifications(
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table(
  recipient_id uuid,
  event_id uuid,
  kind public.notification_kind,
  source_kind public.notification_source_kind,
  source_id uuid,
  actor_user_id uuid,
  actor_username text,
  actor_avatar_url text,
  payload jsonb,
  deliver_in_app boolean,
  deliver_sound boolean,
  created_at timestamptz,
  seen_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with bounded as (
    select greatest(1, least(coalesce(p_limit, 50), 100)) as next_limit
  )
  select
    nr.id as recipient_id,
    ne.id as event_id,
    ne.kind,
    ne.source_kind,
    ne.source_id,
    ne.actor_user_id,
    actor.username as actor_username,
    actor.avatar_url as actor_avatar_url,
    ne.payload,
    nr.deliver_in_app,
    nr.deliver_sound,
    nr.created_at,
    nr.seen_at,
    nr.read_at,
    nr.dismissed_at
  from public.notification_recipients nr
  join public.notification_events ne
    on ne.id = nr.event_id
  left join public.profiles actor
    on actor.id = ne.actor_user_id
  cross join bounded b
  where nr.recipient_user_id = auth.uid()
    and nr.dismissed_at is null
    and nr.deliver_sound = true
    and (
      p_before_created_at is null
      or nr.created_at < p_before_created_at
      or (
        p_before_id is not null
        and nr.created_at = p_before_created_at
        and nr.id < p_before_id
      )
    )
  order by nr.created_at desc, nr.id desc
  limit (select next_limit from bounded);
$$;

revoke all on function public.list_my_sound_notifications(integer, timestamptz, uuid) from public;
grant execute on function public.list_my_sound_notifications(integer, timestamptz, uuid) to authenticated;

