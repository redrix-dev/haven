-- Social graph foundation (Phase 1)
-- Friends, friend requests, and blocks with RLS-first SQL RPCs.
-- Friend request sends emit into the notification foundation.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'friend_request_status'
  ) then
    create type public.friend_request_status as enum (
      'pending',
      'accepted',
      'declined',
      'canceled'
    );
  end if;
end $$;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  responded_by_user_id uuid references public.profiles(id) on delete set null,
  pair_user_low_id uuid not null,
  pair_user_high_id uuid not null,
  check (sender_user_id <> recipient_user_id),
  check (pair_user_low_id <> pair_user_high_id),
  check (pair_user_low_id < pair_user_high_id)
);

create table if not exists public.friendships (
  user_low_id uuid not null references public.profiles(id) on delete cascade,
  user_high_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  created_via_request_id uuid references public.friend_requests(id) on delete set null,
  primary key (user_low_id, user_high_id),
  check (user_low_id < user_high_id)
);

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create or replace function public.friend_requests_set_pair_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.pair_user_low_id := least(new.sender_user_id, new.recipient_user_id);
  new.pair_user_high_id := greatest(new.sender_user_id, new.recipient_user_id);
  return new;
end;
$$;

drop trigger if exists trg_friend_requests_set_pair_columns on public.friend_requests;
create trigger trg_friend_requests_set_pair_columns
before insert or update of sender_user_id, recipient_user_id
on public.friend_requests
for each row execute function public.friend_requests_set_pair_columns();

drop trigger if exists trg_friend_requests_updated_at on public.friend_requests;
create trigger trg_friend_requests_updated_at
before update on public.friend_requests
for each row execute function public.set_updated_at();

create index if not exists idx_friend_requests_recipient_status_created_at
  on public.friend_requests(recipient_user_id, status, created_at desc);

create index if not exists idx_friend_requests_sender_status_created_at
  on public.friend_requests(sender_user_id, status, created_at desc);

create index if not exists idx_friend_requests_pair_status_created_at
  on public.friend_requests(pair_user_low_id, pair_user_high_id, status, created_at desc);

create unique index if not exists idx_friend_requests_unique_pending_pair
  on public.friend_requests(pair_user_low_id, pair_user_high_id)
  where status = 'pending';

create index if not exists idx_friendships_user_low_created_at
  on public.friendships(user_low_id, created_at desc);

create index if not exists idx_friendships_user_high_created_at
  on public.friendships(user_high_id, created_at desc);

create index if not exists idx_user_blocks_blocked_user_id
  on public.user_blocks(blocked_user_id);

create or replace function public.are_friends(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_user_a is null or p_user_b is null or p_user_a = p_user_b then false
      else exists (
        select 1
        from public.friendships f
        where f.user_low_id = least(p_user_a, p_user_b)
          and f.user_high_id = greatest(p_user_a, p_user_b)
      )
    end;
$$;

create or replace function public.is_blocked_either_direction(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_user_a is null or p_user_b is null or p_user_a = p_user_b then false
      else exists (
        select 1
        from public.user_blocks b
        where (b.blocker_user_id = p_user_a and b.blocked_user_id = p_user_b)
           or (b.blocker_user_id = p_user_b and b.blocked_user_id = p_user_a)
      )
    end;
$$;

create or replace function public.count_mutual_communities_for_users(p_user_a uuid, p_user_b uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select count(*)::integer
    from public.community_members me
    join public.community_members other
      on other.community_id = me.community_id
    where me.user_id = p_user_a
      and other.user_id = p_user_b
  ), 0);
$$;

create or replace function public.list_mutual_community_names_for_users(
  p_user_a uuid,
  p_user_b uuid,
  p_limit integer default 3
)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select array_agg(names.name order by names.name)
    from (
      select distinct c.name
      from public.community_members me
      join public.community_members other
        on other.community_id = me.community_id
      join public.communities c
        on c.id = me.community_id
      where me.user_id = p_user_a
        and other.user_id = p_user_b
      order by c.name
      limit greatest(1, least(coalesce(p_limit, 3), 10))
    ) as names
  ), '{}'::text[]);
