-- Friend requests, friend links, friendships, blocks, and who may ask.
begin;

-- staff_person keeps the closed defaults, for "Who may ask" below.
select test_support.take_friend_requests('owner', 'member_a', 'member_b', 'non_member', 'server_mod');
delete from public.notifications where true;
select test_support.clear_sent();

create function pg_temp.friends(p_a text, p_b text) returns boolean language sql as $$
  select private.are_friends(test_support.user_id(p_a), test_support.user_id(p_b));
$$;

-- ── Finding someone ─────────────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.assert_eq_text(
  (select f.id::text from public.find_user(' RLS_Member_B ') f), test_support.user_id('member_b')::text,
  'a person is found by their exact name, whatever the case');
select test_support.assert_query_count(
  $$ select 1 from public.find_user('rls_member') $$, 0, 'part of a name finds nobody');
select test_support.assert_query_count(
  $$ select 1 from public.find_user('rls_member_a') $$, 0, 'you do not find yourself');

-- ── Asking ──────────────────────────────────────────────────────────────────
create temp table asked as select * from public.send_friend_request(test_support.user_id('member_b'));
grant select on asked to public;
select test_support.assert_eq_int((select count(*) from asked), 1, 'asking returns the waiting request');
select test_support.expect_error(
  $$ select public.send_friend_request(test_support.user_id('member_b')) $$, 'request_already_sent');
select test_support.expect_error(
  $$ select public.send_friend_request(test_support.user_id('member_a')) $$, 'user_not_found');
select test_support.expect_error($$ select public.send_friend_request(gen_random_uuid()) $$, 'user_not_found');
select test_support.become(null);

select test_support.assert_eq_int(test_support.sent('member_a', 'friend_request.created'), 1, 'the sender''s devices hear it');
select test_support.assert_eq_int(test_support.sent('member_b', 'friend_request.created'), 1, 'the person asked hears it');
select test_support.assert_eq_int(test_support.sent('owner', 'friend_request.created'), 0, 'nobody else does');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'friend_request' and n.recipient_id = test_support.user_id('member_b')
       and n.actor_id = test_support.user_id('member_a') and n.body = 'rls_member_a sent you a friend request.' $$,
  1, 'and gets a notification that names the sender');

-- Who can see the request, and who can answer it.
select test_support.become('member_b');
select test_support.assert_query_count($$ select 1 from public.friend_requests $$, 1, 'the person asked sees it');
select test_support.become('owner');
select test_support.assert_query_count($$ select 1 from public.friend_requests $$, 0, 'a third person does not');
select test_support.expect_error(
  $$ select public.answer_friend_request((select id from asked), true) $$, 'request_not_found');
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.answer_friend_request((select id from asked), true) $$, 'not_your_request');
select test_support.expect_error(
  $$ insert into public.friendships (user_low_id, user_high_id)
     values (least(test_support.user_id('member_a'), test_support.user_id('owner')),
             greatest(test_support.user_id('member_a'), test_support.user_id('owner'))) $$, 'permission denied');

-- ── Accepting ───────────────────────────────────────────────────────────────
select test_support.become('member_b');
select public.answer_friend_request((select id from asked), true);
select test_support.become(null);
select test_support.assert_true(pg_temp.friends('member_a', 'member_b'), 'accepting makes them friends');
select test_support.assert_query_count($$ select 1 from public.friendships $$, 1, 'one row for the pair');
select test_support.assert_query_count($$ select 1 from public.friend_requests $$, 0, 'and the request is gone');
select test_support.assert_eq_int(test_support.sent('member_a', 'friendship.created'), 1, 'both hear the friendship');
select test_support.assert_eq_int(test_support.sent('member_b', 'friendship.created'), 1, 'both');
select test_support.assert_eq_int(test_support.sent('member_a', 'friend_request.deleted'), 1, 'and the request ending');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'friend_accepted' and n.recipient_id = test_support.user_id('member_a')
       and n.actor_id = test_support.user_id('member_b') $$, 1, 'the sender is told it was accepted');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n where n.kind = 'friend_request' and n.dismissed_at is null $$, 0,
  'the notice about the request is put away');
select test_support.assert_true(
  test_support.sent('member_b', 'notifications.changed') >= 1, 'and their other devices hear the inbox changed');

