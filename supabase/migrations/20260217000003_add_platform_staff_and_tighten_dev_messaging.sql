-- Global platform staff model used for trusted Haven developer capabilities.
-- Staff rows are expected to be managed manually via SQL/editor or privileged backend jobs.

create table if not exists public.platform_staff (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  staff_role text not null default 'developer' check (staff_role in ('developer', 'support', 'admin')),
  is_active boolean not null default true,
  can_post_haven_dev boolean not null default true,
  display_prefix text not null default 'Haven' check (char_length(trim(display_prefix)) between 2 and 24),
  assigned_by_user_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_platform_staff_active
  on public.platform_staff(is_active);

drop trigger if exists trg_platform_staff_updated_at on public.platform_staff;
create trigger trg_platform_staff_updated_at
before update on public.platform_staff
for each row execute function public.set_updated_at();

alter table public.platform_staff enable row level security;

drop policy if exists platform_staff_select_active_or_self on public.platform_staff;
create policy platform_staff_select_active_or_self
on public.platform_staff
for select
to authenticated
using (is_active = true or user_id = auth.uid());

-- No authenticated write policies on purpose.
revoke insert, update, delete on public.platform_staff from anon;
revoke insert, update, delete on public.platform_staff from authenticated;
grant select on public.platform_staff to authenticated;

create or replace function public.is_platform_staff(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_staff ps
    where ps.user_id = p_user_id
      and ps.is_active = true
  );
$$;

create or replace function public.can_post_haven_dev_message(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_staff ps
    where ps.user_id = p_user_id
      and ps.is_active = true
      and ps.can_post_haven_dev = true
  );
$$;

revoke all on function public.is_platform_staff(uuid) from public;
grant execute on function public.is_platform_staff(uuid) to authenticated;

revoke all on function public.can_post_haven_dev_message(uuid) from public;
grant execute on function public.can_post_haven_dev_message(uuid) to authenticated;

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
  v_access_enabled boolean := false;
  v_access_mode public.developer_access_mode := 'report_only';
  v_channel_exists boolean := false;
  v_channel_allowed boolean := false;
  v_staff_role text;
  v_display_prefix text;
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

  select ps.staff_role, ps.display_prefix
  into v_staff_role, v_display_prefix
  from public.platform_staff ps
  where ps.user_id = v_user_id
    and ps.is_active = true
    and ps.can_post_haven_dev = true
  limit 1;

  if v_staff_role is null then
    raise exception 'Only active platform staff can post Haven developer messages'
      using errcode = '42501';
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
        'staff_role', v_staff_role,
        'display_prefix', v_display_prefix,
        'sent_at', timezone('utc', now())
      )
  )
  returning * into v_message;

  return v_message;
end;
$$;

revoke all on function public.post_haven_dev_message(uuid, uuid, text, jsonb) from public;
grant execute on function public.post_haven_dev_message(uuid, uuid, text, jsonb) to authenticated;
