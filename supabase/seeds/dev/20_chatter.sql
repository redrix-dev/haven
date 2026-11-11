-- Pack: chatter
-- A short, readable conversation in DEV: Hearth covering the message shapes
-- the clients render: replies, an edit, a soft delete, a link, a mention,
-- a long message, and an announcement. Re-running replaces it.
-- Needs pack: community.

select test_support.note('seeds/dev/20_chatter: conversation in DEV: Hearth');

do $$
declare
  v_owner uuid := test_support.fixture_user_id('community_owner');
  v_a uuid := test_support.fixture_user_id('member_a');
  v_b uuid := test_support.fixture_user_id('member_b');
  v_mod uuid := test_support.fixture_user_id('server_mod');
  v_community uuid;
  v_chat uuid;
  v_general uuid;
  v_announce uuid;
  v_staff uuid;
  v_first uuid;
  v_id uuid;
  v_base timestamptz := timezone('utc', now()) - interval '3 hours';
begin
  select c.id into v_community from public.communities c
  where c.name = 'DEV: Hearth' order by c.created_at limit 1;
  if v_community is null then
    raise exception 'Pack "chatter" needs pack "community" first.';
  end if;

  select id into v_chat from public.channels where community_id = v_community and name = 'dev-chat';
  select id into v_general from public.channels where community_id = v_community and name = 'general';
  select id into v_announce from public.channels where community_id = v_community and name = 'announcements';
  select id into v_staff from public.channels where community_id = v_community and name = 'staff-room';

  delete from public.messages m
  where m.channel_id in (v_chat, v_general, v_announce, v_staff);

  v_first := test_support.insert_fixture_message(v_community, v_chat, v_owner,
    'Welcome to the dev backend. Nothing here is real and all of it gets rebuilt.');
  update public.messages set created_at = v_base where id = v_first;

  v_id := test_support.insert_fixture_message(v_community, v_chat, v_a,
    'Good. I plan to break things in here on purpose.');
  update public.messages
  set created_at = v_base + interval '1 minute', reply_to_message_id = v_first
  where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_chat, v_b,
    'This one was edited after sending.');
  update public.messages
  set created_at = v_base + interval '2 minutes', edited_at = v_base + interval '3 minutes'
  where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_chat, v_a,
    'This one was deleted by its author.');
  update public.messages
  set created_at = v_base + interval '4 minutes', deleted_at = v_base + interval '5 minutes'
  where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_chat, v_mod,
    'Link preview check: https://example.com/');
  update public.messages set created_at = v_base + interval '6 minutes' where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_chat, v_b,
    'Mention check: @rls_owner can you see this?');
  update public.messages set created_at = v_base + interval '7 minutes' where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_chat, v_owner,
    'Long message check. ' || repeat('The quick brown fox jumps over the lazy dog. ', 60));
  update public.messages set created_at = v_base + interval '8 minutes' where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_chat, v_a,
    E'Multi-line check:\n- one\n- two\n- three\n\n`inline code` and **bold** and unicode: café, 日本語, 🎉');
  update public.messages set created_at = v_base + interval '9 minutes' where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_general, v_owner,
    'general is quiet on purpose: one message, so empty-ish states are easy to see.');
  update public.messages set created_at = v_base where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_announce, v_mod,
    'Members can read this channel but cannot post in it.');
  update public.messages set created_at = v_base where id = v_id;

  v_id := test_support.insert_fixture_message(v_community, v_staff, v_mod,
    'Only moderators and the owner can see staff-room.');
  update public.messages set created_at = v_base where id = v_id;
end $$;
