begin;

select test_support.note('suite 08: web push dispatch jobs queue + claim/complete RPCs');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists web_push_dispatch_test_rows (
  key text primary key,
  event_id uuid,
  recipient_id uuid,
  endpoint text,
  subscription_id uuid,
  job_id uuid
) on commit drop;
grant all on web_push_dispatch_test_rows to public;

-- Seed device subscriptions for two users via owner-scoped RPCs.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

insert into web_push_dispatch_test_rows (key, endpoint)
values
  ('member_a_device_1', 'https://push.example.test/dispatch/member-a/device-1'),
  ('member_a_device_2', 'https://push.example.test/dispatch/member-a/device-2')
on conflict (key) do update
set endpoint = excluded.endpoint;

update web_push_dispatch_test_rows t
set subscription_id = rpc.id
from public.upsert_my_web_push_subscription(
  (select endpoint from web_push_dispatch_test_rows where key = 'member_a_device_1'),
  'p256dh-a1',
  'auth-a1',
  null,
  'test-agent/member-a-1',
  'android',
  'standalone',
  '{"suite":"08","device":"a1"}'::jsonb
) rpc
where t.key = 'member_a_device_1';

update web_push_dispatch_test_rows t
set subscription_id = rpc.id
from public.upsert_my_web_push_subscription(
  (select endpoint from web_push_dispatch_test_rows where key = 'member_a_device_2'),
  'p256dh-a2',
  'auth-a2',
  null,
  'test-agent/member-a-2',
  'android',
  'browser',
  '{"suite":"08","device":"a2"}'::jsonb
) rpc
where t.key = 'member_a_device_2';

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

insert into web_push_dispatch_test_rows (key, endpoint)
values ('member_b_device_1', 'https://push.example.test/dispatch/member-b/device-1')
on conflict (key) do update
set endpoint = excluded.endpoint;

update web_push_dispatch_test_rows t
set subscription_id = rpc.id
from public.upsert_my_web_push_subscription(
  (select endpoint from web_push_dispatch_test_rows where key = 'member_b_device_1'),
  'p256dh-b1',
  'auth-b1',
  null,
  'test-agent/member-b-1',
  'ios',
  'standalone',
  '{"suite":"08","device":"b1"}'::jsonb
) rpc
where t.key = 'member_b_device_1';

reset role;
select test_support.clear_jwt_claims();

-- Disable friend-request push for member_a to prove queueing honors push prefs
-- independently from in-app/sound delivery flags.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select public.update_my_notification_preferences(
  true, true,
  true, true,
  true, true,
  false, true, true
);

reset role;
select test_support.clear_jwt_claims();

-- Emit notifications after subscriptions exist so the trigger can enqueue push jobs.
insert into web_push_dispatch_test_rows (key, event_id)
values
  (
    'event_member_a_pushable',
    public.create_notification_event_with_recipients(
      'system',
      'system_event',
      gen_random_uuid(),
      null,
      jsonb_build_object('title', 'Pushable A', 'message', 'member_a should queue 2 jobs'),
      jsonb_build_array(
        jsonb_build_object(
          'recipient_user_id', test_support.fixture_user_id('member_a'),
          'deliver_in_app', true,
          'deliver_sound', false
        )
      )
    )
  ),
  (
    'event_member_a_suppressed',
    public.create_notification_event_with_recipients(
      'system',
      'system_event',
      gen_random_uuid(),
      null,
      jsonb_build_object('title', 'Push-only A', 'message', 'push-only should still queue'),
      jsonb_build_array(
        jsonb_build_object(
          'recipient_user_id', test_support.fixture_user_id('member_a'),
          'deliver_in_app', false,
          'deliver_sound', false
        )
      )
    )
  ),
  (
    'event_member_b_pushable',
    public.create_notification_event_with_recipients(
      'system',
      'system_event',
      gen_random_uuid(),
      null,
      jsonb_build_object('title', 'Pushable B', 'message', 'member_b should queue 1 job'),
      jsonb_build_array(
        jsonb_build_object(
          'recipient_user_id', test_support.fixture_user_id('member_b'),
          'deliver_in_app', true,
          'deliver_sound', true
        )
      )
    )
  ),
  (
    'event_member_a_friend_request_push_disabled',
    public.create_notification_event_with_recipients(
      'friend_request_received',
      'friend_request',
      gen_random_uuid(),
      test_support.fixture_user_id('member_b'),
      jsonb_build_object('title', 'Friend request', 'message', 'push pref disabled should suppress queue'),
      jsonb_build_array(
        jsonb_build_object(
          'recipient_user_id', test_support.fixture_user_id('member_a'),
          'deliver_in_app', true,
          'deliver_sound', true
        )
      )
    )
  )
on conflict (key) do update set event_id = excluded.event_id;

