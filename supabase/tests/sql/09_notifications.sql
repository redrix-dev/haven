-- Notifications: who is told, how, what they can turn off, and phone pushes.
begin;

delete from public.notifications where true;
delete from public.push_devices where true;
delete from public.notification_preferences where true;
delete from private.jobs where true;
select test_support.clear_sent();

create function pg_temp.tell(p_user text, p_kind public.notification_kind, p_actor text default null, p_muted boolean default false)
returns uuid language sql as $$
  select private.notify(
    test_support.user_id(p_user), p_kind, test_support.user_id(p_actor), 'Title', 'Body',
    null, null, null, null, p_muted);
$$;

-- ── Being told ──────────────────────────────────────────────────────────────
create temp table first_notice as select pg_temp.tell('member_a', 'system') as id;
grant select on first_notice to public;
select test_support.assert_eq_int(test_support.sent('member_a', 'notification.created'), 1, 'the person hears it at once');
select test_support.assert_eq_text(
  test_support.last_sent('member_a', 'notification.created') ->> 'id', (select id::text from first_notice),
  'and the event is the notification');
select test_support.assert_eq_int(test_support.sent('member_b', 'notification.created'), 0, 'nobody else does');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'push_send' $$, 0, 'with no phone registered there is no push');
select test_support.assert_true(
  pg_temp.tell('member_a', 'mention', 'member_a') is null, 'nobody is notified of their own action');
select test_support.assert_true(
  pg_temp.tell('member_a', 'mention', 'member_b', true) is null, 'nor about something they muted');
create temp table long_notice as
  select private.notify(test_support.user_id('member_a'), 'system', null, 'T', repeat('x', 900)) as id;
select test_support.assert_eq_int(
  (select char_length(n.body) from public.notifications n where n.id = (select id from long_notice)),
  500, 'a long body is cut');

select test_support.become('member_a');
select test_support.assert_query_count($$ select 1 from public.notifications $$, 2, 'you read your own notifications');
select test_support.become('member_b');
select test_support.assert_query_count($$ select 1 from public.notifications $$, 0, 'and nobody else''s');
select test_support.expect_error(
  $$ insert into public.notifications (recipient_id, kind, title, body, in_app, sound, push)
     values (test_support.user_id('member_a'), 'system', 'Fake', 'Fake', true, true, true) $$,
  'permission denied for table notifications');
select test_support.become(null);

-- ── Phones ──────────────────────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.assert_eq_text(
  (public.register_push_device('  tok-1 ', 'ios', 'install-1')).token, 'tok-1', 'a phone is registered');
select test_support.expect_error($$ select public.register_push_device('  ', 'ios') $$, 'device_invalid');
select test_support.expect_error($$ select public.register_push_device('tok-9', 'windows') $$, 'device_invalid');
select public.register_push_device('tok-2', 'ios', 'install-1');
select test_support.assert_eq_text(
  (select string_agg(d.token, ',') from public.push_devices d), 'tok-2',
  'a new token from the same install replaces the old one');
select test_support.become('member_b');
select public.register_push_device('tok-2', 'android');
select test_support.assert_eq_text(
  (select string_agg(d.token, ',') from public.push_devices d), 'tok-2', 'a token belongs to whoever registered it last');
select test_support.become('member_a');
select test_support.assert_query_count($$ select 1 from public.push_devices $$, 0, 'so the previous person no longer has it');
select test_support.become('owner');
select public.register_push_device('tok-owner', 'ios');
select test_support.become(null);

-- ── Pushes ──────────────────────────────────────────────────────────────────
create temp table pushed as select pg_temp.tell('member_b', 'system') as id;
grant select on pushed to public;
select test_support.assert_query_count(
  $$ select 1 from private.jobs j
     where j.kind = 'push_send' and j.payload ->> 'notification_id' = (select id::text from pushed) $$, 1,
  'a notification to someone with a phone queues one push');
select test_support.assert_query_count(
  $$ select 1 from public.worker_push_delivery((select id from pushed)) d
     where d.token = 'tok-2' and d.platform = 'android' and d.title = 'Title' and d.body = 'Body'
       and d.data ->> 'kind' = 'system' and d.data ->> 'notification_id' = (select id::text from pushed) $$, 1,
  'the worker is given the words and where to send them');
select test_support.assert_query_count(
  $$ select 1 from public.worker_push_delivery((select id from pushed)) $$, 1, 'that person''s phones and nobody else''s');
select test_support.assert_false(
  has_function_privilege('authenticated', 'public.worker_push_delivery(uuid)', 'execute'),
  'only the worker may ask');
select test_support.become('member_b');
select test_support.assert_eq_int(
  public.mark_notifications('read', array[(select id from pushed)]), 1, 'reading it on one device');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.worker_push_delivery((select id from pushed)) $$, 0,
  'means it is no longer pushed to the phone');

-- ── Turning things off ──────────────────────────────────────────────────────
select test_support.become('member_b');
select public.set_notification_preference('mention', true, false, false);
select test_support.expect_error(
  $$ select public.set_notification_preference('moderation_decision', false, false, false) $$, 'kind_not_optional');