$$;

revoke all on function public.are_friends(uuid, uuid) from public;
revoke all on function public.is_blocked_either_direction(uuid, uuid) from public;
revoke all on function public.count_mutual_communities_for_users(uuid, uuid) from public;
revoke all on function public.list_mutual_community_names_for_users(uuid, uuid, integer) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_blocked_either_direction(uuid, uuid) to authenticated, service_role;
grant execute on function public.count_mutual_communities_for_users(uuid, uuid) to authenticated, service_role;
grant execute on function public.list_mutual_community_names_for_users(uuid, uuid, integer)
  to authenticated, service_role;

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;

create policy friend_requests_select_participant
on public.friend_requests
for select
to authenticated
using (sender_user_id = auth.uid() or recipient_user_id = auth.uid());

create policy friendships_select_participant
on public.friendships
for select
to authenticated
using (user_low_id = auth.uid() or user_high_id = auth.uid());

create policy user_blocks_select_blocker
on public.user_blocks
for select
to authenticated
using (blocker_user_id = auth.uid());

create or replace function public.get_my_social_counts()
returns table(
  friends_count integer,
  incoming_pending_request_count integer,
  outgoing_pending_request_count integer,
  blocked_user_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    (
      select count(*)::integer
      from public.friendships f
      where f.user_low_id = auth.uid() or f.user_high_id = auth.uid()
    ) as friends_count,
    (
      select count(*)::integer
      from public.friend_requests fr
      where fr.recipient_user_id = auth.uid()
        and fr.status = 'pending'
    ) as incoming_pending_request_count,
    (
      select count(*)::integer
      from public.friend_requests fr
      where fr.sender_user_id = auth.uid()
        and fr.status = 'pending'
    ) as outgoing_pending_request_count,
    (
      select count(*)::integer
      from public.user_blocks ub
      where ub.blocker_user_id = auth.uid()
    ) as blocked_user_count;
$$;

revoke all on function public.get_my_social_counts() from public;
grant execute on function public.get_my_social_counts() to authenticated;

create or replace function public.list_my_friends()
returns table(
  friend_user_id uuid,
  username text,
  avatar_url text,
  friendship_created_at timestamptz,
  mutual_community_count integer,
  mutual_community_names text[]
)
language sql
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as user_id
  ),
  friend_pairs as (
    select
      case
        when f.user_low_id = me.user_id then f.user_high_id
        else f.user_low_id
      end as friend_user_id,
      f.created_at
    from public.friendships f
    cross join me
    where me.user_id is not null
      and (f.user_low_id = me.user_id or f.user_high_id = me.user_id)
  )
  select
    fp.friend_user_id,
    p.username,
    p.avatar_url,
    fp.created_at as friendship_created_at,
    public.count_mutual_communities_for_users(auth.uid(), fp.friend_user_id) as mutual_community_count,
    public.list_mutual_community_names_for_users(auth.uid(), fp.friend_user_id, 3) as mutual_community_names
  from friend_pairs fp
  join public.profiles p
    on p.id = fp.friend_user_id
  where not public.is_blocked_either_direction(auth.uid(), fp.friend_user_id)
  order by lower(p.username), p.id;
$$;

revoke all on function public.list_my_friends() from public;
grant execute on function public.list_my_friends() to authenticated;

