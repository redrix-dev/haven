-- Notification foundation (Phase 0)
-- Provides a generic per-user notification inbox, unread/unseen state, and global notification prefs.
-- Friend requests / DMs / mentions can emit into this model in later phases.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'notification_kind'
  ) then
    create type public.notification_kind as enum (
      'friend_request_received',
      'friend_request_accepted',
      'dm_message',
      'channel_mention',
      'system'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'notification_source_kind'
  ) then
    create type public.notification_source_kind as enum (
      'friend_request',
      'dm_message',
      'message',
      'system_event'
    );
  end if;
end $$;

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  kind public.notification_kind not null,
  source_kind public.notification_source_kind not null,
  source_id uuid not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  deliver_in_app boolean not null default true,
  deliver_sound boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  seen_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  unique (event_id, recipient_user_id)
);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  friend_request_in_app_enabled boolean not null default true,
  friend_request_sound_enabled boolean not null default true,
  dm_in_app_enabled boolean not null default true,
  dm_sound_enabled boolean not null default true,
  mention_in_app_enabled boolean not null default true,
  mention_sound_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_notification_events_created_at
  on public.notification_events(created_at desc);

create index if not exists idx_notification_events_kind_created_at
  on public.notification_events(kind, created_at desc);

create index if not exists idx_notification_recipients_user_created_at
  on public.notification_recipients(recipient_user_id, created_at desc);

create index if not exists idx_notification_recipients_user_unseen
  on public.notification_recipients(recipient_user_id, created_at desc)
  where dismissed_at is null
    and seen_at is null;

create index if not exists idx_notification_recipients_user_unread
  on public.notification_recipients(recipient_user_id, created_at desc)
  where dismissed_at is null
    and read_at is null;

create index if not exists idx_notification_recipients_event
  on public.notification_recipients(event_id);

drop trigger if exists trg_user_notification_preferences_updated_at on public.user_notification_preferences;
create trigger trg_user_notification_preferences_updated_at
before update on public.user_notification_preferences
for each row execute function public.set_updated_at();

