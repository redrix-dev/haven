-- Flair, the profile card, who hears a profile change, feature flags, and
-- one-time introductions.
begin;

select test_support.take_friend_requests('member_a');
delete from public.notifications where true;
delete from private.rate_limit_hits where true;

-- ── Flair ───────────────────────────────────────────────────────────────────
insert into public.flairs (key, label, description) values ('early_bird', 'Early bird', 'Here from the start');
insert into public.flairs (key, label) values ('club_member', 'Club');
create temp table flair as select f.key, f.id from public.flairs f where f.key in ('early_bird', 'club_member');
grant select on flair to public;
select private.grant_flair(test_support.user_id('member_a'), (select id from flair where key = 'early_bird'), 'staff');

-- "Joining this community grants this flair."
select test_support.become('non_member');
create temp table club as select * from public.create_community('Flair Club');
grant select on club to public;
create temp table club_invite as select * from public.create_invite((select id from club));
grant select on club_invite to public;
select test_support.become(null);
insert into public.flair_grant_rules (community_id, flair_id)
values ((select id from club), (select id from flair where key = 'club_member'));
select test_support.become('member_b');
select public.join_community((select code from club_invite));
select test_support.assert_eq_text(
  (select string_agg(f.key || ':' || uf.source, ',') from public.user_flairs uf join public.flairs f on f.id = uf.flair_id),
  'club_member:community_join', 'joining a community grants its flair; you read your own flairs');
select test_support.assert_query_count($$ select 1 from public.flairs $$, 2, 'anyone signed in reads what flairs exist');
select test_support.expect_error(
  $$ insert into public.user_flairs (user_id, flair_id, source)
     values (test_support.user_id('member_b'), (select id from flair where key = 'early_bird'), 'staff') $$,
  'permission denied');
select test_support.expect_error(
  $$ select public.set_active_flair((select id from flair where key = 'early_bird')) $$, 'flair_not_found');
select test_support.become('member_a');
select public.set_active_flair((select id from flair where key = 'early_bird'));
select public.update_my_profile(null, 'About A');
select test_support.become(null);
select test_support.assert_eq_text(
  (select p.active_flair_id::text from public.profiles p where p.id = test_support.user_id('member_a')),
  (select id::text from flair where key = 'early_bird'), 'a person shows one of the flairs they have');

-- ── The profile card ────────────────────────────────────────────────────────
create function pg_temp.card(p_user text) returns public.profile_card_record language sql as $$
  select public.get_profile_card(test_support.user_id(p_user));
$$;
grant execute on function pg_temp.card(text) to public;

select test_support.become('member_a');
select test_support.assert_eq_text(
  (select c.details_visible || '|' || c.bio || '|' || (c.flair ->> 'key') from pg_temp.card('member_a') c),
  'true|About A|early_bird', 'you see all of your own card');
select test_support.expect_error($$ select public.get_profile_card(gen_random_uuid()) $$, 'user_not_found');

select test_support.assert_eq_text(
  (select c.can_message || '|' || c.can_friend_request from pg_temp.card('member_a') c),
  'false|false', 'and you are offered nothing with yourself');

-- Nobody: name and picture only.
select public.update_my_settings(null, 'nobody');
select test_support.become('member_b');
select test_support.assert_eq_text(
  (select c.username || '|' || c.details_visible || '|' || (c.bio is null) || '|' || (c.flair is null) || '|'
          || array_to_string(c.mutual_community_names, ',') || '|' || c.is_friend
   from pg_temp.card('member_a') c),
  'rls_member_a|false|true|true|TEST: Hearth|false',
  'someone else sees the name and the communities you share, not the private details');

select test_support.assert_eq_text(
  (select c.can_message || '|' || c.can_friend_request from pg_temp.card('member_a') c),
  'false|true', 'the card says what the database will allow: no message (friends only), a request (open)');

