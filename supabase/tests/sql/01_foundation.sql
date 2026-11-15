-- The tools every other file uses: ids, closed-by-default grants, the error
-- contract, rate limits, settings, jobs, and the realtime topic.
begin;

create function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end;
$$;

-- ── Ids ─────────────────────────────────────────────────────────────────────
create temp table made as select n, private.uuid_v7() as id from generate_series(1, 2000) n;
select test_support.assert_eq_int((select count(distinct id) from made), 2000, 'ids are distinct');
select test_support.assert_eq_int(
  (select count(*) from made where substring(id::text from 15 for 1) = '7'), 2000, 'every id is a version 7 UUID');
select test_support.assert_eq_int(
  (select count(*) from (select id, lag(id) over (order by n) as previous from made) m where m.id <= m.previous), 0,
  'ids sort in the order they were made');
select test_support.assert_true(
  abs(extract(epoch from clock_timestamp()) * 1000
      - ('x' || replace(left(private.uuid_v7()::text, 13), '-', ''))::bit(48)::bigint) < 60000,
  'the first 48 bits of an id are the time it was made');

-- ── Nothing is exposed by accident ──────────────────────────────────────────
create table public.probe_table (id integer);
create function public.probe_function() returns integer language sql as 'select 1';
select test_support.assert_false(
  has_table_privilege('authenticated', 'public.probe_table', 'select, insert, update, delete'),
  'a new table is closed to signed-in people until a grant says otherwise');
select test_support.assert_false(
  has_table_privilege('anon', 'public.probe_table', 'select, insert, update, delete'), 'and to visitors');
select test_support.assert_false(
  has_function_privilege('authenticated', 'public.probe_function()', 'execute'), 'a new function is closed too');
select test_support.assert_false(
  has_function_privilege('anon', 'public.probe_function()', 'execute'), 'for visitors as well');
select test_support.assert_false(has_schema_privilege('anon', 'private', 'usage'), 'a visitor cannot see the private schema');

-- ── One way to refuse ───────────────────────────────────────────────────────
select test_support.assert_eq_text(pg_temp.code_of($$ select private.fail('unauthenticated', 'r', 'm') $$), 'PT401', '401');
select test_support.assert_eq_text(pg_temp.code_of($$ select private.fail('forbidden', 'r', 'm') $$), '42501', '403');
select test_support.assert_eq_text(pg_temp.code_of($$ select private.fail('not_found', 'r', 'm') $$), 'PT404', '404');
select test_support.assert_eq_text(pg_temp.code_of($$ select private.fail('conflict', 'r', 'm') $$), 'PT409', '409');
select test_support.assert_eq_text(pg_temp.code_of($$ select private.fail('rate_limited', 'r', 'm') $$), 'PT429', '429');
select test_support.assert_eq_text(pg_temp.code_of($$ select private.fail('invalid', 'r', 'm') $$), '22023', '400');
select test_support.expect_error($$ select private.fail('invalid', 'the_reason', 'A sentence.') $$, 'the_reason');
select test_support.expect_error($$ select private.fail('invalid', 'the_reason', 'A sentence.') $$, 'A sentence.');

-- ── Rate limits ─────────────────────────────────────────────────────────────
select private.rate_limit(test_support.user_id('member_a'), 'probe', 2, interval '1 minute');
select private.rate_limit(test_support.user_id('member_a'), 'probe', 2, interval '1 minute');
select test_support.expect_error(
  $$ select private.rate_limit(test_support.user_id('member_a'), 'probe', 2, interval '1 minute') $$, 'rate_limited');
select test_support.assert_eq_text(
  pg_temp.code_of($$ select private.rate_limit(test_support.user_id('member_a'), 'probe', 2, interval '1 minute') $$),
  'PT429', 'the third attempt inside the window is refused as "too many requests"');
-- Another action and another person are counted on their own.
select private.rate_limit(test_support.user_id('member_a'), 'other', 2, interval '1 minute');
select private.rate_limit(test_support.user_id('member_b'), 'probe', 2, interval '1 minute');
-- Attempts older than the window no longer count.
update private.rate_limit_hits set at = now() - interval '2 minutes'
  where action = 'probe' and user_id = test_support.user_id('member_a');
select private.rate_limit(test_support.user_id('member_a'), 'probe', 2, interval '1 minute');

