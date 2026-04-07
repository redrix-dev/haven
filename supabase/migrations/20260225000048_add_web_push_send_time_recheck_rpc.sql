-- Add a batched send-time web push recheck RPC for hybrid suppression logic.
-- Claim-time remains the coarse/global filter. This RPC is for final, volatile checks
-- (currently DM mute changes after queueing but before send).

create or replace function public.recheck_web_push_notification_jobs_for_send(
  p_job_ids uuid[]
)
returns table(
  job_id uuid,
  should_deliver_push boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to recheck web push jobs'
      using errcode = '42501';
  end if;

  return query
  with requested_jobs as (
    select distinct unnest(coalesce(p_job_ids, '{}'::uuid[])) as requested_job_id
  ),
  job_context as (
    select
      j.id as job_id,
      nr.recipient_user_id,
      ne.kind,
      nr.read_at as recipient_read_at,
      nr.dismissed_at as recipient_dismissed_at,
      case
        when ne.kind <> 'dm_message' then false
        when coalesce(ne.payload->>'conversationId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then false
        else exists (
          select 1
          from public.dm_conversation_notification_preferences pref
          where pref.conversation_id = (ne.payload->>'conversationId')::uuid
            and pref.user_id = nr.recipient_user_id
            and coalesce(pref.in_app_override, false) = false
            and coalesce(pref.sound_override, false) = false
            and (
              pref.muted_until is null
              or pref.muted_until > timezone('utc', now())
            )
        )
      end as dm_conversation_muted
    from requested_jobs r
    join public.web_push_notification_jobs j
      on j.id = r.requested_job_id
    join public.notification_recipients nr
      on nr.id = j.notification_recipient_id
    join public.notification_events ne
      on ne.id = j.notification_event_id
  )
  select
    c.job_id,
    case
      when c.recipient_read_at is not null or c.recipient_dismissed_at is not null then false
      when public.resolve_notification_push_delivery_for_user(c.recipient_user_id, c.kind) is not true then false
      when c.kind = 'dm_message' and c.dm_conversation_muted then false
      else true
    end as should_deliver_push,
    case
      when c.recipient_read_at is not null or c.recipient_dismissed_at is not null
        then 'recipient_read_or_dismissed'
      when public.resolve_notification_push_delivery_for_user(c.recipient_user_id, c.kind) is not true
        then 'push_pref_disabled'
      when c.kind = 'dm_message' and c.dm_conversation_muted
        then 'dm_conversation_muted'
      else 'ok'
    end as reason
  from job_context c
  order by c.job_id;
end;
$$;

revoke all on function public.recheck_web_push_notification_jobs_for_send(uuid[]) from public;
grant execute on function public.recheck_web_push_notification_jobs_for_send(uuid[])
  to postgres, service_role;
