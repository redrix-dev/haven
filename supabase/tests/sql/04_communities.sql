-- Communities: creating one, who sees it, permissions, roles and rank,
-- members, invites, bans, the audit log, handing over and deleting.
begin;

-- Asked as the superuser, about the fixture community.
create function pg_temp.can(p_user text, p_permission public.community_permission) returns boolean language sql as $$
  select private.has_permission(test_support.hearth_id(), test_support.user_id(p_user), p_permission);
$$;
create function pg_temp.is_member(p_user text) returns boolean language sql as $$
  select private.is_member(test_support.hearth_id(), test_support.user_id(p_user));
$$;
create function pg_temp.audited(p_action public.audit_action) returns bigint language sql as $$
  select count(*) from public.community_audit_log l
  where l.community_id = test_support.hearth_id() and l.action = p_action;
$$;

create temp table hearth as select test_support.hearth_id() as id;
grant select on hearth to public;

-- ── Creating ────────────────────────────────────────────────────────────────
delete from private.rate_limit_hits where true;
select test_support.become('non_member');
create temp table den as select * from public.create_community('  Den  ', '  A quiet place.  ');
grant select on den to public;
select test_support.assert_eq_text(
  (select name || '|' || description from den), 'Den|A quiet place.', 'a community is created, its words trimmed');
select test_support.assert_eq_text(
  (select owner_id::text from den), test_support.user_id('non_member')::text, 'whoever made it owns it');
select test_support.assert_query_count(
  $$ select 1 from public.community_members m
     where m.community_id = (select id from den) and m.user_id = test_support.user_id('non_member') $$, 1,
  'and is its first member');
select test_support.assert_eq_text(
  (select string_agg(r.name || ':' || r.position, ',' order by r.position)
   from public.roles r where r.community_id = (select id from den)),
  'everyone:0,Moderator:80,Admin:90', 'it starts with three roles');
select test_support.assert_eq_text(
  (select string_agg(rp.permission::text, ',' order by rp.permission)
   from public.role_permissions rp join public.roles r on r.id = rp.role_id
   where r.community_id = (select id from den) and r.is_everyone),
  'view_channels,send_messages,create_reports', 'every member may read, write and report');
select test_support.assert_eq_text(
  (select string_agg(c.name || ':' || c.kind, ',') from public.channels c where c.community_id = (select id from den)),
  'general:text', 'and one channel');
select test_support.assert_eq_int(
  (select count(*) from public.get_my_permissions((select id from den))), 14, 'the owner has every permission');
select test_support.expect_error($$ select public.create_community('   ') $$, 'name_invalid');
select test_support.expect_error($$ select public.create_community(repeat('x', 101)) $$, 'name_invalid');
select test_support.become(null);

-- Five a day.
insert into private.rate_limit_hits (user_id, action)
  select test_support.user_id('non_member'), 'create_community' from generate_series(1, 3);
select test_support.become('non_member');
select public.create_community('Den five');
select test_support.expect_error($$ select public.create_community('Den six') $$, 'rate_limited');
select test_support.become(null);
create temp table den_role as
  select r.id from public.roles r where r.community_id = (select id from den) and r.name = 'Moderator';
grant select on den_role to public;

-- ── Who can see a community ─────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.assert_eq_text(
  (select string_agg(c.name, ',') from public.communities c), 'TEST: Hearth',
  'a member sees the communities they are in and no others');
select test_support.assert_query_count($$ select 1 from public.community_members $$, 4, 'its members');
select test_support.assert_query_count($$ select 1 from public.roles $$, 3, 'its roles');
select test_support.assert_true((select count(*) from public.role_permissions) > 0, 'and what the roles allow');
select test_support.become('staff_person');
select test_support.assert_query_count($$ select 1 from public.communities $$, 0, 'a stranger sees no community');
select test_support.assert_query_count($$ select 1 from public.community_members $$, 0, 'no members');
select test_support.assert_query_count($$ select 1 from public.roles $$, 0, 'no roles');
select test_support.assert_query_count($$ select 1 from public.role_permissions $$, 0, 'no permissions');
select test_support.assert_query_count($$ select 1 from public.member_roles $$, 0, 'and not who holds what; staff are strangers here too');
select test_support.expect_error(
  $$ insert into public.community_members (community_id, user_id)
     values ((select id from hearth), test_support.user_id('staff_person')) $$, 'permission denied');
