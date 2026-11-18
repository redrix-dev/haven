-- People: signing up, names, private settings, terms, staff, and restrictions.
begin;

create function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end;
$$;
grant execute on function pg_temp.code_of(text) to public;

-- A new login, the way Supabase Auth makes one.
create function pg_temp.sign_up(p_email text, p_meta jsonb) returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_meta);
  return v_id;
end;
$$;

-- ── Signing up ──────────────────────────────────────────────────────────────
create temp table newcomers as
  select 'asked' as what, pg_temp.sign_up('asked@example.test', '{"username": " Fresh_Name ", "terms_version": "2026-03-24"}') as id
  union all select 'taken', pg_temp.sign_up('taken@example.test', '{"username": "RLS_OWNER", "terms_version": "never"}')
  union all select 'invalid', pg_temp.sign_up('invalid@example.test', '{"username": "no spaces!"}')
  union all select 'silent', pg_temp.sign_up('silent@example.test', '{}');
grant select on newcomers to public;

select test_support.assert_eq_text(
  (select p.username from public.profiles p where p.id = (select id from newcomers where what = 'asked')),
  'Fresh_Name', 'a new login gets the name it asked for');
select test_support.assert_query_count(
  $$ select 1 from public.user_settings s where s.user_id in (select id from newcomers) and s.theme = 'default' $$, 4,
  'and a settings row');
select test_support.assert_query_count(
  $$ select 1 from public.terms_acceptances t
     where t.user_id = (select id from newcomers where what = 'asked') and t.version = '2026-03-24' $$, 1,
  'and its acceptance of the terms it was shown');
select test_support.assert_query_count(
  $$ select 1 from public.profiles p join newcomers n on n.id = p.id
     where n.what in ('taken', 'invalid', 'silent')
       and p.username = 'user_' || left(replace(p.id::text, '-', ''), 12) $$, 3,
  'a taken, invalid or missing name becomes a generated one, to change later');
select test_support.assert_query_count(
  $$ select 1 from public.terms_acceptances t where t.user_id = (select id from newcomers where what = 'taken') $$, 0,
  'terms that do not exist are not recorded as accepted');

-- ── Reading people ──────────────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.assert_eq_text(
  (select string_agg(p.username, ',' order by p.username)
   from public.get_profiles(array[test_support.user_id('member_b'), test_support.user_id('non_member'), gen_random_uuid()]) p),
  'rls_member_b,rls_non_member', 'people are looked up by id; an unknown id is simply absent');
select test_support.expect_error(
  $$ select public.get_profiles(array(select gen_random_uuid() from generate_series(1, 201))) $$, 'too_many_ids');
select test_support.expect_error($$ select * from public.profiles $$, 'permission denied');
select test_support.become(null);

-- Signed in is required, and says so in a way the apps can act on.
select set_config('role', 'authenticated', true);
select test_support.expect_error($$ select public.get_profiles('{}') $$, 'not_signed_in');
select test_support.assert_eq_text(pg_temp.code_of($$ select public.get_profiles('{}') $$), 'PT401', 'no session is a 401');
select set_config('role', 'anon', true);
select test_support.expect_error($$ select public.get_profiles('{}') $$, 'permission denied');
-- Except asking whether a name is taken, which the sign-up form does.
select test_support.assert_eq_text(
  public.username_taken(' Rls_Member_B ')::text, 'true', 'a visitor learns a name is taken, in any case');
select test_support.assert_eq_text(
  public.username_taken('nobody_has_this')::text, 'false', 'and that a free one is free');
select test_support.become(null);

-- ── Changing your name and bio ──────────────────────────────────────────────
select test_support.become('member_a');
select test_support.assert_eq_text((public.update_my_profile('  New_Name ')).username, 'New_Name', 'a new name, trimmed');
select test_support.expect_error($$ select public.update_my_profile('x') $$, 'username_invalid');
select test_support.expect_error($$ select public.update_my_profile('has space') $$, 'username_invalid');
select test_support.expect_error($$ select public.update_my_profile('RLS_MEMBER_B') $$, 'username_taken');
select test_support.assert_eq_text(
  pg_temp.code_of($$ select public.update_my_profile('rls_member_b') $$), 'PT409', 'a taken name is a conflict');
select test_support.assert_eq_text(
  (public.update_my_profile('NEW_NAME')).username, 'NEW_NAME', 'changing only the case of your own name is allowed');
select test_support.expect_error($$ select public.update_my_profile(null, repeat('x', 501)) $$, 'bio_too_long');
select public.update_my_profile(null, '  hello  ');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.profiles p
     where p.id = test_support.user_id('member_a') and p.username = 'NEW_NAME' and p.bio = 'hello' $$, 1,
  'what was not passed is left alone');
select test_support.become('member_a');
select public.update_my_profile(null, '');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.profiles p
     where p.id = test_support.user_id('member_a') and p.bio is null and p.username = 'NEW_NAME' $$, 1,
  'an empty bio clears it, and nothing else');

