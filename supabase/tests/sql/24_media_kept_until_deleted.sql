begin;
select test_support.note('suite 24: media is kept until its message, owner or community is deleted (HAV-19)');
select test_support.cleanup_fixture_domain_state();

create temp table media_ids (key text primary key, id uuid not null) on commit drop;
grant all on media_ids to public;

-- ---------------------------------------------------------------------------
-- Community media a year old is still visible.
-- ---------------------------------------------------------------------------
insert into media_ids (key, id) values
  ('old_message', test_support.insert_fixture_message(
    test_support.fixture_community_id(), test_support.fixture_channel_id('general'),
    test_support.fixture_user_id('member_a'), 'an old photo'));

insert into public.message_attachments
  (message_id, community_id, channel_id, owner_user_id, object_path, original_filename, mime_type, media_kind, size_bytes, created_at)
select id, test_support.fixture_community_id(), test_support.fixture_channel_id('general'),
  test_support.fixture_user_id('member_a'), 'hav19/old-community.png', 'old-community.png', 'image/png', 'image', 512,
  timezone('utc', now()) - interval '400 days'
from media_ids where key = 'old_message';

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select test_support.assert_eq_int(
  (select count(*) from public.message_attachments where object_path = 'hav19/old-community.png'),
  1, 'a member can still see community media from 400 days ago');
select test_support.assert_true(
  (select m.attachment is not null
   from public.list_channel_messages(test_support.fixture_community_id(), test_support.fixture_channel_id('general'), 50, null, null) m
   where m.id = (select id from media_ids where key = 'old_message')),
  'the channel message list still carries the old attachment');
select test_support.assert_true(
  (select g.attachment is not null
   from public.get_channel_message(test_support.fixture_community_id(), test_support.fixture_channel_id('general'),
     (select id from media_ids where key = 'old_message')) g),
  'a single-message fetch still carries the old attachment');
reset role;

-- ---------------------------------------------------------------------------
-- DM images a year old are still visible, and an old client's expiresInHours
-- key is ignored rather than rejected.
-- ---------------------------------------------------------------------------
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
select public.send_friend_request(test_support.fixture_username('member_b'));
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select public.accept_friend_request(
  (select fr.id from public.friend_requests fr
   where fr.sender_user_id = test_support.fixture_user_id('member_a')
     and fr.recipient_user_id = test_support.fixture_user_id('member_b')
     and fr.status = 'pending'
   limit 1));
insert into media_ids (key, id)
select 'conversation', public.get_or_create_direct_dm_conversation(test_support.fixture_user_id('member_a'));

select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
insert into storage.objects (bucket_id, name, owner, metadata)
select 'dm-message-media', id::text || '/hav19-old-dm.png', test_support.fixture_user_id('member_a'),
  jsonb_build_object('mimetype', 'image/png', 'size', 1024)
from media_ids where key = 'conversation';

insert into media_ids (key, id)
select 'dm_message', s.message_id
from public.send_dm_message(
  (select id from media_ids where key = 'conversation'), '', '{}'::jsonb,
  jsonb_build_object(
    'bucketName', 'dm-message-media',
    'objectPath', (select id::text || '/hav19-old-dm.png' from media_ids where key = 'conversation'),
    'originalFilename', 'hav19-old-dm.png', 'mimeType', 'image/png', 'mediaKind', 'image',
    'sizeBytes', 1024, 'expiresInHours', 1)) s;
reset role;

update public.dm_message_attachments
set created_at = timezone('utc', now()) - interval '400 days'
where message_id = (select id from media_ids where key = 'dm_message');

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));
select test_support.assert_eq_int(
  (select jsonb_array_length(attachments)::bigint
   from public.list_dm_messages((select id from media_ids where key = 'conversation'), 50, null, null)
   where message_id = (select id from media_ids where key = 'dm_message')),
  1, 'the recipient still sees a DM image from 400 days ago');
select test_support.assert_eq_text(
  (select last_message_preview from public.list_my_dm_conversations()
   where conversation_id = (select id from media_ids where key = 'conversation')),
  'Sent an image', 'the conversation preview still knows the old image is there');
reset role;

-- ---------------------------------------------------------------------------
-- Nothing sweeps media on a timer any more.
-- ---------------------------------------------------------------------------
select test_support.assert_true(
  to_regprocedure('public.cleanup_expired_message_attachments(integer)') is null
  and to_regprocedure('public.cleanup_expired_dm_message_attachments(integer)') is null,
  'the expiry sweeps are gone');

-- ---------------------------------------------------------------------------
-- Real deletions still remove media and queue the storage object.
-- ---------------------------------------------------------------------------
create temp view media_jobs as
select object_path from public.message_attachment_deletion_jobs where status = 'pending';

-- 1. The author deletes the message.
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
delete from public.messages where id = (select id from media_ids where key = 'old_message');
reset role;
select test_support.assert_eq_int(
  (select count(*) from public.message_attachments where object_path = 'hav19/old-community.png'),
  0, 'deleting the message deletes its attachment');
select test_support.assert_eq_int(
  (select count(*) from media_jobs where object_path = 'hav19/old-community.png'),
  1, 'deleting the message queues its storage object for removal');

-- 2. The owner deletes the community.
insert into public.communities (id, name, created_by_user_id)
values ('00000000-0000-4000-8000-000000000191', 'Media community', test_support.fixture_user_id('community_owner'));
insert into media_ids (key, id)
select 'community_channel', id from public.channels
where community_id = '00000000-0000-4000-8000-000000000191' order by position limit 1;
insert into public.message_attachments
  (message_id, community_id, channel_id, owner_user_id, object_path, original_filename, mime_type, media_kind, size_bytes)
select test_support.insert_fixture_message('00000000-0000-4000-8000-000000000191', c.id,
    test_support.fixture_user_id('community_owner'), 'community photo'),
  '00000000-0000-4000-8000-000000000191', c.id, test_support.fixture_user_id('community_owner'),
  'hav19/community.png', 'community.png', 'image/png', 'image', 512
from media_ids c where c.key = 'community_channel';

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));
delete from public.communities where id = '00000000-0000-4000-8000-000000000191';
reset role;
select test_support.assert_eq_int(
  (select count(*) from public.message_attachments where object_path = 'hav19/community.png'),
  0, 'deleting the community deletes its media');
select test_support.assert_eq_int(
  (select count(*) from media_jobs where object_path = 'hav19/community.png'),
  1, 'deleting the community queues its media for removal');

-- 3. The owner deletes their account: their community and DM media go.
insert into public.message_attachments
  (message_id, community_id, channel_id, owner_user_id, object_path, original_filename, mime_type, media_kind, size_bytes)
select test_support.insert_fixture_message(test_support.fixture_community_id(), test_support.fixture_channel_id('general'),
    test_support.fixture_user_id('member_a'), 'another photo'),
  test_support.fixture_community_id(), test_support.fixture_channel_id('general'),
  test_support.fixture_user_id('member_a'), 'hav19/account.png', 'account.png', 'image/png', 'image', 512;

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));
select public.delete_own_account();
reset role;
select test_support.assert_eq_int(
  (select count(*) from public.message_attachments where object_path = 'hav19/account.png'),
  0, 'deleting the account deletes the owner''s community media');
select test_support.assert_eq_int(
  (select count(*) from media_jobs where object_path = 'hav19/account.png'),
  1, 'deleting the account queues the owner''s community media for removal');
select test_support.assert_eq_int(
  (select count(*) from media_jobs
   where object_path = (select id::text || '/hav19-old-dm.png' from media_ids where key = 'conversation')),
  1, 'deleting the account queues the owner''s DM image for removal');

rollback;
