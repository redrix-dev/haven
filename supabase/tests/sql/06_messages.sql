-- Sending, editing, deleting, reacting, reading pages, and mentions.
begin;

create function pg_temp.say(p_user text, p_channel text, p_body text) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  perform test_support.become(p_user);
  v_id := (public.send_message(test_support.channel_id(p_channel), p_body)).id;
  perform test_support.become(null);
  return v_id;
end;
$$;

-- ── Sending ─────────────────────────────────────────────────────────────────
select test_support.clear_sent();
create temp table said as select pg_temp.say('member_a', 'general', '  hello there  ') as id;
grant select on said to public;

select test_support.assert_eq_text(
  (select m.body from public.messages m where m.id = (select id from said)), 'hello there', 'the text is trimmed');
select test_support.assert_eq_int(test_support.sent('member_b', 'message.created'), 1, 'another member hears the message');
select test_support.assert_eq_int(test_support.sent('member_a', 'message.created'), 1, 'the author hears it too (their other devices)');
select test_support.assert_eq_int(test_support.sent('non_member', 'message.created'), 0, 'a stranger does not');
select test_support.assert_eq_text(
  test_support.last_sent('member_b', 'message.created') ->> 'body', 'hello there', 'the event carries the message');
select test_support.assert_eq_text(
  test_support.last_sent('member_b', 'message.created') ->> 'community_id', test_support.hearth_id()::text,
  'and says which community it is in');
select test_support.assert_eq_text(
  (select c.latest_message_id::text from public.channels c where c.id = test_support.channel_id('general')),
  (select id::text from said), 'the channel remembers its newest message');

-- A message in a hidden channel reaches only the people who can see it.
select test_support.clear_sent();
select pg_temp.say('server_mod', 'staff-room', 'mods only');
select test_support.assert_eq_int(test_support.sent('owner', 'message.created'), 1, 'the owner hears staff-room');
select test_support.assert_eq_int(test_support.sent('member_a', 'message.created'), 0, 'a member without access hears nothing');

select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('read-only'), 'let me in') $$, 'cannot_send');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('staff-room'), 'let me in') $$, 'channel_not_found');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), '   ') $$, 'message_empty');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), repeat('x', 4001)) $$, 'message_too_long');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), 'hi') $$, 'channel_not_found');
-- The tables themselves are closed: the RPCs are the only way in.
select test_support.expect_error($$ select * from public.messages $$, 'permission denied for table messages');
select test_support.expect_error(
  $$ insert into public.messages (channel_id, author_id, body)
     values (test_support.channel_id('general'), test_support.user_id('non_member'), 'direct') $$,
  'permission denied for table messages');
select test_support.become(null);

-- ── Sending twice ───────────────────────────────────────────────────────────
-- The app names each send with a nonce; a retry with the same one is the
-- same send.
select test_support.become('owner');
create temp table first_send as
  select * from public.send_message(test_support.channel_id('general'), 'once', null, null,
    '00000000-0000-4000-8000-000000000001');
grant select on first_send to public;
select test_support.assert_eq_text(
  (select nonce::text from first_send), '00000000-0000-4000-8000-000000000001', 'the message carries its nonce');
select test_support.become(null);

select test_support.clear_sent();
select test_support.become('owner');
select test_support.assert_eq_text(
  (public.send_message(test_support.channel_id('general'), 'once', null, null,
    '00000000-0000-4000-8000-000000000001')).id::text,
  (select id::text from first_send), 'a retry gets the message the first send made');
select test_support.become(null);
select test_support.assert_eq_int(
  (select count(*)::int from public.messages m where m.nonce = '00000000-0000-4000-8000-000000000001'), 1,
  'and makes no second copy');
select test_support.assert_eq_int(test_support.sent('member_b', 'message.created'), 0, 'nor a second event');

-- A retry is not a new send, so a rate limit reached since does not refuse it.
insert into private.rate_limit_hits (user_id, action)
  select test_support.user_id('owner'), 'send_message' from generate_series(1, 30);
select test_support.become('owner');
select test_support.assert_eq_text(
  (public.send_message(test_support.channel_id('general'), 'once', null, null,
    '00000000-0000-4000-8000-000000000001')).id::text,
  (select id::text from first_send), 'a retry goes through at the rate limit');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), 'new', null, null,
       '00000000-0000-4000-8000-000000000002') $$, 'rate_limited');
select test_support.become(null);
delete from private.rate_limit_hits h where h.user_id = test_support.user_id('owner') and h.action = 'send_message';

select test_support.become('owner');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('read-only'), 'once', null, null,
       '00000000-0000-4000-8000-000000000001') $$, 'nonce_reused');
-- A nonce is one person's: someone else's send with the same one is theirs.
select test_support.become('member_a');
select test_support.assert_true(
  (public.send_message(test_support.channel_id('general'), 'mine', null, null,
    '00000000-0000-4000-8000-000000000001')).id <> (select id from first_send),
  'the same nonce from another person is another message');
select test_support.become(null);

