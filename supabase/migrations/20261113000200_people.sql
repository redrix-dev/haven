-- 2 of 9. People: who someone is, what they agreed to, who is staff, and who
-- is currently restricted.

-- ── Profiles ────────────────────────────────────────────────────────────────
-- One row per person, for as long as anything refers to them. The id is the
-- Supabase Auth user id, but there is no foreign key to auth.users: when the
-- login is deleted the row stays as a blank tombstone (no name, no picture,
-- no bio), so a report, a ban record or the other side of a conversation
-- still has something to point at. That is why no table in this database
-- needs "on delete set null" for a person.
-- Who a privacy rule lets in. One scale for every rule (who sees my details,
-- who can message me, who can ask to be friends), and each step includes the
-- ones before it: `community` is friends and anyone who shares a community
-- with you. A block beats every rule. private.audience_allows (5_social)
-- is the only place that reads it.
create type public.audience as enum ('nobody', 'friends', 'community', 'everyone');

create table public.profiles (
  id uuid primary key,
  -- Letters, digits and underscore, so every name can be written as @name.
  username text check (username ~ '^[A-Za-z0-9_]{2,32}$'),
  avatar_media_id uuid, -- foreign key added in 3_media
  -- Shown to whoever user_settings.details_visible_to lets in, with the
  -- flair. Name and picture are always visible.
  bio text check (char_length(bio) <= 500),
  -- Kept in step with platform_staff by a trigger, so the staff badge needs no
  -- second lookup.
  is_staff boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_deleted_is_blank check (
    (deleted_at is null and username is not null)
    or (deleted_at is not null and username is null and avatar_media_id is null and bio is null)
  )
);
create unique index profiles_username_unique on public.profiles (lower(username));
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
alter table public.profiles enable row level security;
-- No policy and no grant: people are read through get_profiles and
-- get_profile_card, never by listing this table.

-- What the apps get for "a person". Same shape from every read and from the
-- realtime event.
create type public.profile_record as (
  id uuid,
  username text,
  avatar_media_id uuid,
  is_staff boolean,
  deleted boolean
);

create function private.profile_record(p public.profiles)
returns public.profile_record
language sql
immutable
set search_path = ''
as $$
  select row(p.id, p.username, p.avatar_media_id, p.is_staff, p.deleted_at is not null)::public.profile_record;
$$;

-- ── Private settings ────────────────────────────────────────────────────────
create table public.user_settings (
  user_id uuid primary key references public.profiles (id),
  theme text not null default 'default' check (char_length(theme) between 1 and 64),
  -- Privacy. The defaults are the closed ones: a person opens up by choice.
  -- Who sees the bio and flair.
  details_visible_to public.audience not null default 'friends',
  -- Who can start a direct conversation with them. One that exists stays
  -- open while either person's rule lets the other in, checked on every
  -- message (7_channels_messages, can_send_in_channel).
  dms_from public.audience not null default 'friends',
  -- Who can send a friend request. A friend link they handed out works
  -- whatever this says. `friends` would mean nothing here.
  friend_requests_from public.audience not null default 'nobody'
    check (friend_requests_from <> 'friends'),
  updated_at timestamptz not null default now()
);
create trigger user_settings_touch before update on public.user_settings
  for each row execute function private.touch_updated_at();
alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.user_settings to authenticated;

-- ── Terms ───────────────────────────────────────────────────────────────────
create table public.terms_versions (
  version text primary key,
  published_at timestamptz not null default now()
);
insert into public.terms_versions (version) values ('2026-03-24');
alter table public.terms_versions enable row level security;
create policy "anyone signed in" on public.terms_versions
  for select to authenticated using (true);
grant select on public.terms_versions to authenticated;

