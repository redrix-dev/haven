-- Reject invite redemption for actively banned users.

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
#variable_conflict use_column
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

  if exists (
    select 1
    from public.community_bans cb
    where cb.community_id = v_invite.community_id
      and cb.banned_user_id = v_user_id
      and cb.revoked_at is null
  ) then
    raise exception 'You are banned from this server'
      using errcode = '42501';
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
  on conflict on constraint community_members_community_id_user_id_key do nothing;

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
