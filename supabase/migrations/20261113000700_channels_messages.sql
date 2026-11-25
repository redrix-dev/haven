-- 7 of 9. Channels and messages. A text channel in a community and a direct
-- conversation between two friends are the same thing with a different
-- audience, so they share one channels table and one messages table.
-- (Discord, Stoat, Spacebar and Mattermost all model a DM as a channel.)

-- ── Channels ────────────────────────────────────────────────────────────────
create type public.channel_kind as enum ('text', 'voice', 'dm');

create table public.channels (
  id uuid primary key default private.uuid_v7(),
  kind public.channel_kind not null,
  -- Null for a direct conversation.
  community_id uuid references public.communities (id) on delete cascade,
  category_id uuid,
  name text check (char_length(name) between 1 and 64),
  topic text check (char_length(topic) <= 1000),
  position integer not null default 0,
  -- For a direct conversation: "<smaller user id>:<larger user id>". Unique,
  -- so two people have exactly one conversation.
  direct_key text unique,
  -- The id of the newest message ever sent here. Ids sort by time, so
  -- "is there something I have not read" is latest_message_id > the id I
  -- last read, with no counting. It is a high-water mark, not a reference:
  -- it stays when that message is deleted.
  latest_message_id uuid,
  created_at timestamptz not null default now(),
  unique (id, community_id),
  foreign key (category_id, community_id)
    references public.channel_categories (id, community_id) on delete set null (category_id),
  constraint channels_shape check (
    (kind = 'dm' and community_id is null and name is null and direct_key is not null)
    or (kind <> 'dm' and community_id is not null and name is not null and direct_key is null)
  )
);
create index channels_community on public.channels (community_id) where community_id is not null;

-- The people in a direct conversation.
create table public.channel_participants (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index channel_participants_user on public.channel_participants (user_id);

-- An exception on one channel, for one role or for one member. Each of the
-- three answers is yes, no, or null for "no exception".
create table public.channel_overwrites (
  id uuid primary key default private.uuid_v7(),
  channel_id uuid not null,
  community_id uuid not null,
  role_id uuid,
  user_id uuid,
  can_view boolean,
  can_send boolean,
  can_manage boolean,
  foreign key (channel_id, community_id) references public.channels (id, community_id) on delete cascade,
  foreign key (role_id, community_id) references public.roles (id, community_id) on delete cascade,
  foreign key (community_id, user_id) references public.community_members (community_id, user_id) on delete cascade,
  constraint channel_overwrites_one_target check ((role_id is null) <> (user_id is null)),
  unique (channel_id, role_id),
  unique (channel_id, user_id)
);
create index channel_overwrites_community on public.channel_overwrites (community_id);

-- One person's own state in one channel: how far they have read, and whether
-- they muted it. Works the same for a community channel and a conversation.
create table public.channel_user_state (
  user_id uuid not null references public.profiles (id),
  channel_id uuid not null references public.channels (id) on delete cascade,
  last_read_message_id uuid,
  muted_until timestamptz,
  primary key (user_id, channel_id)
);
-- Deleting a channel removes everyone's state in it.
create index channel_user_state_channel on public.channel_user_state (channel_id);

-- ── Who can see and send: one definition ────────────────────────────────────
-- One row per (community channel, member) with the three answers. Every
-- check in the database, for one person or for a whole audience, reads this
-- view, so there is a single statement of the rule:
--   1. the owner can do everything;
--   2. else an exception for this member decides;
--   3. else exceptions for the member's roles decide, and a "no" from any
--      role beats a "yes" from another;
--   4. else an exception for the everyone role decides;
--   5. else the community-wide permission decides.
-- Sending and managing also need seeing.
create view private.channel_access as
select
  ch.id as channel_id,
  ch.community_id,
  m.user_id,
  (co.owner_id = m.user_id) or resolved.can_view as can_view,
  (co.owner_id = m.user_id) or (resolved.can_view and resolved.can_send) as can_send,
  (co.owner_id = m.user_id) or (resolved.can_view and resolved.can_manage) as can_manage
from public.channels ch
join public.communities co on co.id = ch.community_id
join public.community_members m on m.community_id = ch.community_id
left join public.channel_overwrites mine on mine.channel_id = ch.id and mine.user_id = m.user_id
left join lateral (
  select
    case when bool_or(o.can_view = false) then false when bool_or(o.can_view) then true end as can_view,
    case when bool_or(o.can_send = false) then false when bool_or(o.can_send) then true end as can_send,
    case when bool_or(o.can_manage = false) then false when bool_or(o.can_manage) then true end as can_manage
  from public.member_roles mr
  join public.channel_overwrites o on o.channel_id = ch.id and o.role_id = mr.role_id
  where mr.community_id = m.community_id and mr.user_id = m.user_id
) by_role on true
left join lateral (
  select o.can_view, o.can_send, o.can_manage
  from public.roles r
  join public.channel_overwrites o on o.channel_id = ch.id and o.role_id = r.id
  where r.community_id = ch.community_id and r.is_everyone
) everyone on true
cross join lateral (
  select
    coalesce(bool_or(rp.permission = 'view_channels'), false) as can_view,
    coalesce(bool_or(rp.permission = 'send_messages'), false) as can_send,
    coalesce(bool_or(rp.permission = 'manage_channels'), false) as can_manage
  from public.roles r
  join public.role_permissions rp on rp.role_id = r.id
  where r.community_id = m.community_id
    and (
      r.is_everyone
      or exists (
        select 1 from public.member_roles mr
        where mr.community_id = m.community_id and mr.user_id = m.user_id and mr.role_id = r.id
      )
    )
) base
cross join lateral (
  select
    coalesce(mine.can_view, by_role.can_view, everyone.can_view, base.can_view) as can_view,
    coalesce(mine.can_send, by_role.can_send, everyone.can_send, base.can_send) as can_send,
    coalesce(mine.can_manage, by_role.can_manage, everyone.can_manage, base.can_manage) as can_manage
) resolved;

create function private.can_view_channel(p_channel_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.can_view from private.channel_access a where a.channel_id = p_channel_id and a.user_id = p_user_id),
    exists (
      select 1 from public.channel_participants cp
      where cp.channel_id = p_channel_id and cp.user_id = p_user_id
    )
  );