create table public.terms_acceptances (
  user_id uuid not null references public.profiles (id),
  version text not null references public.terms_versions (version),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table public.terms_acceptances enable row level security;
create policy "own acceptances" on public.terms_acceptances
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.terms_acceptances to authenticated;

-- ── Haven staff ─────────────────────────────────────────────────────────────
-- Separate from any community's moderators. Rows are added by the operator in
-- SQL; there is no RPC that makes someone staff.
create table public.platform_staff (
  user_id uuid primary key references public.profiles (id),
  active boolean not null default true,
  -- Opening media on a CSAM-flagged case needs this as well as being staff.
  can_review_csam boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger platform_staff_touch before update on public.platform_staff
  for each row execute function private.touch_updated_at();

create function private.is_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_staff s where s.user_id = p_user_id and s.active);
$$;
grant execute on function private.is_staff(uuid) to authenticated;

alter table public.platform_staff enable row level security;
create policy "staff see staff" on public.platform_staff
  for select to authenticated using (private.is_staff((select auth.uid())));
grant select on public.platform_staff to authenticated;

create function private.sync_profile_is_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles p
  set is_staff = private.is_staff(v_user_id)
  where p.id = v_user_id and p.is_staff is distinct from private.is_staff(v_user_id);
  return null;
end;
$$;
create trigger platform_staff_sync_profile after insert or update or delete on public.platform_staff
  for each row execute function private.sync_profile_is_staff();

-- ── Restrictions ────────────────────────────────────────────────────────────
-- A suspension (ends_at set) or a ban (ends_at null) by Haven staff. This row
-- is the restriction: sending is refused because of it (require_user below)
-- and sign-in is refused because of it (the access token hook). Lifting it is
-- setting lifted_at. Nothing is written into Supabase Auth's own tables.
create table public.account_restrictions (
  id uuid primary key default private.uuid_v7(),
  user_id uuid not null references public.profiles (id),
  ends_at timestamptz,
  case_id uuid, -- foreign keys added in 8_safety
  decision_id uuid,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id)
);
create index account_restrictions_user on public.account_restrictions (user_id) where lifted_at is null;
alter table public.account_restrictions enable row level security;
create policy "staff read restrictions" on public.account_restrictions
  for select to authenticated using (private.is_staff((select auth.uid())));
grant select on public.account_restrictions to authenticated;

create function private.is_restricted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_restrictions r
    where r.user_id = p_user_id
      and r.lifted_at is null
      and (r.ends_at is null or r.ends_at > now())
  );
$$;

-- ── The first line of every RPC ─────────────────────────────────────────────
-- Returns the caller's id, or refuses: not signed in, account deleted, or
-- restricted. One place, so no write path can forget one of the three.
create function private.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    perform private.fail('unauthenticated', 'not_signed_in', 'You need to sign in.');
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_me and p.deleted_at is null) then
    perform private.fail('unauthenticated', 'account_gone', 'This account no longer exists.');
  end if;
  if private.is_restricted(v_me) then
    perform private.fail('forbidden', 'account_restricted', 'This account is restricted.');
  end if;
  return v_me;
end;
$$;

