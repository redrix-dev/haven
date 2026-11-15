-- 5 of 9. Social: friend requests, friend links, friendships, blocks, and the
-- privacy rules that decide who may reach whom.

-- ── Tables ──────────────────────────────────────────────────────────────────
-- A request row exists only while it is waiting. Accepting turns it into a
-- friendship; declining or cancelling deletes it. There is no history of
-- answers to keep in step.
create table public.friend_requests (
  id uuid primary key default private.uuid_v7(),
  sender_id uuid not null references public.profiles (id),
  recipient_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint friend_requests_not_self check (sender_id <> recipient_id),
  unique (sender_id, recipient_id)
);
create index friend_requests_recipient on public.friend_requests (recipient_id);
alter table public.friend_requests enable row level security;
create policy "sent or received" on public.friend_requests
  for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));
grant select on public.friend_requests to authenticated;

-- One row per pair, smaller id first, so a pair cannot be stored twice.
create table public.friendships (
  user_low_id uuid not null references public.profiles (id),
  user_high_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (user_low_id, user_high_id),
  constraint friendships_ordered check (user_low_id < user_high_id)
);
create index friendships_high on public.friendships (user_high_id);
alter table public.friendships enable row level security;
create policy "own friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (user_low_id, user_high_id));
grant select on public.friendships to authenticated;

-- Only the person who blocked can see the block.
create table public.blocks (
  blocker_id uuid not null references public.profiles (id),
  blocked_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);
alter table public.blocks enable row level security;
create policy "own blocks" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
grant select on public.blocks to authenticated;

-- A friend link is a person's own invitation to be friends, handed to whoever
-- they choose. Opening one only shows who it is from; the person who opened
-- it decides (answer_friend_link). So a link posted somewhere cannot make
-- anyone friends by a click. Every link expires.
create table public.friend_links (
  id uuid primary key default private.uuid_v7(),
  owner_id uuid not null references public.profiles (id),
  code text not null unique,
  max_uses integer check (max_uses > 0),
  uses integer not null default 0,
  expires_at timestamptz not null,
  -- When the owner was told it expired before it was used up, so they are
  -- told once.
  expiry_noticed_at timestamptz,
  created_at timestamptz not null default now()
);
create index friend_links_owner on public.friend_links (owner_id);
create index friend_links_expiry on public.friend_links (expires_at);
alter table public.friend_links enable row level security;
create policy "own links" on public.friend_links
  for select to authenticated using (owner_id = (select auth.uid()));
grant select on public.friend_links to authenticated;

-- Who declined which link, so the owner hears "declined" once per person and
-- never who it was. Nobody can read it through the API.
create table private.friend_link_declines (
  link_id uuid not null references public.friend_links (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  primary key (link_id, user_id)
);
create index friend_link_declines_user on private.friend_link_declines (user_id);

-- ── Helpers ─────────────────────────────────────────────────────────────────
create function private.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_low_id = least(p_a, p_b) and f.user_high_id = greatest(p_a, p_b)
  );
$$;

create function private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- plpgsql, not sql: community_members is made later, in 6_communities.
create function private.share_a_community(p_a uuid, p_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.community_members a
    join public.community_members b on b.community_id = a.community_id
    where a.user_id = p_a and b.user_id = p_b
  );
end;
$$;

-- ── Privacy rules ───────────────────────────────────────────────────────────
-- Whether p_owner's rule lets p_other in. Every privacy decision comes here,
-- so the scale means the same thing everywhere (1_people, "audience").
create function private.audience_allows(p_audience public.audience, p_owner uuid, p_other uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_owner = p_other then
    return true;
  end if;
  if private.is_blocked_between(p_owner, p_other) then
    return false;
  end if;
  return case p_audience
    when 'everyone' then true
    when 'community' then private.are_friends(p_owner, p_other) or private.share_a_community(p_owner, p_other)
    when 'friends' then private.are_friends(p_owner, p_other)
    else false
  end;
end;
$$;

-- One per rule, so a call site reads as what it asks.
create function private.can_see_details(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.audience_allows(s.details_visible_to, p_owner, p_viewer)
     from public.user_settings s where s.user_id = p_owner),
    false);