$$;

create function private.can_manage_channel(p_channel_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.can_manage from private.channel_access a where a.channel_id = p_channel_id and a.user_id = p_user_id),
    false);
$$;

-- Sending. In a community: the rule above, in a text channel. In a direct
-- conversation: either person's dms_from lets the other in (a block beats
-- both, in private.audience_allows). Either, so you can always answer someone you let message
-- you; when neither rule does (a friendship ended between two "friends"
-- people), it closes for both. Asked on every message, so a tighter rule
-- holds from the next one. Starting a conversation is stricter (open_dm).
create function private.can_send_in_channel(p_channel_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case ch.kind
    when 'text' then coalesce(
      (select a.can_send from private.channel_access a where a.channel_id = ch.id and a.user_id = p_user_id),
      false)
    when 'dm' then exists (
      select 1
      from public.channel_participants me
      join public.channel_participants them on them.channel_id = me.channel_id and them.user_id <> me.user_id
      where me.channel_id = ch.id
        and me.user_id = p_user_id
        and (private.can_message(them.user_id, me.user_id) or private.can_message(me.user_id, them.user_id))
    )
    else false
  end
  from public.channels ch
  where ch.id = p_channel_id;
$$;

-- Everyone who can see a channel: the audience for its realtime events.
create function private.channel_viewer_ids(p_channel_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(v.user_id), '{}'::uuid[])
  from (
    select a.user_id from private.channel_access a where a.channel_id = p_channel_id and a.can_view
    union all
    select cp.user_id from public.channel_participants cp where cp.channel_id = p_channel_id
  ) v;
$$;

-- Every channel the caller can see, computed once per query for RLS.
create function private.my_channel_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.channel_id from private.channel_access a where a.user_id = auth.uid() and a.can_view
  union all
  select cp.channel_id from public.channel_participants cp where cp.user_id = auth.uid();
$$;

grant execute on function private.my_channel_ids() to authenticated;
grant execute on function private.can_view_channel(uuid, uuid) to authenticated;

-- ── Row level security ──────────────────────────────────────────────────────
alter table public.channels enable row level security;
alter table public.channel_participants enable row level security;
alter table public.channel_overwrites enable row level security;
alter table public.channel_user_state enable row level security;

create policy "viewable" on public.channels
  for select to authenticated using (id in (select private.my_channel_ids()));
create policy "own conversations" on public.channel_participants
  for select to authenticated using (channel_id in (select private.my_channel_ids()));
create policy "permission managers" on public.channel_overwrites
  for select to authenticated
  using (private.has_permission(community_id, (select auth.uid()), 'manage_channel_permissions'));
create policy "own" on public.channel_user_state
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.channels, public.channel_participants, public.channel_overwrites,
  public.channel_user_state to authenticated;

-- Voice presence: who is in a voice room is shared on the realtime topic
-- "voice:<channel id>". Joining that topic needs the right to see the channel.
-- The channel a voice topic names, or null for any other topic. "case" so the
-- text is only read as an id once it is known to look like one.
create function private.voice_topic_channel(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^voice:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then substring(p_topic from 7)::uuid
  end;
$$;
grant execute on function private.voice_topic_channel(text) to authenticated;

-- Listening needs the right to see the channel; so does announcing yourself,
-- and presence is the only thing a client may send.
create policy "voice room presence" on realtime.messages
  for all to authenticated
  using (
    realtime.messages.extension in ('presence', 'broadcast')
    and private.can_view_channel(private.voice_topic_channel(realtime.topic()), (select auth.uid()))
  )
  with check (
    realtime.messages.extension = 'presence'
    and private.can_view_channel(private.voice_topic_channel(realtime.topic()), (select auth.uid()))
  );

-- ── Channel realtime ────────────────────────────────────────────────────────
-- A channel's events go to the people who can see it. A change to the
-- high-water mark is not an event; the message that caused it is.
create function private.announce_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- When the whole community is going this reaches nobody, which is right
    -- (community.deleted covered it): the audience is worked out through the
    -- community's row, and that is already gone.
    perform private.broadcast(private.channel_viewer_ids(old.id), 'channel.deleted', to_jsonb(old));
    return old;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'latest_message_id') = (to_jsonb(old) - 'latest_message_id') then
    return new;
  end if;
  perform private.broadcast(
    private.channel_viewer_ids(new.id),
    case tg_op when 'INSERT' then 'channel.created' else 'channel.updated' end,
    to_jsonb(new));
  return new;
end;
$$;
-- "before delete" so the audience can still be worked out.
create trigger channels_announce_deleted before delete on public.channels
  for each row execute function private.announce_channel();
create trigger channels_announce after insert or update on public.channels
  for each row execute function private.announce_channel();

create trigger channel_overwrites_access_ins after insert on public.channel_overwrites
  referencing new table as changed_rows for each statement execute function private.announce_access_changed();
create trigger channel_overwrites_access_upd after update on public.channel_overwrites
  referencing new table as changed_rows for each statement execute function private.announce_access_changed();
create trigger channel_overwrites_access_del after delete on public.channel_overwrites
  referencing old table as changed_rows for each statement execute function private.announce_access_changed();

-- ── Messages ────────────────────────────────────────────────────────────────
-- Shared cache of what a link looks like, one row per address.
create type public.link_preview_status as enum ('pending', 'ready', 'unsupported', 'failed');

create table public.link_previews (
  id uuid primary key default private.uuid_v7(),
  url text not null unique check (char_length(url) <= 2000),
  status public.link_preview_status not null default 'pending',
  title text,
  description text,
  site_name text,
  -- Path of the cached picture in the public 'previews' bucket.
  image_path text,
  -- For a video link the app can play in place: 'youtube' or 'vimeo' and its id.
  embed_provider text check (embed_provider in ('youtube', 'vimeo')),
  embed_id text,
  error text,
  fetched_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.link_previews enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('previews', 'previews', true, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

create table public.messages (
  id uuid primary key default private.uuid_v7(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  -- Empty only when the message is just files.
  body text not null check (char_length(body) <= 4000),
  reply_to_id uuid references public.messages (id) on delete set null,
  link_preview_id uuid references public.link_previews (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  -- Picked by the app for each send, so it can recognise its own message when
  -- the answer or the event comes back, and so a retried send is sent once.
  -- The id stays the database's: ids are time-ordered, and a phone's clock
  -- cannot be trusted with that. Null for messages not sent by an app.
  nonce uuid
);
-- The page of a channel, newest first, straight off one index.
create index messages_channel on public.messages (channel_id, id desc);
create index messages_author on public.messages (author_id, id desc);
-- One message per send: the same nonce twice from one person is a retry.
create unique index messages_author_nonce on public.messages (author_id, nonce) where nonce is not null;
-- Deleting a message clears reply_to_id on its replies. Without this index
-- every delete would read the whole table to find them.
create index messages_reply_to on public.messages (reply_to_id) where reply_to_id is not null;
create index messages_link_preview on public.messages (link_preview_id) where link_preview_id is not null;
alter table public.messages enable row level security;
-- No policy and no grant: messages are read through list_messages and
-- get_messages, which check access once for the page instead of once per row.

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  emoji text not null check (char_length(emoji) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;

alter table public.media
  add constraint media_message_fk foreign key (message_id) references public.messages (id) on delete set null;
alter table public.notifications
  add constraint notifications_community_fk foreign key (community_id) references public.communities (id) on delete cascade,
  add constraint notifications_channel_fk foreign key (channel_id) references public.channels (id) on delete cascade,
  add constraint notifications_message_fk foreign key (message_id) references public.messages (id) on delete cascade;
create index notifications_message on public.notifications (message_id) where message_id is not null;
create index notifications_channel on public.notifications (channel_id) where channel_id is not null;
create index notifications_community on public.notifications (community_id) where community_id is not null;

-- A deleted message lets go of its files.
create function private.on_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.release_media(m.id) from public.media m where m.message_id = old.id;
  return old;
end;
$$;
create trigger messages_release_media before delete on public.messages
  for each row execute function private.on_message_deleted();

-- ── The message the apps see ────────────────────────────────────────────────
-- One shape for a message everywhere: every read returns it and every
-- realtime event carries it. Files, reactions and the link preview are inside
-- it, so a change to any of them is "this message changed".
create type public.message_record as (
  id uuid,
  channel_id uuid,
  community_id uuid,
  author_id uuid,
  body text,
  reply_to_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  -- True while the author is banned from this community. Only people with
  -- view_hidden_messages are ever sent a hidden message.
  hidden boolean,
  attachments jsonb,  -- [{id, bucket, object_path, filename, mime_type, size_bytes, width, height}]
  reactions jsonb,    -- [{emoji, user_ids}]
  link_preview jsonb, -- {url, title, description, site_name, image_path, embed_provider, embed_id} or null
  nonce uuid          -- what the sending app named this send; see public.messages
);

create function private.message_records(p_message_ids uuid[])
returns setof public.message_record
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, m.channel_id, ch.community_id, m.author_id, m.body, m.reply_to_id, m.created_at, m.edited_at,
    exists (
      select 1 from public.community_bans b
      where b.community_id = ch.community_id and b.user_id = m.author_id
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'bucket', f.bucket, 'object_path', f.object_path, 'filename', f.filename,
        'mime_type', f.mime_type, 'size_bytes', f.size_bytes, 'width', f.width, 'height', f.height
      ) order by f.id)
      from public.media f
      where f.message_id = m.id and f.status = 'attached' and f.withheld_at is null
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('emoji', e.emoji, 'user_ids', e.user_ids) order by e.first_at)
      from (
        select r.emoji, jsonb_agg(r.user_id order by r.created_at) as user_ids, min(r.created_at) as first_at
        from public.message_reactions r
        where r.message_id = m.id
        group by r.emoji
      ) e
    ), '[]'::jsonb),
    (
      select jsonb_build_object(
        'url', lp.url, 'title', lp.title, 'description', lp.description, 'site_name', lp.site_name,
        'image_path', lp.image_path, 'embed_provider', lp.embed_provider, 'embed_id', lp.embed_id)
      from public.link_previews lp
      where lp.id = m.link_preview_id and lp.status = 'ready'
    ),
    m.nonce
  from public.messages m
  join public.channels ch on ch.id = m.channel_id
  where m.id = any (p_message_ids);
$$;

-- Tell everyone who can see the message that it was created or changed.
-- Called by whatever changed it, once the change is complete.
create function private.announce_message(p_message_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.message_record;
  v_audience uuid[];
begin
  select * into v_record from private.message_records(array[p_message_id]);
  if v_record.id is null then
    return;
  end if;
  v_audience := private.channel_viewer_ids(v_record.channel_id);
  if v_record.hidden then
    select coalesce(array_agg(u), '{}'::uuid[]) into v_audience
    from unnest(v_audience) u
    where private.has_permission(v_record.community_id, u, 'view_hidden_messages');
  end if;
  perform private.broadcast(v_audience, p_event, to_jsonb(v_record));
end;
$$;

-- ── Channel RPCs ────────────────────────────────────────────────────────────
create function private.create_channel(
  p_community_id uuid,
  p_kind public.channel_kind,
  p_name text,
  p_topic text,
  p_category_id uuid
)
returns public.channels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := private.clean_text(p_name);
  v_row public.channels;
begin
  if p_kind not in ('text', 'voice') then
    perform private.fail('invalid', 'kind_invalid', 'A community channel is text or voice.');
  end if;
  if v_name is null or char_length(v_name) > 64 then
    perform private.fail('invalid', 'name_invalid', 'A channel name is 1 to 64 characters.');
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.channel_categories c where c.id = p_category_id and c.community_id = p_community_id
  ) then
    perform private.fail('not_found', 'category_not_found', 'That category could not be found.');
  end if;
  insert into public.channels (kind, community_id, category_id, name, topic, position)
  values (
    p_kind, p_community_id, p_category_id, v_name, private.clean_text(p_topic),
    coalesce((select max(c.position) + 1 from public.channels c where c.community_id = p_community_id), 0)
  )
  returning * into v_row;
  return v_row;
end;
$$;

create function public.create_channel(
  p_community_id uuid,
  p_kind public.channel_kind,
  p_name text,
  p_topic text default null,
  p_category_id uuid default null
)
returns public.channels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.channels;
begin
  perform private.require_permission(p_community_id, v_me, 'manage_channels');
  v_row := private.create_channel(p_community_id, p_kind, p_name, p_topic, p_category_id);
  perform private.audit(p_community_id, v_me, 'channel_changed', null, v_row.id, jsonb_build_object('change', 'created'));
  return v_row;
end;
$$;

-- The channel, if this person may manage it. A channel they cannot even see
-- is reported as not found.
create function private.require_manageable_channel(p_channel_id uuid, p_user_id uuid)
returns public.channels
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.channels;
begin
  select * into v_row from public.channels c where c.id = p_channel_id;
  if v_row.id is null or v_row.kind = 'dm' or not private.can_view_channel(p_channel_id, p_user_id) then
    perform private.fail('not_found', 'channel_not_found', 'That channel could not be found.');
  end if;
  if not private.can_manage_channel(p_channel_id, p_user_id) then
    perform private.fail('forbidden', 'missing_permission', 'You do not have permission to do that.');
  end if;
  return v_row;
end;
$$;

-- Rename or re-describe. An empty topic clears it; null leaves it alone.
create function public.update_channel(p_channel_id uuid, p_name text default null, p_topic text default null)
returns public.channels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.channels := private.require_manageable_channel(p_channel_id, v_me);
begin
  if p_name is not null and (private.clean_text(p_name) is null or char_length(private.clean_text(p_name)) > 64) then
    perform private.fail('invalid', 'name_invalid', 'A channel name is 1 to 64 characters.');
  end if;
  update public.channels c
  set name = coalesce(private.clean_text(p_name), c.name),
      topic = case when p_topic is null then c.topic else private.clean_text(p_topic) end
  where c.id = p_channel_id
  returning * into v_row;
  perform private.audit(v_row.community_id, v_me, 'channel_changed', null, v_row.id, jsonb_build_object('change', 'updated'));
  return v_row;
end;
$$;

-- Put a channel in a category (null for none) at a position.
create function public.move_channel(p_channel_id uuid, p_category_id uuid, p_position integer)
returns public.channels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.channels := private.require_manageable_channel(p_channel_id, v_me);
begin
  if p_category_id is not null and not exists (
    select 1 from public.channel_categories c where c.id = p_category_id and c.community_id = v_row.community_id
  ) then
    perform private.fail('not_found', 'category_not_found', 'That category could not be found.');
  end if;
  update public.channels c
  set category_id = p_category_id, position = coalesce(p_position, c.position)
  where c.id = p_channel_id
  returning * into v_row;
  perform private.audit(v_row.community_id, v_me, 'channel_changed', null, v_row.id, jsonb_build_object('change', 'moved'));
  return v_row;
end;
$$;

create function public.delete_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.channels := private.require_manageable_channel(p_channel_id, v_me);
begin
  delete from public.channels c where c.id = p_channel_id;
  perform private.audit(v_row.community_id, v_me, 'channel_changed', null, v_row.id,
                        jsonb_build_object('change', 'deleted', 'name', v_row.name));
end;
$$;

-- Set the exception for one role or one member on a channel. All three
-- answers null removes it. The target must be below the person setting it
-- (the everyone role always is).
create function public.set_channel_overwrite(
  p_channel_id uuid,
  p_role_id uuid,
  p_user_id uuid,
  p_can_view boolean,
  p_can_send boolean,
  p_can_manage boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_channel public.channels;
begin
  select * into v_channel from public.channels c where c.id = p_channel_id and c.kind <> 'dm';
  if v_channel.id is null or not private.is_member(v_channel.community_id, v_me) then
    perform private.fail('not_found', 'channel_not_found', 'That channel could not be found.');
  end if;
  perform private.require_permission(v_channel.community_id, v_me, 'manage_channel_permissions');
  if (p_role_id is null) = (p_user_id is null) then
    perform private.fail('invalid', 'target_invalid', 'Name one role or one member.');
  end if;
  if p_user_id is not null then
    perform private.require_outranks(v_channel.community_id, v_me, p_user_id);
  elsif not exists (
    select 1 from public.roles r
    where r.id = p_role_id and r.community_id = v_channel.community_id
      and r.position < private.rank(v_channel.community_id, v_me)
  ) then
    perform private.fail('forbidden', 'outranked', 'That role is not below you.');
  end if;

  delete from public.channel_overwrites o
  where o.channel_id = p_channel_id
    and o.role_id is not distinct from p_role_id
    and o.user_id is not distinct from p_user_id;
  if coalesce(p_can_view, p_can_send, p_can_manage) is not null then
    insert into public.channel_overwrites (channel_id, community_id, role_id, user_id, can_view, can_send, can_manage)
    values (p_channel_id, v_channel.community_id, p_role_id, p_user_id, p_can_view, p_can_send, p_can_manage);
  end if;
  perform private.audit(v_channel.community_id, v_me, 'channel_changed', p_user_id, p_channel_id,
                        jsonb_build_object('change', 'permissions', 'role_id', p_role_id));
end;
$$;

-- ── Voice ───────────────────────────────────────────────────────────────────
-- The database decides who may join a voice channel; the voice service holds
-- who is talking. The function that hands out voice tokens calls this as the
-- person asking, so a restricted account is refused here like everywhere else.
-- It also says who is asking, so that function never reads a token itself.
create function public.get_voice_access(p_channel_id uuid)
returns table (
  channel_id uuid, community_id uuid, channel_name text, can_moderate boolean,
  user_id uuid, username text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  return query
  select ch.id, ch.community_id, ch.name, private.has_permission(ch.community_id, v_me, 'manage_members'),
         v_me, (select p.username from public.profiles p where p.id = v_me)
  from public.channels ch
  where ch.id = p_channel_id and ch.kind = 'voice' and private.can_view_channel(ch.id, v_me);
  if not found then
    perform private.fail('not_found', 'channel_not_found', 'That voice channel could not be found.');
  end if;
end;
$$;

create type public.voice_control_action as enum ('mute', 'unmute', 'deafen', 'undeafen', 'remove');

-- Mute, deafen or remove one voice session. Anyone may control their own
-- sessions (their other device); controlling someone else needs
-- manage_members and a higher rank. The database authorises it and passes it
-- to that person's topic.
create function public.send_voice_control(
  p_channel_id uuid,
  p_user_id uuid,
  p_session_id text,
  p_action public.voice_control_action
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_channel public.channels;
begin
  select * into v_channel from public.channels c where c.id = p_channel_id and c.kind = 'voice';
  if v_channel.id is null or not private.can_view_channel(p_channel_id, v_me) then
    perform private.fail('not_found', 'channel_not_found', 'That voice channel could not be found.');
  end if;
  if p_session_id is null or char_length(p_session_id) not between 1 and 120 then
    perform private.fail('invalid', 'session_invalid', 'That voice session is not valid.');
  end if;
  if p_user_id is distinct from v_me then
    perform private.require_permission(v_channel.community_id, v_me, 'manage_members');
    perform private.require_outranks(v_channel.community_id, v_me, p_user_id);
  end if;
  perform private.broadcast(array[p_user_id], 'voice.control', jsonb_build_object(
    'channel_id', p_channel_id, 'community_id', v_channel.community_id, 'channel_name', v_channel.name,
    'target_user_id', p_user_id, 'target_session_id', p_session_id,
    'actor_id', v_me, 'actor_name', (select p.username from public.profiles p where p.id = v_me),
    'action', p_action));
end;
$$;

-- Open the conversation with someone. One that already exists always opens,
-- to read; whether you can write in it is can_send_in_channel's call. A new
-- one needs their dms_from to let you in: your own rule being open does not
-- let you start one with anybody.
create function public.open_dm(p_user_id uuid)
returns public.channels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_key text;
  v_row public.channels;
begin
  if p_user_id is null or p_user_id = v_me
     or not exists (select 1 from public.profiles p where p.id = p_user_id)
     -- A block looks the same as "no such person" from the other side.
     or private.is_blocked_between(v_me, p_user_id) then
    perform private.fail('not_found', 'user_not_found', 'That person could not be found.');
  end if;
  v_key := least(v_me, p_user_id)::text || ':' || greatest(v_me, p_user_id)::text;
  select * into v_row from public.channels c where c.direct_key = v_key;
  if v_row.id is not null then
    return v_row;
  end if;
  if not private.can_message(p_user_id, v_me) then
    perform private.fail('forbidden', 'dms_closed', 'This person is not taking messages from you.');
  end if;

  insert into public.channels (kind, direct_key) values ('dm', v_key)
  on conflict (direct_key) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.channels c where c.direct_key = v_key;
    return v_row;
  end if;
  insert into public.channel_participants (channel_id, user_id) values (v_row.id, v_me), (v_row.id, p_user_id);
  -- The channel was announced before it had participants; say it again now
  -- that both people can be found.
  perform private.broadcast(array[v_me, p_user_id], 'channel.created', to_jsonb(v_row));
  return v_row;
end;
$$;

create function public.mark_channel_read(p_channel_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if not private.can_view_channel(p_channel_id, v_me) then
    perform private.fail('not_found', 'channel_not_found', 'That channel could not be found.');
  end if;
  insert into public.channel_user_state as s (user_id, channel_id, last_read_message_id)
  values (v_me, p_channel_id, p_message_id)
  on conflict (user_id, channel_id) do update
    set last_read_message_id = excluded.last_read_message_id
    -- Reading only ever moves forward.
    where s.last_read_message_id is null or s.last_read_message_id < excluded.last_read_message_id;
  if found then
    -- So the person's other devices clear the same badge.
    perform private.broadcast(array[v_me], 'channel.read',
      jsonb_build_object('channel_id', p_channel_id, 'last_read_message_id', p_message_id));
  end if;
end;
$$;

-- Mute until a time. Null unmutes; 'infinity' mutes until unmuted.
create function public.mute_channel(p_channel_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if not private.can_view_channel(p_channel_id, v_me) then
    perform private.fail('not_found', 'channel_not_found', 'That channel could not be found.');
  end if;
  insert into public.channel_user_state (user_id, channel_id, muted_until)
  values (v_me, p_channel_id, p_until)
  on conflict (user_id, channel_id) do update set muted_until = excluded.muted_until;
end;
$$;

-- How many unread messages in each channel that has any, counting to 100.
create function public.get_unread_counts()
returns table (channel_id uuid, unread integer)
language sql
stable
security definer
set search_path = ''
as $$
  select ch.id, counted.unread
  from public.channels ch
  left join public.channel_user_state s on s.channel_id = ch.id and s.user_id = auth.uid()
  cross join lateral (
    select count(*)::integer as unread
    from (
      select 1
      from public.messages m
      where m.channel_id = ch.id
        -- Your own messages are never in here: sending moves your read mark.
        and (s.last_read_message_id is null or m.id > s.last_read_message_id)
      limit 100
    ) capped
  ) counted
  where ch.id in (select private.my_channel_ids())
    and ch.latest_message_id is not null
    and (s.last_read_message_id is null or ch.latest_message_id > s.last_read_message_id)
    and counted.unread > 0;
$$;

-- ── Message RPCs ────────────────────────────────────────────────────────────
-- The first http(s) address in a message, without trailing punctuation.
create function private.first_url(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(regexp_replace((regexp_match(p_body, 'https?://[^\s<>"]+'))[1], '[.,;:!?)\]]+$', ''), 2000);
$$;

-- Point the message at the cached preview for its first link, asking for a
-- fetch when there is none yet or it is more than a week old.
create function private.attach_link_preview(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := private.first_url(p_body);
  v_preview public.link_previews;
begin
  if v_url is null then
    update public.messages m set link_preview_id = null where m.id = p_message_id and m.link_preview_id is not null;
    return;
  end if;
  insert into public.link_previews (url) values (v_url) on conflict (url) do nothing;
  select * into v_preview from public.link_previews lp where lp.url = v_url;
  update public.messages m set link_preview_id = v_preview.id where m.id = p_message_id;
  if v_preview.fetched_at is null or v_preview.fetched_at < now() - interval '7 days' then
    perform private.enqueue_job('link_preview', jsonb_build_object('preview_id', v_preview.id), v_preview.id::text);
  end if;
end;
$$;

-- The message this person already sent with this nonce, or null. A nonce
-- belongs to one send, so the same one in another channel is refused.
create function private.message_sent_with(p_author_id uuid, p_nonce uuid, p_channel_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_message public.messages;
begin
  select * into v_message from public.messages m
  where m.author_id = p_author_id and m.nonce = p_nonce;
  if v_message.id is not null and v_message.channel_id <> p_channel_id then
    perform private.fail('invalid', 'nonce_reused', 'That send was already used for another message.');
  end if;
  return v_message.id;
end;
$$;

-- p_nonce is the app's name for this send (see public.messages). Sending
-- with a nonce already used returns the message it made, sent once.
create function public.send_message(
  p_channel_id uuid,
  p_body text,
  p_reply_to_id uuid default null,
  p_attachment_ids uuid[] default null,
  p_nonce uuid default null
)
returns public.message_record
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_body text := coalesce(private.clean_text(p_body), '');
  v_attachment_ids uuid[] := coalesce(p_attachment_ids, '{}');
  v_channel public.channels;
  v_community_name text;
  v_my_name text;
  v_message_id uuid;
  v_preview text;
  v_record public.message_record;
begin
  select * into v_channel from public.channels c where c.id = p_channel_id;
  if v_channel.id is null or not private.can_view_channel(p_channel_id, v_me) then
    perform private.fail('not_found', 'channel_not_found', 'That channel could not be found.');
  end if;
  -- A retry of a send that went through (its answer was lost) gets that
  -- message back: not a second copy, and not counted against the rate limit.
  v_message_id := private.message_sent_with(v_me, p_nonce, p_channel_id);
  if v_message_id is not null then
    select * into v_record from private.message_records(array[v_message_id]);
    return v_record;
  end if;
  if not private.can_send_in_channel(p_channel_id, v_me) then
    perform private.fail('forbidden', 'cannot_send', 'You cannot send messages here.');
  end if;
  if v_body = '' and cardinality(v_attachment_ids) = 0 then
    perform private.fail('invalid', 'message_empty', 'A message needs some text or a file.');
  end if;
  if char_length(v_body) > 4000 then
    perform private.fail('invalid', 'message_too_long', 'A message is at most 4000 characters.');
  end if;
  if cardinality(v_attachment_ids) > 10 then
    perform private.fail('invalid', 'too_many_files', 'A message holds at most 10 files.');
  end if;
  perform private.rate_limit(v_me, 'send_message', 30, interval '1 minute');

  insert into public.messages (channel_id, author_id, body, reply_to_id, nonce)
  values (
    p_channel_id, v_me, v_body,
    -- A reply to something in another channel, or already gone, is a plain message.
    (select m.id from public.messages m where m.id = p_reply_to_id and m.channel_id = p_channel_id),
    p_nonce
  )
  on conflict (author_id, nonce) where nonce is not null do nothing
  returning id into v_message_id;
  if v_message_id is null then
    -- The same send was running at once (a retry while the first was still
    -- on its way) and finished first. Answer with its message.
    v_message_id := private.message_sent_with(v_me, p_nonce, p_channel_id);
    select * into v_record from private.message_records(array[v_message_id]);
    return v_record;
  end if;

  perform private.claim_upload(a, v_me, 'attachment', v_message_id) from unnest(v_attachment_ids) a;

  perform private.attach_link_preview(v_message_id, v_body);

  update public.channels c set latest_message_id = v_message_id
  where c.id = p_channel_id and (c.latest_message_id is null or c.latest_message_id < v_message_id);
  -- You have read your own message.
  insert into public.channel_user_state as s (user_id, channel_id, last_read_message_id)
  values (v_me, p_channel_id, v_message_id)
  on conflict (user_id, channel_id) do update set last_read_message_id = excluded.last_read_message_id;

  select p.username into v_my_name from public.profiles p where p.id = v_me;
  v_preview := case when v_body = '' then 'Sent a file' else left(v_body, 180) end;

  if v_channel.kind = 'dm' then
    perform private.notify(
      cp.user_id, 'direct_message', v_me, v_my_name, v_preview, null, p_channel_id, v_message_id, null,
      exists (
        select 1 from public.channel_user_state s
        where s.user_id = cp.user_id and s.channel_id = p_channel_id and s.muted_until > now()
      ))
    from public.channel_participants cp
    where cp.channel_id = p_channel_id and cp.user_id <> v_me;
  elsif position('@' in v_body) > 0 then
    -- "@name" tells that member, if they can see this channel, did not mute
    -- it, and there is no block between the two. At most 20 per message.
    select c.name into v_community_name from public.communities c where c.id = v_channel.community_id;
    perform private.notify(
      mentioned.id, 'mention', v_me,
      v_my_name || ' mentioned you in #' || v_channel.name,
      v_preview, v_channel.community_id, p_channel_id, v_message_id, null,
      exists (
        select 1 from public.channel_user_state s
        where s.user_id = mentioned.id and s.channel_id = p_channel_id and s.muted_until > now()
      ))
    from (
      select p.id
      from (
        select distinct lower(hit[1]) as handle
        from regexp_matches(v_body, '(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,32})', 'g') hit
        limit 20
      ) handles
      join public.profiles p on lower(p.username) = handles.handle
      where p.id <> v_me
        and private.can_view_channel(p_channel_id, p.id)
        and not private.is_blocked_between(v_me, p.id)
    ) mentioned;
  end if;

  perform private.announce_message(v_message_id, 'message.created');
  select * into v_record from private.message_records(array[v_message_id]);
  return v_record;
end;
$$;

-- Only the author edits. The link preview follows the new text.
create function public.edit_message(p_message_id uuid, p_body text)
returns public.message_record
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_body text := coalesce(private.clean_text(p_body), '');
  v_message public.messages;
  v_record public.message_record;
begin
  select * into v_message from public.messages m where m.id = p_message_id for update;
  if v_message.id is null or not private.can_view_channel(v_message.channel_id, v_me) then
    perform private.fail('not_found', 'message_not_found', 'That message could not be found.');
  end if;
  if v_message.author_id <> v_me then
    perform private.fail('forbidden', 'not_author', 'You can only edit your own messages.');
  end if;
  if char_length(v_body) > 4000 then
    perform private.fail('invalid', 'message_too_long', 'A message is at most 4000 characters.');
  end if;
  if v_body = '' and not exists (select 1 from public.media f where f.message_id = p_message_id) then
    perform private.fail('invalid', 'message_empty', 'A message needs some text or a file.');
  end if;

  update public.messages m set body = v_body, edited_at = now() where m.id = p_message_id;
  perform private.attach_link_preview(p_message_id, v_body);
  perform private.announce_message(p_message_id, 'message.updated');
  select * into v_record from private.message_records(array[p_message_id]);
  return v_record;
end;
$$;

-- Remove one message and tell its audience. The row and its files are gone
-- for good; nothing of the text is kept anywhere except a safety case that
-- was already filed about it.
create function private.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages;
begin
  select * into v_message from public.messages m where m.id = p_message_id;
  if v_message.id is null then
    return;
  end if;
  perform private.broadcast(
    private.channel_viewer_ids(v_message.channel_id), 'message.deleted',
    jsonb_build_object('id', v_message.id, 'channel_id', v_message.channel_id));
  delete from public.messages m where m.id = p_message_id;
end;
$$;

-- The author deletes their own. In a community, someone with manage_messages
-- can remove anyone's, and that is written to the audit log.
create function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_message public.messages;
  v_community_id uuid;
begin
  select * into v_message from public.messages m where m.id = p_message_id;
  if v_message.id is null or not private.can_view_channel(v_message.channel_id, v_me) then
    perform private.fail('not_found', 'message_not_found', 'That message could not be found.');
  end if;
  if v_message.author_id <> v_me then
    select c.community_id into v_community_id from public.channels c where c.id = v_message.channel_id;
    if v_community_id is null or not private.has_permission(v_community_id, v_me, 'manage_messages') then
      perform private.fail('forbidden', 'missing_permission', 'You can only delete your own messages.');
    end if;
    perform private.audit(v_community_id, v_me, 'message_removed', v_message.author_id, p_message_id,
                          jsonb_build_object('channel_id', v_message.channel_id));
  end if;
  perform private.delete_message(p_message_id);
end;
$$;

-- Add or take back your reaction.
create function public.set_reaction(p_message_id uuid, p_emoji text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_emoji text := private.clean_text(p_emoji);
  v_channel_id uuid;
begin
  select m.channel_id into v_channel_id from public.messages m where m.id = p_message_id;
  if v_channel_id is null or not private.can_view_channel(v_channel_id, v_me) then
    perform private.fail('not_found', 'message_not_found', 'That message could not be found.');
  end if;
  if coalesce(p_on, true) then
    -- Reacting is taking part, so it needs the same right as sending.
    if not private.can_send_in_channel(v_channel_id, v_me) then
      perform private.fail('forbidden', 'cannot_send', 'You cannot react here.');
    end if;
    if v_emoji is null or char_length(v_emoji) > 64 then
      perform private.fail('invalid', 'emoji_invalid', 'That reaction is not valid.');
    end if;
    if (select count(distinct r.emoji) from public.message_reactions r where r.message_id = p_message_id) >= 20
       and not exists (select 1 from public.message_reactions r where r.message_id = p_message_id and r.emoji = v_emoji) then
      perform private.fail('conflict', 'too_many_reactions', 'This message has as many different reactions as it can hold.');
    end if;
    insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, v_me, v_emoji)
    on conflict do nothing;
  else
    delete from public.message_reactions r
    where r.message_id = p_message_id and r.user_id = v_me and r.emoji = v_emoji;
  end if;
  if found then
    perform private.announce_message(p_message_id, 'message.updated');
  end if;
end;
$$;

-- A page of a channel, newest first.
--   p_before_id: the page older than this message (scrolling up).
--   p_after_id:  the next page newer than this message (catching up).
-- Messages by someone banned from the community are left out unless the
-- reader has view_hidden_messages.
create function public.list_messages(
  p_channel_id uuid,
  p_before_id uuid default null,
  p_after_id uuid default null,
  p_limit integer default 50
)
returns setof public.message_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_community_id uuid;
  v_sees_hidden boolean;
  v_ids uuid[];
begin
  if not private.can_view_channel(p_channel_id, v_me) then
    perform private.fail('not_found', 'channel_not_found', 'That channel could not be found.');
  end if;
  select c.community_id into v_community_id from public.channels c where c.id = p_channel_id;
  v_sees_hidden := v_community_id is null
    or private.has_permission(v_community_id, v_me, 'view_hidden_messages');

  select array_agg(page.id) into v_ids
  from (
    select m.id
    from public.messages m
    where m.channel_id = p_channel_id
      and (p_before_id is null or m.id < p_before_id)
      and (p_after_id is null or m.id > p_after_id)
      and (
        v_sees_hidden
        or not exists (
          select 1 from public.community_bans b
          where b.community_id = v_community_id and b.user_id = m.author_id
        )
      )
    order by
      case when p_after_id is not null and p_before_id is null then m.id end asc,
      m.id desc
    limit v_limit
  ) page;

  return query
  select r.* from private.message_records(coalesce(v_ids, '{}')) r order by r.id desc;
end;
$$;

-- Particular messages by id (a reply's target, a notification's subject).
-- Anything the caller may not see is simply not returned.
create function public.get_messages(p_message_ids uuid[])
returns setof public.message_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if coalesce(cardinality(p_message_ids), 0) > 100 then
    perform private.fail('invalid', 'too_many_ids', 'Ask for at most 100 messages at a time.');
  end if;
  return query
  select r.*
  from private.message_records(p_message_ids) r
  where private.can_view_channel(r.channel_id, v_me)
    and (not r.hidden or private.has_permission(r.community_id, v_me, 'view_hidden_messages'));
end;
$$;

-- The newest message of each given channel, for a list of conversations.
create function public.get_latest_messages(p_channel_ids uuid[])
returns setof public.message_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_ids uuid[];
begin
  select array_agg(latest.id) into v_ids
  from unnest(p_channel_ids) wanted (channel_id)
  cross join lateral (
    select m.id from public.messages m
    where m.channel_id = wanted.channel_id
    order by m.id desc
    limit 1
  ) latest
  where wanted.channel_id in (select private.my_channel_ids());
  return query
  select r.* from private.message_records(coalesce(v_ids, '{}')) r
  where not r.hidden or private.has_permission(r.community_id, v_me, 'view_hidden_messages');
end;
$$;

-- ── Files in messages: who may read them ────────────────────────────────────
-- Your own upload, or a file on a message in a channel you can see. A
-- withheld file is served to nobody here.
create function private.can_read_media(p_bucket text, p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media f
    left join public.messages m on m.id = f.message_id
    where f.bucket = p_bucket
      and f.object_path = p_object_path
      and f.withheld_at is null
      and (
        f.owner_id = auth.uid()
        or (f.status = 'attached' and m.id is not null and private.can_view_channel(m.channel_id, auth.uid()))
      )
  );
$$;
grant execute on function private.can_read_media(text, text) to authenticated;

create policy "read files on visible messages" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and private.can_read_media(bucket_id, name));

-- ── Link preview worker ─────────────────────────────────────────────────────
create function public.worker_link_preview_url(p_preview_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lp.url from public.link_previews lp where lp.id = p_preview_id;
$$;

create function public.worker_link_preview_result(
  p_preview_id uuid,
  p_status public.link_preview_status,
  p_title text default null,
  p_description text default null,
  p_site_name text default null,
  p_image_path text default null,
  p_embed_provider text default null,
  p_embed_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id uuid;
begin
  update public.link_previews lp
  set status = p_status, title = left(p_title, 300), description = left(p_description, 1000),
      site_name = left(p_site_name, 100), image_path = p_image_path,
      embed_provider = p_embed_provider, embed_id = p_embed_id, error = p_error, fetched_at = now()
  where lp.id = p_preview_id;
  -- Recent messages showing this link change on screen.
  for v_message_id in
    select m.id from public.messages m
    where m.link_preview_id = p_preview_id and m.created_at > now() - interval '1 day'
    order by m.id desc limit 50
  loop
    perform private.announce_message(v_message_id, 'message.updated');
  end loop;
end;
$$;

-- Fetch a message's link again: its author, or someone with manage_messages.
create function public.refresh_link_preview(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_message public.messages;
  v_community_id uuid;
begin
  select * into v_message from public.messages m where m.id = p_message_id;
  if v_message.id is null or not private.can_view_channel(v_message.channel_id, v_me) then
    perform private.fail('not_found', 'message_not_found', 'That message could not be found.');
  end if;
  select c.community_id into v_community_id from public.channels c where c.id = v_message.channel_id;
  if v_message.author_id <> v_me
     and (v_community_id is null or not private.has_permission(v_community_id, v_me, 'manage_messages')) then
    perform private.fail('forbidden', 'missing_permission', 'You do not have permission to do that.');
  end if;
  perform private.rate_limit(v_me, 'refresh_link_preview', 10, interval '10 minutes');
  if v_message.link_preview_id is not null then
    perform private.enqueue_job('link_preview', jsonb_build_object('preview_id', v_message.link_preview_id),
                                v_message.link_preview_id::text);
  end if;
end;
$$;

grant execute on function public.create_channel(uuid, public.channel_kind, text, text, uuid) to authenticated;
grant execute on function public.update_channel(uuid, text, text) to authenticated;
grant execute on function public.move_channel(uuid, uuid, integer) to authenticated;
grant execute on function public.delete_channel(uuid) to authenticated;
grant execute on function public.set_channel_overwrite(uuid, uuid, uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.get_voice_access(uuid) to authenticated;
grant execute on function public.send_voice_control(uuid, uuid, text, public.voice_control_action) to authenticated;
grant execute on function public.open_dm(uuid) to authenticated;
grant execute on function public.mark_channel_read(uuid, uuid) to authenticated;
grant execute on function public.mute_channel(uuid, timestamptz) to authenticated;
grant execute on function public.get_unread_counts() to authenticated;
grant execute on function public.send_message(uuid, text, uuid, uuid[], uuid) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.set_reaction(uuid, text, boolean) to authenticated;
grant execute on function public.list_messages(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.get_messages(uuid[]) to authenticated;
grant execute on function public.get_latest_messages(uuid[]) to authenticated;
grant execute on function public.refresh_link_preview(uuid) to authenticated;
grant execute on function public.worker_link_preview_url(uuid) to service_role;
grant execute on function public.worker_link_preview_result(
  uuid, public.link_preview_status, text, text, text, text, text, text, text) to service_role;