-- Friends (the default).
select test_support.become('member_a');
select public.update_my_settings(null, 'friends');
select test_support.become('member_b');
select test_support.assert_false((pg_temp.card('member_a')).details_visible, 'friends-only hides details from a non-friend');
select public.send_friend_request(test_support.user_id('member_a'));
select test_support.become('member_a');
select public.send_friend_request(test_support.user_id('member_b'));
select test_support.become('member_b');
select test_support.assert_eq_text(
  (select c.details_visible || '|' || c.bio || '|' || (c.flair ->> 'label') || '|' || c.is_friend from pg_temp.card('member_a') c),
  'true|About A|Early bird|true', 'and shows them to a friend');
select test_support.assert_eq_text(
  (select c.can_message || '|' || c.can_friend_request from pg_temp.card('member_a') c),
  'true|false', 'a friend can message, and has nothing to ask');
select test_support.become('member_a');
select public.update_my_settings(null, 'nobody');
select test_support.become('member_b');
select test_support.assert_false((pg_temp.card('member_a')).details_visible, '"nobody" hides them from friends too');

-- Community: friends, and anyone who shares one.
select test_support.become('member_a');
select public.update_my_settings(null, 'community');
select test_support.become('owner');
select test_support.assert_true((pg_temp.card('member_a')).details_visible, 'someone in Hearth sees them');
select test_support.become('staff_person');
select test_support.assert_false((pg_temp.card('member_a')).details_visible, 'someone who shares nothing does not');

-- Everyone, except across a block.
select test_support.become('member_a');
select public.update_my_settings(null, 'everyone');
select test_support.become('staff_person');
select test_support.assert_eq_text(
  (select c.details_visible || '|' || c.bio || '|' || cardinality(c.mutual_community_names) from pg_temp.card('member_a') c),
  'true|About A|0', 'visible to everyone means a stranger sees the details too');
select test_support.become('member_a');
select public.block_user(test_support.user_id('staff_person'));
select test_support.become('staff_person');
select test_support.assert_eq_text(
  (select c.username || '|' || c.details_visible || '|' || (c.bio is null) from pg_temp.card('member_a') c),
  'rls_member_a|false|true', 'but never across a block');
select test_support.assert_eq_text(
  (select c.can_message || '|' || c.can_friend_request from pg_temp.card('member_a') c),
  'false|false', 'and nothing is offered across one');
select test_support.become('member_a');
select public.unblock_user(test_support.user_id('staff_person'));
select test_support.become(null);

-- A flair that ran out or was retired is no longer shown or selectable.
update public.user_flairs set expires_at = now() - interval '1 day' where user_id = test_support.user_id('member_a');
select test_support.become('member_a');
select test_support.assert_true((pg_temp.card('member_a')).flair is null, 'an expired flair is not shown');
select test_support.expect_error(
  $$ select public.set_active_flair((select id from flair where key = 'early_bird')) $$, 'flair_not_found');
select test_support.become(null);
update public.user_flairs set expires_at = null where user_id = test_support.user_id('member_a');
update public.flairs set retired_at = now() where key = 'early_bird';
select test_support.become('member_a');
select test_support.assert_true((pg_temp.card('member_a')).flair is null, 'nor a retired one');
select public.set_active_flair(null);
select test_support.become(null);
select test_support.assert_true(
  (select p.active_flair_id is null from public.profiles p where p.id = test_support.user_id('member_a')),
  'and a person can show none');

-- ── Who hears a profile change ──────────────────────────────────────────────
-- staff_person has a request waiting with member_a. stranger has a
-- conversation with them and nothing else. non_member has no connection.
select test_support.become('staff_person');
select public.send_friend_request(test_support.user_id('member_a'));
select test_support.become('stranger');
select public.send_friend_request(test_support.user_id('member_a'));
select test_support.become('member_a');
select public.send_friend_request(test_support.user_id('stranger'));
select public.open_dm(test_support.user_id('stranger'));
select public.remove_friend(test_support.user_id('stranger'));
select test_support.assert_eq_text(
  (select c.can_message || '|' || c.can_friend_request from pg_temp.card('staff_person') c),
  'false|true', 'asking back is offered while their request waits, whatever their rule');
