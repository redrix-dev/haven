-- Strict hierarchy enforcement by role position.
-- Non-owners can only manage roles/members strictly below their highest role position.

create or replace function public.current_user_highest_role_position(p_community_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select max(r.position)
  from public.community_members cm
  join public.member_roles mr
    on mr.community_id = cm.community_id
   and mr.member_id = cm.id
  join public.roles r
    on r.community_id = mr.community_id
   and r.id = mr.role_id
  where cm.community_id = p_community_id
    and cm.user_id = auth.uid();
$$;

create or replace function public.member_highest_role_position(p_community_id uuid, p_member_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select max(r.position)
  from public.member_roles mr
  join public.roles r
    on r.community_id = mr.community_id
   and r.id = mr.role_id
  where mr.community_id = p_community_id
    and mr.member_id = p_member_id;
$$;

create or replace function public.can_set_role_position(p_community_id uuid, p_position integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_community_owner(p_community_id)
    or p_position < coalesce(public.current_user_highest_role_position(p_community_id), -2147483648);
$$;

create or replace function public.can_manage_role_by_position(p_community_id uuid, p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_community_owner(p_community_id)
    or exists (
      select 1
      from public.roles r
      where r.community_id = p_community_id
        and r.id = p_role_id
        and r.position < coalesce(public.current_user_highest_role_position(p_community_id), -2147483648)
    );
$$;

create or replace function public.can_manage_member_by_position(p_community_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_community_owner(p_community_id)
    or coalesce(public.member_highest_role_position(p_community_id, p_member_id), -2147483648)
      < coalesce(public.current_user_highest_role_position(p_community_id), -2147483648);
$$;

-- Roles: non-owners can only create roles below their own highest role.
drop policy if exists roles_insert_manager on public.roles;
create policy roles_insert_manager
on public.roles
for insert
to authenticated
with check (
  (
    public.is_community_owner(community_id)
    or (
      public.user_has_permission(community_id, 'manage_roles')
      and public.can_set_role_position(community_id, position)
      and coalesce(is_system, false) = false
      and coalesce(is_default, false) = false
    )
  )
);

-- Roles: non-owners can only edit roles below their own highest role.
drop policy if exists roles_update_manager on public.roles;
create policy roles_update_manager
on public.roles
for update
to authenticated
using (
  (
    public.is_community_owner(community_id)
    or (
      public.user_has_permission(community_id, 'manage_roles')
      and public.can_manage_role_by_position(community_id, id)
      and coalesce(is_system, false) = false
      and coalesce(is_default, false) = false
    )
  )
)
with check (
  (
    public.is_community_owner(community_id)
    or (
      public.user_has_permission(community_id, 'manage_roles')
      and public.can_set_role_position(community_id, position)
      and coalesce(is_system, false) = false
      and coalesce(is_default, false) = false
    )
  )
);

-- Roles: default role is never deletable; non-owners can only delete lower non-system roles.
drop policy if exists roles_delete_manager on public.roles;
create policy roles_delete_manager
on public.roles
for delete
to authenticated
using (
  coalesce(is_default, false) = false
  and (
    public.is_community_owner(community_id)
    or (
      public.user_has_permission(community_id, 'manage_roles')
      and public.can_manage_role_by_position(community_id, id)
      and coalesce(is_system, false) = false
    )
  )
);

-- Role permissions: non-owners can only mutate permissions for lower non-system roles.
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
        or (
          public.user_has_permission(r.community_id, 'manage_roles')
          and public.can_manage_role_by_position(r.community_id, r.id)
          and coalesce(r.is_system, false) = false
        )
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
        or (
          public.user_has_permission(r.community_id, 'manage_roles')
          and public.can_manage_role_by_position(r.community_id, r.id)
          and coalesce(r.is_system, false) = false
        )
      )
  )
);

-- Member roles: non-owners can only assign lower non-system roles to lower non-owner members.
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
          and public.can_manage_role_by_position(member_roles.community_id, r.id)
          and public.can_manage_member_by_position(member_roles.community_id, target_member.id)
          and coalesce(r.is_system, false) = false
          and coalesce(target_member.is_owner, false) = false
        )
      )
  )
);

-- Member roles: non-owners can only remove lower non-default/non-system roles from lower non-owner members.
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
          and public.can_manage_role_by_position(member_roles.community_id, r.id)
          and public.can_manage_member_by_position(member_roles.community_id, target_member.id)
          and coalesce(r.is_system, false) = false
          and coalesce(target_member.is_owner, false) = false
        )
      )
  )
);

-- Channel role overwrites: non-owners can only edit lower roles.
drop policy if exists channel_role_overwrites_mutate_manager on public.channel_role_overwrites;
create policy channel_role_overwrites_mutate_manager
on public.channel_role_overwrites
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or (
    (
      public.user_has_permission(community_id, 'manage_channel_permissions')
      or public.user_has_permission(community_id, 'manage_channels')
    )
    and public.can_manage_role_by_position(community_id, role_id)
  )
)
with check (
  public.is_community_owner(community_id)
  or (
    (
      public.user_has_permission(community_id, 'manage_channel_permissions')
      or public.user_has_permission(community_id, 'manage_channels')
    )
    and public.can_manage_role_by_position(community_id, role_id)
  )
);

-- Channel member overwrites: non-owners can only edit lower members.
drop policy if exists channel_member_overwrites_mutate_manager on public.channel_member_overwrites;
create policy channel_member_overwrites_mutate_manager
on public.channel_member_overwrites
for all
to authenticated
using (
  public.is_community_owner(community_id)
  or (
    (
      public.user_has_permission(community_id, 'manage_channel_permissions')
      or public.user_has_permission(community_id, 'manage_channels')
    )
    and public.can_manage_member_by_position(community_id, member_id)
  )
)
with check (
  public.is_community_owner(community_id)
  or (
    (
      public.user_has_permission(community_id, 'manage_channel_permissions')
      or public.user_has_permission(community_id, 'manage_channels')
    )
    and public.can_manage_member_by_position(community_id, member_id)
  )
);
