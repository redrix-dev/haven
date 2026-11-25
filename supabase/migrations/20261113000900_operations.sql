-- 9 of 9. Operations: flair, the profile card, deleting an account, and the
-- few tables the operator uses to run the app (feature flags, one-time
-- introductions, iOS updates).

-- ── Flair ───────────────────────────────────────────────────────────────────
-- A small label someone can show on their profile. Haven-wide when
-- community_id is null, otherwise that community's.
create table public.flairs (
  id uuid primary key default private.uuid_v7(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,48}$'),
  label text not null check (char_length(label) between 1 and 48),
  description text,
  color_token text not null default 'primary',
  background_token text not null default 'surface-card',
  icon_key text,
  community_id uuid references public.communities (id) on delete cascade,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_flairs (
  user_id uuid not null references public.profiles (id),
  flair_id uuid not null references public.flairs (id) on delete cascade,
  source text not null check (source in ('staff', 'community_join', 'onboarding')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, flair_id)
);

-- "Joining this community grants this flair."
create table public.flair_grant_rules (
  community_id uuid not null references public.communities (id) on delete cascade,
  flair_id uuid not null references public.flairs (id) on delete cascade,
  primary key (community_id, flair_id)
);

alter table public.profiles
  add column active_flair_id uuid references public.flairs (id) on delete set null;

alter table public.flairs enable row level security;
alter table public.user_flairs enable row level security;
alter table public.flair_grant_rules enable row level security;
create policy "anyone signed in" on public.flairs for select to authenticated using (true);
create policy "own flairs" on public.user_flairs
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.flairs, public.user_flairs to authenticated;

create function private.grant_flair(p_user_id uuid, p_flair_id uuid, p_source text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.user_flairs (user_id, flair_id, source) values (p_user_id, p_flair_id, p_source)
  on conflict do nothing;
$$;

create function private.grant_flairs_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.grant_flair(new.user_id, r.flair_id, 'community_join')
  from public.flair_grant_rules r where r.community_id = new.community_id;
  return null;
end;
$$;
create trigger community_members_grant_flairs after insert on public.community_members
  for each row execute function private.grant_flairs_on_join();

-- Show one of your flairs on your profile, or none (null).
create function public.set_active_flair(p_flair_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if p_flair_id is not null and not exists (
    select 1
    from public.user_flairs uf join public.flairs f on f.id = uf.flair_id
    where uf.user_id = v_me and uf.flair_id = p_flair_id
      and f.retired_at is null and (uf.expires_at is null or uf.expires_at > now())
  ) then
    perform private.fail('not_found', 'flair_not_found', 'You do not have that flair.');
  end if;
  update public.profiles p set active_flair_id = p_flair_id where p.id = v_me;
end;
$$;

-- ── The profile card ────────────────────────────────────────────────────────
-- Name and picture for anyone. Bio and flair only when the person's
-- details_visible_to lets this viewer in, and never across a block. The two
-- can_ fields are the database's answer to "may I message them" and "may I
-- ask them to be friends", so the app offers only what will work and never
-- works the rules out itself.
create type public.profile_card_record as (
  id uuid,
  username text,
  avatar_media_id uuid,
  is_staff boolean,
  deleted boolean,
  details_visible boolean,
  bio text,
  flair jsonb, -- {key, label, description, color_token, background_token, icon_key} or null
  mutual_community_names text[],
  is_friend boolean,
  can_message boolean,
  can_friend_request boolean
);

create function public.get_profile_card(p_user_id uuid)
returns public.profile_card_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_profile public.profiles;
  v_visible boolean;
  v_present boolean;
  v_dm_id uuid;
begin
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if v_profile.id is null then
    perform private.fail('not_found', 'user_not_found', 'That person could not be found.');
  end if;
  v_visible := v_profile.deleted_at is null and private.can_see_details(p_user_id, v_me);
  -- Someone else, and still here. A block is the rules' to refuse.
  v_present := p_user_id <> v_me and v_profile.deleted_at is null;
  select c.id into v_dm_id from public.channels c
  where c.direct_key = least(v_me, p_user_id)::text || ':' || greatest(v_me, p_user_id)::text;
  return row(
    v_profile.id, v_profile.username, v_profile.avatar_media_id, v_profile.is_staff,
    v_profile.deleted_at is not null, v_visible,
    case when v_visible then v_profile.bio end,
    case when v_visible then (
      select jsonb_build_object(
        'key', f.key, 'label', f.label, 'description', f.description,
        'color_token', f.color_token, 'background_token', f.background_token, 'icon_key', f.icon_key)
      from public.flairs f
      join public.user_flairs uf on uf.flair_id = f.id and uf.user_id = v_profile.id
      where f.id = v_profile.active_flair_id and f.retired_at is null
        and (uf.expires_at is null or uf.expires_at > now())
    ) end,
    (
      select coalesce(array_agg(c.name order by c.name), '{}')
      from public.community_members mine
      join public.community_members theirs
        on theirs.community_id = mine.community_id and theirs.user_id = p_user_id
      join public.communities c on c.id = mine.community_id
      where mine.user_id = v_me and p_user_id <> v_me
    ),
    private.are_friends(v_me, p_user_id),
    -- The same questions open_dm and sending ask.
    v_present and case
      when v_dm_id is not null then private.can_send_in_channel(v_dm_id, v_me)
      else private.can_message(p_user_id, v_me)
    end,
    -- The same questions send_friend_request asks; a request from them
    -- waiting means asking back accepts it.
    v_present and not private.are_friends(v_me, p_user_id) and (
      private.can_friend_request(p_user_id, v_me)
      or exists (select 1 from public.friend_requests r where r.sender_id = p_user_id and r.recipient_id = v_me)
    )
  )::public.profile_card_record;
end;
$$;

-- When a name or picture changes, tell everyone who could be showing it:
-- the person, people in their communities, friends, people with a request
-- waiting, and the other side of their conversations.
create function private.announce_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audience uuid[];
begin
  select array_agg(distinct who.id) into v_audience
  from (
    select new.id as id
    union all
    select other.user_id
    from public.community_members mine
    join public.community_members other on other.community_id = mine.community_id
    where mine.user_id = new.id
    union all
    select case when f.user_low_id = new.id then f.user_high_id else f.user_low_id end
    from public.friendships f where new.id in (f.user_low_id, f.user_high_id)
    union all
    select case when r.sender_id = new.id then r.recipient_id else r.sender_id end
    from public.friend_requests r where new.id in (r.sender_id, r.recipient_id)
    union all
    select other.user_id
    from public.channel_participants mine
    join public.channel_participants other on other.channel_id = mine.channel_id and other.user_id <> mine.user_id
    where mine.user_id = new.id
  ) who;
  perform private.broadcast(v_audience, 'profile.updated', to_jsonb(private.profile_record(new)));
  return null;
end;
$$;
create trigger profiles_announce after update on public.profiles
  for each row
  when (
    old.username is distinct from new.username
    or old.avatar_media_id is distinct from new.avatar_media_id
    or old.is_staff is distinct from new.is_staff
    or old.deleted_at is distinct from new.deleted_at
  )
  execute function private.announce_profile();

-- ── Deleting an account ─────────────────────────────────────────────────────
-- This one function is everything that happens when a person leaves Haven.
-- It runs whenever the login is deleted, by any route.
--   * Their words and files are deleted everywhere. Files held by a safety
--     case stay, with the case.
--   * A community they own goes to its highest-ranked, longest-standing other
--     member, or is deleted if they were alone in it.
--   * Their profile is blanked and kept as a tombstone, so reports, bans and
--     the other side of a conversation still have something to point at.
create function private.erase_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community record;
  v_heir uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    return;
  end if;

  -- Blank the profile first: the "this person is gone" event has to reach
  -- the people they shared communities with, while that can still be worked
  -- out. Apps drop a deleted person's messages when they hear it.
  perform private.release_media(f.id) from public.media f
  where f.owner_id = p_user_id and f.status <> 'released' and f.message_id is null;
  update public.profiles p
  set username = null, bio = null, avatar_media_id = null, active_flair_id = null, deleted_at = now()
  where p.id = p_user_id;

  for v_community in select c.id from public.communities c where c.owner_id = p_user_id loop
    select m.user_id into v_heir
    from public.community_members m
    where m.community_id = v_community.id and m.user_id <> p_user_id
    order by private.rank(m.community_id, m.user_id) desc, m.joined_at
    limit 1;
    if v_heir is null then
      delete from public.communities c where c.id = v_community.id;
    else
      update public.communities c set owner_id = v_heir where c.id = v_community.id;
      perform private.audit(v_community.id, p_user_id, 'ownership_transferred', v_heir, null,
                            jsonb_build_object('because', 'account_deleted'));
    end if;
  end loop;

  delete from public.messages m where m.author_id = p_user_id; -- releases their files
  delete from public.message_reactions r where r.user_id = p_user_id;
  delete from public.community_members m where m.user_id = p_user_id;
  delete from public.community_bans b where b.user_id = p_user_id;
  delete from public.invites i where i.created_by = p_user_id;
  delete from public.friend_requests r where p_user_id in (r.sender_id, r.recipient_id);
  delete from public.friendships f where p_user_id in (f.user_low_id, f.user_high_id);
  delete from public.friend_links l where l.owner_id = p_user_id;
  delete from private.friend_link_declines d where d.user_id = p_user_id;
  delete from public.blocks b where p_user_id in (b.blocker_id, b.blocked_id);
  delete from public.notifications n where n.recipient_id = p_user_id;
  delete from public.notifications n where n.actor_id = p_user_id;
  delete from public.notification_preferences n where n.user_id = p_user_id;
  delete from public.push_devices d where d.user_id = p_user_id;
  delete from public.channel_user_state s where s.user_id = p_user_id;
  delete from public.collapsed_categories c where c.user_id = p_user_id;
  delete from public.user_flairs uf where uf.user_id = p_user_id;
  delete from public.feature_flag_overrides o where o.user_id = p_user_id;
  delete from public.onboarding_progress o where o.user_id = p_user_id;
  delete from public.terms_acceptances t where t.user_id = p_user_id;
  delete from public.user_settings s where s.user_id = p_user_id;
  update public.platform_staff s set active = false where s.user_id = p_user_id;
  -- A conversation stays for the other person. If both are gone, so is it.
  delete from public.channels ch
  where ch.kind = 'dm'
    and exists (select 1 from public.channel_participants cp where cp.channel_id = ch.id and cp.user_id = p_user_id)
    and not exists (
      select 1 from public.channel_participants cp
      join public.profiles p on p.id = cp.user_id
      where cp.channel_id = ch.id and p.deleted_at is null
    );
end;
$$;

-- Delete my account. Refused while you own a community other people are in:
-- hand it over or delete it first, so that is a choice and not a side effect.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if exists (
    select 1 from public.communities c
    where c.owner_id = v_me
      and exists (select 1 from public.community_members m where m.community_id = c.id and m.user_id <> v_me)
  ) then
    perform private.fail('conflict', 'owns_communities',
      'You own a community with other members. Hand it to someone or delete it first.');
  end if;
  delete from auth.users u where u.id = v_me; -- fires private.erase_account
end;
$$;

-- ── Feature flags ───────────────────────────────────────────────────────────
-- Rows are managed by the operator in SQL.
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]{2,64}$'),
  description text not null,
  enabled_by_default boolean not null default false
);
create table public.feature_flag_overrides (
  user_id uuid not null references public.profiles (id),
  flag_key text not null references public.feature_flags (key) on delete cascade,
  enabled boolean not null,
  expires_at timestamptz,
  note text,
  primary key (user_id, flag_key)
);
alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;

create function private.flag_enabled(p_user_id uuid, p_flag_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select o.enabled from public.feature_flag_overrides o
     where o.user_id = p_user_id and o.flag_key = f.key and (o.expires_at is null or o.expires_at > now())),
    f.enabled_by_default)
  from public.feature_flags f where f.key = p_flag_key;
