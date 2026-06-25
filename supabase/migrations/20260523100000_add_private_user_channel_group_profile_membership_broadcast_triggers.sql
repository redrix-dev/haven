-- Fold channel groups, profile identities, and community membership changes into
-- private_user:{uid} broadcast delivery (single domain realtime ingress).

-- ---------------------------------------------------------------------------
-- PROFILE_IDENTITY_CHANGE
-- ---------------------------------------------------------------------------

create or replace function public.list_profile_identity_subscribers(p_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct s.user_id
  from (
    select p_user_id as user_id
    union
    select me.user_id
    from public.community_members me
    join public.community_members other
      on other.community_id = me.community_id
    where other.user_id = p_user_id
    union
    select fr.sender_user_id
    from public.friend_requests fr
    where fr.recipient_user_id = p_user_id
      and fr.status = 'pending'
    union
    select fr.recipient_user_id
    from public.friend_requests fr
    where fr.sender_user_id = p_user_id
      and fr.status = 'pending'
    union
    select ub.blocker_user_id
    from public.user_blocks ub
    where ub.blocked_user_id = p_user_id
  ) s
  where s.user_id is not null;
$$;

revoke all on function public.list_profile_identity_subscribers(uuid) from public;
grant execute on function public.list_profile_identity_subscribers(uuid) to authenticated, service_role;

create or replace function public.notify_profile_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  v_user_id uuid;
  v_username text;
  v_avatar_url text;
  v_updated_at text;
  v_event text;
begin
  if tg_op = 'DELETE' then
    v_user_id := OLD.user_id;
    v_username := OLD.username;
    v_avatar_url := OLD.avatar_url;
    v_updated_at := OLD.updated_at::text;
    v_event := 'DELETE';
  else
    v_user_id := NEW.user_id;
    v_username := NEW.username;
    v_avatar_url := NEW.avatar_url;
    v_updated_at := NEW.updated_at::text;
    v_event := tg_op;
  end if;

  begin
    for rec in
      select subscriber.user_id
      from public.list_profile_identity_subscribers(v_user_id) as subscriber(user_id)
    loop
      perform realtime.send(
        jsonb_build_object(
          'event', v_event,
          'user_id', v_user_id::text,
          'username', v_username,
          'avatar_url', v_avatar_url,
          'updated_at', v_updated_at
        ),
        'PROFILE_IDENTITY_CHANGE',
        'private_user:' || rec.user_id::text,
        true
      );
    end loop;
  exception when others then
    null;
  end;

  if tg_op = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_profile_identity_change on public.profile_identities;
create trigger trg_notify_profile_identity_change
after insert or update or delete on public.profile_identities
for each row
execute function public.notify_profile_identity_change();

-- ---------------------------------------------------------------------------
-- CHANNEL_GROUP_CHANGE
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_channel_group_change(
  p_community_id uuid,
  p_group_id uuid,
  p_event text,
  p_target_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  begin
    if p_target_user_id is not null then
      perform realtime.send(
        jsonb_build_object(
          'community_id', p_community_id::text,
          'group_id', coalesce(p_group_id::text, ''),
          'event', p_event
        ),
        'CHANNEL_GROUP_CHANGE',
        'private_user:' || p_target_user_id::text,
        true
      );
      return;
    end if;

    for rec in
      select m.user_id
      from public.community_members m
      where m.community_id = p_community_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'community_id', p_community_id::text,
          'group_id', coalesce(p_group_id::text, ''),
          'event', p_event
        ),
        'CHANNEL_GROUP_CHANGE',
        'private_user:' || rec.user_id::text,
        true
      );
    end loop;
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.broadcast_channel_group_change(uuid, uuid, text, uuid) from public;
grant execute on function public.broadcast_channel_group_change(uuid, uuid, text, uuid) to authenticated, service_role;

create or replace function public.notify_channel_groups_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community_id uuid;
  v_group_id uuid;
begin
  if tg_op = 'DELETE' then
    v_community_id := OLD.community_id;
    v_group_id := OLD.id;
  else
    v_community_id := NEW.community_id;
    v_group_id := NEW.id;
  end if;

  perform public.broadcast_channel_group_change(v_community_id, v_group_id, tg_op);
  if tg_op = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create or replace function public.notify_channel_group_channels_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community_id uuid;
  v_group_id uuid;
begin
  if tg_op = 'DELETE' then
    v_community_id := OLD.community_id;
    v_group_id := OLD.group_id;
  else
    v_community_id := NEW.community_id;
    v_group_id := NEW.group_id;
  end if;

  perform public.broadcast_channel_group_change(v_community_id, v_group_id, tg_op);
  if tg_op = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create or replace function public.notify_channel_group_preferences_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community_id uuid;
  v_group_id uuid;
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_community_id := OLD.community_id;
    v_group_id := OLD.group_id;
    v_user_id := OLD.user_id;
  else
    v_community_id := NEW.community_id;
    v_group_id := NEW.group_id;
    v_user_id := NEW.user_id;
  end if;

  perform public.broadcast_channel_group_change(
    v_community_id,
    v_group_id,
    tg_op,
    v_user_id
  );
  if tg_op = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_channel_groups_change on public.channel_groups;
create trigger trg_notify_channel_groups_change
after insert or update or delete on public.channel_groups
for each row
execute function public.notify_channel_groups_change();

drop trigger if exists trg_notify_channel_group_channels_change on public.channel_group_channels;
create trigger trg_notify_channel_group_channels_change
after insert or update or delete on public.channel_group_channels
for each row
execute function public.notify_channel_group_channels_change();