-- ── Replies ─────────────────────────────────────────────────────────────────
select test_support.become('owner');
select test_support.assert_eq_text(
  (public.send_message(test_support.channel_id('general'), 'a reply', (select id from said))).reply_to_id::text,
  (select id::text from said), 'a reply points at its target');
select test_support.assert_true(
  (public.send_message(test_support.channel_id('read-only'), 'elsewhere', (select id from said))).reply_to_id is null,
  'a reply to a message in another channel is a plain message');
select test_support.become(null);

-- ── Editing ─────────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_a');
select test_support.assert_eq_text(
  (public.edit_message((select id from said), 'hello again')).body, 'hello again', 'the author edits');
select test_support.become('owner');
select test_support.expect_error(
  $$ select public.edit_message((select id from said), 'not mine') $$, 'not_author');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.edit_message((select id from said), 'not mine') $$, 'message_not_found');
select test_support.become(null);
select test_support.assert_true(
  (select m.edited_at is not null from public.messages m where m.id = (select id from said)), 'an edit is marked');
select test_support.assert_eq_text(
  test_support.last_sent('member_b', 'message.updated') ->> 'body', 'hello again', 'everyone watching hears the edit');

-- ── Reactions ───────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_b');
select public.set_reaction((select id from said), '👍', true);
select public.set_reaction((select id from said), '👍', true); -- twice is once
select test_support.become('owner');
select public.set_reaction((select id from said), '👍', true);
select test_support.become(null);
select test_support.assert_eq_text(
  (select (r.reactions -> 0 ->> 'emoji') || ':' || jsonb_array_length(r.reactions -> 0 -> 'user_ids')
   from private.message_records(array[(select id from said)]) r),
  '👍:2', 'two people, one emoji, counted once each');
select test_support.assert_eq_int(test_support.sent('member_a', 'message.updated'), 2,
  'each change to the reactions is "this message changed"; the repeat is not a change');
select test_support.become('member_b');
select public.set_reaction((select id from said), '👍', false);
select test_support.become(null);
select test_support.assert_eq_int(
  (select jsonb_array_length(r.reactions -> 0 -> 'user_ids') from private.message_records(array[(select id from said)]) r),
  1, 'taking a reaction back removes it');

-- Reacting needs the right to send.
create temp table announcement as select pg_temp.say('owner', 'read-only', 'news') as id;
grant select on announcement to public;
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.set_reaction((select id from announcement), '👍', true) $$, 'cannot_send');
select test_support.become(null);

-- ── Pages ───────────────────────────────────────────────────────────────────
create temp table page as
  select n, pg_temp.say('member_b', 'general', 'm' || n) as id from generate_series(1, 5) n;
grant select on page to public;

select test_support.become('member_a');
select test_support.assert_eq_text(
  (select string_agg(r.body, ',') from public.list_messages(test_support.channel_id('general'), null, null, 3) r),
  'm5,m4,m3', 'a page is the newest messages, newest first');
select test_support.assert_eq_text(
  (select string_agg(r.body, ',')
   from public.list_messages(test_support.channel_id('general'), (select id from page where n = 3), null, 2) r),
  'm2,m1', 'before: the page older than a message');
select test_support.assert_eq_text(
  (select string_agg(r.body, ',')
   from public.list_messages(test_support.channel_id('general'), null, (select id from page where n = 2), 2) r),
  'm4,m3', 'after: the next page newer than a message, still newest first');
select test_support.assert_eq_int(
  (select count(*) from public.get_messages(array[(select id from said), (select id from announcement)])), 2,
  'messages by id');
select test_support.expect_error(
  $$ select * from public.list_messages(test_support.channel_id('staff-room')) $$, 'channel_not_found');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select * from public.list_messages(test_support.channel_id('general')) $$, 'channel_not_found');
select test_support.assert_eq_int(
  (select count(*) from public.get_messages(array[(select id from said)])), 0,
  'asking by id for a message you cannot see returns nothing');
select test_support.become(null);

-- ── Deleting ────────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.delete_message((select id from page where n = 1)) $$, 'missing_permission');
select public.delete_message((select id from said));
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.messages m where m.id = (select id from said) $$, 0, 'the author deletes their own message');
select test_support.assert_eq_int(test_support.sent('member_b', 'message.deleted'), 1, 'everyone watching hears the delete');
select test_support.assert_query_count(
  $$ select 1 from public.community_audit_log l where l.action = 'message_removed' $$, 0,
  'deleting your own message is not a moderation action');

select test_support.become('server_mod');
select public.delete_message((select id from page where n = 1));
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.messages m where m.id = (select id from page where n = 1) $$, 0,
  'a moderator removes someone else''s message');
select test_support.assert_query_count(
  $$ select 1 from public.community_audit_log l
     where l.action = 'message_removed' and l.actor_id = test_support.user_id('server_mod')
       and l.target_user_id = test_support.user_id('member_b') $$, 1,
  'and that is written down');

-- ── A banned member's messages are hidden ───────────────────────────────────
select test_support.become('owner');
select public.ban_member(test_support.hearth_id(), test_support.user_id('member_b'), 'testing hidden messages');
select test_support.become('member_a');
select test_support.assert_eq_int(
  (select count(*) from public.list_messages(test_support.channel_id('general')) r
   where r.author_id = test_support.user_id('member_b')),
  0, 'an ordinary member no longer sees them');
