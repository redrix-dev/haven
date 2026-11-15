-- Reports to a community's moderators: filing, who reads them, working them,
-- and handing one to Haven staff.
begin;

delete from public.notifications where true;
delete from private.rate_limit_hits where true;
delete from private.jobs where true;

create function pg_temp.say(p_user text, p_channel text, p_body text) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  perform test_support.become(p_user);
  v_id := (public.send_message(test_support.channel_id(p_channel), p_body)).id;
  perform test_support.become(null);
  return v_id;
end;
$$;

-- Five lines in #general; member_b said the third, member_a the rest.
create temp table talk as
  select n, pg_temp.say(case when n = 3 then 'member_b' else 'member_a' end, 'general', 'line ' || n) as id
  from generate_series(1, 5) n;
grant select on talk to public;
create temp table hidden_talk as select pg_temp.say('server_mod', 'staff-room', 'mods only') as id;
grant select on hidden_talk to public;
select test_support.clear_sent();

-- ── Filing ──────────────────────────────────────────────────────────────────
select test_support.become('member_a');
create temp table report as
  select public.file_community_report(
    test_support.hearth_id(), 'message', (select id from talk where n = 3), '  Rude.  ') as id;
grant select on report to public;
select test_support.assert_eq_text(
  public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 3), 'Still rude.')::text,
  (select id::text from report), 'a second tap returns the report that is already open');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 1), 'x') $$,
  'cannot_report_self');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'message', gen_random_uuid(), 'x') $$,
  'message_not_found');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'message', (select id from hidden_talk), 'x') $$,
  'message_not_found');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 3), '  ') $$,
  'reason_required');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'member', test_support.user_id('staff_active'), 'x') $$,
  'member_not_found');
select test_support.expect_error($$ select * from public.community_reports $$, 'permission denied');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 3), 'x') $$,
  'community_not_found');
select test_support.become(null);

select test_support.assert_query_count(
  $$ select 1 from public.community_reports r
     where r.id = (select id from report)
       and r.reporter_id = test_support.user_id('member_a') and r.subject_user_id = test_support.user_id('member_b')
       and r.subject_message_id = (select id from talk where n = 3) and r.reason = 'Rude.' and r.status = 'open' $$,
  1, 'the report records who, about whom, about what and why');
select test_support.assert_eq_text(
  (select (r.snapshot -> 'message' ->> 'body') || '|' || (r.snapshot -> 'author' ->> 'username') || '|'
          || (r.snapshot -> 'channel' ->> 'name') || '|' || (r.snapshot -> 'community' ->> 'name') || '|'
          || jsonb_array_length(r.snapshot -> 'context')
   from public.community_reports r where r.id = (select id from report)),
  'line 3|rls_member_b|general|TEST: Hearth|4',
  'the database wrote down what was said, by whom, where, and the messages around it');

select test_support.assert_eq_int(test_support.sent('server_mod', 'report.created'), 1, 'a moderator hears a new report');
select test_support.assert_eq_int(test_support.sent('owner', 'report.created'), 1, 'so does the owner');
select test_support.assert_eq_int(test_support.sent('member_a', 'report.created'), 0, 'ordinary members do not');
select test_support.assert_eq_int(test_support.sent('member_b', 'report.created'), 0, 'least of all the person reported');
select test_support.assert_false(
  test_support.last_sent('server_mod', 'report.created') ? 'reporter_id', 'the event does not say who filed it');

-- A report about a member, and one with no reason where the community allows that.
select test_support.become('member_b');
create temp table member_report as
  select public.file_community_report(
    test_support.hearth_id(), 'member', test_support.user_id('member_a'), 'Spams invites.') as id;
grant select on member_report to public;
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.community_reports r
     where r.id = (select id from member_report) and r.subject_message_id is null
       and r.snapshot -> 'member' ->> 'username' = 'rls_member_a' $$, 1,
  'a member can be reported, with who they were at the time');
update public.communities set report_reason_required = false where id = test_support.hearth_id();
select test_support.become('member_b');
select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 1));
select test_support.become(null);
update public.communities set report_reason_required = true where id = test_support.hearth_id();

-- Reporting is a permission.
select test_support.become('owner');
select public.set_role_permissions(
  test_support.role_id('everyone'), array['view_channels', 'send_messages']::public.community_permission[]);
