-- Pack: volume
-- 3,000 numbered messages in DEV: Hearth #scrollback, spread over the last 60
-- days, for paging and scroll tests. Needs the "community" pack. Safe to
-- re-run.
--
-- These are inserted directly, not sent: 3,000 RPC calls would trip the rate
-- limit and send 3,000 events. Ids are made in insert order, oldest first, so
-- paging by id walks them in time order.

select test_support.note('seeds/dev/40_volume: 3,000 messages in #scrollback');
select test_support.become(null);

do $$
declare
  v_channel uuid;
  v_authors uuid[] := array[
    test_support.user_id('owner'), test_support.user_id('member_a'),
    test_support.user_id('member_b'), test_support.user_id('server_mod')];
begin
  select ch.id into v_channel
  from public.channels ch join public.communities c on c.id = ch.community_id
  where c.name = 'DEV: Hearth' and ch.name = 'scrollback';
  if v_channel is null then
    raise exception 'Seed the "community" pack first: DEV: Hearth #scrollback is missing.';
  end if;

  delete from public.messages m where m.channel_id = v_channel;

  insert into public.messages (channel_id, author_id, body, created_at)
  select v_channel, v_authors[1 + (n % 4)], 'Scrollback message #' || n,
         now() - interval '60 days' + (n * interval '60 days' / 3000)
  from generate_series(1, 3000) n
  order by n;

  update public.channels c
  set latest_message_id = (
    select m.id from public.messages m where m.channel_id = v_channel order by m.id desc limit 1)
  where c.id = v_channel;
end $$;
