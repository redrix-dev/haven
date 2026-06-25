begin;

select test_support.note('suite 19: onboarding campaigns');
select test_support.cleanup_fixture_domain_state();

set local role postgres;

update public.onboarding_campaigns
set is_active = false
where key = 'alpha_2026';

insert into public.feature_flags_catalog (
  key,
  description,
  enabled_by_default
)
values (
  'mobile_onboarding_test',
  'Test mobile onboarding flag.',
  true
)
on conflict (key) do update
set
  description = excluded.description,
  enabled_by_default = excluded.enabled_by_default,
  updated_at = timezone('utc', now());

insert into public.flairs (
  key,
  label,
  description,
  color_token,
  background_token,
  icon_key,
  scope
) values (
  'onboarding_alpha_test',
  'ALPHA',
  'Test alpha flair.',
  'primary',
  'surface-card',
  'sparkles',
  'platform'
) on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  color_token = excluded.color_token,
  background_token = excluded.background_token,
  icon_key = excluded.icon_key,
  is_active = true,
  is_retired = false,
  updated_at = timezone('utc', now());

insert into public.onboarding_campaigns (
  key,
  feature_flag_key,
  title,
  description,
  target_community_id,
  target_flair_key,
  required,
  platform_scope,
  distribution_scope,
  is_active,
  sort_order
)
values (
  'onboarding_test_alpha',
  'mobile_onboarding_test',
  'Join the Test Alpha',
  'Test onboarding.',
  test_support.fixture_community_id(),
  'onboarding_alpha_test',
  true,
  'all',
  'all',
  true,
  1
)
on conflict (key) do update
set
  feature_flag_key = excluded.feature_flag_key,
  title = excluded.title,
  description = excluded.description,
  target_community_id = excluded.target_community_id,
  target_flair_key = excluded.target_flair_key,
  required = excluded.required,
  platform_scope = excluded.platform_scope,
  distribution_scope = excluded.distribution_scope,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

insert into public.onboarding_campaigns (
  key,
  feature_flag_key,
  title,
  target_community_id,
  required,
  is_active,
  sort_order
)
values (
  'onboarding_ban_test',
  'mobile_onboarding_test',
  'Join the Test Alpha Ban',
  test_support.fixture_community_id(),
  true,
  true,
  2
)
on conflict (key) do update
set
  feature_flag_key = excluded.feature_flag_key,
  title = excluded.title,
  target_community_id = excluded.target_community_id,
  required = excluded.required,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

delete from public.community_members
where community_id = test_support.fixture_community_id()
  and user_id in (
    test_support.fixture_user_id('non_member'),
    test_support.fixture_user_id('platform_staff_inactive')
  );

delete from public.user_onboarding_campaigns
where campaign_key in ('onboarding_test_alpha', 'onboarding_ban_test');

reset role;
set local role anon;
select test_support.expect_exception(
  'select * from public.list_my_onboarding_campaigns(''ios'', ''all'', ''0.0.0'')',
  'permission'
);

select test_support.expect_exception(
  'select * from public.complete_onboarding_campaign(''onboarding_test_alpha'', ''ios'', ''all'', ''0.0.0'')',
  'permission'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_my_onboarding_campaigns('ios', 'all', '0.0.0')
    where campaign_key = 'onboarding_test_alpha'
  ),
  1,
  'active default-enabled campaign should appear for eligible users'
);

reset role;
set local role postgres;
insert into public.user_onboarding_campaigns (
  user_id,
  campaign_key,
  status,
  completed_at
) values (
  test_support.fixture_user_id('member_a'),
  'onboarding_test_alpha',
  'completed',
  timezone('utc', now())
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_my_onboarding_campaigns('ios', 'all', '0.0.0')
    where campaign_key = 'onboarding_test_alpha'
  ),
  0,
  'completed campaign should not appear again'
);

reset role;
set local role postgres;
delete from public.user_onboarding_campaigns
where user_id = test_support.fixture_user_id('member_a')
  and campaign_key = 'onboarding_test_alpha';

update public.onboarding_campaigns
set is_active = false
where key = 'onboarding_test_alpha';

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_my_onboarding_campaigns('ios', 'all', '0.0.0')
    where campaign_key = 'onboarding_test_alpha'
  ),
  0,
  'inactive campaigns should not appear'
);

reset role;
set local role postgres;
update public.onboarding_campaigns
set is_active = true,
    platform_scope = 'ios'