select test_support.become('owner');
select test_support.expect_error($$ update public.communities set name = 'direct' $$, 'permission denied');
select test_support.become(null);

-- ── Permissions ─────────────────────────────────────────────────────────────
select test_support.assert_true(pg_temp.can('owner', 'manage_community'), 'the owner may do anything');
select test_support.assert_true(pg_temp.can('member_a', 'send_messages'), 'a member has what the everyone role allows');
select test_support.assert_false(pg_temp.can('member_a', 'manage_messages'), 'and nothing more');
select test_support.assert_true(pg_temp.can('server_mod', 'manage_messages'), 'a role adds to it');
select test_support.assert_false(pg_temp.can('server_mod', 'manage_bans'), 'only what that role allows');
select test_support.assert_false(pg_temp.can('non_member', 'view_channels'), 'someone who is not a member has none');
select test_support.become('server_mod');
select test_support.assert_eq_text(
  (select string_agg(p::text, ',' order by p) from public.get_my_permissions((select id from hearth)) p),
  'view_channels,send_messages,manage_messages,create_reports,manage_reports,view_hidden_messages,view_audit_log',
  'an app asks once for everything it may do');
select test_support.become('non_member');
select test_support.assert_query_count(
  $$ select 1 from public.get_my_permissions((select id from hearth)) $$, 0, 'a stranger is told nothing');
select test_support.become(null);

-- ── Settings ────────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.update_community((select id from hearth), 'Mine now') $$, 'missing_permission');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.update_community((select id from hearth), 'Mine now') $$, 'community_not_found');
select test_support.become('owner');
select test_support.expect_error(
  $$ select public.update_community((select id from hearth), '   ') $$, 'name_invalid');
select test_support.assert_eq_text(
  (public.update_community((select id from hearth), null, '  New words.  ', false)).description, 'New words.',
  'the owner changes the description');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.communities c
     where c.id = (select id from hearth) and c.name = 'TEST: Hearth' and not c.invites_enabled
       and c.report_reason_required $$, 1,
  'what was not passed is left alone');
select test_support.assert_eq_int(test_support.sent('member_b', 'community.updated'), 1, 'members hear the change');
select test_support.assert_eq_int(test_support.sent('non_member', 'community.updated'), 0, 'strangers do not');
select test_support.assert_eq_int(pg_temp.audited('community_changed'), 1, 'and it is written down');
update public.communities set invites_enabled = true where id = (select id from hearth);

-- ── Roles and rank ──────────────────────────────────────────────────────────
-- member_a becomes an Admin (rank 90): every permission, but not the owner.
select test_support.become('owner');
select public.set_member_roles((select id from hearth), test_support.user_id('member_a'), array[test_support.role_id('Admin')]);
select test_support.become(null);
select test_support.clear_sent();

select test_support.become('member_a');
create temp table helper as select * from public.create_role((select id from hearth), '  Helper ', '#112233', 10);
grant select on helper to public;
select test_support.assert_eq_text(
  (select name || '|' || color || '|' || position from helper), 'Helper|#112233|10', 'a manager creates a role below them');
select test_support.expect_error(
  $$ select public.create_role((select id from hearth), 'Peer', null, 90) $$, 'outranked');
select test_support.expect_error(
  $$ select public.create_role((select id from hearth), 'Zero', null, 0) $$, 'outranked');
select test_support.expect_error($$ select public.create_role((select id from hearth), '   ') $$, 'name_invalid');
select test_support.expect_error($$ select public.update_role(test_support.role_id('Admin'), 'Renamed') $$, 'outranked');
select test_support.expect_error(
  $$ select public.update_role((select id from helper), null, null, 90) $$, 'outranked');
select test_support.assert_eq_int(
  (public.update_role((select id from helper), 'Helpers', null, 20)).position, 20, 'a role is renamed and moved');
select test_support.expect_error(
  $$ select public.update_role(test_support.role_id('everyone'), 'all') $$, 'everyone_role_fixed');
select test_support.expect_error($$ select public.delete_role(test_support.role_id('everyone')) $$, 'everyone_role_fixed');
select test_support.expect_error($$ select public.update_role(gen_random_uuid(), 'x') $$, 'role_not_found');
select test_support.become('server_mod');
select test_support.expect_error($$ select public.create_role((select id from hearth), 'X') $$, 'missing_permission');
select test_support.expect_error($$ select public.delete_role((select id from helper)) $$, 'missing_permission');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_b', 'role.created'), 1, 'members hear a role being made');
select test_support.assert_eq_int(test_support.sent('member_b', 'role.updated'), 1, 'and changed');
select test_support.assert_eq_int(test_support.sent('non_member', 'role.created'), 0, 'strangers do not');

