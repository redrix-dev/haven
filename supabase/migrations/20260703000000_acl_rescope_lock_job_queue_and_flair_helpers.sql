-- ACL rescope (chore/acl-rescope): lock internal job-queue workers and the flair
-- internal helper to service_role only.
--
-- Context: an out-of-band blanket "grant execute on all functions in schema public
-- to anon, authenticated" (present in no migration, applied via the SQL panel) had
-- re-opened every SECURITY DEFINER function to all clients, silently undoing the
-- targeted revokes in earlier migrations. The functions below are never invoked by
-- the app (absent from the client .rpc() surface) and never referenced by an RLS
-- policy; their only legitimate callers are edge workers running as service_role
-- and -- for ensure_user_flair_grant -- other SECURITY DEFINER functions, which run
-- as their owner and therefore do not require the caller to hold EXECUTE. Revoking
-- anon/authenticated EXECUTE closes the holes without affecting the client or RLS
-- evaluation, and none of these six carry an in-body authorization guard today.
--
-- Notably this closes a real privilege bug: ensure_user_flair_grant is the unguarded
-- internal helper beneath the platform-staff-gated grant_user_flair wrapper; while
-- callable by authenticated it allowed any signed-in user to self-grant any flair.
--
-- Deliberately scoped OUT of this migration (already self-guarded with in-body
-- auth.role() checks; to be hardened alongside the notification-dispatch rework):
-- the expo/web-push worker RPCs, create_notification_event_with_recipients,
-- clear_user_feature_flag, set_haven_background_cron_config, enqueue_report_alert.
-- The cleanup_expired_* sweeps are handled in the media-TTL branch that removes
-- their (currently unused) authenticated client caller.
--
-- NOTE: CREATE OR REPLACE preserves ACLs, so this lockdown survives future function
-- replacements. It does NOT survive another manual blanket GRANT -- do not run one.

do $$
declare
  target_names text[] := array[
    'ensure_user_flair_grant',
    'claim_link_preview_jobs',
    'complete_link_preview_job',
    'enqueue_link_preview_jobs_for_messages',
    'claim_message_attachment_deletion_jobs',
    'complete_message_attachment_deletion_job'
  ];
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(target_names)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;
