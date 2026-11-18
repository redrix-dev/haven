-- The baseline every suite and the dev backend start from, built through the
-- same RPCs the apps call. Safe to run again: it removes what it made first.
--
--   TEST: Hearth          owner: owner
--     #general            everyone reads and writes
--     #read-only          everyone reads, only the owner writes
--     #staff-room         hidden from everyone except the Moderator role
--     voice: Lounge
--   members: owner, member_a, member_b, server_mod (Moderator)
--   non_member and stranger are in nothing. staff_active is a Haven staff
--   account and staff_person its staff member's own account; staff_inactive
--   was a staff account.

select test_support.become(null);

-- Start clean.
delete from public.communities c where c.name like 'TEST:%';
delete from public.channels ch where ch.kind = 'dm' and exists (
  select 1 from public.channel_participants cp
  join auth.users u on u.id = cp.user_id
  where cp.channel_id = ch.id and u.email like 'rls-%@example.test');
delete from public.friend_requests r using auth.users u
  where u.email like 'rls-%@example.test' and u.id in (r.sender_id, r.recipient_id);
delete from public.friendships f using auth.users u
  where u.email like 'rls-%@example.test' and u.id in (f.user_low_id, f.user_high_id);
delete from public.blocks b using auth.users u
  where u.email like 'rls-%@example.test' and u.id in (b.blocker_id, b.blocked_id);
delete from public.notifications n using auth.users u
  where u.email like 'rls-%@example.test' and u.id = n.recipient_id;
delete from private.rate_limit_hits where true;
delete from public.account_restrictions r using auth.users u
  where u.email like 'rls-%@example.test' and u.id = r.user_id and r.case_id is null;

insert into public.platform_staff (user_id, person_id, active, can_review_csam, note)
values
  (test_support.user_id('staff_active'), test_support.user_id('staff_person'), true, false, 'fixture'),
  (test_support.user_id('staff_inactive'), null, false, false, 'fixture')
on conflict (user_id) do update
  set person_id = excluded.person_id, active = excluded.active, can_review_csam = excluded.can_review_csam;

do $$
declare
  v_community public.communities;
  v_code text;
  v_everyone uuid;
  v_moderator uuid;
  v_channel uuid;
begin
  perform test_support.become('owner');
  v_community := public.create_community('TEST: Hearth', 'Fixture community for the SQL and backend suites.');
  v_code := (public.create_invite(v_community.id, null, 24)).code;

  perform test_support.become('member_a');
  perform public.join_community(v_code);
  perform test_support.become('member_b');
  perform public.join_community(v_code);
  perform test_support.become('server_mod');
  perform public.join_community(v_code);

  perform test_support.become('owner');
  select r.id into v_everyone from public.roles r where r.community_id = v_community.id and r.is_everyone;
  select r.id into v_moderator from public.roles r where r.community_id = v_community.id and r.name = 'Moderator';
  perform public.set_member_roles(v_community.id, test_support.user_id('server_mod'), array[v_moderator]);

  v_channel := (public.create_channel(v_community.id, 'text', 'read-only', 'Announcements.')).id;
  perform public.set_channel_overwrite(v_channel, v_everyone, null, null, false, null);

  v_channel := (public.create_channel(v_community.id, 'text', 'staff-room', null)).id;
  perform public.set_channel_overwrite(v_channel, v_everyone, null, false, null, null);
  perform public.set_channel_overwrite(v_channel, v_moderator, null, true, null, null);

  perform public.create_channel(v_community.id, 'voice', 'Lounge');
  perform test_support.become(null);
end;
$$;

-- Lookups the suites use.
create or replace function test_support.hearth_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.communities c where c.name = 'TEST: Hearth';
$$;

create or replace function test_support.channel_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ch.id from public.channels ch
  where ch.community_id = test_support.hearth_id() and ch.name = p_name;
$$;

create or replace function test_support.role_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.roles r
  where r.community_id = test_support.hearth_id() and r.name = p_name;
$$;

grant execute on all functions in schema test_support to public;
delete from private.rate_limit_hits where true;
