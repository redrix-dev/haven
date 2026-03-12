-- Backfill manage_channel_permissions for any role that already has manage_channels.
insert into public.role_permissions (role_id, permission_key)
select rp.role_id, 'manage_channel_permissions'
from public.role_permissions rp
where rp.permission_key = 'manage_channels'
on conflict (role_id, permission_key) do nothing;

-- Channel role overwrites: require explicit manage_channel_permissions + hierarchy.
drop policy if exists channel_role_overwrites_mutate_manager on public.channel_role_overwrites;
create policy channel_role_overwrites_mutate_manager
on public.channel_role_overwrites
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or (
    public.user_has_permission(community_id, 'manage_channel_permissions')
    and public.can_manage_role_by_position(community_id, role_id)
  )
)
with check (
  public.is_community_owner(community_id)
  or (
    public.user_has_permission(community_id, 'manage_channel_permissions')
    and public.can_manage_role_by_position(community_id, role_id)
  )
);

-- Channel member overwrites: require explicit manage_channel_permissions + hierarchy.
drop policy if exists channel_member_overwrites_mutate_manager on public.channel_member_overwrites;
create policy channel_member_overwrites_mutate_manager
on public.channel_member_overwrites
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or (
    public.user_has_permission(community_id, 'manage_channel_permissions')
    and public.can_manage_member_by_position(community_id, member_id)
  )
)
with check (
  public.is_community_owner(community_id)
  or (
    public.user_has_permission(community_id, 'manage_channel_permissions')
    and public.can_manage_member_by_position(community_id, member_id)
  )
);
