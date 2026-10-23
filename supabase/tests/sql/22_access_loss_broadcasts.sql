begin;

select test_support.note('suite 22: access-loss broadcasts (overwrites -> ROLE_CHANGE, bans -> membership change only)');
select test_support.cleanup_fixture_domain_state();

-- realtime.send() writes realtime.messages, so a broadcast made in this
-- transaction is a row stamped with the transaction's now().
create function pg_temp.sent(p_user_key text, p_event text)
returns bigint
language sql
as $$
  select count(*)
  from realtime.messages m
  where m.topic = 'private_user:' || test_support.fixture_user_id(p_user_key)::text
    and m.event = p_event
    and m.inserted_at >= now()
    and m.payload ->> 'community_id' = test_support.fixture_community_id()::text;
$$;

-- ── member overwrite: only that member hears ROLE_CHANGE ───────────────────
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

insert into public.channel_member_overwrites (community_id, channel_id, member_id, can_view)
values (
  test_support.fixture_community_id(),
  test_support.fixture_channel_id('general'),
  test_support.fixture_member_id('member_b'),
  false
);

reset role;
select test_support.assert_eq_int(pg_temp.sent('member_b', 'ROLE_CHANGE'), 1,
  'a member overwrite should send ROLE_CHANGE to that member');
select test_support.assert_eq_int(pg_temp.sent('member_a', 'ROLE_CHANGE'), 0,
  'a member overwrite should not reach other members');

-- ── role overwrite: everyone holding the role, nobody else ─────────────────
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

insert into public.channel_role_overwrites (community_id, channel_id, role_id, can_view)
values (
  test_support.fixture_community_id(),
  test_support.fixture_channel_id('general'),
  test_support.fixture_role_id('moderator'),
  true
);

reset role;
select test_support.assert_eq_int(pg_temp.sent('server_mod', 'ROLE_CHANGE'), 1,
  'a role overwrite should reach members holding the role');
select test_support.assert_eq_int(pg_temp.sent('member_b', 'ROLE_CHANGE'), 1,
  'a role overwrite should not reach members without the role');

-- @everyone is a real member_roles row, so its overwrites reach every member.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

insert into public.channel_role_overwrites (community_id, channel_id, role_id, can_send)
values (
  test_support.fixture_community_id(),
  test_support.fixture_channel_id('general'),
  test_support.fixture_role_id('@everyone'),
  false
);

reset role;
select test_support.assert_eq_int(pg_temp.sent('member_a', 'ROLE_CHANGE'), 1,
  'an @everyone overwrite should reach member_a');
select test_support.assert_eq_int(pg_temp.sent('member_b', 'ROLE_CHANGE'), 2,
  'an @everyone overwrite should reach member_b');

-- ── removing an overwrite is a change too ──────────────────────────────────
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

delete from public.channel_member_overwrites cmo
where cmo.channel_id = test_support.fixture_channel_id('general')
  and cmo.member_id = test_support.fixture_member_id('member_b');

reset role;
select test_support.assert_eq_int(pg_temp.sent('member_b', 'ROLE_CHANGE'), 3,
  'deleting a member overwrite should send ROLE_CHANGE');

-- ── a ban signals through the membership change only ───────────────────────
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

select * from public.ban_community_member(
  test_support.fixture_community_id(),
  test_support.fixture_user_id('member_a'),
  'suite 22 ban'
);

reset role;
select test_support.assert_eq_int(pg_temp.sent('member_a', 'COMMUNITY_MEMBERSHIP_CHANGE'), 1,
  'a ban should tell the banned user their membership changed');
select test_support.assert_eq_int(pg_temp.sent('member_a', 'member_banned'), 0,
  'a ban should no longer send the redundant member_banned event');
select test_support.assert_true(
  exists (
    select 1 from public.community_bans cb
    where cb.community_id = test_support.fixture_community_id()
      and cb.banned_user_id = test_support.fixture_user_id('member_a')
      and cb.revoked_at is null
  ),
  'the ban itself should still be recorded'
);

-- ── the self-only revocation broadcast is gone ─────────────────────────────
select test_support.assert_true(
  to_regprocedure('public.broadcast_member_channel_access_revoked(uuid, uuid, uuid)') is null,
  'broadcast_member_channel_access_revoked should be dropped'
);

rollback;