select test_support.assert_false(
  (pg_temp.card('stranger')).can_message, 'a conversation neither rule keeps open is not offered');
select public.update_my_settings(null, null, 'everyone');
select test_support.assert_true(
  (pg_temp.card('stranger')).can_message, 'one your own rule keeps open is: you can answer');
select public.update_my_settings(null, null, 'friends');
select test_support.become(null);
select test_support.clear_sent();

select test_support.become('member_a');
select public.update_my_profile('renamed_a');
select test_support.become(null);
select test_support.assert_eq_text(
  test_support.last_sent('owner', 'profile.updated') ->> 'username', 'renamed_a', 'people in a shared community hear a new name');
select test_support.assert_eq_int(test_support.sent('member_a', 'profile.updated'), 1, 'so do the person''s own devices');
select test_support.assert_eq_int(test_support.sent('member_b', 'profile.updated'), 1, 'a friend, once, however many ways they are connected');
select test_support.assert_eq_int(test_support.sent('staff_person', 'profile.updated'), 1, 'someone with a request waiting');
select test_support.assert_eq_int(test_support.sent('stranger', 'profile.updated'), 1, 'and the other side of a conversation');
select test_support.assert_eq_int(test_support.sent('non_member', 'profile.updated'), 0, 'nobody else');

-- Someone connected to nobody still hears their own change (their other devices).
create temp table loner as select gen_random_uuid() as id;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ((select id from loner), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'loner@example.test', '{"username": "loner"}');
select test_support.set_jwt_claims((select id from loner));
select set_config('role', 'authenticated', true);
select public.update_my_profile('loner_two');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from realtime.messages m
     where m.topic = 'user:' || (select id::text from loner) and m.event = 'profile.updated' $$, 1,
  'with no communities, friends or conversations, the person is still told');

select test_support.clear_sent();
select test_support.become('member_a');
select public.update_my_profile(null, 'A new bio');
select test_support.become(null);
select test_support.assert_eq_int(
  test_support.sent('owner', 'profile.updated'), 0, 'a change to something the event does not carry is not announced');

-- ── Feature flags ───────────────────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled_by_default)
values ('new_composer', 'The new message box.', false), ('old_default', 'On for everyone.', true);
insert into public.feature_flag_overrides (user_id, flag_key, enabled, expires_at)
values (test_support.user_id('member_a'), 'new_composer', true, null),
       (test_support.user_id('member_a'), 'old_default', false, now() - interval '1 day');
select test_support.become('member_a');
select test_support.assert_eq_text(
  (select string_agg(f.key || ':' || f.enabled, ',') from public.get_my_feature_flags() f),
  'new_composer:true,old_default:true', 'an override applies to one person; an expired one does not');
select test_support.expect_error($$ select * from public.feature_flags $$, 'permission denied');
select test_support.expect_error($$ select * from public.feature_flag_overrides $$, 'permission denied');
select test_support.become('member_b');
select test_support.assert_eq_text(
  (select string_agg(f.key || ':' || f.enabled, ',') from public.get_my_feature_flags() f),
  'new_composer:false,old_default:true', 'everyone else gets the defaults');
select test_support.become(null);

-- ── One-time introductions ──────────────────────────────────────────────────
insert into public.onboarding_campaigns
  (key, title, required, flag_key, community_id, flair_id, platforms, min_app_version, max_app_version, active, ends_at, sort_order)
values
  ('join_hearth', 'Join the Hearth', false, null, test_support.hearth_id(),
     (select id from flair where key = 'club_member'), '{}', null, null, true, null, 1),
  ('must_read', 'Read this', true, null, null, null, '{}', null, null, true, null, 2),
  ('ios_two', 'New on iOS', false, null, null, null, '{ios}', '2.0', '2.9', true, null, 3),
  ('flagged', 'Try the composer', false, 'new_composer', null, null, '{}', null, null, true, null, 4),
  ('ended', 'Too late', false, null, null, null, '{}', null, null, true, now() - interval '1 day', 5),
  ('switched_off', 'Not yet', false, null, null, null, '{}', null, null, false, null, 6);

