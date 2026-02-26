begin;

select test_support.note('suite 03: social graph RLS + RPCs');
select test_support.cleanup_fixture_domain_state();

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.expect_exception(
  format($sql$select public.send_friend_request(%L)$sql$, test_support.fixture_username('member_a')),
  'yourself'
);

select test_support.assert_not_null(
  public.send_friend_request(test_support.fixture_username('member_b')),
  'member_a -> member_b friend request should be created'
);

select test_support.assert_eq_int(
  (select count(*)::bigint from public.friend_requests where status = 'pending'),
  1,
  'one pending friend request should exist'
);

reset role;
select test_support.clear_jwt_claims();
select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'friend_request_received'
      and nr.recipient_user_id = test_support.fixture_user_id('member_b')
  ),
  1,
  'friend request send should emit recipient notification'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.expect_exception(
  format($sql$select public.send_friend_request(%L)$sql$, test_support.fixture_username('member_b')),
  'already pending'
);

select test_support.expect_exception(
  format(
    $sql$select public.accept_friend_request(%L)$sql$,
    (select fr.id from public.friend_requests fr
      where fr.sender_user_id = test_support.fixture_user_id('member_a')
        and fr.recipient_user_id = test_support.fixture_user_id('member_b')
        and fr.status = 'pending'
      limit 1)
  ),
  'recipient can accept'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_not_null(
  public.accept_friend_request(
    (select fr.id from public.friend_requests fr
      where fr.sender_user_id = test_support.fixture_user_id('member_a')
        and fr.recipient_user_id = test_support.fixture_user_id('member_b')
        and fr.status = 'pending'
      limit 1)
  ),
  'member_b should be able to accept inbound friend request'
);

select test_support.assert_true(
  public.are_friends(test_support.fixture_user_id('member_a'), test_support.fixture_user_id('member_b')),
  'friendship row should exist after accept'
);

reset role;
select test_support.clear_jwt_claims();
select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'friend_request_accepted'
      and nr.recipient_user_id = test_support.fixture_user_id('member_a')
  ),
  1,
  'friend request accept should emit accepted notification to sender'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_true(
  public.block_user_social(test_support.fixture_user_id('member_b')),
  'member_a should be able to block member_b'
);

select test_support.assert_false(
  public.are_friends(test_support.fixture_user_id('member_a'), test_support.fixture_user_id('member_b')),
  'blocking should remove friendship'
);

select test_support.assert_true(
  public.is_blocked_either_direction(test_support.fixture_user_id('member_a'), test_support.fixture_user_id('member_b')),
  'block relationship should exist'
);

select test_support.expect_exception(
  format($sql$select public.send_friend_request(%L)$sql$, test_support.fixture_username('member_b')),
  'not available'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

select public.send_friend_request(test_support.fixture_username('member_a'));

select test_support.assert_true(
  public.cancel_friend_request(
    (select fr.id from public.friend_requests fr
      where fr.sender_user_id = test_support.fixture_user_id('community_owner')
        and fr.recipient_user_id = test_support.fixture_user_id('member_a')
        and fr.status = 'pending'
      limit 1)
  ),
  'sender can cancel pending friend request'
);

select public.send_friend_request(test_support.fixture_username('server_mod'));

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('server_mod'));

select test_support.assert_true(
  public.decline_friend_request(
    (select fr.id from public.friend_requests fr
      where fr.sender_user_id = test_support.fixture_user_id('community_owner')
        and fr.recipient_user_id = test_support.fixture_user_id('server_mod')
        and fr.status = 'pending'
      limit 1)
  ),
  'recipient can decline pending friend request'
);

reset role;
select test_support.clear_jwt_claims();

select test_support.assert_true(
  exists(
    select 1
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'friend_request_received'
      and ne.source_kind = 'friend_request'
      and ne.source_id = (
        select fr.id
        from public.friend_requests fr
        where fr.sender_user_id = test_support.fixture_user_id('community_owner')
          and fr.recipient_user_id = test_support.fixture_user_id('server_mod')
          and fr.status = 'declined'
        order by fr.responded_at desc nulls last, fr.created_at desc
        limit 1
      )
      and nr.recipient_user_id = test_support.fixture_user_id('server_mod')
      and nr.dismissed_at is not null
  ),
  'declining a friend request should dismiss the incoming friend-request notification row'
);

-- Push-only friend request receive + accepted notifications should still create recipient rows.
reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
select public.update_my_notification_preferences(
  false, false,
  true, true,
  true, true,
  true, true, true
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));
select public.update_my_notification_preferences(
  false, false,
  true, true,
  true, true,
  true, true, true
);

select public.send_friend_request(test_support.fixture_username('member_a'));

reset role;
select test_support.clear_jwt_claims();

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'friend_request_received'
      and nr.recipient_user_id = test_support.fixture_user_id('member_a')
      and ne.source_id = (
        select fr.id
        from public.friend_requests fr
        where fr.sender_user_id = test_support.fixture_user_id('community_owner')
          and fr.recipient_user_id = test_support.fixture_user_id('member_a')
          and fr.status = 'pending'
        order by fr.created_at desc
        limit 1
      )
      and nr.deliver_in_app = false
      and nr.deliver_sound = false
  ),
  1,
  'push-only friend request prefs should create a received notification recipient row with in-app/sound flags false'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select public.accept_friend_request(
  (select fr.id
   from public.friend_requests fr
   where fr.sender_user_id = test_support.fixture_user_id('community_owner')
     and fr.recipient_user_id = test_support.fixture_user_id('member_a')
     and fr.status = 'pending'
   order by fr.created_at desc
   limit 1)
);

reset role;
select test_support.clear_jwt_claims();

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'friend_request_accepted'
      and nr.recipient_user_id = test_support.fixture_user_id('community_owner')
      and ne.source_id = (
        select fr.id
        from public.friend_requests fr
        where fr.sender_user_id = test_support.fixture_user_id('community_owner')
          and fr.recipient_user_id = test_support.fixture_user_id('member_a')
          and fr.status = 'accepted'
        order by fr.responded_at desc nulls last, fr.created_at desc
        limit 1
      )
      and nr.deliver_in_app = false
      and nr.deliver_sound = false
  ),
  1,
  'push-only friend request prefs should create an accepted notification recipient row with in-app/sound flags false'
);

rollback;

