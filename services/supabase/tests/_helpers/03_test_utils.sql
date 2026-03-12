create or replace function test_support.fixture_user_ids()
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public, test_support
as $$
  select test_support.fixture_user_id(key)
  from (values
    ('community_owner'),
    ('member_a'),
    ('member_b'),
    ('non_member'),
    ('server_mod'),
    ('platform_staff_active'),
    ('platform_staff_inactive')
  ) as v(key)
  where test_support.fixture_user_id(key) is not null;
$$;

create or replace function test_support.cleanup_fixture_domain_state()
returns void
language plpgsql
security definer
set search_path = public, test_support
as $$
declare
  v_community_id uuid := test_support.fixture_community_id();
begin
  -- Clean app-domain data created by prior local test runs for fixture users/community.
  delete from public.dm_conversations dc
  where (dc.direct_user_low_id in (select user_id from test_support.fixture_user_ids()))
     or (dc.direct_user_high_id in (select user_id from test_support.fixture_user_ids()));

  delete from public.user_blocks ub
  where ub.blocker_user_id in (select user_id from test_support.fixture_user_ids())
     or ub.blocked_user_id in (select user_id from test_support.fixture_user_ids());

  delete from public.friendships f
  where f.user_low_id in (select user_id from test_support.fixture_user_ids())
     or f.user_high_id in (select user_id from test_support.fixture_user_ids());

  delete from public.friend_requests fr
  where fr.sender_user_id in (select user_id from test_support.fixture_user_ids())
     or fr.recipient_user_id in (select user_id from test_support.fixture_user_ids());

  if v_community_id is not null then
    delete from public.messages m
    where m.community_id = v_community_id;
  end if;

  delete from public.notification_recipients nr
  using public.notification_events ne
  where nr.event_id = ne.id
    and (
      nr.recipient_user_id in (select user_id from test_support.fixture_user_ids())
      or ne.actor_user_id in (select user_id from test_support.fixture_user_ids())
    );

  delete from public.notification_events ne
  where not exists (
    select 1
    from public.notification_recipients nr
    where nr.event_id = ne.id
  );

  delete from public.notification_delivery_traces ndt
  where ndt.recipient_user_id in (select user_id from test_support.fixture_user_ids())
     or ndt.notification_recipient_id is null;

  delete from public.web_push_subscriptions wps
  where wps.user_id in (select user_id from test_support.fixture_user_ids());
end;
$$;

grant usage on schema test_support to public;
grant execute on all functions in schema test_support to public;

