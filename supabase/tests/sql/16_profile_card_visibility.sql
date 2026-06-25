begin;

select test_support.note('suite 16: profile card details visibility');
select test_support.cleanup_fixture_domain_state();

set local role postgres;

update public.profiles
set profile_bio = 'Member B private bio'
where id = test_support.fixture_user_id('member_b');

update public.profiles
set
  profile_visibility = 'friends_only',
  profile_bio = 'Non-member friends-only bio'
where id = test_support.fixture_user_id('non_member');

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  1,
  'shared community users should be able to open the profile card shell'
);

select test_support.assert_false(
  (
    select can_view_details
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'default private profile details should be hidden from other users'
);

select test_support.assert_eq_text(
  (
    select profile_visibility
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'private',
  'default profile card visibility should be private'
);

select test_support.assert_eq_text(
  (
    select profile_bio
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  null,
  'hidden profile details should not expose the profile bio'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  1,
  'authenticated users should be able to open the profile card identity shell without a relationship'
);

select test_support.assert_false(
  (
    select can_view_details
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'unrelated users should not see private profile details'
);

select test_support.assert_not_null(
  (
    select username
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'profile card shell should still include platform username'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_true(
  (
    select can_view_details
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'users should always be able to view their own profile details'
);

select test_support.assert_eq_text(
  (
    select profile_bio
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'Member B private bio',
  'self profile card should return private bio details'
);

reset role;
set local role postgres;

update public.profiles
set
  profile_visibility = 'public',
  profile_bio = 'Member B public bio'
where id = test_support.fixture_user_id('member_b');

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_true(
  (
    select can_view_details
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'public profile details should be visible to reachable users'
);

select test_support.assert_eq_text(
  (
    select profile_bio
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'Member B public bio',
  'public profile card should return bio details'
);

select public.send_friend_request(test_support.fixture_username('non_member'));

select test_support.assert_false(
  (
    select can_view_details
    from public.get_profile_card(test_support.fixture_user_id('non_member'))
  ),
  'pending friend request should not unlock friends-only profile details'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));

select public.accept_friend_request(
  (
    select fr.id
    from public.friend_requests fr
    where fr.sender_user_id = test_support.fixture_user_id('member_a')
      and fr.recipient_user_id = test_support.fixture_user_id('non_member')
      and fr.status = 'pending'
    order by fr.created_at desc
    limit 1
  )
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_true(
  (
    select can_view_details
    from public.get_profile_card(test_support.fixture_user_id('non_member'))
  ),
  'friends-only profile details should be visible to friends'
);

select test_support.assert_eq_text(
  (
    select profile_bio
    from public.get_profile_card(test_support.fixture_user_id('non_member'))
  ),
  'Non-member friends-only bio',
  'friends-only profile card should return bio details to friends'
);

reset role;
set local role postgres;

update public.profiles
set
  profile_visibility = 'public',
  profile_bio = 'Non-member blocked public bio'
where id = test_support.fixture_user_id('non_member');

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_not_null(
  public.block_user(test_support.fixture_user_id('non_member')),
  'member_a should be able to block non_member for profile detail checks'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.get_profile_card(test_support.fixture_user_id('non_member'))
  ),
  1,
  'blockers should retain access to the profile card shell'
);

select test_support.assert_false(
  (
    select can_view_details
    from public.get_profile_card(test_support.fixture_user_id('non_member'))
  ),
  'block relationships should hide profile details even when visibility is public'
);

select test_support.assert_eq_text(
  (
    select profile_bio
    from public.get_profile_card(test_support.fixture_user_id('non_member'))
  ),
  null,
  'blocked profile details should not return bio details'
);

rollback;
