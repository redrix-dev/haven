create or replace function test_support.fixture_user_email(p_key text)
returns text
language sql
stable
security definer
set search_path = public, auth, test_support
as $$
  select case lower(trim(coalesce(p_key, '')))
    when 'community_owner' then 'rls-owner@example.test'
    when 'member_a' then 'rls-member-a@example.test'
    when 'member_b' then 'rls-member-b@example.test'
    when 'non_member' then 'rls-non-member@example.test'
    when 'server_mod' then 'rls-server-mod@example.test'
    when 'platform_staff_active' then 'rls-staff-active@example.test'
    when 'platform_staff_inactive' then 'rls-staff-inactive@example.test'
    else null
  end;
$$;

create or replace function test_support.fixture_username(p_key text)
returns text
language sql
stable
security definer
set search_path = public, test_support
as $$
  select case lower(trim(coalesce(p_key, '')))
    when 'community_owner' then 'rls_owner'
    when 'member_a' then 'rls_member_a'
    when 'member_b' then 'rls_member_b'
    when 'non_member' then 'rls_non_member'
    when 'server_mod' then 'rls_server_mod'
    when 'platform_staff_active' then 'rls_staff_active'
    when 'platform_staff_inactive' then 'rls_staff_inactive'
    else null
  end;
$$;

create or replace function test_support.fixture_user_id(p_key text)
returns uuid
language sql
stable
security definer
set search_path = public, auth, test_support
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(test_support.fixture_user_email(p_key))
  limit 1;
$$;

create or replace function test_support.fixture_community_name()
returns text
language sql
immutable
as $$
  select 'TEST:RLS Community'::text;
$$;

create or replace function test_support.fixture_community_id()
returns uuid
language sql
stable
security definer
set search_path = public, test_support
as $$
  select c.id
  from public.communities c
  where c.name = test_support.fixture_community_name()
  order by c.created_at asc
  limit 1;
$$;

create or replace function test_support.fixture_channel_id(p_channel_name text)
returns uuid
language sql
stable
security definer
set search_path = public, test_support
as $$
  select ch.id
  from public.channels ch
  where ch.community_id = test_support.fixture_community_id()
    and lower(ch.name) = lower(trim(coalesce(p_channel_name, 'general')))
  order by ch.position asc, ch.created_at asc
  limit 1;
$$;

create or replace function test_support.fixture_member_id(p_user_key text)
returns uuid
language sql
stable
security definer
set search_path = public, test_support
as $$
  select cm.id
  from public.community_members cm
  where cm.community_id = test_support.fixture_community_id()
    and cm.user_id = test_support.fixture_user_id(p_user_key)
  limit 1;
$$;

create or replace function test_support.fixture_role_id(p_role_name text)
returns uuid
language sql
stable
security definer
set search_path = public, test_support
as $$
  select r.id
  from public.roles r
  where r.community_id = test_support.fixture_community_id()
    and lower(r.name) = lower(trim(p_role_name))
  limit 1;
$$;

