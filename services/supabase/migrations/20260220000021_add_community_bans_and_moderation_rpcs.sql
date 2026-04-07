-- Add server ban records, enforcement, and moderation RPCs.

create table if not exists public.community_bans (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  banned_user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by_user_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  banned_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.profiles(id) on delete set null,
  revoked_reason text check (revoked_reason is null or char_length(trim(revoked_reason)) between 1 and 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (revoked_at is null and revoked_by_user_id is null and revoked_reason is null)
    or (revoked_at is not null and revoked_by_user_id is not null)
  )
);

create unique index if not exists community_bans_active_unique
  on public.community_bans (community_id, banned_user_id)
  where revoked_at is null;

create index if not exists idx_community_bans_community_banned_at
  on public.community_bans (community_id, banned_at desc);

create index if not exists idx_community_bans_banned_user
  on public.community_bans (banned_user_id);

drop trigger if exists trg_community_bans_updated_at on public.community_bans;
create trigger trg_community_bans_updated_at
before update on public.community_bans
for each row execute function public.set_updated_at();

create or replace function public.ban_community_member(
  p_community_id uuid,
  p_target_user_id uuid,
  p_reason text
)
returns public.community_bans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_can_manage_bans boolean := false;
  v_target_member_id uuid;
  v_target_is_owner boolean := false;
  v_reason text := trim(coalesce(p_reason, ''));
  v_existing_ban_id uuid;
  v_ban public.community_bans;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_community_id is null or p_target_user_id is null then
    raise exception 'Community and target user are required'
      using errcode = '22023';
  end if;

  if p_target_user_id = v_actor_user_id then
    raise exception 'You cannot ban yourself'
      using errcode = '22023';
  end if;

  if v_reason = '' then
    raise exception 'Ban reason is required'
      using errcode = '22023';
  end if;

  if char_length(v_reason) > 1000 then
    raise exception 'Ban reason exceeds 1000 characters'
      using errcode = '22001';
  end if;

  select
    public.is_community_owner(p_community_id),
    public.user_has_permission(p_community_id, 'manage_bans')
  into v_is_owner, v_can_manage_bans;

  if not (coalesce(v_is_owner, false) or coalesce(v_can_manage_bans, false)) then
    raise exception 'Missing permission to ban members'
      using errcode = '42501';
  end if;

  select cm.id, cm.is_owner
  into v_target_member_id, v_target_is_owner
  from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = p_target_user_id
  limit 1;

  if coalesce(v_target_is_owner, false) then
    raise exception 'Owners cannot be banned'
      using errcode = '42501';
  end if;

  if
    not coalesce(v_is_owner, false)
    and v_target_member_id is not null
    and not coalesce(public.can_manage_member_by_position(p_community_id, v_target_member_id), false)
  then
    raise exception 'Target member is above your role hierarchy'
      using errcode = '42501';
  end if;

  select cb.id
  into v_existing_ban_id
  from public.community_bans cb
  where cb.community_id = p_community_id
    and cb.banned_user_id = p_target_user_id
    and cb.revoked_at is null
  limit 1
  for update;

  if v_existing_ban_id is not null then
    raise exception 'User is already banned from this server'
      using errcode = '23505';
  end if;

  insert into public.community_bans (
    community_id,
    banned_user_id,
    banned_by_user_id,
    reason,
    banned_at
  )
  values (
    p_community_id,
    p_target_user_id,
    v_actor_user_id,
    v_reason,
    timezone('utc', now())
  )
  returning * into v_ban;

  -- Remove active membership if present.
  delete from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = p_target_user_id;

  return v_ban;
end;
$$;

revoke all on function public.ban_community_member(uuid, uuid, text) from public;
grant execute on function public.ban_community_member(uuid, uuid, text) to authenticated;

