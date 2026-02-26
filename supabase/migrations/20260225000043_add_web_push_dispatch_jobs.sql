-- Web push dispatch queue (additive, v1)
-- Fan-outs notification recipient rows to per-subscription background jobs for web push delivery.

create table if not exists public.web_push_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_recipient_id uuid not null references public.notification_recipients(id) on delete cascade,
  notification_event_id uuid not null references public.notification_events(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
  reason text not null default 'notification_recipient_insert',
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'retryable_failed', 'done', 'dead_letter', 'skipped')
  ),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  provider_status_code integer,
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  lease_expires_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_web_push_notification_jobs_recipient_subscription
    unique (notification_recipient_id, subscription_id)
);

create index if not exists idx_web_push_notification_jobs_status_available
  on public.web_push_notification_jobs(status, available_at asc, created_at asc);

create index if not exists idx_web_push_notification_jobs_subscription_created_at
  on public.web_push_notification_jobs(subscription_id, created_at asc);

create index if not exists idx_web_push_notification_jobs_recipient_created_at
  on public.web_push_notification_jobs(notification_recipient_id, created_at asc);

drop trigger if exists trg_web_push_notification_jobs_updated_at on public.web_push_notification_jobs;
create trigger trg_web_push_notification_jobs_updated_at
before update on public.web_push_notification_jobs
for each row execute function public.set_updated_at();

alter table public.web_push_notification_jobs enable row level security;

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
    join public.web_push_subscriptions s
      on s.user_id = nr.recipient_user_id
    where (coalesce(nr.deliver_in_app, false) or coalesce(nr.deliver_sound, false))
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

  if not (coalesce(new.deliver_in_app, false) or coalesce(new.deliver_sound, false)) then
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
  where s.user_id = new.recipient_user_id
  on conflict on constraint uq_web_push_notification_jobs_recipient_subscription do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_web_push_jobs_for_notification_recipient() from public;
grant execute on function public.enqueue_web_push_jobs_for_notification_recipient()
  to postgres, service_role;

drop trigger if exists trg_enqueue_web_push_jobs_for_notification_recipient on public.notification_recipients;
create trigger trg_enqueue_web_push_jobs_for_notification_recipient
after insert on public.notification_recipients
for each row execute function public.enqueue_web_push_jobs_for_notification_recipient();

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

create or replace function public.complete_web_push_notification_job(
  p_job_id uuid,
  p_outcome text,
  p_error text default null,
  p_retry_delay_seconds integer default 120,
  p_provider_status_code integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to complete web push jobs'
      using errcode = '42501';
  end if;

  if p_job_id is null then
    raise exception 'p_job_id is required' using errcode = '22004';
  end if;

  if p_outcome not in ('done', 'retryable_failed', 'dead_letter', 'skipped') then
    raise exception 'Unsupported outcome: %', p_outcome using errcode = '22023';
  end if;

  update public.web_push_notification_jobs
  set
    status = p_outcome,
    last_error = case when p_outcome = 'done' then null else left(coalesce(p_error, ''), 4000) end,
    provider_status_code = p_provider_status_code,
    available_at = case
      when p_outcome = 'retryable_failed'
        then timezone('utc', now()) + make_interval(secs => greatest(coalesce(p_retry_delay_seconds, 120), 10))
      else available_at
    end,
    locked_at = null,
    lease_expires_at = null,
    processed_at = case
      when p_outcome in ('done', 'dead_letter', 'skipped') then timezone('utc', now())
      else processed_at
    end,
    updated_at = timezone('utc', now())
  where id = p_job_id;
end;
$$;

revoke all on function public.complete_web_push_notification_job(uuid, text, text, integer, integer) from public;
grant execute on function public.complete_web_push_notification_job(uuid, text, text, integer, integer)
  to postgres, service_role;

revoke all on table public.web_push_notification_jobs from public;
revoke all on table public.web_push_notification_jobs from authenticated;
