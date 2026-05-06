begin;

select test_support.note('suite 10: expo push immediate wakeup scheduler (debounce)');
select test_support.cleanup_fixture_domain_state();

set local role postgres;

-- Reset singleton state for deterministic assertions.
delete from public.background_worker_cron_config where id = true;

insert into public.expo_push_dispatch_wakeups (
  id,
  enabled,
  min_interval_seconds,
  last_attempted_at,
  last_requested_at,
  last_request_id,
  last_reason,
  last_skip_reason,
  last_error,
  total_attempts,
  total_scheduled,
  total_debounced
)
values (
  true,
  true,
  2,
  null,
  null,
  null,
  null,
  null,
  null,
  0,
  0,
  0
)
on conflict (id) do update set
  enabled = excluded.enabled,
  min_interval_seconds = excluded.min_interval_seconds,
  last_attempted_at = excluded.last_attempted_at,
  last_requested_at = excluded.last_requested_at,
  last_request_id = excluded.last_request_id,
  last_reason = excluded.last_reason,
  last_skip_reason = excluded.last_skip_reason,
  last_error = excluded.last_error,
  total_attempts = excluded.total_attempts,
  total_scheduled = excluded.total_scheduled,
  total_debounced = excluded.total_debounced,
  updated_at = timezone('utc', now());

create temp table if not exists wakeup_attempt_result on commit drop as
select * from public.request_expo_push_dispatch_wakeup('suite10_no_config');

select test_support.assert_false(
  (select scheduled from wakeup_attempt_result limit 1),
  'wakeup helper should not schedule when cron config is unavailable'
);

select test_support.assert_eq_text(
  (select skipped_reason from wakeup_attempt_result limit 1),
  'cron_config_unavailable',
  'missing cron config should be reported explicitly'
);

update public.expo_push_dispatch_wakeups
set
  enabled = true,
  min_interval_seconds = 5,
  last_requested_at = timezone('utc', now()),
  last_skip_reason = null,
  last_error = null
where id = true;

create temp table if not exists wakeup_debounced_result on commit drop as
select * from public.request_expo_push_dispatch_wakeup('suite10_debounce');

select test_support.assert_false(
  (select scheduled from wakeup_debounced_result limit 1),
  'wakeup helper should debounce repeated requests within the interval'
);

select test_support.assert_eq_text(
  (select skipped_reason from wakeup_debounced_result limit 1),
  'debounced',
  'debounced wakeups should report the debounce reason'
);

select test_support.assert_true(
  (
    select total_debounced >= 1
    from public.expo_push_dispatch_wakeups
    where id = true
  ),
  'wakeup state should track debounced attempts'
);

-- Trigger integration: enqueueing a push-eligible notification should attempt a wakeup.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select public.upsert_my_expo_push_subscription(
  'ExponentPushToken[suite10-member-a-device-1]',
  'windows',
  'suite10-installation',
  '{"suite":"10"}'::jsonb
);

reset role;
select test_support.clear_jwt_claims();
set local role postgres;

update public.expo_push_dispatch_wakeups
set
  enabled = true,
  min_interval_seconds = 2,
  last_requested_at = null,
  last_attempted_at = null,
  last_reason = null,
  last_skip_reason = null,
  last_error = null,
  total_attempts = 0,
  total_scheduled = 0,
  total_debounced = 0
where id = true;

create temp table if not exists suite10_notification_ids (
  event_id uuid,
  recipient_id uuid
) on commit drop;

insert into suite10_notification_ids (event_id)
values (
  public.create_notification_event_with_recipients(
    'system',
    'system_event',
    gen_random_uuid(),
    null,
    jsonb_build_object('title', 'Wakeup trigger test', 'message', 'queue should request immediate shadow wakeup'),
    jsonb_build_array(
      jsonb_build_object(
        'recipient_user_id', test_support.fixture_user_id('member_a'),
        'deliver_in_app', true,
        'deliver_sound', false
      )
    )
  )
);

update suite10_notification_ids n
set recipient_id = nr.id
from public.notification_recipients nr
where nr.event_id = n.event_id;

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.expo_push_notification_jobs j
    where j.notification_recipient_id = (select recipient_id from suite10_notification_ids limit 1)
  ),
  1,
  'trigger integration setup should enqueue one expo push job for one subscription'
);

select test_support.assert_true(
  (
    select total_attempts >= 1
    from public.expo_push_dispatch_wakeups
    where id = true
  ),
  'notification recipient trigger should attempt an immediate wakeup after queueing expo push jobs'
);

select test_support.assert_eq_text(
  (
    select last_reason
    from public.expo_push_dispatch_wakeups
    where id = true
  ),
  'notification_recipient_insert',
  'trigger wakeup should record the enqueue reason'
);

reset role;
select test_support.clear_jwt_claims();

rollback;