-- What a role allows.
select test_support.clear_sent();
select test_support.become('member_a');
select public.set_role_permissions(
  (select id from helper), array['manage_messages', 'manage_invites']::public.community_permission[]);
select test_support.become(null);
select test_support.assert_eq_int(
  test_support.sent('member_b', 'access.changed'), 1, 'one "access changed" for the change, not one per permission');
select test_support.assert_eq_text(
  test_support.last_sent('member_b', 'access.changed') ->> 'community_id', (select id::text from hearth),
  'saying which community');
select test_support.become('member_a');
select public.set_role_permissions((select id from helper), array['manage_invites']::public.community_permission[]);
select test_support.expect_error(
  $$ select public.set_role_permissions(test_support.role_id('Admin'), '{}') $$, 'outranked');
select test_support.become(null);
select test_support.assert_eq_text(
  (select string_agg(rp.permission::text, ',') from public.role_permissions rp where rp.role_id = (select id from helper)),
  'manage_invites', 'setting replaces the whole set');

-- You can only hand out what you hold. member_b becomes a Deputy (rank 50)
-- who may manage roles and nothing else.
select test_support.become('member_a');
create temp table deputy as select * from public.create_role((select id from hearth), 'Deputy', null, 50);
grant select on deputy to public;
select public.set_role_permissions((select id from deputy), array['manage_roles']::public.community_permission[]);
select public.set_member_roles((select id from hearth), test_support.user_id('member_b'), array[(select id from deputy)]);
select test_support.become('member_b');
select test_support.expect_error(
  $$ select public.set_role_permissions(
       (select id from helper), array['manage_invites', 'manage_bans']::public.community_permission[]) $$, 'cannot_grant');
select public.set_role_permissions(
  (select id from helper), array['manage_invites', 'manage_roles', 'send_messages']::public.community_permission[]);
select test_support.expect_error(
  $$ select public.set_role_permissions((select id from deputy), array['manage_roles']::public.community_permission[]) $$,
  'outranked');
select test_support.expect_error(
  $$ select public.set_role_permissions(
       test_support.role_id('everyone'),
       array['view_channels', 'send_messages', 'create_reports', 'manage_bans']::public.community_permission[]) $$,
  'cannot_grant');
select public.set_role_permissions(
  test_support.role_id('everyone'), array['view_channels', 'send_messages', 'create_reports']::public.community_permission[]);
select test_support.become(null);
select test_support.assert_eq_text(
  (select string_agg(rp.permission::text, ',' order by rp.permission)
   from public.role_permissions rp where rp.role_id = (select id from helper)),
  'send_messages,manage_roles,manage_invites',
  'a permission the role already had may stay; ones the manager holds may be added');

-- Who holds which role.
select test_support.become('member_b');
select test_support.expect_error(
  $$ select public.set_member_roles((select id from hearth), test_support.user_id('server_mod'), '{}') $$, 'outranked');
select test_support.expect_error(
  $$ select public.set_member_roles((select id from hearth), test_support.user_id('member_b'),
       array[(select id from deputy), test_support.role_id('Admin')]) $$, 'outranked');
select public.set_member_roles((select id from hearth), test_support.user_id('member_b'),
  array[(select id from deputy), (select id from helper)]);
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.set_member_roles((select id from hearth), test_support.user_id('owner'), array[(select id from helper)]) $$,
  'outranked');
select test_support.expect_error(
  $$ select public.set_member_roles((select id from hearth), test_support.user_id('member_b'), array[test_support.role_id('Admin')]) $$,
  'outranked');
select test_support.expect_error(
  $$ select public.set_member_roles((select id from hearth), test_support.user_id('member_b'), array[test_support.role_id('everyone')]) $$,
  'role_not_found');
select test_support.expect_error(
  $$ select public.set_member_roles((select id from hearth), test_support.user_id('member_b'), array[(select id from den_role)]) $$,
  'role_not_found');
select test_support.expect_error(
  $$ select public.set_member_roles((select id from hearth), test_support.user_id('staff_person'), array[(select id from helper)]) $$,
  'member_not_found');
