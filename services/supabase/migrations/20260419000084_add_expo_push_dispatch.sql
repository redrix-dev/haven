-- Expo push (parallel to web push): device token registry, job queue, claim/complete RPCs,
-- notification_recipients fan-out trigger, delivery trace transport, and cron wiring.

-- ── expo_push_subscriptions ─────────────────────────────────────────────────
create table if not exists public.expo_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'unknown')),
  installation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  constraint expo_push_subscriptions_expo_push_token_key unique (expo_push_token),
  constraint expo_push_subscriptions_expo_push_token_not_blank check (char_length(trim(expo_push_token)) > 0)
);

create index if not exists idx_expo_push_subscriptions_user_updated_at
  on public.expo_push_subscriptions(user_id, updated_at desc);

create index if not exists idx_expo_push_subscriptions_last_seen_at
  on public.expo_push_subscriptions(last_seen_at asc);

create unique index if not exists uq_expo_push_subscriptions_user_installation_id
  on public.expo_push_subscriptions(user_id, installation_id)
  where installation_id is not null and length(trim(installation_id)) > 0;

drop trigger if exists trg_expo_push_subscriptions_updated_at on public.expo_push_subscriptions;
create trigger trg_expo_push_subscriptions_updated_at
before update on public.expo_push_subscriptions
for each row execute function public.set_updated_at();

alter table public.expo_push_subscriptions enable row level security;

