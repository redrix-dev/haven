-- Extend background edge-worker cron scheduling to include web push dispatch.
-- Keeps the existing singleton config table/RPC contract unchanged.

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
end;
$$;

revoke all on function public.configure_haven_background_cron_jobs() from public;
grant execute on function public.configure_haven_background_cron_jobs() to postgres, service_role;

-- Refresh schedules for environments with an existing cron config row.
select public.configure_haven_background_cron_jobs();
