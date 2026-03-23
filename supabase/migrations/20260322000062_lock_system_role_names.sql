create or replace function public.prevent_system_role_name_changes()
returns trigger
language plpgsql
as $$
begin
  if old.is_system and new.name is distinct from old.name then
    raise exception 'System role names cannot be modified';
  end if;

  return new;
end;
$$;

drop trigger if exists lock_system_role_names_before_update on public.roles;

create trigger lock_system_role_names_before_update
before update on public.roles
for each row
when (old.is_system and new.name is distinct from old.name)
execute function public.prevent_system_role_name_changes();

-- CHECKPOINT 2 COMPLETE