where key = 'onboarding_test_alpha';

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_my_onboarding_campaigns('android', 'all', '0.0.0')
    where campaign_key = 'onboarding_test_alpha'
  ),
  0,
  'wrong-platform campaigns should not appear'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_my_onboarding_campaigns('ios', 'all', '0.0.0')
    where campaign_key = 'onboarding_test_alpha'
  ),
  1,
  'matching platform campaigns should appear'
);

reset role;
set local role postgres;
update public.onboarding_campaigns
set platform_scope = 'all'
where key = 'onboarding_test_alpha';

insert into public.user_feature_flag_overrides (
  user_id,
  flag_key,
  enabled,
  reason
) values (
  test_support.fixture_user_id('member_a'),
  'mobile_onboarding_test',
  false,
  'test disabled'
)
on conflict (user_id, flag_key) do update
set enabled = excluded.enabled,
    reason = excluded.reason,
    updated_at = timezone('utc', now());

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_my_onboarding_campaigns('ios', 'all', '0.0.0')
    where campaign_key = 'onboarding_test_alpha'
  ),
  0,
  'disabled user feature flag should hide campaign'
);

reset role;
set local role postgres;
delete from public.user_feature_flag_overrides
where user_id = test_support.fixture_user_id('member_a')
  and flag_key = 'mobile_onboarding_test';

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

select public.create_community_flair_grant_rule(
  test_support.fixture_community_id(),
  'onboarding_alpha_test',
  'community_join'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.complete_onboarding_campaign(
      'onboarding_test_alpha',
      'ios',
      'all',
      '0.0.0'
    )
    where campaign_key = 'onboarding_test_alpha'
      and community_id = test_support.fixture_community_id()
      and joined = false
  ),
  1,
  'completing onboarding should work when the user already belongs to the community'
);

select test_support.assert_true(
  exists (
    select 1
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where uf.user_id = test_support.fixture_user_id('community_owner')
      and uf.source_community_id = test_support.fixture_community_id()
      and uf.revoked_at is null
      and f.key = 'onboarding_alpha_test'
  ),
  'existing community members should receive active community flair when completing onboarding'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.complete_onboarding_campaign(
      'onboarding_test_alpha',
      'ios',
      'all',
      '0.0.0'
    )
    where campaign_key = 'onboarding_test_alpha'
      and community_id = test_support.fixture_community_id()
      and joined = true
  ),
  1,
  'completing onboarding should join the target community'
);

select test_support.assert_true(
  exists (
    select 1
    from public.community_members cm
    where cm.community_id = test_support.fixture_community_id()
      and cm.user_id = test_support.fixture_user_id('non_member')
  ),
  'onboarding completion should create community membership'
);

select test_support.assert_true(
  exists (
    select 1
    from public.user_onboarding_campaigns uc
    where uc.user_id = test_support.fixture_user_id('non_member')
      and uc.campaign_key = 'onboarding_test_alpha'
      and uc.status = 'completed'
      and uc.joined_community_id = test_support.fixture_community_id()
  ),
  'onboarding completion should mark campaign completed'
);

select test_support.assert_true(
  exists (
    select 1
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where uf.user_id = test_support.fixture_user_id('non_member')
      and uf.source_community_id = test_support.fixture_community_id()
      and uf.revoked_at is null
      and f.key = 'onboarding_alpha_test'
  ),
  'community flair rule should grant alpha flair through onboarding join'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.complete_onboarding_campaign(
      'onboarding_test_alpha',
      'ios',
      'all',
      '0.0.0'
    )
    where campaign_key = 'onboarding_test_alpha'
      and joined = false
  ),
  1,
  'completing an already completed campaign should be idempotent'
);

reset role;
set local role postgres;
delete from public.community_members
where community_id = test_support.fixture_community_id()
  and user_id = test_support.fixture_user_id('platform_staff_inactive');

insert into public.community_bans (
  community_id,
  banned_user_id,
  banned_by_user_id,
  reason
) values (
  test_support.fixture_community_id(),
  test_support.fixture_user_id('platform_staff_inactive'),
  test_support.fixture_user_id('community_owner'),
  'test ban'
)
on conflict do nothing;

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_inactive'));

select test_support.expect_exception(
  'select * from public.complete_onboarding_campaign(''onboarding_ban_test'', ''ios'', ''all'', ''0.0.0'')',
  'cannot join this community'
);

rollback;