create function pg_temp.offered(p_platform text, p_version text) returns text language sql as $$
  select coalesce(string_agg(c.key, ',' order by c.sort_order), '') from public.list_my_onboarding(p_platform, null, p_version) c;
$$;
grant execute on function pg_temp.offered(text, text) to public;

select test_support.become('non_member');
select test_support.assert_eq_text(
  pg_temp.offered('ios', '2.0.0'), 'join_hearth,must_read,ios_two',
  'offered: what is on, has not ended, and fits this platform and version');
select test_support.assert_eq_text(pg_temp.offered('android', '2.0.0'), 'join_hearth,must_read', 'another platform is not offered it');
select test_support.assert_eq_text(pg_temp.offered('ios', '2'), 'join_hearth,must_read,ios_two', '"2" is version 2.0');
select test_support.assert_eq_text(pg_temp.offered('ios', '1.9.9'), 'join_hearth,must_read', 'an older build is not offered it');
select test_support.assert_eq_text(pg_temp.offered('ios', '2.10'), 'join_hearth,must_read', 'nor a newer one: 2.10 is after 2.9');
select test_support.assert_eq_text(pg_temp.offered('ios', null), 'join_hearth,must_read', 'nor a build that does not say');
select test_support.expect_error($$ select * from public.onboarding_campaigns $$, 'permission denied');
select test_support.become('member_a');
select test_support.assert_eq_text(
  pg_temp.offered('android', null), 'join_hearth,must_read,flagged', 'one behind a flag is offered to those who have the flag');
select test_support.become(null);

-- Answering.
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.answer_onboarding('must_read', 'skipped', 'ios') $$, 'campaign_required');
select test_support.expect_error(
  $$ select public.answer_onboarding('ios_two', 'completed', 'android') $$, 'campaign_not_offered');
select test_support.expect_error(
  $$ select public.answer_onboarding('no_such', 'completed', 'ios') $$, 'campaign_not_offered');
select public.answer_onboarding('must_read', 'completed', 'ios');
select public.answer_onboarding('ios_two', 'skipped', 'ios', null, '2.5');
select public.answer_onboarding('join_hearth', 'completed', 'ios');
select test_support.expect_error(
  $$ select public.answer_onboarding('join_hearth', 'completed', 'ios') $$, 'campaign_not_offered');
select test_support.assert_eq_text(pg_temp.offered('ios', '2.5'), '', 'what was answered is not offered again');
select test_support.become(null);
select test_support.assert_true(
  private.is_member(test_support.hearth_id(), test_support.user_id('non_member')), 'finishing one can join a community');
select test_support.assert_query_count(
  $$ select 1 from public.user_flairs uf
     where uf.user_id = test_support.user_id('non_member')
       and uf.flair_id = (select id from flair where key = 'club_member') and uf.source = 'onboarding' $$, 1,
  'and give a flair');
select test_support.assert_eq_text(
  (select string_agg(o.campaign_key || ':' || o.outcome, ',' order by o.campaign_key)
   from public.onboarding_progress o where o.user_id = test_support.user_id('non_member')),
  'ios_two:skipped,join_hearth:completed,must_read:completed', 'each answer is kept');

-- Skipping does none of that.
select test_support.become('stranger');
select public.answer_onboarding('join_hearth', 'skipped', 'ios');
select test_support.become(null);
select test_support.assert_false(
  private.is_member(test_support.hearth_id(), test_support.user_id('stranger')), 'skipping one joins nothing');
select test_support.assert_query_count(
  $$ select 1 from public.user_flairs uf where uf.user_id = test_support.user_id('stranger') $$, 0,
  'and gives nothing');

-- Not offered when it cannot be finished.
select test_support.become('owner');
select public.ban_member(test_support.hearth_id(), test_support.user_id('staff_person'), 'not welcome');
select test_support.become('staff_person');
select test_support.assert_eq_text(
  pg_temp.offered('ios', null), 'must_read', 'an introduction that joins a community is not shown to someone banned from it');
