-- Expose member_roles and role_permissions to Supabase Realtime so clients can
-- refresh server permission snapshots when assignments or role definitions change.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'member_roles'
    ) then
      alter publication supabase_realtime add table public.member_roles;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'role_permissions'
    ) then
      alter publication supabase_realtime add table public.role_permissions;
    end if;
  end if;
end $$;
