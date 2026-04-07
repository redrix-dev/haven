begin;

select test_support.note('suite 15: community bans list returns usernames after membership removal');
select test_support.cleanup_fixture_domain_state();

update public.profiles
set avatar_url = 'https://example.com/member-a-bans-avatar.webp'
where id = test_support.fixture_user_id('member_a');

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

select *
from public.ban_community_member(
  test_support.fixture_community_id(),
  test_support.fixture_user_id('member_a'),
  'list community bans username coverage'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.profiles
    where id = test_support.fixture_user_id('member_a')
  ),
  0,
  'direct profile visibility should be lost once the banned user no longer shares community membership'
);

select test_support.assert_eq_text(
  (
    select username
    from public.list_community_bans(test_support.fixture_community_id())
    where banned_user_id = test_support.fixture_user_id('member_a')
    limit 1
  ),
  test_support.fixture_username('member_a'),
  'community members should still receive the banned username through list_community_bans'
);

select test_support.assert_eq_text(
  (
    select avatar_url
    from public.list_community_bans(test_support.fixture_community_id())
    where banned_user_id = test_support.fixture_user_id('member_a')
    limit 1
  ),
  'https://example.com/member-a-bans-avatar.webp',
  'list_community_bans should preserve the banned user avatar when one exists'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_community_bans(test_support.fixture_community_id())
  ),
  0,
  'non-members should not receive community bans through list_community_bans'
);

rollback;
