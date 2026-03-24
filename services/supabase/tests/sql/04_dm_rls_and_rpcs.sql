begin;

select test_support.note('suite 04: DM RLS + RPCs');
select test_support.cleanup_fixture_domain_state();

create temp table if not exists dm_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant all on dm_ids to public;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
select public.send_friend_request(test_support.fixture_username('member_b'));

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select public.accept_friend_request(
  (select fr.id from public.friend_requests fr
    where fr.sender_user_id = test_support.fixture_user_id('member_a')
      and fr.recipient_user_id = test_support.fixture_user_id('member_b')
      and fr.status = 'pending'
    limit 1)
);

create temp table tmp_dm_conversation_member_b on commit drop as
select public.get_or_create_direct_dm_conversation(test_support.fixture_user_id('member_a')) as conversation_id;

insert into dm_ids (key, id)
select 'conversation', conversation_id from tmp_dm_conversation_member_b
on conflict (key) do update set id = excluded.id;
reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_text(
  public.get_or_create_direct_dm_conversation(test_support.fixture_user_id('member_b'))::text,
  (select id::text from dm_ids where key = 'conversation'),
  'direct DM conversation should be canonical/idempotent'
);

create temp table tmp_dm_message_sent on commit drop as
select * from public.send_dm_message(
  (select id from dm_ids where key = 'conversation'),
  'hello from member_a',
  '{}'::jsonb
);

insert into dm_ids (key, id)
select 'message_1', message_id from tmp_dm_message_sent
on conflict (key) do update set id = excluded.id;
reset role;
select test_support.clear_jwt_claims();
select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'dm_message'
      and nr.recipient_user_id = test_support.fixture_user_id('member_b')
      and (ne.payload->>'conversationId')::uuid = (select id from dm_ids where key = 'conversation')
  ),
  1,
  'DM send should emit notification for recipient'
);

-- Configure member_b for push-only DM notifications (no inbox row, no local sound flag).
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select public.update_my_notification_preferences(
  true, true,
  false, false,
  true, true,
  true, true, true
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_dm_message_sent_push_only on commit drop as
select * from public.send_dm_message(
  (select id from dm_ids where key = 'conversation'),
  'push only dm for member_b',
  '{}'::jsonb
);

insert into dm_ids (key, id)
select 'message_push_only', message_id from tmp_dm_message_sent_push_only
on conflict (key) do update set id = excluded.id;
reset role;
select test_support.clear_jwt_claims();

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'dm_message'
      and nr.recipient_user_id = test_support.fixture_user_id('member_b')
      and ne.source_id = (select id from dm_ids where key = 'message_push_only')
      and nr.deliver_in_app = false
      and nr.deliver_sound = false
  ),
  1,
  'push-only DM prefs should create a recipient row with in-app/sound flags false'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));

select test_support.expect_exception(
  format($sql$select * from public.list_dm_messages(%L, 50, null, null)$sql$, (select id from dm_ids where key = 'conversation')),
  'do not have access'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_dm_messages((select id from dm_ids where key = 'conversation'), 50, null, null)
  ),
  2,
  'DM recipient can list both normal and push-only test messages'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_dm_image_upload on commit drop as
select
  format(
    '%s/%s-dm-test.png',
    (select id::text from dm_ids where key = 'conversation'),
    gen_random_uuid()::text
  ) as object_path;

insert into storage.objects (
  bucket_id,
  name,
  owner,
  metadata
)
select
  'dm-message-media',
  object_path,
  test_support.fixture_user_id('member_a'),
  jsonb_build_object('mimetype', 'image/png', 'size', 2048)
from tmp_dm_image_upload;

create temp table tmp_dm_image_message on commit drop as
select * from public.send_dm_message(
  (select id from dm_ids where key = 'conversation'),
  '',
  '{}'::jsonb,
  jsonb_build_object(
    'bucketName', 'dm-message-media',
    'objectPath', (select object_path from tmp_dm_image_upload),
    'originalFilename', 'dm-test.png',
    'mimeType', 'image/png',
    'mediaKind', 'image',
    'sizeBytes', 2048,
    'expiresInHours', 24
  )
);

insert into dm_ids (key, id)
select 'message_image', message_id from tmp_dm_image_message
on conflict (key) do update set id = excluded.id;

reset role;
select test_support.clear_jwt_claims();

select test_support.assert_eq_text(
  (
    select payload->>'message'
    from public.notification_events
    where source_id = (select id from dm_ids where key = 'message_image')
    order by created_at desc
    limit 1
  ),
  'Sent an image',
  'image-only DM notifications should use the image preview fallback'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.list_dm_messages((select id from dm_ids where key = 'conversation'), 50, null, null)
  ),
  3,
  'DM recipient can list text and image messages together'
);

