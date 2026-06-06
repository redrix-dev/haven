-- Restore a batch "live author identity" lookup for community messages.
--
-- The messages subsystem rebuild (20260514) moved to avatar snapshots captured
-- at send time and dropped get_message_author_profiles. Snapshots go stale (and
-- are null for authors who had no avatar when they posted), producing blank
-- avatars. This RPC lets the client prime ProfileNexus with the *current*
-- platform identity for a set of authors so rendered avatars self-heal —
-- snapshots stay as the offline fallback.

drop function if exists public.get_message_author_profiles(uuid[], uuid);

create function public.get_message_author_profiles(
  p_author_user_ids uuid[],
  p_community_id uuid
)
returns table (
  id uuid,
  username text,
  avatar_url text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  with requested_authors as (
    select distinct requested.user_id
    from unnest(coalesce(p_author_user_ids, '{}'::uuid[])) as requested(user_id)
    where requested.user_id is not null
  )
  select
    identity.user_id as id,
    identity.username,
    identity.avatar_url,
    identity.updated_at
  from requested_authors
  join public.profile_identities identity
    on identity.user_id = requested_authors.user_id
  where auth.uid() is not null
  order by identity.user_id;
$$;

revoke all on function public.get_message_author_profiles(uuid[], uuid) from public;
grant execute on function public.get_message_author_profiles(uuid[], uuid) to authenticated;
