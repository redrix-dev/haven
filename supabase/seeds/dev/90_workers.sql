-- Pack: workers
-- Tells the database where the worker functions live, so new jobs (push,
-- link previews, file deletion, mail) wake them through the stack's own
-- gateway. See docs/architecture/DATABASE.md, "Jobs and workers".
--
-- The shared secret is not in this file. devdb passes it to psql as
-- :haven_cron_secret, read from the functions .env on the host. With no secret
-- the settings are removed instead, so the database queues jobs and calls
-- nobody rather than calling a function that would reject it.

select test_support.note('seeds/dev/90_workers: where the workers live');

select set_config('haven.devdb_worker_secret', :'haven_cron_secret', false);

do $$
declare
  v_secret text := trim(current_setting('haven.devdb_worker_secret', true));
begin
  if char_length(coalesce(v_secret, '')) >= 16 then
    perform private.set_setting('edge_base_url', 'http://kong:8000/functions/v1');
    perform private.set_setting('worker_secret', v_secret);
    raise notice 'workers ON, called at http://kong:8000/functions/v1';
  else
    delete from vault.secrets s where s.name in ('haven.edge_base_url', 'haven.worker_secret');
    raise notice 'workers OFF: no HAVEN_WORKER_CRON_SECRET of 16+ characters in the functions .env';
  end if;
end $$;
