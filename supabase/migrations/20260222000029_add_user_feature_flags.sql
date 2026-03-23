-- Per-account feature flags for gated development/beta features.
-- v1 is global (not community-scoped) and managed via SQL/service RPCs.

create table if not exists public.feature_flags_catalog (
  key text primary key,
  description text not null,
  enabled_by_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_feature_flag_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  flag_key text not null references public.feature_flags_catalog(key) on delete cascade,
  enabled boolean not null,
  assigned_by_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, flag_key)
);

create index if not exists idx_user_feature_flag_overrides_flag_enabled
  on public.user_feature_flag_overrides(flag_key, enabled);

create index if not exists idx_user_feature_flag_overrides_user
  on public.user_feature_flag_overrides(user_id);

alter table public.feature_flags_catalog enable row level security;
alter table public.user_feature_flag_overrides enable row level security;

drop trigger if exists trg_feature_flags_catalog_updated_at on public.feature_flags_catalog;
create trigger trg_feature_flags_catalog_updated_at
before update on public.feature_flags_catalog
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_feature_flag_overrides_updated_at on public.user_feature_flag_overrides;
create trigger trg_user_feature_flag_overrides_updated_at
before update on public.user_feature_flag_overrides
for each row execute function public.set_updated_at();

create or replace function public.list_my_feature_flags()
returns table(flag_key text, enabled boolean, source text, expires_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select
    catalog.key as flag_key,
    coalesce(flag_override.enabled, catalog.enabled_by_default) as enabled,
    case when flag_override.user_id is null then 'default' else 'override' end as source,
    flag_override.expires_at
  from public.feature_flags_catalog catalog
  left join public.user_feature_flag_overrides flag_override
    on flag_override.user_id = auth.uid()
   and flag_override.flag_key = catalog.key
   and (flag_override.expires_at is null or flag_override.expires_at > timezone('utc', now()))
  where auth.uid() is not null
  order by catalog.key asc;
$$;

revoke all on function public.list_my_feature_flags() from public;
grant execute on function public.list_my_feature_flags() to authenticated;

create or replace function public.set_user_feature_flag(
  p_user_id uuid,
  p_flag_key text,
  p_enabled boolean,
  p_reason text default null,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to mutate feature flags'
      using errcode = '42501';
  end if;

  insert into public.user_feature_flag_overrides (
    user_id,
    flag_key,
    enabled,
    assigned_by_user_id,
    reason,
    expires_at
  )
  values (
    p_user_id,
    p_flag_key,
    p_enabled,
    auth.uid(),
    p_reason,
    p_expires_at
  )
  on conflict (user_id, flag_key)
  do update set
    enabled = excluded.enabled,
    assigned_by_user_id = coalesce(excluded.assigned_by_user_id, public.user_feature_flag_overrides.assigned_by_user_id),
    reason = excluded.reason,
    expires_at = excluded.expires_at,
    updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.set_user_feature_flag(uuid, text, boolean, text, timestamptz) from public;
grant execute on function public.set_user_feature_flag(uuid, text, boolean, text, timestamptz)
  to postgres, service_role;

create or replace function public.clear_user_feature_flag(
  p_user_id uuid,
  p_flag_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to mutate feature flags'
      using errcode = '42501';
  end if;

  delete from public.user_feature_flag_overrides
  where user_id = p_user_id
    and flag_key = p_flag_key;
end;
$$;

revoke all on function public.clear_user_feature_flag(uuid, text) from public;
grant execute on function public.clear_user_feature_flag(uuid, text) to postgres, service_role;
