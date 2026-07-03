begin;

select test_support.note('suite 20: internal function ACL lockdown (chore/acl-rescope)');

-- Regression canary for the ACL rescope. The internal job-queue workers and the
-- flair internal helper must remain service_role-only. If a future out-of-band
-- blanket GRANT re-opens them to authenticated (the exact drift this branch fixed),
-- these assertions fail loudly. Permission is checked before the function body runs,
-- so the dummy arguments below never execute -- the call is denied at resolution.

set local role authenticated;

select test_support.expect_exception(
  $$select public.ensure_user_flair_grant(gen_random_uuid(), gen_random_uuid(), 'manual', null::uuid, null::uuid)$$,
  'permission denied for function'
);

select test_support.expect_exception(
  $$select * from public.claim_link_preview_jobs(5, 60)$$,
  'permission denied for function'
);

select test_support.expect_exception(
  $$select public.complete_link_preview_job(gen_random_uuid(), 'done', null::text, 60)$$,
  'permission denied for function'
);

select test_support.expect_exception(
  $$select public.enqueue_link_preview_jobs_for_messages(array[]::uuid[], 'canary')$$,
  'permission denied for function'
);

select test_support.expect_exception(
  $$select * from public.claim_message_attachment_deletion_jobs(5, 60)$$,
  'permission denied for function'
);

select test_support.expect_exception(
  $$select public.complete_message_attachment_deletion_job(gen_random_uuid(), 'done', null::text, 60)$$,
  'permission denied for function'
);

reset role;

rollback;
