-- Temporary community-based flair assignment rules.

create table if not exists public.community_flair_grant_rules (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  flair_id uuid not null references public.flairs(id) on delete restrict,
  grant_source text not null default 'community_join',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint community_flair_grant_rules_source_length_check check (
    char_length(trim(grant_source)) between 1 and 64
  )
);

create unique index if not exists uq_community_flair_grant_rules_active
  on public.community_flair_grant_rules(community_id, flair_id)
  where is_active = true;

create index if not exists idx_community_flair_grant_rules_community_active
  on public.community_flair_grant_rules(community_id)
  where is_active = true;

drop trigger if exists trg_community_flair_grant_rules_updated_at
  on public.community_flair_grant_rules;
create trigger trg_community_flair_grant_rules_updated_at
before update on public.community_flair_grant_rules
for each row execute function public.set_updated_at();

alter table public.community_flair_grant_rules enable row level security;

drop policy if exists community_flair_grant_rules_select_staff
  on public.community_flair_grant_rules;
create policy community_flair_grant_rules_select_staff
on public.community_flair_grant_rules
for select
to authenticated
using (public.is_platform_staff(auth.uid()));

revoke insert, update, delete on public.community_flair_grant_rules from anon;
revoke insert, update, delete on public.community_flair_grant_rules from authenticated;
grant select on public.community_flair_grant_rules to authenticated;

create or replace function public.ensure_user_flair_grant(
  p_user_id uuid,
  p_flair_id uuid,
  p_grant_source text,
  p_source_community_id uuid default null,
  p_granted_by_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_grant_source text := nullif(trim(p_grant_source), '');
  v_user_flair_id uuid;
begin
  if v_grant_source is null then
    raise exception 'Grant source is required.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'Target user profile does not exist.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.flairs f
    where f.id = p_flair_id
      and f.is_active = true
      and f.is_retired = false
  ) then
    raise exception 'Flair does not exist or is inactive.'
      using errcode = '22023';
  end if;

  select uf.id
  into v_existing_id
  from public.user_flairs uf
  where uf.user_id = p_user_id
    and uf.flair_id = p_flair_id
    and uf.revoked_at is null
  order by uf.created_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.user_flairs (
    user_id,
    flair_id,
    grant_source,
    source_community_id,
    granted_by_user_id
  )
  values (
    p_user_id,
    p_flair_id,
    v_grant_source,
    p_source_community_id,
    p_granted_by_user_id
  )
  returning id into v_user_flair_id;

  return v_user_flair_id;
end;
$$;

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
  v_flair_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
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
  v_flair_id uuid;
  v_grant_source text := nullif(trim(p_grant_source), '');
  v_rule_id uuid;
  v_member record;
begin
  if coalesce(auth.role(), '') <> 'service_role'
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
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_platform_staff(v_actor_id) then
    raise exception 'Only platform staff can manage community flair rules.'
      using errcode = '42501';
  end if;

  update public.community_flair_grant_rules
  set is_active = false
  where id = p_rule_id;
end;
$$;

create or replace function public.grant_community_flairs_for_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
begin
  for v_rule in
    select r.flair_id, r.grant_source
    from public.community_flair_grant_rules r
    join public.flairs f on f.id = r.flair_id
    where r.community_id = new.community_id
      and r.is_active = true
      and f.is_active = true
      and f.is_retired = false
  loop
    perform public.ensure_user_flair_grant(
      new.user_id,
      v_rule.flair_id,
      v_rule.grant_source,
      new.community_id,
      null
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_grant_community_flairs_for_member
  on public.community_members;
create trigger trg_grant_community_flairs_for_member
after insert on public.community_members
for each row execute function public.grant_community_flairs_for_member();

revoke all on function public.ensure_user_flair_grant(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.create_community_flair_grant_rule(uuid, text, text) from public;
revoke all on function public.disable_community_flair_grant_rule(uuid) from public;
revoke all on function public.grant_community_flairs_for_member() from public;

grant execute on function public.create_community_flair_grant_rule(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.disable_community_flair_grant_rule(uuid)
  to authenticated, service_role;
