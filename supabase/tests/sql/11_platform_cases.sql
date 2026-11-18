-- Cases for Haven staff: filing, who reads them, evidence, decisions and
-- their reversal, apparent CSAM, the preservation hold, and the scanner.
begin;

delete from public.notifications where true;
delete from private.rate_limit_hits where true;
delete from private.jobs where true;
delete from vault.secrets where name like 'haven.%';

-- For this suite the second staff account is switched on, as a CSAM reviewer.
update public.platform_staff set active = true, can_review_csam = true
  where user_id = test_support.user_id('staff_inactive');

-- Post a message with one picture in #general.
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
create function pg_temp.events(p_case_id uuid, p_kind public.case_event_kind) returns bigint language sql as $$
  select count(*) from public.platform_case_events e where e.case_id = p_case_id and e.kind = p_kind;
$$;
create function pg_temp.storage_sees(p_bucket text) returns bigint language sql as $$
  select count(*) from storage.objects o where o.bucket_id = p_bucket;
$$;
grant execute on function pg_temp.storage_sees(text) to public;

select test_support.become('member_b');
select public.update_my_profile(null, 'a bad bio');
select test_support.become(null);
create temp table posted as select pg_temp.post_file('member_b', 'look at this') as p;
create temp table bad as select (p ->> 'message_id')::uuid as message_id, (p ->> 'media_id')::uuid as media_id from posted;
grant select on bad to public;
select test_support.clear_sent();

-- ── Filing ──────────────────────────────────────────────────────────────────
select test_support.become('member_a');
create temp table filed as
  select public.file_platform_case('message', (select message_id from bad), '  Illegal.  ') as id;
grant select on filed to public;
select test_support.assert_eq_text(
  public.file_platform_case('message', (select message_id from bad), 'Still.')::text, (select id::text from filed),
  'a second tap returns the case that is already open');
select test_support.expect_error($$ select public.file_platform_case('message', gen_random_uuid()) $$, 'message_not_found');
select test_support.expect_error(
  $$ select public.file_platform_case('profile', test_support.user_id('member_a')) $$, 'cannot_report_self');
select test_support.expect_error($$ select public.file_platform_case('profile', gen_random_uuid()) $$, 'user_not_found');
select test_support.expect_error(
  $$ select public.file_platform_case('escalation', test_support.user_id('member_b')) $$, 'subject_invalid');
select test_support.expect_error(
  $$ select public.file_platform_case('media_scan', test_support.user_id('member_b')) $$, 'subject_invalid');
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases $$, 0, 'the person who reported cannot read the case');
select test_support.expect_error(
  $$ select public.staff_add_case_note((select id from filed), 'mine') $$, 'staff_only');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.file_platform_case('message', (select message_id from bad), 'x') $$, 'message_not_found');
select test_support.become(null);

select test_support.assert_query_count(
  $$ select 1 from public.platform_cases c
     where c.id = (select id from filed) and c.source = 'message' and c.status = 'open'
       and c.reporter_id = test_support.user_id('member_a') and c.subject_user_id = test_support.user_id('member_b')
       and c.community_id = test_support.hearth_id() and c.subject_message_id = (select message_id from bad)
       and c.reason = 'Illegal.' and c.snapshot -> 'message' ->> 'body' = 'look at this'
       and c.snapshot -> 'message' -> 'attachments' -> 0 ->> 'media_id' = (select media_id::text from bad) $$, 1,
  'the case records who, about whom, what was said and which files');
select test_support.assert_query_count(
  $$ select 1 from public.case_media cm
     where cm.case_id = (select id from filed) and cm.media_id = (select media_id from bad) $$, 1,
  'and holds the message''s files as evidence');
select test_support.assert_eq_int(pg_temp.events((select id from filed), 'filed'), 1, 'its log starts with the filing');
select test_support.assert_eq_int(test_support.sent('staff_active', 'case.changed'), 1, 'staff hear the new case');
select test_support.assert_eq_int(test_support.sent('member_b', 'case.changed'), 0, 'nobody else does');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j
     where j.kind = 'email_send' and j.payload ->> 'template' = 'staff_case_opened'
       and j.payload ->> 'case_id' = (select id::text from filed) $$, 1, 'staff are mailed, once');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'report_received' and n.recipient_id = test_support.user_id('member_a')
       and n.case_id = (select id from filed) $$, 1, 'the reporter is told it arrived');
