-- Who can see, send in and manage a channel. One rule (private.channel_access)
-- answers for one person, for RLS, and for a channel's whole audience.
begin;

create function pg_temp.sees(p_channel text, p_user text) returns boolean language sql as $$
  select private.can_view_channel(test_support.channel_id(p_channel), test_support.user_id(p_user));
$$;
create function pg_temp.sends(p_channel text, p_user text) returns boolean language sql as $$
  select private.can_send_in_channel(test_support.channel_id(p_channel), test_support.user_id(p_user));
$$;
create function pg_temp.manages(p_channel text, p_user text) returns boolean language sql as $$
  select private.can_manage_channel(test_support.channel_id(p_channel), test_support.user_id(p_user));
$$;

-- ── The community-wide permission is the base ───────────────────────────────
select test_support.assert_true(pg_temp.sees('general', 'member_a'), 'a member sees #general');
select test_support.assert_true(pg_temp.sends('general', 'member_a'), 'a member sends in #general');
select test_support.assert_false(pg_temp.manages('general', 'member_a'), 'a member does not manage #general');
select test_support.assert_false(pg_temp.sees('general', 'non_member'), 'a stranger does not see #general');
select test_support.assert_false(pg_temp.sends('general', 'non_member'), 'a stranger does not send in #general');

-- ── The owner can do everything ─────────────────────────────────────────────
select test_support.assert_true(pg_temp.sees('staff-room', 'owner'), 'the owner sees a hidden channel');
select test_support.assert_true(pg_temp.sends('read-only', 'owner'), 'the owner sends in a read-only channel');
select test_support.assert_true(pg_temp.manages('staff-room', 'owner'), 'the owner manages every channel');

-- ── An exception for the everyone role ──────────────────────────────────────
select test_support.assert_true(pg_temp.sees('read-only', 'member_a'), 'read-only is still visible');
select test_support.assert_false(pg_temp.sends('read-only', 'member_a'), 'read-only refuses a member');
select test_support.assert_false(pg_temp.sees('staff-room', 'member_a'), 'staff-room is hidden from a member');

-- ── A role exception beats the everyone exception ───────────────────────────
select test_support.assert_true(pg_temp.sees('staff-room', 'server_mod'), 'the Moderator role opens staff-room');
select test_support.assert_true(pg_temp.sends('staff-room', 'server_mod'), 'and a moderator can talk there');

-- ── Among roles, a "no" beats a "yes" ───────────────────────────────────────
select test_support.become('owner');
select public.create_role(test_support.hearth_id(), 'Quiet', null, 10);
select public.create_role(test_support.hearth_id(), 'Loud', null, 11);
select public.set_member_roles(test_support.hearth_id(), test_support.user_id('member_b'),
  array[test_support.role_id('Quiet'), test_support.role_id('Loud')]);
select public.set_channel_overwrite(test_support.channel_id('general'), test_support.role_id('Quiet'), null, null, false, null);
select public.set_channel_overwrite(test_support.channel_id('general'), test_support.role_id('Loud'), null, null, true, null);
select test_support.become(null);
select test_support.assert_false(pg_temp.sends('general', 'member_b'), 'one role says no, another yes: no');
select test_support.assert_true(pg_temp.sees('general', 'member_b'), 'the no was only about sending');

-- ── An exception for the member beats their roles ───────────────────────────
select test_support.become('owner');
select public.set_channel_overwrite(test_support.channel_id('general'), null, test_support.user_id('member_b'), null, true, null);
select public.set_channel_overwrite(test_support.channel_id('staff-room'), null, test_support.user_id('member_a'), true, null, null);
select test_support.become(null);
select test_support.assert_true(pg_temp.sends('general', 'member_b'), 'a member exception overrides the role no');
select test_support.assert_true(pg_temp.sees('staff-room', 'member_a'), 'a member exception opens a hidden channel');

-- ── Sending and managing need seeing ────────────────────────────────────────
select test_support.become('owner');
select public.set_channel_overwrite(test_support.channel_id('staff-room'), null, test_support.user_id('member_a'), false, true, true);
select test_support.become(null);
select test_support.assert_false(pg_temp.sends('staff-room', 'member_a'), 'allowed to send but not to see: cannot send');
select test_support.assert_false(pg_temp.manages('staff-room', 'member_a'), 'allowed to manage but not to see: cannot manage');

