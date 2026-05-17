begin;

select test_support.note('suite 07: web push subscriptions RLS + RPCs');
select test_support.cleanup_fixture_domain_state();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (select count(*)::bigint from public.list_my_web_push_subscriptions()),
  0,
  'member_a should start with no web push subscriptions'
);

create temp table if not exists push_sub_test_rows (
  key text primary key,
  endpoint text not null,
  subscription_id uuid
) on commit drop;
grant all on push_sub_test_rows to public;

insert into push_sub_test_rows (key, endpoint)
values ('member_a_device_1', 'https://push.example.test/member-a/device-1')
on conflict (key) do update
set endpoint = excluded.endpoint;

update push_sub_test_rows t
set subscription_id = rpc.id
from public.upsert_my_web_push_subscription(
  (select endpoint from push_sub_test_rows where key = 'member_a_device_1'),
  'p256dh-member-a-1',
  'auth-member-a-1',
  null,
  'test-agent/member-a',
  'android',
  'standalone',
  '{"build":"test","device":"a1"}'::jsonb,
  'member-a-installation-1'
) rpc
where t.key = 'member_a_device_1';

select test_support.assert_not_null(
  (select subscription_id from push_sub_test_rows where key = 'member_a_device_1'),
  'member_a upsert should return a subscription id'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.web_push_subscriptions),
  1,
  'member_a should see exactly one web push subscription row'
);

select test_support.assert_eq_text(
  (
    select client_platform
    from public.list_my_web_push_subscriptions()
    where endpoint = (select endpoint from push_sub_test_rows where key = 'member_a_device_1')
    limit 1
  ),
  'android',
  'list RPC should return stored client platform'
);

select test_support.assert_eq_text(
  (
    select installation_id
    from public.list_my_web_push_subscriptions()
    where endpoint = (select endpoint from push_sub_test_rows where key = 'member_a_device_1')
    limit 1
  ),
  'member-a-installation-1',
  'list RPC should return stored installation identity'
);

select test_support.assert_eq_text(
  (
    select metadata->>'device'
    from public.list_my_web_push_subscriptions()
    where endpoint = (select endpoint from push_sub_test_rows where key = 'member_a_device_1')
    limit 1
  ),
  'a1',
  'list RPC should return stored metadata'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.upsert_my_web_push_subscription(
      (select endpoint from push_sub_test_rows where key = 'member_a_device_1'),
      'p256dh-member-a-1-updated',
      'auth-member-a-1-updated',
      null,
      'test-agent/member-a-v2',
      'android',
      'browser',
      '{"build":"test","device":"a1","rev":2}'::jsonb,
      'member-a-installation-1'
    )
  ),
  1,
  'upsert should return one row when updating an existing endpoint'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.web_push_subscriptions),
  1,
  'upsert should not duplicate rows for same endpoint'
);

select test_support.assert_eq_text(
  (
    select app_display_mode
    from public.list_my_web_push_subscriptions()
    where endpoint = (select endpoint from push_sub_test_rows where key = 'member_a_device_1')
    limit 1
  ),
  'browser',
  'upsert should update app display mode'
);

select test_support.assert_eq_text(
  (
    select p256dh_key
    from public.list_my_web_push_subscriptions()
    where endpoint = (select endpoint from push_sub_test_rows where key = 'member_a_device_1')
    limit 1
  ),
  'p256dh-member-a-1-updated',
  'upsert should update p256dh key'
);

insert into push_sub_test_rows (key, endpoint)
values ('member_a_device_1_rotated', 'https://push.example.test/member-a/device-1-rotated')
on conflict (key) do update
set endpoint = excluded.endpoint;

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.upsert_my_web_push_subscription(
      (select endpoint from push_sub_test_rows where key = 'member_a_device_1_rotated'),
      'p256dh-member-a-1-rotated',
      'auth-member-a-1-rotated',
      null,
      'test-agent/member-a-v3',
      'android',
      'standalone',
      '{"build":"test","device":"a1","rev":3}'::jsonb,
      'member-a-installation-1'
    )
  ),
  1,
  'upsert should allow endpoint rotation for same installation identity'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.web_push_subscriptions
    where user_id = test_support.fixture_user_id('member_a')
      and installation_id = 'member-a-installation-1'
  ),
  1,
  'only one active row should remain for a user+installation identity'
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (select count(*)::bigint from public.list_my_web_push_subscriptions()),
  0,
  'member_b should not see member_a web push subscriptions'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.web_push_subscriptions),
  0,
  'member_b direct table select should be filtered by RLS'
);

select test_support.assert_false(
  public.delete_my_web_push_subscription(
    (select endpoint from push_sub_test_rows where key = 'member_a_device_1')
  ),
  'member_b should not delete member_a endpoint'
);

insert into push_sub_test_rows (key, endpoint)
values ('member_b_device_1', 'https://push.example.test/member-b/device-1')
on conflict (key) do update
set endpoint = excluded.endpoint;

update push_sub_test_rows t
set subscription_id = rpc.id
from public.upsert_my_web_push_subscription(
  (select endpoint from push_sub_test_rows where key = 'member_b_device_1'),
  'p256dh-member-b-1',
  'auth-member-b-1',
  null,
  'test-agent/member-b',
  'ios',
  'standalone',
  '{"build":"test","device":"b1"}'::jsonb
) rpc
where t.key = 'member_b_device_1';

select test_support.assert_eq_int(
  (select count(*)::bigint from public.list_my_web_push_subscriptions()),
  1,
  'member_b should see only their own web push subscription'
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.expect_exception(
  $$select public.upsert_my_web_push_subscription(
    'https://push.example.test/unauth/device-1',
    'p256dh-unauth',
    'auth-unauth',
    null,
    null,
    null,
    null,
    '{}'::jsonb
  )$$,
  'not authenticated'
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (select count(*)::bigint from public.list_my_web_push_subscriptions()),
  1,
  'member_a row should still exist after member_b delete attempt'
);

select test_support.assert_true(
  public.delete_my_web_push_subscription(
    (select endpoint from push_sub_test_rows where key = 'member_a_device_1_rotated')
  ),
  'member_a should delete own endpoint'
);

select test_support.assert_false(
  public.delete_my_web_push_subscription(
    (select endpoint from push_sub_test_rows where key = 'member_a_device_1_rotated')
  ),
  'deleting missing endpoint should return false'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.list_my_web_push_subscriptions()),
  0,
  'member_a list should be empty after deleting own endpoint'
);

rollback;
