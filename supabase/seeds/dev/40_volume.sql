-- Pack: volume
-- 3,000 messages in DEV: Hearth #scrollback, spread over the last 60 days,
-- for pagination, scroll restore and day-separator work. Re-running replaces it.
-- Needs pack: community.

select test_support.note('seeds/dev/40_volume: 3000 messages in #scrollback');

do $$
declare
  v_community uuid;
  v_channel uuid;
  v_authors uuid[] := array[
    test_support.fixture_user_id('community_owner'),
    test_support.fixture_user_id('member_a'),
    test_support.fixture_user_id('member_b'),
    test_support.fixture_user_id('server_mod')
  ];
  v_names text[] := array['rls_owner', 'rls_member_a', 'rls_member_b', 'rls_server_mod'];
  v_total constant integer := 3000;
  v_span constant interval := interval '60 days';
begin
  select c.id into v_community from public.communities c
  where c.name = 'DEV: Hearth' order by c.created_at limit 1;
  select id into v_channel from public.channels
  where community_id = v_community and name = 'scrollback';
  if v_channel is null then
    raise exception 'Pack "volume" needs pack "community" first.';
  end if;

  delete from public.messages where channel_id = v_channel;

  -- Message n is numbered so a missing or duplicated page is obvious on screen.
  insert into public.messages (community_id, channel_id, author_user_id, display_name, content, created_at)
  select
    v_community,
    v_channel,
    v_authors[1 + (n % 4)],
    v_names[1 + (n % 4)],
    'scrollback #' || n || ' of ' || v_total,
    timezone('utc', now()) - v_span + (v_span * n / v_total)
  from generate_series(1, v_total) as n;
end $$;
