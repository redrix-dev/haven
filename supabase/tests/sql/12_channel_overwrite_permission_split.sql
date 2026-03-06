begin;

select test_support.note('suite 12: channel structure vs overwrite permission split');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists split_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant all on split_ids to public;

insert into split_ids (key, id)
values ('general_channel', test_support.fixture_channel_id('general'))
on conflict (key) do update set id = excluded.id;

insert into split_ids (key, id)
values ('member_b', test_support.fixture_member_id('member_b'))
on conflict (key) do update set id = excluded.id;

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.role_permissions rp_manage
    left join public.role_permissions rp_permissions
      on rp_permissions.role_id = rp_manage.role_id
     and rp_permissions.permission_key = 'manage_channel_permissions'
    where rp_manage.permission_key = 'manage_channels'
      and rp_permissions.role_id is null
  ),
  0,
  'existing roles with manage_channels should also include manage_channel_permissions'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

create temp table tmp_structure_role on commit drop as
insert into public.roles (
  community_id,
  name,
  color,
  position,
  is_default,
  is_system
)
values (
  test_support.fixture_community_id(),
  'Split Structure Manager',
  '#4f8df7',
  60,
  false,
  false
)
returning id;

insert into split_ids (key, id)
select 'structure_role', id from tmp_structure_role
on conflict (key) do update set id = excluded.id;

create temp table tmp_target_role on commit drop as
insert into public.roles (
  community_id,
  name,
  color,
  position,
  is_default,
  is_system
)
values (
  test_support.fixture_community_id(),
  'Split Target Role',
  '#d88a2b',
  10,
  false,
  false
)
returning id;

insert into split_ids (key, id)
select 'target_role', id from tmp_target_role
on conflict (key) do update set id = excluded.id;

insert into public.role_permissions (role_id, permission_key)
values ((select id from split_ids where key = 'structure_role'), 'manage_channels')
on conflict (role_id, permission_key) do nothing;

insert into public.member_roles (community_id, member_id, role_id, assigned_by_user_id)
values (
  test_support.fixture_community_id(),
  test_support.fixture_member_id('member_a'),
  (select id from split_ids where key = 'structure_role'),
  test_support.fixture_user_id('community_owner')
)
on conflict (member_id, role_id) do nothing;

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_true(
  public.user_has_permission(test_support.fixture_community_id(), 'manage_channels'),
  'member_a should have manage_channels through split structure role'
);

select test_support.assert_false(
  public.user_has_permission(test_support.fixture_community_id(), 'manage_channel_permissions'),
  'member_a should not have manage_channel_permissions before backfill grant'
);

update public.channels
set name = 'general_split_check'
where id = (select id from split_ids where key = 'general_channel');

select test_support.assert_query_count(
  format(
    'select 1 from public.channels where id = %L and name = %L',
    (select id::text from split_ids where key = 'general_channel'),
    'general_split_check'
  ),
  1,
  'manage_channels should still allow channel structure edits'
);

update public.channels
set name = 'general'
where id = (select id from split_ids where key = 'general_channel');

select test_support.expect_exception(
  format(
    $sql$
      insert into public.channel_role_overwrites (
        community_id,
        channel_id,
        role_id,
        can_view,
        can_send,
        can_manage
      )
      values (%L, %L, %L, true, true, null)
      on conflict (channel_id, role_id) do update
      set can_view = excluded.can_view,
          can_send = excluded.can_send,
          can_manage = excluded.can_manage
    $sql$,
    test_support.fixture_community_id(),
    (select id::text from split_ids where key = 'general_channel'),
    (select id::text from split_ids where key = 'target_role')
  ),
  'row-level security'
);

select test_support.expect_exception(
  format(
    $sql$
      insert into public.channel_member_overwrites (
        community_id,
        channel_id,
        member_id,
        can_view,
        can_send,
        can_manage
      )
      values (%L, %L, %L, true, true, null)
      on conflict (channel_id, member_id) do update
      set can_view = excluded.can_view,
          can_send = excluded.can_send,
          can_manage = excluded.can_manage
    $sql$,
    test_support.fixture_community_id(),
    (select id::text from split_ids where key = 'general_channel'),
    (select id::text from split_ids where key = 'member_b')
  ),
  'row-level security'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

insert into public.role_permissions (role_id, permission_key)
select rp.role_id, 'manage_channel_permissions'
from public.role_permissions rp
where rp.permission_key = 'manage_channels'
  and rp.role_id = (select id from split_ids where key = 'structure_role')
on conflict (role_id, permission_key) do nothing;

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_true(
  public.user_has_permission(test_support.fixture_community_id(), 'manage_channel_permissions'),
  'member_a should gain manage_channel_permissions after backfill grant'
);

insert into public.channel_role_overwrites (
  community_id,
  channel_id,
  role_id,
  can_view,
  can_send,
  can_manage
)
values (
  test_support.fixture_community_id(),
  (select id from split_ids where key = 'general_channel'),
  (select id from split_ids where key = 'target_role'),
  true,
  true,
  null
)
on conflict (channel_id, role_id) do update
set can_view = excluded.can_view,
    can_send = excluded.can_send,
    can_manage = excluded.can_manage;

insert into public.channel_member_overwrites (
  community_id,
  channel_id,
  member_id,
  can_view,
  can_send,
  can_manage
)
values (
  test_support.fixture_community_id(),
  (select id from split_ids where key = 'general_channel'),
  (select id from split_ids where key = 'member_b'),
  true,
  true,
  null
)
on conflict (channel_id, member_id) do update
set can_view = excluded.can_view,
    can_send = excluded.can_send,
    can_manage = excluded.can_manage;

reset role;

select test_support.assert_query_count(
  format(
    'select 1 from public.channel_role_overwrites where channel_id = %L and role_id = %L',
    (select id::text from split_ids where key = 'general_channel'),
    (select id::text from split_ids where key = 'target_role')
  ),
  1,
  'role overwrite mutation should succeed with manage_channel_permissions'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.channel_member_overwrites where channel_id = %L and member_id = %L',
    (select id::text from split_ids where key = 'general_channel'),
    (select id::text from split_ids where key = 'member_b')
  ),
  1,
  'member overwrite mutation should succeed with manage_channel_permissions'
);

rollback;