create or replace function public.ensure_user_notification_preferences_row(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.user_notification_preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.ensure_user_notification_preferences_row(uuid) from public;
grant execute on function public.ensure_user_notification_preferences_row(uuid)
  to postgres, service_role;

create or replace function public.seed_user_notification_preferences_on_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_user_notification_preferences_row(new.id);
  return new;
end;
$$;

drop trigger if exists trg_profiles_seed_notification_preferences on public.profiles;
create trigger trg_profiles_seed_notification_preferences
after insert on public.profiles
for each row execute function public.seed_user_notification_preferences_on_profile_insert();

-- Backfill prefs for existing users.
insert into public.user_notification_preferences (user_id)
select p.id
from public.profiles p
on conflict (user_id) do nothing;

create or replace function public.is_notification_recipient(p_notification_recipient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notification_recipients nr
    where nr.id = p_notification_recipient_id
      and nr.recipient_user_id = auth.uid()
  );
$$;

create or replace function public.notification_event_visible_to_auth(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notification_recipients nr
    where nr.event_id = p_event_id
      and nr.recipient_user_id = auth.uid()
  );
$$;

create or replace function public.resolve_notification_delivery_for_user(
  p_recipient_user_id uuid,
  p_kind public.notification_kind
)
returns table(deliver_in_app boolean, deliver_sound boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_user_notification_preferences_row(p_recipient_user_id);

  return query
  select
    case p_kind
      when 'friend_request_received' then prefs.friend_request_in_app_enabled
      when 'friend_request_accepted' then prefs.friend_request_in_app_enabled
      when 'dm_message' then prefs.dm_in_app_enabled
      when 'channel_mention' then prefs.mention_in_app_enabled
      else true
    end as deliver_in_app,
    case p_kind
      when 'friend_request_received' then prefs.friend_request_sound_enabled
      when 'friend_request_accepted' then prefs.friend_request_sound_enabled
      when 'dm_message' then prefs.dm_sound_enabled
      when 'channel_mention' then prefs.mention_sound_enabled
      else false
    end as deliver_sound
  from public.user_notification_preferences prefs
  where prefs.user_id = p_recipient_user_id
  limit 1;
end;
$$;

revoke all on function public.resolve_notification_delivery_for_user(uuid, public.notification_kind) from public;
grant execute on function public.resolve_notification_delivery_for_user(uuid, public.notification_kind)
  to postgres, service_role;

alter table public.notification_events enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.user_notification_preferences enable row level security;

create policy notification_events_select_recipient
on public.notification_events
for select
to authenticated
using (public.notification_event_visible_to_auth(id));

create policy notification_recipients_select_self
on public.notification_recipients
for select
to authenticated
using (recipient_user_id = auth.uid());

create policy user_notification_preferences_select_self
on public.user_notification_preferences
for select
to authenticated
using (user_id = auth.uid());

create policy user_notification_preferences_insert_self
on public.user_notification_preferences
for insert
to authenticated
with check (user_id = auth.uid());

create policy user_notification_preferences_update_self
on public.user_notification_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.get_my_notification_preferences()
returns table(
  user_id uuid,
  friend_request_in_app_enabled boolean,
  friend_request_sound_enabled boolean,
  dm_in_app_enabled boolean,
  dm_sound_enabled boolean,
  mention_in_app_enabled boolean,
  mention_sound_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform public.ensure_user_notification_preferences_row(auth.uid());

  return query
  select
    prefs.user_id,
    prefs.friend_request_in_app_enabled,
    prefs.friend_request_sound_enabled,
    prefs.dm_in_app_enabled,
    prefs.dm_sound_enabled,
    prefs.mention_in_app_enabled,
    prefs.mention_sound_enabled,
    prefs.created_at,
    prefs.updated_at
  from public.user_notification_preferences prefs
  where prefs.user_id = auth.uid();
end;
$$;

revoke all on function public.get_my_notification_preferences() from public;
grant execute on function public.get_my_notification_preferences() to authenticated;

create or replace function public.update_my_notification_preferences(
  p_friend_request_in_app_enabled boolean,
  p_friend_request_sound_enabled boolean,
  p_dm_in_app_enabled boolean,
  p_dm_sound_enabled boolean,
  p_mention_in_app_enabled boolean,
  p_mention_sound_enabled boolean
)
returns table(
  user_id uuid,
  friend_request_in_app_enabled boolean,
  friend_request_sound_enabled boolean,
  dm_in_app_enabled boolean,
  dm_sound_enabled boolean,
  mention_in_app_enabled boolean,
  mention_sound_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform public.ensure_user_notification_preferences_row(auth.uid());

  update public.user_notification_preferences
  set
    friend_request_in_app_enabled = p_friend_request_in_app_enabled,
    friend_request_sound_enabled = p_friend_request_sound_enabled,
    dm_in_app_enabled = p_dm_in_app_enabled,
    dm_sound_enabled = p_dm_sound_enabled,
    mention_in_app_enabled = p_mention_in_app_enabled,
    mention_sound_enabled = p_mention_sound_enabled,
    updated_at = timezone('utc', now())
  where user_id = auth.uid();

  return query
  select * from public.get_my_notification_preferences();
end;
$$;

revoke all on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean)
  to authenticated;

create or replace function public.get_my_notification_counts()
returns table(unseen_count integer, unread_count integer)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (
      where nr.deliver_in_app = true
        and nr.dismissed_at is null
        and nr.seen_at is null
    )::integer as unseen_count,
    count(*) filter (
      where nr.deliver_in_app = true
        and nr.dismissed_at is null
        and nr.read_at is null
    )::integer as unread_count
  from public.notification_recipients nr
  where nr.recipient_user_id = auth.uid();
$$;

revoke all on function public.get_my_notification_counts() from public;
grant execute on function public.get_my_notification_counts() to authenticated;

create or replace function public.list_my_notifications(
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table(
  recipient_id uuid,
  event_id uuid,
  kind public.notification_kind,
  source_kind public.notification_source_kind,
  source_id uuid,
  actor_user_id uuid,
  actor_username text,
  actor_avatar_url text,
  payload jsonb,
  deliver_in_app boolean,
  deliver_sound boolean,
  created_at timestamptz,
  seen_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with bounded as (
    select greatest(1, least(coalesce(p_limit, 50), 100)) as next_limit
  )
  select
    nr.id as recipient_id,
    ne.id as event_id,
    ne.kind,
    ne.source_kind,
    ne.source_id,
    ne.actor_user_id,
    actor.username as actor_username,
    actor.avatar_url as actor_avatar_url,
    ne.payload,
    nr.deliver_in_app,
    nr.deliver_sound,
    nr.created_at,
    nr.seen_at,
    nr.read_at,
    nr.dismissed_at
  from public.notification_recipients nr
  join public.notification_events ne
    on ne.id = nr.event_id
  left join public.profiles actor
    on actor.id = ne.actor_user_id
  cross join bounded b
  where nr.recipient_user_id = auth.uid()
    and nr.dismissed_at is null
    and nr.deliver_in_app = true
    and (
      p_before_created_at is null
      or nr.created_at < p_before_created_at
      or (
        p_before_id is not null
        and nr.created_at = p_before_created_at
        and nr.id < p_before_id
      )
    )
  order by nr.created_at desc, nr.id desc
  limit (select next_limit from bounded);
$$;

revoke all on function public.list_my_notifications(integer, timestamptz, uuid) from public;
grant execute on function public.list_my_notifications(integer, timestamptz, uuid) to authenticated;

create or replace function public.mark_notifications_seen(p_recipient_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if coalesce(array_length(p_recipient_ids, 1), 0) = 0 then
    return 0;
  end if;

  update public.notification_recipients
  set seen_at = coalesce(seen_at, timezone('utc', now()))
  where recipient_user_id = auth.uid()
    and id = any (p_recipient_ids)
    and dismissed_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.mark_notifications_seen(uuid[]) from public;
grant execute on function public.mark_notifications_seen(uuid[]) to authenticated;

create or replace function public.mark_notifications_read(p_recipient_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if coalesce(array_length(p_recipient_ids, 1), 0) = 0 then
    return 0;
  end if;

  update public.notification_recipients
  set
    seen_at = coalesce(seen_at, timezone('utc', now())),
    read_at = coalesce(read_at, timezone('utc', now()))
  where recipient_user_id = auth.uid()
    and id = any (p_recipient_ids)
    and dismissed_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.mark_all_notifications_seen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.notification_recipients
  set seen_at = coalesce(seen_at, timezone('utc', now()))
  where recipient_user_id = auth.uid()
    and deliver_in_app = true
    and dismissed_at is null
    and seen_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.mark_all_notifications_seen() from public;
grant execute on function public.mark_all_notifications_seen() to authenticated;

create or replace function public.dismiss_notifications(p_recipient_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if coalesce(array_length(p_recipient_ids, 1), 0) = 0 then
    return 0;
  end if;

  update public.notification_recipients
  set dismissed_at = coalesce(dismissed_at, timezone('utc', now()))
  where recipient_user_id = auth.uid()
    and id = any (p_recipient_ids);

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.dismiss_notifications(uuid[]) from public;
grant execute on function public.dismiss_notifications(uuid[]) to authenticated;

create or replace function public.create_notification_event_with_recipients(
  p_kind public.notification_kind,
  p_source_kind public.notification_source_kind,
  p_source_id uuid,
  p_actor_user_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_recipients jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
  v_event_id uuid;
begin
  if v_role not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Not authorized to create notification events'
      using errcode = '42501';
  end if;

  if p_source_id is null then
    raise exception 'Notification source id is required';
  end if;

  insert into public.notification_events (
    kind,
    source_kind,
    source_id,
    actor_user_id,
    payload
  )
  values (
    p_kind,
    p_source_kind,
    p_source_id,
    p_actor_user_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  insert into public.notification_recipients (
    event_id,
    recipient_user_id,
    deliver_in_app,
    deliver_sound
  )
  select
    v_event_id,
    parsed.recipient_user_id,
    coalesce(parsed.deliver_in_app, true),
    coalesce(parsed.deliver_sound, false)
  from (
    select distinct on (recipient_user_id)
      recipient_user_id,
      deliver_in_app,
      deliver_sound
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as x(
      recipient_user_id uuid,
      deliver_in_app boolean,
      deliver_sound boolean
    )
    where recipient_user_id is not null
  ) parsed;

  return v_event_id;
end;
$$;

revoke all on function public.create_notification_event_with_recipients(
  public.notification_kind,
  public.notification_source_kind,
  uuid,
  uuid,
  jsonb,
  jsonb
) from public;
grant execute on function public.create_notification_event_with_recipients(
  public.notification_kind,
  public.notification_source_kind,
  uuid,
  uuid,
  jsonb,
  jsonb
) to postgres, service_role;

-- Realtime publication for notification recipient state changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notification_recipients'
    ) then
      alter publication supabase_realtime add table public.notification_recipients;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notification_events'
    ) then
      alter publication supabase_realtime add table public.notification_events;
    end if;
  end if;
end $$;
