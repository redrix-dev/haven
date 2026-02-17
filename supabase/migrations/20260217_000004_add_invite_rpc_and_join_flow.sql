-- Invite RPCs for creating invite codes and redeeming invite links.

create or replace function public.create_community_invite(
  p_community_id uuid,
  p_max_uses integer default null,
  p_expires_in_hours integer default 168
)
returns public.invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_manage_invites boolean := false;
  v_code text;
  v_expires_at timestamptz;
  v_invite public.invites;
  v_attempts integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_max_uses is not null and p_max_uses <= 0 then
    raise exception 'max_uses must be greater than 0'
      using errcode = '22023';
  end if;

  if p_expires_in_hours is not null and p_expires_in_hours <= 0 then
    raise exception 'expires_in_hours must be greater than 0'
      using errcode = '22023';
  end if;

  select
    public.is_community_owner(p_community_id)
    or public.user_has_permission(p_community_id, 'manage_invites')
  into v_can_manage_invites;

  if not coalesce(v_can_manage_invites, false) then
    raise exception 'Missing permission to create invite links'
      using errcode = '42501';
  end if;

  if p_expires_in_hours is null then
    v_expires_at := null;
  else
    v_expires_at := timezone('utc', now()) + make_interval(hours => p_expires_in_hours);
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    exit when not exists (
      select 1
      from public.invites i
      where i.code = v_code
    );

    if v_attempts > 10 then
      raise exception 'Failed to generate a unique invite code'
        using errcode = '55000';
    end if;
  end loop;

  insert into public.invites (
    community_id,
    code,
    created_by_user_id,
    max_uses,
    expires_at,
    is_active
  )
  values (
    p_community_id,
    v_code,
    v_user_id,
    p_max_uses,
    v_expires_at,
    true
  )
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke all on function public.create_community_invite(uuid, integer, integer) from public;
grant execute on function public.create_community_invite(uuid, integer, integer) to authenticated;

create or replace function public.redeem_community_invite(
  p_code text
)
returns table (
  community_id uuid,
  community_name text,
  joined boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_invite public.invites;
  v_allow_public_invites boolean := false;
  v_already_member boolean := false;
  v_joined boolean := false;
  v_inserted_rows integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if v_code = '' then
    raise exception 'Invite code is required'
      using errcode = '22023';
  end if;

  select i.*
  into v_invite
  from public.invites i
  where upper(i.code) = v_code
    and i.is_active = true
  for update;

  if not found then
    raise exception 'Invite code is invalid or inactive'
      using errcode = '22023';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= timezone('utc', now()) then
    update public.invites
    set is_active = false
    where id = v_invite.id;

    raise exception 'Invite link has expired'
      using errcode = '22023';
  end if;

  if v_invite.max_uses is not null and v_invite.current_uses >= v_invite.max_uses then
    update public.invites
    set is_active = false
    where id = v_invite.id;

    raise exception 'Invite link has reached max uses'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.community_members cm
    where cm.community_id = v_invite.community_id
      and cm.user_id = v_user_id
  )
  into v_already_member;

  if v_already_member then
    return query
    select c.id, c.name, false
    from public.communities c
    where c.id = v_invite.community_id;
    return;
  end if;

  select coalesce(cs.allow_public_invites, false)
  into v_allow_public_invites
  from public.community_settings cs
  where cs.community_id = v_invite.community_id;

  if not v_allow_public_invites then
    raise exception 'This server is not accepting invite joins right now'
      using errcode = '42501';
  end if;

  insert into public.community_members (
    community_id,
    user_id,
    is_owner
  )
  values (
    v_invite.community_id,
    v_user_id,
    false
  )
  on conflict (community_id, user_id) do nothing;

  get diagnostics v_inserted_rows = row_count;
  v_joined := v_inserted_rows > 0;

  if v_joined then
    update public.invites
    set
      current_uses = current_uses + 1,
      is_active = case
        when max_uses is not null and (current_uses + 1) >= max_uses then false
        else is_active
      end
    where id = v_invite.id;
  end if;

  return query
  select c.id, c.name, v_joined
  from public.communities c
  where c.id = v_invite.community_id;
end;
$$;

revoke all on function public.redeem_community_invite(text) from public;
grant execute on function public.redeem_community_invite(text) to authenticated;