select test_support.assert_query_count(
  $$ select 1 from public.worker_email_content('staff_case_opened', (select id from filed)) e
     where e.to_email is null and e.subject = 'New Haven case (message)' and e.body like '%Reason: Illegal.%' $$, 1,
  'the mail worker is given the words');

-- ── Who reads cases ─────────────────────────────────────────────────────────
select test_support.become('staff_active', 'aal2');
select test_support.assert_query_count($$ select 1 from public.platform_cases $$, 1, 'staff read cases');
select test_support.assert_query_count($$ select 1 from public.platform_case_events $$, 1, 'their log');
select test_support.assert_query_count($$ select 1 from public.case_media $$, 1, 'and which files they hold');
select test_support.become('staff_active');
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases $$, 0, 'staff signed in with only a password read no cases');
select test_support.assert_query_count($$ select 1 from public.platform_case_events $$, 0, 'nor the log');
select test_support.assert_query_count($$ select 1 from public.case_media $$, 0, 'nor the files');
select test_support.expect_error(
  $$ select public.staff_add_case_note((select id from filed), 'x') $$, 'second_factor_required');
select test_support.become('staff_person');
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases $$, 0, 'a staff member''s own account reads no cases');
select test_support.expect_error(
  $$ select public.staff_add_case_note((select id from filed), 'x') $$, 'staff_only');
select test_support.become('staff_active', 'aal2');
select test_support.expect_error(
  $$ select public.file_platform_case('profile', test_support.user_id('member_b'), 'x') $$, 'staff_account');
select test_support.become('owner');
select test_support.assert_query_count($$ select 1 from public.platform_cases $$, 0, 'a community owner does not');
select test_support.assert_query_count($$ select 1 from public.platform_case_events $$, 0, 'nor the log');
select test_support.assert_query_count($$ select 1 from public.case_media $$, 0, 'nor which files it holds');
select test_support.become(null);

-- Staff do not handle a case about themselves: about their own account.
select test_support.clear_sent();
select test_support.become('member_a');
create temp table about_staff as
  select public.file_platform_case('profile', test_support.user_id('staff_person'), 'Abuse of position.') as id;
grant select on about_staff to public;
select test_support.become('staff_active', 'aal2');
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases $$, 1, 'a staff member does not see the case about their own account');
select test_support.assert_query_count(
  $$ select 1 from public.platform_case_events e where e.case_id = (select id from about_staff) $$, 0, 'or its log');
select test_support.expect_error(
  $$ select public.staff_add_case_note((select id from about_staff), 'nothing here') $$, 'case_not_found');
select test_support.expect_error(
  $$ select public.staff_record_decision((select id from about_staff), '{}') $$, 'case_not_found');
select test_support.expect_error(
  $$ select public.staff_set_case_status((select id from about_staff), 'dismissed') $$, 'case_not_found');
select test_support.become('staff_inactive', 'aal2');
select test_support.assert_query_count($$ select 1 from public.platform_cases $$, 2, 'other staff do');
select test_support.become(null);
select test_support.assert_eq_int(test_support.sent('staff_active', 'case.changed'), 0, 'they do not hear it arrive');
select test_support.assert_eq_int(test_support.sent('staff_inactive', 'case.changed'), 1, 'other staff do');

-- ── Working a case ──────────────────────────────────────────────────────────
select test_support.become('staff_active', 'aal2');
select public.staff_set_case_status((select id from filed), 'in_review');
select test_support.expect_error(
  $$ select public.staff_set_case_status((select id from filed), 'actioned') $$, 'needs_decision');
select test_support.expect_error(
  $$ select public.staff_set_case_status(gen_random_uuid(), 'in_review') $$, 'case_not_found');
