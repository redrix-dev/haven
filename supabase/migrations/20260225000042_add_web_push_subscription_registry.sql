-- Web push subscription registry (additive, v1)
-- Stores per-user browser push subscriptions for future background/lock-screen delivery.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  expiration_time timestamptz,
  user_agent text,
  client_platform text,
  app_display_mode text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  check (char_length(trim(endpoint)) > 0),
  check (char_length(trim(p256dh_key)) > 0),
  check (char_length(trim(auth_key)) > 0)
);

create index if not exists idx_web_push_subscriptions_user_updated_at
  on public.web_push_subscriptions(user_id, updated_at desc);

create index if not exists idx_web_push_subscriptions_last_seen_at
  on public.web_push_subscriptions(last_seen_at asc);

drop trigger if exists trg_web_push_subscriptions_updated_at on public.web_push_subscriptions;
create trigger trg_web_push_subscriptions_updated_at
before update on public.web_push_subscriptions
for each row execute function public.set_updated_at();

alter table public.web_push_subscriptions enable row level security;

drop policy if exists web_push_subscriptions_select_self on public.web_push_subscriptions;
create policy web_push_subscriptions_select_self
on public.web_push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists web_push_subscriptions_insert_self on public.web_push_subscriptions;
create policy web_push_subscriptions_insert_self
on public.web_push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists web_push_subscriptions_update_self on public.web_push_subscriptions;
create policy web_push_subscriptions_update_self
on public.web_push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists web_push_subscriptions_delete_self on public.web_push_subscriptions;
create policy web_push_subscriptions_delete_self
on public.web_push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.list_my_web_push_subscriptions()
returns table(
  id uuid,
  user_id uuid,
  endpoint text,
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

create or replace function public.upsert_my_web_push_subscription(
  p_endpoint text,
  p_p256dh_key text,
  p_auth_key text,
  p_expiration_time timestamptz default null,
  p_user_agent text default null,
  p_client_platform text default null,
  p_app_display_mode text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  id uuid,
  user_id uuid,
  endpoint text,
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

  return query
  insert into public.web_push_subscriptions (
    user_id,
    endpoint,
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
    v_p256dh_key,
    v_auth_key,
    p_expiration_time,
    nullif(trim(coalesce(p_user_agent, '')), ''),
    nullif(trim(coalesce(p_client_platform, '')), ''),
    nullif(trim(coalesce(p_app_display_mode, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    v_now
  )
  on conflict on constraint web_push_subscriptions_endpoint_key do update
  set
    user_id = auth.uid(),
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
  jsonb
) from public;
grant execute on function public.upsert_my_web_push_subscription(
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  jsonb
) to authenticated;

create or replace function public.delete_my_web_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  v_endpoint text := trim(coalesce(p_endpoint, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_endpoint = '' then
    return false;
  end if;

  delete from public.web_push_subscriptions
  where user_id = auth.uid()
    and endpoint = v_endpoint;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.delete_my_web_push_subscription(text) from public;
grant execute on function public.delete_my_web_push_subscription(text) to authenticated;
