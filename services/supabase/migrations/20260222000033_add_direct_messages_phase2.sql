-- Direct messages (Phase 2)
-- 1:1 DM conversations/messages with RLS-first access and notification integration.
-- Group DMs are schema-ready but not fully enabled in renderer UX yet.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'dm_conversation_kind'
  ) then
    create type public.dm_conversation_kind as enum (
      'direct',
      'group'
    );
  end if;
end $$;

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.dm_conversation_kind not null default 'direct',
  created_by_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_message_at timestamptz,
  direct_user_low_id uuid references public.profiles(id) on delete cascade,
  direct_user_high_id uuid references public.profiles(id) on delete cascade,
  check (
    (kind = 'direct' and direct_user_low_id is not null and direct_user_high_id is not null and direct_user_low_id < direct_user_high_id)
    or (kind = 'group' and direct_user_low_id is null and direct_user_high_id is null)
  )
);

create table if not exists public.dm_conversation_members (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz,
  hidden_at timestamptz,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.dm_conversation_notification_preferences (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  in_app_override boolean,
  sound_override boolean,
  muted_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

create table if not exists public.dm_message_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('content_abuse', 'bug')),
  comment text not null check (char_length(trim(comment)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc', now()),
  status text not null default 'open'
);

create unique index if not exists idx_dm_conversations_unique_direct_pair
  on public.dm_conversations(direct_user_low_id, direct_user_high_id)
  where kind = 'direct';

create index if not exists idx_dm_conversations_last_message_at
  on public.dm_conversations(last_message_at desc nulls last, updated_at desc);

create index if not exists idx_dm_conversation_members_user
  on public.dm_conversation_members(user_id, conversation_id);

create index if not exists idx_dm_messages_conversation_created_at
  on public.dm_messages(conversation_id, created_at desc, id desc)
  where deleted_at is null;

create index if not exists idx_dm_messages_author
  on public.dm_messages(author_user_id, created_at desc);

create index if not exists idx_dm_message_reports_reporter
  on public.dm_message_reports(reporter_user_id, created_at desc);

create index if not exists idx_dm_message_reports_message
  on public.dm_message_reports(message_id);

drop trigger if exists trg_dm_conversations_updated_at on public.dm_conversations;
create trigger trg_dm_conversations_updated_at
before update on public.dm_conversations
for each row execute function public.set_updated_at();

drop trigger if exists trg_dm_conversation_notification_preferences_updated_at on public.dm_conversation_notification_preferences;
create trigger trg_dm_conversation_notification_preferences_updated_at
before update on public.dm_conversation_notification_preferences
for each row execute function public.set_updated_at();

create or replace function public.is_dm_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dm_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = auth.uid()
      and m.left_at is null
  );
$$;

create or replace function public.can_send_dm_in_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kind public.dm_conversation_kind;
  v_other_user_id uuid;
begin
  if v_me is null or p_conversation_id is null then
    return false;
  end if;

  if not public.is_dm_conversation_member(p_conversation_id) then
    return false;
  end if;

  select
    dc.kind,
    case
      when dc.kind = 'direct' and dc.direct_user_low_id = v_me then dc.direct_user_high_id
      when dc.kind = 'direct' and dc.direct_user_high_id = v_me then dc.direct_user_low_id
      else null
    end as other_user_id
  into v_kind, v_other_user_id
  from public.dm_conversations dc
  where dc.id = p_conversation_id
  limit 1;

  if v_kind is null then
    return false;
  end if;

  if v_kind <> 'direct' then
    return false;
  end if;

  if v_other_user_id is null then
    return false;
  end if;

  if public.is_blocked_either_direction(v_me, v_other_user_id) then
    return false;
  end if;

  return public.are_friends(v_me, v_other_user_id);
end;
$$;

create or replace function public.resolve_dm_notification_delivery_for_user(
  p_recipient_user_id uuid,
  p_conversation_id uuid
)
returns table(deliver_in_app boolean, deliver_sound boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_in_app boolean := true;
  v_base_sound boolean := false;
  v_override_in_app boolean;
  v_override_sound boolean;
  v_muted_until timestamptz;
begin
  select base.deliver_in_app, base.deliver_sound
  into v_base_in_app, v_base_sound
  from public.resolve_notification_delivery_for_user(p_recipient_user_id, 'dm_message') base
  limit 1;

  select pref.in_app_override, pref.sound_override, pref.muted_until
  into v_override_in_app, v_override_sound, v_muted_until
  from public.dm_conversation_notification_preferences pref
  where pref.conversation_id = p_conversation_id
    and pref.user_id = p_recipient_user_id
  limit 1;

  if v_muted_until is not null and v_muted_until > timezone('utc', now()) then
    return query select false, false;
    return;
  end if;

  return query
  select
    coalesce(v_override_in_app, v_base_in_app),
    coalesce(v_override_sound, v_base_sound);
end;
$$;

revoke all on function public.is_dm_conversation_member(uuid) from public;
revoke all on function public.can_send_dm_in_conversation(uuid) from public;
revoke all on function public.resolve_dm_notification_delivery_for_user(uuid, uuid) from public;
grant execute on function public.is_dm_conversation_member(uuid) to authenticated, service_role;
grant execute on function public.can_send_dm_in_conversation(uuid) to authenticated, service_role;
grant execute on function public.resolve_dm_notification_delivery_for_user(uuid, uuid)
  to authenticated, service_role;

alter table public.dm_conversations enable row level security;
alter table public.dm_conversation_members enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_conversation_notification_preferences enable row level security;
alter table public.dm_message_reports enable row level security;

create policy dm_conversations_select_member
on public.dm_conversations
for select
to authenticated
using (public.is_dm_conversation_member(id));

create policy dm_conversation_members_select_member
on public.dm_conversation_members
for select
to authenticated
using (public.is_dm_conversation_member(conversation_id));

create policy dm_messages_select_member
on public.dm_messages
for select
to authenticated
using (public.is_dm_conversation_member(conversation_id));

create policy dm_conversation_notification_preferences_select_self
on public.dm_conversation_notification_preferences
for select
to authenticated
using (user_id = auth.uid());

create policy dm_conversation_notification_preferences_insert_self
on public.dm_conversation_notification_preferences
for insert
to authenticated
with check (user_id = auth.uid() and public.is_dm_conversation_member(conversation_id));

create policy dm_conversation_notification_preferences_update_self
on public.dm_conversation_notification_preferences
for update
to authenticated
using (user_id = auth.uid() and public.is_dm_conversation_member(conversation_id))
with check (user_id = auth.uid() and public.is_dm_conversation_member(conversation_id));

create policy dm_conversation_notification_preferences_delete_self
on public.dm_conversation_notification_preferences
for delete
to authenticated
using (user_id = auth.uid() and public.is_dm_conversation_member(conversation_id));

create policy dm_message_reports_select_reporter
on public.dm_message_reports
for select
to authenticated
using (reporter_user_id = auth.uid());

create or replace function public.get_or_create_direct_dm_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_pair_low uuid;
  v_pair_high uuid;
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Invalid DM target.';
  end if;

  if public.is_blocked_either_direction(v_me, p_other_user_id) then
    raise exception 'Direct messages are not available for this user.';
  end if;

  if not public.are_friends(v_me, p_other_user_id) then
    raise exception 'You can only direct message users who are on your friends list.';
  end if;

  v_pair_low := least(v_me, p_other_user_id);
  v_pair_high := greatest(v_me, p_other_user_id);

  select dc.id
  into v_conversation_id
  from public.dm_conversations dc
  where dc.kind = 'direct'
    and dc.direct_user_low_id = v_pair_low
    and dc.direct_user_high_id = v_pair_high
  limit 1;

  if v_conversation_id is null then
    begin
      insert into public.dm_conversations (
        kind,
        created_by_user_id,
        direct_user_low_id,
        direct_user_high_id
      )
      values (
        'direct',
        v_me,
        v_pair_low,
        v_pair_high
      )
      returning id into v_conversation_id;
    exception when unique_violation then
      select dc.id
      into v_conversation_id
      from public.dm_conversations dc
      where dc.kind = 'direct'
        and dc.direct_user_low_id = v_pair_low
        and dc.direct_user_high_id = v_pair_high
      limit 1;
    end;
  end if;

  insert into public.dm_conversation_members (conversation_id, user_id)
  values (v_conversation_id, v_me), (v_conversation_id, p_other_user_id)
  on conflict (conversation_id, user_id) do nothing;

  update public.dm_conversation_members
  set
    left_at = null,
    hidden_at = null
  where conversation_id = v_conversation_id
    and user_id in (v_me, p_other_user_id);

  return v_conversation_id;
end;
$$;

revoke all on function public.get_or_create_direct_dm_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_dm_conversation(uuid) to authenticated;

create or replace function public.list_my_dm_conversations()
returns table(
  conversation_id uuid,
  kind public.dm_conversation_kind,
  other_user_id uuid,
  other_username text,
  other_avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  last_message_id uuid,
  last_message_author_user_id uuid,
  last_message_preview text,
  last_message_created_at timestamptz,
  unread_count integer,
  is_muted boolean,
  muted_until timestamptz
)
language sql
security definer
set search_path = public
as $$
  with my_memberships as (
    select m.conversation_id, m.last_read_at
    from public.dm_conversation_members m
    where m.user_id = auth.uid()
      and m.left_at is null
  )
  select
    dc.id as conversation_id,
    dc.kind,
    other_profile.id as other_user_id,
    other_profile.username as other_username,
    other_profile.avatar_url as other_avatar_url,
    dc.created_at,
    dc.updated_at,
    dc.last_message_at,
    lm.id as last_message_id,
    lm.author_user_id as last_message_author_user_id,
    lm.content as last_message_preview,
    lm.created_at as last_message_created_at,
    coalesce(unread_counts.unread_count, 0)::integer as unread_count,
    (
      coalesce(dm_pref.muted_until > timezone('utc', now()), false)
      or (
        coalesce(dm_pref.in_app_override, true) = false
        and coalesce(dm_pref.sound_override, true) = false
      )
    ) as is_muted,
    dm_pref.muted_until
  from my_memberships mm
  join public.dm_conversations dc
    on dc.id = mm.conversation_id
  left join public.dm_conversation_notification_preferences dm_pref
    on dm_pref.conversation_id = dc.id
   and dm_pref.user_id = auth.uid()
  left join lateral (
    select
      case
        when dc.kind = 'direct' and dc.direct_user_low_id = auth.uid() then dc.direct_user_high_id
        when dc.kind = 'direct' and dc.direct_user_high_id = auth.uid() then dc.direct_user_low_id
        else null
      end as other_user_id
  ) as direct_other on true
  left join public.profiles other_profile
    on other_profile.id = direct_other.other_user_id
  left join lateral (
    select m.id, m.author_user_id, m.content, m.created_at
    from public.dm_messages m
    where m.conversation_id = dc.id
      and m.deleted_at is null
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::integer as unread_count
    from public.dm_messages m
    where m.conversation_id = dc.id
      and m.deleted_at is null
      and m.author_user_id <> auth.uid()
      and (mm.last_read_at is null or m.created_at > mm.last_read_at)
  ) unread_counts on true
  where dc.kind = 'direct'
    and not public.is_blocked_either_direction(auth.uid(), other_profile.id)
  order by coalesce(dc.last_message_at, dc.updated_at, dc.created_at) desc, dc.id desc;
$$;

revoke all on function public.list_my_dm_conversations() from public;
grant execute on function public.list_my_dm_conversations() to authenticated;

create or replace function public.list_dm_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null
)
returns table(
  message_id uuid,
  conversation_id uuid,
  author_user_id uuid,
  author_username text,
  author_avatar_url text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null or not public.is_dm_conversation_member(p_conversation_id) then
    raise exception 'You do not have access to this DM conversation.' using errcode = '42501';
  end if;

  return query
  with bounded as (
    select greatest(1, least(coalesce(p_limit, 50), 100)) as next_limit
  ),
  page as (
    select
      m.id as message_id,
      m.conversation_id,
      m.author_user_id,
      p.username as author_username,
      p.avatar_url as author_avatar_url,
      m.content,
      m.metadata,
      m.created_at,
      m.edited_at,
      m.deleted_at
    from public.dm_messages m
    join public.profiles p
      on p.id = m.author_user_id
    where m.conversation_id = p_conversation_id
      and m.deleted_at is null
      and (
        p_before_created_at is null
        or m.created_at < p_before_created_at
        or (
          p_before_message_id is not null
          and m.created_at = p_before_created_at
          and m.id < p_before_message_id
        )
      )
    order by m.created_at desc, m.id desc
    limit (select next_limit from bounded)
  )
  select *
  from page
  order by created_at asc, message_id asc;
end;
$$;

revoke all on function public.list_dm_messages(uuid, integer, timestamptz, uuid) from public;
grant execute on function public.list_dm_messages(uuid, integer, timestamptz, uuid) to authenticated;

create or replace function public.send_dm_message(
  p_conversation_id uuid,
  p_content text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  message_id uuid,
  conversation_id uuid,
  author_user_id uuid,
  author_username text,
  author_avatar_url text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_content text := trim(coalesce(p_content, ''));
  v_message public.dm_messages%rowtype;
  v_sender_profile public.profiles%rowtype;
  v_delivery record;
  v_recipient record;
  v_notification_event_id uuid;
  v_message_preview text;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null then
    raise exception 'DM conversation id is required.';
  end if;

  if char_length(v_content) < 1 or char_length(v_content) > 4000 then
    raise exception 'DM content must be between 1 and 4000 characters.';
  end if;

  if not public.can_send_dm_in_conversation(p_conversation_id) then
    raise exception 'You cannot send messages in this DM conversation.' using errcode = '42501';
  end if;

  insert into public.dm_messages (
    conversation_id,
    author_user_id,
    content,
    metadata
  )
  values (
    p_conversation_id,
    v_me,
    v_content,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_message;

  update public.dm_conversations
  set
    last_message_at = v_message.created_at,
    updated_at = timezone('utc', now())
  where id = p_conversation_id;

  update public.dm_conversation_members
  set last_read_at = timezone('utc', now())
  where conversation_id = p_conversation_id
    and user_id = v_me;

  select *
  into v_sender_profile
  from public.profiles p
  where p.id = v_me
  limit 1;

  v_message_preview := case
    when char_length(v_content) > 180 then substring(v_content from 1 for 180) || '...'
    else v_content
  end;

  for v_recipient in
    select m.user_id
    from public.dm_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id <> v_me
      and m.left_at is null
  loop
    if public.is_blocked_either_direction(v_me, v_recipient.user_id) then
      continue;
    end if;

    select deliver_in_app, deliver_sound
    into v_delivery
    from public.resolve_dm_notification_delivery_for_user(v_recipient.user_id, p_conversation_id)
    limit 1;

    if coalesce(v_delivery.deliver_in_app, false) or coalesce(v_delivery.deliver_sound, false) then
      insert into public.notification_events (
        kind,
        source_kind,
        source_id,
        actor_user_id,
        payload
      )
      values (
        'dm_message',
        'dm_message',
        v_message.id,
        v_me,
        jsonb_build_object(
          'dmMessageId', v_message.id,
          'conversationId', p_conversation_id,
          'title', 'Direct message',
          'message', v_message_preview
        )
      )
      returning id into v_notification_event_id;

      insert into public.notification_recipients (
        event_id,
        recipient_user_id,
        deliver_in_app,
        deliver_sound
      )
      values (
        v_notification_event_id,
        v_recipient.user_id,
        coalesce(v_delivery.deliver_in_app, true),
        coalesce(v_delivery.deliver_sound, false)
      );
    end if;
  end loop;

  return query
  select
    v_message.id,
    v_message.conversation_id,
    v_message.author_user_id,
    v_sender_profile.username,
    v_sender_profile.avatar_url,
    v_message.content,
    v_message.metadata,
    v_message.created_at,
    v_message.edited_at,
    v_message.deleted_at;
end;
$$;

revoke all on function public.send_dm_message(uuid, text, jsonb) from public;
grant execute on function public.send_dm_message(uuid, text, jsonb) to authenticated;

create or replace function public.mark_dm_conversation_read(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null or not public.is_dm_conversation_member(p_conversation_id) then
    raise exception 'You do not have access to this DM conversation.' using errcode = '42501';
  end if;

  update public.dm_conversation_members
  set last_read_at = timezone('utc', now())
  where conversation_id = p_conversation_id
    and user_id = v_me;

  update public.notification_recipients nr
  set
    seen_at = coalesce(nr.seen_at, timezone('utc', now())),
    read_at = coalesce(nr.read_at, timezone('utc', now()))
  from public.notification_events ne
  join public.dm_messages dm
    on dm.id = ne.source_id
  where nr.event_id = ne.id
    and nr.recipient_user_id = v_me
    and ne.source_kind = 'dm_message'
    and ne.kind = 'dm_message'
    and dm.conversation_id = p_conversation_id
    and nr.dismissed_at is null;

  return true;
end;
$$;

revoke all on function public.mark_dm_conversation_read(uuid) from public;
grant execute on function public.mark_dm_conversation_read(uuid) to authenticated;

create or replace function public.set_dm_conversation_muted(
  p_conversation_id uuid,
  p_muted boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_conversation_id is null or not public.is_dm_conversation_member(p_conversation_id) then
    raise exception 'You do not have access to this DM conversation.' using errcode = '42501';
  end if;

  if coalesce(p_muted, false) then
    insert into public.dm_conversation_notification_preferences (
      conversation_id,
      user_id,
      in_app_override,
      sound_override,
      muted_until
    )
    values (
      p_conversation_id,
      v_me,
      false,
      false,
      null
    )
    on conflict (conversation_id, user_id)
    do update set
      in_app_override = excluded.in_app_override,
      sound_override = excluded.sound_override,
      muted_until = excluded.muted_until,
      updated_at = timezone('utc', now());
  else
    delete from public.dm_conversation_notification_preferences
    where conversation_id = p_conversation_id
      and user_id = v_me;
  end if;

  return true;
end;
$$;

revoke all on function public.set_dm_conversation_muted(uuid, boolean) from public;
grant execute on function public.set_dm_conversation_muted(uuid, boolean) to authenticated;

create or replace function public.report_dm_message(
  p_message_id uuid,
  p_kind text,
  p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_message public.dm_messages%rowtype;
  v_kind text := trim(coalesce(p_kind, ''));
  v_comment text := trim(coalesce(p_comment, ''));
  v_report_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_kind not in ('content_abuse', 'bug') then
    raise exception 'Unsupported DM report kind.';
  end if;

  if char_length(v_comment) < 1 or char_length(v_comment) > 2000 then
    raise exception 'DM report comment must be between 1 and 2000 characters.';
  end if;

  select *
  into v_message
  from public.dm_messages dm
  where dm.id = p_message_id
    and dm.deleted_at is null
  limit 1;

  if not found then
    raise exception 'DM message not found.';
  end if;

  if not public.is_dm_conversation_member(v_message.conversation_id) then
    raise exception 'You do not have access to this DM message.' using errcode = '42501';
  end if;

  insert into public.dm_message_reports (
    conversation_id,
    message_id,
    reporter_user_id,
    reported_user_id,
    kind,
    comment
  )
  values (
    v_message.conversation_id,
    v_message.id,
    v_me,
    v_message.author_user_id,
    v_kind,
    v_comment
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.report_dm_message(uuid, text, text) from public;
grant execute on function public.report_dm_message(uuid, text, text) to authenticated;

-- Realtime publication for DM workspace and thread updates.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'dm_conversations'
    ) then
      alter publication supabase_realtime add table public.dm_conversations;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'dm_conversation_members'
    ) then
      alter publication supabase_realtime add table public.dm_conversation_members;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'dm_messages'
    ) then
      alter publication supabase_realtime add table public.dm_messages;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'dm_conversation_notification_preferences'
    ) then
      alter publication supabase_realtime add table public.dm_conversation_notification_preferences;
    end if;
  end if;
end $$;