select public.set_member_roles((select id from hearth), test_support.user_id('member_b'), array[(select id from helper)]);
select test_support.become(null);
select test_support.assert_eq_text(
  (select string_agg(r.name, ',') from public.member_roles mr join public.roles r on r.id = mr.role_id
   where mr.user_id = test_support.user_id('member_b')),
  'Helpers', 'setting a member''s roles replaces the whole set');
select test_support.become('member_a');
select public.delete_role((select id from deputy));
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.roles r where r.id = (select id from deputy) $$, 0, 'a role is deleted');
select test_support.assert_eq_int(test_support.sent('server_mod', 'role.deleted'), 1, 'and members hear it go');
select test_support.assert_true(pg_temp.audited('roles_assigned') >= 4, 'role changes are written down');

-- ── Nicknames ───────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('server_mod');
select test_support.assert_eq_text(
  (public.set_nickname((select id from hearth), test_support.user_id('server_mod'), '  Mod  ')).nickname, 'Mod',
  'anyone names themselves');
select test_support.assert_true(
  (public.set_nickname((select id from hearth), test_support.user_id('server_mod'), '')).nickname is null,
  'an empty nickname clears it');
select test_support.expect_error(
  $$ select public.set_nickname((select id from hearth), test_support.user_id('server_mod'), repeat('x', 33)) $$,
  'nickname_invalid');
select test_support.expect_error(
  $$ select public.set_nickname((select id from hearth), test_support.user_id('member_b'), 'Nope') $$, 'missing_permission');
select test_support.become('member_a');
select test_support.assert_eq_text(
  (public.set_nickname((select id from hearth), test_support.user_id('member_b'), 'Bee')).nickname, 'Bee',
  'a manager names someone below them');
select test_support.expect_error(
  $$ select public.set_nickname((select id from hearth), test_support.user_id('owner'), 'Boss') $$, 'outranked');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.set_nickname((select id from hearth), test_support.user_id('non_member'), 'Hi') $$, 'community_not_found');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_b', 'member.updated'), 3, 'members hear each change');

