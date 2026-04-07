-- Reset migration for early-stage rebuild.
-- This intentionally drops current app tables and recreates a stricter schema.

create extension if not exists pgcrypto;

-- Clean up old triggers first.
drop trigger if exists on_auth_user_created on auth.users;
-- Table-scoped triggers are removed automatically when tables are dropped.

-- Clean up helper functions.
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.assign_default_role_on_member_insert() cascade;
drop function if exists public.create_community_defaults() cascade;
drop function if exists public.is_community_member(uuid) cascade;
drop function if exists public.is_community_owner(uuid) cascade;
drop function if exists public.user_has_permission(uuid, text) cascade;
drop function if exists public.can_view_channel(uuid) cascade;
drop function if exists public.can_send_in_channel(uuid) cascade;

-- Drop app tables (old + new names) for a clean rebuild.
drop table if exists public.support_report_messages cascade;
drop table if exists public.support_report_channels cascade;
drop table if exists public.support_reports cascade;
drop table if exists public.community_developer_access_channels cascade;
drop table if exists public.community_developer_access cascade;
drop table if exists public.messages cascade;
drop table if exists public.channel_member_overwrites cascade;
drop table if exists public.channel_role_overwrites cascade;
drop table if exists public.channel_permissions cascade;
drop table if exists public.channels cascade;
drop table if exists public.member_roles cascade;
drop table if exists public.community_members cascade;
drop table if exists public.role_permissions cascade;
drop table if exists public.permissions_catalog cascade;
drop table if exists public.roles cascade;
drop table if exists public.community_settings cascade;
drop table if exists public.invites cascade;
drop table if exists public.communities cascade;
drop table if exists public.profiles cascade;

-- Drop custom types.
drop type if exists public.support_report_status cascade;
drop type if exists public.developer_access_mode cascade;
drop type if exists public.message_author_type cascade;
drop type if exists public.channel_kind cascade;

create type public.channel_kind as enum ('text');
create type public.message_author_type as enum ('user', 'haven_dev', 'system');
create type public.developer_access_mode as enum ('report_only', 'channel_scoped');
create type public.support_report_status as enum ('open', 'in_review', 'resolved', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(trim(username)) between 2 and 32),
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.community_settings (
  community_id uuid primary key references public.communities(id) on delete cascade,
  allow_public_invites boolean not null default false,
  allow_haven_developer_access boolean not null default false,
  developer_access_mode public.developer_access_mode not null default 'report_only',
  require_report_reason boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  color text not null default '#99aab5',
  position integer not null default 0,
  is_default boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (community_id, id)
);

create unique index roles_community_name_unique_ci
  on public.roles (community_id, lower(name));

create unique index roles_one_default_per_community
  on public.roles (community_id)
  where is_default = true;

create table public.permissions_catalog (
  key text primary key,
  description text not null
);

insert into public.permissions_catalog (key, description) values
  ('view_channels', 'View text channels'),
  ('send_messages', 'Send messages in channels'),
  ('manage_server', 'Manage server settings'),
  ('manage_roles', 'Create/edit/delete roles'),
  ('manage_members', 'Manage member joins, kicks, bans'),
  ('create_channels', 'Create channels'),
  ('manage_channels', 'Edit/delete channels'),
  ('manage_channel_permissions', 'Edit channel role/member overwrites'),
  ('manage_messages', 'Delete or moderate messages'),
  ('manage_invites', 'Create/revoke invite links'),
  ('create_reports', 'Create report-to-Haven submissions'),
  ('manage_reports', 'Manage support report lifecycle'),
  ('manage_developer_access', 'Toggle and scope Haven developer access'),
  ('mention_haven_developers', 'Use @Haven Developers mention');

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions_catalog(key) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (role_id, permission_key)
);

create table public.community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text,
  is_owner boolean not null default false,
  joined_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (community_id, user_id),
  unique (community_id, id)
);

