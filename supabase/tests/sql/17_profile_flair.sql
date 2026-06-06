begin;

select test_support.note('suite 17: profile flair grants and profile-card visibility');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists flair_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant all on flair_test_ids to public;

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
    'alpha_2026',
    'Alpha',
    'Joined during the public alpha.',
    'primary',
    'surface-card',
    'sparkles',
    'platform'
  ),
  (
    'beta_2026',
    'Beta',
    'Joined during the beta.',
    'info',
    'surface-card',
    null,
    'platform'
  ),
  (
    'retired_test',
    'Retired',
    null,
    'muted-foreground',
    'muted',
    null,
    'platform'
  );

update public.flairs
set is_retired = true
where key = 'retired_test';

update public.profiles
set
  profile_visibility = 'private',
  profile_bio = 'Member B flair bio',
  active_user_flair_id = null
where id = test_support.fixture_user_id('member_b');

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

select test_support.assert_not_null(
  public.grant_user_flair(
    test_support.fixture_user_id('member_b'),
    'alpha_2026',
    'manual'
  ),
  'platform staff should be able to grant active flair'
);

insert into flair_test_ids (key, id)
select 'member_b_alpha_grant', uf.id
from public.user_flairs uf
join public.flairs f on f.id = uf.flair_id
where uf.user_id = test_support.fixture_user_id('member_b')
  and f.key = 'alpha_2026'
  and uf.revoked_at is null
limit 1
on conflict (key) do update set id = excluded.id;

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (select count(*)::bigint from public.list_my_user_flairs()),
  1,
  'users should be able to list their own granted flairs'
);

select test_support.assert_eq_text(
  (select flair_key from public.list_my_user_flairs() limit 1),
  'alpha_2026',
  'owned flair list should include flair catalog metadata'
);

select public.set_active_user_flair(
  (select user_flair_id from public.list_my_user_flairs() where flair_key = 'alpha_2026')
);

select test_support.assert_true(
  (
    select is_selected
    from public.list_my_user_flairs()
    where flair_key = 'alpha_2026'
  ),
  'users should be able to activate an owned available flair'
);

select test_support.assert_eq_text(
  (
    select active_flair_key
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'alpha_2026',
  'self profile card should include active flair'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_false(
  (
    select can_view_details
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'private profile details should remain hidden from other reachable users'
);

select test_support.assert_eq_text(
  (
    select active_flair_key
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  null,
  'hidden profile details should not expose active flair'
);

select test_support.expect_exception(
  format(
    'select public.set_active_user_flair(%L::uuid)',
    (select id from flair_test_ids where key = 'member_b_alpha_grant')
  ),
  'Cannot activate unavailable flair grant'
);

reset role;
set local role postgres;

update public.profiles
set profile_visibility = 'public'
where id = test_support.fixture_user_id('member_b');

insert into public.user_flairs (user_id, flair_id, grant_source, expires_at)
select
  test_support.fixture_user_id('member_b'),
  f.id,
  'expired_test',
  timezone('utc', now()) - interval '1 minute'
from public.flairs f
where f.key = 'beta_2026';

insert into public.user_flairs (user_id, flair_id, grant_source)
select
  test_support.fixture_user_id('member_b'),
  f.id,
  'retired_test'
from public.flairs f
where f.key = 'retired_test';

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
    select active_flair_key
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  'alpha_2026',
  'visible profile details should include active flair'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.expect_exception(
  format(
    'select public.set_active_user_flair(%L::uuid)',
    (
      select uf.id
      from public.user_flairs uf
      join public.flairs f on f.id = uf.flair_id
      where uf.user_id = test_support.fixture_user_id('member_b')
        and f.key = 'beta_2026'
      limit 1
    )
  ),
  'Cannot activate unavailable flair grant'
);

select test_support.expect_exception(
  format(
    'select public.set_active_user_flair(%L::uuid)',
    (
      select uf.id
      from public.user_flairs uf
      join public.flairs f on f.id = uf.flair_id
      where uf.user_id = test_support.fixture_user_id('member_b')
        and f.key = 'retired_test'
      limit 1
    )
  ),
  'Cannot activate unavailable flair grant'
);

select public.set_active_user_flair(null);

select test_support.assert_eq_text(
  (
    select active_flair_key
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  null,
  'users should be able to clear active flair'
);

select public.set_active_user_flair(
  (
    select uf.id
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where uf.user_id = test_support.fixture_user_id('member_b')
      and f.key = 'alpha_2026'
    limit 1
  )
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

select public.revoke_user_flair(
  (
    select uf.id
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where uf.user_id = test_support.fixture_user_id('member_b')
      and f.key = 'alpha_2026'
    limit 1
  )
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_text(
  (
    select active_flair_key
    from public.get_profile_card(test_support.fixture_user_id('member_b'))
  ),
  null,
  'revoking active flair should clear profile active flair'
);

rollback;