-- ── Private settings ────────────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.assert_eq_text((public.update_my_settings('midnight')).theme, 'midnight', 'a theme is saved');
select test_support.expect_error($$ select public.update_my_settings('') $$, 'theme_invalid');
select test_support.assert_eq_text(
  (select s.details_visible_to || '|' || s.dms_from || '|' || s.friend_requests_from
   from public.update_my_settings(null, 'everyone', 'community', 'everyone') s),
  'everyone|community|everyone', 'privacy rules are settings');
select test_support.assert_eq_text(
  (select s.theme || '|' || s.details_visible_to || '|' || s.dms_from || '|' || s.friend_requests_from
   from public.update_my_settings(null, null, 'nobody') s),
  'midnight|everyone|nobody|everyone', 'each one left out is kept');
select test_support.assert_eq_text(
  (select string_agg(s.theme, ',') from public.user_settings s), 'midnight', 'you read your own settings and nobody else''s');
select test_support.expect_error($$ update public.user_settings set theme = 'direct' $$, 'permission denied');
select test_support.become(null);

-- ── Terms ───────────────────────────────────────────────────────────────────
delete from public.terms_acceptances where user_id = test_support.user_id('member_a');
select test_support.become('member_a');
select test_support.expect_error($$ select public.accept_terms('never') $$, 'unknown_terms_version');
select public.accept_terms('2026-03-24');
select public.accept_terms('2026-03-24');
select test_support.assert_query_count(
  $$ select 1 from public.terms_acceptances $$, 1, 'accepting twice is accepting once; you see only your own');
select test_support.become(null);

-- ── Haven staff ─────────────────────────────────────────────────────────────
create function pg_temp.badge(p_key text) returns boolean language sql as $$
  select p.is_staff from public.profiles p where p.id = test_support.user_id(p_key);
$$;
select test_support.assert_true(pg_temp.badge('staff_active'), 'staff carry the badge');
select test_support.assert_true(pg_temp.badge('staff_person'),
  'and so does their own account, so people see staff in their communities');
select test_support.assert_false(pg_temp.badge('staff_inactive'), 'inactive staff do not');

-- A staff account is never a person, active or not.
select test_support.become('staff_active', 'aal2');
select test_support.expect_error(
  $$ select public.send_friend_request(test_support.user_id('member_a')) $$, 'staff_account');
select test_support.become('staff_inactive');
select test_support.expect_error($$ select public.update_my_profile('renamed') $$, 'staff_account');

-- The staff list: staff read it, with a second factor.
select test_support.become('staff_active', 'aal2');
select test_support.assert_query_count($$ select 1 from public.platform_staff $$, 2, 'staff can read the staff list');
select test_support.become('staff_active');
select test_support.assert_query_count($$ select 1 from public.platform_staff $$, 0, 'not with only a password');
select test_support.become('staff_inactive', 'aal2');
select test_support.assert_query_count(
  $$ select 1 from public.platform_staff $$, 0, 'someone who was staff no longer reads the staff list');
select test_support.become('staff_person');
select test_support.assert_query_count(
  $$ select 1 from public.platform_staff $$, 0, 'a staff member''s own account gains no powers');
select test_support.become('member_a');
select test_support.assert_query_count($$ select 1 from public.platform_staff $$, 0, 'nobody else can');
select test_support.expect_error(
  $$ insert into public.platform_staff (user_id) values (test_support.user_id('member_a')) $$, 'permission denied');
select test_support.become(null);

-- The badge follows the staff list, on both accounts.
update public.platform_staff set active = true where user_id = test_support.user_id('staff_inactive');
select test_support.assert_true(pg_temp.badge('staff_inactive'), 'the badge follows the staff list');
delete from public.platform_staff where user_id = test_support.user_id('staff_inactive');
select test_support.assert_false(pg_temp.badge('staff_inactive'), 'both ways');
update public.platform_staff set active = false where user_id = test_support.user_id('staff_active');
select test_support.assert_false(pg_temp.badge('staff_person'), 'the own account loses it with the staff account');
update public.platform_staff set active = true, person_id = null where user_id = test_support.user_id('staff_active');
select test_support.assert_false(pg_temp.badge('staff_person'), 'and when the link goes');
update public.platform_staff set person_id = test_support.user_id('staff_person')
  where user_id = test_support.user_id('staff_active');
select test_support.assert_true(pg_temp.badge('staff_person'), 'and gets it back with the link');

-- An account is a staff account or a person, never both.
select test_support.expect_error(
  $$ insert into public.platform_staff (user_id, person_id)
     values (test_support.user_id('member_a'), test_support.user_id('staff_active')) $$, 'staff_link_invalid');
select test_support.expect_error(
  $$ insert into public.platform_staff (user_id, person_id)
     values (test_support.user_id('staff_person'), test_support.user_id('member_a')) $$, 'staff_link_invalid');
select test_support.expect_error(
  $$ insert into public.platform_staff (user_id, person_id)
     values (test_support.user_id('member_a'), test_support.user_id('member_a')) $$, 'platform_staff_two_accounts');