select test_support.assert_eq_int(
  (
    select jsonb_array_length(attachments)::bigint
    from public.list_dm_messages((select id from dm_ids where key = 'conversation'), 50, null, null)
    where message_id = (select id from dm_ids where key = 'message_image')
  ),
  1,
  'DM image messages should return one attachment row'
);

select test_support.assert_eq_text(
  (
    select last_message_preview
    from public.list_my_dm_conversations()
    where conversation_id = (select id from dm_ids where key = 'conversation')
  ),
  'Sent an image',
  'DM conversation previews should fall back to Sent an image for image-only messages'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from storage.objects
    where bucket_id = 'dm-message-media'
      and name = (select object_path from tmp_dm_image_upload)
  ),
  1,
  'DM participants can read the uploaded image object'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('non_member'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from storage.objects
    where bucket_id = 'dm-message-media'
      and name = (select object_path from tmp_dm_image_upload)
  ),
  0,
  'non-members cannot read DM image storage objects'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_dm_expiring_image_upload on commit drop as
select
  format(
    '%s/%s-dm-expiring-test.png',
    (select id::text from dm_ids where key = 'conversation'),
    gen_random_uuid()::text
  ) as object_path;

insert into storage.objects (
  bucket_id,
  name,
  owner,
  metadata
)
select
  'dm-message-media',
  object_path,
  test_support.fixture_user_id('member_a'),
  jsonb_build_object('mimetype', 'image/png', 'size', 4096)
from tmp_dm_expiring_image_upload;

create temp table tmp_dm_expiring_image_message on commit drop as
select * from public.send_dm_message(
  (select id from dm_ids where key = 'conversation'),
  '',
  '{}'::jsonb,
  jsonb_build_object(
    'bucketName', 'dm-message-media',
    'objectPath', (select object_path from tmp_dm_expiring_image_upload),
    'originalFilename', 'dm-expiring-test.png',
    'mimeType', 'image/png',
    'mediaKind', 'image',
    'sizeBytes', 4096,
    'expiresInHours', 1
  )
);

insert into dm_ids (key, id)
select 'message_image_expiring', message_id from tmp_dm_expiring_image_message
on conflict (key) do update set id = excluded.id;

reset role;
update public.dm_message_attachments
set expires_at = timezone('utc', now()) - interval '5 minutes'
where message_id = (select id from dm_ids where key = 'message_image_expiring');

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_int(
  public.cleanup_expired_dm_message_attachments(10),
  1,
  'expired DM image cleanup should delete the message'
);

reset role;
select test_support.clear_jwt_claims();

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.dm_messages
    where id = (select id from dm_ids where key = 'message_image_expiring')
  ),
  0,
  'expired DM image cleanup should remove the DM row'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.message_attachment_deletion_jobs
    where bucket_name = 'dm-message-media'
      and object_path = (select object_path from tmp_dm_expiring_image_upload)
  ),
  1,
  'expired DM image cleanup should enqueue storage deletion'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_true(
  public.mark_dm_conversation_read((select id from dm_ids where key = 'conversation')),
  'recipient can mark DM conversation read'
);

select test_support.assert_true(
  public.set_dm_conversation_muted((select id from dm_ids where key = 'conversation'), true),
  'recipient can mute conversation'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

create temp table tmp_dm_message_sent_2 on commit drop as
select * from public.send_dm_message(
  (select id from dm_ids where key = 'conversation'),
  'should not notify because muted',
  '{}'::jsonb
);

insert into dm_ids (key, id)
select 'message_2', message_id from tmp_dm_message_sent_2
on conflict (key) do update set id = excluded.id;
reset role;
select test_support.clear_jwt_claims();
select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.notification_recipients nr
    join public.notification_events ne on ne.id = nr.event_id
    where ne.kind = 'dm_message'
      and nr.recipient_user_id = test_support.fixture_user_id('member_b')
      and ne.source_id = (select id from dm_ids where key = 'message_2')
  ),
  0,
  'muted DM conversation should suppress recipient notification rows for new messages'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select public.block_user_social(test_support.fixture_user_id('member_b'));

select test_support.expect_exception(
  format(
    $sql$select * from public.send_dm_message(%L, %L, '{}'::jsonb)$sql$,
    (select id from dm_ids where key = 'conversation'),
    'blocked send should fail'
  ),
  'blocked'
);

rollback;