$$;

create function private.can_message(p_recipient uuid, p_sender uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.audience_allows(s.dms_from, p_recipient, p_sender)
     from public.user_settings s where s.user_id = p_recipient),
    false);
$$;

create function private.can_friend_request(p_recipient uuid, p_sender uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.audience_allows(s.friend_requests_from, p_recipient, p_sender)
     from public.user_settings s where s.user_id = p_recipient),
    false);
$$;

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Both people hear about a request or a friendship. Only the blocker hears
-- about a block.
create function private.on_social_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_verb text := case tg_op when 'INSERT' then 'created' else 'deleted' end;
begin
  if tg_table_name = 'friend_requests' then
    perform private.broadcast(
      array[(v_row ->> 'sender_id')::uuid, (v_row ->> 'recipient_id')::uuid],
      'friend_request.' || v_verb, v_row);
  elsif tg_table_name = 'friendships' then
    perform private.broadcast(
      array[(v_row ->> 'user_low_id')::uuid, (v_row ->> 'user_high_id')::uuid],
      'friendship.' || v_verb, v_row);
  else
    perform private.broadcast(array[(v_row ->> 'blocker_id')::uuid], 'block.' || v_verb, v_row);
  end if;
  return null;
end;
$$;
create trigger friend_requests_announce after insert or delete on public.friend_requests
  for each row execute function private.on_social_change();
create trigger friendships_announce after insert or delete on public.friendships
  for each row execute function private.on_social_change();
create trigger blocks_announce after insert or delete on public.blocks
  for each row execute function private.on_social_change();

-- A link made, used, expired or revoked: the owner's devices load their links
-- again. Nobody else hears about a link.
create function private.on_friend_links_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    array(select distinct c.owner_id from changed c), 'friend_links.changed', '{}'::jsonb);
  return null;
end;
$$;
create trigger friend_links_added after insert on public.friend_links
  referencing new table as changed
  for each statement execute function private.on_friend_links_changed();
create trigger friend_links_changed after update on public.friend_links
  referencing new table as changed
  for each statement execute function private.on_friend_links_changed();
create trigger friend_links_removed after delete on public.friend_links
  referencing old table as changed
  for each statement execute function private.on_friend_links_changed();

-- ── RPCs ────────────────────────────────────────────────────────────────────
-- Find one person by their exact name, to add them. Exact match only, so this
-- cannot be used to browse who is on Haven.
create function public.find_user(p_username text)
returns setof public.profile_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  return query
  select (private.profile_record(p)).*
  from public.profiles p
  where lower(p.username) = lower(private.clean_text(p_username))
    and p.id <> v_me
    and not private.is_blocked_between(v_me, p.id);
end;
$$;

create function private.make_friends(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.friendships (user_low_id, user_high_id)
  values (least(p_a, p_b), greatest(p_a, p_b))
  on conflict do nothing;
  delete from public.friend_requests r
  where (r.sender_id = p_a and r.recipient_id = p_b) or (r.sender_id = p_b and r.recipient_id = p_a);
end;
$$;

-- Ask someone to be friends. If they already asked you, this accepts, whatever
-- their rule says: they asked first. Otherwise their friend_requests_from has
-- to let you in.
-- Returns the request, or nothing when it made you friends straight away.
create function public.send_friend_request(p_user_id uuid)
returns setof public.friend_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_my_name text;
  v_row public.friend_requests;
begin
  if p_user_id is null or p_user_id = v_me
     or not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null)
     -- A block looks the same as "no such person" from the other side.
     or private.is_blocked_between(v_me, p_user_id) then
    perform private.fail('not_found', 'user_not_found', 'That person could not be found.');
  end if;
  if private.are_friends(v_me, p_user_id) then
    perform private.fail('conflict', 'already_friends', 'You are already friends.');
  end if;
  select p.username into v_my_name from public.profiles p where p.id = v_me;

  if exists (select 1 from public.friend_requests r where r.sender_id = p_user_id and r.recipient_id = v_me) then
    perform private.make_friends(v_me, p_user_id);
    perform private.notify(p_user_id, 'friend_accepted', v_me, 'Friend request accepted',
                           v_my_name || ' accepted your friend request.');
    return;
  end if;
  if not private.can_friend_request(p_user_id, v_me) then
    perform private.fail('forbidden', 'requests_closed', 'This person is not taking friend requests.');
  end if;

  perform private.rate_limit(v_me, 'send_friend_request', 20, interval '10 minutes');
  insert into public.friend_requests (sender_id, recipient_id) values (v_me, p_user_id)
  on conflict (sender_id, recipient_id) do nothing
  returning * into v_row;
  if v_row.id is null then
    perform private.fail('conflict', 'request_already_sent', 'You already sent this person a request.');
  end if;
  perform private.notify(p_user_id, 'friend_request', v_me, 'Friend request',
                         v_my_name || ' sent you a friend request.');
  return next v_row;
