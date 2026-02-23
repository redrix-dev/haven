begin;

select test_support.note('suite 05: DM moderation review RLS + staff RPCs');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists moderation_ids (
  key text primary key,
  id uuid not null
) on commit drop;

-- Create a DM report via normal user flows.
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

create temp table tmp_mod_dm_conversation on commit drop as
select public.get_or_create_direct_dm_conversation(test_support.fixture_user_id('member_a')) as conversation_id;
insert into moderation_ids (key, id)
select 'conversation', conversation_id from tmp_mod_dm_conversation
on conflict (key) do update set id = excluded.id;
create temp table tmp_mod_dm_message on commit drop as
select * from public.send_dm_message(
  (select id from moderation_ids where key = 'conversation'),
  'reportable DM content',
  '{}'::jsonb
);

insert into moderation_ids (key, id)
select 'message', message_id from tmp_mod_dm_message
on conflict (key) do update set id = excluded.id;
reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_dm_report on commit drop as
select public.report_dm_message(
  (select id from moderation_ids where key = 'message'),
  'content_abuse',
  'Test moderation report'
) as report_id;

insert into moderation_ids (key, id)
select 'report', report_id from tmp_dm_report
on conflict (key) do update set id = excluded.id;
select test_support.assert_eq_int(
  (select count(*)::bigint from public.dm_message_reports),
  1,
  'reporter can see own DM report'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (select count(*)::bigint from public.dm_message_reports),
  0,
  'other DM participant cannot see reporter-owned dm_message_reports rows'
);

select test_support.expect_exception(
  'select * from public.list_dm_message_reports_for_review(null, 50, null, null)',
  'Only Haven staff'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_inactive'));

select test_support.expect_exception(
  'select * from public.list_dm_message_reports_for_review(null, 50, null, null)',
  'Only Haven staff'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

select test_support.assert_true(public.is_haven_moderator(auth.uid()), 'active staff fixture should be a Haven moderator');

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_dm_message_reports_for_review(null, 50, null, null)
    where report_id = (select id from moderation_ids where key = 'report')
  ),
  1,
  'active staff can list DM report for review'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.get_dm_message_report_detail((select id from moderation_ids where key = 'report'))
  ),
  1,
  'active staff can load report detail'
);

select test_support.assert_true(
  public.assign_dm_message_report(
    (select id from moderation_ids where key = 'report'),
    test_support.fixture_user_id('platform_staff_active'),
    'Taking ownership'
  ),
  'active staff can assign report'
);

-- Invalid jump (open -> resolved_actioned) should fail after hardening matrix.
select test_support.expect_exception(
  format(
    $sql$select public.update_dm_message_report_status(%L, 'resolved_actioned', 'too fast')$sql$,
    (select id from moderation_ids where key = 'report')
  ),
  'transition'
);

select test_support.assert_true(
  public.update_dm_message_report_status(
    (select id from moderation_ids where key = 'report'),
    'triaged',
    'Triaged'
  ),
  'open -> triaged should succeed'
);

select test_support.assert_true(
  public.update_dm_message_report_status(
    (select id from moderation_ids where key = 'report'),
    'in_review',
    'Investigating'
  ),
  'triaged -> in_review should succeed'
);

select test_support.assert_true(
  public.update_dm_message_report_status(
    (select id from moderation_ids where key = 'report'),
    'resolved_no_action',
    'No action required'
  ),
  'in_review -> resolved_no_action should succeed'
);

select test_support.assert_true(
  (
    select count(*)::bigint >= 3
    from public.list_dm_message_report_actions((select id from moderation_ids where key = 'report'))
  ),
  'status/assign actions should create audit trail entries'
);

select test_support.assert_true(
  (
    select count(*)::bigint >= 1
    from public.list_dm_message_context((select id from moderation_ids where key = 'message'), 5, 5)
    where is_target = true
  ),
  'active staff can load DM context including target message'
);

rollback;