select test_support.expect_error(
  $$ insert into public.platform_staff (user_id, person_id)
     values (test_support.user_id('member_a'), test_support.user_id('staff_person')) $$, 'platform_staff_person_id_key');

-- ── Restrictions ────────────────────────────────────────────────────────────
insert into public.account_restrictions (user_id, ends_at)
values (test_support.user_id('member_b'), now() + interval '1 day');

select test_support.become('member_b');
select test_support.expect_error($$ select public.get_profiles('{}') $$, 'account_restricted');
select test_support.expect_error($$ select public.update_my_profile('still_me') $$, 'account_restricted');
select test_support.assert_eq_text(
  pg_temp.code_of($$ select public.update_my_settings('x') $$), '42501', 'a restricted account is refused as forbidden');
select test_support.assert_query_count(
  $$ select 1 from public.account_restrictions $$, 0, 'a person cannot read the restrictions table');
select test_support.become('staff_active', 'aal2');
select test_support.assert_query_count($$ select 1 from public.account_restrictions $$, 1, 'staff can');
select test_support.become('staff_active');
select test_support.assert_query_count($$ select 1 from public.account_restrictions $$, 0, 'with a second factor');
select test_support.become(null);

-- Sign-in is refused by the same row.
select test_support.assert_eq_text(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('member_b'), 'claims', '{"sub": "b"}'::jsonb)
  ) -> 'error' ->> 'http_code',
  '403', 'a restricted person is refused a token');
select test_support.assert_eq_text(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('member_a'), 'claims', '{"sub": "a"}'::jsonb)
  ) -> 'claims' ->> 'sub',
  'a', 'everyone else gets their token unchanged');
select test_support.assert_true(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('member_a'), 'claims', '{"sub": "a"}'::jsonb)
  ) -> 'claims' -> 'staff_account' is null,
  'a person''s token does not say staff account');
select test_support.assert_true(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('staff_person'), 'claims', '{"sub": "p"}'::jsonb)
  ) -> 'claims' -> 'staff_account' is null,
  'nor does a staff member''s own account');
select test_support.assert_eq_text(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('staff_active'), 'authentication_method', 'password',
      'claims', '{"sub": "s", "aal": "aal1"}'::jsonb)
  ) -> 'claims' ->> 'staff_account',
  'true', 'a staff account''s token says so, from the first password sign-in');
insert into public.platform_staff (user_id, active) values (test_support.user_id('staff_inactive'), false);
select test_support.assert_eq_text(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('staff_inactive'), 'authentication_method', 'password',
      'claims', '{"sub": "s", "aal": "aal1"}'::jsonb)
  ) -> 'claims' ->> 'staff_account',
  'true', 'an inactive staff account too');
select test_support.assert_eq_text(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('staff_active'), 'authentication_method', 'token_refresh',
      'claims', '{"sub": "s", "aal": "aal1"}'::jsonb)
  ) -> 'error' ->> 'http_code',
  '403', 'a staff session without the second factor cannot be refreshed');
select test_support.assert_eq_text(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('staff_active'), 'authentication_method', 'token_refresh',
      'claims', '{"sub": "s", "aal": "aal2"}'::jsonb)
  ) -> 'claims' ->> 'staff_account',
  'true', 'one with it can');
select test_support.assert_eq_text(
  public.auth_hook_access_token(
    jsonb_build_object('user_id', test_support.user_id('member_a'), 'authentication_method', 'token_refresh',
      'claims', '{"sub": "a", "aal": "aal1"}'::jsonb)
  ) -> 'claims' ->> 'sub',
  'a', 'a person refreshes without one');
select test_support.assert_true(
  has_function_privilege('supabase_auth_admin', 'public.auth_hook_access_token(jsonb)', 'execute')
  and has_schema_privilege('supabase_auth_admin', 'private', 'usage')
  and has_function_privilege('supabase_auth_admin', 'private.is_restricted(uuid)', 'execute')
  and has_function_privilege('supabase_auth_admin', 'private.is_staff_account(uuid)', 'execute'),
  'Supabase Auth is allowed to run the hook');
select test_support.assert_false(
  has_function_privilege('authenticated', 'public.auth_hook_access_token(jsonb)', 'execute'),
  'and a signed-in person is not');

-- It ends by itself, or by being lifted.
update public.account_restrictions set ends_at = now() - interval '1 minute';
select test_support.assert_false(private.is_restricted(test_support.user_id('member_b')), 'a suspension ends on its date');
update public.account_restrictions set ends_at = null;
select test_support.assert_true(private.is_restricted(test_support.user_id('member_b')), 'no end date is a ban');
update public.account_restrictions set lifted_at = now(), lifted_by = test_support.user_id('staff_active');
select test_support.become('member_b');
select test_support.assert_query_count(
  $$ select 1 from public.get_profiles(array[test_support.user_id('member_b')]) $$, 1, 'a lifted restriction lets them back in');
select test_support.become(null);

rollback;
