-- Read-only diagnostics RPC for the immediate web-push wakeup scheduler singleton.
-- Exposes non-secret debounce/attempt state to authenticated clients (for dev/staff tools).

create or replace function public.get_web_push_dispatch_wakeup_diagnostics()
returns table(
  enabled boolean,
  shadow_mode boolean,
  min_interval_seconds integer,
  last_attempted_at timestamptz,
  last_requested_at timestamptz,
  last_request_id bigint,
  last_mode text,
  last_reason text,
  last_skip_reason text,
  last_error text,
  total_attempts bigint,
  total_scheduled bigint,
  total_debounced bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    w.enabled,
    w.shadow_mode,
    w.min_interval_seconds,
    w.last_attempted_at,
    w.last_requested_at,
    w.last_request_id,
    w.last_mode,
    w.last_reason,
    w.last_skip_reason,
    w.last_error,
    w.total_attempts,
    w.total_scheduled,
    w.total_debounced,
    w.created_at,
    w.updated_at
  from public.notification_dispatch_wakeups w
  where w.id = true;
$$;

revoke all on function public.get_web_push_dispatch_wakeup_diagnostics() from public;
grant execute on function public.get_web_push_dispatch_wakeup_diagnostics()
  to authenticated, postgres, service_role;

