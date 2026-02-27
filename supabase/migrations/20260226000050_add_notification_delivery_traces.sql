-- Notification delivery traces (additive)
-- Stores explainable delivery decisions/outcomes for worker + client diagnostics.

create table if not exists public.notification_delivery_traces (
  id uuid primary key default gen_random_uuid(),
  notification_recipient_id uuid references public.notification_recipients(id) on delete cascade,
  notification_event_id uuid references public.notification_events(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  transport text not null check (
    transport in ('web_push', 'in_app', 'simulated_push', 'route_policy')
  ),
  stage text not null check (
    stage in ('enqueue', 'claim', 'send_time', 'client_route')
  ),
  decision text not null check (
    decision in ('send', 'skip', 'defer')
  ),
  reason_code text not null check (char_length(trim(reason_code)) > 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_notification_delivery_traces_user_created_at
  on public.notification_delivery_traces(recipient_user_id, created_at desc);

create index if not exists idx_notification_delivery_traces_recipient_created_at
  on public.notification_delivery_traces(notification_recipient_id, created_at desc);

alter table public.notification_delivery_traces enable row level security;

drop policy if exists notification_delivery_traces_select_self on public.notification_delivery_traces;
create policy notification_delivery_traces_select_self
on public.notification_delivery_traces
for select
to authenticated
using (recipient_user_id = auth.uid());

create or replace function public.list_my_notification_delivery_traces(
  p_limit integer default 50,
  p_notification_recipient_id uuid default null
)
returns table(
  id uuid,
  notification_recipient_id uuid,
  notification_event_id uuid,
  recipient_user_id uuid,
  transport text,
  stage text,
  decision text,
  reason_code text,
  details jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.notification_recipient_id,
    t.notification_event_id,
    t.recipient_user_id,
    t.transport,
    t.stage,
    t.decision,
    t.reason_code,
    t.details,
    t.created_at
  from public.notification_delivery_traces t
  where t.recipient_user_id = auth.uid()
    and (p_notification_recipient_id is null or t.notification_recipient_id = p_notification_recipient_id)
  order by t.created_at desc, t.id desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

revoke all on function public.list_my_notification_delivery_traces(integer, uuid) from public;
grant execute on function public.list_my_notification_delivery_traces(integer, uuid) to authenticated;

revoke all on table public.notification_delivery_traces from public;
revoke all on table public.notification_delivery_traces from authenticated;

