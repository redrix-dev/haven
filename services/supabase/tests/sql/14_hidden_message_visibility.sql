begin;

select test_support.note('suite 14: hidden message visibility and child-table cascade');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists test_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant all on test_ids to public;

reset role;
insert into public.role_permissions (role_id, permission_key)
values (test_support.fixture_role_id('moderator'), 'can_view_ban_hidden')
on conflict (role_id, permission_key) do nothing;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

set local role service_role;

create temp table tmp_hidden_message on commit drop as
with inserted as (
  insert into public.messages (community_id, channel_id, author_type, author_user_id, content)
  values (
    test_support.fixture_community_id(),
    test_support.fixture_channel_id('general'),
    'user',
    test_support.fixture_user_id('member_a'),
    'message hidden by ban'
  )
  returning id
)
select id from inserted;

insert into test_ids (key, id)
select 'hidden_message', id from tmp_hidden_message
on conflict (key) do update set id = excluded.id;

insert into public.message_reactions (message_id, community_id, channel_id, user_id, emoji)
values (
  (select id from test_ids where key = 'hidden_message'),
  test_support.fixture_community_id(),
  test_support.fixture_channel_id('general'),
  test_support.fixture_user_id('member_b'),
  'fire'
);

insert into public.message_attachments (
  message_id,
  community_id,
  channel_id,
  owner_user_id,
  object_path,
  original_filename,
  mime_type,
  media_kind,
  size_bytes,
  expires_at
)
values (
  (select id from test_ids where key = 'hidden_message'),
  test_support.fixture_community_id(),
  test_support.fixture_channel_id('general'),
  test_support.fixture_user_id('member_b'),
  'tests/hidden-message-attachment.png',
  'hidden-message-attachment.png',
  'image/png',
  'image',
  512,
  timezone('utc', now()) + interval '1 day'
);

insert into public.message_link_previews (
  message_id,
  community_id,
  channel_id,
  source_url,
  normalized_url,
  status
)
values (
  (select id from test_ids where key = 'hidden_message'),
  test_support.fixture_community_id(),
  test_support.fixture_channel_id('general'),
  'https://hidden-message.example.test',
  'https://hidden-message.example.test',
  'ready'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'member_b can view the message before ban'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_reactions where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'member_b can view reactions before ban'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_attachments where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'member_b can view attachments before ban'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_link_previews where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'member_b can view link previews before ban'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

select test_support.assert_true(
  public.user_has_permission(test_support.fixture_community_id(), 'can_view_ban_hidden'),
  'owner should receive can_view_ban_hidden by default'
);

select *
from public.ban_community_member(
  test_support.fixture_community_id(),
  test_support.fixture_user_id('member_a'),
  'hidden message visibility test'
);

reset role;
select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L and is_hidden = true',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'ban marks the target message hidden'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  0,
  'regular member cannot view hidden banned message'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_reactions where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  0,
  'regular member cannot view reactions for hidden message'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_attachments where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  0,
  'regular member cannot view attachments for hidden message'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_link_previews where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  0,
  'regular member cannot view link previews for hidden message'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('server_mod'));

select test_support.assert_true(
  public.user_has_permission(test_support.fixture_community_id(), 'can_view_ban_hidden'),
  'server_mod should have can_view_ban_hidden after explicit role grant'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'role with can_view_ban_hidden can still view hidden banned message'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_reactions where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'role with can_view_ban_hidden can view reactions for hidden message'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_attachments where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'role with can_view_ban_hidden can view attachments for hidden message'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_link_previews where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'role with can_view_ban_hidden can view link previews for hidden message'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

select public.unban_community_member(
  test_support.fixture_community_id(),
  test_support.fixture_user_id('member_a'),
  'allow rejoin'
);

reset role;
select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L and is_hidden = true',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'unban alone does not unhide messages before membership is restored'
);

update public.community_settings
set allow_public_invites = true
where community_id = test_support.fixture_community_id();

insert into public.invites (
  community_id,
  code,
  created_by_user_id,
  expires_at,
  is_active
)
values (
  test_support.fixture_community_id(),
  'HIDDEN14REJOIN',
  test_support.fixture_user_id('community_owner'),
  timezone('utc', now()) + interval '1 day',
  true
)
on conflict (code) do update
set
  community_id = excluded.community_id,
  created_by_user_id = excluded.created_by_user_id,
  expires_at = excluded.expires_at,
  is_active = excluded.is_active,
  current_uses = 0,
  max_uses = null;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_true(
  exists (
    select 1
    from public.redeem_community_invite('HIDDEN14REJOIN') redeemed
    where redeemed.community_id = test_support.fixture_community_id()
      and redeemed.joined = true
  ),
  'member_a can rejoin through invite redemption after unban'
);

reset role;
select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L and is_hidden = false',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'rejoin restores hidden messages once the ban is revoked'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_query_count(
  format(
    'select 1 from public.messages where id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'regular member can view the message again after unban and rejoin'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_reactions where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'reactions reappear after unban and rejoin'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_attachments where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'attachments reappear after unban and rejoin'
);

select test_support.assert_query_count(
  format(
    'select 1 from public.message_link_previews where message_id = %L',
    (select id::text from test_ids where key = 'hidden_message')
  ),
  1,
  'link previews reappear after unban and rejoin'
);

rollback;