select public.staff_add_case_note((select id from filed), '  Looked at it.  ');
select test_support.expect_error($$ select public.staff_add_case_note((select id from filed), '   ') $$, 'note_invalid');
select test_support.expect_error(
  $$ insert into public.platform_case_events (case_id, kind) values ((select id from filed), 'note') $$,
  'permission denied for table platform_case_events');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.platform_case_events e
     where e.case_id = (select id from filed) and e.actor_id = test_support.user_id('staff_active')
       and ((e.kind = 'status_changed' and e.detail ->> 'from' = 'open' and e.detail ->> 'to' = 'in_review')
            or (e.kind = 'note' and e.detail ->> 'body' = 'Looked at it.')) $$, 2,
  'each step is added to the log with who did it');

-- ── Evidence ────────────────────────────────────────────────────────────────
-- A second file on the same case, to show that opening one does not open both.
select test_support.become('member_b');
create temp table second_file as select * from public.create_upload('attachment', 'image/png', 2000, 'two.png');
grant select on second_file to public;
select test_support.become(null);
select test_support.fake_upload((select id from second_file));
insert into public.case_media (case_id, media_id) values ((select id from filed), (select id from second_file));

select test_support.become('staff_active', 'aal2');
select test_support.assert_eq_int(pg_temp.storage_sees('media'), 0, 'being staff does not open anyone''s files');
select test_support.assert_eq_text(
  (select v.bucket || '/' || v.object_path from public.staff_view_case_media((select id from filed), (select media_id from bad)) v),
  'media/' || test_support.user_id('member_b')::text || '/' || (select media_id::text from bad),
  'staff ask to open one evidence file and are told where it is');
select test_support.assert_eq_int(pg_temp.storage_sees('media'), 1, 'asking is what unlocks it, and only that file');
select test_support.become('staff_active');
select test_support.assert_eq_int(pg_temp.storage_sees('media'), 0, 'and only in a session with a second factor');
select test_support.become('staff_active', 'aal2');
select test_support.expect_error(
  $$ select * from public.staff_view_case_media((select id from filed), gen_random_uuid()) $$, 'media_not_found');
select test_support.become('staff_inactive', 'aal2');
select test_support.assert_eq_int(pg_temp.storage_sees('media'), 0, 'for the person who asked, not for all staff');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.platform_case_events e
     where e.case_id = (select id from filed) and e.kind = 'media_viewed'
       and e.actor_id = test_support.user_id('staff_active')
       and e.detail ->> 'media_id' = (select media_id::text from bad) $$, 1,
  'and every look is in the log');
update public.platform_case_events set created_at = now() - interval '11 minutes' where kind = 'media_viewed';
select test_support.become('staff_active', 'aal2');
select test_support.assert_eq_int(pg_temp.storage_sees('media'), 0, 'the file locks again after ten minutes');
select test_support.become(null);

-- ── Decisions ───────────────────────────────────────────────────────────────
-- A staff member's own account may report, but its staff account does not
-- decide that case.
select test_support.become('staff_person');
create temp table by_staff as
  select public.file_platform_case('profile', test_support.user_id('member_b'), 'That bio.') as id;
grant select on by_staff to public;
select test_support.become('staff_active', 'aal2');
select test_support.expect_error(
  $$ select public.staff_record_decision((select id from by_staff), '{}') $$, 'own_case');
select test_support.expect_error(
  $$ select public.staff_record_decision(
       (select id from filed), array['user_suspended', 'user_banned']::public.case_action[], 'r', 'why', 7) $$,
  'actions_invalid');
select test_support.expect_error(
  $$ select public.staff_record_decision((select id from filed), array['user_suspended']::public.case_action[], 'r', 'why') $$,
  'suspend_days_invalid');
select test_support.expect_error(
  $$ select public.staff_record_decision(
       (select id from filed), array['user_suspended']::public.case_action[], 'r', 'why', 366) $$,
  'suspend_days_invalid');
select test_support.expect_error(
  $$ select public.staff_record_decision((select id from filed), array['content_removed']::public.case_action[], 'r') $$,
  'reason_required');
select test_support.become(null);

-- Remove the content and suspend for a week.
select test_support.clear_sent();
delete from public.notifications where true;
delete from private.jobs where true;
select test_support.become('staff_active', 'aal2');
create temp table decision as
  select public.staff_record_decision(
    (select id from filed), array['content_removed', 'user_suspended']::public.case_action[],
    '  No illegal content ', '  Posted illegal content.  ', 7) as id;
