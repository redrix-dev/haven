begin;

select test_support.note('suite 06: channel mention trigger notifications');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists mention_ids (
  key text primary key,
  id uuid not null
) on commit drop;

-- member_a posts a message mentioning member_b twice, self, and a non-member.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_mention_message on commit drop as
with inserted as (
  insert into public.messages (
    community_id,
    channel_id,
    author_type,
    author_user_id,
    content
  )
  values (
    test_support.fixture_community_id(),
    test_support.fixture_channel_id('general'),
    'user',
    test_support.fixture_user_id('member_a'),
    format(
      '@%s hello @%s (dup) @%s self @%s nonmember',
      test_support.fixture_username('member_b'),
      test_support.fixture_username('member_b'),
      test_support.fixture_username('member_a'),
      test_support.fixture_username('non_member')
    )
  )
  returning id
)
select id from inserted;

insert into mention_ids (key, id)
select 'message_1', id from tmp_mention_message
on conflict (key) do update set id = excluded.id;
reset role;

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'channel_mention'
      and ne.source_id = (select id from mention_ids where key = 'message_1')
      and nr.recipient_user_id = test_support.fixture_user_id('member_b')
  ),
  1,
  'duplicate mention handles should dedupe to one recipient notification'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'channel_mention'
      and ne.source_id = (select id from mention_ids where key = 'message_1')
      and nr.recipient_user_id = test_support.fixture_user_id('member_a')
  ),
  0,
  'self-mention should not notify'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'channel_mention'
      and ne.source_id = (select id from mention_ids where key = 'message_1')
      and nr.recipient_user_id = test_support.fixture_user_id('non_member')
  ),
  0,
  'non-community member mention should not notify'
);

select test_support.assert_true(
  (
    select
      (ne.payload ? 'messageId')
      and (ne.payload ? 'communityId')
      and (ne.payload ? 'channelId')
      and (ne.payload ? 'channelName')
      and (ne.payload ? 'communityName')
    from public.notification_events ne
    where ne.kind = 'channel_mention'
      and ne.source_id = (select id from mention_ids where key = 'message_1')
    limit 1
  ),
  'channel_mention payload should include route metadata'
);

-- Disable mention notifications for member_b via global prefs (Phase 4 overrides are backlogged).
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select public.update_my_notification_preferences(
  true, true,
  true, true,
  false, false
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_mention_message_2 on commit drop as
with inserted as (
  insert into public.messages (
    community_id,
    channel_id,
    author_type,
    author_user_id,
    content
  )
  values (
    test_support.fixture_community_id(),
    test_support.fixture_channel_id('general'),
    'user',
    test_support.fixture_user_id('member_a'),
    format('@%s mention should be suppressed by prefs', test_support.fixture_username('member_b'))
  )
  returning id
)
select id from inserted;

insert into mention_ids (key, id)
select 'message_2', id from tmp_mention_message_2
on conflict (key) do update set id = excluded.id;
reset role;

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'channel_mention'
      and ne.source_id = (select id from mention_ids where key = 'message_2')
      and nr.recipient_user_id = test_support.fixture_user_id('member_b')
  ),
  0,
  'global mention prefs disabled should suppress notification recipient row'
);

-- Trigger should ignore non-user author types.
create temp table tmp_non_user_author_message on commit drop as
with inserted as (
  insert into public.messages (
    community_id,
    channel_id,
    author_type,
    author_user_id,
    content
  )
  values (
    test_support.fixture_community_id(),
    test_support.fixture_channel_id('general'),
    'haven_dev',
    null,
    format('@%s should not trigger mention from haven_dev', test_support.fixture_username('member_b'))
  )
  returning id
)
select id from inserted;

insert into mention_ids (key, id)
select 'message_non_user', id from tmp_non_user_author_message
on conflict (key) do update set id = excluded.id;
select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_events ne
    where ne.kind = 'channel_mention'
      and ne.source_id = (select id from mention_ids where key = 'message_non_user')
  ),
  0,
  'non-user author_type should not produce mention notifications'
);

rollback;
