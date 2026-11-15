-- Files: a place to upload to, attaching, who may read, and what happens when
-- the message goes away.
begin;

-- ── A place to upload to ────────────────────────────────────────────────────
select test_support.become('member_a');
create temp table slot as
  select * from public.create_upload('attachment', 'image/png', 1000, 'cat.png', 640, 480);
grant select on slot to public;
select test_support.assert_eq_text((select bucket from slot), 'media', 'attachments go to the private bucket');
select test_support.assert_eq_text(
  (select object_path from slot), test_support.user_id('member_a')::text || '/' || (select id::text from slot),
  'the path is the owner and the file id');
select test_support.expect_error(
  $$ select public.create_upload('attachment', 'application/x-msdownload', 1000) $$, 'file_type_not_allowed');
select test_support.expect_error(
  $$ select public.create_upload('attachment', 'image/png', 30000000) $$, 'file_too_large');
select test_support.expect_error(
  $$ select public.create_upload('avatar', 'application/pdf', 1000) $$, 'file_type_not_allowed');

-- Storage accepts exactly that path, from exactly that person.
select test_support.assert_true(
  private.can_upload('media', (select object_path from slot)), 'the owner may upload into the slot');
select test_support.assert_false(
  private.can_upload('media', test_support.user_id('member_a')::text || '/elsewhere'), 'and nowhere else');
select test_support.become('member_b');
select test_support.assert_false(
  private.can_upload('media', (select object_path from slot)), 'nobody else may use it');
select test_support.become(null);

-- ── Attaching ───────────────────────────────────────────────────────────────
select test_support.become('member_a');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), 'see', null, array[(select id from slot)]) $$,
  'upload_missing');
select test_support.become(null);
select test_support.fake_upload((select id from slot));

select test_support.become('member_b');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), 'mine now', null, array[(select id from slot)]) $$,
  'upload_not_usable');
select test_support.become('member_a');
create temp table posted as
  select * from public.send_message(test_support.channel_id('general'), '', null, array[(select id from slot)]);
grant select on posted to public;
select test_support.assert_eq_text(
  (select attachments -> 0 ->> 'object_path' from posted), (select object_path from slot),
  'a message can be just a file, and carries where the file is');
select test_support.assert_false(
  private.can_upload('media', (select object_path from slot)), 'a used slot cannot be uploaded into again');
select test_support.expect_error(
  $$ select public.send_message(test_support.channel_id('general'), 'again', null, array[(select id from slot)]) $$,
  'upload_not_usable');
select test_support.become(null);

-- ── Reading ─────────────────────────────────────────────────────────────────
select test_support.become('member_b');
select test_support.assert_true(
  private.can_read_media('media', (select object_path from slot)), 'someone who can see the message can read the file');
select test_support.assert_query_count(
  $$ select 1 from storage.objects o where o.bucket_id = 'media' $$, 1, 'and storage serves it to them');
select test_support.become('non_member');
select test_support.assert_false(
  private.can_read_media('media', (select object_path from slot)), 'someone who cannot, cannot');
select test_support.assert_query_count(
  $$ select 1 from storage.objects o where o.bucket_id = 'media' $$, 0, 'and storage shows them nothing');
-- Nobody may replace or delete a file through storage: there is no such policy.
select test_support.become('member_a');
update storage.objects set metadata = '{}' where bucket_id = 'media';
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from storage.objects o where o.bucket_id = 'media' and o.metadata ->> 'size' = '1000' $$, 1,
  'not even its owner can change the stored file');
select test_support.assert_query_count(
  $$ select 1 from pg_policies p
     where p.schemaname = 'storage' and p.tablename = 'objects' and p.cmd in ('UPDATE', 'DELETE', 'ALL') $$, 0,
  'storage has no policy that lets anyone replace or delete a file');

-- ── Letting go ──────────────────────────────────────────────────────────────
select test_support.become('member_a');
select public.delete_message((select id from posted));
select test_support.become(null);
select test_support.assert_eq_text(
  (select m.status::text from public.media m where m.id = (select id from slot)), 'released',
  'deleting the message releases its file');
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'media_delete' and j.payload ->> 'media_id' = (select id::text from slot) $$,
  1, 'and queues the file for deletion');
select test_support.assert_query_count(
  $$ select 1 from public.worker_media_to_delete((select id from slot)) $$, 1, 'the worker is told where it is');
select test_support.become('member_b');
select test_support.assert_false(
  private.can_read_media('media', (select object_path from slot)), 'a released file is no longer served');
select test_support.become(null);
select public.worker_media_deleted((select id from slot));
select test_support.assert_query_count(
  $$ select 1 from public.media m where m.id = (select id from slot) $$, 0, 'once the worker is done the row is gone');

-- ── Avatars ─────────────────────────────────────────────────────────────────
select test_support.clear_sent();
select test_support.become('member_a');
create temp table face as select * from public.create_upload('avatar', 'image/png', 500);
grant select on face to public;
select test_support.become(null);
select test_support.fake_upload((select id from face));
select test_support.become('member_a');
select test_support.assert_eq_text(
  (public.set_my_avatar((select id from face))).avatar_media_id::text, (select id::text from face), 'a picture is set');
-- A file uploaded as an attachment cannot be turned into a profile picture.
create temp table wrong_kind as select * from public.create_upload('attachment', 'image/png', 700);
grant select on wrong_kind to public;
select test_support.become(null);
select test_support.fake_upload((select id from wrong_kind));
select test_support.become('member_a');
select test_support.expect_error($$ select public.set_my_avatar((select id from wrong_kind)) $$, 'upload_not_usable');
create temp table face2 as select * from public.create_upload('avatar', 'image/png', 600);
grant select on face2 to public;
select test_support.become(null);
select test_support.fake_upload((select id from face2));
select test_support.become('member_a');
select public.set_my_avatar((select id from face2));
select test_support.become(null);
select test_support.assert_eq_text(
  (select m.status::text from public.media m where m.id = (select id from face)), 'released',
  'replacing a picture releases the old one');
select test_support.assert_eq_int(test_support.sent('member_b', 'profile.updated'), 2,
  'people in the same community hear each change of picture');
select test_support.assert_eq_int(test_support.sent('non_member', 'profile.updated'), 0, 'a stranger does not');

-- ── Uploads that were never used ────────────────────────────────────────────
select test_support.become('member_b');
create temp table stale as select * from public.create_upload('attachment', 'image/png', 10);
grant select on stale to public;
select test_support.become(null);
select test_support.assert_query_count(
  $$ select 1 from public.worker_media_to_delete((select id from stale)) $$, 0, 'a fresh unused slot is left alone');
update public.media set created_at = now() - interval '2 days' where id = (select id from stale);
select private.sweep_abandoned_uploads();
select test_support.assert_query_count(
  $$ select 1 from private.jobs j where j.kind = 'media_delete' and j.payload ->> 'media_id' = (select id::text from stale) $$,
  1, 'after a day it is queued for removal');
select test_support.assert_query_count(
  $$ select 1 from public.worker_media_to_delete((select id from stale)) $$, 1, 'and the worker may take it');

rollback;
