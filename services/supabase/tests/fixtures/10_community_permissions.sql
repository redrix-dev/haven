select test_support.note('fixtures/10_community_permissions: ensure test community, memberships, and mod-only channel');

do $$
declare
  v_community_id uuid;
  v_owner_id uuid := test_support.fixture_user_id('community_owner');
  v_member_a_id uuid := test_support.fixture_user_id('member_a');
  v_member_b_id uuid := test_support.fixture_user_id('member_b');
  v_server_mod_user_id uuid := test_support.fixture_user_id('server_mod');
  v_staff_active_user_id uuid := test_support.fixture_user_id('platform_staff_active');
  v_everyone_role_id uuid;
  v_moderator_role_id uuid;
  v_server_mod_member_id uuid;
  v_mods_channel_id uuid;
begin
  select c.id
  into v_community_id
  from public.communities c
  where c.name = test_support.fixture_community_name()
  order by c.created_at asc
  limit 1;

  if v_community_id is null then
    insert into public.communities (name, created_by_user_id)
    values (test_support.fixture_community_name(), v_owner_id)
    returning id into v_community_id;
  end if;

  insert into public.community_members (community_id, user_id, is_owner)
  values
    (v_community_id, v_member_a_id, false),
    (v_community_id, v_member_b_id, false),
    (v_community_id, v_server_mod_user_id, false),
    (v_community_id, v_staff_active_user_id, false)
  on conflict (community_id, user_id) do nothing;

  select r.id into v_everyone_role_id
  from public.roles r
  where r.community_id = v_community_id and lower(r.name) = '@everyone'
  limit 1;

  select r.id into v_moderator_role_id
  from public.roles r
  where r.community_id = v_community_id and lower(r.name) = 'moderator'
  limit 1;

  select cm.id into v_server_mod_member_id
  from public.community_members cm
  where cm.community_id = v_community_id and cm.user_id = v_server_mod_user_id
  limit 1;

  if v_server_mod_member_id is not null and v_moderator_role_id is not null then
    insert into public.member_roles (community_id, member_id, role_id, assigned_by_user_id)
    values (v_community_id, v_server_mod_member_id, v_moderator_role_id, v_owner_id)
    on conflict (member_id, role_id) do nothing;
  end if;

  select ch.id
  into v_mods_channel_id
  from public.channels ch
  where ch.community_id = v_community_id
    and lower(ch.name) = 'mods-only'
  limit 1;

  if v_mods_channel_id is null then
    insert into public.channels (community_id, name, kind, position, created_by_user_id)
    values (v_community_id, 'mods-only', 'text', 999, v_owner_id)
    returning id into v_mods_channel_id;
  end if;

  if v_mods_channel_id is not null and v_everyone_role_id is not null then
    insert into public.channel_role_overwrites (
      community_id,
      channel_id,
      role_id,
      can_view,
      can_send,
      can_manage
    )
    values (
      v_community_id,
      v_mods_channel_id,
      v_everyone_role_id,
      false,
      false,
      null
    )
    on conflict (channel_id, role_id) do update
    set can_view = excluded.can_view,
        can_send = excluded.can_send;
  end if;

  if v_mods_channel_id is not null and v_moderator_role_id is not null then
    insert into public.channel_role_overwrites (
      community_id,
      channel_id,
      role_id,
      can_view,
      can_send,
      can_manage
    )
    values (
      v_community_id,
      v_mods_channel_id,
      v_moderator_role_id,
      true,
      true,
      true
    )
    on conflict (channel_id, role_id) do update
    set can_view = excluded.can_view,
        can_send = excluded.can_send,
        can_manage = excluded.can_manage;
  end if;
end $$;

