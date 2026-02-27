-- Add a non-mutating web-push job peek RPC for shadow-mode dry runs.

create or replace function public.peek_web_push_notification_jobs(
  p_limit integer default 25
)
returns table(
  job_id uuid,
  notification_recipient_id uuid,
  notification_event_id uuid,
  recipient_user_id uuid,
  subscription_id uuid,
  subscription_endpoint text,
  subscription_p256dh_key text,
  subscription_auth_key text,
  subscription_expiration_time timestamptz,
  subscription_user_agent text,
  subscription_client_platform text,
  subscription_app_display_mode text,
  kind public.notification_kind,
  source_kind public.notification_source_kind,
  source_id uuid,
  actor_user_id uuid,
  actor_username text,
  actor_avatar_url text,
  payload jsonb,
  recipient_deliver_in_app boolean,
  recipient_deliver_sound boolean,
  recipient_deliver_push boolean,
  recipient_seen_at timestamptz,
  recipient_read_at timestamptz,
  recipient_dismissed_at timestamptz,
  attempts integer,
  status text,
  available_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 25), 1);
  v_role text := coalesce(auth.role(), current_user);
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to peek web push jobs'
      using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      j.id as job_id,
      j.notification_recipient_id,
      j.notification_event_id,
      j.recipient_user_id,
      j.subscription_id,
      j.attempts,
      j.status,
      j.available_at,
      j.created_at
    from public.web_push_notification_jobs j
    where (
      j.status in ('pending', 'retryable_failed')
      and j.available_at <= timezone('utc', now())
    )
      or (
        j.status = 'processing'
        and coalesce(j.lease_expires_at, j.locked_at, j.available_at, j.created_at) <= timezone('utc', now())
      )
    order by j.available_at asc, j.created_at asc
    limit v_limit
  )
  select
    c.job_id,
    c.notification_recipient_id,
    c.notification_event_id,
    c.recipient_user_id,
    c.subscription_id,
    s.endpoint as subscription_endpoint,
    s.p256dh_key as subscription_p256dh_key,
    s.auth_key as subscription_auth_key,
    s.expiration_time as subscription_expiration_time,
    s.user_agent as subscription_user_agent,
    s.client_platform as subscription_client_platform,
    s.app_display_mode as subscription_app_display_mode,
    ne.kind,
    ne.source_kind,
    ne.source_id,
    ne.actor_user_id,
    actor.username as actor_username,
    actor.avatar_url as actor_avatar_url,
    ne.payload,
    nr.deliver_in_app as recipient_deliver_in_app,
    nr.deliver_sound as recipient_deliver_sound,
    public.resolve_notification_push_delivery_for_user(nr.recipient_user_id, ne.kind) as recipient_deliver_push,
    nr.seen_at as recipient_seen_at,
    nr.read_at as recipient_read_at,
    nr.dismissed_at as recipient_dismissed_at,
    c.attempts,
    c.status,
    c.available_at,
    c.created_at
  from candidates c
  join public.web_push_subscriptions s
    on s.id = c.subscription_id
  join public.notification_recipients nr
    on nr.id = c.notification_recipient_id
  join public.notification_events ne
    on ne.id = c.notification_event_id
  left join public.profiles actor
    on actor.id = ne.actor_user_id
  order by c.available_at asc, c.created_at asc, c.job_id asc;
end;
$$;

revoke all on function public.peek_web_push_notification_jobs(integer) from public;
grant execute on function public.peek_web_push_notification_jobs(integer)
  to postgres, service_role;

