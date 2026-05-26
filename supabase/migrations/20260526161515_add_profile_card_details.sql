alter table public.profiles
  add column if not exists profile_visibility text not null default 'private';

alter table public.profiles
  add column if not exists profile_bio text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_profile_visibility_check'
  ) then
    alter table public.profiles
      add constraint profiles_profile_visibility_check
      check (profile_visibility in ('public', 'friends_only', 'private'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_profile_bio_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_profile_bio_length_check
      check (profile_bio is null or char_length(profile_bio) <= 500);
  end if;
end;
$$;

create or replace function public.get_profile_card(p_user_id uuid)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  profile_visibility text,
  can_view_details boolean,
  profile_bio text
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
      p.profile_bio
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
  )
  select
    resolved.user_id,
    resolved.username,
    resolved.avatar_url,
    resolved.profile_visibility,
    resolved.can_view_details,
    case
      when resolved.can_view_details then resolved.profile_bio
      else null
    end as profile_bio
  from resolved;
$$;

revoke all on function public.get_profile_card(uuid) from public;
grant execute on function public.get_profile_card(uuid) to authenticated, service_role;
