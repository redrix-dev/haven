-- Remove member_roles and role_permissions from Realtime publication.
-- Permission updates are delivered via private user channel broadcasts instead.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'member_roles'
    ) then
      alter publication supabase_realtime drop table public.member_roles;
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'role_permissions'
    ) then
      alter publication supabase_realtime drop table public.role_permissions;
    end if;
  end if;
end $$;
