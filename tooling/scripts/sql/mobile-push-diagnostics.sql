-- Mobile push diagnostics (Expo + Supabase)
-- Copy/paste into Supabase SQL editor.

-- 1) Cron config sanity
select
  enabled,
  edge_base_url,
  left(cron_shared_secret, 6) as secret_prefix,
  updated_at
from public.background_worker_cron_config
where id = true;

-- 2) Registered Expo push subscriptions
select
  user_id,
  platform,
  installation_id,
  left(expo_push_token, 24) as token_prefix,
  updated_at,
  last_seen_at
from public.expo_push_subscriptions
order by updated_at desc
limit 25;

-- 3) Job queue status and recent jobs
select status, count(*)::int as count
from public.expo_push_notification_jobs
group by status
order by status;

select
  id,
  notification_recipient_id,
  recipient_user_id,
  status,
  attempts,
  provider_status_code,
  left(coalesce(last_error, ''), 180) as last_error_prefix,
  available_at,
  created_at,
  updated_at
from public.expo_push_notification_jobs
order by created_at desc
limit 30;

-- 4) Delivery traces for expo transport
select
  created_at,
  stage,
  decision,
  reason_code,
  left(details::text, 200) as details_prefix
from public.notification_delivery_traces
where transport = 'expo_push'
order by created_at desc
limit 50;