select test_support.expect_error(
  $$ select public.answer_onboarding('join_hearth', 'completed', 'ios') $$, 'campaign_not_offered');
select test_support.become(null);

-- ── The person's own account ────────────────────────────────────────────────
update public.flairs set retired_at = null where key = 'early_bird';
select test_support.become('member_a');
select public.update_my_profile(null, 'Mine');
select public.set_active_flair((select id from flair where key = 'early_bird'));
select test_support.assert_eq_text(
  (select m.bio || '|' || m.active_flair_id from public.get_my_profile() m),
  'Mine|' || (select id::text from flair where key = 'early_bird'),
  'a person reads what only they see of their profile');
select test_support.become(null);
select test_support.assert_true(
  (select count(*) = 0 from public.get_my_profile()), 'and without a session there is nothing');

-- Every part of the account tells only the person's own devices.
select test_support.clear_sent();
select test_support.become('member_a');
select public.update_my_settings('midnight');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_a', 'account.changed'), 1, 'a setting');
select test_support.assert_eq_int(test_support.sent('owner', 'account.changed'), 0, 'and nobody else');

select test_support.clear_sent();
select test_support.become('member_a');
select public.update_my_settings();
select test_support.become(null);
select test_support.assert_eq_text(
  (select s.theme from public.user_settings s where s.user_id = test_support.user_id('member_a')), 'midnight',
  'a setting left out is kept');

select test_support.clear_sent();
select test_support.become('member_a');
select public.update_my_profile(null, 'Another bio');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_a', 'account.changed'), 1, 'the bio');

select test_support.clear_sent();
select test_support.become('member_a');
select public.update_my_settings(null, 'friends', 'community', 'everyone');
select public.set_active_flair(null);
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_a', 'account.changed'), 2, 'the privacy rules, and the flair shown');

select test_support.clear_sent();
select test_support.become('member_a');
select public.update_my_profile('renamed_again');
select test_support.become(null);
select test_support.assert_eq_int(
  test_support.sent('member_a', 'account.changed'), 0, 'a new name is profile.updated, not this');

select test_support.clear_sent();
select private.grant_flair(test_support.user_id('member_a'), (select id from flair where key = 'club_member'), 'staff');
select test_support.assert_eq_int(test_support.sent('member_a', 'account.changed'), 1, 'a flair given by someone else');
select test_support.clear_sent();
delete from public.user_flairs uf
where uf.user_id = test_support.user_id('member_a') and uf.flair_id = (select id from flair where key = 'club_member');
select test_support.assert_eq_int(test_support.sent('member_a', 'account.changed'), 1, 'and taken away');

select test_support.clear_sent();
update public.feature_flag_overrides o set enabled = false
where o.user_id = test_support.user_id('member_a') and o.flag_key = 'new_composer';
select test_support.assert_eq_int(test_support.sent('member_a', 'account.changed'), 1, 'a flag the operator turned');
select test_support.assert_eq_int(test_support.sent('member_b', 'account.changed'), 0, 'for that person only');

select test_support.clear_sent();
select test_support.become('member_a');
select public.answer_onboarding('must_read', 'completed', 'ios');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_a', 'account.changed'), 1, 'an introduction answered');

select test_support.become('member_a');
select public.accept_terms('2026-03-24');
select test_support.clear_sent();
select public.accept_terms('2026-03-24');
select test_support.become(null);
select test_support.assert_eq_int(
  test_support.sent('member_a', 'account.changed'), 0, 'accepting terms already accepted changes nothing, so says nothing');

select test_support.clear_sent();
insert into public.terms_versions (version) values ('2026-12-01');
select test_support.become('member_a');
select public.accept_terms('2026-12-01');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_a', 'account.changed'), 1, 'new terms accepted');

-- ── The operator's tables ───────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.expect_error($$ select * from public.ota_releases $$, 'permission denied');
select test_support.expect_error($$ select * from public.flair_grant_rules $$, 'permission denied');
select test_support.become(null);

rollback;
