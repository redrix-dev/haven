-- Broadcast ROLE_CHANGE to private Realtime topics when role assignments or role permissions change.

drop trigger if exists notify_role_assignment_change_trigger on public.member_roles;
drop trigger if exists notify_role_permission_change_trigger on public.role_permissions;

drop function if exists public.notify_role_assignment_change();
drop function if exists public.notify_role_permission_change();

create function public.notify_role_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_community_id uuid;
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_member_id := old.member_id;
    v_community_id := old.community_id;
  else
    v_member_id := new.member_id;
    v_community_id := new.community_id;
  end if;

  select cm.user_id into v_user_id
  from public.community_members cm
  where cm.id = v_member_id
    and cm.community_id = v_community_id;

  if v_user_id is not null then
    begin
      perform realtime.send(
        jsonb_build_object('community_id', v_community_id::text),
        'ROLE_CHANGE',
        'private_user:' || v_user_id::text,
        true
      );
    exception
      when others then
        null;
    end;
  end if;

  return null;
end;
$$;

create trigger notify_role_assignment_change_trigger
after insert or update or delete on public.member_roles
for each row
execute function public.notify_role_assignment_change();

create function public.notify_role_permission_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  rec record;
begin
  if tg_op = 'DELETE' then
    v_role_id := old.role_id;
  else
    v_role_id := new.role_id;
  end if;

  for rec in
    select distinct cm.user_id as uid, mr.community_id as cid
    from public.member_roles mr
    inner join public.community_members cm
      on cm.id = mr.member_id
      and cm.community_id = mr.community_id
    where mr.role_id = v_role_id
  loop
    begin
      perform realtime.send(
        jsonb_build_object('community_id', rec.cid::text),
        'ROLE_CHANGE',
        'private_user:' || rec.uid::text,
        true
      );
    exception
      when others then
        null;
    end;
  end loop;

  return null;
end;
$$;

create trigger notify_role_permission_change_trigger
after insert or update or delete on public.role_permissions
for each row
execute function public.notify_role_permission_change();
