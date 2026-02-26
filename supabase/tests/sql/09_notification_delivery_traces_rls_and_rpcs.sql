begin;

select test_support.note('suite 09: notification delivery traces RLS + RPCs');
select test_support.cleanup_fixture_domain_state();

set local role postgres;

insert into public.notification_delivery_traces (
  recipient_user_id,
  transport,
  stage,
  decision,
  reason_code,
  details
)
values
  (
    test_support.fixture_user_id('member_a'),
    'web_push',
    'send_time',
    'skip',
    'sw_focused_window_suppressed',
    '{"source":"sql-test","case":"member_a"}'::jsonb
  ),
  (
    test_support.fixture_user_id('member_b'),
    'web_push',
    'send_time',
    'send',
    'sent',
    '{"source":"sql-test","case":"member_b"}'::jsonb
  );

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (select count(*)::bigint from public.list_my_notification_delivery_traces(50, null)),
  1,
  'member_a should only see their own delivery traces'
);

select test_support.assert_eq_text(
  (
    select reason_code
    from public.list_my_notification_delivery_traces(50, null)
    limit 1
  ),
  'sw_focused_window_suppressed',
  'trace RPC should return stored reason code'
);

select test_support.assert_eq_text(
  (
    select details->>'case'
    from public.list_my_notification_delivery_traces(50, null)
    limit 1
  ),
  'member_a',
  'trace RPC should return stored details json'
);

reset role;
select test_support.clear_jwt_claims();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (select count(*)::bigint from public.list_my_notification_delivery_traces(50, null)),
  1,
  'member_b should only see their own delivery traces'
);

reset role;
select test_support.clear_jwt_claims();

rollback;
