-- Add RPC functions for server creation and controlled Haven developer messaging.

-- Keep direct inserts safe if they are used anywhere.
drop policy if exists communities_insert_creator on public.communities;

create policy communities_insert_creator
on public.communities
for insert
to authenticated
with check (created_by_user_id = auth.uid());

create or replace function public.create_community(
  p_name text,
  p_description text default null
)
returns public.communities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_community public.communities;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Community name is required'
      using errcode = '22023';
  end if;

  insert into public.communities (
    name,
    description,
    created_by_user_id
  )
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    v_user_id
  )
  returning * into v_community;

  return v_community;
end;
$$;

revoke all on function public.create_community(text, text) from public;
grant execute on function public.create_community(text, text) to authenticated;

create or replace function public.post_haven_dev_message(
  p_community_id uuid,
  p_channel_id uuid,
  p_content text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_can_manage_reports boolean := false;
  v_access_enabled boolean := false;
  v_access_mode public.developer_access_mode := 'report_only';
  v_channel_exists boolean := false;
  v_channel_allowed boolean := false;
  v_message public.messages;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_content is null or char_length(trim(p_content)) = 0 then
    raise exception 'Message content is required'
      using errcode = '22023';
  end if;

  if char_length(p_content) > 4000 then
    raise exception 'Message content exceeds 4000 characters'
      using errcode = '22001';
  end if;

  select exists (
    select 1
    from public.channels c
    where c.id = p_channel_id
      and c.community_id = p_community_id
  )
  into v_channel_exists;

  if not v_channel_exists then
    raise exception 'Channel not found in this community'
      using errcode = '22023';
  end if;

  select public.is_community_owner(p_community_id)
  into v_is_owner;

  select public.user_has_permission(p_community_id, 'manage_reports')
  into v_can_manage_reports;

  if not (v_is_owner or v_can_manage_reports) then
    raise exception 'Missing permission to post Haven developer messages'
      using errcode = '42501';
  end if;

  select cda.enabled, cda.mode
  into v_access_enabled, v_access_mode
  from public.community_developer_access cda
  where cda.community_id = p_community_id;

  if not coalesce(v_access_enabled, false) then
    raise exception 'Haven developer access is disabled for this community'
      using errcode = '42501';
  end if;

  if v_access_mode = 'report_only' then
    raise exception 'Haven developer messaging is disabled in report-only mode'
      using errcode = '42501';
  end if;

  if v_access_mode = 'channel_scoped' then
    select exists (
      select 1
      from public.community_developer_access_channels cdac
      where cdac.community_id = p_community_id
        and cdac.channel_id = p_channel_id
    )
    into v_channel_allowed;

    if not v_channel_allowed then
      raise exception 'This channel is not enabled for Haven developer messaging'
        using errcode = '42501';
    end if;
  end if;

  insert into public.messages (
    community_id,
    channel_id,
    author_type,
    author_user_id,
    content,
    metadata
  )
  values (
    p_community_id,
    p_channel_id,
    'haven_dev',
    null,
    trim(p_content),
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'sent_by_user_id', v_user_id,
        'sent_at', timezone('utc', now())
      )
  )
  returning * into v_message;

  return v_message;
end;
$$;

revoke all on function public.post_haven_dev_message(uuid, uuid, text, jsonb) from public;
grant execute on function public.post_haven_dev_message(uuid, uuid, text, jsonb) to authenticated;
