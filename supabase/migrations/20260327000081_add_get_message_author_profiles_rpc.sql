drop function if exists public.get_message_author_profiles(uuid[], uuid);

create function public.get_message_author_profiles(
  p_author_user_ids uuid[],
  p_community_id uuid
)
returns table (
  id uuid,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_authors as (
    select distinct requested.user_id
    from unnest(coalesce(p_author_user_ids, '{}'::uuid[])) as requested(user_id)
    where requested.user_id is not null
  )
  select
    requested_authors.user_id as id,
    case
      when exists (
        select 1
        from public.community_bans active_ban
        where active_ban.community_id = p_community_id
          and active_ban.banned_user_id = requested_authors.user_id
          and active_ban.revoked_at is null
      ) then 'Banned User'
      when profile.id is null then 'Unknown User'
      else profile.username
    end as username,
    case
      when exists (
        select 1
        from public.community_bans active_ban
        where active_ban.community_id = p_community_id
          and active_ban.banned_user_id = requested_authors.user_id
          and active_ban.revoked_at is null
      ) then null
      else profile.avatar_url
    end as avatar_url
  from requested_authors
  left join public.profiles profile
    on profile.id = requested_authors.user_id
  order by requested_authors.user_id;
$$;

revoke all on function public.get_message_author_profiles(uuid[], uuid) from public;
grant execute on function public.get_message_author_profiles(uuid[], uuid) to authenticated;