grant select on decision to public;
select test_support.expect_error(
  $$ select public.staff_record_decision((select id from filed), '{}') $$, 'already_decided');
select test_support.become(null);

select test_support.assert_query_count(
  $$ select 1 from public.platform_case_decisions d
     where d.id = (select id from decision) and d.rule = 'No illegal content' and d.reason = 'Posted illegal content.'
       and d.decided_by = test_support.user_id('staff_active')
       and d.actions = array['content_removed', 'user_suspended']::public.case_action[] $$, 1,
  'the decision records what, under which rule, why and by whom');
select test_support.assert_eq_text(
  (select c.status::text from public.platform_cases c where c.id = (select id from filed)), 'actioned',
  'a decision with actions closes the case as actioned');
select test_support.assert_query_count(
  $$ select 1 from public.messages m where m.id = (select message_id from bad) $$, 0, 'the message is taken down');
select test_support.assert_eq_int(test_support.sent('member_a', 'message.deleted'), 1, 'and everyone watching hears it go');
select test_support.assert_query_count(
  $$ select 1 from public.media f where f.id = (select media_id from bad) and f.status = 'released' $$, 1,
  'its file is let go of');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'media_delete' $$, 0, 'but not deleted: the case holds it');
select test_support.assert_query_count(
  $$ select 1 from public.worker_media_to_delete((select media_id from bad)) $$, 0, 'the delete worker would be told no');
select test_support.assert_query_count(
  $$ select 1 from public.account_restrictions r
     where r.user_id = test_support.user_id('member_b') and r.ends_at = now() + interval '7 days'
       and r.case_id = (select id from filed) and r.decision_id = (select id from decision) and r.lifted_at is null $$,
  1, 'the suspension is one row, tied to the decision');
select test_support.assert_eq_int(test_support.sent('member_b', 'account.restricted'), 1, 'their apps are told at once');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'report_outcome' and n.recipient_id = test_support.user_id('member_a')
       and n.body = 'Haven staff took action on your report.' and n.case_id = (select id from filed) $$, 1,
  'the reporter is told the outcome');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'moderation_decision' and n.recipient_id = test_support.user_id('member_b')
       and n.body = 'Rule: No illegal content. Posted illegal content.' $$, 1,
  'the person is told what was done, under which rule and why');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j
     where j.kind = 'email_send' and j.payload ->> 'template' = 'statement_of_reasons'
       and j.payload ->> 'decision_id' = (select id::text from decision) $$, 1, 'and is mailed the same');
select test_support.assert_query_count(
  $$ select 1 from public.worker_email_content('statement_of_reasons', (select id from filed), (select id from decision)) e
     where e.to_email = 'rls-member-b@example.test'
       and e.body like '%Action: content_removed, user_suspended%' and e.body like '%Until: %UTC%'
       and e.body like '%Rule: No illegal content%' and e.body like '%Reason: Posted illegal content.%' $$, 1,
  'with the words the mail worker sends');

select test_support.become('member_b');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), 'still here') $$, 'account_restricted');
select test_support.assert_query_count(
  $$ select 1 from public.list_decisions_about_me() d
     where d.case_id = (select id from filed) and d.rule = 'No illegal content'
       and d.restricted_until = now() + interval '7 days' $$, 1,
  'a restricted person can still read the decision about them');
select test_support.become('member_a');
select test_support.assert_query_count(
  $$ select 1 from public.list_decisions_about_me() $$, 0, 'which nobody else can');
select test_support.assert_eq_text(
  (select r.status from public.list_my_reports() r where r.id = (select id from filed)), 'actioned',
  'the reporter sees where their report stands');
select test_support.become(null);

-- ── Reversing a decision ────────────────────────────────────────────────────
select test_support.become('staff_active', 'aal2');
select test_support.expect_error(
  $$ select public.staff_reverse_decision((select id from decision), '   ') $$, 'reason_required');
select public.staff_reverse_decision((select id from decision), '  Wrong person.  ');
select test_support.expect_error(
  $$ select public.staff_reverse_decision((select id from decision), 'again') $$, 'decision_not_found');
