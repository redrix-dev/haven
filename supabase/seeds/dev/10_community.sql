-- Pack: community
-- "DEV: Hearth", a community to click around in. Safe to re-run.
-- Owner rls_owner; members rls_member_a, rls_member_b, rls_server_mod (Moderator).
-- rls_non_member stays out so "not a member" paths have someone to test with.
-- It is also the Alpha onboarding target, so mobile onboarding can be
-- finished on the dev backend (rls_non_member is the account to try it with).

select test_support.note('seeds/dev/10_community: DEV: Hearth');

do $$
declare
  v_owner uuid := test_support.fixture_user_id('community_owner');
  v_mod uuid := test_support.fixture_user_id('server_mod');
  v_community uuid;
  v_everyone uuid;
  v_moderator uuid;
  v_mod_member uuid;
  v_channel uuid;
  v_spec record;
begin
  select c.id into v_community
  from public.communities c
  where c.name = 'DEV: Hearth'
  order by c.created_at
  limit 1;

  if v_community is null then
    insert into public.communities (name, description, created_by_user_id)
    values ('DEV: Hearth', 'Seeded dev community. Rebuilt by npm run devdb -- reset.', v_owner)
    returning id into v_community;
  end if;

  insert into public.community_members (community_id, user_id, is_owner)
  select v_community, test_support.fixture_user_id(k), false
  from unnest(array['member_a', 'member_b', 'server_mod']) as k
  on conflict (community_id, user_id) do nothing;

  select r.id into v_everyone from public.roles r
  where r.community_id = v_community and lower(r.name) = '@everyone' limit 1;
  select r.id into v_moderator from public.roles r
  where r.community_id = v_community and lower(r.name) = 'moderator' limit 1;
  select cm.id into v_mod_member from public.community_members cm
  where cm.community_id = v_community and cm.user_id = v_mod limit 1;

  insert into public.member_roles (community_id, member_id, role_id, assigned_by_user_id)
  values (v_community, v_mod_member, v_moderator, v_owner)
  on conflict (member_id, role_id) do nothing;

  -- "general" already exists: the community's insert trigger creates it.
  for v_spec in
    select * from (values
      ('announcements', 'text'::public.channel_kind, 1, 'Read-only for members.'),
      ('dev-chat',      'text'::public.channel_kind, 2, 'Seeded conversation lives here.'),
      ('scrollback',    'text'::public.channel_kind, 3, 'Thousands of messages for paging tests.'),
      ('staff-room',    'text'::public.channel_kind, 4, 'Moderators only.'),
      ('Lounge',        'voice'::public.channel_kind, 5, null)
    ) as t(name, kind, position, topic)
  loop
    if not exists (
      select 1 from public.channels ch
      where ch.community_id = v_community and ch.name = v_spec.name
    ) then
      insert into public.channels (community_id, name, kind, position, topic, created_by_user_id)
      values (v_community, v_spec.name, v_spec.kind, v_spec.position, v_spec.topic, v_owner);
    end if;
  end loop;

  -- announcements: everyone can read, only moderators can post.
  select ch.id into v_channel from public.channels ch
  where ch.community_id = v_community and ch.name = 'announcements';
  insert into public.channel_role_overwrites (community_id, channel_id, role_id, can_view, can_send, can_manage)
  values
    (v_community, v_channel, v_everyone, true, false, null),
    (v_community, v_channel, v_moderator, true, true, null)
  on conflict (channel_id, role_id) do update
  set can_view = excluded.can_view, can_send = excluded.can_send, can_manage = excluded.can_manage;

  -- staff-room: hidden from everyone but moderators.
  select ch.id into v_channel from public.channels ch
  where ch.community_id = v_community and ch.name = 'staff-room';
  insert into public.channel_role_overwrites (community_id, channel_id, role_id, can_view, can_send, can_manage)
  values
    (v_community, v_channel, v_everyone, false, false, null),
    (v_community, v_channel, v_moderator, true, true, true)
  on conflict (channel_id, role_id) do update
  set can_view = excluded.can_view, can_send = excluded.can_send, can_manage = excluded.can_manage;

  -- Alpha onboarding joins new mobile accounts here. Without a target the
  -- required campaign is not offered at all (HAV-24).
  update public.onboarding_campaigns
  set target_community_id = v_community
  where key = 'alpha_2026';
end $$;
