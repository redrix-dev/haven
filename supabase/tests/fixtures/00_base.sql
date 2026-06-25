select test_support.note('fixtures/00_base: normalize fixture profile usernames');

do $$
declare
  v_key text;
  v_user_id uuid;
  v_username text;
begin
  foreach v_key in array array[
    'community_owner',
    'member_a',
    'member_b',
    'non_member',
    'server_mod',
    'platform_staff_active',
    'platform_staff_inactive'
  ]
  loop
    v_user_id := test_support.fixture_user_id(v_key);
    v_username := test_support.fixture_username(v_key);

    if v_user_id is null then
      raise exception 'Fixture auth user missing for key "%". Run npm run test:db:users first.', v_key;
    end if;

    update public.profiles
    set username = v_username
    where id = v_user_id
      and username is distinct from v_username;
  end loop;
end $$;

