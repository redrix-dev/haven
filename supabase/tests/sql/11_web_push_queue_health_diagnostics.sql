begin;

select test_support.note('suite 11: web push queue health diagnostics RPC + alerting metrics');
select test_support.cleanup_fixture_domain_state();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select public.upsert_my_web_push_subscription(
  'https://push.example.test/queue-health/member-a/device-1',
  'p256dh-suite11',
  'auth-suite11',
  null,
  'test-agent/suite11',
  'windows',
  'standalone',
  '{"suite":"11"}'::jsonb,
  'suite11-installation'
);

reset role;
select test_support.clear_jwt_claims();

set local role postgres;

create temp table if not exists suite11_events (
  seq integer primary key,
  event_id uuid,
  recipient_id uuid,
  job_id uuid
) on commit drop;

insert into suite11_events (seq, event_id)
select
  gs,
  public.create_notification_event_with_recipients(
    'system',
    'system_event',
    gen_random_uuid(),
    null,
    jsonb_build_object('title', 'Suite11 queue health', 'message', concat('job ', gs)),
    jsonb_build_array(
      jsonb_build_object(
        'recipient_user_id', test_support.fixture_user_id('member_a'),
        'deliver_in_app', true,
        'deliver_sound', false
      )
    )
  )
from generate_series(1, 5) gs;

update suite11_events e
set recipient_id = nr.id
from public.notification_recipients nr
where nr.event_id = e.event_id;

update suite11_events e
set job_id = j.id
from public.web_push_notification_jobs j
where j.notification_recipient_id = e.recipient_id;

select test_support.assert_eq_int(
  (select count(*)::bigint from suite11_events where job_id is not null),
  5,
  'suite 11 setup should create one web push job per synthetic notification'
);

-- seq 1 stays pending (claimable now by default)
update public.web_push_notification_jobs
set
  status = 'retryable_failed',
  attempts = 4,
  available_at = timezone('utc', now()) - interval '45 seconds',
  updated_at = timezone('utc', now())
where id = (select job_id from suite11_events where seq = 2);

update public.web_push_notification_jobs
set
  status = 'processing',
  attempts = 2,
  locked_at = timezone('utc', now()) - interval '3 minutes',
  lease_expires_at = timezone('utc', now()) - interval '30 seconds',
  updated_at = timezone('utc', now())
where id = (select job_id from suite11_events where seq = 3);

update public.web_push_notification_jobs
set
  status = 'dead_letter',
  attempts = 5,
  processed_at = timezone('utc', now()) - interval '2 minutes',
  updated_at = timezone('utc', now()) - interval '2 minutes',
  last_error = 'suite11 dead letter'
where id = (select job_id from suite11_events where seq = 4);

update public.web_push_notification_jobs
set
  status = 'done',
  attempts = 1,
  processed_at = timezone('utc', now()) - interval '1 minutes',
  updated_at = timezone('utc', now()) - interval '1 minutes'
where id = (select job_id from suite11_events where seq = 5);

reset role;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.expect_exception(
  $$select * from public.get_web_push_dispatch_queue_health_diagnostics()$$,
  'only active platform staff'
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

create temp table if not exists suite11_queue_health_rows on commit drop as
select * from public.get_web_push_dispatch_queue_health_diagnostics();

select test_support.assert_eq_int(
  (select count(*)::bigint from suite11_queue_health_rows),
  1,
  'queue health diagnostics RPC should return one aggregate row'
);

select test_support.assert_eq_int(
  (select total_pending from suite11_queue_health_rows limit 1),
  1,
  'queue health diagnostics should count pending jobs'
);

select test_support.assert_eq_int(
  (select total_retryable_failed from suite11_queue_health_rows limit 1),
  1,
  'queue health diagnostics should count retryable_failed jobs'
);

select test_support.assert_eq_int(
  (select total_processing from suite11_queue_health_rows limit 1),
  1,
  'queue health diagnostics should count processing jobs'
);

select test_support.assert_eq_int(
  (select total_done from suite11_queue_health_rows limit 1),
  1,
  'queue health diagnostics should count done jobs'
);

select test_support.assert_eq_int(
  (select total_dead_letter from suite11_queue_health_rows limit 1),
  1,
  'queue health diagnostics should count dead_letter jobs'
);

select test_support.assert_eq_int(
  (select claimable_now_count from suite11_queue_health_rows limit 1),
  3,
  'pending + retryable due + expired processing should be claimable now'
);

select test_support.assert_eq_int(
  (select pending_due_now_count from suite11_queue_health_rows limit 1),
  1,
  'pending due-now count should include the untouched pending job'
);

select test_support.assert_eq_int(
  (select retryable_due_now_count from suite11_queue_health_rows limit 1),
  1,
  'retryable due-now count should include the retryable_failed job'
);

select test_support.assert_eq_int(
  (select processing_lease_expired_count from suite11_queue_health_rows limit 1),
  1,
  'expired processing lease count should include the stale processing job'
);

select test_support.assert_eq_int(
  (select dead_letter_last_60m_count from suite11_queue_health_rows limit 1),
  1,
  'recent dead-letter count should include the synthetic dead-letter job'
);

select test_support.assert_eq_int(
  (select retryable_failed_last_10m_count from suite11_queue_health_rows limit 1),
  1,
  'recent retryable-failed count should include the synthetic retryable job'
);

select test_support.assert_eq_int(
  (select done_last_10m_count from suite11_queue_health_rows limit 1),
  1,
  'recent done count should include the synthetic completed job'
);

select test_support.assert_eq_int(
  (select max_attempts_active from suite11_queue_health_rows limit 1),
  4,
  'max_attempts_active should reflect the retryable job attempt count'
);

select test_support.assert_eq_int(
  (select high_retry_attempt_count from suite11_queue_health_rows limit 1),
  1,
  'high_retry_attempt_count should count retryable/processing jobs with attempts >= 3'
);

select test_support.assert_true(
  (select coalesce(oldest_claimable_age_seconds, -1) >= 0 from suite11_queue_health_rows limit 1),
  'oldest claimable age seconds should be populated'
);

select test_support.assert_true(
  (select coalesce(oldest_retryable_failed_age_seconds, -1) >= 0 from suite11_queue_health_rows limit 1),
  'oldest retryable age seconds should be populated'
);

select test_support.assert_true(
  (select coalesce(oldest_processing_age_seconds, -1) >= 0 from suite11_queue_health_rows limit 1),
  'oldest processing age seconds should be populated'
);

select test_support.assert_true(
  (select coalesce(oldest_processing_lease_overdue_seconds, -1) >= 0 from suite11_queue_health_rows limit 1),
  'oldest processing lease overdue seconds should be populated for stale leases'
);

reset role;
select test_support.clear_jwt_claims();

rollback;

