-- Fix channel creation RLS false-negatives by deriving creator from auth context.
-- This keeps DB as the enforcement source and avoids client/user-id mismatches.

alter table public.channels
  alter column created_by_user_id set default auth.uid();

drop policy if exists channels_insert_manager on public.channels;
create policy channels_insert_manager
on public.channels
for insert
to authenticated
with check (
  (
    created_by_user_id is null
    or created_by_user_id = auth.uid()
  )
  and (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'create_channels')
    or public.user_has_permission(community_id, 'manage_channels')
  )
);
