-- Allow Supabase SQL Editor/database admin roles to run manual flair ops.
-- Authenticated app callers still need platform staff status.

create or replace function public.grant_user_flair(
  p_user_id uuid,
  p_flair_key text,
  p_grant_source text,
  p_source_community_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_effective_role text := coalesce(nullif(current_setting('role', true), 'none'), current_user);
  v_flair_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and v_effective_role not in ('postgres', 'supabase_admin')
     and not public.is_platform_staff(v_actor_id) then
    raise exception 'Only platform staff can grant flair.'
      using errcode = '42501';
  end if;

  select f.id
  into v_flair_id
  from public.flairs f
  where f.key = p_flair_key
    and f.is_active = true
    and f.is_retired = false;

  if v_flair_id is null then
    raise exception 'Flair does not exist or is inactive.'
      using errcode = '22023';
  end if;

  return public.ensure_user_flair_grant(
    p_user_id,
    v_flair_id,
    p_grant_source,
    p_source_community_id,
    v_actor_id
  );
end;
$$;

create or replace function public.revoke_user_flair(p_user_flair_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_effective_role text := coalesce(nullif(current_setting('role', true), 'none'), current_user);
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and v_effective_role not in ('postgres', 'supabase_admin')
     and not public.is_platform_staff(v_actor_id) then
    raise exception 'Only platform staff can revoke flair.'
      using errcode = '42501';
  end if;

  update public.user_flairs
  set revoked_at = coalesce(revoked_at, timezone('utc', now()))
  where id = p_user_flair_id;

  update public.profiles
  set active_user_flair_id = null
  where active_user_flair_id = p_user_flair_id;
end;
$$;

create or replace function public.create_community_flair_grant_rule(
  p_community_id uuid,
  p_flair_key text,
  p_grant_source text default 'community_join'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_effective_role text := coalesce(nullif(current_setting('role', true), 'none'), current_user);
  v_flair_id uuid;
  v_grant_source text := nullif(trim(p_grant_source), '');
  v_rule_id uuid;
  v_member record;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and v_effective_role not in ('postgres', 'supabase_admin')
     and not public.is_platform_staff(v_actor_id) then
    raise exception 'Only platform staff can manage community flair rules.'
      using errcode = '42501';
  end if;

  if v_grant_source is null then
    raise exception 'Grant source is required.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.communities c where c.id = p_community_id) then
    raise exception 'Community does not exist.'
      using errcode = '22023';
  end if;

  select f.id
  into v_flair_id
  from public.flairs f
  where f.key = p_flair_key
    and f.is_active = true
    and f.is_retired = false;

  if v_flair_id is null then
    raise exception 'Flair does not exist or is inactive.'
      using errcode = '22023';
  end if;

  select r.id
  into v_rule_id
  from public.community_flair_grant_rules r
  where r.community_id = p_community_id
    and r.flair_id = v_flair_id
  order by r.is_active desc, r.created_at desc
  limit 1;

  if v_rule_id is null then
    insert into public.community_flair_grant_rules (
      community_id,
      flair_id,
      grant_source,
      is_active
    )
    values (
      p_community_id,
      v_flair_id,
      v_grant_source,
      true
    )
    returning id into v_rule_id;
  else
    update public.community_flair_grant_rules
    set
      grant_source = v_grant_source,
      is_active = true
    where id = v_rule_id;
  end if;

  for v_member in
    select cm.user_id
    from public.community_members cm
    where cm.community_id = p_community_id
  loop
    perform public.ensure_user_flair_grant(
      v_member.user_id,
      v_flair_id,
      v_grant_source,
      p_community_id,
      v_actor_id
    );
  end loop;

  return v_rule_id;
end;
$$;

create or replace function public.disable_community_flair_grant_rule(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_effective_role text := coalesce(nullif(current_setting('role', true), 'none'), current_user);
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and v_effective_role not in ('postgres', 'supabase_admin')
     and not public.is_platform_staff(v_actor_id) then
    raise exception 'Only platform staff can manage community flair rules.'
      using errcode = '42501';
  end if;

  update public.community_flair_grant_rules
  set is_active = false
  where id = p_rule_id;
end;
$$;

revoke all on function public.grant_user_flair(uuid, text, text, uuid) from public;
revoke all on function public.revoke_user_flair(uuid) from public;
revoke all on function public.create_community_flair_grant_rule(uuid, text, text) from public;
revoke all on function public.disable_community_flair_grant_rule(uuid) from public;

grant execute on function public.grant_user_flair(uuid, text, text, uuid)
  to authenticated, service_role;
grant execute on function public.revoke_user_flair(uuid)
  to authenticated, service_role;
grant execute on function public.create_community_flair_grant_rule(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.disable_community_flair_grant_rule(uuid)
  to authenticated, service_role;
