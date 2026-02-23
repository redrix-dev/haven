begin;

select test_support.note('suite 02: notification foundation RLS + RPCs');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists notification_test_rows (
  key text primary key,
  event_id uuid,
  recipient_id uuid
) on commit drop;
grant all on notification_test_rows to public;

insert into notification_test_rows (key, event_id)
values (
  'event_member_a',
  public.create_notification_event_with_recipients(
    'system',
    'system_event',
    gen_random_uuid(),
    test_support.fixture_user_id('community_owner'),
    jsonb_build_object('title', 'System A', 'message', 'System notification for member_a'),
    jsonb_build_array(
      jsonb_build_object(
        'recipient_user_id', test_support.fixture_user_id('member_a'),
        'deliver_in_app', true,
        'deliver_sound', false
      )
    )
  )
), (
  'event_member_b',
  public.create_notification_event_with_recipients(
    'system',
    'system_event',
    gen_random_uuid(),
    test_support.fixture_user_id('community_owner'),
    jsonb_build_object('title', 'System B', 'message', 'System notification for member_b'),
    jsonb_build_array(
      jsonb_build_object(
        'recipient_user_id', test_support.fixture_user_id('member_b'),
        'deliver_in_app', true,
        'deliver_sound', true
      )
    )
  )
)
on conflict (key) do update set event_id = excluded.event_id;

update notification_test_rows n
set recipient_id = nr.id
from public.notification_recipients nr
where nr.event_id = n.event_id;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (select count(*)::bigint from public.notification_recipients),
  1,
  'member_a should only see own notification_recipients rows'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.notification_events),
  1,
  'member_a should only see notification_events reachable via recipient rows'
);

select test_support.assert_eq_int(
  public.mark_notifications_read(
    array[(select recipient_id from notification_test_rows where key = 'event_member_b')]
  )::bigint,
  0,
  'member_a cannot mark member_b notification read'
);

select test_support.assert_eq_int(
  public.mark_notifications_seen(
    array[(select recipient_id from notification_test_rows where key = 'event_member_a')]
  )::bigint,
  1,
  'member_a can mark own notification seen'
);

select test_support.assert_eq_int(
  (select unseen_count::bigint from public.get_my_notification_counts()),
  0,
  'member_a unseen count should update after mark seen'
);

reset role;
select test_support.clear_jwt_claims();

insert into notification_test_rows (key, event_id)
values (
  'event_member_a_2',
  public.create_notification_event_with_recipients(
    'system',
    'system_event',
    gen_random_uuid(),
    null,
    jsonb_build_object('title', 'System A2', 'message', 'Older/newer order test'),
    jsonb_build_array(
      jsonb_build_object(
        'recipient_user_id', test_support.fixture_user_id('member_a'),
        'deliver_in_app', true,
        'deliver_sound', false
      )
    )
  )
)
on conflict (key) do update set event_id = excluded.event_id;

update notification_test_rows n
set recipient_id = nr.id
from public.notification_recipients nr
where nr.event_id = n.event_id
  and n.key = 'event_member_a_2';

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table if not exists notification_page on commit drop as
select * from public.list_my_notifications(1, null, null);

select test_support.assert_eq_int(
  (select count(*)::bigint from notification_page),
  1,
  'list_my_notifications(limit=1) should return exactly one row'
);

select test_support.assert_not_null(
  (select recipient_id from notification_page limit 1),
  'first notification page recipient id should exist'
);

create temp table if not exists notification_page_2 on commit drop as
select *
from public.list_my_notifications(
  10,
  (select created_at from notification_page limit 1),
  (select recipient_id from notification_page limit 1)
);

select test_support.assert_true(
  (select count(*)::bigint from notification_page_2) >= 1,
  'second notification page should return remaining rows'
);

select public.update_my_notification_preferences(
  false, false,
  true, true,
  true, false
);

select test_support.assert_false(
  (select friend_request_in_app_enabled from public.get_my_notification_preferences() limit 1),
  'member_a preference update should persist'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

update public.user_notification_preferences
set mention_sound_enabled = true
where user_id = test_support.fixture_user_id('member_a');

reset role;
select test_support.clear_jwt_claims();
select test_support.assert_false(
  (
    select up.mention_sound_enabled
    from public.user_notification_preferences up
    where up.user_id = test_support.fixture_user_id('member_a')
    limit 1
  ),
  'member_b should not be able to mutate member_a notification preferences'
);

rollback;
