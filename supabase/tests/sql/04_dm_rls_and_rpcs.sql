begin;

select test_support.note('suite 04: DM RLS + RPCs');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists dm_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant all on dm_ids to public;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
select public.send_friend_request(test_support.fixture_username('member_b'));

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select public.accept_friend_request(
  (select fr.id from public.friend_requests fr
    where fr.sender_user_id = test_support.fixture_user_id('member_a')
      and fr.recipient_user_id = test_support.fixture_user_id('member_b')
      and fr.status = 'pending'
    limit 1)
);

create temp table tmp_dm_conversation_member_b on commit drop as
select public.get_or_create_direct_dm_conversation(test_support.fixture_user_id('member_a')) as conversation_id;

insert into dm_ids (key, id)
select 'conversation', conversation_id from tmp_dm_conversation_member_b
on conflict (key) do update set id = excluded.id;
reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_text(
  public.get_or_create_direct_dm_conversation(test_support.fixture_user_id('member_b'))::text,
  (select id::text from dm_ids where key = 'conversation'),
  'direct DM conversation should be canonical/idempotent'
);

create temp table tmp_dm_message_sent on commit drop as
select * from public.send_dm_message(
  (select id from dm_ids where key = 'conversation'),
  'hello from member_a',
  '{}'::jsonb
);

insert into dm_ids (key, id)
select 'message_1', message_id from tmp_dm_message_sent
on conflict (key) do update set id = excluded.id;
reset role;
select test_support.clear_jwt_claims();
select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'dm_message'
      and nr.recipient_user_id = test_support.fixture_user_id('member_b')
      and (ne.payload->>'conversationId')::uuid = (select id from dm_ids where key = 'conversation')
  ),
  1,
  'DM send should emit notification for recipient'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));

select test_support.expect_exception(
  format($sql$select * from public.list_dm_messages(%L, 50, null, null)$sql$, (select id from dm_ids where key = 'conversation')),
  'do not have access'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_dm_messages((select id from dm_ids where key = 'conversation'), 50, null, null)
  ),
  1,
  'DM recipient can list messages'
);

select test_support.assert_true(
  public.mark_dm_conversation_read((select id from dm_ids where key = 'conversation')),
  'recipient can mark DM conversation read'
);

select test_support.assert_true(
  public.set_dm_conversation_muted((select id from dm_ids where key = 'conversation'), true),
  'recipient can mute conversation'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_dm_message_sent_2 on commit drop as
select * from public.send_dm_message(
  (select id from dm_ids where key = 'conversation'),
  'should not notify because muted',
  '{}'::jsonb
);

insert into dm_ids (key, id)
select 'message_2', message_id from tmp_dm_message_sent_2
on conflict (key) do update set id = excluded.id;
reset role;
select test_support.clear_jwt_claims();
select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'dm_message'
      and nr.recipient_user_id = test_support.fixture_user_id('member_b')
      and ne.source_id = (select id from dm_ids where key = 'message_2')
  ),
  0,
  'muted DM conversation should suppress recipient notification rows for new messages'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select public.block_user_social(test_support.fixture_user_id('member_b'));

select test_support.expect_exception(
  format(
    $sql$select * from public.send_dm_message(%L, %L, '{}'::jsonb)$sql$,
    (select id from dm_ids where key = 'conversation'),
    'blocked send should fail'
  ),
  'cannot send'
);

rollback;