end;
$$;

-- Accept (recipient), decline (recipient) or cancel (sender) a waiting request.
create function public.answer_friend_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_request public.friend_requests;
  v_my_name text;
begin
  select * into v_request from public.friend_requests r where r.id = p_request_id for update;
  if v_request.id is null or v_me not in (v_request.sender_id, v_request.recipient_id) then
    perform private.fail('not_found', 'request_not_found', 'That request no longer exists.');
  end if;
  if coalesce(p_accept, false) then
    if v_request.recipient_id <> v_me then
      perform private.fail('forbidden', 'not_your_request', 'Only the person asked can accept.');
    end if;
    perform private.make_friends(v_request.sender_id, v_request.recipient_id);
    select p.username into v_my_name from public.profiles p where p.id = v_me;
    perform private.notify(v_request.sender_id, 'friend_accepted', v_me, 'Friend request accepted',
                           v_my_name || ' accepted your friend request.');
  else
    delete from public.friend_requests r where r.id = p_request_id;
  end if;
  -- The request is answered, so the notice about it is no longer news.
  update public.notifications n
  set dismissed_at = coalesce(n.dismissed_at, now())
  where n.kind = 'friend_request'
    and n.recipient_id = v_request.recipient_id
    and n.actor_id = v_request.sender_id
    and n.dismissed_at is null;
end;
$$;

create function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  delete from public.friendships f
  where f.user_low_id = least(v_me, p_user_id) and f.user_high_id = greatest(v_me, p_user_id);
end;
$$;

-- Blocking ends the friendship and any waiting request between the two, and
-- from then on neither can message, mention or find the other.
create function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if p_user_id is null or p_user_id = v_me
     or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    perform private.fail('not_found', 'user_not_found', 'That person could not be found.');
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_me, p_user_id) on conflict do nothing;
  delete from public.friendships f
  where f.user_low_id = least(v_me, p_user_id) and f.user_high_id = greatest(v_me, p_user_id);
  delete from public.friend_requests r
  where (r.sender_id = v_me and r.recipient_id = p_user_id) or (r.sender_id = p_user_id and r.recipient_id = v_me);
  update public.notifications n
  set dismissed_at = coalesce(n.dismissed_at, now())
  where n.dismissed_at is null
    and ((n.recipient_id = v_me and n.actor_id = p_user_id) or (n.recipient_id = p_user_id and n.actor_id = v_me));
end;
$$;

create function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  delete from public.blocks b where b.blocker_id = v_me and b.blocked_id = p_user_id;
end;
$$;

-- ── RPCs: friend links ──────────────────────────────────────────────────────
-- Uses defaults to one, and a link lasts between an hour and 30 days (a week
-- unless asked). Posting a link with more uses is the owner's own choice.
create function public.create_friend_link(
  p_max_uses integer default 1,
  p_expires_in_hours integer default 168
)
returns public.friend_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.friend_links;
begin
  if p_max_uses is not null and p_max_uses < 1 then
    perform private.fail('invalid', 'max_uses_invalid', 'The number of uses must be at least 1.');
  end if;
  if p_expires_in_hours is null or p_expires_in_hours not between 1 and 720 then
    perform private.fail('invalid', 'expiry_invalid', 'A friend link lasts between an hour and 30 days.');
  end if;
  perform private.rate_limit(v_me, 'create_friend_link', 20, interval '1 hour');
  insert into public.friend_links (owner_id, code, max_uses, expires_at)
  values (v_me, private.new_invite_code(), p_max_uses, now() + make_interval(hours => p_expires_in_hours))
  returning * into v_row;
  return v_row;