select test_support.become('member_b');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 2), 'x') $$,
  'missing_permission');
select test_support.become('owner');
select public.set_role_permissions(
  test_support.role_id('everyone'), array['view_channels', 'send_messages', 'create_reports']::public.community_permission[]);
select test_support.become(null);

-- ── Reading ─────────────────────────────────────────────────────────────────
select test_support.become('server_mod');
select test_support.assert_query_count(
  $$ select 1 from public.list_community_reports(test_support.hearth_id()) $$, 3, 'a moderator lists the reports');
select test_support.assert_false(
  (select to_jsonb(r) ? 'reporter_id' from public.list_community_reports(test_support.hearth_id()) r limit 1),
  'without being told who filed them');
select test_support.become('member_a');
select test_support.expect_error(
  $$ select * from public.list_community_reports(test_support.hearth_id()) $$, 'missing_permission');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select * from public.list_community_reports(test_support.hearth_id()) $$, 'community_not_found');
select test_support.become(null);

-- Nobody handles a report about themselves, moderator or not.
select test_support.clear_sent();
select test_support.become('member_a');
create temp table about_mod as
  select public.file_community_report(
    test_support.hearth_id(), 'member', test_support.user_id('server_mod'), 'Heavy handed.') as id;
grant select on about_mod to public;
select test_support.become('server_mod');
select test_support.assert_query_count(
  $$ select 1 from public.list_community_reports(test_support.hearth_id()) $$, 3,
  'a moderator does not see the report about them');
select test_support.expect_error(
  $$ select public.set_community_report_status((select id from about_mod), 'dismissed') $$, 'report_not_found');
select test_support.expect_error(
  $$ select public.escalate_community_report((select id from about_mod)) $$, 'report_not_found');
select test_support.become('owner');
select test_support.assert_query_count(
  $$ select 1 from public.list_community_reports(test_support.hearth_id()) $$, 4, 'the owner does');
select public.add_community_report_note((select id from about_mod), 'Will talk to them.');
select test_support.assert_query_count($$ select 1 from public.community_report_notes $$, 1, 'and can read the notes on it');
select test_support.become('server_mod');
select test_support.assert_query_count(
  $$ select 1 from public.community_report_notes $$, 0, 'which the moderator it is about cannot');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('server_mod', 'report.created'), 0, 'nor do they hear it arrive');
select test_support.assert_eq_int(test_support.sent('owner', 'report.created'), 1, 'while the owner does');

-- ── Working a report ────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('server_mod');
select public.set_community_report_status((select id from report), 'in_review');
select test_support.expect_error(
  $$ select public.set_community_report_status((select id from report), 'escalated') $$, 'report_escalated');
select test_support.assert_eq_text(
  (public.add_community_report_note((select id from report), '  Spoke to them. ')).body, 'Spoke to them.', 'a note is added');
select test_support.expect_error(
  $$ select public.add_community_report_note((select id from report), '   ') $$, 'note_invalid');
select test_support.assert_query_count($$ select 1 from public.community_report_notes $$, 1, 'moderators read the notes');
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.set_community_report_status((select id from report), 'resolved') $$, 'report_not_found');
select test_support.expect_error(
  $$ select public.add_community_report_note((select id from report), 'mine') $$, 'report_not_found');
select test_support.assert_query_count(
  $$ select 1 from public.community_report_notes $$, 0, 'the person who filed it does not read the notes');
select test_support.become(null);
select test_support.assert_eq_int(
  test_support.sent('owner', 'report.updated'), 2, 'the other moderators hear the status change and the note');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n where n.kind = 'report_outcome' $$, 0, 'in review is not an outcome yet');

select test_support.become('server_mod');
select public.set_community_report_status((select id from report), 'resolved');
select public.set_community_report_status((select id from report), 'dismissed');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'report_outcome' and n.recipient_id = test_support.user_id('member_a')
       and n.body = 'The moderators of TEST: Hearth reviewed your report.'
       and n.community_id = test_support.hearth_id() $$, 1,
  'when it is closed the reporter is told it was looked at, once');