select test_support.become(null);
select test_support.assert_false(
  private.is_restricted(test_support.user_id('member_b')), 'reversing lifts the restriction that decision made');
select test_support.assert_query_count(
  $$ select 1 from public.account_restrictions r
     where r.decision_id = (select id from decision) and r.lifted_at is not null
       and r.lifted_by = test_support.user_id('staff_active') $$, 1, 'and records who lifted it');
select test_support.assert_query_count(
  $$ select 1 from public.platform_case_decisions d
     where d.id = (select id from decision) and d.reversed_at is not null and d.reversal_reason = 'Wrong person.'
       and d.reversed_by = test_support.user_id('staff_active') $$, 1, 'the decision stays, marked reversed');
select test_support.assert_eq_text(
  (select c.status::text from public.platform_cases c where c.id = (select id from filed)), 'in_review',
  'and the case is open again');
select test_support.assert_eq_int(pg_temp.events((select id from filed), 'decision_reversed'), 1, 'with a line in its log');
select test_support.become('member_b');
select test_support.assert_query_count(
  $$ select 1 from public.list_decisions_about_me() $$, 0, 'a reversed decision is no longer listed against the person');
select test_support.become(null);

-- Looked at, no action.
delete from public.notifications where true;
select test_support.become('staff_active', 'aal2');
select public.staff_record_decision((select id from filed), null);
select test_support.become(null);
select test_support.assert_eq_text(
  (select c.status::text from public.platform_cases c where c.id = (select id from filed)), 'no_action',
  'a new decision can follow a reversed one; no actions closes it as no action');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.kind = 'report_outcome' and n.body = 'Haven staff reviewed your report and did not find a violation.' $$,
  1, 'the reporter is told');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n where n.kind = 'moderation_decision' $$, 0,
  'and the person reported is told nothing, because nothing was done');

-- A profile report: remove the content and ban.
select test_support.clear_sent();
select test_support.become('staff_inactive', 'aal2');
select public.staff_record_decision(
  (select id from by_staff), array['content_removed', 'user_banned']::public.case_action[], 'Profile rules', 'Bio.');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases c
     where c.id = (select id from by_staff) and c.snapshot -> 'profile' ->> 'bio' = 'a bad bio' $$, 1,
  'a profile case recorded the profile as it was');
select test_support.assert_true(
  (select p.bio is null from public.profiles p where p.id = test_support.user_id('member_b')),
  'removing the content of a profile case clears the bio');
select test_support.assert_query_count(
  $$ select 1 from public.account_restrictions r
     where r.user_id = test_support.user_id('member_b') and r.ends_at is null and r.lifted_at is null $$, 1,
  'a ban is a restriction with no end');
select test_support.become('member_b');
select test_support.assert_query_count(
  $$ select 1 from public.list_decisions_about_me() d
     where 'user_banned' = any (d.actions) and d.restricted_until is null and d.reason = 'Bio.' $$, 1,
  'which the person can read');
select test_support.become(null);

-- Nothing to remove: an escalated report about a member has no content.
select test_support.become('member_a');
create temp table member_report as
  select public.file_community_report(
    test_support.hearth_id(), 'member', test_support.user_id('owner'), 'Plays favourites.') as id;
grant select on member_report to public;
select test_support.become('server_mod');
create temp table escalated as select public.escalate_community_report((select id from member_report)) as id;
grant select on escalated to public;
select test_support.become('staff_inactive', 'aal2');
select test_support.expect_error(
  $$ select public.staff_record_decision(
       (select id from escalated), array['content_removed']::public.case_action[], 'r', 'why') $$, 'nothing_to_remove');
select test_support.become(null);

-- ── Apparent CSAM ───────────────────────────────────────────────────────────
create temp table posted_two as select pg_temp.post_file('member_a', 'worse') as p;
create temp table worse as
  select (p ->> 'message_id')::uuid as message_id, (p ->> 'media_id')::uuid as media_id,
         (select f.object_path from public.media f where f.id = (p ->> 'media_id')::uuid) as object_path
  from posted_two;
grant select on worse to public;
select test_support.become('owner');
create temp table flagged as select public.file_platform_case('message', (select message_id from worse), 'CSAM') as id;
grant select on flagged to public;
select test_support.become(null);
delete from private.jobs where true;

