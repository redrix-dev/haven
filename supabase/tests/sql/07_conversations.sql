-- Direct conversations, who may have one, unread marks and muting. A
-- conversation is a channel, so it uses the same send, list and read RPCs.
begin;

-- member_a and member_b become friends; owner is nobody's friend. Everyone
-- keeps the default dms_from, friends.
select test_support.take_friend_requests('member_b');
select test_support.become('member_a');
select public.send_friend_request(test_support.user_id('member_b'));
select test_support.become('member_b');
select public.send_friend_request(test_support.user_id('member_a')); -- asking back accepts
select test_support.become(null);
delete from public.notifications where true;

-- ── Opening ─────────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_a');
create temp table dm as select (public.open_dm(test_support.user_id('member_b'))).id as id;
grant select on dm to public;
select test_support.assert_eq_text(
  (public.open_dm(test_support.user_id('member_b'))).id::text, (select id::text from dm),
  'opening again returns the same conversation');
select test_support.expect_error(
  $$ select public.open_dm(test_support.user_id('owner')) $$, 'dms_closed');
select test_support.expect_error(
  $$ select public.open_dm(gen_random_uuid()) $$, 'user_not_found');
select test_support.become('member_b');
select test_support.assert_eq_text(
  (public.open_dm(test_support.user_id('member_a'))).id::text, (select id::text from dm),
  'two people have one conversation, whoever opens it');
select test_support.become(null);
select test_support.assert_query_count($$ select 1 from public.channels c where c.kind = 'dm' $$, 1, 'one row');
select test_support.assert_eq_int(test_support.sent('member_b', 'channel.created'), 1, 'the other person hears it open');

-- ── Who can see it ──────────────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.assert_query_count($$ select 1 from public.channels c where c.kind = 'dm' $$, 1, 'a participant sees it');
select test_support.assert_query_count(
  $$ select 1 from public.channel_participants p where p.channel_id = (select id from dm) $$, 2,
  'and both participants');
select test_support.become(null);
select test_support.assert_false(
  private.can_send_in_channel((select id from dm), test_support.user_id('owner')),
  'the rule for sending says no to someone outside the conversation');
select test_support.assert_true(
  private.can_send_in_channel((select id from dm), test_support.user_id('member_a')), 'and yes to someone in it');
select test_support.become('owner');
select test_support.assert_query_count($$ select 1 from public.channels c where c.kind = 'dm' $$, 0, 'nobody else does');
select test_support.assert_query_count($$ select 1 from public.channel_participants $$, 0, 'nor who is in it');
select test_support.expect_error(
  $$ select public.send_message((select id from dm), 'let me in') $$, 'channel_not_found');
select test_support.expect_error(
  $$ select * from public.list_messages((select id from dm)) $$, 'channel_not_found');
-- Staff are not participants either.
select test_support.become('staff_active');
select test_support.expect_error(
  $$ select * from public.list_messages((select id from dm)) $$, 'channel_not_found');
select test_support.become(null);

-- ── Talking ─────────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_a');
create temp table first_dm as select (public.send_message((select id from dm), 'hi b')).id as id;
grant select on first_dm to public;
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_b', 'message.created'), 1, 'the other person hears the message');
select test_support.assert_eq_int(test_support.sent('owner', 'message.created'), 0, 'nobody else does');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'direct_message' and n.recipient_id = test_support.user_id('member_b')
       and n.channel_id = (select id from dm) and n.title = 'rls_member_a' and n.body = 'hi b' $$, 1,
  'and gets a notification named after the sender');

select test_support.become('server_mod');
select public.send_message(test_support.channel_id('staff-room'), 'mods only');
select test_support.become('member_b');
select test_support.assert_eq_text(
  (select string_agg(r.body, ',') from public.list_messages((select id from dm)) r), 'hi b', 'they read it');
select test_support.expect_error(
  $$ select public.mark_channel_read(test_support.channel_id('staff-room'), gen_random_uuid()) $$, 'channel_not_found');
select test_support.expect_error(
  $$ select public.mute_channel(test_support.channel_id('staff-room'), 'infinity') $$, 'channel_not_found');
select test_support.assert_eq_text(
  (select string_agg(r.body, ',') from public.get_latest_messages(array[(select id from dm), test_support.channel_id('staff-room')]) r),
  'hi b', 'latest message per conversation; a channel they cannot see is skipped');
select test_support.become(null);

-- ── Unread ──────────────────────────────────────────────────────────────────
select test_support.become('member_a');
select public.send_message((select id from dm), 'still there?');
select test_support.assert_query_count(
  $$ select 1 from public.get_unread_counts() u where u.channel_id = (select id from dm) $$, 0,
  'your own messages are never unread');
select test_support.become('member_b');
select test_support.assert_eq_int(
  (select u.unread from public.get_unread_counts() u where u.channel_id = (select id from dm)), 2,
  'two unread for the other person');