select test_support.become('member_a');
select test_support.assert_true(
  public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 3), 'Again.')
    <> (select id from report), 'once a report is closed, reporting the same thing again is a new report');
select test_support.assert_eq_text(
  (select string_agg(r.audience || ':' || r.status, ',' order by r.id) from public.list_my_reports() r),
  'community:dismissed,community:open,community:open', 'a person sees where each of their reports stands');
select test_support.become(null);

-- The report outlives the message.
select test_support.become('member_b');
select public.delete_message((select id from talk where n = 3));
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.community_reports r
     where r.id = (select id from report) and r.subject_message_id is null and r.snapshot -> 'message' ->> 'body' = 'line 3' $$,
  1, 'deleting the message leaves the report and what it recorded');

-- ── Handing a report to Haven staff ─────────────────────────────────────────
select test_support.clear_sent();
delete from public.notifications where true;
select test_support.become('server_mod');
create temp table escalated as
  select public.escalate_community_report((select id from member_report), '  Needs staff.  ') as case_id;
grant select on escalated to public;
select test_support.assert_eq_text(
  public.escalate_community_report((select id from member_report))::text, (select case_id::text from escalated),
  'escalating twice gives the same case');
select test_support.expect_error(
  $$ select public.set_community_report_status((select id from member_report), 'resolved') $$, 'report_escalated');
select test_support.assert_eq_text(
  (select string_agg(r.audience || ':' || r.status, ',') from public.list_my_reports() r), 'haven:open',
  'the moderator who escalated follows the case');
select test_support.become(null);

select test_support.assert_query_count(
  $$ select 1 from public.community_reports r
     where r.id = (select id from member_report) and r.status = 'escalated'
       and r.escalated_case_id = (select case_id from escalated) $$, 1, 'the report points at its case');
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases c
     where c.id = (select case_id from escalated) and c.source = 'escalation'
       and c.reporter_id = test_support.user_id('server_mod') and c.subject_user_id = test_support.user_id('member_a')
       and c.community_id = test_support.hearth_id() and c.community_report_id = (select id from member_report)
       and c.reason = 'Needs staff.'
       and c.snapshot -> 'member' ->> 'username' = 'rls_member_a'
       and c.snapshot -> 'original_report' -> 'reporter' ->> 'username' = 'rls_member_b'
       and c.snapshot -> 'original_report' ->> 'reason' = 'Spams invites.' $$, 1,
  'and the case carries everything the report had, including who first filed it');
select test_support.assert_eq_int(test_support.sent('staff_active', 'case.changed'), 1, 'staff hear the new case');
select test_support.assert_eq_int(test_support.sent('owner', 'report.updated'), 1, 'moderators hear it was escalated');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j
     where j.kind = 'email_send' and j.payload ->> 'template' = 'staff_case_opened'
       and j.payload ->> 'case_id' = (select case_id::text from escalated) $$, 1, 'staff are mailed');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'report_received' and n.recipient_id = test_support.user_id('server_mod')
       and n.case_id = (select case_id from escalated) $$, 1, 'and the moderator is told it arrived');

-- With no new reason the report's own is used.
select test_support.become('owner');
create temp table escalated_two as select public.escalate_community_report((select id from about_mod)) as case_id;
select test_support.become(null);
select test_support.assert_eq_text(
  (select c.reason from public.platform_cases c where c.id = (select case_id from escalated_two)), 'Heavy handed.',
  'an escalation without a reason keeps the report''s');

-- ── Slow down ───────────────────────────────────────────────────────────────
delete from private.rate_limit_hits where true;
insert into private.rate_limit_hits (user_id, action)
  select test_support.user_id('member_b'), 'report' from generate_series(1, 4);
select test_support.become('member_b');
select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 2), 'x');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 4), 'x') $$,
  'rate_limited');
select test_support.become(null);

delete from private.rate_limit_hits where true;
insert into private.rate_limit_hits (user_id, action, at)
  select test_support.user_id('member_b'), 'report_daily', now() - interval '2 hours' from generate_series(1, 19);
select test_support.become('member_b');
select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 4), 'x');
select test_support.expect_error(
  $$ select public.file_community_report(test_support.hearth_id(), 'message', (select id from talk where n = 5), 'x') $$,
  'rate_limited');
select test_support.become(null);

rollback;
