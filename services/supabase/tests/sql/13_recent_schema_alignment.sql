begin;

select test_support.note('suite 13: recent schema alignment for permissions, avatars, tos, and account deletion');
select test_support.cleanup_fixture_domain_state();

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.permissions_catalog
    where key in ('manage_developer_access', 'mention_haven_developers')
  ),
  0,
  'removed developer permission keys should no longer exist in permissions_catalog'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from unnest(enum_range(null::public.support_report_status)) as status_value
    where status_value::text in ('pending', 'under_review', 'resolved', 'dismissed', 'escalated')
  ),
  5,
  'support_report_status should expose the current report lifecycle values'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from unnest(enum_range(null::public.support_report_status)) as status_value
    where status_value::text in ('open', 'in_review', 'closed')
  ),
  0,
  'legacy support report status values should be gone after enum migration'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from storage.buckets
    where id = 'profile-avatars'
      and public = true
  ),
  1,
  'profile-avatars bucket should exist and be public'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'profile_identities'
  ),
  1,
  'profile_identities table should exist'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profile_identities'
  ),
  1,
  'profile_identities should be included in the realtime publication'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'storage_profile_avatars_select_public',
        'storage_profile_avatars_insert_own_path',
        'storage_profile_avatars_update_own_path',
        'storage_profile_avatars_delete_own_path'
      )
  ),
  4,
  'profile avatar storage policies should be present on storage.objects'
);

set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('community_owner'));

create temp table tmp_alignment_community on commit drop as
with inserted as (
  select id
  from public.create_community('TEST:Alignment Community', null)
)
select id from inserted;

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.roles r
    where r.community_id = (select id from tmp_alignment_community)
      and lower(r.name) in ('@everyone', 'owner', 'admin', 'moderator')
  ),
  4,
  'community defaults should still create the standard system roles'
);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    where r.community_id = (select id from tmp_alignment_community)
      and lower(r.name) = 'admin'
      and rp.permission_key in ('manage_developer_access', 'mention_haven_developers')
  ),
  0,
  'create_community_defaults should no longer assign removed developer permissions'
);

create temp table tmp_avatar_object on commit drop as
select format('%s/%s-avatar.webp', auth.uid()::text, gen_random_uuid()::text) as object_path;
grant select on tmp_avatar_object to public;

insert into storage.objects (
  bucket_id,
  name,
  owner,
  metadata
)
select
  'profile-avatars',
  object_path,
  auth.uid(),
  jsonb_build_object('mimetype', 'image/webp', 'size', 2048)
from tmp_avatar_object;

select test_support.expect_exception(
  format(
    $sql$
      insert into storage.objects (bucket_id, name, owner, metadata)
      values (
        'profile-avatars',
        %L,
        auth.uid(),
        jsonb_build_object('mimetype', 'image/webp', 'size', 1024)
      )
    $sql$,
    test_support.fixture_user_id('member_b')::text || '/' || gen_random_uuid()::text || '-avatar.webp'
  ),
  'row-level security'
);

reset role;
set local role anon;

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from storage.objects
    where bucket_id = 'profile-avatars'
      and name = (select object_path from tmp_avatar_object)
  ),
  1,
  'profile avatar objects should be publicly readable'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_a'));

select test_support.assert_eq_text(
  (
    select username
    from public.profile_identities
    where user_id = auth.uid()
  ),
  test_support.fixture_username('member_a'),
  'profile_identities should backfill existing profile rows'
);

update public.profiles
set
  username = 'member_a_identity_sync',
  avatar_url = 'https://example.com/member-a-live-avatar.webp'
where id = auth.uid();

select test_support.assert_eq_text(
  (
    select username
    from public.profile_identities
    where user_id = auth.uid()
  ),
  'member_a_identity_sync',
  'profile identity trigger should sync username updates'
);

select test_support.assert_eq_text(
  (
    select avatar_url
    from public.profile_identities
    where user_id = auth.uid()
  ),
  'https://example.com/member-a-live-avatar.webp',
  'profile identity trigger should sync avatar updates'
);

insert into public.tos_acceptances (user_id, tos_version, ip_address)
values (auth.uid(), '2026-03-24', null);

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.tos_acceptances
    where user_id = auth.uid()
  ),
  1,
  'users should be able to read their own tos acceptance rows'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('member_b'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.tos_acceptances
    where user_id = test_support.fixture_user_id('member_a')
  ),
  0,
  'other authenticated users should not be able to read someone else''s tos acceptance rows'
);

reset role;
set local role authenticated;
select test_support.set_jwt_claims(test_support.fixture_user_id('platform_staff_active'));

select test_support.assert_eq_int(
  (
    select count(*)::bigint
    from public.tos_acceptances
    where user_id = test_support.fixture_user_id('member_a')
  ),
  1,
  'active platform staff should be able to read tos acceptance rows'
);

reset role;

select test_support.assert_eq_text(
  (
    select case confdeltype
      when 'n' then 'SET NULL'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'd' then 'SET DEFAULT'
      when 'a' then 'NO ACTION'
      else confdeltype::text
    end
    from pg_constraint
    where conname = 'community_bans_banned_by_user_id_fkey'
    limit 1
  ),
  'SET NULL',
  'community_bans.banned_by_user_id should use ON DELETE SET NULL'
);

select test_support.assert_eq_text(
  (
    select case confdeltype
      when 'n' then 'SET NULL'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'd' then 'SET DEFAULT'
      when 'a' then 'NO ACTION'
      else confdeltype::text
    end
    from pg_constraint
    where conname = 'channel_groups_created_by_user_id_fkey'
    limit 1
  ),
  'SET NULL',
  'channel_groups.created_by_user_id should use ON DELETE SET NULL'
);

rollback;
