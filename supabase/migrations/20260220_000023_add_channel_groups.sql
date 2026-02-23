-- Add shared channel groups with per-user collapse state.

create table if not exists public.channel_groups (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  position integer not null default 0,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (community_id, id)
);

create unique index if not exists channel_groups_community_name_unique_ci
  on public.channel_groups (community_id, lower(name));

create index if not exists idx_channel_groups_community_position
  on public.channel_groups (community_id, position asc);

create table if not exists public.channel_group_channels (
  community_id uuid not null,
  channel_id uuid not null,
  group_id uuid not null,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (community_id, channel_id),
  foreign key (community_id, channel_id)
    references public.channels(community_id, id)
    on delete cascade,
  foreign key (community_id, group_id)
    references public.channel_groups(community_id, id)
    on delete cascade
);

create index if not exists idx_channel_group_channels_group_position
  on public.channel_group_channels (community_id, group_id, position asc);

create table if not exists public.channel_group_preferences (
  community_id uuid not null,
  group_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (community_id, group_id, user_id),
  foreign key (community_id, group_id)
    references public.channel_groups(community_id, id)
    on delete cascade
);

drop trigger if exists trg_channel_groups_updated_at on public.channel_groups;
create trigger trg_channel_groups_updated_at
before update on public.channel_groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_channel_group_channels_updated_at on public.channel_group_channels;
create trigger trg_channel_group_channels_updated_at
before update on public.channel_group_channels
for each row execute function public.set_updated_at();

drop trigger if exists trg_channel_group_preferences_updated_at on public.channel_group_preferences;
create trigger trg_channel_group_preferences_updated_at
before update on public.channel_group_preferences
for each row execute function public.set_updated_at();

alter table public.channel_groups enable row level security;
alter table public.channel_group_channels enable row level security;
alter table public.channel_group_preferences enable row level security;

drop policy if exists channel_groups_select_member on public.channel_groups;
create policy channel_groups_select_member
on public.channel_groups
for select
to authenticated
using (public.is_community_member(community_id));

drop policy if exists channel_groups_mutate_manager on public.channel_groups;
create policy channel_groups_mutate_manager
on public.channel_groups
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channels')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channels')
);

drop policy if exists channel_group_channels_select_member on public.channel_group_channels;
create policy channel_group_channels_select_member
on public.channel_group_channels
for select
to authenticated
using (public.is_community_member(community_id));

drop policy if exists channel_group_channels_mutate_manager on public.channel_group_channels;
create policy channel_group_channels_mutate_manager
on public.channel_group_channels
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channels')
)
with check (
  public.is_community_owner(community_id)
  or public.user_has_permission(community_id, 'manage_channels')
);

drop policy if exists channel_group_preferences_select_self on public.channel_group_preferences;
create policy channel_group_preferences_select_self
on public.channel_group_preferences
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_community_member(community_id)
);

drop policy if exists channel_group_preferences_mutate_self on public.channel_group_preferences;
create policy channel_group_preferences_mutate_self
on public.channel_group_preferences
for all
to authenticated
using (
  user_id = auth.uid()
  and public.is_community_member(community_id)
)
with check (
  user_id = auth.uid()
  and public.is_community_member(community_id)
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'channel_groups'
    ) then
      alter publication supabase_realtime add table public.channel_groups;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'channel_group_channels'
    ) then
      alter publication supabase_realtime add table public.channel_group_channels;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'channel_group_preferences'
    ) then
      alter publication supabase_realtime add table public.channel_group_preferences;
    end if;
  end if;
end $$;
