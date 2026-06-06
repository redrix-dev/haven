-- Profile flair grants let users choose one owned badge for profile details.

create table if not exists public.flairs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  color_token text not null default 'primary',
  background_token text not null default 'surface-card',
  icon_key text,
  scope text not null default 'platform',
  community_id uuid references public.communities(id) on delete cascade,
  is_active boolean not null default true,
  is_retired boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint flairs_key_format_check check (
    key = lower(key)
    and key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'
  ),
  constraint flairs_label_length_check check (char_length(trim(label)) between 1 and 32),
  constraint flairs_description_length_check check (
    description is null or char_length(description) <= 240
  ),
  constraint flairs_color_token_length_check check (
    char_length(trim(color_token)) between 1 and 64
  ),
  constraint flairs_background_token_length_check check (
    char_length(trim(background_token)) between 1 and 64
  ),
  constraint flairs_icon_key_length_check check (
    icon_key is null or char_length(trim(icon_key)) between 1 and 64
  ),
  constraint flairs_scope_check check (scope in ('platform', 'community')),
  constraint flairs_scope_community_check check (
    (scope = 'platform' and community_id is null)
    or (scope = 'community' and community_id is not null)
  )
);

create table if not exists public.user_flairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  flair_id uuid not null references public.flairs(id) on delete restrict,
  grant_source text not null,
  source_community_id uuid references public.communities(id) on delete set null,
  granted_by_user_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_flairs_grant_source_length_check check (
    char_length(trim(grant_source)) between 1 and 64
  )
);

create index if not exists idx_flairs_scope_community
  on public.flairs(scope, community_id)
  where is_active = true and is_retired = false;

create index if not exists idx_user_flairs_user_active
  on public.user_flairs(user_id, flair_id)
  where revoked_at is null;

create unique index if not exists uq_user_flairs_unrevoked_user_flair
  on public.user_flairs(user_id, flair_id)
  where revoked_at is null;

alter table public.profiles
  add column if not exists active_user_flair_id uuid references public.user_flairs(id) on delete set null;

drop trigger if exists trg_flairs_updated_at on public.flairs;
create trigger trg_flairs_updated_at
before update on public.flairs
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_flairs_updated_at on public.user_flairs;
create trigger trg_user_flairs_updated_at
before update on public.user_flairs
for each row execute function public.set_updated_at();

alter table public.flairs enable row level security;
alter table public.user_flairs enable row level security;

drop policy if exists flairs_select_active_or_owned on public.flairs;
create policy flairs_select_active_or_owned
on public.flairs
for select
to authenticated
using (
  (is_active = true and is_retired = false)
  or public.is_platform_staff(auth.uid())
  or exists (
    select 1
    from public.user_flairs uf
    where uf.flair_id = flairs.id
      and uf.user_id = auth.uid()
  )
);

drop policy if exists user_flairs_select_own_or_staff on public.user_flairs;
create policy user_flairs_select_own_or_staff
on public.user_flairs
for select
to authenticated
using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));

revoke insert, update, delete on public.flairs from anon;
revoke insert, update, delete on public.flairs from authenticated;
revoke insert, update, delete on public.user_flairs from anon;
revoke insert, update, delete on public.user_flairs from authenticated;
grant select on public.flairs to authenticated;
grant select on public.user_flairs to authenticated;

create or replace function public.is_user_flair_grant_available(
  p_user_flair_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_flairs uf
    join public.flairs f on f.id = uf.flair_id
    where uf.id = p_user_flair_id
      and uf.user_id = p_user_id
      and uf.revoked_at is null
      and (uf.expires_at is null or uf.expires_at > timezone('utc', now()))
      and f.is_active = true
      and f.is_retired = false
  );
$$;

create or replace function public.validate_profile_active_user_flair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_user_flair_id is null then
    return new;
  end if;

  if not public.is_user_flair_grant_available(new.active_user_flair_id, new.id) then
    raise exception 'Active flair must be an available flair grant owned by the profile.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_validate_active_user_flair on public.profiles;
create trigger trg_profiles_validate_active_user_flair
before insert or update of active_user_flair_id on public.profiles
for each row execute function public.validate_profile_active_user_flair();

