-- Deleting an account: what goes, what stays, and who is told.
begin;

select test_support.take_friend_requests('member_b');
delete from public.notifications where true;
delete from private.rate_limit_hits where true;
delete from private.jobs where true;

create function pg_temp.say(p_user text, p_channel_id uuid, p_body text) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  perform test_support.become(p_user);
  v_id := (public.send_message(p_channel_id, p_body)).id;
  perform test_support.become(null);
  return v_id;
end;
$$;
create function pg_temp.post_file(p_user text, p_body text) returns jsonb language plpgsql as $$
declare
  v_media uuid;
  v_message uuid;
begin
  perform test_support.become(p_user);
  v_media := (public.create_upload('attachment', 'image/png', 1000, 'pic.png')).id;
  perform test_support.become(null);
  perform test_support.fake_upload(v_media);
  perform test_support.become(p_user);
  v_message := (public.send_message(test_support.channel_id('general'), p_body, null, array[v_media])).id;
  perform test_support.become(null);
  return jsonb_build_object('message_id', v_message, 'media_id', v_media);
end;
$$;

-- ── member_b, with a bit of everything ──────────────────────────────────────
create temp table gone as select test_support.user_id('member_b') as id;
grant select on gone to public;

-- Words and files in a community: one plain file, one under a safety case.
create temp table plain as select pg_temp.post_file('member_b', 'my holiday') as p;
create temp table reported as select pg_temp.post_file('member_b', 'something bad') as p;
create temp table kept_line as select pg_temp.say('member_a', test_support.channel_id('general'), 'a line by someone else') as id;
grant select on plain, reported, kept_line to public;
select test_support.become('member_b');
select public.set_reaction((select id from kept_line), '👍', true);
select public.update_my_profile(null, 'about me');
create temp table face as select * from public.create_upload('avatar', 'image/png', 500);
create temp table unused as select * from public.create_upload('attachment', 'image/png', 10);
select test_support.become(null);
select test_support.fake_upload((select id from face));
select test_support.become('member_b');
select public.set_my_avatar((select id from face));
select public.register_push_device('tok-b', 'ios');
select public.mute_channel(test_support.channel_id('general'), 'infinity');
select test_support.become('member_a');
create temp table the_case as
  select public.file_platform_case('message', (select (p ->> 'message_id')::uuid from reported), 'Bad.') as id;

-- A friend and a conversation, a waiting request, a block.
select public.send_friend_request(test_support.user_id('member_b'));
select test_support.become('member_b');
select public.send_friend_request(test_support.user_id('member_a'));
create temp table dm as select (public.open_dm(test_support.user_id('member_a'))).id as id;
grant select on dm to public;
select public.block_user(test_support.user_id('non_member'));
select public.create_friend_link();
select test_support.become('staff_active');
select public.send_friend_request(test_support.user_id('member_b'));
create temp table staff_link as select * from public.create_friend_link();
grant select on staff_link to public;
select test_support.become('member_b');
select public.answer_friend_link((select code from staff_link), false);
select test_support.become(null);
select pg_temp.say('member_b', (select id from dm), 'from the one leaving');
select pg_temp.say('member_a', (select id from dm), 'from the one staying');

-- Two communities of their own: one they are alone in, one with a member.
select test_support.become('member_b');
create temp table solo as select * from public.create_community('Solo');
create temp table shared as select * from public.create_community('Shared');
grant select on solo, shared to public;
create temp table shared_invite as select * from public.create_invite((select id from shared));
grant select on shared_invite to public;
select test_support.become('member_a');
select public.join_community((select code from shared_invite));
select test_support.become(null);

-- ── Choosing to leave ───────────────────────────────────────────────────────
select test_support.become('member_b');
select test_support.expect_error($$ select public.delete_my_account() $$, 'owns_communities');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from auth.users u where u.id = (select id from gone) $$, 1,
  'someone who owns a community other people are in is asked to hand it over first');