$$;

create function public.get_my_feature_flags()
returns table (key text, enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.key, private.flag_enabled(auth.uid(), f.key) from public.feature_flags f order by f.key;
$$;

-- ── One-time introductions ──────────────────────────────────────────────────
-- Something shown to a person once, such as "join the testers' community".
-- Finishing it can join them to a community and give them a flair.
create type public.onboarding_outcome as enum ('completed', 'skipped');

create table public.onboarding_campaigns (
  key text primary key check (key ~ '^[a-z0-9_]{2,64}$'),
  title text not null,
  description text,
  -- A required one cannot be skipped.
  required boolean not null default false,
  -- Shown only to people who have this flag on. Null shows it to everyone.
  flag_key text references public.feature_flags (key) on delete set null,
  community_id uuid references public.communities (id) on delete set null,
  flair_id uuid references public.flairs (id) on delete set null,
  -- Empty means every platform ('ios', 'android', 'desktop', 'web') or every
  -- way the app was installed.
  platforms text[] not null default '{}',
  distributions text[] not null default '{}',
  min_app_version text check (min_app_version ~ '^\d+(\.\d+){0,3}$'),
  max_app_version text check (max_app_version ~ '^\d+(\.\d+){0,3}$'),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0
);
create table public.onboarding_progress (
  user_id uuid not null references public.profiles (id),
  campaign_key text not null references public.onboarding_campaigns (key) on delete cascade,
  outcome public.onboarding_outcome not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, campaign_key)
);
alter table public.onboarding_campaigns enable row level security;
alter table public.onboarding_progress enable row level security;