select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.send_friend_request(test_support.user_id('member_b')) $$, 'already_friends');
select test_support.assert_query_count($$ select 1 from public.friendships $$, 1, 'you see your friendships');
select test_support.become('owner');
select test_support.assert_query_count($$ select 1 from public.friendships $$, 0, 'not other people''s');
select test_support.become(null);

-- ── Ending a friendship ─────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_b');
select public.remove_friend(test_support.user_id('member_a'));
select test_support.become(null);
select test_support.assert_false(pg_temp.friends('member_a', 'member_b'), 'either one can end it');
select test_support.assert_eq_int(test_support.sent('member_a', 'friendship.deleted'), 1, 'and both hear');

-- ── Asking someone who already asked you ────────────────────────────────────
select test_support.become('member_a');
select public.send_friend_request(test_support.user_id('member_b'));
select test_support.become('member_b');
select test_support.assert_query_count(
  $$ select 1 from public.send_friend_request(test_support.user_id('member_a')) $$, 0,
  'asking back returns no request');
select test_support.become(null);
select test_support.assert_true(pg_temp.friends('member_a', 'member_b'), 'because it made them friends');

-- ── Declining and cancelling ────────────────────────────────────────────────
select test_support.become('member_a');
create temp table to_owner as select * from public.send_friend_request(test_support.user_id('owner'));
grant select on to_owner to public;
select test_support.become('owner');
select public.answer_friend_request((select id from to_owner), false);
select test_support.become(null);
select test_support.assert_false(pg_temp.friends('member_a', 'owner'), 'declining does not make friends');
select test_support.assert_query_count($$ select 1 from public.friend_requests $$, 0, 'and removes the request');

select test_support.become('member_a');
create temp table again as select * from public.send_friend_request(test_support.user_id('owner'));
grant select on again to public;
select test_support.assert_eq_int((select count(*) from again), 1, 'a declined person may ask again');
select public.answer_friend_request((select id from again), false);
select test_support.become(null);
select test_support.assert_query_count($$ select 1 from public.friend_requests $$, 0, 'the sender can take a request back');

-- ── Blocking ────────────────────────────────────────────────────────────────
select test_support.become('owner');
select public.send_friend_request(test_support.user_id('member_a'));
select test_support.become(null);
select test_support.clear_sent();

select test_support.become('member_a');
select public.block_user(test_support.user_id('member_b'));
select public.block_user(test_support.user_id('member_b')); -- twice is once
select public.block_user(test_support.user_id('owner'));
select test_support.expect_error($$ select public.block_user(test_support.user_id('member_a')) $$, 'user_not_found');
select test_support.assert_query_count($$ select 1 from public.blocks $$, 2, 'you see who you blocked');
select test_support.assert_query_count(
  $$ select 1 from public.find_user('rls_member_b') $$, 0, 'and no longer find them');
select test_support.become('member_b');
select test_support.assert_query_count($$ select 1 from public.blocks $$, 0, 'the blocked person cannot see the block');
select test_support.assert_query_count(
  $$ select 1 from public.find_user('rls_member_a') $$, 0, 'they cannot find you');
select test_support.expect_error(
  $$ select public.send_friend_request(test_support.user_id('member_a')) $$, 'user_not_found');
select test_support.become(null);
select test_support.assert_false(pg_temp.friends('member_a', 'member_b'), 'blocking ends the friendship');
select test_support.assert_query_count($$ select 1 from public.friend_requests $$, 0, 'and a waiting request, either way round');
select test_support.assert_eq_int(test_support.sent('member_a', 'block.created'), 2, 'the blocker''s devices hear the block');
select test_support.assert_eq_int(test_support.sent('member_b', 'block.created'), 0, 'the blocked person hears nothing about it');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.dismissed_at is null
       and test_support.user_id('member_a') in (n.recipient_id, n.actor_id)
       and (test_support.user_id('member_b') in (n.recipient_id, n.actor_id)
            or test_support.user_id('owner') in (n.recipient_id, n.actor_id)) $$, 0,
  'notices between the two are put away');

select test_support.become('member_a');
select public.unblock_user(test_support.user_id('member_b'));
select test_support.become('member_b');
select test_support.assert_query_count(
  $$ select 1 from public.find_user('rls_member_a') $$, 1, 'unblocking lets them find you again');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_a', 'block.deleted'), 1, 'the blocker hears the unblock');