drop trigger if exists trg_notify_channel_group_preferences_change on public.channel_group_preferences;
create trigger trg_notify_channel_group_preferences_change
after insert or update or delete on public.channel_group_preferences
for each row
execute function public.notify_channel_group_preferences_change();

-- ---------------------------------------------------------------------------
-- COMMUNITY_MEMBERSHIP_CHANGE
-- ---------------------------------------------------------------------------

create or replace function public.notify_community_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_community_id uuid;
  v_event text;
begin
  if tg_op = 'DELETE' then
    v_user_id := OLD.user_id;
    v_community_id := OLD.community_id;
    v_event := 'DELETE';
  else
    v_user_id := NEW.user_id;
    v_community_id := NEW.community_id;
    v_event := tg_op;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'community_id', v_community_id::text,
        'user_id', v_user_id::text,
        'event', v_event
      ),
      'COMMUNITY_MEMBERSHIP_CHANGE',
      'private_user:' || v_user_id::text,
      true
    );
  exception when others then
    null;
  end;

  if tg_op = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_community_membership_change on public.community_members;
create trigger trg_notify_community_membership_change
after insert or delete on public.community_members
for each row
execute function public.notify_community_membership_change();

-- Remove folded tables from supabase_realtime publication
do $$
declare
  tbl text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach tbl in array array[
    'profile_identities',
    'channel_groups',
    'channel_group_channels',
    'channel_group_preferences',
    'community_members'
  ]
  loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', tbl);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Moderation broadcasts via private_user (replaces community channel subs)
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_member_channel_access_revoked(
  p_community_id uuid,
  p_channel_id uuid,
  p_revoked_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_revoked_user_id <> auth.uid() then
    raise exception 'Can only broadcast access revocation for the signed-in user'
      using errcode = '42501';
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'community_id', p_community_id::text,
        'channel_id', p_channel_id::text,
        'revoked_user_id', p_revoked_user_id::text
      ),
      'member_channel_access_revoked',
      'private_user:' || p_revoked_user_id::text,
      true
    );
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.broadcast_member_channel_access_revoked(uuid, uuid, uuid) from public;
grant execute on function public.broadcast_member_channel_access_revoked(uuid, uuid, uuid) to authenticated;

create or replace function public.broadcast_report_status_updated(
  p_community_id uuid,
  p_report_id uuid,
  p_status text,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  begin
    for rec in
      select m.user_id
      from public.community_members m
      where m.community_id = p_community_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'community_id', p_community_id::text,
          'report_id', p_report_id::text,
          'status', p_status,
          'updated_by', p_updated_by::text
        ),
        'report_status_updated',
        'private_user:' || rec.user_id::text,
        true
      );
    end loop;
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.broadcast_report_status_updated(uuid, uuid, text, uuid) from public;
grant execute on function public.broadcast_report_status_updated(uuid, uuid, text, uuid) to authenticated;

create or replace function public.ban_community_member(
  p_community_id uuid,
  p_target_user_id uuid,
  p_reason text
)
returns table (
  banned_user_id uuid,
  community_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_can_manage_bans boolean := false;
  v_target_member_id uuid;
  v_target_is_owner boolean := false;
  v_reason text := trim(coalesce(p_reason, ''));
  v_existing_ban_id uuid;
  v_ban public.community_bans;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_community_id is null or p_target_user_id is null then
    raise exception 'Community and target user are required'
      using errcode = '22023';
  end if;

  if p_target_user_id = v_actor_user_id then
    raise exception 'You cannot ban yourself'
      using errcode = '22023';
  end if;

  if v_reason = '' then
    raise exception 'Ban reason is required'
      using errcode = '22023';
  end if;

  if char_length(v_reason) > 1000 then
    raise exception 'Ban reason exceeds 1000 characters'
      using errcode = '22001';
  end if;

  select
    public.is_community_owner(p_community_id),
    public.user_has_permission(p_community_id, 'manage_bans')
  into v_is_owner, v_can_manage_bans;

  if not (coalesce(v_is_owner, false) or coalesce(v_can_manage_bans, false)) then
    raise exception 'Missing permission to ban members'
      using errcode = '42501';
  end if;

  select cm.id, cm.is_owner
  into v_target_member_id, v_target_is_owner
  from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = p_target_user_id
  limit 1;

  if coalesce(v_target_is_owner, false) then
    raise exception 'Owners cannot be banned'
      using errcode = '42501';
  end if;

  if
    not coalesce(v_is_owner, false)
    and v_target_member_id is not null
    and not coalesce(public.can_manage_member_by_position(p_community_id, v_target_member_id), false)
  then
    raise exception 'Target member is above your role hierarchy'
      using errcode = '42501';
  end if;

  select cb.id
  into v_existing_ban_id
  from public.community_bans cb
  where cb.community_id = p_community_id
    and cb.banned_user_id = p_target_user_id
    and cb.revoked_at is null
  limit 1
  for update;

  if v_existing_ban_id is not null then
    raise exception 'User is already banned from this server'
      using errcode = '23505';
  end if;

  insert into public.community_bans (
    community_id,
    banned_user_id,
    banned_by_user_id,
    reason,
    banned_at
  )
  values (
    p_community_id,
    p_target_user_id,
    v_actor_user_id,
    v_reason,
    timezone('utc', now())
  )
  returning * into v_ban;

  delete from public.community_members cm
  where cm.community_id = p_community_id
    and cm.user_id = p_target_user_id;

  begin
    perform realtime.send(
      jsonb_build_object(
        'community_id', p_community_id::text,
        'banned_user_id', p_target_user_id::text
      ),
      'member_banned',
      'private_user:' || p_target_user_id::text,
      true
    );
  exception when others then
    null;
  end;

  return query
  select v_ban.banned_user_id, v_ban.community_id;
end;
$$;