-- ── Invites ─────────────────────────────────────────────────────────────────
select test_support.become('owner');
create temp table once as select * from public.create_invite((select id from hearth), 1, 2);
grant select on once to public;
select test_support.assert_true(
  (select code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$' from once), 'a code is ten characters with no look-alikes');
select test_support.assert_true(
  (select expires_at = now() + interval '2 hours' from once), 'it lasts as long as asked');
select test_support.expect_error($$ select public.create_invite((select id from hearth), 0) $$, 'max_uses_invalid');
select test_support.expect_error($$ select public.create_invite((select id from hearth), null, 0) $$, 'expiry_invalid');
select test_support.assert_true(
  (public.create_invite((select id from hearth), null, null)).expires_at is null, 'no hours means it does not expire');
select test_support.assert_query_count($$ select 1 from public.invites $$, 3, 'invite managers list the invites');
select test_support.become('server_mod');
select test_support.expect_error($$ select public.create_invite((select id from hearth)) $$, 'missing_permission');
select test_support.assert_query_count($$ select 1 from public.invites $$, 0, 'other members cannot');
select test_support.become(null);

select test_support.clear_sent();
select test_support.become('non_member');
select test_support.expect_error($$ select public.join_community('NOPE') $$, 'invite_invalid');
select test_support.assert_eq_text(
  (public.join_community('  ' || lower((select code from once)) || ' ')).id::text, (select id::text from hearth),
  'a code works however it was typed');
select public.join_community((select code from once)); -- already in
select test_support.become(null);
select test_support.assert_true(pg_temp.is_member('non_member'), 'and makes the person a member');
select test_support.assert_eq_int(
  (select i.uses from public.invites i where i.id = (select id from once)), 1, 'joining twice uses the invite once');
select test_support.assert_eq_int(test_support.sent('member_b', 'member.joined'), 1, 'members hear someone arrive');
select test_support.assert_eq_int(test_support.sent('non_member', 'member.joined'), 1, 'and so does the person arriving');

select test_support.become('staff_person');
select test_support.expect_error($$ select public.join_community((select code from once)) $$, 'invite_invalid');
select test_support.become(null);
update public.invites set max_uses = null, expires_at = now() - interval '1 minute' where id = (select id from once);
select test_support.become('staff_person');
select test_support.expect_error($$ select public.join_community((select code from once)) $$, 'invite_invalid');
select test_support.become(null);
update public.invites set expires_at = null where id = (select id from once);
update public.communities set invites_enabled = false where id = (select id from hearth);
select test_support.become('staff_person');
select test_support.expect_error($$ select public.join_community((select code from once)) $$, 'invite_invalid');
select test_support.become(null);
update public.communities set invites_enabled = true where id = (select id from hearth);
-- Used up, expired and paused all read the same from outside. Revoked too:
select test_support.become('server_mod');
select test_support.expect_error($$ select public.revoke_invite((select id from once)) $$, 'missing_permission');
select test_support.become('owner');
select public.revoke_invite((select id from once));
select public.revoke_invite((select id from once));
select test_support.become('staff_person');
select test_support.expect_error($$ select public.join_community((select code from once)) $$, 'invite_invalid');
select test_support.become(null);
select test_support.assert_false(pg_temp.is_member('staff_person'), 'none of those let anyone in');

-- ── Removing a member ───────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('server_mod');
select test_support.expect_error(
  $$ select public.kick_member((select id from hearth), test_support.user_id('non_member')) $$, 'missing_permission');
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.kick_member((select id from hearth), test_support.user_id('owner')) $$, 'outranked');
select test_support.expect_error(
  $$ select public.kick_member((select id from hearth), test_support.user_id('staff_person')) $$, 'member_not_found');
select public.kick_member((select id from hearth), test_support.user_id('non_member'));
select test_support.become(null);
select test_support.assert_false(pg_temp.is_member('non_member'), 'a manager removes a member below them');
select test_support.assert_eq_int(test_support.sent('non_member', 'member.left'), 1, 'the person removed is told');
select test_support.assert_eq_int(test_support.sent('member_b', 'member.left'), 1, 'and so are the members');
select test_support.assert_eq_int(pg_temp.audited('member_kicked'), 1, 'and it is written down');

select test_support.become('owner');
create temp table door as select * from public.create_invite((select id from hearth));
grant select on door to public;
select test_support.become('non_member');
select public.join_community((select code from door));
select test_support.become(null);
select test_support.assert_true(pg_temp.is_member('non_member'), 'being removed is not a ban: they can come back');

-- ── Bans ────────────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('server_mod');
select test_support.expect_error(
  $$ select public.ban_member((select id from hearth), test_support.user_id('non_member'), 'no') $$, 'missing_permission');
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.ban_member((select id from hearth), test_support.user_id('non_member'), '   ') $$, 'reason_invalid');
select test_support.expect_error(
  $$ select public.ban_member((select id from hearth), test_support.user_id('owner'), 'coup') $$, 'outranked');
select test_support.expect_error(
  $$ select public.ban_member((select id from hearth), test_support.user_id('member_a'), 'me') $$, 'user_not_found');
select public.ban_member((select id from hearth), test_support.user_id('non_member'), '  spam ');
select test_support.expect_error(
  $$ select public.ban_member((select id from hearth), test_support.user_id('non_member'), 'again') $$, 'already_banned');
select public.ban_member((select id from hearth), test_support.user_id('stranger'), 'known troublemaker');
select test_support.assert_query_count($$ select 1 from public.community_bans $$, 2, 'ban managers see the bans');
select test_support.become('server_mod');
select test_support.assert_query_count($$ select 1 from public.community_bans $$, 0, 'other members do not');
select test_support.become(null);
select test_support.assert_false(pg_temp.is_member('non_member'), 'a ban removes the member');
select test_support.assert_query_count(
  $$ select 1 from public.community_bans b
     where b.user_id = test_support.user_id('non_member') and b.reason = 'spam'
       and b.banned_by = test_support.user_id('member_a') $$, 1, 'and records who and why');
select test_support.assert_eq_int(pg_temp.audited('member_banned'), 2, 'someone who is not a member can be banned too');
select test_support.assert_eq_int(test_support.sent('non_member', 'member.left'), 1, 'the banned member is told they are out');
select test_support.assert_eq_int(test_support.sent('member_b', 'member.banned'), 2, 'members hear each ban');

select test_support.become('non_member');
select test_support.expect_error($$ select public.join_community((select code from door)) $$, 'banned');
select test_support.become('server_mod');
select test_support.expect_error(
  $$ select public.unban_member((select id from hearth), test_support.user_id('non_member')) $$, 'missing_permission');
