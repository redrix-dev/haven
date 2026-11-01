begin;
select test_support.note('suite 23: voice controls are authorized, attributed and session scoped');
select test_support.cleanup_fixture_domain_state();
-- Moderator is a label; explicitly grant the capability this suite exercises.
insert into public.role_permissions(role_id, permission_key)
select id, 'manage_members' from public.roles
where community_id = test_support.fixture_community_id() and name = 'Moderator'
on conflict do nothing;
insert into public.channels(id, community_id, name, kind, position, created_by_user_id)
values ('00000000-0000-4000-8000-000000000092', test_support.fixture_community_id(), 'Game room', 'voice', 1000, test_support.fixture_user_id('community_owner'));
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
select test_support.expect_exception($q$
  select public.send_voice_control(test_support.fixture_community_id(), '00000000-0000-4000-8000-000000000092', test_support.fixture_user_id('member_b'), 'call-b', 'mute')
$q$, 'Missing permission');
select test_support.assert_eq_text(
  public.send_voice_control(test_support.fixture_community_id(), '00000000-0000-4000-8000-000000000092', test_support.fixture_user_id('member_a'), 'call-a', 'unmute')->>'action',
  'unmute', 'members can undo their own courtesy mute');
select test_support.expect_exception($q$
  select public.send_voice_control(test_support.fixture_community_id(), '00000000-0000-4000-8000-000000000092', test_support.fixture_user_id('member_a'), 'call-a', 'lock')
$q$, 'Invalid voice control');
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));
select test_support.expect_exception($q$
  select public.send_voice_control(test_support.fixture_community_id(), '00000000-0000-4000-8000-000000000092', test_support.fixture_user_id('member_b'), 'call-b', 'remove')
$q$, 'Voice channel is unavailable');
select test_support.set_jwt_claims(test_support.fixture_user_id('server_mod'));
select test_support.expect_exception($q$
  select public.send_voice_control(test_support.fixture_community_id(), '00000000-0000-4000-8000-000000000092', test_support.fixture_user_id('community_owner'), 'owner-call', 'deafen')
$q$, 'Missing permission');
do $$
declare payload jsonb;
begin
  payload := public.send_voice_control(test_support.fixture_community_id(), '00000000-0000-4000-8000-000000000092', test_support.fixture_user_id('member_b'), 'call-b', 'deafen');
  perform test_support.assert_eq_text(payload->>'actor_user_id', test_support.fixture_user_id('server_mod')::text, 'actor identity comes from auth');
  perform test_support.assert_eq_text(payload->>'actor_name', test_support.fixture_username('server_mod'), 'actor name comes from the profile');
  perform test_support.assert_eq_text(payload->>'target_session_id', 'call-b', 'command addresses one call');
  perform test_support.assert_eq_text(payload->>'channel_name', 'Game room', 'removal notice has channel context');
end;
$$;
reset role;
insert into public.member_roles(community_id, member_id, role_id, assigned_by_user_id)
select cm.community_id, cm.id, r.id, test_support.fixture_user_id('community_owner')
from public.community_members cm join public.roles r on r.community_id = cm.community_id and r.name = 'Moderator'
where cm.community_id = test_support.fixture_community_id() and cm.user_id = test_support.fixture_user_id('member_b')
on conflict do nothing;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('server_mod'));
select test_support.expect_exception($q$
  select public.send_voice_control(test_support.fixture_community_id(), '00000000-0000-4000-8000-000000000092', test_support.fixture_user_id('member_b'), 'call-b', 'mute')
$q$, 'Missing permission');
rollback;