update web_push_dispatch_test_rows t
set recipient_id = nr.id
from public.notification_recipients nr
where nr.event_id = t.event_id
  and t.key like 'event_%';

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs j
    where j.notification_recipient_id = (
      select recipient_id from web_push_dispatch_test_rows where key = 'event_member_a_pushable'
    )
  ),
  2,
  'member_a pushable notification should fan out to both member_a subscriptions'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs j
    where j.notification_recipient_id = (
      select recipient_id from web_push_dispatch_test_rows where key = 'event_member_a_suppressed'
    )
  ),
  2,
  'push-only notifications should enqueue web push jobs when push delivery is enabled for that kind'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs j
    where j.notification_recipient_id = (
      select recipient_id from web_push_dispatch_test_rows where key = 'event_member_b_pushable'
    )
  ),
  1,
  'member_b pushable notification should fan out to one subscription'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs j
    where j.notification_recipient_id = (
      select recipient_id
      from web_push_dispatch_test_rows
      where key = 'event_member_a_friend_request_push_disabled'
    )
  ),
  0,
  'friend request push-disabled preference should suppress web push job enqueue even when in-app/sound are enabled'
);

create temp table if not exists web_push_backfill_attempt on commit drop as
select *
from public.enqueue_web_push_notification_jobs_for_recipients(
  array[(select recipient_id from web_push_dispatch_test_rows where key = 'event_member_a_pushable')],
  'test_backfill'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from web_push_backfill_attempt where queued = true),
  0,
  'backfill enqueue helper should not duplicate existing recipient/subscription jobs'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs j
    where j.notification_recipient_id = (
      select recipient_id from web_push_dispatch_test_rows where key = 'event_member_a_pushable'
    )
  ),
  2,
  'dedupe should preserve two jobs after manual backfill enqueue attempt'
);

create temp table if not exists peeked_web_push_jobs on commit drop as
select * from public.peek_web_push_notification_jobs(3);

select test_support.assert_eq_int(
  (select count(*)::bigint from peeked_web_push_jobs),
  3,
  'peek_web_push_notification_jobs should return available jobs without mutating queue state'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs
    where status = 'processing'
  ),
  0,
  'peek_web_push_notification_jobs should not transition jobs into processing'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs
    where status = 'pending'
  ),
  5,
  'peek_web_push_notification_jobs should leave pending counts unchanged'
);

create temp table if not exists claimed_web_push_jobs on commit drop as
select * from public.claim_web_push_notification_jobs(10, 60);

select test_support.assert_eq_int(
  (select count(*)::bigint from claimed_web_push_jobs),
  5,
  'claim_web_push_notification_jobs should claim all queued push jobs'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs j
    where j.status = 'processing'
  ),
  5,
  'claimed jobs should transition to processing'
);

select test_support.assert_true(
  (select min(attempts) >= 1 from claimed_web_push_jobs),
  'claimed jobs should increment attempts'
);

select test_support.assert_true(
  (select coalesce(bool_and(recipient_deliver_push), false) from claimed_web_push_jobs),
  'claimed jobs should surface recipient_deliver_push=true when push delivery is currently enabled'
);

update web_push_dispatch_test_rows t
set job_id = c.job_id
from (
  select row_number() over (order by job_id) as rn, job_id
  from claimed_web_push_jobs
) c
where (t.key = 'claimed_job_1' and c.rn = 1)
   or (t.key = 'claimed_job_2' and c.rn = 2)
   or (t.key = 'claimed_job_3' and c.rn = 3);

-- Seed keys for claimed jobs if first run.
insert into web_push_dispatch_test_rows (key)
values ('claimed_job_1'), ('claimed_job_2'), ('claimed_job_3')
on conflict (key) do nothing;

update web_push_dispatch_test_rows t
set job_id = c.job_id
from (
  select row_number() over (order by job_id) as rn, job_id
  from claimed_web_push_jobs
) c
where (t.key = 'claimed_job_1' and c.rn = 1)
   or (t.key = 'claimed_job_2' and c.rn = 2)
   or (t.key = 'claimed_job_3' and c.rn = 3);

select public.complete_web_push_notification_job(
  (select job_id from web_push_dispatch_test_rows where key = 'claimed_job_1'),
  'done',
  null,
  60,
  201
);

select public.complete_web_push_notification_job(
  (select job_id from web_push_dispatch_test_rows where key = 'claimed_job_2'),
  'skipped',
  'Recipient already active in foreground',
  60,
  null
);

select public.complete_web_push_notification_job(
  (select job_id from web_push_dispatch_test_rows where key = 'claimed_job_3'),
  'retryable_failed',
  'Temporary upstream push provider failure',
  10,
  503
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.web_push_notification_jobs where status = 'done'),
  1,
  'one claimed job should be marked done'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.web_push_notification_jobs where status = 'skipped'),
  1,
  'one claimed job should be marked skipped'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.web_push_notification_jobs where status = 'retryable_failed'),
  1,
  'one claimed job should be marked retryable_failed'
);

update public.web_push_notification_jobs
set available_at = timezone('utc', now()) - interval '1 second'
where id = (select job_id from web_push_dispatch_test_rows where key = 'claimed_job_3');