select test_support.become('member_a');
select public.unban_member((select id from hearth), test_support.user_id('non_member'));
select public.unban_member((select id from hearth), test_support.user_id('non_member'));
select test_support.become(null);
select test_support.assert_eq_int(pg_temp.audited('member_unbanned'), 1, 'lifting a ban is written down, once');
select test_support.assert_eq_int(test_support.sent('member_b', 'member.unbanned'), 1, 'and heard');
select test_support.become('non_member');
select public.join_community((select code from door));
select test_support.become(null);
select test_support.assert_true(pg_temp.is_member('non_member'), 'and lets them back in');

-- ── The record of what moderators did ───────────────────────────────────────
select test_support.become('server_mod');
select test_support.assert_true(
  (select count(*) from public.community_audit_log) > 0, 'someone with view_audit_log reads it');
select test_support.become('non_member');
select test_support.assert_query_count($$ select 1 from public.community_audit_log $$, 0, 'a member without it does not');
select test_support.become('owner');
select test_support.expect_error($$ delete from public.community_audit_log $$, 'permission denied');
select test_support.expect_error(
  $$ update public.community_audit_log set detail = '{}' $$, 'permission denied');
select test_support.become(null);

-- ── Leaving ─────────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('non_member');
select public.leave_community((select id from hearth));
select test_support.become('owner');
select test_support.expect_error($$ select public.leave_community((select id from hearth)) $$, 'owner_cannot_leave');
select test_support.become(null);
select test_support.assert_false(pg_temp.is_member('non_member'), 'a member leaves');
select test_support.assert_eq_int(test_support.sent('member_b', 'member.left'), 1, 'and the others hear');
-- The owner is always a member, whatever path tries to remove them.
select test_support.expect_error(
  $$ delete from public.community_members m
     where m.community_id = (select id from hearth) and m.user_id = test_support.user_id('owner');
     set constraints all immediate $$, 'communities_owner_is_member');

-- ── Handing over ────────────────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.transfer_ownership((select id from hearth), test_support.user_id('member_a')) $$, 'owner_only');
select test_support.become('owner');
select test_support.expect_error(
  $$ select public.transfer_ownership((select id from hearth), test_support.user_id('staff_person')) $$, 'member_not_found');
select test_support.assert_eq_text(
  (public.transfer_ownership((select id from hearth), test_support.user_id('member_a'))).owner_id::text,
  test_support.user_id('member_a')::text, 'the owner hands the community to a member');
select test_support.become(null);
select test_support.assert_false(pg_temp.can('owner', 'manage_community'), 'the old owner is an ordinary member now');
select test_support.assert_eq_int(pg_temp.audited('ownership_transferred'), 1, 'and it is written down');
select test_support.assert_true(test_support.sent('member_b', 'access.changed') >= 1, 'members are told access changed');
select test_support.become('owner');
select public.leave_community((select id from hearth));
select test_support.become(null);
select test_support.assert_false(pg_temp.is_member('owner'), 'and may leave');

-- ── Categories and channels ─────────────────────────────────────────────────
-- member_a owns the community from here on.
select test_support.clear_sent();
create temp table audit_before as select pg_temp.audited('channel_changed') as n;
select test_support.become('member_a');
create temp table cat as select * from public.save_category((select id from hearth), '  Rooms ', 2);
grant select on cat to public;
select test_support.assert_eq_text((select name from cat), 'Rooms', 'a category is made');
select test_support.assert_eq_text(
  (public.save_category((select id from hearth), 'Lounges', 3, (select id from cat))).name, 'Lounges', 'and renamed');
select test_support.expect_error($$ select public.save_category((select id from hearth), '  ') $$, 'name_invalid');
select test_support.expect_error(
  $$ select public.save_category((select id from hearth), 'X', 0, gen_random_uuid()) $$, 'category_not_found');

create temp table plans as
  select * from public.create_channel((select id from hearth), 'text', ' plans ', ' What next. ', (select id from cat));
grant select on plans to public;
select test_support.assert_eq_text(
  (select name || '|' || topic || '|' || (category_id = (select id from cat)) from plans), 'plans|What next.|true',
  'a channel is made in a category');
