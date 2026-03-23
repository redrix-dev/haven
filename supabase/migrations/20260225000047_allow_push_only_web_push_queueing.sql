-- Allow web push queue fanout/claiming for push-only notification recipients
-- (deliver_in_app=false, deliver_sound=false, push pref enabled).

create or replace function public.enqueue_web_push_notification_jobs_for_recipients(
  p_notification_recipient_ids uuid[] default null,
  p_reason text default 'manual_backfill'
)
returns table(
  notification_recipient_id uuid,
  subscription_id uuid,
  queued boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
  v_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'manual_backfill');
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to enqueue web push jobs'
      using errcode = '42501';
  end if;

  return query
  with candidate_rows as (
    select
      nr.id as notification_recipient_id,
      nr.event_id as notification_event_id,
      nr.recipient_user_id,
      s.id as subscription_id
    from public.notification_recipients nr
    join public.notification_events ne
      on ne.id = nr.event_id
    join public.web_push_subscriptions s
      on s.user_id = nr.recipient_user_id
    where public.resolve_notification_push_delivery_for_user(nr.recipient_user_id, ne.kind) is true
      and (
        coalesce(array_length(p_notification_recipient_ids, 1), 0) = 0
        or nr.id = any (p_notification_recipient_ids)
      )
  ),
  inserted_rows as (
    insert into public.web_push_notification_jobs (
      notification_recipient_id,
      notification_event_id,
      recipient_user_id,
      subscription_id,
      reason,
      status,
      available_at
    )
    select
      c.notification_recipient_id,
      c.notification_event_id,
      c.recipient_user_id,
      c.subscription_id,
      v_reason,
      'pending',
      timezone('utc', now())
    from candidate_rows c
    on conflict on constraint uq_web_push_notification_jobs_recipient_subscription do nothing
    returning
      web_push_notification_jobs.notification_recipient_id,
      web_push_notification_jobs.subscription_id
  )
  select
    c.notification_recipient_id,
    c.subscription_id,
    (i.notification_recipient_id is not null) as queued
  from candidate_rows c
  left join inserted_rows i
    on i.notification_recipient_id = c.notification_recipient_id
   and i.subscription_id = c.subscription_id
  order by c.notification_recipient_id, c.subscription_id;
end;
$$;

revoke all on function public.enqueue_web_push_notification_jobs_for_recipients(uuid[], text) from public;
grant execute on function public.enqueue_web_push_notification_jobs_for_recipients(uuid[], text)
  to postgres, service_role;

create or replace function public.enqueue_web_push_jobs_for_notification_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_user_id is null then
    return new;
  end if;

  insert into public.web_push_notification_jobs (
    notification_recipient_id,
    notification_event_id,
    recipient_user_id,
    subscription_id,
    reason,
    status,
    available_at
  )
  select
    new.id,
    new.event_id,
    new.recipient_user_id,
    s.id,
    'notification_recipient_insert',
    'pending',
    timezone('utc', now())
  from public.web_push_subscriptions s
  join public.notification_events ne
    on ne.id = new.event_id
  where s.user_id = new.recipient_user_id
    and public.resolve_notification_push_delivery_for_user(new.recipient_user_id, ne.kind) is true
  on conflict on constraint uq_web_push_notification_jobs_recipient_subscription do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_web_push_jobs_for_notification_recipient() from public;
grant execute on function public.enqueue_web_push_jobs_for_notification_recipient()
  to postgres, service_role;

create or replace function public.claim_web_push_notification_jobs(
  p_limit integer default 25,
  p_lease_seconds integer default 120
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
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 15);
  v_role text := coalesce(auth.role(), current_user);
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to claim web push jobs'
      using errcode = '42501';
  end if;

  return query
  with candidates as (
    select j.id
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
    for update skip locked
  ),
  claimed as (
    update public.web_push_notification_jobs j
    set
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = timezone('utc', now()),
      lease_expires_at = timezone('utc', now()) + make_interval(secs => v_lease_seconds),
      updated_at = timezone('utc', now())
    from candidates c
    where j.id = c.id
    returning
      j.id as job_id,
      j.notification_recipient_id,
      j.notification_event_id,
      j.recipient_user_id,
      j.subscription_id,
      j.attempts,
      j.status,
      j.available_at,
      j.created_at
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
  from claimed c
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

revoke all on function public.claim_web_push_notification_jobs(integer, integer) from public;
grant execute on function public.claim_web_push_notification_jobs(integer, integer)
  to postgres, service_role;
