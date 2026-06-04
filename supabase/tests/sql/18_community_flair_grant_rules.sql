begin;

select test_support.note('suite 18: community flair grant rules');
select test_support.cleanup_fixture_domain_state();

set local role postgres;

insert into public.flairs (
  key,
  label,
  description,
  color_token,
  background_token,
  icon_key,
  scope
) values
  (
    'alpha_community',
    'Alpha',
    'Joined the alpha community.',
    'primary',
    'surface-card',
    'sparkles',
    'platform'
  ),
  (
    'disabled_community',
    'Disabled',
    null,
    'muted-foreground',
    'muted',
    null,
    'platform'
  );

delete from public.community_members
where community_id = test_support.fixture_community_id()
  and user_id in (
    test_support.fixture_user_id('non_member'),
    test_support.fixture_user_id('platform_staff_inactive')
  );

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.expect_exception(
  format(
    'select public.create_community_flair_grant_rule(%L::uuid, %L, %L)',
    test_support.fixture_community_id(),
    'alpha_community',
    'community_join'
  ),
  'Only platform staff can manage community flair rules'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

select test_support.assert_not_null(
  public.create_community_flair_grant_rule(
    test_support.fixture_community_id(),
    'alpha_community',
    'community_join'
  ),
  'platform staff should be able to create a community flair rule'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where f.key = 'alpha_community'
      and uf.source_community_id = test_support.fixture_community_id()
      and uf.revoked_at is null
  ),
  (
    select count(*)::bigint
    from public.community_members cm
    where cm.community_id = test_support.fixture_community_id()
  ),
  'creating a rule should backfill current community members'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where f.key = 'alpha_community'
      and uf.user_id = test_support.fixture_user_id('member_b')
      and uf.revoked_at is null
  ),
  1,
  'backfill should grant flair to existing members'
);

select public.create_community_flair_grant_rule(
  test_support.fixture_community_id(),
  'alpha_community',
  'community_join'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where f.key = 'alpha_community'
      and uf.user_id = test_support.fixture_user_id('member_b')
      and uf.revoked_at is null
  ),
  1,
  'recreating a rule should not duplicate active grants'
);

reset role;
set local role postgres;

insert into public.community_members (community_id, user_id, is_owner)
values (
  test_support.fixture_community_id(),
  test_support.fixture_user_id('non_member'),
  false
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where f.key = 'alpha_community'
      and uf.user_id = test_support.fixture_user_id('non_member')
      and uf.source_community_id = test_support.fixture_community_id()
      and uf.revoked_at is null
  ),
  1,
  'new community membership should grant active community flair'
);

delete from public.community_members
where community_id = test_support.fixture_community_id()
  and user_id = test_support.fixture_user_id('non_member');

insert into public.community_members (community_id, user_id, is_owner)
values (
  test_support.fixture_community_id(),
  test_support.fixture_user_id('non_member'),
  false
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where f.key = 'alpha_community'
      and uf.user_id = test_support.fixture_user_id('non_member')
      and uf.revoked_at is null
  ),
  1,
  'rejoining should not duplicate an already earned flair'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

select public.create_community_flair_grant_rule(
  test_support.fixture_community_id(),
  'disabled_community',
  'community_join'
);

select public.disable_community_flair_grant_rule(
  (
    select r.id
    from public.community_flair_grant_rules r
    join public.flairs f on f.id = r.flair_id
    where r.community_id = test_support.fixture_community_id()
      and f.key = 'disabled_community'
    limit 1
  )
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.expect_exception(
  format(
    'select public.disable_community_flair_grant_rule(%L::uuid)',
    (
      select r.id
      from public.community_flair_grant_rules r
      join public.flairs f on f.id = r.flair_id
      where r.community_id = test_support.fixture_community_id()
        and f.key = 'alpha_community'
      limit 1
    )
  ),
  'Only platform staff can manage community flair rules'
);

reset role;
set local role postgres;

insert into public.community_members (community_id, user_id, is_owner)
values (
  test_support.fixture_community_id(),
  test_support.fixture_user_id('platform_staff_inactive'),
  false
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where f.key = 'disabled_community'
      and uf.user_id = test_support.fixture_user_id('platform_staff_inactive')
      and uf.revoked_at is null
  ),
  0,
  'disabled rules should not grant flair to future members'
);

select test_support.assert_true(
  exists (
    select 1
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where f.key = 'disabled_community'
      and uf.user_id = test_support.fixture_user_id('member_b')
      and uf.revoked_at is null
  ),
  'disabling a rule should not revoke already granted flair'
);

rollback;
