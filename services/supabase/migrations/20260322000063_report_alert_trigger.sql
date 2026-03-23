-- Best-effort report alerting for support reports and DM reports.
-- Report inserts must succeed even if pg_net or the edge function is unavailable.

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
end $$;

create or replace function public.enqueue_report_alert(
  p_report_id uuid,
  p_report_type text,
  p_reporter_user_id uuid,
  p_server_name text,
  p_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_net boolean := exists (
    select 1
    from pg_extension
    where extname = 'pg_net'
  );
  v_edge_base_url text;
  v_reporter_username text;
begin
  if not v_has_net then
    return;
  end if;

  if to_regclass('public.background_worker_cron_config') is null then
    return;
  end if;

  select nullif(trim(coalesce(c.edge_base_url, '')), '')
  into v_edge_base_url
  from public.background_worker_cron_config c
  where c.id = true
  limit 1;

  if v_edge_base_url is null then
    return;
  end if;

  select coalesce(nullif(trim(p.username), ''), p_reporter_user_id::text)
  into v_reporter_username
  from public.profiles p
  where p.id = p_reporter_user_id
  limit 1;

  v_reporter_username := coalesce(v_reporter_username, p_reporter_user_id::text, 'unknown');

  begin
    perform net.http_post(
      url := v_edge_base_url || '/functions/v1/report-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'reportId', p_report_id,
        'reportType', p_report_type,
        'reporterUsername', v_reporter_username,
        'serverName', coalesce(nullif(trim(coalesce(p_server_name, '')), ''), 'Unknown Server'),
        'createdAt', p_created_at
      )
    );
  exception when others then
    raise log 'Failed to enqueue report alert for report %: %', p_report_id, left(sqlerrm, 2000);
  end;
exception when others then
  raise log 'Unexpected report alert enqueue failure for report %: %', p_report_id, left(sqlerrm, 2000);
end;
$$;

create or replace function public.trigger_support_report_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_name text;
begin
  select coalesce(nullif(trim(c.name), ''), 'Unknown Server')
  into v_server_name
  from public.communities c
  where c.id = new.community_id
  limit 1;

  perform public.enqueue_report_alert(
    new.id,
    'server',
    new.reporter_user_id,
    coalesce(v_server_name, 'Unknown Server'),
    new.created_at
  );

  return new;
exception when others then
  raise log 'Support report alert trigger failed for report %: %', new.id, left(sqlerrm, 2000);
  return new;
end;
$$;

create or replace function public.trigger_dm_message_report_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_report_alert(
    new.id,
    'dm',
    new.reporter_user_id,
    'Direct Message',
    new.created_at
  );

  return new;
exception when others then
  raise log 'DM report alert trigger failed for report %: %', new.id, left(sqlerrm, 2000);
  return new;
end;
$$;

drop trigger if exists trg_support_reports_report_alert on public.support_reports;
create trigger trg_support_reports_report_alert
after insert on public.support_reports
for each row execute function public.trigger_support_report_alert();

drop trigger if exists trg_dm_message_reports_report_alert on public.dm_message_reports;
create trigger trg_dm_message_reports_report_alert
after insert on public.dm_message_reports
for each row execute function public.trigger_dm_message_report_alert();

-- CHECKPOINT 2 COMPLETE
