-- The whole surface the apps can reach, written out. Adding an RPC, a
-- readable table or a policy fails this suite until it is added here, so
-- nothing becomes reachable without someone saying so.
begin;

-- '' when the two lists hold the same names, otherwise what differs.
create function pg_temp.differs(p_actual text[], p_expected text[]) returns text language sql as $$
  select concat_ws('; ',
    'not expected: ' || nullif(array_to_string(array(select unnest(p_actual) except select unnest(p_expected) order by 1), ', '), ''),
    'missing: ' || nullif(array_to_string(array(select unnest(p_expected) except select unnest(p_actual) order by 1), ', '), ''));
$$;

-- ── What a signed-in person can call ────────────────────────────────────────
select test_support.assert_eq_text(
  pg_temp.differs(
    array(select p.proname::text from pg_proc p
          where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')),
    array[
      -- people
      'get_profiles', 'get_profile_card', 'find_user', 'update_my_profile', 'update_my_settings', 'accept_terms',
      'set_my_avatar', 'set_active_flair', 'delete_my_account',
      -- files
      'create_upload',
      -- notifications
      'mark_notifications', 'set_notification_preference', 'register_push_device', 'unregister_push_device',
      -- friends and blocks
      'send_friend_request', 'answer_friend_request', 'remove_friend', 'block_user', 'unblock_user',
      'create_friend_link', 'revoke_friend_link', 'get_friend_link', 'answer_friend_link',
      -- communities
      'create_community', 'update_community', 'delete_community', 'transfer_ownership', 'get_my_permissions',
      'join_community', 'leave_community', 'kick_member', 'ban_member', 'unban_member', 'set_nickname',
      'create_role', 'update_role', 'delete_role', 'set_role_permissions', 'set_member_roles',
      'create_invite', 'revoke_invite', 'save_category', 'delete_category', 'set_category_collapsed',
      -- channels and conversations
      'create_channel', 'update_channel', 'move_channel', 'delete_channel', 'set_channel_overwrite',
      'open_dm', 'mark_channel_read', 'mute_channel', 'get_unread_counts',
      -- voice
      'get_voice_access', 'send_voice_control',
      -- messages
      'send_message', 'edit_message', 'delete_message', 'set_reaction', 'list_messages', 'get_messages',
      'get_latest_messages', 'refresh_link_preview',
      -- reports
      'file_community_report', 'file_platform_case', 'list_my_reports', 'list_decisions_about_me',
      'list_community_reports', 'set_community_report_status', 'add_community_report_note', 'escalate_community_report',
      -- Haven staff (each checks that the caller is staff)
      'staff_set_case_status', 'staff_add_case_note', 'staff_record_decision', 'staff_reverse_decision',
      'staff_flag_csam', 'staff_record_ncmec_report', 'staff_view_case_media',
      -- operations
      'get_my_feature_flags', 'list_my_onboarding', 'answer_onboarding', 'get_my_profile'
    ]),
  '', 'the RPCs a signed-in person can call are exactly these');

-- Every one of them starts by checking who is calling, except these reads
-- (which return nothing without a session) and signing a phone out.
select test_support.assert_eq_text(
  pg_temp.differs(
    array(select p.proname::text from pg_proc p
          where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
            and p.prosrc !~ 'private\.require_(user|staff)\(\)'),
    array['get_my_permissions', 'get_unread_counts', 'list_my_reports', 'list_decisions_about_me',
          'get_my_feature_flags', 'list_my_onboarding', 'get_my_profile', 'unregister_push_device']),
  '', 'every RPC checks the caller is signed in, not deleted and not restricted, with eight stated exceptions');

-- The rest of public is for the workers, Supabase Auth and the sign-up form.
select test_support.assert_eq_text(
  pg_temp.differs(
    array(select p.proname::text from pg_proc p
          where p.pronamespace = 'public'::regnamespace and not has_function_privilege('authenticated', p.oid, 'execute')),
    array[
      'worker_claim_jobs', 'worker_finish_job', 'worker_push_delivery', 'worker_push_token_invalid',
      'worker_media_to_delete', 'worker_media_deleted', 'worker_media_to_quarantine', 'worker_media_quarantined',
      'worker_record_media_scan', 'worker_link_preview_url', 'worker_link_preview_result', 'worker_email_content',
      'auth_hook_access_token', 'username_taken'
    ]),
  '', 'the functions a signed-in person cannot call are exactly these');
select test_support.assert_query_count(
  $$ select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname like 'worker\_%'
       and not has_function_privilege('service_role', p.oid, 'execute') $$, 0, 'the service role runs every worker function');

-- ── What a signed-in person can read directly ───────────────────────────────
select test_support.assert_eq_text(
  pg_temp.differs(
    array(select c.relname::text from pg_class c
          where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p', 'm')
            and has_table_privilege('authenticated', c.oid, 'select')),
    array[
      'user_settings', 'terms_versions', 'terms_acceptances', 'platform_staff', 'account_restrictions',
      'notifications', 'notification_preferences', 'push_devices',
      'friend_requests', 'friendships', 'blocks', 'friend_links',
      'communities', 'community_members', 'roles', 'role_permissions', 'member_roles', 'channel_categories',
      'collapsed_categories', 'invites', 'community_bans', 'community_audit_log',
      'channels', 'channel_participants', 'channel_overwrites', 'channel_user_state',
      'community_report_notes', 'platform_cases', 'platform_case_events', 'platform_case_decisions', 'case_media',
      'flairs', 'user_flairs'
    ]),
  '', 'the tables a signed-in person can select from (through RLS) are exactly these');
select test_support.assert_eq_text(
  pg_temp.differs(
    array(select c.relname::text from pg_class c
          where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p', 'm')
            and not has_table_privilege('authenticated', c.oid, 'select')),
    array[
      'profiles', 'media', 'messages', 'message_reactions', 'link_previews', 'community_reports',
      'feature_flags', 'feature_flag_overrides', 'flair_grant_rules', 'onboarding_campaigns', 'onboarding_progress',
      'ota_releases'
    ]),
  '', 'and these are reached only through RPCs, or not at all');

-- ── What nobody can do ──────────────────────────────────────────────────────
select test_support.assert_query_count(
  $$ select 1 from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p', 'm')
       and has_table_privilege('authenticated', c.oid, 'insert, update, delete, truncate') $$, 0,
  'a signed-in person cannot write to any table directly: every write is an RPC');
select test_support.assert_query_count(
  $$ select 1 from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p', 'm')
       and has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate') $$, 0,
  'a visitor cannot touch any table');
select test_support.assert_eq_text(
  (select coalesce(string_agg(p.proname, ',' order by p.proname), '') from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  'username_taken',
  'a visitor can call one function: whether a name is taken, for the sign-up form');
select test_support.assert_query_count(
  $$ select 1 from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity $$, 0,
  'every table has row level security switched on');
select test_support.assert_query_count(
  $$ select 1 from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') $$, 0,
  'every function fixes its search path');
select test_support.assert_query_count(
  $$ select 1 from pg_publication_tables t where t.pubname = 'supabase_realtime' $$, 0,
  'no table is published for realtime: every event is a broadcast the database chose to send');

-- ── The private schema ──────────────────────────────────────────────────────
-- RLS policies run as the person asking, so the helpers they use must be
-- callable by that role. The API does not expose this schema.
select test_support.assert_eq_text(
  pg_temp.differs(
    array(select p.proname::text from pg_proc p
          where p.pronamespace = 'private'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')),
    array['is_staff_session', 'has_second_factor', 'staff_is', 'my_community_ids', 'has_permission', 'my_channel_ids', 'can_view_channel', 'voice_topic_channel',
          'can_upload', 'can_read_media', 'can_read_report', 'can_read_case', 'staff_can_read_evidence']),
  '', 'the private helpers a policy may call are exactly these');
select test_support.assert_query_count(
  $$ select 1 from pg_class c
     where c.relnamespace = 'private'::regnamespace and c.relkind in ('r', 'v', 'p', 'm')
       and has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate') $$, 0,
  'no private table or view is reachable');

-- ── Policies ────────────────────────────────────────────────────────────────
select test_support.assert_eq_text(
  pg_temp.differs(
    array(select p.tablename || ' ' || p.cmd || ' ' || p.policyname from pg_policies p where p.schemaname = 'public'),
    array[
      'user_settings SELECT own settings', 'terms_versions SELECT anyone signed in',
      'terms_acceptances SELECT own acceptances', 'platform_staff SELECT staff see staff',
      'account_restrictions SELECT staff read restrictions',
      'notifications SELECT own notifications', 'notification_preferences SELECT own preferences',
      'push_devices SELECT own devices',
      'friend_requests SELECT sent or received', 'friendships SELECT own friendships', 'blocks SELECT own blocks',
      'friend_links SELECT own links',
      'communities SELECT members', 'community_members SELECT members', 'roles SELECT members',
      'role_permissions SELECT members', 'member_roles SELECT members', 'channel_categories SELECT members',
      'collapsed_categories SELECT own', 'invites SELECT invite managers', 'community_bans SELECT ban managers',
      'community_audit_log SELECT audit readers',
      'channels SELECT viewable', 'channel_participants SELECT own conversations',
      'channel_overwrites SELECT permission managers', 'channel_user_state SELECT own',
      'community_report_notes SELECT report managers', 'platform_cases SELECT staff',
      'platform_case_events SELECT staff', 'platform_case_decisions SELECT staff', 'case_media SELECT staff',
      'flairs SELECT anyone signed in', 'user_flairs SELECT own flairs'
    ]),
  '', 'the policies on Haven''s tables are exactly these, all of them for reading');
select test_support.assert_eq_text(
  pg_temp.differs(
    array(select p.schemaname || '.' || p.tablename || ' ' || p.cmd || ' ' || p.policyname
          from pg_policies p where p.schemaname in ('storage', 'realtime')),
    array[
      'storage.objects INSERT upload into own slot',
      'storage.objects SELECT read files on visible messages',
      'storage.objects SELECT staff read evidence they just opened',
      'realtime.messages SELECT own topic',
      'realtime.messages ALL voice room presence'
    ]),
  '', 'the policies on storage and realtime are exactly these');
select test_support.assert_eq_text(
  (select string_agg(b.id || ':' || case when b.public then 'public' else 'private' end, ', ' order by b.id)
   from storage.buckets b),
  'avatars:public, evidence:private, media:private, ota-bundles:public, previews:public',
  'the storage buckets, and which can be read by address alone');

-- ── Deleting something must not read a whole table ──────────────────────────
-- Rows of these tables are deleted in normal use, and each delete follows
-- every foreign key that points at them. Each such key needs an index.
select test_support.assert_eq_text(
  (select coalesce(string_agg(con.conrelid::regclass || '.' || con.conname, ', ' order by 1), '')
   from pg_constraint con
   where con.contype = 'f'
     and con.confrelid in (
       'public.messages'::regclass, 'public.channels'::regclass, 'public.media'::regclass,
       'public.channel_categories'::regclass, 'public.roles'::regclass, 'public.community_members'::regclass)
     and not exists (
       select 1 from pg_index i where i.indrelid = con.conrelid and i.indkey[0] = any (con.conkey))),
  '', 'every foreign key to a table whose rows get deleted is indexed');

rollback;
