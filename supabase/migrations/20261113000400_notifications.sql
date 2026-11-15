-- 4 of 9. Notifications: telling one person that something happened, in the
-- app, with a sound, or on their phone.

create type public.notification_kind as enum (
  'friend_request',
  'friend_accepted',
  -- About a friend link the person made: declined, or expired unused.
  'friend_link',
  'direct_message',
  'mention',
  'report_received',
  'report_outcome',
  'moderation_decision',
  'system'
);

-- ── One row per person told ─────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default private.uuid_v7(),
  recipient_id uuid not null references public.profiles (id),
  kind public.notification_kind not null,
  actor_id uuid references public.profiles (id),
  -- The words are written here, once, so the inbox and the phone say the same
  -- thing and the push worker needs no wording of its own.
  title text not null,
  body text not null,
  -- What it is about, so the app can open the right place. Foreign keys are
  -- added where those tables are made; each one deletes the notification
  -- with the thing it pointed at.
  community_id uuid,
  channel_id uuid,
  message_id uuid,
  case_id uuid,
  -- How it was delivered, decided once when it was created.
  in_app boolean not null,
  sound boolean not null,
  push boolean not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz
);
-- The inbox, newest first. Kept for 90 days (private.sweep_old_notifications).
create index notifications_inbox on public.notifications (recipient_id, id desc);
create index notifications_actor on public.notifications (actor_id) where actor_id is not null;
create index notifications_age on public.notifications (created_at);
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
grant select on public.notifications to authenticated;

