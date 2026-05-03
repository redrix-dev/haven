-- Retire legacy web push fanout and add immediate wakeups for Expo push dispatch.

-- ── disable legacy web push fanout + subscriptions ────────────────────────
drop trigger if exists trg_enqueue_web_push_jobs_for_notification_recipient
  on public.notification_recipients;

delete from public.web_push_subscriptions;

update public.notification_dispatch_wakeups
set
  enabled = false,
  shadow_mode = false,
  last_reason = 'retired_for_expo_push_cutover',
  last_skip_reason = 'retired',
  last_error = null,
  updated_at = timezone('utc', now())
where id = true;

-- ── expo immediate wakeup scheduler singleton ─────────────────────────────
create table if not exists public.expo_push_dispatch_wakeups (
  id boolean primary key default true check (id = true),
  enabled boolean not null default true,
  min_interval_seconds integer not null default 2 check (min_interval_seconds between 1 and 60),
  last_attempted_at timestamptz,
  last_requested_at timestamptz,
  last_request_id bigint,
  last_reason text,
  last_skip_reason text,
  last_error text,
  total_attempts bigint not null default 0,
  total_scheduled bigint not null default 0,
  total_debounced bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.expo_push_dispatch_wakeups enable row level security;
revoke all on table public.expo_push_dispatch_wakeups from public;
revoke all on table public.expo_push_dispatch_wakeups from authenticated;

create unique index if not exists uq_expo_push_dispatch_wakeups_singleton
  on public.expo_push_dispatch_wakeups ((id))
  where id = true;

drop trigger if exists trg_expo_push_dispatch_wakeups_set_updated_at on public.expo_push_dispatch_wakeups;
create trigger trg_expo_push_dispatch_wakeups_set_updated_at
before update on public.expo_push_dispatch_wakeups
for each row execute function public.set_updated_at();

insert into public.expo_push_dispatch_wakeups (id)
values (true)
on conflict (id) do nothing;

create or replace function public.request_expo_push_dispatch_wakeup(
  p_reason text default 'notification_enqueue'
)
returns table(
  scheduled boolean,
  skipped_reason text,
  request_id bigint,
  attempted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user text := current_user;
  v_auth_role text := auth.role();
  v_now timestamptz := timezone('utc', now());
  v_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'notification_enqueue');
  v_state public.expo_push_dispatch_wakeups%rowtype;
  v_has_net boolean := exists (select 1 from pg_extension where extname = 'pg_net');
  v_cfg_enabled boolean;
  v_cfg_edge_base_url text;
  v_cfg_cron_secret text;
  v_request_id bigint;
  v_skipped_reason text;
  v_lock_acquired boolean;
begin
  if not (
    v_current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(v_auth_role, '') in ('service_role', 'supabase_admin')
  ) then
    raise exception 'Not authorized to request expo push dispatch wakeup'
      using errcode = '42501';
  end if;

  insert into public.expo_push_dispatch_wakeups (id)
  values (true)
  on conflict (id) do nothing;

  v_lock_acquired := pg_try_advisory_xact_lock(hashtext('haven:expo_push_dispatch_wakeup')::bigint);
  if not coalesce(v_lock_acquired, false) then
    update public.expo_push_dispatch_wakeups
    set
      last_attempted_at = v_now,
      last_reason = v_reason,
      last_skip_reason = 'concurrent',
      last_error = null,
      total_attempts = total_attempts + 1,
      updated_at = v_now
    where id = true;

    return query
    select false, 'concurrent'::text, null::bigint, v_now;
    return;
  end if;

  select *
  into v_state
  from public.expo_push_dispatch_wakeups
  where id = true
  for update;

  if coalesce(v_state.enabled, true) = false then
    v_skipped_reason := 'wakeup_disabled';
    update public.expo_push_dispatch_wakeups
    set
      last_attempted_at = v_now,
      last_reason = v_reason,
      last_skip_reason = v_skipped_reason,
      last_error = null,
      total_attempts = total_attempts + 1,
      updated_at = v_now
    where id = true;

    return query
    select false, v_skipped_reason, null::bigint, v_now;
    return;
  end if;

  if v_state.last_requested_at is not null
     and v_state.last_requested_at + make_interval(secs => greatest(coalesce(v_state.min_interval_seconds, 2), 1)) > v_now then
    v_skipped_reason := 'debounced';
    update public.expo_push_dispatch_wakeups
    set
      last_attempted_at = v_now,
      last_reason = v_reason,
      last_skip_reason = v_skipped_reason,
      last_error = null,
      total_attempts = total_attempts + 1,
      total_debounced = total_debounced + 1,
      updated_at = v_now
    where id = true;

    return query
    select false, v_skipped_reason, null::bigint, v_now;
    return;
  end if;

  if not v_has_net then
    v_skipped_reason := 'pg_net_unavailable';
    update public.expo_push_dispatch_wakeups
    set
      last_attempted_at = v_now,
      last_reason = v_reason,
      last_skip_reason = v_skipped_reason,
      last_error = null,
      total_attempts = total_attempts + 1,
      updated_at = v_now
    where id = true;

    return query
    select false, v_skipped_reason, null::bigint, v_now;
    return;
  end if;

  select
    c.enabled,
    nullif(trim(coalesce(c.edge_base_url, '')), ''),
    nullif(trim(coalesce(c.cron_shared_secret, '')), '')
  into
    v_cfg_enabled,
    v_cfg_edge_base_url,
    v_cfg_cron_secret
  from public.background_worker_cron_config c
  where c.id = true;

  if coalesce(v_cfg_enabled, false) = false
     or v_cfg_edge_base_url is null
     or v_cfg_cron_secret is null then
    v_skipped_reason := 'cron_config_unavailable';
    update public.expo_push_dispatch_wakeups
    set
      last_attempted_at = v_now,
      last_reason = v_reason,
      last_skip_reason = v_skipped_reason,
      last_error = null,
      total_attempts = total_attempts + 1,
      updated_at = v_now
    where id = true;

    return query
    select false, v_skipped_reason, null::bigint, v_now;
    return;
  end if;

  begin
    select net.http_post(
      url := v_cfg_edge_base_url || '/functions/v1/expo-push-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-haven-cron-secret', v_cfg_cron_secret
      ),
      body := jsonb_build_object('mode', 'wakeup')
    )
    into v_request_id;
  exception when others then
    v_skipped_reason := 'http_post_error';
    update public.expo_push_dispatch_wakeups
    set
      last_attempted_at = v_now,
      last_reason = v_reason,
      last_skip_reason = v_skipped_reason,
      last_error = left(sqlerrm, 2000),
      total_attempts = total_attempts + 1,
      updated_at = v_now
    where id = true;

    return query
    select false, v_skipped_reason, null::bigint, v_now;
    return;
  end;

  update public.expo_push_dispatch_wakeups
  set
    last_attempted_at = v_now,
    last_requested_at = v_now,
    last_request_id = v_request_id,
    last_reason = v_reason,
    last_skip_reason = null,
    last_error = null,
    total_attempts = total_attempts + 1,
    total_scheduled = total_scheduled + 1,
    updated_at = v_now
  where id = true;

  return query
  select true, null::text, v_request_id, v_now;
end;
$$;

revoke all on function public.request_expo_push_dispatch_wakeup(text) from public;
grant execute on function public.request_expo_push_dispatch_wakeup(text)
  to postgres, service_role;

-- ── expo notification trigger should wake the worker immediately ───────────
create or replace function public.enqueue_expo_push_jobs_for_notification_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queued_count bigint := 0;
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

  get diagnostics v_queued_count = row_count;

  if v_queued_count > 0 then
    begin
      perform public.request_expo_push_dispatch_wakeup('notification_recipient_insert');
    exception when others then
      -- Wakeup dispatch is best-effort; never break notification creation.
      null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_expo_push_jobs_for_notification_recipient() from public;
grant execute on function public.enqueue_expo_push_jobs_for_notification_recipient()
  to postgres, service_role;

-- ── cron config: keep Expo cron fallback, retire web push cron scheduling ──
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
    'haven_expo_push_worker_every_minute',
    '* * * * *',
    v_expo_push_command
  );
end;
$$;

revoke all on function public.configure_haven_background_cron_jobs() from public;
grant execute on function public.configure_haven_background_cron_jobs() to postgres, service_role;

select public.configure_haven_background_cron_jobs();