end;
$$;

create function public.revoke_friend_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  delete from public.friend_links l where l.id = p_link_id and l.owner_id = v_me;
end;
$$;

-- The link a code names, while it can still be used by this person, locked
-- for the answer. Every way it can fail gives the same answer, like a
-- community invite; a block between the two looks the same as a dead link.
create function private.usable_friend_link(p_code text, p_me uuid)
returns public.friend_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.friend_links;
begin
  select * into v_link from public.friend_links l
  where l.code = upper(private.clean_text(p_code)) for update;
  if v_link.id is not null and v_link.owner_id = p_me then
    perform private.fail('invalid', 'own_link', 'This is your own friend link.');
  end if;
  if v_link.id is null
     or v_link.expires_at <= now()
     or (v_link.max_uses is not null and v_link.uses >= v_link.max_uses)
     or private.is_blocked_between(v_link.owner_id, p_me) then
    perform private.fail('not_found', 'link_invalid', 'That friend link is not valid any more.');
  end if;
  return v_link;
end;
$$;

create type public.friend_link_record as (
  owner_id uuid,
  username text,
  avatar_media_id uuid,
  already_friends boolean
);

-- What the app shows when a link is opened: who it is from. Opening it does
-- nothing else; the owner is not told.
create function public.get_friend_link(p_code text)
returns public.friend_link_record
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_link public.friend_links := private.usable_friend_link(p_code, v_me);
begin
  return (
    select row(p.id, p.username, p.avatar_media_id, private.are_friends(v_me, p.id))::public.friend_link_record
    from public.profiles p where p.id = v_link.owner_id
  );
end;
$$;

-- Accepting makes the two friends and uses the link once; the owner is told
-- who. Declining uses nothing, and the owner is told only that someone
-- declined, once per person. Neither looks at the opener's own rules: they
-- chose to open it.
create function public.answer_friend_link(p_code text, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_link public.friend_links;
  v_my_name text;
begin
  perform private.rate_limit(v_me, 'answer_friend_link', 20, interval '10 minutes');
  v_link := private.usable_friend_link(p_code, v_me);
  if coalesce(p_accept, false) then
    if private.are_friends(v_me, v_link.owner_id) then
      return;
    end if;
    perform private.make_friends(v_me, v_link.owner_id);
    update public.friend_links l set uses = l.uses + 1 where l.id = v_link.id;
    select p.username into v_my_name from public.profiles p where p.id = v_me;
    perform private.notify(v_link.owner_id, 'friend_accepted', v_me, 'Friend link accepted',
                           v_my_name || ' accepted your friend link. You are now friends.');
  else
    insert into private.friend_link_declines (link_id, user_id) values (v_link.id, v_me)
    on conflict do nothing;
    if found then
      perform private.notify(v_link.owner_id, 'friend_link', null, 'Friend link declined',
                             'Someone declined your friend link.');
    end if;
  end if;
end;
$$;

-- Daily (private.sweep): tell owners about links that ran out before they
-- were used up, then drop links a week after they expired.
create function private.sweep_expired_friend_links()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  for v_owner_id in
    update public.friend_links l
    set expiry_noticed_at = now()
    where l.expires_at <= now()
      and l.expiry_noticed_at is null
      and (l.max_uses is null or l.uses < l.max_uses)
    returning l.owner_id
  loop
    perform private.notify(v_owner_id, 'friend_link', null, 'Friend link expired', 'Your friend link expired.');
  end loop;
  delete from public.friend_links l where l.expires_at < now() - interval '7 days';
end;
$$;

grant execute on function public.find_user(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.answer_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.create_friend_link(integer, integer) to authenticated;
grant execute on function public.revoke_friend_link(uuid) to authenticated;
grant execute on function public.get_friend_link(text) to authenticated;
grant execute on function public.answer_friend_link(text, boolean) to authenticated;