select test_support.become('staff_active', 'aal2'); -- staff, but not a CSAM reviewer
select test_support.expect_error(
  $$ select public.staff_record_ncmec_report((select id from flagged), '98765') $$, 'not_flagged');
select public.staff_flag_csam((select id from flagged));
select public.staff_flag_csam((select id from flagged)); -- once is enough
select test_support.expect_error(
  $$ select public.staff_record_ncmec_report((select id from flagged), '   ') $$, 'report_id_required');
select public.staff_record_ncmec_report((select id from flagged), '  98765 ');
select test_support.expect_error(
  $$ select * from public.staff_view_case_media((select id from flagged), (select media_id from worse)) $$,
  'csam_reviewer_only');
select test_support.become(null);

select test_support.assert_query_count(
  $$ select 1 from public.platform_cases c
     where c.id = (select id from flagged) and c.csam_flagged_at is not null
       and c.csam_flagged_by = test_support.user_id('staff_active')
       and c.preserve_until = now() + interval '1 year' and c.ncmec_report_id = '98765' $$, 1,
  'flagging records who and when, starts a one-year hold, and the report number is kept');
select test_support.assert_query_count(
  $$ select 1 from public.messages m where m.id = (select message_id from worse) $$, 0, 'the message is taken down');
select test_support.assert_query_count(
  $$ select 1 from public.media f where f.id = (select media_id from worse) and f.withheld_at is not null $$, 1,
  'its file is withheld');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j
     where j.kind = 'media_quarantine' and j.payload ->> 'media_id' = (select media_id::text from worse) $$, 1,
  'and queued, once, to be moved out of reach');
select test_support.assert_eq_int(pg_temp.events((select id from flagged), 'csam_flagged'), 1, 'flagged once in the log');
select test_support.assert_eq_int(pg_temp.events((select id from flagged), 'ncmec_recorded'), 1, 'with the report');
select test_support.become('member_a');
select test_support.assert_false(
  private.can_read_media('media', (select object_path from worse)),
  'not even the person who uploaded it is served the file');
select test_support.become(null);

select test_support.become('staff_inactive', 'aal2'); -- the CSAM reviewer
select test_support.assert_query_count(
  $$ select 1 from public.staff_view_case_media((select id from flagged), (select media_id from worse)) v
     where v.bucket = 'media' $$, 1, 'a CSAM reviewer can open it');
select test_support.assert_eq_int(pg_temp.storage_sees('media'), 1, 'and is served it');
select test_support.become(null);

-- The quarantine worker moves the file to the evidence bucket and says so.
select test_support.assert_query_count(
  $$ select 1 from public.worker_media_to_quarantine((select media_id from worse)) q where q.bucket = 'media' $$, 1,
  'the worker is told what to move');
select test_support.assert_query_count(
  $$ select 1 from public.worker_media_to_quarantine((select media_id from bad)) $$, 0, 'and only withheld files');
update storage.objects set bucket_id = 'evidence' where name = (select object_path from worse);
select public.worker_media_quarantined((select media_id from worse));
select test_support.assert_eq_text(
  (select f.bucket from public.media f where f.id = (select media_id from worse)), 'evidence', 'the file now lives in evidence');
select test_support.assert_query_count(
  $$ select 1 from public.worker_media_to_quarantine((select media_id from worse)) $$, 0, 'so there is nothing left to move');
select test_support.assert_eq_int(pg_temp.events((select id from flagged), 'media_quarantined'), 1, 'and the log says so');
select test_support.become('staff_inactive', 'aal2');
select test_support.assert_eq_int(pg_temp.storage_sees('evidence'), 1, 'the reviewer who opened it still reads it there');
select test_support.become('staff_active', 'aal2');
select test_support.assert_eq_int(pg_temp.storage_sees('evidence'), 0, 'other staff do not');
select test_support.become(null);

-- ── The preservation hold ───────────────────────────────────────────────────
select test_support.expect_error(
  $$ delete from public.platform_cases where id = (select id from flagged) $$, 'preservation_hold');
select test_support.expect_error(
  $$ delete from public.case_media where case_id = (select id from flagged) $$, 'preservation_hold');
