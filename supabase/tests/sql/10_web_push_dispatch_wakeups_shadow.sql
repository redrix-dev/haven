begin;

select test_support.note('suite 10: web push immediate wakeup scheduler (shadow-mode debounce)');
select test_support.cleanup_fixture_domain_state();

set local role postgres;

-- Reset singleton state for deterministic assertions.
delete from public.background_worker_cron_config where id = true;

insert into public.notification_dispatch_wakeups (
  id,
  enabled,
  shadow_mode,
  min_interval_seconds,
  last_attempted_at,
  last_requested_at,
  last_request_id,
  last_mode,
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
  true,
  2,
  null,
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
  shadow_mode = excluded.shadow_mode,
  min_interval_seconds = excluded.min_interval_seconds,
  last_attempted_at = excluded.last_attempted_at,
  last_requested_at = excluded.last_requested_at,
  last_request_id = excluded.last_request_id,
  last_mode = excluded.last_mode,
  last_reason = excluded.last_reason,
  last_skip_reason = excluded.last_skip_reason,
  last_error = excluded.last_error,
  total_attempts = excluded.total_attempts,
  total_scheduled = excluded.total_scheduled,
  total_debounced = excluded.total_debounced,
  updated_at = timezone('utc', now());

create temp table if not exists wakeup_attempt_result on commit drop as
select * from public.request_web_push_dispatch_wakeup('suite10_no_config', null);

select test_support.assert_false(
  (select scheduled from wakeup_attempt_result limit 1),
  'wakeup helper should not schedule when cron config is unavailable'
);

select test_support.assert_eq_text(
  (select wake_mode from wakeup_attempt_result limit 1),
  'shadow',
  'wakeup helper should default to shadow mode before cutover'
);

select test_support.assert_eq_text(
  (select skipped_reason from wakeup_attempt_result limit 1),
  'cron_config_unavailable',
  'missing cron config should be reported explicitly'
);

update public.notification_dispatch_wakeups
set
  enabled = true,
  shadow_mode = true,
  min_interval_seconds = 5,
  last_requested_at = timezone('utc', now()),
  last_skip_reason = null,
  last_error = null
where id = true;

create temp table if not exists wakeup_debounced_result on commit drop as
select * from public.request_web_push_dispatch_wakeup('suite10_debounce', null);

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
    from public.notification_dispatch_wakeups
    where id = true
  ),
  'wakeup state should track debounced attempts'
);

-- Trigger integration: enqueueing a push-eligible notification should attempt a wakeup.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select public.upsert_my_web_push_subscription(
  'https://push.example.test/dispatch-wakeup/member-a/device-1',
  'p256dh-suite10',
  'auth-suite10',
  null,
  'test-agent/suite10',
  'windows',
  'standalone',
  '{"suite":"10"}'::jsonb,
  'suite10-installation'
);

reset role;
select test_support.clear_jwt_claims();
set local role postgres;

update public.notification_dispatch_wakeups
set
  enabled = true,
  shadow_mode = true,
  min_interval_seconds = 2,
  last_requested_at = null,
  last_attempted_at = null,
  last_mode = null,
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
    from public.web_push_notification_jobs j
    where j.notification_recipient_id = (select recipient_id from suite10_notification_ids limit 1)
  ),
  1,
  'trigger integration setup should enqueue one web push job for one subscription'
);

select test_support.assert_true(
  (
    select total_attempts >= 1
    from public.notification_dispatch_wakeups
    where id = true
  ),
  'notification recipient trigger should attempt an immediate wakeup after queueing web push jobs'
);

select test_support.assert_eq_text(
  (
    select last_reason
    from public.notification_dispatch_wakeups
    where id = true
  ),
  'notification_recipient_insert',
  'trigger wakeup should record the enqueue reason'
);

select test_support.assert_eq_text(
  (
    select last_mode
    from public.notification_dispatch_wakeups
    where id = true
  ),
  'shadow',
  'trigger wakeup should default to shadow mode before cutover'
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table if not exists wakeup_diag_rpc_rows on commit drop as
select * from public.get_web_push_dispatch_wakeup_diagnostics();

select test_support.assert_eq_int(
  (select count(*)::bigint from wakeup_diag_rpc_rows),
  1,
  'wakeup diagnostics RPC should return the singleton row to authenticated clients'
);

select test_support.assert_eq_text(
  (select last_reason from wakeup_diag_rpc_rows limit 1),
  'notification_recipient_insert',
  'wakeup diagnostics RPC should expose the latest enqueue-triggered reason'
);

select test_support.assert_eq_text(
  (select last_mode from wakeup_diag_rpc_rows limit 1),
  'shadow',
  'wakeup diagnostics RPC should expose the current default wake mode'
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.expect_exception(
  $$select * from public.update_web_push_dispatch_wakeup_config(false, false, 1)$$,
  'only active platform staff'
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

create temp table if not exists wakeup_config_update_rows on commit drop as
select * from public.update_web_push_dispatch_wakeup_config(false, false, 1);

select test_support.assert_eq_int(
  (select count(*)::bigint from wakeup_config_update_rows),
  1,
  'platform staff should be able to update wakeup scheduler config'
);

select test_support.assert_false(
  (select enabled from wakeup_config_update_rows limit 1),
  'wakeup scheduler config RPC should update enabled flag'
);

select test_support.assert_false(
  (select shadow_mode from wakeup_config_update_rows limit 1),
  'wakeup scheduler config RPC should update shadow_mode flag'
);

select test_support.assert_eq_int(
  (select min_interval_seconds::bigint from wakeup_config_update_rows limit 1),
  1,
  'wakeup scheduler config RPC should clamp/apply min interval'
);

reset role;
select test_support.clear_jwt_claims();

rollback;