select test_support.clear_sent();
select public.mark_channel_read((select id from dm), (select id from first_dm));
select test_support.assert_eq_int(
  (select u.unread from public.get_unread_counts() u where u.channel_id = (select id from dm)), 1,
  'reading up to the first leaves one');
select test_support.assert_eq_int(test_support.sent('member_b', 'channel.read'), 1, 'their other devices hear the read mark');
select public.mark_channel_read((select id from dm), (select c.latest_message_id from public.channels c where c.id = (select id from dm)));
select public.mark_channel_read((select id from dm), (select id from first_dm)); -- cannot move back
select test_support.assert_query_count(
  $$ select 1 from public.get_unread_counts() u where u.channel_id = (select id from dm) $$, 0,
  'reading only moves forward');
select test_support.become(null);

-- ── Muting ──────────────────────────────────────────────────────────────────
delete from public.notifications where true;
select test_support.become('member_b');
select public.mute_channel((select id from dm), now() + interval '1 hour');
select test_support.become('member_a');
select public.send_message((select id from dm), 'muted?');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.notifications $$, 0, 'a muted conversation sends no notification');
select test_support.become('member_b');
select test_support.assert_eq_int(
  (select u.unread from public.get_unread_counts() u where u.channel_id = (select id from dm)), 1,
  'but the message is still there to read');
select public.mute_channel((select id from dm), null);
select test_support.become('member_a');
select public.send_message((select id from dm), 'unmuted');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.notifications $$, 1, 'unmuting brings notifications back');

-- ── An ended friendship stops sending, both ways ────────────────────────────
-- Both keep "friends", so neither rule lets the other in any more.
select test_support.become('member_b');
select public.remove_friend(test_support.user_id('member_a'));
select test_support.expect_error($$ select public.send_message((select id from dm), 'not friends now') $$, 'cannot_send');
select test_support.become('member_a');
select test_support.expect_error($$ select public.send_message((select id from dm), 'hello?') $$, 'cannot_send');
select test_support.assert_eq_int(
  (select count(*) from public.list_messages((select id from dm))), 4, 'what was said can still be read');
select test_support.assert_eq_text(
  (public.open_dm(test_support.user_id('member_b'))).id::text, (select id::text from dm),
  'and the conversation still opens, to read');
select test_support.become(null);

-- ── So does a block, on its own ─────────────────────────────────────────────
-- Blocking ends the friendship, so this state cannot be reached through the
-- RPCs. The check is tested anyway: if a friendship ever outlived a block,
-- messages must still not get through.
insert into public.friendships (user_low_id, user_high_id)
values (least(test_support.user_id('member_a'), test_support.user_id('member_b')),
        greatest(test_support.user_id('member_a'), test_support.user_id('member_b')));
insert into public.blocks (blocker_id, blocked_id)
values (test_support.user_id('member_b'), test_support.user_id('member_a'));
select test_support.become('member_a');
select test_support.expect_error($$ select public.send_message((select id from dm), 'blocked?') $$, 'cannot_send');
select test_support.expect_error($$ select public.open_dm(test_support.user_id('member_b')) $$, 'user_not_found');
select test_support.become('member_b');
select test_support.expect_error($$ select public.send_message((select id from dm), 'I blocked you') $$, 'cannot_send');
select test_support.become(null);

-- ── Who may start one, and who may answer ───────────────────────────────────
-- owner and member_a share Hearth and are not friends; non_member shares
-- nothing with anyone.
select test_support.become('owner');
select public.update_my_settings(null, null, 'community');
select test_support.expect_error(
  $$ select public.open_dm(test_support.user_id('member_a')) $$, 'dms_closed');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.open_dm(test_support.user_id('owner')) $$, 'dms_closed');
select test_support.become('member_a');
create temp table to_owner as select (public.open_dm(test_support.user_id('owner'))).id as id;
grant select on to_owner to public;
select public.send_message((select id from to_owner), 'we share Hearth');
select test_support.become('owner');
select test_support.expect_error(
  $$ select public.open_dm(test_support.user_id('non_member')) $$, 'dms_closed');
select public.send_message((select id from to_owner), 'so we do');
select test_support.become('member_a');
select public.update_my_settings(null, null, 'nobody');
select public.send_message((select id from to_owner), 'my rule is closed, theirs lets me in');
select test_support.become('owner');
select public.send_message((select id from to_owner), 'and I can answer you, since mine lets you in');
select public.update_my_settings(null, null, 'friends');
select test_support.expect_error(
  $$ select public.send_message((select id from to_owner), 'closed?') $$, 'cannot_send');
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.send_message((select id from to_owner), 'closed for me too') $$, 'cannot_send');
select test_support.become(null);
select test_support.assert_eq_int(
  (select count(*)::int from public.messages m where m.channel_id = (select id from to_owner)), 4,
  'once neither rule lets the other in, it closes for both, from the next message');

rollback;
