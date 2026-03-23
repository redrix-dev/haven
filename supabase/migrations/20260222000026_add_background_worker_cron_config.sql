-- Configure cron hooks for background edge workers (media maintenance + link preview worker).
-- These jobs invoke edge functions with a shared secret header. Edge functions should be deployed with --no-verify-jwt.

create table if not exists public.background_worker_cron_config (
  id boolean primary key default true check (id = true),
  enabled boolean not null default false,
  edge_base_url text,
  cron_shared_secret text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (enabled = false)
    or (
      enabled = true
      and edge_base_url is not null and char_length(trim(edge_base_url)) > 0
      and cron_shared_secret is not null and char_length(trim(cron_shared_secret)) >= 16
    )
  )
);

alter table public.background_worker_cron_config enable row level security;
revoke all on table public.background_worker_cron_config from public;
revoke all on table public.background_worker_cron_config from authenticated;

create unique index if not exists uq_background_worker_cron_config_singleton
  on public.background_worker_cron_config((id))
  where id = true;

drop trigger if exists trg_background_worker_cron_config_set_updated_at on public.background_worker_cron_config;
create trigger trg_background_worker_cron_config_set_updated_at
before update on public.background_worker_cron_config
for each row execute function public.set_updated_at();

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
end;
$$;

revoke all on function public.configure_haven_background_cron_jobs() from public;
grant execute on function public.configure_haven_background_cron_jobs() to postgres, service_role;

-- Optional helper for project admins (run manually from SQL editor) to set config and (re)schedule jobs.
create or replace function public.set_haven_background_cron_config(
  p_edge_base_url text,
  p_cron_shared_secret text,
  p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.background_worker_cron_config (
    id,
    enabled,
    edge_base_url,
    cron_shared_secret
  )
  values (
    true,
    coalesce(p_enabled, true),
    nullif(trim(coalesce(p_edge_base_url, '')), ''),
    nullif(trim(coalesce(p_cron_shared_secret, '')), '')
  )
  on conflict (id)
  do update set
    enabled = excluded.enabled,
    edge_base_url = excluded.edge_base_url,
    cron_shared_secret = excluded.cron_shared_secret,
    updated_at = timezone('utc', now());

  perform public.configure_haven_background_cron_jobs();
end;
$$;

revoke all on function public.set_haven_background_cron_config(text, text, boolean) from public;
grant execute on function public.set_haven_background_cron_config(text, text, boolean) to postgres, service_role;

-- Try enabling required extensions in local/dev where supported. Ignore if unavailable.
do $$
begin
  begin
    create schema if not exists extensions;
  exception when others then
    null;
  end;

  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    null;
  end;

  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    null;
  end;
end $$;

-- If config already exists (for example restored environments), refresh schedules.
select public.configure_haven_background_cron_jobs();