create or replace function public.list_my_friend_requests()
returns table(
  request_id uuid,
  direction text,
  status public.friend_request_status,
  sender_user_id uuid,
  sender_username text,
  sender_avatar_url text,
  recipient_user_id uuid,
  recipient_username text,
  recipient_avatar_url text,
  created_at timestamptz,
  mutual_community_count integer,
  mutual_community_names text[]
)
language sql
security definer
set search_path = public
as $$
  select
    fr.id as request_id,
    case when fr.recipient_user_id = auth.uid() then 'incoming' else 'outgoing' end as direction,
    fr.status,
    fr.sender_user_id,
    sender_profile.username as sender_username,
    sender_profile.avatar_url as sender_avatar_url,
    fr.recipient_user_id,
    recipient_profile.username as recipient_username,
    recipient_profile.avatar_url as recipient_avatar_url,
    fr.created_at,
    public.count_mutual_communities_for_users(
      auth.uid(),
      case when fr.recipient_user_id = auth.uid() then fr.sender_user_id else fr.recipient_user_id end
    ) as mutual_community_count,
    public.list_mutual_community_names_for_users(
      auth.uid(),
      case when fr.recipient_user_id = auth.uid() then fr.sender_user_id else fr.recipient_user_id end,
      3
    ) as mutual_community_names
  from public.friend_requests fr
  join public.profiles sender_profile
    on sender_profile.id = fr.sender_user_id
  join public.profiles recipient_profile
    on recipient_profile.id = fr.recipient_user_id
  where fr.status = 'pending'
    and (fr.sender_user_id = auth.uid() or fr.recipient_user_id = auth.uid())
    and not public.is_blocked_either_direction(fr.sender_user_id, fr.recipient_user_id)
  order by fr.created_at desc, fr.id desc;
$$;

revoke all on function public.list_my_friend_requests() from public;
grant execute on function public.list_my_friend_requests() to authenticated;