select test_support.expect_error(
  $$ select public.set_notification_preference('report_outcome', true, true, false) $$, 'kind_not_optional');
select test_support.expect_error(
  $$ insert into public.notification_preferences (user_id, kind, push)
     values (test_support.user_id('member_b'), 'direct_message', false) $$, 'permission denied');
select test_support.assert_query_count($$ select 1 from public.notification_preferences $$, 1, 'you read your own preferences');
select test_support.become('member_a');
select test_support.assert_query_count($$ select 1 from public.notification_preferences $$, 0, 'and nobody else''s');
select test_support.become(null);

delete from private.jobs where true;
create temp table quiet as select pg_temp.tell('member_b', 'mention', 'member_a') as id;
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.id = (select id from quiet) and n.in_app and not n.sound and not n.push $$, 1,
  'a notice is delivered the way the person chose');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'push_send' $$, 0, 'push off means no push is queued');

select test_support.become('member_b');
select public.set_notification_preference('mention', false, false, false);
select test_support.become(null);
select test_support.assert_true(
  pg_temp.tell('member_b', 'mention', 'member_a') is null, 'everything off means no notice at all');
select test_support.assert_true(
  pg_temp.tell('member_b', 'direct_message', 'member_a') is not null, 'other kinds are not affected');
select test_support.assert_true(
  pg_temp.tell('member_b', 'moderation_decision') is not null, 'and safety notices always arrive');

-- ── Seen, read, dismissed ───────────────────────────────────────────────────
delete from public.notifications where true;
create temp table inbox as
  select n, pg_temp.tell('member_a', 'system') as id from generate_series(1, 3) n;
grant select on inbox to public;
create temp table other_inbox as select pg_temp.tell('member_b', 'system') as id;
grant select on other_inbox to public;
select test_support.clear_sent();

select test_support.become('member_a');
select test_support.assert_eq_int(public.mark_notifications('seen'), 3, 'no ids means all of yours');
select test_support.assert_eq_int(public.mark_notifications('seen'), 0, 'marking again changes nothing');
select test_support.assert_eq_int(
  public.mark_notifications('read', array[(select id from inbox where n = 1), (select id from other_inbox)]), 1,
  'you cannot mark somebody else''s');
select test_support.assert_eq_int(
  public.mark_notifications('dismissed', array[(select id from inbox where n = 2)]), 1, 'one is dismissed');
select test_support.become(null);

select test_support.assert_query_count(
  $$ select 1 from public.notifications n join inbox i on i.id = n.id where n.seen_at is not null $$, 3, 'all three seen');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n join inbox i on i.id = n.id
     where (i.n = 1 and n.read_at is not null and n.dismissed_at is null)
        or (i.n = 2 and n.read_at is not null and n.dismissed_at is not null)
        or (i.n = 3 and n.read_at is null and n.dismissed_at is null) $$, 3,
  'read is also seen, dismissed is also read, and the third is only seen');
select test_support.assert_query_count(
  $$ select 1 from public.notifications n
     where n.id = (select id from other_inbox) and n.seen_at is null and n.read_at is null $$, 1,
  'the other person''s notice was not touched');
select test_support.assert_eq_int(
  test_support.sent('member_a', 'notifications.changed'), 3,
  'each change tells the person''s other devices once; the one that changed nothing does not');
select test_support.assert_eq_int(test_support.sent('member_b', 'notifications.changed'), 0, 'and nobody else');

-- ── An inbox is not an archive ──────────────────────────────────────────────
update public.notifications set created_at = now() - interval '91 days' where id = (select id from inbox where n = 3);
update public.notifications set created_at = now() - interval '89 days' where id = (select id from inbox where n = 1);
select test_support.clear_sent();
select private.sweep();
select test_support.assert_eq_text(
  (select string_agg(i.n::text, ',' order by i.n) from public.notifications n join inbox i on i.id = n.id), '1,2',
  'a notification is deleted 90 days after it was made');
select test_support.assert_eq_int(
  test_support.sent('member_a', 'notifications.changed'), 1, 'and the inbox is told it changed');

-- ── Signing out of a phone ──────────────────────────────────────────────────
insert into public.account_restrictions (user_id) values (test_support.user_id('member_b'));
select test_support.become('member_b');
select public.unregister_push_device('tok-2');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.push_devices d where d.token = 'tok-2' $$, 0,
  'even a restricted person can stop pushes to their phone');

select test_support.become('member_a');
select public.register_push_device('tok-3', 'ios');
select test_support.become('owner');
select public.unregister_push_device('tok-3');
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.push_devices d where d.token = 'tok-3' $$, 1, 'you cannot unregister someone else''s phone');
select public.worker_push_token_invalid('tok-3');
select test_support.assert_query_count(
  $$ select 1 from public.push_devices d where d.token = 'tok-3' $$, 0, 'a token the push service rejects is forgotten');

rollback;