create table public.member_roles (
  community_id uuid not null,
  member_id uuid not null,
  role_id uuid not null,
  assigned_by_user_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc', now()),
  primary key (member_id, role_id),
  foreign key (community_id, member_id)
    references public.community_members(community_id, id)
    on delete cascade,
  foreign key (community_id, role_id)
    references public.roles(community_id, id)
    on delete cascade
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  topic text,
  kind public.channel_kind not null default 'text',
  position integer not null default 0,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (community_id, id)
);

create unique index channels_community_name_unique_ci
  on public.channels (community_id, lower(name));

create table public.channel_role_overwrites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  channel_id uuid not null,
  role_id uuid not null,
  can_view boolean,
  can_send boolean,
  can_manage boolean,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (channel_id, role_id),
  foreign key (community_id, channel_id)
    references public.channels(community_id, id)
    on delete cascade,
  foreign key (community_id, role_id)
    references public.roles(community_id, id)
    on delete cascade
);

create table public.channel_member_overwrites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  channel_id uuid not null,
  member_id uuid not null,
  can_view boolean,
  can_send boolean,
  can_manage boolean,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (channel_id, member_id),
  foreign key (community_id, channel_id)
    references public.channels(community_id, id)
    on delete cascade,
  foreign key (community_id, member_id)
    references public.community_members(community_id, id)
    on delete cascade
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  channel_id uuid not null,
  author_type public.message_author_type not null default 'user',
  author_user_id uuid references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  edited_at timestamptz,
  deleted_at timestamptz,
  foreign key (community_id, channel_id)
    references public.channels(community_id, id)
    on delete cascade,
  check (
    (author_type = 'user' and author_user_id is not null)
    or (author_type in ('haven_dev', 'system'))
  )
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  code text not null unique check (char_length(trim(code)) between 4 and 64),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  max_uses integer check (max_uses is null or max_uses > 0),
  current_uses integer not null default 0 check (current_uses >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  check (max_uses is null or current_uses <= max_uses)
);

create table public.community_developer_access (
  community_id uuid primary key references public.communities(id) on delete cascade,
  enabled boolean not null default false,
  mode public.developer_access_mode not null default 'report_only',
  granted_by_user_id uuid references public.profiles(id) on delete set null,
  granted_at timestamptz,
  expires_at timestamptz,
  notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  check (expires_at is null or granted_at is null or expires_at > granted_at)
);

create table public.community_developer_access_channels (
  community_id uuid not null,
  channel_id uuid not null,
  primary key (community_id, channel_id),
  foreign key (community_id, channel_id)
    references public.channels(community_id, id)
    on delete cascade
);

create table public.support_reports (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete restrict,
  status public.support_report_status not null default 'open',
  title text not null check (char_length(trim(title)) between 3 and 120),
  notes text,
  include_last_n_messages integer check (include_last_n_messages is null or include_last_n_messages between 1 and 500),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.support_report_channels (
  report_id uuid not null references public.support_reports(id) on delete cascade,
  community_id uuid not null,
  channel_id uuid not null,
  primary key (report_id, channel_id),
  foreign key (community_id, channel_id)
    references public.channels(community_id, id)
    on delete cascade
);

create table public.support_report_messages (
  report_id uuid not null references public.support_reports(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  primary key (report_id, message_id)
);

-- Performance indexes.
create index idx_community_members_user on public.community_members(user_id);
create index idx_member_roles_community_member on public.member_roles(community_id, member_id);
create index idx_member_roles_role on public.member_roles(role_id);
create index idx_roles_community_position on public.roles(community_id, position desc);
create index idx_channels_community_position on public.channels(community_id, position asc);
create index idx_messages_channel_created_at on public.messages(channel_id, created_at desc);
create index idx_messages_community_created_at on public.messages(community_id, created_at desc);
create index idx_invites_community on public.invites(community_id);
create index idx_support_reports_community_status on public.support_reports(community_id, status);
create index idx_channel_role_overwrites_channel on public.channel_role_overwrites(channel_id);
create index idx_channel_member_overwrites_channel on public.channel_member_overwrites(channel_id);

-- Generic timestamp trigger function.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Auth user -> profile bootstrap.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'username'), ''),
      'user_' || left(replace(new.id::text, '-', ''), 12)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for already-existing auth users.
insert into public.profiles (id, username)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    'user_' || left(replace(u.id::text, '-', ''), 12)
  )