-- ── A voice channel is seen, not written in ─────────────────────────────────
select test_support.assert_true(pg_temp.sees('Lounge', 'member_a'), 'a member sees the voice channel');
select test_support.assert_false(pg_temp.sends('Lounge', 'member_a'), 'nobody sends messages in a voice channel');

-- ── RLS shows exactly the channels the rule allows ──────────────────────────
select test_support.become('member_b');
select test_support.assert_eq_text(
  (select string_agg(c.name, ',' order by c.name) from public.channels c where c.community_id = test_support.hearth_id()),
  'general,Lounge,read-only', 'a member lists the three channels they can see');
select test_support.become('server_mod');
select test_support.assert_query_count(
  $$ select 1 from public.channels c where c.community_id = test_support.hearth_id() $$, 4,
  'a moderator lists all four');
select test_support.become('non_member');
select test_support.assert_query_count($$ select 1 from public.channels $$, 0, 'a stranger lists none');
select test_support.become(null);

-- ── The audience of a channel is the same rule ──────────────────────────────
select test_support.assert_eq_text(
  (select string_agg(p.username, ',' order by p.username)
   from unnest(private.channel_viewer_ids(test_support.channel_id('staff-room'))) v
   join public.profiles p on p.id = v),
  'rls_owner,rls_server_mod', 'staff-room is heard by the owner and the moderator only');
select test_support.assert_eq_int(
  cardinality(private.channel_viewer_ids(test_support.channel_id('general'))), 4, '#general is heard by all four members');

-- ── Only someone with the permission, and above the target, sets exceptions ─
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.set_channel_overwrite(test_support.channel_id('general'), test_support.role_id('Quiet'), null, true, true, true) $$,
  'missing_permission');
select test_support.become('server_mod');
select test_support.expect_error(
  $$ select public.create_channel(test_support.hearth_id(), 'text', 'mods-made-this') $$, 'missing_permission');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.create_channel(test_support.hearth_id(), 'text', 'nope') $$, 'community_not_found');
select test_support.become(null);

-- ── Removing an exception puts the rule back ────────────────────────────────
select test_support.become('owner');
select public.set_channel_overwrite(test_support.channel_id('read-only'), test_support.role_id('everyone'), null, null, null, null);
select test_support.become(null);
select test_support.assert_true(pg_temp.sends('read-only', 'member_a'), 'with the exception gone, members can send again');
select test_support.assert_query_count(
  $$ select 1 from public.channel_overwrites o where o.channel_id = test_support.channel_id('read-only') $$, 0,
  'all-null removes the row');

-- ── Voice presence follows the same rule ────────────────────────────────────
-- Supabase Realtime decides whether someone may join a topic by running the
-- policies with realtime.topic set to the topic they asked for.
insert into realtime.messages (topic, extension, event, private)
values ('voice:' || test_support.channel_id('Lounge')::text, 'presence', 'probe', true);

select test_support.become('member_a');
select set_config('realtime.topic', 'voice:' || test_support.channel_id('Lounge')::text, true);
select test_support.assert_true(
  (select count(*) from realtime.messages) > 0, 'someone who can see a voice channel may join its presence topic');
insert into realtime.messages (topic, extension, event, private)
values ('voice:' || test_support.channel_id('Lounge')::text, 'presence', 'here', true);
select test_support.expect_error(
  $$ insert into realtime.messages (topic, extension, event, private)
     values ('voice:' || test_support.channel_id('Lounge')::text, 'broadcast', 'shout', true) $$, 'row-level security');
select set_config('realtime.topic', 'voice:' || test_support.channel_id('staff-room')::text, true);
select test_support.assert_eq_int(
  (select count(*) from realtime.messages), 0, 'but not the topic of a channel they cannot see');