-- "1.2" as {1,2,0,0}: always four numbers, so 1.2 and 1.2.0 compare equal.
create function private.version_parts(p_version text)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select array[coalesce(p[1], 0), coalesce(p[2], 0), coalesce(p[3], 0), coalesce(p[4], 0)]
  from (select string_to_array(p_version, '.')::integer[] as p) parts;
$$;

-- Only offered when it applies to this person and this build, and when it
-- can actually be finished: a campaign that joins a community is not shown
-- to someone banned from it.
create function private.onboarding_is_offered(
  p_campaign public.onboarding_campaigns,
  p_user_id uuid,
  p_platform text,
  p_distribution text,
  p_app_version text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_campaign.active
    and (p_campaign.starts_at is null or p_campaign.starts_at <= now())
    and (p_campaign.ends_at is null or p_campaign.ends_at > now())
    and (cardinality(p_campaign.platforms) = 0 or p_platform = any (p_campaign.platforms))
    and (cardinality(p_campaign.distributions) = 0 or p_distribution = any (p_campaign.distributions))
    and (p_campaign.min_app_version is null
         or (p_app_version ~ '^\d+(\.\d+){0,3}$'
             and private.version_parts(p_app_version) >= private.version_parts(p_campaign.min_app_version)))
    and (p_campaign.max_app_version is null
         or (p_app_version ~ '^\d+(\.\d+){0,3}$'
             and private.version_parts(p_app_version) <= private.version_parts(p_campaign.max_app_version)))
    and (p_campaign.flag_key is null or coalesce(private.flag_enabled(p_user_id, p_campaign.flag_key), false))
    and not exists (
      select 1 from public.onboarding_progress o
      where o.user_id = p_user_id and o.campaign_key = p_campaign.key)
    and not exists (
      select 1 from public.community_bans b
      where b.community_id = p_campaign.community_id and b.user_id = p_user_id);
$$;

create function public.list_my_onboarding(p_platform text, p_distribution text default null, p_app_version text default null)
returns setof public.onboarding_campaigns
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from public.onboarding_campaigns c
  where private.onboarding_is_offered(c, auth.uid(), p_platform, p_distribution, p_app_version)
  order by c.sort_order, c.key;
$$;

create function public.answer_onboarding(
  p_campaign_key text,
  p_outcome public.onboarding_outcome,
  p_platform text,
  p_distribution text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_campaign public.onboarding_campaigns;
begin
  select * into v_campaign from public.onboarding_campaigns c where c.key = p_campaign_key;
  if v_campaign.key is null
     or not private.onboarding_is_offered(v_campaign, v_me, p_platform, p_distribution, p_app_version) then
    perform private.fail('not_found', 'campaign_not_offered', 'That is not available.');
  end if;
  if p_outcome = 'skipped' and v_campaign.required then
    perform private.fail('invalid', 'campaign_required', 'This one cannot be skipped.');
  end if;
  insert into public.onboarding_progress (user_id, campaign_key, outcome) values (v_me, p_campaign_key, p_outcome);
  if p_outcome = 'completed' then
    if v_campaign.community_id is not null then
      insert into public.community_members (community_id, user_id) values (v_campaign.community_id, v_me)
      on conflict do nothing;
    end if;
    if v_campaign.flair_id is not null then
      perform private.grant_flair(v_me, v_campaign.flair_id, 'onboarding');
    end if;
  end if;
end;
$$;

-- ── The person's own account ────────────────────────────────────────────────
-- What only the person sees of their own profile: what they wrote about
-- themselves and the flair they chose. Who may see it is in user_settings,
-- with the other privacy rules. Everyone's view of them is `profile_record`.
create type public.my_profile_record as (
  bio text,
  active_flair_id uuid
);

-- A plain read: no row without a session.
create function public.get_my_profile()
returns setof public.my_profile_record
language sql
stable
security definer
set search_path = ''
as $$
  select row(p.bio, p.active_flair_id)::public.my_profile_record
  from public.profiles p where p.id = auth.uid();
$$;

-- Anything about a person's own account changed, by any path (their own
-- device, an introduction, a flair a community gave them, the operator): tell
-- each of their devices to load the account again. One event per statement,
-- not per row. A new part of the account adds its table here.
create function private.on_account_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    array(select distinct c.user_id from changed c), 'account.changed', '{}'::jsonb);
  return null;