create temp table if not exists claimed_retry_job on commit drop as
select * from public.claim_web_push_notification_jobs(10, 60);

select test_support.assert_eq_int(
  (select count(*)::bigint from claimed_retry_job),
  1,
  'retryable_failed job should be claimable again after available_at passes'
);

select test_support.assert_eq_int(
  (select attempts::bigint from claimed_retry_job limit 1),
  2,
  're-claimed retryable_failed job should increment attempts again'
);

select public.complete_web_push_notification_job(
  (select job_id from claimed_retry_job limit 1),
  'dead_letter',
  'Permanent failure after retries',
  60,
  410
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.web_push_notification_jobs where status = 'dead_letter'),
  1,
  'dead_letter outcome should be persisted'
);

-- Hybrid send-time recheck: DM mute changes after queueing should be honored before send.
create temp table if not exists web_push_dm_race_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant all on web_push_dm_race_ids to public;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select public.update_my_notification_preferences(
  true, true,
  true, true,
  true, true,
  false, true, true
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
select public.send_friend_request(test_support.fixture_username('member_b'));

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select public.accept_friend_request(
  (select fr.id
   from public.friend_requests fr
   where fr.sender_user_id = test_support.fixture_user_id('member_a')
     and fr.recipient_user_id = test_support.fixture_user_id('member_b')
     and fr.status = 'pending'
   limit 1)
);

create temp table tmp_web_push_dm_race_conversation on commit drop as
select public.get_or_create_direct_dm_conversation(test_support.fixture_user_id('member_a')) as conversation_id;

insert into web_push_dm_race_ids (key, id)
select 'conversation', conversation_id from tmp_web_push_dm_race_conversation
on conflict (key) do update set id = excluded.id;

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_web_push_dm_race_message on commit drop as
select * from public.send_dm_message(
  (select id from web_push_dm_race_ids where key = 'conversation'),
  'hybrid send-time recheck race test',
  '{}'::jsonb
);

insert into web_push_dm_race_ids (key, id)
select 'message', message_id from tmp_web_push_dm_race_message
on conflict (key) do update set id = excluded.id;

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_true(
  public.set_dm_conversation_muted((select id from web_push_dm_race_ids where key = 'conversation'), true),
  'recipient can mute DM conversation after push job was queued'
);

reset role;
select test_support.clear_jwt_claims();

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_notification_jobs
    where status in ('pending', 'retryable_failed')
  ),
  1,
  'DM mute race setup should create exactly one pending web push job'
);

create temp table if not exists claimed_dm_mute_race_jobs on commit drop as
select * from public.claim_web_push_notification_jobs(10, 60);

select test_support.assert_eq_int(
  (select count(*)::bigint from claimed_dm_mute_race_jobs),
  1,
  'claim should pick the DM job created for mute-race send-time recheck test'
);

select test_support.assert_eq_text(
  (select kind::text from claimed_dm_mute_race_jobs limit 1),
  'dm_message',
  'mute-race claimed job should be a dm_message job'
);

select test_support.assert_true(
  (select coalesce(bool_and(recipient_deliver_push), false) from claimed_dm_mute_race_jobs),
  'claim-time global checks should still mark the DM job pushable before send-time recheck'
);

create temp table if not exists dm_send_time_recheck_rows on commit drop as
select * from public.recheck_web_push_notification_jobs_for_send(
  array(select job_id from claimed_dm_mute_race_jobs)
);

select test_support.assert_eq_int(
  (select count(*)::bigint from dm_send_time_recheck_rows),
  1,
  'send-time recheck should return one row for the claimed DM job'
);

select test_support.assert_false(
  (select should_deliver_push from dm_send_time_recheck_rows limit 1),
  'send-time recheck should suppress DM push after conversation is muted'
);

select test_support.assert_eq_text(
  (select reason from dm_send_time_recheck_rows limit 1),
  'dm_conversation_muted',
  'send-time recheck should explain DM mute suppression'
);

select public.complete_web_push_notification_job(
  (select job_id from claimed_dm_mute_race_jobs limit 1),
  'skipped',
  'DM conversation muted before send (hybrid send-time recheck test)',
  60,
  null
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.expect_exception(
  $$select * from public.claim_web_push_notification_jobs(5, 60)$$,
  'not authorized'
);

select test_support.expect_exception(
  $$select * from public.peek_web_push_notification_jobs(5)$$,
  'not authorized'
);

select test_support.expect_exception(
  format(
    $sql$select public.complete_web_push_notification_job(%L, %L, null, 60, null)$sql$,
    (select job_id from web_push_dispatch_test_rows where key = 'claimed_job_1'),
    'done'
  ),
  'not authorized'
);

select test_support.expect_exception(
  $$select * from public.enqueue_web_push_notification_jobs_for_recipients(null, 'unauthorized')$$,
  'not authorized'
);

select test_support.expect_exception(
  $$select * from public.recheck_web_push_notification_jobs_for_send(array[gen_random_uuid()])$$,
  'not authorized'
);

rollback;