select set_config('realtime.topic', 'voice:not-a-channel', true);
select test_support.assert_eq_int((select count(*) from realtime.messages), 0, 'nor a topic that names no channel');
select test_support.become('non_member');
select set_config('realtime.topic', 'voice:' || test_support.channel_id('Lounge')::text, true);
select test_support.assert_eq_int((select count(*) from realtime.messages), 0, 'a stranger may not join');
select test_support.expect_error(
  $$ insert into realtime.messages (topic, extension, event, private)
     values ('voice:' || test_support.channel_id('Lounge')::text, 'presence', 'here', true) $$, 'row-level security');
select test_support.become(null);

-- ── Getting into a voice channel ────────────────────────────────────────────
-- The function that hands out voice tokens asks this, as the person.
select test_support.become('member_a');
select test_support.assert_eq_text(
  (select v.channel_name || '|' || (v.community_id = test_support.hearth_id()) || '|' || v.can_moderate
   from public.get_voice_access(test_support.channel_id('Lounge')) v),
  'Lounge|true|false', 'a member may join a voice channel they can see');
select test_support.assert_eq_text(
  (select v.user_id || '|' || v.username from public.get_voice_access(test_support.channel_id('Lounge')) v),
  test_support.user_id('member_a') || '|' || (select p.username from public.get_profiles(array[test_support.user_id('member_a')]) p),
  'and is told who they are, so the voice token carries the right name');
select test_support.expect_error(
  $$ select * from public.get_voice_access(test_support.channel_id('general')) $$, 'channel_not_found');
select test_support.become('owner');
select test_support.assert_true(
  (select v.can_moderate from public.get_voice_access(test_support.channel_id('Lounge')) v),
  'and is told whether they may moderate it');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select * from public.get_voice_access(test_support.channel_id('Lounge')) $$, 'channel_not_found');
select test_support.become(null);
insert into public.account_restrictions (user_id) values (test_support.user_id('member_b'));
select test_support.become('member_b');
select test_support.expect_error(
  $$ select * from public.get_voice_access(test_support.channel_id('Lounge')) $$, 'account_restricted');
select test_support.become(null);
delete from public.account_restrictions where user_id = test_support.user_id('member_b');

-- ── Muting or removing someone in voice ─────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_a');
select public.send_voice_control(test_support.channel_id('Lounge'), test_support.user_id('member_a'), 'session-1', 'mute');
select test_support.expect_error(
  $$ select public.send_voice_control(
       test_support.channel_id('Lounge'), test_support.user_id('member_b'), 'session-2', 'remove') $$,
  'missing_permission');
select test_support.expect_error(
  $$ select public.send_voice_control(
       test_support.channel_id('general'), test_support.user_id('member_a'), 'session-1', 'mute') $$,
  'channel_not_found');
select test_support.expect_error(
  $$ select public.send_voice_control(test_support.channel_id('Lounge'), test_support.user_id('member_a'), '', 'mute') $$,
  'session_invalid');
select test_support.become('owner');
select public.set_member_roles(test_support.hearth_id(), test_support.user_id('member_a'), array[test_support.role_id('Admin')]);
select public.send_voice_control(test_support.channel_id('Lounge'), test_support.user_id('member_b'), 'session-2', 'remove');
select test_support.expect_error(
  $$ select public.send_voice_control(
       test_support.channel_id('Lounge'), test_support.user_id('non_member'), 'session-3', 'mute') $$,
  'member_not_found');
select test_support.become('member_a'); -- an Admin now: may manage members, but not the owner
select test_support.expect_error(
  $$ select public.send_voice_control(
       test_support.channel_id('Lounge'), test_support.user_id('owner'), 'session-4', 'mute') $$, 'outranked');
select test_support.become(null);
select test_support.assert_eq_int(
  test_support.sent('member_a', 'voice.control'), 1, 'anyone controls their own voice session');
select test_support.assert_eq_text(
  (select (p ->> 'action') || '|' || (p ->> 'target_session_id') || '|' || (p ->> 'actor_name') || '|' || (p ->> 'channel_name')
   from (select test_support.last_sent('member_b', 'voice.control') as p) sent),
  'remove|session-2|rls_owner|Lounge', 'someone above them can, and the person is told what and by whom');
select test_support.assert_eq_int(test_support.sent('owner', 'voice.control'), 0, 'only the person it is for hears it');

rollback;
