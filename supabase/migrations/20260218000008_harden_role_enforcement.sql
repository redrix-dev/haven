-- Harden role and member-role enforcement so app/UI remains a thin client.

-- Roles: non-owners cannot create system/default roles.
drop policy if exists roles_insert_manager on public.roles;
create policy roles_insert_manager
on public.roles
for insert
to authenticated
with check (
  (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_roles')
  )
  and (
    public.is_community_owner(community_id)
    or (
      coalesce(is_system, false) = false
      and coalesce(is_default, false) = false
    )
  )
);

-- Roles: non-owners cannot update system/default roles.
drop policy if exists roles_update_manager on public.roles;
create policy roles_update_manager
on public.roles
for update
to authenticated
using (
  (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_roles')
  )
  and (
    public.is_community_owner(community_id)
    or (
      coalesce(is_system, false) = false
      and coalesce(is_default, false) = false
    )
  )
)
with check (
  (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_roles')
  )
  and (
    public.is_community_owner(community_id)
    or (
      coalesce(is_system, false) = false
      and coalesce(is_default, false) = false
    )
  )
);

-- Roles: never delete default role; non-owners cannot delete system roles.
drop policy if exists roles_delete_manager on public.roles;
create policy roles_delete_manager
on public.roles
for delete
to authenticated
using (
  (
    public.is_community_owner(community_id)
    or public.user_has_permission(community_id, 'manage_roles')
  )
  and coalesce(is_default, false) = false
  and (
    public.is_community_owner(community_id)
    or coalesce(is_system, false) = false
  )
);

-- Role permissions: non-owners cannot mutate system-role permissions.
drop policy if exists role_permissions_mutate_manager on public.role_permissions;
create policy role_permissions_mutate_manager
on public.role_permissions
for all
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (
        public.is_community_owner(r.community_id)
        or public.user_has_permission(r.community_id, 'manage_roles')
      )
      and (
        public.is_community_owner(r.community_id)
        or coalesce(r.is_system, false) = false
      )
  )
)
with check (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (
        public.is_community_owner(r.community_id)
        or public.user_has_permission(r.community_id, 'manage_roles')
      )
      and (
        public.is_community_owner(r.community_id)
        or coalesce(r.is_system, false) = false
      )
  )
);

-- Member roles: non-owners cannot assign system roles or change owner assignments.
drop policy if exists member_roles_insert_manager on public.member_roles;
create policy member_roles_insert_manager
on public.member_roles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.roles r
    join public.community_members target_member
      on target_member.id = member_roles.member_id
     and target_member.community_id = member_roles.community_id
    where r.id = member_roles.role_id
      and r.community_id = member_roles.community_id
      and (
        public.is_community_owner(member_roles.community_id)
        or (
          public.user_has_permission(member_roles.community_id, 'manage_roles')
          and coalesce(r.is_system, false) = false
          and coalesce(target_member.is_owner, false) = false
        )
      )
  )
);

-- Member roles: non-owners cannot remove system/default roles or change owner assignments.
drop policy if exists member_roles_delete_manager on public.member_roles;
create policy member_roles_delete_manager
on public.member_roles
for delete
to authenticated
using (
  exists (
    select 1
    from public.roles r
    left join public.community_members target_member
      on target_member.id = member_roles.member_id
     and target_member.community_id = member_roles.community_id
    where r.id = member_roles.role_id
      and r.community_id = member_roles.community_id
      and coalesce(r.is_default, false) = false
      and (
        public.is_community_owner(member_roles.community_id)
        or (
          public.user_has_permission(member_roles.community_id, 'manage_roles')
          and coalesce(r.is_system, false) = false
          and coalesce(target_member.is_owner, false) = false
        )
      )
  )
);

-- Additional guard: block default-role unassignment for active members.
create or replace function public.prevent_default_role_member_unassign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_default boolean;
begin
  -- Allow cascades when member has already been removed.
  if not exists (
    select 1
    from public.community_members cm
    where cm.community_id = old.community_id
      and cm.id = old.member_id
  ) then
    return old;
  end if;

  select coalesce(r.is_default, false)
  into v_is_default
  from public.roles r
  where r.community_id = old.community_id
    and r.id = old.role_id;

  if v_is_default then
    raise exception 'Cannot remove default role from an active community member';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_default_role_member_unassign on public.member_roles;
create trigger trg_prevent_default_role_member_unassign
before delete on public.member_roles
for each row execute function public.prevent_default_role_member_unassign();
