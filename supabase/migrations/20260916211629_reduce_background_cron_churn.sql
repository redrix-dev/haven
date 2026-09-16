-- Reduce idle background-worker churn and keep pg_cron history bounded.
--
-- The previous schedules launched all three Edge Function workers every minute.
-- On the free-tier database that produced synchronized I/O spikes, thousands of
-- no-op HTTP requests per day, and enough cron/pg_net history churn to amplify
-- table bloat. Expo push already has an immediate wakeup path, so its cron job is
-- only a fallback. Link previews can tolerate a short delay, and media cleanup is
-- maintenance work rather than a user-facing request path.
--
-- pg_net owns response retention through its ttl setting. Remove the two
-- dashboard-created SQL cleanup jobs instead of adding a third retention owner.

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
  if not v_has_cron then
    return;
  end if;

  -- Reconfiguration is idempotent. Remove both the legacy every-minute names
  -- and the current names before recreating the intended schedule.
  for v_jobid in
    select jobid
    from cron.job
    where jobname = any (array[
      'haven_message_media_maintenance_every_minute',
      'haven_link_preview_worker_every_minute',
      'haven_expo_push_worker_every_minute',
      'haven_message_media_maintenance_every_15_minutes',
      'haven_link_preview_worker_every_5_minutes',
      'haven_expo_push_worker_fallback_every_5_minutes',
      'purge-cron-logs',
      'purge-net-logs',
      'clean-http-response-logs',
      'haven_cron_history_retention_daily'
    ])
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  -- Keep two days for debugging without allowing an idle project's run history
  -- to grow indefinitely. Minute 19 avoids the worker wakeup minutes below.
  perform cron.schedule(
    'haven_cron_history_retention_daily',
    '19 4 * * *',
    $cron$delete from cron.job_run_details where end_time < now() - interval '2 days'$cron$
  );

  if not v_has_net then
    return;
  end if;

  select enabled, trim(edge_base_url)
  into v_enabled, v_edge_base_url
  from public.background_worker_cron_config
  where id = true;

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
    'haven_message_media_maintenance_every_15_minutes',
    '3,18,33,48 * * * *',
    v_media_command
  );

  perform cron.schedule(
    'haven_link_preview_worker_every_5_minutes',
    '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
    v_preview_command
  );

  perform cron.schedule(
    'haven_expo_push_worker_fallback_every_5_minutes',
    '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
    v_expo_push_command
  );
end;
$$;

revoke all on function public.configure_haven_background_cron_jobs() from public;
grant execute on function public.configure_haven_background_cron_jobs() to postgres, service_role;

select public.configure_haven_background_cron_jobs();
