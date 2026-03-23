-- Align invite expiry defaults with app UX: 1 hour by default.
-- Explicit null still means "never expires".

create or replace function public.create_community_invite(
  p_community_id uuid,
  p_max_uses integer default null,
  p_expires_in_hours integer default 1
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