drop policy if exists expo_push_subscriptions_select_self on public.expo_push_subscriptions;
create policy expo_push_subscriptions_select_self
on public.expo_push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists expo_push_subscriptions_insert_self on public.expo_push_subscriptions;
create policy expo_push_subscriptions_insert_self
on public.expo_push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists expo_push_subscriptions_update_self on public.expo_push_subscriptions;
create policy expo_push_subscriptions_update_self
on public.expo_push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists expo_push_subscriptions_delete_self on public.expo_push_subscriptions;
create policy expo_push_subscriptions_delete_self
on public.expo_push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.list_my_expo_push_subscriptions()
returns table(
  id uuid,
  user_id uuid,
  expo_push_token text,
  platform text,
  installation_id text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.user_id,
    s.expo_push_token,
    s.platform,
    s.installation_id,
    s.metadata,
    s.created_at,
    s.updated_at,
    s.last_seen_at
  from public.expo_push_subscriptions s
  where s.user_id = auth.uid()
  order by s.updated_at desc, s.id desc;
$$;

revoke all on function public.list_my_expo_push_subscriptions() from public;
grant execute on function public.list_my_expo_push_subscriptions() to authenticated;

create or replace function public.upsert_my_expo_push_subscription(
  p_expo_push_token text,
  p_platform text default 'unknown',
  p_installation_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  id uuid,
  user_id uuid,
  expo_push_token text,
  platform text,
  installation_id text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_token text := trim(coalesce(p_expo_push_token, ''));
  v_platform text := lower(trim(coalesce(p_platform, 'unknown')));
  v_installation_id text := nullif(trim(coalesce(p_installation_id, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_token = '' then
    raise exception 'Expo push token is required.';
  end if;

  if v_platform not in ('ios', 'android', 'unknown') then
    v_platform := 'unknown';
  end if;

  if v_installation_id is not null then
    v_metadata := v_metadata || jsonb_build_object('installationId', v_installation_id);

    delete from public.expo_push_subscriptions s
    where s.user_id = auth.uid()
      and s.installation_id = v_installation_id
      and s.expo_push_token <> v_token;
  end if;

  return query
  insert into public.expo_push_subscriptions (
    user_id,
    expo_push_token,
    platform,
    installation_id,
    metadata,
    last_seen_at
  )
  values (
    auth.uid(),
    v_token,
    v_platform,
    v_installation_id,
    v_metadata,
    v_now
  )
  on conflict on constraint expo_push_subscriptions_expo_push_token_key do update
  set
    user_id = auth.uid(),
    platform = excluded.platform,
    installation_id = excluded.installation_id,
    metadata = coalesce(excluded.metadata, '{}'::jsonb),
    last_seen_at = v_now,
    updated_at = v_now
  returning
    expo_push_subscriptions.id,
    expo_push_subscriptions.user_id,
    expo_push_subscriptions.expo_push_token,
    expo_push_subscriptions.platform,
    expo_push_subscriptions.installation_id,
    expo_push_subscriptions.metadata,
    expo_push_subscriptions.created_at,
    expo_push_subscriptions.updated_at,
    expo_push_subscriptions.last_seen_at;
end;
$$;

revoke all on function public.upsert_my_expo_push_subscription(text, text, text, jsonb) from public;
grant execute on function public.upsert_my_expo_push_subscription(text, text, text, jsonb) to authenticated;

create or replace function public.delete_my_expo_push_subscription(p_expo_push_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := trim(coalesce(p_expo_push_token, ''));
  v_deleted bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_token = '' then
    return false;
  end if;

  delete from public.expo_push_subscriptions s
  where s.user_id = auth.uid()
    and s.expo_push_token = v_token;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.delete_my_expo_push_subscription(text) from public;
grant execute on function public.delete_my_expo_push_subscription(text) to authenticated;

-- ── expo_push_notification_jobs ─────────────────────────────────────────────
create table if not exists public.expo_push_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_recipient_id uuid not null references public.notification_recipients(id) on delete cascade,
  notification_event_id uuid not null references public.notification_events(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.expo_push_subscriptions(id) on delete cascade,
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
  constraint uq_expo_push_notification_jobs_recipient_subscription
    unique (notification_recipient_id, subscription_id)
);

create index if not exists idx_expo_push_notification_jobs_status_available
  on public.expo_push_notification_jobs(status, available_at asc, created_at asc);

create index if not exists idx_expo_push_notification_jobs_subscription_created_at
  on public.expo_push_notification_jobs(subscription_id, created_at asc);

create index if not exists idx_expo_push_notification_jobs_recipient_created_at
  on public.expo_push_notification_jobs(notification_recipient_id, created_at asc);

drop trigger if exists trg_expo_push_notification_jobs_updated_at on public.expo_push_notification_jobs;
create trigger trg_expo_push_notification_jobs_updated_at
before update on public.expo_push_notification_jobs
for each row execute function public.set_updated_at();

alter table public.expo_push_notification_jobs enable row level security;

create or replace function public.enqueue_expo_push_notification_jobs_for_recipients(
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
    raise exception 'Not authorized to enqueue expo push jobs'
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
    join public.expo_push_subscriptions s
      on s.user_id = nr.recipient_user_id
    where public.resolve_notification_push_delivery_for_user(nr.recipient_user_id, ne.kind) is true
      and (
        coalesce(array_length(p_notification_recipient_ids, 1), 0) = 0
        or nr.id = any (p_notification_recipient_ids)
      )
  ),
  inserted_rows as (
    insert into public.expo_push_notification_jobs (
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
    on conflict on constraint uq_expo_push_notification_jobs_recipient_subscription do nothing
    returning
      expo_push_notification_jobs.notification_recipient_id,
      expo_push_notification_jobs.subscription_id
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

revoke all on function public.enqueue_expo_push_notification_jobs_for_recipients(uuid[], text) from public;
grant execute on function public.enqueue_expo_push_notification_jobs_for_recipients(uuid[], text)
  to postgres, service_role;

create or replace function public.enqueue_expo_push_jobs_for_notification_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_user_id is null then
    return new;
  end if;

  insert into public.expo_push_notification_jobs (
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
  from public.expo_push_subscriptions s
  join public.notification_events ne
    on ne.id = new.event_id
  where s.user_id = new.recipient_user_id
    and public.resolve_notification_push_delivery_for_user(new.recipient_user_id, ne.kind) is true
  on conflict on constraint uq_expo_push_notification_jobs_recipient_subscription do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_expo_push_jobs_for_notification_recipient() from public;
grant execute on function public.enqueue_expo_push_jobs_for_notification_recipient()
  to postgres, service_role;

drop trigger if exists trg_enqueue_expo_push_jobs_for_notification_recipient on public.notification_recipients;
create trigger trg_enqueue_expo_push_jobs_for_notification_recipient
after insert on public.notification_recipients
for each row execute function public.enqueue_expo_push_jobs_for_notification_recipient();

create or replace function public.claim_expo_push_notification_jobs(
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns table(
  job_id uuid,
  notification_recipient_id uuid,
  notification_event_id uuid,
  recipient_user_id uuid,
  subscription_id uuid,
  subscription_expo_push_token text,
  subscription_platform text,
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
    raise exception 'Not authorized to claim expo push jobs'
      using errcode = '42501';
  end if;

  return query
  with candidates as (
    select j.id
    from public.expo_push_notification_jobs j
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
    update public.expo_push_notification_jobs j
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
    s.expo_push_token as subscription_expo_push_token,
    s.platform as subscription_platform,
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
  join public.expo_push_subscriptions s
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

revoke all on function public.claim_expo_push_notification_jobs(integer, integer) from public;
grant execute on function public.claim_expo_push_notification_jobs(integer, integer)
  to postgres, service_role;

create or replace function public.complete_expo_push_notification_job(
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
    raise exception 'Not authorized to complete expo push jobs'
      using errcode = '42501';
  end if;

  if p_job_id is null then
    raise exception 'p_job_id is required' using errcode = '22004';
  end if;

  if p_outcome not in ('done', 'retryable_failed', 'dead_letter', 'skipped') then
    raise exception 'Unsupported outcome: %', p_outcome using errcode = '22023';
  end if;

  update public.expo_push_notification_jobs
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

revoke all on function public.complete_expo_push_notification_job(uuid, text, text, integer, integer) from public;
grant execute on function public.complete_expo_push_notification_job(uuid, text, text, integer, integer)
  to postgres, service_role;

create or replace function public.recheck_expo_push_notification_jobs_for_send(
  p_job_ids uuid[]
)
returns table(
  job_id uuid,
  should_deliver_push boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to recheck expo push jobs'
      using errcode = '42501';
  end if;

  return query
  with requested_jobs as (
    select distinct unnest(coalesce(p_job_ids, '{}'::uuid[])) as requested_job_id
  ),
  job_context as (
    select
      j.id as job_id,
      nr.recipient_user_id,
      ne.kind,
      nr.read_at as recipient_read_at,
      nr.dismissed_at as recipient_dismissed_at,
      case
        when ne.kind <> 'dm_message' then false
        when coalesce(ne.payload->>'conversationId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then false
        else exists (
          select 1
          from public.dm_conversation_notification_preferences pref
          where pref.conversation_id = (ne.payload->>'conversationId')::uuid
            and pref.user_id = nr.recipient_user_id
            and coalesce(pref.in_app_override, false) = false
            and coalesce(pref.sound_override, false) = false
            and (
              pref.muted_until is null
              or pref.muted_until > timezone('utc', now())
            )
        )
      end as dm_conversation_muted
    from requested_jobs r
    join public.expo_push_notification_jobs j
      on j.id = r.requested_job_id
    join public.notification_recipients nr
      on nr.id = j.notification_recipient_id
    join public.notification_events ne
      on ne.id = j.notification_event_id
  )
  select
    c.job_id,
    case
      when c.recipient_read_at is not null or c.recipient_dismissed_at is not null then false
      when public.resolve_notification_push_delivery_for_user(c.recipient_user_id, c.kind) is not true then false
      when c.kind = 'dm_message' and c.dm_conversation_muted then false
      else true
    end as should_deliver_push,
    case
      when c.recipient_read_at is not null or c.recipient_dismissed_at is not null
        then 'recipient_read_or_dismissed'
      when public.resolve_notification_push_delivery_for_user(c.recipient_user_id, c.kind) is not true
        then 'push_pref_disabled'
      when c.kind = 'dm_message' and c.dm_conversation_muted
        then 'dm_conversation_muted'
      else 'ok'
    end as reason
  from job_context c
  order by c.job_id;
end;
$$;

revoke all on function public.recheck_expo_push_notification_jobs_for_send(uuid[]) from public;
grant execute on function public.recheck_expo_push_notification_jobs_for_send(uuid[])
  to postgres, service_role;

revoke all on table public.expo_push_notification_jobs from public;
revoke all on table public.expo_push_notification_jobs from authenticated;

-- ── delivery traces: allow expo_push transport ─────────────────────────────
alter table public.notification_delivery_traces
  drop constraint if exists notification_delivery_traces_transport_check;

alter table public.notification_delivery_traces
  add constraint notification_delivery_traces_transport_check
  check (
    transport in ('web_push', 'expo_push', 'in_app', 'simulated_push', 'route_policy')
  );

-- ── cron: invoke expo-push-worker every minute ─────────────────────────────
create or replace function public.configure_haven_background_cron_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_cron boolean := exists (select 1 from pg_extension where extname = 'pg_cron');
  v_has_net boolean := exists (select 1 from pg_extension where extname = 'pg_net');
  v_enabled boolean;
  v_edge_base_url text;
  v_jobid integer;
  v_media_command text;
  v_preview_command text;
  v_web_push_command text;
  v_expo_push_command text;
begin
  if not v_has_cron or not v_has_net then
    return;
  end if;

  select enabled, trim(edge_base_url)
  into v_enabled, v_edge_base_url
  from public.background_worker_cron_config
  where id = true;

  begin
    select jobid into v_jobid
    from cron.job
    where jobname = 'haven_message_media_maintenance_every_minute'
    limit 1;

    if v_jobid is not null then
      perform cron.unschedule(v_jobid);
    end if;
  exception when others then
    null;
  end;

  begin
    v_jobid := null;
    select jobid into v_jobid
    from cron.job
    where jobname = 'haven_link_preview_worker_every_minute'
    limit 1;

    if v_jobid is not null then
      perform cron.unschedule(v_jobid);
    end if;
  exception when others then
    null;
  end;

  begin
    v_jobid := null;
    select jobid into v_jobid
    from cron.job
    where jobname = 'haven_web_push_worker_every_minute'
    limit 1;

    if v_jobid is not null then
      perform cron.unschedule(v_jobid);
    end if;
  exception when others then
    null;
  end;

  begin
    v_jobid := null;
    select jobid into v_jobid
    from cron.job
    where jobname = 'haven_expo_push_worker_every_minute'
    limit 1;

    if v_jobid is not null then
      perform cron.unschedule(v_jobid);
    end if;
  exception when others then
    null;
  end;

  if coalesce(v_enabled, false) = false or v_edge_base_url is null or v_edge_base_url = '' then
    return;
  end if;

  v_media_command := $cron$
    select net.http_post(
      url := (
        select trim(c.edge_base_url) || '/functions/v1/message-media-maintenance'
        from public.background_worker_cron_config c
        where c.id = true and c.enabled = true
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-haven-cron-secret', (
          select c.cron_shared_secret
          from public.background_worker_cron_config c
          where c.id = true and c.enabled = true
        )
      ),
      body := jsonb_build_object('mode', 'cron')
    );
  $cron$;

  v_preview_command := $cron$
    select net.http_post(
      url := (
        select trim(c.edge_base_url) || '/functions/v1/link-preview-worker'
        from public.background_worker_cron_config c
        where c.id = true and c.enabled = true
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-haven-cron-secret', (
          select c.cron_shared_secret
          from public.background_worker_cron_config c
          where c.id = true and c.enabled = true
        )
      ),
      body := jsonb_build_object('mode', 'cron')
    );
  $cron$;

  v_web_push_command := $cron$
    select net.http_post(
      url := (
        select trim(c.edge_base_url) || '/functions/v1/web-push-worker'
        from public.background_worker_cron_config c
        where c.id = true and c.enabled = true
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-haven-cron-secret', (
          select c.cron_shared_secret
          from public.background_worker_cron_config c
          where c.id = true and c.enabled = true
        )
      ),
      body := jsonb_build_object('mode', 'cron')
    );
  $cron$;

  v_expo_push_command := $cron$
    select net.http_post(
      url := (
        select trim(c.edge_base_url) || '/functions/v1/expo-push-worker'
        from public.background_worker_cron_config c
        where c.id = true and c.enabled = true
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-haven-cron-secret', (
          select c.cron_shared_secret
          from public.background_worker_cron_config c
          where c.id = true and c.enabled = true
        )
      ),
      body := jsonb_build_object('mode', 'cron')
    );
  $cron$;

  perform cron.schedule(
    'haven_message_media_maintenance_every_minute',
    '* * * * *',
    v_media_command
  );

  perform cron.schedule(
    'haven_link_preview_worker_every_minute',
    '* * * * *',
    v_preview_command
  );

  perform cron.schedule(
    'haven_web_push_worker_every_minute',
    '* * * * *',
    v_web_push_command
  );

  perform cron.schedule(
    'haven_expo_push_worker_every_minute',
    '* * * * *',
    v_expo_push_command
  );
end;
$$;

revoke all on function public.configure_haven_background_cron_jobs() from public;
grant execute on function public.configure_haven_background_cron_jobs() to postgres, service_role;

select public.configure_haven_background_cron_jobs();
