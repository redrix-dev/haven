-- Pack: chatter
-- A short conversation in DEV: Hearth #dev-chat, sent through the real RPCs:
-- replies, an edit, a deleted message, a link, a mention, reactions, and long
-- and multi-line messages. Needs the "community" pack. Safe to re-run.

select test_support.note('seeds/dev/20_chatter: a conversation in #dev-chat');
select test_support.become(null);

delete from public.messages m
using public.channels ch, public.communities c
where m.channel_id = ch.id and ch.community_id = c.id and c.name = 'DEV: Hearth' and ch.name = 'dev-chat';
delete from private.rate_limit_hits where true;

do $$
declare
  v_channel uuid;
  v_first uuid;
  v_question uuid;
  v_typo uuid;
  v_regret uuid;

  -- Send as one of the test users and come back.
  -- (plpgsql has no nested functions, so this is spelled out below.)
begin
  select ch.id into v_channel
  from public.channels ch join public.communities c on c.id = ch.community_id
  where c.name = 'DEV: Hearth' and ch.name = 'dev-chat';
  if v_channel is null then
    raise exception 'Seed the "community" pack first: DEV: Hearth #dev-chat is missing.';
  end if;

  perform test_support.become('owner');
  v_first := (public.send_message(v_channel, 'Welcome to the dev backend. Everything here is seeded and can be thrown away.')).id;

  perform test_support.become('member_a');
  v_question := (public.send_message(v_channel, 'Does a reply show the message it answers?', v_first)).id;

  perform test_support.become('member_b');
  perform public.send_message(v_channel, 'It should. This one is a reply to the question.', v_question);
  v_typo := (public.send_message(v_channel, 'This mesage has a typo.')).id;
  perform public.edit_message(v_typo, 'This message had a typo, and was edited.');

  perform test_support.become('member_a');
  v_regret := (public.send_message(v_channel, 'This one gets deleted. You should never see it.')).id;
  perform public.delete_message(v_regret);
  perform public.send_message(v_channel, 'A link, for the preview card: https://example.com/');
  perform public.send_message(v_channel, 'A mention: @rls_owner can you see this highlighted?');

  perform test_support.become('server_mod');
  perform public.send_message(v_channel, E'Several lines:\n\n- one\n- two\n- three\n\nand a closing line.');
  perform public.send_message(v_channel, repeat('A long message to check wrapping and the composer''s height. ', 30));

  perform test_support.become('owner');
  perform public.set_reaction(v_first, '👋', true);
  perform test_support.become('member_a');
  perform public.set_reaction(v_first, '👋', true);
  perform public.set_reaction(v_first, '🎉', true);
  perform test_support.become(null);
end $$;

delete from private.rate_limit_hits where true;
