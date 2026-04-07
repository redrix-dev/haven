drop function if exists public.list_community_bans(uuid);

create function public.list_community_bans(p_community_id uuid)
returns table (
  id uuid,
  community_id uuid,
  banned_user_id uuid,
  banned_by_user_id uuid,
  reason text,
  banned_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  revoked_reason text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cb.id,
    cb.community_id,
    cb.banned_user_id,
    cb.banned_by_user_id,
    cb.reason,
    cb.banned_at,
    cb.revoked_at,
    cb.revoked_by_user_id,
    cb.revoked_reason,
    profile.username,
    profile.avatar_url
  from public.community_bans cb
  left join public.profiles profile
    on profile.id = cb.banned_user_id
  where cb.community_id = p_community_id
    and cb.revoked_at is null
    and auth.uid() is not null
    and public.is_community_member(p_community_id)
  order by cb.banned_at desc, cb.id desc;
$$;

revoke all on function public.list_community_bans(uuid) from public;
grant execute on function public.list_community_bans(uuid) to authenticated;
