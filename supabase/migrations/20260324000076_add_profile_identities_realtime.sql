create table if not exists public.profile_identities (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  avatar_url text,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.can_view_profile_identity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_user_id is not null
    and (
      p_user_id = auth.uid()
      or exists (
        select 1
        from public.community_members me
        join public.community_members other
          on other.community_id = me.community_id
        where me.user_id = auth.uid()
          and other.user_id = p_user_id
      )
      or public.are_friends(auth.uid(), p_user_id)
      or exists (
        select 1
        from public.friend_requests fr
        where fr.status = 'pending'
          and (
            (fr.sender_user_id = auth.uid() and fr.recipient_user_id = p_user_id)
            or (fr.recipient_user_id = auth.uid() and fr.sender_user_id = p_user_id)
          )
      )
      or exists (
        select 1
        from public.user_blocks ub
        where ub.blocker_user_id = auth.uid()
          and ub.blocked_user_id = p_user_id
      )
    );
$$;

revoke all on function public.can_view_profile_identity(uuid) from public;
grant execute on function public.can_view_profile_identity(uuid) to authenticated, service_role;

create or replace function public.sync_profile_identity_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_identities (user_id, username, avatar_url, updated_at)
  values (
    new.id,
    new.username,
    new.avatar_url,
    coalesce(new.updated_at, timezone('utc', now()))
  )
  on conflict (user_id) do update
  set
    username = excluded.username,
    avatar_url = excluded.avatar_url,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_identity_from_profile on public.profiles;
create trigger trg_sync_profile_identity_from_profile
after insert or update on public.profiles
for each row execute function public.sync_profile_identity_from_profile();

insert into public.profile_identities (user_id, username, avatar_url, updated_at)
select
  p.id,
  p.username,
  p.avatar_url,
  p.updated_at
from public.profiles p
on conflict (user_id) do update
set
  username = excluded.username,
  avatar_url = excluded.avatar_url,
  updated_at = excluded.updated_at;

alter table public.profile_identities enable row level security;

drop policy if exists profile_identities_select_visible on public.profile_identities;
create policy profile_identities_select_visible
on public.profile_identities
for select
to authenticated
using (public.can_view_profile_identity(user_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profile_identities'
    ) then
      alter publication supabase_realtime add table public.profile_identities;
    end if;
  end if;
end;
$$;