-- ── Settings ────────────────────────────────────────────────────────────────
delete from vault.secrets where name like 'haven.%';
select test_support.assert_true(private.setting('probe') is null, 'a setting nobody stored is null');
select private.set_setting('probe', 'one');
select test_support.assert_eq_text(private.setting('probe'), 'one', 'a stored setting reads back');
select private.set_setting('probe', 'two');
select test_support.assert_eq_text(private.setting('probe'), 'two', 'storing again replaces it');
select test_support.assert_query_count(
  $$ select 1 from vault.secrets s where s.name = 'haven.probe' $$, 1, 'in one Vault row');
select test_support.assert_query_count(
  $$ select 1 from vault.secrets s where s.name = 'haven.probe' and s.secret = 'two' $$, 0,
  'which does not hold the value in the clear');

-- ── Jobs ────────────────────────────────────────────────────────────────────
delete from private.jobs where true;
delete from net.http_request_queue where true;
select private.enqueue_job('push_send', '{"n": "keyed"}', 'k1');
select private.enqueue_job('push_send', '{"n": "keyed again"}', 'k1');
select private.enqueue_job('push_send', '{"n": "plain"}');
select private.enqueue_job('push_send', '{"n": "later"}', null, now() + interval '1 hour');
select test_support.assert_query_count(
  $$ select 1 from private.jobs $$, 3, 'a second job with the same key is not queued while the first is unfinished');
select test_support.assert_query_count(
  $$ select 1 from net.http_request_queue $$, 0, 'with no worker address stored, nothing is called');
select test_support.expect_error($$ select private.enqueue_job('nonsense', '{}') $$, 'jobs_kind_check');

-- Only a worker (the service role) may take jobs.
select test_support.assert_true(
  has_function_privilege('service_role', 'public.worker_claim_jobs(text, integer, integer)', 'execute'),
  'the service role claims jobs');
select test_support.assert_false(
  has_function_privilege('authenticated', 'public.worker_claim_jobs(text, integer, integer)', 'execute'),
  'a signed-in person cannot');
select test_support.assert_false(
  has_function_privilege('authenticated', 'public.worker_finish_job(uuid, text)', 'execute'), 'nor finish one');

select test_support.assert_query_count(
  $$ select 1 from public.worker_claim_jobs('link_preview', 10) $$, 0, 'a worker only gets its own kind of job');
create temp table claimed as select * from public.worker_claim_jobs('push_send', 10);
select test_support.assert_eq_text(
  (select string_agg(payload ->> 'n', ',' order by id) from claimed), 'keyed,plain',
  'a worker is handed what is due, oldest first; a job for later waits');
select test_support.assert_eq_int((select max(attempts) from claimed), 1, 'and the attempt is counted');
select test_support.assert_query_count(
  $$ select 1 from public.worker_claim_jobs('push_send', 10) $$, 0, 'a claimed job is not handed out twice');

-- Done.
select public.worker_finish_job((select id from claimed where payload ->> 'n' = 'keyed'));
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.payload ->> 'n' = 'keyed' and j.status = 'done' and j.finished_at is not null $$,
  1, 'no error means done');
select private.enqueue_job('push_send', '{"n": "keyed, next"}', 'k1');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.dedupe_key = 'k1' $$, 2, 'once it is done the key is free again');
select public.worker_finish_job((select id from claimed where payload ->> 'n' = 'keyed'), 'too late');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.payload ->> 'n' = 'keyed' and j.status = 'done' and j.last_error is null $$,
  1, 'a job that is not running cannot be finished again');

-- A worker that died: the lease runs out and the job is handed out again.
update private.jobs set locked_until = now() - interval '1 second' where payload ->> 'n' = 'plain';
select test_support.assert_eq_int(
  (select c.attempts from public.worker_claim_jobs('push_send', 10) c where c.payload ->> 'n' = 'plain'), 2,
  'an expired lease is claimed again as attempt 2');

-- Failed: retried later, each time further away.
select public.worker_finish_job((select id from claimed where payload ->> 'n' = 'plain'), 'boom');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j
     where j.payload ->> 'n' = 'plain' and j.status = 'pending' and j.last_error = 'boom'
       and j.run_at = now() + interval '120 seconds' and j.finished_at is null $$,
  1, 'an error puts it back for later (30s x 2^attempts)');
select test_support.assert_query_count(
  $$ select 1 from public.worker_claim_jobs('push_send', 10) c where c.payload ->> 'n' = 'plain' $$, 0,
  'and it is not handed out before then');