select test_support.expect_error($$ select public.create_channel((select id from hearth), 'dm', 'x') $$, 'kind_invalid');
select test_support.expect_error($$ select public.create_channel((select id from hearth), 'text', '  ') $$, 'name_invalid');
select test_support.expect_error(
  $$ select public.create_channel((select id from hearth), 'text', 'x', null, gen_random_uuid()) $$, 'category_not_found');
select test_support.assert_true(
  (public.update_channel((select id from plans), 'plans-2', '')).topic is null, 'renamed; an empty topic clears it');
select test_support.assert_eq_text(
  (select c.position || '|' || (c.category_id is null)
   from public.move_channel((select id from plans), null, 7) c), '7|true', 'and moved out of the category');

select test_support.become('member_b');
select test_support.expect_error($$ select public.save_category((select id from hearth), 'Mine') $$, 'missing_permission');
select test_support.expect_error($$ select public.update_channel((select id from plans), 'mine') $$, 'missing_permission');
select test_support.expect_error($$ select public.delete_channel((select id from plans)) $$, 'missing_permission');
select test_support.expect_error(
  $$ select public.update_channel(test_support.channel_id('staff-room'), 'mine') $$, 'channel_not_found');
select public.set_category_collapsed((select id from cat), true);
select public.set_category_collapsed((select id from cat), true);
select test_support.assert_query_count($$ select 1 from public.collapsed_categories $$, 1, 'a member folds a category shut');
select test_support.become('server_mod');
select test_support.assert_query_count($$ select 1 from public.collapsed_categories $$, 0, 'which is theirs alone');
select test_support.become('member_b');
select public.set_category_collapsed((select id from cat), false);
select test_support.assert_query_count($$ select 1 from public.collapsed_categories $$, 0, 'and opens it again');
select test_support.become('staff_person');
select test_support.expect_error(
  $$ select public.set_category_collapsed((select id from cat), true) $$, 'category_not_found');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_b', 'category.created'), 1, 'members hear a category made');
select test_support.assert_eq_int(test_support.sent('member_b', 'category.updated'), 1, 'and changed');
select test_support.assert_eq_int(test_support.sent('member_b', 'channel.created'), 1, 'a channel made');
select test_support.assert_eq_int(test_support.sent('member_b', 'channel.updated'), 2, 'and each change to it');
select test_support.assert_eq_int(test_support.sent('staff_person', 'channel.created'), 0, 'strangers hear none of it');

select test_support.become('member_a');
select public.delete_channel((select id from plans));
select public.delete_category((select id from cat));
select public.delete_category((select id from cat));
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('member_b', 'channel.deleted'), 1, 'a channel is deleted');
select test_support.assert_eq_int(test_support.sent('member_b', 'category.deleted'), 1, 'and a category');
select test_support.assert_eq_int(
  pg_temp.audited('channel_changed') - (select n from audit_before), 7,
  'each change to a category or channel is written down: made, renamed, made, edited, moved, deleted, deleted');

-- ── Deleting the community ──────────────────────────────────────────────────
select test_support.become('member_b');
select public.send_message(test_support.channel_id('general'), 'last words');
select test_support.become(null);
select test_support.clear_sent();
select test_support.become('server_mod');
select test_support.expect_error($$ select public.delete_community((select id from hearth)) $$, 'owner_only');
select test_support.become('staff_person');
select test_support.expect_error($$ select public.delete_community((select id from hearth)) $$, 'community_not_found');
select test_support.become('member_a');
select public.delete_community((select id from hearth));
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.communities c where c.id = (select id from hearth) $$, 0, 'the owner deletes the community');
select test_support.assert_query_count(
  $$ select 1 from public.community_members m where m.community_id = (select id from hearth) $$, 0, 'its members');
select test_support.assert_query_count(
  $$ select 1 from public.channels c where c.community_id = (select id from hearth) $$, 0, 'its channels');
select test_support.assert_query_count(
  $$ select 1 from public.messages m where m.body = 'last words' $$, 0, 'and everything said in them go with it');
select test_support.assert_eq_int(test_support.sent('member_b', 'community.deleted'), 1, 'members are told once');
select test_support.assert_eq_int(test_support.sent('member_b', 'member.left'), 0, 'not once per member');
select test_support.assert_eq_int(test_support.sent('member_b', 'channel.deleted'), 0, 'or per channel');
select test_support.assert_eq_int(test_support.sent('member_b', 'member.unbanned'), 0, 'or per ban that went with it');

rollback;