from auth.users u
on conflict (id) do nothing;

-- Permission helpers for RLS.
create function public.is_community_member(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
  );
$$;

create function public.is_community_owner(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.is_owner = true
  );
$$;

create function public.user_has_permission(p_community_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select cm.id, cm.is_owner
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
    limit 1
  )
  select
    coalesce((select is_owner from me), false)
    or exists (
      select 1
      from me
      join public.member_roles mr
        on mr.member_id = me.id
       and mr.community_id = p_community_id
      join public.role_permissions rp
        on rp.role_id = mr.role_id
      where rp.permission_key = p_permission_key
    );
$$;

create function public.can_view_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select c.id, c.community_id
    from public.channels c
    where c.id = p_channel_id
  ),
  me as (
    select cm.id as member_id, cm.community_id
    from public.community_members cm
    join target t on t.community_id = cm.community_id
    where cm.user_id = auth.uid()
    limit 1
  ),
  role_decision as (
    select
      bool_or(cro.can_view = false) as has_deny,
      bool_or(cro.can_view = true) as has_allow
    from me
    join public.member_roles mr
      on mr.member_id = me.member_id
     and mr.community_id = me.community_id
    join target t on true
    left join public.channel_role_overwrites cro
      on cro.community_id = t.community_id
     and cro.channel_id = t.id
     and cro.role_id = mr.role_id
  ),
  member_decision as (
    select
      bool_or(cmo.can_view = false) as has_deny,
      bool_or(cmo.can_view = true) as has_allow
    from me
    join target t on true
    left join public.channel_member_overwrites cmo
      on cmo.community_id = t.community_id
     and cmo.channel_id = t.id
     and cmo.member_id = me.member_id
  )
  select case
    when not exists (select 1 from target) then false
    when not exists (select 1 from me) then false
    when public.is_community_owner((select community_id from target)) then true
    when coalesce((select has_deny from member_decision), false) then false
    when coalesce((select has_allow from member_decision), false) then true
    when coalesce((select has_deny from role_decision), false) then false
    when coalesce((select has_allow from role_decision), false) then true
    else public.user_has_permission((select community_id from target), 'view_channels')
  end;
$$;

create function public.can_send_in_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select c.id, c.community_id
    from public.channels c
    where c.id = p_channel_id
  ),
  me as (
    select cm.id as member_id, cm.community_id
    from public.community_members cm
    join target t on t.community_id = cm.community_id
    where cm.user_id = auth.uid()
    limit 1
  ),
  role_decision as (
    select
      bool_or(cro.can_send = false) as has_deny,
      bool_or(cro.can_send = true) as has_allow
    from me
    join public.member_roles mr
      on mr.member_id = me.member_id
     and mr.community_id = me.community_id
    join target t on true
    left join public.channel_role_overwrites cro
      on cro.community_id = t.community_id
     and cro.channel_id = t.id
     and cro.role_id = mr.role_id
  ),
  member_decision as (
    select
      bool_or(cmo.can_send = false) as has_deny,
      bool_or(cmo.can_send = true) as has_allow
    from me
    join target t on true
    left join public.channel_member_overwrites cmo
      on cmo.community_id = t.community_id
     and cmo.channel_id = t.id
     and cmo.member_id = me.member_id
  )
  select case
    when not exists (select 1 from target) then false
    when not exists (select 1 from me) then false
    when public.is_community_owner((select community_id from target)) then true
    when coalesce((select has_deny from member_decision), false) then false
    when coalesce((select has_allow from member_decision), false) then true
    when coalesce((select has_deny from role_decision), false) then false
    when coalesce((select has_allow from role_decision), false) then true
    else public.user_has_permission((select community_id from target), 'send_messages')
  end;
$$;