create or replace function public.list_my_blocked_users()
returns table(
  blocked_user_id uuid,
  username text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    ub.blocked_user_id,
    p.username,
    p.avatar_url,
    ub.created_at as blocked_at
  from public.user_blocks ub
  join public.profiles p
    on p.id = ub.blocked_user_id
  where ub.blocker_user_id = auth.uid()
  order by ub.created_at desc, ub.blocked_user_id;
$$;

revoke all on function public.list_my_blocked_users() from public;
grant execute on function public.list_my_blocked_users() to authenticated;

create or replace function public.search_users_for_friend_add(p_query text)
returns table(
  user_id uuid,
  username text,
  avatar_url text,
  relationship_state text,
  pending_request_id uuid,
  mutual_community_count integer,
  mutual_community_names text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if char_length(v_query) < 2 then
    return;
  end if;

  return query
  with candidates as (
    select p.id, p.username, p.avatar_url
    from public.profiles p
    where lower(trim(p.username)) = v_query
      and p.id <> auth.uid()
      and not public.is_blocked_either_direction(auth.uid(), p.id)
    order by lower(p.username), p.id
    limit 10
  ),
  pending_by_candidate as (
    select
      c.id as candidate_user_id,
      fr.id as pending_request_id,
      fr.sender_user_id,
      fr.recipient_user_id
    from candidates c
    left join public.friend_requests fr
      on fr.pair_user_low_id = least(auth.uid(), c.id)
     and fr.pair_user_high_id = greatest(auth.uid(), c.id)
     and fr.status = 'pending'
  )
  select
    c.id as user_id,
    c.username,
    c.avatar_url,
    case
      when public.are_friends(auth.uid(), c.id) then 'friend'
      when pbc.pending_request_id is not null and pbc.sender_user_id = auth.uid() then 'outgoing_pending'
      when pbc.pending_request_id is not null and pbc.recipient_user_id = auth.uid() then 'incoming_pending'
      else 'none'
    end as relationship_state,
    pbc.pending_request_id,
    public.count_mutual_communities_for_users(auth.uid(), c.id) as mutual_community_count,
    public.list_mutual_community_names_for_users(auth.uid(), c.id, 3) as mutual_community_names
  from candidates c
  left join pending_by_candidate pbc
    on pbc.candidate_user_id = c.id
  order by lower(c.username), c.id;
end;
$$;

revoke all on function public.search_users_for_friend_add(text) from public;
grant execute on function public.search_users_for_friend_add(text) to authenticated;

create or replace function public.send_friend_request(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(trim(coalesce(p_username, '')));
  v_sender_user_id uuid := auth.uid();
  v_target_user_id uuid;
  v_target_username text;
  v_match_count integer := 0;
  v_pair_low uuid;
  v_pair_high uuid;
  v_existing_pending public.friend_requests%rowtype;
  v_request_id uuid;
  v_sender_profile public.profiles%rowtype;
  v_deliver_in_app boolean := true;
  v_deliver_sound boolean := false;
  v_notification_event_id uuid;
begin
  if v_sender_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if char_length(v_query) < 2 then
    raise exception 'Username is required.';
  end if;

  select count(*)::integer
  into v_match_count
  from public.profiles p
  where lower(trim(p.username)) = v_query;

  if v_match_count = 0 then
    raise exception 'No user found with that username.';
  end if;

  if v_match_count > 1 then
    raise exception 'Multiple users matched that username. Case-insensitive username uniqueness must be enforced before using friend search.';
  end if;

  select p.id, p.username
  into v_target_user_id, v_target_username
  from public.profiles p
  where lower(trim(p.username)) = v_query
  limit 1;

  if v_target_user_id is null then
    raise exception 'No user found with that username.';
  end if;

  if v_target_user_id = v_sender_user_id then
    raise exception 'You cannot send a friend request to yourself.';
  end if;

  if public.is_blocked_either_direction(v_sender_user_id, v_target_user_id) then
    raise exception 'Friend requests are not available for this user.';
  end if;

  if public.are_friends(v_sender_user_id, v_target_user_id) then
    raise exception 'You are already friends with this user.';
  end if;

  v_pair_low := least(v_sender_user_id, v_target_user_id);
  v_pair_high := greatest(v_sender_user_id, v_target_user_id);

  select *
  into v_existing_pending
  from public.friend_requests fr
  where fr.pair_user_low_id = v_pair_low
    and fr.pair_user_high_id = v_pair_high
    and fr.status = 'pending'
  order by fr.created_at desc
  limit 1
  for update;

  if found then
    if v_existing_pending.sender_user_id = v_sender_user_id then
      raise exception 'Friend request already pending.';
    end if;
    raise exception 'This user already sent you a friend request.';
  end if;

  insert into public.friend_requests (
    sender_user_id,
    recipient_user_id,
    status
  )
  values (
    v_sender_user_id,
    v_target_user_id,
    'pending'
  )
  returning id into v_request_id;

  select *
  into v_sender_profile
  from public.profiles p
  where p.id = v_sender_user_id
  limit 1;

  select r.deliver_in_app, r.deliver_sound
  into v_deliver_in_app, v_deliver_sound
  from public.resolve_notification_delivery_for_user(v_target_user_id, 'friend_request_received') r
  limit 1;

  if coalesce(v_deliver_in_app, false) or coalesce(v_deliver_sound, false) then
    insert into public.notification_events (
      kind,
      source_kind,
      source_id,
      actor_user_id,
      payload
    )
    values (
      'friend_request_received',
      'friend_request',
      v_request_id,
      v_sender_user_id,
      jsonb_build_object(
        'friendRequestId', v_request_id,
        'senderUserId', v_sender_user_id,
        'senderUsername', coalesce(v_sender_profile.username, 'Unknown User'),
        'recipientUserId', v_target_user_id,
        'title', 'Friend request received',
        'message', coalesce(v_sender_profile.username, 'Someone') || ' sent you a friend request.'
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
      v_target_user_id,
      coalesce(v_deliver_in_app, true),
      coalesce(v_deliver_sound, false)
    );
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.send_friend_request(text) from public;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.accept_friend_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_request public.friend_requests%rowtype;
  v_pair_low uuid;
  v_pair_high uuid;
  v_other_user_id uuid;
  v_deliver_in_app boolean := true;
  v_deliver_sound boolean := false;
  v_notification_event_id uuid;
  v_recipient_profile public.profiles%rowtype;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'Friend request id is required.';
  end if;

  select *
  into v_request
  from public.friend_requests fr
  where fr.id = p_request_id
  for update;

  if not found then
    raise exception 'Friend request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Friend request is no longer pending.';
  end if;

  if v_request.recipient_user_id <> v_me then
    raise exception 'Only the recipient can accept this friend request.'
      using errcode = '42501';
  end if;

  if public.is_blocked_either_direction(v_request.sender_user_id, v_request.recipient_user_id) then
    raise exception 'Cannot accept a friend request for a blocked user.';
  end if;

  v_pair_low := least(v_request.sender_user_id, v_request.recipient_user_id);
  v_pair_high := greatest(v_request.sender_user_id, v_request.recipient_user_id);
  v_other_user_id := v_request.sender_user_id;

  insert into public.friendships (
    user_low_id,
    user_high_id,
    created_via_request_id
  )
  values (
    v_pair_low,
    v_pair_high,
    v_request.id
  )
  on conflict (user_low_id, user_high_id) do nothing;

  update public.friend_requests
  set
    status = 'accepted',
    responded_at = timezone('utc', now()),
    responded_by_user_id = v_me
  where id = v_request.id;

  update public.notification_recipients nr
  set
    seen_at = coalesce(nr.seen_at, timezone('utc', now())),
    read_at = coalesce(nr.read_at, timezone('utc', now()))
  from public.notification_events ne
  where nr.event_id = ne.id
    and nr.recipient_user_id = v_me
    and ne.source_kind = 'friend_request'
    and ne.source_id = v_request.id
    and ne.kind = 'friend_request_received'
    and nr.dismissed_at is null;

  select *
  into v_recipient_profile
  from public.profiles p
  where p.id = v_me
  limit 1;

  select r.deliver_in_app, r.deliver_sound
  into v_deliver_in_app, v_deliver_sound
  from public.resolve_notification_delivery_for_user(v_request.sender_user_id, 'friend_request_accepted') r
  limit 1;

  if coalesce(v_deliver_in_app, false) or coalesce(v_deliver_sound, false) then
    insert into public.notification_events (
      kind,
      source_kind,
      source_id,
      actor_user_id,
      payload
    )
    values (
      'friend_request_accepted',
      'friend_request',
      v_request.id,
      v_me,
      jsonb_build_object(
        'friendRequestId', v_request.id,
        'actorUserId', v_me,
        'actorUsername', coalesce(v_recipient_profile.username, 'Unknown User'),
        'title', 'Friend request accepted',
        'message', coalesce(v_recipient_profile.username, 'Someone') || ' accepted your friend request.'
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
      v_request.sender_user_id,
      coalesce(v_deliver_in_app, true),
      coalesce(v_deliver_sound, false)
    );
  end if;

  return v_other_user_id;
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;

create or replace function public.decline_friend_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_request public.friend_requests%rowtype;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select *
  into v_request
  from public.friend_requests fr
  where fr.id = p_request_id
  for update;

  if not found then
    raise exception 'Friend request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Friend request is no longer pending.';
  end if;

  if v_request.recipient_user_id <> v_me then
    raise exception 'Only the recipient can decline this friend request.'
      using errcode = '42501';
  end if;

  update public.friend_requests
  set
    status = 'declined',
    responded_at = timezone('utc', now()),
    responded_by_user_id = v_me
  where id = v_request.id;

  update public.notification_recipients nr
  set
    seen_at = coalesce(nr.seen_at, timezone('utc', now())),
    read_at = coalesce(nr.read_at, timezone('utc', now()))
  from public.notification_events ne
  where nr.event_id = ne.id
    and nr.recipient_user_id = v_me
    and ne.source_kind = 'friend_request'
    and ne.source_id = v_request.id
    and ne.kind = 'friend_request_received'
    and nr.dismissed_at is null;

  return true;
end;
$$;

revoke all on function public.decline_friend_request(uuid) from public;
grant execute on function public.decline_friend_request(uuid) to authenticated;

create or replace function public.cancel_friend_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_request public.friend_requests%rowtype;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select *
  into v_request
  from public.friend_requests fr
  where fr.id = p_request_id
  for update;

  if not found then
    raise exception 'Friend request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Friend request is no longer pending.';
  end if;

  if v_request.sender_user_id <> v_me then
    raise exception 'Only the sender can cancel this friend request.'
      using errcode = '42501';
  end if;

  update public.friend_requests
  set
    status = 'canceled',
    responded_at = timezone('utc', now()),
    responded_by_user_id = v_me
  where id = v_request.id;

  update public.notification_recipients nr
  set dismissed_at = coalesce(nr.dismissed_at, timezone('utc', now()))
  from public.notification_events ne
  where nr.event_id = ne.id
    and nr.recipient_user_id = v_request.recipient_user_id
    and ne.source_kind = 'friend_request'
    and ne.source_id = v_request.id
    and ne.kind = 'friend_request_received';

  return true;
end;
$$;

revoke all on function public.cancel_friend_request(uuid) from public;
grant execute on function public.cancel_friend_request(uuid) to authenticated;

create or replace function public.remove_friend(p_other_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Invalid friend target.';
  end if;

  delete from public.friendships f
  where f.user_low_id = least(v_me, p_other_user_id)
    and f.user_high_id = greatest(v_me, p_other_user_id);

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.remove_friend(uuid) from public;
grant execute on function public.remove_friend(uuid) to authenticated;

create or replace function public.block_user_social(p_target_user_id uuid)
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

  if p_target_user_id is null or p_target_user_id = v_me then
    raise exception 'Invalid block target.';
  end if;

  insert into public.user_blocks (
    blocker_user_id,
    blocked_user_id
  )
  values (
    v_me,
    p_target_user_id
  )
  on conflict (blocker_user_id, blocked_user_id) do nothing;

  delete from public.friendships f
  where f.user_low_id = least(v_me, p_target_user_id)
    and f.user_high_id = greatest(v_me, p_target_user_id);

  update public.friend_requests fr
  set
    status = 'canceled',
    responded_at = timezone('utc', now()),
    responded_by_user_id = coalesce(fr.responded_by_user_id, v_me)
  where fr.status = 'pending'
    and fr.pair_user_low_id = least(v_me, p_target_user_id)
    and fr.pair_user_high_id = greatest(v_me, p_target_user_id);

  update public.notification_recipients nr
  set dismissed_at = coalesce(nr.dismissed_at, timezone('utc', now()))
  from public.notification_events ne
  where nr.event_id = ne.id
    and ne.source_kind = 'friend_request'
    and ne.kind in ('friend_request_received', 'friend_request_accepted')
    and (
      (nr.recipient_user_id = v_me and ne.actor_user_id = p_target_user_id)
      or (nr.recipient_user_id = p_target_user_id and ne.actor_user_id = v_me)
    )
    and nr.dismissed_at is null;

  return true;
end;
$$;

revoke all on function public.block_user_social(uuid) from public;
grant execute on function public.block_user_social(uuid) to authenticated;

create or replace function public.unblock_user_social(p_target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = v_me then
    raise exception 'Invalid unblock target.';
  end if;

  delete from public.user_blocks ub
  where ub.blocker_user_id = v_me
    and ub.blocked_user_id = p_target_user_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.unblock_user_social(uuid) from public;
grant execute on function public.unblock_user_social(uuid) to authenticated;

-- Realtime publication for social graph changes affecting current user UI.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'friend_requests'
    ) then
      alter publication supabase_realtime add table public.friend_requests;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'friendships'
    ) then
      alter publication supabase_realtime add table public.friendships;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_blocks'
    ) then
      alter publication supabase_realtime add table public.user_blocks;
    end if;
  end if;
end $$;

