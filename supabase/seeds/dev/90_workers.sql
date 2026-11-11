-- Pack: workers
-- Turns on the pg_cron jobs that call the edge functions (link previews, media
-- maintenance, Expo push), pointed at the stack's own gateway.
--
-- The shared secret is not in this file. devdb passes it to psql as
-- :haven_cron_secret, read from the functions .env on the host. With no secret
-- the jobs are switched off instead, so nothing calls a function that would
-- reject it.

select test_support.note('seeds/dev/90_workers: background cron config');

select set_config('haven.devdb_cron_secret', :'haven_cron_secret', false);

do $$
declare
  v_secret text := trim(current_setting('haven.devdb_cron_secret', true));
  v_enabled boolean := char_length(coalesce(v_secret, '')) >= 16;
begin
  insert into public.background_worker_cron_config (id, enabled, edge_base_url, cron_shared_secret)
  values (true, v_enabled, 'http://kong:8000', case when v_enabled then v_secret end)
  on conflict (id) do update
  set enabled = excluded.enabled,
      edge_base_url = excluded.edge_base_url,
      cron_shared_secret = excluded.cron_shared_secret;

  perform public.configure_haven_background_cron_jobs();

  if v_enabled then
    raise notice 'background workers ON, calling http://kong:8000';
  else
    raise notice 'background workers OFF: no HAVEN_WORKER_CRON_SECRET of 16+ characters in the functions .env';
  end if;
end $$;
