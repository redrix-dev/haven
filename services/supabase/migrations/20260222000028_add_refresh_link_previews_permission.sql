-- Allow users to manually generate/refresh link previews from message context menu.
-- Default this to @everyone so most communities see the feature without extra setup.

insert into public.permissions_catalog (key, description)
values ('refresh_link_previews', 'Generate or refresh URL link previews for messages')
on conflict (key) do nothing;

-- Backfill @everyone roles across existing communities.
insert into public.role_permissions (role_id, permission_key)
select r.id, 'refresh_link_previews'
from public.roles r
where coalesce(r.is_default, false) = true
on conflict (role_id, permission_key) do nothing;

create or replace function public.grant_default_role_link_preview_refresh_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_default, false) = true then
    insert into public.role_permissions (role_id, permission_key)
    values (new.id, 'refresh_link_previews')
    on conflict (role_id, permission_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_roles_grant_default_link_preview_refresh_permission on public.roles;
create trigger trg_roles_grant_default_link_preview_refresh_permission
after insert on public.roles
for each row execute function public.grant_default_role_link_preview_refresh_permission();

