-- Add dedicated ban management permission.

insert into public.permissions_catalog (key, description)
values ('manage_bans', 'Ban and unban members')
on conflict (key) do nothing;

-- Backfill owner-role grants across existing communities.
with ranked_system_roles as (
  select
    r.id,
    r.community_id,
    row_number() over (
      partition by r.community_id
      order by r.position desc, r.created_at asc
    ) as role_rank
  from public.roles r
  where coalesce(r.is_system, false) = true
)
insert into public.role_permissions (role_id, permission_key)
select rsr.id, 'manage_bans'
from ranked_system_roles rsr
where rsr.role_rank = 1
on conflict (role_id, permission_key) do nothing;