-- Someone with nothing to hand over just goes.
create temp table gone_too as select test_support.user_id('server_mod') as id;
select test_support.become('server_mod');
select public.delete_my_account();
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from auth.users u where u.id = (select id from gone_too) $$, 0, 'delete_my_account removes the login');
select test_support.assert_query_count(
  $$ select 1 from public.profiles p
     where p.id = (select id from gone_too) and p.deleted_at is not null and p.username is null $$, 1,
  'and leaves a blank profile behind');

-- ── The login is deleted, by any route ──────────────────────────────────────
select test_support.clear_sent();
delete from private.jobs where true;
delete from auth.users where id = (select id from gone);

-- What is left of the person: a blank profile.
select test_support.assert_query_count(
  $$ select 1 from public.profiles p
     where p.id = (select id from gone) and p.deleted_at is not null
       and p.username is null and p.bio is null and p.avatar_media_id is null $$, 1,
  'the profile is kept, with nothing on it');
select test_support.assert_eq_text(
  test_support.last_sent('member_a', 'profile.updated') ->> 'deleted', 'true',
  'a friend hears that they are gone');
-- The owner's only link to them was the community. They are told because the
-- profile is blanked before the memberships are removed.
select test_support.assert_eq_int(
  test_support.sent('owner', 'profile.updated'), 1, 'so does someone who only shared a community with them');
select test_support.assert_eq_int(test_support.sent('non_member', 'profile.updated'), 0, 'strangers hear nothing');
select test_support.become('member_a');
select test_support.assert_query_count(
  $$ select 1 from public.get_profiles(array[(select id from gone)]) p where p.deleted and p.username is null $$, 1,
  'looking them up says "deleted", not "unknown"');
select test_support.become(null);

-- Their words and files.
select test_support.assert_query_count(
  $$ select 1 from public.messages m where m.author_id = (select id from gone) $$, 0, 'every message they wrote is deleted');
select test_support.assert_query_count(
  $$ select 1 from public.message_reactions r where r.user_id = (select id from gone) $$, 0, 'and every reaction');
select test_support.assert_query_count(
  $$ select 1 from public.messages m where m.id = (select id from kept_line) $$, 1, 'other people''s messages are untouched');
select test_support.assert_query_count(
  $$ select 1 from public.media f where f.owner_id = (select id from gone) and f.status <> 'released' $$, 0,
  'every file of theirs is let go of: attachments, picture, unused uploads');
select test_support.assert_eq_text(
  (select string_agg(j.payload ->> 'media_id', ',' order by j.payload ->> 'media_id')
   from private.jobs j where j.kind = 'media_delete'),
  (select string_agg(id::text, ',' order by id::text)
   from (select (p ->> 'media_id')::uuid as id from plain
         union all select id from face union all select id from unused) files),
  'and queued for deletion, except the one a safety case holds');
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases c
     where c.id = (select id from the_case) and c.subject_user_id = (select id from gone)
       and c.snapshot -> 'message' ->> 'body' = 'something bad' $$, 1,
  'the case about them stays, with what it recorded');
select test_support.assert_query_count(
  $$ select 1 from public.case_media cm join public.media f on f.id = cm.media_id
     where cm.case_id = (select id from the_case) $$, 1, 'and so does its evidence');

-- Their communities.
select test_support.assert_query_count(
  $$ select 1 from public.community_members m where m.user_id = (select id from gone) $$, 0, 'they are in no community');
select test_support.assert_eq_int(test_support.sent('owner', 'member.left'), 1, 'and the members hear them leave');
select test_support.assert_query_count(
  $$ select 1 from public.communities c where c.id = (select id from solo) $$, 0,
  'a community they were alone in is deleted');
select test_support.assert_eq_text(
  (select c.owner_id::text from public.communities c where c.id = (select id from shared)),
  test_support.user_id('member_a')::text, 'a community with other members goes to one of them');
