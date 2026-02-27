-- Staff/service-role mutation RPC for immediate web-push wakeup scheduler config.
-- Intended for controlled shadow/cutover testing via dev diagnostics tools.

create or replace function public.update_web_push_dispatch_wakeup_config(
  p_enabled boolean default null,
  p_shadow_mode boolean default null,
  p_min_interval_seconds integer default null
)
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user text := current_user;
  v_auth_role text := coalesce(auth.role(), '');
  v_auth_uid uuid := auth.uid();
  v_is_platform_staff boolean := false;
  v_min_interval integer;
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
        raise exception 'Only active platform staff can update web push wakeup config'
          using errcode = '42501';
      end if;
    end if;
  elsif v_current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to update web push wakeup config'
      using errcode = '42501';
  end if;

  v_min_interval := case
    when p_min_interval_seconds is null then null
    else greatest(1, least(60, p_min_interval_seconds))
  end;

  insert into public.notification_dispatch_wakeups (id)
  values (true)
  on conflict (id) do nothing;

  update public.notification_dispatch_wakeups w
  set
    enabled = coalesce(p_enabled, w.enabled),
    shadow_mode = coalesce(p_shadow_mode, w.shadow_mode),
    min_interval_seconds = coalesce(v_min_interval, w.min_interval_seconds),
    updated_at = timezone('utc', now())
  where w.id = true;

  return query
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
end;
$$;

revoke all on function public.update_web_push_dispatch_wakeup_config(boolean, boolean, integer) from public;
grant execute on function public.update_web_push_dispatch_wakeup_config(boolean, boolean, integer)
  to authenticated, postgres, service_role;