-- Sign-in refusal. Configured as Supabase Auth's "custom access token" hook
-- (supabase/config.toml locally; the dashboard on a hosted project). Auth
-- calls it before issuing or refreshing a token. If the hook is not switched
-- on, require_user still stops every write.
create function public.auth_hook_access_token(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if private.is_restricted((event ->> 'user_id')::uuid) then
    return jsonb_build_object(
      'error',
      jsonb_build_object('http_code', 403, 'message', 'This account is restricted. Check your email for details.')
    );
  end if;
  return jsonb_build_object('claims', event -> 'claims');
end;
$$;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.is_restricted(uuid) to supabase_auth_admin;
grant execute on function public.auth_hook_access_token(jsonb) to supabase_auth_admin;

-- ── Sign-up ─────────────────────────────────────────────────────────────────
-- A new login gets its profile, its settings row and, when the sign-up form
-- sent a known terms version, its acceptance. The name asked for is used when
-- it is valid and free; otherwise the person gets a generated one and picks
-- again in the app (update_my_profile gives the exact reason).
create function private.on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wanted text := private.clean_text(new.raw_user_meta_data ->> 'username');
  v_terms text := private.clean_text(new.raw_user_meta_data ->> 'terms_version');
begin
  if v_wanted is null
     or v_wanted !~ '^[A-Za-z0-9_]{2,32}$'
     or exists (select 1 from public.profiles p where lower(p.username) = lower(v_wanted)) then
    v_wanted := 'user_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  insert into public.profiles (id, username) values (new.id, v_wanted);
  insert into public.user_settings (user_id) values (new.id);

  if v_terms is not null and exists (select 1 from public.terms_versions t where t.version = v_terms) then
    insert into public.terms_acceptances (user_id, version) values (new.id, v_terms);
  end if;
  return new;
end;
$$;
create trigger haven_user_created after insert on auth.users
  for each row execute function private.on_auth_user_created();

-- Deleting the login erases the person. private.erase_account is defined in
-- 9_operations, after every table it has to clean exists.
create function private.on_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.erase_account(old.id);
  return old;
end;
$$;
create trigger haven_user_deleted before delete on auth.users
  for each row execute function private.on_auth_user_deleted();

-- ── RPCs ────────────────────────────────────────────────────────────────────
-- Look people up by id. Ids are unguessable, so this cannot be used to list
-- everyone; you can only ask about people whose id you were already shown.
create function public.get_profiles(p_user_ids uuid[])
returns setof public.profile_record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if coalesce(cardinality(p_user_ids), 0) > 200 then
    perform private.fail('invalid', 'too_many_ids', 'Ask for at most 200 people at a time.');
  end if;
  return query
  select (private.profile_record(p)).*
  from public.profiles p
  where p.id = any (p_user_ids);
end;
$$;

-- Whether a name is in use, in any case, so the sign-up form can say so
-- before the trigger above swaps it for a generated one. The one thing a
-- visitor may call: sign-up has no session yet. It says only that the name is
-- used, never by whom; names are shown to everyone in the app anyway.
create function public.username_taken(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where lower(p.username) = lower(private.clean_text(p_username))
  );
$$;

create function public.update_my_profile(
  p_username text default null,
  p_bio text default null
)
returns public.profile_record
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_username text := private.clean_text(p_username);
  v_row public.profiles;
begin
  if v_username is not null then
    if v_username !~ '^[A-Za-z0-9_]{2,32}$' then
      perform private.fail('invalid', 'username_invalid', 'Names are 2 to 32 letters, digits or underscores.');
    end if;
    if exists (select 1 from public.profiles p where lower(p.username) = lower(v_username) and p.id <> v_me) then
      perform private.fail('conflict', 'username_taken', 'That name is taken.');
    end if;
  end if;
  if char_length(p_bio) > 500 then
    perform private.fail('invalid', 'bio_too_long', 'A bio is at most 500 characters.');
  end if;

  update public.profiles p
  set username = coalesce(v_username, p.username),
      -- An empty string clears the bio; null leaves it alone.
      bio = case when p_bio is null then p.bio else private.clean_text(p_bio) end
  where p.id = v_me
  returning * into v_row;
  return private.profile_record(v_row);
end;
$$;

-- Each argument left null keeps what is there, so a new setting is one more
-- argument and no caller changes.
create function public.update_my_settings(
  p_theme text default null,
  p_details_visible_to public.audience default null,
  p_dms_from public.audience default null,
  p_friend_requests_from public.audience default null
)
returns public.user_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
  v_row public.user_settings;
begin
  if p_theme is not null and char_length(p_theme) not between 1 and 64 then
    perform private.fail('invalid', 'theme_invalid', 'That is not a theme name.');
  end if;
  if p_friend_requests_from = 'friends' then
    perform private.fail('invalid', 'audience_invalid', 'Friend requests come from nobody, your communities or everyone.');
  end if;
  update public.user_settings s
  set theme = coalesce(p_theme, s.theme),
      details_visible_to = coalesce(p_details_visible_to, s.details_visible_to),
      dms_from = coalesce(p_dms_from, s.dms_from),
      friend_requests_from = coalesce(p_friend_requests_from, s.friend_requests_from)
  where s.user_id = v_me returning * into v_row;
  return v_row;
end;
$$;

create function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.require_user();
begin
  if not exists (select 1 from public.terms_versions t where t.version = p_version) then
    perform private.fail('invalid', 'unknown_terms_version', 'That version of the terms does not exist.');
  end if;
  insert into public.terms_acceptances (user_id, version) values (v_me, p_version)
  on conflict do nothing;
end;
$$;

grant execute on function public.get_profiles(uuid[]) to authenticated;
grant execute on function public.username_taken(text) to anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.update_my_settings(text, public.audience, public.audience, public.audience) to authenticated;
grant execute on function public.accept_terms(text) to authenticated;