-- ── Preferences ─────────────────────────────────────────────────────────────
-- A row exists only where someone changed a default. No row means all three
-- are on. Safety notices (a report's outcome, a moderation decision) cannot be
-- turned off.
create table public.notification_preferences (
  user_id uuid not null references public.profiles (id),
  kind public.notification_kind not null,
  in_app boolean not null default true,
  sound boolean not null default true,
  push boolean not null default true,
  primary key (user_id, kind),
  constraint safety_notices_stay_on check (
    kind in ('friend_request', 'friend_accepted', 'friend_link', 'direct_message', 'mention')
  )
);
alter table public.notification_preferences enable row level security;
create policy "own preferences" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.notification_preferences to authenticated;

-- ── Phones ──────────────────────────────────────────────────────────────────
create table public.push_devices (
  id uuid primary key default private.uuid_v7(),
  user_id uuid not null references public.profiles (id),
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  -- One row per app install: a new token for the same install replaces the old.
  installation_id text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index push_devices_one_per_install on public.push_devices (user_id, installation_id)
  where installation_id is not null;
alter table public.push_devices enable row level security;
create policy "own devices" on public.push_devices
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.push_devices to authenticated;

-- ── Creating one ────────────────────────────────────────────────────────────
-- Every notification in the database is made here. p_muted is for the caller
-- to pass "this person muted that conversation".
create function private.notify(
  p_recipient_id uuid,
  p_kind public.notification_kind,
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_community_id uuid default null,
  p_channel_id uuid default null,
  p_message_id uuid default null,
  p_case_id uuid default null,
  p_muted boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in_app boolean := true;
  v_sound boolean := true;
  v_push boolean := true;
  v_id uuid;
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id or coalesce(p_muted, false) then
    return null;
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_recipient_id and p.deleted_at is null) then
    return null;
  end if;
  select pref.in_app, pref.sound, pref.push into v_in_app, v_sound, v_push
  from public.notification_preferences pref
  where pref.user_id = p_recipient_id and pref.kind = p_kind;
  v_in_app := coalesce(v_in_app, true);
  v_sound := coalesce(v_sound, true);
  v_push := coalesce(v_push, true);
  if not (v_in_app or v_sound or v_push) then
    return null;
  end if;

  insert into public.notifications (
    recipient_id, kind, actor_id, title, body,
    community_id, channel_id, message_id, case_id, in_app, sound, push
  )
  values (
    p_recipient_id, p_kind, p_actor_id, p_title, left(p_body, 500),
    p_community_id, p_channel_id, p_message_id, p_case_id, v_in_app, v_sound, v_push
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Tell the app at once, and queue the phone push.
create function private.on_notification_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(array[new.recipient_id], 'notification.created', to_jsonb(new));
  if new.push and exists (select 1 from public.push_devices d where d.user_id = new.recipient_id) then
    perform private.enqueue_job('push_send', jsonb_build_object('notification_id', new.id), new.id::text);
  end if;
  return null;
end;
$$;
create trigger notifications_created after insert on public.notifications
  for each row execute function private.on_notification_created();

-- Marked or removed, by any path (mark_notifications, an answered friend
-- request, a block, a deleted message): tell the person's other devices that
-- their inbox changed. One event per statement, not per row.
create function private.on_notifications_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    array(select distinct c.recipient_id from changed c), 'notifications.changed', '{}'::jsonb);
  return null;
end;
$$;
create trigger notifications_marked after update on public.notifications
  referencing new table as changed
  for each statement execute function private.on_notifications_changed();
create trigger notifications_removed after delete on public.notifications
  referencing old table as changed
  for each statement execute function private.on_notifications_changed();

-- An inbox is not an archive: a notification is deleted 90 days after it was
-- made, read or not. Called by the daily sweep.
create function private.sweep_old_notifications()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications n where n.created_at < now() - interval '90 days';
$$;

-- ── RPCs ────────────────────────────────────────────────────────────────────
create type public.notification_mark as enum ('seen', 'read', 'dismissed');

-- Mark some notifications, or all of them when p_ids is null. Each mark
-- implies the ones before it: read is also seen, dismissed is also read.
create function public.mark_notifications(p_mark public.notification_mark, p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_count integer;
begin
  update public.notifications n
  set seen_at = coalesce(n.seen_at, now()),
      read_at = case when p_mark in ('read', 'dismissed') then coalesce(n.read_at, now()) else n.read_at end,
      dismissed_at = case when p_mark = 'dismissed' then coalesce(n.dismissed_at, now()) else n.dismissed_at end
  where n.recipient_id = v_me
    and (p_ids is null or n.id = any (p_ids))
    and case p_mark
          when 'seen' then n.seen_at is null
          when 'read' then n.read_at is null
          else n.dismissed_at is null
        end;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.set_notification_preference(
  p_kind public.notification_kind,
  p_in_app boolean,
  p_sound boolean,
  p_push boolean
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.notification_preferences;
begin
  if p_kind not in ('friend_request', 'friend_accepted', 'friend_link', 'direct_message', 'mention') then
    perform private.fail('invalid', 'kind_not_optional', 'That kind of notice cannot be turned off.');
  end if;
  insert into public.notification_preferences as pref (user_id, kind, in_app, sound, push)
  values (v_me, p_kind, coalesce(p_in_app, true), coalesce(p_sound, true), coalesce(p_push, true))
  on conflict (user_id, kind) do update
    set in_app = excluded.in_app, sound = excluded.sound, push = excluded.push
  returning * into v_row;
  return v_row;
end;
$$;

-- A phone token belongs to whoever registered it last.
create function public.register_push_device(p_token text, p_platform text, p_installation_id text default null)
returns public.push_devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_token text := private.clean_text(p_token);
  v_row public.push_devices;
begin
  if v_token is null or p_platform not in ('ios', 'android') then
    perform private.fail('invalid', 'device_invalid', 'That device cannot be registered.');
  end if;
  delete from public.push_devices d
  where d.token = v_token
     or (p_installation_id is not null and d.user_id = v_me and d.installation_id = p_installation_id);
  insert into public.push_devices (user_id, token, platform, installation_id)
  values (v_me, v_token, p_platform, p_installation_id)
  returning * into v_row;
  return v_row;
end;
$$;

create function public.unregister_push_device(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  -- No require_user: a restricted person signing out must still be able to
  -- stop pushes to their phone.
  delete from public.push_devices d where d.token = p_token and d.user_id = v_me;
end;
$$;

-- For the push worker: what to send and where, or nothing if it is no longer
-- wanted (already read, dismissed, or the person is gone).
create function public.worker_push_delivery(p_notification_id uuid)
returns table (token text, platform text, title text, body text, data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select d.token, d.platform, n.title, n.body,
         jsonb_strip_nulls(jsonb_build_object(
           'notification_id', n.id, 'kind', n.kind, 'community_id', n.community_id,
           'channel_id', n.channel_id, 'message_id', n.message_id, 'case_id', n.case_id,
           'sound', n.sound))
  from public.notifications n
  join public.profiles p on p.id = n.recipient_id and p.deleted_at is null
  join public.push_devices d on d.user_id = n.recipient_id
  where n.id = p_notification_id
    and n.push
    and n.read_at is null
    and n.dismissed_at is null;
$$;

-- The push service said this token is dead.
create function public.worker_push_token_invalid(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_devices d where d.token = p_token;
$$;

grant execute on function public.mark_notifications(public.notification_mark, uuid[]) to authenticated;
grant execute on function public.set_notification_preference(public.notification_kind, boolean, boolean, boolean) to authenticated;
grant execute on function public.register_push_device(text, text, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;
grant execute on function public.worker_push_delivery(uuid) to service_role;
grant execute on function public.worker_push_token_invalid(text) to service_role;
