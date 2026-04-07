-- Stable web push installation identity (additive)
-- Allows same-device endpoint rotations to replace a prior subscription cleanly.

alter table public.web_push_subscriptions
  add column if not exists installation_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'web_push_subscriptions_installation_id_not_blank'
  ) then
    alter table public.web_push_subscriptions
      add constraint web_push_subscriptions_installation_id_not_blank
      check (installation_id is null or char_length(trim(installation_id)) > 0);
  end if;
end
$$;

create unique index if not exists uq_web_push_subscriptions_user_installation_id
  on public.web_push_subscriptions(user_id, installation_id)
  where installation_id is not null;

create index if not exists idx_web_push_subscriptions_user_installation_updated_at
  on public.web_push_subscriptions(user_id, installation_id, updated_at desc)
  where installation_id is not null;

drop function if exists public.list_my_web_push_subscriptions();

create function public.list_my_web_push_subscriptions()
returns table(
  id uuid,
  user_id uuid,
  endpoint text,
  installation_id text,
  p256dh_key text,
  auth_key text,
  expiration_time timestamptz,
  user_agent text,
  client_platform text,
  app_display_mode text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.user_id,
    s.endpoint,
    s.installation_id,
    s.p256dh_key,
    s.auth_key,
    s.expiration_time,
    s.user_agent,
    s.client_platform,
    s.app_display_mode,
    s.metadata,
    s.created_at,
    s.updated_at,
    s.last_seen_at
  from public.web_push_subscriptions s
  where s.user_id = auth.uid()
  order by s.updated_at desc, s.id desc;
$$;

revoke all on function public.list_my_web_push_subscriptions() from public;
grant execute on function public.list_my_web_push_subscriptions() to authenticated;

drop function if exists public.upsert_my_web_push_subscription(
  text, text, text, timestamptz, text, text, text, jsonb
);

create function public.upsert_my_web_push_subscription(
  p_endpoint text,
  p_p256dh_key text,
  p_auth_key text,
  p_expiration_time timestamptz default null,
  p_user_agent text default null,
  p_client_platform text default null,
  p_app_display_mode text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_installation_id text default null
)
returns table(
  id uuid,
  user_id uuid,
  endpoint text,
  installation_id text,
  p256dh_key text,
  auth_key text,
  expiration_time timestamptz,
  user_agent text,
  client_platform text,
  app_display_mode text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_endpoint text := trim(coalesce(p_endpoint, ''));
  v_p256dh_key text := trim(coalesce(p_p256dh_key, ''));
  v_auth_key text := trim(coalesce(p_auth_key, ''));
  v_installation_id text := nullif(trim(coalesce(p_installation_id, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_endpoint = '' then
    raise exception 'Push subscription endpoint is required.';
  end if;

  if v_p256dh_key = '' then
    raise exception 'Push subscription p256dh key is required.';
  end if;

  if v_auth_key = '' then
    raise exception 'Push subscription auth key is required.';
  end if;

  if v_installation_id is not null then
    v_metadata := v_metadata || jsonb_build_object('installationId', v_installation_id);

    delete from public.web_push_subscriptions s
    where s.user_id = auth.uid()
      and s.installation_id = v_installation_id
      and s.endpoint <> v_endpoint;
  end if;

  return query
  insert into public.web_push_subscriptions (
    user_id,
    endpoint,
    installation_id,
    p256dh_key,
    auth_key,
    expiration_time,
    user_agent,
    client_platform,
    app_display_mode,
    metadata,
    last_seen_at
  )
  values (
    auth.uid(),
    v_endpoint,
    v_installation_id,
    v_p256dh_key,
    v_auth_key,
    p_expiration_time,
    nullif(trim(coalesce(p_user_agent, '')), ''),
    nullif(trim(coalesce(p_client_platform, '')), ''),
    nullif(trim(coalesce(p_app_display_mode, '')), ''),
    v_metadata,
    v_now
  )
  on conflict on constraint web_push_subscriptions_endpoint_key do update
  set
    user_id = auth.uid(),
    installation_id = excluded.installation_id,
    p256dh_key = excluded.p256dh_key,
    auth_key = excluded.auth_key,
    expiration_time = excluded.expiration_time,
    user_agent = excluded.user_agent,
    client_platform = excluded.client_platform,
    app_display_mode = excluded.app_display_mode,
    metadata = coalesce(excluded.metadata, '{}'::jsonb),
    last_seen_at = v_now,
    updated_at = v_now
  returning
    web_push_subscriptions.id,
    web_push_subscriptions.user_id,
    web_push_subscriptions.endpoint,
    web_push_subscriptions.installation_id,
    web_push_subscriptions.p256dh_key,
    web_push_subscriptions.auth_key,
    web_push_subscriptions.expiration_time,
    web_push_subscriptions.user_agent,
    web_push_subscriptions.client_platform,
    web_push_subscriptions.app_display_mode,
    web_push_subscriptions.metadata,
    web_push_subscriptions.created_at,
    web_push_subscriptions.updated_at,
    web_push_subscriptions.last_seen_at;
end;
$$;

revoke all on function public.upsert_my_web_push_subscription(
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  text
) from public;
grant execute on function public.upsert_my_web_push_subscription(
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  text
) to authenticated;