select test_support.assert_query_count(
  $$ select 1 from public.community_audit_log l
     where l.community_id = (select id from shared) and l.action = 'ownership_transferred'
       and l.target_user_id = test_support.user_id('member_a') and l.detail ->> 'because' = 'account_deleted' $$, 1,
  'which is written down');
select test_support.assert_true(
  test_support.sent('member_a', 'access.changed') >= 1, 'and the new owner is told their access changed');

-- The people around them.
select test_support.assert_query_count(
  $$ select 1 from public.friendships f where (select id from gone) in (f.user_low_id, f.user_high_id) $$, 0, 'friendships end');
select test_support.assert_query_count(
  $$ select 1 from public.friend_requests r where (select id from gone) in (r.sender_id, r.recipient_id) $$, 0,
  'waiting requests are dropped');
select test_support.assert_query_count(
  $$ select 1 from public.friend_links l where l.owner_id = (select id from gone) $$, 0, 'their friend links');
select test_support.assert_query_count(
  $$ select 1 from private.friend_link_declines d where d.user_id = (select id from gone) $$, 0,
  'and which links they declined');
select test_support.assert_query_count(
  $$ select 1 from public.blocks b where (select id from gone) in (b.blocker_id, b.blocked_id) $$, 0, 'blocks are dropped');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n where (select id from gone) in (n.recipient_id, n.actor_id) $$, 0,
  'notifications to them and about them are dropped');
select test_support.assert_query_count(
  $$ select 1 from public.push_devices d where d.user_id = (select id from gone) $$, 0, 'their phone is forgotten');
select test_support.assert_query_count(
  $$ select 1 from public.user_settings s where s.user_id = (select id from gone) $$, 0, 'their settings');
select test_support.assert_query_count(
  $$ select 1 from public.channel_user_state s where s.user_id = (select id from gone) $$, 0, 'and what they had read and muted');

-- The conversation stays for the other person.
select test_support.become('member_a');
select test_support.assert_eq_text(
  (select string_agg(r.body, ',') from public.list_messages((select id from dm)) r), 'from the one staying',
  'the other person keeps the conversation and their own side of it');
select test_support.assert_query_count(
  $$ select 1 from public.channel_participants p where p.channel_id = (select id from dm) $$, 2,
  'and can still see who it was with');
select test_support.expect_error($$ select public.send_message((select id from dm), 'hello?') $$, 'cannot_send');
select test_support.become(null);

-- A token issued before the deletion stops working.
select test_support.set_jwt_claims((select id from gone));
select set_config('role', 'authenticated', true);
select test_support.expect_error($$ select public.get_profiles('{}') $$, 'account_gone');
select test_support.become(null);

-- Nothing is left to do a second time, and the name is free again.
select private.erase_account((select id from gone));
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'newcomer@example.test', '{"username": "rls_member_b"}');
select test_support.assert_query_count(
  $$ select 1 from public.profiles p where p.username = 'rls_member_b' and p.id <> (select id from gone) $$, 1,
  'someone new can take the name');

-- ── When both sides of a conversation are gone ──────────────────────────────
delete from auth.users where id = test_support.user_id('member_a');
select test_support.assert_query_count(
  $$ select 1 from public.channels c where c.id = (select id from dm) $$, 0, 'the conversation goes too');
select test_support.assert_query_count(
  $$ select 1 from public.communities c where c.id = (select id from shared) $$, 0,
  'and the community the second person was by then alone in');

-- ── Staff ───────────────────────────────────────────────────────────────────
create temp table gone_staff as select test_support.user_id('staff_active') as id;
delete from auth.users where id = (select id from gone_staff);
select test_support.assert_query_count(
  $$ select 1 from public.platform_staff s where s.user_id = (select id from gone_staff) and not s.active $$, 1,
  'a deleted staff account is no longer staff');
select test_support.assert_false(
  (select p.is_staff from public.profiles p where p.id = (select id from gone_staff)), 'and loses the badge');

rollback;
