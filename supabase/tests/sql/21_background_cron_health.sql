begin;

select test_support.note('suite 21: background cron schedules and retention ownership');

select test_support.assert_true(
  exists (select 1 from pg_extension where extname = 'pg_cron'),
  'pg_cron must be available for background cron schedule tests'
);

select test_support.assert_true(
  exists (select 1 from pg_extension where extname = 'pg_net'),
  'pg_net must be available for background cron schedule tests'
);

-- Reproduce the dashboard-created cleanup names so the configurator proves it
-- takes ownership of retention and removes the redundant pg_net cleanup jobs.
select cron.schedule(
  'purge-cron-logs',
  '0 0 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

select cron.schedule(
  'purge-net-logs',
  '0 0 * * *',
  $$delete from net._http_response where created < now() - interval '7 days'$$
);

select cron.schedule(
  'clean-http-response-logs',
  '0 0 * * *',
  $$delete from net._http_response where created < now() - interval '2 days'$$
);

insert into public.background_worker_cron_config (
  id,
  enabled,
  edge_base_url,
  cron_shared_secret
)
values (
  true,
  true,
  'https://example.invalid',
  'suite-21-placeholder-secret'
)
on conflict (id)
do update set
  enabled = excluded.enabled,
  edge_base_url = excluded.edge_base_url,
  cron_shared_secret = excluded.cron_shared_secret;

select public.configure_haven_background_cron_jobs();

select test_support.assert_query_count(
  $$
    select 1
    from cron.job
    where jobname in (
      'haven_message_media_maintenance_every_minute',
      'haven_link_preview_worker_every_minute',
      'haven_expo_push_worker_every_minute',
      'purge-cron-logs',
      'purge-net-logs',
      'clean-http-response-logs'
    )
  $$,
  0,
  'legacy worker and dashboard cleanup jobs should be removed'
);

select test_support.assert_eq_text(
  (select schedule from cron.job where jobname = 'haven_message_media_maintenance_every_15_minutes'),
  '3,18,33,48 * * * *',
  'media maintenance should run every 15 minutes at a staggered offset'
);

select test_support.assert_eq_text(
  (select schedule from cron.job where jobname = 'haven_link_preview_worker_every_5_minutes'),
  '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
  'link previews should run every 5 minutes at a staggered offset'
);

select test_support.assert_eq_text(
  (select schedule from cron.job where jobname = 'haven_expo_push_worker_fallback_every_5_minutes'),
  '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  'Expo push fallback should run every 5 minutes at a staggered offset'
);

select test_support.assert_eq_text(
  (select schedule from cron.job where jobname = 'haven_cron_history_retention_daily'),
  '19 4 * * *',
  'cron history retention should run once daily away from worker wakeups'
);

select test_support.assert_true(
  (
    select command = $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$
    from cron.job
    where jobname = 'haven_cron_history_retention_daily'
  ),
  'cron history retention should keep two days'
);

select test_support.assert_query_count(
  $$
    select 1
    from cron.job
    where jobname in (
      'haven_message_media_maintenance_every_15_minutes',
      'haven_link_preview_worker_every_5_minutes',
      'haven_expo_push_worker_fallback_every_5_minutes',
      'haven_cron_history_retention_daily'
    )
  $$,
  4,
  'the configurator should create exactly three workers and one retention job'
);

-- A second call must replace schedules in place rather than create duplicates.
select public.configure_haven_background_cron_jobs();

select test_support.assert_query_count(
  $$
    select 1
    from cron.job
    where jobname in (
      'haven_message_media_maintenance_every_15_minutes',
      'haven_link_preview_worker_every_5_minutes',
      'haven_expo_push_worker_fallback_every_5_minutes',
      'haven_cron_history_retention_daily'
    )
  $$,
  4,
  'reconfiguring cron should remain idempotent'
);

rollback;