select test_support.assert_false(pg_temp.friends('member_a', 'member_b'), 'but it does not bring the friendship back');

-- ── Who may ask ─────────────────────────────────────────────────────────────
-- Hearth has owner, member_a, member_b and server_mod. non_member and the
-- staff accounts share no community with anyone.
create temp table newcomer as select gen_random_uuid() as id;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ((select id from newcomer), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'newcomer@example.test', '{"username": "newcomer"}');
select test_support.assert_eq_text(
  (select s.details_visible_to || '|' || s.dms_from || '|' || s.friend_requests_from
   from public.user_settings s where s.user_id = (select id from newcomer)),
  'friends|friends|nobody', 'a new account starts closed');
select test_support.become('member_b');
select test_support.expect_error(
  $$ select public.send_friend_request(test_support.user_id('staff_person')) $$, 'requests_closed');

select test_support.become('server_mod');
select test_support.assert_eq_text(
  (public.update_my_settings(null, null, null, 'community')).friend_requests_from::text, 'community',
  'a person chooses who may ask');
select test_support.expect_error(
  $$ select public.update_my_settings(null, null, null, 'friends') $$, 'audience_invalid');
select test_support.become('member_b');
select test_support.assert_query_count(
  $$ select 1 from public.send_friend_request(test_support.user_id('server_mod')) $$, 1,
  '"community" lets in someone who shares one');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.send_friend_request(test_support.user_id('server_mod')) $$, 'requests_closed');

select test_support.become('staff_person');
select public.send_friend_request(test_support.user_id('non_member'));
select test_support.become('non_member');
select public.send_friend_request(test_support.user_id('staff_person'));
select test_support.become(null);
select test_support.assert_true(pg_temp.friends('non_member', 'staff_person'),
  'asking back accepts, whatever the rule of the person who asked first');
update public.user_settings s set dms_from = 'community' where s.user_id = test_support.user_id('non_member');
select test_support.assert_true(
  private.can_message(test_support.user_id('non_member'), test_support.user_id('staff_person')),
  '"community" includes friends who share no community');

-- ── Friend links ────────────────────────────────────────────────────────────
-- member_a still blocks owner from "Blocking".
delete from public.notifications where true;
select test_support.clear_sent();
select test_support.become('owner');
select test_support.expect_error($$ select public.create_friend_link(1, 0) $$, 'expiry_invalid');
select test_support.expect_error($$ select public.create_friend_link(1, 721) $$, 'expiry_invalid');
select test_support.expect_error($$ select public.create_friend_link(1, null) $$, 'expiry_invalid');
select test_support.expect_error($$ select public.create_friend_link(0) $$, 'max_uses_invalid');
create temp table link as select * from public.create_friend_link();
grant select on link to public;
select test_support.assert_true(
  (select l.max_uses = 1 and l.expires_at between now() + interval '167 hours' and now() + interval '169 hours' from link l),
  'a link is good for one use, for a week, unless asked otherwise');
select test_support.expect_error($$ select public.get_friend_link((select code from link)) $$, 'own_link');
select test_support.assert_query_count($$ select 1 from public.friend_links $$, 1, 'the owner sees their links');
select test_support.become('non_member');
select test_support.assert_query_count($$ select 1 from public.friend_links $$, 0, 'nobody else does');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('owner', 'friend_links.changed'), 1, 'the owner''s devices hear a new link');
select test_support.assert_eq_int(test_support.sent('non_member', 'friend_links.changed'), 0, 'nobody else hears about it');

select test_support.become('non_member');
select test_support.assert_eq_text(
  (select l.username || '|' || l.already_friends from public.get_friend_link(lower(' ' || (select code from link) || ' ')) l),
  'rls_owner|false', 'opening a link shows who it is from');
select test_support.become(null);
select test_support.assert_false(pg_temp.friends('non_member', 'owner'), 'opening it makes nobody friends');
select test_support.assert_query_count($$ select 1 from public.notifications $$, 0, 'and tells the owner nothing');