-- Auto-assign default role on membership insert.
create function public.assign_default_role_on_member_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_role_id uuid;
begin
  select r.id
    into v_default_role_id
  from public.roles r
  where r.community_id = new.community_id
    and r.is_default = true
  limit 1;

  if v_default_role_id is not null then
    insert into public.member_roles (
      community_id,
      member_id,
      role_id,
      assigned_by_user_id
    )
    values (
      new.community_id,
      new.id,
      v_default_role_id,
      new.user_id
    )
    on conflict (member_id, role_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger trg_assign_default_role_on_member_insert
after insert on public.community_members
for each row execute function public.assign_default_role_on_member_insert();

-- Create default roles/channels/settings when a server is created.
create function public.create_community_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_everyone_role_id uuid;
  v_owner_role_id uuid;
  v_admin_role_id uuid;
  v_moderator_role_id uuid;
  v_owner_member_id uuid;
begin
  insert into public.roles (community_id, name, color, position, is_default, is_system)
  values (new.id, '@everyone', '#99aab5', 0, true, true)
  returning id into v_everyone_role_id;

  insert into public.roles (community_id, name, color, position, is_default, is_system)
  values (new.id, 'Owner', '#f04747', 100, false, true)
  returning id into v_owner_role_id;

  insert into public.roles (community_id, name, color, position, is_default, is_system)
  values (new.id, 'Admin', '#43b581', 90, false, true)
  returning id into v_admin_role_id;

  insert into public.roles (community_id, name, color, position, is_default, is_system)
  values (new.id, 'Moderator', '#faa61a', 80, false, true)
  returning id into v_moderator_role_id;

  -- Owner gets all permissions.
  insert into public.role_permissions (role_id, permission_key)
  select v_owner_role_id, key
  from public.permissions_catalog;

  -- @everyone baseline permissions.
  insert into public.role_permissions (role_id, permission_key)
  values
    (v_everyone_role_id, 'view_channels'),
    (v_everyone_role_id, 'send_messages'),
    (v_everyone_role_id, 'create_reports');

  -- Admin permissions.
  insert into public.role_permissions (role_id, permission_key)
  values
    (v_admin_role_id, 'view_channels'),
    (v_admin_role_id, 'send_messages'),
    (v_admin_role_id, 'manage_server'),
    (v_admin_role_id, 'manage_roles'),
    (v_admin_role_id, 'manage_members'),
    (v_admin_role_id, 'create_channels'),
    (v_admin_role_id, 'manage_channels'),
    (v_admin_role_id, 'manage_channel_permissions'),
    (v_admin_role_id, 'manage_messages'),
    (v_admin_role_id, 'manage_invites'),
    (v_admin_role_id, 'manage_reports'),
    (v_admin_role_id, 'manage_developer_access'),
    (v_admin_role_id, 'mention_haven_developers'),
    (v_admin_role_id, 'create_reports');

  -- Moderator permissions.
  insert into public.role_permissions (role_id, permission_key)
  values
    (v_moderator_role_id, 'view_channels'),
    (v_moderator_role_id, 'send_messages'),
    (v_moderator_role_id, 'manage_messages'),
    (v_moderator_role_id, 'manage_reports'),
    (v_moderator_role_id, 'create_reports');

  insert into public.community_members (community_id, user_id, is_owner)
  values (new.id, new.created_by_user_id, true)
  returning id into v_owner_member_id;

  -- Member insert trigger assigns @everyone automatically; add Owner role explicitly.
  insert into public.member_roles (community_id, member_id, role_id, assigned_by_user_id)
  values (new.id, v_owner_member_id, v_owner_role_id, new.created_by_user_id)
  on conflict (member_id, role_id) do nothing;

  insert into public.channels (community_id, name, kind, position, created_by_user_id)
  values (new.id, 'general', 'text', 0, new.created_by_user_id);

  insert into public.community_settings (community_id) values (new.id);
  insert into public.community_developer_access (community_id, enabled, mode)
  values (new.id, false, 'report_only');

  return new;
end;
$$;

create trigger trg_create_community_defaults
after insert on public.communities
for each row execute function public.create_community_defaults();

-- Updated-at triggers.
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_communities_updated_at
before update on public.communities
for each row execute function public.set_updated_at();

create trigger trg_community_settings_updated_at
before update on public.community_settings
for each row execute function public.set_updated_at();

create trigger trg_roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create trigger trg_channels_updated_at
before update on public.channels
for each row execute function public.set_updated_at();

create trigger trg_channel_role_overwrites_updated_at
before update on public.channel_role_overwrites
for each row execute function public.set_updated_at();

create trigger trg_channel_member_overwrites_updated_at
before update on public.channel_member_overwrites
for each row execute function public.set_updated_at();

create trigger trg_developer_access_updated_at
before update on public.community_developer_access
for each row execute function public.set_updated_at();

create trigger trg_support_reports_updated_at
before update on public.support_reports
for each row execute function public.set_updated_at();

-- Ensure realtime publication includes key tables.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'community_members'
    ) then
      alter publication supabase_realtime add table public.community_members;
    end if;
  end if;
