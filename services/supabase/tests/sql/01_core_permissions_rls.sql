begin;

select test_support.note('suite 01: core community/channel/message RLS');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists test_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant all on test_ids to public;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));

select test_support.assert_query_count(
  format('select 1 from public.channels where id = %L', test_support.fixture_channel_id('general')),
  0,
  'non-member cannot view general channel row'
);

select test_support.expect_exception(
  format(
    $sql$
      insert into public.messages (community_id, channel_id, author_type, author_user_id, content)
      values (%L, %L, 'user', %L, 'unauthorized')
    $sql$,
    test_support.fixture_community_id(),
    test_support.fixture_channel_id('general'),
    test_support.fixture_user_id('non_member')
  ),
  'row-level security'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_query_count(
  format('select 1 from public.channels where id = %L', test_support.fixture_channel_id('general')),
  1,
  'member_a can view general channel row'
);

select test_support.assert_query_count(
  format('select 1 from public.channels where id = %L', test_support.fixture_channel_id('mods-only')),
  0,
  'member_a cannot view mods-only channel due overwrite'
);

create temp table tmp_member_a_message_for_mod_delete on commit drop as
with inserted as (
  insert into public.messages (community_id, channel_id, author_type, author_user_id, content)
  values (
    test_support.fixture_community_id(),
    test_support.fixture_channel_id('general'),
    'user',
    test_support.fixture_user_id('member_a'),
    'member_a message for moderator delete'
  )
  returning id
)
select id from inserted;

insert into test_ids (key, id)
select 'mod_delete_target', id from tmp_member_a_message_for_mod_delete
on conflict (key) do update set id = excluded.id;

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('server_mod'));

select test_support.assert_query_count(
  format('select 1 from public.channels where id = %L', test_support.fixture_channel_id('mods-only')),
  1,
  'server_mod can view mods-only channel'
);

select test_support.assert_true(
  public.user_has_permission(test_support.fixture_community_id(), 'manage_messages'),
  'server_mod should have manage_messages'
);

delete from public.messages
where id = (select id from test_ids where key = 'mod_delete_target');

reset role;
select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L',
    (select id::text from test_ids where key = 'mod_delete_target')
  ),
  0,
  'server_mod delete should remove target message'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_false(
  public.user_has_permission(test_support.fixture_community_id(), 'manage_messages'),
  'member_a should not have manage_messages by default'
);

create temp table tmp_member_a_self_delete on commit drop as
with inserted as (
  insert into public.messages (community_id, channel_id, author_type, author_user_id, content)
  values (
    test_support.fixture_community_id(),
    test_support.fixture_channel_id('general'),
    'user',
    test_support.fixture_user_id('member_a'),
    'member_a self-delete message'
  )
  returning id
)
select id from inserted;

insert into test_ids (key, id)
select 'self_delete_target', id from tmp_member_a_self_delete
on conflict (key) do update set id = excluded.id;
delete from public.messages
where id = (select id from test_ids where key = 'self_delete_target');

reset role;
select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L',
    (select id::text from test_ids where key = 'self_delete_target')
  ),
  0,
  'message author can self-delete own message'
);

rollback;
