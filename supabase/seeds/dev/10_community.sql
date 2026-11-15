-- Pack: community
-- "DEV: Hearth", a community to click around in, built through the same RPCs
-- the apps call. Safe to re-run: it deletes the community and makes it again.
--
--   owner rls_owner; members rls_member_a, rls_member_b, rls_server_mod (Moderator)
--     #general         everyone reads and writes
--     #announcements   everyone reads, only moderators and the owner write
--     #dev-chat        the seeded conversation (pack "chatter")
--     #scrollback      thousands of messages (pack "volume")
--     #staff-room      hidden from everyone except moderators
--     voice: Lounge
--   rls_non_member stays out, so "not a member" paths have someone to test
--   with. It is also who the required introduction below is for: finishing it
--   joins them here, which is how mobile onboarding is tried on this backend.

select test_support.note('seeds/dev/10_community: DEV: Hearth');
select test_support.become(null);
delete from public.communities c where c.name = 'DEV: Hearth';
delete from private.rate_limit_hits where true;

do $$
declare
  v_community public.communities;
  v_code text;
  v_everyone uuid;
  v_moderator uuid;
  v_channel uuid;
  v_member text;
begin
  perform test_support.become('owner');
  v_community := public.create_community('DEV: Hearth', 'Seeded dev community. Rebuilt by npm run devdb -- reset.');
  v_code := (public.create_invite(v_community.id, null, null)).code;

  foreach v_member in array array['member_a', 'member_b', 'server_mod'] loop
    perform test_support.become(v_member);
    perform public.join_community(v_code);
  end loop;

  perform test_support.become('owner');
  select r.id into v_everyone from public.roles r where r.community_id = v_community.id and r.is_everyone;
  select r.id into v_moderator from public.roles r where r.community_id = v_community.id and r.name = 'Moderator';
  perform public.set_member_roles(v_community.id, test_support.user_id('server_mod'), array[v_moderator]);

  v_channel := (public.create_channel(v_community.id, 'text', 'announcements', 'Read-only for members.')).id;
  perform public.set_channel_overwrite(v_channel, v_everyone, null, null, false, null);
  perform public.set_channel_overwrite(v_channel, v_moderator, null, null, true, null);

  perform public.create_channel(v_community.id, 'text', 'dev-chat', 'Seeded conversation lives here.');
  perform public.create_channel(v_community.id, 'text', 'scrollback', 'Thousands of messages for paging tests.');

  v_channel := (public.create_channel(v_community.id, 'text', 'staff-room', 'Moderators only.')).id;
  perform public.set_channel_overwrite(v_channel, v_everyone, null, false, null, null);
  perform public.set_channel_overwrite(v_channel, v_moderator, null, true, null, null);

  perform public.create_channel(v_community.id, 'voice', 'Lounge');
  perform test_support.become(null);

  -- A required introduction that joins this community. Introductions are the
  -- operator's data, so this one is plain SQL.
  insert into public.onboarding_campaigns (key, title, description, required, community_id, platforms)
  values (
    'dev_join_hearth', 'Join the testers',
    'Haven is in alpha. Finishing this joins you to the testers'' community.',
    true, v_community.id, '{ios,android}')
  on conflict (key) do update set community_id = excluded.community_id, active = true;
  delete from public.onboarding_progress o where o.campaign_key = 'dev_join_hearth';
end $$;

delete from private.rate_limit_hits where true;