end $$;

-- Row Level Security.
alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_settings enable row level security;
alter table public.roles enable row level security;
alter table public.permissions_catalog enable row level security;
alter table public.role_permissions enable row level security;
alter table public.community_members enable row level security;
alter table public.member_roles enable row level security;
alter table public.channels enable row level security;
alter table public.channel_role_overwrites enable row level security;
alter table public.channel_member_overwrites enable row level security;
alter table public.messages enable row level security;
alter table public.invites enable row level security;
alter table public.community_developer_access enable row level security;
alter table public.community_developer_access_channels enable row level security;
alter table public.support_reports enable row level security;
alter table public.support_report_channels enable row level security;
alter table public.support_report_messages enable row level security;

-- Profiles
create policy profiles_select_self_or_shared
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.community_members me
    join public.community_members other
      on other.community_id = me.community_id
    where me.user_id = auth.uid()
      and other.user_id = profiles.id
  )
);

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Communities
create policy communities_select_member
on public.communities
for select
to authenticated
using (public.is_community_member(id));

create policy communities_insert_creator
on public.communities
for insert
to authenticated
with check (created_by_user_id = auth.uid());

create policy communities_update_manager
on public.communities
for update
to authenticated
using (
  public.is_community_owner(id)
  or public.user_has_permission(id, 'manage_server')
)
with check (
  public.is_community_owner(id)
  or public.user_has_permission(id, 'manage_server')
);

create policy communities_delete_owner
on public.communities
for delete
to authenticated
using (public.is_community_owner(id));

-- Community settings
create policy community_settings_select_member
on public.community_settings
for select
to authenticated
using (public.is_community_member(community_id));

create policy community_settings_update_manager
on public.community_settings
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

-- Roles
create policy roles_select_member
on public.roles
for select
to authenticated
using (public.is_community_member(community_id));

create policy roles_insert_manager
on public.roles
for insert
to authenticated
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_roles')
);

create policy roles_update_manager
on public.roles
for update
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_roles')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_roles')
);

create policy roles_delete_manager
on public.roles
for delete
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_roles')
);

-- Permissions catalog
create policy permissions_catalog_read_authenticated
on public.permissions_catalog
for select
to authenticated
using (true);

-- Role permissions
create policy role_permissions_select_member
on public.role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and public.is_community_member(r.community_id)
  )
);

create policy role_permissions_mutate_manager
on public.role_permissions
for all
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (
        public.is_community_owner(r.community_id)
        or public.user_has_permission(r.community_id, 'manage_roles')
      )
  )
)
with check (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (
        public.is_community_owner(r.community_id)
        or public.user_has_permission(r.community_id, 'manage_roles')
      )
  )
);

-- Community members
create policy community_members_select_member
on public.community_members
for select
to authenticated
using (public.is_community_member(community_id));

create policy community_members_insert_manager
on public.community_members
for insert
to authenticated
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_members')
);

create policy community_members_update_manager
on public.community_members
for update
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_members')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_members')
);

create policy community_members_delete_manager_or_self
on public.community_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_members')
);

-- Member roles
create policy member_roles_select_member
on public.member_roles
for select
to authenticated
using (public.is_community_member(community_id));

create policy member_roles_insert_manager
on public.member_roles
for insert
to authenticated
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_roles')
);

create policy member_roles_delete_manager
on public.member_roles
for delete
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_roles')
);

-- Channels
create policy channels_select_visible
on public.channels
for select
to authenticated
using (public.can_view_channel(id));

