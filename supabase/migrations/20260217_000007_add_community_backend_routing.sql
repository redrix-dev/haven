-- Community-scoped backend routing seam.
-- This stores non-secret backend routing metadata only.
-- Secret credentials should remain in managed secrets storage, not this table.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'community_backend_kind'
      and n.nspname = 'public'
  ) then
    create type public.community_backend_kind as enum (
      'central_supabase',
      'byo_supabase',
      'byo_rest'
    );
  end if;
end $$;

create table if not exists public.community_backend_configs (
  community_id uuid primary key references public.communities(id) on delete cascade,
  backend_kind public.community_backend_kind not null default 'central_supabase',
  is_enabled boolean not null default true,
  connection_label text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    connection_label is null
    or char_length(trim(connection_label)) between 1 and 100
  )
);

create index if not exists idx_community_backend_configs_kind
  on public.community_backend_configs(backend_kind);

drop trigger if exists trg_community_backend_configs_updated_at on public.community_backend_configs;
create trigger trg_community_backend_configs_updated_at
before update on public.community_backend_configs
for each row execute function public.set_updated_at();

create or replace function public.ensure_community_backend_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_backend_configs (
    community_id,
    backend_kind,
    is_enabled
  )
  values (
    new.id,
    'central_supabase',
    true
  )
  on conflict (community_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_create_community_backend_config on public.communities;
create trigger trg_create_community_backend_config
after insert on public.communities
for each row execute function public.ensure_community_backend_config();

-- Backfill for already-existing communities.
insert into public.community_backend_configs (community_id, backend_kind, is_enabled)
select c.id, 'central_supabase'::public.community_backend_kind, true
from public.communities c
on conflict (community_id) do nothing;

alter table public.community_backend_configs enable row level security;

drop policy if exists community_backend_configs_select_member on public.community_backend_configs;
create policy community_backend_configs_select_member
on public.community_backend_configs
for select
to authenticated
using (public.is_community_member(community_id));

drop policy if exists community_backend_configs_insert_manager on public.community_backend_configs;
create policy community_backend_configs_insert_manager
on public.community_backend_configs
for insert
to authenticated
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_server')
);

drop policy if exists community_backend_configs_update_manager on public.community_backend_configs;
create policy community_backend_configs_update_manager
on public.community_backend_configs
for update
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_server')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_server')
);

