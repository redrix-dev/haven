-- Read-only queue health diagnostics RPC for web push dispatch cutover readiness.
-- Exposes aggregate backlog/retry/dead-letter metrics to platform staff (and service roles)
-- so the app diagnostics panel can raise warnings before enabling real wakeup cutover.

create or replace function public.get_web_push_dispatch_queue_health_diagnostics()
returns table(
  as_of timestamptz,
  total_pending bigint,
  total_retryable_failed bigint,
  total_processing bigint,
  total_done bigint,
  total_dead_letter bigint,
  total_skipped bigint,
  claimable_now_count bigint,
  pending_due_now_count bigint,
  retryable_due_now_count bigint,
  processing_lease_expired_count bigint,
  oldest_claimable_age_seconds integer,
  oldest_pending_age_seconds integer,
  oldest_retryable_failed_age_seconds integer,
  oldest_processing_age_seconds integer,
  oldest_processing_lease_overdue_seconds integer,
  max_attempts_active integer,
  high_retry_attempt_count bigint,
  dead_letter_last_60m_count bigint,
  retryable_failed_last_10m_count bigint,
  done_last_10m_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user text := current_user;
  v_auth_role text := coalesce(auth.role(), '');
  v_auth_uid uuid := auth.uid();
  v_is_platform_staff boolean := false;
  v_now timestamptz := timezone('utc', now());
begin
  -- SECURITY DEFINER functions run as the owner (usually postgres), so prefer
  -- JWT/auth context for browser/API callers when present.
  if v_auth_uid is not null or v_auth_role in ('authenticated', 'anon') then
    if v_auth_role in ('service_role', 'supabase_admin') then
      null;
    else
      if v_auth_uid is null then
        raise exception 'Not authenticated'
          using errcode = '42501';
      end if;

      select public.is_platform_staff(v_auth_uid) into v_is_platform_staff;
      if coalesce(v_is_platform_staff, false) = false then
        raise exception 'Only active platform staff can read web push queue diagnostics'
          using errcode = '42501';
      end if;
    end if;
  elsif v_current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to read web push queue diagnostics'
      using errcode = '42501';
  end if;

  return query
  with job_rows as (
    select
      j.*,
      (
        (j.status in ('pending', 'retryable_failed') and j.available_at <= v_now)
        or (
          j.status = 'processing'
          and coalesce(j.lease_expires_at, j.locked_at, j.available_at, j.created_at) <= v_now
        )
      ) as is_claimable_now,
      (j.status = 'pending' and j.available_at <= v_now) as is_pending_due_now,
      (j.status = 'retryable_failed' and j.available_at <= v_now) as is_retryable_due_now,
      (
        j.status = 'processing'
        and coalesce(j.lease_expires_at, j.locked_at, j.available_at, j.created_at) <= v_now
      ) as is_processing_lease_expired,
      floor(extract(epoch from (v_now - j.created_at)))::integer as created_age_seconds,
      floor(
        extract(
          epoch
          from (
            v_now - coalesce(j.lease_expires_at, j.locked_at, j.available_at, j.created_at)
          )
        )
      )::integer as lease_reference_age_seconds
    from public.web_push_notification_jobs j
  ),
  aggregates as (
    select
      count(*) filter (where status = 'pending')::bigint as total_pending,
      count(*) filter (where status = 'retryable_failed')::bigint as total_retryable_failed,
      count(*) filter (where status = 'processing')::bigint as total_processing,
      count(*) filter (where status = 'done')::bigint as total_done,
      count(*) filter (where status = 'dead_letter')::bigint as total_dead_letter,
      count(*) filter (where status = 'skipped')::bigint as total_skipped,
      count(*) filter (where is_claimable_now)::bigint as claimable_now_count,
      count(*) filter (where is_pending_due_now)::bigint as pending_due_now_count,
      count(*) filter (where is_retryable_due_now)::bigint as retryable_due_now_count,
      count(*) filter (where is_processing_lease_expired)::bigint as processing_lease_expired_count,
      max(created_age_seconds) filter (where is_claimable_now) as oldest_claimable_age_seconds,
      max(created_age_seconds) filter (where status = 'pending') as oldest_pending_age_seconds,
      max(created_age_seconds) filter (where status = 'retryable_failed') as oldest_retryable_failed_age_seconds,
      max(created_age_seconds) filter (where status = 'processing') as oldest_processing_age_seconds,
      max(lease_reference_age_seconds) filter (where is_processing_lease_expired)
        as oldest_processing_lease_overdue_seconds,
      max(attempts) filter (where status in ('pending', 'retryable_failed', 'processing'))
        as max_attempts_active,
      count(*) filter (where status in ('retryable_failed', 'processing') and attempts >= 3)::bigint
        as high_retry_attempt_count,
      count(*) filter (
        where status = 'dead_letter'
          and coalesce(processed_at, updated_at, created_at) >= v_now - interval '60 minutes'
      )::bigint as dead_letter_last_60m_count,
      count(*) filter (
        where status = 'retryable_failed'
          and coalesce(updated_at, created_at) >= v_now - interval '10 minutes'
      )::bigint as retryable_failed_last_10m_count,
      count(*) filter (
        where status = 'done'
          and coalesce(processed_at, updated_at, created_at) >= v_now - interval '10 minutes'
      )::bigint as done_last_10m_count
    from job_rows
  )
  select
    v_now as as_of,
    coalesce(a.total_pending, 0),
    coalesce(a.total_retryable_failed, 0),
    coalesce(a.total_processing, 0),
    coalesce(a.total_done, 0),
    coalesce(a.total_dead_letter, 0),
    coalesce(a.total_skipped, 0),
    coalesce(a.claimable_now_count, 0),
    coalesce(a.pending_due_now_count, 0),
    coalesce(a.retryable_due_now_count, 0),
    coalesce(a.processing_lease_expired_count, 0),
    a.oldest_claimable_age_seconds,
    a.oldest_pending_age_seconds,
    a.oldest_retryable_failed_age_seconds,
    a.oldest_processing_age_seconds,
    a.oldest_processing_lease_overdue_seconds,
    a.max_attempts_active,
    coalesce(a.high_retry_attempt_count, 0),
    coalesce(a.dead_letter_last_60m_count, 0),
    coalesce(a.retryable_failed_last_10m_count, 0),
    coalesce(a.done_last_10m_count, 0)
  from aggregates a;
end;
$$;

revoke all on function public.get_web_push_dispatch_queue_health_diagnostics() from public;
grant execute on function public.get_web_push_dispatch_queue_health_diagnostics()
  to authenticated, postgres, service_role;