select test_support.become('non_member');
select public.answer_friend_link((select code from link), false);
select public.answer_friend_link((select code from link), false);
select test_support.become(null);
select test_support.assert_false(pg_temp.friends('non_member', 'owner'), 'declining makes nobody friends');
select test_support.assert_eq_int((select uses from public.friend_links), 0, 'and does not use the link');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.recipient_id = test_support.user_id('owner') and n.kind = 'friend_link'
       and n.actor_id is null and n.body = 'Someone declined your friend link.' $$, 1,
  'the owner is told someone declined, once, and not who');

select test_support.become('member_a');
select test_support.expect_error($$ select public.get_friend_link((select code from link)) $$, 'link_invalid');
select test_support.expect_error($$ select public.answer_friend_link((select code from link), true) $$, 'link_invalid');
select test_support.expect_error(
  $$ select * from private.friend_link_declines $$, 'permission denied');

select test_support.become('non_member');
select public.answer_friend_link((select code from link), true);
select test_support.become(null);
select test_support.assert_true(pg_temp.friends('non_member', 'owner'), 'accepting makes them friends');
select test_support.assert_eq_int((select uses from public.friend_links), 1, 'and uses the link');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.recipient_id = test_support.user_id('owner') and n.kind = 'friend_accepted'
       and n.actor_id = test_support.user_id('non_member')
       and n.body = 'rls_non_member accepted your friend link. You are now friends.' $$, 1,
  'the owner is told who accepted');
select test_support.become('server_mod');
select test_support.expect_error($$ select public.get_friend_link((select code from link)) $$, 'link_invalid');
select test_support.expect_error($$ select public.get_friend_link('NOSUCHCODE') $$, 'link_invalid');

select test_support.become('owner');
create temp table open_link as select * from public.create_friend_link(null, 1);
grant select on open_link to public;
select test_support.become('non_member');
select test_support.assert_true(
  (select l.already_friends from public.get_friend_link((select code from open_link)) l), 'a friend sees they already are');
select public.answer_friend_link((select code from open_link), true);
select test_support.become(null);
select test_support.assert_eq_int(
  (select l.uses from public.friend_links l where l.id = (select id from open_link)), 0,
  'and accepting again uses nothing');

update public.friend_links l set expires_at = now() - interval '1 minute' where true;
select test_support.become('server_mod');
select test_support.expect_error($$ select public.get_friend_link((select code from open_link)) $$, 'link_invalid');
select test_support.become(null);
select private.sweep();
select private.sweep();
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.recipient_id = test_support.user_id('owner') and n.kind = 'friend_link'
       and n.body = 'Your friend link expired.' $$, 1,
  'the owner is told once about a link that ran out unused, and not about one used up');
update public.friend_links l set expires_at = now() - interval '8 days' where l.id = (select id from link);
select private.sweep();
select test_support.assert_query_count($$ select 1 from public.friend_links $$, 1, 'a week after expiring, a link is dropped');

select test_support.become('owner');
create temp table spare as select * from public.create_friend_link();
grant select on spare to public;
select test_support.become('non_member');
select public.revoke_friend_link((select id from spare));
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.friend_links l where l.id = (select id from spare) $$, 1, 'only the owner can revoke a link');
select test_support.become('owner');
select public.revoke_friend_link((select id from spare));
select test_support.become('member_b');
select test_support.expect_error($$ select public.get_friend_link((select code from spare)) $$, 'link_invalid');
select test_support.become(null);

delete from private.rate_limit_hits where true;
insert into private.rate_limit_hits (user_id, action)
  select test_support.user_id('owner'), 'create_friend_link' from generate_series(1, 20)
  union all
  select test_support.user_id('member_b'), 'answer_friend_link' from generate_series(1, 20);
select test_support.become('owner');
select test_support.expect_error($$ select public.create_friend_link() $$, 'rate_limited');
select test_support.become('member_b');
select test_support.expect_error($$ select public.answer_friend_link('ANYCODE', false) $$, 'rate_limited');
select test_support.become(null);

-- ── Slow down ───────────────────────────────────────────────────────────────
delete from private.rate_limit_hits where true;
insert into private.rate_limit_hits (user_id, action)
  select test_support.user_id('member_b'), 'send_friend_request' from generate_series(1, 19);
select test_support.become('member_b');
select public.send_friend_request(test_support.user_id('non_member'));
select test_support.expect_error(
  $$ select public.send_friend_request(test_support.user_id('server_mod')) $$, 'rate_limited');
select test_support.become(null);

rollback;
