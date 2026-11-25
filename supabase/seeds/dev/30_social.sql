-- Pack: social
-- Friends, a waiting friend request, and a conversation. Everything goes
-- through the real RPCs as the acting user, so rate limits, notifications and
-- realtime events are the ones the apps cause.
--
--   rls_owner   <-> rls_member_a   friends, with a conversation
--   rls_member_b -> rls_owner      a friend request waiting
--
-- Safe to re-run: it first removes what it made last time.

select test_support.note('seeds/dev/30_social: friends, a waiting request, a conversation');
select test_support.become(null);
delete from private.rate_limit_hits where true;

delete from public.channels ch
where ch.kind = 'dm' and ch.direct_key =
  least(test_support.user_id('owner'), test_support.user_id('member_a'))::text || ':'
  || greatest(test_support.user_id('owner'), test_support.user_id('member_a'))::text;
delete from public.friendships f
where f.user_low_id = least(test_support.user_id('owner'), test_support.user_id('member_a'))
  and f.user_high_id = greatest(test_support.user_id('owner'), test_support.user_id('member_a'));
delete from public.friend_requests r
where r.recipient_id = test_support.user_id('owner')
  and r.sender_id in (test_support.user_id('member_a'), test_support.user_id('member_b'));

do $$
declare
  v_conversation uuid;
begin
  -- Nobody takes friend requests until they choose to; the owner takes them
  -- from people in their communities.
  perform test_support.become('owner');
  perform public.update_my_settings(null, null, null, 'community');

  perform test_support.become('member_a');
  perform public.send_friend_request(test_support.user_id('owner'));

  perform test_support.become('owner');
  perform public.send_friend_request(test_support.user_id('member_a')); -- asking back accepts
  v_conversation := (public.open_dm(test_support.user_id('member_a'))).id;
  perform public.send_message(v_conversation, 'Seeded conversation: hello from the owner.');

  perform test_support.become('member_a');
  perform public.send_message(v_conversation, 'Seeded conversation: and hello back.');

  perform test_support.become('owner');
  perform public.send_message(v_conversation, 'Seeded conversation: this last one is unread for rls_member_a.');

  perform test_support.become('member_b');
  perform public.send_friend_request(test_support.user_id('owner'));
  perform test_support.become(null);
end $$;

delete from private.rate_limit_hits where true;