-- Out of attempts: it stops, and stays for a person to look at.
update private.jobs set status = 'running', attempts = max_attempts where payload ->> 'n' = 'plain';
select public.worker_finish_job((select id from claimed where payload ->> 'n' = 'plain'), 'boom again');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.payload ->> 'n' = 'plain' and j.status = 'failed' and j.finished_at is not null $$,
  1, 'after the last attempt it is failed');

-- ── Waking a worker ─────────────────────────────────────────────────────────
select private.set_setting('edge_base_url', 'http://edge.test/functions/v1/');
select private.set_setting('worker_secret', 's3cret');
delete from private.worker_wakes where true;
select private.enqueue_job('link_preview', '{}');
select test_support.assert_query_count(
  $$ select 1 from net.http_request_queue q
     where q.url = 'http://edge.test/functions/v1/link-preview-worker'
       and q.headers ->> 'x-haven-worker-secret' = 's3cret' $$,
  1, 'a new job calls its worker, with the shared secret');
select private.enqueue_job('link_preview', '{}');
select test_support.assert_query_count(
  $$ select 1 from net.http_request_queue $$, 1, 'a second job straight after does not call again');
select private.enqueue_job('email_send', '{}');
select test_support.assert_query_count(
  $$ select 1 from net.http_request_queue q where q.url like '%/mail-worker' $$, 1, 'each kind calls its own worker');
select private.enqueue_job('media_scan', '{}', null, now() + interval '1 hour');
select test_support.assert_query_count(
  $$ select 1 from net.http_request_queue q where q.url like '%/scan-worker' $$, 0, 'a job for later calls nobody yet');
-- The once-a-minute fallback wakes every worker that has something due.
update private.worker_wakes set last_at = now() - interval '5 seconds';
select private.wake_due_workers();
select test_support.assert_eq_text(
  (select string_agg(distinct substring(q.url from '[^/]+$'), ',' order by substring(q.url from '[^/]+$'))
   from net.http_request_queue q),
  'link-preview-worker,mail-worker', 'only workers with work due are called');
select test_support.assert_query_count(
  $$ select 1 from net.http_request_queue $$, 4, 'the fallback called both of them once more');
select test_support.assert_query_count(
  $$ select 1 from cron.job j where j.jobname in ('haven_sweep_daily', 'haven_wake_workers') and j.active $$, 2,
  'the sweep and the fallback are scheduled');

-- ── Housekeeping ────────────────────────────────────────────────────────────
update private.jobs set finished_at = now() - interval '8 days' where status in ('done', 'failed');
update private.rate_limit_hits set at = now() - interval '2 days' where action = 'other';
select private.sweep();
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.status = 'done' $$, 0, 'finished jobs are swept after a week');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.status = 'failed' $$, 1, 'failed jobs are kept');
select test_support.assert_query_count(
  $$ select 1 from private.rate_limit_hits h where h.action = 'other' $$, 0, 'old rate-limit attempts are swept');
select test_support.assert_query_count(
  $$ select 1 from private.rate_limit_hits h where h.action = 'probe' $$, 4, 'ones from the last day are kept');

-- ── Realtime: one private topic per person ──────────────────────────────────
select test_support.clear_sent();
select private.broadcast(
  array[test_support.user_id('member_a'), test_support.user_id('member_a'), null, test_support.user_id('member_b')],
  'probe.event', '{"x": 1}');
select test_support.assert_eq_int(test_support.sent('member_a', 'probe.event'), 1, 'each person is sent an event once');
select test_support.assert_eq_int(test_support.sent('member_b', 'probe.event'), 1, 'on their own private topic');
select test_support.assert_query_count(
  $$ select 1 from realtime.messages m where m.event = 'probe.event' $$, 2, 'and nobody else is sent it');
select test_support.assert_eq_text(test_support.last_sent('member_a', 'probe.event') ->> 'x', '1', 'with the payload');

-- Supabase Realtime decides whether someone may join a topic by running the
-- policy with realtime.topic set to the topic they asked for.
select test_support.become('member_a');
select set_config('realtime.topic', 'user:' || test_support.user_id('member_a')::text, true);
select test_support.assert_true((select count(*) from realtime.messages) > 0, 'a person may join their own topic');
select set_config('realtime.topic', 'user:' || test_support.user_id('member_b')::text, true);
select test_support.assert_eq_int((select count(*) from realtime.messages), 0, 'and not somebody else''s');
select set_config('realtime.topic', 'anything', true);
select test_support.assert_eq_int((select count(*) from realtime.messages), 0, 'nor a topic of any other name');
select test_support.become(null);

rollback;