create policy channels_insert_manager
on public.channels
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'create_channels')
    or public.user_has_permission(community_id, 'manage_channels')
  )
);

create policy channels_update_manager
on public.channels
for update
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channels')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channels')
);

create policy channels_delete_manager
on public.channels
for delete
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channels')
);

-- Channel role overwrites
create policy channel_role_overwrites_select_member
on public.channel_role_overwrites
for select
to authenticated
using (public.is_community_member(community_id));

create policy channel_role_overwrites_mutate_manager
on public.channel_role_overwrites
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channel_permissions')
  or public.user_has_permission(community_id, 'manage_channels')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channel_permissions')
  or public.user_has_permission(community_id, 'manage_channels')
);

-- Channel member overwrites
create policy channel_member_overwrites_select_member
on public.channel_member_overwrites
for select
to authenticated
using (public.is_community_member(community_id));

create policy channel_member_overwrites_mutate_manager
on public.channel_member_overwrites
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channel_permissions')
  or public.user_has_permission(community_id, 'manage_channels')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channel_permissions')
  or public.user_has_permission(community_id, 'manage_channels')
);

-- Messages
create policy messages_select_visible_channel
on public.messages
for select
to authenticated
using (public.can_view_channel(channel_id));

create policy messages_insert_self_if_can_send
on public.messages
for insert
to authenticated
with check (
  author_type = 'user'
  and author_user_id = auth.uid()
  and public.can_send_in_channel(channel_id)
);

create policy messages_update_self
on public.messages
for update
to authenticated
using (
  author_type = 'user'
  and author_user_id = auth.uid()
)
with check (
  author_type = 'user'
  and author_user_id = auth.uid()
);

create policy messages_delete_self_or_moderator
on public.messages
for delete
to authenticated
using (
  (author_type = 'user' and author_user_id = auth.uid())
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_messages')
);

-- Invites
create policy invites_select_member
on public.invites
for select
to authenticated
using (public.is_community_member(community_id));

create policy invites_insert_manager
on public.invites
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_invites')
  )
);

create policy invites_update_manager
on public.invites
for update
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_invites')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_invites')
);

create policy invites_delete_manager
on public.invites
for delete
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_invites')
);

-- Haven developer access
create policy developer_access_select_member
on public.community_developer_access
for select
to authenticated
using (public.is_community_member(community_id));

create policy developer_access_update_manager
on public.community_developer_access
for update
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_developer_access')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_developer_access')
);

create policy developer_access_channels_select_member
on public.community_developer_access_channels
for select
to authenticated
using (public.is_community_member(community_id));

create policy developer_access_channels_mutate_manager
on public.community_developer_access_channels
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_developer_access')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_developer_access')
);

-- Support reports
create policy support_reports_select_visible
on public.support_reports
for select
to authenticated
using (
  reporter_user_id = auth.uid()
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_reports')
);

create policy support_reports_insert_reporter
on public.support_reports
for insert
to authenticated
with check (
  reporter_user_id = auth.uid()
  and public.user_has_permission(community_id, 'create_reports')
);

create policy support_reports_update_manager_or_reporter
on public.support_reports
for update
to authenticated
using (
  reporter_user_id = auth.uid()
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_reports')
)
with check (
  reporter_user_id = auth.uid()
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_reports')
);

create policy support_reports_delete_manager_or_reporter
on public.support_reports
for delete
to authenticated
using (
  reporter_user_id = auth.uid()
  or public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_reports')
);

create policy support_report_channels_select_visible
on public.support_report_channels
for select
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_channels.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
);

create policy support_report_channels_mutate_visible
on public.support_report_channels
for all
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_channels.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
)
with check (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_channels.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
);

create policy support_report_messages_select_visible
on public.support_report_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_messages.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
);

create policy support_report_messages_mutate_visible
on public.support_report_messages
for all
to authenticated
using (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_messages.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
)
with check (
  exists (
    select 1
    from public.support_reports sr
    where sr.id = support_report_messages.report_id
      and (
        sr.reporter_user_id = auth.uid()
        or public.is_community_owner(sr.community_id)
        or public.user_has_permission(sr.community_id, 'manage_reports')
      )
  )
);