create or replace function public.list_my_user_flairs()
returns table (
  user_flair_id uuid,
  flair_id uuid,
  flair_key text,
  label text,
  description text,
  color_token text,
  background_token text,
  icon_key text,
  scope text,
  community_id uuid,
  grant_source text,
  source_community_id uuid,
  granted_at timestamptz,
  expires_at timestamptz,
  is_available boolean,
  is_selected boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    uf.id as user_flair_id,
    f.id as flair_id,
    f.key as flair_key,
    f.label,
    f.description,
    f.color_token,
    f.background_token,
    f.icon_key,
    f.scope,
    f.community_id,
    uf.grant_source,
    uf.source_community_id,
    uf.created_at as granted_at,
    uf.expires_at,
    (
      uf.revoked_at is null
      and (uf.expires_at is null or uf.expires_at > timezone('utc', now()))
      and f.is_active = true
      and f.is_retired = false
    ) as is_available,
    p.active_user_flair_id = uf.id as is_selected
  from public.user_flairs uf
  join public.flairs f on f.id = uf.flair_id
  join public.profiles p on p.id = uf.user_id
  where uf.user_id = auth.uid()
    and uf.revoked_at is null
  order by p.active_user_flair_id = uf.id desc, uf.created_at desc, f.label asc;
$$;

create or replace function public.set_active_user_flair(p_user_flair_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_user_flair_id is null then
    update public.profiles
    set active_user_flair_id = null
    where id = v_user_id;
    return;
  end if;

  if not public.is_user_flair_grant_available(p_user_flair_id, v_user_id) then
    raise exception 'Cannot activate unavailable flair grant.'
      using errcode = '42501';
  end if;

  update public.profiles
  set active_user_flair_id = p_user_flair_id
  where id = v_user_id;
end;
$$;

create or replace function public.grant_user_flair(
  p_user_id uuid,
  p_flair_key text,
  p_grant_source text,
  p_source_community_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_flair_id uuid;
  v_existing_id uuid;
  v_grant_source text := nullif(trim(p_grant_source), '');
  v_user_flair_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_platform_staff(v_actor_id) then
    raise exception 'Only platform staff can grant flair.'
      using errcode = '42501';
  end if;

  if v_grant_source is null then
    raise exception 'Grant source is required.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'Target user profile does not exist.'
      using errcode = '22023';
  end if;

  select f.id
  into v_flair_id
  from public.flairs f
  where f.key = p_flair_key
    and f.is_active = true
    and f.is_retired = false;

  if v_flair_id is null then
    raise exception 'Flair does not exist or is inactive.'
      using errcode = '22023';
  end if;

  select uf.id
  into v_existing_id
  from public.user_flairs uf
  where uf.user_id = p_user_id
    and uf.flair_id = v_flair_id
    and uf.revoked_at is null
  order by uf.created_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.user_flairs (
    user_id,
    flair_id,
    grant_source,
    source_community_id,
    granted_by_user_id
  )
  values (
    p_user_id,
    v_flair_id,
    v_grant_source,
    p_source_community_id,
    v_actor_id
  )
  returning id into v_user_flair_id;

  return v_user_flair_id;
end;
$$;

create or replace function public.revoke_user_flair(p_user_flair_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_platform_staff(v_actor_id) then
    raise exception 'Only platform staff can revoke flair.'
      using errcode = '42501';
  end if;

  update public.user_flairs
  set revoked_at = coalesce(revoked_at, timezone('utc', now()))
  where id = p_user_flair_id;

  update public.profiles
  set active_user_flair_id = null
  where active_user_flair_id = p_user_flair_id;
end;
$$;

drop function if exists public.get_profile_card(uuid);

create function public.get_profile_card(p_user_id uuid)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  profile_visibility text,
  can_view_details boolean,
  profile_bio text,
  active_flair_user_flair_id uuid,
  active_flair_id uuid,
  active_flair_key text,
  active_flair_label text,
  active_flair_description text,
  active_flair_color_token text,
  active_flair_background_token text,
  active_flair_icon_key text
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select
      p.id as user_id,
      p.username,
      p.avatar_url,
      p.profile_visibility,
      p.profile_bio,
      p.active_user_flair_id
    from public.profiles p
    where p.id = p_user_id
      and public.can_view_profile_identity(p.id)
  ),
  resolved as (
    select
      target.*,
      (
        target.user_id = auth.uid()
        or (
          not public.is_blocked_either_direction(auth.uid(), target.user_id)
          and (
            target.profile_visibility = 'public'
            or (
              target.profile_visibility = 'friends_only'
              and public.are_friends(auth.uid(), target.user_id)
            )
          )
        )
      ) as can_view_details
    from target
  ),
  active_flair as (
    select
      r.user_id,
      uf.id as user_flair_id,
      f.id as flair_id,
      f.key as flair_key,
      f.label,
      f.description,
      f.color_token,
      f.background_token,
      f.icon_key
    from resolved r
    join public.user_flairs uf
      on uf.id = r.active_user_flair_id
     and uf.user_id = r.user_id
     and uf.revoked_at is null
     and (uf.expires_at is null or uf.expires_at > timezone('utc', now()))
    join public.flairs f
      on f.id = uf.flair_id
     and f.is_active = true
     and f.is_retired = false
  )
  select
    r.user_id,
    r.username,
    r.avatar_url,
    r.profile_visibility,
    r.can_view_details,
    case when r.can_view_details then r.profile_bio else null end as profile_bio,
    case when r.can_view_details then af.user_flair_id else null end as active_flair_user_flair_id,
    case when r.can_view_details then af.flair_id else null end as active_flair_id,
    case when r.can_view_details then af.flair_key else null end as active_flair_key,
    case when r.can_view_details then af.label else null end as active_flair_label,
    case when r.can_view_details then af.description else null end as active_flair_description,
    case when r.can_view_details then af.color_token else null end as active_flair_color_token,
    case when r.can_view_details then af.background_token else null end as active_flair_background_token,
    case when r.can_view_details then af.icon_key else null end as active_flair_icon_key
  from resolved r
  left join active_flair af on af.user_id = r.user_id;
$$;

revoke all on function public.is_user_flair_grant_available(uuid, uuid) from public;
revoke all on function public.validate_profile_active_user_flair() from public;
revoke all on function public.list_my_user_flairs() from public;
revoke all on function public.set_active_user_flair(uuid) from public;
revoke all on function public.grant_user_flair(uuid, text, text, uuid) from public;
revoke all on function public.revoke_user_flair(uuid) from public;
revoke all on function public.get_profile_card(uuid) from public;

grant execute on function public.list_my_user_flairs() to authenticated;
grant execute on function public.set_active_user_flair(uuid) to authenticated;
grant execute on function public.grant_user_flair(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.revoke_user_flair(uuid) to authenticated, service_role;
grant execute on function public.get_profile_card(uuid) to authenticated, service_role;