end;
$$;
create trigger user_settings_changed after update on public.user_settings
  referencing new table as changed for each statement execute function private.on_account_changed();
create trigger terms_acceptances_added after insert on public.terms_acceptances
  referencing new table as changed for each statement execute function private.on_account_changed();
create trigger user_flairs_added after insert on public.user_flairs
  referencing new table as changed for each statement execute function private.on_account_changed();
create trigger user_flairs_changed after update on public.user_flairs
  referencing new table as changed for each statement execute function private.on_account_changed();
create trigger user_flairs_removed after delete on public.user_flairs
  referencing old table as changed for each statement execute function private.on_account_changed();
create trigger feature_flag_overrides_added after insert on public.feature_flag_overrides
  referencing new table as changed for each statement execute function private.on_account_changed();
create trigger feature_flag_overrides_changed after update on public.feature_flag_overrides
  referencing new table as changed for each statement execute function private.on_account_changed();
create trigger feature_flag_overrides_removed after delete on public.feature_flag_overrides
  referencing old table as changed for each statement execute function private.on_account_changed();
create trigger onboarding_progress_added after insert on public.onboarding_progress
  referencing new table as changed for each statement execute function private.on_account_changed();

-- The private part of a profile. Name and picture are `profile.updated`.
create function private.on_my_profile_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(array[new.id], 'account.changed', '{}'::jsonb);
  return null;
end;
$$;
create trigger profiles_account_changed after update on public.profiles
  for each row
  when (
    old.bio is distinct from new.bio
    or old.active_flair_id is distinct from new.active_flair_id
  )
  execute function private.on_my_profile_changed();

-- ── iOS over-the-air updates ────────────────────────────────────────────────
-- Read by the update-manifest function with the service role. No client
-- access.
create table public.ota_releases (
  id uuid primary key default private.uuid_v7(),
  channel text not null,
  runtime_version text not null,
  bundle_url text not null,
  manifest_url text,
  note text,
  git_sha text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Newest by time, not by id: the release tooling brings its own random id.
create index ota_releases_lookup on public.ota_releases (channel, runtime_version, created_at desc) where active;
alter table public.ota_releases enable row level security;

insert into storage.buckets (id, name, public) values ('ota-bundles', 'ota-bundles', true);

grant execute on function public.set_active_flair(uuid) to authenticated;
grant execute on function public.get_profile_card(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.get_my_feature_flags() to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.list_my_onboarding(text, text, text) to authenticated;
grant execute on function public.answer_onboarding(text, public.onboarding_outcome, text, text, text) to authenticated;