select test_support.expect_error(
  $$ delete from public.media where id = (select media_id from worse) $$, 'case_media_media_id_fkey');
select public.worker_media_deleted((select media_id from worse));
select test_support.assert_query_count(
  $$ select 1 from public.media f where f.id = (select media_id from worse) $$, 1,
  'nothing deletes a held file, not SQL and not the delete worker');
update public.platform_cases set preserve_until = now() - interval '1 day' where id = (select id from flagged);
delete from public.platform_cases where id = (select id from flagged);
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases c where c.id = (select id from flagged) $$, 0, 'the hold ends on its date');
select test_support.assert_query_count(
  $$ select 1 from public.worker_media_to_delete((select media_id from worse)) $$, 1,
  'and a file no case holds any more can be deleted');

-- ── The scanner ─────────────────────────────────────────────────────────────
delete from private.jobs where true;
create temp table unscanned as select pg_temp.post_file('member_a', 'scanner is off') as p;
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'media_scan' $$, 0, 'with no scanner switched on, nothing is queued');
select private.set_setting('media_scan', 'on');
create temp table posted_three as select pg_temp.post_file('member_a', 'scan me') as p;
create temp table scanned as
  select (p ->> 'message_id')::uuid as message_id, (p ->> 'media_id')::uuid as media_id from posted_three;
grant select on scanned to public;
select test_support.assert_query_count(
  $$ select 1 from public.media f where f.id = (select media_id from scanned) and f.scan_status = 'pending' $$, 1,
  'with a scanner on, a file put to use is marked for scanning');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j
     where j.kind = 'media_scan' and j.payload ->> 'media_id' = (select media_id::text from scanned) $$, 1, 'and queued');

select test_support.assert_true(
  public.worker_record_media_scan((select media_id from scanned), 'clear', 'vendor') is null, 'a clean result opens no case');
select test_support.assert_query_count(
  $$ select 1 from public.media f
     where f.id = (select media_id from scanned) and f.scan_status = 'clear' and f.scan_vendor = 'vendor'
       and f.scanned_at is not null and f.withheld_at is null $$, 1, 'it is only recorded');

delete from public.notifications where true;
create temp table scan_case as
  select public.worker_record_media_scan((select media_id from scanned), 'match', 'vendor', '{"score": 1}') as id;
grant select on scan_case to public;
select test_support.assert_query_count(
  $$ select 1 from public.platform_cases c
     where c.id = (select id from scan_case) and c.source = 'media_scan' and c.reporter_id is null
       and c.subject_user_id = test_support.user_id('member_a')
       and c.csam_flagged_at is not null and c.csam_flagged_by is null and c.preserve_until is not null
       and c.snapshot -> 'message' ->> 'body' = 'scan me' and c.snapshot -> 'scan' ->> 'vendor' = 'vendor' $$, 1,
  'a match opens a case that is already flagged and held');
select test_support.assert_query_count(
  $$ select 1 from public.messages m where m.id = (select message_id from scanned) $$, 0, 'takes the message down');
select test_support.assert_query_count(
  $$ select 1 from public.media f where f.id = (select media_id from scanned) and f.withheld_at is not null $$, 1,
  'and withholds the file');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n where n.kind = 'report_received' $$, 0, 'there is no reporter to tell');

-- A match on a profile picture takes the picture off the profile.
select test_support.become('member_a');
create temp table face as select * from public.create_upload('avatar', 'image/png', 500);
grant select on face to public;
select test_support.become(null);
select test_support.fake_upload((select id from face));
select test_support.become('member_a');
select public.set_my_avatar((select id from face));
select test_support.become(null);
select public.worker_record_media_scan((select id from face), 'match', 'vendor');
select test_support.assert_true(
  (select p.avatar_media_id is null from public.profiles p where p.id = test_support.user_id('member_a')),
  'the profile no longer shows it');
select test_support.assert_query_count(
  $$ select 1 from public.media f where f.id = (select id from face) and f.withheld_at is not null $$, 1,
  'and the file is withheld as evidence');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j
     where j.kind = 'media_quarantine' and j.payload ->> 'media_id' = (select id::text from face) $$, 1,
  'and queued to be moved out of the public bucket');

rollback;
