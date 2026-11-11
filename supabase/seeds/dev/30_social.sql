-- Pack: social
-- Friends, a pending friend request, and a DM thread. Everything goes through
-- the real RPCs as the acting user, so rate limits, notifications and RLS-side
-- effects are the same ones the apps trigger.
--
-- Starts clean: fixtures/20_social_and_dm already wiped the fixture users'
-- social and DM state earlier in the same seed run.
--
--   rls_owner  <-> rls_member_a   friends, with a DM thread
--   rls_member_b -> rls_owner     pending friend request

select test_support.note('seeds/dev/30_social: friends, a pending request, a DM thread');

do $$
declare
  v_owner uuid := test_support.fixture_user_id('community_owner');
  v_a uuid := test_support.fixture_user_id('member_a');
  v_b uuid := test_support.fixture_user_id('member_b');
  v_request uuid;
  v_conversation uuid;
begin
  perform test_support.set_jwt_claims(v_a);
  perform public.send_friend_request('rls_owner');

  select fr.id into v_request from public.friend_requests fr
  where fr.sender_user_id = v_a and fr.recipient_user_id = v_owner and fr.status = 'pending';

  perform test_support.set_jwt_claims(v_owner);
  perform public.accept_friend_request(v_request);
  perform public.get_or_create_direct_dm_conversation(v_a);

  select dc.id into v_conversation from public.dm_conversations dc
  where dc.direct_user_low_id = least(v_owner, v_a)
    and dc.direct_user_high_id = greatest(v_owner, v_a);

  perform public.send_dm_message(v_conversation, 'Seeded DM: hello from the owner.', '{}'::jsonb, null);
  perform test_support.set_jwt_claims(v_a);
  perform public.send_dm_message(v_conversation, 'Seeded DM: and hello back.', '{}'::jsonb, null);
  perform test_support.set_jwt_claims(v_owner);
  perform public.send_dm_message(v_conversation, 'Seeded DM: this last one is unread for rls_member_a.', '{}'::jsonb, null);

  perform test_support.set_jwt_claims(v_b);
  perform public.send_friend_request('rls_owner');

  perform test_support.clear_jwt_claims();
end $$;