select test_support.become('server_mod');
select test_support.assert_eq_int(
  (select count(*) from public.list_messages(test_support.channel_id('general')) r
   where r.author_id = test_support.user_id('member_b') and r.hidden),
  4, 'someone with view_hidden_messages still does, marked hidden');
select test_support.become('owner');
select public.unban_member(test_support.hearth_id(), test_support.user_id('member_b'));
select test_support.become('member_a');
select test_support.assert_eq_int(
  (select count(*) from public.list_messages(test_support.channel_id('general')) r
   where r.author_id = test_support.user_id('member_b')),
  4, 'lifting the ban shows them again');
select test_support.become(null);

-- ── Mentions ────────────────────────────────────────────────────────────────
delete from public.notifications where true;
select pg_temp.say('owner', 'general', 'ping @rls_member_a and @RLS_SERVER_MOD, not @rls_non_member or @rls_owner');
select test_support.assert_eq_text(
  (select string_agg(p.username, ',' order by p.username)
   from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'mention'),
  'rls_member_a,rls_server_mod', 'the mentioned members are told; a stranger and yourself are not');

delete from public.notifications where true;
select pg_temp.say('owner', 'staff-room', 'secret @rls_member_a and @rls_server_mod');
select test_support.assert_eq_text(
  (select string_agg(p.username, ',' order by p.username)
   from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'mention'),
  'rls_server_mod', 'a mention in a channel you cannot see tells you nothing');

delete from public.notifications where true;
select test_support.become('member_a');
select public.mute_channel(test_support.channel_id('general'), 'infinity');
select test_support.become('server_mod');
select public.block_user(test_support.user_id('owner'));
select test_support.become(null);
select pg_temp.say('owner', 'general', '@rls_member_a @rls_server_mod');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n where n.kind = 'mention' $$, 0,
  'no mention notice across a block or into a muted channel');

-- ── Link previews ───────────────────────────────────────────────────────────
-- (member_b left with the ban above; #general is owner, member_a, server_mod.)
delete from private.jobs where true;
create temp table linked as select pg_temp.say('member_a', 'general', 'see https://example.com/page. it is good') as id;
create temp table linked_too as select pg_temp.say('owner', 'general', 'also https://example.com/page') as id;
grant select on linked, linked_too to public;
create temp table preview as select lp.id from public.link_previews lp where lp.url = 'https://example.com/page';
select test_support.assert_query_count(
  $$ select 1 from public.link_previews lp where lp.status = 'pending' $$, 1,
  'two messages with the same link share one preview; a full stop after the address is not part of it');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'link_preview' $$, 1, 'which is fetched once');
select test_support.assert_eq_text(
  public.worker_link_preview_url((select id from preview)), 'https://example.com/page', 'the worker is told the address');
select test_support.assert_true(
  (select r.link_preview is null from private.message_records(array[(select id from linked)]) r),
  'until it is fetched the message shows no preview');

select test_support.clear_sent();
select public.worker_link_preview_result((select id from preview), 'ready', 'A page', 'About it', 'Example');
select test_support.assert_eq_text(
  (select r.link_preview ->> 'title' from private.message_records(array[(select id from linked)]) r), 'A page',
  'once fetched, the message carries it');
select test_support.assert_eq_int(
  test_support.sent('server_mod', 'message.updated'), 2, 'and each message showing the link is announced as changed');
select public.worker_link_preview_result((select id from preview), 'failed', null, null, null, null, null, null, 'timeout');
select test_support.assert_true(
  (select r.link_preview is null from private.message_records(array[(select id from linked)]) r),
  'a preview that could not be fetched is not shown');

-- Asking for it to be fetched again: the author, or someone who manages messages.
delete from private.jobs where true;
select test_support.become('server_mod');
select public.refresh_link_preview((select id from linked));
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'link_preview' $$, 1, 'a moderator asks for a fresh preview');
delete from private.jobs where true;
select test_support.become('member_a');
select public.refresh_link_preview((select id from linked));
select test_support.expect_error(
  $$ select public.refresh_link_preview((select id from linked_too)) $$, 'missing_permission');
select test_support.become('non_member');
select test_support.expect_error(
  $$ select public.refresh_link_preview((select id from linked)) $$, 'message_not_found');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'link_preview' $$, 1, 'so does the author, and nobody else');

select test_support.become('member_a');
select public.edit_message((select id from linked), 'no link any more');
select test_support.become(null);
select test_support.assert_true(
  (select m.link_preview_id is null from public.messages m where m.id = (select id from linked)),
  'editing the link out of a message drops its preview');

-- ── Slow down ───────────────────────────────────────────────────────────────
delete from private.rate_limit_hits where true;
select pg_temp.say('owner', 'general', 'n' || n) from generate_series(1, 30) n;
select test_support.become('owner');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), 'one too many') $$, 'rate_limited');
select test_support.become(null);

rollback;
