-- Retire the PWA web-push transport (chore/web-push-retire).
--
-- The React/Electron web client was removed 2026-06-09 and notification dispatch
-- was cut over to Expo wakeups on 2026-05-03 (20260503000100). Since then
-- web_push_subscriptions and web_push_notification_jobs have stayed empty, the
-- web-push worker has been unscheduled, and its notification_recipients enqueue
-- trigger was already dropped (leaving enqueue_web_push_jobs_for_notification_recipient
-- orphaned). Desktop notifications will be delivered natively by the Tauri shell,
-- not via browser web-push, so this machinery has no future consumer.
--
-- Intentionally RETAINED: historical notification_delivery_traces rows with
-- transport = 'web_push' (~440 rows) are kept for reference, so the
-- notification_delivery_transport value 'web_push' is NOT removed anywhere.

-- 1. Remove any lingering web-push cron job (idempotent; it is already unscheduled
--    in prod but this guarantees the same in every environment).
do $$
begin
  perform cron.unschedule('haven_web_push_worker_every_minute');
exception when others then
  null;
end
$$;

-- 2. Rebuild the cron configurator without the web-push worker's unschedule block.
--    (It already did not schedule the web-push worker; this drops the last
--    web-push reference so the function stops mentioning a retired job.)
create or replace function public.configure_haven_background_cron_jobs()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;

-- 3. Drop every web-push function: subscription RPCs, worker claim/complete/enqueue,
--    wakeup + diagnostics RPCs, and the orphaned enqueue trigger function.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~ 'web_push'
  loop
    execute format('drop function if exists %s cascade', fn);
  end loop;
end
$$;

-- 4. Drop the web-push tables (with their updated_at triggers and RLS policies via
--    cascade) and the legacy web-push-only dispatch wakeup table. No inbound foreign
--    keys reference these; notification_delivery_traces is unaffected.
drop table if exists public.web_push_notification_jobs cascade;
drop table if exists public.web_push_subscriptions cascade;
drop table if exists public.notification_dispatch_wakeups cascade;