create or replace function public.unban_community_member(
  p_community_id uuid,
  p_target_user_id uuid,
  p_reason text default null
)
returns public.community_bans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_can_manage_bans boolean := false;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_active_ban public.community_bans;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_community_id is null or p_target_user_id is null then
    raise exception 'Community and target user are required'
      using errcode = '22023';
  end if;

  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'Unban reason exceeds 1000 characters'
      using errcode = '22001';
  end if;

  select
    public.is_community_owner(p_community_id),
    public.user_has_permission(p_community_id, 'manage_bans')
  into v_is_owner, v_can_manage_bans;

  if not (coalesce(v_is_owner, false) or coalesce(v_can_manage_bans, false)) then
    raise exception 'Missing permission to unban members'
      using errcode = '42501';
  end if;

  select cb.*
  into v_active_ban
  from public.community_bans cb
  where cb.community_id = p_community_id
    and cb.banned_user_id = p_target_user_id
    and cb.revoked_at is null
  limit 1
  for update;

  if not found then
    raise exception 'No active ban found for this user'
      using errcode = '22023';
  end if;

  update public.community_bans cb
  set
    revoked_at = timezone('utc', now()),
    revoked_by_user_id = v_actor_user_id,
    revoked_reason = v_reason
  where cb.id = v_active_ban.id
  returning * into v_active_ban;

  return v_active_ban;
end;
$$;

revoke all on function public.unban_community_member(uuid, uuid, text) from public;
grant execute on function public.unban_community_member(uuid, uuid, text) to authenticated;

create or replace function public.list_bannable_shared_communities(
  p_target_user_id uuid
)
returns table (
  community_id uuid,
  community_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id as community_id, c.name as community_name
  from public.communities c
  join public.community_members me
    on me.community_id = c.id
   and me.user_id = auth.uid()
  join public.community_members target
    on target.community_id = c.id
   and target.user_id = p_target_user_id
  where p_target_user_id is not null
    and target.user_id <> auth.uid()
    and coalesce(target.is_owner, false) = false
    and (
      public.is_community_owner(c.id)
      or (
        public.user_has_permission(c.id, 'manage_bans')
        and public.can_manage_member_by_position(c.id, target.id)
      )
    )
  order by c.name asc;
$$;

revoke all on function public.list_bannable_shared_communities(uuid) from public;
grant execute on function public.list_bannable_shared_communities(uuid) to authenticated;

create or replace function public.prevent_banned_user_rejoin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.community_bans cb
    where cb.community_id = new.community_id
      and cb.banned_user_id = new.user_id
      and cb.revoked_at is null
  ) then
    raise exception 'User is banned from this server'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_banned_user_rejoin on public.community_members;
create trigger trg_prevent_banned_user_rejoin
before insert on public.community_members
for each row execute function public.prevent_banned_user_rejoin();

alter table public.community_bans enable row level security;

drop policy if exists community_bans_select_member on public.community_bans;
create policy community_bans_select_member
on public.community_bans
for select
to authenticated
using (public.is_community_member(community_id));

drop policy if exists community_bans_insert_manager on public.community_bans;
create policy community_bans_insert_manager
on public.community_bans
for insert
to authenticated
with check (
  banned_by_user_id = auth.uid()
  and (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_bans')
  )
  and not exists (
    select 1
    from public.community_members owner_member
    where owner_member.community_id = community_bans.community_id
      and owner_member.user_id = community_bans.banned_user_id
      and owner_member.is_owner = true
  )
  and (
    public.is_community_owner(community_id)
    or not exists (
      select 1
      from public.community_members target_member
      where target_member.community_id = community_bans.community_id
        and target_member.user_id = community_bans.banned_user_id
    )
    or exists (
      select 1
      from public.community_members target_member
      where target_member.community_id = community_bans.community_id
        and target_member.user_id = community_bans.banned_user_id
        and public.can_manage_member_by_position(community_bans.community_id, target_member.id)
    )
  )
);

drop policy if exists community_bans_update_manager on public.community_bans;
create policy community_bans_update_manager
on public.community_bans
for update
to authenticated
using (
  revoked_at is null
  and (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_bans')
  )
)
with check (
  (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_bans')
  )
  and revoked_at is not null
  and revoked_by_user_id = auth.uid()
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'community_bans'
    ) then
      alter publication supabase_realtime add table public.community_bans;
    end if;
  end if;
end $$;
