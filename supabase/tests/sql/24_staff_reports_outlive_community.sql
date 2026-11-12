begin;
select test_support.note('suite 24: Haven staff reports outlive the community they came from (HAV-17)');
select test_support.cleanup_fixture_domain_state();

-- A scratch community owned by the fixture owner. Deleting the shared fixture
-- community would break later suites, and the transaction rolls this back.
insert into public.communities(id, name, created_by_user_id)
values ('00000000-0000-4000-8000-000000000241', 'Reported community', test_support.fixture_user_id('community_owner'));

-- One report in each direction, the way the "both" fan-out writes them: the
-- staff row links back to the community row through source_report_id.
insert into public.support_reports(id, community_id, destination, reporter_user_id, title, notes, snapshot)
values
  ('00000000-0000-4000-8000-000000000242', '00000000-0000-4000-8000-000000000241', 'server_admins',
   test_support.fixture_user_id('member_a'), 'Message Report: Content Abuse', '{}', '{"evidence":"community copy"}'),
  ('00000000-0000-4000-8000-000000000243', '00000000-0000-4000-8000-000000000241', 'haven_staff',
   test_support.fixture_user_id('member_a'), 'Message Report: Content Abuse', '{}', '{"evidence":"staff copy"}');
update public.support_reports
set source_report_id = '00000000-0000-4000-8000-000000000242'
where id = '00000000-0000-4000-8000-000000000243';

-- The owner deletes the community through RLS, as the client does.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));
delete from public.communities where id = '00000000-0000-4000-8000-000000000241';
reset role;

select test_support.assert_eq_int(
  (select count(*) from public.communities where id = '00000000-0000-4000-8000-000000000241'),
  0, 'the owner can still delete their community');
select test_support.assert_eq_int(
  (select count(*) from public.support_reports where id = '00000000-0000-4000-8000-000000000242'),
  0, 'the community report goes with the community');
select test_support.assert_eq_int(
  (select count(*) from public.support_reports where id = '00000000-0000-4000-8000-000000000243'),
  1, 'the staff report survives the community');
select test_support.assert_eq_text(
  (select snapshot->>'evidence' from public.support_reports where id = '00000000-0000-4000-8000-000000000243'),
  'staff copy', 'the staff report keeps its evidence snapshot');
select test_support.assert_true(
  (select community_id is null and source_report_id is null
   from public.support_reports where id = '00000000-0000-4000-8000-000000000243'),
  'the surviving staff report no longer points at the deleted community or community report');

-- Staff can still read it; the former owner cannot.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));
select test_support.assert_eq_int(
  (select count(*) from public.support_reports where id = '00000000-0000-4000-8000-000000000243'),
  1, 'active staff still see the orphaned staff report');
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));
select test_support.assert_eq_int(
  (select count(*) from public.support_reports where id = '00000000-0000-4000-8000-000000000243'),
  0, 'the former owner cannot see the staff report');
reset role;

-- Only a staff report may have no community.
select test_support.expect_exception($q$
  insert into public.support_reports(community_id, destination, reporter_user_id, title)
  values (null, 'server_admins', test_support.fixture_user_id('member_a'), 'No community')
$q$, 'support_reports_community_required');

rollback;
